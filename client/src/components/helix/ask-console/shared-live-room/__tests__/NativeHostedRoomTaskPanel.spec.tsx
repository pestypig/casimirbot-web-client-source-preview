// @vitest-environment jsdom
import React from "react";
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NativeHostedRoomTaskPanel } from "../NativeHostedRoomTaskPanel";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

const roomId = "shared_realtime_room:task-panel";
const authority = "https://rooms.test";
const target = { reasoning_binding_id: "binding:one", binding_epoch: 1, helix_conversation_id: "chat:one", binding_mission_id: null, run_id: null };
const attachment = { attachment_ref: "room_owner_attachment:11111111-1111-4111-8111-111111111111", revision: 4,
  node_ref: `room_node:sha256:${"a".repeat(64)}`, status: "reserved", expires_at: "2099-01-01T00:00:00Z",
  local_task_verified: false, dispatch_authority: false };
const options = { schema: "helix.native_hosted_room_options.v1", authority, room_id: roomId,
  candidate: target, local_revision: 2, local_status: "pending", attachment,
  dispatch_authority: false, answer_authority: false, raw_content_included: false };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fixture = () => {
  vi.stubGlobal("crypto", webcrypto);
  const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => json(options)); vi.stubGlobal("fetch", fetcher);
  const view = render(<NativeHostedRoomTaskPanel roomId={roomId} authority={authority} />);
  return { fetcher, view };
};
const refresh = () => fireEvent.click(screen.getByRole("button", { name: "Refresh owner selection" }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("shows the AI proposal controls only to an admitted developer owner", () => {
  vi.stubGlobal("fetch", vi.fn());
  const view = render(<NativeHostedRoomTaskPanel roomId={roomId} authority={authority}
    isOwner enableAiProposal={false} />);
  expect(screen.queryByRole("region", { name: "Room AI mission proposal review" })).toBeNull();
  view.rerender(<NativeHostedRoomTaskPanel roomId={roomId} authority={authority}
    isOwner enableAiProposal />);
  expect(screen.getByRole("region", { name: "Room AI mission proposal review" })).toBeTruthy();
  view.rerender(<NativeHostedRoomTaskPanel roomId={roomId} authority={authority}
    isOwner={false} enableAiProposal />);
  expect(screen.queryByRole("region", { name: "Room AI mission proposal review" })).toBeNull();
});

it("limits pending-room setup to task selection without exposing instruction or result controls", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const fetcher = vi.fn(async () => json(options));
  vi.stubGlobal("fetch", fetcher);
  render(<NativeHostedRoomTaskPanel roomId={roomId} authority={authority}
    isOwner enableAiProposal selectionOnly control={vi.fn()} />);
  expect(screen.getByRole("region", { name: "Hosted room task selection" })).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Room AI mission proposal review" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Refresh owner selection" }));
  await screen.findByText("chat:one");
  expect(screen.getByRole("button", { name: "Replace with this paired task" })).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Review captured speech/)).toBeNull();
});

it("does nothing on mount and sends only an explicitly reviewed selection with both revisions", async () => {
  const f = fixture(); expect(f.fetcher).not.toHaveBeenCalled(); refresh();
  await screen.findByText("chat:one");
  f.fetcher.mockResolvedValueOnce(json({ schema: "helix.native_hosted_room_selection.v1", ok: true,
    room_id: roomId, authority, local_task_selected: true, local_revision: 3,
    attachment: { ...attachment, revision: 5 }, dispatch_authority: false, answer_authority: false,
    terminal_eligible: false, raw_content_included: false }));
  fireEvent.click(screen.getByRole("button", { name: "Replace with this paired task" }));
  await screen.findByText(/Task selection recorded/);
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  const body = JSON.parse(String(f.fetcher.mock.calls[1][1]?.body));
  expect(body).toEqual({ room_id: roomId, target, expected_local_revision: 2, expected_remote_revision: 4, request_id: expect.stringMatching(/^native-select:/) });
  expect(screen.queryByRole("button", { name: "Replace with this paired task" })).toBeNull();
});
it("keeps revisions visible with an expired pairing and offers no selection", async () => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(json({ ...options, candidate: null })); refresh();
  await screen.findByText(/No currently authorized paired task/);
  expect(screen.getByText(/Last local selection: pending/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Replace with this paired task" })).toBeNull();
});
it("requires a new review after an uncertain response without automatically retrying", async () => {
  const f = fixture(); refresh(); await screen.findByText("chat:one");
  f.fetcher.mockResolvedValueOnce(json({ outcome_unknown: true }, 409));
  fireEvent.click(screen.getByRole("button", { name: "Replace with this paired task" }));
  await screen.findByText(/Selection could not be confirmed/);
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("button", { name: "Replace with this paired task" })).toBeNull();
  refresh(); await screen.findByText("chat:one");
  expect(f.fetcher.mock.calls[2][1]?.method).toBe("GET");
});

it.each([
  ["task_inactive", "Resume that exact Codex chat"],
  ["pairing_unavailable", "Open Message Codex"],
  ["device_access_changed", "Open Account & Sessions"],
  ["task_client_mismatch", "different CasimirBot connection"],
  ["task_unavailable", "Check Message Codex"],
])("offers specific recovery for %s without a selection or automatic request", async (reason, recovery) => {
  const f = fixture();
  f.fetcher.mockResolvedValueOnce(json({ ...options, candidate: null, candidate_unavailable_reason: reason }));
  refresh();
  const message = await screen.findByText(/No currently authorized paired task/);
  expect(message.textContent).toContain(recovery);
  expect(screen.getByText(/Last local selection: pending/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Replace with this paired task" })).toBeNull();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(f.fetcher.mock.calls[0][1]?.method).toBe("GET");
});

it("rejects an unrecognized recovery payload without echoing it or enabling selection", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValueOnce(json({ ...options, candidate: null,
    candidate_unavailable_reason: "private-unrecognized-detail" }));
  refresh();
  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("owner_options_schema_invalid");
  expect(document.body.textContent).not.toContain("private-unrecognized-detail");
  expect(screen.queryByRole("button", { name: "Replace with this paired task" })).toBeNull();
});
it.each(["account", "room"])("withholds a late options response after %s changes", async kind => {
  const f = fixture(); let release!: (response: Response) => void;
  f.fetcher.mockImplementationOnce(async () => new Promise(resolve => { release = resolve; })); refresh();
  if (kind === "account") act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  else f.view.rerender(<NativeHostedRoomTaskPanel roomId="shared_realtime_room:other" authority={authority} />);
  await act(async () => { release(json(options)); });
  expect(screen.queryByText("chat:one")).toBeNull();
});
it("rejects a receipt for another authority instead of enabling selection", async () => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(json({ ...options, authority: "https://other.test" })); refresh();
  await screen.findByText(/Owner selection is unavailable/);
  expect(screen.queryByText("chat:one")).toBeNull();
});
it("shows only a fixed server error code and status for a failed owner read", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValueOnce(json({ schema: "helix.native_hosted_room_selection_error.v1",
    error: "room_owner_presence_required", credential: "must-stay-hidden" }, 403));
  refresh();
  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("room_owner_presence_required · HTTP 403");
  expect(status.textContent).not.toContain("must-stay-hidden");
  expect(screen.queryByText("chat:one")).toBeNull();
});
it("shows a bounded fixed code even when a gateway omits the selection schema", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValueOnce(json({ error: "native_room_connection_not_current",
    credential: "must-stay-hidden" }, 403));
  refresh();
  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("native_room_connection_not_current · HTTP 403");
  expect(status.textContent).not.toContain("must-stay-hidden");
  expect(screen.queryByText("chat:one")).toBeNull();
});
it("does not echo an unrecognized failure payload", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValueOnce(json({ schema: "unexpected", error: "private-detail" }, 503));
  refresh();
  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("HTTP 503");
  expect(status.textContent).not.toContain("private-detail");
});

it("rejects owner options arriving after the request deadline without enabling selection", async () => {
  const f = fixture();
  vi.useFakeTimers();
  let release!: (response: Response) => void;
  f.fetcher.mockImplementationOnce(async () => new Promise(resolve => { release = resolve; }));
  refresh();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20001);
    release(json(options));
  });
  expect(screen.queryByText("chat:one")).toBeNull();
  expect(screen.queryByRole("button", { name: "Replace with this paired task" })).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Owner selection is unavailable");
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});

it("keeps selection unconfirmed when its acknowledgement arrives after the deadline", async () => {
  const f = fixture(); refresh(); await screen.findByText("chat:one");
  vi.useFakeTimers();
  let release!: (response: Response) => void;
  f.fetcher.mockImplementationOnce(async () => new Promise(resolve => { release = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "Replace with this paired task" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20001);
    release(json({ schema: "helix.native_hosted_room_selection.v1", ok: true,
      room_id: roomId, authority, local_task_selected: true, local_revision: 3,
      attachment: { ...attachment, revision: 5 }, dispatch_authority: false,
      answer_authority: false, terminal_eligible: false, raw_content_included: false }));
  });
  expect(screen.queryByText(/Task selection recorded/)).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Selection could not be confirmed");
  expect(screen.queryByRole("button", { name: "Replace with this paired task" })).toBeNull();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
