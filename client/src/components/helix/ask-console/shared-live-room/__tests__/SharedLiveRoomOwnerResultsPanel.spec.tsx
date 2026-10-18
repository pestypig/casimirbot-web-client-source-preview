// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { SharedLiveRoomOwnerResultsPanel } from "../SharedLiveRoomOwnerResultsPanel";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

const room = { room_id: "shared_realtime_room:one", status: "open", public_terminal_results: [] } as unknown as HelixSharedRealtimeRoom;
const catalog = { schema: "helix.room_result_catalog.v1", room_id: room.room_id,
  mission: { mission_id: "mission:one", mission_revision: 2 }, limited: false,
  results: [{ result_ref: "result:one", steering_event_ref: "event:one", room_id: room.room_id,
    room_mission_id: "mission:one", room_mission_revision: 2, status: "unable", created_at: "2026-09-24T23:00:00.000Z" }],
  answer_authority: false, raw_content_included: false };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function fixture() {
  const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => json(catalog));
  vi.stubGlobal("fetch", fetcher);
  const onProcessed = vi.fn(async () => true);
  const ui = render(<SharedLiveRoomOwnerResultsPanel room={room} onProcessed={onProcessed} />);
  return { fetcher, onProcessed, ...ui };
}
async function choose() {
  fireEvent.change(await screen.findByLabelText("Task report"), { target: { value: "result:one" } });
  fireEvent.click(screen.getByRole("checkbox"));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("owner result sharing", () => {
  it("requires an explicit selection and disclosure before sending the exact source", async () => {
    const f = fixture();
    const button = await screen.findByRole("button", { name: "Explain to room" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Task unable to complete/)).toBeTruthy();
    await choose();
    f.fetcher.mockResolvedValue(json({ final_status: "final_answer", turn_id: "ask:room-result:one", selected_final_answer: "Private response is not rendered directly" }));
    fireEvent.click(button);
    await waitFor(() => expect(f.onProcessed).toHaveBeenCalledOnce());
    const [url, init] = f.fetcher.mock.calls[1];
    expect(url).toBe("/api/agi/ask/turn");
    expect(JSON.parse(init!.body as string)).toEqual({ question: "Explain the selected task report to this room.",
      session_id: `helix-ask:room:${room.room_id}`, room_mission_result: { room_id: room.room_id,
        room_mission_id: "mission:one", room_mission_revision: 2, steering_event_ref: "event:one",
        result_ref: "result:one", request_id: "result:one", share_with_room: true } });
    expect(screen.queryByText("Private response is not rendered directly")).toBeNull();
    expect(screen.getByText(/Waiting for its shared room result/)).toBeTruthy();
    f.rerender(<SharedLiveRoomOwnerResultsPanel room={{ ...room, public_terminal_results: [{ turn_id: "ask:room-result:one" } as never] }} onProcessed={f.onProcessed} />);
    expect(screen.getByText(/explanation is available in Shared supported results/)).toBeTruthy();
  });
  it("reuses the request after an uncertain response and does not double-submit while pending", async () => {
    const f = fixture(); await choose();
    let reject!: (reason: Error) => void;
    f.fetcher.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const button = screen.getByRole("button", { name: "Explain to room" });
    fireEvent.click(button); fireEvent.click(button);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    reject(new Error("network"));
    await screen.findByText(/outcome is unknown/);
    f.fetcher.mockResolvedValue(json({ final_status: "final_answer", turn_id: "ask:room-result:one" }));
    fireEvent.click(screen.getByRole("button", { name: "Explain to room" }));
    await waitFor(() => expect(f.onProcessed).toHaveBeenCalledOnce());
    expect(f.fetcher.mock.calls[2][1]?.body).toBe(f.fetcher.mock.calls[1][1]?.body);
  });
  it("requires disclosure again when the question changes", async () => {
    fixture(); await choose();
    fireEvent.change(screen.getByLabelText("What should the room understand?"), { target: { value: "What remains uncertain?" } });
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("button", { name: "Explain to room" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it.each([202, 409, 200])("does not claim publication from pending or failure HTTP %s", async status => {
    const f = fixture(); await choose();
    f.fetcher.mockResolvedValue(json({ final_status: "final_failure", terminal_error_code: "room_result_mission_not_current" }, status));
    fireEvent.click(screen.getByRole("button", { name: "Explain to room" }));
    await screen.findByText(status === 202 ? /still running/ : /No shared answer confirmed/);
    expect(f.onProcessed).not.toHaveBeenCalled();
    expect(screen.queryByText(/explanation is available/)).toBeNull();
  });
  it("does not accept a catalog from another room", async () => {
    const f = fixture();
    await screen.findByLabelText("Task report");
    f.fetcher.mockResolvedValue(json({ ...catalog, room_id: "room:other" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh results" }));
    await screen.findByText(/room_result_source_mismatch/);
    expect(screen.queryByLabelText("Task report")).toBeNull();
  });
  it("aborts an in-flight request on room-panel unmount without reopening the old room", async () => {
    const f = fixture(); await choose();
    let finish!: (response: Response) => void;
    f.fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Explain to room" }));
    const signal = f.fetcher.mock.calls[1][1]?.signal;
    f.unmount();
    expect(signal?.aborted).toBe(true);
    finish(json({ final_status: "final_answer", turn_id: "ask:room-result:one" }));
    await Promise.resolve(); await Promise.resolve();
    expect(f.onProcessed).not.toHaveBeenCalled();
  });
});

const approved = { schema: "helix.shared_live_room.report_catalog.v1", operation: "room.report.list", api_version: "v1", ok: true,
  room: { room_id: room.room_id }, reports: [{ disclosure_ref: `room_task_disclosure:${"a".repeat(32)}`,
    result_sha256: "b".repeat(64), task_status: "unable", created_at: "2026-09-25T01:00:00.000Z", content_role: "untrusted_external_task_observation" }],
  has_more: false, reentry_required: true, answer_authority: false, assistant_answer: false, terminal_eligible: false, raw_content_included: false };
async function hostedFixture() {
  const f = fixture(); await screen.findByLabelText("Task report");
  f.fetcher.mockResolvedValue(json(approved));
  fireEvent.change(screen.getByLabelText("Report location"), { target: { value: "hosted" } });
  await waitFor(() => expect(screen.getByRole("option", { name: /Task unable to complete/ }).getAttribute("value")).toBe(approved.reports[0].disclosure_ref));
  return f;
}
async function chooseHosted() {
  fireEvent.change(screen.getByLabelText("Task report"), { target: { value: approved.reports[0].disclosure_ref } });
  fireEvent.click(screen.getByRole("checkbox"));
}
describe("approved hosted result sharing", () => {
  it("loads only metadata before explicit consent and sends the exact approved identity without local task fields", async () => {
    const f = await hostedFixture();
    expect(f.fetcher.mock.calls[1][0]).toBe(`/api/account/session/rooms/${encodeURIComponent(room.room_id)}/approved-reports`);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect((screen.getByRole("button", { name: "Explain to room" }) as HTMLButtonElement).disabled).toBe(true);
    await chooseHosted();
    f.fetcher.mockResolvedValue(json({ final_status: "final_answer", turn_id: "ask:room-result:hosted", selected_final_answer: "Never render this payload directly" }));
    fireEvent.click(screen.getByRole("button", { name: "Explain to room" }));
    await waitFor(() => expect(f.onProcessed).toHaveBeenCalledOnce());
    expect(JSON.parse(f.fetcher.mock.calls[2][1]!.body as string)).toEqual({ question: "Explain the selected task report to this room.",
      session_id: `helix-ask:room:${room.room_id}`, room_mission_result: { source: "hosted_approved_report", room_id: room.room_id,
        disclosure_ref: approved.reports[0].disclosure_ref, result_sha256: approved.reports[0].result_sha256,
        request_id: approved.reports[0].disclosure_ref, share_with_room: true } });
    expect(screen.queryByText("Never render this payload directly")).toBeNull();
    f.rerender(<SharedLiveRoomOwnerResultsPanel room={{ ...room, public_terminal_results: [{ turn_id: "ask:room-result:hosted" } as never] }} onProcessed={f.onProcessed} />);
    expect(screen.getByText(/explanation is available in Shared supported results/)).toBeTruthy();
  });
  it("reuses the identical explicit request after an uncertain outcome", async () => {
    const f = await hostedFixture(); await chooseHosted();
    f.fetcher.mockRejectedValueOnce(new Error("lost response"));
    fireEvent.click(screen.getByRole("button", { name: "Explain to room" }));
    await screen.findByText(/outcome is unknown/);
    f.fetcher.mockResolvedValue(json({ final_status: "final_answer", turn_id: "ask:room-result:hosted" }));
    fireEvent.click(screen.getByRole("button", { name: "Explain to room" }));
    await waitFor(() => expect(f.onProcessed).toHaveBeenCalledOnce());
    expect(f.fetcher.mock.calls[2][1]?.body).toBe(f.fetcher.mock.calls[3][1]?.body);
  });
  it("requires a new selection and consent when changing report location", async () => {
    const f = await hostedFixture(); await chooseHosted(); f.fetcher.mockResolvedValue(json(catalog));
    fireEvent.change(screen.getByLabelText("Report location"), { target: { value: "local" } });
    await screen.findByLabelText("Task report");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("button", { name: "Explain to room" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it.each(["foreign-room", "raw-text", "duplicate"])("withholds an invalid %s catalog", async kind => {
    const f = await hostedFixture(); const invalid = structuredClone(approved);
    if (kind === "foreign-room") invalid.room.room_id = "shared_realtime_room:other";
    if (kind === "raw-text") Object.assign(invalid, { result_text: "Unapproved report text" });
    if (kind === "duplicate") invalid.reports.push(invalid.reports[0]);
    f.fetcher.mockResolvedValue(json(invalid)); fireEvent.click(screen.getByRole("button", { name: "Refresh results" }));
    await waitFor(() => expect(screen.queryByLabelText("Task report")).toBeNull());
    expect(screen.queryByText("Unapproved report text")).toBeNull();
    await screen.findByText(/Could not check results|Results unavailable/);
  });
  it("clears account-bound state and discards a late explanation response after account policy changes", async () => {
    const f = await hostedFixture(); await chooseHosted();
    let finish!: (response: Response) => void;
    f.fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Explain to room" }));
    fireEvent(window, new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
    expect(f.fetcher.mock.calls[2][1]?.signal?.aborted).toBe(true);
    expect(screen.queryByLabelText("Task report")).toBeNull();
    finish(json({ final_status: "final_answer", turn_id: "ask:room-result:hosted" }));
    await Promise.resolve(); await Promise.resolve(); expect(f.onProcessed).not.toHaveBeenCalled();
  });
});
