import React from "react";
import type { PhysicsAtlasBlockV1 } from "@shared/contracts/physics-atlas.v1";
import type {
  TheoryBadgeCalculatorPayloadV1,
  TheoryBadgeGraphV1,
  TheoryBadgeV1,
} from "@shared/contracts/theory-badge-graph.v1";
import type { PhysicsAtlasLensResult } from "@shared/theory/physics-atlas-lens";

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function statusClass(status: PhysicsAtlasBlockV1["status"]) {
  switch (status) {
    case "active":
      return "border-cyan-300 bg-cyan-950 text-cyan-50";
    case "seed":
      return "border-zinc-500 bg-zinc-900 text-zinc-100";
    case "planned":
      return "border-zinc-700 bg-zinc-950 text-zinc-500";
    default:
      return "border-zinc-800 bg-zinc-950 text-zinc-600";
  }
}

export default function PhysicsAtlasBlockLens({
  graph,
  block,
  lens,
  translateText,
  onSelectBadge,
  onLoadPayload,
}: {
  graph: TheoryBadgeGraphV1;
  block: PhysicsAtlasBlockV1;
  lens: PhysicsAtlasLensResult;
  translateText?: (text: string) => string;
  onSelectBadge: (badgeId: string) => void;
  onLoadPayload: (badgeId: string, payloadId: string) => void;
}) {
  const tx = translateText ?? ((text: string) => text);
  const badgesById = new Map(graph.badges.map((badge: TheoryBadgeV1) => [badge.id, badge]));
  const primaryBadges = block.primaryBadgeIds
    .map((badgeId: string) => badgesById.get(badgeId))
    .filter((badge): badge is TheoryBadgeV1 => Boolean(badge));
  const highlightedBadges = lens.highlightedBadgeIds
    .map((badgeId: string) => badgesById.get(badgeId))
    .filter((badge): badge is TheoryBadgeV1 => Boolean(badge));
  const shownBadges = primaryBadges.length > 0 ? primaryBadges : highlightedBadges.slice(0, 10);
  const scalarPayloads = shownBadges.flatMap((badge: TheoryBadgeV1) =>
    badge.calculatorPayloads.map((payload: TheoryBadgeCalculatorPayloadV1) => ({ badge, payload })),
  );

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-950 bg-zinc-950/95 text-zinc-100">
      <div className="border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-cyan-200">{block.glyph} {tx("Atlas")}</div>
            <div className="text-sm font-semibold">{tx(block.title)}</div>
          </div>
          <span className={`border px-1.5 py-0.5 text-[10px] font-bold uppercase ${statusClass(block.status)}`}>
            {tx(labelize(block.status))}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-zinc-400">{tx(block.description)}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <section className="mb-3">
          <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            {tx("Mapped Badges")}
          </div>
          <div className="space-y-1">
            {shownBadges.length > 0 ? (
              shownBadges.map((badge: TheoryBadgeV1) => (
                <button data-helix-control-id="workstation.panel.theory-badge-graph.physics-atlas-block-lens.on-select-badge-badge-id" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
                  key={badge.id}
                  type="button"
                  aria-label={`${tx("Select")} ${tx(badge.title)}`}
                  onClick={() => onSelectBadge(badge.id)}
                  className="w-full border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-500"
                >
                  <span className="block font-semibold">{tx(badge.title)}</span>
                  <span className="mt-0.5 block text-[10px] text-zinc-500">{tx(labelize(badge.level))}</span>
                </button>
              ))
            ) : (
              <div className="border border-zinc-800 bg-zinc-900 px-2 py-2 text-[11px] text-zinc-500">
                {tx("No seeded badges yet. This lens still acts as a locator hint.")}
              </div>
            )}
          </div>
        </section>

        <section className="mb-3">
          <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            {tx("Scalar Payloads")}
          </div>
          <div className="space-y-1">
            {scalarPayloads.length > 0 ? (
              scalarPayloads.slice(0, 8).map(({ badge, payload }) => (
                <button data-helix-control-id="workstation.panel.theory-badge-graph.physics-atlas-block-lens.on-load-payload-badge-id-payload-id" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
                  key={`${badge.id}-${payload.id}`}
                  type="button"
                  onClick={() => onLoadPayload(badge.id, payload.id)}
                  className="w-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-left font-mono text-[10px] text-cyan-100 hover:border-cyan-300"
                >
                  {payload.expression}
                </button>
              ))
            ) : (
              <div className="border border-zinc-800 bg-zinc-900 px-2 py-2 text-[11px] text-zinc-500">
                {tx("No scalar calculator payloads seeded for this block yet.")}
              </div>
            )}
          </div>
        </section>

        {block.runtimeActions.length > 0 ? (
          <section className="mb-3">
            <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              {tx("Runtime Actions")}
            </div>
            <div className="space-y-1">
              {block.runtimeActions.map((action) => (
                <div key={`${action.actionId}-${action.badgeId ?? action.label}`} className="border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-400">
                  <div className="font-semibold text-zinc-200">{tx(action.label)}</div>
                  <div className="mt-0.5">{tx(action.note)}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="border-t border-zinc-800 p-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{tx("Boundary")}</div>
        <div className="mt-1 space-y-1 text-[11px] text-zinc-400">
          {(lens.claimBoundaryNotes.length > 0 ? lens.claimBoundaryNotes : block.claimBoundaryNotes).slice(0, 4).map((note) => (
            <div key={note} className="border border-zinc-800 bg-zinc-900 px-2 py-1">
              {tx(note)}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
