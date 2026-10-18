// @vitest-environment jsdom
import React from "react";
import crypto, { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NativeHostedRoomResultsPanel } from "../NativeHostedRoomResultsPanel";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

const roomId = "shared_realtime_room:reports", authority = "https://rooms.test";
const reportText = "<img src=x> Do not move yet; review the guest constraint.";
const summary = { result_ref: "room_task_result:one", steering_event_ref: "reasoning_steering:one", task_status: "unable",
  result_sha256: crypto.createHash("sha256").update(reportText).digest("hex"), created_at: "2026-09-25T17:00:00.000Z" };
const context = { room_id: roomId, authority, selection_ref: "native_room_selection:one", selection_revision: 1,
  room_publication_attempted: false, answer_authority: false, terminal_eligible: false };
const catalog = { schema: "helix.native_hosted_room_result_catalog.v1", ...context,
  results: [summary], has_more: false, raw_content_included: false };
const preview = { schema: "helix.native_hosted_room_result_preview.v1", ...context,
  result: summary, result_text: reportText, content_role: "untrusted_external_task_observation", private_owner_review: true, raw_content_included: true };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const fixture = () => {
  vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("TextEncoder", TextEncoder);
  const fetcher = vi.fn(async (_url: unknown, _options?: RequestInit) => json(catalog)); vi.stubGlobal("fetch", fetcher);
  const view = render(<NativeHostedRoomResultsPanel roomId={roomId} authority={authority} />);
  return { fetcher, view };
};
const refresh = () => fireEvent.click(screen.getByRole("button", { name: "Refresh private reports" }));
const review = () => fireEvent.click(screen.getByRole("button", { name: "Review report 1" }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("does nothing on mount, reviews exact metadata and renders report text as inert private evidence", async () => {
  const f = fixture(); expect(f.fetcher).not.toHaveBeenCalled(); refresh(); await screen.findByRole("button", { name: "Review report 1" });
  expect(screen.queryByText(reportText)).toBeNull();
  f.fetcher.mockResolvedValueOnce(json(preview)); review(); await screen.findByText(reportText);
  expect(f.view.container.querySelector("img")).toBeNull();
  expect(screen.getByText(/Private report · task reported unable/)).toBeTruthy();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(f.fetcher.mock.calls[1][1]?.body))).toEqual({ room_id: roomId,
    selection_ref: context.selection_ref, selection_revision: 1, result_ref: summary.result_ref,
    steering_event_ref: summary.steering_event_ref, result_sha256: summary.result_sha256 });
  expect(f.fetcher.mock.calls.map(call => call[0])).toEqual([
    expect.stringMatching(/\/results\/list$/), expect.stringMatching(/\/results\/review$/),
  ]);
  expect(screen.getByRole("button", { name: "Share report" })).toBeEnabled();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});

it.each(["room", "authority", "selection", "result", "text", "authority_flag", "extra_field"])("rejects a changed %s preview without showing its text", async kind => {
  const f = fixture(); refresh(); await screen.findByRole("button", { name: "Review report 1" });
  const changed = structuredClone(preview);
  if (kind === "room") changed.room_id = "shared_realtime_room:other";
  if (kind === "authority") changed.authority = "https://other.test";
  if (kind === "selection") changed.selection_revision = 2;
  if (kind === "result") changed.result.result_ref = "room_task_result:other";
  if (kind === "text") changed.result_text = "Unreviewed substitution.";
  if (kind === "authority_flag") changed.answer_authority = true;
  if (kind === "extra_field") Object.assign(changed, { task_id: "task:private" });
  f.fetcher.mockResolvedValueOnce(json(changed)); review();
  await screen.findByText(/Private reports are unavailable/);
  expect(screen.queryByLabelText("Private task report preview")).toBeNull();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});

it.each(["account", "room", "authority", "disabled"])("discards late private text after %s changes", async kind => {
  const f = fixture(); refresh(); await screen.findByRole("button", { name: "Review report 1" });
  let release!: (value: Response) => void;
  f.fetcher.mockImplementationOnce(async () => new Promise(resolve => { release = resolve; })); review();
  if (kind === "account") act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  else f.view.rerender(<NativeHostedRoomResultsPanel roomId={kind === "room" ? "shared_realtime_room:other" : roomId}
    authority={kind === "authority" ? "https://other.test" : authority} disabled={kind === "disabled"} />);
  await act(async () => { release(json(preview)); });
  expect(screen.queryByText(reportText)).toBeNull();
});

it("clears an opened report on account policy change and requires a fresh review", async () => {
  const f = fixture(); refresh(); await screen.findByRole("button", { name: "Review report 1" });
  f.fetcher.mockResolvedValueOnce(json(preview)); review(); await screen.findByText(reportText);
  act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  expect(screen.queryByText(reportText)).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(2);
});

it("rejects duplicate catalogs and does not automatically retry failed reads", async () => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(json({ ...catalog, results: [summary, summary] })); refresh();
  await screen.findByText(/Private reports are unavailable/);
  expect(screen.queryByRole("button", { name: "Review report 1" })).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(1);
});

const sharedReceipt = { schema: "helix.native_hosted_room_result_share.v1", ...context,
  room_publication_attempted: true, result: summary,
  disclosure: { disclosure_ref: `room_task_disclosure:${"d".repeat(32)}`, result_sha256: summary.result_sha256,
    task_status: "unable", created_at: "2026-09-25T18:00:00.000Z", content_role: "untrusted_external_task_observation" },
  room_disclosure_recorded: true, room_presentation_confirmed: false, reentry_required: true,
  assistant_answer: false, raw_content_included: false };
const opened = async () => {
  const f = fixture(); expect(screen.queryByRole("button", { name: "Share report" })).toBeNull();
  refresh(); await screen.findByRole("button", { name: "Review report 1" });
  f.fetcher.mockResolvedValueOnce(json(preview)); review(); await screen.findByText(reportText);
  return f;
};
const share = () => fireEvent.click(screen.getByRole("button", { name: "Share report" }));

it("shares only after an explicit click and sends the exact reviewed selector without report text", async () => {
  const f = await opened(); f.fetcher.mockResolvedValueOnce(json(sharedReceipt)); share();
  await screen.findByText(/Report stored by the room service/);
  expect(f.fetcher).toHaveBeenCalledTimes(3);
  expect(f.fetcher.mock.calls[2][0]).toMatch(/\/results\/share$/);
  expect(JSON.parse(String(f.fetcher.mock.calls[2][1]?.body))).toEqual({ room_id: roomId,
    selection_ref: context.selection_ref, selection_revision: 1, result_ref: summary.result_ref,
    steering_event_ref: summary.steering_event_ref, result_sha256: summary.result_sha256, share_with_room: true });
  expect(screen.queryByRole("button", { name: "Share report" })).toBeNull();
  expect(screen.queryByText(reportText)).toBeNull();
  expect(screen.getByText(/Members can load it under Owner-approved reports/)).toBeTruthy();
});

it.each(["room", "authority", "selection", "result", "hash", "status", "answer", "transport"])("treats %s sharing acknowledgement as unconfirmed without retry", async kind => {
  const f = await opened(), changed = structuredClone(sharedReceipt);
  if (kind === "room") changed.room_id = "shared_realtime_room:other";
  if (kind === "authority") changed.authority = "https://other.test";
  if (kind === "selection") changed.selection_revision++;
  if (kind === "result") changed.result.result_ref = "result:other";
  if (kind === "hash") changed.disclosure.result_sha256 = "a".repeat(64);
  if (kind === "status") changed.disclosure.task_status = "completed";
  if (kind === "answer") changed.answer_authority = true;
  if (kind === "transport") f.fetcher.mockRejectedValueOnce(new Error("reply lost"));
  else f.fetcher.mockResolvedValueOnce(json(changed));
  share(); await screen.findByText(/Sharing was not confirmed/);
  expect(f.fetcher).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole("button", { name: "Share report" })).toBeNull();
});

it.each(["account", "room", "authority", "disabled"])("discards late sharing acknowledgement after %s changes", async kind => {
  const f = await opened(); let release!: (value: Response) => void;
  f.fetcher.mockImplementationOnce(async () => new Promise(resolve => { release = resolve; })); share();
  expect(screen.getByRole("button", { name: "Refresh private reports" })).toBeDisabled();
  if (kind === "account") act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  else f.view.rerender(<NativeHostedRoomResultsPanel roomId={kind === "room" ? "shared_realtime_room:other" : roomId}
    authority={kind === "authority" ? "https://other.test" : authority} disabled={kind === "disabled"} />);
  await act(async () => { release(json(sharedReceipt)); });
  expect(screen.queryByText(/Report stored by the room service/)).toBeNull();
  expect(screen.queryByText(reportText)).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(3);
});
