// @vitest-environment jsdom
import React, { useState } from "react";
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeRoomConnectionPanel, nativeRoomJoinKey } from "../NativeRoomConnectionPanel";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, cacheAccountCapabilityPolicy,
  clearCachedAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { buildHelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import type { HostedRoomTextOwnerSnapshot } from "../NativeHostedRoomTextOwnerBridge";
import { HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT } from "../SharedLiveRoomGuideProjection";
import type { IsolatedAudioReceipt } from "../DiscordIsolatedAudioRelay";

const bridgeCapture = vi.hoisted(() => ({
  onIsolatedSegment: null as ((segment: IsolatedAudioReceipt) => Promise<void>) | null,
}));

vi.mock("../DiscordVoiceGptLiveBridge", () => ({
  DiscordVoiceGptLiveBridge: class {
    constructor(private readonly input: { issueTicket: () => Promise<unknown>;
      onState: (state: string) => void;
      onIsolatedSegment?: (segment: IsolatedAudioReceipt) => Promise<void> }) {
      bridgeCapture.onIsolatedSegment = input.onIsolatedSegment ?? null;
    }
    async start() { await this.input.issueTicket(); this.input.onState("active"); }
    close() { this.input.onState("closed"); return Promise.resolve(); }
  },
}));

const room = { room_id: "shared_realtime_room:test", title: "Private room", status: "open", participants: [] };
const invite = `helix_live_${"a".repeat(32)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const status = (ready = true, configured = true) => ({ schema: "casimir_desktop_room_connection_status/1", ready, configured,
  authority: configured ? "https://rooms.test" : null, expires_at: ready ? "2099-01-01T00:00:00Z" : null, bearer_included: false, subject_included: false });
const startReceipt = () => ({ schema: "casimir_desktop_auth0_account_link_start/1", ok: true,
  authorization_url: "https://tenant.auth0.com/authorize?response_type=code", expires_at: new Date(Date.now() + 600000).toISOString(),
  provider: "auth0", pkce: "S256", client_secret_used: false, bearer_included: false, subject_included: false, authorization_purpose: "shared_live_rooms" });
type RoomFixture = Omit<typeof room, "participants"> & {
  self_participant_id?: string;
  participants: Array<{ participant_id: string; display_name: string; role?: string; presence?: string }>;
};
const fixture = (initial: ReturnType<typeof status> & { recovery_pending?: boolean; recovery_failure_code?: string; room_source_scope_ready?: boolean } = status(),
  listedRoom: RoomFixture = room) => {
  vi.stubGlobal("crypto", webcrypto);
  const open = vi.fn(async (_url: string) => undefined);
  let completion: (value: unknown) => void = () => undefined;
  Object.defineProperty(window, "casimirDesktop", { configurable: true, value: { openAuth0AccountLink: open,
    onAuth0AccountLinkCompletion: (listener: (value: unknown) => void) => { completion = listener; return vi.fn(); } } });
  const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url).endsWith("/status")) return json(initial);
    if (String(url).endsWith("/start")) return json(startReceipt());
    if (String(url).endsWith("/disconnect")) return json({ ok: true });
    if (String(url).endsWith("/control")) {
      const body = JSON.parse(String(init?.body));
      return json(body.operation === "list" ? { rooms: [listedRoom] } : { room: listedRoom });
    }
    throw new Error("Unexpected request");
  });
  vi.stubGlobal("fetch", fetcher);
  render(<NativeRoomConnectionPanel realtimeSessionId={null} runtimeActive={false} fieldIdPrefix="test" />);
  return { fetcher, open, complete: (value: unknown = {
    schema: "casimir_desktop_auth0_account_link_completion/1", ok: true,
    authorization_purpose: "shared_live_rooms", bearer_included: false, subject_included: false,
  }) => completion(value) };
};
const join = async () => {
  fireEvent.change(await screen.findByLabelText("Service room ID"), { target: { value: room.room_id } });
  fireEvent.change(screen.getByLabelText("Service invitation"), { target: { value: invite } });
  fireEvent.click(screen.getByRole("button", { name: "Join service room" }));
};
afterEach(() => { cleanup(); clearCachedAccountCapabilityPolicy(); delete window.casimirDesktop;
  bridgeCapture.onIsolatedSegment = null;
  vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("native room connection panel", () => {
  it.each([
    ["room", "inventory", false], ["session", "inventory", false],
    ["room", "inventory", true], ["session", "inventory", true],
    ["room", "selection", false], ["session", "selection", false],
    ["room", "selection", true], ["session", "selection", true],
  ] as const)("discards a delayed %s/%s callback (failure: %s)", async (change, operation, failure) => {
    const firstRoom = { ...room, room_id: "shared_realtime_room:11111111-1111-4111-8111-111111111111", self_participant_id: "participant:host",
      participants: [{ participant_id: "participant:host", role: "owner", display_name: "Host" }] };
    const secondRoom = { ...firstRoom, room_id: "shared_realtime_room:22222222-2222-4222-8222-222222222222", title: "Second room" };
    Object.defineProperty(window, "casimirDesktop", { configurable: true,
      value: { openAuth0AccountLink: vi.fn(async () => undefined) } });
    let release!: (response: Response) => void;
    const inventory = { schema: "casimir.native_hosted_room_source_inventory.v1",
      room_id: firstRoom.room_id, bindings: [{ binding_id: "binding:first", source_id: "source:first",
        world_id: "minecraft:old-world", domain_adapter: "minecraft_fabric", status: "active" }] };
    const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).endsWith("/status")) return json(status());
      const body = JSON.parse(String(init?.body));
      if (body.operation === "list") return json({ rooms: [firstRoom, secondRoom] });
      if (body.operation === "inspect") return json({ room: body.room_id === firstRoom.room_id ? firstRoom : secondRoom });
      if (body.operation === "discord_voice_bridge_ticket") return json({
        schema: "helix.discord_voice_bridge_ticket.v1", api_version: "v1", ok: true,
        operation: "room.discord_voice.bridge_ticket", room: { room_id: firstRoom.room_id },
        reentry_required: true, answer_authority: false, assistant_answer: false,
        terminal_eligible: false, audio_connected: false, model_input: false, raw_content_included: false,
        invitation_id: "discord_voice:11111111-1111-4111-8111-111111111111",
        realtime_session_id: "realtime:first", provider_call_ref: "provider:exact",
        personal_contract_audio_approved: true, websocket_url: "wss://voice.test/bridge",
        ticket: `${"a".repeat(120)}.${"b".repeat(43)}`,
        expires_at: new Date(Date.now() + 20000).toISOString(),
      });
      if (body.operation === "source_list") return operation === "inventory"
        ? await new Promise<Response>(resolve => { release = resolve; }) : json(inventory);
      if (body.operation === "source_context_select") return body.request.binding_id
        ? await new Promise<Response>(resolve => { release = resolve; }) : json({ binding_id: null });
      return json({ error: "not_available" }, 403);
    });
    vi.stubGlobal("fetch", fetcher);
    const mounted = render(<NativeRoomConnectionPanel fieldIdPrefix="source-scope"
      realtimeSessionId="realtime:first" runtimeActive />);
    fireEvent.click(await screen.findByRole("button", { name: "Load service rooms" }));
    fireEvent.click(await screen.findByRole("button", { name: "Private room" }));
    fireEvent.click(await screen.findByRole("button", { name: "Connect Discord call to GPT Live" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Load this room’s sources" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Load this room’s sources" }));
    if (operation === "selection") fireEvent.click(await screen.findByRole("button", { name: /minecraft:old-world/ }));
    if (change === "room") {
      fireEvent.click(screen.getByRole("button", { name: "Second room" }));
      await screen.findByText(/Second room · 1\/2 members/);
    } else {
      mounted.rerender(<NativeRoomConnectionPanel fieldIdPrefix="source-scope"
        realtimeSessionId="realtime:second" runtimeActive />);
    }
    await act(async () => release(failure ? json({ error: "scope_expired" }, 403)
      : json(operation === "inventory" ? inventory : { room_id: firstRoom.room_id,
        binding_id: "binding:first", world_id: "minecraft:old-world" })));
    expect(screen.queryByRole("button", { name: /minecraft:old-world/ })).toBeNull();
    expect(screen.queryByText(/Selected minecraft:old-world/)).toBeNull();
    expect(screen.queryByText(/hosted source inventory could not be read|exact source could not be verified/)).toBeNull();
    expect(screen.getByRole("button", { name: "Load this room’s sources" })).toBeDisabled();
    if (operation === "selection" && !failure) expect(fetcher.mock.calls.some(([, init]) => {
      const body = init?.body && JSON.parse(String(init.body));
      return body?.operation === "source_context_select" && body.request.binding_id === null &&
        body.room_id === firstRoom.room_id && body.realtime_session_id === "realtime:first";
    })).toBe(true);
    expect(fetcher.mock.calls.filter(([, init]) => init?.body &&
      JSON.parse(String(init.body)).operation === "source_list")).toHaveLength(1);
  });
  it("rejects a room list that arrives after its request deadline", async () => {
    const f = fixture(); await screen.findByLabelText("Service room ID");
    vi.useFakeTimers();
    let release!: (response: Response) => void;
    f.fetcher.mockImplementationOnce(async () => new Promise(resolve => { release = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Load service rooms" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20001);
      release(json({ rooms: [room] }));
    });
    expect(screen.queryByRole("button", { name: "Private room" })).toBeNull();
    expect(screen.getByText(/room request failed/)).toBeTruthy();
    expect(f.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/control"))).toHaveLength(1);
  });
  it("does not treat a late status refresh as current room authorization", async () => {
    const f = fixture(); await screen.findByLabelText("Service room ID");
    vi.useFakeTimers();
    let release!: (response: Response) => void;
    f.fetcher.mockImplementationOnce(async () => new Promise(resolve => { release = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh connection" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20001);
      release(json(status()));
    });
    expect(screen.queryByRole("button", { name: "Load service rooms" })).toBeNull();
    expect(screen.getByText(/Room connection status is unavailable/)).toBeTruthy();
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it("rechecks an open panel when its native room grant expires", async () => {
    Object.defineProperty(window, "casimirDesktop", { configurable: true,
      value: { openAuth0AccountLink: vi.fn(async () => undefined) } });
    const expiresAt = new Date(Date.now() + 500).toISOString();
    let statusReads = 0;
    const fetcher = vi.fn(async (url: unknown) => {
      if (String(url).endsWith("/status")) {
        statusReads += 1;
        return json(statusReads === 1
          ? { ...status(), expires_at: expiresAt }
          : status(false));
      }
      throw Error(`Unexpected request ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<NativeRoomConnectionPanel realtimeSessionId={null} runtimeActive={false} fieldIdPrefix="expiring-room" />);
    expect(await screen.findByText(/Authorized for room coordination on this account/)).toBeTruthy();
    expect(await screen.findByText(/Authorize this account to view or join rooms/, {},
      { timeout: 1_500 })).toBeTruthy();
    expect(statusReads).toBe(2);
  });

  it("offers owner task selection before room text admission without opening mission controls", async () => {
    const selectedRoom = { ...room,
      room_id: "shared_realtime_room:11111111-1111-4111-8111-111111111111",
      self_participant_id: "participant:host",
      participants: [{ participant_id: "participant:host", display_name: "Host", role: "owner" }] };
    Object.defineProperty(window, "casimirDesktop", { configurable: true,
      value: { openAuth0AccountLink: vi.fn(async () => undefined) } });
    const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).endsWith("/status")) return json(status());
      if (String(url).endsWith("/control")) {
        const request = JSON.parse(String(init?.body));
        if (request.operation === "list") return json({ rooms: [selectedRoom] });
        if (request.operation === "inspect") return json({ room: selectedRoom });
        if (request.operation === "text_list") return json({ error: "room_text_access_required" }, 403);
      }
      throw Error(`Unexpected request ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<NativeRoomConnectionPanel realtimeSessionId={null} runtimeActive={false} fieldIdPrefix="pending-room-text"
      onOpenRoomMissionConsole={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Load service rooms" }));
    fireEvent.click(await screen.findByRole("button", { name: "Private room" }));
    expect(await screen.findByRole("region", { name: "Hosted room task selection" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh owner selection" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review mission in Console" })).toBeNull();
  });
  it("names the exact active GPT Live session when requesting a Discord bridge ticket", async () => {
    const selectedRoom = { ...room,
      room_id: "shared_realtime_room:11111111-1111-4111-8111-111111111111",
      self_participant_id: "participant:host",
      participants: [{ participant_id: "participant:host", display_name: "Host", role: "owner" }] };
    Object.defineProperty(window, "casimirDesktop", { configurable: true,
      value: { openAuth0AccountLink: vi.fn(async () => undefined) } });
    const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).endsWith("/status")) return json(status());
      const body = JSON.parse(String(init?.body));
      if (body.operation === "list") return json({ rooms: [selectedRoom] });
      if (body.operation === "inspect") return json({ room: selectedRoom });
      // A malformed ticket stops before a socket opens; the native request is
      // the part under test.
      if (body.operation === "discord_voice_bridge_ticket") return json({ ok: false });
      throw new Error(`Unexpected operation ${body.operation}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<NativeRoomConnectionPanel fieldIdPrefix="discord-session-test"
      realtimeSessionId="realtime:exact-discord-session" runtimeActive />);
    fireEvent.click(await screen.findByRole("button", { name: "Load service rooms" }));
    fireEvent.click(await screen.findByRole("button", { name: "Private room" }));
    fireEvent.click(await screen.findByRole("button", { name: "Connect Discord call to GPT Live" }));
    await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) =>
      String(url).endsWith("/control") && init?.body &&
      JSON.parse(String(init.body)).operation === "discord_voice_bridge_ticket" &&
      JSON.parse(String(init.body)).room_id === selectedRoom.room_id &&
      JSON.parse(String(init.body)).realtime_session_id === "realtime:exact-discord-session",
    )).toBe(true));
  });
  it.each([false, true])("selects the exact hosted Minecraft world only after the Discord bridge is active; world switch: %s", async (switchWorld) => {
    const selectedRoom = { ...room,
      room_id: "shared_realtime_room:11111111-1111-4111-8111-111111111111",
      self_participant_id: "participant:host",
      participants: [{ participant_id: "participant:host", display_name: "Host", role: "owner" }] };
    const bindingId = "room_source_binding:11111111-1111-4111-8111-111111111111";
    let returnedWorld = "minecraft:reee-hamtar";
    let releaseTranscription: () => void = () => undefined;
    const nativeTranscribe = vi.fn(async (request: { receipt: Omit<IsolatedAudioReceipt, "pcm">;
      wav: Uint8Array }) => {
      expect(request.receipt.roomId).toBe(selectedRoom.room_id);
      expect(request.wav.subarray(44).every(byte => byte === 7)).toBe(true);
      if (!switchWorld) await new Promise<void>(resolve => {
        releaseTranscription = resolve;
      });
      return "queued";
    });
    Object.defineProperty(window, "casimirDesktop", { configurable: true,
      value: { openAuth0AccountLink: vi.fn(async () => undefined),
        transcribeIsolatedDiscordSegment: nativeTranscribe } });
    const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).endsWith("/status")) return json(status());
      const body = JSON.parse(String(init?.body));
      if (body.operation === "list") return json({ rooms: [selectedRoom] });
      if (body.operation === "inspect") return json({ room: selectedRoom });
      if (body.operation === "discord_voice_bridge_ticket") return json({
        schema: "helix.discord_voice_bridge_ticket.v1", api_version: "v1",
        ok: true, operation: "room.discord_voice.bridge_ticket",
        room: { room_id: selectedRoom.room_id }, reentry_required: true,
        answer_authority: false, assistant_answer: false, terminal_eligible: false,
        audio_connected: false, model_input: false, raw_content_included: false,
        invitation_id: "discord_voice:11111111-1111-4111-8111-111111111111",
        realtime_session_id: "realtime:exact-discord-session",
        provider_call_ref: "provider:exact",
        personal_contract_audio_approved: true,
        websocket_url: "wss://voice.test/bridge", ticket: `${"a".repeat(120)}.${"b".repeat(43)}`,
        expires_at: new Date(Date.now() + 20_000).toISOString(),
      });
      if (body.operation === "source_list") return json({
        schema: "casimir.native_hosted_room_source_inventory.v1",
        room_id: selectedRoom.room_id,
        bindings: [{ binding_id: bindingId, source_id: "source:fabric",
          world_id: "minecraft:reee-hamtar", domain_adapter: "minecraft_fabric",
          status: "active" }],
      });
      if (body.operation === "source_context_select" && body.request.binding_id &&
          returnedWorld !== "minecraft:reee-hamtar")
        return json({ ok: false, error: "source_world_changed", outcome_unknown: false }, 409);
      if (body.operation === "source_context_select") return json({
        room_id: selectedRoom.room_id, binding_id: body.request.binding_id,
        world_id: body.request.binding_id ? returnedWorld : null,
      });
      throw new Error(`Unexpected operation ${body.operation}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<NativeRoomConnectionPanel fieldIdPrefix="hosted-minecraft-test"
      realtimeSessionId="realtime:exact-discord-session" runtimeActive />);
    fireEvent.click(await screen.findByRole("button", { name: "Load service rooms" }));
    fireEvent.click(await screen.findByRole("button", { name: "Private room" }));
    await screen.findByRole("button", { name: "Connect Discord call to GPT Live" });
    expect((screen.getByRole("button", { name: "Load this room’s sources" }) as HTMLButtonElement)
      .disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Connect Discord call to GPT Live" }));
    await waitFor(() => expect((screen.getByRole("button", {
      name: "Load this room’s sources" }) as HTMLButtonElement).disabled).toBe(false));
    expect(bridgeCapture.onIsolatedSegment).toBeTypeOf("function");
    const pcm = new Uint8Array(3 * 3_840).fill(7);
    await bridgeCapture.onIsolatedSegment!({
      roomId: selectedRoom.room_id,
      invitationId: "discord_voice:11111111-1111-4111-8111-111111111111",
      workerId: "worker:exact", realtimeSessionId: "realtime:exact-discord-session",
      providerCallRef: "provider:exact", discordUserId: "123456789012345678",
      segmentId: `segment:${"a".repeat(64)}`,
      allowanceId: "stt_allowance:11111111-1111-4111-8111-111111111111",
      reservationId: `stt-reservation:${"a".repeat(64)}`,
      reservationExpiresAtMs: Date.now() + 20_000,
      startedAtMs: 1_000, endedAtMs: 1_060, pcm,
    });
    expect(nativeTranscribe).toHaveBeenCalledTimes(1);
    if (!switchWorld) {
      await bridgeCapture.onIsolatedSegment!({
        roomId: selectedRoom.room_id,
        invitationId: "discord_voice:11111111-1111-4111-8111-111111111111",
        workerId: "worker:exact", realtimeSessionId: "realtime:exact-discord-session",
        providerCallRef: "provider:exact", discordUserId: "123456789012345678",
        segmentId: `segment:${"b".repeat(64)}`,
        allowanceId: "stt_allowance:11111111-1111-4111-8111-111111111111",
        reservationId: `stt-reservation:${"b".repeat(64)}`,
        reservationExpiresAtMs: Date.now() + 20_000,
        startedAtMs: 1_060, endedAtMs: 1_120,
        pcm: new Uint8Array(3 * 3_840).fill(7),
      });
      expect(nativeTranscribe).toHaveBeenCalledTimes(1);
      releaseTranscription();
    }
    await waitFor(() => expect(nativeTranscribe.mock.calls[0][0].wav
      .every(byte => byte === 0)).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Load this room’s sources" }));
    if (switchWorld) vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    fireEvent.click(await screen.findByRole("button", { name: /minecraft:reee-hamtar/ }));
    await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => {
      if (!init?.body) return false;
      const body = JSON.parse(String(init.body));
      return body.operation === "source_context_select" &&
        body.realtime_session_id === "realtime:exact-discord-session" &&
        body.room_id === selectedRoom.room_id && body.request.binding_id === bindingId;
    })).toBe(true));
    if (switchWorld) {
      await waitFor(() => expect(screen.getByRole("button", { name: /minecraft:reee-hamtar.*selected/ })).toBeTruthy());
      returnedWorld = "minecraft:other-world";
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      await screen.findByText(/The hosted Minecraft world changed/);
      await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => {
        if (!init?.body) return false;
        const body = JSON.parse(String(init.body));
        return body.operation === "source_context_select" && body.request.binding_id === null;
      })).toBe(true));
      expect(screen.getByRole("button", { name: /minecraft:reee-hamtar/ }).textContent).not.toContain("selected");
      return;
    }
    fireEvent.click(screen.getByRole("button", { name: "Stop Discord GPT Live bridge" }));
    await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => {
      if (!init?.body) return false;
      const body = JSON.parse(String(init.body));
      return body.operation === "source_context_select" &&
        body.request.binding_id === null;
    })).toBe(true));
  });
  it("keeps one hosted text owner and its draft when the dialog portal closes", async () => {
    const onOpenMission = vi.fn();
    vi.stubGlobal("crypto", webcrypto);
    const selectedRoom = { ...room, room_id: "shared_realtime_room:11111111-1111-4111-8111-111111111111",
      self_participant_id: "participant:host",
      participants: [{ participant_id: "participant:host", display_name: "Host", role: "owner" }] };
    Object.defineProperty(window, "casimirDesktop", { configurable: true,
      value: { openAuth0AccountLink: vi.fn(async () => undefined) } });
    const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).endsWith("/status")) return json(status());
      const request = JSON.parse(String(init?.body));
      if (request.operation === "list") return json({ rooms: [selectedRoom] });
      if (request.operation === "inspect") return json({ room: selectedRoom });
      if (request.operation === "text_list") return json({ schema: "helix.shared_live_room.text_list.v1",
        api_version: "v1", ok: true, operation: "room.text.list", room: { room_id: selectedRoom.room_id },
        messages: [], model_input: false, task_handoff: false, reentry_required: true,
        answer_authority: false, assistant_answer: false, terminal_eligible: false, raw_content_included: true });
      throw Error(`Unexpected operation ${request.operation}`);
    });
    vi.stubGlobal("fetch", fetcher);
    function MountedPanel() {
      const [open, setOpen] = useState(true);
      const [target, setTarget] = useState<HTMLElement | null>(null);
      const [owner, setOwner] = useState<HostedRoomTextOwnerSnapshot | null>(null);
      return <><button type="button" onClick={() => setOpen(value => !value)}>Toggle dialog</button>
        <button type="button" onClick={() => owner?.conversation.updateDraft("retained hosted draft")}>Write draft</button>
        <output aria-label="Hosted owner draft" data-admitted={owner?.conversation.admitted ? "true" : "false"}>
          {owner?.conversation.draft ?? "no owner"}</output>
        {open ? <div ref={setTarget} /> : null}
        <NativeRoomConnectionPanel realtimeSessionId={null} runtimeActive={false} fieldIdPrefix="portal" portalTarget={target}
          onHostedRoomTextOwnerChange={setOwner} onOpenRoomConsole={() => undefined}
          onOpenRoomMissionConsole={onOpenMission} /></>;
    }
    render(<MountedPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Load service rooms" }));
    fireEvent.click(await screen.findByRole("button", { name: "Private room" }));
    await waitFor(() => expect(screen.getByLabelText("Hosted owner draft")).toHaveAttribute("data-admitted", "true"));
    expect(screen.queryByRole("region", { name: "Hosted room task selection" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review mission in Console" }));
    expect(onOpenMission).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Write draft" }));
    expect(screen.getByLabelText("Hosted owner draft")).toHaveTextContent("retained hosted draft");
    expect(screen.queryByRole("textbox", { name: "Message to room members" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Toggle dialog" }));
    expect(screen.queryByRole("region", { name: "Room service connection" })).toBeNull();
    expect(screen.getByLabelText("Hosted owner draft")).toHaveTextContent("retained hosted draft");
    fireEvent.click(screen.getByRole("button", { name: "Toggle dialog" }));
    expect(await screen.findByRole("region", { name: "Hosted room text conversation" })).toBeTruthy();
    expect(screen.getByLabelText("Hosted owner draft")).toHaveTextContent("retained hosted draft");
    expect(fetcher.mock.calls.filter(([, init]) => init?.body &&
      JSON.parse(String(init.body)).operation === "text_send")).toHaveLength(0);
  });
  it("keeps public human room text available without requesting developer AI status", async () => {
    cacheAccountCapabilityPolicy(buildHelixAccountCapabilityPolicy("user"), "profile:public-room-user");
    const publicRoom = { ...room, room_id: "shared_realtime_room:11111111-1111-4111-8111-111111111111",
      self_participant_id: "participant:public-user",
      participants: [{ participant_id: "participant:public-user", display_name: "User" }] };
    const f = fixture(status(), publicRoom);
    f.fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/status")) return json(status());
      if (String(url).endsWith("/control")) {
        const body = JSON.parse(String(init?.body));
        if (body.operation === "list") return json({ rooms: [publicRoom] });
        if (body.operation === "text_list") return json({ schema: "helix.shared_live_room.text_list.v1",
          api_version: "v1", ok: true, operation: "room.text.list", room: { room_id: publicRoom.room_id },
          messages: [], model_input: false, task_handoff: false, reentry_required: true,
          answer_authority: false, assistant_answer: false, terminal_eligible: false, raw_content_included: true });
        return json({ room: publicRoom });
      }
      throw new Error("Unexpected request");
    });
    fireEvent.click(await screen.findByRole("button", { name: "Load service rooms" }));
    fireEvent.click(await screen.findByRole("button", { name: "Private room" }));
    expect(await screen.findByRole("region", { name: "Hosted room text conversation" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Hosted room AI status" })).toBeNull();
    expect(screen.getByRole("region", { name: "Room service connection" })).toHaveTextContent("human conversation by default");
    expect(screen.queryByText(/Developer evaluation only: shared AI/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Shared AI task reports" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Hosted room task selection" })).toBeNull();
    expect(screen.getByText(/The host reviews and queues instructions/)).toBeTruthy();
    expect(f.fetcher.mock.calls.map(([, init]) => init?.body && JSON.parse(String(init.body)).operation)
      .filter(Boolean)).not.toContain("interpreter_status");
  });
  it("does not inspect voice renewal when this account is not the present room owner", async () => {
    const selectedRoom = { ...room,
      self_participant_id: "participant:owner",
      participants: [{ participant_id: "participant:owner", display_name: "Owner",
        role: "owner", presence: "away" }] };
    Object.defineProperty(window, "casimirDesktop", { configurable: true,
      value: { openAuth0AccountLink: vi.fn(async () => undefined) } });
    const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).endsWith("/status")) return json(status());
      if (String(url).endsWith("/control")) {
        const body = JSON.parse(String(init?.body));
        if (body.operation === "list") return json({ rooms: [selectedRoom] });
        return json({ room: selectedRoom });
      }
      throw Error(`Unexpected request ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const onRenewal = vi.fn();
    render(<NativeRoomConnectionPanel realtimeSessionId={null} runtimeActive={false} fieldIdPrefix="away-owner" onDiscordVoiceRenewalRequest={onRenewal} />);
    fireEvent.click(await screen.findByRole("button", { name: "Load service rooms" }));
    fireEvent.click(await screen.findByRole("button", { name: "Private room" }));
    expect(await screen.findByRole("region", { name: "Hosted room text conversation" })).toBeTruthy();
    expect(fetcher.mock.calls.map(([, init]) => init?.body && JSON.parse(String(init.body)).operation)
      .filter(Boolean)).not.toContain("discord_voice_renewal_inspect");
    expect(onRenewal).toHaveBeenCalledWith(null);
  });
  it("still inspects voice renewal for the present room owner", async () => {
    const selectedRoom = { ...room,
      self_participant_id: "participant:owner",
      participants: [{ participant_id: "participant:owner", display_name: "Owner",
        role: "owner", presence: "present" }] };
    Object.defineProperty(window, "casimirDesktop", { configurable: true,
      value: { openAuth0AccountLink: vi.fn(async () => undefined) } });
    const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).endsWith("/status")) return json(status());
      if (String(url).endsWith("/control")) {
        const body = JSON.parse(String(init?.body));
        if (body.operation === "list") return json({ rooms: [selectedRoom] });
        if (body.operation === "discord_voice_renewal_inspect") return json({
          schema: "helix.discord_voice_renewal.v1",
          operation: "room.discord_voice.renewal_inspect",
          room: { room_id: selectedRoom.room_id }, request: null,
        });
        return json({ room: selectedRoom });
      }
      throw Error(`Unexpected request ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<NativeRoomConnectionPanel realtimeSessionId={null} runtimeActive={false} fieldIdPrefix="present-owner"
      onDiscordVoiceRenewalRequest={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Load service rooms" }));
    fireEvent.click(await screen.findByRole("button", { name: "Private room" }));
    await waitFor(() => expect(fetcher.mock.calls.map(([, init]) =>
      init?.body && JSON.parse(String(init.body)).operation).filter(Boolean))
      .toContain("discord_voice_renewal_inspect"));
  });
  it("shows reviewed AI report discovery only to a developer without loading report text", async () => {
    cacheAccountCapabilityPolicy(buildHelixAccountCapabilityPolicy("developer"), "profile:developer-room-user");
    const developerRoom = { ...room,
      self_participant_id: "participant:developer-user",
      participants: [{ participant_id: "participant:developer-user",
        display_name: "Developer", role: "participant" }] };
    const f = fixture(status(), developerRoom);
    f.fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/status")) return json(status());
      if (String(url).endsWith("/control")) {
        const body = JSON.parse(String(init?.body));
        if (body.operation === "list") return json({ rooms: [developerRoom] });
        if (body.operation === "text_list") return json({ schema: "helix.shared_live_room.text_list.v1",
          api_version: "v1", ok: true, operation: "room.text.list",
          room: { room_id: developerRoom.room_id }, messages: [], model_input: false,
          task_handoff: false, reentry_required: true, answer_authority: false,
          assistant_answer: false, terminal_eligible: false, raw_content_included: true });
        if (body.operation === "interpreter_status") return json({ error: "account_policy_blocked" }, 403);
        return json({ room: developerRoom });
      }
      throw new Error("Unexpected request");
    });
    fireEvent.click(await screen.findByRole("button", { name: "Load service rooms" }));
    fireEvent.click(await screen.findByRole("button", { name: "Private room" }));
    expect(await screen.findByRole("region", { name: "Shared AI task reports" })).toBeTruthy();
    expect(screen.getByText(/Developer evaluation only: shared AI/)).toHaveTextContent("host's separately configured OpenAI key");
    expect(screen.queryByText(/Source AI turn:/)).toBeNull();
    expect(f.fetcher.mock.calls.map(([, init]) => init?.body && JSON.parse(String(init.body)).operation)
      .filter(Boolean)).not.toContain("interpreter_report_read");
  });
  it("opens only an explicitly selected service room through the native bridge", async () => {
    const f = fixture();
    expect(screen.getByRole("region", { name: "Room service connection" })).toHaveTextContent("Hosted service rooms · human conversation by default");
    expect(screen.getByRole("region", { name: "Room service connection" })).toHaveTextContent("The explicit Discord GPT Live pilot below is a separate, consent-gated bridge");
    await screen.findByText(/this status does not prove a destination or delivery/);
    const opener = vi.fn(async () => ({ opened: true }));
    Object.defineProperty(window.casimirDesktop!, "openRoomService", { configurable: true, value: opener });
    fireEvent.click(await screen.findByRole("button", { name: "Load service rooms" }));
    fireEvent.click(await screen.findByRole("button", { name: "Private room" }));
    const button = await screen.findByRole("button", { name: "Open selected room in browser" });
    expect(opener).not.toHaveBeenCalled();
    const before = f.fetcher.mock.calls.length;
    fireEvent.click(button);
    await screen.findByText(/Room service opened in your browser/);
    expect(opener).toHaveBeenCalledWith({ authority: "https://rooms.test", room_id: room.room_id });
    expect(f.fetcher.mock.calls.length).toBe(before);
    act(() => { window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)); });
    expect(screen.queryByRole("button", { name: "Open selected room in browser" })).toBeNull();
  });
  it("inspects the contract's exact hosted room without joining or opening the public website", async () => {
    const selectedRoom = { ...room, room_id: "shared_realtime_room:ce03ad8e-d0cb-4d73-8324-94b069f8e8c8" };
    const f = fixture(status(), selectedRoom);
    await screen.findByText(/this status does not prove a destination or delivery/);
    act(() => window.dispatchEvent(new CustomEvent(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT,
      { detail: { hostedRoomId: selectedRoom.room_id } })));
    await waitFor(() => expect(f.fetcher.mock.calls.some(([, init]) => {
      if (!init?.body) return false;
      const request = JSON.parse(String(init.body));
      return request.operation === "inspect" && request.room_id === selectedRoom.room_id;
    })).toBe(true));
    expect(await screen.findByText(/Private room · 0\/2 members/)).toBeTruthy();
    expect(f.fetcher.mock.calls.map(([, init]) => init?.body && JSON.parse(String(init.body)).operation)
      .filter(Boolean)).not.toContain("join");
  });
  it("rechecks a recovering saved room grant before inspecting the contract destination", async () => {
    const selectedRoom = { ...room, room_id: "shared_realtime_room:ce03ad8e-d0cb-4d73-8324-94b069f8e8c8" };
    const f = fixture({ ...status(false), recovery_pending: true,
      expires_at: "2099-01-01T00:00:00Z" }, selectedRoom);
    await screen.findByText(/saved program grant is still valid/);
    f.fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/status")) return json(status());
      if (String(url).endsWith("/control")) return json({ room: selectedRoom });
      throw new Error(`Unexpected request ${String(url)} ${String(init?.body)}`);
    });
    act(() => window.dispatchEvent(new CustomEvent(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT,
      { detail: { hostedRoomId: selectedRoom.room_id } })));
    await waitFor(() => expect(f.fetcher.mock.calls.some(([, init]) => {
      if (!init?.body) return false;
      const request = JSON.parse(String(init.body));
      return request.operation === "inspect" && request.room_id === selectedRoom.room_id;
    })).toBe(true));
    expect(f.open).not.toHaveBeenCalled();
  });
  it("does not render or fetch outside the native host", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<NativeRoomConnectionPanel realtimeSessionId={null} runtimeActive={false} fieldIdPrefix="test" />);
    expect(screen.queryByRole("region")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not launch sign-in when no room authority is configured", async () => {
    const f = fixture(status(false, false));
    await screen.findByText(/Hosted rooms are not set up in this installation/);
    expect(screen.getByRole("region", { name: "Room service connection" })).toHaveTextContent("matches this app's sign-in audience");
    expect(screen.getByRole("region", { name: "Room service connection" })).toHaveTextContent("Local rooms remain available on this device");
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Authorize room service" }) as HTMLButtonElement).disabled).toBe(true);
    expect(f.open).not.toHaveBeenCalled();
  });
  it("shows saved-grant recovery without prompting for a new OAuth grant", async () => {
    const f = fixture({ ...status(false), recovery_pending: true,
      expires_at: "2099-01-01T00:00:00Z" });
    expect(await screen.findByText(/saved program grant is still valid/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Authorize room service" }) as HTMLButtonElement)
      .disabled).toBe(true);
    expect(f.open).not.toHaveBeenCalled();
  });
  it("offers owner reauthorization when the saved room grant is denied", async () => {
    const f = fixture({ ...status(false), recovery_pending: true,
      expires_at: "2099-01-01T00:00:00Z",
      recovery_failure_code: "room_forbidden" });
    expect(await screen.findByText(/saved room grant was denied \(room_forbidden\)/)).toBeTruthy();
    const authorize = screen.getByRole("button", { name: "Authorize room service" }) as HTMLButtonElement;
    expect(authorize.disabled).toBe(false);
    fireEvent.click(authorize);
    await waitFor(() => expect(f.open).toHaveBeenCalledTimes(1));
  });
  it("requires an explicit room-purpose receipt and rechecks status after completion", async () => {
    const f = fixture(status(false));
    await screen.findByText("https://rooms.test");
    fireEvent.click(screen.getByRole("button", { name: "Authorize room service" }));
    await waitFor(() => expect(f.open).toHaveBeenCalledTimes(1));
    expect(f.fetcher.mock.calls[1][1]).toMatchObject({ method: "POST", body: "{}", credentials: "same-origin" });
    act(() => f.complete());
    await waitFor(() => expect(f.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/status"))).toHaveLength(2));
  });
  it.each([
    ["authorization_denied", /If Auth0 showed the wrong account, sign out of Auth0 in that same browser profile/],
    ["room_account_identity_mismatch", /Use the same account and sign-in method as this desktop profile/],
    ["signed_tenant_claim_missing", /app operator must check the Auth0 configuration/],
  ])("keeps website-link callbacks separate and explains room failure %s", async (error, recovery) => {
    cacheAccountCapabilityPolicy(buildHelixAccountCapabilityPolicy("developer"), "auth0:google-oauth2|intended");
    const f = fixture(status(false));
    fireEvent.click(await screen.findByRole("button", { name: "Authorize room service" }));
    await waitFor(() => expect(f.open).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Pending room browser handoff expires/)).toBeTruthy();
    expect(screen.getByText(/auth0:google-oauth2\|intended/)).toBeTruthy();
    expect(screen.getByText(/Website linking and Full Harness access are separate checks/)).toBeTruthy();
    act(() => f.complete({ schema: "casimir_desktop_auth0_account_link_completion/1", ok: true,
      authorization_purpose: "account_link", bearer_included: false, subject_included: false }));
    expect((screen.getByRole("button", { name: "Authorize room service" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => f.complete({ schema: "casimir_desktop_auth0_account_link_completion/1", ok: false,
      authorization_purpose: "shared_live_rooms", error,
      bearer_included: false, subject_included: false }));
    expect(await screen.findByText(recovery)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Authorize room service" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("directs a missing source grant to the app operator while preserving basic room status", async () => {
    const f = fixture(status(true));
    expect(await screen.findByText(/Authorized for room coordination on this account/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Authorize room service" }));
    await waitFor(() => expect(f.open).toHaveBeenCalledTimes(1));
    act(() => f.complete({ schema: "casimir_desktop_auth0_account_link_completion/1", ok: false,
      authorization_purpose: "shared_live_rooms", error: "room_source_scope_not_granted",
      bearer_included: false, subject_included: false }));
    expect(await screen.findByText(/must define helix\.room_sources\.manage on the CasimirBot API/)).toBeTruthy();
    expect(screen.getByText(/Existing room access can still work/)).toBeTruthy();
  });
  it("labels an existing room token without source scope before another OAuth attempt", async () => {
    fixture({ ...status(true), room_source_scope_ready: false });
    expect(await screen.findByText(/this token lacks helix\.room_sources\.manage/)).toBeTruthy();
    expect(screen.getByText(/Minecraft source admission is unavailable/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load service rooms" })).toBeTruthy();
  });
  it("shows the pending deadline and cancels the room handoff without starting another", async () => {
    const f = fixture(status(false));
    fireEvent.click(await screen.findByRole("button", { name: "Authorize room service" }));
    await screen.findByRole("button", { name: "Cancel pending room authorization" });
    expect(screen.getByText(/Refresh checks room status but does not cancel this handoff/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel pending room authorization" }));
    await screen.findByText(/Pending room authorization canceled/);
    expect(f.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/start"))).toHaveLength(1);
    expect(f.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/disconnect"))).toHaveLength(1);
  });
  it("reports a local callback transport failure without claiming wrong-account consent", async () => {
    const f = fixture(status(false));
    fireEvent.click(await screen.findByRole("button", { name: "Authorize room service" }));
    await waitFor(() => expect(f.open).toHaveBeenCalledTimes(1));
    act(() => f.complete({ schema: "casimir_desktop_auth0_account_link_completion/1", ok: false,
      authorization_purpose: "shared_live_rooms", error: "callback_transport_failed",
      bearer_included: false, subject_included: false }));
    expect(await screen.findByText(/could not confirm the browser return with its local service/)).toBeTruthy();
    expect(screen.getByText(/could not confirm the browser return with its local service/).textContent)
      .not.toContain("wrong account");
  });
  it("rejects an ordinary account-link receipt for room authorization", async () => {
    const f = fixture(status(false)); await screen.findByText("https://rooms.test");
    f.fetcher.mockResolvedValueOnce(json({ ...startReceipt(), authorization_purpose: undefined }));
    fireEvent.click(screen.getByRole("button", { name: "Authorize room service" }));
    await screen.findByText(/Room authorization could not start/); expect(f.open).not.toHaveBeenCalled();
  });
  it("reuses the join key after an uncertain response without repeating automatically", async () => {
    const f = fixture(); await screen.findByLabelText("Service room ID");
    f.fetcher.mockResolvedValueOnce(json({ outcome_unknown: true }, 409));
    await join(); await screen.findByText(/join result could not be confirmed/);
    expect(f.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/control"))).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Join service room" }));
    await screen.findByText("Room membership confirmed on this service.");
    const calls = f.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/control"));
    const first = JSON.parse(String(calls[0][1]?.body)), second = JSON.parse(String(calls[1][1]?.body));
    expect(first).toEqual(second); expect(first.idempotency_key).not.toContain(invite);
    expect(first.request).toEqual({ room_id: room.room_id, invite_code: invite });
    expect((screen.getByLabelText("Service invitation") as HTMLInputElement).value).toBe("");
    expect(f.fetcher.mock.calls.every(([url]) => String(url).includes("/agent-bindings/auth0/rooms/"))).toBe(true);
  });
  it("derives stable keys scoped to the authority, room and invitation", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const key = await nativeRoomJoinKey("https://rooms.test", room.room_id, invite);
    expect(await nativeRoomJoinKey("https://rooms.test", room.room_id, invite)).toBe(key);
    expect(await nativeRoomJoinKey("https://other.test", room.room_id, invite)).not.toBe(key);
    expect(await nativeRoomJoinKey("https://rooms.test", "other-room", invite)).not.toBe(key);
    expect(await nativeRoomJoinKey("https://rooms.test", room.room_id, `${invite}b`)).not.toBe(key);
  });
  it("clears private rooms on access denial", async () => {
    const f = fixture(); await screen.findByLabelText("Service room ID");
    fireEvent.click(screen.getByRole("button", { name: "Load service rooms" }));
    await screen.findByRole("button", { name: "Private room" });
    f.fetcher.mockResolvedValueOnce(json({ error: "account_not_linked" }, 403));
    fireEvent.click(screen.getByRole("button", { name: "Private room" }));
    await screen.findByText(/room request failed/);
    expect(screen.queryByRole("button", { name: "Private room" })).toBeNull();
    expect(screen.queryByLabelText("Service invitation")).toBeNull();
  });
  it.each(["account-change", "disconnect"])("withholds a late room response after %s", async action => {
    const f = fixture(); await screen.findByLabelText("Service room ID");
    let release!: (response: Response) => void;
    f.fetcher.mockImplementationOnce(async () => new Promise(resolve => { release = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Load service rooms" }));
    await waitFor(() => expect(release).toBeTypeOf("function"));
    f.fetcher.mockImplementation(async url => json(String(url).endsWith("/status") ? status(false) : { ok: true }));
    if (action === "account-change") act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    else fireEvent.click(screen.getByRole("button", { name: "Disconnect room service" }));
    await act(async () => { release(json({ rooms: [room] })); });
    expect(screen.queryByRole("button", { name: "Private room" })).toBeNull();
    expect(screen.queryByLabelText("Service invitation")).toBeNull();
  });
  it("allows recovery when native browser opening never settles", async () => {
    const f = fixture(status(false)); await screen.findByText("https://rooms.test");
    f.open.mockImplementationOnce(async () => new Promise(() => undefined));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Authorize room service" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(f.open).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(600001); });
    expect((screen.getByRole("button", { name: "Authorize room service" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Room authorization expired/)).toBeTruthy();
  });
  it("releases the pending browser operation when its callback arrives", async () => {
    const f = fixture(status(false)); await screen.findByText("https://rooms.test");
    f.open.mockImplementationOnce(async () => new Promise(() => undefined));
    fireEvent.click(screen.getByRole("button", { name: "Authorize room service" }));
    await waitFor(() => expect(f.open).toHaveBeenCalledTimes(1));
    act(() => f.complete());
    await waitFor(() => expect((screen.getByRole("button", { name: "Authorize room service" }) as HTMLButtonElement).disabled).toBe(false));
  });
});
