import {
  evaluateVoiceReasoningResponseAuthority,
  evaluateVoiceTurnSealGate,
} from "@/lib/helix/voice/voice-turn-authority";
import {
  mergeVoiceTranscriptDraft,
} from "@/lib/helix/voice/voice-transcript";

export type TurnLoopHarnessSuppressionCause =
  | "phase_not_sealed"
  | "seal_token_mismatch"
  | "sealed_revision_mismatch"
  | "dispatch_hash_mismatch"
  | "inactive_attempt";

export type TurnLoopHarnessAuthorityRejectStage = "preflight" | "final";

export type TurnLoopHarnessAttemptStatus =
  | "queued"
  | "running"
  | "done"
  | "suppressed"
  | "cancelled"
  | "failed";

export type TurnLoopHarnessEventKind =
  | "segment_merged"
  | "seal_opened"
  | "sealed"
  | "attempt_started"
  | "attempt_suppressed"
  | "attempt_finalized"
  | "interrupted";

export type TurnLoopHarnessEvent = {
  id: string;
  seq: number;
  atMs: number;
  kind: TurnLoopHarnessEventKind;
  turnKey: string;
  revision: number;
  sealToken: string | null;
  attemptId?: string;
  detail?: string;
  suppressionCause?: TurnLoopHarnessSuppressionCause;
  authorityRejectStage?: TurnLoopHarnessAuthorityRejectStage;
  finalSource?: "normal_reasoning";
  causalRefId?: string | null;
};

export type TurnLoopHarnessAttempt = {
  attemptId: string;
  prompt: string;
  transcriptRevision: number;
  sealToken: string | null;
  dispatchPromptHash: string | null;
  status: TurnLoopHarnessAttemptStatus;
  startedAtMs: number;
  completedAtMs: number | null;
  finalText: string;
};

export type TurnLoopHarnessState = {
  turnKey: string;
  phase: "draft" | "sealed";
  transcriptRevision: number;
  sealedRevision: number;
  sealToken: string | null;
  sealedAtMs: number | null;
  draftTranscript: string;
  lastSpeechAtMs: number;
  hashStableSinceMs: number | null;
  currentTranscriptHash: string;
  sttQueueDepth: number;
  sttInFlight: boolean;
  heldPending: boolean;
  latestDispatchPromptHash: string | null;
};

export type TurnLoopHarnessCommand =
  | {
      kind: "segment";
      atMs: number;
      text: string;
    }
  | {
      kind: "transport";
      atMs: number;
      sttQueueDepth?: number;
      sttInFlight?: boolean;
      heldPending?: boolean;
    }
  | {
      kind: "tick";
      atMs: number;
    }
  | {
      kind: "start_attempt";
      atMs: number;
      attemptId: string;
      prompt: string;
      dispatchPromptHash?: string | null;
    }
  | {
      kind: "resolve_attempt";
      atMs: number;
      attemptId: string;
      finalText: string;
      authorityRejectStage?: TurnLoopHarnessAuthorityRejectStage;
    }
  | {
      kind: "interrupt";
      atMs: number;
      transcript?: string;
      detail?: string;
    };

export type TurnLoopHarnessRunResult = {
  state: TurnLoopHarnessState;
  attempts: TurnLoopHarnessAttempt[];
  events: TurnLoopHarnessEvent[];
};

type TurnLoopHarnessOptions = {
  turnKey?: string;
  closeSilenceMs?: number;
  hashStableMs?: number;
};

type ResolveAttemptResult = {
  accepted: boolean;
  suppressionCause: TurnLoopHarnessSuppressionCause | null;
};

const DEFAULT_CLOSE_SILENCE_MS = 3200;
const DEFAULT_HASH_STABLE_MS = 900;

function normalizeSuppressionCause(
  reason:
    | "ok"
    | "continuation_merged"
    | "stale_prompt"
    | "phase_not_sealed"
    | "seal_token_mismatch"
    | "sealed_revision_mismatch"
    | "dispatch_hash_mismatch"
    | "inactive_attempt",
): TurnLoopHarnessSuppressionCause {
  switch (reason) {
    case "phase_not_sealed":
      return "phase_not_sealed";
    case "seal_token_mismatch":
      return "seal_token_mismatch";
    case "sealed_revision_mismatch":
      return "sealed_revision_mismatch";
    case "dispatch_hash_mismatch":
    case "continuation_merged":
    case "stale_prompt":
      return "dispatch_hash_mismatch";
    case "inactive_attempt":
    case "ok":
    default:
      return "inactive_attempt";
  }
}

function hashTranscript(transcript: string): string {
  let hash = 2166136261;
  for (let index = 0; index < transcript.length; index += 1) {
    hash ^= transcript.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16)}`;
}

export class TurnLoopHarness {
  private state: TurnLoopHarnessState;
  private attempts = new Map<string, TurnLoopHarnessAttempt>();
  private events: TurnLoopHarnessEvent[] = [];
  private sequence = 0;
  private sealCounter = 0;
  private readonly closeSilenceMs: number;
  private readonly hashStableMs: number;

  constructor(options?: TurnLoopHarnessOptions) {
    const turnKey = (options?.turnKey ?? "voice:turn-loop-harness").trim() || "voice:turn-loop-harness";
    this.closeSilenceMs = Math.max(1, Math.floor(options?.closeSilenceMs ?? DEFAULT_CLOSE_SILENCE_MS));
    this.hashStableMs = Math.max(1, Math.floor(options?.hashStableMs ?? DEFAULT_HASH_STABLE_MS));
    this.state = {
      turnKey,
      phase: "draft",
      transcriptRevision: 0,
      sealedRevision: 0,
      sealToken: null,
      sealedAtMs: null,
      draftTranscript: "",
      lastSpeechAtMs: 0,
      hashStableSinceMs: null,
      currentTranscriptHash: "",
      sttQueueDepth: 0,
      sttInFlight: false,
      heldPending: false,
      latestDispatchPromptHash: null,
    };
  }

  getState(): TurnLoopHarnessState {
    return { ...this.state };
  }

  getAttempts(): TurnLoopHarnessAttempt[] {
    return [...this.attempts.values()].map((attempt) => ({ ...attempt }));
  }

  getEvents(): TurnLoopHarnessEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  ingestSegment(args: { atMs: number; text: string }): TurnLoopHarnessState {
    const transcript = args.text.trim();
    if (!transcript) {
      return this.getState();
    }
    const mergedTranscript = mergeVoiceTranscriptDraft(this.state.draftTranscript, transcript);
    const nextRevision = this.state.transcriptRevision + 1;
    const nextHash = hashTranscript(mergedTranscript);
    const hashChanged = nextHash !== this.state.currentTranscriptHash;
    const wasSealed = this.state.phase === "sealed";

    this.state = {
      ...this.state,
      phase: "draft",
      transcriptRevision: nextRevision,
      sealToken: null,
      sealedAtMs: null,
      draftTranscript: mergedTranscript,
      lastSpeechAtMs: args.atMs,
      currentTranscriptHash: nextHash,
      hashStableSinceMs: hashChanged ? args.atMs : (this.state.hashStableSinceMs ?? args.atMs),
    };

    if (wasSealed) {
      this.emit({
        atMs: args.atMs,
        kind: "seal_opened",
        detail: "new segment merged; seal invalidated",
      });
    }
    this.emit({
      atMs: args.atMs,
      kind: "segment_merged",
      detail: mergedTranscript,
    });
    return this.getState();
  }

  updateTransport(args: {
    atMs: number;
    sttQueueDepth?: number;
    sttInFlight?: boolean;
    heldPending?: boolean;
  }): TurnLoopHarnessState {
    const queueDepth = args.sttQueueDepth;
    this.state = {
      ...this.state,
      sttQueueDepth: typeof queueDepth === "number" && Number.isFinite(queueDepth)
        ? Math.max(0, Math.floor(queueDepth))
        : this.state.sttQueueDepth,
      sttInFlight: typeof args.sttInFlight === "boolean" ? args.sttInFlight : this.state.sttInFlight,
      heldPending: typeof args.heldPending === "boolean" ? args.heldPending : this.state.heldPending,
      lastSpeechAtMs: args.atMs < this.state.lastSpeechAtMs ? this.state.lastSpeechAtMs : this.state.lastSpeechAtMs,
    };
    return this.getState();
  }

  tick(atMs: number): { sealed: boolean; state: TurnLoopHarnessState } {
    const sinceLastSpeech = Math.max(0, atMs - this.state.lastSpeechAtMs);
    const hashStableSince = this.state.hashStableSinceMs ?? atMs;
    const hashStableDwell = Math.max(0, atMs - hashStableSince);
    const sealReady = evaluateVoiceTurnSealGate({
      sinceLastSpeechMs: sinceLastSpeech,
      sttQueueDepth: this.state.sttQueueDepth,
      sttInFlight: this.state.sttInFlight,
      heldPending: this.state.heldPending,
      hashStableDwellMs: hashStableDwell,
      closeSilenceMs: this.closeSilenceMs,
      hashStableMs: this.hashStableMs,
    });
    if (!sealReady || this.state.phase === "sealed") {
      return { sealed: false, state: this.getState() };
    }
    this.sealCounter += 1;
    const sealToken = `seal-${this.state.transcriptRevision}-${this.sealCounter}`;
    this.state = {
      ...this.state,
      phase: "sealed",
      sealedRevision: this.state.transcriptRevision,
      sealToken,
      sealedAtMs: atMs,
    };
    this.emit({
      atMs,
      kind: "sealed",
      detail: "seal gate passed",
    });
    return { sealed: true, state: this.getState() };
  }

  startAttempt(args: {
    atMs: number;
    attemptId: string;
    prompt: string;
    dispatchPromptHash?: string | null;
  }): TurnLoopHarnessAttempt | null {
    if (this.state.phase !== "sealed" || !this.state.sealToken) {
      this.emit({
        atMs: args.atMs,
        kind: "attempt_suppressed",
        attemptId: args.attemptId,
        detail: "attempt rejected: phase_not_sealed",
        suppressionCause: "phase_not_sealed",
        authorityRejectStage: "preflight",
      });
      return null;
    }
    const dispatchHash = (args.dispatchPromptHash?.trim() || hashTranscript(args.prompt)).trim();
    const attempt: TurnLoopHarnessAttempt = {
      attemptId: args.attemptId,
      prompt: args.prompt.trim(),
      transcriptRevision: this.state.sealedRevision,
      sealToken: this.state.sealToken,
      dispatchPromptHash: dispatchHash,
      status: "running",
      startedAtMs: args.atMs,
      completedAtMs: null,
      finalText: "",
    };
    this.attempts.set(attempt.attemptId, attempt);
    this.state = {
      ...this.state,
      latestDispatchPromptHash: dispatchHash,
    };
    this.emit({
      atMs: args.atMs,
      kind: "attempt_started",
      attemptId: args.attemptId,
      detail: attempt.prompt,
    });
    return { ...attempt };
  }

  resolveAttempt(args: {
    atMs: number;
    attemptId: string;
    finalText: string;
    authorityRejectStage?: TurnLoopHarnessAuthorityRejectStage;
  }): ResolveAttemptResult {
    const attempt = this.attempts.get(args.attemptId);
    if (!attempt) {
      return { accepted: false, suppressionCause: "inactive_attempt" };
    }
    const authority = evaluateVoiceReasoningResponseAuthority({
      source: "voice_auto",
      continuationRestartRequested: false,
      latestAskPromptForAttempt: attempt.prompt,
      askPromptForRequest: attempt.prompt,
      latestAttemptStatus: attempt.status,
      requestIntentRevision: attempt.transcriptRevision,
      latestIntentRevision: this.state.sealedRevision,
      latestAttemptIntentRevision: attempt.transcriptRevision,
      requestDispatchPromptHash: attempt.dispatchPromptHash,
      latestDispatchPromptHash: this.state.latestDispatchPromptHash,
      attemptTranscriptRevision: attempt.transcriptRevision,
      latestSealedTranscriptRevision: this.state.phase === "sealed" ? this.state.sealedRevision : null,
      attemptSealToken: attempt.sealToken,
      latestSealToken: this.state.phase === "sealed" ? this.state.sealToken : null,
      assemblerPhase: this.state.phase,
    });
    if (authority.suppress) {
      const suppressionCause = normalizeSuppressionCause(authority.reason);
      const updated: TurnLoopHarnessAttempt = {
        ...attempt,
        status: "suppressed",
        completedAtMs: args.atMs,
        finalText: args.finalText.trim(),
      };
      this.attempts.set(updated.attemptId, updated);
      this.emit({
        atMs: args.atMs,
        kind: "attempt_suppressed",
        attemptId: updated.attemptId,
        detail: suppressionCause,
        suppressionCause,
        authorityRejectStage: args.authorityRejectStage ?? "final",
      });
      return { accepted: false, suppressionCause };
    }
    const finalized: TurnLoopHarnessAttempt = {
      ...attempt,
      status: "done",
      completedAtMs: args.atMs,
      finalText: args.finalText.trim(),
    };
    this.attempts.set(finalized.attemptId, finalized);
    this.emit({
      atMs: args.atMs,
      kind: "attempt_finalized",
      attemptId: finalized.attemptId,
      detail: finalized.finalText,
      finalSource: "normal_reasoning",
    });
    return { accepted: true, suppressionCause: null };
  }

  interrupt(args: { atMs: number; transcript?: string; detail?: string }): TurnLoopHarnessState {
    const priorSeal = this.state.sealToken;
    this.state = {
      ...this.state,
      phase: "draft",
      sealToken: null,
      sealedAtMs: null,
      heldPending: false,
      sttInFlight: false,
      sttQueueDepth: 0,
    };
    this.emit({
      atMs: args.atMs,
      kind: "interrupted",
      detail: args.detail ?? "barge_in_hard_cut",
      causalRefId: priorSeal ? `seal:${priorSeal}` : null,
    });
    if (args.transcript?.trim()) {
      this.ingestSegment({ atMs: args.atMs, text: args.transcript });
    }
    return this.getState();
  }

  run(commands: TurnLoopHarnessCommand[]): TurnLoopHarnessRunResult {
    for (const command of commands) {
      switch (command.kind) {
        case "segment":
          this.ingestSegment({ atMs: command.atMs, text: command.text });
          break;
        case "transport":
          this.updateTransport({
            atMs: command.atMs,
            sttQueueDepth: command.sttQueueDepth,
            sttInFlight: command.sttInFlight,
            heldPending: command.heldPending,
          });
          break;
        case "tick":
          this.tick(command.atMs);
          break;
        case "start_attempt":
          this.startAttempt({
            atMs: command.atMs,
            attemptId: command.attemptId,
            prompt: command.prompt,
            dispatchPromptHash: command.dispatchPromptHash,
          });
          break;
        case "resolve_attempt":
          this.resolveAttempt({
            atMs: command.atMs,
            attemptId: command.attemptId,
            finalText: command.finalText,
            authorityRejectStage: command.authorityRejectStage,
          });
          break;
        case "interrupt":
          this.interrupt({
            atMs: command.atMs,
            transcript: command.transcript,
            detail: command.detail,
          });
          break;
      }
    }
    return {
      state: this.getState(),
      attempts: this.getAttempts(),
      events: this.getEvents(),
    };
  }

  private emit(args: {
    atMs: number;
    kind: TurnLoopHarnessEventKind;
    attemptId?: string;
    detail?: string;
    suppressionCause?: TurnLoopHarnessSuppressionCause;
    authorityRejectStage?: TurnLoopHarnessAuthorityRejectStage;
    finalSource?: "normal_reasoning";
    causalRefId?: string | null;
  }): void {
    this.sequence += 1;
    this.events.push({
      id: `turn-loop:event:${this.state.turnKey}:${this.sequence}`,
      seq: this.sequence,
      atMs: args.atMs,
      kind: args.kind,
      turnKey: this.state.turnKey,
      revision: this.state.transcriptRevision,
      sealToken: this.state.sealToken,
      attemptId: args.attemptId,
      detail: args.detail,
      suppressionCause: args.suppressionCause,
      authorityRejectStage: args.authorityRejectStage,
      finalSource: args.finalSource,
      causalRefId: args.causalRefId ?? null,
    });
  }
}

export function runTurnLoopHarnessScenario(
  commands: TurnLoopHarnessCommand[],
  options?: TurnLoopHarnessOptions,
): TurnLoopHarnessRunResult {
  return new TurnLoopHarness(options).run(commands);
}
