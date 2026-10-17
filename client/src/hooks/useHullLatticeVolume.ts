import { useEffect, useMemo, useRef, useState } from "react";
import type { HullBasisResolved } from "@shared/hull-basis";
import { HULL_BASIS_IDENTITY } from "@shared/hull-basis";
import type { HullPreviewPayload } from "@shared/schema";
import { publish } from "@/lib/luma-bus";
import { buildLatticeFrame, type LatticeFrame, type LatticeProfileTag, type LatticeQualityPreset } from "@/lib/lattice-frame";
import { buildHullDistanceGrid, type HullDistanceGrid } from "@/lib/lattice-sdf";
import {
  applySchedulerWeights,
  buildHullSurfaceStrobe,
  voxelizeHullSurfaceStrobe,
  type HullSurfaceVoxelVolume,
} from "@/lib/lattice-surface";
import { LATTICE_PROFILE_PERF, LatticeRebuildWatchdog, estimateLatticeUploadBytes } from "@/lib/lattice-perf";
import type { WireframeOverlayBudgets, WireframeOverlayLod } from "@/lib/resolve-wireframe-overlay";
import type { HullLatticeState } from "@/store/useHull3DSharedStore";

type HullDimsInput = {
  Lx_m: number;
  Ly_m: number;
  Lz_m: number;
  basis?: HullBasisResolved | null;
};

type LatticeStrobeWeightParams = {
  totalSectors: number;
  liveSectors: number;
  sectorCenter01: number;
  gaussianSigma: number;
  sectorFloor: number;
  splitEnabled?: boolean;
  splitFrac?: number;
  syncMode?: number;
};

export type LatticeGuardrails = {
  messages: Array<{ level: "warn" | "error"; label: string }>;
  staleHash: boolean;
  desiredWeightHash: string | null;
  builtWeightHash: string | null;
};

export type LatticeWatchdogStats = {
  blocked: number;
  lastBlockedAt: number;
};

export type UseHullLatticeVolumeOptions = {
  latticeModeEnabled: boolean;
  latticeAvailable: boolean;
  latticeRequireSdf: boolean;
  hullPreview: HullPreviewPayload | null;
  hullDims: HullDimsInput | null;
  boundsProfile: "tight" | "wide";
  qualityPreset: LatticeQualityPreset;
  profileTag: LatticeProfileTag;
  wireframeLod: WireframeOverlayLod;
  wireframeBudgets: WireframeOverlayBudgets;
  totalSectors: number;
  liveSectors: number;
  sectorCenter01: number;
  gaussianSigma: number;
  sectorFloor: number;
  splitEnabled: boolean;
  splitFrac: number;
  syncMode: number;
  gate: number;
  ampChain: number;
  sigma: number;
  beta: number;
  R: number;
  axes: [number, number, number];
  latticeUseDynamicWeights: boolean;
  sharedLatticeState: HullLatticeState;
  setSharedLattice: (next: Partial<HullLatticeState> | null) => void;
};

export type UseHullLatticeVolumeResult = {
  latticeFrame: LatticeFrame | null;
  latticeVolume: HullSurfaceVoxelVolume | null;
  latticeSdf: HullDistanceGrid | null;
  clampReasons: string[];
  latticeGuardrails: LatticeGuardrails;
  latticeWatchdogStats: LatticeWatchdogStats;
  desiredDriveLadderSignature: string | null;
};

const sech2 = (x: number) => {
  const c = Math.cosh(x);
  return 1 / (c * c);
};

const dTopHatDr = (r: number, sigma: number, R: number) => {
  const den = Math.max(1e-8, 2 * Math.tanh(sigma * R));
  return sigma * (sech2(sigma * (r + R)) - sech2(sigma * (r - R))) / den;
};

const fnv1a32 = (str: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash >>> 0) * 0x01000193;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const latticeBasisSignature = (basis?: HullBasisResolved | null) => {
  if (!basis) return "basis:none";
  const swap = `${basis.swap.x}${basis.swap.y}${basis.swap.z}`;
  const flip = `${basis.flip.x ? 1 : 0}${basis.flip.y ? 1 : 0}${basis.flip.z ? 1 : 0}`;
  const scale = basis.scale.map((v) => Math.round((v ?? 0) * 1e6) / 1e6).join(",");
  const forward = basis.forward.map((v) => Math.round((v ?? 0) * 1e4) / 1e4).join(",");
  const up = basis.up.map((v) => Math.round((v ?? 0) * 1e4) / 1e4).join(",");
  const right = basis.right.map((v) => Math.round((v ?? 0) * 1e4) / 1e4).join(",");
  return `basis:${swap}|${flip}|${scale}|${forward}|${up}|${right}`;
};

const quantizeSectorCenter01 = (center01: number, totalSectors: number) => {
  const total = Math.max(1, Math.floor(totalSectors));
  const center = ((center01 % 1) + 1) % 1;
  const idx = Math.min(total - 1, Math.max(0, Math.floor(center * total)));
  return (idx + 0.5) / total;
};

const latticeParamsSignature = (params: LatticeStrobeWeightParams) => {
  const center01 = quantizeSectorCenter01(params.sectorCenter01, params.totalSectors);
  const parts = [
    `total=${Math.floor(params.totalSectors)}`,
    `live=${Math.floor(params.liveSectors)}`,
    `center=${Math.round(center01 * 1e6) / 1e6}`,
    `sigma=${Math.round(params.gaussianSigma * 1e6) / 1e6}`,
    `floor=${Math.round(params.sectorFloor * 1e6) / 1e6}`,
    `split=${params.splitEnabled ? 1 : 0}`,
    `frac=${Math.round((params.splitFrac ?? 0) * 1e6) / 1e6}`,
    `mode=${params.syncMode ?? 1}`,
  ];
  return parts.join("|");
};

export function useHullLatticeVolume(options: UseHullLatticeVolumeOptions): UseHullLatticeVolumeResult {
  const {
    latticeModeEnabled,
    latticeAvailable,
    latticeRequireSdf,
    hullPreview,
    hullDims,
    boundsProfile,
    qualityPreset,
    profileTag,
    wireframeLod,
    wireframeBudgets,
    totalSectors,
    liveSectors,
    sectorCenter01,
    gaussianSigma,
    sectorFloor,
    splitEnabled,
    splitFrac,
    syncMode,
    gate,
    ampChain,
    sigma,
    beta,
    R,
    axes,
    latticeUseDynamicWeights,
    sharedLatticeState,
    setSharedLattice,
  } = options;

  const latticeEnabled = latticeModeEnabled && latticeAvailable;

  const latticeFrame = useMemo(() => {
    if (!latticeEnabled || !hullDims) return null;
    return buildLatticeFrame({
      hullDims: {
        Lx_m: hullDims.Lx_m,
        Ly_m: hullDims.Ly_m,
        Lz_m: hullDims.Lz_m,
      },
      basis: hullDims.basis ?? HULL_BASIS_IDENTITY,
      boundsProfile,
      preset: qualityPreset,
      profileTag,
    });
  }, [latticeEnabled, hullDims, boundsProfile, qualityPreset, profileTag]);

  const latticeSdfFrame = useMemo(() => {
    if (latticeFrame) return latticeFrame;
    if (!hullPreview || !hullDims) return null;
    return buildLatticeFrame({
      hullDims: {
        Lx_m: hullDims.Lx_m,
        Ly_m: hullDims.Ly_m,
        Lz_m: hullDims.Lz_m,
      },
      basis: hullDims.basis ?? HULL_BASIS_IDENTITY,
      boundsProfile,
      preset: qualityPreset,
      profileTag,
    });
  }, [latticeFrame, hullPreview, hullDims, boundsProfile, qualityPreset, profileTag]);

  const latticeStrobeBuild = useMemo(() => {
    if (!latticeEnabled || !hullDims || !hullPreview) return null;
    const strobe = buildHullSurfaceStrobe(hullPreview, {
      surface: {
        lod: wireframeLod,
        targetDims: {
          Lx_m: hullDims.Lx_m,
          Ly_m: hullDims.Ly_m,
          Lz_m: hullDims.Lz_m,
        },
        totalSectors,
        ...wireframeBudgets,
      },
    });
    const basisSig = strobe.surface?.basis ? latticeBasisSignature(strobe.surface.basis) : undefined;
    return { strobe, basisSig };
  }, [latticeEnabled, hullDims, hullPreview, wireframeLod, totalSectors, wireframeBudgets]);

  const latticeDesiredWeightHash = useMemo(() => {
    const strobe = latticeStrobeBuild?.strobe;
    const hist = strobe?.histogram;
    if (!latticeEnabled || !strobe || !hist) return null;
    const params: LatticeStrobeWeightParams = {
      totalSectors: strobe.surface?.sectorCount ?? totalSectors,
      liveSectors,
      sectorCenter01,
      gaussianSigma,
      sectorFloor,
      splitEnabled,
      splitFrac,
      syncMode,
    };
    const basisSig = latticeStrobeBuild?.basisSig ?? "basis:none";
    const cacheKeyRaw = [
      strobe.hash ?? "surface:none",
      basisSig,
      latticeParamsSignature(params),
      hist.sectorCount,
      hist.triangleAreaTotal ?? 0,
    ].join("|");
    return fnv1a32(cacheKeyRaw);
  }, [
    latticeEnabled,
    latticeStrobeBuild,
    totalSectors,
    liveSectors,
    sectorCenter01,
    gaussianSigma,
    sectorFloor,
    splitEnabled,
    splitFrac,
    syncMode,
  ]);

  const latticeDesiredDfdrSignature = useMemo(
    () => `v3|${sigma.toFixed(6)}|${beta.toFixed(6)}|${R.toFixed(3)}`,
    [sigma, beta, R],
  );

  const latticeDesiredDriveLadderSignature = useMemo(() => {
    return [
      latticeDesiredDfdrSignature,
      `g${Math.round(gate * 1e6)}`,
      `d${Math.round(ampChain * 1e6)}`,
    ].join("|");
  }, [latticeDesiredDfdrSignature, gate, ampChain]);

  const latticeGuardrails = useMemo<LatticeGuardrails>(() => {
    const messages: Array<{ level: "warn" | "error"; label: string }> = [];
    if (!latticeModeEnabled) {
      return {
        messages,
        staleHash: false,
        desiredWeightHash: null,
        builtWeightHash: null,
      };
    }
    const vol = sharedLatticeState?.volume;
    const hasVolume = !!vol;
    if (hasVolume && (vol?.stats?.budgetHit || vol?.clampReasons?.includes("voxel:budgetHit"))) {
      messages.push({ level: "error", label: "Over budget" });
    }
    if (latticeRequireSdf && hasVolume && !sharedLatticeState?.sdf) {
      messages.push({ level: "warn", label: "Missing SDF (required)" });
    } else if (!latticeRequireSdf && hasVolume && !sharedLatticeState?.sdf) {
      messages.push({ level: "warn", label: "Missing SDF" });
    }

    const desired = latticeUseDynamicWeights ? null : latticeDesiredWeightHash;
    const built = latticeUseDynamicWeights ? null : (sharedLatticeState?.strobe?.weightHash ?? null);
    const staleHash = !latticeUseDynamicWeights && !!(desired && built && desired !== built);
    if (!latticeUseDynamicWeights) {
      if (desired && !built) {
        messages.push({ level: "warn", label: "Weights pending" });
      } else if (staleHash) {
        messages.push({ level: "warn", label: "Stale hash" });
      }
    }

    return { messages, staleHash, desiredWeightHash: desired, builtWeightHash: built };
  }, [
    latticeModeEnabled,
    latticeRequireSdf,
    sharedLatticeState?.volume,
    sharedLatticeState?.sdf,
    sharedLatticeState?.strobe?.weightHash,
    latticeDesiredWeightHash,
    latticeUseDynamicWeights,
  ]);

  const latticeVolumeForRenderer = useMemo(() => {
    if (!latticeModeEnabled) return null;
    const vol = sharedLatticeState?.volume ?? null;
    if (!vol) return null;
    if (vol.stats?.budgetHit || vol.clampReasons?.includes("voxel:budgetHit")) return null;
    if (latticeRequireSdf && !sharedLatticeState?.sdf) return null;
    const desiredWeightHash = latticeDesiredWeightHash;
    const builtWeightHash = sharedLatticeState?.strobe?.weightHash ?? null;
    if (!latticeUseDynamicWeights && desiredWeightHash && builtWeightHash !== desiredWeightHash) return null;
    const desiredDriveSig = latticeDesiredDriveLadderSignature;
    const builtDriveSig = vol.metadata?.driveLadder?.signature ?? null;
    if (desiredDriveSig && builtDriveSig && builtDriveSig !== desiredDriveSig) return null;
    return vol;
  }, [
    latticeModeEnabled,
    latticeRequireSdf,
    sharedLatticeState?.volume,
    sharedLatticeState?.sdf,
    sharedLatticeState?.strobe?.weightHash,
    latticeDesiredWeightHash,
    latticeDesiredDriveLadderSignature,
    latticeUseDynamicWeights,
  ]);

  const latticeSdfForRenderer = useMemo(() => {
    if (!latticeVolumeForRenderer) return null;
    return sharedLatticeState?.sdf ?? null;
  }, [latticeVolumeForRenderer, sharedLatticeState?.sdf]);

  const latticeBaseKeyRef = useRef<string>("");

  useEffect(() => {
    const key = latticeEnabled && latticeFrame && latticeStrobeBuild?.strobe
      ? [
          latticeFrame.profileTag,
          latticeFrame.preset,
          latticeFrame.dims.join("x"),
          latticeFrame.voxelSize_m.toFixed(6),
          latticeFrame.boundsProfile,
          latticeStrobeBuild.strobe.hash,
          latticeStrobeBuild.strobe.lod,
          latticeStrobeBuild.strobe.source,
          latticeStrobeBuild.strobe.surface?.meshHash ?? "mesh:none",
        ].join("|")
      : `off|${profileTag}|${latticeModeEnabled ? 1 : 0}|${latticeAvailable ? 1 : 0}`;

    if (key === latticeBaseKeyRef.current) return;
    latticeBaseKeyRef.current = key;

    if (!latticeEnabled || !latticeFrame || !latticeStrobeBuild?.strobe) {
      setSharedLattice({
        frame: null,
        preset: "auto",
        profileTag,
        strobe: null,
        sdf: null,
        volume: null,
      });
      return;
    }

    const strobe = latticeStrobeBuild.strobe;
    setSharedLattice({
      frame: latticeFrame,
      preset: latticeFrame.preset,
      profileTag: latticeFrame.profileTag,
      strobe: {
        hash: strobe.hash,
        source: strobe.source,
        lod: strobe.lod,
        meshHash: strobe.surface?.meshHash,
        basisSignature: latticeStrobeBuild.basisSig,
        handedness: strobe.surface?.handedness,
        sectorCount: strobe.surface?.sectorCount,
        triangleCount: strobe.surface?.triangleCount,
        vertexCount: strobe.surface?.vertexCount,
        clampReasons: strobe.clampReasons,
        weightHash: undefined,
        weightCacheHit: false,
        hist: strobe.histogram,
        weights: null,
        coverage: null,
      },
      sdf: null,
      volume: null,
    });
  }, [latticeEnabled, latticeFrame, latticeStrobeBuild, latticeModeEnabled, latticeAvailable, profileTag, setSharedLattice]);

  const latticeVolumeTimerRef = useRef<number | null>(null);
  const latticeVolumePendingSinceRef = useRef<number | null>(null);
  const latticeVolumeWantedKeyRef = useRef<string | null>(null);
  const latticeVolumeBuildingRef = useRef(false);
  const latticeRebuildWatchdogs = useRef({
    preview: new LatticeRebuildWatchdog(LATTICE_PROFILE_PERF.preview.rebuildMinMs),
    card: new LatticeRebuildWatchdog(LATTICE_PROFILE_PERF.card.rebuildMinMs),
  });
  const [latticeWatchdogStats, setLatticeWatchdogStats] = useState<LatticeWatchdogStats>({
    blocked: 0,
    lastBlockedAt: 0,
  });

  useEffect(() => {
    if (!latticeEnabled) {
      if (latticeVolumeTimerRef.current != null) {
        window.clearTimeout(latticeVolumeTimerRef.current);
        latticeVolumeTimerRef.current = null;
      }
      latticeVolumePendingSinceRef.current = null;
      latticeVolumeWantedKeyRef.current = null;
      latticeVolumeBuildingRef.current = false;
      setLatticeWatchdogStats({ blocked: 0, lastBlockedAt: 0 });
      return;
    }

    const strobe = latticeStrobeBuild?.strobe;
    const frame = latticeFrame;
    if (!frame || !strobe?.surface || !strobe.histogram) {
      setSharedLattice({ volume: null });
      return;
    }

    const rails = LATTICE_PROFILE_PERF[profileTag] ?? LATTICE_PROFILE_PERF.preview;
    const frameVoxels = Math.max(1, frame.voxelCount ?? frame.dims[0] * frame.dims[1] * frame.dims[2]);
    const estBytes = estimateLatticeUploadBytes(frame.dims, { packedRG: true, bytesPerComponent: 4 });
    const perfClampReasons: string[] = [];
    if (frameVoxels > rails.maxVoxels) perfClampReasons.push("budget:maxVoxels");
    if (estBytes > rails.maxBytes) perfClampReasons.push("budget:maxBytes");
    if (perfClampReasons.length) {
      const clampedFrame = {
        ...frame,
        clampReasons: Array.from(new Set([...(frame.clampReasons ?? []), ...perfClampReasons])),
      };
      setSharedLattice({
        frame: clampedFrame,
        volume: null,
        updatedAt: Date.now(),
      });
      publish("hull3d:lattice:fallback", {
        ts: Date.now(),
        enabled: latticeModeEnabled,
        reason: perfClampReasons[0],
        label: "Perf clamp",
        detail: perfClampReasons.join(", "),
        path: "analytic",
        caps: null,
        runtime: null,
        frameClampReasons: clampedFrame.clampReasons,
        volumeClampReasons: perfClampReasons,
      });
      return;
    }

    const desiredWeightHash = latticeDesiredWeightHash;
    if (!desiredWeightHash && !latticeUseDynamicWeights) return;

    const currentWeightHash = sharedLatticeState?.strobe?.weightHash ?? null;
    const currentDriveSig = sharedLatticeState?.volume?.metadata?.driveLadder?.signature ?? null;
    const desiredDriveSig = latticeDesiredDriveLadderSignature;
    const surfaceHash = strobe.hash;
    const currentSurfaceHash = sharedLatticeState?.strobe?.hash ?? null;

    const needsRebuild =
      !sharedLatticeState?.volume ||
      currentSurfaceHash !== surfaceHash ||
      (!latticeUseDynamicWeights && currentWeightHash !== desiredWeightHash) ||
      currentDriveSig !== desiredDriveSig;

    if (!needsRebuild) {
      if (latticeVolumeTimerRef.current != null) {
        window.clearTimeout(latticeVolumeTimerRef.current);
        latticeVolumeTimerRef.current = null;
      }
      latticeVolumePendingSinceRef.current = null;
      latticeVolumeWantedKeyRef.current = null;
      return;
    }

    const frameKey = `${frame.dims.join("x")}@${frame.voxelSize_m.toFixed(6)}|${frame.profileTag}`;
    const weightKey = latticeUseDynamicWeights ? "weights:dynamic" : desiredWeightHash ?? "weights:none";
    const wantedKey = `${frameKey}|${surfaceHash}|${weightKey}|${desiredDriveSig}`;

    latticeVolumeWantedKeyRef.current = wantedKey;
    if (latticeVolumeBuildingRef.current) {
      return;
    }

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const major =
      !sharedLatticeState?.volume ||
      currentSurfaceHash !== surfaceHash ||
      currentDriveSig !== desiredDriveSig ||
      (!latticeUseDynamicWeights && currentWeightHash !== desiredWeightHash) ||
      profileTag === "card";

    if (major) {
      latticeVolumePendingSinceRef.current = now;
    } else if (latticeVolumePendingSinceRef.current == null) {
      latticeVolumePendingSinceRef.current = now;
    }

    const pendingSince = latticeVolumePendingSinceRef.current ?? now;
    const elapsed = now - pendingSince;
    const debounceMs = profileTag === "card" ? 0 : 160;
    const maxWaitMs = profileTag === "card" ? 0 : 650;
    const delay = major || elapsed >= maxWaitMs ? 0 : debounceMs;

    if (latticeVolumeTimerRef.current != null) {
      window.clearTimeout(latticeVolumeTimerRef.current);
      latticeVolumeTimerRef.current = null;
    }

    const watchdog = latticeRebuildWatchdogs.current[profileTag] ?? latticeRebuildWatchdogs.current.preview;
    latticeVolumeTimerRef.current = window.setTimeout(() => {
      const latestKey = latticeVolumeWantedKeyRef.current;
      if (!latestKey || latestKey !== wantedKey) return;
      if (!latticeModeEnabled) return;
      const guardNow = typeof performance !== "undefined" ? performance.now() : Date.now();
      const guard = watchdog.shouldThrottle(guardNow);
      if (guard.blocked) {
        setLatticeWatchdogStats((prev) => ({
          blocked: prev.blocked + 1,
          lastBlockedAt: guardNow,
        }));
        return;
      }
      latticeVolumeBuildingRef.current = true;
      try {
        const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        const surface = strobe.surface;
        const histogram = strobe.histogram;
        if (!surface || !histogram) return;

        const strobeWeights = applySchedulerWeights(
          histogram,
          {
            totalSectors: surface.sectorCount ?? totalSectors,
            liveSectors,
            sectorCenter01,
            gaussianSigma,
            sectorFloor,
            splitEnabled,
            splitFrac,
            syncMode,
          },
          { surfaceHash: strobe.hash, basis: surface.basis },
        );
        const tWeights = typeof performance !== "undefined" ? performance.now() : Date.now();
        const sectorWeights = latticeUseDynamicWeights ? null : strobeWeights?.weights ?? null;
        const weightsHash = latticeUseDynamicWeights ? "dynamic" : strobeWeights?.hash;

        const perVertexDfdr =
          surface.positions.length >= (surface.vertexCount ?? 0) * 3
            ? (() => {
                const count = surface.vertexCount ?? Math.floor(surface.positions.length / 3);
                const arr = new Float32Array(count);
                const ax = Math.max(1e-6, axes[0]);
                const ay = Math.max(1e-6, axes[1]);
                const az = Math.max(1e-6, axes[2]);
                const invR = R > 1e-6 ? 1 / R : 0;
                for (let i = 0; i < count; i++) {
                  const base = i * 3;
                  const x = surface.positions[base] ?? 0;
                  const y = surface.positions[base + 1] ?? 0;
                  const z = surface.positions[base + 2] ?? 0;
                  const mx = x / ax;
                  const my = y / ay;
                  const mz = z / az;
                  const rNorm = Math.sqrt(mx * mx + my * my + mz * mz);
                  const cosX = rNorm > 1e-6 ? mx / rNorm : 0;
                  const rMetric = rNorm;
                  const df = dTopHatDr(rMetric, sigma, 1) * invR * cosX * beta;
                  arr[i] = Number.isFinite(df) ? df : 0;
                }
                return arr;
              })()
            : null;
        const tDfdr = typeof performance !== "undefined" ? performance.now() : Date.now();

        const volume = voxelizeHullSurfaceStrobe({
          frame,
          surface,
          sectorWeights,
          perVertexDfdr,
          gateScale: gate,
          driveScale: ampChain,
          driveLadder: { R, sigma, beta, gate, ampChain },
          shellThickness: frame.voxelSize_m * 1.25,
          sampleBudget: Math.floor(frame.voxelCount * 6),
          surfaceHash: strobe.hash,
          weightsHash,
          dfdrSignature: latticeDesiredDfdrSignature,
        });
        const tVoxel = typeof performance !== "undefined" ? performance.now() : Date.now();

        setSharedLattice({
          frame,
          preset: frame.preset,
          profileTag: frame.profileTag,
          strobe: {
            hash: strobe.hash,
            source: strobe.source,
            lod: strobe.lod,
            meshHash: surface.meshHash,
            basisSignature: latticeStrobeBuild?.basisSig,
            handedness: surface.handedness,
            sectorCount: surface.sectorCount,
            triangleCount: surface.triangleCount,
            vertexCount: surface.vertexCount,
            clampReasons: strobe.clampReasons,
            weightHash: strobeWeights?.hash,
            weightCacheHit: strobeWeights?.cacheHit ?? false,
            hist: histogram,
            weights: strobeWeights?.weights ?? null,
            coverage: strobeWeights
              ? {
                  area: strobeWeights.areaWeighted,
                  area01: strobeWeights.areaWeighted01,
                  vertices: strobeWeights.vertexWeighted,
                  vertices01: strobeWeights.vertexWeighted01,
                  triangles: strobeWeights.triangleWeighted,
                  triangles01: strobeWeights.triangleWeighted01,
                }
              : null,
          },
          volume: volume.volume ?? null,
        });

        if (volume.volume) {
          const msTotal = tVoxel - t0;
          const msWeights = tWeights - t0;
          const msDfdr = tDfdr - tWeights;
          const msVoxel = tVoxel - tDfdr;
          console.info("[Hull3D][lattice] volume build", {
            volumeHash: volume.volume.hash.slice(0, 16),
            cacheHit: volume.volume.cacheHit,
            dims: volume.volume.dims,
            voxelSize_m: volume.volume.voxelSize,
            voxelCount: volume.volume.dims[0] * volume.volume.dims[1] * volume.volume.dims[2],
            coveragePct: Math.round((volume.volume.stats.coverage ?? 0) * 1000) / 10,
            maxGate: volume.volume.stats.maxGate,
            weightsHash: strobeWeights?.hash ?? null,
            driveSig: volume.volume.metadata.driveLadder.signature,
            ms: {
              total: Math.round(msTotal * 10) / 10,
              weights: Math.round(msWeights * 10) / 10,
              dfdr: Math.round(msDfdr * 10) / 10,
              voxelize: Math.round(msVoxel * 10) / 10,
            },
          });
        }

        if (frame.clampReasons.length) {
          console.debug("[Hull3D][lattice] frame clamped", {
            preset: frame.preset,
            profileTag: frame.profileTag,
            clampReasons: frame.clampReasons,
            dims: frame.dims,
            voxelSize_m: frame.voxelSize_m,
            voxelCount: frame.voxelCount,
          });
        }
        if (strobe.clampReasons.length) {
          console.debug("[Hull3D][lattice] surface strobe clamp", {
            clampReasons: strobe.clampReasons,
            meshHash: strobe.surface?.meshHash,
            lod: strobe.lod,
          });
        }
        if (volume.clampReasons.length) {
          console.debug("[Hull3D][lattice] lattice volume clamp", {
            clampReasons: volume.clampReasons,
            volumeHash: volume.volume?.hash,
          });
        }
      } finally {
        latticeVolumeBuildingRef.current = false;
        latticeVolumePendingSinceRef.current = null;
        latticeVolumeTimerRef.current = null;
      }
    }, delay);

    return () => {
      if (latticeVolumeTimerRef.current != null) {
        window.clearTimeout(latticeVolumeTimerRef.current);
        latticeVolumeTimerRef.current = null;
      }
    };
  }, [
    latticeEnabled,
    latticeFrame,
    latticeStrobeBuild,
    latticeDesiredWeightHash,
    latticeDesiredDriveLadderSignature,
    latticeDesiredDfdrSignature,
    latticeUseDynamicWeights,
    profileTag,
    latticeModeEnabled,
    gate,
    ampChain,
    sigma,
    beta,
    R,
    axes,
    totalSectors,
    liveSectors,
    sectorCenter01,
    gaussianSigma,
    sectorFloor,
    splitEnabled,
    splitFrac,
    syncMode,
    sharedLatticeState?.strobe?.hash,
    sharedLatticeState?.strobe?.weightHash,
    sharedLatticeState?.volume,
    setSharedLattice,
  ]);

  const latticeSdfTimerRef = useRef<number | null>(null);
  const latticeSdfSeqRef = useRef(0);
  useEffect(() => {
    const frame = latticeSdfFrame;
    if (!frame || !hullPreview || !hullDims) {
      if (latticeSdfTimerRef.current != null) {
        window.clearTimeout(latticeSdfTimerRef.current);
        latticeSdfTimerRef.current = null;
      }
      latticeSdfSeqRef.current += 1;
      setSharedLattice({ sdf: null });
      return;
    }

    const delay = latticeRequireSdf || profileTag === "card" ? 0 : 350;
    if (latticeSdfTimerRef.current != null) {
      window.clearTimeout(latticeSdfTimerRef.current);
      latticeSdfTimerRef.current = null;
    }

    const seq = ++latticeSdfSeqRef.current;
    latticeSdfTimerRef.current = window.setTimeout(() => {
      const run = async () => {
        const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        const result = await buildHullDistanceGrid({
          payload: hullPreview,
          frame,
          band: frame.voxelSize_m * 2.5,
          surface: {
            lod: wireframeLod,
            targetDims: {
              Lx_m: hullDims.Lx_m,
              Ly_m: hullDims.Ly_m,
              Lz_m: hullDims.Lz_m,
            },
            totalSectors,
            ...wireframeBudgets,
          },
          maxSamples: Math.floor(frame.voxelCount * 0.5),
        });
        const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (seq !== latticeSdfSeqRef.current) return;
        setSharedLattice({ sdf: result.grid ?? null });
        if (result.grid) {
          console.info("[Hull3D][lattice] hull SDF build", {
            sdfKey: result.grid.key.slice(0, 16),
            cacheHit: result.grid.cacheHit,
            dims: result.grid.dims,
            voxelSize_m: result.grid.voxelSize,
            band_m: result.grid.band,
            voxelCoveragePct: Math.round((result.grid.stats?.voxelCoverage ?? 0) * 1000) / 10,
            triangleCoveragePct: Math.round((result.grid.stats?.triangleCoverage ?? 0) * 1000) / 10,
            maxAbsDistance_m: result.grid.stats?.maxAbsDistance,
            ms: Math.round((t1 - t0) * 10) / 10,
          });
        }
        if (result.clampReasons.length) {
          console.debug("[Hull3D][lattice] hull SDF clamp", {
            reasons: result.clampReasons,
            meshHash: result.grid?.meshHash ?? hullPreview.meshHash ?? hullPreview.mesh?.meshHash,
            cacheKey: result.key,
          });
        }
      };

      run().catch((error) => {
        console.error("[Hull3D][lattice] hull SDF build failed", error);
        if (seq === latticeSdfSeqRef.current) {
          setSharedLattice({ sdf: null });
        }
      });
    }, delay);

    return () => {
      if (latticeSdfTimerRef.current != null) {
        window.clearTimeout(latticeSdfTimerRef.current);
        latticeSdfTimerRef.current = null;
      }
    };
  }, [
    latticeSdfFrame,
    hullPreview,
    hullDims,
    wireframeLod,
    totalSectors,
    wireframeBudgets,
    latticeRequireSdf,
    profileTag,
    setSharedLattice,
  ]);

  const clampReasons = useMemo(() => {
    const reasons = new Set<string>();
    const frameReasons = sharedLatticeState?.frame?.clampReasons ?? [];
    const volumeReasons = sharedLatticeState?.volume?.clampReasons ?? [];
    const sdfReasons = sharedLatticeState?.sdf?.clampReasons ?? [];
    frameReasons.forEach((reason) => reasons.add(reason));
    volumeReasons.forEach((reason) => reasons.add(reason));
    sdfReasons.forEach((reason) => reasons.add(reason));
    return Array.from(reasons);
  }, [
    sharedLatticeState?.frame?.clampReasons,
    sharedLatticeState?.volume?.clampReasons,
    sharedLatticeState?.sdf?.clampReasons,
  ]);

  return {
    latticeFrame: sharedLatticeState?.frame ?? latticeFrame,
    latticeVolume: latticeVolumeForRenderer,
    latticeSdf: latticeSdfForRenderer,
    clampReasons,
    latticeGuardrails,
    latticeWatchdogStats,
    desiredDriveLadderSignature: latticeDesiredDriveLadderSignature,
  };
}
