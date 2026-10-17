import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  LiveSituationArtifact,
  LiveSituationArtifactDelta,
  LiveSituationEvaluation,
} from "@shared/helix-live-situation-artifact";

export type LiveSituationArtifactReadResponse = {
  ok: boolean;
  schema?: "helix.live_situation_artifact_read.v1";
  artifact?: LiveSituationArtifact | null;
  deltas?: LiveSituationArtifactDelta[];
  latest_context_pack?: unknown | null;
  debug?: {
    thread_id?: string | null;
    artifact_id?: string | null;
    delta_count?: number;
    last_delta_id?: string | null;
    last_next_hash?: string | null;
    raw_transcript_included: false;
    raw_audio_included: false;
    deterministic_content_role: "observation_not_assistant_answer";
  } | null;
};

export type LiveSituationArtifactDiagnostics = {
  thread_id: string;
  last_fetch_status?: "idle" | "ok" | "error";
  last_fetch_error?: string | null;
  last_loaded_at?: string | null;
  stale: boolean;
};

export type LiveSituationArtifactState = {
  artifactByThread: Record<string, LiveSituationArtifact | null>;
  deltasByArtifact: Record<string, LiveSituationArtifactDelta[]>;
  diagnosticsByThread: Record<string, LiveSituationArtifactDiagnostics>;
  upsertReadResponse: (threadId: string, response: LiveSituationArtifactReadResponse) => void;
  loadLiveArtifact: (threadId: string, limit?: number) => Promise<void>;
};

const uniqueDeltas = (deltas: LiveSituationArtifactDelta[]): LiveSituationArtifactDelta[] => {
  const byId = new Map<string, LiveSituationArtifactDelta>();
  for (const delta of deltas) {
    byId.set(delta.delta_id, delta);
  }
  return Array.from(byId.values()).sort((a, b) => a.ts.localeCompare(b.ts)).slice(-80);
};

const staleFromLoadedAt = (loadedAt?: string | null): boolean => {
  if (!loadedAt) return true;
  const loadedMs = Date.parse(loadedAt);
  return !Number.isFinite(loadedMs) || Date.now() - loadedMs > 15_000;
};

export const selectActiveLiveSituationArtifact = (
  state: LiveSituationArtifactState,
  threadId: string,
): LiveSituationArtifact | null => state.artifactByThread[threadId] ?? null;

export const selectLiveSituationDeltas = (
  state: LiveSituationArtifactState,
  artifactId?: string | null,
): LiveSituationArtifactDelta[] => (artifactId ? state.deltasByArtifact[artifactId] ?? [] : []);

export const selectLatestLiveSituationEvaluation = (
  state: LiveSituationArtifactState,
  threadId: string,
): LiveSituationEvaluation | null => state.artifactByThread[threadId]?.latest_evaluation ?? null;

export const selectLiveSituationRiskLine = (
  state: LiveSituationArtifactState,
  threadId: string,
): string | null => state.artifactByThread[threadId]?.current_state_lines.risk ?? null;

export const useLiveSituationArtifactStore = create<LiveSituationArtifactState>()(
  persist(
    (set, get) => ({
      artifactByThread: {},
      deltasByArtifact: {},
      diagnosticsByThread: {},
      upsertReadResponse: (threadId: string, response: LiveSituationArtifactReadResponse) => {
        const now = new Date().toISOString();
        const artifact = response.artifact ?? null;
        set((state) => {
          const artifactId = artifact?.artifact_id ?? null;
          const existingDeltas = artifactId ? state.deltasByArtifact[artifactId] ?? [] : [];
          const nextDeltas = artifactId ? uniqueDeltas([...existingDeltas, ...(response.deltas ?? [])]) : [];
          return {
            artifactByThread: {
              ...state.artifactByThread,
              [threadId]: artifact,
            },
            deltasByArtifact: artifactId
              ? {
                  ...state.deltasByArtifact,
                  [artifactId]: nextDeltas,
                }
              : state.deltasByArtifact,
            diagnosticsByThread: {
              ...state.diagnosticsByThread,
              [threadId]: {
                thread_id: threadId,
                last_fetch_status: response.ok ? "ok" : "error",
                last_fetch_error: response.ok ? null : "read_failed",
                last_loaded_at: now,
                stale: false,
              },
            },
          };
        });
      },
      loadLiveArtifact: async (threadId: string, limit = 30) => {
        try {
          const response = await fetch(
            `/api/agi/situation/live-artifact?thread_id=${encodeURIComponent(threadId)}&limit=${encodeURIComponent(String(limit))}`,
          );
          if (!response.ok) {
            set((state) => ({
              diagnosticsByThread: {
                ...state.diagnosticsByThread,
                [threadId]: {
                  thread_id: threadId,
                  last_fetch_status: "error",
                  last_fetch_error: `http_${response.status}`,
                  last_loaded_at: state.diagnosticsByThread[threadId]?.last_loaded_at ?? null,
                  stale: staleFromLoadedAt(state.diagnosticsByThread[threadId]?.last_loaded_at),
                },
              },
            }));
            return;
          }
          get().upsertReadResponse(threadId, (await response.json()) as LiveSituationArtifactReadResponse);
        } catch (error) {
          set((state) => ({
            diagnosticsByThread: {
              ...state.diagnosticsByThread,
              [threadId]: {
                thread_id: threadId,
                last_fetch_status: "error",
                last_fetch_error: error instanceof Error ? error.message : "fetch_failed",
                last_loaded_at: state.diagnosticsByThread[threadId]?.last_loaded_at ?? null,
                stale: staleFromLoadedAt(state.diagnosticsByThread[threadId]?.last_loaded_at),
              },
            },
          }));
        }
      },
    }),
    {
      name: "helix-live-situation-artifact-v1",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        artifactByThread: state.artifactByThread,
        deltasByArtifact: state.deltasByArtifact,
        diagnosticsByThread: state.diagnosticsByThread,
      }),
    },
  ),
);
