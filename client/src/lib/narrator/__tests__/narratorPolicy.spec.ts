import { describe, expect, it } from "vitest";
import {
  DEFAULT_NARRATOR_SOURCE_POLICIES,
  decideNarratorDelivery,
} from "../narratorPolicy";
import {
  NARRATOR_EVENT_SCHEMA,
  type NarratorEventV1,
} from "@shared/contracts/narrator-event.v1";

const baseEvent: NarratorEventV1 = {
  schemaVersion: NARRATOR_EVENT_SCHEMA,
  eventId: "event:1",
  sourceKind: "image_lens",
  sourceId: "image-lens:1",
  text: "Image Lens summary ready.",
  authority: "live_observation",
  assistant_answer: false,
  terminal_eligible: false,
  evidenceRefs: ["image-lens:run:1"],
  rawContentIncluded: false,
  speakable: true,
  requestedDeliveryMode: "confirm_to_speak",
  defaultDeliveryMode: "visible_only",
  dedupeKey: "image-lens:1",
  createdAtMs: 1,
};

describe("narrator policy", () => {
  it("downgrades auto speak when voice is not armed", () => {
    const decision = decideNarratorDelivery({
      event: {
        ...baseEvent,
        sourceKind: "final_answer",
        authority: "terminal_answer",
        assistant_answer: true,
        terminal_eligible: true,
      },
      policy: DEFAULT_NARRATOR_SOURCE_POLICIES.final_answer,
      voiceArmed: false,
      nowMs: 10,
    });
    expect(decision.mode).toBe("confirm_to_speak");
    expect(decision.reasonCodes).toContain("voice_not_armed");
  });

  it("does not re-speak voice receipts", () => {
    const decision = decideNarratorDelivery({
      event: {
        ...baseEvent,
        sourceKind: "voice_receipt",
        authority: "voice_receipt",
      },
      policy: DEFAULT_NARRATOR_SOURCE_POLICIES.voice_receipt,
      voiceArmed: true,
      nowMs: 10,
    });
    expect(decision.mode).toBe("visible_only");
    expect(decision.speakable).toBe(false);
    expect(decision.reasonCodes).toContain("voice_receipts_do_not_respeak");
  });
});
