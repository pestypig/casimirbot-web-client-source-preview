import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { ScientificEvidenceWorkflowStatus } from "@/components/helix/ask-console/ScientificEvidenceWorkflowStatus";

export type { ScientificEvidenceWorkflowStatus } from "@/components/helix/ask-console/ScientificEvidenceWorkflowStatus";

const SCIENTIFIC_EVIDENCE_WORKFLOW_STORAGE_KEY = "helix:scientific-evidence-workflow-status:v1";
const MAX_WORKFLOW_STATUSES = 12;
const MAX_REF_COUNT = 24;
const MAX_REF_CHARS = 1_024;
const MAX_LATEX_CHARS = 2_000;

type WorkflowStatusKeyInput = {
  status: ScientificEvidenceWorkflowStatus;
  sessionId?: string | null;
  askThreadId?: string | null;
  accountId?: string | null;
};

type ScientificEvidenceWorkflowState = {
  statuses: Record<string, ScientificEvidenceWorkflowStatus>;
  activeKey: string | null;
  upsertStatus: (
    status: ScientificEvidenceWorkflowStatus,
    scope?: { sessionId?: string | null; askThreadId?: string | null; accountId?: string | null },
  ) => string;
  mergeStatus: (
    status: ScientificEvidenceWorkflowStatus,
    scope?: { sessionId?: string | null; askThreadId?: string | null; accountId?: string | null },
  ) => string;
  readActiveStatus: () => ScientificEvidenceWorkflowStatus | null;
  clear: () => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const compactEvidenceRef = (value: unknown): string | null => {
  const normalized = readString(value);
  if (!normalized) return null;
  // Display payloads belong in the in-memory Image Lens source, not in the
  // compact workflow ledger persisted by Zustand.
  if (/^(?:data:image\/|blob:)/i.test(normalized)) return null;
  return normalized.length <= MAX_REF_CHARS ? normalized : null;
};

const unique = (...groups: Array<Array<string | null | undefined> | undefined>): string[] =>
  Array.from(new Set(groups.flatMap((group) => group ?? []).map((value) => compactEvidenceRef(value)).filter(Boolean) as string[])).slice(0, MAX_REF_COUNT);

const truncateLatex = (value: string | null): string | null => {
  if (!value) return null;
  return value.length <= MAX_LATEX_CHARS
    ? value
    : `${value.slice(0, MAX_LATEX_CHARS - 38)}...[truncated saved equation text]`;
};

const evidenceDepthRank: Record<ScientificEvidenceWorkflowStatus["evidenceDepth"], number> = {
  missing: 0,
  page_loaded: 1,
  page_image_observation: 2,
  page_image_ocr_math_candidate: 3,
  exact_row_partial: 4,
  exact_block_partial: 5,
  exact_row_promoted: 6,
  exact_block_promoted: 7,
};

const promotedRowRank: Record<ScientificEvidenceWorkflowStatus["promotedRowState"], number> = {
  missing: 0,
  rejected: 1,
  partial: 2,
  promoted: 3,
};

const calculatorRank: Record<ScientificEvidenceWorkflowStatus["calculatorTemplateStatus"], number> = {
  missing: 0,
  template_only: 1,
  template_admissible: 2,
  calculation_ready: 3,
};

const graphRank: Record<ScientificEvidenceWorkflowStatus["graphReflectionStatus"], number> = {
  missing: 0,
  diagnostic_reflected: 1,
};

function chooseByRank<T extends string>(left: T, right: T, rank: Record<T, number>): T {
  return (rank[right] ?? 0) > (rank[left] ?? 0) ? right : left;
}

function normalizeStatus(status: ScientificEvidenceWorkflowStatus): ScientificEvidenceWorkflowStatus {
  return {
    ...status,
    sourceId: compactEvidenceRef(status.sourceId),
    sourceKind: compactEvidenceRef(status.sourceKind),
    sourceImageHash: compactEvidenceRef(status.sourceImageHash),
    cropRef: compactEvidenceRef(status.cropRef),
    cropRegionRef: compactEvidenceRef(status.cropRegionRef),
    sidecarId: compactEvidenceRef(status.sidecarId),
    promotedEquationLatex: truncateLatex(status.promotedEquationLatex),
    postulateReadyRefs: {
      evidenceSidecarRefs: unique(status.postulateReadyRefs.evidenceSidecarRefs),
      promotedEquationRowRefs: unique(status.postulateReadyRefs.promotedEquationRowRefs),
      pageRenderRefs: unique(status.postulateReadyRefs.pageRenderRefs),
      cropRefs: unique(status.postulateReadyRefs.cropRefs),
      graphReflectionRefs: unique(status.postulateReadyRefs.graphReflectionRefs),
      provenanceAuditRefs: unique(status.postulateReadyRefs.provenanceAuditRefs),
      calculatorCheckRefs: unique(status.postulateReadyRefs.calculatorCheckRefs),
      uncertaintyReductionRefs: unique(status.postulateReadyRefs.uncertaintyReductionRefs),
    },
    activeBlockers: unique(status.activeBlockers),
    historicalBlockers: unique(status.historicalBlockers),
  };
}

function mergeWorkflowStatus(
  existing: ScientificEvidenceWorkflowStatus | null | undefined,
  incoming: ScientificEvidenceWorkflowStatus,
): ScientificEvidenceWorkflowStatus {
  if (!existing) return normalizeStatus(incoming);
  const incomingDepthRank = evidenceDepthRank[incoming.evidenceDepth] ?? 0;
  const existingDepthRank = evidenceDepthRank[existing.evidenceDepth] ?? 0;
  const incomingRowRank = promotedRowRank[incoming.promotedRowState] ?? 0;
  const existingRowRank = promotedRowRank[existing.promotedRowState] ?? 0;
  const incomingIsAtLeastAsStrong = incomingDepthRank > existingDepthRank ||
    (incomingDepthRank === existingDepthRank && incomingRowRank >= existingRowRank);
  const evidenceSource = incomingIsAtLeastAsStrong ? incoming : existing;
  const merged: ScientificEvidenceWorkflowStatus = {
    ...existing,
    pageLoaded: existing.pageLoaded || incoming.pageLoaded,
    sourceId: evidenceSource.sourceId ?? incoming.sourceId ?? existing.sourceId,
    sourceKind: evidenceSource.sourceKind ?? incoming.sourceKind ?? existing.sourceKind,
    sourceImageHash: evidenceSource.sourceImageHash ?? incoming.sourceImageHash ?? existing.sourceImageHash,
    pageNumber: evidenceSource.pageNumber ?? incoming.pageNumber ?? existing.pageNumber,
    pageCount: evidenceSource.pageCount ?? incoming.pageCount ?? existing.pageCount,
    cropRef: evidenceSource.cropRef ?? incoming.cropRef ?? existing.cropRef,
    cropRegionRef: evidenceSource.cropRegionRef ?? incoming.cropRegionRef ?? existing.cropRegionRef,
    sidecarId: evidenceSource.sidecarId ?? incoming.sidecarId ?? existing.sidecarId,
    evidenceDepth: chooseByRank(existing.evidenceDepth, incoming.evidenceDepth, evidenceDepthRank),
    promotedRowState: chooseByRank(existing.promotedRowState, incoming.promotedRowState, promotedRowRank),
    promotedEquationLatex: evidenceSource.promotedEquationLatex ?? incoming.promotedEquationLatex ?? existing.promotedEquationLatex,
    graphReflectionStatus: chooseByRank(existing.graphReflectionStatus, incoming.graphReflectionStatus, graphRank),
    calculatorTemplateStatus: chooseByRank(existing.calculatorTemplateStatus, incoming.calculatorTemplateStatus, calculatorRank),
    postulateReadyRefs: {
      evidenceSidecarRefs: unique(existing.postulateReadyRefs.evidenceSidecarRefs, incoming.postulateReadyRefs.evidenceSidecarRefs),
      promotedEquationRowRefs: unique(existing.postulateReadyRefs.promotedEquationRowRefs, incoming.postulateReadyRefs.promotedEquationRowRefs),
      pageRenderRefs: unique(existing.postulateReadyRefs.pageRenderRefs, incoming.postulateReadyRefs.pageRenderRefs),
      cropRefs: unique(existing.postulateReadyRefs.cropRefs, incoming.postulateReadyRefs.cropRefs),
      graphReflectionRefs: unique(existing.postulateReadyRefs.graphReflectionRefs, incoming.postulateReadyRefs.graphReflectionRefs),
      provenanceAuditRefs: unique(existing.postulateReadyRefs.provenanceAuditRefs, incoming.postulateReadyRefs.provenanceAuditRefs),
      calculatorCheckRefs: unique(existing.postulateReadyRefs.calculatorCheckRefs, incoming.postulateReadyRefs.calculatorCheckRefs),
      uncertaintyReductionRefs: unique(existing.postulateReadyRefs.uncertaintyReductionRefs, incoming.postulateReadyRefs.uncertaintyReductionRefs),
    },
    activeBlockers: incomingIsAtLeastAsStrong ? unique(incoming.activeBlockers) : unique(existing.activeBlockers),
    historicalBlockers: unique(
      existing.historicalBlockers,
      incoming.historicalBlockers,
      existing.activeBlockers,
      incomingIsAtLeastAsStrong ? [] : incoming.activeBlockers,
    ),
    claimBoundary: "observation_only_not_proof",
  };
  if (merged.sidecarId && !merged.postulateReadyRefs.evidenceSidecarRefs.includes(merged.sidecarId)) {
    merged.postulateReadyRefs.evidenceSidecarRefs = unique([merged.sidecarId], merged.postulateReadyRefs.evidenceSidecarRefs);
  }
  if (merged.cropRef && !merged.postulateReadyRefs.cropRefs.includes(merged.cropRef)) {
    merged.postulateReadyRefs.cropRefs = unique([merged.cropRef], merged.postulateReadyRefs.cropRefs);
  }
  if (merged.sourceId && !merged.postulateReadyRefs.pageRenderRefs.includes(merged.sourceId)) {
    merged.postulateReadyRefs.pageRenderRefs = unique([merged.sourceId], merged.postulateReadyRefs.pageRenderRefs);
  }
  return normalizeStatus(merged);
}

export function mergeScientificEvidenceWorkflowStatusRecords(
  existing: ScientificEvidenceWorkflowStatus | null | undefined,
  incoming: ScientificEvidenceWorkflowStatus,
): ScientificEvidenceWorkflowStatus {
  return mergeWorkflowStatus(existing, incoming);
}

export function readActiveScientificEvidenceWorkflowStatus(): ScientificEvidenceWorkflowStatus | null {
  return useScientificEvidenceWorkflowStore.getState().readActiveStatus();
}

function isScientificEvidenceWorkflowStatus(value: unknown): value is ScientificEvidenceWorkflowStatus {
  return isRecord(value) && value.schema === "helix.scientific_evidence_workflow_status.v1";
}

export function collectScientificEvidenceWorkflowStatusesFromPayload(payload: unknown): ScientificEvidenceWorkflowStatus[] {
  const statuses: ScientificEvidenceWorkflowStatus[] = [];
  const seen = new WeakSet<object>();

  const visit = (value: unknown, depth = 0): void => {
    if (depth > 8 || value === null || value === undefined) return;
    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (isScientificEvidenceWorkflowStatus(value)) {
      statuses.push(value);
      return;
    }

    if (Array.isArray(value)) {
      value.slice(0, 160).forEach((entry) => visit(entry, depth + 1));
      return;
    }

    Object.values(value as Record<string, unknown>).slice(0, 180).forEach((entry) => visit(entry, depth + 1));
  };

  visit(payload);
  return statuses;
}

export function ingestScientificEvidenceWorkflowStatusFromAskPayload(
  payload: unknown,
  scope?: { sessionId?: string | null; askThreadId?: string | null; accountId?: string | null },
): ScientificEvidenceWorkflowStatus[] {
  const statuses = collectScientificEvidenceWorkflowStatusesFromPayload(payload);
  statuses.forEach((status) => mergeScientificEvidenceWorkflowStatus(status, scope));
  return statuses;
}

function workflowStatusKey(input: WorkflowStatusKeyInput): string {
  const sourceKey =
    input.status.sourceId ??
    input.status.sourceImageHash ??
    input.status.sidecarId ??
    input.askThreadId ??
    input.sessionId ??
    "default";
  const page = input.status.pageNumber ? `:page:${input.status.pageNumber}` : "";
  const account = input.accountId ? `account:${input.accountId}:` : "";
  const thread = input.askThreadId ? `thread:${input.askThreadId}:` : "";
  return `${account}${thread}scientific:${sourceKey}${page}`;
}

function clampPersistedStatuses(statuses: Record<string, ScientificEvidenceWorkflowStatus>, activeKey: string | null) {
  const entries = Object.entries(statuses);
  const ranked = entries.sort(([leftKey, left], [rightKey, right]) => {
    if (leftKey === activeKey) return -1;
    if (rightKey === activeKey) return 1;
    return (evidenceDepthRank[right.evidenceDepth] ?? 0) - (evidenceDepthRank[left.evidenceDepth] ?? 0);
  });
  return Object.fromEntries(ranked.slice(0, MAX_WORKFLOW_STATUSES));
}

const quotaSafeLocalStorage: StateStorage = {
  getItem: (name) => window.localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Persistence is a recovery aid. A quota failure must never abort the
      // active Ask turn or discard its authoritative in-memory workflow state.
      try {
        window.localStorage.removeItem(name);
        window.localStorage.setItem(name, value);
      } catch {
        // Keep the current in-memory state when the browser remains full.
      }
    }
  },
  removeItem: (name) => window.localStorage.removeItem(name),
};

export const useScientificEvidenceWorkflowStore = create<ScientificEvidenceWorkflowState>()(
  persist(
    (set, get) => ({
      statuses: {},
      activeKey: null,
      upsertStatus: (status, scope) => {
        const normalized = normalizeStatus(status);
        const key = workflowStatusKey({ status: normalized, ...scope });
        set((state) => {
          const statuses = {
            ...state.statuses,
            [key]: normalized,
          };
          return {
            statuses: clampPersistedStatuses(statuses, key),
            activeKey: key,
          };
        });
        return key;
      },
      mergeStatus: (status, scope) => {
        const normalized = normalizeStatus(status);
        const key = workflowStatusKey({ status: normalized, ...scope });
        set((state) => {
          const merged = mergeWorkflowStatus(state.statuses[key], normalized);
          const statuses = {
            ...state.statuses,
            [key]: merged,
          };
          return {
            statuses: clampPersistedStatuses(statuses, key),
            activeKey: key,
          };
        });
        return key;
      },
      readActiveStatus: () => {
        const state = get();
        return state.activeKey ? state.statuses[state.activeKey] ?? null : null;
      },
      clear: () => set({ statuses: {}, activeKey: null }),
    }),
    {
      name: SCIENTIFIC_EVIDENCE_WORKFLOW_STORAGE_KEY,
      storage: createJSONStorage(() => quotaSafeLocalStorage),
      partialize: (state) => ({
        statuses: clampPersistedStatuses(state.statuses, state.activeKey),
        activeKey: state.activeKey,
      }),
    },
  ),
);

export function mergeScientificEvidenceWorkflowStatus(
  status: ScientificEvidenceWorkflowStatus,
  scope?: { sessionId?: string | null; askThreadId?: string | null; accountId?: string | null },
): string {
  return useScientificEvidenceWorkflowStore.getState().mergeStatus(status, scope);
}
