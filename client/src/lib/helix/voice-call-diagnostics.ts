export type VoiceCallDiagnosticKind = "speak" | "transcribe";

export type VoiceCallDiagnosticSnapshot = {
  id: string;
  kind: VoiceCallDiagnosticKind;
  endpoint: "/api/voice/speak" | "/api/voice/transcribe";
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  ok: boolean;
  status: number | null;
  responseKind: "audio" | "json" | "error";
  contentType: string | null;
  traceId: string | null;
  missionId: string | null;
  eventId?: string | null;
  utteranceId?: string | null;
  turnKey?: string | null;
  mode?: string | null;
  priority?: string | null;
  providerHeader?: string | null;
  profileHeader?: string | null;
  cacheHeader?: "hit" | "miss" | "stream" | null;
  textLength?: number | null;
  textHash?: string | null;
  audioBytes?: number | null;
  audioMimeType?: string | null;
  audioDurationMs?: number | null;
  error?: string | null;
};

export const HELIX_VOICE_CALL_DIAGNOSTICS_EVENT = "helix:voice-call-diagnostics";

const VOICE_CALL_DIAGNOSTICS_LIMIT = 120;
let lastVoiceCallDiagnostics: VoiceCallDiagnosticSnapshot[] = [];

function trimVoiceCallDiagnostics(
  entries: VoiceCallDiagnosticSnapshot[],
): VoiceCallDiagnosticSnapshot[] {
  return entries.slice(-VOICE_CALL_DIAGNOSTICS_LIMIT);
}

export function hashVoiceDiagnosticText(source: unknown): string | null {
  if (typeof source !== "string") return null;
  const normalized = source.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function recordVoiceCallDiagnostic(entry: VoiceCallDiagnosticSnapshot): void {
  lastVoiceCallDiagnostics = trimVoiceCallDiagnostics([...lastVoiceCallDiagnostics, entry]);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<VoiceCallDiagnosticSnapshot[]>(HELIX_VOICE_CALL_DIAGNOSTICS_EVENT, {
      detail: lastVoiceCallDiagnostics,
    }),
  );
}

export function getVoiceCallDiagnosticsSnapshot(): VoiceCallDiagnosticSnapshot[] {
  return [...lastVoiceCallDiagnostics];
}

export function clearVoiceCallDiagnosticsSnapshot(): void {
  lastVoiceCallDiagnostics = [];
}

export function subscribeVoiceCallDiagnostics(
  listener: (snapshot: VoiceCallDiagnosticSnapshot[]) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<VoiceCallDiagnosticSnapshot[]>).detail;
    if (!Array.isArray(detail)) return;
    listener([...detail]);
  };
  window.addEventListener(HELIX_VOICE_CALL_DIAGNOSTICS_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(HELIX_VOICE_CALL_DIAGNOSTICS_EVENT, handler as EventListener);
  };
}
