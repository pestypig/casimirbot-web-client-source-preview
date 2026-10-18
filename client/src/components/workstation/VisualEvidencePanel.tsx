import React, { useCallback, useEffect, useState } from "react";
import { Bot, Eye, RefreshCw } from "lucide-react";
import type {
  VisualSequenceIngestResponse,
  VisualSequenceManifest,
  VisualSequenceReasoningGrant,
  VisualSequenceReceipt,
} from "@shared/helix-visual-sequence";
import { useSurfacePanelRoute } from "./hud-surface/SurfacePanelRouteContext";
import VisualSequenceInspector from "./visual-sequence/VisualSequenceInspector";

type CatalogResponse = {
  ok: boolean;
  sequences?: VisualSequenceManifest[];
  reasoning_grants?: VisualSequenceReasoningGrant[];
  manifest?: VisualSequenceManifest;
  receipt?: VisualSequenceReceipt;
  grant?: VisualSequenceReasoningGrant;
  message?: string;
};

async function api(path: string, init?: RequestInit): Promise<CatalogResponse> {
  const response = await fetch(`/api/visual-sequences${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const body = await response.json() as CatalogResponse;
  if (!response.ok || !body.ok) throw new Error(body.message ?? "Visual evidence is unavailable.");
  return body;
}

const short = (value: string) => `${value.slice(0, 12)}${value.length > 12 ? "…" : ""}`;

export default function VisualEvidencePanel() {
  const route = useSurfacePanelRoute();
  const [sequences, setSequences] = useState<VisualSequenceManifest[]>([]);
  const [grants, setGrants] = useState<VisualSequenceReasoningGrant[]>([]);
  const [selected, setSelected] = useState<VisualSequenceManifest | null>(null);
  const [message, setMessage] = useState("Loading profile-owned visual evidence…");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (preferredId?: string) => {
    setBusy(true);
    try {
      const result = await api("/");
      const next = result.sequences ?? [];
      setSequences(next);
      setGrants(result.reasoning_grants ?? []);
      const id = preferredId ?? route?.context.sequence_id ?? selected?.sequence_id;
      const match = next.find((manifest) => manifest.sequence_id === id) ?? next[0] ?? null;
      setSelected(match);
      setMessage(match ? "Visual evidence catalog synchronized." : "No unexpired visual sequences are available.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Visual evidence is unavailable.");
    } finally { setBusy(false); }
  }, [route?.context.sequence_id, selected?.sequence_id]);

  useEffect(() => { void refresh(); }, [route?.route_id]);

  const select = async (sequenceId: string) => {
    setBusy(true);
    try {
      const result = await api(`/${sequenceId}`);
      setSelected(result.manifest ?? null);
      setMessage("Selected the exact manifest and frame set.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sequence inspection failed."); }
    finally { setBusy(false); }
  };

  const captured = (result: VisualSequenceIngestResponse) => {
    setSelected(result.manifest);
    void refresh(result.manifest.sequence_id);
  };

  const activeGrant = selected
    ? grants.find((grant) => grant.sequence_id === selected.sequence_id && grant.status === "active") ?? null
    : null;

  const exposeToCodex = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await api(`/${selected.sequence_id}/reasoning-grants`, {
        method: "POST",
        body: JSON.stringify({ duration_ms: 5 * 60 * 1_000 }),
      });
      await refresh(selected.sequence_id);
      setMessage(`Codex reasoning grant issued: ${short(result.grant?.reasoning_grant_id ?? "unknown")}. It expires automatically in five minutes.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Reasoning grant failed."); }
    finally { setBusy(false); }
  };

  const revokeCodex = async () => {
    if (!activeGrant) return;
    setBusy(true);
    try {
      await api(`/reasoning-grants/${activeGrant.reasoning_grant_id}/revoke`, { method: "POST" });
      await refresh(selected?.sequence_id);
      setMessage("Codex reasoning access was revoked.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Grant revocation failed."); }
    finally { setBusy(false); }
  };

  return (
    <section className="flex h-full min-h-[680px] flex-col overflow-auto bg-[#060a12] text-slate-100" data-testid="visual-evidence-panel">
      <header className="border-b border-sky-300/15 bg-slate-950/90 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold text-sky-100"><Eye size={17} />Visual Evidence</h1>
            <p className="mt-1 max-w-3xl text-xs text-slate-400">Import and inspect bounded frame packets, review captures created by HUD, Minecraft, or program surfaces, then expose the exact selected evidence to a bound Codex chat through MCP.</p>
          </div>
          <span className="rounded border border-amber-300/20 bg-amber-400/5 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-amber-200">developer · VSE-0C1</span>
        </div>
        {route ? <p className="mt-2 rounded border border-violet-300/20 bg-violet-400/5 px-2 py-1 font-mono text-[10px] text-violet-200">Surface route: {short(route.surface_instance_id)} · revision {route.surface_revision} · {route.context.source_id ?? "unbound"}</p> : null}
      </header>

      <main className="grid flex-1 gap-3 p-3 xl:grid-cols-[300px_minmax(520px,1fr)]">
        <aside className="space-y-3">
          <article className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
            <div className="flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Evidence catalog</h2><button type="button" disabled={busy} onClick={() => void refresh()} aria-label="Refresh visual evidence" className="rounded border border-white/10 p-1.5 text-slate-300 disabled:opacity-40"><RefreshCw size={13} /></button></div>
            <div className="mt-3 space-y-2">{sequences.map((manifest) => <button type="button" key={manifest.sequence_id} onClick={() => void select(manifest.sequence_id)} className={`w-full rounded border p-2 text-left ${selected?.sequence_id === manifest.sequence_id ? "border-sky-300/35 bg-sky-400/10" : "border-white/10 bg-black/20"}`}>
              <div className="font-mono text-[11px] text-sky-100">{short(manifest.sequence_id)}</div>
              <div className="mt-1 truncate text-[10px] text-slate-500">{manifest.source_id} · {manifest.frames.length} frames · {(manifest.source.duration_ms / 1_000).toFixed(2)}s</div>
            </button>)}{!sequences.length ? <p className="rounded border border-dashed border-white/10 p-3 text-xs text-slate-500">Import a short clip here, or create a bounded surface capture in an admitted source panel.</p> : null}</div>
          </article>

          <article className="rounded-lg border border-emerald-300/15 bg-emerald-400/[0.04] p-3">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200"><Bot size={14} />Codex bridge</h2>
            <p className="mt-2 text-[10px] leading-4 text-slate-400">The full-harness MCP exposes list, manifest, contact-sheet, and selected-frame readers only after you issue a short-lived grant and the chat presents its exact active reasoning binding ID and epoch.</p>
            <div className="mt-2 rounded bg-black/25 p-2 font-mono text-[9px] text-slate-500">max 6 frames · max 12 MiB · WebP images · profile isolated · expires with VSE artifact</div>
            <p className="mt-2 text-[9px] leading-4 text-emerald-100/70">Observation and evidence re-entry only. Screen text is never executed, and model output cannot mutate the HUD without a separate admitted command.</p>
          </article>
        </aside>

        <div className="space-y-3">
          {selected ? <article className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="overflow-hidden rounded border border-white/10 bg-black/30"><img src={selected.contact_sheet.image_ref} alt="Selected visual evidence contact sheet" className="block max-h-[420px] w-full object-contain" /></div>
              <div className="space-y-2 text-[10px]">
                <div className="rounded border border-white/10 bg-black/20 p-2"><span className="block text-slate-600">Sequence</span><span className="break-all font-mono text-sky-200">{selected.sequence_id}</span></div>
                <div className="grid grid-cols-2 gap-2"><Metric label="Frames" value={String(selected.frames.length)} /><Metric label="Cadence" value={`${selected.sampling.applied_cadence_ms} ms`} /><Metric label="Source" value={selected.capture ? "bounded capture" : "local clip"} /><Metric label="Expires" value={new Date(selected.expires_at).toLocaleTimeString()} /></div>
                <div className={`rounded border p-2 ${activeGrant ? "border-emerald-300/25 bg-emerald-400/[0.05]" : "border-amber-300/20 bg-amber-400/[0.04]"}`}>
                  <span className="block uppercase tracking-[0.12em] text-slate-500">Codex access</span>
                  <span className="mt-1 block font-mono text-[9px] text-slate-300">{activeGrant ? `${activeGrant.reasoning_grant_id} · expires ${new Date(activeGrant.expires_at).toLocaleTimeString()}` : "not exposed"}</span>
                  <button type="button" disabled={busy} onClick={() => void (activeGrant ? revokeCodex() : exposeToCodex())} className="mt-2 rounded border border-sky-300/25 bg-sky-400/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-sky-100 disabled:opacity-40">{activeGrant ? "Revoke Codex access" : "Expose to Codex for 5 min"}</button>
                </div>
                <div className="flex flex-wrap gap-1">{selected.frames.map((frame) => <a key={frame.frame_id} href={frame.image_ref} target="_blank" rel="noreferrer" title={frame.sha256} className="rounded border border-white/10 px-2 py-1 font-mono text-[9px] text-sky-200">{(frame.pts_ms / 1000).toFixed(3)}s</a>)}</div>
              </div>
            </div>
          </article> : null}
          <VisualSequenceInspector onArtifact={captured} />
        </div>
      </main>
      <footer className="border-t border-white/10 bg-slate-950/80 px-4 py-2 text-[10px] text-slate-500" role="status">{message}</footer>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-white/10 bg-black/20 p-2"><span className="block uppercase tracking-[0.12em] text-slate-600">{label}</span><span className="mt-1 block font-mono text-slate-200">{value}</span></div>;
}
