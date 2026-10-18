// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { NativeHostedRoomInterpreterStatus } from "../NativeHostedRoomInterpreterStatus";

const first = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const second = "shared_realtime_room:22222222-2222-4222-8222-222222222222";
const receipt = (roomId: string) => ({ schema: "helix.shared_live_room.interpreter_status.v1",
  api_version: "v1", ok: true, operation: "room.interpreter.status",
  room: { room_id: roomId }, session: null, reentry_required: true,
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
  raw_content_included: false });
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
afterEach(() => { cleanup(); delete window.casimirDesktop; vi.unstubAllGlobals(); });

it("shows only a verified status for the exact selected hosted room", async () => {
  const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => json(receipt(first)));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<NativeHostedRoomInterpreterStatus roomId={first} authority="https://rooms.test" />);
  await screen.findByText("No shared AI interpreter is prepared for this room.");
  expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toEqual({ operation: "interpreter_status", room_id: first });
  view.rerender(<NativeHostedRoomInterpreterStatus roomId={second} authority="https://rooms.test" />);
  await screen.findByText("Hosted room AI status could not be verified for this account.");
  expect(screen.queryByText("No shared AI interpreter is prepared for this room.")).toBeNull();
  expect(JSON.parse(String(fetcher.mock.calls[1][1].body))).toEqual({ operation: "interpreter_status", room_id: second });
});

it("clears stale status on account change and ignores a late reply", async () => {
  let release!: (value: Response) => void;
  const fetcher = vi.fn()
    .mockImplementationOnce(async () => new Promise<Response>(resolve => { release = resolve; }))
    .mockImplementation(async () => json(receipt(first)));
  vi.stubGlobal("fetch", fetcher);
  render(<NativeHostedRoomInterpreterStatus roomId={first} authority="https://rooms.test" />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await act(async () => release(json(receipt(second))));
  expect(await screen.findByText("No shared AI interpreter is prepared for this room.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Refresh AI status" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
});

it("labels configured metadata as a key selection rather than a usable AI turn", async () => {
  const session = {
    schema: "helix.shared_room_interpreter_preparation.v1",
    interpreter_session_id: "room_interpreter:33333333-3333-4333-8333-333333333333",
    room_id: first, generation: 2, state: "configured", provider: "openai_agents_api",
    credential_source: "host_native_profile", expected_payer: "host_openai_project",
    usage_ceiling_turns: 1, shared_ai_active: false, model_input: false,
    provider_calls: 0, task_handoff: false,
    created_at: "2026-09-28T00:00:00.000Z", configured_at: "2026-09-28T00:01:00.000Z",
    removed_at: null,
  };
  vi.stubGlobal("fetch", vi.fn(async () => json({ ...receipt(first), session })));
  render(<NativeHostedRoomInterpreterStatus roomId={first} authority="https://rooms.test" isOwner />);
  expect(await screen.findByText(/Host selected a key for this room generation/)).toHaveTextContent(
    "Shared AI is inactive; key availability and provider access must be checked again before a turn.");
  expect(screen.queryByRole("button", { name: "Enable three-member text evaluation" })).toBeNull();
});

it("activates two-turn evaluation only from the owner's configured generation", async () => {
  const session = { schema: "helix.shared_room_interpreter_preparation.v1",
    interpreter_session_id: "room_interpreter:33333333-3333-4333-8333-333333333333",
    room_id: first, generation: 2, state: "configured", provider: "openai_agents_api",
    credential_source: "host_native_profile", expected_payer: "host_openai_project",
    usage_ceiling_turns: 1, shared_ai_active: false, model_input: false,
    provider_calls: 0, task_handoff: false, created_at: "2026-09-28T00:00:00.000Z",
    configured_at: "2026-09-28T00:01:00.000Z", removed_at: null };
  const activated = { ...session, usage_ceiling_turns: 2,
    evaluation_profile: "ar2_two_turn_text" };
  const requests: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); requests.push(body);
    return json(body.operation === "interpreter_evaluation_activate" ? {
      schema: "helix.shared_live_room.interpreter_evaluation_activation.v1",
      api_version: "v1", ok: true, operation: "room.interpreter.evaluation_activate",
      room: { room_id: first }, session: activated, model_input: false,
      provider_calls: 0, task_handoff: false, reentry_required: true,
      answer_authority: false, assistant_answer: false, terminal_eligible: false,
      shared_ai_active: false, raw_content_included: false,
    } : { ...receipt(first), session: requests.length > 1 ? activated : session });
  }));
  render(<NativeHostedRoomInterpreterStatus roomId={first} authority="https://rooms.test"
    capacityProfile="three_human_text" isOwner />);
  fireEvent.click(await screen.findByRole("button", { name: "Enable three-member text evaluation" }));
  expect(await screen.findByText(/Two-turn text evaluation is configured/)).toBeTruthy();
  expect(requests[1]).toEqual({ operation: "interpreter_evaluation_activate", room_id: first,
    request: { interpreter_session_id: session.interpreter_session_id, generation: 2 } });
});

it("offers native key selection to the hosted owner while keeping guests read-only", async () => {
  const pending = { schema: "helix.shared_room_interpreter_preparation.v1",
    interpreter_session_id: "room_interpreter:33333333-3333-4333-8333-333333333333",
    room_id: first, generation: 1, state: "configuration_pending", provider: "openai_agents_api",
    credential_source: "unconfigured", expected_payer: "host_openai_project_if_configured",
    usage_ceiling_turns: 0, shared_ai_active: false, model_input: false,
    provider_calls: 0, task_handoff: false, created_at: "2026-09-28T00:00:00.000Z",
    configured_at: null, removed_at: null };
  const fetcher = vi.fn().mockImplementationOnce(async () => json({ ...receipt(first), session: pending }))
    .mockImplementationOnce(async () => json({ ...receipt(first), session: pending }))
    .mockImplementation(async () => json({ ...receipt(first), session: { ...pending,
      interpreter_session_id: "room_interpreter:44444444-4444-4444-8444-444444444444",
      generation: 2, state: "configured", credential_source: "host_native_profile",
      expected_payer: "host_openai_project", usage_ceiling_turns: 1,
      configured_at: "2026-09-28T00:01:00.000Z" } }));
  vi.stubGlobal("fetch", fetcher);
  const bridge = vi.fn(async () => ({ ok: true, code: "room_hosted_interpreter_key_selected" as const }));
  Object.defineProperty(window, "casimirDesktop", { configurable: true, value: { liveConnection: bridge } });
  const guest = render(<NativeHostedRoomInterpreterStatus roomId={first} authority="https://rooms.test" />);
  await screen.findByText("Interpreter preparation pending; shared AI is inactive.");
  expect(screen.queryByRole("button", { name: "Use my configured API key for this hosted room" })).toBeNull();
  guest.unmount();
  const owner = render(<NativeHostedRoomInterpreterStatus roomId={first} authority="https://rooms.test" isOwner />);
  fireEvent.click(await screen.findByRole("button", { name: "Use my configured API key for this hosted room" }));
  await waitFor(() => expect(bridge).toHaveBeenCalledWith({ action: "room_hosted_interpreter_key_select",
    room_id: first, interpreter_session_id: pending.interpreter_session_id, generation: 1 }));
  expect(await screen.findByText(/Host selected a key for this room generation/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Use my configured API key for this hosted room" })).toBeNull();
  owner.unmount();
});

it("lets the owner prepare an empty hosted interpreter without a provider turn", async () => {
  const pending = { schema: "helix.shared_room_interpreter_preparation.v1",
    interpreter_session_id: "room_interpreter:33333333-3333-4333-8333-333333333333",
    room_id: first, generation: 1, state: "configuration_pending", provider: "openai_agents_api",
    credential_source: "unconfigured", expected_payer: "host_openai_project_if_configured",
    usage_ceiling_turns: 0, shared_ai_active: false, model_input: false,
    provider_calls: 0, task_handoff: false, created_at: "2026-09-28T00:00:00.000Z",
    configured_at: null, removed_at: null };
  const fetcher = vi.fn().mockImplementationOnce(async () => json(receipt(first)))
    .mockImplementationOnce(async () => json(receipt(first)))
    .mockImplementationOnce(async () => json({ schema: "helix.shared_live_room.interpreter_preparation.v1",
      room: { room_id: first }, session: pending, model_input: false,
      provider_calls: 0, shared_ai_active: false }))
    .mockImplementation(async () => json({ ...receipt(first), session: pending }));
  vi.stubGlobal("fetch", fetcher);
  const guest = render(<NativeHostedRoomInterpreterStatus roomId={first} authority="https://rooms.test" />);
  await screen.findByText("No shared AI interpreter is prepared for this room.");
  expect(screen.queryByRole("button", { name: "Prepare shared AI for this room" })).toBeNull();
  guest.unmount();
  const owner = render(<NativeHostedRoomInterpreterStatus roomId={first} authority="https://rooms.test" isOwner />);
  fireEvent.click(await screen.findByRole("button", { name: "Prepare shared AI for this room" }));
  expect(await screen.findByText("Interpreter preparation pending; shared AI is inactive.")).toBeTruthy();
  expect(JSON.parse(String(fetcher.mock.calls[2][1].body))).toEqual({
    operation: "interpreter_prepare", room_id: first });
  expect(screen.queryByRole("button", { name: "Prepare shared AI for this room" })).toBeNull();
  owner.unmount();
});
