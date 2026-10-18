import {
  isHelixAskProgressPlaceholderText,
  normalizedDebugReplyText,
} from "@/lib/helix/ask-debug-event-display";
import { readAgentLoopAuditRecord } from "@/lib/helix/ask-runtime-authority-readers";
import {
  collectHelixAskLegacyReplyTerminalTranscriptTexts,
  debugPayloadMatchesHelixAskLegacyRenderedReply,
  extractHelixAskLegacyClickedTurnDebugScope,
  isHelixAskLegacyBackendDebugExportEligibleTurnId,
  isHelixAskLegacyRenderedButtonBackendTurnScopeTrusted,
} from "./HelixAskLegacyTurnControls";

export type HelixAskRenderedReplyDebugExportReply = {
  id?: string | null;
  mode?: string | null;
  question?: string | null;
  content?: string | null;
  sources?: unknown[] | null;
  debug?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type HelixAskRenderedReplyVisibleTerminal = {
  text?: string | null;
  finalAnswerSource?: string | null;
  terminalArtifactKind?: string | null;
};

export type HelixAskRenderedReplyDebugExportDeps = {
  buildEnvelope: (
    reply: HelixAskRenderedReplyDebugExportReply,
    payload: Record<string, unknown>,
  ) => string;
  resolveVisibleTerminal: (
    reply: HelixAskRenderedReplyDebugExportReply,
    fallbackContent?: string | null,
  ) => HelixAskRenderedReplyVisibleTerminal;
  resolveReplyDebugTurnId: (reply: HelixAskRenderedReplyDebugExportReply) => string | null;
};

function coerceRenderedDebugText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

export function buildHelixAskReplyScopedDebugExportFromRenderedReply(args: {
  reply: HelixAskRenderedReplyDebugExportReply;
  reason: string;
  deps: HelixAskRenderedReplyDebugExportDeps;
}): string {
  const visibleTerminal = args.deps.resolveVisibleTerminal(args.reply, args.reply.content ?? null);
  const visibleAnswerText = visibleTerminal.text || args.reply.content || "";
  const suppressVisibleAnswer = isHelixAskProgressPlaceholderText(visibleAnswerText);
  const replyRecord = args.reply as Record<string, unknown>;
  const activeTurnId = args.deps.resolveReplyDebugTurnId(args.reply);
  const clientTurnId = args.reply.id || null;
  return args.deps.buildEnvelope(args.reply, {
    schema: "helix.ask.master_event_clock.v2",
    exportedAt: new Date().toISOString(),
    debug_export_rebuild_reason: args.reason,
    active_turn_id: activeTurnId,
    client_active_turn_id: clientTurnId,
    selectedDebugTurnId: activeTurnId,
    selectedDebugQuestion: args.reply.question ?? null,
    selectedDebugFinalAnswer: suppressVisibleAnswer ? "" : visibleAnswerText,
    selectedDebugSource: "rendered_reply",
    reply: {
      id: args.reply.id,
      mode: args.reply.mode ?? null,
      question: args.reply.question ?? null,
      sourceCount: args.reply.sources?.length ?? 0,
    },
    debug: args.reply.debug ?? null,
    active_prompt: args.reply.question ?? null,
    selected_final_answer: suppressVisibleAnswer ? "" : visibleAnswerText,
    final_answer_source:
      replyRecord.final_answer_source ?? args.reply.debug?.final_answer_source ?? visibleTerminal.finalAnswerSource ?? null,
    terminal_artifact_kind:
      replyRecord.terminal_artifact_kind ??
      args.reply.debug?.terminal_artifact_kind ??
      visibleTerminal.terminalArtifactKind ??
      null,
    terminal_result: replyRecord.terminal_result ?? args.reply.debug?.terminal_result ?? null,
    terminal_results: replyRecord.terminal_results ?? args.reply.debug?.terminal_results ?? [],
    debug_export_ref: replyRecord.debug_export_ref ?? args.reply.debug?.debug_export_ref ?? null,
    backend_debug_response_ref:
      replyRecord.backend_debug_response_ref ?? args.reply.debug?.backend_debug_response_ref ?? null,
    golden_path_runtime: replyRecord.golden_path_runtime ?? args.reply.debug?.golden_path_runtime ?? null,
    golden_path_runtime_status:
      replyRecord.golden_path_runtime_status ?? args.reply.debug?.golden_path_runtime_status ?? null,
    server_build_commit: replyRecord.server_build_commit ?? args.reply.debug?.server_build_commit ?? null,
    server_build_started_at_ms:
      replyRecord.server_build_started_at_ms ?? args.reply.debug?.server_build_started_at_ms ?? null,
  });
}

export function buildHelixAskReplyScopedDebugExportFromRenderedButton(args: {
  reply: HelixAskRenderedReplyDebugExportReply;
  sourceElement: HTMLElement | null | undefined;
  reason: string;
  deps: HelixAskRenderedReplyDebugExportDeps;
}): string | null {
  const rendered = extractHelixAskLegacyClickedTurnDebugScope(args.sourceElement);
  if (!rendered || (!rendered.question && !rendered.finalAnswer)) return null;
  const visibleTerminal = args.deps.resolveVisibleTerminal(args.reply, args.reply.content ?? null);
  const replyTerminalTranscriptTexts = collectHelixAskLegacyReplyTerminalTranscriptTexts(args.reply);
  const renderedFinalMatchesReply =
    !rendered.finalAnswer ||
    [visibleTerminal.text, args.reply.content, ...replyTerminalTranscriptTexts]
      .map(normalizedDebugReplyText)
      .filter(Boolean)
      .some((candidate) => candidate === normalizedDebugReplyText(rendered.finalAnswer));
  const renderedMatchesReply =
    (!rendered.question || normalizedDebugReplyText(rendered.question) === normalizedDebugReplyText(args.reply.question)) &&
    renderedFinalMatchesReply;
  const replyRecord = args.reply as Record<string, unknown>;
  const rawReplyDebugRecord = renderedMatchesReply ? readAgentLoopAuditRecord(args.reply.debug) : null;
  const replyDebugMatchesRenderedReply = Boolean(
    rawReplyDebugRecord &&
    debugPayloadMatchesHelixAskLegacyRenderedReply(args.reply, rawReplyDebugRecord),
  );
  const replyDebugRecord = replyDebugMatchesRenderedReply ? rawReplyDebugRecord : null;
  const backendTurnScopeTrusted = isHelixAskLegacyRenderedButtonBackendTurnScopeTrusted({
    rendered,
    renderedMatchesReply,
    replyDebugRecord,
  });
  const renderedClientScopedTurnId =
    rendered.clientTurnId && (rendered.question || rendered.finalAnswer) ? rendered.clientTurnId : null;
  const replyResolvedTurnId = args.deps.resolveReplyDebugTurnId(args.reply);
  const replyResolvedTurnIdTrusted =
    backendTurnScopeTrusted &&
    (!isHelixAskLegacyBackendDebugExportEligibleTurnId(replyResolvedTurnId) || Boolean(rendered.activeTurnId));
  const activeTurnId =
    (backendTurnScopeTrusted ? rendered.activeTurnId : null) ||
    renderedClientScopedTurnId ||
    (replyResolvedTurnIdTrusted ? replyResolvedTurnId : args.reply.id) ||
    null;
  const clientTurnId = rendered.clientTurnId || args.reply.id || null;
  const includeReplyDebug = renderedMatchesReply && replyDebugMatchesRenderedReply && backendTurnScopeTrusted;
  const renderedModelPolicyDebugSummary = coerceRenderedDebugText(rendered.modelPolicyDebugSummary).trim();
  const renderedLanguageModelDebugSummary =
    /^AI:\s*/i.test(renderedModelPolicyDebugSummary) ? renderedModelPolicyDebugSummary : null;
  return args.deps.buildEnvelope(args.reply, {
    schema: "helix.ask.master_event_clock.v2",
    exportedAt: new Date().toISOString(),
    debug_export_rebuild_reason: args.reason,
    debug_export_source: "rendered_reply_dom",
    backend_debug_response_status: "not_advertised",
    active_turn_id: renderedMatchesReply ? activeTurnId : null,
    client_active_turn_id: clientTurnId ?? args.reply.id,
    selectedDebugTurnId: renderedMatchesReply ? activeTurnId : null,
    selectedDebugQuestion: rendered.question ?? args.reply.question ?? null,
    selectedDebugFinalAnswer: rendered.finalAnswer ?? "",
    selectedDebugSource: "rendered_reply_dom",
    reply: {
      id: renderedMatchesReply ? args.reply.id : null,
      client_id: args.reply.id,
      mode: args.reply.mode ?? null,
      question: rendered.question ?? args.reply.question ?? null,
      sourceCount: args.reply.sources?.length ?? 0,
    },
    debug: includeReplyDebug ? args.reply.debug ?? null : null,
    language_model_debug_summary:
      (includeReplyDebug ? replyRecord.language_model_debug_summary ?? replyDebugRecord?.language_model_debug_summary : null) ??
      renderedLanguageModelDebugSummary,
    model_policy_debug_summary:
      (includeReplyDebug ? replyRecord.model_policy_debug_summary ?? replyDebugRecord?.model_policy_debug_summary : null) ??
      renderedLanguageModelDebugSummary,
    active_prompt: rendered.question ?? args.reply.question ?? null,
    selected_final_answer: rendered.finalAnswer ?? "",
    final_answer_source:
      rendered.terminalArtifactKind ??
      (includeReplyDebug ? replyRecord.final_answer_source : null) ??
      replyDebugRecord?.final_answer_source ??
      visibleTerminal.finalAnswerSource ??
      null,
    terminal_artifact_kind:
      rendered.terminalArtifactKind ??
      (includeReplyDebug ? replyRecord.terminal_artifact_kind : null) ??
      replyDebugRecord?.terminal_artifact_kind ??
      visibleTerminal.terminalArtifactKind ??
      null,
    terminal_result: includeReplyDebug ? replyRecord.terminal_result ?? replyDebugRecord?.terminal_result ?? null : null,
    terminal_results: includeReplyDebug ? replyRecord.terminal_results ?? replyDebugRecord?.terminal_results ?? [] : [],
    debug_export_ref: includeReplyDebug ? replyRecord.debug_export_ref ?? replyDebugRecord?.debug_export_ref ?? null : null,
    backend_debug_response_ref: includeReplyDebug
      ? replyRecord.backend_debug_response_ref ?? replyDebugRecord?.backend_debug_response_ref ?? null
      : null,
    golden_path_runtime: includeReplyDebug ? replyRecord.golden_path_runtime ?? replyDebugRecord?.golden_path_runtime ?? null : null,
    golden_path_runtime_status: includeReplyDebug
      ? replyRecord.golden_path_runtime_status ?? replyDebugRecord?.golden_path_runtime_status ?? null
      : null,
    server_build_commit: includeReplyDebug ? replyRecord.server_build_commit ?? replyDebugRecord?.server_build_commit ?? null : null,
    server_build_started_at_ms: includeReplyDebug
      ? replyRecord.server_build_started_at_ms ?? replyDebugRecord?.server_build_started_at_ms ?? null
      : null,
  });
}
