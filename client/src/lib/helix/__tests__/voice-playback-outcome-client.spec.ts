import { describe, expect, it, vi } from "vitest";
import type { VoicePlaybackOutcomeReceipt } from "../voice-capture-diagnostics";
import {
  appendVoicePlaybackOutcomeReceipt,
  buildVoicePlaybackOutcomeReceipt,
  postVoicePlaybackOutcomeReceipt,
  resolveVoicePlaybackOutcomeStatus,
} from "../voice-playback-outcome-client";

const buildReceipt = (overrides: Partial<VoicePlaybackOutcomeReceipt> = {}): VoicePlaybackOutcomeReceipt => ({
  schema: "helix.voice_playback_outcome_receipt.v1",
  receiptId: "voice_playback_outcome:test",
  sourceReceiptId: "helix_interim_voice_callout_receipt:test",
  sourceReceiptKey: "interim_voice:test",
  requestId: "helix_interim_voice_callout_request:test",
  calloutKind: "tool_result",
  utteranceId: "interim_voice:test",
  turnKey: "turn:test",
  source_turn_id: "turn:test",
  source_text_hash: "sha256:test-source",
  kind: "tool_receipt",
  status: "delivered",
  playback_status: "completed",
  chunk_index: null,
  chunk_count: null,
  position_ms: null,
  atMs: 1,
  providerHeader: "test_browser_voice_playback",
  profileHeader: null,
  cacheHitCount: null,
  cacheMissCount: null,
  totalPlaybackMs: 12,
  cancelReason: null,
  error: null,
  audioUnlocked: true,
  playbackPath: "audio_graph",
  playbackLifecycle: null,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
  output_authority: "playback_observation",
  ...overrides,
});

describe("voice playback outcome client", () => {
  it("resolves final playback outcome status from overrides and cancel reasons", () => {
    expect(resolveVoicePlaybackOutcomeStatus({
      override: null,
      cancelReason: null,
    })).toBe("delivered");
    expect(resolveVoicePlaybackOutcomeStatus({
      override: null,
      cancelReason: "error",
    })).toBe("failed");
    expect(resolveVoicePlaybackOutcomeStatus({
      override: null,
      cancelReason: "barge_in",
    })).toBe("cancelled");
    expect(resolveVoicePlaybackOutcomeStatus({
      override: "suppressed",
      cancelReason: null,
    })).toBe("suppressed");
  });

  it("builds governed non-terminal playback outcome receipts", () => {
    expect(buildVoicePlaybackOutcomeReceipt({
      status: "queued",
      utteranceId: "interim_voice:test",
      turnKey: "turn:test",
      kind: "tool_receipt",
      sourceReceiptId: "helix_interim_voice_callout_receipt:test",
      requestId: "helix_interim_voice_callout_request:test",
      calloutKind: "tool_result",
      sourceTurnId: "turn:test",
      sourceTextHash: "sha256:test-source",
      audioUnlocked: true,
      playbackPath: "audio_graph",
      chunkIndex: 0,
      chunkCount: 2,
      positionMs: 250,
      atMs: 123,
    })).toMatchObject({
      schema: "helix.voice_playback_outcome_receipt.v1",
      sourceReceiptId: "helix_interim_voice_callout_receipt:test",
      requestId: "helix_interim_voice_callout_request:test",
      calloutKind: "tool_result",
      utteranceId: "interim_voice:test",
      turnKey: "turn:test",
      source_turn_id: "turn:test",
      source_text_hash: "sha256:test-source",
      kind: "tool_receipt",
      status: "queued",
      playback_status: "queued",
      chunk_index: 0,
      chunk_count: 2,
      position_ms: 250,
      atMs: 123,
      audioUnlocked: true,
      playbackPath: "audio_graph",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      output_authority: "playback_observation",
    });
  });

  it("keeps the newest bounded playback outcome receipts", () => {
    const statuses: VoicePlaybackOutcomeReceipt["status"][] = ["queued", "delivered", "failed"];
    const receipts = statuses.map((status, index) =>
      buildReceipt({
        receiptId: `voice_playback_outcome:${status}`,
        status,
        atMs: index + 1,
      }),
    );

    const next = appendVoicePlaybackOutcomeReceipt(
      receipts.slice(0, 2),
      receipts[2]!,
      2,
    );

    expect(next.map((receipt) => receipt.receiptId)).toEqual([
      "voice_playback_outcome:delivered",
      "voice_playback_outcome:failed",
    ]);
  });

  it("posts non-terminal playback receipts to the live-environment evidence endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    postVoicePlaybackOutcomeReceipt(buildReceipt());
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/helix/live-environment/voice-playback/outcome",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        body: JSON.stringify({
          request_id: "helix_interim_voice_callout_request:test",
          source_receipt_id: "helix_interim_voice_callout_receipt:test",
          utterance_id: "interim_voice:test",
          status: "delivered",
          playback_status: "completed",
          source_turn_id: "turn:test",
          source_text_hash: "sha256:test-source",
          chunk_index: null,
          chunk_count: null,
          position_ms: null,
          message: null,
          provider: "test_browser_voice_playback",
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
          context_role: "tool_evidence",
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("does not post orphaned playback receipts without request or source receipt evidence", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    postVoicePlaybackOutcomeReceipt(buildReceipt({
      requestId: null,
      sourceReceiptId: null,
    }));

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
