import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import useGlobalPhase from "@/hooks/useGlobalPhase";
import { useDriveSyncStore } from "@/store/useDriveSyncStore";
import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const firstFinite = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num;
    }
  }
  return undefined;
};

const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

type PhaseSource = "server" | "metrics" | "time";

const isDev = typeof import.meta !== "undefined" ? Boolean((import.meta as any).env?.DEV) : false;

const gaussianWeight = (delta: number, sigma: number) => {
  const safeSigma = Math.max(1e-6, Math.abs(sigma));
  const normalized = delta / safeSigma;
  return Math.exp(-0.5 * normalized * normalized);
};

/**
 * usePhaseBridge
 * Publishes a stable, wrap-aware phase (0..1) onto the Luma bus as `warp:phase`.
 * Prefers explicit server/pipeline phase, then sector telemetry, then the global time loop.
 */
export function usePhaseBridge(opts?: { publishHz?: number; damp?: number }) {
  const publishHz = opts?.publishHz ?? 60;
  const globalDamp = opts?.damp ?? 0.15;

  const { data: pipeline } = useEnergyPipeline({ refetchInterval: 1000 });
  const { data: metrics } = useQuery({
    queryKey: ["/api/helix/metrics"],
    refetchInterval: 1000,
  });

  const pipelineAny = pipeline as Record<string, unknown> | undefined;
  const metricsAny = metrics as Record<string, unknown> | undefined;
  const metricsLightCrossing = metricsAny?.lightCrossing as Record<string, unknown> | undefined;
  const pipelineLightCrossing = pipelineAny?.lightCrossing as Record<string, unknown> | undefined;

  const sectorsTotalRaw = firstFinite(
    metricsLightCrossing?.sectorsTotal,
    metricsLightCrossing?.sectorCount,
    metricsAny?.totalSectors,
    pipelineLightCrossing?.sectorsTotal,
    pipelineLightCrossing?.sectorCount,
    pipelineAny?.sectorsTotal,
    pipelineAny?.sectorCount,
  );
  const sectorsTotal = Math.max(1, sectorsTotalRaw ?? PROMOTED_WARP_PROFILE.sectorCount);

  const currentSector = firstFinite(metricsAny?.currentSector, pipelineAny?.currentSector);
  const strobeHz = firstFinite(pipelineAny?.strobeHz, metricsAny?.strobeHz);
  const periodCandidate = firstFinite(
    metricsLightCrossing?.dwell_ms,
    metricsLightCrossing?.sectorPeriod_ms,
    metricsAny?.sectorPeriod_ms,
    pipelineLightCrossing?.dwell_ms,
    pipelineLightCrossing?.sectorPeriod_ms,
    pipelineAny?.dwell_ms,
    pipelineAny?.sectorPeriod_ms,
  );
  const periodFromHz = strobeHz && strobeHz > 0 ? 1000 / strobeHz : undefined;
  const sectorPeriodMsRaw = periodCandidate ?? periodFromHz ?? 1000;
  const sectorPeriodMs = sectorPeriodMsRaw > 1e-3 ? sectorPeriodMsRaw : 1000;

  const phaseTime = useGlobalPhase({
    mode: "auto",
    periodMs: Math.max(250, sectorPeriodMs),
    damp: globalDamp,
    publishBus: false,
  });
  const phaseFallback = Number.isFinite(phaseTime) ? phaseTime : 0;

  const lastSectorRef = useRef<number | undefined>(undefined);
  const lastSectorT0 = useRef<number>(nowMs());
  const phaseSmooth = useRef<number>(phaseTime);
  const phaseSignRef = useRef<1 | -1>(1);
  const phaseFreezeUntil = useRef<number | null>(null);
  const phaseInit = useRef<boolean>(false);
  const publishRef = useRef<{ t: number; p: number }>({ t: 0, p: -1 });
  const invalidCountsRef = useRef<Record<string, number>>({});
  const lastSourceRef = useRef<PhaseSource | null>(null);
  const recordInvalid = (label: string, value: unknown) => {
    if (!isDev) return;
    const next = (invalidCountsRef.current[label] ?? 0) + 1;
    invalidCountsRef.current[label] = next;
    if (next <= 5 || next % 20 === 0) {
      console.warn(`[phase-bridge] Non-finite ${label} (#${next})`, value);
    }
  };
  const noteNonFinite = (label: string, value: unknown) => {
    if (value === null || value === undefined) return;
    const num = Number(value);
    if (!Number.isFinite(num)) {
      recordInvalid(label, value);
    }
  };

  noteNonFinite("metrics.totalSectors", metricsAny?.totalSectors);
  noteNonFinite("metrics.currentSector", metricsAny?.currentSector);
  noteNonFinite("metrics.sectorPeriod_ms", metricsAny?.sectorPeriod_ms);
  noteNonFinite("metrics.strobeHz", metricsAny?.strobeHz);
  noteNonFinite("pipeline.phase01", pipelineAny?.phase01);
  noteNonFinite("pipeline.sectorsTotal", pipelineAny?.sectorsTotal);
  noteNonFinite("pipeline.sectorCount", pipelineAny?.sectorCount);
  noteNonFinite("pipeline.currentSector", pipelineAny?.currentSector);
  noteNonFinite("pipeline.sectorPeriod_ms", pipelineAny?.sectorPeriod_ms);
  noteNonFinite("pipeline.strobeHz", pipelineAny?.strobeHz);
  noteNonFinite("metrics.lightCrossing.tauLC_ms", metricsLightCrossing?.tauLC_ms);
  noteNonFinite("pipeline.lightCrossing.tauLC_ms", pipelineLightCrossing?.tauLC_ms);
  noteNonFinite("pipeline.tauLC_ms", pipelineAny?.tauLC_ms);

  const tauLC_ms = firstFinite(
    metricsLightCrossing?.tauLC_ms,
    pipelineLightCrossing?.tauLC_ms,
    pipelineAny?.tauLC_ms,
  );

  const pumpPhaseServerValue = firstFinite(pipelineAny?.pumpPhase_deg, metricsAny?.pumpPhase_deg);
  const driveSyncState = useDriveSyncStore.getState();
  const pumpPhase_deg = Number.isFinite(pumpPhaseServerValue)
    ? Number(pumpPhaseServerValue)
    : driveSyncState.pumpPhaseDeg;

  useEffect(() => {
    if (Number.isFinite(pumpPhaseServerValue)) {
      useDriveSyncStore.getState().setPumpPhaseDeg(Number(pumpPhaseServerValue));
    }
  }, [pumpPhaseServerValue]);

  useEffect(() => {
    const id = subscribe("warp:phase", (evt: any) => {
      const phi = Number(evt?.pumpPhase_deg);
      if (Number.isFinite(phi)) {
        useDriveSyncStore.getState().setPumpPhaseDeg(phi);
      }
    });
    return () => {
      unsubscribe(id);
    };
  }, []);

  const now = nowMs();
  if (Number.isFinite(currentSector) && currentSector !== lastSectorRef.current) {
    lastSectorRef.current = currentSector;
    lastSectorT0.current = now;
  }

  const sectorFrac =
    Number.isFinite(sectorPeriodMs) && sectorPeriodMs > 0
      ? (() => {
          const dt = (now - lastSectorT0.current) / sectorPeriodMs;
          const frac = dt - Math.floor(dt);
          return frac < 0 ? frac + 1 : frac;
        })()
      : 0;

  const pServer = firstFinite(pipelineAny?.phase01);
  const pSector =
    Number.isFinite(currentSector) && Number.isFinite(sectorsTotal)
      ? ((currentSector ?? 0) + sectorFrac) / sectorsTotal
      : undefined;

  const unwrap = (value: number, prev: number) => {
    const prevWrapped = prev - Math.floor(prev);
    let delta = value - prevWrapped;
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
    return prev + delta;
  };

  const prevSmoothFinite = Number.isFinite(phaseSmooth.current);
  const prevCont = prevSmoothFinite ? (phaseSmooth.current as number) : phaseFallback;
  if (!prevSmoothFinite && phaseInit.current) {
    recordInvalid("phaseSmooth.prev", phaseSmooth.current);
  }

  type CandidateInput = {
    source: PhaseSource;
    value: number;
    baseWeight: number;
    sigma: number;
  };
  const candidateInputs: CandidateInput[] = [];
  if (Number.isFinite(pServer)) {
    candidateInputs.push({ source: "server", value: pServer as number, baseWeight: 1, sigma: 0.06 });
  }
  if (Number.isFinite(pSector)) {
    candidateInputs.push({ source: "metrics", value: pSector as number, baseWeight: 0.75, sigma: 0.085 });
  }
  if (Number.isFinite(phaseTime)) {
    candidateInputs.push({ source: "time", value: phaseTime as number, baseWeight: 0.45, sigma: 0.12 });
  }

  let phaseSource: PhaseSource = "time";
  let chosenPhase = prevCont;

  if (candidateInputs.length === 0) {
    chosenPhase = unwrap(phaseFallback, prevCont);
  } else {
    const detailed = candidateInputs.map((candidate) => {
      const cont = unwrap(candidate.value, prevCont);
      const prior = gaussianWeight(cont - prevCont, candidate.sigma);
      return { ...candidate, cont, prior };
    });

    let numerator = 0;
    let denominator = 0;
    let dominantSource: PhaseSource = "time";
    let dominantWeight = -Infinity;

    for (let i = 0; i < detailed.length; i += 1) {
      const entry = detailed[i];
      let consensus = entry.prior;
      if (detailed.length > 1) {
        let sumAgreement = 0;
        for (let j = 0; j < detailed.length; j += 1) {
          if (i === j) continue;
          const other = detailed[j];
          const diff = entry.cont - other.cont;
          sumAgreement += gaussianWeight(diff, Math.max(entry.sigma, other.sigma) * 1.6);
        }
        const normalizer = Math.max(1, detailed.length - 1);
        consensus *= sumAgreement / normalizer;
      }
      const weight = Math.max(1e-6, entry.baseWeight * consensus);
      numerator += entry.cont * weight;
      denominator += weight;
      if (weight > dominantWeight) {
        dominantWeight = weight;
        dominantSource = entry.source;
      }
    }

    if (denominator > 1e-6) {
      chosenPhase = numerator / denominator;
    } else {
      chosenPhase = unwrap(phaseFallback, prevCont);
    }
    phaseSource = dominantSource;
  }

  if (!Number.isFinite(chosenPhase)) {
    recordInvalid("phase.chosenBlend", { chosenPhase, prevCont, pServer, pSector, phaseTime });
    chosenPhase = unwrap(phaseFallback, prevCont);
  }

  const prevSource = lastSourceRef.current;
  if (prevSource && prevSource !== phaseSource) {
    publish("viewer:resetOverlays", { reason: "phase-source", from: prevSource, to: phaseSource });
    phaseFreezeUntil.current = now + 120;
  }
  lastSourceRef.current = phaseSource;

  if (!phaseInit.current || !prevSmoothFinite) {
    phaseSmooth.current = chosenPhase;
    phaseInit.current = true;
  } else {
    const blendedTarget = unwrap(chosenPhase, prevCont);
    const alpha = 0.18;
    const next = (1 - alpha) * prevCont + alpha * blendedTarget;
    if (!Number.isFinite(next)) {
      recordInvalid("phaseSmooth.next", { next, blendedTarget, prevCont, chosenPhase });
      phaseSmooth.current = chosenPhase;
    } else {
      phaseSmooth.current = next;
    }
  }
  if (!Number.isFinite(phaseSmooth.current)) {
    recordInvalid("phaseSmooth.recover", phaseSmooth.current);
    phaseSmooth.current = chosenPhase;
  }

  const deltaCont = phaseSmooth.current - prevCont;
  const freezeUntil = phaseFreezeUntil.current;
  const frozen = typeof freezeUntil === "number" && now < freezeUntil;
  if (!frozen && typeof freezeUntil === "number" && now >= freezeUntil) {
    phaseFreezeUntil.current = null;
  }
  if (Number.isFinite(deltaCont) && !frozen) {
    const hysteresis = phaseSource === "server" ? 1e-4 : 5e-4;
    if (Math.abs(deltaCont) > hysteresis) {
      phaseSignRef.current = deltaCont >= 0 ? 1 : -1;
    }
  }

  const smoothForPublish = Number.isFinite(phaseSmooth.current) ? phaseSmooth.current : phaseFallback;
  let phase01Publish: number | undefined = smoothForPublish - Math.floor(smoothForPublish);
  if (Number.isFinite(phase01Publish)) {
    if (phase01Publish < 0) {
      phase01Publish += 1;
    }
    phase01Publish = clamp01(phase01Publish);
  } else {
    phase01Publish = undefined;
  }

  let fallbackPhase01 = chosenPhase - Math.floor(chosenPhase);
  if (!Number.isFinite(fallbackPhase01)) {
    fallbackPhase01 = phaseFallback - Math.floor(phaseFallback);
  }
  if (!Number.isFinite(fallbackPhase01)) {
    fallbackPhase01 = 0;
  }
  if (fallbackPhase01 < 0) {
    fallbackPhase01 += 1;
  }
  fallbackPhase01 = clamp01(fallbackPhase01);
  const phase01 = phase01Publish ?? fallbackPhase01;

  useEffect(() => {
    if (typeof phase01Publish !== "number" || !Number.isFinite(phase01Publish)) {
      recordInvalid("warp:phase.skip", { phaseSmooth: phaseSmooth.current });
      return;
    }
    const nowTs = nowMs();
    const { t: lastT, p: lastP } = publishRef.current;
    const minDt = 1000 / publishHz;
    if (nowTs - lastT > minDt || Math.abs(phase01Publish - lastP) > 1e-3) {
      const phaseCont = Number.isFinite(phaseSmooth.current) ? phaseSmooth.current : phaseFallback;
      const payload = {
        phase01: phase01Publish,
        phaseCont,
        phaseSign: phaseSignRef.current,
        src: phaseSource,
        source: phaseSource,
        sectorsTotal,
        Tsec_ms: sectorPeriodMs,
        at: nowTs,
        pumpPhase_deg,
        tauLC_ms,
      };
      publish("warp:phase:stable", payload);
      publish("warp:phase", payload);
      publishRef.current = { t: nowTs, p: phase01Publish };
    }
  }, [
    phase01Publish,
    phaseSource,
    sectorsTotal,
    sectorPeriodMs,
    publishHz,
    phaseFallback,
    pumpPhase_deg,
    tauLC_ms,
  ]);

  return phase01;
}

export default usePhaseBridge;

