// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelixAskMinimalRuntimeShell } from "../HelixAskMinimalRuntimeShell";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { readLatestReasoningBinding, rememberReasoningBinding, useBrowserReasoningBindingStore } from
  "@/lib/agent-access/reasoningTaskBinding";
import { offerFinalizedVoiceSteering } from
  "@/lib/helix/voice-steering-finalized";
import { writePersonalVoiceDestination } from "@/lib/helix/personal-voice-route";
import { requestBoundAgentSteering } from "../HelixBoundAgentSteeringBridge";

afterEach(() => {
  writePersonalVoiceDestination("cloud_agent_dm");
  cleanup();
  useAgiChatStore.setState({ sessions: {}, activeId: undefined });
  useBrowserReasoningBindingStore.setState({ current: null });
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Helix Ask bound-agent destination", () => {
  it.each(["expired", "acknowledged"])("presents an already %s dispatch receipt without waiting for another poll", async (deliveryState) => {
    const sessionId = useAgiChatStore.getState().newSession("Receipt", "ctx:receipt");
    useAgiChatStore.getState().setActive(sessionId);
    const binding = { reasoning_binding_id: "binding:receipt", helix_conversation_id: sessionId,
      status: "active" as const, continuation_transport: "polling" as const, binding_epoch: 1 };
    rememberReasoningBinding(binding);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, binding,
      event: { delivery_state: deliveryState, steering_event_ref: "event:receipt" } }), { status: 200 })));
    render(<HelixAskMinimalRuntimeShell contextId="ctx:receipt" />);
    await screen.findByText("Ready to queue");
    requestBoundAgentSteering({ requestId: "minecraft-play:receipt", instructionText: "Inspect the platform",
      origin: "typed", source: "minecraft_play_activation" });
    await screen.findByText(deliveryState === "expired"
      ? "Exact pickup ended with expired; no provider answer is claimed."
      : "The bound agent acknowledged exact pickup. This confirms transport pickup, not task completion.");
    expect(screen.queryByText("Steering queued for exact agent pickup. Provider delivery is not claimed until acknowledgement.")).toBeNull();
  });

  it("shows a replayed steering request only once in the exact chat", async () => {
    const sessionId = useAgiChatStore.getState().newSession("Replay", "ctx:replay");
    useAgiChatStore.getState().setActive(sessionId);
    const binding = { reasoning_binding_id: "binding:replay", helix_conversation_id: sessionId,
      status: "active" as const, continuation_transport: "polling" as const, binding_epoch: 1 };
    rememberReasoningBinding(binding);
    let submissions = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/steering/current")) submissions++;
      return new Response(JSON.stringify({ ok: true, binding, event: { delivery_state: "pending" } }), { status: 200 });
    }));
    const view = render(<HelixAskMinimalRuntimeShell contextId="ctx:replay" />);
    await screen.findByText("Ready to queue");
    const request = { requestId: "minecraft-play:replay", instructionText: "Inspect the platform",
      origin: "typed" as const, source: "minecraft_play_activation" as const };
    requestBoundAgentSteering(request);
    await waitFor(() => expect(useAgiChatStore.getState().sessions[sessionId].messages).toHaveLength(1));
    view.unmount();
    render(<HelixAskMinimalRuntimeShell contextId="ctx:replay" />);
    await screen.findByText("Ready to queue");
    requestBoundAgentSteering(request);
    await waitFor(() => expect(submissions).toBe(2));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(useAgiChatStore.getState().sessions[sessionId].messages).toHaveLength(1);
  });
  it("defaults normal prompt submission to an active exact binding", async () => {
    const sessionId = useAgiChatStore.getState().newSession(
      "Already-bound chat",
      "ctx:automatic-bound-agent",
    );
    useAgiChatStore.getState().setActive(sessionId);
    const binding = {
      reasoning_binding_id: "reasoning_binding:automatic-bound-agent",
      helix_conversation_id: sessionId,
      status: "active" as const,
      continuation_transport: "polling" as const,
      binding_epoch: 1,
    };
    rememberReasoningBinding(binding);
    const steeringBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/reasoning-bindings/steering/current")) {
        steeringBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({
          ok: true,
          binding,
          event: { delivery_state: "pending" },
        }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/reasoning-bindings/")) {
        return new Response(JSON.stringify({ ok: true, binding }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 503 });
    }));

    render(<HelixAskMinimalRuntimeShell contextId="ctx:automatic-bound-agent" />);

    await waitFor(() => {
      expect((screen.getByLabelText("Composer destination") as HTMLSelectElement).value)
        .toBe("bound_agent");
    });
    fireEvent.change(screen.getByLabelText("Ask Helix"), {
      target: { value: "Continue exploring safely" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit prompt" }));

    await waitFor(() => expect(steeringBodies).toHaveLength(1));
    expect(steeringBodies[0]).toMatchObject({
      helix_conversation_id: sessionId,
      origin: "typed",
      instruction_text: "Continue exploring safely",
      reasoning_binding_id: binding.reasoning_binding_id,
      binding_epoch: binding.binding_epoch,
      run_id: null,
    });
  });

  it("preserves an operator-selected chat even when the shell context has an older session", async () => {
    useAgiChatStore.getState().newSession("Older context chat", "ctx:shell");
    const selectedSessionId = useAgiChatStore.getState().newSession(
      "Operator-selected PNA chat",
      "ctx:pna",
    );
    useAgiChatStore.getState().setActive(selectedSessionId);

    render(<HelixAskMinimalRuntimeShell contextId="ctx:shell" />);

    await waitFor(() => {
      expect(useAgiChatStore.getState().activeId).toBe(selectedSessionId);
    });
  });

  it("keeps the highest binding epoch authoritative after reload", () => {
    rememberReasoningBinding({
      reasoning_binding_id: "reasoning_binding:expired-high-epoch",
      helix_conversation_id: "helix-chat:expired",
      status: "expired",
      continuation_transport: "polling",
      binding_epoch: 99,
    });
    rememberReasoningBinding({
      reasoning_binding_id: "reasoning_binding:active-current-service",
      helix_conversation_id: "helix-chat:active",
      status: "active",
      continuation_transport: "polling",
      binding_epoch: 2,
    });

    useBrowserReasoningBindingStore.setState({ current: null });

    expect(readLatestReasoningBinding()?.reasoning_binding_id).toBe(
      "reasoning_binding:expired-high-epoch",
    );
  });

  it("uses the server-authoritative exact binding when the selected chat projection lags", async () => {
    window.localStorage.setItem("helix-reasoning-bindings-v1", JSON.stringify({
      legacy: { status: "active" },
    }));
    const sessionId = useAgiChatStore.getState().newSession(
      "Selected chat",
      "ctx:lagging-binding",
    );
    useAgiChatStore.getState().setActive(sessionId);
    rememberReasoningBinding({
      reasoning_binding_id: "reasoning_binding:stale-selected-chat",
      helix_conversation_id: sessionId,
      status: "expired",
      continuation_transport: "polling",
      binding_epoch: 11,
    });
    const binding = {
      reasoning_binding_id: "reasoning_binding:newest-panel-binding",
      helix_conversation_id: "helix-chat-issued-by-agent-connections",
      status: "active" as const,
      continuation_transport: "polling" as const,
      binding_epoch: 12,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const selectedChatBinding = {
        reasoning_binding_id: "reasoning_binding:stale-selected-chat",
        helix_conversation_id: sessionId,
        status: "expired" as const,
        continuation_transport: "polling" as const,
        binding_epoch: 11,
      };
      return new Response(JSON.stringify({
        ok: true,
        binding: String(input).includes("/current?") ? selectedChatBinding : binding,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    render(<HelixAskMinimalRuntimeShell contextId="ctx:lagging-binding" />);
    rememberReasoningBinding(binding);
    fireEvent.change(screen.getByLabelText("Composer destination"), {
      target: { value: "bound_agent" },
    });

    await screen.findByText("Ready to queue");
    await new Promise((resolve) => window.setTimeout(resolve, 1_100));
    expect(screen.getByText("Ready to queue")).toBeTruthy();
    expect(useAgiChatStore.getState().activeId).toBe(sessionId);
  });

  it("routes typed and finalized GPT Live steering through the same exact binding", async () => {
    useAgiChatStore.getState().newSession(
      "Older chat sharing the legacy context",
      "ctx:bound-agent",
    );
    const sessionId = useAgiChatStore.getState().newSession(
      "Bound chat",
      "ctx:bound-agent",
    );
    useAgiChatStore.getState().setActive(sessionId);
    const binding = {
      reasoning_binding_id: "reasoning_binding:bound-agent-test",
      helix_conversation_id: sessionId,
      status: "active" as const,
      continuation_transport: "polling" as const,
      binding_epoch: 1,
    };
    rememberReasoningBinding({
      reasoning_binding_id: "reasoning_binding:expired-other-chat",
      helix_conversation_id: "helix-chat:expired-other-chat",
      status: "expired",
      continuation_transport: "polling",
      binding_epoch: 99,
    });
    const steeringBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/reasoning-bindings/") && init?.method === "GET") {
        return new Response(JSON.stringify({ ok: true, binding }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/reasoning-bindings/steering/current")) {
        steeringBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ ok: true, binding, event: { delivery_state: "pending" } }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 503 });
    }));

    render(<HelixAskMinimalRuntimeShell contextId="ctx:bound-agent" />);
    // Agent Connections can finish the exact claim after this shell mounts.
    // Choosing the bound destination must re-read that newly stored binding.
    rememberReasoningBinding(binding);
    fireEvent.change(screen.getByLabelText("Composer destination"), {
      target: { value: "bound_agent" },
    });
    await screen.findByText("Ready to queue");
    fireEvent.change(screen.getByLabelText("Ask Helix"), {
      target: { value: "Typed steering request" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit prompt" }));
    await waitFor(() => expect(steeringBodies).toHaveLength(1));
    expect(steeringBodies[0]).toMatchObject({
      origin: "typed",
      instruction_text: "Typed steering request",
    });
    expect(screen.getByText(/Provider delivery is not claimed until acknowledgement/i)).toBeTruthy();

    writePersonalVoiceDestination("message_codex");
    expect(offerFinalizedVoiceSteering({
      clientEventRef: "gpt-live:confirmed-test",
      transcript: "Voice steering request",
    })).toBe(true);
    await waitFor(() => expect(steeringBodies).toHaveLength(2));
    expect(steeringBodies[1]).toMatchObject({
      client_event_ref: "gpt-live:confirmed-test",
      origin: "gpt_live_finalized",
      instruction_text: "Voice steering request",
    });
  });

  it("does not redirect a failed selected-chat submission to the latest foreign binding", async () => {
    const sessionId = useAgiChatStore.getState().newSession("Exact target", "ctx:foreign-fallback");
    useAgiChatStore.getState().setActive(sessionId);
    const binding = { reasoning_binding_id: "binding:exact", helix_conversation_id: sessionId,
      status: "active" as const, continuation_transport: "polling" as const, binding_epoch: 1 };
    rememberReasoningBinding(binding);
    let failed = false;
    const directDispatch = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/reasoning-bindings/steering/current")) {
        failed = true;
        return new Response("{}", { status: 409 });
      }
      if (url.endsWith("/reasoning-bindings/steering")) {
        directDispatch();
        return new Response(JSON.stringify({ ok: true, event: {} }), { status: 202 });
      }
      return new Response(JSON.stringify({ ok: true, binding: failed
        ? { ...binding, reasoning_binding_id: "binding:foreign", helix_conversation_id: "chat:foreign" }
        : binding }), { status: 200 });
    }));
    render(<HelixAskMinimalRuntimeShell contextId="ctx:foreign-fallback" />);
    fireEvent.change(screen.getByLabelText("Composer destination"), { target: { value: "bound_agent" } });
    await screen.findByText("Ready to queue");
    fireEvent.change(screen.getByLabelText("Ask Helix"), { target: { value: "Stay in this exact chat" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit prompt" }));
    await waitFor(() => expect(failed).toBe(true));
    await waitFor(() => expect(screen.getByText(/steering request was rejected or became stale/)).toBeTruthy());
    expect(directDispatch).not.toHaveBeenCalled();
    expect(useAgiChatStore.getState().activeId).toBe(sessionId);
  });

  it("verifies a remembered pending binding before dispatch when panel state lags", async () => {
    const sessionId = useAgiChatStore.getState().newSession(
      "Pending projection chat",
      "ctx:pending-binding",
    );
    useAgiChatStore.getState().setActive(sessionId);
    const activeBinding = {
      reasoning_binding_id: "reasoning_binding:pending-then-active",
      helix_conversation_id: sessionId,
      status: "active" as const,
      continuation_transport: "polling" as const,
      binding_epoch: 4,
    };
    rememberReasoningBinding({ ...activeBinding, status: "pending_claim" });
    const steeringBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/reasoning-bindings/steering/current")) {
        steeringBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ ok: true, binding: activeBinding, event: { delivery_state: "pending" } }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, binding: activeBinding }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    render(<HelixAskMinimalRuntimeShell contextId="ctx:pending-binding" />);
    fireEvent.change(screen.getByLabelText("Composer destination"), {
      target: { value: "bound_agent" },
    });
    fireEvent.change(screen.getByLabelText("Ask Helix"), {
      target: { value: "Verify before dispatch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit prompt" }));

    await waitFor(() => expect(steeringBodies).toHaveLength(1));
    expect(steeringBodies[0]).toMatchObject({
      instruction_text: "Verify before dispatch",
    });
  });
});
