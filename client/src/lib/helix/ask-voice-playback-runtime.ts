import { readHelixEnvOneFlag } from "./ask-env-config";

const MOBILE_AUDIO_USER_AGENT_PATTERN =
  /(iphone|ipad|ipod|android|mobile|silk|kindle|fennec|iemobile|opera mini)/i;
const IOS_AUDIO_USER_AGENT_PATTERN = /(iphone|ipad|ipod)/i;
const DESKTOP_STYLE_APPLE_AUDIO_USER_AGENT_PATTERN = /macintosh/i;
const HELIX_VOICE_PLAYBACK_GAIN_DESKTOP = 1.15;
const HELIX_VOICE_PLAYBACK_GAIN_MOBILE = 3.6;
const HELIX_VOICE_PLAYBACK_GAIN_IOS = 5.0;

export const HELIX_VOICE_FORCE_DIRECT_MOBILE = readHelixEnvOneFlag(
  (import.meta as any)?.env,
  "VITE_HELIX_VOICE_FORCE_DIRECT_MOBILE",
  false,
);

export function isLikelyIOSDesktopModeUserAgent(userAgent?: string): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua) return false;
  if (!DESKTOP_STYLE_APPLE_AUDIO_USER_AGENT_PATTERN.test(ua)) return false;
  if (typeof navigator === "undefined") return false;
  const touchPoints = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
  return touchPoints > 1;
}

export function isLikelyMobileAudioUserAgent(userAgent?: string): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua) return false;
  return MOBILE_AUDIO_USER_AGENT_PATTERN.test(ua) || isLikelyIOSDesktopModeUserAgent(ua);
}

export function resolveVoicePlaybackGain(userAgent?: string): number {
  const ua = (userAgent ?? "").trim();
  if (!ua) return HELIX_VOICE_PLAYBACK_GAIN_DESKTOP;
  if (isLikelyIOSDesktopModeUserAgent(ua)) return HELIX_VOICE_PLAYBACK_GAIN_IOS;
  if (IOS_AUDIO_USER_AGENT_PATTERN.test(ua)) return HELIX_VOICE_PLAYBACK_GAIN_IOS;
  if (isLikelyMobileAudioUserAgent(ua)) return HELIX_VOICE_PLAYBACK_GAIN_MOBILE;
  return HELIX_VOICE_PLAYBACK_GAIN_DESKTOP;
}

export function shouldUseVoicePlaybackAudioGraph(userAgent?: string): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua) return true;
  if (isLikelyMobileAudioUserAgent(ua)) {
    return !HELIX_VOICE_FORCE_DIRECT_MOBILE;
  }
  return true;
}

export function resolveVoicePlaybackAttemptPath(params: {
  graphAttached: boolean;
  directFallbackAttempted: boolean;
}): "audio_graph" | "direct_fallback" | "direct_element" {
  if (params.graphAttached) return "audio_graph";
  return params.directFallbackAttempted ? "direct_fallback" : "direct_element";
}

export function shouldBypassVoicePlaybackGraph(params: {
  bypassUntilMs: number | null;
  nowMs: number;
}): boolean {
  if (params.bypassUntilMs === null) return false;
  return params.nowMs < params.bypassUntilMs;
}

export function isActivePlayback(audio: HTMLAudioElement | null, active: HTMLAudioElement): boolean {
  return audio === active;
}
