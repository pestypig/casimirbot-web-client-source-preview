import { describe, expect, it } from "vitest";

import {
  normalizeVoiceCommandLaneEnvelope,
  shouldIgnoreLowQualityTranscriptBargeIn,
} from "@/lib/helix/ask-voice-command-lane-policy";

describe("ask-voice-command-lane-policy", () => {
  it("ignores low-quality transcript barge-in only during active voice output/reasoning", () => {
    expect(
      shouldIgnoreLowQualityTranscriptBargeIn({
        lowAudioQuality: true,
        confidence: 0.71,
        speechProbability: 0.41,
        snrDb: 5,
        hasActiveVoiceReasoningAttempt: true,
        hasActiveVoicePlayback: false,
        needsConfirmation: false,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreLowQualityTranscriptBargeIn({
        lowAudioQuality: true,
        confidence: 0.7,
        speechProbability: null,
        snrDb: null,
        hasActiveVoiceReasoningAttempt: false,
        hasActiveVoicePlayback: true,
        needsConfirmation: false,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreLowQualityTranscriptBargeIn({
        lowAudioQuality: true,
        confidence: 0.94,
        speechProbability: null,
        snrDb: null,
        hasActiveVoiceReasoningAttempt: true,
        hasActiveVoicePlayback: true,
        needsConfirmation: false,
      }),
    ).toBe(false);
    expect(
      shouldIgnoreLowQualityTranscriptBargeIn({
        lowAudioQuality: false,
        confidence: 0.2,
        speechProbability: 0.1,
        snrDb: 0,
        hasActiveVoiceReasoningAttempt: true,
        hasActiveVoicePlayback: true,
        needsConfirmation: false,
      }),
    ).toBe(false);
  });

  it("does not ignore low-quality transcript barge-in when confirmation is required", () => {
    expect(
      shouldIgnoreLowQualityTranscriptBargeIn({
        lowAudioQuality: true,
        confidence: 0.5,
        speechProbability: 0.3,
        snrDb: 2,
        hasActiveVoiceReasoningAttempt: true,
        hasActiveVoicePlayback: true,
        needsConfirmation: true,
      }),
    ).toBe(false);
  });

  it("normalizes additive command-lane payloads without mutating dispatch state", () => {
    expect(
      normalizeVoiceCommandLaneEnvelope({
        version: "helix.voice.command_lane.v1",
        decision: "accepted",
        action: "send",
        confidence: 0.91,
        source: "parser",
        suppression_reason: null,
        strict_prefix_applied: true,
        confirm_required: true,
        utterance_id: "vcmd:test",
      }),
    ).toMatchObject({
      decision: "accepted",
      action: "send",
      source: "parser",
      confidence: 0.91,
      strict_prefix_applied: true,
      confirm_required: true,
      utterance_id: "vcmd:test",
    });
    expect(
      normalizeVoiceCommandLaneEnvelope({
        version: "helix.voice.command_lane.v1",
        decision: "none",
        action: null,
        confidence: null,
        source: "none",
        suppression_reason: "disabled",
        strict_prefix_applied: false,
        confirm_required: false,
        utterance_id: "vcmd:none",
      }),
    ).toMatchObject({
      decision: "none",
      suppression_reason: "disabled",
    });
  });

  it("rejects invalid command-lane decisions and creates a fallback utterance id", () => {
    expect(normalizeVoiceCommandLaneEnvelope(null)).toBeNull();
    expect(
      normalizeVoiceCommandLaneEnvelope({
        version: "helix.voice.command_lane.v1",
        decision: "bad",
        action: null,
        confidence: null,
        source: "none",
        suppression_reason: null,
        strict_prefix_applied: false,
        confirm_required: false,
        utterance_id: "bad",
      } as any),
    ).toBeNull();
    expect(
      normalizeVoiceCommandLaneEnvelope(
        {
          version: "",
          decision: "suppressed",
          action: "retry",
          confidence: 9,
          source: "unknown",
          suppression_reason: "audio_quality_low",
          strict_prefix_applied: false,
          confirm_required: false,
          utterance_id: "",
        } as any,
        { createUtteranceId: () => "vcmd:fallback" },
      ),
    ).toEqual({
      version: "helix.voice.command_lane.v1",
      decision: "suppressed",
      action: "retry",
      confidence: 1,
      source: "none",
      suppression_reason: "audio_quality_low",
      strict_prefix_applied: false,
      confirm_required: false,
      utterance_id: "vcmd:fallback",
    });
  });
});
