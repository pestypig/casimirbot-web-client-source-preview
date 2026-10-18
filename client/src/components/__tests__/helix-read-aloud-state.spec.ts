import { beforeAll, describe, expect, it } from "vitest";

let transitionReadAloudState: typeof import("@/components/helix/HelixAskPill").transitionReadAloudState;
let buildSpeakText: typeof import("@/components/helix/HelixAskPill").buildSpeakText;
let isActivePlayback: typeof import("@/components/helix/HelixAskPill").isActivePlayback;
let shouldAutoSpeakVoiceDecisionLifecycle: typeof import("@/components/helix/HelixAskPill").shouldAutoSpeakVoiceDecisionLifecycle;
let shouldInterruptForSupersededReason: typeof import("@/components/helix/HelixAskPill").shouldInterruptForSupersededReason;
let isRetryableVoiceChunkSynthesisError: typeof import("@/components/helix/HelixAskPill").isRetryableVoiceChunkSynthesisError;
let stripVoiceCitationArtifacts: typeof import("@/components/helix/HelixAskPill").stripVoiceCitationArtifacts;
let shouldDispatchReasoningAttempt: typeof import("@/components/helix/HelixAskPill").shouldDispatchReasoningAttempt;
let shouldForceObserveDispatchFromSuppression: typeof import("@/components/helix/HelixAskPill").shouldForceObserveDispatchFromSuppression;
let isArtifactDominatedReasoningText: typeof import("@/components/helix/HelixAskPill").isArtifactDominatedReasoningText;
let sanitizeReasoningOutputText: typeof import("@/components/helix/HelixAskPill").sanitizeReasoningOutputText;
let cleanReasoningDisplayArtifacts: typeof import("@/components/helix/HelixAskPill").cleanReasoningDisplayArtifacts;
let hasDanglingTurnTail: typeof import("@/components/helix/HelixAskPill").hasDanglingTurnTail;
let isLowInformationTailTranscript: typeof import("@/components/helix/HelixAskPill").isLowInformationTailTranscript;
let isLikelyContinuationAddendum: typeof import("@/components/helix/HelixAskPill").isLikelyContinuationAddendum;
let shouldRestartExplorationLadderOnSupersede: typeof import("@/components/helix/HelixAskPill").shouldRestartExplorationLadderOnSupersede;
let shouldRecoverHeldTranscriptAfterNoTranscript: typeof import("@/components/helix/HelixAskPill").shouldRecoverHeldTranscriptAfterNoTranscript;
let shouldFlushHeldTranscriptFromWatchdog: typeof import("@/components/helix/HelixAskPill").shouldFlushHeldTranscriptFromWatchdog;
let decideExplorationLadderAction: typeof import("@/components/helix/HelixAskPill").decideExplorationLadderAction;
let resolveVoiceBargeHardCutReason: typeof import("@/components/helix/HelixAskPill").resolveVoiceBargeHardCutReason;
let shouldResumeBargeHeldPlayback: typeof import("@/components/helix/HelixAskPill").shouldResumeBargeHeldPlayback;
let shouldTreatMicSignalAsSpeech: typeof import("@/components/helix/HelixAskPill").shouldTreatMicSignalAsSpeech;
let resolveVoiceNoiseHandlingProfile: typeof import("@/components/helix/HelixAskPill").resolveVoiceNoiseHandlingProfile;
let isLikelyContinuationTailFragment: typeof import("@/components/helix/HelixAskPill").isLikelyContinuationTailFragment;
let isGenericQueuedVoiceAcknowledgement: typeof import("@/components/helix/HelixAskPill").isGenericQueuedVoiceAcknowledgement;
let extractLatestContinuationQuestionFocus: typeof import("@/components/helix/HelixAskPill").extractLatestContinuationQuestionFocus;
let buildVoiceReasoningDispatchPrompt: typeof import("@/components/helix/HelixAskPill").buildVoiceReasoningDispatchPrompt;
let isLikelyNearTurnContinuation: typeof import("@/components/helix/HelixAskPill").isLikelyNearTurnContinuation;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  ({
    transitionReadAloudState,
    buildSpeakText,
    isActivePlayback,
    shouldAutoSpeakVoiceDecisionLifecycle,
    shouldInterruptForSupersededReason,
    isRetryableVoiceChunkSynthesisError,
    stripVoiceCitationArtifacts,
    shouldDispatchReasoningAttempt,
    shouldForceObserveDispatchFromSuppression,
    isArtifactDominatedReasoningText,
    sanitizeReasoningOutputText,
    cleanReasoningDisplayArtifacts,
    hasDanglingTurnTail,
    isLowInformationTailTranscript,
    isLikelyContinuationAddendum,
    shouldRestartExplorationLadderOnSupersede,
    shouldRecoverHeldTranscriptAfterNoTranscript,
    shouldFlushHeldTranscriptFromWatchdog,
    decideExplorationLadderAction,
    resolveVoiceBargeHardCutReason,
    shouldResumeBargeHeldPlayback,
    shouldTreatMicSignalAsSpeech,
    resolveVoiceNoiseHandlingProfile,
    isLikelyContinuationTailFragment,
    isGenericQueuedVoiceAcknowledgement,
    extractLatestContinuationQuestionFocus,
    buildVoiceReasoningDispatchPrompt,
    isLikelyNearTurnContinuation,
  } = await import("@/components/helix/HelixAskPill"));
});

describe("transitionReadAloudState", () => {
  it("covers deterministic playback state transitions", () => {
    expect(transitionReadAloudState("idle", "request")).toBe("loading");
    expect(transitionReadAloudState("loading", "audio")).toBe("playing");
    expect(transitionReadAloudState("loading", "suppressed")).toBe("unavailable");
    expect(transitionReadAloudState("loading", "error")).toBe("error");
    expect(transitionReadAloudState("playing", "pause")).toBe("paused");
    expect(transitionReadAloudState("paused", "resume")).toBe("resuming");
    expect(transitionReadAloudState("playing", "ended")).toBe("completed");
    expect(transitionReadAloudState("playing", "stop")).toBe("cancelled");
  });
});

describe("buildSpeakText", () => {
  it("caps long text to <= 600 chars with truncation marker", () => {
    const longText = `${"A".repeat(300)}. ${"B".repeat(320)}. ${"C".repeat(200)}`;
    const speakText = buildSpeakText(longText);

    expect(speakText.length).toBeLessThanOrEqual(600);
    expect(speakText.endsWith("...") || speakText.endsWith("…")).toBe(true);
  });

  it("returns empty for blank input", () => {
    expect(buildSpeakText("   ")).toBe("");
  });

  it("removes file/link citation artifacts for voice fluidity", () => {
    const text = [
      "Negative energy density is theoretical.",
      "Sources: docs/knowledge/physics/einstein-field-equations.md",
      "Tree Walk: Physics Foundations Walk (tree-derived; source: docs/knowledge/physics/physics-foundations-tree.json)",
      "Read this [reference](https://example.com/deep/link).",
    ].join("\n");
    const spoken = buildSpeakText(text, 2000);
    expect(spoken).toContain("Negative energy density is theoretical.");
    expect(spoken).toContain("Tree Walk: Physics Foundations Walk");
    expect(spoken).toContain("Read this reference.");
    expect(spoken).not.toContain("docs/knowledge/physics");
    expect(spoken).not.toContain("Sources:");
    expect(spoken).not.toContain("https://example.com");
  });
});

describe("isActivePlayback", () => {
  it("prevents stale ended handlers from mutating active playback", () => {
    const oldAudio = {} as HTMLAudioElement;
    const newAudio = {} as HTMLAudioElement;

    expect(isActivePlayback(newAudio, oldAudio)).toBe(false);
    expect(isActivePlayback(newAudio, newAudio)).toBe(true);
  });
});

describe("shouldAutoSpeakVoiceDecisionLifecycle", () => {
  it("speaks queued and running lifecycle updates", () => {
    expect(shouldAutoSpeakVoiceDecisionLifecycle("queued")).toBe(true);
    expect(shouldAutoSpeakVoiceDecisionLifecycle("running")).toBe(true);
    expect(shouldAutoSpeakVoiceDecisionLifecycle("suppressed")).toBe(false);
    expect(shouldAutoSpeakVoiceDecisionLifecycle("escalated")).toBe(false);
    expect(shouldAutoSpeakVoiceDecisionLifecycle("failed")).toBe(false);
    expect(shouldAutoSpeakVoiceDecisionLifecycle("done")).toBe(false);
  });

  it("stays quiet for superseded interruption lifecycle updates", () => {
    expect(
      shouldAutoSpeakVoiceDecisionLifecycle("failed", {
        failReasonRaw: "the run was interrupted by a newer turn",
      }),
    ).toBe(false);
    expect(
      shouldAutoSpeakVoiceDecisionLifecycle("suppressed", {
        routeReasonCode: "voice_turn_superseded_by_newer_attempt",
      }),
    ).toBe(false);
  });

  it("speaks suppressed clarifier lifecycle updates", () => {
    expect(
      shouldAutoSpeakVoiceDecisionLifecycle("suppressed", {
        routeReasonCode: "suppressed:clarify_after_attempt1",
      }),
    ).toBe(true);
    expect(
      shouldAutoSpeakVoiceDecisionLifecycle("suppressed", {
        routeReasonCode: "suppressed:clarify_after_artifact_retry_exhausted",
      }),
    ).toBe(true);
  });
});

describe("shouldInterruptForSupersededReason", () => {
  it("does not preempt a synthesizing brief before first audio frame", () => {
    expect(shouldInterruptForSupersededReason("preempted_by_final", false)).toBe(false);
    expect(shouldInterruptForSupersededReason("preempted_by_final", true)).toBe(true);
    expect(shouldInterruptForSupersededReason("superseded_new_turn", false)).toBe(true);
    expect(shouldInterruptForSupersededReason(null, true)).toBe(false);
  });
});

describe("hybrid barge-in hard cut policy", () => {
  it("hard-cuts when STT queue starts during active hold", () => {
    expect(
      resolveVoiceBargeHardCutReason({
        holdActive: true,
        holdStartedAtMs: Date.now() - 120,
        nowMs: Date.now(),
        transcribeQueueLength: 1,
        transcribeBusy: false,
        pendingConfirmation: false,
        speechActive: true,
      }),
    ).toBe("stt_queue");
  });

  it("does not hard-cut for stt queue rollover when speech is no longer active", () => {
    expect(
      resolveVoiceBargeHardCutReason({
        holdActive: true,
        holdStartedAtMs: Date.now() - 120,
        nowMs: Date.now(),
        transcribeQueueLength: 1,
        transcribeBusy: false,
        pendingConfirmation: false,
        speechActive: false,
      }),
    ).toBeNull();
  });

  it("hard-cuts when speech persists beyond hold threshold", () => {
    const nowMs = Date.now();
    expect(
      resolveVoiceBargeHardCutReason({
        holdActive: true,
        holdStartedAtMs: nowMs - 900,
        nowMs,
        transcribeQueueLength: 0,
        transcribeBusy: false,
        pendingConfirmation: false,
        speechActive: true,
      }),
    ).toBe("speech_persisted");
  });
});

describe("barge-in resume guard", () => {
  it("blocks resume while the chunk-traffic quiet window is active", () => {
    const now = Date.now();
    expect(
      shouldResumeBargeHeldPlayback({
        holdActive: true,
        resumeNotBeforeMs: now - 1,
        nowMs: now,
        transcribeQueueLength: 0,
        transcribeBusy: false,
        pendingConfirmation: false,
        speechActive: false,
        micArmed: true,
        segmentFlushPending: false,
        trafficQuietUntilMs: now + 800,
      }),
    ).toBe(false);
  });

  it("allows resume once hold, stt, and traffic guards are clear", () => {
    const now = Date.now();
    expect(
      shouldResumeBargeHeldPlayback({
        holdActive: true,
        resumeNotBeforeMs: now - 1,
        nowMs: now,
        transcribeQueueLength: 0,
        transcribeBusy: false,
        pendingConfirmation: false,
        speechActive: false,
        micArmed: true,
        segmentFlushPending: false,
        trafficQuietUntilMs: now - 1,
      }),
    ).toBe(true);
  });
});

describe("barge-in speech qualification", () => {
  it("ignores ambient playback noise unless speech evidence is strong", () => {
    expect(
      shouldTreatMicSignalAsSpeech({
        speakingNow: true,
        voiceOutputActive: true,
        localAudioGateActive: true,
        speechProbability: 0.34,
        snrDb: 3.2,
        rms: 0.022,
        speechTriggerThreshold: 0.018,
      }),
    ).toBe(false);
  });

  it("keeps legacy behavior when playback is inactive or gating is disabled", () => {
    expect(
      shouldTreatMicSignalAsSpeech({
        speakingNow: true,
        voiceOutputActive: false,
        localAudioGateActive: true,
        speechProbability: 0.25,
        snrDb: 2.8,
        rms: 0.02,
        speechTriggerThreshold: 0.018,
      }),
    ).toBe(true);
    expect(
      shouldTreatMicSignalAsSpeech({
        speakingNow: true,
        voiceOutputActive: true,
        localAudioGateActive: false,
        speechProbability: 0.25,
        snrDb: 2.8,
        rms: 0.02,
        speechTriggerThreshold: 0.018,
      }),
    ).toBe(true);
  });

  it("qualifies near-field speech while playback is active", () => {
    expect(
      shouldTreatMicSignalAsSpeech({
        speakingNow: true,
        voiceOutputActive: true,
        localAudioGateActive: true,
        speechProbability: 0.72,
        snrDb: 9.1,
        rms: 0.03,
        speechTriggerThreshold: 0.018,
      }),
    ).toBe(true);
  });

  it("applies stricter speech evidence in noisy-environment profile", () => {
    const noisy = resolveVoiceNoiseHandlingProfile(true);
    expect(
      shouldTreatMicSignalAsSpeech({
        speakingNow: true,
        voiceOutputActive: true,
        localAudioGateActive: true,
        speechProbability: 0.66,
        snrDb: 9.8,
        rms: 0.03,
        speechTriggerThreshold: 0.018,
        bargeMinSpeechProbability: noisy.bargeMinSpeechProbability,
        bargeStrongSpeechProbability: noisy.bargeStrongSpeechProbability,
        bargeMinSnrDb: noisy.bargeMinSnrDb,
        bargeRmsMultiplier: noisy.bargeRmsMultiplier,
      }),
    ).toBe(false);
    expect(
      shouldTreatMicSignalAsSpeech({
        speakingNow: true,
        voiceOutputActive: true,
        localAudioGateActive: true,
        speechProbability: 0.9,
        snrDb: 16,
        rms: 0.042,
        speechTriggerThreshold: 0.018,
        bargeMinSpeechProbability: noisy.bargeMinSpeechProbability,
        bargeStrongSpeechProbability: noisy.bargeStrongSpeechProbability,
        bargeMinSnrDb: noisy.bargeMinSnrDb,
        bargeRmsMultiplier: noisy.bargeRmsMultiplier,
      }),
    ).toBe(true);
  });
});

describe("isRetryableVoiceChunkSynthesisError", () => {
  it("marks transient network and retryable status errors as retryable", () => {
    expect(isRetryableVoiceChunkSynthesisError(new Error("Failed to fetch"))).toBe(true);
    expect(
      isRetryableVoiceChunkSynthesisError({
        status: 503,
        message: "service unavailable",
      }),
    ).toBe(true);
    expect(
      isRetryableVoiceChunkSynthesisError({
        status: 429,
        message: "rate limited",
      }),
    ).toBe(true);
  });

  it("does not retry suppressed or abort errors", () => {
    expect(
      isRetryableVoiceChunkSynthesisError(
        new Error("voice_auto_speak_suppressed:dedupe_cooldown"),
      ),
    ).toBe(false);
    expect(
      isRetryableVoiceChunkSynthesisError({
        name: "AbortError",
        message: "The operation was aborted.",
      }),
    ).toBe(false);
  });
});

describe("stripVoiceCitationArtifacts", () => {
  it("strips raw file path and source trailers while preserving sentence content", () => {
    const cleaned = stripVoiceCitationArtifacts(
      "Tree Walk: Warp Mechanics (tree-derived; source: docs/knowledge/warp/warp-mechanics-tree.json)",
    );
    expect(cleaned).toBe("Tree Walk: Warp Mechanics (tree-derived)");
  });

  it("strips bare file basenames and extension residue tokens", () => {
    const cleaned = stripVoiceCitationArtifacts(
      "ts, server/services/planner/grounding.ts. Constraint: plan.ts, docs/helix-ask-flow.md",
    );
    expect(cleaned).not.toContain("grounding.ts");
    expect(cleaned).not.toContain("plan.ts");
    expect(cleaned).not.toContain("docs/helix-ask-flow.md");
  });
});

describe("shouldDispatchReasoningAttempt", () => {
  it("dispatches reasoning for directive prompts with leading discourse markers", () => {
    expect(shouldDispatchReasoningAttempt("Okay, define quantum system.")).toBe(true);
  });

  it("suppresses pure acknowledgments", () => {
    expect(shouldDispatchReasoningAttempt("okay")).toBe(false);
  });
});

describe("suppression override guard", () => {
  it("forces observe dispatch for real prompts suppressed as filler/low-salience", () => {
    expect(
      shouldForceObserveDispatchFromSuppression({
        dispatchHint: false,
        routeReasonCode: "suppressed:filler",
        transcript: "Okay, define a quantum system in simple terms.",
      }),
    ).toBe(true);
  });

  it("forces observe dispatch when dispatcher reason is inconsistent but prompt is clearly intentful", () => {
    expect(
      shouldForceObserveDispatchFromSuppression({
        dispatchHint: false,
        routeReasonCode: "dispatch:heuristic",
        transcript: "Okay, okay, explain what a warp bubble full solve means in this code base.",
      }),
    ).toBe(true);
    expect(
      shouldForceObserveDispatchFromSuppression({
        dispatchHint: false,
        routeReasonCode: "suppressed:low_salience",
        transcript: "You found what a warp bubble is the congruence of for the codebase.",
      }),
    ).toBe(true);
  });

  it("does not force dispatch for low-information tails", () => {
    expect(
      shouldForceObserveDispatchFromSuppression({
        dispatchHint: false,
        routeReasonCode: "suppressed:low_salience",
        transcript: "Friends.",
      }),
    ).toBe(false);
  });

  it("forces observe dispatch for substantive prompts suppressed by multilang confidence gate", () => {
    expect(
      shouldForceObserveDispatchFromSuppression({
        dispatchHint: false,
        routeReasonCode: "suppressed:multilang_confirmation_required",
        transcript: "What is quantum physics and why does it matter?",
      }),
    ).toBe(true);
  });
});

describe("artifact-dominated output guards", () => {
  it("detects artifact-heavy final text", () => {
    const noisy =
      "ts, server/services/planner/grounding.ts. Evidence: docs/helix-ask-flow.md. Constraint: plan.ts.";
    expect(isArtifactDominatedReasoningText(noisy)).toBe(true);
  });

  it("detects mission/warp artifact template spill", () => {
    const noisy =
      "What is warp bubble: docs/casimir-tile-mechanism.md What is mission ethos: docs/BUSINESS_MODEL.md How they connect: Verification hooks translate design ambition.";
    expect(isArtifactDominatedReasoningText(noisy)).toBe(true);
  });

  it("detects underscore template spill with focus anchors", () => {
    const noisy =
      "Focus anchor: system, interdependent, components. what_is_warp_bubble: export default function ElectronOrbitalPanel() const state, actions = useElectronOrbitSim(); what_is_mission_ethos: Mission ethos constrains capability claims.";
    expect(isArtifactDominatedReasoningText(noisy)).toBe(true);
  });

  it("detects repeated runtime fallback boilerplate spill", () => {
    const noisy =
      "Runtime fallback: fetch failed Runtime fallback: fetch failed. Mechanism: Runtime fallback: fetch failed.";
    expect(isArtifactDominatedReasoningText(noisy)).toBe(true);
  });

  it("sanitizes citation/path fragments for display", () => {
    const noisy =
      "ts, server/services/planner/grounding.ts. Evidence: docs/helix-ask-flow.md. In practice, the system explains tradeoffs.";
    const cleaned = sanitizeReasoningOutputText(noisy);
    expect(cleaned).toContain("In practice, the system explains tradeoffs.");
    expect(cleaned).not.toContain("grounding.ts");
    expect(cleaned).not.toContain("docs/helix-ask-flow.md");
  });

  it("sanitizes repeated runtime fallback boilerplate for display", () => {
    const noisy =
      "Runtime fallback: fetch failed Runtime fallback: fetch failed. In practice, retry with narrower scope.";
    const cleaned = sanitizeReasoningOutputText(noisy);
    expect(cleaned).toContain("In practice, retry with narrower scope.");
    expect(cleaned.toLowerCase()).not.toContain("runtime fallback: fetch failed");
  });
});

describe("cleanReasoningDisplayArtifacts", () => {
  it("removes orphan extension fragments while preserving explanation text", () => {
    const noisy = [
      "Claim-first explanation:",
      "1. ts] Grounded equation candidates were retrieved.",
      "",
      "Details",
      "ts]",
      "2. Claim-first explanation:. ts]",
      "4. The retrieved files still provide grounded model parameters.",
    ].join("\n");

    const cleaned = cleanReasoningDisplayArtifacts(noisy);
    expect(cleaned).not.toContain("ts]");
    expect(cleaned).toContain("Grounded equation candidates were retrieved.");
    expect(cleaned).toContain("The retrieved files still provide grounded model parameters.");
  });

  it("preserves file citations used in final answer text", () => {
    const withCitations =
      "Primary equation: [server/services/mixer/collapse.ts] -> collapseMix(state, knobs).";
    const cleaned = cleanReasoningDisplayArtifacts(withCitations);
    expect(cleaned).toContain("[server/services/mixer/collapse.ts]");
    expect(cleaned).toContain("collapseMix");
  });
});

describe("exploration escalation guard", () => {
  it("retries artifact-heavy observe output once, then clarifies", () => {
    const decision = decideExplorationLadderAction({
      explorationAttemptCount: 1,
      promptText: "So how does the Planck scale relate to virtual particles in Casimir effect?",
      outputText:
        "What is warp bubble: docs/casimir-tile-mechanism.md What is mission ethos: docs/BUSINESS_MODEL.md",
      mode: "observe",
      debug: { arbiter_mode: "hybrid", verification_anchor_required: false },
    });
    expect(decision.action).toBe("restart_after_artifact");
    const secondAttempt = decideExplorationLadderAction({
      explorationAttemptCount: 2,
      promptText: "So how does the Planck scale relate to virtual particles in Casimir effect?",
      outputText:
        "What is warp bubble: docs/casimir-tile-mechanism.md What is mission ethos: docs/BUSINESS_MODEL.md",
      mode: "observe",
      debug: { arbiter_mode: "hybrid", verification_anchor_required: false },
    });
    expect(secondAttempt.action).toBe("clarify_after_attempt1");
  });

  it("uses raw output artifact guard when sanitized output looks benign", () => {
    const decision = decideExplorationLadderAction({
      explorationAttemptCount: 1,
      promptText: "Relate interdependent components to curvature.",
      outputText: "Interdependent components can shape a system objective.",
      rawOutputText:
        "Focus anchor: system, interdependent, components. what_is_warp_bubble: export default function ElectronOrbitalPanel()",
      mode: "observe",
      debug: { arbiter_mode: "hybrid", verification_anchor_required: false },
    });
    expect(decision.action).toBe("restart_after_artifact");
  });

  it("restarts observe lane when runtime fallback spill dominates", () => {
    const decision = decideExplorationLadderAction({
      explorationAttemptCount: 1,
      promptText: "How does intention relate to action?",
      outputText:
        "Runtime fallback: fetch failed Runtime fallback: fetch failed. Mechanism: Runtime fallback: fetch failed.",
      mode: "observe",
      debug: { arbiter_mode: "hybrid", verification_anchor_required: false },
    });
    expect(decision.action).toBe("restart_after_artifact");
  });
});

describe("late-tail continuation guards", () => {
  it("detects dangling connector endings", () => {
    expect(hasDanglingTurnTail("the virtual particles of the energy density is the")).toBe(true);
    expect(hasDanglingTurnTail("it's not like a classical system that you can")).toBe(true);
    expect(hasDanglingTurnTail("quantum systems exhibit superposition.")).toBe(false);
  });

  it("marks short orphan fragments as low-information tails", () => {
    expect(isLowInformationTailTranscript("Friends.")).toBe(true);
    expect(isLowInformationTailTranscript("Define quantum system")).toBe(false);
  });

  it("detects short discourse addenda for continuation merges", () => {
    expect(isLikelyContinuationAddendum("So gravity is like where this converges.")).toBe(true);
    expect(isLikelyContinuationAddendum("And move faster than light in this frame.")).toBe(true);
    expect(isLikelyContinuationAddendum("Define a system from scratch with examples.")).toBe(false);
  });

  it("detects lowercase continuation tail fragments", () => {
    expect(isLikelyContinuationTailFragment("probability that happens in the Casimir effect.")).toBe(true);
    expect(isLikelyContinuationTailFragment("the effect of this in bounded modes")).toBe(true);
    expect(isLikelyContinuationTailFragment("What is the Casimir effect?")).toBe(false);
  });

  it("extracts latest continuation question focus from merged prompts", () => {
    expect(
      extractLatestContinuationQuestionFocus("Okay, define a system. So, what about a statistical quantum system?"),
    ).toBe("So, what about a statistical quantum system?");
    expect(
      extractLatestContinuationQuestionFocus(
        "So in biological cohesive systems, can you explain this relation to objective reduction to the wave function.",
      ),
    ).toBeNull();
  });
});

describe("generic queued brief detection", () => {
  it("identifies boilerplate queued acknowledgements", () => {
    expect(isGenericQueuedVoiceAcknowledgement("Got it. I am thinking through this in the background.")).toBe(
      true,
    );
    expect(isGenericQueuedVoiceAcknowledgement("Got it. Thinking in the background.")).toBe(true);
    expect(
      isGenericQueuedVoiceAcknowledgement(
        "Got it. I will run a short observe reasoning pass in the background so we can keep talking while it loads.",
      ),
    ).toBe(true);
    expect(
      isGenericQueuedVoiceAcknowledgement(
        "A system is a set of interconnected components that work together to achieve a specific purpose.",
      ),
    ).toBe(false);
  });
});

describe("context-scoped dispatch prompts", () => {
  it("injects only immediate anchor for likely continuation turns", () => {
    const prompt = buildVoiceReasoningDispatchPrompt({
      transcript: "Where is that coming from?",
      recentTurns: [
        "user: what is negative energy",
        "dottie: Negative energy can refer to effective energy-density terms in GR.",
        "user: where is that coming from?",
      ],
      explorationPacket: null,
    });
    expect(prompt).toContain("Follow-up turn: Where is that coming from?");
    expect(prompt).toContain("Immediate anchor: what is negative energy");
    expect(prompt).toContain("Prior user turn: what is negative energy");
    expect(prompt).not.toContain("Recent turns:");
  });

  it("drops stale context injection on topic-shift turns", () => {
    const prompt = buildVoiceReasoningDispatchPrompt({
      transcript: "Now explain electron spin statistics from scratch.",
      recentTurns: [
        "user: where is that coming from?",
        "dottie: It came from Casimir field constraints.",
      ],
      explorationPacket: null,
    });
    expect(prompt).toBe("Now explain electron spin statistics from scratch.");
    expect(
      isLikelyNearTurnContinuation({
        transcript: "Now explain electron spin statistics from scratch.",
        priorUserTurn: "where is that coming from?",
      }),
    ).toBe(false);
  });
});

describe("exploration ladder restart policy", () => {
  it("restarts ladder when superseding an active turn outside merge guards", () => {
    expect(
      shouldRestartExplorationLadderOnSupersede({
        hasContinuityCandidate: true,
        forceTailContinuationMerge: false,
        shortContinuationAddendum: false,
        canMergeContinuation: false,
        intentShiftBand: "shift",
      }),
    ).toBe(true);
  });

  it("does not restart ladder for continuation merges", () => {
    expect(
      shouldRestartExplorationLadderOnSupersede({
        hasContinuityCandidate: true,
        forceTailContinuationMerge: true,
        shortContinuationAddendum: false,
        canMergeContinuation: true,
        intentShiftBand: "continuation",
      }),
    ).toBe(false);
    expect(
      shouldRestartExplorationLadderOnSupersede({
        hasContinuityCandidate: true,
        forceTailContinuationMerge: false,
        shortContinuationAddendum: true,
        canMergeContinuation: false,
        intentShiftBand: "shift",
      }),
    ).toBe(false);
  });
});

describe("held transcript recovery", () => {
  it("recovers held transcript when follow-up STT is empty and turn is complete enough", () => {
    expect(
      shouldRecoverHeldTranscriptAfterNoTranscript({
        heldTranscript: "Virtual particles aren't directly observable, but they result in the Casimir effect, so can you relate that?",
        turnCompleteBand: "high",
        transcribeQueueLength: 0,
        speechActive: false,
        sinceLastSpeechMs: 3600,
      }),
    ).toBe(true);
  });

  it("does not recover before turn-close silence guard is satisfied", () => {
    expect(
      shouldRecoverHeldTranscriptAfterNoTranscript({
        heldTranscript: "Virtual particles aren't directly observable, but they result in the Casimir effect.",
        turnCompleteBand: "high",
        transcribeQueueLength: 0,
        speechActive: false,
        sinceLastSpeechMs: 1800,
      }),
    ).toBe(false);
  });

  it("does not recover while active speech or queued segments remain", () => {
    expect(
      shouldRecoverHeldTranscriptAfterNoTranscript({
        heldTranscript: "how does",
        turnCompleteBand: "medium",
        transcribeQueueLength: 1,
        speechActive: false,
        sinceLastSpeechMs: 1800,
      }),
    ).toBe(false);
    expect(
      shouldRecoverHeldTranscriptAfterNoTranscript({
        heldTranscript: "A continuation is still happening",
        turnCompleteBand: "high",
        transcribeQueueLength: 0,
        speechActive: true,
        sinceLastSpeechMs: 400,
      }),
    ).toBe(false);
  });

  it("does not recover low-information orphan tails", () => {
    expect(
      shouldRecoverHeldTranscriptAfterNoTranscript({
        heldTranscript: "Friends.",
        turnCompleteBand: "high",
        transcribeQueueLength: 0,
        speechActive: false,
        sinceLastSpeechMs: 1800,
      }),
    ).toBe(false);
  });
});

describe("held transcript watchdog flush", () => {
  it("flushes continuation holds after guard window when channel is quiet", () => {
    expect(
      shouldFlushHeldTranscriptFromWatchdog({
        heldTranscript:
          "Classical mechanics and quantum mechanics can meet at Penrose objective reduction. Can you get into how our curvature unit does that?",
        holdReason: "continuation_hold",
        transcribeQueueLength: 0,
        speechActive: false,
        transcribeBusy: false,
        pendingConfirmation: false,
        sinceLastSpeechMs: 3600,
        ageMs: 2400,
      }),
    ).toBe(true);
  });

  it("does not flush low-information tails or active continuation channels", () => {
    expect(
      shouldFlushHeldTranscriptFromWatchdog({
        heldTranscript: "Friends.",
        holdReason: "low_info_tail",
        transcribeQueueLength: 0,
        speechActive: false,
        transcribeBusy: false,
        pendingConfirmation: false,
        sinceLastSpeechMs: 2200,
        ageMs: 2400,
      }),
    ).toBe(false);
    expect(
      shouldFlushHeldTranscriptFromWatchdog({
        heldTranscript: "Can you relate that to Casimir vacuum effects?",
        holdReason: "continuation_hold",
        transcribeQueueLength: 1,
        speechActive: false,
        transcribeBusy: false,
        pendingConfirmation: false,
        sinceLastSpeechMs: 2200,
        ageMs: 2400,
      }),
    ).toBe(false);
  });
});
