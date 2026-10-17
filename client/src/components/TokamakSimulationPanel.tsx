import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CurvatureBoundaryCondition2D } from "@shared/essence-physics";
import { TokamakPrecursorScoreKey } from "@shared/tokamak-precursor";
import {
  TokamakSimCommandAction,
  type TTokamakSimCommandAction,
  type TTokamakSimState,
} from "@shared/tokamak-sim";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const fetchTokamakState = async (): Promise<TTokamakSimState> => {
  const response = await apiRequest("GET", "/api/physics/tokamak/sim");
  if (!response.ok) {
    throw new Error(`Tokamak sim ${response.status}`);
  }
  return response.json();
};

const postTokamakCommand = async (payload: unknown): Promise<TTokamakSimState> => {
  const response = await apiRequest("POST", "/api/physics/tokamak/command", payload);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Tokamak command ${response.status}`);
  }
  return response.json();
};

const formatNumber = (value?: number, digits = 3): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "n/a";

const formatStatus = (status?: string): string => status ?? "unknown";

const statusTone = (status?: string) => {
  if (status === "running") return "text-emerald-200 border-emerald-400/40";
  if (status === "paused") return "text-amber-200 border-amber-400/40";
  if (status === "completed") return "text-sky-200 border-sky-400/40";
  if (status === "error") return "text-rose-200 border-rose-400/40";
  return "text-slate-200 border-white/10";
};

const MetricCard = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) => (
  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
      {label}
    </div>
    <div className={cn("text-base font-semibold text-white", tone)}>{value}</div>
  </div>
);

export default function TokamakSimulationPanel() {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<TTokamakSimCommandAction>("start");
  const [datasetPath, setDatasetPath] = useState("");
  const [driveHz, setDriveHz] = useState("");
  const [maxLink, setMaxLink] = useState("");
  const [boundary, setBoundary] = useState("dirichlet0");
  const [scoreKey, setScoreKey] = useState("k_combo_v1");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["tokamak-sim"],
    queryFn: fetchTokamakState,
    refetchInterval: 4000,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: postTokamakCommand,
    onSuccess: (next) => {
      queryClient.setQueryData(["tokamak-sim"], next);
    },
  });

  const lastCommand = data?.last_command;
  const telemetry = data?.telemetry;
  const report = data?.report;

  const metrics = useMemo(
    () => [
      { label: "Frame", value: telemetry?.frame_id ?? "n/a" },
      { label: "Score", value: formatNumber(telemetry?.score, 4) },
      { label: "K2", value: formatNumber(telemetry?.k2, 4) },
      { label: "Frag rate", value: formatNumber(telemetry?.fragmentation_rate, 4) },
      { label: "Ridge count", value: `${telemetry?.ridge_count ?? 0}` },
      { label: "Event", value: telemetry?.event_present ? "true" : "false" },
    ],
    [telemetry],
  );

  const parseNumber = (value: string): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const handleSubmit = () => {
    const config: Record<string, unknown> = {
      boundary,
      score_key: scoreKey,
    };
    const drive = parseNumber(driveHz);
    const link = parseNumber(maxLink);
    if (drive !== undefined) config.drive_hz = drive;
    if (link !== undefined) config.max_link_distance_m = link;
    const payload: Record<string, unknown> = { action };
    if (datasetPath.trim()) payload.dataset_path = datasetPath.trim();
    if (Object.keys(config).length) payload.config = config;
    mutation.mutate(payload);
  };

  return (
    <div className="flex h-full flex-col gap-4 bg-slate-950/80 p-4 text-slate-100">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
            Tokamak operations
          </p>
          <h2 className="text-lg font-semibold">Tokamak Simulation</h2>
          <p className="text-xs text-slate-400">
            Curvature + coherence diagnostics with live commands.
          </p>
        </div>
        <div
          className={cn(
            "rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em]",
            statusTone(data?.status),
          )}
        >
          {formatStatus(data?.status)}
        </div>
      </header>

      {isLoading && <p className="text-sm text-slate-400">Loading tokamak state...</p>}
      {error && (
        <p className="text-sm text-rose-300">
          {(error as Error).message || "Tokamak state unavailable"}
        </p>
      )}

      {data && (
        <>
          <section className="grid grid-cols-2 gap-3">
            <MetricCard label="Run id" value={data.run_id ?? "n/a"} />
            <MetricCard
              label="Updated"
              value={new Date(data.updated_at).toLocaleTimeString()}
            />
            <MetricCard label="Dataset" value={data.dataset_path ?? "n/a"} />
            <MetricCard label="AUC" value={formatNumber(report?.auc ?? undefined, 3)} />
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Telemetry snapshot
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {metrics.map((entry) => (
                <MetricCard key={entry.label} label={entry.label} value={entry.value} />
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-400">
              Frame index: {telemetry?.frame_index ?? 0} · timestamp{" "}
              {telemetry?.timestamp_iso ?? "n/a"}
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Command center
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="space-y-3">
                <label className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                  Action
                  <select
                    value={action}
                    onChange={(event) =>
                      setAction(event.target.value as TTokamakSimCommandAction)
                    }
                    className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    {TokamakSimCommandAction.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                  Dataset path
                  <input
                    value={datasetPath}
                    onChange={(event) => setDatasetPath(event.target.value)}
                    placeholder="datasets/tokamak-rz-precursor.fixture.json"
                    className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
              </div>

              <div className="space-y-3">
                <label className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                  Drive Hz
                  <input
                    value={driveHz}
                    onChange={(event) => setDriveHz(event.target.value)}
                    placeholder="0.8"
                    className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <label className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                  Link distance (m)
                  <input
                    value={maxLink}
                    onChange={(event) => setMaxLink(event.target.value)}
                    placeholder="2.5"
                    className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <label className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                  Boundary
                  <select
                    value={boundary}
                    onChange={(event) => setBoundary(event.target.value)}
                    className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    {CurvatureBoundaryCondition2D.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                  Score key
                  <select
                    value={scoreKey}
                    onChange={(event) => setScoreKey(event.target.value)}
                    className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    {TokamakPrecursorScoreKey.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={mutation.isPending}
                className="rounded border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-100 transition hover:bg-white/20 disabled:opacity-50"
              >
                {mutation.isPending ? "Sending" : "Send command"}
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="rounded border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
              >
                Refresh
              </button>
              {mutation.error && (
                <span className="text-xs text-rose-300">
                  {(mutation.error as Error).message}
                </span>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Last command
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
                {lastCommand?.action ?? "none"}
              </span>
              <span className="text-slate-400">
                {lastCommand?.issued_at ?? "n/a"}
              </span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
