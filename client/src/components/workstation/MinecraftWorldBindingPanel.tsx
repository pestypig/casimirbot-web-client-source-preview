import React from "react";
import { cn } from "@/lib/utils";

export type MinecraftWorldSourceView = {
  room_id: string;
  source_id: string;
  world_id: string;
  actor_ids: string[];
  latest_actor_id?: string | null;
  latest_actor_label?: string | null;
  latest_event_type: string;
  latest_ts: string;
  event_count: number;
  latest_debug?: {
    append_decision: "appended" | "not_appended";
    append_reason: string;
    salience_class: string;
    binding_id?: string | null;
    thread_id?: string | null;
    dedupe_key?: string | null;
    item_id?: string | null;
    batch_id?: string | null;
    turn_id?: string | null;
  } | null;
};

export type MinecraftBindingView = {
  binding_id: string;
  room_id: string;
  source_id?: string | null;
  world_id?: string | null;
  graph_id?: string | null;
  thread_id: string;
  mode: "observe_only" | "standby_receipts";
  append_policy: "salient_only" | "all_receipts_debug";
};

export function MinecraftWorldBindingPanel({
  detectedSource,
  binding,
  busy,
  status,
  onAttachDetected,
}: {
  detectedSource?: MinecraftWorldSourceView | null;
  binding?: MinecraftBindingView | null;
  busy?: boolean;
  status?: { ok: boolean; message: string; reason?: string | null } | null;
  onAttachDetected: () => void;
}) {
  const mismatched =
    Boolean(binding && detectedSource) &&
    ((binding?.source_id && binding.source_id !== detectedSource?.source_id) ||
      (binding?.world_id && binding.world_id !== detectedSource?.world_id) ||
      binding?.room_id !== detectedSource?.room_id);

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase text-slate-500">Detected Minecraft Source</p>
          <p className="mt-1 text-xs text-slate-400">
            Uses exact plugin ids seen by world-event ingest, avoiding local placeholder source bindings.
          </p>
        </div>
        <span
          className={cn(
            "rounded border px-2 py-0.5 text-[10px] uppercase",
            mismatched
              ? "border-amber-300/35 bg-amber-500/10 text-amber-100"
              : binding
                ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
                : "border-white/15 text-slate-400",
          )}
        >
          {mismatched ? "mismatched" : binding ? "attached" : "observe-only"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="text-[10px] uppercase text-slate-500">Room</p>
          <p className="mt-1 break-all text-xs text-slate-300">{detectedSource?.room_id ?? "not detected"}</p>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="text-[10px] uppercase text-slate-500">Source</p>
          <p className="mt-1 break-all text-xs text-slate-300">{detectedSource?.source_id ?? "not detected"}</p>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="text-[10px] uppercase text-slate-500">World</p>
          <p className="mt-1 break-all text-xs text-slate-300">{detectedSource?.world_id ?? "not detected"}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="text-[10px] uppercase text-slate-500">Latest actor</p>
          <p className="mt-1 break-all text-xs text-slate-300">
            {detectedSource?.latest_actor_label ?? detectedSource?.latest_actor_id ?? "none"}
          </p>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="text-[10px] uppercase text-slate-500">Latest event</p>
          <p className="mt-1 break-all text-xs text-slate-300">{detectedSource?.latest_event_type ?? "none"}</p>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="text-[10px] uppercase text-slate-500">Event count</p>
          <p className="mt-1 text-xs text-slate-300">{detectedSource?.event_count ?? 0}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <div className="rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="text-[10px] uppercase text-slate-500">Append decision</p>
          <p className="mt-1 text-xs text-slate-300">{detectedSource?.latest_debug?.append_decision ?? "none"}</p>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="text-[10px] uppercase text-slate-500">Suppression reason</p>
          <p className="mt-1 break-all text-xs text-slate-300">{detectedSource?.latest_debug?.append_reason ?? "none"}</p>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="text-[10px] uppercase text-slate-500">Salience class</p>
          <p className="mt-1 break-all text-xs text-slate-300">{detectedSource?.latest_debug?.salience_class ?? "none"}</p>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="text-[10px] uppercase text-slate-500">Last item</p>
          <p className="mt-1 break-all text-xs text-slate-300">{detectedSource?.latest_debug?.item_id ?? "none"}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="text-[10px] uppercase text-slate-500">Last batch</p>
          <p className="mt-1 break-all text-xs text-slate-300">{detectedSource?.latest_debug?.batch_id ?? "none"}</p>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="text-[10px] uppercase text-slate-500">Aux turn</p>
          <p className="mt-1 break-all text-xs text-slate-300">{detectedSource?.latest_debug?.turn_id ?? "none"}</p>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="text-[10px] uppercase text-slate-500">Thread</p>
          <p className="mt-1 break-all text-xs text-slate-300">
            {detectedSource?.latest_debug?.thread_id ?? binding?.thread_id ?? "none"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAttachDetected}
          disabled={!detectedSource || busy}
          className="rounded border border-emerald-400/35 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Attach detected Minehut source
        </button>
        <span className="text-[11px] text-slate-500">
          {binding ? `thread ${binding.thread_id} / ${binding.append_policy}` : "No durable thread binding yet."}
        </span>
      </div>
      {status ? (
        <p className={cn("mt-2 text-[11px]", status.ok ? "text-emerald-200" : "text-rose-200")}>
          {status.message}
        </p>
      ) : null}
      {detectedSource?.latest_debug?.dedupe_key ? (
        <p className="mt-2 break-all text-[10px] text-slate-500">dedupe {detectedSource.latest_debug.dedupe_key}</p>
      ) : null}
    </section>
  );
}
