/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HelixVoiceParty } from "@shared/helix-friends-voice-party";

const mocks = vi.hoisted(() => ({
  signaling: {
    start: vi.fn(),
    sendOffer: vi.fn(async () => undefined),
    publishCandidate: vi.fn(async () => undefined),
    close: vi.fn(),
  },
  playback: {
    attach: vi.fn(),
    resume: vi.fn(async () => true),
    setMuted: vi.fn(),
    close: vi.fn(),
  },
  recovery: { observe: vi.fn(), close: vi.fn() },
}));

vi.mock("../VoicePartyMediaSignaling", () => ({
  createVoicePartyMediaSignaling: vi.fn(() => mocks.signaling),
}));
vi.mock("../../../helix/ask-console/shared-live-room/media-bridge/RoomAudioPlayback", () => ({
  createSharedLiveRoomAudioPlayback: vi.fn(() => mocks.playback),
}));
vi.mock("../../../helix/ask-console/shared-live-room/media-bridge/RoomPeerConnectionRecovery", () => ({
  createSharedLiveRoomPeerConnectionRecovery: vi.fn(() => mocks.recovery),
}));
vi.mock("../../../helix/ask-console/shared-live-room/media-bridge/RoomIceConfiguration", () => ({
  readSharedLiveRoomIceConfigurationFromEnvironment: vi.fn(() => ({
    iceServers: [{ urls: "stun:test.invalid" }],
  })),
}));

import { createVoicePartyMediaBridge } from "../VoicePartyMediaBridge";

const member = (profileId: string, role: "owner" | "participant", slot: number) => ({
  schema: "helix.voice_party_member.v1" as const,
  participant_id: `participant:${slot}`,
  profile: {
    schema: "helix.social_profile.v1" as const,
    profile_id: profileId,
    handle: profileId,
    display_name: profileId,
    picture_url: null,
    discovery_policy: "exact_handle" as const,
    presence_visibility: "friends" as const,
    updated_at: "2026-08-31T00:00:00.000Z",
  },
  role,
  state: "joining" as const,
  media_state: "idle" as const,
  muted: false,
  deafened: false,
  joined_at: "2026-08-31T00:00:00.000Z",
  last_seen_at: "2026-08-31T00:00:00.000Z",
});

describe("VoicePartyMediaBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts owner-to-peer WebRTC without any GPT provider dependency", async () => {
    const owner = member("profile:owner", "owner", 1);
    const peer = member("profile:friend", "participant", 2);
    let party: HelixVoiceParty = {
      schema: "helix.voice_party.v1",
      party_id: "voice_party:test",
      owner_profile_id: "profile:owner",
      state: "connecting",
      max_members: 2,
      room_id: null,
      gpt_attachment_state: "detached",
      members: [owner, peer],
      created_at: "2026-08-31T00:00:00.000Z",
      updated_at: "2026-08-31T00:00:00.000Z",
      ended_at: null,
    };
    const track = { enabled: true, stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    });

    class FakePeerConnection {
      connectionState: RTCPeerConnectionState = "new";
      ontrack: ((event: RTCTrackEvent) => void) | null = null;
      onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
      onconnectionstatechange: (() => void) | null = null;
      addTrack = vi.fn();
      restartIce = vi.fn();
      close = vi.fn();
      getStats = vi.fn(async () => {
        const values = new Map<string, Record<string, unknown>>([
          ["pair", { type: "candidate-pair", state: "succeeded", selected: true,
            localCandidateId: "local", remoteCandidateId: "remote" }],
          ["local", { type: "local-candidate", candidateType: "host" }],
          ["remote", { type: "remote-candidate", candidateType: "srflx" }],
        ]);
        return values as unknown as RTCStatsReport;
      });
    }
    let connection: FakePeerConnection | null = null;
    vi.stubGlobal("RTCPeerConnection", vi.fn(() => {
      connection = new FakePeerConnection();
      return connection;
    }));
    const updateMedia = vi.fn(async (_partyId: string, update: { media_state: string }) => {
      party = {
        ...party,
        state: update.media_state === "direct" ? "active" : party.state,
        members: party.members.map((entry) => entry.participant_id === owner.participant_id
          ? { ...entry, media_state: update.media_state as typeof entry.media_state }
          : entry),
      };
      return party;
    });
    const projections: unknown[] = [];
    const getIceConfiguration = vi.fn(async () => ({
      schema: "helix.voice_party.ice_configuration.v1" as const,
      party_id: party.party_id,
      participant_id: owner.participant_id,
      ice_servers: [{ urls: "stun:server-issued.invalid" }],
      ice_transport_policy: "all" as const,
      relay_available: false,
      issued_at: "2026-08-31T00:00:00.000Z",
      expires_at: null,
      model_visible: false as const,
      debug_exportable: false as const,
      persistable: false as const,
      answer_authority: false as const,
    }));
    const bridge = createVoicePartyMediaBridge({
      party,
      self: owner,
      api: { updateMedia, getIceConfiguration } as never,
      onProjection: (projection) => projections.push(projection),
    });

    await bridge.start();
    expect(getIceConfiguration).toHaveBeenCalledWith("voice_party:test", "all");
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(updateMedia).toHaveBeenCalledWith("voice_party:test", expect.objectContaining({
      media_state: "connecting",
    }));
    expect(mocks.signaling.start).toHaveBeenCalledOnce();
    expect(mocks.signaling.sendOffer).toHaveBeenCalledOnce();

    connection!.connectionState = "connected";
    connection!.onconnectionstatechange?.();
    await vi.waitFor(() => expect(updateMedia).toHaveBeenCalledWith(
      "voice_party:test",
      expect.objectContaining({ media_state: "direct" }),
    ));
    expect(projections).toContainEqual(expect.objectContaining({
      state: "active",
      transport: "direct",
      peer_audio_connected: true,
    }));

    connection!.connectionState = "disconnected";
    connection!.onconnectionstatechange?.();
    expect(projections).toContainEqual(expect.objectContaining({
      state: "degraded",
      peer_audio_connected: false,
    }));
    expect(connection!.restartIce).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(mocks.signaling.sendOffer).toHaveBeenCalledTimes(2));

    await bridge.setMuted(true);
    expect(track.enabled).toBe(false);
    await bridge.close();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(mocks.signaling.close).toHaveBeenCalledWith(true);
  });

  it("uses relay-only admission and reports relayed only from the selected candidate pair", async () => {
    const owner = member("profile:owner", "owner", 1);
    const peer = member("profile:friend", "participant", 2);
    let party: HelixVoiceParty = {
      schema: "helix.voice_party.v1",
      party_id: "voice_party:relay",
      owner_profile_id: owner.profile.profile_id,
      state: "connecting",
      max_members: 2,
      room_id: null,
      gpt_attachment_state: "detached",
      members: [owner, peer],
      created_at: "2026-08-31T00:00:00.000Z",
      updated_at: "2026-08-31T00:00:00.000Z",
      ended_at: null,
    };
    const track = { enabled: true, stop: vi.fn() } as unknown as MediaStreamTrack;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({
        getAudioTracks: () => [track],
        getTracks: () => [track],
      }) as unknown as MediaStream) },
    });
    class RelayPeerConnection {
      connectionState: RTCPeerConnectionState = "new";
      ontrack: ((event: RTCTrackEvent) => void) | null = null;
      onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
      onconnectionstatechange: (() => void) | null = null;
      addTrack = vi.fn();
      restartIce = vi.fn();
      close = vi.fn();
      getStats = vi.fn(async () => new Map<string, Record<string, unknown>>([
        ["pair", { type: "candidate-pair", state: "succeeded", nominated: true,
          localCandidateId: "local", remoteCandidateId: "remote" }],
        ["local", { type: "local-candidate", candidateType: "relay" }],
        ["remote", { type: "remote-candidate", candidateType: "srflx" }],
      ]) as unknown as RTCStatsReport);
    }
    let connection: RelayPeerConnection | null = null;
    const peerConstructor = vi.fn((_configuration: RTCConfiguration) => {
      connection = new RelayPeerConnection();
      return connection;
    });
    vi.stubGlobal("RTCPeerConnection", peerConstructor);
    const updateMedia = vi.fn(async (_partyId: string, update: { media_state: string }) => {
      party = {
        ...party,
        members: party.members.map((entry) => entry.participant_id === owner.participant_id
          ? { ...entry, media_state: update.media_state as typeof entry.media_state }
          : entry),
      };
      return party;
    });
    const getIceConfiguration = vi.fn(async () => ({
      schema: "helix.voice_party.ice_configuration.v1" as const,
      party_id: party.party_id,
      participant_id: owner.participant_id,
      ice_servers: [{
        urls: ["turns:relay.example.test:5349"],
        username: "ephemeral-user",
        credential: "ephemeral-credential",
      }],
      ice_transport_policy: "relay" as const,
      relay_available: true,
      issued_at: "2026-08-31T00:00:00.000Z",
      expires_at: "2026-08-31T00:10:00.000Z",
      model_visible: false as const,
      debug_exportable: false as const,
      persistable: false as const,
      answer_authority: false as const,
    }));
    const projections: Array<{ transport: string }> = [];
    const bridge = createVoicePartyMediaBridge({
      party,
      self: owner,
      api: { updateMedia, getIceConfiguration } as never,
      transportPolicy: "relay",
      onProjection: (projection) => projections.push(projection),
    });

    await bridge.start();
    expect(getIceConfiguration).toHaveBeenCalledWith(party.party_id, "relay");
    expect(peerConstructor).toHaveBeenCalledWith(expect.objectContaining({
      iceTransportPolicy: "relay",
    }));
    connection!.connectionState = "connected";
    connection!.onconnectionstatechange?.();
    await vi.waitFor(() => expect(updateMedia).toHaveBeenCalledWith(
      party.party_id,
      expect.objectContaining({ media_state: "relayed" }),
    ));
    expect(projections).toContainEqual(expect.objectContaining({ transport: "relayed" }));
    await bridge.close();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("fails before microphone acquisition when ICE admission is unavailable", async () => {
    const owner = member("profile:owner", "owner", 1);
    const peer = member("profile:friend", "participant", 2);
    const party: HelixVoiceParty = {
      schema: "helix.voice_party.v1",
      party_id: "voice_party:no-relay",
      owner_profile_id: owner.profile.profile_id,
      state: "connecting",
      max_members: 2,
      room_id: null,
      gpt_attachment_state: "detached",
      members: [owner, peer],
      created_at: "2026-08-31T00:00:00.000Z",
      updated_at: "2026-08-31T00:00:00.000Z",
      ended_at: null,
    };
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const updateMedia = vi.fn(async () => party);
    const projections: Array<{ failure: string | null }> = [];
    const bridge = createVoicePartyMediaBridge({
      party,
      self: owner,
      api: {
        updateMedia,
        getIceConfiguration: vi.fn(async () => {
          throw new Error("relay unavailable");
        }),
      } as never,
      transportPolicy: "relay",
      onProjection: (projection) => projections.push(projection),
    });

    await bridge.start();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(projections).toContainEqual(expect.objectContaining({
      failure: "ice_configuration_unavailable",
    }));
    expect(updateMedia).toHaveBeenCalledWith(party.party_id, expect.objectContaining({
      media_state: "failed",
    }));
  });
});
