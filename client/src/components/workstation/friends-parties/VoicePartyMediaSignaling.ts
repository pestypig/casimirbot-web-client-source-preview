import type {
  HelixVoiceParty,
  HelixVoicePartyMediaSignal,
  HelixVoicePartyMember,
} from "@shared/helix-friends-voice-party";
import { FriendsPartiesApiError, type FriendsPartiesApi } from "./FriendsPartiesApi";

const SIGNAL_POLL_MS = 450;

export type VoicePartyMediaSignaling = {
  start(): void;
  sendOffer(): Promise<void>;
  publishCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  close(notifyPeer: boolean): void;
};

export const createVoicePartyMediaSignaling = (input: {
  role: "owner" | "participant";
  api: FriendsPartiesApi;
  getParty(): HelixVoiceParty;
  getPeer(): HelixVoicePartyMember | null;
  getConnection(): RTCPeerConnection | null;
  onNegotiating(): void;
  onFailure(): void;
  onHangup(): void;
  negotiationId?: string;
}): VoicePartyMediaSignaling => {
  const createNegotiationId = (): string =>
    globalThis.crypto?.randomUUID?.() ?? `voice_party_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  let closed = false;
  let pollTimer: number | null = null;
  let afterSignalId: string | null = null;
  let offerInFlight = false;
  let activeNegotiationId = input.role === "owner"
    ? input.negotiationId ?? createNegotiationId()
    : null;
  const queuedCandidates = new Map<string, RTCIceCandidateInit[]>();
  const seen = new Set<string>();

  const publish = async (
    signal: Pick<HelixVoicePartyMediaSignal, "kind" | "description" | "candidate">,
  ): Promise<void> => {
    const peer = input.getPeer();
    if (!peer || !activeNegotiationId) throw new Error("voice_party_peer_unavailable");
    await input.api.publishSignal(input.getParty().party_id, {
      targetParticipantId: peer.participant_id,
      negotiationId: activeNegotiationId,
      kind: signal.kind,
      description: signal.description,
      candidate: signal.candidate,
    });
  };

  const flushCandidates = async (negotiationId: string): Promise<void> => {
    const connection = input.getConnection();
    if (!connection?.remoteDescription) return;
    const candidates = queuedCandidates.get(negotiationId) ?? [];
    queuedCandidates.delete(negotiationId);
    for (const candidate of candidates) await connection.addIceCandidate(candidate);
  };

  const handle = async (signal: HelixVoicePartyMediaSignal): Promise<void> => {
    const connection = input.getConnection();
    if (!connection) return;
    if (signal.kind === "hangup") return input.onHangup();
    if (input.role === "owner" && signal.negotiation_id !== activeNegotiationId) return;
    if (signal.kind === "ice_candidate" && signal.candidate) {
      if (connection.remoteDescription) await connection.addIceCandidate(signal.candidate);
      else {
        const pending = queuedCandidates.get(signal.negotiation_id) ?? [];
        queuedCandidates.set(signal.negotiation_id, [...pending, signal.candidate].slice(-64));
      }
      return;
    }
    if (signal.kind === "offer" && signal.description && input.role === "participant") {
      activeNegotiationId = signal.negotiation_id;
      await connection.setRemoteDescription(signal.description);
      await flushCandidates(signal.negotiation_id);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await publish({ kind: "answer", description: answer, candidate: null });
      return;
    }
    if (signal.kind === "answer" && signal.description && input.role === "owner") {
      await connection.setRemoteDescription(signal.description);
      await flushCandidates(signal.negotiation_id);
    }
  };

  const sendOffer = async (): Promise<void> => {
    const connection = input.getConnection();
    if (!connection || input.role !== "owner" || closed || offerInFlight) return;
    offerInFlight = true;
    try {
      input.onNegotiating();
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await publish({ kind: "offer", description: offer, candidate: null });
    } finally {
      offerInFlight = false;
    }
  };

  const recoverExpiredCursor = async (): Promise<void> => {
    afterSignalId = null;
    seen.clear();
    queuedCandidates.clear();
    if (input.role === "owner") {
      activeNegotiationId = createNegotiationId();
      await sendOffer();
    } else {
      activeNegotiationId = null;
    }
  };

  const poll = async (): Promise<void> => {
    if (closed) return;
    try {
      const signals = await input.api.listSignals(input.getParty().party_id, afterSignalId);
      for (const signal of signals) {
        afterSignalId = signal.signal_id;
        if (seen.has(signal.signal_id)) continue;
        seen.add(signal.signal_id);
        await handle(signal);
      }
    } catch (error) {
      input.onFailure();
      if (
        error instanceof FriendsPartiesApiError &&
        error.code === "voice_party_signal_cursor_expired"
      ) {
        await recoverExpiredCursor().catch(() => undefined);
      }
    } finally {
      if (!closed) pollTimer = window.setTimeout(() => void poll(), SIGNAL_POLL_MS);
    }
  };

  return {
    start() {
      if (!closed && pollTimer === null) void poll();
    },
    sendOffer,
    publishCandidate: (candidate) =>
      publish({ kind: "ice_candidate", description: null, candidate }),
    close(notifyPeer) {
      if (closed) return;
      if (notifyPeer && input.getPeer() && activeNegotiationId) {
        void publish({ kind: "hangup", description: null, candidate: null })
          .catch(() => undefined);
      }
      closed = true;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      pollTimer = null;
      queuedCandidates.clear();
    },
  };
};
