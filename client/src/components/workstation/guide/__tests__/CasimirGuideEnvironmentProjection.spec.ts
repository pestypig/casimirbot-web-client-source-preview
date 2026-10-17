import { describe, expect, it } from "vitest";
import type {
  HelixEnvironmentDeviceCheck,
  HelixEnvironmentDeviceCheckList,
} from "@shared/helix-environment-device-check";
import type { LiveAnswerEnvironment } from "@shared/helix-live-answer-environment";
import {
  buildCasimirGuideEnvironmentProjection,
  selectCasimirGuideEnvironmentDevice,
  selectCasimirGuideLiveAnswerEnvironment,
} from "../CasimirGuideEnvironmentProjection";

const device = (overrides: Partial<HelixEnvironmentDeviceCheck> = {}): HelixEnvironmentDeviceCheck => ({
  schema: "helix.environment_connector.device_check.v1",
  device_id: "device:private",
  installation_id: "installation:private",
  package_id: "minecraft-paper",
  package_version: "1.0.0",
  trust_classification: "first_party",
  security_review_state: "approved",
  installation_status: "active",
  device_status: "active",
  health: "online",
  freshness: "fresh",
  last_contact_at: "2026-08-31T20:00:00.000Z",
  last_contact_age_ms: 1_000,
  stale_after_ms: 60_000,
  paired_at: "2026-08-31T19:00:00.000Z",
  environment_binding_id: "binding:private",
  binding_status: "active",
  adapter_admission_status: "active",
  room_id: "room:private",
  source_id: "source:private",
  world_id: "world:survival",
  domain_adapter: "minecraft.paper",
  capability_ids: ["minecraft.observe"],
  credential_status: "active",
  credential_expires_at: "2026-09-01T20:00:00.000Z",
  probe_ready: true,
  blocking_reasons: [],
  content_role: "device_health_observation_not_assistant_answer",
  credential_included: false,
  device_public_key_included: false,
  producer_epoch_included: false,
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
  ...overrides,
});

const environment = (overrides: Partial<LiveAnswerEnvironment> = {}): LiveAnswerEnvironment => ({
  schema: "helix.live_answer_environment.v1",
  environment_id: "environment:private",
  thread_id: "thread:private",
  created_turn_id: "turn:private",
  objective: "private objective text",
  preset: "minecraft_run_monitor",
  room_id: "room:private",
  source_ids: ["source:private-a", "source:private-b"],
  graph_id: "graph:private",
  status: "active",
  mode: "text_only",
  line_schema: [],
  lines: [],
  subgoals: [{
    subgoal_id: "subgoal:private",
    label: "private blocker text",
    status: "blocked",
    confidence: 0.5,
    evidence_refs: ["evidence:private"],
    updated_at: "2026-08-31T20:01:00.000Z",
  }],
  latest_evaluation: null,
  latest_summary: "private summary text",
  evidence_refs: ["evidence:private"],
  created_at: "2026-08-31T19:30:00.000Z",
  updated_at: "2026-08-31T20:01:00.000Z",
  context_policy: "compact_context_pack_only",
  raw_logs_included: false,
  raw_transcript_included: false,
  raw_audio_included: false,
  deterministic_content_role: "observation_not_assistant_answer",
  context_role: "observation_not_assistant_answer",
  terminal_eligible: false,
  post_tool_model_step_required: true,
  assistant_answer: false,
  raw_content_included: false,
  ...overrides,
});

const deviceRead = (devices: HelixEnvironmentDeviceCheck[]): HelixEnvironmentDeviceCheckList => ({
  schema: "helix.environment_connector.device_check_list.v1",
  generated_at: "2026-08-31T20:02:00.000Z",
  devices,
  content_role: "device_health_observations_not_assistant_answer",
  credential_included: false,
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
});

describe("Casimir Guide environment projection", () => {
  it("selects the newest monitor and a ready fresh connector deterministically", () => {
    expect(selectCasimirGuideLiveAnswerEnvironment({
      older: environment({ environment_id: "environment:older", updated_at: "2026-08-31T19:00:00.000Z" }),
      newer: environment({ environment_id: "environment:newer", updated_at: "2026-08-31T20:00:00.000Z" }),
    })?.environment_id).toBe("environment:newer");

    expect(selectCasimirGuideEnvironmentDevice([
      device({ device_id: "device:stale", freshness: "stale", probe_ready: false }),
      device({ device_id: "device:ready" }),
    ])?.device_id).toBe("device:ready");
  });

  it("whitelists bounded metadata and never projects private identities, content, evidence, or controls", () => {
    const current = environment();
    const projection = buildCasimirGuideEnvironmentProjection({
      readState: "ready",
      deviceRead: deviceRead([device()]),
      environments: { [current.environment_id]: current },
      deltasByEnvironment: { [current.environment_id]: [] },
      diagnosticsByThread: {},
    });

    expect(projection).toMatchObject({
      state: "ready",
      monitor: { preset: "minecraft_run_monitor", status: "active", source_count: 2 },
      connector: { world_id: "world:survival", freshness: "fresh", capability_count: 1 },
      companion: {
        controller_profile_id: "resident.minecraft.companion-follow.v1",
        capability_maturity: "live accepted",
        runtime_presence: "not_projected",
        actor_incarnation: "not_projected",
        controls_exposed: false,
      },
      evidence: {
        blocked_subgoal_count: 1,
        cleanup_state: "not_projected",
        answer_authority: false,
        terminal_eligible: false,
      },
    });
    const serialized = JSON.stringify(projection);
    for (const privateValue of [
      "device:private",
      "installation:private",
      "binding:private",
      "room:private",
      "source:private-a",
      "environment:private",
      "thread:private",
      "private objective text",
      "private blocker text",
      "private summary text",
      "evidence:private",
    ]) expect(serialized).not.toContain(privateValue);
  });

  it("marks retained observations stale after a failed refresh and does not invent companion runtime state", () => {
    const projection = buildCasimirGuideEnvironmentProjection({
      readState: "failed",
      deviceRead: deviceRead([device()]),
      environments: {},
      deltasByEnvironment: {},
      diagnosticsByThread: {},
    });

    expect(projection.state).toBe("stale");
    expect(projection.embodiments).toEqual({
      player_proxy: "not_projected",
      companion_entity: "not_projected",
    });
    expect(projection.companion.actor_lease).toBe("not_projected");
    expect(projection.companion.effect_lease).toBe("not_projected");
  });
});
