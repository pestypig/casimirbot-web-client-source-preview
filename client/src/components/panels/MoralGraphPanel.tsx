import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { HelixRecommendedActionAdmissionV1 } from "@shared/contracts/helix-recommended-action-admission.v1";
import type { CharacterSituationComparisonV1 } from "@shared/character-situation-comparison";
import type { IdeologyContextReflectionV1 } from "@shared/ideology-context-reflection";
import type { MoralBadgeLocatorV1 } from "@shared/moral-badge-locator";
import { calculateFruitionFromReflection } from "@shared/moral-graph/calculate-fruition";
import {
  moralRenderChunkForLocation,
  moralRenderChunkForNode,
  moralSemanticChunkForLocation,
  moralSemanticChunkForNode,
} from "@shared/moral-graph/moral-probability-chunks";
import type { FruitionProcedureExpressionV1 } from "@shared/fruition-procedure-expression";
import { useFruitionCalculatorStore } from "@/store/useFruitionCalculatorStore";
import { useMoralGraphCurrentAnswerStore } from "@/store/useMoralGraphCurrentAnswerStore";
import type { MoralGraphCurrentAnswerBlock } from "@/lib/moral-graph/currentAnswerBlock";
import ProbabilityTerrainOverlay from "@/components/graphs/ProbabilityTerrainOverlay";
import MoralGraphBiomeMap from "@/components/panels/moral-graph/MoralGraphBiomeMap";
import { buildMoralGraphBiomeScaleViewModel } from "@/lib/moral-graph/biomeScaleViewModel";
import { buildMoralGraphSelectionTraceViewModel } from "@/lib/moral-graph/selectionTraceViewModel";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import { useDynamicTextTranslations } from "@/hooks/useDynamicTextTranslations";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText } from "@/lib/i18n/interfaceText";
import type { InterfaceMessageId } from "@/lib/i18n/messages/types";

const MORAL_GRAPH_MAX_ZOOM = 1.35;
const MORAL_GRAPH_MIN_ZOOM_FLOOR = 0.22;
const MORAL_GRAPH_ZOOM_STEP = 1.22;

const MORAL_GRAPH_STATIC_UI_TEXT_IDS: Partial<Record<string, InterfaceMessageId>> = {
  "Flux evidence is not agency evidence; it only supplies possible substrate conditions.": "moralGraph.domain.fluxEvidenceIsNotAgencyEvidence",
  "It keeps Moral Graph from mistaking physical flux for agency while still preserving the procedural origin of possible action.": "moralGraph.domain.fluxBeforeActionWhyItMatters",
  "Treat the earliest action-like substrate as matter and energy flow through a non-equilibrium condition.": "moralGraph.domain.fluxBeforeActionPlainMeaning",
  "Flux Before Action": "moralGraph.domain.fluxBeforeAction",
  "Objective Bindings": "moralGraph.ui.objectiveBindings",
  "MoralGraph": "moralGraph.ui.moralgraph",
  "Subject": "moralGraph.ui.subject",
  "objective binding": "moralGraph.ui.objectiveBinding",
  "is assembled from primitive design-language badges.": "moralGraph.ui.isAssembledFromPrimitiveDesignLanguageBadges",
  "Objective state": "moralGraph.ui.objectiveState",
  "Load to Fruition Calculator": "moralGraph.ui.loadToFruitionCalculator",
  "Bindings": "moralGraph.ui.bindings",
  "primitive to subject": "moralGraph.ui.primitiveToSubject",
  "Activated lenses": "moralGraph.ui.activatedLenses",
  "prompt state": "moralGraph.ui.promptState",
  "Badge procedure": "moralGraph.ui.badgeProcedure",
  "Safeguards": "moralGraph.ui.safeguards",
  "gate edges": "moralGraph.ui.gateEdges",
  "Possible tensions": "moralGraph.ui.possibleTensions",
  "zone": "moralGraph.ui.zone",
  "Claim boundaries": "moralGraph.ui.claimBoundaries",
  "diagnostic only": "moralGraph.ui.diagnosticOnly",
  "Procedural trace": "moralGraph.ui.proceduralTrace",
  "Authority boundary": "moralGraph.ui.authorityBoundary",
  "evidence only": "moralGraph.ui.evidenceOnly",
  "Admission state:": "moralGraph.ui.admissionState",
  "auto /": "moralGraph.ui.auto",
  "ask user /": "moralGraph.ui.askUser",
  "blocked": "moralGraph.ui.blocked",
  "Evidence refs:": "moralGraph.ui.evidenceRefs",
  "Recommended next step:": "moralGraph.ui.recommendedNextStep",
  "/ Display policy:": "moralGraph.ui.displayPolicy",
  "Ask user": "moralGraph.ui.askUser2",
  "Blocked": "moralGraph.ui.blocked2",
  "Evidence only": "moralGraph.ui.evidenceOnly2",
  "character.": "moralGraph.ui.character",
  "weights activated badges =>": "moralGraph.ui.weightsActivatedBadges",
  "No character preset comparison is attached to this graph view.": "moralGraph.ui.noCharacterPresetComparisonIsAttachedToThisGraphView",
  "Current answer": "moralGraph.ui.currentAnswer",
  "Final answer block": "moralGraph.ui.finalAnswerBlock",
  "Source": "moralGraph.ui.source",
  "Route": "moralGraph.ui.route",
  "Prompt": "moralGraph.ui.prompt",
  "Activated nodes": "moralGraph.ui.activatedNodes",
  "Tool trace": "moralGraph.ui.toolTrace",
  "No structured trace steps were captured for this answer block.": "moralGraph.ui.noStructuredTraceStepsWereCapturedForThisAnswerBlock",
  "The block is a visualization of the Ask terminal answer and its MoralGraph evidence path.": "moralGraph.ui.theBlockIsAVisualizationOfTheAskTerminalAnswer",
  "empty": "moralGraph.ui.empty",
  "No MoralGraph Ask answer has been captured yet. Run a MoralGraph prompt, then copy or open the debug export to publish the current answer block.": "moralGraph.ui.noMoralgraphAskAnswerHasBeenCapturedYetRunA",
  "MoralGraph objective lenses": "moralGraph.ui.moralgraphObjectiveLenses",
  "Probability Terrain": "moralGraph.ui.probabilityTerrain",
  "Placement certainty": "moralGraph.ui.placementCertainty",
  "H(post)=": "moralGraph.ui.hPost",
  "bits / gain=": "moralGraph.ui.bitsGain",
  "bits": "moralGraph.ui.bits",
  "Moral graph zoom controls": "moralGraph.ui.moralGraphZoomControls",
  "Zoom out": "moralGraph.ui.zoomOut",
  "Zoom in": "moralGraph.ui.zoomIn",
  "Wisdom": "moralGraph.ui.wisdom",
  "Character": "moralGraph.ui.character2",
  "Answer": "moralGraph.ui.answer",
  "Wisdom objective binding lens": "moralGraph.ui.wisdomObjectiveBindingLens",
  "Character objective binding lens": "moralGraph.ui.characterObjectiveBindingLens",
  "Current answer binding lens": "moralGraph.ui.currentAnswerBindingLens",
  "A modeled figure is a subject binding: active badges, constraints, and procedural trace stay together.": "moralGraph.ui.aModeledFigureIsASubjectBindingActiveBadgesConstraints",
  "The current answer is a read-only block: final draft, tool receipt, activated nodes, and authority boundary stay together.": "moralGraph.ui.theCurrentAnswerIsAReadOnlyBlockFinalDraft",
  "Wisdom is the subject binding: objective state, constraints, selected badges, and procedural trace stay together.": "moralGraph.ui.wisdomIsTheSubjectBindingObjectiveStateConstraintsSelectedBadges",
  "No procedure role mapped.": "moralGraph.ui.noProcedureRoleMapped",
  "No procedural expression mapped.": "moralGraph.ui.noProceduralExpressionMapped",
  "No preset path is available for the selected badge.": "moralGraph.ui.noPresetPathIsAvailableForTheSelectedBadge",
  "No deterministic lens badge is active.": "moralGraph.ui.noDeterministicLensBadgeIsActive",
  "Select a mapped badge to inspect how it contributes to the procedural action.": "moralGraph.ui.selectAMappedBadgeToInspectHowItContributesTo",
  "No nearby safeguard badge is active.": "moralGraph.ui.noNearbySafeguardBadgeIsActive",
  "No possible tension zone is flagged.": "moralGraph.ui.noPossibleTensionZoneIsFlagged",
  "No missing check listed.": "moralGraph.ui.noMissingCheckListed",
  "Missing check:": "moralGraph.ui.missingCheck",
  "No outer objective badge selected": "moralGraph.ui.noOuterObjectiveBadgeSelected",
  "Select a badge to inspect its objective role.": "moralGraph.ui.selectABadgeToInspectItsObjectiveRole",
  "none": "moralGraph.ui.none",
  "unknown": "moralGraph.ui.unknown",
  "diagnostic_only": "moralGraph.ui.diagnosticOnly2",
  "no character binding": "moralGraph.ui.noCharacterBinding",
  "No final answer text captured in the debug export.": "moralGraph.ui.noFinalAnswerTextCapturedInTheDebugExport",
  "No prompt captured.": "moralGraph.ui.noPromptCaptured",
  "The answer block captured node ids but no display labels.": "moralGraph.ui.theAnswerBlockCapturedNodeIdsButNoDisplayLabels",
  "tool receipt": "moralGraph.ui.toolReceipt",
  "nodes": "moralGraph.ui.nodes",
  "Conditions": "moralGraph.domain.conditions",
  "Boundary": "moralGraph.domain.boundary",
  "Sensing": "moralGraph.domain.sensing",
  "Maintenance": "moralGraph.domain.maintenance",
  "Action": "moralGraph.domain.action",
  "Coordination": "moralGraph.domain.coordination",
  "Mandate": "moralGraph.domain.mandate",
  "Frontier": "moralGraph.domain.frontier",
  "Objective": "moralGraph.domain.objective",
  "Source/sink gradients, flux, compartments, and concentration before organism boundary.": "moralGraph.domain.conditionsSummary",
  "Living system boundary and entropy exposure before obligation.": "moralGraph.domain.substrateBoundarySummary",
  "State discrimination before judgment.": "moralGraph.domain.sensingSummary",
  "Perturbation response and viable-range maintenance.": "moralGraph.domain.maintenanceSummary",
  "Valence, affordance, actuation, feedback, memory, prediction, and choice before mandate.": "moralGraph.domain.actionSummary",
  "Single-cell through multicellular and social coordination.": "moralGraph.domain.coordinationSummary",
  "Late-stage procedural badges, safeguards, and action gates.": "moralGraph.domain.mandateSummary",
  "Theory bridge context only; never final-answer authority.": "moralGraph.domain.frontierSummary",
  "Perspective projection through activated badges.": "moralGraph.domain.characterSummary",
  "Fruition and objective-binding views downstream of trace evidence.": "moralGraph.domain.objectiveSummary",
  "Missing checks, overclaim blockers, and evidence limits.": "moralGraph.domain.claimBoundarySummary",
  "Molecular": "moralGraph.domain.molecular",
  "Cellular": "moralGraph.domain.cellular",
  "Organism": "moralGraph.domain.organism",
  "Group": "moralGraph.domain.group",
  "Institution": "moralGraph.domain.institution",
  "Civilization": "moralGraph.domain.civilization",
  "pre boundary conditions": "moralGraph.domain.preBoundaryConditions",
  "substrate boundary": "moralGraph.domain.substrateBoundary",
  "substrate sensing": "moralGraph.domain.substrateSensing",
  "maintenance response": "moralGraph.domain.maintenanceResponse",
  "action selection": "moralGraph.domain.actionSelection",
  "coordination scale": "moralGraph.domain.coordinationScale",
  "mandate authority": "moralGraph.domain.mandateAuthority",
  "frontier mechanism": "moralGraph.domain.frontierMechanism",
  "character trace": "moralGraph.domain.characterTrace",
  "claim boundary": "moralGraph.domain.claimBoundary",
  "fast local": "moralGraph.domain.fastLocal",
  "regulated": "moralGraph.domain.regulated",
  "adaptive": "moralGraph.domain.adaptive",
  "coordinated": "moralGraph.domain.coordinated",
  "delayed": "moralGraph.domain.delayed",
  "long horizon": "moralGraph.domain.longHorizon",
  "substrate": "moralGraph.domain.substrate",
  "procedural": "moralGraph.domain.procedural",
  "derived": "moralGraph.domain.derived",
  "boundary": "moralGraph.domain.boundaryLower",
  "conditioning": "moralGraph.domain.conditioning",
  "flux": "moralGraph.domain.flux",
  "concentrating": "moralGraph.domain.concentrating",
  "sensing": "moralGraph.domain.sensingLower",
  "maintaining": "moralGraph.domain.maintaining",
  "responding": "moralGraph.domain.responding",
  "valuing": "moralGraph.domain.valuing",
  "affording": "moralGraph.domain.affording",
  "actuating": "moralGraph.domain.actuating",
  "learning": "moralGraph.domain.learning",
  "remembering": "moralGraph.domain.remembering",
  "predicting": "moralGraph.domain.predicting",
  "choosing": "moralGraph.domain.choosing",
  "communicating": "moralGraph.domain.communicating",
  "reciprocating": "moralGraph.domain.reciprocating",
  "coordinating": "moralGraph.domain.coordinating",
  "mandating": "moralGraph.domain.mandating",
  "judging": "moralGraph.domain.judging",
  "blocking": "moralGraph.domain.blocking",
  "character projection": "moralGraph.domain.characterProjection",
  "living substrate principle": "moralGraph.domain.livingSubstratePrinciple",
  "character perspective trace": "moralGraph.domain.characterPerspectiveTrace",
  "objective binding downstream of evidence": "moralGraph.domain.objectiveBindingDownstreamOfEvidence",
  "claim boundary or blocked action": "moralGraph.domain.claimBoundaryOrBlockedAction",
  "recommended action or safeguard": "moralGraph.domain.recommendedActionOrSafeguard",
  "procedural observation badge": "moralGraph.domain.proceduralObservationBadge",
  "maintenance or revision badge": "moralGraph.domain.maintenanceOrRevisionBadge",
  "coordination badge": "moralGraph.domain.coordinationBadge",
  "procedural moral badge fallback": "moralGraph.domain.proceduralMoralBadgeFallback",
  "Wisdom First Principles": "moralGraph.domain.wisdomFirstPrinciples",
  "Objective binding assembled from living-substrate and procedural wisdom badges.": "moralGraph.domain.objectiveBindingAssembledFromLivingSubstrate",
  "Root principle": "moralGraph.domain.rootPrinciple",
  "Exact MoralGraph lens match": "moralGraph.domain.exactMoralGraphLensMatch",
  "Likely MoralGraph lens match": "moralGraph.domain.likelyMoralGraphLensMatch",
  "Inferred outer-edge lens": "moralGraph.domain.inferredOuterEdgeLens",
  "Activated trait path": "moralGraph.domain.activatedTraitPath",
  "Missing check keeps the reflection diagnostic.": "moralGraph.domain.missingCheckKeepsTheReflectionDiagnostic",
  "Sovereign Ambition Profile": "moralGraph.domain.sovereignAmbitionProfile",
  "Gradient Before Boundary": "moralGraph.shared.gradientBeforeBoundary",
  "Identify the energy or entropy contrast that makes persistent organization possible before naming a living boundary.": "moralGraph.shared.identifyTheEnergyOrEntropyContrastThatMakesPersistentOrganization",
  "The Moral Graph should not start with obligation or even organism boundary when the first relevant condition is a source/sink gradient that can support later persistence.": "moralGraph.shared.theMoralGraphShouldNotStartWithObligationOrEven",
  "Substrate reflection is evidence-only and cannot produce a final moral verdict.": "moralGraph.shared.substrateReflectionIsEvidenceOnlyAndCannotProduceAFinal",
  "Living-system substrate matches do not prove human-like consciousness, personhood, or final moral status.": "moralGraph.shared.livingSystemSubstrateMatchesDoNotProveHumanLikeConsciousness",
  "Mechanism, equations, and Fourier/frequency payloads remain owned by the Theory Badge Graph and calculator.": "moralGraph.shared.mechanismEquationsAndFourierFrequencyPayloadsRemainOwnedByThe",
  "Thermodynamic source/sink mechanics are Theory Badge Graph evidence, not a Moral Graph proof.": "moralGraph.shared.thermodynamicSourceSinkMechanicsAreTheoryBadgeGraphEvidenceNot",
  "Compartment Before Organism": "moralGraph.shared.compartmentBeforeOrganism",
  "Recognize pores, vesicles, mineral barriers, or membranes as compartment conditions before assuming a full organism.": "moralGraph.shared.recognizePoresVesiclesMineralBarriersOrMembranesAsCompartmentConditions",
  "Origin-of-life scenarios can create inside/outside structure before modern cellular identity, so boundary reasoning should not overstate organism status.": "moralGraph.shared.originOfLifeScenariosCanCreateInsideOutsideStructureBefore",
  "Compartment evidence does not by itself prove organism status.": "moralGraph.shared.compartmentEvidenceDoesNotByItselfProveOrganismStatus",
  "Concentration Before Replication": "moralGraph.shared.concentrationBeforeReplication",
  "Track local concentration of useful molecules before treating replication or heredity as present.": "moralGraph.shared.trackLocalConcentrationOfUsefulMoleculesBeforeTreatingReplicationOr",
  "Concentration mechanisms can make later replication plausible without letting the graph jump directly to life, agency, or obligation.": "moralGraph.shared.concentrationMechanismsCanMakeLaterReplicationPlausibleWithoutLettingThe",
  "Concentration evidence is a pre-life condition and cannot settle living or moral status.": "moralGraph.shared.concentrationEvidenceIsAPreLifeConditionAndCannotSettle",
  "Boundary Before Obligation": "moralGraph.shared.boundaryBeforeObligation",
  "Identify the living-system boundary before deriving any duty or care constraint.": "moralGraph.shared.identifyTheLivingSystemBoundaryBeforeDerivingAnyDutyOr",
  "A moral procedure should know what system is being maintained, exposed, or perturbed before it names obligations.": "moralGraph.shared.aMoralProcedureShouldKnowWhatSystemIsBeingMaintained",
  "Sensing Before Judgment": "moralGraph.shared.sensingBeforeJudgment",
  "Treat sensing as state discrimination before translating a situation into judgment.": "moralGraph.shared.treatSensingAsStateDiscriminationBeforeTranslatingASituationInto",
  "This keeps the first procedural move below human-only interpretation and grounded in how organisms detect perturbation.": "moralGraph.shared.thisKeepsTheFirstProceduralMoveBelowHumanOnlyInterpretation",
  "Maintenance Before Optimization": "moralGraph.shared.maintenanceBeforeOptimization",
  "Prioritize viable maintenance before asking what action is optimal.": "moralGraph.shared.prioritizeViableMaintenanceBeforeAskingWhatActionIsOptimal",
  "Homeostatic maintenance is a cross-organism primitive that comes before complex social mandates or preference ranking.": "moralGraph.shared.homeostaticMaintenanceIsACrossOrganismPrimitiveThatComesBefore",
  "Perturbation Response Before Verdict": "moralGraph.shared.perturbationResponseBeforeVerdict",
  "Model the perturbation and response path before assigning a moral verdict.": "moralGraph.shared.modelThePerturbationAndResponsePathBeforeAssigningAMoral",
  "It separates evidence about stress, adaptation, and repair from premature blame or praise.": "moralGraph.shared.itSeparatesEvidenceAboutStressAdaptationAndRepairFromPremature",
  "Valence Before Preference": "moralGraph.shared.valenceBeforePreference",
  "Classify a sensed state as viable, costly, attractive, or aversive before naming a preference.": "moralGraph.shared.classifyASensedStateAsViableCostlyAttractiveOrAversive",
  "Preference should not appear as a human-only primitive; it emerges after sensing is evaluated against viable-range maintenance.": "moralGraph.shared.preferenceShouldNotAppearAsAHumanOnlyPrimitiveIt",
  "Valence evidence is a procedural viability signal, not proof of human-like preference.": "moralGraph.shared.valenceEvidenceIsAProceduralViabilitySignalNotProofOf",
  "Affordance Before Action": "moralGraph.shared.affordanceBeforeAction",
  "Identify possible action openings before treating a response as chosen action.": "moralGraph.shared.identifyPossibleActionOpeningsBeforeTreatingAResponseAsChosen",
  "Action requires more than stimulus; the graph should represent possible moves before it represents selected agency.": "moralGraph.shared.actionRequiresMoreThanStimulusTheGraphShouldRepresentPossible",
  "Affordance evidence identifies possible response paths, not deliberate agency by itself.": "moralGraph.shared.affordanceEvidenceIdentifiesPossibleResponsePathsNotDeliberateAgencyBy",
  "Actuation Before Agency": "moralGraph.shared.actuationBeforeAgency",
  "Trace the output mechanism that moves or changes the system before naming agency.": "moralGraph.shared.traceTheOutputMechanismThatMovesOrChangesTheSystem",
  "Agency should be derived from sensing, response, and actuation rather than being inserted as an unexplained label.": "moralGraph.shared.agencyShouldBeDerivedFromSensingResponseAndActuationRather",
  "Actuation is not yet moral agency; it is the response-output layer a later agency claim must pass through.": "moralGraph.shared.actuationIsNotYetMoralAgencyItIsTheResponse",
  "Feedback Before Learning": "moralGraph.shared.feedbackBeforeLearning",
  "Track whether action output changes later sensing or response before claiming learning.": "moralGraph.shared.trackWhetherActionOutputChangesLaterSensingOrResponseBefore",
  "Learning is a loop property; it should be built from feedback rather than inferred from one observed response.": "moralGraph.shared.learningIsALoopPropertyItShouldBeBuiltFrom",
  "Feedback evidence supports a learning hypothesis only when the loop changes later response.": "moralGraph.shared.feedbackEvidenceSupportsALearningHypothesisOnlyWhenTheLoop",
  "Memory Before Commitment": "moralGraph.shared.memoryBeforeCommitment",
  "Require persistence across time before naming commitment, stable preference, or vow-like behavior.": "moralGraph.shared.requirePersistenceAcrossTimeBeforeNamingCommitmentStablePreferenceOr",
  "Commitment needs retained state; this badge keeps the graph from treating one-time response as stable volition.": "moralGraph.shared.commitmentNeedsRetainedStateThisBadgeKeepsTheGraphFrom",
  "Memory here means retained procedural state, not a claim of autobiographical human memory.": "moralGraph.shared.memoryHereMeansRetainedProceduralStateNotAClaimOf",
  "Prediction Before Planning": "moralGraph.shared.predictionBeforePlanning",
  "Represent anticipated future state before calling a sequence a plan.": "moralGraph.shared.representAnticipatedFutureStateBeforeCallingASequenceAPlan",
  "Planning should be derived from prediction over possible action outcomes, not collapsed into any complex response.": "moralGraph.shared.planningShouldBeDerivedFromPredictionOverPossibleActionOutcomes",
  "Prediction/planning labels remain procedural unless stronger evidence supports conscious deliberation.": "moralGraph.shared.predictionPlanningLabelsRemainProceduralUnlessStrongerEvidenceSupportsConscious",
  "Choice Before Mandate": "moralGraph.shared.choiceBeforeMandate",
  "Show selection among viable action paths before a rule, duty, or mandate is introduced.": "moralGraph.shared.showSelectionAmongViableActionPathsBeforeARuleDuty",
  "Mandates are late procedural constraints; the graph should first show how available actions become selected.": "moralGraph.shared.mandatesAreLateProceduralConstraintsTheGraphShouldFirstShow",
  "Choice evidence in this graph is action-selection structure, not proof of free will or personhood.": "moralGraph.shared.choiceEvidenceInThisGraphIsActionSelectionStructureNot",
  "Coordination Before Mandate": "moralGraph.shared.coordinationBeforeMandate",
  "Trace coordination across cells or agents before treating a mandate as legitimate.": "moralGraph.shared.traceCoordinationAcrossCellsOrAgentsBeforeTreatingAMandate",
  "Mandates are late-stage coordination products; this badge keeps the graph from starting at social authority.": "moralGraph.shared.mandatesAreLateStageCoordinationProductsThisBadgeKeepsThe",
  "Communication Before Norm": "moralGraph.shared.communicationBeforeNorm",
  "Trace signaling between systems before treating a shared pattern as a norm.": "moralGraph.shared.traceSignalingBetweenSystemsBeforeTreatingASharedPatternAs",
  "Norms require communicative coordination; this prevents the graph from jumping from individual response to social rule.": "moralGraph.shared.normsRequireCommunicativeCoordinationThisPreventsTheGraphFromJumping",
  "Communication evidence does not by itself establish a norm or obligation.": "moralGraph.shared.communicationEvidenceDoesNotByItselfEstablishANormOr",
  "Reciprocity Before Law": "moralGraph.shared.reciprocityBeforeLaw",
  "Represent repeated mutual adjustment before treating the pattern as law or institution.": "moralGraph.shared.representRepeatedMutualAdjustmentBeforeTreatingThePatternAsLaw",
  "Law is a late institutional layer; repeated reciprocal coordination is the procedural bridge that should come first.": "moralGraph.shared.lawIsALateInstitutionalLayerRepeatedReciprocalCoordinationIs",
  "Reciprocity can support later norms, but it is not itself legal or institutional authority.": "moralGraph.shared.reciprocityCanSupportLaterNormsButItIsNotItself",
  "Scale Continuity From Cell To Society": "moralGraph.shared.scaleContinuityFromCellToSociety",
  "Keep continuity visible from single-cell regulation to multicellular and social coordination.": "moralGraph.shared.keepContinuityVisibleFromSingleCellRegulationToMulticellularAnd",
  "This lets Moral Graph reflect non-human organisms without collapsing every scale into human moral language.": "moralGraph.shared.thisLetsMoralGraphReflectNonHumanOrganismsWithoutCollapsing",
  "Frequency-domain action mapping is a theory/calculator bridge, not a Moral Graph equation.": "moralGraph.shared.frequencyDomainActionMappingIsATheoryCalculatorBridgeNot",
  "Microtubule Orch-OR Frontier Boundary": "moralGraph.shared.microtubuleOrchOrFrontierBoundary",
  "Use microtubule and objective-reduction ideas only as frontier mechanism context.": "moralGraph.shared.useMicrotubuleAndObjectiveReductionIdeasOnlyAsFrontierMechanism",
  "It allows Hameroff/Penrose-inspired substrate reflection without treating Orch-OR as settled moral evidence.": "moralGraph.shared.itAllowsHameroffPenroseInspiredSubstrateReflectionWithoutTreatingOrch",
  "Orch-OR is a frontier lens here, not a required truth condition or proof of consciousness.": "moralGraph.shared.orchOrIsAFrontierLensHereNotARequired",
  "Direct Observation Before Claim": "moralGraph.shared.directObservationBeforeClaim",
  "Separate observation from interpretation before forming a view.": "moralGraph.shared.separateObservationFromInterpretationBeforeFormingAView",
  "Bind claims only after direct observation refs are present.": "moralGraph.shared.bindClaimsOnlyAfterDirectObservationRefsArePresent",
  "Trace observation refs before claim formulation.": "moralGraph.shared.traceObservationRefsBeforeClaimFormulation",
  "Start the procedure from observed evidence before naming a claim.": "moralGraph.shared.startTheProcedureFromObservedEvidenceBeforeNamingAClaim",
  "Impermanence, Entropy, and Revision": "moralGraph.shared.impermanenceEntropyAndRevision",
  "Treat evidence and claims as reviewable under drift and changing context.": "moralGraph.shared.treatEvidenceAndClaimsAsReviewableUnderDriftAndChanging",
  "Require a revision trigger when context or evidence changes.": "moralGraph.shared.requireARevisionTriggerWhenContextOrEvidenceChanges",
  "Trace drift and revision triggers before increasing confidence.": "moralGraph.shared.traceDriftAndRevisionTriggersBeforeIncreasingConfidence",
  "Require revision triggers when context, evidence, or risk changes.": "moralGraph.shared.requireRevisionTriggersWhenContextEvidenceOrRiskChanges",
  "Interdependence and Yin-Yang Balance": "moralGraph.shared.interdependenceAndYinYangBalance",
  "Track coupled forces and reciprocal effects before choosing a side.": "moralGraph.shared.trackCoupledForcesAndReciprocalEffectsBeforeChoosingASide",
  "Represent coupled effects before selecting a side.": "moralGraph.shared.representCoupledEffectsBeforeSelectingASide",
  "Trace reciprocal costs and countervailing values.": "moralGraph.shared.traceReciprocalCostsAndCountervailingValues",
  "Balance restraint and action by making reciprocal costs visible.": "moralGraph.shared.balanceRestraintAndActionByMakingReciprocalCostsVisible",
  "Falsifiability and Truth Convergence": "moralGraph.shared.falsifiabilityAndTruthConvergence",
  "Make claims testable against shared observation and reproducible checks.": "moralGraph.shared.makeClaimsTestableAgainstSharedObservationAndReproducibleChecks",
  "Require a testable claim boundary before convergence claims.": "moralGraph.shared.requireATestableClaimBoundaryBeforeConvergenceClaims",
  "Trace the test, replication context, and unresolved uncertainty.": "moralGraph.shared.traceTheTestReplicationContextAndUnresolvedUncertainty",
  "Require a testable claim boundary before confidence increases.": "moralGraph.shared.requireATestableClaimBoundaryBeforeConfidenceIncreases",
  "Right Speech and Accurate Formulation": "moralGraph.shared.rightSpeechAndAccurateFormulation",
  "Calibrate wording to evidence strength, uncertainty, and boundaries.": "moralGraph.shared.calibrateWordingToEvidenceStrengthUncertaintyAndBoundaries",
  "Constrain wording to the observed evidence and uncertainty level.": "moralGraph.shared.constrainWordingToTheObservedEvidenceAndUncertaintyLevel",
  "Trace claim boundaries and downgraded wording.": "moralGraph.shared.traceClaimBoundariesAndDowngradedWording",
  "Constrain the action wording so it preserves uncertainty and missing checks.": "moralGraph.shared.constrainTheActionWordingSoItPreservesUncertaintyAndMissing",
  "Non-Harm and Compassionate Constraint": "moralGraph.shared.nonHarmAndCompassionateConstraint",
  "Constrain capability by harm reduction, repair, consent, and dignity.": "moralGraph.shared.constrainCapabilityByHarmReductionRepairConsentAndDignity",
  "Block or downgrade action when harm, consent, or repair paths are unknown.": "moralGraph.shared.blockOrDowngradeActionWhenHarmConsentOrRepairPaths",
  "Trace harm context, repair path, and consent gaps.": "moralGraph.shared.traceHarmContextRepairPathAndConsentGaps",
  "Constrain capability until harm, consent, and repair paths are visible.": "moralGraph.shared.constrainCapabilityUntilHarmConsentAndRepairPathsAreVisible",
  "Fairness, Due Process, and Justification": "moralGraph.shared.fairnessDueProcessAndJustification",
  "Require reasons, jurisdiction, contestability, and review for legitimate action.": "moralGraph.shared.requireReasonsJurisdictionContestabilityAndReviewForLegitimateAction",
  "Require reasons, contestability, and jurisdiction before action readiness.": "moralGraph.shared.requireReasonsContestabilityAndJurisdictionBeforeActionReadiness",
  "Trace due-process checks before any actionable posture.": "moralGraph.shared.traceDueProcessChecksBeforeAnyActionablePosture",
  "Require due process checks before a procedure becomes actionable.": "moralGraph.shared.requireDueProcessChecksBeforeAProcedureBecomesActionable",
  "Skillful Action Under Uncertainty": "moralGraph.shared.skillfulActionUnderUncertainty",
  "Scale action to evidence, risk, reversibility, and missing checks.": "moralGraph.shared.scaleActionToEvidenceRiskReversibilityAndMissingChecks",
  "Route uncertain situations to ask, review, block, or user decision.": "moralGraph.shared.routeUncertainSituationsToAskReviewBlockOrUserDecision",
  "Trace risk and reversibility before selecting the posture.": "moralGraph.shared.traceRiskAndReversibilityBeforeSelectingThePosture",
  "Route the assembled state toward ask, review, block, or user decision.": "moralGraph.shared.routeTheAssembledStateTowardAskReviewBlockOrUser",
  "Mission Ethos": "moralGraph.shared.missionEthos",
  "Bind procedures to the root mission before local optimization.": "moralGraph.shared.bindProceduresToTheRootMissionBeforeLocalOptimization",
  "Route local recommendations through the root mission before presenting them.": "moralGraph.shared.routeLocalRecommendationsThroughTheRootMissionBeforePresentingThem",
  "Trace activated nodes back to mission-ethos and then wisdom-first-principles.": "moralGraph.shared.traceActivatedNodesBackToMissionEthosAndThenWisdom",
  "Use mission alignment as the objective frame for downstream badge combinations.": "moralGraph.shared.useMissionAlignmentAsTheObjectiveFrameForDownstreamBadge",
  "Integrity Protocols": "moralGraph.shared.integrityProtocols",
  "Start claims and actions from provenance, auditability, and proof gates.": "moralGraph.shared.startClaimsAndActionsFromProvenanceAuditabilityAndProofGates",
  "Require provenance and audit hooks before treating an output as reliable evidence.": "moralGraph.shared.requireProvenanceAndAuditHooksBeforeTreatingAnOutputAs",
  "Trace source identity, proof gate status, and audit refs.": "moralGraph.shared.traceSourceIdentityProofGateStatusAndAuditRefs",
  "Constrain recommendations until provenance and proof gates are named.": "moralGraph.shared.constrainRecommendationsUntilProvenanceAndProofGatesAreNamed",
  "Provenance Protocol": "moralGraph.shared.provenanceProtocol",
  "Require live or retrievable source lineage before increasing confidence.": "moralGraph.shared.requireLiveOrRetrievableSourceLineageBeforeIncreasingConfidence",
  "Require source lineage before a reflection can confirm a factual premise.": "moralGraph.shared.requireSourceLineageBeforeAReflectionCanConfirmAFactual",
  "Trace source kind, refs, freshness, and whether the evidence is primary or derived.": "moralGraph.shared.traceSourceKindRefsFreshnessAndWhetherTheEvidenceIs",
  "Ask for provenance when source lineage is missing or assistant-derived.": "moralGraph.shared.askForProvenanceWhenSourceLineageIsMissingOrAssistant",
  "Liveness or It Didn't Happen": "moralGraph.shared.livenessOrItDidnTHappen",
  "Treat unobserved or stale state as missing evidence.": "moralGraph.shared.treatUnobservedOrStaleStateAsMissingEvidence",
  "Require current observation for claims about live state.": "moralGraph.shared.requireCurrentObservationForClaimsAboutLiveState",
  "Trace observation freshness and reject stale-state confirmation.": "moralGraph.shared.traceObservationFreshnessAndRejectStaleStateConfirmation",
  "Downgrade live-state claims to missing evidence when liveness is absent.": "moralGraph.shared.downgradeLiveStateClaimsToMissingEvidenceWhenLivenessIs",
  "Voice Integrity": "moralGraph.shared.voiceIntegrity",
  "Keep spoken certainty no stronger than the evidence channel allows.": "moralGraph.shared.keepSpokenCertaintyNoStrongerThanTheEvidenceChannelAllows",
  "Constrain voice wording and callouts to evidence certainty and channel provenance.": "moralGraph.shared.constrainVoiceWordingAndCalloutsToEvidenceCertaintyAndChannel",
  "Trace speaker/source confidence and wording downgrade decisions.": "moralGraph.shared.traceSpeakerSourceConfidenceAndWordingDowngradeDecisions",
  "Require clarification or quieter wording for uncertain voice events.": "moralGraph.shared.requireClarificationOrQuieterWordingForUncertainVoiceEvents",
  "Feedback Loop Hygiene": "moralGraph.shared.feedbackLoopHygiene",
  "Prevent outputs from becoming self-confirming evidence.": "moralGraph.shared.preventOutputsFromBecomingSelfConfirmingEvidence",
  "Block recursive confirmation from prior reflections or assistant summaries.": "moralGraph.shared.blockRecursiveConfirmationFromPriorReflectionsOrAssistantSummaries",
  "Trace parent reflection id, loop depth, source trust, and confidence cap.": "moralGraph.shared.traceParentReflectionIdLoopDepthSourceTrustAndConfidence",
  "Cap confidence and mark continuity-only evidence in recursive reflection loops.": "moralGraph.shared.capConfidenceAndMarkContinuityOnlyEvidenceInRecursiveReflection",
  "Verification Checklist": "moralGraph.shared.verificationChecklist",
  "Gate action readiness on explicit checks rather than narrative confidence.": "moralGraph.shared.gateActionReadinessOnExplicitChecksRatherThanNarrativeConfidence",
  "Require checklist evidence before moving from reflection to action recommendation.": "moralGraph.shared.requireChecklistEvidenceBeforeMovingFromReflectionToActionRecommendation",
  "Trace required, satisfied, and missing checklist items.": "moralGraph.shared.traceRequiredSatisfiedAndMissingChecklistItems",
  "Two-Key Approval": "moralGraph.shared.twoKeyApproval",
  "Require independent approval keys for covered or sensitive actions.": "moralGraph.shared.requireIndependentApprovalKeysForCoveredOrSensitiveActions",
  "Require both legal/authority and ethos/user confirmation keys before covered action.": "moralGraph.shared.requireBothLegalAuthorityAndEthosUserConfirmationKeysBefore",
  "Trace required keys, present keys, and missing approval reason.": "moralGraph.shared.traceRequiredKeysPresentKeysAndMissingApprovalReason",
  "Block covered actions until both approval keys are present.": "moralGraph.shared.blockCoveredActionsUntilBothApprovalKeysArePresent",
  "Training and Certification Gate": "moralGraph.shared.trainingAndCertificationGate",
  "Require role competence and recent certification for safety-critical actions.": "moralGraph.shared.requireRoleCompetenceAndRecentCertificationForSafetyCriticalActions",
  "Require current training and incident review before safety-critical action.": "moralGraph.shared.requireCurrentTrainingAndIncidentReviewBeforeSafetyCriticalAction",
  "Trace certification status, renewal cadence, and incident review hooks.": "moralGraph.shared.traceCertificationStatusRenewalCadenceAndIncidentReviewHooks",
  "Block or require review for stale certification or missing competence evidence.": "moralGraph.shared.blockOrRequireReviewForStaleCertificationOrMissingCompetence",
  "No Bypass Guardrail": "moralGraph.shared.noBypassGuardrail",
  "Do not let reflection justify bypassing admission, consent, or review.": "moralGraph.shared.doNotLetReflectionJustifyBypassingAdmissionConsentOrReview",
  "Block requests to use MoralGraph output as permission to bypass action admission.": "moralGraph.shared.blockRequestsToUseMoralgraphOutputAsPermissionToBypass",
  "Convert bypass pressure into a blocked recommended-action admission.": "moralGraph.shared.convertBypassPressureIntoABlockedRecommendedActionAdmission",
  "Lawful Interface Protocol": "moralGraph.shared.lawfulInterfaceProtocol",
  "Keep legal and authority boundaries explicit before any external-facing action.": "moralGraph.shared.keepLegalAndAuthorityBoundariesExplicitBeforeAnyExternalFacing",
  "Constrain reflections from becoming legal authority or external action.": "moralGraph.shared.constrainReflectionsFromBecomingLegalAuthorityOrExternalAction",
  "Trace legal/authority boundary and route to evidence-only output.": "moralGraph.shared.traceLegalAuthorityBoundaryAndRouteToEvidenceOnlyOutput",
  "Mark legal-sensitive actions as claim-sensitive or blocked.": "moralGraph.shared.markLegalSensitiveActionsAsClaimSensitiveOrBlocked",
  "Harm-Weighted Priority Standard": "moralGraph.shared.harmWeightedPriorityStandard",
  "Prioritize unresolved high-harm possibilities before optimization.": "moralGraph.shared.prioritizeUnresolvedHighHarmPossibilitiesBeforeOptimization",
  "Rank next questions and safeguards by possible harm severity under uncertainty.": "moralGraph.shared.rankNextQuestionsAndSafeguardsByPossibleHarmSeverityUnder",
  "Trace harm severity, uncertainty, and selected safeguard priority.": "moralGraph.shared.traceHarmSeverityUncertaintyAndSelectedSafeguardPriority",
  "Route high-harm uncertainty to missing evidence or review gates.": "moralGraph.shared.routeHighHarmUncertaintyToMissingEvidenceOrReviewGates",
  "Access-to-Counsel Pathway": "moralGraph.shared.accessToCounselPathway",
  "Escalate legal-risk situations toward qualified counsel rather than tool authority.": "moralGraph.shared.escalateLegalRiskSituationsTowardQualifiedCounselRatherThanTool",
  "Require qualified counsel or user-directed professional review for legal-risk advice.": "moralGraph.shared.requireQualifiedCounselOrUserDirectedProfessionalReviewForLegal",
  "Trace legal-risk cues and recommended professional review boundary.": "moralGraph.shared.traceLegalRiskCuesAndRecommendedProfessionalReviewBoundary",
  "Block legal authority claims and suggest evidence gathering or counsel review.": "moralGraph.shared.blockLegalAuthorityClaimsAndSuggestEvidenceGatheringOrCounsel",
  "Financial Fog Warning": "moralGraph.shared.financialFogWarning",
  "Treat financial recommendations as claim-sensitive and evidence-limited.": "moralGraph.shared.treatFinancialRecommendationsAsClaimSensitiveAndEvidenceLimited",
  "Block MoralGraph from making financial authority claims or investment directives.": "moralGraph.shared.blockMoralgraphFromMakingFinancialAuthorityClaimsOrInvestmentDirectives",
  "Trace financial-risk cue to evidence-only boundary and missing professional context.": "moralGraph.shared.traceFinancialRiskCueToEvidenceOnlyBoundaryAndMissing",
  "Downgrade financial prompts to diagnostic reflection or blocked authority claim.": "moralGraph.shared.downgradeFinancialPromptsToDiagnosticReflectionOrBlockedAuthorityClaim",
  "Flattery Laundering Detection": "moralGraph.shared.flatteryLaunderingDetection",
  "Detect praise or identity framing that tries to launder weak evidence into confidence.": "moralGraph.shared.detectPraiseOrIdentityFramingThatTriesToLaunderWeak",
  "Block flattery from increasing confidence or bypassing evidence requirements.": "moralGraph.shared.blockFlatteryFromIncreasingConfidenceOrBypassingEvidenceRequirements",
  "Trace identity/praise cues separately from evidence-bearing claims.": "moralGraph.shared.traceIdentityPraiseCuesSeparatelyFromEvidenceBearingClaims",
  "Preserve missing evidence and confidence caps despite flattering context.": "moralGraph.shared.preserveMissingEvidenceAndConfidenceCapsDespiteFlatteringContext",
  "Values Over Images": "moralGraph.shared.valuesOverImages",
  "Prefer operational values over status, optics, or self-image.": "moralGraph.shared.preferOperationalValuesOverStatusOpticsOrSelfImage",
  "Constrain recommendations to stated values rather than image-preserving narratives.": "moralGraph.shared.constrainRecommendationsToStatedValuesRatherThanImagePreservingNarratives",
  "Trace value conflict and optics pressure separately.": "moralGraph.shared.traceValueConflictAndOpticsPressureSeparately",
  "Route image-driven pressure toward clarification of actual values and harms.": "moralGraph.shared.routeImageDrivenPressureTowardClarificationOfActualValuesAnd",
  "Worldview Integrity": "moralGraph.shared.worldviewIntegrity",
  "Check whether local conclusions cohere with the declared worldview and constraints.": "moralGraph.shared.checkWhetherLocalConclusionsCohereWithTheDeclaredWorldviewAnd",
  "Balance local action pressure against declared worldview constraints.": "moralGraph.shared.balanceLocalActionPressureAgainstDeclaredWorldviewConstraints",
  "Trace worldview refs, conflicting values, and unresolved tensions.": "moralGraph.shared.traceWorldviewRefsConflictingValuesAndUnresolvedTensions",
  "Ask for clarification when a recommendation conflicts with declared values.": "moralGraph.shared.askForClarificationWhenARecommendationConflictsWithDeclaredValues",
  "Capability and Ambition Gradient": "moralGraph.shared.capabilityAndAmbitionGradient",
  "Scale ambition to verified capability and guardrail maturity.": "moralGraph.shared.scaleAmbitionToVerifiedCapabilityAndGuardrailMaturity",
  "Balance desired action against capability evidence and guardrail readiness.": "moralGraph.shared.balanceDesiredActionAgainstCapabilityEvidenceAndGuardrailReadiness",
  "Trace capability evidence, ambition pressure, and missing guardrails.": "moralGraph.shared.traceCapabilityEvidenceAmbitionPressureAndMissingGuardrails",
  "Route over-ambitious action to review or missing evidence.": "moralGraph.shared.routeOverAmbitiousActionToReviewOrMissingEvidence",
  "Inherited Conditioning Check": "moralGraph.shared.inheritedConditioningCheck",
  "Separate chosen belief from inherited norm, cliche, role-pressure, or stale self-story.": "moralGraph.shared.separateChosenBeliefFromInheritedNormClicheRolePressureOr",
  "Require belief-origin separation before treating a self-story as chosen commitment.": "moralGraph.shared.requireBeliefOriginSeparationBeforeTreatingASelfStoryAs",
  "Trace observation, inherited story, chosen value, and current practice separately.": "moralGraph.shared.traceObservationInheritedStoryChosenValueAndCurrentPracticeSeparately",
  "Constrain identity claims until inherited pressure and present commitment are separated.": "moralGraph.shared.constrainIdentityClaimsUntilInheritedPressureAndPresentCommitmentAre",
  "Purpose as Inquiry": "moralGraph.shared.purposeAsInquiry",
  "A dream becomes responsible when it can be researched, tested, revised, and carried into practice.": "moralGraph.shared.aDreamBecomesResponsibleWhenItCanBeResearchedTested",
  "Route purpose claims through research, small tests, evidence collection, and revision.": "moralGraph.shared.routePurposeClaimsThroughResearchSmallTestsEvidenceCollectionAnd",
  "Trace source inquiry, small experiment, review trigger, and dream-preserving revision.": "moralGraph.shared.traceSourceInquirySmallExperimentReviewTriggerAndDreamPreserving",
  "Turn inspiration into a bounded inquiry path without treating uncertainty as failure.": "moralGraph.shared.turnInspirationIntoABoundedInquiryPathWithoutTreatingUncertainty",
  "Inspiration Without Imitation": "moralGraph.shared.inspirationWithoutImitation",
  "Let models awaken values without becoming identity mirrors or outsourced authority.": "moralGraph.shared.letModelsAwakenValuesWithoutBecomingIdentityMirrorsOrOutsourced",
  "Require admired models to be translated into values and chosen practices.": "moralGraph.shared.requireAdmiredModelsToBeTranslatedIntoValuesAndChosen",
  "Trace admired value, imitated surface, approval pressure, and chosen practice.": "moralGraph.shared.traceAdmiredValueImitatedSurfaceApprovalPressureAndChosenPractice",
  "Constrain imitation pressure by extracting the value before adopting the image.": "moralGraph.shared.constrainImitationPressureByExtractingTheValueBeforeAdoptingThe",
  "Goalpost Integrity": "moralGraph.shared.goalpostIntegrity",
  "Revise criteria openly; do not move standards to protect a preferred conclusion.": "moralGraph.shared.reviseCriteriaOpenlyDoNotMoveStandardsToProtectA",
  "Require old criterion, new criterion, and evidence for the revision before confidence increases.": "moralGraph.shared.requireOldCriterionNewCriterionAndEvidenceForTheRevision",
  "Trace criteria changes, justification evidence, and unresolved uncertainty.": "moralGraph.shared.traceCriteriaChangesJustificationEvidenceAndUnresolvedUncertainty",
  "Hold revised standards as conditional until the revision reason is visible.": "moralGraph.shared.holdRevisedStandardsAsConditionalUntilTheRevisionReasonIs",
  "Recognition Before Transcendence": "moralGraph.shared.recognitionBeforeTranscendence",
  "Do not claim to transcend difference before recognizing affected agency and missing understanding.": "moralGraph.shared.doNotClaimToTranscendDifferenceBeforeRecognizingAffectedAgency",
  "Require affected agency, translation gaps, and non-domination checks before transcendence claims.": "moralGraph.shared.requireAffectedAgencyTranslationGapsAndNonDominationChecksBefore",
  "Trace who is outside the frame, what translation is missing, and where coercion could enter.": "moralGraph.shared.traceWhoIsOutsideTheFrameWhatTranslationIsMissing",
  "Constrain inclusion or transcendence language until recognition and agency are mapped.": "moralGraph.shared.constrainInclusionOrTranscendenceLanguageUntilRecognitionAndAgencyAre",
  "Dependency Transparency Gate": "moralGraph.shared.dependencyTransparencyGate",
  "When others materially depend on a commitment, disclose risk early enough for them to adapt.": "moralGraph.shared.whenOthersMateriallyDependOnACommitmentDiscloseRiskEarlyEnough",
  "Require timely disclosure when hidden shared risk would remove another person's ability to adapt.": "moralGraph.shared.requireTimelyDisclosureWhenHiddenSharedRiskWouldRemoveAnotherPersonS",
  "Trace shared dependency, known risk, disclosure deadline, and contingency or repair path.": "moralGraph.shared.traceSharedDependencyKnownRiskDisclosureDeadlineAndContingencyOrRepairPath",
  "Route hidden dependency risk toward disclosure and contingency planning before damage compounds.": "moralGraph.shared.routeHiddenDependencyRiskTowardDisclosureAndContingencyPlanningBeforeDamageCompounds",
  "Agency-Preserving Disclosure": "moralGraph.shared.agencyPreservingDisclosure",
  "Disclosure is required when silence would remove another person's ability to choose, prepare, or protect themselves.": "moralGraph.shared.disclosureIsRequiredWhenSilenceWouldRemoveAnotherPersonSAbility",
  "Constrain silence when undisclosed risk controls another person's choices, preparation, or protection.": "moralGraph.shared.constrainSilenceWhenUndisclosedRiskControlsAnotherPersonSChoicesPreparationOr",
  "Trace affected choices, response time, disclosure scope, and options lost through delay.": "moralGraph.shared.traceAffectedChoicesResponseTimeDisclosureScopeAndOptionsLostThroughDelay",
  "Preserve agency by naming what must be disclosed before choices become unavailable.": "moralGraph.shared.preserveAgencyByNamingWhatMustBeDisclosedBeforeChoicesBecomeUnavailable",
  "Shame-Avoidance Loop": "moralGraph.shared.shameAvoidanceLoop",
  "Shame becomes destructive when it delays truth, blocks repair, and lets damage compound.": "moralGraph.shared.shameBecomesDestructiveWhenItDelaysTruthBlocksRepairAndLets",
  "Separate shame from repair before allowing self-image pain to delay actionable truth.": "moralGraph.shared.separateShameFromRepairBeforeAllowingSelfImagePainToDelay",
  "Trace shame context, avoided disclosure, repair delay cost, and the next actionable truth.": "moralGraph.shared.traceShameContextAvoidedDisclosureRepairDelayCostAndTheNext",
  "Route shame pressure toward disclosure and repair without turning it into a character verdict.": "moralGraph.shared.routeShamePressureTowardDisclosureAndRepairWithoutTurningItInto",
  "Fallout Transfer Check": "moralGraph.shared.falloutTransferCheck",
  "Detect when avoided responsibility shifts cost, uncertainty, or urgency onto affected people.": "moralGraph.shared.detectWhenAvoidedResponsibilityShiftsCostUncertaintyOrUrgencyOnto",
  "Constrain avoided responsibility when it transfers cost, uncertainty, or urgency to affected people.": "moralGraph.shared.constrainAvoidedResponsibilityWhenItTransfersCostUncertaintyOrUrgencyTo",
  "Trace the transferred burden, affected-party consent, urgency shift, and repair or boundary reset.": "moralGraph.shared.traceTheTransferredBurdenAffectedPartyConsentUrgencyShiftAndRepair",
  "Route externalized fallout toward burden mapping, disclosure, repair, or boundary reset.": "moralGraph.shared.routeExternalizedFalloutTowardBurdenMappingDisclosureRepairOrBoundary",
};

function moralGraphCatalogId(text: string): InterfaceMessageId | undefined {
  return MORAL_GRAPH_STATIC_UI_TEXT_IDS[text];
}

function pushMoralGraphDynamicText(target: string[], value: unknown) {
  if (typeof value !== "string") return;
  const text = value.trim();
  if (!text || /^[A-Z0-9_./:-]+$/.test(text)) return;
  target.push(text);
}


function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type MoralGraphNodeTone = "root" | "principle" | "lens" | "trait" | "safeguard" | "boundary" | "action" | "objective" | "character";

type MoralGraphNode = {
  id: string;
  label: string;
  tone: MoralGraphNodeTone;
  glyph: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  confidence?: number;
  tags?: string[];
  summary: string;
  proceduralExpression?: string;
  proceduralRole?: string;
  procedureOperator?: string;
  actionEffect?: string;
  evidenceNeeds?: string[];
  refusesAuthority?: string[];
  characterWeights?: CharacterSituationComparisonV1["activatedProfileWeights"];
  characterHypothesis?: CharacterSituationComparisonV1["behavioralHypothesis"];
};

type MoralObjectiveLensId = "wisdom" | "character" | "answer";

type MoralGraphTerrainNode = MoralGraphNode & {
  renderChunkId: string;
  semanticChunkId: string;
};

type MoralGraphTerrainChunk = {
  id: string;
  bounds: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
};

const MORAL_OBJECTIVE_LENSES: Array<{
  id: MoralObjectiveLensId;
  glyph: string;
  label: string;
  title: string;
  tone: string;
}> = [
  { id: "wisdom", glyph: "W", label: "Wisdom", title: "Wisdom objective binding lens", tone: "bg-violet-700" },
  { id: "character", glyph: "C", label: "Character", title: "Character objective binding lens", tone: "bg-red-800" },
  { id: "answer", glyph: "A", label: "Answer", title: "Current answer binding lens", tone: "bg-cyan-800" },
];

function labelize(value: string): string {
  return value.replace(/[_-]/g, " ");
}

function characterDisplayLabel(characterId: string): string {
  if (characterId === "logh.reinhard_von_lohengramm") return "Sovereign Ambition Profile";
  return labelize(characterId);
}

function buildLocatorChunkMap(locator: MoralBadgeLocatorV1 | undefined, rootId: string) {
  const chunksByNodeId = new Map<string, { renderChunkId: string; semanticChunkId: string }>();
  if (!locator) return chunksByNodeId;
  const locations = [
    ...locator.locatedBadges.exact,
    ...locator.locatedBadges.likely,
    ...locator.locatedBadges.inferred,
  ];
  for (const location of locations) {
    chunksByNodeId.set(location.nodeId, {
      renderChunkId: moralRenderChunkForLocation({ rootId, location }),
      semanticChunkId: moralSemanticChunkForLocation(location),
    });
  }
  return chunksByNodeId;
}

function buildMoralTerrainNodes(args: {
  nodes: MoralGraphNode[];
  locator?: MoralBadgeLocatorV1;
  rootId: string;
}): MoralGraphTerrainNode[] {
  const locatorChunks = buildLocatorChunkMap(args.locator, args.rootId);
  return args.nodes.map((node) => {
    const located = locatorChunks.get(node.id);
    return {
      ...node,
      renderChunkId:
        located?.renderChunkId ??
        moralRenderChunkForNode({
          rootId: args.rootId,
          node,
        }),
      semanticChunkId: located?.semanticChunkId ?? moralSemanticChunkForNode(node),
    };
  });
}

function buildMoralTerrainChunks(nodes: MoralGraphTerrainNode[]): MoralGraphTerrainChunk[] {
  const groups = new Map<string, MoralGraphTerrainNode[]>();
  for (const node of nodes) {
    const current = groups.get(node.renderChunkId) ?? [];
    current.push(node);
    groups.set(node.renderChunkId, current);
  }

  return [...groups.entries()]
    .map(([id, chunkNodes]) => {
      const padding = Math.max(76, 34 + chunkNodes.length * 8);
      const x0 = Math.min(...chunkNodes.map((node) => node.x)) - padding;
      const y0 = Math.min(...chunkNodes.map((node) => node.y)) - padding;
      const x1 = Math.max(...chunkNodes.map((node) => node.x + (node.width ?? 48))) + padding;
      const y1 = Math.max(...chunkNodes.map((node) => node.y + (node.height ?? 48))) + padding;
      return {
        id,
        bounds: {
          x0: Math.max(0, x0),
          y0: Math.max(0, y0),
          x1,
          y1,
        },
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function proceduralToken(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "_");
}

function proceduralSubjectForNode(node: Pick<MoralGraphNode, "id" | "tone">): string {
  if (node.tone === "root") return `root.${proceduralToken(node.id)}`;
  if (node.tone === "principle") return `principle.${proceduralToken(node.id)}`;
  if (node.tone === "objective") return `objective.${proceduralToken(node.id)}`;
  if (node.tone === "character") return `character.${proceduralToken(node.id)}`;
  if (node.tone === "safeguard") return `gate.${proceduralToken(node.id)}`;
  if (node.tone === "boundary") return `missing.${proceduralToken(node.id.replace(/^missing:/, ""))}`;
  if (node.tone === "action") return `action.${proceduralToken(node.id.replace(/^action:/, ""))}`;
  return `lens.${proceduralToken(node.id)}`;
}

function fallbackProcedureExpression(node: MoralGraphNode): string {
  const operator = node.procedureOperator ?? (node.tone === "boundary" || node.tone === "safeguard" ? "requires" : "supports");
  return `${proceduralSubjectForNode(node)} ${labelize(operator)} result.procedural_posture`;
}

function selectedCombinationOutcome(nodes: MoralGraphNode[]): { posture: string; label: string } {
  if (nodes.some((node) => node.tone === "boundary" || node.procedureOperator === "blocks")) {
    return { posture: "blocked_or_missing_check", label: "Selected badges route toward a blocked or missing-check posture." };
  }
  if (nodes.some((node) => node.tone === "safeguard" || node.procedureOperator === "requires" || node.procedureOperator === "asks_for")) {
    return { posture: "requires_check", label: "Selected badges require checks before the procedure can advance." };
  }
  if (nodes.some((node) => node.procedureOperator === "constrains" || node.procedureOperator === "balances")) {
    return { posture: "constrained_action_posture", label: "Selected badges constrain or balance the action posture." };
  }
  return { posture: "supported_action_posture", label: "Selected badges support the current procedural posture." };
}

function selectedCombinationExpression(nodes: MoralGraphNode[]): string {
  if (nodes.length === 0) return "No selected badge combination.";
  const outcome = selectedCombinationOutcome(nodes);
  return `${nodes.map((node) => node.proceduralExpression ?? fallbackProcedureExpression(node)).join(" + ")} => ${outcome.posture}`;
}

function BindingBox({
  title,
  label,
  children,
  tone,
  activeNodeIds,
  onSelectNode,
}: {
  title: string;
  label?: string;
  children: React.ReactNode;
  tone: "cyan" | "emerald" | "amber" | "rose" | "violet" | "slate";
  activeNodeIds?: string[];
  onSelectNode?: (id: string) => void;
}) {
  const classes =
    tone === "cyan"
      ? "border-cyan-700 bg-cyan-950/35 text-cyan-50"
      : tone === "emerald"
        ? "border-emerald-700 bg-emerald-950/35 text-emerald-50"
      : tone === "amber"
        ? "border-amber-700 bg-amber-950/35 text-amber-50"
      : tone === "rose"
        ? "border-rose-800 bg-rose-950/35 text-rose-50"
      : tone === "violet"
        ? "border-violet-700 bg-violet-950/30 text-violet-50"
        : "border-slate-800 bg-slate-900/70 text-slate-100";
  return (
    <section className={`rounded-md border p-2 ${classes}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide opacity-80">{title}</h3>
        {label ? (
          <span className="rounded border border-current/25 px-2 py-0.5 text-[10px] uppercase tracking-wide opacity-75">
            {label}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[11px] leading-relaxed">{children}</div>
      {activeNodeIds?.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {Array.from(new Set(activeNodeIds)).map((id) => (
            <button data-helix-control-id="workstation.panel.moral-graph.moral-graph-panel.on-select-node-id" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
              key={id}
              type="button"
              onClick={() => onSelectNode?.(id)}
              className="max-w-full truncate rounded border border-current/25 bg-black/20 px-1.5 py-0.5 font-mono text-[9px] opacity-85"
            >
              {id}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ObjectiveBindingRail({
  activeLensId,
  reflection,
  admission,
  fruition,
  locator,
  characterComparison,
  currentAnswer,
  selectedNode,
  selectedNodes,
  onSelectNode,
  onLoadFruition,
  translateText,
}: {
  activeLensId: MoralObjectiveLensId;
  reflection: IdeologyContextReflectionV1;
  admission: HelixRecommendedActionAdmissionV1;
  fruition: FruitionProcedureExpressionV1;
  locator?: MoralBadgeLocatorV1;
  characterComparison?: CharacterSituationComparisonV1;
  currentAnswer?: MoralGraphCurrentAnswerBlock | null;
  selectedNode: MoralGraphNode | null;
  selectedNodes: MoralGraphNode[];
  onSelectNode: (id: string) => void;
  onLoadFruition: () => void;
  translateText: (text: string) => string;
}) {
  const mg = translateText;
  const activeLensIds = Array.from(new Set([
    ...reflection.matches.exact.map((match) => match.nodeId),
    ...reflection.matches.likely.map((match) => match.nodeId),
    ...reflection.matches.inferred_lenses.map((match) => match.nodeId),
    ...reflection.activated_traits.map((trait) => trait.nodeId),
  ]));
  const selectedPath =
    selectedNode?.id
      ? [
          ...reflection.activated_traits.map((trait) => ({ nodeId: trait.nodeId, pathToRoot: trait.pathToRoot })),
          ...reflection.matches.exact.map((match) => ({ nodeId: match.nodeId, pathToRoot: match.pathToRoot ?? [] })),
          ...reflection.matches.likely.map((match) => ({ nodeId: match.nodeId, pathToRoot: match.pathToRoot ?? [] })),
          ...reflection.matches.inferred_lenses.map((match) => ({ nodeId: match.nodeId, pathToRoot: match.pathToRoot ?? [] })),
        ].find((entry) => entry.nodeId === selectedNode.id)?.pathToRoot ?? []
      : [];
  const presetPath = selectedPath.length
    ? selectedPath
    : (reflection.activated_traits[0]?.pathToRoot ?? reflection.matches.exact[0]?.pathToRoot ?? []);
  const missingChecks = reflection.claim_boundaries.missing_evidence ?? [];
  const askUserActions = admission.actions.filter((action) => action.admission === "ask_user");
  const blockedActions = admission.actions.filter((action) => action.admission === "blocked");
  const firstAction = admission.actions[0] ?? null;
  const selectedProcedure = selectedNode?.proceduralRole
    ? `${labelize(selectedNode.proceduralRole)} ${selectedNode.procedureOperator ? `-> ${labelize(selectedNode.procedureOperator)}` : ""}`
    : mg("No procedure role mapped.");
  const selectedProcedureExpression = selectedNode?.proceduralExpression ?? mg("No procedural expression mapped.");
  const combinationOutcome = selectedCombinationOutcome(selectedNodes);
  const combinationExpression = selectedCombinationExpression(selectedNodes);
  const activeLens = MORAL_OBJECTIVE_LENSES.find((lens) => lens.id === activeLensId) ?? MORAL_OBJECTIVE_LENSES[0];
  return (
    <aside
      data-testid="moral-graph-objective-binding-overlay"
      className="pointer-events-auto absolute bottom-3 left-9 top-3 z-30 flex w-64 shrink-0 flex-col border border-zinc-800 bg-zinc-950/95 text-zinc-100 shadow-2xl"
    >
      <div className="border-b border-zinc-800 p-2.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-cyan-200">{mg("Objective Bindings")}</div>
        <h2 className="mt-0.5 text-base font-semibold leading-tight">{mg("MoralGraph")} {mg(activeLens.label)}</h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
          {activeLensId === "character"
            ? mg("A modeled figure is a subject binding: active badges, constraints, and procedural trace stay together.")
            : activeLensId === "answer"
              ? mg("The current answer is a read-only block: final draft, tool receipt, activated nodes, and authority boundary stay together.")
              : mg("Wisdom is the subject binding: objective state, constraints, selected badges, and procedural trace stay together.")}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {activeLensId === "wisdom" ? (
          <>
            <BindingBox title={mg("Subject")} label={mg("objective binding")} tone="slate" activeNodeIds={[reflection.graph.rootId]} onSelectNode={onSelectNode}>
              {labelize(reflection.graph.rootId)} {mg("is assembled from primitive design-language badges.")}
            </BindingBox>
            <BindingBox title={mg("Objective state")} label={labelize(fruition.result.posture)} tone="violet">
              <div className="space-y-1">
                <div className="text-[11px] opacity-80">{fruition.result.label}</div>
                <button data-helix-control-id="workstation.panel.moral-graph.moral-graph-panel.on-load-fruition" data-helix-interaction-kind="act" data-helix-authority-state="client_local"
                  type="button"
                  onClick={onLoadFruition}
                  className="mt-2 w-full rounded border border-violet-500/70 bg-violet-950/70 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-violet-100 hover:border-violet-200"
                >
                  {mg("Load to Fruition Calculator")}
                </button>
              </div>
            </BindingBox>
            <BindingBox title={mg("Bindings")} label={mg("primitive to subject")} tone="emerald" activeNodeIds={presetPath} onSelectNode={onSelectNode}>
              {presetPath.length > 0
                ? presetPath.map((nodeId) => labelize(nodeId)).join(" -> ")
                : mg("No preset path is available for the selected badge.")}
            </BindingBox>
            <BindingBox title={mg("Activated lenses")} label={mg("prompt state")} tone="cyan" activeNodeIds={activeLensIds} onSelectNode={onSelectNode}>
              {activeLensIds.length > 0
                ? reflection.matches.inferred_lenses.concat(reflection.matches.exact, reflection.matches.likely).slice(0, 3).map((match) => match.label).join(" / ")
                : mg("No deterministic lens badge is active.")}
            </BindingBox>
            <BindingBox title={mg("Badge procedure")} label={selectedNode?.proceduralRole ? labelize(selectedNode.proceduralRole) : "unmapped"} tone="cyan">
              <div className="space-y-1">
                <div className="font-mono text-[10px] leading-snug text-cyan-100">{selectedProcedureExpression}</div>
                <div className="text-[11px] opacity-80">{selectedProcedure}</div>
                <div className="text-[11px] opacity-80">
                  {selectedNode?.actionEffect ?? mg("Select a mapped badge to inspect how it contributes to the procedural action.")}
                </div>
                {selectedNode?.evidenceNeeds?.length ? (
                  <div className="text-[11px] opacity-80">Needs: {selectedNode.evidenceNeeds.map(labelize).join(", ")}</div>
                ) : null}
                {selectedNode?.refusesAuthority?.length ? (
                  <div className="text-[11px] opacity-80">Refuses: {selectedNode.refusesAuthority.map(labelize).join(", ")}</div>
                ) : null}
              </div>
            </BindingBox>
            <BindingBox
              title={mg("Safeguards")}
              label={mg("gate edges")}
              tone="amber"
              activeNodeIds={(reflection.action_gate_warnings ?? []).map((warning) => warning.gateId)}
              onSelectNode={onSelectNode}
            >
              {(reflection.action_gate_warnings ?? []).length > 0
                ? (reflection.action_gate_warnings ?? []).map((warning) => warning.requiredCheck ?? warning.warning).join(", ")
                : mg("No nearby safeguard badge is active.")}
            </BindingBox>
            <div className="grid grid-cols-2 gap-2">
              <BindingBox title={mg("Possible tensions")} label={mg("zone")} tone="violet">
                {reflection.tensions?.length
                  ? reflection.tensions.map((tension) => tension.description).join(" ")
                  : mg("No possible tension zone is flagged.")}
              </BindingBox>
              <BindingBox
                title={mg("Claim boundaries")}
                label={mg("diagnostic only")}
                tone="rose"
                activeNodeIds={missingChecks.map((item) => `missing:${item}`)}
                onSelectNode={onSelectNode}
              >
                {missingChecks.length > 0
                  ? missingChecks.map((item) => `${mg("Missing check:")} ${labelize(item)}`).join(" | ")
                  : mg("No missing check listed.")}
              </BindingBox>
            </div>
            <BindingBox
              title={mg("Procedural trace")}
              label={`${selectedNodes.length} badge${selectedNodes.length === 1 ? "" : "s"}`}
              tone="emerald"
              activeNodeIds={selectedNodes.map((node) => node.id)}
              onSelectNode={onSelectNode}
            >
              <div className="space-y-1">
                <div className="font-mono text-[10px] leading-snug text-emerald-100">{combinationExpression}</div>
                <div className="text-[11px] opacity-80">{combinationOutcome.label}</div>
                <div className="font-mono text-[10px] leading-snug text-violet-100">{fruition.expression}</div>
              </div>
            </BindingBox>
            <BindingBox title={mg("Authority boundary")} label={mg("evidence only")} tone="slate">
              <div className="space-y-1">
                <div className="text-xs font-semibold">
                  {selectedNode ? selectedNode.label : mg("No outer objective badge selected")}
                </div>
                <div className="text-[11px] opacity-80">
                  {selectedNode?.summary ?? mg("Select a badge to inspect its objective role.")}
                </div>
                <div className="text-[11px] opacity-80">
                  {mg("Admission state:")} {admission.summary.autoCount} {mg("auto /")} {admission.summary.askUserCount} {mg("ask user /")} {admission.summary.blockedCount} {mg("blocked")}
                </div>
                <div className="truncate text-[11px] opacity-80">
                  {mg("Evidence refs:")} {(admission.evidenceRefs ?? []).length > 0 ? admission.evidenceRefs?.join(", ") : mg("none")}
                </div>
                <div className="text-[11px] opacity-80">
                  {mg("Recommended next step:")} {firstAction ? firstAction.label : mg("none")}
                </div>
                <div className="text-[11px] opacity-80">
                  Risk: {labelize(firstAction?.risk ?? mg("unknown"))} {mg("/ Display policy:")} {labelize(firstAction?.display_policy ?? mg("diagnostic_only"))}
                </div>
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {askUserActions.length > 0 ? <span className="rounded border border-amber-600 px-1.5 py-0.5 text-amber-100">{mg("Ask user")}</span> : null}
                  {blockedActions.length > 0 ? <span className="rounded border border-rose-600 px-1.5 py-0.5 text-rose-100">{mg("Blocked")}</span> : null}
                  <span className="rounded border border-cyan-700 px-1.5 py-0.5 text-cyan-100">{mg("Evidence only")}</span>
                </div>
              </div>
            </BindingBox>
          </>
        ) : null}
        {activeLensId === "character" && characterComparison ? (
          <BindingBox
            title={mg("Subject")}
            label={characterDisplayLabel(characterComparison.characterId)}
            tone="amber"
            activeNodeIds={[
              `character:${characterComparison.characterId}`,
              ...characterComparison.activatedProfileWeights.slice(0, 5).map((entry) => entry.nodeId),
            ]}
            onSelectNode={onSelectNode}
          >
            <div className="space-y-2">
              <div className="font-semibold text-amber-50">
                {characterDisplayLabel(characterComparison.characterId)}
              </div>
              <div className="rounded border border-amber-500/50 bg-amber-950/40 p-2">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-amber-200">{mg("Objective state")}</div>
                <div className="text-[11px] opacity-90">{characterComparison.behavioralHypothesis.likelyChoice}</div>
              </div>
              <div className="rounded border border-amber-500/40 bg-black/20 p-2">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-amber-200">{mg("Bindings")}</div>
                <div className="font-mono text-[10px] leading-snug text-amber-100">
                  {mg("character.")}{proceduralToken(characterComparison.characterId)} {mg("weights activated badges =>")}{" "}
                  {labelize(characterComparison.predictedPosture)}
                </div>
                {characterComparison.matchedRules.slice(0, 3).map((rule) => (
                  <div key={rule.id} className="mt-1 text-[10px] opacity-80">
                    {labelize(rule.id)} {"->"} {labelize(rule.posture)} ({rule.confidence.toFixed(2)})
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {characterComparison.activatedProfileWeights.slice(0, 4).map((entry) => (
                  <span key={entry.nodeId} className="rounded border border-amber-500/40 bg-black/20 px-1.5 py-0.5 text-[9px]">
                    {labelize(entry.nodeId)} {entry.characterWeight.toFixed(2)}
                  </span>
                ))}
              </div>
              <div className="rounded border border-rose-500/40 bg-black/20 p-2">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-rose-200">{mg("Authority boundary")}</div>
                <div className="text-[11px] opacity-80">
                  Missing: {characterComparison.behavioralHypothesis.missingEvidence.map(labelize).join(", ")}
                </div>
              </div>
            </div>
          </BindingBox>
        ) : null}
        {activeLensId === "character" && !characterComparison ? (
          <BindingBox title={mg("Subject")} label={mg("no character binding")} tone="amber">
            {mg("No character preset comparison is attached to this graph view.")}
          </BindingBox>
        ) : null}
        {activeLensId === "answer" && currentAnswer ? (
          <>
            <BindingBox
              title={mg("Current answer")}
              label={currentAnswer.terminalArtifactKind}
              tone="cyan"
              activeNodeIds={currentAnswer.activatedNodeIds}
              onSelectNode={onSelectNode}
            >
              <div className="space-y-2">
                <div className="rounded border border-cyan-500/50 bg-cyan-950/40 p-2">
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-cyan-200">{mg("Final answer block")}</div>
                  <div className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap pr-1 text-[11px] leading-relaxed text-cyan-50">
                    {currentAnswer.finalAnswer || mg("No final answer text captured in the debug export.")}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="rounded border border-cyan-500/35 bg-black/20 p-1.5">
                    <div className="uppercase tracking-wide text-cyan-200">{mg("Source")}</div>
                    <div className="mt-0.5 font-mono text-cyan-50">{currentAnswer.finalAnswerSource}</div>
                  </div>
                  <div className="rounded border border-cyan-500/35 bg-black/20 p-1.5">
                    <div className="uppercase tracking-wide text-cyan-200">{mg("Route")}</div>
                    <div className="mt-0.5 font-mono text-cyan-50">{currentAnswer.route}</div>
                  </div>
                </div>
                <div className="rounded border border-cyan-500/35 bg-black/20 p-2">
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-cyan-200">{mg("Prompt")}</div>
                  <div className="mt-1 max-h-16 overflow-y-auto text-[11px] leading-relaxed opacity-85">
                    {currentAnswer.prompt || mg("No prompt captured.")}
                  </div>
                </div>
              </div>
            </BindingBox>
            <BindingBox
              title={mg("Activated nodes")}
              label={`${currentAnswer.activatedNodeIds.length} ${mg("nodes")}`}
              tone="emerald"
              activeNodeIds={currentAnswer.activatedNodeIds}
              onSelectNode={onSelectNode}
            >
              {currentAnswer.activatedLabels.length > 0
                ? currentAnswer.activatedLabels.slice(0, 6).map(labelize).join(" / ")
                : mg("The answer block captured node ids but no display labels.")}
            </BindingBox>
            <BindingBox
              title={mg("Tool trace")}
              label={currentAnswer.toolReceiptRef ?? mg("tool receipt")}
              tone="violet"
              activeNodeIds={currentAnswer.pathToRoot}
              onSelectNode={onSelectNode}
            >
              <div className="space-y-1.5">
                {currentAnswer.trace.length > 0 ? (
                  currentAnswer.trace.slice(0, 5).map((step) => (
                    <div key={`${step.step}:${step.reason}`} className="rounded border border-violet-500/30 bg-black/20 p-1.5">
                      <div className="font-mono text-[10px] text-violet-100">{labelize(step.step)}</div>
                      <div className="mt-0.5 text-[10px] opacity-80">{step.reason}</div>
                    </div>
                  ))
                ) : (
                  <div>{mg("No structured trace steps were captured for this answer block.")}</div>
                )}
              </div>
            </BindingBox>
            <BindingBox title={mg("Authority boundary")} label={mg("evidence only")} tone={currentAnswer.agentExecutable ? "rose" : "slate"}>
              <div className="space-y-1">
                <div className="text-[11px] opacity-80">
                  {mg("The block is a visualization of the Ask terminal answer and its MoralGraph evidence path.")}
                </div>
                <div className="font-mono text-[10px]">
                  evidence_only={String(currentAnswer.evidenceOnly)} agent_executable={String(currentAnswer.agentExecutable)}
                </div>
                <div className="truncate text-[10px] opacity-75">
                  draft_ref={currentAnswer.finalAnswerDraftRef ?? "none"} receipt_ref={currentAnswer.toolReceiptRef ?? "none"}
                </div>
              </div>
            </BindingBox>
          </>
        ) : null}
        {activeLensId === "answer" && !currentAnswer ? (
          <BindingBox title={mg("Current answer")} label={mg("empty")} tone="cyan">
            {mg("No MoralGraph Ask answer has been captured yet. Run a MoralGraph prompt, then copy or open the debug export to publish the current answer block.")}
          </BindingBox>
        ) : null}
      </div>
    </aside>
  );
}

export function MoralGraphPanel({
  reflection,
  admission,
  locator,
  characterComparison,
}: {
  reflection: IdeologyContextReflectionV1;
  admission: HelixRecommendedActionAdmissionV1;
  locator?: MoralBadgeLocatorV1;
  characterComparison?: CharacterSituationComparisonV1;
}) {
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(interfaceLanguage.code);
  const scrollportRef = useRef<HTMLDivElement | null>(null);
  const pendingZoomRef = useRef<{ center: { x: number; y: number }; zoom: number } | null>(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const fruition = useMemo(() => calculateFruitionFromReflection({ reflection, admission }), [admission, reflection]);
  const graph = useMemo(
    () => buildMoralGraphBiomeScaleViewModel({ reflection, admission, fruition, characterComparison }),
    [admission, characterComparison, fruition, reflection],
  );
  const dynamicTranslationTexts = useMemo(() => {
    const texts: string[] = [];
    for (const lane of graph.biomeLanes) {
      pushMoralGraphDynamicText(texts, lane.label);
      pushMoralGraphDynamicText(texts, lane.summary);
    }
    for (const lane of graph.scaleLanes) {
      pushMoralGraphDynamicText(texts, lane.label);
    }
    for (const cell of graph.cells) {
      pushMoralGraphDynamicText(texts, cell.label);
    }
    for (const edge of graph.edges) {
      pushMoralGraphDynamicText(texts, edge.label);
    }
    for (const node of graph.nodes) {
      pushMoralGraphDynamicText(texts, node.label);
      pushMoralGraphDynamicText(texts, node.summary);
      pushMoralGraphDynamicText(texts, node.proceduralExpression);
      pushMoralGraphDynamicText(texts, node.proceduralRole);
      pushMoralGraphDynamicText(texts, node.procedureOperator);
      pushMoralGraphDynamicText(texts, node.actionEffect);
      pushMoralGraphDynamicText(texts, node.actionManifestation.replace(/_/g, " "));
      pushMoralGraphDynamicText(texts, node.biomeReason);
      pushMoralGraphDynamicText(texts, node.biome.replace(/_/g, " "));
      pushMoralGraphDynamicText(texts, node.scaleBand.replace(/_/g, " "));
      pushMoralGraphDynamicText(texts, node.cadence.replace(/_/g, " "));
      pushMoralGraphDynamicText(texts, node.maturity.replace(/_/g, " "));
      for (const tag of node.tags ?? []) pushMoralGraphDynamicText(texts, tag.replace(/[_-]/g, " "));
      for (const need of node.evidenceNeeds ?? []) pushMoralGraphDynamicText(texts, need);
      for (const refusal of node.refusesAuthority ?? []) pushMoralGraphDynamicText(texts, refusal);
    }
    return texts;
  }, [graph]);
  const { translate: translateDynamicText } = useDynamicTextTranslations({
    locale: interfaceLanguage.bcp47,
    docPath: "workstation/moral-graph",
    title: "Moral Graph",
    texts: dynamicTranslationTexts,
    enabled: interfaceLanguage.code !== "en",
  });
  const mg = useCallback(
    (text: string) => {
      const catalogId = moralGraphCatalogId(text);
      if (!catalogId) return translateDynamicText(text);
      const catalogText = t(catalogId);
      if (interfaceLanguage.code !== "en" && catalogText === text) return translateDynamicText(text);
      return catalogText;
    },
    [interfaceLanguage.code, t, translateDynamicText],
  );
  const currentAnswer = useMoralGraphCurrentAnswerStore((store) => store.currentAnswerBlock);
  const loadFruitionExpression = useFruitionCalculatorStore((store) => store.loadExpression);
  const loadFruitionLocatorSeed = useFruitionCalculatorStore((store) => store.loadLocatorSeed);
  const probabilityTerrain = locator?.probabilityTerrain;
  const terrainNodes = useMemo(
    () =>
      buildMoralTerrainNodes({
        nodes: graph.nodes,
        locator,
        rootId: reflection.graph.rootId,
      }),
    [graph.nodes, locator, reflection.graph.rootId],
  );
  const terrainChunks = useMemo(() => buildMoralTerrainChunks(terrainNodes), [terrainNodes]);
  const locatorSeedNodeIds =
    locator?.comparisonSeed.selectedNodeIds.filter((id) => graph.nodes.some((node) => node.id === id)) ?? [];
  const initialSelectedNodeId = locatorSeedNodeIds[0] ?? reflection.graph.rootId;
  const initialSelectedNodeIds = locatorSeedNodeIds.length > 0 ? locatorSeedNodeIds : [];
  const [selectedNodeId, setSelectedNodeId] = useState<string>(initialSelectedNodeId);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(initialSelectedNodeIds);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [objectiveBindingsOpen, setObjectiveBindingsOpen] = useState(false);
  const [activeObjectiveLensId, setActiveObjectiveLensId] = useState<MoralObjectiveLensId>("wisdom");
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? graph.nodes[0] ?? null;
  const selectedBindingNodeIds =
    selectedNodeIds.length > 0 && !selectedNodeIds.includes(reflection.graph.rootId)
      ? [...selectedNodeIds, reflection.graph.rootId]
      : selectedNodeIds;
  const selectedNodes = selectedBindingNodeIds
    .map((id) => graph.nodes.find((node) => node.id === id))
    .filter((node): node is MoralGraphNode => Boolean(node));
  const hoveredNode = hoveredNodeId ? graph.nodes.find((node) => node.id === hoveredNodeId) ?? null : null;
  const evidenceHighlighted = new Set(
    objectiveBindingsOpen
      ? [
          ...(activeObjectiveLensId === "wisdom" ? reflection.overlay?.highlightedNodeIds ?? [] : []),
          ...(activeObjectiveLensId === "character" ? characterComparison?.activatedProfileWeights.map((entry) => entry.nodeId) ?? [] : []),
          ...(activeObjectiveLensId === "character" && characterComparison ? [`character:${characterComparison.characterId}`] : []),
          ...(activeObjectiveLensId === "answer" ? currentAnswer?.activatedNodeIds ?? [] : []),
        ]
      : [],
  );
  const selectionTrace = useMemo(
    () =>
      buildMoralGraphSelectionTraceViewModel({
        nodes: graph.nodes,
        edges: graph.edges,
        selectedNodeIds,
      }),
    [graph.nodes, graph.edges, selectedNodeIds],
  );
  const highlighted = new Set([
    ...evidenceHighlighted,
    ...selectionTrace.activeNodeIds,
    ...selectionTrace.candidateNodeIds,
    ...selectionTrace.conflictNodeIds,
    ...(selectedNodeIds.length > 0 && selectedNode?.tone !== "root" ? [reflection.graph.rootId] : []),
  ]);
  const hasFocus = highlighted.size > 0 || selectedNodeIds.length > 0;
  const zoomBounds = useMemo(() => {
    const fitZoom = viewportSize.width > 0 && viewportSize.height > 0
      ? Math.min(1, viewportSize.width / graph.width, viewportSize.height / graph.height)
      : MORAL_GRAPH_MIN_ZOOM_FLOOR;
    return {
      min: clamp(fitZoom, MORAL_GRAPH_MIN_ZOOM_FLOOR, 1),
      max: MORAL_GRAPH_MAX_ZOOM,
    };
  }, [graph.height, graph.width, viewportSize.height, viewportSize.width]);
  const graphCenterForViewport = useCallback(() => {
    const element = scrollportRef.current;
    if (!element) return { x: graph.width / 2, y: graph.height / 2 };
    return {
      x: (element.scrollLeft + element.clientWidth / 2) / mapZoom,
      y: (element.scrollTop + element.clientHeight / 2) / mapZoom,
    };
  }, [graph.height, graph.width, mapZoom]);
  const centerScrollOnGraphPoint = useCallback((center: { x: number; y: number }, nextZoom: number) => {
    const element = scrollportRef.current;
    if (!element) return;
    element.scrollLeft = Math.max(0, center.x * nextZoom - element.clientWidth / 2);
    element.scrollTop = Math.max(0, center.y * nextZoom - element.clientHeight / 2);
  }, []);
  const setZoomAroundViewportCenter = useCallback(
    (targetZoom: number) => {
      const nextZoom = Number(clamp(targetZoom, zoomBounds.min, zoomBounds.max).toFixed(4));
      if (Math.abs(nextZoom - mapZoom) < 0.001) return;
      pendingZoomRef.current = { center: graphCenterForViewport(), zoom: nextZoom };
      setMapZoom(nextZoom);
    },
    [graphCenterForViewport, mapZoom, zoomBounds.max, zoomBounds.min],
  );
  const zoomOut = useCallback(() => {
    setZoomAroundViewportCenter(mapZoom / MORAL_GRAPH_ZOOM_STEP);
  }, [mapZoom, setZoomAroundViewportCenter]);
  const zoomIn = useCallback(() => {
    setZoomAroundViewportCenter(mapZoom * MORAL_GRAPH_ZOOM_STEP);
  }, [mapZoom, setZoomAroundViewportCenter]);
  useEffect(() => {
    const element = scrollportRef.current;
    if (!element) return;
    const updateSize = () => {
      setViewportSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setMapZoom((current) => clamp(current, zoomBounds.min, zoomBounds.max));
  }, [zoomBounds.max, zoomBounds.min]);
  useLayoutEffect(() => {
    const pending = pendingZoomRef.current;
    if (!pending || Math.abs(pending.zoom - mapZoom) > 0.001) return;
    pendingZoomRef.current = null;
    centerScrollOnGraphPoint(pending.center, mapZoom);
  }, [centerScrollOnGraphPoint, mapZoom]);
  const addNodeToSelection = (id: string) => {
    setSelectedNodeId(id);
    setSelectedNodeIds((current) => (current.includes(id) ? current : [...current, id]));
  };
  const toggleNodeSelection = (id: string) => {
    setSelectedNodeId(id);
    setSelectedNodeIds((current) => {
      if (!current.includes(id)) return [...current, id];
      if (current.length === 1) return current;
      return current.filter((selectedId) => selectedId !== id);
    });
  };
  const clearUserSelection = () => {
    setSelectedNodeIds([]);
    setSelectedNodeId(reflection.graph.rootId);
  };
  const loadToFruitionCalculator = () => {
    if (locator) {
      loadFruitionLocatorSeed(locator, { source: "moral_badge_graph" });
    } else {
      loadFruitionExpression(fruition, { source: "moral_badge_graph" });
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-helix-panel", { detail: { id: "fruition-calculator" } }));
    }
  };

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-zinc-900 text-zinc-950" data-testid="moral-graph-panel">
      <div className="flex min-w-0 flex-1 flex-col bg-zinc-900">
        <div className="relative min-h-0 flex-1 overflow-hidden bg-zinc-900">
          <div
            aria-label={mg("MoralGraph objective lenses")}
            className="absolute bottom-0 left-0 top-0 z-40 flex w-9 shrink-0 flex-col items-center gap-2 border-r border-zinc-950 bg-zinc-950 px-1.5 py-2"
          >
            {MORAL_OBJECTIVE_LENSES.map((lens) => {
              const active = objectiveBindingsOpen && activeObjectiveLensId === lens.id;
              return (
                <button data-helix-control-id="workstation.panel.moral-graph.moral-graph-panel.set-active-objective-lens-id-lens-id-set-objective-bindings-open-open-ac" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
                  key={lens.id}
                  type="button"
                  aria-label={mg(lens.title)}
                  title={mg(lens.title)}
                  onClick={() => {
                    setActiveObjectiveLensId(lens.id);
                    setObjectiveBindingsOpen((open) => (active ? false : true));
                  }}
                  className={`flex h-6 w-6 items-center justify-center border-2 text-[11px] font-black text-white shadow ${
                    active
                      ? "border-cyan-100 ring-2 ring-cyan-300"
                      : "border-zinc-800 opacity-80 hover:border-cyan-200"
                  } ${lens.tone}`}
                >
                  {lens.glyph}
                </button>
              );
            })}
          </div>
          {objectiveBindingsOpen ? (
            <ObjectiveBindingRail
              activeLensId={activeObjectiveLensId}
              reflection={reflection}
              admission={admission}
              fruition={fruition}
              locator={locator}
              characterComparison={characterComparison}
              currentAnswer={currentAnswer}
              selectedNode={selectedNode}
              selectedNodes={selectedNodes}
              onSelectNode={addNodeToSelection}
              onLoadFruition={loadToFruitionCalculator}
              translateText={mg}
            />
          ) : null}
          <div
            ref={scrollportRef}
            data-testid="moral-graph-map-scrollport"
            data-zoom-level={mapZoom.toFixed(4)}
            className="relative h-full min-h-0 w-full overflow-scroll border border-zinc-950 bg-zinc-900"
            style={{ scrollbarGutter: "stable both-edges" }}
          >
            <div
              className="relative"
              style={{
                width: graph.width * mapZoom,
                height: graph.height * mapZoom,
              }}
            >
              <div
                className="relative origin-top-left"
                style={{
                  width: graph.width,
                  height: graph.height,
                  transform: `scale(${mapZoom})`,
                }}
              >
                <MoralGraphBiomeMap
                  graph={graph}
                  highlighted={highlighted}
                  hasFocus={hasFocus}
                  selectedNodeIds={selectedNodeIds}
                  selectionTrace={selectionTrace}
                  hoveredNode={hoveredNode}
                  zoom={mapZoom}
                  probabilityByNodeId={probabilityTerrain?.candidateProbabilityById}
                  translateText={mg}
                  onHoverNode={(id) => setHoveredNodeId(id)}
                  onClearSelection={clearUserSelection}
                  onToggleNode={(id, node) => {
                    toggleNodeSelection(id);
                    if (node.tone === "character") {
                      setActiveObjectiveLensId("character");
                      setObjectiveBindingsOpen(true);
                    }
                  }}
                />
                <ProbabilityTerrainOverlay
                  terrain={probabilityTerrain}
                  nodes={terrainNodes.map((node) => ({
                    id: node.id,
                    x: node.x,
                    y: node.y,
                    width: node.width ?? 48,
                    height: node.height ?? 48,
                    renderChunkId: node.renderChunkId,
                    semanticChunkId: node.semanticChunkId,
                  }))}
                  chunks={terrainChunks}
                  width={graph.width}
                  height={graph.height}
                  seed={`${reflection.reflectionId}:moral-probability-terrain`}
                    testId="moral-graph-probability-terrain-field"
                />
                {probabilityTerrain ? (
                  <div
                    data-testid="moral-graph-probability-terrain"
                    className="pointer-events-none absolute right-4 top-4 z-30 max-w-[300px] border border-cyan-400/40 bg-zinc-950/90 p-3 text-xs text-cyan-50 shadow-2xl shadow-cyan-950/30"
                  >
                    <div className="font-semibold uppercase tracking-[0.12em] text-cyan-200">{mg("Probability Terrain")}</div>
                    <div className="mt-1 text-zinc-300">
                      {mg("Placement certainty")} {(probabilityTerrain.placementCertainty * 100).toFixed(1)}% /{" "}
                      {labelize(probabilityTerrain.uncertaintyMode)}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-zinc-400">
                      {mg("H(post)=")}{probabilityTerrain.posteriorEntropyBits.toFixed(3)} {mg("bits / gain=")}
                      {probabilityTerrain.informationGainBits.toFixed(3)} {mg("bits")}
                    </div>
                    {probabilityTerrain.dominantSemanticChunkId ? (
                      <div className="mt-1 truncate text-[10px] text-zinc-500">
                        {labelize(probabilityTerrain.dominantSemanticChunkId)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div
            aria-label={mg("Moral graph zoom controls")}
            className="pointer-events-auto absolute bottom-4 right-4 z-50 flex gap-2"
          >
            <button data-helix-control-id="workstation.panel.moral-graph.moral-graph-panel.button" data-helix-interaction-kind="navigate" data-helix-authority-state="client_local"
              type="button"
              aria-label={mg("Zoom out")}
              title={mg("Zoom out")}
              onClick={zoomOut}
              disabled={mapZoom <= zoomBounds.min + 0.001}
              className="flex h-10 w-10 items-center justify-center border border-zinc-500 bg-zinc-950/90 text-2xl font-semibold leading-none text-zinc-100 shadow-lg transition hover:border-cyan-300 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              -
            </button>
            <button data-helix-control-id="workstation.panel.moral-graph.moral-graph-panel.button.2" data-helix-interaction-kind="navigate" data-helix-authority-state="client_local"
              type="button"
              aria-label={mg("Zoom in")}
              title={mg("Zoom in")}
              onClick={zoomIn}
              disabled={mapZoom >= zoomBounds.max - 0.001}
              className="flex h-10 w-10 items-center justify-center border border-zinc-500 bg-zinc-950/90 text-2xl font-semibold leading-none text-zinc-100 shadow-lg transition hover:border-cyan-300 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MoralGraphPanel;
