import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { getSweepGuardReasons } from "@/lib/sweep-guards";
import { isCasimirMaterialReceipt } from "@shared/contracts/casimir-material-receipt.v1";
import type { VacuumGapSweepRow } from "@shared/schema";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const valueText = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value : "unreported";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="break-all font-mono text-sm text-slate-100">{value}</div>
    </div>
  );
}

const measured = (value: unknown, unit: string, digits = 3): string => {
  const number = finite(value);
  return number == null ? "unreported" : `${number.toPrecision(digits)} ${unit}`;
};

export default function CavitySweepDiagnosticCard() {
  const { data: pipeline, sweepResults, isLoading } = useEnergyPipeline({ refetchInterval: 2500 });
  const current = asRecord(pipeline);
  const sweep = asRecord(current.sweep);
  const last = asRecord(sweep.last);
  const runtimeRow = finite(last.d_nm) == null ? null : sweep.last as VacuumGapSweepRow;
  const historyRow = sweepResults?.length ? sweepResults[sweepResults.length - 1] : null;
  const row = runtimeRow ?? historyRow;
  const rowOrigin = runtimeRow ? "pipeline sweep.last" : historyRow ? "sweep result history" : "none";
  const rawReceipt = current.casimirMaterialReceipt ?? asRecord(current.natario).casimirMaterialReceipt;
  const receipt = isCasimirMaterialReceipt(rawReceipt) ? rawReceipt : null;
  const guards = getSweepGuardReasons(row);
  const activeSlew = Boolean(sweep.activeSlew || sweep.nextJobActiveSlew || asRecord(asRecord(current.dynamicConfig).sweep).activeSlew);
  const model = valueText(current.casimirModel);
  const mock = Boolean(current.__mockData || current.mock || current.mocked);

  return (
    <section className="space-y-4 text-slate-100">
      <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
        Live pipeline diagnostic{mock ? " (mock fixture)" : ""}. It has no selected NHM2 campaign binding.
        A sweep PASS or a structurally valid material receipt here cannot establish source closure,
        physical viability, or transport.
      </div>
      {!pipeline && !row ? (
        <p className="text-sm text-slate-400">{isLoading ? "Reading pipeline…" : "No cavity or sweep snapshot is available."}</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Gap" value={measured(current.gap_nm, "nm")} />
            <Field label="Tile area" value={measured(current.tileArea_cm2, "cm²")} />
            <Field label="Cavity Q" value={measured(current.qCavity ?? current.cavityQ, "", 4).trim()} />
            <Field label="Model" value={model} />
            <Field label="Static tile energy" value={measured(current.U_static, "J")} />
            <Field label="Effective duty" value={measured(current.dutyEffectiveFR, "", 4).trim()} />
          </div>
          <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
            <h3 className="text-sm font-semibold">Material receipt field</h3>
            <p className="mt-1 text-xs text-slate-400">Contract structure is checked locally; selected-run identity is not established.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Field label="Contract" value={receipt ? receipt.contractVersion : rawReceipt ? "invalid or incomplete" : "missing"} />
              <Field label="Status" value={receipt?.status ?? "unavailable"} />
              <Field label="Tile batch" value={receipt?.tileBatchId ?? "unavailable"} />
              <Field label="Material model" value={receipt?.material.modelKind ?? "unavailable"} />
              <Field label="Gap metrology" value={receipt?.geometry.gapMetrologyStatus ?? "unavailable"} />
              <Field label="Generated at" value={receipt?.generatedAt ?? "unavailable"} />
            </div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
            <h3 className="text-sm font-semibold">Latest sweep observation</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Field label="Origin" value={rowOrigin} />
              <Field label="Job ID" value={valueText(sweep.jobId)} />
              <Field label="Runtime state" value={valueText(sweep.status)} />
              <Field label="Row status" value={row?.status ?? "unreported"} />
              <Field label="Sample gap" value={measured(row?.d_nm, "nm")} />
              <Field label="Pump ratio" value={measured(row?.pumpRatio, "", 4).trim()} />
            </div>
            <p className="mt-3 text-xs text-slate-400">Hardware slew: {activeSlew ? "active" : "not reported active"}</p>
            <p className="mt-1 text-xs text-amber-200">
              Guard reasons: {guards.length ? guards.join("; ") : "none reported by this local guard check"}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
