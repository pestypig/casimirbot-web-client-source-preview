import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VacuumContractBadge from "@/components/VacuumContractBadge";
import { useNhm2SolveState } from "@/hooks/useNhm2SolveState";
import { openDocPanel } from "@/lib/docs/openDocPanel";
import { useStressEnergyBrick } from "@/hooks/useStressEnergyBrick";
import type { ObserverConditionKey, ObserverFrameKey } from "@/lib/stress-energy-brick";
import {
  buildWarpCalculatorInputPayload,
  runWarpCalculatorViaApi,
  type WarpCalculatorRunResponse,
} from "@/lib/warp-calculator";
import { cn } from "@/lib/utils";
import { launchHelixAskPrompt } from "@/lib/helix/ask-prompt-launch";
import { useDesktopStore } from "@/store/useDesktopStore";
import { openNhm2ResearchTool, useNhm2ResearchToolStore, type Nhm2ResearchTool } from "@/store/useNhm2ResearchToolStore";
import {
  buildNhm2Blocks,
  type Nhm2CalculatorSnapshot,
  type Nhm2ClaimBlock,
} from "@shared/nhm2-blocks";
import type { Nhm2SolveState } from "@shared/nhm2-solve-state";
import type { Nhm2CanonicalEvidence } from "@shared/nhm2-canonical-evidence";

const DriveGuardsPanel = lazy(() => import("@/components/DriveGuardsPanel"));
const PipelineProofPanel = lazy(() => import("@/components/PipelineProofPanel"));
const WarpProofPanel = lazy(() => import("@/components/WarpProofPanel"));
const AlcubierrePanel = lazy(() => import("@/components/AlcubierrePanel"));
const CasimirTilesPanel = lazy(() => import("@/components/panels/CasimirTilesPanel"));
const Nhm2DiagnosticShelf = lazy(() => import("@/components/nhm2/Nhm2DiagnosticShelf"));
const QiAutoTunerPanel = lazy(() => import("@/components/QiAutoTunerPanel"));
const TimeDilationLatticePanel = lazy(() => import("@/components/TimeDilationLatticePanel"));

type Tone = "good" | "warn" | "bad";

const toneClass: Record<Tone, string> = {
  good: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  bad: "border-rose-500/40 bg-rose-500/10 text-rose-200",
};

const statusClass = (value: string) => {
  if (value === "ok") return toneClass.good;
  if (value === "fail") return toneClass.bad;
  if (value === "proxy") return toneClass.warn;
  return "border-slate-700 bg-slate-900/60 text-slate-300";
};

const fmtNumber = (value: number | null | undefined, digits = 3, suffix = "") => {
  if (!Number.isFinite(value ?? NaN)) return "n/a";
  return `${Number(value).toFixed(digits)}${suffix}`;
};

const fmtInt = (value: number | null | undefined) => {
  if (!Number.isFinite(value ?? NaN)) return "n/a";
  return Math.round(Number(value)).toLocaleString();
};

const shortHash = (value: string | null | undefined) =>
  value && value.length > 18 ? `${value.slice(0, 12)}...${value.slice(-6)}` : value ?? "n/a";

function MetricCard(props: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        props.tone ? toneClass[props.tone] : "border-slate-800 bg-slate-950/70 text-slate-100",
      )}
    >
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-100">{props.value}</div>
      {props.hint ? <div className="mt-1 text-xs text-slate-400">{props.hint}</div> : null}
    </div>
  );
}

function Datum(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{props.label}</div>
      <div className={cn("mt-1 text-sm text-slate-100", props.mono ? "font-mono" : "")}>{props.value}</div>
    </div>
  );
}

function BlockCard(props: {
  block: Nhm2ClaimBlock;
  children: React.ReactNode;
  onOpenPanel?: (panelId: string) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const openJson = () => {
    const href = props.block.render?.href;
    if (typeof window !== "undefined" && href) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };
  const copyEndpoint = async () => {
    const href = props.block.render?.href;
    if (typeof window === "undefined" || !href) return;
    try {
      await window.navigator.clipboard.writeText(href);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1400);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 1600);
    }
  };
  const askAboutBlock = () => {
    launchHelixAskPrompt({
      question: `Using the live NHM2 block ${props.block.blockId}, explain the current ${props.block.title.toLowerCase()} state, preserve its status and authority tier exactly, and cite the block provenance.`,
      blockId: props.block.blockId,
      panelId: props.block.render?.panelId,
    });
  };
  const askBlockProvenance = () => {
    launchHelixAskPrompt({
      question: `Show the provenance for live NHM2 block ${props.block.blockId}, including claim IDs, authority tier, integrity, and source refs. Do not infer beyond the current block-backed state.`,
      blockId: props.block.blockId,
      panelId: props.block.render?.panelId,
    });
  };

  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-slate-100">{props.block.title}</CardTitle>
            <CardDescription>{props.block.summary}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn("border px-2 py-1", toneClass[props.block.status])}>
              {props.block.status.toUpperCase()}
            </Badge>
            <Badge variant="outline" className="border-slate-700 text-slate-200">
              {props.block.authorityTier}
            </Badge>
            <Badge variant="outline" className="border-slate-700 text-slate-300">
              {props.block.blockId}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-100"
              onClick={openJson}
            >
              Open JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-100"
              onClick={() => {
                void copyEndpoint();
              }}
            >
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy endpoint"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-100"
              onClick={askAboutBlock}
            >
              Ask Helix Ask
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-100"
              onClick={askBlockProvenance}
            >
              Ask provenance
            </Button>
            {props.block.render?.panelId && props.onOpenPanel ? (
              <Button
                variant="outline"
                size="sm"
                className="border-slate-700 text-slate-100"
                onClick={() => props.onOpenPanel?.(props.block.render?.panelId!)}
              >
                Open {props.block.render.panelTitle ?? props.block.render.panelId}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {props.children}
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <div className="flex flex-wrap gap-2">
            {props.block.claimIds.map((claimId) => (
              <Badge key={claimId} variant="outline" className="border-slate-700 text-slate-300">
                {claimId}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {props.block.provenance.map((entry) => (
              <Badge
                key={`${props.block.blockId}:${entry.label}:${entry.ref ?? "none"}`}
                variant="outline"
                className="border-cyan-500/30 text-cyan-100"
                title={entry.ref ?? undefined}
              >
                {entry.label}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type AuthorityBlockData = {
  overall: Nhm2SolveState["overall"];
  authority: Nhm2SolveState["authority"];
  pipeline: {
    claimTier: string | null;
    provenanceClass: string | null;
    currentMode: string | null;
    warpFieldType: string | null;
  };
};

type GeometryBlockData = {
  geometry: Nhm2SolveState["geometry"];
  timing: Nhm2SolveState["timing"];
  geometryFallback: Nhm2SolveState["pipeline"]["geometryFallback"];
};

type ProofBlockData = {
  proof: Nhm2SolveState["proof"];
  contract: Nhm2SolveState["contract"];
  vacuum: Nhm2SolveState["vacuum"];
};

type CalculatorBlockData = {
  calculator: Nhm2CalculatorSnapshot;
};

type RenderBlockData = {
  warpFieldType: string;
  geometryMatchesAuthority: boolean | null;
  geometryFallback: Nhm2SolveState["pipeline"]["geometryFallback"];
  chartStatus: string | null;
  chartReason: string | null;
};

export default function Nhm2SolveStatePanel() {
  const { state, vacuumContract, pipelineQuery } = useNhm2SolveState();
  const canonicalEvidence = useQuery<Nhm2CanonicalEvidence>({
    queryKey: ["nhm2-canonical-evidence"],
    queryFn: async () => {
      const response = await fetch("/api/nhm2/canonical-evidence", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`NHM2 evidence HTTP ${response.status}`);
      return response.json() as Promise<Nhm2CanonicalEvidence>;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const stressBrickQuery = useStressEnergyBrick({ quality: "medium", refetchMs: 1_500 });
  const observerRobustStats = stressBrickQuery.data?.stats?.observerRobust;
  const openPanel = useDesktopStore((store) => store.open);
  const selectedResearchTool = useNhm2ResearchToolStore((store) => store.selectedTool);
  const selectResearchTool = useNhm2ResearchToolStore((store) => store.selectTool);

  const [observerCondition, setObserverCondition] = useState<ObserverConditionKey>("nec");
  const [observerFrame, setObserverFrame] = useState<ObserverFrameKey>("Eulerian");
  const [injectCurvatureSignals, setInjectCurvatureSignals] = useState(true);
  const [running, setRunning] = useState(false);
  const [calculatorError, setCalculatorError] = useState<string | null>(null);
  const [calculatorResult, setCalculatorResult] = useState<WarpCalculatorRunResponse | null>(null);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);

  const calculatorSnapshot = useMemo<Nhm2CalculatorSnapshot | null>(
    () =>
      calculatorResult
        ? {
            decisionClass: calculatorResult.decisionClass,
            congruentSolvePass: calculatorResult.congruentSolvePass,
            marginRatioRaw: calculatorResult.marginRatioRaw,
            marginRatioRawComputed: calculatorResult.marginRatioRawComputed,
            outPath: calculatorResult.outPath ?? null,
            lastRunAt,
            observerCondition,
            observerFrame,
            injectCurvatureSignals,
          }
        : null,
    [
      calculatorResult,
      injectCurvatureSignals,
      lastRunAt,
      observerCondition,
      observerFrame,
    ],
  );

  const blocks = useMemo(
    () =>
      buildNhm2Blocks({
        state,
        calculatorSnapshot,
        generatedAt: lastRunAt ?? Date.now(),
      }),
    [state, calculatorSnapshot, lastRunAt],
  );
  const blockMap = useMemo(
    () => new Map(blocks.map((block) => [block.blockId, block])),
    [blocks],
  );

  const authorityBlock = blockMap.get("nhm2.authority-status")!;
  const geometryBlock = blockMap.get("nhm2.geometry-timing")!;
  const proofBlock = blockMap.get("nhm2.proof-guardrails")!;
  const calculatorBlock = blockMap.get("nhm2.calculator-snapshot")!;
  const renderBlock = blockMap.get("nhm2.render-status")!;

  const authorityData = authorityBlock.data as AuthorityBlockData;
  const geometryData = geometryBlock.data as GeometryBlockData;
  const proofData = proofBlock.data as ProofBlockData;
  const calculatorData = calculatorBlock.data as CalculatorBlockData;
  const renderData = renderBlock.data as RenderBlockData;

  const handleRunCalculator = async () => {
    if (running || !pipelineQuery.data) return;
    setRunning(true);
    setCalculatorError(null);
    try {
      const inputPayload = buildWarpCalculatorInputPayload({
        pipeline: (pipelineQuery.data as unknown as Record<string, unknown>) ?? null,
        observerCondition,
        observerFrame,
        observerRapidityCap: observerRobustStats?.rapidityCap ?? null,
        observerTypeITolerance: observerRobustStats?.typeI?.tolerance ?? null,
        label: "nhm2-solve-state-panel",
      });
      const response = await runWarpCalculatorViaApi({
        injectCurvatureSignals,
        persist: false,
        inputPayload,
      });
      setCalculatorResult(response);
      setLastRunAt(Date.now());
    } catch (error) {
      setCalculatorError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-full w-full overflow-auto bg-slate-950 p-4 text-slate-100">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300">NHM2 Solve State</div>
          <div className="text-2xl font-semibold text-white">Needle Hull Mark 2 live authority surface</div>
          <div className="max-w-3xl text-sm text-slate-400">
            One research entry point for live NHM2 diagnostics and the selected, run-bound campaign evidence.
            Artifact identity and claim locks are shown separately from live pipeline telemetry.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("border px-3 py-1 text-xs", toneClass[state.overall.tone])}>
            {state.overall.label}
          </Badge>
          <Badge variant="outline" className="border-slate-700 text-slate-200">
            {state.authority.solutionCategory}
          </Badge>
          <Badge variant="outline" className="border-slate-700 text-slate-300">
            {state.authority.profileVersion}
          </Badge>
        </div>
      </div>

      {state.overall.reasons.length ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <div className="mb-2 font-medium uppercase tracking-[0.18em] text-amber-200">
            Current cautions
          </div>
          <div className="flex flex-wrap gap-2">
            {state.overall.reasons.map((reason) => (
              <Badge key={reason} variant="outline" className="border-amber-400/40 text-amber-100">
                {reason}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <Card className="mt-4 border-cyan-500/30 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-slate-100">Archived shift-lapse diagnostic campaign</CardTitle>
          <CardDescription>
            Pinned June 2026 evidence from the canonical whitepaper, separate from the active spherical-v2 gate.
            SHA-256 values identify exact local artifacts; this panel does not independently replay the solver.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canonicalEvidence.isLoading ? <div className="text-sm text-slate-400">Reading campaign evidence…</div> : null}
          {canonicalEvidence.error ? (
            <div className="text-sm text-amber-200">{(canonicalEvidence.error as Error).message}</div>
          ) : null}
          {canonicalEvidence.data ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge className={cn("border", canonicalEvidence.data.status === "available" ? toneClass.good : toneClass.warn)}>
                  {canonicalEvidence.data.status === "available" ? "Diagnostic campaign artifact available" : canonicalEvidence.data.status}
                </Badge>
                <Badge variant="outline" className="border-slate-700 text-slate-200">Physical claim: closed</Badge>
                <Badge variant="outline" className="border-slate-700 text-slate-200">Transport claim: closed</Badge>
                <Badge variant="outline" className="border-slate-700 text-slate-200">Route ETA: closed</Badge>
              </div>
              <div className="break-all text-xs text-slate-400">Whitepaper: {canonicalEvidence.data.whitepaperRef}</div>
              <Button
                variant="outline"
                size="sm"
                className="border-sky-700 text-sky-200"
                onClick={() => {
                  if (canonicalEvidence.data) openDocPanel(canonicalEvidence.data.currentProgramRef);
                }}
              >
                Read the current spherical-v2 work program
              </Button>
              {canonicalEvidence.data.profile && canonicalEvidence.data.campaign ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Datum label="Profile" value={canonicalEvidence.data.profile.id} mono />
                  <Datum label="Centerline lapse α" value={String(canonicalEvidence.data.profile.alphaCenterline)} mono />
                  <Datum label="Clocking relation" value={canonicalEvidence.data.profile.clockingFormula} mono />
                  <Datum label="Campaign result" value={canonicalEvidence.data.campaign.campaignPass ? "PASS — diagnostic only" : "Not passed"} />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {Object.entries(canonicalEvidence.data.campaign?.gates ?? {}).map(([gate, pass]) => (
                  <Badge key={gate} className={cn("border", pass ? toneClass.good : toneClass.bad)}>
                    {gate}: {pass ? "pass" : "fail"}
                  </Badge>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {canonicalEvidence.data.components.map((component) => (
                  <div key={component.id} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
                    <div className="font-semibold text-slate-100">{component.id.replaceAll("_", " ")}</div>
                    <div className="text-slate-400">{component.status} · {component.contractVersion ?? "no contract"}</div>
                    <div className="break-all font-mono text-slate-500" title={component.sha256 ?? undefined}>
                      {component.sha256 ?? "no artifact hash"}
                    </div>
                  </div>
                ))}
              </div>
              {canonicalEvidence.data.limitations.map((limitation) => (
                <p key={limitation} className="text-xs text-amber-100/90">{limitation}</p>
              ))}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mt-4 border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-slate-100">Live closure and claim admission</CardTitle>
          <CardDescription>Current pipeline observations can differ from the archived campaign run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Datum label="Full tensor" value={state.closureStack.sameChartFullTensor.fullTensorComplete === true ? "complete" : "missing or incomplete"} />
            <Datum label="Wall source closure" value={state.closureStack.wallSourceClosure.pass === true ? "pass" : "missing or failing"} />
            <Datum label="Observer family" value={state.closureStack.observerRobustEnergyConditions.robustCheckComplete === true ? "complete" : "missing or incomplete"} />
            <Datum label="QEI worldlines" value={state.closureStack.qeiWorldlineDossier.dossierComplete === true ? "complete" : "missing or incomplete"} />
            <Datum label="Casimir material" value={state.closureStack.casimirMaterialReceipt.status ?? "unreceipted"} />
            <Datum label="Natario invariants" value={state.closureStack.natarioInvariantAudit.status ?? "unavailable"} />
            <Datum label="Claim admission" value={state.claimAdmission.status ?? "unavailable"} />
            <Datum label="Numerical reliability" value={state.claimAdmission.numericalReliabilityPassed === true ? "pass" : "not established"} />
          </div>
          {state.claimAdmission.blockers.length ? (
            <div className="text-xs text-amber-200">Blockers: {state.claimAdmission.blockers.join(", ")}</div>
          ) : null}
          <div className="text-xs text-slate-400">Physical and transport claim permission remain false in the shared solve-state contract.</div>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Authority"
          value={authorityData.authority.solutionCategory}
          hint={authorityData.pipeline.claimTier ?? authorityData.overall.label}
          tone={authorityBlock.status}
        />
        <MetricCard
          label="Geometry"
          value={
            geometryData.geometry.matchesAuthority == null
              ? "Awaiting live hull"
              : geometryData.geometry.matchesAuthority
                ? "Authority match"
                : "Drift detected"
          }
          hint={`tauLC ${fmtNumber(geometryData.timing.fullHullTauLcMs, 6, " ms")}`}
          tone={geometryBlock.status}
        />
        <MetricCard
          label="Proof"
          value={proofData.contract.certificateStatus ?? "n/a"}
          hint={`hash ${shortHash(proofData.contract.certificateHash)}`}
          tone={proofBlock.status}
        />
        <MetricCard
          label="Render"
          value={renderData.warpFieldType}
          hint={renderData.geometryFallback.applied ? "fallback active" : "authority-backed"}
          tone={renderBlock.status}
        />
        <MetricCard
          label="Calculator"
          value={calculatorData.calculator.decisionClass ?? "Ready"}
          hint={
            calculatorData.calculator.congruentSolvePass == null
              ? "Run a quick NHM2 snapshot"
              : `congruent ${calculatorData.calculator.congruentSolvePass ? "pass" : "fail"}`
          }
          tone={calculatorBlock.status}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <BlockCard block={authorityBlock} onOpenPanel={openPanel}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Datum label="Solution category" value={authorityData.authority.solutionCategory} />
            <Datum label="Profile version" value={authorityData.authority.profileVersion} mono />
            <Datum label="Contract status" value={authorityData.authority.contractStatus} />
            <Datum label="Generator version" value={authorityData.authority.generatorVersion} mono />
            <Datum label="Warp field type" value={authorityData.authority.warpFieldType} />
            <Datum label="metric T00 source" value={authorityData.authority.metricT00Source} mono />
            <Datum label="Claim tier" value={authorityData.pipeline.claimTier ?? "n/a"} mono />
            <Datum label="Provenance" value={authorityData.pipeline.provenanceClass ?? "n/a"} mono />
            <Datum label="Mode" value={authorityData.pipeline.currentMode ?? "n/a"} />
            <Datum label="Live field family" value={authorityData.pipeline.warpFieldType ?? "n/a"} mono />
          </div>
        </BlockCard>

        <BlockCard block={geometryBlock} onOpenPanel={openPanel}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Datum
              label="Authority hull"
              value={`${fmtInt(geometryData.geometry.authority.Lx_m)} x ${fmtInt(geometryData.geometry.authority.Ly_m)} x ${fmtInt(geometryData.geometry.authority.Lz_m)} m`}
              mono
            />
            <Datum
              label="Live hull"
              value={`${fmtNumber(geometryData.geometry.live.Lx_m, 1)} x ${fmtNumber(geometryData.geometry.live.Ly_m, 1)} x ${fmtNumber(geometryData.geometry.live.Lz_m, 1)} m`}
              mono
            />
            <Datum
              label="Full-hull tauLC"
              value={`${fmtNumber(geometryData.timing.fullHullTauLcMs, 6, " ms")} | ${fmtNumber(geometryData.timing.fullHullTauLcNs, 1, " ns")}`}
              mono
            />
            <Datum
              label="Reduced-order reference"
              value={`${fmtNumber(geometryData.timing.reducedOrderRadiusM, 3, " m")} | ${fmtNumber(geometryData.timing.reducedOrderTauLcMs, 3, " ms")}`}
              mono
            />
            <Datum
              label="Live tauLC"
              value={fmtNumber(geometryData.timing.liveTauLcMs, 6, " ms")}
              mono
            />
            <Datum
              label="Fallback mode"
              value={geometryData.geometryFallback.mode ?? "n/a"}
              mono
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              className={cn(
                "border px-2 py-1",
                geometryData.geometry.matchesAuthority
                  ? toneClass.good
                  : geometryData.geometry.matchesAuthority === false
                    ? toneClass.bad
                    : toneClass.warn,
              )}
            >
              {geometryData.geometry.matchesAuthority == null
                ? "live hull unavailable"
                : geometryData.geometry.matchesAuthority
                  ? "live hull matches authority"
                  : `mismatch ${geometryData.geometry.mismatchAxes.join("/")}`}
            </Badge>
            {geometryData.geometryFallback.applied ? (
              <Badge className={cn("border px-2 py-1", toneClass.warn)}>geometry fallback applied</Badge>
            ) : null}
            {geometryData.geometryFallback.blocked ? (
              <Badge className={cn("border px-2 py-1", toneClass.bad)}>geometry fallback blocked</Badge>
            ) : null}
          </div>
        </BlockCard>

        <BlockCard block={proofBlock} onOpenPanel={openPanel}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Datum label="Proof stage" value={proofData.proof.stage ?? "n/a"} mono />
            <Datum label="Metric adapter family" value={proofData.proof.metricAdapterFamily ?? "n/a"} mono />
            <Datum label="Chart status" value={proofData.proof.chartStatus ?? "n/a"} mono />
            <Datum label="Chart reason" value={proofData.proof.chartReason ?? "n/a"} mono />
            <Datum label="GR source" value={proofData.contract.source ?? "n/a"} mono />
            <Datum label="Brick status" value={proofData.contract.brickStatus ?? "n/a"} mono />
            <Datum label="Certificate hash" value={shortHash(proofData.contract.certificateHash)} mono />
            <Datum
              label="Integrity"
              value={
                proofData.contract.integrityOk == null
                  ? "n/a"
                  : proofData.contract.integrityOk
                    ? "OK"
                    : "FAIL"
              }
              mono
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={cn("border px-2 py-1", statusClass(proofData.contract.guardrails.fordRoman))}>
              Ford-Roman: {proofData.contract.guardrails.fordRoman}
            </Badge>
            <Badge className={cn("border px-2 py-1", statusClass(proofData.contract.guardrails.thetaAudit))}>
              theta: {proofData.contract.guardrails.thetaAudit}
            </Badge>
            <Badge className={cn("border px-2 py-1", statusClass(proofData.contract.guardrails.tsRatio))}>
              TS: {proofData.contract.guardrails.tsRatio}
            </Badge>
            <Badge className={cn("border px-2 py-1", statusClass(proofData.contract.guardrails.vdbBand))}>
              VdB: {proofData.contract.guardrails.vdbBand}
            </Badge>
            <Badge
              className={cn(
                "border px-2 py-1",
                !proofData.proof.available || proofData.proof.strictProxy
                  ? toneClass.bad
                  : proofData.proof.stageOk
                    ? toneClass.good
                    : toneClass.warn,
              )}
            >
              strict proxy: {proofData.proof.strictProxy ? "yes" : "no"}
            </Badge>
          </div>
          {proofData.contract.failingConstraints.length ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              <div className="mb-2 font-medium uppercase tracking-[0.18em] text-rose-200">
                Failing constraints
              </div>
              <div className="flex flex-wrap gap-2">
                {proofData.contract.failingConstraints.map((constraint) => (
                  <Badge key={constraint} variant="outline" className="border-rose-400/40 text-rose-100">
                    {constraint}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          <VacuumContractBadge contract={vacuumContract} />
        </BlockCard>

        <BlockCard block={renderBlock} onOpenPanel={openPanel}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Datum label="Viewer family" value={renderData.warpFieldType} mono />
            <Datum
              label="Geometry parity"
              value={
                renderData.geometryMatchesAuthority == null
                  ? "unavailable"
                  : renderData.geometryMatchesAuthority
                    ? "authority match"
                    : "drift"
              }
              mono
            />
            <Datum label="Chart status" value={renderData.chartStatus ?? "n/a"} mono />
            <Datum label="Chart reason" value={renderData.chartReason ?? "n/a"} mono />
            <Datum label="Fallback mode" value={renderData.geometryFallback.mode ?? "n/a"} mono />
            <Datum
              label="Fallback reasons"
              value={renderData.geometryFallback.reasons.join(", ") || "none"}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {renderData.geometryFallback.applied ? (
              <Badge className={cn("border px-2 py-1", toneClass.warn)}>viewer fallback applied</Badge>
            ) : null}
            {renderData.geometryFallback.blocked ? (
              <Badge className={cn("border px-2 py-1", toneClass.bad)}>viewer fallback blocked</Badge>
            ) : null}
            {!renderData.geometryFallback.applied && !renderData.geometryFallback.blocked ? (
              <Badge className={cn("border px-2 py-1", toneClass.good)}>authority-backed render path</Badge>
            ) : null}
          </div>
        </BlockCard>

        <Card className="border-slate-800 bg-slate-900/60 xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-slate-100">Calculator and Actions</CardTitle>
            <CardDescription>
              Quick diagnostic snapshots use the live pipeline. They do not update the archived campaign result.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
              <div>
                <Label className="text-xs text-slate-300">Observer condition</Label>
                <Select
                  value={observerCondition.toUpperCase()}
                  onValueChange={(value) => setObserverCondition(value.toLowerCase() as ObserverConditionKey)}
                >
                  <SelectTrigger className="mt-1 border-slate-700 bg-slate-950/70 text-slate-100">
                    <SelectValue placeholder="Condition" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 text-slate-100">
                    <SelectItem value="NEC">NEC</SelectItem>
                    <SelectItem value="WEC">WEC</SelectItem>
                    <SelectItem value="SEC">SEC</SelectItem>
                    <SelectItem value="DEC">DEC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-300">Observer frame</Label>
                <Select value={observerFrame} onValueChange={(value) => setObserverFrame(value as ObserverFrameKey)}>
                  <SelectTrigger className="mt-1 border-slate-700 bg-slate-950/70 text-slate-100">
                    <SelectValue placeholder="Frame" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 text-slate-100">
                    <SelectItem value="Eulerian">Eulerian</SelectItem>
                    <SelectItem value="Robust">Robust</SelectItem>
                    <SelectItem value="Delta">Delta</SelectItem>
                    <SelectItem value="Missed">Missed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <div className="pr-3">
                    <div className="text-xs font-medium text-slate-200">Inject curvature</div>
                    <div className="text-[11px] text-slate-400">Keeps quick snapshots close to campaign parity.</div>
                  </div>
                  <Switch
                    checked={injectCurvatureSignals}
                    onCheckedChange={(checked) => setInjectCurvatureSignals(Boolean(checked))}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                className="bg-cyan-600 text-white hover:bg-cyan-700"
                onClick={handleRunCalculator}
                disabled={!pipelineQuery.data || running}
              >
                {running ? "Running snapshot..." : "Run NHM2 calculator snapshot"}
              </Button>
              <Button variant="outline" className="border-slate-700 text-slate-100" onClick={() => openNhm2ResearchTool("lattice")}>
                Open lattice
              </Button>
            </div>

            <BlockCard block={calculatorBlock} onOpenPanel={openPanel}>
              {calculatorData.calculator.decisionClass ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Datum label="Decision" value={calculatorData.calculator.decisionClass ?? "n/a"} mono />
                  <Datum
                    label="Congruent solve"
                    value={
                      calculatorData.calculator.congruentSolvePass == null
                        ? "n/a"
                        : calculatorData.calculator.congruentSolvePass
                          ? "PASS"
                          : "FAIL"
                    }
                    mono
                  />
                  <Datum
                    label="marginRatioRaw"
                    value={fmtNumber(calculatorData.calculator.marginRatioRaw, 4)}
                    mono
                  />
                  <Datum
                    label="marginRatioRawComputed"
                    value={fmtNumber(calculatorData.calculator.marginRatioRawComputed, 4)}
                    mono
                  />
                  <Datum label="Artifact" value={calculatorData.calculator.outPath ?? "n/a"} mono />
                  <Datum
                    label="Last run"
                    value={
                      calculatorData.calculator.lastRunAt
                        ? new Date(calculatorData.calculator.lastRunAt).toLocaleTimeString()
                        : "n/a"
                    }
                  />
                </div>
              ) : (
                <div className="text-sm text-slate-400">No calculator snapshot has been run from this panel yet.</div>
              )}
              {calculatorError ? (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                  {calculatorError}
                </div>
              ) : null}
            </BlockCard>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4 border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-slate-100">Research tools</CardTitle>
          <CardDescription>Proof diagnostics, visualization, and tile telemetry remain scoped to their own evidence.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedResearchTool} onValueChange={(value) => selectResearchTool(value as Nhm2ResearchTool)}>
            <TabsList className="flex h-auto flex-wrap bg-slate-950/80">
              <TabsTrigger value="guards">Drive guards</TabsTrigger>
              <TabsTrigger value="pipeline">Pipeline proof</TabsTrigger>
              <TabsTrigger value="proof">Warp proof</TabsTrigger>
              <TabsTrigger value="viewer" data-nhm2-tool-trigger="viewer">Bubble viewer</TabsTrigger>
              <TabsTrigger value="lattice" data-nhm2-tool-trigger="lattice">Time dilation lattice</TabsTrigger>
              <TabsTrigger value="tiles">Casimir telemetry</TabsTrigger>
              <TabsTrigger value="qi-controller">QI controller</TabsTrigger>
              <TabsTrigger value="diagnostics">Live diagnostics</TabsTrigger>
            </TabsList>
            <Suspense fallback={<div className="p-4 text-sm text-slate-400">Loading research tool…</div>}>
              <TabsContent value="guards" data-nhm2-tool="guards"><DriveGuardsPanel /></TabsContent>
              <TabsContent value="pipeline"><PipelineProofPanel /></TabsContent>
              <TabsContent value="proof"><WarpProofPanel /></TabsContent>
              <TabsContent value="viewer" data-nhm2-tool="viewer"><AlcubierrePanel /></TabsContent>
              <TabsContent value="lattice" data-nhm2-tool="lattice"><TimeDilationLatticePanel /></TabsContent>
              <TabsContent value="tiles"><CasimirTilesPanel /></TabsContent>
              <TabsContent value="qi-controller"><QiAutoTunerPanel /></TabsContent>
              <TabsContent value="diagnostics"><Nhm2DiagnosticShelf /></TabsContent>
            </Suspense>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
