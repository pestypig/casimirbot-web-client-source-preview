import { describe, expect, it } from "vitest";
import {
  HELIX_REALTIME_GROUNDED_FEEDBACK_BINDING_SCHEMA,
  type HelixRealtimeGroundedFeedbackBindingV1,
} from "@shared/contracts/helix-realtime-stage-play.v1";
import { buildHelixAskConsoleBackendTurnPayloadCore } from "../HelixAskRequestEnvelope";
import { readHelixAskRealtimeGroundedFeedbackBinding } from "../HelixAskRealtimeGroundedFeedbackBinding";
import type { HelixAskRouteMetadata } from "@/lib/helix/ask-prompt-launch";

const binding: HelixRealtimeGroundedFeedbackBindingV1 = {
  schema: HELIX_REALTIME_GROUNDED_FEEDBACK_BINDING_SCHEMA,
  handoff_id: "realtime-stage-play-handoff:test",
  realtime_session_id: "realtime:test",
  thread_id: "helix-ask:desktop",
  transcript_observation_ref: "realtime-transcript-observation:test",
  worker_admission_id: "realtime-worker-admission:test",
  issued_at_ms: 1_000,
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
};

describe("Helix Ask Realtime grounded feedback binding", () => {
  it("promotes the server-issued route binding into the backend Ask envelope", () => {
    const routeMetadata = {
      schema: "helix.ask.route_metadata.v1",
      source: "realtime_stage_play",
      invocationKind: "stage_play_realtime_transcript_handoff",
      realtime_grounded_feedback_binding: binding,
    };
    expect(readHelixAskRealtimeGroundedFeedbackBinding(routeMetadata)).toEqual(binding);

    const payload = buildHelixAskConsoleBackendTurnPayloadCore({
      sessionId: "helix-ask:desktop",
      agentRuntime: "codex",
      traceId: "trace:test",
      turnId: "ask:test",
      maxTokens: 800,
      question: "Which panel is active?",
      routeMetadata: routeMetadata as unknown as HelixAskRouteMetadata,
    });
    expect(payload).toMatchObject({
      route_metadata: routeMetadata,
      realtimeGroundedFeedbackBinding: binding,
      realtime_grounded_feedback_binding: binding,
    });
  });

  it("does not promote a malformed or authority-bearing client candidate", () => {
    const routeMetadata = {
      schema: "helix.ask.route_metadata.v1",
      source: "realtime_stage_play",
      invocationKind: "stage_play_realtime_transcript_handoff",
      realtime_grounded_feedback_binding: {
        ...binding,
        answer_authority: true,
      },
    };
    expect(readHelixAskRealtimeGroundedFeedbackBinding(routeMetadata)).toBeNull();
    const payload = buildHelixAskConsoleBackendTurnPayloadCore({
      agentRuntime: "codex",
      traceId: "trace:test",
      turnId: "ask:test",
      maxTokens: 800,
      question: "Which panel is active?",
      routeMetadata: routeMetadata as unknown as HelixAskRouteMetadata,
    });
    expect(payload).not.toHaveProperty("realtime_grounded_feedback_binding");
  });
});
