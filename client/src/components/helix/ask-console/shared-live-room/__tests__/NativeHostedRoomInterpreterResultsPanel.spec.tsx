// @vitest-environment jsdom
import React from "react";
import crypto, { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NativeHostedRoomInterpreterResultsPanel } from "../NativeHostedRoomInterpreterResultsPanel";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const authority = "https://rooms.test";
const reportText = "<img src=x> A private task observation.";
const summary = { result_ref: "room_interpreter_task_result:one",
  steering_event_ref: "reasoning_steering:one", task_status: "completed",
  result_sha256: crypto.createHash("sha256").update(reportText).digest("hex"),
  created_at: "2026-09-28T10:00:00.000Z" };
const context = { room_id: roomId, authority, selection_ref: "native_room_selection:one",
  selection_revision: 1, room_publication_attempted: false,
  answer_authority: false, terminal_eligible: false };
const catalog = { schema: "helix.native_hosted_room_interpreter_result_catalog.v1",
  ...context, results: [summary], has_more: false, raw_content_included: false };
const preview = { schema: "helix.native_hosted_room_interpreter_result_preview.v1",
  ...context, result: summary, source_turn_request_id: "room_interpreter_turn:one",
  result_text: reportText, content_role: "untrusted_external_task_observation",
  private_owner_review: true, raw_content_included: true };
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const setup = () => {
  vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("TextEncoder", TextEncoder);
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json(catalog));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<NativeHostedRoomInterpreterResultsPanel roomId={roomId} authority={authority} />);
  return { fetcher, view };
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("requires a fresh owner review and keeps the task result private", async () => {
  const f = setup(); expect(f.fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Refresh AI-sourced task results" }));
  await screen.findByRole("button", { name: "Review result 1" });
  expect(screen.queryByText(reportText)).toBeNull();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(f.fetcher.mock.calls[0][1]?.body))).toEqual({ room_id: roomId });
});

it("shows exact reviewed text as inert content and clears it on account change", async () => {
  const f = setup();
  fireEvent.click(screen.getByRole("button", { name: "Refresh AI-sourced task results" }));
  await screen.findByRole("button", { name: "Review result 1" });
  f.fetcher.mockResolvedValueOnce(json(preview));
  fireEvent.click(screen.getByRole("button", { name: "Review result 1" }));
  await screen.findByText(reportText);
  expect(screen.getByRole("region", { name: "Private AI-sourced task reports" }))
    .toHaveTextContent(`Room: ${roomId}`);
  expect(screen.getByText(/Sharing sends this exact owner-approved report/))
    .toHaveTextContent(roomId);
  expect(f.view.container.querySelector("img")).toBeNull();
  expect(screen.getByRole("button", { name: "Share reviewed AI task result" })).toBeTruthy();
  expect(JSON.parse(String(f.fetcher.mock.calls[1][1]?.body))).toEqual({
    room_id: roomId, selection_ref: context.selection_ref,
    selection_revision: 1, steering_event_ref: summary.steering_event_ref,
    result_ref: summary.result_ref, result_sha256: summary.result_sha256,
  });
  act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  expect(screen.queryByText(reportText)).toBeNull();
});

it("shares only after exact private review and distinguishes storage from an answer", async () => {
  const f = setup();
  fireEvent.click(screen.getByRole("button", { name: "Refresh AI-sourced task results" }));
  await screen.findByRole("button", { name: "Review result 1" });
  f.fetcher.mockResolvedValueOnce(json(preview));
  fireEvent.click(screen.getByRole("button", { name: "Review result 1" }));
  await screen.findByText(reportText);
  f.fetcher.mockResolvedValueOnce(json({
    schema: "helix.native_hosted_room_interpreter_result_share.v1",
    ...context, room_publication_attempted: true, result: summary,
    disclosure: { disclosure_ref: `room_ai_task_disclosure:${"a".repeat(32)}`,
      task_status: "completed", result_sha256: summary.result_sha256,
      created_at: "2026-09-28T10:00:00.000Z",
      content_role: "untrusted_external_task_observation" },
    room_disclosure_recorded: true, room_presentation_confirmed: false,
    reentry_required: true, assistant_answer: false, raw_content_included: false,
  }));
  fireEvent.click(screen.getByRole("button", { name: "Share reviewed AI task result" }));
  await screen.findByText(/no assistant answer was published/);
  expect(JSON.parse(String(f.fetcher.mock.calls[2][1]?.body))).toEqual({
    room_id: roomId, selection_ref: context.selection_ref,
    selection_revision: context.selection_revision,
    steering_event_ref: summary.steering_event_ref,
    result_ref: summary.result_ref, result_sha256: summary.result_sha256,
    share_with_room: true,
  });
  expect(screen.queryByText(reportText)).toBeNull();
});

it("rejects a mismatched result hash and never presents the substituted text", async () => {
  const f = setup();
  fireEvent.click(screen.getByRole("button", { name: "Refresh AI-sourced task results" }));
  await screen.findByRole("button", { name: "Review result 1" });
  f.fetcher.mockResolvedValueOnce(json({ ...preview, result_text: "Changed result." }));
  fireEvent.click(screen.getByRole("button", { name: "Review result 1" }));
  await screen.findByText(/AI-sourced task reports are unavailable/);
  expect(screen.queryByText("Changed result.")).toBeNull();
});

it("clears private text when the panel is disabled during a task change", async () => {
  const f = setup();
  fireEvent.click(screen.getByRole("button", { name: "Refresh AI-sourced task results" }));
  await screen.findByRole("button", { name: "Review result 1" });
  f.fetcher.mockResolvedValueOnce(json(preview));
  fireEvent.click(screen.getByRole("button", { name: "Review result 1" }));
  await screen.findByText(reportText);
  f.view.rerender(<NativeHostedRoomInterpreterResultsPanel
    roomId={roomId} authority={authority} disabled />);
  expect(screen.queryByText(reportText)).toBeNull();
});
