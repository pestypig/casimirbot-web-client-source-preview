export type VisualSourceKind = "screen" | "camera";

export type HelixVisualSourceKind = VisualSourceKind;

export type HelixVisualSourceOrigin =
  | "browser_getDisplayMedia"
  | "browser_getUserMedia";

export type HelixVisualSourceSurface =
  | "screen"
  | "window"
  | "browser_tab"
  | "camera";

export type HelixVisualSourceCameraFacingMode = "user" | "environment";

export type HelixVisualSourceRequestErrorCode =
  | "unsupported"
  | "permission_denied_or_cancelled"
  | "source_not_found"
  | "source_unavailable"
  | "constraints_unsatisfied"
  | "request_aborted"
  | "missing_video_track"
  | "request_failed";

export type HelixVisualSourceMediaDevices = {
  getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
  getUserMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
};

export type HelixVisualSourceCapabilities = {
  screen: {
    supported: boolean;
    displayAudioRequestSupported: boolean;
  };
  camera: {
    supported: boolean;
  };
};

export type HelixVisualSourceRequestInput = {
  kind: HelixVisualSourceKind;
  includeDisplayAudio?: boolean;
  displayAudioConstraints?: boolean | MediaTrackConstraints;
  cameraFacingMode?: HelixVisualSourceCameraFacingMode;
  cameraDeviceId?: string | null;
  /** Dependency injection for tests and non-window runtimes. Pass null to force unsupported. */
  mediaDevices?: HelixVisualSourceMediaDevices | null;
};

export type HelixVisualSourceRequestSuccess = {
  ok: true;
  kind: HelixVisualSourceKind;
  stream: MediaStream;
  videoTrack: MediaStreamTrack;
  sourceOrigin: HelixVisualSourceOrigin;
  surface: HelixVisualSourceSurface;
  displayAudioRequested: boolean;
  audioTrackAvailable: boolean;
};

export type HelixVisualSourceRequestFailure = {
  ok: false;
  kind: HelixVisualSourceKind;
  errorCode: HelixVisualSourceRequestErrorCode;
  message: string;
  browserErrorName: string | null;
};

export type HelixVisualSourceRequestResult =
  | HelixVisualSourceRequestSuccess
  | HelixVisualSourceRequestFailure;

export type AbortableVisualSourceAudioAttachmentInput<T> = {
  signal?: AbortSignal;
  register: () => Promise<void>;
  attach: () => Promise<T>;
  stopRegistered: () => void | Promise<unknown>;
  stopAttached: (attachment: T) => void | Promise<unknown>;
};

type DisplayTrackSettings = MediaTrackSettings & {
  displaySurface?: string;
};

const ERROR_MESSAGES: Record<HelixVisualSourceRequestErrorCode, string> = {
  unsupported: "This browser does not support the selected visual source.",
  permission_denied_or_cancelled: "Visual source permission was denied or the picker was cancelled.",
  source_not_found: "No matching visual source was found.",
  source_unavailable: "The selected visual source is already in use or could not be started.",
  constraints_unsatisfied: "The selected camera does not support the requested settings.",
  request_aborted: "The visual source request was interrupted.",
  missing_video_track: "The selected visual source did not provide a video track.",
  request_failed: "The visual source could not be started.",
};

const getDefaultMediaDevices = (): HelixVisualSourceMediaDevices | null => {
  if (typeof navigator === "undefined") return null;
  return navigator.mediaDevices ?? null;
};

const browserErrorName = (error: unknown): string | null => {
  if (!error || typeof error !== "object" || !("name" in error)) return null;
  const name = String((error as { name?: unknown }).name ?? "").trim();
  return name || null;
};

const classifyRequestError = (error: unknown): HelixVisualSourceRequestErrorCode => {
  switch (browserErrorName(error)) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "permission_denied_or_cancelled";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "source_not_found";
    case "NotReadableError":
    case "TrackStartError":
      return "source_unavailable";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "constraints_unsatisfied";
    case "AbortError":
      return "request_aborted";
    default:
      return "request_failed";
  }
};

const requestFailure = (
  kind: HelixVisualSourceKind,
  errorCode: HelixVisualSourceRequestErrorCode,
  error?: unknown,
): HelixVisualSourceRequestFailure => ({
  ok: false,
  kind,
  errorCode,
  message: ERROR_MESSAGES[errorCode],
  browserErrorName: browserErrorName(error),
});

export const getHelixVisualSourceCapabilities = (
  mediaDevices: HelixVisualSourceMediaDevices | null = getDefaultMediaDevices(),
): HelixVisualSourceCapabilities => {
  const screenSupported = typeof mediaDevices?.getDisplayMedia === "function";
  return {
    screen: {
      supported: screenSupported,
      // Browsers may still omit audio based on the selected surface or user choice.
      displayAudioRequestSupported: screenSupported,
    },
    camera: {
      supported: typeof mediaDevices?.getUserMedia === "function",
    },
  };
};

export const inferHelixVisualSourceSurface = (
  kind: HelixVisualSourceKind,
  videoTrack: Pick<MediaStreamTrack, "getSettings">,
): HelixVisualSourceSurface => {
  if (kind === "camera") return "camera";
  const settings = videoTrack.getSettings?.() as DisplayTrackSettings | undefined;
  switch (settings?.displaySurface?.trim().toLowerCase()) {
    case "browser":
      return "browser_tab";
    case "window":
    case "application":
      return "window";
    default:
      return "screen";
  }
};

/** Stops every track without letting one browser-specific stop failure block the rest. */
export const stopVisualSourceMediaStream = (stream: Pick<MediaStream, "getTracks"> | null | undefined): number => {
  let stoppedTrackCount = 0;
  for (const track of stream?.getTracks?.() ?? []) {
    try {
      track.stop();
      stoppedTrackCount += 1;
    } catch {
      // Continue so every remaining capture track still gets a stop attempt.
    }
  }
  return stoppedTrackCount;
};

const settleVisualSourceAudioCleanup = async (
  cleanup: () => void | Promise<unknown>,
): Promise<void> => {
  try {
    await cleanup();
  } catch {
    // Cancellation remains authoritative even if a best-effort cleanup receipt fails.
  }
};

/**
 * Preserves the visual-capture consent boundary across asynchronous audio
 * registration and recorder attachment. A cancellation that wins either race
 * compensates any remote registration and stops any late local attachment.
 */
export async function attachVisualSourceAudioWithCancellation<T>(
  input: AbortableVisualSourceAudioAttachmentInput<T>,
): Promise<T> {
  if (input.signal?.aborted) throw new Error("visual_capture_cancelled");

  try {
    await input.register();
  } catch (error) {
    if (!input.signal?.aborted) throw error;
    await settleVisualSourceAudioCleanup(input.stopRegistered);
    throw new Error("visual_capture_cancelled");
  }

  if (input.signal?.aborted) {
    await settleVisualSourceAudioCleanup(input.stopRegistered);
    throw new Error("visual_capture_cancelled");
  }

  let attachment: T;
  try {
    attachment = await input.attach();
  } catch (error) {
    if (!input.signal?.aborted) throw error;
    await settleVisualSourceAudioCleanup(input.stopRegistered);
    throw new Error("visual_capture_cancelled");
  }

  if (input.signal?.aborted) {
    await settleVisualSourceAudioCleanup(() => input.stopAttached(attachment));
    await settleVisualSourceAudioCleanup(input.stopRegistered);
    throw new Error("visual_capture_cancelled");
  }

  return attachment;
}

export async function requestVisualSourceMediaStream(
  input: HelixVisualSourceRequestInput,
): Promise<HelixVisualSourceRequestResult> {
  const mediaDevices = input.mediaDevices === undefined
    ? getDefaultMediaDevices()
    : input.mediaDevices;
  const capabilities = getHelixVisualSourceCapabilities(mediaDevices);
  if (!capabilities[input.kind].supported) {
    return requestFailure(input.kind, "unsupported");
  }

  let stream: MediaStream;
  try {
    if (input.kind === "screen") {
      stream = await mediaDevices!.getDisplayMedia!({
        video: true,
        audio: input.includeDisplayAudio === true
          ? input.displayAudioConstraints ?? true
          : false,
      });
    } else {
      const deviceId = input.cameraDeviceId?.trim() ?? "";
      const facingMode = input.cameraFacingMode;
      const video: boolean | MediaTrackConstraints = deviceId || facingMode
        ? {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            ...(facingMode ? { facingMode: { ideal: facingMode } } : {}),
          }
        : true;
      stream = await mediaDevices!.getUserMedia!({
        video,
        audio: false,
      });
    }
  } catch (error) {
    const errorCode = classifyRequestError(error);
    return requestFailure(input.kind, errorCode, error);
  }

  const videoTrack = stream.getVideoTracks()[0] ?? null;
  if (!videoTrack) {
    stopVisualSourceMediaStream(stream);
    return requestFailure(input.kind, "missing_video_track");
  }

  return {
    ok: true,
    kind: input.kind,
    stream,
    videoTrack,
    sourceOrigin: input.kind === "screen"
      ? "browser_getDisplayMedia"
      : "browser_getUserMedia",
    surface: inferHelixVisualSourceSurface(input.kind, videoTrack),
    displayAudioRequested: input.kind === "screen" && input.includeDisplayAudio === true,
    audioTrackAvailable: stream.getAudioTracks().length > 0,
  };
}

export const stopHelixVisualSourceStream = stopVisualSourceMediaStream;
export const requestHelixVisualSource = requestVisualSourceMediaStream;
