import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchNoiseField } from "@/lib/api/noiseGens";
import type { NoiseFieldLoopResponse } from "@/types/noise-gens";

const DEFAULT_SEED = 1;
const DEFAULT_REQUEST = {
  width: 32,
  height: 32,
  maxIterations: 8,
  stepSize: 0.15,
  includeValues: true,
} as const;
const MAX_SEED = 2_147_483_647;

const clampSeed = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_SEED;
  return Math.min(MAX_SEED, Math.max(0, Math.floor(value)));
};

const formatNumber = (value: number | undefined | null, digits = 4): string =>
  Number.isFinite(value) ? (value as number).toFixed(digits) : "--";

type SparklineProps = {
  values: number[];
  limit?: number;
  color: string;
  label: string;
};

function Sparkline({ values, limit, color, label }: SparklineProps) {
  const width = 180;
  const height = 44;
  const limitValue = Number.isFinite(limit) ? (limit as number) : 0;
  const maxValue = Math.max(limitValue, ...values, 1e-6);
  const minValue = 0;
  const range = Math.max(1e-6, maxValue - minValue);
  const points =
    values.length > 1
      ? values
          .map((value, index) => {
            const x = (index / (values.length - 1)) * width;
            const y = height - ((value - minValue) / range) * height;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : values.length === 1
        ? `0,${height - ((values[0] - minValue) / range) * height}`
        : "";
  const limitY =
    Number.isFinite(limit) && limitValue > 0
      ? height - ((limitValue - minValue) / range) * height
      : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-slate-500">
        <span>{label}</span>
        <span className="text-slate-300">
          {formatNumber(values[values.length - 1], 4)}
        </span>
      </div>
      <div className="rounded-lg border border-white/10 bg-slate-950/50 px-2 py-2">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="h-12 w-full"
        >
          {limitY != null ? (
            <line
              x1={0}
              x2={width}
              y1={limitY}
              y2={limitY}
              stroke="rgba(148,163,184,0.6)"
              strokeDasharray="4 4"
            />
          ) : null}
          {points ? (
            <polyline
              fill="none"
              stroke={color}
              strokeWidth={2}
              points={points}
            />
          ) : null}
        </svg>
      </div>
    </div>
  );
}

export default function NoiseFieldPanel() {
  const [seedInput, setSeedInput] = useState<string>(String(DEFAULT_SEED));
  const [data, setData] = useState<NoiseFieldLoopResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didInitRef = useRef(false);

  const runNoise = useCallback(async (overrideSeed?: number) => {
    const seedFromInput = Number(seedInput);
    const seed = clampSeed(
      typeof overrideSeed === "number" ? overrideSeed : seedFromInput,
    );
    setSeedInput(String(seed));
    setLoading(true);
    setError(null);
    try {
      const response = await fetchNoiseField({
        ...DEFAULT_REQUEST,
        seed,
      });
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noise field request failed");
    } finally {
      setLoading(false);
    }
  }, [seedInput]);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    void runNoise(DEFAULT_SEED);
  }, [runNoise]);

  const values = data?.finalState.values ?? null;
  const stats = data?.stats ?? null;
  const maxAbs = useMemo(() => {
    if (!stats) return 1;
    return Math.max(Math.abs(stats.min), Math.abs(stats.max), 1e-6);
  }, [stats]);
  const gridCells = useMemo(() => {
    if (!values) return [];
    return values.map((value, index) => {
      const intensity = Math.min(1, Math.abs(value) / maxAbs);
      const alpha = 0.15 + intensity * 0.85;
      const color =
        value >= 0
          ? `rgba(56,189,248,${alpha})`
          : `rgba(248,113,113,${alpha})`;
      return <span key={index} className="block aspect-square" style={{ backgroundColor: color }} />;
    });
  }, [values, maxAbs]);

  const attempts = data?.attempts ?? [];
  const rmsSeries = useMemo(
    () => attempts.map((attempt) => attempt.constraints.laplacianRms),
    [attempts],
  );
  const maxSeries = useMemo(
    () => attempts.map((attempt) => attempt.constraints.laplacianMaxAbs),
    [attempts],
  );
  const gateStatus = data?.gate?.status ?? "unknown";
  const gateLabel =
    gateStatus === "pass" ? "PASS" : gateStatus === "fail" ? "FAIL" : "UNKNOWN";
  const gateTone =
    gateStatus === "pass"
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
      : gateStatus === "fail"
        ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
        : "border-slate-500/40 bg-slate-500/10 text-slate-300";

  const thresholdRms = data?.config.thresholds.laplacianRmsMax;
  const thresholdMax = data?.config.thresholds.laplacianMaxAbsMax;
  const lastConstraints = data?.constraints ?? null;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-200 shadow-[0_25px_70px_-45px_rgba(14,165,233,0.6)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">Noise Field Gate</p>
          <p className="text-xs text-slate-400">
            Laplacian-constrained grid with gate history for the noisegen loop.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SEED}
            value={seedInput}
            onChange={(event) => setSeedInput(event.target.value)}
            className="h-9 w-28 bg-slate-950/40 text-xs"
            aria-label="Noise field seed"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void runNoise()}
            disabled={loading}
          >
            {loading ? "Running..." : "Run"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void runNoise(Math.floor(Math.random() * 1_000_000))
            }
            disabled={loading}
          >
            Random
          </Button>
        </div>
      </header>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div className="mx-auto w-full max-w-[360px]">
            {values && gridCells.length ? (
              <div
                className="grid gap-[1px] rounded-lg bg-slate-900/40 p-1"
                style={{
                  gridTemplateColumns: `repeat(${data?.finalState.width ?? 0}, minmax(0, 1fr))`,
                }}
              >
                {gridCells}
              </div>
            ) : (
              <div className="text-xs text-slate-400">
                {loading ? "Running noise field..." : "No grid data yet."}
              </div>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`border ${gateTone}`}>Gate {gateLabel}</Badge>
            <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
              Iterations {attempts.length}
            </Badge>
            <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
              Accepted {data?.accepted ? "yes" : "no"}
            </Badge>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span>RMS</span>
              <span>
                {formatNumber(lastConstraints?.laplacianRms, 4)} /{" "}
                {formatNumber(thresholdRms, 3)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span>Max abs</span>
              <span>
                {formatNumber(lastConstraints?.laplacianMaxAbs, 4)} /{" "}
                {formatNumber(thresholdMax, 3)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>Mean</span>
              <span>{formatNumber(stats?.mean, 4)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>Range</span>
              <span>
                {formatNumber(stats?.min, 3)} to {formatNumber(stats?.max, 3)}
              </span>
            </div>
          </div>

          <Sparkline
            values={rmsSeries}
            limit={thresholdRms}
            color="rgba(34,211,238,0.9)"
            label="Laplacian RMS"
          />
          <Sparkline
            values={maxSeries}
            limit={thresholdMax}
            color="rgba(251,146,60,0.9)"
            label="Laplacian Max"
          />
        </div>
      </div>
    </section>
  );
}
