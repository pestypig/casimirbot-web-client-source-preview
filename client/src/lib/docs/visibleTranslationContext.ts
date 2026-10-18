import type { DocumentTranslationUnit } from "@shared/document-translation";
import { hashDocumentSource } from "@shared/document-translation";
import type { HelixVisibleTranslationTarget } from "@shared/helix-live-translation-lane";
import {
  HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_ACCOUNT_LANGUAGE,
  HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
  HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_HOVER,
  HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_SELECTION,
} from "@shared/helix-live-translation-projection-target";
import type { DocumentInlineTranslationRenderState } from "@/lib/docs/liveTranslationInlineProjection";
import { documentMarkdownSourceId } from "@/lib/docs/documentTranslationClient";

export const HELIX_ACTIVE_DOC_VISIBLE_TRANSLATION_CONTEXT_SCHEMA =
  "helix.ask.active_doc_visible_translation_context.v1" as const;

export const HELIX_ACTIVE_DOC_VISIBLE_TRANSLATION_CONTEXT_CHANGED_EVENT =
  "helix:active-doc-visible-translation-context-changed" as const;

const MAX_VISIBLE_CONTEXT_UNITS = 6;
const MAX_VISIBLE_CONTEXT_CHARS = 5200;
const MAX_VISIBLE_CONTEXT_UNIT_CHARS = 1400;

export type HelixDocViewerDocumentSourceKind = "canonical_docs" | "research_library";

type HelixDocViewerDocumentProvenance = {
  document_source_kind: HelixDocViewerDocumentSourceKind;
  document_ref: string | null;
  private_source: boolean;
};

export type HelixVisibleTranslationRegionBbox = {
  x: number;
  y: number;
  width: number;
  height: number;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  viewport_width?: number;
  viewport_height?: number;
  source?: string;
};

export type HelixActiveDocVisibleTranslationChunk = HelixDocViewerDocumentProvenance & {
  source_kind: "docs_viewer" | "selection" | "hover_region";
  panel_id: "docs-viewer";
  doc_path: string;
  source_id: string;
  source_hash: string;
  source_text_hash: string;
  source_text_char_count: number;
  source_event_id: string;
  source_event_ms: number;
  observed_at_ms: number;
  visible_text: string;
  chunk_id: string;
  chunk_index: number;
  dedupe_key: string;
  region_id: string;
  bbox: HelixVisibleTranslationRegionBbox | null;
  projection_target:
    | typeof HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK
    | typeof HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_HOVER
    | typeof HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_SELECTION;
  existing_observation_ref: string | null;
  existing_receipt_ref: string | null;
  existing_projection_status: HelixVisibleTranslationTarget["existing_projection_status"];
  existing_freshness_status: HelixVisibleTranslationTarget["existing_freshness_status"];
  existing_terminal_authority_status: HelixVisibleTranslationTarget["existing_terminal_authority_status"];
  existing_source_event_ms: HelixVisibleTranslationTarget["existing_source_event_ms"];
  existing_observed_at_ms: HelixVisibleTranslationTarget["existing_observed_at_ms"];
  raw_content_included: false;
  assistant_answer: false;
  terminal_eligible: false;
  answer_authority: false;
  reentry_required: true;
};

export type HelixActiveDocVisibleTranslationUiRegion = HelixDocViewerDocumentProvenance & {
  source_kind: "button_label" | "panel_text";
  panel_id: "docs-viewer";
  doc_path: string;
  source_id: string;
  source_hash: string;
  source_text_hash: string;
  source_text_char_count: number;
  source_event_id: string;
  source_event_ms: number;
  observed_at_ms: number;
  visible_text: string;
  chunk_id: string;
  chunk_index: number;
  dedupe_key: string;
  region_id: string;
  bbox: HelixVisibleTranslationRegionBbox | null;
  projection_target: typeof HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_ACCOUNT_LANGUAGE;
  existing_observation_ref: string | null;
  existing_receipt_ref: string | null;
  existing_projection_status: HelixVisibleTranslationTarget["existing_projection_status"];
  existing_freshness_status: HelixVisibleTranslationTarget["existing_freshness_status"];
  existing_terminal_authority_status: HelixVisibleTranslationTarget["existing_terminal_authority_status"];
  existing_source_event_ms: HelixVisibleTranslationTarget["existing_source_event_ms"];
  existing_observed_at_ms: HelixVisibleTranslationTarget["existing_observed_at_ms"];
  raw_content_included: false;
  assistant_answer: false;
  terminal_eligible: false;
  answer_authority: false;
  reentry_required: true;
};

export type HelixActiveDocVisibleTranslationContext = HelixDocViewerDocumentProvenance & {
  schema: typeof HELIX_ACTIVE_DOC_VISIBLE_TRANSLATION_CONTEXT_SCHEMA;
  source_kind: "docs_viewer";
  panel_id: "docs-viewer";
  doc_path: string;
  title: string | null;
  source_id: string;
  source_hash: string;
  source_text_hash: string;
  source_text_char_count: number;
  chunk_count: number;
  total_unit_count: number;
  translatable_unit_count: number;
  account_locale: string;
  target_language: string;
  projection_target: typeof HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK;
  collection_strategy: "loaded_document_translation_units_bounded" | "dom_near_viewport_translation_anchors";
  raw_content_included: false;
  assistant_answer: false;
  terminal_eligible: false;
  answer_authority: false;
  reentry_required: true;
  chunks: HelixActiveDocVisibleTranslationChunk[];
  ui_text_regions: HelixActiveDocVisibleTranslationUiRegion[];
};

export type HelixVisibleTranslationExistingProjectionInput = Pick<
  DocumentInlineTranslationRenderState,
  | "observationRef"
  | "receiptRef"
  | "projectionStatus"
  | "freshnessStatus"
  | "terminalAuthorityStatus"
  | "sourceEventMs"
  | "observedAtMs"
>;

export type HelixActiveDocVisibleTranslationContextChangedEventDetail = {
  schema: "helix.ask.active_doc_visible_translation_context_changed.v1";
  context: HelixActiveDocVisibleTranslationContext | null;
  previous_context: HelixActiveDocVisibleTranslationContext | null;
  identity_key: string | null;
  previous_identity_key: string | null;
  observed_at_ms: number;
};

let activeContext: HelixActiveDocVisibleTranslationContext | null = null;
let activeContextIdentityKey: string | null = null;

const readText = (value: string | null | undefined): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

const clipVisibleText = (value: string): string => value.trim().slice(0, MAX_VISIBLE_CONTEXT_UNIT_CHARS);

const visibleSourceEventId = (parts: Array<string | number | null | undefined>): string =>
  ["visible_translation_source_event", ...parts.map((part) => String(part ?? "").trim()).filter(Boolean)].join(":");

const buildVisibleContextIdentityKey = (
  context: HelixActiveDocVisibleTranslationContext | null,
): string | null => {
  if (!context) return null;
  const chunkKeys = context.chunks
    .map((chunk) => [
      chunk.projection_target,
      chunk.source_kind,
      chunk.chunk_id,
      chunk.source_text_hash,
    ].join("/"))
    .join("|");
  const uiKeys = context.ui_text_regions
    .map((region) => [
      region.projection_target,
      region.source_kind,
      region.region_id,
      region.source_text_hash,
    ].join("/"))
    .join("|");
  return [
    context.document_source_kind,
    context.document_ref ?? "",
    context.private_source ? "private" : "public",
    context.doc_path,
    context.source_id,
    context.source_hash,
    context.target_language,
    context.collection_strategy,
    chunkKeys,
    uiKeys,
  ].join("::");
};

const emitVisibleContextChanged = (detail: HelixActiveDocVisibleTranslationContextChangedEventDetail): void => {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(
    new CustomEvent(HELIX_ACTIVE_DOC_VISIBLE_TRANSLATION_CONTEXT_CHANGED_EVENT, {
      detail,
    }),
  );
};

const readFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const readTimestampMs = (value: unknown): number =>
  Math.max(0, Math.floor(readFiniteNumber(value) ?? Date.now()));

const normalizeBbox = (
  value: HelixVisibleTranslationRegionBbox | Record<string, unknown> | null | undefined,
): HelixVisibleTranslationRegionBbox | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const x = readFiniteNumber(value.x);
  const y = readFiniteNumber(value.y);
  const width = readFiniteNumber(value.width);
  const height = readFiniteNumber(value.height);
  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }
  const bbox: HelixVisibleTranslationRegionBbox = { x, y, width, height };
  const optionalNumberKeys = [
    "top",
    "left",
    "right",
    "bottom",
    "viewport_width",
    "viewport_height",
  ] as const;
  for (const key of optionalNumberKeys) {
    const numberValue = readFiniteNumber(value[key]);
    if (numberValue !== null) bbox[key] = numberValue;
  }
  if (typeof value.source === "string" && value.source.trim()) {
    bbox.source = value.source.trim();
  }
  return bbox;
};

export function buildActiveDocVisibleTranslationContext(input: {
  docPath: string;
  title?: string | null;
  documentSourceKind?: HelixDocViewerDocumentSourceKind;
  documentRef?: string | null;
  privateSource?: boolean;
  rawMarkdown: string;
  rawMarkdownSourceHash: string;
  units: DocumentTranslationUnit[];
  visibleUnitIds?: string[] | null;
  selectedText?: string | null;
  selectionRef?: string | null;
  selectionBbox?: HelixVisibleTranslationRegionBbox | Record<string, unknown> | null;
  selectionExistingProjection?: HelixVisibleTranslationExistingProjectionInput | null;
  hoverText?: string | null;
  hoverRef?: string | null;
  hoverBbox?: HelixVisibleTranslationRegionBbox | Record<string, unknown> | null;
  hoverExistingProjection?: HelixVisibleTranslationExistingProjectionInput | null;
  existingTranslations?: Record<string, Pick<
    DocumentInlineTranslationRenderState,
    | "observationRef"
    | "receiptRef"
    | "projectionStatus"
    | "freshnessStatus"
    | "terminalAuthorityStatus"
    | "suppressedObservationRef"
    | "suppressedReceiptRef"
    | "suppressedProjectionStatus"
    | "suppressedFreshnessStatus"
    | "suppressedTerminalAuthorityStatus"
    | "sourceEventMs"
    | "observedAtMs"
    | "suppressedSourceEventMs"
    | "suppressedObservedAtMs"
  >> | null;
  accountLocale: string;
  targetLanguage: string;
  nowMs?: number | null;
  uiTextRegions?: Array<{
    sourceText: string;
    sourceId: string;
    regionId: string;
    bbox?: HelixVisibleTranslationRegionBbox | Record<string, unknown> | null;
    sourceKind?: "button_label" | "panel_text";
    existingObservationRef?: string | null;
    existingReceiptRef?: string | null;
    existingProjectionStatus?: HelixVisibleTranslationTarget["existing_projection_status"];
    existingFreshnessStatus?: HelixVisibleTranslationTarget["existing_freshness_status"];
    existingTerminalAuthorityStatus?: HelixVisibleTranslationTarget["existing_terminal_authority_status"];
    existingSourceEventMs?: number | null;
    existingObservedAtMs?: number | null;
  }> | null;
}): HelixActiveDocVisibleTranslationContext | null {
  const docPath = readText(input.docPath);
  const rawMarkdown = readText(input.rawMarkdown);
  const sourceHash = readText(input.rawMarkdownSourceHash);
  const accountLocale = readText(input.accountLocale);
  const targetLanguage = readText(input.targetLanguage);
  if (!docPath || !rawMarkdown || !sourceHash || !accountLocale || !targetLanguage) return null;

  const sourceId = documentMarkdownSourceId(docPath);
  const documentSourceKind = input.documentSourceKind ?? "canonical_docs";
  const documentRef = readText(input.documentRef);
  const privateSource = input.privateSource === true;
  if (documentSourceKind === "research_library" && (!documentRef || !privateSource)) return null;
  if (documentSourceKind === "canonical_docs" && privateSource) return null;
  const documentProvenance: HelixDocViewerDocumentProvenance = {
    document_source_kind: documentSourceKind,
    document_ref: documentRef,
    private_source: privateSource,
  };
  const translatableUnits = input.units.filter((unit) => unit.translatable && readText(unit.source_markdown));
  const visibleUnitIdSet = new Set(
    Array.isArray(input.visibleUnitIds)
      ? input.visibleUnitIds.filter((unitId) => typeof unitId === "string" && unitId.trim())
      : [],
  );
  const candidateUnits = visibleUnitIdSet.size > 0
    ? translatableUnits.filter((unit) => visibleUnitIdSet.has(unit.unit_id))
    : translatableUnits;
  const chunks: HelixActiveDocVisibleTranslationChunk[] = [];
  const uiTextRegions: HelixActiveDocVisibleTranslationUiRegion[] = [];
  const observedAtMs = readTimestampMs(input.nowMs);
  const selectedText = clipVisibleText(input.selectedText ?? "");
  const selectionRef = readText(input.selectionRef) ?? "selection";
  const selectionExistingProjection = input.selectionExistingProjection ?? null;
  const hoverText = clipVisibleText(input.hoverText ?? "");
  const hoverRef = readText(input.hoverRef) ?? "hover_region";
  const hoverExistingProjection = input.hoverExistingProjection ?? null;
  if (selectedText) {
    const sourceTextHash = hashDocumentSource(selectedText);
    chunks.push({
      ...documentProvenance,
      source_kind: "selection",
      panel_id: "docs-viewer",
      doc_path: docPath,
      source_id: `${sourceId}#${selectionRef}`,
      source_hash: sourceHash,
      source_text_hash: sourceTextHash,
      source_text_char_count: selectedText.length,
      source_event_id: visibleSourceEventId([docPath, "selection", selectionRef, sourceTextHash, targetLanguage]),
      source_event_ms: observedAtMs,
      observed_at_ms: observedAtMs,
      visible_text: selectedText,
      chunk_id: selectionRef,
      chunk_index: 0,
      dedupe_key: [
        sourceId,
        sourceHash,
        sourceTextHash,
        selectionRef,
        accountLocale,
        targetLanguage,
        HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_SELECTION,
      ].join("::"),
      region_id: selectionRef,
      bbox: normalizeBbox(input.selectionBbox),
      projection_target: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_SELECTION,
      existing_observation_ref: selectionExistingProjection?.observationRef ?? null,
      existing_receipt_ref: selectionExistingProjection?.receiptRef ?? null,
      existing_projection_status: selectionExistingProjection?.projectionStatus ?? null,
      existing_freshness_status: selectionExistingProjection?.freshnessStatus ?? null,
      existing_terminal_authority_status: selectionExistingProjection?.terminalAuthorityStatus ?? null,
      existing_source_event_ms: readFiniteNumber(selectionExistingProjection?.sourceEventMs),
      existing_observed_at_ms: readFiniteNumber(selectionExistingProjection?.observedAtMs),
      raw_content_included: false,
      assistant_answer: false,
      terminal_eligible: false,
      answer_authority: false,
      reentry_required: true,
    });
  }
  if (hoverText) {
    const sourceTextHash = hashDocumentSource(hoverText);
    chunks.push({
      ...documentProvenance,
      source_kind: "hover_region",
      panel_id: "docs-viewer",
      doc_path: docPath,
      source_id: `${sourceId}#${hoverRef}`,
      source_hash: sourceHash,
      source_text_hash: sourceTextHash,
      source_text_char_count: hoverText.length,
      source_event_id: visibleSourceEventId([docPath, "hover", hoverRef, sourceTextHash, targetLanguage]),
      source_event_ms: observedAtMs,
      observed_at_ms: observedAtMs,
      visible_text: hoverText,
      chunk_id: hoverRef,
      chunk_index: chunks.length,
      dedupe_key: [
        sourceId,
        sourceHash,
        sourceTextHash,
        hoverRef,
        accountLocale,
        targetLanguage,
        HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_HOVER,
      ].join("::"),
      region_id: hoverRef,
      bbox: normalizeBbox(input.hoverBbox),
      projection_target: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_HOVER,
      existing_observation_ref: hoverExistingProjection?.observationRef ?? null,
      existing_receipt_ref: hoverExistingProjection?.receiptRef ?? null,
      existing_projection_status: hoverExistingProjection?.projectionStatus ?? null,
      existing_freshness_status: hoverExistingProjection?.freshnessStatus ?? null,
      existing_terminal_authority_status: hoverExistingProjection?.terminalAuthorityStatus ?? null,
      existing_source_event_ms: readFiniteNumber(hoverExistingProjection?.sourceEventMs),
      existing_observed_at_ms: readFiniteNumber(hoverExistingProjection?.observedAtMs),
      raw_content_included: false,
      assistant_answer: false,
      terminal_eligible: false,
      answer_authority: false,
      reentry_required: true,
    });
  }
  let usedChars = 0;
  for (const unit of candidateUnits) {
    const visibleText = clipVisibleText(unit.source_markdown);
    if (!visibleText) continue;
    const nextChars = usedChars + visibleText.length;
    if (chunks.length > 0 && nextChars > MAX_VISIBLE_CONTEXT_CHARS) break;
    const chunkIndex = chunks.length;
    const sourceTextHash = hashDocumentSource(visibleText);
    const existingTranslation = input.existingTranslations?.[unit.unit_id] ?? null;
    const existingObservationRef =
      existingTranslation?.observationRef ??
      existingTranslation?.suppressedObservationRef ??
      null;
    const existingReceiptRef =
      existingTranslation?.receiptRef ??
      existingTranslation?.suppressedReceiptRef ??
      null;
    const existingProjectionStatus =
      existingTranslation?.projectionStatus ??
      existingTranslation?.suppressedProjectionStatus ??
      null;
    const existingFreshnessStatus =
      existingTranslation?.freshnessStatus ??
      existingTranslation?.suppressedFreshnessStatus ??
      null;
    const existingTerminalAuthorityStatus =
      existingTranslation?.terminalAuthorityStatus ??
      existingTranslation?.suppressedTerminalAuthorityStatus ??
      null;
    const existingSourceEventMs =
      readFiniteNumber(existingTranslation?.sourceEventMs) ??
      readFiniteNumber(existingTranslation?.suppressedSourceEventMs);
    const existingObservedAtMs =
      readFiniteNumber(existingTranslation?.observedAtMs) ??
      readFiniteNumber(existingTranslation?.suppressedObservedAtMs);
    chunks.push({
      ...documentProvenance,
      source_kind: "docs_viewer",
      panel_id: "docs-viewer",
      doc_path: docPath,
      source_id: sourceId,
      source_hash: sourceHash,
      source_text_hash: sourceTextHash,
      source_text_char_count: visibleText.length,
      source_event_id: visibleSourceEventId([docPath, "chunk", unit.unit_id, sourceTextHash, targetLanguage]),
      source_event_ms: observedAtMs,
      observed_at_ms: observedAtMs,
      visible_text: visibleText,
      chunk_id: unit.unit_id,
      chunk_index: chunkIndex,
      dedupe_key: [
        sourceId,
        sourceHash,
        sourceTextHash,
        unit.unit_id,
        accountLocale,
        targetLanguage,
      ].join("::"),
      region_id: `docs-viewer:${unit.unit_id}`,
      bbox: null,
      projection_target: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
      existing_observation_ref: existingObservationRef,
      existing_receipt_ref: existingReceiptRef,
      existing_projection_status: existingProjectionStatus,
      existing_freshness_status: existingFreshnessStatus,
      existing_terminal_authority_status: existingTerminalAuthorityStatus,
      existing_source_event_ms: existingSourceEventMs,
      existing_observed_at_ms: existingObservedAtMs,
      raw_content_included: false,
      assistant_answer: false,
      terminal_eligible: false,
      answer_authority: false,
      reentry_required: true,
    });
    usedChars = nextChars;
    if (chunks.length >= MAX_VISIBLE_CONTEXT_UNITS) break;
  }

  for (const region of input.uiTextRegions ?? []) {
    const visibleText = clipVisibleText(region.sourceText);
    const sourceId = readText(region.sourceId);
    const regionId = readText(region.regionId);
    if (!visibleText || !sourceId || !regionId) continue;
    const sourceTextHash = hashDocumentSource(visibleText);
    const chunkId = regionId;
    uiTextRegions.push({
      ...documentProvenance,
      source_kind: region.sourceKind ?? "panel_text",
      panel_id: "docs-viewer",
      doc_path: docPath,
      source_id: sourceId,
      source_hash: sourceHash,
      source_text_hash: sourceTextHash,
      source_text_char_count: visibleText.length,
      source_event_id: visibleSourceEventId([docPath, "ui", regionId, sourceTextHash, targetLanguage]),
      source_event_ms: observedAtMs,
      observed_at_ms: observedAtMs,
      visible_text: visibleText,
      chunk_id: chunkId,
      chunk_index: uiTextRegions.length,
      dedupe_key: [
        sourceId,
        sourceHash,
        sourceTextHash,
        chunkId,
        accountLocale,
        targetLanguage,
        HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_ACCOUNT_LANGUAGE,
      ].join("::"),
      region_id: regionId,
      bbox: normalizeBbox(region.bbox),
      projection_target: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_ACCOUNT_LANGUAGE,
      existing_observation_ref: region.existingObservationRef ?? null,
      existing_receipt_ref: region.existingReceiptRef ?? null,
      existing_projection_status: region.existingProjectionStatus ?? null,
      existing_freshness_status: region.existingFreshnessStatus ?? null,
      existing_terminal_authority_status: region.existingTerminalAuthorityStatus ?? null,
      existing_source_event_ms: readFiniteNumber(region.existingSourceEventMs),
      existing_observed_at_ms: readFiniteNumber(region.existingObservedAtMs),
      raw_content_included: false,
      assistant_answer: false,
      terminal_eligible: false,
      answer_authority: false,
      reentry_required: true,
    });
  }

  if (chunks.length === 0 && uiTextRegions.length === 0) return null;

  return {
    ...documentProvenance,
    schema: HELIX_ACTIVE_DOC_VISIBLE_TRANSLATION_CONTEXT_SCHEMA,
    source_kind: "docs_viewer",
    panel_id: "docs-viewer",
    doc_path: docPath,
    title: readText(input.title),
    source_id: sourceId,
    source_hash: sourceHash,
    source_text_hash: sourceHash,
    source_text_char_count: rawMarkdown.length,
    chunk_count: chunks.length,
    total_unit_count: input.units.length,
    translatable_unit_count: translatableUnits.length,
    account_locale: accountLocale,
    target_language: targetLanguage,
    projection_target: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
    collection_strategy: visibleUnitIdSet.size > 0
      ? "dom_near_viewport_translation_anchors"
      : "loaded_document_translation_units_bounded",
    raw_content_included: false,
    assistant_answer: false,
    terminal_eligible: false,
    answer_authority: false,
    reentry_required: true,
    chunks,
    ui_text_regions: uiTextRegions,
  };
}

export function publishActiveDocVisibleTranslationContext(
  context: HelixActiveDocVisibleTranslationContext | null,
): void {
  const previousContext = activeContext;
  const previousIdentityKey = activeContextIdentityKey;
  const nextIdentityKey = buildVisibleContextIdentityKey(context);
  activeContext = context;
  activeContextIdentityKey = nextIdentityKey;
  if (nextIdentityKey !== previousIdentityKey) {
    emitVisibleContextChanged({
      schema: "helix.ask.active_doc_visible_translation_context_changed.v1",
      context,
      previous_context: previousContext,
      identity_key: nextIdentityKey,
      previous_identity_key: previousIdentityKey,
      observed_at_ms: Date.now(),
    });
  }
}

export function readActiveDocVisibleTranslationContext(): HelixActiveDocVisibleTranslationContext | null {
  return activeContext;
}

export function clearActiveDocVisibleTranslationContext(docPath?: string | null): void {
  if (!docPath || activeContext?.doc_path === docPath) {
    const previousContext = activeContext;
    const previousIdentityKey = activeContextIdentityKey;
    activeContext = null;
    activeContextIdentityKey = null;
    if (previousIdentityKey) {
      emitVisibleContextChanged({
        schema: "helix.ask.active_doc_visible_translation_context_changed.v1",
        context: null,
        previous_context: previousContext,
        identity_key: null,
        previous_identity_key: previousIdentityKey,
        observed_at_ms: Date.now(),
      });
    }
  }
}
