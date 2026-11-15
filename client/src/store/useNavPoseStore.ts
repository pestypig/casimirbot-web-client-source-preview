import { createWithEqualityFn } from "zustand/traditional";
import { subscribeNavPose } from "@/lib/nav-pose-channel";
import type { NavFrame, NavigationPose, MovementEpisodeEvent, NavigationDiagnosticPayload } from "@shared/schema";

const AU_M = 149_597_870_000;
const STALE_FALLBACK_MS = 1500;
const now = () => Date.now();

type MovementPhase = MovementEpisodeEvent["phase"];

type NavigationTraceEnvelope = {
  traceId: string;
  episode: NavigationDiagnosticPayload;
  deltas?: Array<{ key: string; delta: number }>;
};

const postNavigationTrace = async (payload: NavigationTraceEnvelope): Promise<boolean> => {
  if (typeof fetch !== "function") return false;
  try {
    const response = await fetch("/api/agi/training-trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traceId: payload.traceId,
        pass: false,
        source: { component: "nav-pose-driver", proxy: true },
        deltas: payload.deltas ?? [],
        metrics: {
          optimism: payload.episode.metrics.optimism,
          entropy: payload.episode.metrics.entropy,
        },
        payload: {
          kind: "navigation_diagnostic",
          data: payload.episode,
        },
        notes: ["phase=3", "certification=uncertified", "source=local-navigation-model"],
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

/** Simple heliocentric circular sim for placeholder signal. */
function makeSimPose(timestamp_ms: number): NavigationPose {
  const t = timestamp_ms / 1000;
  const omega = (2 * Math.PI) / (365.25 * 24 * 3600); // 1 rev/year
  const radius = AU_M;

  const x = radius * Math.cos(omega * t);
  const y = radius * Math.sin(omega * t);
  const z = 0.02 * AU_M * Math.sin(omega * t * 5);
  const vx = -radius * omega * Math.sin(omega * t);
  const vy = radius * omega * Math.cos(omega * t);
  const vz = 0.02 * AU_M * 5 * omega * Math.cos(omega * t * 5);

  const heading = (Math.atan2(vy, vx) * 180) / Math.PI;

  return {
    timestamp_ms,
    frame: "simulation",
    position_m: [x, y, z],
    velocity_mps: [vx, vy, vz],
    heading_deg: (heading + 360) % 360,
  };
}

type Source = "sim" | "derived" | "server";

type NavPoseState = {
  navPose: NavigationPose;
  hasLivePose: boolean;
  source: Source;
  episodeTraceId?: string;
  episodeSeed?: string;
  episodeEvents: MovementEpisodeEvent[];
  start: () => void;
  stop: () => void;
  forceSim: () => void;
  beginEpisode: (args: { traceId: string; seed: string }) => void;
  recordEpisodePhase: (args: {
    phase: MovementPhase;
    candidateId?: string;
    controllerRef?: string;
    predictedDelta?: number;
    actualDelta?: number;
    metadata?: Record<string, unknown>;
    ts?: string;
  }) => void;
  flushEpisode: () => Promise<void>;
  ingestDriveVector: (args: {
    velocity_mps: [number, number, number];
    heading_deg?: number;
    frame?: NavFrame;
    now_ms?: number;
    dt_s?: number;
  }) => void;
  _clients: number;
  _dispose?: () => void;
  _simRAF?: number;
  _ingestStaleTimer?: ReturnType<typeof setTimeout>;
  _lastIngestMs?: number;
};

export const useNavPoseStore = createWithEqualityFn<NavPoseState>((set, get) => {
  const episodeUploads = new Map<MovementEpisodeEvent[], Promise<void>>();
  const startSimLoop = () => {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      return;
    }
    if (get()._simRAF !== undefined) {
      return;
    }

    const tick = () => {
      const state = get();
      if (state.hasLivePose && state.source !== "sim") {
        set({ _simRAF: undefined });
        return;
      }
      const rafId = window.requestAnimationFrame(tick);
      set({
        navPose: makeSimPose(now()),
        hasLivePose: false,
        source: "sim",
        _simRAF: rafId,
      });
    };

    const rafId = window.requestAnimationFrame(tick);
    set({ _simRAF: rafId, source: "sim" });
  };

  const stopSimLoop = () => {
    const raf = get()._simRAF;
    if (raf !== undefined && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(raf);
    }
    set({ _simRAF: undefined });
  };

  return {
    navPose: makeSimPose(now()),
    hasLivePose: false,
    source: "sim",
    episodeEvents: [],
    _clients: 0,

    beginEpisode: ({ traceId, seed }) => {
      const state = get();
      if (state.episodeTraceId === traceId) return;
      set({
        episodeTraceId: traceId,
        episodeSeed: seed,
        episodeEvents: [],
      });
    },

    recordEpisodePhase: ({ phase, candidateId, controllerRef, predictedDelta, actualDelta, metadata, ts }) => {
      const state = get();
      if (!state.episodeTraceId) return;
      const event: MovementEpisodeEvent = {
        phase,
        ts: ts ?? new Date().toISOString(),
        candidateId,
        controllerRef,
        predictedDelta,
        actualDelta,
        metadata,
      };
      const next = [...state.episodeEvents, event];
      set({ episodeEvents: next.slice(-256) });
    },

    flushEpisode: async () => {
      const state = get();
      if (!state.episodeTraceId || state.episodeEvents.length === 0) return;
      const pendingUpload = episodeUploads.get(state.episodeEvents);
      if (pendingUpload) return pendingUpload;
      const traceId = state.episodeTraceId;
      const entropySamples = state.episodeEvents
        .map((event) => event.actualDelta ?? event.predictedDelta ?? 0)
        .filter((value) => Number.isFinite(value));
      const entropy = entropySamples.length
        ? entropySamples.reduce((sum, value) => sum + Math.abs(value), 0) / entropySamples.length
        : 0;
      const optimism = Math.max(0, 1 - entropy);
      const episode: NavigationDiagnosticPayload = {
        episodeId: `${traceId}:episode`,
        traceId,
        provenanceClass: "navigation.local-model",
        certification: "uncertified",
        certificateRefs: [],
        primitivePath: state.episodeEvents
          .map((event) => event.candidateId)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
        metrics: { optimism, entropy },
        events: state.episodeEvents,
        replaySeed: state.episodeSeed,
        notes: ["deterministic-ordering"],
      };
      const sentEvents = new Set(state.episodeEvents);
      const upload = (async () => {
        const accepted = await postNavigationTrace({
          traceId,
          episode,
          deltas: entropySamples.length ? [{ key: "nav.delta.mean", delta: entropy }] : [],
        });
        if (!accepted) return;
        // A response only acknowledges its own snapshot. Events recorded while
        // it was in flight, including a new episode, still need their own upload.
        set((current) => current.episodeTraceId === traceId
          ? { episodeEvents: current.episodeEvents.filter((event) => !sentEvents.has(event)) }
          : {});
      })().finally(() => { episodeUploads.delete(state.episodeEvents); });
      episodeUploads.set(state.episodeEvents, upload);
      return upload;
    },

    start: () => {
      const clients = get()._clients;
      if (clients > 0) {
        set({ _clients: clients + 1 });
        return;
      }

      const dispose = subscribeNavPose((pose) => {
        set({
          navPose: pose,
          hasLivePose: true,
          source: "server",
          _lastIngestMs: pose.timestamp_ms ?? now(),
        });
        const timer = get()._ingestStaleTimer;
        if (timer) {
          clearTimeout(timer);
          set({ _ingestStaleTimer: undefined });
        }
        stopSimLoop();
      });

      set({ _dispose: dispose, _clients: 1 });
      startSimLoop();
    },

    stop: () => {
      const clients = get()._clients;
      if (clients <= 0) return;
      if (clients > 1) {
        set({ _clients: clients - 1 });
        return;
      }

      const { _dispose, _ingestStaleTimer } = get();
      if (_dispose) _dispose();
      if (_ingestStaleTimer) {
        clearTimeout(_ingestStaleTimer);
      }
      void get().flushEpisode();
      stopSimLoop();
      set({
        _dispose: undefined,
        _ingestStaleTimer: undefined,
        hasLivePose: false,
        source: "sim",
        _clients: 0,
        _lastIngestMs: undefined,
      });
    },

    forceSim: () => {
      const timer = get()._ingestStaleTimer;
      if (timer) {
        clearTimeout(timer);
        set({ _ingestStaleTimer: undefined });
      }
      set({ hasLivePose: false, source: "sim" });
      stopSimLoop();
      startSimLoop();
    },

    ingestDriveVector: ({ velocity_mps, heading_deg, frame, now_ms, dt_s }) => {
      if (get().source === "server") {
        return;
      }

      const nowTs = Number.isFinite(now_ms) ? Number(now_ms) : now();
      const lastTs = get()._lastIngestMs ?? nowTs;
      const dt =
        Number.isFinite(dt_s) && Number(dt_s) >= 0
          ? Number(dt_s)
          : Math.max(0, (nowTs - lastTs) / 1000);

      const current = get().navPose;
      const [vxRaw, vyRaw, vzRaw] = velocity_mps;
      const vx = Number.isFinite(vxRaw) ? vxRaw : 0;
      const vy = Number.isFinite(vyRaw) ? vyRaw : 0;
      const vz = Number.isFinite(vzRaw) ? vzRaw : 0;

      const position: [number, number, number] = [
        current.position_m[0] + vx * dt,
        current.position_m[1] + vy * dt,
        current.position_m[2] + vz * dt,
      ];

      const heading =
        typeof heading_deg === "number" && Number.isFinite(heading_deg)
          ? ((heading_deg % 360) + 360) % 360
          : ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360;

      const nextPose: NavigationPose = {
        timestamp_ms: nowTs,
        frame: frame ?? current.frame ?? ("heliocentric-ecliptic" as NavFrame),
        position_m: position,
        velocity_mps: [vx, vy, vz],
        heading_deg: heading,
      };

      const staleTimer = get()._ingestStaleTimer;
      if (staleTimer) {
        clearTimeout(staleTimer);
      }

      stopSimLoop();

      const timer = setTimeout(() => {
        const state = get();
        if (state.source === "derived") {
          set({ hasLivePose: false, source: "sim", _ingestStaleTimer: undefined });
          startSimLoop();
        }
      }, STALE_FALLBACK_MS);

      set({
        navPose: nextPose,
        hasLivePose: true,
        source: "derived",
        _lastIngestMs: nowTs,
        _ingestStaleTimer: timer,
      });
    },
  };
});
