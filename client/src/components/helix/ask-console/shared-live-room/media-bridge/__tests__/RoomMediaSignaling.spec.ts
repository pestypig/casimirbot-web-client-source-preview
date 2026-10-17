/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import type {
  HelixSharedRealtimeRoom,
  HelixSharedRealtimeRoomParticipant,
} from "@shared/helix-shared-realtime-room";
import type { HelixSharedLiveRoomApi } from "../../SharedLiveRoomApi";
import { createSharedLiveRoomMediaSignaling } from "../RoomMediaSignaling";

describe("Shared Live Room browser signaling", () => {
  it("publishes owner offers and ICE only to the current room peer", async () => {
    const offer = { type: "offer" as const, sdp: "v=0\r\nowner-offer" };
    const connection = {
      createOffer: vi.fn(async () => offer),
      setLocalDescription: vi.fn(async () => undefined),
    } as unknown as RTCPeerConnection;
    const publishMediaSignal = vi.fn(async () => ({}));
    const room = {
      room_id: "room:signaling",
      runtime: { runtime_id: "runtime:signaling" },
    } as HelixSharedRealtimeRoom;
    const peer = {
      participant_id: "participant:peer",
    } as HelixSharedRealtimeRoomParticipant;
    const onNegotiating = vi.fn();
    const signaling = createSharedLiveRoomMediaSignaling({
      role: "owner",
      negotiationId: "negotiation:current",
      api: { publishMediaSignal } as unknown as HelixSharedLiveRoomApi,
      getRoom: () => room,
      getPeer: () => peer,
      getConnection: () => connection,
      onNegotiating,
      onFailure: vi.fn(),
      onHangup: vi.fn(),
    });

    await signaling.sendOffer();
    expect(onNegotiating).toHaveBeenCalledOnce();
    expect(connection.setLocalDescription).toHaveBeenCalledWith(offer);
    expect(publishMediaSignal).toHaveBeenNthCalledWith(1, "room:signaling", {
      targetParticipantId: "participant:peer",
      negotiationId: "negotiation:current",
      kind: "offer",
      description: offer,
      candidate: null,
    });

    const candidate = { candidate: "candidate:1 1 udp 1 127.0.0.1 9 typ host" };
    await signaling.publishCandidate(candidate);
    expect(publishMediaSignal).toHaveBeenNthCalledWith(2, "room:signaling", {
      targetParticipantId: "participant:peer",
      negotiationId: "negotiation:current",
      kind: "ice_candidate",
      description: null,
      candidate,
    });
  });

  it("queues renegotiation until the initial owner offer receives an answer", async () => {
    let signalingState: RTCSignalingState = "stable";
    let offerSequence = 0;
    const connection = {
      get signalingState() {
        return signalingState;
      },
      createOffer: vi.fn(async () => ({
        type: "offer" as const,
        sdp: `v=0\r\noffer-${++offerSequence}`,
      })),
      setLocalDescription: vi.fn(async () => {
        signalingState = "have-local-offer";
      }),
      setRemoteDescription: vi.fn(async () => {
        signalingState = "stable";
      }),
      addIceCandidate: vi.fn(async () => undefined),
      get remoteDescription() {
        return signalingState === "stable"
          ? { type: "answer" as const, sdp: "v=0\r\nanswer" }
          : null;
      },
    } as unknown as RTCPeerConnection;
    const answer = {
      signal_id: "signal:answer",
      sender_participant_id: "participant:peer",
      runtime_id: "runtime:signaling",
      negotiation_id: "negotiation:current",
      kind: "answer",
      description: { type: "answer" as const, sdp: "v=0\r\nanswer" },
      candidate: null,
    };
    const listMediaSignals = vi.fn()
      .mockResolvedValueOnce([answer])
      .mockResolvedValue([]);
    const publishMediaSignal = vi.fn(async () => ({}));
    const signaling = createSharedLiveRoomMediaSignaling({
      role: "owner",
      negotiationId: "negotiation:current",
      api: {
        publishMediaSignal,
        listMediaSignals,
      } as unknown as HelixSharedLiveRoomApi,
      getRoom: () => ({
        room_id: "room:signaling",
        runtime: { runtime_id: "runtime:signaling" },
      }) as HelixSharedRealtimeRoom,
      getPeer: () => ({
        participant_id: "participant:peer",
      }) as HelixSharedRealtimeRoomParticipant,
      getConnection: () => connection,
      onNegotiating: vi.fn(),
      onFailure: vi.fn(),
      onHangup: vi.fn(),
    });

    await signaling.sendOffer();
    await signaling.sendOffer();
    expect(connection.createOffer).toHaveBeenCalledTimes(1);

    signaling.start();
    await vi.waitFor(() => {
      expect(connection.createOffer).toHaveBeenCalledTimes(2);
    });
    expect(connection.setRemoteDescription).toHaveBeenCalledWith(answer.description);
    signaling.close(false);
  });

  it("ignores retained signals from an older negotiation after reconnect", async () => {
    const currentOffer = {
      signal_id: "signal:current-offer",
      sender_participant_id: "participant:owner",
      runtime_id: "runtime:signaling",
      negotiation_id: "negotiation:current",
      kind: "offer" as const,
      description: { type: "offer" as const, sdp: "v=0\r\ncurrent-offer" },
      candidate: null,
    };
    const staleHangup = {
      signal_id: "signal:stale-hangup",
      sender_participant_id: "participant:owner",
      runtime_id: "runtime:signaling",
      negotiation_id: "negotiation:stale",
      kind: "hangup" as const,
      description: null,
      candidate: null,
    };
    const connection = {
      setRemoteDescription: vi.fn(async () => undefined),
      createAnswer: vi.fn(async () => ({
        type: "answer" as const,
        sdp: "v=0\r\ncurrent-answer",
      })),
      setLocalDescription: vi.fn(async () => undefined),
      addIceCandidate: vi.fn(async () => undefined),
      remoteDescription: { type: "offer", sdp: "v=0\r\ncurrent-offer" },
    } as unknown as RTCPeerConnection;
    const publishMediaSignal = vi.fn(async () => ({}));
    const onHangup = vi.fn();
    const signaling = createSharedLiveRoomMediaSignaling({
      role: "participant",
      api: {
        publishMediaSignal,
        listMediaSignals: vi.fn()
          .mockResolvedValueOnce([staleHangup, currentOffer])
          .mockResolvedValue([]),
      } as unknown as HelixSharedLiveRoomApi,
      getRoom: () => ({
        room_id: "room:signaling",
        runtime: { runtime_id: "runtime:signaling" },
      }) as HelixSharedRealtimeRoom,
      getPeer: () => ({
        participant_id: "participant:owner",
      }) as HelixSharedRealtimeRoomParticipant,
      getConnection: () => connection,
      onNegotiating: vi.fn(),
      onFailure: vi.fn(),
      onHangup,
    });

    signaling.start();
    await vi.waitFor(() => expect(connection.setRemoteDescription)
      .toHaveBeenCalledWith(currentOffer.description));
    expect(onHangup).not.toHaveBeenCalled();
    expect(publishMediaSignal).toHaveBeenCalledWith("room:signaling", {
      targetParticipantId: "participant:owner",
      negotiationId: "negotiation:current",
      kind: "answer",
      description: { type: "answer", sdp: "v=0\r\ncurrent-answer" },
      candidate: null,
    });
    signaling.close(false);
  });

  it("retains a new negotiation candidate that arrives before its offer", async () => {
    const signal = (
      signalId: string,
      negotiationId: string,
      kind: "offer" | "ice_candidate",
    ) => ({
      signal_id: signalId,
      sender_participant_id: "participant:owner",
      runtime_id: "runtime:signaling",
      negotiation_id: negotiationId,
      kind,
      description: kind === "offer"
        ? { type: "offer" as const, sdp: `v=0\r\n${negotiationId}` }
        : null,
      candidate: kind === "ice_candidate"
        ? { candidate: `candidate:${negotiationId}` }
        : null,
    });
    const oldOffer = signal("signal:old-offer", "negotiation:old", "offer");
    const newCandidate = signal(
      "signal:new-candidate",
      "negotiation:new",
      "ice_candidate",
    );
    const newOffer = signal("signal:new-offer", "negotiation:new", "offer");
    const connection = {
      setRemoteDescription: vi.fn(async () => undefined),
      createAnswer: vi.fn(async () => ({
        type: "answer" as const,
        sdp: "v=0\r\nanswer",
      })),
      setLocalDescription: vi.fn(async () => undefined),
      addIceCandidate: vi.fn(async () => undefined),
      remoteDescription: { type: "offer", sdp: "v=0\r\noffer" },
    } as unknown as RTCPeerConnection;
    const signaling = createSharedLiveRoomMediaSignaling({
      role: "participant",
      api: {
        publishMediaSignal: vi.fn(async () => ({})),
        listMediaSignals: vi.fn()
          .mockResolvedValueOnce([oldOffer])
          .mockResolvedValueOnce([newCandidate])
          .mockResolvedValueOnce([newOffer])
          .mockResolvedValue([]),
      } as unknown as HelixSharedLiveRoomApi,
      getRoom: () => ({
        room_id: "room:signaling",
        runtime: { runtime_id: "runtime:signaling" },
      }) as HelixSharedRealtimeRoom,
      getPeer: () => ({
        participant_id: "participant:owner",
      }) as HelixSharedRealtimeRoomParticipant,
      getConnection: () => connection,
      onNegotiating: vi.fn(),
      onFailure: vi.fn(),
      onHangup: vi.fn(),
    });

    signaling.start();
    await vi.waitFor(() => expect(connection.setRemoteDescription)
      .toHaveBeenCalledWith(newOffer.description), { timeout: 2_500 });
    expect(connection.addIceCandidate).toHaveBeenCalledWith(newCandidate.candidate);
    signaling.close(false);
  });

  it("does not let another room member replace the selected peer's offer or end the call", async () => {
    const connection = {
      setRemoteDescription: vi.fn(async () => undefined),
      createAnswer: vi.fn(async () => ({ type: "answer" as const, sdp: "v=0\r\nanswer" })),
      setLocalDescription: vi.fn(async () => undefined),
      addIceCandidate: vi.fn(async () => undefined),
      remoteDescription: { type: "offer", sdp: "v=0\r\npeer-offer" },
    } as unknown as RTCPeerConnection;
    const otherOffer = {
      signal_id: "signal:other-offer", sender_participant_id: "participant:other",
      runtime_id: "runtime:signaling", negotiation_id: "negotiation:other",
      kind: "offer" as const,
      description: { type: "offer" as const, sdp: "v=0\r\nother-offer" }, candidate: null,
    };
    const peerOffer = {
      ...otherOffer, signal_id: "signal:peer-offer",
      sender_participant_id: "participant:owner", negotiation_id: "negotiation:peer",
      description: { type: "offer" as const, sdp: "v=0\r\npeer-offer" },
    };
    const foreignHangup = {
      ...otherOffer, signal_id: "signal:other-hangup", kind: "hangup" as const,
      description: null,
    };
    const onHangup = vi.fn();
    const publishMediaSignal = vi.fn(async () => ({}));
    const signaling = createSharedLiveRoomMediaSignaling({
      role: "participant",
      api: { publishMediaSignal, listMediaSignals: vi.fn()
        .mockResolvedValueOnce([peerOffer, foreignHangup, otherOffer])
        .mockResolvedValue([]) } as unknown as HelixSharedLiveRoomApi,
      getRoom: () => ({ room_id: "room:signaling",
        runtime: { runtime_id: "runtime:signaling" } }) as HelixSharedRealtimeRoom,
      getPeer: () => ({ participant_id: "participant:owner" }) as HelixSharedRealtimeRoomParticipant,
      getConnection: () => connection,
      onNegotiating: vi.fn(), onFailure: vi.fn(), onHangup,
    });

    signaling.start();
    await vi.waitFor(() => expect(connection.setRemoteDescription)
      .toHaveBeenCalledWith(peerOffer.description));
    expect(connection.setRemoteDescription).toHaveBeenCalledTimes(1);
    expect(onHangup).not.toHaveBeenCalled();
    expect(publishMediaSignal).toHaveBeenCalledWith("room:signaling", expect.objectContaining({
      targetParticipantId: "participant:owner", negotiationId: "negotiation:peer",
      kind: "answer",
    }));
    signaling.close(false);
  });
});
