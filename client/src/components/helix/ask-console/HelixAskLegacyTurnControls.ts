import {
  formatReadAloudButtonLabel,
  shouldPauseReadAloudOnButtonPress,
  shouldResumeReadAloudOnButtonPress,
  shouldStopReadAloudOnButtonPress,
  type ReadAloudPlaybackState,
} from "@/lib/helix/ask-read-aloud-display";
import {
  cleanHelixRenderedFinalAnswerText,
  cleanHelixRenderedQuestionText,
  normalizedDebugReplyText,
} from "@/lib/helix/ask-debug-event-display";
import { formatEnvelopeSectionsForCopy } from "@/lib/helix/ask-envelope-copy";
import {
  readAgentLoopAuditArray,
  readAgentLoopAuditRecord,
} from "@/lib/helix/ask-runtime-authority-readers";
import { dedupeStrings } from "@/lib/helix/ask-value-normalization";
import { resolveHelixVisibleTerminal } from "@/lib/helix/resolveHelixVisibleTerminal";
import type { HelixAskLatestTurnBinding } from "./HelixAskLatestTurnBinding";

type HelixAskLegacyReplyEnvelopeSection = {
  layer?: string;
  title?: unknown;
  body?: unknown;
  citations?: unknown;
};

type HelixAskLegacyReplyForControls = {
  id?: string;
  content?: unknown;
  question?: unknown;
  text?: unknown;
  debug?: unknown;
  turn_id?: unknown;
  turnId?: unknown;
  resolved_turn_summary?: unknown;
  terminal_answer_authority?: unknown;
  envelope?: {
    answer?: unknown;
    extension?: {
      body?: unknown;
    } | null;
    sections?: HelixAskLegacyReplyEnvelopeSection[];
  } | null;
  [key: string]: unknown;
};

export type HelixAskLegacyTurnControlTextArgs = {
  visibleFinalAnswerText?: unknown;
  fallbackCopyText?: unknown;
};

export type HelixAskLegacyTurnControlActionPayload = {
  replyId: string;
  text: string;
  hasText: boolean;
};

export type HelixAskLegacyDebugCopyLocalPayloadArgs = {
  providedPayload?: unknown;
  normalizedPayload: string;
  renderedButtonScopedPayload?: string | null;
  providedPayloadMatchesRenderedTurn: boolean;
};

export type HelixAskLegacyDebugCopyLocalPayloadSelection = {
  localExportPayload: string;
  source: "provided_rendered_turn_payload" | "rendered_button_scope" | "normalized_payload";
};

export type HelixAskLegacyClickedTurnDebugScope = {
  question?: string | null;
  finalAnswer?: string | null;
  terminalArtifactKind?: string | null;
  modelPolicyDebugSummary?: string | null;
  activeTurnId?: string | null;
  clientTurnId?: string | null;
};

export type HelixAskLegacyClickedTurnDebugGuardArgs = {
  exportPayload: string;
  clickedButtonScopedPayload?: string | null;
  clickedTurnScope?: HelixAskLegacyClickedTurnDebugScope | null;
  payloadMatchesClickedTurn: (payload: string) => boolean;
};

export type HelixAskLegacyReplyScopedDebugExportGuardArgs = {
  exportPayload: string;
  replyScopedFallbackPayload?: string | null;
  payloadMatchesExpectedReply: (payload: string) => boolean;
};

export type HelixAskLegacyClickedDebugReplySelection<TReply extends { id?: string | null }> = {
  reply: TReply;
  source: "clicked_client_turn_id" | "current_reply";
};

export type HelixAskLegacyDebugExportBackendRef = {
  endpoint?: string;
  turn_id?: string;
  [key: string]: unknown;
};

export type HelixAskLegacyDebugExportBackendTarget = {
  activeTurnId: string;
  backendRef: HelixAskLegacyDebugExportBackendRef | null;
  endpoint: string | null;
  status: "ready" | "not_advertised" | "turn_mismatch";
};

export type HelixAskLegacyTurnControlViewModel = {
  showDebugCopy: boolean;
  debugCopyDisabled: boolean;
  copyFinalTestId?: HelixAskLatestTurnBinding["copyFinalTestId"];
  debugCopyTestId?: HelixAskLatestTurnBinding["debugCopyTestId"];
  readAloudTestId?: HelixAskLatestTurnBinding["readAloudTestId"];
  readAloudActive: boolean;
  readAloudState: ReadAloudPlaybackState;
  readAloudAriaLabel: string;
  readAloudTitle: string;
};

function coerceControlText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

function readControlRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readBackendDebugRef(value: unknown): HelixAskLegacyDebugExportBackendRef | null {
  const record = readControlRecord(value);
  if (!record) return null;
  const endpoint = coerceControlText(record.endpoint).trim();
  if (!endpoint.startsWith("/api/agi/ask/turn/")) return null;
  return {
    ...record,
    endpoint,
    turn_id: coerceControlText(record.turn_id).trim() || undefined,
  };
}

export function buildHelixAskLegacyTurnControlViewModel(args: {
  latestTurnBinding: HelixAskLatestTurnBinding;
  showDebugCopy: boolean;
  browserAvailable: boolean;
  readAloudState?: ReadAloudPlaybackState | null;
}): HelixAskLegacyTurnControlViewModel {
  const readAloudState = args.readAloudState ?? "idle";
  const readAloudActive =
    shouldStopReadAloudOnButtonPress(readAloudState) ||
    shouldPauseReadAloudOnButtonPress(readAloudState) ||
    shouldResumeReadAloudOnButtonPress(readAloudState);
  const readAloudTitle = formatReadAloudButtonLabel(readAloudState);
  return {
    showDebugCopy: args.showDebugCopy,
    debugCopyDisabled: !args.browserAvailable,
    copyFinalTestId: args.latestTurnBinding.copyFinalTestId,
    debugCopyTestId: args.latestTurnBinding.debugCopyTestId,
    readAloudTestId: args.latestTurnBinding.readAloudTestId,
    readAloudActive,
    readAloudState,
    readAloudAriaLabel: readAloudTitle,
    readAloudTitle,
  };
}

export function resolveHelixAskLegacyTurnControlText(
  args: HelixAskLegacyTurnControlTextArgs,
): string {
  const visibleFinalAnswerText = coerceControlText(args.visibleFinalAnswerText).trim();
  if (visibleFinalAnswerText) return visibleFinalAnswerText;
  return coerceControlText(args.fallbackCopyText);
}

export function collectHelixAskLegacyReplyTerminalTranscriptTexts(
  reply: HelixAskLegacyReplyForControls | null | undefined,
): string[] {
  if (!reply) return [];
  const replyRecord = reply as Record<string, unknown>;
  const debug = readAgentLoopAuditRecord(reply.debug);
  const agentLoop = readAgentLoopAuditRecord(
    replyRecord.agentLoop ?? replyRecord.agent_loop ?? debug?.agentLoop ?? debug?.agent_loop,
  );
  const candidates = [
    replyRecord.turn_transcript_events,
    replyRecord.turnTranscriptEvents,
    replyRecord.transcript_events,
    debug?.turn_transcript_events,
    debug?.turnTranscriptEvents,
    debug?.transcript_events,
    agentLoop?.turn_transcript_events,
    agentLoop?.turnTranscriptEvents,
    agentLoop?.transcript_events,
  ];
  const texts: string[] = [];
  candidates.forEach((candidate) => {
    readAgentLoopAuditArray(candidate).forEach((entry) => {
      const record = readAgentLoopAuditRecord(entry);
      if (!record) return;
      const sourceEventType = coerceControlText(record.source_event_type).trim();
      const type = coerceControlText(record.type).trim();
      if (
        sourceEventType !== "terminal_answer" &&
        sourceEventType !== "final_answer" &&
        type !== "terminal_answer" &&
        type !== "final_answer"
      ) {
        return;
      }
      const text = cleanHelixRenderedFinalAnswerText(coerceControlText(record.text));
      if (text) texts.push(text);
    });
  });
  return dedupeStrings(texts);
}

export function buildHelixAskLegacyTurnControlActionPayload(args: {
  reply: HelixAskLegacyReplyForControls | null | undefined;
  visibleFinalAnswerText?: unknown;
  fallbackCopyText?: unknown;
}): HelixAskLegacyTurnControlActionPayload {
  const replyId = coerceControlText(args.reply?.id).trim();
  const text = resolveHelixAskLegacyTurnControlText({
    visibleFinalAnswerText: args.visibleFinalAnswerText,
    fallbackCopyText: args.fallbackCopyText,
  });
  return {
    replyId,
    text,
    hasText: text.trim().length > 0,
  };
}

export function clearHelixAskLegacyCopiedDebugIdIfCurrent(
  currentReplyId: string | null,
  copiedReplyId: string,
): string | null {
  return currentReplyId === copiedReplyId ? null : currentReplyId;
}

export function resolveHelixAskLegacyClickedDebugReply<TReply extends { id?: string | null }>(
  currentReply: TReply,
  replies: readonly TReply[],
  clickedTurnScope: HelixAskLegacyClickedTurnDebugScope | null | undefined,
): HelixAskLegacyClickedDebugReplySelection<TReply> {
  const clickedClientTurnId = coerceControlText(clickedTurnScope?.clientTurnId).trim();
  if (clickedClientTurnId) {
    const clickedReply = replies.find((candidate) => coerceControlText(candidate.id).trim() === clickedClientTurnId);
    if (clickedReply) {
      return {
        reply: clickedReply,
        source: "clicked_client_turn_id",
      };
    }
  }
  return {
    reply: currentReply,
    source: "current_reply",
  };
}

export function resolveHelixAskLegacyDebugExportClientTurnId(
  parsedPayload: Record<string, unknown>,
): string | null {
  const rawActiveTurnId = coerceControlText(parsedPayload.active_turn_id).trim();
  const nestedClientTurnId =
    rawActiveTurnId && rawActiveTurnId !== normalizeHelixAskLegacyBackendTurnId(rawActiveTurnId)
      ? rawActiveTurnId
      : null;
  return (
    coerceControlText(parsedPayload.client_active_turn_id).trim() ||
    coerceControlText(parsedPayload.clientSelectedDebugTurnId).trim() ||
    coerceControlText(readControlRecord(parsedPayload.reply)?.id).trim() ||
    nestedClientTurnId ||
    null
  );
}

export function normalizeHelixAskLegacyBackendTurnId(value: unknown): string | null {
  const text = coerceControlText(value).trim();
  if (!text) return null;
  if (text.startsWith("ask:")) return text;
  const match = text.match(/(?:^|:)(ask:[^:]+)/i);
  return match?.[1] ?? null;
}

export function buildHelixAskReplyCopyText(reply: HelixAskLegacyReplyForControls | null | undefined): string {
  if (!reply) return "";
  const fallbackContent = coerceControlText(reply.content || reply.text);
  const terminal = resolveHelixVisibleTerminal(reply, fallbackContent);
  if (terminal.backendTerminalText && terminal.text) return terminal.text;
  if (!reply.envelope) return terminal.text || fallbackContent;
  const sections = reply.envelope.sections ?? [];
  const detailSections = sections.filter((section) => section.layer !== "proof");
  const proofSections = sections.filter((section) => section.layer === "proof");
  const chunks: string[] = [coerceControlText(reply.envelope.answer)];
  const extensionBody = coerceControlText(reply.envelope.extension?.body).trim();
  if (extensionBody) {
    chunks.push(`Additional Repo Context\n${extensionBody}`);
  }
  if (detailSections.length > 0) {
    const detailText = formatEnvelopeSectionsForCopy(detailSections, "Details");
    if (detailText) {
      chunks.push(`Details\n${detailText}`);
    }
  }
  if (proofSections.length > 0) {
    const proofText = formatEnvelopeSectionsForCopy(proofSections, "Proof");
    if (proofText) {
      chunks.push(`Proof\n${proofText}`);
    }
  }
  const envelopeText = chunks.filter(Boolean).join("\n\n").trim();
  return envelopeText || terminal.text || fallbackContent;
}

export function selectHelixAskLegacyDebugCopyLocalPayload(
  args: HelixAskLegacyDebugCopyLocalPayloadArgs,
): HelixAskLegacyDebugCopyLocalPayloadSelection {
  const renderedButtonScopedPayload = coerceControlText(args.renderedButtonScopedPayload).trim();
  if (renderedButtonScopedPayload) {
    return {
      localExportPayload: renderedButtonScopedPayload,
      source: "rendered_button_scope",
    };
  }

  const providedPayload = coerceControlText(args.providedPayload).trim();
  if (providedPayload && args.providedPayloadMatchesRenderedTurn) {
    return {
      localExportPayload: providedPayload,
      source: "provided_rendered_turn_payload",
    };
  }

  return {
    localExportPayload: args.normalizedPayload,
    source: "normalized_payload",
  };
}

export function selectHelixAskLegacyGuardedDebugExportPayload(
  args: HelixAskLegacyClickedTurnDebugGuardArgs,
): string {
  const rendered = args.clickedTurnScope;
  if (!rendered) return args.exportPayload;
  const scopedPayload = coerceControlText(args.clickedButtonScopedPayload).trim();
  if (!scopedPayload) return args.exportPayload;
  try {
    const parsed = JSON.parse(args.exportPayload) as Record<string, unknown>;
    const parsedReply = readControlRecord(parsed.reply);
    const parsedCurrentTurn = readControlRecord(parsed.currentTurn);
    const activeTurnCandidates = [
      parsed.active_turn_id,
      parsed.backend_turn_id,
      parsed.selectedDebugTurnId,
      parsedCurrentTurn?.turn_id,
      parsedCurrentTurn?.turnId,
    ]
      .map((candidate) => coerceControlText(candidate).trim())
      .filter(Boolean);
    const renderedActiveTurnId = coerceControlText(rendered.activeTurnId).trim();
    const canonicalRenderedActiveTurnId = normalizeHelixAskLegacyBackendTurnId(renderedActiveTurnId);
    if (
      renderedActiveTurnId &&
      activeTurnCandidates.length > 0 &&
      !activeTurnCandidates.some((candidate) =>
        candidate === renderedActiveTurnId ||
        Boolean(
          canonicalRenderedActiveTurnId &&
          normalizeHelixAskLegacyBackendTurnId(candidate) === canonicalRenderedActiveTurnId
        )
      )
    ) {
      return scopedPayload;
    }
    const clientTurnCandidates = [
      parsed.client_active_turn_id,
      parsed.ui_client_active_turn_id,
      parsedReply?.client_id,
      parsedReply?.id,
    ]
      .map((candidate) => coerceControlText(candidate).trim())
      .filter(Boolean);
    const renderedClientTurnId = coerceControlText(rendered.clientTurnId).trim();
    if (
      renderedClientTurnId &&
      clientTurnCandidates.length > 0 &&
      !clientTurnCandidates.some((candidate) => candidate === renderedClientTurnId)
    ) {
      return scopedPayload;
    }
    if (!args.payloadMatchesClickedTurn(args.exportPayload)) {
      return scopedPayload;
    }
    return args.exportPayload;
  } catch {
    return scopedPayload;
  }
}

export function selectHelixAskLegacyReplyScopedDebugExportPayload(
  args: HelixAskLegacyReplyScopedDebugExportGuardArgs,
): string {
  if (args.payloadMatchesExpectedReply(args.exportPayload)) return args.exportPayload;
  const fallbackPayload = coerceControlText(args.replyScopedFallbackPayload).trim();
  if (fallbackPayload) {
    try {
      const authoritative = JSON.parse(args.exportPayload) as Record<string, unknown>;
      const fallback = JSON.parse(fallbackPayload) as Record<string, unknown>;
      const fetchedBackendPayload =
        coerceControlText(authoritative.debug_export_source).trim() === "backend_endpoint" &&
        coerceControlText(authoritative.backend_debug_response_status).trim() === "fetched";
      const authoritativeTurnId = normalizeHelixAskLegacyBackendTurnId(
        authoritative.active_turn_id ?? authoritative.backend_turn_id,
      );
      const fallbackTurnId = normalizeHelixAskLegacyBackendTurnId(
        fallback.active_turn_id ?? fallback.backend_turn_id,
      );
      if (fetchedBackendPayload && authoritativeTurnId && authoritativeTurnId === fallbackTurnId) {
        return args.exportPayload;
      }
    } catch {
      // Fall back to the rendered reply-scoped payload below.
    }
  }
  return fallbackPayload || args.exportPayload;
}

function resolveHelixAskLegacyTerminalArtifactKindFromText(args: {
  terminalSource?: string | null;
  finalAnswer?: string | null;
  fallbackText?: string | null;
}): string | null {
  const terminalSource = coerceControlText(args.terminalSource).trim();
  const finalAnswer = coerceControlText(args.finalAnswer);
  const fallbackText = coerceControlText(args.fallbackText);
  if (/compound evidence synthesis answer/i.test(terminalSource)) return "compound_evidence_synthesis_answer";
  if (/workstation tool evaluation/i.test(terminalSource)) return "workstation_tool_evaluation";
  if (/typed failure/i.test(terminalSource)) return "typed_failure";
  if (/COMPOUND EVIDENCE SYNTHESIS ANSWER/i.test(finalAnswer || fallbackText)) return "compound_evidence_synthesis_answer";
  if (/WORKSTATION TOOL EVALUATION/i.test(finalAnswer || fallbackText)) return "workstation_tool_evaluation";
  if (/TYPED FAILURE/i.test(finalAnswer || fallbackText)) return "typed_failure";
  return null;
}

export function extractHelixAskLegacyClickedTurnDebugScopeFromAncestor(
  sourceElement: HTMLElement | null | undefined,
): HelixAskLegacyClickedTurnDebugScope | null {
  if (!sourceElement) return null;
  let node: HTMLElement | null = sourceElement;
  for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
    const questionNode = node.querySelector<HTMLElement>('[data-stream-row-source="question"], [data-testid="helix-ask-latest-question"]');
    const finalNode = node.querySelector<HTMLElement>('[data-stream-row-source="final"], [data-testid="helix-ask-latest-final-answer"]');
    const renderedQuestion = cleanHelixRenderedQuestionText(questionNode?.innerText || questionNode?.textContent || "");
    const renderedFinalAnswer =
      cleanHelixRenderedFinalAnswerText(finalNode?.getAttribute("data-final-answer-text")) ??
      cleanHelixRenderedFinalAnswerText(finalNode?.innerText || finalNode?.textContent || "");
    if (renderedQuestion || renderedFinalAnswer) {
      return {
        question: renderedQuestion,
        finalAnswer: renderedFinalAnswer,
        terminalArtifactKind: resolveHelixAskLegacyTerminalArtifactKindFromText({
          terminalSource: finalNode?.getAttribute("data-visible-terminal-source"),
          finalAnswer: renderedFinalAnswer,
        }),
        activeTurnId: null,
        clientTurnId: null,
      };
    }
    const text = (node.innerText || "").trim();
    if (!text || !/\bQuestion\b/i.test(text) || !/\bFinal answer\b/i.test(text)) continue;
    const questionMatch = text.match(/Question\s+QUESTION\s+([\s\S]*?)\s+USER PROMPT/i);
    const finalMatch = text.match(/Final answer\s+FINAL\s+([\s\S]*?)(?:\s+IN HELIX CONSOLE|\s+\d+\s+Question|\s*$)/i);
    const question = questionMatch?.[1]?.trim() || null;
    const finalAnswer = finalMatch?.[1]?.trim() || null;
    if (!question && !finalAnswer) continue;
    return {
      question,
      finalAnswer,
      terminalArtifactKind: resolveHelixAskLegacyTerminalArtifactKindFromText({ finalAnswer, fallbackText: text }),
      activeTurnId: null,
      clientTurnId: null,
    };
  }
  return null;
}

export function extractHelixAskLegacyClickedTurnDebugScope(
  sourceElement: HTMLElement | null | undefined,
): HelixAskLegacyClickedTurnDebugScope | null {
  if (!sourceElement) return null;
  const readSourceAttribute = (name: string): string => {
    if (typeof sourceElement.getAttribute !== "function") return "";
    return sourceElement.getAttribute(name) || "";
  };
  const readTurnScopeAttribute = (name: string, legacyName: string): string =>
    readSourceAttribute(name) || readSourceAttribute(legacyName);
  const scopedQuestion = cleanHelixRenderedQuestionText(
    readTurnScopeAttribute("data-turn-control-question", "data-debug-copy-question"),
  );
  const scopedFinalAnswer = cleanHelixRenderedFinalAnswerText(
    readTurnScopeAttribute("data-turn-control-final-answer", "data-debug-copy-final-answer"),
  );
  const scopedActiveTurnId = coerceControlText(
    readTurnScopeAttribute("data-turn-control-active-turn-id", "data-debug-copy-active-turn-id"),
  ).trim();
  const scopedClientTurnId = coerceControlText(
    readTurnScopeAttribute("data-turn-control-client-turn-id", "data-debug-copy-client-turn-id"),
  ).trim();
  const scopedTerminalArtifactKind = coerceControlText(
    readTurnScopeAttribute("data-turn-control-terminal-artifact-kind", "data-debug-copy-terminal-artifact-kind"),
  ).trim();
  const scopedModelPolicyDebugSummary = coerceControlText(
    readTurnScopeAttribute("data-turn-control-model-policy-debug-summary", "data-debug-copy-model-policy-debug-summary"),
  ).trim();
  if (
    scopedQuestion ||
    scopedFinalAnswer ||
    scopedActiveTurnId ||
    scopedClientTurnId ||
    scopedModelPolicyDebugSummary
  ) {
    const ancestorScope = extractHelixAskLegacyClickedTurnDebugScopeFromAncestor(sourceElement);
    const ancestorQuestion = normalizedDebugReplyText(ancestorScope?.question);
    const ancestorFinalAnswer = normalizedDebugReplyText(ancestorScope?.finalAnswer);
    const scopedQuestionKey = normalizedDebugReplyText(scopedQuestion);
    const scopedFinalAnswerKey = normalizedDebugReplyText(scopedFinalAnswer);
    const staleAttributeMismatch =
      Boolean(ancestorQuestion && scopedQuestionKey && ancestorQuestion !== scopedQuestionKey) ||
      Boolean(ancestorFinalAnswer && scopedFinalAnswerKey && ancestorFinalAnswer !== scopedFinalAnswerKey);
    if (ancestorScope && staleAttributeMismatch) {
      return {
        ...ancestorScope,
        activeTurnId: null,
        clientTurnId: ancestorScope.clientTurnId ?? null,
      };
    }
    return {
      question: scopedQuestion || null,
      finalAnswer: scopedFinalAnswer || null,
      terminalArtifactKind: scopedTerminalArtifactKind || null,
      modelPolicyDebugSummary: scopedModelPolicyDebugSummary || null,
      activeTurnId: scopedActiveTurnId || null,
      clientTurnId: scopedClientTurnId || null,
    };
  }
  return extractHelixAskLegacyClickedTurnDebugScopeFromAncestor(sourceElement);
}

export function isHelixAskLegacyRenderedButtonBackendTurnScopeTrusted(args: {
  rendered: HelixAskLegacyClickedTurnDebugScope;
  renderedMatchesReply: boolean;
  replyDebugRecord: Record<string, unknown> | null;
}): boolean {
  const renderedActiveTurnId = coerceControlText(args.rendered.activeTurnId).trim();
  if (!renderedActiveTurnId || !isHelixAskLegacyBackendDebugExportEligibleTurnId(renderedActiveTurnId)) return true;
  if (!args.renderedMatchesReply) return false;
  if (!args.replyDebugRecord) return false;
  const expectedQuestion = normalizedDebugReplyText(args.rendered.question);
  const questionCandidates = [
    args.replyDebugRecord?.active_prompt,
    args.replyDebugRecord?.selectedDebugQuestion,
    args.replyDebugRecord?.prompt,
    args.replyDebugRecord?.user_prompt,
    args.replyDebugRecord?.question,
  ]
    .map(normalizedDebugReplyText)
    .filter(Boolean);
  let hasPositiveTurnEvidence = false;
  if (
    expectedQuestion &&
    questionCandidates.length > 0 &&
    !questionCandidates.some((candidate) => candidate === expectedQuestion)
  ) {
    return false;
  }
  if (
    expectedQuestion &&
    questionCandidates.some((candidate) => candidate === expectedQuestion)
  ) {
    hasPositiveTurnEvidence = true;
  }
  const expectedFinalAnswer = normalizedDebugReplyText(args.rendered.finalAnswer);
  const terminalAuthority = readAgentLoopAuditRecord(args.replyDebugRecord?.terminal_answer_authority);
  const terminalResult = readAgentLoopAuditRecord(args.replyDebugRecord?.terminal_result);
  const visibleAnswerState = readAgentLoopAuditRecord(args.replyDebugRecord?.visibleAnswerState);
  const answerCandidates = [
    args.replyDebugRecord?.selected_final_answer,
    args.replyDebugRecord?.selectedDebugFinalAnswer,
    args.replyDebugRecord?.finalAnswer,
    visibleAnswerState?.finalAnswer,
    terminalAuthority?.terminal_text_preview,
    terminalResult?.text,
  ]
    .map(normalizedDebugReplyText)
    .filter(Boolean);
  if (
    expectedFinalAnswer &&
    answerCandidates.length > 0 &&
    !answerCandidates.some((candidate) => candidate === expectedFinalAnswer)
  ) {
    return false;
  }
  if (
    expectedFinalAnswer &&
    answerCandidates.some((candidate) => candidate === expectedFinalAnswer)
  ) {
    hasPositiveTurnEvidence = true;
  }
  return hasPositiveTurnEvidence;
}

export function debugPayloadMatchesHelixAskLegacyRenderedTurnPayload(
  payload: string | null | undefined,
  sourceElement: HTMLElement | null | undefined,
): boolean {
  const rendered = extractHelixAskLegacyClickedTurnDebugScope(sourceElement);
  if (!rendered) return true;
  const trimmed = typeof payload === "string" ? payload.trim() : "";
  if (!trimmed) return false;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const parsedReply = readAgentLoopAuditRecord(parsed.reply);
    const parsedCurrentTurn = readAgentLoopAuditRecord(parsed.currentTurn);
    const visibleAnswerState = readAgentLoopAuditRecord(parsed.visibleAnswerState);
    const renderedActiveTurnId = coerceControlText(rendered.activeTurnId).trim();
    const canonicalRenderedActiveTurnId = normalizeHelixAskLegacyBackendTurnId(renderedActiveTurnId);
    const renderedClientTurnId = coerceControlText(rendered.clientTurnId).trim();
    const turnCandidates = [
      parsed.active_turn_id,
      parsed.backend_turn_id,
      parsed.selectedDebugTurnId,
      parsedCurrentTurn?.turn_id,
      parsedCurrentTurn?.turnId,
    ]
      .map((candidate) => coerceControlText(candidate).trim())
      .filter(Boolean);
    if (
      renderedActiveTurnId &&
      turnCandidates.length > 0 &&
      !turnCandidates.some((candidate) =>
        candidate === renderedActiveTurnId ||
        Boolean(
          canonicalRenderedActiveTurnId &&
          normalizeHelixAskLegacyBackendTurnId(candidate) === canonicalRenderedActiveTurnId
        )
      )
    ) {
      return false;
    }
    const clientTurnCandidates = [
      parsed.client_active_turn_id,
      parsed.ui_client_active_turn_id,
      parsedReply?.client_id,
      parsedReply?.id,
    ]
      .map((candidate) => coerceControlText(candidate).trim())
      .filter(Boolean);
    if (
      renderedClientTurnId &&
      clientTurnCandidates.length > 0 &&
      !clientTurnCandidates.some((candidate) => candidate === renderedClientTurnId)
    ) {
      return false;
    }
    const fetchedBackendPayload =
      coerceControlText(parsed.debug_export_source).trim() === "backend_endpoint" &&
      coerceControlText(parsed.backend_debug_response_status).trim() === "fetched";
    const activeTurnIdentityMatched = Boolean(
      renderedActiveTurnId &&
      turnCandidates.some((candidate) =>
        candidate === renderedActiveTurnId ||
        Boolean(
          canonicalRenderedActiveTurnId &&
          normalizeHelixAskLegacyBackendTurnId(candidate) === canonicalRenderedActiveTurnId
        )
      ),
    );
    const clientTurnIdentityMatched = Boolean(
      renderedClientTurnId && clientTurnCandidates.some((candidate) => candidate === renderedClientTurnId),
    );
    if (fetchedBackendPayload && (activeTurnIdentityMatched || clientTurnIdentityMatched)) {
      return true;
    }
    const answerCandidates = [
      parsed.selected_final_answer,
      parsed.selectedDebugFinalAnswer,
      parsed.finalAnswer,
      visibleAnswerState?.finalAnswer,
    ]
      .map(normalizedDebugReplyText)
      .filter(Boolean);
    if (rendered.finalAnswer && answerCandidates.length > 0) {
      const expectedAnswer = normalizedDebugReplyText(rendered.finalAnswer);
      if (!answerCandidates.some((candidate) => candidate === expectedAnswer)) return false;
    }
    const questionCandidates = [
      parsed.selectedDebugQuestion,
      parsed.active_prompt,
      parsed.prompt,
      parsed.user_prompt,
      parsedReply?.question,
      parsedCurrentTurn?.question,
    ]
      .map(normalizedDebugReplyText)
      .filter(Boolean);
    if (rendered.question && questionCandidates.length > 0) {
      const expectedQuestion = normalizedDebugReplyText(rendered.question);
      if (!questionCandidates.some((candidate) => candidate === expectedQuestion)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function enforceHelixAskLegacyDebugExportMatchesClickedButton(args: {
  exportPayload: string;
  clickedButtonScopedPayload: string | null | undefined;
  sourceElement: HTMLElement | null | undefined;
}): string {
  const rendered = extractHelixAskLegacyClickedTurnDebugScope(args.sourceElement);
  return selectHelixAskLegacyGuardedDebugExportPayload({
    exportPayload: args.exportPayload,
    clickedButtonScopedPayload: args.clickedButtonScopedPayload,
    clickedTurnScope: rendered,
    payloadMatchesClickedTurn: (payload) =>
      debugPayloadMatchesHelixAskLegacyRenderedTurnPayload(payload, args.sourceElement),
  });
}

export function resolveHelixAskLegacyReplyDebugTurnId(
  reply: HelixAskLegacyReplyForControls | null | undefined,
): string {
  if (!reply) return "";
  const replyRecord = reply as Record<string, unknown>;
  const replyDebugRecord = readControlRecord(reply.debug);
  const resolvedTurnSummary = readControlRecord(
    replyRecord.resolved_turn_summary ?? replyDebugRecord?.resolved_turn_summary,
  );
  const terminalAuthority = readControlRecord(
    replyRecord.terminal_answer_authority ?? replyDebugRecord?.terminal_answer_authority,
  );
  const candidates = [
    replyRecord.turn_id,
    replyRecord.turnId,
    replyDebugRecord?.turn_id,
    replyDebugRecord?.turnId,
    resolvedTurnSummary?.turn_id,
    terminalAuthority?.turn_id,
    reply.id,
  ];
  for (const candidate of candidates) {
    const turnId = coerceControlText(candidate).trim();
    if (turnId) return turnId;
  }
  return reply.id ?? "";
}

export function debugPayloadMatchesHelixAskLegacyRenderedReply(
  reply: HelixAskLegacyReplyForControls,
  parsed: Record<string, unknown>,
): boolean {
  const expectedTurnId = resolveHelixAskLegacyReplyDebugTurnId(reply);
  const canonicalExpectedTurnId = normalizeHelixAskLegacyBackendTurnId(expectedTurnId);
  const parsedDebug = readAgentLoopAuditRecord(parsed.debug);
  const parsedReply = readAgentLoopAuditRecord(parsed.reply);
  const parsedCurrentTurn = readAgentLoopAuditRecord(parsed.currentTurn);
  const turnCandidates = [
    parsed.active_turn_id,
    parsed.backend_turn_id,
    parsed.selectedDebugTurnId,
    parsedReply?.id,
    parsedCurrentTurn?.turn_id,
    parsedCurrentTurn?.turnId,
    parsedDebug?.turn_id,
    parsedDebug?.turnId,
  ]
    .map((candidate) => coerceControlText(candidate).trim())
    .filter(Boolean);
  const expectedTurnMatched = Boolean(
    expectedTurnId &&
    turnCandidates.length > 0 &&
    turnCandidates.some((candidate) =>
      candidate === expectedTurnId ||
      Boolean(
        canonicalExpectedTurnId &&
        normalizeHelixAskLegacyBackendTurnId(candidate) === canonicalExpectedTurnId
      )
    ),
  );
  if (
    expectedTurnId &&
    turnCandidates.length > 0 &&
    !expectedTurnMatched
  ) {
    return false;
  }
  if (
    expectedTurnMatched &&
    coerceControlText(parsed.debug_export_source).trim() === "backend_endpoint" &&
    coerceControlText(parsed.backend_debug_response_status).trim() === "fetched"
  ) {
    return true;
  }
  const expectedQuestion = normalizedDebugReplyText(reply.question);
  if (!expectedQuestion) return true;
  const candidates = [
    parsed.selectedDebugQuestion,
    parsed.active_prompt,
    parsed.prompt,
    parsed.user_prompt,
    parsedReply?.question,
    parsedCurrentTurn?.question,
    parsedDebug?.active_prompt,
  ]
    .map(normalizedDebugReplyText)
    .filter(Boolean);
  if (candidates.length === 0) return true;
  return candidates.some((candidate) => candidate === expectedQuestion);
}

export function isHelixAskLegacyBackendDebugExportEligibleTurnId(turnId: string): boolean {
  const trimmed = turnId.trim();
  return Boolean(trimmed && (trimmed.startsWith("ask:") || /(?:^|:)ask:[^:]+/i.test(trimmed)));
}

export function resolveHelixAskLegacyDebugExportBackendTarget(
  parsedPayload: Record<string, unknown>,
): HelixAskLegacyDebugExportBackendTarget {
  const rawActiveTurnId = coerceControlText(parsedPayload.active_turn_id).trim();
  const activeTurnId = normalizeHelixAskLegacyBackendTurnId(rawActiveTurnId) ?? rawActiveTurnId;
  const rebuildReason = coerceControlText(parsedPayload.debug_export_rebuild_reason).trim();
  const isReplyScopedRebuild =
    rebuildReason === "empty_payload" ||
    rebuildReason === "payload_reply_mismatch" ||
    rebuildReason === "invalid_json_payload" ||
    rebuildReason === "rendered_reply" ||
    rebuildReason === "rendered_button_scope";
  const renderedTurnScopeRebuild =
    rebuildReason === "rendered_reply" ||
    rebuildReason === "rendered_button_scope";
  const parsedDebug = readControlRecord(parsedPayload.debug);
  const refCandidates = [
    readBackendDebugRef(parsedPayload.backend_debug_response_ref),
    readBackendDebugRef(parsedPayload.debug_export_ref),
    readBackendDebugRef(parsedDebug?.backend_debug_response_ref),
    readBackendDebugRef(parsedDebug?.debug_export_ref),
  ].filter((entry): entry is HelixAskLegacyDebugExportBackendRef => Boolean(entry));
  const activeTurnFallbackRef =
    (!isReplyScopedRebuild || renderedTurnScopeRebuild) &&
    refCandidates.length === 0 &&
    isHelixAskLegacyBackendDebugExportEligibleTurnId(activeTurnId)
    ? {
        endpoint: `/api/agi/ask/turn/${encodeURIComponent(activeTurnId)}/debug-export`,
        turn_id: activeTurnId,
      }
    : null;
  const matchingBackendRef = refCandidates.find((entry) => {
    const candidateTurnId = coerceControlText(entry.turn_id).trim();
    const canonicalCandidateTurnId = normalizeHelixAskLegacyBackendTurnId(candidateTurnId) ?? candidateTurnId;
    return Boolean(activeTurnId && canonicalCandidateTurnId === activeTurnId);
  });
  if (isReplyScopedRebuild && !matchingBackendRef && !activeTurnFallbackRef) {
    return {
      activeTurnId,
      backendRef: null,
      endpoint: null,
      status: "not_advertised",
    };
  }
  const backendRef =
    matchingBackendRef ??
    (isReplyScopedRebuild ? null : refCandidates[0]) ??
    activeTurnFallbackRef;
  const endpoint = coerceControlText(backendRef?.endpoint).trim();
  if (!endpoint || !endpoint.startsWith("/api/agi/ask/turn/")) {
    return {
      activeTurnId,
      backendRef: null,
      endpoint: null,
      status: "not_advertised",
    };
  }
  const backendTurnId = coerceControlText(backendRef?.turn_id).trim();
  const canonicalBackendTurnId = normalizeHelixAskLegacyBackendTurnId(backendTurnId) ?? backendTurnId;
  if (canonicalBackendTurnId && activeTurnId && canonicalBackendTurnId !== activeTurnId) {
    return {
      activeTurnId,
      backendRef,
      endpoint,
      status: "turn_mismatch",
    };
  }
  return {
    activeTurnId,
    backendRef,
    endpoint,
    status: "ready",
  };
}
