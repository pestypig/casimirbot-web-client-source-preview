import { createWithEqualityFn } from "zustand/traditional";
import {
  SOLAR_GLOBE_DEFAULT_CMD,
  SOLAR_GLOBE_DEFAULT_STATE,
  type SolarGlobeCmd,
  type SolarGlobeState,
} from "@shared/solar-globe";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

const BASE_RADIUS = 1;
const MAX_RADIUS_DELTA = 0.03;
const BASE_BURN_RATE = 0.0008; // fraction / second
const INJECTION_TO_FRACTION = 1 / 40_000; // kg -> core fraction scaler
const MIX_GAIN_RATE = 0.006;
const MIX_LEAK_RATE = 0.0022;
const ENTROPY_CLAMP_MIN = -0.05;
const ENTROPY_CLAMP_MAX = 0.1;
const RADIUS_SMOOTH_TAU = 0.12;
const ALPHA = 0.55;
const BETA = 1.05;
const AUTO_GAIN = 0.8;

type SolarGlobeStore = {
  state: SolarGlobeState;
  cmd: SolarGlobeCmd;
  holdMix: boolean;
  pendingBurstKg: number;
  ingest: (cmd: Partial<SolarGlobeCmd>) => void;
  setMix: (value: number) => void;
  setAuto: (value: boolean) => void;
  injectBurst: (kg: number) => void;
  toggleHoldMix: () => void;
  setHoldMix: (value: boolean) => void;
  tick: (dt: number) => void;
};

const baseBurnRate = (coreFrac: number) => {
  return BASE_BURN_RATE * (1.1 - 0.4 * coreFrac);
};

const computeLuminosity = (coreFrac: number) => {
  const offset = 0.03 * Math.tanh((coreFrac - 0.55) * 3.2);
  return 1 + offset;
};

const smoothRadius = (current: number, target: number, dt: number) => {
  const lambda = 1 - Math.exp(-dt / RADIUS_SMOOTH_TAU);
  return current + (target - current) * clamp(lambda, 0, 1);
};

export const useSolarGlobeStore = createWithEqualityFn<SolarGlobeStore>((set, get) => ({
  state: { ...SOLAR_GLOBE_DEFAULT_STATE },
  cmd: { ...SOLAR_GLOBE_DEFAULT_CMD },
  holdMix: false,
  pendingBurstKg: 0,

  ingest: (cmd) =>
    set((prev) => ({
      cmd: { ...prev.cmd, ...cmd },
    })),

  setMix: (value) =>
    set((prev) => ({
      cmd: { ...prev.cmd, kMix: clamp01(value) },
    })),

  setAuto: (value) =>
    set((prev) => ({
      cmd: { ...prev.cmd, autoStabilize: value },
    })),

  injectBurst: (kg) => {
    if (!Number.isFinite(kg) || kg <= 0) return;
    set((prev) => ({
      pendingBurstKg: prev.pendingBurstKg + kg,
    }));
  },

  toggleHoldMix: () =>
    set((prev) => ({
      holdMix: !prev.holdMix,
    })),

  setHoldMix: (value) => set({ holdMix: Boolean(value) }),

  tick: (dt) => {
    if (!Number.isFinite(dt) || dt <= 0) return;

    set((prev) => {
      const { cmd, holdMix } = prev;
      const effectiveMix = holdMix ? 0 : clamp01(cmd.kMix);
      const injectionRate = Math.max(0, cmd.injectH_kg);
      const burst = prev.pendingBurstKg;
      const injectedMass = injectionRate * dt + burst;
      const injectedFrac = injectedMass * INJECTION_TO_FRACTION;

      const burn = baseBurnRate(prev.state.coreH_frac) * dt;
      const nextCoreH = clamp01(prev.state.coreH_frac + injectedFrac - burn);
      const luminosity = computeLuminosity(nextCoreH);

      const leak = MIX_LEAK_RATE * dt * (1.1 - 0.2 * nextCoreH + 0.5 * (1 - effectiveMix));
      const mixGain =
        effectiveMix * MIX_GAIN_RATE * dt + clamp(injectedFrac * 6, 0, 0.012);
      const entropy = clamp(
        prev.state.entropyDrift + leak - mixGain,
        ENTROPY_CLAMP_MIN,
        ENTROPY_CLAMP_MAX,
      );

      let radiusTarget =
        BASE_RADIUS * (1 + ALPHA * entropy - BETA * (luminosity - 1));
      radiusTarget = clamp(
        radiusTarget,
        BASE_RADIUS * (1 - MAX_RADIUS_DELTA),
        BASE_RADIUS * (1 + MAX_RADIUS_DELTA),
      );
      const radius = smoothRadius(prev.state.radius_ui, radiusTarget, dt);

      let nextCmd = cmd;
      if (cmd.autoStabilize && !holdMix) {
        const error = luminosity - 1;
        const absError = Math.abs(error);
        if (absError > 0.005) {
          const delta = Math.sign(error) * AUTO_GAIN * dt * absError * 6;
          nextCmd = {
            ...cmd,
            kMix: clamp01(cmd.kMix + delta),
          };
        } else if (cmd.kMix > 0.05) {
          nextCmd = {
            ...cmd,
            kMix: clamp01(cmd.kMix - 0.2 * dt),
          };
        }
      }

      const nextState: SolarGlobeState = {
        coreH_frac: nextCoreH,
        luminosity,
        entropyDrift: entropy,
        radius_ui: radius,
      };

      return {
        state: nextState,
        cmd: nextCmd,
        pendingBurstKg: 0,
      };
    });
  },
}));
