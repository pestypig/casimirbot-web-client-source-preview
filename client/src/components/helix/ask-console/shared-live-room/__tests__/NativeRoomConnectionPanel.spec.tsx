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

const room = { room_id: "shared_realtime_room:test", title: "Private room", status: "open", participants: [] };
const invite = `helix_live_${"a".repeat(32)}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const status = (ready = true, configured = true) => ({ schema: "casimir_desktop_room_connection_status/1", ready, configured,
  authority: configured ? "https://rooms.test" : null, expires_at: ready ? "2099-01-01T00:00:00Z" : null, bearer_included: false, subject_included: false });
const startReceipt = () => ({ schema: "casimir_desktop_auth0_account_link_start/1", ok: true,
  authorization_url: "https://tenant.auth0.com/authorize?response_type=code", expires_at: new Date(Date.now() + 600000).toISOString(),
  provider: "auth0", pkce: "S256", client_secret_used: false, bearer_included: false, subject_included: false, authorization_purpose: "shared_live_rooms" });
const fixture = (initial = status(), listedRoom = room) => {
  vi.stubGlobal("crypto", webcrypto);
  const open = vi.fn(async (_url: string) => undefined);
  let completion: () => void = () => undefined;
  Object.defineProperty(window, "casimirDesktop", { configurable: true, value: { openAuth0AccountLink: open,
    onAuth0AccountLinkCompletion: (listener: () => void) => { completion = listener; return vi.fn(); } } });
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
  render(<NativeRoomConnectionPanel fieldIdPrefix="test" />);
  return { fetcher, open, complete: () => completion() };
};
const join = async () => {
  fireEvent.change(await screen.findByLabelText("Service room ID"), { target: { value: room.room_id } });
  fireEvent.change(screen.getByLabelText("Service invitation"), { target: { value: invite } });
  fireEvent.click(screen.getByRole("button", { name: "Join service room" }));
};
afterEach(() => { cleanup(); clearCachedAccountCapabilityPolicy(); delete window.casimirDesktop;
  vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("native room connection panel", () => {
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
        <NativeRoomConnectionPanel fieldIdPrefix="portal" portalTarget={target}
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
  it("does not render or fetch outside the native host", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<NativeRoomConnectionPanel fieldIdPrefix="test" />);
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
  it("requires an explicit room-purpose receipt and rechecks status after completion", async () => {
    const f = fixture(status(false));
    await screen.findByText("https://rooms.test");
    fireEvent.click(screen.getByRole("button", { name: "Authorize room service" }));
    await waitFor(() => expect(f.open).toHaveBeenCalledTimes(1));
    expect(f.fetcher.mock.calls[1][1]).toMatchObject({ method: "POST", body: "{}", credentials: "same-origin" });
    act(() => f.complete());
    await waitFor(() => expect(f.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/status"))).toHaveLength(2));
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
