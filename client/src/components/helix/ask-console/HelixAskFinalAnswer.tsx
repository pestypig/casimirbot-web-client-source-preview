import React, { type ReactNode } from "react";
import { renderToString as renderKatexToString } from "katex";
import "katex/dist/katex.min.css";
import { Lexer, type Token, type Tokens } from "marked";

import {
  parseHelixAskFinalAnswerBulletLine,
  splitHelixAskInlineCodeTextSegments,
  tokenizeHelixAskMathTokens,
} from "@/lib/helix/ask-answer-rendering";
import type {
  ReadAloudRegionTrafficRegion,
  ReadAloudRegionTrafficState,
} from "@/lib/helix/ask-read-aloud-display";

import { HelixAskMathHtmlSurface } from "./HelixAskMathHtmlSurface";
import { HelixAskMermaidBlock } from "./HelixAskMermaidBlock";
import { HelixAskRenderedContentSurface } from "./HelixAskRenderedContentSurface";

export type HelixAskFinalAnswerTextSegment = {
  key: string;
  text: string;
};

export type HelixAskFinalAnswerTableCell = {
  key: string;
  text: string;
};

export type HelixAskFinalAnswerBlock =
  | {
      kind: "blank";
      key: string;
    }
  | {
      kind: "code";
      key: string;
      language: string | null;
      text: string;
    }
  | {
      kind: "bullet";
      key: string;
      text: string;
      segments: HelixAskFinalAnswerTextSegment[];
    }
  | {
      kind: "heading";
      key: string;
      level: number;
      text: string;
      segments: HelixAskFinalAnswerTextSegment[];
    }
  | {
      kind: "table";
      key: string;
      align: Array<"left" | "center" | "right" | null>;
      header: HelixAskFinalAnswerTableCell[];
      rows: HelixAskFinalAnswerTableCell[][];
    }
  | {
      kind: "line";
      key: string;
      text: string;
      segments: HelixAskFinalAnswerTextSegment[];
      isSectionHeader: boolean;
    };

export type HelixAskFinalAnswerProps = {
  text: string;
  meta?: string | null;
  renderContent?: (text: string) => ReactNode;
  readAloudTraffic?: ReadAloudRegionTrafficState | null;
};

function coerceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

function buildHelixAskFinalAnswerTextSegments(keyPrefix: string, text: string): HelixAskFinalAnswerTextSegment[] {
  const normalized = text.trim();
  if (!normalized) return [];
  // Keep punctuation that is not followed by whitespace (for example decimal
  // points in `alpha = 0.7`) inside the sentence. The prior negated-character
  // matcher could restart after each decimal point and silently discard every
  // preceding character from the rendered answer.
  const sentenceMatches = normalized.match(/.+?(?:[.!?]+(?=\s|$)|$)/g) ?? [normalized];
  const segments = sentenceMatches
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment, index) => ({
      key: `${keyPrefix}-segment-${index}`,
      text: segment,
    }));
  return segments.length > 0 ? segments : [{ key: `${keyPrefix}-segment-0`, text: normalized }];
}

function parseHelixAskFinalAnswerCodeFence(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("```")) return null;
  const language = trimmed.replace(/^```/, "").trim();
  return language || "";
}

function parseHelixAskMarkdownTableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;
  const content = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of content) {
    if (character === "|" && !escaped) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += character;
    escaped = character === "\\" && !escaped;
    if (character !== "\\") escaped = false;
  }
  cells.push(cell.trim());
  return cells.length >= 2 ? cells : null;
}

function parseHelixAskMarkdownTableAlignment(
  cells: readonly string[],
): Array<"left" | "center" | "right" | null> | null {
  if (cells.length < 2) return null;
  const align: Array<"left" | "center" | "right" | null> = [];
  for (const cell of cells) {
    const compact = cell.replace(/\s+/g, "");
    if (!/^:?-{3,}:?$/.test(compact)) return null;
    align.push(
      compact.startsWith(":") && compact.endsWith(":")
        ? "center"
        : compact.endsWith(":")
          ? "right"
          : compact.startsWith(":")
            ? "left"
            : null,
    );
  }
  return align;
}

function buildHelixAskFinalAnswerTableCells(
  keyPrefix: string,
  cells: readonly string[],
  width: number,
): HelixAskFinalAnswerTableCell[] {
  return Array.from({ length: width }, (_, index) => ({
    key: `${keyPrefix}-cell-${index}`,
    text: cells[index] ?? "",
  }));
}

function parseHelixAskDisplayMathFence(line: string): {
  closingMarkers: readonly string[];
  requiresMathHeuristic: boolean;
} | null {
  const trimmed = line.trim();
  if (trimmed === "$$") {
    return { closingMarkers: ["$$"], requiresMathHeuristic: false };
  }
  if (trimmed === "\\[") {
    return { closingMarkers: ["\\]", "]"], requiresMathHeuristic: false };
  }
  if (trimmed === "[") {
    return { closingMarkers: ["]", "\\]"], requiresMathHeuristic: true };
  }
  return null;
}

function isLikelyHelixAskStandaloneBracketMath(body: string): boolean {
  const compact = body.trim();
  if (!compact || compact.length > 20_000) return false;
  const hasRelation = /(?:^|\s)(?:=|<|>|≤|≥|≈|≃|∝)(?:\s|$)/m.test(compact);
  const hasLatexOrIndexedNotation = /\\[A-Za-z]+|[_^]\s*\{|[∑∫√]/.test(compact);
  return hasRelation && hasLatexOrIndexedNotation;
}

export function buildHelixAskFinalAnswerBlocks(content: unknown): HelixAskFinalAnswerBlock[] {
  const text = coerceText(content);
  if (!text) return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: HelixAskFinalAnswerBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const codeLanguage = parseHelixAskFinalAnswerCodeFence(line);
    if (codeLanguage !== null) {
      const codeLines: string[] = [];
      let closingIndex = index;
      for (let codeIndex = index + 1; codeIndex < lines.length; codeIndex += 1) {
        const codeLine = lines[codeIndex] ?? "";
        if (parseHelixAskFinalAnswerCodeFence(codeLine) !== null) {
          closingIndex = codeIndex;
          break;
        }
        codeLines.push(codeLine);
        closingIndex = codeIndex;
      }
      blocks.push({
        kind: "code",
        key: `final-answer-code-${index}`,
        language: codeLanguage || null,
        text: codeLines.join("\n"),
      });
      index = closingIndex;
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      blocks.push({
        kind: "blank",
        key: `final-answer-blank-${index}`,
      });
      continue;
    }
    const displayMathFence = parseHelixAskDisplayMathFence(line);
    if (displayMathFence) {
      const mathLines: string[] = [];
      let closingIndex = -1;
      const maxClosingIndex = Math.min(lines.length - 1, index + 80);
      for (let mathIndex = index + 1; mathIndex <= maxClosingIndex; mathIndex += 1) {
        const mathLine = lines[mathIndex] ?? "";
        if (displayMathFence.closingMarkers.includes(mathLine.trim())) {
          closingIndex = mathIndex;
          break;
        }
        mathLines.push(mathLine);
      }
      const mathBody = mathLines.join("\n").trim();
      if (
        closingIndex > index &&
        mathBody &&
        (!displayMathFence.requiresMathHeuristic || isLikelyHelixAskStandaloneBracketMath(mathBody))
      ) {
        blocks.push({
          kind: "code",
          key: `final-answer-display-math-${index}`,
          language: "math",
          text: mathBody,
        });
        index = closingIndex;
        continue;
      }
    }
    const tableHeaderCells = parseHelixAskMarkdownTableCells(line);
    const tableDelimiterCells = parseHelixAskMarkdownTableCells(lines[index + 1] ?? "");
    const tableAlignment = tableDelimiterCells
      ? parseHelixAskMarkdownTableAlignment(tableDelimiterCells)
      : null;
    if (
      tableHeaderCells &&
      tableAlignment &&
      tableHeaderCells.length === tableAlignment.length
    ) {
      const key = `final-answer-table-${index}`;
      const rows: HelixAskFinalAnswerTableCell[][] = [];
      let lastTableIndex = index + 1;
      for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
        const rowCells = parseHelixAskMarkdownTableCells(lines[rowIndex] ?? "");
        if (!rowCells) break;
        rows.push(buildHelixAskFinalAnswerTableCells(`${key}-row-${rows.length}`, rowCells, tableHeaderCells.length));
        lastTableIndex = rowIndex;
      }
      blocks.push({
        kind: "table",
        key,
        align: tableAlignment,
        header: buildHelixAskFinalAnswerTableCells(`${key}-header`, tableHeaderCells, tableHeaderCells.length),
        rows,
      });
      index = lastTableIndex;
      continue;
    }
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    if (headingMatch?.[1] && headingMatch[2]) {
      const key = `final-answer-heading-${index}`;
      const headingText = headingMatch[2].trim();
      blocks.push({
        kind: "heading",
        key,
        level: headingMatch[1].length,
        text: headingText,
        segments: buildHelixAskFinalAnswerTextSegments(key, headingText),
      });
      continue;
    }
    const bulletText = /^[-*]\s+/.test(trimmed)
      ? parseHelixAskFinalAnswerBulletLine(trimmed)
      : null;
    if (bulletText) {
      const key = `final-answer-bullet-${index}`;
      blocks.push({
        kind: "bullet",
        key,
        text: bulletText,
        segments: buildHelixAskFinalAnswerTextSegments(key, bulletText),
      });
      continue;
    }
    const key = `final-answer-line-${index}`;
    blocks.push({
      kind: "line",
      key,
      text: trimmed,
      segments: buildHelixAskFinalAnswerTextSegments(key, trimmed),
      isSectionHeader: /:$/.test(trimmed) && trimmed.length <= 80,
    });
  }
  return blocks;
}

function normalizeReadAloudMatchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function collectHelixAskFinalAnswerReadAloudTargets(blocks: readonly HelixAskFinalAnswerBlock[]): Array<{
  key: string;
  text: string;
  normalizedText: string;
  isSegment: boolean;
}> {
  const targets: Array<{
    key: string;
    text: string;
    normalizedText: string;
    isSegment: boolean;
  }> = [];
  for (const block of blocks) {
    if (block.kind !== "line" && block.kind !== "bullet" && block.kind !== "heading") continue;
    for (const segment of block.segments) {
      const normalizedText = normalizeReadAloudMatchText(segment.text);
      if (normalizedText) {
        targets.push({
          key: segment.key,
          text: segment.text,
          normalizedText,
          isSegment: true,
        });
      }
    }
    const normalizedText = normalizeReadAloudMatchText(block.text);
    if (normalizedText) {
      targets.push({
        key: block.key,
        text: block.text,
        normalizedText,
        isSegment: false,
      });
    }
  }
  return targets;
}

export function resolveHelixAskFinalAnswerReadAloudBlockKey(
  blocks: readonly HelixAskFinalAnswerBlock[],
  state?: ReadAloudRegionTrafficRegion | null,
): string | null {
  return resolveHelixAskFinalAnswerReadAloudBlockKeys(blocks, state)[0] ?? null;
}

export function resolveHelixAskFinalAnswerReadAloudBlockKeys(
  blocks: readonly HelixAskFinalAnswerBlock[],
  state?: ReadAloudRegionTrafficRegion | null,
): string[] {
  if (!state?.active) return [];
  const chunkText = normalizeReadAloudMatchText(state.chunkText ?? "");
  const targets = collectHelixAskFinalAnswerReadAloudTargets(blocks);
  if (chunkText) {
    const exactSegmentMatch = targets.find((target) => target.isSegment && target.normalizedText === chunkText);
    if (exactSegmentMatch) return [exactSegmentMatch.key];
    const segmentTargetsInChunk = targets
      .filter((target) => target.isSegment && chunkText.includes(target.normalizedText))
      .map((target) => target.key);
    if (segmentTargetsInChunk.length > 0) return segmentTargetsInChunk;
    const exactMatch = targets.find((target) => target.normalizedText === chunkText);
    if (exactMatch) return [exactMatch.key];
    const containingMatches = targets
      .filter((target) => target.normalizedText.includes(chunkText))
      .sort((left, right) => {
        if (left.isSegment !== right.isSegment) return left.isSegment ? -1 : 1;
        return left.normalizedText.length - right.normalizedText.length;
      });
    if (containingMatches[0]) return [containingMatches[0].key];
  }
  if (typeof state.chunkIndex === "number" && state.chunkIndex >= 0) {
    const segmentTargets = targets.filter((target) => target.isSegment);
    return segmentTargets[state.chunkIndex]?.key ? [segmentTargets[state.chunkIndex].key] : [];
  }
  if (
    state.phase === "loading" ||
    state.phase === "resuming"
  ) {
    const firstTarget = targets.find((target) => target.isSegment)?.key ?? targets[0]?.key ?? null;
    return firstTarget ? [firstTarget] : [];
  }
  return [];
}

function renderHelixAskMarkedInlineTokens(
  tokens: readonly Token[],
  renderText: (value: string) => ReactNode,
  keyPrefix: string,
): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${token.type}-${index}`;
    if (token.type === "codespan") {
      return (
        <code
          key={key}
          className="rounded border border-cyan-300/20 bg-slate-950/75 px-1 py-0.5 font-mono text-[0.92em] text-cyan-100"
        >
          {(token as Tokens.Codespan).text}
        </code>
      );
    }
    if (token.type === "strong") {
      return (
        <strong key={key} className="font-semibold text-slate-50">
          {renderHelixAskMarkedInlineTokens((token as Tokens.Strong).tokens, renderText, key)}
        </strong>
      );
    }
    if (token.type === "em") {
      return (
        <em key={key} className="italic text-slate-100">
          {renderHelixAskMarkedInlineTokens((token as Tokens.Em).tokens, renderText, key)}
        </em>
      );
    }
    if (token.type === "del") {
      return (
        <del key={key} className="text-slate-300/80">
          {renderHelixAskMarkedInlineTokens((token as Tokens.Del).tokens, renderText, key)}
        </del>
      );
    }
    if (token.type === "br") return <br key={key} />;
    if (token.type === "link") {
      const link = token as Tokens.Link;
      const children = renderHelixAskMarkedInlineTokens(link.tokens, renderText, key);
      const safeHref = /^(?:https?:|mailto:)/i.test(link.href.trim()) ? link.href : null;
      return safeHref ? (
        <a
          key={key}
          href={safeHref}
          target={/^https?:/i.test(safeHref) ? "_blank" : undefined}
          rel={/^https?:/i.test(safeHref) ? "noreferrer noopener" : undefined}
          className="text-cyan-200 underline decoration-cyan-300/45 underline-offset-2 hover:text-cyan-100"
        >
          {children}
        </a>
      ) : (
        <React.Fragment key={key}>{children}</React.Fragment>
      );
    }
    if (token.type === "text" || token.type === "escape") {
      return (
        <React.Fragment key={key}>
          {renderText((token as Tokens.Text | Tokens.Escape).text)}
        </React.Fragment>
      );
    }
    const nestedTokens = "tokens" in token && Array.isArray(token.tokens)
      ? token.tokens as Token[]
      : null;
    if (nestedTokens?.length) {
      return (
        <React.Fragment key={key}>
          {renderHelixAskMarkedInlineTokens(nestedTokens, renderText, key)}
        </React.Fragment>
      );
    }
    return <React.Fragment key={key}>{renderText(token.raw)}</React.Fragment>;
  });
}

function renderHelixAskInlineMarkdownText(
  text: string,
  renderText: (value: string) => ReactNode,
): ReactNode {
  const inlineCodeSegments = splitHelixAskInlineCodeTextSegments(text);
  return inlineCodeSegments.map((segment, segmentIndex) => {
    if (segment.kind === "inline_code") {
      return (
        <code
          key={`inline-code-${segment.start}`}
          className="rounded border border-cyan-300/20 bg-slate-950/75 px-1 py-0.5 font-mono text-[0.92em] text-cyan-100"
        >
          {segment.text}
        </code>
      );
    }
    const mathTokens = tokenizeHelixAskMathTokens(segment.text);
    return mathTokens.map((mathToken, mathIndex) => {
      const key = `inline-segment-${segmentIndex}-math-${mathIndex}`;
      if (mathToken.kind === "math") {
        return (
          <React.Fragment key={key}>
            {renderText(`${mathToken.openDelimiter}${mathToken.text}${mathToken.closeDelimiter}`)}
          </React.Fragment>
        );
      }
      const markedTokens = Lexer.lexInline(mathToken.text, { gfm: true, breaks: true });
      return (
        <React.Fragment key={key}>
          {renderHelixAskMarkedInlineTokens(markedTokens, renderText, key)}
        </React.Fragment>
      );
    });
  });
}

function isHelixAskLatexCodeBlockLanguage(language: string | null): boolean {
  return /^(?:latex|tex|math)$/i.test(language?.trim() ?? "");
}

export function isHelixAskMermaidCodeBlockLanguage(language: string | null): boolean {
  return /^mermaid$/i.test(language?.trim() ?? "");
}

function renderHelixAskFinalAnswerCodeBlock(block: Extract<HelixAskFinalAnswerBlock, { kind: "code" }>) {
  if (isHelixAskLatexCodeBlockLanguage(block.language)) {
    try {
      const katexHtml = renderKatexToString(block.text, {
        displayMode: true,
        strict: "ignore",
        throwOnError: false,
      });
      return (
        <div
          key={block.key}
          className="rounded-md border border-cyan-300/20 bg-slate-950/80"
          data-testid="helix-ask-final-answer-code-block"
          data-code-language={block.language ?? undefined}
          data-code-renderer="katex"
        >
          <div className="border-b border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/80">
            {block.language}
          </div>
          <div className="px-3 py-3">
            <HelixAskMathHtmlSurface html={katexHtml} displayMode />
          </div>
        </div>
      );
    } catch {
      // Fall back to the raw code surface below; the final answer remains readable.
    }
  }
  if (isHelixAskMermaidCodeBlockLanguage(block.language)) {
    return <HelixAskMermaidBlock key={block.key} source={block.text} />;
  }
  return (
    <div
      key={block.key}
      className="rounded-md border border-cyan-300/20 bg-slate-950/80"
      data-testid="helix-ask-final-answer-code-block"
      data-code-language={block.language ?? undefined}
      data-code-renderer="raw"
    >
      {block.language ? (
        <div className="border-b border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/80">
          {block.language}
        </div>
      ) : null}
      <pre className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-relaxed text-slate-100 [overflow-wrap:anywhere]">
        <code>{block.text}</code>
      </pre>
    </div>
  );
}

function helixAskHeadingClass(level: number): string {
  if (level === 1) return "break-words pb-1 pt-3 text-xl font-semibold tracking-tight text-cyan-50 [overflow-wrap:anywhere]";
  if (level === 2) return "break-words pb-0.5 pt-2.5 text-lg font-semibold tracking-tight text-cyan-50 [overflow-wrap:anywhere]";
  if (level === 3) return "break-words pt-2 text-base font-semibold text-cyan-100 [overflow-wrap:anywhere]";
  return "break-words pt-1 text-sm font-semibold text-cyan-100 [overflow-wrap:anywhere]";
}

function helixAskTableAlignClass(align: "left" | "center" | "right" | null): string {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "text-left";
}

function HelixAskReadAloudBlockReticle({
  state,
  children,
}: {
  state: ReadAloudRegionTrafficRegion;
  children: ReactNode;
}) {
  const toneClass =
    state.phase === "loading" || state.phase === "resuming"
      ? "border-sky-200/90 bg-sky-300/[0.04] text-sky-100 shadow-[0_0_0_1px_rgba(14,165,233,0.22),0_0_22px_rgba(56,189,248,0.14)]"
      : state.phase === "preloading"
        ? "border-violet-200/85 bg-violet-300/[0.035] text-violet-100 shadow-[0_0_0_1px_rgba(139,92,246,0.2),0_0_20px_rgba(167,139,250,0.13)]"
      : state.phase === "paused"
        ? "border-amber-200/85 bg-amber-300/[0.035] text-amber-100 shadow-[0_0_0_1px_rgba(245,158,11,0.18),0_0_20px_rgba(251,191,36,0.12)]"
        : "border-cyan-200/90 bg-cyan-300/[0.04] text-cyan-100 shadow-[0_0_0_1px_rgba(8,145,178,0.25),0_0_24px_rgba(34,211,238,0.18)]";
  return (
    <div
      className={`relative rounded-[6px] border-2 border-dotted px-2.5 py-2 ${toneClass}`}
      data-testid="helix-ask-read-aloud-region-reticle"
      data-helix-read-aloud-region-state={state.phase}
      data-helix-read-aloud-chunk-index={state.chunkIndex ?? undefined}
      data-helix-read-aloud-chunk-count={state.chunkCount ?? undefined}
      aria-label={state.detail ? `${state.label}, ${state.detail}` : state.label}
    >
      <div className="pointer-events-none absolute right-2 top-1 flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]">
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        <span>{state.detail ?? state.label}</span>
      </div>
      <div className="pt-3">{children}</div>
    </div>
  );
}

function HelixAskReadAloudInlineReticle({
  state,
  children,
}: {
  state: ReadAloudRegionTrafficRegion;
  children: ReactNode;
}) {
  const toneClass =
    state.phase === "loading" || state.phase === "resuming"
      ? "border-sky-200/90 bg-sky-300/[0.04] text-sky-50 shadow-[0_0_0_1px_rgba(14,165,233,0.18),0_0_18px_rgba(56,189,248,0.1)]"
      : state.phase === "preloading"
        ? "border-violet-200/85 bg-violet-300/[0.035] text-violet-50 shadow-[0_0_0_1px_rgba(139,92,246,0.16),0_0_16px_rgba(167,139,250,0.1)]"
      : state.phase === "paused"
        ? "border-amber-200/85 bg-amber-300/[0.035] text-amber-50 shadow-[0_0_0_1px_rgba(245,158,11,0.16),0_0_16px_rgba(251,191,36,0.1)]"
        : "border-cyan-200/90 bg-cyan-300/[0.04] text-cyan-50 shadow-[0_0_0_1px_rgba(8,145,178,0.18),0_0_18px_rgba(34,211,238,0.12)]";
  return (
    <span
      className={`mx-[-0.08rem] inline rounded-[5px] border-2 border-dotted px-1 py-0.5 ${toneClass}`}
      data-testid="helix-ask-read-aloud-region-reticle"
      data-helix-read-aloud-region-state={state.phase}
      data-helix-read-aloud-chunk-index={state.chunkIndex ?? undefined}
      data-helix-read-aloud-chunk-count={state.chunkCount ?? undefined}
      aria-label={state.detail ? `${state.label}, ${state.detail}` : state.label}
      title={state.detail ? `${state.label}, ${state.detail}` : state.label}
    >
      {children}
    </span>
  );
}

export function HelixAskFinalAnswer({ text, meta, renderContent, readAloudTraffic }: HelixAskFinalAnswerProps) {
  const blocks = buildHelixAskFinalAnswerBlocks(text);
  const renderText = renderContent ?? ((value: string) => (
    <HelixAskRenderedContentSurface
      content={value}
      renderTextWithPathLinks={(plainText) => plainText}
    />
  ));
  const readAloudRegions = readAloudTraffic?.regions?.length
    ? readAloudTraffic.regions
    : readAloudTraffic?.active
      ? [readAloudTraffic]
      : [];
  const reticleRegions = readAloudRegions
    .flatMap((region) =>
      resolveHelixAskFinalAnswerReadAloudBlockKeys(blocks, region).map((blockKey) => ({
        region,
        blockKey,
      })),
    )
    .filter((entry) => entry.region.active);
  const resolvedReticleRegions = reticleRegions.filter(
    (entry): entry is { region: ReadAloudRegionTrafficRegion; blockKey: string } =>
      Boolean(entry.blockKey),
  );
  const shouldWrapWholeAnswerForUnresolvedReadAloud =
    Boolean(readAloudTraffic?.active) &&
    resolvedReticleRegions.length === 0 &&
    (readAloudTraffic?.phase === "loading" || readAloudTraffic?.phase === "resuming");
  const renderBlockWithReticle = (key: string, node: ReactNode) => {
    const matchingRegions = resolvedReticleRegions.filter((entry) => entry.blockKey === key);
    if (matchingRegions.length === 0) return node;
    return matchingRegions.reduceRight<ReactNode>(
      (child, entry) => (
        <HelixAskReadAloudBlockReticle
          key={`${key}:${entry.region.phase}:${entry.region.chunkIndex ?? "unknown"}`}
          state={entry.region}
        >
          {child}
        </HelixAskReadAloudBlockReticle>
      ),
      node,
    );
  };
  const renderSegmentWithReticle = (key: string, node: ReactNode) => {
    const matchingRegions = resolvedReticleRegions.filter((entry) => entry.blockKey === key);
    if (matchingRegions.length === 0) return node;
    return matchingRegions.reduceRight<ReactNode>(
      (child, entry) => (
        <HelixAskReadAloudInlineReticle
          key={`${key}:${entry.region.phase}:${entry.region.chunkIndex ?? "unknown"}`}
          state={entry.region}
        >
          {child}
        </HelixAskReadAloudInlineReticle>
      ),
      node,
    );
  };
  const renderTextSegments = (segments: readonly HelixAskFinalAnswerTextSegment[]) =>
    segments.map((segment, index) => (
      <React.Fragment key={segment.key}>
        {index > 0 ? " " : null}
        {renderSegmentWithReticle(segment.key, renderHelixAskInlineMarkdownText(segment.text, renderText))}
      </React.Fragment>
    ));
  const answerBody = (
    <div className="mt-2 space-y-1.5 whitespace-normal break-words [overflow-wrap:anywhere] leading-relaxed text-sm text-slate-100">
      {blocks.map((block) => {
        if (block.kind === "blank") {
          return <div key={block.key} className="h-2" aria-hidden="true" />;
        }
        if (block.kind === "code") {
          return renderHelixAskFinalAnswerCodeBlock(block);
        }
        if (block.kind === "table") {
          return renderBlockWithReticle(block.key, (
            <div
              key={block.key}
              className="my-2 overflow-x-auto rounded-md border border-cyan-300/20 bg-slate-950/50"
              data-testid="helix-ask-final-answer-table"
            >
              <table className="w-full min-w-[36rem] border-collapse text-left text-xs leading-relaxed text-slate-100">
                <thead className="bg-cyan-950/45 text-cyan-50">
                  <tr>
                    {block.header.map((cell, columnIndex) => (
                      <th
                        key={cell.key}
                        scope="col"
                        className={`border-b border-r border-cyan-300/15 px-3 py-2 font-semibold last:border-r-0 ${helixAskTableAlignClass(block.align[columnIndex] ?? null)}`}
                      >
                        {renderHelixAskInlineMarkdownText(cell.text, renderText)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${block.key}-visible-row-${rowIndex}`} className="border-b border-white/10 last:border-b-0">
                      {row.map((cell, columnIndex) => (
                        <td
                          key={cell.key}
                          className={`border-r border-white/10 px-3 py-2 align-top last:border-r-0 ${helixAskTableAlignClass(block.align[columnIndex] ?? null)}`}
                        >
                          {renderHelixAskInlineMarkdownText(cell.text, renderText)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ));
        }
        if (block.kind === "heading") {
          const headingTag = `h${Math.min(6, Math.max(1, block.level))}` as keyof React.JSX.IntrinsicElements;
          return renderBlockWithReticle(block.key, React.createElement(
            headingTag,
            {
              key: block.key,
              className: helixAskHeadingClass(block.level),
              "data-testid": "helix-ask-final-answer-heading",
              "data-heading-level": block.level,
              "data-narrator-source-id": `helix-${block.key}`,
            },
            renderTextSegments(block.segments),
          ));
        }
        if (block.kind === "bullet") {
          return renderBlockWithReticle(block.key, (
            <div key={block.key} className="flex gap-2 pl-2">
              <span className="mt-[0.15rem] text-cyan-300/80" aria-hidden="true">
                -
              </span>
              <span
                className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]"
                data-narrator-source-id={`helix-${block.key}`}
              >
                {renderTextSegments(block.segments)}
              </span>
            </div>
          ));
        }
        return renderBlockWithReticle(block.key, (
          <div
            key={block.key}
            className={
              block.isSectionHeader
                ? "break-words pt-1 [overflow-wrap:anywhere] text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100"
                : "break-words [overflow-wrap:anywhere]"
            }
            data-narrator-source-id={`helix-${block.key}`}
          >
            {renderTextSegments(block.segments)}
          </div>
        ));
      })}
    </div>
  );
  return (
    <section className="space-y-2" data-testid="helix-ask-console-final-answer">
      {shouldWrapWholeAnswerForUnresolvedReadAloud && readAloudTraffic ? (
        <HelixAskReadAloudBlockReticle state={readAloudTraffic}>
          {answerBody}
        </HelixAskReadAloudBlockReticle>
      ) : answerBody}
      {meta ? (
        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">{meta}</p>
      ) : null}
    </section>
  );
}
