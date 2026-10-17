import { coerceText } from "./ask-value-normalization";

const HELIX_ASK_ANSWER_BOUNDARY_PREFIX_RE = /^\s*ANSWER_(?:START|END)\b\s*/i;
export const HELIX_ASK_ANSWER_MARKER_SPLIT_RE = /\b(?:ANSWER_START|ANSWER_END)\b/gi;

const QUESTION_PREFIX = /^question\s*:\s*/i;
const HELIX_ASK_METHOD_TRIGGER = /(scientific method|methodology|method\b)/i;
const HELIX_ASK_STEP_TRIGGER =
  /(how to|how does|how do|steps?|step-by-step|procedure|process|workflow|pipeline|implement|implementation|configure|setup|set up|troubleshoot|debug|fix|resolve)/i;
const HELIX_ASK_COMPARE_TRIGGER =
  /(compare|versus|vs\.?|difference|better|worse|more accurate|accuracy|tradeoffs|advantages|what is|what's|why is|why are|how is|how are)/i;

export type HelixAskFormat = "steps" | "compare" | "brief";

export function decideHelixAskFormat(question?: string): { format: HelixAskFormat; stageTags: boolean } {
  const normalized = question?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return { format: "brief", stageTags: false };
  }
  if (HELIX_ASK_METHOD_TRIGGER.test(normalized)) {
    return { format: "steps", stageTags: true };
  }
  if (HELIX_ASK_STEP_TRIGGER.test(normalized)) {
    return { format: "steps", stageTags: false };
  }
  if (
    HELIX_ASK_COMPARE_TRIGGER.test(normalized) ||
    normalized.startsWith("why ") ||
    normalized.startsWith("what is") ||
    normalized.startsWith("what's")
  ) {
    return { format: "compare", stageTags: false };
  }
  return { format: "brief", stageTags: false };
}

export function stripAnswerBoundaryPrefix(value: string): string {
  let cursor = value.trimStart();
  while (true) {
    const stripped = cursor.replace(HELIX_ASK_ANSWER_BOUNDARY_PREFIX_RE, "");
    if (stripped === cursor) break;
    cursor = stripped.trimStart();
  }
  return cursor;
}

export function stripStageTags(value: string): string {
  if (!value) return value;
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s*\((observe|hypothesis|experiment|analysis|explain)\)\s*$/i, "").trimEnd())
    .join("\n")
    .trim();
}

export function normalizeQuestionMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function stripInlineQuestionLine(line: string, question?: string): string | null {
  if (!QUESTION_PREFIX.test(line)) return null;
  let rest = line.replace(QUESTION_PREFIX, "").trimStart();
  if (QUESTION_PREFIX.test(rest)) {
    rest = rest.replace(QUESTION_PREFIX, "").trimStart();
  }
  const questionTrimmed = question?.trim();
  if (questionTrimmed) {
    const questionLower = questionTrimmed.toLowerCase();
    if (rest.toLowerCase().startsWith(questionLower)) {
      rest = rest
        .slice(questionTrimmed.length)
        .replace(/^[\s:;,.!?-]+/, "")
        .trimStart();
    }
  }
  if (!rest) return "";
  const markIndex = rest.indexOf("?");
  if (markIndex >= 0 && markIndex < 240) {
    const after = rest.slice(markIndex + 1).replace(/^[\s:;,.!?-]+/, "").trimStart();
    if (after) return after;
  }
  return rest;
}

export function stripQuestionPrefixText(value: string, question?: string): string {
  if (!value) return value;
  const lines = value.split(/\r?\n/);
  if (!lines.length) return value;
  const stripped = stripInlineQuestionLine(lines[0] ?? "", question);
  if (stripped === null) return value;
  if (stripped) {
    lines[0] = stripped;
  } else {
    lines.shift();
  }
  return lines.join("\n").trim();
}

export function cleanPromptLine(value: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const stripped = trimmed
    .replace(/^[\"'`.\-,;]+/g, "")
    .replace(/[\"'`.\-,;]+$/g, "")
    .trim();
  return stripped;
}

export function stripLeadingQuestion(response: string, question?: string): string {
  const lines = response.split(/\r?\n/);
  const target = question?.trim();
  const targetNormalized = target ? normalizeQuestionMatch(target) : "";
  let startIndex = 0;
  while (startIndex < lines.length) {
    const inline = stripInlineQuestionLine(lines[startIndex] ?? "", question);
    if (inline !== null) {
      if (inline) {
        lines[startIndex] = inline;
        break;
      }
      startIndex += 1;
      continue;
    }
    const cleaned = cleanPromptLine(lines[startIndex]);
    if (!cleaned) {
      startIndex += 1;
      continue;
    }
    if (/^(question|context|resonance patch)\s*:/i.test(cleaned)) {
      startIndex += 1;
      continue;
    }
    if (target) {
      const lowerLine = cleaned.toLowerCase();
      if (lowerLine === target.toLowerCase()) {
        startIndex += 1;
        continue;
      }
      const normalizedLine = normalizeQuestionMatch(cleaned);
      if (normalizedLine && normalizedLine === targetNormalized) {
        startIndex += 1;
        continue;
      }
    }
    break;
  }
  return lines.slice(startIndex).join("\n").trim();
}

export function stripEvidencePromptBlock(value: string): string {
  if (!value) return value;
  const lines = value.split(/\r?\n/);
  const cleaned = lines.map((line) => cleanPromptLine(line));
  const evidenceIndex = cleaned.findIndex((line) => /^evidence\s*:/i.test(line));
  if (evidenceIndex < 0) return value;
  const answerIndex = cleaned.findIndex((line, index) => index > evidenceIndex && /^answer\s*:/i.test(line));
  if (answerIndex < 0) return value;
  const pruned = [...lines.slice(0, evidenceIndex), ...lines.slice(answerIndex + 1)];
  return pruned.join("\n").trim();
}

export function extractAnswerBlock(value: string): string {
  if (!value) return "";
  const splitSegments = value
    .split(HELIX_ASK_ANSWER_MARKER_SPLIT_RE)
    .map((segment) => stripAnswerBoundaryPrefix(segment).trim())
    .filter(Boolean);
  if (splitSegments.length > 0) {
    const longest = splitSegments.reduce((best, candidate) =>
      best.length >= candidate.length ? best : candidate,
    "");
    if (longest) return longest;
  }
  const startIndex = value.lastIndexOf("ANSWER_START");
  if (startIndex >= 0) {
    const afterStart = value.slice(startIndex + "ANSWER_START".length);
    const endIndex = afterStart.lastIndexOf("ANSWER_END");
    const slice = endIndex >= 0 ? afterStart.slice(0, endIndex) : afterStart;
    const trimmed = stripAnswerBoundaryPrefix(slice).trim();
    if (trimmed) return trimmed;
  }
  const boundaryTrimmed = stripAnswerBoundaryPrefix(value);
  if (boundaryTrimmed) {
    return boundaryTrimmed;
  }
  const markers = ["FINAL:", "FINAL ANSWER:", "FINAL_ANSWER:", "Answer:"];
  for (const marker of markers) {
    const index = value.lastIndexOf(marker);
    if (index >= 0) {
      const after = value.slice(index + marker.length).trim();
      if (after) return after;
    }
  }
  return "";
}

export function stripPromptEcho(response: unknown, question?: string): string {
  let trimmed = stripQuestionPrefixText(coerceText(response).trim(), question);
  trimmed = stripLeadingQuestion(trimmed, question);
  trimmed = stripEvidencePromptBlock(trimmed);
  trimmed = stripAnswerBoundaryPrefix(trimmed);
  const answerBlock = extractAnswerBlock(trimmed);
  if (answerBlock) {
    return answerBlock;
  }
  if (!trimmed) return trimmed;
  const markers = ["FINAL:", "FINAL ANSWER:", "FINAL_ANSWER:", "Answer:"];
  for (const marker of markers) {
    const index = trimmed.lastIndexOf(marker);
    if (index >= 0) {
      const after = trimmed.slice(index + marker.length).trim();
      if (after) return after;
    }
  }
  const isScaffoldLine = (line: string) => {
    const cleaned = line
      .trim()
      .replace(/^[>"'`*#\-\d\.\)\s]+/, "")
      .trim();
    if (!cleaned) return true;
    const lowered = cleaned.toLowerCase();
    return (
      lowered.startsWith("you are helix ask") ||
      lowered.startsWith("use only the evidence") ||
      lowered.startsWith("use only the evidence steps") ||
      lowered.startsWith("use only the evidence bullets") ||
      lowered.startsWith("use general knowledge") ||
      lowered.startsWith("use only the reasoning") ||
      lowered.startsWith("revise the answer") ||
      lowered.startsWith("do not add new claims") ||
      lowered.startsWith("preserve the format") ||
      lowered.startsWith("keep the paragraph format") ||
      lowered.startsWith("keep the numbered step list") ||
      lowered.startsWith("use only file paths") ||
      lowered.startsWith("evidence:") ||
      lowered.startsWith("answer:") ||
      lowered.startsWith("if the context is insufficient") ||
      lowered.startsWith("if the question mentions") ||
      lowered.startsWith("when the context includes") ||
      lowered.startsWith("if the question is comparative") ||
      lowered.startsWith("answer in") ||
      lowered.startsWith("do not use numbered steps") ||
      lowered.startsWith("start directly with") ||
      lowered.startsWith("each step should") ||
      lowered.startsWith("after the steps") ||
      lowered.startsWith("avoid repetition") ||
      lowered.startsWith("preserve any stage tags") ||
      lowered.startsWith("do not include stage tags") ||
      lowered.startsWith("do not include the words") ||
      lowered.startsWith("do not output tool logs") ||
      lowered.startsWith("do not repeat the question") ||
      lowered.startsWith("end with a short paragraph") ||
      lowered.startsWith("respond with only the answer between") ||
      /^answer_(?:start|end)\b/i.test(cleaned) ||
      lowered.startsWith("no preamble") ||
      lowered.startsWith("no headings") ||
      lowered.startsWith("ask debug") ||
      lowered.startsWith("two-pass:") ||
      lowered.startsWith("format:") ||
      lowered.startsWith("stage tags:") ||
      lowered.startsWith("question:") ||
      lowered.includes("question:") ||
      lowered.startsWith("context:") ||
      lowered.startsWith("prompt context") ||
      lowered.startsWith("context sources") ||
      lowered.startsWith("resonance patch:") ||
      lowered.startsWith("knowledge projects:") ||
      lowered.startsWith("evidence steps:") ||
      lowered.startsWith("evidence bullets:") ||
      lowered.startsWith("reasoning steps:") ||
      lowered.startsWith("reasoning bullets:") ||
      lowered.startsWith("final:")
    );
  };
  const cleanedLines = trimmed
    .split(/\r?\n/)
    .filter((line) => !isScaffoldLine(line))
    .map((line) => stripAnswerBoundaryPrefix(line));
  const cleaned = cleanedLines.join("\n").trim();
  const formatSpec = decideHelixAskFormat(question);
  if (cleaned) {
    return formatSpec.stageTags ? cleaned : stripStageTags(cleaned);
  }
  return formatSpec.stageTags
    ? trimmed
    : stripStageTags(stripAnswerBoundaryPrefix(trimmed));
}
