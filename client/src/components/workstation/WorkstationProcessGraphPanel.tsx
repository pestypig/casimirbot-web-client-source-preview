import * as React from "react";
import { Download, Filter, Network, RotateCcw, Search, Trash2 } from "lucide-react";
import { createWorkstationProcessGraphDisplaySelector } from "@/lib/workstation/processGraph/processGraphDisplayProjection";
import { renderWorkstationProcessGraphSvg } from "@/lib/workstation/processGraph/renderProcessGraphSvg";
import type {
  WorkstationProcessGraphTimelineEntry,
  WorkstationProcessNode,
} from "@/lib/workstation/processGraph/processGraphTypes";
import { useWorkstationProcessGraphStore } from "@/store/useWorkstationProcessGraphStore";

function formatWhen(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleTimeString();
}

function statusTone(status: string): string {
  switch (status) {
    case "failed":
      return "border-rose-300/40 bg-rose-500/10 text-rose-100";
    case "running":
    case "active":
      return "border-cyan-300/40 bg-cyan-500/10 text-cyan-100";
    case "completed":
    case "verified":
      return "border-emerald-300/40 bg-emerald-500/10 text-emerald-100";
    case "pending":
      return "border-amber-300/40 bg-amber-500/10 text-amber-100";
    default:
      return "border-slate-400/30 bg-slate-500/10 text-slate-200";
  }
}

function matchesFilter(node: WorkstationProcessNode, filter: string): boolean {
  if (!filter) return true;
  const needle = filter.toLowerCase();
  return [
    node.id,
    node.kind,
    node.label,
    node.status,
    node.panelId,
    node.traceId,
    node.jobId,
    node.artifactKind,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

export default function WorkstationProcessGraphPanel() {
  const graph = useWorkstationProcessGraphStore((state) => state.graph);
  const selectPanelDisplayGraph = React.useMemo(
    () => createWorkstationProcessGraphDisplaySelector({ maxNodes: 120, maxEdges: 220 }),
    [],
  );
  const panelDisplayGraph = useWorkstationProcessGraphStore(selectPanelDisplayGraph);
  const focusNode = useWorkstationProcessGraphStore((state) => state.focusNode);
  const filterView = useWorkstationProcessGraphStore((state) => state.filterView);
  const clearHistorical = useWorkstationProcessGraphStore((state) => state.clearHistorical);
  const reset = useWorkstationProcessGraphStore((state) => state.reset);
  const [query, setQuery] = React.useState(graph.view.filter ?? "");

  React.useEffect(() => {
    filterView(query);
  }, [filterView, query]);

  const nodes = React.useMemo(
    () =>
      Object.values(graph.nodes)
        .filter((node) => matchesFilter(node, query))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [graph.nodes, query],
  );
  const nodeIds = React.useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const edges = React.useMemo(
    () =>
      Object.values(graph.edges)
        .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [graph.edges, nodeIds],
  );
  const timeline = React.useMemo(
    () =>
      graph.timeline
        .map((id) => graph.timelineEntries[id])
        .filter((entry): entry is WorkstationProcessGraphTimelineEntry => Boolean(entry))
        .slice(0, 80),
    [graph.timeline, graph.timelineEntries],
  );
  const selectedNode = graph.view.focusedNodeId ? graph.nodes[graph.view.focusedNodeId] : nodes[0];
  const panelSvg = React.useMemo(
    () =>
      renderWorkstationProcessGraphSvg({
        graph: panelDisplayGraph,
        width: 1400,
        height: 760,
        density: "panel",
        labels: "full",
        maxNodes: 120,
        maxEdges: 220,
      }),
    [panelDisplayGraph],
  );

  const exportSvg = React.useCallback(() => {
    const blob = new Blob([panelSvg], { type: "image/svg+xml;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `workstation-process-graph-${Date.now()}.svg`;
    link.click();
    URL.revokeObjectURL(href);
  }, [panelSvg]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Network className="h-4 w-4 text-cyan-200" />
          Process Graph
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded border border-white/10 bg-black/20 px-2 py-1 text-xs">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter"
              className="w-36 bg-transparent text-slate-100 outline-none placeholder:text-slate-500"
            />
          </div>
          <button type="button" onClick={exportSvg} className="inline-flex items-center gap-1 rounded border border-cyan-300/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20">
            <Download className="h-3.5 w-3.5" />
            SVG
          </button>
          <button type="button" onClick={clearHistorical} className="inline-flex items-center gap-1 rounded border border-amber-300/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/20">
            <Filter className="h-3.5 w-3.5" />
            Recent
          </button>
          <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded border border-rose-300/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20">
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-h-0 overflow-hidden border-r border-white/10">
          <div className="h-full min-h-0 overflow-auto bg-black/20 p-3">
            <div
              className="min-h-[520px] overflow-hidden rounded border border-cyan-300/15 bg-slate-950/80"
              dangerouslySetInnerHTML={{ __html: panelSvg }}
            />
          </div>
        </div>

        <aside className="flex min-h-0 flex-col">
          <div className="border-b border-white/10 p-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{nodes.length} nodes</span>
              <span>{edges.length} edges</span>
            </div>
            {selectedNode ? (
              <div className="mt-3 rounded border border-white/10 bg-black/20 p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-100">{selectedNode.label}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${statusTone(selectedNode.status)}`}>
                    {selectedNode.status}
                  </span>
                </div>
                <p className="mt-1 break-all text-[11px] text-slate-500">{selectedNode.id}</p>
                <p className="mt-2 text-[11px] text-slate-400">
                  {selectedNode.kind}
                  {selectedNode.panelId ? ` / ${selectedNode.panelId}` : ""}
                </p>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="space-y-2">
              {nodes.slice(0, 80).map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => focusNode(node.id)}
                  className="block w-full rounded border border-white/10 bg-black/20 p-2 text-left text-xs hover:border-cyan-300/40 hover:bg-cyan-500/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-100">{node.label}</span>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase ${statusTone(node.status)}`}>
                      {node.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[10px] text-slate-500">{node.kind} / {formatWhen(node.updatedAt)}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-44 overflow-auto border-t border-white/10 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
              <RotateCcw className="h-3.5 w-3.5" />
              Timeline
            </div>
            <div className="space-y-1.5">
              {timeline.length === 0 ? (
                <p className="text-xs text-slate-500">No graph events yet.</p>
              ) : (
                timeline.map((entry) => (
                  <div key={entry.id} className="rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-slate-300">
                    <span className="text-slate-500">{formatWhen(entry.ts)}</span> {entry.label}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
