import { Plus, Workflow } from "lucide-react";
import { SituationGraphEdgeLayer } from "@/components/workstation/situation-graph/SituationGraphEdgeLayer";
import { SituationGraphInspector } from "@/components/workstation/situation-graph/SituationGraphInspector";
import { SituationGraphNodeCard } from "@/components/workstation/situation-graph/SituationGraphNodeCard";
import type {
  SituationGraphNode,
  SituationGraphNodeColumn,
  SituationRoomGraph,
} from "@shared/helix-situation-graph";

const COLUMNS: Array<{ id: SituationGraphNodeColumn; label: string }> = [
  { id: "sources", label: "Sources" },
  { id: "speakers", label: "Speakers" },
  { id: "jobs", label: "Jobs" },
  { id: "outputs", label: "Outputs" },
  { id: "helix", label: "Helix Ask" },
];

export function SituationGraphCanvas({
  graph,
  selectedNodeId,
  onCreateGraph,
  onSelectNode,
  onAttachGraph,
}: {
  graph?: SituationRoomGraph | null;
  selectedNodeId?: string;
  onCreateGraph: () => void;
  onSelectNode: (nodeId?: string) => void;
  onAttachGraph: () => void;
}) {
  if (!graph) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div className="max-w-md rounded-lg border border-dashed border-white/15 bg-black/20 p-5 text-center">
          <Workflow className="mx-auto h-8 w-8 text-cyan-300" />
          <p className="mt-3 text-sm font-semibold text-white">No graph for this room</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Create a static graph to visualize sources, speaker lanes, jobs, outputs, and Helix Ask attachment.
          </p>
          <button
            type="button"
            onClick={onCreateGraph}
            className="mt-4 inline-flex items-center gap-2 rounded border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20"
          >
            <Plus className="h-4 w-4" />
            Create Graph
          </button>
        </div>
      </main>
    );
  }

  const selectedNode = graph.nodes.find((node) => node.node_id === selectedNodeId);

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">{graph.title}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {graph.nodes.length} nodes / {graph.edges.length} lanes / manual attachment
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateGraph}
            className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>
        <div className="mb-3 xl:hidden">
          <SituationGraphInspector graph={graph} node={selectedNode} onAttach={onAttachGraph} />
        </div>
        <div className="grid gap-3 lg:grid-cols-5">
          {COLUMNS.map((column) => {
            const nodes = graph.nodes.filter((node: SituationGraphNode) => node.column === column.id);
            return (
              <div key={column.id} className="min-w-0 rounded-lg border border-white/10 bg-slate-950/55 p-2">
                <p className="mb-2 text-[10px] font-semibold uppercase text-slate-500">{column.label}</p>
                <div className="space-y-2">
                  {nodes.length === 0 ? (
                    <div className="rounded border border-dashed border-white/10 px-2 py-3 text-center text-[10px] text-slate-600">
                      Empty
                    </div>
                  ) : (
                    nodes.map((node) => (
                      <SituationGraphNodeCard
                        key={node.node_id}
                        node={node}
                        selected={node.node_id === selectedNodeId}
                        onSelect={() => onSelectNode(node.node_id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3">
          <SituationGraphEdgeLayer edges={graph.edges} nodes={graph.nodes} />
        </div>
      </section>
      <div className="hidden xl:block xl:sticky xl:top-3 xl:self-start">
        <SituationGraphInspector graph={graph} node={selectedNode} onAttach={onAttachGraph} />
      </div>
    </main>
  );
}
