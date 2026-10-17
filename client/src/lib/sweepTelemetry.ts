export type SweepSnapshot = {
  iter: number | null;
  total: number | null;
  pct: number | null;
  d_nm: number | null;
  m: number | null;
  phi_deg: number | null;
  Omega_GHz: number | null;
  detune_MHz: number | null;
  kappa_MHz: number | null;
  kappaEff_MHz: number | "THRESHOLD" | null;
  pumpRatio: number | null;
  G_dB: number | null;
  QL: number | null;
  status: string | null;
  guard?: string | null;
  etaMs?: number | null;
  slewDelayMs?: number | null;
  bestIdx?: number | null;
  guardCap?: boolean | null;
};

type Subscriber = (snapshot: SweepSnapshot | null) => void;

let currentSnapshot: SweepSnapshot | null = null;
const subscribers = new Set<Subscriber>();

export const sweepTelemetry = {
  set(next: SweepSnapshot | null) {
    currentSnapshot = next;
    subscribers.forEach((fn) => fn(currentSnapshot));
  },
  get(): SweepSnapshot | null {
    return currentSnapshot;
  },
  subscribe(fn: Subscriber) {
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  },
};
