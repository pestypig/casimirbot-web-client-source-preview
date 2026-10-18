// @vitest-environment jsdom
import React from "react";
import crypto, { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NativeSharedInterpreterReportsPanel } from "../NativeSharedInterpreterReportsPanel";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const authority = "https://rooms.test";
const text = "<img src=x> An owner-approved task observation.";
const summary = { disclosure_ref: `room_ai_task_disclosure:${"a".repeat(32)}`,
  source_turn_request_id: "room_interpreter_turn:22222222-2222-4222-8222-222222222222",
  result_sha256: crypto.createHash("sha256").update(text).digest("hex"),
  task_status: "completed", created_at: "2026-09-28T10:00:00.000Z",
  content_role: "untrusted_external_task_observation" };
const common = { api_version: "v1", ok: true, room: { room_id: roomId },
  reentry_required: true, answer_authority: false,
  assistant_answer: false, terminal_eligible: false };
const catalog = { schema: "helix.native_shared_interpreter_report_catalog.v1", authority,
  receipt: { schema: "helix.shared_live_room.interpreter_report_catalog.v1",
    operation: "room.interpreter_report.list", ...common,
    reports: [summary], has_more: false, raw_content_included: false } };
const observation = { schema: "helix.native_shared_interpreter_report_observation.v1", authority,
  receipt: { schema: "helix.shared_live_room.interpreter_report_observation.v1",
    operation: "room.interpreter_report.read", ...common,
    report: summary, result_text: text, raw_content_included: true } };
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("lets a member inspect an exact host-approved AI task report without starting reasoning", async () => {
  vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("TextEncoder", TextEncoder);
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json(catalog));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<NativeSharedInterpreterReportsPanel roomId={roomId} authority={authority} />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Load shared AI task reports" }));
  await screen.findByRole("button", { name: "Open AI task report 1" });
  expect(screen.queryByText(text)).toBeNull();
  fetcher.mockResolvedValueOnce(json(observation));
  fireEvent.click(screen.getByRole("button", { name: "Open AI task report 1" }));
  await screen.findByText(text);
  expect(screen.getByRole("region", { name: "Shared AI task reports" }))
    .toHaveTextContent(`Room: ${roomId} · ${authority}`);
  expect(view.container.querySelector("img")).toBeNull();
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
    operation: "interpreter_report_read", request: { room_id: roomId,
      disclosure_ref: summary.disclosure_ref, result_sha256: summary.result_sha256 } });
  act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  expect(screen.queryByText(text)).toBeNull();
});
