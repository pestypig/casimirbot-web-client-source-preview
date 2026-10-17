import type { AskLiveEventEntry } from "@/lib/helix/ask-debug-event-display";

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readProceduralActionLabel(value: unknown): string {
  const action = readRecord(value);
  if (!action) return "model step";
  const panelId = typeof action.panel_id === "string" && action.panel_id.trim() ? action.panel_id.trim() : "";
  const actionId = typeof action.action_id === "string" && action.action_id.trim() ? action.action_id.trim() : "";
  if (panelId && actionId) return `${panelId}.${actionId}`;
  if (actionId) return actionId;
  return "model step";
}

export type WorkstationIntentStageOutcome =
  | "command_parse"
  | "classifier_match"
  | "deterministic_match"
  | "fallback_timeout_match"
  | "fallback_classifier_error_match"
  | "fallback_low_confidence_match"
  | "no_match_timeout"
  | "no_match_classifier_error"
  | "no_match_low_confidence"
  | "no_match_not_probed";

export function formatWorkstationIntentStageDetail(result: {
  action?: unknown;
  outcome: WorkstationIntentStageOutcome;
}): string {
  const prefix = result.action
    ? "workstation_intent_stage | action_resolved"
    : "workstation_intent_stage | no_action_match";
  const outcomeLabelMap: Record<WorkstationIntentStageOutcome, string> = {
    command_parse: "command_parse",
    classifier_match: "classifier_match",
    deterministic_match: "deterministic_match",
    fallback_timeout_match: "timeout_fallback",
    fallback_classifier_error_match: "classifier_error_fallback",
    fallback_low_confidence_match: "low_confidence_fallback",
    no_match_timeout: "timeout_fallback",
    no_match_classifier_error: "classifier_error",
    no_match_low_confidence: "low_confidence",
    no_match_not_probed: "not_probed",
  };
  return `${prefix} | ${outcomeLabelMap[result.outcome]}`;
}

const UNKNOWN_WORKSTATION_RECEIPT_LANGUAGE_TAGS = new Set(["unknown", "auto", "und", "none", "null"]);

function normalizeWorkstationReceiptLanguageTag(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (!trimmed || UNKNOWN_WORKSTATION_RECEIPT_LANGUAGE_TAGS.has(trimmed)) return null;
  return trimmed;
}

export function getWorkstationInterpretingStatusText(languageTag: string | null | undefined): string {
  const normalized = normalizeWorkstationReceiptLanguageTag(languageTag);
  if (!normalized) return "Interpreting workstation request...";
  if (normalized.startsWith("zh")) return "æ­£åœ¨è§£æžå·¥ä½œåŒºè¯·æ±‚...";
  if (normalized.startsWith("ja")) return "ãƒ¯ãƒ¼ã‚¯ã‚¹ãƒšãƒ¼ã‚¹ã®ä¾é ¼ã‚’è§£æžä¸­ã§ã™...";
  if (normalized.startsWith("ko")) return "ì›Œí¬ìŠ¤íŽ˜ì´ìŠ¤ ìš”ì²­ì„ í•´ì„ ì¤‘ìž…ë‹ˆë‹¤...";
  if (normalized.startsWith("ar")) return "Ø¬Ø§Ø±ÙŠ ØªÙØ³ÙŠØ± Ø·Ù„Ø¨ Ù…Ø³Ø§Ø­Ø© Ø§Ù„Ø¹Ù…Ù„...";
  if (normalized.startsWith("ru")) return "Ð Ð°Ð·Ð±Ð¸Ñ€Ð°ÑŽ Ð·Ð°Ð¿Ñ€Ð¾Ñ Ðº Ñ€Ð°Ð±Ð¾Ñ‡ÐµÐ¼Ñƒ Ð¿Ñ€Ð¾ÑÑ‚Ñ€Ð°Ð½ÑÑ‚Ð²Ñƒ...";
  if (normalized.startsWith("es")) return "Interpretando solicitud del espacio de trabajo...";
  if (normalized.startsWith("fr")) return "InterprÃ©tation de la demande de lâ€™espace de travail...";
  if (normalized.startsWith("de")) return "Arbeitsbereich-Anfrage wird interpretiert...";
  if (normalized.startsWith("pt")) return "Interpretando solicitaÃ§Ã£o do espaÃ§o de trabalho...";
  if (normalized.startsWith("it")) return "Interpretazione della richiesta dell'area di lavoro...";
  return "Interpreting workstation request...";
}

export function getWorkstationExecutingStatusText(languageTag: string | null | undefined): string {
  const normalized = normalizeWorkstationReceiptLanguageTag(languageTag);
  if (!normalized) return "Executing workstation action...";
  if (normalized.startsWith("zh")) return "æ­£åœ¨æ‰§è¡Œå·¥ä½œåŒºæ“ä½œ...";
  if (normalized.startsWith("ja")) return "ãƒ¯ãƒ¼ã‚¯ã‚¹ãƒšãƒ¼ã‚¹æ“ä½œã‚’å®Ÿè¡Œä¸­ã§ã™...";
  if (normalized.startsWith("ko")) return "ì›Œí¬ìŠ¤íŽ˜ì´ìŠ¤ ìž‘ì—…ì„ ì‹¤í–‰ ì¤‘ìž…ë‹ˆë‹¤...";
  if (normalized.startsWith("ar")) return "Ø¬Ø§Ø±ÙŠ ØªÙ†ÙÙŠØ° Ø¥Ø¬Ø±Ø§Ø¡ Ù…Ø³Ø§Ø­Ø© Ø§Ù„Ø¹Ù…Ù„...";
  if (normalized.startsWith("ru")) return "Ð’Ñ‹Ð¿Ð¾Ð»Ð½ÑÑŽ Ð´ÐµÐ¹ÑÑ‚Ð²Ð¸Ðµ Ñ€Ð°Ð±Ð¾Ñ‡ÐµÐ³Ð¾ Ð¿Ñ€Ð¾ÑÑ‚Ñ€Ð°Ð½ÑÑ‚Ð²Ð°...";
  if (normalized.startsWith("es")) return "Ejecutando acciÃ³n del espacio de trabajo...";
  if (normalized.startsWith("fr")) return "ExÃ©cution de lâ€™action de lâ€™espace de travail...";
  if (normalized.startsWith("de")) return "Arbeitsbereichsaktion wird ausgefÃ¼hrt...";
  if (normalized.startsWith("pt")) return "Executando aÃ§Ã£o do espaÃ§o de trabalho...";
  if (normalized.startsWith("it")) return "Esecuzione dell'azione dell'area di lavoro...";
  return "Executing workstation action...";
}

export function getWorkstationExecutedReplyText(languageTag: string | null | undefined): string {
  const normalized = normalizeWorkstationReceiptLanguageTag(languageTag);
  if (!normalized) return "Executed workstation action.";
  if (normalized.startsWith("zh")) return "å·²æ‰§è¡Œå·¥ä½œåŒºæ“ä½œã€‚";
  if (normalized.startsWith("ja")) return "ãƒ¯ãƒ¼ã‚¯ã‚¹ãƒšãƒ¼ã‚¹æ“ä½œã‚’å®Ÿè¡Œã—ã¾ã—ãŸã€‚";
  if (normalized.startsWith("ko")) return "ì›Œí¬ìŠ¤íŽ˜ì´ìŠ¤ ìž‘ì—…ì„ ì‹¤í–‰í–ˆìŠµë‹ˆë‹¤.";
  if (normalized.startsWith("ar")) return "ØªÙ… ØªÙ†ÙÙŠØ° Ø¥Ø¬Ø±Ø§Ø¡ Ù…Ø³Ø§Ø­Ø© Ø§Ù„Ø¹Ù…Ù„.";
  if (normalized.startsWith("ru")) return "Ð”ÐµÐ¹ÑÑ‚Ð²Ð¸Ðµ Ñ€Ð°Ð±Ð¾Ñ‡ÐµÐ³Ð¾ Ð¿Ñ€Ð¾ÑÑ‚Ñ€Ð°Ð½ÑÑ‚Ð²Ð° Ð²Ñ‹Ð¿Ð¾Ð»Ð½ÐµÐ½Ð¾.";
  if (normalized.startsWith("es")) return "AcciÃ³n del espacio de trabajo ejecutada.";
  if (normalized.startsWith("fr")) return "Action de lâ€™espace de travail exÃ©cutÃ©e.";
  if (normalized.startsWith("de")) return "Arbeitsbereichsaktion ausgefÃ¼hrt.";
  if (normalized.startsWith("pt")) return "AÃ§Ã£o do espaÃ§o de trabalho executada.";
  if (normalized.startsWith("it")) return "Azione dell'area di lavoro eseguita.";
  return "Executed workstation action.";
}

export function buildWorkstationInterpretingReceiptText(requestText: string, languageTag: string | null | undefined): string {
  const normalized = normalizeWorkstationReceiptLanguageTag(languageTag);
  if (!normalized) return `Interpreting workstation request: ${requestText}`;
  if (normalized.startsWith("zh")) return `æ­£åœ¨è§£æžå·¥ä½œåŒºè¯·æ±‚ï¼š${requestText}`;
  if (normalized.startsWith("ja")) return `ãƒ¯ãƒ¼ã‚¯ã‚¹ãƒšãƒ¼ã‚¹ã®ä¾é ¼ã‚’è§£æžä¸­: ${requestText}`;
  if (normalized.startsWith("ko")) return `ì›Œí¬ìŠ¤íŽ˜ì´ìŠ¤ ìš”ì²­ í•´ì„ ì¤‘: ${requestText}`;
  if (normalized.startsWith("ar")) return `Ø¬Ø§Ø±ÙŠ ØªÙØ³ÙŠØ± Ø·Ù„Ø¨ Ù…Ø³Ø§Ø­Ø© Ø§Ù„Ø¹Ù…Ù„: ${requestText}`;
  if (normalized.startsWith("ru")) return `Ð Ð°Ð·Ð±Ð¸Ñ€Ð°ÑŽ Ð·Ð°Ð¿Ñ€Ð¾Ñ Ðº Ñ€Ð°Ð±Ð¾Ñ‡ÐµÐ¼Ñƒ Ð¿Ñ€Ð¾ÑÑ‚Ñ€Ð°Ð½ÑÑ‚Ð²Ñƒ: ${requestText}`;
  if (normalized.startsWith("es")) return `Interpretando solicitud del espacio de trabajo: ${requestText}`;
  if (normalized.startsWith("fr")) return `InterprÃ©tation de la demande de lâ€™espace de travailÂ : ${requestText}`;
  if (normalized.startsWith("de")) return `Arbeitsbereich-Anfrage wird interpretiert: ${requestText}`;
  if (normalized.startsWith("pt")) return `Interpretando solicitaÃ§Ã£o do espaÃ§o de trabalho: ${requestText}`;
  if (normalized.startsWith("it")) return `Interpretazione della richiesta dell'area di lavoro: ${requestText}`;
  return `Interpreting workstation request: ${requestText}`;
}

export function isWorkstationLifecycleEvent(entry: AskLiveEventEntry): boolean {
  const tool = (entry.tool ?? "").trim().toLowerCase();
  if (!tool) return false;
  if (tool === "helix.ask.fast_path") return true;
  if (tool === "helix.observer.plan") return true;
  if (tool.startsWith("workstation.")) return true;
  const meta = readRecord(entry.meta ?? null);
  const kind = typeof meta?.kind === "string" ? meta.kind.trim().toLowerCase() : "";
  if (!kind) return false;
  return kind.startsWith("workstation_") || kind.startsWith("job_") || kind.startsWith("observer_plan_");
}

export function buildObservationGroundedReplyText(entry: AskLiveEventEntry): { text: string; ok: boolean } | null {
  const raw = String(entry.text ?? "").trim();
  if (!raw) return null;
  const failureMatch = raw.match(/^fail:\s*run panel action\s+[\w.-]+(?:\s*-\s*(.+))?$/i);
  if (failureMatch) {
    const message = failureMatch[1]?.trim() || "The workspace action failed.";
    return { text: `Could not complete that workspace action: ${message}`, ok: false };
  }
  const successMatch = raw.match(/^ok:\s*run panel action\s+[\w.-]+(?:\s*-\s*(.+))?$/i);
  if (successMatch) {
    const message = successMatch[1]?.trim();
    if (message) return { text: message, ok: true };
  }
  return null;
}
