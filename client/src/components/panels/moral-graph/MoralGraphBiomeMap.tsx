import React from "react";
import { Badge } from "@/components/ui/badge";
import type { MoralGraphBiomeScaleViewModel, MoralGraphEdge, MoralGraphNode } from "@/lib/moral-graph/biomeScaleViewModel";
import type { MoralGraphSelectionTraceViewModel } from "@/lib/moral-graph/selectionTraceViewModel";
import MoralGraphCellWatermarks from "./MoralGraphCellWatermarks";

function labelize(value: string): string {
  return value.replace(/[_-]/g, " ");
}

function nodeCenter(node: MoralGraphNode): { x: number; y: number } {
  return {
    x: node.x + (node.width ?? 54) / 2,
    y: node.y + (node.height ?? 54) / 2,
  };
}

function edgePath(from: MoralGraphNode, to: MoralGraphNode): string {
  const fromCenter = nodeCenter(from);
  const toCenter = nodeCenter(to);
  const midX = (fromCenter.x + toCenter.x) / 2;
  return `M ${fromCenter.x} ${fromCenter.y} C ${midX} ${fromCenter.y}, ${midX} ${toCenter.y}, ${toCenter.x} ${toCenter.y}`;
}

function edgeStroke(tone: MoralGraphEdge["tone"]): string {
  switch (tone) {
    case "cyan":
      return "rgb(103 232 249)";
    case "emerald":
      return "rgb(110 231 183)";
    case "amber":
      return "rgb(252 211 77)";
    case "rose":
      return "rgb(251 113 133)";
    case "violet":
      return "rgb(196 181 253)";
    default:
      return "rgb(161 161 170)";
  }
}

function nodeClasses(args: {
  node: MoralGraphNode;
  selected: boolean;
  highlighted: boolean;
  candidate: boolean;
  blocked: boolean;
  conflict: boolean;
  dimmed: boolean;
  idle: boolean;
}): string {
  const classes = [
    "absolute flex h-[54px] w-[54px] items-center justify-center border-2 text-[12px] font-black uppercase shadow transition",
    "focus:outline-none focus:ring-2 focus:ring-cyan-200",
  ];
  switch (args.node.biome) {
    case "pre_boundary_conditions":
      classes.push("border-sky-200 bg-sky-950 text-sky-50");
      break;
    case "substrate_boundary":
      classes.push("border-teal-200 bg-teal-950 text-teal-50");
      break;
    case "substrate_sensing":
      classes.push("border-cyan-200 bg-cyan-950 text-cyan-50");
      break;
    case "maintenance_response":
      classes.push("border-emerald-200 bg-emerald-950 text-emerald-50");
      break;
    case "action_selection":
      classes.push("border-green-200 bg-green-950 text-green-50");
      break;
    case "coordination_scale":
      classes.push("border-lime-200 bg-lime-950 text-lime-50");
      break;
    case "mandate_authority":
      classes.push("border-amber-200 bg-zinc-800 text-amber-50");
      break;
    case "frontier_mechanism":
      classes.push("border-fuchsia-200 bg-fuchsia-950 text-fuchsia-50");
      break;
    case "character_trace":
      classes.push("border-red-200 bg-red-950 text-red-50");
      break;
    case "objective_binding":
      classes.push("border-violet-200 bg-violet-950 text-violet-50");
      break;
    case "claim_boundary":
      classes.push("border-rose-200 bg-rose-950 text-rose-50");
      break;
  }
  if (args.selected) classes.push("ring-4 ring-cyan-200/80 shadow-cyan-200/50");
  else if (args.conflict) classes.push("ring-4 ring-rose-300/80 shadow-rose-300/40");
  else if (args.candidate) classes.push("ring-2 ring-emerald-300/80 shadow-emerald-300/30");
  else if (args.highlighted) classes.push("ring-2 ring-cyan-400/70");
  if (args.blocked) classes.push("cursor-help");
  if (args.idle) classes.push("opacity-50 grayscale hover:opacity-90 hover:grayscale-0");
  if (args.dimmed) classes.push("opacity-35 grayscale");
  return classes.join(" ");
}

function edgePresentation(args: {
  edge: MoralGraphEdge;
  selectionTrace?: MoralGraphSelectionTraceViewModel;
  highlighted: Set<string>;
  hasFocus: boolean;
}): { strokeWidth: number; strokeOpacity: number; strokeDasharray?: string; dataState: string } {
  const baseWidth = 2 + (args.edge.weight ?? 0);
  if (args.selectionTrace?.activeEdgeIds.has(args.edge.id)) {
    return { strokeWidth: baseWidth + 3, strokeOpacity: 0.95, dataState: "active" };
  }
  if (args.selectionTrace?.candidateEdgeIds.has(args.edge.id)) {
    return { strokeWidth: baseWidth + 1.5, strokeOpacity: 0.66, strokeDasharray: "5 6", dataState: "candidate" };
  }
  if (args.selectionTrace?.blockedEdgeIds.has(args.edge.id)) {
    return { strokeWidth: baseWidth, strokeOpacity: 0.24, strokeDasharray: "3 7", dataState: "blocked" };
  }
  const highlightedEdge = args.highlighted.has(args.edge.from) && args.highlighted.has(args.edge.to);
  return {
    strokeWidth: highlightedEdge ? baseWidth + 2 : baseWidth,
    strokeOpacity: args.hasFocus ? (highlightedEdge ? 0.32 : 0.06) : 0.035,
    dataState: highlightedEdge ? "highlighted" : "background",
  };
}

export function MoralGraphBiomeMap({
  graph,
  highlighted,
  hasFocus,
  selectedNodeIds,
  selectionTrace,
  hoveredNode,
  zoom = 1,
  probabilityByNodeId,
  translateText = (text: string) => text,
  onClearSelection,
  onToggleNode,
  onHoverNode,
}: {
  graph: MoralGraphBiomeScaleViewModel;
  highlighted: Set<string>;
  hasFocus: boolean;
  selectedNodeIds: string[];
  selectionTrace?: MoralGraphSelectionTraceViewModel;
  hoveredNode: MoralGraphNode | null;
  zoom?: number;
  probabilityByNodeId?: Record<string, number>;
  translateText?: (text: string) => string;
  onClearSelection?: () => void;
  onToggleNode: (id: string, node: MoralGraphNode) => void;
  onHoverNode: (id: string | null) => void;
}) {
  return (
    <div data-helix-control-id="workstation.panel.moral-graph.moral-graph-biome-map.moral-graph-biome-map" data-helix-interaction-kind="navigate" data-helix-authority-state="client_local"
      className="relative"
      data-testid="moral-graph-biome-map"
      onClick={() => onClearSelection?.()}
      style={{
        width: graph.width,
        height: graph.height,
        backgroundImage: [
          "linear-gradient(rgba(24,24,27,0.72) 1px, transparent 1px)",
          "linear-gradient(90deg, rgba(24,24,27,0.72) 1px, transparent 1px)",
          "linear-gradient(to bottom, #111827 0 80px, #18181b 80px 100%)",
        ].join(", "),
        backgroundSize: "32px 32px, 32px 32px, auto",
      }}
    >
      {graph.biomeLanes.map((lane: MoralGraphBiomeScaleViewModel["biomeLanes"][number]) => (
        <section
          key={lane.id}
          data-testid={`moral-graph-biome-lane-${lane.id}`}
          className="pointer-events-none absolute top-3 border border-zinc-700/70 bg-zinc-950/25"
          style={{ left: lane.x - 14, width: lane.width + 28, height: graph.height - 24 }}
        >
          <div className="border-b border-zinc-700/70 bg-zinc-950/75 px-2 py-1.5">
            <div className="truncate text-[10px] font-semibold uppercase text-zinc-100">{translateText(lane.label)}</div>
            <div className="truncate text-[9px] text-zinc-500">{translateText(lane.summary)}</div>
          </div>
        </section>
      ))}
      {graph.scaleLanes.map((lane: MoralGraphBiomeScaleViewModel["scaleLanes"][number]) => (
        <div
          key={lane.id}
          data-testid={`moral-graph-scale-lane-${lane.id}`}
          className="pointer-events-none absolute left-2 right-2 border-t border-dashed border-zinc-600/55"
          style={{ top: lane.y + 26 }}
        >
          <span className="absolute -top-3 left-10 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-zinc-400">
            {translateText(lane.label)}
          </span>
        </div>
      ))}
      <MoralGraphCellWatermarks cells={graph.cells} zoom={zoom} translateText={translateText} />
      <svg className="pointer-events-none absolute inset-0" width={graph.width} height={graph.height}>
        <defs>
          <marker id="moral-graph-biome-arrow" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
            <path d="M 0 0 L 7 3.5 L 0 7 z" fill="rgb(161 161 170)" />
          </marker>
        </defs>
        {graph.edges.map((edge: MoralGraphEdge) => {
          const from = graph.nodes.find((node: MoralGraphNode) => node.id === edge.from);
          const to = graph.nodes.find((node: MoralGraphNode) => node.id === edge.to);
          if (!from || !to) return null;
          const presentation = edgePresentation({ edge, selectionTrace, highlighted, hasFocus });
          const showBoundaryDash = hasFocus && (edge.label.includes("boundary") || to.biome === "claim_boundary");
          return (
            <path
              key={edge.id}
              d={edgePath(from, to)}
              stroke={edgeStroke(edge.tone)}
              strokeWidth={presentation.strokeWidth}
              strokeOpacity={presentation.strokeOpacity}
              strokeDasharray={presentation.strokeDasharray ?? (showBoundaryDash ? "6 7" : undefined)}
              fill="none"
              strokeLinecap="square"
              markerEnd="url(#moral-graph-biome-arrow)"
              data-testid="moral-graph-trace-edge"
              data-edge-id={edge.id}
              data-trace-state={presentation.dataState}
            />
          );
        })}
      </svg>
      {graph.nodes.map((node: MoralGraphNode) => {
        const selected = selectedNodeIds.includes(node.id);
        const highlightedNode = highlighted.has(node.id);
        const candidate = selectionTrace?.candidateNodeIds.has(node.id) ?? false;
        const blocked = selectionTrace?.blockedNodeIds.has(node.id) ?? false;
        const conflict = selectionTrace?.conflictNodeIds.has(node.id) ?? false;
        const traceActive = selectionTrace?.activeNodeIds.has(node.id) ?? false;
        const dimmed = hasFocus && !highlightedNode && !candidate && !traceActive && !conflict;
        const idle = !hasFocus && !selected && !highlightedNode && !candidate && !traceActive && !conflict;
        const placementProbability = probabilityByNodeId?.[node.id] ?? 0;
        return (
          <button data-helix-control-id="workstation.panel.moral-graph.moral-graph-biome-map.moral-graph-badge-node" data-helix-interaction-kind="navigate" data-helix-authority-state="client_local"
            key={node.id}
            type="button"
            className={nodeClasses({ node, selected, highlighted: highlightedNode || traceActive, candidate, blocked, conflict, dimmed, idle })}
            data-testid="moral-graph-badge-node"
            data-biome={node.biome}
            data-scale-band={node.scaleBand}
            data-maturity={node.maturity}
            data-trace-state={conflict ? "conflict" : selected || traceActive ? "active" : candidate ? "candidate" : blocked ? "blocked" : "background"}
            style={{
              left: node.x,
              top: node.y,
              boxShadow:
                placementProbability > 0
                  ? `0 0 0 ${Math.max(2, Math.round(placementProbability * 9))}px rgba(34,211,238,0.28)`
                  : undefined,
            }}
            aria-label={translateText(node.label)}
            onMouseEnter={() => onHoverNode(node.id)}
            onMouseLeave={() => onHoverNode(null)}
            onFocus={() => onHoverNode(node.id)}
            onBlur={() => onHoverNode(null)}
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              onToggleNode(node.id, node);
            }}
          >
            <span className="flex h-8 w-8 items-center justify-center border border-zinc-600 bg-zinc-900 shadow-inner">
              {node.glyph}
            </span>
            {node.confidence || node.tone === "character" ? (
              <span className="absolute -right-1 -top-1 h-3 w-3 border border-cyan-100 bg-cyan-400" />
            ) : null}
            {node.maturity === "frontier" || node.biome === "claim_boundary" ? (
              <span className="pointer-events-none absolute -inset-1.5 border-2 border-current/70" />
            ) : null}
          </button>
        );
      })}
      {hoveredNode ? (
        <div
          data-testid="moral-graph-hover-card"
          className="pointer-events-none absolute z-50 max-w-[280px] rounded border border-cyan-700/70 bg-zinc-950/95 p-2 text-xs text-zinc-200 shadow-2xl shadow-cyan-950/40"
          style={{ left: Math.min(graph.width - 300, hoveredNode.x + 62), top: Math.max(12, hoveredNode.y - 8) }}
        >
          <div className="font-semibold text-zinc-50">{translateText(hoveredNode.label)}</div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{hoveredNode.id}</div>
          <div className="mt-1 font-mono text-[11px] leading-snug text-cyan-100">
            {translateText(hoveredNode.proceduralExpression)}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-zinc-300">
            <span>{translateText(labelize(hoveredNode.biome))}</span>
            <span>{translateText(labelize(hoveredNode.scaleBand))}</span>
            <span>{translateText(labelize(hoveredNode.cadence))}</span>
            <span>{translateText(labelize(hoveredNode.maturity))}</span>
          </div>
          {hoveredNode.actionEffect ? <div className="mt-1 text-zinc-300">{translateText(hoveredNode.actionEffect)}</div> : null}
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-300">
              {translateText(labelize(hoveredNode.actionManifestation))}
            </Badge>
            <Badge variant="outline" className="border-cyan-700 text-[10px] text-cyan-200">
              {translateText(labelize(hoveredNode.biomeReason))}
            </Badge>
            {(hoveredNode.tags ?? []).slice(0, 2).map((tag: string) => (
              <Badge key={tag} variant="outline" className="border-zinc-700 text-[10px] text-zinc-300">
                {translateText(labelize(tag))}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default MoralGraphBiomeMap;
