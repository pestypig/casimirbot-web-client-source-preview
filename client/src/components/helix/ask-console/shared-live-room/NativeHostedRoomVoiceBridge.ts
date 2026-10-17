import { DESKTOP_AUTH0_ROOM_CONTROL_PATH } from "@shared/desktop-auth0-account-link";
import { readSharedLiveRoomIceConfigurationFromEnvironment } from "./media-bridge/RoomIceConfiguration";
import { createSharedLiveRoomAudioPlayback, type SharedLiveRoomAudioPlayback } from "./media-bridge/RoomAudioPlayback";

type Admission = { participant_id: string; expires_at: string };
type VoiceState = { call_id: string | null; admissions: Admission[] };
type Signal = { signal_id: string; call_id: string; sender_participant_id: string;
  target_participant_id: string; negotiation_id: string; kind: "offer" | "answer" | "ice_candidate" | "hangup";
  description: RTCSessionDescriptionInit | null; candidate: RTCIceCandidateInit | null };
type Peer = { connection: RTCPeerConnection; playback: SharedLiveRoomAudioPlayback;
  negotiationId: string; candidates: RTCIceCandidateInit[];
  audioTrack: MediaStreamTrack | null };
const MAX_UNVERIFIED_MEDIA_MS = 10_000;
export type HostedVoiceSnapshot = { phase: "idle" | "joining" | "waiting" | "connected" | "error";
  active: boolean; admittedParticipantIds: string[]; connectedParticipantIds: string[];
  receivedAudioParticipantIds: string[]; error: string | null };

const call = async (body: Record<string, unknown>): Promise<any> => {
  const response = await fetch(DESKTOP_AUTH0_ROOM_CONTROL_PATH, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok || !value?.ok) throw new Error(typeof value?.error === "string" ? value.error : "voice_service_unavailable");
  return value;
};

/** A human-only mesh. Signaling admission is never reported as connected audio. */
export class NativeHostedRoomVoiceBridge {
  private stream: MediaStream | null = null;
  private callId: string | null = null;
  private cursor: string | null = null;
  private peers = new Map<string, Peer>();
  private earlyCandidates = new Map<string, RTCIceCandidateInit[]>();
  private admitted: string[] = [];
  private connected = new Set<string>();
  private receivedAudio = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private starting = false;
  private generation = 0;
  private polling = false;
  private lastStateAt = 0;
  private lastAdmitAt = 0;
  private lastVerifiedAt = 0;
  private phase: HostedVoiceSnapshot["phase"] = "idle";
  private error: string | null = null;

  constructor(private readonly roomId: string, private readonly selfId: string,
    private readonly onChange: (snapshot: HostedVoiceSnapshot) => void) {}

  private emit() {
    this.onChange({ phase: this.phase, active: this.running || this.phase === "joining",
      admittedParticipantIds: [...this.admitted],
      connectedParticipantIds: [...this.connected],
      receivedAudioParticipantIds: [...this.receivedAudio], error: this.error });
  }

  private closePeer(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    peer.connection.close(); peer.playback.close();
    this.connected.delete(id); this.receivedAudio.delete(id); this.emit();
  }

  private resetCall(callId: string | null) {
    if (this.callId === callId) return;
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.earlyCandidates.clear();
    this.callId = callId; this.cursor = null;
  }

  private async publish(target: string, negotiationId: string, kind: Signal["kind"],
    description: RTCSessionDescriptionInit | null = null, candidate: RTCIceCandidateInit | null = null) {
    if (!this.running || !this.callId) return;
    const request = { operation: "voice_signal_publish", room_id: this.roomId,
      request: { call_id: this.callId, client_signal_id: crypto.randomUUID(),
        target_participant_id: target, negotiation_id: negotiationId, kind, description, candidate } };
    try { await call(request); }
    catch (error) {
      if (!this.running || !(error instanceof TypeError ||
        (error instanceof Error && error.message === "voice_service_unavailable"))) throw error;
      await call(request);
    }
  }

  private makePeer(id: string, negotiationId: string): Peer {
    this.closePeer(id);
    const configuration = readSharedLiveRoomIceConfigurationFromEnvironment();
    const connection = new RTCPeerConnection({ iceServers: configuration.iceServers });
    const playback = createSharedLiveRoomAudioPlayback({ onBlocked: () => {
      this.error = "audio_playback_blocked"; this.emit();
    }, onPlaying: () => this.emit() });
    const peer: Peer = { connection, playback, negotiationId, candidates: [], audioTrack: null };
    this.peers.set(id, peer);
    for (const track of this.stream?.getAudioTracks() ?? []) connection.addTrack(track, this.stream!);
    connection.ontrack = event => {
      if (this.peers.get(id) !== peer || event.track.kind !== "audio" ||
          event.track.readyState === "ended") return;
      peer.audioTrack = event.track;
      this.receivedAudio.add(id);
      event.track.addEventListener("ended", () => {
        if (this.peers.get(id) === peer && peer.audioTrack === event.track) {
          peer.audioTrack = null; this.receivedAudio.delete(id); this.emit();
        }
      }, { once: true });
      playback.attach(event.track);
      this.emit();
    };
    connection.onicecandidate = event => {
      if (this.peers.get(id) === peer && event.candidate)
        void this.publish(id, negotiationId, "ice_candidate", null, event.candidate.toJSON())
          .catch(() => { this.error = "voice_signal_unavailable"; this.emit(); });
    };
    connection.onconnectionstatechange = () => {
      if (this.peers.get(id) !== peer) return;
      if (connection.connectionState === "connected") this.connected.add(id);
      else this.connected.delete(id);
      if (["failed", "closed"].includes(connection.connectionState)) this.closePeer(id);
      this.phase = this.connected.size ? "connected" : "waiting"; this.emit();
    };
    return peer;
  }

  private async addCandidate(peer: Peer, candidate: RTCIceCandidateInit) {
    if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(candidate);
    else peer.candidates.push(candidate);
  }

  private async flushCandidates(peer: Peer) {
    for (const candidate of peer.candidates.splice(0)) await peer.connection.addIceCandidate(candidate);
  }

  private async receive(signal: Signal) {
    if (!this.running || signal.call_id !== this.callId || signal.target_participant_id !== this.selfId ||
      !this.admitted.includes(signal.sender_participant_id)) return;
    const id = signal.sender_participant_id;
    if (signal.kind === "hangup") { this.closePeer(id); return; }
    if (signal.kind === "offer") {
      // Only the lower ID initiates. Reject glare or stale foreign negotiations.
      if (id >= this.selfId || signal.description?.type !== "offer") return;
      const peer = this.makePeer(id, signal.negotiation_id);
      peer.candidates.push(...(this.earlyCandidates.get(`${id}:${signal.negotiation_id}`) ?? []));
      this.earlyCandidates.delete(`${id}:${signal.negotiation_id}`);
      await peer.connection.setRemoteDescription(signal.description);
      await this.flushCandidates(peer);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      await this.publish(id, peer.negotiationId, "answer", answer);
      return;
    }
    const peer = this.peers.get(id);
    if (!peer && signal.kind === "ice_candidate" && signal.candidate && id < this.selfId) {
      const key = `${id}:${signal.negotiation_id}`;
      if (!this.earlyCandidates.has(key) && this.earlyCandidates.size >= 4)
        this.earlyCandidates.delete(this.earlyCandidates.keys().next().value!);
      const pending = this.earlyCandidates.get(key) ?? [];
      if (pending.length < 32) pending.push(signal.candidate);
      this.earlyCandidates.set(key, pending);
      return;
    }
    if (!peer || peer.negotiationId !== signal.negotiation_id) return;
    if (signal.kind === "answer" && signal.description?.type === "answer" &&
        peer.connection.signalingState === "have-local-offer") {
      await peer.connection.setRemoteDescription(signal.description);
      await this.flushCandidates(peer);
    } else if (signal.kind === "ice_candidate" && signal.candidate) {
      await this.addCandidate(peer, signal.candidate);
    }
  }

  private async synchronize(state: VoiceState) {
    this.resetCall(state.call_id);
    this.admitted = state.admissions.map(item => item.participant_id);
    for (const id of [...this.peers.keys()]) if (!this.admitted.includes(id)) this.closePeer(id);
    if (!state.call_id || !this.admitted.includes(this.selfId)) throw new Error("voice_admission_lost");
    for (const id of this.admitted) {
      if (id === this.selfId || id < this.selfId || this.peers.has(id)) continue;
      const negotiationId = crypto.randomUUID();
      const peer = this.makePeer(id, negotiationId);
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      await this.publish(id, negotiationId, "offer", offer);
    }
    this.phase = this.connected.size ? "connected" : "waiting"; this.emit();
  }

  private async poll() {
    if (!this.running || this.polling) return;
    this.polling = true;
    try {
      const now = Date.now();
      if (!this.callId || now - this.lastAdmitAt >= 15_000 || now - this.lastStateAt >= 3_000) {
        const admit = !this.callId || now - this.lastAdmitAt >= 15_000;
        const state = await call({ operation: admit ? "voice_admit" : "voice_inspect",
          room_id: this.roomId }) as VoiceState;
        if (!this.running) return;
        this.lastStateAt = now;
        if (admit) this.lastAdmitAt = now;
        await this.synchronize(state);
        this.lastVerifiedAt = Date.now();
      }
      const list = await call({ operation: "voice_signal_list", room_id: this.roomId,
        request: { call_id: this.callId, after: this.cursor } });
      if (!this.running || list.call_id !== this.callId) return;
      this.lastVerifiedAt = Date.now();
      for (const signal of (list.signals ?? []) as Signal[]) {
        // Cursor advances even for ignored signals so an invalid packet cannot stall the call.
        this.cursor = signal.signal_id;
        await this.receive(signal);
      }
      this.error = null;
    } catch (error) {
      if (!this.running) return;
      const code = error instanceof Error ? error.message : "voice_service_unavailable";
      if (["voice_admission_lost", "voice_consent_required", "voice_member_not_present",
        "voice_profile_unavailable"].includes(code)) {
        await this.stop();
        this.error = code; this.phase = "error"; this.emit();
      } else if (code === "voice_cursor_expired" || code === "voice_call_unavailable") {
        this.resetCall(null);
        this.lastAdmitAt = 0;
      } else if (!this.lastVerifiedAt || Date.now() - this.lastVerifiedAt >= MAX_UNVERIFIED_MEDIA_MS) {
        await this.stop();
        this.error = "voice_admission_unverified"; this.phase = "error"; this.emit();
      } else {
        this.error = code; this.phase = "error"; this.emit();
      }
    } finally {
      this.polling = false;
      if (this.running) this.timer = setTimeout(() => void this.poll(), 750);
    }
  }

  async start() {
    if (this.running || this.starting) return;
    const generation = ++this.generation;
    this.starting = true;
    this.phase = "joining"; this.error = null; this.emit();
    try {
      const capturedStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true,
        noiseSuppression: true }, video: false });
      if (generation !== this.generation) {
        capturedStream.getTracks().forEach(track => track.stop()); return;
      }
      this.stream = capturedStream;
      await call({ operation: "voice_consent", room_id: this.roomId,
        request: { microphone_to_room: true } });
      if (generation !== this.generation) {
        capturedStream.getTracks().forEach(track => track.stop()); this.stream = null;
        await call({ operation: "voice_consent", room_id: this.roomId,
          request: { microphone_to_room: false } }).catch(() => undefined);
        return;
      }
      this.running = true;
      await this.poll();
    } catch (error) {
      const hadStream = Boolean(this.stream);
      this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
      if (hadStream || generation !== this.generation) await call({ operation: "voice_consent", room_id: this.roomId,
        request: { microphone_to_room: false } }).catch(() => undefined);
      this.error = error instanceof Error ? error.message : "microphone_unavailable";
      if (generation === this.generation) { this.phase = "error"; this.emit(); }
    } finally { this.starting = false; }
  }

  async stop() {
    this.generation += 1;
    const wasRunning = this.running;
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.resetCall(null); this.admitted = [];
    this.lastVerifiedAt = 0;
    this.phase = "idle"; this.error = null; this.emit();
    if (wasRunning) {
      await call({ operation: "voice_leave", room_id: this.roomId }).catch(() => undefined);
      await call({ operation: "voice_consent", room_id: this.roomId,
        request: { microphone_to_room: false } }).catch(() => undefined);
    }
  }
}
