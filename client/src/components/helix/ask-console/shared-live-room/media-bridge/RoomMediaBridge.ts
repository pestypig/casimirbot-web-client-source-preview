import type {
  HelixSharedRealtimeRoom,
  HelixSharedRealtimeRoomParticipant,
} from "@shared/helix-shared-realtime-room";
import type { HelixSharedLiveRoomApi } from "../SharedLiveRoomApi";
import { readHelixAskLiveMediaBoundary } from "./HelixAskLiveMediaBoundary";
import { createSharedLiveRoomAudioMixer, type SharedLiveRoomAudioMixer } from
  "./RoomAudioMixer";
import {
  createSharedLiveRoomAudioPlayback,
  type SharedLiveRoomAudioPlayback,
} from "./RoomAudioPlayback";
import type {
  SharedLiveRoomMediaBridgeFailure,
  SharedLiveRoomMediaBridgeProjection,
  SharedLiveRoomProviderAttachmentMode,
} from "./RoomMediaBridgeContracts";
import { createSharedLiveRoomTranscriptDataChannel } from
  "./RoomTranscriptDataChannel";
import { createSharedLiveRoomTranscriptFanout } from
  "./RoomTranscriptFanout";
import { appendRoomTranscriptHistory } from "./RoomTranscriptHistory";
import {
  readSharedLiveRoomIceConfigurationFromEnvironment,
} from "./RoomIceConfiguration";
import {
  createSharedLiveRoomMediaSignaling,
  type SharedLiveRoomMediaSignaling,
} from "./RoomMediaSignaling";
import {
  createSharedLiveRoomPeerConnectionRecovery,
  type SharedLiveRoomPeerConnectionRecovery,
} from "./RoomPeerConnectionRecovery";

export type SharedLiveRoomMediaBridge = {
  start(): Promise<void>;
  syncRoom(room: HelixSharedRealtimeRoom): void;
  resumePlayback(): Promise<boolean>;
  close(): Promise<void>;
};

const microphoneConstraints: MediaTrackConstraints = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  channelCount: { ideal: 1 },
};

const findPeer = (
  room: HelixSharedRealtimeRoom,
  selfId: string,
): HelixSharedRealtimeRoomParticipant | null =>
  room.participants.find(
    (participant) =>
      participant.participant_id !== selfId &&
      participant.presence === "present",
  ) ?? null;

export const createSharedLiveRoomMediaBridge = (input: {
  room: HelixSharedRealtimeRoom;
  self: HelixSharedRealtimeRoomParticipant;
  realtimeSessionId: string | null;
  providerAttachmentMode?: SharedLiveRoomProviderAttachmentMode;
  api: HelixSharedLiveRoomApi;
  onProjection(projection: SharedLiveRoomMediaBridgeProjection): void;
  iceServers?: RTCIceServer[];
}): SharedLiveRoomMediaBridge => {
  const role = input.self.role === "owner" ? "owner" : "participant";
  const providerAttachmentMode = input.providerAttachmentMode ?? "required";
  const providerAttached = providerAttachmentMode === "required";
  let room = input.room;
  let peer = findPeer(room, input.self.participant_id);
  let connection: RTCPeerConnection | null = null;
  let localMicrophone: MediaStream | null = null;
  let audioPlayback: SharedLiveRoomAudioPlayback | null = null;
  let mixer: SharedLiveRoomAudioMixer | null = null;
  let closed = false;
  let closePromise: Promise<void> | null = null;
  let providerOutputForwarded = false;
  let signaling: SharedLiveRoomMediaSignaling | null = null;
  let peerRecovery: SharedLiveRoomPeerConnectionRecovery | null = null;
  const ownedClonedTracks: MediaStreamTrack[] = [];
  const iceConfiguration = input.iceServers
    ? {
        iceServers: input.iceServers,
        source: "configured" as const,
        error: null,
      }
    : readSharedLiveRoomIceConfigurationFromEnvironment();
  let projection: SharedLiveRoomMediaBridgeProjection = {
    state: "idle",
    role,
    provider_attachment_mode: providerAttachmentMode,
    peer_audio_connected: false,
    remote_audio_playback_ready: false,
    provider_input_mixed: false,
    provider_input_enabled: false,
    provider_audio_forwarded: false,
    active_model_speaker_participant_id: null,
    latest_shared_transcript: null,
    recent_shared_transcripts: [],
    ice_configuration: iceConfiguration.source,
    ice_configuration_error: iceConfiguration.error,
    failure: null,
  };

  const update = (patch: Partial<SharedLiveRoomMediaBridgeProjection>): void => {
    projection = { ...projection, ...patch };
    input.onProjection(projection);
  };
  const fail = (failure: SharedLiveRoomMediaBridgeFailure): void => {
    update({ state: "error", failure });
  };
  let terminateForMediaFailure = (
    failure: SharedLiveRoomMediaBridgeFailure,
  ): void => fail(failure);
  const transcriptAuthorized = (): boolean => {
    const currentSelf = room.participants.find(
      (participant) => participant.participant_id === input.self.participant_id,
    );
    return Boolean(
      currentSelf?.consent.transcript_to_room &&
      peer?.consent.transcript_to_room,
    );
  };
  const transcriptChannel = createSharedLiveRoomTranscriptDataChannel({
    role,
    isAuthorized: transcriptAuthorized,
    onTranscript: (transcript) => update(transcript
      ? {
          latest_shared_transcript: transcript,
          recent_shared_transcripts: appendRoomTranscriptHistory(projection.recent_shared_transcripts ?? [], transcript),
        }
      : { latest_shared_transcript: null, recent_shared_transcripts: [] }),
  });
  const transcriptFanout = createSharedLiveRoomTranscriptFanout({
    role,
    realtimeSessionId: input.realtimeSessionId,
    getRoom: () => room,
    channel: transcriptChannel,
  });
  const connectOwnerModelMixer = async (participantTrack: MediaStreamTrack): Promise<void> => {
    if (!providerAttached || role !== "owner" || mixer || !localMicrophone) return;
    const boundary = readHelixAskLiveMediaBoundary(input.realtimeSessionId);
    if (!boundary) return terminateForMediaFailure("live_media_boundary_unavailable");
    try {
      mixer = createSharedLiveRoomAudioMixer({
        ownerMicrophone: localMicrophone,
        participantMicrophone: new MediaStream([participantTrack]),
      });
    } catch {
      return terminateForMediaFailure("provider_input_replace_failed");
    }
    if (!await mixer.resume().catch(() => false)) {
      await mixer.close().catch(() => undefined);
      mixer = null;
      return terminateForMediaFailure("audio_context_suspended");
    }
    const replaced = await boundary
      .replaceProviderInputAudioTrack(mixer.outputTrack)
      .catch(() => false);
    if (!replaced) {
      await mixer.close().catch(() => undefined);
      mixer = null;
      return terminateForMediaFailure("provider_input_replace_failed");
    }
    update({
      provider_input_mixed: true,
      provider_input_enabled: boundary.readProviderInputEnabled(),
    });
    syncFloor();
  };
  const syncFloor = (): void => {
    if (!providerAttached || !mixer || !peer) return;
    const activeId = room.runtime.active_speaker_participant_id;
    const owner = room.participants.find((participant) => participant.role === "owner");
    const participant = room.participants.find((candidate) => candidate.role === "participant");
    mixer.setSourceAdmitted(
      "owner",
      Boolean(owner?.consent.microphone_to_model && activeId === owner.participant_id),
    );
    mixer.setSourceAdmitted(
      "participant",
      Boolean(
        participant?.consent.microphone_to_model &&
        activeId === participant.participant_id,
      ),
    );
    update({ active_model_speaker_participant_id: activeId });
  };
  const addOwnerTracks = (): void => {
    if (!connection || !localMicrophone || !peer) return;
    const ownerTrack = localMicrophone.getAudioTracks()[0]?.clone();
    if (ownerTrack) {
      ownerTrack.enabled = input.self.consent.microphone_to_room;
      ownedClonedTracks.push(ownerTrack);
      connection.addTrack(ownerTrack, new MediaStream([ownerTrack]));
    }
    const boundary = providerAttached
      ? readHelixAskLiveMediaBoundary(input.realtimeSessionId)
      : null;
    const providerTrack = (boundary?.readProviderOutputStream() as MediaStream | null)
      ?.getAudioTracks()[0]
      ?.clone();
    if (providerTrack && peer.consent.model_audio_output) {
      ownedClonedTracks.push(providerTrack);
      connection.addTrack(providerTrack, new MediaStream([providerTrack]));
      providerOutputForwarded = true;
      update({ provider_audio_forwarded: true });
    }
  };
  const close = (notifyPeer = true): Promise<void> => {
    if (closePromise) return closePromise;
    closed = true;
    peerRecovery?.close();
    const floorRelease = providerAttached && room.runtime.active_speaker_participant_id ===
      input.self.participant_id
      ? input.api.releaseFloor(room.room_id).catch(() => null)
      : Promise.resolve(null);
    const runtimeDemotion = providerAttached && role === "owner"
      ? input.api.deactivateMediaBridge(room.room_id).catch(() => null)
      : Promise.resolve(null);
    signaling?.close(notifyPeer);
    closePromise = (async () => {
      if (providerAttached && role === "owner" && mixer) {
        const boundary = readHelixAskLiveMediaBoundary(input.realtimeSessionId);
        await boundary?.restoreProviderInputAudioTrack().catch(() => false);
      }
      await mixer?.close().catch(() => undefined);
      mixer = null;
      for (const track of ownedClonedTracks) track.stop();
      if (role === "participant" || !providerAttached) {
        localMicrophone?.getTracks().forEach((track) => track.stop());
      }
      audioPlayback?.close();
      audioPlayback = null;
      transcriptFanout.close();
      transcriptChannel.close();
      connection?.close();
      connection = null;
      update({
        state: "closed",
        peer_audio_connected: false,
        remote_audio_playback_ready: false,
        latest_shared_transcript: null,
        recent_shared_transcripts: [],
      });
      await Promise.all([floorRelease, runtimeDemotion]);
    })();
    return closePromise;
  };
  terminateForMediaFailure = (failure) => {
    fail(failure);
    void close(false);
  };
  peerRecovery = createSharedLiveRoomPeerConnectionRecovery({
    onTerminalFailure: () => {
      fail("peer_connection_failed");
      void close(false);
    },
  });

  signaling = createSharedLiveRoomMediaSignaling({
    role,
    api: input.api,
    getRoom: () => room,
    getPeer: () => peer,
    getConnection: () => connection,
    onNegotiating: () => update({ state: "negotiating" }),
    onFailure: () => update({ state: "degraded", failure: "signaling_failed" }),
    onHangup: () => {
      void close(false);
    },
  });

  return {
    async start() {
      if (closed || connection) return;
      try {
      peer = findPeer(room, input.self.participant_id);
      if (!peer || !input.self.consent.microphone_to_room) {
        return fail("microphone_consent_required");
      }
      update({ state: "waiting_for_peer", failure: null });
      if (role === "owner" && providerAttached) {
        const boundary = readHelixAskLiveMediaBoundary(input.realtimeSessionId);
        const stream = boundary?.readOwnerMicrophoneStream() as MediaStream | null;
        if (!boundary) return fail("live_media_boundary_unavailable");
        if (!stream?.getAudioTracks()[0]) return fail("owner_microphone_unavailable");
        localMicrophone = stream;
      } else {
        try {
          localMicrophone = await navigator.mediaDevices.getUserMedia({
            audio: microphoneConstraints,
          });
        } catch {
          return fail(role === "owner"
            ? "owner_microphone_unavailable"
            : "participant_microphone_unavailable");
        }
      }
      connection = new RTCPeerConnection({
        iceServers: iceConfiguration.iceServers,
      });
      audioPlayback = createSharedLiveRoomAudioPlayback({
        onBlocked: () => update({
          state: "degraded",
          remote_audio_playback_ready: false,
          failure: "remote_audio_playback_blocked",
        }),
        onPlaying: () => update({
          state: connection?.connectionState === "connected"
            ? "active"
            : projection.state,
          remote_audio_playback_ready: true,
          failure: projection.failure === "remote_audio_playback_blocked"
            ? null
            : projection.failure,
        }),
      });
      connection.onicecandidate = (event) => {
        if (!event.candidate) return;
        void signaling?.publishCandidate(event.candidate.toJSON())
          .catch(() => update({ state: "degraded", failure: "signaling_failed" }));
      };
      connection.ontrack = (event) => {
        audioPlayback?.attach(event.track);
        if (role === "owner" && providerAttached) void connectOwnerModelMixer(event.track);
      };
      if (role === "owner" && providerAttached) {
        transcriptChannel.attach(connection.createDataChannel("helix-room-events"));
        transcriptFanout.start();
      } else if (role === "participant" && providerAttached) {
        connection.ondatachannel = (event) => transcriptChannel.attach(event.channel);
      }
      connection.onconnectionstatechange = () => {
        if (!connection) return;
        peerRecovery?.observe(connection.connectionState);
        if (connection.connectionState === "connected") {
          const playbackBlocked =
            !projection.remote_audio_playback_ready &&
            projection.failure === "remote_audio_playback_blocked";
          update({
            state: playbackBlocked ? "degraded" : "active",
            peer_audio_connected: true,
            failure: playbackBlocked ? "remote_audio_playback_blocked" : null,
          });
          if (role === "owner" && providerAttached) {
            void input.api.activateMediaBridge(room.room_id)
              .catch(() => {
                fail("signaling_failed");
                void close(false);
              });
          }
        } else if (connection.connectionState === "failed") {
          // Recovery observes this as terminal and closes/restores the host path.
        } else if (connection.connectionState === "disconnected") {
          update({ state: "degraded", peer_audio_connected: false });
        }
      };
      if (role === "owner") addOwnerTracks();
      else {
        const participantTrack = localMicrophone.getAudioTracks()[0];
        connection.addTrack(participantTrack, localMicrophone);
      }
      signaling?.start();
      if (role === "owner") {
        try {
          await signaling?.sendOffer();
        } catch {
          fail("signaling_failed");
          await close(false);
        }
      }
      } catch {
        fail("peer_connection_failed");
        await close(false);
      }
    },
    resumePlayback: () => audioPlayback?.resume() ?? Promise.resolve(false),
    syncRoom(nextRoom) {
      if (closed) return;
      room = nextRoom;
      peer = findPeer(room, input.self.participant_id);
      const currentSelf = room.participants.find(
        (participant) => participant.participant_id === input.self.participant_id,
      );
      if (
        !currentSelf ||
        !peer ||
        currentSelf.presence !== "present" ||
        !currentSelf.consent.microphone_to_room ||
        !peer.consent.microphone_to_room ||
        (providerAttached && (
          !currentSelf.consent.model_audio_output ||
          !peer.consent.model_audio_output
        ))
      ) {
        void close(false);
        return;
      }
      transcriptChannel.syncConsent();
      if (role === "owner" && providerAttached) {
        const boundary = readHelixAskLiveMediaBoundary(input.realtimeSessionId);
        update({
          provider_input_enabled: boundary?.readProviderInputEnabled() === true,
        });
      }
      syncFloor();
      if (
        providerAttached &&
        role === "owner" &&
        connection &&
        !providerOutputForwarded &&
        peer?.consent.model_audio_output
      ) {
        const boundary = readHelixAskLiveMediaBoundary(input.realtimeSessionId);
        const providerTrack = (boundary?.readProviderOutputStream() as MediaStream | null)
          ?.getAudioTracks()[0]
          ?.clone();
        if (providerTrack) {
          try {
            ownedClonedTracks.push(providerTrack);
            connection.addTrack(providerTrack, new MediaStream([providerTrack]));
            providerOutputForwarded = true;
            update({ provider_audio_forwarded: true });
            void signaling?.sendOffer().catch(() => {
              fail("signaling_failed");
              void close(false);
            });
          } catch {
            providerTrack.stop();
            fail("signaling_failed");
            void close(false);
          }
        }
      }
    },
    close: () => close(true),
  };
};
