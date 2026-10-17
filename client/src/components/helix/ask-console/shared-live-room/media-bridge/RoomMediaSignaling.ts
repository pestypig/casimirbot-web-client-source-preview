import type {
  HelixSharedRealtimeRoom,
  HelixSharedRealtimeRoomParticipant,
} from "@shared/helix-shared-realtime-room";
import type { HelixSharedRealtimeRoomMediaSignal } from
  "@shared/helix-shared-realtime-room-media";
import type { HelixSharedLiveRoomApi } from "../SharedLiveRoomApi";

const SIGNAL_POLL_MS = 450;

export type SharedLiveRoomMediaSignaling = {
  start(): void;
  sendOffer(): Promise<void>;
  publishCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  close(notifyPeer: boolean): void;
};

export const createSharedLiveRoomMediaSignaling = (input: {
  role: "owner" | "participant";
  negotiationId?: string;
  api: HelixSharedLiveRoomApi;
  getRoom(): HelixSharedRealtimeRoom;
  getPeer(): HelixSharedRealtimeRoomParticipant | null;
  getConnection(): RTCPeerConnection | null;
  onNegotiating(): void;
  onFailure(): void;
  onHangup(): void;
}): SharedLiveRoomMediaSignaling => {
  let pollTimer: number | null = null;
  let pollingStarted = false;
  let afterSignalId: string | null = null;
  let closed = false;
  let offerInFlight = false;
  let offerQueued = false;
  let activeNegotiationId = input.role === "owner"
    ? input.negotiationId ??
      globalThis.crypto?.randomUUID?.() ??
      `room_media_${Date.now()}_${Math.random().toString(36).slice(2)}`
    : null;
  const pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  const seenSignalIds = new Set<string>();

  const publish = async (
    signal: Pick<HelixSharedRealtimeRoomMediaSignal, "kind" | "description" | "candidate">,
  ): Promise<void> => {
    const room = input.getRoom();
    const peer = input.getPeer();
    if (!activeNegotiationId) {
      throw new Error("shared_room_media_negotiation_unavailable");
    }
    if (!peer) throw new Error("shared_room_media_peer_unavailable");
    await input.api.publishMediaSignal(room.room_id, {
      targetParticipantId: peer.participant_id,
      negotiationId: activeNegotiationId,
      kind: signal.kind,
      description: signal.description,
      candidate: signal.candidate,
    });
  };
  const queueCandidate = (
    negotiationId: string,
    candidate: RTCIceCandidateInit,
  ): void => {
    const pending = pendingCandidates.get(negotiationId) ?? [];
    pending.push(candidate);
    pendingCandidates.set(negotiationId, pending.slice(-64));
  };
  const flushCandidates = async (negotiationId: string): Promise<void> => {
    const connection = input.getConnection();
    if (!connection?.remoteDescription) return;
    const pending = pendingCandidates.get(negotiationId) ?? [];
    pendingCandidates.delete(negotiationId);
    for (const candidate of pending) {
      await connection.addIceCandidate(candidate);
    }
  };
  const sendOwnerOffer = async (): Promise<void> => {
    const connection = input.getConnection();
    if (!connection || input.role !== "owner" || closed) return;
    if (
      offerInFlight ||
      (connection.signalingState && connection.signalingState !== "stable")
    ) {
      offerQueued = true;
      return;
    }
    offerInFlight = true;
    try {
      input.onNegotiating();
      const offer = await connection.createOffer();
      if (closed) return;
      await connection.setLocalDescription(offer);
      if (closed) return;
      await publish({ kind: "offer", description: offer, candidate: null });
    } finally {
      offerInFlight = false;
    }
  };
  const flushQueuedOwnerOffer = async (): Promise<void> => {
    if (!offerQueued || closed) return;
    offerQueued = false;
    await sendOwnerOffer();
  };
  const handle = async (signal: HelixSharedRealtimeRoomMediaSignal): Promise<void> => {
    const room = input.getRoom();
    const connection = input.getConnection();
    if (!connection || signal.runtime_id !== room.runtime.runtime_id) return;
    if (
      input.role === "owner" &&
      signal.negotiation_id !== activeNegotiationId
    ) return;
    if (
      input.role === "participant" &&
      signal.kind !== "offer" &&
      signal.negotiation_id !== activeNegotiationId
    ) {
      if (signal.kind === "ice_candidate" && signal.candidate) {
        queueCandidate(signal.negotiation_id, signal.candidate);
      }
      return;
    }
    if (signal.kind === "hangup") {
      input.onHangup();
      return;
    }
    if (signal.kind === "ice_candidate" && signal.candidate) {
      if (connection.remoteDescription) await connection.addIceCandidate(signal.candidate);
      else queueCandidate(signal.negotiation_id, signal.candidate);
      return;
    }
    if (signal.kind === "offer" && signal.description && input.role === "participant") {
      activeNegotiationId = signal.negotiation_id;
      for (const negotiationId of pendingCandidates.keys()) {
        if (negotiationId !== activeNegotiationId) {
          pendingCandidates.delete(negotiationId);
        }
      }
      await connection.setRemoteDescription(signal.description);
      await flushCandidates(activeNegotiationId);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await publish({ kind: "answer", description: answer, candidate: null });
      return;
    }
    if (signal.kind === "answer" && signal.description && input.role === "owner") {
      await connection.setRemoteDescription(signal.description);
      await flushCandidates(signal.negotiation_id);
      await flushQueuedOwnerOffer();
    }
  };
  const poll = async (): Promise<void> => {
    if (closed) return;
    try {
      const signals = await input.api.listMediaSignals(
        input.getRoom().room_id,
        afterSignalId,
      );
      for (const signal of signals) afterSignalId = signal.signal_id;
      // The mailbox authenticates the sender, but this one-peer bridge must
      // never apply another room member's SDP, ICE, or hangup to its peer.
      const peerId = input.getPeer()?.participant_id;
      const peerSignals = peerId
        ? signals.filter((signal) => signal.sender_participant_id === peerId)
        : [];
      const latestParticipantOffer = input.role === "participant"
        ? [...peerSignals].reverse().find((signal) =>
            signal.kind === "offer" &&
            signal.runtime_id === input.getRoom().runtime.runtime_id)
        : null;
      const selectedNegotiationId =
        latestParticipantOffer?.negotiation_id ?? activeNegotiationId;
      for (const signal of peerSignals) {
        if (seenSignalIds.has(signal.signal_id)) continue;
        seenSignalIds.add(signal.signal_id);
        if (
          selectedNegotiationId &&
          signal.negotiation_id !== selectedNegotiationId
        ) {
          if (
            input.role === "participant" &&
            signal.kind === "ice_candidate"
          ) {
            await handle(signal);
          }
          continue;
        }
        await handle(signal);
      }
    } catch {
      input.onFailure();
    } finally {
      if (!closed) pollTimer = window.setTimeout(() => void poll(), SIGNAL_POLL_MS);
    }
  };

  return {
    start() {
      if (closed || pollingStarted) return;
      pollingStarted = true;
      void poll();
    },
    sendOffer: sendOwnerOffer,
    publishCandidate: (candidate) =>
      publish({ kind: "ice_candidate", description: null, candidate }),
    close(notifyPeer) {
      if (closed) return;
      closed = true;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      pollTimer = null;
      pollingStarted = false;
      offerQueued = false;
      pendingCandidates.clear();
      if (notifyPeer && input.getPeer()) {
        void publish({ kind: "hangup", description: null, candidate: null })
          .catch(() => undefined);
      }
    },
  };
};
