import { describe, expect, it } from "vitest";
import {
  buildLiveVoiceSituationObservation,
  buildDotConfirmationCandidate,
  classifyDotModeUtterance,
  DEFAULT_HELIX_DOT_MODE_POLICY,
  promoteDotConfirmationCandidate,
} from "@shared/helix-dot-mode-policy";

const observedAt = "2026-05-18T10:00:00.000Z";

describe("Dot mode policy", () => {
  it("treats ambient chatter as journal-only live environment context", () => {
    const decision = classifyDotModeUtterance({
      text: "there is a dot on the minimap",
      observedAt,
      speakerAuthority: "command_allowed",
    });

    expect(decision).toMatchObject({
      kind: "ambient",
      wake_name: null,
      creates_user_turn: false,
      cancels_voice_output: false,
      disables_voice_capture: false,
      voice_output_reason: "ambient_context",
      speakable: false,
    });
  });

  it("creates a bounded user turn for authorized Dot direct address", () => {
    const decision = classifyDotModeUtterance({
      text: "Dot, what just happened?",
      observedAt,
      speakerAuthority: "command_allowed",
    });

    expect(decision).toMatchObject({
      kind: "direct_address",
      transcript_kind: "direct_address",
      wake_name: "dot",
      addressed_text: "what just happened?",
      creates_user_turn: true,
      requires_confirmation: false,
      voice_output_reason: "dot_direct_address",
      speakable: true,
      temporal_context_window: {
        anchor_observed_at: observedAt,
        include_observed_before_or_at: observedAt,
        exclude_post_anchor: true,
      },
    });
  });

  it("does not authorize untrusted direct address", () => {
    const decision = classifyDotModeUtterance({
      text: "Hey Dot, summarize this",
      observedAt,
      speakerAuthority: "transcribe_only",
    });

    expect(decision).toMatchObject({
      kind: "procedure_activation_request",
      creates_user_turn: false,
      requires_confirmation: false,
      voice_output_reason: "untrusted_speaker",
      speakable: false,
    });
  });

  it("makes Dot stop cancel output and return to observant without disabling capture", () => {
    const decision = classifyDotModeUtterance({
      text: "Dot stop",
      observedAt,
      speakerAuthority: "command_allowed",
    });

    expect(decision).toMatchObject({
      kind: "stop_output",
      transcript_kind: "command_candidate",
      requires_confirmation: false,
      cancels_active_answer: true,
      cancels_voice_output: true,
      disables_voice_capture: false,
      next_voice_mode: "observant",
      voice_output_reason: "dot_stop_command",
      speakable: false,
    });
  });

  it("separates Dot stop listening from Dot stop", () => {
    const decision = classifyDotModeUtterance({
      text: "Dot, stop listening",
      observedAt,
      speakerAuthority: "command_allowed",
    });

    expect(decision).toMatchObject({
      kind: "stop_listening",
      cancels_voice_output: true,
      disables_voice_capture: true,
      next_voice_mode: "off",
    });
  });

  it("builds voice observations as observation-not-answer compact context", () => {
    const observation = buildLiveVoiceSituationObservation({
      observationId: "obs_1",
      threadId: "thread_1",
      roomId: "room_1",
      sourceId: "source_mic",
      transcriptText: "Dot, what am I looking at?",
      speakerRole: "owner",
      speakerAuthority: "command_allowed",
      observedAt,
      evidenceRefs: ["voice:chunk:1"],
    });

    expect(observation).toMatchObject({
      schema: "helix.live_voice_situation_observation.v1",
      assistant_answer: false,
      raw_audio_included: false,
      raw_transcript_included: false,
      context_policy: "compact_context_pack_only",
      speaker_authority: "command_allowed",
      transcript_kind: "direct_address",
      interpreted_context: {
        salience: "milestone",
      },
    });
  });

  it("honors voice output disabled without losing the direct-address turn", () => {
    const decision = classifyDotModeUtterance({
      text: "Dot, what changed?",
      observedAt,
      speakerAuthority: "command_allowed",
      policy: {
        ...DEFAULT_HELIX_DOT_MODE_POLICY,
        voice_output_enabled: false,
      },
    });

    expect(decision.creates_user_turn).toBe(true);
    expect(decision.speakable).toBe(false);
    expect(decision.voice_output_reason).toBe("voice_output_disabled");
  });

  it("keeps command-confirm direct address as a confirmation candidate, not a user turn", () => {
    const decision = classifyDotModeUtterance({
      text: "Dot, what just happened?",
      observedAt,
      speakerAuthority: "command_confirm",
    });

    expect(decision).toMatchObject({
      kind: "direct_address",
      creates_user_turn: false,
      requires_confirmation: true,
      speakable: false,
      voice_output_reason: "silent_policy",
    });
    expect(decision.temporal_context_window).toBeUndefined();
  });

  it("defaults omitted speaker authority to transcribe-only and never speakable", () => {
    const decision = classifyDotModeUtterance({
      text: "Dot, what just happened?",
      observedAt,
    });

    expect(decision).toMatchObject({
      kind: "direct_address",
      creates_user_turn: false,
      requires_confirmation: false,
      speakable: false,
      voice_output_reason: "untrusted_speaker",
    });
  });

  it("does not let command-confirm stop output without confirmation", () => {
    const decision = classifyDotModeUtterance({
      text: "Dot stop",
      observedAt,
      speakerAuthority: "command_confirm",
    });

    expect(decision.creates_user_turn).toBe(false);
    expect(decision.requires_confirmation).toBe(true);
    expect(decision.cancels_active_answer).toBe(false);
    expect(decision.cancels_voice_output).toBe(false);
    expect(decision.disables_voice_capture).toBe(false);
    expect(decision.next_voice_mode).toBeNull();
  });

  it("creates a pending confirmation candidate for command-confirm stop output", () => {
    const decision = classifyDotModeUtterance({
      text: "Dot stop",
      observedAt,
      speakerAuthority: "command_confirm",
    });

    const candidate = buildDotConfirmationCandidate({
      originalDecisionId: "decision_stop",
      originalObservedAt: observedAt,
      originalText: "Dot stop",
      decision,
      speakerId: "guest_1",
      evidenceRefs: ["voice:chunk:stop"],
      now: observedAt,
    });

    expect(candidate).toMatchObject({
      status: "pending",
      speaker_authority: "command_confirm",
      requested_action: "stop_output",
    });
  });

  it("creates a pending confirmation candidate for command-confirm direct address", () => {
    const decision = classifyDotModeUtterance({
      text: "Dot, what just happened?",
      observedAt,
      speakerAuthority: "command_confirm",
    });
    const candidate = buildDotConfirmationCandidate({
      originalDecisionId: "decision_1",
      originalObservedAt: observedAt,
      originalText: "Dot, what just happened?",
      decision,
      speakerId: "guest_1",
      evidenceRefs: ["voice:chunk:10"],
      now: observedAt,
      ttlMs: 30_000,
    });

    expect(candidate).toMatchObject({
      schema: "helix.dot_confirmation_candidate.v1",
      original_decision_id: "decision_1",
      original_observed_at: observedAt,
      original_text: "Dot, what just happened?",
      addressed_text: "what just happened?",
      speaker_id: "guest_1",
      speaker_authority: "command_confirm",
      requested_action: "start_user_turn",
      status: "pending",
      evidence_refs: ["voice:chunk:10"],
      context_policy: "compact_context_pack_only",
    });
    expect(candidate?.expires_at).toBe("2026-05-18T10:00:30.000Z");
  });

  it("does not create a confirmation candidate for transcribe-only utterances", () => {
    const decision = classifyDotModeUtterance({
      text: "Dot, what just happened?",
      observedAt,
      speakerAuthority: "transcribe_only",
    });

    expect(buildDotConfirmationCandidate({
      originalDecisionId: "decision_ignored",
      originalObservedAt: observedAt,
      originalText: "Dot, what just happened?",
      decision,
    })).toBeNull();
  });

  it("promotes command-confirm with the original utterance timestamp as the answer anchor", () => {
    const decision = classifyDotModeUtterance({
      text: "Dot, what just happened?",
      observedAt,
      speakerAuthority: "command_confirm",
    });
    const candidate = buildDotConfirmationCandidate({
      originalDecisionId: "decision_2",
      originalObservedAt: observedAt,
      originalText: "Dot, what just happened?",
      decision,
    });
    expect(candidate).not.toBeNull();

    const promotion = promoteDotConfirmationCandidate({
      candidate: candidate!,
      confirmedAt: "2026-05-18T10:00:15.000Z",
      voiceOutputEnabled: true,
    });

    expect(promotion).toMatchObject({
      schema: "helix.dot_confirmation_promotion.v1",
      promoted_at: "2026-05-18T10:00:15.000Z",
      original_observed_at: observedAt,
      creates_user_turn: true,
      speakable: true,
      temporal_context_window: {
        anchor_observed_at: observedAt,
        include_observed_before_or_at: observedAt,
        exclude_post_anchor: true,
      },
      promoted_decision: {
        creates_user_turn: true,
        requires_confirmation: false,
        temporal_context_window: {
          anchor_observed_at: observedAt,
          include_observed_before_or_at: observedAt,
          exclude_post_anchor: true,
        },
      },
    });
  });

  it("does not promote rejected, expired, or confirmed candidates", () => {
    const decision = classifyDotModeUtterance({
      text: "Dot, what just happened?",
      observedAt,
      speakerAuthority: "command_confirm",
    });
    const candidate = buildDotConfirmationCandidate({
      originalDecisionId: "decision_3",
      originalObservedAt: observedAt,
      originalText: "Dot, what just happened?",
      decision,
    });
    expect(candidate).not.toBeNull();

    expect(promoteDotConfirmationCandidate({
      candidate: {
        ...candidate!,
        status: "expired",
      },
    })).toBeNull();
  });
});
