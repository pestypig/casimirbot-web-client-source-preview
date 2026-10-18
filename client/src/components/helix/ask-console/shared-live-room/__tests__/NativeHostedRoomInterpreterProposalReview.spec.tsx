// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NativeHostedRoomInterpreterProposalReview } from "../NativeHostedRoomInterpreterProposalReview";

const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const authority = "https://rooms.test";
const requestId = "room_interpreter_turn:22222222-2222-4222-8222-222222222222";
const triggerId = "room_message:33333333-3333-4333-8333-333333333333";
const turn = { schema: "helix.room_interpreter_turn_status.v1", request_id: requestId,
  room_id: roomId, interpreter_session_id: "room_interpreter:44444444-4444-4444-8444-444444444444",
  generation: 2, trigger_message_id: triggerId, state: "completed",
  reply: { content_role: "room_interpreter_reply", text: "A possible answer",
    result_sha256: "a".repeat(64) },
  failure_code: null, mission_authority: false, program_action: false };
const turnList = { schema: "helix.shared_live_room.interpreter_turn_list.v1", api_version: "v1",
  ok: true, operation: "room.interpreter.turn_list", room: { room_id: roomId }, turns: [turn],
  model_input: false, provider_calls: 0, task_handoff: false, reentry_required: true,
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
  raw_content_included: true };
const preview = { schema: "helix.native_hosted_room_interpreter_proposal_preview.v1",
  room_id: roomId, authority, selection_ref: "selection:one", selection_revision: 3,
  task_label: "Paired Codex task", source: {
    schema: "helix.shared_live_room.interpreter_proposal_source.v1", api_version: "v1", ok: true,
    operation: "room.interpreter.proposal_source", room: { room_id: roomId },
    source: { request_id: requestId, interpreter_session_id: turn.interpreter_session_id,
      generation: 2, context_sha256: "b".repeat(64), trigger_message_id: triggerId,
      trigger_author_participant_id: "participant:guest", trigger_text: "Can we build this?",
      reply_text: "A possible answer", result_sha256: "a".repeat(64) },
    source_current: true, proposal_queued: false, model_input: false, provider_calls: 0,
    task_handoff: false, reentry_required: true, answer_authority: false,
    assistant_answer: false, terminal_eligible: false, raw_content_included: true },
  proposal_queued: false, dispatch_authority: false, answer_authority: false,
  terminal_eligible: false, raw_content_included: true };
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows exact room source with the selected task and requires owner review before queueing", async () => {
  const fetcher = vi.fn(async (url: string) => json(url.includes("proposal-sources") ? preview : turnList));
  vi.stubGlobal("fetch", fetcher);
  render(<NativeHostedRoomInterpreterProposalReview roomId={roomId} authority={authority} />);
  fireEvent.click(screen.getByRole("button", { name: "Load completed AI replies" }));
  fireEvent.change(await screen.findByRole("combobox", { name: "AI reply to review" }),
    { target: { value: requestId } });
  fireEvent.click(screen.getByRole("button", { name: "Review exact source and task" }));
  expect(await screen.findByText("Can we build this?")).toBeTruthy();
  expect(screen.getByText("A possible answer")).toBeTruthy();
  expect(screen.getByText("Paired Codex task")).toBeTruthy();
  expect(screen.getByRole("region", { name: "Room AI mission proposal review" })).toHaveTextContent(`Room: ${roomId}`);
  expect((screen.getByRole("button", { name: "Queue my reviewed instruction" }) as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("offers the completed two-turn correction for exact owner review", async () => {
  const correctionId = "room_interpreter_turn:77777777-7777-4777-8777-777777777777";
  const evaluation = { schema: "helix.shared_live_room.interpreter_evaluation_list.v1",
    api_version: "v1", ok: true, operation: "room.interpreter.evaluation_list",
    room: { room_id: roomId }, turns: [{ schema: "helix.room_interpreter_evaluation_status.v1",
      request_id: correctionId, first_request_id: requestId, room_id: roomId,
      interpreter_session_id: turn.interpreter_session_id, generation: 2, turn_ordinal: 2,
      requested_by_participant_id: "shared_realtime_participant:66666666-6666-4666-8666-666666666666",
      trigger_message_id: triggerId, state: "completed", finished_at: "2026-09-29T20:00:00.000Z",
      failure_code: null, reply: { content_role: "room_interpreter_reply",
        text: "Corrected answer", result_sha256: "c".repeat(64) },
      mission_authority: false, program_action: false }], model_input: false,
    provider_calls: 0, task_handoff: false, reentry_required: true,
    answer_authority: false, assistant_answer: false, terminal_eligible: false,
    raw_content_included: true };
  const correctedPreview = { ...preview, source: { ...preview.source,
    source: { ...preview.source.source, request_id: correctionId,
      reply_text: "Corrected answer", result_sha256: "c".repeat(64) } } };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("proposal-sources")) return json(correctedPreview);
    const operation = JSON.parse(String(init?.body)).operation;
    return json(operation === "interpreter_evaluation_list" ? evaluation :
      { ...turnList, turns: [], raw_content_included: false });
  }));
  render(<NativeHostedRoomInterpreterProposalReview roomId={roomId} authority={authority} />);
  fireEvent.click(screen.getByRole("button", { name: "Load completed AI replies" }));
  const select = await screen.findByRole("combobox", { name: "AI reply to review" });
  expect(select).toHaveTextContent("Evaluation 2 · Reply to");
  fireEvent.change(select, { target: { value: correctionId } });
  fireEvent.click(screen.getByRole("button", { name: "Review exact source and task" }));
  expect(await screen.findByText("Corrected answer")).toBeInTheDocument();
});

it("queues only the host-authored instruction with exact source and task revision", async () => {
  const receipt = { schema: "helix.native_hosted_room_interpreter_proposal_dispatch.v1",
    ok: true, dispatch_ref: "native_room_dispatch:one", steering_event_ref: "reasoning_steering:one",
    status: "queued", instruction_queued: true, task_pickup_confirmed: false,
    execution_authority: false, answer_authority: false, terminal_eligible: false,
    raw_content_included: false };
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => json(url.includes("interpreter-proposals/dispatch")
    ? receipt : url.includes("proposal-sources") ? preview : turnList));
  vi.stubGlobal("fetch", fetcher);
  render(<NativeHostedRoomInterpreterProposalReview roomId={roomId} authority={authority} />);
  fireEvent.click(screen.getByRole("button", { name: "Load completed AI replies" }));
  fireEvent.change(await screen.findByRole("combobox", { name: "AI reply to review" }),
    { target: { value: requestId } });
  fireEvent.click(screen.getByRole("button", { name: "Review exact source and task" }));
  fireEvent.change(await screen.findByLabelText("Your instruction for this Codex task"),
    { target: { value: "Please evaluate this proposal." } });
  expect((screen.getByRole("button", { name: "Queue my reviewed instruction" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed this room source/ }));
  fireEvent.click(screen.getByRole("button", { name: "Queue my reviewed instruction" }));
  expect(await screen.findByText(/Task pickup and any action remain unconfirmed/)).toBeTruthy();
  expect(JSON.parse(String(fetcher.mock.calls[3][1]?.body))).toEqual({
    room_id: roomId, selection_ref: preview.selection_ref,
    selection_revision: preview.selection_revision,
    turn_request_id: requestId, context_sha256: preview.source.source.context_sha256,
    result_sha256: preview.source.source.result_sha256,
    instruction_text: "Please evaluate this proposal.", approve_task_handoff: true,
  });
});

it("retries an uncertain queue response with the exact same request", async () => {
  let attempts = 0;
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes("interpreter-proposals/dispatch")) {
      attempts++;
      return attempts === 1 ? json({ outcome_unknown: true }, 409) : json({
        schema: "helix.native_hosted_room_interpreter_proposal_dispatch.v1", ok: true,
        dispatch_ref: "native_room_dispatch:one", steering_event_ref: "reasoning_steering:one",
        status: "queued", instruction_queued: true, task_pickup_confirmed: false,
        execution_authority: false, answer_authority: false, terminal_eligible: false,
        raw_content_included: false });
    }
    return json(url.includes("proposal-sources") ? preview : turnList);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<NativeHostedRoomInterpreterProposalReview roomId={roomId} authority={authority} />);
  fireEvent.click(screen.getByRole("button", { name: "Load completed AI replies" }));
  fireEvent.change(await screen.findByRole("combobox", { name: "AI reply to review" }),
    { target: { value: requestId } });
  fireEvent.click(screen.getByRole("button", { name: "Review exact source and task" }));
  fireEvent.change(await screen.findByLabelText("Your instruction for this Codex task"),
    { target: { value: "Please evaluate this proposal." } });
  fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed this room source/ }));
  fireEvent.click(screen.getByRole("button", { name: "Queue my reviewed instruction" }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry the exact queue request" }));
  expect(await screen.findByText(/Task pickup and any action remain unconfirmed/)).toBeTruthy();
  expect(fetcher.mock.calls[3][1]?.body).toBe(fetcher.mock.calls[4][1]?.body);
});

it("clears a reviewed source when the room changes", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => json(url.includes("proposal-sources") ? preview : turnList)));
  const view = render(<NativeHostedRoomInterpreterProposalReview roomId={roomId} authority={authority} />);
  fireEvent.click(screen.getByRole("button", { name: "Load completed AI replies" }));
  fireEvent.change(await screen.findByRole("combobox", { name: "AI reply to review" }),
    { target: { value: requestId } });
  fireEvent.click(screen.getByRole("button", { name: "Review exact source and task" }));
  expect(await screen.findByText("Paired Codex task")).toBeTruthy();
  view.rerender(<NativeHostedRoomInterpreterProposalReview
    roomId="shared_realtime_room:55555555-5555-4555-8555-555555555555" authority={authority} />);
  await waitFor(() => expect(screen.queryByText("Paired Codex task")).toBeNull());
});

it("requires a fresh AI source and task review after the owner changes task-selection state", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => json(url.includes("proposal-sources") ? preview : turnList)));
  const view = render(<NativeHostedRoomInterpreterProposalReview roomId={roomId} authority={authority} />);
  fireEvent.click(screen.getByRole("button", { name: "Load completed AI replies" }));
  fireEvent.change(await screen.findByRole("combobox", { name: "AI reply to review" }),
    { target: { value: requestId } });
  fireEvent.click(screen.getByRole("button", { name: "Review exact source and task" }));
  expect(await screen.findByText("Paired Codex task")).toBeTruthy();
  view.rerender(<NativeHostedRoomInterpreterProposalReview roomId={roomId} authority={authority} disabled />);
  await waitFor(() => expect(screen.queryByText("Paired Codex task")).toBeNull());
  view.rerender(<NativeHostedRoomInterpreterProposalReview roomId={roomId} authority={authority} />);
  expect(screen.queryByRole("button", { name: "Queue my reviewed instruction" })).toBeNull();
});
