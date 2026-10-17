/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HELIX_BOUND_AGENT_STEERING_RESULT_EVENT,
  publishMinecraftPlaySteeringResult,
  publishBoundAgentSteeringProgress,
  requestBoundAgentSteering,
  subscribeBoundAgentSteeringRequests,
  type HelixBoundAgentSteeringResult,
} from "../HelixBoundAgentSteeringBridge";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bound-agent Play Minecraft steering bridge", () => {
  it("delivers the same request to a full or minimal shell subscriber and publishes queued pickup", async () => {
    const dispatch = vi.fn(async () => true);
    const results: HelixBoundAgentSteeringResult[] = [];
    const onResult = (event: Event): void => {
      results.push((event as CustomEvent<HelixBoundAgentSteeringResult>).detail);
    };
    window.addEventListener(HELIX_BOUND_AGENT_STEERING_RESULT_EVENT, onResult);
    const unsubscribe = subscribeBoundAgentSteeringRequests(dispatch);

    requestBoundAgentSteering({
      requestId: "minecraft-play:test-full-shell",
      instructionText: "Inspect the exact room, then create or restore its goal and monitor.",
      origin: "typed",
      source: "minecraft_play_activation",
    });
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());

    expect(dispatch).toHaveBeenCalledWith(
      "Inspect the exact room, then create or restore its goal and monitor.",
      "typed",
      "minecraft-play:test-full-shell",
    );
    await vi.waitFor(() => expect(results).toEqual([{
      requestId: "minecraft-play:test-full-shell",
      deliveryState: "queued",
    }]));

    unsubscribe();
    window.removeEventListener(HELIX_BOUND_AGENT_STEERING_RESULT_EVENT, onResult);
  });

  it("fails closed for malformed browser events", async () => {
    const dispatch = vi.fn(async () => true);
    const unsubscribe = subscribeBoundAgentSteeringRequests(dispatch);
    window.dispatchEvent(new CustomEvent("helix:bound-agent-steering-request", {
      detail: {
        requestId: "",
        instructionText: "ignored",
        origin: "typed",
        source: "minecraft_play_activation",
      },
    }));
    await Promise.resolve();
    expect(dispatch).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("accepts an owner-reviewed managed-chat handoff and preserves an already acknowledged pickup", async () => {
    const dispatch = vi.fn(async (_text: string, _origin: "typed" | "gpt_live_finalized", requestId: string) => {
      publishBoundAgentSteeringProgress(requestId, "acknowledged");
      return true;
    });
    const states: string[] = [];
    const onResult = (event: Event) => states.push(
      (event as CustomEvent<HelixBoundAgentSteeringResult>).detail.deliveryState);
    window.addEventListener(HELIX_BOUND_AGENT_STEERING_RESULT_EVENT, onResult);
    const unsubscribe = subscribeBoundAgentSteeringRequests(dispatch);
    requestBoundAgentSteering({ requestId: "managed-chat:turn-1:review-1",
      instructionText: "Inspect the selected Minecraft player.", origin: "typed",
      source: "managed_conversation_review" });
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(states).toEqual(["acknowledged"]);
    unsubscribe();
    window.removeEventListener(HELIX_BOUND_AGENT_STEERING_RESULT_EVENT, onResult);
  });

  it("publishes terminal pickup state only for the Play Minecraft lifecycle", () => {
    const results: HelixBoundAgentSteeringResult[] = [];
    const onResult = (event: Event): void => {
      results.push((event as CustomEvent<HelixBoundAgentSteeringResult>).detail);
    };
    window.addEventListener(HELIX_BOUND_AGENT_STEERING_RESULT_EVENT, onResult);

    expect(publishMinecraftPlaySteeringResult(
      "ordinary-steering:test",
      "acknowledged",
    )).toBe(false);
    expect(publishMinecraftPlaySteeringResult(
      "minecraft-play:ack-test",
      "acknowledged",
    )).toBe(true);
    expect(publishMinecraftPlaySteeringResult(
      "minecraft-play:bounded-timeout-test",
      "unavailable",
    )).toBe(true);

    expect(results).toEqual([
      {
        requestId: "minecraft-play:ack-test",
        deliveryState: "acknowledged",
      },
      {
        requestId: "minecraft-play:bounded-timeout-test",
        deliveryState: "unavailable",
      },
    ]);
    window.removeEventListener(HELIX_BOUND_AGENT_STEERING_RESULT_EVENT, onResult);
  });
});
