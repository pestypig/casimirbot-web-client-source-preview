import { describe, expect, it } from "vitest";
import {
  deriveVoiceSegmentLocalAnalysis,
  describeMediaErrorCode,
  getMicRecorderMimeCandidates,
  isFlatVoiceSignal,
  isLikelyLoopbackDeviceLabel,
  isLowAudioQualitySignal,
  isRecorderStalled,
  pickSupportedMicRecorderMimeType,
  resolveSpeakerFromSessionProfiles,
  resolveVoiceNoiseHandlingProfile,
  shouldPrimeSegmentWithContainerHeader,
  shouldTreatMicSignalAsSpeech,
  smoothVoiceLevel,
} from "../ask-voice-capture-display";

describe("ask voice capture display helpers", () => {
  it("smooths level meter values with deterministic attack and release behavior", () => {
    const attacked = smoothVoiceLevel(0.1, 0.9);
    const released = smoothVoiceLevel(0.9, 0.1);

    expect(attacked).toBeGreaterThan(0.5);
    expect(released).toBeLessThan(0.8);
    expect(released).toBeGreaterThan(0.1);
    expect(smoothVoiceLevel(-1, 2, 2, -1)).toBe(1);
  });

  it("detects flat signals and recorder stalls from explicit measurements", () => {
    expect(isFlatVoiceSignal(0.001, 3050)).toBe(true);
    expect(isFlatVoiceSignal(0.003, 3050)).toBe(false);
    expect(isFlatVoiceSignal(0.001, 1200)).toBe(false);
    expect(
      isRecorderStalled({
        recorderActive: true,
        nowMs: 4200,
        recorderStartedAtMs: 0,
        lastChunkAtMs: 2500,
      }),
    ).toBe(true);
    expect(
      isRecorderStalled({
        recorderActive: false,
        nowMs: 4200,
        recorderStartedAtMs: 0,
        lastChunkAtMs: 2500,
      }),
    ).toBe(false);
    expect(
      isRecorderStalled({
        recorderActive: true,
        nowMs: 4200,
        recorderStartedAtMs: null,
        lastChunkAtMs: null,
      }),
    ).toBe(false);
  });

  it("classifies loopback labels and container-header priming without browser APIs", () => {
    expect(isLikelyLoopbackDeviceLabel("VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)")).toBe(true);
    expect(isLikelyLoopbackDeviceLabel("Stereo Mix (Realtek)")).toBe(true);
    expect(isLikelyLoopbackDeviceLabel("USB Microphone")).toBe(false);
    expect(
      shouldPrimeSegmentWithContainerHeader({
        segmentStartIndex: 4,
        mimeType: "audio/webm;codecs=opus",
        hasHeaderChunk: true,
      }),
    ).toBe(true);
    expect(
      shouldPrimeSegmentWithContainerHeader({
        segmentStartIndex: 4,
        mimeType: "audio/ogg",
        hasHeaderChunk: true,
      }),
    ).toBe(true);
    expect(
      shouldPrimeSegmentWithContainerHeader({
        segmentStartIndex: 4,
        mimeType: "audio/mp4",
        hasHeaderChunk: true,
      }),
    ).toBe(false);
  });

  it("orders mic recorder MIME candidates from explicit user agent strings", () => {
    const iosUa =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
    const desktopUa =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36";
    const desktopModeIosUa =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

    expect(getMicRecorderMimeCandidates(iosUa)[0]).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(getMicRecorderMimeCandidates(desktopModeIosUa)[0]).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(getMicRecorderMimeCandidates(desktopUa)[0]).toBe("audio/webm;codecs=opus");
    expect(new Set(getMicRecorderMimeCandidates(desktopUa)).size).toBe(getMicRecorderMimeCandidates(desktopUa).length);
  });

  it("selects the first supported recorder MIME type and continues after support-check errors", () => {
    const iosUa =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
    const checked: string[] = [];

    expect(
      pickSupportedMicRecorderMimeType({
        userAgent: iosUa,
        isTypeSupported: (mimeType) => {
          checked.push(mimeType);
          if (mimeType === "audio/mp4;codecs=mp4a.40.2") {
            throw new Error("unsupported probe");
          }
          return mimeType === "audio/webm;codecs=opus";
        },
      }),
    ).toBe("audio/webm;codecs=opus");
    expect(checked).toEqual([
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/webm;codecs=opus",
    ]);
    expect(
      pickSupportedMicRecorderMimeType({
        userAgent: iosUa,
        isTypeSupported: () => false,
      }),
    ).toBeUndefined();
  });

  it("resolves noisy-environment thresholds and low-quality signal flags deterministically", () => {
    const normal = resolveVoiceNoiseHandlingProfile(false);
    const noisy = resolveVoiceNoiseHandlingProfile(true);

    expect(noisy.bargeStartMsDesktop).toBeGreaterThan(normal.bargeStartMsDesktop);
    expect(noisy.bargeMinSpeechProbability).toBeGreaterThan(normal.bargeMinSpeechProbability);
    expect(noisy.localGateMinDurationMs).toBeGreaterThan(normal.localGateMinDurationMs);
    expect(
      isLowAudioQualitySignal({
        speechProbability: noisy.localGateLowQualitySpeechProbability - 0.01,
        snrDb: noisy.localGateLowQualitySnrDb + 5,
        lowQualitySpeechProbability: noisy.localGateLowQualitySpeechProbability,
        lowQualitySnrDb: noisy.localGateLowQualitySnrDb,
      }),
    ).toBe(true);
    expect(
      isLowAudioQualitySignal({
        speechProbability: noisy.localGateLowQualitySpeechProbability + 0.01,
        snrDb: noisy.localGateLowQualitySnrDb + 5,
        lowQualitySpeechProbability: noisy.localGateLowQualitySpeechProbability,
        lowQualitySnrDb: noisy.localGateLowQualitySnrDb,
      }),
    ).toBe(false);
  });

  it("derives local segment analysis from numeric accumulators", () => {
    expect(
      deriveVoiceSegmentLocalAnalysis({
        sampleCount: 0,
        speechProbabilitySum: 0,
        snrDbSum: 0,
        centroidSum: 0,
        zcrSum: 0,
        rmsDbSum: 0,
        durationMs: 500,
      }),
    ).toMatchObject({
      speechProbability: 0,
      snrDb: -20,
      lowQuality: true,
    });
    expect(
      deriveVoiceSegmentLocalAnalysis({
        sampleCount: 2,
        speechProbabilitySum: 1.6,
        snrDbSum: 18,
        centroidSum: 1,
        zcrSum: 0.4,
        rmsDbSum: -70,
        durationMs: 500,
      }),
    ).toEqual({
      speechProbability: 0.8,
      snrDb: 9,
      centroid: 0.5,
      zcr: 0.2,
      rmsDb: -35,
      lowQuality: false,
    });
    expect(
      deriveVoiceSegmentLocalAnalysis({
        sampleCount: 2,
        speechProbabilitySum: 0.2,
        snrDbSum: 4,
        centroidSum: 1,
        zcrSum: 0.4,
        rmsDbSum: -70,
        durationMs: 500,
      }).lowQuality,
    ).toBe(true);
  });

  it("resolves speaker profiles from segment analysis without profile state mutation", () => {
    const profiles = [
      { id: "speaker_a", sampleCount: 4, centroidMean: 0.2, zcrMean: 0.1, rmsDbMean: -45, snrDbMean: 8 },
      { id: "speaker_b", sampleCount: 4, centroidMean: 0.72, zcrMean: 0.34, rmsDbMean: -30, snrDbMean: 12 },
    ];
    expect(
      resolveSpeakerFromSessionProfiles({
        analysis: {
          speechProbability: 0.9,
          snrDb: 11,
          centroid: 0.7,
          zcr: 0.35,
          rmsDb: -31,
          lowQuality: false,
        },
        profiles,
      }),
    ).toMatchObject({
      speakerId: "speaker_b",
      profileIndex: 1,
    });
    expect(
      resolveSpeakerFromSessionProfiles({
        analysis: {
          speechProbability: 0.9,
          snrDb: 20,
          centroid: 0.95,
          zcr: 0.95,
          rmsDb: -5,
          lowQuality: false,
        },
        profiles,
        matchDistance: 0.05,
      }),
    ).toEqual({
      speakerId: "speaker_3",
      speakerConfidence: 0.54,
      profileIndex: -1,
    });
  });

  it("describes media error codes as stable debug labels", () => {
    expect(describeMediaErrorCode(1)).toBe("media_err_aborted");
    expect(describeMediaErrorCode(2)).toBe("media_err_network");
    expect(describeMediaErrorCode(3)).toBe("media_err_decode");
    expect(describeMediaErrorCode(4)).toBe("media_err_src_not_supported");
    expect(describeMediaErrorCode(null)).toBe("media_err_unknown");
    expect(describeMediaErrorCode(99)).toBe("media_err_unknown");
  });

  it("qualifies barge-in speech without browser or queue state", () => {
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
        localAudioGateActive: true,
        speechProbability: 0.72,
        snrDb: 9.1,
        rms: 0.03,
        speechTriggerThreshold: 0.018,
      }),
    ).toBe(true);
  });
});
