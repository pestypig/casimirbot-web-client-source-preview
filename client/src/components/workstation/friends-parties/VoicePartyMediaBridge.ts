import type {
  HelixVoiceParty,
  HelixVoicePartyMediaState,
  HelixVoicePartyMember,
} from "@shared/helix-friends-voice-party";
import { createSharedLiveRoomAudioPlayback } from
  "../../helix/ask-console/shared-live-room/media-bridge/RoomAudioPlayback";
import { createSharedLiveRoomPeerConnectionRecovery } from
  "../../helix/ask-console/shared-live-room/media-bridge/RoomPeerConnectionRecovery";
import type { FriendsPartiesApi } from "./FriendsPartiesApi";
import { createVoicePartyMediaSignaling } from "./VoicePartyMediaSignaling";

export type VoicePartyMediaBridgeState =
  | "idle" | "waiting_for_peer" | "negotiating" | "active"
  | "degraded" | "closed" | "error";

export type VoicePartyMediaProjection = {
  state: VoicePartyMediaBridgeState;
  transport: "unknown" | "direct" | "relayed";
  peer_audio_connected: boolean;
  remote_audio_playback_ready: boolean;
  muted: boolean;
  deafened: boolean;
  failure: "microphone_unavailable" | "peer_connection_failed" |
    "signaling_failed" | "ice_configuration_unavailable" |
    "remote_audio_playback_blocked" | null;
};

export const INITIAL_VOICE_PARTY_MEDIA_PROJECTION: VoicePartyMediaProjection = {
  state: "idle",
  transport: "unknown",
  peer_audio_connected: false,
  remote_audio_playback_ready: false,
  muted: false,
  deafened: false,
  failure: null,
};

const findPeer = (party: HelixVoiceParty, selfId: string): HelixVoicePartyMember | null =>
  party.members.find((member) => member.participant_id !== selfId && member.state !== "left") ?? null;

const detectTransport = async (
  connection: RTCPeerConnection,
): Promise<"unknown" | "direct" | "relayed"> => {
  try {
    const report = await connection.getStats();
    let pair: RTCStats | null = null;
    report.forEach((entry) => {
      if (
        entry.type === "candidate-pair" && entry.state === "succeeded" &&
        (entry.selected === true || entry.nominated === true)
      ) pair = entry;
    });
    if (!pair) return "unknown";
    const local = report.get(String((pair as RTCStats & { localCandidateId?: string }).localCandidateId)) as
      (RTCStats & { candidateType?: string }) | undefined;
    const remote = report.get(String((pair as RTCStats & { remoteCandidateId?: string }).remoteCandidateId)) as
      (RTCStats & { candidateType?: string }) | undefined;
    const types = [local?.candidateType, remote?.candidateType].filter(Boolean);
    if (types.includes("relay")) return "relayed";
    return types.length > 0 ? "direct" : "unknown";
  } catch {
    return "unknown";
  }
};

export type VoicePartyMediaBridge = {
  start(): Promise<void>;
  syncParty(party: HelixVoiceParty): void;
  setMuted(muted: boolean): Promise<void>;
  setDeafened(deafened: boolean): Promise<void>;
  resumePlayback(): Promise<boolean>;
  close(): Promise<void>;
};

export const createVoicePartyMediaBridge = (input: {
  party: HelixVoiceParty;
  self: HelixVoicePartyMember;
  api: FriendsPartiesApi;
  onProjection(projection: VoicePartyMediaProjection): void;
  iceServers?: RTCIceServer[];
  transportPolicy?: "all" | "relay";
}): VoicePartyMediaBridge => {
  let party = input.party;
  let peer = findPeer(party, input.self.participant_id);
  let connection: RTCPeerConnection | null = null;
  let microphone: MediaStream | null = null;
  let playback: ReturnType<typeof createSharedLiveRoomAudioPlayback> | null = null;
  let iceRestartInFlight = false;
  let closed = false;
  let projection: VoicePartyMediaProjection = {
    ...INITIAL_VOICE_PARTY_MEDIA_PROJECTION,
    muted: input.self.muted,
    deafened: input.self.deafened,
  };
  const update = (patch: Partial<VoicePartyMediaProjection>): void => {
    projection = { ...projection, ...patch };
    input.onProjection(projection);
  };
  const reportMedia = async (mediaState: HelixVoicePartyMediaState): Promise<void> => {
    party = await input.api.updateMedia(party.party_id, {
      media_state: mediaState,
      muted: projection.muted,
      deafened: projection.deafened,
    });
  };
  const ownMediaState = (): HelixVoicePartyMediaState =>
    party.members.find((member) => member.participant_id === input.self.participant_id)
      ?.media_state ?? "idle";
  const role = input.self.role;
  const recovery = createSharedLiveRoomPeerConnectionRecovery({
    disconnectGraceMs: 20_000,
    onTerminalFailure: () => {
      update({ state: "error", peer_audio_connected: false, failure: "peer_connection_failed" });
      void reportMedia("failed").catch(() => undefined);
      void close(false, false);
    },
  });
  const signaling = createVoicePartyMediaSignaling({
    role,
    api: input.api,
    getParty: () => party,
    getPeer: () => peer,
    getConnection: () => connection,
    onNegotiating: () => update({ state: "negotiating" }),
    onFailure: () => {
      update({ state: "degraded", failure: "signaling_failed" });
      void reportMedia("degraded").catch(() => undefined);
    },
    onHangup: () => void close(false, true),
  });

  const close = async (notifyPeer: boolean, reportStopped: boolean): Promise<void> => {
    if (closed) return;
    closed = true;
    signaling.close(notifyPeer);
    recovery.close();
    microphone?.getTracks().forEach((track) => track.stop());
    playback?.close();
    connection?.close();
    connection = null;
    update({ state: "closed", peer_audio_connected: false, remote_audio_playback_ready: false });
    if (reportStopped) await reportMedia("stopped").catch(() => undefined);
  };

  return {
    async start() {
      if (closed || connection) return;
      peer = findPeer(party, input.self.participant_id);
      if (!peer || party.state === "ended") {
        update({ state: "waiting_for_peer" });
        return;
      }
      update({ state: "waiting_for_peer", failure: null });
      await reportMedia("connecting");
      let peerConfiguration: RTCConfiguration;
      try {
        if (input.iceServers) {
          peerConfiguration = {
            iceServers: input.iceServers,
            iceTransportPolicy: input.transportPolicy ?? "all",
          };
        } else {
          const admitted = await input.api.getIceConfiguration(
            party.party_id,
            input.transportPolicy ?? "all",
          );
          peerConfiguration = {
            iceServers: admitted.ice_servers,
            iceTransportPolicy: admitted.ice_transport_policy,
          };
        }
      } catch {
        update({ state: "error", failure: "ice_configuration_unavailable" });
        await reportMedia("failed").catch(() => undefined);
        return;
      }
      try {
        microphone = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
            channelCount: { ideal: 1 },
          },
        });
      } catch {
        update({ state: "error", failure: "microphone_unavailable" });
        await reportMedia("failed").catch(() => undefined);
        return;
      }
      const localTrack = microphone.getAudioTracks()[0];
      localTrack.enabled = !projection.muted;
      connection = new RTCPeerConnection(peerConfiguration);
      playback = createSharedLiveRoomAudioPlayback({
        onBlocked: () => update({
          state: "degraded",
          remote_audio_playback_ready: false,
          failure: "remote_audio_playback_blocked",
        }),
        onPlaying: () => update({ remote_audio_playback_ready: true }),
      });
      playback.setMuted(projection.deafened);
      connection.addTrack(localTrack, microphone);
      connection.ontrack = (event) => playback?.attach(event.track);
      connection.onicecandidate = (event) => {
        if (event.candidate) void signaling.publishCandidate(event.candidate.toJSON())
          .catch(() => update({ state: "degraded", failure: "signaling_failed" }));
      };
      connection.onconnectionstatechange = () => {
        if (!connection) return;
        if (connection.connectionState === "connected") {
          recovery.observe("connected");
          update({ state: "active", peer_audio_connected: true, failure: null });
          void reportMedia("connected").then(async () => {
            if (!connection) return;
            const transport = await detectTransport(connection);
            update({ transport });
            if (transport !== "unknown") await reportMedia(transport);
          }).catch(() => undefined);
        } else if (
          connection.connectionState === "disconnected" ||
          connection.connectionState === "failed"
        ) {
          recovery.observe("disconnected");
          update({ state: "degraded", peer_audio_connected: false });
          void reportMedia("degraded").catch(() => undefined);
          if (
            role === "owner" && !iceRestartInFlight && connection.restartIce
          ) {
            iceRestartInFlight = true;
            try {
              connection.restartIce();
              void signaling.sendOffer()
                .catch(() => update({ state: "degraded", failure: "signaling_failed" }))
                .finally(() => { iceRestartInFlight = false; });
            } catch {
              iceRestartInFlight = false;
            }
          }
        } else {
          recovery.observe(connection.connectionState);
        }
      };
      signaling.start();
      if (role === "owner") await signaling.sendOffer();
    },
    syncParty(nextParty) {
      party = nextParty;
      peer = findPeer(party, input.self.participant_id);
      if (party.state === "ended" || !party.members.some(
        (member) => member.participant_id === input.self.participant_id && member.state !== "left",
      )) void close(false, false);
    },
    async setMuted(muted) {
      projection = { ...projection, muted };
      microphone?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
      update({ muted });
      const mediaState = ownMediaState();
      await reportMedia(mediaState === "stopped" ? "idle" : mediaState);
    },
    async setDeafened(deafened) {
      playback?.setMuted(deafened);
      update({ deafened });
      const mediaState = ownMediaState();
      await reportMedia(mediaState === "stopped" ? "idle" : mediaState);
    },
    resumePlayback: () => playback?.resume() ?? Promise.resolve(false),
    close: () => close(true, true),
  };
};
