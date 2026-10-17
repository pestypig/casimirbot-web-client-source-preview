import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DocRuntimeCalculatorLaunchV1 } from "@shared/contracts/doc-calculator-launch.v1";
import type { TheoryRuntimeJobSnapshotV1 } from "@shared/contracts/theory-runtime-job.v1";
import type { TheoryRuntimeReceiptV1 } from "@shared/contracts/theory-runtime-receipt.v1";
import {
  buildTheoryRuntimeContextObservationV1,
  type TheoryRuntimeContextObservationV1,
} from "@shared/contracts/theory-runtime-context.v1";

export type TheoryRuntimeJobRecord = {
  snapshot: TheoryRuntimeJobSnapshotV1;
  receipt: TheoryRuntimeReceiptV1 | null;
};

type TheoryRuntimeJobState = {
  selectedSetup: DocRuntimeCalculatorLaunchV1["runtime"] | null;
  selectedSource: DocRuntimeCalculatorLaunchV1["source"] | null;
  selectedRequestId: string | null;
  recentRequestIds: string[];
  jobsByRequestId: Record<string, TheoryRuntimeJobRecord>;
  activeContext: TheoryRuntimeContextObservationV1 | null;
  loadRuntimeLaunch: (launch: DocRuntimeCalculatorLaunchV1) => void;
  upsertJob: (snapshot: TheoryRuntimeJobSnapshotV1) => void;
  attachReceipt: (requestId: string, receipt: TheoryRuntimeReceiptV1) => void;
  selectRequest: (requestId: string) => void;
  bindSelectedResultAsContext: () => TheoryRuntimeContextObservationV1 | null;
  clearActiveContext: () => void;
};

const MAX_RECENT_JOBS = 20;

function cappedJobs(
  jobsByRequestId: Record<string, TheoryRuntimeJobRecord>,
  recentRequestIds: string[],
): Record<string, TheoryRuntimeJobRecord> {
  const keep = new Set(recentRequestIds.slice(0, MAX_RECENT_JOBS));
  return Object.fromEntries(Object.entries(jobsByRequestId).filter(([requestId]) => keep.has(requestId)));
}

export const useTheoryRuntimeJobStore = create<TheoryRuntimeJobState>()(
  persist(
    (set, get) => ({
      selectedSetup: null,
      selectedSource: null,
      selectedRequestId: null,
      recentRequestIds: [],
      jobsByRequestId: {},
      activeContext: null,
      loadRuntimeLaunch: (launch) => set({
        selectedSetup: launch.runtime,
        selectedSource: launch.source,
        selectedRequestId: null,
      }),
      upsertJob: (snapshot) => set((state) => {
        const recentRequestIds = [snapshot.jobId, ...state.recentRequestIds.filter((id) => id !== snapshot.jobId)]
          .slice(0, MAX_RECENT_JOBS);
        const jobsByRequestId = {
          ...state.jobsByRequestId,
          [snapshot.jobId]: {
            snapshot,
            receipt: state.jobsByRequestId[snapshot.jobId]?.receipt ?? null,
          },
        };
        return {
          selectedRequestId: snapshot.jobId,
          recentRequestIds,
          jobsByRequestId: cappedJobs(jobsByRequestId, recentRequestIds),
        };
      }),
      attachReceipt: (requestId, receipt) => set((state) => {
        const current = state.jobsByRequestId[requestId];
        if (!current) return state;
        return {
          jobsByRequestId: {
            ...state.jobsByRequestId,
            [requestId]: { ...current, receipt },
          },
        };
      }),
      selectRequest: (requestId) => set((state) => ({
        selectedRequestId: state.jobsByRequestId[requestId] ? requestId : state.selectedRequestId,
      })),
      bindSelectedResultAsContext: () => {
        const state = get();
        const selected = state.selectedRequestId ? state.jobsByRequestId[state.selectedRequestId] : null;
        if (!state.selectedRequestId || !selected?.receipt) return null;
        const context = buildTheoryRuntimeContextObservationV1({
          requestId: state.selectedRequestId,
          receipt: selected.receipt,
        });
        set({ activeContext: context });
        return context;
      },
      clearActiveContext: () => set({ activeContext: null }),
    }),
    {
      name: "theory-runtime-jobs:v1",
      partialize: (state) => ({
        selectedSetup: state.selectedSetup,
        selectedSource: state.selectedSource,
        selectedRequestId: state.selectedRequestId,
        recentRequestIds: state.recentRequestIds,
        jobsByRequestId: cappedJobs(state.jobsByRequestId, state.recentRequestIds),
        activeContext: state.activeContext,
      }),
    },
  ),
);
