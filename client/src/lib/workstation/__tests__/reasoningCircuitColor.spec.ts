import { describe, expect, it } from "vitest";
import {
  workstationCircuitColor,
  workstationCircuitSwatch,
  workstationMicroDeckColorKey,
} from "../reasoningCircuitColor";

describe("workstation reasoning circuit colors", () => {
  it("keeps packet and deck color identity deterministic for shared keys", () => {
    const packetKey = "stage_play_processed_mail_packet:frog-001";
    expect(workstationCircuitColor(packetKey)).toEqual(workstationCircuitColor(packetKey));
    expect(workstationCircuitSwatch(packetKey)).toEqual({
      backgroundColor: workstationCircuitColor(packetKey).hsl,
      borderColor: workstationCircuitColor(packetKey).border,
    });
  });

  it("uses source, source kind, and deck id as the MicroDeck color key", () => {
    expect(workstationMicroDeckColorKey({
      sourceKind: "visual_frame",
      sourceId: "source:visual:active",
      deckId: "stage_play_micro_reasoner_prompt_preset:frog-classifier:v1",
    })).toBe(
      "microdeck:visual_frame:source:visual:active:stage_play_micro_reasoner_prompt_preset:frog-classifier:v1",
    );

    expect(workstationMicroDeckColorKey({
      sourceKind: "audio_transcript",
      sourceId: null,
      deckId: "stage_play_micro_reasoner_prompt_preset:earbud-translation:v1",
    })).toBe(
      "microdeck:audio_transcript:source-pending:stage_play_micro_reasoner_prompt_preset:earbud-translation:v1",
    );
  });
});
