import { useMemo, useState } from "react";
import { useEnergyPipeline, useUpdatePipeline } from "@/hooks/use-energy-pipeline";
import { useNhm2SolveState } from "@/hooks/useNhm2SolveState";
import { useProofPack } from "@/hooks/useProofPack";
import { resolveLiveHullDims } from "@/lib/hull-preview-artifacts";
import { parseActivateContract, type ActivateContractView } from "@/lib/time-dilation-activate-contract";
import { readProofString } from "@/lib/proof-pack";
import { Button } from "@/components/ui/button";
import { openNhm2ResearchTool } from "@/store/useNhm2ResearchToolStore";

type Quality = "low" | "medium" | "high";
const DEFAULT_WALL_THICKNESS_M = 0.45;

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export default function TimeDilationActivationDeveloperCard() {
  const { state: solveState } = useNhm2SolveState();
  const { data: pipeline } = useEnergyPipeline({ refetchInterval: 5000 });
  const { data: proofPack } = useProofPack({ refetchInterval: 5000, staleTime: 10000 });
  const updatePipeline = useUpdatePipeline();
  const [quality, setQuality] = useState<Quality>("high");
  const [targetDx, setTargetDx] = useState(5);
  const [includeExtra, setIncludeExtra] = useState(false);
  const [includeMatter, setIncludeMatter] = useState(false);
  const [includeKij, setIncludeKij] = useState(true);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activation, setActivation] = useState<ActivateContractView | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);

  const authority = solveState.geometry.authority;
  const hullDims = useMemo(() => resolveLiveHullDims(pipeline, authority), [
    pipeline, authority.Lx_m, authority.Ly_m, authority.Lz_m,
  ]);
  const canonicalHull = useMemo(() => {
    const hull = (pipeline as any)?.hull;
    if (hull && typeof hull === "object") {
      return {
        ...hull,
        Lx_m: Number.isFinite(hull.Lx_m) ? hull.Lx_m : hullDims.Lx_m,
        Ly_m: Number.isFinite(hull.Ly_m) ? hull.Ly_m : hullDims.Ly_m,
        Lz_m: Number.isFinite(hull.Lz_m) ? hull.Lz_m : hullDims.Lz_m,
        wallThickness_m: Number.isFinite(hull.wallThickness_m)
          ? hull.wallThickness_m : DEFAULT_WALL_THICKNESS_M,
      };
    }
    return { ...hullDims, wallThickness_m: DEFAULT_WALL_THICKNESS_M };
  }, [pipeline, hullDims]);
  const family = readProofString(proofPack, "warp_canonical_family") ??
    (pipeline as any)?.warp?.metricT00Contract?.family ?? "unknown";
  const strict = (pipeline as any)?.strictCongruence !== false;
  const wallInvariant = strict && family === "natario" ? "ricci4" : "kretschmann";

  const requestActivation = async () => {
    setRunning(true);
    setStatus("Updating the live pipeline…");
    setActivation(null);
    setDiagnostics(null);
    try {
      await updatePipeline.mutateAsync({
        hull: canonicalHull,
        warpFieldType: "natario",
        dynamicConfig: { warpFieldType: "natario" },
        grEnabled: true,
        strictCongruence: true,
      } as any);
      setStatus("Pipeline update accepted; requesting asynchronous diagnostics…");
      const response = await fetch("/api/helix/time-dilation/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warpFieldType: "natario",
          grEnabled: true,
          strictCongruence: true,
          applyCanonicalHull: true,
          publishDiagnostics: true,
          async: true,
          kickGrBrick: true,
          kickQuality: quality,
          gridScale: 1.2,
          grTargetDx: targetDx,
          includeExtra,
          includeMatter: includeMatter || includeExtra,
          includeKij: includeKij || includeExtra,
          wallInvariant,
          timeoutMs: 120000,
          diagnosticsTimeoutMs: 120000,
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Activation request failed (${response.status}) ${body}`);
      }
      const result = parseActivateContract(await response.json().catch(() => null));
      if (!result.accepted) throw new Error("Activation route did not accept the request");
      setActivation(result);
      setStatus(result.diagnosticsPartial
        ? "Request accepted; diagnostics are partial or pending. Refresh before interpreting the result."
        : "Request accepted. Inspect the diagnostics receipt before any claim.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Activation request failed");
    } finally {
      setRunning(false);
    }
  };

  const refreshDiagnostics = async () => {
    setStatus("Reading the latest server diagnostics…");
    try {
      const response = await fetch("/api/helix/time-dilation/diagnostics", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Diagnostics read failed (${response.status})`);
      const result = asObject(await response.json());
      setDiagnostics(result);
      setStatus("Latest server diagnostics loaded. Match their source and run identity before using them as evidence.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Diagnostics read failed");
    }
  };

  const exportDiagnostics = () => {
    if (!diagnostics) return;
    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `time-dilation-server-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const diagStatus = diagnostics?.status;
  const diagReason = diagnostics?.reason;
  return <section className="space-y-4 rounded border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-100">
    <div>
      <h3 className="font-semibold">Natario diagnostic activation</h3>
      <p className="text-xs text-amber-200">
        This explicit developer action updates the live pipeline and requests asynchronous GR diagnostics.
        Request acceptance is not proof of a certified metric, viable source, proper-time result, or transport.
        These values are not bound to the selected NHM2 campaign.
      </p>
    </div>
    <div className="grid gap-2 text-xs sm:grid-cols-2">
      <label>GR quality <select className="ml-2 rounded border border-slate-700 bg-slate-900 p-1"
        value={quality} onChange={(event) => setQuality(event.target.value as Quality)}>
        <option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
      </select></label>
      <label>Target dx (m) <input className="ml-2 w-24 rounded border border-slate-700 bg-slate-900 p-1"
        type="number" min="0.1" step="0.1" value={targetDx}
        onChange={(event) => { const value = Number(event.target.value); setTargetDx(Number.isFinite(value) ? Math.max(0.1, value) : 5); }} />
      </label>
      <label><input type="checkbox" checked={includeExtra} onChange={(event) => setIncludeExtra(event.target.checked)} /> Include extra channels</label>
      <label><input type="checkbox" checked={includeMatter} onChange={(event) => setIncludeMatter(event.target.checked)} /> Include matter</label>
      <label><input type="checkbox" checked={includeKij} onChange={(event) => setIncludeKij(event.target.checked)} /> Include Kij</label>
      <span>Wall invariant: {wallInvariant}</span>
    </div>
    <p className="text-xs text-slate-400">
      Canonical-family input: {family}. Hull: {hullDims.Lx_m} × {hullDims.Ly_m} × {hullDims.Lz_m} m.
      Include extra forces matter and Kij in the request.
    </p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={running || updatePipeline.isPending}
        onClick={() => void requestActivation()}>{running ? "Requesting…" : "Request diagnostic activation"}</Button>
      <Button size="sm" variant="outline" onClick={() => void refreshDiagnostics()}>Read latest diagnostics</Button>
      <Button size="sm" variant="outline" disabled={!diagnostics} onClick={exportDiagnostics}>Export latest server JSON</Button>
      <Button size="sm" variant="outline" onClick={() => openNhm2ResearchTool("lattice")}>Open lattice viewer</Button>
    </div>
    <p className="text-xs text-slate-400">In the viewer, the Debug menu's metric-only toggle changes local rendering only.</p>
    {status && <p className="text-xs text-slate-300">{status}</p>}
    {activation && <p className="text-xs text-slate-400">
      Request accepted: {String(activation.accepted)}; strict: {String(activation.strictCongruence)};
      diagnostics partial: {String(activation.diagnosticsPartial)};
      family: {activation.canonical.family ?? "unreported"}; chart: {activation.canonical.chart ?? "unreported"}.
    </p>}
    {diagnostics && <p className="text-xs text-slate-400">
      Server diagnostics status: {typeof diagStatus === "string" ? diagStatus : "unreported"};
      reason: {typeof diagReason === "string" ? diagReason : "unreported"}.
    </p>}
  </section>;
}
