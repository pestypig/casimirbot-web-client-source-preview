import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StarSimStellarEvolutionStageId } from "@shared/theory/starsim-stellar-evolution-map";
import type { CosmicDistanceLadderRungId } from "@shared/theory/cosmic-distance-ladder-map";
import type { SolarSpectrumObservationGroupId } from "@shared/theory/solar-spectrum-observation-map";
import type { CasimirCavityGroupId } from "@shared/theory/casimir-cavity-map";
import type { WarpGrNhm2GroupId } from "@shared/theory/warp-gr-nhm2-map";
import type { QeiStressEnergyGroupId } from "@shared/theory/qei-stress-energy-map";
import type { TokamakPlasmaGroupId } from "@shared/theory/tokamak-plasma-map";
import type { GalacticDynamicsGroupId } from "@shared/theory/galactic-dynamics-map";
import type { CurvatureCollapseGroupId } from "@shared/theory/curvature-collapse-map";
import type { PhysicsAtlasBlockId } from "@shared/contracts/physics-atlas.v1";

const THEORY_BADGE_GRAPH_PANEL_MEMORY_KEY = "theory-badge-graph-panel:v2";

type TheoryBadgeGraphViewport = {
  scrollLeft: number;
  scrollTop: number;
};

export type TheoryBadgeGraphAtlasLensId = PhysicsAtlasBlockId;

type TheoryBadgeGraphPanelState = {
  selectedBadgeId: string | null;
  selectedBadgeIds: string[];
  viewport: TheoryBadgeGraphViewport;
  activeAtlasLensId: TheoryBadgeGraphAtlasLensId | null;
  selectedStarSimStageId: StarSimStellarEvolutionStageId | null;
  selectedStarSimObjectBindingId: string | null;
  selectedCosmicDistanceRungId: CosmicDistanceLadderRungId | null;
  selectedCosmicDistanceObjectBindingId: string | null;
  selectedSolarSpectrumGroupId: SolarSpectrumObservationGroupId | null;
  selectedSolarSpectrumObjectBindingId: string | null;
  selectedCasimirCavityGroupId: CasimirCavityGroupId | null;
  selectedCasimirCavityObjectBindingId: string | null;
  selectedWarpGrNhm2GroupId: WarpGrNhm2GroupId | null;
  selectedWarpGrNhm2ObjectBindingId: string | null;
  selectedQeiStressEnergyGroupId: QeiStressEnergyGroupId | null;
  selectedQeiStressEnergyObjectBindingId: string | null;
  selectedTokamakPlasmaGroupId: TokamakPlasmaGroupId | null;
  selectedTokamakPlasmaObjectBindingId: string | null;
  selectedGalacticDynamicsGroupId: GalacticDynamicsGroupId | null;
  selectedGalacticDynamicsObjectBindingId: string | null;
  selectedCurvatureCollapseGroupId: CurvatureCollapseGroupId | null;
  selectedCurvatureCollapseObjectBindingId: string | null;
  setSelectedBadgeId: (badgeId: string | null) => void;
  setSelectedBadgeIds: (badgeIds: string[]) => void;
  toggleSelectedBadgeId: (badgeId: string) => void;
  rememberViewport: (viewport: TheoryBadgeGraphViewport) => void;
  setActiveAtlasLensId: (lensId: TheoryBadgeGraphAtlasLensId | null) => void;
  setSelectedStarSimStageId: (stageId: StarSimStellarEvolutionStageId | null) => void;
  setSelectedStarSimObjectBindingId: (bindingId: string | null) => void;
  clearStarSimObjectBinding: () => void;
  setSelectedCosmicDistanceRungId: (rungId: CosmicDistanceLadderRungId | null) => void;
  setSelectedCosmicDistanceObjectBindingId: (bindingId: string | null) => void;
  clearCosmicDistanceObjectBinding: () => void;
  setSelectedSolarSpectrumGroupId: (groupId: SolarSpectrumObservationGroupId | null) => void;
  setSelectedSolarSpectrumObjectBindingId: (bindingId: string | null) => void;
  clearSolarSpectrumObjectBinding: () => void;
  setSelectedCasimirCavityGroupId: (groupId: CasimirCavityGroupId | null) => void;
  setSelectedCasimirCavityObjectBindingId: (bindingId: string | null) => void;
  clearCasimirCavityObjectBinding: () => void;
  setSelectedWarpGrNhm2GroupId: (groupId: WarpGrNhm2GroupId | null) => void;
  setSelectedWarpGrNhm2ObjectBindingId: (bindingId: string | null) => void;
  clearWarpGrNhm2ObjectBinding: () => void;
  setSelectedQeiStressEnergyGroupId: (groupId: QeiStressEnergyGroupId | null) => void;
  setSelectedQeiStressEnergyObjectBindingId: (bindingId: string | null) => void;
  clearQeiStressEnergyObjectBinding: () => void;
  setSelectedTokamakPlasmaGroupId: (groupId: TokamakPlasmaGroupId | null) => void;
  setSelectedTokamakPlasmaObjectBindingId: (bindingId: string | null) => void;
  clearTokamakPlasmaObjectBinding: () => void;
  setSelectedGalacticDynamicsGroupId: (groupId: GalacticDynamicsGroupId | null) => void;
  setSelectedGalacticDynamicsObjectBindingId: (bindingId: string | null) => void;
  clearGalacticDynamicsObjectBinding: () => void;
  setSelectedCurvatureCollapseGroupId: (groupId: CurvatureCollapseGroupId | null) => void;
  setSelectedCurvatureCollapseObjectBindingId: (bindingId: string | null) => void;
  clearCurvatureCollapseObjectBinding: () => void;
  resetPanelMemory: () => void;
};

const fallbackSessionStorage = (() => {
  const memory: Record<string, string> = {};
  return {
    getItem: (name: string) => memory[name] ?? null,
    setItem: (name: string, value: string) => {
      memory[name] = value;
    },
    removeItem: (name: string) => {
      delete memory[name];
    },
  };
})();

function resolveSessionStorage() {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    return fallbackSessionStorage;
  }
  return fallbackSessionStorage;
}

function normalizeScroll(value: number): number {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

const initialState = {
  selectedBadgeId: null,
  selectedBadgeIds: [] as string[],
  viewport: {
    scrollLeft: 0,
    scrollTop: 0,
  },
  activeAtlasLensId: null as TheoryBadgeGraphAtlasLensId | null,
  selectedStarSimStageId: null as StarSimStellarEvolutionStageId | null,
  selectedStarSimObjectBindingId: null as string | null,
  selectedCosmicDistanceRungId: null as CosmicDistanceLadderRungId | null,
  selectedCosmicDistanceObjectBindingId: null as string | null,
  selectedSolarSpectrumGroupId: null as SolarSpectrumObservationGroupId | null,
  selectedSolarSpectrumObjectBindingId: null as string | null,
  selectedCasimirCavityGroupId: null as CasimirCavityGroupId | null,
  selectedCasimirCavityObjectBindingId: null as string | null,
  selectedWarpGrNhm2GroupId: null as WarpGrNhm2GroupId | null,
  selectedWarpGrNhm2ObjectBindingId: null as string | null,
  selectedQeiStressEnergyGroupId: null as QeiStressEnergyGroupId | null,
  selectedQeiStressEnergyObjectBindingId: null as string | null,
  selectedTokamakPlasmaGroupId: null as TokamakPlasmaGroupId | null,
  selectedTokamakPlasmaObjectBindingId: null as string | null,
  selectedGalacticDynamicsGroupId: null as GalacticDynamicsGroupId | null,
  selectedGalacticDynamicsObjectBindingId: null as string | null,
  selectedCurvatureCollapseGroupId: null as CurvatureCollapseGroupId | null,
  selectedCurvatureCollapseObjectBindingId: null as string | null,
};

export const useTheoryBadgeGraphPanelStore = create<TheoryBadgeGraphPanelState>()(
  persist(
    (set) => ({
      ...initialState,
      setSelectedBadgeId: (badgeId) => set({ selectedBadgeId: badgeId }),
      setSelectedBadgeIds: (badgeIds) =>
        set({
          selectedBadgeIds: Array.from(new Set(badgeIds)),
        }),
      toggleSelectedBadgeId: (badgeId) =>
        set((state) => {
          const selectedBadgeIds = state.selectedBadgeIds.includes(badgeId)
            ? state.selectedBadgeIds.filter((id: string) => id !== badgeId)
            : [...state.selectedBadgeIds, badgeId];
          return {
            selectedBadgeId: badgeId,
            selectedBadgeIds,
          };
        }),
      rememberViewport: (viewport) =>
        set({
          viewport: {
            scrollLeft: normalizeScroll(viewport.scrollLeft),
            scrollTop: normalizeScroll(viewport.scrollTop),
          },
        }),
      setActiveAtlasLensId: (lensId) => set({ activeAtlasLensId: lensId }),
      setSelectedStarSimStageId: (stageId) => set({ selectedStarSimStageId: stageId }),
      setSelectedStarSimObjectBindingId: (bindingId) => set({ selectedStarSimObjectBindingId: bindingId }),
      clearStarSimObjectBinding: () =>
        set({
          selectedStarSimObjectBindingId: null,
        }),
      setSelectedCosmicDistanceRungId: (rungId) => set({ selectedCosmicDistanceRungId: rungId }),
      setSelectedCosmicDistanceObjectBindingId: (bindingId) =>
        set({ selectedCosmicDistanceObjectBindingId: bindingId }),
      clearCosmicDistanceObjectBinding: () =>
        set({
          selectedCosmicDistanceObjectBindingId: null,
        }),
      setSelectedSolarSpectrumGroupId: (groupId) => set({ selectedSolarSpectrumGroupId: groupId }),
      setSelectedSolarSpectrumObjectBindingId: (bindingId) =>
        set({ selectedSolarSpectrumObjectBindingId: bindingId }),
      clearSolarSpectrumObjectBinding: () =>
        set({
          selectedSolarSpectrumObjectBindingId: null,
        }),
      setSelectedCasimirCavityGroupId: (groupId) => set({ selectedCasimirCavityGroupId: groupId }),
      setSelectedCasimirCavityObjectBindingId: (bindingId) =>
        set({ selectedCasimirCavityObjectBindingId: bindingId }),
      clearCasimirCavityObjectBinding: () =>
        set({
          selectedCasimirCavityObjectBindingId: null,
        }),
      setSelectedWarpGrNhm2GroupId: (groupId) => set({ selectedWarpGrNhm2GroupId: groupId }),
      setSelectedWarpGrNhm2ObjectBindingId: (bindingId) =>
        set({ selectedWarpGrNhm2ObjectBindingId: bindingId }),
      clearWarpGrNhm2ObjectBinding: () =>
        set({
          selectedWarpGrNhm2ObjectBindingId: null,
        }),
      setSelectedQeiStressEnergyGroupId: (groupId) => set({ selectedQeiStressEnergyGroupId: groupId }),
      setSelectedQeiStressEnergyObjectBindingId: (bindingId) =>
        set({ selectedQeiStressEnergyObjectBindingId: bindingId }),
      clearQeiStressEnergyObjectBinding: () =>
        set({
          selectedQeiStressEnergyObjectBindingId: null,
        }),
      setSelectedTokamakPlasmaGroupId: (groupId) => set({ selectedTokamakPlasmaGroupId: groupId }),
      setSelectedTokamakPlasmaObjectBindingId: (bindingId) =>
        set({ selectedTokamakPlasmaObjectBindingId: bindingId }),
      clearTokamakPlasmaObjectBinding: () =>
        set({
          selectedTokamakPlasmaObjectBindingId: null,
        }),
      setSelectedGalacticDynamicsGroupId: (groupId) => set({ selectedGalacticDynamicsGroupId: groupId }),
      setSelectedGalacticDynamicsObjectBindingId: (bindingId) =>
        set({ selectedGalacticDynamicsObjectBindingId: bindingId }),
      clearGalacticDynamicsObjectBinding: () =>
        set({
          selectedGalacticDynamicsObjectBindingId: null,
        }),
      setSelectedCurvatureCollapseGroupId: (groupId) => set({ selectedCurvatureCollapseGroupId: groupId }),
      setSelectedCurvatureCollapseObjectBindingId: (bindingId) =>
        set({ selectedCurvatureCollapseObjectBindingId: bindingId }),
      clearCurvatureCollapseObjectBinding: () =>
        set({
          selectedCurvatureCollapseObjectBindingId: null,
        }),
      resetPanelMemory: () => set(initialState),
    }),
    {
      name: THEORY_BADGE_GRAPH_PANEL_MEMORY_KEY,
      storage: createJSONStorage(resolveSessionStorage),
      partialize: (state) => ({
        selectedBadgeId: state.selectedBadgeId,
        selectedBadgeIds: state.selectedBadgeIds,
        viewport: state.viewport,
        activeAtlasLensId: state.activeAtlasLensId,
        selectedStarSimStageId: state.selectedStarSimStageId,
        selectedStarSimObjectBindingId: state.selectedStarSimObjectBindingId,
        selectedCosmicDistanceRungId: state.selectedCosmicDistanceRungId,
        selectedCosmicDistanceObjectBindingId: state.selectedCosmicDistanceObjectBindingId,
        selectedSolarSpectrumGroupId: state.selectedSolarSpectrumGroupId,
        selectedSolarSpectrumObjectBindingId: state.selectedSolarSpectrumObjectBindingId,
        selectedCasimirCavityGroupId: state.selectedCasimirCavityGroupId,
        selectedCasimirCavityObjectBindingId: state.selectedCasimirCavityObjectBindingId,
        selectedWarpGrNhm2GroupId: state.selectedWarpGrNhm2GroupId,
        selectedWarpGrNhm2ObjectBindingId: state.selectedWarpGrNhm2ObjectBindingId,
        selectedQeiStressEnergyGroupId: state.selectedQeiStressEnergyGroupId,
        selectedQeiStressEnergyObjectBindingId: state.selectedQeiStressEnergyObjectBindingId,
        selectedTokamakPlasmaGroupId: state.selectedTokamakPlasmaGroupId,
        selectedTokamakPlasmaObjectBindingId: state.selectedTokamakPlasmaObjectBindingId,
        selectedGalacticDynamicsGroupId: state.selectedGalacticDynamicsGroupId,
        selectedGalacticDynamicsObjectBindingId: state.selectedGalacticDynamicsObjectBindingId,
        selectedCurvatureCollapseGroupId: state.selectedCurvatureCollapseGroupId,
        selectedCurvatureCollapseObjectBindingId: state.selectedCurvatureCollapseObjectBindingId,
      }),
    },
  ),
);
