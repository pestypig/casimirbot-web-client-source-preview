/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagedConversationConsoleHistory } from "../ManagedConversationConsoleHistory";
import { HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT,
  HELIX_BOUND_AGENT_STEERING_RESULT_EVENT } from
  "@/components/helix/ask-console/HelixBoundAgentSteeringBridge";

const { readConversation } = vi.hoisted(() => ({ readConversation: vi.fn() }));
const { inspectBinding } = vi.hoisted(() => ({ inspectBinding: vi.fn() }));
const { pairingLookup } = vi.hoisted(() => ({ pairingLookup: vi.fn() }));
vi.mock("../useManagedConversation", () => ({ useSharedManagedConversation: readConversation }));
vi.mock("@/lib/agent-access/reasoningTaskBinding", () => ({ inspectCurrentReasoningBinding: inspectBinding,
  HELIX_REASONING_BINDING_UPDATED_EVENT: "binding-change" }));
vi.mock("@/components/helix/ask-console/useConversationPairing", () => ({ useConversationPairing: pairingLookup }));

const exactPairing = { status: "active" as const,
  taskId: "01a0798b-b5bd-7bf2-946a-9a77e086316a", bindingId: "binding:exact" };
beforeEach(() => pairingLookup.mockReturnValue(exactPairing));

const turnId = "managed-turn:11111111-1111-4111-8111-111111111111";
const proposalId = "22222222-2222-4222-8222-222222222222";
const active = (propose = false) => ({ view: { active: true, messages: [
  { role: "user", text: "Read the catalog.", turnId },
  { role: "assistant", text: "I can ask your paired Codex task to read it.", turnId,
    ...(propose ? { codexHandoffProposal: {
      schema: "casimirbot.personal_codex_handoff_proposal.v1", proposalId,
      instructionText: "Read the public UI catalog through MCP. Read only." } } : {}) },
] } });

afterEach(() => { cleanup(); delete window.casimirDesktop; vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("Cloud Agent DM to paired Codex", () => {
  it("shares the console's verified pairing instead of racing a duplicate activity lookup", async () => {
    readConversation.mockReturnValue({ view: { active: true, messages: [] } });
    pairingLookup.mockReturnValue({ status: "unavailable", taskId: null });
    const currentBinding = { reasoning_binding_id: "binding:exact", binding_epoch: 1,
      helix_conversation_id: "chat:exact", status: "active" };
    inspectBinding.mockResolvedValue(currentBinding);
    const showMessageCloud = vi.fn(async (_frame: unknown) => ({ status: "showing" }));
    window.casimirDesktop = { showMessageCloud,
      readCodexMirror: vi.fn(async () => ({ status: "ready", frame: {
        schema: "helix.codex_conversation_cloud_frame.v1", taskId: exactPairing.taskId,
        turns: [{ id: "turn:visible", user: "Visible request", assistant: "Visible answer",
          assistantPhase: "final_answer", status: "completed" }],
      } })) } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ManagedConversationConsoleHistory helixConversationId="chat:exact"
      messageCloudOpen overlayMode="all" pairingSnapshot={exactPairing} />);
    await waitFor(() => expect(showMessageCloud).toHaveBeenCalledWith(expect.objectContaining({
      source: "session_activity", codexSourceStatus: "live",
      turns: expect.arrayContaining([expect.objectContaining({ lane: "codex_task" })]),
    })));
    expect(window.casimirDesktop?.readCodexMirror).toHaveBeenCalledWith({
      bindingId: "binding:exact", helixConversationId: "chat:exact", visibleLimit: 3,
    });
    expect(inspectBinding).not.toHaveBeenCalled();
    expect(pairingLookup).toHaveBeenCalledWith(null);
  });
  it("uses a fresh owner-granted native read even while the pairing badge lookup is unavailable", async () => {
    readConversation.mockReturnValue({ view: { active: true, messages: [] } });
    const currentBinding = { reasoning_binding_id: "binding:exact", binding_epoch: 1,
      helix_conversation_id: "chat:exact", status: "active" };
    inspectBinding.mockResolvedValue(currentBinding);
    const showMessageCloud = vi.fn(async (_frame: unknown) => ({ status: "showing" }));
    window.casimirDesktop = { showMessageCloud,
      readCodexMirror: vi.fn(async () => ({ status: "ready", frame: {
        schema: "helix.codex_conversation_cloud_frame.v1", taskId: exactPairing.taskId,
        turns: [{ id: "turn:visible", user: "Visible request", assistant: "Visible answer",
          assistantPhase: "final_answer", status: "completed" }],
      } })) } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ManagedConversationConsoleHistory helixConversationId="chat:exact"
      messageCloudOpen overlayMode="all" pairingSnapshot={{ status: "unavailable", taskId: null }} />);
    await waitFor(() => expect(showMessageCloud).toHaveBeenCalledWith(expect.objectContaining({
      source: "session_activity", codexSourceStatus: "live",
      pairing: expect.objectContaining({ status: "active", bindingId: "binding:exact" }),
      turns: expect.arrayContaining([expect.objectContaining({ lane: "codex_task" })]),
    })));
  });
  it("does not cancel a slow native Codex read on the routine five-second activity poll", async () => {
    readConversation.mockReturnValue({ view: { active: true, messages: [] } });
    inspectBinding.mockResolvedValue({ reasoning_binding_id: "binding:exact", binding_epoch: 1,
      helix_conversation_id: "chat:exact", status: "active" });
    let finishRead!: (value: unknown) => void;
    const readCodexMirror = vi.fn(() => new Promise(resolve => { finishRead = resolve; }));
    const showMessageCloud = vi.fn(async (_frame: unknown) => ({ status: "showing" }));
    window.casimirDesktop = { showMessageCloud, readCodexMirror } as unknown as NonNullable<Window["casimirDesktop"]>;
    vi.useFakeTimers();
    try {
      render(<ManagedConversationConsoleHistory helixConversationId="chat:exact"
        messageCloudOpen overlayMode="all" pairingSnapshot={exactPairing} />);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(readCodexMirror).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(readCodexMirror).toHaveBeenCalledTimes(1);
      await act(async () => { finishRead({ status: "ready", frame: {
        schema: "helix.codex_conversation_cloud_frame.v1", taskId: exactPairing.taskId,
        turns: [{ id: "turn:slow", user: "Visible request", assistant: "Visible answer",
          assistantPhase: "final_answer", status: "completed" }],
      } }); await Promise.resolve(); });
      expect(showMessageCloud).toHaveBeenCalledWith(expect.objectContaining({
        source: "session_activity", codexSourceStatus: "live",
        turns: expect.arrayContaining([expect.objectContaining({ lane: "codex_task" })]),
      }));
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(readCodexMirror).toHaveBeenCalledTimes(2);
      expect(showMessageCloud.mock.calls.at(-1)?.[0]).toMatchObject({
        source: "session_activity", codexSourceStatus: "live",
        turns: expect.arrayContaining([expect.objectContaining({ lane: "codex_task" })]),
      });
      await act(async () => { finishRead({ status: "ready", frame: {
        schema: "helix.codex_conversation_cloud_frame.v1", taskId: exactPairing.taskId,
        turns: [{ id: "turn:new", user: "Next request", assistant: "Next answer",
          assistantPhase: "final_answer", status: "completed" }],
      } }); await Promise.resolve(); });
    } finally {
      vi.useRealTimers();
    }
  });
  it("retains a verified frame only while the native reader revalidates a retry", async () => {
    readConversation.mockReturnValue({ view: { active: true, messages: [] } });
    inspectBinding.mockResolvedValue({ reasoning_binding_id: "binding:exact", binding_epoch: 1,
      helix_conversation_id: "chat:exact", status: "active" });
    const readCodexMirror = vi.fn()
      .mockResolvedValueOnce({ status: "ready", frame: {
        schema: "helix.codex_conversation_cloud_frame.v1", taskId: exactPairing.taskId,
        turns: [{ id: "turn:visible", user: "Verified request", assistant: "Verified answer",
          assistantPhase: "final_answer", status: "completed" }],
      } })
      .mockResolvedValueOnce({ status: "retryable", code: "codex_mirror_request_timeout" })
      .mockResolvedValueOnce({ status: "unavailable", code: "codex_mirror_owner_grant_changed" });
    const showMessageCloud = vi.fn(async (_frame: unknown) => ({ status: "showing" }));
    window.casimirDesktop = { showMessageCloud, readCodexMirror } as unknown as NonNullable<Window["casimirDesktop"]>;
    vi.useFakeTimers();
    try {
      const view = render(<ManagedConversationConsoleHistory helixConversationId="chat:exact"
        messageCloudOpen overlayMode="all" pairingSnapshot={exactPairing} />);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(showMessageCloud.mock.calls.at(-1)?.[0]).toMatchObject({ codexSourceStatus: "live",
        turns: expect.arrayContaining([expect.objectContaining({ lane: "codex_task" })]) });
      view.rerender(<ManagedConversationConsoleHistory helixConversationId="chat:exact"
        messageCloudOpen overlayMode="all" pairingSnapshot={{ status: "unavailable", taskId: null }} />);
      expect(showMessageCloud.mock.calls.at(-1)?.[0]).toMatchObject({ codexSourceStatus: "live",
        turns: expect.arrayContaining([expect.objectContaining({ lane: "codex_task" })]) });
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(showMessageCloud.mock.calls.at(-1)?.[0]).toMatchObject({ codexSourceStatus: "reconnecting",
        turns: expect.arrayContaining([expect.objectContaining({ lane: "codex_task" })]) });
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(showMessageCloud.mock.calls.at(-1)?.[0]).toMatchObject({ codexSourceStatus: "unavailable",
        turns: [] });
    } finally { vi.useRealTimers(); }
  });
  it("floats visible API replies without shortening them to task-report previews", async () => {
    const text = "Visible API reply. ".repeat(100);
    readConversation.mockReturnValue({ view: { active: true, messages: [
      { role: "assistant", turnId, text },
    ] } });
    inspectBinding.mockRejectedValue(new Error("no_pairing"));
    const showMessageCloud = vi.fn(async (_frame: unknown) => ({ status: "showing" }));
    window.casimirDesktop = { showMessageCloud } as unknown as NonNullable<Window["casimirDesktop"]>;
    const view = render(<ManagedConversationConsoleHistory helixConversationId="chat:exact" messageCloudOpen overlayMode="conversation" />);
    await waitFor(() => expect(showMessageCloud).toHaveBeenCalledWith(expect.objectContaining({
      source: "cloud_agent_dm", displayMode: "conversation",
      turns: [expect.objectContaining({ author: "cloud_agent", report: { status: "completed", text } })],
    })));
    view.rerender(<ManagedConversationConsoleHistory helixConversationId="chat:exact" messageCloudOpen overlayMode="reports" />);
    await waitFor(() => expect(showMessageCloud.mock.calls.at(-1)?.[0]).toMatchObject({ displayMode: "reports", turns: [] }));
  });
  it("keeps the activity cloud open and explains the exact Codex target failure", async () => {
    readConversation.mockReturnValue({ view: { active: true, messages: [
      { role: "assistant", turnId, text: "Cloud Agent reply." },
    ] } });
    inspectBinding.mockResolvedValue({ reasoning_binding_id: "binding:exact", binding_epoch: 1,
      helix_conversation_id: "chat:exact", status: "active" });
    const showMessageCloud = vi.fn(async (_frame: unknown) => ({ status: "showing" }));
    window.casimirDesktop = { showMessageCloud,
      readCodexMirror: vi.fn(async () => ({ status: "unavailable", code: "codex_mirror_target_task_invalid" })) } as unknown as NonNullable<Window["casimirDesktop"]>;
    render(<ManagedConversationConsoleHistory helixConversationId="chat:exact" messageCloudOpen overlayMode="all" />);
    await waitFor(() => expect(showMessageCloud).toHaveBeenCalledWith(expect.objectContaining({
      source: "session_activity", codexSourceStatus: "unavailable",
      codexSourceReason: "task_reference_invalid", responsesWorkerStatus: "not_connected",
      turns: [expect.objectContaining({ lane: "cloud_agent_dm", report: {
        status: "completed", text: "Cloud Agent reply." } })],
    })));
    expect(showMessageCloud.mock.calls.at(-1)?.[0]).not.toHaveProperty("task_id");
  });
  it("keeps ordinary agent conversation in chat without a second handoff form", () => {
    readConversation.mockReturnValue(active());
    render(<ManagedConversationConsoleHistory helixConversationId="chat:exact" />);
    expect(screen.getByRole("log", { name: "Cloud Agent DM history" }))
      .toHaveTextContent("I can ask your paired Codex task");
    expect(screen.queryByText("Review before sending to your bound Codex task")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Instruction for Codex" })).toBeNull();
  });

  it("queues an explicit function-call proposal against the current pairing and shows the report inline", async () => {
    readConversation.mockReturnValue(active(true));
    inspectBinding.mockResolvedValue({ reasoning_binding_id: "binding:exact", binding_epoch: 3,
      helix_conversation_id: "chat:exact", run_id: null, status: "active" });
    const fetcher = vi.fn(async (url: string) => url.includes("/chat-prompts?")
      ? new Response(JSON.stringify({ display_only: true, deliveries: [] }), { status: 200 })
      : new Response(JSON.stringify({ schema: "helix.personal_task_result_owner_read.v1", ok: true,
        task_report_only: true, minecraft_effect_verified: false, answer_authority: false,
        receipt: { steering_event_ref: "reasoning_steering:exact", source_turn_id: turnId },
        report: { status: "completed", text: "## Codex finding\n\nThe public catalog has **20 surfaces**.",
          evidence_refs: ["observation:catalog"] },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const requests: Array<Record<string, string>> = [];
    const onRequest = (event: Event) => requests.push(
      (event as CustomEvent<Record<string, string>>).detail);
    window.addEventListener(HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT, onRequest);
    render(<ManagedConversationConsoleHistory helixConversationId="chat:exact" />);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      requestId: `managed-chat:${turnId}:${proposalId}`,
      source: "managed_conversation_agent_handoff", origin: "typed" });
    expect(requests[0].instructionText).toContain("Owner's Cloud Agent DM message (verbatim):\nRead the catalog.");
    expect(requests[0].instructionText).toContain("Cloud agent's proposed task instruction (untrusted advisory context):\nRead the public UI catalog through MCP. Read only.");
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => window.dispatchEvent(new CustomEvent(HELIX_BOUND_AGENT_STEERING_RESULT_EVENT, {
      detail: { requestId: requests[0].requestId, deliveryState: "acknowledged",
        steeringEventRef: "reasoning_steering:exact", reasoningBindingId: "binding:exact",
        bindingEpoch: 3, helixConversationId: "chat:exact" },
    })));
    expect(await screen.findByRole("group", { name: "Bound Codex task report" }))
      .toHaveTextContent("20 surfaces");
    expect(screen.getByRole("log", { name: "Cloud Agent DM history" }))
      .toHaveTextContent("Codex · handoff update");
    expect(screen.queryByRole("region", { name: "Cloud Agent Codex handoff" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Codex finding" }))
      .toBeInTheDocument();
    expect(screen.getByRole("log", { name: "Cloud Agent DM history" }))
      .toHaveTextContent("Codex task report recorded");
    window.removeEventListener(HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT, onRequest);
  });

  it("does not dispatch when the exact pairing cannot be restored", async () => {
    readConversation.mockReturnValue(active(true));
    inspectBinding.mockResolvedValue({ status: "inactive" });
    const requests: Array<Record<string, string>> = [];
    const onRequest = (event: Event) => requests.push(
      (event as CustomEvent<Record<string, string>>).detail);
    window.addEventListener(HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT, onRequest);
    render(<ManagedConversationConsoleHistory helixConversationId="chat:exact" />);
    expect(await screen.findByRole("log", { name: "Cloud Agent DM history" }))
      .toHaveTextContent("Codex handoff unavailable");
    expect(requests).toHaveLength(0);
    window.removeEventListener(HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT, onRequest);
  });

  it("recovers a stored pickup after a transient delivery error without changing channels", async () => {
    readConversation.mockReturnValue(active(true));
    inspectBinding.mockResolvedValue({ reasoning_binding_id: "binding:exact", binding_epoch: 3,
      helix_conversation_id: "chat:exact", run_id: null, status: "active" });
    const requestId = `managed-chat:${turnId}:${proposalId}`;
    let promptReads = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/chat-prompts?")) {
        promptReads++;
        return new Response(JSON.stringify({ display_only: true, deliveries: promptReads === 1 ? [] : [
          { event: { schema: "helix.reasoning_steering_event.v1",
            steering_event_ref: "reasoning_steering:exact", reasoning_binding_id: "binding:exact",
            binding_epoch: 3, cursor: 1, client_event_ref: requestId, origin: "typed",
            delivery_state: "acknowledged", instruction_sha256: "a".repeat(64),
            instruction_length: 100, created_at: "2026-10-01T11:00:00.000Z",
            expires_at: "2026-10-01T11:10:00.000Z", acknowledged_at: "2026-10-01T11:01:00.000Z",
            advisory_only: true, execution_requested: false, evidence_satisfied: false,
            provider_thread_content_included: false, hidden_reasoning_included: false,
            answer_authority: false, terminal_eligible: false } },
        ] }), { status: 200 });
      }
      return new Response(JSON.stringify({ schema: "helix.personal_task_result_owner_read.v1", ok: true,
        task_report_only: true, minecraft_effect_verified: false, answer_authority: false,
        receipt: { steering_event_ref: "reasoning_steering:exact", source_turn_id: turnId },
        report: { status: "completed", text: "Fresh catalog: 20 surfaces.",
          evidence_refs: ["observation:catalog"] },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    const requests: Array<Record<string, string>> = [];
    const onRequest = (event: Event) => requests.push(
      (event as CustomEvent<Record<string, string>>).detail);
    window.addEventListener(HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT, onRequest);
    render(<ManagedConversationConsoleHistory helixConversationId="chat:exact" />);
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => {
      window.dispatchEvent(new CustomEvent(HELIX_BOUND_AGENT_STEERING_RESULT_EVENT, {
        detail: { requestId, deliveryState: "queued", steeringEventRef: "reasoning_steering:exact",
          reasoningBindingId: "binding:exact", bindingEpoch: 3, helixConversationId: "chat:exact" },
      }));
      window.dispatchEvent(new CustomEvent(HELIX_BOUND_AGENT_STEERING_RESULT_EVENT, {
        detail: { requestId, deliveryState: "unavailable" },
      }));
    });
    expect(await screen.findByRole("group", { name: "Bound Codex task report" }))
      .toHaveTextContent("Fresh catalog: 20 surfaces.");
    expect(promptReads).toBeGreaterThanOrEqual(2);
    window.removeEventListener(HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT, onRequest);
  });

  it("keeps reconciling a late task pickup and report beyond the first minute", async () => {
    readConversation.mockReturnValue(active(true));
    inspectBinding.mockResolvedValue({ reasoning_binding_id: "binding:exact", binding_epoch: 3,
      helix_conversation_id: "chat:exact", run_id: null, status: "active" });
    const requestId = `managed-chat:${turnId}:${proposalId}`;
    let promptReads = 0;
    let reportReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/chat-prompts?")) {
        promptReads++;
        const state = promptReads > 33 ? "acknowledged" : "pending";
        return new Response(JSON.stringify({ display_only: true, deliveries: promptReads === 1 ? [] : [
          { event: { schema: "helix.reasoning_steering_event.v1",
            steering_event_ref: "reasoning_steering:late", reasoning_binding_id: "binding:exact",
            binding_epoch: 3, cursor: 1, client_event_ref: requestId, origin: "typed",
            delivery_state: state, instruction_sha256: "a".repeat(64), instruction_length: 100,
            created_at: "2026-10-01T11:00:00.000Z", expires_at: "2026-10-01T11:10:00.000Z",
            ...(state === "acknowledged" ? { acknowledged_at: "2026-10-01T11:01:00.000Z" } : {}),
            advisory_only: true, execution_requested: false, evidence_satisfied: false,
            provider_thread_content_included: false, hidden_reasoning_included: false,
            answer_authority: false, terminal_eligible: false } },
        ] }), { status: 200 });
      }
      reportReads++;
      return reportReads > 33 ? new Response(JSON.stringify({
        schema: "helix.personal_task_result_owner_read.v1", ok: true,
        task_report_only: true, minecraft_effect_verified: false, answer_authority: false,
        receipt: { steering_event_ref: "reasoning_steering:late", source_turn_id: turnId },
        report: { status: "completed", text: "Late catalog report: 21 surfaces.",
          evidence_refs: ["observation:catalog"] },
      }), { status: 200 }) : new Response(null, { status: 404 });
    }));
    const requests: Array<Record<string, string>> = [];
    const onRequest = (event: Event) => requests.push(
      (event as CustomEvent<Record<string, string>>).detail);
    window.addEventListener(HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT, onRequest);
    try {
      render(<ManagedConversationConsoleHistory helixConversationId="chat:exact" />);
      await waitFor(() => expect(requests).toHaveLength(1));
      vi.useFakeTimers();
      await act(async () => {
        window.dispatchEvent(new CustomEvent(HELIX_BOUND_AGENT_STEERING_RESULT_EVENT, {
          detail: { requestId, deliveryState: "queued", steeringEventRef: "reasoning_steering:late",
            reasoningBindingId: "binding:exact", bindingEpoch: 3, helixConversationId: "chat:exact" },
        }));
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(promptReads).toBeGreaterThan(33);
      expect(reportReads).toBeGreaterThan(33);
      expect(screen.getByRole("group", { name: "Bound Codex task report" }))
        .toHaveTextContent("Late catalog report: 21 surfaces.");
    } finally {
      vi.useRealTimers();
      window.removeEventListener(HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT, onRequest);
    }
  });
});
