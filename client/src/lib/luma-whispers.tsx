import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import type { EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import type { TLumaWhisper, TLumaContext, WhisperContext } from "@shared/whispers";
import { normalizeHash } from "./whispers/hashes";
import { getPanelContext, subscribePanelContexts } from "./whispers/contextRegistry";
import { evaluateSeedWhispers } from "./whispers/seedWhispers";
import { publish } from "./luma-bus";
import { speakTypewriter } from "./luma-whispers-core";

export {
  MODE_WHISPERS,
  NAVIGATION_WHISPERS,
  SYSTEM_WHISPERS,
  whisperMode,
  whisperNav,
  whisperSystem,
  whisperCustom,
  whisperPanelOpen,
  publishWhisper,
  sendDriveNudge,
  getModeWisdom,
  speakTypewriter,
} from "./luma-whispers-core";

// mood / spectrum helpers
export { publishMoodForWhisper, classifyMoodFromWhisper, LUMA_MOOD_BINS } from "./luma-mood-spectrum";

type WhisperCtx = {
  active: TLumaWhisper[];
  hash: string;
  refresh(): void;
};

const WhisperContext = createContext<WhisperCtx | null>(null);
const LOCAL_BANK_URL = "/luma-whispers.local.json";
const BANK_CACHE: { data: TLumaWhisper[] | null; promise?: Promise<TLumaWhisper[]> } = {
  data: null,
};
const HUSH_TTL_MS = 15_000;
const DISTANCE_REPLAY_MS = 90_000;
type OverlayCandidate = TLumaWhisper | null;

function toStableKey(value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" ? json : String(value);
  } catch {
    return String(value);
  }
}

function scoreWhisper(whisper: TLumaWhisper, ctx: TLumaContext): number {
  let score = 0;
  const hash = normalizeHash(ctx.hash || "");

  if (whisper.rule.anyHash?.some((h) => normalizeHash(h) === hash)) score += 2;
  if (whisper.hashes?.some((h) => normalizeHash(h) === hash)) score += 1;

  const zeta = ctx.signals?.zeta;
  if (typeof zeta === "number") {
    if (typeof whisper.rule.minZeta === "number" && zeta >= whisper.rule.minZeta) score += 1;
    if (typeof whisper.rule.maxZeta === "number" && zeta > whisper.rule.maxZeta) score -= 2;
  }

  const q = ctx.signals?.qCavity;
  if (typeof whisper.rule.minQ === "number" && typeof q === "number" && q >= whisper.rule.minQ) {
    score += 1;
  }

  if (whisper.rule.requireSubThreshold && ctx.signals?.staySubThreshold === false) {
    score -= 2;
  }

  const duty = ctx.signals?.dutyEffectiveFR ?? 0;
  if (whisper.tags.includes("#ford-roman") && typeof duty === "number" && duty > 2.5e-5) {
    score += 1;
  }

  if (
    typeof whisper.rule.maxDuty === "number" &&
    typeof duty === "number" &&
    duty > whisper.rule.maxDuty
  ) {
    score -= 1;
  }

  return score;
}

async function loadLocalBank(): Promise<TLumaWhisper[]> {
  if (BANK_CACHE.data) return BANK_CACHE.data;
  if (!BANK_CACHE.promise) {
    BANK_CACHE.promise = fetch(LOCAL_BANK_URL, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`failed ${res.status}`);
        return (await res.json()) as TLumaWhisper[];
      })
      .catch(() => [])
      .then((bank) => {
        BANK_CACHE.data = bank;
        return bank;
      });
  }
  return BANK_CACHE.promise;
}

async function fetchRemote(context: WhisperContext) {
  if (typeof window === "undefined") return { items: [] as TLumaWhisper[] };
  const url = new URL("/api/luma/whispers", window.location.origin);
  url.searchParams.set("hash", context.hash);
  url.searchParams.set("ts", String(context.ts));
  if (context.telemetry) {
    try {
      url.searchParams.set("telemetry", JSON.stringify(context.telemetry));
    } catch {
      /* noop */
    }
    const telemetrySignals =
      typeof context.telemetry === "object" && context.telemetry
        ? (context.telemetry as Record<string, unknown>).signals
        : undefined;
    if (telemetrySignals) {
      try {
        url.searchParams.set("signals", JSON.stringify(telemetrySignals));
      } catch {
        /* noop */
      }
    }
  }
  if (context.panel) {
    try {
      url.searchParams.set("panel", JSON.stringify(context.panel));
    } catch {
      /* noop */
    }
  }
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) throw new Error(`fetch failed ${res.status}`);
  return (await res.json()) as { items: TLumaWhisper[] };
}

async function fetchWithFallback(
  remoteCtx: WhisperContext | null,
  legacyCtx: TLumaContext,
): Promise<TLumaWhisper[]> {
  if (remoteCtx) {
    try {
      const remote = await fetchRemote(remoteCtx);
      if (Array.isArray(remote.items)) {
        return remote.items;
      }
    } catch {
      // fall back to local bank if remote unavailable
    }
  }

  const bank = await loadLocalBank();
  if (!bank.length) return [];
  return bank
    .map((whisper) => ({ whisper, score: scoreWhisper(whisper, legacyCtx) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ whisper }) => whisper);
}

export function LumaWhispersProvider({ children }: { children: React.ReactNode }) {
  // Observe pipeline data populated by a visible physics surface without
  // making every desktop route poll the heavyweight pipeline on its own.
  const { data: pipeline } = useEnergyPipeline({
    enabled: false,
    staleTime: 1500,
  });

  const rawHash = useHashLocation();
  const canonicalHash = useMemo(() => normalizeHash(rawHash), [rawHash]);

  const signals = useMemo(() => {
    if (!pipeline) {
      return undefined;
    }

    const duty =
      typeof pipeline.dutyEffectiveFR === "number"
        ? pipeline.dutyEffectiveFR
        : typeof pipeline.dutyEffective_FR === "number"
          ? pipeline.dutyEffective_FR
          : typeof pipeline.dutyShip === "number"
            ? pipeline.dutyShip
            : undefined;

    const zeta =
      typeof pipeline.zeta === "number"
        ? pipeline.zeta
        : typeof duty === "number"
          ? duty / 3e-5
          : undefined;

    return {
      dutyEffectiveFR: duty,
      sectorCount: pipeline.sectorCount ?? pipeline.sectors ?? pipeline.sectorsTotal,
      qCavity: pipeline.qCavity,
      modulationFreq_GHz: pipeline.modulationFreq_GHz,
      gammaGeo: pipeline.gammaGeo,
      zeta,
      staySubThreshold:
        pipeline.fordRomanCompliance !== false &&
        pipeline.qiBadge !== "violation",
    };
  }, [pipeline]);

  const whisperContext = useMemo<TLumaContext>(
    () => ({
      hash: canonicalHash,
      panel: canonicalHash ? canonicalHash.slice(1) : undefined,
      signals,
    }),
    [canonicalHash, signals],
  );

  const telemetryPayload = useMemo(
    () => buildTelemetrySnapshot(whisperContext.signals, pipeline ?? null),
    [whisperContext.signals, pipeline],
  );

  const [remoteItems, setRemoteItems] = useState<TLumaWhisper[]>([]);
  const [seedItems, setSeedItems] = useState<TLumaWhisper[]>([]);
  const [panelVersion, setPanelVersion] = useState(0);

  useEffect(() => {
    return subscribePanelContexts(() => {
      setPanelVersion((prev) => prev + 1);
    });
  }, []);

  const panelContext = useMemo(
    () => (canonicalHash ? getPanelContext(canonicalHash) : undefined),
    [canonicalHash, panelVersion],
  );

  const canonicalHashRef = useRef(canonicalHash);
  useEffect(() => {
    canonicalHashRef.current = canonicalHash;
  }, [canonicalHash]);

  const contextRef = useRef(whisperContext);
  useEffect(() => {
    contextRef.current = whisperContext;
  }, [whisperContext]);

  const telemetryRef = useRef(telemetryPayload);
  useEffect(() => {
    telemetryRef.current = telemetryPayload;
  }, [telemetryPayload]);

  const panelContextRef = useRef(panelContext);
  useEffect(() => {
    panelContextRef.current = panelContext;
  }, [panelContext]);

  const refresh = useCallback(() => {
    const currentHash = canonicalHashRef.current;
    if (!currentHash) {
      setRemoteItems([]);
      return;
    }
    const requestHash = currentHash;
    const ctxSnapshot = contextRef.current;
    const remoteCtx: WhisperContext = {
      hash: requestHash,
      ts: Date.now(),
      telemetry: telemetryRef.current,
      panel: panelContextRef.current ?? undefined,
    };

    fetchWithFallback(remoteCtx, ctxSnapshot)
      .then((items) => {
        if (requestHash === canonicalHashRef.current) {
          setRemoteItems(items);
        }
      })
      .catch(() => {
        if (requestHash === canonicalHashRef.current) {
          setRemoteItems([]);
        }
      });
  }, []);

  const telemetryKey = useMemo(() => toStableKey(telemetryPayload), [telemetryPayload]);
  const panelCtxKey = useMemo(() => toStableKey(panelContext), [panelContext]);
  const signalKey = useMemo(
    () => toStableKey(whisperContext.signals),
    [whisperContext.signals],
  );

  useEffect(() => {
    refresh();
  }, [refresh, canonicalHash, telemetryKey, panelCtxKey, signalKey]);

  useEffect(() => {
    if (!canonicalHash) {
      setSeedItems([]);
      return;
    }
    const seeds = evaluateSeedWhispers({
      hash: canonicalHash,
      signals: whisperContext.signals,
      pipeline: pipeline ?? null,
      panelCtx: panelContext,
    });
    setSeedItems(seeds);
  }, [canonicalHash, whisperContext.signals, pipeline, panelContext]);

  const active = useMemo(() => {
    if (!seedItems.length && !remoteItems.length) return [];
    const map = new Map<string, TLumaWhisper>();
    for (const item of seedItems) {
      map.set(item.id, item);
    }
    for (const item of remoteItems) {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    }
    return Array.from(map.values());
  }, [seedItems, remoteItems]);

  const overlayCandidate = useMemo<OverlayCandidate>(() => {
    const seedSpeak = seedItems.find((item) => item.mode === "speak" || item.mode === "both");
    if (seedSpeak) return seedSpeak;
    const remoteSpeak = remoteItems.find((item) => item.mode === "speak" || item.mode === "both");
    if (remoteSpeak) return remoteSpeak;
    return null;
  }, [seedItems, remoteItems]);

  useDeliverToOverlay(overlayCandidate);

  const value = useMemo(
    () => ({
      active,
      hash: canonicalHash,
      refresh,
    }),
    [active, canonicalHash, refresh],
  );

  return <WhisperContext.Provider value={value}>{children}</WhisperContext.Provider>;
}

function useDeliverToOverlay(candidate: OverlayCandidate) {
  const lastSpokenRef = React.useRef<{ id: string; at: number } | null>(null);

  React.useEffect(() => {
    if (!candidate) return;
    if (candidate.mode === "bubble") return;
    const text = toOverlayText(candidate);
    if (!text) return;

    const now = Date.now();
    const last = lastSpokenRef.current;
    if (last) {
      const delta = now - last.at;
      if (candidate.id === last.id && delta < DISTANCE_REPLAY_MS) {
        return;
      }
      if (candidate.id !== last.id && delta < HUSH_TTL_MS) {
        return;
      }
    }

    speakTypewriter(text);
    lastSpokenRef.current = { id: candidate.id, at: now };
  }, [candidate]);
}

function toOverlayText(whisper: TLumaWhisper): string | null {
  if (!whisper) return null;
  if (whisper.action) return whisper.action;
  if (whisper.moral) return whisper.moral;
  if (whisper.body) return whisper.body;
  return null;
}

function buildTelemetrySnapshot(
  signals: TLumaContext["signals"],
  pipeline: EnergyPipelineState | null,
): Record<string, unknown> | undefined {
  const snapshot: Record<string, unknown> = {};
  if (signals) {
    snapshot.signals = signals;
  }
  if (pipeline) {
    const pipelineSnapshot: Record<string, unknown> = {};
    const pipelineRecord = pipeline as unknown as Record<string, unknown>;
    const duty =
      pickNumber(pipeline.dutyEffectiveFR) ??
      pickNumber(pipeline.dutyEffective_FR) ??
      pickNumber(pipeline.dutyCycle);
    if (duty !== undefined) pipelineSnapshot.dutyEffectiveFR = duty;

    const sectorCount =
      pickNumber(pipeline.sectorCount) ??
      pickNumber(pipeline.sectors) ??
      pickNumber(pipeline.sectorsTotal);
    if (sectorCount !== undefined) pipelineSnapshot.sectorCount = sectorCount;

    const qCavity = pickNumber(pipeline.qCavity);
    if (qCavity !== undefined) pipelineSnapshot.qCavity = qCavity;

    const gammaGeo = pickNumber(pipeline.gammaGeo);
    if (gammaGeo !== undefined) pipelineSnapshot.gammaGeo = gammaGeo;

    const gammaVdb =
      pickNumber(pipeline.gammaVanDenBroeck) ?? pickNumber(pipelineRecord.gammaVdB);
    if (gammaVdb !== undefined) pipelineSnapshot.gammaVanDenBroeck = gammaVdb;

    const qSpoiling =
      pickNumber(pipeline.qSpoilingFactor) ?? pickNumber(pipelineRecord.deltaAOverA);
    if (qSpoiling !== undefined) pipelineSnapshot.qSpoilingFactor = qSpoiling;

    const modulationFreq = pickNumber(pipeline.modulationFreq_GHz);
    if (modulationFreq !== undefined) pipelineSnapshot.modulationFreq_GHz = modulationFreq;

    const tauLCms = pickNumber(pipeline.tau_LC_ms);
    if (tauLCms !== undefined) pipelineSnapshot.tau_LC_ms = tauLCms;

    const tsRatio = computeTsRatio(pipeline);
    if (tsRatio !== undefined) pipelineSnapshot.tsRatio = tsRatio;

    if (Object.keys(pipelineSnapshot).length) {
      snapshot.pipeline = pipelineSnapshot;
    }
  }

  return Object.keys(snapshot).length ? snapshot : undefined;
}

function computeTsRatio(pipeline: EnergyPipelineState): number | undefined {
  const tauLCms = pickNumber(pipeline.tau_LC_ms);
  const modulationFreq = pickNumber(pipeline.modulationFreq_GHz);
  if (tauLCms === undefined || modulationFreq === undefined || modulationFreq <= 0) {
    return undefined;
  }
  const tauLC = tauLCms / 1e3;
  const period = 1 / (modulationFreq * 1e9);
  if (!Number.isFinite(period) || period <= 0) {
    return undefined;
  }
  const ratio = tauLC / period;
  return Number.isFinite(ratio) ? ratio : undefined;
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function useHashLocation(): string {
  const [hash, setHash] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.location.hash || "";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setHash(window.location.hash || "");
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  return hash;
}

export function useLumaWhispers(): WhisperCtx {
  const ctx = useContext(WhisperContext);
  if (!ctx) {
    throw new Error("LumaWhispersProvider missing in tree");
  }
  return ctx;
}
