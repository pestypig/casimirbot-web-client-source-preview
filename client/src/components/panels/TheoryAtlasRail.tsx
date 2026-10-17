import React from "react";
import type { PhysicsAtlasBlockId, PhysicsAtlasBlockV1 } from "@shared/contracts/physics-atlas.v1";
import { PHYSICS_ATLAS_BLOCKS } from "@shared/theory/physics-atlas-blocks";

export type TheoryAtlasLensId = PhysicsAtlasBlockId;

const blockColors: Record<PhysicsAtlasBlockId, string> = {
  stellar_evolution: "bg-fuchsia-700",
  astrochemistry_prebiotic: "bg-lime-700",
  cosmic_distance_ladder: "bg-amber-600",
  solar_surface_spectrum: "bg-yellow-500",
  casimir_cavity_modes: "bg-cyan-500",
  warp_gr_nhm2: "bg-violet-600",
  nhm2_full_solve: "bg-indigo-600",
  qei_stress_energy: "bg-slate-500",
  tokamak_plasma: "bg-orange-500",
  galactic_dynamics: "bg-sky-500",
  curvature_collapse: "bg-emerald-600",
};

export default function TheoryAtlasRail({
  activeLensId,
  hasLiveReflection,
  liveReflectionActive,
  onSelectLiveReflection,
  onSelectLens,
  translateText,
}: {
  activeLensId: TheoryAtlasLensId | null;
  hasLiveReflection?: boolean;
  liveReflectionActive?: boolean;
  onSelectLiveReflection?: () => void;
  onSelectLens: (lensId: TheoryAtlasLensId) => void;
  translateText?: (text: string) => string;
}) {
  const tx = translateText ?? ((text: string) => text);
  return (
    <div
      aria-label={tx("Theory atlas lenses")}
      className="flex w-9 shrink-0 flex-col items-center gap-2 border-r border-zinc-950 bg-zinc-950 px-1.5 py-2"
    >
      {hasLiveReflection ? (
        <button data-helix-control-id="workstation.panel.theory-badge-graph.theory-atlas-rail.there4" data-helix-interaction-kind="navigate" data-helix-authority-state="client_local"
          type="button"
          aria-label={tx("Live answer theory context")}
          title={tx("Latest Ask-level theory reflection. Evidence only, not a solved answer.")}
          onClick={onSelectLiveReflection}
          className={`flex h-6 w-6 items-center justify-center border-2 bg-emerald-600 text-[11px] font-black text-white shadow ${
            liveReflectionActive
              ? "border-emerald-100 ring-2 ring-emerald-300"
              : "border-zinc-800 hover:border-emerald-200"
          }`}
        >
          &there4;
        </button>
      ) : null}
      {PHYSICS_ATLAS_BLOCKS.map((block: PhysicsAtlasBlockV1) => {
        const active = activeLensId === block.id;
        const planned = block.status === "planned";
        const seed = block.status === "seed";
        return (
          <button data-helix-control-id="workstation.panel.theory-badge-graph.theory-atlas-rail.on-select-lens-block-id" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
            key={block.id}
            type="button"
            aria-label={`${tx(block.title)} ${tx("atlas lens")}`}
            title={`${tx(block.title)}${planned ? ` ${tx("(planned)")}` : ""}`}
            onClick={() => onSelectLens(block.id)}
            className={`flex h-6 w-6 items-center justify-center border-2 text-[11px] font-black text-white shadow ${
              active
                ? "border-cyan-100 ring-2 ring-cyan-300"
                : "border-zinc-800 hover:border-cyan-200"
            } ${blockColors[block.id]} ${planned && !active ? "opacity-50 grayscale" : ""} ${seed && !active ? "opacity-80" : ""}`}
          >
            {block.glyph}
          </button>
        );
      })}
    </div>
  );
}
