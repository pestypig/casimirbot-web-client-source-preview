import { describe, expect, it } from "vitest";

import {
  buildHelixAskVoiceAutoDispatchWindowProjection,
  buildHelixAskVoiceHeldPrefixMergeProjection,
  buildHelixAskVoiceHeldTranscriptRecoveryScoringProjection,
  buildHelixAskVoicePendingConfirmationMergeProjection,
  buildHelixAskVoicePendingConfirmationPolicyProjection,
  buildHelixAskVoiceTranscriptConfirmAutoPolicyProjection,
  buildHelixAskVoiceTranscriptConfirmationProjection,
  buildHelixAskVoiceTranscriptScoringProjection,
  buildHelixAskVoiceTurnDraftUpdate,
  buildHelixAskVoiceTurnRuntimeStateRefresh,
  buildHelixAskVoiceTurnSealUpdate,
  buildInitialHelixAskVoiceTurnAssemblerState,
  evaluateHelixAskVoiceHeldTranscriptRecovery,
  evaluateHelixAskVoiceHeldTranscriptWatchdog,
  evaluateHelixAskVoiceTurnSeal,
  resolveHelixAskVoiceAssemblerTurnKeyForIncomingSegment,
  updateHelixAskVoiceTurnAssemblerState,
  type HelixAskVoiceTurnAssemblerMap,
} from "@/components/helix/ask-console/HelixAskVoiceTurnAssemblyController";

describe("HelixAskVoiceTurnAssemblyController", () => {
  it("builds draft voice turn assembly state without playback authority", () => {
    const state = buildInitialHelixAskVoiceTurnAssemblerState("voice-turn-1", 1000);

    expect(state).toMatchObject({
      turnKey: "voice-turn-1",
      phase: "draft",
      transcriptRevision: 0,
      sealedRevision: 0,
      lastSpeechAtMs: 1000,
      sttQueueDepth: 0,
      sttInFlight: false,
      heldPending: false,
      dispatchState: "auto",
    });
    expect(state).not.toHaveProperty("allowMicOffPlayback");
    expect(state).not.toHaveProperty("voiceOutputArmed");
  });

  it("updates assembly state with monotonic event metadata and prunes old turns", () => {
    const map: HelixAskVoiceTurnAssemblerMap = {};

    const first = updateHelixAskVoiceTurnAssemblerState(
      map,
      "voice-turn-1",
      (current) => ({ ...current, draftTranscript: "first" }),
      { nowMs: 1000, maxEntries: 2 },
    );
    const second = updateHelixAskVoiceTurnAssemblerState(
      map,
      "voice-turn-1",
      (current) => ({ ...current, draftTranscript: "second" }),
      { nowMs: 1000, maxEntries: 2 },
    );
    updateHelixAskVoiceTurnAssemblerState(map, "voice-turn-2", (current) => current, {
      nowMs: 2000,
      maxEntries: 2,
    });
    updateHelixAskVoiceTurnAssemblerState(map, "voice-turn-3", (current) => current, {
      nowMs: 3000,
      maxEntries: 2,
    });

    expect(second.hlcMs).toBeGreaterThan(first.hlcMs);
    expect(second.eventSeq).toBe(first.eventSeq + 1);
    expect(Object.keys(map).sort()).toEqual(["voice-turn-2", "voice-turn-3"]);
  });

  it("advances draft transcripts while preserving STT queue, silence, and held-pending state", () => {
    const current = buildInitialHelixAskVoiceTurnAssemblerState("voice-turn-1", 1000);
    const next = buildHelixAskVoiceTurnDraftUpdate({
      current,
      transcript: "The navigation team is ready",
      recordedText: "The navigation team is ready",
      segmentId: "segment-1",
      sourceLanguage: "en",
      translated: false,
      sttEngine: "local-test-stt",
      confidence: 0.92,
      confidenceReason: "test_fixture",
      completion: { score: 0.8, route: "answer" },
      turnComplete: { score: 0.76, band: "high", reason: "lexical_closure_high" },
      nowMs: 2500,
      lastSpeechAtMs: 2300,
      sttQueueDepth: 2,
      sttInFlight: true,
      heldPending: true,
    });

    expect(next).toMatchObject({
      phase: "draft",
      transcriptRevision: 1,
      sealToken: null,
      sealedAtMs: null,
      draftTranscript: "The navigation team is ready",
      draftRecordedText: "The navigation team is ready",
      lastSpeechAtMs: 2300,
      sttQueueDepth: 2,
      sttInFlight: true,
      heldPending: true,
      sourceLanguage: "en",
      sttEngine: "local-test-stt",
      confidence: 0.92,
      segmentId: "segment-1",
    });
    expect(next.hashStableSinceMs).toBe(2500);
  });

  it("keeps the voice turn open during the dead-air silence window", () => {
    const state = {
      ...buildInitialHelixAskVoiceTurnAssemblerState("voice-turn-1", 1000),
      transcriptRevision: 1,
      draftTranscript: "Hold for the rest of the sentence",
      currentTranscriptHash: "hash-1",
      hashStableSinceMs: 1000,
    };

    expect(evaluateHelixAskVoiceTurnSeal({
      state,
      nowMs: 3000,
      lastSpeechAtMs: 2500,
      sttQueueDepth: 0,
      sttInFlight: false,
      heldPending: false,
    })).toMatchObject({
      gateOpen: false,
      canSeal: false,
      reason: "silence_window",
    });
  });

  it("blocks autosend while STT chunks are queued or in flight", () => {
    const state = {
      ...buildInitialHelixAskVoiceTurnAssemblerState("voice-turn-1", 1000),
      transcriptRevision: 1,
      draftTranscript: "The navigation team is ready.",
      currentTranscriptHash: "hash-1",
      hashStableSinceMs: 1000,
    };

    expect(evaluateHelixAskVoiceTurnSeal({
      state,
      nowMs: 6000,
      lastSpeechAtMs: 1000,
      sttQueueDepth: 1,
      sttInFlight: false,
      heldPending: false,
    })).toMatchObject({
      gateOpen: false,
      canSeal: false,
      reason: "stt_queue",
    });
    expect(evaluateHelixAskVoiceTurnSeal({
      state,
      nowMs: 6000,
      lastSpeechAtMs: 1000,
      sttQueueDepth: 0,
      sttInFlight: true,
      heldPending: false,
    })).toMatchObject({
      gateOpen: false,
      canSeal: false,
      reason: "stt_busy",
    });
  });

  it("projects ready-to-seal state and sealed assembler updates", () => {
    const state = {
      ...buildInitialHelixAskVoiceTurnAssemblerState("voice-turn-1", 1000),
      transcriptRevision: 2,
      draftTranscript: "The navigation team is ready.",
      currentTranscriptHash: "hash-1",
      hashStableSinceMs: 1000,
    };

    const evaluation = evaluateHelixAskVoiceTurnSeal({
      state,
      nowMs: 6000,
      lastSpeechAtMs: 1000,
      sttQueueDepth: 0,
      sttInFlight: false,
      heldPending: false,
    });
    const refreshed = buildHelixAskVoiceTurnRuntimeStateRefresh({
      current: state,
      sttQueueDepth: 0,
      sttInFlight: false,
      heldPending: false,
      lastSpeechAtMs: 1000,
    });
    const sealed = buildHelixAskVoiceTurnSealUpdate({
      current: refreshed,
      sealToken: "seal-token-1",
      nowMs: 6000,
      sttQueueDepth: 0,
      sttInFlight: false,
      heldPending: false,
    });

    expect(evaluation).toMatchObject({
      gateOpen: true,
      canSeal: true,
      reason: "ready",
    });
    expect(sealed).toMatchObject({
      phase: "sealed",
      sealedRevision: 2,
      sealToken: "seal-token-1",
      sealedAtMs: 6000,
      sttQueueDepth: 0,
      sttInFlight: false,
      heldPending: false,
    });
  });

  it("projects held-prefix transcript merge inside the breath window", () => {
    const projection = buildHelixAskVoiceHeldPrefixMergeProjection({
      heldTranscriptPrefix: "Translate the navigation callout",
      heldUpdatedAtMs: 1000,
      nextTranscript: "to Spanish.",
      nowMs: 3000,
      breathWindowMs: 2600,
      gameplayLoopMaxMs: 30_000,
    });

    expect(projection).toEqual({
      heldTranscriptPrefix: "Translate the navigation callout",
      heldAgeMs: 2000,
      canApplyHeldPrefix: true,
      mergedTranscript: "Translate the navigation callout to Spanish.",
      shouldClearHeldPrefix: false,
    });
  });

  it("projects stale held-prefix clearing for unrelated speech", () => {
    const projection = buildHelixAskVoiceHeldPrefixMergeProjection({
      heldTranscriptPrefix: "Translate the navigation callout",
      heldUpdatedAtMs: 0,
      nextTranscript: "Can you inspect the codebase voice route authority?",
      nowMs: 40_000,
      breathWindowMs: 2600,
      gameplayLoopMaxMs: 30_000,
    });

    expect(projection).toEqual({
      heldTranscriptPrefix: "Translate the navigation callout",
      heldAgeMs: 40_000,
      canApplyHeldPrefix: false,
      mergedTranscript: "Can you inspect the codebase voice route authority?",
      shouldClearHeldPrefix: true,
    });
  });

  it("projects empty held-prefix input without clearing state", () => {
    const projection = buildHelixAskVoiceHeldPrefixMergeProjection({
      heldTranscriptPrefix: "",
      heldUpdatedAtMs: null,
      nextTranscript: "Can you explain the Helix voice lane?",
      nowMs: 40_000,
      breathWindowMs: 2600,
      gameplayLoopMaxMs: 30_000,
    });

    expect(projection).toMatchObject({
      heldTranscriptPrefix: "",
      heldAgeMs: Number.POSITIVE_INFINITY,
      canApplyHeldPrefix: false,
      mergedTranscript: "Can you explain the Helix voice lane?",
      shouldClearHeldPrefix: false,
    });
  });

  it("projects voice auto-dispatch admission with a pruned rate window", () => {
    const projection = buildHelixAskVoiceAutoDispatchWindowProjection({
      transcript: "Can you explain the Helix voice lane?",
      micArmState: "on",
      confidence: 0.91,
      dispatchState: "auto",
      interpreterDispatchState: "auto",
      possibleTtsEcho: false,
      queueDepth: 0,
      currentWindow: [1000, 10_000, 59_000],
      nowMs: 61_000,
      windowMs: 60_000,
      maxQueueDepth: 4,
      maxAutoDispatchPerWindow: 3,
    });

    expect(projection.prunedWindow).toEqual([10_000, 59_000]);
    expect(projection.nextWindow).toEqual([10_000, 59_000, 61_000]);
    expect(projection.governance).toMatchObject({
      admitted: true,
      reason: "admitted_explicit_user_turn",
      activeDispatchCount: 2,
      assistant_answer: false,
      raw_content_included: false,
      output_authority: "admission_trace",
      instruction_authority: "none",
    });
  });

  it("projects voice auto-dispatch suppression without appending to the rate window", () => {
    const projection = buildHelixAskVoiceAutoDispatchWindowProjection({
      transcript: "Can you explain the Helix voice lane?",
      micArmState: "off",
      confidence: 0.91,
      dispatchState: "auto",
      interpreterDispatchState: "auto",
      possibleTtsEcho: false,
      queueDepth: 0,
      currentWindow: [1000, 59_000],
      nowMs: 61_000,
      windowMs: 60_000,
      maxQueueDepth: 4,
      maxAutoDispatchPerWindow: 3,
    });

    expect(projection.prunedWindow).toEqual([59_000]);
    expect(projection.nextWindow).toEqual([59_000]);
    expect(projection.governance).toMatchObject({
      admitted: false,
      reason: "mic_not_armed",
      activeDispatchCount: 1,
    });
  });

  it("keeps voice auto-dispatch queue and budget reasons auditable", () => {
    expect(buildHelixAskVoiceAutoDispatchWindowProjection({
      transcript: "Can you explain the Helix voice lane?",
      micArmState: "on",
      confidence: 0.91,
      dispatchState: "auto",
      interpreterDispatchState: "auto",
      possibleTtsEcho: false,
      queueDepth: 4,
      currentWindow: [],
      nowMs: 61_000,
      windowMs: 60_000,
      maxQueueDepth: 4,
      maxAutoDispatchPerWindow: 3,
    }).governance).toMatchObject({
      admitted: false,
      reason: "queue_backpressure",
    });
    expect(buildHelixAskVoiceAutoDispatchWindowProjection({
      transcript: "Can you explain the Helix voice lane?",
      micArmState: "on",
      confidence: 0.91,
      dispatchState: "auto",
      interpreterDispatchState: "auto",
      possibleTtsEcho: false,
      queueDepth: 0,
      currentWindow: [10_000, 20_000, 30_000],
      nowMs: 40_000,
      windowMs: 60_000,
      maxQueueDepth: 4,
      maxAutoDispatchPerWindow: 3,
    }).governance).toMatchObject({
      admitted: false,
      reason: "auto_dispatch_budget_exceeded",
    });
  });

  it("projects pending-confirmation follow-up transcript merges", () => {
    const projection = buildHelixAskVoicePendingConfirmationMergeProjection({
      pendingTranscript: "Translate the navigation callout",
      pendingSourceText: "Translate the navigation callout",
      pendingCreatedAtMs: 1000,
      nextTranscript: "to Spanish.",
      nextSourceText: "to Spanish.",
      nowMs: 2500,
      pauseMs: 1200,
      stability: 1,
    });

    expect(projection).toMatchObject({
      shouldMerge: true,
      pendingAgeMs: 1500,
      mergedTranscript: "Translate the navigation callout to Spanish.",
      mergedSourceText: "Translate the navigation callout to Spanish.",
      completion: {
        route: "answer",
      },
      turnComplete: {
        band: "high",
      },
    });
  });

  it("rejects stale unrelated pending-confirmation follow-up speech", () => {
    const projection = buildHelixAskVoicePendingConfirmationMergeProjection({
      pendingTranscript: "Translate the navigation callout",
      pendingSourceText: null,
      pendingCreatedAtMs: 1000,
      nextTranscript: "Can you inspect the codebase voice route authority?",
      nextSourceText: "Can you inspect the codebase voice route authority?",
      nowMs: 16000,
      pauseMs: 1200,
      stability: 1,
    });

    expect(projection).toMatchObject({
      shouldMerge: false,
      pendingAgeMs: 15000,
      mergedTranscript: "Translate the navigation callout",
      mergedSourceText: "Translate the navigation callout",
    });
  });

  it("starts a new assembler turn when no active turn exists", () => {
    expect(resolveHelixAskVoiceAssemblerTurnKeyForIncomingSegment({
      currentTurnKey: null,
      currentState: null,
      hasActiveAttemptForCurrentTurn: false,
      nextTurnKey: "voice:new",
    })).toEqual({
      turnKey: "voice:new",
      action: "start_new",
      reason: "no_active_turn",
    });
  });

  it("starts a new assembler turn when the current turn state is missing", () => {
    expect(resolveHelixAskVoiceAssemblerTurnKeyForIncomingSegment({
      currentTurnKey: "voice:missing",
      currentState: null,
      hasActiveAttemptForCurrentTurn: false,
      nextTurnKey: "voice:new",
    })).toEqual({
      turnKey: "voice:new",
      action: "start_new",
      reason: "missing_state",
    });
  });

  it("starts a new assembler turn after a sealed turn with no active attempt", () => {
    const state = {
      ...buildInitialHelixAskVoiceTurnAssemblerState("voice:sealed", 1000),
      phase: "sealed" as const,
    };

    expect(resolveHelixAskVoiceAssemblerTurnKeyForIncomingSegment({
      currentTurnKey: "voice:sealed",
      currentState: state,
      hasActiveAttemptForCurrentTurn: false,
      nextTurnKey: "voice:new",
    })).toEqual({
      turnKey: "voice:new",
      action: "start_new",
      reason: "sealed_without_active_attempt",
    });
  });

  it("reuses the current assembler turn while it remains open or actively reasoning", () => {
    const draft = buildInitialHelixAskVoiceTurnAssemblerState("voice:draft", 1000);
    const sealed = {
      ...buildInitialHelixAskVoiceTurnAssemblerState("voice:sealed", 1000),
      phase: "sealed" as const,
    };

    expect(resolveHelixAskVoiceAssemblerTurnKeyForIncomingSegment({
      currentTurnKey: "voice:draft",
      currentState: draft,
      hasActiveAttemptForCurrentTurn: false,
      nextTurnKey: "voice:new",
    })).toEqual({
      turnKey: "voice:draft",
      action: "reuse_current",
      reason: "current_turn_open",
    });
    expect(resolveHelixAskVoiceAssemblerTurnKeyForIncomingSegment({
      currentTurnKey: "voice:sealed",
      currentState: sealed,
      hasActiveAttemptForCurrentTurn: true,
      nextTurnKey: "voice:new",
    })).toEqual({
      turnKey: "voice:sealed",
      action: "reuse_current",
      reason: "current_turn_open",
    });
  });

  it("projects held transcript recovery after an empty STT result", () => {
    expect(evaluateHelixAskVoiceHeldTranscriptRecovery({
      heldTranscript: "The navigation team is ready.",
      nowMs: 6000,
      lastSpeechAtMs: 1000,
      transcribeQueueLength: 0,
      speechActive: false,
      pauseMs: 1200,
    })).toMatchObject({
      heldTranscript: "The navigation team is ready.",
      recover: true,
      turnComplete: {
        band: "high",
      },
    });
    expect(evaluateHelixAskVoiceHeldTranscriptRecovery({
      heldTranscript: "and",
      nowMs: 6000,
      lastSpeechAtMs: 1000,
      transcribeQueueLength: 0,
      speechActive: false,
      pauseMs: 1200,
    })).toMatchObject({
      heldTranscript: "and",
      recover: false,
    });
  });

  it("projects transcript completion and turn-complete scoring", () => {
    const scoring = buildHelixAskVoiceTranscriptScoringProjection({
      transcript: "The navigation team is ready for the next burn window.",
      pauseMs: 1200,
      stability: 1,
    });

    expect(scoring).toMatchObject({
      transcript: "The navigation team is ready for the next burn window.",
      completion: {
        route: "answer",
      },
      turnComplete: {
        band: "high",
        reason: "lexical_closure_high",
      },
    });
  });

  it("projects incomplete transcript scoring without playback authority", () => {
    const scoring = buildHelixAskVoiceTranscriptScoringProjection({
      transcript: "and then",
      pauseMs: 100,
      stability: 0.5,
    });

    expect(scoring.completion.route).toBe("ask_more");
    expect(scoring.turnComplete.band).toBe("low");
    expect(scoring).not.toHaveProperty("allowMicOffPlayback");
    expect(scoring).not.toHaveProperty("voiceOutputArmed");
  });

  it("projects held transcript recovery scoring with a confidence floor", () => {
    const scoring = buildHelixAskVoiceHeldTranscriptRecoveryScoringProjection({
      heldTranscript: "Go.",
      turnComplete: { score: 0.74, band: "high", reason: "lexical_closure_high" },
      minConfidence: 0.58,
      pauseMs: 1200,
      stability: 0.92,
    });

    expect(scoring).toMatchObject({
      heldTranscript: "Go.",
      confidence: 0.58,
      confidenceReason: "held_transcript_recovery",
      derivedConfidenceReason: "heuristic_text_quality",
      completion: {
        route: "answer",
      },
      turnComplete: {
        band: "high",
      },
    });
  });

  it("projects held transcript recovery scoring without lowering strong confidence", () => {
    const scoring = buildHelixAskVoiceHeldTranscriptRecoveryScoringProjection({
      heldTranscript: "The navigation team is ready for the next burn window.",
      turnComplete: { score: 0.82, band: "high", reason: "lexical_closure_high" },
      minConfidence: 0.58,
      pauseMs: 1200,
      stability: 0.92,
    });

    expect(scoring.confidence).toBeGreaterThan(0.58);
    expect(scoring).toMatchObject({
      confidenceReason: "held_transcript_recovery",
      completion: {
        route: "answer",
      },
      turnComplete: {
        score: 0.82,
        band: "high",
      },
    });
  });

  it("projects transcript confirmation auto-confirm eligibility without live activity", () => {
    const projection = buildHelixAskVoiceTranscriptConfirmationProjection({
      transcript: "The navigation team is ready for the next burn window.",
      providerConfidence: 0.91,
      translated: false,
      providerTranslationUncertain: false,
      translationConfirmThreshold: 0.68,
      sourceLanguage: "en",
      sourceText: "The navigation team is ready for the next burn window.",
      dispatchState: "confirm",
      providerNeedsConfirmation: false,
      confirmThreshold: 0.58,
      pivotConfidence: null,
      lowAudioQuality: false,
      speechActive: false,
      queuedSegmentCount: 0,
    });

    expect(projection).toMatchObject({
      confidence: 0.91,
      confidenceReason: "provider_reported",
      translationUncertain: false,
      highRiskTranslationContext: false,
      hardMultilangBlock: false,
      needsConfirmation: false,
      effectiveConfirmDispatchState: "confirm",
      confirmPolicy: {
        confirmAutoEligible: true,
        confirmBlockReason: null,
        reason: "eligible",
      },
      confirmPolicyWithoutLiveActivity: {
        confirmAutoEligible: true,
        confirmBlockReason: null,
        reason: "eligible",
      },
    });
  });

  it("projects high-risk translated confirmation blocks", () => {
    const projection = buildHelixAskVoiceTranscriptConfirmationProjection({
      transcript: "Necesitamos confirmar la dosis.",
      providerConfidence: 0.62,
      translated: true,
      providerTranslationUncertain: true,
      translationConfirmThreshold: 0.68,
      sourceLanguage: "es",
      sourceText: "Necesitamos confirmar la dosis.",
      dispatchState: "blocked",
      providerNeedsConfirmation: true,
      confirmThreshold: 0.58,
      pivotConfidence: 0.5,
      lowAudioQuality: false,
      speechActive: false,
      queuedSegmentCount: 0,
    });

    expect(projection).toMatchObject({
      confidence: 0.62,
      translationUncertain: true,
      highRiskTranslationContext: true,
      hardMultilangBlock: true,
      needsConfirmation: true,
      effectiveConfirmDispatchState: "blocked",
      confirmPolicy: {
        action: "blocked",
        confirmAutoEligible: false,
        confirmBlockReason: "dispatch_blocked",
      },
      confirmPolicyWithoutLiveActivity: {
        action: "blocked",
        confirmAutoEligible: false,
        confirmBlockReason: "dispatch_blocked",
      },
    });
  });

  it("projects pending confirmation policy without leaking confirmation authority to the pill", () => {
    const projection = buildHelixAskVoicePendingConfirmationPolicyProjection({
      transcript: "Necesitamos confirmar la dosis.",
      providerConfidence: 0.61,
      translated: true,
      previousTranslationUncertain: false,
      providerTranslationUncertain: true,
      translationConfirmThreshold: 0.68,
      sourceLanguage: "es",
      sourceText: "Necesitamos confirmar la dosis.",
      dispatchState: "confirm",
      pivotConfidence: 0.7,
      segmentLowAudioQuality: false,
      speechProbability: 0.88,
      snrDb: 18,
      lowQualitySpeechProbability: 0.45,
      lowQualitySnrDb: 8,
      speechActive: true,
      queuedSegmentCount: 1,
    });

    expect(projection).toMatchObject({
      confidence: 0.61,
      translationUncertain: true,
      lowAudioQuality: false,
      dispatchState: "confirm",
      pivotConfidence: 0.7,
      confirmPolicy: {
        confirmAutoEligible: false,
        confirmBlockReason: null,
      },
      confirmPolicyWithoutLiveActivity: {
        confirmAutoEligible: true,
        confirmBlockReason: null,
      },
    });
    expect(projection).not.toHaveProperty("assistant_answer");
    expect(projection).not.toHaveProperty("terminal_eligible");
  });

  it("projects transcript auto-confirm policy from confirmation state inputs", () => {
    const projection = buildHelixAskVoiceTranscriptConfirmAutoPolicyProjection({
      dispatchState: "confirm",
      confidence: 0.93,
      languageConfidence: 0.9,
      pivotConfidence: null,
      translationUncertain: false,
      sourceLanguage: "en",
      sourceText: "The navigation team is ready.",
      translated: false,
      speechProbability: 0.92,
      snrDb: 24,
      lowQualitySpeechProbability: 0.45,
      lowQualitySnrDb: 8,
      speechActive: false,
      queuedSegmentCount: 0,
      confirmV2Active: true,
    });

    expect(projection).toMatchObject({
      lowAudioQuality: false,
      shouldAutoConfirm: true,
      confirmPolicy: {
        confirmAutoEligible: true,
        confirmBlockReason: null,
      },
      confirmPolicyWithoutLiveActivity: {
        confirmAutoEligible: true,
        confirmBlockReason: null,
      },
    });
  });

  it("projects held transcript watchdog dispatch, reschedule, and clear actions", () => {
    expect(evaluateHelixAskVoiceHeldTranscriptWatchdog({
      heldTranscript: "The navigation team is ready.",
      holdReason: "continuation_hold",
      updatedAtMs: 1000,
      nowMs: 4000,
      lastSpeechAtMs: 500,
      transcribeQueueLength: 0,
      speechActive: false,
      transcribeBusy: false,
      pendingConfirmation: false,
      micArmed: true,
      maxAgeMs: 30000,
      recoveryPauseMs: 1200,
    })).toMatchObject({
      action: "dispatch",
      shouldFlushHeld: true,
      shouldForceFlushExpired: false,
    });
    expect(evaluateHelixAskVoiceHeldTranscriptWatchdog({
      heldTranscript: "The navigation team is ready.",
      holdReason: "continuation_hold",
      updatedAtMs: 1000,
      nowMs: 2000,
      lastSpeechAtMs: 1500,
      transcribeQueueLength: 0,
      speechActive: false,
      transcribeBusy: false,
      pendingConfirmation: false,
      micArmed: true,
      maxAgeMs: 30000,
      recoveryPauseMs: 1200,
    })).toMatchObject({
      action: "reschedule",
      shouldFlushHeld: false,
      shouldForceFlushExpired: false,
    });
    expect(evaluateHelixAskVoiceHeldTranscriptWatchdog({
      heldTranscript: "The navigation team is ready.",
      holdReason: "continuation_hold",
      updatedAtMs: 1000,
      nowMs: 2000,
      lastSpeechAtMs: 1500,
      transcribeQueueLength: 0,
      speechActive: false,
      transcribeBusy: false,
      pendingConfirmation: false,
      micArmed: false,
      maxAgeMs: 30000,
      recoveryPauseMs: 1200,
    })).toMatchObject({
      action: "clear",
      shouldFlushHeld: false,
      shouldForceFlushExpired: false,
    });
  });
});
