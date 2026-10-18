// @vitest-environment jsdom
import React from "react";
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { SharedLiveRoomTextConversation, useSharedLiveRoomTextConversation } from "../SharedLiveRoomTextConversation";
import { createRoomTextDraftStore } from "../RoomTextDraftStore";

vi.mock("../SharedRoomTextReleaseControls", () => ({ SharedRoomTextReleaseControls: () => null }));

const room = (id: string) => ({ room_id: id, self_participant_id: "owner", status: "waiting_for_participant",
  participants: [{ participant_id: "owner", display_name: "Dan" }] }) as HelixSharedRealtimeRoom;
const list = (id: string, messages: unknown[] = []) => new Response(JSON.stringify({
  schema: "helix.shared_realtime_room.text_messages.v1", room_id: id, messages,
  model_input: false, task_handoff: false,
}), { status: 200, headers: { "Content-Type": "application/json" } });
const message = (id: string, text: string) => ({ message_id: `message:${id}`, room_id: id,
  author_participant_id: "owner", text, created_at: "2026-09-28T00:00:00.000Z", content_role: "room_member_text" });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("room text conversation", () => {
  it("posts a slash request as a member message before separate AI approval", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const requests: Array<{ text: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method !== "POST") return list("room:agent");
      const body = JSON.parse(String(init.body)) as { text: string };
      requests.push(body);
      return new Response(JSON.stringify({ schema: "helix.shared_realtime_room.text_message.v1",
        room_id: "room:agent", message: message("room:agent", body.text),
        model_input: false, task_handoff: false }), { status: 201 });
    }));
    const { result } = renderHook(() => useSharedLiveRoomTextConversation(room("room:agent")));
    await waitFor(() => expect(result.current.admitted).toBe(true));
    act(() => result.current.updateDraft("/agent Check the current clock"));
    let confirmed = false;
    await act(async () => { confirmed = await result.current.send("Check the current clock"); });
    expect(confirmed).toBe(true);
    expect(requests).toEqual([{ client_message_id: expect.stringMatching(/^room-text:/),
      text: "Check the current clock" }]);
  });
  it("uses the Console composer without leaving a second dialog sender", () => {
    const onOpenInConsole = vi.fn();
    const conversation = { admitted: true, messages: [], draft: "Room draft", sending: false,
      error: "", send: vi.fn(), updateDraft: vi.fn() } as never;
    render(<SharedLiveRoomTextConversation room={room("room:one")} conversation={conversation}
      onOpenInConsole={onOpenInConsole} />);
    expect(screen.queryByRole("textbox", { name: "Message to room members" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send to room" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Write in Console" }));
    expect(onOpenInConsole).toHaveBeenCalledOnce();
  });
  it("hides old room history and draft immediately on a room switch", async () => {
    let releaseNext!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn((url: unknown) => String(url).includes("room%3Aold")
      ? Promise.resolve(list("room:old", [message("room:old", "Old room only")]))
      : new Promise<Response>(resolve => { releaseNext = resolve; })));
    const view = render(<SharedLiveRoomTextConversation room={room("room:old")} />);
    await screen.findByText(/Old room only/);
    fireEvent.change(screen.getByLabelText("Message to room members"), { target: { value: "Old draft" } });
    view.rerender(<SharedLiveRoomTextConversation room={room("room:new")} />);
    expect(screen.queryByText(/Old room only/)).toBeNull();
    expect(screen.getByLabelText("Message to room members")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send to room" })).toBeDisabled();
    releaseNext(list("room:new", [message("room:new", "New room only")]));
    await screen.findByText(/New room only/);
  });
  it("retains the exact room draft and retry identity across dialog remount", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const store = createRoomTextDraftStore();
    const sends: Array<{ client_message_id: string; text: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method !== "POST") return list("room:retained", sends.length > 1
        ? [message("room:retained", "Retained message")] : []);
      const body = JSON.parse(String(init.body)); sends.push(body);
      if (sends.length === 1) throw Error("response_lost");
      return new Response(JSON.stringify({ schema: "helix.shared_realtime_room.text_message.v1",
        room_id: "room:retained", message: message("room:retained", body.text),
        model_input: false, task_handoff: false }), { status: 201 });
    }));
    const first = render(<SharedLiveRoomTextConversation room={room("room:retained")} draftStore={store} />);
    await waitFor(() => expect(screen.getByLabelText("Message to room members")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Message to room members"), { target: { value: "Retained message" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to room" }));
    await screen.findByText(/Send could not be confirmed/);
    first.unmount();
    render(<SharedLiveRoomTextConversation room={room("room:retained")} draftStore={store} />);
    await waitFor(() => expect(screen.getByLabelText("Message to room members")).toBeEnabled());
    expect(screen.getByLabelText("Message to room members")).toHaveValue("Retained message");
    fireEvent.click(screen.getByRole("button", { name: "Send to room" }));
    await screen.findByText("Retained message");
    expect(sends).toHaveLength(2);
    expect(sends[1]).toEqual(sends[0]);
    expect(store.read({ source: "local", authority: "", roomId: "room:retained", participantId: "owner" }).text).toBe("");
  });
  it("drops a late response from the previous room", async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    const fetcher = vi.fn((url: unknown) => String(url).includes("room%3Afirst")
      ? new Promise<Response>(resolve => { resolveFirst = resolve; })
      : Promise.resolve(list("room:second", [message("room:second", "Second room only")])));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<SharedLiveRoomTextConversation room={room("room:first")} />);
    view.rerender(<SharedLiveRoomTextConversation room={room("room:second")} />);
    await screen.findByText(/Second room only/);
    resolveFirst?.(list("room:first", [message("room:first", "Private old room text")]));
    await Promise.resolve();
    expect(screen.queryByText(/Private old room text/)).toBeNull();
  });

  it("aborts an in-flight send when the selected room changes", async () => {
    vi.stubGlobal("crypto", webcrypto);
    let releaseOldSend: ((value: Response) => void) | undefined;
    let oldSendSignal: AbortSignal | undefined;
    const fetcher = vi.fn((url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        oldSendSignal = init.signal ?? undefined;
        return new Promise<Response>(resolve => { releaseOldSend = resolve; });
      }
      return Promise.resolve(list(String(url).includes("room%3Anew") ? "room:new" : "room:old"));
    });
    vi.stubGlobal("fetch", fetcher);
    const view = render(<SharedLiveRoomTextConversation room={room("room:old")} />);
    await waitFor(() => expect(screen.getByLabelText("Message to room members")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Message to room members"), { target: { value: "Only for old room" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to room" }));
    await waitFor(() => expect(oldSendSignal).toBeDefined());
    view.rerender(<SharedLiveRoomTextConversation room={room("room:new")} />);
    await waitFor(() => expect(oldSendSignal?.aborted).toBe(true));
    releaseOldSend?.(new Response(JSON.stringify({ schema: "helix.shared_realtime_room.text_message.v1",
      room_id: "room:old", message: message("room:old", "Only for old room"), model_input: false, task_handoff: false }), { status: 201 }));
    await waitFor(() => expect(screen.getByLabelText("Message to room members")).toHaveValue(""));
    expect(screen.queryByText("Only for old room")).toBeNull();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("does not confirm a room send attributed to another participant", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST"
      ? new Response(JSON.stringify({ schema: "helix.shared_realtime_room.text_message.v1",
        room_id: "room:solo", message: { ...message("room:solo", "Hello"), author_participant_id: "guest" },
        model_input: false, task_handoff: false }), { status: 201 })
      : list("room:solo")));
    render(<SharedLiveRoomTextConversation room={room("room:solo")} />);
    await waitFor(() => expect(screen.getByLabelText("Message to room members")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Message to room members"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to room" }));
    await screen.findByText(/Send could not be confirmed/);
    expect(screen.getByLabelText("Message to room members")).toHaveValue("Hello");
  });

  it("aborts an in-flight send on account change and requires fresh room admission", async () => {
    vi.stubGlobal("crypto", webcrypto);
    let reads = 0;
    let pendingSignal: AbortSignal | undefined;
    const fetcher = vi.fn(((_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        pendingSignal = init.signal ?? undefined;
        return new Promise<Response>(() => {});
      }
      return Promise.resolve(++reads === 1 ? list("room:solo") : new Response("{}", { status: 403 }));
    }));
    vi.stubGlobal("fetch", fetcher);
    render(<SharedLiveRoomTextConversation room={room("room:solo")} />);
    await waitFor(() => expect(screen.getByLabelText("Message to room members")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Message to room members"), { target: { value: "Old account text" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to room" }));
    await waitFor(() => expect(pendingSignal).toBeDefined());
    window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
    await waitFor(() => expect(pendingSignal?.aborted).toBe(true));
    await screen.findByText(/Room messages could not be loaded/);
    expect(screen.getByLabelText("Message to room members")).toBeDisabled();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("aborts an in-flight send when the room closes", async () => {
    vi.stubGlobal("crypto", webcrypto);
    let pendingSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        pendingSignal = init.signal ?? undefined;
        return new Promise<Response>(() => {});
      }
      return Promise.resolve(list("room:closing"));
    });
    vi.stubGlobal("fetch", fetcher);
    const currentRoom = room("room:closing");
    const view = render(<SharedLiveRoomTextConversation room={currentRoom} />);
    await waitFor(() => expect(screen.getByLabelText("Message to room members")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Message to room members"), { target: { value: "Close before delivery" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to room" }));
    await waitFor(() => expect(pendingSignal).toBeDefined());
    view.rerender(<SharedLiveRoomTextConversation room={{ ...currentRoom, status: "closed" }} />);
    await waitFor(() => expect(pendingSignal?.aborted).toBe(true));
    expect(screen.getByRole("button", { name: "Send to room" })).toBeDisabled();
    expect(screen.getByLabelText("Message to room members")).toBeDisabled();
  });

  it("reuses one request identity after an uncertain send and keeps text out of Ask", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const sends: Array<{ client_message_id: string; text: string }> = [];
    let postCount = 0;
    const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (init?.method !== "POST") return list("room:solo", postCount > 1 ? [message("room:solo", "Hello Sam")] : []);
      const body = JSON.parse(String(init.body)); sends.push(body); postCount += 1;
      if (postCount === 1) throw new Error("response_lost");
      return new Response(JSON.stringify({ schema: "helix.shared_realtime_room.text_message.v1",
        room_id: "room:solo", message: message("room:solo", body.text), model_input: false, task_handoff: false }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<SharedLiveRoomTextConversation room={room("room:solo")} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Message to room members"), { target: { value: "Hello Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to room" }));
    await screen.findByText(/Send could not be confirmed/);
    fireEvent.click(screen.getByRole("button", { name: "Send to room" }));
    await screen.findByText("Hello Sam");
    expect(sends).toHaveLength(2);
    expect(sends[0]).toEqual(sends[1]);
    expect(sends[0].client_message_id).toMatch(/^room-text:/);
    expect(screen.getByRole("region", { name: "Room text conversation" })).toHaveTextContent("does not call a model or queue a task instruction");
  });

  it("does not ask for a resend when the message was confirmed but history refresh failed", async () => {
    vi.stubGlobal("crypto", webcrypto);
    let reads = 0;
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method !== "POST") return ++reads === 1 ? list("room:confirmed") : new Response("{}", { status: 503 });
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ schema: "helix.shared_realtime_room.text_message.v1",
        room_id: "room:confirmed", message: message("room:confirmed", body.text), model_input: false, task_handoff: false }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<SharedLiveRoomTextConversation room={room("room:confirmed")} />);
    await waitFor(() => expect(reads).toBe(1));
    fireEvent.change(screen.getByLabelText("Message to room members"), { target: { value: "Sent once" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to room" }));
    await screen.findByText(/Message sent. Room history could not be refreshed yet/);
    expect((screen.getByLabelText("Message to room members") as HTMLTextAreaElement).value).toBe("");
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("clears previously visible room text when membership can no longer be read", async () => {
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn(async () => ++reads === 1
      ? list("room:revoked", [message("room:revoked", "Previously shared")])
      : new Response("{}", { status: 403 })));
    render(<SharedLiveRoomTextConversation room={room("room:revoked")} />);
    await screen.findByText(/Previously shared/);
    window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
    await screen.findByText(/Room messages could not be loaded/);
    expect(screen.queryByText(/Previously shared/)).toBeNull();
    expect(screen.getByRole("button", { name: "Send to room" })).toBeDisabled();
  });
});
