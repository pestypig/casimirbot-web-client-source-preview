import React from "react";
import type { TheoryBadgeGraphV1 } from "@shared/contracts/theory-badge-graph.v1";
import type { TokamakPlasmaGroup, TokamakPlasmaGroupId } from "@shared/theory/tokamak-plasma-map";

function bandLabel(band: TokamakPlasmaGroup["band"]) {
  return band.replace(/_/g, " ");
}

function bandClass(band: TokamakPlasmaGroup["band"], selected: boolean) {
  const ring = selected ? " ring-2 ring-cyan-100" : "";
  switch (band) {
    case "pressure":
      return `border-orange-300 bg-orange-950/70 text-orange-50${ring}`;
    case "power":
      return `border-emerald-300 bg-emerald-950/70 text-emerald-50${ring}`;
    case "precursor":
      return `border-violet-300 bg-violet-950/70 text-violet-50${ring}`;
    case "flux":
      return `border-sky-300 bg-sky-950/70 text-sky-50${ring}`;
    case "boundary":
      return `border-rose-300 bg-rose-950/70 text-rose-50${ring}`;
    default:
      return `border-zinc-300 bg-zinc-900/75 text-zinc-50${ring}`;
  }
}

function uniqueBands(groups: TokamakPlasmaGroup[]) {
  return groups.reduce<TokamakPlasmaGroup["band"][]>((acc, group) => {
    if (!acc.includes(group.band)) acc.push(group.band);
    return acc;
  }, []);
}

export default function TokamakPlasmaLens({
  graph,
  groups,
  selectedGroupId,
  selectedObjectBindingId,
  translateText,
  onSelectGroup,
  onSelectObjectBinding,
  onClearObjectBinding,
  onLoadPayload,
}: {
  graph: TheoryBadgeGraphV1;
  groups: TokamakPlasmaGroup[];
  selectedGroupId: TokamakPlasmaGroupId | null;
  selectedObjectBindingId: string | null;
  translateText?: (text: string) => string;
  onSelectGroup: (group: TokamakPlasmaGroup) => void;
  onSelectObjectBinding: (group: TokamakPlasmaGroup, bindingId: string) => void;
  onClearObjectBinding: () => void;
  onLoadPayload: (badgeId: string, payloadId: string) => void;
}) {
  const tx = translateText ?? ((text: string) => text);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const selectedBinding = selectedGroup?.objectBindings.find((binding) => binding.id === selectedObjectBindingId) ?? null;
  const badgesById = new Map(graph.badges.map((badge) => [badge.id, badge]));
  const bands = uniqueBands(groups);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-950 bg-zinc-950/95 text-zinc-100">
      <div className="border-b border-zinc-800 px-3 py-2">
        <div className="text-xs font-bold uppercase tracking-wide text-orange-200">{tx("Tokamak")}</div>
        <div className="text-sm font-semibold">{tx("Plasma")}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {bands.map((band) => (
          <section key={band} className="mb-3">
            <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              {tx(bandLabel(band))}
            </div>
            <div className="space-y-1">
              {groups
                .filter((group) => group.band === band)
                .map((group) => {
                  const selected = selectedGroupId === group.id;
                  return (
                    <button data-helix-control-id="workstation.panel.theory-badge-graph.tokamak-plasma-lens.on-select-group-group" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
                      key={group.id}
                      type="button"
                      aria-label={`${tx("Select")} ${tx(group.title)}`}
                      onClick={() => onSelectGroup(group)}
                      className={`w-full border px-2 py-1.5 text-left text-xs shadow ${bandClass(
                        group.band,
                        selected,
                      )}`}
                    >
                      <span className="block font-semibold">{tx(group.title)}</span>
                      <span className="mt-0.5 block text-[10px] opacity-75">{tx(group.description)}</span>
                    </button>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
      <div className="border-t border-zinc-800 p-2">
        {selectedGroup ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-100">{tx(selectedGroup.title)}</div>
            <div className="text-[11px] text-zinc-400">
              {selectedGroup.theoryBadgeIds.length} {tx("mapped badges")} / {selectedGroup.calculatorPayloadRefs.length} {tx("scalar loadouts")}
            </div>
            {selectedGroup.objectBindings.length > 0 ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{tx("Plasma Binding")}</div>
                  {selectedBinding ? (
                    <button data-helix-control-id="workstation.panel.theory-badge-graph.tokamak-plasma-lens.on-clear-object-binding" data-helix-interaction-kind="act" data-helix-authority-state="client_local"
                      type="button"
                      onClick={onClearObjectBinding}
                      className="border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-zinc-400"
                    >
                      {tx("Clear")}
                    </button>
                  ) : null}
                </div>
                {selectedGroup.objectBindings.map((binding) => {
                  const selected = selectedObjectBindingId === binding.id;
                  return (
                    <button data-helix-control-id="workstation.panel.theory-badge-graph.tokamak-plasma-lens.on-select-object-binding-selected-group-binding-id" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
                      key={binding.id}
                      type="button"
                      aria-label={`${tx("Use")} ${tx(binding.label)} ${tx("object binding")}`}
                      onClick={() => onSelectObjectBinding(selectedGroup, binding.id)}
                      className={`w-full border px-2 py-1.5 text-left text-[11px] ${
                        selected
                          ? "border-cyan-300 bg-cyan-950 text-cyan-50"
                          : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-cyan-700"
                      }`}
                    >
                      <span className="block font-semibold">{tx(binding.label)}</span>
                      <span className="mt-0.5 block text-[10px] opacity-75">{tx(binding.description)}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="space-y-1">
              {selectedGroup.calculatorPayloadRefs.slice(0, 6).map((ref) => {
                const badge = badgesById.get(ref.badgeId);
                const payload = badge?.calculatorPayloads.find((candidate) => candidate.id === ref.payloadId);
                if (!badge || !payload) return null;
                return (
                  <button data-helix-control-id="workstation.panel.theory-badge-graph.tokamak-plasma-lens.on-load-payload-ref-badge-id-ref-payload-id" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
                    key={`${ref.badgeId}-${ref.payloadId}`}
                    type="button"
                    onClick={() => onLoadPayload(ref.badgeId, ref.payloadId)}
                    className="w-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-left font-mono text-[10px] text-cyan-100 hover:border-cyan-300"
                  >
                    {payload.expression}
                  </button>
                );
              })}
            </div>
            {selectedGroup.calculatorPayloadRefs.length === 0 ? (
              <div className="border border-zinc-800 bg-zinc-900 px-2 py-2 text-[11px] text-zinc-500">
                {tx("Runtime/reference context. No scalar calculator payload.")}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-[11px] text-zinc-500">{tx("Pick a tokamak group to light plasma diagnostic badges.")}</div>
        )}
      </div>
    </aside>
  );
}
