
export type MissionObjectiveStatus = "open" | "in_progress" | "blocked" | "resolved";

export type MissionObjectiveView = {
  objectiveId: string;
  title: string;
  status: MissionObjectiveStatus;
  updatedAt: string;
};

export type MissionGapView = {
  gapId: string;
  objectiveId: string;
  summary: string;
  severity: "low" | "medium" | "high" | "critical";
  openedAt: string;
  resolvedAt?: string;
};

import { evaluateCalloutEligibility } from "../../../../shared/callout-eligibility";

export type MissionBoardSnapshot = {
  missionId: string;
  phase: "observe" | "plan" | "retrieve" | "gate" | "synthesize" | "verify" | "execute" | "debrief";
  status: "active" | "degraded" | "blocked" | "complete" | "aborted";
  updatedAt: string;
  unresolvedCritical: number;
  objectives?: MissionObjectiveView[];
  gaps?: MissionGapView[];
};

export type MissionBoardEvent = {
  eventId: string;
  missionId: string;
  type: "state_change" | "threat_update" | "timer_update" | "action_required" | "debrief";
  classification: "info" | "warn" | "critical" | "action";
  text: string;
  ts: string;
  evidenceRefs: string[];
  timerId?: string;
  timerKind?: "countdown" | "deadline" | "stale_window";
  timerStatus?: "scheduled" | "running" | "expired" | "cancelled" | "completed";
  timerDueTs?: string;
  derivedFromEventId?: string;
  objectiveId?: string;
  objectiveTitle?: string;
  objectiveStatus?: MissionObjectiveStatus;
  gapId?: string;
  gapSummary?: string;
  gapSeverity?: "low" | "medium" | "high" | "critical";
  gapResolvedAt?: string;
  certaintyClass?: "confirmed" | "reasoned" | "hypothesis" | "unknown";
  failReason?: string;
  suppressionReason?: string;
  lastVerifiedAt?: string;
  traceId?: string;
};

type MissionApiError = {
  error: string;
  message: string;
  details?: unknown;
};

const readJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json().catch(() => ({}))) as T & MissionApiError;
  if (!response.ok) {
    const message = (data as MissionApiError).message || response.statusText;
    throw new Error(message);
  }
  return data;
};

export async function fetchMissionSnapshot(missionId: string): Promise<MissionBoardSnapshot> {
  const response = await fetch(`/api/mission-board/${encodeURIComponent(missionId)}`);
  const data = await readJson<{ snapshot: MissionBoardSnapshot }>(response);
  return data.snapshot;
}

export async function fetchMissionEvents(
  missionId: string,
  options?: { cursor?: number; limit?: number; tail?: boolean },
): Promise<{ events: MissionBoardEvent[]; nextCursor: number | null }> {
  const params = new URLSearchParams();
  if (Number.isFinite(options?.cursor)) params.set("cursor", String(options?.cursor));
  if (Number.isFinite(options?.limit)) params.set("limit", String(options?.limit));
  if (options?.tail) params.set("tail", "1");
  const query = params.toString();
  const response = await fetch(
    `/api/mission-board/${encodeURIComponent(missionId)}/events${query ? `?${query}` : ""}`,
  );
  const data = await readJson<{
    events: MissionBoardEvent[];
    nextCursor: number | null;
  }>(response);
  return {
    events: data.events,
    nextCursor: data.nextCursor,
  };
}

export async function postMissionAction(missionId: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/mission-board/${encodeURIComponent(missionId)}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson<{
    receipt: { actionId: string; missionId: string; ts: string; status: string };
    snapshot: MissionBoardSnapshot;
  }>(response);
}

export async function postMissionAck(
  missionId: string,
  payload: { eventId: string; actorId?: string; note?: string },
) {
  const response = await fetch(`/api/mission-board/${encodeURIComponent(missionId)}/ack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson<{
    receipt: { missionId: string; eventId: string; actorId: string | null; ts: string };
    snapshot: MissionBoardSnapshot;
  }>(response);
}


export type MissionVoiceModeControls = {
  voiceEnabled: boolean;
  criticalOnly: boolean;
  muteWhileTyping: boolean;
};

export type MissionContextTier = "tier0" | "tier1";
export type MissionVoiceMode = "off" | "critical_only" | "normal" | "dnd";

export type MissionContextControls = {
  tier: MissionContextTier;
  voiceMode: MissionVoiceMode;
  muteWhileTyping: boolean;
};

export const DEFAULT_MISSION_CONTEXT_CONTROLS: MissionContextControls = {
  tier: "tier0",
  voiceMode: "normal",
  muteWhileTyping: true,
};

export const DEFAULT_MISSION_VOICE_MODE_CONTROLS: MissionVoiceModeControls = {
  voiceEnabled: true,
  criticalOnly: false,
  muteWhileTyping: true,
};

const MISSION_VOICE_MODE_KEY = "helix:mission-voice-mode:v1";
const MISSION_CONTEXT_CONTROLS_KEY = "helix:mission-context-controls:v1";

export function readMissionVoiceModeControls(): MissionVoiceModeControls {
  if (typeof window === "undefined") return { ...DEFAULT_MISSION_VOICE_MODE_CONTROLS };
  try {
    const raw = window.localStorage.getItem(MISSION_VOICE_MODE_KEY);
    if (!raw) return { ...DEFAULT_MISSION_VOICE_MODE_CONTROLS };
    const parsed = JSON.parse(raw) as Partial<MissionVoiceModeControls>;
    return {
      voiceEnabled:
        typeof parsed.voiceEnabled === "boolean"
          ? parsed.voiceEnabled
          : DEFAULT_MISSION_VOICE_MODE_CONTROLS.voiceEnabled,
      criticalOnly:
        typeof parsed.criticalOnly === "boolean"
          ? parsed.criticalOnly
          : DEFAULT_MISSION_VOICE_MODE_CONTROLS.criticalOnly,
      muteWhileTyping:
        typeof parsed.muteWhileTyping === "boolean"
          ? parsed.muteWhileTyping
          : DEFAULT_MISSION_VOICE_MODE_CONTROLS.muteWhileTyping,
    };
  } catch {
    return { ...DEFAULT_MISSION_VOICE_MODE_CONTROLS };
  }
}

export function writeMissionVoiceModeControls(next: MissionVoiceModeControls): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MISSION_VOICE_MODE_KEY, JSON.stringify(next));
}

export function shouldSpeakMissionEvent(options: {
  controls: MissionVoiceModeControls;
  classification: MissionBoardEvent["classification"];
  isUserTyping: boolean;
}): boolean {
  const { controls, classification, isUserTyping } = options;
  if (!controls.voiceEnabled) return false;
  if (controls.muteWhileTyping && isUserTyping) return false;
  if (controls.criticalOnly && classification !== "critical" && classification !== "action") return false;
  return true;
}

export function readMissionContextControls(): MissionContextControls {
  if (typeof window === "undefined") return { ...DEFAULT_MISSION_CONTEXT_CONTROLS };
  try {
    const raw = window.localStorage.getItem(MISSION_CONTEXT_CONTROLS_KEY);
    if (!raw) return { ...DEFAULT_MISSION_CONTEXT_CONTROLS };
    const parsed = JSON.parse(raw) as Partial<MissionContextControls>;
    const tier: MissionContextTier = parsed.tier === "tier1" ? "tier1" : "tier0";
    const voiceMode: MissionVoiceMode =
      parsed.voiceMode === "off" ||
      parsed.voiceMode === "critical_only" ||
      parsed.voiceMode === "normal" ||
      parsed.voiceMode === "dnd"
        ? parsed.voiceMode
        : DEFAULT_MISSION_CONTEXT_CONTROLS.voiceMode;
    return {
      tier,
      voiceMode,
      muteWhileTyping:
        typeof parsed.muteWhileTyping === "boolean"
          ? parsed.muteWhileTyping
          : DEFAULT_MISSION_CONTEXT_CONTROLS.muteWhileTyping,
    };
  } catch {
    return { ...DEFAULT_MISSION_CONTEXT_CONTROLS };
  }
}

export function writeMissionContextControls(next: MissionContextControls): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MISSION_CONTEXT_CONTROLS_KEY, JSON.stringify(next));
}

export function canStartContextSession(options: {
  tier: MissionContextTier;
  sessionState: "idle" | "requesting" | "active" | "stopping" | "error";
}): boolean {
  return options.tier === "tier1" && (options.sessionState === "idle" || options.sessionState === "error");
}

export function shouldEmitContextCallout(options: {
  controls: MissionContextControls;
  sessionState: "idle" | "requesting" | "active" | "stopping" | "error";
  classification: MissionBoardEvent["classification"];
  isUserTyping: boolean;
}): boolean {
  const decision = evaluateCalloutEligibility({
    contextTier: options.controls.tier,
    sessionState: options.sessionState,
    voiceMode: options.controls.voiceMode,
    classification: options.classification,
    isUserTyping: options.isUserTyping,
    muteWhileTyping: options.controls.muteWhileTyping,
  });
  return decision.emitVoice;
}


export type ContextSessionState = "idle" | "requesting" | "active" | "stopping" | "error";

export type ContextLifecycleEventType =
  | "context_session_requesting"
  | "context_session_started"
  | "context_session_stopped"
  | "context_session_error";

export type ContextLifecycleEvent = {
  eventType: ContextLifecycleEventType;
  tier: MissionContextTier;
  sessionState: ContextSessionState;
  ts: string;
  reason?: string;
};

export async function startDesktopTier1ScreenSession(
  emit: (event: ContextLifecycleEvent) => void,
): Promise<MediaStream | null> {
  emit({
    eventType: "context_session_requesting",
    tier: "tier1",
    sessionState: "requesting",
    ts: new Date().toISOString(),
    reason: "requesting",
  });
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    emit({
      eventType: "context_session_started",
      tier: "tier1",
      sessionState: "active",
      ts: new Date().toISOString(),
    });
    return stream;
  } catch (error) {
    emit({
      eventType: "context_session_error",
      tier: "tier1",
      sessionState: "error",
      ts: new Date().toISOString(),
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function stopDesktopTier1ScreenSession(
  stream: MediaStream | null | undefined,
  emit: (event: ContextLifecycleEvent) => void,
): void {
  emit({
    eventType: "context_session_stopped",
    tier: "tier1",
    sessionState: "stopping",
    ts: new Date().toISOString(),
  });
  for (const track of stream?.getTracks?.() ?? []) {
    track.stop();
  }
  emit({
    eventType: "context_session_stopped",
    tier: "tier1",
    sessionState: "idle",
    ts: new Date().toISOString(),
  });
}


export function isTimerCalloutEligible(event: MissionBoardEvent, nowTs = Date.now()): boolean {
  if (event.type !== "timer_update") return false;
  if (!event.timerDueTs || !event.timerStatus) return false;
  const dueMs = Date.parse(event.timerDueTs);
  if (!Number.isFinite(dueMs)) return false;
  return event.timerStatus === "running" && dueMs - nowTs <= 60_000;
}
