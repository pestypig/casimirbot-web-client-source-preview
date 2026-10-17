import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  fetchMissionEvents,
  fetchMissionSnapshot,
  type ContextSessionState,
  type MissionBoardEvent,
  type MissionBoardSnapshot,
  type MissionContextTier,
  type MissionVoiceMode,
} from "@/lib/mission-overwatch";

export type MissionGuideBinding = {
  controller_available: boolean;
  mission_id: string | null;
  context: {
    tier: MissionContextTier;
    session_state: ContextSessionState;
    voice_mode: MissionVoiceMode;
    mute_while_typing: boolean;
  };
};

export type MissionGuideProjection = {
  state: "idle" | "loading" | "none" | "ready" | "stale" | "failed";
  mission_id: string | null;
  mission: null | {
    phase: MissionBoardSnapshot["phase"];
    status: MissionBoardSnapshot["status"];
    updated_at: string;
    freshness: "fresh" | "stale" | "unknown";
    last_verified_at: string | null;
    unresolved_critical: number;
  };
  objective: null | {
    title: string;
    status: "open" | "in_progress" | "blocked";
  };
  attention: null | {
    text: string;
    classification: MissionBoardEvent["classification"];
    certainty: NonNullable<MissionBoardEvent["certaintyClass"]>;
    fail_reason: string | null;
    suppression_reason: string | null;
  };
  evidence: {
    reference_count: number;
    trace_available: boolean;
    replay_available: boolean;
  };
  voice: MissionGuideBinding["context"];
  terminal: {
    terminal_eligible: false;
    result_available: false;
  };
  authority: {
    answer_authority: false;
    execution_authority: false;
    acknowledgment_authority: false;
    narration_authority: false;
    replay_authority: false;
  };
};

const EMPTY_BINDING: MissionGuideBinding = {
  controller_available: false,
  mission_id: null,
  context: {
    tier: "tier0",
    session_state: "idle",
    voice_mode: "off",
    mute_while_typing: true,
  },
};

const EMPTY_AUTHORITY = {
  answer_authority: false,
  execution_authority: false,
  acknowledgment_authority: false,
  narration_authority: false,
  replay_authority: false,
} as const;

export const EMPTY_MISSION_GUIDE_PROJECTION: MissionGuideProjection = {
  state: "idle",
  mission_id: null,
  mission: null,
  objective: null,
  attention: null,
  evidence: { reference_count: 0, trace_available: false, replay_available: false },
  voice: EMPTY_BINDING.context,
  terminal: { terminal_eligible: false, result_available: false },
  authority: EMPTY_AUTHORITY,
};

let currentBinding = EMPTY_BINDING;
let currentOwner: symbol | null = null;
const bindingListeners = new Set<() => void>();

const emitBinding = (): void => bindingListeners.forEach((listener) => listener());

export const readMissionGuideBinding = (): MissionGuideBinding => currentBinding;

export const recordMissionGuideBinding = (
  owner: symbol,
  binding: MissionGuideBinding,
): void => {
  currentOwner = owner;
  currentBinding = binding;
  emitBinding();
};

export const releaseMissionGuideBinding = (owner: symbol): void => {
  if (currentOwner !== owner) return;
  currentOwner = null;
  currentBinding = EMPTY_BINDING;
  emitBinding();
};

export const resetMissionGuideBindingForTest = (): void => {
  currentOwner = null;
  currentBinding = EMPTY_BINDING;
  emitBinding();
};

export const usePublishMissionGuideBinding = (input: {
  missionId: string;
  tier: MissionContextTier;
  sessionState: ContextSessionState;
  voiceMode: MissionVoiceMode;
  muteWhileTyping: boolean;
}): void => {
  const ownerRef = useRef(Symbol("helix-ask-mission-guide-binding"));
  useEffect(() => {
    const missionId = input.missionId.trim();
    recordMissionGuideBinding(ownerRef.current, {
      controller_available: Boolean(missionId),
      mission_id: missionId || null,
      context: {
        tier: input.tier,
        session_state: input.sessionState,
        voice_mode: input.voiceMode,
        mute_while_typing: input.muteWhileTyping,
      },
    });
  }, [input.missionId, input.muteWhileTyping, input.sessionState, input.tier, input.voiceMode]);
  useEffect(() => () => releaseMissionGuideBinding(ownerRef.current), []);
};

const subscribeBinding = (listener: () => void): (() => void) => {
  bindingListeners.add(listener);
  return () => bindingListeners.delete(listener);
};

const disabledSubscribe = (): (() => void) => () => undefined;

const useMissionGuideBinding = (enabled: boolean): MissionGuideBinding =>
  useSyncExternalStore(
    enabled ? subscribeBinding : disabledSubscribe,
    readMissionGuideBinding,
    () => EMPTY_BINDING,
  );

const boundedText = (value: string | null | undefined, max: number): string | null => {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (!normalized) return null;
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(1, max - 1))}…`;
};

const newestIso = (values: Array<string | null | undefined>): string | null => {
  let result: string | null = null;
  let resultMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > resultMs) {
      result = value;
      resultMs = parsed;
    }
  }
  return result;
};

const resolveFreshness = (
  events: MissionBoardEvent[],
  nowMs: number,
): "fresh" | "stale" | "unknown" => {
  const staleWindow = [...events]
    .filter((event) => event.timerKind === "stale_window")
    .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))[0];
  if (!staleWindow) return "unknown";
  if (staleWindow.timerStatus === "expired") return "stale";
  if (
    (staleWindow.timerStatus === "running" || staleWindow.timerStatus === "scheduled") &&
    staleWindow.timerDueTs
  ) {
    const dueMs = Date.parse(staleWindow.timerDueTs);
    if (Number.isFinite(dueMs)) return dueMs <= nowMs ? "stale" : "fresh";
  }
  return "unknown";
};

/**
 * Builds a metadata-only Guide view. Evidence identities, trace IDs, event IDs,
 * raw payloads, and every mutation callback stay in the governed mission
 * surfaces; the Guide receives counts and navigation eligibility only.
 */
export const buildMissionGuideProjection = (input: {
  binding: MissionGuideBinding;
  snapshot: MissionBoardSnapshot;
  events: MissionBoardEvent[];
  nowMs?: number;
}): MissionGuideProjection => {
  const missionId = input.binding.mission_id?.trim() || null;
  const events = input.events
    .filter((event) => event.missionId === missionId)
    .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts) || left.eventId.localeCompare(right.eventId));
  if (!missionId || input.snapshot.missionId !== missionId || events.length === 0) {
    return {
      ...EMPTY_MISSION_GUIDE_PROJECTION,
      state: "none",
      mission_id: missionId,
      voice: input.binding.context,
    };
  }

  const acknowledged = new Set<string>();
  for (const event of events) {
    if (!event.eventId.startsWith("ack:")) continue;
    if (event.derivedFromEventId) acknowledged.add(event.derivedFromEventId);
    for (const ref of event.evidenceRefs) acknowledged.add(ref);
  }

  const attentionEvent = [...events].reverse().find((event) =>
    !acknowledged.has(event.eventId) &&
    !event.eventId.startsWith("debrief:closure:") &&
    (event.classification === "critical" || event.classification === "action" || Boolean(event.failReason)),
  ) ?? null;
  const objective = [...(input.snapshot.objectives ?? [])]
    .filter((item) => item.status !== "resolved")
    .sort((left, right) => {
      const rank = { blocked: 0, in_progress: 1, open: 2 } as const;
      return rank[left.status] - rank[right.status] || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    })[0] ?? null;
  const evidenceRefs = new Set(events.flatMap((event) => event.evidenceRefs.filter(Boolean)));
  const traceAvailable = events.some((event) => Boolean(event.traceId));

  return {
    state: "ready",
    mission_id: missionId,
    mission: {
      phase: input.snapshot.phase,
      status: input.snapshot.status,
      updated_at: input.snapshot.updatedAt,
      freshness: resolveFreshness(events, input.nowMs ?? Date.now()),
      last_verified_at: newestIso(events.map((event) => event.lastVerifiedAt)),
      unresolved_critical: input.snapshot.unresolvedCritical,
    },
    objective: objective ? {
      title: boundedText(objective.title, 160) ?? "Objective unavailable",
      status: objective.status,
    } : null,
    attention: attentionEvent ? {
      text: boundedText(attentionEvent.text, 180) ?? "Attention required",
      classification: attentionEvent.classification,
      certainty: attentionEvent.certaintyClass ?? "unknown",
      fail_reason: boundedText(attentionEvent.failReason, 120),
      suppression_reason: boundedText(attentionEvent.suppressionReason, 120),
    } : null,
    evidence: {
      reference_count: evidenceRefs.size,
      trace_available: traceAvailable,
      replay_available: traceAvailable,
    },
    voice: input.binding.context,
    terminal: { terminal_eligible: false, result_available: false },
    authority: EMPTY_AUTHORITY,
  };
};

export const useCasimirGuideMissionProjection = (
  enabled: boolean,
): MissionGuideProjection => {
  const binding = useMissionGuideBinding(enabled);
  const [projection, setProjection] = useState<MissionGuideProjection>(EMPTY_MISSION_GUIDE_PROJECTION);
  const retainedRef = useRef<MissionGuideProjection | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const missionId = binding.controller_available ? binding.mission_id?.trim() : "";
    if (!missionId) {
      retainedRef.current = null;
      setProjection({
        ...EMPTY_MISSION_GUIDE_PROJECTION,
        state: "none",
        voice: binding.context,
      });
      return;
    }

    let active = true;
    setProjection({
      ...EMPTY_MISSION_GUIDE_PROJECTION,
      state: "loading",
      mission_id: missionId,
      voice: binding.context,
    });
    void Promise.all([
      fetchMissionSnapshot(missionId),
      fetchMissionEvents(missionId, { limit: 200, tail: true }),
    ]).then(([snapshot, eventPage]) => {
      if (!active) return;
      const next = buildMissionGuideProjection({ binding, snapshot, events: eventPage.events });
      retainedRef.current = next.state === "ready" ? next : null;
      setProjection(next);
    }).catch(() => {
      if (!active) return;
      const retained = retainedRef.current;
      if (retained?.mission_id === missionId && retained.state === "ready") {
        setProjection({ ...retained, state: "stale", voice: binding.context });
      } else {
        setProjection({
          ...EMPTY_MISSION_GUIDE_PROJECTION,
          state: "failed",
          mission_id: missionId,
          voice: binding.context,
        });
      }
    });
    return () => { active = false; };
  }, [binding, enabled]);

  return enabled ? projection : EMPTY_MISSION_GUIDE_PROJECTION;
};
