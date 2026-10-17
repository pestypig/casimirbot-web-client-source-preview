import type { HelixAgentRuntimeDescriptor } from "@shared/helix-agent-runtime";
import {
  DEFAULT_HELIX_AGENT_RUNTIME_PROVIDERS,
  isHelixAgentRuntimeId,
  resolveHelixAskActualAgentProviderLabel,
} from "@/lib/helix/ask-agent-runtime-display";
import {
  buildHelixLiveTranslationUiProjections,
  summarizeHelixLiveTranslationUiProjectionTraffic,
} from "@/lib/helix/live-translation-projection";
import { resolveHelixAccountLanguageTranslationProjectionHealth } from "@/lib/helix/account-language-translation-health";

type RecordLike = Record<string, unknown>;

export type HelixAskRuntimeTurnSummaryRow = {
  key: string;
  label: string;
  value: string;
};

export type HelixAskRuntimeTurnSummary = {
  rows: HelixAskRuntimeTurnSummaryRow[];
};

function readRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordLike) : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function coerceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const text = coerceText(value).toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  return null;
}

function serializeCompactMetadata(value: unknown): string {
  const record = readRecord(value);
  if (!record) return "";
  try {
    return JSON.stringify(record);
  } catch {
    return "";
  }
}

function readCapabilityLaneReceiptRef(...values: unknown[]): string {
  const records = values
    .map((value) => readRecord(value))
    .filter((record): record is RecordLike => Boolean(record));
  const latest = records.map((record) => coerceText(record.latest_receipt_ref)).find(Boolean);
  if (latest) return latest;
  const direct = records.map((record) => coerceText(record.receipt_ref)).find(Boolean);
  if (direct) return direct;
  const last = records.map((record) => coerceText(record.last_receipt_ref)).find(Boolean);
  if (last) return last;
  for (const value of values) {
    if (readRecord(value)) continue;
    const text = coerceText(value);
    if (text) return text;
  }
  return "";
}

function readNestedRecord(...values: unknown[]): RecordLike | null {
  for (const value of values) {
    const record = readRecord(value);
    if (record) return record;
  }
  return null;
}

function readBackendSelectionDecisionParts(value: unknown): string[] {
  const decision = readRecord(value);
  if (!decision) return [];
  const outcome = coerceText(decision.outcome);
  const terminalOwner = coerceText(decision.terminal_authority_owner);
  return [
    outcome ? `decision ${outcome}` : "",
    decision.selected_runtime_provider_remains_root === true ? "runtime root preserved" : "",
    decision.live_backend_execution_enabled === false ? "no live backend execution" : "",
    terminalOwner ? `terminal authority ${terminalOwner}` : "",
  ].filter(Boolean);
}

function readCapabilityLanePermissionText(value: unknown): string {
  const permissions = readRecord(value);
  if (!permissions) return "";
  const write = permissions.write === true;
  const shell = permissions.shell === true;
  const codeMutation = permissions.code_mutation === true || permissions.codeMutation === true;
  if (!write && !shell && !codeMutation) return "permissions non-mutating";
  const allowed = [
    write ? "write allowed" : "",
    shell ? "shell allowed" : "",
    codeMutation ? "code mutation allowed" : "",
  ].filter(Boolean);
  return allowed.length ? `permissions ${allowed.join(", ")}` : "";
}

function readLanePacketBackendParts(packet: RecordLike | null, trace?: RecordLike | null): string[] {
  const stateDelta = readRecord(packet?.state_delta);
  const shadowExecution = readRecord(stateDelta?.capability_lane_shadow_execution);
  const decision = readRecord(packet?.backend_selection_decision);
  const traceDecision = readRecord(trace?.backend_selection_decision);
  const selectedBackend =
    coerceText(packet?.selected_backend_provider) ||
    coerceText(shadowExecution?.selected_backend_provider) ||
    coerceText(decision?.selected_backend_provider) ||
    coerceText(trace?.selected_backend_provider) ||
    coerceText(traceDecision?.selected_backend_provider);
  const requestedBackend =
    coerceText(packet?.requested_backend_provider) ||
    coerceText(shadowExecution?.requested_backend_provider) ||
    coerceText(decision?.requested_backend_provider) ||
    coerceText(trace?.requested_backend_provider) ||
    coerceText(traceDecision?.requested_backend_provider);
  const execution =
    coerceText(packet?.execution_status) ||
    coerceText(shadowExecution?.execution_status) ||
    coerceText(trace?.execution_status) ||
    (packet?.status === "succeeded" ? "executed_observation_only" : "");
  const availability =
    coerceText(packet?.availability_status) ||
    coerceText(shadowExecution?.availability_status) ||
    coerceText(trace?.availability_status);
  const permission =
    coerceText(packet?.permission_status) ||
    coerceText(shadowExecution?.permission_status) ||
    coerceText(trace?.permission_status);
  const cost =
    coerceText(packet?.cost_class) ||
    coerceText(shadowExecution?.cost_class) ||
    coerceText(trace?.cost_class);
  const latency =
    coerceText(packet?.latency_class) ||
    coerceText(shadowExecution?.latency_class) ||
    coerceText(trace?.latency_class);
  const privacy =
    coerceText(packet?.privacy_class) ||
    coerceText(shadowExecution?.privacy_class) ||
    coerceText(trace?.privacy_class);
  const fallback =
    coerceText(packet?.fallback_backend_provider) ||
    coerceText(shadowExecution?.fallback_backend_provider) ||
    coerceText(decision?.fallback_backend_provider) ||
    coerceText(trace?.fallback_backend_provider) ||
    coerceText(traceDecision?.fallback_backend_provider);
  const observationOnly =
    packet?.terminal_eligible === false ||
    packet?.assistant_answer === false ||
    shadowExecution?.terminal_eligible === false ||
    shadowExecution?.assistant_answer === false ||
    trace?.terminal_eligible === false ||
    trace?.assistant_answer === false;
  return [
    selectedBackend ? `backend ${selectedBackend}` : "",
    requestedBackend ? `requested backend ${requestedBackend}` : "",
    execution ? `execution ${execution}` : "",
    availability ? `availability ${availability}` : "",
    permission ? `permission ${permission}` : "",
    cost ? `cost ${cost}` : "",
    latency ? `latency ${latency}` : "",
    privacy ? `privacy ${privacy}` : "",
    fallback ? `fallback ${fallback}` : "",
    ...readBackendSelectionDecisionParts(decision ?? traceDecision),
    observationOnly ? "observation-only" : "",
  ].filter(Boolean);
}

function readSelectedRuntime(record: RecordLike | null, debug: RecordLike | null): string {
  const provider = readRecord(record?.selected_agent_provider) ?? readRecord(debug?.selected_agent_provider);
  const providerId = provider?.id;
  if (isHelixAgentRuntimeId(record?.agent_runtime)) return record.agent_runtime;
  if (isHelixAgentRuntimeId(debug?.agent_runtime)) return debug.agent_runtime;
  if (isHelixAgentRuntimeId(providerId)) return providerId;
  const manifest = readRecord(record?.capability_lane_manifest) ?? readRecord(debug?.capability_lane_manifest);
  const manifestRuntime = manifest?.selected_runtime_agent_provider;
  return isHelixAgentRuntimeId(manifestRuntime) ? manifestRuntime : "";
}

function readAdapterBoundary(record: RecordLike | null, debug: RecordLike | null, runtime: string): string {
  const selectionTrace =
    readRecord(record?.agent_runtime_selection_trace) ?? readRecord(debug?.agent_runtime_selection_trace);
  const provider =
    readRecord(record?.selected_agent_provider) ??
    readRecord(debug?.selected_agent_provider);
  const adapterContract =
    readRecord(record?.agent_runtime_adapter_contract) ??
    readRecord(debug?.agent_runtime_adapter_contract);
  const value =
    coerceText(selectionTrace?.adapter_boundary) ||
    coerceText(selectionTrace?.adapter_boundary_id) ||
    coerceText(selectionTrace?.provider_adapter_boundary) ||
    coerceText(provider?.adapter_boundary) ||
    coerceText(adapterContract?.adapter_boundary) ||
    coerceText(adapterContract?.boundary);
  if (value) return value;
  return runtime ? "provider adapter boundary" : "";
}

function readLaneStatusSummary(record: RecordLike | null, debug: RecordLike | null): string {
  const manifest = readRecord(record?.capability_lane_manifest) ?? readRecord(debug?.capability_lane_manifest);
  const statuses = readRecord(record?.capability_lane_statuses) ?? readRecord(debug?.capability_lane_statuses);
  const laneRecords = readArray(manifest?.lanes)
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry));
  const laneIds = laneRecords.length > 0
    ? laneRecords.map((lane) => coerceText(lane.lane_id)).filter(Boolean)
    : readArray(record?.capability_lane_ids ?? debug?.capability_lane_ids).map(coerceText).filter(Boolean);

  const summaries = laneIds.slice(0, 6).map((laneId) => {
    const lane = laneRecords.find((entry) => coerceText(entry.lane_id) === laneId);
    const status = coerceText(statuses?.[laneId]) || coerceText(lane?.status) || "unknown";
    const backend = coerceText(lane?.backend_family);
    return backend ? `${laneId}: ${status} (${backend})` : `${laneId}: ${status}`;
  });
  if (laneIds.length > 6) summaries.push(`+${laneIds.length - 6} more`);
  return summaries.join(" | ");
}

function readModelVisibleLaneManifest(record: RecordLike | null, debug: RecordLike | null): RecordLike | null {
  const agentLoop = readNestedRecord(record?.agent_runtime_loop, debug?.agent_runtime_loop);
  const debugExport = readNestedRecord(record?.debug_export, debug?.debug_export);
  const adapterContract =
    readNestedRecord(record?.agent_runtime_adapter_contract, debug?.agent_runtime_adapter_contract) ??
    readNestedRecord(agentLoop?.agent_runtime_adapter_contract, debugExport?.agent_runtime_adapter_contract);
  return (
    readRecord(record?.model_visible_capability_lane_manifest) ??
    readRecord(debug?.model_visible_capability_lane_manifest) ??
    readRecord(agentLoop?.model_visible_capability_lane_manifest) ??
    readRecord(debugExport?.model_visible_capability_lane_manifest) ??
    readRecord(adapterContract?.model_visible_capability_lane_manifest)
  );
}

function readModelVisibleLaneSummary(record: RecordLike | null, debug: RecordLike | null): string {
  const manifest = readModelVisibleLaneManifest(record, debug);
  const laneRecords = readArray(manifest?.lanes)
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry));

  const summaries = laneRecords.map((lane) => {
    const laneId = coerceText(lane.lane_id);
    if (!laneId) return "";
    const status = coerceText(lane.status);
    const backend = coerceText(lane.default_backend_provider) || coerceText(lane.backend_family);
    const capability = readArray(lane.capabilities)
      .map((entry) => readRecord(entry))
      .map((entry) => {
        const capabilityId = coerceText(entry?.capability_id);
        const oneShot = coerceText(entry?.one_shot_status);
        const session = coerceText(entry?.session_status);
        return [
          capabilityId,
          oneShot ? `one-shot ${oneShot}` : "",
          session ? `session ${session}` : "",
        ].filter(Boolean).join(" ");
      })
      .find(Boolean);
    return [
      laneId,
      status ? `status ${status}` : "",
      backend ? `default backend ${backend}` : "",
      capability ? `capability ${capability}` : "",
    ].filter(Boolean).join(" | ");
  }).filter(Boolean);

  const visible = Array.from(new Set(summaries)).slice(0, 6);
  if (summaries.length > visible.length) visible.push(`+${summaries.length - visible.length} more`);
  if (visible.length === 0) return "";
  return `${visible.join(" || ")} || visible does not mean executed`;
}

function readLaneBackendProviderConfigSummary(record: RecordLike | null, debug: RecordLike | null): string {
  const manifest = readRecord(record?.capability_lane_manifest) ?? readRecord(debug?.capability_lane_manifest);
  const laneRecords = readArray(manifest?.lanes)
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry));
  const providerSummaries = laneRecords.flatMap((lane) => {
    const laneId = coerceText(lane.lane_id);
    return readArray(lane.backend_providers)
      .map((entry) => readRecord(entry))
      .filter((entry): entry is RecordLike => Boolean(entry))
      .map((provider) => {
        const providerId = coerceText(provider.provider_id);
        if (!providerId) return "";
        const configuration = coerceText(provider.configuration_status);
        const availability = coerceText(provider.availability_status);
        const permission = coerceText(provider.permission_status);
        const latency = coerceText(provider.latency_class);
        const privacy = coerceText(provider.privacy_class);
        const fallback = coerceText(provider.fallback_backend_provider);
        const configuredEnv = readArray(provider.configured_env_vars).map(coerceText).filter(Boolean).join(",");
        return [
          laneId ? `${laneId}/${providerId}` : providerId,
          configuration ? `config ${configuration}` : "",
          availability ? `availability ${availability}` : "",
          permission ? `permission ${permission}` : "",
          latency ? `latency ${latency}` : "",
          privacy ? `privacy ${privacy}` : "",
          fallback ? `fallback ${fallback}` : "",
          configuredEnv ? `configured env ${configuredEnv}` : "",
          provider.raw_secret_exposed === false ? "no raw secrets" : "",
        ].filter(Boolean).join(" | ");
      });
  }).filter(Boolean);

  const unique = Array.from(new Set(providerSummaries));
  const visible = unique.slice(0, 6);
  if (unique.length > visible.length) visible.push(`+${unique.length - visible.length} more`);
  return visible.join(" || ");
}

function readLaneBackendSummary(record: RecordLike | null, debug: RecordLike | null): string {
  const trace =
    readRecord(record?.capability_lane_resolve_trace) ??
    readRecord(debug?.capability_lane_resolve_trace) ??
    readRecord(record?.capability_lane_resolve_trace_shape) ??
    readRecord(debug?.capability_lane_resolve_trace_shape);
  const decision = readRecord(trace?.backend_selection_decision);
  const requestedLane = coerceText(trace?.requested_lane);
  const backend = coerceText(trace?.selected_backend_provider) || coerceText(trace?.resolved_backend_provider);
  const requestedAvailability = coerceText(trace?.requested_backend_availability_status);
  const requestedPermission = coerceText(trace?.requested_backend_permission_status);
  const requestedConfiguration = coerceText(trace?.requested_backend_configuration_status);
  const service = coerceText(trace?.selected_model_or_service) || coerceText(trace?.resolved_model_or_service);
  const status = coerceText(trace?.availability_status) || coerceText(trace?.lane_status);
  const reason = coerceText(trace?.selection_reason) || coerceText(trace?.blocked_reason);
  if (!requestedLane && !backend && !service && !status && !reason) return "";
  return [
    requestedLane ? `lane ${requestedLane}` : "",
    backend ? `backend ${backend}` : "",
    requestedConfiguration ? `requested configuration ${requestedConfiguration}` : "",
    requestedAvailability ? `requested availability ${requestedAvailability}` : "",
    requestedPermission ? `requested permission ${requestedPermission}` : "",
    ...readBackendSelectionDecisionParts(decision),
    service ? `service ${service}` : "",
    status ? `status ${status}` : "",
    reason ? `reason ${reason}` : "",
  ].filter(Boolean).join(" | ");
}

function readTurnToolSummary(record: RecordLike | null, debug: RecordLike | null): string {
  const agentLoop = readNestedRecord(record?.agent_runtime_loop, debug?.agent_runtime_loop);
  const debugExport = readNestedRecord(record?.debug_export, debug?.debug_export);
  const calls = [
    ...readArray(record?.workstation_gateway_call_results),
    ...readArray(debug?.workstation_gateway_call_results),
    ...readArray(agentLoop?.workstation_gateway_call_results),
    ...readArray(debugExport?.workstation_gateway_call_results),
  ]
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry));
  const tools = calls
    .map((call) => {
      const admission = readRecord(call.gateway_admission);
      const capability =
        coerceText(call.capability_id) ||
        coerceText(call.capabilityId) ||
        coerceText(admission?.requested_capability);
      const status = call.ok === true ? "ok" : coerceText(call.status) || "blocked";
      return capability ? `${capability} (${status})` : "";
    })
    .filter(Boolean);
  return Array.from(new Set(tools)).slice(0, 6).join(" | ");
}

function readLaneProjectionSummary(record: RecordLike | null, debug: RecordLike | null): string {
  const calls = [
    ...readArray(record?.capability_lane_call_results),
    ...readArray(record?.capability_lane_results),
    ...readArray(debug?.capability_lane_call_results),
    ...readArray(debug?.capability_lane_results),
  ]
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry));
  const packets = [
    ...readArray(record?.capability_lane_observation_packets),
    ...readArray(debug?.capability_lane_observation_packets),
  ]
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry));
  const projectionReceipts = [
    ...readArray(record?.capability_lane_projection_receipts),
    ...readArray(debug?.capability_lane_projection_receipts),
  ]
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry));
  const traces = [
    ...readArray(record?.capability_lane_resolve_traces),
    ...readArray(debug?.capability_lane_resolve_traces),
    ...readArray(record?.capability_lane_backend_selections),
    ...readArray(debug?.capability_lane_backend_selections),
  ]
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry));

  const summaries = calls.map((call) => {
    const capability = coerceText(call.capability) || coerceText(call.capability_key) || coerceText(call.capability_id);
    const laneId = coerceText(call.lane_id) || capability.split(".")[0];
    const trace = traces.find((candidate) => {
      const traceCapability =
        coerceText(candidate.capability) ||
        coerceText(candidate.capability_key) ||
        coerceText(candidate.capability_id);
      const traceLane =
        coerceText(candidate.lane_id) ||
        coerceText(candidate.requested_lane);
      return Boolean(
        (capability && traceCapability === capability) ||
        (laneId && traceLane === laneId),
      );
    }) ?? readRecord(call.lane_resolve_trace);
    const observation = readRecord(call.observation);
    const packet = readRecord(call.observation_packet);
    const packetState = readRecord(packet?.state_delta);
    const observationRef = coerceText(observation?.observation_ref) || coerceText(call.observation_ref);
    const fallbackPacket = observationRef
      ? packets.find((candidate) => coerceText(candidate.observation_ref) === observationRef)
      : null;
    const packetForBackend = packet ?? fallbackPacket ?? null;
    const backendParts = readLanePacketBackendParts(packetForBackend, trace);
    const fallbackState = readRecord(fallbackPacket?.state_delta);
    const status = call.ok === true ? "projected" : coerceText(packet?.status) || "not_projected";
    const packetSummary = coerceText(packet?.observation_summary) || coerceText(call.observation_summary);

    if (capability === "live_translation.translate_text") {
      const directChunk = readRecord(packetState?.live_translation_chunk);
      const chunk = directChunk ?? readRecord(fallbackState?.live_translation_chunk);
      const projectionReceipt =
        readRecord(packetState?.live_translation_projection_receipt) ??
        readRecord(fallbackState?.live_translation_projection_receipt);
      const translatedText = coerceText(call.translated_text) || coerceText(observation?.translated_text);
      const targetLanguage = coerceText(observation?.target_language);
      const projectionTarget = coerceText(observation?.projection_target) || coerceText(chunk?.projection_target);
      const projectionStatus = coerceText(projectionReceipt?.projection_status);
      const receiptRef = coerceText(projectionReceipt?.receipt_ref);
      const laneSessionId =
        coerceText(call.lane_session_id) ||
        coerceText(observation?.lane_session_id) ||
        coerceText(chunk?.lane_session_id);
      const sourceId = coerceText(observation?.source_id) || coerceText(chunk?.source_id);
      const docPath = coerceText(observation?.doc_path) || coerceText(chunk?.doc_path) || coerceText(projectionReceipt?.doc_path);
      const sourceHash =
        coerceText(observation?.source_hash) ||
        coerceText(observation?.sourceHash) ||
        coerceText(chunk?.source_hash) ||
        coerceText(chunk?.sourceHash);
      const sourceKind = coerceText(observation?.source_kind) || coerceText(chunk?.source_kind);
      const sourceTextHash =
        coerceText(observation?.source_text_hash) ||
        coerceText(observation?.sourceTextHash) ||
        coerceText(chunk?.source_text_hash) ||
        coerceText(chunk?.sourceTextHash);
      const sourceTextCharCount =
        coerceText(observation?.source_text_char_count) ||
        coerceText(observation?.sourceTextCharCount) ||
        coerceText(chunk?.source_text_char_count) ||
        coerceText(chunk?.sourceTextCharCount);
      const accountLocale = coerceText(observation?.account_locale) || coerceText(chunk?.account_locale);
      const chunkId = coerceText(observation?.chunk_id) || coerceText(chunk?.chunk_id);
      const chunkIndex = coerceText(observation?.chunk_index) || coerceText(chunk?.chunk_index);
      const dedupeKey = coerceText(observation?.dedupe_key) || coerceText(chunk?.dedupe_key);
      const sourceEventId = coerceText(observation?.source_event_id) || coerceText(chunk?.source_event_id);
      const sourceEventMs = coerceText(observation?.source_event_ms) || coerceText(chunk?.source_event_ms);
      const observedAtMs = coerceText(observation?.observed_at_ms) || coerceText(chunk?.observed_at_ms);
      const freshness = coerceText(observation?.freshness_status) || coerceText(chunk?.freshness_status);
      const cancelled = observation?.cancel_requested === true || chunk?.cancel_requested === true;
      const stale = projectionReceipt?.stale === true;
      const pieces = [
        "live_translation",
        projectionStatus ? `projection ${projectionStatus}` : "",
        projectionTarget ? `target ${projectionTarget}` : "",
        laneSessionId ? `session ${laneSessionId}` : "",
        targetLanguage ? `language ${targetLanguage}` : "",
        sourceId ? `source ${sourceId}` : "",
        docPath ? `doc path ${docPath}` : "",
        sourceHash ? `source hash ${sourceHash}` : "",
        sourceKind ? `source kind ${sourceKind}` : "",
        sourceTextHash ? `source payload hash ${sourceTextHash}` : "",
        sourceTextCharCount ? `source payload chars ${sourceTextCharCount}` : "",
        accountLocale ? `account locale ${accountLocale}` : "",
        chunkId ? `chunk ${chunkId}` : "",
        chunkIndex ? `index ${chunkIndex}` : "",
        dedupeKey ? `dedupe ${dedupeKey}` : "",
        sourceEventId ? `source event id ${sourceEventId}` : "",
        sourceEventMs ? `source event ms ${sourceEventMs}` : "",
        observedAtMs ? `observed ${observedAtMs}` : "",
        freshness ? `freshness ${freshness}` : "",
        stale ? "stale" : "",
        cancelled ? "cancelled" : status,
        translatedText && !cancelled ? `text ${translatedText}` : "",
        receiptRef ? `receipt ${receiptRef}` : "",
        observationRef ? `ref ${observationRef}` : "",
        ...backendParts,
      ].filter(Boolean);
      return pieces.join(" | ");
    }

    if (capability === "utility_text.normalize_text") {
      const normalizedText = coerceText(call.normalized_text) || coerceText(observation?.normalized_text);
      const mode = coerceText(observation?.normalization_mode);
      const pieces = [
        "utility_text",
        "normalize_text",
        mode ? `mode ${mode}` : "",
        status,
        normalizedText ? `text ${normalizedText}` : "",
        observationRef ? `ref ${observationRef}` : "",
        ...backendParts,
      ].filter(Boolean);
      return pieces.join(" | ");
    }

    if (capability === "workstation_tool_reference.list_capabilities") {
      const count = coerceText(call.capability_count) || coerceText(observation?.capability_count);
      const mode = coerceText(observation?.gateway_mode);
      const pieces = [
        "workstation_tool_reference",
        "list_capabilities",
        mode ? `mode ${mode}` : "",
        count ? `count ${count}` : "",
        status,
        observationRef ? `ref ${observationRef}` : "",
        ...backendParts,
      ].filter(Boolean);
      return pieces.join(" | ");
    }

    if (capability === "workstation_tool_reference.collect_visible_translation_targets") {
      const targetBatchCandidates = [
        readRecord(packetState?.visible_translation_target_batch),
        readRecord(fallbackState?.visible_translation_target_batch),
        readRecord(observation?.target_batch),
      ].filter((entry): entry is RecordLike => Boolean(entry));
      const targetBatch =
        targetBatchCandidates.find((entry) => readArray(entry.targets).length > 0) ??
        targetBatchCandidates[0] ??
        null;
      const requestedCollectorCapability = coerceText(targetBatch?.requested_collector_capability);
      const executedCollectorCapability =
        coerceText(targetBatch?.collector_capability) ||
        "workstation_tool_reference.collect_visible_translation_targets";
      const targets = readArray(targetBatch?.targets)
        .map(readRecord)
        .filter((target): target is RecordLike => Boolean(target));
      const targetCount = coerceText(call.target_count) || coerceText(targetBatch?.target_count) || `${targets.length}`;
      const targetLanguage =
        coerceText(targets[0]?.target_language) ||
        coerceText(call.target_language) ||
        coerceText(observation?.target_language);
      const projectionTarget =
        coerceText(targets[0]?.projection_target) ||
        coerceText(call.projection_target) ||
        coerceText(observation?.projection_target);
      const sourceKind = coerceText(targets[0]?.source_kind);
      const panelId = coerceText(targets[0]?.panel_id);
      const sourceId = coerceText(targets[0]?.source_id);
      const docPath = coerceText(targets[0]?.doc_path);
      const sourceHash = coerceText(targets[0]?.source_hash);
      const sourceTextHash = coerceText(targets[0]?.source_text_hash);
      const sourceTextCharCount = coerceText(targets[0]?.source_text_char_count);
      const chunkId = coerceText(targets[0]?.chunk_id);
      const sourceEventId = coerceText(targets[0]?.source_event_id);
      const regionId = coerceText(targets[0]?.region_id);
      const existingObservationRef = coerceText(targets[0]?.existing_observation_ref);
      const existingReceiptRef =
        coerceText(targets[0]?.existing_receipt_ref) ||
        coerceText(targets[0]?.existing_translation_receipt_ref);
      const existingProjectionStatus = coerceText(targets[0]?.existing_projection_status);
      const existingFreshnessStatus = coerceText(targets[0]?.existing_freshness_status);
      const existingTerminalAuthorityStatus = coerceText(targets[0]?.existing_terminal_authority_status);
      const existingSourceEventMs = coerceText(targets[0]?.existing_source_event_ms);
      const existingObservedAtMs = coerceText(targets[0]?.existing_observed_at_ms);
      const collectorAnswerAuthorityFalse =
        targetBatch?.answer_authority === false || targets[0]?.answer_authority === false;
      const collectorTerminalEligibleFalse =
        targetBatch?.terminal_eligible === false || targets[0]?.terminal_eligible === false;
      const collectorAssistantAnswerFalse =
        targetBatch?.assistant_answer === false || targets[0]?.assistant_answer === false;
      const collectorReentryRequiredTrue =
        targetBatch?.reentry_required === true || targets[0]?.reentry_required === true;
      const pieces = [
        "workstation_tool_reference",
        "visible_translation_targets",
        requestedCollectorCapability && requestedCollectorCapability !== executedCollectorCapability
          ? `requested collector ${requestedCollectorCapability}`
          : "",
        executedCollectorCapability ? `executed collector ${executedCollectorCapability}` : "",
        targetCount ? `target chunks ${targetCount}` : "",
        targetLanguage ? `target ${targetLanguage}` : "",
        projectionTarget ? `projection ${projectionTarget}` : "",
        sourceKind ? `source kind ${sourceKind}` : "",
        panelId ? `panel ${panelId}` : "",
        sourceId ? `source ${sourceId}` : "",
        docPath ? `doc path ${docPath}` : "",
        sourceHash ? `source hash ${sourceHash}` : "",
        sourceTextHash ? `source text hash ${sourceTextHash}` : "",
        sourceTextCharCount ? `source text chars ${sourceTextCharCount}` : "",
        chunkId ? `first chunk ${chunkId}` : "",
        sourceEventId ? `source event ${sourceEventId}` : "",
        regionId ? `region ${regionId}` : "",
        existingObservationRef ? `existing observation ${existingObservationRef}` : "",
        existingReceiptRef ? `existing receipt ${existingReceiptRef}` : "",
        existingProjectionStatus ? `existing projection ${existingProjectionStatus}` : "",
        existingFreshnessStatus ? `existing freshness ${existingFreshnessStatus}` : "",
        existingTerminalAuthorityStatus ? `existing terminal authority ${existingTerminalAuthorityStatus}` : "",
        existingSourceEventMs ? `existing source event ms ${existingSourceEventMs}` : "",
        existingObservedAtMs ? `existing observed ${existingObservedAtMs}` : "",
        collectorAnswerAuthorityFalse ? "answer authority false" : "",
        collectorTerminalEligibleFalse ? "terminal eligible false" : "",
        collectorAssistantAnswerFalse ? "assistant answer false" : "",
        collectorReentryRequiredTrue ? "re-entry required true" : "",
        status,
        observationRef ? `ref ${observationRef}` : "",
        ...backendParts,
        "translation still requires live_translation.translate_text",
      ].filter(Boolean);
      return pieces.join(" | ");
    }

    if (!capability) return "";
    const pieces = [
      capability,
      status,
      packetSummary ? `summary ${packetSummary}` : "",
      observationRef ? `ref ${observationRef}` : "",
      ...backendParts,
    ].filter(Boolean);
    return pieces.join(" | ");
  }).filter(Boolean);

  const receiptSummaries = projectionReceipts.map((receipt) => {
    const payload = readRecord(receipt.payload);
    const capability =
      coerceText(receipt.capability) ||
      coerceText(receipt.capability_key) ||
      coerceText(payload?.capability);
    const projectionStatus =
      coerceText(receipt.projection_status) ||
      coerceText(payload?.projection_status) ||
      coerceText(receipt.status);
    const projectionTarget =
      coerceText(receipt.projection_target) ||
      coerceText(payload?.projection_target);
    const sourceId =
      coerceText(receipt.source_id) ||
      coerceText(payload?.source_id);
    const panelId =
      coerceText(receipt.panel_id) ||
      coerceText(receipt.panelId) ||
      coerceText(payload?.panel_id) ||
      coerceText(payload?.panelId);
    const regionId =
      coerceText(receipt.region_id) ||
      coerceText(receipt.regionId) ||
      coerceText(payload?.region_id) ||
      coerceText(payload?.regionId);
    const bbox =
      serializeCompactMetadata(receipt.bbox) ||
      serializeCompactMetadata(receipt.bbox_px) ||
      serializeCompactMetadata(receipt.bboxPx) ||
      serializeCompactMetadata(payload?.bbox) ||
      serializeCompactMetadata(payload?.bbox_px) ||
      serializeCompactMetadata(payload?.bboxPx);
    const docPath =
      coerceText(receipt.doc_path) ||
      coerceText(receipt.docPath) ||
      coerceText(payload?.doc_path) ||
      coerceText(payload?.docPath);
    const sourceHash =
      coerceText(receipt.source_hash) ||
      coerceText(receipt.sourceHash) ||
      coerceText(payload?.source_hash) ||
      coerceText(payload?.sourceHash);
    const sourceKind =
      coerceText(receipt.source_kind) ||
      coerceText(payload?.source_kind);
    const sourceTextHash =
      coerceText(receipt.source_text_hash) ||
      coerceText(receipt.sourceTextHash) ||
      coerceText(payload?.source_text_hash) ||
      coerceText(payload?.sourceTextHash);
    const sourceTextCharCount =
      coerceText(receipt.source_text_char_count) ||
      coerceText(receipt.sourceTextCharCount) ||
      coerceText(payload?.source_text_char_count) ||
      coerceText(payload?.sourceTextCharCount);
    const accountLocale =
      coerceText(receipt.account_locale) ||
      coerceText(payload?.account_locale);
    const targetLanguage =
      coerceText(receipt.target_language) ||
      coerceText(payload?.target_language);
    const projectionKey =
      coerceText(receipt.projection_key) ||
      coerceText(receipt.projectionKey) ||
      coerceText(payload?.projection_key) ||
      coerceText(payload?.projectionKey);
    const chunkId = coerceText(receipt.chunk_id) || coerceText(payload?.chunk_id);
    const chunkIndex = coerceText(receipt.chunk_index) || coerceText(payload?.chunk_index);
    const dedupeKey = coerceText(receipt.dedupe_key) || coerceText(payload?.dedupe_key);
    const sourceEventId = coerceText(receipt.source_event_id) || coerceText(payload?.source_event_id);
    const sourceEventMs = coerceText(receipt.source_event_ms) || coerceText(payload?.source_event_ms);
    const observedAtMs = coerceText(receipt.observed_at_ms) || coerceText(payload?.observed_at_ms);
    const freshnessStatus = coerceText(receipt.freshness_status) || coerceText(payload?.freshness_status);
    const sessionDebugPhase =
      coerceText(receipt.session_debug_phase) ||
      coerceText(receipt.sessionDebugPhase) ||
      coerceText(payload?.session_debug_phase) ||
      coerceText(payload?.sessionDebugPhase);
    const sessionObservationStatus =
      coerceText(receipt.session_observation_status) ||
      coerceText(receipt.sessionObservationStatus) ||
      coerceText(payload?.session_observation_status) ||
      coerceText(payload?.sessionObservationStatus);
    const terminalAuthorityStatus =
      coerceText(receipt.terminal_authority_status) ||
      coerceText(receipt.terminalAuthorityStatus) ||
      coerceText(payload?.terminal_authority_status) ||
      coerceText(payload?.terminalAuthorityStatus);
    const reentryRequired =
      coerceBoolean(receipt.reentry_required) ??
      coerceBoolean(receipt.reentryRequired) ??
      coerceBoolean(payload?.reentry_required) ??
      coerceBoolean(payload?.reentryRequired);
    const translatedText =
      coerceText(receipt.translated_text) ||
      coerceText(receipt.translatedText) ||
      coerceText(payload?.translated_text) ||
      coerceText(payload?.translatedText);
    const accountLanguageHealth = projectionTarget === "account_language"
      ? resolveHelixAccountLanguageTranslationProjectionHealth({
        projectionStatus,
        translatedText,
        terminalAuthorityStatus,
        sessionDebugPhase,
        sessionObservationStatus,
        laneSessionId:
          coerceText(receipt.lane_session_id) ||
          coerceText(receipt.laneSessionId) ||
          coerceText(payload?.lane_session_id) ||
          coerceText(payload?.laneSessionId),
      })
      : "";
    const receiptRef = coerceText(receipt.receipt_ref);
    const observationRef = coerceText(receipt.observation_ref) || coerceText(payload?.observation_ref);
    const pieces = [
      capability || "capability_lane_projection",
      projectionStatus ? `projection ${projectionStatus}` : "",
      accountLanguageHealth ? `account-language health ${accountLanguageHealth}` : "",
      projectionKey ? `projection key ${projectionKey}` : "",
      projectionTarget ? `target ${projectionTarget}` : "",
      sourceId ? `source ${sourceId}` : "",
      panelId ? `panel ${panelId}` : "",
      regionId ? `region ${regionId}` : "",
      bbox ? `bbox ${bbox}` : "",
      docPath ? `doc path ${docPath}` : "",
      sourceHash ? `source hash ${sourceHash}` : "",
      sourceKind ? `source kind ${sourceKind}` : "",
      sourceTextHash ? `source payload hash ${sourceTextHash}` : "",
      sourceTextCharCount ? `source payload chars ${sourceTextCharCount}` : "",
      accountLocale ? `account locale ${accountLocale}` : "",
      targetLanguage ? `language ${targetLanguage}` : "",
      chunkId ? `chunk ${chunkId}` : "",
      chunkIndex ? `chunk index ${chunkIndex}` : "",
      dedupeKey ? `dedupe ${dedupeKey}` : "",
      sourceEventId ? `source event ${sourceEventId}` : "",
      sourceEventMs ? `source event ms ${sourceEventMs}` : "",
      observedAtMs ? `observed ${observedAtMs}` : "",
      freshnessStatus ? `freshness ${freshnessStatus}` : "",
      sessionDebugPhase ? `session phase ${sessionDebugPhase}` : "",
      sessionObservationStatus ? `observation status ${sessionObservationStatus}` : "",
      terminalAuthorityStatus ? `terminal authority ${terminalAuthorityStatus}` : "",
      reentryRequired !== null ? `re-entry required ${String(reentryRequired)}` : "",
      receiptRef ? `receipt ${receiptRef}` : "",
      observationRef ? `ref ${observationRef}` : "",
      "observation-only",
    ].filter(Boolean);
    return pieces.join(" | ");
  }).filter(Boolean);

  return Array.from(new Set([...summaries, ...receiptSummaries])).slice(0, 3).join(" || ");
}

function readTranslationProjectionTrafficSummary(record: RecordLike | null, debug: RecordLike | null): string {
  if (!record && !debug) return "";
  const projections = buildHelixLiveTranslationUiProjections({
    ...(record ?? {}),
    debug: debug ?? record?.debug ?? null,
  });
  const summaries = summarizeHelixLiveTranslationUiProjectionTraffic(projections).map((summary) => [
    summary.sourceId,
    summary.latestDocPath ? `latest doc path ${summary.latestDocPath}` : "",
    summary.latestBbox ? `latest bbox ${serializeCompactMetadata(summary.latestBbox)}` : "",
    summary.sourceHash ? `source hash ${summary.sourceHash}` : "",
    summary.sourceKind ? `source kind ${summary.sourceKind}` : "",
    summary.latestSourceTextHash ? `latest source payload hash ${summary.latestSourceTextHash}` : "",
    typeof summary.latestSourceTextCharCount === "number"
      ? `latest source payload chars ${summary.latestSourceTextCharCount}`
      : "",
    summary.accountLocale ? `account locale ${summary.accountLocale}` : "",
    `target ${summary.projectionTarget}`,
    summary.targetLanguage ? `language ${summary.targetLanguage}` : "",
    `chunks ${summary.chunkCount}`,
    `projected ${summary.projectedCount}`,
    summary.staleCount ? `stale ${summary.staleCount}` : "",
    summary.cancelledCount ? `cancelled ${summary.cancelledCount}` : "",
    summary.failedCount ? `failed ${summary.failedCount}` : "",
    summary.latestChunkId ? `latest chunk ${summary.latestChunkId}` : "",
    summary.latestChunkIndex !== null ? `latest index ${summary.latestChunkIndex}` : "",
    summary.latestFreshnessStatus ? `freshness ${summary.latestFreshnessStatus}` : "",
    summary.projectionTarget === "account_language"
      ? `account-language health ${resolveHelixAccountLanguageTranslationProjectionHealth({
        projectionStatus:
          summary.failedCount > 0
            ? "failed"
            : summary.cancelledCount > 0
              ? "cancelled"
              : summary.staleCount > 0
                ? "stale"
                : summary.projectedCount > 0
                  ? "projected"
                  : "",
        terminalAuthorityStatus: summary.latestTerminalAuthorityStatus,
        sessionDebugPhase: summary.latestLaneSessionDebugPhase,
        sessionObservationStatus: summary.latestLaneSessionObservationStatus,
        laneSessionId: summary.latestLaneSessionId,
      })}`
      : "",
    summary.latestObservationRef ? `observation ${summary.latestObservationRef}` : "",
    summary.latestReceiptRef ? `receipt ${summary.latestReceiptRef}` : "",
    "observation-only",
  ].filter(Boolean).join(" | "));

  return Array.from(new Set(summaries)).slice(0, 3).join(" || ");
}

function readGoalBoundLaneSummary(record: RecordLike | null, debug: RecordLike | null): string {
  const agentLoop = readNestedRecord(record?.agent_runtime_loop, debug?.agent_runtime_loop);
  const debugExport = readNestedRecord(record?.debug_export, debug?.debug_export);
  const directDispatchPlans = [
    ...readArray(record?.capability_lane_goal_dispatch_plans),
    ...readArray(debug?.capability_lane_goal_dispatch_plans),
    ...readArray(agentLoop?.capability_lane_goal_dispatch_plans),
    ...readArray(debugExport?.capability_lane_goal_dispatch_plans),
  ]
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry));
  const directDispatchAdmissions = [
    ...readArray(record?.capability_lane_goal_dispatch_admissions),
    ...readArray(debug?.capability_lane_goal_dispatch_admissions),
    ...readArray(agentLoop?.capability_lane_goal_dispatch_admissions),
    ...readArray(debugExport?.capability_lane_goal_dispatch_admissions),
  ]
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry));
  const summaries = [
    ...readArray(record?.capability_lane_goal_binding_debug_summaries),
    ...readArray(debug?.capability_lane_goal_binding_debug_summaries),
    ...readArray(agentLoop?.capability_lane_goal_binding_debug_summaries),
    ...readArray(debugExport?.capability_lane_goal_binding_debug_summaries),
  ]
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry))
    .map((summary) => {
      const lane = coerceText(summary.lane_id) || "capability_lane";
      const goal = coerceText(summary.goal_id);
      const session = coerceText(summary.lane_session_id);
      const sessionControlKey = coerceText(summary.session_control_key);
      const lifecycleAction = coerceText(
        summary.lifecycle_action ?? summary.session_lifecycle_action ?? summary.session_action,
      );
      const backend = coerceText(summary.selected_backend_provider);
      const decisionParts = readBackendSelectionDecisionParts(summary.backend_selection_decision);
      const latestMailLoop = readRecord(summary.latest_mail_loop_summary);
      const mailLoop =
        coerceText(latestMailLoop?.stage_play_mail_id) ||
        coerceText(latestMailLoop?.observation_ref) ||
        readArray(summary.mail_loop_refs).map(coerceText).filter(Boolean).at(-1) ||
        "";
      const receipt =
        readCapabilityLaneReceiptRef(
          summary,
          latestMailLoop,
          summary.latest_goal_binding_event,
          summary.report_decision,
          summary.dispatch_plan,
        );
      const latestGoalEvent = coerceText(readRecord(summary.latest_goal_binding_event)?.event);
      const reportDecision = readRecord(summary.report_decision);
      const reportAction = coerceText(reportDecision?.action);
      const reportSummary =
        coerceText(summary.report_summary_text) ||
        coerceText(reportDecision?.summary_text);
      const dispatchPlan = directDispatchPlans.find((plan) =>
        coerceText(plan.goal_binding_id) === coerceText(summary.goal_binding_id)) ??
        readRecord(summary.dispatch_plan);
      const dispatchTarget = coerceText(dispatchPlan?.target);
      const dispatchAdmission = directDispatchAdmissions.find((admission) =>
        coerceText(admission.goal_binding_id) === coerceText(summary.goal_binding_id)) ??
        readRecord(summary.dispatch_admission);
      const dispatchAdmissionStatus = coerceText(dispatchAdmission?.status);
      const status = [coerceText(summary.binding_status), coerceText(summary.session_status)]
        .filter(Boolean)
        .join("/");
      const observation = coerceText(summary.last_observation_ref);
      const source = coerceText(summary.source_id);
      const sourceKind = coerceText(summary.source_kind);
      const sourceProjectionTarget = coerceText(summary.source_projection_target);
      const accountLocale = coerceText(summary.account_locale);
      const latestProjection = coerceText(summary.latest_projection_target);
      const latestChunk = coerceText(summary.latest_chunk_id);
      const latestChunkIndex = coerceText(summary.latest_chunk_index);
      const latestDedupe = coerceText(summary.latest_dedupe_key);
      const latestSourceEventId = coerceText(summary.latest_source_event_id);
      const latestSourceEventMs = coerceText(summary.latest_source_event_ms);
      const latestObservedAtMs = coerceText(summary.latest_observed_at_ms);
      const latestFreshness = coerceText(summary.latest_freshness_status);
      const latestCancelled = summary.latest_cancel_requested === true;
      const latestEventId = coerceText(summary.latest_event_id);
      const sessionEventCount = coerceText(summary.session_event_count);
      const hasObservation = coerceText(summary.has_observation);
      const terminalAuthority = coerceText(summary.terminal_authority_status);
      const cost = coerceText(summary.cost_class);
      const latency = coerceText(summary.latency_class);
      const privacy = coerceText(summary.privacy_class);
      const fallback = coerceText(summary.fallback_backend_provider);
      const permissions =
        coerceText(summary.permission_profile ?? summary.session_permission_profile) ||
        readCapabilityLanePermissionText(summary.permissions);
      return [
        lane,
        goal ? `goal ${goal}` : "",
        session ? `session ${session}` : "",
        sessionControlKey ? `control ${sessionControlKey}` : "",
        lifecycleAction ? `action ${lifecycleAction}` : "",
        status ? `status ${status}` : "",
        backend ? `backend ${backend}` : "",
        cost ? `cost ${cost}` : "",
        latency ? `latency ${latency}` : "",
        privacy ? `privacy ${privacy}` : "",
        fallback ? `fallback ${fallback}` : "",
        ...decisionParts,
        observation ? `observation ${observation}` : "",
        source ? `source ${source}` : "",
        sourceKind ? `source kind ${sourceKind}` : "",
        sourceProjectionTarget ? `source projection ${sourceProjectionTarget}` : "",
        accountLocale ? `account locale ${accountLocale}` : "",
        latestProjection ? `latest projection ${latestProjection}` : "",
        latestChunk ? `latest chunk ${latestChunk}` : "",
        latestChunkIndex ? `latest index ${latestChunkIndex}` : "",
        latestDedupe ? `latest dedupe ${latestDedupe}` : "",
        latestSourceEventId ? `latest source event id ${latestSourceEventId}` : "",
        latestSourceEventMs ? `latest source event ms ${latestSourceEventMs}` : "",
        latestObservedAtMs ? `latest observed ${latestObservedAtMs}` : "",
        latestFreshness ? `latest freshness ${latestFreshness}` : "",
        latestCancelled ? "latest cancelled" : "",
        latestEventId ? `latest event id ${latestEventId}` : "",
        sessionEventCount ? `session events ${sessionEventCount}` : "",
        hasObservation ? `has observation ${hasObservation}` : "",
        mailLoop ? `mail ${mailLoop}` : "",
        latestGoalEvent ? `event ${latestGoalEvent}` : "",
        receipt ? `receipt ${receipt}` : "",
        reportSummary ? `report summary ${reportSummary}` : "",
        reportAction ? `report ${reportAction}` : "",
        dispatchTarget ? `dispatch ${dispatchTarget}` : "",
        dispatchAdmissionStatus ? `admission ${dispatchAdmissionStatus}` : "",
        terminalAuthority ? `authority ${terminalAuthority}` : "",
        permissions,
        "observation-only",
      ].filter(Boolean).join(" | ");
    });

  if (summaries.length === 0 && directDispatchPlans.length > 0) {
    return Array.from(new Set(directDispatchPlans.map((plan) => {
      const lane = coerceText(plan.lane_id) || "capability_lane";
      const goal = coerceText(plan.goal_id);
      const session = coerceText(plan.lane_session_id);
      const target = coerceText(plan.target);
      const status = coerceText(plan.status);
      const receipt = coerceText(plan.receipt_ref);
      const source = coerceText(plan.source_id);
      const sourceKind = coerceText(plan.source_kind);
      const sourceProjectionTarget = coerceText(plan.source_projection_target);
      const accountLocale = coerceText(plan.account_locale);
      const projection = coerceText(plan.latest_projection_target);
      const chunk = coerceText(plan.latest_chunk_id);
      const dedupe = coerceText(plan.latest_dedupe_key);
      const sourceEvent = coerceText(plan.latest_source_event_id);
      const freshness = coerceText(plan.latest_freshness_status);
      const latestEventId = coerceText(plan.latest_event_id);
      const sessionEventCount = coerceText(plan.session_event_count);
      const hasObservation = coerceText(plan.has_observation);
      const targetLanguage = coerceText(plan.target_language);
      const cancelled = plan.latest_cancel_requested === true;
      return [
        lane,
        goal ? `goal ${goal}` : "",
        session ? `session ${session}` : "",
        target ? `dispatch ${target}` : "",
        status ? `status ${status}` : "",
        source ? `source ${source}` : "",
        sourceKind ? `source kind ${sourceKind}` : "",
        sourceProjectionTarget ? `source projection ${sourceProjectionTarget}` : "",
        accountLocale ? `account locale ${accountLocale}` : "",
        projection ? `latest projection ${projection}` : "",
        targetLanguage ? `target ${targetLanguage}` : "",
        chunk ? `latest chunk ${chunk}` : "",
        dedupe ? `latest dedupe ${dedupe}` : "",
        sourceEvent ? `latest source event id ${sourceEvent}` : "",
        freshness ? `latest freshness ${freshness}` : "",
        cancelled ? "latest cancelled" : "",
        latestEventId ? `latest event id ${latestEventId}` : "",
        sessionEventCount ? `session events ${sessionEventCount}` : "",
        hasObservation ? `has observation ${hasObservation}` : "",
        receipt ? `receipt ${receipt}` : "",
        "observation-only",
      ].filter(Boolean).join(" | ");
    }))).slice(0, 3).join(" || ");
  }

  if (summaries.length === 0 && directDispatchAdmissions.length > 0) {
    return Array.from(new Set(directDispatchAdmissions.map((admission) => {
      const lane = coerceText(admission.lane_id) || "capability_lane";
      const goal = coerceText(admission.goal_id);
      const session = coerceText(admission.lane_session_id);
      const target = coerceText(admission.target);
      const status = coerceText(admission.status);
      const source = coerceText(admission.source_id);
      const sourceKind = coerceText(admission.source_kind);
      const sourceProjectionTarget = coerceText(admission.source_projection_target);
      const accountLocale = coerceText(admission.account_locale);
      const projection = coerceText(admission.latest_projection_target);
      const chunk = coerceText(admission.latest_chunk_id);
      const dedupe = coerceText(admission.latest_dedupe_key);
      const sourceEvent = coerceText(admission.latest_source_event_id);
      const freshness = coerceText(admission.latest_freshness_status);
      const latestEventId = coerceText(admission.latest_event_id);
      const sessionEventCount = coerceText(admission.session_event_count);
      const hasObservation = coerceText(admission.has_observation);
      const targetLanguage = coerceText(admission.target_language);
      const cancelled = admission.latest_cancel_requested === true;
      return [
        lane,
        goal ? `goal ${goal}` : "",
        session ? `session ${session}` : "",
        target ? `dispatch ${target}` : "",
        status ? `admission ${status}` : "",
        source ? `source ${source}` : "",
        sourceKind ? `source kind ${sourceKind}` : "",
        sourceProjectionTarget ? `source projection ${sourceProjectionTarget}` : "",
        accountLocale ? `account locale ${accountLocale}` : "",
        projection ? `latest projection ${projection}` : "",
        targetLanguage ? `target ${targetLanguage}` : "",
        chunk ? `latest chunk ${chunk}` : "",
        dedupe ? `latest dedupe ${dedupe}` : "",
        sourceEvent ? `latest source event id ${sourceEvent}` : "",
        freshness ? `latest freshness ${freshness}` : "",
        cancelled ? "latest cancelled" : "",
        latestEventId ? `latest event id ${latestEventId}` : "",
        sessionEventCount ? `session events ${sessionEventCount}` : "",
        hasObservation ? `has observation ${hasObservation}` : "",
        "observation-only",
      ].filter(Boolean).join(" | ");
    }))).slice(0, 3).join(" || ");
  }

  return Array.from(new Set(summaries)).slice(0, 3).join(" || ");
}

function readGoalDispatchReadinessSummary(record: RecordLike | null, debug: RecordLike | null): string {
  const agentLoop = readNestedRecord(record?.agent_runtime_loop, debug?.agent_runtime_loop);
  const debugExport = readNestedRecord(record?.debug_export, debug?.debug_export);
  const readiness =
    readRecord(record?.capability_lane_goal_dispatch_readiness) ??
    readRecord(debug?.capability_lane_goal_dispatch_readiness) ??
    readRecord(agentLoop?.capability_lane_goal_dispatch_readiness) ??
    readRecord(debugExport?.capability_lane_goal_dispatch_readiness);
  if (!readiness) return "";

  const totalPlans = coerceText(readiness.total_plans);
  const totalAdmissions = coerceText(readiness.total_admissions);
  const admitted = coerceText(readiness.admitted_count);
  const blocked = coerceText(readiness.blocked_count);
  const admittedNumber = Number(admitted);
  const blockedNumber = Number(blocked);
  const readinessState =
    Number.isFinite(admittedNumber) && Number.isFinite(blockedNumber) && admittedNumber > 0 && blockedNumber > 0
      ? "partial"
      : Number.isFinite(blockedNumber) && blockedNumber > 0
        ? "blocked"
        : "ready";
  const pendingWake = coerceText(readiness.pending_wake_count);
  const pendingTerminal = coerceText(readiness.pending_terminal_authority_count);
  const liveMailLoopRequired = coerceText(readiness.live_mail_loop_required_count);
  const terminalAuthorityRequired = coerceText(readiness.terminal_authority_required_count);
  const projectionOnly = coerceText(readiness.projection_only_count);
  const manualReview = coerceText(readiness.manual_review_count);
  const debugOnly = coerceText(readiness.debug_only_count);
  const lanes = readArray(readiness.next_lane_ids).map(coerceText).filter(Boolean).join(", ");
  const sessions = readArray(readiness.next_lane_session_ids).map(coerceText).filter(Boolean).join(", ");
  const sessionControlKeys = readArray(readiness.next_session_control_keys).map(coerceText).filter(Boolean).join(", ");
  const sourceBindingKeys = readArray(readiness.next_source_binding_keys).map(coerceText).filter(Boolean).join(", ");
  const sourceIdentityKeys = readArray(readiness.next_source_identity_keys).map(coerceText).filter(Boolean).join(", ");
  const mailLoopObservationKeys =
    readArray(readiness.next_mail_loop_observation_keys).map(coerceText).filter(Boolean).join(", ");
  const targets = readArray(readiness.next_dispatch_targets).map(coerceText).filter(Boolean).join(", ");
  const goalBindings = readArray(readiness.next_goal_binding_ids).map(coerceText).filter(Boolean).join(", ");
  const sourceIds = readArray(readiness.next_source_ids).map(coerceText).filter(Boolean).join(", ");
  const sourceHashes = readArray(readiness.next_source_hashes).map(coerceText).filter(Boolean).join(", ");
  const sourceKinds = readArray(readiness.next_source_kinds).map(coerceText).filter(Boolean).join(", ");
  const sourceProjectionTargets = readArray(readiness.next_source_projection_targets).map(coerceText).filter(Boolean).join(", ");
  const accountLocales = readArray(readiness.next_account_locales).map(coerceText).filter(Boolean).join(", ");
  const chunkIds = readArray(readiness.next_chunk_ids).map(coerceText).filter(Boolean).join(", ");
  const dedupeKeys = readArray(readiness.next_dedupe_keys).map(coerceText).filter(Boolean).join(", ");
  const sourceEventIds = readArray(readiness.next_source_event_ids).map(coerceText).filter(Boolean).join(", ");
  const latestEventIds = readArray(readiness.next_latest_event_ids).map(coerceText).filter(Boolean).join(", ");
  const sessionEventCounts = readArray(readiness.next_session_event_counts).map(coerceText).filter(Boolean).join(", ");
  const nextHasObservation = coerceText(readiness.next_has_observation);
  const allNextHaveObservation = coerceText(readiness.all_next_have_observation);
  const projectionTargets = readArray(readiness.next_projection_targets).map(coerceText).filter(Boolean).join(", ");
  const targetLanguages = readArray(readiness.next_target_languages).map(coerceText).filter(Boolean).join(", ");
  const freshnessStatuses = readArray(readiness.next_freshness_statuses).map(coerceText).filter(Boolean).join(", ");
  const wakeKinds = readArray(readiness.next_mail_loop_wake_kinds).map(coerceText).filter(Boolean).join(", ");
  const nextCancelled = readiness.next_cancel_requested === true;
  const evidenceRefs = readArray(readiness.next_evidence_refs).map(coerceText).filter(Boolean).join(", ");
  const receipts = readArray(readiness.next_receipt_refs).map(coerceText).filter(Boolean).join(", ");
  const blockedReasons = readArray(readiness.blocked_reasons).map(coerceText).filter(Boolean).join(", ");
  const anyLiveMailLoopRequired = readiness.any_live_mail_loop_required === true;
  const anyTerminalAuthorityRequired = readiness.any_terminal_authority_required === true;

  return [
    `readiness ${readinessState}`,
    totalPlans ? `plans ${totalPlans}` : "",
    totalAdmissions ? `admissions ${totalAdmissions}` : "",
    admitted ? `admitted ${admitted}` : "",
    blocked ? `blocked ${blocked}` : "",
    pendingWake && pendingWake !== "0" ? `pending wake ${pendingWake}` : "",
    pendingTerminal && pendingTerminal !== "0" ? `pending terminal ${pendingTerminal}` : "",
    liveMailLoopRequired && liveMailLoopRequired !== "0" ? `live mail loop required ${liveMailLoopRequired}` : "",
    terminalAuthorityRequired && terminalAuthorityRequired !== "0"
      ? `terminal authority required ${terminalAuthorityRequired}`
      : "",
    anyLiveMailLoopRequired ? "any live mail loop required true" : "",
    anyTerminalAuthorityRequired ? "any terminal authority required true" : "",
    projectionOnly && projectionOnly !== "0" ? `projection only ${projectionOnly}` : "",
    manualReview && manualReview !== "0" ? `manual review ${manualReview}` : "",
    debugOnly && debugOnly !== "0" ? `debug only ${debugOnly}` : "",
    lanes ? `lanes ${lanes}` : "",
    sessions ? `sessions ${sessions}` : "",
    sessionControlKeys ? `session controls ${sessionControlKeys}` : "",
    sourceBindingKeys ? `source bindings ${sourceBindingKeys}` : "",
    sourceIdentityKeys ? `source identities ${sourceIdentityKeys}` : "",
    mailLoopObservationKeys ? `mail observations ${mailLoopObservationKeys}` : "",
    targets ? `targets ${targets}` : "",
    goalBindings ? `goal bindings ${goalBindings}` : "",
    sourceIds ? `sources ${sourceIds}` : "",
    sourceHashes ? `source hashes ${sourceHashes}` : "",
    sourceKinds ? `source kinds ${sourceKinds}` : "",
    sourceProjectionTargets ? `source projections ${sourceProjectionTargets}` : "",
    accountLocales ? `account locales ${accountLocales}` : "",
    projectionTargets ? `projections ${projectionTargets}` : "",
    targetLanguages ? `target languages ${targetLanguages}` : "",
    chunkIds ? `chunks ${chunkIds}` : "",
    dedupeKeys ? `dedupe ${dedupeKeys}` : "",
    sourceEventIds ? `source events ${sourceEventIds}` : "",
    latestEventIds ? `latest events ${latestEventIds}` : "",
    sessionEventCounts ? `session event counts ${sessionEventCounts}` : "",
    nextHasObservation ? `next has observation ${nextHasObservation}` : "",
    allNextHaveObservation ? `all next have observation ${allNextHaveObservation}` : "",
    wakeKinds ? `wake kinds ${wakeKinds}` : "",
    freshnessStatuses ? `freshness ${freshnessStatuses}` : "",
    nextCancelled ? "cancelled" : "",
    evidenceRefs ? `evidence ${evidenceRefs}` : "",
    receipts ? `receipts ${receipts}` : "",
    blockedReasons ? `blocked ${blockedReasons}` : "",
    "no side effects",
    "observation-only",
  ].filter(Boolean).join(" | ");
}

function readLaneSessionSummary(record: RecordLike | null, debug: RecordLike | null): string {
  const agentLoop = readNestedRecord(record?.agent_runtime_loop, debug?.agent_runtime_loop);
  const debugExport = readNestedRecord(record?.debug_export, debug?.debug_export);
  const summaries = [
    ...readArray(record?.capability_lane_session_debug_summaries),
    ...readArray(debug?.capability_lane_session_debug_summaries),
    ...readArray(agentLoop?.capability_lane_session_debug_summaries),
    ...readArray(debugExport?.capability_lane_session_debug_summaries),
  ]
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry))
    .map((summary) => {
      const lane = coerceText(summary.lane_id) || "capability_lane";
      const session = coerceText(summary.lane_session_id);
      const lifecycleAction = coerceText(
        summary.lifecycle_action ?? summary.session_lifecycle_action ?? summary.session_action,
      );
      const backend = coerceText(summary.selected_backend_provider);
      const cost = coerceText(summary.cost_class);
      const latency = coerceText(summary.latency_class);
      const privacy = coerceText(summary.privacy_class);
      const fallback = coerceText(summary.fallback_backend_provider);
      const decisionParts = readBackendSelectionDecisionParts(summary.backend_selection_decision);
      const status = [coerceText(summary.session_status), coerceText(summary.session_health)]
        .filter(Boolean)
        .join("/");
      const sessionControlKey = coerceText(summary.session_control_key);
      const source = coerceText(summary.source_id);
      const sourceHash = coerceText(summary.source_hash);
      const sourceKind = coerceText(summary.source_kind);
      const sourceTextHash = coerceText(summary.source_text_hash);
      const sourceTextCharCount = coerceText(summary.source_text_char_count);
      const sourceProjectionTarget = coerceText(summary.source_projection_target);
      const projection = coerceText(summary.projection_target);
      const locale = coerceText(summary.account_locale ?? summary.latest_account_locale);
      const targetLanguage = coerceText(summary.target_language ?? summary.latest_target_language);
      const latestProjection = coerceText(summary.latest_projection_target);
      const latestChunk = coerceText(summary.latest_chunk_id);
      const latestChunkIndex = coerceText(summary.latest_chunk_index);
      const latestDedupe = coerceText(summary.latest_dedupe_key);
      const latestSourceEventId = coerceText(summary.latest_source_event_id);
      const latestSourceEventMs = coerceText(summary.latest_source_event_ms);
      const latestObservedAtMs = coerceText(summary.latest_observed_at_ms);
      const latestFreshness = coerceText(summary.latest_freshness_status);
      const latestCancelled = summary.latest_cancel_requested === true;
      const latestEventId = coerceText(summary.latest_event_id);
      const hasObservation = summary.has_observation === true;
      const observation = coerceText(summary.last_observation_ref);
      const receipt = readCapabilityLaneReceiptRef(summary);
      const terminalAuthority = coerceText(summary.terminal_authority_status);
      const permissions = readCapabilityLanePermissionText(summary.permissions);
      return [
        lane,
        session ? `session ${session}` : "",
        sessionControlKey ? `control ${sessionControlKey}` : "",
        lifecycleAction ? `action ${lifecycleAction}` : "",
        status ? `status ${status}` : "",
        backend ? `backend ${backend}` : "",
        cost ? `cost ${cost}` : "",
        latency ? `latency ${latency}` : "",
        privacy ? `privacy ${privacy}` : "",
        fallback ? `fallback ${fallback}` : "",
        ...decisionParts,
        source ? `source ${source}` : "",
        sourceHash ? `source hash ${sourceHash}` : "",
        sourceKind ? `source kind ${sourceKind}` : "",
        sourceTextHash ? `source payload hash ${sourceTextHash}` : "",
        sourceTextCharCount ? `source payload chars ${sourceTextCharCount}` : "",
        sourceProjectionTarget ? `source projection ${sourceProjectionTarget}` : "",
        projection ? `projection ${projection}` : "",
        locale ? `locale ${locale}` : "",
        targetLanguage ? `target ${targetLanguage}` : "",
        latestProjection && latestProjection !== projection ? `latest projection ${latestProjection}` : "",
        latestChunk ? `latest chunk ${latestChunk}` : "",
        latestChunkIndex ? `latest index ${latestChunkIndex}` : "",
        latestDedupe ? `latest dedupe ${latestDedupe}` : "",
        latestSourceEventId ? `latest source event id ${latestSourceEventId}` : "",
        latestSourceEventMs ? `latest source event ms ${latestSourceEventMs}` : "",
        latestObservedAtMs ? `latest observed ${latestObservedAtMs}` : "",
        latestFreshness ? `latest freshness ${latestFreshness}` : "",
        latestCancelled ? "latest cancelled" : "",
        latestEventId ? `latest event ${latestEventId}` : "",
        `has observation ${hasObservation ? "true" : "false"}`,
        observation ? `observation ${observation}` : "",
        receipt ? `receipt ${receipt}` : "",
        terminalAuthority ? `authority ${terminalAuthority}` : "",
        permissions,
        "observation-only",
      ].filter(Boolean).join(" | ");
    });

  return Array.from(new Set(summaries)).slice(0, 3).join(" || ");
}

function readLaneMailLoopSummary(record: RecordLike | null, debug: RecordLike | null): string {
  const agentLoop = readNestedRecord(record?.agent_runtime_loop, debug?.agent_runtime_loop);
  const debugExport = readNestedRecord(record?.debug_export, debug?.debug_export);
  const summaries = [
    ...readArray(record?.capability_lane_mail_loop_debug_summaries),
    ...readArray(debug?.capability_lane_mail_loop_debug_summaries),
    ...readArray(agentLoop?.capability_lane_mail_loop_debug_summaries),
    ...readArray(debugExport?.capability_lane_mail_loop_debug_summaries),
  ]
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry))
    .map((summary) => {
      const lane = coerceText(summary.lane_id) || "capability_lane";
      const session = coerceText(summary.lane_session_id);
      const mail = coerceText(summary.stage_play_mail_id);
      const mailDelivery = coerceText(summary.stage_play_mail_delivery_status);
      const materializedMailLoopEvidence = summary.materialized_mail_loop_evidence === true;
      const previousMail = coerceText(summary.previous_stage_play_mail_id);
      const wake = summary.stage_play_wake_expected === true ? "wake expected" : "wake not expected";
      const wakeKind = coerceText(summary.stage_play_wake_kind);
      const mailboxWakeExpected =
        summary.mailbox_wake_expected === true ||
        wakeKind === "mailbox_wake" ||
        summary.stage_play_wake_expected === true;
      const decisionWakeExpected = summary.decision_wake_expected === true;
      const observationSession = coerceText(summary.observation_lane_session_id);
      const sessionControlKey = coerceText(summary.lane_session_control_key);
      const observation = coerceText(summary.observation_ref);
      const receipt = readCapabilityLaneReceiptRef(summary);
      const source = coerceText(summary.source_id);
      const sourceHash = coerceText(summary.source_hash);
      const sourceKind = coerceText(summary.source_kind);
      const sourceTextHash = coerceText(summary.source_text_hash);
      const sourceTextCharCount = coerceText(summary.source_text_char_count);
      const sourceProjectionTarget = coerceText(summary.source_projection_target);
      const accountLocale = coerceText(summary.account_locale);
      const projection = coerceText(summary.projection_target);
      const chunk = coerceText(summary.chunk_id);
      const chunkIndex = coerceText(summary.chunk_index);
      const dedupeKey = coerceText(summary.dedupe_key);
      const sourceEventId = coerceText(summary.source_event_id);
      const sourceEventMs = coerceText(summary.source_event_ms);
      const observedAtMs = coerceText(summary.observed_at_ms);
      const backend = coerceText(summary.selected_backend_provider);
      const cost = coerceText(summary.cost_class);
      const latency = coerceText(summary.latency_class);
      const privacy = coerceText(summary.privacy_class);
      const fallback = coerceText(summary.fallback_backend_provider);
      const decisionParts = readBackendSelectionDecisionParts(summary.backend_selection_decision);
      const blocked = coerceText(summary.blocked_reason);
      const terminalAuthority = coerceText(summary.terminal_authority_status);
      const cancelled = summary.cancel_requested === true;
      return [
        lane,
        session ? `session ${session}` : "",
        mail ? `mail ${mail}` : "",
        `materialized mail evidence ${materializedMailLoopEvidence ? "true" : "false"}`,
        mailDelivery ? `mail delivery ${mailDelivery}` : "",
        previousMail ? `previous mail ${previousMail}` : "",
        wake,
        `mailbox wake expected ${mailboxWakeExpected ? "true" : "false"}`,
        `decision wake expected ${decisionWakeExpected ? "true" : "false"}`,
        wakeKind ? `wake kind ${wakeKind}` : "",
        observationSession ? `observation session ${observationSession}` : "",
        sessionControlKey ? `control ${sessionControlKey}` : "",
        observation ? `observation ${observation}` : "",
        receipt ? `receipt ${receipt}` : "",
        source ? `source ${source}` : "",
        sourceHash ? `source hash ${sourceHash}` : "",
        sourceKind ? `source kind ${sourceKind}` : "",
        sourceTextHash ? `source payload hash ${sourceTextHash}` : "",
        sourceTextCharCount ? `source payload chars ${sourceTextCharCount}` : "",
        sourceProjectionTarget ? `source projection ${sourceProjectionTarget}` : "",
        accountLocale ? `account locale ${accountLocale}` : "",
        projection ? `projection ${projection}` : "",
        chunk ? `chunk ${chunk}` : "",
        chunkIndex ? `index ${chunkIndex}` : "",
        dedupeKey ? `dedupe ${dedupeKey}` : "",
        sourceEventId ? `source event id ${sourceEventId}` : "",
        sourceEventMs ? `source event ms ${sourceEventMs}` : "",
        observedAtMs ? `observed ${observedAtMs}` : "",
        cancelled ? "cancelled" : "",
        backend ? `backend ${backend}` : "",
        cost ? `cost ${cost}` : "",
        latency ? `latency ${latency}` : "",
        privacy ? `privacy ${privacy}` : "",
        fallback ? `fallback ${fallback}` : "",
        ...decisionParts,
        blocked ? `blocked ${blocked}` : "",
        terminalAuthority ? `authority ${terminalAuthority}` : "",
        "evidence-only",
      ].filter(Boolean).join(" | ");
    });

  return Array.from(new Set(summaries)).slice(0, 3).join(" || ");
}

function readLaneTimelineSummary(record: RecordLike | null, debug: RecordLike | null): string {
  const agentLoop = readNestedRecord(record?.agent_runtime_loop, debug?.agent_runtime_loop);
  const debugExport = readNestedRecord(record?.debug_export, debug?.debug_export);
  const timelineSummary =
    readNestedRecord(record?.capability_lane_timeline_summary, debug?.capability_lane_timeline_summary) ??
    readNestedRecord(agentLoop?.capability_lane_timeline_summary, debugExport?.capability_lane_timeline_summary);
  const rows = readArray(timelineSummary?.console_state_rows)
    .map((entry) => readRecord(entry))
    .filter((entry): entry is RecordLike => Boolean(entry))
    .sort((left, right) => {
      const leftSeq = typeof left.seq === "number" && Number.isFinite(left.seq) ? left.seq : 0;
      const rightSeq = typeof right.seq === "number" && Number.isFinite(right.seq) ? right.seq : 0;
      return leftSeq - rightSeq;
    });
  if (rows.length === 0) return "";

  const hasVisibleOnly = rows.some((row) => row.lane_visible === true && row.lane_executed !== true);
  const summaries = rows.map((row) => {
    const normalizedStage = coerceText(row.normalized_stage) || coerceText(row.stage) || "lane_state";
    const state = coerceText(row.state_label);
    const lane = coerceText(row.lane_id);
    const capability = coerceText(row.capability_id) || coerceText(row.capability) || lane || "capability_lane";
    const runtimeProvider = coerceText(row.selected_runtime_agent_provider);
    const requestedBackend = coerceText(row.requested_backend_provider);
    const backend = coerceText(row.selected_backend_provider);
    const fallbackBackend = coerceText(row.fallback_backend_provider);
    const backendSelectionReason =
      coerceText(row.backend_selection_reason) ||
      coerceText(row.selection_reason);
    const observation = coerceText(row.observation_ref);
    const receipt = readCapabilityLaneReceiptRef(row);
    const laneSession = coerceText(row.lane_session_id);
    const sessionControlKey = coerceText(row.session_control_key);
    const sourceBindingKey = coerceText(row.source_binding_key);
    const latestObservationKey = coerceText(row.latest_observation_key);
    const latestMailLoopObservationKey = coerceText(row.latest_mail_loop_observation_key);
    const goalBindingKey = coerceText(row.goal_binding_key);
    const latestEventId = coerceText(row.latest_event_id);
    const sourceId = coerceText(row.source_id);
    const sourceHash = coerceText(row.source_hash);
    const sourceKind = coerceText(row.source_kind);
    const sourceTextHash = coerceText(row.source_text_hash);
    const sourceTextCharCount = coerceText(row.source_text_char_count);
    const sourceIdentityKey = coerceText(row.source_identity_key);
    const latestSourceIdentityKey = coerceText(row.latest_source_identity_key);
    const projectionTarget = coerceText(row.projection_target);
    const accountLocale = coerceText(row.account_locale);
    const targetLanguage = coerceText(row.target_language);
    const chunkId = coerceText(row.chunk_id);
    const chunkIndex = coerceText(row.chunk_index);
    const dedupeKey = coerceText(row.dedupe_key);
    const sourceEventId = coerceText(row.source_event_id);
    const sourceEventMs = coerceText(row.source_event_ms);
    const observedAtMs = coerceText(row.observed_at_ms);
    const freshnessStatus = coerceText(row.freshness_status);
    const terminalAuthority = coerceText(row.terminal_authority_status);
    return [
      `${normalizedStage}: ${capability}`,
      state ? `state ${state}` : "",
      runtimeProvider ? `runtime ${runtimeProvider}` : "",
      requestedBackend ? `requested backend ${requestedBackend}` : "",
      backend ? `backend ${backend}` : "",
      fallbackBackend ? `fallback ${fallbackBackend}` : "",
      backendSelectionReason ? `reason ${backendSelectionReason}` : "",
      sourceId ? `source ${sourceId}` : "",
      sourceHash ? `source hash ${sourceHash}` : "",
      sourceKind ? `source kind ${sourceKind}` : "",
      sourceTextHash ? `source text ${sourceTextHash}` : "",
      sourceTextCharCount ? `source chars ${sourceTextCharCount}` : "",
      sourceIdentityKey ? `source identity ${sourceIdentityKey}` : "",
      latestSourceIdentityKey ? `latest source identity ${latestSourceIdentityKey}` : "",
      projectionTarget ? `projection ${projectionTarget}` : "",
      accountLocale ? `account locale ${accountLocale}` : "",
      targetLanguage ? `target ${targetLanguage}` : "",
      chunkId ? `chunk ${chunkId}` : "",
      chunkIndex ? `chunk index ${chunkIndex}` : "",
      dedupeKey ? `dedupe ${dedupeKey}` : "",
      sourceEventId ? `source event ${sourceEventId}` : "",
      sourceEventMs ? `source event ms ${sourceEventMs}` : "",
      observedAtMs ? `observed ${observedAtMs}` : "",
      freshnessStatus ? `freshness ${freshnessStatus}` : "",
      row.cancel_requested === true ? "cancelled" : "",
      row.lane_visible === true ? "visible" : "",
      row.lane_requested === true ? "requested" : "",
      row.lane_executed === true ? "executed" : "",
      row.observation_reentered === true ? "re-entered" : "",
      row.lane_visible === true && row.lane_executed !== true ? "not executed" : "",
      laneSession ? `session ${laneSession}` : "",
      sessionControlKey ? `control ${sessionControlKey}` : "",
      sourceBindingKey ? `source binding ${sourceBindingKey}` : "",
      latestObservationKey ? `observation key ${latestObservationKey}` : "",
      latestMailLoopObservationKey ? `mail observation ${latestMailLoopObservationKey}` : "",
      goalBindingKey ? `goal binding ${goalBindingKey}` : "",
      latestEventId ? `latest event ${latestEventId}` : "",
      observation ? `observation ${observation}` : "",
      receipt ? `receipt ${receipt}` : "",
      terminalAuthority ? `terminal authority ${terminalAuthority}` : "",
      row.terminal_eligible === false ? "not terminal-eligible" : "",
      row.assistant_answer === false ? "not assistant answer" : "",
    ].filter(Boolean).join(" | ");
  });

  const unique = Array.from(new Set(summaries)).slice(0, 8);
  if (rows.length > unique.length) unique.push(`+${rows.length - unique.length} more`);
  if (hasVisibleOnly) unique.push("visible does not mean executed");
  return unique.join(" -> ");
}

function readVisibleTranslationChainSummary(record: RecordLike | null, debug: RecordLike | null): string {
  const agentLoop = readNestedRecord(record?.agent_runtime_loop, debug?.agent_runtime_loop);
  const debugExport = readNestedRecord(record?.debug_export, debug?.debug_export);
  const summary =
    readNestedRecord(record?.visible_translation_chain_summary, debug?.visible_translation_chain_summary) ??
    readNestedRecord(agentLoop?.visible_translation_chain_summary, debugExport?.visible_translation_chain_summary);
  if (!summary) return "";

  const sourceIds = readArray(summary.source_ids).map(coerceText).filter(Boolean).join(", ");
  const chunkIds = readArray(summary.chunk_ids).map(coerceText).filter(Boolean).join(", ");
  const sourceKinds = readArray(summary.source_kinds).map(coerceText).filter(Boolean).join(", ");
  const panelIds = readArray(summary.panel_ids).map(coerceText).filter(Boolean).join(", ");
  const regionIds = readArray(summary.region_ids).map(coerceText).filter(Boolean).join(", ");
  const projectionTargets = readArray(summary.projection_targets).map(coerceText).filter(Boolean).join(", ");
  const targetLanguages = readArray(summary.target_languages).map(coerceText).filter(Boolean).join(", ");
  const observationRefs = readArray(summary.observation_refs).map(coerceText).filter(Boolean).join(", ");
  const receiptRefs = readArray(summary.receipt_refs).map(coerceText).filter(Boolean).join(", ");
  const targetCount = coerceText(summary.collected_target_count);
  const backendCount = coerceText(summary.backend_selected_count);
  const receiptCount = coerceText(summary.projection_receipt_count);
  return [
    summary.chain_complete === true ? "complete" : "incomplete",
    summary.collector_requested === true ? "collector requested" : "collector pending",
    targetCount ? `targets ${targetCount}` : "",
    summary.translation_requested === true ? "translation requested" : "translation pending",
    summary.translation_executed === true ? "translation executed" : "translation not executed",
    backendCount ? `backend selections ${backendCount}` : "",
    receiptCount ? `projection receipts ${receiptCount}` : "",
    summary.observation_reentered === true ? "re-entered" : "re-entry pending",
    summary.terminal_selected === true
      ? "terminal selected"
      : summary.terminal_rejected === true
        ? "terminal rejected"
        : "terminal pending",
    sourceIds ? `source ${sourceIds}` : "",
    chunkIds ? `chunk ${chunkIds}` : "",
    sourceKinds ? `source kind ${sourceKinds}` : "",
    panelIds ? `panel ${panelIds}` : "",
    regionIds ? `region ${regionIds}` : "",
    projectionTargets ? `projection ${projectionTargets}` : "",
    targetLanguages ? `target ${targetLanguages}` : "",
    observationRefs ? `observation ${observationRefs}` : "",
    receiptRefs ? `receipt ${receiptRefs}` : "",
    "projection-only, not terminal authority",
  ].filter(Boolean).join(" | ");
}

function readTerminalArtifactKind(record: RecordLike | null, debug: RecordLike | null): string {
  const resolved = readNestedRecord(record?.resolved_turn_summary, debug?.resolved_turn_summary);
  const authority = readNestedRecord(record?.terminal_authority, debug?.terminal_authority);
  return (
    coerceText(record?.terminal_artifact_kind) ||
    coerceText(debug?.terminal_artifact_kind) ||
    coerceText(resolved?.terminal_artifact_kind) ||
    coerceText(authority?.selected_terminal_artifact_kind) ||
    coerceText(authority?.terminal_artifact_kind)
  );
}

function readDebugExportRef(record: RecordLike | null, debug: RecordLike | null): string {
  const debugExport = readNestedRecord(record?.debug_export, debug?.debug_export);
  return (
    coerceText(record?.debug_export_ref) ||
    coerceText(debug?.debug_export_ref) ||
    coerceText(debugExport?.debug_export_ref) ||
    coerceText(record?.debug_ref) ||
    coerceText(debug?.debug_ref)
  );
}

function readRuntimeGoalSessionSummary(record: RecordLike | null, debug: RecordLike | null): string {
  const debugExport = readNestedRecord(record?.debug_export, debug?.debug_export);
  const session =
    readNestedRecord(record?.runtime_goal_session, debug?.runtime_goal_session, debugExport?.runtime_goal_session) ??
    readNestedRecord(record?.goal_session, debug?.goal_session, debugExport?.goal_session);
  const goalDebug =
    readNestedRecord(record?.runtime_goal_debug_export, debug?.runtime_goal_debug_export, debugExport?.runtime_goal_debug_export);
  const command =
    readNestedRecord(record?.runtime_goal_command, debug?.runtime_goal_command, debugExport?.runtime_goal_command);
  const goalId =
    coerceText(session?.goal_id) ||
    coerceText(goalDebug?.goal_id) ||
    coerceText(command?.goal_id);
  if (!goalId) return "";
  const status = coerceText(session?.status);
  const runtime = coerceText(session?.runtime_agent_provider) || coerceText(goalDebug?.runtime_agent_provider);
  const runtimeSession = coerceText(session?.runtime_session_id) || coerceText(goalDebug?.runtime_session_id);
  const commandKind = coerceText(command?.command);
  const wake = coerceText(goalDebug?.wake_event_kind);
  const blocked = coerceText(command?.blocked_reason) || coerceText(record?.blocked_reason) || coerceText(debug?.blocked_reason);
  const terminalAuthority =
    coerceText(session?.terminal_authority_status) ||
    coerceText(goalDebug?.terminal_authority_status);
  const observations = readArray(session?.latest_observation_refs ?? goalDebug?.observation_refs)
    .map(coerceText)
    .filter(Boolean);
  const receipts = readArray(session?.latest_receipt_refs ?? goalDebug?.receipt_refs)
    .map(coerceText)
    .filter(Boolean);
  return [
    `goal ${goalId}`,
    status ? `status ${status}` : "",
    runtime ? `runtime ${runtime}` : "",
    runtimeSession ? `session ${runtimeSession}` : "",
    commandKind ? `command ${commandKind}` : "",
    wake ? `wake ${wake}` : "",
    observations[0] ? `observation ${observations[0]}` : "",
    observations.length > 1 ? `+${observations.length - 1} observations` : "",
    receipts[0] ? `receipt ${receipts[0]}` : "",
    receipts.length > 1 ? `+${receipts.length - 1} receipts` : "",
    terminalAuthority ? `terminal authority ${terminalAuthority}` : "",
    blocked ? `blocked ${blocked}` : "",
    "debug export available",
  ].filter(Boolean).join(" | ");
}

export function buildHelixAskRuntimeTurnSummary(
  response: unknown,
  providers: HelixAgentRuntimeDescriptor[] = DEFAULT_HELIX_AGENT_RUNTIME_PROVIDERS,
): HelixAskRuntimeTurnSummary | null {
  const record = readRecord(response);
  const debug = readRecord(record?.debug);
  const runtime = readSelectedRuntime(record, debug);
  const providerLabel = resolveHelixAskActualAgentProviderLabel(response, providers)?.replace(/^Provider:\s*/i, "");
  const adapter = readAdapterBoundary(record, debug, runtime);
  const visibleLanes = readModelVisibleLaneSummary(record, debug);
  const lanes = readLaneStatusSummary(record, debug);
  const backendProviders = readLaneBackendProviderConfigSummary(record, debug);
  const backend = readLaneBackendSummary(record, debug);
  const tools = readTurnToolSummary(record, debug);
  const projection = readLaneProjectionSummary(record, debug);
  const translationTraffic = readTranslationProjectionTrafficSummary(record, debug);
  const visibleTranslationChain = readVisibleTranslationChainSummary(record, debug);
  const laneSessions = readLaneSessionSummary(record, debug);
  const laneMail = readLaneMailLoopSummary(record, debug);
  const laneTimeline = readLaneTimelineSummary(record, debug);
  const goalBoundLanes = readGoalBoundLaneSummary(record, debug);
  const goalDispatchReadiness = readGoalDispatchReadinessSummary(record, debug);
  const runtimeGoal = readRuntimeGoalSessionSummary(record, debug);
  const terminal = readTerminalArtifactKind(record, debug);
  const debugRef = readDebugExportRef(record, debug);

  const rows: HelixAskRuntimeTurnSummaryRow[] = [
    providerLabel || runtime
      ? {
          key: "runtime_provider",
          label: "Runtime provider",
          value: [runtime || null, providerLabel || null].filter(Boolean).join(" / "),
        }
      : null,
    adapter ? { key: "adapter_boundary", label: "Adapter boundary", value: adapter } : null,
    visibleLanes ? { key: "visible_lanes", label: "Visible lanes", value: visibleLanes } : null,
    lanes ? { key: "capability_lanes", label: "Capability lanes", value: lanes } : null,
    backendProviders
      ? { key: "lane_backend_providers", label: "Lane backend providers", value: backendProviders }
      : null,
    backend ? { key: "lane_backend", label: "Lane backend", value: backend } : null,
    tools ? { key: "turn_tools", label: "Turn tools", value: tools } : null,
    projection ? { key: "lane_projection", label: "Lane projection", value: projection } : null,
    translationTraffic
      ? { key: "translation_traffic", label: "Translation traffic", value: translationTraffic }
      : null,
    visibleTranslationChain
      ? { key: "visible_translation_chain", label: "Visible translation chain", value: visibleTranslationChain }
      : null,
    laneSessions ? { key: "lane_sessions", label: "Lane sessions", value: laneSessions } : null,
    laneMail ? { key: "lane_mail", label: "Lane mail", value: laneMail } : null,
    laneTimeline ? { key: "lane_timeline", label: "Lane timeline", value: laneTimeline } : null,
    goalBoundLanes ? { key: "goal_bound_lanes", label: "Goal-bound lanes", value: goalBoundLanes } : null,
    goalDispatchReadiness
      ? { key: "goal_dispatch_readiness", label: "Goal dispatch readiness", value: goalDispatchReadiness }
      : null,
    runtimeGoal ? { key: "runtime_goal_session", label: "Runtime goal", value: runtimeGoal } : null,
    terminal ? { key: "terminal_artifact", label: "Terminal artifact", value: terminal } : null,
    debugRef ? { key: "debug_export", label: "Debug export", value: debugRef } : null,
  ].filter((row): row is HelixAskRuntimeTurnSummaryRow => Boolean(row));

  return rows.length > 0 ? { rows } : null;
}
