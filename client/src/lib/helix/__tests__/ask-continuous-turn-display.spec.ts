import { describe, expect, it } from "vitest";

import {
  buildHelixContinuousTurnStreamRows,
  buildLiveAnswerTurnBridgeState,
  readHelixContinuousTurnStreamDotClass,
  readHelixContinuousTurnStreamRowClass,
  readLiveAnswerTurnBridgeClassName,
  readLiveAnswerTurnBridgePillClassName,
} from "@/lib/helix/ask-continuous-turn-display";
import { resolveHelixAskFinalAnswerPresentation } from "@/lib/helix/ask-terminal-projection";

describe("ask-continuous-turn-display", () => {
  it("composes question, transcript, mail, Stage Play, bridge, and final rows in visible order", () => {
    const bridge = buildLiveAnswerTurnBridgeState({
      hasLiveState: true,
      finalAnswerPresentation: resolveHelixAskFinalAnswerPresentation("model answer"),
      stagePlayEvents: [
        {
          key: "checkpoint",
          kind: "checkpoint_request",
          title: "Checkpoint requested.",
          detail: "Review current live-state evidence.",
          meta: "checkpoint meta",
          evidenceRefs: ["checkpoint:1"],
          status: "queued",
        },
      ],
    });

    const rows = buildHelixContinuousTurnStreamRows({
      replyId: "reply-1",
      question: "What changed?",
      turnTranscriptRows: [
        {
          key: "trace-1",
          label: "Observation",
          text: "Read evidence.",
          meta: "runtime",
          status: "observed",
        },
        {
          key: "trace-final",
          label: "Final",
          text: "Filtered out.",
          meta: "runtime",
          status: "terminal",
        },
      ],
      mailLoopRows: [
        {
          rowId: "mail-1",
          rowKind: "mail_received",
          title: "Observation",
          body: "Preview: visual changed",
          evidenceRefs: ["mail:1"],
          authority: "tool_evidence",
          terminalEligible: false,
        },
      ],
      stagePlayEvents: [
        {
          key: "ledger-1",
          kind: "debug_receipt",
          title: "Stage Play receipt.",
          detail: "Receipt detail.",
          meta: "receipt meta",
          evidenceRefs: ["receipt:1"],
          status: "observed",
        },
      ],
      liveAnswerTurnBridge: bridge,
      finalAnswerText: "Final answer.",
      finalAnswerHeading: "Answer",
      finalAnswerSourceLabel: "model answer",
      terminalMismatch: false,
    });

    expect(rows.map((row) => row.source)).toEqual([
      "question",
      "agent_work",
      "live_source_mail",
      "stage_play",
      "live_bridge",
      "final",
    ]);
    expect(rows.map((row) => row.label)).toEqual([
      "Question",
      "Observation",
      "Observation mail",
      "Stage Play Receipt",
      "Live turn bridge",
      "Answer",
    ]);
    expect(rows[1]).toMatchObject({ tone: "observation", text: "Read evidence." });
    expect(rows[3]).toMatchObject({ detailLimit: 1200, tone: "observation" });
    expect(rows[4]).toMatchObject({ status: "checkpoint_queued", tone: "checkpoint" });
    expect(rows[5]).toMatchObject({ status: "terminal", tone: "final", detailLimit: 1600 });
    expect(readHelixContinuousTurnStreamRowClass("final")).toContain("border-violet");
    expect(readHelixContinuousTurnStreamDotClass("warning")).toContain("bg-rose");
  });

  it("maps lane lifecycle transcript rows to active stream tones", () => {
    const rows = buildHelixContinuousTurnStreamRows({
      replyId: "reply-lanes",
      question: null,
      turnTranscriptRows: [
        {
          key: "lane-visible",
          label: "Lane Visible",
          text: "Lane visible: live_translation.",
          meta: "visible does not mean executed",
          status: "completed",
        },
        {
          key: "lane-request",
          label: "Lane Request",
          text: "Lane requested: live_translation.translate_text.",
          meta: "runtime provider",
          status: "completed",
        },
        {
          key: "lane-backend",
          label: "Lane Backend",
          text: "Lane backend selected: live_translation.local_runtime.",
          meta: "helix policy",
          status: "completed",
        },
        {
          key: "lane-observation",
          label: "Lane Observation",
          text: "Lane observation ready.",
          meta: "observation-only",
          status: "completed",
        },
        {
          key: "lane-reentry",
          label: "Lane Re-entry",
          text: "Observation re-entered provider reasoning.",
          meta: "before terminal",
          status: "completed",
        },
        {
          key: "lane-terminal",
          label: "Terminal",
          text: "Terminal selected.",
          meta: "terminal authority",
          status: "completed",
        },
      ],
      mailLoopRows: [],
      stagePlayEvents: [],
      liveAnswerTurnBridge: null,
      finalAnswerText: "",
      finalAnswerHeading: "Final answer",
      finalAnswerSourceLabel: "active turn",
      terminalMismatch: false,
    });

    expect(rows.map((row) => [row.label, row.tone])).toEqual([
      ["Lane Visible", "working"],
      ["Lane Request", "checkpoint"],
      ["Lane Backend", "checkpoint"],
      ["Lane Observation", "observation"],
      ["Lane Re-entry", "observation"],
      ["Terminal", "final"],
    ]);
  });

  it("marks reviewed live answer snapshots as answer-bound and styles bridge pills", () => {
    const bridge = buildLiveAnswerTurnBridgeState({
      hasLiveState: true,
      finalAnswerPresentation: resolveHelixAskFinalAnswerPresentation("model_answer"),
      stagePlayEvents: [
        {
          key: "checkpoint",
          kind: "ask_checkpoint",
          title: "Helix Ask checkpoint completed.",
          detail: "Model-reviewed checkpoint available.",
          meta: "ask-turn-1 | model reviewed",
          evidenceRefs: ["visual_frame:1"],
          status: "model_reviewed",
        },
        {
          key: "snapshot",
          kind: "answer_snapshot",
          title: "Answer Snapshot, checkpoint only.",
          detail: "Reviewed output.",
          meta: "fresh | refs 1",
          evidenceRefs: ["answer_snapshot:1"],
          status: "fresh",
        },
      ],
    });

    expect(bridge).toMatchObject({
      title: "Answer snapshot ready",
      status: "answer_snapshot_ready",
      tone: "emerald",
      evidenceRefs: ["visual_frame:1", "answer_snapshot:1"],
    });
    expect(bridge?.pills.map((pill) => pill.label)).toEqual([
      "live evidence",
      "checkpoint reviewed",
      "snapshot reviewed",
      "voice snapshot-bound",
    ]);
    expect(readLiveAnswerTurnBridgeClassName("emerald")).toContain("border-emerald");
    expect(readLiveAnswerTurnBridgePillClassName("slate")).toContain("text-slate");
  });

  it("keeps deterministic receipt fallback as checkpoint bridge evidence, not reviewed answer authority", () => {
    const bridge = buildLiveAnswerTurnBridgeState({
      hasLiveState: true,
      stagePlayEvents: [],
      finalAnswerPresentation: resolveHelixAskFinalAnswerPresentation("deterministic receipt fallback"),
    });

    expect(bridge).toMatchObject({
      title: "Receipt fallback is evidence",
      status: "receipt_fallback",
      tone: "amber",
      meta: "refs 0 | not reviewed",
    });
    expect(bridge?.pills.map((pill) => pill.label)).toEqual([
      "live evidence",
      "checkpoint waiting",
      "snapshot pending",
      "voice waiting",
    ]);
  });
});
