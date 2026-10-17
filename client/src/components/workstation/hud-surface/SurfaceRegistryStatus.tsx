import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link2, ShieldCheck, Unplug } from "lucide-react";
import type { SurfaceDesiredState, SurfaceInstance, SurfaceControlLease } from "@shared/helix-surface-registry";
import type { SurfaceSourceBinding } from "@shared/helix-hud-surface";

type ApiResult = { ok: boolean; surface?: SurfaceInstance; surfaces?: SurfaceInstance[]; lease?: SurfaceControlLease; error?: string; message?: string };

async function api(path: string, init?: RequestInit): Promise<ApiResult> {
  const response = await fetch(`/api/hud-surfaces${path}`, { credentials: "include", headers: init?.body ? { "Content-Type": "application/json" } : undefined, ...init });
  const value = await response.json() as ApiResult;
  if (!response.ok) throw new Error(value.message ?? value.error ?? "Surface Registry request failed");
  return value;
}

export default function SurfaceRegistryStatus({ binding, emergencyBlankRequest = 0 }: { binding: SurfaceSourceBinding; emergencyBlankRequest?: number }) {
  const [surface, setSurface] = useState<SurfaceInstance | null>(null);
  const [lease, setLease] = useState<SurfaceControlLease | null>(null);
  const [message, setMessage] = useState("Connecting to the developer Surface Registry…");
  const [busy, setBusy] = useState(false);
  const handledBlankRequest = useRef(emergencyBlankRequest);
  const desired = useMemo<SurfaceDesiredState>(() => ({
    profile_id: binding.profileId,
    run_id: binding.runId,
    source: { source_id: binding.sourceId, producer_epoch: binding.producerEpoch, source_kind: binding.sourceKind },
    composition_mode: "hud_over_source",
    transform_ref: "normalized-unit-rect-v1",
    output_target: "workstation_preview",
  }), [binding]);

  const sync = useCallback(async () => {
    setBusy(true);
    try {
      const listed = await api("/");
      const match = listed.surfaces?.find((candidate) => candidate.status !== "released" && candidate.desired_state.profile_id === desired.profile_id && candidate.desired_state.run_id === desired.run_id && candidate.desired_state.source.source_id === desired.source.source_id && candidate.desired_state.source.producer_epoch === desired.source.producer_epoch);
      if (match) {
        setSurface(match); setMessage("Canonical state synchronized."); return;
      }
      const created = await api("/", { method: "POST", body: JSON.stringify({ desired_state: desired }) });
      setSurface(created.surface ?? null); setLease(null); setMessage("Registered this normalized HUD preview.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Registry unavailable"); }
    finally { setBusy(false); }
  }, [desired]);

  useEffect(() => { void sync(); }, [sync]);

  const command = async (operation: "configure" | "blank" | "release") => {
    if (!surface) return;
    setBusy(true);
    try {
      const body = operation === "configure"
        ? { operation, expected_revision: surface.revision, desired_state: desired }
        : operation === "blank"
          ? { operation, expected_revision: surface.revision, reason: "emergency_blank" }
          : { operation, expected_revision: surface.revision, reason: "manual_release" };
      const result = await api(`/${surface.surface_instance_id}/commands`, { method: "POST", body: JSON.stringify(body) });
      setSurface(result.surface ?? null); if (operation !== "configure") setLease(null);
      setMessage(operation === "configure" ? "Desired presentation state applied." : operation === "blank" ? "Emergency Blank released output and control leases." : "Surface and leases released.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Command failed"); }
    finally { setBusy(false); }
  };

  const toggleLease = async () => {
    if (!surface) return;
    setBusy(true);
    try {
      if (lease?.status === "active") {
        const result = await api(`/control-leases/${lease.control_lease_id}/revoke`, { method: "POST", body: "{}" });
        setLease(result.lease ?? null); setMessage("Codex surface control lease revoked.");
      } else {
        const result = await api(`/${surface.surface_instance_id}/control-leases`, { method: "POST", body: JSON.stringify({ thread_id: "motorcycle-hud-lab", permitted_operations: ["configure", "blank", "release", "route"], duration_ms: 300_000 }) });
        setLease(result.lease ?? null); setMessage("Five-minute, thread-bound Codex lease issued by the user.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Lease operation failed"); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (emergencyBlankRequest === handledBlankRequest.current) return;
    if (!surface || surface.status === "released") return;
    handledBlankRequest.current = emergencyBlankRequest;
    void command("blank");
  }, [emergencyBlankRequest, surface]);

  return (
    <article className="rounded-lg border border-cyan-300/15 bg-slate-950/70 p-3" data-testid="surface-registry-status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Shared Surface Registry</h2><p className="mt-1 text-[10px] text-slate-500">Developer-only · one canonical state for UI and MCP</p></div>
        <span className={`rounded px-2 py-0.5 font-mono text-[10px] ${surface?.status === "active" ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200"}`}>{surface?.status ?? "offline"}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px] text-slate-400 sm:grid-cols-4">
        <div><span className="block text-slate-600">revision</span>{surface?.revision ?? "—"}</div>
        <div><span className="block text-slate-600">output</span>{surface?.desired_state.output_target ?? "—"}</div>
        <div><span className="block text-slate-600">lease</span>{lease?.status ?? "user only"}</div>
        <div><span className="block text-slate-600">state hash</span><span title={surface?.state_hash}>{surface?.state_hash.slice(0, 10) ?? "—"}</span></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void sync()} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300 disabled:opacity-40"><Link2 className="mr-1 inline" size={12} />Sync</button>
        <button type="button" disabled={busy || !surface || surface.status === "released"} onClick={() => void command("configure")} className="rounded border border-cyan-300/20 px-2 py-1 text-[10px] text-cyan-200 disabled:opacity-40">Apply preview</button>
        <button type="button" disabled={busy || !surface || surface.status === "released"} onClick={() => void toggleLease()} className="rounded border border-violet-300/20 px-2 py-1 text-[10px] text-violet-200 disabled:opacity-40"><ShieldCheck className="mr-1 inline" size={12} />{lease?.status === "active" ? "Revoke Codex" : "Grant Codex 5m"}</button>
        <button type="button" disabled={busy || !surface || surface.status === "released"} onClick={() => void command("blank")} className="rounded border border-red-300/20 px-2 py-1 text-[10px] text-red-200 disabled:opacity-40"><Unplug className="mr-1 inline" size={12} />Registry blank</button>
      </div>
      <p className="mt-2 text-[10px] text-slate-500" role="status">{message}</p>
      <p className="mt-1 text-[9px] text-slate-600">No program input, reflex, or model-answer authority.</p>
    </article>
  );
}
