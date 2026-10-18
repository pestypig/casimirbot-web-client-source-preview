// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NativeHostedRoomTextReleaseControls } from "../NativeHostedRoomTextReleaseControls";

const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const sessionId = "room_interpreter:22222222-2222-4222-8222-222222222222";
const ownId = "room_message:33333333-3333-4333-8333-333333333333";
const guestId = "room_message:44444444-4444-4444-8444-444444444444";
const selfId = "shared_realtime_participant:55555555-5555-4555-8555-555555555555";
const guestParticipantId = "shared_realtime_participant:66666666-6666-4666-8666-666666666666";
const message = (messageId: string, author: string, text: string) => ({
  message_id: messageId, room_id: roomId, author_participant_id: author,
  text, created_at: "2026-09-28T00:00:00.000Z", content_role: "room_member_text" as const,
  answer_authority: false as const, assistant_answer: false as const,
  terminal_eligible: false as const,
});
const messages = [message(ownId, selfId, "My question"),
  message(guestId, guestParticipantId, "Guest private sentence")];
const status = (state: "configured" | "configuration_pending") => ({
  schema: "helix.shared_live_room.interpreter_status.v1", api_version: "v1", ok: true,
  operation: "room.interpreter.status", room: { room_id: roomId },
  session: { schema: "helix.shared_room_interpreter_preparation.v1",
    interpreter_session_id: sessionId, room_id: roomId, generation: 2, state,
    provider: "openai_agents_api", credential_source: state === "configured" ? "host_native_profile" : "unconfigured",
    expected_payer: "host_openai_project", usage_ceiling_turns: 1,
    shared_ai_active: false, model_input: false, provider_calls: 0, task_handoff: false,
    created_at: "2026-09-28T00:00:00.000Z", configured_at: state === "configured" ? "2026-09-28T00:01:00.000Z" : null,
    removed_at: null }, reentry_required: true, answer_authority: false,
  assistant_answer: false, terminal_eligible: false, raw_content_included: false,
});
const common = { api_version: "v1", ok: true, room: { room_id: roomId },
  model_input: false, provider_calls: 0, task_handoff: false,
  reentry_required: true, answer_authority: false, assistant_answer: false,
  terminal_eligible: false, raw_content_included: false };
const release = (state: "released" | "revoked") => ({
  schema: "helix.shared_room_text_release.v1", release_id: "room_text_release:77777777-7777-4777-8777-777777777777",
  room_id: roomId, message_id: ownId, author_participant_id: selfId,
  interpreter_session_id: sessionId, interpreter_generation: 2,
  consent_revision: state === "released" ? 1 : 2, state,
  released_at: "2026-09-28T00:02:00.000Z",
  revoked_at: state === "revoked" ? "2026-09-28T00:03:00.000Z" : null,
  model_input: false, provider_calls: 0,
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("allows only the author's exact message and can withdraw that access without model input", async () => {
  const requests: unknown[] = [];
  const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); requests.push(body);
    if (body.operation === "interpreter_status") return json(status("configured"));
    if (body.operation === "text_release_list") return json({ ...common,
      schema: "helix.shared_live_room.text_release_list.v1",
      operation: "room.text_release.list", releases: [] });
    if (body.operation === "text_release_change") return json({ ...common,
      schema: "helix.shared_live_room.text_release_change.v1",
      operation: "room.text_release.change",
      release: release(body.request.action === "release" ? "released" : "revoked") });
    throw Error("unexpected operation");
  });
  vi.stubGlobal("fetch", fetcher);
  render(<NativeHostedRoomTextReleaseControls roomId={roomId} authority="https://rooms.test"
    selfParticipantId={selfId} messages={messages} closed={false} />);
  expect(await screen.findByText(/cannot undo text already sent to OpenAI/)).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "Allow AI to read this message" }));
  await screen.findByRole("button", { name: "Withdraw AI access" });
  const sent = requests.find(value => (value as { operation: string }).operation === "text_release_change") as {
    request: Record<string, unknown> };
  expect(sent.request).toEqual({ message_id: ownId, interpreter_session_id: sessionId,
    generation: 2, action: "release" });
  expect(JSON.stringify(requests)).not.toContain("Guest private sentence");
  fireEvent.click(screen.getByRole("button", { name: "Withdraw AI access" }));
  expect(await screen.findByText(/Future AI access withdrawn for this generation/)).toHaveTextContent(
    "Earlier provider use or room replies remain.");
  expect(requests.at(-1)).toMatchObject({ request: { message_id: ownId, action: "revoke" } });
});

it("shows no release action until a configured generation is verified", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return json(body.operation === "interpreter_status" ? status("configuration_pending") : {
      ...common, schema: "helix.shared_live_room.text_release_list.v1",
      operation: "room.text_release.list", releases: [] });
  }));
  render(<NativeHostedRoomTextReleaseControls roomId={roomId} authority="https://rooms.test"
    selfParticipantId={selfId} messages={messages} closed={false} />);
  await waitFor(() => expect(screen.getByText("The host has not selected a key for this room generation.")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Allow AI to read this message" })).toBeNull();
});

it("queues only the author's released message with a stable request identity", async () => {
  const requests: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); requests.push(body);
    if (body.operation === "interpreter_status") return json(status("configured"));
    if (body.operation === "text_release_list") return json({ ...common,
      schema: "helix.shared_live_room.text_release_list.v1",
      operation: "room.text_release.list", releases: [release("released")] });
    if (body.operation === "interpreter_turn_request") return json({
      schema: "helix.shared_live_room.interpreter_turn_request.v1",
      api_version: "v1", ok: true, room: { room_id: roomId },
      operation: "room.interpreter.turn_request", shared_ai_active: false,
      model_input: false, provider_calls: 0, reentry_required: true,
      answer_authority: false, assistant_answer: false, terminal_eligible: false,
      raw_content_included: false,
      turn: { schema: "helix.room_interpreter_turn_request.v1",
        request_id: "room_interpreter_turn:88888888-8888-4888-8888-888888888888",
        room_id: roomId, interpreter_session_id: sessionId, generation: 2,
        requested_by_participant_id: selfId, trigger_message_id: ownId,
        state: "queued", created_at: "2026-09-28T00:05:00.000Z",
        model_input: false, provider_calls: 0 } });
    throw Error("unexpected operation");
  }));
  render(<NativeHostedRoomTextReleaseControls roomId={roomId} authority="https://rooms.test"
    selfParticipantId={selfId} messages={messages} closed={false} />);
  expect(await screen.findByText(/Payer: host.s OpenAI project/)).toBeTruthy();
  expect(screen.getByText(/Your request queues a turn for the host/)).toBeTruthy();
  expect(screen.getByText(/up to ten current room messages/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ask host to run one AI turn" }));
  expect(await screen.findByRole("button", { name: "AI answer requested" })).toBeTruthy();
  expect(requests.at(-1)).toMatchObject({ operation: "interpreter_turn_request", room_id: roomId,
    request: { interpreter_session_id: sessionId, generation: 2,
      trigger_message_id: ownId, client_request_id: "room-ai-turn:33333333-3333-4333-8333-333333333333" } });
  expect(JSON.stringify(requests)).not.toContain("Guest private sentence");
});

it("allows a fresh request for the same released message in a new interpreter generation", async () => {
  let generation = 2;
  const requests: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.operation === "interpreter_status") return json({ ...status("configured"),
      session: { ...status("configured").session, generation } });
    if (body.operation === "text_release_list") return json({ ...common,
      schema: "helix.shared_live_room.text_release_list.v1",
      operation: "room.text_release.list", releases: [{ ...release("released"),
        interpreter_generation: generation }] });
    if (body.operation === "interpreter_turn_request") {
      requests.push(body);
      return json({ schema: "helix.shared_live_room.interpreter_turn_request.v1",
        api_version: "v1", ok: true, room: { room_id: roomId },
        operation: "room.interpreter.turn_request", shared_ai_active: false,
        model_input: false, provider_calls: 0, reentry_required: true,
        answer_authority: false, assistant_answer: false, terminal_eligible: false,
        raw_content_included: false,
        turn: { schema: "helix.room_interpreter_turn_request.v1",
          request_id: `room_interpreter_turn:${generation === 2
            ? "88888888-8888-4888-8888-888888888888" : "99999999-9999-4999-8999-999999999999"}`,
          room_id: roomId, interpreter_session_id: sessionId, generation,
          requested_by_participant_id: selfId, trigger_message_id: ownId,
          state: "queued", created_at: "2026-09-28T00:05:00.000Z",
          model_input: false, provider_calls: 0 } });
    }
    throw Error("unexpected operation");
  }));
  render(<NativeHostedRoomTextReleaseControls roomId={roomId} authority="https://rooms.test"
    selfParticipantId={selfId} messages={messages} closed={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "Ask host to run one AI turn" }));
  await screen.findByRole("button", { name: "AI answer requested" });
  generation = 3;
  fireEvent.click(screen.getByRole("button", { name: "Refresh my AI access" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ask host to run one AI turn" }));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests.map(request => request.request.generation)).toEqual([2, 3]);
});

it("routes a three-member evaluation request through the two-turn operation", async () => {
  const requests: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); requests.push(body);
    if (body.operation === "interpreter_status") return json({ ...status("configured"),
      session: { ...status("configured").session, usage_ceiling_turns: 2,
        evaluation_profile: "ar2_two_turn_text" } });
    if (body.operation === "text_release_list") return json({ ...common,
      schema: "helix.shared_live_room.text_release_list.v1",
      operation: "room.text_release.list", releases: [release("released")] });
    if (body.operation === "interpreter_evaluation_list") return json({ ...common,
      schema: "helix.shared_live_room.interpreter_evaluation_list.v1",
      operation: "room.interpreter.evaluation_list", turns: [] });
    if (body.operation === "interpreter_evaluation_request") return json({ ...common,
      schema: "helix.shared_live_room.interpreter_evaluation_request.v1",
      operation: "room.interpreter.evaluation_request", shared_ai_active: false,
      turn: { schema: "helix.room_interpreter_evaluation_request.v1",
        request_id: "room_interpreter_turn:88888888-8888-4888-8888-888888888888",
        first_request_id: null, room_id: roomId, interpreter_session_id: sessionId,
        generation: 2, turn_ordinal: 1, requested_by_participant_id: selfId,
        trigger_message_id: ownId, state: "queued", created_at: "2026-09-28T00:05:00.000Z",
        model_input: false, provider_calls: 0 } });
    throw Error("unexpected operation");
  }));
  render(<NativeHostedRoomTextReleaseControls roomId={roomId} authority="https://rooms.test"
    selfParticipantId={selfId} messages={messages} closed={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "Ask host for a first AI reply" }));
  await screen.findByRole("button", { name: "AI answer requested" });
  expect(requests.at(-1)).toMatchObject({ operation: "interpreter_evaluation_request",
    request: { turn_ordinal: 1, trigger_message_id: ownId } });
});

it("links a correction request to the completed first turn", async () => {
  const firstId = "room_interpreter_turn:88888888-8888-4888-8888-888888888888";
  const requests: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); requests.push(body);
    if (body.operation === "interpreter_status") return json({ ...status("configured"),
      session: { ...status("configured").session, usage_ceiling_turns: 2,
        evaluation_profile: "ar2_two_turn_text" } });
    if (body.operation === "text_release_list") return json({ ...common,
      schema: "helix.shared_live_room.text_release_list.v1",
      operation: "room.text_release.list", releases: [release("released")] });
    if (body.operation === "interpreter_evaluation_list") return json({ ...common,
      schema: "helix.shared_live_room.interpreter_evaluation_list.v1",
      operation: "room.interpreter.evaluation_list", raw_content_included: true,
      turns: [{ schema: "helix.room_interpreter_evaluation_status.v1",
        request_id: firstId, first_request_id: null, room_id: roomId,
        interpreter_session_id: sessionId, generation: 2, turn_ordinal: 1,
        requested_by_participant_id: guestParticipantId, trigger_message_id: guestId,
        state: "completed", finished_at: "2026-09-28T00:05:00.000Z",
        failure_code: null, mission_authority: false, program_action: false,
        reply: { content_role: "room_interpreter_reply", text: "First reply",
          result_sha256: "a".repeat(64) } }] });
    if (body.operation === "interpreter_evaluation_request") return json({ ...common,
      schema: "helix.shared_live_room.interpreter_evaluation_request.v1",
      operation: "room.interpreter.evaluation_request", shared_ai_active: false,
      turn: { schema: "helix.room_interpreter_evaluation_request.v1",
        request_id: "room_interpreter_turn:99999999-9999-4999-8999-999999999999",
        first_request_id: firstId, room_id: roomId, interpreter_session_id: sessionId,
        generation: 2, turn_ordinal: 2, requested_by_participant_id: selfId,
        trigger_message_id: ownId, state: "queued", created_at: "2026-09-28T00:06:00.000Z",
        model_input: false, provider_calls: 0 } });
    throw Error("unexpected operation");
  }));
  render(<NativeHostedRoomTextReleaseControls roomId={roomId} authority="https://rooms.test"
    selfParticipantId={selfId} messages={messages} closed={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "Ask host to run one correction" }));
  await screen.findByRole("button", { name: "AI answer requested" });
  expect(requests.at(-1)).toMatchObject({ operation: "interpreter_evaluation_request",
    request: { turn_ordinal: 2, first_request_id: firstId, trigger_message_id: ownId } });
});
