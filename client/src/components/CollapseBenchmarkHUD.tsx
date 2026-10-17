import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useHull3DSharedStore } from "@/store/useHull3DSharedStore";
import {
  CollapseBenchmarkResult,
  collapseBenchmarkDiagnostics,
  deriveRcFromLatticeSummary,
  hazardProbability,
  type TLatticeSummary,
} from "@shared/collapse-benchmark";
import type { EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import React, { useMemo } from "react";

type Props = {
  pipeline?: EnergyPipelineState | null;
  className?: string;
};

const FALLBACK = "--";

const fmt = (value: unknown, digits = 3) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return FALLBACK;
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e4)) return n.toExponential(Math.max(0, digits - 1));
  return n.toFixed(digits).replace(/\.?0+$/, "");
};

const fmtUnit = (value: unknown, unit: string, digits = 3) => {
  const out = fmt(value, digits);
  return out === FALLBACK ? FALLBACK : `${out} ${unit}`;
};

const shortHash = (hash: string | null | undefined, take = 18) => {
  if (!hash) return FALLBACK;
  const h = String(hash);
  if (h.length <= take) return h;
  return `${h.slice(0, take)}…`;
};

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded border border-white/5 bg-white/5 px-2 py-1 text-[11px] font-mono text-slate-100">
      <span className="text-slate-300">{label}</span>
      <span className="text-right text-slate-100">{value}</span>
    </div>
  );
}

function resolveTauMs(pipeline: EnergyPipelineState | null | undefined): number | null {
  const anyPipeline = pipeline as any;
  const tau = Number(
    anyPipeline?.dp_tau_estimate_ms ??
      anyPipeline?.lightCrossing?.tauLC_ms ??
      anyPipeline?.tauLC_ms ??
      anyPipeline?.tau_LC_ms ??
      anyPipeline?.tau_lc_ms,
  );
  return Number.isFinite(tau) && tau > 0 ? tau : null;
}

function resolveDtMs(pipeline: EnergyPipelineState | null | undefined): number {
  const anyPipeline = pipeline as any;
  const dt = Number(anyPipeline?.lightCrossing?.dwell_ms ?? anyPipeline?.dwell_ms ?? 50);
  if (!Number.isFinite(dt) || dt < 0) return 50;
  return dt;
}

type CollapseHudModel = {
  tau_ms: number;
  p_trigger: number;
  L_present_m: number;
  kappa_present_m2: number;
  lattice_generation_hash: string | null;
  source: "server" | "local";
  dp?: {
    deltaE_J: number;
    ell_m: number;
    overlap_fraction_min_mass: number;
    method: "exact" | "downsampled";
    tau_infinite: boolean;
  };
};

export default function CollapseBenchmarkHUD({ pipeline, className }: Props) {
  const latticeFrame = useHull3DSharedStore((s) => s.lattice.frame);
  const latticeVolumeHash = useHull3DSharedStore((s) => s.lattice.volume?.hash ?? null);
  const latticeCoverage = useHull3DSharedStore((s) => s.lattice.volume?.stats?.coverage);

  const tau_ms = resolveTauMs(pipeline);
  const dt_ms = resolveDtMs(pipeline);

  const latticeSummary: TLatticeSummary | null = useMemo(() => {
    if (!latticeFrame || !latticeVolumeHash) return null;
    const summary: TLatticeSummary = {
      lattice_generation_hash: latticeVolumeHash,
      dims: latticeFrame.dims,
      voxel_size_m: latticeFrame.voxelSize_m,
      lattice_size_m: latticeFrame.bounds.size,
      ...(typeof latticeCoverage === "number" && Number.isFinite(latticeCoverage)
        ? { coverage: Math.max(0, Math.min(1, latticeCoverage)) }
        : {}),
    };
    return summary;
  }, [latticeFrame, latticeVolumeHash, latticeCoverage]);

  const queryEnabled = Boolean(latticeSummary && tau_ms != null);

  const collapseQuery = useQuery({
    queryKey: [
      "/api/benchmarks/collapse",
      latticeSummary?.lattice_generation_hash ?? null,
      latticeSummary?.dims?.join("x") ?? null,
      latticeSummary?.voxel_size_m ?? null,
      tau_ms ?? null,
      dt_ms,
    ],
    enabled: queryEnabled,
    staleTime: 5_000,
    refetchInterval: 5_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!latticeSummary || tau_ms == null) {
        throw new Error("Collapse benchmark unavailable (missing lattice or tau).");
      }
      const body = {
        schema_version: "collapse_benchmark/1" as const,
        dt_ms,
        tau_ms,
        lattice: latticeSummary,
        expected_lattice_generation_hash: latticeSummary.lattice_generation_hash,
      };

      const response = await apiRequest("POST", "/api/benchmarks/collapse", body);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof (json as any)?.message === "string"
            ? String((json as any).message)
            : `HTTP ${response.status}`;
        const err = new Error(message) as Error & { status?: number; payload?: unknown };
        err.status = response.status;
        err.payload = json;
        throw err;
      }
      return CollapseBenchmarkResult.parse(json);
    },
  });

  const localFallback: CollapseHudModel | null = useMemo(() => {
    if (!latticeSummary || tau_ms == null) return null;
    const derived = deriveRcFromLatticeSummary(latticeSummary);
    const diagnostics = collapseBenchmarkDiagnostics({ tau_ms, r_c_m: derived.r_c_m });
    const p_trigger = hazardProbability(dt_ms, tau_ms);
    return {
      tau_ms,
      p_trigger,
      L_present_m: diagnostics.L_present_m,
      kappa_present_m2: diagnostics.kappa_present_m2,
      lattice_generation_hash: latticeSummary.lattice_generation_hash,
      source: "local",
    };
  }, [dt_ms, latticeSummary, tau_ms]);

  const serverResult = collapseQuery.data;
  const model: CollapseHudModel | null = serverResult
    ? {
        tau_ms: serverResult.tau_ms,
        p_trigger: serverResult.p_trigger,
        L_present_m: serverResult.L_present_m,
        kappa_present_m2: serverResult.kappa_present_m2,
        lattice_generation_hash: serverResult.lattice_generation_hash ?? null,
        source: "server",
        dp: serverResult.dp
          ? {
              deltaE_J: serverResult.dp.deltaE_J,
              ell_m: serverResult.dp.ell_m,
              overlap_fraction_min_mass: serverResult.dp.overlap_fraction_min_mass,
              method: serverResult.dp.method,
              tau_infinite: serverResult.dp.tau_infinite,
            }
          : undefined,
      }
    : localFallback;

  const currentHash = latticeSummary?.lattice_generation_hash ?? null;
  const stale = Boolean(currentHash && model?.lattice_generation_hash && currentHash !== model.lattice_generation_hash);

  const statusLabel = useMemo(() => {
    if (!latticeSummary) return "No lattice bound";
    if (tau_ms == null) return "Missing τ";
    if (collapseQuery.isFetching && collapseQuery.data) return "Refreshing…";
    if (collapseQuery.isLoading) return "Loading…";
    if (collapseQuery.isError && !collapseQuery.data) return "Backend offline";
    return stale ? "Stale" : "Live";
  }, [collapseQuery.data, collapseQuery.isError, collapseQuery.isFetching, collapseQuery.isLoading, latticeSummary, stale, tau_ms]);

  if (!model) {
    return (
      <Card className={`w-full max-w-sm rounded-xl border border-cyan-500/30 bg-slate-950/80 shadow-lg shadow-cyan-900/20 backdrop-blur-sm ${className ?? ""}`}>
        <CardContent className="space-y-2 p-3 text-slate-100">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wide text-cyan-300">Collapse benchmark</div>
            <div className="text-[11px] font-mono text-slate-400">{statusLabel}</div>
          </div>
          <div className="text-[12px] text-slate-300">Awaiting lattice + τ to compute collapse diagnostics.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`w-full max-w-sm rounded-xl border ${stale ? "border-amber-500/50" : "border-cyan-500/30"} bg-slate-950/80 shadow-lg shadow-cyan-900/20 backdrop-blur-sm ${className ?? ""}`}
    >
      <CardContent className="space-y-2 p-3 text-slate-100">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wide text-cyan-300">Collapse benchmark</div>
          <div className={`text-[11px] font-mono ${stale ? "text-amber-300" : "text-slate-400"}`}>
            {statusLabel} {model.source === "local" ? "(local)" : ""}
          </div>
        </div>
        <div className="grid gap-1">
          <StatRow label="tau_ms" value={fmtUnit(model.tau_ms, "ms", 3)} />
          <StatRow label="L_present_m" value={fmtUnit(model.L_present_m, "m", 4)} />
          <StatRow label="kappa_present_m2" value={fmtUnit(model.kappa_present_m2, "m^-2", 4)} />
          {model.dp ? (
            <>
              <StatRow label="dp_deltaE_J" value={fmtUnit(model.dp.deltaE_J, "J", 4)} />
              <StatRow label="dp_ell_m" value={fmtUnit(model.dp.ell_m, "m", 4)} />
              <StatRow label="dp_overlap" value={fmt(model.dp.overlap_fraction_min_mass, 3)} />
              <StatRow label="dp_method" value={model.dp.method} />
              {model.dp.tau_infinite ? <StatRow label="dp_tau" value="infinite" /> : null}
            </>
          ) : null}
          <StatRow
            label="lattice_generation_hash"
            value={
              <span className="flex flex-col items-end gap-0.5 text-right">
                <span>{shortHash(model.lattice_generation_hash, 22)}</span>
                {stale ? <span className="text-[10px] text-amber-300">mismatch vs bound {shortHash(currentHash, 14)}</span> : null}
              </span>
            }
          />
        </div>
        {collapseQuery.isError && collapseQuery.error && (
          <div className="text-[10px] text-amber-200">
            Backend error: {collapseQuery.error instanceof Error ? collapseQuery.error.message : String(collapseQuery.error)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
