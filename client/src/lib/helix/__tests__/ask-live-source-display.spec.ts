import { describe, expect, it } from "vitest";

import {
  buildHelixMailLoopTurnStreamRows,
  collectHelixMailLoopTranscriptRows,
} from "@/lib/helix/ask-live-source-display";

describe("ask-live-source-display", () => {
  it("collects nested live-source transcript rows and de-duplicates repeated evidence rows", () => {
    const reply = {
      debug: {
        latest_result_artifact: {
          transcriptRows: [
            {
              rowId: "mail-1",
              rowKind: "mail_received",
              title: "Observation",
              body: "Preview: source changed",
              authority: "tool_evidence",
              evidenceRefs: ["mail:1", "mail:1"],
            },
          ],
          payload: {
            transcriptRows: [
              {
                rowId: "mail-1",
                rowKind: "mail_received",
                title: "Observation",
                body: "Preview: source changed",
                authority: "tool_evidence",
                evidenceRefs: ["mail:1"],
              },
              {
                rowId: "decision-1",
                rowKind: "agent_decision",
                body: "ask: checkpoint ready",
                authority: "route_decision",
                evidenceRefs: ["decision:1"],
              },
            ],
          },
        },
      },
    };

    const rows = collectHelixMailLoopTranscriptRows(reply);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowId: "mail-1",
      rowKind: "mail_received",
      body: "Preview: source changed",
      evidenceRefs: ["mail:1"],
    });
    expect(rows[1]).toMatchObject({
      rowId: "decision-1",
      rowKind: "agent_decision",
      body: "ask: checkpoint ready",
    });
  });

  it("projects mail-loop rows into continuous stream rows without React or runtime behavior", () => {
    const rows = buildHelixMailLoopTurnStreamRows("reply-1", [
      {
        rowId: "mail-1",
        rowKind: "mail_received",
        title: "Observation",
        body: "Preview: inspect this",
        evidenceRefs: ["mail:1"],
        authority: "tool_evidence",
        terminalEligible: false,
      },
      {
        rowId: "voice-1",
        rowKind: "voice_receipt",
        title: "",
        body: "",
        evidenceRefs: ["voice:1"],
        authority: "",
        terminalEligible: false,
      },
      {
        rowId: "goal-1",
        rowKind: "goal_context_snapshot",
        title: "Goal context",
        body: "",
        evidenceRefs: ["goal:1"],
        authority: "",
        terminalEligible: false,
      },
      {
        rowId: "answer-1",
        rowKind: "text_answer",
        title: "",
        body: "Final candidate",
        evidenceRefs: ["answer:1"],
        authority: "terminal_candidate",
        terminalEligible: true,
      },
    ]);

    expect(rows.map((row) => row.source)).toEqual([
      "live_source_mail",
      "voice",
      "live_answer",
      "live_source_mail",
    ]);
    expect(rows[0]).toMatchObject({
      label: "Observation mail",
      text: "inspect this",
      tone: "observation",
      detailLimit: 520,
    });
    expect(rows[1]).toMatchObject({
      label: "Voice receipt",
      text: "Voice delivery receipt recorded.",
      meta: "tool_evidence",
    });
    expect(rows[2]).toMatchObject({
      label: "Goal context",
      text: "Goal context snapshot recorded as non-terminal evidence.",
      tone: "observation",
    });
    expect(rows[3]).toMatchObject({
      label: "Text draft",
      text: "Final candidate",
      tone: "final",
    });
  });
});
