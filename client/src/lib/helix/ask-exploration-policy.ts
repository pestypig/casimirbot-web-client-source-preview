import { isHelixAskVisualPrompt } from "./ask-attachment-prompt-policy";
import { clipText } from "./ask-value-normalization";

export type ExplorationPromptPacket = {
  topic?: string | null;
} | null | undefined;

export function inferAskMode(question: string): "observe" | "act" | "verify" | undefined {
  const normalized = question.trim().toLowerCase();
  if (!normalized) return undefined;

  if (
    /\b(verify|verification|prove|proof|validate|validation|integrity|certificate|pass\/fail|pass fail|audit|check)\b/.test(
      normalized,
    )
  ) {
    return "verify";
  }

  if (
    /^(please\s+)?(implement|fix|change|update|remove|add|create|open|start|stop|run|patch|rewrite)\b/.test(
      normalized,
    ) ||
    /\b(next action|take action|fix this|implement this|make this|change this|update this)\b/.test(
      normalized,
    )
  ) {
    return "act";
  }

  if (
    /\b(observe|monitor|watch|track|status|state|what changed|what is happening|inspect|summarize the current)\b/.test(
      normalized,
    )
  ) {
    return "observe";
  }

  return undefined;
}

export function isRepoFileLocationRequestPrompt(promptText: string): boolean {
  const normalized = promptText.trim().toLowerCase();
  if (!normalized) return false;
  return /\b(file|files|filepath|file path|path|paths|codebase|repo|repository|source code|where|located|implemented|define[sd])\b/.test(
    normalized,
  );
}

const HELIX_ASK_REPO_CODE_EVIDENCE_PROMPT_PATTERN =
  /\b(?:repo(?:sitory)?|code|source\s+(?:file|path|tree)|file\s+paths?|line-backed|line\s+(?:number|numbers|source|sources)|cite\s+(?:exact\s+)?(?:file|path|source)|where\s+is\s+(?:that\s+)?(?:enforced|defined|declared|implemented|wired)|contract|schema|module|endpoint|route|symbol|export(?:s|ed)?|import(?:s|ed)?|requestedLaneSchema|server\/|client\/|shared\/|docs\/|[A-Za-z0-9_-]+\.(?:ts|tsx|js|jsx|md|json|py))\b/i;

export function isRepoCodeEvidencePrompt(question: string): boolean {
  return HELIX_ASK_REPO_CODE_EVIDENCE_PROMPT_PATTERN.test(question.trim());
}

export function resolveAskContextChooserAutoMode(question: string): {
  mode: "attached" | "isolated";
  reason: string;
} {
  const normalized = question.trim();
  if (
    isRepoCodeEvidencePrompt(normalized) &&
    !isHelixAskVisualPrompt(normalized)
  ) {
    return {
      mode: "isolated",
      reason: "repo_code_evidence_prompt",
    };
  }
  return {
    mode: "attached",
    reason: "workspace_context_reasoning_prompt",
  };
}

export function buildExplorationEscalationPrompt(args: {
  mode: "verify" | "act";
  prompt: string;
  previousOutput: string;
  packet?: ExplorationPromptPacket;
}): string {
  const topic = clipText(args.packet?.topic?.trim() || args.prompt.trim(), 140);
  const previous = clipText(args.previousOutput.trim(), 700);
  if (args.mode === "verify") {
    return [
      `Topic: ${topic}`,
      "Run verify mode on this exploration thread.",
      "Return pass/fail with grounded evidence anchors and deterministic fail reason if blocked.",
      "",
      "Original user turn:",
      args.prompt.trim(),
      "",
      "Observe attempt output:",
      previous,
    ].join("\n");
  }
  return [
    `Topic: ${topic}`,
    "Run act mode on this exploration thread.",
    "Return concrete execution steps and expected receipts, bounded by existing safety gates.",
    "",
    "Original user turn:",
    args.prompt.trim(),
    "",
    "Observe attempt output:",
    previous,
  ].join("\n");
}

export function buildExplorationArtifactRetryPrompt(args: {
  prompt: string;
  previousOutput: string;
  packet?: ExplorationPromptPacket;
}): string {
  const fileLocationPrompt = isRepoFileLocationRequestPrompt(args.prompt);
  const topic = clipText(args.packet?.topic?.trim() || args.prompt.trim(), 140);
  const previous = clipText(args.previousOutput.trim(), 700);
  return [
    `Topic: ${topic}`,
    "Restart observe mode from the top of the reasoning chain.",
    fileLocationPrompt
      ? "Avoid artifact-only templates and mission/ethos scaffolds; include concrete file paths only when they directly answer the user request."
      : "Do not emit repository file lists, mission/ethos scaffolds, or artifact-only templates.",
    "If the output drifts into mission/ethos ideology content without explicit user request, ask one focused clarifier instead of finalizing.",
    "Return a plain, grounded explanation aligned to the user turn. If still blocked, ask one focused clarifier.",
    "",
    "Original user turn:",
    args.prompt.trim(),
    "",
    "Previous artifact-dominated output (avoid repeating this pattern):",
    previous,
  ].join("\n");
}
