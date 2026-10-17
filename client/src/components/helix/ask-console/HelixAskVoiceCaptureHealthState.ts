import type { VoiceCaptureWarningCode } from "@/lib/helix/voice-capture-diagnostics";

export type HelixAskVoiceCaptureHealthSnapshot = {
  rmsRaw: number;
  rmsDb: number;
  peak: number;
  noiseFloor: number;
  displayLevel: number;
  mediaChunkCount: number;
  mediaBytes: number;
  chunksPerSecond: number;
  lastChunkAgeMs: number | null;
  warnings: VoiceCaptureWarningCode[];
  pipelineStatus: "idle" | "active" | "attention";
  lastRoundtripMs: number | null;
};

export type HelixAskVoiceCaptureHealthStateOptions = {
  micArmState: "off" | "on";
  nowMs: number;
  meterStats: {
    rmsRaw: number;
    rmsDb: number;
    peak: number;
    noiseFloor: number;
    displayLevel: number;
  };
  recorderStats: {
    mediaChunkCount: number;
    mediaBytes: number;
    lastChunkAtMs: number | null;
    chunksPerSecond: number;
  };
  warnings: VoiceCaptureWarningCode[];
  checkpointList: Array<{
    status: "idle" | "ok" | "warn" | "error";
  }>;
  lastRoundtripMs: number | null;
};

export function buildHelixAskVoiceCaptureHealthState({
  micArmState,
  nowMs,
  meterStats,
  recorderStats,
  warnings,
  checkpointList,
  lastRoundtripMs,
}: HelixAskVoiceCaptureHealthStateOptions): HelixAskVoiceCaptureHealthSnapshot {
  const lastChunkAgeMs =
    recorderStats.lastChunkAtMs !== null ? Math.max(0, nowMs - recorderStats.lastChunkAtMs) : null;
  const hasWarningCheckpoint = checkpointList.some(
    (checkpoint) => checkpoint.status === "warn" || checkpoint.status === "error",
  );
  const pipelineStatus =
    micArmState === "off" ? "idle" : warnings.length > 0 || hasWarningCheckpoint ? "attention" : "active";
  return {
    rmsRaw: meterStats.rmsRaw,
    rmsDb: meterStats.rmsDb,
    peak: meterStats.peak,
    noiseFloor: meterStats.noiseFloor,
    displayLevel: meterStats.displayLevel,
    mediaChunkCount: recorderStats.mediaChunkCount,
    mediaBytes: recorderStats.mediaBytes,
    chunksPerSecond: recorderStats.chunksPerSecond,
    lastChunkAgeMs,
    warnings,
    pipelineStatus,
    lastRoundtripMs,
  };
}
