import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildSituationStateProjection, inferSituationGoalHypotheses } from "@/lib/helix/situation-standby-reducer";
import { evaluateSituationSalience, type SituationSalienceMemory } from "@/lib/helix/situation-salience-gate";
import type {
  SituationEventSignal,
  SituationGoalHypothesis,
  SituationInterjectionProposal,
  SituationSalienceReceipt,
  SituationStandbyMode,
  SituationStateProjection,
} from "@shared/helix-situation-standby";

const SITUATION_STANDBY_STORAGE_KEY = "situation-room-standby:v1";
const MAX_SIGNALS_PER_KEY = 100;
const MAX_RECEIPTS_PER_KEY = 40;

const standbyKey = (roomId: string, graphId?: string | null): string => `${roomId}:${graphId ?? "room"}`;

type SituationStandbyState = {
  mode_by_key: Record<string, SituationStandbyMode>;
  signals_by_key: Record<string, SituationEventSignal[]>;
  projection_by_key: Record<string, SituationStateProjection | undefined>;
  goals_by_key: Record<string, SituationGoalHypothesis[]>;
  salience_receipts_by_key: Record<string, SituationSalienceReceipt[]>;
  interjection_proposals_by_key: Record<string, SituationInterjectionProposal[]>;
  salience_memory_by_key: Record<string, SituationSalienceMemory>;
  setMode: (roomId: string, graphId: string | null | undefined, mode: SituationStandbyMode) => void;
  ingestSignal: (signal: SituationEventSignal) => {
    receipt: SituationSalienceReceipt;
    proposal?: SituationInterjectionProposal | null;
  };
  dismissProposal: (proposalId: string) => void;
  reset: () => void;
};

export const useSituationStandbyStore = create<SituationStandbyState>()(
  persist(
    (set, get) => ({
      mode_by_key: {},
      signals_by_key: {},
      projection_by_key: {},
      goals_by_key: {},
      salience_receipts_by_key: {},
      interjection_proposals_by_key: {},
      salience_memory_by_key: {},
      setMode: (roomId, graphId, mode) =>
        set((state) => ({
          mode_by_key: { ...state.mode_by_key, [standbyKey(roomId, graphId)]: mode },
        })),
      ingestSignal: (signal) => {
        const key = standbyKey(signal.room_id, signal.graph_id);
        const state = get();
        const signals = [...(state.signals_by_key[key] ?? []), signal].slice(-MAX_SIGNALS_PER_KEY);
        const projection = buildSituationStateProjection({
          room_id: signal.room_id,
          graph_id: signal.graph_id ?? null,
          signals,
          now: signal.ts,
        });
        const goals = inferSituationGoalHypotheses({
          room_id: signal.room_id,
          graph_id: signal.graph_id ?? null,
          signals,
          now: signal.ts,
        });
        const mode = state.mode_by_key[key] ?? "off";
        const decision = evaluateSituationSalience({
          mode,
          room_id: signal.room_id,
          graph_id: signal.graph_id ?? null,
          signals: [signal],
          goals,
          memory: state.salience_memory_by_key[key],
          nowMs: Date.parse(signal.ts),
        });
        const nextMemory: SituationSalienceMemory = {
          last_emit_by_dedupe_key: { ...(state.salience_memory_by_key[key]?.last_emit_by_dedupe_key ?? {}) },
          last_emit_by_room: { ...(state.salience_memory_by_key[key]?.last_emit_by_room ?? {}) },
        };
        if (decision.status === "emit") {
          const nowMs = Number.isFinite(Date.parse(signal.ts)) ? Date.parse(signal.ts) : Date.now();
          nextMemory.last_emit_by_dedupe_key[decision.receipt.dedupe_key] = nowMs;
          nextMemory.last_emit_by_room[signal.room_id] = nowMs;
        }
        const receipts = [...(state.salience_receipts_by_key[key] ?? []), decision.receipt].slice(-MAX_RECEIPTS_PER_KEY);
        const proposals = decision.proposal
          ? [...(state.interjection_proposals_by_key[key] ?? []), decision.proposal].slice(-MAX_RECEIPTS_PER_KEY)
          : state.interjection_proposals_by_key[key] ?? [];
        set((current: SituationStandbyState) => ({
          signals_by_key: { ...current.signals_by_key, [key]: signals },
          projection_by_key: { ...current.projection_by_key, [key]: projection },
          goals_by_key: { ...current.goals_by_key, [key]: goals },
          salience_receipts_by_key: { ...current.salience_receipts_by_key, [key]: receipts },
          interjection_proposals_by_key: { ...current.interjection_proposals_by_key, [key]: proposals },
          salience_memory_by_key: { ...current.salience_memory_by_key, [key]: nextMemory },
        }));
        return { receipt: decision.receipt, proposal: decision.proposal };
      },
      dismissProposal: (proposalId) =>
        set((state) => ({
          interjection_proposals_by_key: Object.fromEntries(
            Object.entries(state.interjection_proposals_by_key).map(([key, proposals]) => [
              key,
              proposals.filter((proposal) => proposal.proposal_id !== proposalId),
            ]),
          ),
        })),
      reset: () =>
        set({
          mode_by_key: {},
          signals_by_key: {},
          projection_by_key: {},
          goals_by_key: {},
          salience_receipts_by_key: {},
          interjection_proposals_by_key: {},
          salience_memory_by_key: {},
        }),
    }),
    {
      name: SITUATION_STANDBY_STORAGE_KEY,
      partialize: (state) => ({
        mode_by_key: state.mode_by_key,
        signals_by_key: state.signals_by_key,
        projection_by_key: state.projection_by_key,
        goals_by_key: state.goals_by_key,
        salience_receipts_by_key: state.salience_receipts_by_key,
        interjection_proposals_by_key: state.interjection_proposals_by_key,
        salience_memory_by_key: state.salience_memory_by_key,
      }),
    },
  ),
);

export const buildSituationStandbyKey = standbyKey;
