import * as React from "react";
import { useKnowledgeProjectsStore } from "@/store/useKnowledgeProjectsStore";
import type { KnowledgeProjectExport } from "@shared/knowledge";

export default function CoreKnowledgePanel() {
  const { baselineEnabled, toggleBaseline } = useKnowledgeProjectsStore((s) => ({
    baselineEnabled: s.baselineEnabled,
    toggleBaseline: s.toggleBaseline,
  }));
  const [baseline, setBaseline] = React.useState<KnowledgeProjectExport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    let canceled = false;
    setLoading(true);
    (async () => {
      try {
        setError(null);
        const res = await fetch("/api/knowledge/baseline");
        if (!res.ok) throw new Error(`baseline ${res.status}`);
        const payload = (await res.json()) as KnowledgeProjectExport;
        if (!canceled) setBaseline(payload);
      } catch (err) {
        // Fallback: fetch from static /docs if API is unavailable
        try {
          const files = await buildFallbackBundle();
          const payload: KnowledgeProjectExport = {
            project: { id: "project:baseline", name: "Core Knowledge", tags: ["baseline"], type: "system", hashSlug: "core-knowledge" },
            summary: `Core Knowledge (static) · ${files.length} files`,
            files,
            approxBytes: files.reduce((t, f) => t + (f.preview ? f.preview.length : 0), 0),
            omittedFiles: [],
          } as any;
          if (!canceled) {
            setBaseline(payload);
            setError(null);
          }
        } catch (fallbackErr) {
          if (!canceled) setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  async function buildFallbackBundle() {
    const DEFAULT_FILES = [
      "V0.1-SIGNOFF.md",
      "ESSENCE-CONSOLE_GAP-REPORT.md",
      "ESSENCE-CONSOLE_PATCH-PLAN.md",
      "TRACE-API.md",
      "AGI-ROADMAP.md",
      "ethos/why.md",
      "SMOKE.md",
    ];
    const maxPreview = 4000;
    const items: any[] = [];
    for (const name of DEFAULT_FILES) {
      try {
        const res = await fetch(`/docs/${name}`);
        if (!res.ok) continue;
        const text = (await res.text()).replace(/\s+/g, " ").trim();
        const preview = text.length > maxPreview ? `${text.slice(0, maxPreview - 3)}...` : text;
        items.push({
          id: `project:baseline:${name}`,
          name,
          path: `docs/${name}`,
          mime: "text/markdown",
          size: preview.length,
          hashSlug: `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-static`,
          kind: "text",
          preview,
        });
      } catch {
        // ignore fetch errors
      }
    }
    return items;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Core Knowledge (read-only)</p>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={baselineEnabled} onChange={() => toggleBaseline()} /> Include in context
        </label>
      </div>
      {loading && <p className="text-sm text-slate-400">Loading core bundle…</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!loading && baseline && (
        <>
          <p className="text-xs text-slate-400">
            {baseline.project.name} · {baseline.files.length} file{baseline.files.length === 1 ? "" : "s"}
          </p>
          <div className="max-h-72 overflow-auto rounded border border-white/10">
            {baseline.files.map((f) => (
              <div key={f.id} className="border-b border-white/5 px-3 py-2">
                <div className="text-slate-200 text-sm">{f.name}</div>
                {"preview" in f && (f as any).preview && (
                  <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">{(f as any).preview}</div>
                )}
              </div>
            ))}
            {baseline.files.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-400">No files in baseline bundle.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
