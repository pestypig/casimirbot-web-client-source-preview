import React from "react";
import { marked, type MarkedOptions, type Tokens } from "marked";
import { renderToString as renderKatexToString } from "katex";
import "katex/dist/katex.min.css";
import { ArrowLeft, FileDown, Folder, Languages, LoaderCircle, Pause, Play, Search, Trash2 } from "lucide-react";
import { HelixAccountLanguageTranslationProjection } from "@/components/helix/HelixAccountLanguageTranslationProjection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { speakVoice } from "@/lib/agi/api";
import {
  DOC_MANIFEST,
  compareDocCatalogEntries,
  filterDocManifestEntries,
  findDocEntry,
  docCatalogTimestamp,
  type DocManifestEntry,
} from "@/lib/docs/docManifest";
import {
  DOCUMENT_MARKDOWN_TRANSLATION_CONTRACT_VERSION,
  documentMarkdownSourceId,
  enqueueDocumentMarkdownTranslationMail,
  extractDocumentMarkdownTranslationsFromRuns,
  listDocumentMarkdownTranslationLaneSessions,
  readDocumentMarkdownMicroDeckRuns,
  resolveDocumentTranslationTargetLanguage,
  runDocumentMarkdownTranslationLaneSessionControl,
} from "@/lib/docs/documentTranslationClient";
import {
  clearDocumentLiveTranslationProjectionRegistry,
  readDocumentLiveTranslationProjectionSnapshot,
  subscribeDocumentLiveTranslationProjectionRegistry,
  summarizeDocumentLiveTranslationProjectionSnapshot,
  type DocumentLiveTranslationProjectionSnapshot,
  type DocumentLiveTranslationProjectionSnapshotSummary,
} from "@/lib/docs/liveTranslationProjectionRegistry";
import { installDocumentLiveTranslationProjectionEventIngestion } from "@/lib/docs/liveTranslationProjectionEventIngestion";
import {
  buildDocumentLiveTranslationInlineStates,
  documentMarkdownTranslationEntryToInlineRenderState,
  filterReadyDocumentInlineTranslationRenderStates,
  mergeDocumentLiveTranslationInlineStates,
  sameDocumentInlineTranslationRenderState,
  type DocumentInlineTranslationRenderState,
} from "@/lib/docs/liveTranslationInlineProjection";
import { renderDocumentMarkdownWithInlineTranslations } from "@/lib/docs/liveTranslationInlineRenderer";
import {
  buildActiveDocVisibleTranslationContext,
  clearActiveDocVisibleTranslationContext,
  publishActiveDocVisibleTranslationContext,
  type HelixDocViewerDocumentSourceKind,
  type HelixVisibleTranslationRegionBbox,
} from "@/lib/docs/visibleTranslationContext";
import { consumeDocViewerIntent } from "@/lib/docs/docViewer";
import { buildWorkstationPathRef } from "@/lib/workstation/workstationDeepLink";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  fetchAccountCapabilityPolicy,
  readCachedAccountCapabilityPolicy,
  readCachedAccountProfileIdentity,
} from "@/lib/workstation/accountCapabilityPolicy";
import {
  HELIX_WORKSTATION_PROCEDURAL_STEP_EVENT,
  type HelixWorkstationProceduralStepPayload,
} from "@/lib/workstation/proceduralPlaybackContract";
import { emitHelixAskLiveEvent } from "@/lib/helix/liveEventsBus";
import { HELIX_ASK_CONTEXT_ID } from "@/lib/helix/voice-surface-contract";
import {
  executeDocEquationAction,
  getDocEquationActionEntryForLatex,
  getDocEquationCalculatorActions,
  getDocEquationTheoryActions,
} from "@/lib/docs/docEquationActions";
import {
  buildDocScalarCalculatorLaunch,
  dispatchDocCalculatorLaunch,
} from "@/lib/docs/docCalculatorLaunch";
import { buildDocRuntimeCalculatorLaunch } from "@/lib/docs/docRuntimeCommandRegistry";
import {
  renderDocRuntimeCodeBlock,
  renderDocRuntimeCodeSpan,
} from "@/lib/docs/docRuntimeSidecarMarkup";
import {
  markInteraction,
  runWhenQuiet,
} from "@/lib/workstation/performance/workstationInteractionScheduler";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import {
  clearHelixAccountLanguageTranslationProjectionContext,
  readHelixAccountLanguageTranslationProjectionContext,
  selectHelixAccountLanguageTranslationProjection,
  subscribeHelixAccountLanguageTranslationProjectionContext,
  type HelixAccountLanguageTranslationProjectionState,
} from "@/lib/helix/account-language-translation-projection";
import {
  buildHelixVisibleTranslationDataAttributes,
  clearHelixVisibleTranslationProjectionContext,
  readHelixVisibleTranslationProjectionContext,
  selectHelixVisibleTranslationProjection,
  subscribeHelixVisibleTranslationProjectionContext,
  type HelixVisibleTranslationProjectionState,
} from "@/lib/helix/visible-translation-projection";
import { buildHelixLiveTranslationProjectionReceiptFromProjection } from "@/lib/helix/live-translation-projection";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText, type InterfaceTextResolver } from "@/lib/i18n/interfaceText";
import type { InterfaceMessageId } from "@/lib/i18n/messages/types";
import { useDocViewerStore } from "@/store/useDocViewerStore";
import { useWorkstationSessionMemoryStore } from "@/store/useWorkstationSessionMemoryStore";
import {
  deleteResearchLibraryDocument,
  listResearchLibraryDocuments,
  readResearchLibraryDocument,
  researchLibraryDocumentToMarkdown,
} from "@/lib/docs/researchLibraryClient";
import {
  downloadDocsPrintPdfArtifact,
  requestDocsPrintPdf,
} from "@/lib/docs/docsPrintPdfClient";
import {
  DOCS_PRINT_PDF_FEATURE_FLAG,
  type DocsPrintPdfSourceKind,
} from "@shared/docs-print-pdf";
import {
  HELIX_USER_ACCOUNT_POLICY,
  type HelixAccountCapabilityPolicy,
} from "@shared/helix-account-session";
import {
  HELIX_RESEARCH_LIBRARY_DOC_VIEWER_PATH_PREFIX,
  type HelixResearchLibraryDocument,
  type HelixResearchLibraryDocumentSummary,
} from "@shared/helix-research-library";
import {
  hashDocumentSource,
  segmentMarkdownForTranslation,
  type DocumentTranslationUnit,
} from "@shared/document-translation";
import {
  HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
  HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_HOVER,
  HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_SELECTION,
} from "@shared/helix-live-translation-projection-target";

type Translate = InterfaceTextResolver["t"];
type DisplayMessageMap = Record<string, InterfaceMessageId>;
export type DocumentTranslationUiStatus = "idle" | "cached" | "translating" | "ready" | "unavailable" | "error";
type InlineTranslationState = DocumentInlineTranslationRenderState;
type DocTaxonomyFilter = "all" | "runtime-whitepaper" | "canonical-research" | "current-development" | "synthetic-research" | "legacy-development" | "uncategorized";
type ManifestDocClass = Exclude<DocTaxonomyFilter, "all" | "runtime-whitepaper">;
export type DocDirectorySort = "last-edited" | "title" | "subject";
type DocBadgeTone = "cyan" | "emerald" | "amber" | "slate";
type DocBadge = {
  label: string;
  tone: DocBadgeTone;
};

export type ActiveDocViewerDocument = {
  entry: DocManifestEntry;
  docPath: string;
  renderPath: string;
  sourceId: string;
  documentId: string;
  documentRef: string;
  mailboxThreadId: string;
  documentSourceKind: HelixDocViewerDocumentSourceKind;
  privateSource: boolean;
};

export function resolveActiveDocViewerDocument(input: {
  mode: "directory" | "doc";
  currentEntry: DocManifestEntry | null;
  displayEntry: DocManifestEntry | null;
  activeResearchDocument: HelixResearchLibraryDocument | null;
}): ActiveDocViewerDocument | null {
  if (input.activeResearchDocument && input.displayEntry) {
    const translationScope = input.activeResearchDocument.private_translation_scope;
    const docPath = translationScope.doc_path;
    return {
      entry: input.displayEntry,
      docPath,
      renderPath: input.displayEntry.relativePath,
      sourceId: translationScope.source_id,
      documentId: input.activeResearchDocument.document_id,
      documentRef: input.activeResearchDocument.viewer_ref,
      mailboxThreadId: translationScope.mailbox_thread_id,
      documentSourceKind: "research_library",
      privateSource: true,
    };
  }
  if (input.mode !== "doc" || !input.currentEntry) return null;
  return {
    entry: input.currentEntry,
    docPath: input.currentEntry.relativePath,
    renderPath: input.currentEntry.relativePath,
    sourceId: documentMarkdownSourceId(input.currentEntry.relativePath),
    documentId: input.currentEntry.id,
    documentRef: input.currentEntry.id,
    mailboxThreadId: HELIX_ASK_CONTEXT_ID.desktop,
    documentSourceKind: "canonical_docs",
    privateSource: false,
  };
}

export function isActiveDocViewerTranslationEligible(input: {
  contentReady: boolean;
  documentSourceKind: HelixDocViewerDocumentSourceKind | null;
  interfaceLanguageCode: string;
}): boolean {
  if (!input.contentReady) return false;
  return input.documentSourceKind === "research_library" || input.interfaceLanguageCode !== "en";
}

const DOC_INLINE_TRANSLATION_SESSION_PREFIX = "casimir.docs.inlineTranslation.v2";
const DOC_TRANSLATION_MAX_UNITS_PER_CHUNK = 1;
const DOC_TRANSLATION_MAX_CHARS_PER_CHUNK = 2200;
const DOC_TRANSLATION_SCAN_DEBOUNCE_MS = 360;
const DOC_VIEWER_TITLE_TRANSLATION_SOURCE_ID = "workstation-shell#docs-viewer:title";
let lastHandledAccountProfileRevision = 0;
const DOC_VIEWER_TITLE_TRANSLATION_REGION_ID = "docs-viewer:title";
const DOC_VIEWER_TRANSLATE_BUTTON_SOURCE_ID = "workstation-shell#docs-viewer:translate-button";
const DOC_VIEWER_TRANSLATE_BUTTON_REGION_ID = "docs-viewer:translate-button";

const visibleProjectionToExistingTranslation = (
  projection: HelixVisibleTranslationProjectionState | null,
): Pick<
  DocumentInlineTranslationRenderState,
  | "observationRef"
  | "receiptRef"
  | "projectionStatus"
  | "freshnessStatus"
  | "terminalAuthorityStatus"
  | "sourceEventMs"
  | "observedAtMs"
> | null => projection
  ? {
    observationRef: projection.observationRef,
    receiptRef: projection.receiptRef,
    projectionStatus: projection.status,
    freshnessStatus: projection.freshnessStatus,
    terminalAuthorityStatus: projection.terminalAuthorityStatus,
    sourceEventMs: projection.sourceEventMs,
    observedAtMs: projection.observedAtMs,
  }
  : null;

type StoredInlineTranslationSession = {
  enabled: boolean;
  sourceHash?: string | null;
  sourceIdentityKey?: string | null;
  sourceTextHash?: string | null;
  sourceTextCharCount?: number | null;
  accountLocale?: string | null;
  targetLanguage?: string | null;
  translations: Record<string, InlineTranslationState>;
};

type StoredInlineTranslationSessionScope = {
  sourceHash: string | null;
  sourceIdentityKey: string | null;
  sourceTextHash: string | null;
  sourceTextCharCount: number | null;
  accountLocale: string;
  targetLanguage: string;
};

const EMPTY_LIVE_TRANSLATION_PROJECTION_SNAPSHOT = {
  version: 0,
  translations: {},
  laneSessions: {},
  mailLoops: {},
  goalBindings: {},
};

const documentInlineTranslationLaneSessionId = (scopeKey: string): string =>
  `lane_session:live_translation:docs:${hashDocumentSource(scopeKey)}`;

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object" && !Array.isArray(entry))
    )
    : [];
}

function readLocalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readLocalScalarString(value: unknown): string | null {
  const text = readLocalString(value);
  if (text) return text;
  return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

function emitDocumentTranslationLaneSessionControlEvents(input: {
  response: Record<string, unknown>;
  sourceId: string;
  sourceHash: string;
  sourceIdentityKey?: string | null;
  latestSourceIdentityKey?: string | null;
}): void {
  const debug = input.response.debug && typeof input.response.debug === "object" && !Array.isArray(input.response.debug)
    ? (input.response.debug as Record<string, unknown>)
    : {};
  const summaries = [
    ...readRecordArray(input.response.capability_lane_session_debug_summaries),
    ...readRecordArray(input.response.session_debug_summaries),
    ...readRecordArray(debug.capability_lane_session_debug_summaries),
    ...readRecordArray(input.response.capability_lane_turn_timeline).filter((entry) =>
      readLocalString(entry.stage) === "lane_session"
    ),
    ...readRecordArray(debug.capability_lane_turn_timeline).filter((entry) =>
      readLocalString(entry.stage) === "lane_session"
    ),
  ];
  const emittedEventIds = new Set<string>();
  summaries.forEach((summary, index) => {
    const eventId =
      readLocalString(summary.latest_event_id) ??
      readLocalString(summary.latestEventId) ??
      (readLocalScalarString(summary.seq)
        ? `docs-translation-lane-session:${input.sourceId}:seq:${readLocalScalarString(summary.seq)}`
        : null) ??
      (readLocalString(summary.session_control_key)
        ? `docs-translation-lane-session:${input.sourceId}:${summary.session_control_key}`
        : null) ??
      (readLocalString(summary.sessionControlKey)
        ? `docs-translation-lane-session:${input.sourceId}:${summary.sessionControlKey}`
        : null) ??
      `docs-translation-lane-session:${input.sourceId}:${index}:${Date.now()}`;
    if (emittedEventIds.has(eventId)) return;
    emittedEventIds.add(eventId);
    const tsMs =
      typeof summary.updated_at_ms === "number"
        ? summary.updated_at_ms
        : typeof summary.updatedAtMs === "number"
          ? summary.updatedAtMs
          : typeof summary.latest_observed_at_ms === "number"
            ? summary.latest_observed_at_ms
            : typeof summary.latestObservedAtMs === "number"
              ? summary.latestObservedAtMs
              : Date.now();
    emitHelixAskLiveEvent({
      contextId: HELIX_ASK_CONTEXT_ID.desktop,
      traceId: `docs-translation-lane-session:${input.sourceId}`,
      entry: {
        id: eventId,
        text: "Document translation lane session control.",
        tool: "capability_lane_session",
        tsMs,
        meta: {
          ...summary,
          sourceEventType: "lane_session",
          source_event_type: "lane_session",
          lane: "live_translation",
          sourceId: input.sourceId,
          source_id: input.sourceId,
          sourceHash: input.sourceHash,
          source_hash: input.sourceHash,
          ...(input.sourceIdentityKey ? {
            sourceIdentityKey: input.sourceIdentityKey,
            source_identity_key: input.sourceIdentityKey,
          } : {}),
          ...(input.latestSourceIdentityKey ? {
            latestSourceIdentityKey: input.latestSourceIdentityKey,
            latest_source_identity_key: input.latestSourceIdentityKey,
          } : {}),
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      },
    });
  });
}

const proceduralStepMessages = {
  highlight_plus: "docsViewer.procedural.focusingPanelPicker",
  open_picker: "docsViewer.procedural.openingPanelPicker",
  target_panel: "docsViewer.procedural.selectingDocsPanel",
  open_doc: "docsViewer.procedural.openingSelectedDocument",
  read_start: "docsViewer.procedural.startingReadAloud",
  highlight_copy: "docsViewer.procedural.highlightingTopicSectionForCopy",
} satisfies DisplayMessageMap;

const docSubjectLabelMessages: DisplayMessageMap = {
  Architecture: "docsViewer.group.architecture",
  "Casimir and Quantum Bounds": "docsViewer.group.casimirAndQuantumBounds",
  "Curvature Studies": "docsViewer.group.curvatureStudies",
  "Ethos and Ideology": "docsViewer.group.ethosAndIdeology",
  "General Reference": "docsViewer.group.generalReference",
  "Helix Ask and Voice": "docsViewer.group.helixAskAndVoice",
  "Knowledge System": "docsViewer.group.knowledgeSystem",
  "Panels and UI": "docsViewer.group.panelsAndUi",
  "Physics Reference": "docsViewer.group.physicsReference",
  "Research and Development Logs": "docsViewer.group.researchAndDevelopmentLogs",
  Runbooks: "docsViewer.group.runbooks",
  "Stellar and Solar": "docsViewer.group.stellarAndSolar",
  "Warp Mechanics": "docsViewer.group.warpMechanics",
} satisfies DisplayMessageMap;

const docTaxonomyLabelMessages: Record<Exclude<ManifestDocClass, "uncategorized">, InterfaceMessageId> = {
  "canonical-research": "docsViewer.taxonomy.canonicalResearch",
  "current-development": "docsViewer.taxonomy.currentDevelopment",
  "synthetic-research": "docsViewer.taxonomy.syntheticResearch",
  "legacy-development": "docsViewer.taxonomy.legacyDevelopment",
};

const docTaxonomyFilterOptions: Array<{ key: DocTaxonomyFilter; messageId: InterfaceMessageId }> = [
  { key: "all", messageId: "docsViewer.taxonomy.all" },
  { key: "runtime-whitepaper", messageId: "docsViewer.taxonomy.runtimeWhitepapers" },
  { key: "canonical-research", messageId: "docsViewer.taxonomy.research" },
  { key: "current-development", messageId: "docsViewer.taxonomy.development" },
  { key: "synthetic-research", messageId: "docsViewer.taxonomy.syntheticResearchShort" },
  { key: "legacy-development", messageId: "docsViewer.taxonomy.legacyShort" },
  { key: "uncategorized", messageId: "docsViewer.taxonomy.uncategorized" },
];

export type DocMathPickContext = {
  latex: string;
  currentPath?: string;
  anchor?: string;
  clipboardWrite?: ((text: string) => Promise<void>) | null;
  dispatchEvent?: ((detail: { latex: string; sourcePath: string | null; anchor: string | null }) => void) | null;
};

export function handleDocMathPick(context: DocMathPickContext): void {
  const latex = context.latex.trim();
  if (!latex) return;
  const detail = {
    latex,
    sourcePath: context.currentPath ?? null,
    anchor: context.anchor ?? null,
  };
  const customDispatch = context.dispatchEvent;
  if (customDispatch) {
    customDispatch(detail);
  } else {
    dispatchDocCalculatorLaunch(buildDocScalarCalculatorLaunch({
      latex,
      docPath: detail.sourcePath,
      anchor: detail.anchor,
    }));
  }
  const clipboardWrite = context.clipboardWrite;
  if (clipboardWrite) {
    void clipboardWrite(latex).catch(() => undefined);
  }
}

const DOC_MARKED_OPTIONS: MarkedOptions & { mangle?: boolean; headerIds?: boolean } = {
  gfm: true,
  breaks: true,
  headerIds: true,
  mangle: false,
};

let activeMarkedDocPath: string | null = null;

marked.setOptions(DOC_MARKED_OPTIONS);
marked.use({
  extensions: [
    {
      name: "docMathBlock",
      level: "block",
      start(src: string) {
        const bracketStart = src.indexOf("\\[");
        const dollarStart = src.indexOf("$$");
        if (bracketStart === -1) return dollarStart;
        if (dollarStart === -1) return bracketStart;
        return Math.min(bracketStart, dollarStart);
      },
      tokenizer(src: string) {
        const bracketMatch = src.match(/^\\\[\n?([\s\S]+?)\n?\\\](?:\n|$)/);
        if (bracketMatch) {
          return {
            type: "docMathBlock",
            raw: bracketMatch[0],
            text: bracketMatch[1].trim(),
          };
        }
        const dollarMatch = src.match(/^\$\$\n?([\s\S]+?)\n?\$\$(?:\n|$)/);
        if (dollarMatch) {
          return {
            type: "docMathBlock",
            raw: dollarMatch[0],
            text: dollarMatch[1].trim(),
          };
        }
        return undefined;
      },
      renderer(token: Tokens.Generic) {
        return renderDocMath(typeof token.text === "string" ? token.text : "", true, activeMarkedDocPath);
      },
    },
    {
      name: "docMathInline",
      level: "inline",
      start(src: string) {
        return src.indexOf("\\(");
      },
      tokenizer(src: string) {
        const inlineMatch = src.match(/^\\\((.+?)\\\)/);
        if (!inlineMatch) return undefined;
        return {
          type: "docMathInline",
          raw: inlineMatch[0],
          text: inlineMatch[1].trim(),
        };
      },
      renderer(token: Tokens.Generic) {
        return renderDocMath(typeof token.text === "string" ? token.text : "", false, activeMarkedDocPath);
      },
    },
  ],
  renderer: {
    code(token) {
      return renderDocRuntimeCodeBlock(token.text, token.lang, activeMarkedDocPath);
    },
    codespan(token) {
      return renderDocRuntimeCodeSpan(token.text, activeMarkedDocPath);
    },
  },
});

const DOC_AUTO_READ_PROVIDER = "elevenlabs";
const DOC_AUTO_READ_PROFILE_ID = "vU0dJF9WOwsWEUfX1Aqw";
const DOC_AUTO_READ_CHUNK_MAX = 560;
const DOC_AUTO_READ_MAX_CHARS = 12_000;
const DOC_AUTO_READ_TAG = "helix-doc-reader";
const DOC_AUTO_READ_ACTIVE_CLASS = "doc-read-active-section";
const DOC_NARRATOR_BLOCK_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,blockquote,td,th,pre";

let globalDocReadController: AbortController | null = null;
let globalDocReadAudio: HTMLAudioElement | null = null;
let globalDocReadUrl: string | null = null;
let globalDocReadKey: string | null = null;

function stopGlobalDocRead() {
  if (globalDocReadController) {
    globalDocReadController.abort();
    globalDocReadController = null;
  }
  if (globalDocReadAudio) {
    globalDocReadAudio.pause();
    globalDocReadAudio.src = "";
    globalDocReadAudio = null;
  }
  if (globalDocReadUrl) {
    URL.revokeObjectURL(globalDocReadUrl);
    globalDocReadUrl = null;
  }
  globalDocReadKey = null;
}

export function DocViewerPanel() {
  const {
    mode,
    currentPath,
    anchor,
    pendingAutoReadNonce,
    viewDirectory,
    viewDoc,
    clearPendingAutoRead,
    applyIntent,
  } = useDocViewerStore();
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const documentTranslationAccountLocale = interfaceLanguage.bcp47;
  const documentTranslationTargetLanguage = React.useMemo(
    () => resolveDocumentTranslationTargetLanguage(documentTranslationAccountLocale),
    [documentTranslationAccountLocale],
  );
  const { t } = useInterfaceText(interfaceLanguage.code);
  const [query, setQuery] = React.useState("");
  const [researchLibraryDocuments, setResearchLibraryDocuments] = React.useState<HelixResearchLibraryDocumentSummary[]>([]);
  const [researchLibraryStatus, setResearchLibraryStatus] = React.useState<"loading" | "ready" | "signed_out" | "error">("loading");
  const [researchLibraryError, setResearchLibraryError] = React.useState<string | null>(null);
  const [researchLibraryMutationError, setResearchLibraryMutationError] = React.useState<string | null>(null);
  const [deletingResearchDocumentId, setDeletingResearchDocumentId] = React.useState<string | null>(null);
  const [activeResearchDocument, setActiveResearchDocument] = React.useState<HelixResearchLibraryDocument | null>(null);
  const activeResearchDocumentRef = React.useRef<HelixResearchLibraryDocument | null>(null);
  const [docClassFilter, setDocClassFilter] = React.useState<DocTaxonomyFilter>("all");
  const [directorySort, setDirectorySort] = React.useState<DocDirectorySort>("last-edited");
  const [html, setHtml] = React.useState<string>("");
  const [rawMarkdown, setRawMarkdown] = React.useState<string>("");
  const [inlineTranslationEnabled, setInlineTranslationEnabled] = React.useState(false);
  const [inlineTranslations, setInlineTranslations] = React.useState<Record<string, InlineTranslationState>>({});
  const [translationStatus, setTranslationStatus] = React.useState<DocumentTranslationUiStatus>("idle");
  const [translationError, setTranslationError] = React.useState<string | null>(null);
  const [accountPolicy, setAccountPolicy] = React.useState<HelixAccountCapabilityPolicy | null>(
    () => readCachedAccountCapabilityPolicy(),
  );
  const [pdfExportStatus, setPdfExportStatus] = React.useState<"idle" | "exporting" | "ready" | "error">("idle");
  const [pdfExportMessage, setPdfExportMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loadedDocId, setLoadedDocId] = React.useState<string | null>(null);
  const [isAutoReading, setIsAutoReading] = React.useState(false);
  const [autoReadError, setAutoReadError] = React.useState<string | null>(null);
  const [proceduralStatus, setProceduralStatus] = React.useState<string | null>(null);
  const [followLiveRead, setFollowLiveRead] = React.useState(true);
  const [readProgress, setReadProgress] = React.useState<{
    chunkIndex: number;
    chunkCount: number;
    snippet: string;
  } | null>(null);
  const [selectedVisibleText, setSelectedVisibleText] = React.useState<{
    text: string;
    selectionRef: string;
    bbox: HelixVisibleTranslationRegionBbox | null;
  } | null>(null);
  const [hoveredVisibleText, setHoveredVisibleText] = React.useState<{
    text: string;
    hoverRef: string;
    bbox: HelixVisibleTranslationRegionBbox | null;
  } | null>(null);
  const [translationReticleViewportTick, setTranslationReticleViewportTick] = React.useState(0);
  const rememberPanelScroll = useWorkstationSessionMemoryStore((state) => state.rememberPanelScroll);
  const readPanelScroll = useWorkstationSessionMemoryStore((state) => state.readPanelScroll);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const activeReadTargetRef = React.useRef<HTMLElement | null>(null);
  const activeInlineTranslationReticleTargetRef = React.useRef<HTMLElement | null>(null);
  const translationReticleRefreshFrameRef = React.useRef<number | null>(null);
  const modeRef = React.useRef(mode);
  const followLiveReadRef = React.useRef(followLiveRead);
  const liveReadChunkRef = React.useRef<string | null>(null);
  const lastProceduralTraceIdRef = React.useRef<string | null>(null);
  const visibleTranslationScanTimerRef = React.useRef<number | null>(null);
  const inFlightTranslationUnitIdsRef = React.useRef<Set<string>>(new Set());
  const documentTranslationChunkInFlightRef = React.useRef(false);
  const documentTranslationChunkIndexRef = React.useRef(0);
  const translationScopeKeyRef = React.useRef<string | null>(null);
  const researchDocumentReadControllerRef = React.useRef<AbortController | null>(null);
  const pdfExportControllerRef = React.useRef<AbortController | null>(null);
  const currentEntry = React.useMemo(() => (currentPath ? findDocEntry(currentPath) : null), [currentPath]);
  const displayEntry = React.useMemo<DocManifestEntry | null>(() => {
    if (!activeResearchDocument) return currentEntry;
    const relativePath = `My Research Library / ${activeResearchDocument.title}`;
    return {
      id: activeResearchDocument.document_id,
      route: `/research-library/${encodeURIComponent(activeResearchDocument.document_id)}`,
      relativePath,
      folderChain: ["My Research Library"],
      folderLabel: "My Research Library",
      subjectLabel: "Private research extraction",
      catalogDate: activeResearchDocument.updated_at.slice(0, 10),
      catalogDateSource: null,
      fileMtimeIso: activeResearchDocument.updated_at,
      fileMtimeMs: Date.parse(activeResearchDocument.updated_at),
      sizeBytes: activeResearchDocument.text_char_count,
      docClass: null,
      bundleKind: "private-research-extraction",
      canonical: false,
      sidecars: activeResearchDocument.sidecar_refs.map((sidecar) => sidecar.artifact_ref),
      toolHints: { source: "research_library", private: true },
      title: activeResearchDocument.title,
      searchText: `${activeResearchDocument.title} ${relativePath}`.toLowerCase(),
      loader: async () => researchLibraryDocumentToMarkdown(activeResearchDocument),
    };
  }, [activeResearchDocument, currentEntry]);
  const activeDocument = React.useMemo(
    () => resolveActiveDocViewerDocument({
      mode,
      currentEntry,
      displayEntry,
      activeResearchDocument,
    }),
    [activeResearchDocument, currentEntry, displayEntry, mode],
  );

  React.useEffect(() => {
    setSelectedVisibleText(null);
    setHoveredVisibleText(null);
    pdfExportControllerRef.current?.abort();
    pdfExportControllerRef.current = null;
    setPdfExportStatus("idle");
    setPdfExportMessage(null);
  }, [activeDocument?.docPath]);

  React.useEffect(() => {
    let mounted = true;
    const applyPolicy = (policy: HelixAccountCapabilityPolicy | null | undefined) => {
      if (mounted) setAccountPolicy(policy ?? null);
    };
    applyPolicy(readCachedAccountCapabilityPolicy());
    void fetchAccountCapabilityPolicy().then(applyPolicy).catch(() => undefined);
    const handlePolicyChange = (event: Event) => {
      const detail = (event as CustomEvent<{
        account_policy?: HelixAccountCapabilityPolicy | null;
      }>).detail;
      applyPolicy(detail?.account_policy);
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, handlePolicyChange);
    return () => {
      mounted = false;
      pdfExportControllerRef.current?.abort();
      pdfExportControllerRef.current = null;
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, handlePolicyChange);
    };
  }, []);

  React.useEffect(() => {
    activeResearchDocumentRef.current = activeResearchDocument;
  }, [activeResearchDocument]);

  const cancelResearchDocumentRead = React.useCallback(() => {
    researchDocumentReadControllerRef.current?.abort();
    researchDocumentReadControllerRef.current = null;
  }, []);

  const clearActiveResearchDocumentState = React.useCallback(() => {
    cancelResearchDocumentRead();
    clearActiveDocVisibleTranslationContext();
    clearDocumentLiveTranslationProjectionRegistry();
    clearHelixVisibleTranslationProjectionContext();
    clearHelixAccountLanguageTranslationProjectionContext();
    const storedScopeKey = translationScopeKeyRef.current;
    if (storedScopeKey && typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(`${DOC_INLINE_TRANSLATION_SESSION_PREFIX}:${storedScopeKey}`);
      } catch {
        // Private-session cleanup remains best-effort when storage is unavailable.
      }
    }
    translationScopeKeyRef.current = null;
    inFlightTranslationUnitIdsRef.current.clear();
    documentTranslationChunkInFlightRef.current = false;
    documentTranslationChunkIndexRef.current = 0;
    activeResearchDocumentRef.current = null;
    setActiveResearchDocument(null);
    setRawMarkdown("");
    setHtml("");
    setLoadedDocId(null);
    setInlineTranslationEnabled(false);
    setInlineTranslations({});
    setTranslationStatus("idle");
    setTranslationError(null);
    setSelectedVisibleText(null);
    setHoveredVisibleText(null);
  }, [cancelResearchDocumentRead]);

  React.useEffect(() => {
    let refreshController: AbortController | null = null;
    const refresh = (showLoading: boolean) => {
      refreshController?.abort();
      const controller = new AbortController();
      refreshController = controller;
      if (showLoading) setResearchLibraryStatus("loading");
      setResearchLibraryError(null);
      void listResearchLibraryDocuments(controller.signal)
        .then((documents) => {
          if (controller.signal.aborted) return;
          setResearchLibraryDocuments(documents);
          setResearchLibraryStatus("ready");
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : "Research Library unavailable";
          setResearchLibraryStatus(message.includes("Sign in") || message.includes("profile_session_required") ? "signed_out" : "error");
          setResearchLibraryError(message);
        });
    };
    refresh(true);
    const refreshOnFocus = () => refresh(false);
    const resetPrivateResearchForAccountBoundary = () => {
      clearStoredPrivateResearchInlineTranslationSessions();
      clearDocumentLiveTranslationProjectionRegistry();
      clearHelixVisibleTranslationProjectionContext();
      clearHelixAccountLanguageTranslationProjectionContext();
      if (activeResearchDocumentRef.current) {
        clearActiveResearchDocumentState();
      } else {
        cancelResearchDocumentRead();
      }
      setResearchLibraryDocuments([]);
      refresh(true);
    };
    const refreshOnAccountPolicyChange = (event: Event) => {
      const detail = (event as CustomEvent<{
        account_profile_id?: string | null;
        account_profile_changed?: boolean;
        account_profile_revision?: number;
      }>).detail;
      const activeResearchProfileId = activeResearchDocumentRef.current?.profile_id ?? null;
      const accountProfileIdentityKnown = detail && "account_profile_id" in detail;
      const activeProfileMismatch = Boolean(
        activeResearchProfileId &&
        accountProfileIdentityKnown &&
        detail.account_profile_id !== activeResearchProfileId,
      );
      if (!activeProfileMismatch && detail?.account_profile_changed !== true) return;
      if (typeof detail?.account_profile_revision === "number") {
        lastHandledAccountProfileRevision = Math.max(
          lastHandledAccountProfileRevision,
          detail.account_profile_revision,
        );
      }
      resetPrivateResearchForAccountBoundary();
    };
    const interval = window.setInterval(() => refresh(false), 15_000);
    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, refreshOnAccountPolicyChange);
    const accountProfileIdentity = readCachedAccountProfileIdentity();
    if (accountProfileIdentity.revision > lastHandledAccountProfileRevision) {
      lastHandledAccountProfileRevision = accountProfileIdentity.revision;
      resetPrivateResearchForAccountBoundary();
    }
    return () => {
      refreshController?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, refreshOnAccountPolicyChange);
    };
  }, [cancelResearchDocumentRead, clearActiveResearchDocumentState]);

  React.useEffect(() => () => cancelResearchDocumentRead(), [cancelResearchDocumentRead]);

  React.useEffect(() => {
    if (
      !activeResearchDocument ||
      researchLibraryStatus === "loading" ||
      researchLibraryStatus === "error"
    ) return;
    const activeDocumentStillOwned = researchLibraryStatus === "ready" && researchLibraryDocuments.some((document) =>
      document.document_id === activeResearchDocument.document_id &&
      document.profile_id === activeResearchDocument.profile_id &&
      document.viewer_ref === activeResearchDocument.viewer_ref
    );
    if (!activeDocumentStillOwned) clearActiveResearchDocumentState();
  }, [
    activeResearchDocument,
    clearActiveResearchDocumentState,
    researchLibraryDocuments,
    researchLibraryStatus,
  ]);

  const handleSelectResearchDocument = React.useCallback((documentId: string) => {
    cancelResearchDocumentRead();
    const controller = new AbortController();
    researchDocumentReadControllerRef.current = controller;
    clearActiveDocVisibleTranslationContext();
    setActiveResearchDocument(null);
    setLoading(true);
    setError(null);
    void readResearchLibraryDocument(documentId, controller.signal)
      .then((document) => {
        if (controller.signal.aborted || researchDocumentReadControllerRef.current !== controller) return;
        setActiveResearchDocument(document);
        setResearchLibraryDocuments((current) => current.map((entry) => {
          if (entry.document_id !== document.document_id) return entry;
          const { pages: _pages, ...summary } = document;
          return { ...summary, raw_content_included: false };
        }));
      })
      .catch((loadError) => {
        if (controller.signal.aborted || researchDocumentReadControllerRef.current !== controller) return;
        setError(loadError instanceof Error ? loadError.message : "Research document could not be loaded.");
      })
      .finally(() => {
        if (researchDocumentReadControllerRef.current !== controller) return;
        researchDocumentReadControllerRef.current = null;
        setLoading(false);
      });
  }, [cancelResearchDocumentRead]);

  const handleDeleteResearchDocument = React.useCallback((documentId: string, title: string) => {
    const confirmed = typeof window === "undefined" || typeof window.confirm !== "function"
      ? true
      : window.confirm(`Delete “${title}” from My Research Library? This removes the saved extraction from your private library.`);
    if (!confirmed) return;
    cancelResearchDocumentRead();
    setDeletingResearchDocumentId(documentId);
    setResearchLibraryMutationError(null);
    void deleteResearchLibraryDocument(documentId)
      .then(() => {
        clearActiveDocVisibleTranslationContext();
        setResearchLibraryDocuments((current) => current.filter((entry) => entry.document_id !== documentId));
        setActiveResearchDocument((current) => current?.document_id === documentId ? null : current);
      })
      .catch((deleteError) => {
        setResearchLibraryMutationError(
          deleteError instanceof Error ? deleteError.message : "Research document could not be deleted.",
        );
      })
      .finally(() => setDeletingResearchDocumentId((current) => current === documentId ? null : current));
  }, [cancelResearchDocumentRead]);

  const handleSelectCanonicalDoc = React.useCallback((path: string) => {
    cancelResearchDocumentRead();
    clearActiveDocVisibleTranslationContext();
    setActiveResearchDocument(null);
    viewDoc(path);
  }, [cancelResearchDocumentRead, viewDoc]);
  const rawMarkdownSourceHash = React.useMemo(
    () => (rawMarkdown ? hashDocumentSource(rawMarkdown) : null),
    [rawMarkdown],
  );
  const translationUnits = React.useMemo(
    () => (rawMarkdown ? segmentMarkdownForTranslation(rawMarkdown) : []),
    [rawMarkdown],
  );
  const activeDocumentContentReady = Boolean(
    activeDocument && loadedDocId === activeDocument.documentId && rawMarkdown,
  );
  const canExportPrintPdf = Boolean(
    activeDocumentContentReady &&
    (accountPolicy ?? HELIX_USER_ACCOUNT_POLICY).feature_flags.includes(
      DOCS_PRINT_PDF_FEATURE_FLAG,
    ) &&
    !(accountPolicy ?? HELIX_USER_ACCOUNT_POLICY).locked_features.includes(
      DOCS_PRINT_PDF_FEATURE_FLAG,
    ),
  );
  const translationEligible = isActiveDocViewerTranslationEligible({
    contentReady: activeDocumentContentReady,
    documentSourceKind: activeDocument?.documentSourceKind ?? null,
    interfaceLanguageCode: interfaceLanguage.code,
  });
  const liveTranslationProjectionEligible =
    activeDocumentContentReady && translationUnits.length > 0;
  const activeLiveTranslationSourceIdentityKey = React.useMemo(
    () =>
      activeDocument && translationEligible && rawMarkdownSourceHash
        ? buildDocumentTranslationSourceIdentityKey({
          sourceId: activeDocument.sourceId,
          sourceHash: rawMarkdownSourceHash,
          sourceTextHash: rawMarkdownSourceHash,
          sourceTextCharCount: rawMarkdown.length,
          accountLocale: documentTranslationAccountLocale,
          targetLanguage: documentTranslationTargetLanguage,
        })
        : null,
    [
      activeDocument,
      documentTranslationTargetLanguage,
      documentTranslationAccountLocale,
      rawMarkdown.length,
      rawMarkdownSourceHash,
      translationEligible,
    ],
  );
  const liveTranslationProjectionSnapshot = React.useSyncExternalStore(
    subscribeDocumentLiveTranslationProjectionRegistry,
    () =>
      activeDocument && liveTranslationProjectionEligible
        ? readDocumentLiveTranslationProjectionSnapshot({
          docPath: activeDocument.docPath,
          locale: documentTranslationAccountLocale,
          sourceHash: rawMarkdownSourceHash,
          projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
        })
        : EMPTY_LIVE_TRANSLATION_PROJECTION_SNAPSHOT,
    () => EMPTY_LIVE_TRANSLATION_PROJECTION_SNAPSHOT,
  );
  const liveTranslationProjectionSummary = React.useMemo(
    () => summarizeDocumentLiveTranslationProjectionSnapshot(liveTranslationProjectionSnapshot),
    [liveTranslationProjectionSnapshot],
  );
  const accountLanguageTranslationProjections = React.useSyncExternalStore(
    subscribeHelixAccountLanguageTranslationProjectionContext,
    readHelixAccountLanguageTranslationProjectionContext,
    readHelixAccountLanguageTranslationProjectionContext,
  );
  const [visibleUiRegionBboxes, setVisibleUiRegionBboxes] = React.useState<
    Record<string, HelixVisibleTranslationRegionBbox | null>
  >({});
  const handleVisibleTranslationRegionBboxesChange = React.useCallback(
    (next: Record<string, HelixVisibleTranslationRegionBbox | null>) => {
      setVisibleUiRegionBboxes((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next
      );
    },
    [],
  );
  const visibleTranslationProjections = React.useSyncExternalStore(
    subscribeHelixVisibleTranslationProjectionContext,
    readHelixVisibleTranslationProjectionContext,
    readHelixVisibleTranslationProjectionContext,
  );
  const hoveredTranslationProjection = React.useMemo(() => {
    if (!activeDocument || !hoveredVisibleText) return null;
    return selectHelixVisibleTranslationProjection({
      states: visibleTranslationProjections,
      projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_HOVER,
      sourceId: `${activeDocument.sourceId}#${hoveredVisibleText.hoverRef}`,
      regionId: hoveredVisibleText.hoverRef,
      docPath: activeDocument.docPath,
      chunkId: hoveredVisibleText.hoverRef,
      accountLocale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
    });
  }, [
    activeDocument,
    documentTranslationTargetLanguage,
    documentTranslationAccountLocale,
    hoveredVisibleText,
    visibleTranslationProjections,
  ]);
  const selectedTranslationProjection = React.useMemo(() => {
    if (!activeDocument || !selectedVisibleText) return null;
    return selectHelixVisibleTranslationProjection({
      states: visibleTranslationProjections,
      projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_SELECTION,
      sourceId: `${activeDocument.sourceId}#${selectedVisibleText.selectionRef}`,
      regionId: selectedVisibleText.selectionRef,
      docPath: activeDocument.docPath,
      chunkId: selectedVisibleText.selectionRef,
      accountLocale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
    });
  }, [
    activeDocument,
    documentTranslationTargetLanguage,
    documentTranslationAccountLocale,
    selectedVisibleText,
    visibleTranslationProjections,
  ]);
  const activeDocVisibleUiTextRegions = React.useMemo(() => {
    if (!activeDocument) return [];
    const translateButtonSourceText = inlineTranslationEnabled
      ? t("docsViewer.translation.hideInline")
      : translationStatus === "translating"
        ? t("docsViewer.translation.generating")
        : t("docsViewer.translation.generateInline");
    const existingTranslateButtonProjection = selectHelixAccountLanguageTranslationProjection({
      states: accountLanguageTranslationProjections,
      panelId: "docs-viewer",
      regionId: DOC_VIEWER_TRANSLATE_BUTTON_REGION_ID,
      docPath: activeDocument.docPath,
      sourceId: DOC_VIEWER_TRANSLATE_BUTTON_SOURCE_ID,
      accountLocale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
    });
    const existingTitleProjection = selectHelixAccountLanguageTranslationProjection({
      states: accountLanguageTranslationProjections,
      panelId: "docs-viewer",
      regionId: DOC_VIEWER_TITLE_TRANSLATION_REGION_ID,
      docPath: activeDocument.docPath,
      sourceId: DOC_VIEWER_TITLE_TRANSLATION_SOURCE_ID,
      accountLocale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
    });
    return [
      {
        sourceText: activeDocument.entry.title,
        sourceId: DOC_VIEWER_TITLE_TRANSLATION_SOURCE_ID,
        regionId: DOC_VIEWER_TITLE_TRANSLATION_REGION_ID,
        bbox: visibleUiRegionBboxes[DOC_VIEWER_TITLE_TRANSLATION_REGION_ID] ?? null,
        sourceKind: "panel_text" as const,
        existingObservationRef: existingTitleProjection.observationRef,
        existingReceiptRef: existingTitleProjection.receiptRef,
        existingProjectionStatus: existingTitleProjection.status === "ready"
          ? "projected"
          : existingTitleProjection.status === "empty"
            ? null
            : existingTitleProjection.status,
        existingFreshnessStatus: existingTitleProjection.freshnessStatus,
        existingTerminalAuthorityStatus: existingTitleProjection.terminalAuthorityStatus,
        existingSourceEventMs: existingTitleProjection.sourceEventMs,
        existingObservedAtMs: existingTitleProjection.observedAtMs,
      },
      {
        sourceText: translateButtonSourceText,
        sourceId: DOC_VIEWER_TRANSLATE_BUTTON_SOURCE_ID,
        regionId: DOC_VIEWER_TRANSLATE_BUTTON_REGION_ID,
        bbox: visibleUiRegionBboxes[DOC_VIEWER_TRANSLATE_BUTTON_REGION_ID] ?? null,
        sourceKind: "button_label" as const,
        existingObservationRef: existingTranslateButtonProjection.observationRef,
        existingReceiptRef: existingTranslateButtonProjection.receiptRef,
        existingProjectionStatus: existingTranslateButtonProjection.status === "ready"
          ? "projected"
          : existingTranslateButtonProjection.status === "empty"
            ? null
            : existingTranslateButtonProjection.status,
        existingFreshnessStatus: existingTranslateButtonProjection.freshnessStatus,
        existingTerminalAuthorityStatus: existingTranslateButtonProjection.terminalAuthorityStatus,
        existingSourceEventMs: existingTranslateButtonProjection.sourceEventMs,
        existingObservedAtMs: existingTranslateButtonProjection.observedAtMs,
      },
    ];
  }, [
    accountLanguageTranslationProjections,
    activeDocument,
    documentTranslationTargetLanguage,
    documentTranslationAccountLocale,
    inlineTranslationEnabled,
    interfaceLanguage.code,
    t,
    translationStatus,
    visibleUiRegionBboxes,
  ]);
  const activeTranslationScopeKey = React.useMemo(
    () =>
      translationEligible && activeDocument && rawMarkdownSourceHash
        ? [
          activeDocument.docPath,
          documentTranslationAccountLocale,
          documentTranslationTargetLanguage,
          rawMarkdownSourceHash,
      activeLiveTranslationSourceIdentityKey ?? "no-source-identity",
        ].join(":")
        : null,
    [
      activeLiveTranslationSourceIdentityKey,
      activeDocument,
      documentTranslationAccountLocale,
      documentTranslationTargetLanguage,
      rawMarkdownSourceHash,
      translationEligible,
    ],
  );
  const hasLoadingInlineTranslations = React.useMemo(
    () => Object.values(inlineTranslations).some((translation) => translation.status === "loading"),
    [inlineTranslations],
  );

  React.useEffect(() => {
    if (
      !translationEligible ||
      !activeDocument ||
      !rawMarkdownSourceHash ||
      !activeTranslationScopeKey
    ) {
      return;
    }
    if (activeDocument.privateSource) return;
    const controller = new AbortController();
    const sourceId = activeDocument.sourceId;
    const sourceIdentityKey = activeLiveTranslationSourceIdentityKey ?? buildDocumentTranslationSourceIdentityKey({
      sourceId,
      sourceHash: rawMarkdownSourceHash,
      sourceTextHash: rawMarkdownSourceHash,
      sourceTextCharCount: rawMarkdown.length,
      accountLocale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
    });

    void listDocumentMarkdownTranslationLaneSessions({
      docPath: activeDocument.docPath,
      locale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
      accountLocale: documentTranslationAccountLocale,
      sourceHash: rawMarkdownSourceHash,
      sourceTextHash: rawMarkdownSourceHash,
      sourceTextCharCount: rawMarkdown.length,
      sourceId,
      sourceIdentityKey,
      projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
      agentRuntime: "helix",
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        emitDocumentTranslationLaneSessionControlEvents({
          response: response as Record<string, unknown>,
          sourceId,
          sourceHash: rawMarkdownSourceHash,
          sourceIdentityKey,
          latestSourceIdentityKey: sourceIdentityKey,
        });
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        console.warn("Document translation lane session inspection failed", err);
      });

    return () => controller.abort();
  }, [
    activeLiveTranslationSourceIdentityKey,
    activeTranslationScopeKey,
    activeDocument,
    documentTranslationAccountLocale,
    documentTranslationTargetLanguage,
    rawMarkdown,
    rawMarkdownSourceHash,
    translationEligible,
  ]);

  const inlineTranslationMarkdown = React.useMemo(() => {
    if (!translationUnits.length) return rawMarkdown;
    return renderDocumentMarkdownWithInlineTranslations({
      units: translationUnits,
      translations: inlineTranslationEnabled ? inlineTranslations : {},
      loadingText: t("docsViewer.translation.inlineLoading"),
      errorText: (reason) => t("docsViewer.translation.inlineError", { reason }),
      fallbackErrorText: t("docsViewer.translation.errorGeneric"),
    });
  }, [inlineTranslationEnabled, inlineTranslations, rawMarkdown, t, translationUnits]);
  const activeHtml = React.useMemo(() => {
    if (!activeDocument) return html;
    if (!activeDocumentContentReady) return "";
    return renderDocumentMarkdownToHtml(inlineTranslationMarkdown, activeDocument.renderPath);
  }, [activeDocument, activeDocumentContentReady, html, inlineTranslationMarkdown]);
  const docScrollMemoryKey = React.useMemo(
    () => activeResearchDocument
      ? `docs-viewer:research-library:${activeResearchDocument.viewer_ref}`
      : mode === "doc" && currentPath
        ? `docs-viewer:doc:${currentPath}`
        : "docs-viewer:directory",
    [activeResearchDocument, currentPath, mode],
  );

  React.useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  React.useEffect(() => {
    followLiveReadRef.current = followLiveRead;
  }, [followLiveRead]);

  React.useEffect(() => {
    const intent = consumeDocViewerIntent();
    if (intent) {
      applyIntent(intent);
    }
  }, [applyIntent]);

  React.useEffect(() => {
    if (activeResearchDocument) {
      const raw = researchLibraryDocumentToMarkdown(activeResearchDocument);
      setRawMarkdown(raw);
      setHtml(renderDocumentMarkdownToHtml(raw, displayEntry?.relativePath));
      setLoadedDocId(activeResearchDocument.document_id);
      setError(null);
      setLoading(false);
      return;
    }
    if (mode !== "doc" || !currentEntry) {
      setHtml("");
      setRawMarkdown("");
      setInlineTranslationEnabled(false);
      setInlineTranslations({});
      setTranslationStatus("idle");
      setTranslationError(null);
      setError(null);
      setLoading(false);
      setLoadedDocId(null);
      return;
    }
    let canceled = false;
    setLoading(true);
    setError(null);
    setLoadedDocId(null);
    currentEntry
      .loader()
      .then((raw) => {
        if (canceled) return;
        setRawMarkdown(raw);
        setHtml(renderDocumentMarkdownToHtml(raw, currentEntry.relativePath));
        setLoadedDocId(currentEntry.id);
      })
      .catch((err) => {
        if (canceled) return;
        setError(err instanceof Error ? err.message : t("docsViewer.error.render"));
        setHtml("");
        setRawMarkdown("");
        setLoadedDocId(currentEntry.id);
      })
      .finally(() => {
        if (!canceled) {
          setLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [activeResearchDocument, displayEntry?.relativePath, mode, currentEntry, t]);

  React.useEffect(() => {
    if (!activeDocument || !activeDocumentContentReady || !rawMarkdownSourceHash || translationUnits.length === 0) {
      clearActiveDocVisibleTranslationContext(activeDocument?.docPath ?? null);
      return;
    }
    publishActiveDocVisibleTranslationContext(
      buildActiveDocVisibleTranslationContext({
        docPath: activeDocument.docPath,
        title: activeDocument.entry.title,
        documentSourceKind: activeDocument.documentSourceKind,
        documentRef: activeDocument.documentRef,
        privateSource: activeDocument.privateSource,
        rawMarkdown,
        rawMarkdownSourceHash,
        units: translationUnits,
        existingTranslations: liveTranslationProjectionSnapshot.translations,
        accountLocale: documentTranslationAccountLocale,
        targetLanguage: documentTranslationTargetLanguage,
        uiTextRegions: activeDocVisibleUiTextRegions,
        selectedText: selectedVisibleText?.text ?? null,
        selectionRef: selectedVisibleText?.selectionRef ?? null,
        selectionBbox: selectedVisibleText?.bbox ?? null,
        selectionExistingProjection: visibleProjectionToExistingTranslation(selectedTranslationProjection),
        hoverText: hoveredVisibleText?.text ?? null,
        hoverRef: hoveredVisibleText?.hoverRef ?? null,
        hoverBbox: hoveredVisibleText?.bbox ?? null,
        hoverExistingProjection: visibleProjectionToExistingTranslation(hoveredTranslationProjection),
      }),
    );
    return () => clearActiveDocVisibleTranslationContext(activeDocument.docPath);
  }, [
    activeDocVisibleUiTextRegions,
    activeDocument,
    activeDocumentContentReady,
    documentTranslationAccountLocale,
    documentTranslationTargetLanguage,
    liveTranslationProjectionSnapshot.translations,
    hoveredTranslationProjection,
    hoveredVisibleText,
    rawMarkdown,
    rawMarkdownSourceHash,
    selectedTranslationProjection,
    selectedVisibleText,
    translationUnits,
  ]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeDocument || !activeDocumentContentReady || !rawMarkdownSourceHash || translationUnits.length === 0) return;
    const container = contentRef.current;
    if (!container) return;
    let animationFrame = 0;
    const publishVisibleContext = () => {
      const visibleUnitIds = collectNearViewportTranslationUnitIds({
        container,
        units: translationUnits,
        maxUnits: DOC_TRANSLATION_MAX_UNITS_PER_CHUNK,
        maxChars: DOC_TRANSLATION_MAX_CHARS_PER_CHUNK,
      });
      if (visibleUnitIds.length === 0) return;
      publishActiveDocVisibleTranslationContext(
        buildActiveDocVisibleTranslationContext({
          docPath: activeDocument.docPath,
          title: activeDocument.entry.title,
          documentSourceKind: activeDocument.documentSourceKind,
          documentRef: activeDocument.documentRef,
          privateSource: activeDocument.privateSource,
          rawMarkdown,
          rawMarkdownSourceHash,
          units: translationUnits,
          visibleUnitIds,
          existingTranslations: liveTranslationProjectionSnapshot.translations,
          accountLocale: documentTranslationAccountLocale,
          targetLanguage: documentTranslationTargetLanguage,
          uiTextRegions: activeDocVisibleUiTextRegions,
          selectedText: selectedVisibleText?.text ?? null,
          selectionRef: selectedVisibleText?.selectionRef ?? null,
          selectionBbox: selectedVisibleText?.bbox ?? null,
          selectionExistingProjection: visibleProjectionToExistingTranslation(selectedTranslationProjection),
          hoverText: hoveredVisibleText?.text ?? null,
          hoverRef: hoveredVisibleText?.hoverRef ?? null,
          hoverBbox: hoveredVisibleText?.bbox ?? null,
          hoverExistingProjection: visibleProjectionToExistingTranslation(hoveredTranslationProjection),
        }),
      );
    };
    const schedulePublish = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        publishVisibleContext();
      });
    };
    schedulePublish();
    container.addEventListener("scroll", schedulePublish, { passive: true });
    window.addEventListener("resize", schedulePublish);
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      container.removeEventListener("scroll", schedulePublish);
      window.removeEventListener("resize", schedulePublish);
    };
  }, [
    activeHtml,
    activeDocVisibleUiTextRegions,
    activeDocument,
    activeDocumentContentReady,
    documentTranslationAccountLocale,
    documentTranslationTargetLanguage,
    liveTranslationProjectionSnapshot.translations,
    hoveredTranslationProjection,
    hoveredVisibleText,
    rawMarkdown,
    rawMarkdownSourceHash,
    selectedTranslationProjection,
    selectedVisibleText,
    translationUnits,
  ]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeDocument || !activeDocumentContentReady) {
      setSelectedVisibleText(null);
      return;
    }
    const container = contentRef.current;
    if (!container) return;
    const readSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setSelectedVisibleText(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const commonAncestor = range.commonAncestorContainer;
      const commonElement = commonAncestor.nodeType === window.Node.ELEMENT_NODE
        ? commonAncestor as Element
        : commonAncestor.parentElement;
      if (!commonElement || !container.contains(commonElement)) {
        setSelectedVisibleText(null);
        return;
      }
      const text = selection.toString().replace(/\s+/g, " ").trim().slice(0, DOC_TRANSLATION_MAX_CHARS_PER_CHUNK);
      if (!text) {
        setSelectedVisibleText(null);
        return;
      }
      setSelectedVisibleText({
        text,
        selectionRef: `docs-viewer:selection:${hashDocumentSource(text)}`,
        bbox: rectToVisibleTranslationBbox(range.getBoundingClientRect(), "docs-selection"),
      });
    };
    document.addEventListener("selectionchange", readSelection);
    container.addEventListener("mouseup", readSelection);
    container.addEventListener("keyup", readSelection);
    return () => {
      document.removeEventListener("selectionchange", readSelection);
      container.removeEventListener("mouseup", readSelection);
      container.removeEventListener("keyup", readSelection);
    };
  }, [activeDocument, activeDocumentContentReady]);

  React.useEffect(() => {
    if (!activeDocument || !activeDocumentContentReady || translationUnits.length === 0) {
      setHoveredVisibleText(null);
      return;
    }
    const container = contentRef.current;
    if (!container) return;
    const unitsById = new Map(translationUnits.map((unit) => [unit.unit_id, unit] as const));
    const readHover = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const marker = target?.closest<HTMLElement>("[data-doc-translation-anchor]");
      if (!marker || !container.contains(marker)) {
        setHoveredVisibleText(null);
        return;
      }
      const unitId = marker.dataset.docTranslationAnchor;
      const unit = unitId ? unitsById.get(unitId) : null;
      const text = unit?.translatable ? unit.source_markdown.replace(/\s+/g, " ").trim() : "";
      if (!unitId || !text) {
        setHoveredVisibleText(null);
        return;
      }
      setHoveredVisibleText({
        text: text.slice(0, DOC_TRANSLATION_MAX_CHARS_PER_CHUNK),
        hoverRef: `docs-viewer:hover:${unitId}`,
        bbox: rectToVisibleTranslationBbox(marker.getBoundingClientRect(), "docs-hover-anchor"),
      });
    };
    const clearHover = () => setHoveredVisibleText(null);
    container.addEventListener("mouseover", readHover);
    container.addEventListener("focusin", readHover);
    container.addEventListener("mouseleave", clearHover);
    return () => {
      container.removeEventListener("mouseover", readHover);
      container.removeEventListener("focusin", readHover);
      container.removeEventListener("mouseleave", clearHover);
    };
  }, [activeDocument, activeDocumentContentReady, translationUnits]);

  React.useEffect(() => {
    inFlightTranslationUnitIdsRef.current.clear();
    documentTranslationChunkIndexRef.current = 0;
    setTranslationError(null);
    translationScopeKeyRef.current = activeTranslationScopeKey;
    if (!activeTranslationScopeKey) {
      setInlineTranslationEnabled(false);
      setInlineTranslations({});
      setTranslationStatus("idle");
      return;
    }
    const stored = readStoredInlineTranslationSession(activeTranslationScopeKey, {
      sourceHash: rawMarkdownSourceHash,
      sourceIdentityKey: activeLiveTranslationSourceIdentityKey,
      sourceTextHash: rawMarkdownSourceHash,
      sourceTextCharCount: rawMarkdown.length,
      accountLocale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
    });
    setInlineTranslationEnabled(stored.enabled);
    setInlineTranslations(stored.translations);
    setTranslationStatus(
      stored.enabled
        ? Object.values(stored.translations).some((translation) => translation.status === "ready")
          ? "cached"
          : "ready"
        : "idle",
    );
  }, [
    activeTranslationScopeKey,
    activeLiveTranslationSourceIdentityKey,
    documentTranslationAccountLocale,
    documentTranslationTargetLanguage,
    rawMarkdown.length,
    rawMarkdownSourceHash,
  ]);

  React.useEffect(() => {
    if (!activeTranslationScopeKey) return;
    writeStoredInlineTranslationSession(activeTranslationScopeKey, {
      enabled: inlineTranslationEnabled,
      sourceHash: rawMarkdownSourceHash,
      sourceIdentityKey: activeLiveTranslationSourceIdentityKey,
      sourceTextHash: rawMarkdownSourceHash,
      sourceTextCharCount: rawMarkdown.length,
      accountLocale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
      translations: inlineTranslations,
    });
  }, [
    activeTranslationScopeKey,
    activeLiveTranslationSourceIdentityKey,
    inlineTranslationEnabled,
    inlineTranslations,
    documentTranslationAccountLocale,
    documentTranslationTargetLanguage,
    rawMarkdown.length,
    rawMarkdownSourceHash,
  ]);

  const scheduleInlineTranslationReticleRefresh = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (translationReticleRefreshFrameRef.current !== null) return;
    translationReticleRefreshFrameRef.current = window.requestAnimationFrame(() => {
      translationReticleRefreshFrameRef.current = null;
      setTranslationReticleViewportTick((tick) => tick + 1);
    });
  }, []);

  React.useEffect(() => {
    return () => {
      if (translationReticleRefreshFrameRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(translationReticleRefreshFrameRef.current);
      }
      translationReticleRefreshFrameRef.current = null;
    };
  }, []);

  React.useLayoutEffect(() => {
    const clearTranslationReticle = () => {
      clearDocTranslationReticleTarget(activeInlineTranslationReticleTargetRef.current);
      activeInlineTranslationReticleTargetRef.current = null;
    };
    if (!inlineTranslationEnabled || !activeDocument || !rawMarkdownSourceHash) {
      clearTranslationReticle();
      return;
    }
    const container = contentRef.current;
    if (!container) {
      clearTranslationReticle();
      return;
    }
    const reticleTarget = findActiveInlineTranslationReticleTarget({
      container,
      units: translationUnits,
      translations: inlineTranslations,
      inFlightIds: inFlightTranslationUnitIdsRef.current,
      sourceHash: rawMarkdownSourceHash,
      sourceIdentityKey: activeLiveTranslationSourceIdentityKey,
      maxUnits: DOC_TRANSLATION_MAX_UNITS_PER_CHUNK,
      maxChars: DOC_TRANSLATION_MAX_CHARS_PER_CHUNK,
    });
    if (!reticleTarget) {
      clearTranslationReticle();
      return;
    }
    if (activeInlineTranslationReticleTargetRef.current !== reticleTarget.element) {
      clearDocTranslationReticleTarget(activeInlineTranslationReticleTargetRef.current);
    }
    reticleTarget.element.classList.add(DOC_AUTO_READ_ACTIVE_CLASS);
    reticleTarget.element.setAttribute("data-doc-translation-reticle", reticleTarget.status);
    reticleTarget.element.setAttribute("data-doc-translation-reticle-unit-id", reticleTarget.unitId);
    activeInlineTranslationReticleTargetRef.current = reticleTarget.element;
  }, [
    activeHtml,
    activeDocument,
    activeLiveTranslationSourceIdentityKey,
    inlineTranslationEnabled,
    inlineTranslations,
    rawMarkdownSourceHash,
    translationReticleViewportTick,
    translationUnits,
  ]);

  React.useEffect(() => {
    if (!liveTranslationProjectionEligible) return;
    if (liveTranslationProjectionSnapshot.version <= 0) return;
    if (!shouldAutoEnableInlineTranslationProjection(liveTranslationProjectionSnapshot)) return;
    translationScopeKeyRef.current = activeTranslationScopeKey;
    setInlineTranslationEnabled(true);
    setInlineTranslations((current) =>
      mergeDocumentLiveTranslationInlineStates({
        current,
        laneStates: liveTranslationProjectionSnapshot.translations,
      })
    );
    setTranslationStatus((current) =>
      current === "error" || current === "unavailable" ? current : "cached"
    );
  }, [
    activeTranslationScopeKey,
    liveTranslationProjectionEligible,
    liveTranslationProjectionSnapshot,
  ]);

  React.useEffect(() => {
    if (!activeDocument || !liveTranslationProjectionEligible) return;
    const sourceId = activeDocument.sourceId;
    const projectionReceipts = visibleTranslationProjections
      .filter((state) => state.projectionTarget === HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK)
      .filter((state) => state.sourceId === sourceId)
      .filter((state) => state.docPath === activeDocument.docPath)
      .filter((state) => !state.sourceHash || state.sourceHash === rawMarkdownSourceHash)
      .map((state) => buildHelixLiveTranslationProjectionReceiptFromProjection(state.projection));

    if (projectionReceipts.length === 0) return;

    const laneStates = buildDocumentLiveTranslationInlineStates({
      payload: {
        capability_lane_projection_receipts: projectionReceipts,
      },
      docPath: activeDocument.docPath,
      locale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
      sourceHash: rawMarkdownSourceHash,
      units: translationUnits,
      projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
      allowStaleDisplayText: inlineTranslationEnabled,
    });

    if (!shouldAutoEnableInlineTranslationProjection({ version: 1, translations: laneStates })) {
      return;
    }

    translationScopeKeyRef.current = activeTranslationScopeKey;
    setInlineTranslationEnabled(true);
    setInlineTranslations((current) =>
      mergeDocumentLiveTranslationInlineStates({
        current,
        laneStates,
      })
    );
    setTranslationStatus((current) =>
      current === "error" || current === "unavailable" ? current : "cached"
    );
  }, [
    activeTranslationScopeKey,
    activeDocument,
    documentTranslationAccountLocale,
    documentTranslationTargetLanguage,
    inlineTranslationEnabled,
    liveTranslationProjectionEligible,
    rawMarkdownSourceHash,
    translationUnits,
    visibleTranslationProjections,
  ]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeDocument || !liveTranslationProjectionEligible) return;
    return installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: window,
      docPath: activeDocument.docPath,
      locale: documentTranslationAccountLocale,
      sourceHash: rawMarkdownSourceHash,
      projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
      units: translationUnits,
      allowStaleDisplayText: inlineTranslationEnabled,
    });
  }, [
    activeDocument,
    documentTranslationAccountLocale,
    inlineTranslationEnabled,
    liveTranslationProjectionEligible,
    rawMarkdown.length,
    rawMarkdownSourceHash,
    translationUnits,
  ]);

  React.useEffect(() => {
    if (!inlineTranslationEnabled) return;
    if (translationStatus === "error" || translationStatus === "unavailable") return;
    if (hasLoadingInlineTranslations) {
      if (translationStatus !== "translating") setTranslationStatus("translating");
      return;
    }
    const hasReady = Object.values(inlineTranslations).some((translation) => translation.status === "ready");
    setTranslationStatus(hasReady ? "cached" : "ready");
  }, [hasLoadingInlineTranslations, inlineTranslationEnabled, inlineTranslations, translationStatus]);

  React.useEffect(() => {
    if (mode !== "doc" || !anchor || !contentRef.current) return;
    const container = contentRef.current;
    const selector = `#${cssEscape(anchor)}`;
    const target = container.querySelector(selector) as HTMLElement | null;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.add("ring-2", "ring-cyan-400/70");
    if (typeof window === "undefined") return;
    const timeout = window.setTimeout(() => {
      target.classList.remove("ring-2", "ring-cyan-400/70");
    }, 1600);
    return () => window.clearTimeout(timeout);
  }, [activeHtml, anchor, mode]);

  React.useEffect(() => {
    if (!activeDocument || !contentRef.current) return;
    applyDocNarratorSourceIds(contentRef.current, activeDocument.docPath);
  }, [activeDocument, activeHtml]);

  React.useLayoutEffect(() => {
    if (mode !== "doc" || anchor || loading || !contentRef.current) return;
    const saved = readPanelScroll(docScrollMemoryKey);
    if (!saved) return;
    const node = contentRef.current;
    const restore = () => {
      const maxScrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
      node.scrollTop = Math.min(saved.scrollTop, maxScrollTop);
    };
    if (typeof window === "undefined") {
      restore();
      return;
    }
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(restore);
    });
    return () => window.cancelAnimationFrame(firstFrame);
  }, [activeHtml, anchor, docScrollMemoryKey, loading, mode, readPanelScroll]);

  const requestVisibleInlineTranslations = React.useCallback(async () => {
    if (
      !inlineTranslationEnabled ||
      !translationEligible ||
      !activeDocument ||
      !activeTranslationScopeKey ||
      !rawMarkdownSourceHash ||
      translationStatus === "error" ||
      translationStatus === "unavailable" ||
      documentTranslationChunkInFlightRef.current ||
      !contentRef.current
    ) {
      return;
    }
    const targetIds = collectVisibleTranslationUnitIds({
      container: contentRef.current,
      units: translationUnits,
      translations: inlineTranslations,
      inFlightIds: inFlightTranslationUnitIdsRef.current,
      sourceHash: rawMarkdownSourceHash,
      sourceIdentityKey: activeLiveTranslationSourceIdentityKey,
      maxUnits: DOC_TRANSLATION_MAX_UNITS_PER_CHUNK,
      maxChars: DOC_TRANSLATION_MAX_CHARS_PER_CHUNK,
    });
    if (targetIds.length === 0) return;
    const targetSet = new Set(targetIds);
    const targetUnits = translationUnits.filter((unit) => targetSet.has(unit.unit_id));
    if (targetUnits.length === 0) return;
    const scopeKey = activeTranslationScopeKey;
    const laneSessionId = documentInlineTranslationLaneSessionId(scopeKey);
    const chunkIndex = documentTranslationChunkIndexRef.current + 1;
    const chunkId = `doc-inline:${rawMarkdownSourceHash}:${targetIds.join(",")}`;
    const sourceText = targetUnits.map((unit) => unit.source_markdown).join("\n\n");
    const pendingTranslationState = buildPendingDocumentInlineTranslationState({
      sourceId: activeDocument.sourceId,
      sourceHash: rawMarkdownSourceHash,
      sourceTextHash: hashDocumentSource(sourceText),
      sourceTextCharCount: sourceText.length,
      sourceIdentityKey: activeLiveTranslationSourceIdentityKey,
      latestSourceIdentityKey: activeLiveTranslationSourceIdentityKey,
      chunkId,
      chunkIndex,
      laneSessionId,
      accountLocale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
    });
    translationScopeKeyRef.current = scopeKey;
    documentTranslationChunkInFlightRef.current = true;
    documentTranslationChunkIndexRef.current = chunkIndex;
    targetIds.forEach((unitId) => inFlightTranslationUnitIdsRef.current.add(unitId));
    setTranslationStatus("translating");
    setTranslationError(null);
    setInlineTranslations((current) => {
      const next = { ...current };
      targetIds.forEach((unitId) => {
        next[unitId] = pendingTranslationState;
      });
      return next;
    });

    try {
      await enqueueDocumentMarkdownTranslationMail({
        docPath: activeDocument.docPath,
        locale: documentTranslationAccountLocale,
        targetLanguage: documentTranslationTargetLanguage,
        accountLocale: documentTranslationAccountLocale,
        sourceHash: rawMarkdownSourceHash,
        sourceTextHash: pendingTranslationState.sourceTextHash,
        sourceTextCharCount: pendingTranslationState.sourceTextCharCount,
        sourceIdentityKey: pendingTranslationState.sourceIdentityKey,
        latestSourceIdentityKey: pendingTranslationState.latestSourceIdentityKey ?? pendingTranslationState.sourceIdentityKey,
        title: activeDocument.entry.title,
        sourceId: activeDocument.sourceId,
        documentSourceKind: activeDocument.documentSourceKind,
        documentId: activeDocument.documentId,
        documentRef: activeDocument.documentRef,
        privateSource: activeDocument.privateSource,
        chunkId,
        chunkIndex,
        laneSessionId,
        projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
        units: targetUnits,
      });
      if (translationScopeKeyRef.current !== scopeKey) return;
      setInlineTranslations((current) => {
        const next = { ...current };
        targetUnits.forEach((unit) => {
          next[unit.unit_id] = current[unit.unit_id]?.status === "ready"
            ? current[unit.unit_id]
            : pendingTranslationState;
        });
        return next;
      });
      setTranslationStatus("translating");
    } catch (err) {
      if (translationScopeKeyRef.current !== scopeKey) return;
      const message =
        isAbortError(err)
          ? t("docsViewer.translation.errorTimeout")
          : err instanceof Error
            ? err.message
            : t("docsViewer.translation.errorGeneric");
      translationScopeKeyRef.current = null;
      setInlineTranslations((current) => {
        const next = { ...current };
        targetIds.forEach((unitId) => {
          delete next[unitId];
        });
        return next;
      });
      setTranslationError(message);
      setTranslationStatus("error");
    } finally {
      targetIds.forEach((unitId) => inFlightTranslationUnitIdsRef.current.delete(unitId));
      documentTranslationChunkInFlightRef.current = false;
    }
  }, [
    activeTranslationScopeKey,
    activeDocument,
    documentTranslationAccountLocale,
    documentTranslationTargetLanguage,
    inlineTranslationEnabled,
    inlineTranslations,
    activeLiveTranslationSourceIdentityKey,
    rawMarkdownSourceHash,
    t,
    translationStatus,
    translationEligible,
    translationUnits,
  ]);

  const applyCompletedDocumentMicroDeckTranslations = React.useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    if (
      !inlineTranslationEnabled ||
      !translationEligible ||
      !activeDocument ||
      !activeTranslationScopeKey ||
      !rawMarkdownSourceHash
    ) {
      return false;
    }
    const sourceId = activeDocument.sourceId;
    const runs = await readDocumentMarkdownMicroDeckRuns({
      sourceId,
      threadId: activeDocument.mailboxThreadId,
      limit: 48,
      signal,
    });
    const translationByUnitId = new Map(
      extractDocumentMarkdownTranslationsFromRuns(runs).map((entry) => [entry.unitId, entry] as const),
    );
    if (!translationByUnitId.size) return false;
    const translatableUnitIds = new Set(translationUnits.filter((unit) => unit.translatable).map((unit) => unit.unit_id));
    let adoptedTranslation = false;
    setInlineTranslations((current) => {
      let changed = false;
      const next = { ...current };
      for (const [unitId, entry] of translationByUnitId) {
        if (!translatableUnitIds.has(unitId)) continue;
        if (entry.docPath && entry.docPath !== activeDocument.docPath) continue;
        if (entry.sourceHash && entry.sourceHash !== rawMarkdownSourceHash) continue;
        if (entry.accountLocale && entry.accountLocale !== documentTranslationAccountLocale) continue;
        if (entry.targetLanguage && entry.targetLanguage !== documentTranslationTargetLanguage) continue;
        if (entry.translationContractVersion !== DOCUMENT_MARKDOWN_TRANSLATION_CONTRACT_VERSION) continue;
        const hasEntryLanguageBinding = Boolean(entry.accountLocale || entry.targetLanguage);
        if (
          !hasEntryLanguageBinding &&
          entry.sourceIdentityKey &&
          activeLiveTranslationSourceIdentityKey &&
          entry.sourceIdentityKey !== activeLiveTranslationSourceIdentityKey
        ) continue;
        if (!hasEntryLanguageBinding && !entry.sourceIdentityKey) continue;
        const nextState = documentMarkdownTranslationEntryToInlineRenderState(entry);
        if (sameDocumentInlineTranslationRenderState(next[unitId], nextState)) continue;
        next[unitId] = nextState;
        inFlightTranslationUnitIdsRef.current.delete(unitId);
        changed = true;
      }
      adoptedTranslation = changed;
      return changed ? next : current;
    });
    return adoptedTranslation;
  }, [
    activeTranslationScopeKey,
    activeLiveTranslationSourceIdentityKey,
    activeDocument,
    documentTranslationAccountLocale,
    documentTranslationTargetLanguage,
    inlineTranslationEnabled,
    rawMarkdownSourceHash,
    translationEligible,
    translationUnits,
  ]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!inlineTranslationEnabled || !hasLoadingInlineTranslations) return;
    const controller = new AbortController();
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const adoptedTranslation = await applyCompletedDocumentMicroDeckTranslations(controller.signal);
        if (adoptedTranslation && !controller.signal.aborted) {
          window.setTimeout(() => void requestVisibleInlineTranslations(), DOC_TRANSLATION_SCAN_DEBOUNCE_MS);
        }
      } catch (err) {
        if (!isAbortError(err)) {
          console.warn("Document Markdown translation polling failed", err);
        }
      } finally {
        polling = false;
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 2200);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [
    applyCompletedDocumentMicroDeckTranslations,
    hasLoadingInlineTranslations,
    inlineTranslationEnabled,
    requestVisibleInlineTranslations,
  ]);

  const scheduleVisibleInlineTranslationScan = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (!inlineTranslationEnabled) return;
    if (visibleTranslationScanTimerRef.current !== null) {
      window.clearTimeout(visibleTranslationScanTimerRef.current);
    }
    visibleTranslationScanTimerRef.current = window.setTimeout(() => {
      visibleTranslationScanTimerRef.current = null;
      void requestVisibleInlineTranslations();
    }, DOC_TRANSLATION_SCAN_DEBOUNCE_MS);
  }, [inlineTranslationEnabled, requestVisibleInlineTranslations]);

  React.useEffect(() => {
    scheduleVisibleInlineTranslationScan();
  }, [activeHtml, inlineTranslationEnabled, scheduleVisibleInlineTranslationScan]);

  const handleContentScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const node = event.currentTarget;
      markInteraction("scrolling", "docs-viewer.content_scroll");
      const scroll = {
        scrollTop: node.scrollTop,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      };
      runWhenQuiet(() => {
        rememberPanelScroll(docScrollMemoryKey, scroll);
      }, {
        key: `workstation.scroll_memory:${docScrollMemoryKey}`,
        priority: "share_state",
        quietMs: 450,
        timeoutMs: 1800,
      });
      scheduleInlineTranslationReticleRefresh();
      scheduleVisibleInlineTranslationScan();
    },
    [
      docScrollMemoryKey,
      rememberPanelScroll,
      scheduleInlineTranslationReticleRefresh,
      scheduleVisibleInlineTranslationScan,
    ],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStep = (event: Event) => {
      const detail = (event as CustomEvent<HelixWorkstationProceduralStepPayload | null>)?.detail;
      if (!detail || detail.panelId !== "docs-viewer") return;
      if (typeof detail.traceId === "string" && detail.traceId.trim()) {
        lastProceduralTraceIdRef.current = detail.traceId.trim();
      }
      const messageId = proceduralStepMessages[detail.step as keyof typeof proceduralStepMessages];
      const label = messageId ? t(messageId) : null;
      if (!label) return;
      setProceduralStatus(label);
    };
    window.addEventListener(HELIX_WORKSTATION_PROCEDURAL_STEP_EVENT, handleStep as EventListener);
    return () => {
      window.removeEventListener(HELIX_WORKSTATION_PROCEDURAL_STEP_EVENT, handleStep as EventListener);
    };
  }, [t]);

  const clearActiveReadTarget = React.useCallback(() => {
    const target = activeReadTargetRef.current;
    if (target) {
      target.classList.remove(DOC_AUTO_READ_ACTIVE_CLASS);
      target.removeAttribute("data-doc-read-active");
    }
    activeReadTargetRef.current = null;
  }, []);

  const focusActiveReadChunk = React.useCallback(
    (chunkText: string) => {
      const container = contentRef.current;
      if (!container || modeRef.current !== "doc") return null;
      const target = findDocReadTarget(container, chunkText);
      if (!target) return null;
      if (activeReadTargetRef.current && activeReadTargetRef.current !== target) {
        activeReadTargetRef.current.classList.remove(DOC_AUTO_READ_ACTIVE_CLASS);
        activeReadTargetRef.current.removeAttribute("data-doc-read-active");
      }
      target.classList.add(DOC_AUTO_READ_ACTIVE_CLASS);
      target.setAttribute("data-doc-read-active", "true");
      activeReadTargetRef.current = target;
      if (followLiveReadRef.current) {
        keepDocReadTargetInView(container, target);
      }
      return target;
    },
    [],
  );

  const stopAutoRead = React.useCallback(() => {
    stopGlobalDocRead();
    clearActiveReadTarget();
    setIsAutoReading(false);
    setReadProgress(null);
    setFollowLiveRead(true);
    liveReadChunkRef.current = null;
  }, [clearActiveReadTarget]);

  React.useEffect(() => () => stopAutoRead(), [stopAutoRead]);

  React.useEffect(() => {
    clearActiveReadTarget();
  }, [activeHtml, clearActiveReadTarget, currentPath]);

  React.useEffect(() => {
    if (!proceduralStatus) return;
    const timeout = window.setTimeout(() => {
      setProceduralStatus((current) => (current === proceduralStatus ? null : current));
    }, 2600);
    return () => window.clearTimeout(timeout);
  }, [proceduralStatus]);

  React.useEffect(() => {
    if (mode !== "doc" || !pendingAutoReadNonce || loading) return;
    const traceId =
      lastProceduralTraceIdRef.current ??
      `docs:auto-read:${currentPath ?? "unknown"}:${pendingAutoReadNonce}`;
    const emitAutoReadEvent = (text: string, ok: boolean, detail?: string) => {
      emitHelixAskLiveEvent({
        contextId: HELIX_ASK_CONTEXT_ID.desktop,
        traceId,
        entry: {
          id: `docs-auto-read:${traceId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          text,
          tool: "docs.auto_read",
          ts: new Date().toISOString(),
          meta: {
            kind: "docs_auto_read",
            ok,
            detail: detail ?? null,
            path: currentPath ?? null,
            pending_auto_read_nonce: pendingAutoReadNonce,
          },
        },
      });
    };

    if (error) {
      setAutoReadError(error);
      clearPendingAutoRead();
      emitAutoReadEvent(`fail: docs auto-read blocked - document load error (${error})`, false, "doc_load_error");
      return;
    }

    if (!currentEntry) {
      const message = t("docsViewer.error.autoReadMissingDocument");
      setAutoReadError(message);
      clearPendingAutoRead();
      emitAutoReadEvent(`fail: docs auto-read blocked - ${message}`, false, "doc_manifest_miss");
      return;
    }
    if (loadedDocId !== currentEntry.id) {
      return;
    }
    const plain = markdownToSpeechText(rawMarkdown);
    if (!plain) {
      clearPendingAutoRead();
      setAutoReadError(t("docsViewer.error.autoReadEmptyDocument"));
      emitAutoReadEvent("fail: docs auto-read blocked - no readable text extracted.", false, "empty_plain_text");
      return;
    }
    const readKey = `${DOC_AUTO_READ_TAG}:${currentEntry.id}:${pendingAutoReadNonce}`;
    if (globalDocReadKey === readKey) {
      clearPendingAutoRead();
      emitAutoReadEvent("ok: docs auto-read already active for this document.", true, "dedupe");
      return;
    }
    stopGlobalDocRead();
    const controller = new AbortController();
    globalDocReadController = controller;
    globalDocReadKey = readKey;
    setIsAutoReading(true);
    setAutoReadError(null);

    const run = async () => {
      const clipped = plain.slice(0, DOC_AUTO_READ_MAX_CHARS);
      const chunks = splitSpeechChunks(clipped, DOC_AUTO_READ_CHUNK_MAX);
      let heardAudio = false;
      let suppressedChunks = 0;
      emitAutoReadEvent(
        `ok: docs auto-read started (${chunks.length} chunk${chunks.length === 1 ? "" : "s"}).`,
        true,
        "start",
      );
      for (let i = 0; i < chunks.length; i += 1) {
        if (controller.signal.aborted) return;
        const response = await speakVoice(
          {
            text: chunks[i],
            mode: "briefing",
            priority: "info",
            provider: DOC_AUTO_READ_PROVIDER,
            voice_profile_id: DOC_AUTO_READ_PROFILE_ID,
            traceId: `docs:${currentEntry.id}:${pendingAutoReadNonce}`,
            eventId: `docs:${currentEntry.id}:${i + 1}`,
          },
          { signal: controller.signal },
        );
        if (response.kind === "json") {
          if (response.payload?.suppressed) {
            suppressedChunks += 1;
            continue;
          }
          throw new Error(response.payload?.error || response.payload?.message || "voice_response_json");
        }
        heardAudio = true;
        const snippet = chunks[i].slice(0, 220);
        liveReadChunkRef.current = chunks[i];
        setReadProgress({
          chunkIndex: i + 1,
          chunkCount: chunks.length,
          snippet,
        });
        focusActiveReadChunk(chunks[i]);
        await playAutoReadAudio({
          blob: response.blob,
          signal: controller.signal,
        });
      }
      if (!heardAudio) {
        const message =
          suppressedChunks > 0
            ? `No playable audio returned (${suppressedChunks} suppressed chunk${suppressedChunks === 1 ? "" : "s"}).`
            : "No playable audio returned by voice provider.";
        throw new Error(message);
      }
      emitAutoReadEvent("ok: docs auto-read completed.", true, "complete");
    };

    void run()
      .catch((err) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : t("docsViewer.error.autoReadGeneric");
        setAutoReadError(message);
        emitAutoReadEvent(`fail: docs auto-read failed (${message}).`, false, "runtime_error");
      })
      .finally(() => {
        if (globalDocReadController === controller) {
          globalDocReadController = null;
          globalDocReadKey = null;
        }
        clearPendingAutoRead();
        setIsAutoReading(false);
        setReadProgress(null);
        setFollowLiveRead(true);
        liveReadChunkRef.current = null;
        clearActiveReadTarget();
      });
  }, [
    clearActiveReadTarget,
    clearPendingAutoRead,
    currentEntry,
    currentPath,
    error,
    focusActiveReadChunk,
    loadedDocId,
    loading,
    mode,
    pendingAutoReadNonce,
    rawMarkdown,
    t,
  ]);

  React.useEffect(() => {
    if (!isAutoReading) return;
    if (mode !== "directory") return;
    setFollowLiveRead(false);
  }, [isAutoReading, mode]);

  const handleShowDirectory = React.useCallback(() => {
    if (isAutoReading) {
      setFollowLiveRead(false);
    }
    cancelResearchDocumentRead();
    clearActiveDocVisibleTranslationContext();
    setActiveResearchDocument(null);
    viewDirectory();
  }, [cancelResearchDocumentRead, isAutoReading, viewDirectory]);

  const handleExportPrintPdf = React.useCallback(() => {
    if (
      !canExportPrintPdf ||
      !activeDocument ||
      !activeDocumentContentReady ||
      !rawMarkdown ||
      pdfExportStatus === "exporting"
    ) {
      return;
    }
    pdfExportControllerRef.current?.abort();
    const controller = new AbortController();
    pdfExportControllerRef.current = controller;
    setPdfExportStatus("exporting");
    setPdfExportMessage(null);
    const sourceKind: DocsPrintPdfSourceKind = activeDocument.privateSource
      ? "private_research"
      : "canonical_docs";
    void requestDocsPrintPdf({
      title: activeDocument.entry.title,
      source_path: activeDocument.docPath,
      source_kind: sourceKind,
      source_markdown: rawMarkdown,
    }, controller.signal)
      .then((artifact) => {
        if (controller.signal.aborted) return;
        downloadDocsPrintPdfArtifact(artifact);
        setPdfExportStatus("ready");
        setPdfExportMessage(t("docsViewer.pdf.ready", {
          pageCount: artifact.page_count,
        }));
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setPdfExportStatus("error");
        setPdfExportMessage(t("docsViewer.pdf.error", {
          reason: error instanceof Error ? error.message : "unknown_error",
        }));
      })
      .finally(() => {
        if (pdfExportControllerRef.current === controller) {
          pdfExportControllerRef.current = null;
        }
      });
  }, [
    activeDocument,
    activeDocumentContentReady,
    canExportPrintPdf,
    pdfExportStatus,
    rawMarkdown,
    t,
  ]);

  const handleToggleInlineTranslation = React.useCallback(() => {
    if (!translationEligible || !activeTranslationScopeKey || !activeDocument || !rawMarkdownSourceHash) return;
    setTranslationError(null);
    const sourceId = activeDocument.sourceId;
    const laneSessionId = documentInlineTranslationLaneSessionId(activeTranslationScopeKey);
    const sourceBindingKey = buildDocumentTranslationSourceBindingKey({
      sourceId,
      sourceHash: rawMarkdownSourceHash,
      accountLocale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
    });
    const sourceIdentityKey = buildDocumentTranslationSourceIdentityKey({
      sourceId,
      sourceHash: rawMarkdownSourceHash,
      sourceTextHash: rawMarkdownSourceHash,
      sourceTextCharCount: rawMarkdown.length,
      accountLocale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
    });
    const latestSourceIdentityKey =
      liveTranslationProjectionSummary.latestSourceIdentityKey ?? sourceIdentityKey;
    const runLaneSessionControl = (action: "start" | "stop") => {
      if (activeDocument.privateSource) return;
      void runDocumentMarkdownTranslationLaneSessionControl({
        action,
        docPath: activeDocument.docPath,
        locale: documentTranslationAccountLocale,
        targetLanguage: documentTranslationTargetLanguage,
        accountLocale: documentTranslationAccountLocale,
        sourceHash: rawMarkdownSourceHash,
        sourceTextHash: rawMarkdownSourceHash,
        sourceTextCharCount: rawMarkdown.length,
        sourceBindingKey,
        sourceIdentityKey,
        latestSourceIdentityKey,
        sourceId,
        laneSessionId,
        projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
        agentRuntime: "helix",
        reason: `document_inline_translation_${action}`,
      })
        .then((response) => {
          emitDocumentTranslationLaneSessionControlEvents({
            response: response as Record<string, unknown>,
            sourceId,
            sourceHash: rawMarkdownSourceHash,
            sourceIdentityKey,
            latestSourceIdentityKey,
          });
        })
        .catch((err) => {
          if (isAbortError(err)) return;
          console.warn("Document translation lane session control failed", err);
        });
    };
    if (inlineTranslationEnabled) {
      if (activeTranslationScopeKey) {
        writeStoredInlineTranslationSession(activeTranslationScopeKey, {
          enabled: false,
          sourceHash: rawMarkdownSourceHash,
          sourceIdentityKey,
          sourceTextHash: rawMarkdownSourceHash,
          sourceTextCharCount: rawMarkdown.length,
          accountLocale: documentTranslationAccountLocale,
          targetLanguage: documentTranslationTargetLanguage,
          translations: inlineTranslations,
        });
      }
      translationScopeKeyRef.current = null;
      inFlightTranslationUnitIdsRef.current.clear();
      setTranslationStatus("idle");
      setInlineTranslationEnabled(false);
      runLaneSessionControl("stop");
      return;
    }
    translationScopeKeyRef.current = activeTranslationScopeKey;
    setTranslationStatus("ready");
    setInlineTranslationEnabled(true);
    runLaneSessionControl("start");
  }, [
    activeTranslationScopeKey,
    activeDocument,
    documentTranslationAccountLocale,
    documentTranslationTargetLanguage,
    inlineTranslationEnabled,
    inlineTranslations,
    liveTranslationProjectionSummary.latestSourceIdentityKey,
    rawMarkdown,
    rawMarkdownSourceHash,
    translationEligible,
  ]);

  const handleToggleInlineTranslationSessionPause = React.useCallback(() => {
    if (!translationEligible || !activeTranslationScopeKey || !activeDocument || !rawMarkdownSourceHash) return;
    const sourceId = activeDocument.sourceId;
    const laneSessionId =
      liveTranslationProjectionSummary.latestLaneSessionId ??
      documentInlineTranslationLaneSessionId(activeTranslationScopeKey);
    const sourceBindingKey = buildDocumentTranslationSourceBindingKey({
      sourceId,
      sourceHash: rawMarkdownSourceHash,
      accountLocale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
    });
    const sourceIdentityKey = buildDocumentTranslationSourceIdentityKey({
      sourceId,
      sourceHash: rawMarkdownSourceHash,
      sourceTextHash: rawMarkdownSourceHash,
      sourceTextCharCount: rawMarkdown.length,
      accountLocale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
    });
    const latestSourceIdentityKey =
      liveTranslationProjectionSummary.latestSourceIdentityKey ?? sourceIdentityKey;
    const action = liveTranslationProjectionSummary.latestLaneSessionStatus === "paused"
      ? "resume"
      : "pause";
    if (action === "pause") {
      inFlightTranslationUnitIdsRef.current.clear();
      setTranslationStatus((current) => current === "error" || current === "unavailable" ? current : "cached");
    } else {
      translationScopeKeyRef.current = activeTranslationScopeKey;
      setInlineTranslationEnabled(true);
      setTranslationStatus((current) => current === "error" || current === "unavailable" ? current : "ready");
    }
    if (activeDocument.privateSource) return;
    void runDocumentMarkdownTranslationLaneSessionControl({
      action,
      docPath: activeDocument.docPath,
      locale: documentTranslationAccountLocale,
      targetLanguage: documentTranslationTargetLanguage,
      accountLocale: documentTranslationAccountLocale,
      sourceHash: rawMarkdownSourceHash,
      sourceTextHash: rawMarkdownSourceHash,
      sourceTextCharCount: rawMarkdown.length,
      sourceBindingKey,
      sourceIdentityKey,
      latestSourceIdentityKey,
      sourceId,
      laneSessionId,
      projectionTarget: HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
      agentRuntime: "helix",
      reason: `document_inline_translation_${action}`,
    })
      .then((response) => {
        emitDocumentTranslationLaneSessionControlEvents({
          response: response as Record<string, unknown>,
          sourceId,
          sourceHash: rawMarkdownSourceHash,
          sourceIdentityKey,
          latestSourceIdentityKey,
        });
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        console.warn("Document translation lane session control failed", err);
      });
  }, [
    activeTranslationScopeKey,
    activeDocument,
    documentTranslationAccountLocale,
    documentTranslationTargetLanguage,
    liveTranslationProjectionSummary.latestLaneSessionId,
    liveTranslationProjectionSummary.latestLaneSessionStatus,
    liveTranslationProjectionSummary.latestSourceIdentityKey,
    rawMarkdown,
    rawMarkdownSourceHash,
    translationEligible,
  ]);

  const rejoinLiveRead = React.useCallback(() => {
    if (!currentPath) return;
    viewDoc(currentPath, anchor);
    setFollowLiveRead(true);
    const chunkText = liveReadChunkRef.current;
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      if (!chunkText) return;
      focusActiveReadChunk(chunkText);
    }, 30);
  }, [anchor, currentPath, focusActiveReadChunk, viewDoc]);

  const queryValue = query.trim().toLowerCase();
  const queryMatchedEntries = React.useMemo(() => {
    return filterDocManifestEntries(queryValue);
  }, [queryValue]);
  const taxonomyCounts = React.useMemo(() => buildDocTaxonomyCounts(queryMatchedEntries), [queryMatchedEntries]);
  const filteredEntries = React.useMemo(() => {
    return queryMatchedEntries.filter((entry) => docMatchesTaxonomyFilter(entry, docClassFilter));
  }, [docClassFilter, queryMatchedEntries]);
  const grouped = React.useMemo(
    () => arrangeDirectoryEntries(filteredEntries, directorySort, t),
    [directorySort, filteredEntries, t],
  );
  const handleDocMathClick = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const runtimeAction = target.closest("[data-doc-runtime-command-id]") as HTMLElement | null;
      const runtimeContainer = runtimeAction?.closest("[data-doc-runtime-command]") as HTMLElement | null;
      const commandText = runtimeContainer?.dataset.docRuntimeCommand?.trim();
      if (runtimeAction && commandText) {
        const launch = buildDocRuntimeCalculatorLaunch({ commandText, docPath: currentPath, anchor });
        if (launch) {
          event.preventDefault();
          event.stopPropagation();
          dispatchDocCalculatorLaunch(launch);
        }
        return;
      }
      const source = target.closest("[data-doc-math-latex]") as HTMLElement | null;
      if (!source) return;
      const latex = source.dataset.docMathLatex?.trim();
      if (!latex) return;
      event.preventDefault();
      event.stopPropagation();
      const actionSource = target.closest("[data-doc-equation-action-id]") as HTMLElement | null;
      const actionId = actionSource?.dataset.docEquationActionId?.trim();
      const activeDocPath = displayEntry?.relativePath ?? currentPath;
      if (actionId) {
        void executeDocEquationAction({
          currentPath: activeDocPath,
          anchor,
          actionId,
          latex,
        });
        return;
      }
      handleDocMathPick({
        latex,
        currentPath: activeDocPath,
        anchor,
        clipboardWrite:
          typeof navigator !== "undefined" && navigator.clipboard?.writeText
            ? navigator.clipboard.writeText.bind(navigator.clipboard)
            : null,
      });
    },
    [anchor, currentPath, displayEntry?.relativePath],
  );

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden bg-slate-950/90 text-slate-100">
      {mode === "directory" && !activeResearchDocument ? (
        <DirectoryRail
          entries={grouped}
          total={DOC_MANIFEST.length}
          filteredCount={filteredEntries.length}
          currentRoute={currentPath}
          query={query}
          docClassFilter={docClassFilter}
          sort={directorySort}
          taxonomyCounts={taxonomyCounts}
          onQueryChange={setQuery}
          onDocClassFilterChange={setDocClassFilter}
          onSortChange={setDirectorySort}
          onSelect={handleSelectCanonicalDoc}
          researchLibraryDocuments={researchLibraryDocuments}
          researchLibraryStatus={researchLibraryStatus}
          researchLibraryError={researchLibraryError}
          researchLibraryMutationError={researchLibraryMutationError}
          deletingResearchDocumentId={deletingResearchDocumentId}
          onSelectResearchDocument={handleSelectResearchDocument}
          onDeleteResearchDocument={handleDeleteResearchDocument}
          variant="full"
          scrollMemoryKey="docs-viewer:directory"
          t={t}
        />
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          <PanelHeader
            mode={activeResearchDocument ? "doc" : mode}
            entry={displayEntry}
            anchor={anchor}
            isAutoReading={isAutoReading}
            autoReadError={autoReadError}
            proceduralStatus={proceduralStatus}
            readProgress={readProgress}
            onStopAutoRead={stopAutoRead}
            onShowDirectory={handleShowDirectory}
            canRejoinLiveRead={false}
            onRejoinLiveRead={rejoinLiveRead}
            translationEligible={translationEligible}
            translationAccountLocale={documentTranslationAccountLocale}
            translationTargetLanguage={documentTranslationTargetLanguage}
            translationDocPath={activeDocument?.docPath ?? null}
            translationSourceId={activeDocument?.sourceId ?? null}
            translationSourceHash={rawMarkdownSourceHash}
            translationSourceTextHash={rawMarkdownSourceHash}
            translationSourceTextCharCount={rawMarkdown.length}
            translationLaneSessionId={
              activeTranslationScopeKey ? documentInlineTranslationLaneSessionId(activeTranslationScopeKey) : null
            }
            inlineTranslationEnabled={inlineTranslationEnabled}
            translationStatus={translationStatus}
            translationError={translationError}
            liveTranslationProjectionSummary={liveTranslationProjectionSummary}
            accountLanguageTranslationProjections={accountLanguageTranslationProjections}
            onVisibleTranslationRegionBboxesChange={handleVisibleTranslationRegionBboxesChange}
            onToggleInlineTranslation={handleToggleInlineTranslation}
            onToggleInlineTranslationSessionPause={handleToggleInlineTranslationSessionPause}
            canExportPrintPdf={canExportPrintPdf}
            pdfExportStatus={pdfExportStatus}
            pdfExportMessage={pdfExportMessage}
            onExportPrintPdf={handleExportPrintPdf}
            t={t}
          />
          <div
            ref={contentRef}
            className="min-h-0 flex-1 overflow-y-scroll overflow-x-hidden"
            style={{ scrollbarGutter: "stable" }}
            onScroll={handleContentScroll}
          >
            {hoveredTranslationProjection?.displayText ? (
              <div
                {...buildHelixVisibleTranslationDataAttributes(hoveredTranslationProjection)}
                className="sticky top-0 z-10 border-b border-emerald-400/20 bg-slate-950/95 px-6 py-2 text-sm text-emerald-100 shadow-lg shadow-slate-950/30"
                role="status"
                aria-live="polite"
              >
                {hoveredTranslationProjection.displayText}
              </div>
            ) : null}
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                {t("docsViewer.loading")}
              </div>
            ) : error ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm text-amber-300">{t("docsViewer.error.load")}</p>
                <p className="text-xs text-slate-400">{error}</p>
                {currentEntry && (
                  <Button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.view-doc-current-entry-route-anchor"
                    variant="outline"
                    size="sm"
                    onClick={() => viewDoc(currentEntry.route, anchor)}
                  >
                    {t("docsViewer.action.retry")}
                  </Button>
                )}
              </div>
            ) : displayEntry ? (
              <article data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.handle-doc-math-click"
                className="prose prose-invert max-w-none overflow-x-hidden px-6 py-6 [&_*]:max-w-full [&_a]:break-words [&_code]:whitespace-pre-wrap [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto"
                onClick={handleDocMathClick}
                dangerouslySetInnerHTML={{ __html: activeHtml }}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
                {t("docsViewer.empty.selectDocument")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type GroupedDocs = {
  label: string;
  entries: DocManifestEntry[];
};

type DirectoryRailProps = {
  entries: GroupedDocs[];
  total: number;
  filteredCount: number;
  currentRoute?: string;
  query: string;
  docClassFilter: DocTaxonomyFilter;
  sort?: DocDirectorySort;
  taxonomyCounts: Record<DocTaxonomyFilter, number>;
  onQueryChange: (value: string) => void;
  onDocClassFilterChange: (value: DocTaxonomyFilter) => void;
  onSortChange?: (value: DocDirectorySort) => void;
  onSelect: (path: string) => void;
  researchLibraryDocuments?: HelixResearchLibraryDocumentSummary[];
  researchLibraryStatus?: "loading" | "ready" | "signed_out" | "error";
  researchLibraryError?: string | null;
  researchLibraryMutationError?: string | null;
  deletingResearchDocumentId?: string | null;
  onSelectResearchDocument?: (documentId: string) => void;
  onDeleteResearchDocument?: (documentId: string, title: string) => void;
  variant?: "rail" | "full";
  scrollMemoryKey?: string;
  t: Translate;
};

export function DirectoryRail({
  entries,
  total,
  filteredCount,
  currentRoute,
  query,
  docClassFilter,
  sort = "last-edited",
  taxonomyCounts,
  onQueryChange,
  onDocClassFilterChange,
  onSortChange,
  onSelect,
  researchLibraryDocuments = [],
  researchLibraryStatus = "ready",
  researchLibraryError = null,
  researchLibraryMutationError = null,
  deletingResearchDocumentId = null,
  onSelectResearchDocument,
  onDeleteResearchDocument,
  variant = "rail",
  scrollMemoryKey,
  t,
}: DirectoryRailProps) {
  const entryRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const rememberPanelScroll = useWorkstationSessionMemoryStore((state) => state.rememberPanelScroll);
  const readPanelScroll = useWorkstationSessionMemoryStore((state) => state.readPanelScroll);
  const isFull = variant === "full";
  const normalizedLibraryQuery = query.trim().toLowerCase();
  const visibleResearchLibraryDocuments = researchLibraryDocuments.filter((document) =>
    !normalizedLibraryQuery ||
    document.title.toLowerCase().includes(normalizedLibraryQuery) ||
    (document.source_url ?? "").toLowerCase().includes(normalizedLibraryQuery)
  );

  React.useLayoutEffect(() => {
    if (!scrollMemoryKey || !scrollRef.current) return;
    const saved = readPanelScroll(scrollMemoryKey);
    if (!saved) return;
    const node = scrollRef.current;
    const restore = () => {
      const maxScrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
      node.scrollTop = Math.min(saved.scrollTop, maxScrollTop);
    };
    if (typeof window === "undefined") {
      restore();
      return;
    }
    const frame = window.requestAnimationFrame(restore);
    return () => window.cancelAnimationFrame(frame);
  }, [entries, query, readPanelScroll, scrollMemoryKey]);

  React.useEffect(() => {
    if (!currentRoute) return;
    if (scrollMemoryKey && readPanelScroll(scrollMemoryKey)) return;
    const target = entryRefs.current[currentRoute];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentRoute, query, entries, readPanelScroll, scrollMemoryKey]);

  const handleRailScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!scrollMemoryKey) return;
      const node = event.currentTarget;
      markInteraction("scrolling", "docs-viewer.directory_scroll");
      const scroll = {
        scrollTop: node.scrollTop,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      };
      runWhenQuiet(() => {
        rememberPanelScroll(scrollMemoryKey, scroll);
      }, {
        key: `workstation.scroll_memory:${scrollMemoryKey}`,
        priority: "share_state",
        quietMs: 450,
        timeoutMs: 1800,
      });
    },
    [rememberPanelScroll, scrollMemoryKey],
  );

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col bg-slate-950/60",
        isFull ? "w-full" : "w-80 border-r border-white/10"
      )}
    >
      <div className="border-b border-white/10 p-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 px-2">
          <Search className="h-4 w-4 text-slate-400" />
          <Input data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.input" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("docsViewer.search.placeholder")}
            className="h-9 border-none bg-transparent text-sm focus-visible:ring-0"
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {t("docsViewer.search.count", { filteredCount, total })}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t("docsViewer.taxonomy.filterLabel")}>
          {docTaxonomyFilterOptions.map((option) => {
            const active = option.key === docClassFilter;
            const count = taxonomyCounts[option.key] ?? 0;
            return (
              <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.on-doc-class-filter-change-option-key"
                key={option.key}
                type="button"
                className={cn(
                  "min-h-8 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-cyan-400/70 bg-cyan-400/15 text-cyan-100"
                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.07]",
                )}
                aria-pressed={active}
                onClick={() => onDocClassFilterChange(option.key)}
              >
                {t(option.messageId)}
                <span className="ml-1 text-[10px] text-slate-400">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
          <label htmlFor="docs-directory-sort" className="text-xs font-medium text-slate-300">
            {t("docsViewer.sort.label")}
          </label>
          <select data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.docs-directory-sort"
            id="docs-directory-sort"
            value={sort}
            onChange={(event) => onSortChange?.(event.target.value as DocDirectorySort)}
            className="h-8 min-w-36 rounded-md border border-white/10 bg-slate-900 px-2 text-xs text-slate-100 outline-none transition-colors hover:border-white/20 focus:border-cyan-400/70 focus:ring-1 focus:ring-cyan-400/40"
          >
            <option value="last-edited">{t("docsViewer.sort.lastEdited")}</option>
            <option value="title">{t("docsViewer.sort.title")}</option>
            <option value="subject">{t("docsViewer.sort.subject")}</option>
          </select>
        </div>
      </div>
      <div
        ref={scrollRef}
        className={cn("flex-1 overflow-y-auto px-2 py-3", isFull && "px-3")}
        onScroll={handleRailScroll}
      >
        <div className="mb-5 rounded-lg border border-violet-400/20 bg-violet-400/[0.04] p-2" data-testid="research-library-section">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-violet-200">
            <span className="flex items-center gap-2"><Folder className="h-3 w-3" />My Research Library</span>
            <span className="rounded bg-violet-400/10 px-1.5 py-0.5 text-[9px] text-violet-200">Private</span>
          </div>
          {researchLibraryStatus === "loading" ? (
            <p className="py-2 text-xs text-slate-400">Loading saved extractions…</p>
          ) : researchLibraryStatus === "signed_out" ? (
            <p className="py-2 text-xs text-slate-400">Sign in to save and reopen extracted papers.</p>
          ) : researchLibraryStatus === "error" ? (
            <p className="py-2 text-xs text-amber-300" title={researchLibraryError ?? undefined}>Research Library unavailable.</p>
          ) : visibleResearchLibraryDocuments.length === 0 ? (
            <p className="py-2 text-xs text-slate-400">
              {researchLibraryDocuments.length === 0
                ? "Successful full-text paper extractions will appear here."
                : "No saved extraction matches this search."}
            </p>
          ) : (
            <>
              {researchLibraryMutationError ? (
                <p className="mb-1.5 rounded border border-rose-400/20 bg-rose-400/5 px-2 py-1 text-[11px] text-rose-300" role="alert">
                  Could not delete the saved extraction: {researchLibraryMutationError}
                </p>
              ) : null}
              <ul className="space-y-1.5">
                {visibleResearchLibraryDocuments.map((document) => {
                  const deleting = deletingResearchDocumentId === document.document_id;
                  return (
                    <li key={document.document_id} className="group flex items-start gap-1 rounded-lg transition-colors hover:bg-violet-400/10">
                      <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.on-select-research-document-document-document-id"
                        type="button"
                        className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-slate-200 disabled:opacity-50"
                        onClick={() => onSelectResearchDocument?.(document.document_id)}
                        disabled={deleting}
                      >
                        <p className="break-words text-sm font-medium leading-tight">{document.title}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-violet-300/80">
                          {document.page_count} pages · {document.extraction_status.replaceAll("_", " ")}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">{document.source_url ?? document.source_pdf_ref ?? document.document_id}</p>
                      </button>
                      <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.delete-saved-extraction"
                        type="button"
                        className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-300 disabled:cursor-wait disabled:opacity-60"
                        aria-label={`Delete ${document.title} from My Research Library`}
                        title="Delete saved extraction"
                        disabled={deleting}
                        onClick={() => onDeleteResearchDocument?.(document.document_id, document.title)}
                      >
                        {deleting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        {entries.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
              <Folder className="h-3 w-3" />
              {group.label}
            </div>
            <ul className="space-y-1.5">
              {group.entries.map((entry) => {
                const selected = entry.route === currentRoute;
                const catalogDate = formatDocCatalogDate(entry, t);
                const badges = getDocBadges(entry, t);
                return (
                  <li key={entry.id}>
                    <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.on-select-entry-route"
                      ref={(node) => {
                        entryRefs.current[entry.route] = node;
                      }}
                      className={cn(
                        "w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                        selected
                          ? "bg-cyan-500/20 text-white ring-1 ring-cyan-500/60"
                          : "text-slate-200 hover:bg-white/5"
                      )}
                      onClick={() => onSelect(entry.route)}
                    >
                      <p className="break-words text-sm font-medium leading-tight">{entry.title}</p>
                      {badges.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1" data-testid="doc-taxonomy-badges">
                          {badges.map((badge) => (
                            <span
                              key={`${entry.id}:${badge.label}`}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
                                docBadgeToneClass(badge.tone),
                              )}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {catalogDate ? (
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-cyan-300/75">{catalogDate}</p>
                      ) : null}
                      <p className="break-all text-[11px] text-slate-400">{entry.relativePath}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-xs text-slate-400">{t("docsViewer.empty.noMatches")}</p>
        )}
      </div>
    </aside>
  );
}

type PanelHeaderProps = {
  mode: DocViewerState["mode"];
  entry: DocManifestEntry | null;
  anchor?: string;
  isAutoReading: boolean;
  autoReadError: string | null;
  proceduralStatus: string | null;
  readProgress: {
    chunkIndex: number;
    chunkCount: number;
    snippet: string;
  } | null;
  onStopAutoRead: () => void;
  onShowDirectory: () => void;
  canRejoinLiveRead: boolean;
  onRejoinLiveRead: () => void;
  translationEligible: boolean;
  translationAccountLocale: string;
  translationTargetLanguage: string;
  translationDocPath?: string | null;
  translationSourceId: string | null;
  translationSourceHash: string | null;
  translationSourceTextHash: string | null;
  translationSourceTextCharCount: number | null;
  translationLaneSessionId: string | null;
  inlineTranslationEnabled: boolean;
  translationStatus: DocumentTranslationUiStatus;
  translationError: string | null;
  liveTranslationProjectionSummary: DocumentLiveTranslationProjectionSnapshotSummary;
  accountLanguageTranslationProjections?: HelixAccountLanguageTranslationProjectionState[];
  onVisibleTranslationRegionBboxesChange?: (bboxes: Record<string, HelixVisibleTranslationRegionBbox | null>) => void;
  onToggleInlineTranslation: () => void;
  onToggleInlineTranslationSessionPause: () => void;
  canExportPrintPdf?: boolean;
  pdfExportStatus?: "idle" | "exporting" | "ready" | "error";
  pdfExportMessage?: string | null;
  onExportPrintPdf?: () => void;
  t: Translate;
};

type DocViewerState = ReturnType<typeof useDocViewerStore.getState>;

export function PanelHeader({
  mode,
  entry,
  anchor,
  isAutoReading,
  autoReadError,
  proceduralStatus,
  readProgress,
  onStopAutoRead,
  onShowDirectory,
  canRejoinLiveRead,
  onRejoinLiveRead,
  translationEligible,
  translationAccountLocale,
  translationTargetLanguage,
  translationDocPath,
  translationSourceId,
  translationSourceHash,
  translationSourceTextHash,
  translationSourceTextCharCount,
  translationLaneSessionId,
  inlineTranslationEnabled,
  translationStatus,
  translationError,
  liveTranslationProjectionSummary,
  accountLanguageTranslationProjections = [],
  onVisibleTranslationRegionBboxesChange,
  onToggleInlineTranslation,
  onToggleInlineTranslationSessionPause,
  canExportPrintPdf = false,
  pdfExportStatus = "idle",
  pdfExportMessage = null,
  onExportPrintPdf,
  t,
}: PanelHeaderProps) {
  const titleTranslationRegionRef = React.useRef<HTMLHeadingElement | null>(null);
  const inlineTranslationButtonRegionRef = React.useRef<HTMLButtonElement | null>(null);
  const title =
    mode === "doc" && entry
      ? entry.title
      : t("docsViewer.title.directory");
  const subtitle =
    mode === "doc" && entry
      ? entry.relativePath + (anchor ? ` #${anchor}` : "")
      : t("docsViewer.subtitle.directory");
  const pathRef = mode === "doc" && entry ? buildWorkstationPathRef(entry.relativePath) : null;
  const isTranslating = translationStatus === "translating";
  const translationStatusLabel = getDocumentTranslationStatusLabel({
    translationStatus,
    translationError,
    liveTranslationProjectionSummary,
    t,
  });
  const hasBlockedTranslationLane =
    liveTranslationProjectionSummary.blockedLaneSessionCount > 0 ||
    liveTranslationProjectionSummary.blockedMailLoopCount > 0 ||
    liveTranslationProjectionSummary.blockedGoalBindingCount > 0;
  const hasProblemTranslationProjection =
    liveTranslationProjectionSummary.displayStatus === "blocked" ||
    liveTranslationProjectionSummary.displayStatus === "failed" ||
    liveTranslationProjectionSummary.displayStatus === "cancelled" ||
    liveTranslationProjectionSummary.displayStatus === "stale";
  const latestLaneSessionStatus = liveTranslationProjectionSummary.latestLaneSessionStatus;
  const latestOrNextTranslationLaneSessionId =
    liveTranslationProjectionSummary.latestLaneSessionId ?? translationLaneSessionId;
  const nextTranslationSourceIdentityKey = translationSourceId && translationSourceHash
    ? buildDocumentTranslationSourceIdentityKey({
      sourceId: translationSourceId,
      sourceHash: translationSourceHash,
      sourceTextHash: translationSourceTextHash,
      sourceTextCharCount: translationSourceTextCharCount,
      accountLocale: translationAccountLocale,
      targetLanguage: translationTargetLanguage,
    })
    : null;
  const nextTranslationSourceBindingKey = translationSourceId && translationSourceHash
    ? buildDocumentTranslationSourceBindingKey({
      sourceId: translationSourceId,
      sourceHash: translationSourceHash,
      accountLocale: translationAccountLocale,
      targetLanguage: translationTargetLanguage,
    })
    : null;
  const latestOrNextTranslationSourceBindingKey =
    liveTranslationProjectionSummary.latestSourceBindingKey ?? nextTranslationSourceBindingKey;
  const latestOrNextTranslationSourceIdentityKey =
    liveTranslationProjectionSummary.latestSourceIdentityKey ?? nextTranslationSourceIdentityKey;
  const currentTranslationSourceBindingKey = nextTranslationSourceBindingKey;
  const currentTranslationSourceIdentityKey = nextTranslationSourceIdentityKey;
  const latestOrNextLaneSessionSourceBindingKey =
    liveTranslationProjectionSummary.latestLaneSessionSourceBindingKey ??
    liveTranslationProjectionSummary.latestSourceBindingKey ??
    nextTranslationSourceBindingKey;
  const latestOrNextLaneSessionSourceIdentityKey =
    liveTranslationProjectionSummary.latestLaneSessionSourceIdentityKey ??
    liveTranslationProjectionSummary.latestSourceIdentityKey ??
    nextTranslationSourceIdentityKey;
  const currentLaneSessionSourceBindingKey = nextTranslationSourceBindingKey;
  const currentLaneSessionSourceIdentityKey = nextTranslationSourceIdentityKey;
  const translationLanguageRoutingPolicy = "account_locale_base_target";
  const translationTargetLanguageSource =
    translationTargetLanguage === resolveDocumentTranslationTargetLanguage(translationAccountLocale)
      ? "account_locale_base"
      : "explicit_target_language";
  const hasControllableTranslationLaneSession =
    inlineTranslationEnabled &&
    Boolean(latestOrNextTranslationLaneSessionId) &&
    (latestLaneSessionStatus === "running" || latestLaneSessionStatus === "paused");
  const isTranslationLaneSessionPaused = latestLaneSessionStatus === "paused";
  const showTranslationProjectionSummary =
    translationEligible || liveTranslationProjectionSummary.version > 0 || liveTranslationProjectionSummary.totalCount > 0;
  const inlineTranslationButtonSourceLabel = inlineTranslationEnabled
    ? t("docsViewer.translation.hideInline")
    : isTranslating
      ? t("docsViewer.translation.generating")
      : t("docsViewer.translation.generateInline");
  const inlineTranslationButtonProjection = accountLanguageTranslationProjections.length > 0
    ? selectHelixAccountLanguageTranslationProjection({
      states: accountLanguageTranslationProjections,
      panelId: "docs-viewer",
      regionId: DOC_VIEWER_TRANSLATE_BUTTON_REGION_ID,
      docPath: translationDocPath ?? entry?.relativePath ?? null,
      sourceId: DOC_VIEWER_TRANSLATE_BUTTON_SOURCE_ID,
      accountLocale: translationAccountLocale,
      targetLanguage: translationTargetLanguage,
    })
    : null;
  const titleAccountLanguageProjection = accountLanguageTranslationProjections.length > 0
    ? selectHelixAccountLanguageTranslationProjection({
      states: accountLanguageTranslationProjections,
      panelId: "docs-viewer",
      regionId: DOC_VIEWER_TITLE_TRANSLATION_REGION_ID,
      docPath: translationDocPath ?? entry?.relativePath ?? null,
      sourceId: DOC_VIEWER_TITLE_TRANSLATION_SOURCE_ID,
      accountLocale: translationAccountLocale,
      targetLanguage: translationTargetLanguage,
    })
    : null;

  React.useLayoutEffect(() => {
    if (!onVisibleTranslationRegionBboxesChange) return;
    if (mode !== "doc" || !entry) {
      onVisibleTranslationRegionBboxesChange({});
      return;
    }
    onVisibleTranslationRegionBboxesChange({
      [DOC_VIEWER_TITLE_TRANSLATION_REGION_ID]: rectToVisibleTranslationBbox(
        titleTranslationRegionRef.current?.getBoundingClientRect(),
        "docs-header-title",
      ),
      [DOC_VIEWER_TRANSLATE_BUTTON_REGION_ID]: rectToVisibleTranslationBbox(
        inlineTranslationButtonRegionRef.current?.getBoundingClientRect(),
        "docs-header-translation-button",
      ),
    });
  }, [
    entry,
    inlineTranslationButtonSourceLabel,
    mode,
    onVisibleTranslationRegionBboxesChange,
    title,
    titleAccountLanguageProjection?.status,
    inlineTranslationButtonProjection?.status,
  ]);

  const badges = entry ? getDocBadges(entry, t) : [];

  return (
    <header className="flex min-w-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
      <Button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.on-show-directory"
        variant="ghost"
        size="icon"
        onClick={onShowDirectory}
        aria-label={t("docsViewer.action.backToDirectory")}
        className="h-9 w-9 shrink-0 rounded-full border border-white/10 text-slate-100 hover:bg-white/10 hover:text-cyan-100"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-0 flex-1">
        {pathRef ? (
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap gap-1 overflow-hidden text-[11px] uppercase tracking-wide text-slate-400 sm:gap-1.5">
              {pathRef.displaySegments.map((segment, index) => {
                const isLast = index === pathRef.displaySegments.length - 1;
                return (
                  <React.Fragment key={`${segment}:${index}`}>
                    <BreadcrumbItem className="min-w-0">
                      <BreadcrumbPage
                        className={cn(
                          "max-w-[12rem] truncate text-[11px] font-normal uppercase tracking-wide",
                          isLast ? "text-slate-200" : "text-slate-500",
                        )}
                        title={segment}
                      >
                        {segment}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                    {!isLast ? <BreadcrumbSeparator className="text-slate-600" /> : null}
                  </React.Fragment>
                );
              })}
              {anchor ? (
                <>
                  <BreadcrumbSeparator className="text-slate-600" />
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbPage
                      className="max-w-[10rem] truncate text-[11px] font-normal uppercase tracking-wide text-cyan-200"
                      title={`#${anchor}`}
                    >
                      #{anchor}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              ) : null}
            </BreadcrumbList>
          </Breadcrumb>
        ) : (
          <p className="truncate text-[11px] uppercase tracking-wide text-slate-400">{subtitle}</p>
        )}
        <h2
          ref={titleTranslationRegionRef}
          className="truncate text-lg font-semibold text-white"
          data-helix-visible-translation-region-id={DOC_VIEWER_TITLE_TRANSLATION_REGION_ID}
          data-helix-visible-translation-source-id={DOC_VIEWER_TITLE_TRANSLATION_SOURCE_ID}
        >
          {titleAccountLanguageProjection ? (
            <HelixAccountLanguageTranslationProjection
              state={titleAccountLanguageProjection}
              sourceText={title}
            />
          ) : title}
        </h2>
        {badges.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1" data-testid="doc-header-taxonomy-badges">
            {badges.map((badge) => (
              <span
                key={badge.label}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
                  docBadgeToneClass(badge.tone),
                )}
              >
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}
        {isAutoReading ? (
          <p className="mt-0.5 text-[11px] text-cyan-200">{t("docsViewer.reading.active")}</p>
        ) : null}
        {proceduralStatus ? <p className="mt-0.5 text-[11px] text-sky-200">{proceduralStatus}</p> : null}
        {pdfExportMessage ? (
          <p
            className={cn(
              "mt-0.5 text-[11px]",
              pdfExportStatus === "error" ? "text-amber-300" : "text-emerald-200",
            )}
            data-testid="docs-print-pdf-status"
          >
            {pdfExportMessage}
          </p>
        ) : null}
        {readProgress ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-cyan-100/90">
            {t("docsViewer.reading.progress", {
              chunkIndex: readProgress.chunkIndex,
              chunkCount: readProgress.chunkCount,
              snippet: readProgress.snippet,
            })}
          </p>
        ) : null}
        {!isAutoReading && autoReadError ? (
          <p className="mt-0.5 text-[11px] text-amber-300">{t("docsViewer.reading.stopped", { reason: autoReadError })}</p>
        ) : null}
        {showTranslationProjectionSummary ? (
          <p
            className={cn(
              "mt-0.5 text-[11px]",
              !translationStatusLabel && "hidden",
              translationStatus === "error" ||
                translationStatus === "unavailable" ||
                hasBlockedTranslationLane ||
                hasProblemTranslationProjection
                ? "text-amber-300"
                : "text-emerald-200",
            )}
            data-doc-translation-summary-version={String(liveTranslationProjectionSummary.version)}
            data-doc-translation-summary-total={String(liveTranslationProjectionSummary.totalCount)}
            data-doc-translation-summary-pending={String(liveTranslationProjectionSummary.pendingCount)}
            data-doc-translation-summary-ready={String(liveTranslationProjectionSummary.readyCount)}
            data-doc-translation-summary-error={String(liveTranslationProjectionSummary.errorCount)}
            data-doc-translation-summary-health={liveTranslationProjectionSummary.healthStatus}
            data-doc-translation-summary-display-status={liveTranslationProjectionSummary.displayStatus}
            data-doc-translation-summary-display-status-reason={liveTranslationProjectionSummary.displayStatusReason}
            data-doc-translation-summary-account-locale={translationAccountLocale}
            data-doc-translation-summary-target-language={translationTargetLanguage}
            data-doc-translation-summary-language-routing-policy={translationLanguageRoutingPolicy}
            data-doc-translation-summary-target-language-source={translationTargetLanguageSource}
            data-doc-translation-summary-source-id={translationSourceId ?? ""}
            data-doc-translation-summary-source-hash={translationSourceHash ?? ""}
            data-doc-translation-summary-source-text-hash={translationSourceTextHash ?? ""}
            data-doc-translation-summary-source-text-char-count={translationSourceTextCharCount ?? ""}
            data-doc-translation-summary-lane-session-id={latestOrNextTranslationLaneSessionId ?? ""}
            data-doc-translation-summary-source-binding-key={latestOrNextTranslationSourceBindingKey ?? ""}
            data-doc-translation-summary-source-identity-key={latestOrNextTranslationSourceIdentityKey ?? ""}
            data-doc-translation-summary-current-source-binding-key={currentTranslationSourceBindingKey ?? ""}
            data-doc-translation-summary-current-source-identity-key={currentTranslationSourceIdentityKey ?? ""}
            data-doc-translation-summary-label-visible={String(Boolean(translationStatusLabel))}
            data-doc-translation-summary-renderable={String(liveTranslationProjectionSummary.hasRenderableText)}
            data-doc-translation-summary-has-errors={String(liveTranslationProjectionSummary.hasProjectionErrors)}
            data-doc-translation-summary-projected={String(liveTranslationProjectionSummary.projectedCount)}
            data-doc-translation-summary-stale={String(liveTranslationProjectionSummary.staleCount)}
            data-doc-translation-summary-cancelled={String(liveTranslationProjectionSummary.cancelledCount)}
            data-doc-translation-summary-failed={String(liveTranslationProjectionSummary.failedCount)}
            data-doc-translation-summary-latest-status={liveTranslationProjectionSummary.latestStatus ?? ""}
            data-doc-translation-summary-latest-observed-at-ms={liveTranslationProjectionSummary.latestObservedAtMs ?? ""}
            data-doc-translation-summary-latest-source-event-id={liveTranslationProjectionSummary.latestSourceEventId ?? ""}
            data-doc-translation-summary-latest-source-event-ms={liveTranslationProjectionSummary.latestSourceEventMs ?? ""}
            data-doc-translation-summary-latest-observation-ref={liveTranslationProjectionSummary.latestObservationRef ?? ""}
            data-doc-translation-summary-latest-receipt-ref={liveTranslationProjectionSummary.latestReceiptRef ?? ""}
            data-doc-translation-summary-latest-visible-observation-ref={liveTranslationProjectionSummary.latestVisibleObservationRef ?? ""}
            data-doc-translation-summary-latest-visible-receipt-ref={liveTranslationProjectionSummary.latestVisibleReceiptRef ?? ""}
            data-doc-translation-summary-latest-evidence-observation-ref={liveTranslationProjectionSummary.latestEvidenceObservationRef ?? ""}
            data-doc-translation-summary-latest-evidence-receipt-ref={liveTranslationProjectionSummary.latestEvidenceReceiptRef ?? ""}
            data-doc-translation-summary-latest-lane-session-id={liveTranslationProjectionSummary.latestLaneSessionId ?? ""}
            data-doc-translation-summary-latest-observation-lane-session-id={liveTranslationProjectionSummary.latestObservationLaneSessionId ?? ""}
            data-doc-translation-summary-latest-goal-binding-id-from-projection={liveTranslationProjectionSummary.latestGoalBindingIdFromProjection ?? ""}
            data-doc-translation-summary-latest-session-control-key={liveTranslationProjectionSummary.latestSessionControlKey ?? ""}
            data-doc-translation-summary-latest-source-binding-key={liveTranslationProjectionSummary.latestSourceBindingKey ?? ""}
            data-doc-translation-summary-latest-source-identity-key={liveTranslationProjectionSummary.latestSourceIdentityKey ?? ""}
            data-doc-translation-summary-latest-observation-key={liveTranslationProjectionSummary.latestObservationKey ?? ""}
            data-doc-translation-summary-latest-mail-loop-observation-key={liveTranslationProjectionSummary.latestMailLoopObservationKey ?? ""}
            data-doc-translation-summary-latest-goal-binding-key={liveTranslationProjectionSummary.latestGoalBindingKey ?? ""}
            data-doc-translation-summary-latest-event-id={liveTranslationProjectionSummary.latestEventId ?? ""}
            data-doc-translation-summary-latest-has-observation={String(liveTranslationProjectionSummary.latestHasObservation)}
            data-doc-translation-summary-latest-selected-runtime-agent-provider={liveTranslationProjectionSummary.latestSelectedRuntimeAgentProvider ?? ""}
            data-doc-translation-summary-latest-selected-backend-provider={liveTranslationProjectionSummary.latestSelectedBackendProvider ?? ""}
            data-doc-translation-summary-latest-chunk-id={liveTranslationProjectionSummary.latestChunkId ?? ""}
            data-doc-translation-summary-latest-chunk-index={liveTranslationProjectionSummary.latestChunkIndex ?? ""}
            data-doc-translation-summary-latest-dedupe-key={liveTranslationProjectionSummary.latestDedupeKey ?? ""}
            data-doc-translation-summary-latest-source={liveTranslationProjectionSummary.latestSource ?? ""}
            data-doc-translation-summary-latest-source-id={liveTranslationProjectionSummary.latestSourceId ?? ""}
            data-doc-translation-summary-latest-source-hash={liveTranslationProjectionSummary.latestSourceHash ?? ""}
            data-doc-translation-summary-latest-source-kind={liveTranslationProjectionSummary.latestSourceKind ?? ""}
            data-doc-translation-summary-latest-source-text-hash={liveTranslationProjectionSummary.latestSourceTextHash ?? ""}
            data-doc-translation-summary-latest-source-text-char-count={liveTranslationProjectionSummary.latestSourceTextCharCount ?? ""}
            data-doc-translation-summary-latest-projection-key={liveTranslationProjectionSummary.latestProjectionKey ?? ""}
            data-doc-translation-summary-latest-server-projection-key={liveTranslationProjectionSummary.latestServerProjectionKey ?? ""}
            data-doc-translation-summary-latest-projection-target={liveTranslationProjectionSummary.latestProjectionTarget ?? ""}
            data-doc-translation-summary-latest-account-locale={liveTranslationProjectionSummary.latestAccountLocale ?? ""}
            data-doc-translation-summary-latest-target-language={liveTranslationProjectionSummary.latestTargetLanguage ?? ""}
            data-doc-translation-summary-latest-projection-status={liveTranslationProjectionSummary.latestProjectionStatus ?? ""}
            data-doc-translation-summary-latest-freshness-status={liveTranslationProjectionSummary.latestFreshnessStatus ?? ""}
            data-doc-translation-summary-latest-context-role={liveTranslationProjectionSummary.latestContextRole ?? ""}
            data-doc-translation-summary-latest-terminal-authority-status={liveTranslationProjectionSummary.latestTerminalAuthorityStatus}
            data-doc-translation-summary-latest-cancel-requested={String(liveTranslationProjectionSummary.latestCancelRequested)}
            data-doc-translation-summary-latest-error={liveTranslationProjectionSummary.latestError ?? ""}
            data-doc-translation-summary-suppressed-receipts={String(liveTranslationProjectionSummary.suppressedReceiptCount)}
            data-doc-translation-summary-latest-suppressed-observation-ref={liveTranslationProjectionSummary.latestSuppressedObservationRef ?? ""}
            data-doc-translation-summary-latest-suppressed-receipt-ref={liveTranslationProjectionSummary.latestSuppressedReceiptRef ?? ""}
            data-doc-translation-summary-latest-suppressed-observation-lane-session-id={liveTranslationProjectionSummary.latestSuppressedObservationLaneSessionId ?? ""}
            data-doc-translation-summary-latest-suppressed-goal-binding-id={liveTranslationProjectionSummary.latestSuppressedGoalBindingId ?? ""}
            data-doc-translation-summary-latest-suppressed-session-control-key={liveTranslationProjectionSummary.latestSuppressedSessionControlKey ?? ""}
            data-doc-translation-summary-latest-suppressed-source-binding-key={liveTranslationProjectionSummary.latestSuppressedSourceBindingKey ?? ""}
            data-doc-translation-summary-latest-suppressed-source-identity-key={liveTranslationProjectionSummary.latestSuppressedSourceIdentityKey ?? ""}
            data-doc-translation-summary-latest-suppressed-observation-key={liveTranslationProjectionSummary.latestSuppressedObservationKey ?? ""}
            data-doc-translation-summary-latest-suppressed-mail-loop-observation-key={liveTranslationProjectionSummary.latestSuppressedMailLoopObservationKey ?? ""}
            data-doc-translation-summary-latest-suppressed-goal-binding-key={liveTranslationProjectionSummary.latestSuppressedGoalBindingKey ?? ""}
            data-doc-translation-summary-latest-suppressed-event-id={liveTranslationProjectionSummary.latestSuppressedEventId ?? ""}
            data-doc-translation-summary-latest-suppressed-has-observation={String(liveTranslationProjectionSummary.latestSuppressedHasObservation)}
            data-doc-translation-summary-latest-suppressed-selected-runtime-agent-provider={liveTranslationProjectionSummary.latestSuppressedSelectedRuntimeAgentProvider ?? ""}
            data-doc-translation-summary-latest-suppressed-selected-backend-provider={liveTranslationProjectionSummary.latestSuppressedSelectedBackendProvider ?? ""}
            data-doc-translation-summary-latest-suppressed-projection-status={liveTranslationProjectionSummary.latestSuppressedProjectionStatus ?? ""}
            data-doc-translation-summary-latest-suppressed-chunk-id={liveTranslationProjectionSummary.latestSuppressedChunkId ?? ""}
            data-doc-translation-summary-latest-suppressed-chunk-index={liveTranslationProjectionSummary.latestSuppressedChunkIndex ?? ""}
            data-doc-translation-summary-latest-suppressed-dedupe-key={liveTranslationProjectionSummary.latestSuppressedDedupeKey ?? ""}
            data-doc-translation-summary-latest-suppressed-source-event-id={liveTranslationProjectionSummary.latestSuppressedSourceEventId ?? ""}
            data-doc-translation-summary-latest-suppressed-source-event-ms={liveTranslationProjectionSummary.latestSuppressedSourceEventMs ?? ""}
            data-doc-translation-summary-latest-suppressed-observed-at-ms={liveTranslationProjectionSummary.latestSuppressedObservedAtMs ?? ""}
            data-doc-translation-summary-latest-suppressed-freshness-status={liveTranslationProjectionSummary.latestSuppressedFreshnessStatus ?? ""}
            data-doc-translation-summary-latest-suppressed-display-status={liveTranslationProjectionSummary.latestSuppressedDisplayStatus ?? ""}
            data-doc-translation-summary-latest-suppressed-context-role={liveTranslationProjectionSummary.latestSuppressedContextRole ?? ""}
            data-doc-translation-summary-latest-suppressed-terminal-authority-status={liveTranslationProjectionSummary.latestSuppressedTerminalAuthorityStatus}
            data-doc-translation-summary-latest-suppressed-source-id={liveTranslationProjectionSummary.latestSuppressedSourceId ?? ""}
            data-doc-translation-summary-latest-suppressed-source-hash={liveTranslationProjectionSummary.latestSuppressedSourceHash ?? ""}
            data-doc-translation-summary-latest-suppressed-source-kind={liveTranslationProjectionSummary.latestSuppressedSourceKind ?? ""}
            data-doc-translation-summary-latest-suppressed-source-text-hash={liveTranslationProjectionSummary.latestSuppressedSourceTextHash ?? ""}
            data-doc-translation-summary-latest-suppressed-source-text-char-count={liveTranslationProjectionSummary.latestSuppressedSourceTextCharCount ?? ""}
            data-doc-translation-summary-latest-suppressed-projection-key={liveTranslationProjectionSummary.latestSuppressedProjectionKey ?? ""}
            data-doc-translation-summary-latest-suppressed-server-projection-key={liveTranslationProjectionSummary.latestSuppressedServerProjectionKey ?? ""}
            data-doc-translation-summary-latest-suppressed-account-locale={liveTranslationProjectionSummary.latestSuppressedAccountLocale ?? ""}
            data-doc-translation-summary-latest-suppressed-projection-target={liveTranslationProjectionSummary.latestSuppressedProjectionTarget ?? ""}
            data-doc-translation-summary-latest-suppressed-target-language={liveTranslationProjectionSummary.latestSuppressedTargetLanguage ?? ""}
            data-doc-translation-summary-latest-suppressed-cancel-requested={String(liveTranslationProjectionSummary.latestSuppressedCancelRequested)}
            data-doc-translation-summary-latest-suppressed-reason={liveTranslationProjectionSummary.latestSuppressedReason ?? ""}
            data-doc-translation-summary-lane-sessions={String(liveTranslationProjectionSummary.laneSessionCount)}
            data-doc-translation-summary-active-lane-sessions={String(liveTranslationProjectionSummary.activeLaneSessionCount)}
            data-doc-translation-summary-observed-lane-sessions={String(liveTranslationProjectionSummary.observedLaneSessionCount)}
            data-doc-translation-summary-paused-lane-sessions={String(liveTranslationProjectionSummary.pausedLaneSessionCount)}
            data-doc-translation-summary-stopped-lane-sessions={String(liveTranslationProjectionSummary.stoppedLaneSessionCount)}
            data-doc-translation-summary-blocked-lane-sessions={String(liveTranslationProjectionSummary.blockedLaneSessionCount)}
            data-doc-translation-summary-latest-lane-session-status={liveTranslationProjectionSummary.latestLaneSessionStatus ?? ""}
            data-doc-translation-summary-latest-lane-session-health={liveTranslationProjectionSummary.latestLaneSessionHealth ?? ""}
            data-doc-translation-summary-latest-lane-session-lifecycle-action={liveTranslationProjectionSummary.latestLaneSessionLifecycleAction ?? ""}
            data-doc-translation-summary-latest-lane-session-reason={liveTranslationProjectionSummary.latestLaneSessionReason ?? ""}
            data-doc-translation-summary-latest-lane-session-debug-phase={liveTranslationProjectionSummary.latestLaneSessionDebugPhase ?? ""}
            data-doc-translation-summary-latest-lane-session-observation-status={liveTranslationProjectionSummary.latestLaneSessionObservationStatus ?? ""}
            data-doc-translation-summary-latest-lane-session-permission-profile={liveTranslationProjectionSummary.latestLaneSessionPermissionProfile ?? ""}
            data-doc-translation-summary-latest-lane-session-updated-at-ms={liveTranslationProjectionSummary.latestLaneSessionUpdatedAtMs ?? ""}
            data-doc-translation-summary-latest-lane-session-event-id={liveTranslationProjectionSummary.latestLaneSessionEventId ?? ""}
            data-doc-translation-summary-latest-lane-session-control-key={liveTranslationProjectionSummary.latestLaneSessionControlKey ?? ""}
            data-doc-translation-summary-latest-lane-session-source-binding-key={liveTranslationProjectionSummary.latestLaneSessionSourceBindingKey ?? ""}
            data-doc-translation-summary-latest-lane-session-source-identity-key={liveTranslationProjectionSummary.latestLaneSessionSourceIdentityKey ?? ""}
            data-doc-translation-summary-latest-lane-session-has-observation={String(liveTranslationProjectionSummary.latestLaneSessionHasObservation)}
            data-doc-translation-summary-latest-lane-session-source-id={liveTranslationProjectionSummary.latestLaneSessionSourceId ?? ""}
            data-doc-translation-summary-latest-lane-session-source-hash={liveTranslationProjectionSummary.latestLaneSessionSourceHash ?? ""}
            data-doc-translation-summary-latest-lane-session-source-kind={liveTranslationProjectionSummary.latestLaneSessionSourceKind ?? ""}
            data-doc-translation-summary-latest-lane-session-source-text-hash={liveTranslationProjectionSummary.latestLaneSessionSourceTextHash ?? ""}
            data-doc-translation-summary-latest-lane-session-source-text-char-count={liveTranslationProjectionSummary.latestLaneSessionSourceTextCharCount ?? ""}
            data-doc-translation-summary-latest-lane-session-projection-target={liveTranslationProjectionSummary.latestLaneSessionProjectionTarget ?? ""}
            data-doc-translation-summary-latest-lane-session-account-locale={liveTranslationProjectionSummary.latestLaneSessionAccountLocale ?? ""}
            data-doc-translation-summary-latest-lane-session-target-language={liveTranslationProjectionSummary.latestLaneSessionTargetLanguage ?? ""}
            data-doc-translation-summary-latest-lane-session-chunk-id={liveTranslationProjectionSummary.latestLaneSessionChunkId ?? ""}
            data-doc-translation-summary-latest-lane-session-chunk-index={liveTranslationProjectionSummary.latestLaneSessionChunkIndex ?? ""}
            data-doc-translation-summary-latest-lane-session-dedupe-key={liveTranslationProjectionSummary.latestLaneSessionDedupeKey ?? ""}
            data-doc-translation-summary-latest-lane-session-source-event-id={liveTranslationProjectionSummary.latestLaneSessionSourceEventId ?? ""}
            data-doc-translation-summary-latest-lane-session-source-event-ms={liveTranslationProjectionSummary.latestLaneSessionSourceEventMs ?? ""}
            data-doc-translation-summary-latest-lane-session-observed-at-ms={liveTranslationProjectionSummary.latestLaneSessionObservedAtMs ?? ""}
            data-doc-translation-summary-latest-lane-session-freshness-status={liveTranslationProjectionSummary.latestLaneSessionFreshnessStatus ?? ""}
            data-doc-translation-summary-latest-lane-session-selected-runtime-agent-provider={liveTranslationProjectionSummary.latestLaneSessionSelectedRuntimeAgentProvider ?? ""}
            data-doc-translation-summary-latest-lane-session-selected-backend-provider={liveTranslationProjectionSummary.latestLaneSessionSelectedBackendProvider ?? ""}
            data-doc-translation-summary-latest-lane-session-terminal-authority-status={liveTranslationProjectionSummary.latestLaneSessionTerminalAuthorityStatus}
            data-doc-translation-summary-mail-loops={String(liveTranslationProjectionSummary.mailLoopCount)}
            data-doc-translation-summary-pending-mail-loops={String(liveTranslationProjectionSummary.pendingMailLoopCount)}
            data-doc-translation-summary-observed-mail-loops={String(liveTranslationProjectionSummary.observedMailLoopCount)}
            data-doc-translation-summary-blocked-mail-loops={String(liveTranslationProjectionSummary.blockedMailLoopCount)}
            data-doc-translation-summary-latest-mail-loop-status={liveTranslationProjectionSummary.latestMailLoopStatus ?? ""}
            data-doc-translation-summary-latest-mail-loop-id={liveTranslationProjectionSummary.latestMailLoopId ?? ""}
            data-doc-translation-summary-latest-mail-loop-delivery-status={liveTranslationProjectionSummary.latestMailLoopDeliveryStatus ?? ""}
            data-doc-translation-summary-latest-mail-loop-blocked-reason={liveTranslationProjectionSummary.latestMailLoopBlockedReason ?? ""}
            data-doc-translation-summary-latest-previous-stage-play-mail-id={liveTranslationProjectionSummary.latestPreviousStagePlayMailId ?? ""}
            data-doc-translation-summary-latest-mail-loop-wake-kind={liveTranslationProjectionSummary.latestMailLoopWakeKind}
            data-doc-translation-summary-latest-mail-loop-mailbox-wake-expected={String(liveTranslationProjectionSummary.latestMailLoopMailboxWakeExpected)}
            data-doc-translation-summary-latest-mail-loop-decision-wake-expected={String(liveTranslationProjectionSummary.latestMailLoopDecisionWakeExpected)}
            data-doc-translation-summary-latest-mail-loop-observation-lane-session-id={liveTranslationProjectionSummary.latestMailLoopObservationLaneSessionId ?? ""}
            data-doc-translation-summary-latest-mail-loop-session-control-key={liveTranslationProjectionSummary.latestMailLoopSessionControlKey ?? ""}
            data-doc-translation-summary-latest-mail-loop-source-binding-key={liveTranslationProjectionSummary.latestMailLoopSourceBindingKey ?? ""}
            data-doc-translation-summary-latest-mail-loop-source-identity-key={liveTranslationProjectionSummary.latestMailLoopSourceIdentityKey ?? ""}
            data-doc-translation-summary-latest-mail-loop-lane-session-source-binding-key={liveTranslationProjectionSummary.latestMailLoopLaneSessionSourceBindingKey ?? ""}
            data-doc-translation-summary-latest-mail-loop-lane-session-source-identity-key={liveTranslationProjectionSummary.latestMailLoopLaneSessionSourceIdentityKey ?? ""}
            data-doc-translation-summary-latest-mail-loop-source-id={liveTranslationProjectionSummary.latestMailLoopSourceId ?? ""}
            data-doc-translation-summary-latest-mail-loop-source-hash={liveTranslationProjectionSummary.latestMailLoopSourceHash ?? ""}
            data-doc-translation-summary-latest-mail-loop-source-kind={liveTranslationProjectionSummary.latestMailLoopSourceKind ?? ""}
            data-doc-translation-summary-latest-mail-loop-source-text-hash={liveTranslationProjectionSummary.latestMailLoopSourceTextHash ?? ""}
            data-doc-translation-summary-latest-mail-loop-source-text-char-count={liveTranslationProjectionSummary.latestMailLoopSourceTextCharCount ?? ""}
            data-doc-translation-summary-latest-mail-loop-projection-target={liveTranslationProjectionSummary.latestMailLoopProjectionTarget ?? ""}
            data-doc-translation-summary-latest-mail-loop-account-locale={liveTranslationProjectionSummary.latestMailLoopAccountLocale ?? ""}
            data-doc-translation-summary-latest-mail-loop-target-language={liveTranslationProjectionSummary.latestMailLoopTargetLanguage ?? ""}
            data-doc-translation-summary-latest-mail-loop-chunk-id={liveTranslationProjectionSummary.latestMailLoopChunkId ?? ""}
            data-doc-translation-summary-latest-mail-loop-chunk-index={liveTranslationProjectionSummary.latestMailLoopChunkIndex ?? ""}
            data-doc-translation-summary-latest-mail-loop-dedupe-key={liveTranslationProjectionSummary.latestMailLoopDedupeKey ?? ""}
            data-doc-translation-summary-latest-mail-loop-source-event-id={liveTranslationProjectionSummary.latestMailLoopSourceEventId ?? ""}
            data-doc-translation-summary-latest-mail-loop-source-event-ms={liveTranslationProjectionSummary.latestMailLoopSourceEventMs ?? ""}
            data-doc-translation-summary-latest-mail-loop-observed-at-ms={liveTranslationProjectionSummary.latestMailLoopObservedAtMs ?? ""}
            data-doc-translation-summary-latest-mail-loop-freshness-status={liveTranslationProjectionSummary.latestMailLoopFreshnessStatus ?? ""}
            data-doc-translation-summary-latest-mail-loop-selected-runtime-agent-provider={liveTranslationProjectionSummary.latestMailLoopSelectedRuntimeAgentProvider ?? ""}
            data-doc-translation-summary-latest-mail-loop-selected-backend-provider={liveTranslationProjectionSummary.latestMailLoopSelectedBackendProvider ?? ""}
            data-doc-translation-summary-latest-mail-loop-terminal-authority-status={liveTranslationProjectionSummary.latestMailLoopTerminalAuthorityStatus}
            data-doc-translation-summary-goal-bindings={String(liveTranslationProjectionSummary.goalBindingCount)}
            data-doc-translation-summary-active-goal-bindings={String(liveTranslationProjectionSummary.activeGoalBindingCount)}
            data-doc-translation-summary-observed-goal-bindings={String(liveTranslationProjectionSummary.observedGoalBindingCount)}
            data-doc-translation-summary-blocked-goal-bindings={String(liveTranslationProjectionSummary.blockedGoalBindingCount)}
            data-doc-translation-summary-latest-goal-binding-id={liveTranslationProjectionSummary.latestGoalBindingId ?? ""}
            data-doc-translation-summary-latest-goal-id={liveTranslationProjectionSummary.latestGoalId ?? ""}
            data-doc-translation-summary-latest-goal-binding-lane-session-id={liveTranslationProjectionSummary.latestGoalBindingLaneSessionId ?? ""}
            data-doc-translation-summary-latest-goal-binding-status={liveTranslationProjectionSummary.latestGoalBindingStatus ?? ""}
            data-doc-translation-summary-latest-goal-binding-session-status={liveTranslationProjectionSummary.latestGoalBindingSessionStatus ?? ""}
            data-doc-translation-summary-latest-goal-binding-session-health={liveTranslationProjectionSummary.latestGoalBindingSessionHealth ?? ""}
            data-doc-translation-summary-latest-goal-binding-activation-policy={liveTranslationProjectionSummary.latestGoalBindingActivationPolicy ?? ""}
            data-doc-translation-summary-latest-goal-binding-attention-policy={liveTranslationProjectionSummary.latestGoalBindingAttentionPolicy ?? ""}
            data-doc-translation-summary-latest-goal-binding-stop-condition={liveTranslationProjectionSummary.latestGoalBindingStopCondition ?? ""}
            data-doc-translation-summary-latest-goal-binding-report-policy={liveTranslationProjectionSummary.latestGoalBindingReportPolicy ?? ""}
            data-doc-translation-summary-latest-goal-binding-quiet-behavior={liveTranslationProjectionSummary.latestGoalBindingQuietBehavior ?? ""}
            data-doc-translation-summary-latest-goal-binding-report-action={liveTranslationProjectionSummary.latestGoalBindingReportAction ?? ""}
            data-doc-translation-summary-latest-goal-binding-report-reason={liveTranslationProjectionSummary.latestGoalBindingReportReason ?? ""}
            data-doc-translation-summary-latest-goal-binding-quiet-behavior-applied={
              liveTranslationProjectionSummary.latestGoalBindingQuietBehaviorApplied === null
                ? ""
                : String(liveTranslationProjectionSummary.latestGoalBindingQuietBehaviorApplied)
            }
            data-doc-translation-summary-latest-goal-binding-wake-expected={
              liveTranslationProjectionSummary.latestGoalBindingWakeExpected === null
                ? ""
                : String(liveTranslationProjectionSummary.latestGoalBindingWakeExpected)
            }
            data-doc-translation-summary-latest-goal-binding-mailbox-wake-expected={
              liveTranslationProjectionSummary.latestGoalBindingMailboxWakeExpected === null
                ? ""
                : String(liveTranslationProjectionSummary.latestGoalBindingMailboxWakeExpected)
            }
            data-doc-translation-summary-latest-goal-binding-decision-wake-expected={
              liveTranslationProjectionSummary.latestGoalBindingDecisionWakeExpected === null
                ? ""
                : String(liveTranslationProjectionSummary.latestGoalBindingDecisionWakeExpected)
            }
            data-doc-translation-summary-latest-goal-binding-surface-badge-expected={
              liveTranslationProjectionSummary.latestGoalBindingSurfaceBadgeExpected === null
                ? ""
                : String(liveTranslationProjectionSummary.latestGoalBindingSurfaceBadgeExpected)
            }
            data-doc-translation-summary-latest-goal-binding-terminal-report-requested={
              liveTranslationProjectionSummary.latestGoalBindingTerminalReportRequested === null
                ? ""
                : String(liveTranslationProjectionSummary.latestGoalBindingTerminalReportRequested)
            }
            data-doc-translation-summary-latest-goal-binding-terminal-report-authorized={
              liveTranslationProjectionSummary.latestGoalBindingTerminalReportAuthorized === null
                ? ""
                : String(liveTranslationProjectionSummary.latestGoalBindingTerminalReportAuthorized)
            }
            data-doc-translation-summary-latest-goal-binding-selected-runtime-agent-provider={liveTranslationProjectionSummary.latestGoalBindingSelectedRuntimeAgentProvider ?? ""}
            data-doc-translation-summary-latest-goal-binding-selected-backend-provider={liveTranslationProjectionSummary.latestGoalBindingSelectedBackendProvider ?? ""}
            data-doc-translation-summary-latest-goal-binding-observation-ref={liveTranslationProjectionSummary.latestGoalBindingObservationRef ?? ""}
            data-doc-translation-summary-latest-goal-binding-receipt-ref={liveTranslationProjectionSummary.latestGoalBindingReceiptRef ?? ""}
            data-doc-translation-summary-latest-goal-binding-event-id={liveTranslationProjectionSummary.latestGoalBindingEventId ?? ""}
            data-doc-translation-summary-latest-goal-binding-session-control-key={liveTranslationProjectionSummary.latestGoalBindingSessionControlKey ?? ""}
            data-doc-translation-summary-latest-goal-binding-source-binding-key-from-event={liveTranslationProjectionSummary.latestGoalBindingSourceBindingKeyFromEvent ?? ""}
            data-doc-translation-summary-latest-goal-binding-source-identity-key={liveTranslationProjectionSummary.latestGoalBindingSourceIdentityKey ?? ""}
            data-doc-translation-summary-latest-goal-binding-lane-session-source-binding-key={liveTranslationProjectionSummary.latestGoalBindingLaneSessionSourceBindingKey ?? ""}
            data-doc-translation-summary-latest-goal-binding-lane-session-source-identity-key={liveTranslationProjectionSummary.latestGoalBindingLaneSessionSourceIdentityKey ?? ""}
            data-doc-translation-summary-latest-goal-binding-has-observation={String(liveTranslationProjectionSummary.latestGoalBindingHasObservation)}
            data-doc-translation-summary-latest-goal-binding-terminal-authority-status={liveTranslationProjectionSummary.latestGoalBindingTerminalAuthorityStatus}
            data-doc-translation-summary-latest-goal-binding-source-id={liveTranslationProjectionSummary.latestGoalBindingSourceId ?? ""}
            data-doc-translation-summary-latest-goal-binding-source-hash={liveTranslationProjectionSummary.latestGoalBindingSourceHash ?? ""}
            data-doc-translation-summary-latest-goal-binding-source-kind={liveTranslationProjectionSummary.latestGoalBindingSourceKind ?? ""}
            data-doc-translation-summary-latest-goal-binding-source-text-hash={liveTranslationProjectionSummary.latestGoalBindingSourceTextHash ?? ""}
            data-doc-translation-summary-latest-goal-binding-source-text-char-count={liveTranslationProjectionSummary.latestGoalBindingSourceTextCharCount ?? ""}
            data-doc-translation-summary-latest-goal-binding-projection-target={liveTranslationProjectionSummary.latestGoalBindingProjectionTarget ?? ""}
            data-doc-translation-summary-latest-goal-binding-account-locale={liveTranslationProjectionSummary.latestGoalBindingAccountLocale ?? ""}
            data-doc-translation-summary-latest-goal-binding-target-language={liveTranslationProjectionSummary.latestGoalBindingTargetLanguage ?? ""}
            data-doc-translation-summary-latest-goal-binding-chunk-id={liveTranslationProjectionSummary.latestGoalBindingChunkId ?? ""}
            data-doc-translation-summary-latest-goal-binding-chunk-index={liveTranslationProjectionSummary.latestGoalBindingChunkIndex ?? ""}
            data-doc-translation-summary-latest-goal-binding-dedupe-key={liveTranslationProjectionSummary.latestGoalBindingDedupeKey ?? ""}
            data-doc-translation-summary-latest-goal-binding-source-binding-key={liveTranslationProjectionSummary.latestGoalBindingSourceBindingKey ?? ""}
            data-doc-translation-summary-latest-goal-binding-source-identity-key-from-binding={liveTranslationProjectionSummary.latestGoalBindingSourceIdentityKeyFromBinding ?? ""}
            data-doc-translation-summary-latest-goal-binding-observation-key={liveTranslationProjectionSummary.latestGoalBindingObservationKey ?? ""}
            data-doc-translation-summary-latest-goal-binding-mail-loop-observation-key={liveTranslationProjectionSummary.latestGoalBindingMailLoopObservationKey ?? ""}
            data-doc-translation-summary-latest-goal-binding-key-from-binding={liveTranslationProjectionSummary.latestGoalBindingKeyFromBinding ?? ""}
            data-doc-translation-summary-observed-lane-activity={String(liveTranslationProjectionSummary.observedLaneActivityCount)}
            data-doc-translation-summary-authority-policy="projection_only_not_answer_authority"
            data-doc-translation-summary-terminal-authority-owner="helix"
            data-doc-translation-summary-governed-projection="true"
            data-doc-translation-summary-reentry-required="true"
            data-doc-translation-summary-answer-authority="false"
            data-doc-translation-summary-terminal-eligible="false"
            data-doc-translation-summary-assistant-answer="false"
            data-doc-translation-summary-raw-content-included="false"
          >
            {translationStatusLabel ?? ""}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {canExportPrintPdf && onExportPrintPdf ? (
          <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.docs-print-pdf-button"
            variant="outline"
            size="sm"
            onClick={onExportPrintPdf}
            disabled={pdfExportStatus === "exporting"}
            data-testid="docs-print-pdf-button"
            title={t("docsViewer.action.exportPdf")}
          >
            {pdfExportStatus === "exporting" ? (
              <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
            )}
            {pdfExportStatus === "exporting"
              ? t("docsViewer.action.exportingPdf")
              : t("docsViewer.action.exportPdf")}
          </Button>
        ) : null}
        {translationEligible ? (
          <>
            <Button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.on-toggle-inline-translation"
              ref={inlineTranslationButtonRegionRef}
              variant="outline"
              size="sm"
              onClick={onToggleInlineTranslation}
              data-helix-visible-translation-region-id={DOC_VIEWER_TRANSLATE_BUTTON_REGION_ID}
              data-helix-visible-translation-source-id={DOC_VIEWER_TRANSLATE_BUTTON_SOURCE_ID}
              data-doc-translation-control="inline-account-language"
              data-doc-translation-control-action={inlineTranslationEnabled ? "stop" : "start"}
              data-doc-translation-control-enabled={String(inlineTranslationEnabled)}
              data-doc-translation-control-lane-session-id={latestOrNextTranslationLaneSessionId ?? ""}
              data-doc-translation-control-source-id={translationSourceId ?? ""}
              data-doc-translation-control-target-language={translationTargetLanguage}
              data-doc-translation-control-account-locale={translationAccountLocale}
              data-doc-translation-control-language-routing-policy={translationLanguageRoutingPolicy}
              data-doc-translation-control-target-language-source={translationTargetLanguageSource}
              data-doc-translation-control-source-hash={translationSourceHash ?? ""}
              data-doc-translation-control-source-text-hash={translationSourceTextHash ?? ""}
              data-doc-translation-control-source-text-char-count={translationSourceTextCharCount ?? ""}
              data-doc-translation-control-source-binding-key={latestOrNextTranslationSourceBindingKey ?? ""}
              data-doc-translation-control-source-identity-key={latestOrNextTranslationSourceIdentityKey ?? ""}
              data-doc-translation-control-current-source-binding-key={currentTranslationSourceBindingKey ?? ""}
              data-doc-translation-control-current-source-identity-key={currentTranslationSourceIdentityKey ?? ""}
              data-doc-translation-control-latest-source-identity-key={latestOrNextTranslationSourceIdentityKey ?? ""}
              data-doc-translation-control-projection-target={HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK}
              data-doc-translation-control-reentry-required="true"
              data-doc-translation-control-answer-authority="false"
              data-doc-translation-control-terminal-eligible="false"
              data-doc-translation-control-assistant-answer="false"
              data-doc-translation-control-raw-content-included="false"
            >
              <Languages className="mr-1.5 h-3.5 w-3.5" />
              <span
                data-helix-visible-translation-region-id={DOC_VIEWER_TRANSLATE_BUTTON_REGION_ID}
                data-helix-visible-translation-source-id={DOC_VIEWER_TRANSLATE_BUTTON_SOURCE_ID}
              >
                {inlineTranslationButtonProjection ? (
                  <HelixAccountLanguageTranslationProjection
                    state={inlineTranslationButtonProjection}
                    sourceText={inlineTranslationButtonSourceLabel}
                  />
                ) : inlineTranslationButtonSourceLabel}
              </span>
            </Button>
            {hasControllableTranslationLaneSession ? (
              <Button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.on-toggle-inline-translation-session-pause"
                variant="outline"
                size="icon"
                onClick={onToggleInlineTranslationSessionPause}
                aria-label={
                  isTranslationLaneSessionPaused
                    ? t("docsViewer.translation.resumeSession")
                    : t("docsViewer.translation.pauseSession")
                }
                title={
                  isTranslationLaneSessionPaused
                    ? t("docsViewer.translation.resumeSession")
                    : t("docsViewer.translation.pauseSession")
                }
                data-doc-translation-session-control="pause-resume"
                data-doc-translation-session-control-action={isTranslationLaneSessionPaused ? "resume" : "pause"}
                data-doc-translation-session-control-status={latestLaneSessionStatus ?? ""}
                data-doc-translation-session-control-lane-session-id={latestOrNextTranslationLaneSessionId ?? ""}
                data-doc-translation-session-control-source-id={translationSourceId ?? ""}
                data-doc-translation-session-control-target-language={translationTargetLanguage}
                data-doc-translation-session-control-account-locale={translationAccountLocale}
                data-doc-translation-session-control-language-routing-policy={translationLanguageRoutingPolicy}
                data-doc-translation-session-control-target-language-source={translationTargetLanguageSource}
                data-doc-translation-session-control-source-hash={translationSourceHash ?? ""}
                data-doc-translation-session-control-source-text-hash={translationSourceTextHash ?? ""}
                data-doc-translation-session-control-source-text-char-count={translationSourceTextCharCount ?? ""}
                data-doc-translation-session-control-source-binding-key={latestOrNextLaneSessionSourceBindingKey ?? ""}
                data-doc-translation-session-control-source-identity-key={latestOrNextLaneSessionSourceIdentityKey ?? ""}
                data-doc-translation-session-control-current-source-binding-key={currentLaneSessionSourceBindingKey ?? ""}
                data-doc-translation-session-control-current-source-identity-key={currentLaneSessionSourceIdentityKey ?? ""}
                data-doc-translation-session-control-latest-source-identity-key={latestOrNextLaneSessionSourceIdentityKey ?? ""}
                data-doc-translation-session-control-reentry-required="true"
                data-doc-translation-session-control-answer-authority="false"
                data-doc-translation-session-control-terminal-eligible="false"
                data-doc-translation-session-control-assistant-answer="false"
                data-doc-translation-session-control-raw-content-included="false"
                className="h-9 w-9 shrink-0"
              >
                {isTranslationLaneSessionPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </Button>
            ) : null}
          </>
        ) : null}
        {isAutoReading ? (
          <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.on-stop-auto-read" variant="destructive" size="sm" onClick={onStopAutoRead}>
            {t("docsViewer.action.stopReading")}
          </Button>
        ) : null}
        {canRejoinLiveRead ? (
          <Button data-helix-interaction-kind="observe" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.docs-viewer.doc-viewer-panel.on-rejoin-live-read" variant="outline" size="sm" onClick={onRejoinLiveRead}>
            {t("docsViewer.action.rejoinLiveRead")}
          </Button>
        ) : null}
      </div>
    </header>
  );
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

function formatLaneSessionStatusForLabel(args: {
  status: string | null;
  health: string | null;
  fallback: string;
}): string {
  const status = args.status ?? args.fallback;
  if (!args.health || args.health === status) {
    return status;
  }
  return `${status} / ${args.health}`;
}

export function getDocumentTranslationStatusLabel(args: {
  translationStatus: DocumentTranslationUiStatus;
  translationError: string | null;
  liveTranslationProjectionSummary: DocumentLiveTranslationProjectionSnapshotSummary;
  t: Translate;
}): string | null {
  if (args.liveTranslationProjectionSummary.blockedLaneSessionCount > 0) {
    return args.t("docsViewer.translation.status.sessionBlocked", {
      status: formatLaneSessionStatusForLabel({
        status: args.liveTranslationProjectionSummary.latestLaneSessionStatus,
        health: args.liveTranslationProjectionSummary.latestLaneSessionHealth,
        fallback: "blocked",
      }),
    });
  }
  if (args.liveTranslationProjectionSummary.blockedMailLoopCount > 0) {
    return args.t("docsViewer.translation.status.mailLoopBlocked", {
      status: args.liveTranslationProjectionSummary.latestMailLoopStatus ?? "blocked",
    });
  }
  if (args.liveTranslationProjectionSummary.blockedGoalBindingCount > 0) {
    return args.t("docsViewer.translation.status.goalBindingBlocked", {
      status: args.liveTranslationProjectionSummary.latestGoalBindingStatus ?? "blocked",
    });
  }
  if (args.liveTranslationProjectionSummary.latestLaneSessionStatus === "paused") {
    return args.t("docsViewer.translation.status.sessionPaused", {
      status: formatLaneSessionStatusForLabel({
        status: args.liveTranslationProjectionSummary.latestLaneSessionStatus,
        health: args.liveTranslationProjectionSummary.latestLaneSessionHealth,
        fallback: "paused",
      }),
    });
  }
  if (args.liveTranslationProjectionSummary.failedCount > 0 && !args.liveTranslationProjectionSummary.hasRenderableText) {
    return args.t("docsViewer.translation.status.projectionFailed", {
      reason:
        args.liveTranslationProjectionSummary.latestError ??
        args.liveTranslationProjectionSummary.latestProjectionStatus ??
        "failed",
    });
  }
  if (args.liveTranslationProjectionSummary.cancelledCount > 0 && !args.liveTranslationProjectionSummary.hasRenderableText) {
    return args.t("docsViewer.translation.status.projectionCancelled", {
      status: args.liveTranslationProjectionSummary.latestProjectionStatus ?? "cancelled",
    });
  }
  if (args.liveTranslationProjectionSummary.staleCount > 0 && !args.liveTranslationProjectionSummary.hasRenderableText) {
    return args.t("docsViewer.translation.status.projectionStale", {
      status: args.liveTranslationProjectionSummary.latestFreshnessStatus ??
        args.liveTranslationProjectionSummary.latestProjectionStatus ??
        "stale",
    });
  }
  if (args.liveTranslationProjectionSummary.activeGoalBindingCount > 0 && args.translationStatus === "idle") {
    return args.t("docsViewer.translation.status.goalBindingActive", {
      status: args.liveTranslationProjectionSummary.latestGoalBindingStatus ?? "active",
    });
  }
  if (args.liveTranslationProjectionSummary.pendingMailLoopCount > 0 && args.translationStatus === "idle") {
    return args.t("docsViewer.translation.status.mailLoopPending", {
      status: args.liveTranslationProjectionSummary.latestMailLoopStatus ?? "pending",
    });
  }
  if (args.liveTranslationProjectionSummary.pendingCount > 0 && !args.liveTranslationProjectionSummary.hasRenderableText) {
    return args.t("docsViewer.translation.status.projectionPending", {
      status:
        args.liveTranslationProjectionSummary.latestProjectionStatus ??
        args.liveTranslationProjectionSummary.latestFreshnessStatus ??
        "pending",
    });
  }
  if (args.liveTranslationProjectionSummary.activeLaneSessionCount > 0 && args.translationStatus === "idle") {
    return args.t("docsViewer.translation.status.sessionActive", {
      status: formatLaneSessionStatusForLabel({
        status: args.liveTranslationProjectionSummary.latestLaneSessionStatus,
        health: args.liveTranslationProjectionSummary.latestLaneSessionHealth,
        fallback: "running",
      }),
    });
  }
  if (
    args.liveTranslationProjectionSummary.hasRenderableText &&
    args.liveTranslationProjectionSummary.healthStatus === "ready" &&
    (args.translationStatus === "idle" ||
      args.translationStatus === "cached" ||
      args.translationStatus === "ready")
  ) {
    return args.t("docsViewer.translation.status.ready", {
      status: args.liveTranslationProjectionSummary.latestProjectionStatus ?? "projected",
    });
  }
  if (
    args.liveTranslationProjectionSummary.hasRenderableText &&
    args.liveTranslationProjectionSummary.healthStatus === "degraded" &&
    (args.translationStatus === "idle" ||
      args.translationStatus === "cached" ||
      args.translationStatus === "ready")
  ) {
    return args.t("docsViewer.translation.status.projectionDegraded", {
      status:
        args.liveTranslationProjectionSummary.latestSuppressedDisplayStatus ??
        args.liveTranslationProjectionSummary.latestProjectionStatus ??
        args.liveTranslationProjectionSummary.healthStatus,
    });
  }
  switch (args.translationStatus) {
    case "cached":
      return args.t("docsViewer.translation.status.cached");
    case "translating":
      return args.t("docsViewer.translation.status.translating");
    case "ready":
      return args.t("docsViewer.translation.status.inlineEnabled");
    case "unavailable":
      return args.t("docsViewer.translation.status.unavailable", {
        reason: args.translationError ?? args.t("docsViewer.translation.errorGeneric"),
      });
    case "error":
      return args.t("docsViewer.translation.status.error", {
        reason: args.translationError ?? args.t("docsViewer.translation.errorGeneric"),
      });
    case "idle":
    default:
      return null;
  }
}

function groupBySubject(entries: DocManifestEntry[], t: Translate): GroupedDocs[] {
  const map = new Map<string, DocManifestEntry[]>();
  entries.forEach((entry) => {
    const label = localizeDocSubjectLabel(entry.subjectLabel, t);
    const bucket = map.get(label);
    if (bucket) {
      bucket.push(entry);
    } else {
      map.set(label, [entry]);
    }
  });
  return Array.from(map.entries())
    .sort((a, b) => groupRecencyScore(b[1]) - groupRecencyScore(a[1]) || a[0].localeCompare(b[0]))
    .map(([label, bucket]) => ({
      label,
      entries: bucket.sort(compareDocCatalogEntries),
    }));
}

function buildDocTaxonomyCounts(entries: DocManifestEntry[]): Record<DocTaxonomyFilter, number> {
  const counts: Record<DocTaxonomyFilter, number> = {
    all: entries.length,
    "runtime-whitepaper": 0,
    "canonical-research": 0,
    "current-development": 0,
    "synthetic-research": 0,
    "legacy-development": 0,
    uncategorized: 0,
  };
  entries.forEach((entry) => {
    if (isRuntimeWhitepaper(entry)) counts["runtime-whitepaper"] += 1;
    const key = normalizeDocTaxonomyFilter(entry.docClass);
    counts[key] += 1;
  });
  return counts;
}

function docMatchesTaxonomyFilter(entry: DocManifestEntry, filter: DocTaxonomyFilter): boolean {
  if (filter === "all") return true;
  if (filter === "runtime-whitepaper") return isRuntimeWhitepaper(entry);
  return normalizeDocTaxonomyFilter(entry.docClass) === filter;
}

function isRuntimeWhitepaper(entry: DocManifestEntry): boolean {
  return entry.docClass === "canonical-research"
    && entry.canonical
    && entry.bundleKind === "equation-action-whitepaper"
    && entry.toolHints?.calculatorReady === true
    && entry.sidecars.length > 0;
}

function normalizeDocTaxonomyFilter(docClass: string | null | undefined): ManifestDocClass {
  if (
    docClass === "canonical-research" ||
    docClass === "current-development" ||
    docClass === "synthetic-research" ||
    docClass === "legacy-development"
  ) {
    return docClass;
  }
  return "uncategorized";
}

function getDocBadges(entry: DocManifestEntry, t: Translate): DocBadge[] {
  const badges: DocBadge[] = [];
  if (isRuntimeWhitepaper(entry)) {
    badges.push({ label: t("docsViewer.taxonomy.runtimeWhitepaper"), tone: "amber" });
  }
  const docClass = normalizeDocTaxonomyFilter(entry.docClass);
  if (docClass !== "all" && docClass !== "uncategorized") {
    badges.push({
      label: t(docTaxonomyLabelMessages[docClass]),
      tone: docClass === "canonical-research" ? "cyan" : docClass === "current-development" ? "emerald" : docClass === "synthetic-research" ? "amber" : "slate",
    });
  }
  if (entry.toolHints?.calculatorReady === true) {
    badges.push({ label: t("docsViewer.taxonomy.calculatorReady"), tone: "emerald" });
  }
  if (entry.sidecars.length > 0) {
    badges.push({ label: t("docsViewer.taxonomy.sidecarsAttached"), tone: "slate" });
  }
  return badges;
}

function docBadgeToneClass(tone: DocBadgeTone): string {
  switch (tone) {
    case "cyan":
      return "bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-400/25";
    case "emerald":
      return "bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-400/25";
    case "amber":
      return "bg-amber-400/15 text-amber-100 ring-1 ring-amber-400/25";
    case "slate":
    default:
      return "bg-slate-400/10 text-slate-200 ring-1 ring-slate-300/15";
  }
}

export const __testDocViewerTaxonomy = {
  buildPendingDocumentInlineTranslationState,
  shouldAutoEnableInlineTranslationProjection,
  clearStoredPrivateResearchInlineTranslationSessions,
  collectVisibleTranslationUnitIds,
  collectNearViewportTranslationUnitIds,
  buildDocTaxonomyCounts,
  docMatchesTaxonomyFilter,
  getDocBadges,
  renderMathMarkdown,
};

function shouldAutoEnableInlineTranslationProjection(
  snapshot: Pick<DocumentLiveTranslationProjectionSnapshot, "version" | "translations">,
): boolean {
  if (snapshot.version <= 0) return false;
  return Object.values(snapshot.translations).some((translation) => translation.status === "ready");
}

export function arrangeDirectoryEntries(
  entries: DocManifestEntry[],
  sort: DocDirectorySort,
  t: Translate,
): GroupedDocs[] {
  if (sort === "subject") return groupBySubject(entries, t);

  const sortedEntries = [...entries].sort((a, b) => {
    if (sort === "title") {
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    }
    const editedDelta = (b.fileMtimeMs ?? 0) - (a.fileMtimeMs ?? 0);
    return editedDelta || a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
  return sortedEntries.length > 0
    ? [{
        label: sort === "last-edited" ? t("docsViewer.sort.lastEdited") : t("docsViewer.sort.title"),
        entries: sortedEntries,
      }]
    : [];
}

function localizeDocSubjectLabel(subjectLabel: string | null | undefined, t: Translate): string {
  const normalized = subjectLabel?.trim();
  if (!normalized) return t("docsViewer.group.generalReference");
  const messageId = docSubjectLabelMessages[normalized];
  return messageId ? t(messageId) : normalized;
}

function groupRecencyScore(entries: DocManifestEntry[]): number {
  return entries.reduce((score, entry) => {
    return Math.max(score, docCatalogTimestamp(entry));
  }, 0);
}

function formatDocCatalogDate(entry: DocManifestEntry, t: Translate): string | null {
  if (!entry.catalogDate) return null;
  if (entry.catalogDateSource === "mtime") return t("docsViewer.catalog.editedDate", { date: entry.catalogDate });
  return t("docsViewer.catalog.datedDate", { date: entry.catalogDate });
}

function storedInlineTranslationSessionMatchesScope(
  session: Partial<StoredInlineTranslationSession> | null | undefined,
  scope: StoredInlineTranslationSessionScope,
): boolean {
  if (!session) return false;
  if (session.sourceHash && session.sourceHash !== scope.sourceHash) return false;
  if (scope.sourceIdentityKey && session.sourceIdentityKey !== scope.sourceIdentityKey) return false;
  if (!scope.sourceIdentityKey && session.sourceIdentityKey) return false;
  if (session.sourceTextHash && session.sourceTextHash !== scope.sourceTextHash) return false;
  if (
    typeof session.sourceTextCharCount === "number" &&
    session.sourceTextCharCount !== scope.sourceTextCharCount
  ) return false;
  if (session.accountLocale && session.accountLocale !== scope.accountLocale) return false;
  if (session.targetLanguage && session.targetLanguage !== scope.targetLanguage) return false;
  return true;
}

function readStoredInlineTranslationSession(
  scopeKey: string,
  scope: StoredInlineTranslationSessionScope,
): StoredInlineTranslationSession {
  if (typeof window === "undefined") return { enabled: false, translations: {} };
  try {
    const raw = window.sessionStorage.getItem(`${DOC_INLINE_TRANSLATION_SESSION_PREFIX}:${scopeKey}`);
    if (!raw) return { enabled: false, translations: {} };
    const parsed = JSON.parse(raw) as Partial<StoredInlineTranslationSession> | null;
    if (!storedInlineTranslationSessionMatchesScope(parsed, scope)) {
      return { enabled: false, translations: {} };
    }
    const translations = parsed?.translations && typeof parsed.translations === "object"
      ? filterReadyDocumentInlineTranslationRenderStates(parsed.translations)
      : {};
    return {
      enabled: Boolean(parsed?.enabled),
      sourceHash: scope.sourceHash,
      sourceIdentityKey: scope.sourceIdentityKey,
      sourceTextHash: scope.sourceTextHash,
      sourceTextCharCount: scope.sourceTextCharCount,
      accountLocale: scope.accountLocale,
      targetLanguage: scope.targetLanguage,
      translations,
    };
  } catch {
    return { enabled: false, translations: {} };
  }
}

function writeStoredInlineTranslationSession(scopeKey: string, session: StoredInlineTranslationSession): void {
  if (typeof window === "undefined") return;
  const readyTranslations = filterReadyDocumentInlineTranslationRenderStates(session.translations);
  try {
    window.sessionStorage.setItem(
      `${DOC_INLINE_TRANSLATION_SESSION_PREFIX}:${scopeKey}`,
      JSON.stringify({
        enabled: session.enabled,
        sourceHash: session.sourceHash ?? null,
        sourceIdentityKey: session.sourceIdentityKey ?? null,
        sourceTextHash: session.sourceTextHash ?? null,
        sourceTextCharCount: session.sourceTextCharCount ?? null,
        accountLocale: session.accountLocale ?? null,
        targetLanguage: session.targetLanguage ?? null,
        translations: readyTranslations,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Session persistence is best-effort; the live MicroDeck source remains authoritative.
  }
}

function buildPendingDocumentInlineTranslationState(args: {
  sourceId: string;
  sourceHash: string;
  sourceTextHash: string;
  sourceTextCharCount: number;
  sourceIdentityKey?: string | null;
  latestSourceIdentityKey?: string | null;
  chunkId: string;
  chunkIndex: number;
  laneSessionId?: string | null;
  accountLocale: string;
  targetLanguage: string;
}): InlineTranslationState {
  const sourceKind = "docs";
  const projectionTarget = HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK;
  const sourceIdentityKey = args.sourceIdentityKey ?? buildDocumentTranslationSourceIdentityKey(args);
  return {
    status: "loading",
    observationRef: null,
    receiptRef: null,
    laneSessionId: args.laneSessionId ?? null,
    observationLaneSessionId: null,
    goalBindingId: null,
    latestEventId: null,
    hasObservation: false,
    selectedBackendProvider: null,
    projectionStatus: "missing",
    chunkId: args.chunkId,
    chunkIndex: args.chunkIndex,
    dedupeKey: args.chunkId,
    sourceEventId: null,
    sourceEventMs: null,
    observedAtMs: null,
    freshnessStatus: "pending",
    terminalAuthorityStatus: "not_terminal_authority",
    sourceId: args.sourceId,
    sourceIdentityKey,
    latestSourceIdentityKey: args.latestSourceIdentityKey ?? sourceIdentityKey,
    sourceHash: args.sourceHash,
    sourceKind,
    sourceTextHash: args.sourceTextHash,
    sourceTextCharCount: args.sourceTextCharCount,
    accountLocale: args.accountLocale,
    projectionTarget,
    targetLanguage: args.targetLanguage,
    cancelRequested: false,
    source: "capability_lane",
    answerAuthority: false,
    terminalEligible: false,
    assistantAnswer: false,
    rawContentIncluded: false,
  };
}

function buildDocumentTranslationSourceIdentityKey(args: {
  sourceId: string;
  sourceHash: string;
  sourceTextHash?: string | null;
  sourceTextCharCount?: number | null;
  accountLocale: string;
  targetLanguage: string;
}): string {
  return compactDocumentTranslationIdentityKey([
    args.sourceId,
    args.sourceHash,
    args.sourceTextHash,
    typeof args.sourceTextCharCount === "number" && Number.isFinite(args.sourceTextCharCount)
      ? String(Math.trunc(args.sourceTextCharCount))
      : null,
    "docs",
    HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
    args.accountLocale,
    args.targetLanguage,
  ]);
}

function buildDocumentTranslationSourceBindingKey(args: {
  sourceId: string;
  sourceHash: string;
  accountLocale: string;
  targetLanguage: string;
}): string {
  return compactDocumentTranslationIdentityKey([
    args.sourceId,
    args.sourceHash,
    HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
    args.accountLocale,
    args.targetLanguage,
  ]);
}

function compactDocumentTranslationIdentityKey(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => typeof part === "string" ? part.trim() : "")
    .filter(Boolean)
    .join("::");
}

function clearStoredPrivateResearchInlineTranslationSessions(): void {
  if (typeof window === "undefined") return;
  const privateSessionPrefix =
    `${DOC_INLINE_TRANSLATION_SESSION_PREFIX}:${HELIX_RESEARCH_LIBRARY_DOC_VIEWER_PATH_PREFIX}`;
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(privateSessionPrefix)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Private-session cleanup remains best-effort when storage is unavailable.
  }
}

function rectToVisibleTranslationBbox(
  rect: DOMRect | null | undefined,
  source: string,
): HelixVisibleTranslationRegionBbox | null {
  if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y) || rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const viewportWidth = typeof window === "undefined" ? null : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? null : window.innerHeight;
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    ...(typeof viewportWidth === "number" && Number.isFinite(viewportWidth) ? { viewport_width: viewportWidth } : {}),
    ...(typeof viewportHeight === "number" && Number.isFinite(viewportHeight) ? { viewport_height: viewportHeight } : {}),
    source,
  };
}

function collectVisibleTranslationUnitIds(args: {
  container: HTMLDivElement;
  units: DocumentTranslationUnit[];
  translations: Record<string, InlineTranslationState>;
  inFlightIds: Set<string>;
  sourceHash?: string | null;
  sourceIdentityKey?: string | null;
  maxUnits: number;
  maxChars: number;
}): string[] {
  const translatableUnitsById = new Map(
    args.units.filter((unit) => unit.translatable).map((unit) => [unit.unit_id, unit] as const),
  );
  const containerRect = args.container.getBoundingClientRect();
  const verticalBuffer = Math.max(160, containerRect.height * 0.75);
  const markers = Array.from(
    args.container.querySelectorAll<HTMLElement>("[data-doc-translation-anchor]"),
  );
  const visibleIds: string[] = [];
  let sourceChars = 0;
  const maxUnits = Math.max(1, args.maxUnits);
  const maxChars = Math.max(1, args.maxChars);
  for (const marker of markers) {
    const unitId = marker.dataset.docTranslationAnchor;
    if (!unitId) continue;
    const unit = translatableUnitsById.get(unitId);
    if (!unit) continue;
    const renderStatus = marker.dataset.docTranslationRenderStatus;
    const displayStatus = marker.dataset.docTranslationDisplayStatus;
    const projectionStatus = marker.dataset.docTranslationProjectionStatus;
    const markerSourceHash = marker.dataset.docTranslationSourceHash;
    const markerSourceIdentityKey = marker.dataset.docTranslationSourceIdentityKey;
    const hasDomProjectionState =
      Boolean(renderStatus && renderStatus !== "empty") ||
      Boolean(displayStatus && displayStatus !== "empty") ||
      Boolean(projectionStatus && projectionStatus !== "missing");
    const projectionStateMatchesCurrentSource =
      translationStateMatchesCurrentSource({
        currentSourceHash: args.sourceHash,
        currentSourceIdentityKey: args.sourceIdentityKey,
        stateSourceHash: markerSourceHash,
        stateSourceIdentityKey: markerSourceIdentityKey,
      });
    if (hasDomProjectionState && projectionStateMatchesCurrentSource) continue;
    const existingTranslation = args.translations[unitId];
    const existingTranslationMatchesCurrentSource =
      translationStateMatchesCurrentSource({
        currentSourceHash: args.sourceHash,
        currentSourceIdentityKey: args.sourceIdentityKey,
        stateSourceHash: existingTranslation?.sourceHash,
        stateSourceIdentityKey: existingTranslation?.sourceIdentityKey,
      });
    const inFlightTranslationMatchesCurrentSource =
      args.inFlightIds.has(unitId) &&
      (!existingTranslation || existingTranslationMatchesCurrentSource);
    if ((existingTranslation && existingTranslationMatchesCurrentSource) || inFlightTranslationMatchesCurrentSource) continue;
    const rect = marker.getBoundingClientRect();
    const nearViewport =
      rect.top >= containerRect.top - verticalBuffer &&
      rect.top <= containerRect.bottom + verticalBuffer;
    if (!nearViewport) continue;
    const nextChars = sourceChars + unit.source_markdown.length;
    if (visibleIds.length > 0 && nextChars > maxChars) break;
    visibleIds.push(unitId);
    sourceChars = nextChars;
    if (visibleIds.length >= maxUnits) break;
  }
  return visibleIds;
}

function findActiveInlineTranslationReticleTarget(args: {
  container: HTMLDivElement;
  units: DocumentTranslationUnit[];
  translations: Record<string, InlineTranslationState>;
  inFlightIds: Set<string>;
  sourceHash: string;
  sourceIdentityKey?: string | null;
  maxUnits: number;
  maxChars: number;
}): { element: HTMLElement; unitId: string; status: "candidate" | "loading" } | null {
  const markers = Array.from(
    args.container.querySelectorAll<HTMLElement>("[data-doc-translation-anchor]"),
  );
  const containerRect = args.container.getBoundingClientRect();
  const loadingTargets: Array<{ element: HTMLElement; unitId: string; nearViewport: boolean }> = [];
  for (const marker of markers) {
    const unitId = marker.dataset.docTranslationAnchor;
    if (!unitId || args.translations[unitId]?.status !== "loading") continue;
    const element = findInlineTranslationSourceElementForAnchor(marker);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    loadingTargets.push({
      element,
      unitId,
      nearViewport: rect.bottom >= containerRect.top && rect.top <= containerRect.bottom,
    });
  }
  const selectedLoading = loadingTargets.find((target) => target.nearViewport) ?? loadingTargets[0];
  if (selectedLoading) {
    return { element: selectedLoading.element, unitId: selectedLoading.unitId, status: "loading" };
  }
  const candidateUnitId = collectVisibleTranslationUnitIds({
    container: args.container,
    units: args.units,
    translations: args.translations,
    inFlightIds: args.inFlightIds,
    sourceHash: args.sourceHash,
    sourceIdentityKey: args.sourceIdentityKey,
    maxUnits: args.maxUnits,
    maxChars: args.maxChars,
  })[0];
  if (!candidateUnitId) return null;
  const candidateMarker = markers.find((marker) => marker.dataset.docTranslationAnchor === candidateUnitId);
  const candidateElement = candidateMarker ? findInlineTranslationSourceElementForAnchor(candidateMarker) : null;
  return candidateElement ? { element: candidateElement, unitId: candidateUnitId, status: "candidate" } : null;
}

function findInlineTranslationSourceElementForAnchor(anchor: HTMLElement): HTMLElement | null {
  let element = anchor.previousElementSibling;
  while (element instanceof HTMLElement) {
    if (!element.classList.contains("doc-generated-translation")) return element;
    element = element.previousElementSibling;
  }
  return null;
}

function clearDocTranslationReticleTarget(element: HTMLElement | null): void {
  if (!element) return;
  element.removeAttribute("data-doc-translation-reticle");
  element.removeAttribute("data-doc-translation-reticle-unit-id");
  if (element.getAttribute("data-doc-read-active") !== "true") {
    element.classList.remove(DOC_AUTO_READ_ACTIVE_CLASS);
  }
}

function collectNearViewportTranslationUnitIds(args: {
  container: HTMLDivElement;
  units: DocumentTranslationUnit[];
  maxUnits: number;
  maxChars: number;
}): string[] {
  const translatableUnitsById = new Map(
    args.units.filter((unit) => unit.translatable).map((unit) => [unit.unit_id, unit] as const),
  );
  const containerRect = args.container.getBoundingClientRect();
  const verticalBuffer = Math.max(160, containerRect.height * 0.75);
  const markers = Array.from(
    args.container.querySelectorAll<HTMLElement>("[data-doc-translation-anchor]"),
  );
  const visibleIds: string[] = [];
  let sourceChars = 0;
  const maxUnits = Math.max(1, args.maxUnits);
  const maxChars = Math.max(1, args.maxChars);
  for (const marker of markers) {
    const unitId = marker.dataset.docTranslationAnchor;
    if (!unitId) continue;
    const unit = translatableUnitsById.get(unitId);
    if (!unit) continue;
    const rect = marker.getBoundingClientRect();
    const nearViewport =
      rect.top >= containerRect.top - verticalBuffer &&
      rect.top <= containerRect.bottom + verticalBuffer;
    if (!nearViewport) continue;
    const nextChars = sourceChars + unit.source_markdown.length;
    if (visibleIds.length > 0 && nextChars > maxChars) break;
    visibleIds.push(unitId);
    sourceChars = nextChars;
    if (visibleIds.length >= maxUnits) break;
  }
  return visibleIds;
}

function translationStateMatchesCurrentSource(args: {
  currentSourceHash?: string | null;
  currentSourceIdentityKey?: string | null;
  stateSourceHash?: string | null;
  stateSourceIdentityKey?: string | null;
}): boolean {
  if (
    args.currentSourceIdentityKey &&
    args.stateSourceIdentityKey
  ) {
    return args.stateSourceIdentityKey === args.currentSourceIdentityKey;
  }
  if (!args.currentSourceHash || !args.stateSourceHash) return true;
  return args.stateSourceHash === args.currentSourceHash;
}

export function renderDocumentMarkdownToHtml(markdown: string, docPath?: string | null): string {
  let rendered: string | Promise<string>;
  try {
    activeMarkedDocPath = docPath ?? null;
    rendered = marked.parse(renderMathMarkdown(markdown, docPath));
  } finally {
    activeMarkedDocPath = null;
  }
  const renderedHtml = typeof rendered === "string" ? rendered : String(rendered);
  return renderMathInRenderedHtml(renderedHtml, docPath);
}

export function applyDocNarratorSourceIds(container: ParentNode, docPath?: string | null): number {
  const root =
    container instanceof Element && container.matches("article")
      ? container
      : container.querySelector("article");
  if (!root) return 0;
  const docToken = stableDocNarratorToken(docPath ?? "unknown-doc");
  let applied = 0;
  Array.from(root.querySelectorAll<HTMLElement>(DOC_NARRATOR_BLOCK_SELECTOR)).forEach((element, index) => {
    const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text) return;
    if (element.closest(".doc-math-clickable-display")) return;
    if (!element.getAttribute("data-narrator-source-id")) {
      element.setAttribute(
        "data-narrator-source-id",
        `docs-viewer:${docToken}:${element.tagName.toLowerCase()}:${index}`,
      );
      applied += 1;
    }
  });
  return applied;
}

function stableDocNarratorToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "unknown-doc";
}

function markdownToSpeechText(markdown: string): string {
  if (!markdown) return "";
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*\|/gm, "")
    .replace(/\|/g, " ")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitSpeechChunks(source: string, maxChars: number): string[] {
  const text = source.trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= maxChars) {
      chunks.push(rest.trim());
      break;
    }
    const window = rest.slice(0, maxChars);
    const sentenceBreak = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
    const splitAt = sentenceBreak > 200 ? sentenceBreak + 1 : window.lastIndexOf(" ");
    const index = splitAt > 0 ? splitAt : maxChars;
    const chunk = rest.slice(0, index).trim();
    if (chunk) chunks.push(chunk);
    rest = rest.slice(index).trimStart();
  }
  return chunks;
}

async function playAutoReadAudio(args: {
  blob: Blob;
  signal: AbortSignal;
}): Promise<void> {
  if (args.signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (globalDocReadUrl) {
    URL.revokeObjectURL(globalDocReadUrl);
    globalDocReadUrl = null;
  }
  const url = URL.createObjectURL(args.blob);
  globalDocReadUrl = url;
  const audio = new Audio(url);
  globalDocReadAudio = audio;
  await new Promise<void>((resolve, reject) => {
    const finalize = (error?: unknown) => {
      audio.onended = null;
      audio.onerror = null;
      args.signal.removeEventListener("abort", handleAbort);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const handleAbort = () => {
      audio.pause();
      finalize(new DOMException("Aborted", "AbortError"));
    };
    audio.onended = () => finalize();
    audio.onerror = () => finalize(new Error("audio_playback_failed"));
    args.signal.addEventListener("abort", handleAbort, { once: true });
    void audio.play().catch((error) => finalize(error));
  });
}

function findDocReadTarget(container: HTMLDivElement, chunkText: string): HTMLElement | null {
  const chunk = normalizeDocReadText(chunkText);
  if (!chunk) return null;
  const article = container.querySelector("article") ?? container;
  const blocks = Array.from(
    article.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,p,li,blockquote,td,th,pre"),
  ).filter((element) => normalizeDocReadText(element.textContent ?? "").length > 0);
  if (!blocks.length) return article instanceof HTMLElement ? article : null;

  const directNeedle = chunk.slice(0, Math.min(160, chunk.length));
  const directMatch = blocks.find((element) => normalizeDocReadText(element.textContent ?? "").includes(directNeedle));
  if (directMatch) return directMatch;

  const terms = chunk
    .split(" ")
    .filter((term) => term.length > 3)
    .slice(0, 34);
  let best: { element: HTMLElement; score: number } | null = null;
  for (const element of blocks) {
    const text = normalizeDocReadText(element.textContent ?? "");
    const matches = terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
    const prefixBoost = text && chunk.includes(text.slice(0, Math.min(80, text.length))) ? 8 : 0;
    const score = matches + prefixBoost;
    if (!best || score > best.score) {
      best = { element, score };
    }
  }
  return best && best.score >= Math.max(3, Math.ceil(Math.min(terms.length, 18) * 0.28)) ? best.element : null;
}

function keepDocReadTargetInView(container: HTMLDivElement, target: HTMLElement) {
  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
  if (maxTop <= 0) return;
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const comfortPad = Math.min(180, Math.max(72, containerRect.height * 0.24));
  const alreadyComfortable =
    targetRect.top >= containerRect.top + comfortPad &&
    targetRect.bottom <= containerRect.bottom - comfortPad;
  if (alreadyComfortable) return;
  const targetTop = targetRect.top - containerRect.top + container.scrollTop;
  const centeredTop = targetTop + targetRect.height / 2 - container.clientHeight / 2;
  container.scrollTo({
    top: Math.max(0, Math.min(maxTop, Math.round(centeredTop))),
    behavior: "smooth",
  });
}

function normalizeDocReadText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}

function renderDocMath(expression: string, displayMode: boolean, docPath?: string | null): string {
  if (!expression.trim()) return "";
  try {
    const rendered = renderKatexToString(expression, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });
    const escapedExpression = escapeHtml(expression);
    const className = displayMode
      ? "doc-math-clickable doc-math-clickable-display"
      : "doc-math-clickable doc-math-clickable-inline";
    const equationActionEntry = getDocEquationActionEntryForLatex(docPath, expression);
    const calculatorActions = getDocEquationCalculatorActions(equationActionEntry);
    const theoryActions = getDocEquationTheoryActions(equationActionEntry);
    const genericCalculatorMarkup = calculatorActions.length === 0
      ? '<span class="doc-equation-action-chip" data-doc-calculator-ingest="true" role="button" tabindex="0" title="Open in Scientific Calculator">C</span>'
      : "";
    const registeredActionMarkup = [
      ...calculatorActions.map((action) => ({ action, glyph: "C" })),
      ...theoryActions.map((action) => ({ action, glyph: "T" })),
    ]
      .map(({ action, glyph }) => {
        const title = action.claimBoundaryNote
          ? `${action.label}: ${action.claimBoundaryNote}`
          : action.label;
        return `<span class="doc-equation-action-chip" data-doc-equation-action-id="${escapeHtml(action.actionId)}" role="button" tabindex="0" title="${escapeHtml(title)}">${glyph}</span>`;
      })
      .join("");
    const actionMarkup = `${genericCalculatorMarkup}${registeredActionMarkup}`;
    const equationIdAttr = equationActionEntry
      ? ` data-doc-equation-id="${escapeHtml(equationActionEntry.equationId)}"`
      : "";
    if (displayMode) {
      return `<div class="${className}"${equationIdAttr} data-doc-math-latex="${escapedExpression}" role="button" tabindex="0" title="Open in Scientific Calculator and copy LaTeX">${actionMarkup}${rendered}</div>`;
    }
    return `<span class="${className}"${equationIdAttr} data-doc-math-latex="${escapedExpression}" role="button" tabindex="0" title="Open in Scientific Calculator and copy LaTeX">${rendered}${actionMarkup}</span>`;
  } catch {
    return `<code>${escapeHtml(expression)}</code>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMathMarkdown(markdown: string, docPath?: string | null): string {
  if (!markdown) return markdown;
  const FENCE_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;
  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(markdown)) !== null) {
    output += renderMathInNonCodeMarkdown(markdown.slice(cursor, match.index), docPath);
    output += renderMathFenceBlock(match[0], docPath) ?? match[0];
    cursor = match.index + match[0].length;
  }
  output += renderMathInNonCodeMarkdown(markdown.slice(cursor), docPath);
  return output;
}

function renderMathInNonCodeMarkdown(segment: string, docPath?: string | null): string {
  const INLINE_CODE_RE = /`[^`\n]*`/g;
  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_CODE_RE.exec(segment)) !== null) {
    output += renderMathExpressions(segment.slice(cursor, match.index), docPath);
    output += match[0];
    cursor = match.index + match[0].length;
  }
  output += renderMathExpressions(segment.slice(cursor), docPath);
  return output;
}

function renderMathExpressions(source: string, docPath?: string | null): string {
  return source
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_full, expr: string) => renderDocMath(expr, true, docPath))
    .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_full, expr: string) => renderDocMath(expr, true, docPath))
    .replace(/\\\((.+?)\\\)/g, (_full, expr: string) => renderDocMath(expr, false, docPath));
}

function renderMathFenceBlock(fence: string, docPath?: string | null): string | null {
  const match = fence.match(/^(?:```|~~~)\s*math\s*\r?\n([\s\S]*?)\r?\n(?:```|~~~)\s*$/i);
  if (!match) return null;
  const expr = match[1].trim();
  if (!expr) return "";
  return renderDocMath(expr, true, docPath);
}

function renderMathInRenderedHtml(html: string, docPath?: string | null): string {
  if (!html) return html;
  const CODE_BLOCK_RE = /(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/gi;
  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = CODE_BLOCK_RE.exec(html)) !== null) {
    output += renderMathExpressions(html.slice(cursor, match.index), docPath);
    output += match[0];
    cursor = match.index + match[0].length;
  }
  output += renderMathExpressions(html.slice(cursor), docPath);
  return output;
}

export default DocViewerPanel;
