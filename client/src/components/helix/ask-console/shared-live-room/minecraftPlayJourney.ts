import type { BrowserReasoningBinding } from "@/lib/agent-access/reasoningTaskBinding";

export const MINECRAFT_PLAY_JOURNEY_STAGES = [
  "reasoning_binding_required",
  "room_required",
  "environment_required",
  "player_required",
  "player_authority_required",
  "authority_confirmation_required",
  "minecraft_launch_required",
  "private_pairing_required",
  "agent_pickup_required",
  "durable_goal_required",
  "semantic_monitor_required",
  "ready",
  "recovery_required",
] as const;

export type MinecraftPlayJourneyStage =
  (typeof MINECRAFT_PLAY_JOURNEY_STAGES)[number];

export type MinecraftPlayJourneyProjection = Readonly<{
  schema: "helix.minecraft.play_journey_projection.v1";
  stage: MinecraftPlayJourneyStage;
  ready: boolean;
  reasonCode: string;
  nextAction: string;
  answerAuthority: false;
  terminalEligible: false;
}>;

export const diagnoseMinecraftPlayJourney = (input: Readonly<{
  reasoningBinding: BrowserReasoningBinding | null;
  roomPresent: boolean;
  isOwner: boolean;
  environmentStatus: string | null;
  sourceBindingStatus: string | null;
  playerBindingStatus: string | null;
  playerAuthorityStatus: string | null;
  authorityConfirmationRequired: boolean;
  authorityConfirmed: boolean;
  launchConnected: boolean;
  playerClientReady: boolean;
  steeringAcknowledged: boolean;
  durableGoalReady: boolean;
  semanticMonitorReady: boolean;
  recoveryRequired?: boolean;
}>): MinecraftPlayJourneyProjection => {
  const result = (
    stage: MinecraftPlayJourneyStage,
    reasonCode: string,
    nextAction: string,
  ): MinecraftPlayJourneyProjection => Object.freeze({
    schema: "helix.minecraft.play_journey_projection.v1",
    stage,
    ready: stage === "ready",
    reasonCode,
    nextAction,
    answerAuthority: false,
    terminalEligible: false,
  });

  if (input.recoveryRequired) {
    return result(
      "recovery_required",
      "minecraft_play_identity_or_authority_changed",
      "Re-read the exact task, room, player, world, connector epoch, and authority before continuing.",
    );
  }
  if (input.reasoningBinding?.status !== "active") {
    return result(
      "reasoning_binding_required",
      "minecraft_play_exact_reasoning_binding_required",
      "Bind this Helix chat to the existing exact Codex task in Agent Connections.",
    );
  }
  if (!input.roomPresent || !input.isOwner) {
    return result(
      "room_required",
      "minecraft_play_owner_room_required",
      "Create or open the owner Shared Live Room for this play session.",
    );
  }
  if (
    input.environmentStatus !== "active" ||
    input.sourceBindingStatus !== "active"
  ) {
    return result(
      "environment_required",
      "minecraft_play_current_environment_required",
      "Connect the exact Minecraft source and verify its current world binding.",
    );
  }
  if (input.playerBindingStatus !== "active") {
    return result(
      "player_required",
      "minecraft_play_current_player_required",
      "Select and verify the player controlled by this room participant.",
    );
  }
  if (input.playerAuthorityStatus !== "active") {
    return result(
      "player_authority_required",
      "minecraft_play_current_player_authority_required",
      "Review and activate a finite player-control lease for this exact player before continuing.",
    );
  }
  if (input.authorityConfirmationRequired && !input.authorityConfirmed) {
    return result(
      "authority_confirmation_required",
      "minecraft_play_authority_confirmation_required",
      "Review the displayed player capabilities and acknowledge the finite control lease.",
    );
  }
  if (!input.launchConnected) {
    return result(
      "minecraft_launch_required",
      "minecraft_play_loopback_launch_required",
      "Launch or reuse the prepared Fabric client and join localhost.",
    );
  }
  if (!input.playerClientReady) {
    return result(
      "private_pairing_required",
      "minecraft_play_private_pairing_required",
      "Privately pair the exact local player companion and wait for its admitted heartbeat.",
    );
  }
  if (!input.steeringAcknowledged) {
    return result(
      "agent_pickup_required",
      "minecraft_play_bound_agent_pickup_required",
      "Send the play objective to the exact bound Codex task and wait for exact pickup acknowledgement.",
    );
  }
  if (!input.durableGoalReady) {
    return result(
      "durable_goal_required",
      "minecraft_play_durable_goal_not_yet_verified",
      "Wait for the exact bound task to create or restore the scoped durable goal, then verify its current projection.",
    );
  }
  if (!input.semanticMonitorReady) {
    return result(
      "semantic_monitor_required",
      "minecraft_play_semantic_monitor_not_yet_verified",
      "Wait for the exact bound task to create or restore the semantic monitor, then verify its active lease.",
    );
  }
  return result(
    "ready",
    "minecraft_play_goal_and_monitor_verified",
    "Goal and monitor verified. Continue through Helix chat or `/helix ask <prompt>`; continuous Responses action control is a separate, unverified checkpoint.",
  );
};

const compactIds = (ids: string[]): string =>
  [...new Set(ids)].sort().join(", ");

export const buildMinecraftPlayActivationInstruction = (input: Readonly<{
  objective: string;
  roomId: string;
  environmentBindingId: string;
  roomSourceBindingId: string;
  sourceId: string;
  worldId: string;
  participantId: string;
  subjectBindingId: string;
  actionAuthorityId: string;
  allowedCapabilityIds: string[];
  authorityExpiresAt: string | null;
  boundRunId: string | null;
}>): string => [
  "The user explicitly activated Play Minecraft with Helix from CasimirBot for the objective below.",
  `Objective: ${input.objective.trim()}`,
  "Continue in this exact existing Codex task; do not create or switch provider tasks.",
  `Exact room: ${input.roomId}`,
  `Environment binding: ${input.environmentBindingId}`,
  `Room source binding: ${input.roomSourceBindingId}`,
  `Source/world: ${input.sourceId} / ${input.worldId}`,
  `Participant/subject binding: ${input.participantId} / ${input.subjectBindingId}`,
  `Current action authority: ${input.actionAuthorityId}`,
  `Allowed player capabilities: ${compactIds(input.allowedCapabilityIds)}`,
  `Authority expiry: ${input.authorityExpiresAt ?? "server-governed"}`,
  input.boundRunId
    ? `Existing bound environment run: ${input.boundRunId}. Re-read and preserve this run and its actual deadline; do not replace or extend it merely to match the gameplay lease.`
    : "No environment run is associated with this chat binding. Verify whether a reusable exact run exists before proposing a new one; do not invent a run association.",
  "The displayed authority expiry is a requested session limit, not current authorization proof. Re-read the exact authority and source deadlines. If a new scoped environment run is necessary and authorized, explicitly set its budget.expires_in_seconds to the remaining verified finite session window, within the run API limit, rather than silently accepting the one-hour default. Never round the duration up beyond that window. If any required lease or existing run ends sooner, report that shorter deadline and the required recovery instead of renewing permission or replacing the chat binding. A missing or expired finite window is not permission to start an unbounded run.",
  "Use the CasimirBot MCP tools to re-read current room, selected-player, authority, connector-manifest, and heartbeat state. Reuse current exact resources. If the local Fabric client is not connected, call helix_minecraft_local_lifecycle_launch with this exact room, environment, and current active action-authority ID; startup alone is not permission and the tool must not widen authority. Privately pair the same-host player with helix_environment_player_pair_local only if readiness requires it. Create or restore the exact scoped durable Minecraft goal and semantic monitor for this objective without duplicating either one. Do not execute gameplay merely to prove readiness.",
  "When ready, report the accepted input paths: ordinary Helix chat and `/helix ask <natural-language prompt>`. For later requests, select only admitted tools, consume each fresh action observation before replanning or answering, and preserve manual override, cancel, Emergency Stop, revocation, and stale-epoch rejection.",
  "Steering pickup, pairing/launch/action receipts, monitor deliveries, and goal projections are nonterminal evidence—not answers or execution authority. Use helix_environment_action_authority_revoke for a requested lease stop; stale work must then fail closed. Only the completed governed solver path may provide the final text, and GPT Live may only read that same authorized result.",
].join("\n");
