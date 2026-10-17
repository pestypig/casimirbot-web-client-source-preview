/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HelixVoiceParty,
  HelixVoicePartyMediaSignal,
  HelixVoicePartyMember,
} from "@shared/helix-friends-voice-party";
import type { FriendsPartiesApi } from "../FriendsPartiesApi";
import { FriendsPartiesApiError } from "../FriendsPartiesApi";
import { createVoicePartyMediaSignaling } from "../VoicePartyMediaSignaling";

const member = (
  participantId: string,
  profileId: string,
  role: "owner" | "participant",
): HelixVoicePartyMember => ({
  schema: "helix.voice_party_member.v1",
  participant_id: participantId,
  profile: {
    schema: "helix.social_profile.v1",
    profile_id: profileId,
    handle: profileId,
    display_name: profileId,
    picture_url: null,
    discovery_policy: "exact_handle",
    presence_visibility: "friends",
    updated_at: "2026-08-31T00:00:00.000Z",
  },
  role,
  state: "joining",
  media_state: "connecting",
  muted: false,
  deafened: false,
  joined_at: "2026-08-31T00:00:00.000Z",
  last_seen_at: "2026-08-31T00:00:00.000Z",
});

describe("VoicePartyMediaSignaling", () => {
  afterEach(() => vi.useRealTimers());

  it("completes an offer, answer, and ICE exchange between two party clients", async () => {
    vi.useFakeTimers();
    const owner = member("participant:owner", "profile:owner", "owner");
    const guest = member("participant:guest", "profile:guest", "participant");
    const party: HelixVoiceParty = {
      schema: "helix.voice_party.v1",
      party_id: "voice_party:two-client",
      owner_profile_id: owner.profile.profile_id,
      state: "connecting",
      max_members: 2,
      room_id: null,
      gpt_attachment_state: "detached",
      members: [owner, guest],
      created_at: "2026-08-31T00:00:00.000Z",
      updated_at: "2026-08-31T00:00:00.000Z",
      ended_at: null,
    };
    const signals: HelixVoicePartyMediaSignal[] = [];
    const apiFor = (sender: HelixVoicePartyMember): Pick<
      FriendsPartiesApi,
      "publishSignal" | "listSignals"
    > => ({
      async publishSignal(partyId, input) {
        const signal: HelixVoicePartyMediaSignal = {
          schema: "helix.voice_party.media_signal.v1",
          signal_id: `signal:${String(signals.length + 1).padStart(4, "0")}`,
          party_id: partyId,
          negotiation_id: input.negotiationId,
          sender_participant_id: sender.participant_id,
          target_participant_id: input.targetParticipantId,
          kind: input.kind,
          description: input.description ?? null,
          candidate: input.candidate ?? null,
          created_at: "2026-08-31T00:00:00.000Z",
          expires_at: "2026-08-31T00:02:00.000Z",
        };
        signals.push(signal);
        return signal;
      },
      async listSignals(_partyId, afterSignalId) {
        return signals.filter((signal) =>
          signal.target_participant_id === sender.participant_id &&
          (!afterSignalId || signal.signal_id > afterSignalId));
      },
    });
    const ownerConnection = {
      remoteDescription: null as RTCSessionDescriptionInit | null,
      createOffer: vi.fn(async () => ({ type: "offer" as const, sdp: "owner-offer" })),
      setLocalDescription: vi.fn(async () => undefined),
      setRemoteDescription: vi.fn(async function (description: RTCSessionDescriptionInit) {
        ownerConnection.remoteDescription = description;
      }),
      addIceCandidate: vi.fn(async () => undefined),
    } as unknown as RTCPeerConnection;
    const guestConnection = {
      remoteDescription: null as RTCSessionDescriptionInit | null,
      createAnswer: vi.fn(async () => ({ type: "answer" as const, sdp: "guest-answer" })),
      setLocalDescription: vi.fn(async () => undefined),
      setRemoteDescription: vi.fn(async function (description: RTCSessionDescriptionInit) {
        guestConnection.remoteDescription = description;
      }),
      addIceCandidate: vi.fn(async () => undefined),
    } as unknown as RTCPeerConnection;
    const ownerSignaling = createVoicePartyMediaSignaling({
      role: "owner",
      api: apiFor(owner) as FriendsPartiesApi,
      getParty: () => party,
      getPeer: () => guest,
      getConnection: () => ownerConnection,
      onNegotiating: vi.fn(),
      onFailure: vi.fn(),
      onHangup: vi.fn(),
      negotiationId: "negotiation:two-client",
    });
    const guestSignaling = createVoicePartyMediaSignaling({
      role: "participant",
      api: apiFor(guest) as FriendsPartiesApi,
      getParty: () => party,
      getPeer: () => owner,
      getConnection: () => guestConnection,
      onNegotiating: vi.fn(),
      onFailure: vi.fn(),
      onHangup: vi.fn(),
    });

    guestSignaling.start();
    await vi.advanceTimersByTimeAsync(0);
    await ownerSignaling.sendOffer();
    await vi.advanceTimersByTimeAsync(450);
    expect(guestConnection.setRemoteDescription).toHaveBeenCalledWith(
      expect.objectContaining({ type: "offer", sdp: "owner-offer" }),
    );
    expect(signals.some((signal) => signal.kind === "answer")).toBe(true);

    ownerSignaling.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(ownerConnection.setRemoteDescription).toHaveBeenCalledWith(
      expect.objectContaining({ type: "answer", sdp: "guest-answer" }),
    );

    await ownerSignaling.publishCandidate({ candidate: "owner-ice" });
    await vi.advanceTimersByTimeAsync(450);
    expect(guestConnection.addIceCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ candidate: "owner-ice" }),
    );
    ownerSignaling.close(false);
    guestSignaling.close(false);
  });

  it("rotates owner negotiation after a typed expired cursor instead of polling it forever", async () => {
    vi.useFakeTimers();
    const owner = member("participant:owner", "profile:owner", "owner");
    const guest = member("participant:guest", "profile:guest", "participant");
    const party = {
      schema: "helix.voice_party.v1",
      party_id: "voice_party:cursor-recovery",
      owner_profile_id: owner.profile.profile_id,
      state: "connecting",
      max_members: 2,
      room_id: null,
      gpt_attachment_state: "detached",
      members: [owner, guest],
      created_at: "2026-08-31T00:00:00.000Z",
      updated_at: "2026-08-31T00:00:00.000Z",
      ended_at: null,
    } satisfies HelixVoiceParty;
    const published: string[] = [];
    let polls = 0;
    const api = {
      async listSignals() {
        polls += 1;
        if (polls === 1) return [{
          schema: "helix.voice_party.media_signal.v1",
          signal_id: "signal:expired-next",
          party_id: party.party_id,
          negotiation_id: "negotiation:initial",
          sender_participant_id: guest.participant_id,
          target_participant_id: owner.participant_id,
          kind: "ice_candidate",
          description: null,
          candidate: { candidate: "queued-before-gap" },
          created_at: "2026-08-31T00:00:00.000Z",
          expires_at: "2026-08-31T00:02:00.000Z",
        } satisfies HelixVoicePartyMediaSignal];
        if (polls === 2) {
          throw new FriendsPartiesApiError(
            "voice_party_signal_cursor_expired",
            409,
            "Cursor expired.",
          );
        }
        return [];
      },
      async publishSignal(_partyId: string, signal: { negotiationId: string }) {
        published.push(signal.negotiationId);
        return {} as HelixVoicePartyMediaSignal;
      },
    } as FriendsPartiesApi;
    const connection = {
      remoteDescription: null,
      createOffer: vi.fn(async () => ({ type: "offer" as const, sdp: "recovery-offer" })),
      setLocalDescription: vi.fn(async () => undefined),
      addIceCandidate: vi.fn(async () => undefined),
    } as unknown as RTCPeerConnection;
    const onFailure = vi.fn();
    const signaling = createVoicePartyMediaSignaling({
      role: "owner",
      api,
      getParty: () => party,
      getPeer: () => guest,
      getConnection: () => connection,
      onNegotiating: vi.fn(),
      onFailure,
      onHangup: vi.fn(),
      negotiationId: "negotiation:initial",
    });

    signaling.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(450);
    expect(onFailure).toHaveBeenCalledOnce();
    expect(connection.createOffer).toHaveBeenCalledOnce();
    expect(published).toHaveLength(1);
    expect(published[0]).not.toBe("negotiation:initial");

    await vi.advanceTimersByTimeAsync(450);
    expect(polls).toBe(3);
    signaling.close(false);
  });
});
