// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { SharedLiveRoomOwnerWorkflow } from "../SharedLiveRoomOwnerWorkflow";

const room = { room_id: "room:one", status: "open", participants: [], public_terminal_results: [] } as unknown as HelixSharedRealtimeRoom;
const candidate = { reasoning_binding_id: "binding:one", binding_epoch: 1,
  helix_conversation_id: "chat:one", binding_mission_id: null, run_id: null };
const mission = { ...candidate, room_id: room.room_id, mission_id: "mission:one", mission_revision: 1, status: "active" as const };
const report = { result_ref: "result:one", steering_event_ref: "event:one", room_id: room.room_id,
  room_mission_id: mission.mission_id, room_mission_revision: 1, status: "unable", created_at: "2026-09-25T12:00:00.000Z" };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
function fixture(initiallySelected = false) {
  let selected = initiallySelected;
  let revoked = false;
  const results = () => ({ schema: "helix.room_result_catalog.v1", room_id: room.room_id,
    mission: selected && !revoked ? { mission_id: mission.mission_id, mission_revision: 1 } : null,
    results: selected && !revoked && initiallySelected ? [report] : [],
    limited: false, answer_authority: false, raw_content_included: false });
  const fetcher = vi.fn(async (url: unknown, _init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/results")) return json(results());
    if (path.endsWith("/owner-options")) return json({ schema: "helix.room_mission_owner_catalog.v1",
      room_id: room.room_id, mission: selected ? mission : null, candidate, candidate_unavailable: false,
      handoffs: [], execution_authority: false, answer_authority: false, raw_content_included: false });
    if (path.endsWith("/select")) selected = true;
    else if (path.endsWith("/revoke")) revoked = true;
    else throw new Error(`Unexpected request ${path}`);
    return json({ ok: true, mission: revoked ? { ...mission, status: "revoked", mission_revision: 2 } : mission,
      dispatch_authority: false, answer_authority: false, terminal_eligible: false });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<SharedLiveRoomOwnerWorkflow room={room} onProcessed={vi.fn(async () => true)} />);
  return { fetcher, results };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("room mission and result panel synchronization", () => {
  it("rechecks results after selection without making a provider request", async () => {
    const f = fixture();
    await screen.findByText(/No external mission is selected/);
    fireEvent.click(screen.getByLabelText("Use this paired task for this room."));
    fireEvent.click(screen.getByRole("button", { name: "Select room task" }));
    await screen.findByText(/No returned results are available/);
    expect(screen.queryByText(/No external mission is selected/)).toBeNull();
    expect(f.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/results"))).toHaveLength(2);
    expect(f.fetcher.mock.calls.some(([url]) => url === "/api/agi/ask/turn")).toBe(false);
  });
  it("drops the old report and disclosure on revocation", async () => {
    const f = fixture(true);
    await waitFor(() => expect(f.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/results"))).toHaveLength(2));
    fireEvent.change(await screen.findByLabelText("Task report"), { target: { value: report.result_ref } });
    const panel = within(screen.getByRole("region", { name: "Owner task results" }));
    fireEvent.click(panel.getByRole("checkbox"));
    expect((panel.getByRole("button", { name: "Explain to room" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Revoke room mission" }));
    await screen.findByText(/No external mission is selected/);
    expect(screen.queryByLabelText("Task report")).toBeNull();
    expect(screen.queryByRole("button", { name: "Explain to room" })).toBeNull();
    expect(f.fetcher.mock.calls.some(([url]) => url === "/api/agi/ask/turn")).toBe(false);
  });
  it("ignores an old result read that settles after the mission was revoked", async () => {
    const f = fixture(true);
    await waitFor(() => expect(f.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/results"))).toHaveLength(2));
    await screen.findByLabelText("Task report");
    const oldCatalog = f.results();
    let finish!: (response: Response) => void;
    f.fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh results" }));
    const staleSignal = f.fetcher.mock.calls.at(-1)?.[1]?.signal;
    fireEvent.click(screen.getByRole("button", { name: "Revoke room mission" }));
    await screen.findByText(/No external mission is selected/);
    expect(staleSignal?.aborted).toBe(true);
    await act(async () => { finish(json(oldCatalog)); });
    await waitFor(() => expect(screen.queryByLabelText("Task report")).toBeNull());
  });
});
