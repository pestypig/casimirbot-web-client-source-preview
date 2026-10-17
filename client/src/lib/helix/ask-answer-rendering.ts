import { renderToString as renderKatexToString } from "katex";

export type HelixAskMathToken =
  | { kind: "text"; text: string }
  | {
      kind: "math";
      text: string;
      displayMode: boolean;
      openDelimiter: string;
      closeDelimiter: string;
    };

export type HelixAskMathTokenRenderStatus = "formatted" | "katex_error" | "ignored_reason";

export type HelixAskMathTokenDebugStatus = {
  tokenText: string;
  status: HelixAskMathTokenRenderStatus;
  displayMode: boolean | null;
  openDelimiter: string | null;
  closeDelimiter: string | null;
  reason: string | null;
};

export type HelixAskMathRenderDebug = {
  sourceChars: number;
  tokenCount: number;
  mathTokenCount: number;
  delimiterMathCount: number;
  bareMathCount: number;
  katexErrorCount: number;
  bareCandidateCount: number;
  bareAcceptedCount: number;
  bareIgnoredCount: number;
  katexErrorSamples: string[];
  bareIgnoredSamples: string[];
  tokenStatuses: HelixAskMathTokenDebugStatus[];
};

export type HelixAskPathTextSegment =
  | { kind: "text"; text: string }
  | { kind: "path"; text: string; start: number };

export type HelixAskInlineCodeTextSegment =
  | { kind: "text"; text: string }
  | { kind: "inline_code"; text: string; start: number };

export type HelixAskExternalLinkTextSegment =
  | { kind: "text"; text: string }
  | {
      kind: "external_link";
      text: string;
      href: string;
      start: number;
      syntax: "markdown" | "bare";
    };

const HELIX_ASK_MATH_DELIMITERS: ReadonlyArray<{
  openDelimiter: string;
  closeDelimiter: string;
  displayMode: boolean;
}> = [
  { openDelimiter: "$$", closeDelimiter: "$$", displayMode: true },
  { openDelimiter: "\\[", closeDelimiter: "\\]", displayMode: true },
  { openDelimiter: "\\(", closeDelimiter: "\\)", displayMode: false },
  { openDelimiter: "$", closeDelimiter: "$", displayMode: false },
];

const HELIX_ASK_BARE_EQUATION_CANDIDATE_RE =
  /[A-Za-z][A-Za-z0-9_]*(?:\([^=\n]{1,24}\))?\s*=\s*[^\n]{3,220}/g;
const HELIX_ASK_BARE_EQUATION_SIGNAL_RE =
  /(?:[0-9+\-*/^()|]|\b(?:sqrt|frac|integral|int|pi|hbar|delta|gamma|beta|rho|theta|tau|kappa|psi|phi|lambda)\b)/i;
const HELIX_ASK_PATH_SEGMENT_RE =
  /(?:[A-Za-z0-9_.-]+[\\/])+[A-Za-z0-9_.-]+\.(?:tsx|ts|jsx|js|md|json|cjs|mjs|py|yml|yaml)/g;
const HELIX_ASK_INLINE_CODE_SEGMENT_RE = /`([^`\n]+)`/g;
const HELIX_ASK_EXTERNAL_LINK_SEGMENT_RE =
  /\[([^\]\n]+)\]\((https?:\/\/[^\s<>"']+)\)|(https?:\/\/[^\s<>"'`]+)/gi;

function coerceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

function clipText(value: string | undefined, limit: number): string {
  if (!value) return "";
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeBareEquationCandidate(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const cutPatterns = [
    /,\s+/,
    /,\s*(?:with|where|and|but|which|that)\b/i,
    /\s+\bfor\b/i,
    /\s+\b(?:variables?|interpretation|trace source)\b/i,
    /\s+-\s+(?:Keep|This|In|The|Term-to-implementation|Sources)\b/i,
    /\.\s+(?:Keep|This|In|The|Term-to-implementation|Sources)\b/i,
    /\s+Sources:\s*/i,
  ];
  let cutIndex = compact.length;
  for (const pattern of cutPatterns) {
    const match = compact.match(pattern);
    if (!match || match.index === undefined) continue;
    cutIndex = Math.min(cutIndex, match.index);
  }
  return compact.slice(0, cutIndex).trim().replace(/(?<=\d)[.;:]$/, "");
}

function classifyBareEquationCandidate(value: string): { accepted: boolean; reason: string | null } {
  const normalized = normalizeBareEquationCandidate(value);
  if (!normalized) return { accepted: false, reason: "empty_candidate" };
  const eqIndex = normalized.indexOf("=");
  if (eqIndex <= 0 || eqIndex >= normalized.length - 1) {
    return { accepted: false, reason: "malformed_equals" };
  }
  const lhs = normalized.slice(0, eqIndex).trim();
  const rhs = normalized.slice(eqIndex + 1).trim();
  if (!lhs || !rhs) {
    return { accepted: false, reason: "missing_lhs_or_rhs" };
  }
  if (/^(?:score|confidence|threshold|count|ratio|rate|rank|index|line|id)$/i.test(lhs)) {
    return { accepted: false, reason: "lhs_metadata_assignment" };
  }
  if (lhs.includes("/") || lhs.includes(":") || lhs.includes("\\")) {
    return { accepted: false, reason: "lhs_path_like" };
  }
  if (/^(?:docs|server|client|modules|tools|scripts|tmp)\b/i.test(lhs)) {
    return { accepted: false, reason: "lhs_repo_prefix" };
  }
  if (/^https?:\/\//i.test(rhs)) {
    return { accepted: false, reason: "rhs_url_like" };
  }
  if (!HELIX_ASK_BARE_EQUATION_SIGNAL_RE.test(rhs)) {
    return { accepted: false, reason: "rhs_low_math_signal" };
  }
  return { accepted: true, reason: null };
}

function isLikelyBareEquationSegment(value: string): boolean {
  return classifyBareEquationCandidate(value).accepted;
}

function pushTextMathToken(tokens: HelixAskMathToken[], text: string): void {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === "text") {
    last.text += text;
    return;
  }
  tokens.push({ kind: "text", text });
}

function tokenizeHelixAskBareEquationSegments(content: string): HelixAskMathToken[] {
  const text = coerceText(content);
  if (!text) return [];
  const tokens: HelixAskMathToken[] = [];
  let cursor = 0;
  HELIX_ASK_BARE_EQUATION_CANDIDATE_RE.lastIndex = 0;
  for (const match of text.matchAll(HELIX_ASK_BARE_EQUATION_CANDIDATE_RE)) {
    const raw = match[0] ?? "";
    const start = match.index ?? -1;
    if (!raw || start < 0) continue;
    const candidate = normalizeBareEquationCandidate(raw);
    if (!isLikelyBareEquationSegment(candidate)) continue;
    const offset = raw.indexOf(candidate);
    const mathStart = start + Math.max(0, offset);
    const mathEnd = mathStart + candidate.length;
    if (mathStart < cursor) continue;
    if (mathStart > cursor) {
      pushTextMathToken(tokens, text.slice(cursor, mathStart));
    }
    tokens.push({
      kind: "math",
      text: candidate,
      displayMode: false,
      openDelimiter: "",
      closeDelimiter: "",
    });
    cursor = mathEnd;
  }
  if (cursor < text.length) {
    pushTextMathToken(tokens, text.slice(cursor));
  }
  return tokens.length > 0 ? tokens : [{ kind: "text", text }];
}

function collectHelixAskBareEquationCandidateStats(content: string): {
  bareCandidateCount: number;
  bareAcceptedCount: number;
  bareIgnoredCount: number;
  bareIgnoredSamples: string[];
  bareIgnoredDetails: Array<{ candidate: string; reason: string }>;
} {
  const text = coerceText(content);
  if (!text) {
    return {
      bareCandidateCount: 0,
      bareAcceptedCount: 0,
      bareIgnoredCount: 0,
      bareIgnoredSamples: [],
      bareIgnoredDetails: [],
    };
  }
  let bareCandidateCount = 0;
  let bareAcceptedCount = 0;
  let bareIgnoredCount = 0;
  const bareIgnoredSamples: string[] = [];
  const bareIgnoredDetails: Array<{ candidate: string; reason: string }> = [];
  HELIX_ASK_BARE_EQUATION_CANDIDATE_RE.lastIndex = 0;
  for (const match of text.matchAll(HELIX_ASK_BARE_EQUATION_CANDIDATE_RE)) {
    const raw = match[0] ?? "";
    if (!raw) continue;
    const candidate = normalizeBareEquationCandidate(raw);
    if (!candidate) continue;
    bareCandidateCount += 1;
    const classification = classifyBareEquationCandidate(candidate);
    if (classification.accepted) {
      bareAcceptedCount += 1;
    } else {
      bareIgnoredCount += 1;
      if (bareIgnoredSamples.length < 3) {
        bareIgnoredSamples.push(clipText(candidate, 120));
      }
      if (bareIgnoredDetails.length < 24) {
        bareIgnoredDetails.push({
          candidate: clipText(candidate, 180),
          reason: classification.reason ?? "unclassified_reject",
        });
      }
    }
  }
  return {
    bareCandidateCount,
    bareAcceptedCount,
    bareIgnoredCount,
    bareIgnoredSamples,
    bareIgnoredDetails,
  };
}

export function isLikelyCodeStyleMathToken(token: Extract<HelixAskMathToken, { kind: "math" }>): boolean {
  if (token.openDelimiter !== "" || token.closeDelimiter !== "") return false;
  const text = token.text;
  if (!text) return false;
  if (/^[A-Za-z][A-Za-z0-9_]*\s*=\s*-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return true;
  if (/\bMath\.[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(text)) return true;
  if (/[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+/.test(text)) return true;
  if (/\b(?:const|let|var)\b/.test(text)) return true;
  return false;
}

export function parseHelixAskFinalAnswerBulletLine(line: string): string | null {
  const trimmed = coerceText(line).trim();
  const bulletMatch = trimmed.match(/^[-*]\s*(\S.+)$/);
  if (!bulletMatch?.[1]) return null;
  const content = bulletMatch[1];
  if (/^\*[^*][\s\S]*\*\*$/.test(content)) return `*${content}`;
  return bulletMatch?.[1] ?? null;
}

export function splitHelixAskTextPathSegments(content: unknown): HelixAskPathTextSegment[] {
  const text = coerceText(content);
  if (!text) return [];
  const segments: HelixAskPathTextSegment[] = [];
  let lastIndex = 0;
  HELIX_ASK_PATH_SEGMENT_RE.lastIndex = 0;
  for (const match of text.matchAll(HELIX_ASK_PATH_SEGMENT_RE)) {
    const matchText = match[0] ?? "";
    const start = match.index ?? -1;
    if (!matchText || start < 0) continue;
    if (start > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, start) });
    }
    segments.push({ kind: "path", text: matchText, start });
    lastIndex = start + matchText.length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }
  return segments.length ? segments : [{ kind: "text", text }];
}

export function splitHelixAskInlineCodeTextSegments(content: unknown): HelixAskInlineCodeTextSegment[] {
  const text = coerceText(content);
  if (!text) return [];
  const segments: HelixAskInlineCodeTextSegment[] = [];
  let cursor = 0;
  HELIX_ASK_INLINE_CODE_SEGMENT_RE.lastIndex = 0;
  for (const match of text.matchAll(HELIX_ASK_INLINE_CODE_SEGMENT_RE)) {
    const full = match[0] ?? "";
    const body = match[1] ?? "";
    const start = match.index ?? -1;
    if (!full || start < 0) continue;
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start) });
    }
    segments.push({ kind: "inline_code", text: body, start });
    cursor = start + full.length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments.length ? segments : [{ kind: "text", text }];
}

function trimBareExternalLinkCandidate(value: string): string {
  let candidate = value.replace(/[.,;:!?]+$/g, "");
  while (candidate.endsWith(")")) {
    const openCount = (candidate.match(/\(/g) ?? []).length;
    const closeCount = (candidate.match(/\)/g) ?? []).length;
    if (closeCount <= openCount) break;
    candidate = candidate.slice(0, -1);
  }
  return candidate;
}

function normalizeSafeExternalLink(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function splitHelixAskExternalLinkTextSegments(
  content: unknown,
): HelixAskExternalLinkTextSegment[] {
  const text = coerceText(content);
  if (!text) return [];
  const segments: HelixAskExternalLinkTextSegment[] = [];
  let cursor = 0;
  HELIX_ASK_EXTERNAL_LINK_SEGMENT_RE.lastIndex = 0;
  for (const match of text.matchAll(HELIX_ASK_EXTERNAL_LINK_SEGMENT_RE)) {
    const full = match[0] ?? "";
    const markdownLabel = match[1] ?? "";
    const markdownHref = match[2] ?? "";
    const bareHref = match[3] ?? "";
    const start = match.index ?? -1;
    if (!full || start < 0) continue;
    const syntax = markdownHref ? "markdown" as const : "bare" as const;
    const rawHref = syntax === "markdown" ? markdownHref : trimBareExternalLinkCandidate(bareHref);
    const href = normalizeSafeExternalLink(rawHref);
    if (!href) continue;
    const consumedText = syntax === "markdown" ? full : rawHref;
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start) });
    }
    segments.push({
      kind: "external_link",
      text: syntax === "markdown" ? markdownLabel : rawHref,
      href,
      start,
      syntax,
    });
    cursor = start + consumedText.length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments.length ? segments : [{ kind: "text", text }];
}

function expandMathTokensWithBareEquations(tokens: HelixAskMathToken[]): HelixAskMathToken[] {
  if (tokens.length === 0) return tokens;
  const expanded: HelixAskMathToken[] = [];
  for (const token of tokens) {
    if (token.kind !== "text") {
      expanded.push(token);
      continue;
    }
    const splitTokens = tokenizeHelixAskBareEquationSegments(token.text);
    if (splitTokens.length === 0) {
      pushTextMathToken(expanded, token.text);
      continue;
    }
    for (const splitToken of splitTokens) {
      if (splitToken.kind === "text") {
        pushTextMathToken(expanded, splitToken.text);
      } else {
        expanded.push(splitToken);
      }
    }
  }
  return expanded;
}

function isEscapedDelimiterAt(value: string, index: number): boolean {
  if (index <= 0) return false;
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function findNextUnescapedDelimiter(value: string, delimiter: string, startIndex: number): number {
  let index = value.indexOf(delimiter, Math.max(0, startIndex));
  while (index >= 0) {
    if (!isEscapedDelimiterAt(value, index)) {
      if (delimiter === "$" && value[index + 1] === "$") {
        index = value.indexOf(delimiter, index + 1);
        continue;
      }
      return index;
    }
    index = value.indexOf(delimiter, index + 1);
  }
  return -1;
}

function findNextMathOpenDelimiter(
  value: string,
  startIndex: number,
):
  | {
      index: number;
      openDelimiter: string;
      closeDelimiter: string;
      displayMode: boolean;
    }
  | null {
  let winner:
    | {
        index: number;
        openDelimiter: string;
        closeDelimiter: string;
        displayMode: boolean;
      }
    | null = null;
  for (const delimiter of HELIX_ASK_MATH_DELIMITERS) {
    const nextIndex = findNextUnescapedDelimiter(value, delimiter.openDelimiter, startIndex);
    if (nextIndex < 0) continue;
    if (!winner || nextIndex < winner.index) {
      winner = {
        index: nextIndex,
        openDelimiter: delimiter.openDelimiter,
        closeDelimiter: delimiter.closeDelimiter,
        displayMode: delimiter.displayMode,
      };
    }
  }
  return winner;
}

export function tokenizeHelixAskMathTokens(content: string): HelixAskMathToken[] {
  const text = coerceText(content);
  if (!text) return [];
  const tokens: HelixAskMathToken[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const nextOpen = findNextMathOpenDelimiter(text, cursor);
    if (!nextOpen) {
      pushTextMathToken(tokens, text.slice(cursor));
      break;
    }
    if (nextOpen.index > cursor) {
      pushTextMathToken(tokens, text.slice(cursor, nextOpen.index));
    }
    const contentStart = nextOpen.index + nextOpen.openDelimiter.length;
    const closeIndex = findNextUnescapedDelimiter(text, nextOpen.closeDelimiter, contentStart);
    if (closeIndex < 0) {
      pushTextMathToken(tokens, nextOpen.openDelimiter);
      cursor = contentStart;
      continue;
    }
    const mathBody = text.slice(contentStart, closeIndex);
    if (!mathBody.trim()) {
      pushTextMathToken(tokens, `${nextOpen.openDelimiter}${mathBody}${nextOpen.closeDelimiter}`);
    } else {
      tokens.push({
        kind: "math",
        text: mathBody,
        displayMode: nextOpen.displayMode,
        openDelimiter: nextOpen.openDelimiter,
        closeDelimiter: nextOpen.closeDelimiter,
      });
    }
    cursor = closeIndex + nextOpen.closeDelimiter.length;
  }
  return expandMathTokensWithBareEquations(tokens);
}

export function hasHelixAskRenderableMath(content: unknown): boolean {
  const text = coerceText(content);
  if (!text) return false;
  return tokenizeHelixAskMathTokens(text).some((token) => token.kind === "math");
}

const HELIX_ASK_EQUATION_FAMILY_ID = "equation_formalism";

export function isHelixAskEquationFamilyDebug(debug: unknown): boolean {
  const debugRecord = asObjectRecord(debug);
  if (!debugRecord) return false;
  const policyFamily =
    typeof debugRecord.policy_prompt_family === "string"
      ? debugRecord.policy_prompt_family.trim().toLowerCase()
      : "";
  const composerFamily =
    typeof debugRecord.composer_prompt_family === "string"
      ? debugRecord.composer_prompt_family.trim().toLowerCase()
      : "";
  if (policyFamily === HELIX_ASK_EQUATION_FAMILY_ID || composerFamily === HELIX_ASK_EQUATION_FAMILY_ID) {
    return true;
  }
  if (
    typeof debugRecord.equation_selector_primary_key === "string" &&
    debugRecord.equation_selector_primary_key.trim().length > 0
  ) {
    return true;
  }
  if (debugRecord.equation_selector_authority_lock === true) {
    return true;
  }
  const equationQuoteContract = asObjectRecord(debugRecord.equation_quote_contract);
  if (equationQuoteContract && equationQuoteContract.required === true) {
    return true;
  }
  return false;
}

export function shouldShowHelixAskCalculatorPanel(args: {
  canLaunchPanel: boolean;
  hasRenderableMath: boolean;
  debug?: unknown;
}): boolean {
  if (!args.canLaunchPanel || !args.hasRenderableMath) return false;
  const debugRecord = asObjectRecord(args.debug);
  if (!debugRecord) {
    // Legacy responses without debug context keep prior math-only behavior.
    return true;
  }
  const policyFamily =
    typeof debugRecord.policy_prompt_family === "string"
      ? debugRecord.policy_prompt_family.trim().toLowerCase()
      : "";
  const composerFamily =
    typeof debugRecord.composer_prompt_family === "string"
      ? debugRecord.composer_prompt_family.trim().toLowerCase()
      : "";
  if (policyFamily || composerFamily) {
    return (
      policyFamily === HELIX_ASK_EQUATION_FAMILY_ID ||
      composerFamily === HELIX_ASK_EQUATION_FAMILY_ID
    );
  }
  return isHelixAskEquationFamilyDebug(debugRecord);
}

export function buildHelixAskMathRenderDebugForText(content: unknown): HelixAskMathRenderDebug | null {
  const text = coerceText(content);
  if (!text) return null;
  const tokens = tokenizeHelixAskMathTokens(text);
  const mathTokens = tokens.filter((token): token is Extract<HelixAskMathToken, { kind: "math" }> => token.kind === "math");
  const { bareCandidateCount, bareAcceptedCount, bareIgnoredCount, bareIgnoredSamples, bareIgnoredDetails } =
    collectHelixAskBareEquationCandidateStats(text);
  if (mathTokens.length === 0 && bareCandidateCount === 0) {
    return null;
  }
  let katexErrorCount = 0;
  const katexErrorSamples: string[] = [];
  const tokenStatuses: HelixAskMathTokenDebugStatus[] = [];
  for (const token of mathTokens) {
    let status: HelixAskMathTokenRenderStatus = "formatted";
    let reason: string | null = null;
    if (isLikelyCodeStyleMathToken(token)) {
      reason = "code_style_plaintext";
      if (tokenStatuses.length < 64) {
        tokenStatuses.push({
          tokenText: clipText(token.text, 180),
          status,
          displayMode: token.displayMode,
          openDelimiter: token.openDelimiter || null,
          closeDelimiter: token.closeDelimiter || null,
          reason,
        });
      }
      continue;
    }
    try {
      const html = renderKatexToString(token.text, {
        displayMode: token.displayMode,
        strict: "ignore",
        throwOnError: false,
      });
      if (/\bkatex-error\b/i.test(html)) {
        katexErrorCount += 1;
        status = "katex_error";
        reason = "katex_error_markup";
        if (katexErrorSamples.length < 3) {
          katexErrorSamples.push(clipText(token.text, 120));
        }
      }
    } catch {
      katexErrorCount += 1;
      status = "katex_error";
      reason = "katex_exception";
      if (katexErrorSamples.length < 3) {
        katexErrorSamples.push(clipText(token.text, 120));
      }
    }
    if (tokenStatuses.length < 64) {
      tokenStatuses.push({
        tokenText: clipText(token.text, 180),
        status,
        displayMode: token.displayMode,
        openDelimiter: token.openDelimiter || null,
        closeDelimiter: token.closeDelimiter || null,
        reason,
      });
    }
  }
  for (const detail of bareIgnoredDetails) {
    if (tokenStatuses.length >= 64) break;
    tokenStatuses.push({
      tokenText: detail.candidate,
      status: "ignored_reason",
      displayMode: null,
      openDelimiter: null,
      closeDelimiter: null,
      reason: detail.reason,
    });
  }
  return {
    sourceChars: text.length,
    tokenCount: tokens.length,
    mathTokenCount: mathTokens.length,
    delimiterMathCount: mathTokens.filter((token) => token.openDelimiter || token.closeDelimiter).length,
    bareMathCount: mathTokens.filter((token) => !token.openDelimiter && !token.closeDelimiter).length,
    katexErrorCount,
    bareCandidateCount,
    bareAcceptedCount,
    bareIgnoredCount,
    katexErrorSamples,
    bareIgnoredSamples,
    tokenStatuses,
  };
}
