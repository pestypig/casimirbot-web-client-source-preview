import {
  HELIX_SITUATION_INTERJECTION_PROPOSAL_SCHEMA,
  HELIX_SITUATION_SALIENCE_RECEIPT_SCHEMA,
  type SituationEventSignal,
  type SituationGoalHypothesis,
  type SituationInterjectionProposal,
  type SituationSalienceReason,
  type SituationSalienceReceipt,
  type SituationStandbyMode,
} from "@shared/helix-situation-standby";

export type SituationSalienceDecisionStatus =
  | "emit"
  | "dedupe_cooldown"
  | "room_rate_limited"
  | "context_ineligible"
  | "mode_suppressed";

export type SituationSalienceMemory = {
  last_emit_by_dedupe_key: Record<string, number>;
  last_emit_by_room: Record<string, number>;
};

export type SituationSalienceDecision = {
  status: SituationSalienceDecisionStatus;
  receipt: SituationSalienceReceipt;
  proposal?: SituationInterjectionProposal | null;
};

const DEFAULT_COOLDOWN_MS = 45_000;
const ROOM_RATE_LIMIT_MS = 10_000;

const createId = (prefix: string): string => {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}:${Date.now()}:${random}`;
};

const signalText = (signals: SituationEventSignal[]): string =>
  signals.map((signal: SituationEventSignal) => signal.text ?? "").join(" ").toLowerCase();

const classifySignals = (
  signals: SituationEventSignal[],
  goals: SituationGoalHypothesis[],
): {
  reason: SituationSalienceReason;
  priority: SituationSalienceReceipt["priority"];
  summary: string;
  shouldRequestUserInput: boolean;
} => {
  const text = signalText(signals);
  if (/\b(helix|dottie|what now|watch this)\b/i.test(text)) {
    return { reason: "direct_address", priority: "action", summary: "Direct address detected in standby input.", shouldRequestUserInput: false };
  }
  if (/low health|damage|death|mob nearby|danger|source failed|permission denied/i.test(text)) {
    return {
      reason: text.includes("permission") ? "permission_needed" : "risk_detected",
      priority: text.includes("death") ? "critical" : "warn",
      summary: text.includes("permission") ? "A standby source needs permission or recovery." : "Risk signal detected in standby input.",
      shouldRequestUserInput: text.includes("permission"),
    };
  }
  if (goals.some((goal: SituationGoalHypothesis) => goal.status === "blocked")) {
    return { reason: "goal_blocked", priority: "warn", summary: "A tracked goal appears blocked.", shouldRequestUserInput: false };
  }
  if (/translation failed|wrong language|translate for/i.test(text)) {
    return { reason: "translation_mediation", priority: "action", summary: "Translation mediation may be useful.", shouldRequestUserInput: false };
  }
  if (goals.length > 0 && /acquired|completed|reached|unlocked/i.test(text)) {
    return { reason: "goal_progress", priority: "info", summary: "Goal progress detected.", shouldRequestUserInput: false };
  }
  return { reason: "context_ineligible", priority: "info", summary: "Standby signal did not meet the active salience threshold.", shouldRequestUserInput: false };
};

const isModeEligible = (
  mode: SituationStandbyMode,
  reason: SituationSalienceReason,
  priority: SituationSalienceReceipt["priority"],
): boolean => {
  if (mode === "off") return false;
  if (mode === "direct_address_only") return reason === "direct_address" || reason === "permission_needed";
  if (mode === "high_salience") return priority === "critical" || priority === "warn" || priority === "action";
  if (mode === "translation_mediator") return reason === "direct_address" || reason === "translation_mediation" || reason === "permission_needed";
  if (mode === "game_master") return reason !== "context_ineligible";
  return reason === "direct_address" || reason === "risk_detected" || reason === "goal_progress" || reason === "permission_needed";
};

export const evaluateSituationSalience = (input: {
  mode: SituationStandbyMode;
  room_id: string;
  graph_id?: string | null;
  signals: SituationEventSignal[];
  goals?: SituationGoalHypothesis[];
  memory?: SituationSalienceMemory;
  nowMs?: number;
  cooldownMs?: number;
}): SituationSalienceDecision => {
  const nowMs = input.nowMs ?? Date.now();
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const ts = new Date(safeNowMs).toISOString();
  const goals = input.goals ?? [];
  const classified = classifySignals(input.signals, goals);
  const firstSignal = input.signals[0];
  const signalIds = input.signals.map((signal: SituationEventSignal) => signal.signal_id);
  const dedupeKey = `${input.room_id}:${input.graph_id ?? "room"}:${classified.reason}:${firstSignal?.event_type ?? "signal"}`;
  const cooldownMs = input.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const memory = input.memory ?? { last_emit_by_dedupe_key: {}, last_emit_by_room: {} };
  let status: SituationSalienceDecisionStatus = "emit";
  if (!isModeEligible(input.mode, classified.reason, classified.priority)) status = "mode_suppressed";
  else if (classified.reason === "context_ineligible") status = "context_ineligible";
  else if ((memory.last_emit_by_dedupe_key[dedupeKey] ?? 0) + cooldownMs > safeNowMs) status = "dedupe_cooldown";
  else if ((memory.last_emit_by_room[input.room_id] ?? 0) + ROOM_RATE_LIMIT_MS > safeNowMs) status = "room_rate_limited";

  const receipt: SituationSalienceReceipt = {
    schema: HELIX_SITUATION_SALIENCE_RECEIPT_SCHEMA,
    receipt_id: createId("situation_salience"),
    room_id: input.room_id,
    graph_id: input.graph_id ?? null,
    signal_ids: signalIds,
    priority: classified.priority,
    reason: status === "dedupe_cooldown" ? "dedupe_cooldown" : status === "room_rate_limited" ? "rate_limited" : classified.reason,
    should_notify_helix: status === "emit",
    should_speak: status === "emit" && (classified.priority === "critical" || classified.reason === "direct_address"),
    should_request_user_input: status === "emit" && classified.shouldRequestUserInput,
    dedupe_key: dedupeKey,
    cooldown_ms: cooldownMs,
    summary: status === "emit" ? classified.summary : `Suppressed standby signal: ${status}.`,
    evidence_refs: input.signals.flatMap((signal: SituationEventSignal) => signal.evidence_refs).slice(0, 12),
    ts,
  };
  const proposal: SituationInterjectionProposal | null =
    status === "emit"
      ? {
          schema: HELIX_SITUATION_INTERJECTION_PROPOSAL_SCHEMA,
          proposal_id: createId("situation_interjection"),
          room_id: input.room_id,
          graph_id: input.graph_id ?? null,
          salience_receipt_id: receipt.receipt_id,
          mode: input.mode,
          text: receipt.summary,
          voice_output: receipt.should_speak ? "on_confirm" : "off",
          requires_confirmation: true,
          evidence_refs: receipt.evidence_refs,
          ts,
        }
      : null;
  return { status, receipt, proposal };
};
