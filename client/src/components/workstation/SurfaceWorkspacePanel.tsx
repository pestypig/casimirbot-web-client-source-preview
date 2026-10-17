import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, Plus, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import {
  HELIX_SURFACE_PANEL_ROUTE_SCHEMA,
  type SurfaceControlLease,
  type SurfaceDesiredState,
  type SurfaceInstance,
  type SurfacePanelRouteReceipt,
  type SurfacePanelRouteTarget,
  type SurfaceReceipt,
} from "@shared/helix-surface-registry";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { publishSurfacePanelRoute } from "@/lib/workstation/surfacePanelRouting";
import { useSurfacePanelRoute } from "./hud-surface/SurfacePanelRouteContext";

type InspectResult = {
  ok: boolean;
  surface?: SurfaceInstance;
  surfaces?: SurfaceInstance[];
  receipts?: SurfaceReceipt[];
  route_receipts?: SurfacePanelRouteReceipt[];
  route?: SurfacePanelRouteReceipt;
  lease?: SurfaceControlLease;
  error?: string;
  message?: string;
};

const ROUTE_TARGETS: ReadonlyArray<{ target: SurfacePanelRouteTarget; label: string }> = [
  { target: "visual_evidence", label: "Visual Evidence" },
  { target: "hud_lab", label: "HUD Lab" },
  { target: "image_lens", label: "Image Lens" },
  { target: "live_answer", label: "Live Answer" },
  { target: "situation_room", label: "Situation Room" },
  { target: "process_graph", label: "Process Graph" },
  { target: "workflow_timeline", label: "Timeline" },
  { target: "storage_map", label: "Storage Map" },
  { target: "task_manager", label: "Task Manager" },
];

const COMPOSITION_MODES = ["hud_only_alpha", "hud_on_black", "hud_over_source", "source_only"] as const;
const OUTPUT_TARGETS = ["workstation_preview", "clean_feed", "recorder", "game_overlay", "projector", "secondary_display"] as const;

async function api(path: string, init?: RequestInit): Promise<InspectResult> {
  const response = await fetch(`/api/hud-surfaces${path}`, {
    credentials: "include",
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const value = await response.json() as InspectResult;
  if (!response.ok) throw new Error(value.message ?? value.error ?? "Surface Workspace request failed.");
  return value;
}

const short = (value: string | null | undefined) => value ? `${value.slice(0, 12)}${value.length > 12 ? "…" : ""}` : "—";

export default function SurfaceWorkspacePanel() {
  const openPanel = useWorkstationLayoutStore((state) => state.openPanelInActiveGroup);
  const incomingRoute = useSurfacePanelRoute();
  const [surfaces, setSurfaces] = useState<SurfaceInstance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(incomingRoute?.surface_instance_id ?? null);
  const [surface, setSurface] = useState<SurfaceInstance | null>(null);
  const [receipts, setReceipts] = useState<SurfaceReceipt[]>([]);
  const [routeReceipts, setRouteReceipts] = useState<SurfacePanelRouteReceipt[]>([]);
  const [lease, setLease] = useState<SurfaceControlLease | null>(null);
  const [threadId, setThreadId] = useState("surface-workspace");
  const [desired, setDesired] = useState<SurfaceDesiredState | null>(null);
  const [message, setMessage] = useState("Loading canonical surfaces…");
  const [busy, setBusy] = useState(false);

  const inspect = useCallback(async (surfaceId: string) => {
    const result = await api(`/${surfaceId}`);
    const next = result.surface ?? null;
    setSurface(next);
    setDesired(next?.desired_state ?? null);
    setReceipts(result.receipts ?? []);
    setRouteReceipts(result.route_receipts ?? []);
    setSelectedId(next?.surface_instance_id ?? surfaceId);
  }, []);

  const refresh = useCallback(async (preferredId?: string | null) => {
    setBusy(true);
    try {
      const result = await api("/");
      const nextSurfaces = result.surfaces ?? [];
      setSurfaces(nextSurfaces);
      const nextId = preferredId ?? selectedId ?? nextSurfaces[0]?.surface_instance_id ?? null;
      if (nextId && nextSurfaces.some((candidate) => candidate.surface_instance_id === nextId)) {
        await inspect(nextId);
        setMessage("Canonical Surface Registry synchronized.");
      } else {
        setSurface(null); setDesired(null); setReceipts([]); setRouteReceipts([]); setSelectedId(null);
        setMessage("No surfaces are registered for this developer profile.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Surface Registry unavailable.");
    } finally { setBusy(false); }
  }, [inspect, selectedId]);

  useEffect(() => { void refresh(incomingRoute?.surface_instance_id); }, [incomingRoute?.route_id]);

  const createSurface = async () => {
    setBusy(true);
    try {
      const result = await api("/", {
        method: "POST",
        body: JSON.stringify({ desired_state: {
          profile_id: "surface-workspace",
          run_id: `manual:${Date.now()}`,
          source: { source_id: "unbound-source", producer_epoch: `manual:${Date.now()}`, source_kind: "none" },
          composition_mode: "hud_only_alpha",
          transform_ref: "normalized-unit-rect-v1",
          output_target: "workstation_preview",
        } satisfies SurfaceDesiredState }),
      });
      await refresh(result.surface?.surface_instance_id);
      setMessage("Created an unbound normalized HUD surface.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Surface creation failed."); }
    finally { setBusy(false); }
  };

  const apply = async () => {
    if (!surface || !desired) return;
    setBusy(true);
    try {
      const result = await api(`/${surface.surface_instance_id}/commands`, { method: "POST", body: JSON.stringify({ operation: "configure", expected_revision: surface.revision, desired_state: desired }) });
      await refresh(result.surface?.surface_instance_id);
      setLease(null);
      setMessage("Presentation configuration applied at a new canonical revision.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Configuration failed."); }
    finally { setBusy(false); }
  };

  const blank = async () => {
    if (!surface) return;
    setBusy(true);
    try {
      const result = await api(`/${surface.surface_instance_id}/commands`, { method: "POST", body: JSON.stringify({ operation: "blank", expected_revision: surface.revision, reason: "emergency_blank" }) });
      await refresh(result.surface?.surface_instance_id);
      setLease(null);
      setMessage("Emergency Blank released the output and every surface control lease.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Emergency Blank failed."); }
    finally { setBusy(false); }
  };

  const toggleLease = async () => {
    if (!surface) return;
    setBusy(true);
    try {
      if (lease?.status === "active") {
        const result = await api(`/control-leases/${lease.control_lease_id}/revoke`, { method: "POST", body: "{}" });
        setLease(result.lease ?? null);
        setMessage("Codex surface lease revoked.");
      } else {
        const result = await api(`/${surface.surface_instance_id}/control-leases`, { method: "POST", body: JSON.stringify({ thread_id: threadId, permitted_operations: ["configure", "blank", "release", "route"], duration_ms: 300_000 }) });
        setLease(result.lease ?? null);
        setMessage("User issued a five-minute, exact-source Codex lease including typed routing.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Lease operation failed."); }
    finally { setBusy(false); }
  };

  const routeTo = async (target: SurfacePanelRouteTarget) => {
    if (!surface) return;
    setBusy(true);
    try {
      const result = await api(`/${surface.surface_instance_id}/panel-routes`, { method: "POST", body: JSON.stringify({
        schema: HELIX_SURFACE_PANEL_ROUTE_SCHEMA,
        expected_revision: surface.revision,
        target,
        sequence_id: null,
        requested_view: "surface-context",
        focus_target: surface.surface_instance_id,
      }) });
      if (!result.route) throw new Error("The route receipt was missing.");
      const route = publishSurfacePanelRoute(result.route);
      setRouteReceipts((current) => [...current, route]);
      openPanel(route.target_panel_id);
      setMessage(`Opened ${route.target_panel_id} with validated surface context.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Panel route failed."); }
    finally { setBusy(false); }
  };

  const routeCount = useMemo(() => routeReceipts.length, [routeReceipts]);

  return (
    <section className="flex h-full min-h-[650px] flex-col overflow-auto bg-[#070b12] text-slate-100" data-testid="surface-workspace-panel">
      <header className="border-b border-cyan-300/15 bg-slate-950/90 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold tracking-wide text-cyan-100">Surface Workspace</h1>
            <p className="mt-1 max-w-3xl text-xs text-slate-400">One profile-bound manager for normalized HUD, source, game, capture, and production surfaces. Routes preserve exact source and producer identity across panels.</p>
          </div>
          <div className="rounded border border-amber-300/20 bg-amber-400/5 px-3 py-2 text-right text-[10px] uppercase tracking-[0.14em] text-amber-200">developer only · experimental</div>
        </div>
        {incomingRoute && <p className="mt-2 rounded border border-violet-300/20 bg-violet-400/5 px-2 py-1 text-[10px] text-violet-200">Incoming typed route {short(incomingRoute.route_id)} · revision {incomingRoute.surface_revision}</p>}
      </header>

      <main className="grid flex-1 gap-3 p-3 xl:grid-cols-[280px_minmax(420px,1fr)_minmax(300px,0.75fr)]">
        <aside className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
          <div className="flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Registered surfaces</h2><button type="button" disabled={busy} onClick={() => void refresh()} className="rounded border border-white/10 p-1.5 text-slate-300 disabled:opacity-40" aria-label="Refresh surfaces"><RefreshCw size={13} /></button></div>
          <div className="mt-3 space-y-2">
            {surfaces.map((candidate) => <button type="button" key={candidate.surface_instance_id} onClick={() => void inspect(candidate.surface_instance_id)} className={`w-full rounded border p-2 text-left ${selectedId === candidate.surface_instance_id ? "border-cyan-300/35 bg-cyan-400/10" : "border-white/10 bg-black/20"}`}>
              <div className="flex items-center justify-between gap-2 text-xs"><span className="font-mono">{short(candidate.surface_instance_id)}</span><span className={candidate.status === "active" ? "text-emerald-300" : "text-amber-300"}>{candidate.status}</span></div>
              <div className="mt-1 truncate text-[10px] text-slate-500">{candidate.desired_state.source.source_kind} · {candidate.desired_state.output_target} · r{candidate.revision}</div>
            </button>)}
            {!surfaces.length && <p className="rounded border border-dashed border-white/10 p-3 text-xs text-slate-500">No canonical surfaces yet.</p>}
          </div>
          <button type="button" disabled={busy} onClick={() => void createSurface()} className="mt-3 w-full rounded border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40"><Plus className="mr-1 inline" size={13} />New unbound surface</button>
        </aside>

        <div className="space-y-3">
          <article className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Canonical presentation state</h2><span className="font-mono text-[10px] text-slate-500">revision {surface?.revision ?? "—"}</span></div>
            {surface && desired ? <>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                <div><span className="block text-slate-600">source</span><span title={desired.source.source_id}>{short(desired.source.source_id)}</span></div>
                <div><span className="block text-slate-600">epoch</span><span title={desired.source.producer_epoch}>{short(desired.source.producer_epoch)}</span></div>
                <div><span className="block text-slate-600">output lease</span>{surface.output_lease?.status ?? "none"}</div>
                <div><span className="block text-slate-600">state hash</span><span title={surface.state_hash}>{short(surface.state_hash)}</span></div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Composition<select value={desired.composition_mode} onChange={(event) => setDesired({ ...desired, composition_mode: event.target.value as SurfaceDesiredState["composition_mode"] })} className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-2 text-xs normal-case tracking-normal text-slate-100">{COMPOSITION_MODES.map((mode) => <option key={mode}>{mode}</option>)}</select></label>
                <label className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Output target<select value={desired.output_target} onChange={(event) => setDesired({ ...desired, output_target: event.target.value as SurfaceDesiredState["output_target"] })} className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-2 text-xs normal-case tracking-normal text-slate-100">{OUTPUT_TARGETS.map((target) => <option key={target}>{target}</option>)}</select></label>
                <label className="text-[10px] uppercase tracking-[0.12em] text-slate-500 md:col-span-2">Transform ref<input value={desired.transform_ref} onChange={(event) => setDesired({ ...desired, transform_ref: event.target.value })} className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-2 font-mono text-xs normal-case tracking-normal text-slate-100" /></label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy || surface.status === "released"} onClick={() => void apply()} className="rounded border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 disabled:opacity-40"><Link2 className="mr-1 inline" size={13} />Apply revision</button>
                <button type="button" disabled={busy || surface.status === "released"} onClick={() => void blank()} className="rounded border border-red-300/25 bg-red-400/5 px-3 py-1.5 text-xs text-red-200 disabled:opacity-40"><Unplug className="mr-1 inline" size={13} />Emergency Blank</button>
              </div>
            </> : <p className="mt-3 text-xs text-slate-500">Select or create a surface to configure its presentation state.</p>}
          </article>

          <article className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-200">Typed cross-panel routing</h2>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">A route receipt carries the canonical revision and launch context. This human control opens the destination; the MCP route tool only prepares the same receipt.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{ROUTE_TARGETS.map(({ target, label }) => <button type="button" key={target} disabled={busy || !surface || surface.status === "released"} onClick={() => void routeTo(target)} className="rounded border border-violet-300/20 bg-violet-400/5 px-2 py-2 text-[11px] text-violet-100 disabled:opacity-35"><ExternalLink className="mr-1 inline" size={12} />{label}</button>)}</div>
          </article>
        </div>

        <aside className="space-y-3">
          <article className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">Codex lease</h2>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">Consent is explicit, five minutes, one thread, one profile/source/epoch, and revocable. Routing never grants click or program-input authority.</p>
            <label className="mt-3 block text-[10px] uppercase tracking-[0.12em] text-slate-500">Thread ID<input value={threadId} onChange={(event) => setThreadId(event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-2 font-mono text-xs normal-case tracking-normal text-slate-100" /></label>
            <button type="button" disabled={busy || !surface || !threadId.trim() || surface.status === "released"} onClick={() => void toggleLease()} className="mt-3 w-full rounded border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100 disabled:opacity-40"><ShieldCheck className="mr-1 inline" size={13} />{lease?.status === "active" ? "Revoke Codex lease" : "Grant Codex 5m"}</button>
            <p className="mt-2 font-mono text-[10px] text-slate-500">{lease ? `${lease.status} · ${short(lease.control_lease_id)}` : "human UI authority only"}</p>
          </article>
          <article className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Receipts</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center"><div className="rounded bg-black/25 p-2"><div className="font-mono text-lg text-cyan-200">{receipts.length}</div><div className="text-[9px] uppercase text-slate-600">control</div></div><div className="rounded bg-black/25 p-2"><div className="font-mono text-lg text-violet-200">{routeCount}</div><div className="text-[9px] uppercase text-slate-600">routes</div></div></div>
            {routeReceipts.at(-1) && <p className="mt-2 text-[10px] text-slate-500">Latest: {routeReceipts.at(-1)?.target_panel_id} · r{routeReceipts.at(-1)?.surface_revision}</p>}
          </article>
          <p className="rounded border border-white/10 bg-black/20 p-2 text-[10px] leading-4 text-slate-500">Pixels and routing context only. No program input, reflex, model-answer, physical safety, or terminal authority.</p>
        </aside>
      </main>
      <footer className="border-t border-white/10 bg-slate-950/80 px-4 py-2 text-[10px] text-slate-500" role="status">{message}</footer>
    </section>
  );
}
