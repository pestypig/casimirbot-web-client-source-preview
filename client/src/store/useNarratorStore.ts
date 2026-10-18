import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import {
  NARRATOR_EVENT_SCHEMA,
  type NarratorEventV1,
  type NarratorSourceKind,
} from "@shared/contracts/narrator-event.v1";
import {
  DEFAULT_NARRATOR_SOURCE_POLICIES,
  decideNarratorDelivery,
  type NarratorSourcePolicy,
} from "@/lib/narrator/narratorPolicy";
import {
  buildNarratorDedupeKey,
  shouldDropNarratorDuplicate,
} from "@/lib/narrator/narratorDedupe";
import type { NarratorPlaybackDiagnostic } from "@/lib/narrator/narratorAudioPlayback";

export type NarratorDeliveryStatus = "visible" | "queued" | "suppressed" | "spoken" | "failed";

export type NarratorReadRegionRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type NarratorReadRegionPoint = {
  x: number;
  y: number;
};

export type NarratorReadRegionPhase = "hover_pending" | "voice_loading" | "speaking" | "tool_loading";

export type NarratorReadRegionState = {
  visible: boolean;
  eventId: string | null;
  sourceId: string | null;
  textPreview: string | null;
  phase: NarratorReadRegionPhase;
  rect: NarratorReadRegionRect | null;
  pointer: NarratorReadRegionPoint | null;
  startedAtMs: number;
  durationMs: number;
};

export type NarratorQueueState = {
  speaking: boolean;
  queuedEventIds: string[];
  suppressedEventIds: string[];
  lastSpokenByDedupeKey: Record<string, number>;
  lastSeenByDedupeKey: Record<string, number>;
  deliveryStatusByEventId: Record<string, NarratorDeliveryStatus>;
  playbackDiagnosticsByEventId: Record<string, NarratorPlaybackDiagnostic>;
};

export type PublishNarratorEventInput = Omit<
  NarratorEventV1,
  "schemaVersion" | "eventId" | "dedupeKey" | "createdAtMs"
> & {
  eventId?: string;
  dedupeKey?: string;
  createdAtMs?: number;
};

type NarratorState = {
  events: NarratorEventV1[];
  sourcePolicies: Record<NarratorSourceKind, NarratorSourcePolicy>;
  queueState: NarratorQueueState;
  readRegion: NarratorReadRegionState;
  publishEvent: (input: PublishNarratorEventInput, options?: { voiceArmed?: boolean; nowMs?: number }) => NarratorEventV1 | null;
  setSourcePolicy: (sourceKind: NarratorSourceKind, patch: Partial<NarratorSourcePolicy>) => void;
  setReadRegion: (patch: Partial<NarratorReadRegionState> & Pick<NarratorReadRegionState, "phase">) => void;
  clearReadRegion: (sourceId?: string | null) => void;
  markQueued: (eventId: string, diagnostic?: NarratorPlaybackDiagnostic) => void;
  markSpoken: (eventId: string, atMs?: number, diagnostic?: NarratorPlaybackDiagnostic) => void;
  markFailed: (eventId: string, diagnostic?: NarratorPlaybackDiagnostic) => void;
  recordPlaybackDiagnostic: (eventId: string, diagnostic: NarratorPlaybackDiagnostic) => void;
  clearFeed: () => void;
  resetPolicies: () => void;
};

const MAX_NARRATOR_EVENTS = 200;
const HOVER_FOCUS_DUPLICATE_WINDOW_MS = 250;

const memoryStorage = (): StateStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      values.set(name, value);
    },
    removeItem: (name) => {
      values.delete(name);
    },
  };
};

const narratorStorage = createJSONStorage(() =>
  typeof localStorage === "undefined" ? memoryStorage() : localStorage,
);

const uniqueNarratorRefs = (refs: Array<string | null | undefined>): string[] =>
  Array.from(new Set(refs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0)));

const emptyQueueState = (): NarratorQueueState => ({
  speaking: false,
  queuedEventIds: [],
  suppressedEventIds: [],
  lastSpokenByDedupeKey: {},
  lastSeenByDedupeKey: {},
  deliveryStatusByEventId: {},
  playbackDiagnosticsByEventId: {},
});

const emptyReadRegion = (): NarratorReadRegionState => ({
  visible: false,
  eventId: null,
  sourceId: null,
  textPreview: null,
  phase: "hover_pending",
  rect: null,
  pointer: null,
  startedAtMs: 0,
  durationMs: 0,
});

function createNarratorEvent(input: PublishNarratorEventInput): NarratorEventV1 {
  const nowMs = input.createdAtMs ?? Date.now();
  const eventId = input.eventId ?? `narrator:event:${nowMs}:${Math.random().toString(36).slice(2, 8)}`;
  const evidenceRefs = input.goalContextUpdateId
    ? uniqueNarratorRefs([...input.evidenceRefs, input.goalContextUpdateId])
    : input.evidenceRefs;
  const producedRefs = input.goalContextUpdateId
    ? uniqueNarratorRefs([...(input.producedRefs ?? []), eventId, input.goalContextUpdateId])
    : input.producedRefs;
  return {
    ...input,
    evidenceRefs,
    producedRefs,
    schemaVersion: NARRATOR_EVENT_SCHEMA,
    eventId,
    dedupeKey: input.dedupeKey ?? buildNarratorDedupeKey(input),
    createdAtMs: nowMs,
  };
}

function pushBounded(events: NarratorEventV1[], event: NarratorEventV1): NarratorEventV1[] {
  return [event, ...events].slice(0, MAX_NARRATOR_EVENTS);
}

export const useNarratorStore = create<NarratorState>()(
  persist(
    (set, get) => ({
      events: [],
      sourcePolicies: DEFAULT_NARRATOR_SOURCE_POLICIES,
      queueState: emptyQueueState(),
      readRegion: emptyReadRegion(),
      publishEvent: (input, options) => {
        const event = createNarratorEvent(input);
        const state = get();
        const nowMs = options?.nowMs ?? Date.now();
        if (shouldDropNarratorDuplicate({
          event,
          lastSeenByDedupeKey: state.queueState.lastSeenByDedupeKey,
          nowMs,
          windowMs: event.sourceKind === "hover_focus_inspector" ? HOVER_FOCUS_DUPLICATE_WINDOW_MS : undefined,
        })) {
          return null;
        }
        const policy = state.sourcePolicies[event.sourceKind] ?? DEFAULT_NARRATOR_SOURCE_POLICIES[event.sourceKind];
        const decision = decideNarratorDelivery({
          event,
          policy,
          voiceArmed: options?.voiceArmed,
          lastSpokenAtMs: state.queueState.lastSpokenByDedupeKey[event.dedupeKey],
          nowMs,
        });
        const status: NarratorDeliveryStatus = decision.suppressed ? "suppressed" : "visible";
        set((current) => ({
          events: decision.mode === "hidden" ? current.events : pushBounded(current.events, event),
          queueState: {
            ...current.queueState,
            suppressedEventIds: decision.suppressed
              ? [...current.queueState.suppressedEventIds, event.eventId]
              : current.queueState.suppressedEventIds,
            lastSeenByDedupeKey: {
              ...current.queueState.lastSeenByDedupeKey,
              [event.dedupeKey]: nowMs,
            },
            deliveryStatusByEventId: {
              ...current.queueState.deliveryStatusByEventId,
              [event.eventId]: status,
            },
          },
        }));
        return event;
      },
      setSourcePolicy: (sourceKind, patch) =>
        set((current) => ({
          sourcePolicies: {
            ...current.sourcePolicies,
            [sourceKind]: {
              ...current.sourcePolicies[sourceKind],
              ...patch,
            },
          },
        })),
      setReadRegion: (patch) =>
        set((current) => ({
          readRegion: {
            ...current.readRegion,
            ...patch,
            visible: patch.visible ?? true,
            startedAtMs: patch.startedAtMs ?? Date.now(),
            durationMs: Math.max(0, patch.durationMs ?? current.readRegion.durationMs ?? 0),
          },
        })),
      clearReadRegion: (sourceId) =>
        set((current) => {
          if (sourceId && current.readRegion.sourceId && current.readRegion.sourceId !== sourceId) return current;
          return { readRegion: emptyReadRegion() };
        }),
      markQueued: (eventId, diagnostic) =>
        set((current) => ({
          queueState: {
            ...current.queueState,
            queuedEventIds: current.queueState.queuedEventIds.includes(eventId)
              ? current.queueState.queuedEventIds
              : [...current.queueState.queuedEventIds, eventId],
            deliveryStatusByEventId: {
              ...current.queueState.deliveryStatusByEventId,
              [eventId]: "queued",
            },
            playbackDiagnosticsByEventId: diagnostic
              ? {
                  ...current.queueState.playbackDiagnosticsByEventId,
                  [eventId]: diagnostic,
                }
              : current.queueState.playbackDiagnosticsByEventId,
          },
          readRegion:
            current.readRegion.eventId === eventId || (!current.readRegion.eventId && current.readRegion.visible)
              ? {
                  ...current.readRegion,
                  eventId,
                  phase: "voice_loading",
                  startedAtMs: Date.now(),
                  durationMs: current.readRegion.durationMs || 900,
                }
              : current.readRegion,
        })),
      markSpoken: (eventId, atMs, diagnostic) =>
        set((current) => {
          const event = current.events.find((entry) => entry.eventId === eventId);
          return {
            queueState: {
              ...current.queueState,
              queuedEventIds: current.queueState.queuedEventIds.filter((id) => id !== eventId),
              lastSpokenByDedupeKey: event
                ? {
                    ...current.queueState.lastSpokenByDedupeKey,
                    [event.dedupeKey]: atMs ?? Date.now(),
                  }
                : current.queueState.lastSpokenByDedupeKey,
              deliveryStatusByEventId: {
                ...current.queueState.deliveryStatusByEventId,
                [eventId]: "spoken",
              },
              playbackDiagnosticsByEventId: diagnostic
                ? {
                    ...current.queueState.playbackDiagnosticsByEventId,
                    [eventId]: diagnostic,
                  }
                : current.queueState.playbackDiagnosticsByEventId,
            },
            readRegion:
              current.readRegion.eventId === eventId
                ? {
                    ...current.readRegion,
                    visible: false,
                  }
                : current.readRegion,
          };
        }),
      markFailed: (eventId, diagnostic) =>
        set((current) => ({
          queueState: {
            ...current.queueState,
            queuedEventIds: current.queueState.queuedEventIds.filter((id) => id !== eventId),
            deliveryStatusByEventId: {
              ...current.queueState.deliveryStatusByEventId,
              [eventId]: "failed",
            },
            playbackDiagnosticsByEventId: diagnostic
              ? {
                  ...current.queueState.playbackDiagnosticsByEventId,
                  [eventId]: diagnostic,
                }
              : current.queueState.playbackDiagnosticsByEventId,
          },
          readRegion:
            current.readRegion.eventId === eventId
              ? {
                  ...current.readRegion,
                  visible: false,
                }
              : current.readRegion,
        })),
      recordPlaybackDiagnostic: (eventId, diagnostic) =>
        set((current) => ({
          queueState: {
            ...current.queueState,
            playbackDiagnosticsByEventId: {
              ...current.queueState.playbackDiagnosticsByEventId,
              [eventId]: diagnostic,
            },
          },
        })),
      clearFeed: () => set((current) => ({
        events: [],
        queueState: { ...emptyQueueState(), lastSpokenByDedupeKey: current.queueState.lastSpokenByDedupeKey },
        readRegion: emptyReadRegion(),
      })),
      resetPolicies: () => set({ sourcePolicies: DEFAULT_NARRATOR_SOURCE_POLICIES }),
    }),
    {
      name: "helix-narrator-store",
      storage: narratorStorage,
      partialize: (state) => ({ sourcePolicies: state.sourcePolicies }),
    },
  ),
);
