import { useEffect, useMemo, useRef, useState } from "react";
import { feature as topojsonFeature } from "topojson-client";
import type {
  CivilizationInfrastructureEdgeV1,
  CivilizationBoundaryClaimV1,
  CivilizationMappedNetworkRouteCandidateV1,
  CivilizationNaturalHazardNoticeV1,
  CivilizationBoundaryLineAssertionV1,
  CivilizationHydrographicLineV1,
  CivilizationTraversabilityRouteModeV1,
} from "@shared/civilization-traversability-atlas";
import { validateCivilizationTraversabilityAtlasV1 } from "@shared/civilization-traversability-atlas";
import {
  validateCivilizationSourceMeasurementCollectionV1,
  type CivilizationSourceMeasurementV1,
} from "@shared/civilization-source-measurement";
import type { CivilizationNationStateVector } from "@/data/civilizationNationStateVectors";
import {
  CIVILIZATION_NATION_STATE_VECTORS,
} from "@/data/civilizationNationStateVectors";
import { CivilizationDiplomacyOverlay, type Unga81Affiliation } from "./CivilizationDiplomacyOverlay";
import {
  CIVILIZATION_GEOSPATIAL_CONFIG_CHANGED_EVENT,
  loadCivilizationMapsBrowserKey,
} from "./civilizationGeospatialClientConfig";

const GEO_URL = new URL("../../assets/world-countries.json", import.meta.url).href;
const MAPPED_NETWORK_KINDS = ["pipeline", "road", "rail", "waterway", "power", "telecom"] as const;
const currentLocalDateTime = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
type MappedNetworkKind = (typeof MAPPED_NETWORK_KINDS)[number];
type MapClickPosition = { lat(): number; lng(): number };
type MapBbox = [number, number, number, number];
const RAMSAR_PILOT_BBOX: MapBbox = [42, 37, 51, 43];

function bboxOverlaps(first: MapBbox, second: MapBbox): boolean {
  return first[0] <= second[2] && first[2] >= second[0] &&
    first[1] <= second[3] && first[3] >= second[1];
}

function validViewportBbox(bbox: MapBbox, maxSpan: number): boolean {
  return bbox.every(Number.isFinite) && bbox[0] < bbox[2] && bbox[1] < bbox[3] &&
    bbox[2] - bbox[0] <= maxSpan && bbox[3] - bbox[1] <= maxSpan;
}

function paddedViewportBbox(bbox: MapBbox, maxSpan: number): MapBbox {
  const width = bbox[2] - bbox[0];
  const height = bbox[3] - bbox[1];
  const horizontalPad = Math.max(0, Math.min(width * 0.25, (maxSpan - width) / 2));
  const verticalPad = Math.max(0, Math.min(height * 0.25, (maxSpan - height) / 2));
  return [Math.max(-180, bbox[0] - horizontalPad), Math.max(-90, bbox[1] - verticalPad),
    Math.min(180, bbox[2] + horizontalPad), Math.min(90, bbox[3] + verticalPad)];
}

function viewportCovered(requested: MapBbox, visible: MapBbox): boolean {
  const width = requested[2] - requested[0];
  const height = requested[3] - requested[1];
  return visible[0] >= requested[0] && visible[1] >= requested[1] &&
    visible[2] <= requested[2] && visible[3] <= requested[3] &&
    visible[2] - visible[0] > width * 0.45 && visible[3] - visible[1] > height * 0.45;
}

type GoogleFeature = {
  getProperty(name: string): unknown;
};

type GoogleMapInstance = {
  getBounds(): {
    getSouthWest(): { lat(): number; lng(): number };
    getNorthEast(): { lat(): number; lng(): number };
  } | null;
  data: {
    addGeoJson(value: unknown): unknown;
    setStyle(style: (feature: GoogleFeature) => Record<string, unknown>): void;
    addListener(event: string, callback: (event: { feature: GoogleFeature; latLng?: MapClickPosition }) => void): { remove(): void };
  };
  addListener(event: string, callback: (event: { latLng?: MapClickPosition }) => void): { remove(): void };
};

type GoogleOverlay = {
  setMap(map: GoogleMapInstance | null): void;
  addListener?(event: string, callback: (event: { latLng?: MapClickPosition }) => void): { remove(): void };
};
type GoogleDataOverlay = {
  setMap(map: GoogleMapInstance | null): void;
  addGeoJson(value: unknown): unknown;
  setStyle(style: Record<string, unknown>): void;
  addListener(event: string, callback: (event: { feature: GoogleFeature; latLng?: MapClickPosition }) => void): { remove(): void };
};

type RamsarMapOverlayUi = {
  schemaVersion: "civilization_ramsar_map_overlay/v1";
  coverageScope: "five_armenia_azerbaijan_pilot_ramsar_sites_only";
  source: { url: string; licenseUrl: string; acquiredAt: string; rawResponseSha256: string;
    missingBoundarySiteNumbers: number[]; geometryEffectiveAt: null; interpretationLimit: string };
  geojson: { type: "FeatureCollection"; features: Array<{ type: "Feature"; id: string;
    properties: { siteNumber: number; countryIso3: "ARM" | "AZE"; name: string; sourceFeatureId: string };
    geometry: { type: "MultiPolygon"; coordinates: number[][][][] } }> };
};
type NaturalEarthLakeUi = {
  featureId: number; label: string; featureClass: string; scaleRank: number; minZoom: number;
  bbox: MapBbox; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  sourceRecordUrl: string; sourceEffectiveAt: null;
};
type PortCandidateUi = {
  osmType: "node" | "way" | "relation"; osmId: number; label: string;
  position: { lat: number; lon: number }; positionKind: "mapped_node" | "element_bbox_center";
  sourceRecordUrl: string; sourceEditedAt: string | null; sourceTags: Record<string, string>;
};
type WorldPortIndexUi = {
  objectId: number; wpiNumber: number; name: string; unlocode: string | null; harborUse: string | null;
  position: { lat: number; lon: number }; sourceRecordUrl: string;
  facilities: { container: "yes" | "no" | "unknown"; oilTerminal: "yes" | "no" | "unknown";
    lngTerminal: "yes" | "no" | "unknown"; liquidBulk: "yes" | "no" | "unknown" };
  publishedDimensions: { channelDepthM: number | null; maxVesselDraftM: number | null };
};

type RouteBoundaryLineReviewUi = {
  status: "not_requested" | "no_candidate" | "unavailable" | "available";
  errorCode?: string;
  possiblyTruncated?: boolean;
  source?: { sourceRecordUrl: string; sourceRevisionAt: string };
  encounters?: Array<{
    candidateId: string;
    routeSegmentIndex: number;
    mappedEdgeId: string;
    lineId: string;
    lineLabel: string;
    recordCategory: string;
    sourceClaimLabel: string | null;
    sourceComment: string | null;
    adjacentAdministrativeIso3: [string | null, string | null];
    viewpointClassifications: Record<string, string>;
    sourceEffectiveAt: null;
    contactKind: "point" | "overlap";
    position: { lat: number; lon: number };
    lineSourceRecordUrl: string;
  }>;
};

type RouteHydrographyReviewUi = {
  status: "not_requested" | "no_candidate" | "unavailable" | "available";
  errorCode?: string;
  possiblyTruncated?: boolean;
  source?: { sourceArchiveUrl: string; datasetVersion: string; snapshotAcquiredAt: string };
  encounters?: Array<{
    candidateId: string;
    routeSegmentIndex: number;
    hydrographicLineId: string;
    hydrographicFeatureKind: "river" | "lake_centerline";
    hydrographicLabel: string;
    contactKind: "point" | "overlap";
    position: { lat: number; lon: number };
    sourceRecordUrl: string;
  }>;
};
type RouteLakeReviewUi = {
  status: "not_requested" | "no_candidate" | "unavailable" | "available";
  errorCode?: string; possiblyTruncated?: boolean;
  source?: { sourceArchiveUrl: string; datasetVersion: string; snapshotAcquiredAt: string };
  contacts?: Array<{ candidateId: string; segmentIndex: number; lakeFeatureId: number;
    lakeLabel: string; contactKind: "outline_point" | "outline_overlap" | "inside_depiction";
    position: { lat: number; lon: number }; sourceRecordUrl: string }>;
  missingEvidence: string[];
};

type MappedGapReviewUi = {
  status: string; searchExhaustive: boolean;
  hypotheses: Array<{ networkKind: string; fromNodeRef: string; toNodeRef: string;
    straightLineDistanceKm: number; fromSourceRecordUrl: string; toSourceRecordUrl: string }>;
};

type DiplomaticCorridorPacketUi = {
  schemaVersion: "civilization_diplomatic_corridor_packet/v17";
  collectedAt: string;
  query: { question: string; countryIso3s: string[]; route: { evaluatedAt: string } };
  route: { status: "available" | "unavailable"; gapReview?: MappedGapReviewUi; candidates?: Array<{ candidateId: string; optionIndex: number;
    designatedWetlands: { sites: Array<{ siteNumber: number; relation: string }> };
    ramsarAreaReview: ProposedCorridorScreenUi["ramsarAreaReview"];
    terrestrialDepictions: ProposedCorridorScreenUi["terrestrialDepictions"] }>;
    lakeReview?: RouteLakeReviewUi };
  proposedCorridor: {
    status: "not_requested" | "unavailable" | "available";
    errorCode?: string;
    missingEvidence?: string[];
    screen?: ProposedCorridorScreenUi;
  };
  mappedGapScreens: Array<{
    status: "available" | "unavailable";
    errorCode?: string;
    hypothesis?: MappedGapReviewUi["hypotheses"][number];
    screen?: ProposedCorridorScreenUi;
  }>;
  countries: Array<{
    countryIso3: string;
    status: "available" | "unavailable";
    routeGeometryReview?: {
      status: "available" | "no_candidate" | "route_unavailable";
      encounters?: Array<{
        candidateId: string;
        routeSegmentIndex: number;
        boundaryId: string;
        contactKind: "point" | "overlap";
        position: { lat: number; lon: number };
        sourceRecordUrl: string;
        sourceYearRepresented: string;
      }>;
      possiblyTruncated?: boolean;
      missingEvidence: string[];
    };
  }>;
  sourceLedger: Array<{
    sourceId: string;
    status: string;
    sourceRecordUrl: string | null;
    sourceTime: string | null;
    sourceTimeMeaning: string;
    retrievedAt: string | null;
    license: string | null;
  }>;
  temporalReview?: Array<{
    sourceId: string;
    sourceTime: string | null;
    sourceTimeMeaning: string;
    metadataRelationToEvaluation: "before" | "after" | "same_calendar_day" | "same_calendar_year" | "unknown";
    validityAtEvaluation: "unverified";
    limitation: string;
  }>;
  unresolved: string[];
  interpretationLimits: string[];
};

type ScenarioGovernmentConditionUi = { recordId: string; parties: string[]; legalStatus: string; statusAsOf: string;
  sourceUrl: string; conditions: string[];
  plannedJointVenture: null | { status: string; sourceSection: string;
    initialOwnership: Array<{ stakeholder: string; percent: number }>;
    conditionalExtension: { initialTermYears: number; additionalTermYears: number; armeniaOwnershipPercentOnExtension: number; condition: string };
    interpretationLimit: string };
  reportedMeasures: Array<{ metric: string; value: number; unit: string; qualifier: string; period: string; independentVerification: "not_verified" }>;
  thirdPartyDependencies: Array<{ partyIso3: string | null; role: string }> };
type ScenarioWaterwayContactUi = { lineId: string; label: string;
  featureKind: "river" | "lake_centerline"; contactKind: "point" | "overlap";
  alignmentSegmentIndex: number; position: { lat: number; lon: number };
  sourceRecordUrl: string;
  interpretation: "generalized_cartographic_contact_not_verified_water_crossing_or_effect" };
type ScenarioLakeContactUi = { lakeFeatureId: number; label: string;
  contactKind: "outline_point" | "outline_overlap" | "inside_depiction";
  alignmentSegmentIndex: number; position: { lat: number; lon: number };
  sourceRecordUrl: string; routeEvidenceRefs: string[];
  interpretation: "generalized_polygon_contact_not_current_water_or_effect" };
type ScenarioInfrastructureScreenUi = {
  status: "not_applicable_no_route" | "mapped_topology_candidate" | "sketch_way_contacts" | "not_requested" | "area_too_large" | "unavailable";
  networkKinds: string[]; mappedSegmentCount: number | null;
  mappedWays: Array<{ edgeId: string; networkKind: string; sourceRecordUrl: string; evidenceRefs: string[] }>;
  networkTransitionCount: number;
  networkTransitions: Array<{ alignmentSegmentIndex: number; fromKind: string; toKind: string; nodeRef: string;
    position: { lat: number; lon: number }; fromSourceRecordUrl: string; toSourceRecordUrl: string;
    relation: "shared_osm_node_only"; facilityStatus: "unverified" }>;
  networkTransitionsOmitted: boolean;
  pipelineTagReview: { status: "not_applicable" | "all_untagged" | "partially_tagged" | "all_tagged_same_text" | "tagged_values_differ";
    wayCount: number; untaggedWayCount: number; distinctSubstanceTags: string[];
    ways: Array<{ edgeId: string; sourceRecordUrl: string; substanceTag: string | null }>;
    waysOmitted: boolean; productCompatibility: "unverified"; flowDirection: "unverified" };
  sketchContacts: Array<{ sketchSegmentIndex: number; edgeId: string; networkKind: string; contactKind: "point" | "overlap";
    position: { lat: number; lon: number }; sourceRecordUrl: string; sourceEditedAt: string | null }>;
  possiblyTruncated: boolean; sourceSnapshotAt: string | null; fetchedAt: string | null; sourceUrls: string[];
};

type ScenarioScreeningCountUi = { status: "available" | "partial" | "unavailable" | "not_requested";
  observedCount: number | null; possiblyTruncated: boolean; sourceUrls: string[] };

type ScenarioComparisonUi = {
  schemaVersion: "civilization_diplomatic_scenario_comparison/v130";
  query: Record<string, unknown>;
  comparisonStatus: string;
  provisionalPairReviewLeads: { countries: Array<{ countryIso3: string; officialPageUrls: string[];
    submittedPdfUrls: string[]; indexedProvisionalStatementCount: number; selectedReviewedAssertionCount: number;
    submittedTextStatus: string; nextReviewStage: string; nextReviewReason: string;
    submittedPageLeads: { status: string; sources: Array<{ sourceUrl: string; officialPageUrl: string;
      status: string; extractedTextQuality: string; totalMatchedPassages: number;
      candidateListTruncated: boolean; rankedPages: Array<{ page: number; candidateCount: number;
        cues: string[] }>; additionalCandidatePagesNotShown: number }> };
    topicLeads: Array<{ topic: string; keywordSentenceMentions: number; matchingSegmentCount: number;
      leadingSegments: Array<{ date: string; sourceUrl: string; statementNumber: number; keywordSentenceMentions: number }> }> }>;
    missingEvidence: string[] };
  corridorScalePlan: { status: "not_requested" } | { status: "planned"; plan: {
    query: { vertices: Array<{ lat: number; lon: number }>; intendedUse: string;
      countryIso3s: string[]; mappedInfrastructureKinds: string[]; contemplatedModes: string[];
      includeTerrainPointObservations: boolean; includeGlobalReliefObservations: boolean;
      evaluatedAt: string; maxWindows: number };
    coverage: { status: "all_sketch_segments_planned" | "window_budget_exhausted";
      plannedWindowCount: number; requiredWindowCount: number; unplannedWindowCount: number;
      evidenceAcquired: false; missingEvidence: string[] };
    windows: Array<{ sequence: number; sketchSegmentIndex: number; bbox: [number, number, number, number] }>;
    interpretation: string;
  } };
  corpusCoverage: {
    indexedDelegationPages: number; delegationPagesWithHashMatchedSelectedBrief: number;
    selectedReviewedAssertionCount: number; fullSpeechAssertionReviewStatus: "not_issued_in_current_manifest";
    selectedCountries: Array<{ countryIso3: string; officialPageCount: number; reviewedAssertionCount: number;
      submittedTextStatus: string; deliveryStatus: string; nextReviewStage: string; nextReviewReason: string;
      dateCrosscheck: { officialPageDates: string[]; provisionalTranscriptDates: string[];
        submittedDocumentDate: string | null; submittedDocumentDatePageUrl: string | null;
        submittedDocumentDateStatus: "not_recorded" | "source_not_admitted" | "official_page_date_missing" | "matches_official_page" | "differs_from_official_page" };
      sourceUrls: string[] }>;
    topicCoverage: Array<{ id: string; label: string; countriesWithAdmittedSelectedAssertionsCount: number;
      selectedPairCountriesWithAdmittedAssertions: string[] }>;
    interpretation: string;
  };
  frontierReadiness: { status: "not_established_outcomes_and_permissions_unverified";
    observationOptionIds: string[]; unscopedPlaceholderOptionIds: string[]; interpretation: string;
    possibilityCoverage: { mappedKinds: Array<{ kind: "road" | "rail" | "pipeline" | "power" | "telecom" | "waterway";
      returnedInOptionScreens: boolean; meaning: string }>;
      outsideMappedTopology: Array<{ family: "maritime_shipping" | "aviation_cargo" | "unbuilt_or_policy_design";
        currentEvidenceScope: string; nextEvidenceQuestion: string }>;
      interpretation: string };
    domains: Array<{ comparisonDomain: "connectivity_policy" | "peace_process_policy" | "natural_system_policy" | "humanitarian_policy" | "connectivity_infrastructure";
      optionIds: string[]; status: "one_option_no_within_domain_comparison" | "outcomes_and_gates_unverified";
      comparisonBasisQuestion: string;
      objectiveCoverage: Array<{ objective: string; boundedMappedLengthOptionIds: string[];
        unquantifiedOptionIds: string[]; notApplicableOptionIds: string[];
        measurementPlans: Array<{ optionId: string; readinessStatus: "bounded_mapped_length_only" | "not_quantified";
          measurementQuestion: string; actorToConsult: string; contextSourceUrls: string[] }> }>;
      openGateIds: string[] }> };
  optionInteractionReview: { status: "conditional_relationships_not_outcome_comparisons";
    interpretation: string;
    links: Array<{ firstOptionId: string; secondOptionId: string;
      relation: "policy_may_complement_built_service" | "rail_road_possible_substitutes_for_defined_demand" |
        "mapped_alignments_alternatives_for_same_corridor_question" |
        "screened_gap_questions_for_same_corridor" | "caller_sketch_and_gap_question_for_same_corridor" |
        "natural_topic_may_require_route_specific_review";
      evidenceSourceUrls: string[]; conditionsToEvaluate: string[]; missingComparableEvidence: string[];
      status: "hypothesis_only_not_established"; inferenceLimit: string }> };
  screenedGeometryComparison: Array<{ optionId: string; kind: string;
    sourceDepictedCountryContacts: ScenarioScreeningCountUi;
    selectedCountryOutlineContacts: ScenarioScreeningCountUi;
    editorialBoundaryLineContacts: ScenarioScreeningCountUi;
    hydrographicLineContacts: ScenarioScreeningCountUi;
    lakeOutlineContacts: ScenarioScreeningCountUi;
    publishedWetlandContacts: ScenarioScreeningCountUi;
    mappedTerrestrialContacts: ScenarioScreeningCountUi;
    reliefGrid: { status: string; availableCells: number | null; attemptedCells: number;
      sampledMinHeightMeters: number | null; sampledMaxHeightMeters: number | null; sourceUrls: string[] };
    serviceAndOutcomeComparability: "not_established"; interpretation: string }>;
  timeFrame: { goodsObservationYear: number; corridorEvidenceEvaluatedAt: string | null;
    planningHorizonYear: number; status: "caller_declared_horizon"; interpretation: string;
    sourceTimeline: Array<{ sourceId: string; sourceKind: string; sourceTime: string | null; sourceTimeMeaning: string; sourceUrl: string; validityAtPlanningHorizon: "unverified" }> };
  countryPair: { thirdPartyPositions: Array<{ countryIso3: string; speaker: string; speakerAttributionSource: "submitted_pdf_and_official_page" | "official_page_only"; speechDate: string; assertions: Array<{ id: string; text: string; sourceUrl: string }> }> };
  issueComparison: { datedNegotiatingConditions: Array<{ id: string; comparisonStatus: string; interpretation: string; nextQuestion: string;
    positions: Array<{ countryIso3: string; sourceDate: string; sourceUrl: string; paraphrase: string; limit: string }> }>;
    reviewedPositionProjectLinks: Array<{ assertionId: string; assertionCountryIso3: string;
      assertionSourceUrl: string; assertionSourcePage: number; milestoneId: string; milestoneSourceUrl: string;
      reviewQuestion: string; inferenceLimit: string }>;
    thirdPartyCoverageGaps: Array<{ countryIso3: string; officialPageUrl: string | null; interpretation: string }>;
    thirdPartyPerspectives: Array<{ countryIso3: string; relevanceToPair: { status: string; interpretation: string;
    selectedPartyAssertionIds: string[]; thirdPartyAssertionIds: string[]; optionSpecificConsent: "not_established" };
    assertions: Array<{ id: string; sourceUrl: string; sourcePage: number }> }>;
    facets: Array<{
    id: string; label: string; facetKind: "cooperation_topic" | "stated_safety_concern" | "stated_humanitarian_concern" | "stated_trust_concern" | "stated_jurisdiction_principle"; comparison: string;
    comparisonBasis: "pair_specific_editorial_crosswalk" | "parallel_reviewed_topic_inventory";
    routeEndpointGate: "not_applicable" | "blocked_pending_delivered_wording_review";
    contrast: { sharedPublicTopic: string | null; differenceInSubmittedClaims: string | null;
      directTensionStatus: string; evidenceAssertionIds: string[]; missingCountryIso3s: string[];
      framingDifference: { status: string; description: string | null; evidenceAssertionIds: string[]; inferenceLimit: string } };
    positions: Array<{ id: string; countryIso3: string; sourceLanguage: string; text: string; sourceUrl: string; sourcePage: number;
      provisionalReconciliation: { alignment: "topic_consistent" | "wording_discrepancy" | "not_reconciled";
        recordingReview: null | { sourceUrl: string; status: "linked_from_un_transcript_page_not_reviewed" } } }>;
  }> };
  humanitarianIssueComparison: { facets: Array<{
    id: string; label: string; comparison: string;
    comparisonBasis: "pair_specific_editorial_crosswalk" | "parallel_reviewed_topic_inventory";
    contrast: { sharedPublicTopic: string | null; differenceInSubmittedClaims: string | null; missingCountryIso3s: string[] };
    positions: Array<{ id: string; countryIso3: string; sourceLanguage: string; text: string; sourceUrl: string; sourcePage: number }>;
    unansweredQuestion: string;
  }> };
  naturalSystemIssueComparison: { namedNaturalSystemReview: { status: "not_applicable" | "named_references_incomplete" | "shared_named_reference" | "different_named_references";
    references: Array<{ countryIso3: string; assertionId: string; systemId: string; label: string; sourceUrl: string }>;
    sharedSystemIds: string[]; interpretation: string }; facets: Array<{
    id: string; label: string; comparison: string;
    comparisonBasis: "pair_specific_editorial_crosswalk" | "parallel_reviewed_topic_inventory";
    contrast: { sharedPublicTopic: string | null; differenceInSubmittedClaims: string | null; missingCountryIso3s: string[] };
    positions: Array<{ id: string; countryIso3: string; sourceLanguage: string; text: string; sourceUrl: string; sourcePage: number }>;
    unansweredQuestion: string;
  }> };
  optionDiscussionBasis: Array<{ optionId: string;
    status: "dated_observation_only" | "unscoped_baseline_placeholder" | "source_grounded_policy_question" |
      "cited_unlocated_concept" | "mapped_geometry_question";
    rationale: string;
    reviewedPositionBasis: Array<{ countryIso3: string; assertionId: string; sourceUrl: string;
      sourcePage: number; reviewRevision: number; role: string }>;
    governmentRecordBasis: Array<{ recordId: string; sourceUrl: string; role: string }>;
    basisSourceUrls: string[]; interpretation: string }>;
  options: Array<{
    id: string; kind: string; comparisonDomain: "dated_observation" | "connectivity_policy" | "peace_process_policy" | "natural_system_policy" | "humanitarian_policy" | "connectivity_infrastructure";
    evidenceState: string; mappedDistanceKm: number | null;
    concept: null | { family: "rail_restoration" | "rail_connection" | "road_link" | "pipeline_link" | "electricity_link" | "fiberoptic_link";
      origin: { kind: "reviewed_submitted_assertion"; countryIso3: string; namedCounterpartIso3: string | null; assertionId: string;
        claimType: string; sourceUrl: string; deliveredWordingStatus: "not_reconciled" }
        | { kind: "conditional_government_framework"; recordId: string; parties: string[];
          sourceSections: string[]; sourceUrl: string; legalStatus: "entry_into_force_unverified";
          statusAsOf: string; projectConfirmation: "not_obtained" };
      counterpartSpecificSupport: string; alignmentStatus: "not_defined"; interpretation: string };
    policyReview: null | { subject: "existing_transit_and_operating_rules" | "missing_persons_and_mine_action" | "parallel_topic_dialogue" | "peace_process_implementation_review" | "parallel_natural_system_dialogue" | "parallel_climate_dialogue" | "parallel_disaster_dialogue" | "one_sided_named_natural_system_proposal" | "one_sided_project_scope_dialogue" | "access_and_jurisdiction_dialogue"; question: string;
      submittedAssertionIds: string[]; governmentRecordIds: string[];
      evidenceStatus: "reported_interaction_operating_terms_unverified" | "initialed_article_ix_separate_modalities_unverified" | "parallel_topics_no_bilateral_terms" | "reciprocal_security_claims_process_implementation_unverified" | "one_sided_submitted_proposal_counterpart_unassessed" | "one_sided_position_with_dated_project_source" | "distinct_submitted_positions_no_common_proposal";
      noConstructionAssumed: true; interpretation: string };
    sourceUrls: string[];
    conditionContext: {
      callerRequiredSafeguards: string[];
      bilateralGovernmentContext: ScenarioGovernmentConditionUi[];
      multilateralGovernmentContext: ScenarioGovernmentConditionUi[];
      contingentFrameworks: Array<ScenarioGovernmentConditionUi & { applicability: "only_if_project_uses_this_framework" }>;
      callerAdditionalConditions: string[];
    };
    sourceScreens: {
      mappedInfrastructure: ScenarioInfrastructureScreenUi;
      thirdCountryPolygonContacts: { status: string; countries: Array<{ editorialAdm0A3: string; isoA3: string | null; name: string;
        boundaryContactSegments: number; interiorSegments: number }>;
        indeterminateFeatureIds: string[]; bboxCandidatesRejected: string[]; sourceUrl: string | null;
        possiblyTruncated: boolean; antimeridianReviewNeeded: boolean };
      thirdCountryDepictionCandidates: { status: string; countries: Array<{ editorialAdm0A3: string; isoA3: string | null; name: string; possibleSegmentCount: number }>;
        sourceUrl: string | null; sourceArchiveSha256: string | null; antimeridianReviewNeeded: boolean };
      thirdCountryEditorialHints: { status: string; countryIso3s: string[]; sourceUrls: string[]; possiblyTruncated: boolean };
      administrativeDepictionContacts: { status: string; countries: Array<{ countryIso3: string; status: string; contactCount: number | null; possiblyTruncated: boolean; sourceUrls: string[] }> };
      claimReferenceLineContacts: { status: string; contactCount: number | null; possiblyTruncated: boolean; categories: string[]; sourceUrls: string[] };
      generalizedWaterwayContacts: { status: string; contactCount: number | null; possiblyTruncated: boolean;
        contacts: ScenarioWaterwayContactUi[]; sourceUrls: string[] };
      generalizedLakeContacts: { status: string; contactCount: number | null; possiblyTruncated: boolean;
        contacts: ScenarioLakeContactUi[]; sourceUrls: string[] };
      reliefModel: { status: string; sampleCount: number | null; sourceUrls: string[];
        sourceModel: { datasetId: string; modelVersion: string; gridSpacingArcSeconds: number;
          verticalReference: string; surfaceVersion: string; sourceTimeMeaning: string } | null;
        samples: Array<{ sampleIndex: number; sketchSegmentIndex: number; segmentFraction: number;
          requestedPoint: { lat: number; lon: number }; sampledGridCellCenter: { lat: number; lon: number } | null;
          status: string; heightMeters: number | null; sourceUrl: string; fetchedAt: string }>;
        missingEvidence: string[] };
      environmentalImpact: string; communityEffects: string;
    };
    objectiveReadiness: Array<{ objective: string; status: string; value: number | null; unit: string | null }>;
    missingEvidence: string[]; eligibility: string;
  }>;
  optionEvidenceLedgers: Array<{
    optionId: string; decisionReadiness: string;
    documentedLegalStages: Array<{ sourceRecordId: string; parties: string[]; scope: string; legalStatus: string;
      statusAsOf: string; sourceUrl: string; applicability: string; routePermission: "not_established" }>;
    gates: Array<{ id: string; status: string; contextSourceUrls: string[]; evidenceNeeded: string }>;
    objectiveEvidencePlans: Array<{ objective: string; readinessStatus: "bounded_mapped_length_only" | "not_quantified";
      measurementQuestion: string; actorToConsult: string; contextSourceUrls: string[];
      contextRole: "dated_context_not_option_outcome_measurement"; frontierEligibility: "not_established" }>;
    selectedPartyDistribution: Array<{ countryIso3: string; reviewedPositionAssertionIds: string[];
      issueContextAssertionIds: string[]; optionPositionStatus: string;
      observedGoodsExportsToCounterpart: { counterpartIso3: string; year: number; status: string;
        primaryValueUsd: number | null; sourceUrl: string | null; isReported: boolean | null;
        isAggregate: boolean | null; interpretation: string };
      possibleGain: "not_quantified"; possibleLoss: "not_quantified"; publicAndCommunityEffects: "not_assessed" }>;
    potentialThirdPartyOutcomeGaps: Array<{ countryIso3: string;
      basis: Array<"conditional_framework_party" | "editorial_geometry_contact">;
      basisSourceUrls: string[]; optionSpecificPosition: "not_established";
      possibleGain: "not_quantified"; possibleLoss: "not_quantified";
      publicAndCommunityEffects: "not_assessed"; interpretation: string }>;
    datedOperatingReports: Array<{ id: string; reportDate: string; sourcePublisher: string; sourceUrl: string;
      commodity: string; reportedQuantity: { value: number; unit: "wagons" }; interpretationLimit: string;
      corroboratingOperationalSources: Array<{ sourcePublisher: string; sourceUrl: string; reportedQuantity: { value: number; unit: "tonnes" }; reportedMilestone: string }> }>;
    datedProjectMilestones: Array<{ id: string; sourceDate: string; sourcePublisher: string; sourceUrl: string;
      projectCountryIso3: string; namedCounterpartIso3: string; sourceActorKind: string;
      sourceActorCountryIso3: string | null; eventKind: string; sourceFinding: string;
      reviewQuestion: string; interpretationLimit: string;
      operationalStatus: "not_verified"; surveyedAlignmentStatus: "not_supplied";
      permissionsAndCommunityReviewStatus: "not_established" }>;
    institutionalHumanitarianContext: Array<{ id: string; topic: "missing_persons" | "mine_action";
      kind: "institutional_plan" | "national_program_report"; countryIso3: string | null;
      publisher: string; publicationDate: string; sourceUrl: string; sourceSection: string;
      summary: string; evidenceStatus: string; limits: string }>;
    affectedFamilyContext: Array<{ id: string; countryIso3: string; publisher: string; publicationDate: string;
      sourceUrl: string; sourceSection: string; evidenceBasis: string; boundedPerspective: string;
      possibleNeedForOptionReview: string; representativeness: string; optionConsentStatus: "not_obtained" }>;
    possibleThirdCountryDepictionContacts: Array<{ editorialAdm0A3: string; isoA3: string | null; name: string; sourceUrl: string; significance: string }>;
    thirdPartyContextReview: { optionSpecificEffectStatus: "unassessed";
      conditionalFrameworkParties: Array<{ partyIso3: string; sourceRecordId: string; sourceUrl: string;
        applicability: "only_if_option_uses_framework" | "source_framework_for_this_concept"; consentOrVetoStatus: "not_determined" }>;
      regionalStatementPerspectives: Array<{ countryIso3: string; assertionIds: string[]; sourceUrls: string[];
        applicability: "regional_context_only"; consentOrVetoStatus: "not_determined" }>;
      reportedTransitDependencies: Array<{ countryIso3: string; originCountryIso3: string;
        originAssertionId: string; sourceUrl: string; status: "speaker_report_not_operationally_verified";
        optionSpecificTerms: "not_assessed"; consentOrVetoStatus: "not_determined" }>;
      operatorContextSources: Array<{ id: string; countryIso3: "GEO"; sourcePublisher: string;
        sourceUrl: string; sourceDate: string; sourceDateMeaning: string; kind: string; finding: string;
        applicability: "general_operator_context_only" | "adjacent_georgia_azerbaijan_network_only"; routeSpecificTariffStatus: "not_extracted_or_verified";
        permissionStatus: "not_established"; interpretationLimit: string }>;
      geometryContactPositionCoverage: Array<{ editorialAdm0A3: string; isoA3: string | null;
        name: string; geometrySourceUrl: string;
        status: "reviewed_selective_submitted_brief" | "official_page_only_no_reviewed_brief" | "official_page_missing" | "iso3_unresolved";
        submittedPdfLinkStatus: "linked" | "not_linked" | "unknown_no_page";
        officialPageUrl: string | null; reviewedBriefSourceUrl: string | null;
        nextSourceReviewStage: string | null; nextSourceReviewReason: string | null; sourceReviewUrls: string[];
        effectOnOption: "unassessed_geometry_contact_only" }>;
      geometryContactStatus: string; interpretation: string };
    naturalSystemScreen: { status: string;
      terrestrialDepictions: { status: "not_applicable_no_route" | "not_assessed_mapped_route" | "area_too_large" | "unavailable" | "available";
        contactCount: number | null; contacts: Array<{ sketchSegmentIndex: number; featureId: string; featureKind: string;
          featureName: string | null; geometryRole: "closed_way_area" | "relation_outer_fragment" | "relation_inner_fragment";
          relation: "boundary_contact" | "sketch_vertex_inside_depiction";
          position: { lat: number; lon: number }; sourceRecordUrl: string; sourceEditedAt: string | null }>;
        possiblyTruncated: boolean; sourceSnapshotAt: string | null; fetchedAt: string | null;
        sourceUrls: string[]; missingEvidence: string[] };
      designatedWetlandContext: Array<{ countryIso3: string; sourceUrl: string; listedSiteCount: number;
        geometryStatus: string; sites: Array<{ siteNumber: number; name: string }>; interpretationLimit: string }>;
      designatedWetlandRouteRelation: "not_screened_no_alignment" | "partial_published_boundary_screen";
      designatedWetlandBoundaryScope: "not_screened" | "five_armenia_azerbaijan_pilot_sites_only";
      selectedCountryWetlandBoundaryGaps: string[];
      designatedWetlandSites: Array<{ siteNumber: number; countryIso3: "ARM" | "AZE"; name: string;
        boundaryStatus: "available" | "not_in_source_response";
        relation: "intersects_published_depiction" | "no_contact_in_published_depiction" | "unknown_no_boundary";
        alignmentSegmentIndices: number[] }>;
      liveRamsarReview: ProposedCorridorScreenUi["ramsarAreaReview"] | null;
      generalizedWaterwayContactCount: number | null;
      generalizedWaterwayContacts: ScenarioWaterwayContactUi[];
      waterwayContactsPossiblyTruncated: boolean;
      reviewedStatementWaterwayLinks: Array<{ lineId: string; lineLabel: string; lineSourceRecordUrl: string;
        systemId: string; countryIso3: string; assertionId: string; statementSourceUrl: string;
        relation: "same_named_system_editorial_crosswalk_only"; interpretation: string }>;
      generalizedLakeContactCount: number | null; generalizedLakeContacts: ScenarioLakeContactUi[];
      lakeContactsPossiblyTruncated: boolean;
      reviewedStatementLakeLinks: Array<{ lakeFeatureId: number; lakeLabel: string; lakeSourceRecordUrl: string;
        systemId: string; countryIso3: string; assertionId: string; statementSourceUrl: string;
        relation: "same_named_place_editorial_crosswalk_only"; interpretation: string }>;
      reliefSampleCount: number | null;
      sourceUrls: string[]; environmentalReviewStatus: "not_assessed"; interpretation: string };
    infrastructureScreen: ScenarioInfrastructureScreenUi;
    unidentifiedAffectedActors: string[];
    nextEvidenceRequests: Array<{ id: string; trigger: string; requestedEvidence: string;
      actorToConsult: string; contextSourceUrls: string[]; status: "needed_not_obtained" }>;
  }>;
  reviewActorGraph: { schemaVersion: "civilization_option_review_actor_graph/v8";
    interpretation: string;
    links: Array<{ optionId: string; actorKey: string; actorLabel: string;
      actorKind: "selected_government" | "conditional_framework_party" | "reported_transit_country" | "named_proposal_party" |
        "editorial_map_contact_country" | "designated_wetland_site" | "mapped_waterway_feature" | "mapped_lake_feature" |
        "mapped_terrestrial_feature" | "unidentified_actor_class";
      relation: string; sourceUrls: string[]; relevantEvidenceRequestIds: string[];
      generalStatementCoverage: null | { status: "reviewed_selective_submitted_brief" | "official_page_only_no_reviewed_brief" | "official_page_missing";
        officialPageUrl: string | null; reviewedBriefSourceUrl: string | null; sourceLanguage: string | null; reviewedAssertionIds: string[];
        optionSpecificAgreement: "not_established" };
      reviewStatus: string; inferenceLimit: string }> };
  unresolved: string[];
};

type ProposedCorridorScreenUi = {
  schemaVersion: "civilization_proposed_corridor_screen/v12";
  query: { vertices: Array<{ lat: number; lon: number }>; intendedUse: string; contemplatedModes: string[]; countryIso3s: string[]; mappedInfrastructureKinds: string[]; includeTerrainPointObservations: boolean; includeGlobalReliefObservations: boolean; maxGlobalReliefSamples: number; evaluatedAt: string };
  collectedAt: string;
  routeFindingPerformed: false;
  infrastructureAssumed: false;
  sourceValidityAtEvaluation: "unverified";
  boundaryLines: {
    status: "available" | "unavailable";
    source?: { sourceRecordUrl: string; sourceRevisionAt: string; licenseId: string };
    contacts?: Array<{ sketchSegmentIndex: number; lineId: string; lineLabel: string; recordCategory: string; adjacentAdministrativeIso3: [string | null, string | null]; contactKind: string; position: { lat: number; lon: number }; sourceRecordUrl: string }>;
    possiblyTruncated?: boolean;
    errorCode?: string;
    missingEvidence: string[];
  };
  administrativeBoundaries: Array<{
    status: "available" | "unavailable";
    countryIso3: string;
    source?: { metadataUrl: string; representedYear: string; releaseRevision: string; distributionLicense: string; originalSourceLicense: string };
    contacts?: Array<{ sketchSegmentIndex: number; boundaryId: string; contactKind: string; position: { lat: number; lon: number }; sourceRecordUrl: string; sourceYearRepresented: string }>;
    vertexCoverage?: Array<{ sketchVertexIndex: number; relationship: "inside_depiction" | "outside_depiction" | "on_outline" | "unknown"; boundaryId: string | null; sourceRecordUrl: string | null }>;
    spanCoverage?: Array<{ sketchSegmentIndex: number; fromFraction: number; toFraction: number; relationship: "inside_depiction" | "outside_depiction" | "unknown"; boundaryId: string | null; sourceRecordUrl: string | null }>;
    possiblyTruncated?: boolean;
    errorCode?: string;
    missingEvidence: string[];
  }>;
  countryDepictionCandidates: {
    source: { sourceRecordUrl: string; datasetVersion: string; licenseId: string };
    candidates: Array<{ editorialAdm0A3: string; isoA3: string | null; name: string; sourceFeatureId: string; possibleSegmentCount: number }>;
    antimeridianReviewNeeded: boolean; missingEvidence: string[];
  };
  countryGeometryScreen: {
    sourceRecordUrl: string;
    contacts: Array<{ editorialAdm0A3: string; isoA3: string | null; name: string; sourceFeatureId: string;
      boundaryContactSegments: number; interiorSegments: number }>;
    bboxCandidatesRejected: string[]; indeterminateFeatureIds: string[];
    possiblyTruncated: boolean; antimeridianReviewNeeded: boolean; missingEvidence: string[];
  };
  mappedInfrastructure: {
    status: "not_requested" | "area_too_large" | "unavailable" | "available";
    source?: { fetchedAt: string; sourceSnapshotAt: string | null; attribution: string; licenseId: string; licenseUrl: string; licenseBoundary: string };
    contacts?: Array<{ sketchSegmentIndex: number; edgeId: string; networkKind: string; contactKind: string; position: { lat: number; lon: number }; sourceRecordUrl: string; sourceEditedAt: string | null }>;
    possiblyTruncated?: boolean;
    errorCode?: string;
    missingEvidence: string[];
  };
  terrestrialDepictions: {
    status: "area_too_large" | "unavailable" | "available";
    source?: { sourceUrl: string; fetchedAt: string; sourceSnapshotAt: string | null; licenseId: string };
    coverage?: { returnedWays: number; returnedRelations: number; usableClosedWays: number;
      usableRelationFragments: number; possiblyTruncated: boolean; missingEvidence: string[] };
    contacts?: Array<{ sketchSegmentIndex: number; featureId: string; featureKind: string; featureName: string | null;
      geometryRole: "closed_way_area" | "relation_outer_fragment" | "relation_inner_fragment";
      relation: "boundary_contact" | "sketch_vertex_inside_depiction"; contactKind: "point" | "overlap" | null;
      position: { lat: number; lon: number }; sourceRecordUrl: string; sourceEditedAt: string | null }>;
    possiblyTruncated?: boolean; errorCode?: string; missingEvidence: string[];
  };
  hydrography: {
    status: "available" | "unavailable";
    source?: { sourceArchiveUrl: string; snapshotAcquiredAt: string; licenseId: string };
    contacts?: Array<{ sketchSegmentIndex: number; lineId: string; lineLabel: string; featureKind: string; contactKind: string; position: { lat: number; lon: number }; sourceRecordUrl: string }>;
    possiblyTruncated?: boolean;
    errorCode?: string;
    missingEvidence: string[];
  };
  lakeReview: RouteLakeReviewUi;
  designatedWetlands: {
    source: { url: string; acquiredAt: string; rawResponseSha256: string; license: string };
    sites: Array<{ siteNumber: number; countryIso3: "ARM" | "AZE"; name: string;
      boundaryStatus: "available" | "not_in_source_response";
      relation: "intersects_published_depiction" | "no_contact_in_published_depiction" | "unknown_no_boundary";
      alignmentSegmentIndices: number[] }>;
    missingEvidence: string[];
  };
  ramsarAreaReview: {
    status: "available" | "unavailable";
    source?: { requestUrl: string; fetchedAt: string; license: string; licenseUrl: string };
    coverage?: { selectedFeatures: number; possiblyTruncated: boolean };
    sites?: Array<{ siteNumber: number; name: string; countryIso3: string | null; sourceRecordUrl: string;
      relation: "intersects_published_depiction" | "no_contact_in_returned_depiction" | "indeterminate_comparison_limit";
      alignmentSegmentIndices: number[] }>;
    possiblyTruncated?: boolean;
    errorCode?: string;
    missingEvidence: string[];
  };
  terrainPoints: {
    status: "not_requested" | "unavailable" | "available";
    source?: { attribution: string; documentationUrl: string; accuracyUrl: string; termsUrl: string; licenseBoundary: string; method: string; verticalDatum: string };
    observations?: Array<{ pointIndex: number; status: "available" | "no_coverage" | "unavailable"; elevationMeters: number | null; resolutionReported: number | null; rasterId: number | null; acquisitionDate: string | null; sourceUrl: string; fetchedAt: string; errorCode: string | null }>;
    errorCode?: string;
    missingEvidence: string[];
  };
  globalReliefPoints: {
    status: "not_requested" | "unavailable" | "available";
    source?: { attribution: string; datasetUrl: string; citationUrl: string; gridSpacingArcSeconds: number; verticalReference: string; surfaceVersion: string; licenseBoundary: string };
    observations?: Array<{ pointIndex: number; sampledGridCellCenter: { lat: number; lon: number } | null; status: "available" | "no_data" | "unavailable"; heightMeters: number | null; sourceUrl: string; fetchedAt: string; errorCode: string | null }>;
    samplePlan?: Array<{ sketchSegmentIndex: number; segmentFraction: number; point: { lat: number; lon: number }; originalVertexIndex: number | null }>;
    sampleMethod?: string;
    errorCode?: string;
    missingEvidence: string[];
  };
  unresolved: string[];
};

type CorridorScaleWindowUi = { status: "available"; evidence: ProposedCorridorScreenUi } |
  { status: "unavailable"; reason: string };
type CorridorScaleSeamUi = { firstWindowSequence: number; secondWindowSequence: number;
  sketchGeometryRelation: "same_endpoint" | "date_line_equivalent_endpoint" | "unresolved_endpoint";
  bothLocalScreensAvailable: boolean; sharedMappedWayRecordUrls: string[];
  mappedNetworkContinuity: "unverified" };
type CorridorScaleSourceSummaryUi = { unavailableSources: string[]; possiblyTruncatedSources: string[];
  countryDepictionCodes: string[]; sourceRecordUrls: string[] };
type CorridorScaleNetworkUi = { schemaVersion: "civilization_corridor_scale_network_topology/v4";
  query: { networkKind: MappedNetworkKind; startWindowSequence: number; maxWindows: number };
  sourceWindows: Array<{ windowSequence: number; status: "available" | "unavailable"; possiblyTruncated: boolean | null }>;
  coverage: { selectedWindowCount: number; graphWays: number; graphNodes: number; graphSegments: number;
    conflictingWayCount: number; conflictingNodeCount: number; possiblyTruncated: boolean; missingEvidence: string[] };
  route: { status: "mapped_topology_candidate"; mappedLengthKm: number; mappedSegmentCount: number;
    mappedWayRecordUrls: string[]; mappedWayRecordUrlCount: number; mappedWayRecordUrlsOmitted: number;
    pathSha256: string;
    pathGeometry: { status: "complete"; segmentCount: number; segments: Array<{
      fromNodeRef: string; toNodeRef: string; from: { lat: number; lon: number }; to: { lat: number; lon: number };
      sourceRecordUrl: string; windowSequence: number }> } |
      { status: "exceeds_response_limit"; segmentCount: number; responseLimit: number; segments: [] };
    originSnapDistanceKm: number; destinationSnapDistanceKm: number; interpretation: string } |
    { status: "no_usable_source" | "no_endpoint_snap" | "no_path_in_considered_graph"; interpretation: string } };
type CorridorScalePathScreenUi = { schemaVersion: "civilization_corridor_scale_path_screen/v3";
  network: CorridorScaleNetworkUi;
  diplomaticContext: { status: "not_requested" } | { status: "unavailable"; reason: string } |
    { status: "available"; relationToMappedPath: "selected_public_position_context_not_alignment_support_or_permission";
      nextQuestion: string; pairGlance: { directions: Array<{ countryIso3: string; positionStatus: string;
        assertion: null | { text: string; sourceUrl: string; sourcePage: number; speechDate: string; uncertainty: string } }>;
        sharedTopic: null | { label: string; comparisonBasis: string; unansweredQuestion: string } } };
  screen: { status: "available"; windowSequence: number; startSegmentIndex: number; screenedSegmentCount: number;
    nextSegmentIndex: number | null; evidence: ProposedCorridorScreenUi;
    reviewLeads: { countryDepictions: Array<{ name: string; countryIso3: string | null; sourceUrl: string }>;
      naturalFeatures: Array<{ kind: string; label: string; sourceUrl: string }>;
      unavailableSources: string[]; possiblyTruncatedSources: string[];
      nextEvidenceRequests: Array<{ actorClass: string; question: string; contextSourceUrls: string[]; status: "needed_not_obtained" }>;
      interpretation: string } } |
    { status: "unavailable"; windowSequence: number; startSegmentIndex: number; screenedSegmentCount: number;
      nextSegmentIndex: number | null; reason: string } |
    { status: "not_screenable"; reason: "no_mapped_path" | "path_geometry_exceeds_response_limit" | "mapped_path_changed" } };
type CorridorScalePathBatchUi = { schemaVersion: "civilization_corridor_scale_path_batch/v1";
  query: Record<string, unknown>;
  network: CorridorScaleNetworkUi; diplomaticContext: CorridorScalePathScreenUi["diplomaticContext"];
  pieces: Array<{ screen: CorridorScalePathScreenUi["screen"] }>;
  coverage: { pathSha256: string | null; totalPathSegments: number | null; startSegmentIndex: number;
    screenedSegmentCount: number; nextSegmentIndex: number | null; status: string;
    allPathGeometryPiecesReadInThisBatch: boolean; unavailableSources: string[];
    possiblyTruncatedSources: string[]; interpretation: string };
  reviewLeads: { countryDepictions: Array<{ countryIso3: string | null; name: string; sourceUrl: string }>;
    naturalFeatures: Array<{ kind: string; label: string; sourceUrl: string; pathSegmentIndices: number[] }>;
    nextEvidenceRequests: Array<{ actorClass: string; question: string; contextSourceUrls: string[] }>;
    meaning: string } };
type MappedPathOptionReviewUi = { schemaVersion: "civilization_mapped_path_option_review/v12";
  conditionalOption: { status: "not_available"; reason: string; interpretation: string } |
    { status: "review_question_only"; id: string; networkKind: string; pathSha256: string;
      mappedLengthKm: number; question: string; interpretation: string; eligibility: "undetermined";
      pathCoverage: CorridorScalePathBatchUi["coverage"] | CorridorScalePathLedgerUi["coverage"] | CorridorScalePathReceiptChainUi["coverage"];
      networkSourceSummary: { networkReadCount: number; status: string;
        unavailableWindowSequences: number[]; possiblyTruncatedWindowSequences: number[];
        graphSegmentLimitReached: boolean; mappedNetworkMissingEvidence: string[];
        sourceUrls: string[]; interpretation: string };
      selectedCountryViews: Array<{ countryIso3: string; reviewedAssertion: null | { text: string;
        sourceUrl: string; sourcePage: number; speechDate: string; uncertainty: string };
        optionSpecificPosition: "unverified"; possibleGain: "unquantified"; possibleLoss: "unquantified" }>;
      selectedCountryDepictionReview: { countries: Array<{ countryIso3: string; status: string;
        sourceFeatureIds: string[]; sourceUrls: string[]; exactEndpointAndJurisdiction: "not_established";
        reviewQuestion: string }>; interpretation: string };
      snappedEndpointDepictionReview: { start: { point: { lat: number; lon: number };
        sourceRecordUrl: string; contacts: Array<{ isoA3: string | null; name: string; relation: string }>;
        indeterminateFeatureIds: string[] };
        end: { point: { lat: number; lon: number }; sourceRecordUrl: string;
          contacts: Array<{ isoA3: string | null; name: string; relation: string }>;
          indeterminateFeatureIds: string[] };
        originSnapDistanceKm: number; destinationSnapDistanceKm: number;
        selectedCountries: Array<{ countryIso3: string; startRelation: string; endRelation: string }>;
        interpretation: string };
      candidateThirdCountryReviewLeads: Array<{ countryIso3: string; depictionNames: string[];
        sourceFeatureIds: string[]; sourceUrls: string[]; contactMeaning: string;
        currentPosition: "not_obtained_for_this_option"; relationshipEffect: "unassessed";
        rightsAndConsent: "unverified"; reviewQuestion: string;
        selectedPublicPositionContext: { status: string; assertion: null | { text: string;
          sourceUrl: string; sourcePage: number; speechDate: string; uncertainty: string };
          meaning: string };
        namedCounterpartReferences: Array<{ fromIso3: string; toIso3: string; assertionId: string;
          text: string; sourceUrl: string; sourcePage: number; speechDate: string; uncertainty: string;
          currentRelationEffect: "unassessed" }>;
        counterpartReferenceMeaning: string;
        relationshipRecordContext: Array<{ recordId: string; role: string; sourceUrls: string[];
          effectOnMappedOption: "unassessed" }>;
        relationshipRecordMeaning: string }>;
      unattributedCountryDepictionCount: number;
      naturalFeatureLeads: Array<{ kind: string; label: string; sourceUrl: string; pathSegmentIndices: number[] }>;
      gates: Array<{ id: string; status: "unverified"; evidenceNeeded: string; contextSourceUrls: string[] }>;
      objectiveReadiness: Array<{ objective: string; status: string; value: number | null; unit: string | null }>;
      comparison: { noBuildOptionId: string | null; otherScenarioOptionIds: string[];
        status: string; interpretation: string };
      comparisonHandoff: { basisQuestion: string;
        noBuildBaseline: { optionId: string | null; scope: string };
        objectives: Array<{ objective: string; mappedPathStatus: string;
          scenarioInfrastructureOptions: Array<{ optionId: string; status: string }>;
          measurementQuestion: string; actorToConsult: string; outcomeComparison: "not_established" }>;
        interpretation: string };
      sameFamilyConceptContext: { matchedOptions: Array<{ optionId: string; conceptFamily: string;
        relation: string; selectedGovernmentResponses: Array<{ countryIso3: string;
          conceptPositionStatus: string; reviewedPositionAssertionIds: string[];
          exactMappedAlignmentPosition: "not_established"; reviewQuestion: string }>;
        discussionBasis: null | { rationale: string; basisSourceUrls: string[];
          reviewedPositionBasis: Array<{ countryIso3: string; assertionId: string; sourceUrl: string;
            sourcePage: number; role: string }>;
          governmentRecordBasis: Array<{ recordId: string; sourceUrl: string; role: string }> } }>;
        interpretation: string };
      missingEvidence: string[] } };
type CorridorScalePathLedgerUi = { schemaVersion: "civilization_corridor_scale_path_ledger/v2";
  receiptId: string; issuedAt: string; expiresAt: string;
  query: Record<string, unknown>;
  coverage: { pathSha256: string; totalPathSegments: number | null; startSegmentIndex: number;
    screenedSegmentCount: number; nextSegmentIndex: number | null;
    status: "path_changed_or_unavailable" | "source_gap" | "more_batches_needed" | "reached_path_end";
    wholePathGeometryRead: boolean; sourceGapsReported: boolean; unavailableSources: string[];
    possiblyTruncatedSources: string[]; interpretation: string };
  reviewLeads: { countryDepictions: CorridorScalePathBatchUi["reviewLeads"]["countryDepictions"];
    naturalFeatures: CorridorScalePathBatchUi["reviewLeads"]["naturalFeatures"]; meaning: string } };
type CorridorScalePathReceiptChainUi = { schemaVersion: "civilization_corridor_scale_path_receipt_chain/v3";
  query: { receiptIds: string[] };
  coverage: { pathSha256: string; totalPathSegments: number; startSegmentIndex: number;
    screenedSegmentCount: number; nextSegmentIndex: number | null;
    status: "source_gap" | "more_receipts_needed" | "reached_path_end";
    wholePathGeometryRead: boolean; sourceGapsReported: boolean;
    earliestReadAt: string; latestReadAt: string; interpretation: string };
  reviewLeads: { countryDepictions: CorridorScalePathBatchUi["reviewLeads"]["countryDepictions"];
    naturalFeatures: CorridorScalePathBatchUi["reviewLeads"]["naturalFeatures"]; meaning: string } };

type GoogleMapsLibrary = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
};

type GoogleMapsNamespace = {
  maps: {
    importLibrary(name: string): Promise<GoogleMapsLibrary>;
    Data?: new (options: Record<string, unknown>) => GoogleDataOverlay;
    Marker?: new (options: Record<string, unknown>) => GoogleOverlay;
    Polyline?: new (options: Record<string, unknown>) => GoogleOverlay;
    SymbolPath?: { CIRCLE: unknown };
  };
};

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
    gm_authFailure?: () => void;
  }
}

let mapsLoadPromise: Promise<GoogleMapsLibrary> | null = null;
let mapsLoadKey: string | null = null;

function loadGoogleMaps(key: string): Promise<GoogleMapsLibrary> {
  if (mapsLoadPromise && mapsLoadKey === key) return mapsLoadPromise;

  mapsLoadKey = key;
  const loadPromise = new Promise<GoogleMapsLibrary>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-casimirbot-google-maps]");
    const finish = () => {
      const api = window.google?.maps;
      if (!api?.importLibrary) {
        reject(new Error("Google Maps JavaScript API did not expose importLibrary."));
        return;
      }
      void api.importLibrary("maps").then(resolve, reject);
    };

    if (window.google?.maps?.importLibrary) {
      finish();
      return;
    }

    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps script failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.dataset.casimirbotGoogleMaps = "true";
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&v=weekly`;
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Google Maps script failed to load.")), { once: true });
    document.head.appendChild(script);
  });

  mapsLoadPromise = loadPromise;
  void loadPromise.catch(() => {
    if (mapsLoadPromise !== loadPromise) return;
    mapsLoadPromise = null;
    mapsLoadKey = null;
    document.querySelector<HTMLScriptElement>("script[data-casimirbot-google-maps]")?.remove();
  });

  return loadPromise;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/gu, "");
}

function vectorForCountryName(countryName: string): CivilizationNationStateVector | undefined {
  const normalized = normalizeName(countryName);
  const aliases: Record<string, string> = {
    unitedstatesofamerica: "unitedstates",
    southafrica: "southafrica",
    indonesia: "indonesia",
  };
  const target = aliases[normalized] ?? normalized;
  return CIVILIZATION_NATION_STATE_VECTORS.find((vector) => normalizeName(vector.label) === target);
}

const TOPOLOGY_NAME_ALIASES: Record<string, string> = {
  tanzania: "TZA", demrepcongo: "COD", dominicanrep: "DOM", russia: "RUS",
  bolivia: "BOL", venezuela: "VEN", centralafricanrep: "CAF", eqguinea: "GNQ",
  palestine: "PSE", laos: "LAO", northkorea: "PRK", southkorea: "KOR",
  iran: "IRN", syria: "SYR", moldova: "MDA", turkey: "TUR", netherlands: "NLD",
  solomonis: "SLB", unitedkingdom: "GBR", brunei: "BRN", bosniaandherz: "BIH",
  macedonia: "MKD", ssudan: "SSD",
};

function affiliationForCountryName(countryName: string, affiliations: Unga81Affiliation[]): string | null {
  const normalized = normalizeName(countryName);
  const alias = TOPOLOGY_NAME_ALIASES[normalized];
  if (alias) return alias;
  return affiliations.find((item) => normalizeName(item.countryName) === normalized)?.countryIso3
    ?? vectorForCountryName(countryName)?.countryIso3 ?? null;
}

function decodeGoogleRoutePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const path: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length && path.length < 10_000) {
    const values: number[] = [];
    for (let coordinate = 0; coordinate < 2; coordinate += 1) {
      let shift = 0;
      let result = 0;
      let part: number;
      do {
        if (index >= encoded.length || shift > 30) return [];
        part = encoded.charCodeAt(index++) - 63;
        if (part < 0 || part > 63) return [];
        result |= (part & 0x1f) << shift;
        shift += 5;
      } while (part >= 0x20);
      values.push(result & 1 ? ~(result >> 1) : result >> 1);
    }
    lat += values[0];
    lng += values[1];
    const point = { lat: lat / 1e5, lng: lng / 1e5 };
    if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return [];
    path.push(point);
  }
  return index === encoded.length && path.length >= 2 ? path : [];
}

function svgMarker(fill: string, selected: boolean): string {
  const radius = selected ? 15 : 12;
  const stroke = selected ? "#f8fafc" : "#03120f";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="${radius}" fill="${fill}" fill-opacity=".9" stroke="${stroke}" stroke-width="2"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function CivilizationGoogleBasemap({
  selectedIso3s,
  onToggleCountry,
}: {
  selectedIso3s: string[];
  onToggleCountry: (iso3: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const [mapInstance, setMapInstance] = useState<GoogleMapInstance | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [ungaAffiliations, setUngaAffiliations] = useState<Unga81Affiliation[]>([]);
  const [hoveredIso3, setHoveredIso3] = useState<string | null>(null);
  const hoverLeaveTimerRef = useRef<number | null>(null);
  const hoverCardActiveRef = useRef(false);
  const [viewportBbox, setViewportBbox] = useState<MapBbox | null>(null);
  const autoCoverageRef = useRef<Record<"boundaryLines" | "infrastructure" | "hydrography" | "lakes" | "ports" | "wpi", MapBbox | null>>({
    boundaryLines: null, infrastructure: null, hydrography: null, lakes: null, ports: null, wpi: null,
  });
  const autoRequestedAtRef = useRef<Record<"boundaryLines" | "infrastructure" | "hydrography" | "lakes" | "ports" | "wpi", number>>({
    boundaryLines: 0, infrastructure: 0, hydrography: 0, lakes: 0, ports: 0, wpi: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [browserKey, setBrowserKey] = useState<string | null | undefined>(undefined);
  const [keyLoadFailed, setKeyLoadFailed] = useState(false);
  const keyLoadSequenceRef = useRef(0);
  const [keyRevision, setKeyRevision] = useState(0);
  const [seismicMeasurements, setSeismicMeasurements] = useState<CivilizationSourceMeasurementV1[]>([]);
  const [seismicStatus, setSeismicStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [seismicFetchedAt, setSeismicFetchedAt] = useState<string | null>(null);
  const [seismicPossiblyTruncated, setSeismicPossiblyTruncated] = useState(false);
  const [seismicVisible, setSeismicVisible] = useState(true);
  const [selectedSeismic, setSelectedSeismic] = useState<CivilizationSourceMeasurementV1 | null>(null);
  const [infrastructureEdges, setInfrastructureEdges] = useState<CivilizationInfrastructureEdgeV1[]>([]);
  const [infrastructureStatus, setInfrastructureStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [infrastructureMessage, setInfrastructureMessage] = useState<string | null>(null);
  const [infrastructureVisible, setInfrastructureVisible] = useState(true);
  const [infrastructureTruncated, setInfrastructureTruncated] = useState(false);
  const [infrastructureFetchedAt, setInfrastructureFetchedAt] = useState<string | null>(null);
  const [infrastructureBbox, setInfrastructureBbox] = useState<[number, number, number, number] | null>(null);
  const [infrastructureCoverageGaps, setInfrastructureCoverageGaps] = useState<string[]>([]);
  const [selectedInfrastructure, setSelectedInfrastructure] = useState<CivilizationInfrastructureEdgeV1 | null>(null);
  const infrastructureAbortRef = useRef<AbortController | null>(null);
  const [portCandidates, setPortCandidates] = useState<PortCandidateUi[]>([]);
  const [portStatus, setPortStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [portMessage, setPortMessage] = useState<string | null>(null);
  const [portVisible, setPortVisible] = useState(true);
  const [portTruncated, setPortTruncated] = useState(false);
  const [portSourceAt, setPortSourceAt] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<PortCandidateUi | null>(null);
  const portAbortRef = useRef<AbortController | null>(null);
  const [wpiPorts, setWpiPorts] = useState<WorldPortIndexUi[]>([]);
  const [wpiStatus, setWpiStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [wpiMessage, setWpiMessage] = useState<string | null>(null);
  const [wpiVisible, setWpiVisible] = useState(true);
  const [wpiTruncated, setWpiTruncated] = useState(false);
  const [wpiSourceAt, setWpiSourceAt] = useState<string | null>(null);
  const [selectedWpiPort, setSelectedWpiPort] = useState<WorldPortIndexUi | null>(null);
  const wpiAbortRef = useRef<AbortController | null>(null);
  const [hydrographicLines, setHydrographicLines] = useState<CivilizationHydrographicLineV1[]>([]);
  const [hydroStatus, setHydroStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [hydroMessage, setHydroMessage] = useState<string | null>(null);
  const [hydroVisible, setHydroVisible] = useState(true);
  const [hydroTruncated, setHydroTruncated] = useState(false);
  const [selectedHydroLine, setSelectedHydroLine] = useState<CivilizationHydrographicLineV1 | null>(null);
  const hydroAbortRef = useRef<AbortController | null>(null);
  const [lakeDepictions, setLakeDepictions] = useState<NaturalEarthLakeUi[]>([]);
  const [lakesStatus, setLakesStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [lakesMessage, setLakesMessage] = useState<string | null>(null);
  const [lakesVisible, setLakesVisible] = useState(true);
  const [lakesTruncated, setLakesTruncated] = useState(false);
  const [selectedLake, setSelectedLake] = useState<NaturalEarthLakeUi | null>(null);
  const lakesAbortRef = useRef<AbortController | null>(null);
  const [ramsarOverlay, setRamsarOverlay] = useState<RamsarMapOverlayUi | null>(null);
  const [ramsarStatus, setRamsarStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [ramsarVisible, setRamsarVisible] = useState(true);
  const [selectedRamsarSite, setSelectedRamsarSite] = useState<RamsarMapOverlayUi["geojson"]["features"][number]["properties"] | null>(null);
  const [boundaryClaims, setBoundaryClaims] = useState<CivilizationBoundaryClaimV1[]>([]);
  const [boundaryStatus, setBoundaryStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [boundaryMessage, setBoundaryMessage] = useState<string | null>(null);
  const [boundaryVisible, setBoundaryVisible] = useState(true);
  const boundaryAbortRef = useRef<AbortController | null>(null);
  const [boundaryLines, setBoundaryLines] = useState<CivilizationBoundaryLineAssertionV1[]>([]);
  const [boundaryLineStatus, setBoundaryLineStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [boundaryLineMessage, setBoundaryLineMessage] = useState<string | null>(null);
  const [boundaryLineVisible, setBoundaryLineVisible] = useState(true);
  const [boundaryLineFetchedAt, setBoundaryLineFetchedAt] = useState<string | null>(null);
  const [boundaryLineTruncated, setBoundaryLineTruncated] = useState(false);
  const [selectedBoundaryLine, setSelectedBoundaryLine] = useState<CivilizationBoundaryLineAssertionV1 | null>(null);
  const boundaryLineAbortRef = useRef<AbortController | null>(null);
  const [routePickStage, setRoutePickStage] = useState<"origin" | "destination" | "waypoint" | null>(null);
  const routePickRef = useRef<"origin" | "destination" | "waypoint" | null>(null);
  const [routeOrigin, setRouteOrigin] = useState<{ lat: number; lon: number } | null>(null);
  const [routeDestination, setRouteDestination] = useState<{ lat: number; lon: number } | null>(null);
  const [proposedWaypoints, setProposedWaypoints] = useState<Array<{ lat: number; lon: number }>>([]);
  const [routeNetworkKinds, setRouteNetworkKinds] = useState<MappedNetworkKind[]>([]);
  const [evaluationLocal, setEvaluationLocal] = useState(currentLocalDateTime);
  const [routeStatus, setRouteStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [routeMessage, setRouteMessage] = useState<string | null>(null);
  const [routeCandidates, setRouteCandidates] = useState<CivilizationMappedNetworkRouteCandidateV1[]>([]);
  const [routeSelectedIndex, setRouteSelectedIndex] = useState(0);
  const routeCandidate = routeCandidates[routeSelectedIndex] ?? null;
  const [routeVisible, setRouteVisible] = useState(true);
  const [routeCoverageGaps, setRouteCoverageGaps] = useState<string[]>([]);
  const [routeGapReview, setRouteGapReview] = useState<MappedGapReviewUi | null>(null);
  const [routeMappedOneWayRoadWays, setRouteMappedOneWayRoadWays] = useState(0);
  const [routeBoundaryLineReview, setRouteBoundaryLineReview] = useState<RouteBoundaryLineReviewUi | null>(null);
  const [routeHydrographyReview, setRouteHydrographyReview] = useState<RouteHydrographyReviewUi | null>(null);
  const [routeLakeReview, setRouteLakeReview] = useState<RouteLakeReviewUi | null>(null);
  const [routeSourceAt, setRouteSourceAt] = useState<string | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const [proposedUse, setProposedUse] = useState("Proposed trade corridor");
  const [proposedMode, setProposedMode] = useState<CivilizationTraversabilityRouteModeV1 | "unspecified">("unspecified");
  const [includeTerrainPoints, setIncludeTerrainPoints] = useState(false);
  const [includeGlobalReliefPoints, setIncludeGlobalReliefPoints] = useState(false);
  const [proposedScreen, setProposedScreen] = useState<ProposedCorridorScreenUi | null>(null);
  const [proposedStatus, setProposedStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [proposedMessage, setProposedMessage] = useState<string | null>(null);
  const [proposedVisible, setProposedVisible] = useState(true);
  const proposedAbortRef = useRef<AbortController | null>(null);
  const [googleTravelMode, setGoogleTravelMode] = useState<"DRIVE" | "WALK" | "BICYCLE" | "TWO_WHEELER" | "TRANSIT">("DRIVE");
  const [googleRoute, setGoogleRoute] = useState<{ path: Array<{ lat: number; lng: number }>; distanceMeters: number; durationSeconds: number; fetchedAt: string; missingEvidence: string[] } | null>(null);
  const [googleRouteStatus, setGoogleRouteStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [googleRouteMessage, setGoogleRouteMessage] = useState<string | null>(null);
  const [googleRouteVisible, setGoogleRouteVisible] = useState(true);
  const googleRouteAbortRef = useRef<AbortController | null>(null);
  const [reviewQuestion, setReviewQuestion] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [reviewPacket, setReviewPacket] = useState<DiplomaticCorridorPacketUi | null>(null);
  const [scenarioObjectives, setScenarioObjectives] = useState<Array<"mapped_length" | "trade_access" | "resilience" | "emissions" | "environmental_protection" | "mutual_benefit">>(["trade_access", "mutual_benefit"]);
  const [scenarioTradeYear, setScenarioTradeYear] = useState(2024);
  const [scenarioHorizonYear, setScenarioHorizonYear] = useState(2035);
  const [scenarioComparison, setScenarioComparison] = useState<ScenarioComparisonUi | null>(null);
  const [scenarioStatus, setScenarioStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [scenarioMessage, setScenarioMessage] = useState<string | null>(null);
  const scenarioAbortRef = useRef<AbortController | null>(null);
  const scenarioBriefAbortRef = useRef<AbortController | null>(null);
  const [scenarioBriefStatus, setScenarioBriefStatus] = useState<"idle" | "loading" | "unavailable">("idle");
  const [scenarioBriefMessage, setScenarioBriefMessage] = useState<string | null>(null);
  const [scenarioMcpCopyMessage, setScenarioMcpCopyMessage] = useState<string | null>(null);
  const [scaleWindowEvidence, setScaleWindowEvidence] = useState<Record<number, CorridorScaleWindowUi>>({});
  const [scaleBatchSeams, setScaleBatchSeams] = useState<Record<number, CorridorScaleSeamUi>>({});
  const [scaleSourceSummaries, setScaleSourceSummaries] = useState<Record<number, CorridorScaleSourceSummaryUi>>({});
  const [scaleNetworkKind, setScaleNetworkKind] = useState<MappedNetworkKind | "">("");
  const [scaleNetworkResults, setScaleNetworkResults] = useState<Record<number, CorridorScaleNetworkUi>>({});
  const [scaleNetworkLoading, setScaleNetworkLoading] = useState<number | null>(null);
  const scaleNetworkAbortRef = useRef<AbortController | null>(null);
  const [scalePathBatches, setScalePathBatches] = useState<Record<number, CorridorScalePathBatchUi>>({});
  const [scalePathLoading, setScalePathLoading] = useState<number | null>(null);
  const scalePathAbortRef = useRef<AbortController | null>(null);
  const [mappedPathOptionReviews, setMappedPathOptionReviews] = useState<Record<number, MappedPathOptionReviewUi>>({});
  const [mappedPathOptionLoading, setMappedPathOptionLoading] = useState<number | null>(null);
  const mappedPathOptionAbortRef = useRef<AbortController | null>(null);
  const [scalePathLedgers, setScalePathLedgers] = useState<Record<number, CorridorScalePathLedgerUi[]>>({});
  const [scalePathLedgerLoading, setScalePathLedgerLoading] = useState<number | null>(null);
  const scalePathLedgerAbortRef = useRef<AbortController | null>(null);
  const [pathReceiptChains, setPathReceiptChains] = useState<Record<number, CorridorScalePathReceiptChainUi>>({});
  const [pathReceiptChainLoading, setPathReceiptChainLoading] = useState<number | null>(null);
  const pathReceiptChainAbortRef = useRef<AbortController | null>(null);
  const [scaleWindowLoading, setScaleWindowLoading] = useState<number | null>(null);
  const scaleWindowAbortRef = useRef<AbortController | null>(null);
  const mapToolsDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const scenarioDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const [includeProposedInPacket, setIncludeProposedInPacket] = useState(false);
  const [packetContactsVisible, setPacketContactsVisible] = useState(true);
  const reviewAbortRef = useRef<AbortController | null>(null);
  const [nwsNotices, setNwsNotices] = useState<CivilizationNaturalHazardNoticeV1[]>([]);
  const [nwsStatus, setNwsStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [nwsMessage, setNwsMessage] = useState<string | null>(null);
  const [nwsQueryPoint, setNwsQueryPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [nwsFetchedAt, setNwsFetchedAt] = useState<string | null>(null);
  const [nwsPossiblyTruncated, setNwsPossiblyTruncated] = useState(false);
  const [nwsVisible, setNwsVisible] = useState(true);
  const nwsAbortRef = useRef<AbortController | null>(null);
  const [noaaStationInput, setNoaaStationInput] = useState("");
  const [noaaDate, setNoaaDate] = useState<"latest" | "today">("latest");
  const [noaaDatum, setNoaaDatum] = useState<"MLLW" | "MSL" | "NAVD" | "IGLD" | "LWD">("MLLW");
  const [noaaMeasurements, setNoaaMeasurements] = useState<CivilizationSourceMeasurementV1[]>([]);
  const [noaaStatus, setNoaaStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [noaaMessage, setNoaaMessage] = useState<string | null>(null);
  const [noaaSource, setNoaaSource] = useState<{ fetchedAt: string; sourceUrl: string; station: { id: string; name: string | null; lat: number | null; lon: number | null }; datum: string } | null>(null);
  const [noaaGaps, setNoaaGaps] = useState<string[]>([]);
  const [noaaTruncated, setNoaaTruncated] = useState(false);
  const [noaaVisible, setNoaaVisible] = useState(true);
  const noaaAbortRef = useRef<AbortController | null>(null);
  const selectedKey = useMemo(() => selectedIso3s.slice().sort().join(","), [selectedIso3s]);
  const ramsarViewportEligible = Boolean(mapReady && viewportBbox &&
    validViewportBbox(viewportBbox, 20) && bboxOverlaps(viewportBbox, RAMSAR_PILOT_BBOX));
  const ramsarViewportActive = ramsarViewportEligible && ramsarVisible;

  useEffect(() => {
    if (!ramsarViewportActive || ramsarOverlay) return;
    const controller = new AbortController();
    setRamsarStatus("loading");
    void fetch("/api/civilization/geospatial/nature/ramsar-pilot-boundaries", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("ramsar_overlay_unavailable")))
      .then((value: RamsarMapOverlayUi) => {
        if (value.schemaVersion !== "civilization_ramsar_map_overlay/v1" || value.geojson.type !== "FeatureCollection") {
          throw new Error("ramsar_overlay_schema_mismatch");
        }
        setRamsarOverlay(value);
        setRamsarStatus("ready");
      })
      .catch(() => { if (!controller.signal.aborted) setRamsarStatus("unavailable"); });
    return () => controller.abort();
  }, [ramsarViewportActive, ramsarOverlay]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/civilization/geospatial/diplomacy/unga81/index", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("index_unavailable")))
      .then((index: { affiliations: Unga81Affiliation[] }) => setUngaAffiliations(index.affiliations))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    reviewAbortRef.current?.abort();
    setReviewPacket(null);
    setReviewStatus("idle");
    setReviewMessage(null);
    scenarioAbortRef.current?.abort();
    scenarioBriefAbortRef.current?.abort();
    setScenarioBriefStatus("idle");
    setScenarioBriefMessage(null);
    setScenarioMcpCopyMessage(null);
    scaleWindowAbortRef.current?.abort();
    setScaleWindowEvidence({});
    setScaleBatchSeams({});
    setScaleSourceSummaries({});
    scaleNetworkAbortRef.current?.abort();
    setScaleNetworkResults({});
    setScaleNetworkLoading(null);
    scalePathAbortRef.current?.abort();
    setScalePathBatches({});
    setScalePathLoading(null);
    setScaleWindowLoading(null);
    setScenarioComparison(null);
    setScenarioStatus("idle");
    setScenarioMessage(null);
  }, [routeOrigin, routeDestination, routeNetworkKinds, selectedKey, evaluationLocal, reviewQuestion,
    includeProposedInPacket, proposedWaypoints, proposedUse, proposedMode, includeTerrainPoints, includeGlobalReliefPoints]);

  useEffect(() => {
    routeAbortRef.current?.abort();
    setRouteCandidates([]);
    setRouteGapReview(null);
    setRouteStatus("idle");
    setRouteMessage(null);
    setRouteCoverageGaps([]);
    setRouteMappedOneWayRoadWays(0);
    setRouteBoundaryLineReview(null);
    setRouteHydrographyReview(null);
    setRouteLakeReview(null);
    setRouteSourceAt(null);
  }, [evaluationLocal]);

  useEffect(() => {
    proposedAbortRef.current?.abort();
    setProposedScreen(null);
    setProposedStatus("idle");
    setProposedMessage(null);
  }, [routeOrigin, routeDestination, proposedWaypoints, routeNetworkKinds, evaluationLocal, proposedUse, proposedMode, selectedKey]);

  const takeRoutePoint = (latLng?: MapClickPosition): boolean => {
    const stage = routePickRef.current;
    if (!stage || !latLng) return false;
    const point = { lat: latLng.lat(), lon: latLng.lng() };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return false;
    routePickRef.current = null;
    setRoutePickStage(null);
    if (stage === "waypoint") {
      setProposedWaypoints((current) => current.length < 10 ? [...current, point] : current);
      return true;
    }
    if (stage === "origin") setRouteOrigin(point);
    else setRouteDestination(point);
    setRouteCandidates([]);
    setRouteGapReview(null);
    setRouteBoundaryLineReview(null);
    setRouteHydrographyReview(null);
    setRouteLakeReview(null);
    setRouteStatus("idle");
    googleRouteAbortRef.current?.abort();
    setGoogleRoute(null);
    setGoogleRouteStatus("idle");
    nwsAbortRef.current?.abort();
    setNwsNotices([]);
    setNwsStatus("idle");
    return true;
  };

  const readScaleWindow = (windowSequence: number) => {
    if (scenarioComparison?.corridorScalePlan.status !== "planned") return;
    scaleWindowAbortRef.current?.abort();
    const controller = new AbortController();
    scaleWindowAbortRef.current = controller;
    setScaleWindowLoading(windowSequence);
    setScaleSourceSummaries((current) => {
      const next = { ...current };
      delete next[windowSequence];
      return next;
    });
    setScaleBatchSeams((current) => {
      const next = { ...current };
      delete next[windowSequence];
      delete next[windowSequence - 1];
      return next;
    });
    const plan = scenarioComparison.corridorScalePlan.plan;
    void fetch("/api/civilization/geospatial/review/corridor-scale-window", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: plan.query, windowSequence }),
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Window screen returned HTTP ${response.status}.`)))
      .then((value: { schemaVersion: string; window: { sequence: number }; screen: CorridorScaleWindowUi }) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_corridor_scale_window_evidence/v1" ||
            value.window?.sequence !== windowSequence || !["available", "unavailable"].includes(value.screen?.status)) {
          throw new Error("Window screen response invalid.");
        }
        setScaleWindowEvidence((current) => ({ ...current, [windowSequence]: value.screen }));
        setScaleWindowLoading(null);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setScaleWindowEvidence((current) => ({ ...current, [windowSequence]: {
          status: "unavailable", reason: failure instanceof Error ? failure.message : "Window screen unavailable.",
        } }));
        setScaleWindowLoading(null);
      });
  };

  const readScaleBatch = (nextUnreadSequence: number) => {
    if (scenarioComparison?.corridorScalePlan.status !== "planned") return;
    const startWindowSequence = Math.max(1, nextUnreadSequence - 1);
    const maxWindows = nextUnreadSequence === 1 ? 2 : 3;
    scaleWindowAbortRef.current?.abort();
    const controller = new AbortController();
    scaleWindowAbortRef.current = controller;
    setScaleWindowLoading(nextUnreadSequence);
    setScaleSourceSummaries((current) => {
      const next = { ...current };
      for (let sequence = startWindowSequence; sequence < startWindowSequence + maxWindows; sequence++) delete next[sequence];
      return next;
    });
    setScaleBatchSeams((current) => {
      const next = { ...current };
      for (let sequence = startWindowSequence - 1; sequence < startWindowSequence + maxWindows; sequence++) delete next[sequence];
      return next;
    });
    void fetch("/api/civilization/geospatial/review/corridor-scale-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: scenarioComparison.corridorScalePlan.plan.query,
        startWindowSequence, maxWindows }),
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Corridor batch returned HTTP ${response.status}.`)))
      .then((value: { schemaVersion: string; windows: Array<{ window: { sequence: number }; screen: CorridorScaleWindowUi;
        sourceSummary: CorridorScaleSourceSummaryUi }>;
        seams: CorridorScaleSeamUi[] }) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_corridor_scale_batch_evidence/v1" ||
            !Array.isArray(value.windows) || value.windows.length < 1 || value.windows.length > maxWindows ||
            value.windows[0]?.window.sequence !== startWindowSequence || !Array.isArray(value.seams)) {
          throw new Error("Corridor batch response invalid.");
        }
        setScaleWindowEvidence((current) => ({ ...current, ...Object.fromEntries(value.windows.map((entry) =>
          [entry.window.sequence, entry.screen])) }));
        setScaleBatchSeams((current) => ({ ...current, ...Object.fromEntries(value.seams.map((seam) =>
          [seam.firstWindowSequence, seam])) }));
        setScaleSourceSummaries((current) => ({ ...current, ...Object.fromEntries(value.windows.map((entry) =>
          [entry.window.sequence, entry.sourceSummary])) }));
        setScaleWindowLoading(null);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setScaleWindowEvidence((current) => ({ ...current, [nextUnreadSequence]: {
          status: "unavailable", reason: failure instanceof Error ? failure.message : "Corridor batch unavailable.",
        } }));
        setScaleWindowLoading(null);
      });
  };

  const readScaleNetwork = (startWindowSequence: number) => {
    if (scenarioComparison?.corridorScalePlan.status !== "planned" || !scaleNetworkKind) return;
    scaleNetworkAbortRef.current?.abort();
    scalePathAbortRef.current?.abort();
    scalePathLedgerAbortRef.current?.abort();
    pathReceiptChainAbortRef.current?.abort();
    setPathReceiptChainLoading(null);
    setPathReceiptChains((current) => {
      const next = { ...current };
      delete next[startWindowSequence];
      return next;
    });
    setScalePathLedgerLoading(null);
    setScalePathLedgers((current) => {
      const next = { ...current };
      delete next[startWindowSequence];
      return next;
    });
    mappedPathOptionAbortRef.current?.abort();
    setMappedPathOptionLoading(null);
    setMappedPathOptionReviews((current) => {
      const next = { ...current };
      delete next[startWindowSequence];
      return next;
    });
    setScalePathLoading(null);
    setScalePathBatches((current) => {
      const next = { ...current };
      delete next[startWindowSequence];
      return next;
    });
    const controller = new AbortController();
    scaleNetworkAbortRef.current = controller;
    setScaleNetworkLoading(startWindowSequence);
    void fetch("/api/civilization/geospatial/route-options/corridor-scale-network", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: scenarioComparison.corridorScalePlan.plan.query,
        startWindowSequence, maxWindows: 3, networkKind: scaleNetworkKind,
        maxWaysPerWindow: 100, maxSnapKm: 2 }),
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Network search returned HTTP ${response.status}.`)))
      .then((value: CorridorScaleNetworkUi) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_corridor_scale_network_topology/v4" ||
            value.query?.startWindowSequence !== startWindowSequence || value.query.networkKind !== scaleNetworkKind) {
          throw new Error("Network search response invalid.");
        }
        setScaleNetworkResults((current) => ({ ...current, [startWindowSequence]: value }));
        setScaleNetworkLoading(null);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setScaleNetworkResults((current) => {
          const next = { ...current };
          delete next[startWindowSequence];
          return next;
        });
        setScaleNetworkLoading(null);
        setScenarioMessage(failure instanceof Error ? failure.message : "Network search unavailable.");
      });
  };

  const readScalePathBatch = (startWindowSequence: number, startSegmentIndex: number) => {
    const network = scaleNetworkResults[startWindowSequence];
    if (scenarioComparison?.corridorScalePlan.status !== "planned" ||
        network?.route.status !== "mapped_topology_candidate" || network.route.pathGeometry.status !== "complete") return;
    scalePathAbortRef.current?.abort();
    scalePathLedgerAbortRef.current?.abort();
    pathReceiptChainAbortRef.current?.abort();
    setPathReceiptChainLoading(null);
    setPathReceiptChains((current) => {
      const next = { ...current };
      delete next[startWindowSequence];
      return next;
    });
    setScalePathLedgerLoading(null);
    setScalePathLedgers((current) => {
      const next = { ...current };
      delete next[startWindowSequence];
      return next;
    });
    mappedPathOptionAbortRef.current?.abort();
    setMappedPathOptionLoading(null);
    setMappedPathOptionReviews((current) => {
      const next = { ...current };
      delete next[startWindowSequence];
      return next;
    });
    const controller = new AbortController();
    scalePathAbortRef.current = controller;
    setScalePathLoading(startWindowSequence);
    void fetch("/api/civilization/geospatial/review/corridor-scale-path-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: { network: { plan: scenarioComparison.corridorScalePlan.plan.query,
        startWindowSequence, maxWindows: 3, networkKind: network.query.networkKind,
        maxWaysPerWindow: 100, maxSnapKm: 2 },
      startSegmentIndex, expectedPathSha256: network.route.pathSha256,
      diplomaticIssueId: "regional_connectivity" }, maxPieces: 3 }),
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Mapped path screen returned HTTP ${response.status}.`)))
      .then((value: CorridorScalePathBatchUi) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_corridor_scale_path_batch/v1" ||
            value.network.schemaVersion !== "civilization_corridor_scale_network_topology/v4" ||
            value.network.query.startWindowSequence !== startWindowSequence) {
          throw new Error("Mapped path batch response invalid.");
        }
        setScalePathBatches((current) => ({ ...current, [startWindowSequence]: value }));
        setScaleNetworkResults((current) => ({ ...current, [startWindowSequence]: value.network }));
        setScalePathLoading(null);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setScalePathLoading(null);
        setScenarioMessage(failure instanceof Error ? failure.message : "Mapped path screen unavailable.");
      });
  };

  const readScalePathLedger = (startWindowSequence: number, startSegmentIndex: number) => {
    const network = scaleNetworkResults[startWindowSequence];
    if (scenarioComparison?.corridorScalePlan.status !== "planned" ||
        network?.route.status !== "mapped_topology_candidate" || network.route.pathGeometry.status !== "complete") return;
    const expectedPathSha256 = network.route.pathSha256;
    scalePathLedgerAbortRef.current?.abort();
    const controller = new AbortController();
    scalePathLedgerAbortRef.current = controller;
    setScalePathLedgerLoading(startWindowSequence);
    void fetch("/api/civilization/geospatial/review/corridor-scale-path-ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch: { path: { network: { plan: scenarioComparison.corridorScalePlan.plan.query,
        startWindowSequence, maxWindows: 3, networkKind: network.query.networkKind,
        maxWaysPerWindow: 100, maxSnapKm: 2 },
      startSegmentIndex, expectedPathSha256,
      diplomaticIssueId: "regional_connectivity" }, maxPieces: 3 }, maxBatches: 4 }),
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Mapped path ledger returned HTTP ${response.status}.`)))
      .then((value: CorridorScalePathLedgerUi) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_corridor_scale_path_ledger/v2" ||
            !value.receiptId ||
            value.coverage.pathSha256 !== expectedPathSha256 ||
            value.coverage.startSegmentIndex !== startSegmentIndex) {
          throw new Error("Mapped path ledger response invalid.");
        }
        const prior = scalePathLedgers[startWindowSequence] ?? [];
        const last = prior[prior.length - 1];
        const append = startSegmentIndex > 0 && last?.coverage.nextSegmentIndex === startSegmentIndex &&
          last.coverage.pathSha256 === value.coverage.pathSha256;
        const next = append ? [...prior, value] : [value];
        setScalePathLedgers((current) => ({ ...current, [startWindowSequence]: next }));
        setMappedPathOptionReviews((current) => {
          const updated = { ...current };
          delete updated[startWindowSequence];
          return updated;
        });
        setPathReceiptChains((current) => {
          const updated = { ...current };
          delete updated[startWindowSequence];
          return updated;
        });
        setScalePathLedgerLoading(null);
        if (next.length >= 2) reconcilePathReceiptChain(startWindowSequence, next);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setScalePathLedgerLoading(null);
        setScenarioMessage(failure instanceof Error ? failure.message : "Mapped path ledger unavailable.");
      });
  };

  const reconcilePathReceiptChain = (startWindowSequence: number, ledgers: CorridorScalePathLedgerUi[]) => {
    pathReceiptChainAbortRef.current?.abort();
    const controller = new AbortController();
    pathReceiptChainAbortRef.current = controller;
    const receiptIds = ledgers.map((ledger) => ledger.receiptId);
    setPathReceiptChainLoading(startWindowSequence);
    void fetch("/api/civilization/geospatial/review/corridor-scale-path-receipt-chain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptIds }),
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Path receipt reconciliation returned HTTP ${response.status}.`)))
      .then((value: CorridorScalePathReceiptChainUi) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_corridor_scale_path_receipt_chain/v3" ||
            value.query.receiptIds.join(",") !== receiptIds.join(",") ||
            value.coverage.pathSha256 !== ledgers[0].coverage.pathSha256) {
          throw new Error("Path receipt reconciliation response invalid.");
        }
        setPathReceiptChains((current) => ({ ...current, [startWindowSequence]: value }));
        setMappedPathOptionReviews((current) => {
          const updated = { ...current };
          delete updated[startWindowSequence];
          return updated;
        });
        setPathReceiptChainLoading(null);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setPathReceiptChainLoading(null);
        setScenarioMessage(failure instanceof Error ? failure.message : "Path receipt reconciliation unavailable.");
      });
  };

  const reviewMappedPathOption = (startWindowSequence: number) => {
    const pathBatch = scalePathBatches[startWindowSequence];
    const receiptChain = pathReceiptChains[startWindowSequence];
    const pathLedger = scalePathLedgers[startWindowSequence]?.[0];
    const useChain = receiptChain?.coverage.startSegmentIndex === 0;
    const useLedger = !useChain && scalePathLedgers[startWindowSequence]?.length === 1 &&
      pathLedger?.coverage.startSegmentIndex === 0;
    if (!scenarioComparison || (!pathBatch && !useLedger && !useChain)) return;
    mappedPathOptionAbortRef.current?.abort();
    const controller = new AbortController();
    mappedPathOptionAbortRef.current = controller;
    setMappedPathOptionLoading(startWindowSequence);
    void fetch("/api/civilization/geospatial/diplomacy/scenarios/mapped-path-option", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: scenarioComparison.query,
        ...(useChain ? { pathReceiptChain: receiptChain.query } :
          useLedger ? { pathLedger: pathLedger.query } : { pathBatch: pathBatch!.query }) }),
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Mapped-path option review returned HTTP ${response.status}.`)))
      .then((value: MappedPathOptionReviewUi) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_mapped_path_option_review/v12" ||
            (value.conditionalOption.status === "review_question_only" &&
              value.conditionalOption.pathSha256 !== (useChain ? receiptChain.coverage.pathSha256 :
                useLedger ? pathLedger.coverage.pathSha256 : pathBatch!.coverage.pathSha256))) {
          throw new Error("Mapped-path option review response invalid.");
        }
        setMappedPathOptionReviews((current) => ({ ...current, [startWindowSequence]: value }));
        setMappedPathOptionLoading(null);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setMappedPathOptionLoading(null);
        setScenarioMessage(failure instanceof Error ? failure.message : "Mapped-path option review unavailable.");
      });
  };

  const pickRoutePoint = (stage: "origin" | "destination" | "waypoint") => {
    routePickRef.current = stage;
    setRoutePickStage(stage);
    if (stage === "waypoint") {
      setRouteMessage(null);
      setProposedMessage("Click the map to add the next sketch waypoint.");
    } else {
      setProposedMessage(null);
      setRouteMessage(`Click the map to set the ${stage}.`);
    }
  };

  useEffect(() => {
    const refreshKey = () => {
      const sequence = ++keyLoadSequenceRef.current;
      void loadCivilizationMapsBrowserKey().then((state) => {
        if (sequence !== keyLoadSequenceRef.current) return;
        setKeyLoadFailed(false);
        setBrowserKey(state.key);
        setKeyRevision((revision) => revision + 1);
      }).catch(() => {
        if (sequence !== keyLoadSequenceRef.current) return;
        setKeyLoadFailed(true);
        setBrowserKey(null);
        setKeyRevision((revision) => revision + 1);
      });
    };
    refreshKey();
    window.addEventListener(CIVILIZATION_GEOSPATIAL_CONFIG_CHANGED_EVENT, refreshKey);
    return () => {
      keyLoadSequenceRef.current += 1;
      window.removeEventListener(CIVILIZATION_GEOSPATIAL_CONFIG_CHANGED_EVENT, refreshKey);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (browserKey === undefined) return;
    if (!browserKey) {
      setLoading(false);
      setError(keyLoadFailed
        ? "The saved Maps key could not be read from this desktop profile. Check developer sign-in and protected storage."
        : "No Maps browser key is saved for this app window.");
      return;
    }

    let cancelled = false;
    let authFailed = false;
    let retryTimer: number | null = null;
    let attempts = 0;
    setLoading(true);
    setError(null);
    const priorAuthFailure = window.gm_authFailure;
    const onAuthFailure = () => {
      authFailed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      setLoading(false);
      setError("Google rejected the Maps key or this app origin. Check API and referrer restrictions in Google Cloud.");
      priorAuthFailure?.();
    };
    window.gm_authFailure = onAuthFailure;

    const startMap = () => {
      attempts += 1;
      void loadGoogleMaps(browserKey)
      .then(({ Map }) => {
        if (cancelled || authFailed || !hostRef.current) return;
        const map = new Map(hostRef.current, {
          center: { lat: 18, lng: 0 },
          zoom: 2,
          minZoom: 2,
          maxZoom: 12,
          mapTypeId: "roadmap",
          backgroundColor: "#06110f",
          clickableIcons: false,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
          styles: [
            { elementType: "geometry", stylers: [{ color: "#152622" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#a7c3ba" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#07120f" }] },
            { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#6b8b7f" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0c2730" }] },
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
          ],
        });
        mapRef.current = map;
        setMapInstance(map);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled || authFailed) return;
        if (attempts < 2) {
          retryTimer = window.setTimeout(startMap, 1200);
          return;
        }
        setLoading(false);
        setError("Google Maps could not load after retrying. The saved key is still present; check network access, enabled APIs, billing, and app origin restrictions.");
      });
    };
    startMap();

    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (window.gm_authFailure === onAuthFailure) window.gm_authFailure = priorAuthFailure;
      boundaryAbortRef.current?.abort();
      boundaryLineAbortRef.current?.abort();
      infrastructureAbortRef.current?.abort();
      hydroAbortRef.current?.abort();
      lakesAbortRef.current?.abort();
      portAbortRef.current?.abort();
      wpiAbortRef.current?.abort();
      autoCoverageRef.current = { boundaryLines: null, infrastructure: null, hydrography: null, lakes: null, ports: null, wpi: null };
      mapRef.current = null;
      setMapInstance(null);
      setMapReady(false);
    };
  }, [browserKey, keyRevision, keyLoadFailed]);

  useEffect(() => {
    const map = mapInstance;
    if (!map) return;
    const countryClick = map.data.addListener("click", ({ feature, latLng }) => {
      if (takeRoutePoint(latLng)) return;
      const name = feature.getProperty("name");
      const iso3 = typeof name === "string" ? affiliationForCountryName(name, ungaAffiliations) : null;
      if (iso3) onToggleCountry(iso3);
    });
    const countryHover = map.data.addListener("mouseover", ({ feature }) => {
      if (hoverLeaveTimerRef.current !== null) window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
      const name = feature.getProperty("name");
      setHoveredIso3(typeof name === "string" ? affiliationForCountryName(name, ungaAffiliations) : null);
    });
    const countryLeave = map.data.addListener("mouseout", () => {
      if (hoverLeaveTimerRef.current !== null) window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = window.setTimeout(() => {
        hoverLeaveTimerRef.current = null;
        if (!hoverCardActiveRef.current) setHoveredIso3(null);
      }, 180);
    });
    return () => {
      countryClick.remove(); countryHover.remove(); countryLeave.remove();
      if (hoverLeaveTimerRef.current !== null) window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    };
  }, [mapInstance, onToggleCountry, ungaAffiliations]);

  useEffect(() => {
    const map = mapInstance;
    if (!map) return;
    const controller = new AbortController();
    let cancelled = false;

    void fetch(GEO_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("country_topology_unavailable");
        return response.json();
      })
      .then((topology: { objects?: Record<string, unknown> }) => {
        const countries = topology.objects?.countries;
        if (!countries) throw new Error("country_topology_missing");
        map.data.addGeoJson(topojsonFeature(topology, countries));
        if (!cancelled) setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Google tiles loaded, but country click-selection could not be loaded.");
          setMapReady(true);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mapInstance]);

  useEffect(() => {
    if (!mapInstance) return;
    const listener = mapInstance.addListener("click", ({ latLng }) => { takeRoutePoint(latLng); });
    return () => listener.remove();
  }, [mapInstance]);

  useEffect(() => {
    const map = mapInstance;
    if (!map || !mapReady) return;
    const capture = () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      const southwest = bounds.getSouthWest();
      const northeast = bounds.getNorthEast();
      const next: MapBbox = [southwest.lng(), southwest.lat(), northeast.lng(), northeast.lat()];
      setViewportBbox((current) => current && current.every((value, index) => Math.abs(value - next[index]) < 0.0001)
        ? current : next);
    };
    const listener = map.addListener("idle", capture);
    capture();
    return () => { listener.remove(); setViewportBbox(null); };
  }, [mapInstance, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const controller = new AbortController();
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
    setSeismicStatus("loading");
    setSelectedSeismic(null);
    void fetch("/api/civilization/geospatial/evidence/usgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bbox: [-180, -90, 180, 90],
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        minMagnitude: 4.5,
        maxEvents: 100,
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("usgs_evidence_unavailable");
        return response.json();
      })
      .then((value: {
        collection?: unknown;
        source?: { fetchedAt?: unknown };
        coverage?: { possiblyTruncated?: unknown };
      }) => {
        if (controller.signal.aborted) return;
        if (validateCivilizationSourceMeasurementCollectionV1(value.collection).length > 0) {
          throw new Error("usgs_evidence_invalid");
        }
        const collection = value.collection as { measurements: CivilizationSourceMeasurementV1[] };
        setSeismicMeasurements(collection.measurements.filter((measurement) =>
          measurement.sourceKind === "usgs_earthquake" &&
          measurement.domain === "seismic_activity" &&
          measurement.geometry.coordinates != null
        ));
        setSeismicFetchedAt(typeof value.source?.fetchedAt === "string" ? value.source.fetchedAt : null);
        setSeismicPossiblyTruncated(value.coverage?.possiblyTruncated === true);
        setSeismicStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setSeismicStatus("unavailable");
      });
    return () => controller.abort();
  }, [mapReady]);

  useEffect(() => () => infrastructureAbortRef.current?.abort(), []);
  useEffect(() => () => portAbortRef.current?.abort(), []);
  useEffect(() => () => wpiAbortRef.current?.abort(), []);
  useEffect(() => () => hydroAbortRef.current?.abort(), []);
  useEffect(() => () => boundaryAbortRef.current?.abort(), []);
  useEffect(() => () => boundaryLineAbortRef.current?.abort(), []);
  useEffect(() => () => routeAbortRef.current?.abort(), []);
  useEffect(() => () => googleRouteAbortRef.current?.abort(), []);
  useEffect(() => () => reviewAbortRef.current?.abort(), []);
  useEffect(() => () => nwsAbortRef.current?.abort(), []);
  useEffect(() => () => noaaAbortRef.current?.abort(), []);

  const loadNoaaWaterLevel = () => {
    const station = noaaStationInput.trim();
    if (!/^[A-Za-z0-9]{5,10}$/.test(station)) {
      setNoaaMessage("Enter a NOAA CO-OPS station ID (5–10 letters or digits).");
      return;
    }
    noaaAbortRef.current?.abort();
    const controller = new AbortController();
    noaaAbortRef.current = controller;
    setNoaaStatus("loading");
    setNoaaMessage(null);
    setNoaaMeasurements([]);
    setNoaaSource(null);
    void fetch("/api/civilization/geospatial/evidence/noaa-water-level", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ station, date: noaaDate, datum: noaaDatum, maxMeasurements: 100 }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error === "source_provider_error"
            ? "NOAA did not return water-level data for this station, date, and datum. Check the station and datum."
            : `NOAA water-level source returned HTTP ${response.status}.`);
        }
        return response.json();
      })
      .then((value: { schemaVersion?: unknown; collection?: unknown; source?: unknown; coverage?: unknown }) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_noaa_water_level_evidence/v1" ||
            validateCivilizationSourceMeasurementCollectionV1(value.collection).length > 0 ||
            !value.source || typeof value.source !== "object") {
          throw new Error("NOAA water-level evidence response invalid.");
        }
        const source = value.source as { fetchedAt: string; sourceUrl: string; station: { id: string; name: string | null; lat: number | null; lon: number | null }; datum: string };
        const coverage = value.coverage as { missingEvidence?: string[]; possiblyTruncated?: boolean } | undefined;
        const collection = value.collection as { measurements: CivilizationSourceMeasurementV1[] };
        setNoaaMeasurements(collection.measurements.filter((measurement) =>
          measurement.sourceKind === "noaa_coops" && measurement.domain === "water_level"));
        setNoaaSource(source);
        setNoaaGaps(Array.isArray(coverage?.missingEvidence) ? coverage.missingEvidence : []);
        setNoaaTruncated(coverage?.possiblyTruncated === true);
        setNoaaStatus("ready");
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setNoaaStatus("unavailable");
        setNoaaMessage(failure instanceof Error ? failure.message : "NOAA water-level source unavailable.");
      });
  };

  const loadNwsNotices = (point: { lat: number; lon: number } | null) => {
    if (!point) {
      setNwsMessage("Set that endpoint on the map first.");
      return;
    }
    nwsAbortRef.current?.abort();
    const controller = new AbortController();
    nwsAbortRef.current = controller;
    setNwsStatus("loading");
    setNwsMessage(null);
    setNwsNotices([]);
    void fetch("/api/civilization/geospatial/evidence/nws-active-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ point, maxAlerts: 10 }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(response.status === 422
          ? "NWS does not cover this point." : `NWS alert source returned HTTP ${response.status}.`);
        return response.json();
      })
      .then((value: {
        schemaVersion?: unknown;
        atlas?: unknown;
        source?: { fetchedAt?: unknown };
        coverage?: { possiblyTruncated?: unknown };
      }) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_nws_active_alert_evidence/v1" ||
            validateCivilizationTraversabilityAtlasV1(value.atlas).length > 0) {
          throw new Error("NWS alert evidence response invalid.");
        }
        const atlas = value.atlas as { naturalHazardNotices?: CivilizationNaturalHazardNoticeV1[] };
        setNwsNotices(atlas.naturalHazardNotices ?? []);
        setNwsQueryPoint(point);
        setNwsFetchedAt(typeof value.source?.fetchedAt === "string" ? value.source.fetchedAt : null);
        setNwsPossiblyTruncated(value.coverage?.possiblyTruncated === true);
        setNwsStatus("ready");
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setNwsStatus("unavailable");
        setNwsMessage(failure instanceof Error ? failure.message : "NWS alert source unavailable.");
      });
  };

  useEffect(() => {
    const map = mapInstance;
    const Marker = window.google?.maps.Marker;
    if (!map || !mapReady || !Marker || !nwsVisible || nwsNotices.length === 0 || !nwsQueryPoint) return;
    const marker = new Marker({
      map,
      position: { lat: nwsQueryPoint.lat, lng: nwsQueryPoint.lon },
      title: `${nwsNotices.length} NWS alert notices returned for this queried point; marker is not an alert footprint`,
      icon: {
        path: window.google?.maps.SymbolPath?.CIRCLE,
        fillColor: "#ef4444",
        fillOpacity: 0.88,
        strokeColor: "#fef2f2",
        strokeWeight: 2,
        scale: 13,
      },
      zIndex: 50,
    });
    return () => marker.setMap(null);
  }, [mapInstance, mapReady, nwsNotices, nwsQueryPoint, nwsVisible]);

  useEffect(() => {
    const map = mapInstance;
    const Marker = window.google?.maps.Marker;
    const station = noaaSource?.station;
    if (!map || !mapReady || !Marker || !noaaVisible || !station || station.lat == null || station.lon == null) return;
    const marker = new Marker({
      map,
      position: { lat: station.lat, lng: station.lon },
      title: `NOAA CO-OPS station ${station.id}; water-level observations apply at this station, not along a route`,
      icon: {
        path: window.google?.maps.SymbolPath?.CIRCLE,
        fillColor: "#38bdf8", fillOpacity: 0.9,
        strokeColor: "#f0f9ff", strokeWeight: 2, scale: 10,
      },
      zIndex: 52,
    });
    return () => marker.setMap(null);
  }, [mapInstance, mapReady, noaaSource, noaaVisible]);

  const loadRouteOptions = () => {
    const evaluatedAt = new Date(evaluationLocal);
    if (!Number.isFinite(evaluatedAt.getTime())) {
      setRouteMessage("Choose a valid local date and time for the review.");
      return;
    }
    const bounds = mapRef.current?.getBounds();
    if (!bounds || !routeOrigin || !routeDestination || routeNetworkKinds.length === 0) {
      setRouteMessage("Set both endpoints and select one or more network kinds.");
      return;
    }
    const southwest = bounds.getSouthWest();
    const northeast = bounds.getNorthEast();
    const bbox: [number, number, number, number] = [
      southwest.lng(), southwest.lat(), northeast.lng(), northeast.lat(),
    ];
    if (bbox.some((value) => !Number.isFinite(value)) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3] ||
        bbox[2] - bbox[0] > 1 || bbox[3] - bbox[1] > 1 ||
        [routeOrigin, routeDestination].some((point) => point.lon < bbox[0] || point.lon > bbox[2] ||
          point.lat < bbox[1] || point.lat > bbox[3])) {
      setRouteMessage("Zoom into an area under 1° × 1° containing both endpoints; split date-line areas.");
      return;
    }
    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    setRouteStatus("loading");
    setRouteCandidates([]);
    setRouteGapReview(null);
    setRouteMessage(null);
    void fetch("/api/civilization/geospatial/route-options/mapped-network", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bbox, origin: routeOrigin, destination: routeDestination,
        networkKinds: routeNetworkKinds, objective: "shortest_mapped_length",
        evaluatedAt: evaluatedAt.toISOString(), maxSnapKm: 2, maxWays: 200, maxCandidates: 3,
        includeBoundaryLineReview: true,
        includeHydrographyReview: true,
        includeLakeReview: true,
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Mapped-network source returned HTTP ${response.status}.`);
        return response.json();
      })
      .then((value: {
        schemaVersion?: unknown;
        atlas?: unknown;
        coverage?: { status?: unknown; missingEvidence?: unknown; possiblyTruncated?: unknown; mappedOneWayRoadWays?: unknown };
        source?: { fetchedAt?: unknown };
        boundaryLineReview?: RouteBoundaryLineReviewUi;
        hydrographyReview?: RouteHydrographyReviewUi;
        lakeReview?: RouteLakeReviewUi;
        gapReview?: MappedGapReviewUi;
      }) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_mapped_network_route_options/v6" ||
            validateCivilizationTraversabilityAtlasV1(value.atlas).length > 0) {
          throw new Error("Mapped-network route response invalid.");
        }
        const atlas = value.atlas as { mappedNetworkRouteCandidates?: CivilizationMappedNetworkRouteCandidateV1[] };
        setRouteCandidates(atlas.mappedNetworkRouteCandidates ?? []);
        setRouteGapReview(value.gapReview ?? null);
        setRouteBoundaryLineReview(value.boundaryLineReview ?? null);
        setRouteHydrographyReview(value.hydrographyReview ?? null);
        setRouteLakeReview(value.lakeReview ?? null);
        setRouteSelectedIndex(0);
        setRouteCoverageGaps(Array.isArray(value.coverage?.missingEvidence)
          ? value.coverage.missingEvidence.filter((item): item is string => typeof item === "string") : []);
        setRouteMappedOneWayRoadWays(typeof value.coverage?.mappedOneWayRoadWays === "number"
          ? value.coverage.mappedOneWayRoadWays : 0);
        setRouteSourceAt(typeof value.source?.fetchedAt === "string" ? value.source.fetchedAt : null);
        setRouteStatus("ready");
        setRouteMessage(atlas.mappedNetworkRouteCandidates?.length
          ? value.coverage?.possiblyTruncated === true ? "Inventory limit reached; alignment may be incomplete." : null
          : value.coverage?.status === "endpoints_snap_to_same_node"
            ? "Both endpoints snapped to one mapped node. Choose points farther apart."
            : "The considered nearby mapped nodes did not connect in this bounded inventory. This does not rule out a real route.");
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setRouteStatus("unavailable");
        setRouteMessage(failure instanceof Error ? failure.message : "Mapped-network source unavailable.");
      });
  };

  const screenProposedCorridor = () => {
    const evaluatedAt = new Date(evaluationLocal);
    const bounds = mapRef.current?.getBounds();
    if (!Number.isFinite(evaluatedAt.getTime()) || !bounds || !routeOrigin || !routeDestination || proposedUse.trim().length < 3) {
      setProposedMessage("Set two endpoints, a proposed use, and a valid assessment time.");
      return;
    }
    const southwest = bounds.getSouthWest();
    const northeast = bounds.getNorthEast();
    const bbox: [number, number, number, number] = [southwest.lng(), southwest.lat(), northeast.lng(), northeast.lat()];
    const vertices = [routeOrigin, ...proposedWaypoints, routeDestination];
    if (bbox.some((value) => !Number.isFinite(value)) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3] ||
        bbox[2] - bbox[0] > 5 || bbox[3] - bbox[1] > 5 ||
        vertices.some((point) => point.lon < bbox[0] || point.lon > bbox[2] || point.lat < bbox[1] || point.lat > bbox[3]) ||
        vertices.some((point, index) => index > 0 && point.lat === vertices[index - 1].lat && point.lon === vertices[index - 1].lon)) {
      setProposedMessage("Zoom into an area under 5° × 5° containing distinct consecutive sketch points; split date-line areas.");
      return;
    }
    proposedAbortRef.current?.abort();
    const controller = new AbortController();
    proposedAbortRef.current = controller;
    setProposedStatus("loading");
    setProposedScreen(null);
    setProposedMessage(null);
    void fetch("/api/civilization/geospatial/review/proposed-corridor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bbox, vertices, intendedUse: proposedUse.trim(),
        contemplatedModes: proposedMode === "unspecified" ? [] : [proposedMode],
        countryIso3s: selectedIso3s.slice(0, 2),
        mappedInfrastructureKinds: routeNetworkKinds,
        includeTerrainPointObservations: includeTerrainPoints,
        includeGlobalReliefObservations: includeGlobalReliefPoints,
        evaluatedAt: evaluatedAt.toISOString(),
      }),
      signal: controller.signal,
    }).then((response) => {
      if (!response.ok) throw new Error(`Proposed-corridor screen returned HTTP ${response.status}.`);
      return response.json();
    }).then((value: ProposedCorridorScreenUi) => {
      if (controller.signal.aborted) return;
      if (value.schemaVersion !== "civilization_proposed_corridor_screen/v12" ||
          value.routeFindingPerformed !== false || value.infrastructureAssumed !== false ||
          !Array.isArray(value.unresolved) || !Array.isArray(value.query?.vertices) ||
          !Array.isArray(value.administrativeBoundaries) || !value.mappedInfrastructure?.status ||
          !Array.isArray(value.countryGeometryScreen?.contacts) || !Array.isArray(value.countryDepictionCandidates?.candidates) ||
          !value.terrainPoints?.status || !value.globalReliefPoints?.status) {
        throw new Error("Proposed-corridor screen response invalid.");
      }
      setProposedScreen(value);
      setProposedStatus("ready");
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      setProposedStatus("unavailable");
      setProposedMessage(failure instanceof Error ? failure.message : "Proposed-corridor screen unavailable.");
    });
  };

  const loadGoogleRoute = () => {
    if (!routeOrigin || !routeDestination) {
      setGoogleRouteMessage("Set both endpoints on the Google map first.");
      return;
    }
    googleRouteAbortRef.current?.abort();
    const controller = new AbortController();
    googleRouteAbortRef.current = controller;
    setGoogleRoute(null);
    setGoogleRouteStatus("loading");
    setGoogleRouteMessage(null);
    void fetch("/api/civilization/geospatial/route-options/google-supported-mode", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: routeOrigin, destination: routeDestination, travelMode: googleTravelMode }),
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(response.status === 503
          ? "A server-side Routes key has not been connected to this app. Configure the dedicated key before requesting a Google route."
          : response.status === 403 ? "Google route access requires the signed-in developer session."
            : `Google route source returned HTTP ${response.status}.`);
        return response.json();
      })
      .then((value: {
        schemaVersion?: unknown;
        source?: { fetchedAt?: unknown };
        coverage?: { missingEvidence?: unknown };
        route?: { encodedPolyline?: unknown; distanceMeters?: unknown; durationSeconds?: unknown } | null;
      }) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_google_routes_evidence/v1") throw new Error("Google route response invalid.");
        if (!value.route) {
          setGoogleRouteStatus("ready");
          setGoogleRouteMessage("Google returned no route for this travel mode. Other networks were not assessed.");
          return;
        }
        const path = typeof value.route.encodedPolyline === "string"
          ? decodeGoogleRoutePolyline(value.route.encodedPolyline) : [];
        if (path.length < 2 || typeof value.route.distanceMeters !== "number" ||
            typeof value.route.durationSeconds !== "number" || typeof value.source?.fetchedAt !== "string") {
          throw new Error("Google route geometry invalid.");
        }
        setGoogleRoute({
          path,
          distanceMeters: value.route.distanceMeters,
          durationSeconds: value.route.durationSeconds,
          fetchedAt: value.source.fetchedAt,
          missingEvidence: Array.isArray(value.coverage?.missingEvidence)
            ? value.coverage.missingEvidence.filter((item): item is string => typeof item === "string") : [],
        });
        setGoogleRouteStatus("ready");
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setGoogleRouteStatus("unavailable");
        setGoogleRouteMessage(failure instanceof Error ? failure.message : "Google route source unavailable.");
      });
  };

  useEffect(() => {
    const Polyline = window.google?.maps.Polyline;
    if (!mapInstance || !Polyline || !googleRouteVisible || !googleRoute) return;
    const line = new Polyline({
      map: mapInstance,
      path: googleRoute.path,
      strokeColor: "#22d3ee",
      strokeOpacity: 0.95,
      strokeWeight: 4,
      zIndex: 42,
    });
    return () => line.setMap(null);
  }, [mapInstance, googleRoute, googleRouteVisible]);

  useEffect(() => {
    const Polyline = window.google?.maps.Polyline;
    if (!mapInstance || !Polyline || !proposedVisible || !routeOrigin || !routeDestination) return;
    const vertices = proposedScreen?.query.vertices ?? [routeOrigin, ...proposedWaypoints, routeDestination];
    const line = new Polyline({
      map: mapInstance,
      path: vertices.map((point) => ({ lat: point.lat, lng: point.lon })),
      strokeColor: "#fbbf24",
      strokeOpacity: 0,
      strokeWeight: 3,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: proposedScreen ? 1 : 0.55, scale: 4 }, offset: "0", repeat: "18px" }],
      clickable: false,
      zIndex: 39,
    });
    return () => line.setMap(null);
  }, [mapInstance, routeOrigin, routeDestination, proposedWaypoints, proposedScreen, proposedVisible]);

  useEffect(() => {
    const Marker = window.google?.maps.Marker;
    if (!mapInstance || !Marker || !proposedVisible) return;
    const markers = proposedWaypoints.map((point, index) => new Marker({
      map: mapInstance,
      position: { lat: point.lat, lng: point.lon },
      title: `Proposed sketch waypoint ${index + 1}; this is user supplied, not sourced infrastructure`,
      clickable: false,
      icon: {
        path: window.google?.maps.SymbolPath?.CIRCLE,
        fillColor: "#fbbf24",
        fillOpacity: 0.9,
        strokeColor: "#111827",
        strokeWeight: 2,
        scale: 5,
      },
      zIndex: 41,
    }));
    return () => markers.forEach((marker) => marker.setMap(null));
  }, [mapInstance, proposedWaypoints, proposedVisible]);

  const buildDiplomaticPacket = () => {
    const question = reviewQuestion.trim();
    const evaluatedAt = new Date(evaluationLocal);
    if (!Number.isFinite(evaluatedAt.getTime())) {
      setReviewMessage("Choose a valid local date and time for the review.");
      return;
    }
    const bounds = mapRef.current?.getBounds();
    if (question.length < 5) {
      setReviewMessage("Enter a review question with at least five characters.");
      return;
    }
    if (!bounds || !routeOrigin || !routeDestination || routeNetworkKinds.length === 0) {
      setReviewMessage("Set both endpoints and select one or more network kinds.");
      return;
    }
    const southwest = bounds.getSouthWest();
    const northeast = bounds.getNorthEast();
    const bbox: [number, number, number, number] = [
      southwest.lng(), southwest.lat(), northeast.lng(), northeast.lat(),
    ];
    if (bbox.some((value) => !Number.isFinite(value)) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3] ||
        bbox[2] - bbox[0] > 1 || bbox[3] - bbox[1] > 1 ||
        [routeOrigin, routeDestination].some((point) => point.lon < bbox[0] || point.lon > bbox[2] ||
          point.lat < bbox[1] || point.lat > bbox[3])) {
      setReviewMessage("Zoom into an area under 1° × 1° containing both endpoints; split date-line areas.");
      return;
    }
    const proposedVertices = [routeOrigin, ...proposedWaypoints, routeDestination];
    if (includeProposedInPacket && (proposedUse.trim().length < 3 ||
        proposedVertices.some((point) => point.lon < bbox[0] || point.lon > bbox[2] || point.lat < bbox[1] || point.lat > bbox[3]) ||
        proposedVertices.some((point, index) => index > 0 && point.lat === proposedVertices[index - 1].lat && point.lon === proposedVertices[index - 1].lon))) {
      setReviewMessage("The attached proposed sketch needs a use and distinct points inside this 1° corridor area.");
      return;
    }
    reviewAbortRef.current?.abort();
    const controller = new AbortController();
    reviewAbortRef.current = controller;
    setReviewStatus("loading");
    setReviewMessage(null);
    setReviewPacket(null);
    scenarioAbortRef.current?.abort();
    setScenarioComparison(null);
    setScenarioStatus("idle");
    void fetch("/api/civilization/geospatial/review/diplomatic-corridor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        route: {
          bbox, origin: routeOrigin, destination: routeDestination,
          networkKinds: routeNetworkKinds, objective: "shortest_mapped_length",
          evaluatedAt: evaluatedAt.toISOString(), maxSnapKm: 2, maxWays: 200, maxCandidates: 3,
        },
        countryIso3s: selectedIso3s.slice(0, 2),
        ...(includeProposedInPacket ? { proposedSketch: {
          vertices: proposedVertices, intendedUse: proposedUse.trim(),
          contemplatedModes: proposedMode === "unspecified" ? [] : [proposedMode],
          mappedInfrastructureKinds: routeNetworkKinds,
          includeTerrainPointObservations: includeTerrainPoints,
          includeGlobalReliefObservations: includeGlobalReliefPoints,
        } } : {}),
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Diplomatic packet returned HTTP ${response.status}.`);
        return response.json();
      })
      .then((value: DiplomaticCorridorPacketUi) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_diplomatic_corridor_packet/v17" ||
            !Array.isArray(value.sourceLedger) || !Array.isArray(value.unresolved) ||
            !value.proposedCorridor?.status) {
          throw new Error("Diplomatic packet response invalid.");
        }
        setReviewPacket(value);
        setReviewStatus("ready");
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setReviewStatus("unavailable");
        setReviewMessage(failure instanceof Error ? failure.message : "Diplomatic packet unavailable.");
      });
  };

  const downloadDiplomaticPacket = () => {
    if (!reviewPacket) return;
    const data = new Blob([JSON.stringify(reviewPacket, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `civilization-diplomatic-corridor-${reviewPacket.collectedAt.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadScenarioReasoningBrief = () => {
    if (!scenarioComparison || scenarioBriefStatus === "loading") return;
    scenarioBriefAbortRef.current?.abort();
    const controller = new AbortController();
    scenarioBriefAbortRef.current = controller;
    setScenarioBriefStatus("loading");
    setScenarioBriefMessage(null);
    void fetch("/api/civilization/geospatial/diplomacy/scenarios/brief", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenarioComparison.query), signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Reasoning brief returned HTTP ${response.status}.`)))
      .then((value: { schemaVersion?: string; query?: { firstCountryIso3?: string; secondCountryIso3?: string }; fullReceiptTool?: string }) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_scenario_reasoning_brief/v15" ||
            value.fullReceiptTool !== "helix_civilization_scenario_comparison" ||
            value.query?.firstCountryIso3 !== scenarioComparison.query.firstCountryIso3 ||
            value.query?.secondCountryIso3 !== scenarioComparison.query.secondCountryIso3) {
          throw new Error("Reasoning brief response invalid.");
        }
        const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `civilization-reasoning-brief-${scenarioComparison.query.firstCountryIso3}-${scenarioComparison.query.secondCountryIso3}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setScenarioBriefStatus("idle");
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setScenarioBriefStatus("unavailable");
        setScenarioBriefMessage(failure instanceof Error ? failure.message : "Reasoning brief unavailable.");
      });
  };

  const compareDiplomaticScenarios = () => {
    if (selectedIso3s.length !== 2) {
      setScenarioMessage("Select exactly two countries to compare options.");
      return;
    }
    const corridorPacket = reviewPacket &&
      reviewPacket.query.countryIso3s.length === 2 &&
      reviewPacket.query.countryIso3s.every((iso3) => selectedIso3s.includes(iso3))
      ? reviewPacket : null;
    const sketchVertices = routeOrigin && routeDestination
      ? [routeOrigin, ...proposedWaypoints, routeDestination] : [];
    const sketchEvaluatedAt = new Date(evaluationLocal);
    const canPlanScaleSketch = sketchVertices.length >= 2 && sketchVertices.length <= 64 &&
      proposedUse.trim().length >= 3 && Number.isFinite(sketchEvaluatedAt.getTime()) &&
      sketchVertices.every((point, index) => index === 0 ||
        point.lat !== sketchVertices[index - 1].lat || point.lon !== sketchVertices[index - 1].lon);
    if (canPlanScaleSketch && scenarioHorizonYear < sketchEvaluatedAt.getUTCFullYear()) {
      setScenarioMessage("Select a planning year after the corridor sketch evaluation year.");
      return;
    }
    if (corridorPacket && scenarioHorizonYear < new Date(corridorPacket.query.route.evaluatedAt).getUTCFullYear()) {
      setScenarioMessage("Select a planning year after the map evidence evaluation year.");
      return;
    }
    scenarioAbortRef.current?.abort();
    scenarioBriefAbortRef.current?.abort();
    setScenarioBriefStatus("idle");
    setScenarioBriefMessage(null);
    setScenarioMcpCopyMessage(null);
    const controller = new AbortController();
    scenarioAbortRef.current = controller;
    scaleWindowAbortRef.current?.abort();
    setScaleWindowEvidence({});
    setScaleBatchSeams({});
    setScaleSourceSummaries({});
    setScaleWindowLoading(null);
    scaleNetworkAbortRef.current?.abort();
    setScaleNetworkResults({});
    setScaleNetworkLoading(null);
    scalePathAbortRef.current?.abort();
    setScalePathBatches({});
    setScalePathLoading(null);
    scalePathLedgerAbortRef.current?.abort();
    setScalePathLedgers({});
    setScalePathLedgerLoading(null);
    pathReceiptChainAbortRef.current?.abort();
    setPathReceiptChains({});
    setPathReceiptChainLoading(null);
    mappedPathOptionAbortRef.current?.abort();
    setMappedPathOptionReviews({});
    setMappedPathOptionLoading(null);
    setScenarioStatus("loading");
    setScenarioMessage(null);
    setScenarioComparison(null);
    void fetch("/api/civilization/geospatial/diplomacy/scenarios/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstCountryIso3: selectedIso3s[0],
        secondCountryIso3: selectedIso3s[1],
        tradeYear: scenarioTradeYear,
        planningHorizonYear: scenarioHorizonYear,
        objectives: scenarioObjectives,
        constraints: {
          respectSovereigntyAndJurisdiction: true,
          requireDocumentedTransitAndConstructionPermissions: true,
          requireAffectedThirdPartyConsent: true,
          requireEnvironmentalAndCommunityReview: true,
          maximumBudgetUsd: null,
          additionalConditions: [],
        },
        ...(corridorPacket ? { corridor: corridorPacket.query } : {}),
        ...(canPlanScaleSketch ? { corridorScaleSketch: {
          vertices: sketchVertices, intendedUse: proposedUse.trim(),
          countryIso3s: selectedIso3s, mappedInfrastructureKinds: routeNetworkKinds,
          contemplatedModes: proposedMode === "unspecified" ? [] : [proposedMode],
          includeTerrainPointObservations: includeTerrainPoints,
          includeGlobalReliefObservations: includeGlobalReliefPoints,
          evaluatedAt: sketchEvaluatedAt.toISOString(), maxWindows: 48,
        } } : {}),
      }),
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Scenario comparison returned HTTP ${response.status}.`)))
      .then((value: ScenarioComparisonUi) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_diplomatic_scenario_comparison/v130" || !Array.isArray(value.options) ||
          !Array.isArray(value.optionDiscussionBasis) ||
          !Array.isArray(value.provisionalPairReviewLeads?.countries) || !Array.isArray(value.optionEvidenceLedgers) || value.reviewActorGraph?.schemaVersion !== "civilization_option_review_actor_graph/v8" ||
          !Array.isArray(value.optionInteractionReview?.links) || !Array.isArray(value.screenedGeometryComparison) ||
          !value.corridorScalePlan || !["not_requested", "planned"].includes(value.corridorScalePlan.status)) {
          throw new Error("Scenario comparison response invalid.");
        }
        setScenarioComparison(value);
        setScenarioStatus("ready");
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setScenarioStatus("unavailable");
        setScenarioMessage(failure instanceof Error ? failure.message : "Scenario comparison unavailable.");
      });
  };

  const openScenarioComparison = () => {
    if (mapToolsDetailsRef.current) mapToolsDetailsRef.current.open = true;
    if (scenarioDetailsRef.current) scenarioDetailsRef.current.open = true;
    window.requestAnimationFrame(() => scenarioDetailsRef.current?.scrollIntoView({ block: "nearest" }));
    compareDiplomaticScenarios();
  };

  const downloadProposedScreen = () => {
    if (!proposedScreen) return;
    const data = new Blob([JSON.stringify(proposedScreen, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `civilization-proposed-corridor-${proposedScreen.collectedAt.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  useEffect(() => {
    const map = mapInstance;
    const Polyline = window.google?.maps.Polyline;
    if (!map || !mapReady || !Polyline || !routeCandidate || !routeVisible) return;
    const overlay = new Polyline({
      map,
      path: routeCandidate.coordinates.map((point) => ({ lat: point.lat, lng: point.lon })),
      strokeColor: "#f8fafc",
      strokeOpacity: 0.95,
      strokeWeight: 5,
      clickable: false,
      zIndex: 40,
    });
    return () => overlay.setMap(null);
  }, [mapInstance, mapReady, routeCandidate, routeVisible]);

  useEffect(() => {
    const map = mapInstance;
    const Marker = window.google?.maps.Marker;
    if (!map || !mapReady || !Marker || !routeVisible || !routeCandidate ||
        routeBoundaryLineReview?.status !== "available") return;
    const encounters = (routeBoundaryLineReview.encounters ?? [])
      .filter((item) => item.candidateId === routeCandidate.candidateId);
    const markers = encounters.map((item) => new Marker({
      map,
      position: { lat: item.position.lat, lng: item.position.lon },
      title: `${item.recordCategory}: ${item.lineLabel} — editorial line contact only`,
      icon: {
        path: window.google?.maps.SymbolPath?.CIRCLE,
        scale: 5,
        fillColor: "#fb7185",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 1,
      },
      zIndex: 50,
    }));
    return () => markers.forEach((marker) => marker.setMap(null));
  }, [mapInstance, mapReady, routeCandidate, routeVisible, routeBoundaryLineReview]);

  useEffect(() => {
    const map = mapInstance;
    const Marker = window.google?.maps.Marker;
    if (!map || !mapReady || !Marker || !packetContactsVisible || !reviewPacket) return;
    const contacts = reviewPacket.countries.flatMap((country) =>
      country.status === "available" && country.routeGeometryReview?.status === "available"
        ? (country.routeGeometryReview.encounters ?? []).map((contact) => ({ countryIso3: country.countryIso3, contact }))
        : []);
    const markers = contacts.map(({ countryIso3, contact }) => new Marker({
      map,
      position: { lat: contact.position.lat, lng: contact.position.lon },
      title: `${countryIso3} administrative depiction contact, packet option ${reviewPacket.route.candidates?.find((candidate) => candidate.candidateId === contact.candidateId)?.optionIndex ?? "unknown"}; not a legal border crossing`,
      icon: {
        path: window.google?.maps.SymbolPath?.CIRCLE,
        scale: 7,
        fillColor: "#a78bfa",
        fillOpacity: 0.9,
        strokeColor: "#1e1b4b",
        strokeWeight: 2,
      },
      zIndex: 51,
    }));
    return () => markers.forEach((marker) => marker.setMap(null));
  }, [mapInstance, mapReady, packetContactsVisible, reviewPacket]);

  const loadBoundaries = () => {
    const countries = selectedIso3s.slice(0, 2);
    if (countries.length === 0) return;
    boundaryAbortRef.current?.abort();
    const controller = new AbortController();
    boundaryAbortRef.current = controller;
    setBoundaryStatus("loading");
    setBoundaryMessage(null);
    setBoundaryClaims([]);
    void Promise.allSettled(countries.map(async (countryIso3) => {
      const response = await fetch("/api/civilization/geospatial/evidence/boundary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryIso3 }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${countryIso3}: source returned HTTP ${response.status}`);
      const value: { schemaVersion?: unknown; atlas?: unknown } = await response.json();
      if (value.schemaVersion !== "civilization_boundary_evidence/v1" ||
          validateCivilizationTraversabilityAtlasV1(value.atlas).length > 0) {
        throw new Error(`${countryIso3}: boundary response invalid`);
      }
      const atlas = value.atlas as { boundaryClaims?: CivilizationBoundaryClaimV1[] };
      const claim = atlas.boundaryClaims?.[0];
      if (!claim || claim.countryIso3 !== countryIso3) throw new Error(`${countryIso3}: boundary claim missing`);
      return claim;
    })).then((results) => {
      if (controller.signal.aborted) return;
      const claims = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const errors = results.flatMap((result) => result.status === "rejected"
        ? [result.reason instanceof Error ? result.reason.message : "Boundary source unavailable"] : []);
      setBoundaryClaims(claims);
      setBoundaryStatus(claims.length > 0 ? "ready" : "unavailable");
      setBoundaryMessage(errors.length > 0 ? errors.join(" · ") : null);
    });
  };

  useEffect(() => {
    if (!mapReady) return;
    if (selectedIso3s.length === 0) {
      boundaryAbortRef.current?.abort();
      setBoundaryClaims([]);
      setBoundaryStatus("idle");
      setBoundaryMessage(null);
      return;
    }
    const timer = window.setTimeout(loadBoundaries, 400);
    return () => window.clearTimeout(timer);
  }, [mapReady, selectedKey]);

  const loadBoundaryLines = (bbox: MapBbox) => {
    boundaryLineAbortRef.current?.abort();
    const controller = new AbortController();
    boundaryLineAbortRef.current = controller;
    setBoundaryLineStatus("loading");
    setBoundaryLineMessage(null);
    setBoundaryLines([]);
    setSelectedBoundaryLine(null);
    void fetch("/api/civilization/geospatial/evidence/natural-earth-boundary-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bbox, maxLines: 50 }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Natural Earth source returned HTTP ${response.status}.`);
        return response.json();
      })
      .then((value: {
        schemaVersion?: unknown;
        atlas?: unknown;
        source?: { fetchedAt?: unknown };
        coverage?: { possiblyTruncated?: unknown };
      }) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_natural_earth_boundary_lines/v1" ||
            validateCivilizationTraversabilityAtlasV1(value.atlas).length > 0) {
          throw new Error("Natural Earth boundary-line response invalid.");
        }
        const atlas = value.atlas as { boundaryLineAssertions?: CivilizationBoundaryLineAssertionV1[] };
        setBoundaryLines(atlas.boundaryLineAssertions ?? []);
        setBoundaryLineFetchedAt(typeof value.source?.fetchedAt === "string" ? value.source.fetchedAt : null);
        setBoundaryLineTruncated(value.coverage?.possiblyTruncated === true);
        setBoundaryLineStatus("ready");
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        autoCoverageRef.current.boundaryLines = null;
        setBoundaryLineStatus("unavailable");
        setBoundaryLineMessage(failure instanceof Error ? failure.message : "Natural Earth source unavailable.");
      });
  };

  useEffect(() => {
    const map = mapInstance;
    const Polyline = window.google?.maps.Polyline;
    if (!map || !mapReady || !Polyline || !boundaryLineVisible) return;
    const colors: Record<CivilizationBoundaryLineAssertionV1["recordCategory"], string> = {
      "Claim boundary": "#fb7185",
      Breakaway: "#c084fc",
      "Reference line": "#94a3b8",
      "Elusive frontier": "#fbbf24",
    };
    const overlays: GoogleOverlay[] = [];
    const listeners: Array<{ remove(): void }> = [];
    for (const line of boundaryLines) {
      for (const part of line.lineParts) {
        const overlay = new Polyline({
          map,
          path: part.map((point) => ({ lat: point.lat, lng: point.lon })),
          strokeColor: colors[line.recordCategory],
          strokeOpacity: 0.95,
          strokeWeight: 3,
          clickable: true,
          zIndex: 28,
        });
        overlays.push(overlay);
        listeners.push(overlay.addListener?.("click", ({ latLng }) => {
          if (!takeRoutePoint(latLng)) setSelectedBoundaryLine(line);
        }) ?? { remove() {} });
      }
    }
    return () => {
      overlays.forEach((overlay) => overlay.setMap(null));
      listeners.forEach((listener) => listener.remove());
    };
  }, [boundaryLines, boundaryLineVisible, mapInstance, mapReady]);

  useEffect(() => {
    const map = mapInstance;
    const Polyline = window.google?.maps.Polyline;
    if (!map || !mapReady || !Polyline || !boundaryVisible) return;
    const overlays: GoogleOverlay[] = [];
    for (const [index, claim] of boundaryClaims.entries()) {
      for (const polygon of claim.polygons) {
        for (const ring of polygon) {
          overlays.push(new Polyline({
            map,
            path: ring.map((point) => ({ lat: point.lat, lng: point.lon })),
            strokeColor: index === 0 ? "#facc15" : "#22d3ee",
            strokeOpacity: 0.9,
            strokeWeight: 2.5,
            clickable: false,
            zIndex: 25,
          }));
        }
      }
    }
    return () => overlays.forEach((overlay) => overlay.setMap(null));
  }, [boundaryClaims, boundaryVisible, mapInstance, mapReady]);

  const loadInfrastructure = (bbox: MapBbox) => {
    infrastructureAbortRef.current?.abort();
    const controller = new AbortController();
    infrastructureAbortRef.current = controller;
    setInfrastructureStatus("loading");
    setInfrastructureMessage(null);
    setSelectedInfrastructure(null);
    setInfrastructureEdges([]);
    setInfrastructureBbox(null);
    void fetch("/api/civilization/geospatial/evidence/osm-infrastructure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bbox, kinds: ["pipeline", "road", "rail", "waterway", "power", "telecom"], maxWays: 200 }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Infrastructure source returned HTTP ${response.status}.`);
        return response.json();
      })
      .then((value: {
        schemaVersion?: unknown;
        atlas?: unknown;
        source?: { fetchedAt?: unknown };
        coverage?: { possiblyTruncated?: unknown; missingEvidence?: unknown };
      }) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_infrastructure_evidence/v2" ||
            validateCivilizationTraversabilityAtlasV1(value.atlas).length > 0) {
          throw new Error("Infrastructure evidence response was invalid.");
        }
        const atlas = value.atlas as { infrastructureEdges?: CivilizationInfrastructureEdgeV1[] };
        setInfrastructureEdges(atlas.infrastructureEdges ?? []);
        setInfrastructureTruncated(value.coverage?.possiblyTruncated === true);
        setInfrastructureCoverageGaps(Array.isArray(value.coverage?.missingEvidence)
          ? value.coverage.missingEvidence.filter((item): item is string => typeof item === "string") : []);
        setInfrastructureFetchedAt(typeof value.source?.fetchedAt === "string" ? value.source.fetchedAt : null);
        setInfrastructureBbox(bbox);
        setInfrastructureStatus("ready");
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        autoCoverageRef.current.infrastructure = null;
        setInfrastructureStatus("unavailable");
        setInfrastructureMessage(failure instanceof Error ? failure.message : "Infrastructure source unavailable.");
      });
  };

  useEffect(() => {
    const map = mapInstance;
    const Polyline = window.google?.maps.Polyline;
    if (!map || !mapReady || !Polyline || !infrastructureVisible) return;
    const colors: Record<string, string> = {
      pipeline: "#f59e0b", road: "#a3e635", rail: "#f472b6",
      waterway: "#38bdf8", power: "#c084fc", telecom: "#fb7185",
    };
    const overlays: GoogleOverlay[] = [];
    const listeners: Array<{ remove(): void }> = [];
    for (const edge of infrastructureEdges) {
      const overlay = new Polyline({
        map,
        path: edge.coordinates.map((point) => ({ lat: point.lat, lng: point.lon })),
        strokeColor: colors[edge.networkKind] ?? "#ffffff",
        strokeOpacity: 0.85,
        strokeWeight: 3,
        clickable: true,
        zIndex: 30,
      });
      overlays.push(overlay);
      listeners.push(overlay.addListener?.("click", ({ latLng }) => {
        if (!takeRoutePoint(latLng)) setSelectedInfrastructure(edge);
      }) ?? { remove() {} });
    }
    return () => {
      overlays.forEach((overlay) => overlay.setMap(null));
      listeners.forEach((listener) => listener.remove());
    };
  }, [infrastructureEdges, infrastructureVisible, mapInstance, mapReady]);

  const loadHydrography = (bbox: MapBbox) => {
    hydroAbortRef.current?.abort();
    const controller = new AbortController();
    hydroAbortRef.current = controller;
    setHydroStatus("loading");
    setHydroMessage(null);
    setHydrographicLines([]);
    setSelectedHydroLine(null);
    void fetch("/api/civilization/geospatial/evidence/natural-earth-hydrography", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bbox, kinds: ["river", "lake_centerline"], maxLines: 100 }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Hydrography source returned HTTP ${response.status}.`);
        return response.json();
      })
      .then((value: {
        schemaVersion?: unknown;
        atlas?: unknown;
        coverage?: { possiblyTruncated?: unknown };
      }) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_natural_earth_hydrography/v1" ||
            validateCivilizationTraversabilityAtlasV1(value.atlas).length > 0) {
          throw new Error("Hydrography response invalid.");
        }
        const atlas = value.atlas as { hydrographicLines?: CivilizationHydrographicLineV1[] };
        setHydrographicLines(atlas.hydrographicLines ?? []);
        setHydroTruncated(value.coverage?.possiblyTruncated === true);
        setHydroStatus("ready");
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        autoCoverageRef.current.hydrography = null;
        setHydroStatus("unavailable");
        setHydroMessage(failure instanceof Error ? failure.message : "Hydrography source unavailable.");
      });
  };

  const loadLakes = (bbox: MapBbox) => {
    lakesAbortRef.current?.abort();
    const controller = new AbortController();
    lakesAbortRef.current = controller;
    setLakesStatus("loading");
    setLakesMessage(null);
    setLakeDepictions([]);
    setSelectedLake(null);
    void fetch("/api/civilization/geospatial/evidence/natural-earth-lakes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bbox, maxLakes: 100 }), signal: controller.signal,
    }).then((response) => {
      if (!response.ok) throw new Error(`Lakes source returned HTTP ${response.status}.`);
      return response.json();
    }).then((value: { schemaVersion?: unknown; lakes?: NaturalEarthLakeUi[];
      coverage?: { possiblyTruncated?: unknown } }) => {
      if (controller.signal.aborted) return;
      if (value.schemaVersion !== "civilization_natural_earth_lakes/v1" || !Array.isArray(value.lakes)) {
        throw new Error("Lakes response invalid.");
      }
      setLakeDepictions(value.lakes);
      setLakesTruncated(value.coverage?.possiblyTruncated === true);
      setLakesStatus("ready");
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      autoCoverageRef.current.lakes = null;
      setLakesStatus("unavailable");
      setLakesMessage(failure instanceof Error ? failure.message : "Lakes source unavailable.");
    });
  };

  const loadPortCandidates = (bbox: MapBbox) => {
    portAbortRef.current?.abort();
    const controller = new AbortController();
    portAbortRef.current = controller;
    setPortStatus("loading");
    setPortMessage(null);
    setPortCandidates([]);
    setSelectedPort(null);
    void fetch("/api/civilization/geospatial/evidence/osm-port-candidates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bbox, maxElements: 50 }), signal: controller.signal,
    }).then((response) => response.ok ? response.json() : Promise.reject(new Error(`Port source returned HTTP ${response.status}.`)))
      .then((value: { schemaVersion?: unknown; candidates?: unknown;
        source?: { fetchedAt?: unknown }; coverage?: { possiblyTruncated?: unknown } }) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_osm_port_candidates/v1" || !Array.isArray(value.candidates) ||
            !value.candidates.every((item) => item && typeof item === "object" &&
              typeof item.label === "string" && typeof item.sourceRecordUrl === "string" &&
              typeof item.position?.lat === "number" && typeof item.position?.lon === "number")) {
          throw new Error("Port candidate response invalid.");
        }
        setPortCandidates(value.candidates as PortCandidateUi[]);
        setPortTruncated(value.coverage?.possiblyTruncated === true);
        setPortSourceAt(typeof value.source?.fetchedAt === "string" ? value.source.fetchedAt : null);
        setPortStatus("ready");
      }).catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        autoCoverageRef.current.ports = null;
        setPortStatus("unavailable");
        setPortMessage(failure instanceof Error ? failure.message : "Port candidates unavailable.");
      });
  };

  const loadWpiPorts = (bbox: MapBbox) => {
    wpiAbortRef.current?.abort();
    const controller = new AbortController();
    wpiAbortRef.current = controller;
    setWpiStatus("loading");
    setWpiMessage(null);
    setWpiPorts([]);
    setSelectedWpiPort(null);
    void fetch("/api/civilization/geospatial/evidence/nga-world-port-index", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bbox, maxElements: 50 }), signal: controller.signal,
    }).then((response) => response.ok ? response.json() : Promise.reject(new Error(`WPI source returned HTTP ${response.status}.`)))
      .then((value: { schemaVersion?: unknown; ports?: unknown;
        source?: { fetchedAt?: unknown }; coverage?: { possiblyTruncated?: unknown } }) => {
        if (controller.signal.aborted) return;
        if (value.schemaVersion !== "civilization_nga_world_port_index/v1" || !Array.isArray(value.ports) ||
            !value.ports.every((item) => item && typeof item === "object" &&
              typeof item.wpiNumber === "number" && typeof item.name === "string" &&
              typeof item.sourceRecordUrl === "string" &&
              typeof item.position?.lat === "number" && typeof item.position?.lon === "number")) {
          throw new Error("World Port Index response invalid.");
        }
        setWpiPorts(value.ports as WorldPortIndexUi[]);
        setWpiTruncated(value.coverage?.possiblyTruncated === true);
        setWpiSourceAt(typeof value.source?.fetchedAt === "string" ? value.source.fetchedAt : null);
        setWpiStatus("ready");
      }).catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        autoCoverageRef.current.wpi = null;
        setWpiStatus("unavailable");
        setWpiMessage(failure instanceof Error ? failure.message : "World Port Index unavailable.");
      });
  };

  useEffect(() => {
    if (!mapReady || !viewportBbox) return;
    const timers: number[] = [];
    const schedule = (
      kind: "boundaryLines" | "infrastructure" | "hydrography" | "lakes" | "ports" | "wpi",
      maxSpan: number,
      minimumIntervalMs: number,
      enabled: boolean,
      load: (bbox: MapBbox) => void,
      clear: () => void,
    ) => {
      if (!enabled) return;
      if (!validViewportBbox(viewportBbox, maxSpan)) {
        if (autoCoverageRef.current[kind]) {
          autoCoverageRef.current[kind] = null;
          clear();
        }
        return;
      }
      const previous = autoCoverageRef.current[kind];
      if (previous && viewportCovered(previous, viewportBbox)) return;
      if (previous) {
        autoCoverageRef.current[kind] = null;
        clear();
      }
      const queryBbox = paddedViewportBbox(viewportBbox, maxSpan);
      const cooldown = Math.max(0, minimumIntervalMs - (Date.now() - autoRequestedAtRef.current[kind]));
      timers.push(window.setTimeout(() => {
        autoCoverageRef.current[kind] = queryBbox;
        autoRequestedAtRef.current[kind] = Date.now();
        load(queryBbox);
      }, 500 + cooldown));
    };
    schedule("boundaryLines", 20, 10_000, boundaryLineVisible, loadBoundaryLines, () => {
      boundaryLineAbortRef.current?.abort();
      setBoundaryLines([]);
      setSelectedBoundaryLine(null);
      setBoundaryLineStatus("idle");
      setBoundaryLineMessage(null);
    });
    schedule("hydrography", 20, 7_000, hydroVisible, loadHydrography, () => {
      hydroAbortRef.current?.abort();
      setHydrographicLines([]);
      setSelectedHydroLine(null);
      setHydroStatus("idle");
      setHydroMessage(null);
    });
    schedule("lakes", 20, 7_000, lakesVisible, loadLakes, () => {
      lakesAbortRef.current?.abort();
      setLakeDepictions([]);
      setSelectedLake(null);
      setLakesStatus("idle");
      setLakesMessage(null);
    });
    schedule("infrastructure", 1, 15_000, infrastructureVisible, loadInfrastructure, () => {
      infrastructureAbortRef.current?.abort();
      setInfrastructureEdges([]);
      setSelectedInfrastructure(null);
      setInfrastructureStatus("idle");
      setInfrastructureMessage(null);
    });
    schedule("ports", 1, 15_000, portVisible, loadPortCandidates, () => {
      portAbortRef.current?.abort();
      setPortCandidates([]);
      setSelectedPort(null);
      setPortStatus("idle");
      setPortMessage(null);
    });
    schedule("wpi", 2, 15_000, wpiVisible, loadWpiPorts, () => {
      wpiAbortRef.current?.abort();
      setWpiPorts([]);
      setSelectedWpiPort(null);
      setWpiStatus("idle");
      setWpiMessage(null);
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [mapReady, viewportBbox, boundaryLineVisible, hydroVisible, lakesVisible, infrastructureVisible, portVisible, wpiVisible]);

  useEffect(() => {
    const Marker = window.google?.maps.Marker;
    if (!mapInstance || !mapReady || !Marker || !portVisible) return;
    const markers: GoogleOverlay[] = [];
    const listeners: Array<{ remove(): void }> = [];
    for (const port of portCandidates) {
      const marker = new Marker({
        map: mapInstance, position: { lat: port.position.lat, lng: port.position.lon },
        title: `${port.label} · OSM mapped candidate; service and access unverified`,
        icon: { path: window.google?.maps.SymbolPath?.CIRCLE, fillColor: "#f59e0b",
          fillOpacity: 0.88, strokeColor: "#111827", strokeWeight: 2, scale: 5 },
        zIndex: 34,
      });
      markers.push(marker);
      listeners.push(marker.addListener?.("click", ({ latLng }) => {
        if (!takeRoutePoint(latLng)) setSelectedPort(port);
      }) ?? { remove() {} });
    }
    return () => { markers.forEach((marker) => marker.setMap(null)); listeners.forEach((listener) => listener.remove()); };
  }, [mapInstance, mapReady, portCandidates, portVisible]);

  useEffect(() => {
    const Marker = window.google?.maps.Marker;
    if (!mapInstance || !mapReady || !Marker || !wpiVisible) return;
    const markers: GoogleOverlay[] = [];
    const listeners: Array<{ remove(): void }> = [];
    for (const port of wpiPorts) {
      const marker = new Marker({
        map: mapInstance, position: { lat: port.position.lat, lng: port.position.lon },
        title: `${port.name} · NGA World Port Index ${port.wpiNumber}; current service unverified`,
        icon: { path: window.google?.maps.SymbolPath?.CIRCLE, fillColor: "#38bdf8",
          fillOpacity: 0.92, strokeColor: "#0f172a", strokeWeight: 2, scale: 6 },
        zIndex: 35,
      });
      markers.push(marker);
      listeners.push(marker.addListener?.("click", ({ latLng }) => {
        if (!takeRoutePoint(latLng)) setSelectedWpiPort(port);
      }) ?? { remove() {} });
    }
    return () => { markers.forEach((marker) => marker.setMap(null)); listeners.forEach((listener) => listener.remove()); };
  }, [mapInstance, mapReady, wpiPorts, wpiVisible]);

  useEffect(() => {
    const Data = window.google?.maps.Data;
    if (!mapInstance || !mapReady || !ramsarViewportActive || !ramsarOverlay || !Data) return;
    const layer = new Data({ map: mapInstance });
    layer.addGeoJson(ramsarOverlay.geojson);
    layer.setStyle({
      fillColor: "#34d399", fillOpacity: 0.2,
      strokeColor: "#6ee7b7", strokeOpacity: 0.9, strokeWeight: 2,
      clickable: true, zIndex: 23,
    });
    const click = layer.addListener("click", ({ feature, latLng }) => {
      if (takeRoutePoint(latLng)) return;
      const siteNumber = Number(feature.getProperty("siteNumber"));
      setSelectedRamsarSite(ramsarOverlay.geojson.features.find((site) =>
        site.properties.siteNumber === siteNumber)?.properties ?? null);
    });
    return () => { click.remove(); layer.setMap(null); };
  }, [mapInstance, mapReady, ramsarViewportActive, ramsarOverlay]);

  useEffect(() => {
    const Data = window.google?.maps.Data;
    if (!mapInstance || !mapReady || !lakesVisible || !Data || !lakeDepictions.length) return;
    const layer = new Data({ map: mapInstance });
    layer.addGeoJson({ type: "FeatureCollection", features: lakeDepictions.map((lake) => ({
      type: "Feature", properties: { featureId: lake.featureId }, geometry: lake.geometry,
    })) });
    layer.setStyle({
      fillColor: "#0891b2", fillOpacity: 0.2, strokeColor: "#67e8f9",
      strokeOpacity: 0.75, strokeWeight: 1.5, clickable: true, zIndex: 22,
    });
    const click = layer.addListener("click", ({ feature, latLng }) => {
      if (takeRoutePoint(latLng)) return;
      const featureId = Number(feature.getProperty("featureId"));
      setSelectedLake(lakeDepictions.find((lake) => lake.featureId === featureId) ?? null);
    });
    return () => { click.remove(); layer.setMap(null); };
  }, [lakeDepictions, lakesVisible, mapInstance, mapReady]);

  useEffect(() => {
    const map = mapInstance;
    const Polyline = window.google?.maps.Polyline;
    if (!map || !mapReady || !Polyline || !hydroVisible) return;
    const overlays: GoogleOverlay[] = [];
    const listeners: Array<{ remove(): void }> = [];
    for (const line of hydrographicLines) {
      for (const part of line.lineParts) {
        const overlay = new Polyline({
          map,
          path: part.map((point) => ({ lat: point.lat, lng: point.lon })),
          strokeColor: line.featureKind === "river" ? "#38bdf8" : "#67e8f9",
          strokeOpacity: 0.8,
          strokeWeight: line.featureKind === "river" ? 3 : 2,
          clickable: true,
          zIndex: 24,
        });
        overlays.push(overlay);
        listeners.push(overlay.addListener?.("click", ({ latLng }) => {
          if (!takeRoutePoint(latLng)) setSelectedHydroLine(line);
        }) ?? { remove() {} });
      }
    }
    return () => {
      overlays.forEach((overlay) => overlay.setMap(null));
      listeners.forEach((listener) => listener.remove());
    };
  }, [hydrographicLines, hydroVisible, mapInstance, mapReady]);

  useEffect(() => {
    const map = mapInstance;
    const api = window.google?.maps;
    if (!map || !mapReady || !api) return;

    const overlays: GoogleOverlay[] = [];
    const markerListeners: Array<{ remove(): void }> = [];
    const Marker = api.Marker;
    if (Marker) {
      if (seismicVisible) {
        seismicMeasurements.forEach((measurement) => {
          const coordinate = measurement.geometry.coordinates;
          if (!coordinate) return;
          const magnitude = measurement.quantity.value;
          const marker = new Marker({
            map,
            position: { lat: coordinate.lat, lng: coordinate.lon },
            title: `${measurement.label} · ${magnitude == null ? "magnitude unavailable" : `M ${magnitude}`} · ${measurement.observedAt}`,
            icon: {
              path: api.SymbolPath?.CIRCLE,
              fillColor: "#fb923c",
              fillOpacity: 0.86,
              strokeColor: "#431407",
              strokeWeight: 1.5,
              scale: magnitude == null ? 4 : Math.min(10, Math.max(4, magnitude)),
            },
            zIndex: 20,
          });
          overlays.push(marker);
          markerListeners.push(marker.addListener?.("click", () => {
            if (!takeRoutePoint({ lat: () => coordinate.lat, lng: () => coordinate.lon })) {
              setSelectedSeismic(measurement);
            }
          }) ?? { remove() {} });
        });
      }
    }

    return () => {
      overlays.forEach((overlay) => overlay.setMap(null));
      markerListeners.forEach((listener) => listener.remove());
    };
  }, [mapInstance, mapReady, seismicMeasurements, seismicVisible, selectedKey, selectedIso3s, ungaAffiliations]);

  useEffect(() => {
    if (!mapInstance || !mapReady) return;
    mapInstance.data.setStyle((feature) => {
      const countryName = feature.getProperty("name");
      const iso3 = typeof countryName === "string" ? affiliationForCountryName(countryName, ungaAffiliations) : null;
      const hovered = Boolean(iso3 && hoveredIso3 === iso3);
      const selected = Boolean(iso3 && selectedIso3s.includes(iso3));
      return {
        fillColor: hovered ? "#a7f3d0" : "#2dd4bf",
        fillOpacity: hovered ? 0.22 : selected ? 0.1 : 0,
        strokeColor: hovered ? "#d1fae5" : "#5eead4",
        strokeOpacity: hovered ? 1 : selected ? 0.8 : 0,
        strokeWeight: hovered ? 4 : selected ? 2 : 0,
        zIndex: hovered ? 3 : selected ? 2 : 1,
        clickable: Boolean(iso3),
      };
    });
  }, [mapInstance, mapReady, hoveredIso3, selectedKey, selectedIso3s, ungaAffiliations]);

  return (
    <div className="absolute inset-0" aria-label="Google Maps basemap with civilization overlays">
      <div ref={hostRef} className="absolute inset-0" />
      <select aria-label="Find UN General Debate country" value="" onChange={(event) => { if (event.target.value) onToggleCountry(event.target.value); }}
        className="absolute right-3 top-14 z-[9] w-[min(15rem,50%)] rounded border border-emerald-200/35 bg-[#06120f]/95 px-2 py-1 text-xs text-slate-100 shadow backdrop-blur">
        <option value="">Find UNGA81 country…</option>
        {ungaAffiliations.filter((item) => item.countryIso3 !== "UN").map((item) => <option key={item.countryIso3} value={item.countryIso3}>{item.countryName}</option>)}
      </select>
      <CivilizationDiplomacyOverlay hoveredIso3={hoveredIso3} selectedIso3s={selectedIso3s} onToggleCountry={onToggleCountry}
        onCompareOptions={openScenarioComparison} comparingOptions={scenarioStatus === "loading"}
        onHoverCardEnter={() => {
          hoverCardActiveRef.current = true;
          if (hoverLeaveTimerRef.current !== null) window.clearTimeout(hoverLeaveTimerRef.current);
          hoverLeaveTimerRef.current = null;
        }}
        onHoverCardLeave={() => { hoverCardActiveRef.current = false; setHoveredIso3(null); }} />
      <div className="absolute left-3 top-28 z-[7] max-h-[min(45%,24rem)] w-[min(22rem,calc(100%-1.5rem))] space-y-1 overflow-y-auto overscroll-contain rounded border border-white/20 bg-black/85 p-1 text-[10px] text-slate-100 shadow-lg backdrop-blur" aria-label="Civilization map tools">
      <button type="button" disabled={selectedIso3s.length !== 2 || scenarioStatus === "loading"} onClick={openScenarioComparison}
        className="w-full rounded border border-violet-300/50 px-2 py-1 text-left font-semibold text-violet-100 disabled:opacity-50">
        {scenarioStatus === "loading" ? "Comparing evidence…" : selectedIso3s.length === 2
          ? `Compare ${selectedIso3s.join(" + ")} options` : "Select two countries to compare options"}
      </button>
      <details ref={mapToolsDetailsRef} className="rounded border border-slate-200/25 px-2 py-1.5">
        <summary className="cursor-pointer font-semibold">Routes and source layers</summary>
        <div className="font-semibold">Mapped network alignment</div>
        <label className="mt-1 flex flex-wrap items-center gap-2">
          <span>Assess at (local time)</span>
          <input type="datetime-local" value={evaluationLocal} onChange={(event) => setEvaluationLocal(event.target.value)}
            className="rounded border border-white/40 bg-black/50 px-1 py-0.5 text-slate-100" />
        </label>
        <div className="text-slate-400">This sets the route and packet assessment time; source metadata does not establish validity then.</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => pickRoutePoint("origin")} disabled={!mapReady} className="rounded border border-white/40 px-2 py-1 disabled:opacity-50">{routePickStage === "origin" ? "Click origin…" : "Set origin"}</button>
          <span>{routeOrigin ? `${routeOrigin.lat.toFixed(4)}, ${routeOrigin.lon.toFixed(4)}` : "unset"}</span>
          <button type="button" onClick={() => pickRoutePoint("destination")} disabled={!mapReady} className="rounded border border-white/40 px-2 py-1 disabled:opacity-50">{routePickStage === "destination" ? "Click destination…" : "Set destination"}</button>
          <span>{routeDestination ? `${routeDestination.lat.toFixed(4)}, ${routeDestination.lon.toFixed(4)}` : "unset"}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
          {MAPPED_NETWORK_KINDS.map((kind) => <label key={kind} className="flex items-center gap-1"><input type="checkbox" checked={routeNetworkKinds.includes(kind)} onChange={(event) => {
            setRouteNetworkKinds((current) => event.target.checked ? [...current, kind] : current.filter((item) => item !== kind));
            setRouteCandidates([]);
            setRouteGapReview(null);
            setRouteStatus("idle");
          }} />{kind === "waterway" ? "waterway (mapped canals)" : kind}</label>)}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <button type="button" onClick={loadRouteOptions} disabled={!mapReady || routeStatus === "loading"} className="rounded border border-white/50 px-2 py-1 disabled:opacity-50">{routeStatus === "loading" ? "Finding mapped alignment…" : "Find alignment here"}</button>
          {routeCandidate && <label className="flex items-center gap-1"><input type="checkbox" checked={routeVisible} onChange={(event) => setRouteVisible(event.target.checked)} />Show</label>}
          <span className="text-slate-400">Up to 3 bounded options; 2 km endpoint snap</span>
        </div>
        {routeMessage && <div role="status" className="mt-1 text-amber-200">{routeMessage}</div>}
        {routeGapReview && routeGapReview.hypotheses.length > 0 && <details className="mt-1 text-amber-100">
          <summary>Possible mapped network gaps · {routeGapReview.hypotheses.length}{routeGapReview.searchExhaustive ? "" : " · search incomplete"}</summary>
          <p>These are straight lines between disconnected mapped components, not engineered alignments or evidence that construction is needed. Screen terrain, water, protected areas, borders, rights, operation, and capacity before considering an option.</p>
          {routeGapReview.hypotheses.map((gap) => <div key={`${gap.networkKind}:${gap.fromNodeRef}:${gap.toNodeRef}`} className="mt-1">
            {gap.networkKind} · {gap.straightLineDistanceKm.toFixed(2)} km between <a href={gap.fromSourceRecordUrl} target="_blank" rel="noreferrer" className="underline">mapped end A</a> and <a href={gap.toSourceRecordUrl} target="_blank" rel="noreferrer" className="underline">mapped end B</a>.
          </div>)}
        </details>}
        {routeCandidates.length > 1 && <div className="mt-1 flex flex-wrap gap-1" aria-label="Mapped alignment options">
          {routeCandidates.map((candidate, index) => <button key={candidate.candidateId} type="button" onClick={() => setRouteSelectedIndex(index)} aria-pressed={routeSelectedIndex === index} className={`rounded border px-2 py-0.5 ${routeSelectedIndex === index ? "border-white text-white" : "border-white/20 text-slate-300"}`}>
            Option {index + 1} · {candidate.distanceKm.toFixed(2)} km
          </button>)}
        </div>}
        {routeCandidate && <div className="mt-1 border-t border-white/15 pt-1">
          {routeCandidate.distanceKm.toFixed(2)} km across {routeCandidate.segments.length} mapped segments · {routeCandidate.networkKinds.join(", ")}<br />
          Origin snap {routeCandidate.originSnapDistanceKm.toFixed(2)} km · destination snap {routeCandidate.destinationSnapDistanceKm.toFixed(2)} km · selection length {routeCandidate.selectionCostKm.toFixed(2)} km<br />
          {routeCandidate.generation === "detour_excluding_mapped_way" ? `Detour search excluded ${routeCandidate.excludedMappedWayId}.` : "Shortest alignment for selected snapped nodes."}<br />
          {routeMappedOneWayRoadWays > 0 && <>{routeMappedOneWayRoadWays} mapped road way{routeMappedOneWayRoadWays === 1 ? "" : "s"} carried an OSM one-way tag used in this topology search; current traffic rules remain unverified.<br /></>}
          Topological alignment only. Mapped waterway ways cover canals; natural river, stream, and sea routes are outside this graph. Canal navigability, operation, transfer, capacity, hazards, and permissions are unknown.<br />
          {routeCandidate.pipelineTagReview && routeCandidate.pipelineTagReview.status !== "not_applicable" &&
            <details className="mt-1 text-amber-100"><summary>Pipeline product review · {routeCandidate.pipelineTagReview.status.replaceAll("_", " ")}</summary>
              <p>OSM substance tags on {routeCandidate.pipelineTagReview.wayCount} mapped pipeline way{routeCandidate.pipelineTagReview.wayCount === 1 ? "" : "s"}; {routeCandidate.pipelineTagReview.untaggedWayCount} untagged. Product compatibility and flow direction are unverified.</p>
              {routeCandidate.pipelineTagReview.ways.map((way) => <div key={way.edgeId}>
                <a href={way.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{way.edgeId}</a> · {way.substanceTag ?? "substance untagged"}
              </div>)}
            </details>}
          {(() => {
            const transitions = routeCandidate.segments.flatMap((segment, index) => index > 0 &&
              routeCandidate.segments[index - 1].networkKind !== segment.networkKind
              ? [{ index, previous: routeCandidate.segments[index - 1], next: segment }] : []);
            return transitions.length > 0 && <details className="mt-1 text-amber-100"><summary>{transitions.length} mapped network changes require facility review</summary>
              {transitions.slice(0, 50).map(({ index, previous, next }) => <div key={`${index}:${previous.edgeId}:${next.edgeId}`} className="mt-1">
                Segment {index} to {index + 1}: <a href={previous.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{previous.networkKind}</a>
                {" → "}<a href={next.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{next.networkKind}</a> at OSM node {next.fromNodeRef}.
                Transfer or interconnection facility, compatibility, operating rights, and capacity unverified.
              </div>)}
              {transitions.length > 50 && <p>Additional transitions omitted from this view.</p>}
            </details>;
          })()}
          {routeSourceAt ? `Retrieved ${routeSourceAt} · ` : ""}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap contributors · ODbL</a>
          {routeBoundaryLineReview?.status === "unavailable" && <div className="mt-1 text-rose-200">Boundary line comparison unavailable ({routeBoundaryLineReview.errorCode ?? "source error"}). Jurisdictional encounters remain unassessed.</div>}
          {routeBoundaryLineReview?.status === "available" && <div className="mt-1 text-rose-100">
            {routeBoundaryLineReview.source && <div>Natural Earth repository revision: {routeBoundaryLineReview.source.sourceRevisionAt.slice(0, 10)} · <a href={routeBoundaryLineReview.source.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">source file</a></div>}
            {(() => {
              const encounters = (routeBoundaryLineReview.encounters ?? []).filter((item) => item.candidateId === routeCandidate.candidateId);
              return <>{encounters.length} contacts with pinned Natural Earth editorial linework{routeBoundaryLineReview.possiblyTruncated ? " · result may be incomplete" : ""}. A contact is not a legal border crossing or permission finding.
                {encounters.length > 0 && <details className="mt-1"><summary>Inspect line contacts</summary>
                  <ul className="mt-1 list-inside list-disc">{encounters.map((item, index) => <li key={`${item.lineId}:${item.routeSegmentIndex}:${index}`}>
                    {item.contactKind} near {item.position.lat.toFixed(3)}, {item.position.lon.toFixed(3)} · mapped segment {item.routeSegmentIndex + 1} · <a href={item.lineSourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{item.recordCategory}: {item.lineLabel}</a>
                    <details className="ml-3"><summary>Source viewpoint fields</summary>
                      Natural Earth label: {item.sourceClaimLabel ?? "unknown"} · effective date: unknown<br />
                      Adjacent mapped ISO3: {item.adjacentAdministrativeIso3.map((code) => code ?? "unknown").join(" / ")}<br />
                      {item.sourceComment && <>{item.sourceComment}<br /></>}
                      {Object.keys(item.viewpointClassifications).length > 0
                        ? Object.entries(item.viewpointClassifications).map(([key, value]) => <div key={key}>{key}: {value}</div>)
                        : "No country viewpoint fields on this source record."}
                    </details>
                  </li>)}</ul>
                </details>}
              </>;
            })()}
          </div>}
          {routeHydrographyReview?.status === "unavailable" && <div className="mt-1 text-cyan-200">Hydrography comparison unavailable ({routeHydrographyReview.errorCode ?? "source error"}). Waterway contacts remain unassessed.</div>}
          {routeHydrographyReview?.status === "available" && <div className="mt-1 text-cyan-100">
            {routeHydrographyReview.source && <div>Natural Earth rivers version {routeHydrographyReview.source.datasetVersion}; snapshot acquired {routeHydrographyReview.source.snapshotAcquiredAt} · <a href={routeHydrographyReview.source.sourceArchiveUrl} target="_blank" rel="noreferrer" className="underline">source archive</a></div>}
            {(() => {
              const encounters = (routeHydrographyReview.encounters ?? []).filter((item) => item.candidateId === routeCandidate.candidateId);
              return <>{encounters.length} contacts with generalized river or lake centerlines{routeHydrographyReview.possiblyTruncated ? " · result may be incomplete" : ""}. Contact does not establish a bridge, ford, water supply, navigability, or permission.
                {encounters.length > 0 && <details className="mt-1"><summary>Inspect waterway contacts</summary>
                  <ul className="mt-1 list-inside list-disc">{encounters.map((item, index) => <li key={`${item.hydrographicLineId}:${item.routeSegmentIndex}:${index}`}>
                    {item.contactKind} near {item.position.lat.toFixed(2)}, {item.position.lon.toFixed(2)} (generalized) · mapped segment {item.routeSegmentIndex + 1} · <a href={item.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{item.hydrographicFeatureKind.replaceAll("_", " ")}: {item.hydrographicLabel}</a>
                  </li>)}</ul>
                </details>}
              </>;
            })()}
          </div>}
          {routeLakeReview?.status === "unavailable" && <div className="mt-1 text-cyan-200">Lake outline comparison unavailable ({routeLakeReview.errorCode ?? "source error"}). Lake contacts remain unassessed.</div>}
          {routeLakeReview?.status === "available" && <div className="mt-1 text-cyan-100">
            {(() => {
              const contacts = (routeLakeReview.contacts ?? []).filter((item) => item.candidateId === routeCandidate.candidateId);
              return <>{contacts.length} contacts with generalized lake polygons{routeLakeReview.possiblyTruncated ? " · result may be incomplete" : ""}. Shoreline date and current water extent are unknown; Natural Earth warns its Aral Sea outline may be too large. Contact does not establish ecological effect, crossing feasibility, or permission.
                {contacts.length > 0 && <details className="mt-1"><summary>Inspect lake contacts</summary>
                  {contacts.map((item, index) => <div key={`${item.lakeFeatureId}:${item.segmentIndex}:${index}`}>
                    Segment {item.segmentIndex + 1} · {item.contactKind.replaceAll("_", " ")} near {item.position.lat.toFixed(3)}, {item.position.lon.toFixed(3)} · <a href={item.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{item.lakeLabel}</a> (feature {item.lakeFeatureId})
                  </div>)}
                </details>}
              </>;
            })()}
          </div>}
          <details className="mt-1"><summary>Inspect source segments and gaps</summary>
            <div className="mt-1">Gaps: {routeCandidate.missingEvidence.concat(routeCoverageGaps).join(", ").replaceAll("_", " ")}</div>
            <ol className="mt-1 list-inside list-decimal">{routeCandidate.segments.map((segment, index) => <li key={`${segment.edgeId}:${index}`}>
              {segment.networkKind} · {segment.distanceKm.toFixed(3)} km · <a href={segment.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{segment.edgeId}</a>
            </li>)}</ol>
          </details>
        </div>}
        <div className="mt-2 border-t border-amber-300/25 pt-2">
          <div className="font-semibold text-amber-100">Proposed corridor screen</div>
          <div className="mt-1 text-slate-300">Screens your ordered endpoint and waypoint sketch against selected country administrative outlines, editorial boundary lines, generalized waterways, and optionally mapped OSM ways. No asset operation, route search, or engineering feasibility is implied.</div>
          <div className="mt-1 text-slate-400">Detailed selected country depictions: {selectedIso3s.length ? selectedIso3s.slice(0, 2).join(", ") : "none"}. The sketch also screens a generalized global country depiction for possible third-party contact.</div>
          <div className="mt-1 text-slate-400">Mapped infrastructure comparison: {routeNetworkKinds.length ? routeNetworkKinds.join(", ") : "not requested"}. Select network kinds above; OSM inventory requires a viewport under 1° × 1°.</div>
          {selectedIso3s.length > 2 && <div className="mt-1 text-amber-200">Only the first two selected countries will be compared; select fewer for a precise screen.</div>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => pickRoutePoint("waypoint")} disabled={!mapReady || proposedWaypoints.length >= 10}
              className="rounded border border-amber-300/40 px-2 py-1 disabled:opacity-50">
              {routePickStage === "waypoint" ? "Click next waypoint…" : `Add waypoint (${proposedWaypoints.length}/10)`}
            </button>
            {proposedWaypoints.length > 0 && <button type="button" onClick={() => setProposedWaypoints((current) => current.slice(0, -1))}
              className="rounded border border-white/30 px-2 py-1">Undo last</button>}
            {proposedWaypoints.length > 0 && <button type="button" onClick={() => {
              routePickRef.current = null;
              setRoutePickStage(null);
              setProposedWaypoints([]);
            }} className="rounded border border-white/30 px-2 py-1">Clear waypoints</button>}
            {routeOrigin && routeDestination && <label className="flex items-center gap-1"><input type="checkbox" checked={proposedVisible} onChange={(event) => setProposedVisible(event.target.checked)} />Show sketch</label>}
          </div>
          {proposedWaypoints.length > 0 && <ol className="mt-1 list-inside list-decimal text-slate-300">
            {proposedWaypoints.map((point, index) => <li key={`${index}:${point.lat}:${point.lon}`}>
              Waypoint {index + 1}: {point.lat.toFixed(4)}, {point.lon.toFixed(4)}
              <button type="button" onClick={() => setProposedWaypoints((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                className="ml-2 underline">Remove</button>
            </li>)}
          </ol>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input type="text" aria-label="Proposed corridor use" value={proposedUse} maxLength={120}
              onChange={(event) => setProposedUse(event.target.value)}
              className="min-w-40 flex-1 rounded border border-amber-300/40 bg-black/50 px-2 py-1 text-slate-100" />
            <label>Contemplated mode <select value={proposedMode} onChange={(event) => setProposedMode(event.target.value as typeof proposedMode)}
              className="rounded border border-amber-300/40 bg-[#07120f] px-1 py-1">
              <option value="unspecified">Unspecified</option>
              <option value="air">Air</option><option value="sea">Sea</option><option value="road">Road</option>
              <option value="rail">Rail</option><option value="river">River</option><option value="pipeline">Pipeline</option>
              <option value="submarine_cable">Submarine cable</option><option value="atmospheric">Atmospheric</option>
              <option value="ecological">Ecological</option>
            </select></label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={includeTerrainPoints} onChange={(event) => setIncludeTerrainPoints(event.target.checked)} />USGS elevation at sketch points</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={includeGlobalReliefPoints} onChange={(event) => setIncludeGlobalReliefPoints(event.target.checked)} />Global land and seafloor relief profile (up to 12 cells)</label>
            <button type="button" onClick={screenProposedCorridor} disabled={!mapReady || proposedStatus === "loading"}
              className="rounded border border-amber-300/50 px-2 py-1 disabled:opacity-50">
              {proposedStatus === "loading" ? "Screening sketch…" : "Screen proposed sketch"}
            </button>
            {proposedScreen && <button type="button" onClick={downloadProposedScreen} className="rounded border border-white/35 px-2 py-1">Download JSON</button>}
          </div>
          {proposedMessage && <div role="status" className="mt-1 text-amber-200">{proposedMessage}</div>}
          {proposedScreen && <div className="mt-1 text-slate-300">
            Assessed for {proposedScreen.query.evaluatedAt} · collected {proposedScreen.collectedAt}. Amber dashes are only the supplied sketch through {proposedScreen.query.vertices.length} points. Source validity at that time is unverified.
            <details className="mt-1"><summary>Possible country contacts: {proposedScreen.countryGeometryScreen.contacts.length}{proposedScreen.countryGeometryScreen.possiblyTruncated ? "+" : ""} depicted entities</summary>
              <div>Natural Earth 1:50m {proposedScreen.countryDepictionCandidates.source.datasetVersion} · {proposedScreen.countryDepictionCandidates.source.licenseId} · <a href={proposedScreen.countryGeometryScreen.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">source</a>. These are cartographic contacts, not legal jurisdiction, control, permission, or effects.</div>
              <ul className="list-inside list-disc">{proposedScreen.countryGeometryScreen.contacts.map((country) => <li key={country.sourceFeatureId}>
                {country.name} ({country.isoA3 ?? country.editorialAdm0A3}){proposedScreen.query.countryIso3s.includes(country.isoA3 ?? "") ? " · selected" : " · possible third party"} · {country.boundaryContactSegments} boundary-contact segments · {country.interiorSegments} interior segments
              </li>)}</ul>
              {proposedScreen.countryGeometryScreen.indeterminateFeatureIds.length > 0 && <div>Unresolved source features: {proposedScreen.countryGeometryScreen.indeterminateFeatureIds.join(", ")}</div>}
              <div>Global depiction is generalized and may omit small or recent features. Gaps: {proposedScreen.countryGeometryScreen.missingEvidence.join(", ").replaceAll("_", " ")}</div>
            </details>
            <details className="mt-1"><summary>Boundary line comparison: {proposedScreen.boundaryLines.status === "available"
              ? `${proposedScreen.boundaryLines.contacts?.length ?? 0}${proposedScreen.boundaryLines.possiblyTruncated ? "+" : ""} approximate contacts`
              : `unavailable (${proposedScreen.boundaryLines.errorCode ?? "source error"})`}</summary>
              {proposedScreen.boundaryLines.source && <div>Natural Earth revision {proposedScreen.boundaryLines.source.sourceRevisionAt} · {proposedScreen.boundaryLines.source.licenseId} · <a href={proposedScreen.boundaryLines.source.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">source</a></div>}
              <ul className="list-inside list-disc">{(proposedScreen.boundaryLines.contacts ?? []).map((contact, index) => <li key={`${contact.lineId}:${index}`}>
                Sketch segment {contact.sketchSegmentIndex + 1} · {contact.contactKind} near {contact.position.lat.toFixed(3)}, {contact.position.lon.toFixed(3)} · <a href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{contact.recordCategory}: {contact.lineLabel}</a> · editorial adjacent codes {contact.adjacentAdministrativeIso3.map((code) => code ?? "unknown").join(" / ")}
              </li>)}</ul>
              <div>Geometric contact is not a legal crossing or permission finding. Gaps: {proposedScreen.boundaryLines.missingEvidence.join(", ").replaceAll("_", " ")}</div>
            </details>
            <details className="mt-1"><summary>Selected administrative depictions: {proposedScreen.administrativeBoundaries.length || "none selected"}</summary>
              {proposedScreen.administrativeBoundaries.length === 0 && <div>No country outlines were requested. A missing contact says nothing about jurisdiction.</div>}
              {proposedScreen.administrativeBoundaries.map((country) => <div key={country.countryIso3} className="mt-1 border-t border-white/10 pt-1">
                <div>{country.countryIso3}: {country.status === "available"
                  ? `${country.contacts?.length ?? 0}${country.possiblyTruncated ? "+" : ""} approximate outline contacts`
                  : `source unavailable (${country.errorCode ?? "source error"})`}</div>
                {country.source && <div>geoBoundaries represented year {country.source.representedYear} · release {country.source.releaseRevision} · {country.source.distributionLicense} (original: {country.source.originalSourceLicense}) · <a href={country.source.metadataUrl} target="_blank" rel="noreferrer" className="underline">source metadata</a></div>}
                <ul className="list-inside list-disc">{(country.contacts ?? []).map((contact, index) => <li key={`${contact.boundaryId}:${contact.sketchSegmentIndex}:${index}`}>
                  Sketch segment {contact.sketchSegmentIndex + 1} · {contact.contactKind} near {contact.position.lat.toFixed(4)}, {contact.position.lon.toFixed(4)} · represented {contact.sourceYearRepresented} · <a href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">boundary record</a>
                </li>)}</ul>
                <div>Sketch points in this provider depiction:</div>
                <ul className="list-inside list-disc">{(country.vertexCoverage ?? []).map((item) => <li key={item.sketchVertexIndex}>
                  {item.sketchVertexIndex === 0 ? "Origin" : item.sketchVertexIndex === proposedScreen.query.vertices.length - 1 ? "Destination" : `Waypoint ${item.sketchVertexIndex}`}: {item.relationship.replaceAll("_", " ")}
                  {item.sourceRecordUrl && <> · <a href={item.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">source depiction</a></>}
                </li>)}</ul>
                <div>Sketch spans in this provider depiction:</div>
                <ul className="list-inside list-disc">{(country.spanCoverage ?? []).map((span, index) => <li key={`${span.sketchSegmentIndex}:${span.fromFraction}:${index}`}>
                  Segment {span.sketchSegmentIndex + 1}, {(span.fromFraction * 100).toFixed(1)}–{(span.toFraction * 100).toFixed(1)}%: {span.relationship.replaceAll("_", " ")}
                  {span.sourceRecordUrl && <> · <a href={span.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">source depiction</a></>}
                </li>)}</ul>
                <div>Span classification is planar cartographic evidence; it does not establish legal jurisdiction, effective control, or permission. Gaps: {country.missingEvidence.join(", ").replaceAll("_", " ")}</div>
              </div>)}
            </details>
            <details className="mt-1"><summary>Waterway comparison: {proposedScreen.hydrography.status === "available"
              ? `${proposedScreen.hydrography.contacts?.length ?? 0}${proposedScreen.hydrography.possiblyTruncated ? "+" : ""} approximate contacts`
              : `unavailable (${proposedScreen.hydrography.errorCode ?? "source error"})`}</summary>
              {proposedScreen.hydrography.source && <div>Natural Earth snapshot acquired {proposedScreen.hydrography.source.snapshotAcquiredAt} · {proposedScreen.hydrography.source.licenseId} · <a href={proposedScreen.hydrography.source.sourceArchiveUrl} target="_blank" rel="noreferrer" className="underline">source</a></div>}
              <ul className="list-inside list-disc">{(proposedScreen.hydrography.contacts ?? []).map((contact, index) => <li key={`${contact.lineId}:${index}`}>
                Sketch segment {contact.sketchSegmentIndex + 1} · {contact.contactKind} near {contact.position.lat.toFixed(2)}, {contact.position.lon.toFixed(2)} · <a href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{contact.featureKind.replaceAll("_", " ")}: {contact.lineLabel}</a>
              </li>)}</ul>
              <div>Contact does not establish a crossing design, navigability, or water right. Gaps: {proposedScreen.hydrography.missingEvidence.join(", ").replaceAll("_", " ")}</div>
            </details>
            <details className="mt-1"><summary>Lake outline comparison: {proposedScreen.lakeReview.status === "available"
              ? `${proposedScreen.lakeReview.contacts?.length ?? 0}${proposedScreen.lakeReview.possiblyTruncated ? "+" : ""} approximate contacts`
              : proposedScreen.lakeReview.status.replaceAll("_", " ")}</summary>
              {proposedScreen.lakeReview.status === "available" && <>
                {proposedScreen.lakeReview.source && <div>Natural Earth version {proposedScreen.lakeReview.source.datasetVersion} · <a href={proposedScreen.lakeReview.source.sourceArchiveUrl} target="_blank" rel="noreferrer" className="underline">source archive</a></div>}
                {(proposedScreen.lakeReview.contacts ?? []).map((contact, index) => <div key={`${contact.lakeFeatureId}:${contact.segmentIndex}:${index}`}>
                  Sketch segment {contact.segmentIndex + 1} · {contact.contactKind.replaceAll("_", " ")} near {contact.position.lat.toFixed(3)}, {contact.position.lon.toFixed(3)} · <a href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{contact.lakeLabel}</a>
                </div>)}
              </>}
              <div>Generalized depiction; shoreline date, current water extent, effects, crossing feasibility, and permissions remain unverified. Gaps: {proposedScreen.lakeReview.missingEvidence.join(", ").replaceAll("_", " ")}</div>
            </details>
            <details className="mt-1"><summary>Ramsar site outline comparison: {proposedScreen.ramsarAreaReview.status === "available"
              ? `${proposedScreen.ramsarAreaReview.sites?.filter((site) => site.relation === "intersects_published_depiction").length ?? 0} published contacts${proposedScreen.ramsarAreaReview.possiblyTruncated ? " · incomplete" : ""}`
              : `unavailable (${proposedScreen.ramsarAreaReview.errorCode ?? "source error"})`}</summary>
              {proposedScreen.ramsarAreaReview.source && <div>RSIS WFS retrieved {proposedScreen.ramsarAreaReview.source.fetchedAt} · <a href={proposedScreen.ramsarAreaReview.source.requestUrl} target="_blank" rel="noreferrer" className="underline">source query</a> · <a href={proposedScreen.ramsarAreaReview.source.licenseUrl} target="_blank" rel="noreferrer" className="underline">reuse terms</a></div>}
              {(proposedScreen.ramsarAreaReview.sites ?? []).filter((site) => site.relation !== "no_contact_in_returned_depiction").map((site) => <div key={site.siteNumber}>
                <a href={site.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{site.name} (#{site.siteNumber})</a> · {site.relation.replaceAll("_", " ")}{site.alignmentSegmentIndices.length > 0 ? ` · sketch segments ${site.alignmentSegmentIndices.map((index) => index + 1).join(", ")}` : ""}
              </div>)}
              <div>{proposedScreen.ramsarAreaReview.coverage?.selectedFeatures ?? 0} published site depictions returned. A contact is a geometry review pointer; current ecological effects, management rules, and permissions remain unassessed. Gaps: {proposedScreen.ramsarAreaReview.missingEvidence.join(", ").replaceAll("_", " ")}</div>
            </details>
            <details className="mt-1"><summary>Mapped infrastructure comparison: {proposedScreen.mappedInfrastructure.status === "available"
              ? `${proposedScreen.mappedInfrastructure.contacts?.length ?? 0}${proposedScreen.mappedInfrastructure.possiblyTruncated ? "+" : ""} approximate contacts`
              : proposedScreen.mappedInfrastructure.status.replaceAll("_", " ")}</summary>
              {proposedScreen.mappedInfrastructure.source && <div>
                {proposedScreen.mappedInfrastructure.source.attribution} · {proposedScreen.mappedInfrastructure.source.licenseId} · snapshot {proposedScreen.mappedInfrastructure.source.sourceSnapshotAt ?? "unknown"} · retrieved {proposedScreen.mappedInfrastructure.source.fetchedAt} · <a href={proposedScreen.mappedInfrastructure.source.licenseUrl} target="_blank" rel="noreferrer" className="underline">license terms</a><br />
                {proposedScreen.mappedInfrastructure.source.licenseBoundary}
              </div>}
              {proposedScreen.mappedInfrastructure.errorCode && <div>Source error: {proposedScreen.mappedInfrastructure.errorCode}</div>}
              <ul className="list-inside list-disc">{(proposedScreen.mappedInfrastructure.contacts ?? []).map((contact, index) => <li key={`${contact.edgeId}:${contact.sketchSegmentIndex}:${index}`}>
                Sketch segment {contact.sketchSegmentIndex + 1} · {contact.contactKind} near {contact.position.lat.toFixed(4)}, {contact.position.lon.toFixed(4)} · <a href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">OSM {contact.networkKind} way</a> · edited {contact.sourceEditedAt ?? "unknown"}
              </li>)}</ul>
              <div>A mapped-way contact does not establish an operational connection, capacity, or permission. Gaps: {proposedScreen.mappedInfrastructure.missingEvidence.join(", ").replaceAll("_", " ")}</div>
            </details>
            <details className="mt-1"><summary>Mapped forest and protected-area depictions: {proposedScreen.terrestrialDepictions.status === "available"
              ? `${proposedScreen.terrestrialDepictions.contacts?.length ?? 0}${proposedScreen.terrestrialDepictions.possiblyTruncated ? "+" : ""} approximate contacts`
              : proposedScreen.terrestrialDepictions.status.replaceAll("_", " ")}</summary>
              {proposedScreen.terrestrialDepictions.source && <div>OpenStreetMap way snapshot {proposedScreen.terrestrialDepictions.source.sourceSnapshotAt ?? "unknown"} · retrieved {proposedScreen.terrestrialDepictions.source.fetchedAt} · {proposedScreen.terrestrialDepictions.source.licenseId} · <a href={proposedScreen.terrestrialDepictions.source.sourceUrl} target="_blank" rel="noreferrer" className="underline">source query service</a></div>}
              {proposedScreen.terrestrialDepictions.errorCode && <div>Source error: {proposedScreen.terrestrialDepictions.errorCode}</div>}
              {(proposedScreen.terrestrialDepictions.contacts ?? []).map((contact, index) => <div key={`${contact.featureId}:${contact.sketchSegmentIndex}:${index}`}>
                Sketch segment {contact.sketchSegmentIndex + 1} · <a href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{contact.featureName ?? contact.featureId}</a> · {contact.featureKind.replaceAll("_", " ")} · {contact.geometryRole.replaceAll("_", " ")} · {contact.relation.replaceAll("_", " ")} near {contact.position.lat.toFixed(4)}, {contact.position.lon.toFixed(4)} · edited {contact.sourceEditedAt ?? "unknown"}
              </div>)}
              <div>{proposedScreen.terrestrialDepictions.coverage?.usableClosedWays ?? 0} usable closed ways and {proposedScreen.terrestrialDepictions.coverage?.usableRelationFragments ?? 0} relation boundary fragments returned. Fragments are line contacts only; holes and filled relation areas are unresolved. OSM tags do not verify current forest cover, legal protection, ecological effect, or permission. Gaps: {proposedScreen.terrestrialDepictions.missingEvidence.join(", ").replaceAll("_", " ")}</div>
            </details>
            <details className="mt-1"><summary>USGS elevation at sketch points: {proposedScreen.terrainPoints.status === "available"
              ? `${proposedScreen.terrainPoints.observations?.filter((item) => item.status === "available").length ?? 0}/${proposedScreen.query.vertices.length} points available`
              : proposedScreen.terrainPoints.status.replaceAll("_", " ")}</summary>
              {proposedScreen.terrainPoints.source && <div>{proposedScreen.terrainPoints.source.attribution} · interpolated elevations, not surveyed values · vertical datum {proposedScreen.terrainPoints.source.verticalDatum.replaceAll("_", " ")} · <a href={proposedScreen.terrainPoints.source.accuracyUrl} target="_blank" rel="noreferrer" className="underline">USGS accuracy note</a> · <a href={proposedScreen.terrainPoints.source.termsUrl} target="_blank" rel="noreferrer" className="underline">data terms</a><br />{proposedScreen.terrainPoints.source.licenseBoundary}</div>}
              {proposedScreen.terrainPoints.errorCode && <div>Source error: {proposedScreen.terrainPoints.errorCode}</div>}
              <ul className="list-inside list-disc">{(proposedScreen.terrainPoints.observations ?? []).map((item) => <li key={item.pointIndex}>
                {item.pointIndex === 0 ? "Origin" : item.pointIndex === proposedScreen.query.vertices.length - 1 ? "Destination" : `Waypoint ${item.pointIndex}`}: {item.status === "available" ? `${item.elevationMeters?.toFixed(2)} m` : item.status.replaceAll("_", " ")}
                {item.resolutionReported !== null && item.resolutionReported !== undefined ? ` · raster resolution reported ${item.resolutionReported} (units unverified)` : ""}
                {item.acquisitionDate ? ` · acquisition ${item.acquisitionDate}` : " · acquisition date unknown"}
                {item.rasterId !== null && item.rasterId !== undefined ? ` · raster ${item.rasterId}` : ""}
                {item.errorCode ? ` · ${item.errorCode}` : ""} · <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="underline">point source</a>
              </li>)}</ul>
              <div>Point values do not describe terrain between points or establish slope, ground conditions, construction suitability, or permission. Gaps: {proposedScreen.terrainPoints.missingEvidence.join(", ").replaceAll("_", " ")}</div>
            </details>
            <details className="mt-1"><summary>Global relief model along sketch: {proposedScreen.globalReliefPoints.status === "available"
              ? `${proposedScreen.globalReliefPoints.observations?.filter((item) => item.status === "available").length ?? 0}/${proposedScreen.globalReliefPoints.samplePlan?.length ?? 0} cells available`
              : proposedScreen.globalReliefPoints.status.replaceAll("_", " ")}</summary>
              {proposedScreen.globalReliefPoints.source && <div>{proposedScreen.globalReliefPoints.source.attribution} · {proposedScreen.globalReliefPoints.source.gridSpacingArcSeconds} arc-second {proposedScreen.globalReliefPoints.source.surfaceVersion.replaceAll("_", " ")} grid · heights relative to {proposedScreen.globalReliefPoints.source.verticalReference} · <a href={proposedScreen.globalReliefPoints.source.datasetUrl} target="_blank" rel="noreferrer" className="underline">dataset metadata</a> · <a href={proposedScreen.globalReliefPoints.source.citationUrl} target="_blank" rel="noreferrer" className="underline">citation</a><br />{proposedScreen.globalReliefPoints.source.licenseBoundary}</div>}
              {proposedScreen.globalReliefPoints.samplePlan && <div>Samples include every sketch vertex; remaining slots bisect the longest sketch intervals until the 12-point limit. Interpolation follows straight latitude/longitude segments.</div>}
              {proposedScreen.globalReliefPoints.errorCode && <div>Source error: {proposedScreen.globalReliefPoints.errorCode}</div>}
              <ul className="list-inside list-disc">{(proposedScreen.globalReliefPoints.observations ?? []).map((item) => {
                const sample = proposedScreen.globalReliefPoints.samplePlan?.[item.pointIndex];
                const label = sample?.originalVertexIndex === 0 ? "Origin"
                  : sample?.originalVertexIndex === proposedScreen.query.vertices.length - 1 ? "Destination"
                    : sample?.originalVertexIndex !== null && sample?.originalVertexIndex !== undefined
                      ? `Waypoint ${sample.originalVertexIndex}`
                      : sample ? `Segment ${sample.sketchSegmentIndex + 1} at ${(sample.segmentFraction * 100).toFixed(1)}%`
                        : `Sample ${item.pointIndex + 1}`;
                return <li key={item.pointIndex}>
                {label}: {item.status === "available" ? `${item.heightMeters?.toFixed(2)} m` : item.status.replaceAll("_", " ")}
                {item.sampledGridCellCenter ? ` · sampled cell ${item.sampledGridCellCenter.lat.toFixed(4)}, ${item.sampledGridCellCenter.lon.toFixed(4)}` : ""}
                {item.errorCode ? ` · ${item.errorCode}` : ""} · <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="underline">grid response</a>
              </li>;})}</ul>
              <div>This is a modeled surface cell, not a site survey. A negative height is not a tidal water depth or route clearance. Gaps: {proposedScreen.globalReliefPoints.missingEvidence.join(", ").replaceAll("_", " ")}</div>
            </details>
            <details className="mt-1"><summary>Unresolved planning evidence</summary>{proposedScreen.unresolved.join(", ").replaceAll("_", " ")}</details>
          </div>}
        </div>
        <div className="mt-2 border-t border-cyan-300/25 pt-2">
          <div className="font-semibold text-cyan-100">Google Maps travel route</div>
          <div className="mt-1 text-slate-300">Supplemental route for one Google-supported travel mode. It does not represent a pipeline, rail, sea, or general trade corridor.</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">Mode
              <select value={googleTravelMode} onChange={(event) => {
                googleRouteAbortRef.current?.abort();
                setGoogleTravelMode(event.target.value as typeof googleTravelMode);
                setGoogleRoute(null);
                setGoogleRouteStatus("idle");
                setGoogleRouteMessage(null);
              }} className="rounded border border-cyan-300/40 bg-[#07120f] px-2 py-1">
                <option value="DRIVE">Drive</option>
                <option value="WALK">Walk</option>
                <option value="BICYCLE">Bicycle</option>
                <option value="TWO_WHEELER">Two wheeler</option>
                <option value="TRANSIT">Transit</option>
              </select>
            </label>
            <button type="button" onClick={loadGoogleRoute} disabled={!mapReady || googleRouteStatus === "loading"} className="rounded border border-cyan-300/50 px-2 py-1 disabled:opacity-50">
              {googleRouteStatus === "loading" ? "Requesting Google route…" : "Show Google route"}
            </button>
            {googleRoute && <label className="flex items-center gap-1"><input type="checkbox" checked={googleRouteVisible} onChange={(event) => setGoogleRouteVisible(event.target.checked)} />Show</label>}
          </div>
          {googleRouteMessage && <div role="status" className="mt-1 text-amber-200">{googleRouteMessage}</div>}
          {googleRoute && <div className="mt-1 text-cyan-100">
            {(googleRoute.distanceMeters / 1000).toFixed(2)} km · {(googleRoute.durationSeconds / 60).toFixed(0)} min · retrieved {googleRoute.fetchedAt}<br />
            <span translate="no">Google Maps</span> route content is shown only on this Google map. It is not saved in the diplomatic packet.
            <details className="mt-1"><summary>Evidence limits and policy</summary>
              <ul className="mt-1 list-inside list-disc">{googleRoute.missingEvidence.map((gap) => <li key={gap}>{gap}</li>)}</ul>
              <a href="https://developers.google.com/maps/documentation/routes/policies" target="_blank" rel="noreferrer" className="underline">Google Routes policy and attribution</a>
            </details>
          </div>}
        </div>
        <div className="mt-2 border-t border-violet-300/25 pt-2">
          <div className="font-semibold">Diplomatic comparison and route evidence</div>
          <div className="mt-1 text-slate-300">Select two countries to compare cited positions and conditional options. A corridor packet adds mapped route evidence when available; it is optional for the country comparison.</div>
          {selectedIso3s.length !== 2 && <div className="mt-1 text-amber-200">Select exactly two countries on the map to compare their options.</div>}
          <div className="mt-2 font-medium text-violet-100">Optional corridor packet</div>
          <div className="mt-1 text-slate-300">Uses this bounded corridor, selected network kinds, and up to two selected country depictions. Each source reports its own status and gaps.</div>
          <label className="mt-1 block">
            <span className="sr-only">Diplomatic review question</span>
            <input type="text" value={reviewQuestion} onChange={(event) => {
              setReviewQuestion(event.target.value);
              setReviewPacket(null);
              setReviewStatus("idle");
            }} maxLength={1000}
              placeholder="What should be reviewed about this corridor?"
              className="w-full rounded border border-violet-300/35 bg-black/50 px-2 py-1 text-slate-100 placeholder:text-slate-500" />
          </label>
          {selectedIso3s.length > 2 && <div className="mt-1 text-amber-200">Only the first two selected countries can be included; select fewer for a precise packet.</div>}
          <label className="mt-1 flex items-center gap-1 text-violet-100"><input type="checkbox" checked={includeProposedInPacket} onChange={(event) => {
            setIncludeProposedInPacket(event.target.checked);
            setReviewPacket(null);
            setReviewStatus("idle");
          }} />Attach the proposed sketch and its independent evidence</label>
          {includeProposedInPacket && <div className="text-slate-400">Uses the waypoints, intended use, contemplated mode, and optional terrain/relief choices above. The packet still assesses mapped network options separately.</div>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button type="button" onClick={buildDiplomaticPacket} disabled={!mapReady || reviewStatus === "loading"} className="rounded border border-violet-300/50 px-2 py-1 disabled:opacity-50">
              {reviewStatus === "loading" ? "Collecting evidence…" : "Build review packet"}
            </button>
            {reviewPacket && <button type="button" onClick={downloadDiplomaticPacket} className="rounded border border-white/35 px-2 py-1">Download JSON</button>}
            {reviewPacket?.countries.some((country) => country.routeGeometryReview?.status === "available" &&
              (country.routeGeometryReview.encounters?.length ?? 0) > 0) && <label className="flex items-center gap-1 text-violet-100">
              <input type="checkbox" checked={packetContactsVisible} onChange={(event) => setPacketContactsVisible(event.target.checked)} />Show packet contacts
            </label>}
          </div>
          {reviewMessage && <div role="status" className="mt-1 text-amber-200">{reviewMessage}</div>}
          {selectedIso3s.length === 2 && <details ref={scenarioDetailsRef} className="mt-2 rounded border border-violet-300/25 p-2">
            <summary className="cursor-pointer text-violet-100">Compare conditional cooperation options for {selectedIso3s.join(" + ")}</summary>
            <p className="mt-1 text-slate-300">Select an objective, observed trade year, and future planning year. The comparison uses dated country statements, government records, and UN Comtrade goods data. {reviewPacket ? "The current corridor packet adds mapped route evidence." : "Build a corridor packet later to add mapped route evidence."} Permissions and environmental review remain required.</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <details className="rounded border border-violet-300/35 px-2 py-1">
                <summary className="cursor-pointer">Objectives ({scenarioObjectives.length}/4)</summary>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                  {([
                    ["trade_access", "Trade access"], ["mutual_benefit", "Mutual benefit"],
                    ["resilience", "Resilience"], ["environmental_protection", "Environmental protection"],
                    ["emissions", "Emissions"], ["mapped_length", "Mapped length"],
                  ] as const).map(([objective, label]) => <label key={objective} className="flex items-center gap-1">
                    <input type="checkbox" checked={scenarioObjectives.includes(objective)}
                      disabled={!scenarioObjectives.includes(objective) && scenarioObjectives.length >= 4}
                      onChange={() => {
                        scenarioAbortRef.current?.abort();
                        scenarioBriefAbortRef.current?.abort();
                        setScenarioBriefStatus("idle");
                        setScenarioBriefMessage(null);
                        setScenarioObjectives((current) => current.includes(objective)
                          ? current.length > 1 ? current.filter((item) => item !== objective) : current
                          : current.length < 4 ? [...current, objective] : current);
                        setScenarioComparison(null); setScenarioStatus("idle");
                      }} />
                    {label}
                  </label>)}
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Choose one to four. Unknown outcomes stay unknown.</p>
              </details>
              <label className="flex items-center gap-1">Trade year
                <select value={scenarioTradeYear} onChange={(event) => { scenarioAbortRef.current?.abort(); scenarioBriefAbortRef.current?.abort(); setScenarioBriefStatus("idle"); setScenarioBriefMessage(null); setScenarioTradeYear(Number(event.target.value)); setScenarioComparison(null); setScenarioStatus("idle"); }} className="rounded border border-violet-300/35 bg-[#07120f] px-2 py-1">
                  {[2025, 2024, 2023, 2022, 2021, 2020].map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1">Planning year
                <select value={scenarioHorizonYear} onChange={(event) => { scenarioAbortRef.current?.abort(); scenarioBriefAbortRef.current?.abort(); setScenarioBriefStatus("idle"); setScenarioBriefMessage(null); setScenarioHorizonYear(Number(event.target.value)); setScenarioComparison(null); setScenarioStatus("idle"); }} className="rounded border border-violet-300/35 bg-[#07120f] px-2 py-1">
                  {[2030, 2035, 2040, 2050].map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
              <button type="button" onClick={compareDiplomaticScenarios} disabled={scenarioStatus === "loading"} className="rounded border border-violet-300/50 px-2 py-1 disabled:opacity-50">
                {scenarioStatus === "loading" ? "Comparing evidence…" : "Compare options"}
              </button>
            </div>
            {scenarioMessage && <p role="status" className="mt-1 text-amber-200">{scenarioMessage}</p>}
            {scenarioComparison && <div className="mt-2 space-y-2 text-slate-200">
              <p>{scenarioComparison.options.length} comparison entr{scenarioComparison.options.length === 1 ? "y" : "ies"} · humanitarian, transit, and infrastructure paths have different outcome scopes · no optimum inferred</p>
              {scenarioComparison.options.filter((option) => option.policyReview).slice(0, 1).map((option) => {
                const basis = scenarioComparison.optionDiscussionBasis.find((item) => item.optionId === option.id);
                const ledger = scenarioComparison.optionEvidenceLedgers.find((item) => item.optionId === option.id);
                return <div key={option.id} className="rounded border border-cyan-200/30 bg-cyan-100/5 p-2 text-[11px]">
                  <div className="font-semibold text-cyan-100">First discussion lead · {option.comparisonDomain.replaceAll("_", " ")}</div>
                  <p className="mt-1 text-slate-100">{option.policyReview?.question}</p>
                  {basis && <p className="mt-1 text-slate-300">{basis.rationale}</p>}
                  {basis && basis.reviewedPositionBasis.length > 0 && <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-cyan-100">
                    {basis.reviewedPositionBasis.slice(0, 4).map((position) => <a key={`${position.countryIso3}:${position.assertionId}`} href={position.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                      {position.countryIso3} submitted statement p. {position.sourcePage}
                    </a>)}
                    {basis.reviewedPositionBasis.length > 4 && <span>+{basis.reviewedPositionBasis.length - 4} more cited positions below</span>}
                  </div>}
                  {ledger && <p className="mt-1 text-amber-100">Next review: {ledger.gates.filter((gate) => gate.status === "unverified").slice(0, 3).map((gate) => gate.id.replaceAll("_", " ")).join(" · ") || "No open gate recorded"}. Outcomes and agreement remain unverified.</p>}
                </div>;
              })}
              <details className="rounded border border-white/15 p-1.5 text-[10px] text-slate-300">
                <summary>Codex evidence handoff</summary>
                <p className="mt-1">The read-only MCP tool <code>helix_civilization_scenario_reasoning_brief</code> uses this country pair, objectives, safeguards, and time frame. Its JSON keeps cited positions and open review gates with links to the full receipt.</p>
                <button type="button" onClick={() => {
                  const request = JSON.stringify({
                    tool: "helix_civilization_scenario_reasoning_brief",
                    arguments: scenarioComparison.query,
                  }, null, 2);
                  void Promise.resolve().then(() => navigator.clipboard.writeText(request))
                    .then(() => setScenarioMcpCopyMessage("MCP request copied with this comparison's exact inputs."))
                    .catch(() => setScenarioMcpCopyMessage("Clipboard unavailable; download the reasoning brief JSON instead."));
                }} className="mt-1 rounded border border-cyan-300/40 px-2 py-1">Copy MCP request</button>
                {scenarioMcpCopyMessage && <p role="status" className="mt-1 text-cyan-100">{scenarioMcpCopyMessage}</p>}
                <button type="button" onClick={downloadScenarioReasoningBrief} disabled={scenarioBriefStatus === "loading"} className="mt-1 rounded border border-violet-300/40 px-2 py-1 disabled:opacity-50">
                  {scenarioBriefStatus === "loading" ? "Preparing brief…" : "Download reasoning brief JSON"}
                </button>
                {scenarioBriefMessage && <p role="status" className="mt-1 text-amber-100">{scenarioBriefMessage}</p>}
              </details>
              <details className="rounded border border-white/15 p-1.5 text-[10px] text-slate-300">
                <summary>UN position coverage · {scenarioComparison.corpusCoverage.delegationPagesWithHashMatchedSelectedBrief}/{scenarioComparison.corpusCoverage.indexedDelegationPages} indexed delegation pages have selected briefs</summary>
                <p className="mt-1">{scenarioComparison.corpusCoverage.selectedReviewedAssertionCount} selected reviewed assertions; no full-speech assertion review issued. {scenarioComparison.corpusCoverage.interpretation}</p>
                {scenarioComparison.corpusCoverage.selectedCountries.map((country) => <div key={country.countryIso3} className="mt-1 border-t border-white/10 pt-1">
                  <strong>{country.countryIso3}</strong> · {country.reviewedAssertionCount} reviewed selected assertion{country.reviewedAssertionCount === 1 ? "" : "s"} · submitted text {country.submittedTextStatus.replaceAll("_", " ")} · delivery {country.deliveryStatus.replaceAll("_", " ")}.
                  <div>Next review: {country.nextReviewStage.replaceAll("_", " ")}. {country.nextReviewReason}</div>
                  {country.dateCrosscheck.submittedDocumentDateStatus === "differs_from_official_page" &&
                    <div className="text-amber-100">Date conflict: submitted document {country.dateCrosscheck.submittedDocumentDate}; official page {country.dateCrosscheck.officialPageDates.join(", ")}; provisional transcript {country.dateCrosscheck.provisionalTranscriptDates.join(", ") || "unavailable"}. {country.dateCrosscheck.submittedDocumentDatePageUrl && <a href={country.dateCrosscheck.submittedDocumentDatePageUrl} target="_blank" rel="noreferrer" className="underline">Submitted PDF page</a>}</div>}
                  {country.sourceUrls[0] && <a href={country.sourceUrls[0]} target="_blank" rel="noreferrer" className="underline">Source or review context</a>}
                </div>)}
                <details className="mt-1 border-t border-white/10 pt-1">
                  <summary>UN source review leads for this pair</summary>
                  <p>Submitted-page cues and provisional transcript keyword counts guide source review only. They do not establish a national position, priority, or bilateral response.</p>
                  {scenarioComparison.provisionalPairReviewLeads.countries.map((country) => <div key={country.countryIso3} className="mt-1 border-t border-white/10 pt-1">
                    <strong>{country.countryIso3}</strong> · {country.indexedProvisionalStatementCount} provisional segment{country.indexedProvisionalStatementCount === 1 ? "" : "s"} · {country.selectedReviewedAssertionCount} selected reviewed assertion{country.selectedReviewedAssertionCount === 1 ? "" : "s"}.
                    <div>{country.topicLeads.length ? country.topicLeads.map((lead) => <div key={lead.topic}>
                      {lead.topic}: {lead.keywordSentenceMentions} keyword sentence mention{lead.keywordSentenceMentions === 1 ? "" : "s"} in {lead.matchingSegmentCount} segment{lead.matchingSegmentCount === 1 ? "" : "s"} · {lead.leadingSegments.map((segment) =>
                        <a key={`${segment.sourceUrl}:${segment.statementNumber}`} href={segment.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 underline">provisional source {segment.date}</a>)}
                    </div>) : "No indexed English keyword topic leads."}</div>
                    {country.officialPageUrls[0] && <a href={country.officialPageUrls[0]} target="_blank" rel="noreferrer" className="mr-2 underline">official delegation page</a>}
                    {country.submittedPdfUrls[0] && <a href={country.submittedPdfUrls[0]} target="_blank" rel="noreferrer" className="underline">submitted statement PDF</a>}
                    <details className="mt-1"><summary className="cursor-pointer">Submitted PDF pages to review · {country.submittedPageLeads.status.replaceAll("_", " ")}</summary>
                      <p>Literal cues locate pages in source PDFs; other pages may be relevant. Read the complete page and verify speaker, date, language, and wording before admitting an assertion.</p>
                      {country.submittedPageLeads.sources.map((source) => <div key={source.sourceUrl} className="mt-1 border-t border-white/10 pt-1">
                        <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="underline">Submitted PDF</a> · {source.status.replaceAll("_", " ")} · text {source.extractedTextQuality.replaceAll("_", " ")}.
                        {source.rankedPages.map((page) => <div key={page.page}>
                          <a href={`${source.sourceUrl}#page=${page.page}`} target="_blank" rel="noreferrer" className="underline">Page {page.page}</a> · {page.candidateCount} unreviewed cue{page.candidateCount === 1 ? "" : "s"}: {page.cues.map((cue) => cue.replaceAll("_", " ")).join(", ")}.
                        </div>)}
                        {source.candidateListTruncated && <div className="text-amber-100">The local cue list was capped; inspect the full PDF.</div>}
                        {source.additionalCandidatePagesNotShown > 0 && <div className="text-amber-100">{source.additionalCandidatePagesNotShown} additional cue page{source.additionalCandidatePagesNotShown === 1 ? "" : "s"} omitted from this short list.</div>}
                      </div>)}
                    </details>
                    <div>Next review: {country.nextReviewStage.replaceAll("_", " ")}. {country.nextReviewReason}</div>
                  </div>)}
                </details>
                {scenarioComparison.corpusCoverage.topicCoverage.map((topic) => <div key={topic.id} className="mt-1">
                  {topic.label}: {topic.countriesWithAdmittedSelectedAssertionsCount} indexed delegations have admitted selected assertions; selected pair: {topic.selectedPairCountriesWithAdmittedAssertions.join(" + ") || "neither"}.
                </div>)}
              </details>
              <div className="rounded border border-amber-300/30 bg-amber-100/5 p-1.5 text-[10px]">
                <div className="font-semibold text-amber-100">Option comparison frontier: evidence still needed</div>
                {scenarioComparison.frontierReadiness.unscopedPlaceholderOptionIds.length > 0 && <div className="mt-1 text-amber-100">The no-build baseline has no admitted bilateral policy scope for this pair. It remains an evidence question and is excluded from proposal counts.</div>}
                {scenarioComparison.frontierReadiness.domains.length === 0 && <div className="mt-1 text-slate-300">No scoped future option entered the frontier from the current evidence.</div>}
                {scenarioComparison.frontierReadiness.domains.map((domain) => <div key={domain.comparisonDomain} className="mt-1">
                  <span className="text-slate-100">{domain.comparisonDomain.replaceAll("_", " ")}</span>: {domain.optionIds.length} proposal{domain.optionIds.length === 1 ? "" : "s"} · {domain.status === "one_option_no_within_domain_comparison" ? "no same-domain alternative yet" : "outcomes and gates unverified"}.
                  {domain.objectiveCoverage.map((objective) => <span key={objective.objective}> {objective.objective.replaceAll("_", " ")}: {objective.unquantifiedOptionIds.length} unmeasured{objective.boundedMappedLengthOptionIds.length ? `, ${objective.boundedMappedLengthOptionIds.length} with bounded map length only` : ""}{objective.notApplicableOptionIds.length ? `, ${objective.notApplicableOptionIds.length} outside this option scope` : ""}.</span>)}
                  <span> {domain.openGateIds.length} open decision gate{domain.openGateIds.length === 1 ? "" : "s"}.</span>
                  <details className="mt-1 rounded border border-amber-200/15 px-1.5 py-1 text-slate-300">
                    <summary className="cursor-pointer">Evidence needed to compare these options</summary>
                    <p className="mt-1 text-amber-100">Shared basis: {domain.comparisonBasisQuestion}</p>
                    {domain.objectiveCoverage.map((objective) => <div key={objective.objective} className="mt-1 border-t border-white/10 pt-1">
                      <strong>{objective.objective.replaceAll("_", " ")}</strong>
                      {objective.measurementPlans.length === 0 && <div>No applicable measurement plan for these options.</div>}
                      {objective.measurementPlans.map((plan) => <div key={`${objective.objective}:${plan.optionId}`} className="ml-2">
                        {plan.optionId.replaceAll("_", " ")} · ask {plan.actorToConsult.replaceAll("_", " ")}: {plan.measurementQuestion}
                        {plan.contextSourceUrls[0] && <> <a href={plan.contextSourceUrls[0]} target="_blank" rel="noreferrer" className="underline">Context source</a></>}
                      </div>)}
                    </div>)}
                  </details>
                </div>)}
                <details className="mt-1 rounded border border-amber-200/15 px-1.5 py-1 text-slate-300">
                  <summary className="cursor-pointer">What other route and policy possibilities remain open?</summary>
                  <p className="mt-1">{scenarioComparison.frontierReadiness.possibilityCoverage.interpretation}</p>
                  <p className="mt-1">OSM kinds returned in these option screens: {scenarioComparison.frontierReadiness.possibilityCoverage.mappedKinds.filter((item) => item.returnedInOptionScreens).map((item) => item.kind === "waterway" ? "mapped canals" : item.kind).join(", ") || "none"}. Missing kinds remain possible.</p>
                  {scenarioComparison.frontierReadiness.possibilityCoverage.outsideMappedTopology.map((item) => <p key={item.family} className="mt-1 border-t border-white/10 pt-1">
                    <strong>{item.family.replaceAll("_", " ")}</strong> · {item.currentEvidenceScope.replaceAll("_", " ")}. {item.nextEvidenceQuestion}
                  </p>)}
                </details>
                <div className="mt-1 text-slate-400">{scenarioComparison.frontierReadiness.interpretation}</div>
              </div>
              {scenarioComparison.screenedGeometryComparison.length > 0 && <details className="rounded border border-cyan-200/20 p-1.5 text-[10px] text-slate-300">
                <summary>Screened map evidence across options ({scenarioComparison.screenedGeometryComparison.length})</summary>
                <p className="mt-1 text-amber-100">Counts describe returned source contacts only. Missing or incomplete sources are not zero contacts; a smaller count or lower modeled height is not a better option.</p>
                {scenarioComparison.screenedGeometryComparison.map((row) => <details key={row.optionId} className="mt-1 border-t border-white/10 pt-1">
                  <summary>{row.optionId.replaceAll("_", " ")} · {row.kind.replaceAll("_", " ")}</summary>
                  {([
                    ["Global country depictions", row.sourceDepictedCountryContacts],
                    ["Selected-country outlines", row.selectedCountryOutlineContacts],
                    ["Editorial border lines", row.editorialBoundaryLineContacts],
                    ["Rivers and lake centerlines", row.hydrographicLineContacts],
                    ["Lake outlines", row.lakeOutlineContacts],
                    ["Published wetlands", row.publishedWetlandContacts],
                    ["Mapped forest and protected-area depictions", row.mappedTerrestrialContacts],
                  ] as const).map(([label, receipt]) => <div key={label}>
                    {label}: {receipt.status === "available" || receipt.status === "partial"
                      ? `${receipt.observedCount ?? "unknown"}${receipt.possiblyTruncated ? "+" : ""} returned${receipt.status === "partial" ? " (partial)" : ""}`
                      : receipt.status.replaceAll("_", " ")}{receipt.sourceUrls[0] && <> · <a href={receipt.sourceUrls[0]} target="_blank" rel="noreferrer" className="underline">source</a></>}
                  </div>)}
                  <div>ETOPO relief: {row.reliefGrid.status === "available"
                    ? `${row.reliefGrid.availableCells ?? 0}/${row.reliefGrid.attemptedCells} cells available`
                    : row.reliefGrid.status.replaceAll("_", " ")}{row.reliefGrid.sampledMinHeightMeters !== null && row.reliefGrid.sampledMaxHeightMeters !== null
                      ? ` · sampled model heights ${row.reliefGrid.sampledMinHeightMeters.toFixed(1)} to ${row.reliefGrid.sampledMaxHeightMeters.toFixed(1)} m` : ""}{row.reliefGrid.sourceUrls[0] && <> · <a href={row.reliefGrid.sourceUrls[0]} target="_blank" rel="noreferrer" className="underline">model source</a></>}</div>
                  <div className="text-slate-400">{row.interpretation}</div>
                </details>)}
              </details>}
              {scenarioComparison.optionInteractionReview.links.length > 0 && <details className="rounded border border-white/15 p-1.5 text-[10px]">
                <summary>Possible option relationships ({scenarioComparison.optionInteractionReview.links.length})</summary>
                <p className="mt-1 text-slate-400">{scenarioComparison.optionInteractionReview.interpretation}</p>
                {scenarioComparison.optionInteractionReview.links.map((link) => <div key={`${link.firstOptionId}:${link.secondOptionId}:${link.relation}`} className="mt-1 border-t border-white/10 pt-1">
                  <strong>{link.firstOptionId.replaceAll("_", " ")}</strong> ↔ <strong>{link.secondOptionId.replaceAll("_", " ")}</strong>
                  <span> · {link.relation.replaceAll("_", " ")} · hypothesis only.</span>
                  <div>{link.inferenceLimit}</div>
                  <div className="text-cyan-100">Check: {link.conditionsToEvaluate.join(" ")}</div>
                  <div className="text-slate-400">Still missing: {link.missingComparableEvidence.map((item) => item.replaceAll("_", " ")).join(", ")}.</div>
                  {link.evidenceSourceUrls[0] && <a href={link.evidenceSourceUrls[0]} target="_blank" rel="noreferrer" className="underline">Dated source context</a>}
                </div>)}
              </details>}
              <p className="text-[10px] text-slate-300">Observed goods: {scenarioComparison.timeFrame.goodsObservationYear} · future question: {scenarioComparison.timeFrame.planningHorizonYear}{scenarioComparison.timeFrame.corridorEvidenceEvaluatedAt ? ` · map evidence evaluated ${scenarioComparison.timeFrame.corridorEvidenceEvaluatedAt.slice(0, 10)}` : ""}. A planning year is not a forecast.</p>
              {scenarioComparison.corridorScalePlan.status === "planned" && <details className="text-[10px] text-slate-300">
                <summary>Long-corridor source plan: {scenarioComparison.corridorScalePlan.plan.coverage.plannedWindowCount}/{scenarioComparison.corridorScalePlan.plan.coverage.requiredWindowCount} local windows</summary>
                <p>{scenarioComparison.corridorScalePlan.plan.interpretation}</p>
                <p>{scenarioComparison.corridorScalePlan.plan.coverage.unplannedWindowCount > 0
                  ? `${scenarioComparison.corridorScalePlan.plan.coverage.unplannedWindowCount} windows remain unplanned under this request's budget.`
                  : "All straight sketch segments have local source-read windows. No source has been read by this plan."}</p>
                {(() => {
                  const nextUnread = scenarioComparison.corridorScalePlan.plan.windows.find((window) => !scaleWindowEvidence[window.sequence]);
                  return nextUnread && <button type="button" className="mt-1 rounded border border-cyan-300/40 px-2 py-1"
                    disabled={scaleWindowLoading !== null} onClick={() => readScaleBatch(nextUnread.sequence)}>
                    {scaleWindowLoading === nextUnread.sequence ? "Reading local sources…" : `Read next two windows from ${nextUnread.sequence}`}
                  </button>;
                })()}
                <label className="ml-2">Mapped network kind <select value={scaleNetworkKind} className="rounded border border-cyan-300/40 bg-[#07120f] px-1 py-0.5"
                  onChange={(event) => {
                    scaleNetworkAbortRef.current?.abort();
                    scalePathAbortRef.current?.abort();
                    scalePathLedgerAbortRef.current?.abort();
                    pathReceiptChainAbortRef.current?.abort();
                    mappedPathOptionAbortRef.current?.abort();
                    setScaleNetworkKind(event.target.value as MappedNetworkKind | "");
                    setScaleNetworkResults({});
                    setScaleNetworkLoading(null);
                    setScalePathBatches({});
                    setScalePathLoading(null);
                    setScalePathLedgers({});
                    setScalePathLedgerLoading(null);
                    setPathReceiptChains({});
                    setPathReceiptChainLoading(null);
                    setMappedPathOptionReviews({});
                    setMappedPathOptionLoading(null);
                  }}>
                  <option value="">Choose kind</option>
                  {MAPPED_NETWORK_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </select></label>
                <div className="max-h-40 overflow-y-auto">{scenarioComparison.corridorScalePlan.plan.windows.map((window) => {
                  const result = scaleWindowEvidence[window.sequence];
                  const seam = scaleBatchSeams[window.sequence];
                  const sourceSummary = scaleSourceSummaries[window.sequence];
                  const network = scaleNetworkResults[window.sequence];
                  const pathBatch = scalePathBatches[window.sequence];
                  const optionReview = mappedPathOptionReviews[window.sequence];
                  const pathLedgers = scalePathLedgers[window.sequence] ?? [];
                  const lastLedger = pathLedgers[pathLedgers.length - 1];
                  const receiptChain = pathReceiptChains[window.sequence];
                  const ledgerScreenedSegments = pathLedgers.reduce((sum, ledger) => sum + ledger.coverage.screenedSegmentCount, 0);
                  const ledgerSourceGapsReported = pathLedgers.some((ledger) => ledger.coverage.sourceGapsReported);
                  const ledgerChainComplete = pathLedgers.length > 0 && pathLedgers[0].coverage.startSegmentIndex === 0 &&
                    lastLedger.coverage.status === "reached_path_end" &&
                    pathLedgers.every((ledger, index) => index === 0 ||
                      (ledger.coverage.startSegmentIndex === pathLedgers[index - 1].coverage.nextSegmentIndex &&
                        ledger.coverage.pathSha256 === pathLedgers[index - 1].coverage.pathSha256));
                  const lastPathPiece = pathBatch?.pieces[pathBatch.pieces.length - 1];
                  const pathScreen: CorridorScalePathScreenUi | null = pathBatch && lastPathPiece
                    ? { schemaVersion: "civilization_corridor_scale_path_screen/v3", network: pathBatch.network,
                      diplomaticContext: pathBatch.diplomaticContext, screen: lastPathPiece.screen } : null;
                  const pathEvidence = pathScreen?.screen.status === "available" ? pathScreen.screen.evidence : null;
                  const pathReviewLeads = pathScreen?.screen.status === "available" ? pathScreen.screen.reviewLeads : null;
                  return <div key={window.sequence} className="mt-1 border-t border-white/10 pt-1">
                    <span>Window {window.sequence} · sketch segment {window.sketchSegmentIndex + 1} · {window.bbox.map((value) => value.toFixed(2)).join(", ")}</span>
                    <button type="button" className="ml-2 rounded border border-cyan-300/40 px-1" disabled={scaleWindowLoading !== null}
                      onClick={() => readScaleWindow(window.sequence)}>{scaleWindowLoading === window.sequence ? "Reading…" : result ? "Refresh evidence" : "Read evidence"}</button>
                    <button type="button" className="ml-2 rounded border border-cyan-300/40 px-1" disabled={!scaleNetworkKind || scaleNetworkLoading !== null}
                      onClick={() => readScaleNetwork(window.sequence)}>{scaleNetworkLoading === window.sequence ? "Searching…" : `Search ${scaleNetworkKind || "selected"} network across up to three windows`}</button>
                    {result?.status === "unavailable" && <div className="text-amber-100">Window source screen unavailable: {result.reason}</div>}
                    {result?.status === "available" && <div className="text-slate-300">
                      <div>Country depictions {result.evidence.countryGeometryScreen.contacts.length} · mapped ways {result.evidence.mappedInfrastructure.status === "available" ? result.evidence.mappedInfrastructure.contacts?.length ?? 0 : result.evidence.mappedInfrastructure.status} · natural depictions {result.evidence.terrestrialDepictions.status === "available" ? result.evidence.terrestrialDepictions.contacts?.length ?? 0 : result.evidence.terrestrialDepictions.status} · river lines {result.evidence.hydrography.status === "available" ? result.evidence.hydrography.contacts?.length ?? 0 : result.evidence.hydrography.status} · published wetland sites {result.evidence.ramsarAreaReview.status === "available" ? result.evidence.ramsarAreaReview.sites?.filter((site) => site.relation === "intersects_published_depiction").length ?? 0 : result.evidence.ramsarAreaReview.status}</div>
                      <div>Source read {result.evidence.collectedAt}. Contacts are review leads for this local straight segment; continuity, impacts, rights, and consent remain unverified.</div>
                      <div>{result.evidence.countryGeometryScreen.contacts.slice(0, 2).map((contact) => contact.name).join(", ") || "No country polygon contact returned"} · <a href={result.evidence.countryGeometryScreen.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">country depiction source</a></div>
                      {result.evidence.mappedInfrastructure.status === "available" && result.evidence.mappedInfrastructure.contacts?.slice(0, 2).map((contact, index) =>
                        <a key={`${contact.edgeId}:${index}`} href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="mr-2 underline">OSM {contact.networkKind} contact</a>)}
                      {result.evidence.terrestrialDepictions.status === "available" && result.evidence.terrestrialDepictions.contacts?.slice(0, 2).map((contact, index) =>
                        <a key={`${contact.featureId}:${index}`} href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="mr-2 underline">{contact.featureKind.replaceAll("_", " ")} contact</a>)}
                      {result.evidence.ramsarAreaReview.status === "available" && result.evidence.ramsarAreaReview.sites?.filter((site) => site.relation === "intersects_published_depiction").slice(0, 2).map((site) =>
                        <a key={site.siteNumber} href={site.sourceRecordUrl} target="_blank" rel="noreferrer" className="mr-2 underline">{site.name}</a>)}
                      {result.evidence.unresolved.length > 0 && <div className="text-amber-100">{result.evidence.unresolved.slice(0, 2).join(" · ")}</div>}
                    </div>}
                    {sourceSummary && (sourceSummary.unavailableSources.length > 0 || sourceSummary.possiblyTruncatedSources.length > 0) &&
                      <div className="text-amber-100">Unavailable: {sourceSummary.unavailableSources.join(", ") || "none"} · capped or incomplete: {sourceSummary.possiblyTruncatedSources.join(", ") || "none"}.</div>}
                    {seam && <div className="text-amber-100">Seam to window {seam.secondWindowSequence}: {seam.sketchGeometryRelation.replaceAll("_", " ")} · mapped continuity {seam.mappedNetworkContinuity} · {seam.sharedMappedWayRecordUrls.length} shared mapped way citation leads.
                      {seam.sharedMappedWayRecordUrls.slice(0, 2).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="ml-2 underline">OSM record</a>)}
                    </div>}
                    {network && <div className="mt-1 text-cyan-100">{network.query.networkKind} graph across {network.coverage.selectedWindowCount} windows: {network.route.status.replaceAll("_", " ")} · {network.coverage.graphWays} mapped ways, {network.coverage.graphNodes} nodes, {network.coverage.graphSegments} segments.
                      {network.route.status === "mapped_topology_candidate" && <span> {network.route.mappedLengthKm.toFixed(1)} km mapped length across {network.route.mappedSegmentCount} segments; endpoint snaps {network.route.originSnapDistanceKm.toFixed(2)} / {network.route.destinationSnapDistanceKm.toFixed(2)} km.</span>}
                      {network.coverage.possiblyTruncated && <span className="text-amber-100"> Source, graph, or citation coverage incomplete.</span>}
                      {network.route.status === "mapped_topology_candidate" && network.route.mappedWayRecordUrlsOmitted > 0 && <span className="text-amber-100"> {network.route.mappedWayRecordUrlsOmitted} of {network.route.mappedWayRecordUrlCount} distinct way links omitted from the summary; {network.route.pathGeometry.status === "complete" ? "the complete segment geometry retains their citations" : "request a smaller path window before screening"}.</span>}
                      {network.route.status === "mapped_topology_candidate" && <div className={network.route.pathGeometry.status === "complete" ? "text-slate-300" : "text-amber-100"}>
                        {network.route.pathGeometry.status === "complete"
                          ? `All ${network.route.pathGeometry.segmentCount} mapped OSM segments are available for the bounded path screen below; contacts, effects, and rights have not been assessed for the full path.`
                          : `${network.route.pathGeometry.segmentCount} path segments exceed the ${network.route.pathGeometry.responseLimit}-segment geometry response cap; no partial path is presented as screenable.`}
                      </div>}
                      {network.coverage.conflictingWayCount > 0 || network.coverage.conflictingNodeCount > 0 ? <span className="text-amber-100"> Conflicting way or node records excluded.</span> : null}
                      <div>{network.route.interpretation}</div>
                      {network.route.status === "mapped_topology_candidate" && network.route.mappedWayRecordUrls.slice(0, 4).map((url) =>
                        <a key={url} href={url} target="_blank" rel="noreferrer" className="mr-2 underline">mapped way source</a>)}
                      {network.route.status === "mapped_topology_candidate" && network.route.pathGeometry.status === "complete" && (() => {
                        const nextIndex = pathBatch?.coverage.nextSegmentIndex ?? 0;
                        return <button type="button" className="mt-1 block rounded border border-cyan-300/40 px-2 py-1"
                          disabled={scalePathLoading !== null || pathBatch?.coverage.status === "batch_reached_path_end" || pathBatch?.coverage.status === "path_not_screenable"}
                          onClick={() => readScalePathBatch(window.sequence, nextIndex)}>
                          {scalePathLoading === window.sequence ? "Screening mapped path…" : pathBatch?.coverage.status === "batch_reached_path_end"
                            ? "Reached mapped path end" : pathBatch?.coverage.status === "more_pieces_needed"
                              ? `Screen next three path pieces from segment ${nextIndex + 1}` : pathBatch?.coverage.status === "source_piece_unavailable"
                                ? `Retry path screen from segment ${nextIndex + 1}` : pathBatch?.coverage.status === "path_not_screenable"
                                  ? "Path changed; refresh network" : "Screen first three mapped path pieces"}
                        </button>;
                      })()}
                      {pathBatch && <div className="mt-1 text-slate-300">Path batch: {pathBatch.coverage.screenedSegmentCount} of {pathBatch.coverage.totalPathSegments ?? "unknown"} segments screened in this read · {pathBatch.coverage.status.replaceAll("_", " ")}.
                        {pathBatch.coverage.nextSegmentIndex !== null && <> Next segment: {pathBatch.coverage.nextSegmentIndex + 1}.</>}
                        <div>{pathBatch.reviewLeads.countryDepictions.length} country and {pathBatch.reviewLeads.naturalFeatures.length} natural-feature depiction leads across available pieces. {pathBatch.coverage.interpretation}</div>
                        {(pathBatch.coverage.unavailableSources.length > 0 || pathBatch.coverage.possiblyTruncatedSources.length > 0) && <div className="text-amber-100">Unavailable: {pathBatch.coverage.unavailableSources.join(", ") || "none"} · capped or incomplete: {pathBatch.coverage.possiblyTruncatedSources.join(", ") || "none"}.</div>}
                      </div>}
                      {network.route.status === "mapped_topology_candidate" && network.route.pathGeometry.status === "complete" && <button type="button" className="mt-1 rounded border border-cyan-300/40 px-2 py-1"
                        disabled={scalePathLedgerLoading !== null || lastLedger?.coverage.status === "path_changed_or_unavailable" || lastLedger?.coverage.nextSegmentIndex === null}
                        onClick={() => readScalePathLedger(window.sequence, lastLedger?.coverage.nextSegmentIndex ?? 0)}>
                        {scalePathLedgerLoading === window.sequence ? "Reconciling path batches…" : lastLedger?.coverage.nextSegmentIndex !== undefined && lastLedger.coverage.nextSegmentIndex !== null
                          ? `Continue path ledger at segment ${lastLedger.coverage.nextSegmentIndex + 1}` : lastLedger ? "Path ledger reached end" : "Read mapped-path ledger"}
                      </button>}
                      {lastLedger && <div className="mt-1 rounded border border-cyan-300/25 p-1 text-slate-300">
                        <div>{pathLedgers.length} consecutive ledger receipt{pathLedgers.length === 1 ? "" : "s"} · {ledgerScreenedSegments} of {lastLedger.coverage.totalPathSegments ?? "unknown"} mapped segments read in this panel session.</div>
                        <div>{receiptChain?.coverage.wholePathGeometryRead ? "Server-reconciled geometry read from start to end." :
                          ledgerChainComplete ? "Panel receipts reach the mapped end; server reconciliation pending." :
                            lastLedger.coverage.status.replaceAll("_", " ") + "."} {ledgerSourceGapsReported && <span className="text-amber-100">Source gaps or capped responses reported.</span>}</div>
                        {pathReceiptChainLoading === window.sequence && <div>Reconciling server-held path receipts…</div>}
                        {receiptChain && <div>Server receipt chain: {receiptChain.coverage.screenedSegmentCount} of {receiptChain.coverage.totalPathSegments} segments · {receiptChain.coverage.status.replaceAll("_", " ")} · {receiptChain.reviewLeads.countryDepictions.length} country and {receiptChain.reviewLeads.naturalFeatures.length} natural-feature depiction leads. Reads span {receiptChain.coverage.earliestReadAt} to {receiptChain.coverage.latestReadAt}.</div>}
                        <div>Latest receipt: {lastLedger.reviewLeads.countryDepictions.length} country and {lastLedger.reviewLeads.naturalFeatures.length} natural-feature depiction leads. {lastLedger.coverage.interpretation}</div>
                      </div>}
                      {(pathBatch || receiptChain || (pathLedgers.length === 1 && pathLedgers[0]?.coverage.startSegmentIndex === 0)) && <button type="button" className="mt-1 rounded border border-cyan-300/40 px-2 py-1"
                        disabled={mappedPathOptionLoading !== null || pathReceiptChainLoading === window.sequence || (pathLedgers.length > 1 && !receiptChain)}
                        onClick={() => reviewMappedPathOption(window.sequence)}>
                        {mappedPathOptionLoading === window.sequence ? "Comparing conditional option…" : optionReview ? "Refresh mapped-path option review" : "Compare mapped path as conditional option"}
                      </button>}
                      {optionReview?.conditionalOption.status === "not_available" &&
                        <div className="mt-1 text-amber-100">Mapped-path option unavailable: {optionReview.conditionalOption.reason.replaceAll("_", " ")}. {optionReview.conditionalOption.interpretation}</div>}
                      {optionReview?.conditionalOption.status === "review_question_only" && <details className="mt-1 rounded border border-cyan-300/25 p-1.5 text-slate-300">
                        <summary className="cursor-pointer font-semibold text-cyan-100">Mapped-path option · conditional review only</summary>
                        <p className="mt-1">{optionReview.conditionalOption.question}</p>
                        <p className="text-amber-100">{optionReview.conditionalOption.interpretation}</p>
                        <p>Bounded mapped length: {optionReview.conditionalOption.mappedLengthKm.toFixed(1)} km. This is not a benefit or cost. This source read screened {optionReview.conditionalOption.pathCoverage.screenedSegmentCount} of {optionReview.conditionalOption.pathCoverage.totalPathSegments ?? "unknown"} path segments.
                          {"wholePathGeometryRead" in optionReview.conditionalOption.pathCoverage && optionReview.conditionalOption.pathCoverage.wholePathGeometryRead && " Full mapped geometry was read in this receipt; source and decision gates remain open."}</p>
                        <p>Mapped-network source reads: {optionReview.conditionalOption.networkSourceSummary.networkReadCount} · {optionReview.conditionalOption.networkSourceSummary.status.replaceAll("_", " ")}.
                          {optionReview.conditionalOption.networkSourceSummary.unavailableWindowSequences.length > 0 && ` Unavailable windows: ${optionReview.conditionalOption.networkSourceSummary.unavailableWindowSequences.join(", ")}.`}
                          {optionReview.conditionalOption.networkSourceSummary.possiblyTruncatedWindowSequences.length > 0 && ` Capped windows: ${optionReview.conditionalOption.networkSourceSummary.possiblyTruncatedWindowSequences.join(", ")}.`}
                          {optionReview.conditionalOption.networkSourceSummary.graphSegmentLimitReached && " Graph segment limit reached."} A stable path hash does not prove complete infrastructure or operating service.</p>
                        <p>{optionReview.conditionalOption.comparison.interpretation}</p>
                        <details className="mt-1"><summary className="cursor-pointer">Do the selected countries touch this mapped path?</summary>
                          <p className="mt-1 text-amber-100">{optionReview.conditionalOption.selectedCountryDepictionReview.interpretation}</p>
                          <p>{optionReview.conditionalOption.snappedEndpointDepictionReview.interpretation}</p>
                          <p>Snapped start: {optionReview.conditionalOption.snappedEndpointDepictionReview.start.point.lat.toFixed(4)}, {optionReview.conditionalOption.snappedEndpointDepictionReview.start.point.lon.toFixed(4)} ({optionReview.conditionalOption.snappedEndpointDepictionReview.originSnapDistanceKm.toFixed(2)} km from requested origin). Snapped end: {optionReview.conditionalOption.snappedEndpointDepictionReview.end.point.lat.toFixed(4)}, {optionReview.conditionalOption.snappedEndpointDepictionReview.end.point.lon.toFixed(4)} ({optionReview.conditionalOption.snappedEndpointDepictionReview.destinationSnapDistanceKm.toFixed(2)} km from requested destination).</p>
                          {optionReview.conditionalOption.snappedEndpointDepictionReview.selectedCountries.map((country) => <div key={`endpoint:${country.countryIso3}`}>
                            {country.countryIso3} · start {country.startRelation.replaceAll("_", " ")} · end {country.endRelation.replaceAll("_", " ")}.
                          </div>)}
                          <a href={optionReview.conditionalOption.snappedEndpointDepictionReview.start.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">Natural Earth depiction source</a>
                          {optionReview.conditionalOption.selectedCountryDepictionReview.countries.map((country) => <div key={country.countryIso3} className="mt-1 border-t border-white/10 pt-1">
                            <strong>{country.countryIso3}</strong> · {country.status.replaceAll("_", " ")} · exact endpoint and jurisdiction not established.
                            <div>{country.reviewQuestion}</div>
                            {country.sourceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="mr-2 underline">country depiction source</a>)}
                          </div>)}
                        </details>
                        <details className="mt-1"><summary className="cursor-pointer">Related public infrastructure concepts</summary>
                          <p className="mt-1 text-amber-100">{optionReview.conditionalOption.sameFamilyConceptContext.interpretation}</p>
                          {optionReview.conditionalOption.sameFamilyConceptContext.matchedOptions.map((entry) => <div key={entry.optionId} className="mt-1 border-t border-white/10 pt-1">
                            <strong>{entry.conceptFamily.replaceAll("_", " ")}</strong> · {entry.optionId}
                            {entry.discussionBasis ? <>
                              <div>{entry.discussionBasis.rationale}</div>
                              {entry.discussionBasis.reviewedPositionBasis.map((basis) => <div key={`${basis.countryIso3}:${basis.assertionId}`}>
                                {basis.countryIso3}: <a href={basis.sourceUrl} target="_blank" rel="noreferrer" className="underline">submitted PDF p. {basis.sourcePage}</a> · {basis.role.replaceAll("_", " ")}.
                              </div>)}
                              {entry.discussionBasis.governmentRecordBasis.map((basis) => <div key={basis.recordId}>
                                <a href={basis.sourceUrl} target="_blank" rel="noreferrer" className="underline">Government record {basis.recordId}</a> · {basis.role.replaceAll("_", " ")}.
                              </div>)}
                            </> : <div className="text-amber-100">No option discussion basis is attached.</div>}
                            {entry.selectedGovernmentResponses.map((response) => <div key={response.countryIso3} className="mt-1 border-l border-cyan-300/25 pl-2">
                              {response.countryIso3} · concept record: {response.conceptPositionStatus.replaceAll("_", " ")} · exact mapped alignment position not established.
                              <div>{response.reviewQuestion}</div>
                            </div>)}
                          </div>)}
                          {optionReview.conditionalOption.sameFamilyConceptContext.matchedOptions.length === 0 && <p>No same-family public concept is indexed for this selected pair and network kind.</p>}
                        </details>
                        <details className="mt-1"><summary className="cursor-pointer">Evidence needed to compare options</summary>
                          <p className="mt-1">{optionReview.conditionalOption.comparisonHandoff.basisQuestion}</p>
                          <p>Policy review candidate: {optionReview.conditionalOption.comparisonHandoff.noBuildBaseline.optionId ?? "none scoped"}. A comparable no-build baseline still needs the same service, endpoints, direction, and planning year.</p>
                          {optionReview.conditionalOption.comparisonHandoff.objectives.map((item) => <div key={item.objective} className="mt-1 border-t border-white/10 pt-1">
                            <strong>{item.objective.replaceAll("_", " ")}</strong> · mapped path: {item.mappedPathStatus.replaceAll("_", " ")} · outcome comparison not established.
                            <div>{item.measurementQuestion} Consult: {item.actorToConsult.replaceAll("_", " ")}.</div>
                            {item.scenarioInfrastructureOptions.length > 0 && <div>Other infrastructure options: {item.scenarioInfrastructureOptions.map((peer) => `${peer.optionId} (${peer.status.replaceAll("_", " ")})`).join(" · ")}</div>}
                          </div>)}
                          <p className="mt-1 text-amber-100">{optionReview.conditionalOption.comparisonHandoff.interpretation}</p>
                        </details>
                        {optionReview.conditionalOption.selectedCountryViews.map((view) => <div key={view.countryIso3} className="mt-1 border-t border-white/10 pt-1">
                          <strong>{view.countryIso3}</strong> · option-specific position unverified; possible gain and loss unquantified.
                          {view.reviewedAssertion ? <div>Public-position context: <a href={view.reviewedAssertion.sourceUrl} target="_blank" rel="noreferrer" className="underline">{view.reviewedAssertion.text}</a> · submitted PDF p. {view.reviewedAssertion.sourcePage} · {view.reviewedAssertion.speechDate}. {view.reviewedAssertion.uncertainty}</div>
                            : <div className="text-amber-100">No selected reviewed assertion for this side.</div>}
                        </div>)}
                        <details className="mt-1"><summary className="cursor-pointer">Mapped third-country and natural-system review leads</summary>
                          <p className="mt-1 text-amber-100">These are source depictions near screened path pieces. They do not identify legal jurisdiction, affected people, impact, consent, or a government's view of this option.</p>
                          {optionReview.conditionalOption.candidateThirdCountryReviewLeads.map((lead) => <div key={lead.countryIso3} className="mt-1 border-t border-white/10 pt-1">
                            <strong>{lead.countryIso3}</strong> · {lead.depictionNames.join(", ")} · current position, rights, and relationship effect unassessed.
                            <div>{lead.reviewQuestion}</div>
                            {lead.sourceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="mr-2 underline">country depiction source</a>)}
                            {lead.selectedPublicPositionContext.assertion ? <div className="mt-1">Selected public-position context: <a href={lead.selectedPublicPositionContext.assertion.sourceUrl} target="_blank" rel="noreferrer" className="underline">{lead.selectedPublicPositionContext.assertion.text}</a> · submitted PDF p. {lead.selectedPublicPositionContext.assertion.sourcePage} · {lead.selectedPublicPositionContext.assertion.speechDate}. This does not address this mapped option. {lead.selectedPublicPositionContext.assertion.uncertainty}</div>
                              : <div className="mt-1 text-amber-100">No selected reviewed assertion for this country is available here.</div>}
                            {lead.namedCounterpartReferences.map((reference) => <div key={`${reference.fromIso3}:${reference.toIso3}:${reference.assertionId}`} className="mt-1">
                              Explicit named reference {reference.fromIso3} → {reference.toIso3}: <a href={reference.sourceUrl} target="_blank" rel="noreferrer" className="underline">{reference.text}</a> · submitted PDF p. {reference.sourcePage} · {reference.speechDate}. Its effect on this route is unassessed. {reference.uncertainty}
                            </div>)}
                            {lead.relationshipRecordContext.map((record) => <div key={`${record.role}:${record.recordId}`} className="mt-1">
                              Dated relationship context · {record.role.replaceAll("_", " ")} · {record.recordId}. Effect on this mapped option unassessed.
                              {record.sourceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="ml-2 underline">source</a>)}
                            </div>)}
                            {lead.namedCounterpartReferences.length === 0 && <div className="mt-1 text-slate-400">No explicit counterpart reference was identified in the selected reviewed statements.</div>}
                          </div>)}
                          {optionReview.conditionalOption.candidateThirdCountryReviewLeads.length === 0 && <p className="mt-1 text-slate-300">No third-country depiction lead was returned in available screened pieces; this does not rule out affected countries or people.</p>}
                          {optionReview.conditionalOption.unattributedCountryDepictionCount > 0 && <p className="mt-1 text-amber-100">{optionReview.conditionalOption.unattributedCountryDepictionCount} country depiction lead{optionReview.conditionalOption.unattributedCountryDepictionCount === 1 ? "" : "s"} could not be assigned an ISO3 affiliation here.</p>}
                          {optionReview.conditionalOption.naturalFeatureLeads.map((feature) => <div key={`${feature.kind}:${feature.sourceUrl}:${feature.label}`} className="mt-1 border-t border-white/10 pt-1">
                            <a href={feature.sourceUrl} target="_blank" rel="noreferrer" className="underline">{feature.label}</a> · {feature.kind.replaceAll("_", " ")} depiction · mapped segments {feature.pathSegmentIndices.map((index) => index + 1).join(", ") || "not localized"}.
                          </div>)}
                          {optionReview.conditionalOption.naturalFeatureLeads.length === 0 && <p className="mt-1 text-slate-300">No natural-feature depiction lead was returned in available screened pieces; this does not establish no environmental effect.</p>}
                        </details>
                        <details className="mt-1"><summary className="cursor-pointer">Six unverified decision gates</summary>
                          {optionReview.conditionalOption.gates.map((gate) => <div key={gate.id} className="mt-1 border-t border-white/10 pt-1">
                            <strong>{gate.id.replaceAll("_", " ")}</strong> · {gate.evidenceNeeded}
                            {gate.contextSourceUrls.slice(0, 2).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="ml-2 underline">source lead</a>)}
                          </div>)}
                        </details>
                      </details>}
                      {pathScreen?.screen.status === "not_screenable" && <div className="text-amber-100">Mapped path screen stopped: {pathScreen.screen.reason.replaceAll("_", " ")}. Refresh the network search before continuing.</div>}
                      {pathScreen?.screen.status === "unavailable" && <div className="text-amber-100">Path segments {pathScreen.screen.startSegmentIndex + 1}–{pathScreen.screen.startSegmentIndex + pathScreen.screen.screenedSegmentCount} could not be screened: {pathScreen.screen.reason}.</div>}
                      {pathScreen?.screen.status === "available" && pathEvidence && pathReviewLeads && <div className="mt-1 rounded border border-cyan-300/20 p-1 text-slate-300">
                        Exact mapped segments {pathScreen.screen.startSegmentIndex + 1}–{pathScreen.screen.startSegmentIndex + pathScreen.screen.screenedSegmentCount} in window {pathScreen.screen.windowSequence}: {pathEvidence.countryGeometryScreen.contacts.length} country depiction contacts · {pathEvidence.hydrography.status === "available" ? pathEvidence.hydrography.contacts?.length ?? 0 : pathEvidence.hydrography.status} waterway contacts · {pathEvidence.lakeReview.status === "available" ? pathEvidence.lakeReview.contacts?.length ?? 0 : pathEvidence.lakeReview.status} lake contacts · {pathEvidence.terrestrialDepictions.status === "available" ? pathEvidence.terrestrialDepictions.contacts?.length ?? 0 : pathEvidence.terrestrialDepictions.status} terrestrial contacts · {pathEvidence.ramsarAreaReview.status === "available" ? pathEvidence.ramsarAreaReview.sites?.filter((site) => site.relation === "intersects_published_depiction").length ?? 0 : pathEvidence.ramsarAreaReview.status} published wetland contacts.
                        {pathEvidence.countryGeometryScreen.contacts.slice(0, 2).map((contact) => <a key={contact.sourceFeatureId} href={pathEvidence.countryGeometryScreen.sourceRecordUrl} target="_blank" rel="noreferrer" className="ml-2 underline">{contact.name}</a>)}
                        {pathEvidence.hydrography.status === "available" && pathEvidence.hydrography.contacts?.slice(0, 2).map((contact, index) => <a key={`${contact.lineId}:${index}`} href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="ml-2 underline">{contact.lineLabel}</a>)}
                        {pathEvidence.lakeReview.status === "available" && pathEvidence.lakeReview.contacts?.slice(0, 2).map((contact, index) => <a key={`${contact.lakeFeatureId}:${index}`} href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="ml-2 underline">{contact.lakeLabel}</a>)}
                        {pathEvidence.terrestrialDepictions.status === "available" && pathEvidence.terrestrialDepictions.contacts?.slice(0, 2).map((contact, index) => <a key={`${contact.featureId}:${index}`} href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="ml-2 underline">{contact.featureKind.replaceAll("_", " ")}</a>)}
                        {pathEvidence.ramsarAreaReview.status === "available" && pathEvidence.ramsarAreaReview.sites?.filter((site) => site.relation === "intersects_published_depiction").slice(0, 2).map((site) => <a key={site.siteNumber} href={site.sourceRecordUrl} target="_blank" rel="noreferrer" className="ml-2 underline">{site.name}</a>)}
                        <div className="mt-1">Review leads: {pathReviewLeads.countryDepictions.length} country depictions · {pathReviewLeads.naturalFeatures.length} distinct natural feature depictions.</div>
                        {(pathReviewLeads.unavailableSources.length > 0 || pathReviewLeads.possiblyTruncatedSources.length > 0) &&
                          <div className="text-amber-100">Unavailable: {pathReviewLeads.unavailableSources.join(", ") || "none"} · capped or incomplete: {pathReviewLeads.possiblyTruncatedSources.join(", ") || "none"}.</div>}
                        <details className="mt-1"><summary className="cursor-pointer">Next source and affected-party questions</summary>
                          {pathReviewLeads.nextEvidenceRequests.map((request) => <div key={request.actorClass} className="mt-1 border-t border-white/10 pt-1">
                            <strong>{request.actorClass.replaceAll("_", " ")}</strong> · {request.question}
                            {request.contextSourceUrls.slice(0, 2).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="ml-2 underline">context source</a>)}
                          </div>)}
                          <p className="mt-1 text-amber-100">{pathReviewLeads.interpretation}</p>
                        </details>
                        {pathScreen.diplomaticContext.status === "available" && <details className="mt-1"><summary className="cursor-pointer">Selected governments’ cited public-position context</summary>
                          <p className="text-amber-100">These statements do not support this mapped alignment or establish permission.</p>
                          {pathScreen.diplomaticContext.pairGlance.directions.map((direction) => <div key={direction.countryIso3} className="mt-1 border-t border-white/10 pt-1">
                            <strong>{direction.countryIso3}</strong> · {direction.positionStatus.replaceAll("_", " ")}
                            {direction.assertion ? <div><a href={direction.assertion.sourceUrl} target="_blank" rel="noreferrer" className="underline">{direction.assertion.text}</a> · submitted PDF p. {direction.assertion.sourcePage} · {direction.assertion.speechDate}<div className="text-amber-100">{direction.assertion.uncertainty}</div></div>
                              : <div className="text-amber-100">No selected reviewed assertion for this side.</div>}
                          </div>)}
                          {pathScreen.diplomaticContext.pairGlance.sharedTopic && <p className="mt-1">Shared public topic: {pathScreen.diplomaticContext.pairGlance.sharedTopic.label} · {pathScreen.diplomaticContext.pairGlance.sharedTopic.comparisonBasis.replaceAll("_", " ")}. {pathScreen.diplomaticContext.pairGlance.sharedTopic.unansweredQuestion}</p>}
                          <p className="mt-1 text-cyan-100">Next question: {pathScreen.diplomaticContext.nextQuestion}</p>
                        </details>}
                        {pathScreen.diplomaticContext.status === "unavailable" && <div className="text-amber-100">Selected-pair position context unavailable: {pathScreen.diplomaticContext.reason}.</div>}
                        <div className="text-amber-100">Other path pieces, current conditions, rights, ecological and community effects, and consent remain unassessed.</div>
                      </div>}
                    </div>}
                  </div>;
                })}</div>
              </details>}
              <details><summary>Dated source timeline ({scenarioComparison.timeFrame.sourceTimeline.length})</summary>
                {scenarioComparison.timeFrame.sourceTimeline.map((source) => <div key={source.sourceId} className="mt-1 text-[10px] text-slate-300">
                  <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="underline">{source.sourceKind.replaceAll("_", " ")} · {source.sourceTime ?? "date unknown"}</a>
                  <span> · {source.sourceTimeMeaning} · validity in the planning year unverified</span>
                </div>)}
              </details>
              {scenarioComparison.issueComparison.facets.some((facet) => facet.routeEndpointGate === "blocked_pending_delivered_wording_review") &&
                <p className="text-amber-100">A submitted railway place name differs from the provisional transcript. Review delivered wording before using it as a route endpoint.</p>}
              <details><summary>Regional connectivity positions ({scenarioComparison.issueComparison.facets.length} facets)</summary>
                {scenarioComparison.issueComparison.facets.map((facet) => <div key={facet.id} className="mt-1 border-t border-white/10 pt-1">
                  <div className="font-medium">{facet.label} · {facet.comparison.replaceAll("_", " ")}</div>
                  {facet.comparisonBasis === "parallel_reviewed_topic_inventory" && <div className="text-[10px] text-amber-100">Parallel submitted topics only; pair-specific relevance and agreement unassessed.</div>}
                  {facet.facetKind === "stated_safety_concern" && <div className="text-[10px] text-amber-100">Stated mine-action positions; no joint program or route hazard verified.</div>}
                  {facet.facetKind === "stated_humanitarian_concern" && <div className="text-[10px] text-amber-100">No agreed mechanism or family perspective verified.</div>}
                  {facet.facetKind === "stated_trust_concern" && <div className="text-[10px] text-amber-100">No population-wide attitudes or counterpart response verified.</div>}
                  {facet.facetKind === "stated_jurisdiction_principle" && <div className="text-[10px] text-amber-100">Access aspiration and sovereignty principle only; no shared route, direct tension, permission, or legal border finding established.</div>}
                  {facet.contrast.sharedPublicTopic && <div className="text-[10px]">Shared public topic: {facet.contrast.sharedPublicTopic}</div>}
                  {facet.contrast.differenceInSubmittedClaims && <div className="text-[10px]">Difference in claims: {facet.contrast.differenceInSubmittedClaims}</div>}
                  {facet.contrast.framingDifference.status === "documented_in_selected_submitted_texts" && <div className="text-[10px] text-amber-100">Different framing in submitted texts: {facet.contrast.framingDifference.description} {facet.contrast.framingDifference.inferenceLimit}</div>}
                  <div className="text-[10px] text-slate-400">{facet.contrast.missingCountryIso3s.length
                    ? `Selected reviewed position unavailable for ${facet.contrast.missingCountryIso3s.join(", ")}.`
                    : facet.comparisonBasis === "parallel_reviewed_topic_inventory"
                      ? "Both briefs mention this topic independently; bilateral tension remains unassessed."
                      : "No direct contradiction identified in these selected assertions; broader positions remain unverified."}</div>
                  {facet.positions.map((position) => <div key={`${position.countryIso3}:${position.id}`} className="text-[10px]">
                    {position.countryIso3}: <a href={position.sourceUrl} target="_blank" rel="noreferrer" className="underline">{position.text} (submitted PDF p. {position.sourcePage})</a>
                    <span className="text-slate-400"> · {position.sourceLanguage}</span>
                    {position.provisionalReconciliation.alignment === "wording_discrepancy" && position.provisionalReconciliation.recordingReview && <> · <a href={position.provisionalReconciliation.recordingReview.sourceUrl} target="_blank" rel="noreferrer" className="underline">UN Web TV recording (not reviewed)</a></>}
                  </div>)}
                </div>)}
                {scenarioComparison.issueComparison.reviewedPositionProjectLinks.map((link) => <div key={`${link.assertionId}:${link.milestoneId}`} className="mt-1 border-t border-cyan-300/20 pt-1 text-[10px] text-cyan-100">
                  <a href={link.assertionSourceUrl} target="_blank" rel="noreferrer" className="underline">{link.assertionCountryIso3} submitted position · p. {link.assertionSourcePage}</a>
                  {" ↔ "}<a href={link.milestoneSourceUrl} target="_blank" rel="noreferrer" className="underline">dated project source</a>
                  <div>Question: {link.reviewQuestion}</div><div className="text-slate-400">{link.inferenceLimit}</div>
                </div>)}
                {scenarioComparison.issueComparison.facets.length === 0 && <p className="text-amber-100">This pair has no reviewed issue crosswalk yet.</p>}
                {scenarioComparison.issueComparison.datedNegotiatingConditions.map((condition) => <div key={condition.id} className="mt-1 border-t border-amber-300/20 pt-1 text-[10px] text-amber-100">
                  Dated negotiating condition: {condition.interpretation}
                  {condition.positions.map((position) => <div key={position.countryIso3}><a href={position.sourceUrl} target="_blank" rel="noreferrer" className="underline">{position.countryIso3} · {position.sourceDate}</a>: {position.paraphrase} {position.limit}</div>)}
                  <div>Question for both governments: {condition.nextQuestion}</div>
                </div>)}
                {scenarioComparison.issueComparison.thirdPartyPerspectives.map((position) => <div key={position.countryIso3} className="mt-1 border-t border-white/10 pt-1 text-[10px]">
                  {position.countryIso3} · {position.relevanceToPair.status.replaceAll("_", " ")}: {position.relevanceToPair.interpretation}
                  {position.assertions.map((assertion) => <span key={assertion.id}> · <a href={assertion.sourceUrl} target="_blank" rel="noreferrer" className="underline">{assertion.id} p. {assertion.sourcePage}</a></span>)}
                </div>)}
                {scenarioComparison.issueComparison.thirdPartyCoverageGaps.map((gap) => <div key={gap.countryIso3} className="mt-1 text-[10px] text-amber-100">
                  {gap.countryIso3} · reviewed position unavailable: {gap.interpretation} {gap.officialPageUrl && <a href={gap.officialPageUrl} target="_blank" rel="noreferrer" className="underline">Official page</a>}
                </div>)}
              </details>
              <details><summary>Water, climate, and disaster positions ({scenarioComparison.naturalSystemIssueComparison.facets.length} facets)</summary>
                <div className="mt-1 rounded border border-cyan-300/20 p-1.5 text-[10px] text-slate-200">
                  <div className="font-medium text-cyan-100">Named natural systems · {scenarioComparison.naturalSystemIssueComparison.namedNaturalSystemReview.status.replaceAll("_", " ")}</div>
                  <p>{scenarioComparison.naturalSystemIssueComparison.namedNaturalSystemReview.interpretation}</p>
                  {scenarioComparison.naturalSystemIssueComparison.namedNaturalSystemReview.references.map((reference) => <a key={`${reference.countryIso3}:${reference.assertionId}:${reference.systemId}`} href={reference.sourceUrl} target="_blank" rel="noreferrer" className="mr-2 underline">{reference.countryIso3}: {reference.label}</a>)}
                </div>
                {scenarioComparison.naturalSystemIssueComparison.facets.map((facet) => <div key={facet.id} className="mt-1 border-t border-white/10 pt-1">
                  <div className="font-medium">{facet.label} · {facet.comparison.replaceAll("_", " ")}</div>
                  <div className="text-[10px] text-amber-100">{facet.comparisonBasis === "pair_specific_editorial_crosswalk"
                    ? "Selected submitted statements were compared on this issue; delivery, operations, agreement, and effects require separate evidence."
                    : "Reviewed statements grouped by topic. Bilateral relevance, shared systems, current policy, and effects require separate evidence."}</div>
                  {facet.contrast.sharedPublicTopic && <div className="text-[10px]">{facet.contrast.sharedPublicTopic}</div>}
                  {facet.contrast.differenceInSubmittedClaims && <div className="text-[10px] text-cyan-100">Different scopes: {facet.contrast.differenceInSubmittedClaims}</div>}
                  {facet.contrast.missingCountryIso3s.length > 0 && <div className="text-[10px] text-amber-100">No selected reviewed assertion for {facet.contrast.missingCountryIso3s.join(", ")}.</div>}
                  {facet.positions.map((position) => <div key={`${position.countryIso3}:${position.id}`} className="text-[10px]">
                    {position.countryIso3}: <a href={position.sourceUrl} target="_blank" rel="noreferrer" className="underline">{position.text} (submitted PDF p. {position.sourcePage})</a>
                    <span className="text-slate-400"> · {position.sourceLanguage}</span>
                  </div>)}
                  <div className="text-[10px] text-cyan-100">Next question: {facet.unansweredQuestion}</div>
                </div>)}
                {scenarioComparison.naturalSystemIssueComparison.facets.length === 0 && <p className="text-amber-100">No selected reviewed water, climate, or disaster assertion for this pair.</p>}
              </details>
              <details><summary>Humanitarian and trust positions ({scenarioComparison.humanitarianIssueComparison.facets.length} facets)</summary>
                {scenarioComparison.humanitarianIssueComparison.facets.map((facet) => <div key={facet.id} className="mt-1 border-t border-white/10 pt-1">
                  <div className="font-medium">{facet.label} · {facet.comparison.replaceAll("_", " ")}</div>
                  {facet.comparisonBasis === "parallel_reviewed_topic_inventory" && <div className="text-[10px] text-amber-100">Parallel submitted topics only; pair-specific relevance and agreement unassessed.</div>}
                  {facet.contrast.sharedPublicTopic && <div className="text-[10px]">Shared public topic: {facet.contrast.sharedPublicTopic}</div>}
                  {facet.contrast.differenceInSubmittedClaims && <div className="text-[10px]">Difference in claims: {facet.contrast.differenceInSubmittedClaims}</div>}
                  {facet.contrast.missingCountryIso3s.length > 0 && <div className="text-[10px] text-amber-100">No selected reviewed assertion for {facet.contrast.missingCountryIso3s.join(", ")}; its position here is unknown.</div>}
                  {facet.positions.map((position) => <div key={`${position.countryIso3}:${position.id}`} className="text-[10px]">
                    {position.countryIso3}: <a href={position.sourceUrl} target="_blank" rel="noreferrer" className="underline">{position.text} (submitted PDF p. {position.sourcePage})</a>
                    <span className="text-slate-400"> · {position.sourceLanguage}</span>
                  </div>)}
                  <div className="text-[10px] text-cyan-100">Next question: {facet.unansweredQuestion}</div>
                </div>)}
                {scenarioComparison.humanitarianIssueComparison.facets.length === 0 && <p className="text-amber-100">No reviewed humanitarian crosswalk for this pair.</p>}
              </details>
              <div className="font-semibold text-white">Evidence-linked options ({scenarioComparison.options.length}) · expand one to inspect its basis and gaps</div>
              {scenarioComparison.options.map((option) => <details key={option.id} className="rounded border border-white/15 p-1.5">
                <summary className="cursor-pointer">
                  <span className="font-medium text-white">{option.policyReview?.question ?? (option.concept
                    ? `Unlocated ${option.concept.family.replaceAll("_", " ")} concept`
                    : option.kind === "no_build_policy_review" ? "Policy scope pending" : option.kind.replaceAll("_", " "))}</span>
                  <span className="block text-slate-400">{option.comparisonDomain.replaceAll("_", " ")} · {option.evidenceState.replaceAll("_", " ")}{option.mappedDistanceKm != null ? ` · ${option.mappedDistanceKm.toFixed(2)} km mapped` : ""}</span>
                </summary>
                {scenarioComparison.optionDiscussionBasis.filter((basis) => basis.optionId === option.id).map((basis) =>
                  <div key={basis.optionId} className="mt-1 text-[10px] text-cyan-100">
                    {basis.status.replaceAll("_", " ")}: {basis.rationale}
                    {basis.basisSourceUrls[0] && <> <a href={basis.basisSourceUrls[0]} target="_blank" rel="noreferrer" className="underline">Direct basis source</a>{basis.basisSourceUrls.length > 1 ? ` +${basis.basisSourceUrls.length - 1}` : ""}</>}
                    {basis.status === "mapped_geometry_question" && basis.basisSourceUrls.length === 0 && <span> Caller sketch supplied in the query.</span>}
                    {basis.status === "mapped_geometry_question" && basis.reviewedPositionBasis.length > 0 &&
                      <div className="mt-0.5 text-amber-100">These cited statements frame questions only. A named counterpart or shared topic does not establish its response, approval, benefit, or a shared project for this alignment.</div>}
                    {(basis.reviewedPositionBasis.length > 0 || basis.governmentRecordBasis.length > 0) && <details className="mt-0.5">
                      <summary>{basis.reviewedPositionBasis.length} reviewed position{basis.reviewedPositionBasis.length === 1 ? "" : "s"} · {basis.governmentRecordBasis.length} government record{basis.governmentRecordBasis.length === 1 ? "" : "s"} in this discussion basis</summary>
                      {basis.reviewedPositionBasis.map((position) => <div key={`${position.countryIso3}:${position.assertionId}`}>
                        <a href={position.sourceUrl} target="_blank" rel="noreferrer" className="underline">{position.countryIso3} {position.assertionId} · p. {position.sourcePage} · review {position.reviewRevision}</a>
                        <span> · {position.role.replaceAll("_", " ")}</span>
                      </div>)}
                      {basis.governmentRecordBasis.map((record) => <div key={record.recordId}>
                        <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">{record.recordId}</a>
                        <span> · {record.role.replaceAll("_", " ")}</span>
                      </div>)}
                    </details>}
                  </div>)}
                {option.concept && <div className="text-[10px] text-amber-100">
                  {option.concept.origin.kind === "reviewed_submitted_assertion" ? <>
                    <a href={option.concept.origin.sourceUrl} target="_blank" rel="noreferrer" className="underline">{option.concept.origin.countryIso3} submitted assertion {option.concept.origin.assertionId}</a>
                    {` · ${option.concept.origin.claimType.replaceAll("_", " ")} · ${option.concept.origin.namedCounterpartIso3 ? `${option.concept.origin.namedCounterpartIso3} named by speaker; partner response and agreement unverified` : "no defined alignment or counterpart-specific agreement"}. Delivery unverified.`}
                  </> : <>
                    <a href={option.concept.origin.sourceUrl} target="_blank" rel="noreferrer" className="underline">{option.concept.origin.parties.join(" + ")} framework · {option.concept.origin.sourceSections.join(", ")}</a>
                    {` · entry into force unverified as of ${option.concept.origin.statusAsOf}; project confirmation and Azerbaijan's agreement not established.`}
                  </>}
                </div>}
                {option.policyReview && <div className="text-[10px] text-slate-300">{option.policyReview.interpretation}</div>}
                {option.kind === "mapped_component_gap_hypothesis" && <div className="text-amber-100">A straight-line screening question between mapped components. The map does not establish need, agreement, feasibility, or benefit.</div>}
                <div className="text-amber-100">{option.objectiveReadiness.map((item) => `${item.objective.replaceAll("_", " ")}: ${item.status.replaceAll("_", " ")}`).join(" · ")}</div>
                {(option.kind === "mapped_network_candidate" || option.kind === "caller_supplied_sketch" || option.kind === "mapped_component_gap_hypothesis") && <div className="text-slate-300">Selected administrative depictions: {option.sourceScreens.administrativeDepictionContacts.status === "not_selected"
                  ? "countries not selected" : option.sourceScreens.administrativeDepictionContacts.countries.map((country) =>
                    `${country.countryIso3} ${country.status === "available" ? `${country.contactCount}${country.possiblyTruncated ? "+" : ""} contacts` : "unavailable"}`).join(" · ")}
                  {` · claim/reference lines: ${option.sourceScreens.claimReferenceLineContacts.status === "available"
                    ? `${option.sourceScreens.claimReferenceLineContacts.contactCount}${option.sourceScreens.claimReferenceLineContacts.possiblyTruncated ? "+" : ""} contacts${option.sourceScreens.claimReferenceLineContacts.categories.length ? ` (${option.sourceScreens.claimReferenceLineContacts.categories.join(", ")})` : ""}` : option.sourceScreens.claimReferenceLineContacts.status.replaceAll("_", " ")}`}</div>}
                {(option.kind === "mapped_network_candidate" || option.kind === "caller_supplied_sketch" || option.kind === "mapped_component_gap_hypothesis") && <div className="text-slate-300">Generalized waterway contacts: {option.sourceScreens.generalizedWaterwayContacts.status === "available"
                  ? `${option.sourceScreens.generalizedWaterwayContacts.contactCount}${option.sourceScreens.generalizedWaterwayContacts.possiblyTruncated ? "+" : ""}`
                  : option.sourceScreens.generalizedWaterwayContacts.status.replaceAll("_", " ")} · lake outlines: {option.sourceScreens.generalizedLakeContacts.status === "available"
                    ? `${option.sourceScreens.generalizedLakeContacts.contactCount}${option.sourceScreens.generalizedLakeContacts.possiblyTruncated ? "+" : ""}`
                    : option.sourceScreens.generalizedLakeContacts.status.replaceAll("_", " ")} · relief model: {option.sourceScreens.reliefModel.status === "available"
                    ? `${option.sourceScreens.reliefModel.sampleCount}/${option.sourceScreens.reliefModel.samples.length} sampled cells available` : option.sourceScreens.reliefModel.status.replaceAll("_", " ")}</div>}
                {option.sourceScreens.reliefModel.samples.length > 0 && <details className="mt-1 text-[10px] text-slate-300">
                  <summary>Modeled relief cells · {option.sourceScreens.reliefModel.samples.length}</summary>
                  {option.sourceScreens.reliefModel.sourceModel && <div>{option.sourceScreens.reliefModel.sourceModel.datasetId} · {option.sourceScreens.reliefModel.sourceModel.gridSpacingArcSeconds} arc-second {option.sourceScreens.reliefModel.sourceModel.surfaceVersion.replaceAll("_", " ")} grid · heights relative to {option.sourceScreens.reliefModel.sourceModel.verticalReference} · model version {option.sourceScreens.reliefModel.sourceModel.modelVersion}.</div>}
                  {option.sourceScreens.reliefModel.samples.map((sample) => <div key={sample.sampleIndex}>
                    Cell {sample.sampleIndex + 1} on sketch segment {sample.sketchSegmentIndex + 1} at {Math.round(sample.segmentFraction * 100)}% · {sample.status === "available" ? `${sample.heightMeters?.toFixed(1)} m` : sample.status.replaceAll("_", " ")} near {sample.requestedPoint.lat.toFixed(4)}, {sample.requestedPoint.lon.toFixed(4)} · <a href={sample.sourceUrl} target="_blank" rel="noreferrer" className="underline">NOAA cell source</a>
                  </div>)}
                  <div>Cells do not describe the ground between samples, a buildable grade, tidal depth, subsurface conditions, or effects. {option.sourceScreens.reliefModel.missingEvidence.join(", ").replaceAll("_", " ")}</div>
                </details>}
                {(option.kind === "mapped_network_candidate" || option.kind === "caller_supplied_sketch" || option.kind === "mapped_component_gap_hypothesis") && <div className="text-amber-100">Environmental impact and community effects remain unassessed; a mapped contact is not a crossing design.</div>}
                {(option.kind === "mapped_network_candidate" || option.kind === "caller_supplied_sketch" || option.kind === "mapped_component_gap_hypothesis") && <div className="text-[10px] text-slate-400">Administrative outlines and claim/reference linework are source depictions, not legal borders, effective control, or permission.</div>}
                {(option.kind === "mapped_network_candidate" || option.kind === "caller_supplied_sketch" || option.kind === "mapped_component_gap_hypothesis") && <div className="text-[10px] text-slate-400">Third-country 1:50m polygon contacts: {option.sourceScreens.thirdCountryPolygonContacts.countries.length
                  ? option.sourceScreens.thirdCountryPolygonContacts.countries.map((country) => `${country.name} (${country.isoA3 ?? country.editorialAdm0A3})`).join(", ")
                  : "none surfaced"}{option.sourceScreens.thirdCountryPolygonContacts.indeterminateFeatureIds.length || option.sourceScreens.thirdCountryPolygonContacts.possiblyTruncated
                    ? " · incomplete review" : ""}. Editorial geometry only; jurisdiction and consent remain unassessed.</div>}
                <details className="mt-1"><summary>Conditions and sources</summary>
                  {(option.kind === "mapped_network_candidate" || option.kind === "caller_supplied_sketch" || option.kind === "mapped_component_gap_hypothesis") && <div className="mt-1 text-slate-400">Bounding-box shortlist: {option.sourceScreens.thirdCountryDepictionCandidates.countries.map((country) => country.name).join(", ") || "none"}; {option.sourceScreens.thirdCountryPolygonContacts.bboxCandidatesRejected.length} rejected by polygon review; {option.sourceScreens.thirdCountryPolygonContacts.indeterminateFeatureIds.length} indeterminate. Editorial line adjacency hints: {option.sourceScreens.thirdCountryEditorialHints.countryIso3s.join(", ") || "none"}. The geometry source is generalized and cannot establish a legal crossing.</div>}
                  {option.kind === "documented_dated_interaction" && <div className="text-slate-300">Dated government or goods evidence only; current operating terms and future project conditions remain separate.</div>}
                  {option.kind === "no_build_policy_review" && <div className="text-slate-300">No new construction assumed. The effects of any customs, transit, or operating-rule change are not yet measured.</div>}
                  {option.concept && <div className="text-slate-300">{option.concept.interpretation} Route screening and environmental or community effects cannot begin until a specific alignment is proposed.</div>}
                  {option.conditionContext.callerRequiredSafeguards.length > 0 && <div className="mt-1">Caller-required safeguards<ul className="list-inside list-disc">{option.conditionContext.callerRequiredSafeguards.map((condition) => <li key={condition}>{condition}</li>)}</ul></div>}
                  {option.conditionContext.bilateralGovernmentContext.map((record) => <div key={record.recordId} className="mt-1">Bilateral government context · {record.parties.join(" + ")} · {record.legalStatus.replaceAll("_", " ")}
                    <ul className="list-inside list-disc">{record.conditions.map((condition) => <li key={condition}>{condition}</li>)}{record.thirdPartyDependencies.map((dependency) => <li key={`${dependency.partyIso3 ?? "unspecified"}:${dependency.role}`}>{dependency.partyIso3 ?? "Unspecified third party"}: {dependency.role}</li>)}</ul>
                    <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">Government source</a>
                  </div>)}
                  {option.conditionContext.multilateralGovernmentContext.map((record) => <div key={record.recordId} className="mt-1">Joint government context · {record.parties.join(" + ")} · {record.legalStatus.replaceAll("_", " ")}
                    {record.reportedMeasures.map((measure) => <div key={measure.metric} className="text-amber-100">Government reported {measure.qualifier.replaceAll("_", " ")} {new Intl.NumberFormat().format(measure.value)} {measure.unit} · {measure.metric.replaceAll("_", " ")}; independent verification pending.</div>)}
                    <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">Joint source</a>
                  </div>)}
                  {option.conditionContext.contingentFrameworks.map((record) => <div key={record.recordId} className="mt-1">Only if this route uses the {record.parties.join(" + ")} framework · {record.legalStatus.replaceAll("_", " ")} as of {record.statusAsOf}
                    <ul className="list-inside list-disc">{record.conditions.map((condition) => <li key={condition}>{condition}</li>)}{record.thirdPartyDependencies.map((dependency) => <li key={`${dependency.partyIso3 ?? "unspecified"}:${dependency.role}`}>{dependency.partyIso3 ?? "Unspecified third party"}: {dependency.role}</li>)}</ul>
                    {record.plannedJointVenture && <div className="text-amber-100">Intended company shares: {record.plannedJointVenture.initialOwnership.map((share) => `${share.stakeholder} ${share.percent}%`).join(" · ")}; Armenia's share would become {record.plannedJointVenture.conditionalExtension.armeniaOwnershipPercentOnExtension}% only after a mutually agreed extension of the initial {record.plannedJointVenture.conditionalExtension.initialTermYears}-year term. {record.plannedJointVenture.interpretationLimit}</div>}
                    <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">Framework source</a>
                  </div>)}
                  {option.conditionContext.callerAdditionalConditions.length > 0 && <div className="mt-1">Additional caller conditions<ul className="list-inside list-disc">{option.conditionContext.callerAdditionalConditions.map((condition) => <li key={condition}>{condition}</li>)}</ul></div>}
                  {option.sourceUrls.map((sourceUrl, index) => <div key={`${index}:${sourceUrl}`}><a href={sourceUrl} target="_blank" rel="noreferrer" className="underline">Source {index + 1} · {new URL(sourceUrl).hostname}</a></div>)}
                </details>
                <details className="mt-1"><summary>Missing evidence ({option.missingEvidence.length})</summary><ul className="list-inside list-disc">{option.missingEvidence.slice(0, 12).map((gap, index) => <li key={`${index}:${gap}`}>{gap.replaceAll("_", " ")}</li>)}</ul></details>
              </details>)}
              <details><summary>Who and what needs review ({scenarioComparison.reviewActorGraph.links.length} links)</summary>
                <p className="mt-1 text-[10px] text-slate-400">{scenarioComparison.reviewActorGraph.interpretation}</p>
                {scenarioComparison.options.filter((option) => option.comparisonDomain !== "dated_observation").map((option) => {
                  const links = scenarioComparison.reviewActorGraph.links.filter((entry) => entry.optionId === option.id);
                  const requests = scenarioComparison.optionEvidenceLedgers.find((ledger) => ledger.optionId === option.id)
                    ?.nextEvidenceRequests ?? [];
                  return <details key={option.id} className="mt-1 rounded border border-white/15 p-1 text-[10px] text-slate-300">
                    <summary>{option.id.replaceAll("_", " ")} · {links.length} review links</summary>
                    {links.map((entry, index) => <div key={`${entry.actorKey}:${entry.relation}:${index}`} className="mt-1">
                      <strong>{entry.actorLabel}</strong> · {entry.relation.replaceAll("_", " ")} · {entry.reviewStatus.replaceAll("_", " ")}.
                      <span> {entry.inferenceLimit}</span>
                      {entry.sourceUrls[0] && <> <a href={entry.sourceUrls[0]} target="_blank" rel="noreferrer" className="underline">Source</a></>}
                      {entry.generalStatementCoverage && <div className="ml-2 text-slate-400">
                        General UN statement coverage: {entry.generalStatementCoverage.status === "reviewed_selective_submitted_brief"
                          ? entry.generalStatementCoverage.reviewedAssertionIds.length + " selected reviewed assertions"
                          : entry.generalStatementCoverage.status === "official_page_only_no_reviewed_brief" ? "official page only; selected brief pending" : "official page unavailable"}.
                        {" "}Agreement on this option not established; a speaker's one-sided proposal remains in the option origin.
                        {entry.generalStatementCoverage.sourceLanguage && <> Source language: {entry.generalStatementCoverage.sourceLanguage}; translation and delivery review remain separate.</>}
                        {entry.generalStatementCoverage.reviewedBriefSourceUrl && <> <a href={entry.generalStatementCoverage.reviewedBriefSourceUrl} target="_blank" rel="noreferrer" className="underline">Reviewed source</a></>}
                        {!entry.generalStatementCoverage.reviewedBriefSourceUrl && entry.generalStatementCoverage.officialPageUrl && <> <a href={entry.generalStatementCoverage.officialPageUrl} target="_blank" rel="noreferrer" className="underline">Official page</a></>}
                      </div>}
                      {entry.relevantEvidenceRequestIds.length > 0 && <details className="ml-2">
                        <summary>{entry.relevantEvidenceRequestIds.length} linked evidence request{entry.relevantEvidenceRequestIds.length === 1 ? "" : "s"}</summary>
                        <ul className="list-inside list-disc">{entry.relevantEvidenceRequestIds.map((id) => {
                          const request = requests.find((candidate) => candidate.id === id);
                          return request ? <li key={id}>{request.requestedEvidence}</li> : null;
                        })}</ul>
                      </details>}
                    </div>)}
                  </details>;
                })}
              </details>
              <details><summary>Permissions, affected parties, and evidence needed</summary>
                {scenarioComparison.optionEvidenceLedgers.map((ledger) => <div key={ledger.optionId} className="mt-2 rounded border border-white/15 p-1.5">
                  <div className="font-medium text-white">{ledger.optionId.replaceAll("_", " ")}</div>
                  <p className="text-amber-100">{ledger.decisionReadiness === "observation_not_a_proposal"
                    ? "This is dated interaction evidence, not a proposal. Current gains and losses remain unmeasured."
                    : "Distributional gains and losses are not measured; this option cannot be ranked or approved from these sources."}</p>
                  {ledger.documentedLegalStages.map((stage) => <div key={stage.sourceRecordId} className="mt-1 text-[10px] text-slate-300">
                    <a href={stage.sourceUrl} target="_blank" rel="noreferrer" className="underline">{stage.parties.join(" + ")} · {stage.legalStatus.replaceAll("_", " ")} · as of {stage.statusAsOf}</a>
                    <span> · {stage.applicability === "source_framework_for_this_concept" ? "source framework for this concept" : stage.applicability === "only_if_option_uses_framework" ? "only if this framework is used" : "dated context"} · {ledger.optionId === "humanitarian_cooperation_review" ? "separate humanitarian modalities not established" : "route permission not established"}</span>
                  </div>)}
                  {ledger.gates.map((gate) => <div key={gate.id} className="mt-1 text-[10px] text-slate-300">
                    {gate.id.replaceAll("_", " ")}: {gate.status.replaceAll("_", " ")} · {gate.evidenceNeeded}
                    {gate.contextSourceUrls[0] && <> <a href={gate.contextSourceUrls[0]} target="_blank" rel="noreferrer" className="underline">Dated context</a></>}
                  </div>)}
                  {ledger.objectiveEvidencePlans.length > 0 && <details className="mt-1 text-[10px] text-slate-300">
                    <summary>Measurements needed for selected objectives ({ledger.objectiveEvidencePlans.length})</summary>
                    {ledger.objectiveEvidencePlans.map((plan) => <div key={plan.objective} className="mt-1">
                      <strong>{plan.objective.replaceAll("_", " ")}</strong> · {plan.readinessStatus.replaceAll("_", " ")} · {plan.measurementQuestion}
                      <span> Ask: {plan.actorToConsult.replaceAll("_", " ")}. Current citations are context, not an option outcome measurement; frontier eligibility is not established.</span>
                      {plan.contextSourceUrls[0] && <> <a href={plan.contextSourceUrls[0]} target="_blank" rel="noreferrer" className="underline">Source context</a></>}
                    </div>)}
                  </details>}
                  <p className="mt-1 text-[10px] text-slate-300">Selected states: {ledger.selectedPartyDistribution.map((party) => party.countryIso3).join(" + ")} · gains, losses, and community effects unassessed.</p>
                  {ledger.selectedPartyDistribution.map((party) => <div key={party.countryIso3} className="text-[10px] text-slate-400">
                      {party.countryIso3}: {party.optionPositionStatus.replaceAll("_", " ")} · {party.reviewedPositionAssertionIds.length} option-related submitted assertion(s) · {party.issueContextAssertionIds.length} general issue assertion(s). {party.optionPositionStatus === "not_applicable_dated_observation" ? "This is an observation, not a proposal." : party.optionPositionStatus === "government_joint_project_announcement_permissions_unverified" ? "Both governments announced a project; construction and operating permissions remain unverified." : "No option-specific consent established."}
                    <div>Observed {party.observedGoodsExportsToCounterpart.year} merchandise exports to {party.observedGoodsExportsToCounterpart.counterpartIso3}: {party.observedGoodsExportsToCounterpart.status === "available" && party.observedGoodsExportsToCounterpart.primaryValueUsd != null
                      ? `${new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(party.observedGoodsExportsToCounterpart.primaryValueUsd)} (${party.observedGoodsExportsToCounterpart.isReported ? "reported" : party.observedGoodsExportsToCounterpart.isAggregate ? "provider aggregate" : "reporting basis unverified"})`
                      : party.observedGoodsExportsToCounterpart.status.replaceAll("_", " ")} · baseline context, not an option benefit.
                      {party.observedGoodsExportsToCounterpart.sourceUrl && <> <a href={party.observedGoodsExportsToCounterpart.sourceUrl} target="_blank" rel="noreferrer" className="underline">UN Comtrade source</a></>}
                    </div>
                  </div>)}
                  {ledger.potentialThirdPartyOutcomeGaps.length > 0 && <details className="mt-1 text-[10px] text-slate-300">
                    <summary>Possible third-party outcome gaps ({ledger.potentialThirdPartyOutcomeGaps.length})</summary>
                    {ledger.potentialThirdPartyOutcomeGaps.map((party) => <div key={party.countryIso3} className="mt-1">
                      {party.countryIso3}: {party.basis.map((basis) => basis.replaceAll("_", " ")).join(" + ")}.
                      Its option-specific position, possible gain or loss, and public or community effects require review.
                      {party.basisSourceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="ml-1 underline">Basis {index + 1}</a>)}
                    </div>)}
                    <p className="mt-1">A framework role or map contact does not confirm an effect, permission, or benefit.</p>
                  </details>}
                  {ledger.datedOperatingReports.map((report) => <p key={report.id} className="mt-1 text-[10px] text-slate-300">
                    Dated freight event: <a href={report.sourceUrl} target="_blank" rel="noreferrer" className="underline">{report.reportDate} · {report.reportedQuantity.value} {report.reportedQuantity.unit} of {report.commodity}</a>. {report.interpretationLimit}
                    {report.corroboratingOperationalSources.map((source) => <span key={source.sourceUrl}> <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="underline">{source.sourcePublisher}: {source.reportedQuantity.value} {source.reportedQuantity.unit}</a>.</span>)}
                  </p>)}
                  {ledger.datedProjectMilestones.length > 0 && <details className="mt-1 text-[10px] text-slate-300">
                    <summary>Dated sources for this project ({ledger.datedProjectMilestones.length})</summary>
                    {ledger.datedProjectMilestones.map((milestone) => <div key={milestone.id} className="mt-1">
                      <a href={milestone.sourceUrl} target="_blank" rel="noreferrer" className="underline">{milestone.sourceDate} · {milestone.projectCountryIso3}–{milestone.namedCounterpartIso3} project · {milestone.sourcePublisher}</a>: {milestone.sourceFinding}
                      <div className="text-cyan-100">Review question: {milestone.reviewQuestion}</div>
                      <div>{milestone.interpretationLimit}</div>
                    </div>)}
                  </details>}
                  {ledger.institutionalHumanitarianContext.length > 0 && <details className="mt-1 text-[10px] text-slate-300">
                    <summary>Humanitarian institutions and national programs</summary>
                    {ledger.institutionalHumanitarianContext.map((record) => <div key={record.id} className="mt-1">
                      <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">{record.publicationDate} · {record.publisher} · {record.sourceSection}</a>: {record.summary} {record.limits}
                    </div>)}
                  </details>}
                  {ledger.affectedFamilyContext.length > 0 && <details className="mt-1 text-[10px] text-slate-300">
                    <summary>Affected families · reported needs and consultation gaps</summary>
                    {ledger.affectedFamilyContext.map((record) => <div key={record.id} className="mt-1">
                      <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">{record.countryIso3} · ICRC {record.publicationDate}</a>: {record.boundedPerspective}
                      <div>{record.possibleNeedForOptionReview} {record.representativeness} Option-specific consent not obtained.</div>
                    </div>)}
                  </details>}
                  {ledger.possibleThirdCountryDepictionContacts.length > 0 && <p className="mt-1 text-[10px] text-slate-300">Possible third-country map contacts: {ledger.possibleThirdCountryDepictionContacts.map((country) => country.name).join(", ")}. Geometry does not establish jurisdiction or effects.</p>}
                  {(ledger.thirdPartyContextReview.conditionalFrameworkParties.length > 0 ||
                    ledger.thirdPartyContextReview.regionalStatementPerspectives.length > 0 ||
                    ledger.thirdPartyContextReview.reportedTransitDependencies.length > 0 ||
                    ledger.thirdPartyContextReview.operatorContextSources.length > 0 ||
                    ledger.thirdPartyContextReview.geometryContactPositionCoverage.length > 0) &&
                    <details className="mt-1 text-[10px] text-slate-300"><summary>Third-party context and conditional roles</summary>
                      {ledger.thirdPartyContextReview.conditionalFrameworkParties.map((party) => <div key={`${party.partyIso3}:${party.sourceRecordId}`} className="mt-1">
                        {party.partyIso3}: <a href={party.sourceUrl} target="_blank" rel="noreferrer" className="underline">conditional framework {party.sourceRecordId}</a> · {party.applicability === "source_framework_for_this_concept" ? "source framework for this concept" : "only if this option uses it"}; consent or veto not determined.
                      </div>)}
                      {ledger.thirdPartyContextReview.regionalStatementPerspectives.map((perspective) => <div key={perspective.countryIso3} className="mt-1">
                        {perspective.countryIso3}: regional statement context ({perspective.assertionIds.length} selected assertions) · effect on this option unassessed.
                        {perspective.sourceUrls[0] && <> <a href={perspective.sourceUrls[0]} target="_blank" rel="noreferrer" className="underline">Submitted source</a></>}
                      </div>)}
                      {ledger.thirdPartyContextReview.reportedTransitDependencies.map((dependency) => <div key={`${dependency.countryIso3}:${dependency.originAssertionId}`} className="mt-1">
                        {dependency.countryIso3}: <a href={dependency.sourceUrl} target="_blank" rel="noreferrer" className="underline">{dependency.originCountryIso3} submitted transit report</a> names this country. Current operation, terms, and consent remain unverified.
                      </div>)}
                      {ledger.thirdPartyContextReview.operatorContextSources.map((record) => <div key={record.id} className="mt-1">
                        {record.countryIso3}: <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">{record.sourcePublisher} · {record.sourceDate}</a> · {record.finding} {record.interpretationLimit}
                      </div>)}
                      {ledger.thirdPartyContextReview.geometryContactPositionCoverage.map((country) => <div key={`${country.editorialAdm0A3}:${country.name}`} className="mt-1">
                        Possible map contact {country.name}: {country.status.replaceAll("_", " ")} · submitted PDF {country.submittedPdfLinkStatus.replaceAll("_", " ")}. Option-specific position and effect unassessed.
                        {country.officialPageUrl && <> <a href={country.officialPageUrl} target="_blank" rel="noreferrer" className="underline">Official page</a></>}
                        {country.reviewedBriefSourceUrl && <> <a href={country.reviewedBriefSourceUrl} target="_blank" rel="noreferrer" className="underline">Selected brief source</a></>}
                        {country.nextSourceReviewReason && <div>Next source review{country.nextSourceReviewStage ? ` (${country.nextSourceReviewStage.replaceAll("_", " ")})` : ""}: {country.nextSourceReviewReason}</div>}
                        {country.sourceReviewUrls.filter((url) => url !== country.officialPageUrl && url !== country.reviewedBriefSourceUrl)
                          .map((url, index) => <a key={`${country.editorialAdm0A3}:source:${index}`} href={url} target="_blank" rel="noreferrer" className="ml-1 underline">Review source {index + 1}</a>)}
                      </div>)}
                      <p className="mt-1">Map-contact review: {ledger.thirdPartyContextReview.geometryContactStatus.replaceAll("_", " ")}.</p>
                      <p className="mt-1">{ledger.thirdPartyContextReview.interpretation}</p>
                    </details>}
                  {ledger.naturalSystemScreen.status !== "not_applicable_no_route" && <p className="mt-1 text-[10px] text-slate-300">
                    Natural screen: {ledger.naturalSystemScreen.generalizedWaterwayContactCount == null
                      ? "generalized waterway data unavailable"
                      : `${ledger.naturalSystemScreen.generalizedWaterwayContactCount}${ledger.naturalSystemScreen.waterwayContactsPossiblyTruncated ? "+" : ""} generalized waterway contacts`}
                    {" · "}{ledger.naturalSystemScreen.generalizedLakeContactCount == null
                      ? "lake outline data unavailable"
                      : `${ledger.naturalSystemScreen.generalizedLakeContactCount}${ledger.naturalSystemScreen.lakeContactsPossiblyTruncated ? "+" : ""} generalized lake contacts`}
                    {" · "}{ledger.naturalSystemScreen.reliefSampleCount == null
                      ? "relief model data unavailable"
                      : `${ledger.naturalSystemScreen.reliefSampleCount} model-height samples`}. Environmental effects remain unassessed. {ledger.naturalSystemScreen.sourceUrls[0] && <a href={ledger.naturalSystemScreen.sourceUrls[0]} target="_blank" rel="noreferrer" className="underline">Screening source</a>}
                  </p>}
                  {ledger.naturalSystemScreen.status !== "not_applicable_no_route" && <details className="mt-1 text-[10px] text-slate-300">
                    <summary>Mapped forest and protected-area depictions · {ledger.naturalSystemScreen.terrestrialDepictions.status === "available"
                      ? `${ledger.naturalSystemScreen.terrestrialDepictions.contactCount ?? 0}${ledger.naturalSystemScreen.terrestrialDepictions.possiblyTruncated ? "+" : ""} approximate contacts`
                      : ledger.naturalSystemScreen.terrestrialDepictions.status.replaceAll("_", " ")}</summary>
                    {ledger.naturalSystemScreen.terrestrialDepictions.contacts.map((contact, index) => <div key={`${contact.featureId}:${contact.sketchSegmentIndex}:${index}`} className="mt-1">
                      <a href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{contact.featureName ?? contact.featureKind.replaceAll("_", " ")} · {contact.geometryRole.replaceAll("_", " ")} {contact.featureId}</a>
                      {" · "}{contact.relation.replaceAll("_", " ")} on alignment segment {contact.sketchSegmentIndex + 1} near {contact.position.lat.toFixed(4)}, {contact.position.lon.toFixed(4)}.
                    </div>)}
                    <p className="mt-1 text-amber-100">OSM depictions do not verify current land cover, legal designation, ecological impact, or permission. Missing coverage: {ledger.naturalSystemScreen.terrestrialDepictions.missingEvidence.join(", ").replaceAll("_", " ") || "none reported"}.</p>
                    {ledger.naturalSystemScreen.terrestrialDepictions.sourceUrls[0] && <a href={ledger.naturalSystemScreen.terrestrialDepictions.sourceUrls[0]} target="_blank" rel="noreferrer" className="underline">Source</a>}
                  </details>}
                  {ledger.naturalSystemScreen.generalizedWaterwayContacts.length > 0 && <details className="mt-1 text-[10px] text-slate-300">
                    <summary>Named generalized waterway contacts ({ledger.naturalSystemScreen.generalizedWaterwayContacts.length}{ledger.naturalSystemScreen.waterwayContactsPossiblyTruncated ? "+" : ""})</summary>
                    {ledger.naturalSystemScreen.generalizedWaterwayContacts.map((contact, index) => <div key={contact.lineId + ":" + contact.alignmentSegmentIndex + ":" + index} className="mt-1">
                      <a href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{contact.label} · {contact.featureKind.replaceAll("_", " ")}</a>
                      {" · "}{contact.contactKind} contact on alignment segment {contact.alignmentSegmentIndex + 1}
                      {" near "}{contact.position.lat.toFixed(4)}, {contact.position.lon.toFixed(4)}.
                    </div>)}
                    <p className="mt-1 text-amber-100">These generalized line contacts do not establish a present water crossing, water right, navigability, flood risk, or ecological effect.</p>
                  </details>}
                  {ledger.naturalSystemScreen.generalizedLakeContacts.length > 0 && <details className="mt-1 text-[10px] text-slate-300">
                    <summary>Named lake outline contacts ({ledger.naturalSystemScreen.generalizedLakeContacts.length}{ledger.naturalSystemScreen.lakeContactsPossiblyTruncated ? "+" : ""})</summary>
                    {ledger.naturalSystemScreen.generalizedLakeContacts.map((contact, index) => <div key={`${contact.lakeFeatureId}:${contact.alignmentSegmentIndex}:${index}`} className="mt-1">
                      <a href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{contact.label} · feature {contact.lakeFeatureId}</a>
                      {" · "}{contact.contactKind.replaceAll("_", " ")} on alignment segment {contact.alignmentSegmentIndex + 1}
                      {" near "}{contact.position.lat.toFixed(4)}, {contact.position.lon.toFixed(4)}.
                    </div>)}
                    <p className="mt-1 text-amber-100">These generalized polygons do not establish current shorelines, water conditions, ecological effects, crossing feasibility, or permission.</p>
                  </details>}
                  {ledger.naturalSystemScreen.reviewedStatementWaterwayLinks.length > 0 && <details className="mt-1 text-[10px] text-slate-300">
                    <summary>Reviewed UN statements naming contacted river systems ({ledger.naturalSystemScreen.reviewedStatementWaterwayLinks.length})</summary>
                    {ledger.naturalSystemScreen.reviewedStatementWaterwayLinks.map((link) => <div key={`${link.lineId}:${link.countryIso3}:${link.assertionId}`} className="mt-1">
                      <a href={link.statementSourceUrl} target="_blank" rel="noreferrer" className="underline">{link.countryIso3} statement {link.assertionId}</a>
                      {" shares a name family with "}<a href={link.lineSourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{link.lineLabel}</a>. {link.interpretation}
                    </div>)}
                  </details>}
                  {ledger.naturalSystemScreen.reviewedStatementLakeLinks.length > 0 && <details className="mt-1 text-[10px] text-slate-300">
                    <summary>Reviewed UN statements naming contacted lakes ({ledger.naturalSystemScreen.reviewedStatementLakeLinks.length})</summary>
                    {ledger.naturalSystemScreen.reviewedStatementLakeLinks.map((link) => <div key={`${link.lakeFeatureId}:${link.countryIso3}:${link.assertionId}`} className="mt-1">
                      <a href={link.statementSourceUrl} target="_blank" rel="noreferrer" className="underline">{link.countryIso3} statement {link.assertionId}</a>
                      {" names "}<a href={link.lakeSourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{link.lakeLabel}</a>. {link.interpretation}
                    </div>)}
                  </details>}
                  {ledger.infrastructureScreen.status !== "not_applicable_no_route" && <details className="mt-1 text-[10px] text-slate-300">
                    <summary>Mapped infrastructure evidence · {ledger.infrastructureScreen.status === "mapped_topology_candidate"
                      ? `${ledger.infrastructureScreen.mappedWays.length}${ledger.infrastructureScreen.possiblyTruncated ? "+" : ""} distinct OSM ways in ${ledger.infrastructureScreen.mappedSegmentCount ?? 0} route segments`
                      : ledger.infrastructureScreen.status === "sketch_way_contacts"
                        ? `${ledger.infrastructureScreen.sketchContacts.length}${ledger.infrastructureScreen.possiblyTruncated ? "+" : ""} approximate sketch contacts`
                        : ledger.infrastructureScreen.status.replaceAll("_", " ")}</summary>
                    {ledger.infrastructureScreen.sourceSnapshotAt && <p>OSM snapshot {ledger.infrastructureScreen.sourceSnapshotAt}; retrieved {ledger.infrastructureScreen.fetchedAt ?? "unknown"}.</p>}
                    {ledger.infrastructureScreen.mappedWays.map((way) => <div key={way.edgeId} className="mt-1">
                      <a href={way.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{way.networkKind} way {way.edgeId}</a> · mapped route topology; operation, capacity, ownership, and permission unverified.
                    </div>)}
                    {ledger.infrastructureScreen.networkTransitionCount > 0 && <details className="mt-1 text-amber-100">
                      <summary>{ledger.infrastructureScreen.networkTransitionCount} mapped network changes need facility review{ledger.infrastructureScreen.networkTransitionsOmitted ? " · some omitted" : ""}</summary>
                      {ledger.infrastructureScreen.networkTransitions.map((transition, index) => <div key={`${transition.nodeRef}:${transition.alignmentSegmentIndex}:${index}`} className="mt-1">
                        Segments {transition.alignmentSegmentIndex}–{transition.alignmentSegmentIndex + 1} near {transition.position.lat.toFixed(4)}, {transition.position.lon.toFixed(4)}:
                        {" "}<a href={transition.fromSourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{transition.fromKind}</a>
                        {" → "}<a href={transition.toSourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{transition.toKind}</a>.
                        Shared OSM node {transition.nodeRef}; actual facility, compatibility, rights, direction, and capacity unverified.
                      </div>)}
                    </details>}
                    {ledger.infrastructureScreen.pipelineTagReview.status !== "not_applicable" && <details className="mt-1 text-amber-100">
                      <summary>Pipeline product tags · {ledger.infrastructureScreen.pipelineTagReview.status.replaceAll("_", " ")}</summary>
                      <p>{ledger.infrastructureScreen.pipelineTagReview.wayCount} mapped pipeline way{ledger.infrastructureScreen.pipelineTagReview.wayCount === 1 ? "" : "s"}; {ledger.infrastructureScreen.pipelineTagReview.untaggedWayCount} without a substance tag. Product compatibility and flow direction are unverified.</p>
                      {ledger.infrastructureScreen.pipelineTagReview.ways.map((way) => <div key={way.edgeId}>
                        <a href={way.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{way.edgeId}</a> · {way.substanceTag ?? "substance untagged"}
                      </div>)}
                      {ledger.infrastructureScreen.pipelineTagReview.waysOmitted && <p>Additional pipeline ways omitted from this panel view.</p>}
                    </details>}
                    {ledger.infrastructureScreen.sketchContacts.map((contact, index) => <div key={`${contact.edgeId}:${contact.sketchSegmentIndex}:${index}`} className="mt-1">
                      Sketch segment {contact.sketchSegmentIndex + 1} · {contact.contactKind} near {contact.position.lat.toFixed(4)}, {contact.position.lon.toFixed(4)} · <a href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{contact.networkKind} way {contact.edgeId}</a> · edited {contact.sourceEditedAt ?? "unknown"}.
                    </div>)}
                    <p className="mt-1 text-amber-100">A mapped way or sketch contact does not establish an operating connection, available capacity, transfer compatibility, ownership rights, or route permission.</p>
                  </details>}
                  {(ledger.naturalSystemScreen.designatedWetlandContext.length > 0 || ledger.naturalSystemScreen.liveRamsarReview) && <details className="mt-1 text-[10px] text-slate-300">
                    <summary>Designated wetlands · {ledger.naturalSystemScreen.liveRamsarReview?.status === "available"
                      ? `${ledger.naturalSystemScreen.liveRamsarReview.sites?.filter((site) => site.relation === "intersects_published_depiction").length ?? 0} live published contacts${ledger.naturalSystemScreen.liveRamsarReview.possiblyTruncated ? " · incomplete" : ""}`
                      : ledger.naturalSystemScreen.designatedWetlandRouteRelation === "partial_published_boundary_screen"
                        ? "partial pilot boundary screen" : "no route contact finding"}</summary>
                    <p className="mt-1 text-amber-100">Pinned pilot geometry coverage: {ledger.naturalSystemScreen.designatedWetlandBoundaryScope === "five_armenia_azerbaijan_pilot_sites_only"
                      ? "five Armenia–Azerbaijan pilot sites only" : "not screened"}. {ledger.naturalSystemScreen.selectedCountryWetlandBoundaryGaps.length > 0
                        ? `Selected countries without complete pilot site-boundary coverage: ${ledger.naturalSystemScreen.selectedCountryWetlandBoundaryGaps.join(", ")}.` : ""} The separate live area read below has its own coverage and truncation status; neither source establishes that unreturned sites or other wetlands are absent.</p>
                    {ledger.naturalSystemScreen.designatedWetlandContext.map((record) => <div key={record.countryIso3} className="mt-1">
                      <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">{record.countryIso3} Ramsar summary</a> lists {record.listedSiteCount} sites · {record.geometryStatus.replaceAll("_", " ")}. {record.interpretationLimit}
                    </div>)}
                    {ledger.naturalSystemScreen.designatedWetlandSites.map((site) => <div key={site.siteNumber} className="mt-1">
                      {site.countryIso3} #{site.siteNumber} {site.name}: {site.relation.replaceAll("_", " ")}
                      {site.alignmentSegmentIndices.length ? ` on alignment segments ${site.alignmentSegmentIndices.map((index) => index + 1).join(", ")}` : ""}.
                    </div>)}
                    {ledger.naturalSystemScreen.designatedWetlandSites.length > 0 && <p>These are cartographic contacts only. Agh-Ghol has no boundary in the acquired source response; current site rules and impacts require separate review.</p>}
                    {ledger.naturalSystemScreen.liveRamsarReview && <div className="mt-1 border-t border-white/10 pt-1">
                      Live RSIS area review: {ledger.naturalSystemScreen.liveRamsarReview.status === "available"
                        ? `${ledger.naturalSystemScreen.liveRamsarReview.coverage?.selectedFeatures ?? 0} returned site depictions${ledger.naturalSystemScreen.liveRamsarReview.possiblyTruncated ? " (incomplete)" : ""}`
                        : `unavailable (${ledger.naturalSystemScreen.liveRamsarReview.errorCode ?? "source error"})`}.
                      {(ledger.naturalSystemScreen.liveRamsarReview.sites ?? []).filter((site) => site.relation !== "no_contact_in_returned_depiction").map((site) => <div key={site.siteNumber}>
                        <a href={site.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{site.name} (#{site.siteNumber})</a> · {site.relation.replaceAll("_", " ")}{site.alignmentSegmentIndices.length ? ` · sketch segments ${site.alignmentSegmentIndices.map((index) => index + 1).join(", ")}` : ""}
                      </div>)}
                      <p>Published geometry contacts identify sites for review; current boundaries, ecological effects, management rules, and permissions remain unverified.</p>
                    </div>}
                  </details>}
                  <ul className="mt-1 list-inside list-disc text-[10px] text-cyan-100">{ledger.nextEvidenceRequests.map((request) => <li key={request.id}>
                    {request.requestedEvidence} <span className="text-slate-300">Ask: {request.actorToConsult.replaceAll("_", " ")} · needed, not obtained.</span>
                    {request.contextSourceUrls[0] && <> <a href={request.contextSourceUrls[0]} target="_blank" rel="noreferrer" className="underline">Trigger context</a></>}
                  </li>)}</ul>
                </div>)}
              </details>
              {scenarioComparison.countryPair.thirdPartyPositions.length > 0 && <details><summary>Third-party stated perspectives ({scenarioComparison.countryPair.thirdPartyPositions.length})</summary>
                {scenarioComparison.countryPair.thirdPartyPositions.map((position) => <div key={position.countryIso3} className="mt-1">
                  <div>{position.countryIso3} · {position.speaker} · {position.speechDate}</div>
                  <div className="text-[10px] text-slate-400">{position.speakerAttributionSource === "official_page_only" ? "Speaker named on official page only" : "Speaker named in PDF and official page"} · recording match pending</div>
                  {position.assertions.map((assertion) => <div key={assertion.id}><a href={assertion.sourceUrl} target="_blank" rel="noreferrer" className="underline">{assertion.text}</a></div>)}
                </div>)}
                <p>These submitted statements do not establish consent, a transit right, or a veto.</p>
              </details>}
              <details><summary>Comparison-wide unresolved evidence ({scenarioComparison.unresolved.length})</summary>
                <ul className="list-inside list-disc">{scenarioComparison.unresolved.slice(0, 20).map((gap, index) => <li key={`${index}:${gap}`}>{gap.replaceAll("_", " ")}</li>)}</ul>
              </details>
              <p className="text-amber-100">No future route option has established legal eligibility, operating capacity, community consent, or construction feasibility.</p>
            </div>}
          </details>}
          {reviewPacket && <div className="mt-1 text-slate-300">
            Assessed for {reviewPacket.query.route.evaluatedAt} · collected {reviewPacket.collectedAt} · route {reviewPacket.route.status}
            {reviewPacket.route.status === "available" ? ` · ${reviewPacket.route.candidates?.length ?? 0} mapped options` : ""}
            {reviewPacket.countries.length > 0 ? ` · country depictions: ${reviewPacket.countries.map((country) => `${country.countryIso3} ${country.status}`).join(", ")}` : " · no country depictions selected"}.
            {reviewPacket.route.status === "available" && (reviewPacket.route.candidates?.length ?? 0) > 0 && <details className="mt-1 text-[10px]">
              <summary>Mapped options · wetland and terrestrial depiction screens</summary>
              {reviewPacket.route.candidates?.map((candidate) => <div key={`${candidate.candidateId}:wetlands`} className="mt-1">
                Option {candidate.optionIndex}: live RSIS {candidate.ramsarAreaReview.status === "available"
                  ? `${candidate.ramsarAreaReview.sites?.filter((site) => site.relation === "intersects_published_depiction").length ?? 0} published contacts${candidate.ramsarAreaReview.possiblyTruncated ? " (incomplete)" : ""}`
                  : `unavailable (${candidate.ramsarAreaReview.errorCode ?? "source error"})`}; pilot contacts {candidate.designatedWetlands.sites
                  .filter((site) => site.relation === "intersects_published_depiction")
                  .map((site) => `#${site.siteNumber}`).join(", ") || "none in four available pilot depictions"}.
                <div>Mapped forest and protected-area depictions: {candidate.terrestrialDepictions.status === "available"
                  ? `${candidate.terrestrialDepictions.contacts?.length ?? 0}${candidate.terrestrialDepictions.possiblyTruncated ? "+" : ""} approximate contacts`
                  : candidate.terrestrialDepictions.status.replaceAll("_", " ")}.</div>
                {candidate.terrestrialDepictions.status === "available" && (candidate.terrestrialDepictions.contacts?.length ?? 0) > 0 && <details>
                  <summary>OSM terrestrial contacts</summary>
                  {(candidate.terrestrialDepictions.contacts ?? []).map((contact, index) => <div key={`${contact.featureId}:${contact.sketchSegmentIndex}:${index}`}>
                    <a href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{contact.featureName ?? contact.featureKind.replaceAll("_", " ")}</a>
                    {" · "}{contact.geometryRole.replaceAll("_", " ")} · {contact.relation.replaceAll("_", " ")} · mapped segment {contact.sketchSegmentIndex + 1}.
                  </div>)}
                </details>}
                {(candidate.ramsarAreaReview.sites ?? []).filter((site) => site.relation !== "no_contact_in_returned_depiction").map((site) => <div key={site.siteNumber}>
                  <a href={site.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{site.name} (#{site.siteNumber})</a> · {site.relation.replaceAll("_", " ")}{site.alignmentSegmentIndices.length ? ` · mapped segments ${site.alignmentSegmentIndices.map((index) => index + 1).join(", ")}` : ""}
                </div>)}
                <div>Pilot Agh-Ghol #1075 remains unknown because its boundary was absent from that snapshot. Published geometry contacts do not establish ecological impact or permission.</div>
              </div>)}
            </details>}
            {reviewPacket.route.lakeReview?.status === "available" && <details className="mt-1 text-[10px]">
              <summary>Mapped option lake-outline contacts · {reviewPacket.route.lakeReview.contacts?.length ?? 0}{reviewPacket.route.lakeReview.possiblyTruncated ? "+" : ""}</summary>
              {(reviewPacket.route.lakeReview.contacts ?? []).map((contact, index) => <div key={`${contact.candidateId}:${contact.lakeFeatureId}:${contact.segmentIndex}:${index}`}>
                Option {reviewPacket.route.candidates?.find((candidate) => candidate.candidateId === contact.candidateId)?.optionIndex ?? "unknown"} · segment {contact.segmentIndex + 1} · {contact.contactKind.replaceAll("_", " ")} · <a href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{contact.lakeLabel}</a>. Generalized depiction; current shoreline and effects unverified.
              </div>)}
            </details>}
            {reviewPacket.proposedCorridor.status !== "not_requested" && <details className="mt-1"><summary>Attached proposed sketch: {reviewPacket.proposedCorridor.status.replaceAll("_", " ")}</summary>
              {reviewPacket.proposedCorridor.screen && <div>
                {reviewPacket.proposedCorridor.screen.query.vertices.length} caller-supplied points · {reviewPacket.proposedCorridor.screen.query.intendedUse} · boundary line {reviewPacket.proposedCorridor.screen.boundaryLines.status} · hydrography {reviewPacket.proposedCorridor.screen.hydrography.status} · lake outlines {reviewPacket.proposedCorridor.screen.lakeReview.status === "available" ? `${reviewPacket.proposedCorridor.screen.lakeReview.contacts?.length ?? 0} contacts` : reviewPacket.proposedCorridor.screen.lakeReview.status} · Ramsar live review {reviewPacket.proposedCorridor.screen.ramsarAreaReview.status === "available" ? `${reviewPacket.proposedCorridor.screen.ramsarAreaReview.sites?.filter((site) => site.relation === "intersects_published_depiction").length ?? 0} contacts${reviewPacket.proposedCorridor.screen.ramsarAreaReview.possiblyTruncated ? " (incomplete)" : ""}` : "unavailable"} · terrestrial OSM {reviewPacket.proposedCorridor.screen.terrestrialDepictions.status === "available" ? `${reviewPacket.proposedCorridor.screen.terrestrialDepictions.contacts?.length ?? 0} contacts` : reviewPacket.proposedCorridor.screen.terrestrialDepictions.status} · mapped-way comparison {reviewPacket.proposedCorridor.screen.mappedInfrastructure.status} · global relief {reviewPacket.proposedCorridor.screen.globalReliefPoints.status}.<br />
                This is a scenario screen, not a route finding or feasibility result. Its full source records, contacts, dates, licenses, and gaps are in the downloaded JSON.
              </div>}
              {reviewPacket.proposedCorridor.errorCode && <div>Source error: {reviewPacket.proposedCorridor.errorCode}</div>}
            </details>}
            {reviewPacket.mappedGapScreens.length > 0 && <details className="mt-1 text-amber-100">
              <summary>Mapped gap screens · {reviewPacket.mappedGapScreens.filter((gap) => gap.status === "available").length}/{reviewPacket.mappedGapScreens.length} available</summary>
              {reviewPacket.mappedGapScreens.map((gap, index) => <div key={`${gap.hypothesis?.networkKind ?? "unknown"}:${gap.hypothesis?.fromNodeRef ?? index}:${gap.hypothesis?.toNodeRef ?? index}`} className="mt-1 border-t border-white/15 pt-1">
                Gap {index + 1}: {gap.hypothesis?.networkKind ?? "unknown"} · {gap.hypothesis?.straightLineDistanceKm.toFixed(2) ?? "unknown"} km · {gap.status}. {gap.hypothesis && <><a href={gap.hypothesis.fromSourceRecordUrl} target="_blank" rel="noreferrer" className="underline">mapped end A</a>{" · "}<a href={gap.hypothesis.toSourceRecordUrl} target="_blank" rel="noreferrer" className="underline">mapped end B</a>.</>}
                {gap.screen && <div>Border-line contacts {gap.screen.boundaryLines.status === "available" ? gap.screen.boundaryLines.contacts?.length ?? 0 : "unavailable"} · waterway contacts {gap.screen.hydrography.status === "available" ? gap.screen.hydrography.contacts?.length ?? 0 : "unavailable"} · lake outlines {gap.screen.lakeReview.status === "available" ? gap.screen.lakeReview.contacts?.length ?? 0 : "unavailable"} · Ramsar contacts {gap.screen.ramsarAreaReview.status === "available" ? gap.screen.ramsarAreaReview.sites?.filter((site) => site.relation === "intersects_published_depiction").length ?? 0 : "unavailable"} · terrestrial OSM {gap.screen.terrestrialDepictions.status === "available" ? `${gap.screen.terrestrialDepictions.contacts?.length ?? 0} contacts` : gap.screen.terrestrialDepictions.status} · relief {gap.screen.globalReliefPoints.status === "available" ? `${gap.screen.globalReliefPoints.observations?.filter((item) => item.status === "available").length ?? 0}/${gap.screen.globalReliefPoints.samplePlan?.length ?? 0} cells` : gap.screen.globalReliefPoints.status}. Selected-country and global country depictions are in the packet JSON.</div>}
                {gap.errorCode && <div>Screen error: {gap.errorCode}</div>}
              </div>)}
              <div>These straight connections are screening questions. Length and generalized contacts do not establish feasibility, impact, jurisdiction, consent, need, or priority.</div>
            </details>}
            {reviewPacket.countries.some((country) => country.routeGeometryReview?.status === "available" &&
              (country.routeGeometryReview.encounters?.length ?? 0) > 0) && <div className="mt-1 text-violet-100">
              Violet map markers show administrative depiction contacts across all packet options; they may differ from an earlier alignment shown in white.
            </div>}
            {reviewPacket.countries.map((country) => country.status === "available" && country.routeGeometryReview &&
              <details key={`${country.countryIso3}:route-geometry`} className="mt-1">
                <summary>{country.countryIso3} administrative outline contacts: {country.routeGeometryReview.status === "available"
                  ? `${country.routeGeometryReview.encounters?.length ?? 0}${country.routeGeometryReview.possiblyTruncated ? "+ (truncated)" : ""}`
                  : country.routeGeometryReview.status.replaceAll("_", " ")}</summary>
                {country.routeGeometryReview.status === "available" && <ul className="mt-1 list-inside list-disc">
                  {(country.routeGeometryReview.encounters ?? []).map((contact, index) => <li key={`${contact.candidateId}:${contact.boundaryId}:${index}`}>
                    Packet option {reviewPacket.route.candidates?.find((candidate) => candidate.candidateId === contact.candidateId)?.optionIndex ?? "unknown"} · mapped segment {contact.routeSegmentIndex + 1} · {contact.contactKind} at {contact.position.lat.toFixed(5)}, {contact.position.lon.toFixed(5)} · represented year {contact.sourceYearRepresented} · <a href={contact.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">geoBoundaries source</a>
                  </li>)}
                </ul>}
                <div>Gaps: {country.routeGeometryReview.missingEvidence.join(", ").replaceAll("_", " ")}</div>
              </details>)}
            <details className="mt-1"><summary>Sources and unresolved questions</summary>
              <ul className="mt-1 list-inside list-disc">{reviewPacket.sourceLedger.map((entry, index) => <li key={`${entry.sourceId}:${index}`}>
                {entry.sourceId}: {entry.status} · {entry.sourceTimeMeaning.replaceAll("_", " ")} {entry.sourceTime ?? "unknown"} · retrieved {entry.retrievedAt ?? "unknown"} · {entry.license ?? "license unavailable"} {entry.sourceRecordUrl && <a href={entry.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">source</a>}
              </li>)}</ul>
              <div className="mt-1">Source metadata relative to the assessment time (feature validity remains unverified):</div>
              <ul className="mt-1 list-inside list-disc">{(reviewPacket.temporalReview ?? []).map((item, index) => <li key={`${item.sourceId}:${index}`}>
                {item.sourceId}: {item.sourceTimeMeaning.replaceAll("_", " ")} {item.sourceTime ?? "unknown"} is {item.metadataRelationToEvaluation.replaceAll("_", " ")} · {item.limitation.replaceAll("_", " ")}
              </li>)}</ul>
              <div className="mt-1">Unresolved: {reviewPacket.unresolved.join(", ").replaceAll("_", " ")}</div>
            </details>
            <div className="mt-1 text-violet-100">Evidence for review; no sovereignty, permission, feasibility, or policy decision.</div>
          </div>}
        </div>
        <div className="mt-1 border-t border-white/15 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">NWS active alert notices at a point</span>
            <button type="button" onClick={() => loadNwsNotices(routeOrigin)} disabled={nwsStatus === "loading"} className="rounded border border-red-300/50 px-2 py-0.5 disabled:opacity-50">At origin</button>
            <button type="button" onClick={() => loadNwsNotices(routeDestination)} disabled={nwsStatus === "loading"} className="rounded border border-red-300/50 px-2 py-0.5 disabled:opacity-50">At destination</button>
            {nwsNotices.length > 0 && <label className="flex items-center gap-1"><input type="checkbox" checked={nwsVisible} onChange={(event) => setNwsVisible(event.target.checked)} />Show marker</label>}
          </div>
          {nwsStatus === "loading" && <div>Loading NWS notices…</div>}
          {nwsMessage && <div role="status" className="text-amber-200">{nwsMessage}</div>}
          {nwsStatus === "ready" && <div className="text-slate-300">
            {nwsNotices.length} notices returned for {nwsQueryPoint ? `${nwsQueryPoint.lat.toFixed(4)}, ${nwsQueryPoint.lon.toFixed(4)}` : "the point"}
            {nwsPossiblyTruncated ? " · result limit reached" : ""}. Point marker is not an alert area or route-wide hazard assessment.<br />
            {nwsFetchedAt ? `Retrieved ${nwsFetchedAt} · ` : ""}<a href="https://www.weather.gov/disclaimer" target="_blank" rel="noreferrer" className="underline">Source: National Weather Service</a>
            {nwsNotices.length > 0 && <details className="mt-1"><summary>Inspect NWS notices</summary>
              <ul className="mt-1 list-inside list-disc">{nwsNotices.map((notice) => <li key={notice.noticeId}>
                <a href={notice.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">{notice.label}</a> · severity {notice.severity ?? "unknown"} · effective {notice.effectiveAt ?? "unknown"} · expires {notice.expiresAt ?? "unknown"} · route impact unassessed
              </li>)}</ul>
            </details>}
          </div>}
        </div>
        <div className="mt-1 border-t border-white/15 pt-1">
          <div className="font-semibold text-sky-100">NOAA station water level</div>
          <div className="mt-1 text-slate-300">Enter a CO-OPS station ID for recent observed water height at that station. This is a point observation, not route-wide coastal conditions.</div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <input aria-label="NOAA CO-OPS station ID" value={noaaStationInput} onChange={(event) => setNoaaStationInput(event.target.value)} placeholder="Station ID, e.g. 9414290" className="w-32 rounded border border-sky-300/40 bg-slate-950 px-1 py-0.5" />
            <select aria-label="NOAA observation period" value={noaaDate} onChange={(event) => setNoaaDate(event.target.value as typeof noaaDate)} className="rounded border border-sky-300/40 bg-slate-950 px-1 py-0.5">
              <option value="latest">Latest (18 min)</option><option value="today">Today</option>
            </select>
            <select aria-label="NOAA vertical datum" value={noaaDatum} onChange={(event) => setNoaaDatum(event.target.value as typeof noaaDatum)} className="rounded border border-sky-300/40 bg-slate-950 px-1 py-0.5">
              <option value="MLLW">MLLW</option><option value="MSL">MSL</option><option value="NAVD">NAVD</option><option value="IGLD">IGLD</option><option value="LWD">LWD</option>
            </select>
            <button type="button" onClick={loadNoaaWaterLevel} disabled={noaaStatus === "loading"} className="rounded border border-sky-300/50 px-2 py-0.5 disabled:opacity-50">{noaaStatus === "loading" ? "Loading NOAA…" : "Load station"}</button>
            {noaaSource?.station.lat != null && noaaSource.station.lon != null && <label className="flex items-center gap-1"><input type="checkbox" checked={noaaVisible} onChange={(event) => setNoaaVisible(event.target.checked)} />Show point</label>}
          </div>
          {noaaMessage && <div role="status" className="mt-1 text-amber-200">{noaaMessage}</div>}
          {noaaStatus === "ready" && noaaSource && <div className="mt-1 text-slate-300">
            {noaaMeasurements.length} observations at {noaaSource.station.name ?? noaaSource.station.id} · {noaaSource.datum} · meters · GMT{noaaTruncated ? " · earlier rows omitted by limit" : ""}. Retrieved {noaaSource.fetchedAt}.<br />
            <a href={noaaSource.sourceUrl} target="_blank" rel="noreferrer" className="underline">NOAA CO-OPS source request</a> · <a href="https://tidesandcurrents.noaa.gov/disclaimers.html" target="_blank" rel="noreferrer" className="underline">preliminary data disclaimer</a>
            {noaaMeasurements.length > 0 && <details className="mt-1"><summary>Inspect latest readings</summary><ul className="list-inside list-disc">{noaaMeasurements.slice(-5).reverse().map((measurement) => <li key={measurement.measurementId}>{measurement.observedAt}: {measurement.quantity.value ?? "missing"} {measurement.quantity.unit} relative to {noaaSource.datum} · {measurement.quantity.qualifier ?? "quality unknown"}</li>)}</ul></details>}
            <div>Gaps: {noaaGaps.join(", ").replaceAll("_", " ")}</div>
          </div>}
        </div>
      </details>
      <details className="rounded border border-yellow-300/25 px-2 py-1.5">
        <summary className="cursor-pointer text-yellow-100">Boundaries · {selectedIso3s.length > 0 ? `${Math.min(selectedIso3s.length, 2)} selected` : "select countries"} · {boundaryLineStatus === "ready" ? `${boundaryLines.length}${boundaryLineTruncated ? "+" : ""} lines` : boundaryLineStatus === "loading" ? "loading" : boundaryLineStatus === "unavailable" ? "unavailable" : "zoom for lines"}</summary>
        <div className="mt-1 text-slate-300">Selected country outlines and editorial lines load automatically. Source geometry is evidence, not a sovereignty determination.</div>
        {boundaryStatus === "ready" && <label className="mt-1 flex items-center gap-1"><input type="checkbox" checked={boundaryVisible} onChange={(event) => setBoundaryVisible(event.target.checked)} />Show selected outlines</label>}
        {boundaryMessage && <div role="status" className="mt-1 text-yellow-200">{boundaryMessage}</div>}
        {boundaryClaims.map((claim, index) => <div key={claim.boundaryId} className="mt-1 border-t border-white/15 pt-1">
          <span style={{ color: index === 0 ? "#facc15" : "#22d3ee" }}>●</span> {claim.label}<br />
          Represented year: {claim.sourceYearRepresented} · source: {claim.sourceName}<br />
          Original license: {claim.sourceLicense} · gbOpen distribution: CC BY 4.0<br />
          Integrated by geoBoundaries: {claim.sourceIntegratedAt ?? "unknown"} · retrieved: {claim.fetchedAt}<br />
          <a href={claim.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">Boundary metadata and source</a>
        </div>)}
        {boundaryClaims.length > 0 && <a href="https://www.geoboundaries.org/api.html" target="_blank" rel="noreferrer" className="underline">geoBoundaries attribution and API</a>}
        <div className="mt-2 border-t border-white/15 pt-2">
          <div className="font-semibold text-rose-100">Claim and reference lines · {boundaryLineStatus.replaceAll("_", " ")}</div>
          {boundaryLineStatus === "ready" && <label className="flex items-center gap-1"><input type="checkbox" checked={boundaryLineVisible} onChange={(event) => setBoundaryLineVisible(event.target.checked)} />Show lines</label>}
          <div className="mt-1 text-slate-300">Natural Earth 5.1.0 editorial categories are separate from legal borders.</div>
          {boundaryLineMessage && <div role="status" className="mt-1 text-rose-200">{boundaryLineMessage}</div>}
          {boundaryLineStatus === "ready" && <div className="mt-1 text-slate-300">
            {boundaryLines.length} lines returned{boundaryLineTruncated ? " · result limit reached" : ""}. No matching line does not establish no dispute.<br />
            {boundaryLineFetchedAt ? `Retrieved ${boundaryLineFetchedAt} · ` : ""}<a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer" className="underline">Natural Earth · Public Domain</a>
            {boundaryLines.length > 0 && <details className="mt-1"><summary>Browse returned lines</summary>
              <ul>{boundaryLines.map((line) => <li key={line.lineId}><button type="button" onClick={() => setSelectedBoundaryLine(line)} className="text-left underline">{line.recordCategory}: {line.label}</button></li>)}</ul>
            </details>}
          </div>}
          {selectedBoundaryLine && boundaryLineVisible && <div className="mt-1 border-t border-white/15 pt-1">
            <strong>{selectedBoundaryLine.recordCategory}: {selectedBoundaryLine.label}</strong><br />
            {selectedBoundaryLine.sourceComment && <>{selectedBoundaryLine.sourceComment}<br /></>}
            Source label: {selectedBoundaryLine.sourceClaimLabel ?? "unknown"} · legal claimant: unverified<br />
            Adjacent mapped ISO3: {selectedBoundaryLine.adjacentAdministrativeIso3.map((code) => code ?? "unknown").join(" / ")}<br />
            Effective date and current control: unknown<br />
            <a href={selectedBoundaryLine.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">Natural Earth source file</a> · <a href="https://www.naturalearthdata.com/about/disputed-boundaries-policy/" target="_blank" rel="noreferrer" className="underline">editorial policy</a>
            {Object.keys(selectedBoundaryLine.viewpointClassifications).length > 0 && <details className="mt-1"><summary>Viewpoint classifications</summary>
              <ul>{Object.entries(selectedBoundaryLine.viewpointClassifications).map(([key, value]) => <li key={key}>{key}: {value}</li>)}</ul>
            </details>}
          </div>}
        </div>
      </details>
      <details className="rounded border border-amber-300/25 px-2 py-1.5">
        <summary className="cursor-pointer text-amber-100">Terrain & networks · {infrastructureStatus === "ready" ? `${infrastructureEdges.length}${infrastructureTruncated ? "+" : ""} ways` : infrastructureStatus === "loading" ? "loading" : infrastructureStatus === "unavailable" ? "unavailable" : "zoom for ways"} · {wpiStatus === "ready" ? `${wpiPorts.length}${wpiTruncated ? "+" : ""} WPI ports` : wpiStatus === "loading" ? "loading WPI" : "WPI on zoom"} · {portStatus === "ready" ? `${portCandidates.length}${portTruncated ? "+" : ""} OSM port candidates` : portStatus === "loading" ? "loading OSM ports" : "OSM ports on zoom"} · {hydroStatus === "ready" ? `${hydrographicLines.length}${hydroTruncated ? "+" : ""} waterways` : hydroStatus === "unavailable" ? "rivers unavailable" : hydroStatus === "loading" ? "loading rivers" : "rivers on zoom"}</summary>
        <div className="mt-1 text-slate-300">Mapped infrastructure, including canal ways, loads at close zoom; generalized rivers and lakes appear earlier as natural features.</div>
        <details className="mt-2 border-t border-sky-300/20 pt-2">
          <summary className="cursor-pointer font-semibold text-sky-100">NGA World Port Index · {wpiStatus.replaceAll("_", " ")}</summary>
          <label className="mt-1 flex items-center gap-1"><input type="checkbox" checked={wpiVisible} onChange={(event) => setWpiVisible(event.target.checked)} />Show published port points at close zoom</label>
          {wpiMessage && <div role="status" className="mt-1 text-amber-200">{wpiMessage}</div>}
          {wpiStatus === "ready" && <div className="mt-1 text-slate-300">{wpiPorts.length} NGA inventory records{wpiTruncated ? " · result limit reached" : ""}. This inventory is not exhaustive and does not establish current service, berth access, navigational clearance, customs rights, or a maritime route.{wpiSourceAt ? ` Retrieved ${wpiSourceAt}.` : ""}</div>}
          {selectedWpiPort && wpiVisible && <div className="mt-1 border-t border-sky-300/20 pt-1 text-sky-100">
            {selectedWpiPort.name} · WPI {selectedWpiPort.wpiNumber}{selectedWpiPort.unlocode ? ` · ${selectedWpiPort.unlocode}` : ""} · {selectedWpiPort.harborUse ?? "harbor use unknown"}.<br />
            Published facility flags: container {selectedWpiPort.facilities.container}, oil terminal {selectedWpiPort.facilities.oilTerminal}, LNG terminal {selectedWpiPort.facilities.lngTerminal}, liquid bulk {selectedWpiPort.facilities.liquidBulk}.<br />
            Published channel depth {selectedWpiPort.publishedDimensions.channelDepthM ?? "unknown"} m · max vessel draft {selectedWpiPort.publishedDimensions.maxVesselDraftM ?? "unknown"} m. Verify currency and local conditions with the port authority.<br />
            <a href={selectedWpiPort.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">NGA source record</a>
          </div>}
        </details>
        <div className="mt-2 border-t border-amber-300/20 pt-2">
          <div className="font-semibold text-amber-100">Mapped port and harbour candidates · {portStatus.replaceAll("_", " ")}</div>
          <label className="mt-1 flex items-center gap-1"><input type="checkbox" checked={portVisible} onChange={(event) => setPortVisible(event.target.checked)} />Show candidate points at close zoom</label>
          {portMessage && <div role="status" className="mt-1 text-amber-200">{portMessage}</div>}
          {portStatus === "ready" && <div className="mt-1 text-slate-300">{portCandidates.length} OSM objects{portTruncated ? " · result limit reached" : ""}; inventory may be incomplete. A point is not a berth or navigable entrance. Current facilities, shipping service, capacity, customs, and access rights need independent review.{portSourceAt ? ` Retrieved ${portSourceAt}.` : ""} <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap contributors · ODbL</a>.</div>}
          {selectedPort && portVisible && <div className="mt-1 border-t border-amber-300/20 pt-1 text-amber-100">
            {selectedPort.label} · {selectedPort.osmType} {selectedPort.osmId} · {selectedPort.positionKind.replaceAll("_", " ")}. Source edited {selectedPort.sourceEditedAt ?? "unknown"}.<br />
            Tags: {Object.entries(selectedPort.sourceTags).map(([key, value]) => `${key}=${value}`).join(" · ") || "none returned"}.<br />
            <a href={selectedPort.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">OSM object</a> · operation, permission, and maritime route unverified.
          </div>}
        </div>
        {infrastructureStatus === "ready" && <label className="flex items-center gap-1"><input type="checkbox" checked={infrastructureVisible} onChange={(event) => setInfrastructureVisible(event.target.checked)} />Show mapped ways</label>}
        {infrastructureMessage && <div role="status" className="mt-1 text-amber-200">{infrastructureMessage}</div>}
        {infrastructureStatus === "ready" && <div className="mt-1 text-slate-300">
          {infrastructureEdges.length} OSM mapped ways{infrastructureTruncated ? " · limit reached; area incomplete" : ""}. Operations, capacity, and permissions unknown.
          {infrastructureBbox && <><br />Area [W, S, E, N]: {infrastructureBbox.map((value) => value.toFixed(3)).join(", ")}</>}
          {infrastructureCoverageGaps.length > 0 && <><br />Coverage gaps: {infrastructureCoverageGaps.join(", ").replaceAll("_", " ")}</>}
          <br />{infrastructureFetchedAt ? `Retrieved ${infrastructureFetchedAt} · ` : ""}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap contributors · ODbL</a>
        </div>}
        {selectedInfrastructure && infrastructureVisible && <div className="mt-1 border-t border-white/15 pt-1">
          {selectedInfrastructure.label}<br />Source edited {selectedInfrastructure.sourceEditedAt ?? "unknown"}<br />Status, capacity, permission: unknown<br />
          <a href={selectedInfrastructure.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">OSM way record</a>
        </div>}
        {ramsarViewportEligible && <details className="mt-2 border-t border-emerald-300/25 pt-2">
          <summary className="cursor-pointer font-semibold text-emerald-100">Published wetland depictions · {ramsarStatus === "ready"
            ? `${new Set(ramsarOverlay?.geojson.features.map((feature) => feature.properties.siteNumber)).size} pilot sites mapped`
            : ramsarStatus === "loading" ? "loading" : ramsarStatus === "unavailable" ? "unavailable" : "zoom into the pilot area"}</summary>
          <label className="mt-1 flex items-center gap-1"><input type="checkbox" checked={ramsarVisible} onChange={(event) => setRamsarVisible(event.target.checked)} />Show published polygons at close zoom</label>
          {ramsarOverlay && <div className="mt-1 text-slate-300">
            Ramsar Sites Information Service snapshot acquired {ramsarOverlay.source.acquiredAt.slice(0, 10)}. Boundary effective date and current management rules unverified.
            {ramsarOverlay.source.missingBoundarySiteNumbers.length > 0 && <> No published polygon in this snapshot for site #{ramsarOverlay.source.missingBoundarySiteNumbers.join(", #")}; that is unknown coverage, not a no-contact finding.</>}
            <br /><a href={ramsarOverlay.source.url} target="_blank" rel="noreferrer" className="underline">Published boundary source</a> · <a href={ramsarOverlay.source.licenseUrl} target="_blank" rel="noreferrer" className="underline">Reuse terms</a>
          </div>}
          {selectedRamsarSite && ramsarVisible && <div className="mt-1 border-t border-emerald-300/20 pt-1 text-emerald-100">
            {selectedRamsarSite.name} · site #{selectedRamsarSite.siteNumber} · {selectedRamsarSite.countryIso3}. Published depiction only; ecological effects, legal rules, and route permission need separate review.
          </div>}
        </details>}
        <div className="mt-2 border-t border-cyan-300/25 pt-2">
          <div className="font-semibold text-cyan-100">Lake outlines · {lakesStatus.replaceAll("_", " ")}</div>
          <label className="flex items-center gap-1"><input type="checkbox" checked={lakesVisible} onChange={(event) => setLakesVisible(event.target.checked)} />Show generalized lake polygons</label>
          {lakesMessage && <div role="status" className="text-cyan-200">{lakesMessage}</div>}
          {lakesStatus === "ready" && <div className="mt-1 text-slate-300">
            {lakeDepictions.length} source depictions{lakesTruncated ? " · result limit reached" : ""}. Natural Earth 1:50m version 5.0.0; effective shoreline date unknown. Its Aral Sea outline may be larger than current extent. These polygons do not measure water levels, rights, ecology, or route effects. <a href="https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-lakes-reservoirs/" target="_blank" rel="noreferrer" className="underline">Dataset and limits</a>.
            {lakeDepictions.length > 0 && <details className="mt-1"><summary>Browse returned lakes</summary>
              <ul>{lakeDepictions.map((lake) => <li key={lake.featureId}><button type="button" onClick={() => setSelectedLake(lake)} className="text-left underline">{lake.label}</button></li>)}</ul>
            </details>}
          </div>}
          {selectedLake && lakesVisible && <div className="mt-1 border-t border-cyan-300/20 pt-1 text-cyan-100">
            {selectedLake.label} · Natural Earth feature {selectedLake.featureId} · {selectedLake.featureClass}. Generalized outline; current extent and condition unverified. <a href={selectedLake.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">Source archive</a>.
          </div>}
        </div>
        <div className="mt-2 border-t border-cyan-300/25 pt-2">
          <div className="font-semibold text-cyan-100">Rivers and lake centerlines · {hydroStatus.replaceAll("_", " ")}</div>
          {hydroStatus === "ready" && <label className="flex items-center gap-1"><input type="checkbox" checked={hydroVisible} onChange={(event) => setHydroVisible(event.target.checked)} />Show natural lines</label>}
          <div className="mt-1 text-slate-300">Natural Earth 1:50m generalized lines; canals belong to the infrastructure layer.</div>
          {hydroMessage && <div role="status" className="mt-1 text-cyan-200">{hydroMessage}</div>}
          {hydroStatus === "ready" && <div className="mt-1 text-slate-300">
            {hydrographicLines.length} source lines{hydroTruncated ? " · result limit reached" : ""}. No line does not prove no waterway. Flow, navigability, and crossing feasibility unknown.<br />
            Pinned version 5.0.0 · <a href="https://www.naturalearthdata.com/downloads/50m-physical-vectors/" target="_blank" rel="noreferrer" className="underline">Natural Earth source</a> · <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer" className="underline">Public Domain</a>
            {hydrographicLines.length > 0 && <details className="mt-1"><summary>Browse returned rivers</summary>
              <ul>{hydrographicLines.map((line) => <li key={line.lineId}><button type="button" onClick={() => setSelectedHydroLine(line)} className="text-left underline">{line.featureKind.replaceAll("_", " ")}: {line.label}</button></li>)}</ul>
            </details>}
          </div>}
          {selectedHydroLine && hydroVisible && <div className="mt-1 border-t border-cyan-300/20 pt-1">
            {selectedHydroLine.label} · {selectedHydroLine.featureKind.replaceAll("_", " ")}<br />
            Natural Earth feature {selectedHydroLine.sourceFeatureId} · scale rank {selectedHydroLine.scaleRank}<br />
            Source effective date, discharge, seasonal behavior, navigability, and crossing rights: unknown.<br />
            <a href={selectedHydroLine.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline">Source archive</a> · SHA-256 {selectedHydroLine.sourceArchiveSha256.slice(0, 12)}…
          </div>}
        </div>
      </details>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-[5] max-w-[min(36rem,calc(100%-1.5rem))] rounded border border-white/15 bg-black/75 px-2 py-1 text-[10px] text-slate-200 shadow backdrop-blur">
        Google basemap · sourced detail loads as you zoom · click a line, lake, or wetland depiction for its record
      </div>
      {seismicStatus !== "idle" && (
        <div className="absolute bottom-3 right-3 z-[6] max-w-xs rounded border border-orange-300/30 bg-black/85 px-2 py-1.5 text-[10px] text-slate-100 shadow backdrop-blur">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={seismicVisible} onChange={(event) => setSeismicVisible(event.target.checked)} />
            USGS observed earthquakes (past 24 hours, M ≥ 4.5)
          </label>
          <div className="mt-1 text-slate-300">
            {seismicStatus === "ready"
              ? `${seismicMeasurements.length} observations${seismicPossiblyTruncated ? " · result limit reached" : ""}`
              : seismicStatus === "loading" ? "Loading source observations…" : "Source observations unavailable"}
          </div>
          {seismicStatus === "ready" && (
            <div className="text-slate-400">
              Source-backed observations · {" "}
              {seismicFetchedAt ? `Retrieved ${seismicFetchedAt} · ` : ""}
              <a href="https://www.usgs.gov/information-policies-and-instructions/acknowledging-or-crediting-usgs" target="_blank" rel="noreferrer" className="underline">Credit: U.S. Geological Survey</a>
            </div>
          )}
          {selectedSeismic && seismicVisible && (
            <div className="mt-1 border-t border-white/15 pt-1">
              {selectedSeismic.label} · {selectedSeismic.quantity.value == null ? "magnitude unavailable" : `M ${selectedSeismic.quantity.value}`}<br />
              Observed {selectedSeismic.observedAt}<br />
              {selectedSeismic.quantity.qualifier ? `${selectedSeismic.quantity.qualifier.replaceAll(";", " · ")} · ` : ""}confidence {selectedSeismic.confidence == null ? "unquantified" : selectedSeismic.confidence.toFixed(2)}<br />
              Gaps: {selectedSeismic.missingEvidence.join(", ").replaceAll("_", " ")}<br />
              {selectedSeismic.sourceUrl && <a href={selectedSeismic.sourceUrl} target="_blank" rel="noreferrer" className="underline">USGS event record</a>}
            </div>
          )}
        </div>
      )}
      {(loading || error) && (
        <div role="status" aria-live="polite" className="absolute bottom-10 left-3 z-[6] max-w-[min(20rem,calc(100%-1.5rem))] rounded border border-white/15 bg-black/85 px-3 py-2 text-xs text-slate-100 shadow-lg">
          {loading ? "Loading Google Maps tiles…" : error}
        </div>
      )}
    </div>
  );
}
