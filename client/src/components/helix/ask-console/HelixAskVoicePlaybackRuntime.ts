import {
  buildReadAloudStateMapTransition,
  type ReadAloudPlaybackStateByReply,
} from "@/lib/helix/ask-read-aloud-display";
import {
  clearHelixAskReadAloudPlaybackProjectionForReply,
  type HelixAskReadAloudPlaybackProjectionByReply,
} from "./HelixAskReadAloudPlaybackProjection";
import {
  shouldRetryVoicePlaybackDirectAttempt,
  shouldRetryVoicePlaybackWithDirectFallback,
  shouldTreatVoicePlaybackErrorAsEnded,
} from "@/lib/helix/ask-voice-playback-classification";
import {
  HELIX_VOICE_FORCE_DIRECT_MOBILE,
  isActivePlayback,
  isLikelyMobileAudioUserAgent,
  resolveVoicePlaybackAttemptPath,
  resolveVoicePlaybackGain,
  shouldBypassVoicePlaybackGraph,
  shouldUseVoicePlaybackAudioGraph,
} from "@/lib/helix/ask-voice-playback-runtime";
import { describeMediaErrorCode } from "@/lib/helix/ask-voice-capture-display";
import {
  createVoicePlaybackLifecycleDiagnostic,
  updateVoicePlaybackLifecycleDiagnosticFromAudio,
  type VoicePlaybackLifecycleDiagnostic,
} from "@/lib/helix/voice-playback-diagnostics";
import type { VoicePlaybackLifecycleReceiptStatus } from "@/lib/helix/voice-capture-diagnostics";
import { releaseAudioFocus, requestAudioFocus } from "@/lib/audio-focus";

export const VOICE_PLAYBACK_DIRECT_RETRY_DELAY_MS = 120;
export const VOICE_PLAYBACK_GRAPH_FAILURE_STREAK_FOR_BYPASS = 2;
export const VOICE_PLAYBACK_GRAPH_BYPASS_MS = 90_000;
export const VOICE_PLAYBACK_NO_PROGRESS_TIMEOUT_MS = 3_500;
export const VOICE_PLAYBACK_UNKNOWN_DURATION_TIMEOUT_MS = 15_000;
export const VOICE_PLAYBACK_DURATION_TIMEOUT_PAD_MS = 4_000;
export const VOICE_PLAYBACK_DURATION_TIMEOUT_MAX_MS = 60_000;

export {
  HELIX_VOICE_FORCE_DIRECT_MOBILE,
  isActivePlayback,
  isLikelyMobileAudioUserAgent,
  resolveVoicePlaybackAttemptPath,
  resolveVoicePlaybackGain,
  shouldBypassVoicePlaybackGraph,
  shouldUseVoicePlaybackAudioGraph,
};

type MutableRef<T> = { current: T };
type VoicePlaybackPath = "audio_graph" | "direct_element" | "direct_fallback";

export type HelixAskVoicePlaybackRuntimeLifecycleReceiptInput = {
  playbackStatus: VoicePlaybackLifecycleReceiptStatus;
  replyId: string;
  cancelReason?: string | null;
  error?: string | null;
  positionMs?: number | null;
};

export type HelixAskVoicePlaybackRuntimeInput = {
  blob: Blob;
  replyId?: string | null;
  awaitPlayback?: boolean;
  voiceAudioUnlockedRef: MutableRef<boolean>;
  voicePlaybackLastUnlockFailureRef: MutableRef<{ reason: string; atMs: number } | null>;
  voicePlaybackCurrentPathRef: MutableRef<VoicePlaybackPath | null>;
  voicePlaybackLastOutcomePathRef: MutableRef<VoicePlaybackPath | null>;
  voicePlaybackGraphAttemptCountRef: MutableRef<number>;
  voicePlaybackGraphFailureStreakRef: MutableRef<number>;
  voicePlaybackGraphBypassUntilMsRef: MutableRef<number | null>;
  voicePlaybackFallbackCountRef: MutableRef<number>;
  voicePlaybackLastFallbackRef: MutableRef<{ reason: string; atMs: number } | null>;
  voicePlaybackTransportPausedRef: MutableRef<boolean>;
  playbackElementRef: MutableRef<HTMLAudioElement | null>;
  playbackUrlRef: MutableRef<string | null>;
  playbackReplyIdRef: MutableRef<string | null>;
  playbackAudioRef: MutableRef<HTMLAudioElement | null>;
  voiceAutoSpeakPendingPlaybackResolverRef: MutableRef<(() => void) | null>;
  primeVoiceAudioPlayback: () => Promise<boolean>;
  ensureVoicePlaybackAudioGraph: (audio: HTMLAudioElement) => Promise<boolean>;
  createVoicePlaybackElement: () => HTMLAudioElement;
  getOrCreateVoicePlaybackElement: () => HTMLAudioElement;
  teardownVoicePlaybackAudioGraph: () => void;
  setReadAloudByReply: (
    updater: (prev: ReadAloudPlaybackStateByReply) => ReadAloudPlaybackStateByReply,
  ) => void;
  setReadAloudProjectionByReply?: (
    updater: (
      prev: HelixAskReadAloudPlaybackProjectionByReply,
    ) => HelixAskReadAloudPlaybackProjectionByReply,
  ) => void;
  recordManualReadAloudLifecycleReceipt: (
    input: HelixAskVoicePlaybackRuntimeLifecycleReceiptInput,
  ) => void;
  setVoiceInputError: (error: string | null) => void;
};

export type HelixAskVoicePlaybackTransportCommand = "pause" | "resume" | "stop";

export type HelixAskVoicePlaybackTransportCommandInput = {
  command: HelixAskVoicePlaybackTransportCommand;
  replyId: string;
  voicePlaybackTransportPausedRef: MutableRef<boolean>;
  playbackReplyIdRef: MutableRef<string | null>;
  playbackAudioRef: MutableRef<HTMLAudioElement | null>;
  setReadAloudByReply: (
    updater: (prev: ReadAloudPlaybackStateByReply) => ReadAloudPlaybackStateByReply,
  ) => void;
  setReadAloudProjectionByReply?: (
    updater: (
      prev: HelixAskReadAloudPlaybackProjectionByReply,
    ) => HelixAskReadAloudPlaybackProjectionByReply,
  ) => void;
  recordManualReadAloudLifecycleReceipt: (
    input: HelixAskVoicePlaybackRuntimeLifecycleReceiptInput,
  ) => void;
  pauseCancelReason?: string | null;
  clearQueuedReply?: (replyId: string) => void;
  stopReadAloud?: () => void;
};

export async function applyHelixAskVoicePlaybackTransportCommand(
  input: HelixAskVoicePlaybackTransportCommandInput,
): Promise<boolean> {
  if (!input.replyId) return false;
  if (input.command === "pause") {
    const currentAudio = input.playbackAudioRef.current;
    if (!currentAudio || input.playbackReplyIdRef.current !== input.replyId) return false;
    input.voicePlaybackTransportPausedRef.current = true;
    currentAudio.pause();
    const positionMs = Number.isFinite(currentAudio.currentTime)
      ? Math.max(0, Math.round(currentAudio.currentTime * 1000))
      : null;
    input.setReadAloudByReply((prev) =>
      buildReadAloudStateMapTransition(prev, input.replyId, "paused"),
    );
    input.recordManualReadAloudLifecycleReceipt({
      playbackStatus: "paused",
      replyId: input.replyId,
      cancelReason: input.pauseCancelReason ?? null,
      positionMs,
    });
    return true;
  }
  if (input.command === "resume") {
    const currentAudio = input.playbackAudioRef.current;
    if (!currentAudio || input.playbackReplyIdRef.current !== input.replyId) return false;
    input.setReadAloudByReply((prev) =>
      buildReadAloudStateMapTransition(prev, input.replyId, "resume"),
    );
    try {
      await currentAudio.play();
      input.voicePlaybackTransportPausedRef.current = false;
      const positionMs = Number.isFinite(currentAudio.currentTime)
        ? Math.max(0, Math.round(currentAudio.currentTime * 1000))
        : null;
      input.setReadAloudByReply((prev) =>
        buildReadAloudStateMapTransition(prev, input.replyId, "resumed"),
      );
      input.recordManualReadAloudLifecycleReceipt({
        playbackStatus: "resumed",
        replyId: input.replyId,
        positionMs,
      });
    } catch {
      input.setReadAloudByReply((prev) =>
        buildReadAloudStateMapTransition(prev, input.replyId, "error"),
      );
      input.recordManualReadAloudLifecycleReceipt({
        playbackStatus: "failed",
        replyId: input.replyId,
        cancelReason: "error",
        error: "manual_read_aloud_resume_failed",
      });
    }
    return true;
  }
  input.clearQueuedReply?.(input.replyId);
  input.stopReadAloud?.();
  input.setReadAloudByReply((prev) =>
    buildReadAloudStateMapTransition(prev, input.replyId, "stop"),
  );
  input.setReadAloudProjectionByReply?.((prev) =>
    clearHelixAskReadAloudPlaybackProjectionForReply(prev, input.replyId),
  );
  input.recordManualReadAloudLifecycleReceipt({
    playbackStatus: "cancelled",
    replyId: input.replyId,
    cancelReason: "user_stop",
  });
  return true;
}

export async function playHelixAskVoiceAudioBlob(
  input: HelixAskVoicePlaybackRuntimeInput,
): Promise<VoicePlaybackLifecycleDiagnostic> {
  const replyId = input.replyId ?? null;
  if (!input.voiceAudioUnlockedRef.current) {
    await input.primeVoiceAudioPlayback().catch(() => false);
  }
  let directFallbackAttempted = false;
  let directRetryCount = 0;
  while (true) {
    const reusePrimaryElement = !directFallbackAttempted && directRetryCount === 0;
    const audio = reusePrimaryElement
      ? input.getOrCreateVoicePlaybackElement()
      : input.createVoicePlaybackElement();
    if (!reusePrimaryElement) {
      input.playbackElementRef.current = audio;
    }
    const bypassGraph = !directFallbackAttempted
      ? shouldBypassVoicePlaybackGraph({
          bypassUntilMs: input.voicePlaybackGraphBypassUntilMsRef.current,
          nowMs: Date.now(),
        })
      : false;
    const graphAttached =
      directFallbackAttempted || bypassGraph
        ? false
        : await input.ensureVoicePlaybackAudioGraph(audio).catch(() => false);
    if (!directFallbackAttempted && graphAttached) {
      input.voicePlaybackGraphAttemptCountRef.current += 1;
      input.voicePlaybackGraphFailureStreakRef.current = 0;
      input.voicePlaybackGraphBypassUntilMsRef.current = null;
    }
    input.voicePlaybackCurrentPathRef.current = resolveVoicePlaybackAttemptPath({
      graphAttached,
      directFallbackAttempted,
    });
    const url = URL.createObjectURL(input.blob);
    audio.muted = false;
    audio.volume = 1;
    input.playbackUrlRef.current = url;
    input.playbackReplyIdRef.current = replyId;
    audio.src = url;
    audio.load();
    input.playbackAudioRef.current = audio;
    input.voicePlaybackTransportPausedRef.current = false;
    const audioFocusId = `helix-terminal-voice:${replyId ?? Date.now()}`;
    let audioFocusStopReason: "barge_in" | null = null;
    requestAudioFocus({
      id: audioFocusId,
      kind: "helix_terminal_voice",
      priority: 100,
      stop: (reason) => {
        if (reason === "interrupted") audioFocusStopReason = "barge_in";
        audio.pause();
        input.voiceAutoSpeakPendingPlaybackResolverRef.current?.();
      },
    });
    let lifecycleDiagnostic = createVoicePlaybackLifecycleDiagnostic({
      stage: "audio_response",
      mimeType: input.blob.type || "application/octet-stream",
      audioBytes: input.blob.size,
    });
    if (replyId) {
      input.setReadAloudByReply((prev) =>
        buildReadAloudStateMapTransition(prev, replyId, "audio"),
      );
    }
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let watchdogId: number | null = null;
        let playResolvedAtMs: number | null = null;
        let lastProgressAtMs = Date.now();
        let lastCurrentTime = 0;
        let playbackStopResolver: (() => void) | null = null;
        const getDurationSeconds = () =>
          Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
        const cleanupPlaybackHandlers = () => {
          audio.onended = null;
          audio.onerror = null;
          audio.onplaying = null;
          audio.ontimeupdate = null;
          audio.onloadedmetadata = null;
          if (watchdogId !== null && typeof window !== "undefined") {
            window.clearInterval(watchdogId);
            watchdogId = null;
          }
        };
        const clearRuntimePlaybackRefs = () => {
          releaseAudioFocus(audioFocusId);
          if (input.playbackUrlRef.current === url) {
            URL.revokeObjectURL(url);
            input.playbackUrlRef.current = null;
          }
          if (input.playbackAudioRef.current === audio) {
            input.playbackAudioRef.current = null;
            input.voicePlaybackLastOutcomePathRef.current = input.voicePlaybackCurrentPathRef.current;
            input.voicePlaybackCurrentPathRef.current = null;
          }
          if (input.playbackReplyIdRef.current === replyId) {
            input.playbackReplyIdRef.current = null;
          }
        };
        const clearStopResolver = () => {
          if (
            playbackStopResolver &&
            input.voiceAutoSpeakPendingPlaybackResolverRef.current === playbackStopResolver
          ) {
            input.voiceAutoSpeakPendingPlaybackResolverRef.current = null;
          }
        };
        const failWithPlaybackTimeout = (reason: "no_progress" | "duration_exceeded") => {
          if (settled) return;
          lifecycleDiagnostic = updateVoicePlaybackLifecycleDiagnosticFromAudio(
            lifecycleDiagnostic,
            audio,
            "error",
            `voice_audio_playback_timeout:${reason}`,
          );
          settled = true;
          cleanupPlaybackHandlers();
          clearStopResolver();
          if (replyId) {
            input.setReadAloudByReply((prev) =>
              buildReadAloudStateMapTransition(prev, replyId, "error"),
            );
          }
          clearRuntimePlaybackRefs();
          try {
            audio.pause();
          } catch {
            // no-op
          }
          audio.src = "";
          audio.load();
          reject(new Error(`voice_audio_playback_timeout:${reason}`));
        };
        const finalize = (event: "ended" | "error" | "stopped") => {
          if (settled) return;
          input.voicePlaybackTransportPausedRef.current = false;
          lifecycleDiagnostic = updateVoicePlaybackLifecycleDiagnosticFromAudio(
            lifecycleDiagnostic,
            audio,
            event === "ended" ? "ended" : event === "stopped" ? "aborted" : "error",
            event === "error"
              ? "voice_audio_playback_error"
              : event === "stopped"
                ? "voice_audio_playback_stopped"
                : null,
          );
          settled = true;
          cleanupPlaybackHandlers();
          clearStopResolver();
          if (replyId) {
            input.setReadAloudByReply((prev) =>
              buildReadAloudStateMapTransition(
                prev,
                replyId,
                event === "ended" ? "ended" : event === "stopped" ? "stop" : "error",
              ),
            );
            input.recordManualReadAloudLifecycleReceipt({
              playbackStatus:
                event === "ended" ? "completed" : event === "stopped" ? "cancelled" : "failed",
              replyId,
              cancelReason:
                event === "stopped"
                  ? audioFocusStopReason ?? "user_stop"
                  : event === "error"
                    ? "error"
                    : null,
              error: event === "error" ? "voice_audio_playback_error" : null,
              positionMs: Number.isFinite(audio.currentTime)
                ? Math.max(0, Math.round(audio.currentTime * 1000))
                : null,
            });
          }
          clearRuntimePlaybackRefs();
          if (event === "error") {
            const playedSeconds = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
            const durationSeconds =
              Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
            const mediaErrorCode = audio.error?.code ?? null;
            if (
              shouldTreatVoicePlaybackErrorAsEnded({
                playedSeconds,
                durationSeconds,
                directFallbackAttempted,
              })
            ) {
              resolve();
              return;
            }
            const mediaErrorDetail = describeMediaErrorCode(mediaErrorCode);
            reject(new Error(`voice_audio_playback_error:${mediaErrorDetail}`));
            return;
          }
          resolve();
        };
        const resolver = () => finalize("stopped");
        playbackStopResolver = resolver;
        input.voiceAutoSpeakPendingPlaybackResolverRef.current = resolver;
        audio.onended = () => finalize("ended");
        audio.onerror = () => finalize("error");
        audio.onplaying = () => {
          input.voicePlaybackTransportPausedRef.current = false;
          if (replyId) {
            input.recordManualReadAloudLifecycleReceipt({
              playbackStatus: "started",
              replyId,
              positionMs: Number.isFinite(audio.currentTime)
                ? Math.max(0, Math.round(audio.currentTime * 1000))
                : null,
            });
          }
          lifecycleDiagnostic = updateVoicePlaybackLifecycleDiagnosticFromAudio(
            lifecycleDiagnostic,
            audio,
            "playing",
          );
          lastProgressAtMs = Date.now();
        };
        audio.ontimeupdate = () => {
          lifecycleDiagnostic = updateVoicePlaybackLifecycleDiagnosticFromAudio(
            lifecycleDiagnostic,
            audio,
            "timeupdate",
          );
          const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
          if (currentTime > lastCurrentTime + 0.02) {
            lastCurrentTime = currentTime;
            lastProgressAtMs = Date.now();
          }
        };
        audio.onloadedmetadata = () => {
          lastProgressAtMs = Date.now();
        };
        if (typeof window !== "undefined") {
          watchdogId = window.setInterval(() => {
            if (settled) return;
            if (input.voicePlaybackTransportPausedRef.current || audio.paused) return;
            const now = Date.now();
            const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
            const durationSeconds = getDurationSeconds();
            if (
              audio.ended ||
              (durationSeconds !== null && currentTime >= Math.max(0, durationSeconds - 0.15))
            ) {
              finalize("ended");
              return;
            }
            if (currentTime > lastCurrentTime + 0.02) {
              lastCurrentTime = currentTime;
              lastProgressAtMs = now;
            }
            if (
              playResolvedAtMs !== null &&
              currentTime < 0.1 &&
              now - lastProgressAtMs > VOICE_PLAYBACK_NO_PROGRESS_TIMEOUT_MS
            ) {
              failWithPlaybackTimeout("no_progress");
              return;
            }
            const durationTimeoutMs =
              durationSeconds !== null
                ? Math.min(
                    VOICE_PLAYBACK_DURATION_TIMEOUT_MAX_MS,
                    Math.max(
                      8_000,
                      durationSeconds * 1_000 + VOICE_PLAYBACK_DURATION_TIMEOUT_PAD_MS,
                    ),
                  )
                : VOICE_PLAYBACK_UNKNOWN_DURATION_TIMEOUT_MS;
            if (playResolvedAtMs !== null && now - playResolvedAtMs > durationTimeoutMs) {
              failWithPlaybackTimeout("duration_exceeded");
            }
          }, 250);
        }
        const attemptPlay = async () => {
          try {
            lifecycleDiagnostic = updateVoicePlaybackLifecycleDiagnosticFromAudio(
              lifecycleDiagnostic,
              audio,
              "play_requested",
            );
            await audio.play();
            lifecycleDiagnostic = updateVoicePlaybackLifecycleDiagnosticFromAudio(
              lifecycleDiagnostic,
              audio,
              "play_resolved",
            );
            playResolvedAtMs = Date.now();
            lastProgressAtMs = playResolvedAtMs;
            input.voiceAudioUnlockedRef.current = true;
            input.voicePlaybackLastUnlockFailureRef.current = null;
          } catch (error) {
            if (
              error instanceof DOMException &&
              (error.name === "NotAllowedError" || error.name === "AbortError")
            ) {
              const unlocked = await input.primeVoiceAudioPlayback();
              if (unlocked) {
                lifecycleDiagnostic = updateVoicePlaybackLifecycleDiagnosticFromAudio(
                  lifecycleDiagnostic,
                  audio,
                  "play_requested",
                );
                await audio.play();
                lifecycleDiagnostic = updateVoicePlaybackLifecycleDiagnosticFromAudio(
                  lifecycleDiagnostic,
                  audio,
                  "play_resolved",
                );
                playResolvedAtMs = Date.now();
                lastProgressAtMs = playResolvedAtMs;
                input.voiceAudioUnlockedRef.current = true;
                input.voicePlaybackLastUnlockFailureRef.current = null;
                return;
              }
            }
            throw error;
          }
        };
        if (input.awaitPlayback === false) {
          void attemptPlay()
            .then(() => resolve())
            .catch(() => finalize("error"));
          return;
        }
        void attemptPlay().catch((error) => {
          if (
            error instanceof DOMException &&
            (error.name === "NotAllowedError" || error.name === "AbortError")
          ) {
            input.setVoiceInputError("Audio blocked on this device. Tap mic to enable playback.");
          }
          finalize("error");
        });
      });
      return lifecycleDiagnostic;
    } catch (error) {
      if (
        shouldRetryVoicePlaybackWithDirectFallback({
          graphAttached,
          directFallbackAttempted,
        })
      ) {
        const nextFailureStreak = input.voicePlaybackGraphFailureStreakRef.current + 1;
        input.voicePlaybackGraphFailureStreakRef.current = nextFailureStreak;
        if (nextFailureStreak >= VOICE_PLAYBACK_GRAPH_FAILURE_STREAK_FOR_BYPASS) {
          input.voicePlaybackGraphBypassUntilMsRef.current =
            Date.now() + VOICE_PLAYBACK_GRAPH_BYPASS_MS;
        }
        directFallbackAttempted = true;
        input.voicePlaybackFallbackCountRef.current += 1;
        input.voicePlaybackLastFallbackRef.current = {
          reason: error instanceof Error ? error.message : String(error),
          atMs: Date.now(),
        };
        input.voicePlaybackCurrentPathRef.current = "direct_fallback";
        input.teardownVoicePlaybackAudioGraph();
        try {
          audio.pause();
        } catch {
          // no-op
        }
        audio.onended = null;
        audio.onerror = null;
        audio.src = "";
        audio.load();
        if (input.playbackElementRef.current === audio) {
          if (audio.isConnected) {
            audio.remove();
          }
          input.playbackElementRef.current = null;
        }
        continue;
      }
      if (
        shouldRetryVoicePlaybackDirectAttempt({
          graphAttached,
          directFallbackAttempted,
          directRetryCount,
        })
      ) {
        directRetryCount += 1;
        input.voicePlaybackFallbackCountRef.current += 1;
        input.voicePlaybackLastFallbackRef.current = {
          reason: `direct_retry:${error instanceof Error ? error.message : String(error)}`,
          atMs: Date.now(),
        };
        input.voicePlaybackCurrentPathRef.current = "direct_fallback";
        await new Promise<void>((resolve) => {
          setTimeout(resolve, VOICE_PLAYBACK_DIRECT_RETRY_DELAY_MS);
        });
        try {
          audio.pause();
        } catch {
          // no-op
        }
        audio.onended = null;
        audio.onerror = null;
        audio.src = "";
        audio.load();
        if (input.playbackElementRef.current === audio) {
          if (audio.isConnected) {
            audio.remove();
          }
          input.playbackElementRef.current = null;
        }
        continue;
      }
      throw error;
    }
  }
}
