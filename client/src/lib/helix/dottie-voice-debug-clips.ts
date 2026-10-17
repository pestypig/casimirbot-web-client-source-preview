import type { HelixDottieVoiceReceiptV1 } from "@shared/helix-agent-commentary";

export const HELIX_DOTTIE_VOICE_DEBUG_CLIPS_EVENT = "helix:dottie-voice-debug-clips";

export type DottieVoiceDebugClip = {
  id: string;
  atMs: number;
  status: "proposed" | "suppressed";
  observerId: string;
  targetTurnId: string | null;
  sourceEventId: string;
  sourceEventSchema: string | null;
  voiceMode: string | null;
  spokenText: string | null;
  spokenTextHash: string | null;
  sourceTextHash: string | null;
  maxChars: number | null;
  spoken: boolean;
  assistantAnswer: false;
  authority: "witness_only";
  suppressionReason: string | null;
  receipt: Record<string, unknown>;
};

const MAX_DOTTIE_DEBUG_CLIPS = 80;

let dottieVoiceDebugClips: DottieVoiceDebugClip[] = [];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function notifyDottieVoiceDebugClips(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DottieVoiceDebugClip[]>(HELIX_DOTTIE_VOICE_DEBUG_CLIPS_EVENT, {
      detail: getDottieVoiceDebugClipsSnapshot(),
    }),
  );
}

export function recordDottieVoiceDebugClip(input: {
  receipt: HelixDottieVoiceReceiptV1 | Record<string, unknown>;
  voiceMode?: string | null;
  status?: "proposed" | "suppressed";
  suppressionReason?: string | null;
  atMs?: number;
}): DottieVoiceDebugClip {
  const receipt = asRecord(input.receipt) ?? {};
  const transform = asRecord(receipt.transform);
  const status = input.status ?? (asString(receipt.suppression_reason) ? "suppressed" : "proposed");
  const atMs = input.atMs ?? Date.now();
  const sourceEventId = asString(receipt.source_event_id) ?? "unknown";
  const observerId = asString(receipt.observer_id) ?? "observer:dottie:unassigned";
  const clip: DottieVoiceDebugClip = {
    id: `dottie-voice-debug:${atMs}:${dottieVoiceDebugClips.length}:${sourceEventId}`,
    atMs,
    status,
    observerId,
    targetTurnId: asString(receipt.target_turn_id),
    sourceEventId,
    sourceEventSchema: asString(receipt.source_event_schema),
    voiceMode: asString(input.voiceMode),
    spokenText: asString(receipt.spoken_text),
    spokenTextHash: asString(receipt.spoken_text_hash),
    sourceTextHash: asString(receipt.source_text_hash),
    maxChars: asNumber(transform?.max_chars),
    spoken: receipt.spoken === true,
    assistantAnswer: false,
    authority: "witness_only",
    suppressionReason: input.suppressionReason ?? asString(receipt.suppression_reason),
    receipt: { ...receipt },
  };
  dottieVoiceDebugClips = [...dottieVoiceDebugClips, clip].slice(-MAX_DOTTIE_DEBUG_CLIPS);
  notifyDottieVoiceDebugClips();
  return clip;
}

export function getDottieVoiceDebugClipsSnapshot(): DottieVoiceDebugClip[] {
  return [...dottieVoiceDebugClips];
}

export function subscribeDottieVoiceDebugClips(
  listener: (clips: DottieVoiceDebugClip[]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<DottieVoiceDebugClip[]>).detail;
    listener(Array.isArray(detail) ? detail : getDottieVoiceDebugClipsSnapshot());
  };
  window.addEventListener(HELIX_DOTTIE_VOICE_DEBUG_CLIPS_EVENT, handler as EventListener);
  return () => window.removeEventListener(HELIX_DOTTIE_VOICE_DEBUG_CLIPS_EVENT, handler as EventListener);
}

export function clearDottieVoiceDebugClips(): void {
  dottieVoiceDebugClips = [];
  notifyDottieVoiceDebugClips();
}

export function buildDottieVoiceDebugClipExport(clips = getDottieVoiceDebugClipsSnapshot()): string {
  return clips.map((clip) => JSON.stringify(clip)).join("\n");
}
