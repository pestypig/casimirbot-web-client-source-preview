import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEnergyPipeline, useUpdatePipeline } from "@/hooks/use-energy-pipeline";
import { useQiControllerState } from "@/hooks/useQiControllerState";
import {
  DEFAULT_QI_AUTO_CONSTRAINTS,
  solveQiAutoSetpoint,
  type QiAutoTuneConstraints,
} from "@/lib/qi/qi-auto-tuner";
import { apiRequest } from "@/lib/queryClient";
import { clamp } from "@/lib/utils";
import type { QiControllerState, QiSetpointSuggestion } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { QiTileGuardBands } from "./QiTileGuardBands";

const CONSTRAINT_FIELDS: Array<{
  key: keyof QiAutoTuneConstraints;
  label: string;
  step?: string;
}> = [
  { key: "gapMin_nm", label: "Gap min (nm)" },
  { key: "gapMax_nm", label: "Gap max (nm)" },
  { key: "dutyMin", label: "Duty min", step: "0.001" },
  { key: "dutyMax", label: "Duty max", step: "0.01" },
  { key: "marginFrac", label: "Guard fraction", step: "0.01" },
  { key: "maxGapStep_nm", label: "Max gap step (nm)" },
  { key: "maxDutyStep", label: "Max duty step", step: "0.001" },
];

const fmt = (value: unknown, digits = 3) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "unreported";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="font-mono text-sm text-slate-100">{value}</div>
    </div>
  );
}

export function QiAutoTunerPanel() {
  const { data: pipeline } = useEnergyPipeline();
  const controllerQuery = useQiControllerState();
  const controllerState = controllerQuery.data;
  const updateMutation = useUpdatePipeline();
  const queryClient = useQueryClient();
  const [constraints, setConstraints] = useState<QiAutoTuneConstraints>(DEFAULT_QI_AUTO_CONSTRAINTS);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [intentAggressiveness, setIntentAggressiveness] = useState(0.5);
  const [lastIssued, setLastIssued] = useState<number | null>(null);
  const autoTickRef = useRef(0);

  const setpoint = useMemo(() => solveQiAutoSetpoint(pipeline, constraints), [pipeline, constraints]);
  const dutyCycle = Number(pipeline?.dutyCycle) || setpoint?.currentDuty || 0;
  const controllerUnavailable = controllerQuery.isError || (controllerQuery.isFetched && !controllerState);
  const qiGuard = pipeline?.qiGuardrail;

  const suggestionMutation = useMutation({
    mutationFn: async (payload: QiSetpointSuggestion) => {
      const response = await apiRequest("POST", "/api/qi/setpoint", payload);
      return (await response.json()) as QiControllerState;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["qi-controller-state"], next);
      setLastIssued(Date.now());
    },
  });

  const pushLegacySetpoint = useCallback(() => {
    if (!setpoint) return;
    const dutyScale = setpoint.currentDuty > 1e-9
      ? setpoint.candidateDuty / setpoint.currentDuty
      : 1;
    const nextDutyCycle = clamp(
      dutyCycle * dutyScale,
      constraints.dutyMin,
      constraints.dutyMax,
    );
    updateMutation.mutate({
      gap_nm: setpoint.candidateGap_nm,
      localBurstFrac: setpoint.candidateDuty,
      dutyCycle: nextDutyCycle,
    });
    setLastIssued(Date.now());
  }, [setpoint, dutyCycle, constraints.dutyMin, constraints.dutyMax, updateMutation]);

  const sendSuggestion = useCallback((
    intent: QiSetpointSuggestion["intent"],
    aggressiveness?: number,
  ) => {
    if (controllerState) {
      suggestionMutation.mutate({
        intent,
        aggressiveness: aggressiveness ?? intentAggressiveness,
      });
    } else if (intent !== "hold") {
      pushLegacySetpoint();
    }
  }, [controllerState, suggestionMutation, intentAggressiveness, pushLegacySetpoint]);

  useEffect(() => {
    if (!autoEnabled) return;
    const now = Date.now();
    if (now - autoTickRef.current < 1500) return;
    if (controllerState) {
      if (suggestionMutation.isPending) return;
      if (controllerState.safetyState === "QI_AT_RISK") {
        sendSuggestion("increase_margin", 1);
        autoTickRef.current = now;
      } else if (controllerState.safetyState === "MARGIN_LOW") {
        sendSuggestion("increase_margin", 0.7);
        autoTickRef.current = now;
      }
      return;
    }
    if (setpoint?.needsAdjust && !updateMutation.isPending) {
      pushLegacySetpoint();
      autoTickRef.current = now;
    }
  }, [
    autoEnabled,
    controllerState,
    suggestionMutation.isPending,
    sendSuggestion,
    setpoint?.needsAdjust,
    updateMutation.isPending,
    pushLegacySetpoint,
  ]);

  const actionPending = suggestionMutation.isPending || updateMutation.isPending;
  const canSuggest = !actionPending && (controllerState != null || Boolean(setpoint?.needsAdjust));

  return (
    <section className="space-y-4 text-slate-100">
      <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
        Developer controller controls for the live pipeline. Controller margin and the local heuristic are
        operational diagnostics; neither is a QEI worldline dossier or selected-run NHM2 proof. When the
        controller is unavailable, manual requests and Auto-guard can write gap and duty directly through
        the existing pipeline update path.
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Controller state" value={controllerState?.safetyState ?? (controllerUnavailable ? "unavailable" : "loading")} />
        <Field label="Controller margin" value={`${fmt(controllerState?.marginMin_Jm3, 4)} J/m³`} />
        <Field label="Controller target" value={`${fmt(controllerState?.marginTarget_Jm3, 4)} J/m³`} />
        <Field label="Controller hysteresis" value={`${fmt(controllerState?.marginHysteresis_Jm3, 4)} J/m³`} />
        <Field label="Controller intent mode" value={controllerState?.marginMode ?? "unreported"} />
        <Field label="Optimizer achieved / target" value={`${fmt(controllerState?.optimizer?.achievedEnergy_Jm3, 2)} / ${fmt(controllerState?.optimizer?.targetEnergy_Jm3, 2)} J/m³`} />
        <Field label="Payback achieved / required" value={`${fmt(controllerState?.payback?.achieved, 0)} / ${fmt(controllerState?.payback?.required, 0)}`} />
        <Field label="Controller cycle" value={`${fmt(controllerState?.cycleTime_ms, 1)} ms`} />
        <Field label="QI rho source" value={String(qiGuard?.rhoSource ?? "unreported")} />
        <Field label="Metric path" value={`${qiGuard?.metricDerived === true ? "geometry-derived" : qiGuard?.metricDerived === false ? "proxy-only" : "unknown"} (${String(qiGuard?.metricDerivedSource ?? "unreported")})`} />
        <Field label="Curvature window" value={qiGuard?.curvatureOk === true ? "reported OK" : qiGuard?.curvatureOk === false ? "reported fail" : "unreported"} />
      </div>

      <details className="rounded border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
        <summary className="cursor-pointer font-semibold">Reported pipeline QI telemetry</summary>
        <p className="mt-2 text-amber-200">
          Live pipeline fields only. Their badge, margin, interest, and homogenizer values are not an authenticated
          QEI worldline dossier or selected-run NHM2 proof.
        </p>
        {pipeline?.qi ? <div className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <span>Pipeline badge: {pipeline.qiBadge ?? "unreported"}</span>
          <span>Observer: {pipeline.qi.observerId ?? "unreported"}</span>
          <span>Average / bound: {fmt(pipeline.qi.avg, 4)} / {fmt(pipeline.qi.bound, 4)}</span>
          <span>Margin: {fmt(pipeline.qi.margin, 4)}</span>
          <span>Window / step: {fmt(pipeline.qi.window_ms, 2)} / {fmt(pipeline.qi.dt_ms, 2)} ms</span>
          <span>Samples: {fmt(pipeline.qi.samples, 0)}</span>
          <span>Sampler / width: {pipeline.qi.sampler ?? "unreported"} / {fmt(pipeline.qi.tau_s_ms, 2)} ms</span>
          <span>Interest debt / credit: {fmt(pipeline.qi.interestDebt, 4)} / {fmt(pipeline.qi.interestCredit, 4)}</span>
          <span>Interest margin / window: {fmt(pipeline.qi.interestMargin, 4)} / {fmt(pipeline.qi.interestWindow_ms, 2)} ms</span>
          <span>Interest net cycle: {fmt(pipeline.qi.interestNetCycle, 4)}</span>
          <span>Homogenizer source: {pipeline.qi.homogenizerSource ?? "unreported"}</span>
          <span>Variance / gradient: {fmt(pipeline.qi.varT00_lattice)} / {fmt(pipeline.qi.gradT00_norm)}</span>
          <span>C_warp / QI envelope %: {fmt(pipeline.qi.C_warp)} / {fmt(pipeline.qi.QI_envelope_okPct, 1)}</span>
          <span>Autoscale gate: {pipeline.qiAutoscale?.gating ?? "unreported"}</span>
          <span>Autoscale applied / raw ζ: {fmt(pipeline.qiAutoscale?.appliedScale)} / {fmt(pipeline.qiAutoscale?.zetaRaw)}</span>
        </div> : <p className="mt-2 text-slate-400">No pipeline QI telemetry reported.</p>}
      </details>

      {controllerState ? <QiTileGuardBands controllerState={controllerState} limit={10} /> : null}

      <div className="space-y-3 rounded border border-slate-800 bg-slate-950/60 p-3 text-sm">
        <div className="font-semibold">Local heuristic preview</div>
        {setpoint ? (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              <Field label="Gap: current → candidate" value={`${fmt(setpoint.currentGap_nm, 2)} → ${fmt(setpoint.candidateGap_nm, 2)} nm`} />
              <Field label="Duty: current → candidate" value={`${fmt(setpoint.currentDuty, 5)} → ${fmt(setpoint.candidateDuty, 5)}`} />
              <Field label="Proxy margin / guard" value={`${fmt(setpoint.margin, 4)} / ${fmt(setpoint.guardMargin, 4)}`} />
              <Field label="Predicted margin" value={fmt(setpoint.predictedMargin, 4)} />
            </div>
            {setpoint.saturated ? <p className="text-amber-200">The local heuristic hit an actuator limit.</p> : null}
            <ul className="list-disc pl-5 text-xs text-slate-400">
              {setpoint.notes.map((note, index) => <li key={index}>{note}</li>)}
            </ul>
          </>
        ) : <p className="text-slate-400">No local heuristic preview is available from this pipeline snapshot.</p>}
        <details className="rounded border border-slate-800 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-300">Legacy fallback limits</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CONSTRAINT_FIELDS.map(({ key, label, step }) => (
              <Label key={key} className="space-y-1 text-xs text-slate-300">
                <span>{label}</span>
                <Input
                  type="number"
                  step={step}
                  value={constraints[key]}
                  onChange={(event) => {
                    const next = Number(event.currentTarget.value);
                    if (Number.isFinite(next)) setConstraints((previous) => ({ ...previous, [key]: next }));
                  }}
                />
              </Label>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setConstraints(DEFAULT_QI_AUTO_CONSTRAINTS)}>
            Reset limits
          </Button>
        </details>
      </div>

      <div className="space-y-3 rounded border border-slate-800 bg-slate-950/60 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Switch checked={autoEnabled} onCheckedChange={(checked) => setAutoEnabled(Boolean(checked))} />
          <span>Auto-guard: {autoEnabled ? controllerState ? "controller suggestions" : "legacy pipeline fallback" : "off"}</span>
          <Label htmlFor="qi-intent-aggressiveness">Intent aggressiveness</Label>
          <input id="qi-intent-aggressiveness" type="range" min="0" max="1" step="0.05"
            value={intentAggressiveness} onChange={(event) => setIntentAggressiveness(Number(event.currentTarget.value))}
            className="w-40 accent-sky-400" />
          <span className="font-mono">{Math.round(intentAggressiveness * 100)}%</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!canSuggest} onClick={() => sendSuggestion("increase_margin")}>Request margin</Button>
          <Button variant="secondary" disabled={!canSuggest} onClick={() => sendSuggestion("increase_negative_energy")}>Push negative energy</Button>
          <Button variant="ghost" disabled={!controllerState || actionPending} onClick={() => sendSuggestion("hold", 0)}>Hold / clear</Button>
        </div>
        <p className="text-xs text-slate-400">
          {lastIssued ? `Last request issued ${Math.max(0, Math.round((Date.now() - lastIssued) / 1000))}s ago.` : "No request issued in this mount."}
          {controllerUnavailable ? " Controller API unavailable; non-hold requests use the legacy pipeline path." : ""}
        </p>
        {suggestionMutation.isError || updateMutation.isError ? (
          <p className="text-xs text-rose-200">The latest control request failed. Check the live controller or pipeline response.</p>
        ) : null}
      </div>
    </section>
  );
}

export default QiAutoTunerPanel;
