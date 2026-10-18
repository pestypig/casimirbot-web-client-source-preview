import { useEffect, useRef } from "react";
import { speakVoice } from "@/lib/agi/api";
import {
  NarratorPlaybackError,
  createNarratorPlaybackLockedDiagnostic,
  installNarratorAudioUnlockGestureListeners,
  isNarratorAudioPlaybackUnlocked,
  playNarratorVoiceResponse,
  primeNarratorAudioPlayback,
} from "@/lib/narrator/narratorAudioPlayback";
import { buildNarratorVoiceSpeakPayload } from "@/lib/narrator/narratorVoiceBridge";
import { useNarratorStore } from "@/store/useNarratorStore";
import type { NarratorReadRegionRect } from "@/store/useNarratorStore";

export type HoverFocusNarratorPoint = {
  x: number;
  y: number;
};

export type HoverFocusNarratorInspection = {
  sourceId: string;
  text: string;
  dedupeKey: string;
  region: NarratorReadRegionRect;
};

const INSPECTOR_SOURCE_KIND = "hover_focus_inspector" as const;
const DEFAULT_HOVER_DELAY_MS = 120;
const DEFAULT_CHUNK_MAX_CHARS = 90;
const MIN_PHRASE_CHUNK_CHARS = 36;
const HOVER_VOICE_TIMEOUT_MS = 6500;
const TEXT_NODE = 3;
const TEXT_NODE_FILTER = 4;
const SENTENCE_PATTERN = /[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g;

const PRIMARY_MEANINGFUL_SELECTOR = [
  "[data-narrator-label]",
  "[data-narrator-description]",
  "[data-narrator-source-id]",
  "[title]",
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "label",
  "img",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='option']",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
  "summary",
  "figcaption",
  "blockquote",
  "td",
  "th",
  "dt",
  "dd",
].join(",");

const CONTAINER_MEANINGFUL_SELECTOR = [
  "article",
  "section",
  "[role='article']",
  "[role='document']",
  "[role='main']",
  "[role='region']",
].join(",");

const READABLE_TEXT_LEAF_TAGS = new Set(["DIV", "SPAN", "PRE", "CODE", "STRONG", "EM", "SMALL"]);
const READABLE_TEXT_LEAF_MAX_CHARS = 900;
const READABLE_TEXT_LEAF_MAX_ANCESTORS = 6;

function cleanNarratorText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isElementVisible(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view || !(element instanceof view.HTMLElement)) return true;
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  const style = view.getComputedStyle(element);
  if (style?.display === "none" || style?.visibility === "hidden") return false;
  return true;
}

function isSensitiveElement(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  if (!(element instanceof view.HTMLInputElement || element instanceof view.HTMLTextAreaElement)) return false;
  return element instanceof view.HTMLInputElement && element.type.toLowerCase() === "password";
}

function ariaDescribedByText(element: Element): string | null {
  const ids = cleanNarratorText(element.getAttribute("aria-describedby"));
  if (!ids) return null;
  const text = ids
    .split(/\s+/)
    .map((id) => cleanNarratorText(element.ownerDocument.getElementById(id)?.textContent))
    .filter(Boolean)
    .join(" ");
  return text || null;
}

function ariaLabelledByText(element: Element): string | null {
  const ids = cleanNarratorText(element.getAttribute("aria-labelledby"));
  if (!ids) return null;
  const text = ids
    .split(/\s+/)
    .map((id) => cleanNarratorText(element.ownerDocument.getElementById(id)?.textContent))
    .filter(Boolean)
    .join(" ");
  return text || null;
}

function elementAccessibleText(element: Element): string | null {
  const view = element.ownerDocument.defaultView;
  if (isSensitiveElement(element)) return null;
  if (element.getAttribute("data-narrator-ignore") === "true") return null;
  const explicit = [
    element.getAttribute("data-narrator-label"),
    element.getAttribute("data-narrator-description"),
    element.getAttribute("aria-label"),
    ariaLabelledByText(element),
    ariaDescribedByText(element),
    element.getAttribute("title"),
    view && element instanceof view.HTMLImageElement ? element.alt : null,
    view && (element instanceof view.HTMLInputElement || element instanceof view.HTMLTextAreaElement)
      ? element.placeholder
      : null,
    view && element instanceof view.HTMLSelectElement
      ? element.selectedOptions.item(0)?.textContent
      : null,
  ]
    .map(cleanNarratorText)
    .find(Boolean);
  if (explicit) return explicit;

  return cleanNarratorText(element.textContent);
}

function isBroadRoleContainer(element: Element): boolean {
  const role = cleanNarratorText(element.getAttribute("role")).toLowerCase();
  return ["article", "document", "group", "list", "main", "none", "presentation", "region"].includes(role);
}

function isReadableTextLeaf(element: Element): boolean {
  if (!READABLE_TEXT_LEAF_TAGS.has(element.tagName)) return false;
  if (element.matches(CONTAINER_MEANINGFUL_SELECTOR) || isBroadRoleContainer(element)) return false;
  if (element.closest("[data-narrator-ignore='true']")) return false;
  if (!isElementVisible(element)) return false;
  const text = cleanNarratorText(element.textContent);
  if (text.length < 2 || text.length > READABLE_TEXT_LEAF_MAX_CHARS) return false;
  const meaningfulDescendant = element.querySelector(PRIMARY_MEANINGFUL_SELECTOR);
  return !meaningfulDescendant;
}

function findReadableTextLeaf(target: Element): Element | null {
  let current: Element | null = target;
  let depth = 0;
  while (current && depth < READABLE_TEXT_LEAF_MAX_ANCESTORS) {
    if (current === current.ownerDocument.body || current === current.ownerDocument.documentElement) return null;
    if (isReadableTextLeaf(current)) return current;
    if (current.matches(CONTAINER_MEANINGFUL_SELECTOR) || isBroadRoleContainer(current)) return null;
    current = current.parentElement;
    depth += 1;
  }
  return null;
}

function findMeaningfulElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  const candidate =
    target.closest(PRIMARY_MEANINGFUL_SELECTOR) ??
    findReadableTextLeaf(target) ??
    target.closest(CONTAINER_MEANINGFUL_SELECTOR);
  if (!candidate || candidate.closest("[data-narrator-ignore='true']")) return null;
  if (!isElementVisible(candidate)) return null;
  return candidate;
}

type NarratorSentenceSpan = {
  text: string;
  start: number;
  end: number;
  activeEnd: number;
};

function findNarratorPhraseCut(text: string, maxChars: number): { cut: number; skipChars: number } {
  const limit = Math.max(1, Math.min(maxChars, text.length));
  const windowText = text.slice(0, limit);
  const boundaryPatterns = [", ", "; ", ": ", " - ", " -- "];
  let best: { cut: number; skipChars: number } | null = null;
  for (const boundary of boundaryPatterns) {
    const index = windowText.lastIndexOf(boundary);
    if (index >= MIN_PHRASE_CHUNK_CHARS && (!best || index > best.cut)) {
      const keepsPunctuation = boundary === ", " || boundary === "; " || boundary === ": ";
      best = {
        cut: keepsPunctuation ? index + 1 : index,
        skipChars: keepsPunctuation ? 1 : boundary.length,
      };
    }
  }
  if (best) return best;

  const wordBoundary = windowText.lastIndexOf(" ");
  if (wordBoundary >= MIN_PHRASE_CHUNK_CHARS) {
    return { cut: wordBoundary, skipChars: 1 };
  }
  return { cut: limit, skipChars: 0 };
}

function splitNarratorSentenceSpans(text: string, maxChars = DEFAULT_CHUNK_MAX_CHARS): NarratorSentenceSpan[] {
  const cleaned = cleanNarratorText(text);
  if (!cleaned) return [];
  const matches = Array.from(cleaned.matchAll(SENTENCE_PATTERN));
  const spans: NarratorSentenceSpan[] = [];
  for (const match of matches.length ? matches : [{ 0: cleaned, index: 0 } as RegExpMatchArray]) {
    const rawSentence = match[0] ?? "";
    const leadingWhitespace = rawSentence.match(/^\s*/)?.[0].length ?? 0;
    const trailingWhitespace = rawSentence.match(/\s*$/)?.[0].length ?? 0;
    const sentence = cleanNarratorText(rawSentence);
    if (!sentence) continue;
    const start = (match.index ?? 0) + leadingWhitespace;
    const end = Math.max(start, (match.index ?? 0) + rawSentence.length - trailingWhitespace);
    if (sentence.length <= maxChars) {
      spans.push({ text: sentence, start, end, activeEnd: end });
      continue;
    }
    let remaining = sentence;
    let remainingStart = start;
    while (remaining.length > maxChars) {
      const { cut, skipChars } = findNarratorPhraseCut(remaining, maxChars);
      const chunk = cleanNarratorText(remaining.slice(0, cut));
      if (chunk) {
        spans.push({
          text: chunk,
          start: remainingStart,
          end: remainingStart + chunk.length,
          activeEnd: remainingStart + chunk.length,
        });
      }
      remaining = cleanNarratorText(remaining.slice(cut + skipChars));
      remainingStart += cut + skipChars;
    }
    if (remaining) {
      spans.push({ text: remaining, start: remainingStart, end, activeEnd: end });
    }
  }
  return spans.map((span, index) => ({
    ...span,
    activeEnd: spans[index + 1] ? Math.max(span.end, spans[index + 1].start - 1) : span.end,
  }));
}

export function splitNarratorSentences(text: string, maxChars = DEFAULT_CHUNK_MAX_CHARS): string[] {
  return splitNarratorSentenceSpans(text, maxChars).map((span) => span.text);
}

function textOffsetFromPoint(element: Element, point?: HoverFocusNarratorPoint): number | null {
  if (!point) return null;
  const doc = element.ownerDocument;
  const anyDocument = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = anyDocument.caretPositionFromPoint?.(point.x, point.y);
  const node = position?.offsetNode ?? anyDocument.caretRangeFromPoint?.(point.x, point.y)?.startContainer ?? null;
  const offset = position?.offset ?? anyDocument.caretRangeFromPoint?.(point.x, point.y)?.startOffset ?? 0;
  if (!node || node.nodeType !== TEXT_NODE) return null;
  if (!node.parentNode || !element.contains(node.parentNode)) return null;

  let textOffset = 0;
  const walker = doc.createTreeWalker(element, TEXT_NODE_FILTER);
  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (current === node) return textOffset + offset;
    textOffset += current.textContent?.length ?? 0;
  }
  return null;
}

export function pickNarratorSentenceAtOffset(
  text: string,
  offset: number | null,
  maxChars = DEFAULT_CHUNK_MAX_CHARS,
): string | null {
  const spans = splitNarratorSentenceSpans(text, maxChars);
  if (spans.length === 0) return null;
  if (offset === null || offset <= spans[0].start) return spans[0].text;

  for (const span of spans) {
    if (offset >= span.start && offset <= span.activeEnd) return span.text;
  }
  return spans[spans.length - 1].text;
}

function elementSourceId(element: Element, text: string): string {
  const explicit =
    element.getAttribute("data-narrator-source-id") ??
    element.id ??
    element.getAttribute("aria-label") ??
    element.getAttribute("aria-labelledby") ??
    element.getAttribute("role") ??
    element.tagName.toLowerCase();
  return `hover:${cleanNarratorText(explicit).slice(0, 80)}:${text.slice(0, 48)}`;
}

function elementReadRegion(element: Element): NarratorReadRegionRect {
  const rect = element.getBoundingClientRect();
  const viewportWidth = element.ownerDocument.defaultView?.innerWidth ?? window.innerWidth;
  const viewportHeight = element.ownerDocument.defaultView?.innerHeight ?? window.innerHeight;
  const left = Math.max(0, Math.min(rect.left, viewportWidth));
  const top = Math.max(0, Math.min(rect.top, viewportHeight));
  const right = Math.max(left, Math.min(rect.right, viewportWidth));
  const bottom = Math.max(top, Math.min(rect.bottom, viewportHeight));
  return {
    left,
    top,
    width: Math.max(8, right - left),
    height: Math.max(8, bottom - top),
  };
}

export function buildHoverFocusNarratorInspection(
  target: EventTarget | null,
  point?: HoverFocusNarratorPoint,
  maxChars = DEFAULT_CHUNK_MAX_CHARS,
): HoverFocusNarratorInspection | null {
  const element = findMeaningfulElement(target);
  if (!element) return null;
  const sourceText = elementAccessibleText(element);
  if (!sourceText) return null;
  const text = pickNarratorSentenceAtOffset(sourceText, textOffsetFromPoint(element, point), maxChars);
  if (!text) return null;
  const sourceId = elementSourceId(element, text);
  return {
    sourceId,
    text,
    dedupeKey: `${INSPECTOR_SOURCE_KIND}:${sourceId}:${text}`,
    region: elementReadRegion(element),
  };
}

export function useNarratorHoverFocusInspector(options?: {
  hoverDelayMs?: number;
  chunkMaxChars?: number;
}): void {
  const policy = useNarratorStore((state) => state.sourcePolicies.hover_focus_inspector);
  const publishEvent = useNarratorStore((state) => state.publishEvent);
  const markQueued = useNarratorStore((state) => state.markQueued);
  const markSpoken = useNarratorStore((state) => state.markSpoken);
  const markFailed = useNarratorStore((state) => state.markFailed);
  const recordPlaybackDiagnostic = useNarratorStore((state) => state.recordPlaybackDiagnostic);
  const setReadRegion = useNarratorStore((state) => state.setReadRegion);
  const clearReadRegion = useNarratorStore((state) => state.clearReadRegion);
  const timerRef = useRef<number | null>(null);
  const activeRef = useRef<{ key: string; controller: AbortController; eventId: string; seq: number } | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!policy?.enabled) return undefined;
    const removeUnlockListeners = installNarratorAudioUnlockGestureListeners();
    const hoverDelayMs = options?.hoverDelayMs ?? DEFAULT_HOVER_DELAY_MS;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const abortActive = () => {
      if (activeRef.current) {
        activeRef.current.controller.abort();
        markFailed(activeRef.current.eventId);
      }
      activeRef.current = null;
    };
    const isLatestActive = (eventId: string, seq: number, controller: AbortController) =>
      !controller.signal.aborted &&
      activeRef.current?.eventId === eventId &&
      activeRef.current.seq === seq;
    const schedule = (target: EventTarget | null, point?: HoverFocusNarratorPoint) => {
      const inspection = buildHoverFocusNarratorInspection(target, point, options?.chunkMaxChars);
      if (!inspection) {
        clearTimer();
        abortActive();
        clearReadRegion();
        lastKeyRef.current = null;
        return;
      }
      if (inspection.dedupeKey !== lastKeyRef.current) abortActive();
      lastKeyRef.current = inspection.dedupeKey;
      clearTimer();
      const seq = seqRef.current + 1;
      seqRef.current = seq;
      if (policy.deliveryMode === "auto_speak") {
        setReadRegion({
          phase: "hover_pending",
          sourceId: inspection.sourceId,
          textPreview: inspection.text,
          rect: inspection.region,
          pointer: point ?? null,
          startedAtMs: Date.now(),
          durationMs: hoverDelayMs,
        });
      }
      timerRef.current = window.setTimeout(() => {
        if (seq !== seqRef.current) return;
        const event = publishEvent({
          sourceKind: INSPECTOR_SOURCE_KIND,
          sourceId: inspection.sourceId,
          sourceLabelMessageId: "narrator.source.hoverFocusInspector",
          text: inspection.text,
          authority: "inspection_hint",
          assistant_answer: false,
          terminal_eligible: false,
          certainty: "low",
          evidenceRefs: [inspection.sourceId],
          traceId: `narrator:hover_focus:${Date.now()}`,
          rawContentIncluded: false,
          speakable: true,
          requestedDeliveryMode: policy.deliveryMode,
          defaultDeliveryMode: "visible_only",
          dedupeKey: inspection.dedupeKey,
        }, { voiceArmed: policy.deliveryMode === "auto_speak" });
        if (!event || policy.deliveryMode !== "auto_speak") return;

        const controller = new AbortController();
        activeRef.current = { key: inspection.dedupeKey, controller, eventId: event.eventId, seq };
        setReadRegion({
          phase: "voice_loading",
          eventId: event.eventId,
          sourceId: inspection.sourceId,
          textPreview: inspection.text,
          rect: inspection.region,
          pointer: point ?? null,
          startedAtMs: Date.now(),
          durationMs: HOVER_VOICE_TIMEOUT_MS,
        });
        markQueued(event.eventId);
        void (async () => {
          let timedOut = false;
          const timeoutId = window.setTimeout(() => {
            if (!isLatestActive(event.eventId, seq, controller)) return;
            timedOut = true;
            markFailed(event.eventId, createNarratorPlaybackLockedDiagnostic("narrator_hover_voice_timeout"));
            controller.abort();
          }, HOVER_VOICE_TIMEOUT_MS);
          const unlocked = isNarratorAudioPlaybackUnlocked() || await primeNarratorAudioPlayback();
          try {
            if (!isLatestActive(event.eventId, seq, controller)) return;
            if (!unlocked) {
              markFailed(event.eventId, createNarratorPlaybackLockedDiagnostic());
              return;
            }
            const payload = buildNarratorVoiceSpeakPayload({ event, text: inspection.text });
            const response = await speakVoice(payload, { signal: controller.signal });
            if (!isLatestActive(event.eventId, seq, controller)) return;
            setReadRegion({
              phase: "speaking",
              eventId: event.eventId,
              sourceId: inspection.sourceId,
              textPreview: inspection.text,
              rect: inspection.region,
              pointer: point ?? null,
              startedAtMs: Date.now(),
              durationMs: 2200,
            });
            const diagnostic = await playNarratorVoiceResponse(response, {
              signal: controller.signal,
              onDiagnostic: (nextDiagnostic) => {
                if (isLatestActive(event.eventId, seq, controller)) {
                  recordPlaybackDiagnostic(event.eventId, nextDiagnostic);
                }
              },
            });
            if (isLatestActive(event.eventId, seq, controller)) {
              markSpoken(event.eventId, undefined, diagnostic);
            }
          } finally {
            window.clearTimeout(timeoutId);
            if (timedOut && activeRef.current?.eventId === event.eventId) {
              activeRef.current = null;
            }
          }
        })()
          .catch((error) => {
            if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
            if (!isLatestActive(event.eventId, seq, controller)) return;
            markFailed(
              event.eventId,
              error instanceof NarratorPlaybackError ? error.diagnostic : undefined,
            );
          })
          .finally(() => {
            if (activeRef.current?.eventId === event.eventId) activeRef.current = null;
            window.setTimeout(() => clearReadRegion(inspection.sourceId), 260);
          });
      }, hoverDelayMs);
    };

    const onPointerMove = (event: PointerEvent) => {
      schedule(event.target, { x: event.clientX, y: event.clientY });
    };
    const onFocusIn = (event: FocusEvent) => {
      schedule(event.target);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("focusin", onFocusIn, { passive: true });
    return () => {
      clearTimer();
      abortActive();
      clearReadRegion();
      removeUnlockListeners();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("focusin", onFocusIn);
    };
  }, [clearReadRegion, markFailed, markQueued, markSpoken, options?.hoverDelayMs, policy?.deliveryMode, policy?.enabled, publishEvent, recordPlaybackDiagnostic, setReadRegion]);
}
