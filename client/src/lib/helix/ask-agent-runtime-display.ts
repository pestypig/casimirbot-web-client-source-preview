import {
  DEFAULT_HELIX_AGENT_RUNTIME_ID,
  isHelixAgentRuntimeId as isSharedHelixAgentRuntimeId,
  type HelixAgentRuntimeDescriptor,
  type HelixAgentRuntimeId,
} from "@shared/helix-agent-runtime";

type RecordLike = Record<string, unknown>;

export const DEFAULT_HELIX_AGENT_RUNTIME_PROVIDERS: HelixAgentRuntimeDescriptor[] = [
  {
    id: "codex",
    label: "Codex Workstation Mode",
    enabled: true,
    experimental: false,
    permission_profile: {
      id: "read-observe-act",
      label: "Read/observe plus non-mutating workstation action",
      allows: {
        observe: true,
        read: true,
        act: true,
        write: false,
        shell: false,
        codeMutation: false,
      },
    },
    supports: {
      streaming: true,
      workstationTools: true,
      capabilityLanes: true,
      capabilityLaneOneShot: true,
      capabilityLaneSessions: true,
      codeMutation: false,
    },
  },
];

function readRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordLike) : null;
}

function coerceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

function coerceModelMetadataText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

export function isHelixAgentRuntimeId(value: unknown): value is HelixAgentRuntimeId {
  return isSharedHelixAgentRuntimeId(value);
}

function normalizeHelixAgentProvider(value: unknown): HelixAgentRuntimeDescriptor | null {
  const record = readRecord(value);
  if (!record || !isHelixAgentRuntimeId(record.id)) return null;
  const supports = readRecord(record.supports);
  const permissionProfile = readRecord(record.permission_profile);
  const permissionAllows = readRecord(permissionProfile?.allows);
  const fallbackPermissionProfile = record.id === "codex" || record.id === "future"
    ? {
        id: "read-observe" as const,
        label: "Read/observe only",
        allows: {
          observe: true,
          read: true,
          act: false,
          write: false,
          shell: false,
          codeMutation: false,
        },
      }
    : DEFAULT_HELIX_AGENT_RUNTIME_PROVIDERS[0].permission_profile;
  const fallbackLabel =
    record.id === "codex"
      ? "Codex Workstation Mode"
      : record.id === "future"
        ? "Future Agent Wrapper"
        : "Helix Ask Native";
  return {
    id: record.id,
    label: coerceText(record.label).trim() || fallbackLabel,
    enabled: record.enabled === true,
    experimental: record.experimental === true,
    permission_profile: {
      id: permissionProfile?.id === "read-observe" ||
        permissionProfile?.id === "read-observe-act" ||
        permissionProfile?.id === "helix-native"
        ? permissionProfile.id
        : fallbackPermissionProfile.id,
      label: coerceText(permissionProfile?.label).trim() || fallbackPermissionProfile.label,
      allows: {
        observe: typeof permissionAllows?.observe === "boolean" ? permissionAllows.observe : fallbackPermissionProfile.allows.observe,
        read: typeof permissionAllows?.read === "boolean" ? permissionAllows.read : fallbackPermissionProfile.allows.read,
        act: typeof permissionAllows?.act === "boolean" ? permissionAllows.act : fallbackPermissionProfile.allows.act,
        write: typeof permissionAllows?.write === "boolean" ? permissionAllows.write : fallbackPermissionProfile.allows.write,
        shell: typeof permissionAllows?.shell === "boolean" ? permissionAllows.shell : fallbackPermissionProfile.allows.shell,
        codeMutation: typeof permissionAllows?.codeMutation === "boolean"
          ? permissionAllows.codeMutation
          : fallbackPermissionProfile.allows.codeMutation,
      },
    },
    supports: {
      streaming: supports?.streaming === true,
      workstationTools: supports?.workstationTools === true,
      capabilityLanes: supports?.capabilityLanes === true,
      capabilityLaneOneShot: supports?.capabilityLaneOneShot === true,
      capabilityLaneSessions: supports?.capabilityLaneSessions === true,
      codeMutation: supports?.codeMutation === true,
    },
  };
}

export function normalizeHelixAgentProvidersResponse(value: unknown): HelixAgentRuntimeDescriptor[] {
  const record = readRecord(value);
  const rawProviders: unknown[] = Array.isArray(record?.providers)
    ? record.providers
    : Array.isArray(value)
      ? value
      : [];
  const providers = rawProviders
    .map((entry: unknown) => normalizeHelixAgentProvider(entry))
    .filter((entry: HelixAgentRuntimeDescriptor | null): entry is HelixAgentRuntimeDescriptor => Boolean(entry));
  return providers.length > 0 ? providers : DEFAULT_HELIX_AGENT_RUNTIME_PROVIDERS;
}

export function resolveSelectedHelixAgentRuntime(
  requested: unknown,
  providers: HelixAgentRuntimeDescriptor[],
): HelixAgentRuntimeId {
  const candidate = isHelixAgentRuntimeId(requested) ? requested : DEFAULT_HELIX_AGENT_RUNTIME_ID;
  const provider = providers.find((entry: HelixAgentRuntimeDescriptor) => entry.id === candidate);
  if (provider?.enabled) return provider.id;
  return providers.find((entry: HelixAgentRuntimeDescriptor) => entry.enabled)?.id ??
    providers[0]?.id ??
    DEFAULT_HELIX_AGENT_RUNTIME_ID;
}

export function resolveNextSelectableHelixAgentRuntime(
  current: unknown,
  providers: HelixAgentRuntimeDescriptor[],
): HelixAgentRuntimeId {
  const enabledProviders = providers.filter((provider) => provider.enabled);
  if (enabledProviders.length === 0) return providers[0]?.id ?? DEFAULT_HELIX_AGENT_RUNTIME_ID;
  const currentRuntime = resolveSelectedHelixAgentRuntime(current, providers);
  const currentIndex = enabledProviders.findIndex((provider) => provider.id === currentRuntime);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % enabledProviders.length : 0;
  return enabledProviders[nextIndex]?.id ?? DEFAULT_HELIX_AGENT_RUNTIME_ID;
}

export type HelixAgentRuntimeSelectDecision = {
  runtime: HelixAgentRuntimeId;
  menuOpen: boolean;
  invalidSelection: boolean;
};

export function resolveHelixAgentRuntimeSelectDecision(
  requested: unknown,
  providers: HelixAgentRuntimeDescriptor[],
): HelixAgentRuntimeSelectDecision {
  const runtime = resolveSelectedHelixAgentRuntime(requested, providers);
  return {
    runtime,
    menuOpen: false,
    invalidSelection: runtime !== requested,
  };
}

export type HelixAgentRuntimePrimaryButtonMode = "cycle" | "menu";

export type HelixAgentRuntimePrimaryButtonDecision = {
  runtime: HelixAgentRuntimeId;
  menuOpen: boolean;
  persistRuntime: boolean;
};

export function resolveHelixAgentRuntimePrimaryButtonDecision(args: {
  selectedRuntime: unknown;
  providers: HelixAgentRuntimeDescriptor[];
  primaryButtonMode: HelixAgentRuntimePrimaryButtonMode;
  currentMenuOpen: boolean;
}): HelixAgentRuntimePrimaryButtonDecision {
  if (args.primaryButtonMode === "cycle") {
    return {
      runtime: resolveNextSelectableHelixAgentRuntime(args.selectedRuntime, args.providers),
      menuOpen: false,
      persistRuntime: true,
    };
  }
  return {
    runtime: resolveSelectedHelixAgentRuntime(args.selectedRuntime, args.providers),
    menuOpen: !args.currentMenuOpen,
    persistRuntime: false,
  };
}

export function formatHelixAgentRuntimeShortLabel(provider: HelixAgentRuntimeDescriptor | null | undefined): string {
  if (provider?.id === "codex") return "Codex";
  if (provider?.id === "future") return "Future";
  return "Helix";
}

function sanitizeHelixAskReceiptLabel(value: string | null | undefined): string | null {
  const cleaned = value?.replace(/^[\s|.]+/, "").replace(/[\s|]+$/, "").trim();
  return cleaned || null;
}

export function formatHelixAskFinalReceiptMeta(parts: Array<string | null | undefined>): string {
  return parts
    .map(sanitizeHelixAskReceiptLabel)
    .filter((entry): entry is string => Boolean(entry))
    .join(" | ");
}

export function resolveHelixAskLanguageModelPolicySummary(response: unknown): string | null {
  const record = readRecord(response);
  const debug = readRecord(record?.debug);
  const agentLoop = readRecord(record?.agent_loop ?? record?.agentLoop ?? debug?.agent_loop ?? debug?.agentLoop);
  return (
    coerceModelMetadataText(record?.language_model_debug_summary) ||
    coerceModelMetadataText(debug?.language_model_debug_summary) ||
    coerceModelMetadataText(agentLoop?.language_model_debug_summary) ||
    coerceModelMetadataText(record?.model_policy_debug_summary) ||
    coerceModelMetadataText(debug?.model_policy_debug_summary) ||
    coerceModelMetadataText(agentLoop?.model_policy_debug_summary) ||
    null
  );
}

export function resolveHelixAskActualAgentProviderLabel(
  response: unknown,
  fallbackProviders: HelixAgentRuntimeDescriptor[] = DEFAULT_HELIX_AGENT_RUNTIME_PROVIDERS,
): string | null {
  if (resolveHelixAskLanguageModelPolicySummary(response)) return null;
  const record = readRecord(response);
  const debug = readRecord(record?.debug);
  const selectedProvider =
    readRecord(record?.selected_agent_provider) ??
    readRecord(debug?.selected_agent_provider);
  const selectedProviderId = selectedProvider?.id;
  const runtime = isHelixAgentRuntimeId(record?.agent_runtime)
    ? record?.agent_runtime
    : isHelixAgentRuntimeId(debug?.agent_runtime)
      ? debug?.agent_runtime
      : isHelixAgentRuntimeId(selectedProviderId)
        ? selectedProviderId
        : null;
  if (!runtime) return null;
  const explicitLabel = coerceText(selectedProvider?.label).trim();
  if (explicitLabel) return `Provider: ${explicitLabel}`;
  const provider = fallbackProviders.find((entry: HelixAgentRuntimeDescriptor) => entry.id === runtime);
  const fallbackLabel =
    runtime === "codex"
      ? "Codex Workstation Mode"
      : runtime === "future"
        ? "Future Agent Wrapper"
        : "Helix Ask Native";
  return `Provider: ${provider?.label || fallbackLabel}`;
}

function readModelFromCodexArgs(value: unknown): string | null {
  const args = Array.isArray(value) ? value.map(coerceText) : [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]?.trim();
    if (!arg) continue;
    if (arg === "-m" || arg === "--model") {
      const next = args[index + 1]?.trim();
      if (next) return next;
    }
    const equalsMatch = arg.match(/^(?:--model|-m)=(.+)$/);
    if (equalsMatch?.[1]?.trim()) return equalsMatch[1].trim();
  }
  return null;
}

const HELIX_ASK_MODEL_METADATA_KEYS = [
  "llm_http_model_configured",
  "llm_model",
  "model",
  "model_id",
  "modelId",
  "model_name",
  "selected_model",
  "selectedModel",
  "openai_model",
  "openaiModel",
  "modelUsed",
  "model_preference",
  "modelPreference",
  "voice_model_id",
  "voiceModelId",
  "tts_model_id",
  "ttsModelId",
  "service_model_id",
  "serviceModelId",
  "selected_model_or_service",
  "resolved_model_or_service",
] as const;

const HELIX_ASK_MODEL_CONTAINER_KEYS = [
  "agent_loop",
  "agentLoop",
  "agent_runtime_loop",
  "agentRuntimeLoop",
  "turn_runtime",
  "turnRuntime",
  "runtime",
  "debug",
  "iterations",
  "steps",
  "objective_step_transcripts",
  "model_calls",
  "modelCalls",
  "sampling_events",
  "samplingEvents",
  "model_decision_audits",
  "modelDecisionAudits",
  "workstation_gateway_call_results",
  "workstationGatewayCallResults",
  "workstation_gateway_observation_packets",
  "workstationGatewayObservationPackets",
  "capability_lane_call_results",
  "capabilityLaneCallResults",
  "capability_lane_observation_packets",
  "capabilityLaneObservationPackets",
  "current_turn_artifact_ledger",
  "currentTurnArtifactLedger",
  "action_envelope",
  "actionEnvelope",
  "workstation_actions",
  "workstationActions",
  "observation_packet",
  "observationPacket",
  "observation",
  "request",
  "receipt",
  "host_projection",
  "hostProjection",
  "payload",
  "result",
  "turn_transcript",
  "turnTranscript",
  "events",
  "ask_turn_events",
  "askTurnEvents",
] as const;

function collectModelMetadataCandidates(value: unknown, depth = 0): string[] {
  if (depth > 5) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectModelMetadataCandidates(entry, depth + 1));
  }
  const record = readRecord(value);
  if (!record) return [];
  const candidates: unknown[] = [readModelFromCodexArgs(record.codex_args)];
  for (const key of HELIX_ASK_MODEL_METADATA_KEYS) {
    candidates.push(record[key]);
  }
  for (const key of HELIX_ASK_MODEL_CONTAINER_KEYS) {
    if (record[key] !== undefined) {
      candidates.push(...collectModelMetadataCandidates(record[key], depth + 1));
    }
  }
  return candidates.map(coerceModelMetadataText).filter(Boolean);
}

function collectRuntimeLoopModels(value: unknown): string[] {
  const record = readRecord(value);
  if (!record) return [];
  const candidates: unknown[] = [
    record.llm_http_model_configured,
    record.llm_model,
    record.model,
    record.model_id,
    record.selected_model,
    record.openai_model,
    readModelFromCodexArgs(record.codex_args),
  ];
  const arrays = [
    record.iterations,
    record.steps,
    record.objective_step_transcripts,
    record.model_calls,
    record.sampling_events,
  ];
  for (const arrayValue of arrays) {
    if (!Array.isArray(arrayValue)) continue;
    for (const item of arrayValue) {
      const itemRecord = readRecord(item);
      if (!itemRecord) continue;
      candidates.push(
        itemRecord.llm_http_model_configured,
        itemRecord.llm_model,
        itemRecord.model,
        itemRecord.model_id,
        itemRecord.selected_model,
        itemRecord.openai_model,
        readModelFromCodexArgs(itemRecord.codex_args),
        ...collectModelMetadataCandidates(itemRecord),
      );
    }
  }
  return [
    ...candidates.map(coerceModelMetadataText).filter(Boolean),
    ...collectModelMetadataCandidates(record),
  ];
}

export function resolveHelixAskModelUsageLabel(response: unknown): string | null {
  const languageModelPolicySummary = resolveHelixAskLanguageModelPolicySummary(response);
  if (languageModelPolicySummary) return languageModelPolicySummary;
  const record = readRecord(response);
  const debug = readRecord(record?.debug);
  const agentLoop = readRecord(record?.agent_loop ?? record?.agentLoop ?? debug?.agent_loop ?? debug?.agentLoop);
  const agentRuntimeLoop = readRecord(
    record?.agent_runtime_loop ??
      record?.agentRuntimeLoop ??
      debug?.agent_runtime_loop ??
      debug?.agentRuntimeLoop,
  );
  const selectedProvider = readRecord(record?.selected_agent_provider) ?? readRecord(debug?.selected_agent_provider);
  const selectedProviderId = selectedProvider?.id;
  const runtime = isHelixAgentRuntimeId(record?.agent_runtime)
    ? record.agent_runtime
    : isHelixAgentRuntimeId(debug?.agent_runtime)
      ? debug.agent_runtime
      : isHelixAgentRuntimeId(selectedProviderId)
        ? selectedProviderId
        : null;
  const candidates = [
    record?.llm_http_model_configured,
    debug?.llm_http_model_configured,
    agentLoop?.llm_http_model_configured,
    agentRuntimeLoop?.llm_http_model_configured,
    record?.llm_model,
    debug?.llm_model,
    agentLoop?.llm_model,
    agentRuntimeLoop?.llm_model,
    record?.model,
    debug?.model,
    agentLoop?.model,
    agentRuntimeLoop?.model,
    record?.model_id,
    debug?.model_id,
    agentLoop?.model_id,
    agentRuntimeLoop?.model_id,
    record?.selected_model,
    debug?.selected_model,
    agentLoop?.selected_model,
    agentRuntimeLoop?.selected_model,
    record?.openai_model,
    debug?.openai_model,
    agentLoop?.openai_model,
    agentRuntimeLoop?.openai_model,
    selectedProvider?.model,
    selectedProvider?.model_id,
    readModelFromCodexArgs(record?.codex_args),
    readModelFromCodexArgs(debug?.codex_args),
    readModelFromCodexArgs(agentLoop?.codex_args),
    readModelFromCodexArgs(agentRuntimeLoop?.codex_args),
    ...collectRuntimeLoopModels(record?.agent_runtime_loop),
    ...collectRuntimeLoopModels(debug?.agent_runtime_loop),
    ...collectModelMetadataCandidates(record),
    ...collectModelMetadataCandidates(debug),
  ];
  const models = Array.from(new Set(candidates.map(coerceModelMetadataText).filter(Boolean)));
  if (models.length === 0) {
    return runtime === "codex" ? "Model: not reported by backend" : null;
  }
  return `Model${models.length > 1 ? "s" : ""}: ${models.slice(0, 3).join(", ")}`;
}
