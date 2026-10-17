import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MathMaturityTree } from "@/components/MathMaturityTreePanel";
import { UniversalAuditTree } from "@/components/UniversalAuditTreePanel";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

type GrAgentLoopAttemptAudit = {
  iteration: number;
  label?: string;
  params?: Record<string, unknown>;
  residuals: {
    H_rms?: number;
    M_rms?: number;
    H_maxAbs?: number;
    M_maxAbs?: number;
  };
  notes?: string[];
  gateStatus: "pass" | "fail" | "unknown";
  certificateStatus: string;
  certificateHash: string | null;
  pass: boolean;
  accepted: boolean;
};

type GrAgentLoopRunRecord = {
  id: string;
  seq: number;
  ts: string;
  durationMs: number;
  accepted: boolean;
  acceptedIteration?: number;
  options?: Record<string, unknown>;
  attempts: GrAgentLoopAttemptAudit[];
  patches?: Array<{
    fromIteration: number;
    toIteration: number;
    accepted?: boolean;
    changes: Array<{ key: string; from?: unknown; to?: unknown; change: string }>;
  }>;
};

type GrAgentLoopRunsResponse = {
  runs: GrAgentLoopRunRecord[];
  limit?: number;
};

type GrAgentLoopKpiResponse = {
  kpis: {
    window: { runs: number; accepted: number; attempts: number; violations: number };
    successRate: number | null;
    constraintViolationRate: number | null;
    timeToGreenMs: { avg: number | null; last: number | null };
    perfTrend: { recentAvgMs: number | null; priorAvgMs: number | null; deltaPct: number | null; trend: string };
  };
};

const RUNS_LIMIT = 30;

const RESIDUAL_KEYS = ["H_rms", "M_rms", "H_maxAbs", "M_maxAbs"] as const;
type ResidualKey = (typeof RESIDUAL_KEYS)[number];

const formatResidualValue = (value?: number) => {
  if (!Number.isFinite(value)) return "--";
  const v = value as number;
  return Math.abs(v) < 1e-3 || Math.abs(v) > 1e3 ? v.toExponential(2) : v.toFixed(4);
};

const formatDurationMs = (value?: number) => {
  if (!Number.isFinite(value)) return "n/a";
  return `${Math.round(value as number)} ms`;
};

const formatTimestamp = (value?: string) => {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleTimeString();
};

const formatParamValue = (value: unknown) => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "n/a";
    const abs = Math.abs(value);
    return abs !== 0 && (abs < 1e-3 || abs > 1e3)
      ? value.toExponential(2)
      : value.toFixed(4);
  }
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  try {
    const json = JSON.stringify(value);
    if (!json) return "n/a";
    return json.length > 60 ? `${json.slice(0, 57)}...` : json;
  } catch {
    return "unprintable";
  }
};

const formatParamsSummary = (params?: Record<string, unknown>) => {
  if (!params || Object.keys(params).length === 0) return "no params";
  const entries = Object.entries(params);
  const shown = entries.slice(0, 4).map(
    ([key, value]) => `${key}=${formatParamValue(value)}`,
  );
  if (entries.length > 4) {
    shown.push(`+${entries.length - 4} more`);
  }
  return shown.join(" ");
};

const buildSparkline = (values: number[], width = 120, height = 28) => {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, idx) => {
    const x = (idx / Math.max(1, values.length - 1)) * width;
    const y = height - ((value - min) / span) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return { path: `M${points.join(" L")}`, min, max };
};

const formatGateValue = (value?: number) => {
  if (!Number.isFinite(value)) return "--";
  return value ? "pass" : "fail";
};

const formatDeltaValue = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  const abs = Math.abs(value);
  const formatted =
    abs < 1e-3 || abs > 1e3 ? value.toExponential(2) : value.toFixed(4);
  return `${sign}${formatted}`;
};

const formatAttemptNotes = (notes?: string[]) => {
  if (!notes || notes.length === 0) return null;
  const visible = notes.slice(0, 2).join("; ");
  return notes.length > 2 ? `${visible} +${notes.length - 2}` : visible;
};

const summarizeResiduals = (residuals?: GrAgentLoopAttemptAudit["residuals"]) => {
  if (!residuals) return "no residuals";
  let topKey: ResidualKey | null = null;
  let topValue = 0;
  for (const key of RESIDUAL_KEYS) {
    const value = residuals[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const abs = Math.abs(value);
    if (abs >= Math.abs(topValue)) {
      topKey = key;
      topValue = value;
    }
  }
  if (!topKey) return "no residuals";
  return `${topKey}=${formatResidualValue(topValue)}`;
};

const pickRepresentativeAttempt = (run?: GrAgentLoopRunRecord | null) => {
  if (!run || run.attempts.length === 0) return null;
  return run.attempts.find((attempt) => attempt.accepted) ?? run.attempts[run.attempts.length - 1];
};

function TrendSparkline({
  label,
  values,
  formatValue,
}: {
  label: string;
  values: Array<number | undefined>;
  formatValue?: (value?: number) => string;
}) {
  const cleaned = values.filter((value): value is number => Number.isFinite(value));
  const sparkline = buildSparkline(cleaned);
  const last = cleaned.length ? cleaned[cleaned.length - 1] : undefined;
  const formatted = formatValue ? formatValue(last) : formatResidualValue(last);
  return (
    <div className="rounded border border-slate-800/70 bg-slate-900/60 px-3 py-2">
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-200">{formatted}</span>
      </div>
      {sparkline ? (
        <svg
          viewBox="0 0 120 28"
          className="mt-2 h-7 w-full"
          role="img"
          aria-label={`${label} trend`}
        >
          <path
            d={sparkline.path}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-cyan-300"
          />
        </svg>
      ) : (
        <div className="mt-2 text-[10px] text-slate-500">No residual data</div>
      )}
    </div>
  );
}

type GrAgentLoopAuditPanelProps = {
  variant?: "panel" | "embedded";
  className?: string;
};

export default function GrAgentLoopAuditPanel({
  variant = "panel",
  className = "",
}: GrAgentLoopAuditPanelProps) {
  const queryClient = useQueryClient();
  const runQueryKey = `/api/helix/gr-agent-loop?limit=${RUNS_LIMIT}`;
  const { data, isFetching, isError } = useQuery({
    queryKey: [runQueryKey],
    refetchInterval: 4000,
  });
  const { data: kpiData, isError: kpiError } = useQuery({
    queryKey: ["/api/helix/gr-agent-loop/kpis?limit=50"],
    refetchInterval: 6000,
  });
  const kpis = (kpiData as GrAgentLoopKpiResponse | undefined)?.kpis;
  const [isRunning, setIsRunning] = useState(false);
  const runs = ((data as GrAgentLoopRunsResponse | undefined)?.runs ?? []).filter(
    Boolean,
  );
  const latest = runs[0];
  const attempts = latest?.attempts ?? [];
  const acceptedAttempt =
    attempts.find((attempt) => attempt.accepted) ?? null;

  const residualSeries = useMemo(() => {
    const base = RESIDUAL_KEYS.reduce(
      (acc, key) => ({ ...acc, [key]: [] as Array<number | undefined> }),
      {} as Record<ResidualKey, Array<number | undefined>>,
    );
    for (const attempt of attempts) {
      for (const key of RESIDUAL_KEYS) {
        base[key].push(attempt.residuals?.[key]);
      }
    }
    return base;
  }, [attempts]);

  const runsChrono = useMemo(() => [...runs].reverse(), [runs]);
  const patchHistory = runs.flatMap((run) =>
    (run.patches ?? []).map((patch) => ({ run, patch })),
  ).slice(0, 8);

  const runTrendSeries = useMemo(() => {
    const base = RESIDUAL_KEYS.reduce(
      (acc, key) => ({ ...acc, [key]: [] as Array<number | undefined> }),
      {} as Record<ResidualKey, Array<number | undefined>>,
    );
    const gateSeries: Array<number | undefined> = [];
    for (const run of runsChrono) {
      const attempt = pickRepresentativeAttempt(run);
      for (const key of RESIDUAL_KEYS) {
        base[key].push(attempt?.residuals?.[key]);
      }
      gateSeries.push(
        attempt ? (attempt.gateStatus === "pass" ? 1 : 0) : undefined,
      );
    }
    return { residuals: base, gateSeries };
  }, [runsChrono]);

  const gatePassRate = useMemo(() => {
    const series = runTrendSeries.gateSeries.filter(
      (value): value is number => Number.isFinite(value),
    );
    if (series.length === 0) return null;
    const passes = series.filter((value) => value >= 1).length;
    return passes / series.length;
  }, [runTrendSeries]);

  const acceptedHistory = useMemo(
    () =>
      runs
        .map((run) => {
          const accepted = run.attempts.find((attempt) => attempt.accepted);
          return accepted ? { run, attempt: accepted } : null;
        })
        .filter((entry): entry is { run: GrAgentLoopRunRecord; attempt: GrAgentLoopAttemptAudit } =>
          Boolean(entry),
        ),
    [runs],
  );

  const failureHistory = useMemo(() => {
    const entries: Array<{
      run: GrAgentLoopRunRecord;
      attempt: GrAgentLoopAttemptAudit;
    }> = [];
    for (const run of runs) {
      for (const attempt of run.attempts) {
        if (!attempt.accepted) {
          entries.push({ run, attempt });
        }
      }
    }
    return entries;
  }, [runs]);

  const [leftRunId, setLeftRunId] = useState<string | null>(null);
  const [rightRunId, setRightRunId] = useState<string | null>(null);
  const [treeOverlay, setTreeOverlay] = useState<"math" | "audit">("math");

  useEffect(() => {
    if (!leftRunId && runs.length > 0) {
      setLeftRunId(runs[0].id);
    }
    if (!rightRunId && runs.length > 1) {
      setRightRunId(runs[1].id);
    }
  }, [runs, leftRunId, rightRunId]);

  const leftRun = useMemo(
    () => runs.find((run) => run.id === leftRunId) ?? null,
    [runs, leftRunId],
  );
  const rightRun = useMemo(
    () => runs.find((run) => run.id === rightRunId) ?? null,
    [runs, rightRunId],
  );
  const leftAttempt = useMemo(
    () => pickRepresentativeAttempt(leftRun),
    [leftRun],
  );
  const rightAttempt = useMemo(
    () => pickRepresentativeAttempt(rightRun),
    [rightRun],
  );

  const paramDiffs = useMemo(() => {
    const leftParams = leftAttempt?.params ?? {};
    const rightParams = rightAttempt?.params ?? {};
    const keys = new Set([
      ...Object.keys(leftParams),
      ...Object.keys(rightParams),
    ]);
    return Array.from(keys).map((key) => {
      const leftValue = (leftParams as Record<string, unknown>)[key];
      const rightValue = (rightParams as Record<string, unknown>)[key];
      const delta =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? rightValue - leftValue
          : undefined;
      return { key, leftValue, rightValue, delta };
    });
  }, [leftAttempt, rightAttempt]);

  const residualDiffs = useMemo(
    () =>
      RESIDUAL_KEYS.map((key) => {
        const leftValue = leftAttempt?.residuals?.[key];
        const rightValue = rightAttempt?.residuals?.[key];
        const delta =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? rightValue - leftValue
            : undefined;
        return { key, leftValue, rightValue, delta };
      }),
    [leftAttempt, rightAttempt],
  );

  const handleRunLoop = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      const response = await apiRequest("POST", "/api/helix/gr-agent-loop", {});
      const payload = (await response.json()) as { run?: GrAgentLoopRunRecord };
      const run = payload?.run;
      await queryClient.invalidateQueries({
        queryKey: [runQueryKey],
      });
      toast({
        title: run?.accepted ? "GR agent loop accepted" : "GR agent loop complete",
        description: run
          ? `Run #${run.seq} ${run.accepted ? "accepted" : "rejected"}${run.acceptedIteration !== undefined ? ` (iter ${run.acceptedIteration})` : ""}`
          : "Run complete.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "GR agent loop failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, queryClient, runQueryKey]);

  const statusBadge = (
    <Badge variant="outline" className="text-[10px]">
      {isFetching ? "Refreshing" : "Live"}
    </Badge>
  );

  const runButton = (
    <Button
      size="sm"
      variant="outline"
      onClick={handleRunLoop}
      disabled={isRunning}
      className="border-cyan-500/40 text-cyan-200 hover:border-cyan-400 hover:text-cyan-100"
    >
      {isRunning ? "Running..." : "Run loop"}
    </Button>
  );

  const treeOverlayView = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-slate-500">
        <span>Math maturity and universal audit sources</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={treeOverlay === "math" ? "secondary" : "outline"}
            onClick={() => setTreeOverlay("math")} className="text-[10px] uppercase">
            Math
          </Button>
          <Button size="sm" variant={treeOverlay === "audit" ? "secondary" : "outline"}
            onClick={() => setTreeOverlay("audit")} className="text-[10px] uppercase">
            Audit
          </Button>
        </div>
      </div>
      {treeOverlay === "math" ? <MathMaturityTree variant="embedded" /> : <UniversalAuditTree variant="embedded" />}
    </div>
  );

  const content = (showHeader: boolean) => (
    <div className="space-y-3">
      <p className="text-[11px] text-amber-200">
        Generic GR agent-loop runs and gate trends are operational diagnostics. Their accepted status and
        certificate labels do not establish a selected-run NHM2 solve or physical viability.
      </p>
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>GR agent loop</span>
          <div className="flex items-center gap-2">
            {statusBadge}
            {runButton}
          </div>
        </div>
      ) : null}
      {isError ? (
        <div className="text-[11px] text-rose-300">
          Failed to load GR agent loop runs.
        </div>
      ) : !latest ? (
        <div className="text-[11px] text-slate-500">No GR agent loop runs yet.</div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
              <Badge
                className={
                  latest.accepted
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-rose-500/20 text-rose-200"
                }
              >
                {latest.accepted ? "ACCEPTED" : "REJECTED"}
              </Badge>
              <span>run #{latest.seq}</span>
              <span className="text-slate-500">{formatDurationMs(latest.durationMs)}</span>
              <span className="text-slate-500">{formatTimestamp(latest.ts)}</span>
              {latest.acceptedIteration !== undefined && (
                <span className="text-slate-400">
                  accepted iter {latest.acceptedIteration}
                </span>
              )}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {RESIDUAL_KEYS.map((key) => (
                <TrendSparkline key={key} label={key} values={residualSeries[key]} />
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-3 text-[11px] text-slate-300">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Loop KPIs · last 50 runs</div>
            {kpiError ? <p className="mt-2 text-rose-300">KPI endpoint unavailable.</p> : !kpis ? (
              <p className="mt-2 text-slate-500">No KPI summary yet.</p>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>Accepted: {kpis.window.accepted}/{kpis.window.runs} ({kpis.successRate == null ? "n/a" : `${(kpis.successRate * 100).toFixed(1)}%`})</div>
                <div>Violations: {kpis.window.violations}/{kpis.window.attempts} ({kpis.constraintViolationRate == null ? "n/a" : `${(kpis.constraintViolationRate * 100).toFixed(1)}%`})</div>
                <div>Time to green: {formatDurationMs(kpis.timeToGreenMs.avg ?? undefined)} avg; {formatDurationMs(kpis.timeToGreenMs.last ?? undefined)} last</div>
                <div>Performance: {kpis.perfTrend.trend}; {formatDurationMs(kpis.perfTrend.recentAvgMs ?? undefined)} recent vs {formatDurationMs(kpis.perfTrend.priorAvgMs ?? undefined)} prior</div>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
              <span>Residual + gate trends</span>
              <span className="text-slate-400">
                gate pass {gatePassRate != null ? `${Math.round(gatePassRate * 100)}%` : "n/a"}
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {RESIDUAL_KEYS.map((key) => (
                <TrendSparkline
                  key={`${key}-trend`}
                  label={`${key} (runs)`}
                  values={runTrendSeries.residuals[key]}
                />
              ))}
              <TrendSparkline
                label="gate pass"
                values={runTrendSeries.gateSeries}
                formatValue={formatGateValue}
              />
            </div>
          </div>
          <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500">
              Accepted config
              <Badge
                variant="outline"
                className="text-[9px] uppercase tracking-wide text-slate-300"
              >
                {acceptedAttempt ? `iter ${acceptedAttempt.iteration}` : "none"}
              </Badge>
            </div>
            <div className="mt-2 font-mono text-[11px] text-slate-200">
              {acceptedAttempt
                ? formatParamsSummary(acceptedAttempt.params)
                : "No accepted attempt in latest run."}
            </div>
            {acceptedAttempt && (
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                <span>label: {acceptedAttempt.label ?? "n/a"}</span>
                <span>gate: {acceptedAttempt.gateStatus}</span>
                <span>cert: {acceptedAttempt.certificateStatus}</span>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              Accepted config history
            </div>
            <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-300">
              {acceptedHistory.length === 0 ? (
                <div className="text-slate-500">No accepted configs yet.</div>
              ) : (
                acceptedHistory.slice(0, 6).map(({ run, attempt }) => (
                  <div
                    key={`${run.id}-${attempt.iteration}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="text-slate-400">#{run.seq}</span>
                    <span className="text-emerald-300">accepted</span>
                    <span className="text-slate-500">{formatTimestamp(run.ts)}</span>
                    <span className="text-slate-500">iter {attempt.iteration}</span>
                    <span className="text-slate-400">
                      {formatParamsSummary(attempt.params)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              Failures + patches
            </div>
            <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-300">
              {failureHistory.length === 0 ? (
                <div className="text-slate-500">No failed attempts yet.</div>
              ) : (
                failureHistory.slice(0, 8).map(({ run, attempt }) => (
                  <div
                    key={`${run.id}-${attempt.iteration}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="text-slate-400">#{run.seq}</span>
                    <span className="text-rose-300">{attempt.gateStatus}</span>
                    <span className="text-slate-500">iter {attempt.iteration}</span>
                    <span className="text-slate-500">
                      {summarizeResiduals(attempt.residuals)}
                    </span>
                    {formatAttemptNotes(attempt.notes) && (
                      <span className="text-amber-300">
                        {formatAttemptNotes(attempt.notes)}
                      </span>
                    )}
                    <span className="text-slate-400">
                      patch {formatParamsSummary(attempt.params)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Recorded parameter patches</div>
            <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-300">
              {patchHistory.length ? patchHistory.map(({ run, patch }, index) => (
                <div key={`${run.id}-${patch.fromIteration}-${patch.toIteration}-${index}`}>
                  #{run.seq} iter {patch.fromIteration}→{patch.toIteration} {patch.accepted ? "accepted" : "candidate"}: {patch.changes.length
                    ? patch.changes.map((change) => `${change.key} ${formatParamValue(change.from)}→${formatParamValue(change.to)}`).join("; ")
                    : "no recorded changes"}
                </div>
              )) : <div className="text-slate-500">No recorded patches.</div>}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              Run comparison
            </div>
            {runs.length < 2 ? (
              <div className="mt-2 text-[11px] text-slate-500">
                Need at least two runs to compare.
              </div>
            ) : (
              <div className="mt-2 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-[10px] text-slate-400">
                    Left run
                    <select
                      className="mt-1 w-full rounded border border-slate-800 bg-slate-950/60 px-2 py-1 text-[11px] text-slate-200"
                      value={leftRunId ?? ""}
                      onChange={(event) => setLeftRunId(event.target.value)}
                    >
                      {runs.map((run) => (
                        <option key={run.id} value={run.id}>
                          #{run.seq} {run.accepted ? "accepted" : "rejected"}{" "}
                          {formatTimestamp(run.ts)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] text-slate-400">
                    Right run
                    <select
                      className="mt-1 w-full rounded border border-slate-800 bg-slate-950/60 px-2 py-1 text-[11px] text-slate-200"
                      value={rightRunId ?? ""}
                      onChange={(event) => setRightRunId(event.target.value)}
                    >
                      {runs.map((run) => (
                        <option key={run.id} value={run.id}>
                          #{run.seq} {run.accepted ? "accepted" : "rejected"}{" "}
                          {formatTimestamp(run.ts)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded border border-slate-800/70 bg-slate-950/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Left summary
                    </div>
                    {leftRun ? (
                      <div className="mt-2 space-y-1 text-[10px] text-slate-300">
                        <div>
                          <span className="text-slate-400">#{leftRun.seq}</span>{" "}
                          <span
                            className={
                              leftRun.accepted ? "text-emerald-300" : "text-rose-300"
                            }
                          >
                            {leftRun.accepted ? "accepted" : "rejected"}
                          </span>
                        </div>
                        <div className="text-slate-500">
                          {formatDurationMs(leftRun.durationMs)} |{" "}
                          {formatTimestamp(leftRun.ts)}
                        </div>
                        <div className="text-slate-500">
                          gate {leftAttempt?.gateStatus ?? "n/a"} |{" "}
                          {summarizeResiduals(leftAttempt?.residuals)}
                        </div>
                        <div className="font-mono text-slate-200">
                          {leftAttempt
                            ? formatParamsSummary(leftAttempt.params)
                            : "no params"}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Select a run.
                      </div>
                    )}
                  </div>
                  <div className="rounded border border-slate-800/70 bg-slate-950/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Right summary
                    </div>
                    {rightRun ? (
                      <div className="mt-2 space-y-1 text-[10px] text-slate-300">
                        <div>
                          <span className="text-slate-400">#{rightRun.seq}</span>{" "}
                          <span
                            className={
                              rightRun.accepted ? "text-emerald-300" : "text-rose-300"
                            }
                          >
                            {rightRun.accepted ? "accepted" : "rejected"}
                          </span>
                        </div>
                        <div className="text-slate-500">
                          {formatDurationMs(rightRun.durationMs)} |{" "}
                          {formatTimestamp(rightRun.ts)}
                        </div>
                        <div className="text-slate-500">
                          gate {rightAttempt?.gateStatus ?? "n/a"} |{" "}
                          {summarizeResiduals(rightAttempt?.residuals)}
                        </div>
                        <div className="font-mono text-slate-200">
                          {rightAttempt
                            ? formatParamsSummary(rightAttempt.params)
                            : "no params"}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Select a run.
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded border border-slate-800/70 bg-slate-950/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Residual deltas
                    </div>
                    <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-300">
                      {residualDiffs.map((item) => (
                        <div key={`residual-${item.key}`} className="flex flex-wrap gap-2">
                          <span className="text-slate-400">{item.key}</span>
                          <span>{formatResidualValue(item.leftValue)}</span>
                          <span className="text-slate-500">vs</span>
                          <span>{formatResidualValue(item.rightValue)}</span>
                          <span className="text-slate-500">delta</span>
                          <span className="text-slate-200">
                            {formatDeltaValue(item.delta)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded border border-slate-800/70 bg-slate-950/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Param deltas
                    </div>
                    <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-300">
                      {paramDiffs.length === 0 ? (
                        <div className="text-slate-500">No params to compare.</div>
                      ) : (
                        paramDiffs.map((item) => (
                          <div key={`param-${item.key}`} className="flex flex-wrap gap-2">
                            <span className="text-slate-400">{item.key}</span>
                            <span>{formatParamValue(item.leftValue)}</span>
                            <span className="text-slate-500">vs</span>
                            <span>{formatParamValue(item.rightValue)}</span>
                            <span className="text-slate-500">delta</span>
                            <span className="text-slate-200">
                              {formatDeltaValue(item.delta)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              Recent runs
            </div>
            <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-300">
              {runs.slice(0, 5).map((run) => {
                const accepted = run.attempts.find((attempt) => attempt.accepted);
                return (
                  <div key={run.id} className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-400">#{run.seq}</span>
                    <span className={run.accepted ? "text-emerald-300" : "text-rose-300"}>
                      {run.accepted ? "accepted" : "rejected"}
                    </span>
                    <span className="text-slate-500">{formatDurationMs(run.durationMs)}</span>
                    {accepted ? (
                      <span className="text-slate-400">
                        {formatParamsSummary(accepted.params)}
                      </span>
                    ) : (
                      <span className="text-slate-600">no accepted params</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {treeOverlayView}
    </div>
  );

  if (variant === "embedded") {
    return <div className={className}>{content(true)}</div>;
  }

  const wrapperClass = className ? ` ${className}` : "";

  return (
    <div className={`h-full w-full overflow-auto bg-slate-950/80 p-4 text-slate-100${wrapperClass}`}>
      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>GR Agent Loop Audit</span>
            <div className="flex items-center gap-2">
              {statusBadge}
              {runButton}
            </div>
          </CardTitle>
          <CardDescription>
            Residual trends and accepted configs from recent GR agent loop runs.
          </CardDescription>
        </CardHeader>
        <CardContent>{content(false)}</CardContent>
      </Card>
    </div>
  );
}
