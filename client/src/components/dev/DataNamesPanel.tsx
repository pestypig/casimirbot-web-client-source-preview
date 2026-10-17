import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { useMetrics } from "@/hooks/use-metrics";
import { driveWarpFromPipeline } from "@/lib/warp-pipeline-adapter";

type Mode = "REAL" | "SHOW";

/** A harmless "spy" engine—captures whatever the adapter would push */
function useSpyEngine() {
  const uniformsRef = useRef<Record<string, any>>({});
  const lcRef = useRef<Record<string, any>>({});

  const engine = useMemo(() => {
    return {
      uniforms: uniformsRef.current,
      setLightCrossing(payload: any) {
        lcRef.current = { ...(payload || {}) };
      },
      updateUniforms(patch: any) {
        uniformsRef.current = { ...uniformsRef.current, ...(patch || {}) };
      },
      requestRewarp() {
        /* noop */
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    engine,
    get uniforms() { return uniformsRef.current; },
    get lc() { return lcRef.current; },
    reset() {
      uniformsRef.current = {};
      lcRef.current = {};
    }
  };
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-1 text-xs align-top">{children}</td>;
}
function HCell({ children }: { children: React.ReactNode }) {
  return <th className="px-2 py-1 text-[11px] text-cyan-300 text-left align-top">{children}</th>;
}

export default function DataNamesPanel() {
  const [mode, setMode] = useState<Mode>("REAL");
  const { data: pipeline } = useEnergyPipeline();
  const { data: metrics } = useMetrics(2000);
  const spy = useSpyEngine();

  // Re-run the adapter into the spy whenever inputs change
  useEffect(() => {
    spy.reset();
    if (!pipeline) return;
    try {
      driveWarpFromPipeline(spy.engine as any, pipeline as any, {
        mode,
        strict: false,
        metrics: metrics as any
      });
    } catch (e) {
      // swallow—panel is diagnostic only
      // console.warn("DataNamesPanel adapter error:", e);
    }
  }, [pipeline, metrics, mode]);

  const P: any = pipeline || {};
  const A: any = spy.uniforms || {};
  const L: any = spy.lc || {};

  const row = (label: string, serverKey: string, apiVal: any, adapterVal: any, engineKey?: string) => (
    <tr key={label}>
      <HCell>{label}</HCell>
      <Cell><div className="opacity-80">{serverKey}</div></Cell>
      <Cell><code className="opacity-90">{fmt(apiVal)}</code></Cell>
      <Cell><code className="opacity-90">{fmt(adapterVal)}</code></Cell>
      <Cell>{engineKey ? <code className="opacity-70">{engineKey}</code> : <span className="opacity-40">—</span>}</Cell>
    </tr>
  );

  const tensorRow = (label: string, serverKey: string, apiVal: any, adapterVal: any, shape = "[…]") => (
    <tr key={label}>
      <HCell>{label}</HCell>
      <Cell><div className="opacity-80">{serverKey}</div></Cell>
      <Cell><code className="opacity-90">{fmtArr(apiVal)}</code></Cell>
      <Cell><code className="opacity-90">{fmtArr(adapterVal)}</code></Cell>
      <Cell><span className="opacity-70">{shape}</span></Cell>
    </tr>
  );

  return (
    <div className="mt-6 rounded-2xl border border-cyan-900/40 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-cyan-200">DAG · Props → Calc → Uniforms → GPU → Frame</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-300/80">Mode</span>
          <select
            className="bg-slate-800/80 border border-slate-700/60 rounded px-2 py-1 text-xs"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            <option value="REAL">REAL</option>
            <option value="SHOW">SHOW</option>
          </select>
        </div>
      </div>

      {/* PROPS — raw inputs */}
      <details className="mb-3 group" open>
        <summary className="cursor-pointer select-none text-[12px] text-cyan-300/90 mb-1">
          Props (server inputs & live metrics)
        </summary>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full">
            <thead>
              <tr>
                <HCell>Field</HCell><HCell>Server/API name</HCell><HCell>API value</HCell><HCell>Adapter → value</HCell><HCell>Engine</HCell>
              </tr>
            </thead>
            <tbody>
              {tensorRow("hull axes (m)", "hull→{a,b,c}|axes_m", P?.axes_m || hullToAxes(P?.hull), A.axesMeters, "[a,b,c] m")}
              {row("tile area", "tiles.tileArea_cm2", P?.tiles?.tileArea_cm2, undefined)}
              {row("modulation freq", "timescales.f_m_Hz", P?.timescales?.f_m_Hz, undefined)}
              {row("sector count", "sectorCount|metrics.totalSectors", P?.sectorCount, A.sectorCount)}
              {row("concurrent", "sectors|metrics.activeSectors", P?.sectors ?? metrics?.activeSectors, undefined)}
              {row("gammaGeo", "gammaGeo", P?.gammaGeo, undefined)}
              {row("gammaVdB", "gammaVanDenBroeck|gammaVdB", pick(P?.gammaVdB, P?.gammaVanDenBroeck), undefined)}
              {row("q (ΔA/A)", "qSpoilingFactor|deltaAOverA", pick(P?.qSpoilingFactor, P?.deltaAOverA), undefined)}
            </tbody>
          </table>
        </div>
      </details>

      {/* CALC — pipeline-derived */}
      <details className="mb-3 group" open>
        <summary className="cursor-pointer select-none text-[12px] text-cyan-300/90 mb-1">
          Calc (pipeline-derived)
        </summary>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full">
            <thead>
              <tr>
                <HCell>Field</HCell><HCell>Server/API name</HCell><HCell>API value</HCell><HCell>Adapter → value</HCell><HCell>Engine</HCell>
              </tr>
            </thead>
            <tbody>
              {row("θ_expected", "thetaScaleExpected|thetaAudit.expected", pick(P?.thetaScaleExpected, P?.thetaAudit?.expected), A.thetaScaleExpected)}
              {row("duty FR (ship)", "dutyEffectiveFR", P?.dutyEffectiveFR, A.dutyUsed)}
              {row("cycles per burst", "lightCrossing.cyclesPerBurst", P?.lightCrossing?.cyclesPerBurst, undefined)}
              {row("TS ratio", "timeScaleRatio|timescales.TS_long", pick(P?.timeScaleRatio, P?.timescales?.TS_long), undefined)}
            </tbody>
          </table>
        </div>
      </details>

      {/* UNIFORMS — the full mapping tables you had */}
      <details className="mb-3 group" open>
        <summary className="cursor-pointer select-none text-[12px] text-cyan-300/90 mb-1">
          Uniforms (adapter → engine)
        </summary>

        {/* θ / γ / q */}
        <div className="mb-2 text-[11px] text-slate-300/80">Scalars</div>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full">
            <thead>
              <tr>
                <HCell>Field</HCell><HCell>Server/API name</HCell><HCell>API value</HCell><HCell>Adapter → value</HCell><HCell>Engine uniform</HCell>
              </tr>
            </thead>
            <tbody>
              {row("θ (thetaScale)", "thetaScale|thetaUniform|thetaScaleExpected", pick(P.thetaScale, P.thetaUniform, P.thetaScaleExpected), A.thetaScale, "thetaScale")}
              {row("γ_VdB", "gammaVanDenBroeck|gammaVdB", pick(P.gammaVdB, P.gammaVanDenBroeck), pick(A.gammaVdB, A.gammaVanDenBroeck), "gammaVdB")}
              {row("q (ΔA/A)", "qSpoilingFactor|deltaAOverA", pick(P.qSpoilingFactor, P.deltaAOverA), pick(A.qSpoilingFactor, A.deltaAOverA), "qSpoilingFactor")}
            </tbody>
          </table>
        </div>

        {/* LC */}
        <div className="mt-4 mb-2 text-[11px] text-slate-300/80">Light-Crossing & Strobing</div>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full">
            <thead>
              <tr>
                <HCell>Field</HCell><HCell>Server/API name</HCell><HCell>API value</HCell><HCell>Adapter → value</HCell><HCell>GLSL uniform</HCell>
              </tr>
            </thead>
            <tbody>
              {row("τ_LC (ms)", "lc.tauLC_ms|tau_ms|tau_us", pick(P?.lc?.tauLC_ms, P?.lc?.tau_ms, msFromUs(P?.lc?.tau_us)), L.tauLC_ms, "u_tauLC_ms")}
              {row("dwell (ms)", "lc.dwell_ms|dwell_us", pick(P?.lc?.dwell_ms, msFromUs(P?.lc?.dwell_us)), L.dwell_ms, "u_dwell_ms")}
              {row("burst (ms)", "lc.burst_ms|burst_us", pick(P?.lc?.burst_ms, msFromUs(P?.lc?.burst_us)), L.burst_ms, "u_burst_ms")}
              {row("phase", "lc.phase", P?.lc?.phase, L.phase, "u_phase")}
              {row("onWindow", "lc.onWindow", P?.lc?.onWindow, L.onWindow, "u_onWindow")}
              {row("sectorIdx", "lc.sectorIdx|metrics.currentSector", pick(P?.lc?.sectorIdx, undefined), L.sectorIdx, "u_sectorIdx")}
              {row("sectorCount", "lc.sectorCount|metrics.totalSectors", pick(P?.lc?.sectorCount, undefined), L.sectorCount, "u_sectorCount")}
              {row("dutyUsed", "dutyUsed|dutyEffectiveFR|dutyFR_slice|dutyFR_ship|metrics.dutyFR", pick(P?.dutyUsed, P?.dutyEffectiveFR, P?.dutyFR_slice, P?.dutyFR_ship), A.dutyUsed, "u_dutyUsed")}
            </tbody>
          </table>
        </div>

        {/* Tensors */}
        <div className="mt-4 mb-2 text-[11px] text-slate-300/80">Natário Tensors (3+1)</div>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full">
            <thead>
              <tr>
                <HCell>Field</HCell><HCell>Server/API name</HCell><HCell>API value</HCell><HCell>Adapter → value</HCell><HCell>Engine/GLSL</HCell>
              </tr>
            </thead>
            <tbody>
              {row("metricMode", "natario.metricMode", P?.natario?.metricMode, A.metricMode, "u_metricOn")}
              {row("lapseN", "natario.lapseN", P?.natario?.lapseN, A.lapseN, "u_lapseN")}
              {tensorRow("shiftBeta", "natario.shiftBeta", P?.natario?.shiftBeta, A.shiftBeta, "[βx,βy,βz] → u_shiftBeta")}
              {tensorRow("gSpatialDiag", "natario.gSpatialDiag", P?.natario?.gSpatialDiag, A.gSpatialDiag, "[g11,g22,g33]")}
              {tensorRow("gSpatialSym", "natario.gSpatialSym", P?.natario?.gSpatialSym, A.gSpatialSym, "[gxx,gxy,gxz,gyy,gyz,gzz]")}
              {tensorRow("g0i", "natario.g0i", P?.natario?.g0i, A.g0i, "[g0x,g0y,g0z] → u_g0i")}
              {tensorRow("viewForward", "natario.viewForward", P?.natario?.viewForward, A.viewForward, "[vx,vy,vz] → u_viewForward")}
              {row("T00 (diag)", "natario.stressEnergyTensor.T00", P?.natario?.stressEnergyTensor?.T00, A.T00)}
              {row("T11 (diag)", "natario.stressEnergyTensor.T11", P?.natario?.stressEnergyTensor?.T11, A.T11)}
              {row("T22 (diag)", "natario.stressEnergyTensor.T22", P?.natario?.stressEnergyTensor?.T22, A.T22)}
              {row("T33 (diag)", "natario.stressEnergyTensor.T33", P?.natario?.stressEnergyTensor?.T33, A.T33)}
            </tbody>
          </table>
        </div>

        {/* Geometry */}
        <div className="mt-4 mb-2 text-[11px] text-slate-300/80">Geometry (wall/axes)</div>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full">
            <thead>
              <tr>
                <HCell>Field</HCell><HCell>Server/API name</HCell><HCell>API value</HCell><HCell>Adapter → value</HCell><HCell>Engine/GLSL</HCell>
              </tr>
            </thead>
            <tbody>
              {row("wallWidth_m", "wallWidth_m", P?.wallWidth_m, A.wallWidth_m, "u_wallWidth_m")}
              {row("wallWidth_rho", "wallWidth_rho", P?.wallWidth_rho, A.wallWidth_rho, "u_wallWidth")}
              {tensorRow("axesMeters", "axes_m|hull→{a,b,c}", P?.axes_m || hullToAxes(P?.hull), A.axesMeters, "[a,b,c] m")}
              {tensorRow("axesHull", "hull→{a,b,c}", hullToAxes(P?.hull), A.axesHull, "[a,b,c] m")}
            </tbody>
          </table>
        </div>
      </details>

      {/* GPU — GLSL bindings/presence */}
      <details className="mb-3 group" open>
        <summary className="cursor-pointer select-none text-[12px] text-cyan-300/90 mb-1">
          GPU (GLSL uniforms)
        </summary>
        <div className="overflow-x-auto">
          <table className="min-w-[600px] w-full">
            <thead>
              <tr>
                <HCell>GLSL</HCell><HCell>Current (adapter payload)</HCell><HCell>Notes</HCell>
              </tr>
            </thead>
            <tbody>
              <tr><Cell><code>u_tauLC_ms</code></Cell><Cell><code>{fmt(L.tauLC_ms)}</code></Cell><Cell>ms</Cell></tr>
              <tr><Cell><code>u_dwell_ms</code></Cell><Cell><code>{fmt(L.dwell_ms)}</code></Cell><Cell>ms</Cell></tr>
              <tr><Cell><code>u_burst_ms</code></Cell><Cell><code>{fmt(L.burst_ms)}</code></Cell><Cell>ms</Cell></tr>
              <tr><Cell><code>u_phase</code></Cell><Cell><code>{fmt(L.phase)}</code></Cell><Cell>0..1</Cell></tr>
              <tr><Cell><code>u_onWindow</code></Cell><Cell><code>{fmt(L.onWindow)}</code></Cell><Cell>0/1</Cell></tr>
              <tr><Cell><code>u_sectorIdx</code></Cell><Cell><code>{fmt(L.sectorIdx)}</code></Cell><Cell>int</Cell></tr>
              <tr><Cell><code>u_sectorCount</code></Cell><Cell><code>{fmt(L.sectorCount)}</code></Cell><Cell>int</Cell></tr>
              <tr><Cell><code>u_dutyUsed</code></Cell><Cell><code>{fmt(A.dutyUsed)}</code></Cell><Cell>0..1</Cell></tr>
              <tr><Cell><code>u_metricOn</code></Cell><Cell><code>{fmt(A.metricMode)}</code></Cell><Cell>branch metric math</Cell></tr>
            </tbody>
          </table>
        </div>
      </details>

      {/* FRAME — stamps/provenance */}
      <details className="group" open>
        <summary className="cursor-pointer select-none text-[12px] text-cyan-300/90 mb-1">
          Frame (stamps & provenance)
        </summary>
        <div className="overflow-x-auto">
          <table className="min-w-[520px] w-full">
            <thead>
              <tr>
                <HCell>Field</HCell><HCell>Value</HCell><HCell>Notes</HCell>
              </tr>
            </thead>
            <tbody>
              <tr><Cell>server seq</Cell><Cell><code>{fmt((pipeline as any)?.seq)}</code></Cell><Cell>monotonic per process</Cell></tr>
              <tr><Cell>server ts</Cell><Cell><code>{fmt((pipeline as any)?.__ts)}</code></Cell><Cell>ms epoch</Cell></tr>
              <tr><Cell>adapter tick (pipeline)</Cell><Cell><code>{fmt((A as any)?.__pipelineTick)}</code></Cell><Cell>propagated to engine</Cell></tr>
              <tr><Cell>adapter tick (metrics)</Cell><Cell><code>{fmt((A as any)?.__metricsTick)}</code></Cell><Cell>if metrics present</Cell></tr>
              <tr><Cell>current mode</Cell><Cell><code>{fmt(mode)}</code></Cell><Cell>REAL/SHOW</Cell></tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ----------------- helpers -----------------
function pick<T>(...vals: T[]) {
  for (const v of vals) if (v !== undefined && v !== null) return v as T;
  return undefined;
}
function msFromUs(x: any) {
  const n = +x;
  return Number.isFinite(n) ? n / 1000 : undefined;
}
function fmt(v: any) {
  if (v == null) return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    if (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3) return v.toExponential(3);
    return String(Math.round(v * 1e6) / 1e6);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}
function fmtArr(a: any) {
  if (!Array.isArray(a)) return "—";
  return "[" + a.map((x) => (Number.isFinite(+x) ? fmt(+x) : "—")).join(", ") + "]";
}
function hullToAxes(h: any) {
  if (!h) return undefined;
  const a = +h.a, b = +h.b, c = +h.c;
  return [a, b, c].every(Number.isFinite) ? [a, b, c] : undefined;
}
