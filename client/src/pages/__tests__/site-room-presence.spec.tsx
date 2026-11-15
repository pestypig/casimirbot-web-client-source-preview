// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SiteRoomPresencePage } from "../../../site/site-room-presence";

const roomId = "shared_realtime_room:room-presence-test";
const room = { room_id: roomId, title: "Discord dojo pilot", self_participant_id: "member:owner",
  participants: [{ participant_id: "member:owner", role: "owner", presence: "present" }] };
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

const participantRoom = { ...room, participants: [{ ...room.participants[0], role: "participant" }] };
const presenceResponse = () => new Response(JSON.stringify({
  schema: "helix.shared_realtime_room.response.v1", ok: true, room: participantRoom,
}));

it("requires explicit confirmation to withdraw the exact participant and lets them cancel", async () => {
  window.history.replaceState({}, "", `/desktop?service_room=${encodeURIComponent(roomId)}`);
  const fetcher = vi.fn(async () => presenceResponse());
  vi.stubGlobal("fetch", fetcher);
  render(<SiteRoomPresencePage />);
  fireEvent.click(screen.getByRole("button", { name: "Open selected room" }));
  fireEvent.click(await screen.findByRole("button", { name: "Leave room" }));
  expect(screen.getByText(/Rejoining requires a fresh owner invite/)).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Stay in room" }));
  expect(screen.queryByRole("button", { name: "Confirm leave room" })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("stops presence after withdrawal and ignores an older in-flight heartbeat", async () => {
  vi.useFakeTimers();
  window.history.replaceState({}, "", `/desktop?service_room=${encodeURIComponent(roomId)}`);
  let resolveHeartbeat!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { resolveHeartbeat = resolve; });
  let presenceCalls = 0;
  const fetcher = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    if (String(url).endsWith("/leave-participant")) return new Response(JSON.stringify({
      schema: "helix.shared_realtime_room.response.v1", ok: true, room: null,
    }));
    return ++presenceCalls === 1 ? presenceResponse() : pending;
  });
  vi.stubGlobal("fetch", fetcher);
  render(<SiteRoomPresencePage />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open selected room" })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  fireEvent.click(screen.getByRole("button", { name: "Leave room" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm leave room" })); });
  expect(screen.getByRole("status")).toHaveTextContent("You left Discord dojo pilot");
  expect(fetcher.mock.calls[2]).toEqual([
    `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/leave-participant`,
    expect.objectContaining({ method: "POST", credentials: "same-origin",
      body: JSON.stringify({ participant_only: true, expected_participant_id: room.self_participant_id }) }),
  ]);
  await act(async () => { resolveHeartbeat(presenceResponse()); });
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); window.dispatchEvent(new Event("pagehide")); });
  expect(screen.getByRole("status")).toHaveTextContent("You left Discord dojo pilot");
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("does not claim withdrawal when the server rejects the reviewed identity", async () => {
  window.history.replaceState({}, "", `/desktop?service_room=${encodeURIComponent(roomId)}`);
  const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("/leave-participant")
    ? new Response(JSON.stringify({ ok: false }), { status: 403 }) : presenceResponse());
  vi.stubGlobal("fetch", fetcher);
  render(<SiteRoomPresencePage />);
  fireEvent.click(screen.getByRole("button", { name: "Open selected room" }));
  fireEvent.click(await screen.findByRole("button", { name: "Leave room" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm leave room" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Leaving was not confirmed");
  expect(screen.queryByText(/You left Discord dojo pilot/)).toBeNull();
});

it("keeps only the exact signed-in room present and marks it away on page exit", async () => {
  window.history.replaceState({}, "", `/desktop?service_room=${encodeURIComponent(roomId)}`);
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ schema: "helix.shared_realtime_room.response.v1",
    ok: true, room }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  render(<SiteRoomPresencePage />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Open selected room" }));
  await screen.findByText("Discord dojo pilot");
  expect(screen.getByText("Owner present on domain")).toBeTruthy();
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ presence: "present" });
  await act(async () => { window.dispatchEvent(new Event("pagehide")); });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ presence: "away" });
  expect(fetcher.mock.calls[1][1]?.keepalive).toBe(true);
  expect(screen.queryByText(/Task selection recorded/)).toBeNull();
});

it("does not send a presence request without one valid room target", () => {
  window.history.replaceState({}, "", "/desktop?service_room=invalid");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<SiteRoomPresencePage />);
  expect(screen.getByRole("alert").textContent).toContain("installed CasimirBot app");
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["owner", "member"])("shows one-time invite creation only to the hosted room owner (%s)", async role => {
  window.history.replaceState({}, "", `/desktop?service_room=${encodeURIComponent(roomId)}`);
  const invite = `helix_live_${"x".repeat(32)}`;
  const fetcher = vi.fn(async () => new Response(JSON.stringify({
    schema: "helix.shared_realtime_room.response.v1", ok: true,
    room: { ...room, participants: [{ ...room.participants[0], role }] },
    invite_code: invite, invite_expires_at: "2099-01-01T00:00:00Z",
  })));
  vi.stubGlobal("fetch", fetcher);
  render(<SiteRoomPresencePage />);
  fireEvent.click(screen.getByRole("button", { name: "Open selected room" }));
  await screen.findByText(room.title);
  const button = screen.queryByRole("button", { name: "Create one-time invite" });
  if (role !== "owner") {
    expect(button).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    return;
  }
  expect(screen.queryByRole("button", { name: "Leave room" })).toBeNull();
  fireEvent.click(button!);
  const field = await screen.findByLabelText("Service invitation") as HTMLInputElement;
  expect(field.value).toBe(invite);
  expect(fetcher).toHaveBeenNthCalledWith(2, `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/invites`,
    expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store" }));
});
