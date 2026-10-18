import type { HelixWorkstationAction } from "@/lib/workstation/workstationActionContract";

function normalizeWorkstationCommandText(value: string): string {
  return value
    .replace(/^\s*(?:hey\s+)?(?:helix|luma|computer|workspace|workstation)\s*[:,\-]?\s*/i, "")
    .replace(/^\s*(?:ok(?:ay)?|please|can\s+you|could\s+you|would\s+you)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function restateWorkstationSubgoal(value: string): string {
  const normalized = value.trim();
  const quoted = normalized.match(/\b(?:workstation|workspace)\s+(?:goal|task|subgoal)\s*[:=]\s*["']([^"']+)["']/i)?.[1];
  if (quoted?.trim()) return quoted.trim();
  const afterColon = normalized.match(/\b(?:workstation|workspace)\s+(?:goal|task|subgoal)\s*[:=]\s*(.+)$/i)?.[1];
  if (afterColon?.trim()) return afterColon.trim();
  return normalized;
}

function buildLexiconPanelAction(
  panelId: string,
  actionId: string,
  args?: Record<string, unknown>,
): HelixWorkstationAction | null {
  const normalizedPanelId = panelId.trim();
  const normalizedActionId = actionId.trim();
  if (!normalizedPanelId || !normalizedActionId) return null;
  return {
    action: "run_panel_action",
    panel_id: normalizedPanelId,
    action_id: normalizedActionId,
    ...(args && Object.keys(args).length > 0 ? { args } : {}),
  };
}

export function parseWorkstationActionChainCommand(value: string): HelixWorkstationAction[] | null {
  const trimmed = normalizeWorkstationCommandText(value);
  if (!trimmed) return null;
  const conversationalCandidate = restateWorkstationSubgoal(trimmed);
  const normalized = conversationalCandidate.toLowerCase();
  const hasCopySelectionSignal = /\bcopy\s+(?:this|that|current)\s+(?:abstract|section|excerpt|snippet|selection|text|content)\b/i.test(
    normalized,
  );
  const hasNoteSignal = /\b(?:to\s+(?:a\s+)?note|to\s+notes?)\b/i.test(normalized);
  const hasCompareSignal = /\b(?:compare|contrast|difference|overlap|synthesi[sz]e|explain)\b/i.test(normalized);
  if (!(hasCopySelectionSignal && hasNoteSignal && hasCompareSignal)) return null;

  const noteTitle =
    conversationalCandidate.match(/\bto\s+(?:a\s+)?note\s+(?:called|named|titled)\s+(.+?)(?:\s+(?:and|then)\b|$)/i)?.[1]?.trim() ??
    conversationalCandidate.match(/\bto\s+note\s+(.+?)(?:\s+(?:and|then)\b|$)/i)?.[1]?.trim() ??
    undefined;
  const compareInstruction =
    conversationalCandidate.match(/\b(?:and|then)\s+(compare[\s\S]*)$/i)?.[1]?.trim() ??
    "Compare the note with the current docs context and explain the key differences.";
  const copySelectionAction = buildLexiconPanelAction("workstation-clipboard-history", "copy_selection_to_note", {
    note_title: noteTitle,
  });
  if (!copySelectionAction) return null;

  const compareJobAction: HelixWorkstationAction = {
    action: "run_job",
    payload: {
      workflow: "observable_research_pipeline",
      title: noteTitle ? `Compare note ${noteTitle} with current doc` : "Compare copied selection with current doc",
      objective:
        "Compose a comparison between the copied selection note and current docs-viewer context, then explain it plainly.",
      preferred_panels: ["workstation-notes", "docs-viewer", "workstation-workflow-timeline"],
      max_steps: 5,
      workflow_args: {
        note_title: noteTitle,
        compare_instruction: compareInstruction,
        compare_basis: "current_doc",
        chain_signature: "copy_selection_to_note -> compare_note_with_doc",
      },
    },
  };
  return [copySelectionAction, compareJobAction];
}
