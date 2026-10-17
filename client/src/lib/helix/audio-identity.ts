import {
  resolveHelixSpeakerColorToken,
  type HelixAudioIdentityResult,
  type HelixAudioIdentitySessionSnapshot,
  type HelixSpeakerAuthority,
  type HelixSpeakerAuthoritySource,
  type HelixSpeakerColorToken,
  type HelixSpeakerLabel,
  type HelixSpeakerSegment,
} from "@shared/helix-audio-identity";

export type {
  HelixAudioIdentityResult,
  HelixAudioIdentitySessionSnapshot,
  HelixSpeakerAuthority,
  HelixSpeakerAuthoritySource,
  HelixSpeakerLabel,
  HelixSpeakerSegment,
};

export type TrustSpeakerInAudioIdentitySessionPayload = {
  session_id?: string;
  audio_identity_session_id?: string;
  capture_session_id?: string;
  room_id?: string;
  thread_id?: string;
  speaker_id: string;
  display_name?: string;
  role?: "owner" | "trusted_guest" | "guest";
  authority?: HelixSpeakerAuthority;
  confidence?: number;
};

type SpeakerSessionResponse = {
  ok?: boolean;
  session?: HelixAudioIdentitySessionSnapshot | null;
  error?: string;
  message?: string;
};

export const SPEAKER_COLOR_TOKEN_CLASS: Record<string, string> = {
  "speaker-blue": "bg-blue-500",
  "speaker-gold": "bg-amber-400",
  "speaker-green": "bg-emerald-500",
  "speaker-rose": "bg-rose-500",
  "speaker-violet": "bg-violet-500",
  "speaker-cyan": "bg-cyan-500",
  "speaker-slate": "bg-slate-500",
  "speaker-gray": "bg-zinc-500",
};

export const SPEAKER_COLOR_TOKEN_TEXT_CLASS: Record<string, string> = {
  "speaker-blue": "border-blue-500/40 bg-blue-500/10 text-blue-100",
  "speaker-gold": "border-amber-400/40 bg-amber-400/10 text-amber-100",
  "speaker-green": "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  "speaker-rose": "border-rose-500/40 bg-rose-500/10 text-rose-100",
  "speaker-violet": "border-violet-500/40 bg-violet-500/10 text-violet-100",
  "speaker-cyan": "border-cyan-500/40 bg-cyan-500/10 text-cyan-100",
  "speaker-slate": "border-slate-500/40 bg-slate-500/10 text-slate-100",
  "speaker-gray": "border-zinc-500/40 bg-zinc-500/10 text-zinc-100",
};

export const getSpeakerColorToken = (
  roomId: string | null | undefined,
  speakerId: string,
  preferred?: HelixSpeakerColorToken | null,
): HelixSpeakerColorToken => preferred || resolveHelixSpeakerColorToken(roomId, speakerId);

export const getSpeakerDotClassName = (token: HelixSpeakerColorToken | null | undefined): string =>
  SPEAKER_COLOR_TOKEN_CLASS[token ?? ""] ?? SPEAKER_COLOR_TOKEN_CLASS["speaker-gray"];

export const getSpeakerChipClassName = (token: HelixSpeakerColorToken | null | undefined): string =>
  SPEAKER_COLOR_TOKEN_TEXT_CLASS[token ?? ""] ?? SPEAKER_COLOR_TOKEN_TEXT_CLASS["speaker-gray"];

export const labelForSpeakerAuthority = (authority: HelixSpeakerAuthority): string => {
  if (authority === "command_allowed") return "command allowed";
  if (authority === "command_confirm") return "command confirm";
  if (authority === "ignored") return "ignored";
  return "transcribe only";
};

export const speakerById = (
  identity: HelixAudioIdentityResult | null | undefined,
): Map<string, HelixSpeakerLabel> => {
  const speakers = new Map<string, HelixSpeakerLabel>();
  for (const speaker of identity?.speakers ?? []) {
    speakers.set(speaker.speaker_id, speaker);
  }
  return speakers;
};

export async function trustSpeakerInAudioIdentitySession(
  payload: TrustSpeakerInAudioIdentitySessionPayload,
): Promise<HelixAudioIdentitySessionSnapshot> {
  const response = await fetch("/api/voice/speaker-session/trust", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = (await response.json()) as SpeakerSessionResponse;
  if (!response.ok || !result.session) {
    throw new Error(result.message || result.error || "Unable to trust speaker in audio identity session.");
  }
  return result.session;
}

export async function getAudioIdentitySession(
  sessionId: string,
): Promise<HelixAudioIdentitySessionSnapshot | null> {
  const response = await fetch(`/api/voice/speaker-session/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  const result = (await response.json()) as SpeakerSessionResponse;
  if (!response.ok) {
    throw new Error(result.message || result.error || "Unable to load audio identity session.");
  }
  return result.session ?? null;
}
