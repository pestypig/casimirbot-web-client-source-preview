import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

const textValue = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value : "unreported";

const numberValue = (value: unknown, unit = ""): string =>
  typeof value === "number" && Number.isFinite(value)
    ? `${value.toExponential(3)}${unit ? ` ${unit}` : ""}`
    : "unreported";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="break-all font-mono text-sm text-slate-100">{value}</div>
    </div>
  );
}

export default function MassProvenanceDiagnosticCard() {
  const { data: pipeline, isLoading } = useEnergyPipeline({ refetchInterval: 2500 });
  const current = asRecord(pipeline);
  const warp = asRecord(current.warp ?? current.natario);
  const massMode = textValue(warp.massModeApplied ?? current.massMode);
  const massSource = textValue(warp.massSource ?? current.massSource);
  const datasetId = textValue(current.massDatasetId);
  const fit = asRecord(current.massFitResiduals);
  const matter = asRecord(asRecord(asRecord(current.gr).matter).stressEnergy);
  const override = warp.massOverrideApplied === true;
  const missingMeasuredDataset = massSource === "measured" && datasetId === "unreported";

  return (
    <section className="space-y-4 text-slate-100">
      <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
        Current pipeline mass provenance only. No selected NHM2 run ID or source-side tensor binding is supplied
        by this view; measured, target, and override labels here cannot establish source closure.
      </div>
      {!pipeline ? (
        <p className="text-sm text-slate-400">{isLoading ? "Reading pipeline…" : "No mass snapshot is available."}</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Applied mode" value={massMode} />
            <Field label="Pipeline mode" value={textValue(current.massMode)} />
            <Field label="Mass source" value={massSource} />
            <Field label="Dataset ID" value={datasetId} />
            <Field label="Fit residual RMS" value={numberValue(fit.rms_N, "N")} />
            <Field label="Fit residual relative" value={numberValue(fit.rms_rel)} />
            <Field label="Fit sample count" value={typeof fit.sampleCount === "number" ? String(fit.sampleCount) : "unreported"} />
            <Field label="Mass uncertainty" value={numberValue(current.massSigma_kg, "kg")} />
            <Field label="Invariant mass" value={numberValue(matter.invariantMass_kg, "kg")} />
            <Field label="Invariant uncertainty" value={numberValue(current.invariantMassSigma_kg, "kg")} />
            <Field label="Override" value={override ? "applied" : "not reported applied"} />
            <Field label="Pipeline source" value={textValue(current.massSource)} />
          </div>
          {missingMeasuredDataset ? <p className="text-sm text-amber-200">Measured mass has no dataset ID in this snapshot.</p> : null}
          {current.massSourceNote ? <p className="text-xs text-amber-200">Source note: {textValue(current.massSourceNote)}</p> : null}
          {warp.massOverrideWarning ? <p className="text-xs text-rose-200">Override warning: {textValue(warp.massOverrideWarning)}</p> : null}
        </>
      )}
    </section>
  );
}
