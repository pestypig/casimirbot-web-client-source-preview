import { toCanvas } from "html-to-image";
import {
  HELIX_VISUAL_SEQUENCE_CAPTURE_SCHEMA,
  VISUAL_SEQUENCE_LIMITS,
  type VisualSequenceCaptureMetadata,
  type VisualSequenceCaptureSurface,
  type VisualSequenceStopReason,
} from "@shared/helix-visual-sequence";
import type { HudSurfaceRenderReceipt } from "@shared/helix-hud-surface";
import {
  requestVisualSourceMediaStream,
  stopVisualSourceMediaStream,
  type HelixVisualSourceMediaDevices,
} from "./visualSourceMedia";

export type BoundedCaptureErrorCode =
  | "consent_required"
  | "content_clearance_required"
  | "capture_already_active"
  | "capture_unsupported"
  | "source_selection_cancelled"
  | "whole_screen_forbidden"
  | "hud_surface_unavailable"
  | "source_lost"
  | "source_identity_changed"
  | "protected_or_empty_capture"
  | "recorder_failed";

export class BoundedCaptureError extends Error {
  constructor(public readonly code: BoundedCaptureErrorCode, message: string) {
    super(message);
  }
}

export type CaptureIdentity = {
  sourceId: string;
  producerEpoch: string;
  profileId: string;
  runId: string;
  threadId: string;
};

export type BoundedCaptureResult = {
  blob: Blob;
  metadata: VisualSequenceCaptureMetadata;
};

export type ActiveBoundedCapture = {
  captureSessionId: string;
  startedAt: string;
  completion: Promise<BoundedCaptureResult>;
  stop: () => void;
  revoke: () => void;
};

export type BoundedCaptureInput = {
  consent: true;
  contentCleared: true;
  surface: VisualSequenceCaptureSurface;
  durationMs?: 10_000 | 15_000;
  identity?: CaptureIdentity;
  getIdentity?: () => CaptureIdentity;
  hudElement?: HTMLElement | null;
  getHudReceipt?: () => HudSurfaceRenderReceipt | null;
  mediaDevices?: HelixVisualSourceMediaDevices | null;
  MediaRecorderCtor?: typeof MediaRecorder;
  now?: () => Date;
  onProgress?: (elapsedMs: number) => void;
};

const recorderMimeType = (ctor: typeof MediaRecorder): string => {
  for (const candidate of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (!ctor.isTypeSupported || ctor.isTypeSupported(candidate)) return candidate;
  }
  return "";
};

const captureReceipt = (receipt: HudSurfaceRenderReceipt, startedMs: number) => ({
  at_ms: Math.max(0, Date.now() - startedMs),
  receipt_id: receipt.receiptId,
  causal_hash: receipt.causalHash,
  source_frame_hash: receipt.sourceFrameHash,
  hud_scene_hash: receipt.hudSceneHash,
  viewport_hash: receipt.viewportHash,
  mode: receipt.mode,
  status: receipt.status,
});

export async function startBoundedVisualSequenceCapture(input: BoundedCaptureInput): Promise<ActiveBoundedCapture> {
  if (input.consent !== true) throw new BoundedCaptureError("consent_required", "Explicit capture consent is required.");
  if (input.contentCleared !== true) throw new BoundedCaptureError("content_clearance_required", "Confirm that the selected surface excludes protected or sensitive content.");
  const durationMs = input.durationMs ?? VISUAL_SEQUENCE_LIMITS.boundedCaptureDefaultDurationMs;
  if (durationMs > VISUAL_SEQUENCE_LIMITS.boundedCaptureMaxDurationMs) {
    throw new BoundedCaptureError("recorder_failed", "Capture duration exceeds 15 seconds.");
  }
  const Recorder = input.MediaRecorderCtor ?? globalThis.MediaRecorder;
  if (!Recorder) throw new BoundedCaptureError("capture_unsupported", "This browser does not support bounded video recording.");

  const isHud = input.surface === "hud_clean_feed" || input.surface === "hud_composed_feed";
  let stream: MediaStream;
  let identity = input.identity;
  let frameTimer: ReturnType<typeof setInterval> | null = null;
  if (isHud) {
    if (!input.hudElement || !identity) throw new BoundedCaptureError("hud_surface_unavailable", "The selected HUD surface is unavailable.");
    const output = document.createElement("canvas");
    output.width = 1280;
    output.height = 720;
    const context = output.getContext("2d");
    if (!context || typeof output.captureStream !== "function") throw new BoundedCaptureError("capture_unsupported", "HUD canvas capture is unavailable.");
    const paint = async () => {
      const next = await toCanvas(input.hudElement!, { canvasWidth: 1280, canvasHeight: 720, pixelRatio: 1, backgroundColor: input.surface === "hud_clean_feed" ? undefined : "#020617" });
      context.clearRect(0, 0, output.width, output.height);
      context.drawImage(next, 0, 0, output.width, output.height);
    };
    await paint();
    frameTimer = setInterval(() => { void paint().catch(() => undefined); }, 250);
    stream = output.captureStream(12);
  } else {
    const selected = await requestVisualSourceMediaStream({ kind: "screen", includeDisplayAudio: false, mediaDevices: input.mediaDevices });
    if (!selected.ok) {
      throw new BoundedCaptureError("source_selection_cancelled", "message" in selected ? selected.message : "The selected source could not be started.");
    }
    if (selected.surface === "screen") {
      stopVisualSourceMediaStream(selected.stream);
      throw new BoundedCaptureError("whole_screen_forbidden", "Choose one program window or browser tab; whole-screen capture is not admitted.");
    }
    stream = selected.stream;
    identity = {
      ...(identity ?? {
        profileId: "developer",
        runId: `capture:${selected.videoTrack.id}`,
        threadId: "motorcycle-hud-lab",
      }),
      sourceId: `display-track:${selected.videoTrack.id}`,
      producerEpoch: `track:${selected.videoTrack.id}`,
    };
  }

  if (!identity) {
    if (frameTimer) clearInterval(frameTimer);
    stopVisualSourceMediaStream(stream);
    throw new BoundedCaptureError("hud_surface_unavailable", "Capture identity is unavailable.");
  }
  const videoTracks = stream.getVideoTracks();
  for (const audioTrack of stream.getAudioTracks()) audioTrack.stop();
  stream = new MediaStream(videoTracks);

  const captureSessionId = `vse_capture_${crypto.randomUUID()}`;
  const clock = input.now ?? (() => new Date());
  const consentedAt = clock();
  const startedAt = clock();
  const startedWallMs = Date.now();
  const chunks: Blob[] = [];
  const surfaceReceipts: VisualSequenceCaptureMetadata["surface_receipts"] = [];
  let stopReason: VisualSequenceStopReason = "completed";
  let failure: BoundedCaptureError | null = null;
  let settled = false;
  const mimeType = recorderMimeType(Recorder);
  const recorder = new Recorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 2_000_000 } : { videoBitsPerSecond: 2_000_000 });

  const completion = new Promise<BoundedCaptureResult>((resolve, reject) => {
    const finish = () => {
      if (settled) return;
      settled = true;
      if (frameTimer) clearInterval(frameTimer);
      clearInterval(progressTimer);
      clearTimeout(limitTimer);
      stopVisualSourceMediaStream(stream);
      if (failure) return reject(failure);
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" });
      if (blob.size === 0) return reject(new BoundedCaptureError("protected_or_empty_capture", "The selected surface produced no recordable pixels."));
      const endedAt = clock();
      const recordedDurationMs = Math.min(durationMs, Math.max(1, Date.now() - startedWallMs));
      resolve({
        blob,
        metadata: {
          schema: HELIX_VISUAL_SEQUENCE_CAPTURE_SCHEMA,
          capture_session_id: captureSessionId,
          source_surface: input.surface,
          source_id: identity!.sourceId,
          producer_epoch: identity!.producerEpoch,
          profile_id: identity!.profileId,
          run_id: identity!.runId,
          thread_id: identity!.threadId,
          consented_at: consentedAt.toISOString(),
          content_cleared_at: consentedAt.toISOString(),
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          requested_duration_ms: durationMs,
          recorded_duration_ms: recordedDurationMs,
          stop_reason: stopReason,
          protected_content: false,
          sensitive_content: false,
          audio_captured: false,
          surface_receipts: surfaceReceipts,
        },
      });
    };
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => {
      failure = new BoundedCaptureError("recorder_failed", "The bounded recorder failed.");
      if (recorder.state !== "inactive") recorder.stop(); else finish();
    };
    recorder.onstop = finish;
  });

  const sampleReceipt = () => {
    const receipt = input.getHudReceipt?.();
    if (receipt && surfaceReceipts.at(-1)?.causal_hash !== receipt.causalHash) surfaceReceipts.push(captureReceipt(receipt, startedWallMs));
  };
  sampleReceipt();
  const progressTimer = setInterval(() => {
    const elapsed = Math.min(durationMs, Date.now() - startedWallMs);
    input.onProgress?.(elapsed);
    sampleReceipt();
    const currentIdentity = input.getIdentity?.();
    if (currentIdentity && (currentIdentity.sourceId !== identity!.sourceId
      || currentIdentity.producerEpoch !== identity!.producerEpoch
      || currentIdentity.profileId !== identity!.profileId
      || currentIdentity.runId !== identity!.runId
      || currentIdentity.threadId !== identity!.threadId)) {
      failure = new BoundedCaptureError("source_identity_changed", "The selected source identity or producer epoch changed during capture.");
      if (recorder.state !== "inactive") recorder.stop();
    }
  }, 200);
  const limitTimer = setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, durationMs);
  for (const track of stream.getVideoTracks()) {
    track.addEventListener("ended", () => {
      if (settled || recorder.state === "inactive") return;
      failure = new BoundedCaptureError("source_lost", "The selected capture source ended before completion.");
      recorder.stop();
    }, { once: true });
  }
  recorder.start(500);

  return {
    captureSessionId,
    startedAt: startedAt.toISOString(),
    completion,
    stop: () => {
      if (settled || recorder.state === "inactive") return;
      stopReason = "manual_stop";
      recorder.stop();
    },
    revoke: () => {
      if (settled || recorder.state === "inactive") return;
      failure = new BoundedCaptureError("source_lost", "Capture consent was revoked; no artifact was retained.");
      recorder.stop();
    },
  };
}
