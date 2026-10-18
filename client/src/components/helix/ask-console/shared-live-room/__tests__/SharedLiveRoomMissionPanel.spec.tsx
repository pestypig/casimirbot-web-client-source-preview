// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SharedLiveRoomMissionPanel } from "../SharedLiveRoomMissionPanel";
import { useRoomMissionHandoffReview } from "../RoomMissionHandoffReview";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { HELIX_WORKSTATION_GUIDANCE_EVENT } from "@/lib/workstation/workstationGuidance";

const room = { room_id: "room:one", status: "open", participants: [{ participant_id: "speaker:one", display_name: "Guest One" }] } as unknown as HelixSharedRealtimeRoom;
const candidate = { reasoning_binding_id: "binding:one", binding_epoch: 1, helix_conversation_id: "chat:one", binding_mission_id: null, run_id: null };
const mission = { ...candidate, room_id: room.room_id, mission_id: "mission:one", mission_revision: 1, status: "active" };
const hash = "a".repeat(64);
const local = { roomId: room.room_id, handoffId: "handoff:one", realtimeSessionId: "live:one", text: "Review the plan.", textHash: `sha256:${hash}`, capturedAt: 100 };
const option = { handoff_id: local.handoffId, realtime_session_id: local.realtimeSessionId,
  speaker_participant_id: "speaker:one", transcript_text_hash: local.textHash, transcript_text_char_count: local.text.length, created_at_ms: 100 };
const catalog = { schema: "helix.room_mission_owner_catalog.v1", room_id: room.room_id, mission, candidate,
  candidate_unavailable: false, handoffs: [option], execution_authority: false, answer_authority: false, raw_content_included: false };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const selectedResponse = (value: typeof mission) => ({ ok: true, mission: value, dispatch_authority: false, answer_authority: false, terminal_eligible: false });
const dispatchResponse = (deliveryState: "pending" | "picked_up" | "acknowledged" | "expired" = "pending") => ({ ok: true, room_mission_id: mission.mission_id, room_mission_revision: 1,
  speaker_participant_id: "speaker:one", provider_pickup_confirmed: false, answer_authority: false, terminal_eligible: false,
  event: { schema: "helix.reasoning_steering_event.v1", steering_event_ref: "event:one", reasoning_binding_id: "binding:one", binding_epoch: 1,
    cursor: 1, client_event_ref: "room-handoff:handoff:one", origin: "gpt_live_finalized", delivery_state: deliveryState,
    instruction_sha256: hash, instruction_length: local.text.length, created_at: "2026-09-25T00:00:00.000Z",
    expires_at: "2026-09-25T01:00:00.000Z", picked_up_at: ["picked_up", "acknowledged"].includes(deliveryState) ? "2026-09-25T00:20:00.000Z" : null,
    acknowledged_at: deliveryState === "acknowledged" ? "2026-09-25T00:30:00.000Z" : null, advisory_only: true, execution_requested: false,
    evidence_satisfied: false, provider_thread_content_included: false, hidden_reasoning_included: false, answer_authority: false, terminal_eligible: false } });
function fixture(body: unknown = catalog) {
  const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => json(body));
  vi.stubGlobal("fetch", fetcher);
  const ui = render(<SharedLiveRoomMissionPanel room={room} />);
  return { fetcher, ...ui };
}
async function choose() {
  fireEvent.change(await screen.findByLabelText("Captured room instruction"), { target: { value: local.handoffId } });
  fireEvent.click(screen.getByRole("checkbox"));
}
beforeEach(() => useRoomMissionHandoffReview.setState({ entries: [local] }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); useRoomMissionHandoffReview.setState({ entries: [] }); });
describe("room mission owner workflow", () => {
  it("opens exact-task pairing guidance without selecting or dispatching a mission", async () => {
    const guidance = vi.fn();
    window.addEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, guidance);
    try {
      const f = fixture({ ...catalog, mission: null, candidate: null, candidate_unavailable: true });
      const button = await screen.findByRole("button", { name: "Open Agent Access for task pairing" });
      fireEvent.click(button);
      expect(guidance).toHaveBeenCalledOnce();
      expect((guidance.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
        kind: "user_attention", panelId: "agent-access", targetId: "external-ai-connection-setup",
      });
      expect(f.fetcher).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("button", { name: "Select room task" })).toBeNull();
    } finally {
      window.removeEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, guidance);
    }
  });
  it("requires explicit task review and sends the exact discovered binding and expected revision", async () => {
    const f = fixture({ ...catalog, mission: null });
    const button = await screen.findByRole("button", { name: "Select room task" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("checkbox"));
    f.fetcher.mockResolvedValueOnce(json(selectedResponse(mission)));
    fireEvent.click(button);
    await screen.findByText(/Room mission selected/);
    const body = JSON.parse(f.fetcher.mock.calls[1][1]!.body as string);
    expect(body).toEqual({ ...candidate, room_id: room.room_id, expected_revision: null, request_id: expect.any(String) });
    expect(screen.queryByRole("button", { name: "Select room task" })).toBeNull();
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it("preserves the select request on an uncertain response and suppresses double clicks", async () => {
    const f = fixture({ ...catalog, mission: null });
    const button = await screen.findByRole("button", { name: "Select room task" });
    fireEvent.click(screen.getByRole("checkbox"));
    let fail!: (error: Error) => void;
    f.fetcher.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    fireEvent.click(button); fireEvent.click(button);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    fail(new Error("network")); await screen.findByText(/outcome is unknown/);
    f.fetcher.mockResolvedValueOnce(json(selectedResponse(mission))); fireEvent.click(button);
    await screen.findByText(/Room mission selected/);
    expect(f.fetcher.mock.calls[1][1]!.body).toBe(f.fetcher.mock.calls[2][1]!.body);
  });
  it("shows captured speaker/text and sends only after explicit review, reporting dispatch rather than pickup", async () => {
    const f = fixture();
    fireEvent.change(await screen.findByLabelText("Captured room instruction"), { target: { value: local.handoffId } });
    expect(screen.getByText("Guest One: Review the plan.")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Send reviewed instruction" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    f.fetcher.mockResolvedValueOnce(json(dispatchResponse(), 202));
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(button);
    await screen.findByText(/Instruction recorded for the paired task. Codex pickup and a result are not confirmed/);
    expect(JSON.parse(f.fetcher.mock.calls[1][1]!.body as string)).toEqual({ room_id: room.room_id,
      room_mission_id: "mission:one", room_mission_revision: 1, handoff_id: local.handoffId,
      transcript_text: local.text, client_event_ref: "room-handoff:handoff:one" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
  it("checks the exact steering receipt and distinguishes MCP pickup from a task result", async () => {
    const f = fixture(); await choose();
    f.fetcher.mockResolvedValueOnce(json(dispatchResponse(), 202));
    fireEvent.click(screen.getByRole("button", { name: "Send reviewed instruction" }));
    await screen.findByText(/Instruction recorded for the paired task/);
    f.fetcher.mockResolvedValueOnce(json({ ok: true, event: dispatchResponse("acknowledged").event }));
    fireEvent.click(screen.getByRole("button", { name: "Check task pickup" }));
    await screen.findByText(/paired MCP client acknowledged receipt.*Task action and a result are not confirmed/);
    expect(f.fetcher.mock.calls[2][0]).toBe("/api/account/session/agent-connections/reasoning-bindings/binding%3Aone/steering/event%3Aone?binding_epoch=1");
    expect(screen.queryByText(/native result verified/i)).toBeNull();
  });
  it("shows a persisted task poll without calling it acknowledgement or decision", async () => {
    const f = fixture(); await choose();
    f.fetcher.mockResolvedValueOnce(json(dispatchResponse(), 202));
    fireEvent.click(screen.getByRole("button", { name: "Send reviewed instruction" }));
    await screen.findByText(/Instruction recorded for the paired task/);
    f.fetcher.mockResolvedValueOnce(json({ ok: true, event: dispatchResponse("picked_up").event }));
    fireEvent.click(screen.getByRole("button", { name: "Check task pickup" }));
    expect(await screen.findByText(/exact task polled and was offered this instruction.*acknowledgement, decision and game action are not confirmed/))
      .toBeTruthy();
    expect(screen.queryByText(/paired MCP client acknowledged receipt/)).toBeNull();
  });
  it("rejects a pickup response for a different steering receipt", async () => {
    const f = fixture(); await choose();
    f.fetcher.mockResolvedValueOnce(json(dispatchResponse(), 202));
    fireEvent.click(screen.getByRole("button", { name: "Send reviewed instruction" }));
    await screen.findByText(/Instruction recorded for the paired task/);
    const mismatch = dispatchResponse("acknowledged").event;
    mismatch.client_event_ref = "room-handoff:another";
    f.fetcher.mockResolvedValueOnce(json({ ok: true, event: mismatch }));
    fireEvent.click(screen.getByRole("button", { name: "Check task pickup" }));
    await screen.findByText(/No new outcome confirmed \(room_mission_response_mismatch\)/);
    expect(screen.queryByText(/paired MCP client acknowledged receipt/)).toBeNull();
  });
  it("loads only the selected mission's retained, non-content handoff status after remount", async () => {
    const f = fixture(); await screen.findByText(/Mission: Selected/);
    f.fetcher.mockResolvedValueOnce(json({ schema: "helix.room_mission_dispatch_activity.v1",
      room_id: room.room_id, room_mission_id: mission.mission_id, room_mission_revision: 1,
      entries: [{ steering_event_ref: "event:one", speaker_participant_id: "speaker:one",
        instruction_origin: "gpt_live_finalized",
        client_event_ref: "room-handoff:handoff:one", created_at: "2026-09-25T00:00:00.000Z",
        delivery_state: "acknowledged" }], raw_content_included: false,
      task_action_confirmed: false, answer_authority: false, terminal_eligible: false }));
    fireEvent.click(screen.getByRole("button", { name: "Load retained handoff status" }));
    expect(await screen.findByText(/Guest One.*paired MCP client acknowledged; task action and result unconfirmed/)).toBeTruthy();
    expect(f.fetcher.mock.calls[1][0]).toBe("/api/account/session/agent-connections/room-missions/room%3Aone/dispatch-activity");
    expect(screen.queryByText("Review the plan.")).toBeNull();
  });
  it("shows an unavailable exact task without promoting a queued receipt to delivery", async () => {
    const f = fixture(); await screen.findByText(/Mission: Selected/);
    f.fetcher.mockResolvedValueOnce(json({ schema: "helix.room_mission_dispatch_activity.v1",
      room_id: room.room_id, room_mission_id: mission.mission_id, room_mission_revision: 1,
      task_availability: { state: "unavailable", reason: "task_not_active" },
      entries: [{ steering_event_ref: "event:one", speaker_participant_id: "speaker:one",
        instruction_origin: "gpt_live_finalized", client_event_ref: "room-handoff:handoff:one",
        created_at: "2026-09-25T00:00:00.000Z", delivery_state: "pending" }],
      raw_content_included: false, task_action_confirmed: false,
      answer_authority: false, terminal_eligible: false }));
    fireEvent.click(screen.getByRole("button", { name: "Load retained handoff status" }));
    expect(await screen.findByText(/exact task is currently unavailable for pickup/)).toBeTruthy();
    expect(screen.getByText(/pending; task action and result unconfirmed/)).toBeTruthy();
    expect(screen.queryByText(/paired MCP client acknowledged/)).toBeNull();
  });
  it.each(["pairing_revoked", "pairing_expired", "reasoning_binding_revoked"])(
    "removes previously shown receipts when %s denies the next owner read", async code => {
    const f = fixture(); await screen.findByText(/Mission: Selected/);
    f.fetcher.mockResolvedValueOnce(json({ schema: "helix.room_mission_dispatch_activity.v1",
      room_id: room.room_id, room_mission_id: mission.mission_id, room_mission_revision: 1,
      entries: [{ steering_event_ref: "event:one", speaker_participant_id: "speaker:one",
        instruction_origin: "gpt_live_finalized", client_event_ref: "room-handoff:handoff:one",
        created_at: "2026-09-25T00:00:00.000Z", delivery_state: "acknowledged" }],
      raw_content_included: false, task_action_confirmed: false,
      answer_authority: false, terminal_eligible: false }));
    const button = screen.getByRole("button", { name: "Load retained handoff status" });
    fireEvent.click(button);
    await screen.findByText(/Guest One.*paired MCP client acknowledged/);
    f.fetcher.mockResolvedValueOnce(json({ error: code }, 409));
    fireEvent.click(button);
    await screen.findByText(new RegExp(`selected task binding is unavailable \\(${code}\\)`));
    expect(screen.queryByLabelText("Retained room handoffs")).toBeNull();
    expect(screen.queryByText(/Guest One.*paired MCP client acknowledged/)).toBeNull();
  });
  it("shows retained poll evidence without promoting it to acknowledgement", async () => {
    const f = fixture(); await screen.findByText(/Mission: Selected/);
    f.fetcher.mockResolvedValueOnce(json({ schema: "helix.room_mission_dispatch_activity.v1",
      room_id: room.room_id, room_mission_id: mission.mission_id, room_mission_revision: 1,
      entries: [{ steering_event_ref: "event:one", speaker_participant_id: "speaker:one",
        instruction_origin: "gpt_live_finalized", client_event_ref: "room-handoff:handoff:one",
        created_at: "2026-09-25T00:00:00.000Z", delivery_state: "picked_up" }],
      raw_content_included: false, task_action_confirmed: false,
      answer_authority: false, terminal_eligible: false }));
    fireEvent.click(screen.getByRole("button", { name: "Load retained handoff status" }));
    expect(await screen.findByText(/Guest One.*exact task polled; acknowledgement, decision and game action unconfirmed/))
      .toBeTruthy();
  });
  it("shows a source-verified private task report separately from MCP acknowledgement", async () => {
    const f = fixture(); await screen.findByText(/Mission: Selected/);
    f.fetcher.mockResolvedValueOnce(json({ schema: "helix.room_mission_dispatch_activity.v1",
      room_id: room.room_id, room_mission_id: mission.mission_id, room_mission_revision: 1,
      entries: [{ steering_event_ref: "event:one", speaker_participant_id: "speaker:one",
        instruction_origin: "typed", client_event_ref: "room-handoff:handoff:one",
        created_at: "2026-09-25T00:00:00.000Z", delivery_state: "acknowledged" }],
      raw_content_included: false, task_action_confirmed: false,
      answer_authority: false, terminal_eligible: false }));
    fireEvent.click(screen.getByRole("button", { name: "Load retained handoff status" }));
    await screen.findByRole("button", { name: "Check verified task reports" });
    f.fetcher.mockResolvedValueOnce(json({ schema: "helix.room_result_catalog.v1",
      room_id: room.room_id, mission: { mission_id: mission.mission_id,
        mission_revision: 1 },
      results: [{ result_ref: "result:one", steering_event_ref: "event:one",
        room_id: room.room_id, room_mission_id: mission.mission_id,
        room_mission_revision: 1, status: "unable",
        created_at: "2026-09-25T00:00:01.000Z" }],
      limited: false, answer_authority: false, raw_content_included: false }));
    fireEvent.click(screen.getByRole("button", { name: "Check verified task reports" }));
    expect(await screen.findByText(/Authenticated private task report says unable; game result unverified, not a room answer/))
      .toBeTruthy();
    expect(f.fetcher.mock.calls[2][0]).toBe(
      "/api/account/session/agent-connections/room-missions/room%3Aone/results");
    expect(screen.queryByText(/raw result text/)).toBeNull();
    f.fetcher.mockResolvedValueOnce(json({ error: "room_mission_not_current" }, 409));
    fireEvent.click(screen.getByRole("button", { name: "Check verified task reports" }));
    await screen.findByText(/No new outcome confirmed \(room_mission_not_current\)/);
    expect(screen.queryByText(/Authenticated private task report says unable/)).toBeNull();
  });
  it("rejects retained activity from a different mission revision", async () => {
    const f = fixture(); await screen.findByText(/Mission: Selected/);
    f.fetcher.mockResolvedValueOnce(json({ schema: "helix.room_mission_dispatch_activity.v1",
      room_id: room.room_id, room_mission_id: mission.mission_id, room_mission_revision: 2,
      entries: [], raw_content_included: false, task_action_confirmed: false,
      answer_authority: false, terminal_eligible: false }));
    fireEvent.click(screen.getByRole("button", { name: "Load retained handoff status" }));
    await screen.findByText(/No new outcome confirmed \(room_mission_response_mismatch\)/);
    expect(screen.queryByLabelText("Retained room handoffs")).toBeNull();
  });
  it("reuses the handoff request after remount and an uncertain outcome", async () => {
    const f = fixture(); await choose(); f.fetcher.mockRejectedValueOnce(new Error("network"));
    fireEvent.click(screen.getByRole("button", { name: "Send reviewed instruction" }));
    await screen.findByText(/outcome is unknown/);
    const first = f.fetcher.mock.calls[1][1]!.body;
    f.unmount();
    const next = fixture(); await choose(); next.fetcher.mockResolvedValueOnce(json(dispatchResponse(), 202));
    fireEvent.click(screen.getByRole("button", { name: "Send reviewed instruction" }));
    await screen.findByText(/Instruction recorded/);
    expect(next.fetcher.mock.calls[1][1]!.body).toBe(first);
  });
  it.each(["acknowledged", "expired"] as const)("does not turn a %s steering receipt into task completion", async state => {
    const f = fixture(); await choose();
    f.fetcher.mockResolvedValueOnce(json(dispatchResponse(state), 202));
    fireEvent.click(screen.getByRole("button", { name: "Send reviewed instruction" }));
    await screen.findByText(state === "acknowledged"
      ? /paired MCP client acknowledged receipt.*Task action and a result are not confirmed/
      : /Instruction is expired.*not confirmed as delivered/);
    expect((screen.getByRole("button", { name: "Send reviewed instruction" }) as HTMLButtonElement).disabled).toBe(true);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it("revokes the exact selection and removes the dispatch control", async () => {
    const f = fixture();
    const button = await screen.findByRole("button", { name: "Revoke room mission" });
    f.fetcher.mockResolvedValueOnce(json(selectedResponse({ ...mission, status: "revoked", mission_revision: 2 })));
    fireEvent.click(button); await screen.findByText(/Mission revoked/);
    expect(JSON.parse(f.fetcher.mock.calls[1][1]!.body as string)).toEqual({ expected_revision: 1, request_id: expect.any(String) });
    expect(screen.queryByLabelText("Captured room instruction")).toBeNull();
  });
  it.each(["room", "session", "hash", "length"])("does not mix a mismatched %s preview", async field => {
    useRoomMissionHandoffReview.setState({ entries: [{ ...local,
      ...(field === "room" ? { roomId: "room:other" } : field === "session" ? { realtimeSessionId: "live:other" }
        : field === "hash" ? { textHash: "sha256:other" } : { text: "A much longer transcript for this test" }) }] });
    fixture(); await screen.findByText(/No current captured instructions/);
    expect(screen.queryByLabelText("Captured room instruction")).toBeNull();
  });
  it("clears approval after a disconnect removes the preview", async () => {
    fixture(); await choose();
    act(() => useRoomMissionHandoffReview.setState({ entries: [] }));
    expect(screen.queryByRole("button", { name: "Send reviewed instruction" })).toBeNull();
    act(() => useRoomMissionHandoffReview.setState({ entries: [local] }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });
  it.each(["mission", "speaker", "hash"])("rejects a mismatched %s dispatch response", async field => {
    const f = fixture(); await choose(); const response = dispatchResponse();
    if (field === "mission") response.room_mission_revision = 2;
    if (field === "speaker") response.speaker_participant_id = "speaker:other";
    if (field === "hash") response.event.instruction_sha256 = "b".repeat(64);
    f.fetcher.mockResolvedValueOnce(json(response, 202));
    fireEvent.click(screen.getByRole("button", { name: "Send reviewed instruction" }));
    await screen.findByText(/room_mission_response_mismatch/);
    expect(screen.queryByText(/Instruction recorded/)).toBeNull();
  });
  it("rejects a catalog for another room", async () => {
    fixture({ ...catalog, room_id: "room:other" });
    await screen.findByText(/room_mission_response_mismatch/);
    expect(screen.queryByLabelText("Captured room instruction")).toBeNull();
  });
  it("does not project the previous room's mission during a room switch", async () => {
    const f = fixture(); await screen.findByText(/Mission: Selected/);
    const other = { ...room, room_id: "room:other" } as HelixSharedRealtimeRoom;
    f.rerender(<SharedLiveRoomMissionPanel room={other} />);
    expect(screen.queryByText(/Connected chat: chat:one/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Load retained handoff status" })).toBeNull();
  });
  it("aborts on unmount and ignores a late selection response", async () => {
    const f = fixture({ ...catalog, mission: null });
    const button = await screen.findByRole("button", { name: "Select room task" });
    fireEvent.click(screen.getByRole("checkbox"));
    let finish!: (response: Response) => void;
    f.fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(button); const signal = f.fetcher.mock.calls[1][1]!.signal; f.unmount();
    expect(signal?.aborted).toBe(true); finish(json(selectedResponse(mission)));
    await waitFor(() => expect(screen.queryByText(/Room mission selected/)).toBeNull());
  });
  it("bounds an uncertain request without automatic retry or a stuck button", async () => {
    const f = fixture(); await choose(); vi.useFakeTimers();
    f.fetcher.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Send reviewed instruction" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_001); });
    expect(screen.getByText(/outcome is unknown/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send reviewed instruction" }) as HTMLButtonElement).disabled).toBe(false);
    expect(f.fetcher.mock.calls[1][1]!.signal?.aborted).toBe(true);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
});
