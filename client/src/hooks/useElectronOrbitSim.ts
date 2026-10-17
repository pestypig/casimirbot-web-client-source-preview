import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import {
  buildAtomicOrbitalCloud,
  type AtomicOrbitalCloud,
  type AtomicSimulationMode
} from "@/lib/atomic-orbitals";
import {
  buildAtomicPipelineCouplingContract,
  type AtomicPipelineCouplingContract,
} from "@/lib/atomic-pipeline-coupling";

const EPSILON_0 = 8.8541878128e-12;
const ELECTRON_CHARGE = 1.602176634e-19;
const ELECTRON_MASS = 9.1093837015e-31;
const LIGHT_SPEED = 299792458;
const PLANCK_REDUCED = 1.054571817e-34;
const FINE_STRUCTURE_ALPHA = 7.2973525693e-3;
const BOHR_RADIUS = 5.29177210903e-11;
const CLASSICAL_RADIUS = 2.8179403262e-15;
const COMPTON_WAVELENGTH = 2.42631023867e-12;
const PI = Math.PI;
const K_CANONICAL = 1 / (4 * PI * EPSILON_0);
const MIN_DISTANCE = 1e-12;
const SAFE_SEPARATION = 1e-10;
const SAFE_PERMITTIVITY = EPSILON_0;

export type QuantumNumbers = {
  n: number;
  l: number;
  m: number;
  ms: 1 | -1;
};

export type ElectronStructureModel = "pointlike" | "toroidal";

export type ToroidalPayload = {
  lambdaC: number;
  torusRadius: number;
  rotationHorizon: number;
  photonHelicity: 1 | -1;
  internalPhase: number;
  qDerived: number;
  muDerived: number;
  gDerived: number;
};

export type ElectronState = {
  id: string;
  label: string;
  orbital: QuantumNumbers;
  energyEV: number;
  occupancy: number;
  spinAligned: boolean;
  structureModel: ElectronStructureModel;
  toroidal?: ToroidalPayload;
};

export type PotentialConfig = {
  type: "hydrogenic" | "custom";
  Z: number;
  customId?: string;
};

export type SweepSample = {
  value: number;
  k: number;
};

export type SweepState = {
  activeParam: "radius" | "charge" | "permittivity";
  start: number;
  end: number;
  steps: number;
  currentValue: number;
  running: boolean;
  results: SweepSample[] | null;
  lastRunAt: number | null;
  resultsId?: string;
};

export type CoulombExperiment = {
  enabled: boolean;
  electronA: string | null;
  electronB: string | null;
  separation: number;
  mediumPermittivity: number;
  forceMeasured: number;
  kDerived: number | null;
  kCanonical: number;
  relativeError: number | null;
};

export type OrbitEvent =
  | {
      type: "constant_drift";
      constant: "coulomb_k" | "electron_charge" | "g_factor";
      measured: number;
      canonical: number;
      relError: number;
      simTime: number;
    }
  | {
      type: "normalization_error";
      norm: number;
      tolerance: number;
      simTime: number;
      fieldId: string;
    }
  | {
      type: "topology_switch";
      electronId: string;
      from: ElectronStructureModel;
      to: ElectronStructureModel;
      simTime: number;
    }
  | {
      type: "sweep_complete";
      param: SweepState["activeParam"];
      resultsId: string;
      simTimeEnd: number;
    };

type TopologySwitchEvent = Extract<OrbitEvent, { type: "topology_switch" }>;

export type OrbitWavefieldState = {
  fieldId: string;
  normalization: number;
  amplitudes: Array<{
    electronId: string;
    amplitude: number;
    phase: number;
  }>;
};

export type AtomicStressEnergyProxy = {
  schema_version: "atomic_stress_energy_proxy/1";
  value_J_m3: number;
  units: {
    value: "J/m^3";
    uncertainty: "relative_1sigma";
  };
  uncertainty: {
    relative_1sigma: number;
    absolute_1sigma_J_m3: number;
    confidence: number;
  };
  equation: {
    id: "atomic_stress_energy_proxy_eq.v1";
    expression: string;
  };
  citations: string[];
  claim_tier: "diagnostic";
  provenance_class: "proxy";
  certifying: false;
};

export type ElectronOrbitalCloud = {
  electronId: string;
  cloud: AtomicOrbitalCloud;
};

export type OrbitSimState = {
  electrons: ElectronState[];
  potential: PotentialConfig;
  atomModel: AtomicSimulationMode;
  cloudSampleCount: number | null;
  coupling: AtomicPipelineCouplingContract;
  time: {
    tSim: number;
    dt: number;
    playing: boolean;
  };
  orbitalClouds: ElectronOrbitalCloud[];
  wavefields: OrbitWavefieldState;
  sweeps: SweepState;
  experiment: CoulombExperiment;
  derived: {
    bohrRadius: number;
    classicalRadius: number;
    comptonWavelength: number;
    fineStructureAlpha: number;
    pipelineDuty: number;
    normalizationError: number;
    stressEnergyProxy: AtomicStressEnergyProxy;
  };
  events: OrbitEvent[];
  telemetrySources: string[];
};

export type OrbitSimActions = {
  setPotential: (cfg: Partial<PotentialConfig>) => void;
  setAtomModel: (mode: AtomicSimulationMode) => void;
  setCloudSampleCount: (value: number | null) => void;
  setElectrons: (updater: (prev: ElectronState[]) => ElectronState[]) => void;
  toggleStructureModel: (id: string) => void;
  setElectronStructure: (id: string, model: ElectronStructureModel) => void;
  resetToSafeDefaults: () => void;
  step: (dtOverride?: number) => void;
  togglePlay: () => void;
  configureExperiment: (cfg: Partial<CoulombExperiment>) => void;
  runExperiment: () => void;
  setSweep: (cfg: Partial<SweepState>) => void;
  runSweep: () => void;
};

export function useElectronOrbitSim(): [OrbitSimState, OrbitSimActions] {
  const { data: pipeline } = useEnergyPipeline();
  const [electrons, setElectronsState] = useState<ElectronState[]>(() => createDefaultElectrons("safe"));
  const [atomModel, setAtomModelState] = useState<AtomicSimulationMode>("quantum");
  const [cloudSampleCount, setCloudSampleCountState] = useState<number | null>(null);
  const [potential, setPotentialState] = useState<PotentialConfig>({
    type: "hydrogenic",
    Z: 1
  });
  const [time, setTime] = useState({ tSim: 0, dt: 0.05, playing: false });
  const [experiment, setExperiment] = useState<CoulombExperiment>(() => createSafeExperimentConfig());
  const [sweeps, setSweepState] = useState<SweepState>(() => createDefaultSweepState());
  const [events, setEvents] = useState<OrbitEvent[]>([]);

  const pipelineDuty = pipeline?.dutyEffectiveFR ?? pipeline?.dutyCycle ?? 0;
  const coupling = useMemo(
    () =>
      buildAtomicPipelineCouplingContract({
        tsRatio: pipeline?.TS_ratio,
        duty: pipelineDuty,
      }),
    [pipeline?.TS_ratio, pipelineDuty],
  );
  const pipelineDrift = coupling.driftFactor;

  useEffect(() => {
    if (!time.playing) return;
    const handle = window.setInterval(() => {
      setTime((prev) => ({ ...prev, tSim: prev.tSim + prev.dt }));
    }, 120);
    return () => window.clearInterval(handle);
  }, [time.playing, time.dt]);

  const wavefields = useMemo<OrbitWavefieldState>(() => {
    const fieldId = `orbital-${potential.Z}-${electrons.length}`;
    const amplitudes = electrons.map((electron, idx) => {
      const freq = Math.max(1, electron.orbital.n);
      const amplitude = 0.5 + 0.5 * Math.sin(time.tSim * freq + idx);
      const phase = (time.tSim * freq + idx * 0.3) % (2 * PI);
      return { electronId: electron.id, amplitude, phase };
    });
    const normalization =
      1 +
      0.01 * Math.sin(time.tSim * 0.7) +
      (pipelineDuty ? pipelineDuty * 0.005 : 0);
    return { fieldId, amplitudes, normalization };
  }, [electrons, pipelineDuty, potential.Z, time.tSim]);

  const orbitalClouds = useMemo<ElectronOrbitalCloud[]>(() => {
    const bohrRadius = BOHR_RADIUS / Math.max(1, potential.Z);
    const defaultSampleCount = atomModel === "quantum" ? 640 : 280;
    const sampleCount = Math.max(
      96,
      Math.min(4000, cloudSampleCount ?? defaultSampleCount)
    );
    return electrons.map((electron, idx) => ({
      electronId: electron.id,
      cloud: buildAtomicOrbitalCloud(
        atomModel,
        {
          n: electron.orbital.n,
          l: electron.orbital.l,
          m: electron.orbital.m
        },
        {
          bohrRadius,
          nuclearCharge: potential.Z,
          sampleCount,
          seed: seedFromElectron(electron.id, idx)
        }
      )
    }));
  }, [atomModel, cloudSampleCount, electrons, potential.Z]);

  const derived = useMemo(() => {
    const bohrRadius = BOHR_RADIUS / Math.max(1, potential.Z);
    const normalizationError = Math.abs(1 - wavefields.normalization);
    const leadElectron = electrons[0];
    const n = Math.max(1, leadElectron?.orbital.n ?? 1);
    const l = Math.max(0, leadElectron?.orbital.l ?? 0);
    const m = leadElectron?.orbital.m ?? 0;
    const modelWeight = atomModel === "quantum" ? 1 : 0.82;
    const value_J_m3 = Number((9.0e10 * potential.Z * ((n + l + Math.abs(m) + 1) / n) * modelWeight).toPrecision(12));
    const relative_1sigma = 0.12;
    const stressEnergyProxy: AtomicStressEnergyProxy = {
      schema_version: "atomic_stress_energy_proxy/1",
      value_J_m3,
      units: {
        value: "J/m^3",
        uncertainty: "relative_1sigma",
      },
      uncertainty: {
        relative_1sigma,
        absolute_1sigma_J_m3: Number((value_J_m3 * relative_1sigma).toPrecision(12)),
        confidence: 0.95,
      },
      equation: {
        id: "atomic_stress_energy_proxy_eq.v1",
        expression: "u_proxy = 9.0e10 * Z * ((n + l + |m| + 1) / n) * model_weight",
      },
      citations: [
        "docs/knowledge/physics/atomic-systems-tree.json#atomic-stress-energy-bridge-placeholder",
        "tests/fixtures/graph-congruence-conditions-tree.json#atomic-stress-energy-bridge-placeholder",
      ],
      claim_tier: "diagnostic",
      provenance_class: "proxy",
      certifying: false,
    };
    return {
      bohrRadius,
      classicalRadius: CLASSICAL_RADIUS,
      comptonWavelength: COMPTON_WAVELENGTH,
      fineStructureAlpha: FINE_STRUCTURE_ALPHA,
      pipelineDuty,
      normalizationError,
      stressEnergyProxy,
    };
  }, [atomModel, electrons, pipelineDuty, potential.Z, wavefields.normalization]);

  const telemetrySources = useMemo(() => {
    const sources: string[] = [];
    if (pipeline) {
      sources.push("Energy pipeline");
    } else {
      sources.push("Mock seeds");
    }
    if (potential.type === "custom") {
      sources.push(`Potential: ${potential.customId ?? "Custom"}`);
    } else {
      sources.push(`Hydrogenic Z=${potential.Z}`);
    }
    return sources;
  }, [pipeline, potential.customId, potential.type, potential.Z]);

  const pushEvent = useCallback((evt: OrbitEvent) => {
    setEvents((prev) => [evt, ...prev].slice(0, 32));
  }, []);

  const normalizationAlertRef = useRef(false);

  useEffect(() => {
    const breach = derived.normalizationError > 0.03;
    if (breach && !normalizationAlertRef.current) {
      pushEvent({
        type: "normalization_error",
        norm: wavefields.normalization,
        tolerance: 0.03,
        simTime: time.tSim,
        fieldId: wavefields.fieldId
      });
    }
    normalizationAlertRef.current = breach;
  }, [derived.normalizationError, normalizationAlertRef, pushEvent, time.tSim, wavefields.fieldId, wavefields.normalization]);

  const computeForce = useCallback(
    (q1: number, q2: number, r: number, epsilon: number, driftScale?: number) => {
      const distance = Math.max(MIN_DISTANCE, r);
      const permittivity = Math.max(EPSILON_0 * 0.1, epsilon);
      const kMedium = 1 / (4 * PI * permittivity);
      const driftFactor = driftScale ?? pipelineDrift;
      return (kMedium * q1 * q2 * driftFactor) / (distance * distance);
    },
    [pipelineDrift]
  );

  const setPotential = useCallback((cfg: Partial<PotentialConfig>) => {
    setPotentialState((prev) => ({ ...prev, ...cfg }));
  }, []);

  const setAtomModel = useCallback((mode: AtomicSimulationMode) => {
    setAtomModelState(mode);
  }, []);

  const setCloudSampleCount = useCallback((value: number | null) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      setCloudSampleCountState(null);
      return;
    }
    setCloudSampleCountState(Math.max(96, Math.min(4000, Math.trunc(value))));
  }, []);

  const setElectrons = useCallback(
    (updater: (prev: ElectronState[]) => ElectronState[]) => {
      setElectronsState((prev) => updater(prev));
    },
    []
  );

  const toggleStructureModel = useCallback(
    (id: string) => {
      let switched: TopologySwitchEvent | null = null;
      setElectronsState((prev) =>
        prev.map((electron) => {
          if (electron.id !== id) return electron;
          const nextModel: ElectronStructureModel =
            electron.structureModel === "toroidal" ? "pointlike" : "toroidal";
          switched = {
            type: "topology_switch",
            electronId: id,
            from: electron.structureModel,
            to: nextModel,
            simTime: time.tSim,
          };
          return {
            ...electron,
            structureModel: nextModel,
            toroidal: nextModel === "toroidal" ? createToroidalPayload(electron.orbital.ms) : undefined
          };
        })
      );
      if (switched) {
        pushEvent(switched);
      }
    },
    [pushEvent, time.tSim]
  );

  const setElectronStructure = useCallback(
    (id: string, model: ElectronStructureModel) => {
      let switched: TopologySwitchEvent | null = null;
      setElectronsState((prev) =>
        prev.map((electron) => {
          if (electron.id !== id) return electron;
          if (electron.structureModel === model) {
            return electron;
          }
          switched = {
            type: "topology_switch",
            electronId: id,
            from: electron.structureModel,
            to: model,
            simTime: time.tSim
          };
          return {
            ...electron,
            structureModel: model,
            toroidal: model === "toroidal" ? createToroidalPayload(electron.orbital.ms) : undefined
          };
        })
      );
      if (switched) {
        pushEvent(switched);
      }
    },
    [pushEvent, time.tSim]
  );

  const resetToSafeDefaults = useCallback(() => {
    setElectronsState(createDefaultElectrons("safe"));
    setAtomModelState("quantum");
    setCloudSampleCountState(null);
    setExperiment(createSafeExperimentConfig());
    setSweepState(createDefaultSweepState());
    setTime({ tSim: 0, dt: 0.05, playing: false });
  }, []);

  const step = useCallback((dtOverride?: number) => {
    setTime((prev) => {
      const dt = dtOverride ?? prev.dt;
      return { ...prev, dt, tSim: prev.tSim + dt };
    });
  }, []);

  const togglePlay = useCallback(() => {
    setTime((prev) => ({ ...prev, playing: !prev.playing }));
  }, []);

  const configureExperiment = useCallback((cfg: Partial<CoulombExperiment>) => {
    setExperiment((prev) => ({ ...prev, ...cfg }));
  }, []);

  const runExperiment = useCallback(() => {
    setExperiment((prev) => {
      if (!prev.electronA || !prev.electronB) return prev;
      const a = electrons.find((e) => e.id === prev.electronA);
      const b = electrons.find((e) => e.id === prev.electronB);
      if (!a || !b) return prev;
      const q1 = a.toroidal?.qDerived ?? ELECTRON_CHARGE;
      const q2 = b.toroidal?.qDerived ?? ELECTRON_CHARGE;
      const calibrationMode = isCalibrationProbe(a, b, prev);
      const forceMeasured = computeForce(
        q1,
        q2,
        prev.separation,
        prev.mediumPermittivity,
        calibrationMode ? 1 : undefined
      );
      const kDerived = (forceMeasured * prev.separation * prev.separation) / (q1 * q2);
      const relativeError = Math.abs(kDerived - prev.kCanonical) / prev.kCanonical;
      if (relativeError > 0.01) {
        pushEvent({
          type: "constant_drift",
          constant: "coulomb_k",
          measured: kDerived,
          canonical: prev.kCanonical,
          relError: relativeError,
          simTime: time.tSim
        });
      }
      return {
        ...prev,
        forceMeasured,
        kDerived,
        relativeError
      };
    });
  }, [computeForce, electrons, pushEvent, time.tSim]);

  const setSweep = useCallback((cfg: Partial<SweepState>) => {
    setSweepState((prev) => ({ ...prev, ...cfg }));
  }, []);

  const runSweep = useCallback(() => {
    setSweepState((prev) => {
      const steps = Math.max(2, prev.steps);
      const span = prev.end - prev.start;
      const results: SweepSample[] = [];
      for (let i = 0; i < steps; i++) {
        const ratio = steps === 1 ? 0 : i / (steps - 1);
        const value = prev.start + span * ratio;
        const sample = createSweepSample(
          prev.activeParam,
          value,
          electrons,
          experiment,
          computeForce
        );
        results.push(sample);
      }
      const resultsId = `orbit-sweep-${Date.now()}`;
      const maxError = results.reduce((max, sample) => {
        const rel = Math.abs(sample.k - K_CANONICAL) / K_CANONICAL;
        return Math.max(max, rel);
      }, 0);
      pushEvent({
        type: "sweep_complete",
        param: prev.activeParam,
        resultsId,
        simTimeEnd: time.tSim
      });
      if (maxError > 0.02) {
        pushEvent({
          type: "constant_drift",
          constant: "electron_charge",
          measured: results[results.length - 1]?.k ?? K_CANONICAL,
          canonical: K_CANONICAL,
          relError: maxError,
          simTime: time.tSim
        });
      }
      return {
        ...prev,
        running: false,
        currentValue: results[results.length - 1]?.value ?? prev.currentValue,
        results,
        lastRunAt: Date.now(),
        resultsId
      };
    });
  }, [computeForce, electrons, experiment, pushEvent, time.tSim]);

  const state: OrbitSimState = {
    electrons,
    potential,
    atomModel,
    cloudSampleCount,
    coupling,
    time,
    orbitalClouds,
    wavefields,
    sweeps,
    experiment,
    derived,
    events,
    telemetrySources
  };

  const actions: OrbitSimActions = {
    setPotential,
    setAtomModel,
    setCloudSampleCount,
    setElectrons,
    toggleStructureModel,
    setElectronStructure,
    resetToSafeDefaults,
    step,
    togglePlay,
    configureExperiment,
    runExperiment,
    setSweep,
    runSweep
  };

  return [state, actions];
}

function createDefaultElectrons(mode: "safe" | "explore" = "safe"): ElectronState[] {
  if (mode === "explore") {
    return [
      createElectron("e-1", { n: 1, l: 0, m: 0, ms: 1 }, "Toroidal 1s", "toroidal"),
      createElectron("e-2", { n: 2, l: 1, m: 0, ms: -1 }, "Bridge 2p", "pointlike"),
      createElectron("e-3", { n: 3, l: 2, m: 1, ms: 1 }, "Crown 3d", "pointlike")
    ];
  }
  return [
    createElectron("e-1", { n: 1, l: 0, m: 0, ms: 1 }, "1s calibration", "pointlike"),
    createElectron("e-2", { n: 2, l: 1, m: 0, ms: -1 }, "2p calibration", "pointlike"),
    createElectron("e-3", { n: 3, l: 2, m: 1, ms: 1 }, "3d calibration", "pointlike")
  ];
}

function createElectron(
  id: string,
  orbital: QuantumNumbers,
  label: string,
  mode: ElectronStructureModel
): ElectronState {
  const energyEV = -13.6 / (orbital.n * orbital.n);
  const base: ElectronState = {
    id,
    label,
    orbital,
    energyEV,
    occupancy: orbital.l === 0 ? 2 : 1,
    spinAligned: orbital.ms > 0,
    structureModel: mode
  };
  if (mode === "toroidal") {
    base.toroidal = createToroidalPayload(orbital.ms);
  }
  return base;
}

function createSafeExperimentConfig(): CoulombExperiment {
  return {
    enabled: true,
    electronA: "e-1",
    electronB: "e-2",
    separation: SAFE_SEPARATION,
    mediumPermittivity: SAFE_PERMITTIVITY,
    forceMeasured: 0,
    kDerived: null,
    kCanonical: K_CANONICAL,
    relativeError: null
  };
}

function createDefaultSweepState(): SweepState {
  return {
    activeParam: "radius",
    start: 5e-11,
    end: 3e-10,
    steps: 8,
    currentValue: 5e-11,
    running: false,
    results: null,
    lastRunAt: null
  };
}

function createToroidalPayload(spin: 1 | -1): ToroidalPayload {
  const lambdaC = COMPTON_WAVELENGTH;
  const torusRadius = lambdaC / (4 * PI);
  const rotationHorizon = lambdaC * (1 + FINE_STRUCTURE_ALPHA / (2 * PI));
  const qDerived = (1 / (2 * PI)) * Math.sqrt(3 * EPSILON_0 * PLANCK_REDUCED * LIGHT_SPEED);
  const muDerived =
    ((ELECTRON_CHARGE * PLANCK_REDUCED) / (2 * ELECTRON_MASS)) * (1 + FINE_STRUCTURE_ALPHA / (2 * PI));
  const gDerived = 2 * (1 + FINE_STRUCTURE_ALPHA / (2 * PI));
  return {
    lambdaC,
    torusRadius,
    rotationHorizon,
    photonHelicity: spin,
    internalPhase: Math.random() * 2 * PI,
    qDerived,
    muDerived,
    gDerived
  };
}

function createSweepSample(
  activeParam: SweepState["activeParam"],
  value: number,
  electrons: ElectronState[],
  experiment: CoulombExperiment,
  computeForce: (q1: number, q2: number, r: number, epsilon: number, driftScale?: number) => number
): SweepSample {
  const source = experiment.electronA
    ? electrons.find((e) => e.id === experiment.electronA)
    : electrons[0];
  const target = experiment.electronB
    ? electrons.find((e) => e.id === experiment.electronB)
    : electrons[1] ?? electrons[0];
  const q1 = source?.toroidal?.qDerived ?? ELECTRON_CHARGE;
  const q2 = target?.toroidal?.qDerived ?? ELECTRON_CHARGE;
  const sweepSeparation =
    activeParam === "radius" ? value : experiment.separation;
  const sweepCharge1 = activeParam === "charge" ? q1 * (value || 1) : q1;
  const sweepPermittivity =
    activeParam === "permittivity" ? value : experiment.mediumPermittivity;
  const force = computeForce(
    sweepCharge1,
    q2,
    sweepSeparation,
    sweepPermittivity
  );
  const k = (force * sweepSeparation * sweepSeparation) / (sweepCharge1 * q2);
  return { value, k };
}

function isCalibrationProbe(
  electronA: ElectronState | undefined,
  electronB: ElectronState | undefined,
  experiment: CoulombExperiment
) {
  if (!electronA || !electronB) return false;
  if (electronA.structureModel !== "pointlike" || electronB.structureModel !== "pointlike") {
    return false;
  }
  const separationDelta = Math.abs(experiment.separation - SAFE_SEPARATION);
  const epsDelta = Math.abs(experiment.mediumPermittivity - SAFE_PERMITTIVITY);
  return separationDelta <= SAFE_SEPARATION * 0.05 && epsDelta <= SAFE_PERMITTIVITY * 0.05;
}

function seedFromElectron(electronId: string, index: number) {
  let hash = 2166136261 ^ index;
  for (let i = 0; i < electronId.length; i++) {
    hash ^= electronId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
