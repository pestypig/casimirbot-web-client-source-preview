import { Bot, FileText, Languages, Mic, MonitorSpeaker, ScrollText, Shield, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SituationGraphNode } from "@shared/helix-situation-graph";

const nodeTone = (type: SituationGraphNode["type"]): string => {
  if (type.startsWith("source.")) return "border-blue-400/35 bg-blue-500/10 text-blue-100";
  if (type.startsWith("speaker.")) return "border-amber-400/35 bg-amber-500/10 text-amber-100";
  if (type === "translate") return "border-violet-400/35 bg-violet-500/10 text-violet-100";
  if (type.startsWith("output.")) return "border-slate-400/35 bg-slate-500/10 text-slate-100";
  if (type.startsWith("helix.")) return "border-cyan-400/35 bg-cyan-500/10 text-cyan-100";
  return "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";
};

const iconForNode = (type: SituationGraphNode["type"]) => {
  if (type === "source.audio.mic") return <Mic className="h-3.5 w-3.5" />;
  if (type === "source.audio.display") return <MonitorSpeaker className="h-3.5 w-3.5" />;
  if (type.startsWith("speaker.")) return <UserRound className="h-3.5 w-3.5" />;
  if (type === "translate") return <Languages className="h-3.5 w-3.5" />;
  if (type === "transcript.buffer") return <ScrollText className="h-3.5 w-3.5" />;
  if (type.startsWith("output.")) return <FileText className="h-3.5 w-3.5" />;
  if (type === "helix.interjection_gate") return <Shield className="h-3.5 w-3.5" />;
  return <Bot className="h-3.5 w-3.5" />;
};

export function SituationGraphNodeCard({
  node,
  selected,
  onSelect,
}: {
  node: SituationGraphNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        nodeTone(node.type),
        selected ? "ring-1 ring-cyan-300/50" : "hover:border-white/35",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{iconForNode(node.type)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white">{node.title}</p>
          <p className="mt-1 truncate text-[10px] opacity-80">{node.subtitle ?? node.type}</p>
        </div>
        <span className="shrink-0 rounded border border-white/15 bg-black/20 px-1.5 py-0.5 text-[9px] uppercase tracking-normal">
          {node.status}
        </span>
      </div>
      {node.job_id || node.source_id || node.speaker_id ? (
        <p className="mt-2 truncate text-[10px] opacity-70">
          {node.job_id ?? node.source_id ?? node.speaker_id}
        </p>
      ) : null}
      {node.capability_id ? (
        <p className="mt-2 truncate text-[10px] opacity-75">{node.capability_id}</p>
      ) : null}
      {node.runtime ? (
        <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] opacity-75">
          <span>inputs {node.runtime.input_count ?? node.runtime.event_count ?? 0}</span>
          <span>outputs {node.runtime.output_count ?? 0}</span>
          {node.runtime.error_count ? <span>errors {node.runtime.error_count}</span> : null}
          {node.runtime.status_text ? <span className="truncate">{node.runtime.status_text}</span> : null}
          {node.runtime.last_error ? <span className="col-span-2 truncate text-rose-100">{node.runtime.last_error}</span> : null}
        </div>
      ) : null}
    </button>
  );
}
