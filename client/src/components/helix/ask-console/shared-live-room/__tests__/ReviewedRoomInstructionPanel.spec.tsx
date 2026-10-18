// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReviewedRoomInstructionPanel } from "../ReviewedRoomInstructionPanel";
import { NativeRoomInstructionsPanel } from "../NativeRoomInstructionsPanel";
import { useRoomMissionHandoffReview } from "../RoomMissionHandoffReview";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

const roomId = "shared_realtime_room:transfer", authority = "https://rooms.test", text = "Keep the guest's exact  constraint.\n".repeat(20);
const attachment = { attachment_ref: "room_owner_attachment:11111111-1111-4111-8111-111111111111", revision: 1,
  node_ref: `room_node:sha256:${"a".repeat(64)}`, status: "reserved", expires_at: "2099-01-01T00:00:00Z",
  local_task_verified: false, dispatch_authority: false };
const capture = { handoff_id: "handoff:one", realtime_session_id: "realtime:one", runtime_id: "runtime:one",
  speaker_participant_id: "participant:guest", captured_at_ms: Date.now(), consent_version: 1, consent_receipt_ref: "consent:one",
  transcript_text_hash: `sha256:${"b".repeat(64)}`, transcript_text_char_count: text.length };
const room = { room_id: roomId, status: "ready", participants: [{ participant_id: "participant:guest", display_name: "Guest" }] };
const options = { room_id: roomId, attachment, captures: [capture], raw_content_included: false, dispatch_authority: false };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const catalog = { room_id: roomId, authority, selection_ref: "selection:one", selection_revision: 2,
  task_label: "Selected task", captures: [capture], raw_content_included: false, dispatch_authority: false };
const receipt = () => ({ schema: "helix.shared_live_room.instruction_transfer.v1", api_version: "v1", ok: true,
  operation: "room.instruction.approve", room: { room_id: roomId }, attachment, capture,
  transfer_ref: "11111111-1111-4111-8111-111111111111", expires_at: new Date(Date.now() + 120_000).toISOString(),
  reentry_required: true, answer_authority: false, assistant_answer: false, terminal_eligible: false,
  dispatch_authority: false, raw_content_included: false });
function fixture(native = false) {
  useRoomMissionHandoffReview.setState({ entries: [{ roomId, handoffId: capture.handoff_id, realtimeSessionId: capture.realtime_session_id,
    text, textHash: capture.transcript_text_hash, capturedAt: capture.captured_at_ms }] });
  const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => json(native ? catalog : options)); vi.stubGlobal("fetch", fetcher);
  const view = render(native ? <NativeRoomInstructionsPanel roomId={roomId} authority={authority} /> : <ReviewedRoomInstructionPanel room={room as never} />);
  return { fetcher, view };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); useRoomMissionHandoffReview.setState({ entries: [] }); });
async function review() {
  fireEvent.click(screen.getByRole("button", { name: "Load captures for native transfer" }));
  const select = await screen.findByRole("combobox", { name: "Captured instruction to transfer" });
  fireEvent.change(select, { target: { value: capture.handoff_id } });
}
it("requires review, transfers the complete original text, and does not claim dispatch", async () => {
  const f = fixture(); expect(f.fetcher).not.toHaveBeenCalled(); await review();
  expect(document.querySelector("pre")?.textContent).toBe(text);
  const send = screen.getByRole("button", { name: "Transfer reviewed instruction" }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox")); f.fetcher.mockResolvedValueOnce(json(receipt())); fireEvent.click(send);
  await screen.findByText(/Work has not started/);
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(f.fetcher.mock.calls[1][1]?.body))).toEqual({ room_id: roomId, attachment, capture, instruction_text: text, approve_transfer: true });
  expect(f.fetcher.mock.calls[1][1]?.credentials).toBe("same-origin");
});
it("cannot substitute metadata or a truncated preview when the original browser text is absent", async () => {
  fixture(); act(() => useRoomMissionHandoffReview.setState({ entries: [] }));
  fireEvent.click(screen.getByRole("button", { name: "Load captures for native transfer" }));
  await screen.findByText(/No current capture has its full original text/);
  expect(screen.queryByRole("button", { name: "Transfer reviewed instruction" })).toBeNull();
});
it("invalidates review when captured source text is cleared", async () => {
  const f = fixture(); await review(); fireEvent.click(screen.getByRole("checkbox"));
  act(() => useRoomMissionHandoffReview.setState({ entries: [] }));
  expect(screen.queryByRole("button", { name: "Transfer reviewed instruction" })).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each(["account", "room"])("ignores late browser options after %s changes", async kind => {
  const f = fixture(); let release!: (value: Response) => void;
  f.fetcher.mockImplementationOnce(async () => new Promise(resolve => { release = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "Load captures for native transfer" }));
  if (kind === "account") act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  else f.view.rerender(<ReviewedRoomInstructionPanel room={{ ...room, room_id: "shared_realtime_room:other" } as never} />);
  await act(async () => release(json(options)));
  expect(screen.queryByRole("combobox")).toBeNull();
});
it("does not retry an uncertain browser transfer automatically", async () => {
  const f = fixture(); await review(); fireEvent.click(screen.getByRole("checkbox"));
  f.fetcher.mockRejectedValueOnce(new Error("lost response")); fireEvent.click(screen.getByRole("button", { name: "Transfer reviewed instruction" }));
  await screen.findByText(/Transfer could not be confirmed/); expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it("queues by exact capture and private selection, without accepting or copying transcript text", async () => {
  const f = fixture(true); expect(f.fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Load captured instructions" }));
  const select = await screen.findByRole("combobox", { name: "Captured instruction to queue" });
  fireEvent.change(select, { target: { value: capture.handoff_id } });
  const queue = screen.getByRole("button", { name: "Queue reviewed instruction" }) as HTMLButtonElement;
  expect(queue.disabled).toBe(true); fireEvent.click(screen.getByRole("checkbox"));
  f.fetcher.mockResolvedValueOnce(json({ schema: "helix.native_hosted_room_dispatch.v1", ok: true, instruction_queued: true,
    task_pickup_confirmed: false, execution_authority: false, answer_authority: false, raw_content_included: false, terminal_eligible: false }));
  fireEvent.click(queue); await screen.findByText(/Task pickup and execution are not yet confirmed/);
  expect(JSON.parse(String(f.fetcher.mock.calls[1][1]?.body))).toEqual({ room_id: roomId, selection_ref: catalog.selection_ref,
    selection_revision: 2, handoff_id: capture.handoff_id, use_reviewed_transfer: true });
});
it("drops a native review on account change and ignores an in-flight catalog", async () => {
  const f = fixture(true); let release!: (value: Response) => void;
  f.fetcher.mockImplementationOnce(async () => new Promise(resolve => { release = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "Load captured instructions" }));
  act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  await act(async () => release(json(catalog))); expect(screen.queryByRole("combobox")).toBeNull();
});
