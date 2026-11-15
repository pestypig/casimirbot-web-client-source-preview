/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FriendHostedRoomMission } from "../FriendHostedRoomMission";

const identity = vi.hoisted(() => ({ profileId: "alice", revision: 1 }));
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "test:account-changed",
  readCachedAccountProfileIdentity: () => ({ ...identity }),
}));
vi.mock("@/components/helix/ask-console/shared-live-room/HostedRoomConsoleMission", () => ({
  HostedRoomMissionControls: () => <div>Admitted mission controls</div>,
}));
const roomId = "shared_realtime_room:dojo";
const connection = () => ({
  schema: "casimir_desktop_room_connection_status/1", ready: true,
  authority: "https://rooms.test", profile_ref: "alice",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
});
const inspection = () => ({
  schema: "helix.shared_live_room.inspect_receipt.v1", ok: true,
  room: { room_id: roomId, title: "Dojo", status: "active", self_participant_id: "seat-a",
    participants: [{ participant_id: "seat-a", display_name: "Alice", role: "guest", presence: "present" }] },
});
const json = (value: unknown) => new Response(JSON.stringify(value));
const open = () => {
  render(<FriendHostedRoomMission />);
  fireEvent.change(screen.getByLabelText("Hosted room ID"), { target: { value: roomId } });
  fireEvent.click(screen.getByRole("button", { name: "Open room mission" }));
};
beforeEach(() => { identity.profileId = "alice"; identity.revision++; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it.each(["wrong-profile", "expired", "not-ready"])("withholds the room lookup for %s connection evidence", async kind => {
  const receipt = connection();
  if (kind === "wrong-profile") receipt.profile_ref = "other";
  if (kind === "expired") receipt.expires_at = new Date(Date.now() - 1000).toISOString();
  if (kind === "not-ready") receipt.ready = false;
  const fetcher = vi.fn(async () => json(receipt));
  vi.stubGlobal("fetch", fetcher); open();
  await screen.findByRole("alert");
  expect(screen.queryByText("Admitted mission controls")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(["wrong-room", "closed", "left", "missing-self"])("withholds mission controls for %s room evidence", async kind => {
  const receipt = inspection();
  if (kind === "wrong-room") receipt.room.room_id = "shared_realtime_room:other";
  if (kind === "closed") receipt.room.status = "closed";
  if (kind === "left") receipt.room.participants[0].presence = "left";
  if (kind === "missing-self") receipt.room.self_participant_id = "absent";
  const fetcher = vi.fn().mockResolvedValueOnce(json(connection())).mockResolvedValueOnce(json(receipt));
  vi.stubGlobal("fetch", fetcher); open();
  await screen.findByRole("alert");
  expect(screen.queryByText("Admitted mission controls")).toBeNull();
  expect(JSON.parse(String(fetcher.mock.calls[1][1].body))).toEqual({ operation: "inspect", room_id: roomId });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("drops a late inspection when the account changes", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(json(connection()))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher); open();
  await act(async () => {});
  expect(fetcher).toHaveBeenCalledTimes(2);
  act(() => {
    identity.profileId = "other"; identity.revision++;
    window.dispatchEvent(new Event("test:account-changed"));
  });
  await act(async () => { finish(json(inspection())); });
  expect(screen.queryByText("Admitted mission controls")).toBeNull();
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
});

it("removes an admitted mission when its room authorization expires", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValueOnce(json(connection())).mockResolvedValueOnce(json(inspection()));
  vi.stubGlobal("fetch", fetcher); open();
  await act(async () => {});
  expect(screen.getByText("Admitted mission controls")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
  expect(screen.queryByText("Admitted mission controls")).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("connection expired");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

