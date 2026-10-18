import { HELIX_ACTIVE_DOC_VISIBLE_TRANSLATION_CONTEXT_SCHEMA } from "@/lib/docs/visibleTranslationContext";
import {
  HELIX_RESEARCH_LIBRARY_DOC_VIEWER_PATH_PREFIX,
  researchLibraryDocViewerPath,
} from "@shared/helix-research-library";

type WorkstationLayoutGroupLike = {
  activePanelId?: unknown;
  panelIds?: unknown;
};

type WorkstationLayoutDockLike = {
  collapsed?: unknown;
  widthPx?: unknown;
  side?: unknown;
};

type WorkstationLayoutDrawerLike = {
  open?: unknown;
  snap?: unknown;
};

export type WorkstationLayoutSnapshotInput = {
  mode?: unknown;
  activeGroupId?: unknown;
  groups?: Record<string, WorkstationLayoutGroupLike> | null;
  chatDock?: WorkstationLayoutDockLike | null;
  mobileDrawer?: WorkstationLayoutDrawerLike | null;
};

export function buildWorkstationLayoutDebugSnapshotFromState(
  state: WorkstationLayoutSnapshotInput,
): Record<string, unknown> {
  const groups = state.groups ?? {};
  const panelIds = new Set<string>();
  Object.values(groups).forEach((group) => {
    if (!Array.isArray(group.panelIds)) return;
    group.panelIds.forEach((panelId) => {
      if (typeof panelId === "string" && panelId.trim()) panelIds.add(panelId);
    });
  });
  return {
    mode: state.mode,
    activeGroupId: state.activeGroupId,
    groupCount: Object.keys(groups).length,
    openPanels: [...panelIds].sort((a, b) => a.localeCompare(b)),
    chatDock: {
      collapsed: state.chatDock?.collapsed,
      widthPx: state.chatDock?.widthPx,
      side: state.chatDock?.side,
    },
    mobileDrawer: {
      open: state.mobileDrawer?.open,
      snap: state.mobileDrawer?.snap,
    },
  };
}

type WorkstationNoteLike = {
  id?: unknown;
  title?: unknown;
  body?: unknown;
};

type WorkstationNotesSnapshotInput = {
  active_note_id?: unknown;
  notes?: Record<string, WorkstationNoteLike | null | undefined> | null;
  order?: unknown;
};

type ScientificCalculatorDebugEventLike = {
  action_id?: unknown;
  ok?: unknown;
  input_latex?: unknown;
  result_text?: unknown;
  normalized_expression?: unknown;
  message?: unknown;
  ts?: unknown;
};

type ScientificCalculatorSnapshotInput = {
  currentLatex?: unknown;
  lastSolve?: {
    result_text?: unknown;
    normalized_expression?: unknown;
    trace?: { traceId?: unknown } | null;
    ok?: unknown;
  } | null;
  lastCalculatorReceipt?: unknown;
  calculatorReceipts?: unknown;
  calculatorReceiptIdsByContextKey?: unknown;
  steps?: unknown;
  debugEvents?: unknown;
};

type TheoryRuntimeContextSnapshotInput = Record<string, unknown> & {
  schema?: unknown;
  requestId?: unknown;
  receiptId?: unknown;
  runtimeId?: unknown;
  outputRole?: unknown;
  terminalEligible?: unknown;
  postToolModelStepRequired?: unknown;
};

export type AskTurnWorkspaceContextSnapshotInput = {
  sessionId?: string | null;
  layoutState: WorkstationLayoutSnapshotInput;
  notesState: WorkstationNotesSnapshotInput;
  calculatorState: ScientificCalculatorSnapshotInput;
  theoryRuntimeContext?: TheoryRuntimeContextSnapshotInput | null;
  theoryBadgeGraphContext?: Record<string, unknown> | null;
  docContext: {
    path: string | null;
    source: string;
  };
  activeDocVisibleTranslationContext?: Record<string, unknown> | null;
  accountLanguageTranslationProjections?: Record<string, unknown>[] | null;
  visibleTranslationProjections?: Record<string, unknown>[] | null;
  situationRoomContext?: unknown;
  situationCaptureContext?: unknown;
  lastUpdatedAtMs: number;
};

const clipTextForAskTurn = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

const readPanelIds = (group: WorkstationLayoutGroupLike | null | undefined): string[] =>
  Array.isArray(group?.panelIds)
    ? group.panelIds.filter((panelId): panelId is string => typeof panelId === "string" && panelId.trim().length > 0)
    : [];

const readNoteOrder = (notesState: WorkstationNotesSnapshotInput): string[] =>
  Array.isArray(notesState.order)
    ? notesState.order.filter((noteId): noteId is string => typeof noteId === "string" && noteId.trim().length > 0)
    : [];

const readCalculatorDebugEvents = (
  calculatorState: ScientificCalculatorSnapshotInput,
): ScientificCalculatorDebugEventLike[] =>
  Array.isArray(calculatorState.debugEvents)
    ? calculatorState.debugEvents.filter((event): event is ScientificCalculatorDebugEventLike =>
        Boolean(event) && typeof event === "object",
      )
    : [];

const readProjectionDocPath = (entry: Record<string, unknown>): string | null => {
  const value = entry.docPath ?? entry.doc_path;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const readProjectionString = (entry: Record<string, unknown>, camelKey: string, snakeKey: string): string | null => {
  const value = entry[camelKey] ?? entry[snakeKey];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const readProjectionNumber = (entry: Record<string, unknown>, camelKey: string, snakeKey: string): number | null => {
  const value = entry[camelKey] ?? entry[snakeKey];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const mirroredProjectionEvidenceFields = (
  entry: Record<string, unknown>,
): Record<string, unknown> => {
  const stringPairs: Array<[string, string]> = [
    ["docPath", "doc_path"],
    ["panelId", "panel_id"],
    ["regionId", "region_id"],
    ["sourceId", "source_id"],
    ["sourceHash", "source_hash"],
    ["sourceKind", "source_kind"],
    ["sourceTextHash", "source_text_hash"],
    ["visibleText", "visible_text"],
    ["projectionTarget", "projection_target"],
    ["accountLocale", "account_locale"],
    ["targetLanguage", "target_language"],
    ["chunkId", "chunk_id"],
    ["dedupeKey", "dedupe_key"],
    ["sourceEventId", "source_event_id"],
    ["freshnessStatus", "freshness_status"],
    ["observationRef", "observation_ref"],
    ["receiptRef", "receipt_ref"],
  ];
  const numberPairs: Array<[string, string]> = [
    ["sourceTextCharCount", "source_text_char_count"],
    ["chunkIndex", "chunk_index"],
    ["sourceEventMs", "source_event_ms"],
    ["observedAtMs", "observed_at_ms"],
  ];
  const mirrored: Record<string, unknown> = {};
  for (const [camelKey, snakeKey] of stringPairs) {
    const value = readProjectionString(entry, camelKey, snakeKey);
    if (!value) continue;
    mirrored[camelKey] = value;
    mirrored[snakeKey] = value;
  }
  for (const [camelKey, snakeKey] of numberPairs) {
    const value = readProjectionNumber(entry, camelKey, snakeKey);
    if (value === null) continue;
    mirrored[camelKey] = value;
    mirrored[snakeKey] = value;
  }
  return mirrored;
};

const projectionMatchesActiveDoc = (
  entry: Record<string, unknown>,
  activeDocPath: string | null,
): boolean => {
  const projectionDocPath = readProjectionDocPath(entry);
  return !activeDocPath || !projectionDocPath || projectionDocPath === activeDocPath;
};

const normalizeProjectionEvidenceForAskSnapshot = (
  entry: Record<string, unknown>,
  defaultProjectionTarget?: string | null,
): Record<string, unknown> => {
  const mirrored = mirroredProjectionEvidenceFields(entry);
  const projectionTarget =
    readProjectionString(mirrored, "projectionTarget", "projection_target") ||
    (typeof defaultProjectionTarget === "string" && defaultProjectionTarget.trim()
      ? defaultProjectionTarget.trim()
      : null);
  return {
    ...entry,
    ...mirrored,
    ...(projectionTarget
      ? {
        projectionTarget,
        projection_target: projectionTarget,
      }
      : {}),
    contextRole: "tool_evidence",
    context_role: "tool_evidence",
    answerAuthority: false,
    answer_authority: false,
    terminalEligible: false,
    terminal_eligible: false,
    assistantAnswer: false,
    assistant_answer: false,
    rawContentIncluded: false,
    raw_content_included: false,
    reentryRequired: true,
    reentry_required: true,
  };
};

const normalizeVisibleTranslationEvidenceRecord = (
  entry: Record<string, unknown>,
): Record<string, unknown> => ({
  ...entry,
  ...mirroredProjectionEvidenceFields(entry),
  assistant_answer: false,
  assistantAnswer: false,
  terminal_eligible: false,
  terminalEligible: false,
  answer_authority: false,
  answerAuthority: false,
  raw_content_included: false,
  rawContentIncluded: false,
  reentry_required: true,
  reentryRequired: true,
});

const normalizeVisibleTranslationEvidenceArray = (
  value: unknown,
): Record<string, unknown>[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
    )
    .map(normalizeVisibleTranslationEvidenceRecord);
};

const normalizeActiveDocVisibleTranslationContextForAskSnapshot = (
  value: Record<string, unknown>,
  activeDocPath: string | null,
): Record<string, unknown> | null => {
  const contextDocPath = readProjectionDocPath(value);
  if (activeDocPath && contextDocPath && contextDocPath !== activeDocPath) return null;
  const chunks = normalizeVisibleTranslationEvidenceArray(value.chunks);
  const uiTextRegions = normalizeVisibleTranslationEvidenceArray(value.ui_text_regions ?? value.uiTextRegions);
  const panelTextRegions = normalizeVisibleTranslationEvidenceArray(value.panel_text_regions ?? value.panelTextRegions);
  const visibleUiTextRegions = normalizeVisibleTranslationEvidenceArray(
    value.visible_ui_text_regions ?? value.visibleUiTextRegions,
  );
  return normalizeVisibleTranslationEvidenceRecord({
    ...value,
    ...(chunks ? { chunks } : {}),
    ...(uiTextRegions ? { ui_text_regions: uiTextRegions, uiTextRegions } : {}),
    ...(panelTextRegions ? { panel_text_regions: panelTextRegions, panelTextRegions } : {}),
    ...(visibleUiTextRegions ? { visible_ui_text_regions: visibleUiTextRegions, visibleUiTextRegions } : {}),
  });
};

type ResearchVisibleTranslationContextResolution = {
  claimed: boolean;
  path: string | null;
};

const visibleTranslationRecordMatchesResearchDocument = (
  value: unknown,
  input: {
    docPath: string;
    documentRef: string;
    requireDocumentSourceId?: boolean;
  },
): boolean => {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!record) return false;
  const sourceId = readProjectionString(record, "sourceId", "source_id");
  const expectedSourceId = `document_markdown:${input.docPath}`;
  return (
    readProjectionDocPath(record) === input.docPath &&
    readProjectionString(record, "documentSourceKind", "document_source_kind") === "research_library" &&
    readProjectionString(record, "documentRef", "document_ref") === input.documentRef &&
    (record.private_source ?? record.privateSource) === true &&
    (!input.requireDocumentSourceId || sourceId === expectedSourceId || sourceId?.startsWith(`${expectedSourceId}#`) === true)
  );
};

const resolveResearchVisibleTranslationContext = (
  value: Record<string, unknown> | null,
  activePanel: string | null,
): ResearchVisibleTranslationContextResolution => {
  if (!value) return { claimed: false, path: null };
  const docPath = readProjectionDocPath(value);
  const sourceKind = readProjectionString(value, "documentSourceKind", "document_source_kind");
  const privateSource = value.private_source ?? value.privateSource;
  const claimed =
    sourceKind === "research_library" ||
    privateSource === true ||
    docPath?.startsWith(HELIX_RESEARCH_LIBRARY_DOC_VIEWER_PATH_PREFIX) === true;
  if (!claimed) return { claimed: false, path: null };
  if (activePanel !== "docs-viewer") return { claimed: true, path: null };

  const documentRef = readProjectionString(value, "documentRef", "document_ref");
  if (
    value.schema !== HELIX_ACTIVE_DOC_VISIBLE_TRANSLATION_CONTEXT_SCHEMA ||
    readProjectionString(value, "panelId", "panel_id") !== "docs-viewer" ||
    readProjectionString(value, "sourceKind", "source_kind") !== "docs_viewer" ||
    sourceKind !== "research_library" ||
    privateSource !== true ||
    !documentRef
  ) {
    return { claimed: true, path: null };
  }

  const expectedPath = researchLibraryDocViewerPath(documentRef);
  const expectedSourceId = `document_markdown:${expectedPath}`;
  if (docPath !== expectedPath || readProjectionString(value, "sourceId", "source_id") !== expectedSourceId) {
    return { claimed: true, path: null };
  }

  const chunks = Array.isArray(value.chunks) ? value.chunks : null;
  const uiTextRegionsValue = value.ui_text_regions ?? value.uiTextRegions;
  const uiTextRegions = Array.isArray(uiTextRegionsValue) ? uiTextRegionsValue : null;
  const optionalRegionValues = [
    value.panel_text_regions ?? value.panelTextRegions,
    value.visible_ui_text_regions ?? value.visibleUiTextRegions,
  ];
  if (optionalRegionValues.some((entries) => entries != null && !Array.isArray(entries))) {
    return { claimed: true, path: null };
  }
  const optionalRegionArrays = optionalRegionValues.filter(
    (entries): entries is unknown[] => Array.isArray(entries),
  );
  if (
    !chunks ||
    !uiTextRegions ||
    !chunks.every((entry) => visibleTranslationRecordMatchesResearchDocument(entry, {
      docPath: expectedPath,
      documentRef,
      requireDocumentSourceId: true,
    })) ||
    !uiTextRegions.every((entry) => visibleTranslationRecordMatchesResearchDocument(entry, {
      docPath: expectedPath,
      documentRef,
    })) ||
    optionalRegionArrays.some((entries) => !entries.every((entry) =>
      visibleTranslationRecordMatchesResearchDocument(entry, {
        docPath: expectedPath,
        documentRef,
      })
    ))
  ) {
    return { claimed: true, path: null };
  }

  return { claimed: true, path: expectedPath };
};

export function buildAskTurnWorkspaceContextSnapshotFromState(
  input: AskTurnWorkspaceContextSnapshotInput,
): Record<string, unknown> {
  const groups = input.layoutState.groups ?? {};
  const activeGroupId = input.layoutState.activeGroupId;
  const activeGroup =
    typeof activeGroupId === "string" && activeGroupId
      ? groups[activeGroupId] ?? null
      : null;
  const activePanel = typeof activeGroup?.activePanelId === "string" ? activeGroup.activePanelId : null;
  const openPanelIds = Object.values(groups)
    .flatMap((group) => readPanelIds(group))
    .slice(0, 24);
  const calculatorRecentDebugEvents = readCalculatorDebugEvents(input.calculatorState).slice(0, 5).map((event) => ({
    action_id: event.action_id,
    ok: event.ok,
    input_latex: clipTextForAskTurn(event.input_latex, 400),
    result_text: clipTextForAskTurn(event.result_text, 400),
    normalized_expression: clipTextForAskTurn(event.normalized_expression, 400),
    message: clipTextForAskTurn(event.message, 240),
    ts: event.ts,
  }));
  const lastCalculatorReceipt =
    input.calculatorState.lastCalculatorReceipt &&
    typeof input.calculatorState.lastCalculatorReceipt === "object" &&
    !Array.isArray(input.calculatorState.lastCalculatorReceipt)
      ? input.calculatorState.lastCalculatorReceipt as Record<string, unknown>
      : null;
  const calculatorReceipts = Array.isArray(input.calculatorState.calculatorReceipts)
    ? input.calculatorState.calculatorReceipts
      .filter((receipt): receipt is Record<string, unknown> =>
        Boolean(receipt) && typeof receipt === "object" && !Array.isArray(receipt)
      )
      .slice(0, 5)
    : [];
  const calculatorReceiptContextIndex =
    input.calculatorState.calculatorReceiptIdsByContextKey &&
    typeof input.calculatorState.calculatorReceiptIdsByContextKey === "object" &&
    !Array.isArray(input.calculatorState.calculatorReceiptIdsByContextKey)
      ? Object.fromEntries(
        Object.entries(input.calculatorState.calculatorReceiptIdsByContextKey as Record<string, unknown>)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string")
          .slice(0, 20),
      )
      : {};
  const activeCalculatorContext = {
    schema: "helix.scientific_calculator_active_context.v1",
    panel_id: "scientific-calculator",
    active_panel: activePanel === "scientific-calculator",
    current_latex: clipTextForAskTurn(input.calculatorState.currentLatex, 800),
    last_result_text: clipTextForAskTurn(input.calculatorState.lastSolve?.result_text, 800),
    last_normalized_expression: clipTextForAskTurn(input.calculatorState.lastSolve?.normalized_expression, 800),
    last_trace_id: clipTextForAskTurn(input.calculatorState.lastSolve?.trace?.traceId, 240),
    last_ok: input.calculatorState.lastSolve?.ok ?? null,
    last_calculator_receipt: lastCalculatorReceipt,
    calculator_receipts: calculatorReceipts,
    calculator_receipt_status:
      typeof lastCalculatorReceipt?.status === "string" ? lastCalculatorReceipt.status : null,
    calculator_receipt_ref:
      typeof lastCalculatorReceipt?.receipt_id === "string" ? lastCalculatorReceipt.receipt_id : null,
    calculator_receipt_context_index: calculatorReceiptContextIndex,
    step_count: Array.isArray(input.calculatorState.steps) ? input.calculatorState.steps.length : 0,
    recent_debug_events: calculatorRecentDebugEvents,
  };
  const activeTheoryRuntimeContext = input.theoryRuntimeContext
    ? {
      ...input.theoryRuntimeContext,
      outputRole: "evidence_for_synthesis",
      output_role: "evidence_for_synthesis",
      answerAuthority: false,
      answer_authority: false,
      terminalEligible: false,
      terminal_eligible: false,
      postToolModelStepRequired: true,
      post_tool_model_step_required: true,
      assistantAnswer: false,
      assistant_answer: false,
      rawContentIncluded: false,
      raw_content_included: false,
    }
    : null;
  const theoryBadgeGraphContext = input.theoryBadgeGraphContext &&
    typeof input.theoryBadgeGraphContext === "object" &&
    !Array.isArray(input.theoryBadgeGraphContext)
    ? input.theoryBadgeGraphContext
    : null;
  const theoryBadgeGraphPanelOpen = openPanelIds.includes("theory-badge-graph");
  const activeTheoryBadgeGraphContext = theoryBadgeGraphContext
    ? {
      ...theoryBadgeGraphContext,
      panel_id: "theory-badge-graph",
      active_panel: activePanel === "theory-badge-graph",
      panel_open: theoryBadgeGraphPanelOpen,
      context_role: "ambient_context",
      output_role: "ambient_context",
      observation_required: true,
      answer_authority: false,
      terminal_eligible: false,
      post_tool_model_step_required: true,
      assistant_answer: false,
      raw_content_included: false,
    }
    : null;
  const suppliedVisibleTranslationContext =
    input.activeDocVisibleTranslationContext &&
    typeof input.activeDocVisibleTranslationContext === "object" &&
    !Array.isArray(input.activeDocVisibleTranslationContext)
      ? input.activeDocVisibleTranslationContext
      : null;
  const researchVisibleContext = resolveResearchVisibleTranslationContext(
    suppliedVisibleTranslationContext,
    activePanel,
  );
  const rejectedResearchVisibleContext = researchVisibleContext.claimed && !researchVisibleContext.path;
  const currentPath = rejectedResearchVisibleContext
    ? null
    : researchVisibleContext.path ?? input.docContext.path;
  const docContextSource = researchVisibleContext.path
    ? "active_research_library_visible_context"
    : rejectedResearchVisibleContext
      ? "invalid_research_library_visible_context"
      : input.docContext.source;
  const activeDocVisibleTranslationContext =
    suppliedVisibleTranslationContext && !rejectedResearchVisibleContext
      ? normalizeActiveDocVisibleTranslationContextForAskSnapshot(
        suppliedVisibleTranslationContext,
        currentPath,
      )
      : null;
  const accountLanguageTranslationProjections = Array.isArray(input.accountLanguageTranslationProjections)
    ? input.accountLanguageTranslationProjections
      .filter((entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
      )
      .filter((entry) => !rejectedResearchVisibleContext && projectionMatchesActiveDoc(entry, currentPath))
      .map((entry) => normalizeProjectionEvidenceForAskSnapshot(entry, "account_language"))
      .slice(0, 24)
    : [];
  const visibleTranslationProjections = Array.isArray(input.visibleTranslationProjections)
    ? input.visibleTranslationProjections
      .filter((entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
      )
      .filter((entry) => !rejectedResearchVisibleContext && projectionMatchesActiveDoc(entry, currentPath))
      .map((entry) => normalizeProjectionEvidenceForAskSnapshot(entry))
      .slice(0, 24)
    : [];
  const notes = input.notesState.notes ?? {};
  const noteOrder = readNoteOrder(input.notesState);
  const activeNoteId = typeof input.notesState.active_note_id === "string" ? input.notesState.active_note_id : null;
  const activeNote = activeNoteId ? notes[activeNoteId] ?? null : null;
  const focusedNotesPanel = activePanel === "workstation-notes";
  const notesPanelHasActiveNote = Boolean(activeNote);
  const includeRecentNoteFallback = !focusedNotesPanel || notesPanelHasActiveNote;
  const lastCreatedNoteId = includeRecentNoteFallback ? noteOrder[0] ?? null : null;
  const lastCreatedNote = lastCreatedNoteId ? notes[lastCreatedNoteId] ?? null : null;
  const recentNotes = includeRecentNoteFallback ? noteOrder.slice(0, 8).flatMap((noteId) => {
    const note = notes[noteId] ?? null;
    if (!note?.title) return [];
    return [{
      id: note.id,
      title: note.title,
      body: clipTextForAskTurn(note.body, 12000),
    }];
  }) : [];
  const hasNoteContext =
    Boolean(activeNote?.title) ||
    Boolean(lastCreatedNote?.title) ||
    Object.values(groups).some((group) => readPanelIds(group).includes("workstation-notes"));
  return {
    sessionId: input.sessionId ?? "helix-ui",
    activePanel,
    activeGroupId,
    groupCount: Object.keys(groups).length,
    openPanels: [...new Set(openPanelIds)].sort((a, b) => a.localeCompare(b)),
    activeCalculatorContext,
    activeTheoryRuntimeContext,
    active_theory_runtime_context: activeTheoryRuntimeContext,
    hasTheoryRuntimeContext: Boolean(activeTheoryRuntimeContext),
    has_theory_runtime_context: Boolean(activeTheoryRuntimeContext),
    activeTheoryBadgeGraphContext,
    active_theory_badge_graph_context: activeTheoryBadgeGraphContext,
    hasTheoryBadgeGraphContext: Boolean(activeTheoryBadgeGraphContext),
    has_theory_badge_graph_context: Boolean(activeTheoryBadgeGraphContext),
    hasCalculatorContext: activePanel === "scientific-calculator" && (
      Boolean(activeCalculatorContext.current_latex) ||
      Boolean(activeCalculatorContext.last_result_text) ||
      Boolean(activeCalculatorContext.last_calculator_receipt) ||
      calculatorRecentDebugEvents.length > 0
    ),
    active_panel: activePanel,
    activeDocPath: currentPath,
    active_doc_path: currentPath,
    source: docContextSource,
    hasDocContext: Boolean(currentPath),
    has_doc_context: Boolean(currentPath),
    docContextValid: Boolean(currentPath),
    doc_context_valid: Boolean(currentPath),
    docContextPath: currentPath,
    doc_context_path: currentPath,
    docContextSource: currentPath ? docContextSource : null,
    doc_context_source: currentPath ? docContextSource : null,
    activeDocVisibleTranslationContext,
    active_doc_visible_translation_context: activeDocVisibleTranslationContext,
    hasActiveDocVisibleTranslationContext: Boolean(activeDocVisibleTranslationContext),
    has_active_doc_visible_translation_context: Boolean(activeDocVisibleTranslationContext),
    accountLanguageTranslationProjections,
    account_language_translation_projections: accountLanguageTranslationProjections,
    hasAccountLanguageTranslationProjections: accountLanguageTranslationProjections.length > 0,
    has_account_language_translation_projections: accountLanguageTranslationProjections.length > 0,
    visibleTranslationProjections,
    visible_translation_projections: visibleTranslationProjections,
    hasVisibleTranslationProjections: visibleTranslationProjections.length > 0,
    has_visible_translation_projections: visibleTranslationProjections.length > 0,
    docContextFailureReason: currentPath
      ? null
      : activePanel === "docs-viewer"
        ? "docs_panel_open_without_active_doc_path"
        : "no_docs_panel_or_active_doc_path",
    doc_context_failure_reason: currentPath
      ? null
      : activePanel === "docs-viewer"
        ? "docs_panel_open_without_active_doc_path"
        : "no_docs_panel_or_active_doc_path",
    activeNoteId,
    activeNoteTitle: activeNote?.title ?? null,
    activeNoteBody: clipTextForAskTurn(activeNote?.body, 12000),
    lastCreatedNoteId,
    lastCreatedNoteTitle: lastCreatedNote?.title ?? null,
    lastCreatedNoteBody: clipTextForAskTurn(lastCreatedNote?.body, 12000),
    recentNotes,
    hasNoteContext,
    situationRoomContext: input.situationRoomContext,
    situationCaptureContext: input.situationCaptureContext,
    hasSituationRoomContext: Boolean(input.situationRoomContext),
    hasClipboardContext: Object.values(groups).some((group) =>
      readPanelIds(group).includes("workstation-clipboard-history"),
    ),
    lastUpdatedAtMs: input.lastUpdatedAtMs,
  };
}
