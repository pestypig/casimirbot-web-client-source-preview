import type { HelixWorkstationAction } from "@/lib/workstation/workstationActionContract";

export function readWorkstationActionArgText(
  action: HelixWorkstationAction,
  keys: string[],
): string | null {
  const args = action.action === "run_panel_action" && action.args && typeof action.args === "object"
    ? (action.args as Record<string, unknown>)
    : {};
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function extractCalculatorFastPathExpressionFromPrompt(prompt: string | null | undefined): string | null {
  const text = String(prompt ?? "").trim();
  if (!text) return null;
  const match = text.match(/\b(?:solve|evaluate|compute|calculate|check|verify)\s+(.+)$/i);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/^(?:the\s+)?(?:equation|expression|latex|formula)\s+/i, "")
    .replace(/\s+(?:and\s+)?(?:tell|show|give|report)\s+(?:me|us)?\s*(?:the\s+)?(?:result|answer|value|output)\b[\s\S]*$/i, "")
    .replace(/\s+(?:and\s+)?(?:return|provide)\s+(?:the\s+)?(?:result|answer|value|output)\b[\s\S]*$/i, "")
    .replace(/\s+(?:in|with|using)\s+(?:the\s+)?(?:scientific\s+)?calculator\b[\s\S]*$/i, "")
    .replace(/\s+(?:with\s+)?(?:step|steps|step-by-step|work)\b[\s\S]*$/i, "")
    .replace(/[.?!,;:]+$/g, "")
    .trim();
  return cleaned && /[=^*/+\-()_\\]|\d/.test(cleaned) ? cleaned : null;
}

export function selectWorkstationFastPathReplyAction(
  actions: HelixWorkstationAction[],
): HelixWorkstationAction | null {
  return actions.find((action) =>
    action.action === "run_panel_action" &&
    action.panel_id === "scientific-calculator" &&
    (action.action_id === "solve_expression" || action.action_id === "solve_with_steps") &&
    Boolean(readWorkstationActionArgText(action, ["latex", "expression", "text"])),
  ) ?? actions[0] ?? null;
}
