// @vitest-environment jsdom
import React from "react";
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { NativeHostedRoomTextConversation, useNativeHostedRoomTextConversation } from "../NativeHostedRoomTextConversation";
import { createRoomTextDraftStore } from "../RoomTextDraftStore";
vi.mock("../NativeHostedRoomTextReleaseControls", () => ({
  NativeHostedRoomTextReleaseControls: () => <div>Dialog author release controls</div>,
}));
vi.mock("../NativeHostedRoomInterpreterTurnHistory", () => ({
  NativeHostedRoomInterpreterTurnHistory: () => <div>Dialog shared AI history</div>,
}));

const roomA = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const roomB = "shared_realtime_room:22222222-2222-4222-8222-222222222222";
const self = "participant:owner";
const message = (roomId: string, text: string) => ({
  message_id: "room_message:33333333-3333-4333-8333-333333333333",
  room_id: roomId, author_participant_id: self, text,
  created_at: "2026-09-25T13:00:00.000Z", content_role: "room_member_text",
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
});
const common = (roomId: string) => ({ api_version: "v1", ok: true,
  room: { room_id: roomId }, model_input: false, task_handoff: false,
  reentry_required: true, answer_authority: false, assistant_answer: false,
  terminal_eligible: false, raw_content_included: true });
const list = (roomId: string, messages: unknown[]) => ({ ...common(roomId),
  schema: "helix.shared_live_room.text_list.v1", operation: "room.text.list", messages });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const props = (roomId: string) => ({ roomId, authority: "https://rooms.test", selfParticipantId: self,
  participants: [{ participant_id: self, display_name: "Owner" }], closed: false });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("posts a slash request as exact human text without granting model access", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const requests: Array<Record<string, unknown>> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    requests.push(body);
    if (body.operation === "text_list") return json(list(roomA, []));
    return json({ ...common(roomA), schema: "helix.shared_live_room.text_send.v1",
      operation: "room.text.send", message: message(roomA, "Check the current clock") });
  }));
  const { result } = renderHook(() => useNativeHostedRoomTextConversation({ ...props(roomA) }));
  await waitFor(() => expect(result.current.admitted).toBe(true));
  act(() => result.current.updateDraft("/agent Check the current clock"));
  let confirmed = false;
  await act(async () => { confirmed = await result.current.send("Check the current clock"); });
  expect(confirmed).toBe(true);
  expect(requests.map(request => request.operation)).toEqual(["text_list", "text_send", "text_list"]);
  expect((requests[1].request as { text: string }).text).toBe("Check the current clock");
});

it("links to the Console without mounting a duplicate AI conversation in setup", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json(list(roomA, []))));
  const onOpen = vi.fn();
  render(<NativeHostedRoomTextConversation {...props(roomA)} enableAiAccess
    onOpenInConsole={onOpen} />);
  const button = await screen.findByRole("button", { name: "Write in Console" });
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.queryByText("Dialog author release controls")).toBeNull();
  expect(screen.queryByText("Dialog shared AI history")).toBeNull();
  fireEvent.click(button);
  expect(onOpen).toHaveBeenCalledTimes(1);
});

it("hides the previous hosted room's history and draft before the next read completes", async () => {
  let releaseNext!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return body.room_id === roomA ? json(list(roomA, [message(roomA, "Old hosted room")]))
      : new Promise<Response>(resolve => { releaseNext = resolve; });
  }));
  const view = render(<NativeHostedRoomTextConversation {...props(roomA)} />);
  await screen.findByText(/Old hosted room/);
  fireEvent.change(screen.getByRole("textbox", { name: "Message to room members" }),
    { target: { value: "Old hosted draft" } });
  view.rerender(<NativeHostedRoomTextConversation {...props(roomB)} />);
  expect(screen.queryByText(/Old hosted room/)).toBeNull();
  expect(screen.getByRole("textbox", { name: "Message to room members" })).toHaveValue("");
  expect(screen.getByRole("button", { name: "Send to room" })).toBeDisabled();
  await act(async () => { releaseNext(json(list(roomB, []))); });
});

it("retains a hosted-room draft across panel close but clears it on account change", async () => {
  const store = createRoomTextDraftStore();
  vi.stubGlobal("fetch", vi.fn(async () => json(list(roomA, []))));
  const first = render(<NativeHostedRoomTextConversation {...props(roomA)} draftStore={store} />);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Message to room members" })).toBeEnabled());
  fireEvent.change(screen.getByRole("textbox", { name: "Message to room members" }),
    { target: { value: "Host draft for this room" } });
  first.unmount();
  render(<NativeHostedRoomTextConversation {...props(roomA)} draftStore={store} />);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Message to room members" })).toBeEnabled());
  expect(screen.getByRole("textbox", { name: "Message to room members" })).toHaveValue("Host draft for this room");
  act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Message to room members" })).toHaveValue(""));
  expect(store.read({ source: "hosted", authority: "https://rooms.test", roomId: roomA, participantId: self }).text).toBe("");
});

it("reuses the hosted request identity after an uncertain send and panel remount", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const store = createRoomTextDraftStore();
  const sends: Array<{ client_message_id: string; text: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.operation === "text_list") return json(list(roomA, sends.length > 1 ? [message(roomA, "Retry once")] : []));
    sends.push(body.request);
    if (sends.length === 1) throw Error("response_lost");
    return json({ ...common(roomA), schema: "helix.shared_live_room.text_send.v1",
      operation: "room.text.send", message: message(roomA, body.request.text) });
  }));
  const first = render(<NativeHostedRoomTextConversation {...props(roomA)} draftStore={store} />);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Message to room members" })).toBeEnabled());
  fireEvent.change(screen.getByRole("textbox", { name: "Message to room members" }), { target: { value: "Retry once" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to room" }));
  await screen.findByText(/Send could not be confirmed/);
  first.unmount();
  render(<NativeHostedRoomTextConversation {...props(roomA)} draftStore={store} />);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Message to room members" })).toBeEnabled());
  expect(screen.getByRole("textbox", { name: "Message to room members" })).toHaveValue("Retry once");
  fireEvent.click(screen.getByRole("button", { name: "Send to room" }));
  await waitFor(() => expect(screen.getByLabelText("Hosted room text history")).toHaveTextContent("Owner: Retry once"));
  expect(sends).toHaveLength(2);
  expect(sends[1]).toEqual(sends[0]);
});

it("sends member text through the exact service room without an AI or task operation", async () => {
  vi.stubGlobal("crypto", webcrypto);
  let sent = false;
  const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.operation === "text_list") return json(list(roomA, sent ? [message(roomA, "Hello room")] : []));
    expect(body.operation).toBe("text_send"); expect(body.room_id).toBe(roomA);
    expect(body.request).toMatchObject({ text: "Hello room" });
    expect(body.request.client_message_id).toMatch(/^room-text:/);
    sent = true;
    return json({ ...common(roomA), schema: "helix.shared_live_room.text_send.v1",
      operation: "room.text.send", message: message(roomA, "Hello room") });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<NativeHostedRoomTextConversation {...props(roomA)} />);
  const field = screen.getByRole("textbox", { name: "Message to room members" });
  await waitFor(() => expect((field as HTMLTextAreaElement).disabled).toBe(false));
  fireEvent.change(field, { target: { value: "Hello room" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to room" }));
  await waitFor(() => expect(screen.getByLabelText("Hosted room text history"))
    .toHaveTextContent("Owner: Hello room"));
  expect(screen.getByRole("region", { name: "Hosted room text conversation" }))
    .toHaveTextContent(`Room: ${roomA}`);
  expect(fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)).operation))
    .toEqual(["text_list", "text_send", "text_list"]);
});

it("does not show a late message from a prior room or account", async () => {
  let release!: (value: Response) => void;
  const fetcher = vi.fn()
    .mockImplementationOnce(async () => new Promise<Response>(resolve => { release = resolve; }))
    .mockImplementation(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return json(list(body.room_id, []));
    });
  vi.stubGlobal("fetch", fetcher);
  const view = render(<NativeHostedRoomTextConversation {...props(roomA)} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  view.rerender(<NativeHostedRoomTextConversation {...props(roomB)} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await act(async () => { release(json(list(roomA, [message(roomA, "Private to old room")]))) });
  expect(screen.queryByText(/Private to old room/)).toBeNull();
  act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(screen.queryByText(/Private to old room/)).toBeNull();
});

it("clears an already visible room history on account change before the new account is admitted", async () => {
  let releaseSecondRead!: (value: Response) => void;
  const fetcher = vi.fn()
    .mockImplementationOnce(async () => json(list(roomA, [message(roomA, "Previous account room text")])))
    .mockImplementationOnce(async () => new Promise<Response>(resolve => { releaseSecondRead = resolve; }))
    .mockImplementation(async () => json(list(roomA, [])));
  vi.stubGlobal("fetch", fetcher);
  render(<NativeHostedRoomTextConversation {...props(roomA)} />);
  expect(await screen.findByText(/Previous account room text/)).toBeTruthy();
  act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(/Previous account room text/)).toBeNull();
  expect((screen.getByRole("textbox", { name: "Message to room members" }) as HTMLTextAreaElement).disabled).toBe(true);
  await act(async () => { releaseSecondRead(json(list(roomA, []))); });
  expect(screen.queryByText(/Previous account room text/)).toBeNull();
});
