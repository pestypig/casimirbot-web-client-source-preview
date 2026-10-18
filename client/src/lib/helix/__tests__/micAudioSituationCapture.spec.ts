import { describe, expect, it } from "vitest";
import { DEFAULT_HELIX_DOT_MODE_POLICY } from "@shared/helix-dot-mode-policy";

describe("mic audio situation capture Dot metadata", () => {
  const load = async () => {
    (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = undefined;
    return import("@/lib/helix/mic-audio-situation-capture");
  };

  it("does not silently upgrade omitted Dot speaker authority to command allowed", async () => {
    const { buildMicAudioSituationTranscriptEvent } = await load();
    const event = buildMicAudioSituationTranscriptEvent({
      roomId: "room_1",
      threadId: "thread_1",
      captureSessionId: "capture_1",
      chunkIndex: 0,
      dotModePolicy: DEFAULT_HELIX_DOT_MODE_POLICY,
      result: {
        text: "Dot, what just happened?",
      },
    });

    expect(event?.meta?.dot_mode_decision).toMatchObject({
      creates_user_turn: false,
      requires_confirmation: false,
      speakable: false,
      voice_output_reason: "untrusted_speaker",
    });
    expect(event?.meta?.live_voice_observation).toMatchObject({
      speaker_role: "unknown",
      speaker_authority: "transcribe_only",
      assistant_answer: false,
      raw_audio_included: false,
      raw_transcript_included: false,
      context_policy: "compact_context_pack_only",
    });
  });

  it("preserves explicit owner command authority for local owner-bound mic sessions", async () => {
    const { buildMicAudioSituationTranscriptEvent } = await load();
    const event = buildMicAudioSituationTranscriptEvent({
      roomId: "room_1",
      threadId: "thread_1",
      captureSessionId: "capture_1",
      chunkIndex: 1,
      dotModePolicy: DEFAULT_HELIX_DOT_MODE_POLICY,
      speakerRole: "owner",
      speakerAuthority: "command_allowed",
      speakerId: "owner",
      result: {
        text: "Dot, what just happened?",
      },
    });

    expect(event?.meta?.dot_mode_decision).toMatchObject({
      creates_user_turn: true,
      requires_confirmation: false,
      speakable: true,
      voice_output_reason: "dot_direct_address",
    });
    expect(event?.meta?.live_voice_observation).toMatchObject({
      speaker_id: "owner",
      speaker_role: "owner",
      speaker_authority: "command_allowed",
    });
  });
});
