import { describe, expect, it } from "vitest";
import { projectCurrentMinecraftFacts, projectCurrentMinecraftPlayerFact,
  projectCurrentMinecraftReadinessFact } from
  "../setupContractMinecraftFacts";

const nowMs = 1_800_000_000_000;
const scope = {
  branch: "minecraft_player" as const,
  room_ref: "room:exact", environment_binding_ref: "environment:exact",
  player_ref: "environment_subject_binding:player-a",
  capability_ids: ["minecraft.player.navigate", "minecraft.player.look"],
  autonomy_mode: "approved_capabilities" as const,
  manual_override_policy: "cancel" as const,
  duration_seconds: 7200,
};
const authority = {
  schema: "helix.environment_action.authority.v1",
  action_authority_id: "environment_action_authority:exact",
  environment_binding_id: scope.environment_binding_ref,
  room_source_binding_id: "room_source_binding:exact",
  room_id: scope.room_ref, source_id: "source:exact", world_id: "world:exact",
  adapter_profile_id: "game.minecraft.player.fabric.v1",
  domain_adapter: "minecraft.fabric_client.v1",
  participant_id: "participant:owner", subject_binding_id: scope.player_ref,
  allowed_capability_ids: scope.capability_ids,
  autonomy_mode: scope.autonomy_mode, manual_override_policy: scope.manual_override_policy,
  status: "active", policy_version: 1,
  issued_at: new Date(nowMs - 60_000).toISOString(),
  expires_at: new Date(nowMs + 3_600_000).toISOString(), revoked_at: null,
  credential_included: false,
  content_role: "environment_action_authority_not_assistant_answer",
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
  raw_content_included: false,
};
const readiness = {
  schema: "helix.environment_action.connector_readiness.v1",
  action_authority_id: authority.action_authority_id,
  state: "ready", ready_for_actions: true, manifest_admitted: true,
  manifest_received_at: new Date(nowMs - 30_000).toISOString(),
  declared_capability_count: 2, available_control_engines: ["native_fabric"],
  heartbeat_status: "active", heartbeat_fresh: true,
  heartbeat_received_at: new Date(nowMs - 1_000).toISOString(),
  heartbeat_max_age_ms: 30_000, active_workflow_count: 0,
  controls_asserted: false, manual_input_detected: false,
  emergency_stop_latched: false, blocking_reason: null,
  credential_included: false,
  content_role: "environment_action_connector_readiness_not_assistant_answer",
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
  raw_content_included: false,
};
const receipt = (authorities: unknown[] = [authority], connector: unknown[] = [readiness]) => ({
  schema: "helix.environment_action.authority_receipt.v1", ok: true,
  authorities, connector_readiness: connector,
});
const subjectBinding = {
  schema: "helix.room_environment_subject_binding.v1",
  subject_binding_id: scope.player_ref, room_id: scope.room_ref,
  participant_id: authority.participant_id,
  environment_binding_id: scope.environment_binding_ref,
  room_source_binding_id: authority.room_source_binding_id,
  source_id: authority.source_id, world_id: authority.world_id,
  subject_kind: "minecraft_player", subject_ref: "subject:exact",
  subject_label: "Player", verification_method: "server_auth", confidence: 1,
  status: "active", producer_epoch_ref: "epoch:exact",
  verified_at: new Date(nowMs - 60_000).toISOString(),
  last_confirmed_at: new Date(nowMs - 1_000).toISOString(),
  expires_at: null, revoked_at: null,
  content_role: "environment_subject_identity_not_assistant_answer",
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
  raw_content_included: false,
};
const subjectDirectory = {
  schema: "helix.environment_subject_directory.v1",
  environment_binding_id: scope.environment_binding_ref,
  room_source_binding_id: authority.room_source_binding_id,
  room_id: scope.room_ref, source_id: authority.source_id, world_id: authority.world_id,
  subject_kind: subjectBinding.subject_kind,
  observed_at: new Date(nowMs - 1_000).toISOString(), freshness: "fresh",
  subjects: [{ subject_ref: subjectBinding.subject_ref,
    subject_kind: subjectBinding.subject_kind, display_label: "Player",
    presence: "online", claimed_by_participant_id: authority.participant_id,
    observed_at: new Date(nowMs - 1_000).toISOString(), freshness: "fresh",
    answer_authority: false, assistant_answer: false, terminal_eligible: false,
    raw_content_included: false }],
  content_role: "environment_subject_directory_not_assistant_answer",
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
  raw_content_included: false,
};
const environment = {
  schema: "helix.room_environment_projection.v1",
  environment_binding_id: scope.environment_binding_ref,
  room_source_binding_id: authority.room_source_binding_id,
  room_id: scope.room_ref, source_id: authority.source_id, world_id: authority.world_id,
  domain: "minecraft", domain_adapter: "minecraft.fabric_client.v1",
  source_label: "Minecraft", connection_status: "active",
  latest_observed_at: new Date(nowMs - 1_000).toISOString(),
  capability_ids: scope.capability_ids, subject_directory: subjectDirectory,
  self_subject_binding: subjectBinding, identity_assignment: "supported",
  owner_controls_visible: true,
  content_role: "room_environment_projection_not_assistant_answer",
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
  raw_content_included: false,
};
const subjectsReceipt = (projection: unknown = environment, binding: unknown = subjectBinding) => ({
  schema: "helix.room_environments.receipt.v1", ok: true, error: null,
  message: "Environment subjects listed.", environments: [projection], binding,
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
  raw_content_included: false,
});

describe("Minecraft setup contract owner facts", () => {
  it("proves exact current self player selection independently of an action lease", () => {
    const fact = projectCurrentMinecraftPlayerFact(subjectsReceipt(), nowMs, scope);
    expect(fact?.stepId).toBe("minecraft_player_selection");
    expect(fact?.validUntilMs).toBe(nowMs + 5_000);
    expect(fact?.grantExpiresAtMs).toBeUndefined();
  });

  it("reports readiness only when lease, connector and player identity agree", () => {
    const ready = projectCurrentMinecraftReadinessFact(
      receipt(), subjectsReceipt(), nowMs, scope);
    expect(ready).toMatchObject({ stepId: "minecraft_readiness",
      state: "satisfied", grantExpiresAtMs: nowMs + 3_600_000 });
    expect(projectCurrentMinecraftReadinessFact(
      receipt([authority], []), subjectsReceipt(), nowMs, scope)).toBeNull();
    expect(projectCurrentMinecraftReadinessFact(
      receipt(), subjectsReceipt(environment, { ...subjectBinding,
        participant_id: "participant:other" }), nowMs, scope)).toBeNull();
    expect(projectCurrentMinecraftReadinessFact(
      receipt([{ ...authority, source_id: "source:other" }]),
      subjectsReceipt(), nowMs, scope)).toBeNull();
    expect(projectCurrentMinecraftReadinessFact(
      receipt(), subjectsReceipt({ ...environment, connection_status: "stale" }),
      nowMs, scope)).toBeNull();
    // A nonmatching lease for this player must not stand in for the exact
    // lease whose connector was checked when joining to the subject binding.
    const decoy = { ...authority,
      action_authority_id: "environment_action_authority:decoy",
      allowed_capability_ids: ["minecraft.player.attack"] };
    const exactWrongParticipant = { ...authority, participant_id: "participant:other" };
    expect(projectCurrentMinecraftFacts(
      receipt([decoy, exactWrongParticipant]), nowMs, scope)
      .some(fact => fact.stepId === "minecraft_connector")).toBe(true);
    expect(projectCurrentMinecraftReadinessFact(
      receipt([decoy, exactWrongParticipant]), subjectsReceipt(), nowMs, scope)).toBeNull();
  });

  it("rejects another player, environment, stale subject, or unassigned player", () => {
    const changed = [
      subjectsReceipt(environment, { ...subjectBinding, subject_binding_id: "subject:other" }),
      subjectsReceipt({ ...environment, environment_binding_id: "environment:other" }),
      subjectsReceipt({ ...environment, subject_directory: { ...subjectDirectory, freshness: "stale" } }),
      subjectsReceipt({ ...environment, identity_assignment: "binding_required" }),
      subjectsReceipt({ ...environment, self_subject_binding: { ...subjectBinding, status: "stale" } }),
      subjectsReceipt({ ...environment, subject_directory: { ...subjectDirectory,
        subjects: [{ ...subjectDirectory.subjects[0], claimed_by_participant_id: null }] } }),
    ];
    for (const candidate of changed) {
      expect(projectCurrentMinecraftPlayerFact(candidate, nowMs, scope)).toBeNull();
    }
  });
  it("reuses only the exact finite player lease and fresh connector heartbeat", () => {
    const facts = projectCurrentMinecraftFacts(receipt(), nowMs, scope);
    expect(facts.map(fact => fact.stepId)).toEqual([
      "minecraft_action_lease", "minecraft_connector",
    ]);
    expect(facts.every(fact => fact.state === "satisfied" &&
      fact.grantExpiresAtMs === nowMs + 3_600_000)).toBe(true);
  });

  it("keeps a valid lease separate from missing or stale connector readiness", () => {
    expect(projectCurrentMinecraftFacts(receipt([authority], []), nowMs, scope)
      .map(fact => fact.stepId)).toEqual(["minecraft_action_lease"]);
    expect(projectCurrentMinecraftFacts(receipt([authority], [{ ...readiness,
      heartbeat_received_at: new Date(nowMs - 31_000).toISOString() }]), nowMs, scope)
      .map(fact => fact.stepId)).toEqual(["minecraft_action_lease"]);
  });

  it("does not reuse a changed player, room, capability, policy or broader lease", () => {
    const changed = [
      { ...authority, room_id: "room:other" },
      { ...authority, subject_binding_id: "environment_subject_binding:other" },
      { ...authority, allowed_capability_ids: [...scope.capability_ids, "minecraft.player.attack"] },
      { ...authority, allowed_capability_ids: [scope.capability_ids[0], scope.capability_ids[0]] },
      { ...authority, autonomy_mode: "autonomous" },
      { ...authority, expires_at: new Date(nowMs + 10_000_000).toISOString() },
      { ...authority, status: "revoked" },
    ];
    for (const candidate of changed) {
      expect(projectCurrentMinecraftFacts(receipt([candidate]), nowMs, scope)).toEqual([]);
    }
    expect(projectCurrentMinecraftFacts(receipt([authority, authority]), nowMs, scope)).toEqual([]);
    expect(projectCurrentMinecraftFacts({ ...receipt(), ok: false }, nowMs, scope)).toEqual([]);
  });
});
