// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentGoalSessionV1 } from "@shared/contracts/workstation-goal-context.v1";
import { WORKSTATION_AGENT_GOAL_DEFAULT_FINAL_REPORT_REQUIREMENTS } from "@shared/contracts/workstation-goal-context.v1";

import { HelixAskAttachmentStrip } from "@/components/helix/ask-console/HelixAskAttachmentStrip";
import { HelixAskConsoleRuntimeShell } from "@/components/helix/ask-console/HelixAskConsoleRuntimeShell";
import { HelixAskContextCapsulePreview } from "@/components/helix/ask-console/HelixAskContextCapsulePreview";
import { HelixAskGoalPill } from "@/components/helix/ask-console/HelixAskGoalPill";
import { HelixAskMinimalRuntimeShell } from "@/components/helix/ask-console/HelixAskMinimalRuntimeShell";
import { HelixAskObserverLanePanel } from "@/components/helix/ask-console/HelixAskObserverLane";
import { HelixAskSituationRoomSourcePanel } from "@/components/helix/ask-console/HelixAskSituationRoomSourcePanel";
import { HelixAskSteeringQueuePanel } from "@/components/helix/ask-console/HelixAskSteeringQueuePanel";
import {
  HelixAskTranscriptConfirmationPanel,
  HelixAskVoiceCommandConfirmationPanel,
} from "@/components/helix/ask-console/HelixAskVoiceConfirmationPanel";
import { HelixAskVoiceLevelMonitor } from "@/components/helix/ask-console/HelixAskVoiceLevelMonitor";
import { HelixAskVoiceStatusPill } from "@/components/helix/ask-console/HelixAskStatusLine";
import {
  HELIX_ASK_LANGUAGE_MODEL_PROFILE_STORAGE_KEY,
  HELIX_ASK_PINNED_LANGUAGE_MODEL_STORAGE_KEY,
} from "@/components/helix/ask-console/HelixAskLanguageModelPreference";
import { launchHelixAskPrompt } from "@/lib/helix/ask-prompt-launch";
import type {
  HelixAskMinimalRuntimeControlActions,
  HelixAskMinimalRuntimeControlPayload,
} from "@/components/helix/ask-console/HelixAskMinimalRuntimeControls";
import { useAgiChatStore } from "@/store/useAgiChatStore";

afterEach(() => {
  cleanup();
  useAgiChatStore.setState({ sessions: {}, activeId: undefined });
  window.localStorage.removeItem(HELIX_ASK_LANGUAGE_MODEL_PROFILE_STORAGE_KEY);
  window.localStorage.removeItem(HELIX_ASK_PINNED_LANGUAGE_MODEL_STORAGE_KEY);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HelixAskMinimalRuntimeShell", () => {
  it("creates one local Helix chat from the first submitted message without claiming provider-task creation", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("local-helix-chat")
      .mockReturnValueOnce("first-message-turn")
      .mockReturnValueOnce("first-message-user")
      .mockReturnValueOnce("first-message-assistant");
    const runTurn = vi.fn(async (payload) => ({
      selected_final_answer: "Local Helix response.",
      turn_id: payload.turnId,
    }));

    render(<HelixAskMinimalRuntimeShell contextId="ctx:first-message" runTurn={runTurn} />);

    expect(Object.keys(useAgiChatStore.getState().sessions)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Ask Helix"), {
      target: { value: "Create this local conversation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit prompt" }));

    await waitFor(() => expect(screen.getByText("Local Helix response.")).toBeTruthy());
    const state = useAgiChatStore.getState();
    expect(Object.keys(state.sessions)).toEqual(["local-helix-chat"]);
    expect(state.activeId).toBe("local-helix-chat");
    expect(state.sessions["local-helix-chat"]).toMatchObject({
      contextId: "ctx:first-message",
      title: "Create this local conversation",
    });
    expect(runTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "local-helix-chat",
        workspace_context_snapshot: expect.objectContaining({
          sessionId: "local-helix-chat",
        }),
      }),
      expect.any(Function),
    );
    expect(screen.getByText(/Helix Ask governed turn/i)).toBeTruthy();
    expect(screen.queryByText(/provider task created/i)).toBeNull();
  });

  it("enables the shared recrowned carousel when minimal-runtime controls overflow", async () => {
    const observers: ResizeObserverMock[] = [];
    class ResizeObserverMock implements ResizeObserver {
      readonly targets = new Set<Element>();

      constructor(readonly callback: ResizeObserverCallback) {
        observers.push(this);
      }

      observe(target: Element) {
        this.targets.add(target);
      }

      unobserve(target: Element) {
        this.targets.delete(target);
      }

      disconnect() {
        this.targets.clear();
      }
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    render(<HelixAskMinimalRuntimeShell contextId="ctx" />);

    const viewport = screen.getByTestId(
      "helix-ask-action-carousel-viewport",
    ) as HTMLDivElement;
    const track = screen.getByTestId("helix-ask-action-carousel-track");
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 800 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    });
    const observer = observers[0];
    if (!observer) throw new Error("Expected the shared carousel observer");
    expect(observer.targets.has(viewport)).toBe(true);
    expect(observer.targets.has(track)).toBe(true);

    act(() => {
      observer.callback(
        [{ target: track } as unknown as ResizeObserverEntry],
        observer,
      );
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Scroll Ask controls right" }),
      ).toBeEnabled();
    });
  });

  it("submits the selected language model profile from the recrowned minimal shell", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("minimal-shell-language-profile");
    const runTurn = vi.fn(async (payload) => ({
      selected_final_answer: "Deep profile received.",
      turn_id: payload.turnId,
    }));

    render(<HelixAskMinimalRuntimeShell contextId="ctx" runTurn={runTurn} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose Ask AI mode" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Deep/ }));
    fireEvent.change(screen.getByLabelText("Ask Helix"), {
      target: { value: "Use the strongest reasoning available" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit prompt" }));

    await waitFor(() => {
      expect(screen.getByText("Deep profile received.")).toBeTruthy();
    });
    expect(runTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        languageModelProfile: "deep",
        language_model_profile: "deep",
        question: "Use the strongest reasoning available",
      }),
      expect.any(Function),
    );
    expect(window.localStorage.getItem(HELIX_ASK_LANGUAGE_MODEL_PROFILE_STORAGE_KEY)).toBe("deep");
  });

  it("pins the lowest-cost supported Codex model in the UI and submits the explicit model-selection contract", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("minimal-shell-pinned-model");
    const runTurn = vi.fn(async (payload) => ({
      selected_final_answer: "Pinned model received.",
      turn_id: payload.turnId,
    }));

    render(<HelixAskMinimalRuntimeShell contextId="ctx" runTurn={runTurn} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose Ask AI mode" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /GPT-5.4 mini/ }));
    fireEvent.change(screen.getByLabelText("Ask Helix"), {
      target: { value: "Check this agent workflow at low cost" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit prompt" }));

    await waitFor(() => {
      expect(screen.getByText("Pinned model received.")).toBeTruthy();
    });
    expect(runTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        languageModelSelection: { mode: "pinned", model: "gpt-5.4-mini" },
        language_model_selection: { mode: "pinned", model: "gpt-5.4-mini" },
        question: "Check this agent workflow at low cost",
      }),
      expect.any(Function),
    );
    expect(window.localStorage.getItem(HELIX_ASK_PINNED_LANGUAGE_MODEL_STORAGE_KEY)).toBe("gpt-5.4-mini");
  });

  it("submits through injected transport and binds latest visible turn controls without HelixAskPill", async () => {
    window.history.pushState({}, "", "/desktop?doc=docs/research/nhm2-current-status-whitepaper.md");
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("minimal-shell-turn");
    const copied: HelixAskMinimalRuntimeControlPayload[] = [];
    const debugCopied: HelixAskMinimalRuntimeControlPayload[] = [];
    const readAloud: HelixAskMinimalRuntimeControlPayload[] = [];
    const controlActions: HelixAskMinimalRuntimeControlActions = {
      copyFinal: (payload) => copied.push(payload),
      debugCopy: (payload) => debugCopied.push(payload),
      readAloud: (payload) => readAloud.push(payload),
    };
    const runTurn = vi.fn(async (payload) => ({
      selected_final_answer: "Minimal shell final answer.",
      turn_id: payload.turnId,
      agent_runtime: payload.agentRuntime,
      debug: {
        debug_export_ref: `debug:${payload.turnId}`,
        contextFiles: payload.contextFiles,
      },
    }));

    render(
      <HelixAskMinimalRuntimeShell
        contextId="ctx"
        runTurn={runTurn}
        controlActions={controlActions}
      />,
    );

    fireEvent.change(screen.getByLabelText("Ask Helix"), {
      target: { value: "Summarize the current whitepaper" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit prompt" }));

    await waitFor(() => {
      expect(screen.getByText("Minimal shell final answer.")).toBeTruthy();
    });
    expect(runTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: "ask:minimal-shell-turn",
        agentRuntime: "codex",
        question: "Summarize the current whitepaper",
        contextFiles: ["docs/research/nhm2-current-status-whitepaper.md"],
      }),
      expect.any(Function),
    );

    fireEvent.click(screen.getByTestId("helix-ask-latest-copy-final"));
    fireEvent.click(screen.getByTestId("helix-ask-latest-debug-copy"));
    fireEvent.click(screen.getByTestId("helix-ask-latest-read-aloud"));

    expect(copied).toHaveLength(1);
    expect(debugCopied).toHaveLength(1);
    expect(readAloud).toHaveLength(1);
    expect(copied[0]).toMatchObject({
      replyId: "ask:minimal-shell-turn",
      turnId: "ask:minimal-shell-turn",
      isLatest: true,
      finalAnswerText: "Minimal shell final answer.",
    });
    expect(JSON.parse(debugCopied[0]?.debugCopyText ?? "{}")).toMatchObject({
      schema: "helix.ask.minimal_runtime.debug_copy.v1",
      turn_id: "ask:minimal-shell-turn",
      final_answer: "Minimal shell final answer.",
      debug: {
        debug_export_ref: "debug:ask:minimal-shell-turn",
      },
    });
    expect(readAloud[0]?.readAloudText).toBe("Minimal shell final answer.");

    const sessions = Object.values(useAgiChatStore.getState().sessions);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.contextId).toBe("ctx");
    expect(sessions[0]?.messages.map((message) => ({
      role: message.role,
      content: message.content,
      traceId: message.traceId,
      helixAsk: message.helixAsk,
    }))).toEqual([
      {
        role: "user",
        content: "Summarize the current whitepaper",
        traceId: "ask:minimal-shell-turn",
        helixAsk: undefined,
      },
      {
        role: "assistant",
        content: "Minimal shell final answer.",
        traceId: "ask:minimal-shell-turn",
        helixAsk: expect.objectContaining({
          schema: "helix.ask.chat_backend_observation.v1",
          backend_ask_call_attempted: true,
          backend_ask_entrypoint_observed: true,
          use_backend_ask_turn_entrypoint: true,
          turn_id: "ask:minimal-shell-turn",
        }),
      },
    ]);
  });

  it("consumes launched postulate prompts through the recrowned backend runtime path", async () => {
    window.history.pushState({}, "", "/desktop?doc=docs/research/nhm2-current-status-whitepaper.md");
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("launched-postulate-prompt")
      .mockReturnValueOnce("minimal-shell-launched-postulate-turn");
    const runTurn = vi.fn(async (payload) => ({
      selected_final_answer: "Postulate review completed.",
      turn_id: payload.turnId,
      final_answer_source: "postulate_review",
    }));

    render(<HelixAskMinimalRuntimeShell contextId="ctx" runTurn={runTurn} />);

    launchHelixAskPrompt({
      question: "/postulate\nReview this postulate candidate for Postulate Board submission.",
      autoSubmit: true,
      forceReasoningDispatch: true,
      routeMetadata: {
        schema: "helix.ask.route_metadata.v1",
        source: "postulate_final_answer_button",
        invocationKind: "postulate_final_answer_review",
        sourceTarget: "postulate_board",
        requiredCanonicalGoal: "postulate_runtime_review_then_gated_submit",
        allowedCapabilities: ["postulate.submit_proposal"],
        forbiddenCapabilities: [],
        evidenceRefs: ["scientific_image_evidence_sidecar:test"],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Postulate review completed.")).toBeTruthy();
    });
    expect(runTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: expect.stringMatching(/^ask:/),
        question: "/postulate\nReview this postulate candidate for Postulate Board submission.",
        forceReasoningDispatch: true,
        force_reasoning_dispatch: true,
        requiresBackendAskEntrypoint: true,
        requires_backend_ask_entrypoint: true,
        ask_entrypoint_required: true,
        route_metadata: expect.objectContaining({
          source: "postulate_final_answer_button",
          invocationKind: "postulate_final_answer_review",
          evidenceRefs: ["scientific_image_evidence_sidecar:test"],
        }),
        workspace_context_snapshot: expect.objectContaining({
          activeDocPath: "docs/research/nhm2-current-status-whitepaper.md",
        }),
      }),
      expect.any(Function),
    );
    expect(useAgiChatStore.getState().sessions[useAgiChatStore.getState().activeId ?? ""]?.messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: "/postulate\nReview this postulate candidate for Postulate Board submission.",
      }),
      expect.objectContaining({
        role: "assistant",
        content: "Postulate review completed.",
        helixAsk: expect.objectContaining({
          backend_ask_call_attempted: true,
          backend_ask_entrypoint_observed: true,
          use_backend_ask_turn_entrypoint: true,
        }),
      }),
    ]);
  });

  it("hydrates prior context chat replies into the minimal shell", async () => {
    useAgiChatStore.setState({
      sessions: {
        "session-existing": {
          id: "session-existing",
          title: "Helix Ask",
          createdAt: "2026-06-29T12:00:00.000Z",
          updatedAt: "2026-06-29T12:02:00.000Z",
          personaId: "default",
          contextId: "ctx",
          messages: [
            {
              id: "user-1",
              role: "user",
              content: "What is the current status?",
              at: "2026-06-29T12:00:00.000Z",
              traceId: "turn-existing",
            },
            {
              id: "assistant-1",
              role: "assistant",
              content: "Hydrated prior answer.",
              at: "2026-06-29T12:01:00.000Z",
              traceId: "turn-existing",
            },
          ],
        },
      },
      activeId: undefined,
    });

    render(<HelixAskMinimalRuntimeShell contextId="ctx" />);

    await waitFor(() => {
      expect(screen.getByText("Hydrated prior answer.")).toBeTruthy();
    });
    expect(screen.getByText("What is the current status?")).toBeTruthy();
    expect(useAgiChatStore.getState().activeId).toBe("session-existing");
  });

  it("renders runtime provider, lane, backend, tool, terminal, and debug projection for the latest turn", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("runtime-provider-summary-turn");
    const runTurn = vi.fn(async (payload) => ({
      selected_final_answer: "The result is 72.",
      turn_id: payload.turnId,
      agent_runtime: "codex",
      selected_agent_provider: {
        id: "codex",
        label: "Codex Workstation Mode",
      },
      agent_runtime_selection_trace: {
        adapter_boundary: "helix_agent_provider_edge",
      },
      capability_lane_manifest: {
        schema: "helix.capability_lane_manifest.v1",
        selected_runtime_agent_provider: "codex",
        lanes: [
          {
            lane_id: "workstation_tool_reference",
            status: "available",
            backend_family: "helix_workstation_gateway",
          },
          {
            lane_id: "live_translation",
            status: "unconfigured",
            backend_family: "google_gemini",
          },
        ],
        lane_ids: ["workstation_tool_reference", "live_translation"],
      },
      capability_lane_statuses: {
        workstation_tool_reference: "available",
        live_translation: "unconfigured",
      },
      capability_lane_resolve_trace_shape: {
        schema: "helix.capability_lane_resolve_trace.v1",
        requested_lane: "live_translation",
        lane_status: "unconfigured",
        resolved_backend_provider: null,
        resolved_model_or_service: null,
        blocked_reason: "backend_provider_key_or_endpoint_not_configured",
      },
      workstation_gateway_call_results: [
        {
          ok: true,
          capability_id: "scientific-calculator.solve_expression",
          gateway_admission: {
            requested_capability: "scientific-calculator.solve_expression",
          },
        },
      ],
      capability_lane_call_results: [
        {
          ok: true,
          capability: "live_translation.translate_text",
          translated_text: "hola",
          observation: {
            observation_ref: "ask:runtime-provider-summary-turn:live-translation:obs",
            target_language: "es",
            source_id: "docs:current",
            chunk_id: "chunk-1",
            freshness_status: "fresh",
            projection_target: "docs_chunk",
            translated_text: "hola",
            cancel_requested: false,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          observation_packet: {
            status: "succeeded",
            observation_ref: "ask:runtime-provider-summary-turn:live-translation:obs",
            state_delta: {
              live_translation_chunk: {
                source_id: "docs:current",
                chunk_id: "chunk-1",
                freshness_status: "fresh",
                projection_target: "docs_chunk",
                cancel_requested: false,
                terminal_eligible: false,
                assistant_answer: false,
                raw_content_included: false,
              },
            },
          },
        },
        {
          ok: true,
          capability: "utility_text.normalize_text",
          normalized_text: "hello workstation",
          observation: {
            observation_ref: "ask:runtime-provider-summary-turn:utility-text:obs",
            normalization_mode: "lowercase",
            normalized_text: "hello workstation",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          observation_packet: {
            status: "succeeded",
            observation_ref: "ask:runtime-provider-summary-turn:utility-text:obs",
            observation_summary: "Utility text normalization ready: lowercase.",
          },
        },
        {
          ok: true,
          capability: "workstation_tool_reference.list_capabilities",
          capability_count: 42,
          observation: {
            observation_ref: "ask:runtime-provider-summary-turn:workstation-tool-reference:obs",
            gateway_mode: "act",
            capability_count: 42,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          observation_packet: {
            status: "succeeded",
            observation_ref: "ask:runtime-provider-summary-turn:workstation-tool-reference:obs",
            observation_summary: "Workstation gateway catalog ready: 42 capabilities.",
          },
        },
      ],
      capability_lane_goal_binding_debug_summaries: [
        {
          schema: "helix.capability_lane.goal_binding_debug_summary.v1",
          goal_binding_id: "goal-binding-runtime-provider-summary",
          goal_id: "goal:translate-docs",
          lane_session_id: "lane-session-runtime-provider-summary",
          lane_id: "live_translation",
          selected_runtime_agent_provider: "codex",
          selected_backend_provider: "live_translation.local_runtime",
          session_status: "running",
          session_health: "healthy",
          source_id: "docs:current",
          last_observation_ref: "ask:runtime-provider-summary-turn:live-translation:goal-obs",
          binding_status: "bound",
          terminal_authority_status: "pending_helix_terminal_authority",
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      ],
      runtime_goal_command: {
        command: "wake",
        goal_id: "goal:translate-docs",
      },
      runtime_goal_session: {
        goal_id: "goal:translate-docs",
        status: "waiting",
        runtime_agent_provider: "codex",
        runtime_session_id: "runtime-session-translate-docs",
        latest_observation_refs: ["ask:runtime-provider-summary-turn:visible-doc:obs"],
        latest_receipt_refs: ["ask:runtime-provider-summary-turn:visible-doc:receipt"],
        terminal_authority_status: "authorized",
      },
      runtime_goal_debug_export: {
        goal_id: "goal:translate-docs",
        runtime_agent_provider: "codex",
        runtime_session_id: "runtime-session-translate-docs",
        wake_event_kind: "manual_resume",
        terminal_authority_status: "authorized",
      },
      terminal_artifact_kind: "workstation_tool_evaluation",
      debug_export_ref: "ask:runtime-provider-summary-turn:debug-export",
      debug: {},
    }));

    render(
      <HelixAskMinimalRuntimeShell
        contextId="ctx"
        runTurn={runTurn}
      />,
    );

    fireEvent.change(screen.getByLabelText("Ask Helix"), {
      target: { value: "Use the calculator for 8*9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit prompt" }));

    await waitFor(() => {
      expect(screen.getByText("The result is 72.")).toBeTruthy();
    });

    const summary = screen.getByTestId("helix-ask-minimal-runtime-provider-summary");
    expect(summary).toHaveTextContent("Runtime trace");
    expect(summary).toHaveTextContent("codex / Codex Workstation Mode");
    expect(summary).toHaveTextContent("helix_agent_provider_edge");
    expect(summary).toHaveTextContent("workstation_tool_reference: available (helix_workstation_gateway)");
    expect(summary).toHaveTextContent("live_translation: unconfigured (google_gemini)");
    expect(summary).toHaveTextContent("lane live_translation");
    expect(summary).toHaveTextContent("status unconfigured");
    expect(summary).toHaveTextContent("backend_provider_key_or_endpoint_not_configured");
    expect(summary).toHaveTextContent("scientific-calculator.solve_expression (ok)");
    expect(summary).toHaveTextContent("live_translation");
    expect(summary).toHaveTextContent("target docs_chunk");
    expect(summary).toHaveTextContent("language es");
    expect(summary).toHaveTextContent("source docs:current");
    expect(summary).toHaveTextContent("chunk chunk-1");
    expect(summary).toHaveTextContent("freshness fresh");
    expect(summary).toHaveTextContent("text hola");
    expect(summary).toHaveTextContent("ask:runtime-provider-summary-turn:live-translation:obs");
    expect(summary).toHaveTextContent("utility_text");
    expect(summary).toHaveTextContent("normalize_text");
    expect(summary).toHaveTextContent("mode lowercase");
    expect(summary).toHaveTextContent("text hello workstation");
    expect(summary).toHaveTextContent("ask:runtime-provider-summary-turn:utility-text:obs");
    expect(summary).toHaveTextContent("workstation_tool_reference");
    expect(summary).toHaveTextContent("list_capabilities");
    expect(summary).toHaveTextContent("mode act");
    expect(summary).toHaveTextContent("count 42");
    expect(summary).toHaveTextContent("ask:runtime-provider-summary-turn:workstation-tool-reference:obs");
    expect(summary).toHaveTextContent("Goal-bound lanes");
    expect(summary).toHaveTextContent("goal goal:translate-docs");
    expect(summary).toHaveTextContent("session lane-session-runtime-provider-summary");
    expect(summary).toHaveTextContent("status bound/running");
    expect(summary).toHaveTextContent("backend live_translation.local_runtime");
    expect(summary).toHaveTextContent("observation ask:runtime-provider-summary-turn:live-translation:goal-obs");
    expect(summary).toHaveTextContent("authority pending_helix_terminal_authority");
    expect(summary).toHaveTextContent("observation-only");
    expect(summary).toHaveTextContent("Runtime goal");
    expect(summary).toHaveTextContent("status waiting");
    expect(summary).toHaveTextContent("runtime codex");
    expect(summary).toHaveTextContent("session runtime-session-translate-docs");
    expect(summary).toHaveTextContent("command wake");
    expect(summary).toHaveTextContent("wake manual_resume");
    expect(summary).toHaveTextContent("observation ask:runtime-provider-summary-turn:visible-doc:obs");
    expect(summary).toHaveTextContent("receipt ask:runtime-provider-summary-turn:visible-doc:receipt");
    expect(summary).toHaveTextContent("terminal authority authorized");
    expect(summary).toHaveTextContent("debug export available");
    expect(summary).toHaveTextContent("workstation_tool_evaluation");
    expect(summary).toHaveTextContent("ask:runtime-provider-summary-turn:debug-export");
  });

  it("submits through the runtime shell minimal implementation without rendering the legacy bridge", async () => {
    window.history.pushState({}, "", "/desktop?doc=docs/current.md");
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("runtime-shell-turn");
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const runTurn = vi.fn(async (payload, onEvent) => {
      onEvent?.({ event: "turn_delta", data: { chunk: "working" } });
      return {
        selected_final_answer: "Runtime shell minimal answer.",
        turn_id: payload.turnId,
        debug: {
          stream_used: true,
        },
      };
    });

    render(
      <HelixAskConsoleRuntimeShell
        contextId="ctx"
        layoutVariant="dock"
        runtimeImplementation="minimal_runtime_shell"
        minimalRuntime={{
          runTurn,
          visibleSurface: {
            voiceLevelMonitor: (
              <HelixAskVoiceLevelMonitor
                visible
                maxHeightPx={48}
                level={0.75}
                signalState="speech"
              />
            ),
            goalPill: (
              <HelixAskGoalPill
                session={{
                  schemaVersion: "helix.agent_goal_session.v1",
                  goalId: "goal-1",
                  threadId: "thread-1",
                  objective: "Keep the operator surface visible while recrowning.",
                  userVisibleSummary: "Recrown visible console surface",
                  status: "active",
                  sourceRefs: [],
                  loopRefs: [],
                  constructRefs: [],
                  contextFeeds: [],
                  allowedActuators: [],
                  cadence: { kind: "manual" },
                  stopConditions: [],
                  checkpoints: [],
                  authority: {
                    assistantAnswer: false,
                    finalReportsRequireTerminalAuthority: true,
                    finalReportRequirements: WORKSTATION_AGENT_GOAL_DEFAULT_FINAL_REPORT_REQUIREMENTS,
                  },
                } satisfies AgentGoalSessionV1}
                expanded={false}
                busyAction={null}
                error={null}
                onToggleExpanded={vi.fn()}
                onAction={vi.fn()}
              />
            ),
            steeringQueue: (
              <HelixAskSteeringQueuePanel
                items={[
                  {
                    key: "queue-1",
                    label: "Docs context handoff",
                    detail: "Keep active document context attached to the turn.",
                    meta: "source admission",
                    status: "next",
                    tone: "cyan",
                    evidenceRefs: ["doc:current"],
                    createdAtMs: 1,
                  },
                ]}
                activeCount={1}
                expanded={false}
                onToggleExpanded={vi.fn()}
              />
            ),
            supplementStack: {
              attachments: (
                <HelixAskAttachmentStrip
                  items={[
                    {
                      attachment: {
                        id: "attachment-1",
                        kind: "text",
                        fileName: "notes.md",
                        status: "ready",
                      },
                      check: { can_submit: true },
                    },
                  ]}
                  onRemove={vi.fn()}
                />
              ),
              contextCapsule: (
                <HelixAskContextCapsulePreview
                  preview={{
                    id: "capsule-1",
                    loading: false,
                  }}
                  autoApplied
                />
              ),
              situationRoomSource: (
                <HelixAskSituationRoomSourcePanel
                  visible
                  label="docs-viewer"
                  status="captured"
                  sourceCount={2}
                  transcriptPreview="Current document context is ready for the next Ask turn."
                  onStopDisplayAudio={vi.fn()}
                  clipText={(text, limit) => (text.length > limit ? `${text.slice(0, limit)}...` : text)}
                />
              ),
              voiceStatus: <HelixAskVoiceStatusPill label="listening" state="listening" />,
              voiceCommandConfirmation: (
                <HelixAskVoiceCommandConfirmationPanel
                  visible
                  actionLabel="read latest answer"
                  transcript="read this answer aloud"
                  countdownSec={3}
                  onAccept={vi.fn()}
                  onCancel={vi.fn()}
                  clipText={(text, limit) => (text.length > limit ? `${text.slice(0, limit)}...` : text)}
                />
              ),
              transcriptConfirmation: (
                <HelixAskTranscriptConfirmationPanel
                  visible
                  transcript="Use the active doc"
                  countdownSec={2}
                  onAccept={vi.fn()}
                  onRetry={vi.fn()}
                  clipText={(text, limit) => (text.length > limit ? `${text.slice(0, limit)}...` : text)}
                />
              ),
              observerLane: (
                <HelixAskObserverLanePanel
                  visible
                  events={[
                    {
                      id: "observer-1",
                      text: "Observed current desktop focus.",
                      tsMs: 1,
                      traceId: "trace-observer",
                    },
                  ]}
                  clipText={(text, limit) => (text.length > limit ? `${text.slice(0, limit)}...` : text)}
                />
              ),
            },
          },
        }}
      />,
    );

    const minimalShell = await screen.findByTestId(
      "helix-ask-minimal-runtime-shell",
    );
    expect(minimalShell).toBeTruthy();
    expect(minimalShell.parentElement).toHaveClass("min-h-0");
    expect(screen.getByTestId("helix-ask-goal-pill")).toHaveTextContent("Recrown visible console surface");
    expect(screen.getByTestId("helix-ask-steering-queue")).toHaveTextContent("Docs context handoff");
    expect(screen.getByText("notes.md")).toBeTruthy();
    expect(screen.getByText("capsule")).toBeTruthy();
    expect(screen.getByText("auto-applied")).toBeTruthy();
    expect(screen.getByText("Situation Room Source")).toBeTruthy();
    expect(screen.getByText("docs-viewer / captured")).toBeTruthy();
    expect(screen.getByLabelText("Voice input level meter: speech-level signal")).toBeTruthy();
    expect(screen.getByText("listening")).toBeTruthy();
    expect(screen.getByText("Voice command")).toBeTruthy();
    expect(screen.getByText("Detected: read latest answer")).toBeTruthy();
    expect(screen.getByText("Confirm transcript")).toBeTruthy();
    expect(screen.getByText("Observer lane")).toBeTruthy();
    expect(screen.getByText("Observed current desktop focus.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Ask Helix"), {
      target: { value: "Use the active doc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit prompt" }));

    await waitFor(() => {
      expect(screen.getByText("Runtime shell minimal answer.")).toBeTruthy();
    });
    expect(screen.getByTestId("helix-ask-runtime-status-line")).toHaveTextContent("Final answer ready.");
    expect(screen.getByTestId("helix-ask-reply-list-bottom").parentElement).toHaveClass("min-h-0", "flex-1");
    expect(runTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: "ask:runtime-shell-turn",
        question: "Use the active doc",
        contextFiles: ["docs/current.md"],
      }),
      expect.any(Function),
    );
    expect(screen.queryByTestId("helix-ask-pill")).toBeNull();

    fireEvent.click(screen.getByTestId("helix-ask-latest-debug-copy"));

    await waitFor(() => {
      expect(screen.getByTestId("helix-debug-export-drawer")).toBeTruthy();
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"turn_id": "ask:runtime-shell-turn"'));
    expect(screen.getByTestId<HTMLTextAreaElement>("helix-debug-export-json").value).toContain(
      '"turn_id": "ask:runtime-shell-turn"',
    );
  });

  it("runs the recrowned voice confirmation countdown without the legacy bridge", () => {
    vi.useFakeTimers();
    const onCommandAutoConfirm = vi.fn();

    render(
      <HelixAskMinimalRuntimeShell
        contextId="ctx"
        visibleSurface={{
          voiceConfirmationRuntime: {
            micEnabled: true,
            commandCandidate: {
              id: "minimal-command:send",
              action: "send",
              transcript: "send it",
            },
            transcriptCandidate: null,
            confirmV2Active: true,
            lowQualitySpeechProbability: 0.45,
            lowQualitySnrDb: 6,
            readTranscriptActivity: () => ({ speechActive: false, queuedSegmentCount: 0 }),
            onCommandAutoConfirm,
            onCommandPreempted: vi.fn(),
            onTranscriptAutoConfirm: vi.fn(),
            clipText: (text, limit) => text.slice(0, limit),
            describeCommandAction: (action) => action,
            onCommandAccept: vi.fn(),
            onCommandCancel: vi.fn(),
            onTranscriptAccept: vi.fn(),
            onTranscriptRetry: vi.fn(),
            countdownMs: 3_000,
            tickMs: 1_000,
          },
        }}
      />,
    );

    expect(screen.getByText("Auto-confirming in 3s. Say \"cancel\" to stop.")).toBeTruthy();
    act(() => vi.advanceTimersByTime(3_000));
    expect(onCommandAutoConfirm).toHaveBeenCalledWith("minimal-command:send");
    expect(screen.queryByTestId("helix-ask-pill")).toBeNull();
  });
});
