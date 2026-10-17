import * as React from "react";
import {
  helixEnvironmentDeviceCheckListSchema,
  type HelixEnvironmentDeviceCheck,
  type HelixEnvironmentDeviceCheckList,
} from "@shared/helix-environment-device-check";
import type {
  LiveAnswerEnvironment,
  LiveAnswerEnvironmentDelta,
} from "@shared/helix-live-answer-environment";
import {
  useLiveAnswerEnvironmentStore,
  type LiveAnswerEnvironmentDiagnostics,
} from "@/store/useLiveAnswerEnvironmentStore";

export type CasimirGuideEnvironmentReadState =
  | "idle"
  | "loading"
  | "ready"
  | "stale"
  | "failed";

export type CasimirGuideEnvironmentProjection = Readonly<{
  state: CasimirGuideEnvironmentReadState;
  monitor: Readonly<{
    preset: string;
    status: LiveAnswerEnvironment["status"];
    mode: LiveAnswerEnvironment["mode"];
    source_count: number;
    updated_at: string;
  }> | null;
  connector: Readonly<{
    package_id: string;
    domain_adapter: string | null;
    world_id: string | null;
    health: HelixEnvironmentDeviceCheck["health"];
    freshness: HelixEnvironmentDeviceCheck["freshness"];
    probe_ready: boolean;
    capability_count: number;
    blocking_reason_count: number;
    last_contact_at: string | null;
  }> | null;
  embodiments: Readonly<{
    player_proxy: "not_projected";
    companion_entity: "not_projected";
  }>;
  companion: Readonly<{
    controller_profile_id: "resident.minecraft.companion-follow.v1";
    capability_maturity: "live accepted";
    runtime_presence: "not_projected";
    actor_incarnation: "not_projected";
    actor_lease: "not_projected";
    effect_lease: "not_projected";
    controls_exposed: false;
  }>;
  evidence: Readonly<{
    delta_count: number;
    blocked_subgoal_count: number;
    latest_observation_at: string | null;
    cleanup_state: "not_projected";
    answer_authority: false;
    terminal_eligible: false;
  }>;
}>;

const sortTimestampDescending = (left: string | null, right: string | null): number =>
  String(right ?? "").localeCompare(String(left ?? ""));

export const selectCasimirGuideEnvironmentDevice = (
  devices: readonly HelixEnvironmentDeviceCheck[],
): HelixEnvironmentDeviceCheck | null => [...devices].sort((left, right) => {
  const readiness = Number(right.probe_ready) - Number(left.probe_ready);
  if (readiness !== 0) return readiness;
  const freshness = Number(right.freshness === "fresh") - Number(left.freshness === "fresh");
  if (freshness !== 0) return freshness;
  const contact = sortTimestampDescending(left.last_contact_at, right.last_contact_at);
  if (contact !== 0) return contact;
  return left.device_id.localeCompare(right.device_id);
})[0] ?? null;

export const selectCasimirGuideLiveAnswerEnvironment = (
  environments: Readonly<Record<string, LiveAnswerEnvironment | null>>,
): LiveAnswerEnvironment | null => Object.values(environments)
  .filter((value): value is LiveAnswerEnvironment => value !== null)
  .sort((left, right) => {
    const updated = sortTimestampDescending(left.updated_at, right.updated_at);
    if (updated !== 0) return updated;
    return left.environment_id.localeCompare(right.environment_id);
  })[0] ?? null;

export const buildCasimirGuideEnvironmentProjection = (input: {
  readState: CasimirGuideEnvironmentReadState;
  deviceRead: HelixEnvironmentDeviceCheckList | null;
  environments: Readonly<Record<string, LiveAnswerEnvironment | null>>;
  deltasByEnvironment: Readonly<Record<string, LiveAnswerEnvironmentDelta[]>>;
  diagnosticsByThread: Readonly<Record<string, LiveAnswerEnvironmentDiagnostics>>;
}): CasimirGuideEnvironmentProjection => {
  const environment = selectCasimirGuideLiveAnswerEnvironment(input.environments);
  const device = selectCasimirGuideEnvironmentDevice(input.deviceRead?.devices ?? []);
  const diagnostics = environment ? input.diagnosticsByThread[environment.thread_id] : undefined;
  const readFailedWithRetainedState = input.readState === "failed" && Boolean(device || environment);
  const state: CasimirGuideEnvironmentReadState = diagnostics?.stale || readFailedWithRetainedState
    ? "stale"
    : input.readState;
  const latestObservationAt = [
    environment?.updated_at ?? null,
    device?.last_contact_at ?? null,
    input.deviceRead?.generated_at ?? null,
  ].filter((value): value is string => Boolean(value)).sort((left, right) => right.localeCompare(left))[0] ?? null;

  return {
    state,
    monitor: environment ? {
      preset: environment.preset?.trim() || "custom",
      status: environment.status,
      mode: environment.mode,
      source_count: environment.source_ids.length,
      updated_at: environment.updated_at,
    } : null,
    connector: device ? {
      package_id: device.package_id,
      domain_adapter: device.domain_adapter,
      world_id: device.world_id,
      health: device.health,
      freshness: device.freshness,
      probe_ready: device.probe_ready,
      capability_count: device.capability_ids.length,
      blocking_reason_count: device.blocking_reasons.length,
      last_contact_at: device.last_contact_at,
    } : null,
    embodiments: {
      player_proxy: "not_projected",
      companion_entity: "not_projected",
    },
    companion: {
      controller_profile_id: "resident.minecraft.companion-follow.v1",
      capability_maturity: "live accepted",
      runtime_presence: "not_projected",
      actor_incarnation: "not_projected",
      actor_lease: "not_projected",
      effect_lease: "not_projected",
      controls_exposed: false,
    },
    evidence: {
      delta_count: environment
        ? input.deltasByEnvironment[environment.environment_id]?.length ?? 0
        : 0,
      blocked_subgoal_count: environment
        ? environment.subgoals.filter((subgoal) => subgoal.status === "blocked").length
        : 0,
      latest_observation_at: latestObservationAt,
      cleanup_state: "not_projected",
      answer_authority: false,
      terminal_eligible: false,
    },
  };
};

export const useCasimirGuideEnvironmentProjection = (
  enabled: boolean,
): CasimirGuideEnvironmentProjection => {
  const environments = useLiveAnswerEnvironmentStore((state) => state.environmentById);
  const deltasByEnvironment = useLiveAnswerEnvironmentStore((state) => state.deltasByEnvironment);
  const diagnosticsByThread = useLiveAnswerEnvironmentStore((state) => state.diagnosticsByThread);
  const [deviceRead, setDeviceRead] = React.useState<HelixEnvironmentDeviceCheckList | null>(null);
  const [readState, setReadState] = React.useState<CasimirGuideEnvironmentReadState>("idle");

  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setReadState("loading");
    void fetch("/api/agi/environment-connectors/devices", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(`guide_environment_device_read_failed:${response.status}`);
      const parsed = helixEnvironmentDeviceCheckListSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("guide_environment_device_contract_invalid");
      setDeviceRead(parsed.data);
      setReadState("ready");
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setReadState("failed");
    });
    return () => controller.abort();
  }, [enabled]);

  return React.useMemo(() => buildCasimirGuideEnvironmentProjection({
    readState,
    deviceRead,
    environments,
    deltasByEnvironment,
    diagnosticsByThread,
  }), [deviceRead, deltasByEnvironment, diagnosticsByThread, environments, readState]);
};
