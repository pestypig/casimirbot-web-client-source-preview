import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgiRefinerySummary } from "@shared/agi-refinery";

const DEFAULT_LIMIT = 250;
const fmtPct = (value: number) => `${Math.round(value * 100)}%`;

const formatNumber = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "—";
type AxisEntry = { key: string; count: number; acceptance?: number };
const buildAxisEntries = (
  counts?: Record<string, number>,
  acceptance?: Record<string, number>,
): AxisEntry[] =>
  Object.entries(counts ?? {})
    .map(([key, count]) => ({
      key,
      count,
      acceptance: acceptance?.[key],
    }))
    .sort((a, b) => b.count - a.count);

export default function AgiRefineryDashboard() {
  const [summary, setSummary] = useState<AgiRefinerySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agi/refinery/summary?limit=${DEFAULT_LIMIT}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }
      const payload = (await res.json()) as AgiRefinerySummary;
      setSummary(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Unable to load refinery summary.");
      setSummary(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const intentEntries = useMemo(
    () => Object.entries(summary?.byIntent ?? {}).sort((a, b) => b[1] - a[1]),
    [summary],
  );
  const evidenceEntries = useMemo(
    () => Object.entries(summary?.byEvidenceKind ?? {}).sort((a, b) => b[1] - a[1]),
    [summary],
  );
  const strategyEntries = useMemo(
    () => buildAxisEntries(summary?.byStrategy, summary?.acceptanceByStrategy),
    [summary],
  );
  const difficultyEntries = useMemo(
    () => buildAxisEntries(summary?.byDifficulty, summary?.acceptanceByDifficulty),
    [summary],
  );
  const surfaceEntries = useMemo(
    () => buildAxisEntries(summary?.bySurface, summary?.acceptanceBySurface),
    [summary],
  );
  const failureEntries = useMemo(
    () => Object.entries(summary?.byFailure ?? {}).sort((a, b) => b[1] - a[1]),
    [summary],
  );

  return (
    <div className="min-h-screen bg-[#050915] text-slate-100 px-8 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Data Refinery</div>
          <div className="text-2xl font-semibold">Trajectory Acceptance</div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs uppercase tracking-wide text-slate-200 hover:border-sky-400"
            onClick={() => void refresh()}
            disabled={busy}
          >
            {busy ? "Refreshing..." : "Refresh"}
          </button>
          {summary?.createdAt && (
            <div className="text-[11px] text-slate-400">
              Updated {new Date(summary.createdAt).toLocaleString()}
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {!summary && !error && (
        <div className="mt-6 text-sm text-slate-400">Loading refinery metrics...</div>
      )}

      {summary && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
            <div className="text-sm uppercase tracking-wide text-slate-400">Summary</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">Total</div>
                <div className="text-2xl font-semibold">{formatNumber(summary.total)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">Accepted</div>
                <div className="text-2xl font-semibold">{formatNumber(summary.accepted)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">Acceptance</div>
                <div className="text-2xl font-semibold">
                  {fmtPct(summary.acceptanceRate ?? 0)}
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">Total Tokens</div>
                <div className="text-xl font-semibold">{formatNumber(summary.totalTokens)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">Avg Tokens</div>
                <div className="text-xl font-semibold">
                  {summary.avgTokens ? summary.avgTokens.toFixed(1) : "—"}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
            <div className="text-sm uppercase tracking-wide text-slate-400">Failures</div>
            {failureEntries.length === 0 ? (
              <div className="text-sm text-slate-400">No failures recorded.</div>
            ) : (
              <div className="space-y-2 text-sm">
                {failureEntries.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-slate-200">{key}</span>
                    <span className="text-slate-400">{formatNumber(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
            <div className="text-sm uppercase tracking-wide text-slate-400">Intent Coverage</div>
            {intentEntries.length === 0 ? (
              <div className="text-sm text-slate-400">No intent data yet.</div>
            ) : (
              <div className="space-y-2 text-sm">
                {intentEntries.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-slate-200">{key}</span>
                    <span className="text-slate-400">{formatNumber(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
            <div className="text-sm uppercase tracking-wide text-slate-400">Evidence Mix</div>
            {evidenceEntries.length === 0 ? (
              <div className="text-sm text-slate-400">No evidence logged.</div>
            ) : (
              <div className="space-y-2 text-sm">
                {evidenceEntries.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-slate-200">{key}</span>
                    <span className="text-slate-400">{formatNumber(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
            <div className="text-sm uppercase tracking-wide text-slate-400">Strategy Coverage</div>
            {strategyEntries.length === 0 ? (
              <div className="text-sm text-slate-400">No strategy data yet.</div>
            ) : (
              <div className="space-y-2 text-sm">
                {strategyEntries.map((entry) => (
                  <div key={entry.key} className="flex items-center justify-between">
                    <span className="text-slate-200">{entry.key}</span>
                    <span className="text-slate-400">
                      {formatNumber(entry.count)}
                      {typeof entry.acceptance === "number" ? ` | ${fmtPct(entry.acceptance)}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
            <div className="text-sm uppercase tracking-wide text-slate-400">Difficulty Coverage</div>
            {difficultyEntries.length === 0 ? (
              <div className="text-sm text-slate-400">No difficulty data yet.</div>
            ) : (
              <div className="space-y-2 text-sm">
                {difficultyEntries.map((entry) => (
                  <div key={entry.key} className="flex items-center justify-between">
                    <span className="text-slate-200">{entry.key}</span>
                    <span className="text-slate-400">
                      {formatNumber(entry.count)}
                      {typeof entry.acceptance === "number" ? ` | ${fmtPct(entry.acceptance)}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
            <div className="text-sm uppercase tracking-wide text-slate-400">Surface Coverage</div>
            {surfaceEntries.length === 0 ? (
              <div className="text-sm text-slate-400">No surface data yet.</div>
            ) : (
              <div className="space-y-2 text-sm">
                {surfaceEntries.map((entry) => (
                  <div key={entry.key} className="flex items-center justify-between">
                    <span className="text-slate-200">{entry.key}</span>
                    <span className="text-slate-400">
                      {formatNumber(entry.count)}
                      {typeof entry.acceptance === "number" ? ` | ${fmtPct(entry.acceptance)}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
