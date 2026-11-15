import { describe, expect, it } from "vitest";
import type { HelixAskRouteMetadata } from "@/lib/helix/ask-prompt-launch";
import { HELIX_REALTIME_GROUNDED_FEEDBACK_BINDING_SCHEMA,
  type HelixRealtimeGroundedFeedbackBindingV1 } from "@shared/contracts/helix-realtime-stage-play.v1";
import { buildHelixAskMinimalRuntimeSubmitPlan } from "../HelixAskMinimalRuntimeSubmitPlan";
import { buildHelixAskMinimalRuntimeTurnPayload } from "../HelixAskMinimalRuntimeTransport";
import { buildHelixAskSubmitBackendEntrypointRoutePlan,
  mergeHelixAskSubmitBackendEntrypointRunOptions } from "../HelixAskSubmitBackendEntrypointOptions";

describe("Live handoff submission parity", () => {
  it.each([
    "Build a wall in Minecraft.",
    "What is the Minecraft command tool? Explain conceptually. Do not run it.",
  ])("preserves admitted provenance and runtime for %s", (question) => {
    const binding: HelixRealtimeGroundedFeedbackBindingV1 = {
      schema: HELIX_REALTIME_GROUNDED_FEEDBACK_BINDING_SCHEMA,
      handoff_id: "realtime-stage-play-handoff:parity", realtime_session_id: "realtime:parity",
      thread_id: "personal:composer", transcript_observation_ref: "realtime-transcript-observation:parity",
      worker_admission_id: "realtime-worker-admission:parity", issued_at_ms: 100,
      answer_authority: false, assistant_answer: false, terminal_eligible: false, raw_content_included: false,
    };
    const routeMetadata = {
      schema: "helix.ask.route_metadata.v1", source: "realtime_stage_play",
      invocationKind: "stage_play_realtime_transcript_handoff",
      mailboxThreadId: "helix-ask:room:shared_realtime_room:parity",
      realtime_grounded_feedback_binding: binding,
      forbiddenCapabilities: ["workstation_mutation", "workstation_action_execution",
        "realtime_provider_tool_execution"],
      source_target_intent: { must_enter_backend_ask: true, allow_client_shortcut: false,
        admitted_readonly_handoff: true },
    } satisfies HelixAskRouteMetadata;
    const baseRunOptions = { requiresBackendAskEntrypoint: true, forceReasoningDispatch: true,
      suppressWorkstationPayloadActions: true, routeMetadata };
    const merged = mergeHelixAskSubmitBackendEntrypointRunOptions({ question, baseRunOptions,
      turnId: "turn:parity", threadId: "personal:composer" });
    expect(merged).toBe(baseRunOptions);
    const route = buildHelixAskSubmitBackendEntrypointRoutePlan({ question,
      baseRunOptions: merged, turnId: "turn:parity", threadId: "personal:composer",
      manualCanaryEnabled: false });
    expect(route).toMatchObject({ hardBackendEntrypointRequired: true,
      forceReasoningDispatch: true, useBackendAskTurnEntrypoint: true });
    expect(route.routeMetadata).toBe(routeMetadata);

    const submitPlan = buildHelixAskMinimalRuntimeSubmitPlan({ draft: question,
      selectedRuntime: "helix", pendingPrompt: { ...baseRunOptions,
        promptId: "prompt:parity", question, createdAt: 100, autoSubmit: true,
        serverAdmittedRuntimeAgentProvider: "codex" } });
    const payload = buildHelixAskMinimalRuntimeTurnPayload({ submitPlan,
      sessionId: "personal:composer", turnId: "turn:parity", traceId: "trace:parity", maxTokens: 256 });
    expect(payload).toMatchObject({ agentRuntime: "codex", agent_runtime: "codex",
      requiresBackendAskEntrypoint: true, forceReasoningDispatch: true,
      suppressWorkstationPayloadActions: true });
    expect(payload?.routeMetadata).toBe(routeMetadata);
    expect(payload?.route_metadata).toBe(routeMetadata);
    expect(payload?.realtimeGroundedFeedbackBinding).toEqual(binding);
    expect(payload?.realtime_grounded_feedback_binding).toEqual(binding);
  });

  it("does not retain stale tool routing for a typed conceptual explanation", () => {
    const question = "What is the Moral Graph reflection tool? Explain conceptually. Do not run it.";
    const baseRunOptions = { requiresBackendAskEntrypoint: true, forceReasoningDispatch: true,
      suppressWorkstationPayloadActions: true, routeMetadata: {
        schema: "helix.ask.route_metadata.v1", source: "hard_tool_backend_entrypoint" } };
    const merged = mergeHelixAskSubmitBackendEntrypointRunOptions({ question, baseRunOptions,
      turnId: "turn:typed", threadId: "personal:typed" });
    expect(merged).toEqual({ suppressWorkstationPayloadActions: true });
    const route = buildHelixAskSubmitBackendEntrypointRoutePlan({ question,
      baseRunOptions: merged, turnId: "turn:typed", threadId: "personal:typed",
      manualCanaryEnabled: false });
    expect(route).toMatchObject({ hardBackendEntrypointRequired: false,
      forceReasoningDispatch: false, routeMetadata: undefined });
  });
});
