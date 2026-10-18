import { findRandomPaperForTopic } from "@/lib/docs/paperReadCommand";
import type { HelixWorkstationAction } from "@/lib/workstation/workstationActionContract";

export type WorkstationIntentDecision = {
  intent:
    | "docs_read_paper"
    | "docs_summarize_doc"
    | "docs_summarize_section"
    | "docs_explain_paper"
    | "calculator_open"
    | "calculator_solve"
    | "calculator_solve_steps"
    | "calculator_ingest_clipboard"
    | "calculator_copy_result"
    | "calculator_copy_debug_log"
    | "open_panel"
    | "run_panel_action"
    | "close_active_panel"
    | "focus_next_panel"
    | "focus_previous_panel"
    | "reopen_last_closed_panel"
    | "none";
  confidence: number;
  subgoal: string;
  args?: Record<string, unknown>;
  reason?: string;
};

const DOCS_READ_FALLBACK_PATH = "/docs/papers.md";
const SUMMARY_WORDS = /\b(?:summari[sz]e|summary|tldr|tl;dr)\b/i;
const SUMMARY_SECTION_WORDS = /\b(?:section|this\s+section|current\s+section|part)\b/i;
const EXPLAIN_WORDS = /\b(?:explain|break\s+down|walk\s+me\s+through|what\s+does)\b/i;
const DOC_WORDS = /\b(?:doc|document|paper|this\s+doc|this\s+document|this\s+paper)\b/i;
const READ_ALOUD_WORDS =
  /\b(?:read(?:\s+it)?(?:\s+out\s+loud|\s+aloud)?|out\s+loud|aloud|narrate|voice)\b/i;
const CALCULATOR_WORDS = /\b(?:calculator|equation|latex|formula|solve|evaluate|compute|convert|conversion)\b|(?:\b(?:inches?|in\.?|feet|ft\.?|cm|centimeters?|centimetres?)\b[\s\S]{0,40}\b(?:to|in|as)\s+(?:meters?|metres?|m|cm|centimeters?|centimetres?|inches?|in\.?|feet|ft\.?)\b)/i;
const CALCULATOR_OPEN_WORDS = /\b(?:open|show|launch)\b[\s\S]*\b(?:calculator)\b/i;
const CALCULATOR_STEP_WORDS = /\b(?:step|steps|step-by-step|work)\b/i;
const CLIPBOARD_WORDS = /\b(?:clipboard|paste)\b/i;
const COPY_WORDS = /\b(?:copy|clipboard)\b/i;
const RESULT_WORDS = /\b(?:result|answer|output)\b/i;
const DEBUG_LOG_WORDS = /\b(?:debug|event\s+log|logs?|trace)\b/i;
const CALCULATOR_ACTION_WORDS =
  /\b(?:open|opened|show|shown|launch|launched|call|called|run|ran|use|used|solve|solved|evaluate|evaluated|compute|computed|calculate|calculated|convert|converted|paste|pasted|copy|copied)\b/i;

const WORKSTATION_INTENT_WORDS =
  /\b(open|show|launch|read|paper|doc|docs|documentation|panel|tab|job|run|execute|settings|workspace|workstation|close|shut|dismiss|remove|rid|next|previous|prev|reopen|summarize|summary|tldr|tl;dr|explain|section|calculator|equation|latex|solve|evaluate|compute|convert|conversion|clipboard|paste|copy|result|answer|output|debug|log|trace)\b/i;
const CLOSE_VERB_WORDS = /\b(?:close|shut|dismiss|remove|x\s*out|get\s+rid\s+of)\b/i;
const PANEL_TARGET_WORDS =
  /\b(?:tab|tabs|panel|panels|doc|docs|document|documents|paper|papers|window|windows)\b/i;
const NEXT_PANEL_WORDS =
  /\b(?:next\s+(?:tab|panel)|(?:go|switch|move|focus)\s+(?:to\s+)?next|tab\s+to\s+the\s+right|panel\s+to\s+the\s+right|cycle\s+forward)\b/i;
const PREVIOUS_PANEL_WORDS =
  /\b(?:(?:prev(?:ious)?\s+(?:tab|panel))|(?:go|switch|move|focus)\s+(?:to\s+)?(?:prev(?:ious)?|back)|tab\s+to\s+the\s+left|panel\s+to\s+the\s+left|cycle\s+back)\b/i;
const REOPEN_PANEL_WORDS =
  /\b(?:reopen|restore|undo\s+close|bring\s+back)\b[\s\S]*\b(?:tab|panel)\b/i;

function extractCalculatorExpressionArg(value: string): string | null {
  const match = value.match(/\b(?:solve|evaluate|compute|calculate)\s+(.+?)(?:\s+(?:with\s+)?(?:step|steps|step-by-step|work)\b|$)/i);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/^(?:the\s+)?(?:equation|expression|latex|formula)\s+/i, "")
    .replace(/[.?!,;:]+$/g, "")
    .trim();
  if (!cleaned) return null;
  return /[=^*/+\-()_\\]|\d/.test(cleaned) ? cleaned : null;
}

function isCalculatorExecutableIntent(intent: WorkstationIntentDecision["intent"]): boolean {
  return (
    intent === "calculator_open" ||
    intent === "calculator_solve" ||
    intent === "calculator_solve_steps" ||
    intent === "calculator_ingest_clipboard" ||
    intent === "calculator_copy_result" ||
    intent === "calculator_copy_debug_log"
  );
}

function decisionTargetsCalculatorAction(decision: WorkstationIntentDecision): boolean {
  if (isCalculatorExecutableIntent(decision.intent)) return true;
  if (decision.intent === "open_panel") {
    return typeof decision.args?.panel_id === "string" && decision.args.panel_id.trim() === "scientific-calculator";
  }
  if (decision.intent === "run_panel_action") {
    return typeof decision.args?.panel_id === "string" && decision.args.panel_id.trim() === "scientific-calculator";
  }
  return false;
}

function hasNonExecutableCalculatorMention(prompt: string): boolean {
  const normalized = prompt.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized || !CALCULATOR_WORDS.test(normalized)) return false;
  const calculatorActionNearCue =
    CALCULATOR_OPEN_WORDS.test(normalized) ||
    /\bscientific-calculator\./i.test(normalized) ||
    (CALCULATOR_ACTION_WORDS.test(normalized) && CALCULATOR_WORDS.test(normalized));
  if (!calculatorActionNearCue) return false;
  const quotedToolText =
    /["'`][^"'`]*(?:scientific-calculator|calculator|solve_expression|prefill_expression|open calculator|solve)[^"'`]*["'`]/i
      .test(prompt);
  const negatedCommand =
    /\b(?:do\s+not|don't|dont|never|no\s+need\s+to|without|not\s+now|please\s+don't)\b[\s\S]{0,120}\b(?:open|show|launch|solve|evaluate|compute|calculate|paste|copy|calculator)\b/i
      .test(normalized) ||
    /\b(?:open|show|launch|solve|evaluate|compute|calculate|paste|copy)\b[\s\S]{0,80}\b(?:is\s+not|was\s+not|should\s+not|must\s+not)\b/i
      .test(normalized);
  const futureOrConditional =
    /\b(?:before|after|when|if|unless|later|eventually|next\s+time|tomorrow|in\s+a\s+future\s+turn|will|going\s+to)\b[\s\S]{0,120}\b(?:open|show|launch|solve|evaluate|compute|calculate|paste|copy|calculator)\b/i
      .test(normalized);
  const historicalMention =
    /\b(?:last|previous|earlier|already|did|was|were|why\s+did|why\s+was)\b[\s\S]{0,140}\b(?:scientific-calculator|calculator|solve_expression|prefill_expression|open|opened|call|called|run|ran|use|used|solve|solved|evaluate|evaluated|compute|computed|calculate|calculated|paste|pasted|copy|copied)\b/i
      .test(normalized);
  const screenOrQuotedMention =
    quotedToolText &&
    /\b(?:quote|quoted|says|said|text|label|button|screen|visible|shows|reads|mentions|phrase)\b/i.test(normalized);
  return negatedCommand || futureOrConditional || historicalMention || screenOrQuotedMention;
}

export function shouldProbeWorkstationIntentClassifier(prompt: string): boolean {
  return WORKSTATION_INTENT_WORDS.test(prompt.trim());
}

export function inferDeterministicWorkstationIntentDecision(prompt: string): WorkstationIntentDecision | null {
  const trimmed = prompt.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .toLowerCase()
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .replace(/[?.!,;:]+$/g, "")
    .trim();
  if (!normalized) return null;
  if (hasNonExecutableCalculatorMention(trimmed)) return null;

  if (CALCULATOR_OPEN_WORDS.test(normalized)) {
    return {
      intent: "calculator_open",
      confidence: 0.9,
      subgoal: "Open the scientific calculator panel.",
      reason: "deterministic_intent_frame:calculator_open",
    };
  }
  if (CLIPBOARD_WORDS.test(normalized) && CALCULATOR_WORDS.test(normalized)) {
    return {
      intent: "calculator_ingest_clipboard",
      confidence: 0.84,
      subgoal: "Ingest clipboard equation text into the scientific calculator.",
      reason: "deterministic_intent_frame:calculator_ingest_clipboard",
    };
  }
  if (CALCULATOR_WORDS.test(normalized) && COPY_WORDS.test(normalized) && DEBUG_LOG_WORDS.test(normalized)) {
    return {
      intent: "calculator_copy_debug_log",
      confidence: 0.88,
      subgoal: "Copy the scientific calculator debug event log.",
      reason: "deterministic_intent_frame:calculator_copy_debug_log",
    };
  }
  if (CALCULATOR_WORDS.test(normalized) && COPY_WORDS.test(normalized) && RESULT_WORDS.test(normalized)) {
    return {
      intent: "calculator_copy_result",
      confidence: 0.86,
      subgoal: "Copy the latest scientific calculator result.",
      reason: "deterministic_intent_frame:calculator_copy_result",
    };
  }
  if (CALCULATOR_WORDS.test(normalized) && /\b(?:solve|evaluate|compute|calculate|convert|conversion)\b/.test(normalized)) {
    const latex = extractCalculatorExpressionArg(trimmed) ?? extractCalculatorExpressionArg(normalized);
    return {
      intent: CALCULATOR_STEP_WORDS.test(normalized) ? "calculator_solve_steps" : "calculator_solve",
      confidence: 0.82,
      subgoal: CALCULATOR_STEP_WORDS.test(normalized)
        ? "Solve the calculator equation and return step trace."
        : "Solve the calculator equation.",
      args: latex ? { latex } : undefined,
      reason: CALCULATOR_STEP_WORDS.test(normalized)
        ? "deterministic_intent_frame:calculator_solve_steps"
        : "deterministic_intent_frame:calculator_solve",
    };
  }

  if (NEXT_PANEL_WORDS.test(normalized)) {
    return {
      intent: "focus_next_panel",
      confidence: 0.9,
      subgoal: "Focus the next panel in the active workspace group.",
      reason: "deterministic_intent_frame:focus_next_panel",
    };
  }
  if (PREVIOUS_PANEL_WORDS.test(normalized)) {
    return {
      intent: "focus_previous_panel",
      confidence: 0.9,
      subgoal: "Focus the previous panel in the active workspace group.",
      reason: "deterministic_intent_frame:focus_previous_panel",
    };
  }
  if (REOPEN_PANEL_WORDS.test(normalized)) {
    return {
      intent: "reopen_last_closed_panel",
      confidence: 0.88,
      subgoal: "Reopen the last closed panel in the workspace.",
      reason: "deterministic_intent_frame:reopen_last_closed_panel",
    };
  }

  const closeRequested = CLOSE_VERB_WORDS.test(normalized);
  const panelTargeted = PANEL_TARGET_WORDS.test(normalized);
  if (!closeRequested || !panelTargeted) return null;
  const broadScopeRequested =
    /\b(?:all|every|my|open)\b/.test(normalized) && /\b(?:tabs|panels|documents|docs|papers|windows)\b/.test(normalized);
  return {
    intent: "close_active_panel",
    confidence: broadScopeRequested ? 0.78 : 0.9,
    subgoal: "Close the currently active panel in the workspace.",
    reason: broadScopeRequested
      ? "deterministic_intent_frame:close_active_panel(scope_degraded_to_active)"
      : "deterministic_intent_frame:close_active_panel",
  };
}

export function buildWorkstationIntentClassifierPrompt(prompt: string): string {
  return [
    "You are a strict intent-to-job classifier for Helix Workstation.",
    "Codex-clone alignment rule: restate the user request into a concise machine subgoal before action selection.",
    "Subgoal quality rule: phrase the subgoal from user-visible outcome first, then the workspace action to achieve it.",
    "If the prompt includes an explicit path or equation reference, keep that anchor in subgoal text.",
    "The user prompt may be non-English. Translate internally to English for intent selection.",
    'The "subgoal" field MUST be English machine language, even when the input is in another language.',
    "Return ONLY JSON with schema:",
    `{"intent":"docs_read_paper|docs_summarize_doc|docs_summarize_section|docs_explain_paper|calculator_open|calculator_solve|calculator_solve_steps|calculator_ingest_clipboard|calculator_copy_result|calculator_copy_debug_log|open_panel|run_panel_action|close_active_panel|focus_next_panel|focus_previous_panel|reopen_last_closed_panel|none","confidence":0..1,"subgoal":"...","args":{...},"reason":"..."}`,
    'Use intent="docs_read_paper" when the request asks to find/open/read a paper/document on a topic.',
    'Also use intent="docs_read_paper" for phrasing like "open a panel about the sun and read it".',
    'Read-aloud rule: "read this/current doc aloud/out loud/to me" is a workspace docs-viewer action, not a model-only answer.',
    'For read-aloud on an active/current document, select docs_read_paper and preserve any args.path when known so the existing open_doc_and_read loop can run.',
    'Priority rule: when summarize/explain wording is present, prefer docs_summarize_doc/docs_summarize_section/docs_explain_paper over docs_read_paper.',
    'Do NOT map "summarize ... to me" to docs_read_paper unless explicit read-aloud wording is also present.',
    'For docs_read_paper, set args.topic as a short noun phrase like "NHM2".',
    'Use intent="docs_summarize_doc" for prompts like "summarize this doc/paper".',
    'Use intent="docs_summarize_section" for prompts like "summarize this section".',
    'Use intent="docs_explain_paper" for prompts like "explain this paper".',
    "For docs_summarize_doc/docs_summarize_section/docs_explain_paper, include optional args.path or args.anchor when the user specifies a document or section.",
    'Use intent="calculator_open" for prompts asking to open/show calculator.',
    'Use intent="calculator_solve" to solve/evaluate an equation without requiring a step trace.',
    'Use intent="calculator_solve_steps" when user asks for solved steps/work shown.',
    'Use intent="calculator_ingest_clipboard" to paste clipboard text into calculator.',
    'Use intent="calculator_copy_result" to copy the latest calculator result.',
    'Use intent="calculator_copy_debug_log" to copy calculator debug/event logs.',
    "For calculator_solve/calculator_solve_steps, include args.latex when equation text is present.",
    "Calculator control words are executable only when the user gives an affirmative current-turn command.",
    "For negated, contextual, historical, future/conditional, quoted, or screen-visible calculator words, use intent=\"none\" unless there is a separate affirmative current-turn command.",
    'Use close_active_panel, focus_next_panel, focus_previous_panel, or reopen_last_closed_panel for generic tab/panel navigation requests.',
    'Examples for close_active_panel: "get rid of the current tab", "can you shut this panel for me", "close whatever tab I am on".',
    'Use intent="none" when uncertain. Never invent unsupported panel actions.',
    "",
    `User prompt: ${prompt.trim()}`,
  ].join("\n");
}

export function parseWorkstationIntentDecision(raw: string): WorkstationIntentDecision | null {
  if (!raw) return null;
  const jsonText = extractFirstJsonObject(raw);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const intentRaw = typeof parsed.intent === "string" ? parsed.intent.trim().toLowerCase() : "";
    const intent =
      intentRaw === "docs_read_paper" ||
      intentRaw === "docs_summarize_doc" ||
      intentRaw === "docs_summarize_section" ||
      intentRaw === "docs_explain_paper" ||
      intentRaw === "calculator_open" ||
      intentRaw === "calculator_solve" ||
      intentRaw === "calculator_solve_steps" ||
      intentRaw === "calculator_ingest_clipboard" ||
      intentRaw === "calculator_copy_result" ||
      intentRaw === "calculator_copy_debug_log" ||
      intentRaw === "open_panel" ||
      intentRaw === "run_panel_action" ||
      intentRaw === "close_active_panel" ||
      intentRaw === "focus_next_panel" ||
      intentRaw === "focus_previous_panel" ||
      intentRaw === "reopen_last_closed_panel" ||
      intentRaw === "none"
        ? intentRaw
        : null;
    if (!intent) return null;
    const confidenceRaw = typeof parsed.confidence === "number" ? parsed.confidence : Number(parsed.confidence);
    const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
    const subgoal = typeof parsed.subgoal === "string" ? parsed.subgoal.trim() : "";
    if (!subgoal) return null;
    const args =
      parsed.args && typeof parsed.args === "object" && !Array.isArray(parsed.args)
        ? (parsed.args as Record<string, unknown>)
        : undefined;
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : undefined;
    return {
      intent,
      confidence,
      subgoal,
      args,
      reason,
    };
  } catch {
    return null;
  }
}

export function coerceWorkstationActionFromIntentDecision(
  decision: WorkstationIntentDecision,
): HelixWorkstationAction | null {
  if (decision.intent === "none") return null;
  if (decision.intent === "docs_read_paper") {
    const topic = typeof decision.args?.topic === "string" ? decision.args.topic.trim() : "";
    if (!topic) return null;
    const match = findRandomPaperForTopic(topic);
    return {
      action: "run_panel_action",
      panel_id: "docs-viewer",
      action_id: "open_doc_and_read",
      args: { path: match?.route ?? DOCS_READ_FALLBACK_PATH, topic },
    };
  }
  if (
    decision.intent === "docs_summarize_doc" ||
    decision.intent === "docs_summarize_section" ||
    decision.intent === "docs_explain_paper"
  ) {
    const path = typeof decision.args?.path === "string" ? decision.args.path.trim() : "";
    const anchor = typeof decision.args?.anchor === "string" ? decision.args.anchor.trim() : "";
    const selectedText = typeof decision.args?.selected_text === "string" ? decision.args.selected_text.trim() : "";
    const actionId =
      decision.intent === "docs_summarize_section"
        ? "summarize_section"
        : decision.intent === "docs_explain_paper"
          ? "explain_paper"
          : "summarize_doc";
    return {
      action: "run_panel_action",
      panel_id: "docs-viewer",
      action_id: actionId,
      args: {
        ...(path ? { path } : {}),
        ...(anchor ? { anchor } : {}),
        ...(selectedText ? { selected_text: selectedText } : {}),
      },
    };
  }
  if (decision.intent === "calculator_open") {
    return {
      action: "open_panel",
      panel_id: "scientific-calculator",
    };
  }
  if (decision.intent === "calculator_ingest_clipboard") {
    return {
      action: "run_panel_action",
      panel_id: "scientific-calculator",
      action_id: "ingest_latex",
      args: { latex: "$clipboard", source_path: "clipboard" },
    };
  }
  if (decision.intent === "calculator_copy_result" || decision.intent === "calculator_copy_debug_log") {
    return {
      action: "run_panel_action",
      panel_id: "scientific-calculator",
      action_id: decision.intent === "calculator_copy_debug_log" ? "copy_debug_log" : "copy_result",
      args: {},
    };
  }
  if (decision.intent === "calculator_solve" || decision.intent === "calculator_solve_steps") {
    const latex = typeof decision.args?.latex === "string" ? decision.args.latex.trim() : "";
    return {
      action: "run_panel_action",
      panel_id: "scientific-calculator",
      action_id: decision.intent === "calculator_solve_steps" ? "solve_with_steps" : "solve_expression",
      args: {
        ...(latex ? { latex } : {}),
      },
    };
  }
  if (decision.intent === "open_panel") {
    const panelId = typeof decision.args?.panel_id === "string" ? decision.args.panel_id.trim() : "";
    if (!panelId) return null;
    return {
      action: "open_panel",
      panel_id: panelId,
    };
  }
  if (decision.intent === "run_panel_action") {
    const panelId = typeof decision.args?.panel_id === "string" ? decision.args.panel_id.trim() : "";
    const actionId = typeof decision.args?.action_id === "string" ? decision.args.action_id.trim() : "";
    if (!panelId || !actionId) return null;
    const args =
      decision.args?.args && typeof decision.args.args === "object" && !Array.isArray(decision.args.args)
        ? (decision.args.args as Record<string, unknown>)
        : undefined;
    return {
      action: "run_panel_action",
      panel_id: panelId,
      action_id: actionId,
      args,
    };
  }
  if (decision.intent === "close_active_panel") {
    return { action: "close_active_panel" };
  }
  if (decision.intent === "focus_next_panel") {
    return { action: "focus_next_panel" };
  }
  if (decision.intent === "focus_previous_panel") {
    return { action: "focus_previous_panel" };
  }
  if (decision.intent === "reopen_last_closed_panel") {
    return { action: "reopen_last_closed_panel" };
  }
  return null;
}

export function reconcileWorkstationIntentDecisionWithPrompt(
  prompt: string,
  decision: WorkstationIntentDecision,
): WorkstationIntentDecision {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return decision;
  if (decisionTargetsCalculatorAction(decision) && hasNonExecutableCalculatorMention(trimmedPrompt)) {
    return {
      intent: "none",
      confidence: Math.min(decision.confidence, 0.2),
      subgoal: "Treat the calculator wording as contextual text, not an executable workstation action.",
      args: undefined,
      reason: `${decision.reason ?? "classifier_override"} | deterministic_guard:calculator_mention_not_action`,
    };
  }
  if (decision.intent !== "docs_read_paper") return decision;
  const wantsSummary = SUMMARY_WORDS.test(trimmedPrompt) && DOC_WORDS.test(trimmedPrompt);
  const wantsSectionSummary = wantsSummary && SUMMARY_SECTION_WORDS.test(trimmedPrompt);
  const wantsExplain = EXPLAIN_WORDS.test(trimmedPrompt) && DOC_WORDS.test(trimmedPrompt);
  const explicitReadAloud = READ_ALOUD_WORDS.test(trimmedPrompt);
  if (!wantsSummary && !wantsExplain) return decision;
  if (explicitReadAloud && !wantsSummary && !wantsExplain) return decision;
  if (wantsSectionSummary) {
    return {
      ...decision,
      intent: "docs_summarize_section",
      reason: `${decision.reason ?? "classifier_override"} | deterministic_priority:summarize_section_over_read`,
    };
  }
  if (wantsSummary) {
    return {
      ...decision,
      intent: "docs_summarize_doc",
      reason: `${decision.reason ?? "classifier_override"} | deterministic_priority:summarize_doc_over_read`,
    };
  }
  if (wantsExplain) {
    return {
      ...decision,
      intent: "docs_explain_paper",
      reason: `${decision.reason ?? "classifier_override"} | deterministic_priority:explain_over_read`,
    };
  }
  return decision;
}

function extractFirstJsonObject(raw: string): string | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) return fenced;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}
