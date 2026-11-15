import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom, HelixSharedRealtimeRoomParticipant } from "@shared/helix-shared-realtime-room";
import type { HelixSharedLiveRoomApi } from "../../SharedLiveRoomApi";
import type { SharedLiveRoomMediaBridgeProjection } from "../RoomMediaBridgeContracts";

const mocks = vi.hoisted(() => ({
  startSignaling: vi.fn(),
  sendOffer: vi.fn(async () => undefined),
  closeSignaling: vi.fn(),
  closePlayback: vi.fn(),
  resumeMixer: vi.fn(async () => true),
  closeMixer: vi.fn(async () => undefined),
  replaceProvider: vi.fn(async (_track: unknown) => true),
  restoreProvider: vi.fn(async (_track?: unknown) => true),
  boundary: null as import("../HelixAskLiveMediaBoundary").HelixAskLiveMediaBoundary | null,
}));

vi.mock("../RoomMediaSignaling", () => ({
  createSharedLiveRoomMediaSignaling: () => ({
    start: mocks.startSignaling,
    sendOffer: mocks.sendOffer,
    publishCandidate: vi.fn(),
    close: mocks.closeSignaling,
  }),
}));
vi.mock("../RoomAudioPlayback", () => ({
  createSharedLiveRoomAudioPlayback: () => ({
    attach: vi.fn(), resume: vi.fn(async () => true), close: mocks.closePlayback,
  }),
}));

vi.mock("../RoomAudioMixer", () => ({
  createSharedLiveRoomAudioMixer: () => ({ outputTrack: { kind: "audio" },
    resume: mocks.resumeMixer, close: mocks.closeMixer, setSourceAdmitted: vi.fn() }),
}));
vi.mock("../HelixAskLiveMediaBoundary", () => ({ readHelixAskLiveMediaBoundary: () => mocks.boundary }));

import { createSharedLiveRoomMediaBridge } from "../RoomMediaBridge";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup(role: "owner" | "participant" = "participant") {
  const self = {
    participant_id: "participant:self", role, presence: "present",
    consent: { microphone_to_room: true, microphone_to_model: true, model_audio_output: true, transcript_to_room: true },
  } as HelixSharedRealtimeRoomParticipant;
  const peer = { ...self, participant_id: "participant:peer", role: role === "owner" ? "participant" : "owner" };
  const room = {
    room_id: "room:microphone-start", capacity_profile: "two_person_voice",
    participants: [self, peer], runtime: { active_speaker_participant_id: null },
  } as HelixSharedRealtimeRoom;
  const projections: SharedLiveRoomMediaBridgeProjection[] = [];
  const input = {
    room, self, realtimeSessionId: null,
    providerAttachmentMode: role === "owner" ? "detached" as const : "required" as const,
    api: {} as HelixSharedLiveRoomApi,
    onProjection: (projection: SharedLiveRoomMediaBridgeProjection) => projections.push(projection),
  };
  return { room, self, projections, input, bridge: createSharedLiveRoomMediaBridge(input) };
}

describe("Room media bridge microphone startup lifecycle", () => {
  const getUserMedia = vi.fn();
  const peerConnection = vi.fn();
  let stop: ReturnType<typeof vi.fn>;
  let stream: MediaStream;
  let closeConnection: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.boundary = null;
    mocks.resumeMixer.mockResolvedValue(true);
    mocks.replaceProvider.mockResolvedValue(true);
    mocks.restoreProvider.mockResolvedValue(true);
    stop = vi.fn();
    closeConnection = vi.fn();
    const track = { stop, clone: () => ({ stop: vi.fn() }) };
    stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
    peerConnection.mockImplementation(function () {
      return { addTrack: vi.fn(), close: closeConnection, createDataChannel: () => ({ close: vi.fn() }) };
    });
    vi.stubGlobal("MediaStream", class {
      constructor(private tracks: MediaStreamTrack[] = []) {}
      getAudioTracks() { return this.tracks; }
      getTracks() { return this.tracks; }
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("RTCPeerConnection", peerConnection);
  });

  afterEach(() => vi.unstubAllGlobals());

  const attachedOwner = () => {
    const { input, room, projections } = setup("owner");
    mocks.boundary = {
      realtimeSessionId: "realtime:owner", readOwnerMicrophoneStream: () => stream,
      readProviderOutputStream: () => null, readProviderInputEnabled: () => true,
      replaceProviderInputAudioTrack: mocks.replaceProvider, restoreProviderInputAudioTrack: mocks.restoreProvider,
    };
    const api = { deactivateMediaBridge: vi.fn(async () => room), releaseFloor: vi.fn(async () => room) } as unknown as HelixSharedLiveRoomApi;
    const bridge = createSharedLiveRoomMediaBridge({ ...input, api, realtimeSessionId: "realtime:owner", providerAttachmentMode: "required" });
    const receiveTrack = () => peerConnection.mock.results.at(-1)?.value.ontrack({ track: stream.getAudioTracks()[0] });
    return { bridge, projections, receiveTrack };
  };

  it.each([true, false])("does not reconnect a closed owner bridge after mixer resume returns %s", async resumed => {
    const pending = deferred<boolean>();mocks.resumeMixer.mockReturnValue(pending.promise);
    const { bridge, projections, receiveTrack } = attachedOwner();
    await bridge.start();receiveTrack();
    expect(mocks.resumeMixer).toHaveBeenCalledOnce();
    await bridge.close();const count = projections.length;
    pending.resolve(resumed);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mocks.replaceProvider).not.toHaveBeenCalled();
    expect(projections).toHaveLength(count);expect(projections.at(-1)?.state).toBe("closed");
  });

  it("stops its mixer immediately and restores its exact track during a pending provider replacement", async () => {
    const replacement = deferred<boolean>();const restoration = deferred<boolean>();
    mocks.replaceProvider.mockReturnValueOnce(replacement.promise);mocks.restoreProvider.mockReturnValueOnce(restoration.promise);
    const { bridge, projections, receiveTrack } = attachedOwner();await bridge.start();receiveTrack();
    await vi.waitFor(() => expect(mocks.replaceProvider).toHaveBeenCalledOnce());
    const closing = bridge.close();
    expect(mocks.closeMixer).toHaveBeenCalledOnce();
    expect(closeConnection).toHaveBeenCalledOnce();
    expect(mocks.closePlayback).toHaveBeenCalledOnce();
    expect(projections.at(-1)?.state).toBe("closed");
    expect(mocks.restoreProvider).toHaveBeenCalledWith(mocks.replaceProvider.mock.calls[0][0]);
    restoration.resolve(true);await closing;const count = projections.length;
    replacement.resolve(false);await new Promise(resolve => setTimeout(resolve, 0));
    expect(projections).toHaveLength(count);expect(projections.at(-1)?.state).toBe("closed");
  });

  it("still mixes admitted owner input after a successful resume", async () => {
    const { bridge, projections, receiveTrack } = attachedOwner();
    await bridge.start();receiveTrack();
    await vi.waitFor(() => expect(mocks.replaceProvider).toHaveBeenCalledOnce());
    expect(projections.at(-1)?.provider_input_mixed).toBe(true);
    await bridge.close();expect(mocks.restoreProvider).toHaveBeenCalledOnce();
  });

  it.each(["participant", "owner"] as const)("releases a late %s microphone without reconnecting after close", async (role) => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValue(permission.promise);
    const { bridge, projections } = setup(role);
    const starting = bridge.start();
    await bridge.close();
    const closedProjectionCount = projections.length;
    permission.resolve(stream);
    await starting;
    expect(stop).toHaveBeenCalledOnce();
    expect(peerConnection).not.toHaveBeenCalled();
    expect(mocks.startSignaling).not.toHaveBeenCalled();
    expect(projections).toHaveLength(closedProjectionCount);
    expect(projections.at(-1)?.state).toBe("closed");
  });

  it("keeps the closed state when a pending microphone request is denied", async () => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValue(permission.promise);
    const { bridge, projections } = setup();
    const starting = bridge.start();
    await bridge.close();
    const closedProjectionCount = projections.length;
    permission.reject(new Error("permission denied"));
    await starting;
    expect(projections).toHaveLength(closedProjectionCount);
    expect(projections.at(-1)?.state).toBe("closed");
    expect(peerConnection).not.toHaveBeenCalled();
  });

  it("releases a pending microphone when room consent is withdrawn", async () => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValue(permission.promise);
    const { bridge, room, self } = setup();
    const starting = bridge.start();
    bridge.syncRoom({ ...room, participants: room.participants.map((p) => p.participant_id === self.participant_id
      ? { ...p, consent: { ...p.consent, microphone_to_room: false } } : p) });
    permission.resolve(stream);
    await starting;
    await bridge.close();
    expect(stop).toHaveBeenCalledOnce();
    expect(peerConnection).not.toHaveBeenCalled();
    expect(mocks.startSignaling).not.toHaveBeenCalled();
  });

  it("still connects an admitted participant and releases its microphone on close", async () => {
    getUserMedia.mockResolvedValue(stream);
    const { bridge } = setup();
    await bridge.start();
    expect(peerConnection).toHaveBeenCalledOnce();
    expect(mocks.startSignaling).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
    await bridge.close();
    expect(stop).toHaveBeenCalledOnce();
    expect(closeConnection).toHaveBeenCalledOnce();
  });

  it("declines unsupported group voice before requesting a microphone", async () => {
    const { input, projections } = setup();
    const bridge = createSharedLiveRoomMediaBridge({ ...input, room: { ...input.room, capacity_profile: "three_person_voice" } });
    await bridge.start();
    expect(projections.at(-1)?.failure).toBe("group_voice_media_unavailable");
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(peerConnection).not.toHaveBeenCalled();
    await bridge.close();
  });
});
