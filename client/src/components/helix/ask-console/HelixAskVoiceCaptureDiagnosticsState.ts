import type {
  VoiceCaptureCheckpointSnapshot,
  VoiceCaptureDiagnosticsSnapshot,
  VoiceCaptureSegmentSnapshot,
  VoiceCaptureWarningCode,
} from "@/lib/helix/voice-capture-diagnostics";
import type { HelixAskVoiceCaptureHealthSnapshot } from "./HelixAskVoiceCaptureHealthState";

export type HelixAskVoiceCaptureDiagnosticsBaseState = Pick<
  VoiceCaptureDiagnosticsSnapshot,
  | "micArmState"
  | "voiceInputState"
  | "voiceSignalState"
  | "voiceMonitorLevel"
  | "voiceMonitorThreshold"
  | "voiceRecorderMimeType"
  | "voiceInputDeviceLabel"
  | "voiceTrackMuted"
  | "rmsRaw"
  | "rmsDb"
  | "peak"
  | "noiseFloor"
  | "chunksPerSecond"
  | "mediaChunkCount"
  | "mediaBytes"
  | "lastChunkAgeMs"
  | "lastRoundtripMs"
  | "warnings"
  | "checkpoints"
  | "segments"
  | "pendingConfirmation"
  | "voiceFeatureFlags"
>;

export type HelixAskVoiceCaptureDiagnosticsCheckpointInput = {
  key: string;
  status: VoiceCaptureCheckpointSnapshot["status"];
  message: string | null;
  lastAtMs: number | null;
};

export type HelixAskVoiceCaptureDiagnosticsSegmentInput = VoiceCaptureSegmentSnapshot;

export type HelixAskVoiceCaptureDiagnosticsPendingConfirmationInput = NonNullable<
  VoiceCaptureDiagnosticsSnapshot["pendingConfirmation"]
> & {
  confirmBlockReason?: string | null;
};

export type HelixAskVoiceCaptureDiagnosticsBaseStateOptions = {
  micArmState: VoiceCaptureDiagnosticsSnapshot["micArmState"];
  voiceInputState: VoiceCaptureDiagnosticsSnapshot["voiceInputState"];
  voiceSignalState: VoiceCaptureDiagnosticsSnapshot["voiceSignalState"];
  voiceMonitorLevel: number;
  voiceMonitorThreshold: number;
  voiceRecorderMimeType: string | null;
  voiceInputDeviceLabel: string | null;
  voiceTrackMuted: boolean;
  voiceCaptureHealth: HelixAskVoiceCaptureHealthSnapshot;
  warnings: VoiceCaptureWarningCode[];
  checkpointList: HelixAskVoiceCaptureDiagnosticsCheckpointInput[];
  checkpointLabels: Record<string, string>;
  segments: HelixAskVoiceCaptureDiagnosticsSegmentInput[];
  pendingConfirmation: HelixAskVoiceCaptureDiagnosticsPendingConfirmationInput | null;
  voiceFeatureFlags: NonNullable<VoiceCaptureDiagnosticsSnapshot["voiceFeatureFlags"]>;
};

export function buildHelixAskVoiceCaptureDiagnosticsBaseState({
  micArmState,
  voiceInputState,
  voiceSignalState,
  voiceMonitorLevel,
  voiceMonitorThreshold,
  voiceRecorderMimeType,
  voiceInputDeviceLabel,
  voiceTrackMuted,
  voiceCaptureHealth,
  warnings,
  checkpointList,
  checkpointLabels,
  segments,
  pendingConfirmation,
  voiceFeatureFlags,
}: HelixAskVoiceCaptureDiagnosticsBaseStateOptions): HelixAskVoiceCaptureDiagnosticsBaseState {
  return {
    micArmState,
    voiceInputState,
    voiceSignalState,
    voiceMonitorLevel,
    voiceMonitorThreshold,
    voiceRecorderMimeType,
    voiceInputDeviceLabel,
    voiceTrackMuted,
    rmsRaw: voiceCaptureHealth.rmsRaw,
    rmsDb: voiceCaptureHealth.rmsDb,
    peak: voiceCaptureHealth.peak,
    noiseFloor: voiceCaptureHealth.noiseFloor,
    chunksPerSecond: voiceCaptureHealth.chunksPerSecond,
    mediaChunkCount: voiceCaptureHealth.mediaChunkCount,
    mediaBytes: voiceCaptureHealth.mediaBytes,
    lastChunkAgeMs: voiceCaptureHealth.lastChunkAgeMs,
    lastRoundtripMs: voiceCaptureHealth.lastRoundtripMs,
    warnings: [...warnings],
    checkpoints: checkpointList.map((checkpoint) => ({
      key: checkpoint.key,
      label: checkpointLabels[checkpoint.key] ?? checkpoint.key,
      status: checkpoint.status,
      message: checkpoint.message,
      lastAtMs: checkpoint.lastAtMs,
    })),
    segments: segments.map((segment) => ({
      id: segment.id,
      cutAtMs: segment.cutAtMs,
      durationMs: segment.durationMs,
      status: segment.status,
      sttLatencyMs: segment.sttLatencyMs,
      transcriptPreview: segment.transcriptPreview,
      translated: segment.translated,
      dispatch: segment.dispatch,
      engine: segment.engine,
      error: segment.error,
      speakerId: segment.speakerId ?? null,
      speakerConfidence: segment.speakerConfidence ?? null,
      speechProbability: segment.speechProbability ?? null,
      snrDb: segment.snrDb ?? null,
      confirmAutoEligible: segment.confirmAutoEligible ?? null,
      confirmBlockReason: segment.confirmBlockReason ?? null,
    })),
    pendingConfirmation: pendingConfirmation
      ? {
          dispatchState: pendingConfirmation.dispatchState ?? null,
          needsConfirmation: true,
          pivotConfidence:
            typeof pendingConfirmation.pivotConfidence === "number"
              ? pendingConfirmation.pivotConfidence
              : null,
          speechProbability:
            typeof pendingConfirmation.speechProbability === "number"
              ? pendingConfirmation.speechProbability
              : null,
          snrDb: typeof pendingConfirmation.snrDb === "number" ? pendingConfirmation.snrDb : null,
          speakerId: pendingConfirmation.speakerId ?? null,
          speakerConfidence:
            typeof pendingConfirmation.speakerConfidence === "number"
              ? pendingConfirmation.speakerConfidence
              : null,
          confirmAutoEligible:
            typeof pendingConfirmation.confirmAutoEligible === "boolean"
              ? pendingConfirmation.confirmAutoEligible
              : null,
          confirmBlockReason: pendingConfirmation.confirmBlockReason ?? null,
        }
      : null,
    voiceFeatureFlags,
  };
}
