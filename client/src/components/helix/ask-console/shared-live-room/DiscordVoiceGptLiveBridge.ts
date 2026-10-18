import { discordVoiceBridgeTicketReceiptSchema, plausibleDiscordVoiceBridgeTicketExpiry,
  type DiscordVoiceBridgeTicketReceipt } from
  "@shared/discord-voice-bridge";
import { readHelixAskLiveMediaBoundary, type HelixAskLiveMediaBoundary } from
  "./media-bridge/HelixAskLiveMediaBoundary";

export type DiscordVoiceBridgeState = "connecting" | "active" | "closed";

const socketLimitBytes = 512 * 1024;
const frameSamples = 960;
const safeWorkerCloseReasons = new Set([
  "bridge_capacity", "bridge_timeout", "bridge_stopped", "not_admitted",
  "invitation_unavailable", "gateway_unavailable", "dave_transport_unavailable",
  "worker_lease_unconfirmed", "bridge_authority_unavailable", "bridge_authority_mismatch",
  "not_armed", "roster_incomplete", "bot_voice_state_unconfirmed",
  "no_human_participants", "roster_invalid", "consent_response_invalid",
  "participants_missing_consent", "participant_count_invalid", "commander_not_in_call",
  "bridge_internal_error",
]);

export function discordVoiceBridgeCloseMessage(event: Pick<CloseEvent, "code" | "reason">): string {
  return event.code === 1008 && safeWorkerCloseReasons.has(event.reason)
    ? `Discord bridge denied: ${event.reason}.`
    : "Discord bridge disconnected.";
}

/** Browser-only PCM transport between one consented Discord call and the
 * already-running owner GPT Live session. No room API receives audio bytes. */
export class DiscordVoiceGptLiveBridge {
  private socket: WebSocket | null = null;
  private context: AudioContext | null = null;
  private inputNode: AudioWorkletNode | null = null;
  private outputNode: AudioWorkletNode | null = null;
  private providerSource: MediaStreamAudioSourceNode | null = null;
  private providerInput: MediaStreamAudioDestinationNode | null = null;
  private boundary: HelixAskLiveMediaBoundary | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private replaced = false;
  private closed = false;
  private state: DiscordVoiceBridgeState = "connecting";

  constructor(private readonly input: {
    realtimeSessionId: string;
    roomId: string;
    issueTicket(): Promise<unknown>;
    onState(state: DiscordVoiceBridgeState, message: string): void;
  }) {}

  private update(state: DiscordVoiceBridgeState, message: string): void {
    this.state = state;
    this.input.onState(state, message);
  }

  async start(): Promise<void> {
    try {
      const boundary = readHelixAskLiveMediaBoundary(this.input.realtimeSessionId);
      if (!boundary) throw new Error("gpt_live_media_unavailable");
      if (boundary.readProviderInputEnabled()) throw new Error("discord_voice_requires_laptop_mic_off");
      this.boundary = boundary;
      // Resume while the owner's button gesture is still active. A later
      // ticket fetch or WebSocket handshake may lose browser user activation.
      const context = new AudioContext({ sampleRate: 48_000 });
      this.context = context;
      if (context.sampleRate !== 48_000 || !await context.resume().then(() => true).catch(() => false)) {
        throw new Error("discord_voice_audio_context_unavailable");
      }
      const receipt = discordVoiceBridgeTicketReceiptSchema.parse(await this.input.issueTicket());
      if (receipt.room.room_id !== this.input.roomId || !plausibleDiscordVoiceBridgeTicketExpiry(receipt.expires_at)) {
        throw new Error("discord_voice_ticket_scope_invalid");
      }
      const socket = new WebSocket(receipt.websocket_url);
      socket.binaryType = "arraybuffer";
      this.socket = socket;
      socket.addEventListener("close", event => { void this.close(discordVoiceBridgeCloseMessage(event)); });
      socket.addEventListener("error", () => { void this.close("Discord bridge connection failed."); });
      await this.awaitAdmission(socket, receipt);
      if (this.closed) throw new Error("discord_voice_bridge_closed");
      await this.prepareMedia(boundary);
      if (this.closed || socket.readyState !== WebSocket.OPEN) throw new Error("discord_voice_bridge_closed");
      socket.send(JSON.stringify({ kind: "media_ready" }));
      await this.awaitReady(socket);
      if (this.closed) throw new Error("discord_voice_bridge_closed");
      this.update("active", "Discord call audio is connected to this open GPT Live session.");
      this.watchdog = setInterval(() => {
        const current = readHelixAskLiveMediaBoundary(this.input.realtimeSessionId);
        const output = (current?.readProviderOutputStream() as MediaStream | null)?.getAudioTracks()[0];
        const inputTrack = this.providerInput?.stream.getAudioTracks()[0];
        if (current !== boundary || !inputTrack || !inputTrack.enabled || inputTrack.readyState !== "live" ||
            !output || output.readyState !== "live" || socket.readyState !== WebSocket.OPEN) {
          void this.close("GPT Live media or the Discord bridge is no longer active.");
        }
      }, 500);
    } catch (error) {
      await this.close(error instanceof Error ? error.message : "Discord voice bridge could not start.");
      throw error;
    }
  }

  private async awaitAdmission(socket: WebSocket, receipt: DiscordVoiceBridgeTicketReceipt): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => fail("discord_voice_bridge_timeout"), 15_000);
      const cleanup = () => {
        clearTimeout(timer);
        socket.removeEventListener("open", opened);
        socket.removeEventListener("message", message);
        socket.removeEventListener("close", closed);
      };
      const fail = (reason: string) => { cleanup(); reject(new Error(reason)); };
      const opened = () => socket.send(JSON.stringify({ kind: "auth", ticket: receipt.ticket }));
      const closed = () => fail("discord_voice_bridge_closed");
      const message = (event: MessageEvent) => {
        if (typeof event.data !== "string") return fail("discord_voice_bridge_invalid_reply");
        let value: { kind?: unknown };
        try { value = JSON.parse(event.data); } catch { return fail("discord_voice_bridge_invalid_reply"); }
        if (value.kind !== "admitted") return fail("discord_voice_bridge_not_admitted");
        cleanup(); resolve();
      };
      socket.addEventListener("open", opened, { once: true });
      socket.addEventListener("message", message);
      socket.addEventListener("close", closed, { once: true });
    });
  }

  private async prepareMedia(boundary: HelixAskLiveMediaBoundary): Promise<void> {
    const context = this.context;
    if (!context || context.state !== "running") throw new Error("discord_voice_audio_context_unavailable");
    await context.audioWorklet.addModule("/discord-voice-bridge-worklet.js");
    if (this.closed) throw new Error("discord_voice_bridge_closed");
    const providerOutput = boundary.readProviderOutputStream() as MediaStream | null;
    if (!providerOutput?.getAudioTracks().some(track => track.readyState === "live")) {
      throw new Error("gpt_live_output_unavailable");
    }
    const source = context.createMediaStreamSource(providerOutput);
    const outputNode = new AudioWorkletNode(context, "casimir-discord-voice-output", {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
    });
    const inputNode = new AudioWorkletNode(context, "casimir-discord-voice-input", {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
    });
    const destination = context.createMediaStreamDestination();
    source.connect(outputNode); outputNode.connect(context.destination);
    inputNode.connect(destination);
    this.providerSource = source;
    this.outputNode = outputNode;
    this.inputNode = inputNode;
    this.providerInput = destination;
    outputNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const socket = this.socket;
      if (this.state !== "active" || !socket || socket.readyState !== WebSocket.OPEN) return;
      if (!(event.data instanceof ArrayBuffer) || event.data.byteLength !== frameSamples * 4 ||
          socket.bufferedAmount > socketLimitBytes) {
        void this.close("Discord audio output is congested or invalid.");
        return;
      }
      const frame = new Uint8Array(1 + event.data.byteLength);
      frame[0] = 2;
      frame.set(new Uint8Array(event.data), 1);
      socket.send(frame);
    };
    const track = destination.stream.getAudioTracks()[0];
    if (!track || this.closed || !await boundary.replaceProviderInputAudioTrack(track, { enableExternalAudio: true }).catch(() => false)) {
      throw new Error("gpt_live_input_replace_failed");
    }
    this.replaced = true;
    // A socket closure can arrive while replaceTrack is pending. Close may
    // already have run before replaced became true, so restore it here too.
    if (this.closed) {
      await boundary.restoreProviderInputAudioTrack().catch(() => false);
      this.replaced = false;
      throw new Error("discord_voice_bridge_closed");
    }
  }

  private async awaitReady(socket: WebSocket): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => fail("discord_voice_bridge_ready_timeout"), 15_000);
      const cleanup = () => {
        clearTimeout(timer); socket.removeEventListener("message", message);
        socket.removeEventListener("close", closed);
      };
      const fail = (reason: string) => { cleanup(); reject(new Error(reason)); };
      const closed = () => fail("discord_voice_bridge_closed");
      const message = (event: MessageEvent) => {
        // Discard any media queued during the worker's transition into Ready.
        if (typeof event.data !== "string") return;
        let value: { kind?: unknown };
        try { value = JSON.parse(event.data); } catch { return fail("discord_voice_bridge_invalid_reply"); }
        if (value.kind !== "ready") return fail("discord_voice_bridge_not_ready");
        cleanup(); resolve();
      };
      socket.addEventListener("message", message);
      socket.addEventListener("close", closed, { once: true });
    });
    socket.addEventListener("message", (event: MessageEvent) => {
      if (typeof event.data === "string") return void this.close("Discord bridge protocol changed.");
      const frame = event.data;
      if (!(frame instanceof ArrayBuffer) || frame.byteLength < 5 || frame.byteLength > 11_521 ||
          (frame.byteLength - 1) % 4 !== 0) return void this.close("Discord audio input is invalid.");
      const bytes = new Uint8Array(frame);
      if (bytes[0] !== 1) return void this.close("Discord audio input is invalid.");
      const pcm = new DataView(frame, 1);
      const samples = new Float32Array((frame.byteLength - 1) / 4);
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] = (pcm.getInt16(i * 4, true) + pcm.getInt16(i * 4 + 2, true)) / 65536;
      }
      this.inputNode?.port.postMessage(samples, [samples.buffer]);
    });
  }

  async close(message = "Discord GPT Live bridge stopped."): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.watchdog) clearInterval(this.watchdog);
    this.socket?.close();
    this.outputNode?.port.close();
    this.inputNode?.port.close();
    this.providerSource?.disconnect();
    this.outputNode?.disconnect();
    this.inputNode?.disconnect();
    if (this.replaced && this.boundary === readHelixAskLiveMediaBoundary(this.input.realtimeSessionId)) {
      await this.boundary?.restoreProviderInputAudioTrack().catch(() => false);
    }
    this.providerInput?.stream.getTracks().forEach(track => track.stop());
    await this.context?.close().catch(() => undefined);
    this.update("closed", message);
  }
}
