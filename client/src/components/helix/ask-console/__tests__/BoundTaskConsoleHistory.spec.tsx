// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BoundTaskConsoleHistory } from "../BoundTaskConsoleHistory";

const inspect = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agent-access/reasoningTaskBinding", () => ({
  inspectCurrentReasoningBinding: inspect,
}));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); inspect.mockReset(); });

it("uses the pane's exact-task pairing in the cloud without a competing status read", async () => {
  const showMessageCloud = vi.fn(async () => ({ status: "showing" }));
  window.casimirDesktop = { showMessageCloud } as unknown as NonNullable<Window["casimirDesktop"]>;
  render(<BoundTaskConsoleHistory helixConversationId="chat:one" messageCloudOpen
    pairingSnapshot={{ status: "active", taskId: "task:exact",
      pairingId: "pairing:one", bindingId: "binding:one" }}
    messages={[]} />);
  await waitFor(() => expect(showMessageCloud).toHaveBeenCalledWith(expect.objectContaining({
    pairing: { status: "active", taskId: "task:exact",
      pairingId: "pairing:one", bindingId: "binding:one" },
  })));
  expect(inspect).not.toHaveBeenCalled();
  delete window.casimirDesktop;
});

it("renders an exact-task owner report as a report, without implying a Minecraft effect", async () => {
  const source = "typed:33333333-3333-4333-8333-333333333333";
  inspect.mockResolvedValue({ status: "active", reasoning_binding_id: "binding:one",
    binding_epoch: 1, helix_conversation_id: "chat:one", run_id: null });
  const event = { schema: "helix.reasoning_steering_event.v1", steering_event_ref: "event:one",
    reasoning_binding_id: "binding:one", binding_epoch: 1, cursor: 1,
    client_event_ref: source, origin: "typed", delivery_state: "acknowledged",
    instruction_sha256: "a".repeat(64), instruction_length: 20,
    created_at: "2026-09-29T18:00:00.000Z", expires_at: "2026-09-29T18:10:00.000Z",
    acknowledged_at: "2026-09-29T18:01:00.000Z", advisory_only: true,
    execution_requested: false, evidence_satisfied: false,
    provider_thread_content_included: false, hidden_reasoning_included: false,
    answer_authority: false, terminal_eligible: false };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
    url.includes("/personal-result") ? { schema: "helix.personal_task_result_owner_read.v1",
      ok: true, task_report_only: true, minecraft_effect_verified: false,
      answer_authority: false, receipt: { steering_event_ref: "event:one",
        source_turn_id: source }, report: { status: "completed",
        text: "**Offline**: $x^2$ [source](https://example.com/report)", evidence_refs: ["observation:one"] } }
      : { display_only: true, deliveries: [{ event }] }), { status: 200 })));
  render(<BoundTaskConsoleHistory helixConversationId="chat:one"
    status="Steering remains queued without an acknowledgement."
    messages={[{ id: "message:one", at: "2026-09-29T18:00:00.000Z",
      content: "Check the connector", traceId: source }]} />);
  await waitFor(() => expect(screen.getByText("Offline")).toBeTruthy());
  expect(screen.getByText("You · picked up by Codex task")).toBeTruthy();
  expect(screen.getByRole("link", { name: "source" })).toHaveAttribute("href", "https://example.com/report");
  expect(document.querySelector(".katex")).not.toBeNull();
  expect(screen.getByText("observation:one")).toBeInTheDocument();
  expect(screen.queryByText("Steering remains queued without an acknowledgement.")).toBeNull();
  expect(screen.getByText("Task-reported observation. Game effect not verified by this report.")).toBeTruthy();
});

it("restores the owner's recorded report after task pairing has expired", async () => {
  const source = "typed:44444444-4444-4444-8444-444444444444";
  inspect.mockRejectedValue(new Error("pairing_expired"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    schema: "helix.personal_task_result_owner_history.v1", ok: true,
    task_report_only: true, minecraft_effect_verified: false, answer_authority: false,
    reports: [{ receipt: { source_turn_id: source, task_report_recorded: true,
      minecraft_effect_verified: false }, report: { status: "completed",
      text: "The connector was offline during the check.", evidence_refs: [] } }],
  }), { status: 200 })));
  render(<BoundTaskConsoleHistory helixConversationId="chat:one"
    messages={[{ id: "message:two", at: "2026-09-29T18:00:00.000Z",
      content: "Check Minecraft", traceId: source }]} />);
  await waitFor(() => expect(screen.getByText("The connector was offline during the check.")).toBeTruthy());
  expect(screen.getByText("Task-reported observation. Game effect not verified by this report.")).toBeTruthy();
});

it("continues the bounded display poll when a pairing becomes active after the channel opens", async () => {
  vi.useFakeTimers();
  const source = "typed:55555555-5555-4555-8555-555555555555";
  inspect.mockResolvedValueOnce({ status: "inactive" }).mockResolvedValue({ status: "active",
    reasoning_binding_id: "binding:late", binding_epoch: 1,
    helix_conversation_id: "chat:late", run_id: null });
  const event = { schema: "helix.reasoning_steering_event.v1", steering_event_ref: "event:late",
    reasoning_binding_id: "binding:late", binding_epoch: 1, cursor: 1,
    client_event_ref: source, origin: "typed", delivery_state: "acknowledged",
    instruction_sha256: "b".repeat(64), instruction_length: 20,
    created_at: "2026-09-30T05:00:00.000Z", expires_at: "2026-09-30T05:10:00.000Z",
    acknowledged_at: "2026-09-30T05:01:00.000Z", advisory_only: true,
    execution_requested: false, evidence_satisfied: false,
    provider_thread_content_included: false, hidden_reasoning_included: false,
    answer_authority: false, terminal_eligible: false };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
    url.includes("/personal-task-results")
      ? { schema: "helix.personal_task_result_owner_history.v1", ok: true,
        task_report_only: true, minecraft_effect_verified: false,
        answer_authority: false, reports: [] }
      : url.includes("/personal-result")
        ? { schema: "helix.personal_task_result_owner_read.v1", ok: true,
          task_report_only: true, minecraft_effect_verified: false,
          answer_authority: false, receipt: { steering_event_ref: "event:late",
            source_turn_id: source }, report: { status: "completed",
            text: "Late task report arrived.", evidence_refs: [] } }
        : { display_only: true, deliveries: [{ event }] }), { status: 200 })));
  render(<BoundTaskConsoleHistory helixConversationId="chat:late"
    messages={[{ id: "message:late", at: "2026-09-30T05:00:00.000Z",
      content: "Check the connector", traceId: source }]} />);
  expect(screen.getByText("You · MCP inbox")).toBeTruthy();
  await act(async () => { await Promise.resolve(); await vi.advanceTimersByTimeAsync(2_000); });
  expect(inspect).toHaveBeenCalledTimes(2);
  expect(screen.getByText("You · picked up by Codex task")).toBeTruthy();
  expect(screen.getByText("Late task report arrived.")).toBeTruthy();
});
