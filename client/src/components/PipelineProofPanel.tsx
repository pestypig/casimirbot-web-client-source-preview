import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FrontProofsLedger } from "./FrontProofsLedger";
import { MODE_CONFIGS, useEnergyPipeline, type EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import { useProofPack } from "@/hooks/useProofPack";
import { useMathStageGate } from "@/hooks/useMathStageGate";
import {
  PROOF_PACK_STAGE_REQUIREMENTS,
  mergeProofPackIntoPipeline,
  isStrictProofPack,
  hasStrictProxy,
} from "@/lib/proof-pack";
import { STAGE_BADGE, STAGE_LABELS } from "@/lib/math-stage-gate";
import { cn } from "@/lib/utils";
import { openDocPanel } from "@/lib/docs/openDocPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { openNhm2ResearchTool } from "@/store/useNhm2ResearchToolStore";
import { useDesktopStore } from "@/store/useDesktopStore";
import CongruenceLegend from "@/components/common/CongruenceLegend";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

type PipelineStatus = {
  ok?: boolean;
  natarioConstraint?: boolean;
  dutyEffective_FR?: number;
  thetaScaleExpected?: number;
  thetaScale?: number;
  warp?: unknown;
  natario?: unknown;
  warpUniforms?: Record<string, number>;
  capturedAt?: string;
};

type GroundingSource = {
  kind?: string;
  id?: string;
  path?: string;
  extra?: unknown;
};

type ResonancePatchRef = {
  id: string;
  path: string;
  kind?: string;
  score?: number;
};

type PlanDebugPayload = {
  ok?: boolean;
  traceId?: string;
  goal?: string;
  personaId?: string;
  planDsl?: string;
  resonancePatchId?: string | null;
  resonancePatches?: ResonancePatchRef[];
  groundingSources?: GroundingSource[];
  createdAt?: string;
};

const fmtNumber = (value: unknown, digits = 3) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/a";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e4)) return n.toExponential(Math.max(0, digits - 1));
  return n.toFixed(digits).replace(/\.?0+$/, "");
};

const fmtPower = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/a";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)} MW`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)} kW`;
  return `${n.toFixed(1)} W`;
};

const PIPELINE_STATUS_URL = "/api/agi/pipeline/status";
const PLAN_DEBUG_URL = "/api/agi/pipeline/last-plan-debug";

export default function PipelineProofPanel() {
  const openPanel = useDesktopStore((store) => store.open);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [planDebug, setPlanDebug] = useState<PlanDebugPayload | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const { data: pipelineSnapshotRaw } = useEnergyPipeline({
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });
  const { data: proofPack } = useProofPack({
    refetchInterval: 5000,
    staleTime: 10000,
  });
  const stageGate = useMathStageGate(PROOF_PACK_STAGE_REQUIREMENTS, {
    staleTime: 30000,
  });
  const stageLabel = stageGate.pending
    ? "STAGE..."
    : STAGE_LABELS[stageGate.stage];
  const stageProxy = !stageGate.ok || !proofPack;
  const strictProof = isStrictProofPack(proofPack);
  const strictProxy =
    strictProof && (stageProxy || hasStrictProxy(proofPack));
  const pipelineSnapshot = useMemo(
    () => mergeProofPackIntoPipeline(proofPack, pipelineSnapshotRaw ?? null),
    [proofPack, pipelineSnapshotRaw],
  );
  const mechanical = (pipelineSnapshot as any)?.mechanical ?? {};
  const modeKey = (pipelineSnapshot as any)?.currentMode as keyof typeof MODE_CONFIGS | undefined;
  const modelMode = (pipelineSnapshot as any)?.modelMode as EnergyPipelineState["modelMode"] | undefined;
  const gapUsed_nm = mechanical?.casimirGap_nm ?? (pipelineSnapshot as any)?.gap_nm;
  const gapGuard_nm = mechanical?.constrainedGap_nm ?? mechanical?.recommendedGap_nm;
  const gapRequested_nm = mechanical?.requestedGap_nm;
  const hasRequestedGap = Number.isFinite(Number(gapRequested_nm));
  const physicsCap_W = (pipelineSnapshot as any)?.physicsCap_W;
  const P_cap_W = (pipelineSnapshot as any)?.P_cap_W ?? (pipelineSnapshot as any)?.mechGuard?.pCap_W;
  const P_target_W =
    (pipelineSnapshot as any)?.P_target_W ??
    (modeKey ? (MODE_CONFIGS as any)[modeKey]?.powerTarget_W : undefined);
  const P_avg_W =
    (pipelineSnapshot as any)?.P_avg_W ??
    (Number.isFinite((pipelineSnapshot as any)?.P_avg)
      ? Number((pipelineSnapshot as any).P_avg) * 1e6
      : undefined);
  const safetyFactor = Number.isFinite(mechanical?.mechSafetyFactor) ? Number(mechanical.mechSafetyFactor) : null;
  const safetyMin = Number.isFinite(mechanical?.safetyFactorMin) ? Number(mechanical.safetyFactorMin) : null;
  const sigmaAllow_Pa = Number.isFinite(mechanical?.sigmaAllow_Pa) ? Number(mechanical.sigmaAllow_Pa) : null;
  const loadPressure_Pa = Number.isFinite(mechanical?.loadPressure_Pa) ? Number(mechanical.loadPressure_Pa) : null;
  const fmtGPa = (pa: number | null) =>
    pa == null ? "n/a" : `${fmtNumber(pa / 1e9, 3)} GPa`;

  useEffect(() => {
    refresh();
  }, []);

  const refresh = () => {
    fetchPipelineStatus();
    fetchPlanDebug();
  };

  const fetchJson = async <T,>(url: string): Promise<T> => {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`status ${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`unexpected response (not JSON): ${text.slice(0, 160)}`);
    }
  };

  const fetchPipelineStatus = async () => {
    setStatusError(null);
    try {
      const payload = await fetchJson<PipelineStatus>(PIPELINE_STATUS_URL);
      setStatus(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(null);
      setStatusError(message);
    }
  };

  const fetchPlanDebug = async () => {
    setPlanError(null);
    try {
      const payload = await fetchJson<PlanDebugPayload>(PLAN_DEBUG_URL);
      setPlanDebug(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPlanDebug(null);
      setPlanError(message);
    }
  };

  const groundingSources = useMemo(() => planDebug?.groundingSources ?? [], [planDebug]);
  const resonancePatches = useMemo(() => planDebug?.resonancePatches ?? [], [planDebug]);

  return (
    <div className="flex h-full w-full flex-col bg-slate-950 text-slate-50">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Live diagnostic surface</p>
          <h1 className="text-xl font-semibold text-white">Pipeline Proof</h1>
          <p className="text-xs text-slate-400">Current pipeline and planner observations; selected-run NHM2 evidence remains separate.</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
            <span className="font-mono">proofpack.source=proof-pack</span>
            <span className="font-mono">proofpack.congruence=conditional</span>
            <span className="font-mono">pipeline.source=energy-pipeline</span>
          </div>
          <CongruenceLegend className="mt-1" compact />
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => openPanel("theory-badge-graph")}
            className="border-sky-700 text-sky-200">
            Theory Badge Graph
          </Button>
          <Badge
            variant="outline"
            className={cn(
              "border px-2 py-0.5 text-[10px]",
              STAGE_BADGE[stageGate.stage],
            )}
          >
            {stageLabel}
          </Badge>
          {strictProxy ? (
            <Badge className="border px-2 py-0.5 text-[10px] bg-rose-500/10 text-rose-100 border-rose-500/40">
              NON-ADMISSIBLE (STRICT)
            </Badge>
          ) : stageProxy ? (
            <Badge className="border px-2 py-0.5 text-[10px] bg-slate-800 text-slate-200">
              PROXY
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={refresh}
            className="rounded-md border border-cyan-400/60 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
          >
            Refresh
          </button>
        </div>
      </header>
      {strictProxy ? (
        <div className="border-b border-rose-500/20 bg-rose-500/5 px-5 py-3 text-xs text-rose-100">
          Strict congruence is enabled and proxy proof-pack entries were detected. This panel is informative
          but not admissible as a metric-derived proof surface.
        </div>
      ) : null}

      <div className="flex-1 overflow-auto p-5">
        <div className="mb-4">
          <FrontProofsLedger />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="xl:col-span-2">
            <InfoCard title="Spacetime lattice diagnostic" subtitle="On-demand 3D visualization and developer controls">
              <p className="mb-3 text-xs text-slate-400">
                Opening the lattice mounts a separate diagnostic with live GR requests and pipeline controls.
                Its visualization is not selected-run NHM2 proof.
              </p>
              <Button type="button" variant="outline" onClick={() => openNhm2ResearchTool("lattice")}
                className="border-slate-700 text-slate-100">
                Open lattice diagnostic
              </Button>
            </InfoCard>
          </div>
          <InfoCard title="Pipeline Status" subtitle={status?.capturedAt ? `Captured ${status.capturedAt}` : undefined}>
            {statusError ? (
              <ErrorText message={statusError} />
            ) : status ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <StatusBadge label="Natario constraint" value={status.natarioConstraint} />
                  <Metric label="DutyEffective_FR" value={status.dutyEffective_FR} />
                  <Metric label="thetaScaleExpected" value={status.thetaScaleExpected} />
                  <Metric label="thetaScale" value={status.thetaScale} />
                </div>
                {pipelineSnapshot ? (
                  <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs text-cyan-50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-cyan-100">
                        {modelMode === "raw"
                          ? "Profile: Mk.1 / raw (Casimir gap uses requested; no mechanical guard claim)"
                          : "Profile: lab / calibrated (Casimir gap uses mechanical guard; check its status)"}
                      </p>
                      {modelMode ? (
                        <span className="rounded-md border border-cyan-400/60 bg-cyan-400/10 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
                          {modelMode}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div className="font-mono text-emerald-100">
                        gap_used={fmtNumber(gapUsed_nm, 3)} nm | guard_gap={fmtNumber(gapGuard_nm, 2)} nm
                        {hasRequestedGap ? ` | requested=${fmtNumber(gapRequested_nm, 3)} nm` : ""}
                      </div>
                      <div className="font-mono text-emerald-100">
                        P_target={fmtPower(P_target_W)} | physics_cap={fmtPower(physicsCap_W)} | P_cap={fmtPower(P_cap_W)} | P_avg={fmtPower(P_avg_W)}
                      </div>
                      <div className="font-mono text-emerald-100">
                        S_mech={fmtNumber(safetyFactor, 3)} {safetyMin != null ? `(min ${fmtNumber(safetyMin, 2)})` : ""} | sigma_allow={fmtGPa(sigmaAllow_Pa)} | P_load={fmtGPa(loadPressure_Pa)}
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-300">
                      {modelMode === "raw"
                        ? "Casimir ladder runs at the requested gap; mechanical sweep still surfaces guardGap/mech_status."
                        : "Casimir ladder honors the mechanical guard gap; sweep reports the guard status."}
                      {modelMode === "raw" ? " Raw/Mk.1 assumes diamond+DLC tile stack; see docs/needle-hull-materials.md." : ""}
                    </p>
                  </div>
                ) : null}
                <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900/80 p-3 text-xs text-slate-200">
                  {JSON.stringify(status, null, 2)}
                </pre>
              </div>
            ) : (
              <Placeholder text="Loading pipeline statusâ€¦" />
            )}
          </InfoCard>

            <InfoCard
              title="Grounding Sources"
              subtitle={planDebug?.goal ? `Last goal: ${planDebug.goal}` : undefined}
            >
            {planError ? (
              <ErrorText message={planError} />
            ) : groundingSources.length ? (
              <ul className="space-y-2 text-sm">
                {groundingSources.map((source, idx) => (
                  <li key={`${source.kind ?? "src"}-${source.id ?? idx}-${source.path ?? idx}`}>
                    <GroundingRow source={source} />
                  </li>
                ))}
              </ul>
              ) : (
                <Placeholder text="No grounding data yet (debugSources off?)." />
              )}
            </InfoCard>

          </div>

        <InfoCard
          title="Last Plan & Resonance"
          subtitle={
            planDebug?.traceId
              ? `Trace ${planDebug.traceId}${planDebug.resonancePatchId ? ` Â· patch ${planDebug.resonancePatchId}` : ""}`
              : undefined
          }
        >
          {planError ? (
            <ErrorText message={planError} />
          ) : planDebug ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Plan DSL</h3>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-900/80 p-3 text-xs text-slate-200">
                  {planDebug.planDsl ?? "n/a"}
                </pre>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Resonance Patch Nodes</h3>
                {resonancePatches.length ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {resonancePatches.map((patch) => (
                      <li
                    key={`${patch.id}-${patch.path}`}
                    className="flex items-center justify-between rounded-md border border-white/5 bg-slate-900/60 px-3 py-2"
                  >
                    <div>
                      <p className="text-slate-100">{patch.path}</p>
                      <p className="text-[11px] text-slate-400">
                        {patch.id} {patch.kind ? `Â· ${patch.kind}` : ""}{" "}
                        {typeof patch.score === "number" ? `Â· score ${patch.score.toFixed(3)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
                  </ul>
                ) : (
                  <Placeholder text="No resonance nodes captured for the last plan." />
                )}
              </div>
            </div>
          ) : (
            <Placeholder text="Waiting for the next plan runâ€¦" />
          )}
        </InfoCard>

      </div>
    </div>
  );
}

function InfoCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/70 p-4 shadow-lg shadow-cyan-900/20">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">{subtitle}</p>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ label, value }: { label: string; value: unknown }) {
  const truthy = value === true;
  const falsy = value === false;
  const color = truthy ? "text-emerald-300 bg-emerald-500/10 ring-emerald-500/50" : falsy ? "text-amber-300 bg-amber-500/10 ring-amber-500/40" : "text-slate-200 bg-white/5 ring-white/15";
  const text = truthy ? "true" : falsy ? "false" : "n/a";
  return (
    <div className="rounded-lg border border-white/5 bg-white/5 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <span className={`mt-1 inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold ring-1 ${color}`}>
        {text}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string | null | undefined }) {
  const display =
    typeof value === "number" ? value.toFixed(4) : typeof value === "string" ? value : value ?? "n/a";
  return (
    <div className="rounded-lg border border-white/5 bg-white/5 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-50">{display}</p>
    </div>
  );
}

function ErrorText({ message }: { message: string }) {
  return <div className="rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Error: {message}</div>;
}

function Placeholder({ text }: { text: string }) {
  return <div className="rounded-md border border-white/5 bg-white/5 px-3 py-2 text-sm text-slate-400">{text}</div>;
}

function GroundingRow({ source }: { source: GroundingSource }) {
  const { path, kind, id } = source;
  const label = path ?? id ?? "(unknown)";
  const actionable = Boolean(path);
  const actionLabel = kind === "doc" ? "Open" : "Copy";

  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2">
      <div>
        <p className="text-sm text-slate-100">{label}</p>
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          {kind ?? "unknown"} {id && !label.includes(id) ? `Â· ${id}` : ""}
        </p>
      </div>
      {actionable && (
        <button
          type="button"
          onClick={() => openGroundingSource(source)}
          className="rounded-md border border-cyan-400/60 bg-cyan-500/10 px-2 py-1 text-[12px] text-cyan-100 transition hover:bg-cyan-500/20"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function openGroundingSource(source: GroundingSource) {
  if (!source.path) return;
  if (source.kind === "doc") {
    openDocPanel(source.path);
    return;
  }
  // Fallback: copy the path for non-doc sources and open http(s) targets if present.
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(source.path);
  }
  if (typeof window !== "undefined" && /^https?:\/\//i.test(source.path)) {
    window.open(source.path, "_blank", "noopener");
  }
}
