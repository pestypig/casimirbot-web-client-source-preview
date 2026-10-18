import { describe, expect, it } from "vitest";
import {
  NARRATOR_EVENT_SCHEMA,
  type NarratorEventV1,
} from "@shared/contracts/narrator-event.v1";
import {
  NARRATOR_AUNTIE_DOTTIE_VOICE_PROFILE_ID,
  NARRATOR_VOICE_PROVIDER,
  buildNarratorVoiceSpeakPayload,
} from "../narratorVoiceBridge";

const event: NarratorEventV1 = {
  schemaVersion: NARRATOR_EVENT_SCHEMA,
  eventId: "event:panel:1",
  sourceKind: "workstation_panel",
  sourceId: "panel:narrator",
  text: "Panel observation ready.",
  authority: "panel_observation",
  assistant_answer: false,
  terminal_eligible: false,
  evidenceRefs: ["panel:receipt:1"],
  traceId: "trace:1",
  turnKey: "turn:1",
  rawContentIncluded: false,
  speakable: true,
  requestedDeliveryMode: "confirm_to_speak",
  defaultDeliveryMode: "visible_only",
  dedupeKey: "panel:narrator:1",
  createdAtMs: 1,
};

describe("narrator voice bridge", () => {
  it("maps panel observations to panel narration chunks", () => {
    expect(buildNarratorVoiceSpeakPayload({ event })).toMatchObject({
      text: event.text,
      mode: "callout",
      chunkKind: "panel_narration",
      provider: NARRATOR_VOICE_PROVIDER,
      voiceProfile: NARRATOR_AUNTIE_DOTTIE_VOICE_PROFILE_ID,
      voice_profile_id: NARRATOR_AUNTIE_DOTTIE_VOICE_PROFILE_ID,
      traceId: "trace:1",
      turnKey: "turn:1",
      evidenceRefs: ["panel:receipt:1"],
      dedupe_key: "panel:narrator:1",
      repoAttributed: false,
      deterministic: true,
      textCertainty: "unknown",
      voiceCertainty: "unknown",
    });
  });

  it("maps final answers to final chunks", () => {
    expect(buildNarratorVoiceSpeakPayload({
      event: {
        ...event,
        sourceKind: "final_answer",
        authority: "terminal_answer",
        assistant_answer: true,
        terminal_eligible: true,
      },
    }).chunkKind).toBe("final");
  });

  it("allows callers to override the provider and voice profile", () => {
    expect(buildNarratorVoiceSpeakPayload({
      event,
      provider: "local-chatterbox",
      voiceProfileId: "dottie_default",
    })).toMatchObject({
      provider: "local-chatterbox",
      voiceProfile: "dottie_default",
      voice_profile_id: "dottie_default",
    });
  });
});
