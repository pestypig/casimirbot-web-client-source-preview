import { createWithEqualityFn } from "zustand/traditional";
import type { QISample, QITileSnapshot } from "@shared/schema";
import { QI_S_THRESH } from "@shared/schema";

type TileHistory = {
  last: QITileSnapshot;
  hist: Array<[number, number]>;
};

type QiCounts = {
  green: number;
  amber: number;
  red: number;
  worst: number;
};

type QiState = {
  lastSample: QISample | null;
  byId: Record<string, TileHistory>;
  connected: boolean;
  lastFrameAt: number | null;
  ingest: (sample: QISample) => void;
  tiles: () => QITileSnapshot[];
  counts: () => QiCounts;
  setConnected: (connected: boolean) => void;
};

const HISTORY_LIMIT = 600;

export const useQiStore = createWithEqualityFn<QiState>((set, get) => ({
  lastSample: null,
  byId: {},
  connected: false,
  lastFrameAt: null,
  ingest: (sample) => {
    const frameTs = Number.isFinite(sample.tUnixMs) ? sample.tUnixMs : Date.now();
    set((state) => {
      if (!sample.tiles.length) {
        return { lastSample: sample, lastFrameAt: frameTs };
      }
      const byId: Record<string, TileHistory> = { ...state.byId };
      for (const tile of sample.tiles) {
        const key = tile.tileId;
        const prev = byId[key];
        const nextHist = prev ? prev.hist.slice() : [];
        nextHist.push([sample.tUnixMs, tile.S]);
        if (nextHist.length > HISTORY_LIMIT) {
          nextHist.splice(0, nextHist.length - HISTORY_LIMIT);
        }
        byId[key] = { last: tile, hist: nextHist };
      }
      return { byId, lastSample: sample, lastFrameAt: frameTs };
    });
  },
  tiles: () => Object.values(get().byId).map((entry) => entry.last),
  counts: () => {
    const { byId } = get();
    let green = 0;
    let amber = 0;
    let red = 0;
    let worst = 0;
    for (const entry of Object.values(byId)) {
      const S = entry.last.S;
      worst = Math.max(worst, S);
      if (S >= QI_S_THRESH.red) red += 1;
      else if (S >= QI_S_THRESH.amber) amber += 1;
      else green += 1;
    }
    return { green, amber, red, worst };
  },
  setConnected: (connected) => set({ connected }),
}));
