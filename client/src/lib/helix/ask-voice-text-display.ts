const SPEAK_TEXT_MAX_CHARS = 600;

const FILE_PATH_CITATION_SEGMENT =
  "(?:[A-Za-z]:[\\\\/]|(?:docs|client|server|shared|scripts|tests|configs|reports|artifacts|packages|sdk|cli)/)";
const FILE_PATH_CITATION_PATTERN = new RegExp(`${FILE_PATH_CITATION_SEGMENT}[^\\s)\\]]+`, "gi");
const SOURCE_TRAILER_PATTERN = new RegExp(`(?:;|,)?\\s*source:\\s*${FILE_PATH_CITATION_SEGMENT}[^)\\s]+`, "gi");
const SOURCE_PAREN_PATTERN = new RegExp(`\\(\\s*source:\\s*${FILE_PATH_CITATION_SEGMENT}[^)]*\\)`, "gi");
const FILE_PATH_PAREN_PATTERN = new RegExp(`\\(\\s*${FILE_PATH_CITATION_SEGMENT}[^)]*\\)`, "gi");
const FILE_BASENAME_PATTERN = /\b[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|md|json|yaml|yml)\b/gi;
const RESIDUAL_EXTENSION_TOKEN_PATTERN = /\b(?:ts|tsx|js|jsx|md|json|yaml|yml)\b(?=[,;:])/gi;
const DANGLING_EXTENSION_BRACKET_PATTERN =
  /(^|[\s([{'"`])(?:ts|tsx|js|jsx|md|json|yaml|yml)\](?=[\s.,;:!?]|$)/gim;
const ORPHAN_EXTENSION_LINE_PATTERN =
  /(^|\n)\s*(?:\d+\.\s*)?(?:ts|tsx|js|jsx|md|json|yaml|yml)\](?=\s|$)/gi;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s)]+/gi;
const RUNTIME_FALLBACK_FETCH_FAILED_RE = /\bruntime fallback:\s*fetch failed\.?/gi;
const RUNTIME_FALLBACK_FETCH_FAILED_TEST_RE = /\bruntime fallback:\s*fetch failed\.?/i;
const HELPER_TIMEOUT_FALLBACK_RE = /\bhelper[_\s-]?timeout[_\s-]?fallback\b/i;

function clipVoiceText(value: string | undefined, limit: number): string {
  if (!value) return "";
  if (limit <= 0) return "";
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

export function sanitizeConversationBriefTextForVoice(value: string, maxChars = 560): string {
  const normalized = value
    .replace(/\?/g, ".")
    .replace(/\s+/g, " ")
    .replace(/\.\.+/g, ".")
    .trim();
  return clipVoiceText(normalized, maxChars);
}

export function stripVoiceCitationArtifacts(source: string): string {
  if (!source) return "";
  const normalized = source
    .replace(/\r\n/g, "\n")
    .replace(MARKDOWN_LINK_PATTERN, "$1")
    .replace(URL_PATTERN, "");
  const strippedLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line
        .replace(SOURCE_TRAILER_PATTERN, "")
        .replace(SOURCE_PAREN_PATTERN, "")
        .replace(FILE_PATH_PAREN_PATTERN, "")
        .replace(FILE_PATH_CITATION_PATTERN, "")
        .replace(FILE_BASENAME_PATTERN, "")
        .replace(RESIDUAL_EXTENSION_TOKEN_PATTERN, "")
        .replace(/\[\s*\]/g, " ")
        .replace(/\bsources?\s*:\s*$/i, "")
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .trim(),
    )
    .filter((line) => line.length > 0 && !/^sources?\s*:/i.test(line))
    .filter((line) => !/^[(){}\[\],.;:!?-]+$/.test(line));

  return strippedLines.join("\n").trim();
}

export function hasRuntimeFallbackArtifactSpill(source: string): boolean {
  const text = source.trim();
  if (!text) return false;
  const fetchFailedMentions = (text.match(RUNTIME_FALLBACK_FETCH_FAILED_RE) ?? []).length;
  if (fetchFailedMentions >= 2) return true;
  if (!RUNTIME_FALLBACK_FETCH_FAILED_TEST_RE.test(text)) return false;
  return HELPER_TIMEOUT_FALLBACK_RE.test(text);
}

export function isArtifactDominatedReasoningText(source: string): boolean {
  const text = source.trim();
  if (!text) return true;
  if (hasRuntimeFallbackArtifactSpill(text)) return true;
  if (/\bwhat[\s_]?is[\s_](warp[\s_]?bubble|mission[\s_]?ethos)\s*:/i.test(text)) return true;
  if (/\bhow[\s_]?they[\s_]?connect\s*:/i.test(text)) return true;
  if (/\bconstraints?_and_falsifiability\s*:/i.test(text)) return true;
  const underscoreTemplateHits = (
    text.match(/\b(?:what|how|focus|constraints?|policy|mission|sources?)_[a-z0-9_]+\s*:/gi) ?? []
  ).length;
  if (underscoreTemplateHits >= 2) return true;
  if (
    /\bfocus anchor\s*:/i.test(text) &&
    /\b(?:what[\s_]?is[\s_]|how[\s_]?they[\s_]?connect|constraints?_and_)\b/i.test(text)
  ) {
    return true;
  }
  if (
    /\bexport\s+default\s+function\b/i.test(text) &&
    /\b(?:useState|const\s+state\s*,\s*actions|\.tsx?\b)\b/i.test(text)
  ) {
    return true;
  }
  if (/\bhow they connect:\b/i.test(text) && /\bverification hooks|constraints and falsifiability|policy bounds\b/i.test(text)) {
    return true;
  }
  const fileRefHits = (
    text.match(
      /\b(?:[A-Za-z]:[\\/]|(?:docs|client|server|shared|modules|tests|scripts)[\\/]|[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|md|json|yaml|yml))\S*/gi,
    ) ?? []
  ).length;
  const labelHits = (text.match(/\b(?:tree walk|checked files|searched terms|sources?:|evidence:|constraint:)\b/gi) ?? [])
    .length;
  const semanticHits = (
    text.match(
      /\b(?:is|are|means|refers|describes|involves|because|therefore|allows|helps|shows|occurs|happens)\b/gi,
    ) ?? []
  ).length;
  const citationBracketHits = (text.match(/\[[^\]]+\]/g) ?? []).length;
  const emptyBracketHits = (text.match(/\[\s*\]/g) ?? []).length;
  const sentenceHits = (text.match(/[.!?](?:\s|$)/g) ?? []).length;
  if (fileRefHits >= 3 && semanticHits <= 2) return true;
  if (fileRefHits >= 4 && labelHits >= 1) return true;
  if (labelHits >= 2 && fileRefHits >= 2 && semanticHits <= 2) return true;
  if (citationBracketHits >= 4 && fileRefHits >= 1 && semanticHits <= 12) return true;
  if (citationBracketHits >= 6 && semanticHits <= 5) return true;
  if (emptyBracketHits >= 2 && semanticHits <= 18) return true;
  if (/\bsources?\s*:\s*$/i.test(text) && (fileRefHits >= 1 || citationBracketHits >= 1)) return true;
  if (sentenceHits === 0 && fileRefHits >= 3) return true;
  return false;
}

export function sanitizeReasoningOutputText(source: string): string {
  const text = hasRuntimeFallbackArtifactSpill(source)
    ? source.replace(RUNTIME_FALLBACK_FETCH_FAILED_RE, " ").replace(HELPER_TIMEOUT_FALLBACK_RE, " ")
    : source;
  return stripVoiceCitationArtifacts(text)
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

export function cleanReasoningDisplayArtifacts(source: string): string {
  if (!source) return "";
  return source
    .replace(/\r\n/g, "\n")
    .replace(ORPHAN_EXTENSION_LINE_PATTERN, "$1")
    .replace(DANGLING_EXTENSION_BRACKET_PATTERN, "$1")
    .replace(/\[\s*\]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildSpeakText(source: string, maxChars = SPEAK_TEXT_MAX_CHARS): string {
  const text = stripVoiceCitationArtifacts(source).trim();
  if (!text || maxChars <= 0) return "";
  if (text.length <= maxChars) return text;

  const capped = text.slice(0, maxChars).trimEnd();
  const boundaryIndex = Math.max(
    capped.lastIndexOf("\n"),
    capped.lastIndexOf("."),
    capped.lastIndexOf("!"),
    capped.lastIndexOf("?"),
  );
  const bounded = boundaryIndex > 0 ? capped.slice(0, boundaryIndex + 1).trimEnd() : capped;
  const fallback = bounded || capped;
  if (!fallback) return "";
  if (fallback.length < maxChars) return `${fallback}...`;
  if (maxChars === 1) return ".";
  return `${fallback.slice(0, maxChars - 1).trimEnd()}...`;
}

export function summarizeVoiceDebugText(source: string, maxChars = 220): string {
  const normalized = source.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}...`;
}
