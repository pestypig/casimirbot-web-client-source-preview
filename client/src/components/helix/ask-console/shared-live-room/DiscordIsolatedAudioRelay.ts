const MAX_PCM_BYTES = 12_000 / 20 * 960 * 2 * 2;
const CHUNK_BYTES = 7_680;
const MAX_TRANSFER_MS = 15_000;
const HEX64 = /^[0-9a-f]{64}$/u;
const SEGMENT = /^segment:[0-9a-f]{64}$/u;
const ALLOWANCE = /^stt_allowance:[0-9a-f-]{36}$/u;
const RESERVATION = /^stt-reservation:[0-9a-f]{64}$/u;
const USER = /^\d{15,22}$/u;

export type IsolatedAudioReceipt = Readonly<{
  roomId: string; invitationId: string; workerId: string;
  realtimeSessionId: string; providerCallRef: string;
  discordUserId: string; segmentId: string;
  allowanceId: string; reservationId: string; reservationExpiresAtMs: number;
  startedAtMs: number; endedAtMs: number; pcm: Uint8Array;
}>;

type Pending = Omit<IsolatedAudioReceipt, "pcm"> & {
  pcm: Uint8Array; pcmSha256: string; offset: number; openedAtMs: number;
};

type ExpectedBridge = Readonly<{
  roomId: string; invitationId: string; realtimeSessionId: string;
  providerCallRef: string;
}>;

const value = (raw: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : null;
  } catch { return null; }
};

const digestHex = async (data: Uint8Array): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
    .map(byte => byte.toString(16).padStart(2, "0")).join("");

/** Receives one bounded, speaker-isolated worker segment while ordinary mixed
 * GPT Live frames continue. It grants no attribution or command authority:
 * the native provider and hosted publication still need current funding,
 * consent and room checks. Audio is erased when the callback completes. */
export class DiscordIsolatedAudioRelay {
  private pending: Pending | null = null;
  private completing = false;
  private generation = 0;

  constructor(private readonly input: Readonly<{
    expected: ExpectedBridge;
    onSegment(receipt: IsolatedAudioReceipt): Promise<void>;
    now?: () => number;
  }>) {}

  clear(): void {
    this.generation += 1;
    this.pending?.pcm.fill(0);
    this.pending = null;
    this.completing = false;
  }

  begin(raw: string): boolean {
    const data = value(raw);
    const expected = this.input.expected;
    const now = (this.input.now ?? Date.now)();
    if (this.pending || this.completing || !data ||
        data.kind !== "isolated_stt_begin" ||
        data.room_id !== expected.roomId ||
        data.invitation_id !== expected.invitationId ||
        data.realtime_session_id !== expected.realtimeSessionId ||
        data.provider_call_ref !== expected.providerCallRef ||
        typeof data.worker_id !== "string" ||
        !/^[a-zA-Z0-9:_-]{8,128}$/u.test(data.worker_id) ||
        typeof data.discord_user_id !== "string" || !USER.test(data.discord_user_id) ||
        typeof data.segment_id !== "string" || !SEGMENT.test(data.segment_id) ||
        typeof data.pcm_sha256 !== "string" || !HEX64.test(data.pcm_sha256) ||
        typeof data.allowance_id !== "string" || !ALLOWANCE.test(data.allowance_id) ||
        typeof data.reservation_id !== "string" || !RESERVATION.test(data.reservation_id) ||
        data.reservation_id !== `stt-reservation:${data.segment_id.slice(8)}` ||
        typeof data.pcm_bytes !== "number" ||
        !Number.isSafeInteger(data.pcm_bytes) ||
        data.pcm_bytes < 3 * 3_840 || data.pcm_bytes > MAX_PCM_BYTES ||
        data.pcm_bytes % 3_840 !== 0 ||
        typeof data.started_at_ms !== "number" ||
        typeof data.ended_at_ms !== "number" ||
        !Number.isSafeInteger(data.started_at_ms) ||
        !Number.isSafeInteger(data.ended_at_ms) ||
        data.started_at_ms < 0 || data.ended_at_ms < data.started_at_ms ||
        typeof data.reservation_expires_at_ms !== "number" ||
        !Number.isSafeInteger(data.reservation_expires_at_ms) ||
        data.reservation_expires_at_ms <= 0) return false;
    this.pending = {
      roomId: expected.roomId, invitationId: expected.invitationId,
      realtimeSessionId: expected.realtimeSessionId,
      providerCallRef: expected.providerCallRef,
      workerId: data.worker_id, discordUserId: data.discord_user_id,
      segmentId: data.segment_id, allowanceId: data.allowance_id,
      reservationId: data.reservation_id,
      reservationExpiresAtMs: data.reservation_expires_at_ms,
      startedAtMs: data.started_at_ms, endedAtMs: data.ended_at_ms,
      pcmSha256: data.pcm_sha256,
      pcm: new Uint8Array(data.pcm_bytes), offset: 0, openedAtMs: now,
    };
    return true;
  }

  chunk(frame: ArrayBuffer): boolean {
    const pending = this.pending;
    const now = (this.input.now ?? Date.now)();
    if (!pending || this.completing || now - pending.openedAtMs > MAX_TRANSFER_MS ||
        frame.byteLength < 5 + 3_840 || frame.byteLength > 5 + CHUNK_BYTES) return false;
    const bytes = new Uint8Array(frame);
    const offset = new DataView(frame).getUint32(1, false);
    const length = frame.byteLength - 5;
    if (bytes[0] !== 3 || offset !== pending.offset ||
        length % 3_840 !== 0 || offset + length > pending.pcm.length) return false;
    pending.pcm.set(bytes.subarray(5), offset);
    pending.offset += length;
    return true;
  }

  async end(raw: string): Promise<boolean> {
    const data = value(raw);
    const pending = this.pending;
    const now = (this.input.now ?? Date.now)();
    if (!pending || this.completing || !data ||
        data.kind !== "isolated_stt_end" ||
        data.segment_id !== pending.segmentId ||
        pending.offset !== pending.pcm.length ||
        now - pending.openedAtMs > MAX_TRANSFER_MS) return false;
    this.completing = true;
    const generation = this.generation;
    try {
      if (await digestHex(pending.pcm) !== pending.pcmSha256) return false;
      if (generation !== this.generation || this.pending !== pending) return false;
      const prefix = new TextEncoder().encode("casimir.discord.isolated.speech.v1\n" +
        JSON.stringify([pending.roomId, pending.invitationId,
          pending.workerId, pending.realtimeSessionId,
          pending.providerCallRef, pending.discordUserId,
          pending.startedAtMs, pending.endedAtMs]));
      const joined = new Uint8Array(prefix.length + pending.pcm.length);
      joined.set(prefix); joined.set(pending.pcm, prefix.length);
      const segmentId = `segment:${await digestHex(joined)}`;
      joined.fill(0);
      if (generation !== this.generation || this.pending !== pending ||
          segmentId !== pending.segmentId) return false;
      await this.input.onSegment({
        roomId: pending.roomId, invitationId: pending.invitationId,
        workerId: pending.workerId, realtimeSessionId: pending.realtimeSessionId,
        providerCallRef: pending.providerCallRef,
        discordUserId: pending.discordUserId, segmentId: pending.segmentId,
        allowanceId: pending.allowanceId,
        reservationId: pending.reservationId,
        reservationExpiresAtMs: pending.reservationExpiresAtMs,
        startedAtMs: pending.startedAtMs, endedAtMs: pending.endedAtMs,
        pcm: pending.pcm,
      });
      return true;
    } catch { return false; }
    finally { this.clear(); }
  }
}
