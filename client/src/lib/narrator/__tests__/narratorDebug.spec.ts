import { beforeEach, describe, expect, it } from "vitest";
import { useNarratorStore } from "@/store/useNarratorStore";
import { buildNarratorDebugSnapshot } from "../narratorDebug";

describe("narrator debug snapshot", () => {
  beforeEach(() => {
    useNarratorStore.getState().clearFeed();
    useNarratorStore.getState().resetPolicies();
  });

  it("summarizes narrator state without including raw event text", () => {
    useNarratorStore.getState().publishEvent({
      sourceKind: "workstation_panel",
      sourceId: "panel:narrator:debug_probe",
      text: "Sensitive narrator probe text.",
      authority: "panel_observation",
      assistant_answer: false,
      terminal_eligible: false,
      evidenceRefs: ["narrator:debug_probe"],
      traceId: "trace:narrator",
      rawContentIncluded: false,
      speakable: true,
      requestedDeliveryMode: "auto_speak",
      defaultDeliveryMode: "visible_only",
    }, { voiceArmed: true, nowMs: 10 });

    const snapshot = buildNarratorDebugSnapshot({ activeTurnId: "turn:narrator", nowMs: 20 });

    expect(snapshot).toMatchObject({
      schema: "helix.narrator_debug.v1",
      active_turn_id: "turn:narrator",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    expect(snapshot.auto_speak_candidate_event_ids).toHaveLength(1);
    expect(JSON.stringify(snapshot)).not.toContain("Sensitive narrator probe text.");
    expect(snapshot.recent_events).toEqual([
      expect.objectContaining({
        source_kind: "workstation_panel",
        text_hash: expect.stringMatching(/^fnv1a:/),
        text_length: "Sensitive narrator probe text.".length,
        raw_content_included: false,
      }),
    ]);
  });
});
