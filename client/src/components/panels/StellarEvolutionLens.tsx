import React from "react";
import type {
  StarSimStellarEvolutionStage,
  StarSimStellarEvolutionStageId,
} from "@shared/theory/starsim-stellar-evolution-map";
import type { TheoryBadgeGraphV1 } from "@shared/contracts/theory-badge-graph.v1";

function phaseLabel(phase: StarSimStellarEvolutionStage["phase"]) {
  return phase.replace(/_/g, " ");
}

function stageColorClass(color: StarSimStellarEvolutionStage["colorClass"], selected: boolean) {
  const selectedRing = selected ? " ring-2 ring-cyan-200" : "";
  switch (color) {
    case "cyan":
      return `border-cyan-300 bg-cyan-900/55 text-cyan-50${selectedRing}`;
    case "amber":
      return `border-amber-300 bg-amber-900/55 text-amber-50${selectedRing}`;
    case "rose":
      return `border-rose-300 bg-rose-900/55 text-rose-50${selectedRing}`;
    case "violet":
      return `border-violet-300 bg-violet-900/55 text-violet-50${selectedRing}`;
    case "emerald":
      return `border-emerald-300 bg-emerald-900/55 text-emerald-50${selectedRing}`;
    default:
      return `border-slate-300 bg-slate-900/65 text-slate-50${selectedRing}`;
  }
}

function uniquePhases(stages: StarSimStellarEvolutionStage[]) {
  return stages.reduce<StarSimStellarEvolutionStage["phase"][]>((acc, stage) => {
    if (!acc.includes(stage.phase)) acc.push(stage.phase);
    return acc;
  }, []);
}

export default function StellarEvolutionLens({
  graph,
  stages,
  selectedStageId,
  selectedObjectBindingId,
  translateText,
  onSelectStage,
  onSelectObjectBinding,
  onClearObjectBinding,
  onLoadPayload,
}: {
  graph: TheoryBadgeGraphV1;
  stages: StarSimStellarEvolutionStage[];
  selectedStageId: StarSimStellarEvolutionStageId | null;
  selectedObjectBindingId: string | null;
  translateText?: (text: string) => string;
  onSelectStage: (stage: StarSimStellarEvolutionStage) => void;
  onSelectObjectBinding: (stage: StarSimStellarEvolutionStage, bindingId: string) => void;
  onClearObjectBinding: () => void;
  onLoadPayload: (badgeId: string, payloadId: string) => void;
}) {
  const tx = translateText ?? ((text: string) => text);
  const selectedStage = stages.find((stage) => stage.id === selectedStageId) ?? null;
  const selectedBinding = selectedStage?.objectBindings.find((binding) => binding.id === selectedObjectBindingId) ?? null;
  const badgesById = new Map(graph.badges.map((badge) => [badge.id, badge]));
  const phases = uniquePhases(stages);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-950 bg-zinc-950/95 text-zinc-100">
      <div className="border-b border-zinc-800 px-3 py-2">
        <div className="text-xs font-bold uppercase tracking-wide text-cyan-200">{tx("StarSim")}</div>
        <div className="text-sm font-semibold">{tx("Stellar Evolution")}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {phases.map((phase) => (
          <section key={phase} className="mb-3">
            <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              {tx(phaseLabel(phase))}
            </div>
            <div className="space-y-1">
              {stages
                .filter((stage) => stage.phase === phase)
                .map((stage) => {
                  const selected = selectedStageId === stage.id;
                  return (
                    <button data-helix-control-id="workstation.panel.theory-badge-graph.stellar-evolution-lens.on-select-stage-stage" data-helix-interaction-kind="act" data-helix-authority-state="client_local"
                      key={stage.id}
                      type="button"
                      aria-label={`${tx("Select")} ${tx(stage.title)}`}
                      onClick={() => onSelectStage(stage)}
                      className={`w-full border px-2 py-1.5 text-left text-xs shadow ${stageColorClass(
                        stage.colorClass,
                        selected,
                      )}`}
                    >
                      <span className="block font-semibold">{tx(stage.title)}</span>
                      <span className="mt-0.5 block text-[10px] opacity-75">{tx(stage.objectClass)}</span>
                    </button>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
      <div className="border-t border-zinc-800 p-2">
        {selectedStage ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-100">{tx(selectedStage.title)}</div>
            <div className="text-[11px] text-zinc-400">
              {selectedStage.theoryBadgeIds.length} {tx("mapped badges")} / {selectedStage.calculatorPayloadRefs.length} {tx("scalar loadouts")}
            </div>
            {selectedStage.objectBindings.length > 0 ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{tx("Object Binding")}</div>
                  {selectedBinding ? (
                    <button data-helix-control-id="workstation.panel.theory-badge-graph.stellar-evolution-lens.on-clear-object-binding" data-helix-interaction-kind="act" data-helix-authority-state="client_local"
                      type="button"
                      onClick={onClearObjectBinding}
                      className="border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-zinc-400"
                    >
                      {tx("Clear")}
                    </button>
                  ) : null}
                </div>
                {selectedStage.objectBindings.map((binding) => {
                  const selected = selectedObjectBindingId === binding.id;
                  return (
                    <button data-helix-control-id="workstation.panel.theory-badge-graph.stellar-evolution-lens.on-select-object-binding-selected-stage-binding-id" data-helix-interaction-kind="act" data-helix-authority-state="client_local"
                      key={binding.id}
                      type="button"
                      aria-label={`${tx("Use")} ${tx(binding.label)} ${tx("object binding")}`}
                      onClick={() => onSelectObjectBinding(selectedStage, binding.id)}
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
              {selectedStage.calculatorPayloadRefs.slice(0, 4).map((ref) => {
                const badge = badgesById.get(ref.badgeId);
                const payload = badge?.calculatorPayloads.find((candidate) => candidate.id === ref.payloadId);
                if (!badge || !payload) return null;
                return (
                  <button data-helix-control-id="workstation.panel.theory-badge-graph.stellar-evolution-lens.on-load-payload-ref-badge-id-ref-payload-id" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
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
            {selectedStage.calculatorPayloadRefs.length === 0 ? (
              <div className="border border-zinc-800 bg-zinc-900 px-2 py-2 text-[11px] text-zinc-500">
                {tx("Runtime/reference stage. No scalar calculator payload.")}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-[11px] text-zinc-500">{tx("Pick a lifecycle stage to light the matching theory badges.")}</div>
        )}
      </div>
    </aside>
  );
}
