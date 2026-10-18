import type { HelixContinuousTurnStreamRow } from "@/lib/helix/ask-active-turn-stream";
import {
  buildHelixAskConsoleCapabilityLaneSummary,
  resolveHelixAskConsoleCapabilityLaneRowStage,
  type HelixAskConsoleCapabilityLaneSummary,
} from "@/components/helix/ask-console/HelixAskConsoleDiagnostics";

export const HELIX_ASK_ACTIVE_TURN_QUIET_GAP_MS = 2000;
export const HELIX_ASK_ACTIVE_TURN_QUIET_GAP_TICK_MS = 1000;
export const HELIX_ASK_ACTIVE_TURN_QUIET_GAP_STATUS_TEXT =
  "Provider running; waiting for next transcript event.";

export type HelixAskActiveTurnDisplayViewModel = {
  visibleRows: HelixContinuousTurnStreamRow[];
  capabilityLaneSummary: HelixAskConsoleCapabilityLaneSummary;
  statusLine: string | null;
  quietGapVisible: boolean;
  msSinceLastTranscriptEvent: number | null;
  scrollToken: string;
};

export function buildHelixAskActiveTurnDisplayViewModel(input: {
  askBusy: boolean;
  rows: HelixContinuousTurnStreamRow[];
  replyId: string;
  lastTranscriptEventAppliedAtMs: number | null;
  nowMs: number;
  terminalPacketReceived?: boolean;
  quietGapThresholdMs?: number;
}): HelixAskActiveTurnDisplayViewModel {
  const quietGapThresholdMs = Math.max(0, Math.floor(
    input.quietGapThresholdMs ?? HELIX_ASK_ACTIVE_TURN_QUIET_GAP_MS,
  ));
  const msSinceLastTranscriptEvent =
    input.askBusy && typeof input.lastTranscriptEventAppliedAtMs === "number"
      ? Math.max(0, Math.floor(input.nowMs - input.lastTranscriptEventAppliedAtMs))
      : null;
  const quietGapVisible =
    input.askBusy &&
    input.terminalPacketReceived !== true &&
    input.rows.length > 0 &&
    msSinceLastTranscriptEvent !== null &&
    msSinceLastTranscriptEvent >= quietGapThresholdMs;
  const statusLine = quietGapVisible
    ? HELIX_ASK_ACTIVE_TURN_QUIET_GAP_STATUS_TEXT
    : null;
  const tail = input.rows.length ? input.rows[input.rows.length - 1] : null;
  const quietGapScrollState = quietGapVisible ? "quiet_gap" : "active";
  const scrollToken = tail
    ? `${input.rows.length}:${tail.key}:${tail.text}:${tail.status}:${quietGapScrollState}`
    : `${input.rows.length}:idle:${quietGapScrollState}`;
  const capabilityLaneSummary = buildHelixAskConsoleCapabilityLaneSummary(
    input.rows
      .map((row) => resolveHelixAskConsoleCapabilityLaneRowStage(row))
      .filter((stage): stage is NonNullable<typeof stage> => Boolean(stage))
      .map((stage) => ({ stage })),
  );
  return {
    visibleRows: input.rows,
    capabilityLaneSummary,
    statusLine,
    quietGapVisible,
    msSinceLastTranscriptEvent,
    scrollToken,
  };
}
