import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const format = (value: number | null, unit: string): string =>
  value === null ? "unreported" : `${value.toExponential(3)} ${unit}`;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="font-mono text-sm text-slate-100">{value}</div>
    </div>
  );
}

export default function BusPipelineDiagnosticCard() {
  const { data: pipeline, isLoading } = useEnergyPipeline({ refetchInterval: 2500 });
  const snapshot = pipeline as Record<string, unknown> | undefined;
  const mode = typeof snapshot?.currentMode === "string" ? snapshot.currentMode : "unreported";

  return (
    <section className="space-y-4 text-slate-100">
      <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
        Live pipeline calculation. The bus voltage is assigned by mode policy, and bus current is derived
        from applied average power divided by that voltage. These fields are not instrument readings,
        hardware readiness, or selected-run NHM2 evidence.
      </div>
      {!pipeline ? (
        <p className="text-sm text-slate-400">{isLoading ? "Reading pipeline…" : "No pipeline snapshot is available."}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Pipeline mode" value={mode} />
          <Field label="Applied average power" value={format(finite(snapshot?.P_avg_W), "W")} />
          <Field label="Policy bus voltage" value={format(finite(snapshot?.busVoltage_kV), "kV")} />
          <Field label="Derived bus current" value={format(finite(snapshot?.busCurrent_A), "A")} />
        </div>
      )}
      <p className="text-xs text-slate-400">
        Source: server/energy-pipeline.ts. Compare hardware claims against measured, identified load receipts.
      </p>
    </section>
  );
}
