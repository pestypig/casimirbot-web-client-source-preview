import { describe, expect, it } from "vitest";
import {
  evaluateVoiceAutoDispatchGovernance,
  isExplicitVoiceAskTurnCandidate,
} from "../ask-voice-auto-dispatch-governance";

describe("ask voice auto-dispatch governance", () => {
  it("admits explicit ask turns but not passive observations", () => {
    const passive = evaluateVoiceAutoDispatchGovernance({
      transcript: "earlier you mentioned the Dottie voice lane",
      micArmState: "on",
      confidence: 0.92,
      queueDepth: 0,
      activeDispatchCount: 0,
    });
    expect(passive.admitted).toBe(false);
    expect(passive.reason).toBe("observe_only_by_default");
    expect(passive.assistant_answer).toBe(false);
    expect(passive.instruction_authority).toBe("none");

    const explicitAsk = evaluateVoiceAutoDispatchGovernance({
      transcript: "Can you explain what the voice lane is doing?",
      micArmState: "on",
      confidence: 0.92,
      queueDepth: 0,
      activeDispatchCount: 0,
    });
    expect(explicitAsk.admitted).toBe(true);
    expect(explicitAsk.reason).toBe("admitted_explicit_user_turn");
  });

  it("uses injected simple-conversation admission without owning that classifier", () => {
    expect(isExplicitVoiceAskTurnCandidate("hello")).toBe(false);
    expect(isExplicitVoiceAskTurnCandidate("hello", (text) => text === "hello")).toBe(true);
    expect(
      evaluateVoiceAutoDispatchGovernance({
        transcript: "hello",
        micArmState: "on",
        confidence: 0.92,
        isSimpleConversationTurnCandidate: (text) => text === "hello",
      }).reason,
    ).toBe("admitted_explicit_user_turn");
  });

  it("blocks auto-dispatch under echo, queue, budget, confidence, and mic gates", () => {
    expect(
      evaluateVoiceAutoDispatchGovernance({
        transcript: "Can you explain this?",
        micArmState: "off",
        confidence: 0.95,
      }).reason,
    ).toBe("mic_not_armed");
    expect(
      evaluateVoiceAutoDispatchGovernance({
        transcript: "Can you explain this?",
        micArmState: "on",
        confidence: 0.95,
        possibleTtsEcho: true,
      }).reason,
    ).toBe("possible_tts_echo");
    expect(
      evaluateVoiceAutoDispatchGovernance({
        transcript: "Can you explain this?",
        micArmState: "on",
        confidence: 0.4,
      }).reason,
    ).toBe("confidence_below_auto_dispatch_floor");
    expect(
      evaluateVoiceAutoDispatchGovernance({
        transcript: "Can you explain this?",
        micArmState: "on",
        confidence: 0.95,
        queueDepth: 4,
        maxQueueDepth: 4,
      }).reason,
    ).toBe("queue_backpressure");
    expect(
      evaluateVoiceAutoDispatchGovernance({
        transcript: "Can you explain this?",
        micArmState: "on",
        confidence: 0.95,
        activeDispatchCount: 3,
        maxAutoDispatchPerWindow: 3,
      }).reason,
    ).toBe("auto_dispatch_budget_exceeded");
  });

  it("admits forced reasoning after workstation with a distinct reason", () => {
    expect(
      evaluateVoiceAutoDispatchGovernance({
        transcript: "continue",
        micArmState: "on",
        forceReasoningAfterWorkstation: true,
      }).reason,
    ).toBe("admitted_forced_reasoning");
  });
});
