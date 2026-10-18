import type {
  DocumentTranslationApiResponse,
  DocumentTranslationRequestPayload,
  DocumentTranslationResult,
  DocumentTranslationUnitsApiResponse,
  DocumentTranslationUnitsRequestPayload,
  DocumentTranslationUnitsResult,
  DocumentTranslationUnit,
} from "@shared/document-translation";
import {
  HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
  normalizeHelixLiveTranslationProjectionTarget,
} from "@shared/helix-live-translation-projection-target";
import type { StagePlayMicroReasonerRunV1 } from "@shared/contracts/stage-play-live-source-mail.v1";
import type { HelixAgentRuntimeId } from "@shared/helix-agent-runtime";
import { HELIX_RESEARCH_LIBRARY_PRIVATE_MAILBOX_THREAD_PREFIX } from "@shared/helix-research-library";
import type { HelixLiveTranslationTerminalAuthorityStatus } from "@/lib/helix/live-translation-projection";
import {
  listCapabilityLaneSessions,
  runCapabilityLaneSessionControl,
  type CapabilityLaneSessionListResponse,
  type CapabilityLaneSessionControlResponse,
} from "@/lib/agi/api";

export const DOCUMENT_TRANSLATION_REQUEST_TIMEOUT_MS = 60_000;
export const DOCUMENT_MARKDOWN_TRANSLATION_CONTRACT_VERSION = "target-language-v2";
export const DOCUMENT_MARKDOWN_TRANSLATION_PRESET_ID =
  "stage_play_micro_reasoner_prompt_preset:document-translate-haw-inline:v1";

const readNonEmptyText = (value: string | null | undefined): string | null => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
};

export function resolveDocumentTranslationTargetLanguage(locale: string | null | undefined): string {
  const normalized = readNonEmptyText(locale);
  if (!normalized) return "";
  return normalized.split(/[-_]/)[0]?.trim().toLowerCase() || normalized;
}

type StagePlayDocumentMarkdownMailResponse =
  | {
      ok: true;
      sourceId: string;
      sourceKind: "document_markdown";
      mailboxThreadId?: string;
      mail?: { mailId?: string; sourceId?: string; sourceKind?: string };
      traffic?: {
        sourceHash?: string | null;
        chunkId?: string;
        chunkIndex?: number;
        dedupeKey?: string;
        sourceEventId?: string;
        sourceEventMs?: number;
        laneSessionId?: string | null;
        sessionControlKey?: string | null;
        sourceBindingKey?: string | null;
        sourceIdentityKey?: string | null;
        mailLoopObservationKey?: string | null;
        receiptRef?: string | null;
        projectionTarget?: string;
        targetLanguage?: string;
        accountLocale?: string;
        acceptedUnits?: number;
        deferredUnits?: number;
        acceptedChars?: number;
        maxUnits?: number;
        maxChars?: number;
      };
    }
  | { ok: false; error: string; message?: string };

type StagePlayPresetApplyResponse =
  | {
      ok: true;
      preset?: {
        presetId?: string;
        title?: string;
        sourceIds?: string[];
      };
    }
  | { ok: false; error: string; message?: string };

type StagePlayWakeCycleResponse =
  | { ok: true; cycle?: unknown }
  | { ok: false; error: string; message?: string };

type StagePlayLiveSourceMailRead =
  | {
      ok: true;
      microReasonerRuns?: StagePlayMicroReasonerRunV1[];
      micro_reasoner_runs?: StagePlayMicroReasonerRunV1[];
    }
  | { ok: false; error?: string; message?: string };

export type DocumentMarkdownTranslationLaneSessionControlAction =
  | "start"
  | "pause"
  | "resume"
  | "stop";

export type DocumentMarkdownTranslationLaneSessionControlResponse =
  CapabilityLaneSessionControlResponse;
export type DocumentMarkdownTranslationLaneSessionListResponse =
  CapabilityLaneSessionListResponse;

export type DocumentMarkdownTranslationEntry = {
  unitId: string;
  status: "ready" | "error";
  text?: string;
  error?: string;
  projectionKey?: string | null;
  runId: string;
  role: StagePlayMicroReasonerRunV1["role"];
  observationRef?: string | null;
  receiptRef?: string | null;
  laneSessionId?: string | null;
  observationLaneSessionId?: string | null;
  goalBindingId?: string | null;
  sessionDebugPhase?: string | null;
  sessionObservationStatus?: string | null;
  sessionControlKey?: string | null;
  sourceBindingKey?: string | null;
  latestSourceBindingKey?: string | null;
  sourceIdentityKey?: string | null;
  latestSourceIdentityKey?: string | null;
  laneSessionSourceBindingKey?: string | null;
  laneSessionSourceIdentityKey?: string | null;
  latestObservationKey?: string | null;
  latestMailLoopObservationKey?: string | null;
  goalBindingKey?: string | null;
  latestEventId?: string | null;
  hasObservation?: boolean;
  docPath?: string | null;
  sourceHash?: string | null;
  sourceTextHash?: string | null;
  sourceTextCharCount?: number | null;
  chunkId?: string | null;
  chunkIndex?: number | null;
  dedupeKey?: string | null;
  sourceEventId?: string | null;
  sourceEventMs?: number | null;
  observedAtMs?: number | null;
  projectionStatus?: string | null;
  freshnessStatus?: string | null;
  contextRole: "tool_evidence";
  answerAuthority: false;
  terminalEligible: false;
  assistantAnswer: false;
  rawContentIncluded: false;
  terminalAuthorityStatus?: HelixLiveTranslationTerminalAuthorityStatus;
  selectedRuntimeAgentProvider?: string | null;
  selectedBackendProvider?: string | null;
  sourceId?: string | null;
  source?: "document_microdeck";
  sourceKind?: string | null;
  projectionTarget?: string | null;
  targetLanguage?: string | null;
  accountLocale?: string | null;
  translationContractVersion?: string | null;
};

export async function requestDocumentTranslation(
  payload: DocumentTranslationRequestPayload,
  signal?: AbortSignal,
): Promise<DocumentTranslationResult> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), DOCUMENT_TRANSLATION_REQUEST_TIMEOUT_MS);
  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler, { once: true });
  try {
    const response = await fetch("/api/docs/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as DocumentTranslationApiResponse | null;
    if (!response.ok || !body || !body.ok) {
      const message = body && !body.ok ? body.message : `Document translation failed (${response.status}).`;
      throw new Error(message);
    }
    return body.result;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortHandler);
  }
}

export async function requestDocumentTranslationUnits(
  payload: DocumentTranslationUnitsRequestPayload,
  signal?: AbortSignal,
): Promise<DocumentTranslationUnitsResult> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), DOCUMENT_TRANSLATION_REQUEST_TIMEOUT_MS);
  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler, { once: true });
  try {
    const response = await fetch("/api/docs/translate-units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as DocumentTranslationUnitsApiResponse | null;
    if (!response.ok || !body || !body.ok) {
      const message = body && !body.ok ? body.message : `Document translation failed (${response.status}).`;
      throw new Error(message);
    }
    return body.result;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortHandler);
  }
}

export async function applyDocumentMarkdownMicroDeckPreset(params: {
  sourceId: string;
  presetId?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), DOCUMENT_TRANSLATION_REQUEST_TIMEOUT_MS);
  const abortHandler = () => controller.abort();
  params.signal?.addEventListener("abort", abortHandler, { once: true });
  try {
    const response = await fetch("/api/helix/stage-play/micro-reasoner-prompt-preset/apply", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        presetId: params.presetId ?? DOCUMENT_MARKDOWN_TRANSLATION_PRESET_ID,
        sourceIds: [params.sourceId],
        sourceKind: "document_markdown",
      }),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as StagePlayPresetApplyResponse | null;
    if (!response.ok || !body || !body.ok) {
      const message = body && !body.ok ? body.message ?? body.error : `Document MicroDeck preset apply failed (${response.status}).`;
      throw new Error(message);
    }
  } finally {
    globalThis.clearTimeout(timeout);
    params.signal?.removeEventListener("abort", abortHandler);
  }
}

export async function enqueueDocumentMarkdownTranslationMail(params: {
  docPath: string;
  locale: string;
  targetLanguage?: string | null;
  accountLocale?: string | null;
  sourceHash: string;
  sourceTextHash?: string | null;
  sourceTextCharCount?: number | null;
  title?: string;
  sourceId?: string;
  documentSourceKind?: "canonical_docs" | "research_library";
  documentId?: string | null;
  documentRef?: string | null;
  privateSource?: boolean;
  chunkId?: string;
  chunkIndex?: number | null;
  laneSessionId?: string | null;
  sessionControlKey?: string | null;
  sourceBindingKey?: string | null;
  latestSourceBindingKey?: string | null;
  sourceIdentityKey?: string | null;
  latestSourceIdentityKey?: string | null;
  mailLoopObservationKey?: string | null;
  receiptRef?: string | null;
  projectionTarget?: string | null;
  units: DocumentTranslationUnit[];
  signal?: AbortSignal;
}): Promise<{ sourceId: string; mailId: string | null; mailboxThreadId: string | null }> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), DOCUMENT_TRANSLATION_REQUEST_TIMEOUT_MS);
  const abortHandler = () => controller.abort();
  params.signal?.addEventListener("abort", abortHandler, { once: true });
  try {
    const sourceId = params.sourceId ?? documentMarkdownSourceId(params.docPath);
    const projectionTarget = normalizeHelixLiveTranslationProjectionTarget(
      params.projectionTarget,
      HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
    );
    const accountLocale = readNonEmptyText(params.accountLocale) ?? params.locale;
    const targetLanguage =
      readNonEmptyText(params.targetLanguage) ?? resolveDocumentTranslationTargetLanguage(accountLocale);
    const sourceIdentityKey =
      params.sourceIdentityKey ??
      buildDocumentMarkdownSourceIdentityKey({
        sourceId,
        sourceHash: params.sourceHash,
        sourceTextHash: params.sourceTextHash,
        sourceTextCharCount: params.sourceTextCharCount,
        projectionTarget,
        accountLocale,
        targetLanguage,
      });
    const latestSourceIdentityKey = params.latestSourceIdentityKey ?? sourceIdentityKey;
    const sourceBindingKey =
      params.sourceBindingKey ??
      buildDocumentMarkdownSourceBindingKey({
        sourceId,
        sourceHash: params.sourceHash,
        projectionTarget,
        accountLocale,
        targetLanguage,
      });
    const latestSourceBindingKey = params.latestSourceBindingKey ?? sourceBindingKey;
    if (params.privateSource !== true) {
      await applyDocumentMarkdownMicroDeckPreset({ sourceId, signal: controller.signal });
    }
    const response = await fetch("/api/helix/stage-play/live-source-mail/document-markdown", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        docPath: params.docPath,
        locale: params.locale,
        targetLanguage,
        accountLocale,
        translationContractVersion: DOCUMENT_MARKDOWN_TRANSLATION_CONTRACT_VERSION,
        sourceHash: params.sourceHash,
        sourceTextHash: params.sourceTextHash ?? null,
        sourceTextCharCount: params.sourceTextCharCount ?? null,
        title: params.title,
        sourceId,
        documentSourceKind: params.documentSourceKind ?? "canonical_docs",
        documentId: params.documentId ?? null,
        documentRef: params.documentRef ?? null,
        privateSource: params.privateSource === true,
        chunkId: params.chunkId,
        chunkIndex: params.chunkIndex ?? null,
        laneSessionId: params.laneSessionId ?? null,
        sessionControlKey: params.sessionControlKey ?? null,
        sourceBindingKey,
        latestSourceBindingKey,
        sourceIdentityKey,
        latestSourceIdentityKey,
        mailLoopObservationKey: params.mailLoopObservationKey ?? null,
        receiptRef: params.receiptRef ?? null,
        projectionTarget,
        units: params.units,
      }),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as StagePlayDocumentMarkdownMailResponse | null;
    if (!response.ok || !body || !body.ok) {
      const message = body && !body.ok ? body.message ?? body.error : `Document Markdown mail enqueue failed (${response.status}).`;
      throw new Error(message);
    }
    const mailboxThreadId = readNonEmptyText(body.mailboxThreadId);
    if (
      params.privateSource === true &&
      !mailboxThreadId?.startsWith(HELIX_RESEARCH_LIBRARY_PRIVATE_MAILBOX_THREAD_PREFIX)
    ) {
      throw new Error("Private Research Library translation response did not include a scoped mailbox.");
    }
    await runDocumentMarkdownMicroDeckCycle({
      sourceId,
      threadId: mailboxThreadId ?? undefined,
      signal: controller.signal,
    });
    return {
      sourceId: body.sourceId,
      mailId: body.mail?.mailId ?? null,
      mailboxThreadId,
    };
  } finally {
    globalThis.clearTimeout(timeout);
    params.signal?.removeEventListener("abort", abortHandler);
  }
}

export async function runDocumentMarkdownTranslationLaneSessionControl(params: {
  action: DocumentMarkdownTranslationLaneSessionControlAction;
  docPath: string;
  locale: string;
  sourceHash: string;
  sourceTextHash?: string | null;
  sourceTextCharCount?: number | null;
  sourceBindingKey?: string | null;
  latestSourceBindingKey?: string | null;
  sourceIdentityKey?: string | null;
  latestSourceIdentityKey?: string | null;
  targetLanguage?: string | null;
  accountLocale?: string | null;
  sourceId?: string;
  laneSessionId?: string | null;
  requestedBackendProvider?: string | null;
  projectionTarget?: string | null;
  agentRuntime?: HelixAgentRuntimeId;
  reason?: string | null;
  signal?: AbortSignal;
}): Promise<DocumentMarkdownTranslationLaneSessionControlResponse> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), DOCUMENT_TRANSLATION_REQUEST_TIMEOUT_MS);
  const abortHandler = () => controller.abort();
  params.signal?.addEventListener("abort", abortHandler, { once: true });
  try {
    const sourceId = params.sourceId ?? documentMarkdownSourceId(params.docPath);
    const agentRuntime = params.agentRuntime ?? "helix";
    const projectionTarget = normalizeHelixLiveTranslationProjectionTarget(
      params.projectionTarget,
      HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
    );
    const accountLocale = readNonEmptyText(params.accountLocale) ?? params.locale;
    const targetLanguage =
      readNonEmptyText(params.targetLanguage) ?? resolveDocumentTranslationTargetLanguage(accountLocale);
    const sourceBindingKey =
      params.sourceBindingKey ??
      buildDocumentMarkdownSourceBindingKey({
        sourceId,
        sourceHash: params.sourceHash,
        projectionTarget,
        accountLocale,
        targetLanguage,
      });
    const latestSourceBindingKey = params.latestSourceBindingKey ?? sourceBindingKey;
    const sourceIdentityKey =
      params.sourceIdentityKey ??
      buildDocumentMarkdownSourceIdentityKey({
        sourceId,
        sourceHash: params.sourceHash,
        sourceTextHash: params.sourceTextHash,
        sourceTextCharCount: params.sourceTextCharCount,
        projectionTarget,
        accountLocale,
        targetLanguage,
      });
    const latestSourceIdentityKey = params.latestSourceIdentityKey ?? sourceIdentityKey;
    return await runCapabilityLaneSessionControl({
      agentRuntime,
      capability_lane_session_call: {
        action: params.action,
        lane_id: "live_translation",
        lane_session_id: params.laneSessionId ?? null,
        requested_backend_provider: params.requestedBackendProvider ?? null,
        source_binding_key: sourceBindingKey,
        latest_source_binding_key: latestSourceBindingKey,
        source_identity_key: sourceIdentityKey,
        latest_source_identity_key: latestSourceIdentityKey,
        reason: params.reason ?? `document_inline_translation_${params.action}`,
        context_role: "tool_evidence",
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
        source_binding: {
          source_id: sourceId,
          source_hash: params.sourceHash,
          source_text_hash: params.sourceTextHash ?? null,
          source_text_char_count: params.sourceTextCharCount ?? null,
          source_binding_key: sourceBindingKey,
          latest_source_binding_key: latestSourceBindingKey,
          source_identity_key: sourceIdentityKey,
          latest_source_identity_key: latestSourceIdentityKey,
          source_kind: "docs",
          projection_target: projectionTarget,
          account_locale: accountLocale,
          target_language: targetLanguage,
        },
      },
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
    params.signal?.removeEventListener("abort", abortHandler);
  }
}

export async function listDocumentMarkdownTranslationLaneSessions(params: {
  docPath: string;
  locale: string;
  sourceHash: string;
  sourceTextHash?: string | null;
  sourceTextCharCount?: number | null;
  sourceBindingKey?: string | null;
  latestSourceBindingKey?: string | null;
  sourceIdentityKey?: string | null;
  latestSourceIdentityKey?: string | null;
  targetLanguage?: string | null;
  accountLocale?: string | null;
  sourceId?: string;
  laneSessionId?: string | null;
  projectionTarget?: string | null;
  agentRuntime?: HelixAgentRuntimeId;
  signal?: AbortSignal;
}): Promise<DocumentMarkdownTranslationLaneSessionListResponse> {
  const sourceId = params.sourceId ?? documentMarkdownSourceId(params.docPath);
  const projectionTarget = normalizeHelixLiveTranslationProjectionTarget(
    params.projectionTarget,
    HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
  );
  const accountLocale = readNonEmptyText(params.accountLocale) ?? params.locale;
  const targetLanguage =
    readNonEmptyText(params.targetLanguage) ?? resolveDocumentTranslationTargetLanguage(accountLocale);
  const sourceBindingKey =
    params.sourceBindingKey ??
    buildDocumentMarkdownSourceBindingKey({
      sourceId,
      sourceHash: params.sourceHash,
      projectionTarget,
      accountLocale,
      targetLanguage,
    });
  const sourceIdentityKey =
    params.sourceIdentityKey ??
    buildDocumentMarkdownSourceIdentityKey({
      sourceId,
      sourceHash: params.sourceHash,
      sourceTextHash: params.sourceTextHash,
      sourceTextCharCount: params.sourceTextCharCount,
      projectionTarget,
      accountLocale,
      targetLanguage,
    });
  const latestSourceIdentityKey = params.latestSourceIdentityKey ?? sourceIdentityKey;

  return await listCapabilityLaneSessions({
    agentRuntime: params.agentRuntime ?? "helix",
    laneSessionId: params.laneSessionId ?? undefined,
    laneId: "live_translation",
    sourceId,
    sourceHash: params.sourceHash,
    sourceBindingKey,
    sourceIdentityKey,
    latestSourceIdentityKey,
    projectionTarget,
    accountLocale,
    targetLanguage,
    signal: params.signal,
  });
}

function buildDocumentMarkdownSourceBindingKey(input: {
  sourceId: string;
  sourceHash: string;
  projectionTarget: string;
  accountLocale: string;
  targetLanguage: string;
}): string {
  return [
    input.sourceId,
    input.sourceHash,
    input.projectionTarget,
    input.accountLocale,
    input.targetLanguage,
  ]
    .map((part) => typeof part === "string" ? part.trim() : "")
    .filter(Boolean)
    .join("::");
}

function buildDocumentMarkdownSourceIdentityKey(input: {
  sourceId: string;
  sourceHash: string;
  sourceTextHash?: string | null;
  sourceTextCharCount?: number | null;
  projectionTarget: string;
  accountLocale: string;
  targetLanguage: string;
}): string {
  return [
    input.sourceId,
    input.sourceHash,
    input.sourceTextHash,
    typeof input.sourceTextCharCount === "number" && Number.isFinite(input.sourceTextCharCount)
      ? String(Math.trunc(input.sourceTextCharCount))
      : null,
    "docs",
    input.projectionTarget,
    input.accountLocale,
    input.targetLanguage,
  ]
    .map((part) => typeof part === "string" ? part.trim() : "")
    .filter(Boolean)
    .join("::");
}

export async function runDocumentMarkdownMicroDeckCycle(params: {
  sourceId?: string;
  threadId?: string;
  signal?: AbortSignal;
} = {}): Promise<void> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), DOCUMENT_TRANSLATION_REQUEST_TIMEOUT_MS);
  const abortHandler = () => controller.abort();
  params.signal?.addEventListener("abort", abortHandler, { once: true });
  try {
    const response = await fetch("/api/helix/stage-play/live-source-mail/wake/cycle", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: params.threadId ?? "helix-ask:desktop",
        sourceId: params.sourceId,
        manualRun: true,
        executeHiddenAsk: false,
      }),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as StagePlayWakeCycleResponse | null;
    if (!response.ok || !body || !body.ok) {
      const message = body && !body.ok
        ? body.message ?? body.error
        : `Document MicroDeck wake cycle failed (${response.status}).`;
      throw new Error(message);
    }
  } finally {
    globalThis.clearTimeout(timeout);
    params.signal?.removeEventListener("abort", abortHandler);
  }
}

export async function readDocumentMarkdownMicroDeckRuns(params: {
  sourceId: string;
  threadId?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<StagePlayMicroReasonerRunV1[]> {
  const query = new URLSearchParams({
    threadId: params.threadId ?? "helix-ask:desktop",
    sourceId: params.sourceId,
    sourceKind: "document_markdown",
    view: "full",
    includeConfig: "0",
    limit: String(params.limit ?? 24),
  });
  const response = await fetch(`/api/helix/stage-play/live-source-mail?${query.toString()}`, {
    credentials: "same-origin",
    signal: params.signal,
  });
  const body = (await response.json().catch(() => null)) as StagePlayLiveSourceMailRead | null;
  if (!response.ok || !body || !body.ok) {
    const message = body && !body.ok
      ? body.message ?? body.error ?? "Document Markdown MicroDeck read failed."
      : `Document Markdown MicroDeck read failed (${response.status}).`;
    throw new Error(message);
  }
  return Array.isArray(body.microReasonerRuns)
    ? body.microReasonerRuns
    : Array.isArray(body.micro_reasoner_runs)
      ? body.micro_reasoner_runs
      : [];
}

export function extractDocumentMarkdownTranslationsFromRuns(
  runs: StagePlayMicroReasonerRunV1[],
): DocumentMarkdownTranslationEntry[] {
  const entries = new Map<string, DocumentMarkdownTranslationEntry>();
  for (const run of runs) {
    const parsed = parseDocumentTranslationRunPreview(run.outputPreview);
    if (!parsed) continue;
    const isDocumentProjection =
      parsed.schema === "stage_play_document_inline_translation_output/v1" ||
      parsed.projectionTarget === "docs_viewer_inline" ||
      Array.isArray(parsed.translations);
    if (!isDocumentProjection) continue;
    const translations = Array.isArray(parsed?.translations) ? parsed.translations : [];
    const sourceKind = readFirstString(parsed, ["sourceKind", "source_kind"]) ?? null;
    const docPath = readFirstString(parsed, ["docPath", "doc_path"]) ?? null;
    const sourceHash = readFirstString(parsed, ["sourceHash", "source_hash"]) ?? null;
    const sourceTextHash = readFirstString(parsed, ["sourceTextHash", "source_text_hash"]) ?? null;
    const sourceTextCharCount = readFirstNumber(parsed, ["sourceTextCharCount", "source_text_char_count"]);
    const chunkId = readFirstString(parsed, ["chunkId", "chunk_id"]) ?? null;
    const chunkIndex = readFirstNumber(parsed, ["chunkIndex", "chunk_index"]);
    const dedupeKey = readFirstString(parsed, ["dedupeKey", "dedupe_key"]) ?? null;
    const sourceEventId = readFirstString(parsed, ["sourceEventId", "source_event_id"]) ?? null;
    const sourceEventMs = readFirstNumber(parsed, ["sourceEventMs", "source_event_ms"]);
    const observedAtMs =
      readFirstNumber(parsed, ["observedAtMs", "observed_at_ms"]) ??
      readIsoTimestampMs(readFirstString(parsed, ["createdAt", "created_at"])) ??
      readIsoTimestampMs(run.completedAt) ??
      readIsoTimestampMs(run.startedAt);
    const projectionStatus = readFirstString(parsed, ["projectionStatus", "projection_status"]) ?? null;
    const freshnessStatus = readFirstString(parsed, ["freshnessStatus", "freshness_status"]) ?? null;
    const sourceId = readFirstString(parsed, ["sourceId", "source_id"]) ?? null;
    const selectedRuntimeAgentProvider =
      readFirstString(parsed, ["selectedRuntimeAgentProvider", "selected_runtime_agent_provider"]) ??
      readFirstString(parsed, ["agentRuntime", "agent_runtime"]) ??
      null;
    const selectedBackendProvider =
      readFirstString(parsed, ["selectedBackendProvider", "selected_backend_provider"]) ??
      run.modelUsed ??
      "stage_play_microdeck";
    const projectionKey = readFirstString(parsed, ["projectionKey", "projection_key"]) ?? null;
    const observationRef = readFirstString(parsed, ["observationRef", "observation_ref"]) ?? run.runId;
    const receiptRef = readFirstString(parsed, ["receiptRef", "receipt_ref"]) ?? null;
    const laneSessionId = readFirstString(parsed, ["laneSessionId", "lane_session_id"]) ?? null;
    const observationLaneSessionId =
      readFirstString(parsed, ["observationLaneSessionId", "observation_lane_session_id"]) ?? null;
    const goalBindingId = readFirstString(parsed, ["goalBindingId", "goal_binding_id"]) ?? null;
    const sessionDebugPhase = readFirstString(parsed, ["sessionDebugPhase", "session_debug_phase"]) ?? null;
    const sessionObservationStatus =
      readFirstString(parsed, ["sessionObservationStatus", "session_observation_status"]) ?? null;
    const sessionControlKey =
      readFirstString(parsed, [
        "sessionControlKey",
        "session_control_key",
        "laneSessionControlKey",
        "lane_session_control_key",
      ]) ?? null;
    const sourceBindingKey = readFirstString(parsed, ["sourceBindingKey", "source_binding_key"]) ?? null;
    const latestSourceBindingKey =
      readFirstString(parsed, ["latestSourceBindingKey", "latest_source_binding_key"]) ??
      sourceBindingKey;
    const sourceIdentityKey = readFirstString(parsed, ["sourceIdentityKey", "source_identity_key"]) ?? null;
    const latestSourceIdentityKey =
      readFirstString(parsed, ["latestSourceIdentityKey", "latest_source_identity_key"]) ?? null;
    const laneSessionSourceBindingKey =
      readFirstString(parsed, ["laneSessionSourceBindingKey", "lane_session_source_binding_key"]) ?? null;
    const laneSessionSourceIdentityKey =
      readFirstString(parsed, ["laneSessionSourceIdentityKey", "lane_session_source_identity_key"]) ?? null;
    const latestObservationKey = readFirstString(parsed, ["latestObservationKey", "latest_observation_key"]) ?? null;
    const latestMailLoopObservationKey =
      readFirstString(parsed, ["latestMailLoopObservationKey", "latest_mail_loop_observation_key"]) ?? null;
    const goalBindingKey = readFirstString(parsed, ["goalBindingKey", "goal_binding_key"]) ?? null;
    const latestEventId = readFirstString(parsed, ["latestEventId", "latest_event_id"]) ?? null;
    const hasObservation = readFirstBoolean(parsed, ["hasObservation", "has_observation"]) ??
      Boolean(observationRef);
    const terminalAuthorityStatus = normalizeTerminalAuthorityStatus(
      readFirstString(parsed, ["terminalAuthorityStatus", "terminal_authority_status"]),
    );
    const projectionTarget = normalizeHelixLiveTranslationProjectionTarget(
      readFirstString(parsed, ["projectionTarget", "projection_target"]),
      HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_DOCS_CHUNK,
    );
    const targetLanguage = readFirstString(parsed, ["targetLanguage", "target_language", "locale"]) ?? null;
    const accountLocale = readFirstString(parsed, ["accountLocale", "account_locale", "locale"]) ?? null;
    const translationContractVersion =
      readFirstString(parsed, [
        "translationContractVersion",
        "translation_contract_version",
        "documentTranslationContractVersion",
        "document_translation_contract_version",
      ]) ?? null;
    const projectionMeta = {
      source: "document_microdeck" as const,
      ...(sourceKind ? { sourceKind } : {}),
      ...(docPath ? { docPath } : {}),
      ...(sourceHash ? { sourceHash } : {}),
      ...(sourceTextHash ? { sourceTextHash } : {}),
      ...(typeof sourceTextCharCount === "number" ? { sourceTextCharCount } : {}),
      ...(chunkId ? { chunkId } : {}),
      ...(typeof chunkIndex === "number" ? { chunkIndex } : {}),
      ...(dedupeKey ? { dedupeKey } : {}),
      ...(sourceEventId ? { sourceEventId } : {}),
      ...(typeof sourceEventMs === "number" ? { sourceEventMs } : {}),
      ...(typeof observedAtMs === "number" ? { observedAtMs } : {}),
      ...(projectionStatus ? { projectionStatus } : {}),
      ...(freshnessStatus ? { freshnessStatus } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(selectedRuntimeAgentProvider ? { selectedRuntimeAgentProvider } : {}),
      ...(selectedBackendProvider ? { selectedBackendProvider } : {}),
      ...(projectionKey ? { projectionKey } : {}),
      ...(observationRef ? { observationRef } : {}),
      ...(receiptRef ? { receiptRef } : {}),
      ...(laneSessionId ? { laneSessionId } : {}),
      ...(observationLaneSessionId ? { observationLaneSessionId } : {}),
      ...(goalBindingId ? { goalBindingId } : {}),
      ...(sessionDebugPhase ? { sessionDebugPhase } : {}),
      ...(sessionObservationStatus ? { sessionObservationStatus } : {}),
      ...(sessionControlKey ? { sessionControlKey } : {}),
      ...(sourceBindingKey ? { sourceBindingKey } : {}),
      ...(latestSourceBindingKey ? { latestSourceBindingKey } : {}),
      ...(sourceIdentityKey ? { sourceIdentityKey } : {}),
      ...(latestSourceIdentityKey ? { latestSourceIdentityKey } : {}),
      ...(laneSessionSourceBindingKey ? { laneSessionSourceBindingKey } : {}),
      ...(laneSessionSourceIdentityKey ? { laneSessionSourceIdentityKey } : {}),
      ...(latestObservationKey ? { latestObservationKey } : {}),
      ...(latestMailLoopObservationKey ? { latestMailLoopObservationKey } : {}),
      ...(goalBindingKey ? { goalBindingKey } : {}),
      ...(latestEventId ? { latestEventId } : {}),
      hasObservation,
      contextRole: "tool_evidence" as const,
      answerAuthority: false as const,
      terminalEligible: false as const,
      assistantAnswer: false as const,
      rawContentIncluded: false as const,
      terminalAuthorityStatus,
      ...(projectionTarget ? { projectionTarget } : {}),
      ...(targetLanguage ? { targetLanguage } : {}),
      ...(accountLocale ? { accountLocale } : {}),
      ...(translationContractVersion ? { translationContractVersion } : {}),
    };
    for (const item of translations) {
      const record = readRecord(item);
      const unitId = readFirstString(record, ["unit_id", "unitId", "id"]);
      const text = readFirstString(record, [
        "translated_markdown",
        "translatedMarkdown",
        "translation",
        "text",
      ]);
      if (!unitId || !text) continue;
      const itemProjectionMeta = readDocumentMarkdownUnitProjectionMeta(record);
      entries.set(unitId, {
        unitId,
        status: "ready",
        text,
        runId: run.runId,
        role: run.role,
        ...projectionMeta,
        ...itemProjectionMeta,
      });
    }
    const unitErrors = Array.isArray(parsed.unit_errors)
      ? parsed.unit_errors
      : Array.isArray(parsed.unitErrors)
        ? parsed.unitErrors
        : [];
    const baselineOnlyUnavailable =
      run.status === "completed" &&
      (run.deckExecutionMode === "baseline_fallback" || run.deckProductRole !== true) &&
      unitErrors.length > 0 &&
      unitErrors.every((entry) => {
        const record = readRecord(entry);
        return readFirstString(record, ["reason", "error", "message"]) === "document_translation_model_output_unavailable";
      });
    if (baselineOnlyUnavailable) continue;
    for (const item of unitErrors) {
      const record = readRecord(item);
      const unitId = readFirstString(record, ["unit_id", "unitId", "id"]);
      const reason = readFirstString(record, ["reason", "error", "message"]) ?? "translation_unavailable";
      if (!unitId || entries.get(unitId)?.status === "ready") continue;
      entries.set(unitId, {
        unitId,
        status: "error",
        error: reason,
        runId: run.runId,
        role: run.role,
        ...projectionMeta,
        ...readDocumentMarkdownUnitProjectionMeta(record),
      });
    }
  }
  return Array.from(entries.values());
}

export function documentMarkdownSourceId(docPath: string): string {
  return `document_markdown:${docPath}`;
}

function parseDocumentTranslationRunPreview(preview: string | null | undefined): Record<string, unknown> | null {
  const trimmed = preview?.trim();
  if (!trimmed) return null;
  const candidates = [trimmed];
  const fencedJson = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fencedJson) candidates.push(fencedJson);
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      return readRecord(JSON.parse(candidate));
    } catch {
      // Overview previews can be clipped or can contain non-JSON run notes.
    }
  }
  return null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readFirstString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function readFirstNumber(record: Record<string, unknown> | null, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function readFirstBoolean(record: Record<string, unknown> | null, keys: string[]): boolean | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function readDocumentMarkdownUnitProjectionMeta(
  record: Record<string, unknown> | null,
): Partial<DocumentMarkdownTranslationEntry> {
  const projectionKey = readFirstString(record, ["projectionKey", "projection_key"]);
  const observationRef = readFirstString(record, ["observationRef", "observation_ref"]);
  const receiptRef = readFirstString(record, ["receiptRef", "receipt_ref"]);
  const laneSessionId = readFirstString(record, ["laneSessionId", "lane_session_id"]);
  const observationLaneSessionId =
    readFirstString(record, ["observationLaneSessionId", "observation_lane_session_id"]);
  const goalBindingId = readFirstString(record, ["goalBindingId", "goal_binding_id"]);
  const sessionDebugPhase = readFirstString(record, ["sessionDebugPhase", "session_debug_phase"]);
  const sessionObservationStatus = readFirstString(record, [
    "sessionObservationStatus",
    "session_observation_status",
  ]);
  const sessionControlKey =
    readFirstString(record, [
      "sessionControlKey",
      "session_control_key",
      "laneSessionControlKey",
      "lane_session_control_key",
    ]);
  const sourceBindingKey = readFirstString(record, ["sourceBindingKey", "source_binding_key"]);
  const latestSourceBindingKey =
    readFirstString(record, ["latestSourceBindingKey", "latest_source_binding_key"]) ??
    sourceBindingKey;
  const sourceIdentityKey = readFirstString(record, ["sourceIdentityKey", "source_identity_key"]);
  const latestSourceIdentityKey =
    readFirstString(record, ["latestSourceIdentityKey", "latest_source_identity_key"]);
  const laneSessionSourceBindingKey =
    readFirstString(record, ["laneSessionSourceBindingKey", "lane_session_source_binding_key"]);
  const laneSessionSourceIdentityKey =
    readFirstString(record, ["laneSessionSourceIdentityKey", "lane_session_source_identity_key"]);
  const latestObservationKey = readFirstString(record, ["latestObservationKey", "latest_observation_key"]);
  const latestMailLoopObservationKey =
    readFirstString(record, ["latestMailLoopObservationKey", "latest_mail_loop_observation_key"]);
  const goalBindingKey = readFirstString(record, ["goalBindingKey", "goal_binding_key"]);
  const latestEventId = readFirstString(record, ["latestEventId", "latest_event_id"]);
  const sourceHash = readFirstString(record, ["sourceHash", "source_hash"]);
  const sourceTextHash = readFirstString(record, ["sourceTextHash", "source_text_hash"]);
  const sourceTextCharCount = readFirstNumber(record, ["sourceTextCharCount", "source_text_char_count"]);
  const chunkId = readFirstString(record, ["chunkId", "chunk_id"]);
  const chunkIndex = readFirstNumber(record, ["chunkIndex", "chunk_index"]);
  const dedupeKey = readFirstString(record, ["dedupeKey", "dedupe_key"]);
  const sourceEventId = readFirstString(record, ["sourceEventId", "source_event_id"]);
  const sourceEventMs = readFirstNumber(record, ["sourceEventMs", "source_event_ms"]);
  const observedAtMs =
    readFirstNumber(record, ["observedAtMs", "observed_at_ms"]) ??
    readIsoTimestampMs(readFirstString(record, ["createdAt", "created_at"]));
  const projectionStatus = readFirstString(record, ["projectionStatus", "projection_status"]);
  const freshnessStatus = readFirstString(record, ["freshnessStatus", "freshness_status"]);
  const selectedRuntimeAgentProvider = readFirstString(record, [
    "selectedRuntimeAgentProvider",
    "selected_runtime_agent_provider",
    "agentRuntime",
    "agent_runtime",
  ]);
  const terminalAuthorityStatus = readFirstString(record, [
    "terminalAuthorityStatus",
    "terminal_authority_status",
  ]);
  const hasObservation = readFirstBoolean(record, ["hasObservation", "has_observation"]);

  return {
    ...(projectionKey ? { projectionKey } : {}),
    ...(observationRef ? { observationRef } : {}),
    ...(receiptRef ? { receiptRef } : {}),
    ...(laneSessionId ? { laneSessionId } : {}),
    ...(observationLaneSessionId ? { observationLaneSessionId } : {}),
    ...(goalBindingId ? { goalBindingId } : {}),
    ...(sessionDebugPhase ? { sessionDebugPhase } : {}),
    ...(sessionObservationStatus ? { sessionObservationStatus } : {}),
    ...(sessionControlKey ? { sessionControlKey } : {}),
    ...(sourceBindingKey ? { sourceBindingKey } : {}),
    ...(latestSourceBindingKey ? { latestSourceBindingKey } : {}),
    ...(sourceIdentityKey ? { sourceIdentityKey } : {}),
    ...(latestSourceIdentityKey ? { latestSourceIdentityKey } : {}),
    ...(laneSessionSourceBindingKey ? { laneSessionSourceBindingKey } : {}),
    ...(laneSessionSourceIdentityKey ? { laneSessionSourceIdentityKey } : {}),
    ...(latestObservationKey ? { latestObservationKey } : {}),
    ...(latestMailLoopObservationKey ? { latestMailLoopObservationKey } : {}),
    ...(goalBindingKey ? { goalBindingKey } : {}),
    ...(latestEventId ? { latestEventId } : {}),
    ...(sourceHash ? { sourceHash } : {}),
    ...(sourceTextHash ? { sourceTextHash } : {}),
    ...(typeof sourceTextCharCount === "number" ? { sourceTextCharCount } : {}),
    ...(chunkId ? { chunkId } : {}),
    ...(typeof chunkIndex === "number" ? { chunkIndex } : {}),
    ...(dedupeKey ? { dedupeKey } : {}),
    ...(sourceEventId ? { sourceEventId } : {}),
    ...(typeof sourceEventMs === "number" ? { sourceEventMs } : {}),
    ...(typeof observedAtMs === "number" ? { observedAtMs } : {}),
    ...(projectionStatus ? { projectionStatus } : {}),
    ...(freshnessStatus ? { freshnessStatus } : {}),
    ...(selectedRuntimeAgentProvider ? { selectedRuntimeAgentProvider } : {}),
    ...(terminalAuthorityStatus ? { terminalAuthorityStatus: normalizeTerminalAuthorityStatus(terminalAuthorityStatus) } : {}),
    ...(typeof hasObservation === "boolean" ? { hasObservation } : {}),
  };
}

function normalizeTerminalAuthorityStatus(
  value: string | null,
): HelixLiveTranslationTerminalAuthorityStatus {
  return value === "pending_helix_terminal_authority" ||
    value === "terminal_authority_rejected" ||
    value === "not_terminal_authority"
    ? value
    : "not_terminal_authority";
}

function readIsoTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
