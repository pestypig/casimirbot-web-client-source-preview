import { hashDebugExportText } from "@/lib/agi/debugExport";
import {
  normalizedDebugReplyText,
} from "@/lib/helix/ask-debug-event-display";
import { sanitizeHelixAskTurnAdmissionContinuationDebug } from "@/lib/agi/helixAskTurnAdmissionContinuation";
import { readAgentLoopAuditRecord } from "@/lib/helix/ask-runtime-authority-readers";
import {
  buildVoiceClientDebugProjectionFields,
  buildVoicePlaybackReceiptBarrierDebug,
  buildVoicePlaybackReconciliationDebug,
  sanitizeVoiceDiagnosticsForExport,
} from "@/lib/helix/ask-voice-diagnostics-export";
import { getVoiceCaptureDiagnosticsSnapshot } from "@/lib/helix/voice-capture-diagnostics";
import {
  HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE,
  HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_TEXT,
} from "./HelixAskBackendEntrypointPolicy";
import { applyHelixAskBackendEntrypointFailureProjection } from "./HelixAskBackendEntrypointProjection";
import { copyHelixAskDebugJsonToClipboard } from "./HelixAskClipboard";
import { boundHelixDebugExportTextForUi } from "./HelixAskDebugExportSizeControl";
import type {
  HelixAskDebugClipboardCopyResult as RecrownedHelixAskDebugClipboardCopyResult,
} from "./HelixAskDebugDrawerState";
import {
  isHelixAskLegacyBackendDebugExportEligibleTurnId,
  normalizeHelixAskLegacyBackendTurnId,
  resolveHelixAskLegacyDebugExportBackendTarget,
  resolveHelixAskLegacyDebugExportClientTurnId,
} from "./HelixAskLegacyTurnControls";
import { mergeHelixAskRuntimeGoalDebugFields } from "./HelixAskRuntimeGoalDebugContext";
import { mergeHelixAskClientWorkflowDemoDebugIntoExport } from "./HelixAskWorkflowDebugProjection";

export type HelixAskDebugPayloadClipboardCopyResult = RecrownedHelixAskDebugClipboardCopyResult;

function coerceDebugCopyText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

function readDebugBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const text = coerceDebugCopyText(value).trim().toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  return null;
}

export function normalizeHelixAskBackendTurnDebugExportTurnId(value: unknown): string | null {
  return normalizeHelixAskLegacyBackendTurnId(value);
}

export function buildHelixAskBackendTurnDebugExportRef(value: unknown): Record<string, string> | null {
  const turnId = normalizeHelixAskBackendTurnDebugExportTurnId(value);
  if (!turnId || !isHelixAskLegacyBackendDebugExportEligibleTurnId(turnId)) return null;
  return {
    endpoint: `/api/agi/ask/turn/${encodeURIComponent(turnId)}/debug-export`,
    turn_id: turnId,
  };
}

export function buildHelixAskClientProjectionDebugFields(
  localPayload: Record<string, unknown>,
): Record<string, unknown> {
  const liveVoiceSnapshot = getVoiceCaptureDiagnosticsSnapshot();
  const liveVoice = liveVoiceSnapshot ? sanitizeVoiceDiagnosticsForExport(liveVoiceSnapshot) : null;
  const localDebug = readAgentLoopAuditRecord(localPayload.debug);
  const askTurnAdmissionContinuation = sanitizeHelixAskTurnAdmissionContinuationDebug(
    localPayload.client_ask_turn_admission_continuation ??
      localPayload.ask_turn_admission_continuation ??
      localDebug?.ask_turn_admission_continuation,
  );
  return {
    ...buildVoiceClientDebugProjectionFields({
      localPayload,
      liveVoice,
    }),
    ask_turn_admission_continuation: askTurnAdmissionContinuation,
  };
}

function readMaterializedTerminal(parsed: Record<string, unknown>): {
  text: string;
  terminalArtifactKind: string;
  finalAnswerSource: string;
} | null {
  const resolvedTurnSummary = readAgentLoopAuditRecord(parsed.resolved_turn_summary);
  const uiDebugParityHarness = readAgentLoopAuditRecord(parsed.ui_debug_parity_harness);
  const visibleFinalAnswer = coerceDebugCopyText(uiDebugParityHarness?.visible_final_answer).trim();
  const summaryTerminalKind = coerceDebugCopyText(resolvedTurnSummary?.terminal_artifact_kind).trim();
  const summaryFinalAnswerSource = coerceDebugCopyText(resolvedTurnSummary?.final_answer_source).trim();
  const summaryFinalStatus = coerceDebugCopyText(resolvedTurnSummary?.final_status).trim();
  if (
    (summaryTerminalKind === "workstation_tool_evaluation" || summaryTerminalKind === "model_synthesized_answer") &&
    summaryFinalStatus !== "typed_failure" &&
    visibleFinalAnswer &&
    visibleFinalAnswer !== HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_TEXT
  ) {
    return {
      text: visibleFinalAnswer,
      terminalArtifactKind: summaryTerminalKind,
      finalAnswerSource: summaryFinalAnswerSource || summaryTerminalKind,
    };
  }
  return null;
}

function projectHelixAskBackendDebugResolution(
  parsed: Record<string, unknown>,
  status: string,
  extra: Record<string, unknown> = {},
): string {
  const askEntrypointRequired = readDebugBoolean(parsed.ask_entrypoint_required) === true;
  const askEntrypointObserved = readDebugBoolean(parsed.ask_entrypoint_observed);
  const parsedDebugExportSource = coerceDebugCopyText(parsed.debug_export_source).trim();
  const parsedDebugExportRebuildReason = coerceDebugCopyText(parsed.debug_export_rebuild_reason).trim();
  const parsedReplyScopedDebugProjection =
    parsedDebugExportSource === "rendered_reply_dom" ||
    parsedDebugExportRebuildReason === "rendered_button_scope" ||
    parsedDebugExportRebuildReason === "rendered_reply" ||
    parsedDebugExportRebuildReason === "payload_reply_mismatch" ||
    parsedDebugExportRebuildReason === "empty_payload" ||
    parsedDebugExportRebuildReason === "invalid_json_payload";
  const materializedTerminal = readMaterializedTerminal(parsed);
  const backendEntrypointObserved = askEntrypointObserved === true || Boolean(materializedTerminal);
  const backendEntrypointBlocked =
    askEntrypointRequired && !backendEntrypointObserved && !parsedReplyScopedDebugProjection;
  const projected: Record<string, unknown> = {
    ...parsed,
    debug_export_source: status === "not_advertised"
      ? "client_projection"
      : "client_projection_backend_unresolved",
    backend_debug_response_status: status,
    ...extra,
    ...(materializedTerminal
      ? {
          selected_final_answer: materializedTerminal.text,
          visible_final_answer: materializedTerminal.text,
          final_answer_source: materializedTerminal.finalAnswerSource,
          terminal_artifact_kind: materializedTerminal.terminalArtifactKind,
          terminal_error_code: null,
          ask_entrypoint_observed: true,
          ask_entrypoint_failure_code: null,
          first_broken_rail: null,
          repair_target: null,
        }
      : {}),
  };
  if (backendEntrypointBlocked) {
    applyHelixAskBackendEntrypointFailureProjection({
      target: projected,
      source: {
        ...parsed,
        ask_entrypoint_failure_code:
          coerceDebugCopyText(parsed.ask_entrypoint_failure_code).trim() ||
          HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE,
      },
      debug: readAgentLoopAuditRecord(parsed.debug),
    });
  }
  return JSON.stringify(projected, null, 2);
}

export async function resolveHelixAskAuthoritativeDebugExportPayload(localPayload: string): Promise<string> {
  if (typeof fetch !== "function") return localPayload;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(localPayload) as Record<string, unknown>;
  } catch {
    return localPayload;
  }
  if (
    coerceDebugCopyText(parsed.debug_export_source).trim() === "backend_endpoint" &&
    coerceDebugCopyText(parsed.backend_debug_response_status).trim() === "fetched"
  ) {
    return localPayload;
  }

  const backendTarget = resolveHelixAskLegacyDebugExportBackendTarget(parsed);
  const activeTurnId = backendTarget.activeTurnId;
  const synthesizedBackendRef = buildHelixAskBackendTurnDebugExportRef(activeTurnId);
  if (backendTarget.status === "not_advertised" && !synthesizedBackendRef) {
    return projectHelixAskBackendDebugResolution(parsed, "not_advertised", {
      backend_debug_response_ref: undefined,
    });
  }
  const backendRef = backendTarget.backendRef ?? synthesizedBackendRef;
  if (backendTarget.status === "turn_mismatch") {
    return projectHelixAskBackendDebugResolution(parsed, "turn_mismatch", {
      backend_debug_response_ref: backendRef,
    });
  }
  const endpoint = backendTarget.endpoint ?? coerceDebugCopyText(backendRef?.endpoint).trim();
  if (!endpoint) {
    return projectHelixAskBackendDebugResolution(parsed, "not_advertised", {
      backend_debug_response_ref: undefined,
    });
  }
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return projectHelixAskBackendDebugResolution(parsed, "fetch_failed", {
        backend_debug_response_ref: backendRef,
        backend_debug_response_http_status: response.status,
      });
    }
    const body = await response.json() as Record<string, unknown>;
    const authoritativePayload = readAgentLoopAuditRecord(body.payload) ?? readAgentLoopAuditRecord(body);
    if (!authoritativePayload) {
      return projectHelixAskBackendDebugResolution(parsed, "payload_missing", {
        backend_debug_response_ref: backendRef,
      });
    }
    const rawAuthoritativeTurnId = coerceDebugCopyText(authoritativePayload.active_turn_id).trim();
    const authoritativeTurnId =
      normalizeHelixAskLegacyBackendTurnId(rawAuthoritativeTurnId) ?? rawAuthoritativeTurnId;
    if (activeTurnId && authoritativeTurnId && authoritativeTurnId !== activeTurnId) {
      return projectHelixAskBackendDebugResolution(parsed, "turn_mismatch", {
        backend_debug_response_ref: backendRef,
        backend_debug_response_turn_id: authoritativeTurnId || null,
      });
    }
    const localPrompt = normalizedDebugReplyText(
      parsed.selectedDebugQuestion ?? parsed.active_prompt ?? parsed.prompt ?? parsed.user_prompt,
    );
    const authoritativePrompt = normalizedDebugReplyText(
      authoritativePayload.selectedDebugQuestion ??
        authoritativePayload.active_prompt ??
        authoritativePayload.prompt ??
        authoritativePayload.user_prompt,
    );
    if (localPrompt && authoritativePrompt && localPrompt !== authoritativePrompt) {
      return projectHelixAskBackendDebugResolution(parsed, "prompt_mismatch", {
        backend_debug_response_ref: backendRef,
        backend_debug_response_turn_id: authoritativeTurnId || null,
        backend_debug_response_prompt: authoritativePrompt,
      });
    }
    const clientProjection = buildHelixAskClientProjectionDebugFields(parsed);
    const clientActiveTurnId = resolveHelixAskLegacyDebugExportClientTurnId(parsed);
    const clientConsoleAssemblyDebug =
      readAgentLoopAuditRecord(parsed.console_assembly_debug) ??
      readAgentLoopAuditRecord(readAgentLoopAuditRecord(parsed.debug)?.console_assembly_debug) ??
      readAgentLoopAuditRecord(readAgentLoopAuditRecord(parsed.reply)?.console_assembly_debug);
    const clientWorkflowDemoDebug =
      readAgentLoopAuditRecord(parsed.workflow_demo_debug) ??
      readAgentLoopAuditRecord(readAgentLoopAuditRecord(parsed.channels)?.workflowDemo);
    const mergedPayload: Record<string, unknown> = {
      ...authoritativePayload,
      ...mergeHelixAskRuntimeGoalDebugFields(authoritativePayload, parsed),
      debug_export_source: "backend_endpoint",
      backend_debug_response_status: "fetched",
      client_active_turn_id: clientActiveTurnId,
      ui_client_active_turn_id: clientActiveTurnId,
      console_assembly_debug: clientConsoleAssemblyDebug,
      client_console_assembly_debug: clientConsoleAssemblyDebug,
      client_projection_payload_hash: hashDebugExportText(localPayload),
      client_debug_projection: clientProjection,
      client_ask_turn_admission_continuation:
        clientProjection.ask_turn_admission_continuation ?? null,
      client_voice_debug: clientProjection.voice,
      client_voice_authority_debug: clientProjection.voice_authority_debug,
      client_voice_playback_receipts: clientProjection.voice_playback_receipts,
      client_voice_playback_output: clientProjection.voice_playback_output,
      client_voice_playback_metrics: clientProjection.voice_playback_metrics,
      client_voice_calls: clientProjection.voice_calls,
      workflow_demo_debug: clientWorkflowDemoDebug,
    };
    return boundHelixDebugExportTextForUi(JSON.stringify({
      ...mergedPayload,
      voice_playback_reconciliation: buildVoicePlaybackReconciliationDebug({
        activeTurnId: coerceDebugCopyText(mergedPayload.active_turn_id).trim() || null,
        selectedFinalAnswer: coerceDebugCopyText(mergedPayload.selected_final_answer).trim() || null,
        source: mergedPayload,
      }),
      voice_playback_receipt_barrier: buildVoicePlaybackReceiptBarrierDebug({
        activeTurnId: coerceDebugCopyText(mergedPayload.active_turn_id).trim() || null,
        selectedFinalAnswer: coerceDebugCopyText(mergedPayload.selected_final_answer).trim() || null,
        source: mergedPayload,
      }),
    }, null, 2));
  } catch (error) {
    return projectHelixAskBackendDebugResolution(parsed, "fetch_error", {
      backend_debug_response_ref: backendRef,
      backend_debug_response_error: error instanceof Error ? error.message : "debug_export_fetch_error",
    });
  }
}

export async function copyHelixAskDebugPayloadToClipboard(
  payload: string,
): Promise<HelixAskDebugPayloadClipboardCopyResult> {
  const localJson = boundHelixDebugExportTextForUi(typeof payload === "string" ? payload : "");
  const json = await resolveHelixAskAuthoritativeDebugExportPayload(localJson);
  return copyHelixAskDebugJsonToClipboard(json);
}
