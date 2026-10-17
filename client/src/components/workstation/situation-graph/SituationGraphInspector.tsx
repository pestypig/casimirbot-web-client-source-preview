import React from "react";
import { Link2 } from "lucide-react";
import type { SituationGraphNode, SituationRoomGraph } from "@shared/helix-situation-graph";

type TranslationPairConfigView = {
  speaker_a_id?: string;
  speaker_b_id?: string;
  speaker_a_native_language?: string;
  speaker_b_native_language?: string;
  voice_output?: string;
};

export function SituationGraphInspector({
  graph,
  node,
  onAttach,
}: {
  graph: SituationRoomGraph;
  node?: SituationGraphNode;
  onAttach: () => void;
}) {
  const configEntries = Object.entries(node?.config ?? {}).slice(0, 8);
  const paramEntries = Object.entries(node?.params ?? {}).slice(0, 10);
  const translationPair =
    node?.config?.translation_pair && typeof node.config.translation_pair === "object"
      ? (node.config.translation_pair as TranslationPairConfigView)
      : null;
  const speakerRows = translationPair
    ? [
        {
          role: "Speaker A",
          speaker_id: translationPair.speaker_a_id,
          native_language: translationPair.speaker_a_native_language,
        },
        {
          role: "Speaker B",
          speaker_id: translationPair.speaker_b_id,
          native_language: translationPair.speaker_b_native_language,
        },
      ]
    : [];
  return (
    <aside className="min-h-0 rounded-lg border border-white/10 bg-black/20 p-3 xl:sticky xl:top-3 xl:self-start">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Inspector</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{node?.title ?? graph.title}</p>
        </div>
        <button
          type="button"
          onClick={onAttach}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-cyan-400/35 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20"
        >
          <Link2 className="h-3.5 w-3.5" />
          Attach
        </button>
      </div>
      <div className="mt-3 space-y-2 text-[11px] text-slate-300">
        <p>
          <span className="text-slate-500">Graph:</span> {graph.graph_id}
        </p>
        <p>
          <span className="text-slate-500">Room:</span> {graph.room_id}
        </p>
        {node ? (
          <>
            <p>
              <span className="text-slate-500">Node:</span> {node.node_id}
            </p>
            <p>
              <span className="text-slate-500">Type:</span> {node.type}
            </p>
            <p>
              <span className="text-slate-500">Column:</span> {node.column}
            </p>
            {node.capability_id ? (
              <p>
                <span className="text-slate-500">Capability:</span> {node.capability_id}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      {node?.runtime ? (
        <div className="mt-3 rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="mb-2 text-[10px] font-semibold uppercase text-slate-500">Runtime</p>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
            <span>Events {node.runtime.event_count ?? 0}</span>
            <span>Inputs {node.runtime.input_count ?? 0}</span>
            <span>Outputs {node.runtime.output_count ?? 0}</span>
            <span>Errors {node.runtime.error_count ?? 0}</span>
            {node.runtime.status_text ? <span className="col-span-2">Status {node.runtime.status_text}</span> : null}
            <span className="col-span-2">Updated {node.runtime.last_updated_at ?? "not yet"}</span>
            {node.runtime.last_error ? <span className="col-span-2 text-rose-200">{node.runtime.last_error}</span> : null}
          </div>
        </div>
      ) : null}
      {speakerRows.length > 0 ? (
        <div className="mt-3 rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="mb-2 text-[10px] font-semibold uppercase text-slate-500">Speaker Map</p>
          <div className="grid grid-cols-[70px_minmax(0,1fr)_90px] gap-1 text-[10px] text-slate-400">
            <span>Speaker</span>
            <span>Label</span>
            <span>Native</span>
            {speakerRows.map((speaker) => (
              <React.Fragment key={speaker.role}>
                <span className="text-slate-300">{speaker.role}</span>
                <span className="truncate">{speaker.speaker_id ?? "unbound"}</span>
                <span className="truncate">{speaker.native_language ?? "unknown"}</span>
              </React.Fragment>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">Authority stays transcribe-only until a separate trust flow runs.</p>
        </div>
      ) : null}
      {configEntries.length > 0 ? (
        <div className="mt-3 rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="mb-2 text-[10px] font-semibold uppercase text-slate-500">Config</p>
          <div className="space-y-1">
            {configEntries.map(([key, value]) => (
              <p key={key} className="break-all text-[10px] text-slate-400">
                <span className="text-slate-200">{key}</span>: {JSON.stringify(value)}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      {paramEntries.length > 0 ? (
        <div className="mt-3 rounded border border-white/10 bg-slate-950/70 p-2">
          <p className="mb-2 text-[10px] font-semibold uppercase text-slate-500">Parameters</p>
          <div className="space-y-1">
            {paramEntries.map(([key, value]) => (
              <p key={key} className="break-all text-[10px] text-slate-400">
                <span className="text-slate-200">{key}</span>: {JSON.stringify(value)}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-3 rounded border border-white/10 bg-slate-950/70 p-2 text-[10px] text-slate-500">
        Context attachment is manual only. Graph inspection does not grant speaker or command authority.
      </div>
    </aside>
  );
}
