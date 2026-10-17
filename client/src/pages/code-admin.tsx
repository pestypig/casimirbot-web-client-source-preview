import React, { useEffect, useMemo, useState } from "react";
import { atlasSearch, buildSnapshot, indexRepoWithWorker } from "@/lib/code-index/search";
import { clearCodeIndex, getSnapshot, putEquations, putSymbols, saveSnapshot } from "@/lib/code-index/store";
import type { CodeSearchResult } from "@/lib/code-index/search";
import type { RepoSnapshot } from "@/lib/code-index/types";
import { getSnapshotDiagnostics, type SnapshotDiagnostics } from "@/lib/code-index/snapshot";
import { clearPlanLog, readPlanLog, type PlanExecutionRecord } from "@/lib/helix-plan-executor";

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function CodeAdminPage() {
  const [snapshot, setSnapshot] = useState<RepoSnapshot | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [sourceDiagnostics, setSourceDiagnostics] = useState<SnapshotDiagnostics>(() =>
    getSnapshotDiagnostics(),
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CodeSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [planLog, setPlanLog] = useState<PlanExecutionRecord[]>(() => readPlanLog());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("helix-exec");
    const handler = (event: MessageEvent) => {
      const record = event.data as unknown;
      if (!record || typeof record !== "object") return;
      const entry = record as PlanExecutionRecord;
      if (!entry.planId) return;
      setPlanLog((prev) => {
        const next = [entry, ...prev.filter((existing) => existing.planId !== entry.planId)];
        return next.slice(0, 50);
      });
    };
    channel.onmessage = handler;
    return () => {
      channel.onmessage = null;
      channel.close();
    };
  }, []);

  const refreshPlanLog = () => {
    setPlanLog(readPlanLog());
  };

  const handleClearPlanLog = () => {
    clearPlanLog();
    setPlanLog([]);
  };

  const diagnosticsBoxClass = sourceDiagnostics.matched
    ? "border-slate-800 bg-slate-900/70 text-slate-200"
    : "border-rose-600/70 bg-rose-950/40 text-rose-200";
  const patternListClass = sourceDiagnostics.matched
    ? "bg-slate-900/40 text-slate-200"
    : "bg-rose-900/30 text-rose-100";

  useEffect(() => {
    void getSnapshot()
      .then((snap) => setSnapshot(snap))
      .catch(() => setSnapshot(null));
  }, []);

  const snapshotSummary = useMemo(() => {
    if (!snapshot) return "No snapshot indexed.";
    const files = formatNumber(snapshot.files.length);
    const created = new Date(snapshot.createdAt).toLocaleString();
    return `Root: ${snapshot.root} | Commit: ${snapshot.commit} | Files: ${files} | Indexed: ${created}`;
  }, [snapshot]);

  const runIndex = async () => {
    setBusy(true);
    setStatus("Building snapshot…");
    setDiagnostics([]);
    try {
      const snap = await buildSnapshot();
      setSourceDiagnostics(getSnapshotDiagnostics());
      await saveSnapshot(snap);
      setSnapshot(snap);

      setStatus("Indexing source files…");
      const result = await indexRepoWithWorker(snap, (progress) => setStatus(progress));

      setStatus("Persisting symbols…");
      await clearCodeIndex();
      await putSymbols(result.symbols);
      setStatus("Persisting equations…");
      await putEquations(result.equations);

      const diag = result.diagnostics.filter(Boolean);
      setDiagnostics(diag);
      setStatus(
        diag.length
          ? `Indexed ${formatNumber(result.symbols.length)} symbols, ${formatNumber(
              result.equations.length,
            )} equations with ${diag.length} warning${diag.length === 1 ? "" : "s"}.`
          : `Indexed ${formatNumber(result.symbols.length)} symbols and ${formatNumber(
              result.equations.length,
            )} equations.`,
      );
    } catch (error) {
      setSourceDiagnostics(getSnapshotDiagnostics());
      const message = error instanceof Error ? error.message : "Unknown indexing error";
      setStatus(`Failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const runSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setBusy(true);
    setStatus("Searching…");
    try {
      const hits = await atlasSearch(query.trim(), { topK: 12, includeEquations: true });
      setResults(hits);
      setStatus(`Found ${hits.length} result${hits.length === 1 ? "" : "s"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6 text-slate-100">
      <header>
        <h1 className="text-2xl font-semibold">Code Index Admin</h1>
        <p className="mt-2 text-sm text-slate-400">{snapshotSummary}</p>
      </header>

      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-5">
        <h2 className="text-lg font-medium">Index</h2>
        <p className="text-sm text-slate-300">
          Builds a snapshot of all TypeScript/JavaScript sources, extracts symbols and equations with
          Tree-sitter, and persists them to IndexedDB.
        </p>
        <div className={`rounded border px-4 py-3 text-xs ${diagnosticsBoxClass}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold uppercase tracking-wide text-[10px] text-slate-400">
              Source Driver
            </span>
            <span className="rounded bg-slate-800/60 px-2 py-0.5 font-mono text-[11px] text-slate-100">
              {sourceDiagnostics.driver}
            </span>
            {sourceDiagnostics.origin ? (
              <span className="text-[11px] text-slate-400">via {sourceDiagnostics.origin}</span>
            ) : null}
          </div>
          <div className="mt-2 space-y-1 text-[11px] text-inherit">
            <p>
              Matched files:{" "}
              <span className="font-mono text-slate-100">
                {formatNumber(sourceDiagnostics.matched)}
              </span>
            </p>
            <p>Patterns:</p>
            <ul className={`space-y-1 overflow-x-auto rounded px-2 py-1 font-mono text-[11px] ${patternListClass}`}>
              {sourceDiagnostics.patterns.map((pattern) => (
                <li key={pattern} className="whitespace-pre">
                  {pattern}
                </li>
              ))}
            </ul>
          </div>
          {sourceDiagnostics.error ? (
            <p className="mt-2 whitespace-pre-wrap text-rose-300">{sourceDiagnostics.error}</p>
          ) : null}
          {!sourceDiagnostics.matched && !sourceDiagnostics.error ? (
            <p className="mt-2 text-rose-300">
              No sources matched; enable a code source driver (Vite glob, server API, or static asset).
            </p>
          ) : null}
        </div>
        <button
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-700/60"
          onClick={runIndex}
          disabled={busy}
        >
          {busy ? "Working…" : "Index repository"}
        </button>
        {status ? <p className="text-xs text-slate-300">{status}</p> : null}
        {diagnostics.length ? (
          <details className="rounded border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">
            <summary className="cursor-pointer text-amber-300">Diagnostics ({diagnostics.length})</summary>
            <ul className="mt-2 space-y-1">
              {diagnostics.map((line, idx) => (
                <li key={idx} className="whitespace-pre-wrap">
                  {line}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-950 p-5">
        <h2 className="text-lg font-medium">Search</h2>
        <div className="flex gap-3">
          <input
            className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            placeholder="Search symbol or alias…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void runSearch();
              }
            }}
          />
          <button
            className="rounded border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void runSearch()}
            disabled={busy}
          >
            Go
          </button>
        </div>
        <ul className="space-y-3">
          {results.map((hit, idx) => (
            <li key={hit.symbol.chunkId} className="rounded border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-mono text-emerald-300">
                  [C{idx + 1}] {hit.symbol.path}
                </span>
                <span className="text-xs text-slate-400">score {hit.score.toFixed(3)}</span>
              </div>
              <div className="mt-2 text-sm font-semibold">{hit.symbol.symbol}</div>
              {hit.symbol.doc ? (
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-900/60 p-2 text-xs text-slate-200">
                  {hit.symbol.doc}
                </pre>
              ) : null}
              {hit.equations.length ? (
                <details className="mt-2 text-xs text-slate-300">
                  <summary className="cursor-pointer text-slate-200">
                    Equations ({hit.equations.length})
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {hit.equations.map((eq) => (
                      <li key={eq.id} className="font-mono">
                        {eq.symbols.join(", ")}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-950 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Surface Plans</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={refreshPlanLog}
              className="rounded bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={handleClearPlanLog}
              className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-rose-200 hover:bg-rose-800/60"
            >
              Clear
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-300">
          Local record of remote interpreter plans and their execution status. Stored in browser only.
        </p>
        <div className="max-h-72 space-y-3 overflow-y-auto rounded border border-slate-800 bg-slate-900/60 p-3">
          {planLog.length === 0 ? (
            <p className="text-xs text-slate-500">No plans have been executed yet.</p>
          ) : (
            planLog.map((record) => {
              const applied = record.results.filter((result) => result.status === "applied").length;
              const skipped = record.results.filter((result) => result.status === "skipped").length;
              const errors = record.results.filter((result) => result.status === "error").length;
              return (
                <article
                  key={record.planId}
                  className="rounded border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span className="font-mono text-slate-200">Plan {record.planId.slice(0, 8)}</span>
                    <span>{new Date(record.executedAt).toLocaleString()}</span>
                    <span className="text-slate-300">
                      applied {applied} | skipped {skipped} | errors {errors}
                    </span>
                  </header>
                  <ul className="mt-2 space-y-1">
                    {record.results.map((result, idx) => (
                      <li key={`${record.planId}-${idx}`} className="flex flex-col gap-1 rounded bg-slate-900/70 p-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-emerald-300">[{idx + 1}] {result.action.op}</span>
                          <span
                            className={
                              result.status === "applied"
                                ? "text-emerald-300"
                                : result.status === "error"
                                  ? "text-rose-300"
                                  : "text-slate-400"
                            }
                          >
                            {result.status}
                          </span>
                        </div>
                        {result.detail ? (
                          <p className="text-[11px] text-slate-400">{result.detail}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}
