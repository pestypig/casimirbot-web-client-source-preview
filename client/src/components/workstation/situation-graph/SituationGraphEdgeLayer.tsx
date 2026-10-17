import type { SituationGraphEdge, SituationGraphNode } from "@shared/helix-situation-graph";

const laneLabel: Record<SituationGraphEdge["lane"], string> = {
  audio: "audio",
  speaker_identity: "speaker",
  transcript: "text",
  translation: "translate",
  context: "context",
  command: "command",
  voice_output: "voice",
};

const laneTone: Record<SituationGraphEdge["lane"], string> = {
  audio: "border-blue-300/35 text-blue-100",
  speaker_identity: "border-amber-300/35 text-amber-100",
  transcript: "border-emerald-300/35 text-emerald-100",
  translation: "border-violet-300/35 text-violet-100",
  context: "border-cyan-300/35 text-cyan-100",
  command: "border-rose-300/35 text-rose-100",
  voice_output: "border-slate-300/35 text-slate-100",
};

export function SituationGraphEdgeLayer({
  edges,
  nodes,
}: {
  edges: SituationGraphEdge[];
  nodes: SituationGraphNode[];
}) {
  const nodeTitleById = new Map(nodes.map((node) => [node.node_id, node.title]));
  if (edges.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/15 p-3 text-xs text-slate-500">
        No lanes connected yet.
      </div>
    );
  }
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {edges.map((edge) => (
        <div
          key={edge.edge_id}
          className={`rounded border bg-black/20 px-2 py-1.5 text-[10px] ${laneTone[edge.lane]}`}
        >
          <span className="font-semibold">{laneLabel[edge.lane]}</span>
          <span className="mx-1 text-slate-500">/</span>
          <span className="text-slate-300">{nodeTitleById.get(edge.from_node_id) ?? edge.from_node_id}</span>
          <span className="mx-1 text-slate-500">to</span>
          <span className="text-slate-300">{nodeTitleById.get(edge.to_node_id) ?? edge.to_node_id}</span>
        </div>
      ))}
    </div>
  );
}
