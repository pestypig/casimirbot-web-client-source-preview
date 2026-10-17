import { create } from "zustand";
import type { ResonanceBundle, ResonanceCollapse } from "@shared/code-lattice";

type ResonancePayload = {
  bundle?: ResonanceBundle | null;
  selection?: ResonanceCollapse | null;
  latticeVersion?: number | null;
  traceId?: string | null;
};

type ResonanceState = {
  bundle: ResonanceBundle | null;
  selection: ResonanceCollapse | null;
  latticeVersion: number | null;
  traceId: string | null;
  updatedAt: string | null;
  setResonancePayload: (payload: ResonancePayload) => void;
  clearResonance: () => void;
};

const hasKey = <T extends object>(payload: T, key: keyof T): boolean => Object.prototype.hasOwnProperty.call(payload, key);

export const useResonanceStore = create<ResonanceState>((set) => ({
  bundle: null,
  selection: null,
  latticeVersion: null,
  traceId: null,
  updatedAt: null,
  setResonancePayload: (payload) =>
    set((state) => {
      const next: Partial<ResonanceState> = {};
      if (hasKey(payload, "bundle")) {
        next.bundle = payload.bundle ?? null;
      }
      if (hasKey(payload, "selection")) {
        next.selection = payload.selection ?? null;
      }
      if (hasKey(payload, "latticeVersion")) {
        next.latticeVersion = payload.latticeVersion ?? null;
      }
      if (hasKey(payload, "traceId")) {
        next.traceId = payload.traceId ?? null;
      }
      if (Object.keys(next).length > 0) {
        next.updatedAt = new Date().toISOString();
      }
      return { ...state, ...next };
    }),
  clearResonance: () =>
    set({
      bundle: null,
      selection: null,
      latticeVersion: null,
      traceId: null,
      updatedAt: null,
    }),
}));
