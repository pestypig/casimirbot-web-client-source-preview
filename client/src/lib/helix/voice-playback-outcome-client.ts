import { hashVoiceUtteranceKey } from "@/lib/helix/ask-read-aloud-display";
import type {
  VoicePlaybackOutcomeReceipt,
  VoicePlaybackOutcomeStatus,
  VoicePlaybackLifecycleReceiptStatus,
} from "@/lib/helix/voice-capture-diagnostics";
import type {
  VoicePlaybackMetrics,
  VoicePlaybackCancelReason,
  VoicePlaybackUtteranceKind,
} from "@/lib/helix/voice-playback";

export type BuildVoicePlaybackOutcomeReceiptInput = {
  status: VoicePlaybackOutcomeStatus;
  playbackStatus?: VoicePlaybackLifecycleReceiptStatus | null;
  utteranceId: string;
  turnKey: string;
  sourceTurnId?: string | null;
  sourceTextHash?: string | null;
  kind: VoicePlaybackUtteranceKind;
  sourceReceiptId?: string | null;
  sourceReceiptKey?: string | null;
  requestId?: string | null;
  calloutKind?: string | null;
  metrics?: VoicePlaybackMetrics | null;
  cancelReason?: string | null;
  error?: string | null;
  chunkIndex?: number | null;
  chunkCount?: number | null;
  positionMs?: number | null;
  audioUnlocked: boolean;
  playbackPath?: VoicePlaybackOutcomeReceipt["playbackPath"];
  atMs?: number;
};

export function resolveVoicePlaybackOutcomeStatus(input: {
  override?: VoicePlaybackOutcomeStatus | null;
  cancelReason?: VoicePlaybackCancelReason | null;
}): VoicePlaybackOutcomeStatus {
  if (input.override) return input.override;
  if (input.cancelReason === null || input.cancelReason === undefined) return "delivered";
  if (input.cancelReason === "error") return "failed";
  return "cancelled";
}

export function resolveVoicePlaybackOutcomePlaybackStatus(
  status: VoicePlaybackOutcomeStatus,
): VoicePlaybackLifecycleReceiptStatus {
  if (status === "queued") return "queued";
  if (status === "delivered") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "failed" || status === "suppressed") return "failed";
  return "unknown";
}

export function buildVoicePlaybackOutcomeReceipt(
  input: BuildVoicePlaybackOutcomeReceiptInput,
): VoicePlaybackOutcomeReceipt {
  const atMs = input.atMs ?? Date.now();
  return {
    schema: "helix.voice_playback_outcome_receipt.v1",
    receiptId: `voice_playback_outcome:${hashVoiceUtteranceKey([
      input.utteranceId,
      input.status,
      input.sourceReceiptId ?? input.sourceReceiptKey ?? "",
      String(atMs),
    ].join(":"))}`,
    sourceReceiptId: input.sourceReceiptId ?? null,
    sourceReceiptKey: input.sourceReceiptKey ?? null,
    requestId: input.requestId ?? null,
    calloutKind: input.calloutKind ?? null,
    utteranceId: input.utteranceId,
    turnKey: input.turnKey,
    source_turn_id: input.sourceTurnId ?? input.turnKey,
    source_text_hash: input.sourceTextHash ?? null,
    kind: input.kind,
    status: input.status,
    playback_status: input.playbackStatus ?? resolveVoicePlaybackOutcomePlaybackStatus(input.status),
    chunk_index: typeof input.chunkIndex === "number" ? input.chunkIndex : null,
    chunk_count: typeof input.chunkCount === "number" ? input.chunkCount : null,
    position_ms: typeof input.positionMs === "number" ? input.positionMs : null,
    atMs,
    providerHeader: input.metrics?.providerHeader ?? null,
    profileHeader: input.metrics?.profileHeader ?? null,
    cacheHitCount: input.metrics?.cacheHitCount ?? null,
    cacheMissCount: input.metrics?.cacheMissCount ?? null,
    totalPlaybackMs: input.metrics?.totalPlaybackMs ?? null,
    cancelReason: input.cancelReason ?? input.metrics?.cancelReason ?? null,
    error: input.error ?? null,
    audioUnlocked: input.audioUnlocked,
    playbackPath: input.playbackPath ?? null,
    playbackLifecycle: input.metrics?.playbackLifecycle ?? null,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
    output_authority: "playback_observation",
  };
}

export function appendVoicePlaybackOutcomeReceipt(
  receipts: VoicePlaybackOutcomeReceipt[],
  receipt: VoicePlaybackOutcomeReceipt,
  maxReceipts = 80,
): VoicePlaybackOutcomeReceipt[] {
  const limit = Math.max(0, Math.floor(maxReceipts));
  if (limit === 0) return [];
  return [...receipts, receipt].slice(-limit);
}

export function postVoicePlaybackOutcomeReceipt(receipt: VoicePlaybackOutcomeReceipt): void {
  if (typeof fetch !== "function") return;
  if (!receipt.requestId && !receipt.sourceReceiptId) return;
  void fetch("/api/helix/live-environment/voice-playback/outcome", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      request_id: receipt.requestId,
      source_receipt_id: receipt.sourceReceiptId,
      utterance_id: receipt.utteranceId,
      status: receipt.status,
      playback_status: receipt.playback_status,
      source_turn_id: receipt.source_turn_id,
      source_text_hash: receipt.source_text_hash,
      chunk_index: receipt.chunk_index,
      chunk_count: receipt.chunk_count,
      position_ms: receipt.position_ms,
      message: receipt.error ?? receipt.cancelReason ?? null,
      provider: receipt.providerHeader ?? "helix_client_voice_playback",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      context_role: "tool_evidence",
    }),
    keepalive: true,
  }).catch(() => undefined);
}
