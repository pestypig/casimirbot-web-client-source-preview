import { useEffect, useMemo, useState } from "react";
import type { EssencePromptProfile, EssencePromptVariant } from "@shared/essence-prompts";
import {
  fetchPromptProfiles,
  fetchPromptVariants,
  runPromptVariant,
  updatePromptProfile,
} from "@/lib/agi/promptVariants";

type SaveState = "idle" | "saving" | "saved" | "error";

export function EssencePromptPanel() {
  const [profiles, setProfiles] = useState<EssencePromptProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<Pick<EssencePromptProfile, "name" | "baseTemplate" | "baseScript">>({
    name: "",
    baseTemplate: "",
    baseScript: "",
  });
  const [keywordsInput, setKeywordsInput] = useState("");
  const [globsInput, setGlobsInput] = useState("");
  const [ignoreInput, setIgnoreInput] = useState("");
  const [variants, setVariants] = useState<EssencePromptVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [variantStatus, setVariantStatus] = useState<string | null>(null);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null,
    [profiles, activeId],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const profs = await fetchPromptProfiles();
        if (cancelled) return;
        setProfiles(profs);
        const first = profs[0];
        if (first) {
          setActiveId(first.id);
          setForm({ name: first.name, baseTemplate: first.baseTemplate, baseScript: first.baseScript });
          setKeywordsInput((first.keywords ?? []).join(", "));
          setGlobsInput((first.globs ?? []).join(", "));
          setIgnoreInput((first.ignore ?? []).join(", "));
          const latest = await fetchPromptVariants({ profileId: first.id, refresh: true });
          if (!cancelled) setVariants(latest);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!copyStatus) return;
    const t = setTimeout(() => setCopyStatus(null), 1600);
    return () => clearTimeout(t);
  }, [copyStatus]);

  const handleSave = async () => {
    if (!activeProfile) return;
    setSaveState("saving");
    try {
      const toArray = (input: string) =>
        input
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      const updated = await updatePromptProfile(activeProfile.id, {
        ...form,
        keywords: toArray(keywordsInput),
        globs: toArray(globsInput),
        ignore: toArray(ignoreInput),
      });
      setProfiles([updated]); // only one profile for now
      setKeywordsInput((updated.keywords ?? []).join(", "));
      setGlobsInput((updated.globs ?? []).join(", "));
      setIgnoreInput((updated.ignore ?? []).join(", "));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleGenerate = async () => {
    if (!activeProfile) return;
    setVariantStatus("Generating variant...");
    try {
      const variant = await runPromptVariant({ profileId: activeProfile.id });
      setVariants((prev) => [variant, ...prev]);
      setVariantStatus("Generated");
      setTimeout(() => setVariantStatus(null), 1400);
    } catch (err) {
      setVariantStatus("Failed");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCopy = async (text: string) => {
    if (!text) return;
    try {
      if (!navigator?.clipboard?.writeText) {
        setCopyStatus("Clipboard unavailable");
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied");
    } catch (err) {
      setCopyStatus(err instanceof Error ? err.message : "Copy failed");
    }
  };

  const renderVariantCard = (variant: EssencePromptVariant) => {
    const created = new Date(variant.createdAt).toLocaleString();
    const preview = variant.finalPrompt.slice(0, 220);
    return (
      <div
        key={variant.id}
        className="rounded-lg border border-white/10 bg-white/5 p-4 shadow-sm shadow-cyan-900/30 backdrop-blur"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/90">Prompt variant</div>
            <div className="text-[11px] text-slate-400">{created}</div>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-cyan-500/20 px-2 py-1 text-[11px] text-cyan-100">Nightly</span>
            <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/70">
              {variant.directions.length ? `${variant.directions.length} directions` : "No directions"}
            </span>
          </div>
        </div>
        <p className="mt-3 text-sm text-white/80">{preview}{variant.finalPrompt.length > preview.length ? "…" : ""}</p>
        {variant.directions.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {variant.directions.map((d) => (
              <span key={d} className="rounded-md bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100">
                {d}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-white/80 sm:grid-cols-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Strengths</div>
            <ul className="mt-1 space-y-1">
              {variant.strengths.map((s) => (
                <li key={s} className="rounded bg-white/5 px-2 py-1">{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Weaknesses</div>
            <ul className="mt-1 space-y-1">
              {variant.weaknesses.map((w) => (
                <li key={w} className="rounded bg-white/5 px-2 py-1">{w}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => handleCopy(variant.finalPrompt)}
            className="rounded-md bg-cyan-500/80 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
          >
            Copy prompt
          </button>
          <details className="group w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/80">
            <summary className="cursor-pointer text-white/90">Show full prompt</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/60 p-2 text-[11px] leading-relaxed text-slate-200">
              {variant.finalPrompt}
            </pre>
          </details>
          {copyStatus && <span className="text-[11px] text-slate-300">{copyStatus}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full bg-gradient-to-br from-[#05060c] via-[#050910] to-[#071321] text-white">
      <div className="flex w-[42%] flex-col border-r border-white/10 bg-black/30">
        <header className="border-b border-white/10 px-4 py-3">
          <div className="text-sm font-semibold text-white/90">Prompt profile</div>
          <div className="text-[11px] text-slate-400">
            {loading ? "Loading…" : activeProfile ? `Profile: ${activeProfile.name}` : "No profile"}
          </div>
          {activeProfile?.lastRunAt && (
            <div className="text-[11px] text-slate-500">
              Last run: {new Date(activeProfile.lastRunAt).toLocaleString()}
            </div>
          )}
          {activeProfile?.lastError && (
            <div className="text-[11px] text-rose-300">Last error: {activeProfile.lastError}</div>
          )}
        </header>
        <div className="flex-1 space-y-4 overflow-auto p-4">
          {error && <div className="rounded bg-red-500/20 px-3 py-2 text-xs text-red-100">{error}</div>}
          <label className="space-y-1 text-sm">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
              placeholder="Warp bubble profile name"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Base template</span>
            <textarea
              value={form.baseTemplate}
              onChange={(e) => setForm((prev) => ({ ...prev, baseTemplate: e.target.value }))}
              className="h-48 w-full rounded border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
              placeholder="System/body template the nightly variation should preserve"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Base script (always append)</span>
            <textarea
              value={form.baseScript}
              onChange={(e) => setForm((prev) => ({ ...prev, baseScript: e.target.value }))}
              className="h-32 w-full rounded border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
              placeholder="Commands that must ride at the end of each prompt"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Keywords (comma-separated)</span>
            <input
              value={keywordsInput}
              onChange={(e) => setKeywordsInput(e.target.value)}
              className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
              placeholder="physics, warp, diagnostics"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Glob patterns (comma-separated)</span>
            <input
              value={globsInput}
              onChange={(e) => setGlobsInput(e.target.value)}
              className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
              placeholder="**/*warp*.{ts,tsx}, **/*diagnostic*.md"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Ignore patterns (comma-separated)</span>
            <input
              value={ignoreInput}
              onChange={(e) => setIgnoreInput(e.target.value)}
              className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
              placeholder="**/node_modules/**, **/dist/**"
            />
          </label>
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3">
          <button
            onClick={handleSave}
            disabled={saveState === "saving" || loading || !activeProfile}
            className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50"
          >
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save profile"}
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || !activeProfile}
            className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-400 disabled:opacity-50"
          >
            {variantStatus ? variantStatus : "Generate variant"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-white/90">Nightly prompt variations</div>
            <div className="text-[11px] text-slate-400">
              {variants.length ? `${variants.length} captured` : "No variants yet"}
            </div>
          </div>
          <button
            onClick={async () => {
              if (!activeProfile) return;
              setVariantStatus("Refreshing…");
              try {
                const refreshed = await fetchPromptVariants({ profileId: activeProfile.id, refresh: true });
                setVariants(refreshed);
                setVariantStatus(null);
              } catch (err) {
                setVariantStatus("Failed");
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
          >
            Refresh nightly
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {variants.length ? variants.map(renderVariantCard) : !loading ? (
            <div className="rounded border border-white/10 bg-black/40 px-4 py-6 text-sm text-slate-300">
              No prompt variants generated yet. Use “Generate variant” to seed the nightly list.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
