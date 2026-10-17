export const VOICE_LEVEL_ATTACK_ALPHA = 0.55;
export const VOICE_LEVEL_RELEASE_ALPHA = 0.18;
export const VOICE_FLAT_SIGNAL_WINDOW_MS = 3000;
export const VOICE_FLAT_SIGNAL_VARIANCE_THRESHOLD = 0.0016;
export const VOICE_RECORDER_STALL_MS = 1200;
export const MIC_PLAYBACK_BARGE_START_MS_DESKTOP = 260;
export const MIC_PLAYBACK_BARGE_START_MS_DESKTOP_NOISY = 560;
export const MIC_PLAYBACK_BARGE_START_MS_MOBILE = 320;
export const MIC_PLAYBACK_BARGE_START_MS_MOBILE_NOISY = 680;
export const MIC_PLAYBACK_BARGE_MIN_SPEECH_PROBABILITY = 0.52;
export const MIC_PLAYBACK_BARGE_MIN_SPEECH_PROBABILITY_NOISY = 0.74;
export const MIC_PLAYBACK_BARGE_STRONG_SPEECH_PROBABILITY = 0.68;
export const MIC_PLAYBACK_BARGE_STRONG_SPEECH_PROBABILITY_NOISY = 0.86;
export const MIC_PLAYBACK_BARGE_MIN_SNR_DB = 8;
export const MIC_PLAYBACK_BARGE_MIN_SNR_DB_NOISY = 13;
export const MIC_PLAYBACK_BARGE_RMS_MULTIPLIER = 1.35;
export const MIC_PLAYBACK_BARGE_RMS_MULTIPLIER_NOISY = 1.75;
export const MIC_LEVEL_MIN_THRESHOLD = 0.008;
export const VOICE_LOCAL_AUDIO_GATE_MIN_SPEECH_PROBABILITY = 0.3;
export const VOICE_LOCAL_AUDIO_GATE_MIN_SPEECH_PROBABILITY_NOISY = 0.44;
export const VOICE_LOCAL_AUDIO_GATE_MIN_SNR_DB = 4.5;
export const VOICE_LOCAL_AUDIO_GATE_MIN_SNR_DB_NOISY = 8.5;
export const VOICE_LOCAL_AUDIO_GATE_MIN_DURATION_MS = 320;
export const VOICE_LOCAL_AUDIO_GATE_MIN_DURATION_MS_NOISY = 440;
export const VOICE_LOCAL_AUDIO_GATE_LOW_QUALITY_SPEECH_PROBABILITY = 0.42;
export const VOICE_LOCAL_AUDIO_GATE_LOW_QUALITY_SPEECH_PROBABILITY_NOISY = 0.56;
export const VOICE_LOCAL_AUDIO_GATE_LOW_QUALITY_SNR_DB = 7;
export const VOICE_LOCAL_AUDIO_GATE_LOW_QUALITY_SNR_DB_NOISY = 10.5;

const IOS_AUDIO_USER_AGENT_PATTERN = /(iphone|ipad|ipod)/i;
const DESKTOP_STYLE_APPLE_AUDIO_USER_AGENT_PATTERN = /macintosh/i;

export type VoiceNoiseHandlingProfile = {
  bargeStartMsDesktop: number;
  bargeStartMsMobile: number;
  bargeMinSpeechProbability: number;
  bargeStrongSpeechProbability: number;
  bargeMinSnrDb: number;
  bargeRmsMultiplier: number;
  localGateMinSpeechProbability: number;
  localGateMinSnrDb: number;
  localGateMinDurationMs: number;
  localGateLowQualitySpeechProbability: number;
  localGateLowQualitySnrDb: number;
};

export type VoiceSegmentLocalAnalysis = {
  speechProbability: number;
  snrDb: number;
  centroid: number;
  zcr: number;
  rmsDb: number;
  lowQuality: boolean;
};

export type VoiceSessionSpeakerProfile = {
  id: string;
  centroidMean: number;
  zcrMean: number;
  rmsDbMean: number;
  snrDbMean: number;
  sampleCount: number;
};

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clamp01 = (value: number): number => clampNumber(value, 0, 1);

export function smoothVoiceLevel(
  previous: number,
  nextRaw: number,
  attack = VOICE_LEVEL_ATTACK_ALPHA,
  release = VOICE_LEVEL_RELEASE_ALPHA,
): number {
  const prev = clamp01(previous);
  const next = clamp01(nextRaw);
  const alpha = clampNumber(next >= prev ? attack : release, 0, 1);
  return clamp01(prev + (next - prev) * alpha);
}

export function isFlatVoiceSignal(
  variance: number,
  elapsedMs: number,
  threshold = VOICE_FLAT_SIGNAL_VARIANCE_THRESHOLD,
  windowMs = VOICE_FLAT_SIGNAL_WINDOW_MS,
): boolean {
  return variance <= threshold && elapsedMs >= windowMs;
}

export function isRecorderStalled(params: {
  recorderActive: boolean;
  nowMs: number;
  recorderStartedAtMs: number | null;
  lastChunkAtMs: number | null;
  stallMs?: number;
}): boolean {
  const stallMs = params.stallMs ?? VOICE_RECORDER_STALL_MS;
  if (!params.recorderActive) return false;
  const referenceMs = params.lastChunkAtMs ?? params.recorderStartedAtMs;
  if (referenceMs === null) return false;
  return params.nowMs - referenceMs >= stallMs;
}

export function isLikelyLoopbackDeviceLabel(label: string): boolean {
  return /\b(output|loopback|stereo mix|vb-audio|voicemeeter|what u hear)\b/i.test(label.trim());
}

export function shouldPrimeSegmentWithContainerHeader(params: {
  segmentStartIndex: number;
  mimeType?: string | null;
  hasHeaderChunk: boolean;
}): boolean {
  if (!params.hasHeaderChunk) return false;
  if (params.segmentStartIndex <= 0) return false;
  const normalized = (params.mimeType ?? "").trim().toLowerCase();
  // WebM/Ogg slices can lose container init data and benefit from header priming.
  // MP4-family slices are more fragile when concatenated with a primed header.
  return normalized.includes("webm") || normalized.includes("ogg");
}

export function getMicRecorderMimeCandidates(userAgent?: string): string[] {
  const ua = (userAgent ?? "").trim().toLowerCase();
  const iosDesktopMode =
    DESKTOP_STYLE_APPLE_AUDIO_USER_AGENT_PATTERN.test(ua) &&
    /\bmobile\//i.test(ua) &&
    /\bsafari\b/i.test(ua);
  const iosLike = IOS_AUDIO_USER_AGENT_PATTERN.test(ua) || iosDesktopMode;
  const ordered = iosLike
    ? [
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ]
    : [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
  return [...new Set(ordered)];
}

export function pickSupportedMicRecorderMimeType(params: {
  userAgent?: string;
  isTypeSupported: (mimeType: string) => boolean;
}): string | undefined {
  const candidates = getMicRecorderMimeCandidates(params.userAgent);
  for (const mimeType of candidates) {
    try {
      if (params.isTypeSupported(mimeType)) {
        return mimeType;
      }
    } catch {
      // Keep probing later candidates when browser support checks throw.
    }
  }
  return undefined;
}

export function resolveVoiceNoiseHandlingProfile(noisyEnvironmentMode: boolean): VoiceNoiseHandlingProfile {
  if (noisyEnvironmentMode) {
    return {
      bargeStartMsDesktop: MIC_PLAYBACK_BARGE_START_MS_DESKTOP_NOISY,
      bargeStartMsMobile: MIC_PLAYBACK_BARGE_START_MS_MOBILE_NOISY,
      bargeMinSpeechProbability: MIC_PLAYBACK_BARGE_MIN_SPEECH_PROBABILITY_NOISY,
      bargeStrongSpeechProbability: MIC_PLAYBACK_BARGE_STRONG_SPEECH_PROBABILITY_NOISY,
      bargeMinSnrDb: MIC_PLAYBACK_BARGE_MIN_SNR_DB_NOISY,
      bargeRmsMultiplier: MIC_PLAYBACK_BARGE_RMS_MULTIPLIER_NOISY,
      localGateMinSpeechProbability: VOICE_LOCAL_AUDIO_GATE_MIN_SPEECH_PROBABILITY_NOISY,
      localGateMinSnrDb: VOICE_LOCAL_AUDIO_GATE_MIN_SNR_DB_NOISY,
      localGateMinDurationMs: VOICE_LOCAL_AUDIO_GATE_MIN_DURATION_MS_NOISY,
      localGateLowQualitySpeechProbability: VOICE_LOCAL_AUDIO_GATE_LOW_QUALITY_SPEECH_PROBABILITY_NOISY,
      localGateLowQualitySnrDb: VOICE_LOCAL_AUDIO_GATE_LOW_QUALITY_SNR_DB_NOISY,
    };
  }
  return {
    bargeStartMsDesktop: MIC_PLAYBACK_BARGE_START_MS_DESKTOP,
    bargeStartMsMobile: MIC_PLAYBACK_BARGE_START_MS_MOBILE,
    bargeMinSpeechProbability: MIC_PLAYBACK_BARGE_MIN_SPEECH_PROBABILITY,
    bargeStrongSpeechProbability: MIC_PLAYBACK_BARGE_STRONG_SPEECH_PROBABILITY,
    bargeMinSnrDb: MIC_PLAYBACK_BARGE_MIN_SNR_DB,
    bargeRmsMultiplier: MIC_PLAYBACK_BARGE_RMS_MULTIPLIER,
    localGateMinSpeechProbability: VOICE_LOCAL_AUDIO_GATE_MIN_SPEECH_PROBABILITY,
    localGateMinSnrDb: VOICE_LOCAL_AUDIO_GATE_MIN_SNR_DB,
    localGateMinDurationMs: VOICE_LOCAL_AUDIO_GATE_MIN_DURATION_MS,
    localGateLowQualitySpeechProbability: VOICE_LOCAL_AUDIO_GATE_LOW_QUALITY_SPEECH_PROBABILITY,
    localGateLowQualitySnrDb: VOICE_LOCAL_AUDIO_GATE_LOW_QUALITY_SNR_DB,
  };
}

export function isLowAudioQualitySignal(args: {
  speechProbability: number | null | undefined;
  snrDb: number | null | undefined;
  lowQualitySpeechProbability: number;
  lowQualitySnrDb: number;
}): boolean {
  return (
    (typeof args.speechProbability === "number" &&
      args.speechProbability < args.lowQualitySpeechProbability) ||
    (typeof args.snrDb === "number" && args.snrDb < args.lowQualitySnrDb)
  );
}

export function deriveVoiceSegmentLocalAnalysis(args: {
  sampleCount: number;
  speechProbabilitySum: number;
  snrDbSum: number;
  centroidSum: number;
  zcrSum: number;
  rmsDbSum: number;
  durationMs: number;
  minDurationMs?: number;
  minSpeechProbability?: number;
  minSnrDb?: number;
}): VoiceSegmentLocalAnalysis {
  if (args.sampleCount <= 0) {
    return {
      speechProbability: 0,
      snrDb: -20,
      centroid: 0,
      zcr: 0,
      rmsDb: -120,
      lowQuality: true,
    };
  }
  const speechProbability = clamp01(args.speechProbabilitySum / args.sampleCount);
  const snrDb = args.snrDbSum / args.sampleCount;
  const centroid = clamp01(args.centroidSum / args.sampleCount);
  const zcr = clamp01(args.zcrSum / args.sampleCount);
  const rmsDb = args.rmsDbSum / args.sampleCount;
  const minDurationMs = args.minDurationMs ?? VOICE_LOCAL_AUDIO_GATE_MIN_DURATION_MS;
  const minSpeechProbability = args.minSpeechProbability ?? VOICE_LOCAL_AUDIO_GATE_MIN_SPEECH_PROBABILITY;
  const minSnrDb = args.minSnrDb ?? VOICE_LOCAL_AUDIO_GATE_MIN_SNR_DB;
  const hardLowSignal =
    args.durationMs >= minDurationMs &&
    (speechProbability < minSpeechProbability || snrDb < minSnrDb);
  return {
    speechProbability,
    snrDb,
    centroid,
    zcr,
    rmsDb,
    lowQuality: hardLowSignal,
  };
}

export function resolveSpeakerFromSessionProfiles(args: {
  analysis: VoiceSegmentLocalAnalysis;
  profiles: VoiceSessionSpeakerProfile[];
  matchDistance?: number;
}): { speakerId: string; speakerConfidence: number; profileIndex: number } {
  const matchDistance = args.matchDistance ?? 0.42;
  const toVector = (profile: Pick<VoiceSessionSpeakerProfile, "centroidMean" | "zcrMean" | "rmsDbMean">) => ({
    centroid: profile.centroidMean,
    zcr: profile.zcrMean,
    rmsDbNorm: clamp01((profile.rmsDbMean + 80) / 80),
  });
  const analysisVector = {
    centroid: args.analysis.centroid,
    zcr: args.analysis.zcr,
    rmsDbNorm: clamp01((args.analysis.rmsDb + 80) / 80),
  };
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < args.profiles.length; index += 1) {
    const profile = args.profiles[index];
    const vector = toVector(profile);
    const distance = Math.sqrt(
      Math.pow(vector.centroid - analysisVector.centroid, 2) * 1.2 +
        Math.pow(vector.zcr - analysisVector.zcr, 2) * 0.9 +
        Math.pow(vector.rmsDbNorm - analysisVector.rmsDbNorm, 2),
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  if (bestIndex >= 0 && bestDistance <= matchDistance) {
    return {
      speakerId: args.profiles[bestIndex]!.id,
      speakerConfidence: clamp01(1 - bestDistance / matchDistance),
      profileIndex: bestIndex,
    };
  }
  return {
    speakerId: `speaker_${args.profiles.length + 1}`,
    speakerConfidence: 0.54,
    profileIndex: -1,
  };
}

export function shouldTreatMicSignalAsSpeech(args: {
  speakingNow: boolean;
  voiceOutputActive: boolean;
  localAudioGateActive: boolean;
  speechProbability: number;
  snrDb: number;
  rms: number;
  speechTriggerThreshold: number;
  bargeMinSpeechProbability?: number;
  bargeStrongSpeechProbability?: number;
  bargeMinSnrDb?: number;
  bargeRmsMultiplier?: number;
}): boolean {
  if (!args.speakingNow) return false;
  if (!args.voiceOutputActive || !args.localAudioGateActive) return true;
  const threshold = Math.max(args.speechTriggerThreshold, MIC_LEVEL_MIN_THRESHOLD);
  const bargeMinSpeechProbability = args.bargeMinSpeechProbability ?? MIC_PLAYBACK_BARGE_MIN_SPEECH_PROBABILITY;
  const bargeStrongSpeechProbability =
    args.bargeStrongSpeechProbability ?? MIC_PLAYBACK_BARGE_STRONG_SPEECH_PROBABILITY;
  const bargeMinSnrDb = args.bargeMinSnrDb ?? MIC_PLAYBACK_BARGE_MIN_SNR_DB;
  const bargeRmsMultiplier = args.bargeRmsMultiplier ?? MIC_PLAYBACK_BARGE_RMS_MULTIPLIER;
  const highProbability = args.speechProbability >= bargeMinSpeechProbability;
  const decisiveProbability = args.speechProbability >= bargeStrongSpeechProbability;
  const highSnr = args.snrDb >= bargeMinSnrDb;
  const strongAmplitude = args.rms >= threshold * bargeRmsMultiplier;
  const signalCount = Number(highProbability) + Number(highSnr) + Number(strongAmplitude);
  return decisiveProbability || signalCount >= 2;
}

export function describeMediaErrorCode(code: number | null): string {
  switch (code) {
    case 1:
      return "media_err_aborted";
    case 2:
      return "media_err_network";
    case 3:
      return "media_err_decode";
    case 4:
      return "media_err_src_not_supported";
    default:
      return "media_err_unknown";
  }
}
