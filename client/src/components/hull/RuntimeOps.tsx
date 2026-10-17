import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type QueueSnapshot = {
  backend: "redis" | "local";
  active: Record<string, number>;
  pending: Record<string, number> | null;
};

type EndpointStatus = {
  url: string;
  allowed: boolean;
} | null;

type RuntimeOpsResponse = {
  hull_mode: boolean;
  allow_hosts: string[];
  llm_policy: string;
  llm_runtime: string | null;
  llm_local: { base: string | null; model: string | null };
  llm_http: EndpointStatus;
  stt_http: EndpointStatus;
  diff_http: EndpointStatus;
  gpu: { temp_c: number; max_c: number; override: string | null };
  queue: QueueSnapshot;
  kv: { budget_bytes: number | null; evict_strategy: string | null };
  timestamp: string;
};

const fetchRuntimeStatus = async (): Promise<RuntimeOpsResponse> => {
  const response = await fetch("/api/hull/status");
  if (!response.ok) {
    throw new Error(`Runtime status ${response.status}`);
  }
  return response.json();
};

const formatBytes = (value?: number | null): string => {
  if (!value || value <= 0) {
    return "--";
  }
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let next = value;
  while (next >= 1024 && idx < units.length - 1) {
    next /= 1024;
    idx += 1;
  }
  return `${next.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
};

const endpointBadge = (label: string, endpoint: EndpointStatus) => {
  if (!endpoint) {
    return (
      <div className="rounded border border-slate-800 px-3 py-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-300">disabled</p>
      </div>
    );
  }
  return (
    <div className="rounded border border-slate-800 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("text-sm font-semibold", endpoint.allowed ? "text-emerald-300" : "text-amber-300")}>
        {endpoint.allowed ? "allowed" : "blocked"}
      </p>
      <p className="text-xs text-slate-400 break-all">{endpoint.url}</p>
    </div>
  );
};

export default function RuntimeOps() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["runtime-ops"],
    queryFn: fetchRuntimeStatus,
    refetchInterval: 15000,
    retry: 2,
  });

  const queueRows = useMemo(() => {
    if (!data?.queue) return [];
    return Object.entries(data.queue.active).map(([name, active]) => ({
      name,
      active,
      pending: data.queue.pending?.[name] ?? null,
    }));
  }, [data]);

  const allowHosts = data?.allow_hosts ?? [];
  const timestamp = data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : "";

  return (
    <div className="flex h-full flex-col gap-4 bg-slate-950/80 p-4 text-slate-100">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Plan B</p>
          <h2 className="text-lg font-semibold">Runtime Ops</h2>
          <p className="text-xs text-slate-500">
            {data?.hull_mode ? "Hull Mode enforced" : "Hull Mode disabled"}
            {timestamp ? ` - ${timestamp}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded border border-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
        >
          Refresh
        </button>
      </header>

      {isLoading && <p className="text-sm text-slate-400">Loading runtime telemetry...</p>}
      {error && (
        <p className="text-sm text-rose-300">
          {(error as Error).message || "Runtime status unavailable"}
        </p>
      )}

      {data && (
        <>
          <section className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-slate-800 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">LLM Policy</p>
              <p className="text-base font-semibold text-slate-100">{data.llm_policy}</p>
            </div>
            <div className="rounded border border-slate-800 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Local Runtime</p>
              <p className="text-base font-semibold text-slate-100">
                {data.llm_runtime ?? data.llm_local.model ?? "local"}
              </p>
              {data.llm_local.base && <p className="text-xs text-slate-500">{data.llm_local.base}</p>}
            </div>
            <div className="rounded border border-slate-800 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">GPU Thermals</p>
              <p className="text-base font-semibold text-slate-100">
                {data.gpu.temp_c} °C / {data.gpu.max_c} °C
              </p>
              {data.gpu.override && <p className="text-xs text-slate-400">override {data.gpu.override}</p>}
            </div>
            <div className="rounded border border-slate-800 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">KV Budget</p>
              <p className="text-base font-semibold text-slate-100">{formatBytes(data.kv.budget_bytes)}</p>
              <p className="text-xs text-slate-400">{data.kv.evict_strategy}</p>
            </div>
          </section>

          <section className="grid grid-cols-3 gap-3 text-sm">
            {endpointBadge("LLM HTTP", data.llm_http)}
            {endpointBadge("STT HTTP", data.stt_http)}
            {endpointBadge("Diffusion HTTP", data.diff_http)}
          </section>

          <section className="rounded border border-slate-800 p-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
              <span>Queues ({data.queue.backend})</span>
            </div>
            <div className="mt-2 space-y-2 text-sm">
              {queueRows.map((row) => (
                <div key={row.name} className="flex items-center justify-between rounded border border-slate-900 px-2 py-1">
                  <span className="font-medium text-slate-200">{row.name}</span>
                  <span className="text-slate-300">
                    active {row.active}
                    {row.pending !== null ? ` - pending ${row.pending}` : ""}
                  </span>
                </div>
              ))}
              {queueRows.length === 0 && <p className="text-slate-500">No queue telemetry.</p>}
            </div>
          </section>

          <section className="rounded border border-slate-800 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Allowed hosts</p>
            <div className="flex flex-wrap gap-2 text-xs">
              {allowHosts.map((host) => (
                <span key={host} className="rounded border border-slate-800 px-2 py-1 text-slate-200">
                  {host}
                </span>
              ))}
              {allowHosts.length === 0 && <span className="text-slate-500">-</span>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
