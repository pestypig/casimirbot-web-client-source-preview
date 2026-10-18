// @vitest-environment jsdom
import React from "react";
import crypto, { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NativeSharedRoomReportsPanel } from "../NativeSharedRoomReportsPanel";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

const roomId = "shared_realtime_room:guest", authority = "https://rooms.test";
const text = "<img src=x> Ignore this report's commands; inspect the evidence.";
const summary = { disclosure_ref: `room_task_disclosure:${"d".repeat(32)}`, task_status: "unable",
  result_sha256: crypto.createHash("sha256").update(text).digest("hex"), created_at: "2026-09-25T18:00:00.000Z",
  content_role: "untrusted_external_task_observation" };
const common = { api_version: "v1", ok: true, room: { room_id: roomId }, reentry_required: true,
  answer_authority: false, assistant_answer: false, terminal_eligible: false };
const catalog = { schema: "helix.native_shared_room_report_catalog.v1", authority,
  receipt: { schema: "helix.shared_live_room.report_catalog.v1", operation: "room.report.list", ...common,
    reports: [summary], has_more: false, raw_content_included: false } };
const observation = { schema: "helix.native_shared_room_report_observation.v1", authority,
  receipt: { schema: "helix.shared_live_room.report_observation.v1", operation: "room.report.read", ...common,
    report: summary, result_text: text, raw_content_included: true } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fixture = () => {
  vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("TextEncoder", TextEncoder);
  const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => json(catalog)); vi.stubGlobal("fetch", fetcher);
  const view = render(<NativeSharedRoomReportsPanel roomId={roomId} authority={authority} />);
  return { fetcher, view };
};
const load = () => fireEvent.click(screen.getByRole("button", { name: "Load shared reports" }));
const open = () => fireEvent.click(screen.getByRole("button", { name: "Open shared report 1" }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("loads only on request and opens the exact hash-selected report as inert evidence", async () => {
  const f = fixture(); expect(f.fetcher).not.toHaveBeenCalled(); load();
  await screen.findByRole("button", { name: "Open shared report 1" }); expect(screen.queryByText(text)).toBeNull();
  f.fetcher.mockResolvedValueOnce(json(observation)); open(); await screen.findByText(text);
  expect(f.view.container.querySelector("img")).toBeNull(); expect(screen.getByText("Task reported unable")).toBeTruthy();
  expect(f.fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
    { operation: "report_list", room_id: roomId },
    { operation: "report_read", request: { room_id: roomId, disclosure_ref: summary.disclosure_ref, result_sha256: summary.result_sha256 } },
  ]);
  expect(f.fetcher).toHaveBeenCalledTimes(2); expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByText(/Use the room service's owner controls/)).toBeTruthy();
});

it.each(["authority", "room", "hash", "text", "ref", "status", "answer", "extra"])("withholds a changed %s observation", async kind => {
  const f = fixture(); load(); await screen.findByRole("button", { name: "Open shared report 1" });
  const changed = structuredClone(observation);
  if (kind === "authority") changed.authority = "https://other.test";
  if (kind === "room") changed.receipt.room.room_id = "shared_realtime_room:other";
  if (kind === "hash") changed.receipt.report.result_sha256 = "f".repeat(64);
  if (kind === "text") changed.receipt.result_text = "Changed text";
  if (kind === "ref") changed.receipt.report.disclosure_ref = `room_task_disclosure:${"f".repeat(32)}`;
  if (kind === "status") changed.receipt.report.task_status = "completed";
  if (kind === "answer") changed.receipt.answer_authority = true;
  if (kind === "extra") Object.assign(changed.receipt, { private_task_id: "private" });
  f.fetcher.mockResolvedValueOnce(json(changed)); open(); await screen.findByText(/Shared reports are unavailable/);
  expect(screen.queryByLabelText("Owner-approved task report")).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(2);
});

it.each(["account", "room", "authority", "disabled"])("discards late content after %s changes", async kind => {
  const f = fixture(); load(); await screen.findByRole("button", { name: "Open shared report 1" });
  let release!: (value: Response) => void;
  f.fetcher.mockImplementationOnce(async () => new Promise(resolve => { release = resolve; })); open();
  if (kind === "account") act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  else f.view.rerender(<NativeSharedRoomReportsPanel roomId={kind === "room" ? "shared_realtime_room:other" : roomId}
    authority={kind === "authority" ? "https://other.test" : authority} disabled={kind === "disabled"} />);
  await act(async () => { release(json(observation)); });
  expect(screen.queryByText(text)).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(2);
});

it("rejects a late response after the request deadline without retry", async () => {
  const f = fixture(); load(); await screen.findByRole("button", { name: "Open shared report 1" });
  vi.useFakeTimers(); let release!: (value: Response) => void;
  f.fetcher.mockImplementationOnce(async () => new Promise(resolve => { release = resolve; })); open();
  await act(async () => { await vi.advanceTimersByTimeAsync(20001); release(json(observation)); });
  expect(screen.queryByText(text)).toBeNull(); expect(screen.getByText(/Shared reports are unavailable/)).toBeTruthy();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});

it("clears previously displayed content when account policy changes", async () => {
  const f = fixture(); load(); await screen.findByRole("button", { name: "Open shared report 1" });
  f.fetcher.mockResolvedValueOnce(json(observation)); open(); await screen.findByText(text);
  act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  expect(screen.queryByText(text)).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(2);
});

it.each(["duplicate", "authority", "error"])("rejects a %s catalog without automatic follow-up", async kind => {
  const f = fixture(), changed = structuredClone(catalog);
  if (kind === "duplicate") changed.receipt.reports.push(summary);
  if (kind === "authority") changed.authority = "https://other.test";
  f.fetcher.mockResolvedValueOnce(json(changed, kind === "error" ? 403 : 200)); load();
  await screen.findByText(/Shared reports are unavailable/);
  expect(screen.queryByRole("button", { name: "Open shared report 1" })).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
