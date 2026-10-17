import type { ProcessGraphContextPack } from "./buildProcessGraphContextPack";
import { isSceneEpochReplayPrompt } from "@shared/helix-scene-epoch-replay-intent";

const OVERVIEW_PROMPT_PATTERN =
  /\b(?:what(?:'s| is)\s+(?:happening|going on)|what\s+are\s+you\s+doing|what\s+(?:tools|artifacts)\s+are\s+active|current\s+workspace|active\s+(?:jobs?|tools?|panels?|pipeline|artifacts)|why\s+did\s+that\s+fail|what\s+changed|latest\s+(?:artifact|result|job))\b/i;

const EXPLICIT_PROCESS_GRAPH_PROMPT_PATTERN =
  /\b(?:workstation\s+overview|workstation\s+state|process\s+graph|what\s+panels\s+are\s+open|which\s+panels\s+are\s+open|what\s+artifacts\s+are\s+active|active\s+(?:artifacts|jobs?|tools?|panels?)|current\s+workspace)\b/i;

const PROCEDURE_MEMORY_PROMPT_PATTERN =
  /\b(?:last\s+(?:seen\s+|situation\s+|scene\s+|visual\s+|screen\s+|live\s+)?epoch|situation\s+epoch|procedure\s+epoch|scene\s+epoch|visual\s+epoch|screen\s+epoch|live\s+epoch|what\s+changed\s+in\s+the\s+last\s+(?:seen\s+|situation\s+|scene\s+|visual\s+|screen\s+)?epoch|show\s+(?:the\s+)?evidence|why\s+did\s+you\s+say|replay\s+(?:that|the\s+last|the\s+procedure|procedure\s+memory)|procedure\s+memory|visual\s+capture|live[-\s]+source|live[-\s]+source\s+mail|source\s+mail|mailbox|visual\s+mail|visual\s+summary\s+mail|source\s+update|visual\s+update|latest\s+visual\s+update|new\s+source\s+mail|latest\s+mail|mail\s+loop|summar(?:y|ies)|observations?|current\s+screen|screen\s+capture|what\s+(?:am\s+i|are\s+we)\s+looking\s+at|(?:what\s+changed|changed\s+since|describe\s+what\s+changed|compare\b.*)\s+(?:since\s+)?(?:the\s+)?(?:last|previous)\s+(?:seen\s+)?(?:scene|frame|visual|screen|capture|epoch)|(?:different|difference)\b[\s\S]{0,100}\b(?:last|previous)\s+(?:scene|frame|visual|screen|capture|epoch)|last\s+(?:scene|frame|visual|screen|capture)\b[\s\S]{0,100}\b(?:current|now|looking\s+at|this\s+(?:scene|frame|visual|screen))|since\s+last\s+(?:seen|visual|capture|scene|frame|screen|epoch)|compare\s+(?:to\s+)?(?:the\s+)?last\s+(?:scene|frame|visual|screen|capture|epoch)|compare\s+current\s+scene|previous\s+(?:scene|frame|visual|screen|capture)|scene\s+change|frame\s+change|visual\s+delta|screen\s+delta)\b/i;

export function shouldUseProcessGraphContextPack(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (isSceneEpochReplayPrompt(trimmed) && !EXPLICIT_PROCESS_GRAPH_PROMPT_PATTERN.test(trimmed)) return false;
  const asksOverview = OVERVIEW_PROMPT_PATTERN.test(trimmed);
  if (!asksOverview) return false;
  const asksProcedureMemory = PROCEDURE_MEMORY_PROMPT_PATTERN.test(trimmed);
  if (!asksProcedureMemory) return true;
  return EXPLICIT_PROCESS_GRAPH_PROMPT_PATTERN.test(trimmed);
}

export function declineProcessGraphAskOverview(prompt: string): { declined: true; reason: string } | null {
  return isSceneEpochReplayPrompt(prompt) && !EXPLICIT_PROCESS_GRAPH_PROMPT_PATTERN.test(prompt)
    ? {
        declined: true,
        reason: "procedure_epoch_replay_prompt_requires_backend_ask",
      }
    : null;
}

function formatList(
  items: Array<{ label: string; status?: string; kind?: string; panelId?: string }>,
  empty: string,
  max = 5,
): string {
  if (items.length === 0) return empty;
  return items
    .slice(0, max)
    .map((item) => {
      const details = [item.kind, item.status, item.panelId].filter(Boolean).join(", ");
      return details ? `${item.label} (${details})` : item.label;
    })
    .join("; ");
}

export function buildProcessGraphOverviewText(pack: ProcessGraphContextPack): string {
  const active = formatList(pack.active, "No active panels, tools, jobs, or failed items are currently visible.");
  const artifacts = formatList(
    pack.recentArtifacts.map((artifact) => ({
      label: artifact.label,
      status: artifact.status,
      kind: artifact.artifactKind,
    })),
    "No recent artifacts are visible.",
  );
  const timeline = formatList(pack.recentTimeline, "No recent graph timeline events are visible.", 4);
  const warnings = pack.warnings.length > 0 ? pack.warnings.join("; ") : "No failed, stale, or pending items are visible.";

  return [
    "Here is the current workstation overview from the process graph.",
    `Active state: ${active}`,
    `Recent artifacts: ${artifacts}`,
    `Recent timeline: ${timeline}`,
    `Warnings: ${warnings}`,
    "Note: this graph is observational and may be incomplete or stale. Receipts and artifacts remain the proof of completed actions.",
  ].join("\n");
}
