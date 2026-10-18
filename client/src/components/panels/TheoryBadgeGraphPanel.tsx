import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Copy, ExternalLink, Play, Search, Trash2 } from "lucide-react";
import type {
  TheoryBadgeCalculatorPayloadV1,
  TheoryBadgeEdgeV1,
  TheoryBadgeEquationV1,
  TheoryBadgeGraphV1,
  TheoryBadgeLevel,
  TheoryBadgeSourceRefV1,
  TheoryBadgeUnitV1,
  TheoryBadgeV1,
} from "@shared/contracts/theory-badge-graph.v1";
import { isTheoryCompoundRunV1, type TheoryCompoundRunV1 } from "@shared/contracts/theory-compound-run.v1";
import type {
  TheoryBadgePlaybackArtifactV1,
  TheoryBadgePlaybackStepV1,
} from "@shared/contracts/theory-badge-playback.v1";
import {
  PROBABILITY_TERRAIN_SCHEMA_VERSION,
  type ProbabilityTerrainV1,
} from "@shared/contracts/probability-terrain.v1";
import type { TheoryContextReflectionV1 } from "@shared/contracts/theory-context-reflection.v1";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import CasimirCavityLens from "@/components/panels/CasimirCavityLens";
import CosmicDistanceLadderLens from "@/components/panels/CosmicDistanceLadderLens";
import CurvatureCollapseLens from "@/components/panels/CurvatureCollapseLens";
import GalacticDynamicsLens from "@/components/panels/GalacticDynamicsLens";
import PhysicsAtlasBlockLens from "@/components/panels/PhysicsAtlasBlockLens";
import QeiStressEnergyLens from "@/components/panels/QeiStressEnergyLens";
import SolarSpectrumLens from "@/components/panels/SolarSpectrumLens";
import StellarEvolutionLens from "@/components/panels/StellarEvolutionLens";
import TheoryAchievementMap from "@/components/panels/TheoryAchievementMap";
import TheoryAtlasRail, { type TheoryAtlasLensId } from "@/components/panels/TheoryAtlasRail";
import TokamakPlasmaLens from "@/components/panels/TokamakPlasmaLens";
import WarpGrNhm2Lens, {
  CAMPAIGN_GROUP_BY_BADGE,
  SelectedCampaignReceipt,
} from "@/components/panels/WarpGrNhm2Lens";
import { dispatchScientificCalculatorMathPicked } from "@/lib/scientific-calculator/events";
import { buildTheoryBadgeCombinationReaderPayloadForSelection } from "@/lib/theory/theoryBadgeCombinationReader";
import { resolveTheoryBadgeConnectionTrace } from "@/lib/theory/theoryBadgeConnectionTrace";
import { formatTheoryBadgePlaybackMarkdown } from "@/lib/theory/theoryBadgePlaybackRunner";
import { buildTheoryBadgeLocatorArtifact } from "@/lib/theory/theoryMapOverlay";
import { resolvePhysicsAtlasLens } from "@shared/theory/physics-atlas-lens";
import { buildHelixPhysicsAtlasV1 } from "@shared/theory/physics-atlas-blocks";
import { buildTheoryCalculatorLoadout } from "@shared/theory/theory-calculator-loadout";
import { buildTheoryCompoundRun } from "@shared/theory/theory-compound-run-builder";
import {
  resolveTheoryRouteEligibility,
  type TheoryRouteBadgeEligibilityV1,
  type TheoryRouteEligibilityResultV1,
} from "@shared/theory/theory-route-eligibility";
import { buildCasimirCavityObjectBindings } from "@shared/theory/casimir-cavity-object-bindings";
import { buildCosmicDistanceObjectBindings } from "@shared/theory/cosmic-distance-object-bindings";
import { buildNhm2DiagnosticObjectBindings } from "@shared/theory/nhm2-diagnostic-object-bindings";
import { buildSolarSpectrumObservationBindings } from "@shared/theory/solar-spectrum-observation-bindings";
import { buildStarSimObjectBindings } from "@shared/theory/starsim-object-bindings";
import { buildTokamakPlasmaObjectBindings } from "@shared/theory/tokamak-plasma-object-bindings";
import { buildGalacticDynamicsObjectBindings } from "@shared/theory/galactic-dynamics-object-bindings";
import { buildCurvatureCollapseObjectBindings } from "@shared/theory/curvature-collapse-object-bindings";
import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";
import { useTheoryBadgeGraphPanelStore } from "@/store/useTheoryBadgeGraphPanelStore";
import { useTheoryBadgePlaybackStore } from "@/store/useTheoryBadgePlaybackStore";
import { useTheoryCompoundRunStore } from "@/store/useTheoryCompoundRunStore";
import { useTheoryMapOverlayStore } from "@/store/useTheoryMapOverlayStore";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import { useDynamicTextTranslations } from "@/hooks/useDynamicTextTranslations";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText, type InterfaceTextResolver } from "@/lib/i18n/interfaceText";
import type { InterfaceMessageId } from "@/lib/i18n/messages/types";
import {
  STARSIM_STELLAR_EVOLUTION_STAGES,
  type StarSimStellarEvolutionStage,
} from "@shared/theory/starsim-stellar-evolution-map";
import {
  COSMIC_DISTANCE_LADDER_RUNGS,
  type CosmicDistanceLadderRung,
} from "@shared/theory/cosmic-distance-ladder-map";
import {
  SOLAR_SPECTRUM_OBSERVATION_GROUPS,
  type SolarSpectrumObservationGroup,
} from "@shared/theory/solar-spectrum-observation-map";
import {
  CASIMIR_CAVITY_GROUPS,
  type CasimirCavityGroup,
} from "@shared/theory/casimir-cavity-map";
import {
  WARP_GR_NHM2_GROUPS,
  type WarpGrNhm2Group,
} from "@shared/theory/warp-gr-nhm2-map";
import {
  QEI_STRESS_ENERGY_GROUPS,
  type QeiStressEnergyGroup,
} from "@shared/theory/qei-stress-energy-map";
import {
  TOKAMAK_PLASMA_GROUPS,
  type TokamakPlasmaGroup,
} from "@shared/theory/tokamak-plasma-map";
import {
  GALACTIC_DYNAMICS_GROUPS,
  type GalacticDynamicsGroup,
} from "@shared/theory/galactic-dynamics-map";
import {
  CURVATURE_COLLAPSE_GROUPS,
  type CurvatureCollapseGroup,
} from "@shared/theory/curvature-collapse-map";

const LEVEL_ORDER = [
  "first_principle",
  "law",
  "derived_relation",
  "model",
  "simulation_specific",
  "diagnostic_gate",
  "claim_boundary",
] as const satisfies readonly TheoryBadgeLevel[];

type TheoryGraphMapMode = "concept" | "execution" | "evidence";
type TheoryCompoundRunMode = "selected_badges" | "dependency_path" | "locator_matches";

type ArtifactRunExpectation = {
  selectedBadgeId?: string;
  activeAtlasLensId?: TheoryAtlasLensId;
  selectedCasimirGroupId?: string;
  selectedWarpGroupId?: string;
  selectedQeiGroupId?: string;
};

const RUNTIME_REFERENCE_OPERATOR_KINDS = [
  "tensor_component",
  "field_sample",
  "region_aggregate",
  "worldline_integral",
  "gate_status",
  "noncomputable_reference",
] as const;

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function pushDynamicText(target: string[], value: unknown) {
  if (typeof value !== "string") return;
  const text = value.trim();
  if (!text || /^[A-Z0-9_./:-]+$/.test(text)) return;
  target.push(text);
}

function collectAtlasPresetTexts(target: string[], entries: Array<{
  title?: string;
  description?: string;
  objectClass?: string;
  objectBindings?: Array<{ label?: string; description?: string }>;
}>) {
  for (const entry of entries) {
    pushDynamicText(target, entry.title);
    pushDynamicText(target, entry.description);
    pushDynamicText(target, entry.objectClass);
    for (const binding of entry.objectBindings ?? []) {
      pushDynamicText(target, binding.label);
      pushDynamicText(target, binding.description);
    }
  }
}

const THEORY_GRAPH_DYNAMIC_UI_TEXTS = [
  "Formal",
  "Quantum",
  "Nuclear",
  "Atomic",
  "Molecular",
  "Biophysical",
  "Device / Lab",
  "Engineering",
  "Planetary",
  "Stellar",
  "Galactic",
  "Boundary",
  "Foundation",
  "Relativity History",
  "Atomic Spectroscopy",
  "Astrochemistry",
  "Prebiotic Biophysics",
  "Evolutionary Biophysics",
  "Solar",
  "Casimir",
  "NHM2",
  "Open NHM2 Solve State",
  "Open atomic model experiment",
  "QEI Stress Energy",
  "Tokamak Plasma",
  "Galactic Dynamics",
  "Curvature Collapse",
  "Claim Boundary",
  "General",
  "Theory atlas lenses",
  "Live answer theory context",
  "Latest Ask-level theory reflection. Evidence only, not a solved answer.",
  "atlas lens",
  "(planned)",
  "Atlas",
  "active",
  "seed",
  "planned",
  "first principle",
  "law",
  "derived relation",
  "model",
  "simulation specific",
  "diagnostic gate",
  "claim boundary",
  "Mapped Badges",
  "Scalar Payloads",
  "Runtime Actions",
  "Select",
  "Use",
  "Clear",
  "Object Binding",
  "Cavity Binding",
  "Observation Binding",
  "Diagnostic Binding",
  "Plasma Binding",
  "Dynamics Binding",
  "Benchmark Binding",
  "object binding",
  "observation binding",
  "mapped badges",
  "scalar loadouts",
  "StarSim",
  "Stellar Evolution",
  "Cosmic",
  "Distance Ladder",
  "Surface & Spectrum",
  "Cavities",
  "Warp / GR",
  "NHM2 Diagnostics",
  "QEI",
  "Stress-Energy",
  "Tokamak",
  "Plasma",
  "Dynamics",
  "Curvature",
  "Collapse",
  "birth",
  "main sequence",
  "old age",
  "death",
  "remnant",
  "local",
  "spectrum",
  "standard candle",
  "cosmology",
  "static",
  "budget",
  "mode",
  "magnetic",
  "radiation",
  "flare",
  "gr",
  "geometry",
  "source",
  "diagnostic",
  "units",
  "qei",
  "gate",
  "pressure",
  "power",
  "precursor",
  "flux",
  "map",
  "velocity",
  "rotation",
  "null model",
  "curvature",
  "collapse",
  "uncertainty",
  "runtime",
  "Theory Seed Atlas frontier diagnostics",
  "fit",
  "congruence",
  "evidence",
  "Seed Atlas",
  "candidates",
  "evidence refs",
  "strong local fit",
  "moderate local fit",
  "weak cross domain fit",
  "missing region suspected",
  "off manifold",
  "Discussion context zone, not proof",
  "Theory badge graph zoom controls",
  "Zoom in",
  "Zoom in (+)",
  "Zoom out",
  "Zoom out (-)",
  "Runtime/reference stage. No scalar calculator payload.",
  "Runtime/reference rung. No scalar calculator payload.",
  "Runtime/reference context. No scalar calculator payload.",
  "Tensor/reference context. No scalar calculator payload.",
  "Gate/reference context. No scalar calculator payload.",
  "Runtime/null-model context. No scalar calculator payload.",
  "Runtime/benchmark context. No scalar calculator payload.",
  "Pick a lifecycle stage to light the matching theory badges.",
  "Pick a ladder rung to light the matching theory badges.",
  "Pick a solar observation to light matching spectrum badges.",
  "Pick a cavity group to light Casimir source-context badges.",
  "Pick a GR/NHM2 group to light diagnostic theory badges.",
  "Pick a QEI/stress group to light diagnostic badges.",
  "Pick a tokamak group to light plasma diagnostic badges.",
  "Pick a galactic group to light map and rotation-control badges.",
  "Pick a curvature/collapse group to light benchmark badges.",
  "No seeded badges yet. This lens still acts as a locator hint.",
  "No scalar calculator payloads seeded for this block yet.",
];

const THEORY_GRAPH_STATIC_UI_TEXT_IDS: Partial<Record<string, InterfaceMessageId>> = {
  "Relativity history rows do not validate NHM2, warp feasibility, or a physical propulsion mechanism.": "theoryBadgeGraph.ui.relativityRowsDoNotValidateNhm2WarpOrPropulsion",
  "Lorentz-FitzGerald contraction is historical context before Einsteinian spacetime interpretation.": "theoryBadgeGraph.ui.lorentzFitzGeraldContractionHistoricalContext",
  "No single experiment is represented as a one-step proof of special relativity.": "theoryBadgeGraph.ui.noSingleExperimentOneStepProofSpecialRelativity",
  "The experiment chain constrains instantaneous-light, Galilean light-speed addition, and simple aether-drift models.": "theoryBadgeGraph.ui.experimentChainConstrainsInstantaneousLight",
  "Retrieves the experiment chain and boundary; no NHM2 or warp validation is implied.": "theoryBadgeGraph.ui.retrievesExperimentChainAndBoundaryNoNhm2OrWarpValidation",
  "Locate relativity history constraints": "theoryBadgeGraph.ui.locateRelativityHistoryConstraints",
  "Speed of Light Constant": "theoryBadgeGraph.ui.speedOfLightConstant",
  "Relativity History Constraint Boundary": "theoryBadgeGraph.ui.relativityHistoryConstraintBoundary",
  "Lorentz Transformation Context": "theoryBadgeGraph.ui.lorentzTransformationContext",
  "Lorentz-FitzGerald Length Contraction Context": "theoryBadgeGraph.ui.lorentzFitzGeraldLengthContractionContext",
  "Trouton-Noble Torque Null": "theoryBadgeGraph.ui.troutonNobleTorqueNull",
  "Michelson-Morley Aether-Drift Null": "theoryBadgeGraph.ui.michelsonMorleyAetherDriftNull",
  "Fizeau Flowing-Water Drag": "theoryBadgeGraph.ui.fizeauFlowingWaterDrag",
  "Foucault Medium-Speed Constraint": "theoryBadgeGraph.ui.foucaultMediumSpeedConstraint",
  "Fizeau Toothed-Wheel Terrestrial c": "theoryBadgeGraph.ui.fizeauToothedWheelTerrestrialC",
  "Bradley Stellar Aberration": "theoryBadgeGraph.ui.bradleyStellarAberration",
  "Romer Io Light-Time Delay": "theoryBadgeGraph.ui.romerIoLightTimeDelay",
  "Romer Io eclipse timing, Bradley stellar aberration, Fizeau and Foucault light-speed measurements, moving-water drag, Michelson-Morley and Trouton-Noble null constraints, Lorentz contraction, and Lorentz transform context.": "theoryBadgeGraph.ui.relativityHistoryDescription",
  "Curvature / Collapse": "theoryBadgeGraph.ui.curvatureCollapseSlash",
  "QEI / Stress-Energy": "theoryBadgeGraph.ui.qeiStressEnergySlash",
  "NHM2 Full Solve": "theoryBadgeGraph.ui.nhm2FullSolve",
  "Warp / GR / NHM2": "theoryBadgeGraph.ui.warpGrNhm2",
  "Casimir Cavities": "theoryBadgeGraph.ui.casimirCavities",
  "Solar Surface & Spectrum": "theoryBadgeGraph.ui.solarSurfaceSpectrum",
  "Cosmic Distance Ladder": "theoryBadgeGraph.ui.cosmicDistanceLadder",
  "Astrochemistry / Prebiotic Coherence": "theoryBadgeGraph.ui.astrochemistryPrebioticCoherence",
  "Formal": "theoryBadgeGraph.ui.formal",
  "Quantum": "theoryBadgeGraph.ui.quantum",
  "Nuclear": "theoryBadgeGraph.ui.nuclear",
  "Atomic": "theoryBadgeGraph.ui.atomic",
  "Molecular": "theoryBadgeGraph.ui.molecular",
  "Biophysical": "theoryBadgeGraph.ui.biophysical",
  "Device / Lab": "theoryBadgeGraph.ui.deviceLab",
  "Engineering": "theoryBadgeGraph.ui.engineering",
  "Planetary": "theoryBadgeGraph.ui.planetary",
  "Stellar": "theoryBadgeGraph.ui.stellar",
  "Galactic": "theoryBadgeGraph.ui.galactic",
  "Boundary": "theoryBadgeGraph.ui.boundary",
  "Foundation": "theoryBadgeGraph.ui.foundation",
  "Relativity History": "theoryBadgeGraph.ui.relativityHistory",
  "Atomic Spectroscopy": "theoryBadgeGraph.ui.atomicSpectroscopy",
  "Astrochemistry": "theoryBadgeGraph.ui.astrochemistry",
  "Prebiotic Biophysics": "theoryBadgeGraph.ui.prebioticBiophysics",
  "Evolutionary Biophysics": "theoryBadgeGraph.ui.evolutionaryBiophysics",
  "Solar": "theoryBadgeGraph.ui.solar",
  "Casimir": "theoryBadgeGraph.ui.casimir",
  "NHM2": "theoryBadgeGraph.ui.nhm2",
  "QEI Stress Energy": "theoryBadgeGraph.ui.qeiStressEnergy",
  "Tokamak Plasma": "theoryBadgeGraph.ui.tokamakPlasma",
  "Galactic Dynamics": "theoryBadgeGraph.ui.galacticDynamics",
  "Curvature Collapse": "theoryBadgeGraph.ui.curvatureCollapse",
  "Claim Boundary": "theoryBadgeGraph.ui.claimBoundaryTitle",
  "General": "theoryBadgeGraph.ui.general",
  "StarSim": "theoryBadgeGraph.ui.starSim",
  "Stellar Evolution": "theoryBadgeGraph.ui.stellarEvolution",
  "Cosmic": "theoryBadgeGraph.ui.cosmic",
  "Distance Ladder": "theoryBadgeGraph.ui.distanceLadder",
  "Surface & Spectrum": "theoryBadgeGraph.ui.surfaceSpectrum",
  "Cavities": "theoryBadgeGraph.ui.cavities",
  "Warp / GR": "theoryBadgeGraph.ui.warpGr",
  "NHM2 Diagnostics": "theoryBadgeGraph.ui.nhm2Diagnostics",
  "QEI": "theoryBadgeGraph.ui.qei",
  "Stress-Energy": "theoryBadgeGraph.ui.stressEnergy",
  "Tokamak": "theoryBadgeGraph.ui.tokamak",
  "Plasma": "theoryBadgeGraph.ui.plasma",
  "Dynamics": "theoryBadgeGraph.ui.dynamics",
  "Curvature": "theoryBadgeGraph.ui.curvature",
  "Collapse": "theoryBadgeGraph.ui.collapse",
  "Theory atlas lenses": "theoryBadgeGraph.ui.theoryAtlasLenses",
  "Live answer theory context": "theoryBadgeGraph.ui.liveAnswerTheoryContext",
  "Latest Ask-level theory reflection. Evidence only, not a solved answer.": "theoryBadgeGraph.ui.latestAskLevelTheoryReflectionEvidenceOnlyNotASolvedAnswer",
  "atlas lens": "theoryBadgeGraph.ui.atlasLens",
  "(planned)": "theoryBadgeGraph.ui.planned",
  "Atlas": "theoryBadgeGraph.ui.atlas",
  "active": "theoryBadgeGraph.ui.active",
  "seed": "theoryBadgeGraph.ui.seed",
  "planned": "theoryBadgeGraph.ui.planned2",
  "first principle": "theoryBadgeGraph.ui.firstPrinciple",
  "law": "theoryBadgeGraph.ui.law",
  "derived relation": "theoryBadgeGraph.ui.derivedRelation",
  "model": "theoryBadgeGraph.ui.model",
  "simulation specific": "theoryBadgeGraph.ui.simulationSpecific",
  "diagnostic gate": "theoryBadgeGraph.ui.diagnosticGate",
  "claim boundary": "theoryBadgeGraph.ui.claimBoundary",
  "Mapped Badges": "theoryBadgeGraph.ui.mappedBadges",
  "Scalar Payloads": "theoryBadgeGraph.ui.scalarPayloads",
  "Runtime Actions": "theoryBadgeGraph.ui.runtimeActions",
  "Select": "theoryBadgeGraph.ui.select",
  "Use": "theoryBadgeGraph.ui.use",
  "Clear": "theoryBadgeGraph.ui.clear",
  "Object Binding": "theoryBadgeGraph.ui.objectBinding",
  "Cavity Binding": "theoryBadgeGraph.ui.cavityBinding",
  "Observation Binding": "theoryBadgeGraph.ui.observationBinding",
  "Diagnostic Binding": "theoryBadgeGraph.ui.diagnosticBinding",
  "Plasma Binding": "theoryBadgeGraph.ui.plasmaBinding",
  "Dynamics Binding": "theoryBadgeGraph.ui.dynamicsBinding",
  "Benchmark Binding": "theoryBadgeGraph.ui.benchmarkBinding",
  "object binding": "theoryBadgeGraph.ui.objectBinding2",
  "observation binding": "theoryBadgeGraph.ui.observationBinding2",
  "mapped badges": "theoryBadgeGraph.ui.mappedBadges2",
  "scalar loadouts": "theoryBadgeGraph.ui.scalarLoadouts",
  "Theory Seed Atlas frontier diagnostics": "theoryBadgeGraph.ui.theorySeedAtlasFrontierDiagnostics",
  "fit": "theoryBadgeGraph.ui.fit",
  "congruence": "theoryBadgeGraph.ui.congruence",
  "evidence": "theoryBadgeGraph.ui.evidence",
  "Seed Atlas": "theoryBadgeGraph.ui.seedAtlas",
  "candidates": "theoryBadgeGraph.ui.candidates",
  "evidence refs": "theoryBadgeGraph.ui.evidenceRefs",
  "strong local fit": "theoryBadgeGraph.ui.strongLocalFit",
  "moderate local fit": "theoryBadgeGraph.ui.moderateLocalFit",
  "weak cross domain fit": "theoryBadgeGraph.ui.weakCrossDomainFit",
  "missing region suspected": "theoryBadgeGraph.ui.missingRegionSuspected",
  "off manifold": "theoryBadgeGraph.ui.offManifold",
  "Discussion context zone, not proof": "theoryBadgeGraph.ui.discussionContextZoneNotProof",
  "Theory badge graph zoom controls": "theoryBadgeGraph.ui.theoryBadgeGraphZoomControls",
  "Zoom in": "theoryBadgeGraph.ui.zoomIn",
  "Zoom in (+)": "theoryBadgeGraph.ui.zoomInPlus",
  "Zoom out": "theoryBadgeGraph.ui.zoomOut",
  "Zoom out (-)": "theoryBadgeGraph.ui.zoomOut2",
  "Runtime/reference stage. No scalar calculator payload.": "theoryBadgeGraph.ui.runtimeReferenceStageNoScalarCalculatorPayload",
  "Runtime/reference rung. No scalar calculator payload.": "theoryBadgeGraph.ui.runtimeReferenceRungNoScalarCalculatorPayload",
  "Runtime/reference context. No scalar calculator payload.": "theoryBadgeGraph.ui.runtimeReferenceContextNoScalarCalculatorPayload",
  "Tensor/reference context. No scalar calculator payload.": "theoryBadgeGraph.ui.tensorReferenceContextNoScalarCalculatorPayload",
  "Gate/reference context. No scalar calculator payload.": "theoryBadgeGraph.ui.gateReferenceContextNoScalarCalculatorPayload",
  "Runtime/null-model context. No scalar calculator payload.": "theoryBadgeGraph.ui.runtimeNullModelContextNoScalarCalculatorPayload",
  "Runtime/benchmark context. No scalar calculator payload.": "theoryBadgeGraph.ui.runtimeBenchmarkContextNoScalarCalculatorPayload",
  "Pick a lifecycle stage to light the matching theory badges.": "theoryBadgeGraph.ui.pickALifecycleStageToLightTheMatchingTheoryBadges",
  "Pick a ladder rung to light the matching theory badges.": "theoryBadgeGraph.ui.pickALadderRungToLightTheMatchingTheoryBadges",
  "Pick a solar observation to light matching spectrum badges.": "theoryBadgeGraph.ui.pickASolarObservationToLightMatchingSpectrumBadges",
  "Pick a cavity group to light Casimir source-context badges.": "theoryBadgeGraph.ui.pickACavityGroupToLightCasimirSourceContextBadges",
  "Pick a GR/NHM2 group to light diagnostic theory badges.": "theoryBadgeGraph.ui.pickAGrNhm2GroupToLightDiagnosticTheoryBadges",
  "Pick a QEI/stress group to light diagnostic badges.": "theoryBadgeGraph.ui.pickAQeiStressGroupToLightDiagnosticBadges",
  "Pick a tokamak group to light plasma diagnostic badges.": "theoryBadgeGraph.ui.pickATokamakGroupToLightPlasmaDiagnosticBadges",
  "Pick a galactic group to light map and rotation-control badges.": "theoryBadgeGraph.ui.pickAGalacticGroupToLightMapAndRotationControlBadges",
  "Pick a curvature/collapse group to light benchmark badges.": "theoryBadgeGraph.ui.pickACurvatureCollapseGroupToLightBenchmarkBadges",
  "No seeded badges yet. This lens still acts as a locator hint.": "theoryBadgeGraph.ui.noSeededBadgesYetThisLensStillActsAsALocatorHint",
  "No scalar calculator payloads seeded for this block yet.": "theoryBadgeGraph.ui.noScalarCalculatorPayloadsSeededForThisBlockYet",
  "Dimension Consistency": "theoryBadgeGraph.shared.dimensionConsistency",
  "Checks that equations preserve compatible physical dimensions from input to output.": "theoryBadgeGraph.shared.checksThatEquationsPreserveCompatiblePhysicalDimensionsFromInputTo",
  "It is the root guardrail that keeps calculator payloads from connecting unrelated quantities.": "theoryBadgeGraph.shared.itIsTheRootGuardrailThatKeepsCalculatorPayloadsFrom",
  "Reference rule only.": "theoryBadgeGraph.shared.referenceRuleOnly",
  "Scalar calculator payloads still need explicit unit context.": "theoryBadgeGraph.shared.scalarCalculatorPayloadsStillNeedExplicitUnitContext",
  "Represents c as the invariant light-speed constant used by relativity relations.": "theoryBadgeGraph.shared.representsCAsTheInvariantLightSpeedConstantUsedBy",
  "It is a common bridge between relativity expressions and GR source equations.": "theoryBadgeGraph.shared.itIsACommonBridgeBetweenRelativityExpressionsAndGr",
  "Uses the SI exact defined value of c.": "theoryBadgeGraph.shared.usesTheSiExactDefinedValueOfC",
  "Quantum Energy-Frequency Relation": "theoryBadgeGraph.shared.quantumEnergyFrequencyRelation",
  "Relates photon-like energy to frequency through Planck's constant.": "theoryBadgeGraph.shared.relatesPhotonLikeEnergyToFrequencyThroughPlanckSConstant",
  "It gives energy-bearing quantum expressions a calculator-loadable root relation.": "theoryBadgeGraph.shared.itGivesEnergyBearingQuantumExpressionsACalculatorLoadableRoot",
  "Scalar relation only.": "theoryBadgeGraph.shared.scalarRelationOnly",
  "h is treated as a supplied constant in calculator runs.": "theoryBadgeGraph.shared.hIsTreatedAsASuppliedConstantInCalculatorRuns",
  "Momentum-Wavelength Relation": "theoryBadgeGraph.shared.momentumWavelengthRelation",
  "Relates de Broglie momentum to wavelength through Planck's constant.": "theoryBadgeGraph.shared.relatesDeBroglieMomentumToWavelengthThroughPlanckSConstant",
  "It provides a momentum root for energy-momentum relations.": "theoryBadgeGraph.shared.itProvidesAMomentumRootForEnergyMomentumRelations",
  "Position-Momentum Uncertainty": "theoryBadgeGraph.shared.positionMomentumUncertainty",
  "Represents the reference lower bound between position and momentum spread.": "theoryBadgeGraph.shared.representsTheReferenceLowerBoundBetweenPositionAndMomentumSpread",
  "It gives quantum-limit prompts a non-scalar reference badge without pretending it is a full solve.": "theoryBadgeGraph.shared.itGivesQuantumLimitPromptsANonScalarReferenceBadge",
  "Reference bound only.": "theoryBadgeGraph.shared.referenceBoundOnly",
  "No scalar calculator payload until a numeric substitution context is supplied.": "theoryBadgeGraph.shared.noScalarCalculatorPayloadUntilANumericSubstitutionContextIs",
  "Energy-Momentum Conservation": "theoryBadgeGraph.shared.energyMomentumConservation",
  "Represents conservation of the energy-momentum four-vector in symmetric settings.": "theoryBadgeGraph.shared.representsConservationOfTheEnergyMomentumFourVectorInSymmetric",
  "It is an upstream guardrail for stress-energy and source consistency badges.": "theoryBadgeGraph.shared.itIsAnUpstreamGuardrailForStressEnergyAndSource",
  "Reference conservation badge only.": "theoryBadgeGraph.shared.referenceConservationBadgeOnly",
  "Tensor and field forms are outside scalar calculator scope.": "theoryBadgeGraph.shared.tensorAndFieldFormsAreOutsideScalarCalculatorScope",
  "Relativistic Energy-Momentum Relation": "theoryBadgeGraph.shared.relativisticEnergyMomentumRelation",
  "Connects total energy, momentum, mass, and c in special relativity.": "theoryBadgeGraph.shared.connectsTotalEnergyMomentumMassAndCInSpecialRelativity",
  "It is a bridge from quantum momentum and c into rest-energy and energy-density badges.": "theoryBadgeGraph.shared.itIsABridgeFromQuantumMomentumAndCInto",
  "Scalar symbolic relation only.": "theoryBadgeGraph.shared.scalarSymbolicRelationOnly",
  "Calculator runs do not pick a physical branch without values.": "theoryBadgeGraph.shared.calculatorRunsDoNotPickAPhysicalBranchWithoutValues",
  "Rest Energy": "theoryBadgeGraph.shared.restEnergy",
  "Relates rest mass to rest energy through c squared.": "theoryBadgeGraph.shared.relatesRestMassToRestEnergyThroughCSquared",
  "It is a major bridge badge from relativity roots into energy-density and stress-energy reasoning.": "theoryBadgeGraph.shared.itIsAMajorBridgeBadgeFromRelativityRootsInto",
  "Rest-frame scalar relation only.": "theoryBadgeGraph.shared.restFrameScalarRelationOnly",
  "Energy Density": "theoryBadgeGraph.shared.energyDensity",
  "Relates an energy quantity to volume as density.": "theoryBadgeGraph.shared.relatesAnEnergyQuantityToVolumeAsDensity",
  "It directly bridges general physics into NHM2 source, QEI, and stress-energy badges.": "theoryBadgeGraph.shared.itDirectlyBridgesGeneralPhysicsIntoNhm2SourceQeiAnd",
  "Scalar density relation only.": "theoryBadgeGraph.shared.scalarDensityRelationOnly",
  "Does not select a source mechanism.": "theoryBadgeGraph.shared.doesNotSelectASourceMechanism",
  "Power Rate": "theoryBadgeGraph.shared.powerRate",
  "Relates energy transfer to elapsed time.": "theoryBadgeGraph.shared.relatesEnergyTransferToElapsedTime",
  "It anchors duty-cycle and average-power calculator payloads.": "theoryBadgeGraph.shared.itAnchorsDutyCycleAndAveragePowerCalculatorPayloads",
  "Scalar average-rate relation only.": "theoryBadgeGraph.shared.scalarAverageRateRelationOnly",
  "Lorentz Factor": "theoryBadgeGraph.shared.lorentzFactor",
  "Relates relative speed to the gamma factor used by relativistic frame comparisons.": "theoryBadgeGraph.shared.relatesRelativeSpeedToTheGammaFactorUsedByRelativistic",
  "It gives frame and velocity prompts a calculator-loadable relativity bridge.": "theoryBadgeGraph.shared.itGivesFrameAndVelocityPromptsACalculatorLoadableRelativity",
  "Requires |v| < c for ordinary real-valued interpretation.": "theoryBadgeGraph.shared.requiresVCForOrdinaryRealValuedInterpretation",
  "Stress-Energy Tensor": "theoryBadgeGraph.shared.stressEnergyTensor",
  "Organizes energy density, momentum flux, and stresses as the source object used by GR.": "theoryBadgeGraph.shared.organizesEnergyDensityMomentumFluxAndStressesAsTheSource",
  "It is the field bridge from scalar energy-density badges into Einstein-equation references.": "theoryBadgeGraph.shared.itIsTheFieldBridgeFromScalarEnergyDensityBadges",
  "Tensor reference only.": "theoryBadgeGraph.shared.tensorReferenceOnly",
  "Scalar calculator payloads feed related unit signatures, not tensor solving.": "theoryBadgeGraph.shared.scalarCalculatorPayloadsFeedRelatedUnitSignaturesNotTensorSolving",
  "Represents the finite-light-speed constraint from changing Io eclipse times as Earth-Jupiter distance changes.": "theoryBadgeGraph.shared.representsTheFiniteLightSpeedConstraintFromChangingIoEclipse",
  "It gives the graph the first observational step from instantaneous light toward measurable light propagation.": "theoryBadgeGraph.shared.itGivesTheGraphTheFirstObservationalStepFromInstantaneous",
  "Io eclipse timing is interpreted as a light-travel-time effect after orbital timing corrections.": "theoryBadgeGraph.shared.ioEclipseTimingIsInterpretedAsALightTravelTime",
  "This row constrains instantaneous-light models; it does not by itself establish special relativity.": "theoryBadgeGraph.shared.thisRowConstrainsInstantaneousLightModelsItDoesNotBy",
  "Represents stellar aberration as the angular effect of Earth orbital motion combined with finite light speed.": "theoryBadgeGraph.shared.representsStellarAberrationAsTheAngularEffectOfEarthOrbital",
  "It independently ties finite c to Earth's motion and gives the graph the next empirical constraint after Romer.": "theoryBadgeGraph.shared.itIndependentlyTiesFiniteCToEarthSMotionAnd",
  "Uses the small-angle stellar-aberration approximation.": "theoryBadgeGraph.shared.usesTheSmallAngleStellarAberrationApproximation",
  "Aberration supports finite light speed and Earth orbital motion, not a complete spacetime theory by itself.": "theoryBadgeGraph.shared.aberrationSupportsFiniteLightSpeedAndEarthOrbitalMotionNot",
  "Represents Fizeau's toothed-wheel experiment as a terrestrial round-trip light-time measurement.": "theoryBadgeGraph.shared.representsFizeauSToothedWheelExperimentAsATerrestrialRound",
  "It moves c from astronomy into repeatable laboratory measurement and strengthens the empirical backbone of the graph.": "theoryBadgeGraph.shared.itMovesCFromAstronomyIntoRepeatableLaboratoryMeasurementAnd",
  "Models the experiment as a reduced round-trip light-time measurement.": "theoryBadgeGraph.shared.modelsTheExperimentAsAReducedRoundTripLightTime",
  "The exact toothed-wheel timing apparatus is represented by the supplied round-trip time.": "theoryBadgeGraph.shared.theExactToothedWheelTimingApparatusIsRepresentedByThe",
  "Represents Foucault's rotating-mirror comparison showing light travels slower in water than in air.": "theoryBadgeGraph.shared.representsFoucaultSRotatingMirrorComparisonShowingLightTravelsSlower",
  "It links the speed-of-light chain to wave optics and blocks the older corpuscular expectation that denser media make light faster.": "theoryBadgeGraph.shared.itLinksTheSpeedOfLightChainToWaveOptics",
  "This row represents the medium-speed constraint, not a modern full dispersion model.": "theoryBadgeGraph.shared.thisRowRepresentsTheMediumSpeedConstraintNotAModern",
  "The result supports wave-optics context and does not alone establish relativity.": "theoryBadgeGraph.shared.theResultSupportsWaveOpticsContextAndDoesNotAlone",
  "Represents Fizeau's moving-water result as partial light drag rather than simple Galilean velocity addition.": "theoryBadgeGraph.shared.representsFizeauSMovingWaterResultAsPartialLightDrag",
  "It is one of the strongest experimental bridges from classical wave/aether models toward Lorentzian velocity structure.": "theoryBadgeGraph.shared.itIsOneOfTheStrongestExperimentalBridgesFromClassical",
  "Uses the Fresnel drag coefficient as a reduced moving-medium context.": "theoryBadgeGraph.shared.usesTheFresnelDragCoefficientAsAReducedMovingMedium",
  "Partial drag is not modeled as a direct proof of relativity; it is a constraint later explained by Lorentzian velocity addition.": "theoryBadgeGraph.shared.partialDragIsNotModeledAsADirectProofOf",
  "Represents the interferometer null result as a bound on directional light-speed variation from an aether wind.": "theoryBadgeGraph.shared.representsTheInterferometerNullResultAsABoundOnDirectional",
  "It is the central null constraint that forced classical aether models toward contraction hypotheses and Lorentz covariance.": "theoryBadgeGraph.shared.itIsTheCentralNullConstraintThatForcedClassicalAether",
  "The expected fringe-shift row is a simplified classical aether-drift diagnostic.": "theoryBadgeGraph.shared.theExpectedFringeShiftRowIsASimplifiedClassicalAether",
  "The observed null result constrains aether-drift models; it is not represented as a single proof of special relativity.": "theoryBadgeGraph.shared.theObservedNullResultConstrainsAetherDriftModelsItIs",
  "Represents the null torque result for a charged capacitor as an electromagnetic aether-drift constraint.": "theoryBadgeGraph.shared.representsTheNullTorqueResultForAChargedCapacitorAs",
  "It extends the aether problem beyond optics: electrostatic systems also failed to reveal absolute motion.": "theoryBadgeGraph.shared.itExtendsTheAetherProblemBeyondOpticsElectrostaticSystemsAlso",
  "The torque row is a classical aether-drift expectation used as a diagnostic comparison.": "theoryBadgeGraph.shared.theTorqueRowIsAClassicalAetherDriftExpectationUsed",
  "The observed null result blocks absolute-motion claims; it does not alone complete relativistic mechanics.": "theoryBadgeGraph.shared.theObservedNullResultBlocksAbsoluteMotionClaimsItDoes",
  "Represents length contraction as the historical bridge from aether-drift null results to Lorentzian kinematics.": "theoryBadgeGraph.shared.representsLengthContractionAsTheHistoricalBridgeFromAetherDrift",
  "It shows why the graph connects Michelson-Morley constraints to the Lorentz factor instead of treating contraction as arbitrary visual foreshortening.": "theoryBadgeGraph.shared.itShowsWhyTheGraphConnectsMichelsonMorleyConstraintsTo",
  "Historically, contraction was first used as a hypothesis to reconcile aether-drift null results.": "theoryBadgeGraph.shared.historicallyContractionWasFirstUsedAsAHypothesisToReconcile",
  "In special relativity, the same expression is interpreted kinematically through inertial-frame measurement.": "theoryBadgeGraph.shared.inSpecialRelativityTheSameExpressionIsInterpretedKinematicallyThrough",
  "Represents Lorentz transformations as the compact coordinate structure that preserves light-speed form across inertial frames.": "theoryBadgeGraph.shared.representsLorentzTransformationsAsTheCompactCoordinateStructureThatPreserves",
  "It is the formal endpoint of the historical constraint lane and connects the experiment sequence to the existing Lorentz-factor badge.": "theoryBadgeGraph.shared.itIsTheFormalEndpointOfTheHistoricalConstraintLane",
  "This row represents inertial-frame transformation context, not a full derivation of special relativity.": "theoryBadgeGraph.shared.thisRowRepresentsInertialFrameTransformationContextNotAFull",
  "The graph separates Lorentz's historical aether interpretation from Einstein's later spacetime interpretation.": "theoryBadgeGraph.shared.theGraphSeparatesLorentzSHistoricalAetherInterpretationFromEinstein",
  "Blocks promotion from any one historical experiment into a one-step proof of special relativity or any project physics claim.": "theoryBadgeGraph.shared.blocksPromotionFromAnyOneHistoricalExperimentIntoAOne",
  "It lets Helix explain why the experiments collectively forced a transition in physics without overstating a single result.": "theoryBadgeGraph.shared.itLetsHelixExplainWhyTheExperimentsCollectivelyForcedA",
  "No single experiment alone proves special relativity.": "theoryBadgeGraph.shared.noSingleExperimentAloneProvesSpecialRelativity",
  "The chain constrains instantaneous light, Galilean light-speed addition, and simple aether-drift models.": "theoryBadgeGraph.shared.theChainConstrainsInstantaneousLightGalileanLightSpeedAdditionAnd",
  "Lorentz-FitzGerald contraction before Einstein is historical explanatory context, not yet Einsteinian spacetime geometry.": "theoryBadgeGraph.shared.lorentzFitzgeraldContractionBeforeEinsteinIsHistoricalExplanatoryContextNot",
  "These rows support relativity foundations, not NHM2 validation, warp validation, or physical mechanism claims.": "theoryBadgeGraph.shared.theseRowsSupportRelativityFoundationsNotNhm2ValidationWarpValidation",
  "Einstein field equation": "theoryBadgeGraph.shared.einsteinFieldEquation",
  "Connects spacetime curvature with stress-energy as a canonical GR reference.": "theoryBadgeGraph.shared.connectsSpacetimeCurvatureWithStressEnergyAsACanonicalGr",
  "It anchors the graph in the field equation family that source and geometry diagnostics refer back to.": "theoryBadgeGraph.shared.itAnchorsTheGraphInTheFieldEquationFamilyThat",
  "Canonical reference only in this graph.": "theoryBadgeGraph.shared.canonicalReferenceOnlyInThisGraph",
  "Tensor solving is outside the scalar calculator path.": "theoryBadgeGraph.shared.tensorSolvingIsOutsideTheScalarCalculatorPath",
  "Stress-energy conservation": "theoryBadgeGraph.shared.stressEnergyConservation",
  "Tracks the compatibility condition that stress-energy should be conserved in the GR setting.": "theoryBadgeGraph.shared.tracksTheCompatibilityConditionThatStressEnergyShouldBeConserved",
  "It gives source diagnostics a conservation target without claiming a complete physical source model.": "theoryBadgeGraph.shared.itGivesSourceDiagnosticsAConservationTargetWithoutClaimingA",
  "Canonical compatibility relation.": "theoryBadgeGraph.shared.canonicalCompatibilityRelation",
  "No scalar calculator payload until tensor components are projected.": "theoryBadgeGraph.shared.noScalarCalculatorPayloadUntilTensorComponentsAreProjected",
  "3+1 decomposition": "theoryBadgeGraph.shared.31Decomposition",
  "Splits spacetime geometry into lapse, shift, and spatial metric terms used by simulation diagnostics.": "theoryBadgeGraph.shared.splitsSpacetimeGeometryIntoLapseShiftAndSpatialMetricTerms",
  "It bridges GR references to the lapse and shift quantities that NHM2 panels already expose.": "theoryBadgeGraph.shared.itBridgesGrReferencesToTheLapseAndShiftQuantities",
  "Reference decomposition only.": "theoryBadgeGraph.shared.referenceDecompositionOnly",
  "Calculator payloads use scalar projections of these fields.": "theoryBadgeGraph.shared.calculatorPayloadsUseScalarProjectionsOfTheseFields",
  "Lapse-shift profile sample": "theoryBadgeGraph.shared.lapseShiftProfileSample",
  "Represents a scalar timing offset used to inspect a sampled lapse-shift profile.": "theoryBadgeGraph.shared.representsAScalarTimingOffsetUsedToInspectASampled",
  "It gives the badge graph a calculator-loadable bridge from geometry language to a simple timing expression.": "theoryBadgeGraph.shared.itGivesTheBadgeGraphACalculatorLoadableBridgeFrom",
  "Scalar timing proxy only.": "theoryBadgeGraph.shared.scalarTimingProxyOnly",
  "Does not establish a complete spacetime solution.": "theoryBadgeGraph.shared.doesNotEstablishACompleteSpacetimeSolution",
  "Energy density proxy": "theoryBadgeGraph.shared.energyDensityProxy",
  "Relates an energy-like quantity to an effective sampled volume.": "theoryBadgeGraph.shared.relatesAnEnergyLikeQuantityToAnEffectiveSampledVolume",
  "It provides a simple scalar loadout for stress-energy unit checks and future badge-path playback.": "theoryBadgeGraph.shared.itProvidesASimpleScalarLoadoutForStressEnergyUnit",
  "Diagnostic scalar proxy only.": "theoryBadgeGraph.shared.diagnosticScalarProxyOnly",
  "Does not validate NHM2.": "theoryBadgeGraph.shared.doesNotValidateNhm2",
  "Tile duty-cycle average": "theoryBadgeGraph.shared.tileDutyCycleAverage",
  "Converts an energy-per-cycle term into an average power proxy over a cycle period.": "theoryBadgeGraph.shared.convertsAnEnergyPerCycleTermIntoAnAveragePower",
  "It links tile scheduling language to a scalar expression the calculator can replay deterministically.": "theoryBadgeGraph.shared.itLinksTileSchedulingLanguageToAScalarExpressionThe",
  "Averaging proxy only.": "theoryBadgeGraph.shared.averagingProxyOnly",
  "Tile duty values are diagnostic inputs, not a physical mechanism claim.": "theoryBadgeGraph.shared.tileDutyValuesAreDiagnosticInputsNotAPhysicalMechanism",
  "Source residual": "theoryBadgeGraph.shared.sourceResidual",
  "Compares a required source proxy with an available source proxy.": "theoryBadgeGraph.shared.comparesARequiredSourceProxyWithAnAvailableSourceProxy",
  "It gives closure diagnostics a named scalar residual that future path playback can trace.": "theoryBadgeGraph.shared.itGivesClosureDiagnosticsANamedScalarResidualThatFuture",
  "Residual is a diagnostic comparison.": "theoryBadgeGraph.shared.residualIsADiagnosticComparison",
  "A small residual is not a validation statement.": "theoryBadgeGraph.shared.aSmallResidualIsNotAValidationStatement",
  "Wall T00 source residual": "theoryBadgeGraph.shared.wallT00SourceResidual",
  "Compares metric-required wall T00 with the available wall-region source T00 before global source residuals are interpreted.": "theoryBadgeGraph.shared.comparesMetricRequiredWallT00WithTheAvailableWallRegion",
  "It makes the wall-region source mismatch the front-door closure blocker so global averages cannot hide local wall failure.": "theoryBadgeGraph.shared.itMakesTheWallRegionSourceMismatchTheFrontDoor",
  "Wall T00 residual is a diagnostic comparison.": "theoryBadgeGraph.shared.wallT00ResidualIsADiagnosticComparison",
  "Global source residuals are secondary context and cannot override wall failure.": "theoryBadgeGraph.shared.globalSourceResidualsAreSecondaryContextAndCannotOverrideWall",
  "A small wall residual is not a validation statement.": "theoryBadgeGraph.shared.aSmallWallResidualIsNotAValidationStatement",
  "Energy-condition diagnostic gate": "theoryBadgeGraph.shared.energyConditionDiagnosticGate",
  "Collects source and inequality indicators into a diagnostic gate label.": "theoryBadgeGraph.shared.collectsSourceAndInequalityIndicatorsIntoADiagnosticGateLabel",
  "It gives the theory graph a place to show warnings without implying a physical claim.": "theoryBadgeGraph.shared.itGivesTheTheoryGraphAPlaceToShowWarnings",
  "Gate status is diagnostic only.": "theoryBadgeGraph.shared.gateStatusIsDiagnosticOnly",
  "A favorable indicator does not confirm a physical mechanism.": "theoryBadgeGraph.shared.aFavorableIndicatorDoesNotConfirmAPhysicalMechanism",
  "QEI badge replay margin": "theoryBadgeGraph.shared.qeiBadgeReplayMargin",
  "It keeps the calculator-loadable scalar margin available without presenting it as a final QEI proof.": "theoryBadgeGraph.shared.itKeepsTheCalculatorLoadableScalarMarginAvailableWithoutPresenting",
  "Diagnostic badge replay only.": "theoryBadgeGraph.shared.diagnosticBadgeReplayOnly",
  "Bound comparison is a proxy unless backed by the QEI worldline dossier.": "theoryBadgeGraph.shared.boundComparisonIsAProxyUnlessBackedByTheQei",
  "The runtime dossier carries worldline, sampling, consistency, and regional margin provenance.": "theoryBadgeGraph.shared.theRuntimeDossierCarriesWorldlineSamplingConsistencyAndRegionalMargin",
  "Diagnostic-only claim boundary": "theoryBadgeGraph.shared.diagnosticOnlyClaimBoundary",
  "Marks NHM2 theory badges as diagnostic references rather than validation statements.": "theoryBadgeGraph.shared.marksNhm2TheoryBadgesAsDiagnosticReferencesRatherThanValidation",
  "It keeps UI language, graph edges, and future solve playback from overstating what the artifacts show.": "theoryBadgeGraph.shared.itKeepsUiLanguageGraphEdgesAndFutureSolvePlayback",
  "NHM2 badge traces are diagnostic artifacts.": "theoryBadgeGraph.shared.nhm2BadgeTracesAreDiagnosticArtifacts",
  "Promotion requires a separate review process outside this graph.": "theoryBadgeGraph.shared.promotionRequiresASeparateReviewProcessOutsideThisGraph",
  "Eulerian Normal Observer": "theoryBadgeGraph.shared.eulerianNormalObserver",
  "Defines the Eulerian normal observer from the same-chart lapse and shift fields.": "theoryBadgeGraph.shared.definesTheEulerianNormalObserverFromTheSameChartLapse",
  "It makes the observer basis explicit before any energy, momentum, stress, or energy-condition diagnostic is interpreted.": "theoryBadgeGraph.shared.itMakesTheObserverBasisExplicitBeforeAnyEnergyMomentum",
  "NHM2 full-solve rows are same-chart diagnostic context.": "theoryBadgeGraph.shared.nhm2FullSolveRowsAreSameChartDiagnosticContext",
  "Repository artifacts define row status and blocker state.": "theoryBadgeGraph.shared.repositoryArtifactsDefineRowStatusAndBlockerState",
  "External literature supplies formalism, context, and limitations only.": "theoryBadgeGraph.shared.externalLiteratureSuppliesFormalismContextAndLimitationsOnly",
  "No row establishes NHM2 validation, propulsion, physical feasibility, QEI completion, or a transport route.": "theoryBadgeGraph.shared.noRowEstablishesNhm2ValidationPropulsionPhysicalFeasibilityQeiCompletion",
  "Observer normalization depends on the declared lapse-shift chart.": "theoryBadgeGraph.shared.observerNormalizationDependsOnTheDeclaredLapseShiftChart",
  "Observer bookkeeping is not ordinary transport-speed authority.": "theoryBadgeGraph.shared.observerBookkeepingIsNotOrdinaryTransportSpeedAuthority",
  "Observer Energy-Density Projection": "theoryBadgeGraph.shared.observerEnergyDensityProjection",
  "Projects the same-chart stress-energy tensor into Eulerian energy density.": "theoryBadgeGraph.shared.projectsTheSameChartStressEnergyTensorIntoEulerianEnergy",
  "It separates observer-projected energy density from a raw coordinate component or scalar source proxy.": "theoryBadgeGraph.shared.itSeparatesObserverProjectedEnergyDensityFromARawCoordinate",
  "Projected E is observer-family evidence, not a full energy-condition result.": "theoryBadgeGraph.shared.projectedEIsObserverFamilyEvidenceNotAFullEnergy",
  "The tensor and observer normal must share one chart and basis.": "theoryBadgeGraph.shared.theTensorAndObserverNormalMustShareOneChartAnd",
  "Observer Momentum-Density Projection": "theoryBadgeGraph.shared.observerMomentumDensityProjection",
  "Projects the same-chart stress-energy tensor into Eulerian momentum density.": "theoryBadgeGraph.shared.projectsTheSameChartStressEnergyTensorIntoEulerianMomentum",
  "It makes the missing or review-gated momentum channels visible so diagonal-only source proxies cannot stand in for full observer authority.": "theoryBadgeGraph.shared.itMakesTheMissingOrReviewGatedMomentumChannelsVisible",
  "A diagonal-only stress proxy cannot substitute for observer momentum-density channels.": "theoryBadgeGraph.shared.aDiagonalOnlyStressProxyCannotSubstituteForObserverMomentum",
  "Momentum projection remains review-gated unless component authority is attached.": "theoryBadgeGraph.shared.momentumProjectionRemainsReviewGatedUnlessComponentAuthorityIsAttached",
  "Observer Spatial-Stress Projection": "theoryBadgeGraph.shared.observerSpatialStressProjection",
  "Projects the same-chart stress-energy tensor into spatial stress components.": "theoryBadgeGraph.shared.projectsTheSameChartStressEnergyTensorIntoSpatialStress",
  "It records the off-diagonal spatial-stress authority required before observer-family diagnostics can be interpreted strongly.": "theoryBadgeGraph.shared.itRecordsTheOffDiagonalSpatialStressAuthorityRequiredBefore",
  "Off-diagonal stress authority is required for full observer-family interpretation.": "theoryBadgeGraph.shared.offDiagonalStressAuthorityIsRequiredForFullObserverFamily",
  "Review-gated tensor cells block promotion-sensitive wording.": "theoryBadgeGraph.shared.reviewGatedTensorCellsBlockPromotionSensitiveWording",
  "Full Tensor Authority Gate": "theoryBadgeGraph.shared.fullTensorAuthorityGate",
  "It makes the diagonal-only blocker explicit before observer-family WEC/NEC/SEC/DEC diagnostics can be interpreted.": "theoryBadgeGraph.shared.itMakesTheDiagonalOnlyBlockerExplicitBeforeObserverFamily",
  "Diagonal-only tensor output blocks full observer authority.": "theoryBadgeGraph.shared.diagonalOnlyTensorOutputBlocksFullObserverAuthority",
  "Momentum-density and off-diagonal spatial-stress channels must be emitted in the same chart.": "theoryBadgeGraph.shared.momentumDensityAndOffDiagonalSpatialStressChannelsMustBe",
  "Same-Chart Full Tensor Artifact": "theoryBadgeGraph.shared.sameChartFullTensorArtifact",
  "Tracks explicit T00, T0i momentum-density, diagonal stress, and off-diagonal stress component status in one chart.": "theoryBadgeGraph.shared.tracksExplicitT00T0iMomentumDensityDiagonalStressAndOff",
  "It prevents missing T0i or off-diagonal Tij components from being silently interpreted as zero or complete.": "theoryBadgeGraph.shared.itPreventsMissingT0iOrOffDiagonalTijComponentsFrom",
  "The artifact is a component-status contract, not a tensor optimizer.": "theoryBadgeGraph.shared.theArtifactIsAComponentStatusContractNotATensor",
  "Missing components remain missing or blocked and are not zero-filled.": "theoryBadgeGraph.shared.missingComponentsRemainMissingOrBlockedAndAreNotZero",
  "Metric-Required Stress-Energy Tensor": "theoryBadgeGraph.shared.metricRequiredStressEnergyTensor",
  "Names the geometry-first stress-energy tensor required by the selected same-chart metric.": "theoryBadgeGraph.shared.namesTheGeometryFirstStressEnergyTensorRequiredByThe",
  "It separates what the metric demands from any proposed source-side mechanism or tile-effective counterpart.": "theoryBadgeGraph.shared.itSeparatesWhatTheMetricDemandsFromAnyProposedSource",
  "Metric-required tensor authority is not source-side mechanism authority.": "theoryBadgeGraph.shared.metricRequiredTensorAuthorityIsNotSourceSideMechanismAuthority",
  "The Einstein-tensor route is repository-internal metric evaluation context.": "theoryBadgeGraph.shared.theEinsteinTensorRouteIsRepositoryInternalMetricEvaluationContext",
  "Tile-Effective Tensor Counterpart": "theoryBadgeGraph.shared.tileEffectiveTensorCounterpart",
  "Represents the source-side tile-effective tensor requirement in the same chart, basis, region mask, and normalization convention.": "theoryBadgeGraph.shared.representsTheSourceSideTileEffectiveTensorRequirementInThe",
  "It prevents a mechanism-side Casimir narrative from being mistaken for the tensor counterpart required by the metric route.": "theoryBadgeGraph.shared.itPreventsAMechanismSideCasimirNarrativeFromBeingMistaken",
  "Tile-effective counterpart evidence must be source-side and same-basis.": "theoryBadgeGraph.shared.tileEffectiveCounterpartEvidenceMustBeSourceSideAndSame",
  "A mechanism-side source model is not the tensor counterpart by itself.": "theoryBadgeGraph.shared.aMechanismSideSourceModelIsNotTheTensorCounterpart",
  "Source-Side Same-Basis Tensor Authority": "theoryBadgeGraph.shared.sourceSideSameBasisTensorAuthority",
  "Records whether the tile/material side supplies an independent same-chart tensor counterpart instead of a proxy scalar or metric echo.": "theoryBadgeGraph.shared.recordsWhetherTheTileMaterialSideSuppliesAnIndependentSame",
  "It prevents wall T00 closure from comparing metric-required geometry against a scalar or observation path that is not source-side tensor authority.": "theoryBadgeGraph.shared.itPreventsWallT00ClosureFromComparingMetricRequiredGeometry",
  "Source authority must be independently produced on the source side.": "theoryBadgeGraph.shared.sourceAuthorityMustBeIndependentlyProducedOnTheSourceSide",
  "Metric-required tensors, scalar Casimir budgets, and GR matter observations are not source-side tensor receipts by themselves.": "theoryBadgeGraph.shared.metricRequiredTensorsScalarCasimirBudgetsAndGrMatterObservations",
  "Wall T00 residuals remain diagnostic until wall source-side tensor authority exists.": "theoryBadgeGraph.shared.wallT00ResidualsRemainDiagnosticUntilWallSourceSideTensor",
  "Source Component Authority Ledger": "theoryBadgeGraph.shared.sourceComponentAuthorityLedger",
  "Records whether each regional source-side tensor component is present, admissible, non-proxy, and non-metric-echo.": "theoryBadgeGraph.shared.recordsWhetherEachRegionalSourceSideTensorComponentIsPresent",
  "It lets the theory graph distinguish evidence admission from physical material proof and prevents stale source-authority blockers from hiding the next gate.": "theoryBadgeGraph.shared.itLetsTheTheoryGraphDistinguishEvidenceAdmissionFromPhysical",
  "The ledger is an evidence-admission surface, not a material-source proof.": "theoryBadgeGraph.shared.theLedgerIsAnEvidenceAdmissionSurfaceNotAMaterial",
  "A complete component ledger cannot override residual, conservation, QEI, observer, material, reproducibility, or claim gates.": "theoryBadgeGraph.shared.aCompleteComponentLedgerCannotOverrideResidualConservationQeiObserver",
  "The current smoke-chain ledger is local pinned evidence and still requires frozen reference-chain promotion review.": "theoryBadgeGraph.shared.theCurrentSmokeChainLedgerIsLocalPinnedEvidenceAnd",
  "Wall T00 Trace Blocker": "theoryBadgeGraph.shared.wallT00TraceBlocker",
  "Promotes the wall-region metric-required T00 versus tile-effective T00 residual to an explicit blocker surface.": "theoryBadgeGraph.shared.promotesTheWallRegionMetricRequiredT00VersusTileEffective",
  "The wall residual is the high-risk source-closure anomaly and should not be hidden behind flattering global aggregates.": "theoryBadgeGraph.shared.theWallResidualIsTheHighRiskSourceClosureAnomaly",
  "Wall T00 mismatch is a blocker trace, not a solved source-closure route.": "theoryBadgeGraph.shared.wallT00MismatchIsABlockerTraceNotASolved",
  "Same-Basis Regional Tensor Residual": "theoryBadgeGraph.shared.sameBasisRegionalTensorResidual",
  "Compares metric-required and tile-effective tensors only after same-basis regional alignment.": "theoryBadgeGraph.shared.comparesMetricRequiredAndTileEffectiveTensorsOnlyAfterSame",
  "It names the central full-solve divergence surface without implying the source-to-geometry bridge is complete.": "theoryBadgeGraph.shared.itNamesTheCentralFullSolveDivergenceSurfaceWithoutImplying",
  "Residual comparison requires same chart, basis, region mask, aggregation mode, and normalization.": "theoryBadgeGraph.shared.residualComparisonRequiresSameChartBasisRegionMaskAggregationMode",
  "Small or incomplete residuals are diagnostic comparisons, not source closure completion.": "theoryBadgeGraph.shared.smallOrIncompleteResidualsAreDiagnosticComparisonsNotSourceClosure",
  "Coupled Closure Pass Candidate": "theoryBadgeGraph.shared.coupledClosurePassCandidate",
  "Synchronizes source authority, regional residuals, conservation, QEI dossier, observer robustness, and material receipt gates into one diagnostic candidate.": "theoryBadgeGraph.shared.synchronizesSourceAuthorityRegionalResidualsConservationQeiDossierObserverRobustness",
  "It is the runtime row that prevents a green-looking individual gate from being mistaken for full-solve closure.": "theoryBadgeGraph.shared.itIsTheRuntimeRowThatPreventsAGreenLooking",
  "The current pinned smoke-chain coupled candidate is false.": "theoryBadgeGraph.shared.theCurrentPinnedSmokeChainCoupledCandidateIsFalse",
  "A coupled candidate is a diagnostic synchronization gate and still cannot grant physical or transport claims.": "theoryBadgeGraph.shared.aCoupledCandidateIsADiagnosticSynchronizationGateAndStill",
  "Individual pass rows cannot override a failed coupled closure candidate.": "theoryBadgeGraph.shared.individualPassRowsCannotOverrideAFailedCoupledClosureCandidate",
  "Regional Tensor Pass-Path Harness": "theoryBadgeGraph.shared.regionalTensorPassPathHarness",
  "Reports whether the regional tensor closure path is numerically ready after source authority, wall T00, residual, conservation, QEI, observer, material, and coupled-candidate gates.": "theoryBadgeGraph.shared.reportsWhetherTheRegionalTensorClosurePathIsNumericallyReady",
  "It is the graph row that answers what still has to pass numerically without converting smoke-chain progress into physical viability.": "theoryBadgeGraph.shared.itIsTheGraphRowThatAnswersWhatStillHas",
  "The harness is an artifact-backed scoreboard, not a calculator formula.": "theoryBadgeGraph.shared.theHarnessIsAnArtifactBackedScoreboardNotACalculator",
  "Physical and transport claims remain forbidden even if diagnostic readiness improves.": "theoryBadgeGraph.shared.physicalAndTransportClaimsRemainForbiddenEvenIfDiagnosticReadiness",
  "Switching Covariant Conservation": "theoryBadgeGraph.shared.switchingCovariantConservation",
  "Records whether the dynamic source campaign includes regional-support, sector-boundary, time-derivative, and transition-kernel conservation terms.": "theoryBadgeGraph.shared.recordsWhetherTheDynamicSourceCampaignIncludesRegionalSupportSector",
  "It prevents static covariant conservation from being mistaken for conservation of a sector-switched time-dependent source.": "theoryBadgeGraph.shared.itPreventsStaticCovariantConservationFromBeingMistakenForConservation",
  "Static covariant conservation cannot substitute for switching-sector conservation.": "theoryBadgeGraph.shared.staticCovariantConservationCannotSubstituteForSwitchingSectorConservation",
  "This row is runtime evidence and has no calculator payload.": "theoryBadgeGraph.shared.thisRowIsRuntimeEvidenceAndHasNoCalculatorPayload",
  "Frequency Convergence": "theoryBadgeGraph.shared.frequencyConvergence",
  "Records whether a frozen frequency ladder converges at fixed cycle-average source over f, 2f, 4f, and 8f.": "theoryBadgeGraph.shared.recordsWhetherAFrozenFrequencyLadderConvergesAtFixedCycle",
  "It distinguishes a single-frequency artifact from an effective-source limit that remains stable as switching frequency increases.": "theoryBadgeGraph.shared.itDistinguishesASingleFrequencyArtifactFromAnEffectiveSource",
  "A single-frequency result fails closed.": "theoryBadgeGraph.shared.aSingleFrequencyResultFailsClosed",
  "Cycle-average source must remain fixed across the ladder.": "theoryBadgeGraph.shared.cycleAverageSourceMustRemainFixedAcrossTheLadder",
  "Dynamic/Effective Geometry Agreement": "theoryBadgeGraph.shared.dynamicEffectiveGeometryAgreement",
  "Checks whether a time-averaged dynamic source geometry agrees with the reduced-order effective-source geometry and has bounded backreaction residuals.": "theoryBadgeGraph.shared.checksWhetherATimeAveragedDynamicSourceGeometryAgreesWith",
  "It verifies the current smoke-chain dynamic and effective geometry channels have a bounded diagnostic residual, then hands the campaign to the full regional tensor closure gate.": "theoryBadgeGraph.shared.itVerifiesTheCurrentSmokeChainDynamicAndEffectiveGeometry",
  "A static effective geometry summary cannot substitute for dynamic geometry samples.": "theoryBadgeGraph.shared.aStaticEffectiveGeometrySummaryCannotSubstituteForDynamicGeometry",
  "Missing dynamic geometry, missing effective geometry, missing averaged source tensor, missing backreaction receipt, or unbounded backreaction must block this gate.": "theoryBadgeGraph.shared.missingDynamicGeometryMissingEffectiveGeometryMissingAveragedSourceTensor",
  "Off-Diagonal Shear Audit": "theoryBadgeGraph.shared.offDiagonalShearAudit",
  "Checks whether source-side off-diagonal spatial-stress components have documented shear or anisotropic mechanism evidence.": "theoryBadgeGraph.shared.checksWhetherSourceSideOffDiagonalSpatialStressComponentsHave",
  "It separates a declared full tensor from a physically interpretable source model for T12, T13, and T23.": "theoryBadgeGraph.shared.itSeparatesADeclaredFullTensorFromAPhysicallyInterpretable",
  "A generic declared source tensor is not enough to document a shear or anisotropic mechanism.": "theoryBadgeGraph.shared.aGenericDeclaredSourceTensorIsNotEnoughToDocument",
  "A shear-audit sidecar sharpens the blocker but does not validate a physical source.": "theoryBadgeGraph.shared.aShearAuditSidecarSharpensTheBlockerButDoesNot",
  "Pass-window values are derived from metric-required residual checks and cannot be used as source-model inputs.": "theoryBadgeGraph.shared.passWindowValuesAreDerivedFromMetricRequiredResidualChecks",
  "Momentum-Density Audit": "theoryBadgeGraph.shared.momentumDensityAudit",
  "Checks whether source-side T0i momentum-density components have documented flux, current, or constitutive momentum evidence.": "theoryBadgeGraph.shared.checksWhetherSourceSideT0iMomentumDensityComponentsHaveDocumented",
  "It separates a present T0i tensor row from a source model that can actually explain momentum density on the same chart.": "theoryBadgeGraph.shared.itSeparatesAPresentT0iTensorRowFromASource",
  "A declared full tensor row does not by itself document a momentum-density mechanism.": "theoryBadgeGraph.shared.aDeclaredFullTensorRowDoesNotByItselfDocument",
  "Momentum-density pass windows are residual diagnostics and cannot be used as source-model inputs.": "theoryBadgeGraph.shared.momentumDensityPassWindowsAreResidualDiagnosticsAndCannotBe",
  "A current-model falsifier is scoped to the declared source model and is not a universal impossibility proof.": "theoryBadgeGraph.shared.aCurrentModelFalsifierIsScopedToTheDeclaredSource",
  "Momentum Frame Projection Receipt": "theoryBadgeGraph.shared.momentumFrameProjectionReceipt",
  "Checks whether same-chart T0i/T00 momentum ratios have a local orthonormal projection receipt before causal-material bound language is allowed.": "theoryBadgeGraph.shared.checksWhetherSameChartT0iT00MomentumRatiosHaveA",
  "It prevents chart-basis component ratios from being promoted into physical causal-material falsifiers without an observer-frame or tetrad receipt.": "theoryBadgeGraph.shared.itPreventsChartBasisComponentRatiosFromBeingPromotedInto",
  "A same-chart component ratio is diagnostic until a local orthonormal or observer-frame projection receipt exists.": "theoryBadgeGraph.shared.aSameChartComponentRatioIsDiagnosticUntilALocal",
  "A blocked projection receipt sharpens the campaign blocker but does not validate or falsify all possible material sources.": "theoryBadgeGraph.shared.aBlockedProjectionReceiptSharpensTheCampaignBlockerButDoes",
  "No calculator payload is provided because the receipt is a runtime evidence gate, not a scalar replay row.": "theoryBadgeGraph.shared.noCalculatorPayloadIsProvidedBecauseTheReceiptIsA",
  "Metric-Required Momentum Demand Audit": "theoryBadgeGraph.shared.metricRequiredMomentumDemandAudit",
  "Reports whether the metric-required projected momentum density exceeds the causal momentum-to-energy bound for the current profile.": "theoryBadgeGraph.shared.reportsWhetherTheMetricRequiredProjectedMomentumDensityExceedsThe",
  "It separates a source-model failure from a current metric-profile demand that is already too large under the declared reduced-order local-frame projection.": "theoryBadgeGraph.shared.itSeparatesASourceModelFailureFromACurrentMetric",
  "The audit consumes a projection receipt; it does not infer local-frame ratios from chart components by itself.": "theoryBadgeGraph.shared.theAuditConsumesAProjectionReceiptItDoesNotInfer",
  "The current-profile falsifier is scoped to the declared reduced-order projection evidence and does not prove universal metric impossibility.": "theoryBadgeGraph.shared.theCurrentProfileFalsifierIsScopedToTheDeclaredReduced",
  "No calculator payload is provided because the audit is a runtime evidence gate, not a scalar replay row.": "theoryBadgeGraph.shared.noCalculatorPayloadIsProvidedBecauseTheAuditIsA",
  "Metric Momentum Remediation Targets": "theoryBadgeGraph.shared.metricMomentumRemediationTargets",
  "Reports how much the current metric-required projected T0i demand would have to be suppressed before this profile could re-enter the reduced-order campaign.": "theoryBadgeGraph.shared.reportsHowMuchTheCurrentMetricRequiredProjectedT0iDemand",
  "It turns the metric-required momentum falsifier into a concrete redesign target instead of leaving the campaign blocked by an opaque T0i failure.": "theoryBadgeGraph.shared.itTurnsTheMetricRequiredMomentumFalsifierIntoAConcrete",
  "The remediation target is scoped to the current profile and declared reduced-order projection evidence.": "theoryBadgeGraph.shared.theRemediationTargetIsScopedToTheCurrentProfileAnd",
  "A remediation target does not validate a new metric profile or source mechanism.": "theoryBadgeGraph.shared.aRemediationTargetDoesNotValidateANewMetricProfile",
  "Allowed levers are metric-profile redesign, a stronger full ADM tetrad projection receipt, or rejecting the current profile for this campaign.": "theoryBadgeGraph.shared.allowedLeversAreMetricProfileRedesignAStrongerFullAdm",
  "Campaign Frontier Disposition": "theoryBadgeGraph.shared.campaignFrontierDisposition",
  "Turns the campaign's current frontier blocker into a typed disposition: the current profile is rejected under the declared reduced-order projected T0i demand evidence.": "theoryBadgeGraph.shared.turnsTheCampaignSCurrentFrontierBlockerIntoATyped",
  "It keeps the solve loop focused on profile redesign, full ADM/tetrad projection evidence, or current-profile rejection instead of hiding a non-resolvable momentum-density demand behind generic campaign failure.": "theoryBadgeGraph.shared.itKeepsTheSolveLoopFocusedOnProfileRedesignFull",
  "The disposition is scoped to the current profile, current run identity, and declared reduced-order projection evidence.": "theoryBadgeGraph.shared.theDispositionIsScopedToTheCurrentProfileCurrentRun",
  "Current-profile rejection does not prove a universal impossibility theorem for NHM2 or for all possible profiles.": "theoryBadgeGraph.shared.currentProfileRejectionDoesNotProveAUniversalImpossibilityTheorem",
  "The allowed next actions are metric-profile redesign, stronger full ADM/tetrad projection evidence, or rejecting this profile for the campaign.": "theoryBadgeGraph.shared.theAllowedNextActionsAreMetricProfileRedesignStrongerFull",
  "Campaign Profile Search": "theoryBadgeGraph.shared.campaignProfileSearch",
  "Screens candidate NHM2 profiles against the current metric-required momentum frontier before spending a full frozen campaign run.": "theoryBadgeGraph.shared.screensCandidateNhm2ProfilesAgainstTheCurrentMetricRequiredMomentum",
  "It separates faster clocking ambitions from profiles that actually reduce the projected T0i blocker exposed by the current campaign.": "theoryBadgeGraph.shared.itSeparatesFasterClockingAmbitionsFromProfilesThatActuallyReduce",
  "Fastest means lowest alpha only after the current projected T0i campaign screen is cleared.": "theoryBadgeGraph.shared.fastestMeansLowestAlphaOnlyAfterTheCurrentProjectedT0i",
  "Alpha-only candidates are rejected because changing clocking depth alone does not retire metric-required momentum density.": "theoryBadgeGraph.shared.alphaOnlyCandidatesAreRejectedBecauseChangingClockingDepthAlone",
  "A profile-search screen pass requires a full frozen campaign run and does not pass the campaign by itself.": "theoryBadgeGraph.shared.aProfileSearchScreenPassRequiresAFullFrozenCampaign",
  "Candidate Metric Profile Spec": "theoryBadgeGraph.shared.candidateMetricProfileSpec",
  "Records the screened profile definition, diagnostic trip-clocking value, and whether executable candidate geometry exists for the full ADM tensor route.": "theoryBadgeGraph.shared.recordsTheScreenedProfileDefinitionDiagnosticTripClockingValueAnd",
  "It keeps fast-profile exploration honest: lower alpha and projected T0i suppression cannot enter the real metric tensor route until a candidate shift-field evaluator, regional atlas, and grid are declared.": "theoryBadgeGraph.shared.itKeepsFastProfileExplorationHonestLowerAlphaAndProjected",
  "The candidate spec is an admission precondition for a fresh ADM/Einstein metric-required tensor route.": "theoryBadgeGraph.shared.theCandidateSpecIsAnAdmissionPreconditionForAFresh",
  "The 0p9000 combined metric-redesign row currently lacks an executable shift-field evaluator, regional support atlas ref, and grid ref.": "theoryBadgeGraph.shared.the0p9000CombinedMetricRedesignRowCurrentlyLacksAnExecutable",
  "Trip-clocking values remain diagnostic and do not certify route ETA, speed, transport, or physical viability.": "theoryBadgeGraph.shared.tripClockingValuesRemainDiagnosticAndDoNotCertifyRoute",
  "Campaign Profile Run Manifest": "theoryBadgeGraph.shared.campaignProfileRunManifest",
  "Lists the frozen campaign evidence that each screened profile must produce before the profile can be ranked as campaign-admissible.": "theoryBadgeGraph.shared.listsTheFrozenCampaignEvidenceThatEachScreenedProfileMust",
  "It turns a promising profile screen into an explicit missing-evidence checklist for full tensor, conservation, QEI, observer, dynamic, and stability gates.": "theoryBadgeGraph.shared.itTurnsAPromisingProfileScreenIntoAnExplicitMissing",
  "Only candidates that pass the profile screen are queued for frozen campaign evidence generation.": "theoryBadgeGraph.shared.onlyCandidatesThatPassTheProfileScreenAreQueuedFor",
  "Queued candidates remain blocked until every required campaign evidence row is produced for that profile.": "theoryBadgeGraph.shared.queuedCandidatesRemainBlockedUntilEveryRequiredCampaignEvidenceRow",
  "The run manifest is scheduling and evidence governance, not a campaign evaluation result.": "theoryBadgeGraph.shared.theRunManifestIsSchedulingAndEvidenceGovernanceNotA",
  "Time-Dependent Source Campaign": "theoryBadgeGraph.shared.timeDependentSourceCampaign",
  "Freezes the next dynamic proof campaign: independent source tensor, switching conservation, frequency convergence, dynamic/effective geometry agreement, full tensor closure, observer families, QEI receipts, and stability checks.": "theoryBadgeGraph.shared.freezesTheNextDynamicProofCampaignIndependentSourceTensorSwitching",
  "It prevents static or scalar pass-path progress from being read as a time-dependent physical-source result.": "theoryBadgeGraph.shared.itPreventsStaticOrScalarPassPathProgressFromBeing",
  "Static pass-path artifacts cannot substitute for frequency, switching, time-averaging, backreaction, or stability evidence.": "theoryBadgeGraph.shared.staticPassPathArtifactsCannotSubstituteForFrequencySwitchingTime",
  "The current campaign artifact is expected to report missing/review blockers until dynamic evidence exists.": "theoryBadgeGraph.shared.theCurrentCampaignArtifactIsExpectedToReportMissingReview",
  "Even a campaign pass would be diagnostic/reduced-order evidence, not transport, route ETA, propulsion, or physical viability validation.": "theoryBadgeGraph.shared.evenACampaignPassWouldBeDiagnosticReducedOrderEvidence",
  "Lean Campaign Certificate": "theoryBadgeGraph.shared.leanCampaignCertificate",
  "Runtime artifacts are exported into a Lean-facing certificate for the current 0p7000 diagnostic campaign profile.": "theoryBadgeGraph.shared.runtimeArtifactsAreExportedIntoALeanFacingCertificateFor",
  "It makes the campaign pass reusable as pinned rational and Boolean proof facts instead of UI-only wording.": "theoryBadgeGraph.shared.itMakesTheCampaignPassReusableAsPinnedRationalAnd",
  "Lean checks the emitted certificate facts and does not rerun the floating-point GR solver.": "theoryBadgeGraph.shared.leanChecksTheEmittedCertificateFactsAndDoesNotRerun",
  "The certificate is runtime/reference evidence and has no scalar calculator payload.": "theoryBadgeGraph.shared.theCertificateIsRuntimeReferenceEvidenceAndHasNoScalar",
  "The formal check command is npm run formal:nhm2:certificate:check.": "theoryBadgeGraph.shared.theFormalCheckCommandIsNpmRunFormalNhm2Certificate",
  "Lean Diagnostic Campaign Admissibility": "theoryBadgeGraph.shared.leanDiagnosticCampaignAdmissibility",
  "Lean verifies diagnostic campaign admissibility from the emitted certificate for the current 0p7000 profile.": "theoryBadgeGraph.shared.leanVerifiesDiagnosticCampaignAdmissibilityFromTheEmittedCertificateFor",
  "It gives the campaign pass a machine-checked policy meaning while keeping stronger claims locked.": "theoryBadgeGraph.shared.itGivesTheCampaignPassAMachineCheckedPolicyMeaning",
  "Diagnostic campaign admissibility is a policy theorem over certificate facts.": "theoryBadgeGraph.shared.diagnosticCampaignAdmissibilityIsAPolicyTheoremOverCertificateFacts",
  "The theorem does not establish material-source credibility, transport, route result, propulsion, or speed authority.": "theoryBadgeGraph.shared.theTheoremDoesNotEstablishMaterialSourceCredibilityTransportRoute",
  "Lean Claim Locks Closed": "theoryBadgeGraph.shared.leanClaimLocksClosed",
  "Lean carries the claim locks as part of the certificate proof, so diagnostic admissibility keeps physical, route, propulsion, transport, and speed locks closed.": "theoryBadgeGraph.shared.leanCarriesTheClaimLocksAsPartOfTheCertificate",
  "It prevents a formal diagnostic pass from being represented as a stronger NHM2 claim.": "theoryBadgeGraph.shared.itPreventsAFormalDiagnosticPassFromBeingRepresentedAs",
  "Claim locks are part of the Lean certificate conclusion, not UI copy convention.": "theoryBadgeGraph.shared.claimLocksArePartOfTheLeanCertificateConclusionNot",
  "Closed locks forbid physical viability, transport, route result, propulsion, and speed promotion from this certificate.": "theoryBadgeGraph.shared.closedLocksForbidPhysicalViabilityTransportRouteResultPropulsionAnd",
  "Lean Negative Fixtures Fail Closed": "theoryBadgeGraph.shared.leanNegativeFixturesFailClosed",
  "Static Lean examples and runtime fixture tests reject missing tensor components, stale hashes, Eulerian-only observers, scalar-only QEI, target echo, and open claim locks.": "theoryBadgeGraph.shared.staticLeanExamplesAndRuntimeFixtureTestsRejectMissingTensor",
  "It makes the formal lane falsifiable instead of only proving the current happy-path certificate.": "theoryBadgeGraph.shared.itMakesTheFormalLaneFalsifiableInsteadOfOnlyProving",
  "Negative fixtures are proof-policy coverage, not numerical physics evidence.": "theoryBadgeGraph.shared.negativeFixturesAreProofPolicyCoverageNotNumericalPhysicsEvidence",
  "Fail-closed behavior keeps stale, scalar-only, or narrow-frame evidence from entering stronger language.": "theoryBadgeGraph.shared.failClosedBehaviorKeepsStaleScalarOnlyOrNarrowFrame",
  "Lean Certificate Hashes Pinned": "theoryBadgeGraph.shared.leanCertificateHashesPinned",
  "The Lean certificate JSON records the campaign artifact paths and SHA-256 hashes used to produce the generated Lean module.": "theoryBadgeGraph.shared.theLeanCertificateJsonRecordsTheCampaignArtifactPathsAnd",
  "It prevents the formal result from floating across mismatched profiles, charts, atlases, or runtime evidence bundles.": "theoryBadgeGraph.shared.itPreventsTheFormalResultFromFloatingAcrossMismatchedProfiles",
  "Hash pinning is provenance discipline and does not make the runtime artifacts physically complete.": "theoryBadgeGraph.shared.hashPinningIsProvenanceDisciplineAndDoesNotMakeThe",
  "The certificate is scoped to the current 0p7000 diagnostic campaign profile.": "theoryBadgeGraph.shared.theCertificateIsScopedToTheCurrent0p7000DiagnosticCampaign",
  "Physical Evidence Campaign": "theoryBadgeGraph.shared.physicalEvidenceCampaign",
  "Tracks the experimental evidence ladder required after diagnostic campaign admission: prediction freeze, tile metrology, array scaling, vacuum weight, metric response, bounded prototype, and transport precursor.": "theoryBadgeGraph.shared.tracksTheExperimentalEvidenceLadderRequiredAfterDiagnosticCampaignAdmission",
  "It prevents the diagnostic campaign pass from being mistaken for fabricated-source or transport evidence.": "theoryBadgeGraph.shared.itPreventsTheDiagnosticCampaignPassFromBeingMistakenFor",
  "The current diagnostic campaign can feed this ladder but cannot substitute for experimental receipts.": "theoryBadgeGraph.shared.theCurrentDiagnosticCampaignCanFeedThisLadderButCannot",
  "Current state is blocked until prediction, metrology, scaling, vacuum-weight, metric-response, and replication receipts exist.": "theoryBadgeGraph.shared.currentStateIsBlockedUntilPredictionMetrologyScalingVacuumWeight",
  "Experiment-Facing Theory Solve Roadmap": "theoryBadgeGraph.shared.experimentFacingTheorySolveRoadmap",
  "Defines the pre-hardware theory solves, observables, falsifiers, receipts, and scalar sanity checks needed before NHM2 physical evidence can be reviewed.": "theoryBadgeGraph.shared.definesThePreHardwareTheorySolvesObservablesFalsifiersReceiptsAnd",
  "It turns the physical campaign into falsifiable experimental planning instead of allowing diagnostic, Lean, or scalar rows to stand in for material evidence.": "theoryBadgeGraph.shared.itTurnsThePhysicalCampaignIntoFalsifiableExperimentalPlanningInstead",
  "The roadmap is an experiment-planning artifact; it does not certify that any source has been fabricated or measured.": "theoryBadgeGraph.shared.theRoadmapIsAnExperimentPlanningArtifactItDoesNot",
  "Only scalar sanity checks are calculator-loadable; tile, tensor, QEI, observer, metric-response, and replication rows require runtime receipts.": "theoryBadgeGraph.shared.onlyScalarSanityChecksAreCalculatorLoadableTileTensorQei",
  "Experiment Parameter Targets": "theoryBadgeGraph.shared.experimentParameterTargets",
  "Lists the NHM2 numerical and qualitative targets, independent research comparators, required receipts, and blockers for each experiment-facing roadmap stage.": "theoryBadgeGraph.shared.listsTheNhm2NumericalAndQualitativeTargetsIndependentResearchComparators",
  "It turns the roadmap into a measurable planning ledger without treating modeled scalars, literature ranges, or feasibility notes as experimental success.": "theoryBadgeGraph.shared.itTurnsTheRoadmapIntoAMeasurablePlanningLedgerWithout",
  "Parameter targets are planning and falsification rows, not measurements.": "theoryBadgeGraph.shared.parameterTargetsArePlanningAndFalsificationRowsNotMeasurements",
  "Modeled scalar rows such as ideal tile energy, pressure, layer count, weight equivalent, and weak-field h00 remain sanity targets only.": "theoryBadgeGraph.shared.modeledScalarRowsSuchAsIdealTileEnergyPressureLayer",
  "Parameter targets, scalar rows, and literature comparators cannot substitute for experimental receipts.": "theoryBadgeGraph.shared.parameterTargetsScalarRowsAndLiteratureComparatorsCannotSubstituteFor",
  "Independent literature ranges are comparators for feasibility and systematics; they do not validate NHM2 artifacts.": "theoryBadgeGraph.shared.independentLiteratureRangesAreComparatorsForFeasibilityAndSystematicsThey",
  "Experiment Research Gap Ledger": "theoryBadgeGraph.shared.experimentResearchGapLedger",
  "Maps each NHM2 parameter target to the remaining research gap, nearest independent precedents, uncovered regime, earliest falsifier, null-result meaning, and claim impact.": "theoryBadgeGraph.shared.mapsEachNhm2ParameterTargetToTheRemainingResearchGap",
  "It keeps the experiment campaign pointed at high-value measurements and falsifiers without treating literature comparators or target feasibility as NHM2 validation.": "theoryBadgeGraph.shared.itKeepsTheExperimentCampaignPointedAtHighValueMeasurements",
  "Research-gap rows are planning and falsification surfaces, not experiment results.": "theoryBadgeGraph.shared.researchGapRowsArePlanningAndFalsificationSurfacesNotExperiment",
  "No direct precedent found is not a novelty claim and requires a search receipt before stronger language.": "theoryBadgeGraph.shared.noDirectPrecedentFoundIsNotANoveltyClaimAnd",
  "External references identify nearby methods, parameter regimes, and systematics; they do not validate NHM2.": "theoryBadgeGraph.shared.externalReferencesIdentifyNearbyMethodsParameterRegimesAndSystematicsThey",
  "High-information null results are campaign evidence and may close a route rather than support it.": "theoryBadgeGraph.shared.highInformationNullResultsAreCampaignEvidenceAndMayClose",
  "This badge is a runtime reference row and has no calculator payload.": "theoryBadgeGraph.shared.thisBadgeIsARuntimeReferenceRowAndHasNo",
  "Layer Stack Mechanical Receipt": "theoryBadgeGraph.shared.layerStackMechanicalReceipt",
  "Computes the ideal internal load for the 447-layer wall-source candidate and records the missing mechanical receipts needed before the stack can count as material/source evidence.": "theoryBadgeGraph.shared.computesTheIdealInternalLoadForThe447LayerWall",
  "The scalar 447-layer lead implies roughly 14.2 kN internal normal attraction and about 142 MPa projected stress; survivability, pull-in, support, thermal, fatigue, and active-control receipts are therefore front-door engineering blockers.": "theoryBadgeGraph.shared.theScalar447LayerLeadImpliesRoughly142Kn",
  "The 14.2 kN scalar load is internal plate attraction, not thrust.": "theoryBadgeGraph.shared.the142KnScalarLoadIsInternalPlateAttraction",
  "The ideal pressure and force are perfect-conductor scalar diagnostics until real-material force-gap and mechanical receipts exist.": "theoryBadgeGraph.shared.theIdealPressureAndForceArePerfectConductorScalarDiagnostics",
  "Linear multiplication by 447 layers remains blocked until nonadditivity, support fraction, cross-coupling, thermal load, and active-control energy are receipted.": "theoryBadgeGraph.shared.linearMultiplicationBy447LayersRemainsBlockedUntilNonadditivitySupport",
  "Mechanical survivability cannot substitute for same-basis full tensor source authority.": "theoryBadgeGraph.shared.mechanicalSurvivabilityCannotSubstituteForSameBasisFullTensorSource",
  "Layer Stack Support Fraction Sweep": "theoryBadgeGraph.shared.layerStackSupportFractionSweep",
  "Sweeps support area against active Casimir area for the 447-layer stack to find whether mechanical stress limits and wall-source retention can overlap.": "theoryBadgeGraph.shared.sweepsSupportAreaAgainstActiveCasimirAreaForThe447",
  "Increasing support fraction lowers local support stress but removes active Casimir area; this badge exposes that engineering tradeoff before the stack can be treated as a source candidate.": "theoryBadgeGraph.shared.increasingSupportFractionLowersLocalSupportStressButRemovesActive",
  "Support stress decreases as support fraction increases.": "theoryBadgeGraph.shared.supportStressDecreasesAsSupportFractionIncreases",
  "Active area and retained wall-source fraction decrease as support fraction increases.": "theoryBadgeGraph.shared.activeAreaAndRetainedWallSourceFractionDecreaseAsSupport",
  "The default sweep reports no pass when stress and source-retention constraints do not overlap.": "theoryBadgeGraph.shared.theDefaultSweepReportsNoPassWhenStressAndSource",
  "Support and active-control tensor terms must be supplied before any candidate window can count beyond reduced-order review.": "theoryBadgeGraph.shared.supportAndActiveControlTensorTermsMustBeSuppliedBefore",
  "The sweep is a go/no-go planning map, not material evidence or physical viability.": "theoryBadgeGraph.shared.theSweepIsAGoNoGoPlanningMapNot",
  "Layer Stack Architecture Loop": "theoryBadgeGraph.shared.layerStackArchitectureLoop",
  "Tests whether frames, ribs, spacer posts, membranes, lattices, segmented cells, load-sharing stacks, or active gap control can decouple load support from active Casimir area.": "theoryBadgeGraph.shared.testsWhetherFramesRibsSpacerPostsMembranesLatticesSegmentedCells",
  "The support-fraction sweep fails when support area and active source area compete directly; this loop asks whether an engineering architecture can create a review window while recording pull-in, roughness, patch, material, active-control, and tensor blockers.": "theoryBadgeGraph.shared.theSupportFractionSweepFailsWhenSupportAreaAndActive",
  "Architecture rows separate load-bearing fraction from active-area loss.": "theoryBadgeGraph.shared.architectureRowsSeparateLoadBearingFractionFromActiveAreaLoss",
  "A review window is not material-source evidence; it only prioritizes which device geometry deserves receipts.": "theoryBadgeGraph.shared.aReviewWindowIsNotMaterialSourceEvidenceItOnly",
  "Pull-in, roughness, patch-potential, active-control, fatigue, and full-apparatus tensor terms remain explicit blockers.": "theoryBadgeGraph.shared.pullInRoughnessPatchPotentialActiveControlFatigueAndFull",
  "Support and drive terms must enter the source-side apparatus tensor before wall-source authority can use the architecture.": "theoryBadgeGraph.shared.supportAndDriveTermsMustEnterTheSourceSideApparatus",
  "Full Apparatus Receipt Loop": "theoryBadgeGraph.shared.fullApparatusReceiptLoop",
  "Checks whether a 447-layer architecture has material, force-gap, pull-in, roughness, patch-potential, active-control, fatigue, layer-scaling, and full-apparatus tensor receipts.": "theoryBadgeGraph.shared.checksWhetherA447LayerArchitectureHasMaterialForceGap",
  "The architecture loop can expose review windows, but a row cannot become a receipted engineering candidate until every receipt surface and every support/spacer/control tensor term is accounted for.": "theoryBadgeGraph.shared.theArchitectureLoopCanExposeReviewWindowsButARow",
  "All receipt surfaces are required before an architecture row can be a receipted engineering candidate.": "theoryBadgeGraph.shared.allReceiptSurfacesAreRequiredBeforeAnArchitectureRowCan",
  "Declared models and ideal scalar Casimir formulas are review context, not material receipts.": "theoryBadgeGraph.shared.declaredModelsAndIdealScalarCasimirFormulasAreReviewContext",
  "Support, spacer, active-control, thermal, electrostatic, fatigue, and layer-scaling tensor terms are required before source tensor authority can evaluate the apparatus.": "theoryBadgeGraph.shared.supportSpacerActiveControlThermalElectrostaticFatigueAndLayerScaling",
  "A receipted engineering candidate still does not unlock physical, transport, propulsion, route, or speed claims.": "theoryBadgeGraph.shared.aReceiptedEngineeringCandidateStillDoesNotUnlockPhysicalTransport",
  "Tile Source Physical Validation Plan": "theoryBadgeGraph.shared.tileSourcePhysicalValidationPlan",
  "Freezes the most promising 447-layer tile-source architecture candidate and lists the receipts needed before it can become a physically credible source-side stress-energy candidate.": "theoryBadgeGraph.shared.freezesTheMostPromising447LayerTileSourceArchitectureCandidate",
  "The selected topology-optimized TiN lattice candidate is a validation-plan target, not a physical source result.": "theoryBadgeGraph.shared.theSelectedTopologyOptimizedTinLatticeCandidateIsAValidation",
  "Material coupon, force-gap and pull-in, roughness and patch-potential, active-control, fatigue, layer-scaling, and full-apparatus tensor receipts are all required.": "theoryBadgeGraph.shared.materialCouponForceGapAndPullInRoughnessAndPatch",
  "A source-side apparatus tensor must include T00, momentum density T0i, diagonal Tij, off-diagonal Tij, support/spacer/control terms, and no metric-target echo.": "theoryBadgeGraph.shared.aSourceSideApparatusTensorMustIncludeT00MomentumDensity",
  "A physically credible source candidate still requires downstream regional residual, conservation, QEI, observer-family, material-credibility, and coupled-closure gates to pass together.": "theoryBadgeGraph.shared.aPhysicallyCredibleSourceCandidateStillRequiresDownstreamRegionalResidual",
  "Ideal scalar Casimir formulas and diagnostic architecture rows cannot substitute for material evidence or transport claims.": "theoryBadgeGraph.shared.idealScalarCasimirFormulasAndDiagnosticArchitectureRowsCannotSubstitute",
  "Experimental Prediction Freeze": "theoryBadgeGraph.shared.experimentalPredictionFreeze",
  "Requires pre-registered source, metric-response, force, phase, clock, and falsifier predictions before experimental data are used.": "theoryBadgeGraph.shared.requiresPreRegisteredSourceMetricResponseForcePhaseClockAnd",
  "It prevents fitting material or source parameters after the fact to imitate NHM2 closure.": "theoryBadgeGraph.shared.itPreventsFittingMaterialOrSourceParametersAfterTheFact",
  "Predictions must be frozen before data collection; post-hoc fitting is a blocker.": "theoryBadgeGraph.shared.predictionsMustBeFrozenBeforeDataCollectionPostHocFitting",
  "Tile Force Receipt": "theoryBadgeGraph.shared.tileForceReceipt",
  "Requires measured force-versus-gap/material/temperature behavior for the fabricated tile before it can support source credibility.": "theoryBadgeGraph.shared.requiresMeasuredForceVersusGapMaterialTemperatureBehaviorForThe",
  "A Casimir tile is an intensely stressed nanogap apparatus; ideal scalar plate math is not enough.": "theoryBadgeGraph.shared.aCasimirTileIsAnIntenselyStressedNanogapApparatusIdeal",
  "Measured force, dielectric response, roughness, patch potentials, and energy-cycle closure are required before material-source credibility can be reviewed.": "theoryBadgeGraph.shared.measuredForceDielectricResponseRoughnessPatchPotentialsAndEnergyCycle",
  "Tile Cycle Energy Balance": "theoryBadgeGraph.shared.tileCycleEnergyBalance",
  "Tracks the full cyclic energy ledger for a modulated tile, including input work, heat, radiation, elastic energy, and losses.": "theoryBadgeGraph.shared.tracksTheFullCyclicEnergyLedgerForAModulatedTile",
  "The Casimir source should be framed as controlled energy conversion, not free energy creation.": "theoryBadgeGraph.shared.theCasimirSourceShouldBeFramedAsControlledEnergyConversion",
  "Scalar energy conversion rows are sanity checks and cannot substitute for full apparatus stress-energy receipts.": "theoryBadgeGraph.shared.scalarEnergyConversionRowsAreSanityChecksAndCannotSubstitute",
  "Array Scaling Receipt": "theoryBadgeGraph.shared.arrayScalingReceipt",
  "Requires measured scaling from one cavity to arrays while bounding cross-coupling, heat, elastic stress, and geometry effects.": "theoryBadgeGraph.shared.requiresMeasuredScalingFromOneCavityToArraysWhileBounding",
  "A full hull source cannot assume that many ideal cavities scale linearly without measurement.": "theoryBadgeGraph.shared.aFullHullSourceCannotAssumeThatManyIdealCavities",
  "Array scaling must be measured; cross-cavity corrections and support stresses are not optional.": "theoryBadgeGraph.shared.arrayScalingMustBeMeasuredCrossCavityCorrectionsAndSupport",
  "Full Apparatus Tensor": "theoryBadgeGraph.shared.fullApparatusTensor",
  "Requires a material/source tensor for the whole apparatus, including plates, supports, fields, stresses, heat, and interaction energy.": "theoryBadgeGraph.shared.requiresAMaterialSourceTensorForTheWholeApparatusIncluding",
  "GR sources the full apparatus stress-energy, not only the negative ideal interaction-energy row.": "theoryBadgeGraph.shared.grSourcesTheFullApparatusStressEnergyNotOnlyThe",
  "Full apparatus tensor authority is required before physical source credibility can be reviewed.": "theoryBadgeGraph.shared.fullApparatusTensorAuthorityIsRequiredBeforePhysicalSourceCredibility",
  "Vacuum Weight Receipt": "theoryBadgeGraph.shared.vacuumWeightReceipt",
  "Requires a modulated vacuum-related energy change with measured weight response, correct phase/sign/scaling, dummy rejection, and independent replication.": "theoryBadgeGraph.shared.requiresAModulatedVacuumRelatedEnergyChangeWithMeasuredWeight",
  "This is the first genuinely gravitational bridge from controlled source energy to measured gravitational coupling.": "theoryBadgeGraph.shared.thisIsTheFirstGenuinelyGravitationalBridgeFromControlledSource",
  "A vacuum-weight receipt must reject thermal, electromagnetic, mechanical, and ordinary-mass dummy paths.": "theoryBadgeGraph.shared.aVacuumWeightReceiptMustRejectThermalElectromagneticMechanicalAnd",
  "Metric Upper Bound Sanity Check": "theoryBadgeGraph.shared.metricUpperBoundSanityCheck",
  "Provides a weak-field scale check for source energy near a sensor; it is a sanity bound, not a detector-response model.": "theoryBadgeGraph.shared.providesAWeakFieldScaleCheckForSourceEnergyNear",
  "It keeps LIGO-like or optical-path proposals numerically grounded before they become experimental badges.": "theoryBadgeGraph.shared.itKeepsLigoLikeOrOpticalPathProposalsNumericallyGrounded",
  "Weak-field scalar bounds are proposal triage only and cannot substitute for invariant metric-response measurements.": "theoryBadgeGraph.shared.weakFieldScalarBoundsAreProposalTriageOnlyAndCannot",
  "Invariant Metric Response": "theoryBadgeGraph.shared.invariantMetricResponse",
  "Requires multiple probe families to agree with one predicted local metric response rather than a wavelength- or material-specific artifact.": "theoryBadgeGraph.shared.requiresMultipleProbeFamiliesToAgreeWithOnePredictedLocal",
  "A phase line alone is not evidence of NHM2 geometry unless clock, atom, mechanical, or tidal probes agree with the same metric model.": "theoryBadgeGraph.shared.aPhaseLineAloneIsNotEvidenceOfNhm2Geometry",
  "Thermal, electromagnetic, mechanical, optical-dispersion, and Newtonian paths must be bounded below the reported signal.": "theoryBadgeGraph.shared.thermalElectromagneticMechanicalOpticalDispersionAndNewtonianPathsMustBe",
  "Neutral Geodesic Response": "theoryBadgeGraph.shared.neutralGeodesicResponse",
  "Requires a neutral test body or clock worldline response in the predicted direction and magnitude without a conventional force path.": "theoryBadgeGraph.shared.requiresANeutralTestBodyOrClockWorldlineResponseIn",
  "This is the first transport-precursor evidence class and must remain separate from route, propulsion, or speed claims.": "theoryBadgeGraph.shared.thisIsTheFirstTransportPrecursorEvidenceClassAndMust",
  "A transport precursor requires composition independence, recoil accounting, and reversible control before transport review can even begin.": "theoryBadgeGraph.shared.aTransportPrecursorRequiresCompositionIndependenceRecoilAccountingAndReversible",
  "Independent Replication": "theoryBadgeGraph.shared.independentReplication",
  "Requires a separate apparatus and analysis team to reproduce the physical evidence before stronger claim review.": "theoryBadgeGraph.shared.requiresASeparateApparatusAndAnalysisTeamToReproduceThe",
  "A local generated or positive-unreplicated result cannot unlock physical or transport claims.": "theoryBadgeGraph.shared.aLocalGeneratedOrPositiveUnreplicatedResultCannotUnlockPhysical",
  "Replication is an experimental receipt, not a calculator row.": "theoryBadgeGraph.shared.replicationIsAnExperimentalReceiptNotACalculatorRow",
  "Physical Viability Locked": "theoryBadgeGraph.shared.physicalViabilityLocked",
  "Keeps physical viability locked until the physical evidence campaign has replicated experimental source, metric, and stability receipts.": "theoryBadgeGraph.shared.keepsPhysicalViabilityLockedUntilThePhysicalEvidenceCampaignHas",
  "It separates diagnostic campaign admissibility from fabricated-source credibility.": "theoryBadgeGraph.shared.itSeparatesDiagnosticCampaignAdmissibilityFromFabricatedSourceCredibility",
  "Diagnostic campaign admission and Lean certificate admission cannot unlock this claim boundary.": "theoryBadgeGraph.shared.diagnosticCampaignAdmissionAndLeanCertificateAdmissionCannotUnlockThis",
  "Transport Locked": "theoryBadgeGraph.shared.transportLocked",
  "Keeps transport, route, propulsion, and speed-authority claims locked until a neutral geodesic/clock response is measured and replicated.": "theoryBadgeGraph.shared.keepsTransportRoutePropulsionAndSpeedAuthorityClaimsLockedUntil",
  "A measured source or local metric response would still not be a route or transport claim by itself.": "theoryBadgeGraph.shared.aMeasuredSourceOrLocalMetricResponseWouldStillNot",
  "Transport remains separate from physical source and metric-response evidence.": "theoryBadgeGraph.shared.transportRemainsSeparateFromPhysicalSourceAndMetricResponseEvidence",
  "Regional Support-Function Atlas": "theoryBadgeGraph.shared.regionalSupportFunctionAtlas",
  "Names the canonical regional support-function atlas used by source residual, conservation, QEI, observer, and claim-admission artifacts.": "theoryBadgeGraph.shared.namesTheCanonicalRegionalSupportFunctionAtlasUsedBySource",
  "It prevents downstream gates from evaluating different implied hull, wall, exterior, or transition geometries.": "theoryBadgeGraph.shared.itPreventsDownstreamGatesFromEvaluatingDifferentImpliedHullWall",
  "The atlas defines shared regional geometry; it does not tune physics residuals.": "theoryBadgeGraph.shared.theAtlasDefinesSharedRegionalGeometryItDoesNotTune",
  "Atlas availability is a runtime artifact receipt, not a material or transport claim.": "theoryBadgeGraph.shared.atlasAvailabilityIsARuntimeArtifactReceiptNotAMaterial",
  "Atlas Partition Of Unity": "theoryBadgeGraph.shared.atlasPartitionOfUnity",
  "Tracks whether the closure-region support weights form the declared partition policy within tolerance.": "theoryBadgeGraph.shared.tracksWhetherTheClosureRegionSupportWeightsFormTheDeclared",
  "It makes hidden regional overlap or gaps visible before source and conservation gates aggregate tensor samples.": "theoryBadgeGraph.shared.itMakesHiddenRegionalOverlapOrGapsVisibleBeforeSource",
  "Partition status is read from the atlas artifact.": "theoryBadgeGraph.shared.partitionStatusIsReadFromTheAtlasArtifact",
  "A partition pass only says the support grammar is internally congruent.": "theoryBadgeGraph.shared.aPartitionPassOnlySaysTheSupportGrammarIsInternally",
  "Atlas Transition Supports": "theoryBadgeGraph.shared.atlasTransitionSupports",
  "Records the canonical hull-wall and wall-exterior transition support regions and smoothing kernels.": "theoryBadgeGraph.shared.recordsTheCanonicalHullWallAndWallExteriorTransitionSupport",
  "It forces transition regularization and conservation diagnostics to use the same support grammar as source residuals.": "theoryBadgeGraph.shared.itForcesTransitionRegularizationAndConservationDiagnosticsToUseThe",
  "Transition support rows are runtime references, not scalar fit knobs.": "theoryBadgeGraph.shared.transitionSupportRowsAreRuntimeReferencesNotScalarFitKnobs",
  "Hard or private masks remain inadmissible for same-atlas closure congruence.": "theoryBadgeGraph.shared.hardOrPrivateMasksRemainInadmissibleForSameAtlasClosure",
  "Atlas Derivative Support": "theoryBadgeGraph.shared.atlasDerivativeSupport",
  "Tracks whether support-function derivative terms are available for covariant conservation diagnostics.": "theoryBadgeGraph.shared.tracksWhetherSupportFunctionDerivativeTermsAreAvailableForCovariant",
  "Region-shaped tensors introduce derivative terms; without this receipt, conservation can only remain review-gated or missing.": "theoryBadgeGraph.shared.regionShapedTensorsIntroduceDerivativeTermsWithoutThisReceiptConservation",
  "Support derivative support is required for local conservation interpretation.": "theoryBadgeGraph.shared.supportDerivativeSupportIsRequiredForLocalConservationInterpretation",
  "Reduced-order transition smoothing does not by itself prove covariant conservation.": "theoryBadgeGraph.shared.reducedOrderTransitionSmoothingDoesNotByItselfProveCovariant",
  "Same-Atlas Consumer Congruence": "theoryBadgeGraph.shared.sameAtlasConsumerCongruence",
  "Checks that source residual, conservation, QEI, observer, coupled closure, and claim admission artifacts reference the same atlas hash.": "theoryBadgeGraph.shared.checksThatSourceResidualConservationQeiObserverCoupledClosureAnd",
  "It makes later pass lights mean the gates evaluated the same regional geometry rather than almost-compatible sidecars.": "theoryBadgeGraph.shared.itMakesLaterPassLightsMeanTheGatesEvaluatedThe",
  "Same-atlas congruence is a provenance gate and does not change residual values.": "theoryBadgeGraph.shared.sameAtlasCongruenceIsAProvenanceGateAndDoesNot",
  "Missing or stale atlas hashes block coupled closure and claim admission.": "theoryBadgeGraph.shared.missingOrStaleAtlasHashesBlockCoupledClosureAndClaim",
  "Atlas Is Not Physics Closure Boundary": "theoryBadgeGraph.shared.atlasIsNotPhysicsClosureBoundary",
  "Blocks treating shared regional geometry as material credibility, conservation, QEI, observer robustness, or transport viability.": "theoryBadgeGraph.shared.blocksTreatingSharedRegionalGeometryAsMaterialCredibilityConservationQei",
  "It keeps atlas congruence in the correct role: a prerequisite map for proof gates, not a proof that those gates pass.": "theoryBadgeGraph.shared.itKeepsAtlasCongruenceInTheCorrectRoleAPrerequisite",
  "The atlas is the shared map consumed by downstream gates.": "theoryBadgeGraph.shared.theAtlasIsTheSharedMapConsumedByDownstreamGates",
  "A valid atlas cannot substitute for material receipt, conservation, QEI, observer, or residual passes.": "theoryBadgeGraph.shared.aValidAtlasCannotSubstituteForMaterialReceiptConservationQei",
  "Observer-Family Energy-Condition Surface": "theoryBadgeGraph.shared.observerFamilyEnergyConditionSurface",
  "Collects WEC, NEC, SEC, and DEC as observer-family diagnostics over the projected tensor.": "theoryBadgeGraph.shared.collectsWecNecSecAndDecAsObserverFamilyDiagnostics",
  "It prevents a single scalar or favorable slice from being treated as clearance for the whole observer-family surface.": "theoryBadgeGraph.shared.itPreventsASingleScalarOrFavorableSliceFromBeing",
  "Energy-condition status is observer-family evidence, not a binary pass.": "theoryBadgeGraph.shared.energyConditionStatusIsObserverFamilyEvidenceNotABinary",
  "A projected scalar does not clear all observer-family conditions.": "theoryBadgeGraph.shared.aProjectedScalarDoesNotClearAllObserverFamilyConditions",
  "Missing momentum or spatial-stress authority blocks promotion-sensitive language.": "theoryBadgeGraph.shared.missingMomentumOrSpatialStressAuthorityBlocksPromotionSensitiveLanguage",
  "Observer-Robust Energy-Condition Gate": "theoryBadgeGraph.shared.observerRobustEnergyConditionGate",
  "Records whether WEC, NEC, DEC, and SEC were checked beyond a single Eulerian observer frame.": "theoryBadgeGraph.shared.recordsWhetherWecNecDecAndSecWereCheckedBeyond",
  "It prevents favorable Eulerian-frame language from being promoted into observer-robust energy-condition claims.": "theoryBadgeGraph.shared.itPreventsFavorableEulerianFrameLanguageFromBeingPromotedInto",
  "Eulerian-only checks must be labeled as restricted observer-frame evidence.": "theoryBadgeGraph.shared.eulerianOnlyChecksMustBeLabeledAsRestrictedObserverFrame",
  "Continuous optimization is not represented unless a runtime adapter exists.": "theoryBadgeGraph.shared.continuousOptimizationIsNotRepresentedUnlessARuntimeAdapterExists",
  "QEI Worldline Sampling Requirement": "theoryBadgeGraph.shared.qeiWorldlineSamplingRequirement",
  "Records the weighted worldline stress-energy sampling requirement for a QEI dossier.": "theoryBadgeGraph.shared.recordsTheWeightedWorldlineStressEnergySamplingRequirementForA",
  "It keeps QEI discussion tied to an explicit sampling requirement instead of treating literature context as repository completion.": "theoryBadgeGraph.shared.itKeepsQeiDiscussionTiedToAnExplicitSamplingRequirement",
  "This is a dossier requirement, not a completed QEI comparison.": "theoryBadgeGraph.shared.thisIsADossierRequirementNotACompletedQeiComparison",
  "QEI literature constrains the route but does not complete repository evidence.": "theoryBadgeGraph.shared.qeiLiteratureConstrainsTheRouteButDoesNotCompleteRepository",
  "QEI Worldline Dossier": "theoryBadgeGraph.shared.qeiWorldlineDossier",
  "Requires worldlines, sampling functions, sampled rho source, bound provenance, duty consistency, and regional margins.": "theoryBadgeGraph.shared.requiresWorldlinesSamplingFunctionsSampledRhoSourceBoundProvenanceDuty",
  "It keeps QEI status as an evidence dossier instead of a scalar badge or literature citation shortcut.": "theoryBadgeGraph.shared.itKeepsQeiStatusAsAnEvidenceDossierInsteadOf",
  "QEI dossier status remains blocked until every provenance and sampling field is attached.": "theoryBadgeGraph.shared.qeiDossierStatusRemainsBlockedUntilEveryProvenanceAndSampling",
  "A scalar margin cannot stand in for worldline and operator-mapping evidence.": "theoryBadgeGraph.shared.aScalarMarginCannotStandInForWorldlineAndOperator",
  "Natario Curvature Invariants": "theoryBadgeGraph.shared.natarioCurvatureInvariants",
  "Names Weyl, Ricci, Petrov-class, scalar-invariant, and momentum-density diagnostics as explicit runtime targets.": "theoryBadgeGraph.shared.namesWeylRicciPetrovClassScalarInvariantAndMomentumDensity",
  "It prevents expansion-free Natario-adjacent language from outrunning curvature and momentum-density evidence.": "theoryBadgeGraph.shared.itPreventsExpansionFreeNatarioAdjacentLanguageFromOutrunningCurvature",
  "Natario-family context does not imply viability or promotion.": "theoryBadgeGraph.shared.natarioFamilyContextDoesNotImplyViabilityOrPromotion",
  "Curvature invariants and momentum-density channels are runtime targets, not completed certification evidence.": "theoryBadgeGraph.shared.curvatureInvariantsAndMomentumDensityChannelsAreRuntimeTargetsNot",
  "Natario Invariant Audit": "theoryBadgeGraph.shared.natarioInvariantAudit",
  "Tracks zero-expansion status separately from curvature invariants, Petrov class, momentum density, tidal, blueshift, and convergence diagnostics.": "theoryBadgeGraph.shared.tracksZeroExpansionStatusSeparatelyFromCurvatureInvariantsPetrovClass",
  "It prevents theta-flat or zero-expansion rows from being treated as curvature, stability, or safety certificates.": "theoryBadgeGraph.shared.itPreventsThetaFlatOrZeroExpansionRowsFromBeing",
  "Zero expansion is displayed separately and is not a safety certificate.": "theoryBadgeGraph.shared.zeroExpansionIsDisplayedSeparatelyAndIsNotASafety",
  "Missing invariants, momentum density, or stability diagnostics keep the audit blocked or review-gated.": "theoryBadgeGraph.shared.missingInvariantsMomentumDensityOrStabilityDiagnosticsKeepTheAudit",
  "Centerline Clocking Target": "theoryBadgeGraph.shared.centerlineClockingTarget",
  "Computes the selected-profile centerline proper-time target from lapse and coordinate duration.": "theoryBadgeGraph.shared.computesTheSelectedProfileCenterlineProperTimeTargetFromLapse",
  "It makes the whitepaper clocking relation calculator-loadable while blocking route, speed, and ETA interpretations.": "theoryBadgeGraph.shared.itMakesTheWhitepaperClockingRelationCalculatorLoadableWhileBlocking",
  "This is a selected-profile clocking-law target under frozen coordinate schedule assumptions.": "theoryBadgeGraph.shared.thisIsASelectedProfileClockingLawTargetUnderFrozen",
  "It is not a speed, route ETA, or full-loop certified pass.": "theoryBadgeGraph.shared.itIsNotASpeedRouteEtaOrFullLoop",
  "Lower-alpha profiles require their own repository-measured full-loop artifacts.": "theoryBadgeGraph.shared.lowerAlphaProfilesRequireTheirOwnRepositoryMeasuredFullLoop",
  "Twin Paradox Trip Clocking Diagnostic": "theoryBadgeGraph.shared.twinParadoxTripClockingDiagnostic",
  "Computes one-way and mirrored round-trip ship-clock accumulation from the bounded NHM2 lapse schedule.": "theoryBadgeGraph.shared.computesOneWayAndMirroredRoundTripShipClockAccumulation",
  "It gives readers a Twin Paradox clock comparison while keeping speed, route ETA, and physical viability claims blocked.": "theoryBadgeGraph.shared.itGivesReadersATwinParadoxClockComparisonWhileKeeping",
  "This extends the centerline clocking target without replacing it.": "theoryBadgeGraph.shared.thisExtendsTheCenterlineClockingTargetWithoutReplacingIt",
  "The ordinary Twin Paradox comparison is used only as a clocking analogy.": "theoryBadgeGraph.shared.theOrdinaryTwinParadoxComparisonIsUsedOnlyAsA",
  "The SR-equivalent beta is an analogy for the same clock ratio, not a ship speed.": "theoryBadgeGraph.shared.theSrEquivalentBetaIsAnAnalogyForTheSame",
  "Route ETA, max speed, propulsion, physical viability, and lower-alpha promotion remain blocked.": "theoryBadgeGraph.shared.routeEtaMaxSpeedPropulsionPhysicalViabilityAndLowerAlpha",
  "Trip Clocking Profile Index": "theoryBadgeGraph.shared.tripClockingProfileIndex",
  "Indexes coherent profile-scoped trip clocking diagnostics for the 0p995 anchor and 0p7000 frontier target.": "theoryBadgeGraph.shared.indexesCoherentProfileScopedTripClockingDiagnosticsForThe0p995",
  "It lets the theory graph display both profiles without treating latest aliases as cross-profile evidence.": "theoryBadgeGraph.shared.itLetsTheTheoryGraphDisplayBothProfilesWithoutTreating",
  "0p995 remains the canonical white-paper clocking anchor.": "theoryBadgeGraph.shared.0p995RemainsTheCanonicalWhitePaperClockingAnchor",
  "0p7000 can be displayed as a frontier clocking target without profile promotion.": "theoryBadgeGraph.shared.0p7000CanBeDisplayedAsAFrontierClockingTargetWithout",
  "Each row must come from its own coherent route-time, mission-estimator, and mission-comparison artifacts.": "theoryBadgeGraph.shared.eachRowMustComeFromItsOwnCoherentRouteTime",
  "The profile index is artifact navigation and comparison context, not a calculator formula.": "theoryBadgeGraph.shared.theProfileIndexIsArtifactNavigationAndComparisonContextNot",
  "Frozen Reference-Run Provenance": "theoryBadgeGraph.shared.frozenReferenceRunProvenance",
  "Names the run, hash, grid, seed, ledger, and convergence evidence needed to interpret full-solve artifacts.": "theoryBadgeGraph.shared.namesTheRunHashGridSeedLedgerAndConvergenceEvidence",
  "It keeps figure and solver outputs attached to reproducible artifact governance instead of answer-like summaries.": "theoryBadgeGraph.shared.itKeepsFigureAndSolverOutputsAttachedToReproducibleArtifact",
  "Figures are not acceptance evidence unless source run, hashes, and convergence status are auditable.": "theoryBadgeGraph.shared.figuresAreNotAcceptanceEvidenceUnlessSourceRunHashesAnd",
  "Artifact governance reports status and blockers; it cannot promote physical mechanism claims.": "theoryBadgeGraph.shared.artifactGovernanceReportsStatusAndBlockersItCannotPromotePhysical",
  "Shift Is Not Ship Speed Boundary": "theoryBadgeGraph.shared.shiftIsNotShipSpeedBoundary",
  "Blocks treating the chart-dependent shift field as ordinary vehicle velocity.": "theoryBadgeGraph.shared.blocksTreatingTheChartDependentShiftFieldAsOrdinaryVehicle",
  "It protects NHM2 prompts from turning geometry bookkeeping into route or transport claims.": "theoryBadgeGraph.shared.itProtectsNhm2PromptsFromTurningGeometryBookkeepingIntoRoute",
  "Shift is a chart-dependent transport descriptor, not ordinary ship speed.": "theoryBadgeGraph.shared.shiftIsAChartDependentTransportDescriptorNotOrdinaryShip",
  "Diagonal Proxy Is Not Full Tensor Boundary": "theoryBadgeGraph.shared.diagonalProxyIsNotFullTensorBoundary",
  "Blocks treating diagonal stress-energy bookkeeping as full observer tensor authority.": "theoryBadgeGraph.shared.blocksTreatingDiagonalStressEnergyBookkeepingAsFullObserverTensor",
  "It forces momentum-density and spatial-stress channels back into the trace before any observer-family interpretation.": "theoryBadgeGraph.shared.itForcesMomentumDensityAndSpatialStressChannelsBackInto",
  "Diagonal T00 or diagonal tensor proxy is not full observer tensor authority.": "theoryBadgeGraph.shared.diagonalT00OrDiagonalTensorProxyIsNotFullObserver",
  "Clocking Target Is Not Route Result Boundary": "theoryBadgeGraph.shared.clockingTargetIsNotRouteResultBoundary",
  "Blocks treating the centerline lapse clocking target as a route result, ETA, or transport certification.": "theoryBadgeGraph.shared.blocksTreatingTheCenterlineLapseClockingTargetAsARoute",
  "Lower-alpha rows remain targets until their own repository-measured artifacts pass.": "theoryBadgeGraph.shared.lowerAlphaRowsRemainTargetsUntilTheirOwnRepositoryMeasured",
  "Literature Is Context Boundary": "theoryBadgeGraph.shared.literatureIsContextBoundary",
  "Blocks external papers from being treated as NHM2 artifact validation.": "theoryBadgeGraph.shared.blocksExternalPapersFromBeingTreatedAsNhm2ArtifactValidation",
  "It preserves the whitepaper rule that papers provide formalism, constraints, and caution while repository artifacts define NHM2 row status.": "theoryBadgeGraph.shared.itPreservesTheWhitepaperRuleThatPapersProvideFormalismConstraints",
  "External literature supplies formalism, context, and limitations, not NHM2 validation.": "theoryBadgeGraph.shared.externalLiteratureSuppliesFormalismContextAndLimitationsNotNhm2Validation",
  "Repository artifacts define pass, review, blocked, and unsupported status.": "theoryBadgeGraph.shared.repositoryArtifactsDefinePassReviewBlockedAndUnsupportedStatus",
  "StarSim surface temperature proxy": "theoryBadgeGraph.shared.starsimSurfaceTemperatureProxy",
  "Estimates stellar effective surface temperature from luminosity and radius.": "theoryBadgeGraph.shared.estimatesStellarEffectiveSurfaceTemperatureFromLuminosityAndRadius",
  "It gives Helix Ask and the calculator a scalar entry point for StarSim observable prompts.": "theoryBadgeGraph.shared.itGivesHelixAskAndTheCalculatorAScalarEntry",
  "Surface observable proxy only.": "theoryBadgeGraph.shared.surfaceObservableProxyOnly",
  "Luminosity and radius are solar-normalized in this reduced expression.": "theoryBadgeGraph.shared.luminosityAndRadiusAreSolarNormalizedInThisReducedExpression",
  "Does not determine a full stellar interior profile.": "theoryBadgeGraph.shared.doesNotDetermineAFullStellarInteriorProfile",
  "StarSim surface gravity proxy": "theoryBadgeGraph.shared.starsimSurfaceGravityProxy",
  "Relates stellar mass and radius to a surface-gravity estimate.": "theoryBadgeGraph.shared.relatesStellarMassAndRadiusToASurfaceGravityEstimate",
  "Surface gravity is a common observable bridge into StarSim classification context.": "theoryBadgeGraph.shared.surfaceGravityIsACommonObservableBridgeIntoStarsimClassification",
  "Reduced scalar estimate.": "theoryBadgeGraph.shared.reducedScalarEstimate",
  "Requires consistent unit normalization before numeric interpretation.": "theoryBadgeGraph.shared.requiresConsistentUnitNormalizationBeforeNumericInterpretation",
  "StarSim mean density proxy": "theoryBadgeGraph.shared.starsimMeanDensityProxy",
  "Estimates mean stellar density from mass and radius.": "theoryBadgeGraph.shared.estimatesMeanStellarDensityFromMassAndRadius",
  "Mean density gives StarSim a simple scalar bridge from observables to structure proxies.": "theoryBadgeGraph.shared.meanDensityGivesStarsimASimpleScalarBridgeFromObservables",
  "Uniform-sphere proxy only.": "theoryBadgeGraph.shared.uniformSphereProxyOnly",
  "Does not substitute for a resolved stellar structure profile.": "theoryBadgeGraph.shared.doesNotSubstituteForAResolvedStellarStructureProfile",
  "Stellar mass continuity reference": "theoryBadgeGraph.shared.stellarMassContinuityReference",
  "Names the one-dimensional stellar structure relation for enclosed mass.": "theoryBadgeGraph.shared.namesTheOneDimensionalStellarStructureRelationForEnclosedMass",
  "It ties StarSim reduced-order density proxies back to a standard structure equation.": "theoryBadgeGraph.shared.itTiesStarsimReducedOrderDensityProxiesBackToA",
  "Reference structure equation only.": "theoryBadgeGraph.shared.referenceStructureEquationOnly",
  "Stage 1 StarSim does not integrate this as a full stellar model.": "theoryBadgeGraph.shared.stage1StarsimDoesNotIntegrateThisAsAFull",
  "Hydrostatic balance reference": "theoryBadgeGraph.shared.hydrostaticBalanceReference",
  "Names the pressure-gradient balance between gravity and pressure support in stellar interiors.": "theoryBadgeGraph.shared.namesThePressureGradientBalanceBetweenGravityAndPressureSupport",
  "It is the theory bridge between gravity roots and StarSim's reduced-order structure priors.": "theoryBadgeGraph.shared.itIsTheTheoryBridgeBetweenGravityRootsAndStarsim",
  "Reference differential relation only.": "theoryBadgeGraph.shared.referenceDifferentialRelationOnly",
  "Stage 1 StarSim uses reduced-order proxies around this context.": "theoryBadgeGraph.shared.stage1StarsimUsesReducedOrderProxiesAroundThisContext",
  "Luminosity gradient reference": "theoryBadgeGraph.shared.luminosityGradientReference",
  "Names the stellar structure relation for luminosity generated inside radius r.": "theoryBadgeGraph.shared.namesTheStellarStructureRelationForLuminosityGeneratedInsideRadius",
  "It connects nuclear-energy language to the runtime's fusion-zone summaries without claiming full integration.": "theoryBadgeGraph.shared.itConnectsNuclearEnergyLanguageToTheRuntimeSFusion",
  "Stage 1 runtime reports a reduced fusion-zone summary.": "theoryBadgeGraph.shared.stage1RuntimeReportsAReducedFusionZoneSummary",
  "StarSim core temperature proxy": "theoryBadgeGraph.shared.starsimCoreTemperatureProxy",
  "Scales a channel temperature by a compactness-like mass over radius factor.": "theoryBadgeGraph.shared.scalesAChannelTemperatureByACompactnessLikeMassOver",
  "It exposes the reduced-order structure idea around StarSim's core-temperature estimate.": "theoryBadgeGraph.shared.itExposesTheReducedOrderStructureIdeaAroundStarsimS",
  "Reduced-order compactness scaling only.": "theoryBadgeGraph.shared.reducedOrderCompactnessScalingOnly",
  "Does not replace resolved core-temperature modeling.": "theoryBadgeGraph.shared.doesNotReplaceResolvedCoreTemperatureModeling",
  "Inactive and compact-object channels can intentionally skip this estimate.": "theoryBadgeGraph.shared.inactiveAndCompactObjectChannelsCanIntentionallySkipThisEstimate",
  "StarSim core density proxy": "theoryBadgeGraph.shared.starsimCoreDensityProxy",
  "Scales a channel density by mass over radius cubed.": "theoryBadgeGraph.shared.scalesAChannelDensityByMassOverRadiusCubed",
  "It turns StarSim's reduced-order density estimate into a calculator-visible scalar relation.": "theoryBadgeGraph.shared.itTurnsStarsimSReducedOrderDensityEstimateIntoA",
  "Reduced-order density scaling only.": "theoryBadgeGraph.shared.reducedOrderDensityScalingOnly",
  "StarSim compactness scale": "theoryBadgeGraph.shared.starsimCompactnessScale",
  "Computes the reduced mass-over-radius scale used around StarSim structure proxies.": "theoryBadgeGraph.shared.computesTheReducedMassOverRadiusScaleUsedAroundStarsim",
  "It makes the classifier's surrounding structure context visible as scalar math.": "theoryBadgeGraph.shared.itMakesTheClassifierSSurroundingStructureContextVisibleAs",
  "Mass and radius are solar-normalized.": "theoryBadgeGraph.shared.massAndRadiusAreSolarNormalized",
  "Classifier explanation helper only; not a relativistic compactness calculation.": "theoryBadgeGraph.shared.classifierExplanationHelperOnlyNotARelativisticCompactnessCalculation",
  "StarSim brown-dwarf mass margin": "theoryBadgeGraph.shared.starsimBrownDwarfMassMargin",
  "Shows distance from the reduced StarSim inactive-fusion mass threshold.": "theoryBadgeGraph.shared.showsDistanceFromTheReducedStarsimInactiveFusionMassThreshold",
  "It helps Helix explain why a low-mass object routes away from ordinary stellar fusion.": "theoryBadgeGraph.shared.itHelpsHelixExplainWhyALowMassObjectRoutes",
  "Mass is in solar masses.": "theoryBadgeGraph.shared.massIsInSolarMasses",
  "Margin is a classifier-explanation helper, not a reaction-network solve.": "theoryBadgeGraph.shared.marginIsAClassifierExplanationHelperNotAReactionNetwork",
  "StarSim CNO mass margin": "theoryBadgeGraph.shared.starsimCnoMassMargin",
  "Shows distance from the reduced mass threshold used around CNO-cycle prior routing.": "theoryBadgeGraph.shared.showsDistanceFromTheReducedMassThresholdUsedAroundCno",
  "It makes high-mass classifier context visible before the runtime receipt.": "theoryBadgeGraph.shared.itMakesHighMassClassifierContextVisibleBeforeTheRuntime",
  "StarSim CNO temperature margin": "theoryBadgeGraph.shared.starsimCnoTemperatureMargin",
  "Shows distance from the reduced effective-temperature threshold used around CNO-cycle prior routing.": "theoryBadgeGraph.shared.showsDistanceFromTheReducedEffectiveTemperatureThresholdUsedAround",
  "It links the surface-temperature proxy to the runtime fusion-channel receipt.": "theoryBadgeGraph.shared.itLinksTheSurfaceTemperatureProxyToTheRuntimeFusion",
  "Temperature is in kelvin.": "theoryBadgeGraph.shared.temperatureIsInKelvin",
  "Margin is a classifier-explanation helper; spectral type and object class remain runtime inputs.": "theoryBadgeGraph.shared.marginIsAClassifierExplanationHelperSpectralTypeAndObject",
  "StarSim pp-chain prior": "theoryBadgeGraph.shared.starsimPpChainPrior",
  "Represents StarSim's runtime prior for lower-mass main-sequence fusion classification.": "theoryBadgeGraph.shared.representsStarsimSRuntimePriorForLowerMassMainSequence",
  "It lets Helix locate Sun-like stellar prompts on the runtime classification branch.": "theoryBadgeGraph.shared.itLetsHelixLocateSunLikeStellarPromptsOnThe",
  "Runtime classifier badge.": "theoryBadgeGraph.shared.runtimeClassifierBadge",
  "Calculator payloads around this badge are helper scalars, not the classifier itself.": "theoryBadgeGraph.shared.calculatorPayloadsAroundThisBadgeAreHelperScalarsNotThe",
  "StarSim CNO-cycle prior": "theoryBadgeGraph.shared.starsimCnoCyclePrior",
  "Represents StarSim's hotter or higher-mass main-sequence fusion-channel prior.": "theoryBadgeGraph.shared.representsStarsimSHotterOrHigherMassMainSequenceFusion",
  "It distinguishes CNO-like runtime classification from the pp-chain branch.": "theoryBadgeGraph.shared.itDistinguishesCnoLikeRuntimeClassificationFromThePpChain",
  "CNO selection remains a reduced-order prior in this branch.": "theoryBadgeGraph.shared.cnoSelectionRemainsAReducedOrderPriorInThisBranch",
  "Compact object not-fusing gate": "theoryBadgeGraph.shared.compactObjectNotFusingGate",
  "Represents StarSim's compact-object branch where white dwarfs and neutron stars are not pp-chain fusion cases.": "theoryBadgeGraph.shared.representsStarsimSCompactObjectBranchWhereWhiteDwarfsAnd",
  "It gives Helix a clear locator target for compact-object prompts that should not be routed to ordinary stellar fusion.": "theoryBadgeGraph.shared.itGivesHelixAClearLocatorTargetForCompactObject",
  "Compact objects are routed to compact-object context rather than ordinary pp-chain fusion.": "theoryBadgeGraph.shared.compactObjectsAreRoutedToCompactObjectContextRatherThan",
  "This badge is a runtime guardrail, not a scalar calculator solve.": "theoryBadgeGraph.shared.thisBadgeIsARuntimeGuardrailNotAScalarCalculator",
  "StarSim active volume fraction": "theoryBadgeGraph.shared.starsimActiveVolumeFraction",
  "Approximates the active fusion-zone volume fraction from the r90 radius fraction.": "theoryBadgeGraph.shared.approximatesTheActiveFusionZoneVolumeFractionFromTheR90",
  "It makes one StarSim fusion-zone output calculator-loadable while keeping the runtime context visible.": "theoryBadgeGraph.shared.itMakesOneStarsimFusionZoneOutputCalculatorLoadableWhile",
  "Spherical fraction proxy only.": "theoryBadgeGraph.shared.sphericalFractionProxyOnly",
  "Fusion-zone shape and shell structure still come from runtime context.": "theoryBadgeGraph.shared.fusionZoneShapeAndShellStructureStillComeFromRuntime",
  "Solar deep-mixing mass flux": "theoryBadgeGraph.shared.solarDeepMixingMassFlux",
  "Relates a requested deep-mixing strength to the hydrogen-burning mass-flow scale.": "theoryBadgeGraph.shared.relatesARequestedDeepMixingStrengthToTheHydrogenBurning",
  "It gives the calculator a first scalar entry point for the solar-restoration planning branch.": "theoryBadgeGraph.shared.itGivesTheCalculatorAFirstScalarEntryPointFor",
  "Reduced-order planning row only.": "theoryBadgeGraph.shared.reducedOrderPlanningRowOnly",
  "The row represents ordinary envelope-hydrogen transport, not hydrogen-3 fuel certification.": "theoryBadgeGraph.shared.theRowRepresentsOrdinaryEnvelopeHydrogenTransportNotHydrogen3",
  "It does not establish feasible stellar intervention.": "theoryBadgeGraph.shared.itDoesNotEstablishFeasibleStellarIntervention",
  "Tachocline downflow setpoint": "theoryBadgeGraph.shared.tachoclineDownflowSetpoint",
  "Solves the deep-mixing mass-flux closure for the radial downflow speed.": "theoryBadgeGraph.shared.solvesTheDeepMixingMassFluxClosureForTheRadial",
  "It turns the restoration preset into a concrete scalar that can be compared across calculator and runtime receipts.": "theoryBadgeGraph.shared.itTurnsTheRestorationPresetIntoAConcreteScalarThat",
  "Spherical tachocline area proxy.": "theoryBadgeGraph.shared.sphericalTachoclineAreaProxy",
  "Area fraction is clamped by the source helper before operational use.": "theoryBadgeGraph.shared.areaFractionIsClampedByTheSourceHelperBeforeOperational",
  "The downflow setpoint is a reduced-order planning scalar, not an actuator feasibility claim.": "theoryBadgeGraph.shared.theDownflowSetpointIsAReducedOrderPlanningScalarNot",
  "Core hydrogen balance proxy": "theoryBadgeGraph.shared.coreHydrogenBalanceProxy",
  "Tracks a one-zone core hydrogen fraction under burning and imported envelope hydrogen.": "theoryBadgeGraph.shared.tracksAOneZoneCoreHydrogenFractionUnderBurningAnd",
  "It is the reduced-order composition equation that connects deep mixing to red-giant-delay forecasts.": "theoryBadgeGraph.shared.itIsTheReducedOrderCompositionEquationThatConnectsDeep",
  "One-zone composition balance only.": "theoryBadgeGraph.shared.oneZoneCompositionBalanceOnly",
  "Does not resolve stellar transport, nuclear reaction networks, or shell burning.": "theoryBadgeGraph.shared.doesNotResolveStellarTransportNuclearReactionNetworksOrShell",
  "Envelope hydrogen fraction and core mass are scenario inputs.": "theoryBadgeGraph.shared.envelopeHydrogenFractionAndCoreMassAreScenarioInputs",
  "Planning/forecast row only.": "theoryBadgeGraph.shared.planningForecastRowOnly",
  "Solar lifetime extension proxy": "theoryBadgeGraph.shared.solarLifetimeExtensionProxy",
  "Estimates a planning-only lifetime gain from accessible envelope hydrogen and the solar burn-rate scale.": "theoryBadgeGraph.shared.estimatesAPlanningOnlyLifetimeGainFromAccessibleEnvelopeHydrogen",
  "It gives the theory panel a calculator-aligned way to represent the +10 Myr, +50 Myr, and +0.6 Gyr presets.": "theoryBadgeGraph.shared.itGivesTheTheoryPanelACalculatorAlignedWayTo",
  "Fuel-budget proxy only.": "theoryBadgeGraph.shared.fuelBudgetProxyOnly",
  "Alpha represents the fraction of envelope hydrogen that the scenario treats as core-accessible.": "theoryBadgeGraph.shared.alphaRepresentsTheFractionOfEnvelopeHydrogenThatTheScenario",
  "Does not model luminosity evolution, shell burning, or structural feedback.": "theoryBadgeGraph.shared.doesNotModelLuminosityEvolutionShellBurningOrStructuralFeedback",
  "Solar restoration guardrail constraints": "theoryBadgeGraph.shared.solarRestorationGuardrailConstraints",
  "Keeps the deep-mixing plan bounded by luminosity, core-temperature, seismic, and neutrino guardrails.": "theoryBadgeGraph.shared.keepsTheDeepMixingPlanBoundedByLuminosityCoreTemperature",
  "It makes the calculator/runtime branch carry the same safety constraints as the planning autopilot.": "theoryBadgeGraph.shared.itMakesTheCalculatorRuntimeBranchCarryTheSameSafety",
  "Guardrails are planning constraints around telemetry, not proof of intervention safety.": "theoryBadgeGraph.shared.guardrailsArePlanningConstraintsAroundTelemetryNotProofOfIntervention",
  "The runtime may report guardrail status when matching telemetry artifacts exist.": "theoryBadgeGraph.shared.theRuntimeMayReportGuardrailStatusWhenMatchingTelemetryArtifacts",
  "Red-giant transition hazard proxy": "theoryBadgeGraph.shared.redGiantTransitionHazardProxy",
  "Summarizes the toy risk curve that rises when core hydrogen falls below a scenario threshold.": "theoryBadgeGraph.shared.summarizesTheToyRiskCurveThatRisesWhenCoreHydrogen",
  "It lets the theory panel represent the red-giant delay plot as a diagnostic proxy rather than a proven forecast.": "theoryBadgeGraph.shared.itLetsTheTheoryPanelRepresentTheRedGiantDelay",
  "Visualization and diagnostic proxy only.": "theoryBadgeGraph.shared.visualizationAndDiagnosticProxyOnly",
  "Does not replace a stellar-evolution calculation.": "theoryBadgeGraph.shared.doesNotReplaceAStellarEvolutionCalculation",
  "Solar restoration planning boundary": "theoryBadgeGraph.shared.solarRestorationPlanningBoundary",
  "Marks the solar-restoration branch as planning and forecast context only.": "theoryBadgeGraph.shared.marksTheSolarRestorationBranchAsPlanningAndForecastContext",
  "It prevents calculator or runtime rows from being promoted into claims of feasible stellar intervention.": "theoryBadgeGraph.shared.itPreventsCalculatorOrRuntimeRowsFromBeingPromotedInto",
  "Solar restoration rows are planning/forecast context only.": "theoryBadgeGraph.shared.solarRestorationRowsArePlanningForecastContextOnly",
  "They do not imply feasible or proven stellar intervention.": "theoryBadgeGraph.shared.theyDoNotImplyFeasibleOrProvenStellarIntervention",
  "They do not validate NHM2, warp operations, or full stellar-evolution solving.": "theoryBadgeGraph.shared.theyDoNotValidateNhm2WarpOperationsOrFullStellar",
  "StarSim map structure weight": "theoryBadgeGraph.shared.starsimMapStructureWeight",
  "Assigns a simple inverse-distance structure weight between star-map nodes.": "theoryBadgeGraph.shared.assignsASimpleInverseDistanceStructureWeightBetweenStarMap",
  "It exposes a calculator-loadable scalar from the StarMap fusion graph builder.": "theoryBadgeGraph.shared.itExposesACalculatorLoadableScalarFromTheStarmapFusion",
  "StarMap structure prior only.": "theoryBadgeGraph.shared.starmapStructurePriorOnly",
  "Distance weighting is contextual and not a dynamical orbit solve.": "theoryBadgeGraph.shared.distanceWeightingIsContextualAndNotADynamicalOrbitSolve",
  "StarSim fusion microphysics runtime": "theoryBadgeGraph.shared.starsimFusionMicrophysicsRuntime",
  "Represents the Stage 1 runtime evaluator that classifies fusion context and reports reduced-order outputs.": "theoryBadgeGraph.shared.representsTheStage1RuntimeEvaluatorThatClassifiesFusionContext",
  "It tells Helix that some StarSim answers require runtime classification rather than a scalar calculator solve.": "theoryBadgeGraph.shared.itTellsHelixThatSomeStarsimAnswersRequireRuntimeClassification",
  "evaluateStarSimFusionMicrophysics": "theoryBadgeGraph.shared.evaluatestarsimfusionmicrophysics",
  "Runtime evaluation badge only.": "theoryBadgeGraph.shared.runtimeEvaluationBadgeOnly",
  "Scalar helper equations live on neighboring calculator-loadable badges.": "theoryBadgeGraph.shared.scalarHelperEquationsLiveOnNeighboringCalculatorLoadableBadges",
  "Stage 1 output remains a reduced-order astrophysical prior.": "theoryBadgeGraph.shared.stage1OutputRemainsAReducedOrderAstrophysicalPrior",
  "StarSim map fusion graph runtime": "theoryBadgeGraph.shared.starsimMapFusionGraphRuntime",
  "Represents the runtime builder for pairwise StarMap structure and fusion-contrast weights.": "theoryBadgeGraph.shared.representsTheRuntimeBuilderForPairwiseStarmapStructureAndFusion",
  "It lets Helix distinguish star-map graph construction from scalar distance or weight formulas.": "theoryBadgeGraph.shared.itLetsHelixDistinguishStarMapGraphConstructionFromScalar",
  "Astrometric structure prior only.": "theoryBadgeGraph.shared.astrometricStructurePriorOnly",
  "Graph weights do not imply a spacetime connection.": "theoryBadgeGraph.shared.graphWeightsDoNotImplyASpacetimeConnection",
  "StarSim Stage 1 boundary": "theoryBadgeGraph.shared.starsimStage1Boundary",
  "Marks StarSim fusion microphysics as a reduced-order astrophysical prior with explicit limits.": "theoryBadgeGraph.shared.marksStarsimFusionMicrophysicsAsAReducedOrderAstrophysicalPrior",
  "It keeps Helix answers anchored to what the StarSim branch can and cannot support.": "theoryBadgeGraph.shared.itKeepsHelixAnswersAnchoredToWhatTheStarsimBranch",
  "Reduced-order astrophysical prior only.": "theoryBadgeGraph.shared.reducedOrderAstrophysicalPriorOnly",
  "Does not support propulsion, spacetime-mechanism, stress-energy sourcing, or claim-level promotion.": "theoryBadgeGraph.shared.doesNotSupportPropulsionSpacetimeMechanismStressEnergySourcingOr",
  "Calculator payloads are scalar helpers around the runtime, not a complete stellar-evolution solver.": "theoryBadgeGraph.shared.calculatorPayloadsAreScalarHelpersAroundTheRuntimeNotA",
  "Spectral Redshift": "theoryBadgeGraph.shared.spectralRedshift",
  "Computes the fractional shift between a known rest wavelength and the observed wavelength.": "theoryBadgeGraph.shared.computesTheFractionalShiftBetweenAKnownRestWavelengthAnd",
  "It is the first scalar bridge from a spectrum to recession or cosmology context.": "theoryBadgeGraph.shared.itIsTheFirstScalarBridgeFromASpectrumTo",
  "Uses a known spectral line rest wavelength.": "theoryBadgeGraph.shared.usesAKnownSpectralLineRestWavelength",
  "Positive z is redshift; negative z is blueshift.": "theoryBadgeGraph.shared.positiveZIsRedshiftNegativeZIsBlueshift",
  "Distance interpretation requires a ladder rung or cosmology model.": "theoryBadgeGraph.shared.distanceInterpretationRequiresALadderRungOrCosmologyModel",
  "Scale Factor From Redshift": "theoryBadgeGraph.shared.scaleFactorFromRedshift",
  "Relates cosmological redshift to the expansion scale factor for large-scale background context.": "theoryBadgeGraph.shared.relatesCosmologicalRedshiftToTheExpansionScaleFactorForLarge",
  "It separates the observed spectral shift from the cosmology variable used by the Accordion context.": "theoryBadgeGraph.shared.itSeparatesTheObservedSpectralShiftFromTheCosmologyVariable",
  "Large-scale background cosmology context.": "theoryBadgeGraph.shared.largeScaleBackgroundCosmologyContext",
  "Does not imply local expansion of bound systems.": "theoryBadgeGraph.shared.doesNotImplyLocalExpansionOfBoundSystems",
  "Parallax Distance": "theoryBadgeGraph.shared.parallaxDistance",
  "Computes nearby-object distance in parsecs from parallax in milliarcseconds.": "theoryBadgeGraph.shared.computesNearbyObjectDistanceInParsecsFromParallaxInMilliarcseconds",
  "It is the local calibration rung that anchors farther standard-candle rungs.": "theoryBadgeGraph.shared.itIsTheLocalCalibrationRungThatAnchorsFartherStandard",
  "Small-angle parallax relation.": "theoryBadgeGraph.shared.smallAngleParallaxRelation",
  "Best for local calibration objects with reliable astrometry.": "theoryBadgeGraph.shared.bestForLocalCalibrationObjectsWithReliableAstrometry",
  "Cepheid Period-Luminosity": "theoryBadgeGraph.shared.cepheidPeriodLuminosity",
  "Uses a Cepheid pulsation period with calibration constants to estimate absolute magnitude.": "theoryBadgeGraph.shared.usesACepheidPulsationPeriodWithCalibrationConstantsToEstimate",
  "It is the variable-star rung that turns a measured period into a standard-candle estimate.": "theoryBadgeGraph.shared.itIsTheVariableStarRungThatTurnsAMeasured",
  "Calibration constants alpha and beta must come from the chosen Cepheid band/calibration.": "theoryBadgeGraph.shared.calibrationConstantsAlphaAndBetaMustComeFromTheChosen",
  "Metallicity, extinction, and bandpass corrections are outside this scalar demo row.": "theoryBadgeGraph.shared.metallicityExtinctionAndBandpassCorrectionsAreOutsideThisScalarDemo",
  "Distance Modulus": "theoryBadgeGraph.shared.distanceModulus",
  "Converts apparent and absolute magnitude into distance in parsecs.": "theoryBadgeGraph.shared.convertsApparentAndAbsoluteMagnitudeIntoDistanceInParsecs",
  "It turns a calibrated standard candle into a calculator-loadable distance estimate.": "theoryBadgeGraph.shared.itTurnsACalibratedStandardCandleIntoACalculatorLoadable",
  "Extinction and bandpass corrections must be handled before using this row as a calibrated estimate.": "theoryBadgeGraph.shared.extinctionAndBandpassCorrectionsMustBeHandledBeforeUsingThis",
  "Low-z Hubble Distance": "theoryBadgeGraph.shared.lowZHubbleDistance",
  "Estimates distance from redshift using the low-redshift Hubble-law approximation.": "theoryBadgeGraph.shared.estimatesDistanceFromRedshiftUsingTheLowRedshiftHubbleLaw",
  "It is a calculator-visible rung for prompts that ask for approximate cosmological distance from small redshift.": "theoryBadgeGraph.shared.itIsACalculatorVisibleRungForPromptsThatAsk",
  "Low-redshift approximation only.": "theoryBadgeGraph.shared.lowRedshiftApproximationOnly",
  "For larger redshift, use an explicit cosmology model and distance definition.": "theoryBadgeGraph.shared.forLargerRedshiftUseAnExplicitCosmologyModelAndDistance",
  "Accordion Cosmology Context": "theoryBadgeGraph.shared.accordionCosmologyContext",
  "Represents the existing StarSim Accordion context for redshift, scale factor, and cosmological distance fields.": "theoryBadgeGraph.shared.representsTheExistingStarsimAccordionContextForRedshiftScaleFactor",
  "It tells Helix that some cosmology answers are context receipts, not scalar calculator-only solves.": "theoryBadgeGraph.shared.itTellsHelixThatSomeCosmologyAnswersAreContextReceipts",
  "Runtime/context row only.": "theoryBadgeGraph.shared.runtimeContextRowOnly",
  "Does not make bound stellar or galactic systems locally expand.": "theoryBadgeGraph.shared.doesNotMakeBoundStellarOrGalacticSystemsLocallyExpand",
  "Cosmic Ladder Boundary": "theoryBadgeGraph.shared.cosmicLadderBoundary",
  "Keeps distance-ladder estimates tied to calibration, model choice, and scale limits.": "theoryBadgeGraph.shared.keepsDistanceLadderEstimatesTiedToCalibrationModelChoiceAnd",
  "It prevents redshift or standard-candle rows from being read as model-free distance proof.": "theoryBadgeGraph.shared.itPreventsRedshiftOrStandardCandleRowsFromBeingRead",
  "Cepheid and standard-candle distances require calibration and uncertainty context.": "theoryBadgeGraph.shared.cepheidAndStandardCandleDistancesRequireCalibrationAndUncertaintyContext",
  "Low-z Hubble distance is an approximation, not a complete cosmological inference.": "theoryBadgeGraph.shared.lowZHubbleDistanceIsAnApproximationNotAComplete",
  "Accordion cosmology context does not imply local expansion for bound systems.": "theoryBadgeGraph.shared.accordionCosmologyContextDoesNotImplyLocalExpansionForBound",
  "Solar Photon Energy": "theoryBadgeGraph.shared.solarPhotonEnergy",
  "Computes photon energy from a measured wavelength using h and c.": "theoryBadgeGraph.shared.computesPhotonEnergyFromAMeasuredWavelengthUsingHAnd",
  "It gives spectral-line prompts a calculator-loadable bridge from wavelength to photon energy.": "theoryBadgeGraph.shared.itGivesSpectralLinePromptsACalculatorLoadableBridgeFrom",
  "Single-photon scalar relation.": "theoryBadgeGraph.shared.singlePhotonScalarRelation",
  "Line identification and instrument calibration remain observation context.": "theoryBadgeGraph.shared.lineIdentificationAndInstrumentCalibrationRemainObservationContext",
  "Solar Wien Peak": "theoryBadgeGraph.shared.solarWienPeak",
  "Estimates the peak wavelength for an ideal blackbody-like temperature.": "theoryBadgeGraph.shared.estimatesThePeakWavelengthForAnIdealBlackbodyLikeTemperature",
  "It connects solar color and peak-spectrum prompts to temperature in a scalar calculator row.": "theoryBadgeGraph.shared.itConnectsSolarColorAndPeakSpectrumPromptsToTemperature",
  "Idealized blackbody proxy.": "theoryBadgeGraph.shared.idealizedBlackbodyProxy",
  "Solar atmosphere and line features require model context.": "theoryBadgeGraph.shared.solarAtmosphereAndLineFeaturesRequireModelContext",
  "Solar Stefan-Boltzmann Luminosity": "theoryBadgeGraph.shared.solarStefanBoltzmannLuminosity",
  "Relates luminosity to radius and temperature through a blackbody surface model.": "theoryBadgeGraph.shared.relatesLuminosityToRadiusAndTemperatureThroughABlackbodySurface",
  "It bridges solar radiance, stellar surface observables, and calculator-visible power units.": "theoryBadgeGraph.shared.itBridgesSolarRadianceStellarSurfaceObservablesAndCalculatorVisible",
  "Idealized blackbody surface relation.": "theoryBadgeGraph.shared.idealizedBlackbodySurfaceRelation",
  "Does not replace atmosphere or radiative-transfer modeling.": "theoryBadgeGraph.shared.doesNotReplaceAtmosphereOrRadiativeTransferModeling",
  "Solar H-Alpha Line Reference": "theoryBadgeGraph.shared.solarHAlphaLineReference",
  "Anchors H-alpha as a common solar spectral rest-line reference.": "theoryBadgeGraph.shared.anchorsHAlphaAsACommonSolarSpectralRestLine",
  "It gives Doppler and radial-velocity prompts an explicit line identity instead of an unnamed wavelength.": "theoryBadgeGraph.shared.itGivesDopplerAndRadialVelocityPromptsAnExplicitLine",
  "Reference wavelength only; observation-specific line fitting must provide measured wavelength.": "theoryBadgeGraph.shared.referenceWavelengthOnlyObservationSpecificLineFittingMustProvideMeasured",
  "Solar Doppler Shift": "theoryBadgeGraph.shared.solarDopplerShift",
  "Computes the fractional wavelength shift of a spectral line.": "theoryBadgeGraph.shared.computesTheFractionalWavelengthShiftOfASpectralLine",
  "It separates the observable shift ratio from the radial-velocity proxy that may use it.": "theoryBadgeGraph.shared.itSeparatesTheObservableShiftRatioFromTheRadialVelocity",
  "Line calibration and rest-line choice must be explicit.": "theoryBadgeGraph.shared.lineCalibrationAndRestLineChoiceMustBeExplicit",
  "Formula is an observational proxy unless backed by a receipt.": "theoryBadgeGraph.shared.formulaIsAnObservationalProxyUnlessBackedByAReceipt",
  "Solar Radial Velocity Proxy": "theoryBadgeGraph.shared.solarRadialVelocityProxy",
  "Converts a small spectral shift into line-of-sight velocity.": "theoryBadgeGraph.shared.convertsASmallSpectralShiftIntoLineOfSightVelocity",
  "It lets Helix Ask and the calculator distinguish measured shift from inferred velocity.": "theoryBadgeGraph.shared.itLetsHelixAskAndTheCalculatorDistinguishMeasuredShift",
  "Low-velocity radial-velocity proxy.": "theoryBadgeGraph.shared.lowVelocityRadialVelocityProxy",
  "Does not separate solar rotation, convection, instrument drift, or atmospheric effects.": "theoryBadgeGraph.shared.doesNotSeparateSolarRotationConvectionInstrumentDriftOrAtmospheric",
  "Solar Blackbody Curve Reference": "theoryBadgeGraph.shared.solarBlackbodyCurveReference",
  "Records the Planck spectral radiance curve as a reference/sweep expression.": "theoryBadgeGraph.shared.recordsThePlanckSpectralRadianceCurveAsAReferenceSweep",
  "It keeps curve plotting out of the scalar calculator while preserving the theory location.": "theoryBadgeGraph.shared.itKeepsCurvePlottingOutOfTheScalarCalculatorWhile",
  "Reference/sweep expression, not a scalar calculator solve.": "theoryBadgeGraph.shared.referenceSweepExpressionNotAScalarCalculatorSolve",
  "Blackbody curves are idealized and do not replace atmosphere/radiative-transfer modeling.": "theoryBadgeGraph.shared.blackbodyCurvesAreIdealizedAndDoNotReplaceAtmosphereRadiative",
  "Solar Zeeman Split Proxy": "theoryBadgeGraph.shared.solarZeemanSplitProxy",
  "Estimates magnetic spectral splitting from a field strength and line parameters.": "theoryBadgeGraph.shared.estimatesMagneticSpectralSplittingFromAFieldStrengthAndLine",
  "It connects solar magnetic-field prompts to quantum/spectral calculator proxies.": "theoryBadgeGraph.shared.itConnectsSolarMagneticFieldPromptsToQuantumSpectralCalculator",
  "Calculator proxy for simple line splitting.": "theoryBadgeGraph.shared.calculatorProxyForSimpleLineSplitting",
  "Requires line identification, effective Lande factor, and observation receipt for interpretation.": "theoryBadgeGraph.shared.requiresLineIdentificationEffectiveLandeFactorAndObservationReceiptFor",
  "Solar Flare Energy Proxy": "theoryBadgeGraph.shared.solarFlareEnergyProxy",
  "Estimates event energy from a radiant power proxy over event duration.": "theoryBadgeGraph.shared.estimatesEventEnergyFromARadiantPowerProxyOverEvent",
  "It gives flare prompts a calculator-loadable bridge while preserving observation caveats.": "theoryBadgeGraph.shared.itGivesFlarePromptsACalculatorLoadableBridgeWhilePreserving",
  "Radiant-energy proxy only.": "theoryBadgeGraph.shared.radiantEnergyProxyOnly",
  "Instrument response, bandpass, and event segmentation must come from observation context.": "theoryBadgeGraph.shared.instrumentResponseBandpassAndEventSegmentationMustComeFromObservation",
  "Solar Spectrum Analysis Runtime": "theoryBadgeGraph.shared.solarSpectrumAnalysisRuntime",
  "References the local runtime path that ingests and analyzes solar spectrum observations.": "theoryBadgeGraph.shared.referencesTheLocalRuntimePathThatIngestsAndAnalyzesSolar",
  "It gives the atlas a runtime/source anchor without pretending spectrum ingestion is a scalar solve.": "theoryBadgeGraph.shared.itGivesTheAtlasARuntimeSourceAnchorWithoutPretending",
  "Runtime/source reference only.": "theoryBadgeGraph.shared.runtimeSourceReferenceOnly",
  "A future runtime action should return an observation receipt before physical interpretation.": "theoryBadgeGraph.shared.aFutureRuntimeActionShouldReturnAnObservationReceiptBefore",
  "Solar Observational Proxy Boundary": "theoryBadgeGraph.shared.solarObservationalProxyBoundary",
  "Keeps solar spectrum and flare calculations framed as observational and inference helpers.": "theoryBadgeGraph.shared.keepsSolarSpectrumAndFlareCalculationsFramedAsObservationalAnd",
  "It prevents Doppler, Zeeman, blackbody, or flare proxies from being overstated without receipts.": "theoryBadgeGraph.shared.itPreventsDopplerZeemanBlackbodyOrFlareProxiesFromBeing",
  "Solar spectrum badges provide observational and inference helpers.": "theoryBadgeGraph.shared.solarSpectrumBadgesProvideObservationalAndInferenceHelpers",
  "Doppler/Zeeman formulas are calculator proxies unless backed by a specific observation receipt.": "theoryBadgeGraph.shared.dopplerZeemanFormulasAreCalculatorProxiesUnlessBackedByA",
  "Solar Product Registry Reference": "theoryBadgeGraph.shared.solarProductRegistryReference",
  "Documents solar reference products, dataset provenance, calibration anchors, and timestamps.": "theoryBadgeGraph.shared.documentsSolarReferenceProductsDatasetProvenanceCalibrationAnchorsAndTimestamps",
  "It gives solar prompts a repo-backed provenance row before helioseismic, neutrino, cycle, or event context is interpreted.": "theoryBadgeGraph.shared.itGivesSolarPromptsARepoBackedProvenanceRowBefore",
  "Solar reference rows are observational/provenance context.": "theoryBadgeGraph.shared.solarReferenceRowsAreObservationalProvenanceContext",
  "Helioseismic and neutrino rows require calibration context.": "theoryBadgeGraph.shared.helioseismicAndNeutrinoRowsRequireCalibrationContext",
  "Nanoflare and sunquake rows are MHD/helioseismic diagnostics.": "theoryBadgeGraph.shared.nanoflareAndSunquakeRowsAreMhdHelioseismicDiagnostics",
  "Stellar structure rows are reduced-order/model context unless runtime receipts are attached.": "theoryBadgeGraph.shared.stellarStructureRowsAreReducedOrderModelContextUnlessRuntime",
  "No row validates NHM2, objective collapse, solar restoration, or feasible stellar intervention.": "theoryBadgeGraph.shared.noRowValidatesNhm2ObjectiveCollapseSolarRestorationOrFeasible",
  "Solar Neutrino Flux Context": "theoryBadgeGraph.shared.solarNeutrinoFluxContext",
  "Exposes solar neutrino closure as calibrated observational context for solar-core comparisons.": "theoryBadgeGraph.shared.exposesSolarNeutrinoClosureAsCalibratedObservationalContextForSolar",
  "It lets retrieval connect neutrino references to solar interior context without promoting them into proof rows.": "theoryBadgeGraph.shared.itLetsRetrievalConnectNeutrinoReferencesToSolarInteriorContext",
  "Helioseismic Sound-Speed Difference": "theoryBadgeGraph.shared.helioseismicSoundSpeedDifference",
  "Computes the relative sound-speed difference between an observed helioseismic value and a reference profile.": "theoryBadgeGraph.shared.computesTheRelativeSoundSpeedDifferenceBetweenAnObservedHelioseismic",
  "It bridges helioseismology to solar interior structure through a scalar, calibration-aware comparison.": "theoryBadgeGraph.shared.itBridgesHelioseismologyToSolarInteriorStructureThroughAScalar",
  "Magnetogram Activity Context": "theoryBadgeGraph.shared.magnetogramActivityContext",
  "Names magnetogram and cycle-phase context as observational conditioning for solar activity rows.": "theoryBadgeGraph.shared.namesMagnetogramAndCyclePhaseContextAsObservationalConditioningFor",
  "It connects magnetic-field products and solar-cycle phase to event diagnostics without claiming event causation.": "theoryBadgeGraph.shared.itConnectsMagneticFieldProductsAndSolarCyclePhaseTo",
  "Nanoflare Heating Proxy": "theoryBadgeGraph.shared.nanoflareHeatingProxy",
  "Computes a reduced power proxy from nanoflare energy and event timescale.": "theoryBadgeGraph.shared.computesAReducedPowerProxyFromNanoflareEnergyAndEvent",
  "It exposes nanoflare heating as MHD/observational context without treating it as collapse evidence.": "theoryBadgeGraph.shared.itExposesNanoflareHeatingAsMhdObservationalContextWithoutTreating",
  "Flare-To-Sunquake Timing Window": "theoryBadgeGraph.shared.flareToSunquakeTimingWindow",
  "Computes the timing offset between a flare marker and a sunquake diagnostic marker.": "theoryBadgeGraph.shared.computesTheTimingOffsetBetweenAFlareMarkerAndA",
  "It gives flare-to-sunquake prompts a concrete observable window while keeping interpretation diagnostic.": "theoryBadgeGraph.shared.itGivesFlareToSunquakePromptsAConcreteObservableWindow",
  "Stellar Hydrostatic Equilibrium": "theoryBadgeGraph.shared.stellarHydrostaticEquilibrium",
  "Names the stellar pressure-gradient balance between gravity and pressure support.": "theoryBadgeGraph.shared.namesTheStellarPressureGradientBalanceBetweenGravityAndPressure",
  "It gives the graph an explicit stellar first-principles bridge from gravity to interior pressure context.": "theoryBadgeGraph.shared.itGivesTheGraphAnExplicitStellarFirstPrinciplesBridge",
  "Stellar Chemical Inheritance Root": "theoryBadgeGraph.shared.stellarChemicalInheritanceRoot",
  "Names B2FH-style stellar nucleosynthesis abundance flow as the elemental and isotopic inheritance root for later astrochemistry.": "theoryBadgeGraph.shared.namesB2fhStyleStellarNucleosynthesisAbundanceFlowAsTheElemental",
  "It grounds fusion, nucleosynthesis, and astrochemistry prompts in first-principles reaction-network bounds without claiming a full stellar-evolution solver or a direct life/consciousness mechanism.": "theoryBadgeGraph.shared.itGroundsFusionNucleosynthesisAndAstrochemistryPromptsInFirstPrinciples",
  "Stellar nucleosynthesis supplies chemical possibility-space constraints.": "theoryBadgeGraph.shared.stellarNucleosynthesisSuppliesChemicalPossibilitySpaceConstraints",
  "Reaction-network and yield terms do not certify life, fullerenes-as-life, consciousness, or Earth inevitability.": "theoryBadgeGraph.shared.reactionNetworkAndYieldTermsDoNotCertifyLifeFullerenes",
  "Solar/Stellar Reduced-Order Boundary": "theoryBadgeGraph.shared.solarStellarReducedOrderBoundary",
  "Keeps solar reference, helioseismic, neutrino, nanoflare, sunquake, and stellar rows in diagnostic context.": "theoryBadgeGraph.shared.keepsSolarReferenceHelioseismicNeutrinoNanoflareSunquakeAndStellarRows",
  "It blocks retrieval and calculator overlays from promoting reference rows into validation, mechanism, or intervention claims.": "theoryBadgeGraph.shared.itBlocksRetrievalAndCalculatorOverlaysFromPromotingReferenceRows",
  "Interstellar Aromatic Carbon Context": "theoryBadgeGraph.shared.interstellarAromaticCarbonContext",
  "Represents aromatic carbon chemistry in circumstellar and interstellar environments as astrochemical context.": "theoryBadgeGraph.shared.representsAromaticCarbonChemistryInCircumstellarAndInterstellarEnvironmentsAs",
  "It anchors prebiotic-organic discussions in stellar carbon enrichment without implying biology, reward, consciousness, or collapse.": "theoryBadgeGraph.shared.itAnchorsPrebioticOrganicDiscussionsInStellarCarbonEnrichmentWithout",
  "Aromatic-carbon evidence is astrochemical context.": "theoryBadgeGraph.shared.aromaticCarbonEvidenceIsAstrochemicalContext",
  "Aromatic carbon does not imply biology, dopamine inheritance, consciousness, or objective collapse.": "theoryBadgeGraph.shared.aromaticCarbonDoesNotImplyBiologyDopamineInheritanceConsciousnessOr",
  "C60 Stellar/Circumstellar Context": "theoryBadgeGraph.shared.c60StellarCircumstellarContext",
  "Represents fullerene C60 as a spectral carbon-chemistry context in circumstellar or interstellar environments.": "theoryBadgeGraph.shared.representsFullereneC60AsASpectralCarbonChemistryContextIn",
  "It lets Helix discuss buckyballs observed in stellar or circumstellar light without turning that observation into a life, consciousness, or collapse claim.": "theoryBadgeGraph.shared.itLetsHelixDiscussBuckyballsObservedInStellarOrCircumstellar",
  "C60 spectral features are astrochemical context.": "theoryBadgeGraph.shared.c60SpectralFeaturesAreAstrochemicalContext",
  "This badge does not assert that fullerenes caused life, consciousness, or objective collapse.": "theoryBadgeGraph.shared.thisBadgeDoesNotAssertThatFullerenesCausedLifeConsciousness",
  "PAH Spectral-Family Context": "theoryBadgeGraph.shared.pahSpectralFamilyContext",
  "Represents polycyclic aromatic hydrocarbons and PAH-like aromatic nitriles as spectral-family astrochemistry context.": "theoryBadgeGraph.shared.representsPolycyclicAromaticHydrocarbonsAndPahLikeAromaticNitrilesAs",
  "It keeps PAH-family evidence retrievable as carbon chemistry without treating PAHs as direct biochemical or consciousness precursors.": "theoryBadgeGraph.shared.itKeepsPahFamilyEvidenceRetrievableAsCarbonChemistryWithout",
  "PAH-family spectral evidence is astrochemical context.": "theoryBadgeGraph.shared.pahFamilySpectralEvidenceIsAstrochemicalContext",
  "Individual PAH-like detections do not establish a direct path to dopamine, pleasure, consciousness, or objective collapse.": "theoryBadgeGraph.shared.individualPahLikeDetectionsDoNotEstablishADirectPath",
  "Laboratory Spectroscopy Molecular-Fingerprint Foundation": "theoryBadgeGraph.shared.laboratorySpectroscopyMolecularFingerprintFoundation",
  "Represents laboratory microwave, millimeter, and molecular spectroscopy as the fingerprint basis for astronomical molecule identification.": "theoryBadgeGraph.shared.representsLaboratoryMicrowaveMillimeterAndMolecularSpectroscopyAsTheFingerprint",
  "It makes Ziurys's detection premise explicit: astronomical prebiotic-chemistry claims require laboratory spectra before line assignments become evidence.": "theoryBadgeGraph.shared.itMakesZiurysSDetectionPremiseExplicitAstronomicalPrebioticChemistry",
  "Laboratory spectroscopy supplies molecular fingerprints for astronomical line assignments.": "theoryBadgeGraph.shared.laboratorySpectroscopySuppliesMolecularFingerprintsForAstronomicalLineAssignments",
  "A line assignment is identification evidence under spectral-model assumptions, not a complete formation pathway.": "theoryBadgeGraph.shared.aLineAssignmentIsIdentificationEvidenceUnderSpectralModelAssumptions",
  "Spectroscopic identification does not validate delivery, abiogenesis, biology, or consciousness.": "theoryBadgeGraph.shared.spectroscopicIdentificationDoesNotValidateDeliveryAbiogenesisBiologyOrConsciousness",
  "Small Organic Dense-Cloud Prebiotic Inventory": "theoryBadgeGraph.shared.smallOrganicDenseCloudPrebioticInventory",
  "Represents dense-cloud small organic molecules as observational prebiotic-foundation inventory context.": "theoryBadgeGraph.shared.representsDenseCloudSmallOrganicMoleculesAsObservationalPrebioticFoundation",
  "It adds Ziurys's prebiotic framing to the existing complex-organics layer while keeping inventory rows separate from origin-of-life proof.": "theoryBadgeGraph.shared.itAddsZiurysSPrebioticFramingToTheExistingComplex",
  "Dense-cloud organic inventories are prebiotic foundation context.": "theoryBadgeGraph.shared.denseCloudOrganicInventoriesArePrebioticFoundationContext",
  "Inventory abundance requires line assignment, excitation, source, and column-density assumptions.": "theoryBadgeGraph.shared.inventoryAbundanceRequiresLineAssignmentExcitationSourceAndColumnDensity",
  "A prebiotic inventory row does not prove protoplanetary survival, local concentration, reaction network closure, or life.": "theoryBadgeGraph.shared.aPrebioticInventoryRowDoesNotProveProtoplanetarySurvivalLocal",
  "C60/C70 Carbon-Cage Prebiotic Context": "theoryBadgeGraph.shared.c60C70CarbonCagePrebioticContext",
  "Represents fullerene C60 and C70 as carbon-cage astrochemistry context that can preserve C-C bonding motifs across circumstellar/interstellar settings.": "theoryBadgeGraph.shared.representsFullereneC60AndC70AsCarbonCageAstrochemistryContext",
  "It extends the existing C60 row into Ziurys's fullerene-family framing without turning fullerene detections into life or origin claims.": "theoryBadgeGraph.shared.itExtendsTheExistingC60RowIntoZiurysSFullerene",
  "Fullerene C60/C70 context is carbon-cage astrochemistry evidence.": "theoryBadgeGraph.shared.fullereneC60C70ContextIsCarbonCageAstrochemistryEvidence",
  "C-C bond preservation context does not prove a specific prebiotic synthesis pathway.": "theoryBadgeGraph.shared.cCBondPreservationContextDoesNotProveASpecific",
  "Fullerene detections do not validate biology, life, consciousness, or objective collapse.": "theoryBadgeGraph.shared.fullereneDetectionsDoNotValidateBiologyLifeConsciousnessOrObjective",
  "PO/PN Molecular-Cloud Phosphorus Context": "theoryBadgeGraph.shared.poPnMolecularCloudPhosphorusContext",
  "Represents PO and PN detections in molecular clouds as phosphorus-bearing astrochemical context for prebiotic-foundation discussions.": "theoryBadgeGraph.shared.representsPoAndPnDetectionsInMolecularCloudsAsPhosphorus",
  "It adds the missing phosphorus lane from Ziurys: phosphorus chemistry can be observed in star-forming material but does not by itself establish bioavailable phosphate or RNA chemistry.": "theoryBadgeGraph.shared.itAddsTheMissingPhosphorusLaneFromZiurysPhosphorusChemistry",
  "PO and PN detections are phosphorus chemistry context in molecular clouds.": "theoryBadgeGraph.shared.poAndPnDetectionsArePhosphorusChemistryContextInMolecular",
  "Column-density ratios are line-assignment and model-conditioned evidence.": "theoryBadgeGraph.shared.columnDensityRatiosAreLineAssignmentAndModelConditionedEvidence",
  "PO/PN context does not prove bioavailable phosphate, RNA chemistry, metabolism, or life.": "theoryBadgeGraph.shared.poPnContextDoesNotProveBioavailablePhosphateRnaChemistry",
  "Complex Organic Dense-Source Inventory Context": "theoryBadgeGraph.shared.complexOrganicDenseSourceInventoryContext",
  "Represents complex organic interstellar molecules as source-dependent dense-cloud and star-forming-region inventory evidence.": "theoryBadgeGraph.shared.representsComplexOrganicInterstellarMoleculesAsSourceDependentDenseCloud",
  "It adds the Herbst/van Dishoeck review layer that complex organics are observed astrochemical inventory probes, not direct prebiotic success or life evidence.": "theoryBadgeGraph.shared.itAddsTheHerbstVanDishoeckReviewLayerThatComplex",
  "Complex organic molecule inventory is an observational astrochemistry context.": "theoryBadgeGraph.shared.complexOrganicMoleculeInventoryIsAnObservationalAstrochemistryContext",
  "Fractional abundances depend on source class, excitation assumptions, and chemical history.": "theoryBadgeGraph.shared.fractionalAbundancesDependOnSourceClassExcitationAssumptionsAndChemical",
  "Dense-source organic inventories do not certify protoplanetary delivery, abiogenesis, biology, or consciousness.": "theoryBadgeGraph.shared.denseSourceOrganicInventoriesDoNotCertifyProtoplanetaryDeliveryAbiogenesis",
  "Gas-Grain Ice-Mantle Formation Context": "theoryBadgeGraph.shared.gasGrainIceMantleFormationContext",
  "Represents ice mantles on interstellar grains as a formation and reservoir context for saturated complex organic molecules.": "theoryBadgeGraph.shared.representsIceMantlesOnInterstellarGrainsAsAFormationAnd",
  "It captures the paper's strongest formation constraint: gas detections alone are incomplete without grain-surface chemistry, ice composition, and desorption context.": "theoryBadgeGraph.shared.itCapturesThePaperSStrongestFormationConstraintGasDetections",
  "Ice-mantle chemistry is formation and reservoir context, not a complete origin pathway.": "theoryBadgeGraph.shared.iceMantleChemistryIsFormationAndReservoirContextNotA",
  "Surface formation, heating, nonthermal desorption, and source evolution must be represented before gas-phase inventory is overinterpreted.": "theoryBadgeGraph.shared.surfaceFormationHeatingNonthermalDesorptionAndSourceEvolutionMustBe",
  "Grain chemistry context does not promote an organic molecule inventory into life or consciousness evidence.": "theoryBadgeGraph.shared.grainChemistryContextDoesNotPromoteAnOrganicMoleculeInventory",
  "Astrochemical Source-Class Differentiation Context": "theoryBadgeGraph.shared.astrochemicalSourceClassDifferentiationContext",
  "Represents the constraint that cold cores, hot cores, hot corinos, outflows, and evolved-star envelopes can show different complex-organic inventories.": "theoryBadgeGraph.shared.representsTheConstraintThatColdCoresHotCoresHotCorinos",
  "It prevents the graph from treating complex organic chemistry as one universal molecule list independent of physical environment and evolutionary history.": "theoryBadgeGraph.shared.itPreventsTheGraphFromTreatingComplexOrganicChemistryAs",
  "Cold-core unsaturated chemistry and hot-core/corino saturated chemistry must be kept distinguishable.": "theoryBadgeGraph.shared.coldCoreUnsaturatedChemistryAndHotCoreCorinoSaturatedChemistry",
  "A detected molecule family is a probe of physical conditions and history, not a universal formation claim.": "theoryBadgeGraph.shared.aDetectedMoleculeFamilyIsAProbeOfPhysicalConditions",
  "Source-class context is required before comparing interstellar organics to prebiotic inventories.": "theoryBadgeGraph.shared.sourceClassContextIsRequiredBeforeComparingInterstellarOrganicsTo",
  "Spectral/Model Inference Boundary": "theoryBadgeGraph.shared.spectralModelInferenceBoundary",
  "Blocks spectral feature, abundance, and chemistry-model rows from being treated as direct proof of formation pathway, delivery, life, or consciousness.": "theoryBadgeGraph.shared.blocksSpectralFeatureAbundanceAndChemistryModelRowsFromBeing",
  "It represents the review's inference boundary: spectra, column densities, chemical rates, and radiative transfer are powerful probes but remain model-conditioned evidence.": "theoryBadgeGraph.shared.itRepresentsTheReviewSInferenceBoundarySpectraColumnDensities",
  "Spectral assignments require line identification, excitation, column density, beam, and radiative-transfer assumptions.": "theoryBadgeGraph.shared.spectralAssignmentsRequireLineIdentificationExcitationColumnDensityBeamAnd",
  "Chemical models are incomplete and can be time-dependent.": "theoryBadgeGraph.shared.chemicalModelsAreIncompleteAndCanBeTimeDependent",
  "Spectral or abundance agreement is model-conditioned evidence and does not prove a complete formation route, delivery route, life, or consciousness.": "theoryBadgeGraph.shared.spectralOrAbundanceAgreementIsModelConditionedEvidenceAndDoes",
  "Meteoritic Organic Inventory Context": "theoryBadgeGraph.shared.meteoriticOrganicInventoryContext",
  "Represents returned-sample and meteoritic organic inventories as prebiotic ingredient context.": "theoryBadgeGraph.shared.representsReturnedSampleAndMeteoriticOrganicInventoriesAsPrebioticIngredient",
  "It lets Helix discuss amino acids, nucleobases, PAHs, salts, sugars, and related inventory rows without claiming life began in space.": "theoryBadgeGraph.shared.itLetsHelixDiscussAminoAcidsNucleobasesPahsSaltsSugars",
  "Returned-sample organic inventories are prebiotic ingredient context.": "theoryBadgeGraph.shared.returnedSampleOrganicInventoriesArePrebioticIngredientContext",
  "Inventory rows do not assert DNA, RNA, cells, metabolism, life, consciousness, or objective collapse.": "theoryBadgeGraph.shared.inventoryRowsDoNotAssertDnaRnaCellsMetabolismLife",
  "Meteorite/Comet Planetary-Delivery Link Context": "theoryBadgeGraph.shared.meteoriteCometPlanetaryDeliveryLinkContext",
  "Represents meteorites and comets as possible links between molecule-rich interstellar starting material and planetary prebiotic inventories.": "theoryBadgeGraph.shared.representsMeteoritesAndCometsAsPossibleLinksBetweenMoleculeRich",
  "It preserves Ziurys's planetary-body bridge while blocking the shortcut from interstellar inventory to confirmed abiogenesis.": "theoryBadgeGraph.shared.itPreservesZiurysSPlanetaryBodyBridgeWhileBlockingThe",
  "Meteorites and comets can provide link context between astrochemical inventories and planetary materials.": "theoryBadgeGraph.shared.meteoritesAndCometsCanProvideLinkContextBetweenAstrochemicalInventories",
  "Delivery context does not prove survival, concentration, aqueous availability, reaction closure, or abiogenesis.": "theoryBadgeGraph.shared.deliveryContextDoesNotProveSurvivalConcentrationAqueousAvailabilityReaction",
  "Planetary-body links require curation, alteration, and local environmental evidence before stronger prebiotic claims.": "theoryBadgeGraph.shared.planetaryBodyLinksRequireCurationAlterationAndLocalEnvironmentalEvidence",
  "Protoplanetary Processing Uncertainty Boundary": "theoryBadgeGraph.shared.protoplanetaryProcessingUncertaintyBoundary",
  "Blocks direct promotion from interstellar or planetary-delivery inventories into prebiotic pathway claims until disk, alteration, concentration, and local environment processing are represented.": "theoryBadgeGraph.shared.blocksDirectPromotionFromInterstellarOrPlanetaryDeliveryInventoriesInto",
  "It encodes Ziurys's uncertainty boundary: emerging planetary disks process inherited chemistry, so interstellar inventory is not automatically planetary prebiotic availability.": "theoryBadgeGraph.shared.itEncodesZiurysSUncertaintyBoundaryEmergingPlanetaryDisksProcess",
  "Chemical and physical processing in emerging planetary disks remains an uncertainty boundary.": "theoryBadgeGraph.shared.chemicalAndPhysicalProcessingInEmergingPlanetaryDisksRemainsAn",
  "Interstellar inventories do not automatically survive, concentrate, or become locally available for prebiotic chemistry.": "theoryBadgeGraph.shared.interstellarInventoriesDoNotAutomaticallySurviveConcentrateOrBecomeLocally",
  "This boundary blocks life, consciousness, and objective-collapse promotion from astrochemical foundation evidence.": "theoryBadgeGraph.shared.thisBoundaryBlocksLifeConsciousnessAndObjectiveCollapsePromotionFrom",
  "Prebiotic Photochemical Processing Context": "theoryBadgeGraph.shared.prebioticPhotochemicalProcessingContext",
  "Represents UV or radiation processing as environmental chemistry context for prebiotic organic inventories.": "theoryBadgeGraph.shared.representsUvOrRadiationProcessingAsEnvironmentalChemistryContextFor",
  "It adds the missing energy-processing lane between astrochemical inventory and plausible chemical transformation without claiming a unique origin route.": "theoryBadgeGraph.shared.itAddsTheMissingEnergyProcessingLaneBetweenAstrochemicalInventory",
  "Photochemical processing is environmental chemistry context.": "theoryBadgeGraph.shared.photochemicalProcessingIsEnvironmentalChemistryContext",
  "A photon fluence row does not establish a specific origin-of-life pathway.": "theoryBadgeGraph.shared.aPhotonFluenceRowDoesNotEstablishASpecificOrigin",
  "Mineral/Aqueous Surface Catalysis Context": "theoryBadgeGraph.shared.mineralAqueousSurfaceCatalysisContext",
  "Represents mineral surfaces, salts, and aqueous alteration as contextual constraints on prebiotic reaction networks.": "theoryBadgeGraph.shared.representsMineralSurfacesSaltsAndAqueousAlterationAsContextualConstraints",
  "It closes the gap between inventory lists and chemistry pathways by requiring local surface and solvent context before origin claims.": "theoryBadgeGraph.shared.itClosesTheGapBetweenInventoryListsAndChemistryPathways",
  "Mineral and aqueous context can constrain plausible prebiotic chemistry.": "theoryBadgeGraph.shared.mineralAndAqueousContextCanConstrainPlausiblePrebioticChemistry",
  "Surface catalysis context does not certify RNA-world, aromatic-ring origin, or consciousness claims.": "theoryBadgeGraph.shared.surfaceCatalysisContextDoesNotCertifyRnaWorldAromaticRing",
  "Coupled Aromatic-Ring Oscillator Context": "theoryBadgeGraph.shared.coupledAromaticRingOscillatorContext",
  "Represents two or more aromatic rings as a speculative coupled-oscillator context for prebiotic molecular-coherence discussions.": "theoryBadgeGraph.shared.representsTwoOrMoreAromaticRingsAsASpeculativeCoupled",
  "It captures the Hameroff-adjacent claim in mathematically inspectable form while blocking collapse, pleasure, and consciousness promotion.": "theoryBadgeGraph.shared.itCapturesTheHameroffAdjacentClaimInMathematicallyInspectableForm",
  "At least two oscillatory units are required for coupling language.": "theoryBadgeGraph.shared.atLeastTwoOscillatoryUnitsAreRequiredForCouplingLanguage",
  "Coupled aromatic oscillators are molecular-coherence context only.": "theoryBadgeGraph.shared.coupledAromaticOscillatorsAreMolecularCoherenceContextOnly",
  "This does not validate OR, consciousness, pleasure optimization, or wavefunction-collapse biology.": "theoryBadgeGraph.shared.thisDoesNotValidateOrConsciousnessPleasureOptimizationOrWavefunction",
  "Prebiotic Decoherence Lifetime Gate": "theoryBadgeGraph.shared.prebioticDecoherenceLifetimeGate",
  "Requires any molecular-coherence claim to expose a candidate lifetime, decoherence time, and explicit surplus or deficit.": "theoryBadgeGraph.shared.requiresAnyMolecularCoherenceClaimToExposeACandidateLifetime",
  "It prevents aromatic-ring oscillator language from skipping directly to OR or consciousness claims without a testable coherence window.": "theoryBadgeGraph.shared.itPreventsAromaticRingOscillatorLanguageFromSkippingDirectlyTo",
  "Molecular coherence claims require an explicit coherence lifetime and candidate timescale.": "theoryBadgeGraph.shared.molecularCoherenceClaimsRequireAnExplicitCoherenceLifetimeAndCandidate",
  "Passing this gate would still not validate OR, consciousness, or wavefunction-collapse biology.": "theoryBadgeGraph.shared.passingThisGateWouldStillNotValidateOrConsciousnessOr",
  "RNA-World Ribozyme Context": "theoryBadgeGraph.shared.rnaWorldRibozymeContext",
  "Represents RNA catalytic function as origin-of-life context separate from aromatic-ring origin hypotheses.": "theoryBadgeGraph.shared.representsRnaCatalyticFunctionAsOriginOfLifeContextSeparate",
  "It keeps RNA-world support retrievable without using RNA catalysis as validation of Hameroff-style aromatic-ring or Orch-OR claims.": "theoryBadgeGraph.shared.itKeepsRnaWorldSupportRetrievableWithoutUsingRnaCatalysis",
  "RNA-world context is represented as origin-of-life chemistry context.": "theoryBadgeGraph.shared.rnaWorldContextIsRepresentedAsOriginOfLifeChemistry",
  "RNA catalysis does not validate aromatic-ring OR claims or Orch-OR.": "theoryBadgeGraph.shared.rnaCatalysisDoesNotValidateAromaticRingOrClaimsOr",
  "Dopamine Not-PAH Shortcut Boundary": "theoryBadgeGraph.shared.dopamineNotPahShortcutBoundary",
  "Blocks shortcuts that treat interstellar PAH chemistry as direct dopamine inheritance or a pleasure-optimization law.": "theoryBadgeGraph.shared.blocksShortcutsThatTreatInterstellarPahChemistryAsDirectDopamine",
  "It keeps aromatic carbon chemistry separate from terrestrial catecholamine biosynthesis and reward-system interpretation.": "theoryBadgeGraph.shared.itKeepsAromaticCarbonChemistrySeparateFromTerrestrialCatecholamineBiosynthesis",
  "Dopamine is not a PAH.": "theoryBadgeGraph.shared.dopamineIsNotAPah",
  "Interstellar aromatic chemistry does not establish terrestrial dopamine biosynthesis.": "theoryBadgeGraph.shared.interstellarAromaticChemistryDoesNotEstablishTerrestrialDopamineBiosynthesis",
  "No pleasure-optimization law is encoded by this bridge.": "theoryBadgeGraph.shared.noPleasureOptimizationLawIsEncodedByThisBridge",
  "Membrane Open-System Entropy Flow": "theoryBadgeGraph.shared.membraneOpenSystemEntropyFlow",
  "Represents membrane-bounded chemistry as open-system entropy production and entropy-flow context.": "theoryBadgeGraph.shared.representsMembraneBoundedChemistryAsOpenSystemEntropyProductionAnd",
  "It gives synchrony and membrane language a thermodynamic footing without encoding will, pleasure, or teleology as a law.": "theoryBadgeGraph.shared.itGivesSynchronyAndMembraneLanguageAThermodynamicFootingWithout",
  "Membranes regulate matter, energy, charge, and chemical-potential gradients.": "theoryBadgeGraph.shared.membranesRegulateMatterEnergyChargeAndChemicalPotentialGradients",
  "Local order may be maintained by exporting entropy.": "theoryBadgeGraph.shared.localOrderMayBeMaintainedByExportingEntropy",
  "This row does not encode will, pleasure optimization, or consciousness.": "theoryBadgeGraph.shared.thisRowDoesNotEncodeWillPleasureOptimizationOrConsciousness",
  "Prebiotic Consciousness Bridge Boundary": "theoryBadgeGraph.shared.prebioticConsciousnessBridgeBoundary",
  "Blocks prebiotic chemistry, molecular oscillator, RNA, membrane, and stellar-carbon rows from promoting into consciousness or objective-collapse claims.": "theoryBadgeGraph.shared.blocksPrebioticChemistryMolecularOscillatorRnaMembraneAndStellarCarbon",
  "It keeps the astrochemistry bridge adjacent to Orch-OR without treating adjacency as evidence.": "theoryBadgeGraph.shared.itKeepsTheAstrochemistryBridgeAdjacentToOrchOrWithout",
  "Coupled aromatic oscillators may be represented as exploratory open-system molecular-coherence context.": "theoryBadgeGraph.shared.coupledAromaticOscillatorsMayBeRepresentedAsExploratoryOpenSystem",
  "No row in this lane validates NHM2, objective collapse, Orch-OR, or a physical consciousness mechanism.": "theoryBadgeGraph.shared.noRowInThisLaneValidatesNhm2ObjectiveCollapseOrch",
  "Common Descent / Phylogeny Context": "theoryBadgeGraph.shared.commonDescentPhylogenyContext",
  "Represents evolutionary lineages and kingdom-scale trait comparisons as biological context.": "theoryBadgeGraph.shared.representsEvolutionaryLineagesAndKingdomScaleTraitComparisonsAsBiological",
  "It gives Helix a first biological scaffold between prebiotic chemistry and later nervous-system or consciousness discussions.": "theoryBadgeGraph.shared.itGivesHelixAFirstBiologicalScaffoldBetweenPrebioticChemistry",
  "Phylogenetic rows organize biological trait context.": "theoryBadgeGraph.shared.phylogeneticRowsOrganizeBiologicalTraitContext",
  "Lineage context does not establish consciousness, objective collapse, or Orch-OR validation.": "theoryBadgeGraph.shared.lineageContextDoesNotEstablishConsciousnessObjectiveCollapseOrOrch",
  "Selection / Fitness Context": "theoryBadgeGraph.shared.selectionFitnessContext",
  "Represents selection as a population-level covariance and transmission context for trait change.": "theoryBadgeGraph.shared.representsSelectionAsAPopulationLevelCovarianceAndTransmissionContext",
  "It keeps adaptation language mathematical without turning self-organization or survival into a consciousness claim.": "theoryBadgeGraph.shared.itKeepsAdaptationLanguageMathematicalWithoutTurningSelfOrganizationOr",
  "The scalar row is a reduced trait-change context, not a complete evolutionary model.": "theoryBadgeGraph.shared.theScalarRowIsAReducedTraitChangeContextNot",
  "Selection context does not define a universal pleasure or consciousness optimization law.": "theoryBadgeGraph.shared.selectionContextDoesNotDefineAUniversalPleasureOrConsciousness",
  "Eukaryotic Kingdom Trait Matrix": "theoryBadgeGraph.shared.eukaryoticKingdomTraitMatrix",
  "Represents plants, animals, fungi, and protists as eukaryotic trait-context rows for later biological comparisons.": "theoryBadgeGraph.shared.representsPlantsAnimalsFungiAndProtistsAsEukaryoticTraitContext",
  "It creates a biology section where plant photosynthesis, animal nervous systems, and conserved cytoskeleton features can be compared without flattening them into one claim.": "theoryBadgeGraph.shared.itCreatesABiologySectionWherePlantPhotosynthesisAnimalNervous",
  "Kingdom rows are comparative biological context.": "theoryBadgeGraph.shared.kingdomRowsAreComparativeBiologicalContext",
  "Shared eukaryotic traits do not establish shared consciousness mechanisms.": "theoryBadgeGraph.shared.sharedEukaryoticTraitsDoNotEstablishSharedConsciousnessMechanisms",
  "Conserved Eukaryotic Microtubule Scaffold": "theoryBadgeGraph.shared.conservedEukaryoticMicrotubuleScaffold",
  "Represents microtubules as conserved eukaryotic cytoskeleton context across plants, animals, fungi, and protists.": "theoryBadgeGraph.shared.representsMicrotubulesAsConservedEukaryoticCytoskeletonContextAcrossPlantsAnimals",
  "It separates the biological fact of conserved tubulin-based scaffolds from Orch-OR-specific microtubule coherence hypotheses.": "theoryBadgeGraph.shared.itSeparatesTheBiologicalFactOfConservedTubulinBasedScaffolds",
  "Microtubule conservation is eukaryotic cytoskeleton context.": "theoryBadgeGraph.shared.microtubuleConservationIsEukaryoticCytoskeletonContext",
  "Conserved microtubules do not validate Orch-OR, plant consciousness, or objective-collapse biology.": "theoryBadgeGraph.shared.conservedMicrotubulesDoNotValidateOrchOrPlantConsciousnessOr",
  "Photosynthetic Light-Harvesting Exciton Context": "theoryBadgeGraph.shared.photosyntheticLightHarvestingExcitonContext",
  "Represents photosynthetic pigment excitation and transfer efficiency as molecular biophysics context.": "theoryBadgeGraph.shared.representsPhotosyntheticPigmentExcitationAndTransferEfficiencyAsMolecularBiophysics",
  "It gives the biology lane a real quantum-biological bridge while keeping it tied to spectroscopy and energy transfer.": "theoryBadgeGraph.shared.itGivesTheBiologyLaneARealQuantumBiologicalBridge",
  "This row models pigment excitation and energy-transfer context.": "theoryBadgeGraph.shared.thisRowModelsPigmentExcitationAndEnergyTransferContext",
  "Photosynthetic quantum coherence does not establish consciousness or objective collapse.": "theoryBadgeGraph.shared.photosyntheticQuantumCoherenceDoesNotEstablishConsciousnessOrObjectiveCollapse",
  "Photosynthesis Coherence Lifetime Gate": "theoryBadgeGraph.shared.photosynthesisCoherenceLifetimeGate",
  "Compares a photosynthetic coherence lifetime with an energy-transfer timescale as a diagnostic gate.": "theoryBadgeGraph.shared.comparesAPhotosyntheticCoherenceLifetimeWithAnEnergyTransferTimescale",
  "It makes the photosynthesis bridge testable by calculation while preventing broad claims from a coherence label alone.": "theoryBadgeGraph.shared.itMakesThePhotosynthesisBridgeTestableByCalculationWhilePreventing",
  "Coherence claims require a lifetime and transfer-timescale comparison.": "theoryBadgeGraph.shared.coherenceClaimsRequireALifetimeAndTransferTimescaleComparison",
  "This gate is a photosynthetic energy-transfer diagnostic, not consciousness evidence.": "theoryBadgeGraph.shared.thisGateIsAPhotosyntheticEnergyTransferDiagnosticNotConsciousness",
  "Animal Consciousness Evolution Context": "theoryBadgeGraph.shared.animalConsciousnessEvolutionContext",
  "Represents animal consciousness as a comparative-evidence context involving neural, behavioral, and evolutionary markers.": "theoryBadgeGraph.shared.representsAnimalConsciousnessAsAComparativeEvidenceContextInvolvingNeural",
  "It gives the graph a biology-side place for consciousness definitions without letting kingdom membership or coherence rows answer the question alone.": "theoryBadgeGraph.shared.itGivesTheGraphABiologySidePlaceForConsciousness",
  "Animal-consciousness discussions require neural and behavioral evidence context.": "theoryBadgeGraph.shared.animalConsciousnessDiscussionsRequireNeuralAndBehavioralEvidenceContext",
  "Comparative evidence context does not validate any one physical theory of consciousness.": "theoryBadgeGraph.shared.comparativeEvidenceContextDoesNotValidateAnyOnePhysicalTheory",
  "Evolutionary Biology Context Boundary": "theoryBadgeGraph.shared.evolutionaryBiologyContextBoundary",
  "Blocks promotion from biological coherence, kingdom traits, or conserved microtubules into consciousness or collapse validation.": "theoryBadgeGraph.shared.blocksPromotionFromBiologicalCoherenceKingdomTraitsOrConservedMicrotubules",
  "It lets the graph connect evolution, plants, microtubules, and animal consciousness definitions while preserving strict claim scope.": "theoryBadgeGraph.shared.itLetsTheGraphConnectEvolutionPlantsMicrotubulesAndAnimal",
  "Photosynthetic coherence is biological energy-transfer context.": "theoryBadgeGraph.shared.photosyntheticCoherenceIsBiologicalEnergyTransferContext",
  "Conserved microtubules are cytoskeletal context across eukaryotes.": "theoryBadgeGraph.shared.conservedMicrotubulesAreCytoskeletalContextAcrossEukaryotes",
  "Evolutionary lineages and kingdoms are trait context, not consciousness evidence by themselves.": "theoryBadgeGraph.shared.evolutionaryLineagesAndKingdomsAreTraitContextNotConsciousnessEvidence",
  "Animal consciousness requires behavioral and neural evidence markers.": "theoryBadgeGraph.shared.animalConsciousnessRequiresBehavioralAndNeuralEvidenceMarkers",
  "No row validates Orch-OR, objective collapse, plant consciousness, kingdom consciousness, or NHM2.": "theoryBadgeGraph.shared.noRowValidatesOrchOrObjectiveCollapsePlantConsciousnessKingdom",
  "Gradient Before Boundary": "theoryBadgeGraph.shared.gradientBeforeBoundary",
  "Represents an energy or entropy contrast as a condition that can drive persistence before a living boundary exists.": "theoryBadgeGraph.shared.representsAnEnergyOrEntropyContrastAsAConditionThat",
  "It gives the map a pre-organism starting point: directed dissipation can precede compartments, sensing, maintenance, and obligation language.": "theoryBadgeGraph.shared.itGivesTheMapAPreOrganismStartingPointDirected",
  "Thermal contrast is a placement and context proxy, not a full entropy-production model.": "theoryBadgeGraph.shared.thermalContrastIsAPlacementAndContextProxyNotA",
  "The row does not claim that a gradient alone creates life, agency, or moral obligation.": "theoryBadgeGraph.shared.theRowDoesNotClaimThatAGradientAloneCreates",
  "Flux Before Action": "theoryBadgeGraph.shared.fluxBeforeAction",
  "Represents matter or energy flow through a non-equilibrium setting before interpreting anything as action or agency.": "theoryBadgeGraph.shared.representsMatterOrEnergyFlowThroughANonEquilibriumSetting",
  "It keeps early-system behavior grounded in flow and dissipation rather than projecting moral or cognitive action backward.": "theoryBadgeGraph.shared.itKeepsEarlySystemBehaviorGroundedInFlowAndDissipation",
  "Flux is a reduced scalar proxy for graph placement.": "theoryBadgeGraph.shared.fluxIsAReducedScalarProxyForGraphPlacement",
  "Flux language is not agency, intention, obligation, or consciousness language.": "theoryBadgeGraph.shared.fluxLanguageIsNotAgencyIntentionObligationOrConsciousnessLanguage",
  "Proton Gradient Before Cell Boundary": "theoryBadgeGraph.shared.protonGradientBeforeCellBoundary",
  "Represents alkaline hydrothermal vent proton-gradient context before modern cellular membranes or metabolism.": "theoryBadgeGraph.shared.representsAlkalineHydrothermalVentProtonGradientContextBeforeModernCellular",
  "It makes a concrete origin-of-life pathway visible: a natural gradient can be supplied by environment and geology before full cells exist.": "theoryBadgeGraph.shared.itMakesAConcreteOriginOfLifePathwayVisibleA",
  "Natural proton-gradient context is origin-of-life scaffolding, not a solved abiogenesis pathway.": "theoryBadgeGraph.shared.naturalProtonGradientContextIsOriginOfLifeScaffoldingNot",
  "The row does not require modern lipid cell boundaries to already exist.": "theoryBadgeGraph.shared.theRowDoesNotRequireModernLipidCellBoundariesTo",
  "Compartment Before Organism": "theoryBadgeGraph.shared.compartmentBeforeOrganism",
  "Represents pores, mineral barriers, vesicles, or membranes as inside/outside structure before a full organism exists.": "theoryBadgeGraph.shared.representsPoresMineralBarriersVesiclesOrMembranesAsInsideOutside",
  "It places boundary language downstream of the pre-boundary gradient while still allowing compartment structure before organism language.": "theoryBadgeGraph.shared.itPlacesBoundaryLanguageDownstreamOfThePreBoundaryGradient",
  "Compartment structure may be inorganic or protocellular.": "theoryBadgeGraph.shared.compartmentStructureMayBeInorganicOrProtocellular",
  "A compartment is not yet an organism, obligation boundary, or consciousness substrate.": "theoryBadgeGraph.shared.aCompartmentIsNotYetAnOrganismObligationBoundaryOr",
  "Concentration Before Replication": "theoryBadgeGraph.shared.concentrationBeforeReplication",
  "Represents local concentration of useful molecules before heredity, complex sensing, or full replication cycles.": "theoryBadgeGraph.shared.representsLocalConcentrationOfUsefulMoleculesBeforeHeredityComplexSensing",
  "It fills the gap between available chemistry and repeatable life-like systems by tracking whether ingredients can become locally dense enough to matter.": "theoryBadgeGraph.shared.itFillsTheGapBetweenAvailableChemistryAndRepeatableLife",
  "Concentration helps structure prebiotic plausibility but does not prove replication.": "theoryBadgeGraph.shared.concentrationHelpsStructurePrebioticPlausibilityButDoesNotProveReplication",
  "Replication, heredity, and sensing remain downstream questions.": "theoryBadgeGraph.shared.replicationHeredityAndSensingRemainDownstreamQuestions",
  "Microbial Growth Is Not Simple Negative Entropy": "theoryBadgeGraph.shared.microbialGrowthIsNotSimpleNegativeEntropy",
  "Keeps biological thermodynamics framed through heat, Gibbs energy, entropy production, maintenance, and growth rather than a loose negative-entropy slogan.": "theoryBadgeGraph.shared.keepsBiologicalThermodynamicsFramedThroughHeatGibbsEnergyEntropyProduction",
  "It blocks the map from treating thermodynamic language as a one-line explanation of life or obligation.": "theoryBadgeGraph.shared.itBlocksTheMapFromTreatingThermodynamicLanguageAsA",
  "Negative-entropy language is historical shorthand and not the formal badge definition.": "theoryBadgeGraph.shared.negativeEntropyLanguageIsHistoricalShorthandAndNotTheFormal",
  "Growth thermodynamics is diagnostic context and does not validate a biological mechanism by itself.": "theoryBadgeGraph.shared.growthThermodynamicsIsDiagnosticContextAndDoesNotValidateA",
  "Orch OR Frontier Consciousness Context": "theoryBadgeGraph.shared.orchOrFrontierConsciousnessContext",
  "Places Orch OR as a bounded frontier consciousness mechanism that requires biological substrate context before it is relevant.": "theoryBadgeGraph.shared.placesOrchOrAsABoundedFrontierConsciousnessMechanismThat",
  "It keeps Hameroff/Penrose available for later reasoning while preventing it from becoming the root of the living-system map.": "theoryBadgeGraph.shared.itKeepsHameroffPenroseAvailableForLaterReasoningWhilePreventing",
  "Orch OR is not a first root for life, bioenergetics, or obligation.": "theoryBadgeGraph.shared.orchOrIsNotAFirstRootForLifeBioenergetics",
  "A consciousness mechanism claim requires evidence beyond prebiotic gradients, compartments, or concentration.": "theoryBadgeGraph.shared.aConsciousnessMechanismClaimRequiresEvidenceBeyondPrebioticGradientsCompartments",
  "Viability Range Before Preference": "theoryBadgeGraph.shared.viabilityRangeBeforePreference",
  "Represents a bounded system's survivable state range before preference, obligation, or value language is introduced.": "theoryBadgeGraph.shared.representsABoundedSystemSSurvivableStateRangeBeforePreference",
  "It lets reflection reason about persistence conditions while keeping moral interpretation outside this theory row.": "theoryBadgeGraph.shared.itLetsReflectionReasonAboutPersistenceConditionsWhileKeepingMoral",
  "A viability range is a condition for persistence, not a preference or obligation.": "theoryBadgeGraph.shared.aViabilityRangeIsAConditionForPersistenceNotA",
  "The scalar error is a calculator proxy for placement and comparison.": "theoryBadgeGraph.shared.theScalarErrorIsACalculatorProxyForPlacementAnd",
  "Homeostasis as Constraint Maintenance": "theoryBadgeGraph.shared.homeostasisAsConstraintMaintenance",
  "Represents homeostasis as feedback-based regulation of internal variables, not wanting or moral preference.": "theoryBadgeGraph.shared.representsHomeostasisAsFeedbackBasedRegulationOfInternalVariablesNot",
  "It gives the graph a clear theory row for keeping bounded variables near a reference condition.": "theoryBadgeGraph.shared.itGivesTheGraphAClearTheoryRowForKeeping",
  "Feedback error is a regulation diagnostic, not evidence of subjective preference.": "theoryBadgeGraph.shared.feedbackErrorIsARegulationDiagnosticNotEvidenceOfSubjective",
  "This badge does not define a moral claim or obligation.": "theoryBadgeGraph.shared.thisBadgeDoesNotDefineAMoralClaimOrObligation",
  "Sensing as State Discrimination": "theoryBadgeGraph.shared.sensingAsStateDiscrimination",
  "Represents sensing as noisy discrimination between states, bounded by signal, noise, receptors, and information limits.": "theoryBadgeGraph.shared.representsSensingAsNoisyDiscriminationBetweenStatesBoundedBySignal",
  "It lets the agent reason about detection without turning detection into experience or consciousness.": "theoryBadgeGraph.shared.itLetsTheAgentReasonAboutDetectionWithoutTurningDetection",
  "Signal discrimination is not subjective experience.": "theoryBadgeGraph.shared.signalDiscriminationIsNotSubjectiveExperience",
  "Sensing accuracy is bounded by noise and measurement context.": "theoryBadgeGraph.shared.sensingAccuracyIsBoundedByNoiseAndMeasurementContext",
  "Membrane Potential as Maintenance Signal": "theoryBadgeGraph.shared.membranePotentialAsMaintenanceSignal",
  "Represents membrane voltage as a cellular bioelectric state that can coordinate behavior before nervous-system or consciousness claims.": "theoryBadgeGraph.shared.representsMembraneVoltageAsACellularBioelectricStateThatCan",
  "It keeps bioelectricity available for cellular regulation reasoning without promoting it into mind or agency.": "theoryBadgeGraph.shared.itKeepsBioelectricityAvailableForCellularRegulationReasoningWithoutPromoting",
  "Bioelectric state can coordinate cells without implying a nervous system.": "theoryBadgeGraph.shared.bioelectricStateCanCoordinateCellsWithoutImplyingANervousSystem",
  "Membrane potential is not a consciousness or mind validation row.": "theoryBadgeGraph.shared.membranePotentialIsNotAConsciousnessOrMindValidationRow",
  "Repair Cost Before Growth": "theoryBadgeGraph.shared.repairCostBeforeGrowth",
  "Represents maintenance and repair energy costs that must be paid before growth is interpreted as expansion or success.": "theoryBadgeGraph.shared.representsMaintenanceAndRepairEnergyCostsThatMustBePaid",
  "It keeps growth reasoning tied to energetic surplus instead of treating growth as automatically beneficial or successful.": "theoryBadgeGraph.shared.itKeepsGrowthReasoningTiedToEnergeticSurplusInsteadOf",
  "Maintenance cost includes repair and survival costs before growth.": "theoryBadgeGraph.shared.maintenanceCostIncludesRepairAndSurvivalCostsBeforeGrowth",
  "Energy surplus is a diagnostic and does not prove growth success.": "theoryBadgeGraph.shared.energySurplusIsADiagnosticAndDoesNotProveGrowth",
  "Perturbation Margin Before Response": "theoryBadgeGraph.shared.perturbationMarginBeforeResponse",
  "Represents response as deviation, tolerance, feedback, and return-to-range before agency language is introduced.": "theoryBadgeGraph.shared.representsResponseAsDeviationToleranceFeedbackAndReturnToRange",
  "It makes disturbance handling visible as a control problem rather than an action or intention claim.": "theoryBadgeGraph.shared.itMakesDisturbanceHandlingVisibleAsAControlProblemRather",
  "Deviation response is control context, not agency.": "theoryBadgeGraph.shared.deviationResponseIsControlContextNotAgency",
  "A positive margin only means the simplified tolerance proxy remains above zero.": "theoryBadgeGraph.shared.aPositiveMarginOnlyMeansTheSimplifiedToleranceProxyRemains",
  "Regulation Is Not Preference Or Agency": "theoryBadgeGraph.shared.regulationIsNotPreferenceOrAgency",
  "Keeps viability, homeostasis, sensing, bioelectricity, repair, and perturbation response from being promoted into preference, agency, mind, or moral claims.": "theoryBadgeGraph.shared.keepsViabilityHomeostasisSensingBioelectricityRepairAndPerturbationResponseFrom",
  "It gives reflection a visible boundary row so compound reasoning can use regulation evidence without overclaiming what it means.": "theoryBadgeGraph.shared.itGivesReflectionAVisibleBoundaryRowSoCompoundReasoning",
  "Regulatory structure can support later reflection without itself proving preference, agency, consciousness, or morality.": "theoryBadgeGraph.shared.regulatoryStructureCanSupportLaterReflectionWithoutItselfProvingPreference",
  "This boundary is diagnostic-only and cannot promote a theory row into NHM2 validation.": "theoryBadgeGraph.shared.thisBoundaryIsDiagnosticOnlyAndCannotPromoteATheory",
  "Thermodynamic Temperature Scale": "theoryBadgeGraph.shared.thermodynamicTemperatureScale",
  "Represents temperature through the thermal energy scale kBT while keeping pressure as only one possible thermometer signal.": "theoryBadgeGraph.shared.representsTemperatureThroughTheThermalEnergyScaleKbtWhileKeeping",
  "It blocks the common shortcut where gas pressure is treated as the definition of temperature near zero-temperature regimes.": "theoryBadgeGraph.shared.itBlocksTheCommonShortcutWhereGasPressureIsTreated",
  "Pressure can be proportional to temperature in an ideal gas thermometer.": "theoryBadgeGraph.shared.pressureCanBeProportionalToTemperatureInAnIdealGas",
  "Pressure does not define temperature and can remain nonzero at zero thermal temperature in other systems.": "theoryBadgeGraph.shared.pressureDoesNotDefineTemperatureAndCanRemainNonzeroAt",
  "Third-Law Cooling Limit": "theoryBadgeGraph.shared.thirdLawCoolingLimit",
  "Represents absolute zero as a limiting state that no finite ordinary cooling process reaches exactly.": "theoryBadgeGraph.shared.representsAbsoluteZeroAsALimitingStateThatNoFinite",
  "It separates the zero-temperature limit from a physical claim that a finite apparatus can remove all remaining structure.": "theoryBadgeGraph.shared.itSeparatesTheZeroTemperatureLimitFromAPhysicalClaim",
  "The zero-temperature floor is a limiting reference, not a reachable finite-step target.": "theoryBadgeGraph.shared.theZeroTemperatureFloorIsALimitingReferenceNotA",
  "Unattainability is not caused by a pressure gauge bottoming out.": "theoryBadgeGraph.shared.unattainabilityIsNotCausedByAPressureGaugeBottomingOut",
  "Quantum Ground-State Energy Floor": "theoryBadgeGraph.shared.quantumGroundStateEnergyFloor",
  "Represents quantum ground-state energy as a remaining floor after removable thermal disorder is gone.": "theoryBadgeGraph.shared.representsQuantumGroundStateEnergyAsARemainingFloorAfter",
  "It prevents absolute zero from being interpreted as zero energy, zero fields, or no quantum structure.": "theoryBadgeGraph.shared.itPreventsAbsoluteZeroFromBeingInterpretedAsZeroEnergy",
  "Zero-point energy is ground-state structure, not heat.": "theoryBadgeGraph.shared.zeroPointEnergyIsGroundStateStructureNotHeat",
  "This badge does not claim extractable free energy or any propulsion result.": "theoryBadgeGraph.shared.thisBadgeDoesNotClaimExtractableFreeEnergyOrAny",
  "Thermal Occupation Suppression": "theoryBadgeGraph.shared.thermalOccupationSuppression",
  "Represents the thermal photon occupation scale that vanishes as temperature approaches zero while vacuum-mode structure remains distinct.": "theoryBadgeGraph.shared.representsTheThermalPhotonOccupationScaleThatVanishesAsTemperature",
  "It keeps Planck radiation, vacuum fluctuations, and Casimir stresses from being collapsed into one meaning of zero.": "theoryBadgeGraph.shared.itKeepsPlanckRadiationVacuumFluctuationsAndCasimirStressesFrom",
  "Thermal photon occupation vanishes for fixed nonzero frequency as temperature approaches zero.": "theoryBadgeGraph.shared.thermalPhotonOccupationVanishesForFixedNonzeroFrequencyAsTemperature",
  "Vanishing thermal radiation is not the same as vanishing vacuum field structure.": "theoryBadgeGraph.shared.vanishingThermalRadiationIsNotTheSameAsVanishingVacuum",
  "Bosonic Phase-Space Degeneracy": "theoryBadgeGraph.shared.bosonicPhaseSpaceDegeneracy",
  "Represents Bose-Einstein condensation as a phase-space-density threshold rather than ordinary freezing.": "theoryBadgeGraph.shared.representsBoseEinsteinCondensationAsAPhaseSpaceDensityThreshold",
  "It lets the map distinguish quantum degeneracy from absolute-zero nothingness or classical solidification.": "theoryBadgeGraph.shared.itLetsTheMapDistinguishQuantumDegeneracyFromAbsoluteZero",
  "The 2.612 threshold is ideal-gas context.": "theoryBadgeGraph.shared.the2612ThresholdIsIdealGasContext",
  "BEC is quantum-degenerate occupation, not a statement that everything freezes or disappears.": "theoryBadgeGraph.shared.becIsQuantumDegenerateOccupationNotAStatementThatEverything",
  "Helium-II Superfluid Surface Flow": "theoryBadgeGraph.shared.heliumIiSuperfluidSurfaceFlow",
  "Represents helium II Rollin-film and superfluid wetting behavior as bounded low-temperature fluid physics.": "theoryBadgeGraph.shared.representsHeliumIiRollinFilmAndSuperfluidWettingBehaviorAs",
  "It prevents wall-climbing helium from being read as gravity violation or an ordinary trapped dilute-gas BEC effect.": "theoryBadgeGraph.shared.itPreventsWallClimbingHeliumFromBeingReadAsGravity",
  "Rollin-film motion depends on superfluid wetting, chemical potential, surface forces, and low viscosity.": "theoryBadgeGraph.shared.rollinFilmMotionDependsOnSuperfluidWettingChemicalPotentialSurface",
  "The wall-climbing effect does not violate gravity.": "theoryBadgeGraph.shared.theWallClimbingEffectDoesNotViolateGravity",
  "Boundary-Induced Vacuum Stress": "theoryBadgeGraph.shared.boundaryInducedVacuumStress",
  "Represents zero-temperature Casimir pressure as geometry-dependent boundary stress rather than thermal pressure.": "theoryBadgeGraph.shared.representsZeroTemperatureCasimirPressureAsGeometryDependentBoundaryStress",
  "It keeps vacuum/free-energy stress separate from thermodynamic temperature when the graph reasons about low-temperature floors.": "theoryBadgeGraph.shared.itKeepsVacuumFreeEnergyStressSeparateFromThermodynamicTemperature",
  "The calculator expression is the ideal perfect-conductor parallel-plate zero-temperature reference.": "theoryBadgeGraph.shared.theCalculatorExpressionIsTheIdealPerfectConductorParallelPlate",
  "Casimir pressure is not a temperature and does not validate NHM2 or propulsion claims.": "theoryBadgeGraph.shared.casimirPressureIsNotATemperatureAndDoesNotValidate",
  "Superconducting Critical Surface": "theoryBadgeGraph.shared.superconductingCriticalSurface",
  "Represents superconducting zero DC resistance as bounded by temperature, current density, and magnetic field conditions.": "theoryBadgeGraph.shared.representsSuperconductingZeroDcResistanceAsBoundedByTemperatureCurrent",
  "It prevents zero resistance from being read as zero impedance or all electrical opposition disappearing.": "theoryBadgeGraph.shared.itPreventsZeroResistanceFromBeingReadAsZeroImpedance",
  "Zero DC resistance requires conditions inside the superconducting critical surface.": "theoryBadgeGraph.shared.zeroDcResistanceRequiresConditionsInsideTheSuperconductingCriticalSurface",
  "AC impedance is generally not zero because response can include reactive and pair-breaking effects.": "theoryBadgeGraph.shared.acImpedanceIsGenerallyNotZeroBecauseResponseCanInclude",
  "Off-Shell Propagator Boundary": "theoryBadgeGraph.shared.offShellPropagatorBoundary",
  "Represents virtual particles as off-shell internal lines in perturbative QFT calculations, not directly observed short-lived beads.": "theoryBadgeGraph.shared.representsVirtualParticlesAsOffShellInternalLinesInPerturbative",
  "It blocks collider and annihilation evidence from being misread as direct proof of spacetime foam or literal vacuum particles popping into existence.": "theoryBadgeGraph.shared.itBlocksColliderAndAnnihilationEvidenceFromBeingMisreadAs",
  "Virtual particles are calculation terms in a perturbative expansion.": "theoryBadgeGraph.shared.virtualParticlesAreCalculationTermsInAPerturbativeExpansion",
  "QED scattering tests do not prove spacetime foam.": "theoryBadgeGraph.shared.qedScatteringTestsDoNotProveSpacetimeFoam",
  "StarSim Stellar Spectral-Abundance Context": "theoryBadgeGraph.shared.starsimStellarSpectralAbundanceContext",
  "Represents StarSim stellar type, surface-temperature, fusion-stage, and composition context as priors for spectroscopy interpretation.": "theoryBadgeGraph.shared.representsStarsimStellarTypeSurfaceTemperatureFusionStageAndComposition",
  "It gives Helix a traceable bridge from simulated stellar state to spectral abundance priors without claiming StarSim solves astrochemistry.": "theoryBadgeGraph.shared.itGivesHelixATraceableBridgeFromSimulatedStellarState",
  "StarSim context is a reduced-order prior for stellar class and fusion state.": "theoryBadgeGraph.shared.starsimContextIsAReducedOrderPriorForStellarClass",
  "This row does not assert that StarSim simulates molecular formation, PAHs, fullerenes, or prebiotic chemistry.": "theoryBadgeGraph.shared.thisRowDoesNotAssertThatStarsimSimulatesMolecularFormation",
  "StarSim Element Yield Prior": "theoryBadgeGraph.shared.starsimElementYieldPrior",
  "Represents stellar fusion and nucleosynthesis outputs as reduced-order element-yield priors for spectral interpretation.": "theoryBadgeGraph.shared.representsStellarFusionAndNucleosynthesisOutputsAsReducedOrderElement",
  "It connects stellar reaction-network context to observable abundance hypotheses while keeping detailed yield modeling out of scope.": "theoryBadgeGraph.shared.itConnectsStellarReactionNetworkContextToObservableAbundanceHypotheses",
  "Element yield priors are reduced-order context unless an explicit yield table or runtime receipt is attached.": "theoryBadgeGraph.shared.elementYieldPriorsAreReducedOrderContextUnlessAnExplicit",
  "Nucleosynthesis context constrains abundance hypotheses; it does not identify molecular bands by itself.": "theoryBadgeGraph.shared.nucleosynthesisContextConstrainsAbundanceHypothesesItDoesNotIdentifyMolecular",
  "Atomic Line Identification Context": "theoryBadgeGraph.shared.atomicLineIdentificationContext",
  "Represents redshift-corrected atomic or ionic spectral-line matching as candidate element identification context.": "theoryBadgeGraph.shared.representsRedshiftCorrectedAtomicOrIonicSpectralLineMatchingAs",
  "It makes the path from observed wavelength to candidate atoms or ions calculator-loadable before any abundance or astrochemistry interpretation.": "theoryBadgeGraph.shared.itMakesThePathFromObservedWavelengthToCandidateAtoms",
  "Observed wavelengths require calibration and redshift context before line matching.": "theoryBadgeGraph.shared.observedWavelengthsRequireCalibrationAndRedshiftContextBeforeLineMatching",
  "Atomic line matching identifies candidate atoms or ions; it does not prove a formation pathway.": "theoryBadgeGraph.shared.atomicLineMatchingIdentifiesCandidateAtomsOrIonsItDoes",
  "Equivalent-Width Abundance Proxy": "theoryBadgeGraph.shared.equivalentWidthAbundanceProxy",
  "Represents line-strength or equivalent-width ratios as a diagnostic abundance proxy that still requires atmospheric modeling for serious abundance claims.": "theoryBadgeGraph.shared.representsLineStrengthOrEquivalentWidthRatiosAsADiagnostic",
  "It lets Helix compare observed line strength with reference features while preventing proxy values from becoming certified composition claims.": "theoryBadgeGraph.shared.itLetsHelixCompareObservedLineStrengthWithReferenceFeatures",
  "Equivalent-width or line-strength ratios are proxy diagnostics.": "theoryBadgeGraph.shared.equivalentWidthOrLineStrengthRatiosAreProxyDiagnostics",
  "A serious abundance claim requires atmospheric conditions, continuum placement, calibration, and radiative-transfer/model context.": "theoryBadgeGraph.shared.aSeriousAbundanceClaimRequiresAtmosphericConditionsContinuumPlacementCalibration",
  "Molecular Band Identification Context": "theoryBadgeGraph.shared.molecularBandIdentificationContext",
  "Represents redshift-corrected molecular or dust band matching for astrochemical candidates such as PAH-family bands and C60 features.": "theoryBadgeGraph.shared.representsRedshiftCorrectedMolecularOrDustBandMatchingForAstrochemical",
  "It bridges stellar/atomic spectroscopy to molecular astrochemistry without asserting that a matched band proves a formation pathway.": "theoryBadgeGraph.shared.itBridgesStellarAtomicSpectroscopyToMolecularAstrochemistryWithoutAsserting",
  "Molecular band matching requires instrument, continuum, temperature, and environment context.": "theoryBadgeGraph.shared.molecularBandMatchingRequiresInstrumentContinuumTemperatureAndEnvironmentContext",
  "PAH-family and C60 band matches are astrochemical candidates, not biological or consciousness evidence.": "theoryBadgeGraph.shared.pahFamilyAndC60BandMatchesAreAstrochemicalCandidatesNot",
  "Spectral Identification Only Boundary": "theoryBadgeGraph.shared.spectralIdentificationOnlyBoundary",
  "Blocks spectral feature matches from promoting into formation-pathway, biological, consciousness, objective-collapse, or StarSim validation claims.": "theoryBadgeGraph.shared.blocksSpectralFeatureMatchesFromPromotingIntoFormationPathwayBiological",
  "It lets the graph retrieve spectral evidence while keeping the interpretation at candidate-identification maturity.": "theoryBadgeGraph.shared.itLetsTheGraphRetrieveSpectralEvidenceWhileKeepingThe",
  "Spectral feature matching identifies candidate atoms, ions, molecules, or dust families under temperature, density, redshift, instrument, and model assumptions.": "theoryBadgeGraph.shared.spectralFeatureMatchingIdentifiesCandidateAtomsIonsMoleculesOrDust",
  "Spectral matches do not prove formation pathway, biological relevance, consciousness, objective collapse, or StarSim runtime validation.": "theoryBadgeGraph.shared.spectralMatchesDoNotProveFormationPathwayBiologicalRelevanceConsciousness",
  "Detailed abundance claims require atmospheric or radiative-transfer modeling beyond scalar proxy rows.": "theoryBadgeGraph.shared.detailedAbundanceClaimsRequireAtmosphericOrRadiativeTransferModelingBeyond",
  "Casimir Parallel-Plate Energy Density": "theoryBadgeGraph.shared.casimirParallelPlateEnergyDensity",
  "Computes the idealized static Casimir energy per plate area from gap distance.": "theoryBadgeGraph.shared.computesTheIdealizedStaticCasimirEnergyPerPlateAreaFrom",
  "It is the scalar root for the repo's static Casimir tile budget.": "theoryBadgeGraph.shared.itIsTheScalarRootForTheRepoSStatic",
  "Idealized perfect-conductor, zero-temperature parallel-plate scalar row.": "theoryBadgeGraph.shared.idealizedPerfectConductorZeroTemperatureParallelPlateScalarRow",
  "Material and finite-temperature corrections require a separate runtime/receipt context.": "theoryBadgeGraph.shared.materialAndFiniteTemperatureCorrectionsRequireASeparateRuntimeReceipt",
  "Material receipts are required before this scalar row can be used as material source evidence.": "theoryBadgeGraph.shared.materialReceiptsAreRequiredBeforeThisScalarRowCanBe",
  "Casimir Parallel-Plate Pressure": "theoryBadgeGraph.shared.casimirParallelPlatePressure",
  "Computes the idealized pressure magnitude/sign proxy for a plate gap.": "theoryBadgeGraph.shared.computesTheIdealizedPressureMagnitudeSignProxyForAPlate",
  "It gives force/load prompts a scalar pressure row linked to the same gap dependence.": "theoryBadgeGraph.shared.itGivesForceLoadPromptsAScalarPressureRowLinked",
  "Idealized scalar pressure row.": "theoryBadgeGraph.shared.idealizedScalarPressureRow",
  "Does not include material, roughness, or finite-temperature corrections.": "theoryBadgeGraph.shared.doesNotIncludeMaterialRoughnessOrFiniteTemperatureCorrections",
  "Casimir Per-Tile Energy": "theoryBadgeGraph.shared.casimirPerTileEnergy",
  "Converts energy per area into a tile energy using the tile footprint.": "theoryBadgeGraph.shared.convertsEnergyPerAreaIntoATileEnergyUsingThe",
  "It is the first project-specific row after the universal parallel-plate formula.": "theoryBadgeGraph.shared.itIsTheFirstProjectSpecificRowAfterTheUniversal",
  "Tile footprint is supplied by the object binding or pipeline receipt.": "theoryBadgeGraph.shared.tileFootprintIsSuppliedByTheObjectBindingOrPipeline",
  "Casimir Static Tile Budget": "theoryBadgeGraph.shared.casimirStaticTileBudget",
  "Aggregates per-tile energy over a tile census.": "theoryBadgeGraph.shared.aggregatesPerTileEnergyOverATileCensus",
  "It connects a single cavity row to the array-level static energy budget.": "theoryBadgeGraph.shared.itConnectsASingleCavityRowToTheArrayLevel",
  "Tile census must come from a layout, pipeline, or explicit object binding.": "theoryBadgeGraph.shared.tileCensusMustComeFromALayoutPipelineOrExplicit",
  "Casimir Tile Duty Budget": "theoryBadgeGraph.shared.casimirTileDutyBudget",
  "Computes the sector-averaged duty term for a strobing tile budget from burst duty, cycle duty, and concurrent sector count.": "theoryBadgeGraph.shared.computesTheSectorAveragedDutyTermForAStrobingTile",
  "It keeps strobing language tied to a cycle-averaged source proxy instead of actuator or steering claims.": "theoryBadgeGraph.shared.itKeepsStrobingLanguageTiedToACycleAveragedSource",
  "Sector strobing controls a cycle-averaged source proxy only.": "theoryBadgeGraph.shared.sectorStrobingControlsACycleAveragedSourceProxyOnly",
  "Duty budgeting does not prove directional stress-energy steering or macroscopic actuation.": "theoryBadgeGraph.shared.dutyBudgetingDoesNotProveDirectionalStressEnergySteeringOr",
  "Casimir Geometry Gain": "theoryBadgeGraph.shared.casimirGeometryGain",
  "Applies the geometry gain cube to the static tile budget.": "theoryBadgeGraph.shared.appliesTheGeometryGainCubeToTheStaticTileBudget",
  "It exposes one step of the project-specific amplification ladder as scalar math.": "theoryBadgeGraph.shared.itExposesOneStepOfTheProjectSpecificAmplificationLadder",
  "Geometry gain is a diagnostic/proxy knob in the current theory map.": "theoryBadgeGraph.shared.geometryGainIsADiagnosticProxyKnobInTheCurrent",
  "Casimir Output Energy Proxy": "theoryBadgeGraph.shared.casimirOutputEnergyProxy",
  "Applies quality, geometry, compression, and duty factors to a static energy magnitude.": "theoryBadgeGraph.shared.appliesQualityGeometryCompressionAndDutyFactorsToAStatic",
  "It keeps the ladder calculation visible while retaining claim-boundary context.": "theoryBadgeGraph.shared.itKeepsTheLadderCalculationVisibleWhileRetainingClaimBoundary",
  "Diagnostic energy proxy only.": "theoryBadgeGraph.shared.diagnosticEnergyProxyOnly",
  "Quality, duty, and compression factors require separate provenance before interpretation.": "theoryBadgeGraph.shared.qualityDutyAndCompressionFactorsRequireSeparateProvenanceBeforeInterpretation",
  "Casimir Mass-Equivalent Proxy": "theoryBadgeGraph.shared.casimirMassEquivalentProxy",
  "Converts an energy proxy into a mass-equivalent scalar using c squared.": "theoryBadgeGraph.shared.convertsAnEnergyProxyIntoAMassEquivalentScalarUsing",
  "It shows the calculator-visible final row of the energy-to-mass proxy chain.": "theoryBadgeGraph.shared.itShowsTheCalculatorVisibleFinalRowOfTheEnergy",
  "Mass-equivalent proxy only; not a mechanism confirmation.": "theoryBadgeGraph.shared.massEquivalentProxyOnlyNotAMechanismConfirmation",
  "Casimir Cavity Mode Frequency": "theoryBadgeGraph.shared.casimirCavityModeFrequency",
  "Computes a simple standing-wave frequency for a cavity length and mode index.": "theoryBadgeGraph.shared.computesASimpleStandingWaveFrequencyForACavityLength",
  "It connects cavity geometry to photon/mode energy rows without running a full resonator model.": "theoryBadgeGraph.shared.itConnectsCavityGeometryToPhotonModeEnergyRowsWithout",
  "Simple standing-wave proxy; boundary conditions and materials are context rows.": "theoryBadgeGraph.shared.simpleStandingWaveProxyBoundaryConditionsAndMaterialsAreContext",
  "Casimir Mode Photon Energy": "theoryBadgeGraph.shared.casimirModePhotonEnergy",
  "Maps a cavity mode frequency into photon energy using Planck's relation.": "theoryBadgeGraph.shared.mapsACavityModeFrequencyIntoPhotonEnergyUsingPlanck",
  "It lets cavity prompts cross into the shared quantum energy-frequency root.": "theoryBadgeGraph.shared.itLetsCavityPromptsCrossIntoTheSharedQuantumEnergy",
  "Single-mode scalar row only.": "theoryBadgeGraph.shared.singleModeScalarRowOnly",
  "Static Casimir Module Runtime": "theoryBadgeGraph.shared.staticCasimirModuleRuntime",
  "References the runtime module that evaluates static Casimir configurations.": "theoryBadgeGraph.shared.referencesTheRuntimeModuleThatEvaluatesStaticCasimirConfigurations",
  "It gives Helix a real code anchor for static Casimir calculations without treating runtime output as a scalar solve.": "theoryBadgeGraph.shared.itGivesHelixARealCodeAnchorForStaticCasimir",
  "Runtime/source reference only; use a future runtime receipt for material-band interpretation.": "theoryBadgeGraph.shared.runtimeSourceReferenceOnlyUseAFutureRuntimeReceiptFor",
  "Casimir Material Receipts": "theoryBadgeGraph.shared.casimirMaterialReceipts",
  "Requires material response, finite conductivity, roughness, finite temperature, gap metrology, seal/vacuum, and geometry-validity receipts.": "theoryBadgeGraph.shared.requiresMaterialResponseFiniteConductivityRoughnessFiniteTemperatureGapMetrology",
  "It blocks ideal parallel-plate or frozen-geometry rows from being read as fabrication readiness or actuator evidence.": "theoryBadgeGraph.shared.itBlocksIdealParallelPlateOrFrozenGeometryRowsFrom",
  "Material receipts are required before ideal scalar rows can be interpreted beyond diagnostic source context.": "theoryBadgeGraph.shared.materialReceiptsAreRequiredBeforeIdealScalarRowsCanBe",
  "Frozen geometry is review-only and does not certify fabrication readiness.": "theoryBadgeGraph.shared.frozenGeometryIsReviewOnlyAndDoesNotCertifyFabrication",
  "Casimir Lifshitz Material Receipt": "theoryBadgeGraph.shared.casimirLifshitzMaterialReceipt",
  "Checks whether the runtime has a material receipt with dielectric response, finite conductivity, finite temperature, and roughness corrections.": "theoryBadgeGraph.shared.checksWhetherTheRuntimeHasAMaterialReceiptWithDielectric",
  "It separates real-material Lifshitz context from the perfect-conductor scalar formula.": "theoryBadgeGraph.shared.itSeparatesRealMaterialLifshitzContextFromThePerfectConductor",
  "A Lifshitz label without dielectric-response provenance is blocked, not material-receipted.": "theoryBadgeGraph.shared.aLifshitzLabelWithoutDielectricResponseProvenanceIsBlockedNot",
  "Perfect-conductor rows remain diagnostic scalar rows until this receipt is present.": "theoryBadgeGraph.shared.perfectConductorRowsRemainDiagnosticScalarRowsUntilThisReceipt",
  "Casimir Beyond-PFA Geometry Validity": "theoryBadgeGraph.shared.casimirBeyondPfaGeometryValidity",
  "Checks whether the tile geometry is valid beyond the simple proximity-force/parallel-plate approximation.": "theoryBadgeGraph.shared.checksWhetherTheTileGeometryIsValidBeyondTheSimple",
  "It prevents curved or rough nanogap geometry from inheriting the ideal plate scalar without geometry evidence.": "theoryBadgeGraph.shared.itPreventsCurvedOrRoughNanogapGeometryFromInheritingThe",
  "Parallel-plate and PFA-like geometry rows are not geometry receipts.": "theoryBadgeGraph.shared.parallelPlateAndPfaLikeGeometryRowsAreNotGeometry",
  "Beyond-PFA validity must be explicit before using geometry-corrected Casimir rows as source evidence.": "theoryBadgeGraph.shared.beyondPfaValidityMustBeExplicitBeforeUsingGeometryCorrected",
  "Casimir Diagnostic Source Boundary": "theoryBadgeGraph.shared.casimirDiagnosticSourceBoundary",
  "Marks Casimir cavity rows as diagnostic/source-context rows, not physical confirmation.": "theoryBadgeGraph.shared.marksCasimirCavityRowsAsDiagnosticSourceContextRowsNot",
  "It keeps the theory atlas from overstating Casimir tile calculations when they overlap NHM2 or QEI paths.": "theoryBadgeGraph.shared.itKeepsTheTheoryAtlasFromOverstatingCasimirTileCalculations",
  "Casimir rows in this graph are diagnostic/source-context artifacts.": "theoryBadgeGraph.shared.casimirRowsInThisGraphAreDiagnosticSourceContextArtifacts",
  "Promotion requires separate evidence gates outside this map.": "theoryBadgeGraph.shared.promotionRequiresSeparateEvidenceGatesOutsideThisMap",
  "Tokamak Magnetic Pressure": "theoryBadgeGraph.shared.tokamakMagneticPressure",
  "Computes a scalar magnetic-pressure proxy from magnetic field strength.": "theoryBadgeGraph.shared.computesAScalarMagneticPressureProxyFromMagneticFieldStrength",
  "It anchors plasma beta and energy-field diagnostics to a calculator-loadable pressure row.": "theoryBadgeGraph.shared.itAnchorsPlasmaBetaAndEnergyFieldDiagnosticsToA",
  "Reduced scalar pressure proxy.": "theoryBadgeGraph.shared.reducedScalarPressureProxy",
  "Does not solve MHD equilibrium.": "theoryBadgeGraph.shared.doesNotSolveMhdEquilibrium",
  "Tokamak Thermal Pressure Proxy": "theoryBadgeGraph.shared.tokamakThermalPressureProxy",
  "Estimates thermal pressure from density and electron-volt temperature.": "theoryBadgeGraph.shared.estimatesThermalPressureFromDensityAndElectronVoltTemperature",
  "It gives beta prompts a scalar pressure row connected to observable plasma state.": "theoryBadgeGraph.shared.itGivesBetaPromptsAScalarPressureRowConnectedTo",
  "Single-temperature reduced proxy.": "theoryBadgeGraph.shared.singleTemperatureReducedProxy",
  "Species composition and profile variation require runtime context.": "theoryBadgeGraph.shared.speciesCompositionAndProfileVariationRequireRuntimeContext",
  "Tokamak Beta Proxy": "theoryBadgeGraph.shared.tokamakBetaProxy",
  "Compares thermal pressure to magnetic pressure as a reduced beta row.": "theoryBadgeGraph.shared.comparesThermalPressureToMagneticPressureAsAReducedBeta",
  "It localizes plasma-state prompts around pressure balance without claiming runtime stability.": "theoryBadgeGraph.shared.itLocalizesPlasmaStatePromptsAroundPressureBalanceWithoutClaiming",
  "Reduced scalar beta row.": "theoryBadgeGraph.shared.reducedScalarBetaRow",
  "Does not establish equilibrium or confinement quality.": "theoryBadgeGraph.shared.doesNotEstablishEquilibriumOrConfinementQuality",
  "Tokamak Power Balance Proxy": "theoryBadgeGraph.shared.tokamakPowerBalanceProxy",
  "Computes a scalar net-power proxy from input and loss channels.": "theoryBadgeGraph.shared.computesAScalarNetPowerProxyFromInputAndLoss",
  "It links power prompts to energy-field and confinement runtime context.": "theoryBadgeGraph.shared.itLinksPowerPromptsToEnergyFieldAndConfinementRuntime",
  "Scalar channel accounting only.": "theoryBadgeGraph.shared.scalarChannelAccountingOnly",
  "Transport and profile dynamics remain runtime context.": "theoryBadgeGraph.shared.transportAndProfileDynamicsRemainRuntimeContext",
  "Tokamak Confinement Energy Proxy": "theoryBadgeGraph.shared.tokamakConfinementEnergyProxy",
  "Estimates stored thermal energy from loss power and energy-confinement time.": "theoryBadgeGraph.shared.estimatesStoredThermalEnergyFromLossPowerAndEnergyConfinement",
  "It gives confinement prompts a scalar row while leaving transport modeling to runtimes.": "theoryBadgeGraph.shared.itGivesConfinementPromptsAScalarRowWhileLeavingTransport",
  "Reduced scalar confinement proxy only.": "theoryBadgeGraph.shared.reducedScalarConfinementProxyOnly",
  "Tokamak Precursor Score Margin": "theoryBadgeGraph.shared.tokamakPrecursorScoreMargin",
  "Compares a reduced precursor score with a diagnostic threshold.": "theoryBadgeGraph.shared.comparesAReducedPrecursorScoreWithADiagnosticThreshold",
  "It gives precursor prompts a calculator row without treating the score as a validated predictor.": "theoryBadgeGraph.shared.itGivesPrecursorPromptsACalculatorRowWithoutTreatingThe",
  "Diagnostic margin only.": "theoryBadgeGraph.shared.diagnosticMarginOnly",
  "Requires a runtime receipt before interpretation.": "theoryBadgeGraph.shared.requiresARuntimeReceiptBeforeInterpretation",
  "Tokamak Core Flux Fraction": "theoryBadgeGraph.shared.tokamakCoreFluxFraction",
  "Computes the fraction of valid grid cells assigned to the core flux band.": "theoryBadgeGraph.shared.computesTheFractionOfValidGridCellsAssignedToThe",
  "It provides a scalar helper for flux-band masks and energy-field coverage.": "theoryBadgeGraph.shared.itProvidesAScalarHelperForFluxBandMasksAnd",
  "Grid-count helper only.": "theoryBadgeGraph.shared.gridCountHelperOnly",
  "Flux coordinate construction is runtime context.": "theoryBadgeGraph.shared.fluxCoordinateConstructionIsRuntimeContext",
  "Tokamak Edge Flux Fraction": "theoryBadgeGraph.shared.tokamakEdgeFluxFraction",
  "Computes the fraction of valid grid cells assigned to the edge flux band.": "theoryBadgeGraph.shared.computesTheFractionOfValidGridCellsAssignedToThe2",
  "It gives the map a scalar row for edge/SOL coverage prompts.": "theoryBadgeGraph.shared.itGivesTheMapAScalarRowForEdgeSol",
  "Tokamak RZ Energy Field Runtime": "theoryBadgeGraph.shared.tokamakRzEnergyFieldRuntime",
  "Reference node for RZ energy-field snapshots and channel weighting.": "theoryBadgeGraph.shared.referenceNodeForRzEnergyFieldSnapshotsAndChannelWeighting",
  "It keeps field/runtime artifacts visible without pretending they are scalar calculator solves.": "theoryBadgeGraph.shared.itKeepsFieldRuntimeArtifactsVisibleWithoutPretendingTheyAre",
  "Runtime/reference context only.": "theoryBadgeGraph.shared.runtimeReferenceContextOnly",
  "Requires field snapshot receipt for numeric interpretation.": "theoryBadgeGraph.shared.requiresFieldSnapshotReceiptForNumericInterpretation",
  "Tokamak Synthetic Diagnostics Runtime": "theoryBadgeGraph.shared.tokamakSyntheticDiagnosticsRuntime",
  "Reference node for bolometry, interferometry, and probe diagnostic reports.": "theoryBadgeGraph.shared.referenceNodeForBolometryInterferometryAndProbeDiagnosticReports",
  "It marks where diagnostic observations enter the tokamak branch.": "theoryBadgeGraph.shared.itMarksWhereDiagnosticObservationsEnterTheTokamakBranch",
  "Runtime diagnostic report context only.": "theoryBadgeGraph.shared.runtimeDiagnosticReportContextOnly",
  "Tokamak Precursor Report Runtime": "theoryBadgeGraph.shared.tokamakPrecursorReportRuntime",
  "Reference node for reduced precursor report generation and threshold context.": "theoryBadgeGraph.shared.referenceNodeForReducedPrecursorReportGenerationAndThresholdContext",
  "It keeps precursor reports separate from the calculator margin row.": "theoryBadgeGraph.shared.itKeepsPrecursorReportsSeparateFromTheCalculatorMarginRow",
  "Score thresholds require calibrated receipts.": "theoryBadgeGraph.shared.scoreThresholdsRequireCalibratedReceipts",
  "Tokamak Diagnostic Proxy Boundary": "theoryBadgeGraph.shared.tokamakDiagnosticProxyBoundary",
  "Keeps tokamak calculator rows and runtime references in diagnostic/proxy scope.": "theoryBadgeGraph.shared.keepsTokamakCalculatorRowsAndRuntimeReferencesInDiagnosticProxy",
  "It prevents pressure, beta, energy-field, or precursor rows from being overstated.": "theoryBadgeGraph.shared.itPreventsPressureBetaEnergyFieldOrPrecursorRowsFrom",
  "Calculator rows are reduced diagnostic helpers.": "theoryBadgeGraph.shared.calculatorRowsAreReducedDiagnosticHelpers",
  "Tokamak runtime receipts are required before interpreting plasma-state outputs.": "theoryBadgeGraph.shared.tokamakRuntimeReceiptsAreRequiredBeforeInterpretingPlasmaStateOutputs",
  "No scalar row establishes plasma stability, disruption prediction, or control authority.": "theoryBadgeGraph.shared.noScalarRowEstablishesPlasmaStabilityDisruptionPredictionOrControl",
  "Galactic Map 3D Distance": "theoryBadgeGraph.shared.galacticMap3dDistance",
  "Computes Euclidean separation between two star-map nodes in parsecs.": "theoryBadgeGraph.shared.computesEuclideanSeparationBetweenTwoStarMapNodesInParsecs",
  "It gives StarMap prompts a scalar geometry row before runtime graph building.": "theoryBadgeGraph.shared.itGivesStarmapPromptsAScalarGeometryRowBeforeRuntime",
  "Euclidean local-map helper.": "theoryBadgeGraph.shared.euclideanLocalMapHelper",
  "Coordinate-frame provenance must come from the map/runtime receipt.": "theoryBadgeGraph.shared.coordinateFrameProvenanceMustComeFromTheMapRuntimeReceipt",
  "Galactic Map Relative Velocity": "theoryBadgeGraph.shared.galacticMapRelativeVelocity",
  "Computes relative velocity magnitude between two star-map nodes.": "theoryBadgeGraph.shared.computesRelativeVelocityMagnitudeBetweenTwoStarMapNodes",
  "It provides scalar support for velocity-field and stream prompts.": "theoryBadgeGraph.shared.itProvidesScalarSupportForVelocityFieldAndStreamPrompts",
  "Velocity-frame provenance must come from the observation/runtime context.": "theoryBadgeGraph.shared.velocityFrameProvenanceMustComeFromTheObservationRuntimeContext",
  "Galactic Structure Weight Proxy": "theoryBadgeGraph.shared.galacticStructureWeightProxy",
  "Assigns a reduced inverse-distance graph weight.": "theoryBadgeGraph.shared.assignsAReducedInverseDistanceGraphWeight",
  "It mirrors the StarMap graph builder's structure-prior weighting row.": "theoryBadgeGraph.shared.itMirrorsTheStarmapGraphBuilderSStructurePriorWeighting",
  "Structure prior only.": "theoryBadgeGraph.shared.structurePriorOnly",
  "Graph weights do not imply a physical spacetime connection.": "theoryBadgeGraph.shared.graphWeightsDoNotImplyAPhysicalSpacetimeConnection",
  "Newtonian Circular Velocity": "theoryBadgeGraph.shared.newtonianCircularVelocity",
  "Computes circular velocity from enclosed mass and radius.": "theoryBadgeGraph.shared.computesCircularVelocityFromEnclosedMassAndRadius",
  "It is the scalar root for baryonic Newtonian rotation-control prompts.": "theoryBadgeGraph.shared.itIsTheScalarRootForBaryonicNewtonianRotationControl",
  "Reduced circular-orbit control row.": "theoryBadgeGraph.shared.reducedCircularOrbitControlRow",
  "Mass model and radius units must be explicit.": "theoryBadgeGraph.shared.massModelAndRadiusUnitsMustBeExplicit",
  "Centripetal Acceleration": "theoryBadgeGraph.shared.centripetalAcceleration",
  "Computes acceleration implied by circular speed and radius.": "theoryBadgeGraph.shared.computesAccelerationImpliedByCircularSpeedAndRadius",
  "It links rotation curves to low-acceleration control-model prompts.": "theoryBadgeGraph.shared.itLinksRotationCurvesToLowAccelerationControlModelPrompts",
  "Unit conversion is explicit in downstream interpretation.": "theoryBadgeGraph.shared.unitConversionIsExplicitInDownstreamInterpretation",
  "Rotation Velocity Residual": "theoryBadgeGraph.shared.rotationVelocityResidual",
  "Compares observed rotation velocity with a selected model velocity.": "theoryBadgeGraph.shared.comparesObservedRotationVelocityWithASelectedModelVelocity",
  "It gives rotation-curve prompts a scalar residual row while keeping model selection separate.": "theoryBadgeGraph.shared.itGivesRotationCurvePromptsAScalarResidualRowWhile",
  "Null-model comparison only.": "theoryBadgeGraph.shared.nullModelComparisonOnly",
  "Does not select a physical explanation.": "theoryBadgeGraph.shared.doesNotSelectAPhysicalExplanation",
  "Rotation RMS Residual Proxy": "theoryBadgeGraph.shared.rotationRmsResidualProxy",
  "Computes RMS residual from a sum of squared velocity residuals.": "theoryBadgeGraph.shared.computesRmsResidualFromASumOfSquaredVelocityResiduals",
  "It mirrors the reduced fit-quality summary used by rotation controls.": "theoryBadgeGraph.shared.itMirrorsTheReducedFitQualitySummaryUsedByRotation",
  "Reduced aggregate row.": "theoryBadgeGraph.shared.reducedAggregateRow",
  "Fit labels require runtime threshold context.": "theoryBadgeGraph.shared.fitLabelsRequireRuntimeThresholdContext",
  "Galactic Rotation Controls Runtime": "theoryBadgeGraph.shared.galacticRotationControlsRuntime",
  "Reference node for baryonic, halo, MOND, and SPARC-like rotation-control comparisons.": "theoryBadgeGraph.shared.referenceNodeForBaryonicHaloMondAndSparcLikeRotation",
  "It keeps rotation model comparison in runtime/null-model scope instead of scalar calculator scope.": "theoryBadgeGraph.shared.itKeepsRotationModelComparisonInRuntimeNullModelScope",
  "Runtime control comparison only.": "theoryBadgeGraph.shared.runtimeControlComparisonOnly",
  "The runtime does not select a physics winner.": "theoryBadgeGraph.shared.theRuntimeDoesNotSelectAPhysicsWinner",
  "Accordion Galactic Null Model Runtime": "theoryBadgeGraph.shared.accordionGalacticNullModelRuntime",
  "Reference node for Accordion cosmology context joined with star population and rotation controls.": "theoryBadgeGraph.shared.referenceNodeForAccordionCosmologyContextJoinedWithStarPopulation",
  "It prevents prompts from treating cosmological expansion as a local bound-system solve.": "theoryBadgeGraph.shared.itPreventsPromptsFromTreatingCosmologicalExpansionAsALocal",
  "Runtime/null-model context only.": "theoryBadgeGraph.shared.runtimeNullModelContextOnly",
  "Bound systems require local dynamics models.": "theoryBadgeGraph.shared.boundSystemsRequireLocalDynamicsModels",
  "Galactic Null-Model Boundary": "theoryBadgeGraph.shared.galacticNullModelBoundary",
  "Keeps galactic dynamics rows in local dynamics and null-model comparison scope.": "theoryBadgeGraph.shared.keepsGalacticDynamicsRowsInLocalDynamicsAndNullModel",
  "It blocks over-reading star maps, rotation residuals, or Accordion context as high-level spacetime evidence.": "theoryBadgeGraph.shared.itBlocksOverReadingStarMapsRotationResidualsOrAccordion",
  "Rotation-control rows are null-model comparisons.": "theoryBadgeGraph.shared.rotationControlRowsAreNullModelComparisons",
  "Star maps are population and structure priors.": "theoryBadgeGraph.shared.starMapsArePopulationAndStructurePriors",
  "No galactic row promotes outputs to ER/EPR evidence or CL support.": "theoryBadgeGraph.shared.noGalacticRowPromotesOutputsToErEprEvidenceOr",
  "Self-Gravity Strength Balance": "theoryBadgeGraph.shared.selfGravityStrengthBalance",
  "Estimates a low-order radius scale where self-gravity starts to compete with material strength.": "theoryBadgeGraph.shared.estimatesALowOrderRadiusScaleWhereSelfGravityStarts",
  "It exposes the potato-radius style scaling already present in the repo as a diagnostic shape row.": "theoryBadgeGraph.shared.itExposesThePotatoRadiusStyleScalingAlreadyPresentIn",
  "Low-order scaling diagnostic only.": "theoryBadgeGraph.shared.lowOrderScalingDiagnosticOnly",
  "Interior structure, porosity, rotation, and tide context are not solved by this scalar row.": "theoryBadgeGraph.shared.interiorStructurePorosityRotationAndTideContextAreNotSolved",
  "Granular Rubble-Pile Dissipation Closure": "theoryBadgeGraph.shared.granularRubblePileDissipationClosure",
  "Packages granular and frictional loss into a low-order cycle dissipation diagnostic.": "theoryBadgeGraph.shared.packagesGranularAndFrictionalLossIntoALowOrderCycle",
  "It keeps contact dynamics and rubble-pile rheology visible without pretending the scalar row is an N-body solver.": "theoryBadgeGraph.shared.itKeepsContactDynamicsAndRubblePileRheologyVisibleWithout",
  "Q packages bulk loss; it does not resolve grain contacts.": "theoryBadgeGraph.shared.qPackagesBulkLossItDoesNotResolveGrainContacts",
  "Rubble-pile interpretation requires body-specific forcing and structure evidence.": "theoryBadgeGraph.shared.rubblePileInterpretationRequiresBodySpecificForcingAndStructureEvidence",
  "Tidal Quality-Factor Damping Proxy": "theoryBadgeGraph.shared.tidalQualityFactorDampingProxy",
  "Converts tidal Q into a dimensionless loss fraction per cycle.": "theoryBadgeGraph.shared.convertsTidalQIntoADimensionlessLossFractionPerCycle",
  "It bridges granular dissipation to tidal damping while keeping the interpretation diagnostic.": "theoryBadgeGraph.shared.itBridgesGranularDissipationToTidalDampingWhileKeepingThe",
  "Reduced damping proxy only.": "theoryBadgeGraph.shared.reducedDampingProxyOnly",
  "Phase lag and interior inversion require observation or runtime receipts.": "theoryBadgeGraph.shared.phaseLagAndInteriorInversionRequireObservationOrRuntimeReceipts",
  "Love-Number Displacement Response": "theoryBadgeGraph.shared.loveNumberDisplacementResponse",
  "Estimates radial deformation from a displacement Love number and external tidal potential.": "theoryBadgeGraph.shared.estimatesRadialDeformationFromADisplacementLoveNumberAndExternal",
  "It gives Love-number language a calculator row while preserving the need for interior-structure evidence.": "theoryBadgeGraph.shared.itGivesLoveNumberLanguageACalculatorRowWhilePreserving",
  "Love-number response is a reduced deformation proxy.": "theoryBadgeGraph.shared.loveNumberResponseIsAReducedDeformationProxy",
  "Interior structure sets response amplitude and phase.": "theoryBadgeGraph.shared.interiorStructureSetsResponseAmplitudeAndPhase",
  "Granular Tidal Response Diagnostic Runtime": "theoryBadgeGraph.shared.granularTidalResponseDiagnosticRuntime",
  "Reference row for body-specific granular/tidal response diagnostics and artifact readers.": "theoryBadgeGraph.shared.referenceRowForBodySpecificGranularTidalResponseDiagnosticsAnd",
  "It marks where a future runtime receipt belongs without implying one has run.": "theoryBadgeGraph.shared.itMarksWhereAFutureRuntimeReceiptBelongsWithoutImplying",
  "Runtime row is reference-only in this seed.": "theoryBadgeGraph.shared.runtimeRowIsReferenceOnlyInThisSeed",
  "Body-specific interpretation requires explicit artifacts or runtime receipts.": "theoryBadgeGraph.shared.bodySpecificInterpretationRequiresExplicitArtifactsOrRuntimeReceipts",
  "Tidal Material-Response Boundary": "theoryBadgeGraph.shared.tidalMaterialResponseBoundary",
  "Keeps self-gravity, granular, tidal-Q, and Love-number rows in diagnostic material-response scope.": "theoryBadgeGraph.shared.keepsSelfGravityGranularTidalQAndLoveNumberRows",
  "It prevents scalar tide rows from leaking into unrelated validation or intervention claims.": "theoryBadgeGraph.shared.itPreventsScalarTideRowsFromLeakingIntoUnrelatedValidation",
  "Tidal response rows are material-response diagnostics.": "theoryBadgeGraph.shared.tidalResponseRowsAreMaterialResponseDiagnostics",
  "No validation or intervention claim may be promoted from these scalar rows.": "theoryBadgeGraph.shared.noValidationOrInterventionClaimMayBePromotedFromThese",
  "Body Curvature Proxy": "theoryBadgeGraph.shared.bodyCurvatureProxy",
  "Maps mass density into a scalar curvature-unit proxy.": "theoryBadgeGraph.shared.mapsMassDensityIntoAScalarCurvatureUnitProxy",
  "It gives curvature prompts a shared m^-2 diagnostic scale without claiming a geometry certificate.": "theoryBadgeGraph.shared.itGivesCurvaturePromptsASharedM2DiagnosticScale",
  "Diagnostic curvature-unit proxy.": "theoryBadgeGraph.shared.diagnosticCurvatureUnitProxy",
  "Not a curvature-gravity certificate.": "theoryBadgeGraph.shared.notACurvatureGravityCertificate",
  "Drive Curvature Proxy": "theoryBadgeGraph.shared.driveCurvatureProxy",
  "Maps drive power over area into a reduced curvature-unit proxy.": "theoryBadgeGraph.shared.mapsDrivePowerOverAreaIntoAReducedCurvatureUnit",
  "It gives drive prompts a scalar comparison row before runtime/certificate interpretation.": "theoryBadgeGraph.shared.itGivesDrivePromptsAScalarComparisonRowBeforeRuntime",
  "Reduced drive proxy.": "theoryBadgeGraph.shared.reducedDriveProxy",
  "Requires runtime provenance before interpretation.": "theoryBadgeGraph.shared.requiresRuntimeProvenanceBeforeInterpretation",
  "Drive / Body Curvature Ratio": "theoryBadgeGraph.shared.driveBodyCurvatureRatio",
  "Compares drive and body curvature proxy magnitudes.": "theoryBadgeGraph.shared.comparesDriveAndBodyCurvatureProxyMagnitudes",
  "It gives a compact scalar diagnostic for relative proxy scale.": "theoryBadgeGraph.shared.itGivesACompactScalarDiagnosticForRelativeProxyScale",
  "Proxy ratio only.": "theoryBadgeGraph.shared.proxyRatioOnly",
  "Does not certify geometric curvature.": "theoryBadgeGraph.shared.doesNotCertifyGeometricCurvature",
  "Collapse Benchmark Hazard": "theoryBadgeGraph.shared.collapseBenchmarkHazard",
  "Computes benchmark trigger probability from timestep and timescale.": "theoryBadgeGraph.shared.computesBenchmarkTriggerProbabilityFromTimestepAndTimescale",
  "It exposes the deterministic collapse-benchmark cadence as scalar math.": "theoryBadgeGraph.shared.itExposesTheDeterministicCollapseBenchmarkCadenceAsScalarMath",
  "Benchmark cadence helper.": "theoryBadgeGraph.shared.benchmarkCadenceHelper",
  "Not a quantum signaling model.": "theoryBadgeGraph.shared.notAQuantumSignalingModel",
  "Collapse Benchmark Present Length": "theoryBadgeGraph.shared.collapseBenchmarkPresentLength",
  "Bounds benchmark footprint by correlation length and light-travel distance.": "theoryBadgeGraph.shared.boundsBenchmarkFootprintByCorrelationLengthAndLightTravelDistance",
  "It keeps benchmark interpretation explicitly relativity bounded.": "theoryBadgeGraph.shared.itKeepsBenchmarkInterpretationExplicitlyRelativityBounded",
  "Relativity-bounded benchmark footprint.": "theoryBadgeGraph.shared.relativityBoundedBenchmarkFootprint",
  "Requires runtime receipt for record-of-run values.": "theoryBadgeGraph.shared.requiresRuntimeReceiptForRecordOfRunValues",
  "Collapse Benchmark Kappa Present": "theoryBadgeGraph.shared.collapseBenchmarkKappaPresent",
  "Converts benchmark present length into a curvature-unit diagnostic.": "theoryBadgeGraph.shared.convertsBenchmarkPresentLengthIntoACurvatureUnitDiagnostic",
  "It lets collapse benchmark outputs share the same m^-2 display scale as curvature proxies.": "theoryBadgeGraph.shared.itLetsCollapseBenchmarkOutputsShareTheSameM2",
  "Curvature-unit diagnostic only.": "theoryBadgeGraph.shared.curvatureUnitDiagnosticOnly",
  "Curvature Uncertainty Margin": "theoryBadgeGraph.shared.curvatureUncertaintyMargin",
  "Computes observed-minus-bound margin for benchmark decisions.": "theoryBadgeGraph.shared.computesObservedMinusBoundMarginForBenchmarkDecisions",
  "It provides a simple scalar row for uncertainty-aware gate explanations.": "theoryBadgeGraph.shared.itProvidesASimpleScalarRowForUncertaintyAwareGate",
  "Scalar gate helper.": "theoryBadgeGraph.shared.scalarGateHelper",
  "Unit meaning follows the bound being compared.": "theoryBadgeGraph.shared.unitMeaningFollowsTheBoundBeingCompared",
  "Curvature Uncertainty Z Score": "theoryBadgeGraph.shared.curvatureUncertaintyZScore",
  "Normalizes an observed-bound margin by an uncertainty scale.": "theoryBadgeGraph.shared.normalizesAnObservedBoundMarginByAnUncertaintyScale",
  "It gives Helix Ask a scalar way to explain how far a diagnostic is from a bound.": "theoryBadgeGraph.shared.itGivesHelixAskAScalarWayToExplainHow",
  "Assumes sigma is commensurate with observed and bound.": "theoryBadgeGraph.shared.assumesSigmaIsCommensurateWithObservedAndBound",
  "Diagnostic only.": "theoryBadgeGraph.shared.diagnosticOnly",
  "Objective Collapse Energy Period": "theoryBadgeGraph.shared.objectiveCollapseEnergyPeriod",
  "Frames an energy scale as a frequency and period before any collapse-model interpretation.": "theoryBadgeGraph.shared.framesAnEnergyScaleAsAFrequencyAndPeriodBefore",
  "Energy-frequency identity only.": "theoryBadgeGraph.shared.energyFrequencyIdentityOnly",
  "This does not by itself identify a physical wavefunction-collapse event.": "theoryBadgeGraph.shared.thisDoesNotByItselfIdentifyAPhysicalWavefunctionCollapse",
  "Objective Collapse Mass-Energy Density": "theoryBadgeGraph.shared.objectiveCollapseMassEnergyDensity",
  "Connects mass density to energy density for collapse-model branch comparisons.": "theoryBadgeGraph.shared.connectsMassDensityToEnergyDensityForCollapseModelBranch",
  "Diosi-Penrose-style diagnostics depend on mass-density differences, so this keeps the mass-energy bridge explicit.": "theoryBadgeGraph.shared.diosiPenroseStyleDiagnosticsDependOnMassDensityDifferencesSo",
  "Mass-energy density bridge.": "theoryBadgeGraph.shared.massEnergyDensityBridge",
  "Not a collapse trigger by itself.": "theoryBadgeGraph.shared.notACollapseTriggerByItself",
  "Objective Collapse Branch Difference": "theoryBadgeGraph.shared.objectiveCollapseBranchDifference",
  "Represents the mass-density difference between two superposed branches.": "theoryBadgeGraph.shared.representsTheMassDensityDifferenceBetweenTwoSuperposedBranches",
  "The DP self-energy comparison is about branch differences, not a universal local density alone.": "theoryBadgeGraph.shared.theDpSelfEnergyComparisonIsAboutBranchDifferencesNot",
  "Requires explicit branch distributions or gridded density fields.": "theoryBadgeGraph.shared.requiresExplicitBranchDistributionsOrGriddedDensityFields",
  "A scalar calculator row cannot replace the mass-density branch evidence.": "theoryBadgeGraph.shared.aScalarCalculatorRowCannotReplaceTheMassDensityBranch",
  "DP Gravitational Self-Energy": "theoryBadgeGraph.shared.dpGravitationalSelfEnergy",
  "Reference node for the gravitational self-energy difference used by Diosi-Penrose collapse diagnostics.": "theoryBadgeGraph.shared.referenceNodeForTheGravitationalSelfEnergyDifferenceUsedBy",
  "It marks the runtime-owned step between branch mass distributions and a collapse timescale.": "theoryBadgeGraph.shared.itMarksTheRuntimeOwnedStepBetweenBranchMassDistributions",
  "Runtime or artifact receipt required.": "theoryBadgeGraph.shared.runtimeOrArtifactReceiptRequired",
  "Cutoff, grid, branch provenance, and experimental-bound context must be explicit.": "theoryBadgeGraph.shared.cutoffGridBranchProvenanceAndExperimentalBoundContextMustBe",
  "DP Collapse Timescale": "theoryBadgeGraph.shared.dpCollapseTimescale",
  "Computes the exploratory DP timescale from gravitational self-energy difference.": "theoryBadgeGraph.shared.computesTheExploratoryDpTimescaleFromGravitationalSelfEnergyDifference",
  "It is the clean scalar bridge from a runtime self-energy receipt into a collapse-model timescale.": "theoryBadgeGraph.shared.itIsTheCleanScalarBridgeFromARuntimeSelf",
  "Exploratory DP model-comparison scalar.": "theoryBadgeGraph.shared.exploratoryDpModelComparisonScalar",
  "DP Collapse Rate": "theoryBadgeGraph.shared.dpCollapseRate",
  "Converts the exploratory DP timescale into a rate.": "theoryBadgeGraph.shared.convertsTheExploratoryDpTimescaleIntoARate",
  "It lets the graph represent collapse as a rate only after the model-specific timescale has been derived.": "theoryBadgeGraph.shared.itLetsTheGraphRepresentCollapseAsARateOnly",
  "Exploratory model rate.": "theoryBadgeGraph.shared.exploratoryModelRate",
  "Not a measured present-moment rate without receipt evidence.": "theoryBadgeGraph.shared.notAMeasuredPresentMomentRateWithoutReceiptEvidence",
  "DP Present Window": "theoryBadgeGraph.shared.dpPresentWindow",
  "Projects the exploratory DP timescale into a relativity-bounded present footprint.": "theoryBadgeGraph.shared.projectsTheExploratoryDpTimescaleIntoARelativityBoundedPresent",
  "It connects objective-collapse timescale prompts to the existing present-length concept without claiming physical collapse.": "theoryBadgeGraph.shared.itConnectsObjectiveCollapseTimescalePromptsToTheExistingPresent",
  "Relativity-bounded footprint for an exploratory DP timescale.": "theoryBadgeGraph.shared.relativityBoundedFootprintForAnExploratoryDpTimescale",
  "This is a model-context projection, not a measured present or a physical-collapse certificate.": "theoryBadgeGraph.shared.thisIsAModelContextProjectionNotAMeasuredPresent",
  "DP Timestep Hazard": "theoryBadgeGraph.shared.dpTimestepHazard",
  "Computes a benchmark timestep probability from the exploratory DP timescale.": "theoryBadgeGraph.shared.computesABenchmarkTimestepProbabilityFromTheExploratoryDpTimescale",
  "It lets the calculator show a present-rate style benchmark from DP tau while keeping the result diagnostic.": "theoryBadgeGraph.shared.itLetsTheCalculatorShowAPresentRateStyleBenchmark",
  "Benchmark hazard helper for an exploratory DP timescale.": "theoryBadgeGraph.shared.benchmarkHazardHelperForAnExploratoryDpTimescale",
  "Probability row is not evidence that objective collapse occurred.": "theoryBadgeGraph.shared.probabilityRowIsNotEvidenceThatObjectiveCollapseOccurred",
  "Objective Collapse Experimental Bounds": "theoryBadgeGraph.shared.objectiveCollapseExperimentalBounds",
  "Reference node for experimental constraints on gravity-related and spontaneous-collapse models.": "theoryBadgeGraph.shared.referenceNodeForExperimentalConstraintsOnGravityRelatedAndSpontaneous",
  "It prevents the graph from treating collapse-model timescales as validation when experiments only bound parameter space.": "theoryBadgeGraph.shared.itPreventsTheGraphFromTreatingCollapseModelTimescalesAs",
  "Experimental bounds constrain model parameters.": "theoryBadgeGraph.shared.experimentalBoundsConstrainModelParameters",
  "Bounds do not validate physical objective collapse.": "theoryBadgeGraph.shared.boundsDoNotValidatePhysicalObjectiveCollapse",
  "Collapse Benchmark Runtime": "theoryBadgeGraph.shared.collapseBenchmarkRuntime",
  "Reference node for the backend collapse benchmark route and deterministic report flow.": "theoryBadgeGraph.shared.referenceNodeForTheBackendCollapseBenchmarkRouteAndDeterministic",
  "It keeps full benchmark execution in backend receipt space rather than scalar calculator rows.": "theoryBadgeGraph.shared.itKeepsFullBenchmarkExecutionInBackendReceiptSpaceRather",
  "Runtime receipt required.": "theoryBadgeGraph.shared.runtimeReceiptRequired",
  "Benchmark route is diagnostic and deterministic under fixed inputs.": "theoryBadgeGraph.shared.benchmarkRouteIsDiagnosticAndDeterministicUnderFixedInputs",
  "Curvature Leverage Benchmark Runtime": "theoryBadgeGraph.shared.curvatureLeverageBenchmarkRuntime",
  "Reference node for curvature leverage benchmark scripts and reports.": "theoryBadgeGraph.shared.referenceNodeForCurvatureLeverageBenchmarkScriptsAndReports",
  "It points prompts to repeatable benchmark receipts without treating calculator rows as records of execution.": "theoryBadgeGraph.shared.itPointsPromptsToRepeatableBenchmarkReceiptsWithoutTreatingCalculator",
  "Runtime/script receipt required.": "theoryBadgeGraph.shared.runtimeScriptReceiptRequired",
  "Benchmark summaries are diagnostics.": "theoryBadgeGraph.shared.benchmarkSummariesAreDiagnostics",
  "Curvature / Collapse Benchmark Boundary": "theoryBadgeGraph.shared.curvatureCollapseBenchmarkBoundary",
  "Keeps curvature proxy and collapse benchmark rows in diagnostic scope.": "theoryBadgeGraph.shared.keepsCurvatureProxyAndCollapseBenchmarkRowsInDiagnosticScope",
  "It blocks UI and agent language from treating scalar rows as physics validation or mechanism confirmation.": "theoryBadgeGraph.shared.itBlocksUiAndAgentLanguageFromTreatingScalarRows",
  "Calculator rows are proxy diagnostics.": "theoryBadgeGraph.shared.calculatorRowsAreProxyDiagnostics",
  "Collapse benchmark rows are commit/selection benchmark helpers.": "theoryBadgeGraph.shared.collapseBenchmarkRowsAreCommitSelectionBenchmarkHelpers",
  "Runtime receipts and verification gates are required before stronger interpretation.": "theoryBadgeGraph.shared.runtimeReceiptsAndVerificationGatesAreRequiredBeforeStrongerInterpretation",
  "Orch-OR Coherence Window": "theoryBadgeGraph.shared.orchOrCoherenceWindow",
  "Compares an exploratory DP timescale with a measured or hypothesized microtubule coherence lifetime.": "theoryBadgeGraph.shared.comparesAnExploratoryDpTimescaleWithAMeasuredOrHypothesized",
  "It is the first scalar check for whether an objective-reduction timescale and a biological coherence window even overlap.": "theoryBadgeGraph.shared.itIsTheFirstScalarCheckForWhetherAnObjective",
  "Exploratory overlap check only.": "theoryBadgeGraph.shared.exploratoryOverlapCheckOnly",
  "Requires direct coherence-lifetime evidence before interpretation.": "theoryBadgeGraph.shared.requiresDirectCoherenceLifetimeEvidenceBeforeInterpretation",
  "Microtubule Mode Frequency": "theoryBadgeGraph.shared.microtubuleModeFrequency",
  "Reference node for measured or modeled microtubule vibrational and transport-mode spectra.": "theoryBadgeGraph.shared.referenceNodeForMeasuredOrModeledMicrotubuleVibrationalAndTransport",
  "It separates microtubule observables from consciousness claims and makes frequency evidence explicit.": "theoryBadgeGraph.shared.itSeparatesMicrotubuleObservablesFromConsciousnessClaimsAndMakesFrequency",
  "Mode frequency may be measured or modeled.": "theoryBadgeGraph.shared.modeFrequencyMayBeMeasuredOrModeled",
  "A microtubule frequency is not itself evidence of consciousness or objective reduction.": "theoryBadgeGraph.shared.aMicrotubuleFrequencyIsNotItselfEvidenceOfConsciousnessOr",
  "Gamma Synchrony Band": "theoryBadgeGraph.shared.gammaSynchronyBand",
  "Represents neural gamma synchrony as a classical neural oscillation context, commonly around 30-100 Hz.": "theoryBadgeGraph.shared.representsNeuralGammaSynchronyAsAClassicalNeuralOscillationContext",
  "It lets the graph compare a DP timescale to neural timing without claiming gamma proves quantum collapse.": "theoryBadgeGraph.shared.itLetsTheGraphCompareADpTimescaleToNeural",
  "Gamma synchrony is neural timing context.": "theoryBadgeGraph.shared.gammaSynchronyIsNeuralTimingContext",
  "Gamma synchrony does not establish objective collapse or microtubule quantum coherence.": "theoryBadgeGraph.shared.gammaSynchronyDoesNotEstablishObjectiveCollapseOrMicrotubuleQuantum",
  "Cross-Scale Frequency Locking": "theoryBadgeGraph.shared.crossScaleFrequencyLocking",
  "Compares candidate fast and slow frequencies through a dimensionless locking ratio.": "theoryBadgeGraph.shared.comparesCandidateFastAndSlowFrequenciesThroughADimensionlessLocking",
  "It lets the graph discuss nested or hierarchical frequencies without calling them time crystals by default.": "theoryBadgeGraph.shared.itLetsTheGraphDiscussNestedOrHierarchicalFrequenciesWithout",
  "Frequency ratios are comparison diagnostics.": "theoryBadgeGraph.shared.frequencyRatiosAreComparisonDiagnostics",
  "A hierarchy of frequencies is not sufficient for a time-crystal claim.": "theoryBadgeGraph.shared.aHierarchyOfFrequenciesIsNotSufficientForATime",
  "Time-Crystal Subharmonic Test": "theoryBadgeGraph.shared.timeCrystalSubharmonicTest",
  "Checks whether a response frequency is subharmonically locked to a drive frequency.": "theoryBadgeGraph.shared.checksWhetherAResponseFrequencyIsSubharmonicallyLockedToA",
  "It encodes one strict time-crystal criterion rather than treating repeated rhythms as enough.": "theoryBadgeGraph.shared.itEncodesOneStrictTimeCrystalCriterionRatherThanTreating",
  "Subharmonic locking is necessary but not sufficient for time-crystal status.": "theoryBadgeGraph.shared.subharmonicLockingIsNecessaryButNotSufficientForTimeCrystal",
  "Robustness and non-equilibrium context are required separately.": "theoryBadgeGraph.shared.robustnessAndNonEquilibriumContextAreRequiredSeparately",
  "Time-Crystal Robustness Window": "theoryBadgeGraph.shared.timeCrystalRobustnessWindow",
  "Reference gate for robustness, persistence, and driven-dissipative context required by time-crystal claims.": "theoryBadgeGraph.shared.referenceGateForRobustnessPersistenceAndDrivenDissipativeContextRequired",
  "It prevents the graph from promoting frequency hierarchy or synchrony into a time-crystal identity.": "theoryBadgeGraph.shared.itPreventsTheGraphFromPromotingFrequencyHierarchyOrSynchrony",
  "Time-crystal status requires standard criteria and independent evidence.": "theoryBadgeGraph.shared.timeCrystalStatusRequiresStandardCriteriaAndIndependentEvidence",
  "Biological frequency hierarchy is not enough by itself.": "theoryBadgeGraph.shared.biologicalFrequencyHierarchyIsNotEnoughByItself",
  "Orch-OR Exploratory Boundary": "theoryBadgeGraph.shared.orchOrExploratoryBoundary",
  "Keeps Orch-OR, gamma synchrony, microtubule coherence, and time-crystal rows in exploratory comparison scope.": "theoryBadgeGraph.shared.keepsOrchOrGammaSynchronyMicrotubuleCoherenceAndTimeCrystal",
  "It blocks calculator rows and locator overlays from implying a confirmed consciousness or collapse mechanism.": "theoryBadgeGraph.shared.itBlocksCalculatorRowsAndLocatorOverlaysFromImplyingA",
  "Orch-OR rows are hypothesis-comparison helpers.": "theoryBadgeGraph.shared.orchOrRowsAreHypothesisComparisonHelpers",
  "Gamma synchrony is neural timing context, not objective-collapse evidence.": "theoryBadgeGraph.shared.gammaSynchronyIsNeuralTimingContextNotObjectiveCollapseEvidence",
  "Microtubule time-crystal status requires standard criteria and direct evidence.": "theoryBadgeGraph.shared.microtubuleTimeCrystalStatusRequiresStandardCriteriaAndDirectEvidence",
  "No consciousness mechanism claim may be promoted from scalar rows.": "theoryBadgeGraph.shared.noConsciousnessMechanismClaimMayBePromotedFromScalarRows",
  "Big Bang Light-Element Nucleosynthesis": "theoryBadgeGraph.shared.bigBangLightElementNucleosynthesis",
  "Represents early-universe production context for the lightest nuclei.": "theoryBadgeGraph.shared.representsEarlyUniverseProductionContextForTheLightestNuclei",
  "It anchors hydrogen, helium, and lithium context before stellar chemical evolution enters the graph.": "theoryBadgeGraph.shared.itAnchorsHydrogenHeliumAndLithiumContextBeforeStellarChemical",
  "Origin-family rows are diagnostic context for element production channels.": "theoryBadgeGraph.shared.originFamilyRowsAreDiagnosticContextForElementProductionChannels",
  "Element origin does not prove molecular formation, prebiotic success, biology, consciousness, or objective collapse.": "theoryBadgeGraph.shared.elementOriginDoesNotProveMolecularFormationPrebioticSuccessBiology",
  "Production channels can be isotope- and environment-dependent; element badges may carry multiple origin families.": "theoryBadgeGraph.shared.productionChannelsCanBeIsotopeAndEnvironmentDependentElementBadges",
  "Hydrogen Burning Helium Production": "theoryBadgeGraph.shared.hydrogenBurningHeliumProduction",
  "Represents proton-proton and CNO-cycle hydrogen burning as helium-production context.": "theoryBadgeGraph.shared.representsProtonProtonAndCnoCycleHydrogenBurningAsHelium",
  "It prevents prompts from treating hydrogen burning as direct oxygen production.": "theoryBadgeGraph.shared.itPreventsPromptsFromTreatingHydrogenBurningAsDirectOxygen",
  "Fusion entrance is limited by Coulomb repulsion; the strong interaction binds nuclei only at short range.": "theoryBadgeGraph.shared.fusionEntranceIsLimitedByCoulombRepulsionTheStrongInteraction",
  "Hydrogen burning primarily produces helium, not direct oxygen production.": "theoryBadgeGraph.shared.hydrogenBurningPrimarilyProducesHeliumNotDirectOxygenProduction",
  "Triple-Alpha Carbon Production": "theoryBadgeGraph.shared.tripleAlphaCarbonProduction",
  "Represents helium-burning carbon synthesis through the triple-alpha channel.": "theoryBadgeGraph.shared.representsHeliumBurningCarbonSynthesisThroughTheTripleAlphaChannel",
  "It anchors carbon-origin badges before aromatic carbon or prebiotic chemistry context is discussed.": "theoryBadgeGraph.shared.itAnchorsCarbonOriginBadgesBeforeAromaticCarbonOrPrebiotic",
  "Alpha-Capture Oxygen-Neon-Magnesium Context": "theoryBadgeGraph.shared.alphaCaptureOxygenNeonMagnesiumContext",
  "Represents alpha-capture pathways that populate oxygen and neighboring alpha elements.": "theoryBadgeGraph.shared.representsAlphaCapturePathwaysThatPopulateOxygenAndNeighboringAlpha",
  "It anchors oxygen origin separately from hydrogen burning and before molecular water context.": "theoryBadgeGraph.shared.itAnchorsOxygenOriginSeparatelyFromHydrogenBurningAndBefore",
  "Advanced Stellar Burning Iron-Peak Context": "theoryBadgeGraph.shared.advancedStellarBurningIronPeakContext",
  "Represents late stellar burning stages that populate iron-peak context.": "theoryBadgeGraph.shared.representsLateStellarBurningStagesThatPopulateIronPeakContext",
  "It keeps iron-peak production separate from energy-producing fusion beyond iron.": "theoryBadgeGraph.shared.itKeepsIronPeakProductionSeparateFromEnergyProducingFusion",
  "Explosive Nucleosynthesis Supernova Yields": "theoryBadgeGraph.shared.explosiveNucleosynthesisSupernovaYields",
  "Represents explosive stellar-event yields as element-origin context.": "theoryBadgeGraph.shared.representsExplosiveStellarEventYieldsAsElementOriginContext",
  "It provides a bounded route for elements whose origin depends on explosive burning or event ejecta.": "theoryBadgeGraph.shared.itProvidesABoundedRouteForElementsWhoseOriginDepends",
  "Cosmic-Ray Spallation Li-Be-B Context": "theoryBadgeGraph.shared.cosmicRaySpallationLiBeBContext",
  "Represents cosmic-ray spallation production context for lithium, beryllium, and boron.": "theoryBadgeGraph.shared.representsCosmicRaySpallationProductionContextForLithiumBerylliumAnd",
  "It prevents Li-Be-B from being flattened into ordinary stellar fusion products.": "theoryBadgeGraph.shared.itPreventsLiBeBFromBeingFlattenedIntoOrdinary",
  "Slow Neutron-Capture Process": "theoryBadgeGraph.shared.slowNeutronCaptureProcess",
  "Represents s-process neutron capture in AGB and massive-star environments.": "theoryBadgeGraph.shared.representsSProcessNeutronCaptureInAgbAndMassiveStar",
  "It gives heavy-element badges a slow-capture route distinct from r-process context.": "theoryBadgeGraph.shared.itGivesHeavyElementBadgesASlowCaptureRouteDistinct",
  "Rapid Neutron-Capture Process": "theoryBadgeGraph.shared.rapidNeutronCaptureProcess",
  "Represents rapid neutron-capture context for many heavy elements from iron-group seeds toward uranium.": "theoryBadgeGraph.shared.representsRapidNeutronCaptureContextForManyHeavyElementsFrom",
  "It anchors gold, uranium, and other heavy-element badges in a distinct high-neutron-flux channel.": "theoryBadgeGraph.shared.itAnchorsGoldUraniumAndOtherHeavyElementBadgesIn",
  "p-Process Photodisintegration Context": "theoryBadgeGraph.shared.pProcessPhotodisintegrationContext",
  "Represents p-process or photodisintegration context for proton-rich isotope families.": "theoryBadgeGraph.shared.representsPProcessOrPhotodisintegrationContextForProtonRichIsotope",
  "It preserves isotope-specific origin ambiguity rather than forcing all heavy elements into s- or r-process only.": "theoryBadgeGraph.shared.itPreservesIsotopeSpecificOriginAmbiguityRatherThanForcingAll",
  "Radioactive Decay-Chain Inheritance": "theoryBadgeGraph.shared.radioactiveDecayChainInheritance",
  "Represents radioactive inheritance and decay-chain context for unstable heavy elements.": "theoryBadgeGraph.shared.representsRadioactiveInheritanceAndDecayChainContextForUnstableHeavy",
  "It lets actinide badges distinguish production routes from later decay-chain observables.": "theoryBadgeGraph.shared.itLetsActinideBadgesDistinguishProductionRoutesFromLaterDecay",
  "Synthetic Superheavy Laboratory Context": "theoryBadgeGraph.shared.syntheticSuperheavyLaboratoryContext",
  "Represents laboratory synthesis context for superheavy elements.": "theoryBadgeGraph.shared.representsLaboratorySynthesisContextForSuperheavyElements",
  "It prevents synthetic superheavy badges from being treated as naturally abundant astrophysical products.": "theoryBadgeGraph.shared.itPreventsSyntheticSuperheavyBadgesFromBeingTreatedAsNaturally",
  "Superheavy element badges are laboratory-synthesis context unless a source explicitly supports natural occurrence.": "theoryBadgeGraph.shared.superheavyElementBadgesAreLaboratorySynthesisContextUnlessASource",
  "Nuclear Binding Mass-Energy": "theoryBadgeGraph.shared.nuclearBindingMassEnergy",
  "Represents nuclear binding energy as mass defect converted through mass-energy equivalence.": "theoryBadgeGraph.shared.representsNuclearBindingEnergyAsMassDefectConvertedThroughMass",
  "It gives element-origin and fusion prompts a scalar bridge from nuclear mass differences to released or required energy.": "theoryBadgeGraph.shared.itGivesElementOriginAndFusionPromptsAScalarBridge",
  "Nuclear-binding rows are first-principles or bounded diagnostic context, not full reaction-network solvers.": "theoryBadgeGraph.shared.nuclearBindingRowsAreFirstPrinciplesOrBoundedDiagnosticContext",
  "They do not validate NHM2, propulsion, consciousness, biology, or prebiotic-success claims.": "theoryBadgeGraph.shared.theyDoNotValidateNhm2PropulsionConsciousnessBiologyOrPrebiotic",
  "Astrophysical rates and yields require external reaction-rate, cross-section, abundance, or runtime evidence.": "theoryBadgeGraph.shared.astrophysicalRatesAndYieldsRequireExternalReactionRateCrossSection",
  "The scalar payload computes an energy from a supplied mass defect; it does not infer nuclear masses.": "theoryBadgeGraph.shared.theScalarPayloadComputesAnEnergyFromASuppliedMass",
  "Nuclear Coulomb Barrier": "theoryBadgeGraph.shared.nuclearCoulombBarrier",
  "Represents electromagnetic repulsion between positively charged nuclei before close approach.": "theoryBadgeGraph.shared.representsElectromagneticRepulsionBetweenPositivelyChargedNucleiBeforeCloseApproach",
  "It prevents the graph from saying the strong force starts fusion at long range; charged nuclei must first face the Coulomb barrier.": "theoryBadgeGraph.shared.itPreventsTheGraphFromSayingTheStrongForceStarts",
  "The Coulomb barrier is electromagnetic repulsion, not nuclear strong-force attraction.": "theoryBadgeGraph.shared.theCoulombBarrierIsElectromagneticRepulsionNotNuclearStrongForce",
  "The scalar payload is a point-charge barrier estimate and not a plasma-screened fusion rate.": "theoryBadgeGraph.shared.theScalarPayloadIsAPointChargeBarrierEstimateAnd",
  "Quantum Tunneling Fusion Entrance": "theoryBadgeGraph.shared.quantumTunnelingFusionEntrance",
  "Represents tunneling through a charged-particle barrier as bounded fusion-entrance context.": "theoryBadgeGraph.shared.representsTunnelingThroughAChargedParticleBarrierAsBoundedFusion",
  "It explains how fusion can occur despite classical Coulomb repulsion without pretending to compute full stellar reaction rates.": "theoryBadgeGraph.shared.itExplainsHowFusionCanOccurDespiteClassicalCoulombRepulsion",
  "This is a tunneling proxy, not a full astrophysical S-factor, screening, or reaction-rate calculation.": "theoryBadgeGraph.shared.thisIsATunnelingProxyNotAFullAstrophysicalS",
  "Fusion entrance depends on temperature, density, plasma screening, cross sections, and reaction channels not solved here.": "theoryBadgeGraph.shared.fusionEntranceDependsOnTemperatureDensityPlasmaScreeningCrossSections",
  "Short-Range Nuclear Binding Force": "theoryBadgeGraph.shared.shortRangeNuclearBindingForce",
  "Represents residual strong nuclear binding as short-range nuclear context after nucleons get close enough.": "theoryBadgeGraph.shared.representsResidualStrongNuclearBindingAsShortRangeNuclearContext",
  "It separates the strong-force binding step from the long-range electromagnetic repulsion that fusion must enter through.": "theoryBadgeGraph.shared.itSeparatesTheStrongForceBindingStepFromTheLong",
  "Residual strong force is short range and does not act as the long-range force that starts fusion.": "theoryBadgeGraph.shared.residualStrongForceIsShortRangeAndDoesNotAct",
  "This badge documents binding context; it is not a quantum chromodynamics or nuclear-structure solver.": "theoryBadgeGraph.shared.thisBadgeDocumentsBindingContextItIsNotAQuantum",
  "Atomic Quantum Bound-State Structure": "theoryBadgeGraph.shared.atomicQuantumBoundStateStructure",
  "Represents atoms as quantum bound states governed by eigenvalue structure, not classical orbits.": "theoryBadgeGraph.shared.representsAtomsAsQuantumBoundStatesGovernedByEigenvalueStructure",
  "It gives element and chemistry prompts a first-principles bridge from nuclear charge to electron-state structure.": "theoryBadgeGraph.shared.itGivesElementAndChemistryPromptsAFirstPrinciplesBridge",
  "Bound-state structure is quantum/electromagnetic context and does not imply molecular formation by itself.": "theoryBadgeGraph.shared.boundStateStructureIsQuantumElectromagneticContextAndDoesNot",
  "Electron Cloud Uncertainty Floor": "theoryBadgeGraph.shared.electronCloudUncertaintyFloor",
  "Represents the position-momentum uncertainty lower bound as electron-cloud structure context.": "theoryBadgeGraph.shared.representsThePositionMomentumUncertaintyLowerBoundAsElectronCloud",
  "It prevents atomic structure from being explained as classical point-electron orbits with simultaneously exact position and momentum.": "theoryBadgeGraph.shared.itPreventsAtomicStructureFromBeingExplainedAsClassicalPoint",
  "The scalar payload estimates a lower-bound momentum spread from a supplied position spread.": "theoryBadgeGraph.shared.theScalarPayloadEstimatesALowerBoundMomentumSpreadFrom",
  "Pauli Shell Structure Context": "theoryBadgeGraph.shared.pauliShellStructureContext",
  "Represents fermionic exclusion as electron-shell and periodic-structure context.": "theoryBadgeGraph.shared.representsFermionicExclusionAsElectronShellAndPeriodicStructureContext",
  "It bridges element identity into electron shell structure without treating atomic periodicity as a nuclear fusion claim.": "theoryBadgeGraph.shared.itBridgesElementIdentityIntoElectronShellStructureWithoutTreating",
  "Shell structure describes electron-state occupancy and does not by itself prove a chemical or molecular pathway.": "theoryBadgeGraph.shared.shellStructureDescribesElectronStateOccupancyAndDoesNotBy",
  "Electromagnetic Molecular Binding Context": "theoryBadgeGraph.shared.electromagneticMolecularBindingContext",
  "Represents molecular binding as electron-nucleus attraction and electron-electron/nucleus-nucleus repulsion under quantum structure.": "theoryBadgeGraph.shared.representsMolecularBindingAsElectronNucleusAttractionAndElectronElectron",
  "It keeps molecular chemistry downstream of atomic quantum/electromagnetic structure and distinct from nuclear fusion.": "theoryBadgeGraph.shared.itKeepsMolecularChemistryDownstreamOfAtomicQuantumElectromagneticStructure",
  "Molecular binding is electromagnetic/quantum chemistry context, not nuclear binding or fusion.": "theoryBadgeGraph.shared.molecularBindingIsElectromagneticQuantumChemistryContextNotNuclearBinding",
  "Water formation still requires local physical chemistry and formation/destruction routes.": "theoryBadgeGraph.shared.waterFormationStillRequiresLocalPhysicalChemistryAndFormationDestruction",
  "Molecular Cloud Elemental Inheritance Context": "theoryBadgeGraph.shared.molecularCloudElementalInheritanceContext",
  "Represents molecular clouds as inheriting element and isotope inventories from prior stellar and galactic chemical evolution.": "theoryBadgeGraph.shared.representsMolecularCloudsAsInheritingElementAndIsotopeInventoriesFrom",
  "It separates inherited elemental possibility space from the local chemistry needed to form molecules.": "theoryBadgeGraph.shared.itSeparatesInheritedElementalPossibilitySpaceFromTheLocalChemistry",
  "Molecular clouds inherit element inventories from prior stellar and interstellar processing.": "theoryBadgeGraph.shared.molecularCloudsInheritElementInventoriesFromPriorStellarAndInterstellar",
  "Inherited elements do not guarantee any specific molecule without local density, temperature, radiation, dust, and ionization context.": "theoryBadgeGraph.shared.inheritedElementsDoNotGuaranteeAnySpecificMoleculeWithoutLocal",
  "Dust-Grain Surface Reaction Context": "theoryBadgeGraph.shared.dustGrainSurfaceReactionContext",
  "Represents dust-grain and ice-surface chemistry as local context for molecular formation in cold interstellar environments.": "theoryBadgeGraph.shared.representsDustGrainAndIceSurfaceChemistryAsLocalContext",
  "It keeps element availability separate from the surface chemistry and desorption routes that affect molecular inventories.": "theoryBadgeGraph.shared.itKeepsElementAvailabilitySeparateFromTheSurfaceChemistryAnd",
  "Dust-grain chemistry is local environmental context.": "theoryBadgeGraph.shared.dustGrainChemistryIsLocalEnvironmentalContext",
  "Surface reaction context does not prove delivery to planets or prebiotic success.": "theoryBadgeGraph.shared.surfaceReactionContextDoesNotProveDeliveryToPlanetsOr",
  "Water H-O Binding Context": "theoryBadgeGraph.shared.waterHOBindingContext",
  "Represents water as a molecular-cloud chemistry context requiring hydrogen, oxygen, and local formation/destruction routes.": "theoryBadgeGraph.shared.representsWaterAsAMolecularCloudChemistryContextRequiringHydrogen",
  "It makes water explainable from element inheritance and chemistry conditions without saying H and O alone are sufficient.": "theoryBadgeGraph.shared.itMakesWaterExplainableFromElementInheritanceAndChemistryConditions",
  "Water formation has multiple interstellar routes, including ion-molecule, neutral-neutral, and gas-ice chemistry.": "theoryBadgeGraph.shared.waterFormationHasMultipleInterstellarRoutesIncludingIonMoleculeNeutral",
  "Hydrogen and oxygen are required element context, but local physical chemistry determines whether water forms or survives.": "theoryBadgeGraph.shared.hydrogenAndOxygenAreRequiredElementContextButLocalPhysical",
  "Water context is not a claim of habitability, life, or prebiotic success.": "theoryBadgeGraph.shared.waterContextIsNotAClaimOfHabitabilityLifeOr",
  "H hydrogen Element-Origin Context": "theoryBadgeGraph.shared.hHydrogenElementOriginContext",
  "It lets Helix connect hydrogen to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectHydrogenToNucleosynthesisObservableSpectralOr",
  "hydrogen origin families: Big Bang nucleosynthesis.": "theoryBadgeGraph.shared.hydrogenOriginFamiliesBigBangNucleosynthesis",
  "hydrogen origin summary: Hydrogen is anchored primarily to Big Bang nucleosynthesis and survives as the dominant baryonic fuel for later stellar burning.": "theoryBadgeGraph.shared.hydrogenOriginSummaryHydrogenIsAnchoredPrimarilyToBigBang",
  "Hydrogen is anchored primarily to Big Bang nucleosynthesis and survives as the dominant baryonic fuel for later stellar burning. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.hydrogenIsAnchoredPrimarilyToBigBangNucleosynthesisAndSurvives",
  "hydrogen: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.hydrogenElementOriginBadgeIsDiagnosticContextNotAProof",
  "hydrogen: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.hydrogenObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "hydrogen: Hydrogen is anchored primarily to Big Bang nucleosynthesis and survives as the dominant baryonic fuel for later stellar burning.": "theoryBadgeGraph.shared.hydrogenHydrogenIsAnchoredPrimarilyToBigBangNucleosynthesisAnd",
  "Element presence is a prerequisite for downstream chemistry, not proof that a molecule or biological pathway formed.": "theoryBadgeGraph.shared.elementPresenceIsAPrerequisiteForDownstreamChemistryNotProof",
  "He helium Element-Origin Context": "theoryBadgeGraph.shared.heHeliumElementOriginContext",
  "It lets Helix connect helium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectHeliumToNucleosynthesisObservableSpectralOr",
  "helium origin families: Big Bang nucleosynthesis, hydrogen burning.": "theoryBadgeGraph.shared.heliumOriginFamiliesBigBangNucleosynthesisHydrogenBurning",
  "helium origin summary: Helium is anchored to primordial light-element production and to stellar hydrogen burning through proton-proton and CNO-cycle contexts.": "theoryBadgeGraph.shared.heliumOriginSummaryHeliumIsAnchoredToPrimordialLightElement",
  "Helium is anchored to primordial light-element production and to stellar hydrogen burning through proton-proton and CNO-cycle contexts. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.heliumIsAnchoredToPrimordialLightElementProductionAndTo",
  "helium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.heliumElementOriginBadgeIsDiagnosticContextNotAProof",
  "helium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.heliumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "helium: Helium is anchored to primordial light-element production and to stellar hydrogen burning through proton-proton and CNO-cycle contexts.": "theoryBadgeGraph.shared.heliumHeliumIsAnchoredToPrimordialLightElementProductionAnd",
  "Li lithium Element-Origin Context": "theoryBadgeGraph.shared.liLithiumElementOriginContext",
  "It lets Helix connect lithium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectLithiumToNucleosynthesisObservableSpectralOr",
  "lithium origin families: Big Bang nucleosynthesis, cosmic-ray spallation.": "theoryBadgeGraph.shared.lithiumOriginFamiliesBigBangNucleosynthesisCosmicRaySpallation",
  "lithium origin summary: Lithium is a mixed light-element case: Big Bang nucleosynthesis is relevant, while cosmic-ray spallation and isotope-specific astrophysics constrain later inventories.": "theoryBadgeGraph.shared.lithiumOriginSummaryLithiumIsAMixedLightElementCase",
  "Lithium is a mixed light-element case: Big Bang nucleosynthesis is relevant, while cosmic-ray spallation and isotope-specific astrophysics constrain later inventories. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.lithiumIsAMixedLightElementCaseBigBangNucleosynthesis",
  "lithium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.lithiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "lithium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.lithiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "lithium: Lithium is a mixed light-element case: Big Bang nucleosynthesis is relevant, while cosmic-ray spallation and isotope-specific astrophysics constrain later inventories.": "theoryBadgeGraph.shared.lithiumLithiumIsAMixedLightElementCaseBigBang",
  "lithium: light-element origin depends on isotope and environment; do not collapse Li-Be-B to stellar fusion only.": "theoryBadgeGraph.shared.lithiumLightElementOriginDependsOnIsotopeAndEnvironmentDo",
  "Be beryllium Element-Origin Context": "theoryBadgeGraph.shared.beBerylliumElementOriginContext",
  "It lets Helix connect beryllium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectBerylliumToNucleosynthesisObservableSpectralOr",
  "beryllium origin families: cosmic-ray spallation.": "theoryBadgeGraph.shared.berylliumOriginFamiliesCosmicRaySpallation",
  "beryllium origin summary: Beryllium and boron are anchored primarily to cosmic-ray spallation of CNO nuclei in low-density interstellar material.": "theoryBadgeGraph.shared.berylliumOriginSummaryBerylliumAndBoronAreAnchoredPrimarilyTo",
  "Beryllium and boron are anchored primarily to cosmic-ray spallation of CNO nuclei in low-density interstellar material. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.berylliumAndBoronAreAnchoredPrimarilyToCosmicRaySpallation",
  "beryllium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.berylliumElementOriginBadgeIsDiagnosticContextNotAProof",
  "beryllium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.berylliumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "beryllium: Beryllium and boron are anchored primarily to cosmic-ray spallation of CNO nuclei in low-density interstellar material.": "theoryBadgeGraph.shared.berylliumBerylliumAndBoronAreAnchoredPrimarilyToCosmicRay",
  "beryllium: light-element origin depends on isotope and environment; do not collapse Li-Be-B to stellar fusion only.": "theoryBadgeGraph.shared.berylliumLightElementOriginDependsOnIsotopeAndEnvironmentDo",
  "B boron Element-Origin Context": "theoryBadgeGraph.shared.bBoronElementOriginContext",
  "It lets Helix connect boron to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectBoronToNucleosynthesisObservableSpectralOr",
  "boron origin families: cosmic-ray spallation.": "theoryBadgeGraph.shared.boronOriginFamiliesCosmicRaySpallation",
  "boron origin summary: Beryllium and boron are anchored primarily to cosmic-ray spallation of CNO nuclei in low-density interstellar material.": "theoryBadgeGraph.shared.boronOriginSummaryBerylliumAndBoronAreAnchoredPrimarilyTo",
  "boron: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.boronElementOriginBadgeIsDiagnosticContextNotAProof",
  "boron: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.boronObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "boron: Beryllium and boron are anchored primarily to cosmic-ray spallation of CNO nuclei in low-density interstellar material.": "theoryBadgeGraph.shared.boronBerylliumAndBoronAreAnchoredPrimarilyToCosmicRay",
  "boron: light-element origin depends on isotope and environment; do not collapse Li-Be-B to stellar fusion only.": "theoryBadgeGraph.shared.boronLightElementOriginDependsOnIsotopeAndEnvironmentDo",
  "C carbon Element-Origin Context": "theoryBadgeGraph.shared.cCarbonElementOriginContext",
  "It lets Helix connect carbon to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectCarbonToNucleosynthesisObservableSpectralOr",
  "carbon origin families: triple-alpha helium burning.": "theoryBadgeGraph.shared.carbonOriginFamiliesTripleAlphaHeliumBurning",
  "carbon origin summary: Carbon is anchored to helium burning through the triple-alpha pathway before later stellar, dust, and organic chemistry contexts.": "theoryBadgeGraph.shared.carbonOriginSummaryCarbonIsAnchoredToHeliumBurningThrough",
  "Carbon is anchored to helium burning through the triple-alpha pathway before later stellar, dust, and organic chemistry contexts. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.carbonIsAnchoredToHeliumBurningThroughTheTripleAlpha",
  "carbon: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.carbonElementOriginBadgeIsDiagnosticContextNotAProof",
  "carbon: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.carbonObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "carbon: Carbon is anchored to helium burning through the triple-alpha pathway before later stellar, dust, and organic chemistry contexts.": "theoryBadgeGraph.shared.carbonCarbonIsAnchoredToHeliumBurningThroughTheTriple",
  "N nitrogen Element-Origin Context": "theoryBadgeGraph.shared.nNitrogenElementOriginContext",
  "It lets Helix connect nitrogen to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectNitrogenToNucleosynthesisObservableSpectralOr",
  "nitrogen origin families: hydrogen burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.nitrogenOriginFamiliesHydrogenBurningExplosiveNucleosynthesis",
  "nitrogen origin summary: Nitrogen is anchored to CNO-cycle processing and stellar yield context, with abundance interpretation depending on stellar mass and chemical-evolution environment.": "theoryBadgeGraph.shared.nitrogenOriginSummaryNitrogenIsAnchoredToCnoCycleProcessing",
  "Nitrogen is anchored to CNO-cycle processing and stellar yield context, with abundance interpretation depending on stellar mass and chemical-evolution environment. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.nitrogenIsAnchoredToCnoCycleProcessingAndStellarYield",
  "nitrogen: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.nitrogenElementOriginBadgeIsDiagnosticContextNotAProof",
  "nitrogen: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.nitrogenObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "nitrogen: Nitrogen is anchored to CNO-cycle processing and stellar yield context, with abundance interpretation depending on stellar mass and chemical-evolution environment.": "theoryBadgeGraph.shared.nitrogenNitrogenIsAnchoredToCnoCycleProcessingAndStellar",
  "O oxygen Element-Origin Context": "theoryBadgeGraph.shared.oOxygenElementOriginContext",
  "It lets Helix connect oxygen to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectOxygenToNucleosynthesisObservableSpectralOr",
  "oxygen origin families: alpha-capture stellar nucleosynthesis, advanced stellar burning.": "theoryBadgeGraph.shared.oxygenOriginFamiliesAlphaCaptureStellarNucleosynthesisAdvancedStellarBurning",
  "oxygen origin summary: Oxygen is anchored to helium-burning and alpha-capture stellar nucleosynthesis, not direct hydrogen burning.": "theoryBadgeGraph.shared.oxygenOriginSummaryOxygenIsAnchoredToHeliumBurningAnd",
  "Oxygen is anchored to helium-burning and alpha-capture stellar nucleosynthesis, not direct hydrogen burning. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.oxygenIsAnchoredToHeliumBurningAndAlphaCaptureStellar",
  "oxygen: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.oxygenElementOriginBadgeIsDiagnosticContextNotAProof",
  "oxygen: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.oxygenObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "oxygen: Oxygen is anchored to helium-burning and alpha-capture stellar nucleosynthesis, not direct hydrogen burning.": "theoryBadgeGraph.shared.oxygenOxygenIsAnchoredToHeliumBurningAndAlphaCapture",
  "F fluorine Element-Origin Context": "theoryBadgeGraph.shared.fFluorineElementOriginContext",
  "It lets Helix connect fluorine to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectFluorineToNucleosynthesisObservableSpectralOr",
  "fluorine origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.fluorineOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "fluorine origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.fluorineOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.elementsFromFluorineThroughZincAreAnchoredToAdvancedStellar",
  "fluorine: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.fluorineElementOriginBadgeIsDiagnosticContextNotAProof",
  "fluorine: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.fluorineObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "fluorine: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.fluorineElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Ne neon Element-Origin Context": "theoryBadgeGraph.shared.neNeonElementOriginContext",
  "It lets Helix connect neon to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectNeonToNucleosynthesisObservableSpectralOr",
  "neon origin families: alpha-capture stellar nucleosynthesis, advanced stellar burning.": "theoryBadgeGraph.shared.neonOriginFamiliesAlphaCaptureStellarNucleosynthesisAdvancedStellarBurning",
  "neon origin summary: The even-Z alpha elements from neon through calcium are anchored to alpha-capture and massive-star burning contexts.": "theoryBadgeGraph.shared.neonOriginSummaryTheEvenZAlphaElementsFromNeon",
  "The even-Z alpha elements from neon through calcium are anchored to alpha-capture and massive-star burning contexts. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.theEvenZAlphaElementsFromNeonThroughCalciumAre",
  "neon: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.neonElementOriginBadgeIsDiagnosticContextNotAProof",
  "neon: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.neonObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "neon: The even-Z alpha elements from neon through calcium are anchored to alpha-capture and massive-star burning contexts.": "theoryBadgeGraph.shared.neonTheEvenZAlphaElementsFromNeonThroughCalcium",
  "Na sodium Element-Origin Context": "theoryBadgeGraph.shared.naSodiumElementOriginContext",
  "It lets Helix connect sodium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectSodiumToNucleosynthesisObservableSpectralOr",
  "sodium origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.sodiumOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "sodium origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.sodiumOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "sodium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.sodiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "sodium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.sodiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "sodium: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.sodiumElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Mg magnesium Element-Origin Context": "theoryBadgeGraph.shared.mgMagnesiumElementOriginContext",
  "It lets Helix connect magnesium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectMagnesiumToNucleosynthesisObservableSpectralOr",
  "magnesium origin families: alpha-capture stellar nucleosynthesis, advanced stellar burning.": "theoryBadgeGraph.shared.magnesiumOriginFamiliesAlphaCaptureStellarNucleosynthesisAdvancedStellarBurning",
  "magnesium origin summary: The even-Z alpha elements from neon through calcium are anchored to alpha-capture and massive-star burning contexts.": "theoryBadgeGraph.shared.magnesiumOriginSummaryTheEvenZAlphaElementsFromNeon",
  "magnesium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.magnesiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "magnesium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.magnesiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "magnesium: The even-Z alpha elements from neon through calcium are anchored to alpha-capture and massive-star burning contexts.": "theoryBadgeGraph.shared.magnesiumTheEvenZAlphaElementsFromNeonThroughCalcium",
  "Al aluminum Element-Origin Context": "theoryBadgeGraph.shared.alAluminumElementOriginContext",
  "It lets Helix connect aluminum to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectAluminumToNucleosynthesisObservableSpectralOr",
  "aluminum origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.aluminumOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "aluminum origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.aluminumOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "aluminum: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.aluminumElementOriginBadgeIsDiagnosticContextNotAProof",
  "aluminum: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.aluminumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "aluminum: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.aluminumElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Si silicon Element-Origin Context": "theoryBadgeGraph.shared.siSiliconElementOriginContext",
  "It lets Helix connect silicon to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectSiliconToNucleosynthesisObservableSpectralOr",
  "silicon origin families: alpha-capture stellar nucleosynthesis, advanced stellar burning.": "theoryBadgeGraph.shared.siliconOriginFamiliesAlphaCaptureStellarNucleosynthesisAdvancedStellarBurning",
  "silicon origin summary: The even-Z alpha elements from neon through calcium are anchored to alpha-capture and massive-star burning contexts.": "theoryBadgeGraph.shared.siliconOriginSummaryTheEvenZAlphaElementsFromNeon",
  "silicon: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.siliconElementOriginBadgeIsDiagnosticContextNotAProof",
  "silicon: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.siliconObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "silicon: The even-Z alpha elements from neon through calcium are anchored to alpha-capture and massive-star burning contexts.": "theoryBadgeGraph.shared.siliconTheEvenZAlphaElementsFromNeonThroughCalcium",
  "P phosphorus Element-Origin Context": "theoryBadgeGraph.shared.pPhosphorusElementOriginContext",
  "It lets Helix connect phosphorus to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectPhosphorusToNucleosynthesisObservableSpectralOr",
  "phosphorus origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.phosphorusOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "phosphorus origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.phosphorusOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "phosphorus: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.phosphorusElementOriginBadgeIsDiagnosticContextNotAProof",
  "phosphorus: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.phosphorusObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "phosphorus: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.phosphorusElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "S sulfur Element-Origin Context": "theoryBadgeGraph.shared.sSulfurElementOriginContext",
  "It lets Helix connect sulfur to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectSulfurToNucleosynthesisObservableSpectralOr",
  "sulfur origin families: alpha-capture stellar nucleosynthesis, advanced stellar burning.": "theoryBadgeGraph.shared.sulfurOriginFamiliesAlphaCaptureStellarNucleosynthesisAdvancedStellarBurning",
  "sulfur origin summary: The even-Z alpha elements from neon through calcium are anchored to alpha-capture and massive-star burning contexts.": "theoryBadgeGraph.shared.sulfurOriginSummaryTheEvenZAlphaElementsFromNeon",
  "sulfur: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.sulfurElementOriginBadgeIsDiagnosticContextNotAProof",
  "sulfur: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.sulfurObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "sulfur: The even-Z alpha elements from neon through calcium are anchored to alpha-capture and massive-star burning contexts.": "theoryBadgeGraph.shared.sulfurTheEvenZAlphaElementsFromNeonThroughCalcium",
  "Cl chlorine Element-Origin Context": "theoryBadgeGraph.shared.clChlorineElementOriginContext",
  "It lets Helix connect chlorine to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectChlorineToNucleosynthesisObservableSpectralOr",
  "chlorine origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.chlorineOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "chlorine origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.chlorineOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "chlorine: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.chlorineElementOriginBadgeIsDiagnosticContextNotAProof",
  "chlorine: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.chlorineObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "chlorine: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.chlorineElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Ar argon Element-Origin Context": "theoryBadgeGraph.shared.arArgonElementOriginContext",
  "It lets Helix connect argon to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectArgonToNucleosynthesisObservableSpectralOr",
  "argon origin families: alpha-capture stellar nucleosynthesis, advanced stellar burning.": "theoryBadgeGraph.shared.argonOriginFamiliesAlphaCaptureStellarNucleosynthesisAdvancedStellarBurning",
  "argon origin summary: The even-Z alpha elements from neon through calcium are anchored to alpha-capture and massive-star burning contexts.": "theoryBadgeGraph.shared.argonOriginSummaryTheEvenZAlphaElementsFromNeon",
  "argon: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.argonElementOriginBadgeIsDiagnosticContextNotAProof",
  "argon: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.argonObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "argon: The even-Z alpha elements from neon through calcium are anchored to alpha-capture and massive-star burning contexts.": "theoryBadgeGraph.shared.argonTheEvenZAlphaElementsFromNeonThroughCalcium",
  "K potassium Element-Origin Context": "theoryBadgeGraph.shared.kPotassiumElementOriginContext",
  "It lets Helix connect potassium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectPotassiumToNucleosynthesisObservableSpectralOr",
  "potassium origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.potassiumOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "potassium origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.potassiumOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "potassium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.potassiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "potassium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.potassiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "potassium: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.potassiumElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Ca calcium Element-Origin Context": "theoryBadgeGraph.shared.caCalciumElementOriginContext",
  "It lets Helix connect calcium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectCalciumToNucleosynthesisObservableSpectralOr",
  "calcium origin families: alpha-capture stellar nucleosynthesis, advanced stellar burning.": "theoryBadgeGraph.shared.calciumOriginFamiliesAlphaCaptureStellarNucleosynthesisAdvancedStellarBurning",
  "calcium origin summary: The even-Z alpha elements from neon through calcium are anchored to alpha-capture and massive-star burning contexts.": "theoryBadgeGraph.shared.calciumOriginSummaryTheEvenZAlphaElementsFromNeon",
  "calcium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.calciumElementOriginBadgeIsDiagnosticContextNotAProof",
  "calcium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.calciumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "calcium: The even-Z alpha elements from neon through calcium are anchored to alpha-capture and massive-star burning contexts.": "theoryBadgeGraph.shared.calciumTheEvenZAlphaElementsFromNeonThroughCalcium",
  "Sc scandium Element-Origin Context": "theoryBadgeGraph.shared.scScandiumElementOriginContext",
  "It lets Helix connect scandium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectScandiumToNucleosynthesisObservableSpectralOr",
  "scandium origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.scandiumOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "scandium origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.scandiumOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "scandium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.scandiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "scandium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.scandiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "scandium: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.scandiumElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Ti titanium Element-Origin Context": "theoryBadgeGraph.shared.tiTitaniumElementOriginContext",
  "It lets Helix connect titanium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectTitaniumToNucleosynthesisObservableSpectralOr",
  "titanium origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.titaniumOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "titanium origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.titaniumOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "titanium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.titaniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "titanium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.titaniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "titanium: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.titaniumElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "V vanadium Element-Origin Context": "theoryBadgeGraph.shared.vVanadiumElementOriginContext",
  "It lets Helix connect vanadium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectVanadiumToNucleosynthesisObservableSpectralOr",
  "vanadium origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.vanadiumOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "vanadium origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.vanadiumOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "vanadium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.vanadiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "vanadium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.vanadiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "vanadium: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.vanadiumElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Cr chromium Element-Origin Context": "theoryBadgeGraph.shared.crChromiumElementOriginContext",
  "It lets Helix connect chromium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectChromiumToNucleosynthesisObservableSpectralOr",
  "chromium origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.chromiumOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "chromium origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.chromiumOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "chromium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.chromiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "chromium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.chromiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "chromium: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.chromiumElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Mn manganese Element-Origin Context": "theoryBadgeGraph.shared.mnManganeseElementOriginContext",
  "It lets Helix connect manganese to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectManganeseToNucleosynthesisObservableSpectralOr",
  "manganese origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.manganeseOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "manganese origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.manganeseOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "manganese: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.manganeseElementOriginBadgeIsDiagnosticContextNotAProof",
  "manganese: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.manganeseObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "manganese: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.manganeseElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Fe iron Element-Origin Context": "theoryBadgeGraph.shared.feIronElementOriginContext",
  "It lets Helix connect iron to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectIronToNucleosynthesisObservableSpectralOr",
  "iron origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.ironOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "iron origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.ironOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "iron: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.ironElementOriginBadgeIsDiagnosticContextNotAProof",
  "iron: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.ironObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "iron: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.ironElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Co cobalt Element-Origin Context": "theoryBadgeGraph.shared.coCobaltElementOriginContext",
  "It lets Helix connect cobalt to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectCobaltToNucleosynthesisObservableSpectralOr",
  "cobalt origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.cobaltOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "cobalt origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.cobaltOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "cobalt: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.cobaltElementOriginBadgeIsDiagnosticContextNotAProof",
  "cobalt: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.cobaltObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "cobalt: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.cobaltElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Ni nickel Element-Origin Context": "theoryBadgeGraph.shared.niNickelElementOriginContext",
  "It lets Helix connect nickel to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectNickelToNucleosynthesisObservableSpectralOr",
  "nickel origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.nickelOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "nickel origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.nickelOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "nickel: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.nickelElementOriginBadgeIsDiagnosticContextNotAProof",
  "nickel: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.nickelObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "nickel: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.nickelElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Cu copper Element-Origin Context": "theoryBadgeGraph.shared.cuCopperElementOriginContext",
  "It lets Helix connect copper to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectCopperToNucleosynthesisObservableSpectralOr",
  "copper origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.copperOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "copper origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.copperOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "copper: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.copperElementOriginBadgeIsDiagnosticContextNotAProof",
  "copper: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.copperObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "copper: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.copperElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Zn zinc Element-Origin Context": "theoryBadgeGraph.shared.znZincElementOriginContext",
  "It lets Helix connect zinc to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectZincToNucleosynthesisObservableSpectralOr",
  "zinc origin families: advanced stellar burning, explosive nucleosynthesis.": "theoryBadgeGraph.shared.zincOriginFamiliesAdvancedStellarBurningExplosiveNucleosynthesis",
  "zinc origin summary: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.zincOriginSummaryElementsFromFluorineThroughZincAreAnchored",
  "zinc: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.zincElementOriginBadgeIsDiagnosticContextNotAProof",
  "zinc: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.zincObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "zinc: Elements from fluorine through zinc are anchored to advanced stellar burning, explosive nucleosynthesis, and stellar-yield abundance evidence at element-level resolution.": "theoryBadgeGraph.shared.zincElementsFromFluorineThroughZincAreAnchoredToAdvanced",
  "Ga gallium Element-Origin Context": "theoryBadgeGraph.shared.gaGalliumElementOriginContext",
  "It lets Helix connect gallium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectGalliumToNucleosynthesisObservableSpectralOr",
  "gallium origin families: slow neutron capture, rapid neutron capture, explosive nucleosynthesis.": "theoryBadgeGraph.shared.galliumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureExplosive",
  "gallium origin summary: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.galliumOriginSummaryElementsFromGalliumThroughMolybdenumAreRepresented",
  "Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.elementsFromGalliumThroughMolybdenumAreRepresentedAsMixedHeavy",
  "gallium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.galliumElementOriginBadgeIsDiagnosticContextNotAProof",
  "gallium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.galliumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "gallium: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.galliumElementsFromGalliumThroughMolybdenumAreRepresentedAsMixed",
  "Ge germanium Element-Origin Context": "theoryBadgeGraph.shared.geGermaniumElementOriginContext",
  "It lets Helix connect germanium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectGermaniumToNucleosynthesisObservableSpectralOr",
  "germanium origin families: slow neutron capture, rapid neutron capture, explosive nucleosynthesis.": "theoryBadgeGraph.shared.germaniumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureExplosive",
  "germanium origin summary: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.germaniumOriginSummaryElementsFromGalliumThroughMolybdenumAreRepresented",
  "germanium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.germaniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "germanium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.germaniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "germanium: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.germaniumElementsFromGalliumThroughMolybdenumAreRepresentedAsMixed",
  "As arsenic Element-Origin Context": "theoryBadgeGraph.shared.asArsenicElementOriginContext",
  "It lets Helix connect arsenic to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectArsenicToNucleosynthesisObservableSpectralOr",
  "arsenic origin families: slow neutron capture, rapid neutron capture, explosive nucleosynthesis.": "theoryBadgeGraph.shared.arsenicOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureExplosive",
  "arsenic origin summary: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.arsenicOriginSummaryElementsFromGalliumThroughMolybdenumAreRepresented",
  "arsenic: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.arsenicElementOriginBadgeIsDiagnosticContextNotAProof",
  "arsenic: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.arsenicObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "arsenic: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.arsenicElementsFromGalliumThroughMolybdenumAreRepresentedAsMixed",
  "Se selenium Element-Origin Context": "theoryBadgeGraph.shared.seSeleniumElementOriginContext",
  "It lets Helix connect selenium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectSeleniumToNucleosynthesisObservableSpectralOr",
  "selenium origin families: slow neutron capture, rapid neutron capture, explosive nucleosynthesis.": "theoryBadgeGraph.shared.seleniumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureExplosive",
  "selenium origin summary: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.seleniumOriginSummaryElementsFromGalliumThroughMolybdenumAreRepresented",
  "selenium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.seleniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "selenium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.seleniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "selenium: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.seleniumElementsFromGalliumThroughMolybdenumAreRepresentedAsMixed",
  "Br bromine Element-Origin Context": "theoryBadgeGraph.shared.brBromineElementOriginContext",
  "It lets Helix connect bromine to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectBromineToNucleosynthesisObservableSpectralOr",
  "bromine origin families: slow neutron capture, rapid neutron capture, explosive nucleosynthesis.": "theoryBadgeGraph.shared.bromineOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureExplosive",
  "bromine origin summary: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.bromineOriginSummaryElementsFromGalliumThroughMolybdenumAreRepresented",
  "bromine: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.bromineElementOriginBadgeIsDiagnosticContextNotAProof",
  "bromine: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.bromineObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "bromine: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.bromineElementsFromGalliumThroughMolybdenumAreRepresentedAsMixed",
  "Kr krypton Element-Origin Context": "theoryBadgeGraph.shared.krKryptonElementOriginContext",
  "It lets Helix connect krypton to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectKryptonToNucleosynthesisObservableSpectralOr",
  "krypton origin families: slow neutron capture, rapid neutron capture, explosive nucleosynthesis.": "theoryBadgeGraph.shared.kryptonOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureExplosive",
  "krypton origin summary: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.kryptonOriginSummaryElementsFromGalliumThroughMolybdenumAreRepresented",
  "krypton: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.kryptonElementOriginBadgeIsDiagnosticContextNotAProof",
  "krypton: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.kryptonObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "krypton: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.kryptonElementsFromGalliumThroughMolybdenumAreRepresentedAsMixed",
  "Rb rubidium Element-Origin Context": "theoryBadgeGraph.shared.rbRubidiumElementOriginContext",
  "It lets Helix connect rubidium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectRubidiumToNucleosynthesisObservableSpectralOr",
  "rubidium origin families: slow neutron capture, rapid neutron capture, explosive nucleosynthesis.": "theoryBadgeGraph.shared.rubidiumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureExplosive",
  "rubidium origin summary: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.rubidiumOriginSummaryElementsFromGalliumThroughMolybdenumAreRepresented",
  "rubidium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.rubidiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "rubidium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.rubidiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "rubidium: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.rubidiumElementsFromGalliumThroughMolybdenumAreRepresentedAsMixed",
  "Sr strontium Element-Origin Context": "theoryBadgeGraph.shared.srStrontiumElementOriginContext",
  "It lets Helix connect strontium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectStrontiumToNucleosynthesisObservableSpectralOr",
  "strontium origin families: slow neutron capture, rapid neutron capture, explosive nucleosynthesis.": "theoryBadgeGraph.shared.strontiumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureExplosive",
  "strontium origin summary: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.strontiumOriginSummaryElementsFromGalliumThroughMolybdenumAreRepresented",
  "strontium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.strontiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "strontium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.strontiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "strontium: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.strontiumElementsFromGalliumThroughMolybdenumAreRepresentedAsMixed",
  "Y yttrium Element-Origin Context": "theoryBadgeGraph.shared.yYttriumElementOriginContext",
  "It lets Helix connect yttrium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectYttriumToNucleosynthesisObservableSpectralOr",
  "yttrium origin families: slow neutron capture, rapid neutron capture, explosive nucleosynthesis.": "theoryBadgeGraph.shared.yttriumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureExplosive",
  "yttrium origin summary: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.yttriumOriginSummaryElementsFromGalliumThroughMolybdenumAreRepresented",
  "yttrium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.yttriumElementOriginBadgeIsDiagnosticContextNotAProof",
  "yttrium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.yttriumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "yttrium: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.yttriumElementsFromGalliumThroughMolybdenumAreRepresentedAsMixed",
  "Zr zirconium Element-Origin Context": "theoryBadgeGraph.shared.zrZirconiumElementOriginContext",
  "It lets Helix connect zirconium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectZirconiumToNucleosynthesisObservableSpectralOr",
  "zirconium origin families: slow neutron capture, rapid neutron capture, explosive nucleosynthesis.": "theoryBadgeGraph.shared.zirconiumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureExplosive",
  "zirconium origin summary: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.zirconiumOriginSummaryElementsFromGalliumThroughMolybdenumAreRepresented",
  "zirconium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.zirconiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "zirconium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.zirconiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "zirconium: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.zirconiumElementsFromGalliumThroughMolybdenumAreRepresentedAsMixed",
  "Nb niobium Element-Origin Context": "theoryBadgeGraph.shared.nbNiobiumElementOriginContext",
  "It lets Helix connect niobium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectNiobiumToNucleosynthesisObservableSpectralOr",
  "niobium origin families: slow neutron capture, rapid neutron capture, explosive nucleosynthesis.": "theoryBadgeGraph.shared.niobiumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureExplosive",
  "niobium origin summary: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.niobiumOriginSummaryElementsFromGalliumThroughMolybdenumAreRepresented",
  "niobium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.niobiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "niobium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.niobiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "niobium: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.niobiumElementsFromGalliumThroughMolybdenumAreRepresentedAsMixed",
  "Mo molybdenum Element-Origin Context": "theoryBadgeGraph.shared.moMolybdenumElementOriginContext",
  "It lets Helix connect molybdenum to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectMolybdenumToNucleosynthesisObservableSpectralOr",
  "molybdenum origin families: slow neutron capture, rapid neutron capture, explosive nucleosynthesis.": "theoryBadgeGraph.shared.molybdenumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureExplosive",
  "molybdenum origin summary: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.molybdenumOriginSummaryElementsFromGalliumThroughMolybdenumAreRepresented",
  "molybdenum: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.molybdenumElementOriginBadgeIsDiagnosticContextNotAProof",
  "molybdenum: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.molybdenumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "molybdenum: Elements from gallium through molybdenum are represented as mixed heavy-element yield context with s-process, r-process, and explosive contributions depending on isotope and environment.": "theoryBadgeGraph.shared.molybdenumElementsFromGalliumThroughMolybdenumAreRepresentedAsMixed",
  "Tc technetium Element-Origin Context": "theoryBadgeGraph.shared.tcTechnetiumElementOriginContext",
  "It lets Helix connect technetium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectTechnetiumToNucleosynthesisObservableSpectralOr",
  "technetium origin families: slow neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.technetiumOriginFamiliesSlowNeutronCaptureRadioactiveDecayChainInheritance",
  "technetium origin summary: Technetium is an unstable element-level marker tied to s-process stellar evidence and radioactive decay-chain observability.": "theoryBadgeGraph.shared.technetiumOriginSummaryTechnetiumIsAnUnstableElementLevelMarker",
  "Technetium is an unstable element-level marker tied to s-process stellar evidence and radioactive decay-chain observability. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.technetiumIsAnUnstableElementLevelMarkerTiedToS",
  "technetium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.technetiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "technetium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.technetiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "technetium: Technetium is an unstable element-level marker tied to s-process stellar evidence and radioactive decay-chain observability.": "theoryBadgeGraph.shared.technetiumTechnetiumIsAnUnstableElementLevelMarkerTiedTo",
  "Ru ruthenium Element-Origin Context": "theoryBadgeGraph.shared.ruRutheniumElementOriginContext",
  "It lets Helix connect ruthenium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectRutheniumToNucleosynthesisObservableSpectralOr",
  "ruthenium origin families: slow neutron capture, rapid neutron capture, p-process or photodisintegration.": "theoryBadgeGraph.shared.rutheniumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureP",
  "ruthenium origin summary: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.rutheniumOriginSummaryElementsFromRutheniumThroughBariumAreRepresented",
  "Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.elementsFromRutheniumThroughBariumAreRepresentedAsIsotopeDependent",
  "ruthenium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.rutheniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "ruthenium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.rutheniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "ruthenium: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.rutheniumElementsFromRutheniumThroughBariumAreRepresentedAsIsotope",
  "Rh rhodium Element-Origin Context": "theoryBadgeGraph.shared.rhRhodiumElementOriginContext",
  "It lets Helix connect rhodium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectRhodiumToNucleosynthesisObservableSpectralOr",
  "rhodium origin families: slow neutron capture, rapid neutron capture, p-process or photodisintegration.": "theoryBadgeGraph.shared.rhodiumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureP",
  "rhodium origin summary: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.rhodiumOriginSummaryElementsFromRutheniumThroughBariumAreRepresented",
  "rhodium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.rhodiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "rhodium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.rhodiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "rhodium: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.rhodiumElementsFromRutheniumThroughBariumAreRepresentedAsIsotope",
  "Pd palladium Element-Origin Context": "theoryBadgeGraph.shared.pdPalladiumElementOriginContext",
  "It lets Helix connect palladium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectPalladiumToNucleosynthesisObservableSpectralOr",
  "palladium origin families: slow neutron capture, rapid neutron capture, p-process or photodisintegration.": "theoryBadgeGraph.shared.palladiumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureP",
  "palladium origin summary: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.palladiumOriginSummaryElementsFromRutheniumThroughBariumAreRepresented",
  "palladium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.palladiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "palladium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.palladiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "palladium: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.palladiumElementsFromRutheniumThroughBariumAreRepresentedAsIsotope",
  "Ag silver Element-Origin Context": "theoryBadgeGraph.shared.agSilverElementOriginContext",
  "It lets Helix connect silver to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectSilverToNucleosynthesisObservableSpectralOr",
  "silver origin families: slow neutron capture, rapid neutron capture, p-process or photodisintegration.": "theoryBadgeGraph.shared.silverOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureP",
  "silver origin summary: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.silverOriginSummaryElementsFromRutheniumThroughBariumAreRepresented",
  "silver: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.silverElementOriginBadgeIsDiagnosticContextNotAProof",
  "silver: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.silverObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "silver: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.silverElementsFromRutheniumThroughBariumAreRepresentedAsIsotope",
  "Cd cadmium Element-Origin Context": "theoryBadgeGraph.shared.cdCadmiumElementOriginContext",
  "It lets Helix connect cadmium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectCadmiumToNucleosynthesisObservableSpectralOr",
  "cadmium origin families: slow neutron capture, rapid neutron capture, p-process or photodisintegration.": "theoryBadgeGraph.shared.cadmiumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureP",
  "cadmium origin summary: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.cadmiumOriginSummaryElementsFromRutheniumThroughBariumAreRepresented",
  "cadmium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.cadmiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "cadmium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.cadmiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "cadmium: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.cadmiumElementsFromRutheniumThroughBariumAreRepresentedAsIsotope",
  "In indium Element-Origin Context": "theoryBadgeGraph.shared.inIndiumElementOriginContext",
  "It lets Helix connect indium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectIndiumToNucleosynthesisObservableSpectralOr",
  "indium origin families: slow neutron capture, rapid neutron capture, p-process or photodisintegration.": "theoryBadgeGraph.shared.indiumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureP",
  "indium origin summary: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.indiumOriginSummaryElementsFromRutheniumThroughBariumAreRepresented",
  "indium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.indiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "indium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.indiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "indium: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.indiumElementsFromRutheniumThroughBariumAreRepresentedAsIsotope",
  "Sn tin Element-Origin Context": "theoryBadgeGraph.shared.snTinElementOriginContext",
  "It lets Helix connect tin to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectTinToNucleosynthesisObservableSpectralOr",
  "tin origin families: slow neutron capture, rapid neutron capture, p-process or photodisintegration.": "theoryBadgeGraph.shared.tinOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureP",
  "tin origin summary: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.tinOriginSummaryElementsFromRutheniumThroughBariumAreRepresented",
  "tin: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.tinElementOriginBadgeIsDiagnosticContextNotAProof",
  "tin: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.tinObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "tin: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.tinElementsFromRutheniumThroughBariumAreRepresentedAsIsotope",
  "Sb antimony Element-Origin Context": "theoryBadgeGraph.shared.sbAntimonyElementOriginContext",
  "It lets Helix connect antimony to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectAntimonyToNucleosynthesisObservableSpectralOr",
  "antimony origin families: slow neutron capture, rapid neutron capture, p-process or photodisintegration.": "theoryBadgeGraph.shared.antimonyOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureP",
  "antimony origin summary: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.antimonyOriginSummaryElementsFromRutheniumThroughBariumAreRepresented",
  "antimony: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.antimonyElementOriginBadgeIsDiagnosticContextNotAProof",
  "antimony: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.antimonyObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "antimony: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.antimonyElementsFromRutheniumThroughBariumAreRepresentedAsIsotope",
  "Te tellurium Element-Origin Context": "theoryBadgeGraph.shared.teTelluriumElementOriginContext",
  "It lets Helix connect tellurium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectTelluriumToNucleosynthesisObservableSpectralOr",
  "tellurium origin families: slow neutron capture, rapid neutron capture, p-process or photodisintegration.": "theoryBadgeGraph.shared.telluriumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureP",
  "tellurium origin summary: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.telluriumOriginSummaryElementsFromRutheniumThroughBariumAreRepresented",
  "tellurium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.telluriumElementOriginBadgeIsDiagnosticContextNotAProof",
  "tellurium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.telluriumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "tellurium: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.telluriumElementsFromRutheniumThroughBariumAreRepresentedAsIsotope",
  "I iodine Element-Origin Context": "theoryBadgeGraph.shared.iIodineElementOriginContext",
  "It lets Helix connect iodine to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectIodineToNucleosynthesisObservableSpectralOr",
  "iodine origin families: slow neutron capture, rapid neutron capture, p-process or photodisintegration.": "theoryBadgeGraph.shared.iodineOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureP",
  "iodine origin summary: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.iodineOriginSummaryElementsFromRutheniumThroughBariumAreRepresented",
  "iodine: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.iodineElementOriginBadgeIsDiagnosticContextNotAProof",
  "iodine: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.iodineObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "iodine: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.iodineElementsFromRutheniumThroughBariumAreRepresentedAsIsotope",
  "Xe xenon Element-Origin Context": "theoryBadgeGraph.shared.xeXenonElementOriginContext",
  "It lets Helix connect xenon to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectXenonToNucleosynthesisObservableSpectralOr",
  "xenon origin families: slow neutron capture, rapid neutron capture, p-process or photodisintegration.": "theoryBadgeGraph.shared.xenonOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureP",
  "xenon origin summary: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.xenonOriginSummaryElementsFromRutheniumThroughBariumAreRepresented",
  "xenon: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.xenonElementOriginBadgeIsDiagnosticContextNotAProof",
  "xenon: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.xenonObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "xenon: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.xenonElementsFromRutheniumThroughBariumAreRepresentedAsIsotope",
  "Cs cesium Element-Origin Context": "theoryBadgeGraph.shared.csCesiumElementOriginContext",
  "It lets Helix connect cesium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectCesiumToNucleosynthesisObservableSpectralOr",
  "cesium origin families: slow neutron capture, rapid neutron capture, p-process or photodisintegration.": "theoryBadgeGraph.shared.cesiumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureP",
  "cesium origin summary: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.cesiumOriginSummaryElementsFromRutheniumThroughBariumAreRepresented",
  "cesium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.cesiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "cesium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.cesiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "cesium: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.cesiumElementsFromRutheniumThroughBariumAreRepresentedAsIsotope",
  "Ba barium Element-Origin Context": "theoryBadgeGraph.shared.baBariumElementOriginContext",
  "It lets Helix connect barium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectBariumToNucleosynthesisObservableSpectralOr",
  "barium origin families: slow neutron capture, rapid neutron capture, p-process or photodisintegration.": "theoryBadgeGraph.shared.bariumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureP",
  "barium origin summary: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.bariumOriginSummaryElementsFromRutheniumThroughBariumAreRepresented",
  "barium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.bariumElementOriginBadgeIsDiagnosticContextNotAProof",
  "barium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.bariumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "barium: Elements from ruthenium through barium are represented as isotope-dependent neutron-capture and proton-rich isotope context.": "theoryBadgeGraph.shared.bariumElementsFromRutheniumThroughBariumAreRepresentedAsIsotope",
  "La lanthanum Element-Origin Context": "theoryBadgeGraph.shared.laLanthanumElementOriginContext",
  "It lets Helix connect lanthanum to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectLanthanumToNucleosynthesisObservableSpectralOr",
  "lanthanum origin families: slow neutron capture, rapid neutron capture.": "theoryBadgeGraph.shared.lanthanumOriginFamiliesSlowNeutronCaptureRapidNeutronCapture",
  "lanthanum origin summary: The early lanthanides are represented as mixed s-process and r-process heavy-element abundance context.": "theoryBadgeGraph.shared.lanthanumOriginSummaryTheEarlyLanthanidesAreRepresentedAsMixed",
  "The early lanthanides are represented as mixed s-process and r-process heavy-element abundance context. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.theEarlyLanthanidesAreRepresentedAsMixedSProcessAnd",
  "lanthanum: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.lanthanumElementOriginBadgeIsDiagnosticContextNotAProof",
  "lanthanum: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.lanthanumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "lanthanum: The early lanthanides are represented as mixed s-process and r-process heavy-element abundance context.": "theoryBadgeGraph.shared.lanthanumTheEarlyLanthanidesAreRepresentedAsMixedSProcess",
  "Ce cerium Element-Origin Context": "theoryBadgeGraph.shared.ceCeriumElementOriginContext",
  "It lets Helix connect cerium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectCeriumToNucleosynthesisObservableSpectralOr",
  "cerium origin families: slow neutron capture, rapid neutron capture.": "theoryBadgeGraph.shared.ceriumOriginFamiliesSlowNeutronCaptureRapidNeutronCapture",
  "cerium origin summary: The early lanthanides are represented as mixed s-process and r-process heavy-element abundance context.": "theoryBadgeGraph.shared.ceriumOriginSummaryTheEarlyLanthanidesAreRepresentedAsMixed",
  "cerium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.ceriumElementOriginBadgeIsDiagnosticContextNotAProof",
  "cerium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.ceriumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "cerium: The early lanthanides are represented as mixed s-process and r-process heavy-element abundance context.": "theoryBadgeGraph.shared.ceriumTheEarlyLanthanidesAreRepresentedAsMixedSProcess",
  "Pr praseodymium Element-Origin Context": "theoryBadgeGraph.shared.prPraseodymiumElementOriginContext",
  "It lets Helix connect praseodymium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectPraseodymiumToNucleosynthesisObservableSpectralOr",
  "praseodymium origin families: slow neutron capture, rapid neutron capture.": "theoryBadgeGraph.shared.praseodymiumOriginFamiliesSlowNeutronCaptureRapidNeutronCapture",
  "praseodymium origin summary: The early lanthanides are represented as mixed s-process and r-process heavy-element abundance context.": "theoryBadgeGraph.shared.praseodymiumOriginSummaryTheEarlyLanthanidesAreRepresentedAsMixed",
  "praseodymium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.praseodymiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "praseodymium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.praseodymiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "praseodymium: The early lanthanides are represented as mixed s-process and r-process heavy-element abundance context.": "theoryBadgeGraph.shared.praseodymiumTheEarlyLanthanidesAreRepresentedAsMixedSProcess",
  "Nd neodymium Element-Origin Context": "theoryBadgeGraph.shared.ndNeodymiumElementOriginContext",
  "It lets Helix connect neodymium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectNeodymiumToNucleosynthesisObservableSpectralOr",
  "neodymium origin families: slow neutron capture, rapid neutron capture.": "theoryBadgeGraph.shared.neodymiumOriginFamiliesSlowNeutronCaptureRapidNeutronCapture",
  "neodymium origin summary: The early lanthanides are represented as mixed s-process and r-process heavy-element abundance context.": "theoryBadgeGraph.shared.neodymiumOriginSummaryTheEarlyLanthanidesAreRepresentedAsMixed",
  "neodymium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.neodymiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "neodymium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.neodymiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "neodymium: The early lanthanides are represented as mixed s-process and r-process heavy-element abundance context.": "theoryBadgeGraph.shared.neodymiumTheEarlyLanthanidesAreRepresentedAsMixedSProcess",
  "Pm promethium Element-Origin Context": "theoryBadgeGraph.shared.pmPromethiumElementOriginContext",
  "It lets Helix connect promethium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectPromethiumToNucleosynthesisObservableSpectralOr",
  "promethium origin families: rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.promethiumOriginFamiliesRapidNeutronCaptureRadioactiveDecayChainInheritance",
  "promethium origin summary: Promethium is represented as unstable heavy-element context tied to rapid neutron-capture inheritance and radioactive decay-chain observability.": "theoryBadgeGraph.shared.promethiumOriginSummaryPromethiumIsRepresentedAsUnstableHeavyElement",
  "Promethium is represented as unstable heavy-element context tied to rapid neutron-capture inheritance and radioactive decay-chain observability. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.promethiumIsRepresentedAsUnstableHeavyElementContextTiedTo",
  "promethium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.promethiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "promethium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.promethiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "promethium: Promethium is represented as unstable heavy-element context tied to rapid neutron-capture inheritance and radioactive decay-chain observability.": "theoryBadgeGraph.shared.promethiumPromethiumIsRepresentedAsUnstableHeavyElementContextTied",
  "Sm samarium Element-Origin Context": "theoryBadgeGraph.shared.smSamariumElementOriginContext",
  "It lets Helix connect samarium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectSamariumToNucleosynthesisObservableSpectralOr",
  "samarium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.samariumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "samarium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.samariumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.lanthanidesAndHeavyElementsThroughGoldAreRepresentedAsMixed",
  "samarium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.samariumElementOriginBadgeIsDiagnosticContextNotAProof",
  "samarium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.samariumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "samarium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.samariumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Eu europium Element-Origin Context": "theoryBadgeGraph.shared.euEuropiumElementOriginContext",
  "It lets Helix connect europium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectEuropiumToNucleosynthesisObservableSpectralOr",
  "europium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.europiumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "europium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.europiumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "europium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.europiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "europium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.europiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "europium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.europiumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Gd gadolinium Element-Origin Context": "theoryBadgeGraph.shared.gdGadoliniumElementOriginContext",
  "It lets Helix connect gadolinium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectGadoliniumToNucleosynthesisObservableSpectralOr",
  "gadolinium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.gadoliniumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "gadolinium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.gadoliniumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "gadolinium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.gadoliniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "gadolinium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.gadoliniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "gadolinium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.gadoliniumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Tb terbium Element-Origin Context": "theoryBadgeGraph.shared.tbTerbiumElementOriginContext",
  "It lets Helix connect terbium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectTerbiumToNucleosynthesisObservableSpectralOr",
  "terbium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.terbiumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "terbium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.terbiumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "terbium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.terbiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "terbium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.terbiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "terbium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.terbiumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Dy dysprosium Element-Origin Context": "theoryBadgeGraph.shared.dyDysprosiumElementOriginContext",
  "It lets Helix connect dysprosium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectDysprosiumToNucleosynthesisObservableSpectralOr",
  "dysprosium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.dysprosiumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "dysprosium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.dysprosiumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "dysprosium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.dysprosiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "dysprosium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.dysprosiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "dysprosium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.dysprosiumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Ho holmium Element-Origin Context": "theoryBadgeGraph.shared.hoHolmiumElementOriginContext",
  "It lets Helix connect holmium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectHolmiumToNucleosynthesisObservableSpectralOr",
  "holmium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.holmiumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "holmium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.holmiumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "holmium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.holmiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "holmium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.holmiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "holmium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.holmiumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Er erbium Element-Origin Context": "theoryBadgeGraph.shared.erErbiumElementOriginContext",
  "It lets Helix connect erbium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectErbiumToNucleosynthesisObservableSpectralOr",
  "erbium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.erbiumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "erbium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.erbiumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "erbium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.erbiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "erbium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.erbiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "erbium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.erbiumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Tm thulium Element-Origin Context": "theoryBadgeGraph.shared.tmThuliumElementOriginContext",
  "It lets Helix connect thulium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectThuliumToNucleosynthesisObservableSpectralOr",
  "thulium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.thuliumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "thulium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.thuliumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "thulium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.thuliumElementOriginBadgeIsDiagnosticContextNotAProof",
  "thulium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.thuliumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "thulium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.thuliumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Yb ytterbium Element-Origin Context": "theoryBadgeGraph.shared.ybYtterbiumElementOriginContext",
  "It lets Helix connect ytterbium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectYtterbiumToNucleosynthesisObservableSpectralOr",
  "ytterbium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.ytterbiumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "ytterbium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.ytterbiumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "ytterbium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.ytterbiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "ytterbium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.ytterbiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "ytterbium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.ytterbiumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Lu lutetium Element-Origin Context": "theoryBadgeGraph.shared.luLutetiumElementOriginContext",
  "It lets Helix connect lutetium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectLutetiumToNucleosynthesisObservableSpectralOr",
  "lutetium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.lutetiumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "lutetium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.lutetiumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "lutetium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.lutetiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "lutetium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.lutetiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "lutetium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.lutetiumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Hf hafnium Element-Origin Context": "theoryBadgeGraph.shared.hfHafniumElementOriginContext",
  "It lets Helix connect hafnium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectHafniumToNucleosynthesisObservableSpectralOr",
  "hafnium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.hafniumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "hafnium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.hafniumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "hafnium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.hafniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "hafnium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.hafniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "hafnium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.hafniumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Ta tantalum Element-Origin Context": "theoryBadgeGraph.shared.taTantalumElementOriginContext",
  "It lets Helix connect tantalum to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectTantalumToNucleosynthesisObservableSpectralOr",
  "tantalum origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.tantalumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "tantalum origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.tantalumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "tantalum: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.tantalumElementOriginBadgeIsDiagnosticContextNotAProof",
  "tantalum: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.tantalumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "tantalum: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.tantalumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "W tungsten Element-Origin Context": "theoryBadgeGraph.shared.wTungstenElementOriginContext",
  "It lets Helix connect tungsten to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectTungstenToNucleosynthesisObservableSpectralOr",
  "tungsten origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.tungstenOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "tungsten origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.tungstenOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "tungsten: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.tungstenElementOriginBadgeIsDiagnosticContextNotAProof",
  "tungsten: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.tungstenObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "tungsten: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.tungstenLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Re rhenium Element-Origin Context": "theoryBadgeGraph.shared.reRheniumElementOriginContext",
  "It lets Helix connect rhenium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectRheniumToNucleosynthesisObservableSpectralOr",
  "rhenium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.rheniumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "rhenium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.rheniumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "rhenium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.rheniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "rhenium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.rheniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "rhenium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.rheniumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Os osmium Element-Origin Context": "theoryBadgeGraph.shared.osOsmiumElementOriginContext",
  "It lets Helix connect osmium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectOsmiumToNucleosynthesisObservableSpectralOr",
  "osmium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.osmiumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "osmium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.osmiumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "osmium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.osmiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "osmium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.osmiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "osmium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.osmiumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Ir iridium Element-Origin Context": "theoryBadgeGraph.shared.irIridiumElementOriginContext",
  "It lets Helix connect iridium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectIridiumToNucleosynthesisObservableSpectralOr",
  "iridium origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.iridiumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "iridium origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.iridiumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "iridium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.iridiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "iridium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.iridiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "iridium: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.iridiumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Pt platinum Element-Origin Context": "theoryBadgeGraph.shared.ptPlatinumElementOriginContext",
  "It lets Helix connect platinum to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectPlatinumToNucleosynthesisObservableSpectralOr",
  "platinum origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.platinumOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "platinum origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.platinumOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "platinum: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.platinumElementOriginBadgeIsDiagnosticContextNotAProof",
  "platinum: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.platinumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "platinum: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.platinumLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Au gold Element-Origin Context": "theoryBadgeGraph.shared.auGoldElementOriginContext",
  "It lets Helix connect gold to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectGoldToNucleosynthesisObservableSpectralOr",
  "gold origin families: rapid neutron capture, slow neutron capture.": "theoryBadgeGraph.shared.goldOriginFamiliesRapidNeutronCaptureSlowNeutronCapture",
  "gold origin summary: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.goldOriginSummaryLanthanidesAndHeavyElementsThroughGoldAre",
  "gold: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.goldElementOriginBadgeIsDiagnosticContextNotAProof",
  "gold: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.goldObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "gold: Lanthanides and heavy elements through gold are represented as mixed neutron-capture context, with r-process and s-process weights depending on isotope and abundance pattern.": "theoryBadgeGraph.shared.goldLanthanidesAndHeavyElementsThroughGoldAreRepresentedAs",
  "Hg mercury Element-Origin Context": "theoryBadgeGraph.shared.hgMercuryElementOriginContext",
  "It lets Helix connect mercury to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectMercuryToNucleosynthesisObservableSpectralOr",
  "mercury origin families: slow neutron capture, rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.mercuryOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureRadioactive",
  "mercury origin summary: Mercury through bismuth are represented as heavy neutron-capture and decay-chain endpoint context at element-level resolution.": "theoryBadgeGraph.shared.mercuryOriginSummaryMercuryThroughBismuthAreRepresentedAsHeavy",
  "Mercury through bismuth are represented as heavy neutron-capture and decay-chain endpoint context at element-level resolution. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.mercuryThroughBismuthAreRepresentedAsHeavyNeutronCaptureAnd",
  "mercury: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.mercuryElementOriginBadgeIsDiagnosticContextNotAProof",
  "mercury: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.mercuryObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "mercury: Mercury through bismuth are represented as heavy neutron-capture and decay-chain endpoint context at element-level resolution.": "theoryBadgeGraph.shared.mercuryMercuryThroughBismuthAreRepresentedAsHeavyNeutronCapture",
  "Tl thallium Element-Origin Context": "theoryBadgeGraph.shared.tlThalliumElementOriginContext",
  "It lets Helix connect thallium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectThalliumToNucleosynthesisObservableSpectralOr",
  "thallium origin families: slow neutron capture, rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.thalliumOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureRadioactive",
  "thallium origin summary: Mercury through bismuth are represented as heavy neutron-capture and decay-chain endpoint context at element-level resolution.": "theoryBadgeGraph.shared.thalliumOriginSummaryMercuryThroughBismuthAreRepresentedAsHeavy",
  "thallium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.thalliumElementOriginBadgeIsDiagnosticContextNotAProof",
  "thallium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.thalliumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "thallium: Mercury through bismuth are represented as heavy neutron-capture and decay-chain endpoint context at element-level resolution.": "theoryBadgeGraph.shared.thalliumMercuryThroughBismuthAreRepresentedAsHeavyNeutronCapture",
  "Pb lead Element-Origin Context": "theoryBadgeGraph.shared.pbLeadElementOriginContext",
  "It lets Helix connect lead to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectLeadToNucleosynthesisObservableSpectralOr",
  "lead origin families: slow neutron capture, rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.leadOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureRadioactive",
  "lead origin summary: Mercury through bismuth are represented as heavy neutron-capture and decay-chain endpoint context at element-level resolution.": "theoryBadgeGraph.shared.leadOriginSummaryMercuryThroughBismuthAreRepresentedAsHeavy",
  "lead: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.leadElementOriginBadgeIsDiagnosticContextNotAProof",
  "lead: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.leadObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "lead: Mercury through bismuth are represented as heavy neutron-capture and decay-chain endpoint context at element-level resolution.": "theoryBadgeGraph.shared.leadMercuryThroughBismuthAreRepresentedAsHeavyNeutronCapture",
  "Bi bismuth Element-Origin Context": "theoryBadgeGraph.shared.biBismuthElementOriginContext",
  "It lets Helix connect bismuth to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectBismuthToNucleosynthesisObservableSpectralOr",
  "bismuth origin families: slow neutron capture, rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.bismuthOriginFamiliesSlowNeutronCaptureRapidNeutronCaptureRadioactive",
  "bismuth origin summary: Mercury through bismuth are represented as heavy neutron-capture and decay-chain endpoint context at element-level resolution.": "theoryBadgeGraph.shared.bismuthOriginSummaryMercuryThroughBismuthAreRepresentedAsHeavy",
  "bismuth: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.bismuthElementOriginBadgeIsDiagnosticContextNotAProof",
  "bismuth: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.bismuthObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "bismuth: Mercury through bismuth are represented as heavy neutron-capture and decay-chain endpoint context at element-level resolution.": "theoryBadgeGraph.shared.bismuthMercuryThroughBismuthAreRepresentedAsHeavyNeutronCapture",
  "Po polonium Element-Origin Context": "theoryBadgeGraph.shared.poPoloniumElementOriginContext",
  "It lets Helix connect polonium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectPoloniumToNucleosynthesisObservableSpectralOr",
  "polonium origin families: rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.poloniumOriginFamiliesRapidNeutronCaptureRadioactiveDecayChainInheritance",
  "polonium origin summary: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.poloniumOriginSummaryPoloniumThroughUraniumAreRepresentedAsActinide",
  "Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.poloniumThroughUraniumAreRepresentedAsActinideSideRProcess",
  "polonium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.poloniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "polonium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.poloniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "polonium: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.poloniumPoloniumThroughUraniumAreRepresentedAsActinideSideR",
  "At astatine Element-Origin Context": "theoryBadgeGraph.shared.atAstatineElementOriginContext",
  "It lets Helix connect astatine to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectAstatineToNucleosynthesisObservableSpectralOr",
  "astatine origin families: rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.astatineOriginFamiliesRapidNeutronCaptureRadioactiveDecayChainInheritance",
  "astatine origin summary: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.astatineOriginSummaryPoloniumThroughUraniumAreRepresentedAsActinide",
  "astatine: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.astatineElementOriginBadgeIsDiagnosticContextNotAProof",
  "astatine: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.astatineObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "astatine: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.astatinePoloniumThroughUraniumAreRepresentedAsActinideSideR",
  "Rn radon Element-Origin Context": "theoryBadgeGraph.shared.rnRadonElementOriginContext",
  "It lets Helix connect radon to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectRadonToNucleosynthesisObservableSpectralOr",
  "radon origin families: rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.radonOriginFamiliesRapidNeutronCaptureRadioactiveDecayChainInheritance",
  "radon origin summary: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.radonOriginSummaryPoloniumThroughUraniumAreRepresentedAsActinide",
  "radon: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.radonElementOriginBadgeIsDiagnosticContextNotAProof",
  "radon: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.radonObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "radon: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.radonPoloniumThroughUraniumAreRepresentedAsActinideSideR",
  "Fr francium Element-Origin Context": "theoryBadgeGraph.shared.frFranciumElementOriginContext",
  "It lets Helix connect francium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectFranciumToNucleosynthesisObservableSpectralOr",
  "francium origin families: rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.franciumOriginFamiliesRapidNeutronCaptureRadioactiveDecayChainInheritance",
  "francium origin summary: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.franciumOriginSummaryPoloniumThroughUraniumAreRepresentedAsActinide",
  "francium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.franciumElementOriginBadgeIsDiagnosticContextNotAProof",
  "francium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.franciumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "francium: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.franciumPoloniumThroughUraniumAreRepresentedAsActinideSideR",
  "Ra radium Element-Origin Context": "theoryBadgeGraph.shared.raRadiumElementOriginContext",
  "It lets Helix connect radium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectRadiumToNucleosynthesisObservableSpectralOr",
  "radium origin families: rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.radiumOriginFamiliesRapidNeutronCaptureRadioactiveDecayChainInheritance",
  "radium origin summary: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.radiumOriginSummaryPoloniumThroughUraniumAreRepresentedAsActinide",
  "radium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.radiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "radium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.radiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "radium: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.radiumPoloniumThroughUraniumAreRepresentedAsActinideSideR",
  "Ac actinium Element-Origin Context": "theoryBadgeGraph.shared.acActiniumElementOriginContext",
  "It lets Helix connect actinium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectActiniumToNucleosynthesisObservableSpectralOr",
  "actinium origin families: rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.actiniumOriginFamiliesRapidNeutronCaptureRadioactiveDecayChainInheritance",
  "actinium origin summary: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.actiniumOriginSummaryPoloniumThroughUraniumAreRepresentedAsActinide",
  "actinium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.actiniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "actinium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.actiniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "actinium: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.actiniumPoloniumThroughUraniumAreRepresentedAsActinideSideR",
  "Th thorium Element-Origin Context": "theoryBadgeGraph.shared.thThoriumElementOriginContext",
  "It lets Helix connect thorium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectThoriumToNucleosynthesisObservableSpectralOr",
  "thorium origin families: rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.thoriumOriginFamiliesRapidNeutronCaptureRadioactiveDecayChainInheritance",
  "thorium origin summary: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.thoriumOriginSummaryPoloniumThroughUraniumAreRepresentedAsActinide",
  "thorium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.thoriumElementOriginBadgeIsDiagnosticContextNotAProof",
  "thorium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.thoriumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "thorium: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.thoriumPoloniumThroughUraniumAreRepresentedAsActinideSideR",
  "Pa protactinium Element-Origin Context": "theoryBadgeGraph.shared.paProtactiniumElementOriginContext",
  "It lets Helix connect protactinium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectProtactiniumToNucleosynthesisObservableSpectralOr",
  "protactinium origin families: rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.protactiniumOriginFamiliesRapidNeutronCaptureRadioactiveDecayChainInheritance",
  "protactinium origin summary: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.protactiniumOriginSummaryPoloniumThroughUraniumAreRepresentedAsActinide",
  "protactinium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.protactiniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "protactinium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.protactiniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "protactinium: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.protactiniumPoloniumThroughUraniumAreRepresentedAsActinideSideR",
  "U uranium Element-Origin Context": "theoryBadgeGraph.shared.uUraniumElementOriginContext",
  "It lets Helix connect uranium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectUraniumToNucleosynthesisObservableSpectralOr",
  "uranium origin families: rapid neutron capture, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.uraniumOriginFamiliesRapidNeutronCaptureRadioactiveDecayChainInheritance",
  "uranium origin summary: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.uraniumOriginSummaryPoloniumThroughUraniumAreRepresentedAsActinide",
  "uranium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.uraniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "uranium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.uraniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "uranium: Polonium through uranium are represented as actinide-side r-process inheritance and radioactive decay-chain context.": "theoryBadgeGraph.shared.uraniumPoloniumThroughUraniumAreRepresentedAsActinideSideR",
  "Np neptunium Element-Origin Context": "theoryBadgeGraph.shared.npNeptuniumElementOriginContext",
  "It lets Helix connect neptunium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectNeptuniumToNucleosynthesisObservableSpectralOr",
  "neptunium origin families: laboratory synthesis, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.neptuniumOriginFamiliesLaboratorySynthesisRadioactiveDecayChainInheritance",
  "neptunium origin summary: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.neptuniumOriginSummaryNeptuniumThroughLawrenciumAreRepresentedAsLaboratory",
  "Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.neptuniumThroughLawrenciumAreRepresentedAsLaboratoryActinideRadioactiveChain",
  "neptunium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.neptuniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "neptunium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.neptuniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "neptunium: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.neptuniumNeptuniumThroughLawrenciumAreRepresentedAsLaboratoryActinideRadioactive",
  "neptunium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.neptuniumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Pu plutonium Element-Origin Context": "theoryBadgeGraph.shared.puPlutoniumElementOriginContext",
  "It lets Helix connect plutonium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectPlutoniumToNucleosynthesisObservableSpectralOr",
  "plutonium origin families: laboratory synthesis, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.plutoniumOriginFamiliesLaboratorySynthesisRadioactiveDecayChainInheritance",
  "plutonium origin summary: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.plutoniumOriginSummaryNeptuniumThroughLawrenciumAreRepresentedAsLaboratory",
  "plutonium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.plutoniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "plutonium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.plutoniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "plutonium: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.plutoniumNeptuniumThroughLawrenciumAreRepresentedAsLaboratoryActinideRadioactive",
  "plutonium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.plutoniumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Am americium Element-Origin Context": "theoryBadgeGraph.shared.amAmericiumElementOriginContext",
  "It lets Helix connect americium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectAmericiumToNucleosynthesisObservableSpectralOr",
  "americium origin families: laboratory synthesis, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.americiumOriginFamiliesLaboratorySynthesisRadioactiveDecayChainInheritance",
  "americium origin summary: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.americiumOriginSummaryNeptuniumThroughLawrenciumAreRepresentedAsLaboratory",
  "americium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.americiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "americium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.americiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "americium: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.americiumNeptuniumThroughLawrenciumAreRepresentedAsLaboratoryActinideRadioactive",
  "americium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.americiumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Cm curium Element-Origin Context": "theoryBadgeGraph.shared.cmCuriumElementOriginContext",
  "It lets Helix connect curium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectCuriumToNucleosynthesisObservableSpectralOr",
  "curium origin families: laboratory synthesis, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.curiumOriginFamiliesLaboratorySynthesisRadioactiveDecayChainInheritance",
  "curium origin summary: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.curiumOriginSummaryNeptuniumThroughLawrenciumAreRepresentedAsLaboratory",
  "curium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.curiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "curium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.curiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "curium: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.curiumNeptuniumThroughLawrenciumAreRepresentedAsLaboratoryActinideRadioactive",
  "curium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.curiumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Bk berkelium Element-Origin Context": "theoryBadgeGraph.shared.bkBerkeliumElementOriginContext",
  "It lets Helix connect berkelium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectBerkeliumToNucleosynthesisObservableSpectralOr",
  "berkelium origin families: laboratory synthesis, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.berkeliumOriginFamiliesLaboratorySynthesisRadioactiveDecayChainInheritance",
  "berkelium origin summary: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.berkeliumOriginSummaryNeptuniumThroughLawrenciumAreRepresentedAsLaboratory",
  "berkelium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.berkeliumElementOriginBadgeIsDiagnosticContextNotAProof",
  "berkelium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.berkeliumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "berkelium: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.berkeliumNeptuniumThroughLawrenciumAreRepresentedAsLaboratoryActinideRadioactive",
  "berkelium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.berkeliumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Cf californium Element-Origin Context": "theoryBadgeGraph.shared.cfCaliforniumElementOriginContext",
  "It lets Helix connect californium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectCaliforniumToNucleosynthesisObservableSpectralOr",
  "californium origin families: laboratory synthesis, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.californiumOriginFamiliesLaboratorySynthesisRadioactiveDecayChainInheritance",
  "californium origin summary: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.californiumOriginSummaryNeptuniumThroughLawrenciumAreRepresentedAsLaboratory",
  "californium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.californiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "californium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.californiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "californium: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.californiumNeptuniumThroughLawrenciumAreRepresentedAsLaboratoryActinideRadioactive",
  "californium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.californiumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Es einsteinium Element-Origin Context": "theoryBadgeGraph.shared.esEinsteiniumElementOriginContext",
  "It lets Helix connect einsteinium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectEinsteiniumToNucleosynthesisObservableSpectralOr",
  "einsteinium origin families: laboratory synthesis, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.einsteiniumOriginFamiliesLaboratorySynthesisRadioactiveDecayChainInheritance",
  "einsteinium origin summary: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.einsteiniumOriginSummaryNeptuniumThroughLawrenciumAreRepresentedAsLaboratory",
  "einsteinium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.einsteiniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "einsteinium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.einsteiniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "einsteinium: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.einsteiniumNeptuniumThroughLawrenciumAreRepresentedAsLaboratoryActinideRadioactive",
  "einsteinium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.einsteiniumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Fm fermium Element-Origin Context": "theoryBadgeGraph.shared.fmFermiumElementOriginContext",
  "It lets Helix connect fermium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectFermiumToNucleosynthesisObservableSpectralOr",
  "fermium origin families: laboratory synthesis, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.fermiumOriginFamiliesLaboratorySynthesisRadioactiveDecayChainInheritance",
  "fermium origin summary: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.fermiumOriginSummaryNeptuniumThroughLawrenciumAreRepresentedAsLaboratory",
  "fermium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.fermiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "fermium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.fermiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "fermium: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.fermiumNeptuniumThroughLawrenciumAreRepresentedAsLaboratoryActinideRadioactive",
  "fermium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.fermiumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Md mendelevium Element-Origin Context": "theoryBadgeGraph.shared.mdMendeleviumElementOriginContext",
  "It lets Helix connect mendelevium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectMendeleviumToNucleosynthesisObservableSpectralOr",
  "mendelevium origin families: laboratory synthesis, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.mendeleviumOriginFamiliesLaboratorySynthesisRadioactiveDecayChainInheritance",
  "mendelevium origin summary: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.mendeleviumOriginSummaryNeptuniumThroughLawrenciumAreRepresentedAsLaboratory",
  "mendelevium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.mendeleviumElementOriginBadgeIsDiagnosticContextNotAProof",
  "mendelevium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.mendeleviumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "mendelevium: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.mendeleviumNeptuniumThroughLawrenciumAreRepresentedAsLaboratoryActinideRadioactive",
  "mendelevium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.mendeleviumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "No nobelium Element-Origin Context": "theoryBadgeGraph.shared.noNobeliumElementOriginContext",
  "It lets Helix connect nobelium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectNobeliumToNucleosynthesisObservableSpectralOr",
  "nobelium origin families: laboratory synthesis, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.nobeliumOriginFamiliesLaboratorySynthesisRadioactiveDecayChainInheritance",
  "nobelium origin summary: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.nobeliumOriginSummaryNeptuniumThroughLawrenciumAreRepresentedAsLaboratory",
  "nobelium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.nobeliumElementOriginBadgeIsDiagnosticContextNotAProof",
  "nobelium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.nobeliumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "nobelium: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.nobeliumNeptuniumThroughLawrenciumAreRepresentedAsLaboratoryActinideRadioactive",
  "nobelium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.nobeliumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Lr lawrencium Element-Origin Context": "theoryBadgeGraph.shared.lrLawrenciumElementOriginContext",
  "It lets Helix connect lawrencium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectLawrenciumToNucleosynthesisObservableSpectralOr",
  "lawrencium origin families: laboratory synthesis, radioactive decay-chain inheritance.": "theoryBadgeGraph.shared.lawrenciumOriginFamiliesLaboratorySynthesisRadioactiveDecayChainInheritance",
  "lawrencium origin summary: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.lawrenciumOriginSummaryNeptuniumThroughLawrenciumAreRepresentedAsLaboratory",
  "lawrencium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.lawrenciumElementOriginBadgeIsDiagnosticContextNotAProof",
  "lawrencium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.lawrenciumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "lawrencium: Neptunium through lawrencium are represented as laboratory/actinide radioactive-chain context at graph level, with natural trace claims requiring separate evidence.": "theoryBadgeGraph.shared.lawrenciumNeptuniumThroughLawrenciumAreRepresentedAsLaboratoryActinideRadioactive",
  "lawrencium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.lawrenciumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Rf rutherfordium Element-Origin Context": "theoryBadgeGraph.shared.rfRutherfordiumElementOriginContext",
  "It lets Helix connect rutherfordium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectRutherfordiumToNucleosynthesisObservableSpectralOr",
  "rutherfordium origin families: laboratory synthesis.": "theoryBadgeGraph.shared.rutherfordiumOriginFamiliesLaboratorySynthesis",
  "rutherfordium origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.rutherfordiumOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory. Observable support should come from atomic spectra, abundance patterns, isotopic ratios, sample inventory, or laboratory decay-chain evidence.": "theoryBadgeGraph.shared.transactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAndDecay",
  "rutherfordium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.rutherfordiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "rutherfordium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.rutherfordiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "rutherfordium: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.rutherfordiumTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "rutherfordium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.rutherfordiumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Db dubnium Element-Origin Context": "theoryBadgeGraph.shared.dbDubniumElementOriginContext",
  "It lets Helix connect dubnium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectDubniumToNucleosynthesisObservableSpectralOr",
  "dubnium origin families: laboratory synthesis.": "theoryBadgeGraph.shared.dubniumOriginFamiliesLaboratorySynthesis",
  "dubnium origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.dubniumOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "dubnium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.dubniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "dubnium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.dubniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "dubnium: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.dubniumTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "dubnium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.dubniumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Sg seaborgium Element-Origin Context": "theoryBadgeGraph.shared.sgSeaborgiumElementOriginContext",
  "It lets Helix connect seaborgium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectSeaborgiumToNucleosynthesisObservableSpectralOr",
  "seaborgium origin families: laboratory synthesis.": "theoryBadgeGraph.shared.seaborgiumOriginFamiliesLaboratorySynthesis",
  "seaborgium origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.seaborgiumOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "seaborgium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.seaborgiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "seaborgium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.seaborgiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "seaborgium: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.seaborgiumTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "seaborgium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.seaborgiumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Bh bohrium Element-Origin Context": "theoryBadgeGraph.shared.bhBohriumElementOriginContext",
  "It lets Helix connect bohrium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectBohriumToNucleosynthesisObservableSpectralOr",
  "bohrium origin families: laboratory synthesis.": "theoryBadgeGraph.shared.bohriumOriginFamiliesLaboratorySynthesis",
  "bohrium origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.bohriumOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "bohrium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.bohriumElementOriginBadgeIsDiagnosticContextNotAProof",
  "bohrium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.bohriumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "bohrium: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.bohriumTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "bohrium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.bohriumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Hs hassium Element-Origin Context": "theoryBadgeGraph.shared.hsHassiumElementOriginContext",
  "It lets Helix connect hassium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectHassiumToNucleosynthesisObservableSpectralOr",
  "hassium origin families: laboratory synthesis.": "theoryBadgeGraph.shared.hassiumOriginFamiliesLaboratorySynthesis",
  "hassium origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.hassiumOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "hassium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.hassiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "hassium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.hassiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "hassium: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.hassiumTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "hassium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.hassiumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Mt meitnerium Element-Origin Context": "theoryBadgeGraph.shared.mtMeitneriumElementOriginContext",
  "It lets Helix connect meitnerium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectMeitneriumToNucleosynthesisObservableSpectralOr",
  "meitnerium origin families: laboratory synthesis.": "theoryBadgeGraph.shared.meitneriumOriginFamiliesLaboratorySynthesis",
  "meitnerium origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.meitneriumOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "meitnerium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.meitneriumElementOriginBadgeIsDiagnosticContextNotAProof",
  "meitnerium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.meitneriumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "meitnerium: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.meitneriumTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "meitnerium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.meitneriumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Ds darmstadtium Element-Origin Context": "theoryBadgeGraph.shared.dsDarmstadtiumElementOriginContext",
  "It lets Helix connect darmstadtium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectDarmstadtiumToNucleosynthesisObservableSpectralOr",
  "darmstadtium origin families: laboratory synthesis.": "theoryBadgeGraph.shared.darmstadtiumOriginFamiliesLaboratorySynthesis",
  "darmstadtium origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.darmstadtiumOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "darmstadtium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.darmstadtiumElementOriginBadgeIsDiagnosticContextNotAProof",
  "darmstadtium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.darmstadtiumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "darmstadtium: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.darmstadtiumTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "darmstadtium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.darmstadtiumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Rg roentgenium Element-Origin Context": "theoryBadgeGraph.shared.rgRoentgeniumElementOriginContext",
  "It lets Helix connect roentgenium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectRoentgeniumToNucleosynthesisObservableSpectralOr",
  "roentgenium origin families: laboratory synthesis.": "theoryBadgeGraph.shared.roentgeniumOriginFamiliesLaboratorySynthesis",
  "roentgenium origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.roentgeniumOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "roentgenium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.roentgeniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "roentgenium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.roentgeniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "roentgenium: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.roentgeniumTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "roentgenium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.roentgeniumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Cn copernicium Element-Origin Context": "theoryBadgeGraph.shared.cnCoperniciumElementOriginContext",
  "It lets Helix connect copernicium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectCoperniciumToNucleosynthesisObservableSpectralOr",
  "copernicium origin families: laboratory synthesis.": "theoryBadgeGraph.shared.coperniciumOriginFamiliesLaboratorySynthesis",
  "copernicium origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.coperniciumOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "copernicium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.coperniciumElementOriginBadgeIsDiagnosticContextNotAProof",
  "copernicium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.coperniciumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "copernicium: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.coperniciumTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "copernicium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.coperniciumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Nh nihonium Element-Origin Context": "theoryBadgeGraph.shared.nhNihoniumElementOriginContext",
  "It lets Helix connect nihonium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectNihoniumToNucleosynthesisObservableSpectralOr",
  "nihonium origin families: laboratory synthesis.": "theoryBadgeGraph.shared.nihoniumOriginFamiliesLaboratorySynthesis",
  "nihonium origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.nihoniumOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "nihonium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.nihoniumElementOriginBadgeIsDiagnosticContextNotAProof",
  "nihonium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.nihoniumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "nihonium: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.nihoniumTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "nihonium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.nihoniumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Fl flerovium Element-Origin Context": "theoryBadgeGraph.shared.flFleroviumElementOriginContext",
  "It lets Helix connect flerovium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectFleroviumToNucleosynthesisObservableSpectralOr",
  "flerovium origin families: laboratory synthesis.": "theoryBadgeGraph.shared.fleroviumOriginFamiliesLaboratorySynthesis",
  "flerovium origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.fleroviumOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "flerovium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.fleroviumElementOriginBadgeIsDiagnosticContextNotAProof",
  "flerovium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.fleroviumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "flerovium: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.fleroviumTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "flerovium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.fleroviumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Mc moscovium Element-Origin Context": "theoryBadgeGraph.shared.mcMoscoviumElementOriginContext",
  "It lets Helix connect moscovium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectMoscoviumToNucleosynthesisObservableSpectralOr",
  "moscovium origin families: laboratory synthesis.": "theoryBadgeGraph.shared.moscoviumOriginFamiliesLaboratorySynthesis",
  "moscovium origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.moscoviumOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "moscovium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.moscoviumElementOriginBadgeIsDiagnosticContextNotAProof",
  "moscovium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.moscoviumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "moscovium: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.moscoviumTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "moscovium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.moscoviumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Lv livermorium Element-Origin Context": "theoryBadgeGraph.shared.lvLivermoriumElementOriginContext",
  "It lets Helix connect livermorium to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectLivermoriumToNucleosynthesisObservableSpectralOr",
  "livermorium origin families: laboratory synthesis.": "theoryBadgeGraph.shared.livermoriumOriginFamiliesLaboratorySynthesis",
  "livermorium origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.livermoriumOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "livermorium: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.livermoriumElementOriginBadgeIsDiagnosticContextNotAProof",
  "livermorium: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.livermoriumObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "livermorium: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.livermoriumTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "livermorium: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.livermoriumSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Ts tennessine Element-Origin Context": "theoryBadgeGraph.shared.tsTennessineElementOriginContext",
  "It lets Helix connect tennessine to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectTennessineToNucleosynthesisObservableSpectralOr",
  "tennessine origin families: laboratory synthesis.": "theoryBadgeGraph.shared.tennessineOriginFamiliesLaboratorySynthesis",
  "tennessine origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.tennessineOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "tennessine: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.tennessineElementOriginBadgeIsDiagnosticContextNotAProof",
  "tennessine: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.tennessineObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "tennessine: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.tennessineTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "tennessine: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.tennessineSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Og oganesson Element-Origin Context": "theoryBadgeGraph.shared.ogOganessonElementOriginContext",
  "It lets Helix connect oganesson to nucleosynthesis, observable spectral or abundance routes, and downstream chemistry without overclaiming.": "theoryBadgeGraph.shared.itLetsHelixConnectOganessonToNucleosynthesisObservableSpectralOr",
  "oganesson origin families: laboratory synthesis.": "theoryBadgeGraph.shared.oganessonOriginFamiliesLaboratorySynthesis",
  "oganesson origin summary: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.oganessonOriginSummaryTransactinideSuperheavyElementsAreRepresentedAsLaboratory",
  "oganesson: element-origin badge is diagnostic context, not a proof of molecular formation or life.": "theoryBadgeGraph.shared.oganessonElementOriginBadgeIsDiagnosticContextNotAProof",
  "oganesson: observable identification requires spectral, abundance, isotopic, sample, or laboratory evidence.": "theoryBadgeGraph.shared.oganessonObservableIdentificationRequiresSpectralAbundanceIsotopicSampleOrLaboratory",
  "oganesson: Transactinide superheavy elements are represented as laboratory synthesis and decay-chain identification context, not naturally abundant astrophysical inventory.": "theoryBadgeGraph.shared.oganessonTransactinideSuperheavyElementsAreRepresentedAsLaboratorySynthesisAnd",
  "oganesson: superheavy element context is laboratory synthesis unless a source explicitly supports otherwise.": "theoryBadgeGraph.shared.oganessonSuperheavyElementContextIsLaboratorySynthesisUnlessASource",
  "Composition Identity Across Phases": "theoryBadgeGraph.shared.compositionIdentityAcrossPhases",
  "Represents the rule that an element or molecule can persist across ordinary phase changes while its arrangement changes.": "theoryBadgeGraph.shared.representsTheRuleThatAnElementOrMoleculeCanPersist",
  "It keeps identity, phase, and structure separate so phase badges do not accidentally become chemical or nuclear reaction claims.": "theoryBadgeGraph.shared.itKeepsIdentityPhaseAndStructureSeparateSoPhaseBadges",
  "Ordinary phase changes preserve composition identity unless a chemical reaction, ionization, dissociation, isotope change, or nuclear reaction is admitted as separate evidence.": "theoryBadgeGraph.shared.ordinaryPhaseChangesPreserveCompositionIdentityUnlessAChemicalReaction",
  "Element-origin badges provide composition context, not a phase, structure, or density solve.": "theoryBadgeGraph.shared.elementOriginBadgesProvideCompositionContextNotAPhaseStructure",
  "Thermodynamic State Phase Context": "theoryBadgeGraph.shared.thermodynamicStatePhaseContext",
  "Represents phase as a condition-dependent state selected by temperature, pressure, composition, and relevant intensive variables.": "theoryBadgeGraph.shared.representsPhaseAsAConditionDependentStateSelectedByTemperature",
  "It lets Helix ask for temperature and pressure conditions before assigning solid, liquid, gas, plasma, supercritical, or mixed-state meaning.": "theoryBadgeGraph.shared.itLetsHelixAskForTemperatureAndPressureConditionsBefore",
  "A phase label is condition-dependent and may require an equilibrium model, phase diagram, or measured state table.": "theoryBadgeGraph.shared.aPhaseLabelIsConditionDependentAndMayRequireAn",
  "Temperature and pressure constrain phase; they do not alone determine molecular structure for every material without composition and boundary context.": "theoryBadgeGraph.shared.temperatureAndPressureConstrainPhaseTheyDoNotAloneDetermine",
  "Equation-Of-State Density Context": "theoryBadgeGraph.shared.equationOfStateDensityContext",
  "Represents bulk density as a condition-dependent property from an equation of state, measured table, or simulation receipt.": "theoryBadgeGraph.shared.representsBulkDensityAsAConditionDependentPropertyFromAn",
  "It blocks the unsafe shortcut from quantum frequency or rest energy directly to phase density without EOS or structural evidence.": "theoryBadgeGraph.shared.itBlocksTheUnsafeShortcutFromQuantumFrequencyOrRest",
  "Bulk density is selected by EOS, measured table, or simulation evidence under a declared validity range.": "theoryBadgeGraph.shared.bulkDensityIsSelectedByEosMeasuredTableOrSimulation",
  "Mass-energy equivalence can map mass density into rest-energy density only after mass density and volume context are established.": "theoryBadgeGraph.shared.massEnergyEquivalenceCanMapMassDensityIntoRestEnergy",
  "Quantum frequency observables do not by themselves determine bulk density or phase.": "theoryBadgeGraph.shared.quantumFrequencyObservablesDoNotByThemselvesDetermineBulkDensity",
  "Phase Structural Order Context": "theoryBadgeGraph.shared.phaseStructuralOrderContext",
  "Represents molecular or atomic arrangement through lattice, amorphous, radial-distribution, coordination, or ionization descriptors.": "theoryBadgeGraph.shared.representsMolecularOrAtomicArrangementThroughLatticeAmorphousRadialDistribution",
  "It makes the structure change explicit while preserving the distinction between composition identity and phase-conditioned arrangement.": "theoryBadgeGraph.shared.itMakesTheStructureChangeExplicitWhilePreservingTheDistinction",
  "Structure descriptors are evidence-conditioned and may come from diffraction, scattering, spectroscopy, microscopy, or simulation.": "theoryBadgeGraph.shared.structureDescriptorsAreEvidenceConditionedAndMayComeFromDiffraction",
  "A phase label alone is not a complete molecular-structure description.": "theoryBadgeGraph.shared.aPhaseLabelAloneIsNotACompleteMolecularStructure",
  "Dynamical Order Context": "theoryBadgeGraph.shared.dynamicalOrderContext",
  "Represents ordered behavior in time through correlation functions, driven response, synchronization, or long-lived non-equilibrium dynamics.": "theoryBadgeGraph.shared.representsOrderedBehaviorInTimeThroughCorrelationFunctionsDrivenResponse",
  "It extends phase structure from spatial arrangement into temporal ordering without treating every oscillation as a phase of matter.": "theoryBadgeGraph.shared.itExtendsPhaseStructureFromSpatialArrangementIntoTemporalOrdering",
  "Dynamical order requires time-correlation or response evidence, not only visual periodicity.": "theoryBadgeGraph.shared.dynamicalOrderRequiresTimeCorrelationOrResponseEvidenceNotOnly",
  "Non-equilibrium order must name the drive, coupling, dissipation, disorder, measurement, and stability context when those are relevant.": "theoryBadgeGraph.shared.nonEquilibriumOrderMustNameTheDriveCouplingDissipationDisorder",
  "Time-Translation Symmetry Context": "theoryBadgeGraph.shared.timeTranslationSymmetryContext",
  "Represents time-crystal questions as symmetry-breaking questions about continuous or discrete time translations.": "theoryBadgeGraph.shared.representsTimeCrystalQuestionsAsSymmetryBreakingQuestionsAboutContinuous",
  "It separates the symmetry criterion from platform details such as ions, spins, cavities, or material density.": "theoryBadgeGraph.shared.itSeparatesTheSymmetryCriterionFromPlatformDetailsSuchAs",
  "A time-crystal claim must identify the time-translation symmetry being considered.": "theoryBadgeGraph.shared.aTimeCrystalClaimMustIdentifyTheTimeTranslationSymmetry",
  "Discrete and continuous time-translation cases have different admissibility boundaries.": "theoryBadgeGraph.shared.discreteAndContinuousTimeTranslationCasesHaveDifferentAdmissibilityBoundaries",
  "Equilibrium Time-Crystal Claim Context": "theoryBadgeGraph.shared.equilibriumTimeCrystalClaimContext",
  "Represents claims that a ground-state or canonical-equilibrium Hamiltonian system has time-crystalline order.": "theoryBadgeGraph.shared.representsClaimsThatAGroundStateOrCanonicalEquilibriumHamiltonian",
  "It gives the graph a concrete target for the no-go theorem to block before stronger time-crystal language is admitted.": "theoryBadgeGraph.shared.itGivesTheGraphAConcreteTargetForTheNo",
  "This badge is a blocked claim target, not an accepted phase badge.": "theoryBadgeGraph.shared.thisBadgeIsABlockedClaimTargetNotAnAccepted",
  "Equilibrium claims require explicit handling of the Watanabe-Oshikawa no-go boundary.": "theoryBadgeGraph.shared.equilibriumClaimsRequireExplicitHandlingOfTheWatanabeOshikawaNo",
  "Equilibrium Time-Crystal No-Go Boundary": "theoryBadgeGraph.shared.equilibriumTimeCrystalNoGoBoundary",
  "Represents the no-go result that rules out ordinary equilibrium time-crystal order for broad Hamiltonian systems with not-too-long-range interactions.": "theoryBadgeGraph.shared.representsTheNoGoResultThatRulesOutOrdinaryEquilibrium",
  "It prevents the graph from promoting historical equilibrium proposals into accepted phase claims.": "theoryBadgeGraph.shared.itPreventsTheGraphFromPromotingHistoricalEquilibriumProposalsInto",
  "The no-go boundary applies to ground-state and canonical-equilibrium claims under the stated Hamiltonian assumptions.": "theoryBadgeGraph.shared.theNoGoBoundaryAppliesToGroundStateAndCanonical",
  "Driven, prethermal, and driven-dissipative time-crystal contexts must be represented separately.": "theoryBadgeGraph.shared.drivenPrethermalAndDrivenDissipativeTimeCrystalContextsMustBe",
  "Floquet Discrete Time-Crystal Context": "theoryBadgeGraph.shared.floquetDiscreteTimeCrystalContext",
  "Represents a periodically driven non-equilibrium phase with rigid subharmonic response relative to the drive period.": "theoryBadgeGraph.shared.representsAPeriodicallyDrivenNonEquilibriumPhaseWithRigidSubharmonic",
  "It encodes the accepted route where discrete time-translation symmetry can be broken without relying on an equilibrium ground-state claim.": "theoryBadgeGraph.shared.itEncodesTheAcceptedRouteWhereDiscreteTimeTranslationSymmetry",
  "A discrete time-crystal claim requires subharmonic response, rigidity against perturbations, and many-body stabilization evidence.": "theoryBadgeGraph.shared.aDiscreteTimeCrystalClaimRequiresSubharmonicResponseRigidityAgainst",
  "The periodic drive is part of the phase context and is not a contradiction of energy conservation.": "theoryBadgeGraph.shared.thePeriodicDriveIsPartOfThePhaseContextAnd",
  "Prethermal Discrete Time-Crystal Context": "theoryBadgeGraph.shared.prethermalDiscreteTimeCrystalContext",
  "Represents a long-lived non-equilibrium time-crystal regime stabilized for a finite prethermal window rather than by permanent equilibrium order.": "theoryBadgeGraph.shared.representsALongLivedNonEquilibriumTimeCrystalRegimeStabilized",
  "It distinguishes prethermal stabilization from many-body-localized or dissipative routes and keeps lifetime boundaries explicit.": "theoryBadgeGraph.shared.itDistinguishesPrethermalStabilizationFromManyBodyLocalizedOrDissipative",
  "Prethermal time-crystal evidence is lifetime-bounded and must report the stability window.": "theoryBadgeGraph.shared.prethermalTimeCrystalEvidenceIsLifetimeBoundedAndMustReport",
  "Initial-state energy density can condition prethermal behavior but does not define a time crystal by itself.": "theoryBadgeGraph.shared.initialStateEnergyDensityCanConditionPrethermalBehaviorButDoes",
  "Driven-Dissipative Continuous Time-Crystal Context": "theoryBadgeGraph.shared.drivenDissipativeContinuousTimeCrystalContext",
  "Represents continuous time-translation symmetry breaking in driven-dissipative systems, usually through robust limit-cycle order.": "theoryBadgeGraph.shared.representsContinuousTimeTranslationSymmetryBreakingInDrivenDissipativeSystems",
  "It keeps continuous time-crystal claims outside the equilibrium no-go route by requiring open-system drive and dissipation context.": "theoryBadgeGraph.shared.itKeepsContinuousTimeCrystalClaimsOutsideTheEquilibriumNo",
  "Continuous time-crystal claims require open-system drive, dissipation, spontaneous phase selection, and robustness evidence.": "theoryBadgeGraph.shared.continuousTimeCrystalClaimsRequireOpenSystemDriveDissipationSpontaneous",
  "A driven-dissipative limit cycle is not an equilibrium ground-state time-crystal claim.": "theoryBadgeGraph.shared.aDrivenDissipativeLimitCycleIsNotAnEquilibriumGround",
  "Time-Crystal Observable Signature Context": "theoryBadgeGraph.shared.timeCrystalObservableSignatureContext",
  "Represents evidence requirements such as subharmonic spectral peaks, long-lived time correlations, rigidity, and phase-boundary tests.": "theoryBadgeGraph.shared.representsEvidenceRequirementsSuchAsSubharmonicSpectralPeaksLongLived",
  "It prevents frequency observations or repeated oscillations from being treated as sufficient evidence on their own.": "theoryBadgeGraph.shared.itPreventsFrequencyObservationsOrRepeatedOscillationsFromBeingTreated",
  "A frequency peak is evidence only after mode assignment, drive comparison, stability testing, and perturbation checks.": "theoryBadgeGraph.shared.aFrequencyPeakIsEvidenceOnlyAfterModeAssignmentDrive",
  "Accepted time-crystal evidence should include subharmonic response or limit-cycle order plus robustness and phase-boundary context.": "theoryBadgeGraph.shared.acceptedTimeCrystalEvidenceShouldIncludeSubharmonicResponseOrLimit",
  "Time-Crystal Platform Parameter Context": "theoryBadgeGraph.shared.timeCrystalPlatformParameterContext",
  "Represents platform-specific conditions such as spin density, ion spacing, disorder, interaction strength, cavity pump, and dissipation.": "theoryBadgeGraph.shared.representsPlatformSpecificConditionsSuchAsSpinDensityIonSpacing",
  "It provides a weak place for density-like parameters without making density the defining criterion for time-crystalline order.": "theoryBadgeGraph.shared.itProvidesAWeakPlaceForDensityLikeParametersWithout",
  "Density-like parameters can affect an experimental platform but are not time-crystal order parameters by themselves.": "theoryBadgeGraph.shared.densityLikeParametersCanAffectAnExperimentalPlatformButAre",
  "Platform context must be paired with observable signature evidence before a time-crystal claim is admitted.": "theoryBadgeGraph.shared.platformContextMustBePairedWithObservableSignatureEvidenceBefore",
  "Time-Crystal Claim Boundary": "theoryBadgeGraph.shared.timeCrystalClaimBoundary",
  "Represents the guardrail that time-crystal language needs symmetry, non-equilibrium route, stability, and observable-signature evidence.": "theoryBadgeGraph.shared.representsTheGuardrailThatTimeCrystalLanguageNeedsSymmetryNon",
  "It blocks promotional or shortcut claims while still allowing grounded time-crystal evidence to enter the theory graph.": "theoryBadgeGraph.shared.itBlocksPromotionalOrShortcutClaimsWhileStillAllowingGrounded",
  "Repeated motion, frequency response, or platform density alone is insufficient for a time-crystal claim.": "theoryBadgeGraph.shared.repeatedMotionFrequencyResponseOrPlatformDensityAloneIsInsufficient",
  "Energy-conservation, work-extraction, and broad material-phase claims remain blocked unless the route-specific evidence explicitly admits them.": "theoryBadgeGraph.shared.energyConservationWorkExtractionAndBroadMaterialPhaseClaimsRemain",
  "Ergodicity Breaking And Delay Context": "theoryBadgeGraph.shared.ergodicityBreakingAndDelayContext",
  "Represents the stabilization context in which a driven many-body system avoids or delays featureless thermalization.": "theoryBadgeGraph.shared.representsTheStabilizationContextInWhichADrivenManyBody",
  "It gives time-crystal order a route through localization, prethermalization, dissipation, or related stabilization rather than bare repetition.": "theoryBadgeGraph.shared.itGivesTimeCrystalOrderARouteThroughLocalizationPrethermalization",
  "Time-crystal order requires a route that blocks, delays, or balances thermalization over the claimed observation window.": "theoryBadgeGraph.shared.timeCrystalOrderRequiresARouteThatBlocksDelaysOr",
  "Ergodicity context is route evidence, not proof of a specific platform or universal phase.": "theoryBadgeGraph.shared.ergodicityContextIsRouteEvidenceNotProofOfASpecific",
  "Many-Body Synchronization Context": "theoryBadgeGraph.shared.manyBodySynchronizationContext",
  "Represents collective locking of many interacting degrees of freedom into a robust subharmonic or limit-cycle response.": "theoryBadgeGraph.shared.representsCollectiveLockingOfManyInteractingDegreesOfFreedomInto",
  "It separates time-crystal order from a single oscillator by requiring collective synchronization evidence.": "theoryBadgeGraph.shared.itSeparatesTimeCrystalOrderFromASingleOscillatorBy",
  "Synchronization evidence should involve collective response or many-body correlations, not only one oscillator trace.": "theoryBadgeGraph.shared.synchronizationEvidenceShouldInvolveCollectiveResponseOrManyBodyCorrelations",
  "Subharmonic synchronization is evidence context; robustness and phase-boundary checks are still required.": "theoryBadgeGraph.shared.subharmonicSynchronizationIsEvidenceContextRobustnessAndPhaseBoundaryChecks",
  "Open-System Drive-Dissipation Context": "theoryBadgeGraph.shared.openSystemDriveDissipationContext",
  "Represents external drive, bath coupling, dissipation, and noise as explicit conditions for open-system time-crystal routes.": "theoryBadgeGraph.shared.representsExternalDriveBathCouplingDissipationAndNoiseAsExplicit",
  "It makes energy flow and environment coupling visible instead of implying isolated cost-free self-oscillation.": "theoryBadgeGraph.shared.itMakesEnergyFlowAndEnvironmentCouplingVisibleInsteadOf",
  "Open-system time-crystal routes must state drive, dissipation, noise, and bath assumptions.": "theoryBadgeGraph.shared.openSystemTimeCrystalRoutesMustStateDriveDissipationNoise",
  "Dissipation may stabilize or destroy temporal order depending on the route and cannot be treated as automatically favorable.": "theoryBadgeGraph.shared.dissipationMayStabilizeOrDestroyTemporalOrderDependingOnThe",
  "Entropy Production Context": "theoryBadgeGraph.shared.entropyProductionContext",
  "Represents work, heat, irreversibility, and entropy-production bookkeeping for driven or stochastic time-crystal routes.": "theoryBadgeGraph.shared.representsWorkHeatIrreversibilityAndEntropyProductionBookkeepingForDriven",
  "It ties self-organized temporal order to thermodynamic accounting instead of treating persistent response as free motion.": "theoryBadgeGraph.shared.itTiesSelfOrganizedTemporalOrderToThermodynamicAccountingInstead",
  "Entropy production is thermodynamic evidence for driven or stochastic routes, not a violation of thermodynamic laws.": "theoryBadgeGraph.shared.entropyProductionIsThermodynamicEvidenceForDrivenOrStochasticRoutes",
  "Clock-like or persistent response claims require stated cost, bath, and irreversibility context when thermodynamic performance is discussed.": "theoryBadgeGraph.shared.clockLikeOrPersistentResponseClaimsRequireStatedCostBath",
  "Floquet Quasienergy Context": "theoryBadgeGraph.shared.floquetQuasienergyContext",
  "Represents periodically driven systems through Floquet operators, quasienergy structure, and stroboscopic response.": "theoryBadgeGraph.shared.representsPeriodicallyDrivenSystemsThroughFloquetOperatorsQuasienergyStructureAnd",
  "It gives discrete time-crystal routes a quantum-dynamical energy structure without reducing the claim to ordinary energy density.": "theoryBadgeGraph.shared.itGivesDiscreteTimeCrystalRoutesAQuantumDynamicalEnergy",
  "Floquet quasienergy context applies to periodically driven routes and does not by itself prove time-crystalline order.": "theoryBadgeGraph.shared.floquetQuasienergyContextAppliesToPeriodicallyDrivenRoutesAndDoes",
  "Subharmonic response and robustness evidence remain separate diagnostic requirements.": "theoryBadgeGraph.shared.subharmonicResponseAndRobustnessEvidenceRemainSeparateDiagnosticRequirements",
  "Quantum-Classical Time-Crystal Bridge Context": "theoryBadgeGraph.shared.quantumClassicalTimeCrystalBridgeContext",
  "Represents shared time-crystal signatures across quantum and classical platforms while keeping their mechanisms distinct.": "theoryBadgeGraph.shared.representsSharedTimeCrystalSignaturesAcrossQuantumAndClassicalPlatforms",
  "It lets the graph compare subharmonic order, synchronization, and ergodicity boundaries without claiming one mechanism proves the other.": "theoryBadgeGraph.shared.itLetsTheGraphCompareSubharmonicOrderSynchronizationAndErgodicity",
  "Quantum and classical systems can share diagnostic signatures, but their stabilizing mechanisms must remain separately identified.": "theoryBadgeGraph.shared.quantumAndClassicalSystemsCanShareDiagnosticSignaturesButTheir",
  "Bridge context compares evidence classes and does not certify mechanism equivalence.": "theoryBadgeGraph.shared.bridgeContextComparesEvidenceClassesAndDoesNotCertifyMechanism",
  "Self-Organized Oscillation Boundary": "theoryBadgeGraph.shared.selfOrganizedOscillationBoundary",
  "Represents the boundary between robust collective temporal order and ordinary driven, damped, or externally forced oscillation.": "theoryBadgeGraph.shared.representsTheBoundaryBetweenRobustCollectiveTemporalOrderAndOrdinary",
  "It keeps self-continuing-looking response tied to synchronization, route stability, and thermodynamic accounting.": "theoryBadgeGraph.shared.itKeepsSelfContinuingLookingResponseTiedToSynchronizationRoute",
  "Self-organized-looking oscillation requires collective order, route stability, and thermodynamic context before time-crystal language is admitted.": "theoryBadgeGraph.shared.selfOrganizedLookingOscillationRequiresCollectiveOrderRouteStabilityAnd",
  "Ordinary clocks, pendulums, lasers, and externally forced oscillators require additional evidence before being compared to time crystals.": "theoryBadgeGraph.shared.ordinaryClocksPendulumsLasersAndExternallyForcedOscillatorsRequireAdditional",
  "Quantized Mode Frequency Context": "theoryBadgeGraph.shared.quantizedModeFrequencyContext",
  "It gives frequency observables a safe quantum bridge while preventing frequency rows from replacing EOS or structure evidence.": "theoryBadgeGraph.shared.itGivesFrequencyObservablesASafeQuantumBridgeWhilePreventing",
  "Observed frequencies require mode assignment, calibration, and environmental broadening context before structural claims are promoted.": "theoryBadgeGraph.shared.observedFrequenciesRequireModeAssignmentCalibrationAndEnvironmentalBroadeningContext",
  "Phase-dependent frequency shifts can document structure or environment only when compared against admitted reference evidence.": "theoryBadgeGraph.shared.phaseDependentFrequencyShiftsCanDocumentStructureOrEnvironmentOnly",
  "Water Conditioned Phase-State Context": "theoryBadgeGraph.shared.waterConditionedPhaseStateContext",
  "Represents H2O phase, density, and structure as conditioned by temperature, pressure, composition, and environment.": "theoryBadgeGraph.shared.representsH2oPhaseDensityAndStructureAsConditionedByTemperature",
  "It extends the water-origin badge into phase behavior without saying hydrogen and oxygen availability determines water state or density.": "theoryBadgeGraph.shared.itExtendsTheWaterOriginBadgeIntoPhaseBehaviorWithout",
  "H2O identity can persist across ice, liquid, vapor, and supercritical contexts, but molecular network structure and density change with conditions.": "theoryBadgeGraph.shared.h2oIdentityCanPersistAcrossIceLiquidVaporAndSupercritical",
  "Water phase assignment requires temperature, pressure, composition, and validity range evidence.": "theoryBadgeGraph.shared.waterPhaseAssignmentRequiresTemperaturePressureCompositionAndValidityRange",
  "Water phase context is not a habitability, life, prebiotic-success, or fusion-origin claim.": "theoryBadgeGraph.shared.waterPhaseContextIsNotAHabitabilityLifePrebioticSuccess",
  "Polaritonic Reservoir Lifetime Context": "theoryBadgeGraph.shared.polaritonicReservoirLifetimeContext",
  "Represents a reported long-lived collective soliton-polariton reservoir lifetime as an open-system timescale.": "theoryBadgeGraph.shared.representsAReportedLongLivedCollectiveSolitonPolaritonReservoirLifetime",
  "It gives the graph a calculator-loadable temporal window while preventing reservoir lifetime from being treated as a measured coherence time.": "theoryBadgeGraph.shared.itGivesTheGraphACalculatorLoadableTemporalWindowWhile",
  "The lifetime is interpreted as a reservoir or condensate survival timescale unless phase-coherence evidence is separately admitted.": "theoryBadgeGraph.shared.theLifetimeIsInterpretedAsAReservoirOrCondensateSurvival",
  "A Fourier-limited linewidth proxy is a scale estimate, not a measured decoherence linewidth.": "theoryBadgeGraph.shared.aFourierLimitedLinewidthProxyIsAScaleEstimateNot",
  "The reported room-temperature soliton-polariton condensate does not by itself establish time-crystalline order.": "theoryBadgeGraph.shared.theReportedRoomTemperatureSolitonPolaritonCondensateDoesNotBy",
  "Polaritonic Decoherence Boundary": "theoryBadgeGraph.shared.polaritonicDecoherenceBoundary",
  "Represents the evidence boundary between a long-lived polariton reservoir and a measured quantum coherence time.": "theoryBadgeGraph.shared.representsTheEvidenceBoundaryBetweenALongLivedPolaritonReservoir",
  "It keeps lifetime, linewidth, phase noise, first-order coherence, and echo-like measurements from being conflated.": "theoryBadgeGraph.shared.itKeepsLifetimeLinewidthPhaseNoiseFirstOrderCoherenceAnd",
  "A reservoir lifetime is not automatically a single-particle lifetime, coherence time, or dephasing time.": "theoryBadgeGraph.shared.aReservoirLifetimeIsNotAutomaticallyASingleParticleLifetime",
  "Coherence claims require direct coherence observables such as first-order coherence, linewidth, echo, ODMR, phase-noise, or Allan-deviation evidence.": "theoryBadgeGraph.shared.coherenceClaimsRequireDirectCoherenceObservablesSuchAsFirstOrder",
  "Collective Lifetime-Limited Linewidth Context": "theoryBadgeGraph.shared.collectiveLifetimeLimitedLinewidthContext",
  "Represents the linewidth scale set by the lifetime of collective time-crystalline order rather than isolated microscopic excitations.": "theoryBadgeGraph.shared.representsTheLinewidthScaleSetByTheLifetimeOfCollective",
  "It lets calculator traces compare noisy and stabilized collective lifetimes without claiming a physical mechanism is established.": "theoryBadgeGraph.shared.itLetsCalculatorTracesCompareNoisyAndStabilizedCollectiveLifetimes",
  "The linewidth relation is a diagnostic scale for collective order lifetime and does not certify time-crystal formation by itself.": "theoryBadgeGraph.shared.theLinewidthRelationIsADiagnosticScaleForCollectiveOrder",
  "The collective lifetime must come from admitted time-crystal sensing, phase-coherence, or ordered-response evidence.": "theoryBadgeGraph.shared.theCollectiveLifetimeMustComeFromAdmittedTimeCrystalSensing",
  "Noisy Synchrony Margin Context": "theoryBadgeGraph.shared.noisySynchronyMarginContext",
  "Represents the competition between locking, dephasing noise, and loss in a noisy collective-mode synchronization route.": "theoryBadgeGraph.shared.representsTheCompetitionBetweenLockingDephasingNoiseAndLossIn",
  "It gives noisy environments a scalar diagnostic without promoting ordinary noisy oscillation into a time crystal.": "theoryBadgeGraph.shared.itGivesNoisyEnvironmentsAScalarDiagnosticWithoutPromotingOrdinary",
  "Positive margin is only a model diagnostic and still requires observable subharmonic response, rigidity, and phase-boundary evidence.": "theoryBadgeGraph.shared.positiveMarginIsOnlyAModelDiagnosticAndStillRequires",
  "Noise can destabilize or synchronize depending on the route, coupling, bath, and observation window.": "theoryBadgeGraph.shared.noiseCanDestabilizeOrSynchronizeDependingOnTheRouteCoupling",
  "Stabilized-Versus-Noisy Trace Context": "theoryBadgeGraph.shared.stabilizedVersusNoisyTraceContext",
  "Represents paired traces comparing a stabilized collective lifetime against a noisy or unstabilized lifetime.": "theoryBadgeGraph.shared.representsPairedTracesComparingAStabilizedCollectiveLifetimeAgainstA",
  "It lets the badge graph compare linewidth narrowing and lifetime gain while preserving the evidence-only boundary.": "theoryBadgeGraph.shared.itLetsTheBadgeGraphCompareLinewidthNarrowingAndLifetime",
  "A lifetime-gain trace compares collective persistence and does not establish a microscopic mechanism by itself.": "theoryBadgeGraph.shared.aLifetimeGainTraceComparesCollectivePersistenceAndDoesNot",
  "Trace comparison must keep stabilized, noisy, and baseline conditions explicit.": "theoryBadgeGraph.shared.traceComparisonMustKeepStabilizedNoisyAndBaselineConditionsExplicit",
  "Magnon Space-Time Lattice Context": "theoryBadgeGraph.shared.magnonSpaceTimeLatticeContext",
  "Represents a driven magnonic space-time lattice that reshapes quasiparticle propagation through band folding and scattering.": "theoryBadgeGraph.shared.representsADrivenMagnonicSpaceTimeLatticeThatReshapesQuasiparticle",
  "It gives the graph a directly imaged spatiotemporal-lattice reference without treating it as the same mechanism as polariton condensates or strict DTC order.": "theoryBadgeGraph.shared.itGivesTheGraphADirectlyImagedSpatiotemporalLatticeReference",
  "The driven magnonic space-time lattice is a visualization bridge for spatiotemporal ordering, band folding, and scattering.": "theoryBadgeGraph.shared.theDrivenMagnonicSpaceTimeLatticeIsAVisualizationBridge",
  "The PRL magnon system is not automatically a strict discrete time crystal with spontaneous subharmonic symmetry breaking.": "theoryBadgeGraph.shared.thePrlMagnonSystemIsNotAutomaticallyAStrictDiscrete",
  "Polariton-Time-Crystal Bridge Boundary": "theoryBadgeGraph.shared.polaritonTimeCrystalBridgeBoundary",
  "Represents the analogy boundary connecting long-lived polariton reservoirs, time-crystal synchronization, and driven magnonic space-time lattices.": "theoryBadgeGraph.shared.representsTheAnalogyBoundaryConnectingLongLivedPolaritonReservoirsTime",
  "It lets the graph compare bosonic collective modes, gain/loss balance, nonlinear feedback, and phase-rigid order without merging distinct mechanisms.": "theoryBadgeGraph.shared.itLetsTheGraphCompareBosonicCollectiveModesGainLoss",
  "The bridge admits analogy among collective modes, gain/loss balance, nonlinear feedback, and phase ordering.": "theoryBadgeGraph.shared.theBridgeAdmitsAnalogyAmongCollectiveModesGainLossBalance",
  "The bridge does not claim that soliton-polariton condensates, DTC sensing systems, and driven magnonic space-time lattices are the same physical mechanism.": "theoryBadgeGraph.shared.theBridgeDoesNotClaimThatSolitonPolaritonCondensatesDtc",
  "Astrophysical S-Factor Context": "theoryBadgeGraph.shared.astrophysicalSFactorContext",
  "Represents the S-factor as a low-energy charged-particle fusion cross-section factor after the Coulomb tunneling term is separated.": "theoryBadgeGraph.shared.representsTheSFactorAsALowEnergyChargedParticle",
  "It bridges Coulomb barrier and tunneling badges into reaction-rate language without letting a tunneling proxy become a full stellar yield model.": "theoryBadgeGraph.shared.itBridgesCoulombBarrierAndTunnelingBadgesIntoReactionRate",
  "Cross-scale rows are diagnostic connective tissue between established theory badges.": "theoryBadgeGraph.shared.crossScaleRowsAreDiagnosticConnectiveTissueBetweenEstablishedTheory",
  "Scalar payloads are proxy demonstrations unless a runtime receipt, table, or platform-specific model is attached.": "theoryBadgeGraph.shared.scalarPayloadsAreProxyDemonstrationsUnlessARuntimeReceiptTable",
  "The payload is a shape proxy and requires measured or evaluated S(E), screening, and channel data for astrophysical use.": "theoryBadgeGraph.shared.thePayloadIsAShapeProxyAndRequiresMeasuredOr",
  "Thermonuclear Reaction-Rate Context": "theoryBadgeGraph.shared.thermonuclearReactionRateContext",
  "Represents a reduced two-body reaction-rate density from number densities, relative velocity, and cross section.": "theoryBadgeGraph.shared.representsAReducedTwoBodyReactionRateDensityFromNumber",
  "It gives fusion prompts the missing density-and-rate bridge between microscopic cross sections and stellar nucleosynthesis context.": "theoryBadgeGraph.shared.itGivesFusionPromptsTheMissingDensityAndRateBridge",
  "A serious thermonuclear rate requires a thermal average, channel factors, screening, and evaluated reaction data.": "theoryBadgeGraph.shared.aSeriousThermonuclearRateRequiresAThermalAverageChannelFactors",
  "Plasma Screening Context": "theoryBadgeGraph.shared.plasmaScreeningContext",
  "Represents plasma screening as environmental modification of charged-particle reaction entrance conditions.": "theoryBadgeGraph.shared.representsPlasmaScreeningAsEnvironmentalModificationOfChargedParticleReaction",
  "It prevents bare Coulomb-barrier intuition from being treated as the whole stellar-plasma fusion story.": "theoryBadgeGraph.shared.itPreventsBareCoulombBarrierIntuitionFromBeingTreatedAs",
  "Screening is model- and regime-dependent and is not solved by the scalar Coulomb barrier badge.": "theoryBadgeGraph.shared.screeningIsModelAndRegimeDependentAndIsNotSolved",
  "Semi-Empirical Mass-Formula Context": "theoryBadgeGraph.shared.semiEmpiricalMassFormulaContext",
  "Represents nuclear binding systematics through volume, surface, Coulomb, asymmetry, and pairing terms.": "theoryBadgeGraph.shared.representsNuclearBindingSystematicsThroughVolumeSurfaceCoulombAsymmetryAnd",
  "It gives the element-origin branch a bounded nuclear-structure bridge beyond a single mass-defect scalar.": "theoryBadgeGraph.shared.itGivesTheElementOriginBranchABoundedNuclearStructure",
  "The formula is a nuclear-systematics context and does not replace measured nuclear masses or reaction network yields.": "theoryBadgeGraph.shared.theFormulaIsANuclearSystematicsContextAndDoesNot",
  "Nuclear Shell Magic-Number Context": "theoryBadgeGraph.shared.nuclearShellMagicNumberContext",
  "Represents nuclear shell closures and magic numbers as stability context for isotope and element-origin interpretation.": "theoryBadgeGraph.shared.representsNuclearShellClosuresAndMagicNumbersAsStabilityContext",
  "It separates nuclear shell stability from electron shell chemistry while still letting both branches meet at element identity.": "theoryBadgeGraph.shared.itSeparatesNuclearShellStabilityFromElectronShellChemistryWhile",
  "Nuclear shell closures provide stability context and do not determine chemical phase or molecular binding by themselves.": "theoryBadgeGraph.shared.nuclearShellClosuresProvideStabilityContextAndDoNotDetermine",
  "Atomic Transition-Probability Context": "theoryBadgeGraph.shared.atomicTransitionProbabilityContext",
  "Represents transition probabilities and oscillator strengths as the atomic-data layer behind spectral line interpretation.": "theoryBadgeGraph.shared.representsTransitionProbabilitiesAndOscillatorStrengthsAsTheAtomicData",
  "It prevents line wavelengths alone from carrying abundance or origin claims without atomic transition data and calibration.": "theoryBadgeGraph.shared.itPreventsLineWavelengthsAloneFromCarryingAbundanceOrOrigin",
  "Transition probabilities constrain line strengths but do not by themselves prove element origin or abundance.": "theoryBadgeGraph.shared.transitionProbabilitiesConstrainLineStrengthsButDoNotByThemselves",
  "Spectral Line-Broadening Context": "theoryBadgeGraph.shared.spectralLineBroadeningContext",
  "Represents thermal, pressure, natural, Zeeman, rotational, and instrumental broadening as context for spectral feature interpretation.": "theoryBadgeGraph.shared.representsThermalPressureNaturalZeemanRotationalAndInstrumentalBroadeningAs",
  "It keeps spectral detections from becoming overconfident line IDs or abundance claims without width and calibration context.": "theoryBadgeGraph.shared.itKeepsSpectralDetectionsFromBecomingOverconfidentLineIdsOr",
  "Line broadening is a model context for physical conditions and instrument response; it is not a formation-pathway proof.": "theoryBadgeGraph.shared.lineBroadeningIsAModelContextForPhysicalConditionsAnd",
  "Astrochemical Rate-Equation Context": "theoryBadgeGraph.shared.astrochemicalRateEquationContext",
  "Represents molecular abundances as formation and destruction terms in an astrochemical reaction network.": "theoryBadgeGraph.shared.representsMolecularAbundancesAsFormationAndDestructionTermsInAn",
  "It gives water and molecular-cloud prompts a rate-network bridge rather than treating element availability as molecule formation.": "theoryBadgeGraph.shared.itGivesWaterAndMolecularCloudPromptsARateNetwork",
  "Reaction networks require admitted rate coefficients, physical conditions, shielding, and initial abundances.": "theoryBadgeGraph.shared.reactionNetworksRequireAdmittedRateCoefficientsPhysicalConditionsShieldingAnd",
  "Photodissociation And Shielding Context": "theoryBadgeGraph.shared.photodissociationAndShieldingContext",
  "Represents UV photodissociation, dust shielding, and self-shielding as molecular survival context.": "theoryBadgeGraph.shared.representsUvPhotodissociationDustShieldingAndSelfShieldingAsMolecular",
  "It keeps water or molecular-band claims conditioned on the environment that can destroy as well as form molecules.": "theoryBadgeGraph.shared.itKeepsWaterOrMolecularBandClaimsConditionedOnThe",
  "Molecular survival depends on radiation field, shielding, density, temperature, and reaction partners.": "theoryBadgeGraph.shared.molecularSurvivalDependsOnRadiationFieldShieldingDensityTemperatureAnd",
  "Free-Energy Phase-Selection Context": "theoryBadgeGraph.shared.freeEnergyPhaseSelectionContext",
  "Represents phase selection as minimization of the appropriate thermodynamic potential under declared constraints.": "theoryBadgeGraph.shared.representsPhaseSelectionAsMinimizationOfTheAppropriateThermodynamicPotential",
  "It gives phase badges a first-principles thermodynamic decision rule without pretending scalar temperature and pressure alone determine structure.": "theoryBadgeGraph.shared.itGivesPhaseBadgesAFirstPrinciplesThermodynamicDecisionRule",
  "Equilibrium phase selection requires the correct potential, constraints, composition, and validity range.": "theoryBadgeGraph.shared.equilibriumPhaseSelectionRequiresTheCorrectPotentialConstraintsCompositionAnd",
  "Equation-Of-State Validity Context": "theoryBadgeGraph.shared.equationOfStateValidityContext",
  "Represents an equation of state as a validity-bounded map from thermodynamic variables to density or related material properties.": "theoryBadgeGraph.shared.representsAnEquationOfStateAsAValidityBoundedMap",
  "It adds a guardrail between density, phase, and calculator traces so EOS use stays inside model boundaries.": "theoryBadgeGraph.shared.itAddsAGuardrailBetweenDensityPhaseAndCalculatorTraces",
  "EOS context requires named material, composition, phase region, and declared validity limits.": "theoryBadgeGraph.shared.eosContextRequiresNamedMaterialCompositionPhaseRegionAndDeclared",
  "Lindblad Open-System Context": "theoryBadgeGraph.shared.lindbladOpenSystemContext",
  "Represents Markovian open quantum dynamics through a density-matrix master-equation form.": "theoryBadgeGraph.shared.representsMarkovianOpenQuantumDynamicsThroughADensityMatrixMaster",
  "It gives time-crystal, polariton, and decoherence prompts a formal bridge for drive, dissipation, loss, and noise.": "theoryBadgeGraph.shared.itGivesTimeCrystalPolaritonAndDecoherencePromptsAFormal",
  "The Lindblad form assumes a Markovian completely positive trace-preserving open-system model.": "theoryBadgeGraph.shared.theLindbladFormAssumesAMarkovianCompletelyPositiveTracePreserving",
  "Environment-Induced Superselection Context": "theoryBadgeGraph.shared.environmentInducedSuperselectionContext",
  "Represents decoherence and einselection as environment-conditioned emergence of stable pointer-state descriptions.": "theoryBadgeGraph.shared.representsDecoherenceAndEinselectionAsEnvironmentConditionedEmergenceOfStable",
  "It gives quantum-to-classical bridge prompts a grounded boundary without saying decoherence proves classical truth or consciousness.": "theoryBadgeGraph.shared.itGivesQuantumToClassicalBridgePromptsAGroundedBoundary",
  "Decoherence explains loss of local interference under environmental monitoring but is not a universal claim of final classical ontology.": "theoryBadgeGraph.shared.decoherenceExplainsLossOfLocalInterferenceUnderEnvironmentalMonitoringBut",
  "Landau Order-Parameter Context": "theoryBadgeGraph.shared.landauOrderParameterContext",
  "Represents an order parameter as a symmetry-distinguishing collective variable for phases and transitions.": "theoryBadgeGraph.shared.representsAnOrderParameterAsASymmetryDistinguishingCollectiveVariable",
  "It gives phase, time-crystal, and synchrony prompts a bridge from microscopic dynamics to macroscopic state classification.": "theoryBadgeGraph.shared.itGivesPhaseTimeCrystalAndSynchronyPromptsABridge",
  "Order parameters classify collective state changes and do not prove a specific microscopic mechanism by themselves.": "theoryBadgeGraph.shared.orderParametersClassifyCollectiveStateChangesAndDoNotProve",
  "Goldstone Symmetry-Breaking Context": "theoryBadgeGraph.shared.goldstoneSymmetryBreakingContext",
  "Represents continuous symmetry breaking as a context that can produce low-energy collective modes.": "theoryBadgeGraph.shared.representsContinuousSymmetryBreakingAsAContextThatCanProduce",
  "It lets the graph connect symmetry, order, and collective modes while keeping platform-specific evidence separate.": "theoryBadgeGraph.shared.itLetsTheGraphConnectSymmetryOrderAndCollectiveModes",
  "Goldstone context requires the relevant symmetry, dimensionality, interactions, and platform assumptions.": "theoryBadgeGraph.shared.goldstoneContextRequiresTheRelevantSymmetryDimensionalityInteractionsAndPlatform",
  "Renormalization-Group Relevance Context": "theoryBadgeGraph.shared.renormalizationGroupRelevanceContext",
  "Represents scale flow and relevance as a way to classify which variables matter at a chosen resolution.": "theoryBadgeGraph.shared.representsScaleFlowAndRelevanceAsAWayToClassify",
  "It gives the badge graph a disciplined way to carry analogies across scales without treating shared words as shared mechanisms.": "theoryBadgeGraph.shared.itGivesTheBadgeGraphADisciplinedWayToCarry",
  "RG relevance is a resolution rule for models and analogies; it does not transport validation across unrelated scales.": "theoryBadgeGraph.shared.rgRelevanceIsAResolutionRuleForModelsAndAnalogies",
  "Effective Degrees-Of-Freedom Context": "theoryBadgeGraph.shared.effectiveDegreesOfFreedomContext",
  "Represents effective theory as choosing variables appropriate to a domain, energy, length, and observation scale.": "theoryBadgeGraph.shared.representsEffectiveTheoryAsChoosingVariablesAppropriateToADomain",
  "It keeps the graph versatile while stopping first-principles language from flattening nuclear, atomic, molecular, phase, and cosmic scales.": "theoryBadgeGraph.shared.itKeepsTheGraphVersatileWhileStoppingFirstPrinciplesLanguage",
  "Effective variables are model choices and must be tied to resolution, error tolerance, and admitted observables.": "theoryBadgeGraph.shared.effectiveVariablesAreModelChoicesAndMustBeTiedTo",
  "Measurement-Model Uncertainty Context": "theoryBadgeGraph.shared.measurementModelUncertaintyContext",
  "Represents uncertainty propagation as a measurement-model problem with inputs, covariance, calibration, and output quantities.": "theoryBadgeGraph.shared.representsUncertaintyPropagationAsAMeasurementModelProblemWithInputs",
  "It gives reflection and calculator paths a way to discuss resolution and confidence without using deterministic turns as evidence.": "theoryBadgeGraph.shared.itGivesReflectionAndCalculatorPathsAWayToDiscuss",
  "The matrix expression is kept non-computable until a matrix-capable calculator path is admitted.": "theoryBadgeGraph.shared.theMatrixExpressionIsKeptNonComputableUntilAMatrix",
  "Proxy-Model Boundary Context": "theoryBadgeGraph.shared.proxyModelBoundaryContext",
  "Represents the boundary between a scalar proxy, a calibrated model, and an observationally supported claim.": "theoryBadgeGraph.shared.representsTheBoundaryBetweenAScalarProxyACalibratedModel",
  "It gives the graph a reusable guardrail for calculator payloads, sweeps, and reflection outputs.": "theoryBadgeGraph.shared.itGivesTheGraphAReusableGuardrailForCalculatorPayloads",
  "Calculator traces may organize evidence but do not become answer authority or proof without the surrounding solver path and provenance.": "theoryBadgeGraph.shared.calculatorTracesMayOrganizeEvidenceButDoNotBecomeAnswer",
  "Spectral Observational-Inference Pipeline Context": "theoryBadgeGraph.shared.spectralObservationalInferencePipelineContext",
  "Represents the path from calibrated spectra through line identification, modeling, uncertainty, and posterior abundance or origin hypotheses.": "theoryBadgeGraph.shared.representsThePathFromCalibratedSpectraThroughLineIdentificationModeling",
  "It gives astronomy prompts an observable-to-theory bridge while preventing a spectral match from proving an origin story.": "theoryBadgeGraph.shared.itGivesAstronomyPromptsAnObservableToTheoryBridgeWhile",
  "Spectral inference needs calibration, model choice, uncertainty, degeneracy checks, and claim boundaries.": "theoryBadgeGraph.shared.spectralInferenceNeedsCalibrationModelChoiceUncertaintyDegeneracyChecksAnd",
  "Energy density is meaningful only when dimensions agree.": "theoryBadgeGraph.shared.energyDensityIsMeaningfulOnlyWhenDimensionsAgree",
  "The relativistic energy-momentum relation uses c.": "theoryBadgeGraph.shared.theRelativisticEnergyMomentumRelationUsesC",
  "Rest energy uses c squared.": "theoryBadgeGraph.shared.restEnergyUsesCSquared",
  "Rest energy is the zero-momentum specialization of the energy-momentum relation.": "theoryBadgeGraph.shared.restEnergyIsTheZeroMomentumSpecializationOfTheEnergy",
  "Quantum energy expressions can feed scalar energy-density calculations.": "theoryBadgeGraph.shared.quantumEnergyExpressionsCanFeedScalarEnergyDensityCalculations",
  "Momentum can feed the relativistic energy-momentum relation.": "theoryBadgeGraph.shared.momentumCanFeedTheRelativisticEnergyMomentumRelation",
  "Rest energy can be treated as an energy input to density calculations.": "theoryBadgeGraph.shared.restEnergyCanBeTreatedAsAnEnergyInputTo",
  "Stress-energy components carry energy-density-like unit signatures.": "theoryBadgeGraph.shared.stressEnergyComponentsCarryEnergyDensityLikeUnitSignatures",
  "Stress-energy usage is constrained by conservation context.": "theoryBadgeGraph.shared.stressEnergyUsageIsConstrainedByConservationContext",
  "Einstein field equations use stress-energy as the source-side object.": "theoryBadgeGraph.shared.einsteinFieldEquationsUseStressEnergyAsTheSourceSide",
  "Duty-cycle averages depend on energy-per-time reasoning.": "theoryBadgeGraph.shared.dutyCycleAveragesDependOnEnergyPerTimeReasoning",
  "NHM2 source proxies reuse the canonical energy-density scalar relation.": "theoryBadgeGraph.shared.nhm2SourceProxiesReuseTheCanonicalEnergyDensityScalarRelation",
  "Frame factors provide context for relativity-facing geometry terms.": "theoryBadgeGraph.shared.frameFactorsProvideContextForRelativityFacingGeometryTerms",
  "Io eclipse timing documents the empirical origin of finite light-speed measurement.": "theoryBadgeGraph.shared.ioEclipseTimingDocumentsTheEmpiricalOriginOfFiniteLight",
  "Romer's finite-light-speed context precedes Bradley's stellar-aberration constraint.": "theoryBadgeGraph.shared.romerSFiniteLightSpeedContextPrecedesBradleySStellar",
  "Stellar aberration motivates c as a measurable quantity before terrestrial measurement.": "theoryBadgeGraph.shared.stellarAberrationMotivatesCAsAMeasurableQuantityBeforeTerrestrial",
  "Terrestrial c measurement documents the background for medium-speed comparisons.": "theoryBadgeGraph.shared.terrestrialCMeasurementDocumentsTheBackgroundForMediumSpeedComparisons",
  "Medium-speed context leads into moving-medium partial-drag constraints.": "theoryBadgeGraph.shared.mediumSpeedContextLeadsIntoMovingMediumPartialDragConstraints",
  "Fizeau's partial-drag result is later compactly explained by Lorentzian velocity structure.": "theoryBadgeGraph.shared.fizeauSPartialDragResultIsLaterCompactlyExplainedBy",
  "Moving-medium partial drag and aether-drift null results jointly strained classical aether models.": "theoryBadgeGraph.shared.movingMediumPartialDragAndAetherDriftNullResultsJointly",
  "The Michelson-Morley null result motivated FitzGerald-Lorentz contraction hypotheses.": "theoryBadgeGraph.shared.theMichelsonMorleyNullResultMotivatedFitzgeraldLorentzContractionHypotheses",
  "Length contraction uses the Lorentz factor.": "theoryBadgeGraph.shared.lengthContractionUsesTheLorentzFactor",
  "Lorentz coordinate transforms use gamma.": "theoryBadgeGraph.shared.lorentzCoordinateTransformsUseGamma",
  "Trouton-Noble bounds aether-drift explanations beyond optical interferometry.": "theoryBadgeGraph.shared.troutonNobleBoundsAetherDriftExplanationsBeyondOpticalInterferometry",
  "The Michelson-Morley null result cannot be promoted into a one-step proof.": "theoryBadgeGraph.shared.theMichelsonMorleyNullResultCannotBePromotedIntoA",
  "The Trouton-Noble null result cannot be promoted into a one-step proof.": "theoryBadgeGraph.shared.theTroutonNobleNullResultCannotBePromotedIntoA",
  "Lorentz transformations document the compact endpoint of the historical constraint lane.": "theoryBadgeGraph.shared.lorentzTransformationsDocumentTheCompactEndpointOfTheHistoricalConstraint",
  "Field-equation source terms require compatible conservation checks.": "theoryBadgeGraph.shared.fieldEquationSourceTermsRequireCompatibleConservationChecks",
  "3+1 variables provide a simulation-facing geometry split.": "theoryBadgeGraph.shared.31VariablesProvideASimulationFacingGeometrySplit",
  "NHM2 lapse-shift samples use scalar projections of 3+1 terms.": "theoryBadgeGraph.shared.nhm2LapseShiftSamplesUseScalarProjectionsOf31",
  "Source diagnostics need energy-density unit signatures.": "theoryBadgeGraph.shared.sourceDiagnosticsNeedEnergyDensityUnitSignatures",
  "Both badges carry energy-derived scalar quantities.": "theoryBadgeGraph.shared.bothBadgesCarryEnergyDerivedScalarQuantities",
  "QEI sampling compares energy-density-like scalar quantities.": "theoryBadgeGraph.shared.qeiSamplingComparesEnergyDensityLikeScalarQuantities",
  "The source proxy and QEI badge replay margin share energy-density units.": "theoryBadgeGraph.shared.theSourceProxyAndQeiBadgeReplayMarginShareEnergy",
  "Residual comparison uses source-density-like quantities.": "theoryBadgeGraph.shared.residualComparisonUsesSourceDensityLikeQuantities",
  "Wall T00 source closure compares energy-density-like quantities.": "theoryBadgeGraph.shared.wallT00SourceClosureComparesEnergyDensityLikeQuantities",
  "Wall T00 is the front-door regional source residual before global source closure.": "theoryBadgeGraph.shared.wallT00IsTheFrontDoorRegionalSourceResidualBefore",
  "Source residual contributes to the energy-condition diagnostic gate.": "theoryBadgeGraph.shared.sourceResidualContributesToTheEnergyConditionDiagnosticGate",
  "The sampled inequality margin bounds one gate input.": "theoryBadgeGraph.shared.theSampledInequalityMarginBoundsOneGateInput",
  "Gate labels must point at the diagnostic-only boundary.": "theoryBadgeGraph.shared.gateLabelsMustPointAtTheDiagnosticOnlyBoundary",
  "Residual diagnostics cannot promote themselves into a physical claim.": "theoryBadgeGraph.shared.residualDiagnosticsCannotPromoteThemselvesIntoAPhysicalClaim",
  "Wall residual diagnostics cannot promote themselves into source closure.": "theoryBadgeGraph.shared.wallResidualDiagnosticsCannotPromoteThemselvesIntoSourceClosure",
  "The 3+1 lapse-shift grammar defines the Eulerian normal observer field.": "theoryBadgeGraph.shared.the31LapseShiftGrammarDefinesTheEulerianNormal",
  "The 3+1 decomposition supplies the ADM variables required by the same-chart full tensor artifact.": "theoryBadgeGraph.shared.the31DecompositionSuppliesTheAdmVariablesRequiredBy",
  "The Einstein equation supplies the metric-required stress-energy route in geometric units.": "theoryBadgeGraph.shared.theEinsteinEquationSuppliesTheMetricRequiredStressEnergyRoute",
  "Observer energy density requires the declared Eulerian normal.": "theoryBadgeGraph.shared.observerEnergyDensityRequiresTheDeclaredEulerianNormal",
  "Metric-required tensor components feed observer energy-density projection.": "theoryBadgeGraph.shared.metricRequiredTensorComponentsFeedObserverEnergyDensityProjection",
  "Full observer authority requires momentum-density channels.": "theoryBadgeGraph.shared.fullObserverAuthorityRequiresMomentumDensityChannels",
  "Full observer authority requires spatial-stress channels.": "theoryBadgeGraph.shared.fullObserverAuthorityRequiresSpatialStressChannels",
  "Full tensor authority includes the observer energy-density channel.": "theoryBadgeGraph.shared.fullTensorAuthorityIncludesTheObserverEnergyDensityChannel",
  "Full tensor authority requires momentum-density channels.": "theoryBadgeGraph.shared.fullTensorAuthorityRequiresMomentumDensityChannels",
  "Full tensor authority requires diagonal and off-diagonal spatial stress.": "theoryBadgeGraph.shared.fullTensorAuthorityRequiresDiagonalAndOffDiagonalSpatialStress",
  "Wall T00 closure reads the metric-required component status from the same-chart full tensor artifact.": "theoryBadgeGraph.shared.wallT00ClosureReadsTheMetricRequiredComponentStatusFrom",
  "Observer-robust energy-condition checks require the same-chart tensor component surface.": "theoryBadgeGraph.shared.observerRobustEnergyConditionChecksRequireTheSameChartTensor",
  "Source-side tensor authority must align with the same-chart tensor component surface.": "theoryBadgeGraph.shared.sourceSideTensorAuthorityMustAlignWithTheSameChart",
  "The regional atlas is meaningful only for the same run, chart, profile, and tensor basis used by full tensor artifacts.": "theoryBadgeGraph.shared.theRegionalAtlasIsMeaningfulOnlyForTheSameRun",
  "Atlas availability includes a declared partition policy for closure-region support weights.": "theoryBadgeGraph.shared.atlasAvailabilityIncludesADeclaredPartitionPolicyForClosureRegion",
  "Transition supports sit between the declared regional support functions.": "theoryBadgeGraph.shared.transitionSupportsSitBetweenTheDeclaredRegionalSupportFunctions",
  "Transition smoothing introduces support-function derivative terms for conservation diagnostics.": "theoryBadgeGraph.shared.transitionSmoothingIntroducesSupportFunctionDerivativeTermsForConservationDiagnostics",
  "All downstream artifacts must reference the same atlas hash before coupled closure is admissible.": "theoryBadgeGraph.shared.allDownstreamArtifactsMustReferenceTheSameAtlasHashBefore",
  "The tile-effective counterpart is an input to source-side same-basis tensor authority.": "theoryBadgeGraph.shared.theTileEffectiveCounterpartIsAnInputToSourceSide",
  "The tile-effective counterpart supplies component rows for the source component authority ledger.": "theoryBadgeGraph.shared.theTileEffectiveCounterpartSuppliesComponentRowsForTheSource",
  "Component-level source authority can retire stale source-authority blockers only when the ledger is complete and non-proxy.": "theoryBadgeGraph.shared.componentLevelSourceAuthorityCanRetireStaleSourceAuthorityBlockers",
  "Material receipt evidence is required before Casimir source rows can support source-side tensor authority.": "theoryBadgeGraph.shared.materialReceiptEvidenceIsRequiredBeforeCasimirSourceRowsCan",
  "Wall T00 residual interpretation can use the component ledger to distinguish source evidence from stale authority summaries.": "theoryBadgeGraph.shared.wallT00ResidualInterpretationCanUseTheComponentLedgerTo",
  "Wall T00 residual interpretation requires an independent source-side same-basis tensor authority receipt.": "theoryBadgeGraph.shared.wallT00ResidualInterpretationRequiresAnIndependentSourceSideSame",
  "The source-side counterpart is compared against the metric-required tensor only in the same basis.": "theoryBadgeGraph.shared.theSourceSideCounterpartIsComparedAgainstTheMetricRequired",
  "The wall T00 trace is the priority regional view of same-basis source closure.": "theoryBadgeGraph.shared.theWallT00TraceIsThePriorityRegionalViewOf",
  "The metric-required tensor is one side of the same-basis residual.": "theoryBadgeGraph.shared.theMetricRequiredTensorIsOneSideOfTheSame",
  "Same-basis regional residuals require the shared atlas hash used by source and metric tensor artifacts.": "theoryBadgeGraph.shared.sameBasisRegionalResidualsRequireTheSharedAtlasHashUsed",
  "Same-basis regional residuals need component-authorized source tensors before residuals can be interpreted.": "theoryBadgeGraph.shared.sameBasisRegionalResidualsNeedComponentAuthorizedSourceTensorsBefore",
  "Region-shaped source tensors need support-derivative terms before conservation diagnostics can be interpreted.": "theoryBadgeGraph.shared.regionShapedSourceTensorsNeedSupportDerivativeTermsBeforeConservation",
  "Observer energy-density projection contributes to WEC/NEC/SEC/DEC diagnostics.": "theoryBadgeGraph.shared.observerEnergyDensityProjectionContributesToWecNecSecDec",
  "Observer momentum-density projection contributes to WEC/NEC/SEC/DEC diagnostics.": "theoryBadgeGraph.shared.observerMomentumDensityProjectionContributesToWecNecSecDec",
  "Observer spatial-stress projection contributes to WEC/NEC/SEC/DEC diagnostics.": "theoryBadgeGraph.shared.observerSpatialStressProjectionContributesToWecNecSecDec",
  "Observer-family energy-condition diagnostics are constrained by QEI-style worldline sampling requirements.": "theoryBadgeGraph.shared.observerFamilyEnergyConditionDiagnosticsAreConstrainedByQeiStyle",
  "The QEI dossier must include wall-region source-closure context before scalar margin language is trusted.": "theoryBadgeGraph.shared.theQeiDossierMustIncludeWallRegionSourceClosureContext",
  "QEI worldlines must be planned against the same regional atlas used by source residuals.": "theoryBadgeGraph.shared.qeiWorldlinesMustBePlannedAgainstTheSameRegionalAtlas",
  "Observer sampling must reference the same regional atlas as the coupled closure candidate.": "theoryBadgeGraph.shared.observerSamplingMustReferenceTheSameRegionalAtlasAsThe",
  "The worldline sampling requirement must be collected into a reproducible QEI dossier.": "theoryBadgeGraph.shared.theWorldlineSamplingRequirementMustBeCollectedIntoAReproducible",
  "The coupled closure candidate reads source component authority as one evidence-admission gate.": "theoryBadgeGraph.shared.theCoupledClosureCandidateReadsSourceComponentAuthorityAsOne",
  "The coupled closure candidate requires source-side same-basis tensor authority.": "theoryBadgeGraph.shared.theCoupledClosureCandidateRequiresSourceSideSameBasisTensor",
  "Regional residuals feed the synchronized coupled closure candidate.": "theoryBadgeGraph.shared.regionalResidualsFeedTheSynchronizedCoupledClosureCandidate",
  "The coupled closure candidate requires conservation diagnostics for the source tensor path.": "theoryBadgeGraph.shared.theCoupledClosureCandidateRequiresConservationDiagnosticsForTheSource",
  "The coupled closure candidate requires a same-run QEI worldline dossier.": "theoryBadgeGraph.shared.theCoupledClosureCandidateRequiresASameRunQeiWorldline",
  "The coupled closure candidate requires observer-robust energy-condition status.": "theoryBadgeGraph.shared.theCoupledClosureCandidateRequiresObserverRobustEnergyConditionStatus",
  "The coupled closure candidate requires material receipt evidence before source rows can be interpreted.": "theoryBadgeGraph.shared.theCoupledClosureCandidateRequiresMaterialReceiptEvidenceBeforeSource",
  "The regional pass-path harness consumes the coupled closure candidate as one readiness gate.": "theoryBadgeGraph.shared.theRegionalPassPathHarnessConsumesTheCoupledClosureCandidate",
  "The regional pass-path harness keeps NHM2 in diagnostic/reduced-order wording until all gates pass together.": "theoryBadgeGraph.shared.theRegionalPassPathHarnessKeepsNhm2InDiagnosticReduced",
  "The frozen time-dependent campaign is stricter than the static regional pass-path harness and consumes it as one diagnostic prerequisite.": "theoryBadgeGraph.shared.theFrozenTimeDependentCampaignIsStricterThanTheStatic",
  "The static regional harness supplies upstream context, but switching conservation must carry its own dynamic terms.": "theoryBadgeGraph.shared.theStaticRegionalHarnessSuppliesUpstreamContextButSwitchingConservation",
  "The time-dependent campaign requires switching conservation evidence across support, sector, time-derivative, and transition-kernel terms.": "theoryBadgeGraph.shared.theTimeDependentCampaignRequiresSwitchingConservationEvidenceAcrossSupport",
  "The time-dependent campaign requires fixed-cycle-average convergence over the frequency ladder.": "theoryBadgeGraph.shared.theTimeDependentCampaignRequiresFixedCycleAverageConvergenceOver",
  "The time-dependent campaign requires dynamic/effective geometry agreement and bounded backreaction evidence.": "theoryBadgeGraph.shared.theTimeDependentCampaignRequiresDynamicEffectiveGeometryAgreementAnd",
  "The source-side shear audit sharpens off-diagonal Tij failures inside the frozen time-dependent campaign.": "theoryBadgeGraph.shared.theSourceSideShearAuditSharpensOffDiagonalTijFailures",
  "The momentum audit supplies same-chart T0i/T00 ratios that require a local-frame projection receipt before causal-bound interpretation.": "theoryBadgeGraph.shared.theMomentumAuditSuppliesSameChartT0iT00RatiosThat",
  "The projection receipt supplies local-frame momentum ratios for the metric-required momentum demand audit.": "theoryBadgeGraph.shared.theProjectionReceiptSuppliesLocalFrameMomentumRatiosForThe",
  "The metric-required momentum demand audit supplies the projected T0i ratios used to compute current-profile remediation targets.": "theoryBadgeGraph.shared.theMetricRequiredMomentumDemandAuditSuppliesTheProjectedT0i",
  "The metric momentum remediation targets sharpen the campaign blocker into a typed current-profile frontier disposition.": "theoryBadgeGraph.shared.theMetricMomentumRemediationTargetsSharpenTheCampaignBlockerInto",
  "The campaign frontier disposition records whether the current profile is rejected before the campaign continues to downstream proof gates.": "theoryBadgeGraph.shared.theCampaignFrontierDispositionRecordsWhetherTheCurrentProfileIs",
  "The campaign frontier disposition supplies the current-profile rejection and suppression target used to screen redesigned profiles.": "theoryBadgeGraph.shared.theCampaignFrontierDispositionSuppliesTheCurrentProfileRejectionAnd",
  "The profile search identifies candidate profiles that still require a full frozen time-dependent campaign run.": "theoryBadgeGraph.shared.theProfileSearchIdentifiesCandidateProfilesThatStillRequireA",
  "A screened candidate must be written as an executable profile spec before the full ADM tensor route can evaluate it.": "theoryBadgeGraph.shared.aScreenedCandidateMustBeWrittenAsAnExecutableProfile",
  "The run manifest consumes the candidate profile spec as the first frozen-campaign evidence row.": "theoryBadgeGraph.shared.theRunManifestConsumesTheCandidateProfileSpecAsThe",
  "Candidate same-chart full tensor evidence requires executable candidate geometry from the metric profile spec.": "theoryBadgeGraph.shared.candidateSameChartFullTensorEvidenceRequiresExecutableCandidateGeometry",
  "The profile-search output supplies the screened candidates that the run manifest turns into frozen campaign evidence requirements.": "theoryBadgeGraph.shared.theProfileSearchOutputSuppliesTheScreenedCandidatesThatThe",
  "The time-dependent campaign can only rank a candidate after the manifest evidence rows are produced for that profile.": "theoryBadgeGraph.shared.theTimeDependentCampaignCanOnlyRankACandidateAfter",
  "The time-dependent source campaign keeps NHM2 behind diagnostic-only language until dynamic gates pass together.": "theoryBadgeGraph.shared.theTimeDependentSourceCampaignKeepsNhm2BehindDiagnosticOnly",
  "The Lean certificate exporter consumes the pinned time-dependent campaign artifacts as certificate inputs.": "theoryBadgeGraph.shared.theLeanCertificateExporterConsumesThePinnedTimeDependentCampaign",
  "The Lean certificate is scoped by profile, atlas, and artifact hash provenance.": "theoryBadgeGraph.shared.theLeanCertificateIsScopedByProfileAtlasAndArtifact",
  "Lean checks the emitted certificate facts before the diagnostic campaign admissibility theorem is available.": "theoryBadgeGraph.shared.leanChecksTheEmittedCertificateFactsBeforeTheDiagnosticCampaign",
  "Negative fixtures document that missing, stale, scalar-only, narrow-frame, or open-lock evidence fails closed.": "theoryBadgeGraph.shared.negativeFixturesDocumentThatMissingStaleScalarOnlyNarrowFrame",
  "The Lean diagnostic-admissibility theorem requires closed claim locks.": "theoryBadgeGraph.shared.theLeanDiagnosticAdmissibilityTheoremRequiresClosedClaimLocks",
  "Lean claim locks keep formal campaign admissibility behind the diagnostic-only boundary.": "theoryBadgeGraph.shared.leanClaimLocksKeepFormalCampaignAdmissibilityBehindTheDiagnostic",
  "Lean diagnostic admissibility documents the policy-scoped campaign result.": "theoryBadgeGraph.shared.leanDiagnosticAdmissibilityDocumentsThePolicyScopedCampaignResult",
  "The diagnostic campaign provides the computational input to the physical evidence ladder.": "theoryBadgeGraph.shared.theDiagnosticCampaignProvidesTheComputationalInputToThePhysical",
  "Lean claim locks document that the physical evidence ladder starts with physical and transport claims closed.": "theoryBadgeGraph.shared.leanClaimLocksDocumentThatThePhysicalEvidenceLadderStarts",
  "The physical evidence campaign points to the experiment-facing theory roadmap for pre-hardware observables, receipts, and falsifiers.": "theoryBadgeGraph.shared.thePhysicalEvidenceCampaignPointsToTheExperimentFacingTheory",
  "The experiment-facing roadmap is refined into stage-level parameter targets, literature comparators, receipts, and blockers.": "theoryBadgeGraph.shared.theExperimentFacingRoadmapIsRefinedIntoStageLevelParameter",
  "Parameter targets are refined into research gaps, precedent receipts, falsifiers, null-result meanings, and claim-impact rows.": "theoryBadgeGraph.shared.parameterTargetsAreRefinedIntoResearchGapsPrecedentReceiptsFalsifiers",
  "The research-gap ledger marks 447-layer stack scaling as a P0 parameter-regime gap.": "theoryBadgeGraph.shared.theResearchGapLedgerMarks447LayerStackScalingAs",
  "The research-gap ledger identifies mechanical survivability of the 447-layer stack as a value-of-information target.": "theoryBadgeGraph.shared.theResearchGapLedgerIdentifiesMechanicalSurvivabilityOfThe447",
  "The research-gap ledger motivates a support-fraction sweep to test whether stress limits and active-source retention overlap.": "theoryBadgeGraph.shared.theResearchGapLedgerMotivatesASupportFractionSweepTo",
  "The research-gap ledger records QEI worldline applicability and null-result meaning as a P0 theory-to-measurement gap.": "theoryBadgeGraph.shared.theResearchGapLedgerRecordsQeiWorldlineApplicabilityAndNull",
  "The research-gap ledger records observer-robust integration as a P0 blocker for energy-condition language.": "theoryBadgeGraph.shared.theResearchGapLedgerRecordsObserverRobustIntegrationAsA",
  "Open research gaps keep physical viability locked until receipts and null-result dispositions are produced.": "theoryBadgeGraph.shared.openResearchGapsKeepPhysicalViabilityLockedUntilReceiptsAnd",
  "Parameter targets identify which predictions and uncertainty bounds must be frozen before data collection.": "theoryBadgeGraph.shared.parameterTargetsIdentifyWhichPredictionsAndUncertaintyBoundsMustBe",
  "Parameter targets expose the gap, area, pressure, material, and systematic receipts required by tile metrology.": "theoryBadgeGraph.shared.parameterTargetsExposeTheGapAreaPressureMaterialAndSystematic",
  "Parameter targets expose the 8 nm, 10 mm x 10 mm, and 447-layer scalar load inputs consumed by the mechanical receipt.": "theoryBadgeGraph.shared.parameterTargetsExposeThe8Nm10MmX10",
  "Parameter targets provide the area, force, and layer count used to sweep support fraction versus source retention.": "theoryBadgeGraph.shared.parameterTargetsProvideTheAreaForceAndLayerCountUsed",
  "Parameter targets connect the weak-field h00 proxy to detector and multi-probe metric-response planning.": "theoryBadgeGraph.shared.parameterTargetsConnectTheWeakFieldH00ProxyToDetector",
  "The roadmap enumerates the theoretical solves that must be frozen before experimental data are used.": "theoryBadgeGraph.shared.theRoadmapEnumeratesTheTheoreticalSolvesThatMustBeFrozen",
  "The physical evidence campaign requires pre-registered predictions and falsifiers before data collection.": "theoryBadgeGraph.shared.thePhysicalEvidenceCampaignRequiresPreRegisteredPredictionsAndFalsifiers",
  "Tile metrology must be evaluated against frozen predictions rather than post-hoc target fitting.": "theoryBadgeGraph.shared.tileMetrologyMustBeEvaluatedAgainstFrozenPredictionsRatherThan",
  "The measured tile force receipt requires closed cyclic energy accounting.": "theoryBadgeGraph.shared.theMeasuredTileForceReceiptRequiresClosedCyclicEnergyAccounting",
  "Array scaling can only be reviewed after individual tile metrology is receipted.": "theoryBadgeGraph.shared.arrayScalingCanOnlyBeReviewedAfterIndividualTileMetrology",
  "Array scaling review requires the 447-layer stack to survive pull-in, support, thermal, fatigue, and active-control constraints.": "theoryBadgeGraph.shared.arrayScalingReviewRequiresThe447LayerStackToSurvive",
  "The support-fraction sweep consumes the mechanical receipt's ideal stack load and stress scale.": "theoryBadgeGraph.shared.theSupportFractionSweepConsumesTheMechanicalReceiptSIdeal",
  "Array scaling requires a support fraction that can carry load while preserving active Casimir area.": "theoryBadgeGraph.shared.arrayScalingRequiresASupportFractionThatCanCarryLoad",
  "The no-overlap support-fraction blocker motivates architectures that decouple load bearing from active area loss.": "theoryBadgeGraph.shared.theNoOverlapSupportFractionBlockerMotivatesArchitecturesThatDecouple",
  "Array scaling must consume a load-path architecture that preserves active source area and pull-in margin.": "theoryBadgeGraph.shared.arrayScalingMustConsumeALoadPathArchitectureThatPreserves",
  "Architecture review rows must be converted into material, pull-in, metrology, control, fatigue, layer-scaling, and tensor receipt rows.": "theoryBadgeGraph.shared.architectureReviewRowsMustBeConvertedIntoMaterialPullIn",
  "Array scaling review requires receipts for the selected architecture before treating the 447-layer route as an engineering candidate.": "theoryBadgeGraph.shared.arrayScalingReviewRequiresReceiptsForTheSelectedArchitectureBefore",
  "The receipt loop enumerates support, spacer, active-control, thermal, electrostatic, fatigue, and layer-scaling terms that must enter the apparatus tensor.": "theoryBadgeGraph.shared.theReceiptLoopEnumeratesSupportSpacerActiveControlThermalElectrostatic",
  "The tile-source validation plan freezes the strongest 447-layer candidate only after enumerating material, pull-in, metrology, control, fatigue, layer-scaling, and full-apparatus tensor receipt targets.": "theoryBadgeGraph.shared.theTileSourceValidationPlanFreezesTheStrongest447Layer",
  "The plan requires a full apparatus tensor before source-side tensor authority can treat the tile stack as a source candidate.": "theoryBadgeGraph.shared.thePlanRequiresAFullApparatusTensorBeforeSourceSide",
  "A physically credible source candidate must feed the same-chart, same-basis, no-target-echo source authority gate.": "theoryBadgeGraph.shared.aPhysicallyCredibleSourceCandidateMustFeedTheSameChart",
  "The plan only becomes useful to the full solve when regional residual, conservation, QEI, observer, material, and coupled-closure gates pass together.": "theoryBadgeGraph.shared.thePlanOnlyBecomesUsefulToTheFullSolveWhen",
  "Missing tile-source physical validation receipts keep physical viability locked even when a diagnostic campaign profile passes.": "theoryBadgeGraph.shared.missingTileSourcePhysicalValidationReceiptsKeepPhysicalViabilityLocked",
  "Support, spacer, drive, thermal, and electrostatic terms identified by the architecture loop must enter the full apparatus tensor.": "theoryBadgeGraph.shared.supportSpacerDriveThermalAndElectrostaticTermsIdentifiedByThe",
  "Missing material, pull-in, roughness, patch, active-control, or tensor receipts keep the 447-layer architecture at diagnostic review.": "theoryBadgeGraph.shared.missingMaterialPullInRoughnessPatchActiveControlOrTensor",
  "Missing full-apparatus receipts keep the 447-layer architecture from becoming physical evidence.": "theoryBadgeGraph.shared.missingFullApparatusReceiptsKeepThe447LayerArchitectureFrom",
  "If stress and source-retention windows do not overlap, the 447-layer route remains blocked before physical review.": "theoryBadgeGraph.shared.ifStressAndSourceRetentionWindowsDoNotOverlapThe",
  "Open mechanical receipt blockers keep physical viability locked even when scalar wall T00 arithmetic improves.": "theoryBadgeGraph.shared.openMechanicalReceiptBlockersKeepPhysicalViabilityLockedEvenWhen",
  "Array scaling must include full apparatus stress-energy, not only ideal interaction energy.": "theoryBadgeGraph.shared.arrayScalingMustIncludeFullApparatusStressEnergyNotOnly",
  "Vacuum-weight review requires a characterized source array and energy ledger.": "theoryBadgeGraph.shared.vacuumWeightReviewRequiresACharacterizedSourceArrayAndEnergy",
  "Weak-field scalar estimates inform detector scale before invariant metric-response receipts are available.": "theoryBadgeGraph.shared.weakFieldScalarEstimatesInformDetectorScaleBeforeInvariantMetric",
  "A metric-response experiment should follow a characterized source and vacuum-weight receipt.": "theoryBadgeGraph.shared.aMetricResponseExperimentShouldFollowACharacterizedSourceAnd",
  "Physical viability remains locked until replicated source and invariant metric-response receipts exist.": "theoryBadgeGraph.shared.physicalViabilityRemainsLockedUntilReplicatedSourceAndInvariantMetric",
  "Independent replication is required before physical viability review can proceed.": "theoryBadgeGraph.shared.independentReplicationIsRequiredBeforePhysicalViabilityReviewCanProceed",
  "Transport review remains downstream of physical-source and metric-response evidence.": "theoryBadgeGraph.shared.transportReviewRemainsDownstreamOfPhysicalSourceAndMetricResponse",
  "Transport remains locked until neutral test-worldline response is measured and replicated.": "theoryBadgeGraph.shared.transportRemainsLockedUntilNeutralTestWorldlineResponseIsMeasured",
  "Natario-adjacent curvature diagnostics document why tensor and momentum authority remain visible.": "theoryBadgeGraph.shared.natarioAdjacentCurvatureDiagnosticsDocumentWhyTensorAndMomentumAuthority",
  "Natario invariant and stability diagnostics inform observer-robust energy-condition review.": "theoryBadgeGraph.shared.natarioInvariantAndStabilityDiagnosticsInformObserverRobustEnergyCondition",
  "Observer-robust energy-condition incompleteness keeps NHM2 in diagnostic-only claim language.": "theoryBadgeGraph.shared.observerRobustEnergyConditionIncompletenessKeepsNhm2InDiagnosticOnly",
  "Closure remains blocked when tensor authority is partial, diagonal-only, or review-gated.": "theoryBadgeGraph.shared.closureRemainsBlockedWhenTensorAuthorityIsPartialDiagonalOnly",
  "The wall T00 residual keeps NHM2 in diagnostic/reduced-order wording.": "theoryBadgeGraph.shared.theWallT00ResidualKeepsNhm2InDiagnosticReducedOrder",
  "Atlas congruence cannot promote NHM2 into material, conservation, QEI, observer, or transport claims.": "theoryBadgeGraph.shared.atlasCongruenceCannotPromoteNhm2IntoMaterialConservationQeiObserver",
  "Same-atlas consumer congruence points at the atlas-specific claim boundary.": "theoryBadgeGraph.shared.sameAtlasConsumerCongruencePointsAtTheAtlasSpecificClaim",
  "Lapse-shift profile rows must not be interpreted as ordinary vehicle velocity.": "theoryBadgeGraph.shared.lapseShiftProfileRowsMustNotBeInterpretedAsOrdinary",
  "Centerline clocking targets must not be promoted into route results.": "theoryBadgeGraph.shared.centerlineClockingTargetsMustNotBePromotedIntoRouteResults",
  "Trip clocking must stay behind the expected-clocking-not-route-result claim boundary.": "theoryBadgeGraph.shared.tripClockingMustStayBehindTheExpectedClockingNotRoute",
  "The profile index records profile-scoped trip clocking diagnostics behind the Twin Paradox clocking surface.": "theoryBadgeGraph.shared.theProfileIndexRecordsProfileScopedTripClockingDiagnosticsBehind",
  "The profile index keeps 0p995 and 0p7000 as diagnostic clocking rows rather than route-result rows.": "theoryBadgeGraph.shared.theProfileIndexKeeps0p995And0p7000AsDiagnosticClocking",
  "QEI literature constrains the route but does not complete the repository dossier.": "theoryBadgeGraph.shared.qeiLiteratureConstrainsTheRouteButDoesNotCompleteThe",
  "The QEI dossier must be repository evidence and cannot be substituted by literature context.": "theoryBadgeGraph.shared.theQeiDossierMustBeRepositoryEvidenceAndCannotBe",
  "Frozen-run provenance documents which rows are diagnostic, review, blocked, or unsupported.": "theoryBadgeGraph.shared.frozenRunProvenanceDocumentsWhichRowsAreDiagnosticReviewBlocked",
  "The literature boundary documents the broader NHM2 diagnostic-only claim lock.": "theoryBadgeGraph.shared.theLiteratureBoundaryDocumentsTheBroaderNhm2DiagnosticOnlyClaim",
  "Surface temperature proxy depends on compatible temperature, luminosity, and radius units.": "theoryBadgeGraph.shared.surfaceTemperatureProxyDependsOnCompatibleTemperatureLuminosityAndRadius",
  "Luminosity is an energy-per-time observable in the surface-temperature proxy.": "theoryBadgeGraph.shared.luminosityIsAnEnergyPerTimeObservableInTheSurface",
  "Surface gravity requires consistent mass, radius, and constant units.": "theoryBadgeGraph.shared.surfaceGravityRequiresConsistentMassRadiusAndConstantUnits",
  "Mean density requires compatible mass and radius dimensions.": "theoryBadgeGraph.shared.meanDensityRequiresCompatibleMassAndRadiusDimensions",
  "Energy-density and mass-density prompts often share density vocabulary.": "theoryBadgeGraph.shared.energyDensityAndMassDensityPromptsOftenShareDensityVocabulary",
  "Gravity observables provide context for hydrostatic balance.": "theoryBadgeGraph.shared.gravityObservablesProvideContextForHydrostaticBalance",
  "Mean density is the scalar proxy nearest the mass-continuity reference.": "theoryBadgeGraph.shared.meanDensityIsTheScalarProxyNearestTheMassContinuity",
  "Luminosity generation references density and enclosed structure context.": "theoryBadgeGraph.shared.luminosityGenerationReferencesDensityAndEnclosedStructureContext",
  "The core-temperature proxy approximates hydrostatic structure context with compactness scaling.": "theoryBadgeGraph.shared.theCoreTemperatureProxyApproximatesHydrostaticStructureContextWithCompactness",
  "The core-density proxy scales from observable mass and radius context.": "theoryBadgeGraph.shared.theCoreDensityProxyScalesFromObservableMassAndRadius",
  "Surface temperature helps route lower-mass main-sequence fusion classification.": "theoryBadgeGraph.shared.surfaceTemperatureHelpsRouteLowerMassMainSequenceFusionClassification",
  "Surface temperature helps route hotter main-sequence fusion classification.": "theoryBadgeGraph.shared.surfaceTemperatureHelpsRouteHotterMainSequenceFusionClassification",
  "Core-temperature proxy provides context for hotter-channel classification.": "theoryBadgeGraph.shared.coreTemperatureProxyProvidesContextForHotterChannelClassification",
  "Core-density proxy provides context for pp-chain classification.": "theoryBadgeGraph.shared.coreDensityProxyProvidesContextForPpChainClassification",
  "Fusion-channel context informs which runtime fusion zone is summarized.": "theoryBadgeGraph.shared.fusionChannelContextInformsWhichRuntimeFusionZoneIsSummarized",
  "CNO-channel context informs which runtime fusion zone is summarized.": "theoryBadgeGraph.shared.cnoChannelContextInformsWhichRuntimeFusionZoneIsSummarized",
  "Runtime evaluation applies fusion-channel selection logic.": "theoryBadgeGraph.shared.runtimeEvaluationAppliesFusionChannelSelectionLogic",
  "Runtime evaluation applies hot-star fusion-channel selection logic.": "theoryBadgeGraph.shared.runtimeEvaluationAppliesHotStarFusionChannelSelectionLogic",
  "Compact-object guardrail feeds runtime classification.": "theoryBadgeGraph.shared.compactObjectGuardrailFeedsRuntimeClassification",
  "Fusion-zone scalar summaries sit beside the runtime evaluation.": "theoryBadgeGraph.shared.fusionZoneScalarSummariesSitBesideTheRuntimeEvaluation",
  "Sun-like pp-chain context supplies the hydrogen-burning branch that the restoration forecast references.": "theoryBadgeGraph.shared.sunLikePpChainContextSuppliesTheHydrogenBurningBranch",
  "Hydrogen-burning luminosity context feeds the one-zone composition-balance proxy.": "theoryBadgeGraph.shared.hydrogenBurningLuminosityContextFeedsTheOneZoneCompositionBalance",
  "The tachocline downflow setpoint solves the mass-flux closure for radial speed.": "theoryBadgeGraph.shared.theTachoclineDownflowSetpointSolvesTheMassFluxClosureFor",
  "The imported hydrogen mass flux feeds the one-zone core-hydrogen balance proxy.": "theoryBadgeGraph.shared.theImportedHydrogenMassFluxFeedsTheOneZoneCore",
  "The composition-balance branch feeds the fuel-budget lifetime-extension proxy.": "theoryBadgeGraph.shared.theCompositionBalanceBranchFeedsTheFuelBudgetLifetimeExtension",
  "Core hydrogen fraction context feeds the red-giant transition hazard proxy.": "theoryBadgeGraph.shared.coreHydrogenFractionContextFeedsTheRedGiantTransitionHazard",
  "Telemetry guardrails bound the downflow setpoint branch.": "theoryBadgeGraph.shared.telemetryGuardrailsBoundTheDownflowSetpointBranch",
  "Luminosity, core-temperature, seismic, and neutrino constraints bound the composition proxy.": "theoryBadgeGraph.shared.luminosityCoreTemperatureSeismicAndNeutrinoConstraintsBoundTheComposition",
  "Mass-flux restoration rows terminate in the planning-only boundary.": "theoryBadgeGraph.shared.massFluxRestorationRowsTerminateInThePlanningOnlyBoundary",
  "Lifetime-extension forecasts terminate in the planning-only boundary.": "theoryBadgeGraph.shared.lifetimeExtensionForecastsTerminateInThePlanningOnlyBoundary",
  "Transition-hazard rows terminate in the planning-only boundary.": "theoryBadgeGraph.shared.transitionHazardRowsTerminateInThePlanningOnlyBoundary",
  "The StarSim Stage 1 boundary also bounds the solar-restoration branch.": "theoryBadgeGraph.shared.theStarsimStage1BoundaryAlsoBoundsTheSolarRestoration",
  "Surface-temperature proxy supplies the reduced CNO temperature margin.": "theoryBadgeGraph.shared.surfaceTemperatureProxySuppliesTheReducedCnoTemperatureMargin",
  "Core-temperature proxy sits beside the CNO temperature threshold context.": "theoryBadgeGraph.shared.coreTemperatureProxySitsBesideTheCnoTemperatureThresholdContext",
  "Mass/radius observable context supports compactness-scale calculation.": "theoryBadgeGraph.shared.massRadiusObservableContextSupportsCompactnessScaleCalculation",
  "Compactness-scale row helps explain runtime classification context.": "theoryBadgeGraph.shared.compactnessScaleRowHelpsExplainRuntimeClassificationContext",
  "Brown-dwarf mass margin helps explain inactive-fusion routing.": "theoryBadgeGraph.shared.brownDwarfMassMarginHelpsExplainInactiveFusionRouting",
  "CNO mass margin helps explain hot/high-mass routing.": "theoryBadgeGraph.shared.cnoMassMarginHelpsExplainHotHighMassRouting",
  "CNO temperature margin helps explain hot-star routing.": "theoryBadgeGraph.shared.cnoTemperatureMarginHelpsExplainHotStarRouting",
  "The structure-weight scalar is one expression used around StarMap graph construction.": "theoryBadgeGraph.shared.theStructureWeightScalarIsOneExpressionUsedAroundStarmap",
  "StarSim runtime outputs carry Stage 1 boundary notes.": "theoryBadgeGraph.shared.starsimRuntimeOutputsCarryStage1BoundaryNotes",
  "StarMap graph outputs carry structure-prior boundary notes.": "theoryBadgeGraph.shared.starmapGraphOutputsCarryStructurePriorBoundaryNotes",
  "Parallax distance keeps angle and distance units explicit.": "theoryBadgeGraph.shared.parallaxDistanceKeepsAngleAndDistanceUnitsExplicit",
  "Spectral redshift depends on wavelength as the observable coordinate.": "theoryBadgeGraph.shared.spectralRedshiftDependsOnWavelengthAsTheObservableCoordinate",
  "Low-z Hubble distance uses c in km/s.": "theoryBadgeGraph.shared.lowZHubbleDistanceUsesCInKmS",
  "A measured redshift can be converted into scale-factor context.": "theoryBadgeGraph.shared.aMeasuredRedshiftCanBeConvertedIntoScaleFactorContext",
  "Small redshift can feed the Hubble-law distance approximation.": "theoryBadgeGraph.shared.smallRedshiftCanFeedTheHubbleLawDistanceApproximation",
  "Scale factor is represented in the existing Accordion cosmology context.": "theoryBadgeGraph.shared.scaleFactorIsRepresentedInTheExistingAccordionCosmologyContext",
  "Parallax anchors local calibration before Cepheid ladder use.": "theoryBadgeGraph.shared.parallaxAnchorsLocalCalibrationBeforeCepheidLadderUse",
  "Cepheid absolute magnitude feeds the distance modulus rung.": "theoryBadgeGraph.shared.cepheidAbsoluteMagnitudeFeedsTheDistanceModulusRung",
  "Standard-candle distances carry calibration and uncertainty boundaries.": "theoryBadgeGraph.shared.standardCandleDistancesCarryCalibrationAndUncertaintyBoundaries",
  "Hubble distance estimates carry cosmology model boundaries.": "theoryBadgeGraph.shared.hubbleDistanceEstimatesCarryCosmologyModelBoundaries",
  "Accordion cosmology context carries bound-system caveats.": "theoryBadgeGraph.shared.accordionCosmologyContextCarriesBoundSystemCaveats",
  "Photon energy from wavelength uses c.": "theoryBadgeGraph.shared.photonEnergyFromWavelengthUsesC",
  "The solar photon energy row specializes the Planck relation.": "theoryBadgeGraph.shared.theSolarPhotonEnergyRowSpecializesThePlanckRelation",
  "The Planck curve depends on photon-energy scale and wavelength context.": "theoryBadgeGraph.shared.thePlanckCurveDependsOnPhotonEnergyScaleAndWavelength",
  "Wien's law summarizes the ideal blackbody peak.": "theoryBadgeGraph.shared.wienSLawSummarizesTheIdealBlackbodyPeak",
  "Temperature links the peak relation to luminosity estimates.": "theoryBadgeGraph.shared.temperatureLinksThePeakRelationToLuminosityEstimates",
  "Doppler shift requires an explicit rest-line reference.": "theoryBadgeGraph.shared.dopplerShiftRequiresAnExplicitRestLineReference",
  "Radial-velocity proxy multiplies the spectral shift by c.": "theoryBadgeGraph.shared.radialVelocityProxyMultipliesTheSpectralShiftByC",
  "Solar Doppler shift and cosmic redshift share a wavelength-ratio form.": "theoryBadgeGraph.shared.solarDopplerShiftAndCosmicRedshiftShareAWavelengthRatio",
  "Zeeman wavelength splitting requires a reference line.": "theoryBadgeGraph.shared.zeemanWavelengthSplittingRequiresAReferenceLine",
  "Solar runtime analysis rows must preserve observational proxy boundaries.": "theoryBadgeGraph.shared.solarRuntimeAnalysisRowsMustPreserveObservationalProxyBoundaries",
  "Flare energy proxy uses power over event duration.": "theoryBadgeGraph.shared.flareEnergyProxyUsesPowerOverEventDuration",
  "Solar flare energy proxies must point to the observation boundary.": "theoryBadgeGraph.shared.solarFlareEnergyProxiesMustPointToTheObservationBoundary",
  "Solar velocity proxies require observational calibration context.": "theoryBadgeGraph.shared.solarVelocityProxiesRequireObservationalCalibrationContext",
  "Solar reference products provide provenance context for helioseismic interior comparisons.": "theoryBadgeGraph.shared.solarReferenceProductsProvideProvenanceContextForHelioseismicInteriorComparisons",
  "Solar reference products document calibrated neutrino flux context.": "theoryBadgeGraph.shared.solarReferenceProductsDocumentCalibratedNeutrinoFluxContext",
  "Magnetogram and solar-cycle context can condition nanoflare heating diagnostics.": "theoryBadgeGraph.shared.magnetogramAndSolarCycleContextCanConditionNanoflareHeatingDiagnostics",
  "Impulsive heating context can be compared with flare-to-sunquake timing diagnostics.": "theoryBadgeGraph.shared.impulsiveHeatingContextCanBeComparedWithFlareToSunquake",
  "Hydrostatic structure documents the stellar-interior context around helioseismic sound-speed comparisons.": "theoryBadgeGraph.shared.hydrostaticStructureDocumentsTheStellarInteriorContextAroundHelioseismicSound",
  "Hydrostatic structure provides stellar-interior context for reaction-network rows.": "theoryBadgeGraph.shared.hydrostaticStructureProvidesStellarInteriorContextForReactionNetworkRows",
  "Sunquake timing rows must expose their diagnostic boundary.": "theoryBadgeGraph.shared.sunquakeTimingRowsMustExposeTheirDiagnosticBoundary",
  "Solar reference rows must expose observational/provenance boundaries.": "theoryBadgeGraph.shared.solarReferenceRowsMustExposeObservationalProvenanceBoundaries",
  "Nucleosynthesis context rows must remain reduced-order unless runtime receipts are attached.": "theoryBadgeGraph.shared.nucleosynthesisContextRowsMustRemainReducedOrderUnlessRuntimeReceipts",
  "Stellar nucleosynthesis provides the carbon-enrichment context for aromatic astrochemistry.": "theoryBadgeGraph.shared.stellarNucleosynthesisProvidesTheCarbonEnrichmentContextForAromaticAstrochemistry",
  "Aromatic carbon context documents fullerene C60 spectral chemistry.": "theoryBadgeGraph.shared.aromaticCarbonContextDocumentsFullereneC60SpectralChemistry",
  "Aromatic carbon detections require laboratory spectroscopy as the molecular-fingerprint basis.": "theoryBadgeGraph.shared.aromaticCarbonDetectionsRequireLaboratorySpectroscopyAsTheMolecularFingerprint",
  "Laboratory molecular fingerprints document small-organic dense-cloud inventory rows.": "theoryBadgeGraph.shared.laboratoryMolecularFingerprintsDocumentSmallOrganicDenseCloudInventoryRows",
  "Small-organic inventory claims require the spectral/model inference boundary.": "theoryBadgeGraph.shared.smallOrganicInventoryClaimsRequireTheSpectralModelInferenceBoundary",
  "Small-organic prebiotic inventory context documents the adjacent PO/PN phosphorus lane.": "theoryBadgeGraph.shared.smallOrganicPrebioticInventoryContextDocumentsTheAdjacentPoPn",
  "Aromatic carbon context documents the broader C60/C70 carbon-cage fullerene family.": "theoryBadgeGraph.shared.aromaticCarbonContextDocumentsTheBroaderC60C70CarbonCage",
  "The existing C60 row documents the broader C60/C70 fullerene-family context.": "theoryBadgeGraph.shared.theExistingC60RowDocumentsTheBroaderC60C70Fullerene",
  "Fullerene-family detections are blocked from promotion into life or abiogenesis claims.": "theoryBadgeGraph.shared.fullereneFamilyDetectionsAreBlockedFromPromotionIntoLifeOr",
  "Aromatic carbon context documents PAH-family spectral chemistry.": "theoryBadgeGraph.shared.aromaticCarbonContextDocumentsPahFamilySpectralChemistry",
  "Aromatic carbon context documents complex organic molecule inventory evidence in dense sources.": "theoryBadgeGraph.shared.aromaticCarbonContextDocumentsComplexOrganicMoleculeInventoryEvidenceIn",
  "Complex organic inventories require source-class and chemical-history context.": "theoryBadgeGraph.shared.complexOrganicInventoriesRequireSourceClassAndChemicalHistoryContext",
  "Complex organic inventory claims require spectral and chemistry-model inference boundaries.": "theoryBadgeGraph.shared.complexOrganicInventoryClaimsRequireSpectralAndChemistryModelInference",
  "Complex organic inventories document gas-grain and ice-mantle formation context.": "theoryBadgeGraph.shared.complexOrganicInventoriesDocumentGasGrainAndIceMantleFormation",
  "Gas-grain and ice-mantle chemistry bounds comparisons to meteoritic organic inventories.": "theoryBadgeGraph.shared.gasGrainAndIceMantleChemistryBoundsComparisonsToMeteoritic",
  "Source-class differentiation blocks universalized complex-organic inventory claims.": "theoryBadgeGraph.shared.sourceClassDifferentiationBlocksUniversalizedComplexOrganicInventoryClaims",
  "PAH-family astrochemistry can be compared with returned-sample organic inventory rows.": "theoryBadgeGraph.shared.pahFamilyAstrochemistryCanBeComparedWithReturnedSampleOrganic",
  "PO/PN molecular-cloud phosphorus context bounds planetary-delivery interpretation.": "theoryBadgeGraph.shared.poPnMolecularCloudPhosphorusContextBoundsPlanetaryDeliveryInterpretation",
  "Meteoritic inventory context documents the meteorite/comet delivery link.": "theoryBadgeGraph.shared.meteoriticInventoryContextDocumentsTheMeteoriteCometDeliveryLink",
  "Planetary-delivery interpretation requires the protoplanetary processing uncertainty boundary.": "theoryBadgeGraph.shared.planetaryDeliveryInterpretationRequiresTheProtoplanetaryProcessingUncertaintyBoundary",
  "Protoplanetary processing uncertainty blocks promotion into prebiotic consciousness claims.": "theoryBadgeGraph.shared.protoplanetaryProcessingUncertaintyBlocksPromotionIntoPrebioticConsciousnessClaims",
  "Protoplanetary processing uncertainty bounds later surface-catalysis interpretation.": "theoryBadgeGraph.shared.protoplanetaryProcessingUncertaintyBoundsLaterSurfaceCatalysisInterpretation",
  "Prebiotic inventories need environmental processing context such as photon fluence.": "theoryBadgeGraph.shared.prebioticInventoriesNeedEnvironmentalProcessingContextSuchAsPhotonFluence",
  "Organic inventories need mineral, salt, and aqueous alteration context before reaction-path interpretation.": "theoryBadgeGraph.shared.organicInventoriesNeedMineralSaltAndAqueousAlterationContextBefore",
  "Aromatic carbon chemistry can document speculative coupled-ring oscillator context.": "theoryBadgeGraph.shared.aromaticCarbonChemistryCanDocumentSpeculativeCoupledRingOscillatorContext",
  "Coupled-ring coherence discussion requires an explicit lifetime and candidate-timescale gate.": "theoryBadgeGraph.shared.coupledRingCoherenceDiscussionRequiresAnExplicitLifetimeAndCandidate",
  "A molecular coherence lifetime gate cannot promote into consciousness or objective-collapse validation.": "theoryBadgeGraph.shared.aMolecularCoherenceLifetimeGateCannotPromoteIntoConsciousnessOr",
  "Coupled molecular context can be discussed alongside membrane-bounded open-system entropy flow.": "theoryBadgeGraph.shared.coupledMolecularContextCanBeDiscussedAlongsideMembraneBoundedOpen",
  "Open-system thermodynamic boundaries constrain origin-of-life chemistry context.": "theoryBadgeGraph.shared.openSystemThermodynamicBoundariesConstrainOriginOfLifeChemistryContext",
  "Mineral and aqueous chemistry context bounds RNA-world reaction interpretations.": "theoryBadgeGraph.shared.mineralAndAqueousChemistryContextBoundsRnaWorldReactionInterpretations",
  "PAH-family astrochemistry cannot shortcut into dopamine or pleasure-law claims.": "theoryBadgeGraph.shared.pahFamilyAstrochemistryCannotShortcutIntoDopamineOrPleasureLaw",
  "Prebiotic organic inventories cannot shortcut into dopamine inheritance claims.": "theoryBadgeGraph.shared.prebioticOrganicInventoriesCannotShortcutIntoDopamineInheritanceClaims",
  "The dopamine shortcut boundary points to the broader prebiotic consciousness boundary.": "theoryBadgeGraph.shared.theDopamineShortcutBoundaryPointsToTheBroaderPrebioticConsciousness",
  "Coupled aromatic oscillators cannot promote into consciousness or objective-collapse validation.": "theoryBadgeGraph.shared.coupledAromaticOscillatorsCannotPromoteIntoConsciousnessOrObjectiveCollapse",
  "RNA catalytic context cannot promote into Orch-OR or consciousness validation.": "theoryBadgeGraph.shared.rnaCatalyticContextCannotPromoteIntoOrchOrOrConsciousness",
  "The prebiotic bridge boundary points to the broader Orch-OR exploratory boundary.": "theoryBadgeGraph.shared.thePrebioticBridgeBoundaryPointsToTheBroaderOrchOr",
  "Open-system membrane context documents later eukaryotic trait comparisons.": "theoryBadgeGraph.shared.openSystemMembraneContextDocumentsLaterEukaryoticTraitComparisons",
  "RNA catalytic context documents one prebiotic entry point before lineage comparisons.": "theoryBadgeGraph.shared.rnaCatalyticContextDocumentsOnePrebioticEntryPointBeforeLineage",
  "Phylogeny bounds how kingdom trait rows should be compared.": "theoryBadgeGraph.shared.phylogenyBoundsHowKingdomTraitRowsShouldBeCompared",
  "Selection context documents how trait changes can be framed across lineages.": "theoryBadgeGraph.shared.selectionContextDocumentsHowTraitChangesCanBeFramedAcross",
  "The eukaryotic trait matrix surfaces conserved microtubule scaffold context.": "theoryBadgeGraph.shared.theEukaryoticTraitMatrixSurfacesConservedMicrotubuleScaffoldContext",
  "The eukaryotic trait matrix surfaces plant photosynthetic light-harvesting context.": "theoryBadgeGraph.shared.theEukaryoticTraitMatrixSurfacesPlantPhotosyntheticLightHarvestingContext",
  "Photosynthetic coherence interpretation requires lifetime versus transfer-time comparison.": "theoryBadgeGraph.shared.photosyntheticCoherenceInterpretationRequiresLifetimeVersusTransferTimeComparison",
  "Photosynthetic and prebiotic coherence rows share lifetime-window diagnostic structure.": "theoryBadgeGraph.shared.photosyntheticAndPrebioticCoherenceRowsShareLifetimeWindowDiagnosticStructure",
  "Conserved microtubule scaffold context can document where Orch-OR microtubule rows attach.": "theoryBadgeGraph.shared.conservedMicrotubuleScaffoldContextCanDocumentWhereOrchOrMicrotubule",
  "Conserved microtubule context is blocked from promoting to consciousness validation.": "theoryBadgeGraph.shared.conservedMicrotubuleContextIsBlockedFromPromotingToConsciousnessValidation",
  "Photosynthetic coherence diagnostics are blocked from promoting to consciousness validation.": "theoryBadgeGraph.shared.photosyntheticCoherenceDiagnosticsAreBlockedFromPromotingToConsciousnessValidation",
  "Animal consciousness context bounds the evidence required before consciousness language is used.": "theoryBadgeGraph.shared.animalConsciousnessContextBoundsTheEvidenceRequiredBeforeConsciousnessLanguage",
  "The evolutionary biology boundary documents the adjacent Orch-OR exploratory boundary.": "theoryBadgeGraph.shared.theEvolutionaryBiologyBoundaryDocumentsTheAdjacentOrchOrExploratory",
  "Non-equilibrium flux interpretation requires an energy or entropy contrast.": "theoryBadgeGraph.shared.nonEquilibriumFluxInterpretationRequiresAnEnergyOrEntropyContrast",
  "Alkaline vent proton gradients are one concrete origin-of-life flux context.": "theoryBadgeGraph.shared.alkalineVentProtonGradientsAreOneConcreteOriginOfLife",
  "A proton-gradient interpretation requires separated phases or barriers.": "theoryBadgeGraph.shared.aProtonGradientInterpretationRequiresSeparatedPhasesOrBarriers",
  "Compartment structure can support local concentration before replication.": "theoryBadgeGraph.shared.compartmentStructureCanSupportLocalConcentrationBeforeReplication",
  "Local concentration context bounds downstream RNA-world interpretation.": "theoryBadgeGraph.shared.localConcentrationContextBoundsDownstreamRnaWorldInterpretation",
  "Microbial growth thermodynamics blocks treating life as a simple negative-entropy slogan.": "theoryBadgeGraph.shared.microbialGrowthThermodynamicsBlocksTreatingLifeAsASimpleNegative",
  "Flux language must stay inside careful thermodynamic accounting.": "theoryBadgeGraph.shared.fluxLanguageMustStayInsideCarefulThermodynamicAccounting",
  "Orch OR belongs downstream in bounded microtubule/coherence context, not at the pre-boundary root.": "theoryBadgeGraph.shared.orchOrBelongsDownstreamInBoundedMicrotubuleCoherenceContextNot",
  "Local concentration context can feed bounded viability-range reasoning.": "theoryBadgeGraph.shared.localConcentrationContextCanFeedBoundedViabilityRangeReasoning",
  "Maintaining a viable range requires a homeostatic constraint interpretation.": "theoryBadgeGraph.shared.maintainingAViableRangeRequiresAHomeostaticConstraintInterpretation",
  "Feedback regulation requires some discrimination of state or deviation.": "theoryBadgeGraph.shared.feedbackRegulationRequiresSomeDiscriminationOfStateOrDeviation",
  "State discrimination can be discussed alongside cellular bioelectric state.": "theoryBadgeGraph.shared.stateDiscriminationCanBeDiscussedAlongsideCellularBioelectricState",
  "Cell-state maintenance context connects to maintenance and repair energy costs.": "theoryBadgeGraph.shared.cellStateMaintenanceContextConnectsToMaintenanceAndRepairEnergy",
  "Maintenance energy bounds whether perturbation response remains viable.": "theoryBadgeGraph.shared.maintenanceEnergyBoundsWhetherPerturbationResponseRemainsViable",
  "Homeostatic regulation cannot be promoted into preference by itself.": "theoryBadgeGraph.shared.homeostaticRegulationCannotBePromotedIntoPreferenceByItself",
  "State discrimination cannot be promoted into consciousness by itself.": "theoryBadgeGraph.shared.stateDiscriminationCannotBePromotedIntoConsciousnessByItself",
  "Bioelectric maintenance context cannot be promoted into a mind claim by itself.": "theoryBadgeGraph.shared.bioelectricMaintenanceContextCannotBePromotedIntoAMindClaim",
  "Repair cost context cannot be promoted into growth success by itself.": "theoryBadgeGraph.shared.repairCostContextCannotBePromotedIntoGrowthSuccessBy",
  "Perturbation response cannot be promoted into agency by itself.": "theoryBadgeGraph.shared.perturbationResponseCannotBePromotedIntoAgencyByItself",
  "Absolute-zero reasoning requires temperature as thermal energy scale, not pressure definition.": "theoryBadgeGraph.shared.absoluteZeroReasoningRequiresTemperatureAsThermalEnergyScaleNot",
  "The zero-temperature limit still allows quantum ground-state energy.": "theoryBadgeGraph.shared.theZeroTemperatureLimitStillAllowsQuantumGroundStateEnergy",
  "Ground-state structure remains distinct from vanishing thermal photon populations.": "theoryBadgeGraph.shared.groundStateStructureRemainsDistinctFromVanishingThermalPhotonPopulations",
  "Zero-point field structure gives context for boundary-dependent Casimir stress.": "theoryBadgeGraph.shared.zeroPointFieldStructureGivesContextForBoundaryDependentCasimir",
  "Low-temperature quantum ground-state structure supports Bose-degeneracy reasoning.": "theoryBadgeGraph.shared.lowTemperatureQuantumGroundStateStructureSupportsBoseDegeneracyReasoning",
  "Superfluid helium should be discussed as bounded helium II physics, not ordinary BEC bowl magic.": "theoryBadgeGraph.shared.superfluidHeliumShouldBeDiscussedAsBoundedHeliumIiPhysics",
  "Low-temperature quantum phases include superconducting zero-DC-resistance regimes under critical bounds.": "theoryBadgeGraph.shared.lowTemperatureQuantumPhasesIncludeSuperconductingZeroDcResistanceRegimes",
  "QFT propagator language must stay separate from Casimir boundary-stress interpretation.": "theoryBadgeGraph.shared.qftPropagatorLanguageMustStaySeparateFromCasimirBoundaryStress",
  "StarSim stellar context documents reduced-order element-yield priors.": "theoryBadgeGraph.shared.starsimStellarContextDocumentsReducedOrderElementYieldPriors",
  "Element-yield priors provide context for atomic or ionic line identification.": "theoryBadgeGraph.shared.elementYieldPriorsProvideContextForAtomicOrIonicLine",
  "Line identification requires strength or equivalent-width context before abundance interpretation.": "theoryBadgeGraph.shared.lineIdentificationRequiresStrengthOrEquivalentWidthContextBeforeAbundance",
  "Atomic and redshift-corrected spectroscopy context documents molecular band interpretation.": "theoryBadgeGraph.shared.atomicAndRedshiftCorrectedSpectroscopyContextDocumentsMolecularBandInterpretation",
  "Molecular band context documents PAH-family spectral interpretation.": "theoryBadgeGraph.shared.molecularBandContextDocumentsPahFamilySpectralInterpretation",
  "Molecular band context documents C60 stellar and circumstellar feature interpretation.": "theoryBadgeGraph.shared.molecularBandContextDocumentsC60StellarAndCircumstellarFeatureInterpretation",
  "Abundance proxy rows cannot promote into formation-pathway or validation claims.": "theoryBadgeGraph.shared.abundanceProxyRowsCannotPromoteIntoFormationPathwayOrValidation",
  "Molecular band matches cannot promote into biological, consciousness, or objective-collapse claims.": "theoryBadgeGraph.shared.molecularBandMatchesCannotPromoteIntoBiologicalConsciousnessOrObjective",
  "The spectral identification boundary points to the broader prebiotic consciousness boundary.": "theoryBadgeGraph.shared.theSpectralIdentificationBoundaryPointsToTheBroaderPrebioticConsciousness",
  "Mode photon energy reuses the shared energy-frequency relation.": "theoryBadgeGraph.shared.modePhotonEnergyReusesTheSharedEnergyFrequencyRelation",
  "Mode frequency uses the shared speed-of-light constant.": "theoryBadgeGraph.shared.modeFrequencyUsesTheSharedSpeedOfLightConstant",
  "Mode frequency feeds the single-mode energy row.": "theoryBadgeGraph.shared.modeFrequencyFeedsTheSingleModeEnergyRow",
  "Casimir energy-per-area shares the energy-density foundation.": "theoryBadgeGraph.shared.casimirEnergyPerAreaSharesTheEnergyDensityFoundation",
  "Pressure follows the same gap-dependent static Casimir family.": "theoryBadgeGraph.shared.pressureFollowsTheSameGapDependentStaticCasimirFamily",
  "Per-area static energy becomes per-tile energy through tile area.": "theoryBadgeGraph.shared.perAreaStaticEnergyBecomesPerTileEnergyThroughTile",
  "Tile energy aggregates over a tile census.": "theoryBadgeGraph.shared.tileEnergyAggregatesOverATileCensus",
  "Static tile budget requires sector-duty context before cycle-averaged source proxy language.": "theoryBadgeGraph.shared.staticTileBudgetRequiresSectorDutyContextBeforeCycleAveraged",
  "Static budget feeds the geometry-gain row.": "theoryBadgeGraph.shared.staticBudgetFeedsTheGeometryGainRow",
  "Gain ladder terms combine into an output-energy proxy.": "theoryBadgeGraph.shared.gainLadderTermsCombineIntoAnOutputEnergyProxy",
  "Output-energy proxy rows require the effective duty term used in the sector schedule.": "theoryBadgeGraph.shared.outputEnergyProxyRowsRequireTheEffectiveDutyTermUsed",
  "Energy proxy can be converted to mass-equivalent units.": "theoryBadgeGraph.shared.energyProxyCanBeConvertedToMassEquivalentUnits",
  "Runtime references must carry the diagnostic source boundary.": "theoryBadgeGraph.shared.runtimeReferencesMustCarryTheDiagnosticSourceBoundary",
  "Material receipts must be present before Casimir source rows can be interpreted beyond diagnostics.": "theoryBadgeGraph.shared.materialReceiptsMustBePresentBeforeCasimirSourceRowsCan",
  "The material-receipt gate includes Lifshitz/dielectric-response provenance.": "theoryBadgeGraph.shared.theMaterialReceiptGateIncludesLifshitzDielectricResponseProvenance",
  "The material-receipt gate includes gap metrology and beyond-PFA geometry validity.": "theoryBadgeGraph.shared.theMaterialReceiptGateIncludesGapMetrologyAndBeyondPfa",
  "Lifshitz material receipts require geometry/metrology context before shaped-tile source interpretation.": "theoryBadgeGraph.shared.lifshitzMaterialReceiptsRequireGeometryMetrologyContextBeforeShapedTile",
  "Material receipts provide source-context evidence for the wall-region T00 residual gate.": "theoryBadgeGraph.shared.materialReceiptsProvideSourceContextEvidenceForTheWallRegion",
  "The ideal scalar row requires a material receipt before source-evidence interpretation.": "theoryBadgeGraph.shared.theIdealScalarRowRequiresAMaterialReceiptBeforeSource",
  "The ideal plate row requires geometry validity before shaped tile source-evidence interpretation.": "theoryBadgeGraph.shared.theIdealPlateRowRequiresGeometryValidityBeforeShapedTile",
  "Mass-equivalent proxy rows cannot promote themselves into physical confirmation.": "theoryBadgeGraph.shared.massEquivalentProxyRowsCannotPromoteThemselvesIntoPhysicalConfirmation",
  "Casimir budget rows overlap NHM2 source-energy unit families.": "theoryBadgeGraph.shared.casimirBudgetRowsOverlapNhm2SourceEnergyUnitFamilies",
  "Magnetic pressure is an energy-density/pressure scalar row.": "theoryBadgeGraph.shared.magneticPressureIsAnEnergyDensityPressureScalarRow",
  "Thermal pressure uses the same stress-energy unit family.": "theoryBadgeGraph.shared.thermalPressureUsesTheSameStressEnergyUnitFamily",
  "Beta compares thermal pressure against magnetic pressure.": "theoryBadgeGraph.shared.betaComparesThermalPressureAgainstMagneticPressure",
  "Beta requires thermal pressure.": "theoryBadgeGraph.shared.betaRequiresThermalPressure",
  "Power balance is a project-specific power-rate row.": "theoryBadgeGraph.shared.powerBalanceIsAProjectSpecificPowerRateRow",
  "Power balance is adjacent context for RZ energy fields.": "theoryBadgeGraph.shared.powerBalanceIsAdjacentContextForRzEnergyFields",
  "Confinement proxy documents energy-field context.": "theoryBadgeGraph.shared.confinementProxyDocumentsEnergyFieldContext",
  "Synthetic diagnostics consume runtime field context.": "theoryBadgeGraph.shared.syntheticDiagnosticsConsumeRuntimeFieldContext",
  "Synthetic diagnostic outputs can feed precursor reports.": "theoryBadgeGraph.shared.syntheticDiagnosticOutputsCanFeedPrecursorReports",
  "Score-threshold margin documents precursor report context.": "theoryBadgeGraph.shared.scoreThresholdMarginDocumentsPrecursorReportContext",
  "Core flux fraction documents energy-field coverage.": "theoryBadgeGraph.shared.coreFluxFractionDocumentsEnergyFieldCoverage",
  "Edge flux fraction documents energy-field coverage.": "theoryBadgeGraph.shared.edgeFluxFractionDocumentsEnergyFieldCoverage",
  "Beta rows must point to tokamak diagnostic scope.": "theoryBadgeGraph.shared.betaRowsMustPointToTokamakDiagnosticScope",
  "Precursor reports cannot be promoted without validation receipts.": "theoryBadgeGraph.shared.precursorReportsCannotBePromotedWithoutValidationReceipts",
  "Structure weight uses star-map distance.": "theoryBadgeGraph.shared.structureWeightUsesStarMapDistance",
  "The runtime graph uses structure-weight-like edge context.": "theoryBadgeGraph.shared.theRuntimeGraphUsesStructureWeightLikeEdgeContext",
  "Relative velocity documents star-map edge context.": "theoryBadgeGraph.shared.relativeVelocityDocumentsStarMapEdgeContext",
  "Cosmology provides context, not local bound-system expansion.": "theoryBadgeGraph.shared.cosmologyProvidesContextNotLocalBoundSystemExpansion",
  "Circular velocity is one scalar input family for rotation controls.": "theoryBadgeGraph.shared.circularVelocityIsOneScalarInputFamilyForRotationControls",
  "Acceleration can be computed from rotation speed and radius.": "theoryBadgeGraph.shared.accelerationCanBeComputedFromRotationSpeedAndRadius",
  "RMS residual aggregates velocity residuals.": "theoryBadgeGraph.shared.rmsResidualAggregatesVelocityResiduals",
  "RMS residual documents rotation-control fit quality.": "theoryBadgeGraph.shared.rmsResidualDocumentsRotationControlFitQuality",
  "Rotation controls can be attached to the Accordion galactic null model.": "theoryBadgeGraph.shared.rotationControlsCanBeAttachedToTheAccordionGalacticNull",
  "Null-model runtimes must expose their claim boundary.": "theoryBadgeGraph.shared.nullModelRuntimesMustExposeTheirClaimBoundary",
  "Rotation controls cannot promote themselves into a physical winner.": "theoryBadgeGraph.shared.rotationControlsCannotPromoteThemselvesIntoAPhysicalWinner",
  "Dimension checks bound the strength-balance radius proxy.": "theoryBadgeGraph.shared.dimensionChecksBoundTheStrengthBalanceRadiusProxy",
  "Strength and self-gravity context document rubble-pile response.": "theoryBadgeGraph.shared.strengthAndSelfGravityContextDocumentRubblePileResponse",
  "Tidal Q packages granular dissipation into a cycle-loss diagnostic.": "theoryBadgeGraph.shared.tidalQPackagesGranularDissipationIntoACycleLossDiagnostic",
  "Tidal Q and Love-number response are linked deformation diagnostics.": "theoryBadgeGraph.shared.tidalQAndLoveNumberResponseAreLinkedDeformationDiagnostics",
  "Love-number displacement points to the body-specific runtime reference.": "theoryBadgeGraph.shared.loveNumberDisplacementPointsToTheBodySpecificRuntimeReference",
  "The runtime reference documents the material-response boundary.": "theoryBadgeGraph.shared.theRuntimeReferenceDocumentsTheMaterialResponseBoundary",
  "Love-number response cannot promote itself beyond material response.": "theoryBadgeGraph.shared.loveNumberResponseCannotPromoteItselfBeyondMaterialResponse",
  "Drive/body ratio requires body curvature proxy.": "theoryBadgeGraph.shared.driveBodyRatioRequiresBodyCurvatureProxy",
  "Drive/body ratio requires drive curvature proxy.": "theoryBadgeGraph.shared.driveBodyRatioRequiresDriveCurvatureProxy",
  "Hazard probability documents benchmark cadence.": "theoryBadgeGraph.shared.hazardProbabilityDocumentsBenchmarkCadence",
  "Present length feeds curvature-unit diagnostic.": "theoryBadgeGraph.shared.presentLengthFeedsCurvatureUnitDiagnostic",
  "Kappa present is emitted by benchmark diagnostics.": "theoryBadgeGraph.shared.kappaPresentIsEmittedByBenchmarkDiagnostics",
  "Normalized uncertainty uses observed-bound margin context.": "theoryBadgeGraph.shared.normalizedUncertaintyUsesObservedBoundMarginContext",
  "Energy-frequency identity anchors objective-collapse period rows.": "theoryBadgeGraph.shared.energyFrequencyIdentityAnchorsObjectiveCollapsePeriodRows",
  "Mass-energy density frames branch mass distributions.": "theoryBadgeGraph.shared.massEnergyDensityFramesBranchMassDistributions",
  "Objective-collapse comparison requires branch density differences.": "theoryBadgeGraph.shared.objectiveCollapseComparisonRequiresBranchDensityDifferences",
  "DP self-energy is computed from branch mass-density differences.": "theoryBadgeGraph.shared.dpSelfEnergyIsComputedFromBranchMassDensityDifferences",
  "DP timescale follows from gravitational self-energy difference.": "theoryBadgeGraph.shared.dpTimescaleFollowsFromGravitationalSelfEnergyDifference",
  "DP rate is the inverse collapse timescale.": "theoryBadgeGraph.shared.dpRateIsTheInverseCollapseTimescale",
  "DP timescale projects into a relativity-bounded present window.": "theoryBadgeGraph.shared.dpTimescaleProjectsIntoARelativityBoundedPresentWindow",
  "DP timescale can be converted into a timestep hazard helper.": "theoryBadgeGraph.shared.dpTimescaleCanBeConvertedIntoATimestepHazardHelper",
  "DP present window can share the curvature-unit display scale.": "theoryBadgeGraph.shared.dpPresentWindowCanShareTheCurvatureUnitDisplayScale",
  "DP timescale can feed the existing benchmark hazard row.": "theoryBadgeGraph.shared.dpTimescaleCanFeedTheExistingBenchmarkHazardRow",
  "Objective-collapse rates must be interpreted against experimental bounds.": "theoryBadgeGraph.shared.objectiveCollapseRatesMustBeInterpretedAgainstExperimentalBounds",
  "DP hazard interpretation is bounded by model and experiment context.": "theoryBadgeGraph.shared.dpHazardInterpretationIsBoundedByModelAndExperimentContext",
  "Objective-collapse rows remain exploratory diagnostics.": "theoryBadgeGraph.shared.objectiveCollapseRowsRemainExploratoryDiagnostics",
  "Curvature proxy ratios document leverage benchmark context.": "theoryBadgeGraph.shared.curvatureProxyRatiosDocumentLeverageBenchmarkContext",
  "Benchmark runtime remains diagnostic.": "theoryBadgeGraph.shared.benchmarkRuntimeRemainsDiagnostic",
  "Curvature benchmark remains diagnostic.": "theoryBadgeGraph.shared.curvatureBenchmarkRemainsDiagnostic",
  "GR field equations provide canonical curvature context.": "theoryBadgeGraph.shared.grFieldEquationsProvideCanonicalCurvatureContext",
  "DP timescale can be compared against a microtubule coherence window.": "theoryBadgeGraph.shared.dpTimescaleCanBeComparedAgainstAMicrotubuleCoherenceWindow",
  "Microtubule mode observables document the coherence comparison context.": "theoryBadgeGraph.shared.microtubuleModeObservablesDocumentTheCoherenceComparisonContext",
  "Gamma timing can participate in cross-scale frequency comparisons.": "theoryBadgeGraph.shared.gammaTimingCanParticipateInCrossScaleFrequencyComparisons",
  "DP tau can be compared against gamma cycles or other timing bands.": "theoryBadgeGraph.shared.dpTauCanBeComparedAgainstGammaCyclesOrOther",
  "Frequency hierarchy must pass subharmonic tests before time-crystal language.": "theoryBadgeGraph.shared.frequencyHierarchyMustPassSubharmonicTestsBeforeTimeCrystalLanguage",
  "Subharmonic response must be robust under perturbation and drive context.": "theoryBadgeGraph.shared.subharmonicResponseMustBeRobustUnderPerturbationAndDriveContext",
  "Time-crystal gate remains exploratory until standard criteria are met.": "theoryBadgeGraph.shared.timeCrystalGateRemainsExploratoryUntilStandardCriteriaAreMet",
  "Coherence overlap diagnostics remain exploratory.": "theoryBadgeGraph.shared.coherenceOverlapDiagnosticsRemainExploratory",
  "Hydrogen-burning context documents reduced-order stellar yield priors.": "theoryBadgeGraph.shared.hydrogenBurningContextDocumentsReducedOrderStellarYieldPriors",
  "Triple-alpha carbon context documents later aromatic carbon discussions.": "theoryBadgeGraph.shared.tripleAlphaCarbonContextDocumentsLaterAromaticCarbonDiscussions",
  "Alpha-capture oxygen context documents inherited molecular-cloud element inventories.": "theoryBadgeGraph.shared.alphaCaptureOxygenContextDocumentsInheritedMolecularCloudElementInventories",
  "Short-range nuclear binding documents the mass-defect energy context.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsTheMassDefectEnergyContext",
  "Charged-particle fusion entrance requires barrier/tunneling context.": "theoryBadgeGraph.shared.chargedParticleFusionEntranceRequiresBarrierTunnelingContext",
  "Tunneling entrance context documents hydrogen-burning fusion access.": "theoryBadgeGraph.shared.tunnelingEntranceContextDocumentsHydrogenBurningFusionAccess",
  "Tunneling entrance context documents charged-particle alpha-capture access.": "theoryBadgeGraph.shared.tunnelingEntranceContextDocumentsChargedParticleAlphaCaptureAccess",
  "Mass-defect binding energy documents the energy accounting side of hydrogen burning.": "theoryBadgeGraph.shared.massDefectBindingEnergyDocumentsTheEnergyAccountingSideOf",
  "Mass-defect binding energy documents the energy accounting side of alpha-capture products.": "theoryBadgeGraph.shared.massDefectBindingEnergyDocumentsTheEnergyAccountingSideOf2",
  "Atomic bound-state explanations require electron-cloud uncertainty context.": "theoryBadgeGraph.shared.atomicBoundStateExplanationsRequireElectronCloudUncertaintyContext",
  "Electron-cloud uncertainty documents the quantum-state side of shell structure.": "theoryBadgeGraph.shared.electronCloudUncertaintyDocumentsTheQuantumStateSideOfShell",
  "Pauli shell context documents the electron-occupancy side of molecular binding.": "theoryBadgeGraph.shared.pauliShellContextDocumentsTheElectronOccupancySideOfMolecular",
  "Electromagnetic molecular-binding context documents why H-O chemistry is molecular rather than nuclear.": "theoryBadgeGraph.shared.electromagneticMolecularBindingContextDocumentsWhyHOChemistryIs",
  "Molecular binding context documents a microscopic contributor to phase structural order.": "theoryBadgeGraph.shared.molecularBindingContextDocumentsAMicroscopicContributorToPhaseStructural",
  "Short-range nuclear binding documents bounded nuclear identity context for hydrogen.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor",
  "Short-range nuclear binding documents bounded nuclear identity context for helium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor2",
  "Short-range nuclear binding documents bounded nuclear identity context for lithium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor3",
  "Short-range nuclear binding documents bounded nuclear identity context for beryllium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor4",
  "Short-range nuclear binding documents bounded nuclear identity context for boron.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor5",
  "Short-range nuclear binding documents bounded nuclear identity context for carbon.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor6",
  "Short-range nuclear binding documents bounded nuclear identity context for nitrogen.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor7",
  "Short-range nuclear binding documents bounded nuclear identity context for oxygen.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor8",
  "Short-range nuclear binding documents bounded nuclear identity context for fluorine.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor9",
  "Short-range nuclear binding documents bounded nuclear identity context for neon.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor10",
  "Short-range nuclear binding documents bounded nuclear identity context for sodium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor11",
  "Short-range nuclear binding documents bounded nuclear identity context for magnesium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor12",
  "Short-range nuclear binding documents bounded nuclear identity context for aluminum.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor13",
  "Short-range nuclear binding documents bounded nuclear identity context for silicon.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor14",
  "Short-range nuclear binding documents bounded nuclear identity context for phosphorus.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor15",
  "Short-range nuclear binding documents bounded nuclear identity context for sulfur.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor16",
  "Short-range nuclear binding documents bounded nuclear identity context for chlorine.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor17",
  "Short-range nuclear binding documents bounded nuclear identity context for argon.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor18",
  "Short-range nuclear binding documents bounded nuclear identity context for potassium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor19",
  "Short-range nuclear binding documents bounded nuclear identity context for calcium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor20",
  "Short-range nuclear binding documents bounded nuclear identity context for scandium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor21",
  "Short-range nuclear binding documents bounded nuclear identity context for titanium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor22",
  "Short-range nuclear binding documents bounded nuclear identity context for vanadium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor23",
  "Short-range nuclear binding documents bounded nuclear identity context for chromium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor24",
  "Short-range nuclear binding documents bounded nuclear identity context for manganese.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor25",
  "Short-range nuclear binding documents bounded nuclear identity context for iron.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor26",
  "Short-range nuclear binding documents bounded nuclear identity context for cobalt.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor27",
  "Short-range nuclear binding documents bounded nuclear identity context for nickel.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor28",
  "Short-range nuclear binding documents bounded nuclear identity context for copper.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor29",
  "Short-range nuclear binding documents bounded nuclear identity context for zinc.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor30",
  "Short-range nuclear binding documents bounded nuclear identity context for gallium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor31",
  "Short-range nuclear binding documents bounded nuclear identity context for germanium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor32",
  "Short-range nuclear binding documents bounded nuclear identity context for arsenic.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor33",
  "Short-range nuclear binding documents bounded nuclear identity context for selenium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor34",
  "Short-range nuclear binding documents bounded nuclear identity context for bromine.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor35",
  "Short-range nuclear binding documents bounded nuclear identity context for krypton.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor36",
  "Short-range nuclear binding documents bounded nuclear identity context for rubidium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor37",
  "Short-range nuclear binding documents bounded nuclear identity context for strontium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor38",
  "Short-range nuclear binding documents bounded nuclear identity context for yttrium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor39",
  "Short-range nuclear binding documents bounded nuclear identity context for zirconium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor40",
  "Short-range nuclear binding documents bounded nuclear identity context for niobium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor41",
  "Short-range nuclear binding documents bounded nuclear identity context for molybdenum.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor42",
  "Short-range nuclear binding documents bounded nuclear identity context for technetium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor43",
  "Short-range nuclear binding documents bounded nuclear identity context for ruthenium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor44",
  "Short-range nuclear binding documents bounded nuclear identity context for rhodium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor45",
  "Short-range nuclear binding documents bounded nuclear identity context for palladium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor46",
  "Short-range nuclear binding documents bounded nuclear identity context for silver.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor47",
  "Short-range nuclear binding documents bounded nuclear identity context for cadmium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor48",
  "Short-range nuclear binding documents bounded nuclear identity context for indium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor49",
  "Short-range nuclear binding documents bounded nuclear identity context for tin.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor50",
  "Short-range nuclear binding documents bounded nuclear identity context for antimony.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor51",
  "Short-range nuclear binding documents bounded nuclear identity context for tellurium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor52",
  "Short-range nuclear binding documents bounded nuclear identity context for iodine.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor53",
  "Short-range nuclear binding documents bounded nuclear identity context for xenon.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor54",
  "Short-range nuclear binding documents bounded nuclear identity context for cesium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor55",
  "Short-range nuclear binding documents bounded nuclear identity context for barium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor56",
  "Short-range nuclear binding documents bounded nuclear identity context for lanthanum.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor57",
  "Short-range nuclear binding documents bounded nuclear identity context for cerium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor58",
  "Short-range nuclear binding documents bounded nuclear identity context for praseodymium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor59",
  "Short-range nuclear binding documents bounded nuclear identity context for neodymium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor60",
  "Short-range nuclear binding documents bounded nuclear identity context for promethium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor61",
  "Short-range nuclear binding documents bounded nuclear identity context for samarium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor62",
  "Short-range nuclear binding documents bounded nuclear identity context for europium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor63",
  "Short-range nuclear binding documents bounded nuclear identity context for gadolinium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor64",
  "Short-range nuclear binding documents bounded nuclear identity context for terbium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor65",
  "Short-range nuclear binding documents bounded nuclear identity context for dysprosium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor66",
  "Short-range nuclear binding documents bounded nuclear identity context for holmium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor67",
  "Short-range nuclear binding documents bounded nuclear identity context for erbium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor68",
  "Short-range nuclear binding documents bounded nuclear identity context for thulium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor69",
  "Short-range nuclear binding documents bounded nuclear identity context for ytterbium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor70",
  "Short-range nuclear binding documents bounded nuclear identity context for lutetium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor71",
  "Short-range nuclear binding documents bounded nuclear identity context for hafnium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor72",
  "Short-range nuclear binding documents bounded nuclear identity context for tantalum.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor73",
  "Short-range nuclear binding documents bounded nuclear identity context for tungsten.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor74",
  "Short-range nuclear binding documents bounded nuclear identity context for rhenium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor75",
  "Short-range nuclear binding documents bounded nuclear identity context for osmium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor76",
  "Short-range nuclear binding documents bounded nuclear identity context for iridium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor77",
  "Short-range nuclear binding documents bounded nuclear identity context for platinum.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor78",
  "Short-range nuclear binding documents bounded nuclear identity context for gold.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor79",
  "Short-range nuclear binding documents bounded nuclear identity context for mercury.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor80",
  "Short-range nuclear binding documents bounded nuclear identity context for thallium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor81",
  "Short-range nuclear binding documents bounded nuclear identity context for lead.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor82",
  "Short-range nuclear binding documents bounded nuclear identity context for bismuth.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor83",
  "Short-range nuclear binding documents bounded nuclear identity context for polonium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor84",
  "Short-range nuclear binding documents bounded nuclear identity context for astatine.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor85",
  "Short-range nuclear binding documents bounded nuclear identity context for radon.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor86",
  "Short-range nuclear binding documents bounded nuclear identity context for francium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor87",
  "Short-range nuclear binding documents bounded nuclear identity context for radium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor88",
  "Short-range nuclear binding documents bounded nuclear identity context for actinium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor89",
  "Short-range nuclear binding documents bounded nuclear identity context for thorium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor90",
  "Short-range nuclear binding documents bounded nuclear identity context for protactinium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor91",
  "Short-range nuclear binding documents bounded nuclear identity context for uranium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor92",
  "Short-range nuclear binding documents bounded nuclear identity context for neptunium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor93",
  "Short-range nuclear binding documents bounded nuclear identity context for plutonium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor94",
  "Short-range nuclear binding documents bounded nuclear identity context for americium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor95",
  "Short-range nuclear binding documents bounded nuclear identity context for curium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor96",
  "Short-range nuclear binding documents bounded nuclear identity context for berkelium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor97",
  "Short-range nuclear binding documents bounded nuclear identity context for californium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor98",
  "Short-range nuclear binding documents bounded nuclear identity context for einsteinium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor99",
  "Short-range nuclear binding documents bounded nuclear identity context for fermium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor100",
  "Short-range nuclear binding documents bounded nuclear identity context for mendelevium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor101",
  "Short-range nuclear binding documents bounded nuclear identity context for nobelium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor102",
  "Short-range nuclear binding documents bounded nuclear identity context for lawrencium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor103",
  "Short-range nuclear binding documents bounded nuclear identity context for rutherfordium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor104",
  "Short-range nuclear binding documents bounded nuclear identity context for dubnium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor105",
  "Short-range nuclear binding documents bounded nuclear identity context for seaborgium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor106",
  "Short-range nuclear binding documents bounded nuclear identity context for bohrium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor107",
  "Short-range nuclear binding documents bounded nuclear identity context for hassium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor108",
  "Short-range nuclear binding documents bounded nuclear identity context for meitnerium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor109",
  "Short-range nuclear binding documents bounded nuclear identity context for darmstadtium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor110",
  "Short-range nuclear binding documents bounded nuclear identity context for roentgenium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor111",
  "Short-range nuclear binding documents bounded nuclear identity context for copernicium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor112",
  "Short-range nuclear binding documents bounded nuclear identity context for nihonium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor113",
  "Short-range nuclear binding documents bounded nuclear identity context for flerovium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor114",
  "Short-range nuclear binding documents bounded nuclear identity context for moscovium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor115",
  "Short-range nuclear binding documents bounded nuclear identity context for livermorium.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor116",
  "Short-range nuclear binding documents bounded nuclear identity context for tennessine.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor117",
  "Short-range nuclear binding documents bounded nuclear identity context for oganesson.": "theoryBadgeGraph.shared.shortRangeNuclearBindingDocumentsBoundedNuclearIdentityContextFor118",
  "Pauli shell structure documents bounded electron-structure context for hydrogen.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForHydrogen",
  "Pauli shell structure documents bounded electron-structure context for helium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForHelium",
  "Pauli shell structure documents bounded electron-structure context for lithium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForLithium",
  "Pauli shell structure documents bounded electron-structure context for beryllium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForBeryllium",
  "Pauli shell structure documents bounded electron-structure context for boron.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForBoron",
  "Pauli shell structure documents bounded electron-structure context for carbon.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForCarbon",
  "Pauli shell structure documents bounded electron-structure context for nitrogen.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForNitrogen",
  "Pauli shell structure documents bounded electron-structure context for oxygen.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForOxygen",
  "Pauli shell structure documents bounded electron-structure context for fluorine.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForFluorine",
  "Pauli shell structure documents bounded electron-structure context for neon.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForNeon",
  "Pauli shell structure documents bounded electron-structure context for sodium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForSodium",
  "Pauli shell structure documents bounded electron-structure context for magnesium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForMagnesium",
  "Pauli shell structure documents bounded electron-structure context for aluminum.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForAluminum",
  "Pauli shell structure documents bounded electron-structure context for silicon.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForSilicon",
  "Pauli shell structure documents bounded electron-structure context for phosphorus.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForPhosphorus",
  "Pauli shell structure documents bounded electron-structure context for sulfur.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForSulfur",
  "Pauli shell structure documents bounded electron-structure context for chlorine.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForChlorine",
  "Pauli shell structure documents bounded electron-structure context for argon.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForArgon",
  "Pauli shell structure documents bounded electron-structure context for potassium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForPotassium",
  "Pauli shell structure documents bounded electron-structure context for calcium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForCalcium",
  "Pauli shell structure documents bounded electron-structure context for scandium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForScandium",
  "Pauli shell structure documents bounded electron-structure context for titanium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForTitanium",
  "Pauli shell structure documents bounded electron-structure context for vanadium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForVanadium",
  "Pauli shell structure documents bounded electron-structure context for chromium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForChromium",
  "Pauli shell structure documents bounded electron-structure context for manganese.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForManganese",
  "Pauli shell structure documents bounded electron-structure context for iron.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForIron",
  "Pauli shell structure documents bounded electron-structure context for cobalt.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForCobalt",
  "Pauli shell structure documents bounded electron-structure context for nickel.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForNickel",
  "Pauli shell structure documents bounded electron-structure context for copper.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForCopper",
  "Pauli shell structure documents bounded electron-structure context for zinc.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForZinc",
  "Pauli shell structure documents bounded electron-structure context for gallium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForGallium",
  "Pauli shell structure documents bounded electron-structure context for germanium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForGermanium",
  "Pauli shell structure documents bounded electron-structure context for arsenic.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForArsenic",
  "Pauli shell structure documents bounded electron-structure context for selenium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForSelenium",
  "Pauli shell structure documents bounded electron-structure context for bromine.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForBromine",
  "Pauli shell structure documents bounded electron-structure context for krypton.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForKrypton",
  "Pauli shell structure documents bounded electron-structure context for rubidium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForRubidium",
  "Pauli shell structure documents bounded electron-structure context for strontium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForStrontium",
  "Pauli shell structure documents bounded electron-structure context for yttrium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForYttrium",
  "Pauli shell structure documents bounded electron-structure context for zirconium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForZirconium",
  "Pauli shell structure documents bounded electron-structure context for niobium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForNiobium",
  "Pauli shell structure documents bounded electron-structure context for molybdenum.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForMolybdenum",
  "Pauli shell structure documents bounded electron-structure context for technetium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForTechnetium",
  "Pauli shell structure documents bounded electron-structure context for ruthenium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForRuthenium",
  "Pauli shell structure documents bounded electron-structure context for rhodium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForRhodium",
  "Pauli shell structure documents bounded electron-structure context for palladium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForPalladium",
  "Pauli shell structure documents bounded electron-structure context for silver.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForSilver",
  "Pauli shell structure documents bounded electron-structure context for cadmium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForCadmium",
  "Pauli shell structure documents bounded electron-structure context for indium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForIndium",
  "Pauli shell structure documents bounded electron-structure context for tin.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForTin",
  "Pauli shell structure documents bounded electron-structure context for antimony.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForAntimony",
  "Pauli shell structure documents bounded electron-structure context for tellurium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForTellurium",
  "Pauli shell structure documents bounded electron-structure context for iodine.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForIodine",
  "Pauli shell structure documents bounded electron-structure context for xenon.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForXenon",
  "Pauli shell structure documents bounded electron-structure context for cesium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForCesium",
  "Pauli shell structure documents bounded electron-structure context for barium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForBarium",
  "Pauli shell structure documents bounded electron-structure context for lanthanum.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForLanthanum",
  "Pauli shell structure documents bounded electron-structure context for cerium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForCerium",
  "Pauli shell structure documents bounded electron-structure context for praseodymium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForPraseodymium",
  "Pauli shell structure documents bounded electron-structure context for neodymium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForNeodymium",
  "Pauli shell structure documents bounded electron-structure context for promethium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForPromethium",
  "Pauli shell structure documents bounded electron-structure context for samarium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForSamarium",
  "Pauli shell structure documents bounded electron-structure context for europium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForEuropium",
  "Pauli shell structure documents bounded electron-structure context for gadolinium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForGadolinium",
  "Pauli shell structure documents bounded electron-structure context for terbium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForTerbium",
  "Pauli shell structure documents bounded electron-structure context for dysprosium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForDysprosium",
  "Pauli shell structure documents bounded electron-structure context for holmium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForHolmium",
  "Pauli shell structure documents bounded electron-structure context for erbium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForErbium",
  "Pauli shell structure documents bounded electron-structure context for thulium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForThulium",
  "Pauli shell structure documents bounded electron-structure context for ytterbium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForYtterbium",
  "Pauli shell structure documents bounded electron-structure context for lutetium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForLutetium",
  "Pauli shell structure documents bounded electron-structure context for hafnium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForHafnium",
  "Pauli shell structure documents bounded electron-structure context for tantalum.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForTantalum",
  "Pauli shell structure documents bounded electron-structure context for tungsten.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForTungsten",
  "Pauli shell structure documents bounded electron-structure context for rhenium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForRhenium",
  "Pauli shell structure documents bounded electron-structure context for osmium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForOsmium",
  "Pauli shell structure documents bounded electron-structure context for iridium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForIridium",
  "Pauli shell structure documents bounded electron-structure context for platinum.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForPlatinum",
  "Pauli shell structure documents bounded electron-structure context for gold.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForGold",
  "Pauli shell structure documents bounded electron-structure context for mercury.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForMercury",
  "Pauli shell structure documents bounded electron-structure context for thallium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForThallium",
  "Pauli shell structure documents bounded electron-structure context for lead.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForLead",
  "Pauli shell structure documents bounded electron-structure context for bismuth.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForBismuth",
  "Pauli shell structure documents bounded electron-structure context for polonium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForPolonium",
  "Pauli shell structure documents bounded electron-structure context for astatine.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForAstatine",
  "Pauli shell structure documents bounded electron-structure context for radon.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForRadon",
  "Pauli shell structure documents bounded electron-structure context for francium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForFrancium",
  "Pauli shell structure documents bounded electron-structure context for radium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForRadium",
  "Pauli shell structure documents bounded electron-structure context for actinium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForActinium",
  "Pauli shell structure documents bounded electron-structure context for thorium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForThorium",
  "Pauli shell structure documents bounded electron-structure context for protactinium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForProtactinium",
  "Pauli shell structure documents bounded electron-structure context for uranium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForUranium",
  "Pauli shell structure documents bounded electron-structure context for neptunium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForNeptunium",
  "Pauli shell structure documents bounded electron-structure context for plutonium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForPlutonium",
  "Pauli shell structure documents bounded electron-structure context for americium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForAmericium",
  "Pauli shell structure documents bounded electron-structure context for curium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForCurium",
  "Pauli shell structure documents bounded electron-structure context for berkelium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForBerkelium",
  "Pauli shell structure documents bounded electron-structure context for californium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForCalifornium",
  "Pauli shell structure documents bounded electron-structure context for einsteinium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForEinsteinium",
  "Pauli shell structure documents bounded electron-structure context for fermium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForFermium",
  "Pauli shell structure documents bounded electron-structure context for mendelevium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForMendelevium",
  "Pauli shell structure documents bounded electron-structure context for nobelium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForNobelium",
  "Pauli shell structure documents bounded electron-structure context for lawrencium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForLawrencium",
  "Pauli shell structure documents bounded electron-structure context for rutherfordium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForRutherfordium",
  "Pauli shell structure documents bounded electron-structure context for dubnium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForDubnium",
  "Pauli shell structure documents bounded electron-structure context for seaborgium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForSeaborgium",
  "Pauli shell structure documents bounded electron-structure context for bohrium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForBohrium",
  "Pauli shell structure documents bounded electron-structure context for hassium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForHassium",
  "Pauli shell structure documents bounded electron-structure context for meitnerium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForMeitnerium",
  "Pauli shell structure documents bounded electron-structure context for darmstadtium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForDarmstadtium",
  "Pauli shell structure documents bounded electron-structure context for roentgenium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForRoentgenium",
  "Pauli shell structure documents bounded electron-structure context for copernicium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForCopernicium",
  "Pauli shell structure documents bounded electron-structure context for nihonium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForNihonium",
  "Pauli shell structure documents bounded electron-structure context for flerovium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForFlerovium",
  "Pauli shell structure documents bounded electron-structure context for moscovium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForMoscovium",
  "Pauli shell structure documents bounded electron-structure context for livermorium.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForLivermorium",
  "Pauli shell structure documents bounded electron-structure context for tennessine.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForTennessine",
  "Pauli shell structure documents bounded electron-structure context for oganesson.": "theoryBadgeGraph.shared.pauliShellStructureDocumentsBoundedElectronStructureContextForOganesson",
  "Big Bang nucleosynthesis provides bounded origin context for hydrogen.": "theoryBadgeGraph.shared.bigBangNucleosynthesisProvidesBoundedOriginContextForHydrogen",
  "Big Bang nucleosynthesis provides bounded origin context for helium.": "theoryBadgeGraph.shared.bigBangNucleosynthesisProvidesBoundedOriginContextForHelium",
  "hydrogen burning provides bounded origin context for helium.": "theoryBadgeGraph.shared.hydrogenBurningProvidesBoundedOriginContextForHelium",
  "Big Bang nucleosynthesis provides bounded origin context for lithium.": "theoryBadgeGraph.shared.bigBangNucleosynthesisProvidesBoundedOriginContextForLithium",
  "cosmic-ray spallation provides bounded origin context for lithium.": "theoryBadgeGraph.shared.cosmicRaySpallationProvidesBoundedOriginContextForLithium",
  "cosmic-ray spallation provides bounded origin context for beryllium.": "theoryBadgeGraph.shared.cosmicRaySpallationProvidesBoundedOriginContextForBeryllium",
  "cosmic-ray spallation provides bounded origin context for boron.": "theoryBadgeGraph.shared.cosmicRaySpallationProvidesBoundedOriginContextForBoron",
  "triple-alpha helium burning provides bounded origin context for carbon.": "theoryBadgeGraph.shared.tripleAlphaHeliumBurningProvidesBoundedOriginContextForCarbon",
  "hydrogen burning provides bounded origin context for nitrogen.": "theoryBadgeGraph.shared.hydrogenBurningProvidesBoundedOriginContextForNitrogen",
  "explosive nucleosynthesis provides bounded origin context for nitrogen.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForNitrogen",
  "alpha-capture stellar nucleosynthesis provides bounded origin context for oxygen.": "theoryBadgeGraph.shared.alphaCaptureStellarNucleosynthesisProvidesBoundedOriginContextForOxygen",
  "advanced stellar burning provides bounded origin context for oxygen.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForOxygen",
  "advanced stellar burning provides bounded origin context for fluorine.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForFluorine",
  "explosive nucleosynthesis provides bounded origin context for fluorine.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForFluorine",
  "alpha-capture stellar nucleosynthesis provides bounded origin context for neon.": "theoryBadgeGraph.shared.alphaCaptureStellarNucleosynthesisProvidesBoundedOriginContextForNeon",
  "advanced stellar burning provides bounded origin context for neon.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForNeon",
  "advanced stellar burning provides bounded origin context for sodium.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForSodium",
  "explosive nucleosynthesis provides bounded origin context for sodium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForSodium",
  "alpha-capture stellar nucleosynthesis provides bounded origin context for magnesium.": "theoryBadgeGraph.shared.alphaCaptureStellarNucleosynthesisProvidesBoundedOriginContextForMagnesium",
  "advanced stellar burning provides bounded origin context for magnesium.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForMagnesium",
  "advanced stellar burning provides bounded origin context for aluminum.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForAluminum",
  "explosive nucleosynthesis provides bounded origin context for aluminum.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForAluminum",
  "alpha-capture stellar nucleosynthesis provides bounded origin context for silicon.": "theoryBadgeGraph.shared.alphaCaptureStellarNucleosynthesisProvidesBoundedOriginContextForSilicon",
  "advanced stellar burning provides bounded origin context for silicon.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForSilicon",
  "advanced stellar burning provides bounded origin context for phosphorus.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForPhosphorus",
  "explosive nucleosynthesis provides bounded origin context for phosphorus.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForPhosphorus",
  "alpha-capture stellar nucleosynthesis provides bounded origin context for sulfur.": "theoryBadgeGraph.shared.alphaCaptureStellarNucleosynthesisProvidesBoundedOriginContextForSulfur",
  "advanced stellar burning provides bounded origin context for sulfur.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForSulfur",
  "advanced stellar burning provides bounded origin context for chlorine.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForChlorine",
  "explosive nucleosynthesis provides bounded origin context for chlorine.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForChlorine",
  "alpha-capture stellar nucleosynthesis provides bounded origin context for argon.": "theoryBadgeGraph.shared.alphaCaptureStellarNucleosynthesisProvidesBoundedOriginContextForArgon",
  "advanced stellar burning provides bounded origin context for argon.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForArgon",
  "advanced stellar burning provides bounded origin context for potassium.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForPotassium",
  "explosive nucleosynthesis provides bounded origin context for potassium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForPotassium",
  "alpha-capture stellar nucleosynthesis provides bounded origin context for calcium.": "theoryBadgeGraph.shared.alphaCaptureStellarNucleosynthesisProvidesBoundedOriginContextForCalcium",
  "advanced stellar burning provides bounded origin context for calcium.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForCalcium",
  "advanced stellar burning provides bounded origin context for scandium.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForScandium",
  "explosive nucleosynthesis provides bounded origin context for scandium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForScandium",
  "advanced stellar burning provides bounded origin context for titanium.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForTitanium",
  "explosive nucleosynthesis provides bounded origin context for titanium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForTitanium",
  "advanced stellar burning provides bounded origin context for vanadium.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForVanadium",
  "explosive nucleosynthesis provides bounded origin context for vanadium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForVanadium",
  "advanced stellar burning provides bounded origin context for chromium.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForChromium",
  "explosive nucleosynthesis provides bounded origin context for chromium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForChromium",
  "advanced stellar burning provides bounded origin context for manganese.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForManganese",
  "explosive nucleosynthesis provides bounded origin context for manganese.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForManganese",
  "advanced stellar burning provides bounded origin context for iron.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForIron",
  "explosive nucleosynthesis provides bounded origin context for iron.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForIron",
  "advanced stellar burning provides bounded origin context for cobalt.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForCobalt",
  "explosive nucleosynthesis provides bounded origin context for cobalt.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForCobalt",
  "advanced stellar burning provides bounded origin context for nickel.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForNickel",
  "explosive nucleosynthesis provides bounded origin context for nickel.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForNickel",
  "advanced stellar burning provides bounded origin context for copper.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForCopper",
  "explosive nucleosynthesis provides bounded origin context for copper.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForCopper",
  "advanced stellar burning provides bounded origin context for zinc.": "theoryBadgeGraph.shared.advancedStellarBurningProvidesBoundedOriginContextForZinc",
  "explosive nucleosynthesis provides bounded origin context for zinc.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForZinc",
  "slow neutron capture provides bounded origin context for gallium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForGallium",
  "rapid neutron capture provides bounded origin context for gallium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForGallium",
  "explosive nucleosynthesis provides bounded origin context for gallium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForGallium",
  "slow neutron capture provides bounded origin context for germanium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForGermanium",
  "rapid neutron capture provides bounded origin context for germanium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForGermanium",
  "explosive nucleosynthesis provides bounded origin context for germanium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForGermanium",
  "slow neutron capture provides bounded origin context for arsenic.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForArsenic",
  "rapid neutron capture provides bounded origin context for arsenic.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForArsenic",
  "explosive nucleosynthesis provides bounded origin context for arsenic.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForArsenic",
  "slow neutron capture provides bounded origin context for selenium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForSelenium",
  "rapid neutron capture provides bounded origin context for selenium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForSelenium",
  "explosive nucleosynthesis provides bounded origin context for selenium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForSelenium",
  "slow neutron capture provides bounded origin context for bromine.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForBromine",
  "rapid neutron capture provides bounded origin context for bromine.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForBromine",
  "explosive nucleosynthesis provides bounded origin context for bromine.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForBromine",
  "slow neutron capture provides bounded origin context for krypton.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForKrypton",
  "rapid neutron capture provides bounded origin context for krypton.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForKrypton",
  "explosive nucleosynthesis provides bounded origin context for krypton.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForKrypton",
  "slow neutron capture provides bounded origin context for rubidium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForRubidium",
  "rapid neutron capture provides bounded origin context for rubidium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForRubidium",
  "explosive nucleosynthesis provides bounded origin context for rubidium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForRubidium",
  "slow neutron capture provides bounded origin context for strontium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForStrontium",
  "rapid neutron capture provides bounded origin context for strontium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForStrontium",
  "explosive nucleosynthesis provides bounded origin context for strontium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForStrontium",
  "slow neutron capture provides bounded origin context for yttrium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForYttrium",
  "rapid neutron capture provides bounded origin context for yttrium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForYttrium",
  "explosive nucleosynthesis provides bounded origin context for yttrium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForYttrium",
  "slow neutron capture provides bounded origin context for zirconium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForZirconium",
  "rapid neutron capture provides bounded origin context for zirconium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForZirconium",
  "explosive nucleosynthesis provides bounded origin context for zirconium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForZirconium",
  "slow neutron capture provides bounded origin context for niobium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForNiobium",
  "rapid neutron capture provides bounded origin context for niobium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForNiobium",
  "explosive nucleosynthesis provides bounded origin context for niobium.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForNiobium",
  "slow neutron capture provides bounded origin context for molybdenum.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForMolybdenum",
  "rapid neutron capture provides bounded origin context for molybdenum.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForMolybdenum",
  "explosive nucleosynthesis provides bounded origin context for molybdenum.": "theoryBadgeGraph.shared.explosiveNucleosynthesisProvidesBoundedOriginContextForMolybdenum",
  "slow neutron capture provides bounded origin context for technetium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForTechnetium",
  "radioactive decay-chain inheritance provides bounded origin context for technetium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForTechnetium",
  "slow neutron capture provides bounded origin context for ruthenium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForRuthenium",
  "rapid neutron capture provides bounded origin context for ruthenium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForRuthenium",
  "p-process or photodisintegration provides bounded origin context for ruthenium.": "theoryBadgeGraph.shared.pProcessOrPhotodisintegrationProvidesBoundedOriginContextForRuthenium",
  "slow neutron capture provides bounded origin context for rhodium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForRhodium",
  "rapid neutron capture provides bounded origin context for rhodium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForRhodium",
  "p-process or photodisintegration provides bounded origin context for rhodium.": "theoryBadgeGraph.shared.pProcessOrPhotodisintegrationProvidesBoundedOriginContextForRhodium",
  "slow neutron capture provides bounded origin context for palladium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForPalladium",
  "rapid neutron capture provides bounded origin context for palladium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForPalladium",
  "p-process or photodisintegration provides bounded origin context for palladium.": "theoryBadgeGraph.shared.pProcessOrPhotodisintegrationProvidesBoundedOriginContextForPalladium",
  "slow neutron capture provides bounded origin context for silver.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForSilver",
  "rapid neutron capture provides bounded origin context for silver.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForSilver",
  "p-process or photodisintegration provides bounded origin context for silver.": "theoryBadgeGraph.shared.pProcessOrPhotodisintegrationProvidesBoundedOriginContextForSilver",
  "slow neutron capture provides bounded origin context for cadmium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForCadmium",
  "rapid neutron capture provides bounded origin context for cadmium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForCadmium",
  "p-process or photodisintegration provides bounded origin context for cadmium.": "theoryBadgeGraph.shared.pProcessOrPhotodisintegrationProvidesBoundedOriginContextForCadmium",
  "slow neutron capture provides bounded origin context for indium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForIndium",
  "rapid neutron capture provides bounded origin context for indium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForIndium",
  "p-process or photodisintegration provides bounded origin context for indium.": "theoryBadgeGraph.shared.pProcessOrPhotodisintegrationProvidesBoundedOriginContextForIndium",
  "slow neutron capture provides bounded origin context for tin.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForTin",
  "rapid neutron capture provides bounded origin context for tin.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForTin",
  "p-process or photodisintegration provides bounded origin context for tin.": "theoryBadgeGraph.shared.pProcessOrPhotodisintegrationProvidesBoundedOriginContextForTin",
  "slow neutron capture provides bounded origin context for antimony.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForAntimony",
  "rapid neutron capture provides bounded origin context for antimony.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForAntimony",
  "p-process or photodisintegration provides bounded origin context for antimony.": "theoryBadgeGraph.shared.pProcessOrPhotodisintegrationProvidesBoundedOriginContextForAntimony",
  "slow neutron capture provides bounded origin context for tellurium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForTellurium",
  "rapid neutron capture provides bounded origin context for tellurium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForTellurium",
  "p-process or photodisintegration provides bounded origin context for tellurium.": "theoryBadgeGraph.shared.pProcessOrPhotodisintegrationProvidesBoundedOriginContextForTellurium",
  "slow neutron capture provides bounded origin context for iodine.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForIodine",
  "rapid neutron capture provides bounded origin context for iodine.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForIodine",
  "p-process or photodisintegration provides bounded origin context for iodine.": "theoryBadgeGraph.shared.pProcessOrPhotodisintegrationProvidesBoundedOriginContextForIodine",
  "slow neutron capture provides bounded origin context for xenon.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForXenon",
  "rapid neutron capture provides bounded origin context for xenon.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForXenon",
  "p-process or photodisintegration provides bounded origin context for xenon.": "theoryBadgeGraph.shared.pProcessOrPhotodisintegrationProvidesBoundedOriginContextForXenon",
  "slow neutron capture provides bounded origin context for cesium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForCesium",
  "rapid neutron capture provides bounded origin context for cesium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForCesium",
  "p-process or photodisintegration provides bounded origin context for cesium.": "theoryBadgeGraph.shared.pProcessOrPhotodisintegrationProvidesBoundedOriginContextForCesium",
  "slow neutron capture provides bounded origin context for barium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForBarium",
  "rapid neutron capture provides bounded origin context for barium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForBarium",
  "p-process or photodisintegration provides bounded origin context for barium.": "theoryBadgeGraph.shared.pProcessOrPhotodisintegrationProvidesBoundedOriginContextForBarium",
  "slow neutron capture provides bounded origin context for lanthanum.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForLanthanum",
  "rapid neutron capture provides bounded origin context for lanthanum.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForLanthanum",
  "slow neutron capture provides bounded origin context for cerium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForCerium",
  "rapid neutron capture provides bounded origin context for cerium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForCerium",
  "slow neutron capture provides bounded origin context for praseodymium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForPraseodymium",
  "rapid neutron capture provides bounded origin context for praseodymium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForPraseodymium",
  "slow neutron capture provides bounded origin context for neodymium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForNeodymium",
  "rapid neutron capture provides bounded origin context for neodymium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForNeodymium",
  "rapid neutron capture provides bounded origin context for promethium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForPromethium",
  "radioactive decay-chain inheritance provides bounded origin context for promethium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForPromethium",
  "rapid neutron capture provides bounded origin context for samarium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForSamarium",
  "slow neutron capture provides bounded origin context for samarium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForSamarium",
  "rapid neutron capture provides bounded origin context for europium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForEuropium",
  "slow neutron capture provides bounded origin context for europium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForEuropium",
  "rapid neutron capture provides bounded origin context for gadolinium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForGadolinium",
  "slow neutron capture provides bounded origin context for gadolinium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForGadolinium",
  "rapid neutron capture provides bounded origin context for terbium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForTerbium",
  "slow neutron capture provides bounded origin context for terbium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForTerbium",
  "rapid neutron capture provides bounded origin context for dysprosium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForDysprosium",
  "slow neutron capture provides bounded origin context for dysprosium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForDysprosium",
  "rapid neutron capture provides bounded origin context for holmium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForHolmium",
  "slow neutron capture provides bounded origin context for holmium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForHolmium",
  "rapid neutron capture provides bounded origin context for erbium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForErbium",
  "slow neutron capture provides bounded origin context for erbium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForErbium",
  "rapid neutron capture provides bounded origin context for thulium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForThulium",
  "slow neutron capture provides bounded origin context for thulium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForThulium",
  "rapid neutron capture provides bounded origin context for ytterbium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForYtterbium",
  "slow neutron capture provides bounded origin context for ytterbium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForYtterbium",
  "rapid neutron capture provides bounded origin context for lutetium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForLutetium",
  "slow neutron capture provides bounded origin context for lutetium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForLutetium",
  "rapid neutron capture provides bounded origin context for hafnium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForHafnium",
  "slow neutron capture provides bounded origin context for hafnium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForHafnium",
  "rapid neutron capture provides bounded origin context for tantalum.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForTantalum",
  "slow neutron capture provides bounded origin context for tantalum.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForTantalum",
  "rapid neutron capture provides bounded origin context for tungsten.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForTungsten",
  "slow neutron capture provides bounded origin context for tungsten.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForTungsten",
  "rapid neutron capture provides bounded origin context for rhenium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForRhenium",
  "slow neutron capture provides bounded origin context for rhenium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForRhenium",
  "rapid neutron capture provides bounded origin context for osmium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForOsmium",
  "slow neutron capture provides bounded origin context for osmium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForOsmium",
  "rapid neutron capture provides bounded origin context for iridium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForIridium",
  "slow neutron capture provides bounded origin context for iridium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForIridium",
  "rapid neutron capture provides bounded origin context for platinum.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForPlatinum",
  "slow neutron capture provides bounded origin context for platinum.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForPlatinum",
  "rapid neutron capture provides bounded origin context for gold.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForGold",
  "slow neutron capture provides bounded origin context for gold.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForGold",
  "slow neutron capture provides bounded origin context for mercury.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForMercury",
  "rapid neutron capture provides bounded origin context for mercury.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForMercury",
  "radioactive decay-chain inheritance provides bounded origin context for mercury.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForMercury",
  "slow neutron capture provides bounded origin context for thallium.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForThallium",
  "rapid neutron capture provides bounded origin context for thallium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForThallium",
  "radioactive decay-chain inheritance provides bounded origin context for thallium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForThallium",
  "slow neutron capture provides bounded origin context for lead.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForLead",
  "rapid neutron capture provides bounded origin context for lead.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForLead",
  "radioactive decay-chain inheritance provides bounded origin context for lead.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForLead",
  "slow neutron capture provides bounded origin context for bismuth.": "theoryBadgeGraph.shared.slowNeutronCaptureProvidesBoundedOriginContextForBismuth",
  "rapid neutron capture provides bounded origin context for bismuth.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForBismuth",
  "radioactive decay-chain inheritance provides bounded origin context for bismuth.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForBismuth",
  "rapid neutron capture provides bounded origin context for polonium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForPolonium",
  "radioactive decay-chain inheritance provides bounded origin context for polonium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForPolonium",
  "rapid neutron capture provides bounded origin context for astatine.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForAstatine",
  "radioactive decay-chain inheritance provides bounded origin context for astatine.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForAstatine",
  "rapid neutron capture provides bounded origin context for radon.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForRadon",
  "radioactive decay-chain inheritance provides bounded origin context for radon.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForRadon",
  "rapid neutron capture provides bounded origin context for francium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForFrancium",
  "radioactive decay-chain inheritance provides bounded origin context for francium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForFrancium",
  "rapid neutron capture provides bounded origin context for radium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForRadium",
  "radioactive decay-chain inheritance provides bounded origin context for radium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForRadium",
  "rapid neutron capture provides bounded origin context for actinium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForActinium",
  "radioactive decay-chain inheritance provides bounded origin context for actinium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForActinium",
  "rapid neutron capture provides bounded origin context for thorium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForThorium",
  "radioactive decay-chain inheritance provides bounded origin context for thorium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForThorium",
  "rapid neutron capture provides bounded origin context for protactinium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForProtactinium",
  "radioactive decay-chain inheritance provides bounded origin context for protactinium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForProtactinium",
  "rapid neutron capture provides bounded origin context for uranium.": "theoryBadgeGraph.shared.rapidNeutronCaptureProvidesBoundedOriginContextForUranium",
  "radioactive decay-chain inheritance provides bounded origin context for uranium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForUranium",
  "laboratory synthesis provides bounded origin context for neptunium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForNeptunium",
  "radioactive decay-chain inheritance provides bounded origin context for neptunium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForNeptunium",
  "laboratory synthesis provides bounded origin context for plutonium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForPlutonium",
  "radioactive decay-chain inheritance provides bounded origin context for plutonium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForPlutonium",
  "laboratory synthesis provides bounded origin context for americium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForAmericium",
  "radioactive decay-chain inheritance provides bounded origin context for americium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForAmericium",
  "laboratory synthesis provides bounded origin context for curium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForCurium",
  "radioactive decay-chain inheritance provides bounded origin context for curium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForCurium",
  "laboratory synthesis provides bounded origin context for berkelium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForBerkelium",
  "radioactive decay-chain inheritance provides bounded origin context for berkelium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForBerkelium",
  "laboratory synthesis provides bounded origin context for californium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForCalifornium",
  "radioactive decay-chain inheritance provides bounded origin context for californium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForCalifornium",
  "laboratory synthesis provides bounded origin context for einsteinium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForEinsteinium",
  "radioactive decay-chain inheritance provides bounded origin context for einsteinium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForEinsteinium",
  "laboratory synthesis provides bounded origin context for fermium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForFermium",
  "radioactive decay-chain inheritance provides bounded origin context for fermium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForFermium",
  "laboratory synthesis provides bounded origin context for mendelevium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForMendelevium",
  "radioactive decay-chain inheritance provides bounded origin context for mendelevium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForMendelevium",
  "laboratory synthesis provides bounded origin context for nobelium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForNobelium",
  "radioactive decay-chain inheritance provides bounded origin context for nobelium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForNobelium",
  "laboratory synthesis provides bounded origin context for lawrencium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForLawrencium",
  "radioactive decay-chain inheritance provides bounded origin context for lawrencium.": "theoryBadgeGraph.shared.radioactiveDecayChainInheritanceProvidesBoundedOriginContextForLawrencium",
  "laboratory synthesis provides bounded origin context for rutherfordium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForRutherfordium",
  "laboratory synthesis provides bounded origin context for dubnium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForDubnium",
  "laboratory synthesis provides bounded origin context for seaborgium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForSeaborgium",
  "laboratory synthesis provides bounded origin context for bohrium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForBohrium",
  "laboratory synthesis provides bounded origin context for hassium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForHassium",
  "laboratory synthesis provides bounded origin context for meitnerium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForMeitnerium",
  "laboratory synthesis provides bounded origin context for darmstadtium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForDarmstadtium",
  "laboratory synthesis provides bounded origin context for roentgenium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForRoentgenium",
  "laboratory synthesis provides bounded origin context for copernicium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForCopernicium",
  "laboratory synthesis provides bounded origin context for nihonium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForNihonium",
  "laboratory synthesis provides bounded origin context for flerovium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForFlerovium",
  "laboratory synthesis provides bounded origin context for moscovium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForMoscovium",
  "laboratory synthesis provides bounded origin context for livermorium.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForLivermorium",
  "laboratory synthesis provides bounded origin context for tennessine.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForTennessine",
  "laboratory synthesis provides bounded origin context for oganesson.": "theoryBadgeGraph.shared.laboratorySynthesisProvidesBoundedOriginContextForOganesson",
  "hydrogen explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.hydrogenExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "hydrogen can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.hydrogenCanDocumentReducedOrderElementYieldPriorContext",
  "helium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.heliumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "helium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.heliumCanDocumentReducedOrderElementYieldPriorContext",
  "lithium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.lithiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "lithium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.lithiumCanDocumentReducedOrderElementYieldPriorContext",
  "beryllium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.berylliumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "beryllium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.berylliumCanDocumentReducedOrderElementYieldPriorContext",
  "boron explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.boronExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "boron can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.boronCanDocumentReducedOrderElementYieldPriorContext",
  "carbon explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.carbonExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "carbon can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.carbonCanDocumentReducedOrderElementYieldPriorContext",
  "nitrogen explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.nitrogenExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "nitrogen can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.nitrogenCanDocumentReducedOrderElementYieldPriorContext",
  "oxygen explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.oxygenExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "oxygen can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.oxygenCanDocumentReducedOrderElementYieldPriorContext",
  "fluorine explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.fluorineExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "fluorine can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.fluorineCanDocumentReducedOrderElementYieldPriorContext",
  "neon explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.neonExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "neon can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.neonCanDocumentReducedOrderElementYieldPriorContext",
  "sodium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.sodiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "sodium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.sodiumCanDocumentReducedOrderElementYieldPriorContext",
  "magnesium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.magnesiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "magnesium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.magnesiumCanDocumentReducedOrderElementYieldPriorContext",
  "aluminum explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.aluminumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "aluminum can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.aluminumCanDocumentReducedOrderElementYieldPriorContext",
  "silicon explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.siliconExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "silicon can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.siliconCanDocumentReducedOrderElementYieldPriorContext",
  "phosphorus explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.phosphorusExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "phosphorus can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.phosphorusCanDocumentReducedOrderElementYieldPriorContext",
  "sulfur explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.sulfurExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "sulfur can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.sulfurCanDocumentReducedOrderElementYieldPriorContext",
  "chlorine explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.chlorineExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "chlorine can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.chlorineCanDocumentReducedOrderElementYieldPriorContext",
  "argon explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.argonExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "argon can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.argonCanDocumentReducedOrderElementYieldPriorContext",
  "potassium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.potassiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "potassium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.potassiumCanDocumentReducedOrderElementYieldPriorContext",
  "calcium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.calciumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "calcium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.calciumCanDocumentReducedOrderElementYieldPriorContext",
  "scandium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.scandiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "scandium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.scandiumCanDocumentReducedOrderElementYieldPriorContext",
  "titanium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.titaniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "titanium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.titaniumCanDocumentReducedOrderElementYieldPriorContext",
  "vanadium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.vanadiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "vanadium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.vanadiumCanDocumentReducedOrderElementYieldPriorContext",
  "chromium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.chromiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "chromium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.chromiumCanDocumentReducedOrderElementYieldPriorContext",
  "manganese explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.manganeseExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "manganese can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.manganeseCanDocumentReducedOrderElementYieldPriorContext",
  "iron explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.ironExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "iron can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.ironCanDocumentReducedOrderElementYieldPriorContext",
  "cobalt explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.cobaltExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "cobalt can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.cobaltCanDocumentReducedOrderElementYieldPriorContext",
  "nickel explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.nickelExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "nickel can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.nickelCanDocumentReducedOrderElementYieldPriorContext",
  "copper explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.copperExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "copper can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.copperCanDocumentReducedOrderElementYieldPriorContext",
  "zinc explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.zincExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "zinc can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.zincCanDocumentReducedOrderElementYieldPriorContext",
  "gallium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.galliumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "gallium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.galliumCanDocumentReducedOrderElementYieldPriorContext",
  "germanium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.germaniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "germanium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.germaniumCanDocumentReducedOrderElementYieldPriorContext",
  "arsenic explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.arsenicExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "arsenic can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.arsenicCanDocumentReducedOrderElementYieldPriorContext",
  "selenium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.seleniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "selenium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.seleniumCanDocumentReducedOrderElementYieldPriorContext",
  "bromine explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.bromineExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "bromine can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.bromineCanDocumentReducedOrderElementYieldPriorContext",
  "krypton explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.kryptonExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "krypton can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.kryptonCanDocumentReducedOrderElementYieldPriorContext",
  "rubidium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.rubidiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "rubidium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.rubidiumCanDocumentReducedOrderElementYieldPriorContext",
  "strontium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.strontiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "strontium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.strontiumCanDocumentReducedOrderElementYieldPriorContext",
  "yttrium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.yttriumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "yttrium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.yttriumCanDocumentReducedOrderElementYieldPriorContext",
  "zirconium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.zirconiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "zirconium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.zirconiumCanDocumentReducedOrderElementYieldPriorContext",
  "niobium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.niobiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "niobium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.niobiumCanDocumentReducedOrderElementYieldPriorContext",
  "molybdenum explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.molybdenumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "molybdenum can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.molybdenumCanDocumentReducedOrderElementYieldPriorContext",
  "technetium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.technetiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "technetium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.technetiumCanDocumentReducedOrderElementYieldPriorContext",
  "ruthenium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.rutheniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "ruthenium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.rutheniumCanDocumentReducedOrderElementYieldPriorContext",
  "rhodium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.rhodiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "rhodium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.rhodiumCanDocumentReducedOrderElementYieldPriorContext",
  "palladium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.palladiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "palladium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.palladiumCanDocumentReducedOrderElementYieldPriorContext",
  "silver explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.silverExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "silver can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.silverCanDocumentReducedOrderElementYieldPriorContext",
  "cadmium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.cadmiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "cadmium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.cadmiumCanDocumentReducedOrderElementYieldPriorContext",
  "indium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.indiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "indium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.indiumCanDocumentReducedOrderElementYieldPriorContext",
  "tin explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.tinExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "tin can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.tinCanDocumentReducedOrderElementYieldPriorContext",
  "antimony explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.antimonyExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "antimony can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.antimonyCanDocumentReducedOrderElementYieldPriorContext",
  "tellurium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.telluriumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "tellurium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.telluriumCanDocumentReducedOrderElementYieldPriorContext",
  "iodine explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.iodineExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "iodine can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.iodineCanDocumentReducedOrderElementYieldPriorContext",
  "xenon explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.xenonExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "xenon can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.xenonCanDocumentReducedOrderElementYieldPriorContext",
  "cesium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.cesiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "cesium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.cesiumCanDocumentReducedOrderElementYieldPriorContext",
  "barium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.bariumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "barium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.bariumCanDocumentReducedOrderElementYieldPriorContext",
  "lanthanum explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.lanthanumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "lanthanum can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.lanthanumCanDocumentReducedOrderElementYieldPriorContext",
  "cerium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.ceriumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "cerium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.ceriumCanDocumentReducedOrderElementYieldPriorContext",
  "praseodymium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.praseodymiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "praseodymium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.praseodymiumCanDocumentReducedOrderElementYieldPriorContext",
  "neodymium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.neodymiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "neodymium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.neodymiumCanDocumentReducedOrderElementYieldPriorContext",
  "promethium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.promethiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "promethium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.promethiumCanDocumentReducedOrderElementYieldPriorContext",
  "samarium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.samariumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "samarium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.samariumCanDocumentReducedOrderElementYieldPriorContext",
  "europium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.europiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "europium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.europiumCanDocumentReducedOrderElementYieldPriorContext",
  "gadolinium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.gadoliniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "gadolinium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.gadoliniumCanDocumentReducedOrderElementYieldPriorContext",
  "terbium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.terbiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "terbium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.terbiumCanDocumentReducedOrderElementYieldPriorContext",
  "dysprosium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.dysprosiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "dysprosium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.dysprosiumCanDocumentReducedOrderElementYieldPriorContext",
  "holmium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.holmiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "holmium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.holmiumCanDocumentReducedOrderElementYieldPriorContext",
  "erbium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.erbiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "erbium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.erbiumCanDocumentReducedOrderElementYieldPriorContext",
  "thulium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.thuliumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "thulium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.thuliumCanDocumentReducedOrderElementYieldPriorContext",
  "ytterbium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.ytterbiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "ytterbium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.ytterbiumCanDocumentReducedOrderElementYieldPriorContext",
  "lutetium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.lutetiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "lutetium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.lutetiumCanDocumentReducedOrderElementYieldPriorContext",
  "hafnium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.hafniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "hafnium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.hafniumCanDocumentReducedOrderElementYieldPriorContext",
  "tantalum explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.tantalumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "tantalum can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.tantalumCanDocumentReducedOrderElementYieldPriorContext",
  "tungsten explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.tungstenExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "tungsten can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.tungstenCanDocumentReducedOrderElementYieldPriorContext",
  "rhenium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.rheniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "rhenium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.rheniumCanDocumentReducedOrderElementYieldPriorContext",
  "osmium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.osmiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "osmium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.osmiumCanDocumentReducedOrderElementYieldPriorContext",
  "iridium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.iridiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "iridium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.iridiumCanDocumentReducedOrderElementYieldPriorContext",
  "platinum explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.platinumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "platinum can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.platinumCanDocumentReducedOrderElementYieldPriorContext",
  "gold explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.goldExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "gold can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.goldCanDocumentReducedOrderElementYieldPriorContext",
  "mercury explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.mercuryExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "mercury can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.mercuryCanDocumentReducedOrderElementYieldPriorContext",
  "thallium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.thalliumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "thallium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.thalliumCanDocumentReducedOrderElementYieldPriorContext",
  "lead explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.leadExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "lead can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.leadCanDocumentReducedOrderElementYieldPriorContext",
  "bismuth explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.bismuthExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "bismuth can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.bismuthCanDocumentReducedOrderElementYieldPriorContext",
  "polonium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.poloniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "polonium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.poloniumCanDocumentReducedOrderElementYieldPriorContext",
  "astatine explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.astatineExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "astatine can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.astatineCanDocumentReducedOrderElementYieldPriorContext",
  "radon explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.radonExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "radon can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.radonCanDocumentReducedOrderElementYieldPriorContext",
  "francium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.franciumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "francium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.franciumCanDocumentReducedOrderElementYieldPriorContext",
  "radium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.radiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "radium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.radiumCanDocumentReducedOrderElementYieldPriorContext",
  "actinium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.actiniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "actinium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.actiniumCanDocumentReducedOrderElementYieldPriorContext",
  "thorium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.thoriumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "thorium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.thoriumCanDocumentReducedOrderElementYieldPriorContext",
  "protactinium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.protactiniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "protactinium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.protactiniumCanDocumentReducedOrderElementYieldPriorContext",
  "uranium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.uraniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "uranium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.uraniumCanDocumentReducedOrderElementYieldPriorContext",
  "neptunium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.neptuniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "neptunium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.neptuniumCanDocumentReducedOrderElementYieldPriorContext",
  "plutonium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.plutoniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "plutonium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.plutoniumCanDocumentReducedOrderElementYieldPriorContext",
  "americium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.americiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "americium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.americiumCanDocumentReducedOrderElementYieldPriorContext",
  "curium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.curiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "curium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.curiumCanDocumentReducedOrderElementYieldPriorContext",
  "berkelium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.berkeliumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "berkelium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.berkeliumCanDocumentReducedOrderElementYieldPriorContext",
  "californium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.californiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "californium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.californiumCanDocumentReducedOrderElementYieldPriorContext",
  "einsteinium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.einsteiniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "einsteinium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.einsteiniumCanDocumentReducedOrderElementYieldPriorContext",
  "fermium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.fermiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "fermium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.fermiumCanDocumentReducedOrderElementYieldPriorContext",
  "mendelevium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.mendeleviumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "mendelevium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.mendeleviumCanDocumentReducedOrderElementYieldPriorContext",
  "nobelium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.nobeliumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "nobelium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.nobeliumCanDocumentReducedOrderElementYieldPriorContext",
  "lawrencium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.lawrenciumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "lawrencium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.lawrenciumCanDocumentReducedOrderElementYieldPriorContext",
  "rutherfordium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.rutherfordiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "rutherfordium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.rutherfordiumCanDocumentReducedOrderElementYieldPriorContext",
  "dubnium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.dubniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "dubnium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.dubniumCanDocumentReducedOrderElementYieldPriorContext",
  "seaborgium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.seaborgiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "seaborgium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.seaborgiumCanDocumentReducedOrderElementYieldPriorContext",
  "bohrium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.bohriumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "bohrium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.bohriumCanDocumentReducedOrderElementYieldPriorContext",
  "hassium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.hassiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "hassium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.hassiumCanDocumentReducedOrderElementYieldPriorContext",
  "meitnerium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.meitneriumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "meitnerium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.meitneriumCanDocumentReducedOrderElementYieldPriorContext",
  "darmstadtium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.darmstadtiumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "darmstadtium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.darmstadtiumCanDocumentReducedOrderElementYieldPriorContext",
  "roentgenium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.roentgeniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "roentgenium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.roentgeniumCanDocumentReducedOrderElementYieldPriorContext",
  "copernicium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.coperniciumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "copernicium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.coperniciumCanDocumentReducedOrderElementYieldPriorContext",
  "nihonium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.nihoniumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "nihonium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.nihoniumCanDocumentReducedOrderElementYieldPriorContext",
  "flerovium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.fleroviumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "flerovium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.fleroviumCanDocumentReducedOrderElementYieldPriorContext",
  "moscovium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.moscoviumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "moscovium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.moscoviumCanDocumentReducedOrderElementYieldPriorContext",
  "livermorium explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.livermoriumExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "livermorium can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.livermoriumCanDocumentReducedOrderElementYieldPriorContext",
  "tennessine explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.tennessineExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "tennessine can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.tennessineCanDocumentReducedOrderElementYieldPriorContext",
  "oganesson explanations require atomic or ionic observable context before identification claims.": "theoryBadgeGraph.shared.oganessonExplanationsRequireAtomicOrIonicObservableContextBeforeIdentification",
  "oganesson can document reduced-order element-yield prior context.": "theoryBadgeGraph.shared.oganessonCanDocumentReducedOrderElementYieldPriorContext",
  "C element-origin context can document prebiotic inventory discussions.": "theoryBadgeGraph.shared.cElementOriginContextCanDocumentPrebioticInventoryDiscussions",
  "N element-origin context can document prebiotic inventory discussions.": "theoryBadgeGraph.shared.nElementOriginContextCanDocumentPrebioticInventoryDiscussions",
  "O element-origin context can document prebiotic inventory discussions.": "theoryBadgeGraph.shared.oElementOriginContextCanDocumentPrebioticInventoryDiscussions",
  "P element-origin context can document prebiotic inventory discussions.": "theoryBadgeGraph.shared.pElementOriginContextCanDocumentPrebioticInventoryDiscussions",
  "S element-origin context can document prebiotic inventory discussions.": "theoryBadgeGraph.shared.sElementOriginContextCanDocumentPrebioticInventoryDiscussions",
  "Hydrogen element context is required for water chemistry discussions.": "theoryBadgeGraph.shared.hydrogenElementContextIsRequiredForWaterChemistryDiscussions",
  "Oxygen element context is required for water chemistry discussions.": "theoryBadgeGraph.shared.oxygenElementContextIsRequiredForWaterChemistryDiscussions",
  "Water chemistry requires inherited elemental inventory and local molecular-cloud context.": "theoryBadgeGraph.shared.waterChemistryRequiresInheritedElementalInventoryAndLocalMolecularCloud",
  "Dust-grain and gas-ice context documents one interstellar water formation route.": "theoryBadgeGraph.shared.dustGrainAndGasIceContextDocumentsOneInterstellarWater",
  "Water chemistry context can document hydrated or aqueous inventory discussions.": "theoryBadgeGraph.shared.waterChemistryContextCanDocumentHydratedOrAqueousInventoryDiscussions",
  "Composition identity still requires dimensionally coherent state descriptors.": "theoryBadgeGraph.shared.compositionIdentityStillRequiresDimensionallyCoherentStateDescriptors",
  "Thermodynamic phase state is interpreted within a declared composition identity.": "theoryBadgeGraph.shared.thermodynamicPhaseStateIsInterpretedWithinADeclaredCompositionIdentity",
  "Density claims require thermodynamic state and EOS or table context.": "theoryBadgeGraph.shared.densityClaimsRequireThermodynamicStateAndEosOrTableContext",
  "Structural-order claims require thermodynamic condition context.": "theoryBadgeGraph.shared.structuralOrderClaimsRequireThermodynamicConditionContext",
  "Spatial or microscopic structure can document the platform in which dynamical order is tested.": "theoryBadgeGraph.shared.spatialOrMicroscopicStructureCanDocumentThePlatformInWhich",
  "Dynamical-order claims require state and boundary context.": "theoryBadgeGraph.shared.dynamicalOrderClaimsRequireStateAndBoundaryContext",
  "Time-crystal order is a time-translation symmetry-breaking question.": "theoryBadgeGraph.shared.timeCrystalOrderIsATimeTranslationSymmetryBreakingQuestion",
  "The historical equilibrium time-crystal claim is represented as a boundary target.": "theoryBadgeGraph.shared.theHistoricalEquilibriumTimeCrystalClaimIsRepresentedAsA",
  "The equilibrium no-go theorem blocks ordinary ground-state or canonical-equilibrium time-crystal claims.": "theoryBadgeGraph.shared.theEquilibriumNoGoTheoremBlocksOrdinaryGroundStateOr",
  "Floquet discrete time crystals specialize time-translation symmetry breaking to periodically driven systems.": "theoryBadgeGraph.shared.floquetDiscreteTimeCrystalsSpecializeTimeTranslationSymmetryBreakingTo",
  "Prethermal discrete time crystals specialize the discrete route to a finite stability window.": "theoryBadgeGraph.shared.prethermalDiscreteTimeCrystalsSpecializeTheDiscreteRouteToA",
  "Driven-dissipative continuous time crystals specialize time-translation symmetry breaking to open-system limit-cycle order.": "theoryBadgeGraph.shared.drivenDissipativeContinuousTimeCrystalsSpecializeTimeTranslationSymmetryBreaking",
  "Floquet discrete time-crystal claims require subharmonic response and rigidity evidence.": "theoryBadgeGraph.shared.floquetDiscreteTimeCrystalClaimsRequireSubharmonicResponseAndRigidity",
  "Prethermal time-crystal claims require lifetime-window and observable-signature evidence.": "theoryBadgeGraph.shared.prethermalTimeCrystalClaimsRequireLifetimeWindowAndObservableSignature",
  "Driven-dissipative continuous time-crystal claims require robust limit-cycle evidence.": "theoryBadgeGraph.shared.drivenDissipativeContinuousTimeCrystalClaimsRequireRobustLimitCycle",
  "Time-crystal signatures may include spectral or frequency-response observables.": "theoryBadgeGraph.shared.timeCrystalSignaturesMayIncludeSpectralOrFrequencyResponseObservables",
  "Density-like quantities can document platform conditions for time-crystal experiments.": "theoryBadgeGraph.shared.densityLikeQuantitiesCanDocumentPlatformConditionsForTimeCrystal",
  "Platform parameters document the experimental conditions under which time-crystal signatures are tested.": "theoryBadgeGraph.shared.platformParametersDocumentTheExperimentalConditionsUnderWhichTimeCrystal",
  "Observable-signature evidence must be interpreted through the time-crystal claim boundary.": "theoryBadgeGraph.shared.observableSignatureEvidenceMustBeInterpretedThroughTheTimeCrystal",
  "The equilibrium no-go result is part of the time-crystal claim boundary.": "theoryBadgeGraph.shared.theEquilibriumNoGoResultIsPartOfTheTime",
  "Time-crystal dynamical order requires an ergodicity-breaking, delayed-thermalization, or balancing route.": "theoryBadgeGraph.shared.timeCrystalDynamicalOrderRequiresAnErgodicityBreakingDelayedThermalization",
  "Ergodicity-breaking context documents why a Floquet system can avoid trivial heating over the claimed window.": "theoryBadgeGraph.shared.ergodicityBreakingContextDocumentsWhyAFloquetSystemCanAvoid",
  "Delayed thermalization documents the prethermal time-crystal route.": "theoryBadgeGraph.shared.delayedThermalizationDocumentsThePrethermalTimeCrystalRoute",
  "Time-crystal order requires collective synchronization or many-body correlation context.": "theoryBadgeGraph.shared.timeCrystalOrderRequiresCollectiveSynchronizationOrManyBodyCorrelation",
  "Many-body synchronization can document subharmonic response and collective temporal order.": "theoryBadgeGraph.shared.manyBodySynchronizationCanDocumentSubharmonicResponseAndCollectiveTemporal",
  "Open-system drive and dissipation document the driven-dissipative continuous time-crystal route.": "theoryBadgeGraph.shared.openSystemDriveAndDissipationDocumentTheDrivenDissipativeContinuous",
  "Driven open-system claims require work, heat, or entropy-production accounting when thermodynamic performance is discussed.": "theoryBadgeGraph.shared.drivenOpenSystemClaimsRequireWorkHeatOrEntropyProduction",
  "Entropy-production context documents the thermodynamic boundary for driven or stochastic time-crystal claims.": "theoryBadgeGraph.shared.entropyProductionContextDocumentsTheThermodynamicBoundaryForDrivenOr",
  "Floquet quasienergy context documents the periodically driven quantum structure behind Floquet time-crystal routes.": "theoryBadgeGraph.shared.floquetQuasienergyContextDocumentsThePeriodicallyDrivenQuantumStructureBehind",
  "Floquet quasienergy context helps interpret stroboscopic and subharmonic signatures.": "theoryBadgeGraph.shared.floquetQuasienergyContextHelpsInterpretStroboscopicAndSubharmonicSignatures",
  "Synchronization gives a shared diagnostic vocabulary for quantum and classical time-crystal comparisons.": "theoryBadgeGraph.shared.synchronizationGivesASharedDiagnosticVocabularyForQuantumAndClassical",
  "Quantum-classical bridge context documents mechanism boundaries for time-crystal comparisons.": "theoryBadgeGraph.shared.quantumClassicalBridgeContextDocumentsMechanismBoundariesForTimeCrystal",
  "Self-organized oscillation language is bounded by collective order, route stability, and thermodynamic context.": "theoryBadgeGraph.shared.selfOrganizedOscillationLanguageIsBoundedByCollectiveOrderRoute",
  "The self-organized oscillation boundary is part of the time-crystal overclaim guard.": "theoryBadgeGraph.shared.theSelfOrganizedOscillationBoundaryIsPartOfTheTime",
  "Structure context can document which frequency modes are meaningful.": "theoryBadgeGraph.shared.structureContextCanDocumentWhichFrequencyModesAreMeaningful",
  "Phase mode frequencies use the shared quantum energy-frequency relation for transition gaps.": "theoryBadgeGraph.shared.phaseModeFrequenciesUseTheSharedQuantumEnergyFrequencyRelation",
  "Mass-density context can document later energy-density bridges only after EOS and volume context are admitted.": "theoryBadgeGraph.shared.massDensityContextCanDocumentLaterEnergyDensityBridgesOnly",
  "Water molecular context must be condition-qualified before phase, structure, or density claims.": "theoryBadgeGraph.shared.waterMolecularContextMustBeConditionQualifiedBeforePhaseStructure",
  "Water phase-state context specializes the generic thermodynamic phase condition pattern.": "theoryBadgeGraph.shared.waterPhaseStateContextSpecializesTheGenericThermodynamicPhaseCondition",
  "Water density context specializes the generic EOS density pattern.": "theoryBadgeGraph.shared.waterDensityContextSpecializesTheGenericEosDensityPattern",
  "Water state can document rotational, vibrational, librational, or phonon mode contexts.": "theoryBadgeGraph.shared.waterStateCanDocumentRotationalVibrationalLibrationalOrPhononMode",
  "Reservoir lifetime interpretation requires an explicit decoherence-evidence boundary.": "theoryBadgeGraph.shared.reservoirLifetimeInterpretationRequiresAnExplicitDecoherenceEvidenceBoundary",
  "Long-lived polariton reservoirs document the temporal-window side of the collective-mode bridge.": "theoryBadgeGraph.shared.longLivedPolaritonReservoirsDocumentTheTemporalWindowSideOf",
  "Time-crystal sensing and linewidth claims require collective lifetime context.": "theoryBadgeGraph.shared.timeCrystalSensingAndLinewidthClaimsRequireCollectiveLifetimeContext",
  "Open noisy routes require a locking, dephasing, and loss margin when synchrony stability is discussed.": "theoryBadgeGraph.shared.openNoisyRoutesRequireALockingDephasingAndLossMargin",
  "Collective linewidth context documents stabilized-versus-noisy trace comparison.": "theoryBadgeGraph.shared.collectiveLinewidthContextDocumentsStabilizedVersusNoisyTraceComparison",
  "Noisy synchrony margin documents the destabilization side of the trace comparison.": "theoryBadgeGraph.shared.noisySynchronyMarginDocumentsTheDestabilizationSideOfTheTrace",
  "Stabilized-versus-noisy traces document time-crystal claim boundaries.": "theoryBadgeGraph.shared.stabilizedVersusNoisyTracesDocumentTimeCrystalClaimBoundaries",
  "Driven magnonic space-time lattice observations document the spatiotemporal-lattice side of the bridge.": "theoryBadgeGraph.shared.drivenMagnonicSpaceTimeLatticeObservationsDocumentTheSpatiotemporalLattice",
  "Magnon space-time lattices document observable spatiotemporal ordering, band folding, and scattering context.": "theoryBadgeGraph.shared.magnonSpaceTimeLatticesDocumentObservableSpatiotemporalOrderingBandFolding",
  "The polariton/time-crystal/magnon bridge is bounded by mechanism and evidence-class differences.": "theoryBadgeGraph.shared.thePolaritonTimeCrystalMagnonBridgeIsBoundedByMechanism",
  "Charged-particle tunneling context requires S-factor context before rate interpretation.": "theoryBadgeGraph.shared.chargedParticleTunnelingContextRequiresSFactorContextBeforeRate",
  "Cross-section context feeds the density and velocity side of thermonuclear rate interpretation.": "theoryBadgeGraph.shared.crossSectionContextFeedsTheDensityAndVelocitySideOf",
  "Plasma screening documents environmental corrections for stellar reaction rates.": "theoryBadgeGraph.shared.plasmaScreeningDocumentsEnvironmentalCorrectionsForStellarReactionRates",
  "Thermonuclear rate context documents how reaction networks receive rate inputs.": "theoryBadgeGraph.shared.thermonuclearRateContextDocumentsHowReactionNetworksReceiveRateInputs",
  "Thermonuclear rate context documents hydrogen-burning fusion conditions.": "theoryBadgeGraph.shared.thermonuclearRateContextDocumentsHydrogenBurningFusionConditions",
  "Mass-defect binding energy documents the energy-accounting side of nuclear binding systematics.": "theoryBadgeGraph.shared.massDefectBindingEnergyDocumentsTheEnergyAccountingSideOf3",
  "Nuclear binding systematics document why shell closures need separate isotope-stability context.": "theoryBadgeGraph.shared.nuclearBindingSystematicsDocumentWhyShellClosuresNeedSeparateIsotope",
  "Nuclear shell context documents bounded isotope-stability context for hydrogen.": "theoryBadgeGraph.shared.nuclearShellContextDocumentsBoundedIsotopeStabilityContextForHydrogen",
  "Nuclear shell context documents bounded isotope-stability context for oxygen.": "theoryBadgeGraph.shared.nuclearShellContextDocumentsBoundedIsotopeStabilityContextForOxygen",
  "Electron shell structure documents the atomic-state side of transition probabilities.": "theoryBadgeGraph.shared.electronShellStructureDocumentsTheAtomicStateSideOfTransition",
  "Line-strength interpretation requires broadening and physical-condition context.": "theoryBadgeGraph.shared.lineStrengthInterpretationRequiresBroadeningAndPhysicalConditionContext",
  "Line broadening documents model and instrument context for spectral inference.": "theoryBadgeGraph.shared.lineBroadeningDocumentsModelAndInstrumentContextForSpectralInference",
  "Atomic line identification documents the feature-matching step in spectral inference.": "theoryBadgeGraph.shared.atomicLineIdentificationDocumentsTheFeatureMatchingStepInSpectral",
  "Elemental inheritance requires astrochemical rate context before molecule-abundance interpretation.": "theoryBadgeGraph.shared.elementalInheritanceRequiresAstrochemicalRateContextBeforeMoleculeAbundanceInterpretation",
  "Molecular abundance networks require destruction and shielding context.": "theoryBadgeGraph.shared.molecularAbundanceNetworksRequireDestructionAndShieldingContext",
  "Astrochemical rate equations document formation and destruction routes for water context.": "theoryBadgeGraph.shared.astrochemicalRateEquationsDocumentFormationAndDestructionRoutesForWater",
  "Thermodynamic phase state requires a potential or phase-equilibrium rule when equilibrium is claimed.": "theoryBadgeGraph.shared.thermodynamicPhaseStateRequiresAPotentialOrPhaseEquilibriumRule",
  "Phase selection and density interpretation require EOS validity context.": "theoryBadgeGraph.shared.phaseSelectionAndDensityInterpretationRequireEosValidityContext",
  "EOS validity context documents density lookups and phase-density claims.": "theoryBadgeGraph.shared.eosValidityContextDocumentsDensityLookupsAndPhaseDensityClaims",
  "Open quantum drive and dissipation claims require a formal open-system dynamics context.": "theoryBadgeGraph.shared.openQuantumDriveAndDissipationClaimsRequireAFormalOpen",
  "Open-system dynamics documents the decoherence and environment-selection bridge.": "theoryBadgeGraph.shared.openSystemDynamicsDocumentsTheDecoherenceAndEnvironmentSelectionBridge",
  "Open-system formalism documents drive, loss, and noise terms in synchrony-margin comparisons.": "theoryBadgeGraph.shared.openSystemFormalismDocumentsDriveLossAndNoiseTermsIn",
  "Structural-order interpretation requires an order-parameter context when phase classification is discussed.": "theoryBadgeGraph.shared.structuralOrderInterpretationRequiresAnOrderParameterContextWhenPhase",
  "Order-parameter context documents symmetry-breaking and collective-mode interpretation.": "theoryBadgeGraph.shared.orderParameterContextDocumentsSymmetryBreakingAndCollectiveModeInterpretation",
  "Time-crystal observable signatures need an order-parameter or correlation-function interpretation.": "theoryBadgeGraph.shared.timeCrystalObservableSignaturesNeedAnOrderParameterOrCorrelation",
  "RG relevance bounds which variables belong in an effective model at a selected resolution.": "theoryBadgeGraph.shared.rgRelevanceBoundsWhichVariablesBelongInAnEffectiveModel",
  "Effective degrees of freedom bound analogies between polariton reservoirs, time crystals, and magnon lattices.": "theoryBadgeGraph.shared.effectiveDegreesOfFreedomBoundAnalogiesBetweenPolaritonReservoirsTime",
  "Effective-model boundaries document which observables are meaningful in a spectral inference pipeline.": "theoryBadgeGraph.shared.effectiveModelBoundariesDocumentWhichObservablesAreMeaningfulInA",
  "Measurement-model uncertainty documents when scalar payloads remain proxies.": "theoryBadgeGraph.shared.measurementModelUncertaintyDocumentsWhenScalarPayloadsRemainProxies",
  "Proxy boundaries constrain S-factor cross-section payload interpretation.": "theoryBadgeGraph.shared.proxyBoundariesConstrainSFactorCrossSectionPayloadInterpretation",
  "Proxy boundaries constrain stabilized-versus-noisy time-crystal trace comparisons.": "theoryBadgeGraph.shared.proxyBoundariesConstrainStabilizedVersusNoisyTimeCrystalTraceComparisons",
  "Spectral inference requires measurement-model and uncertainty context.": "theoryBadgeGraph.shared.spectralInferenceRequiresMeasurementModelAndUncertaintyContext",
  "Spectral inference documents why equivalent width is only an abundance proxy without full modeling.": "theoryBadgeGraph.shared.spectralInferenceDocumentsWhyEquivalentWidthIsOnlyAnAbundance",
  "StarSim stellar stages, object bindings, scalar observables, runtime classification, hydrostatic/nucleosynthesis context, spectral-abundance priors, and Stage 1 boundaries.": "theoryBadgeGraph.shared.starsimStellarStagesObjectBindingsScalarObservablesRuntimeClassificationHydrostatic",
  "Run StarSim fusion microphysics": "theoryBadgeGraph.shared.runStarsimFusionMicrophysics",
  "Returns a StarSim runtime receipt; calculator rows remain scalar support.": "theoryBadgeGraph.shared.returnsAStarsimRuntimeReceiptCalculatorRowsRemainScalarSupport",
  "StarSim Stage 1 is a reduced-order astrophysical prior lane, not a full stellar-evolution solve.": "theoryBadgeGraph.shared.starsimStage1IsAReducedOrderAstrophysicalPriorLane",
  "StarSim paths stay in reduced-order prior scope and cannot promote external physics claims.": "theoryBadgeGraph.shared.starsimPathsStayInReducedOrderPriorScopeAndCannot",
  "Solar restoration rows are planning/forecast context only and cannot imply feasible stellar intervention.": "theoryBadgeGraph.shared.solarRestorationRowsArePlanningForecastContextOnlyAndCannot",
  "Hydrostatic and nucleosynthesis rows are reference/model context unless runtime receipts are attached.": "theoryBadgeGraph.shared.hydrostaticAndNucleosynthesisRowsAreReferenceModelContextUnlessRuntime",
  "Spectral abundance rows are diagnostic priors and candidate line matches, not formation-pathway proof.": "theoryBadgeGraph.shared.spectralAbundanceRowsAreDiagnosticPriorsAndCandidateLineMatches",
  "Stellar carbon, aromatic/fullerenic spectral chemistry, meteoritic organics, prebiotic processing, molecular oscillator context, RNA catalysis context, open-system membrane entropy, and exploratory boundaries before consciousness claims.": "theoryBadgeGraph.shared.stellarCarbonAromaticFullerenicSpectralChemistryMeteoriticOrganicsPrebioticProcessing",
  "Locate prebiotic bridge context": "theoryBadgeGraph.shared.locatePrebioticBridgeContext",
  "Retrieves the diagnostic bridge and boundary rows; no runtime validation is implied.": "theoryBadgeGraph.shared.retrievesTheDiagnosticBridgeAndBoundaryRowsNoRuntimeValidation",
  "Stellar carbon and C60 spectral context do not imply life, consciousness, or objective collapse.": "theoryBadgeGraph.shared.stellarCarbonAndC60SpectralContextDoNotImplyLife",
  "Spectral feature matching identifies candidate atoms, ions, molecules, or dust families; it does not prove formation pathway.": "theoryBadgeGraph.shared.spectralFeatureMatchingIdentifiesCandidateAtomsIonsMoleculesOrDust2",
  "PAH-family and meteoritic inventory rows are ingredient/provenance context, not direct dopamine or life claims.": "theoryBadgeGraph.shared.pahFamilyAndMeteoriticInventoryRowsAreIngredientProvenanceContext",
  "Photochemical and mineral/aqueous rows constrain plausible chemistry without certifying an origin pathway.": "theoryBadgeGraph.shared.photochemicalAndMineralAqueousRowsConstrainPlausibleChemistryWithoutCertifying",
  "Molecular coherence rows require explicit decoherence lifetime context before any outer-theory comparison.": "theoryBadgeGraph.shared.molecularCoherenceRowsRequireExplicitDecoherenceLifetimeContextBeforeAny",
  "Coupled aromatic oscillators are exploratory molecular-coherence context only.": "theoryBadgeGraph.shared.coupledAromaticOscillatorsAreExploratoryMolecularCoherenceContextOnly",
  "RNA-world and membrane rows cannot promote into Orch-OR, pleasure optimization, or consciousness validation.": "theoryBadgeGraph.shared.rnaWorldAndMembraneRowsCannotPromoteIntoOrchOr",
  "Bio Evo": "theoryBadgeGraph.shared.bioEvo",
  "Common descent, selection, eukaryotic kingdoms, conserved microtubules, photosynthetic exciton/coherence context, animal-consciousness evidence context, and hard boundaries before consciousness or collapse claims.": "theoryBadgeGraph.shared.commonDescentSelectionEukaryoticKingdomsConservedMicrotubulesPhotosyntheticExcitonCoherence",
  "Locate evolutionary biophysics context": "theoryBadgeGraph.shared.locateEvolutionaryBiophysicsContext",
  "Retrieves biology bridge rows and the hard consciousness/collapse boundary.": "theoryBadgeGraph.shared.retrievesBiologyBridgeRowsAndTheHardConsciousnessCollapseBoundary",
  "Photosynthetic coherence rows are energy-transfer diagnostics, not consciousness claims.": "theoryBadgeGraph.shared.photosyntheticCoherenceRowsAreEnergyTransferDiagnosticsNotConsciousnessClaims",
  "Conserved microtubules are eukaryotic cytoskeleton context, not Orch-OR validation.": "theoryBadgeGraph.shared.conservedMicrotubulesAreEukaryoticCytoskeletonContextNotOrchOrValidation",
  "Evolutionary lineages and kingdoms are trait context unless specific evidence markers are attached.": "theoryBadgeGraph.shared.evolutionaryLineagesAndKingdomsAreTraitContextUnlessSpecificEvidence",
  "Animal-consciousness rows require neural and behavioral evidence context.": "theoryBadgeGraph.shared.animalConsciousnessRowsRequireNeuralAndBehavioralEvidenceContext",
  "The biology bridge cannot promote into objective-collapse, plant-consciousness, kingdom-consciousness, or NHM2 claims.": "theoryBadgeGraph.shared.theBiologyBridgeCannotPromoteIntoObjectiveCollapsePlantConsciousness",
  "Spectral shifts, parallax, Cepheids, distance modulus, and Hubble-law distance estimates.": "theoryBadgeGraph.shared.spectralShiftsParallaxCepheidsDistanceModulusAndHubbleLawDistance",
  "Distance-ladder estimates are calibration/model dependent.": "theoryBadgeGraph.shared.distanceLadderEstimatesAreCalibrationModelDependent",
  "Cosmological background expansion must not be conflated with local bound-system expansion.": "theoryBadgeGraph.shared.cosmologicalBackgroundExpansionMustNotBeConflatedWithLocalBound",
  "Solar spectrum, reference products, helioseismic context, cycle/magnetogram context, nanoflare, sunquake, and flare-energy observation rows.": "theoryBadgeGraph.shared.solarSpectrumReferenceProductsHelioseismicContextCycleMagnetogramContextNanoflare",
  "Locate solar spectrum context": "theoryBadgeGraph.shared.locateSolarSpectrumContext",
  "Locates solar spectrum badges and calculator payloads; observation runtimes remain separate.": "theoryBadgeGraph.shared.locatesSolarSpectrumBadgesAndCalculatorPayloadsObservationRuntimesRemain",
  "Solar spectral and flare rows are observation/model proxies.": "theoryBadgeGraph.shared.solarSpectralAndFlareRowsAreObservationModelProxies",
  "Instrument calibration and bandpass context are required before physical interpretation.": "theoryBadgeGraph.shared.instrumentCalibrationAndBandpassContextAreRequiredBeforePhysicalInterpretation",
  "Solar reference, helioseismic, neutrino, nanoflare, and sunquake rows remain observational or MHD diagnostics.": "theoryBadgeGraph.shared.solarReferenceHelioseismicNeutrinoNanoflareAndSunquakeRowsRemainObservational",
  "Static and dynamic Casimir, cavity modes, Q factors, gaps, duty budgets, material receipts, and cavity telemetry.": "theoryBadgeGraph.shared.staticAndDynamicCasimirCavityModesQFactorsGapsDuty",
  "Casimir rows are diagnostic/source-context rows and do not establish propulsion evidence.": "theoryBadgeGraph.shared.casimirRowsAreDiagnosticSourceContextRowsAndDoNot",
  "Material, finite-temperature, and measurement interpretations require separate runtime receipts.": "theoryBadgeGraph.shared.materialFiniteTemperatureAndMeasurementInterpretationsRequireSeparateRuntimeReceipts",
  "Warp/GR": "theoryBadgeGraph.shared.warpGr",
  "GR roots, 3+1 references, NHM2 geometry/source diagnostics, tensor blockers, and full-solve context.": "theoryBadgeGraph.shared.grRoots31ReferencesNhm2GeometrySourceDiagnosticsTensor",
  "Run NHM2 diagnostic badge path": "theoryBadgeGraph.shared.runNhm2DiagnosticBadgePath",
  "Runs scalar badge-path playback only; tensor/runtime steps remain context rows.": "theoryBadgeGraph.shared.runsScalarBadgePathPlaybackOnlyTensorRuntimeStepsRemain",
  "NHM2 rows remain diagnostic-only and must not be promoted into propulsion claims.": "theoryBadgeGraph.shared.nhm2RowsRemainDiagnosticOnlyAndMustNotBePromoted",
  "NHM2 Solve": "theoryBadgeGraph.shared.nhm2Solve",
  "Same-chart ADM projection grammar, metric-required tensor route, observer E/J/S projections, tile-effective counterpart, regional closure, energy-condition surfaces, clocking targets, and artifact-governance boundaries.": "theoryBadgeGraph.shared.sameChartAdmProjectionGrammarMetricRequiredTensorRouteObserver",
  "Locate NHM2 full-solve context": "theoryBadgeGraph.shared.locateNhm2FullSolveContext",
  "Locates tensor, observer, closure, QEI, and artifact-governance badges; no validation is implied.": "theoryBadgeGraph.shared.locatesTensorObserverClosureQeiAndArtifactGovernanceBadgesNo",
  "Shift is a chart-dependent descriptor, not ordinary vehicle velocity.": "theoryBadgeGraph.shared.shiftIsAChartDependentDescriptorNotOrdinaryVehicleVelocity",
  "Diagonal proxy rows are not full tensor authority.": "theoryBadgeGraph.shared.diagonalProxyRowsAreNotFullTensorAuthority",
  "Centerline clocking is a target relation, not route certification.": "theoryBadgeGraph.shared.centerlineClockingIsATargetRelationNotRouteCertification",
  "Literature supplies formalism and constraints, not NHM2 validation.": "theoryBadgeGraph.shared.literatureSuppliesFormalismAndConstraintsNotNhm2Validation",
  "Repository artifacts define row status and blockers.": "theoryBadgeGraph.shared.repositoryArtifactsDefineRowStatusAndBlockers",
  "Energy-condition gates, QEI badge replay margins, QEI dossier requirements, stress-energy units, and source residual diagnostics.": "theoryBadgeGraph.shared.energyConditionGatesQeiBadgeReplayMarginsQeiDossierRequirements",
  "QEI and energy-condition rows are diagnostics and cannot be promoted to physical confirmation.": "theoryBadgeGraph.shared.qeiAndEnergyConditionRowsAreDiagnosticsAndCannotBe",
  "Tokamak energy fields, stability proxies, precursor detection, and synthetic diagnostics.": "theoryBadgeGraph.shared.tokamakEnergyFieldsStabilityProxiesPrecursorDetectionAndSyntheticDiagnostics",
  "Locate tokamak runtime context": "theoryBadgeGraph.shared.locateTokamakRuntimeContext",
  "Locates tokamak runtime/reference badges; scalar rows remain calculator-only.": "theoryBadgeGraph.shared.locatesTokamakRuntimeReferenceBadgesScalarRowsRemainCalculatorOnly",
  "Tokamak scalar rows are diagnostic/proxy helpers and do not establish plasma stability.": "theoryBadgeGraph.shared.tokamakScalarRowsAreDiagnosticProxyHelpersAndDoNot",
  "Runtime receipts are required before interpreting energy-field, synthetic diagnostic, or precursor outputs.": "theoryBadgeGraph.shared.runtimeReceiptsAreRequiredBeforeInterpretingEnergyFieldSyntheticDiagnostic",
  "StarMap distances, relative velocities, galactic rotation controls, and Accordion null-model context.": "theoryBadgeGraph.shared.starmapDistancesRelativeVelocitiesGalacticRotationControlsAndAccordionNull",
  "Locate galactic dynamics context": "theoryBadgeGraph.shared.locateGalacticDynamicsContext",
  "Locates galactic null-model and rotation-control badges; runtime comparison remains separate.": "theoryBadgeGraph.shared.locatesGalacticNullModelAndRotationControlBadgesRuntimeComparison",
  "Galactic rows are null-model and population-prior helpers; they do not select a physics winner.": "theoryBadgeGraph.shared.galacticRowsAreNullModelAndPopulationPriorHelpersThey",
  "Bound systems require local dynamics context, not local Hubble-flow interpretation.": "theoryBadgeGraph.shared.boundSystemsRequireLocalDynamicsContextNotLocalHubbleFlow",
  "Granular/tidal rows are material-response diagnostics and require body-specific evidence before interpretation.": "theoryBadgeGraph.shared.granularTidalRowsAreMaterialResponseDiagnosticsAndRequireBody",
  "Curvature proxy rows, objective-collapse comparison seeds, collapse benchmark cadence, uncertainty margins, and diagnostic runtime receipts.": "theoryBadgeGraph.shared.curvatureProxyRowsObjectiveCollapseComparisonSeedsCollapseBenchmarkCadence",
  "Locate curvature/collapse context": "theoryBadgeGraph.shared.locateCurvatureCollapseContext",
  "Locates curvature proxy and collapse benchmark badges; runtime receipts remain separate.": "theoryBadgeGraph.shared.locatesCurvatureProxyAndCollapseBenchmarkBadgesRuntimeReceiptsRemain",
  "Curvature/collapse rows are benchmark diagnostics unless backed by explicit receipts.": "theoryBadgeGraph.shared.curvatureCollapseRowsAreBenchmarkDiagnosticsUnlessBackedByExplicit",
  "Objective-collapse rows are exploratory model-comparison helpers, not proof of physical wavefunction collapse.": "theoryBadgeGraph.shared.objectiveCollapseRowsAreExploratoryModelComparisonHelpersNotProof",
  "DP timescale and rate rows require mass-density branch evidence and experimental-bound context.": "theoryBadgeGraph.shared.dpTimescaleAndRateRowsRequireMassDensityBranchEvidence",
  "Orch-OR rows are exploratory comparison helpers, not consciousness or objective-collapse validation.": "theoryBadgeGraph.shared.orchOrRowsAreExploratoryComparisonHelpersNotConsciousnessOr",
  "Gamma synchrony and microtubule frequency rows do not establish a biological time crystal.": "theoryBadgeGraph.shared.gammaSynchronyAndMicrotubuleFrequencyRowsDoNotEstablishA",
  "Calculator rows do not certify curvature gravity or provide mechanism claims.": "theoryBadgeGraph.shared.calculatorRowsDoNotCertifyCurvatureGravityOrProvideMechanism",
  "Molecular Cloud": "theoryBadgeGraph.shared.molecularCloud",
  "Dense core proxy": "theoryBadgeGraph.shared.denseCoreProxy",
  "Mass/radius proxy for a compact prestellar cloud region.": "theoryBadgeGraph.shared.massRadiusProxyForACompactPrestellarCloudRegion",
  "Low-mass protostar": "theoryBadgeGraph.shared.lowMassProtostar",
  "Young contracting object with inflated radius and weak luminosity.": "theoryBadgeGraph.shared.youngContractingObjectWithInflatedRadiusAndWeakLuminosity",
  "Main Sequence": "theoryBadgeGraph.shared.mainSequence",
  "Solar analog": "theoryBadgeGraph.shared.solarAnalog",
  "G2V-like main-sequence object with solar-normalized observables.": "theoryBadgeGraph.shared.g2vLikeMainSequenceObjectWithSolarNormalizedObservables",
  "Hot CNO candidate": "theoryBadgeGraph.shared.hotCnoCandidate",
  "Hotter, heavier main-sequence proxy for CNO-prior context.": "theoryBadgeGraph.shared.hotterHeavierMainSequenceProxyForCnoPriorContext",
  "Red Giant": "theoryBadgeGraph.shared.redGiant",
  "K1III red giant": "theoryBadgeGraph.shared.k1iiiRedGiant",
  "Expanded red giant sample for shell-fusion context.": "theoryBadgeGraph.shared.expandedRedGiantSampleForShellFusionContext",
  "Red Supergiant": "theoryBadgeGraph.shared.redSupergiant",
  "Massive red supergiant": "theoryBadgeGraph.shared.massiveRedSupergiant",
  "High-luminosity expanded star for late massive-star context.": "theoryBadgeGraph.shared.highLuminosityExpandedStarForLateMassiveStarContext",
  "White Dwarf": "theoryBadgeGraph.shared.whiteDwarf",
  "White dwarf remnant": "theoryBadgeGraph.shared.whiteDwarfRemnant",
  "Compact remnant context; calculator rows are intentionally absent.": "theoryBadgeGraph.shared.compactRemnantContextCalculatorRowsAreIntentionallyAbsent",
  "Supernova context": "theoryBadgeGraph.shared.supernovaContext",
  "Death-stage context that routes to runtime/reference badges.": "theoryBadgeGraph.shared.deathStageContextThatRoutesToRuntimeReferenceBadges",
  "Neutron Star": "theoryBadgeGraph.shared.neutronStar",
  "Neutron star remnant": "theoryBadgeGraph.shared.neutronStarRemnant",
  "Compact quantum-fluid context; not a pp-chain fusion case.": "theoryBadgeGraph.shared.compactQuantumFluidContextNotAPpChainFusionCase",
  "Black Hole": "theoryBadgeGraph.shared.blackHole",
  "Black hole context": "theoryBadgeGraph.shared.blackHoleContext",
  "Compact remnant context; no scalar StarSim fusion solve.": "theoryBadgeGraph.shared.compactRemnantContextNoScalarStarsimFusionSolve",
  "Black Dwarf": "theoryBadgeGraph.shared.blackDwarf",
  "Black dwarf context": "theoryBadgeGraph.shared.blackDwarfContext",
  "Hypothetical cold remnant context with inactive fusion.": "theoryBadgeGraph.shared.hypotheticalColdRemnantContextWithInactiveFusion",
  "Local astrometric distance calibration from parallax.": "theoryBadgeGraph.shared.localAstrometricDistanceCalibrationFromParallax",
  "Proxima-style parallax": "theoryBadgeGraph.shared.proximaStyleParallax",
  "Nearby-star parallax example.": "theoryBadgeGraph.shared.nearbyStarParallaxExample",
  "Spectral Shift": "theoryBadgeGraph.shared.spectralShift",
  "Redshift or blueshift from rest and observed line wavelengths.": "theoryBadgeGraph.shared.redshiftOrBlueshiftFromRestAndObservedLineWavelengths",
  "H-alpha z≈0.1": "theoryBadgeGraph.shared.hAlphaZ01",
  "Rest 656.28 nm observed near 721.91 nm.": "theoryBadgeGraph.shared.rest65628NmObservedNear72191Nm",
  "H-alpha blueshift": "theoryBadgeGraph.shared.hAlphaBlueshift",
  "Rest 656.28 nm observed at 650 nm.": "theoryBadgeGraph.shared.rest65628NmObservedAt650Nm",
  "Period-luminosity relation followed by distance modulus.": "theoryBadgeGraph.shared.periodLuminosityRelationFollowedByDistanceModulus",
  "30-day Cepheid": "theoryBadgeGraph.shared.30DayCepheid",
  "Period, calibration constants, apparent magnitude, and absolute magnitude estimate.": "theoryBadgeGraph.shared.periodCalibrationConstantsApparentMagnitudeAndAbsoluteMagnitudeEstimate",
  "Low-z Hubble": "theoryBadgeGraph.shared.lowZHubble",
  "Approximate distance from low redshift and H0.": "theoryBadgeGraph.shared.approximateDistanceFromLowRedshiftAndH0",
  "Accordion Context": "theoryBadgeGraph.shared.accordionContext",
  "Existing StarSim Accordion redshift and cosmology context boundary.": "theoryBadgeGraph.shared.existingStarsimAccordionRedshiftAndCosmologyContextBoundary",
  "H-alpha Shift": "theoryBadgeGraph.shared.hAlphaShift",
  "Photon energy, line shift, and radial-velocity proxy from a measured H-alpha line.": "theoryBadgeGraph.shared.photonEnergyLineShiftAndRadialVelocityProxyFromA",
  "H-alpha shifted line": "theoryBadgeGraph.shared.hAlphaShiftedLine",
  "Rest 656.28 nm observed at 656.35 nm.": "theoryBadgeGraph.shared.rest65628NmObservedAt65635Nm",
  "Zeeman Split": "theoryBadgeGraph.shared.zeemanSplit",
  "Simple magnetic line-splitting proxy for a solar spectral line.": "theoryBadgeGraph.shared.simpleMagneticLineSplittingProxyForASolarSpectralLine",
  "H-alpha line with simple effective Lande factor and magnetic field.": "theoryBadgeGraph.shared.hAlphaLineWithSimpleEffectiveLandeFactorAndMagnetic",
  "Blackbody Surface": "theoryBadgeGraph.shared.blackbodySurface",
  "Idealized solar Wien peak and Stefan-Boltzmann luminosity rows.": "theoryBadgeGraph.shared.idealizedSolarWienPeakAndStefanBoltzmannLuminosityRows",
  "Solar photosphere": "theoryBadgeGraph.shared.solarPhotosphere",
  "Flare Energy": "theoryBadgeGraph.shared.flareEnergy",
  "Radiant-power duration proxy for a solar flare event.": "theoryBadgeGraph.shared.radiantPowerDurationProxyForASolarFlareEvent",
  "120 s flare proxy": "theoryBadgeGraph.shared.120SFlareProxy",
  "Radiant-power proxy over a two-minute event.": "theoryBadgeGraph.shared.radiantPowerProxyOverATwoMinuteEvent",
  "Parallel Plate Tile": "theoryBadgeGraph.shared.parallelPlateTile",
  "Static Casimir energy and pressure proxies for one idealized plate pair.": "theoryBadgeGraph.shared.staticCasimirEnergyAndPressureProxiesForOneIdealizedPlate",
  "1 nm / 25 cm2 tile": "theoryBadgeGraph.shared.1Nm25Cm2Tile",
  "Idealized 1 nm gap and 25 cm2 footprint from the mechanism note.": "theoryBadgeGraph.shared.idealized1NmGapAnd25Cm2FootprintFromThe",
  "Tile Budget Chain": "theoryBadgeGraph.shared.tileBudgetChain",
  "Aggregate static energy, geometry gain, output energy, and mass proxy rows.": "theoryBadgeGraph.shared.aggregateStaticEnergyGeometryGainOutputEnergyAndMassProxy",
  "Mechanism note budget": "theoryBadgeGraph.shared.mechanismNoteBudget",
  "Mechanism-note defaults for static budget and green-zone gain proxy.": "theoryBadgeGraph.shared.mechanismNoteDefaultsForStaticBudgetAndGreenZoneGain",
  "Cavity Mode": "theoryBadgeGraph.shared.cavityMode",
  "Simple standing-wave cavity frequency and photon energy rows.": "theoryBadgeGraph.shared.simpleStandingWaveCavityFrequencyAndPhotonEnergyRows",
  "1 cm fundamental": "theoryBadgeGraph.shared.1CmFundamental",
  "Keeps Casimir rows in diagnostic/source-context scope.": "theoryBadgeGraph.shared.keepsCasimirRowsInDiagnosticSourceContextScope",
  "GR Reference Roots": "theoryBadgeGraph.shared.grReferenceRoots",
  "Einstein equation, stress-energy conservation, and 3+1 reference context.": "theoryBadgeGraph.shared.einsteinEquationStressEnergyConservationAnd31ReferenceContext",
  "Geometry Sample": "theoryBadgeGraph.shared.geometrySample",
  "Scalar lapse/shift timing row tied to the 3+1 reference branch.": "theoryBadgeGraph.shared.scalarLapseShiftTimingRowTiedToThe31",
  "Sample lapse / shift": "theoryBadgeGraph.shared.sampleLapseShift",
  "One-second shift sample with a 0.1 second lapse offset.": "theoryBadgeGraph.shared.oneSecondShiftSampleWithA01SecondLapse",
  "Source Closure": "theoryBadgeGraph.shared.sourceClosure",
  "Energy density, average cycle power, and source residual scalar diagnostics.": "theoryBadgeGraph.shared.energyDensityAverageCyclePowerAndSourceResidualScalarDiagnostics",
  "Sample source residual": "theoryBadgeGraph.shared.sampleSourceResidual",
  "Simple density, duty-cycle, and source residual defaults.": "theoryBadgeGraph.shared.simpleDensityDutyCycleAndSourceResidualDefaults",
  "Diagnostic Path": "theoryBadgeGraph.shared.diagnosticPath",
  "Scalar path through geometry, source residual, QEI badge replay margin, gate context, and claim boundary.": "theoryBadgeGraph.shared.scalarPathThroughGeometrySourceResidualQeiBadgeReplayMargin",
  "Sample diagnostic path": "theoryBadgeGraph.shared.sampleDiagnosticPath",
  "Small scalar defaults for path lighting and calculator loadout checks.": "theoryBadgeGraph.shared.smallScalarDefaultsForPathLightingAndCalculatorLoadoutChecks",
  "Keeps Warp/GR/NHM2 rows in diagnostic-only scope.": "theoryBadgeGraph.shared.keepsWarpGrNhm2RowsInDiagnosticOnlyScope",
  "Stress-Energy Units": "theoryBadgeGraph.shared.stressEnergyUnits",
  "Energy-density unit bridge into stress-energy tensor context.": "theoryBadgeGraph.shared.energyDensityUnitBridgeIntoStressEnergyTensorContext",
  "Sample energy density": "theoryBadgeGraph.shared.sampleEnergyDensity",
  "One joule over one cubic meter for unit-path checks.": "theoryBadgeGraph.shared.oneJouleOverOneCubicMeterForUnitPathChecks",
  "Source Residual": "theoryBadgeGraph.shared.sourceResidual2",
  "Compares required and available sampled source density.": "theoryBadgeGraph.shared.comparesRequiredAndAvailableSampledSourceDensity",
  "Sample source margin": "theoryBadgeGraph.shared.sampleSourceMargin",
  "Required density 1 and available density 0.8.": "theoryBadgeGraph.shared.requiredDensity1AndAvailableDensity08",
  "QEI Badge Replay Margin": "theoryBadgeGraph.shared.qeiBadgeReplayMargin2",
  "Computes the scalar badge replay margin; the worldline dossier remains the runtime QEI evidence surface.": "theoryBadgeGraph.shared.computesTheScalarBadgeReplayMarginTheWorldlineDossierRemains",
  "Sample QEI badge replay margin": "theoryBadgeGraph.shared.sampleQeiBadgeReplayMargin",
  "Bound 1 minus sample 0.9 in energy-density units.": "theoryBadgeGraph.shared.bound1MinusSample09InEnergyDensityUnits",
  "Energy-Condition Gate": "theoryBadgeGraph.shared.energyConditionGate",
  "Shows source residual and QEI badge replay margin feeding a diagnostic gate context.": "theoryBadgeGraph.shared.showsSourceResidualAndQeiBadgeReplayMarginFeedingA",
  "Sample gate margins": "theoryBadgeGraph.shared.sampleGateMargins",
  "Source and QEI scalar rows for a gate-context check.": "theoryBadgeGraph.shared.sourceAndQeiScalarRowsForAGateContextCheck",
  "Keeps QEI and stress-energy rows diagnostic-only.": "theoryBadgeGraph.shared.keepsQeiAndStressEnergyRowsDiagnosticOnly",
  "Pressure / Beta": "theoryBadgeGraph.shared.pressureBeta",
  "Magnetic pressure, thermal pressure, and plasma beta proxy rows.": "theoryBadgeGraph.shared.magneticPressureThermalPressureAndPlasmaBetaProxyRows",
  "Sample H-mode beta": "theoryBadgeGraph.shared.sampleHModeBeta",
  "Power / Confinement": "theoryBadgeGraph.shared.powerConfinement",
  "Net power and thermal-energy confinement proxy rows.": "theoryBadgeGraph.shared.netPowerAndThermalEnergyConfinementProxyRows",
  "Sample power balance": "theoryBadgeGraph.shared.samplePowerBalance",
  "Precursor Margin": "theoryBadgeGraph.shared.precursorMargin",
  "A scalar score-threshold margin around precursor detection reports.": "theoryBadgeGraph.shared.aScalarScoreThresholdMarginAroundPrecursorDetectionReports",
  "Sample precursor margin": "theoryBadgeGraph.shared.samplePrecursorMargin",
  "Score 0.74 against a 0.65 diagnostic threshold.": "theoryBadgeGraph.shared.score074AgainstA065DiagnosticThreshold",
  "Flux Bands": "theoryBadgeGraph.shared.fluxBands",
  "Core, edge, and scrape-off-layer fraction helper rows.": "theoryBadgeGraph.shared.coreEdgeAndScrapeOffLayerFractionHelperRows",
  "Sample flux bands": "theoryBadgeGraph.shared.sampleFluxBands",
  "Core 640 and edge 210 cells out of 1000 valid cells.": "theoryBadgeGraph.shared.core640AndEdge210CellsOutOf1000Valid",
  "Keeps tokamak scalar rows separate from runtime stability claims.": "theoryBadgeGraph.shared.keepsTokamakScalarRowsSeparateFromRuntimeStabilityClaims",
  "Map Geometry": "theoryBadgeGraph.shared.mapGeometry",
  "3D star-map separation and inverse-distance structure weight rows.": "theoryBadgeGraph.shared.3dStarMapSeparationAndInverseDistanceStructureWeightRows",
  "Sample local stream": "theoryBadgeGraph.shared.sampleLocalStream",
  "Separation vector (3,4,12) pc with a precomputed 13 pc distance.": "theoryBadgeGraph.shared.separationVector3412PcWithAPrecomputed13",
  "Relative Velocity": "theoryBadgeGraph.shared.relativeVelocity",
  "3D relative velocity and structure-prior context between star-map nodes.": "theoryBadgeGraph.shared.3dRelativeVelocityAndStructurePriorContextBetweenStarMap",
  "Sample velocity stream": "theoryBadgeGraph.shared.sampleVelocityStream",
  "Velocity delta (8,-6,3) km/s between two map nodes.": "theoryBadgeGraph.shared.velocityDelta863KmSBetweenTwoMap",
  "Rotation Controls": "theoryBadgeGraph.shared.rotationControls",
  "Newtonian circular velocity, acceleration, and rotation residual helper rows.": "theoryBadgeGraph.shared.newtonianCircularVelocityAccelerationAndRotationResidualHelperRows",
  "Sample rotation control": "theoryBadgeGraph.shared.sampleRotationControl",
  "Enclosed mass 5e10 Msun at 8 kpc, observed 220 km/s, model 190 km/s.": "theoryBadgeGraph.shared.enclosedMass5e10MsunAt8KpcObserved220Km",
  "Accordion Null Model": "theoryBadgeGraph.shared.accordionNullModel",
  "Accordion cosmology context and galactic null-model runtime boundary.": "theoryBadgeGraph.shared.accordionCosmologyContextAndGalacticNullModelRuntimeBoundary",
  "Keeps galactic dynamics rows in null-model and population-prior scope.": "theoryBadgeGraph.shared.keepsGalacticDynamicsRowsInNullModelAndPopulationPrior",
  "Curvature Proxy": "theoryBadgeGraph.shared.curvatureProxy",
  "Mass-density and drive-power curvature proxy rows.": "theoryBadgeGraph.shared.massDensityAndDrivePowerCurvatureProxyRows",
  "Sample curvature proxy": "theoryBadgeGraph.shared.sampleCurvatureProxy",
  "Density and drive-power proxy values with explicit area, duty, and gain.": "theoryBadgeGraph.shared.densityAndDrivePowerProxyValuesWithExplicitAreaDuty",
  "Collapse Benchmark": "theoryBadgeGraph.shared.collapseBenchmark",
  "Hazard, causal footprint, and curvature-unit benchmark rows.": "theoryBadgeGraph.shared.hazardCausalFootprintAndCurvatureUnitBenchmarkRows",
  "Sample collapse cadence": "theoryBadgeGraph.shared.sampleCollapseCadence",
  "Uncertainty Margin": "theoryBadgeGraph.shared.uncertaintyMargin",
  "Scalar margin and normalized uncertainty rows for benchmark decisions.": "theoryBadgeGraph.shared.scalarMarginAndNormalizedUncertaintyRowsForBenchmarkDecisions",
  "Sample uncertainty margin": "theoryBadgeGraph.shared.sampleUncertaintyMargin",
  "Observed 0.82 against bound 1 with sigma 0.04.": "theoryBadgeGraph.shared.observed082AgainstBound1WithSigma004",
  "Runtime Benchmark": "theoryBadgeGraph.shared.runtimeBenchmark",
  "Collapse benchmark route and curvature leverage benchmark script context.": "theoryBadgeGraph.shared.collapseBenchmarkRouteAndCurvatureLeverageBenchmarkScriptContext",
  "Keeps curvature/collapse rows in diagnostic and benchmark scope.": "theoryBadgeGraph.shared.keepsCurvatureCollapseRowsInDiagnosticAndBenchmarkScope",
};

function hasRuntimeReferenceEquation(badge: TheoryBadgeV1): boolean {
  return badge.equations.some((equation: TheoryBadgeEquationV1) =>
    RUNTIME_REFERENCE_OPERATOR_KINDS.some((operatorKind) => operatorKind === equation.operatorKind),
  );
}
function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a: string, b: string) => a.localeCompare(b));
}

async function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(value);
  }
}

function statusClass(status: string) {
  switch (status) {
    case "running":
      return "border-cyan-500 bg-cyan-950/40 text-cyan-100";
    case "solved":
      return "border-emerald-500 bg-emerald-950/40 text-emerald-100";
    case "failed":
      return "border-rose-500 bg-rose-950/40 text-rose-100";
    case "skipped":
      return "border-slate-700 bg-slate-900/70 text-slate-300";
    default:
      return "border-slate-800 bg-slate-950/70 text-slate-500";
  }
}

function firstRouteLabelForMode(decision: TheoryRouteBadgeEligibilityV1, mode: TheoryGraphMapMode): string | null {
  if (mode === "concept") return null;
  if (decision.decision === "blocked") return labelize(decision.reason);
  if (mode === "evidence") {
    if (decision.labels.includes("evidence refs present")) return "evidence";
    if (decision.labels.includes("diagnostic only")) return "diagnostic";
    if (decision.labels.includes("certificate required")) return "certificate required";
    return null;
  }
  if (decision.labels.includes("scalar-solvable")) return "scalar";
  if (decision.labels.includes("runtime entrypoint available")) return "runtime";
  if (decision.labels.includes("tensor/runtime")) return "tensor";
  if (decision.labels.includes("gate")) return "gate";
  if (decision.labels.includes("boundary")) return "boundary";
  if (decision.labels.includes("reference only")) return "reference";
  return null;
}

function routeToneForLabel(decision: TheoryRouteBadgeEligibilityV1, label: string): "cyan" | "emerald" | "amber" | "rose" | "slate" {
  if (decision.decision === "blocked") return "rose";
  if (label === "scalar" || label === "evidence") return "emerald";
  if (label === "runtime" || label === "tensor") return "cyan";
  if (label === "gate" || label === "boundary" || label === "diagnostic" || label === "certificate required") return "amber";
  return "slate";
}

function routeBadgeLabelsForMode(
  eligibility: TheoryRouteEligibilityResultV1 | null,
  mode: TheoryGraphMapMode,
): Record<string, { label: string; tone: "cyan" | "emerald" | "amber" | "rose" | "slate"; title: string }> {
  if (!eligibility || mode === "concept") return {};
  return eligibility.badges.reduce<Record<string, { label: string; tone: "cyan" | "emerald" | "amber" | "rose" | "slate"; title: string }>>(
    (acc, decision) => {
      const label = firstRouteLabelForMode(decision, mode);
      if (!label) return acc;
      acc[decision.badgeId] = {
        label,
        tone: routeToneForLabel(decision, label),
        title: [labelize(decision.reason), ...decision.details, ...decision.labels].filter(Boolean).join(" | "),
      };
      return acc;
    },
    {},
  );
}

function dominantProbabilityId(probabilities: Record<string, number>): string | null {
  const entries = Object.entries(probabilities);
  if (entries.length === 0) return null;
  return entries.sort(([leftId, leftProbability], [rightId, rightProbability]) => {
    const delta = rightProbability - leftProbability;
    return delta !== 0 ? delta : leftId.localeCompare(rightId);
  })[0][0];
}

function placementCertaintyFromReflection(
  reflection: TheoryContextReflectionV1 | null,
): ProbabilityTerrainV1 | undefined {
  const uncertainty = reflection?.overlay.uncertainty;
  if (!uncertainty) return undefined;
  const placementCertainty =
    uncertainty.priorEntropyBits > 0
      ? Math.max(0, Math.min(1, uncertainty.informationGainBits / uncertainty.priorEntropyBits))
      : Object.keys(uncertainty.badgeProbabilityById).length === 1
        ? 1
        : 0;

  return {
    schemaVersion: PROBABILITY_TERRAIN_SCHEMA_VERSION,
    graphKind: "theory_badge_graph",
    candidateProbabilityById: uncertainty.badgeProbabilityById,
    renderChunkProbabilityById: uncertainty.renderChunkProbabilityById,
    semanticChunkProbabilityById: uncertainty.semanticChunkProbabilityById,
    priorEntropyBits: uncertainty.priorEntropyBits,
    posteriorEntropyBits: uncertainty.posteriorEntropyBits,
    informationGainBits: uncertainty.informationGainBits,
    normalizedMass: uncertainty.normalizedMass,
    placementCertainty: Number(placementCertainty.toFixed(6)),
    uncertaintyMode: uncertainty.uncertaintyMode,
    dominantCandidateId: dominantProbabilityId(uncertainty.badgeProbabilityById),
    dominantRenderChunkId: dominantProbabilityId(uncertainty.renderChunkProbabilityById),
    dominantSemanticChunkId: dominantProbabilityId(uncertainty.semanticChunkProbabilityById),
    interpretation: "placement_probability_not_truth_claim",
  };
}

function SelectFilter({
  label,
  allLabel,
  value,
  options,
  onChange,
  translateText = (text: string) => text,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  translateText?: (text: string) => string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      {label}
      <select data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.theory-badge-graph.theory-badge-graph-panel.select"
        value={value}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
        className="h-9 rounded-md border border-slate-800 bg-slate-950 px-2 text-sm normal-case tracking-normal text-slate-100 outline-none focus:border-cyan-500"
      >
        <option value="all">{allLabel}</option>
        {options.map((option: string) => (
          <option key={option} value={option}>
            {translateText(labelize(option))}
          </option>
        ))}
      </select>
    </label>
  );
}

function BadgeButton({
  badge,
  selected,
  onSelect,
  calculatorLoadableLabel,
  translateText,
}: {
  badge: TheoryBadgeV1;
  selected: boolean;
  onSelect: () => void;
  calculatorLoadableLabel: string;
  translateText: (text: string) => string;
}) {
  return (
    <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.theory-badge-graph.theory-badge-graph-panel.on-select"
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border p-3 text-left transition ${
        selected
          ? "border-cyan-500 bg-cyan-950/40 text-cyan-50"
          : "border-slate-800 bg-slate-950/70 text-slate-100 hover:border-slate-600"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{translateText(badge.title)}</div>
          <div className="mt-1 line-clamp-2 text-xs text-slate-400">{translateText(badge.plainMeaning)}</div>
        </div>
        {badge.calculatorPayloads.length > 0 ? (
          <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-label={calculatorLoadableLabel} />
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
          {translateText(labelize(badge.level))}
        </Badge>
        <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
          {translateText(labelize(badge.status))}
        </Badge>
      </div>
    </button>
  );
}

function LoadPayloadButton({
  badge,
  payload,
  t,
}: {
  badge: TheoryBadgeV1;
  payload: TheoryBadgeCalculatorPayloadV1;
  t: InterfaceTextResolver["t"];
}) {
  return (
    <Button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.theory-badge-graph.theory-badge-graph-panel.dispatch-scientific-calculator-math-picked-latex-payload-display-latex-p"
      type="button"
      size="sm"
      variant="secondary"
      onClick={() =>
        dispatchScientificCalculatorMathPicked({
          latex: payload.displayLatex || payload.expression,
          sourcePath: `theory://${badge.id}/${payload.id}`,
          anchor: payload.id,
        })
      }
      className="gap-2"
    >
      <Calculator className="h-4 w-4" />
      {t("theoryBadgeGraph.action.loadToCalculator")}
    </Button>
  );
}

function RelatedBadgeRow({
  edge,
  selectedId,
  byId,
  onSelect,
  translateText,
}: {
  edge: TheoryBadgeEdgeV1;
  selectedId: string;
  byId: Map<string, TheoryBadgeV1>;
  onSelect: (id: string) => void;
  translateText: (text: string) => string;
}) {
  const relatedId = edge.from === selectedId ? edge.to : edge.from;
  const related = byId.get(relatedId);
  return (
    <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.theory-badge-graph.theory-badge-graph-panel.on-select-related-id"
      type="button"
      onClick={() => onSelect(relatedId)}
      className="w-full rounded-md border border-slate-800 bg-slate-950/70 p-2 text-left text-xs text-slate-300 hover:border-slate-600"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-100">{related ? translateText(related.title) : relatedId}</span>
        <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
          {translateText(labelize(edge.relation))}
        </Badge>
      </div>
      <div className="mt-1 text-slate-400">{translateText(edge.label)}</div>
    </button>
  );
}

function Inspector({
  badge,
  graph,
  onSelect,
  onOpenPanel,
  playback,
  onRunPlayback,
  onLoadTheoryRun,
  onClearPlayback,
  playbackStatus,
  t,
  translateText,
}: {
  badge: TheoryBadgeV1 | null;
  graph: TheoryBadgeGraphV1 | undefined;
  onSelect: (id: string) => void;
  onOpenPanel: (id: string) => void;
  playback: TheoryBadgePlaybackArtifactV1 | null;
  onRunPlayback: () => void;
  onLoadTheoryRun: () => void;
  onClearPlayback: () => void;
  playbackStatus: "idle" | "running" | "complete" | "failed";
  t: InterfaceTextResolver["t"];
  translateText: (text: string) => string;
}) {
  const byId = useMemo(
    () =>
      new Map<string, TheoryBadgeV1>(
        (graph?.badges ?? []).map((item: TheoryBadgeV1) => [item.id, item]),
      ),
    [graph?.badges],
  );
  const relatedEdges = useMemo(
    () =>
      (graph?.edges ?? []).filter(
        (edge: TheoryBadgeEdgeV1) => edge.from === badge?.id || edge.to === badge?.id,
      ),
    [badge?.id, graph?.edges],
  );

  if (!badge) {
    return (
      <Card className="border-slate-800 bg-slate-950/80">
        <CardContent className="p-6 text-sm text-slate-400">
          {t("theoryBadgeGraph.empty.selectBadge")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-800 bg-slate-950/80">
      <CardHeader className="border-b border-slate-800 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg text-slate-50">{translateText(badge.title)}</CardTitle>
            <div className="mt-1 text-xs text-slate-400">{badge.id}</div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-wrap gap-1">
              <Badge className="bg-cyan-900/80 text-cyan-50">{translateText(labelize(badge.level))}</Badge>
              <Badge variant="outline" className="border-slate-700 text-slate-300">
                {translateText(labelize(badge.status))}
              </Badge>
            </div>
            <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.theory-badge-graph.theory-badge-graph-panel.on-run-playback"
              type="button"
              size="sm"
              onClick={onRunPlayback}
              disabled={playbackStatus === "running"}
              className="gap-2 bg-cyan-700 text-white hover:bg-cyan-600"
            >
              <Play className="h-4 w-4" />
              {t("theoryBadgeGraph.action.runPath")}
            </Button>
            <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.theory-badge-graph.theory-badge-graph-panel.on-load-theory-run"
              type="button"
              size="sm"
              variant="outline"
              onClick={onLoadTheoryRun}
              className="gap-2 border-cyan-700 text-cyan-100 hover:bg-cyan-950/50"
            >
              <Calculator className="h-4 w-4" />
              {t("theoryBadgeGraph.action.loadTheoryRun")}
            </Button>
            {badge.id.startsWith("nhm2.") ? (
              <Button
                data-helix-interaction-kind="configure"
                data-helix-authority-state="client_local"
                data-helix-control-id="workstation.panel.theory-badge-graph.open-nhm2-solve-state"
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenPanel("nhm2-solve-state")}
                className="gap-2 border-sky-700 text-sky-100 hover:bg-sky-950/50"
              >
                <ExternalLink className="h-4 w-4" />
                {translateText("Open NHM2 Solve State")}
              </Button>
            ) : null}
            {badge.id.startsWith("physics.atomic.") ? (
              <Button
                data-helix-interaction-kind="configure"
                data-helix-authority-state="client_local"
                data-helix-control-id="workstation.panel.theory-badge-graph.open-atomic-model"
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenPanel("electron-orbital")}
                className="gap-2 border-slate-700 text-slate-100 hover:bg-slate-900"
              >
                <ExternalLink className="h-4 w-4" />
                {translateText("Open atomic model experiment")}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("theoryBadgeGraph.inspector.meaning")}
          </h3>
          <p className="mt-1 text-sm text-slate-200">{translateText(badge.plainMeaning)}</p>
          <p className="mt-2 text-sm text-slate-400">{translateText(badge.whyItMatters)}</p>
        </section>
        {CAMPAIGN_GROUP_BY_BADGE[badge.id] ? (
          <SelectedCampaignReceipt
            groupId={CAMPAIGN_GROUP_BY_BADGE[badge.id]}
            translateText={translateText}
          />
        ) : null}

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("theoryBadgeGraph.inspector.equations")}
          </h3>
          <div className="mt-2 space-y-2">
            {badge.equations.map((equation: TheoryBadgeEquationV1) => (
              <div key={equation.id} className="rounded-md border border-slate-800 bg-slate-900/50 p-3">
                <div className="font-mono text-sm text-cyan-100">{equation.displayLatex}</div>
                {equation.computableExpression ? (
                  <div className="mt-1 font-mono text-xs text-slate-400">{equation.computableExpression}</div>
                ) : null}
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                      {translateText(labelize(equation.role))}
                    </Badge>
                    {equation.operatorKind ? (
                      <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                        {translateText(labelize(equation.operatorKind))}
                      </Badge>
                    ) : null}
                  </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("theoryBadgeGraph.inspector.units")}
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {badge.units.length > 0 ? (
              badge.units.map((unit: TheoryBadgeUnitV1) => (
                <div key={`${unit.symbol}-${unit.dimensionSignature ?? unit.unit ?? "unit"}`} className="rounded-md border border-slate-800 bg-slate-900/50 p-2 text-xs">
                  <div className="font-mono text-slate-100">{unit.symbol}</div>
                  <div className="mt-1 text-slate-400">
                    {[unit.quantity, unit.unit, unit.dimensionSignature].filter(Boolean).join(" | ")}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">{t("theoryBadgeGraph.empty.noUnits")}</div>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("theoryBadgeGraph.inspector.assumptions")}
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {badge.assumptions.map((assumption: string) => (
              <li key={assumption}>- {translateText(assumption)}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("theoryBadgeGraph.inspector.calculatorPayloads")}
          </h3>
          <div className="mt-2 space-y-2">
            {badge.calculatorPayloads.length > 0 ? (
              badge.calculatorPayloads.map((payload: TheoryBadgeCalculatorPayloadV1) => (
                <div key={payload.id} className="rounded-md border border-slate-800 bg-slate-900/50 p-3">
                  <div className="font-mono text-sm text-cyan-100">{payload.displayLatex}</div>
                  <div className="mt-1 font-mono text-xs text-slate-400">{payload.expression}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <LoadPayloadButton badge={badge} payload={payload} t={t} />
                    <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                      {translateText(labelize(payload.preferredAction))}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">{t("theoryBadgeGraph.empty.noCalculatorPayload")}</div>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("theoryBadgeGraph.inspector.sourceRefs")}
          </h3>
          <div className="mt-2 space-y-2">
            {badge.sourceRefs.map((source: TheoryBadgeSourceRefV1, index: number) => (
              <div key={`${source.kind}-${source.path ?? source.id ?? index}`} className="rounded-md border border-slate-800 bg-slate-900/50 p-2 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                  <span className="font-semibold">{translateText(labelize(source.kind))}</span>
                </div>
                <div className="mt-1 font-mono text-slate-400">{source.path ?? source.id}</div>
                {source.note ? <div className="mt-1 text-slate-500">{translateText(source.note)}</div> : null}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("theoryBadgeGraph.inspector.relatedBadges")}
          </h3>
          <div className="mt-2 space-y-2">
            {relatedEdges.length > 0 ? (
              relatedEdges.map((edge: TheoryBadgeEdgeV1) => (
                <RelatedBadgeRow key={edge.id} edge={edge} selectedId={badge.id} byId={byId} onSelect={onSelect} translateText={translateText} />
              ))
            ) : (
              <div className="text-sm text-slate-500">{t("theoryBadgeGraph.empty.noRelatedEdges")}</div>
            )}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("theoryBadgeGraph.playback.title")}
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.theory-badge-graph.theory-badge-graph-panel.playback-copy-text-json-stringify-playback-null-2"
                type="button"
                size="sm"
                variant="outline"
                disabled={!playback}
                onClick={() => playback && copyText(JSON.stringify(playback, null, 2))}
                className="gap-2 border-slate-700"
              >
                <Copy className="h-4 w-4" />
                {t("theoryBadgeGraph.action.copyPlaybackJson")}
              </Button>
              <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.theory-badge-graph.theory-badge-graph-panel.playback-copy-text-format-theory-badge-playback-markdown-playback"
                type="button"
                size="sm"
                variant="outline"
                disabled={!playback}
                onClick={() => playback && copyText(formatTheoryBadgePlaybackMarkdown(playback))}
                className="gap-2 border-slate-700"
              >
                <Copy className="h-4 w-4" />
                {t("theoryBadgeGraph.action.copyPlaybackMarkdown")}
              </Button>
              <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.theory-badge-graph.theory-badge-graph-panel.on-clear-playback"
                type="button"
                size="sm"
                variant="ghost"
                disabled={!playback}
                onClick={onClearPlayback}
                className="gap-2 text-slate-300"
              >
                <Trash2 className="h-4 w-4" />
                {t("theoryBadgeGraph.action.clearPlayback")}
              </Button>
            </div>
          </div>
          {playback ? (
            <div className="mt-3 space-y-2">
              <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-5">
                <div>{t("theoryBadgeGraph.playback.badges", { count: playback.summary.badgeCount })}</div>
                <div>{t("theoryBadgeGraph.playback.payloads", { count: playback.summary.payloadCount })}</div>
                <div>{t("theoryBadgeGraph.playback.solved", { count: playback.summary.solvedCount })}</div>
                <div>{t("theoryBadgeGraph.playback.skipped", { count: playback.summary.skippedCount })}</div>
                <div>{t("theoryBadgeGraph.playback.failed", { count: playback.summary.failedCount })}</div>
              </div>
              {playback.steps.map((step: TheoryBadgePlaybackStepV1) => (
                <div key={step.id} className={`rounded-md border p-3 text-sm ${statusClass(step.status)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">
                      {step.index}. {step.badgeTitle}
                    </div>
                    <Badge variant="outline" className="border-current text-[10px]">
                      {step.status}
                    </Badge>
                  </div>
                  <div className="mt-1 font-mono text-xs opacity-80">
                    {step.payloadId ?? `skipped: ${step.skipReason ?? "unknown"}`}
                  </div>
                  {step.expression ? <div className="mt-2 font-mono text-xs opacity-90">{step.expression}</div> : null}
                  <div className="mt-2 grid gap-1 text-xs opacity-90 sm:grid-cols-4">
                    <div>kind: {step.resultKind ?? "-"}</div>
                    <div>confidence: {step.confidence ?? "-"}</div>
                    <div>fallback: {step.fallbackReason ?? "-"}</div>
                    <div>artifact: {step.calculatorArtifactV1 ? "yes" : "no"}</div>
                  </div>
                  {step.resultText ? <div className="mt-2 text-xs opacity-95">result: {step.resultText}</div> : null}
                  {step.warnings.length > 0 ? (
                    <div className="mt-2 text-xs opacity-90">warnings: {step.warnings.join("; ")}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 rounded-md border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-500">
              {t("theoryBadgeGraph.empty.noPlayback")}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

export default function TheoryBadgeGraphPanel() {
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("all");
  const [level, setLevel] = useState("all");
  const [status, setStatus] = useState("all");
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(interfaceLanguage.code);
  const selectedId = useTheoryBadgeGraphPanelStore((state) => state.selectedBadgeId);
  const selectedBadgeIds = useTheoryBadgeGraphPanelStore((state) => state.selectedBadgeIds);
  const viewport = useTheoryBadgeGraphPanelStore((state) => state.viewport);
  const activeLensId = useTheoryBadgeGraphPanelStore((state) => state.activeAtlasLensId);
  const selectedEvolutionStageId = useTheoryBadgeGraphPanelStore((state) => state.selectedStarSimStageId);
  const selectedObjectBindingId = useTheoryBadgeGraphPanelStore((state) => state.selectedStarSimObjectBindingId);
  const selectedCosmicRungId = useTheoryBadgeGraphPanelStore((state) => state.selectedCosmicDistanceRungId);
  const selectedCosmicObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.selectedCosmicDistanceObjectBindingId,
  );
  const selectedSolarGroupId = useTheoryBadgeGraphPanelStore((state) => state.selectedSolarSpectrumGroupId);
  const selectedSolarObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.selectedSolarSpectrumObjectBindingId,
  );
  const selectedCasimirGroupId = useTheoryBadgeGraphPanelStore((state) => state.selectedCasimirCavityGroupId);
  const selectedCasimirObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.selectedCasimirCavityObjectBindingId,
  );
  const selectedWarpGroupId = useTheoryBadgeGraphPanelStore((state) => state.selectedWarpGrNhm2GroupId);
  const selectedWarpObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.selectedWarpGrNhm2ObjectBindingId,
  );
  const selectedQeiGroupId = useTheoryBadgeGraphPanelStore((state) => state.selectedQeiStressEnergyGroupId);
  const selectedQeiObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.selectedQeiStressEnergyObjectBindingId,
  );
  const selectedTokamakGroupId = useTheoryBadgeGraphPanelStore((state) => state.selectedTokamakPlasmaGroupId);
  const selectedTokamakObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.selectedTokamakPlasmaObjectBindingId,
  );
  const selectedGalacticGroupId = useTheoryBadgeGraphPanelStore((state) => state.selectedGalacticDynamicsGroupId);
  const selectedGalacticObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.selectedGalacticDynamicsObjectBindingId,
  );
  const selectedCurvatureGroupId = useTheoryBadgeGraphPanelStore((state) => state.selectedCurvatureCollapseGroupId);
  const selectedCurvatureObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.selectedCurvatureCollapseObjectBindingId,
  );
  const activeTheoryRun = useTheoryCompoundRunStore((state) => state.activeTheoryRun);
  const setSelectedBadgeId = useTheoryBadgeGraphPanelStore((state) => state.setSelectedBadgeId);
  const setSelectedBadgeIds = useTheoryBadgeGraphPanelStore((state) => state.setSelectedBadgeIds);
  const rememberViewport = useTheoryBadgeGraphPanelStore((state) => state.rememberViewport);
  const setActiveAtlasLensId = useTheoryBadgeGraphPanelStore((state) => state.setActiveAtlasLensId);
  const setSelectedEvolutionStageId = useTheoryBadgeGraphPanelStore((state) => state.setSelectedStarSimStageId);
  const setSelectedObjectBindingId = useTheoryBadgeGraphPanelStore((state) => state.setSelectedStarSimObjectBindingId);
  const clearStarSimObjectBinding = useTheoryBadgeGraphPanelStore((state) => state.clearStarSimObjectBinding);
  const setSelectedCosmicRungId = useTheoryBadgeGraphPanelStore((state) => state.setSelectedCosmicDistanceRungId);
  const setSelectedCosmicObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.setSelectedCosmicDistanceObjectBindingId,
  );
  const clearCosmicDistanceObjectBinding = useTheoryBadgeGraphPanelStore(
    (state) => state.clearCosmicDistanceObjectBinding,
  );
  const setSelectedSolarGroupId = useTheoryBadgeGraphPanelStore((state) => state.setSelectedSolarSpectrumGroupId);
  const setSelectedSolarObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.setSelectedSolarSpectrumObjectBindingId,
  );
  const clearSolarSpectrumObjectBinding = useTheoryBadgeGraphPanelStore(
    (state) => state.clearSolarSpectrumObjectBinding,
  );
  const setSelectedCasimirGroupId = useTheoryBadgeGraphPanelStore((state) => state.setSelectedCasimirCavityGroupId);
  const setSelectedCasimirObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.setSelectedCasimirCavityObjectBindingId,
  );
  const clearCasimirCavityObjectBinding = useTheoryBadgeGraphPanelStore(
    (state) => state.clearCasimirCavityObjectBinding,
  );
  const setSelectedWarpGroupId = useTheoryBadgeGraphPanelStore((state) => state.setSelectedWarpGrNhm2GroupId);
  const setSelectedWarpObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.setSelectedWarpGrNhm2ObjectBindingId,
  );
  const clearWarpGrNhm2ObjectBinding = useTheoryBadgeGraphPanelStore(
    (state) => state.clearWarpGrNhm2ObjectBinding,
  );
  const setSelectedQeiGroupId = useTheoryBadgeGraphPanelStore((state) => state.setSelectedQeiStressEnergyGroupId);
  const setSelectedQeiObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.setSelectedQeiStressEnergyObjectBindingId,
  );
  const clearQeiStressEnergyObjectBinding = useTheoryBadgeGraphPanelStore(
    (state) => state.clearQeiStressEnergyObjectBinding,
  );
  const setSelectedTokamakGroupId = useTheoryBadgeGraphPanelStore((state) => state.setSelectedTokamakPlasmaGroupId);
  const setSelectedTokamakObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.setSelectedTokamakPlasmaObjectBindingId,
  );
  const clearTokamakPlasmaObjectBinding = useTheoryBadgeGraphPanelStore(
    (state) => state.clearTokamakPlasmaObjectBinding,
  );
  const setSelectedGalacticGroupId = useTheoryBadgeGraphPanelStore(
    (state) => state.setSelectedGalacticDynamicsGroupId,
  );
  const setSelectedGalacticObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.setSelectedGalacticDynamicsObjectBindingId,
  );
  const clearGalacticDynamicsObjectBinding = useTheoryBadgeGraphPanelStore(
    (state) => state.clearGalacticDynamicsObjectBinding,
  );
  const setSelectedCurvatureGroupId = useTheoryBadgeGraphPanelStore(
    (state) => state.setSelectedCurvatureCollapseGroupId,
  );
  const setSelectedCurvatureObjectBindingId = useTheoryBadgeGraphPanelStore(
    (state) => state.setSelectedCurvatureCollapseObjectBindingId,
  );
  const clearCurvatureCollapseObjectBinding = useTheoryBadgeGraphPanelStore(
    (state) => state.clearCurvatureCollapseObjectBinding,
  );
  const mapOverlay = useTheoryMapOverlayStore();
  const setLocatorOverlay = useTheoryMapOverlayStore((state) => state.setLocatorOverlay);
  const restoreLiveAnswerContextOverlay = useTheoryMapOverlayStore((state) => state.restoreLiveAnswerContextOverlay);
  const setSelectionOverlay = useTheoryMapOverlayStore((state) => state.setSelectionOverlay);
  const theoryProbabilityTerrain = useMemo(
    () =>
      mapOverlay.source === "discussion_reflection"
        ? placementCertaintyFromReflection(mapOverlay.reflectionOverlay)
        : undefined,
    [mapOverlay.reflectionOverlay, mapOverlay.source],
  );
  const playbackStore = useTheoryBadgePlaybackStore();
  const calculatorLatex = useScientificCalculatorStore((state) => state.currentLatex);
  const calculatorArtifact = useScientificCalculatorStore((state) => state.lastArtifactV1);

  const { data: graph, isLoading, error } = useQuery<TheoryBadgeGraphV1>({
    queryKey: ["/api/helix/theory/graph"],
  });

  const subjects = useMemo(
    () => uniqueSorted((graph?.badges ?? []).flatMap((badge: TheoryBadgeV1) => badge.subjects)),
    [graph?.badges],
  );
  const levels = useMemo(
    () => uniqueSorted((graph?.badges ?? []).map((badge: TheoryBadgeV1) => badge.level)),
    [graph?.badges],
  );
  const statuses = useMemo(
    () => uniqueSorted((graph?.badges ?? []).map((badge: TheoryBadgeV1) => badge.status)),
    [graph?.badges],
  );

  const filteredBadges = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (graph?.badges ?? []).filter((badge: TheoryBadgeV1) => {
      const haystack = [
        badge.id,
        badge.title,
        badge.plainMeaning,
        badge.whyItMatters,
        ...badge.subjects,
        ...badge.tags,
        ...badge.hintKeys.symbols,
      ]
        .join(" ")
        .toLowerCase();
      return (
        (needle.length === 0 || haystack.includes(needle)) &&
        (subject === "all" || badge.subjects.includes(subject)) &&
        (level === "all" || badge.level === level) &&
        (status === "all" || badge.status === status)
      );
    });
  }, [graph?.badges, level, query, status, subject]);

  const groupedBadges = useMemo(() => {
    return LEVEL_ORDER.map((levelName: TheoryBadgeLevel) => ({
      level: levelName,
      badges: filteredBadges.filter((badge: TheoryBadgeV1) => badge.level === levelName),
    })).filter((group: { level: TheoryBadgeLevel; badges: TheoryBadgeV1[] }) => group.badges.length > 0);
  }, [filteredBadges]);

  useEffect(() => {
    if (!graph) return;
    if (filteredBadges.length === 0) {
      setSelectedBadgeId(null);
      return;
    }
    if (selectedId && !filteredBadges.some((badge: TheoryBadgeV1) => badge.id === selectedId)) {
      setSelectedBadgeId(null);
    }
  }, [filteredBadges, graph, selectedId, setSelectedBadgeId]);

  useEffect(() => {
    if (!graph) return;
    const expression = calculatorArtifact?.request.inputLatex || calculatorLatex;
    if (!expression.trim()) return;
    const locator = buildTheoryBadgeLocatorArtifact({
      graph,
      input: {
        expression,
        query: expression,
        source: "scientific_calculator",
        limit: 8,
      },
    });
    if (locator.matches.length > 0) setLocatorOverlay(locator);
  }, [calculatorArtifact, calculatorLatex, graph, setLocatorOverlay]);

  useEffect(() => {
    if (!graph || activeLensId !== "stellar_evolution" || !selectedEvolutionStageId) return;
    const stage = STARSIM_STELLAR_EVOLUTION_STAGES.find((candidate) => candidate.id === selectedEvolutionStageId);
    if (!stage) return;
    if (
      selectedObjectBindingId &&
      !stage.objectBindings.some((binding) => binding.id === selectedObjectBindingId)
    ) {
      clearStarSimObjectBinding();
    }
    const stageBadgeIds = stage.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(stageBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: stageBadgeIds,
      highlightedBadgeIds: stageBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: stage.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: Stage 1 reduced-order prior only.`,
      ),
    });
  }, [
    clearStarSimObjectBinding,
    activeLensId,
    graph,
    selectedEvolutionStageId,
    selectedObjectBindingId,
    setSelectionOverlay,
  ]);

  useEffect(() => {
    if (!graph || activeLensId !== "cosmic_distance_ladder" || !selectedCosmicRungId) return;
    const rung = COSMIC_DISTANCE_LADDER_RUNGS.find((candidate) => candidate.id === selectedCosmicRungId);
    if (!rung) return;
    if (
      selectedCosmicObjectBindingId &&
      !rung.objectBindings.some((binding) => binding.id === selectedCosmicObjectBindingId)
    ) {
      clearCosmicDistanceObjectBinding();
    }
    const rungBadgeIds = rung.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(rungBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: rungBadgeIds,
      highlightedBadgeIds: rungBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: rung.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: distance-ladder estimate is calibration/model dependent.`,
      ),
    });
  }, [
    clearCosmicDistanceObjectBinding,
    activeLensId,
    graph,
    selectedCosmicObjectBindingId,
    selectedCosmicRungId,
    setSelectionOverlay,
  ]);

  useEffect(() => {
    if (!graph || activeLensId !== "solar_surface_spectrum" || !selectedSolarGroupId) return;
    const group = SOLAR_SPECTRUM_OBSERVATION_GROUPS.find((candidate) => candidate.id === selectedSolarGroupId);
    if (!group) return;
    if (
      selectedSolarObjectBindingId &&
      !group.objectBindings.some((binding) => binding.id === selectedSolarObjectBindingId)
    ) {
      clearSolarSpectrumObjectBinding();
    }
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: solar observation proxy; calibration required.`,
      ),
    });
  }, [
    clearSolarSpectrumObjectBinding,
    activeLensId,
    graph,
    selectedSolarGroupId,
    selectedSolarObjectBindingId,
    setSelectionOverlay,
  ]);

  useEffect(() => {
    if (!graph || activeLensId !== "casimir_cavity_modes" || !selectedCasimirGroupId) return;
    const group = CASIMIR_CAVITY_GROUPS.find((candidate) => candidate.id === selectedCasimirGroupId);
    if (!group) return;
    if (
      selectedCasimirObjectBindingId &&
      !group.objectBindings.some((binding) => binding.id === selectedCasimirObjectBindingId)
    ) {
      clearCasimirCavityObjectBinding();
    }
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: Casimir source-context row; diagnostic only.`,
      ),
    });
  }, [
    clearCasimirCavityObjectBinding,
    activeLensId,
    graph,
    selectedCasimirGroupId,
    selectedCasimirObjectBindingId,
    setSelectionOverlay,
  ]);

  useEffect(() => {
    if (!graph || activeLensId !== "warp_gr_nhm2" || !selectedWarpGroupId) return;
    const group = WARP_GR_NHM2_GROUPS.find((candidate) => candidate.id === selectedWarpGroupId);
    if (!group) return;
    if (
      selectedWarpObjectBindingId &&
      !group.objectBindings.some((binding) => binding.id === selectedWarpObjectBindingId)
    ) {
      clearWarpGrNhm2ObjectBinding();
    }
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: NHM2 diagnostic-only boundary.`,
      ),
    });
  }, [
    clearWarpGrNhm2ObjectBinding,
    activeLensId,
    graph,
    selectedWarpGroupId,
    selectedWarpObjectBindingId,
    setSelectionOverlay,
  ]);

  useEffect(() => {
    if (!graph || activeLensId !== "qei_stress_energy" || !selectedQeiGroupId) return;
    const group = QEI_STRESS_ENERGY_GROUPS.find((candidate) => candidate.id === selectedQeiGroupId);
    if (!group) return;
    if (
      selectedQeiObjectBindingId &&
      !group.objectBindings.some((binding) => binding.id === selectedQeiObjectBindingId)
    ) {
      clearQeiStressEnergyObjectBinding();
    }
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: QEI/stress diagnostic-only boundary.`,
      ),
    });
  }, [
    clearQeiStressEnergyObjectBinding,
    activeLensId,
    graph,
    selectedQeiGroupId,
    selectedQeiObjectBindingId,
    setSelectionOverlay,
  ]);

  useEffect(() => {
    if (!graph || activeLensId !== "tokamak_plasma" || !selectedTokamakGroupId) return;
    const group = TOKAMAK_PLASMA_GROUPS.find((candidate) => candidate.id === selectedTokamakGroupId);
    if (!group) return;
    if (
      selectedTokamakObjectBindingId &&
      !group.objectBindings.some((binding) => binding.id === selectedTokamakObjectBindingId)
    ) {
      clearTokamakPlasmaObjectBinding();
    }
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: Tokamak diagnostic/proxy boundary.`,
      ),
    });
  }, [
    clearTokamakPlasmaObjectBinding,
    activeLensId,
    graph,
    selectedTokamakGroupId,
    selectedTokamakObjectBindingId,
    setSelectionOverlay,
  ]);

  useEffect(() => {
    if (!graph || activeLensId !== "galactic_dynamics" || !selectedGalacticGroupId) return;
    const group = GALACTIC_DYNAMICS_GROUPS.find((candidate) => candidate.id === selectedGalacticGroupId);
    if (!group) return;
    if (
      selectedGalacticObjectBindingId &&
      !group.objectBindings.some((binding) => binding.id === selectedGalacticObjectBindingId)
    ) {
      clearGalacticDynamicsObjectBinding();
    }
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: Galactic null-model/diagnostic boundary.`,
      ),
    });
  }, [
    clearGalacticDynamicsObjectBinding,
    activeLensId,
    graph,
    selectedGalacticGroupId,
    selectedGalacticObjectBindingId,
    setSelectionOverlay,
  ]);

  useEffect(() => {
    if (!graph || activeLensId !== "curvature_collapse" || !selectedCurvatureGroupId) return;
    const group = CURVATURE_COLLAPSE_GROUPS.find((candidate) => candidate.id === selectedCurvatureGroupId);
    if (!group) return;
    if (
      selectedCurvatureObjectBindingId &&
      !group.objectBindings.some((binding) => binding.id === selectedCurvatureObjectBindingId)
    ) {
      clearCurvatureCollapseObjectBinding();
    }
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: Curvature/collapse benchmark boundary.`,
      ),
    });
  }, [
    clearCurvatureCollapseObjectBinding,
    activeLensId,
    graph,
    selectedCurvatureGroupId,
    selectedCurvatureObjectBindingId,
    setSelectionOverlay,
  ]);

  const selectedBadge = useMemo(
    () => (graph?.badges ?? []).find((badge: TheoryBadgeV1) => badge.id === selectedId) ?? null,
    [graph?.badges, selectedId],
  );

  const multiTrace = useMemo(() => {
    if (!graph || selectedBadgeIds.length < 2) return null;
    return resolveTheoryBadgeConnectionTrace({ graph, badgeIds: selectedBadgeIds });
  }, [graph, selectedBadgeIds]);

  const atlasLens = useMemo(() => {
    if (!graph || !activeLensId) return null;
    return resolvePhysicsAtlasLens({
      graph,
      atlas: buildHelixPhysicsAtlasV1({ graph }),
      blockId: activeLensId,
    });
  }, [activeLensId, graph]);

  const activeAtlasBlock = useMemo(() => {
    if (!graph || !activeLensId) return null;
    return buildHelixPhysicsAtlasV1({ graph }).blocks.find((block) => block.id === activeLensId) ?? null;
  }, [activeLensId, graph]);

  const rememberedAtlasLensId = useMemo<TheoryAtlasLensId | null>(() => {
    if (activeLensId) return activeLensId;
    if (selectedEvolutionStageId || selectedObjectBindingId) return "stellar_evolution";
    if (selectedCosmicRungId || selectedCosmicObjectBindingId) return "cosmic_distance_ladder";
    if (selectedSolarGroupId || selectedSolarObjectBindingId) return "solar_surface_spectrum";
    if (selectedCasimirGroupId || selectedCasimirObjectBindingId) return "casimir_cavity_modes";
    if (selectedWarpGroupId || selectedWarpObjectBindingId) return "warp_gr_nhm2";
    if (selectedQeiGroupId || selectedQeiObjectBindingId) return "qei_stress_energy";
    if (selectedTokamakGroupId || selectedTokamakObjectBindingId) return "tokamak_plasma";
    if (selectedGalacticGroupId || selectedGalacticObjectBindingId) return "galactic_dynamics";
    if (selectedCurvatureGroupId || selectedCurvatureObjectBindingId) return "curvature_collapse";
    return null;
  }, [
    activeLensId,
    selectedCasimirGroupId,
    selectedCasimirObjectBindingId,
    selectedCosmicObjectBindingId,
    selectedCosmicRungId,
    selectedCurvatureGroupId,
    selectedCurvatureObjectBindingId,
    selectedEvolutionStageId,
    selectedGalacticGroupId,
    selectedGalacticObjectBindingId,
    selectedObjectBindingId,
    selectedQeiGroupId,
    selectedQeiObjectBindingId,
    selectedSolarGroupId,
    selectedSolarObjectBindingId,
    selectedTokamakGroupId,
    selectedTokamakObjectBindingId,
    selectedWarpGroupId,
    selectedWarpObjectBindingId,
  ]);

  const dynamicTranslationTexts = useMemo(() => {
    const texts: string[] = [];
    for (const badge of graph?.badges ?? []) {
      pushDynamicText(texts, badge.title);
    }
    for (const badge of filteredBadges.slice(0, 80)) {
      pushDynamicText(texts, badge.plainMeaning);
    }
    if (selectedBadge) {
      pushDynamicText(texts, selectedBadge.title);
      pushDynamicText(texts, selectedBadge.plainMeaning);
      pushDynamicText(texts, selectedBadge.whyItMatters);
      for (const assumption of selectedBadge.assumptions) pushDynamicText(texts, assumption);
      for (const source of selectedBadge.sourceRefs) pushDynamicText(texts, source.note);
      for (const edge of graph?.edges ?? []) {
        if (edge.from === selectedBadge.id || edge.to === selectedBadge.id) pushDynamicText(texts, edge.label);
      }
    }
    for (const badgeId of selectedBadgeIds) {
      const badge = graph?.badges.find((item: TheoryBadgeV1) => item.id === badgeId);
      if (!badge) continue;
      pushDynamicText(texts, badge.title);
      pushDynamicText(texts, badge.plainMeaning);
    }
    const atlas = graph ? buildHelixPhysicsAtlasV1({ graph }) : null;
    for (const block of atlas?.blocks ?? []) {
      pushDynamicText(texts, block.title);
      pushDynamicText(texts, block.description);
      for (const note of block.claimBoundaryNotes) pushDynamicText(texts, note);
      for (const action of block.runtimeActions) {
        pushDynamicText(texts, action.label);
        pushDynamicText(texts, action.note);
      }
    }
    for (const note of atlasLens?.claimBoundaryNotes ?? []) pushDynamicText(texts, note);
    collectAtlasPresetTexts(texts, STARSIM_STELLAR_EVOLUTION_STAGES);
    collectAtlasPresetTexts(texts, COSMIC_DISTANCE_LADDER_RUNGS);
    collectAtlasPresetTexts(texts, SOLAR_SPECTRUM_OBSERVATION_GROUPS);
    collectAtlasPresetTexts(texts, CASIMIR_CAVITY_GROUPS);
    collectAtlasPresetTexts(texts, WARP_GR_NHM2_GROUPS);
    collectAtlasPresetTexts(texts, QEI_STRESS_ENERGY_GROUPS);
    collectAtlasPresetTexts(texts, TOKAMAK_PLASMA_GROUPS);
    collectAtlasPresetTexts(texts, GALACTIC_DYNAMICS_GROUPS);
    collectAtlasPresetTexts(texts, CURVATURE_COLLAPSE_GROUPS);
    THEORY_GRAPH_DYNAMIC_UI_TEXTS.forEach((text) => pushDynamicText(texts, text));
    return texts;
  }, [atlasLens?.claimBoundaryNotes, filteredBadges, graph, selectedBadge, selectedBadgeIds]);

  const { translate: translateDynamicText } = useDynamicTextTranslations({
    locale: interfaceLanguage.bcp47,
    docPath: "workstation/theory-badge-graph",
    title: "Theory Badge Graph",
    texts: dynamicTranslationTexts,
    enabled: interfaceLanguage.code !== "en",
  });
  const translateTheoryGraphText = useMemo(() => {
    return (text: string) => {
      const catalogId = THEORY_GRAPH_STATIC_UI_TEXT_IDS[text];
      if (!catalogId) return translateDynamicText(text);
      const catalogText = t(catalogId);
      if (interfaceLanguage.code !== "en" && catalogText === text) return translateDynamicText(text);
      return catalogText;
    };
  }, [interfaceLanguage.code, t, translateDynamicText]);

  const manualSelectionActive = selectedBadgeIds.length > 0 || Boolean(selectedId);
  const highlightedBadgeIds =
    multiTrace?.connectingBadgeIds ??
    (!manualSelectionActive
      ? (mapOverlay.highlightedBadgeIds.length > 0 ? mapOverlay.highlightedBadgeIds : atlasLens?.highlightedBadgeIds ?? [])
      : []);
  const highlightedEdgeIds = useMemo(() => {
    if (!graph) return [];
    if (multiTrace) return multiTrace.connectingEdgeIds;
    return [];
  }, [graph, multiTrace]);
  const combinationReaderPayload = useMemo(() => {
    if (!graph) return null;
    return buildTheoryBadgeCombinationReaderPayloadForSelection({
      graph,
      selectedBadgeIds,
    });
  }, [graph, selectedBadgeIds]);
  const connectableBadgeIds = combinationReaderPayload?.availableNextBadges.map((badge) => badge.id) ?? [];

  const routeEligibility = useMemo(() => {
    if (!graph) return null;
    const startBadgeIds =
      selectedBadgeIds.length > 0
        ? selectedBadgeIds
        : selectedId
          ? [selectedId]
          : atlasLens?.centerBadgeIds.length
            ? atlasLens.centerBadgeIds
            : highlightedBadgeIds.slice(0, 12);
    if (startBadgeIds.length === 0) return null;
    return resolveTheoryRouteEligibility({
      graph,
      startBadgeIds,
      allowedClaimLevel: "CL3",
      allowProxyEdges: true,
      requireEvidence: false,
    });
  }, [atlasLens?.centerBadgeIds, graph, highlightedBadgeIds, selectedBadgeIds, selectedId]);

  const routeBadgeLabels = useMemo(
    () => routeBadgeLabelsForMode(routeEligibility, "execution"),
    [routeEligibility],
  );

  const activePlayback =
    playbackStore.activeTargetBadgeId === selectedBadge?.id || playbackStore.activeTargetBadgeId
      ? playbackStore.activeRun
      : null;
  const playbackBadgeIds = Array.from(
    new Set([
      ...(activePlayback?.steps.map((step: TheoryBadgePlaybackStepV1) => step.badgeId) ?? []),
      ...(activeTheoryRun?.rows.map((row) => row.badgeId) ?? []),
    ]),
  );
  const solvedBadgeIds = Array.from(
    new Set([
      ...(activePlayback?.steps
        .filter((step: TheoryBadgePlaybackStepV1) => step.status === "solved")
        .map((step: TheoryBadgePlaybackStepV1) => step.badgeId) ?? []),
      ...(activeTheoryRun?.rows
        .filter((row) => row.status === "computed" || row.status === "solved")
        .map((row) => row.badgeId) ?? []),
    ]),
  );
  const failedBadgeIds = Array.from(
    new Set([
      ...(activePlayback?.steps
        .filter((step: TheoryBadgePlaybackStepV1) => step.status === "failed")
        .map((step: TheoryBadgePlaybackStepV1) => step.badgeId) ?? []),
      ...(activeTheoryRun?.rows
        .filter((row) => row.status === "blocked" || row.status === "failed")
        .map((row) => row.badgeId) ?? []),
    ]),
  );

  const shouldAcceptArtifactRun = (expected?: ArtifactRunExpectation): boolean => {
    if (!expected) return true;
    const state = useTheoryBadgeGraphPanelStore.getState();
    if (expected.selectedBadgeId && state.selectedBadgeId !== expected.selectedBadgeId) return false;
    if (expected.activeAtlasLensId && state.activeAtlasLensId !== expected.activeAtlasLensId) return false;
    if (expected.selectedCasimirGroupId && state.selectedCasimirCavityGroupId !== expected.selectedCasimirGroupId) {
      return false;
    }
    if (expected.selectedWarpGroupId && state.selectedWarpGrNhm2GroupId !== expected.selectedWarpGroupId) return false;
    if (expected.selectedQeiGroupId && state.selectedQeiStressEnergyGroupId !== expected.selectedQeiGroupId) return false;
    return true;
  };

  const selectEvidenceRunRow = (run: TheoryCompoundRunV1, preferredBadgeId?: string) => {
    const runStore = useTheoryCompoundRunStore.getState();
    const preferredRow = preferredBadgeId
      ? run.rows.find(
          (row) =>
            row.badgeId === preferredBadgeId &&
            (row.runtimeReceiptV1 || row.runtimeMathTraceV1 || row.kind === "gate" || row.kind === "evidence"),
        )
      : null;
    const row =
      preferredRow ??
      run.rows.find((candidate) => candidate.runtimeReceiptV1) ??
      run.rows.find((candidate) => candidate.runtimeMathTraceV1) ??
      run.rows.find((candidate) => candidate.kind === "gate" || candidate.kind === "evidence") ??
      run.rows[0];
    if (row) runStore.selectTheoryRunRow(row.id);
  };

  const preferredEvidenceBadgeId = (badgeIds: string[]): string | undefined =>
    [
      "nhm2.tensor.same_chart_full_tensor",
      "nhm2.closure.wall_t00_source_residual",
      "nhm2.energy_condition.observer_robust_gate",
      "nhm2.qei.worldline_dossier",
      "casimir.material.lifshitz_receipt",
      "casimir.geometry.beyond_pfa_validity",
      "nhm2.natario.invariant_audit",
      "physics.gr.einstein_field_equation",
    ].find((badgeId) => badgeIds.includes(badgeId)) ?? badgeIds[0];

  const loadArtifactBackedTheoryRun = async ({
    badgeIds,
    mode = "dependency_path",
    expected,
    preferredBadgeId,
  }: {
    badgeIds: string[];
    mode?: TheoryCompoundRunMode;
    expected?: ArtifactRunExpectation;
    preferredBadgeId?: string;
  }) => {
    if (badgeIds.length === 0) return;
    try {
      const response = await fetch("/api/helix/theory/compound-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          badgeIds,
          mode,
          source: "theory_badge_graph",
          includeScalar: true,
          includeRuntime: true,
          includeEvidence: true,
          includeBoundaries: true,
          runQuick: false,
        }),
      });
      if (!response.ok) return;
      const payload = await response.json() as { artifact_v1?: unknown };
      const artifact = payload.artifact_v1;
      if (!isTheoryCompoundRunV1(artifact)) return;
      if (!shouldAcceptArtifactRun(expected)) return;
      const runStore = useTheoryCompoundRunStore.getState();
      runStore.loadTheoryRun(artifact);
      selectEvidenceRunRow(artifact, preferredBadgeId ?? preferredEvidenceBadgeId(badgeIds));
    } catch {
      // Static/reference run remains loaded when server-side artifact enrichment is unavailable.
    }
  };

  const loadTheoryRunEvidence = ({
    badgeIds,
    mode = "dependency_path",
    expected,
    preferredBadgeId,
    openWorkbench = false,
  }: {
    badgeIds: string[];
    mode?: TheoryCompoundRunMode;
    expected?: ArtifactRunExpectation;
    preferredBadgeId?: string;
    openWorkbench?: boolean;
  }) => {
    if (!graph || badgeIds.length === 0) return;
    const run = buildTheoryCompoundRun({
      graph,
      badgeIds,
      mode,
      source: "theory_badge_graph",
      includeScalar: true,
      includeRuntime: true,
      includeEvidence: true,
      includeBoundaries: true,
    });
    useTheoryCompoundRunStore.getState().loadTheoryRun(run);
    selectEvidenceRunRow(run, preferredBadgeId ?? preferredEvidenceBadgeId(badgeIds));
    void loadArtifactBackedTheoryRun({
      badgeIds,
      mode,
      expected,
      preferredBadgeId: preferredBadgeId ?? preferredEvidenceBadgeId(badgeIds),
    });
    if (openWorkbench) useWorkstationLayoutStore.getState().openPanelInActiveGroup("scientific-calculator");
  };

  const selectBadge = (badgeId: string) => {
    const badge = graph?.badges.find((candidate: TheoryBadgeV1) => candidate.id === badgeId) ?? null;
    setSelectedBadgeId(badgeId);
    setSelectedBadgeIds(selectedBadgeIds.includes(badgeId) ? selectedBadgeIds : [...selectedBadgeIds, badgeId]);
    setSelectedEvolutionStageId(null);
    setSelectedCosmicRungId(null);
    setSelectedSolarGroupId(null);
    setSelectedCasimirGroupId(null);
    setSelectedWarpGroupId(null);
    setSelectedQeiGroupId(null);
    setSelectedTokamakGroupId(null);
    setSelectedGalacticGroupId(null);
    setSelectedCurvatureGroupId(null);
    clearStarSimObjectBinding();
    clearCosmicDistanceObjectBinding();
    clearSolarSpectrumObjectBinding();
    clearCasimirCavityObjectBinding();
    clearWarpGrNhm2ObjectBinding();
    clearQeiStressEnergyObjectBinding();
    clearTokamakPlasmaObjectBinding();
    clearGalacticDynamicsObjectBinding();
    clearCurvatureCollapseObjectBinding();
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
    const shouldLoadRuntimeRun = graph && badge && badge.calculatorPayloads.length === 0 && hasRuntimeReferenceEquation(badge);
    if (shouldLoadRuntimeRun) {
      loadTheoryRunEvidence({
        badgeIds: [badge.id],
        mode: "dependency_path",
        expected: { selectedBadgeId: badge.id },
        preferredBadgeId: badge.id,
      });
    } else {
      useTheoryCompoundRunStore.getState().clearTheoryRun();
    }
  };

  const loadCalculatorPayload = (badgeId: string, payloadId: string) => {
    const badge = graph?.badges.find((candidate: TheoryBadgeV1) => candidate.id === badgeId);
    const payload = badge?.calculatorPayloads.find(
      (candidate: TheoryBadgeCalculatorPayloadV1) => candidate.id === payloadId,
    );
    if (!badge || !payload) return;
    if (graph) {
      const loadout = buildTheoryCalculatorLoadout({
        graph,
        badgeIds: [badge.id],
        mode: "selected_badges",
        source: "achievement_map",
        includeContextItems: false,
        payloadIdsByBadgeId: {
          [badge.id]: [payload.id],
        },
      });
      const scientificState = useScientificCalculatorStore.getState();
      scientificState.setTheoryLoadout(loadout);
      scientificState.loadTheoryLoadoutItem(1);
    }
    dispatchScientificCalculatorMathPicked({
      latex: payload.displayLatex || payload.expression,
      sourcePath: `theory://${graph?.graphId ?? "nhm2-theory-badge-graph"}/${badge.id}/${payload.id}`,
      anchor: payload.id,
    });
  };

  const selectEvolutionStage = (stage: StarSimStellarEvolutionStage) => {
    if (!graph) return;
    setActiveAtlasLensId("stellar_evolution");
    setSelectedEvolutionStageId(stage.id);
    setSelectedCosmicRungId(null);
    setSelectedSolarGroupId(null);
    setSelectedCasimirGroupId(null);
    setSelectedWarpGroupId(null);
    setSelectedQeiGroupId(null);
    setSelectedTokamakGroupId(null);
    setSelectedGalacticGroupId(null);
    setSelectedCurvatureGroupId(null);
    setSelectedObjectBindingId(null);
    clearCosmicDistanceObjectBinding();
    clearSolarSpectrumObjectBinding();
    clearCasimirCavityObjectBinding();
    clearWarpGrNhm2ObjectBinding();
    clearQeiStressEnergyObjectBinding();
    clearTokamakPlasmaObjectBinding();
    clearGalacticDynamicsObjectBinding();
    clearCurvatureCollapseObjectBinding();
    setSelectedBadgeId(null);
    setSelectedBadgeIds([]);
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
    const stageBadgeIds = stage.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(stageBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: stageBadgeIds,
      highlightedBadgeIds: stageBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: stage.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: Stage 1 reduced-order prior only.`,
      ),
    });
  };

  const selectStarSimObjectBinding = (stage: StarSimStellarEvolutionStage, bindingId: string) => {
    if (!graph) return;
    const binding = stage.objectBindings.find((candidate) => candidate.id === bindingId);
    if (!binding) return;
    selectEvolutionStage(stage);
    setSelectedObjectBindingId(binding.id);
    setSelectedCosmicRungId(null);
    setSelectedSolarGroupId(null);
    setSelectedCasimirGroupId(null);
    setSelectedWarpGroupId(null);
    setSelectedQeiGroupId(null);
    setSelectedTokamakGroupId(null);
    setSelectedGalacticGroupId(null);
    setSelectedCurvatureGroupId(null);
    clearCosmicDistanceObjectBinding();
    clearSolarSpectrumObjectBinding();
    clearCasimirCavityObjectBinding();
    clearWarpGrNhm2ObjectBinding();
    clearQeiStressEnergyObjectBinding();
    clearTokamakPlasmaObjectBinding();
    clearGalacticDynamicsObjectBinding();
    clearCurvatureCollapseObjectBinding();
    const payloadIdsByBadgeId = stage.calculatorPayloadRefs.reduce<Record<string, string[]>>((acc, ref) => {
      acc[ref.badgeId] = [...(acc[ref.badgeId] ?? []), ref.payloadId];
      return acc;
    }, {});
    const objectContext = buildStarSimObjectBindings({
      ...binding.input,
      source: "manual",
    });
    const restorationBadgeIds = stage.theoryBadgeIds.filter((badgeId) => badgeId.startsWith("starsim.restoration."));
    const targetBadgeIds = stage.theoryBadgeIds.includes("starsim.runtime.evaluate_fusion_microphysics")
      ? ["starsim.runtime.evaluate_fusion_microphysics", ...restorationBadgeIds]
      : stage.theoryBadgeIds;
    const loadout = buildTheoryCalculatorLoadout({
      graph,
      badgeIds: targetBadgeIds,
      mode: stage.theoryBadgeIds.includes("starsim.runtime.evaluate_fusion_microphysics")
        ? "dependency_path"
        : "selected_badges",
      source: "achievement_map",
      objectContext,
      includeContextItems: true,
      payloadIdsByBadgeId,
    });
    const scientificState = useScientificCalculatorStore.getState();
    scientificState.setTheoryLoadout(loadout);
    const firstObjectScalar =
      loadout.items.find(
        (item) =>
          item.kind === "calculator_payload" &&
          item.badgeId === "starsim.observable.surface_temperature_proxy",
      ) ??
      loadout.items.find(
        (item) => item.kind === "calculator_payload" && item.badgeId.startsWith("starsim."),
      ) ??
      loadout.items.find((item) => item.kind === "calculator_payload");
    if (firstObjectScalar) scientificState.loadTheoryLoadoutItem(firstObjectScalar.index);
  };

  const clearStarSimBindingSelection = () => {
    clearStarSimObjectBinding();
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
  };

  const selectCosmicDistanceRung = (rung: CosmicDistanceLadderRung) => {
    if (!graph) return;
    setActiveAtlasLensId("cosmic_distance_ladder");
    setSelectedCosmicRungId(rung.id);
    setSelectedCosmicObjectBindingId(null);
    setSelectedEvolutionStageId(null);
    setSelectedSolarGroupId(null);
    setSelectedCasimirGroupId(null);
    setSelectedWarpGroupId(null);
    setSelectedQeiGroupId(null);
    setSelectedTokamakGroupId(null);
    setSelectedGalacticGroupId(null);
    setSelectedCurvatureGroupId(null);
    clearStarSimObjectBinding();
    clearSolarSpectrumObjectBinding();
    clearCasimirCavityObjectBinding();
    clearWarpGrNhm2ObjectBinding();
    clearQeiStressEnergyObjectBinding();
    clearTokamakPlasmaObjectBinding();
    clearGalacticDynamicsObjectBinding();
    clearCurvatureCollapseObjectBinding();
    setSelectedBadgeId(null);
    setSelectedBadgeIds([]);
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
    const rungBadgeIds = rung.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(rungBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: rungBadgeIds,
      highlightedBadgeIds: rungBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: rung.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: distance-ladder estimate is calibration/model dependent.`,
      ),
    });
  };

  const selectCosmicObjectBinding = (rung: CosmicDistanceLadderRung, bindingId: string) => {
    if (!graph) return;
    const binding = rung.objectBindings.find((candidate) => candidate.id === bindingId);
    if (!binding) return;
    selectCosmicDistanceRung(rung);
    setSelectedCosmicObjectBindingId(binding.id);
    const payloadIdsByBadgeId = rung.calculatorPayloadRefs.reduce<Record<string, string[]>>((acc, ref) => {
      acc[ref.badgeId] = [...(acc[ref.badgeId] ?? []), ref.payloadId];
      return acc;
    }, {});
    const objectContext = buildCosmicDistanceObjectBindings({
      ...binding.input,
      source: "manual",
    });
    const loadout = buildTheoryCalculatorLoadout({
      graph,
      badgeIds: rung.theoryBadgeIds,
      mode: "selected_badges",
      source: "achievement_map",
      objectContext,
      includeContextItems: true,
      payloadIdsByBadgeId,
    });
    const scientificState = useScientificCalculatorStore.getState();
    scientificState.setTheoryLoadout(loadout);
    const firstCosmicScalar =
      loadout.items.find((item) => item.kind === "calculator_payload" && item.badgeId.startsWith("cosmic.")) ??
      loadout.items.find((item) => item.kind === "calculator_payload");
    if (firstCosmicScalar) scientificState.loadTheoryLoadoutItem(firstCosmicScalar.index);
  };

  const clearCosmicBindingSelection = () => {
    clearCosmicDistanceObjectBinding();
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
  };

  const selectSolarSpectrumGroup = (group: SolarSpectrumObservationGroup) => {
    if (!graph) return;
    setActiveAtlasLensId("solar_surface_spectrum");
    setSelectedSolarGroupId(group.id);
    setSelectedSolarObjectBindingId(null);
    setSelectedEvolutionStageId(null);
    setSelectedCosmicRungId(null);
    setSelectedCasimirGroupId(null);
    setSelectedWarpGroupId(null);
    setSelectedQeiGroupId(null);
    setSelectedTokamakGroupId(null);
    setSelectedGalacticGroupId(null);
    setSelectedCurvatureGroupId(null);
    clearStarSimObjectBinding();
    clearCosmicDistanceObjectBinding();
    clearCasimirCavityObjectBinding();
    clearWarpGrNhm2ObjectBinding();
    clearQeiStressEnergyObjectBinding();
    clearTokamakPlasmaObjectBinding();
    clearGalacticDynamicsObjectBinding();
    clearCurvatureCollapseObjectBinding();
    setSelectedBadgeId(null);
    setSelectedBadgeIds([]);
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: solar observation proxy; calibration required.`,
      ),
    });
  };

  const selectSolarObjectBinding = (group: SolarSpectrumObservationGroup, bindingId: string) => {
    if (!graph) return;
    const binding = group.objectBindings.find((candidate) => candidate.id === bindingId);
    if (!binding) return;
    selectSolarSpectrumGroup(group);
    setSelectedSolarObjectBindingId(binding.id);
    const payloadIdsByBadgeId = group.calculatorPayloadRefs.reduce<Record<string, string[]>>((acc, ref) => {
      acc[ref.badgeId] = [...(acc[ref.badgeId] ?? []), ref.payloadId];
      return acc;
    }, {});
    const objectContext = buildSolarSpectrumObservationBindings({
      ...binding.input,
      source: "manual",
    });
    const loadout = buildTheoryCalculatorLoadout({
      graph,
      badgeIds: group.theoryBadgeIds,
      mode: "selected_badges",
      source: "achievement_map",
      objectContext,
      includeContextItems: true,
      payloadIdsByBadgeId,
    });
    const scientificState = useScientificCalculatorStore.getState();
    scientificState.setTheoryLoadout(loadout);
    const firstSolarScalar =
      loadout.items.find((item) => item.kind === "calculator_payload" && item.badgeId.startsWith("solar.")) ??
      loadout.items.find((item) => item.kind === "calculator_payload");
    if (firstSolarScalar) scientificState.loadTheoryLoadoutItem(firstSolarScalar.index);
  };

  const clearSolarBindingSelection = () => {
    clearSolarSpectrumObjectBinding();
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
  };

  const selectCasimirCavityGroup = (group: CasimirCavityGroup) => {
    if (!graph) return;
    setActiveAtlasLensId("casimir_cavity_modes");
    setSelectedCasimirGroupId(group.id);
    setSelectedCasimirObjectBindingId(null);
    setSelectedEvolutionStageId(null);
    setSelectedCosmicRungId(null);
    setSelectedSolarGroupId(null);
    setSelectedWarpGroupId(null);
    setSelectedQeiGroupId(null);
    setSelectedTokamakGroupId(null);
    setSelectedGalacticGroupId(null);
    setSelectedCurvatureGroupId(null);
    clearStarSimObjectBinding();
    clearCosmicDistanceObjectBinding();
    clearSolarSpectrumObjectBinding();
    clearWarpGrNhm2ObjectBinding();
    clearQeiStressEnergyObjectBinding();
    clearTokamakPlasmaObjectBinding();
    clearGalacticDynamicsObjectBinding();
    clearCurvatureCollapseObjectBinding();
    setSelectedBadgeId(null);
    setSelectedBadgeIds([]);
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: Casimir source-context row; diagnostic only.`,
      ),
    });
    loadTheoryRunEvidence({
      badgeIds: groupBadgeIds,
      mode: "dependency_path",
      expected: {
        activeAtlasLensId: "casimir_cavity_modes",
        selectedCasimirGroupId: group.id,
      },
      preferredBadgeId: preferredEvidenceBadgeId(groupBadgeIds),
    });
  };

  const selectCasimirObjectBinding = (group: CasimirCavityGroup, bindingId: string) => {
    if (!graph) return;
    const binding = group.objectBindings.find((candidate) => candidate.id === bindingId);
    if (!binding) return;
    selectCasimirCavityGroup(group);
    setSelectedCasimirObjectBindingId(binding.id);
    const payloadIdsByBadgeId = group.calculatorPayloadRefs.reduce<Record<string, string[]>>((acc, ref) => {
      acc[ref.badgeId] = [...(acc[ref.badgeId] ?? []), ref.payloadId];
      return acc;
    }, {});
    const objectContext = buildCasimirCavityObjectBindings({
      ...binding.input,
      source: "manual",
    });
    const loadout = buildTheoryCalculatorLoadout({
      graph,
      badgeIds: group.theoryBadgeIds,
      mode: "selected_badges",
      source: "achievement_map",
      objectContext,
      includeContextItems: true,
      payloadIdsByBadgeId,
    });
    const scientificState = useScientificCalculatorStore.getState();
    scientificState.setTheoryLoadout(loadout);
    const firstCasimirScalar =
      loadout.items.find((item) => item.kind === "calculator_payload" && item.badgeId.startsWith("casimir.")) ??
      loadout.items.find((item) => item.kind === "calculator_payload");
    if (firstCasimirScalar) scientificState.loadTheoryLoadoutItem(firstCasimirScalar.index);
  };

  const clearCasimirBindingSelection = () => {
    clearCasimirCavityObjectBinding();
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
  };

  const selectWarpGrNhm2Group = (group: WarpGrNhm2Group) => {
    if (!graph) return;
    setActiveAtlasLensId("warp_gr_nhm2");
    setSelectedWarpGroupId(group.id);
    setSelectedWarpObjectBindingId(null);
    setSelectedEvolutionStageId(null);
    setSelectedCosmicRungId(null);
    setSelectedSolarGroupId(null);
    setSelectedCasimirGroupId(null);
    setSelectedQeiGroupId(null);
    setSelectedTokamakGroupId(null);
    setSelectedGalacticGroupId(null);
    setSelectedCurvatureGroupId(null);
    clearStarSimObjectBinding();
    clearCosmicDistanceObjectBinding();
    clearSolarSpectrumObjectBinding();
    clearCasimirCavityObjectBinding();
    clearQeiStressEnergyObjectBinding();
    clearTokamakPlasmaObjectBinding();
    clearGalacticDynamicsObjectBinding();
    clearCurvatureCollapseObjectBinding();
    setSelectedBadgeId(null);
    setSelectedBadgeIds([]);
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: NHM2 diagnostic-only boundary.`,
      ),
    });
    loadTheoryRunEvidence({
      badgeIds: groupBadgeIds,
      mode: "dependency_path",
      expected: {
        activeAtlasLensId: "warp_gr_nhm2",
        selectedWarpGroupId: group.id,
      },
      preferredBadgeId: preferredEvidenceBadgeId(groupBadgeIds),
    });
  };

  const selectWarpObjectBinding = (group: WarpGrNhm2Group, bindingId: string) => {
    if (!graph) return;
    const binding = group.objectBindings.find((candidate) => candidate.id === bindingId);
    if (!binding) return;
    selectWarpGrNhm2Group(group);
    setSelectedWarpObjectBindingId(binding.id);
    const payloadIdsByBadgeId = group.calculatorPayloadRefs.reduce<Record<string, string[]>>((acc, ref) => {
      acc[ref.badgeId] = [...(acc[ref.badgeId] ?? []), ref.payloadId];
      return acc;
    }, {});
    const objectContext = buildNhm2DiagnosticObjectBindings({
      ...binding.input,
      source: "manual",
    });
    const loadout = buildTheoryCalculatorLoadout({
      graph,
      badgeIds: group.theoryBadgeIds,
      mode: "selected_badges",
      source: "achievement_map",
      objectContext,
      includeContextItems: true,
      payloadIdsByBadgeId,
    });
    const scientificState = useScientificCalculatorStore.getState();
    scientificState.setTheoryLoadout(loadout);
    const firstWarpScalar =
      loadout.items.find((item) => item.kind === "calculator_payload" && item.badgeId.startsWith("nhm2.")) ??
      loadout.items.find((item) => item.kind === "calculator_payload");
    if (firstWarpScalar) scientificState.loadTheoryLoadoutItem(firstWarpScalar.index);
  };

  const clearWarpBindingSelection = () => {
    clearWarpGrNhm2ObjectBinding();
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
  };

  const selectQeiStressEnergyGroup = (group: QeiStressEnergyGroup) => {
    if (!graph) return;
    setActiveAtlasLensId("qei_stress_energy");
    setSelectedQeiGroupId(group.id);
    setSelectedQeiObjectBindingId(null);
    setSelectedEvolutionStageId(null);
    setSelectedCosmicRungId(null);
    setSelectedSolarGroupId(null);
    setSelectedCasimirGroupId(null);
    setSelectedWarpGroupId(null);
    setSelectedTokamakGroupId(null);
    setSelectedGalacticGroupId(null);
    setSelectedCurvatureGroupId(null);
    clearStarSimObjectBinding();
    clearCosmicDistanceObjectBinding();
    clearSolarSpectrumObjectBinding();
    clearCasimirCavityObjectBinding();
    clearWarpGrNhm2ObjectBinding();
    clearTokamakPlasmaObjectBinding();
    clearGalacticDynamicsObjectBinding();
    clearCurvatureCollapseObjectBinding();
    setSelectedBadgeId(null);
    setSelectedBadgeIds([]);
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: QEI/stress diagnostic-only boundary.`,
      ),
    });
    loadTheoryRunEvidence({
      badgeIds: groupBadgeIds,
      mode: "dependency_path",
      expected: {
        activeAtlasLensId: "qei_stress_energy",
        selectedQeiGroupId: group.id,
      },
      preferredBadgeId: preferredEvidenceBadgeId(groupBadgeIds),
    });
  };

  const selectQeiObjectBinding = (group: QeiStressEnergyGroup, bindingId: string) => {
    if (!graph) return;
    const binding = group.objectBindings.find((candidate) => candidate.id === bindingId);
    if (!binding) return;
    selectQeiStressEnergyGroup(group);
    setSelectedQeiObjectBindingId(binding.id);
    const payloadIdsByBadgeId = group.calculatorPayloadRefs.reduce<Record<string, string[]>>((acc, ref) => {
      acc[ref.badgeId] = [...(acc[ref.badgeId] ?? []), ref.payloadId];
      return acc;
    }, {});
    const objectContext = buildNhm2DiagnosticObjectBindings({
      ...binding.input,
      source: "manual",
    });
    const loadout = buildTheoryCalculatorLoadout({
      graph,
      badgeIds: group.theoryBadgeIds,
      mode: "selected_badges",
      source: "achievement_map",
      objectContext,
      includeContextItems: true,
      payloadIdsByBadgeId,
    });
    const scientificState = useScientificCalculatorStore.getState();
    scientificState.setTheoryLoadout(loadout);
    const firstQeiScalar =
      loadout.items.find((item) => item.kind === "calculator_payload" && item.badgeId === "nhm2.qei.sampling_window") ??
      loadout.items.find((item) => item.kind === "calculator_payload" && item.badgeId === "nhm2.closure.source_residual") ??
      loadout.items.find((item) => item.kind === "calculator_payload");
    if (firstQeiScalar) scientificState.loadTheoryLoadoutItem(firstQeiScalar.index);
  };

  const clearQeiBindingSelection = () => {
    clearQeiStressEnergyObjectBinding();
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
  };

  const selectTokamakPlasmaGroup = (group: TokamakPlasmaGroup) => {
    if (!graph) return;
    setActiveAtlasLensId("tokamak_plasma");
    setSelectedTokamakGroupId(group.id);
    setSelectedTokamakObjectBindingId(null);
    setSelectedEvolutionStageId(null);
    setSelectedCosmicRungId(null);
    setSelectedSolarGroupId(null);
    setSelectedCasimirGroupId(null);
    setSelectedWarpGroupId(null);
    setSelectedQeiGroupId(null);
    setSelectedGalacticGroupId(null);
    setSelectedCurvatureGroupId(null);
    clearStarSimObjectBinding();
    clearCosmicDistanceObjectBinding();
    clearSolarSpectrumObjectBinding();
    clearCasimirCavityObjectBinding();
    clearWarpGrNhm2ObjectBinding();
    clearQeiStressEnergyObjectBinding();
    clearGalacticDynamicsObjectBinding();
    clearCurvatureCollapseObjectBinding();
    setSelectedBadgeId(null);
    setSelectedBadgeIds([]);
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: Tokamak diagnostic/proxy boundary.`,
      ),
    });
  };

  const selectTokamakObjectBinding = (group: TokamakPlasmaGroup, bindingId: string) => {
    if (!graph) return;
    const binding = group.objectBindings.find((candidate) => candidate.id === bindingId);
    if (!binding) return;
    selectTokamakPlasmaGroup(group);
    setSelectedTokamakObjectBindingId(binding.id);
    const payloadIdsByBadgeId = group.calculatorPayloadRefs.reduce<Record<string, string[]>>((acc, ref) => {
      acc[ref.badgeId] = [...(acc[ref.badgeId] ?? []), ref.payloadId];
      return acc;
    }, {});
    const objectContext = buildTokamakPlasmaObjectBindings({
      ...binding.input,
      source: "manual",
    });
    const loadout = buildTheoryCalculatorLoadout({
      graph,
      badgeIds: group.theoryBadgeIds,
      mode: "selected_badges",
      source: "achievement_map",
      objectContext,
      includeContextItems: true,
      payloadIdsByBadgeId,
    });
    const scientificState = useScientificCalculatorStore.getState();
    scientificState.setTheoryLoadout(loadout);
    const firstTokamakScalar =
      loadout.items.find((item) => item.kind === "calculator_payload" && item.badgeId === "tokamak.plasma.magnetic_pressure") ??
      loadout.items.find((item) => item.kind === "calculator_payload" && item.badgeId.startsWith("tokamak.")) ??
      loadout.items.find((item) => item.kind === "calculator_payload");
    if (firstTokamakScalar) scientificState.loadTheoryLoadoutItem(firstTokamakScalar.index);
  };

  const clearTokamakBindingSelection = () => {
    clearTokamakPlasmaObjectBinding();
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
  };

  const selectGalacticDynamicsGroup = (group: GalacticDynamicsGroup) => {
    if (!graph) return;
    setActiveAtlasLensId("galactic_dynamics");
    setSelectedGalacticGroupId(group.id);
    setSelectedGalacticObjectBindingId(null);
    setSelectedEvolutionStageId(null);
    setSelectedCosmicRungId(null);
    setSelectedSolarGroupId(null);
    setSelectedCasimirGroupId(null);
    setSelectedWarpGroupId(null);
    setSelectedQeiGroupId(null);
    setSelectedTokamakGroupId(null);
    setSelectedCurvatureGroupId(null);
    clearStarSimObjectBinding();
    clearCosmicDistanceObjectBinding();
    clearSolarSpectrumObjectBinding();
    clearCasimirCavityObjectBinding();
    clearWarpGrNhm2ObjectBinding();
    clearQeiStressEnergyObjectBinding();
    clearTokamakPlasmaObjectBinding();
    clearCurvatureCollapseObjectBinding();
    setSelectedBadgeId(null);
    setSelectedBadgeIds([]);
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: Galactic null-model/diagnostic boundary.`,
      ),
    });
  };

  const selectGalacticObjectBinding = (group: GalacticDynamicsGroup, bindingId: string) => {
    if (!graph) return;
    const binding = group.objectBindings.find((candidate) => candidate.id === bindingId);
    if (!binding) return;
    selectGalacticDynamicsGroup(group);
    setSelectedGalacticObjectBindingId(binding.id);
    const payloadIdsByBadgeId = group.calculatorPayloadRefs.reduce<Record<string, string[]>>((acc, ref) => {
      acc[ref.badgeId] = [...(acc[ref.badgeId] ?? []), ref.payloadId];
      return acc;
    }, {});
    const objectContext = buildGalacticDynamicsObjectBindings({
      ...binding.input,
      source: "manual",
    });
    const loadout = buildTheoryCalculatorLoadout({
      graph,
      badgeIds: group.theoryBadgeIds,
      mode: "selected_badges",
      source: "achievement_map",
      objectContext,
      includeContextItems: true,
      payloadIdsByBadgeId,
    });
    const scientificState = useScientificCalculatorStore.getState();
    scientificState.setTheoryLoadout(loadout);
    const firstGalacticScalar =
      loadout.items.find((item) => item.kind === "calculator_payload" && item.badgeId === "galactic.map.distance_3d") ??
      loadout.items.find((item) => item.kind === "calculator_payload" && item.badgeId.startsWith("galactic.")) ??
      loadout.items.find((item) => item.kind === "calculator_payload");
    if (firstGalacticScalar) scientificState.loadTheoryLoadoutItem(firstGalacticScalar.index);
  };

  const clearGalacticBindingSelection = () => {
    clearGalacticDynamicsObjectBinding();
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
  };

  const selectCurvatureCollapseGroup = (group: CurvatureCollapseGroup) => {
    if (!graph) return;
    setActiveAtlasLensId("curvature_collapse");
    setSelectedCurvatureGroupId(group.id);
    setSelectedCurvatureObjectBindingId(null);
    setSelectedEvolutionStageId(null);
    setSelectedCosmicRungId(null);
    setSelectedSolarGroupId(null);
    setSelectedCasimirGroupId(null);
    setSelectedWarpGroupId(null);
    setSelectedQeiGroupId(null);
    setSelectedTokamakGroupId(null);
    setSelectedGalacticGroupId(null);
    clearStarSimObjectBinding();
    clearCosmicDistanceObjectBinding();
    clearSolarSpectrumObjectBinding();
    clearCasimirCavityObjectBinding();
    clearWarpGrNhm2ObjectBinding();
    clearQeiStressEnergyObjectBinding();
    clearTokamakPlasmaObjectBinding();
    clearGalacticDynamicsObjectBinding();
    setSelectedBadgeId(null);
    setSelectedBadgeIds([]);
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
    const groupBadgeIds = group.theoryBadgeIds.filter((badgeId: string) =>
      graph.badges.some((badge: TheoryBadgeV1) => badge.id === badgeId),
    );
    const highlighted = new Set(groupBadgeIds);
    const edgeIds = graph.edges
      .filter((edge: TheoryBadgeEdgeV1) => highlighted.has(edge.from) && highlighted.has(edge.to))
      .map((edge: TheoryBadgeEdgeV1) => edge.id);
    setSelectionOverlay({
      selectedBadgeIds: groupBadgeIds,
      highlightedBadgeIds: groupBadgeIds,
      highlightedEdgeIds: edgeIds,
      claimBoundaryNotes: group.claimBoundaryBadgeIds.map(
        (badgeId: string) => `${badgeId}: Curvature/collapse benchmark boundary.`,
      ),
    });
  };

  const selectCurvatureObjectBinding = (group: CurvatureCollapseGroup, bindingId: string) => {
    if (!graph) return;
    const binding = group.objectBindings.find((candidate) => candidate.id === bindingId);
    if (!binding) return;
    selectCurvatureCollapseGroup(group);
    setSelectedCurvatureObjectBindingId(binding.id);
    const payloadIdsByBadgeId = group.calculatorPayloadRefs.reduce<Record<string, string[]>>((acc, ref) => {
      acc[ref.badgeId] = [...(acc[ref.badgeId] ?? []), ref.payloadId];
      return acc;
    }, {});
    const objectContext = buildCurvatureCollapseObjectBindings({
      ...binding.input,
      source: "manual",
    });
    const loadout = buildTheoryCalculatorLoadout({
      graph,
      badgeIds: group.theoryBadgeIds,
      mode: "selected_badges",
      source: "achievement_map",
      objectContext,
      includeContextItems: true,
      payloadIdsByBadgeId,
    });
    const scientificState = useScientificCalculatorStore.getState();
    scientificState.setTheoryLoadout(loadout);
    const firstCurvatureScalar =
      loadout.items.find((item) => item.kind === "calculator_payload" && item.badgeId === "curvature.proxy.body_density") ??
      loadout.items.find(
        (item) =>
          item.kind === "calculator_payload" &&
          (item.badgeId.startsWith("curvature.") || item.badgeId.startsWith("collapse.")),
      ) ??
      loadout.items.find((item) => item.kind === "calculator_payload");
    if (firstCurvatureScalar) scientificState.loadTheoryLoadoutItem(firstCurvatureScalar.index);
  };

  const clearCurvatureBindingSelection = () => {
    clearCurvatureCollapseObjectBinding();
    useScientificCalculatorStore.getState().setTheoryLoadout(null);
  };

  const hasSavedLensSelection = (lensId: TheoryAtlasLensId) => {
    switch (lensId) {
      case "stellar_evolution":
        return Boolean(selectedEvolutionStageId);
      case "cosmic_distance_ladder":
        return Boolean(selectedCosmicRungId);
      case "solar_surface_spectrum":
        return Boolean(selectedSolarGroupId);
      case "casimir_cavity_modes":
        return Boolean(selectedCasimirGroupId);
      case "warp_gr_nhm2":
        return Boolean(selectedWarpGroupId);
      case "qei_stress_energy":
        return Boolean(selectedQeiGroupId);
      case "tokamak_plasma":
        return Boolean(selectedTokamakGroupId);
      case "galactic_dynamics":
        return Boolean(selectedGalacticGroupId);
      case "curvature_collapse":
        return Boolean(selectedCurvatureGroupId);
      default:
        return false;
    }
  };

  const runPathToBadge = (badgeId: string) => {
    if (!graph) return;
    void playbackStore.runPlayback({
      graph,
      targetBadgeId: badgeId,
    });
  };

  const loadTheoryRunForBadgeIds = (badgeIds: string[]) => {
    loadTheoryRunEvidence({
      badgeIds,
      mode: "dependency_path",
      preferredBadgeId: preferredEvidenceBadgeId(badgeIds),
      openWorkbench: true,
    });
  };

  const loadSelectedTheoryRun = () => {
    if (!selectedBadge) return;
    loadTheoryRunForBadgeIds([selectedBadge.id]);
  };

  const selectAtlasLens = (lensId: TheoryAtlasLensId) => {
    if (activeLensId === lensId) {
      setActiveAtlasLensId(null);
      useTheoryCompoundRunStore.getState().clearTheoryRun();
      return;
    }
    const shouldRestoreCollapsedLens = activeLensId === null && hasSavedLensSelection(lensId);
    setActiveAtlasLensId(lensId);
    useTheoryCompoundRunStore.getState().clearTheoryRun();
    if (!shouldRestoreCollapsedLens) {
      setSelectedBadgeId(null);
      setSelectedBadgeIds([]);
      setSelectedEvolutionStageId(null);
      setSelectedCosmicRungId(null);
      setSelectedSolarGroupId(null);
      setSelectedCasimirGroupId(null);
      setSelectedWarpGroupId(null);
      setSelectedQeiGroupId(null);
      setSelectedTokamakGroupId(null);
      setSelectedGalacticGroupId(null);
      setSelectedCurvatureGroupId(null);
      clearStarSimObjectBinding();
      clearCosmicDistanceObjectBinding();
      clearSolarSpectrumObjectBinding();
      clearCasimirCavityObjectBinding();
      clearWarpGrNhm2ObjectBinding();
      clearQeiStressEnergyObjectBinding();
      clearTokamakPlasmaObjectBinding();
      clearGalacticDynamicsObjectBinding();
      clearCurvatureCollapseObjectBinding();
    }
    if (!graph) return;
    const lens = resolvePhysicsAtlasLens({
      graph,
      atlas: buildHelixPhysicsAtlasV1({ graph }),
      blockId: lensId,
    });
    setSelectionOverlay({
      selectedBadgeIds: lens.centerBadgeIds,
      highlightedBadgeIds: lens.highlightedBadgeIds,
      highlightedEdgeIds: lens.highlightedEdgeIds,
      claimBoundaryNotes: lens.claimBoundaryNotes,
    });
  };

  const selectLiveAnswerContext = () => {
    if (!mapOverlay.liveAnswerContextReflection) return;
    setActiveAtlasLensId(null);
    restoreLiveAnswerContextOverlay();
  };

  if (viewMode === "map") {
    return (
      <div className="relative flex h-full min-h-0 overflow-hidden bg-zinc-900 text-zinc-950">
        <TheoryAtlasRail
          activeLensId={activeLensId}
          hasLiveReflection={Boolean(mapOverlay.liveAnswerContextReflection)}
          liveReflectionActive={
            mapOverlay.source === "discussion_reflection" &&
            Boolean(mapOverlay.liveAnswerContextReflection) &&
            mapOverlay.reflectionOverlay === mapOverlay.liveAnswerContextReflection
          }
          onSelectLiveReflection={selectLiveAnswerContext}
          onSelectLens={selectAtlasLens}
          translateText={translateTheoryGraphText}
        />
        <Button
          data-helix-interaction-kind="configure"
          data-helix-authority-state="client_local"
          data-helix-control-id="workstation.panel.theory-badge-graph.theory-badge-graph-panel.set-view-mode-list"
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setViewMode("list")}
          className="absolute right-4 top-3 z-40 border-slate-700 bg-slate-950/95 text-slate-100 hover:bg-slate-900 hover:text-white"
        >
          {t("theoryBadgeGraph.view.inspectorList")}
        </Button>
        <div
          data-testid="theory-atlas-lens-overlay"
          className="absolute bottom-0 left-9 top-0 z-30 flex shadow-2xl"
        >
        {activeLensId === "stellar_evolution" && graph ? (
          <StellarEvolutionLens
            graph={graph}
            stages={STARSIM_STELLAR_EVOLUTION_STAGES}
            selectedStageId={selectedEvolutionStageId}
            selectedObjectBindingId={selectedObjectBindingId}
            translateText={translateTheoryGraphText}
            onSelectStage={selectEvolutionStage}
            onSelectObjectBinding={selectStarSimObjectBinding}
            onClearObjectBinding={clearStarSimBindingSelection}
            onLoadPayload={loadCalculatorPayload}
          />
        ) : null}
        {activeLensId === "cosmic_distance_ladder" && graph ? (
          <CosmicDistanceLadderLens
            graph={graph}
            rungs={COSMIC_DISTANCE_LADDER_RUNGS}
            selectedRungId={selectedCosmicRungId}
            selectedObjectBindingId={selectedCosmicObjectBindingId}
            translateText={translateTheoryGraphText}
            onSelectRung={selectCosmicDistanceRung}
            onSelectObjectBinding={selectCosmicObjectBinding}
            onClearObjectBinding={clearCosmicBindingSelection}
            onLoadPayload={loadCalculatorPayload}
          />
        ) : null}
        {activeLensId === "solar_surface_spectrum" && graph ? (
          <SolarSpectrumLens
            graph={graph}
            groups={SOLAR_SPECTRUM_OBSERVATION_GROUPS}
            selectedGroupId={selectedSolarGroupId}
            selectedObjectBindingId={selectedSolarObjectBindingId}
            translateText={translateTheoryGraphText}
            onSelectGroup={selectSolarSpectrumGroup}
            onSelectObjectBinding={selectSolarObjectBinding}
            onClearObjectBinding={clearSolarBindingSelection}
            onLoadPayload={loadCalculatorPayload}
          />
        ) : null}
        {activeLensId === "casimir_cavity_modes" && graph ? (
          <CasimirCavityLens
            graph={graph}
            groups={CASIMIR_CAVITY_GROUPS}
            selectedGroupId={selectedCasimirGroupId}
            selectedObjectBindingId={selectedCasimirObjectBindingId}
            translateText={translateTheoryGraphText}
            onSelectGroup={selectCasimirCavityGroup}
            onSelectObjectBinding={selectCasimirObjectBinding}
            onClearObjectBinding={clearCasimirBindingSelection}
            onLoadPayload={loadCalculatorPayload}
          />
        ) : null}
        {activeLensId === "warp_gr_nhm2" && graph ? (
          <WarpGrNhm2Lens
            graph={graph}
            groups={WARP_GR_NHM2_GROUPS}
            selectedGroupId={selectedWarpGroupId}
            selectedObjectBindingId={selectedWarpObjectBindingId}
            translateText={translateTheoryGraphText}
            onSelectGroup={selectWarpGrNhm2Group}
            onSelectObjectBinding={selectWarpObjectBinding}
            onClearObjectBinding={clearWarpBindingSelection}
            onLoadPayload={loadCalculatorPayload}
          />
        ) : null}
        {activeLensId === "qei_stress_energy" && graph ? (
          <QeiStressEnergyLens
            graph={graph}
            groups={QEI_STRESS_ENERGY_GROUPS}
            selectedGroupId={selectedQeiGroupId}
            selectedObjectBindingId={selectedQeiObjectBindingId}
            translateText={translateTheoryGraphText}
            onSelectGroup={selectQeiStressEnergyGroup}
            onSelectObjectBinding={selectQeiObjectBinding}
            onClearObjectBinding={clearQeiBindingSelection}
            onLoadPayload={loadCalculatorPayload}
          />
        ) : null}
        {activeLensId === "tokamak_plasma" && graph ? (
          <TokamakPlasmaLens
            graph={graph}
            groups={TOKAMAK_PLASMA_GROUPS}
            selectedGroupId={selectedTokamakGroupId}
            selectedObjectBindingId={selectedTokamakObjectBindingId}
            translateText={translateTheoryGraphText}
            onSelectGroup={selectTokamakPlasmaGroup}
            onSelectObjectBinding={selectTokamakObjectBinding}
            onClearObjectBinding={clearTokamakBindingSelection}
            onLoadPayload={loadCalculatorPayload}
          />
        ) : null}
        {activeLensId === "galactic_dynamics" && graph ? (
          <GalacticDynamicsLens
            graph={graph}
            groups={GALACTIC_DYNAMICS_GROUPS}
            selectedGroupId={selectedGalacticGroupId}
            selectedObjectBindingId={selectedGalacticObjectBindingId}
            translateText={translateTheoryGraphText}
            onSelectGroup={selectGalacticDynamicsGroup}
            onSelectObjectBinding={selectGalacticObjectBinding}
            onClearObjectBinding={clearGalacticBindingSelection}
            onLoadPayload={loadCalculatorPayload}
          />
        ) : null}
        {activeLensId === "curvature_collapse" && graph ? (
          <CurvatureCollapseLens
            graph={graph}
            groups={CURVATURE_COLLAPSE_GROUPS}
            selectedGroupId={selectedCurvatureGroupId}
            selectedObjectBindingId={selectedCurvatureObjectBindingId}
            translateText={translateTheoryGraphText}
            onSelectGroup={selectCurvatureCollapseGroup}
            onSelectObjectBinding={selectCurvatureObjectBinding}
            onClearObjectBinding={clearCurvatureBindingSelection}
            onLoadPayload={loadCalculatorPayload}
          />
        ) : null}
        {activeLensId &&
        activeLensId !== "stellar_evolution" &&
        activeLensId !== "cosmic_distance_ladder" &&
        activeLensId !== "solar_surface_spectrum" &&
        activeLensId !== "casimir_cavity_modes" &&
        activeLensId !== "warp_gr_nhm2" &&
        activeLensId !== "qei_stress_energy" &&
        activeLensId !== "tokamak_plasma" &&
        activeLensId !== "galactic_dynamics" &&
        activeLensId !== "curvature_collapse" &&
        graph &&
        atlasLens &&
        activeAtlasBlock ? (
          <PhysicsAtlasBlockLens
            graph={graph}
            block={activeAtlasBlock}
            lens={atlasLens}
            translateText={translateTheoryGraphText}
            onSelectBadge={selectBadge}
            onLoadPayload={loadCalculatorPayload}
          />
        ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col bg-zinc-900">
          <div className="relative min-h-0 flex-1 overflow-hidden bg-zinc-900">
            {isLoading ? (
              <div className="p-4 text-sm text-zinc-200">{t("theoryBadgeGraph.loading")}</div>
            ) : error ? (
              <div className="p-4 text-sm text-red-200">{t("theoryBadgeGraph.error.load")}</div>
            ) : graph ? (
              <>
                <TheoryAchievementMap
                  graph={graph}
                  selectedBadgeId={selectedId}
                  selectedBadgeIds={selectedBadgeIds}
                  highlightedBadgeIds={highlightedBadgeIds}
                  highlightedEdgeIds={highlightedEdgeIds}
                  traceBadgeIds={multiTrace?.connectingBadgeIds ?? []}
                  connectableBadgeIds={connectableBadgeIds}
                  exactBadgeIds={[]}
                  likelyBadgeIds={[]}
                  softRegions={[]}
                  playbackBadgeIds={playbackBadgeIds}
                  solvedBadgeIds={solvedBadgeIds}
                  failedBadgeIds={failedBadgeIds}
                  rippleBadgeIds={mapOverlay.rippleBadgeIds}
                  heatByBadgeId={mapOverlay.heatByBadgeId}
                  probabilityTerrain={theoryProbabilityTerrain}
                  frontierTrace={null}
                  routeBadgeLabels={routeBadgeLabels}
                  activeAtlasLensId={rememberedAtlasLensId}
                  translateText={translateTheoryGraphText}
                  onSelectBadge={selectBadge}
                  onClearSelection={() => {
                    setSelectedBadgeId(null);
                    setSelectedBadgeIds([]);
                  }}
                  onRunPath={runPathToBadge}
                  onLoadCalculatorPayload={loadCalculatorPayload}
                  viewport={viewport}
                  onViewportChange={rememberViewport}
                />
                {combinationReaderPayload ? (
                  <pre className="sr-only" data-testid="theory-combination-reader-payload">
                    {JSON.stringify(combinationReaderPayload, null, 2)}
                  </pre>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{t("theoryBadgeGraph.header.title")}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {t("theoryBadgeGraph.header.description")}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {graph ? (
              <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                <Badge variant="outline" className="border-slate-700">
                  {t("theoryBadgeGraph.summary.badges", { count: graph.summary.badgeCount })}
                </Badge>
                <Badge variant="outline" className="border-slate-700">
                  {t("theoryBadgeGraph.summary.edges", { count: graph.summary.edgeCount })}
                </Badge>
                <Badge variant="outline" className="border-slate-700">
                  {t("theoryBadgeGraph.summary.calculatorLoadouts", { count: graph.summary.calculatorLoadableCount })}
                </Badge>
              </div>
            ) : null}
            <div className="flex rounded-md border border-slate-800 bg-slate-950 p-1">
              <Button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.theory-badge-graph.theory-badge-graph-panel.set-view-mode-map"
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setViewMode("map")}
                className="h-8"
              >
                {t("theoryBadgeGraph.view.achievementMap")}
              </Button>
              <Button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.theory-badge-graph.theory-badge-graph-panel.set-view-mode-list"
                type="button"
                size="sm"
                variant={viewMode === "list" ? "secondary" : "ghost"}
                onClick={() => setViewMode("list")}
                className="h-8"
              >
                {t("theoryBadgeGraph.view.inspectorList")}
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_180px]">
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {t("theoryBadgeGraph.filter.search")}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
              <Input data-helix-control-id="workstation.panel.theory-badge-graph.theory-badge-graph-panel.input" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
                value={query}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                placeholder={t("theoryBadgeGraph.filter.searchPlaceholder")}
                className="h-9 border-slate-800 bg-slate-950 pl-8 text-slate-100 placeholder:text-slate-600"
              />
            </div>
          </label>
          <SelectFilter
            label={t("theoryBadgeGraph.filter.subject")}
            allLabel={t("theoryBadgeGraph.filter.all")}
            value={subject}
            options={subjects}
            onChange={setSubject}
            translateText={translateTheoryGraphText}
          />
          <SelectFilter
            label={t("theoryBadgeGraph.filter.level")}
            allLabel={t("theoryBadgeGraph.filter.all")}
            value={level}
            options={levels}
            onChange={setLevel}
            translateText={translateTheoryGraphText}
          />
          <SelectFilter
            label={t("theoryBadgeGraph.filter.status")}
            allLabel={t("theoryBadgeGraph.filter.all")}
            value={status}
            options={statuses}
            onChange={setStatus}
            translateText={translateTheoryGraphText}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="p-4 text-sm text-slate-400">{t("theoryBadgeGraph.loading")}</div>
      ) : error ? (
        <div className="p-4 text-sm text-red-300">{t("theoryBadgeGraph.error.load")}</div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="space-y-4">
              {groupedBadges.map((group: { level: TheoryBadgeLevel; badges: TheoryBadgeV1[] }) => (
                <section key={group.level}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {translateTheoryGraphText(labelize(group.level))}
                  </div>
                  <div className="space-y-2">
                    {group.badges.map((badge: TheoryBadgeV1) => (
                      <BadgeButton
                        key={badge.id}
                        badge={badge}
                        selected={badge.id === selectedId}
                        onSelect={() => selectBadge(badge.id)}
                        calculatorLoadableLabel={t("theoryBadgeGraph.badge.calculatorLoadable")}
                        translateText={translateTheoryGraphText}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {groupedBadges.length === 0 ? (
                <div className="rounded-md border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-500">
                  {t("theoryBadgeGraph.empty.noMatches")}
                </div>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto">
            <Inspector
              badge={selectedBadge}
              graph={graph}
              onSelect={selectBadge}
              onOpenPanel={(panelId) => useWorkstationLayoutStore.getState().openPanelInActiveGroup(panelId)}
              playback={playbackStore.activeTargetBadgeId === selectedBadge?.id ? playbackStore.activeRun : null}
              playbackStatus={playbackStore.status}
              onRunPlayback={() => selectedBadge && runPathToBadge(selectedBadge.id)}
              onLoadTheoryRun={loadSelectedTheoryRun}
              onClearPlayback={playbackStore.clearPlayback}
              t={t}
              translateText={translateTheoryGraphText}
            />
          </div>
        </div>
      )}
    </div>
  );
}
