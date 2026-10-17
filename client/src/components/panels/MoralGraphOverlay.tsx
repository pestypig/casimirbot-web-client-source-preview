import React from "react";
import type { IdeologyContextReflectionV1 } from "@shared/ideology-context-reflection";
import MoralGraphNode from "./MoralGraphNode";

function labelForNodeId(reflection: IdeologyContextReflectionV1, nodeId: string): string {
  const allMatches = [
    ...reflection.matches.exact,
    ...reflection.matches.likely,
    ...reflection.matches.inferred_lenses,
    ...reflection.activated_traits,
  ];
  return allMatches.find((match) => match.nodeId === nodeId)?.label ?? nodeId;
}

export function MoralGraphOverlay({ reflection }: { reflection: IdeologyContextReflectionV1 }) {
  const highlightedNodeIds = reflection.overlay?.highlightedNodeIds ?? [
    ...new Set([
      ...reflection.activated_traits.map((trait) => trait.nodeId),
      ...reflection.matches.exact.map((match) => match.nodeId),
      ...reflection.matches.likely.map((match) => match.nodeId),
    ]),
  ];

  return (
    <section aria-labelledby="moralgraph-overlay-title" className="rounded border border-zinc-800 bg-zinc-950/80 p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="moralgraph-overlay-title" className="text-sm font-semibold text-zinc-100">
            {reflection.overlay?.title ?? "MoralGraph reflection"}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            {reflection.overlay?.summary ?? "Evidence only diagnostic graph view."}
          </p>
        </div>
        <span className="rounded border border-teal-700 bg-teal-950/50 px-2 py-1 text-xs text-teal-100">Evidence only</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <MoralGraphNode title={reflection.graph.rootId} subtitle="Root principle" tone="root" />
        {highlightedNodeIds.map((nodeId) => (
          <MoralGraphNode key={nodeId} title={labelForNodeId(reflection, nodeId)} subtitle={nodeId} tone="lens" />
        ))}
      </div>
    </section>
  );
}

export default MoralGraphOverlay;
