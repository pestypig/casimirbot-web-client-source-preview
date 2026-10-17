import { create } from "zustand";
import type { LocalRestQuery, LocalRestSnapshot } from "@shared/stellar";
import { fetchLocalRest, packStarsToBuffers, subscribeLocalRestStream } from "@/lib/stellar/localRest";

type State = {
  params: LocalRestQuery;
  loading: boolean;
  snapshot?: LocalRestSnapshot;
  pos?: Float32Array;
  vel?: Float32Array;
  col?: Float32Array;
  count: number;
  error?: string;
  unsubscribe?: () => void;
};

type Actions = {
  setParams: (p: Partial<LocalRestQuery>) => void;
  load: () => Promise<void>;
  stream: () => void;
  stop: () => void;
};

const defaultParams: LocalRestQuery = {
  radius_pc: 50,
  with_oort: false,
};

export const useLocalRestStars = create<State & Actions>((set, get) => ({
  params: defaultParams,
  loading: false,
  count: 0,

  setParams: (p) => set({ params: { ...get().params, ...p } }),

  load: async () => {
    const { params } = get();
    set({ loading: true, error: undefined });
    try {
      const snap = await fetchLocalRest(params);
      const { pos, vel, col, count } = packStarsToBuffers(snap.stars);
      set({ snapshot: snap, pos, vel, col, count, loading: false });
    } catch (e: any) {
      set({ loading: false, error: String(e?.message || e) });
    }
  },

  stream: () => {
    get().stop();
    const { params } = get();
    const unsubscribe = subscribeLocalRestStream(params, {
      onSnapshot: (snap) => {
        const { pos, vel, col, count } = packStarsToBuffers(snap.stars);
        set({ snapshot: snap, pos, vel, col, count });
      },
      onNavPose: () => {
        /* passthrough hook if client wants to forward nav pose */
      },
      onError: (e) => set({ error: String((e as any)?.message || e) }),
    });
    set({ unsubscribe });
  },

  stop: () => {
    const u = get().unsubscribe;
    if (u) u();
    set({ unsubscribe: undefined });
  },
}));
