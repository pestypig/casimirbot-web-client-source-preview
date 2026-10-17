// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { NativeHostedRoomVoiceBridge } from "../NativeHostedRoomVoiceBridge";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("joins with explicit mic consent, offers separately to two exact peers, and revokes on leave", async () => {
  const sent: Array<Record<string, any>> = [];
  let lostSignalResponse = false;
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  const track = { kind: "audio", stop: vi.fn() };
  vi.stubGlobal("MediaStream", class { addTrack() {} });
  vi.stubGlobal("RTCPeerConnection", class {
    connectionState = "new";
    remoteDescription = null;
    ontrack = null;
    onicecandidate = null;
    onconnectionstatechange = null;
    addTrack() {}
    async createOffer() { return { type: "offer", sdp: "v=0\r\n" }; }
    async setLocalDescription() {}
    close() {}
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getAudioTracks: () => [track],
      getTracks: () => [track] }) } });
  vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
    const request = JSON.parse(init.body as string) as Record<string, any>;
    sent.push(request);
    if (request.operation === "voice_signal_publish" && !lostSignalResponse) {
      lostSignalResponse = true;
      throw new TypeError("simulated_lost_response");
    }
    const value = request.operation === "voice_admit" ? { ok: true, call_id: "call-1",
      admissions: [{ participant_id: "member-a" }, { participant_id: "member-b" },
        { participant_id: "member-c" }] }
      : request.operation === "voice_signal_list" ? { ok: true, call_id: "call-1", signals: [] }
      : { ok: true };
    return { ok: true, json: async () => value };
  }));
  const snapshots: any[] = [];
  const bridge = new NativeHostedRoomVoiceBridge("room-1", "member-a", state => snapshots.push(state));
  await bridge.start();
  expect(sent.map(request => request.operation)).toEqual([
    "voice_consent", "voice_admit", "voice_signal_publish", "voice_signal_publish",
    "voice_signal_publish", "voice_signal_list",
  ]);
  expect(sent[0].request).toEqual({ microphone_to_room: true });
  expect(sent[2].request).toMatchObject({ target_participant_id: "member-b", kind: "offer" });
  expect(sent[3].request.client_signal_id).toBe(sent[2].request.client_signal_id);
  expect(sent[4].request).toMatchObject({ target_participant_id: "member-c", kind: "offer" });
  expect(sent[2].request.negotiation_id).not.toBe(sent[4].request.negotiation_id);
  expect(snapshots.at(-1)).toMatchObject({ phase: "waiting", connectedParticipantIds: [] });
  await bridge.stop();
  expect(track.stop).toHaveBeenCalled();
  expect(sent.slice(-2).map(request => request.operation)).toEqual(["voice_leave", "voice_consent"]);
  expect(sent.at(-1)?.request).toEqual({ microphone_to_room: false });
});

it("does not join if Leave is pressed while microphone permission is pending", async () => {
  const track = { kind: "audio", stop: vi.fn() };
  let resolveMedia!: (value: any) => void;
  const pendingMedia = new Promise<any>(resolve => { resolveMedia = resolve; });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true,
    value: { getUserMedia: vi.fn().mockReturnValue(pendingMedia) } });
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const bridge = new NativeHostedRoomVoiceBridge("room-1", "member-a", () => undefined);
  const start = bridge.start();
  await bridge.stop();
  resolveMedia({ getTracks: () => [track] });
  await start;
  expect(track.stop).toHaveBeenCalledOnce();
  expect(fetcher).not.toHaveBeenCalled();
});

it("retains a bounded candidate that arrives before its exact peer offer", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  const added: RTCIceCandidateInit[] = [];
  vi.stubGlobal("MediaStream", class { addTrack() {} });
  vi.stubGlobal("RTCPeerConnection", class {
    connectionState = "new"; remoteDescription = null;
    ontrack = null; onicecandidate = null; onconnectionstatechange = null;
    addTrack() {}
    async setRemoteDescription(value: any) { this.remoteDescription = value; }
    async addIceCandidate(value: RTCIceCandidateInit) { added.push(value); }
    async createAnswer() { return { type: "answer", sdp: "v=0\r\n" }; }
    async setLocalDescription() {}
    close() {}
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getAudioTracks: () => [],
      getTracks: () => [] }) } });
  const sent: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
    const request = JSON.parse(init.body as string) as Record<string, any>;
    sent.push(request.operation);
    const signals = [
      { signal_id: "signal-1", call_id: "call-1", sender_participant_id: "member-a",
        target_participant_id: "member-b", negotiation_id: "neg-1", kind: "ice_candidate",
        candidate: { candidate: "candidate:1" }, description: null },
      { signal_id: "signal-2", call_id: "call-1", sender_participant_id: "member-a",
        target_participant_id: "member-b", negotiation_id: "neg-1", kind: "offer",
        description: { type: "offer", sdp: "v=0\r\n" }, candidate: null },
    ];
    const value = request.operation === "voice_admit" ? { ok: true, call_id: "call-1",
      admissions: [{ participant_id: "member-a" }, { participant_id: "member-b" }] }
      : request.operation === "voice_signal_list" ? { ok: true, call_id: "call-1", signals }
      : { ok: true };
    return { ok: true, json: async () => value };
  }));
  const bridge = new NativeHostedRoomVoiceBridge("room-1", "member-b", () => undefined);
  await bridge.start();
  expect(added).toEqual([{ candidate: "candidate:1" }]);
  expect(sent).toContain("voice_signal_publish");
  await bridge.stop();
});

it("attributes received audio tracks to their exact admitted peers and removes ended tracks", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.stubGlobal("MediaStream", class { addTrack() {} });
  const peers: Array<{ ontrack: ((event: { track: MediaStreamTrack }) => void) | null }> = [];
  vi.stubGlobal("RTCPeerConnection", class {
    connectionState = "new"; remoteDescription = null;
    ontrack: ((event: { track: MediaStreamTrack }) => void) | null = null;
    onicecandidate = null; onconnectionstatechange = null;
    constructor() { peers.push(this); }
    addTrack() {}
    async createOffer() { return { type: "offer", sdp: "v=0\r\n" }; }
    async setLocalDescription() {}
    close() {}
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getAudioTracks: () => [],
      getTracks: () => [] }) } });
  vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
    const { operation } = JSON.parse(String(init.body));
    const value = operation === "voice_admit" ? { ok: true, call_id: "call-1",
      admissions: [{ participant_id: "member-a" }, { participant_id: "member-b" },
        { participant_id: "member-c" }] }
      : operation === "voice_signal_list" ? { ok: true, call_id: "call-1", signals: [] }
      : { ok: true };
    return { ok: true, json: async () => value };
  }));
  class RemoteTrack extends EventTarget {
    kind = "audio"; readyState = "live";
    end() { this.readyState = "ended"; this.dispatchEvent(new Event("ended")); }
  }
  const states: Array<{ receivedAudioParticipantIds: string[] }> = [];
  const bridge = new NativeHostedRoomVoiceBridge("room-1", "member-a", state => states.push(state));
  await bridge.start();
  expect(peers).toHaveLength(2);
  const b = new RemoteTrack(), c = new RemoteTrack();
  peers[0].ontrack?.({ track: b as unknown as MediaStreamTrack });
  expect(states.at(-1)?.receivedAudioParticipantIds).toEqual(["member-b"]);
  peers[1].ontrack?.({ track: c as unknown as MediaStreamTrack });
  expect(new Set(states.at(-1)?.receivedAudioParticipantIds)).toEqual(new Set(["member-b", "member-c"]));
  b.end();
  expect(states.at(-1)?.receivedAudioParticipantIds).toEqual(["member-c"]);
  await bridge.stop();
  expect(states.at(-1)?.receivedAudioParticipantIds).toEqual([]);
});

it("stops the microphone and peers when the server withdraws this member's voice admission", async () => {
  vi.useFakeTimers();
  try {
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.stubGlobal("MediaStream", class { addTrack() {} });
    const connections: Array<{ close: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal("RTCPeerConnection", class {
      connectionState = "new"; remoteDescription = null;
      ontrack = null; onicecandidate = null; onconnectionstatechange = null;
      close = vi.fn();
      constructor() { connections.push(this); }
      addTrack() {}
      async createOffer() { return { type: "offer", sdp: "v=0\r\n" }; }
      async setLocalDescription() {}
    });
    const track = { kind: "audio", stop: vi.fn() };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getAudioTracks: () => [track],
        getTracks: () => [track] }) } });
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
      const { operation } = JSON.parse(String(init.body));
      sent.push(operation);
      const value = operation === "voice_admit" ? { ok: true, call_id: "call-1",
        admissions: [{ participant_id: "member-a" }, { participant_id: "member-b" }] }
        : operation === "voice_inspect" ? { ok: true, call_id: "call-1",
          admissions: [{ participant_id: "member-b" }] }
        : operation === "voice_signal_list" ? { ok: true, call_id: "call-1", signals: [] }
        : { ok: true };
      return { ok: true, json: async () => value };
    }));
    const states: Array<{ phase: string; active: boolean; error: string | null }> = [];
    const bridge = new NativeHostedRoomVoiceBridge("room-1", "member-a", state => states.push(state));
    await bridge.start();
    expect(connections).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3_750);
    expect(sent).toContain("voice_inspect");
    expect(track.stop).toHaveBeenCalledOnce();
    expect(connections[0].close).toHaveBeenCalledOnce();
    expect(states.at(-1)).toMatchObject({ phase: "error", active: false,
      error: "voice_admission_lost" });
    expect(sent.slice(-2)).toEqual(["voice_leave", "voice_consent"]);
  } finally { vi.useRealTimers(); }
});

it("stops the microphone when initial voice admission cannot be verified", async () => {
  const track = { kind: "audio", stop: vi.fn() };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getAudioTracks: () => [track],
      getTracks: () => [track] }) } });
  const sent: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
    const { operation } = JSON.parse(String(init.body));
    sent.push(operation);
    if (operation === "voice_admit") throw new TypeError("server_offline");
    return { ok: true, json: async () => ({ ok: true }) };
  }));
  const states: Array<{ phase: string; active: boolean; error: string | null }> = [];
  const bridge = new NativeHostedRoomVoiceBridge("room-1", "member-a", state => states.push(state));
  await bridge.start();
  expect(track.stop).toHaveBeenCalledOnce();
  expect(states.at(-1)).toMatchObject({ phase: "error", active: false,
    error: "voice_admission_unverified" });
  expect(sent).toEqual(["voice_consent", "voice_admit", "voice_leave", "voice_consent"]);
});

it("stops a previously admitted microphone after sustained loss of server verification", async () => {
  vi.useFakeTimers();
  try {
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.stubGlobal("MediaStream", class { addTrack() {} });
    const connections: Array<{ close: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal("RTCPeerConnection", class {
      connectionState = "new"; remoteDescription = null;
      ontrack = null; onicecandidate = null; onconnectionstatechange = null;
      close = vi.fn();
      constructor() { connections.push(this); }
      addTrack() {}
      async createOffer() { return { type: "offer", sdp: "v=0\r\n" }; }
      async setLocalDescription() {}
    });
    const track = { kind: "audio", stop: vi.fn() };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getAudioTracks: () => [track],
        getTracks: () => [track] }) } });
    let initialList = true;
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
      const { operation } = JSON.parse(String(init.body));
      if (operation === "voice_signal_list") {
        if (!initialList) throw new TypeError("server_offline");
        initialList = false;
        return { ok: true, json: async () => ({ ok: true, call_id: "call-1", signals: [] }) };
      }
      if (operation === "voice_inspect") throw new TypeError("server_offline");
      const value = operation === "voice_admit" ? { ok: true, call_id: "call-1",
        admissions: [{ participant_id: "member-a" }, { participant_id: "member-b" }] }
        : { ok: true };
      return { ok: true, json: async () => value };
    }));
    const states: Array<{ phase: string; active: boolean; error: string | null }> = [];
    const bridge = new NativeHostedRoomVoiceBridge("room-1", "member-a", state => states.push(state));
    await bridge.start();
    expect(connections).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_500);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(connections[0].close).toHaveBeenCalledOnce();
    expect(states.at(-1)).toMatchObject({ phase: "error", active: false,
      error: "voice_admission_unverified" });
  } finally { vi.useRealTimers(); }
});
