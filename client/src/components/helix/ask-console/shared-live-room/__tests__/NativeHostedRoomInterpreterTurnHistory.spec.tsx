// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NativeHostedRoomInterpreterTurnHistory } from "../NativeHostedRoomInterpreterTurnHistory";

const roomA = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const roomB = "shared_realtime_room:22222222-2222-4222-8222-222222222222";
const turn = (roomId: string, text: string) => ({
  schema: "helix.room_interpreter_turn_status.v1",
  request_id: "room_interpreter_turn:33333333-3333-4333-8333-333333333333",
  room_id: roomId,
  interpreter_session_id: "room_interpreter:44444444-4444-4444-8444-444444444444",
  generation: 2, trigger_message_id: "room_message:55555555-5555-4555-8555-555555555555",
  state: "completed", reply: { content_role: "room_interpreter_reply", text,
    result_sha256: "a".repeat(64) },
  failure_code: null, mission_authority: false, program_action: false,
});
const list = (roomId: string, turns: unknown[]) => ({
  schema: "helix.shared_live_room.interpreter_turn_list.v1", api_version: "v1", ok: true,
  operation: "room.interpreter.turn_list", room: { room_id: roomId }, turns,
  model_input: false, provider_calls: 0, task_handoff: false,
  reentry_required: true, answer_authority: false, assistant_answer: false,
  terminal_eligible: false, raw_content_included: turns.some((turn: any) => Boolean(turn.reply)),
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const preview = (roomId: string, queued: ReturnType<typeof turn> & { turn_ordinal?: number },
  text = "Guest asks") => ({
  schema: "helix.shared_live_room.interpreter_context_preview.v1", api_version: "v1",
  ok: true, operation: "room.interpreter.context_preview", room: { room_id: roomId },
  turn: { request_id: queued.request_id, interpreter_session_id: queued.interpreter_session_id,
    generation: queued.generation, turn_ordinal: queued.turn_ordinal ?? null,
    usage_ceiling_turns: queued.turn_ordinal ? 2 : 1,
    trigger_message_id: queued.trigger_message_id, context_sha256: "c".repeat(64),
    messages: [{ message_id: queued.trigger_message_id,
      author_participant_id: "shared_realtime_participant:66666666-6666-4666-8666-666666666666",
      consent_revision: 1, text }] },
  context_current: true, model_input: false, provider_calls: 0, task_handoff: false,
  reentry_required: true, answer_authority: false, assistant_answer: false,
  terminal_eligible: false, raw_content_included: true,
});
const review = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Review released room context" }));
  await screen.findByRole("region", { name: "Released room AI context" });
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows the verified hosted reply as conversation and keeps mission authority separate", async () => {
  const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
    expect(JSON.parse(String(init.body))).toEqual({ operation: "interpreter_turn_list", room_id: roomA });
    return json(list(roomA, [turn(roomA, "Shared answer from the room interpreter")]));
  });
  vi.stubGlobal("fetch", fetcher);
  render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA} authority="https://rooms.test" closed={false} />);
  expect(await screen.findByText("Shared answer from the room interpreter")).toBeTruthy();
  expect(screen.getByRole("region", { name: "Hosted room AI turn history" }))
    .toHaveTextContent(`Room: ${roomA}`);
  expect(screen.getByText(/Provider: OpenAI Agents API/)).toHaveTextContent("Payer: host's OpenAI project");
  expect(screen.getByText(/not a task decision or program action/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /send to task/i })).toBeNull();
  expect(screen.getByText(/requesting message is unavailable in this room view/i)).toBeTruthy();
});

it("keeps the exact member request attributed beside its completed AI reply", async () => {
  const completed = turn(roomA, "Answer for the guest");
  const participantId = "shared_realtime_participant:66666666-6666-4666-8666-666666666666";
  const messages = [{ room_id: roomA, message_id: completed.trigger_message_id,
    author_participant_id: participantId, text: "How should we build the bridge?",
    created_at: "2026-09-28T00:00:00.000Z", content_role: "room_member_text" as const,
    answer_authority: false as const, assistant_answer: false as const,
    terminal_eligible: false as const }];
  vi.stubGlobal("fetch", vi.fn(async () => json(list(roomA, [completed]))));
  render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA}
    authority="https://rooms.test" closed={false} messages={messages}
    participants={[{ participant_id: participantId, display_name: "Guest" }]} />);
  expect(await screen.findByText("Answer for the guest")).toBeTruthy();
  expect(screen.getByText("In response to Guest: How should we build the bridge?")).toBeTruthy();
});

it("shows one first reply and a separately attributed correction from the AR-2 history", async () => {
  const firstId = "room_interpreter_turn:33333333-3333-4333-8333-333333333333";
  const correctionId = "room_interpreter_turn:77777777-7777-4777-8777-777777777777";
  const guestId = "shared_realtime_participant:66666666-6666-4666-8666-666666666666";
  const secondId = "shared_realtime_participant:88888888-8888-4888-8888-888888888888";
  const correctionMessageId = "room_message:99999999-9999-4999-8999-999999999999";
  const member = (id: string, author: string, text: string, at: string) => ({
    room_id: roomA, message_id: id, author_participant_id: author, text,
    created_at: at, content_role: "room_member_text" as const,
    answer_authority: false as const, assistant_answer: false as const,
    terminal_eligible: false as const });
  const messages = [member(turn(roomA, "").trigger_message_id, guestId, "Initial question",
    "2026-09-28T00:00:00.000Z"),
    member(correctionMessageId, secondId, "Please correct the result",
      "2026-09-28T00:00:03.000Z")];
  const base = { schema: "helix.room_interpreter_evaluation_status.v1", room_id: roomA,
    interpreter_session_id: turn(roomA, "").interpreter_session_id,
    generation: 2, state: "completed", failure_code: null,
    mission_authority: false, program_action: false };
  const evalTurns = [
    { ...base, request_id: firstId, first_request_id: null, turn_ordinal: 1,
      requested_by_participant_id: guestId, trigger_message_id: messages[0].message_id,
      finished_at: "2026-09-28T00:00:02.000Z", reply: { content_role: "room_interpreter_reply",
        text: "First reply", result_sha256: "a".repeat(64) } },
    { ...base, request_id: correctionId, first_request_id: firstId, turn_ordinal: 2,
      requested_by_participant_id: secondId, trigger_message_id: correctionMessageId,
      finished_at: "2026-09-28T00:00:04.000Z", reply: { content_role: "room_interpreter_reply",
        text: "Corrected reply", result_sha256: "b".repeat(64) } },
  ];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const { operation } = JSON.parse(String(init.body));
    return json(operation === "interpreter_evaluation_list" ? {
      schema: "helix.shared_live_room.interpreter_evaluation_list.v1",
      api_version: "v1", ok: true, operation: "room.interpreter.evaluation_list",
      room: { room_id: roomA }, turns: evalTurns, model_input: false, provider_calls: 0,
      task_handoff: false, reentry_required: true, answer_authority: false,
      assistant_answer: false, terminal_eligible: false, raw_content_included: true,
    } : list(roomA, [{ ...turn(roomA, "Old duplicate"), finished_at: "2026-09-28T00:00:02.000Z" }]));
  }));
  render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA} authority="https://rooms.test"
    closed={false} messages={messages} participants={[{ participant_id: guestId, display_name: "Guest" },
      { participant_id: secondId, display_name: "Second guest" }]} />);
  await screen.findByText("Corrected reply");
  const log = screen.getByRole("log", { name: "Hosted room conversation history" });
  expect(log).toHaveTextContent("First reply");
  expect(log).toHaveTextContent("In response to Second guest: Please correct the result");
  expect(log).not.toHaveTextContent("Old duplicate");
  expect(screen.getByText("Shared AI correction")).toBeTruthy();
});

it("runs only the selected queued AR-2 ordinal through the attended native action", async () => {
  const base = turn(roomA, "");
  const queued = { schema: "helix.room_interpreter_evaluation_status.v1",
    request_id: base.request_id, first_request_id: null, room_id: roomA,
    interpreter_session_id: base.interpreter_session_id, generation: 2,
    turn_ordinal: 1, requested_by_participant_id:
      "shared_realtime_participant:66666666-6666-4666-8666-666666666666",
    trigger_message_id: base.trigger_message_id, state: "queued",
    finished_at: null, failure_code: null, reply: null,
    mission_authority: false, program_action: false };
  const bridge = vi.fn(async (input: { action: string }) => input.action === "inspect"
    ? { ok: true, code: "saved", roomHostedInterpreterEvaluationEnabled: true }
    : { ok: true, code: "room_hosted_interpreter_evaluation_completed",
      roomMcpStatusCallObserved: true });
  Object.defineProperty(window, "casimirDesktop", { configurable: true,
    value: { liveConnection: bridge } });
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const { operation } = JSON.parse(String(init.body));
    if (operation === "interpreter_context_preview") return json(preview(roomA, queued));
    return json(operation === "interpreter_evaluation_list" ? {
      schema: "helix.shared_live_room.interpreter_evaluation_list.v1",
      api_version: "v1", ok: true, operation: "room.interpreter.evaluation_list",
      room: { room_id: roomA }, turns: [queued], model_input: false, provider_calls: 0,
      task_handoff: false, reentry_required: true, answer_authority: false,
      assistant_answer: false, terminal_eligible: false, raw_content_included: false,
    } : list(roomA, []));
  }));
  const messages = [{ room_id: roomA, message_id: base.trigger_message_id,
    author_participant_id: queued.requested_by_participant_id,
    text: "Guest asks", created_at: "2026-09-28T00:00:00.000Z",
    content_role: "room_member_text" as const, answer_authority: false as const,
    assistant_answer: false as const, terminal_eligible: false as const }];
  render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA}
    authority="https://rooms.test" closed={false} isOwner messages={messages} />);
  expect(screen.queryByRole("button", { name: /Run first reply with my OpenAI API key/ })).toBeNull();
  await review();
  fireEvent.click(await screen.findByRole("button", { name: /Run first reply with my OpenAI API key/ }));
  await waitFor(() => expect(bridge).toHaveBeenCalledWith({
    action: "room_hosted_interpreter_evaluation_run", room_id: roomA,
    interpreter_session_id: base.interpreter_session_id, generation: 2,
    request_id: base.request_id, turn_ordinal: 1,
  }));
  expect(await screen.findByText(/provider stream confirmed the room-status MCP call/)).toBeTruthy();
});

it("orders a completed AI reply between member messages only with a recorded finish time", async () => {
  const participantId = "shared_realtime_participant:66666666-6666-4666-8666-666666666666";
  const completed = { ...turn(roomA, "AI answered between topics"),
    finished_at: "2026-09-28T00:00:02.000Z" };
  const member = (messageId: string, text: string, createdAt: string) => ({
    room_id: roomA, message_id: messageId, author_participant_id: participantId,
    text, created_at: createdAt, content_role: "room_member_text" as const,
    answer_authority: false as const, assistant_answer: false as const,
    terminal_eligible: false as const });
  const messages = [member(completed.trigger_message_id, "First member question",
    "2026-09-28T00:00:01.000Z"),
    member("room_message:77777777-7777-4777-8777-777777777777", "Later member correction",
      "2026-09-28T00:00:03.000Z")];
  vi.stubGlobal("fetch", vi.fn(async () => json(list(roomA, [completed]))));
  render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA} authority="https://rooms.test"
    closed={false} messages={messages} participants={[{ participant_id: participantId,
      display_name: "Guest" }]} />);
  await screen.findByText("AI answered between topics");
  const history = screen.getByRole("log", { name: "Hosted room conversation history" });
  const text = history.textContent ?? "";
  expect(text.indexOf("First member question")).toBeLessThan(text.indexOf("AI answered between topics"));
  expect(text.indexOf("AI answered between topics")).toBeLessThan(text.indexOf("Later member correction"));
  expect(screen.getAllByText("AI answered between topics")).toHaveLength(1);
});

it("keeps an older reply without a finish time outside the ordered conversation", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json(list(roomA, [turn(roomA, "Legacy reply")]))));
  render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA} authority="https://rooms.test"
    closed={false} />);
  await screen.findByText("Legacy reply");
  expect(screen.getByRole("log", { name: "Hosted room conversation history" }))
    .not.toHaveTextContent("Legacy reply");
  expect(screen.getByText("Shared AI reply · order unavailable")).toBeTruthy();
});

it("discards a late reply after switching hosted rooms", async () => {
  let release!: (value: Response) => void;
  const fetcher = vi.fn()
    .mockImplementationOnce(async () => new Promise<Response>(resolve => { release = resolve; }))
    .mockImplementation(async () => json(list(roomB, [])));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA}
    authority="https://rooms.test" closed={false} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  view.rerender(<NativeHostedRoomInterpreterTurnHistory roomId={roomB}
    authority="https://rooms.test" closed={false} />);
  await waitFor(() => expect(screen.getByText("No room AI turns recorded.")).toBeTruthy());
  await act(async () => { release(json(list(roomA, [turn(roomA, "Old room reply")]))) });
  expect(screen.queryByText("Old room reply")).toBeNull();
});

it("offers one explicit paid-key pickup to the owner and never exposes it to a guest", async () => {
  const queued = { ...turn(roomA, ""), state: "queued", reply: null };
  const messages = [{ room_id: roomA, message_id: queued.trigger_message_id,
    author_participant_id: "shared_realtime_participant:66666666-6666-4666-8666-666666666666",
    text: "Guest request with exact wording", created_at: "2026-09-28T00:00:00.000Z",
    content_role: "room_member_text" as const, answer_authority: false as const,
    assistant_answer: false as const, terminal_eligible: false as const }];
  const participants = [{ participant_id: messages[0].author_participant_id,
    display_name: "Guest" }];
  const bridge = vi.fn(async (request: { action: string }) => request.action === "inspect"
    ? { ok: true, code: "saved", roomHostedInterpreterCanaryEnabled: true }
    : { ok: false, code: "room_hosted_interpreter_unconfirmed",
      providerRequestMayHaveBeenSent: true });
  Object.defineProperty(window, "casimirDesktop", { configurable: true,
    value: { liveConnection: bridge } });
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) =>
    JSON.parse(String(init.body)).operation === "interpreter_context_preview"
      ? json(preview(roomA, queued, "Guest request with exact wording"))
      : json(list(roomA, [queued]))));
  const view = render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA}
    authority="https://rooms.test" closed={false} isOwner={false}
    messages={messages} participants={participants} />);
  await screen.findByText(/AI turn queued/);
  expect(screen.getByText(/Requested from Guest: Guest request with exact wording/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Run one shared AI turn/ })).toBeNull();
  view.rerender(<NativeHostedRoomInterpreterTurnHistory roomId={roomA}
    authority="https://rooms.test" closed={false} isOwner
    messages={messages} participants={participants} />);
  await review();
  fireEvent.click(await screen.findByRole("button", { name: /Run one shared AI turn/ }));
  await waitFor(() => expect(bridge).toHaveBeenCalledWith({
    action: "room_hosted_interpreter_run", room_id: roomA,
    interpreter_session_id: queued.interpreter_session_id,
    generation: queued.generation, request_id: queued.request_id,
  }));
  expect(await screen.findByText(/provider request may have been sent and could incur an API charge/)).toBeTruthy();
});

it("lets the owner request stop for only the running room AI turn", async () => {
  const queued = { ...turn(roomA, ""), state: "queued", reply: null };
  let shownTurn = queued;
  let poll!: () => void;
  const interval = vi.spyOn(window, "setInterval").mockImplementation((callback, delay) => {
    if (delay === 5000) poll = callback as () => void;
    return 123;
  });
  const messages = [{ room_id: roomA, message_id: queued.trigger_message_id,
    author_participant_id: "shared_realtime_participant:66666666-6666-4666-8666-666666666666",
    text: "Guest question", created_at: "2026-09-28T00:00:00.000Z",
    content_role: "room_member_text" as const, answer_authority: false as const,
    assistant_answer: false as const, terminal_eligible: false as const }];
  let finishRun!: (value: { ok: false; code: "room_hosted_interpreter_unconfirmed" }) => void;
  const bridge = vi.fn((request: { action: string }) => {
    if (request.action === "inspect") return Promise.resolve({ ok: true, code: "saved",
      roomHostedInterpreterCanaryEnabled: true });
    if (request.action === "room_hosted_interpreter_stop") return Promise.resolve({ ok: true,
      code: "room_hosted_interpreter_stop_requested" });
    return new Promise<{ ok: false; code: "room_hosted_interpreter_unconfirmed" }>(
      resolve => { finishRun = resolve; });
  });
  Object.defineProperty(window, "casimirDesktop", { configurable: true,
    value: { liveConnection: bridge } });
  const fetcher = vi.fn(async (_url: unknown, init: RequestInit) =>
    JSON.parse(String(init.body)).operation === "interpreter_context_preview"
      ? json(preview(roomA, queued, "Guest question")) : json(list(roomA, [shownTurn])));
  vi.stubGlobal("fetch", fetcher);
  render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA}
    authority="https://rooms.test" closed={false} isOwner messages={messages} />);
  await review();
  fireEvent.click(await screen.findByRole("button", { name: /Run one shared AI turn/ }));
  shownTurn = { ...queued, state: "claimed" };
  await act(async () => { poll(); });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
  expect(await screen.findByText("AI turn claimed; provider outcome unconfirmed.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Stop this AI turn" })).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "Stop this AI turn" }));
  await waitFor(() => expect(bridge).toHaveBeenCalledWith({
    action: "room_hosted_interpreter_stop", room_id: roomA, request_id: queued.request_id,
  }));
  expect(await screen.findByText(/Stop requested. Refresh this turn/)).toBeTruthy();
  await act(async () => finishRun({ ok: false, code: "room_hosted_interpreter_unconfirmed" }));
  expect(screen.getByText(/Stop requested. Refresh this turn/)).toBeTruthy();
  expect(screen.queryByText(/Shared AI reply recorded/)).toBeNull();
  interval.mockRestore();
});

it("keeps a previous room's late run completion from clearing the selected room's run", async () => {
  const queuedA = { ...turn(roomA, ""), state: "queued", reply: null };
  const queuedB = { ...turn(roomB, ""), state: "queued", reply: null,
    request_id: "room_interpreter_turn:77777777-7777-4777-8777-777777777777",
    trigger_message_id: "room_message:88888888-8888-4888-8888-888888888888" };
  const message = (roomId: string, triggerId: string) => ({ room_id: roomId,
    message_id: triggerId,
    author_participant_id: "shared_realtime_participant:66666666-6666-4666-8666-666666666666",
    text: "A room-specific question", created_at: "2026-09-28T00:00:00.000Z",
    content_role: "room_member_text" as const, answer_authority: false as const,
    assistant_answer: false as const, terminal_eligible: false as const });
  let finishA!: (value: { ok: false; code: string }) => void;
  let finishB!: (value: { ok: false; code: string }) => void;
  const bridge = vi.fn((request: { action: string; room_id?: string }) => {
    if (request.action === "inspect") return Promise.resolve({ ok: true, code: "saved",
      roomHostedInterpreterCanaryEnabled: true });
    return new Promise<{ ok: false; code: string }>(resolve => {
      if (request.room_id === roomA) finishA = resolve;
      else finishB = resolve;
    });
  });
  Object.defineProperty(window, "casimirDesktop", { configurable: true,
    value: { liveConnection: bridge } });
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const { operation, room_id: roomId } = JSON.parse(String(init.body));
    const queued = roomId === roomA ? queuedA : queuedB;
    return operation === "interpreter_context_preview" ? json(preview(roomId, queued,
      "A room-specific question")) : json(list(roomId, [queued]));
  }));
  const view = render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA}
    authority="https://rooms.test" closed={false} isOwner
    messages={[message(roomA, queuedA.trigger_message_id)]} />);
  await review();
  fireEvent.click(await screen.findByRole("button", { name: /Run one shared AI turn/ }));
  await waitFor(() => expect(bridge).toHaveBeenCalledWith(expect.objectContaining({
    action: "room_hosted_interpreter_run", room_id: roomA })));
  view.rerender(<NativeHostedRoomInterpreterTurnHistory roomId={roomB}
    authority="https://rooms.test" closed={false} isOwner
    messages={[message(roomB, queuedB.trigger_message_id)]} />);
  await review();
  const runB = await screen.findByRole("button", { name: /Run one shared AI turn/ });
  expect(runB).not.toBeDisabled();
  fireEvent.click(runB);
  await waitFor(() => expect(bridge).toHaveBeenCalledWith(expect.objectContaining({
    action: "room_hosted_interpreter_run", room_id: roomB })));
  await act(async () => finishA({ ok: false, code: "room_hosted_interpreter_unconfirmed" }));
  expect(screen.queryByRole("button", { name: /Run one shared AI turn/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Stop this AI turn" })).toBeTruthy();
  expect(screen.queryByText(/provider outcome may still be uncertain/i)).toBeNull();
  await act(async () => finishB({ ok: false, code: "room_hosted_interpreter_unconfirmed" }));
});

it("keeps a late stop receipt in its original room and permits stop after remount", async () => {
  const claimedA = { ...turn(roomA, ""), state: "claimed", reply: null };
  const claimedB = { ...turn(roomB, ""), state: "claimed", reply: null,
    request_id: "room_interpreter_turn:77777777-7777-4777-8777-777777777777" };
  let finishStopA!: (value: { ok: true; code: string }) => void;
  const bridge = vi.fn((request: { action: string; room_id?: string }) => {
    if (request.action === "inspect") return Promise.resolve({ ok: true, code: "saved",
      roomHostedInterpreterCanaryEnabled: true });
    if (request.room_id === roomA) return new Promise<{ ok: true; code: string }>(resolve => {
      finishStopA = resolve;
    });
    return Promise.resolve({ ok: true, code: "room_hosted_interpreter_stop_requested" });
  });
  Object.defineProperty(window, "casimirDesktop", { configurable: true,
    value: { liveConnection: bridge } });
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const roomId = JSON.parse(String(init.body)).room_id;
    return json(list(roomId, [roomId === roomA ? claimedA : claimedB]));
  }));
  const view = render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA}
    authority="https://rooms.test" closed={false} isOwner />);
  fireEvent.click(await screen.findByRole("button", { name: "Request stop on this device" }));
  await waitFor(() => expect(bridge).toHaveBeenCalledWith({
    action: "room_hosted_interpreter_stop", room_id: roomA,
    request_id: claimedA.request_id }));
  view.rerender(<NativeHostedRoomInterpreterTurnHistory roomId={roomB}
    authority="https://rooms.test" closed={false} isOwner />);
  expect(await screen.findByRole("button", { name: "Request stop on this device" })).not.toBeDisabled();
  await act(async () => finishStopA({ ok: true, code: "room_hosted_interpreter_stop_requested" }));
  expect(screen.queryByText(/Stop requested. Refresh this turn/)).toBeNull();
  expect(screen.getByRole("button", { name: "Request stop on this device" })).not.toBeDisabled();
});

it("explains when a claimed turn has no active local run to stop", async () => {
  const claimed = { ...turn(roomA, ""), state: "claimed", reply: null };
  const bridge = vi.fn(async (request: { action: string }) => request.action === "inspect"
    ? { ok: true, code: "saved", roomHostedInterpreterCanaryEnabled: true }
    : { ok: false, code: "room_hosted_interpreter_not_running" });
  Object.defineProperty(window, "casimirDesktop", { configurable: true,
    value: { liveConnection: bridge } });
  vi.stubGlobal("fetch", vi.fn(async () => json(list(roomA, [claimed]))));
  render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA}
    authority="https://rooms.test" closed={false} isOwner />);
  fireEvent.click(await screen.findByRole("button", { name: "Request stop on this device" }));
  expect(await screen.findByText(/No active run for this turn was found on this device/)).toBeTruthy();
  expect(screen.getByText(/a stop was not confirmed/)).toBeTruthy();
  expect(bridge).toHaveBeenCalledWith({ action: "room_hosted_interpreter_stop",
    room_id: roomA, request_id: claimed.request_id });
});

it("keeps the charge-bearing owner control hidden when the native canary is disabled", async () => {
  const queued = { ...turn(roomA, ""), state: "queued", reply: null };
  const messages = [{ room_id: roomA, message_id: queued.trigger_message_id,
    author_participant_id: "shared_realtime_participant:66666666-6666-4666-8666-666666666666",
    text: "Guest question", created_at: "2026-09-28T00:00:00.000Z",
    content_role: "room_member_text" as const, answer_authority: false as const,
    assistant_answer: false as const, terminal_eligible: false as const }];
  const bridge = vi.fn(async () => ({ ok: true, code: "saved",
    roomHostedInterpreterCanaryEnabled: false }));
  Object.defineProperty(window, "casimirDesktop", { configurable: true,
    value: { liveConnection: bridge } });
  vi.stubGlobal("fetch", vi.fn(async () => json(list(roomA, [queued]))));
  render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA}
    authority="https://rooms.test" closed={false} isOwner messages={messages} />);
  expect(await screen.findByText(/evaluation is not enabled on this device/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Run one shared AI turn/ })).toBeNull();
  expect(bridge).toHaveBeenCalledWith({ action: "inspect" });
});

it("does not offer paid pickup when the trigger message is unavailable in this room view", async () => {
  const queued = { ...turn(roomA, ""), state: "queued", reply: null };
  Object.defineProperty(window, "casimirDesktop", { configurable: true,
    value: { liveConnection: vi.fn(async () => ({ ok: true, code: "saved",
      roomHostedInterpreterCanaryEnabled: true })) } });
  vi.stubGlobal("fetch", vi.fn(async () => json(list(roomA, [queued]))));
  render(<NativeHostedRoomInterpreterTurnHistory roomId={roomA}
    authority="https://rooms.test" closed={false} isOwner />);
  expect(await screen.findByText(/requesting message is not in this room view/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Run one shared AI turn/ })).toBeNull();
});
