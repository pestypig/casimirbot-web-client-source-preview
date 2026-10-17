import CollapseBenchmarkHUD from "@/components/CollapseBenchmarkHUD";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";

export default function CollapseBenchmarkDiagnosticCard() {
  const { data: pipeline, isFetching, refetch } = useEnergyPipeline({ refetchInterval: 2500 });

  return (
    <div className="space-y-3 text-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Collapse benchmark diagnostic</h3>
          <p className="text-xs text-amber-200">
            This live lattice benchmark posts diagnostic inputs while open. Its server result or local fallback
            is not bound to the selected NHM2 campaign and is not source, viability, or transport proof.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-md border border-cyan-500/40 px-2 py-1 text-xs text-cyan-200 disabled:opacity-50"
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <CollapseBenchmarkHUD pipeline={pipeline ?? null} className="w-full max-w-full sm:max-w-xl" />
    </div>
  );
}
