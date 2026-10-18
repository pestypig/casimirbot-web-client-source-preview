// @vitest-environment jsdom
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BoundAgentPromptDisplay } from "../BoundAgentPromptDisplay";
import { HelixAskConsoleRuntimeShell } from "../HelixAskConsoleRuntimeShell";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { useBrowserReasoningBindingStore } from "@/lib/agent-access/reasoningTaskBinding";
vi.mock("../HelixAskLegacyRuntimeBridge", () => ({ HelixAskLegacyRuntimeBridge: () => <div>Default chat renderer</div> }));
vi.mock("../HelixOperatorActivityPanel", () => ({ HelixOperatorActivityPanel: () => null }));
vi.mock("../agent-run-observer/AgentRunObserverBindingSurface", () => ({ AgentRunObserverBindingSurface: () => null }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers();
  useAgiChatStore.setState({ activeId: undefined });
  useBrowserReasoningBindingStore.setState({ current: null });
});
const binding = { reasoning_binding_id: "binding:display", binding_epoch: 1,
  helix_conversation_id: "chat:display", run_id: "run:display", status: "active" as const,
  continuation_transport: "polling" as const };
const event = { schema: "helix.reasoning_steering_event.v1", steering_event_ref: "event:display",
  reasoning_binding_id: binding.reasoning_binding_id, binding_epoch: 1, cursor: 1,
  client_event_ref: "request:display", origin: "agent_submitted", delivery_state: "pending",
  instruction_sha256: "a".repeat(64), instruction_length: 20,
  created_at: "2026-09-08T12:00:00.000Z", expires_at: "2026-09-08T12:10:00.000Z", acknowledged_at: null,
  advisory_only: true, execution_requested: false, evidence_satisfied: false,
  provider_thread_content_included: false, hidden_reasoning_included: false, answer_authority: false, terminal_eligible: false };
it.each(["fetch", "body"])("bounds a hung %s, clears stale display and recovers without a remount", async stage => {
  vi.useFakeTimers();
  const body = { display_only: true, deliveries: [{ event, instruction_text: "Inspect the platform" }] };
  let release!: (value: any) => void;
  const hung = new Promise(resolve => { release = resolve; });
  const fetcher = vi.fn().mockImplementationOnce(async () => new Response(JSON.stringify(body)))
    .mockImplementationOnce(() => stage === "fetch" ? hung : Promise.resolve({ ok: true, json: () => hung }))
    .mockImplementation(async () => new Response(JSON.stringify({ display_only: true, deliveries: [] })));
  vi.stubGlobal("fetch", fetcher);
  await act(async () => { render(<BoundAgentPromptDisplay binding={binding} />); });
  expect(screen.getByText("Inspect the platform")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(screen.queryByText("Inspect the platform")).toBeNull();
  expect(screen.getByText("Agent prompt display unavailable; no pickup is claimed.")).toBeTruthy();
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(fetcher).toHaveBeenCalledTimes(3);
  await act(async () => { release(stage === "fetch" ? new Response(JSON.stringify(body)) : body); });
  expect(screen.queryByText("Inspect the platform")).toBeNull();
  expect(screen.queryByText("Agent prompt display unavailable; no pickup is claimed.")).toBeNull();
});
it("shows acknowledged agent ingress in the default packaged renderer only for its selected active chat", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ display_only: true,
    deliveries: [{ event: { ...event, delivery_state: "acknowledged", acknowledged_at: "2026-09-08T12:01:00.000Z" },
      instruction_text: "Inspect the platform" }] })));
  vi.stubGlobal("fetch", fetcher);
  useAgiChatStore.setState({ activeId: binding.helix_conversation_id });
  useBrowserReasoningBindingStore.setState({ current: binding });
  render(<HelixAskConsoleRuntimeShell contextId="ctx:default" />);
  await screen.findByText("Default chat renderer");
  await screen.findByText("Inspect the platform");
  expect(screen.getAllByText("Inspect the platform")).toHaveLength(1);
  expect(screen.getByText("Last checked: acknowledged")).toBeTruthy();
  act(() => useAgiChatStore.setState({ activeId: "chat:other" }));
  expect(screen.queryByText("Inspect the platform")).toBeNull();
  act(() => {
    useAgiChatStore.setState({ activeId: binding.helix_conversation_id });
    useBrowserReasoningBindingStore.setState({ current: { ...binding, status: "revoked" } });
  });
  expect(screen.queryByText("Inspect the platform")).toBeNull();
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each([false, true])("displays exact agent prompts once and rejects a foreign event (%s)", async foreign => {
  const row = { event: { ...event, binding_epoch: foreign ? 2 : 1 }, instruction_text: "Inspect the platform" };
  const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ display_only: true, deliveries: [row, row] })));
  vi.stubGlobal("fetch", fetcher);
  render(<BoundAgentPromptDisplay binding={binding} />);
  if (foreign) {
    await screen.findByText("Agent prompt display unavailable; no pickup is claimed.");
    expect(screen.queryByText("Inspect the platform")).toBeNull();
  } else {
    await screen.findByText("Inspect the platform");
    expect(screen.getAllByText("Inspect the platform")).toHaveLength(1);
    expect(screen.getByText("Last checked: pending")).toBeTruthy();
  }
  expect(String(fetcher.mock.calls[0][0])).toContain("run_id=run%3Adisplay");
  expect(fetcher).toHaveBeenCalledOnce();
});
it("hides the previous run immediately and ignores its delayed response", async () => {
  const response = () => new Response(JSON.stringify({ display_only: true,
    deliveries: [{ event, instruction_text: "Inspect the platform" }] }));
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(response())
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
    .mockResolvedValue(new Response(JSON.stringify({ display_only: true, deliveries: [] })));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<BoundAgentPromptDisplay binding={binding} />);
  await screen.findByText("Inspect the platform");
  view.rerender(<BoundAgentPromptDisplay binding={{ ...binding, run_id: "run:second" }} />);
  expect(screen.queryByText("Inspect the platform")).toBeNull();
  view.rerender(<BoundAgentPromptDisplay binding={{ ...binding, run_id: "run:third" }} />);
  await act(async () => { finish(response()); });
  expect(screen.queryByText("Inspect the platform")).toBeNull();
});
