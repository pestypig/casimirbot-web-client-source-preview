import { describe, expect, it } from "vitest";
import {
  buildMinecraftPlayActivationInstruction,
  diagnoseMinecraftPlayJourney,
} from "../minecraftPlayJourney";

const activeBinding = {
  reasoning_binding_id: "reasoning_binding:one",
  helix_conversation_id: "helix-chat:one",
  status: "active",
  continuation_transport: "polling",
  binding_epoch: 3,
} as const;

const readyInput = {
  reasoningBinding: activeBinding,
  roomPresent: true,
  isOwner: true,
  environmentStatus: "active",
  sourceBindingStatus: "active",
  playerBindingStatus: "active",
  playerAuthorityStatus: "active",
  authorityConfirmationRequired: false,
  authorityConfirmed: false,
  launchConnected: true,
  playerClientReady: true,
  steeringAcknowledged: true,
  durableGoalReady: true,
  semanticMonitorReady: true,
} as const;

describe("Minecraft Play with Helix finite journey", () => {
  it("fails closed at the first missing exact prerequisite", () => {
    expect(diagnoseMinecraftPlayJourney({
      ...readyInput,
      reasoningBinding: null,
    })).toMatchObject({
      stage: "reasoning_binding_required",
      ready: false,
      answerAuthority: false,
      terminalEligible: false,
    });

    expect(diagnoseMinecraftPlayJourney({
      ...readyInput,
      environmentStatus: "stale",
    }).stage).toBe("environment_required");

    expect(diagnoseMinecraftPlayJourney({
      ...readyInput,
      authorityConfirmationRequired: true,
      authorityConfirmed: false,
    }).stage).toBe("authority_confirmation_required");

    expect(diagnoseMinecraftPlayJourney({
      ...readyInput,
      playerAuthorityStatus: "revoked",
      authorityConfirmed: true,
    })).toMatchObject({
      stage: "player_authority_required",
      ready: false,
      answerAuthority: false,
      terminalEligible: false,
    });

    expect(diagnoseMinecraftPlayJourney({
      ...readyInput,
      steeringAcknowledged: false,
    }).stage).toBe("agent_pickup_required");
  });

  it("does not confuse exact pickup with durable goal or monitor readiness", () => {
    expect(diagnoseMinecraftPlayJourney({
      ...readyInput,
      durableGoalReady: false,
    })).toMatchObject({
      stage: "durable_goal_required",
      ready: false,
      answerAuthority: false,
      terminalEligible: false,
    });

    expect(diagnoseMinecraftPlayJourney({
      ...readyInput,
      semanticMonitorReady: false,
    }).stage).toBe("semantic_monitor_required");
  });

  it("reports ready only after exact pickup, goal, and monitor verification", () => {
    expect(diagnoseMinecraftPlayJourney(readyInput)).toMatchObject({
      stage: "ready",
      ready: true,
      reasonCode: "minecraft_play_goal_and_monitor_verified",
      answerAuthority: false,
      terminalEligible: false,
    });
    expect(diagnoseMinecraftPlayJourney(readyInput).nextAction)
      .toContain("continuous Responses action control is a separate, unverified checkpoint");
  });

  it.each(["run:existing", null])("builds exact session guidance for bound run %s", (boundRunId) => {
    const instruction = buildMinecraftPlayActivationInstruction({
      objective: "Help me gather wood safely.",
      roomId: "room:one",
      environmentBindingId: "environment:one",
      roomSourceBindingId: "source-binding:one",
      sourceId: "source:one",
      worldId: "world:one",
      participantId: "participant:one",
      subjectBindingId: "subject-binding:one",
      actionAuthorityId: "authority:one",
      allowedCapabilityIds: ["minecraft.walk", "minecraft.observe", "minecraft.walk"],
      authorityExpiresAt: "2026-09-03T03:00:00.000Z",
      boundRunId,
    });

    expect(instruction).toContain("Continue in this exact existing Codex task");
    expect(instruction).toContain("Create or restore");
    expect(instruction).toContain("`/helix ask <natural-language prompt>`");
    expect(instruction).toContain("nonterminal evidence—not answers");
    expect(instruction).toContain("minecraft.observe, minecraft.walk");
    expect(instruction).toContain("budget.expires_in_seconds");
    expect(instruction).toContain("not current authorization proof");
    expect(instruction).toContain(boundRunId ? "Existing bound environment run: run:existing" : "No environment run is associated");
    if (boundRunId) expect(instruction).toContain("do not replace or extend it");
    expect(instruction).not.toContain("credential");
    expect(instruction).not.toContain("hidden reasoning");
  });
});
