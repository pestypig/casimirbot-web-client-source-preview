import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscordVoiceGptLiveBridge } from "../DiscordVoiceGptLiveBridge";

const { readBoundary } = vi.hoisted(() => ({ readBoundary: vi.fn() }));
vi.mock("../media-bridge/HelixAskLiveMediaBoundary", () => ({
  readHelixAskLiveMediaBoundary: readBoundary,
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const ticket = () => ({
  schema: "helix.discord_voice_bridge_ticket.v1", api_version: "v1",
  ok: true, operation: "room.discord_voice.bridge_ticket",
  room: { room_id: roomId }, reentry_required: true,
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
  audio_connected: false, model_input: false, raw_content_included: false,
  invitation_id: "discord_voice:22222222-2222-4222-8222-222222222222",
  personal_contract_audio_approved: false,
  websocket_url: "wss://voice.example.test/bridge",
  ticket: "a".repeat(120) + "." + "b".repeat(43),
  expires_at: new Date(Date.now() + 30_000).toISOString(),
});

function setup(resume: Promise<void> = Promise.resolve()) {
  const context = { sampleRate: 48_000, resume: vi.fn(() => resume),
    close: vi.fn(async () => undefined) };
  const createContext = vi.fn(function () { return context; });
  const createSocket = vi.fn(function () { throw new Error("unexpected_socket_after_stop"); });
  vi.stubGlobal("AudioContext", createContext);
  vi.stubGlobal("WebSocket", createSocket);
  readBoundary.mockReturnValue({ readProviderInputEnabled: () => false });
  const issued = deferred<void>();
  const response = deferred<unknown>();
  const issueTicket = vi.fn(() => { issued.resolve(); return response.promise; });
  const onApprovedTicket = vi.fn();
  const onState = vi.fn();
  const bridge = new DiscordVoiceGptLiveBridge({
    realtimeSessionId: "realtime:test-owner", roomId, issueTicket, onApprovedTicket, onState,
  });
  return { bridge, context, createContext, createSocket, issued, response,
    issueTicket, onApprovedTicket, onState };
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Discord bridge owner stop during startup", () => {
  it("stops owned audio and requests exact restoration while replacement is pending", async () => {
    const replacement = deferred<boolean>();const restoration = deferred<boolean>();
    const inputTrack = { kind: "audio", stop: vi.fn() };
    const destination = { stream: { getAudioTracks: () => [inputTrack], getTracks: () => [inputTrack] } };
    const context = { state: "running", sampleRate: 48_000, resume: vi.fn(async () => undefined),
      audioWorklet: { addModule: vi.fn(async () => undefined) }, close: vi.fn(async () => undefined), destination: {},
      createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }), createMediaStreamDestination: () => destination };
    vi.stubGlobal("AudioContext", vi.fn(function () { return context; }));
    vi.stubGlobal("AudioWorkletNode", vi.fn(function () { return { connect: vi.fn(), disconnect: vi.fn(), port: { close: vi.fn() } }; }));
    class Socket extends EventTarget {
      static OPEN = 1;readyState = 1;
      constructor() { super();queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
      send() { queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ kind: "admitted" }) }))); }
      close() { this.readyState = 3;this.dispatchEvent(new Event("close")); }
    }
    vi.stubGlobal("WebSocket", Socket);
    const boundary = { readProviderInputEnabled: () => false,
      readProviderOutputStream: () => ({ getAudioTracks: () => [{ readyState: "live" }] }),
      replaceProviderInputAudioTrack: vi.fn(() => replacement.promise), restoreProviderInputAudioTrack: vi.fn(() => restoration.promise) };
    readBoundary.mockReturnValue(boundary);
    const onState = vi.fn();
    const bridge = new DiscordVoiceGptLiveBridge({ realtimeSessionId: "realtime:test-owner", roomId,
      issueTicket: vi.fn(async () => ticket()), onState });
    const starting = bridge.start().catch(error => error);
    await vi.waitFor(() => expect(boundary.replaceProviderInputAudioTrack).toHaveBeenCalledOnce());
    const closing = bridge.close();
    expect(inputTrack.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(onState).toHaveBeenLastCalledWith("closed", "Discord GPT Live bridge stopped.");
    expect(boundary.restoreProviderInputAudioTrack).toHaveBeenCalledWith(inputTrack);
    restoration.resolve(true);await closing;
    replacement.resolve(true);expect(await starting).toMatchObject({ message: "discord_voice_bridge_closed" });
    expect(onState.mock.calls.some(([state]) => state === "active")).toBe(false);
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("does not start a previously closed bridge", async () => {
    const state = setup();
    await state.bridge.close();
    state.response.resolve(ticket());
    await expect(state.bridge.start()).rejects.toThrow("discord_voice_bridge_closed");
    expect(state.createContext).not.toHaveBeenCalled();
    expect(state.issueTicket).not.toHaveBeenCalled();
    expect(state.createSocket).not.toHaveBeenCalled();
  });

  it("does not request a ticket after stop while audio resume is pending", async () => {
    const resume = deferred<void>();
    const state = setup(resume.promise);
    const result = state.bridge.start().catch(error => error);
    expect(state.context.resume).toHaveBeenCalledOnce();
    await state.bridge.close();
    state.response.resolve(ticket());
    resume.resolve();
    expect(await result).toMatchObject({ message: "discord_voice_bridge_closed" });
    expect(state.issueTicket).not.toHaveBeenCalled();
    expect(state.createSocket).not.toHaveBeenCalled();
    expect(state.context.close).toHaveBeenCalledOnce();
  });

  it("discards a late ticket without approval callbacks or a new socket", async () => {
    const state = setup();
    const result = state.bridge.start().catch(error => error);
    await state.issued.promise;
    await state.bridge.close();
    state.response.resolve(ticket());
    expect(await result).toMatchObject({ message: "discord_voice_bridge_closed" });
    expect(state.onApprovedTicket).not.toHaveBeenCalled();
    expect(state.createSocket).not.toHaveBeenCalled();
    expect(state.onState.mock.calls).toEqual([["closed", "Discord GPT Live bridge stopped."]]);
    expect(state.context.close).toHaveBeenCalledOnce();
  });
});
