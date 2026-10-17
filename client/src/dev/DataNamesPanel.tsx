import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { useMetrics } from "@/hooks/use-metrics";
import { driveWarpFromPipeline } from "@/lib/warp-pipeline-adapter";

type Mode = "REAL" | "SHOW";

/** A harmless "spy" engine — captures whatever the adapter would push */
function useSpyEngine() {
	const uniformsRef = useRef<Record<string, any>>({});
	const lcRef = useRef<Record<string, any>>({});
	const engine = useMemo(
		() => ({
			uniforms: uniformsRef.current,
			setLightCrossing(payload: any) { lcRef.current = { ...(payload || {}) }; },
			updateUniforms(patch: any) { uniformsRef.current = { ...uniformsRef.current, ...(patch || {}) }; },
			requestRewarp() {/* noop */},
		}),
		[]
	);
	return {
		engine,
		get uniforms() { return uniformsRef.current; },
		get lc() { return lcRef.current; },
		reset() { uniformsRef.current = {}; lcRef.current = {}; }
	};
}

// ---------- small helpers ----------
const pick = (...xs: any[]) => xs.find((v) => v !== undefined);
const isNum = (x: any): x is number => typeof x === "number" && Number.isFinite(x);
const fmt = (v: any) => (v === undefined || v === null ? "—" : (typeof v === "number" ? (
	Math.abs(v) !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) > 1e3) ? v.toExponential(3) : v.toString()
) : String(v)));
const fmtArr = (a?: any) => (Array.isArray(a) ? `[${a.map((x) => fmt(x)).join(", ")}]` : "—");
const msFromUs = (us?: number) => (isNum(us) ? us / 1000 : undefined);
const toMs = (v?: number, unit: "ms" | "s" | "us" = "ms") =>
	isNum(v) ? (unit === "s" ? v * 1000 : unit === "us" ? v / 1000 : v) : undefined;
const saneMs = (v?: number) => (isNum(v) && v > 0 ? v : undefined);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const hullToAxes = (h?: { a?: number; b?: number; c?: number; Lx_m?: number; Ly_m?: number; Lz_m?: number }) =>
	h ? [pick(h.a, h.Lx_m && h.Lx_m / 2), pick(h.b, h.Ly_m && h.Ly_m / 2), pick(h.c, h.Lz_m && h.Lz_m / 2)].filter(isNum) : undefined;

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
				metrics: metrics as any,
			});
		} catch {
			/* panel is diagnostic only */
		}
	}, [pipeline, metrics, mode]);

	const P: any = pipeline || {};
	const A: any = spy.uniforms || {};
	const L: any = spy.lc || {};

	// ---------- authoritative LC normalization (metrics → pipeline.lc → legacy) ----------
	const lcM = (metrics as any)?.lightCrossing ?? {};
	const lcP = (P?.lc ?? P?.lightCrossing) || {};
	const τ_LC_ms = pick(
		saneMs(toMs(lcM.tauLC_ms, "ms")),
		saneMs(toMs(lcM.tau_ms, "ms")),
		saneMs(toMs(lcM.tauLC_s, "s")),
		saneMs(toMs(lcP.tauLC_ms, "ms")),
		saneMs(toMs(lcP.tau_ms, "ms")),
		saneMs(toMs(lcP.tau_us, "us")),
	);
	const burst_ms = pick(
		saneMs(toMs(lcM.burst_ms, "ms")),
		saneMs(toMs(lcP.burst_ms, "ms")),
		saneMs(toMs(lcP.burst_us, "us")),
	);
	const dwell_ms = pick(
		saneMs(toMs(lcM.dwell_ms, "ms") ?? toMs((metrics as any)?.sectorPeriod_ms, "ms")),
		saneMs(toMs(lcP.dwell_ms, "ms")),
		saneMs(toMs(lcP.dwell_us, "us")),
	);
	const sectorCount = pick(
		(metrics as any)?.totalSectors,
		lcM.sectorCount,
		P?.sectorCount,
		lcP.sectorCount
	);
	const sectorLive = pick(
		(metrics as any)?.activeSectors,
		(metrics as any)?.sectorStrobing,
		P?.sectors ?? P?.sectorsConcurrent
	);
	const dutyFR_calc = (isNum(burst_ms) && isNum(dwell_ms) && isNum(sectorCount) && isNum(sectorLive) && dwell_ms! > 0 && sectorCount! > 0)
		? clamp01((burst_ms! / dwell_ms!) * (sectorLive! / sectorCount!))
		: undefined;
	const dutyFR_api = pick(P?.dutyEffectiveFR, P?.dutyUsed, P?.dutyFR_ship, P?.dutyFR_slice, (metrics as any)?.dutyFR);

	// Optional: modulation freq & derived counts
	const f_mod_Hz = pick(P?.timescales?.f_m_Hz, (metrics as any)?.f_m_Hz);
	const cyclesPerBurst = (isNum(f_mod_Hz) && isNum(burst_ms))
		? f_mod_Hz! * (burst_ms! / 1000) // burst_s
		: P?.lightCrossing?.cyclesPerBurst;
	const TS_ratio = pick(P?.timeScaleRatio, P?.timescales?.TS_long);

	// ---------- rows ----------
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
			<div className="mb-3 flex items-center justify-between">
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
							{row("modulation freq", "timescales.f_m_Hz", f_mod_Hz, undefined)}
							{row("sector count", "sectorCount|metrics.totalSectors", P?.sectorCount, A.sectorCount)}
							{row("concurrent", "sectors|metrics.activeSectors", P?.sectors ?? (metrics as any)?.activeSectors, undefined)}
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
							{row("cycles per burst", "lightCrossing.cyclesPerBurst", cyclesPerBurst, undefined)}
							{row("TS ratio", "timeScaleRatio|timescales.TS_long", TS_ratio, undefined)}
						</tbody>
					</table>
				</div>
			</details>

			{/* UNIFORMS — θ / γ / q */}
			<details className="mb-3 group" open>
				<summary className="cursor-pointer select-none text-[12px] text-cyan-300/90 mb-1">
					Uniforms (adapter → engine)
				</summary>
				<div className="mb-2 text-[11px] text-slate-300/80">Scalars</div>
				<div className="overflow-x-auto">
					<table className="min-w-[720px] w-full">
						<thead>
							<tr>
								<HCell>Field</HCell><HCell>Server/API name</HCell><HCell>API value</HCell><HCell>Adapter → value</HCell><HCell>Engine uniform</HCell>
							</tr>
						</thead>
						<tbody>
							{row("θ (thetaScale)", "thetaScale|thetaUniform|thetaScaleExpected",
								pick(P?.thetaScale, P?.thetaUniform, P?.thetaScaleExpected), A.thetaScale, "thetaScale")}
							{row("γ_VdB", "gammaVanDenBroeck|gammaVdB",
								pick(P?.gammaVdB, P?.gammaVanDenBroeck), pick(A?.gammaVdB, A?.gammaVanDenBroeck), "gammaVdB")}
							{row("q (ΔA/A)", "qSpoilingFactor|deltaAOverA",
								pick(P?.qSpoilingFactor, P?.deltaAOverA), pick(A?.qSpoilingFactor, A?.deltaAOverA), "qSpoilingFactor")}
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
							{row("τ_LC (ms)", "lc.tauLC_ms|tau_ms|tau_us", τ_LC_ms, L.tauLC_ms, "u_tauLC_ms")}
							{row("dwell (ms)", "lc.dwell_ms|dwell_us|(metrics.sectorPeriod_ms)", dwell_ms, L.dwell_ms, "u_dwell_ms")}
							{row("burst (ms)", "lc.burst_ms|burst_us", burst_ms, L.burst_ms, "u_burst_ms")}
							{row("phase", "lc.phase", lcP?.phase, L.phase, "u_phase")}
							{row("onWindow", "lc.onWindow", lcP?.onWindow, L.onWindow, "u_onWindow")}
							{row("sectorIdx", "lc.sectorIdx|metrics.currentSector", pick(lcP?.sectorIdx, (metrics as any)?.currentSector), L.sectorIdx, "u_sectorIdx")}
							{row("sectorCount", "lc.sectorCount|metrics.totalSectors", sectorCount, L.sectorCount, "u_sectorCount")}
							{row("dutyUsed", "dutyUsed|dutyEffectiveFR|dutyFR_slice|dutyFR_ship|metrics.dutyFR", dutyFR_api, A.dutyUsed, "u_dutyUsed")}
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
							<tr><Cell>server seq</Cell><Cell><code>{fmt((P as any)?.seq)}</code></Cell><Cell>monotonic per process</Cell></tr>
							<tr><Cell>server ts</Cell><Cell><code>{fmt((P as any)?.__ts)}</code></Cell><Cell>ms epoch</Cell></tr>
							<tr><Cell>adapter tick (pipeline)</Cell><Cell><code>{fmt((A as any)?.__pipelineTick)}</code></Cell><Cell>propagated to engine</Cell></tr>
							<tr><Cell>adapter tick (metrics)</Cell><Cell><code>{fmt((A as any)?.__metricsTick)}</code></Cell><Cell>if metrics present</Cell></tr>
							<tr><Cell>current mode</Cell><Cell><code>{String(mode)}</code></Cell><Cell>REAL/SHOW</Cell></tr>
						</tbody>
					</table>
				</div>
			</details>
		</div>
	);
}
