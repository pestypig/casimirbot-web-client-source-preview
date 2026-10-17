import { useEffect, useRef, useState } from "react";
import { resolveMoodAsset } from "@/lib/luma-moods";

export type Unga81Affiliation = { countryIso3: string; countryName: string; speakerSegments: number; substantiveSegments: number };
export type Unga81CountryView = {
  schemaVersion: "civilization_unga81_country_evidence/v12";
  countryIso3: string;
  countryName: string | null;
  corpus: { transcriptKind: string; officialRecord: false; reviewStatus: "unreviewed" };
  submittedStatements: Array<{ label: string; pageUrl: string; date: string | null; officialSpeakerDescription: string; speakerAttributionStatus: string; pdfUrls: string[]; status: string }>;
  sourceCrosswalk: { officialDates: string[]; provisionalDates: string[]; dateAlignment: string; speakerAttributionStatus: string;
    submittedDocumentDateReview: { status: "not_recorded" | "source_not_admitted" | "official_page_date_missing" | "matches_official_page" | "differs_from_official_page";
      date: string | null; sourcePageUrl: string | null } };
  submittedTextQuality: Array<{ sourceUrl: string; status: string; reasonCodes: string[] }>;
  submittedOcrCandidates: Array<{ sourceUrl: string; status: "unreviewed_source_review_aid"; pageCount: number; lineCount: number; meanConfidence: number | null }>;
  reviewedBrief: null | { speaker: string; speakerAttributionSource: "submitted_pdf_and_official_page" | "official_page_only"; speechDate: string; sourceLanguage: string; sourceUrl: string; reviewScope: string; assertions: Array<{ id: string; claimType: string; text: string; sourcePage: number; sourceUrl: string; reviewDisposition: "supported_by_submitted_text"; temporalScope: string; uncertainty: string }> };
  reconciliation: null | { reviewedAt: string; provisionalTranscriptUrl: string; officialMeetingRecordStatus: string;
    recordingReview: null | { sourceUrl: string; linkSourceUrl: string; status: "linked_from_un_transcript_page_not_reviewed"; note: string };
    assertions: Array<{ assertionId: string; alignment: "topic_consistent" | "wording_discrepancy"; note: string; publishedSpeechCorroboration?: { publisher: string; sourceUrl: string; finding: string; deliveryStatus: "not_verified_to_recording_or_official_meeting_record" } }> };
  coverage: { speakerSegments: number; substantiveSegments: number };
  segments: Array<{ date: string; sourceUrl: string; speakerFunction: string | null }>;
  priorityCandidates: Array<{ sourceUrl: string; text: string }>;
  topicMentions: Array<{ topic: string; sentenceMentions: number; exampleSourceUrl: string }>;
  missingEvidence: string[];
};
type TradeDirection = { reporterIso3: string; partnerIso3: string; status: string; primaryValueUsd: number | null; sourceUrl: string | null; isReported: boolean | null; isAggregate: boolean | null };
type TradePair = { directions: [TradeDirection, TradeDirection]; query: { year: number }; interpretationLimits: string[] };
type PlannedJointVentureUi = { status: string; sourceSection: string;
  initialOwnership: Array<{ stakeholder: string; percent: number }>;
  conditionalExtension: { initialTermYears: number; additionalTermYears: number;
    armeniaOwnershipPercentOnExtension: number; condition: string }; interpretationLimit: string };
type DatedNegotiatingConditionUi = { id: string; comparisonStatus: string; interpretation: string; nextQuestion: string;
  legalDetermination: "not_assessed"; currentMutualAcceptance: "not_established";
  relatedSubmittedAssertionIds: string[];
  positions: Array<{ countryIso3: string; speaker: string; sourceDate: string; sourceUrl: string;
    sourceSection: string; paraphrase: string; statedSequence: string; limit: string }> };
type BilateralPair = {
  bilateralEvidence: { reviewScope: string; records: Array<{ id: string; kind: string; eventDate: string; parties: string[]; legalStatus: string; statusAsOf: string; statusEvidenceUrls: string[]; sourceSections: string[]; sourcePublisher: string; sourceUrl: string; corroboratingSources: Array<{ sourcePublisher: string; sourceUrl: string }>; summary: string; conditions: string[]; thirdPartyDependencies: Array<{ partyIso3: string | null; role: string }>; limits: string }> };
  dependentGovernmentEvidence: { reviewScope: string; records: Array<{ id: string; eventDate: string; parties: string[]; legalStatus: string; statusAsOf: string; statusEvidenceUrls: string[]; sourceSections: string[]; sourceUrl: string; summary: string; conditions: string[]; limits: string;
    milestones?: Array<{ date: string; kind: string; summary: string; sourceUrl: string }>;
    plannedJointVenture?: PlannedJointVentureUi }> };
  multilateralGovernmentEvidence: { reviewScope: string; records: Array<{ id: string; eventDate: string; parties: string[]; legalStatus: string; sourceUrl: string; summary: string; conditions: string[]; limits: string;
    reportedMeasures?: Array<{ metric: string; value: number; unit: string; qualifier: string; period: string; independentVerification: "not_verified" }> }> };
  thirdPartyPositions: Array<{ countryIso3: string; speaker: string; speakerAttributionSource: "submitted_pdf_and_official_page" | "official_page_only"; speechDate: string; permissionOrConstraintEffect: "unassessed"; assertions: Array<{ id: string; text: string; sourceUrl: string; sourcePage: number }> }>;
};
type RelationshipNetworkUi = {
  schemaVersion: "civilization_diplomatic_relationship_network/v9";
  trade: TradePair | null;
  nodes: Array<{ countryIso3: string; role: string }>;
  relations: Array<{ id: string; fromIso3: string; toIso3: string; relationKind: string;
    eventDate: string | null; measuredYear: number | null; legalStatus: string | null;
    statusAsOf: string | null;
    tradeStatus: string | null; reportedGoodsValueUsd: number | null;
    applicability: string; sourceUrls: string[]; interpretationLimit: string;
    milestones: Array<{ date: string; kind: string; summary: string; sourceUrl: string }> }>;
  statedPairPerspectives: Array<{ id: string; fromIso3: string; toIso3: string;
    speaker: string; speechDate: string; claimType: string; text: string;
    sourceUrl: string; sourcePage: number; reviewRevision: number; uncertainty: string;
    sourceKind: "reviewed_submitted_statement_delivery_unverified"; currentRelationEffect: "unassessed" }>;
  multilateralGovernmentRecords: Array<{ id: string; parties: string[]; eventDate: string; legalStatus: string;
    sourceUrls: string[]; conditions: string[]; interpretationLimit: string;
    reportedMeasures: Array<{ metric: string; value: number; unit: string; qualifier: string; period: string }> }>;
  reportedTransportEvents: Array<{ id: string; reportDate: string; sourceUrl: string;
    reportedTransitCountryIso3s: string[]; destinationCountryIso3: string; commodity: string;
    reportedQuantity: { value: number; unit: "wagons" }; interpretationLimit: string;
    corroboratingOperationalSources: Array<{ sourcePublisher: string; sourceUrl: string; reportedQuantity: { value: number; unit: "tonnes" }; reportedMilestone: string }> }>;
  datedProjectMilestones: Array<{ id: string; sourceDate: string; sourcePublisher: string; sourceUrl: string;
    projectCountryIso3: string; namedCounterpartIso3: string; sourceActorKind: string;
    sourceActorCountryIso3: string | null; eventKind: string; sourceFinding: string;
    reviewQuestion: string; interpretationLimit: string }>;
  statedThirdPartyPerspectives: Array<{ countryIso3: string; assertionIds: string[]; sourceUrls: string[]; effectOnSelectedPair: "unassessed" }>;
  reviewBadge: { emoji: "🧐"; meaning: "evidence_review_needed_not_diplomatic_sentiment" };
  assessedCooperation: "unassessed";
};
type IssueComparisonUi = {
  schemaVersion: "civilization_diplomatic_issue_comparison/v37";
  query: { firstCountryIso3: string; secondCountryIso3: string; issueId: "regional_connectivity" | "natural_system_cooperation" | "humanitarian_cooperation" };
  namedNaturalSystemReview: { status: "not_applicable" | "named_references_incomplete" | "shared_named_reference" | "different_named_references";
    references: Array<{ countryIso3: string; assertionId: string; systemId: string; label: string; sourceUrl: string }>;
    sharedSystemIds: string[]; interpretation: string };
  facets: Array<{ id: string; label: string; facetKind: "cooperation_topic" | "stated_safety_concern" | "stated_humanitarian_concern" | "stated_trust_concern" | "stated_jurisdiction_principle";
    comparisonBasis: "pair_specific_editorial_crosswalk" | "parallel_reviewed_topic_inventory";
    comparison: string; interpretation: string; unansweredQuestion: string;
    routeEndpointGate: "not_applicable" | "blocked_pending_delivered_wording_review";
    contrast: { sharedPublicTopic: string | null; differenceInSubmittedClaims: string | null;
      directTensionStatus: string; evidenceAssertionIds: string[]; missingCountryIso3s: string[];
      framingDifference: { status: string; description: string | null; evidenceAssertionIds: string[]; inferenceLimit: string } };
    positions: Array<{ id: string; countryIso3: string; speaker: string; speechDate: string; sourceLanguage: string; text: string; sourceUrl: string; sourcePage: number; uncertainty: string;
      provisionalReconciliation: { alignment: "topic_consistent" | "wording_discrepancy" | "not_reconciled"; note: string | null; transcriptUrl: string | null;
        recordingReview: null | { sourceUrl: string; status: "linked_from_un_transcript_page_not_reviewed"; note: string };
        publishedSpeechCorroboration: null | { publisher: string; sourceUrl: string; finding: string; deliveryStatus: "not_verified_to_recording_or_official_meeting_record" } } }> }>;
  datedOperatingReports: Array<{ id: string; reportDate: string; sourcePublisher: string; sourceUrl: string;
    reportedTransitCountryIso3s: string[]; destinationCountryIso3: string; commodity: string;
    reportedQuantity: { value: number; unit: "wagons"; qualifier: "reported_train_load" };
    interpretationLimit: string;
    corroboratingOperationalSources: Array<{ sourcePublisher: string; sourceUrl: string; reportedQuantity: { value: number; unit: "tonnes" }; reportedMilestone: string }> }>;
  datedProjectMilestones: Array<{ id: string; sourceDate: string; sourcePublisher: string; sourceUrl: string;
    sourceActorKind: "national_government" | "development_finance_institution";
    sourceActorCountryIso3: string | null; projectCountryIso3: string; namedCounterpartIso3: string;
    eventKind: "proposal_discussion" | "construction_launch_ceremony" | "government_joint_project_announcement" |
      "financing_close_report" | "multilateral_financing_approval"; sourceFinding: string;
    reviewQuestion: string;
    interpretationLimit: string; operationalStatus: "not_verified" }>;
  reviewedPositionProjectLinks: Array<{ assertionId: string; assertionCountryIso3: string;
    assertionSourceUrl: string; assertionSourcePage: number; milestoneId: string; milestoneSourceUrl: string;
    relation: string; reviewQuestion: string; inferenceLimit: string }>;
  thirdPartyOperatingContext: Array<{ id: string; countryIso3: "GEO"; sourcePublisher: string; sourceUrl: string;
    sourceDate: string; sourceDateMeaning: string; kind: string; finding: string;
    applicability: "general_operator_context_only" | "adjacent_georgia_azerbaijan_network_only";
    routeSpecificTariffStatus: "not_extracted_or_verified";
    permissionStatus: "not_established"; interpretationLimit: string }>;
  designatedWetlandContext: Array<{ countryIso3: string; sourceUrl: string; reviewedAt: string;
    listedSiteCount: number; sites: Array<{ siteNumber: number; name: string }>;
    geometryStatus: "published_boundary_snapshot_available" | "partial_published_boundary_snapshot_agh_ghol_missing" | "published_boundary_not_acquired";
    managementRulesStatus: "not_reconciled_to_current_authority";
    routeRelationStatus: "not_screened_country_inventory_only"; interpretationLimit: string }>;
  humanitarianContext: Array<{ id: string; topic: "missing_persons" | "mine_action";
    kind: "institutional_plan" | "national_program_report"; countryIso3: string | null;
    publisher: string; publicationDate: string; sourceUrl: string; sourceSection: string;
    summary: string; evidenceStatus: string; limits: string }>;
  familyContext: Array<{ id: string; countryIso3: string; publisher: string; publicationDate: string;
    sourceUrl: string; sourceSection: string; evidenceBasis: string; boundedPerspective: string;
    possibleNeedForOptionReview: string; representativeness: string; optionConsentStatus: "not_obtained" }>;
  datedNegotiatingConditions: DatedNegotiatingConditionUi[];
  governmentRecords: Array<{ id: string; scope: string; parties: string[]; legalStatus: string; eventDate: string; sourceUrl: string; sourceSections: string[]; limits: string;
    plannedJointVenture: PlannedJointVentureUi | null }>;
  thirdPartyPerspectives: Array<{ countryIso3: string; assertions: Array<{ id: string; text: string; sourceUrl: string; sourcePage: number; reviewRevision: number }>;
    relevanceToPair: { status: string; selectedPartyAssertionIds: string[]; thirdPartyAssertionIds: string[];
      interpretation: string; optionSpecificConsent: "not_established" }; effectOnOptions: "unassessed" }>;
  thirdPartyCoverageGaps: Array<{ countryIso3: string; triggerAssertionId: string; status: string;
    officialPageUrl: string | null; linkedSubmittedPdfCount: number; provisionalTranscriptUrls: string[]; interpretation: string }>;
  unresolved: string[];
};
type PairGlanceUi = {
  schemaVersion: "civilization_diplomatic_pair_glance/v18";
  query: { firstCountryIso3: string; secondCountryIso3: string; issueId: "regional_connectivity" | "natural_system_cooperation" | "humanitarian_cooperation" };
  directions: Array<{ countryIso3: string; counterpartIso3: string; countryName: string | null; sourceLanguage: string | null;
    positionStatus: "selected_issue_assertion" | "general_reviewed_assertion_only" | "reviewed_assertion_unavailable";
    leadBasis: "explicit_counterpart_reference_in_selected_issue" | "selected_issue_assertion" |
      "explicit_counterpart_reference_outside_selected_issue" | "general_reviewed_assertion" | "unavailable";
    assertion: null | { id: string; claimType: string; text: string; sourceUrl: string; sourcePage: number;
      speaker: string; speechDate: string; reviewRevision: number; uncertainty: string;
      deliveryAlignment: "topic_consistent" | "wording_discrepancy" | "not_reconciled"; deliveryNote: string | null };
    counterpartReference: { status: "issue_specific_reviewed_reference" | "general_reviewed_reference_only" | "not_identified_in_reviewed_selection";
      assertion: null | { id: string; text: string; sourceUrl: string; sourcePage: number; speaker: string; speechDate: string;
        deliveryAlignment: "topic_consistent" | "wording_discrepancy" | "not_reconciled"; deliveryNote: string | null } } }>;
  sharedTopic: null | { facetId: string; label: string;
    comparisonBasis: "pair_specific_editorial_crosswalk" | "parallel_reviewed_topic_inventory";
    sharedPublicTopic: string | null;
    differenceInSubmittedClaims: string | null; directTensionStatus: string;
    assertionIds: string[]; unansweredQuestion: string };
  corpusCoverage: { indexedDelegationPages: number; delegationPagesWithSelectedReviewedBrief: number;
    selectedReviewedAssertionCount: number; fullSpeechAssertionReviewStatus: "not_issued_in_current_manifest";
    selectedIssueTopics: Array<{ id: string; label: string; indexedDelegationPageCount: number;
      countriesWithAdmittedSelectedAssertionsCount: number; selectedPairCountriesWithAdmittedAssertions: string[] }>;
    selectedCountries: Array<{ countryIso3: string; officialPageCount: number; reviewedAssertionCount: number;
      submittedTextStatus: string; deliveryStatus: string; nextReviewStage: string; nextReviewReason: string;
      dateCrosscheck: { officialPageDates: string[]; provisionalTranscriptDates: string[];
        submittedDocumentDate: string | null; submittedDocumentDatePageUrl: string | null;
        submittedDocumentDateStatus: "not_recorded" | "source_not_admitted" | "official_page_date_missing" | "matches_official_page" | "differs_from_official_page" };
      sourceUrls: string[] }>; interpretation: string };
  reviewFace: { assetMood: "question"; meaning: "evidence_review_needed_not_diplomatic_sentiment" };
  interactionCue: { status: "dated_joint_public_record" | "no_joint_public_record_in_current_evidence";
    assetMood: "friend" | "question";
    meaning: "documented_joint_public_engagement_not_current_diplomatic_sentiment" | "joint_public_engagement_not_established_by_current_selection";
    record: null | { id: string; kind: string; eventDate: string; legalStatus: string;
      parties: string[]; sourceUrl: string; sourceUrls: string[]; limits: string } };
  relationshipAssessment: "unassessed";
};
const countryCache = new Map<string, Unga81CountryView>();
const reviewFace = resolveMoodAsset("question")?.sources[0];

type SubmittedPageResponse = {
  status: "available" | "unavailable";
  query: { page: number };
  source: { sourcePageUrl: string; expectedPdfSha256: string | null };
  text?: string; textTruncated?: boolean; errorCode?: string;
};
type SubmittedPageBatchQueue = {
  schemaVersion: "civilization_unga81_submitted_page_leads/v2";
  query: { countryIso3: string; batchOffset: number };
  source: { indexStatus: "current" | "stale_source_manifest" };
  pageLeads: { status: "available" | "not_indexed" | "stale_source_manifest" };
  submittedPageBatchQueue: {
    totalBatchCount: number; omittedBeforeCount: number; omittedAfterCount: number;
    nextBatchOffset: number | null;
    queries: Array<{ countryIso3: string; sourceUrl: string; pages: number[];
      cuePageCount: number; sourcePageCount: number; readerPageLimitReached: boolean }>;
  };
};
type SubmittedPageBatchResponse = {
  schemaVersion: "civilization_unga81_submitted_page_batch/v1";
  query: { countryIso3: string; sourceUrl: string; pages: number[] };
  sourceStatus: "hash_matched_pdf" | "unavailable";
  source: { expectedPdfSha256: string | null };
  pages: Array<{ page: number; sourcePageUrl: string; status: "available" | "unavailable";
    text?: string; textTruncated?: boolean; errorCode?: string }>;
};

function SubmittedPageReader({ view }: { view: Unga81CountryView }) {
  const sources = [...new Set(view.submittedStatements.flatMap((statement) => statement.pdfUrls))];
  const [sourceUrl, setSourceUrl] = useState(sources.find((url) => /_en(?:_|\.)/i.test(url)) ?? sources[0] ?? "");
  const [page, setPage] = useState(1);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<SubmittedPageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSerial = useRef(0);
  const [batchQueue, setBatchQueue] = useState<SubmittedPageBatchQueue | null>(null);
  const [batchResult, setBatchResult] = useState<SubmittedPageBatchResponse | null>(null);
  const [batchReading, setBatchReading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { requestSerial.current++; }, []);
  useEffect(() => () => batchAbortRef.current?.abort(), []);
  if (!sources.length) return null;
  const readPage = async () => {
    const serial = ++requestSerial.current;
    setReading(true); setResult(null); setError(null);
    const params = new URLSearchParams({ sourceUrl, page: String(page) });
    try {
      const response = await fetch(`/api/civilization/geospatial/diplomacy/unga81/country/${view.countryIso3}/submitted-page?${params}`);
      if (!response.ok) throw new Error(`Source page read returned HTTP ${response.status}.`);
      const value = await response.json() as SubmittedPageResponse;
      if (requestSerial.current === serial) setResult(value);
    } catch (cause) { if (requestSerial.current === serial) setError(cause instanceof Error ? cause.message : "Source page unavailable."); }
    finally { if (requestSerial.current === serial) setReading(false); }
  };
  const loadBatchQueue = async (offset: number) => {
    batchAbortRef.current?.abort();
    const controller = new AbortController();
    batchAbortRef.current = controller;
    setBatchReading(true); setBatchError(null); setBatchResult(null);
    try {
      const params = new URLSearchParams({ batchOffset: String(offset) });
      const response = await fetch(`/api/civilization/geospatial/diplomacy/unga81/country/${view.countryIso3}/submitted-page-leads?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Source review queue returned HTTP ${response.status}.`);
      const value = await response.json() as SubmittedPageBatchQueue;
      if (value.schemaVersion !== "civilization_unga81_submitted_page_leads/v2" ||
          value.query.countryIso3 !== view.countryIso3 || value.query.batchOffset !== offset) {
        throw new Error("Source review queue response invalid.");
      }
      if (!controller.signal.aborted) setBatchQueue(value);
    } catch (cause) {
      if (!controller.signal.aborted) setBatchError(cause instanceof Error ? cause.message : "Source review queue unavailable.");
    } finally { if (!controller.signal.aborted) setBatchReading(false); }
  };
  const readBatch = async (query: SubmittedPageBatchQueue["submittedPageBatchQueue"]["queries"][number]) => {
    batchAbortRef.current?.abort();
    const controller = new AbortController();
    batchAbortRef.current = controller;
    setBatchReading(true); setBatchError(null); setBatchResult(null);
    try {
      const response = await fetch(`/api/civilization/geospatial/diplomacy/unga81/country/${view.countryIso3}/submitted-pages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: query.sourceUrl, pages: query.pages }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Source page batch returned HTTP ${response.status}.`);
      const value = await response.json() as SubmittedPageBatchResponse;
      if (value.schemaVersion !== "civilization_unga81_submitted_page_batch/v1" ||
          value.query.countryIso3 !== view.countryIso3 || value.query.sourceUrl !== query.sourceUrl ||
          value.query.pages.join(",") !== query.pages.join(",")) {
        throw new Error("Source page batch response invalid.");
      }
      if (!controller.signal.aborted) setBatchResult(value);
    } catch (cause) {
      if (!controller.signal.aborted) setBatchError(cause instanceof Error ? cause.message : "Source pages unavailable.");
    } finally { if (!controller.signal.aborted) setBatchReading(false); }
  };
  return <details className="mt-1 rounded border border-white/10 p-1.5 text-[10px] text-slate-300">
    <summary className="cursor-pointer">Inspect a submitted PDF page · unreviewed text</summary>
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <select aria-label="Submitted PDF" value={sourceUrl} onChange={(event) => { requestSerial.current++; setReading(false); setSourceUrl(event.target.value); setResult(null); }} className="max-w-full rounded bg-slate-900 px-1 py-0.5">
        {sources.map((url) => <option key={url} value={url}>{url.split("/").at(-1) ?? url}</option>)}
      </select>
      <label>Page <input type="number" min={1} max={100} value={page} onChange={(event) => { requestSerial.current++; setReading(false); setPage(Number(event.target.value)); setResult(null); }} className="w-14 rounded bg-slate-900 px-1 py-0.5" /></label>
      <button type="button" disabled={reading || !Number.isInteger(page) || page < 1 || page > 100} onClick={() => void readPage()} className="rounded border border-emerald-300/40 px-2 py-0.5 disabled:opacity-50">{reading ? "Reading…" : "Read source page"}</button>
    </div>
    {error && <div className="mt-1 text-amber-100">{error}</div>}
    {result?.status === "unavailable" && <div className="mt-1 text-amber-100">Source text unavailable: {result.errorCode?.replaceAll("_", " ") ?? "unknown reason"}. <a href={result.source.sourcePageUrl} target="_blank" rel="noreferrer" className="underline">Open PDF page</a></div>}
    {result?.status === "available" && <div className="mt-1">
      <div><a href={result.source.sourcePageUrl} target="_blank" rel="noreferrer" className="underline">Official linked PDF, page {result.query.page}</a> · PDF hash matched acquisition manifest{result.textTruncated ? " · excerpt truncated" : ""}.</div>
      <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-slate-950/60 p-1.5 font-sans text-[11px] text-slate-100">{result.text}</pre>
    </div>}
    <details className="mt-2 border-t border-white/10 pt-1">
      <summary className="cursor-pointer">Review all indexed PDF pages in six-page groups</summary>
      <button type="button" disabled={batchReading} onClick={() => void loadBatchQueue(0)} className="mt-1 rounded border border-emerald-300/40 px-2 py-0.5 disabled:opacity-50">
        {batchReading && !batchQueue ? "Loading…" : "Load page queue"}
      </button>
      {batchError && <div role="status" className="mt-1 text-amber-100">{batchError}</div>}
      {batchQueue && <div className="mt-1">
        {batchQueue.source.indexStatus !== "current" && <p className="text-amber-100">The submitted-page index is stale; refresh its source manifest before treating this queue as current.</p>}
        <p>{batchQueue.submittedPageBatchQueue.totalBatchCount} source batches · {batchQueue.submittedPageBatchQueue.omittedBeforeCount} earlier · {batchQueue.submittedPageBatchQueue.omittedAfterCount} later. Cue pages appear first for navigation; uncued pages remain in the queue.</p>
        {batchQueue.submittedPageBatchQueue.queries.map((query) => <button key={`${query.sourceUrl}:${query.pages.join(",")}`} type="button" disabled={batchReading}
          onClick={() => void readBatch(query)} className="mr-1 mt-1 rounded border border-white/25 px-1.5 py-0.5 text-left disabled:opacity-50">
          {query.sourceUrl.split("/").at(-1)} · pp. {query.pages.join(", ")}{query.cuePageCount ? ` · ${query.cuePageCount} cue` : ""}{query.readerPageLimitReached ? " · 100-page reader limit" : ""}
        </button>)}
        {batchQueue.submittedPageBatchQueue.nextBatchOffset !== null && <button type="button" disabled={batchReading}
          onClick={() => void loadBatchQueue(batchQueue.submittedPageBatchQueue.nextBatchOffset!)} className="mt-1 rounded border border-cyan-300/40 px-2 py-0.5 disabled:opacity-50">Next source batches</button>}
      </div>}
      {batchResult && <div className="mt-2 rounded border border-white/15 p-1">
        <p>{batchResult.query.sourceUrl.split("/").at(-1)} · {batchResult.sourceStatus === "hash_matched_pdf" ? "PDF hash matched" : "source unavailable"} · page text unreviewed</p>
        {batchResult.pages.map((item) => <details key={item.page} className="mt-1 border-t border-white/10 pt-1">
          <summary className="cursor-pointer">PDF page {item.page} · {item.status === "available" ? item.textTruncated ? "text truncated" : "text available" : (item.errorCode ?? "unavailable").replaceAll("_", " ")}</summary>
          <a href={item.sourcePageUrl} target="_blank" rel="noreferrer" className="underline">Open exact PDF page</a>
          {item.status === "available" && <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-slate-950/60 p-1.5 font-sans text-[11px] text-slate-100">{item.text}</pre>}
        </details>)}
      </div>}
    </details>
    <p className="mt-1 text-amber-100">Submitted PDF wording shown here has not been curated into a country position or checked against delivered speech, translation, or external facts.</p>
  </details>;
}

type ProvisionalSegmentResponse = {
  status: "available" | "unavailable";
  source: { segmentUrl: string; meetingDate: string; indexedTextSha256: string };
  excerpt?: string; excerptOffset?: number; excerptEnd?: number;
  fullTextLength?: number; moreTextAvailable?: boolean; errorCode?: string;
};

function ProvisionalSegmentReader({ view }: { view: Unga81CountryView }) {
  const [sourceUrl, setSourceUrl] = useState(view.segments[0]?.sourceUrl ?? "");
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<ProvisionalSegmentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSerial = useRef(0);
  useEffect(() => () => { requestSerial.current++; }, []);
  if (!view.segments.length) return null;
  const readExcerpt = async (offset: number) => {
    const serial = ++requestSerial.current;
    setReading(true); setResult(null); setError(null);
    const params = new URLSearchParams({ sourceUrl, offset: String(offset), maxChars: "3000" });
    try {
      const response = await fetch(`/api/civilization/geospatial/diplomacy/unga81/country/${view.countryIso3}/provisional-segment?${params}`);
      if (!response.ok) throw new Error(`Provisional segment returned HTTP ${response.status}.`);
      const value = await response.json() as ProvisionalSegmentResponse;
      if (requestSerial.current === serial) setResult(value);
    } catch (cause) { if (requestSerial.current === serial) setError(cause instanceof Error ? cause.message : "Provisional segment unavailable."); }
    finally { if (requestSerial.current === serial) setReading(false); }
  };
  return <details className="mt-1 rounded border border-white/10 p-1.5 text-[10px] text-slate-300">
    <summary className="cursor-pointer">Inspect a provisional transcript segment · ASR unreviewed</summary>
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <select aria-label="Provisional speech segment" value={sourceUrl} onChange={(event) => { requestSerial.current++; setReading(false); setSourceUrl(event.target.value); setResult(null); }} className="max-w-full rounded bg-slate-900 px-1 py-0.5">
        {view.segments.map((segment, index) => <option key={`${segment.sourceUrl}:${index}`} value={segment.sourceUrl}>{segment.date} · segment {index + 1}</option>)}
      </select>
      <button type="button" disabled={reading} onClick={() => void readExcerpt(0)} className="rounded border border-cyan-300/40 px-2 py-0.5 disabled:opacity-50">{reading ? "Reading…" : "Read ASR excerpt"}</button>
    </div>
    {error && <div className="mt-1 text-amber-100">{error}</div>}
    {result?.status === "unavailable" && <div className="mt-1 text-amber-100">Provisional text unavailable: {result.errorCode?.replaceAll("_", " ") ?? "unknown reason"}. <a href={result.source.segmentUrl} target="_blank" rel="noreferrer" className="underline">Open UN segment</a></div>}
    {result?.status === "available" && <div className="mt-1">
      <div><a href={result.source.segmentUrl} target="_blank" rel="noreferrer" className="underline">UN transcript moment</a> · {result.source.meetingDate} · indexed text hash matched · characters {result.excerptOffset}–{result.excerptEnd} of {result.fullTextLength}.</div>
      <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-slate-950/60 p-1.5 font-sans text-[11px] text-slate-100">{result.excerpt}</pre>
      {result.moreTextAvailable && <button type="button" disabled={reading} onClick={() => void readExcerpt(result.excerptEnd ?? 0)} className="mt-1 rounded border border-cyan-300/40 px-2 py-0.5 disabled:opacity-50">Next excerpt</button>}
    </div>}
    <p className="mt-1 text-amber-100">Automated recognition may mishear words or speakers. This is not an official record or a reviewed country position.</p>
  </details>;
}

const provisionalDiscoveryTopics = ["peace and security", "trade and economic exchange",
  "infrastructure and connectivity", "climate and environment", "energy and minerals",
  "development finance", "food and water", "health and education", "technology and AI"] as const;
type TopicLeadResponse = { matchedAffiliations: number; moreResultsAvailable: boolean;
  leads: Array<{ countryIso3: string; label: string; totalKeywordSentenceMentions: number;
    officialPageUrls: string[]; segments: Array<{ sourceUrl: string; date: string; keywordSentenceMentions: number }> }> };

function TopicLeadDiscovery() {
  const [topic, setTopic] = useState<typeof provisionalDiscoveryTopics[number]>("infrastructure and connectivity");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TopicLeadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSerial = useRef(0);
  useEffect(() => () => { requestSerial.current++; }, []);
  const findLeads = async () => {
    const serial = ++requestSerial.current;
    setLoading(true); setResult(null); setError(null);
    const params = new URLSearchParams({ topic, maxCountries: "10" });
    try {
      const response = await fetch(`/api/civilization/geospatial/diplomacy/unga81/topic-leads?${params}`);
      if (!response.ok) throw new Error(`Topic lead index returned HTTP ${response.status}.`);
      const value = await response.json() as TopicLeadResponse;
      if (requestSerial.current === serial) setResult(value);
    } catch (cause) { if (requestSerial.current === serial) setError(cause instanceof Error ? cause.message : "Topic leads unavailable."); }
    finally { if (requestSerial.current === serial) setLoading(false); }
  };
  return <details className="mt-2 rounded border border-white/15 p-1.5 text-[10px] text-slate-300">
    <summary className="cursor-pointer">Find unreviewed transcript source leads</summary>
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <select aria-label="Transcript topic" value={topic} onChange={(event) => { requestSerial.current++; setLoading(false); setTopic(event.target.value as typeof topic); setResult(null); }} className="max-w-full rounded bg-slate-900 px-1 py-0.5">
        {provisionalDiscoveryTopics.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <button type="button" disabled={loading} onClick={() => void findLeads()} className="rounded border border-cyan-300/40 px-2 py-0.5 disabled:opacity-50">{loading ? "Finding…" : "Find source leads"}</button>
    </div>
    {error && <div className="mt-1 text-amber-100">{error}</div>}
    {result && <div className="mt-1">
      <div>{result.matchedAffiliations} affiliation leads in the indexed ASR; showing {result.leads.length}{result.moreResultsAvailable ? " highest-count leads" : " leads"}.</div>
      {result.leads.map((lead) => <div key={lead.countryIso3} className="mt-1 border-t border-white/10 pt-1">
        <strong>{lead.label} ({lead.countryIso3})</strong> · {lead.totalKeywordSentenceMentions} automated sentence matches · <a href={lead.segments[0]?.sourceUrl} target="_blank" rel="noreferrer" className="underline">indexed segment</a>
        {lead.officialPageUrls[0] && <> · <a href={lead.officialPageUrls[0]} target="_blank" rel="noreferrer" className="underline">official delegation page</a></>}
      </div>)}
    </div>}
    <p className="mt-1 text-amber-100">Keyword counts are unreviewed leads. They do not establish a country's position, priority, agreement, or view of another country.</p>
  </details>;
}

type PairTopicPassagesResponse = {
  schemaVersion: "civilization_unga81_pair_topic_passages/v1";
  countries: Array<{ countryIso3: string; indexedMatchingSegments: number; additionalSegmentsNotRead: number;
    officialPageUrls: string[]; selectedSegments: Array<{ status: "available" | "unavailable";
      sourceUrl: string; date: string; indexedKeywordSentenceMentions: number; errorCode?: string;
      passages?: Array<{ sentenceIndex: number; excerpt: string; truncated: boolean }>;
      morePassagesAvailable?: boolean }> }>;
};

function PairTopicPassages({ firstIso3, secondIso3 }: { firstIso3: string; secondIso3: string }) {
  const [topic, setTopic] = useState<typeof provisionalDiscoveryTopics[number]>("infrastructure and connectivity");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PairTopicPassagesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSerial = useRef(0);
  useEffect(() => () => { requestSerial.current++; }, []);
  const inspect = async () => {
    const serial = ++requestSerial.current;
    setLoading(true); setResult(null); setError(null);
    const params = new URLSearchParams({ topic, maxSegmentsPerCountry: "1", maxPassagesPerSegment: "3" });
    try {
      const response = await fetch(`/api/civilization/geospatial/diplomacy/unga81/pair/${firstIso3}/${secondIso3}/topic-passages?${params}`);
      if (!response.ok) throw new Error(`Pair source reader returned HTTP ${response.status}.`);
      const value = await response.json() as PairTopicPassagesResponse;
      if (value.schemaVersion !== "civilization_unga81_pair_topic_passages/v1") throw new Error("Pair source receipt version changed.");
      if (requestSerial.current === serial) setResult(value);
    } catch (cause) { if (requestSerial.current === serial) setError(cause instanceof Error ? cause.message : "Pair source passages unavailable."); }
    finally { if (requestSerial.current === serial) setLoading(false); }
  };
  return <details className="mt-2 rounded border border-white/15 p-1.5 text-[10px] text-slate-300">
    <summary className="cursor-pointer">Inspect unreviewed passages for this pair</summary>
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <select aria-label="Pair transcript topic" value={topic} onChange={(event) => { requestSerial.current++; setLoading(false); setTopic(event.target.value as typeof topic); setResult(null); }} className="max-w-full rounded bg-slate-900 px-1 py-0.5">
        {provisionalDiscoveryTopics.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <button type="button" disabled={loading} onClick={() => void inspect()} className="rounded border border-cyan-300/40 px-2 py-0.5 disabled:opacity-50">{loading ? "Checking sources…" : "Read passages"}</button>
    </div>
    {error && <div className="mt-1 text-amber-100">{error}</div>}
    {result?.countries.map((country) => <div key={country.countryIso3} className="mt-1 border-t border-white/10 pt-1">
      <strong>{country.countryIso3}</strong> · {country.indexedMatchingSegments} indexed matching segment{country.indexedMatchingSegments === 1 ? "" : "s"}{country.additionalSegmentsNotRead ? ` · ${country.additionalSegmentsNotRead} not read` : ""}.
      {country.officialPageUrls[0] && <> <a href={country.officialPageUrls[0]} target="_blank" rel="noreferrer" className="underline">Official delegation page</a>.</>}
      {country.selectedSegments.map((segment) => <div key={segment.sourceUrl} className="mt-1">
        <a href={segment.sourceUrl} target="_blank" rel="noreferrer" className="underline">Provisional segment · {segment.date}</a> · {segment.status === "available" ? `${segment.indexedKeywordSentenceMentions} verified keyword sentence matches` : `unavailable (${segment.errorCode ?? "source changed"})`}.
        {segment.passages?.map((passage) => <div key={passage.sentenceIndex} className="mt-0.5 border-l border-cyan-300/30 pl-1">Sentence {passage.sentenceIndex + 1}: “{passage.excerpt}”{passage.truncated ? " [window]" : ""}</div>)}
        {segment.morePassagesAvailable && <div>Additional matching sentences omitted by the response cap.</div>}
      </div>)}
    </div>)}
    <p className="mt-1 text-amber-100">Automated recognition and affiliation are unverified. Keyword windows are source leads, not reviewed national positions, responses to each other, priorities, or agreement. Check submitted PDFs and the official record.</p>
  </details>;
}

function PositionBubble({ view }: { view: Unga81CountryView }) {
  const assertions = view.reviewedBrief?.assertions ?? [];
  const citedPoint = (assertion: typeof assertions[number]) => <li key={assertion.id} className="border-t border-white/10 pt-1">
    <span className="text-[10px] text-emerald-100">{assertion.claimType.replaceAll("_", " ")} · </span>
    <a href={assertion.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-emerald-200/60 underline-offset-2">{assertion.text}</a>
    <div className="text-[10px] text-slate-400">Submitted PDF p. {assertion.sourcePage} · {assertion.temporalScope}</div>
    {assertion.uncertainty && <div className="text-[10px] text-amber-100/90">{assertion.uncertainty}</div>}
  </li>;
  return <div className="rounded-lg border border-emerald-200/25 bg-emerald-100/5 p-2">
    <div className="flex items-start gap-2">
      {reviewFace && <img src={reviewFace} alt="" className="h-7 w-7 shrink-0" />}
      <div className="min-w-0">
        <div className="font-semibold text-emerald-100">{view.countryName ?? view.countryIso3}</div>
        <div className="text-[10px] text-slate-400">Selected UN General Debate assertions{view.reviewedBrief?.speechDate ? ` · ${view.reviewedBrief.speechDate}` : ""}</div>
        {view.reviewedBrief && <div className="text-[10px] text-slate-400">{view.reviewedBrief.speaker} · {view.reviewedBrief.sourceLanguage}</div>}
      </div>
    </div>
    {assertions.length > 0 ? <>
      <ul className="mt-1 space-y-1 leading-snug text-slate-100">{assertions.slice(0, 3).map(citedPoint)}</ul>
      {assertions.length > 3 && <details className="mt-1 text-[10px] text-slate-300">
        <summary className="cursor-pointer">{assertions.length - 3} more selected cited point{assertions.length - 3 === 1 ? "" : "s"}</summary>
        <ul className="mt-1 space-y-1 text-xs text-slate-100">{assertions.slice(3).map(citedPoint)}</ul>
      </details>}
      <p className="mt-1 text-[10px] text-slate-400">Selective submitted-statement review; this is not the full national position or verified delivered wording.</p>
    </> : <div className="mt-1 text-amber-100">
      A source-checked position is not available for this delegation yet.
      {view.submittedStatements[0] && <p className="mt-1 text-[10px] text-slate-300">
        <a href={view.submittedStatements[0].pageUrl} target="_blank" rel="noreferrer" className="underline">Official submitted-statement page</a> is indexed; its content has not been admitted as a reviewed position here.
      </p>}
      {!view.submittedStatements.length && view.segments[0]?.sourceUrl && <p className="mt-1 text-[10px] text-slate-300">
        <a href={view.segments[0].sourceUrl} target="_blank" rel="noreferrer" className="underline">Provisional transcript moment</a> is unreviewed and cannot establish the delegation's position.
      </p>}
    </div>}
  </div>;
}

function PairDirectionBubble({ direction, countryView }: { direction: PairGlanceUi["directions"][number]; countryView?: Unga81CountryView }) {
  return <div className="rounded-lg border border-emerald-200/25 bg-emerald-100/5 p-2">
    <div className="flex items-center gap-2">
      {reviewFace && <img src={reviewFace} alt="" className="h-7 w-7 shrink-0" />}
      <div><div className="font-semibold text-emerald-100">{direction.countryName ?? direction.countryIso3}</div>
        <div className="text-[10px] text-slate-400">{direction.leadBasis === "explicit_counterpart_reference_in_selected_issue"
          ? `Reviewed issue statement naming ${direction.counterpartIso3}`
          : direction.leadBasis === "explicit_counterpart_reference_outside_selected_issue"
            ? `Reviewed statement naming ${direction.counterpartIso3}; selected issue position unavailable`
            : direction.positionStatus === "selected_issue_assertion" ? "Reviewed position on this issue"
              : direction.positionStatus === "general_reviewed_assertion_only" ? "General reviewed statement; issue position unavailable"
                : "Reviewed statement unavailable"}</div></div>
    </div>
    {direction.assertion ? <>
      <p className="mt-1 leading-snug"><a href={direction.assertion.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-emerald-200/60 underline-offset-2">{direction.assertion.text}</a></p>
      <p className="mt-1 text-[10px] text-slate-400">{direction.assertion.speaker} · {direction.assertion.speechDate} · submitted PDF p. {direction.assertion.sourcePage} · review {direction.assertion.reviewRevision}</p>
      {direction.sourceLanguage && <p className="text-[10px] text-slate-400">{direction.sourceLanguage}</p>}
      {direction.assertion.deliveryAlignment === "wording_discrepancy" && <p className="mt-1 text-[10px] text-amber-100">Delivered wording needs review: {direction.assertion.deliveryNote}</p>}
    </> : <div className="mt-1 text-amber-100">A source-checked assertion has not been published in this panel corpus.
      {countryView?.submittedStatements[0] && <p className="mt-1 text-[10px] text-slate-300">
        <a href={countryView.submittedStatements[0].pageUrl} target="_blank" rel="noreferrer" className="underline">Official submitted-statement page</a> is indexed but has no selected reviewed assertion for this comparison.
      </p>}
    </div>}
    {direction.counterpartReference.assertion?.id === direction.assertion?.id && <p className="mt-1 text-[10px] text-cyan-100">Explicit reference to {direction.counterpartIso3}: this cited issue statement names the counterpart or bilateral pair.</p>}
    {direction.counterpartReference.assertion && direction.counterpartReference.assertion.id !== direction.assertion?.id &&
      <details className="mt-1 text-[10px] text-cyan-100"><summary className="cursor-pointer">{direction.counterpartReference.status === "issue_specific_reviewed_reference"
        ? `Explicit issue reference to ${direction.counterpartIso3}` : `General reviewed reference to ${direction.counterpartIso3}`}</summary>
        <a href={direction.counterpartReference.assertion.sourceUrl} target="_blank" rel="noreferrer" className="underline">{direction.counterpartReference.assertion.text} (submitted PDF p. {direction.counterpartReference.assertion.sourcePage})</a>
        {direction.counterpartReference.assertion.deliveryAlignment === "wording_discrepancy" && <span className="text-amber-100"> · delivered wording needs review</span>}
      </details>}
    {!direction.counterpartReference.assertion && <p className="mt-1 text-[10px] text-slate-400">No explicit reference to {direction.counterpartIso3} is tagged in this selective reviewed brief. The issue point above is not a bilateral assessment.</p>}
    <p className="mt-1 text-[10px] text-slate-400">The other government's response, current bilateral assessment, and public sentiment remain unverified.</p>
  </div>;
}

export function CivilizationDiplomacyOverlay({ hoveredIso3, selectedIso3s, onToggleCountry, onCompareOptions, comparingOptions = false,
  onHoverCardEnter, onHoverCardLeave }: {
  hoveredIso3: string | null;
  selectedIso3s: string[];
  onToggleCountry: (iso3: string) => void;
  onCompareOptions?: () => void;
  comparingOptions?: boolean;
  onHoverCardEnter: () => void;
  onHoverCardLeave: () => void;
}) {
  const focus = selectedIso3s.length > 0 ? selectedIso3s.slice(0, 2) : hoveredIso3 ? [hoveredIso3] : [];
  const key = focus.join(",");
  const [views, setViews] = useState<Unga81CountryView[]>([]);
  const [hoverPreview, setHoverPreview] = useState<Unga81CountryView | null>(null);
  const [hoverPreviewUnavailable, setHoverPreviewUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countryLoadError, setCountryLoadError] = useState(false);
  const [trade, setTrade] = useState<TradePair | null>(null);
  const [bilateral, setBilateral] = useState<BilateralPair | null>(null);
  const [relationshipNetwork, setRelationshipNetwork] = useState<RelationshipNetworkUi | null>(null);
  const [issueComparisonResult, setIssueComparison] = useState<IssueComparisonUi | null>(null);
  const [pairGlanceResult, setPairGlance] = useState<PairGlanceUi | null>(null);
  const [glanceLoading, setGlanceLoading] = useState(false);
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueId, setIssueId] = useState<"regional_connectivity" | "natural_system_cooperation" | "humanitarian_cooperation">("regional_connectivity");
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeYear, setTradeYear] = useState(2024);
  const issueComparison = issueComparisonResult?.query.issueId === issueId &&
    issueComparisonResult.query.firstCountryIso3 === focus[0] &&
    issueComparisonResult.query.secondCountryIso3 === focus[1] ? issueComparisonResult : null;
  const pairGlance = pairGlanceResult?.query.issueId === issueId &&
    pairGlanceResult.query.firstCountryIso3 === focus[0] &&
    pairGlanceResult.query.secondCountryIso3 === focus[1] ? pairGlanceResult : null;
  const visibleViews = views.length === focus.length && views.every((view, index) => view.countryIso3 === focus[index]) ? views : [];
  const previewIso3 = selectedIso3s.length > 0 && hoveredIso3 && !selectedIso3s.includes(hoveredIso3)
    ? hoveredIso3 : null;
  const visibleHoverPreview = hoverPreview?.countryIso3 === previewIso3 ? hoverPreview : null;

  useEffect(() => {
    if (!previewIso3) { setHoverPreview(null); setHoverPreviewUnavailable(false); return; }
    const cached = countryCache.get(previewIso3);
    if (cached?.schemaVersion === "civilization_unga81_country_evidence/v12") {
      setHoverPreview(cached);
      setHoverPreviewUnavailable(false);
      return;
    }
    const controller = new AbortController();
    setHoverPreview(null);
    setHoverPreviewUnavailable(false);
    const timer = window.setTimeout(() => {
      void fetch(`/api/civilization/geospatial/diplomacy/unga81/country/${previewIso3}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("country_evidence_unavailable")))
        .then((record: Unga81CountryView) => {
          if (record.schemaVersion !== "civilization_unga81_country_evidence/v12" || record.countryIso3 !== previewIso3) {
            throw new Error("country_evidence_version_mismatch");
          }
          if (!controller.signal.aborted) { countryCache.set(previewIso3, record); setHoverPreview(record); }
        })
        .catch(() => { if (!controller.signal.aborted) setHoverPreviewUnavailable(true); });
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [previewIso3]);

  useEffect(() => {
    if (!key) { setViews([]); setCountryLoadError(false); return; }
    const controller = new AbortController();
    setCountryLoadError(false);
    const timer = window.setTimeout(() => {
    setLoading(true);
    void Promise.all(focus.map(async (iso3) => {
      const cached = countryCache.get(iso3);
      if (cached?.schemaVersion === "civilization_unga81_country_evidence/v12") return cached;
      const response = await fetch(`/api/civilization/geospatial/diplomacy/unga81/country/${iso3}`, { signal: controller.signal });
      if (!response.ok) throw new Error("country_evidence_unavailable");
      const record = await response.json() as Unga81CountryView;
      if (record.schemaVersion !== "civilization_unga81_country_evidence/v12") throw new Error("country_evidence_version_mismatch");
      countryCache.set(iso3, record);
      return record;
    })).then((records) => { setViews(records); setCountryLoadError(false); }).catch(() => {
      if (!controller.signal.aborted) { setViews([]); setCountryLoadError(true); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key]);

  useEffect(() => {
    if (focus.length !== 2) { setBilateral(null); return; }
    const controller = new AbortController();
    setBilateral(null);
    void fetch(`/api/civilization/geospatial/diplomacy/unga81/pair/${focus[0]}/${focus[1]}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("pair_evidence_unavailable")))
      .then((result: BilateralPair) => setBilateral(result))
      .catch(() => { if (!controller.signal.aborted) setBilateral(null); });
    return () => controller.abort();
  }, [key]);

  useEffect(() => {
    if (focus.length !== 2) { setIssueComparison(null); setIssueLoading(false); return; }
    const controller = new AbortController();
    setIssueComparison(null);
    setIssueLoading(true);
    void fetch(`/api/civilization/geospatial/diplomacy/issues/${issueId}/${focus[0]}/${focus[1]}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("issue_comparison_unavailable")))
      .then((result: IssueComparisonUi) => {
        if (result.schemaVersion === "civilization_diplomatic_issue_comparison/v37") setIssueComparison(result);
      })
      .catch(() => { if (!controller.signal.aborted) setIssueComparison(null); })
      .finally(() => { if (!controller.signal.aborted) setIssueLoading(false); });
    return () => controller.abort();
  }, [key, issueId]);

  useEffect(() => {
    if (focus.length !== 2) { setPairGlance(null); setGlanceLoading(false); return; }
    const controller = new AbortController();
    setPairGlance(null);
    setGlanceLoading(true);
    void fetch(`/api/civilization/geospatial/diplomacy/glance/${issueId}/${focus[0]}/${focus[1]}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("pair_glance_unavailable")))
      .then((result: PairGlanceUi) => {
        if (result.schemaVersion === "civilization_diplomatic_pair_glance/v18") setPairGlance(result);
      })
      .catch(() => { if (!controller.signal.aborted) setPairGlance(null); })
      .finally(() => { if (!controller.signal.aborted) setGlanceLoading(false); });
    return () => controller.abort();
  }, [key, issueId]);

  useEffect(() => {
    if (focus.length !== 2) { setRelationshipNetwork(null); setTrade(null); return; }
    const controller = new AbortController();
    setRelationshipNetwork(null);
    setTrade(null);
    setTradeLoading(true);
    void fetch(`/api/civilization/geospatial/diplomacy/relationships/${focus[0]}/${focus[1]}/${tradeYear}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("relationship_network_unavailable")))
      .then((result: RelationshipNetworkUi) => {
        if (result.schemaVersion === "civilization_diplomatic_relationship_network/v9") {
          setRelationshipNetwork(result);
          setTrade(result.trade);
        }
      })
      .catch(() => { if (!controller.signal.aborted) { setRelationshipNetwork(null); setTrade(null); } })
      .finally(() => { if (!controller.signal.aborted) setTradeLoading(false); });
    return () => controller.abort();
  }, [key, tradeYear]);

  if (!key) return null;
  if (selectedIso3s.length === 0) return <section aria-label="Hovered country UN position" onMouseEnter={onHoverCardEnter} onMouseLeave={onHoverCardLeave} className="absolute bottom-12 right-3 z-[9] max-h-[min(45%,24rem)] w-[min(21rem,calc(100%-1.5rem))] overflow-y-auto overscroll-contain rounded-lg border border-emerald-200/40 bg-[#06120f]/95 p-2 text-xs text-slate-100 shadow-2xl backdrop-blur">
    {visibleViews[0] ? <PositionBubble view={visibleViews[0]} /> : <div className="text-slate-300">{loading ? "Loading cited UN position…" : countryLoadError ? `${hoveredIso3} · country evidence could not be loaded` : `${hoveredIso3} · country evidence pending`}</div>}
    <p className="mt-1 text-[10px] text-slate-400">Click the country to keep it selected. Select two to compare cited positions.</p>
  </section>;
  return <section aria-label="UN General Debate country evidence" onMouseEnter={onHoverCardEnter} onMouseLeave={onHoverCardLeave} className="absolute bottom-12 right-3 z-[9] max-h-[43%] w-[min(22rem,calc(100%-1.5rem))] overflow-y-auto rounded-lg border border-emerald-200/40 bg-[#06120f]/95 p-3 text-xs text-slate-100 shadow-2xl backdrop-blur">
    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100"><span aria-hidden="true">💬</span>{focus.length === 2 ? "Compare stated priorities" : "Country statement"}</div>
    {previewIso3 && <div className="mt-1 rounded border border-emerald-200/30 bg-emerald-100/5 p-1.5 text-[10px]" aria-label={`Hovered ${previewIso3} statement preview`}>
      <div className="font-semibold text-emerald-100">Hovering {visibleHoverPreview?.countryName ?? previewIso3} · selected comparison stays open</div>
      {visibleHoverPreview?.reviewedBrief?.assertions[0] ? <>
        <a href={visibleHoverPreview.reviewedBrief.assertions[0].sourceUrl} target="_blank" rel="noreferrer" className="mt-0.5 block underline">
          {visibleHoverPreview.reviewedBrief.assertions[0].text}
        </a>
        <div className="text-slate-400">{visibleHoverPreview.reviewedBrief.speechDate} · submitted PDF p. {visibleHoverPreview.reviewedBrief.assertions[0].sourcePage} · 1 of {visibleHoverPreview.reviewedBrief.assertions.length} selected reviewed points; full position and delivery unverified</div>
      </> : <div className="text-amber-100">{hoverPreviewUnavailable ? "Country evidence unavailable." : visibleHoverPreview
        ? <>
          No source-checked position is available for this delegation yet.
          {visibleHoverPreview.submittedStatements[0] && <div className="mt-0.5 text-slate-300">
            <a href={visibleHoverPreview.submittedStatements[0].pageUrl} target="_blank" rel="noreferrer" className="underline">Official delegation page</a>
            {visibleHoverPreview.submittedStatements[0].pdfUrls[0] && <> · <a href={visibleHoverPreview.submittedStatements[0].pdfUrls[0]} target="_blank" rel="noreferrer" className="underline">submitted PDF</a></>}
            {" "}· source review pending
          </div>}
          {!visibleHoverPreview.submittedStatements.length && visibleHoverPreview.segments[0]?.sourceUrl && <div className="mt-0.5 text-slate-300">
            <a href={visibleHoverPreview.segments[0].sourceUrl} target="_blank" rel="noreferrer" className="underline">Provisional transcript moment</a> · unreviewed affiliation
          </div>}
        </> : "Loading cited position…"}</div>}
      <button type="button" onClick={() => onToggleCountry(previewIso3)} className="mt-1 underline">Select {previewIso3} for comparison</button>
    </div>}
    {selectedIso3s.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{selectedIso3s.map((iso3) => <button key={iso3} type="button" onClick={() => onToggleCountry(iso3)} className="rounded border border-white/25 px-1.5 py-0.5 text-[10px] text-slate-200" aria-label={`Remove ${iso3} from comparison`}>{iso3} ×</button>)}</div>}
    <p className="mt-1 text-[11px] text-slate-300">81st UN General Debate · reviewed submitted briefs where available · provisional transcript is unreviewed</p>
    {focus.length === 2 && <div className="mt-1 flex items-center gap-2 rounded border border-cyan-200/25 bg-cyan-100/5 p-1.5 text-[10px] text-cyan-100">
      {resolveMoodAsset(pairGlance?.interactionCue.assetMood ?? "question")?.sources[0] &&
        <img src={resolveMoodAsset(pairGlance?.interactionCue.assetMood ?? "question")?.sources[0]} alt="" className="h-6 w-6 shrink-0" />}
      <span><strong className="font-semibold">Dated public interaction · </strong>{pairGlance?.interactionCue.record ? <>
        <a href={pairGlance.interactionCue.record.sourceUrl} target="_blank" rel="noreferrer" className="underline">{pairGlance.interactionCue.record.kind.replaceAll("_", " ")} · {pairGlance.interactionCue.record.eventDate}</a>
        {pairGlance.interactionCue.record.sourceUrls.slice(1).map((sourceUrl, index) => <a key={sourceUrl} href={sourceUrl} target="_blank" rel="noreferrer" className="ml-1 underline">Source {index + 2}</a>)}
        {` · ${pairGlance.interactionCue.record.parties.join(" + ")} · ${pairGlance.interactionCue.record.legalStatus.replaceAll("_", " ")}. `}
        The face marks this record only. Current cooperation, trust, and permission remain unassessed.
      </> : pairGlance ? "No joint public record in this selected evidence. The question face marks a review gap; it does not mean opposition."
        : "Reading dated relationship evidence…"}</span>
    </div>}
    {focus.length === 2 && <label className="mt-2 block text-[10px] text-slate-300">Compare on
      <select value={issueId} onChange={(event) => setIssueId(event.target.value as typeof issueId)} className="mt-1 w-full rounded border border-white/20 bg-[#10251f] p-1 text-slate-100">
        <option value="regional_connectivity">Regional connectivity</option>
        <option value="natural_system_cooperation">Water, climate, and natural systems</option>
        <option value="humanitarian_cooperation">Missing persons, mine action, and trust</option>
      </select>
    </label>}
    {focus.length === 1 && loading && <p className="mt-2 text-slate-300">Loading statement evidence…</p>}
    {focus.length === 1 && countryLoadError && <p className="mt-2 text-amber-100">Country evidence could not be loaded; no position assessment was made.</p>}
    {focus.length === 1 && visibleViews[0] && <div className="mt-2"><PositionBubble view={visibleViews[0]} /></div>}
    {focus.length === 2 && <div className="mt-2 grid gap-2">
      {pairGlance?.directions.map((direction) => <PairDirectionBubble key={direction.countryIso3} direction={direction}
        countryView={visibleViews.find((view) => view.countryIso3 === direction.countryIso3)} />)}
      {!pairGlance && <>
        <p className="text-slate-300">{glanceLoading ? "Loading cited pair briefing…" : "Pair briefing unavailable; showing the separate country source reviews."}</p>
        {visibleViews.map((view) => <PositionBubble key={view.countryIso3} view={view} />)}
      </>}
    </div>}
    {focus.length === 2 && <div className="mt-2 rounded border border-cyan-200/25 bg-cyan-100/5 p-2 text-[11px]">
      <div className="font-semibold text-cyan-100">Current evidence and possible cooperation</div>
      {pairGlance?.sharedTopic ? <>
        <p className="mt-1 text-slate-200"><strong>Current evidence · </strong>{pairGlance.sharedTopic.label}. The statements above are selected, dated public claims; the relationship itself remains unassessed.</p>
        {pairGlance.sharedTopic.comparisonBasis === "parallel_reviewed_topic_inventory" &&
          <p className="mt-1 text-amber-100">Parallel public topics only; bilateral relevance and agreement have not been assessed.</p>}
        {pairGlance.sharedTopic.sharedPublicTopic && <p className="mt-1 text-slate-200">Shared public topic: {pairGlance.sharedTopic.sharedPublicTopic}</p>}
        {pairGlance.sharedTopic.differenceInSubmittedClaims && <p className="mt-1 text-slate-200">Different claims: {pairGlance.sharedTopic.differenceInSubmittedClaims}</p>}
        {pairGlance.sharedTopic.directTensionStatus === "reciprocal_security_allegations_unadjudicated" &&
          <p className="mt-1 text-amber-100">Both speakers make security allegations. The panel has not verified the events or judged responsibility.</p>}
        <p className="mt-1 text-cyan-100"><strong>Possible cooperation to examine · </strong>{pairGlance.sharedTopic.unansweredQuestion}</p>
        <p className="mt-1 text-[10px] text-slate-400">The cited statements show a topic for discussion; agreement, current policy, and each side's view of the other remain unverified.</p>
      </> : <p className="mt-1 text-amber-100">{glanceLoading ? "Reading the cited pair briefing…" : "No two-sided reviewed position is available for this issue and pair yet. A cooperation proposal needs source review from both sides."}</p>}
    </div>}
    {focus.length === 2 && onCompareOptions && <button type="button" onClick={onCompareOptions} disabled={comparingOptions}
      className="mt-2 w-full rounded border border-violet-300/50 px-2 py-1 text-left text-[11px] font-semibold text-violet-100 disabled:opacity-50">
      {comparingOptions ? "Comparing evidence…" : "Explore conditional cooperation options"}
    </button>}
    {pairGlance && <details className="mt-2 rounded border border-white/15 p-1.5 text-[10px] text-slate-300">
      <summary className="cursor-pointer">UN statement review coverage · {pairGlance.corpusCoverage.delegationPagesWithSelectedReviewedBrief}/{pairGlance.corpusCoverage.indexedDelegationPages} delegation pages have selected briefs</summary>
      <p className="mt-1">{pairGlance.corpusCoverage.selectedReviewedAssertionCount} selected assertions across the corpus; no full-speech assertion review issued. {pairGlance.corpusCoverage.interpretation}</p>
      {pairGlance.corpusCoverage.selectedIssueTopics.map((topic) => <p key={topic.id} className="mt-1">
        {topic.label}: {topic.countriesWithAdmittedSelectedAssertionsCount}/{topic.indexedDelegationPageCount} indexed delegations have a selected, hash-matched assertion.
        {" "}For this pair: {topic.selectedPairCountriesWithAdmittedAssertions.join(" + ") || "neither in the selected review"}. This count does not establish complete positions or bilateral agreement.
      </p>)}
      {pairGlance.corpusCoverage.selectedCountries.map((country) => <div key={country.countryIso3} className="mt-1 border-t border-white/10 pt-1">
        <strong>{country.countryIso3}</strong> · {country.reviewedAssertionCount} selected reviewed assertion{country.reviewedAssertionCount === 1 ? "" : "s"} · next: {country.nextReviewStage.replaceAll("_", " ")}.
        <div>{country.nextReviewReason}</div>
        {country.dateCrosscheck.submittedDocumentDateStatus === "differs_from_official_page" &&
          <div className="text-amber-100">Date conflict: submitted document {country.dateCrosscheck.submittedDocumentDate}; official page {country.dateCrosscheck.officialPageDates.join(", ")}; provisional transcript {country.dateCrosscheck.provisionalTranscriptDates.join(", ") || "unavailable"}. {country.dateCrosscheck.submittedDocumentDatePageUrl && <a href={country.dateCrosscheck.submittedDocumentDatePageUrl} target="_blank" rel="noreferrer" className="underline">Submitted PDF page</a>}</div>}
        {country.sourceUrls[0] && <a href={country.sourceUrls[0]} target="_blank" rel="noreferrer" className="underline">Official source or review context</a>}
      </div>)}
    </details>}
    <TopicLeadDiscovery />
    {focus.length === 2 && <PairTopicPassages key={`${focus[0]}:${focus[1]}`} firstIso3={focus[0]} secondIso3={focus[1]} />}
    <details className="mt-2 border-t border-white/15 pt-2">
      <summary className="cursor-pointer font-semibold text-emerald-100">Country sources and review status</summary>
    {!loading && visibleViews.map((view) => <div key={view.countryIso3} className="mt-2 border-t border-white/15 pt-2">
      <div className="font-semibold text-white">{view.countryName ?? view.countryIso3}</div>
      <div className="text-slate-400">{view.coverage.substantiveSegments} substantive transcript segment{view.coverage.substantiveSegments === 1 ? "" : "s"} · ASR unreviewed</div>
      <div className="text-[10px] text-slate-400">{view.sourceCrosswalk.dateAlignment === "same_day_affiliation_only"
        ? "Official page and ASR affiliation share a date; speaker match pending"
        : `Source crosswalk: ${view.sourceCrosswalk.dateAlignment.replaceAll("_", " ")}`}</div>
      {view.sourceCrosswalk.submittedDocumentDateReview.status === "differs_from_official_page" &&
        <div className="mt-1 text-[10px] text-amber-100">Date conflict: submitted document {view.sourceCrosswalk.submittedDocumentDateReview.date}; official page {view.sourceCrosswalk.officialDates.join(", ")}; provisional transcript {view.sourceCrosswalk.provisionalDates.join(", ") || "unavailable"}. {view.sourceCrosswalk.submittedDocumentDateReview.sourcePageUrl && <a href={view.sourceCrosswalk.submittedDocumentDateReview.sourcePageUrl} target="_blank" rel="noreferrer" className="underline">Submitted PDF page</a>}</div>}
      {view.submittedStatements.map((statement) => <div key={statement.pageUrl} className="mt-1 text-slate-300">
        <a href={statement.pageUrl} target="_blank" rel="noreferrer" className="underline">Official General Debate page</a>
        {statement.pdfUrls.length > 0 && <> · <a href={statement.pdfUrls.find((url) => /_en(?:_|\.)/i.test(url)) ?? statement.pdfUrls[0]} target="_blank" rel="noreferrer" className="underline">submitted statement PDF</a></>}
        {statement.pdfUrls.length === 0 && <> · PDF not linked</>}
        <div className="text-[10px] text-slate-400">{statement.officialSpeakerDescription} · ASR speaker match pending</div>
      </div>)}
      <SubmittedPageReader key={view.countryIso3} view={view} />
      <ProvisionalSegmentReader key={`${view.countryIso3}:asr`} view={view} />
      {view.submittedTextQuality.some((source) => source.status === "unusable" || source.status === "degraded_review_needed") &&
        <div className="mt-1 text-[10px] text-amber-100">PDF extraction is incomplete; only pages cited in a reviewed brief have been source checked.</div>}
      {view.submittedOcrCandidates.length > 0 && <div className="mt-1 text-[10px] text-amber-100">OCR candidate exists for further page review; OCR wording alone is unverified.</div>}
      {view.topicMentions.length > 0 && <div className="mt-1 text-slate-300">Automated mentions: {view.topicMentions.slice(0, 3).map((topic) => `${topic.topic} (${topic.sentenceMentions})`).join(" · ")}</div>}
      {view.reviewedBrief && <div className="mt-2 rounded border border-emerald-200/25 bg-emerald-200/5 p-2">
        <div className="font-medium text-emerald-100">Source-checked submitted brief · {view.reviewedBrief.speaker}</div>
        <div className="text-[10px] text-slate-400">{view.reviewedBrief.speakerAttributionSource === "official_page_only"
          ? "Speaker named on official page; submitted PDF names the delegation or gives no speaker byline. Recording match pending."
          : "Speaker named in submitted PDF and official page; recording match pending."}</div>
        <div className="text-[10px] text-slate-400">{view.reviewedBrief.sourceLanguage}</div>
        <ul className="mt-1 space-y-1">{view.reviewedBrief.assertions.map((assertion) => <li key={assertion.id}>
          <a href={assertion.sourceUrl} target="_blank" rel="noreferrer" className="underline">{assertion.text}</a>
          <span className="text-slate-400"> · PDF p. {assertion.sourcePage}</span>
        </li>)}</ul>
        <details className="mt-1 text-slate-300"><summary className="cursor-pointer">Review limits for these statements</summary>
          <ul className="mt-1 space-y-1 pl-3">{view.reviewedBrief.assertions.map((assertion) => <li key={assertion.id}>
            <span className="text-slate-400">{assertion.claimType.replaceAll("_", " ")} · </span>{assertion.uncertainty}
          </li>)}</ul>
        </details>
        {view.reconciliation?.assertions.filter((item) => item.alignment === "wording_discrepancy").map((item) => <p key={item.assertionId} className="mt-1 rounded border border-amber-300/35 bg-amber-300/10 p-1.5 text-amber-100">
          Recording or official meeting record review needed before relying on exact route wording: {item.note} <a href={view.reviewedBrief?.assertions.find((assertion) => assertion.id === item.assertionId)?.sourceUrl} target="_blank" rel="noreferrer" className="underline">Submitted PDF</a> · <a href={view.reconciliation?.provisionalTranscriptUrl} target="_blank" rel="noreferrer" className="underline">Provisional transcript</a>
          {view.reconciliation?.recordingReview && <> · <a href={view.reconciliation.recordingReview.sourceUrl} target="_blank" rel="noreferrer" className="underline">UN Web TV recording (not yet reviewed)</a></>}
          {item.publishedSpeechCorroboration && <> · <a href={item.publishedSpeechCorroboration.sourceUrl} target="_blank" rel="noreferrer" className="underline">Government-published speech text</a> (delivery unverified)</>}
        </p>)}
        <div className="mt-1 text-[10px] text-slate-400">Selected claims only; full speech, delivery, and external facts unverified.</div>
      </div>}
      {!view.reviewedBrief && <p className="mt-1 text-slate-300">{view.missingEvidence.find((gap) => gap.includes("brief was withheld")) ?? "Source-checked brief pending."} {view.segments[0]?.sourceUrl && <a href={view.segments[0].sourceUrl} target="_blank" rel="noreferrer" className="underline">Open the transcript moment</a>}.</p>}
    </div>)}
    </details>
    {focus.length === 2 && <details className="mt-2 border-t border-white/15 pt-2">
      <summary className="cursor-pointer font-semibold text-cyan-100">Compare stated positions by issue</summary>
      {!issueComparison && <p className="mt-1 text-slate-400">{issueLoading ? "Loading cited issue comparison…" : "Issue comparison unavailable; source review status could not be read."}</p>}
      {issueComparison && <>
      <p className="mt-1 text-[10px] text-slate-400">Selected submitted statements; delivery and current policy still need verification. A shared topic is not an agreement.</p>
      {issueComparison.namedNaturalSystemReview.status !== "not_applicable" && <div className="mt-1 rounded border border-cyan-300/25 p-1.5 text-[10px] text-slate-200">
        <div className="font-medium text-cyan-100">Named natural systems · {issueComparison.namedNaturalSystemReview.status.replaceAll("_", " ")}</div>
        <p>{issueComparison.namedNaturalSystemReview.interpretation}</p>
        {issueComparison.namedNaturalSystemReview.references.map((reference) => <a key={`${reference.countryIso3}:${reference.assertionId}:${reference.systemId}`} href={reference.sourceUrl} target="_blank" rel="noreferrer" className="mr-2 underline">{reference.countryIso3}: {reference.label}</a>)}
      </div>}
      {issueComparison.facets.length === 0 && <p className="mt-1 text-amber-100">Issue crosswalk pending for this pair; no alignment or disagreement has been assessed.</p>}
      {issueComparison.facets.map((facet) => <div key={facet.id} className="mt-2 rounded border border-white/15 p-1.5">
        <div className="font-medium text-white">{facet.label} · {facet.comparison.replaceAll("_", " ")}</div>
        {facet.comparisonBasis === "parallel_reviewed_topic_inventory" &&
          <p className="mt-1 text-[10px] text-amber-100">Parallel reviewed topics; no pair-specific comparison or agreement assessed.</p>}
        {facet.facetKind === "stated_safety_concern" && <p className="mt-1 text-[10px] text-amber-100">The speakers' mine-action positions do not establish a joint program or locate a hazard on a specific route.</p>}
        {facet.facetKind === "stated_humanitarian_concern" && <p className="mt-1 text-[10px] text-amber-100">The statements do not establish an agreed mechanism or represent affected families.</p>}
        {facet.facetKind === "stated_trust_concern" && <p className="mt-1 text-[10px] text-amber-100">A speaker's concern does not measure public attitudes or establish the counterpart's response.</p>}
        {facet.facetKind === "stated_jurisdiction_principle" && <p className="mt-1 text-[10px] text-amber-100">An access aspiration and a sovereignty principle do not establish a common route, direct tension, consent, or a legal border determination.</p>}
        {facet.contrast.sharedPublicTopic && <p className="mt-1 text-[10px] text-slate-200">Shared public topic: {facet.contrast.sharedPublicTopic}</p>}
        {facet.contrast.differenceInSubmittedClaims && <p className="mt-1 text-[10px] text-slate-200">Difference in claims: {facet.contrast.differenceInSubmittedClaims}</p>}
        {facet.contrast.framingDifference.status === "documented_in_selected_submitted_texts" && <p className="mt-1 text-[10px] text-amber-100">Different framing in submitted texts: {facet.contrast.framingDifference.description} {facet.contrast.framingDifference.inferenceLimit}</p>}
        <p className="mt-1 text-[10px] text-slate-400">{facet.contrast.missingCountryIso3s.length
          ? `No selected reviewed assertion for ${facet.contrast.missingCountryIso3s.join(", ")}; its position on this facet is unknown.`
          : facet.contrast.directTensionStatus === "reciprocal_security_allegations_unadjudicated"
            ? "Both speakers make attributed security allegations. Their claims, present conditions, and each government's response to the other's submitted speech remain unverified."
          : facet.comparisonBasis === "parallel_reviewed_topic_inventory"
            ? "Both briefs mention this topic independently; relevance and tension between the states remain unassessed."
            : "No direct contradiction identified in these selected assertions; broader positions and agreement remain unverified."}</p>
        {facet.routeEndpointGate === "blocked_pending_delivered_wording_review" && <p className="mt-1 text-[10px] text-amber-100">Route endpoint unresolved until delivered wording is reviewed.</p>}
        {facet.positions.map((position) => <div key={position.id} className="mt-1 text-slate-200">
          <span className="font-medium">{position.countryIso3} · {position.speaker} · {position.speechDate}: </span>
          <a href={position.sourceUrl} target="_blank" rel="noreferrer" className="underline">{position.text} (submitted PDF p. {position.sourcePage})</a>
          <div className="text-[10px] text-slate-400">{position.sourceLanguage}</div>
          <div className="text-[10px] text-slate-400">{position.uncertainty}</div>
          {position.provisionalReconciliation.alignment === "wording_discrepancy" && <div className="mt-1 text-[10px] text-amber-100">
            Recording discrepancy: {position.provisionalReconciliation.note}
            {position.provisionalReconciliation.transcriptUrl && <> <a href={position.provisionalReconciliation.transcriptUrl} target="_blank" rel="noreferrer" className="underline">Provisional moment</a></>}
            {position.provisionalReconciliation.recordingReview && <> · <a href={position.provisionalReconciliation.recordingReview.sourceUrl} target="_blank" rel="noreferrer" className="underline">UN Web TV recording (not reviewed)</a></>}
          </div>}
          {position.provisionalReconciliation.publishedSpeechCorroboration && <div className="mt-1 text-[10px] text-slate-300">
            Published speech corroboration: {position.provisionalReconciliation.publishedSpeechCorroboration.finding} <a href={position.provisionalReconciliation.publishedSpeechCorroboration.sourceUrl} target="_blank" rel="noreferrer" className="underline">Government text</a>. Delivered wording remains unverified.
          </div>}
        </div>)}
        <p className="mt-1 text-[10px] text-slate-400">{facet.interpretation}</p>
        <p className="mt-1 text-[10px] text-cyan-100">Next question: {facet.unansweredQuestion}</p>
      </div>)}
      {issueComparison.datedNegotiatingConditions.map((condition) => <details key={condition.id} className="mt-2 rounded border border-amber-300/30 p-1.5 text-[10px] text-slate-200">
        <summary className="cursor-pointer font-medium text-amber-100">Dated negotiating condition · {condition.comparisonStatus.replaceAll("_", " ")}</summary>
        <p className="mt-1">{condition.interpretation}</p>
        {condition.positions.map((position) => <div key={position.countryIso3} className="mt-1">
          <a href={position.sourceUrl} target="_blank" rel="noreferrer" className="underline">{position.countryIso3} · {position.speaker} · {position.sourceDate} · {position.sourceSection}</a>: {position.paraphrase} {position.limit}
        </div>)}
        <p className="mt-1 text-cyan-100">Question for both governments: {condition.nextQuestion}</p>
      </details>)}
      {issueComparison.datedOperatingReports.length > 0 && <div className="mt-2 rounded border border-white/15 p-1.5 text-[10px] text-slate-300">
        <div className="font-medium text-slate-100">Dated freight reports · separate from UN speeches</div>
        {issueComparison.datedOperatingReports.map((report) => <div key={report.id} className="mt-1">
          <a href={report.sourceUrl} target="_blank" rel="noreferrer" className="underline">{report.reportDate} · {report.sourcePublisher}</a>: {report.reportedQuantity.value} {report.reportedQuantity.unit} of {report.commodity}, reported through {report.reportedTransitCountryIso3s.join(" + ")} to {report.destinationCountryIso3}. {report.interpretationLimit}
          {report.corroboratingOperationalSources.map((source) => <div key={source.sourceUrl} className="ml-2 text-slate-300">
            <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="underline">{source.sourcePublisher}</a>: {source.reportedQuantity.value} {source.reportedQuantity.unit} reported. {source.reportedMilestone}
          </div>)}
        </div>)}
      </div>}
      {issueComparison.datedProjectMilestones.length > 0 && <details className="mt-2 rounded border border-white/15 p-1.5 text-[10px] text-slate-300">
        <summary className="cursor-pointer font-medium text-slate-100">Dated project milestones · separate from UN speeches</summary>
        {issueComparison.datedProjectMilestones.map((milestone) => <div key={milestone.id} className="mt-1">
          <a href={milestone.sourceUrl} target="_blank" rel="noreferrer" className="underline">{milestone.sourceDate} · {milestone.sourcePublisher}</a>: {milestone.sourceFinding}
          <div className="text-cyan-100">Review question: {milestone.reviewQuestion}</div>
          <div className="text-slate-400">{milestone.interpretationLimit}</div>
        </div>)}
      </details>}
      {issueComparison.reviewedPositionProjectLinks.length > 0 && <details className="mt-2 rounded border border-cyan-200/25 p-1.5 text-[10px] text-slate-300">
        <summary className="cursor-pointer font-medium text-cyan-100">UN position ↔ project scope questions ({issueComparison.reviewedPositionProjectLinks.length})</summary>
        {issueComparison.reviewedPositionProjectLinks.map((link) => <div key={`${link.assertionId}:${link.milestoneId}`} className="mt-1 border-t border-white/10 pt-1">
          <a href={link.assertionSourceUrl} target="_blank" rel="noreferrer" className="underline">{link.assertionCountryIso3} submitted position · p. {link.assertionSourcePage}</a>
          {" · "}<a href={link.milestoneSourceUrl} target="_blank" rel="noreferrer" className="underline">dated project source</a>
          <div className="text-cyan-100">{link.reviewQuestion}</div>
          <div className="text-slate-400">{link.inferenceLimit}</div>
        </div>)}
      </details>}
      {issueComparison.thirdPartyOperatingContext.length > 0 && <details className="mt-2 rounded border border-white/15 p-1.5 text-[10px] text-slate-300">
        <summary className="cursor-pointer font-medium text-slate-100">Georgia operator and customs source context</summary>
        {issueComparison.thirdPartyOperatingContext.map((record) => <div key={record.id} className="mt-1">
          <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">{record.sourcePublisher} · {record.sourceDate}</a>: {record.finding}
          <div className="text-slate-400">{record.interpretationLimit}</div>
        </div>)}
      </details>}
      {issueComparison.designatedWetlandContext.length > 0 && <details className="mt-2 rounded border border-white/15 p-1.5 text-[10px] text-slate-300">
        <summary className="cursor-pointer font-medium text-slate-100">Designated wetlands · country-level source inventory</summary>
        {issueComparison.designatedWetlandContext.map((record) => <div key={record.countryIso3} className="mt-1">
          <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">{record.countryIso3} Ramsar summary</a>: {record.sites.map((site) => `${site.name} (${site.siteNumber})`).join(", ")}.
          <div className="text-slate-400">Geometry: {record.geometryStatus.replaceAll("_", " ")}.</div>
          <div className="text-slate-400">{record.interpretationLimit}</div>
        </div>)}
      </details>}
      {issueComparison.humanitarianContext.length > 0 && <details className="mt-2 rounded border border-white/15 p-1.5 text-[10px] text-slate-300">
        <summary className="cursor-pointer font-medium text-slate-100">Missing persons and mine action · independent institutional context</summary>
        {issueComparison.governmentRecords.filter((record) => record.sourceSections.includes("Article IX")).map((record) => <div key={record.id} className="mt-1">
          <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">Article IX · {record.legalStatus.replaceAll("_", " ")}</a>: separate missing-persons modalities still require agreement. {record.limits}
        </div>)}
        {issueComparison.humanitarianContext.map((record) => <div key={record.id} className="mt-1">
          <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">{record.publicationDate} · {record.publisher} · {record.sourceSection}</a>: {record.summary}
          <div className="text-slate-400">{record.limits}</div>
        </div>)}
      </details>}
      {issueComparison.familyContext.length > 0 && <details className="mt-2 rounded border border-white/15 p-1.5 text-[10px] text-slate-300">
        <summary className="cursor-pointer font-medium text-slate-100">Affected-family perspectives · bounded ICRC reporting</summary>
        {issueComparison.familyContext.map((record) => <div key={record.id} className="mt-1">
          <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">{record.countryIso3} · {record.publicationDate} · {record.publisher}</a>: {record.boundedPerspective}
          <div className="text-cyan-100">Question for consultation: {record.possibleNeedForOptionReview}</div>
          <div className="text-slate-400">{record.representativeness} Consent to this option has not been obtained.</div>
        </div>)}
      </details>}
      <p className="mt-2 text-[10px] text-slate-400">{issueComparison.governmentRecords.length} separate dated government record{issueComparison.governmentRecords.length === 1 ? "" : "s"} · {issueComparison.thirdPartyPerspectives.length} cited third-party perspective{issueComparison.thirdPartyPerspectives.length === 1 ? "" : "s"}. Their legal status and effects remain separate from speech positions.</p>
      {issueComparison.thirdPartyPerspectives.length > 0 && <details className="mt-1 text-[10px] text-slate-300">
        <summary className="cursor-pointer">Third-party relevance to this issue</summary>
        {issueComparison.thirdPartyPerspectives.map((position) => <div key={position.countryIso3} className="mt-1 border-t border-white/10 pt-1">
          <span className="font-medium">{position.countryIso3} · {position.relevanceToPair.status.replaceAll("_", " ")}: </span>{position.relevanceToPair.interpretation}
          <div>Selected-side assertions: {position.relevanceToPair.selectedPartyAssertionIds.join(", ") || "none"} · third-party assertions: {position.relevanceToPair.thirdPartyAssertionIds.join(", ") || "none"}</div>
          {position.assertions.map((assertion) => <div key={assertion.id}><a href={assertion.sourceUrl} target="_blank" rel="noreferrer" className="underline">{assertion.id} · submitted PDF p. {assertion.sourcePage}</a> · review revision {assertion.reviewRevision}</div>)}
        </div>)}
      </details>}
      {issueComparison.thirdPartyCoverageGaps.map((gap) => <p key={gap.countryIso3} className="mt-1 text-[10px] text-amber-100">
        {gap.countryIso3} · position unavailable: {gap.interpretation} {gap.officialPageUrl && <a href={gap.officialPageUrl} target="_blank" rel="noreferrer" className="underline">Official delegation page</a>}
      </p>)}
      <details className="mt-1 text-[10px] text-slate-300"><summary className="cursor-pointer">What remains unresolved</summary>
        <ul className="mt-1 list-inside list-disc">{issueComparison.unresolved.slice(0, 6).map((gap) => <li key={gap}>{gap}</li>)}</ul>
      </details>
      </>}
    </details>}
    {focus.length === 2 && bilateral?.bilateralEvidence.records.length ? <details className="mt-2 border-t border-white/15 pt-2">
      <summary className="cursor-pointer font-semibold text-cyan-100">Dated government and legal evidence ({bilateral.bilateralEvidence.records.length})</summary>
      <ul className="mt-1 space-y-2">{bilateral.bilateralEvidence.records.map((record) => <li key={record.id} className="text-slate-200">
        <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">{record.eventDate} · {record.sourcePublisher}</a>
        {record.corroboratingSources.map((source) => <span key={source.sourceUrl}> · <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="underline">{source.sourcePublisher}</a></span>)}
        <div className="text-[10px] text-slate-400">Parties: {record.parties.join(" + ")} · {record.legalStatus.replaceAll("_", " ")} as of {record.statusAsOf}{record.sourceSections.length ? ` · ${record.sourceSections.join(", ")}` : ""}</div>
        {record.statusEvidenceUrls.filter((url) => url !== record.sourceUrl).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="mr-2 text-[10px] underline">Status source</a>)}
        <div>{record.summary}</div>
        {record.conditions.map((condition) => <div key={condition} className="text-[10px] text-cyan-100">Condition: {condition}</div>)}
        {record.thirdPartyDependencies.map((dependency) => <div key={`${dependency.partyIso3 ?? "unspecified"}:${dependency.role}`} className="text-[10px] text-cyan-100">Third party {dependency.partyIso3 ?? "unspecified"}: {dependency.role}</div>)}
        <div className="text-[10px] text-slate-400">{record.limits}</div>
      </li>)}</ul>
    </details> : null}
    {focus.length === 2 && bilateral?.dependentGovernmentEvidence.records.length ? <details className="mt-2 border-t border-white/15 pt-2">
      <summary className="cursor-pointer font-semibold text-cyan-100">Related third-party framework ({bilateral.dependentGovernmentEvidence.records.length})</summary>
      {bilateral.dependentGovernmentEvidence.records.map((record) => <div key={record.id} className="mt-1 text-slate-200">
        <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">{record.eventDate} · {record.parties.join(" + ")} · {record.sourceSections.join(", ")}</a>
        <div className="text-[10px] text-slate-400">{record.legalStatus.replaceAll("_", " ")} as of {record.statusAsOf}</div>
        {record.statusEvidenceUrls.filter((url) => url !== record.sourceUrl).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="mr-2 text-[10px] underline">Status source</a>)}
        <div>{record.summary}</div>
        {record.plannedJointVenture && <div className="mt-1 text-[10px] text-amber-100">
          Intended company shares: {record.plannedJointVenture.initialOwnership.map((share) => `${share.stakeholder} ${share.percent}%`).join(" · ")}.
          Armenia's share would become {record.plannedJointVenture.conditionalExtension.armeniaOwnershipPercentOnExtension}% only on a mutually agreed extension after the initial {record.plannedJointVenture.conditionalExtension.initialTermYears}-year term. {record.plannedJointVenture.interpretationLimit}
        </div>}
        {record.milestones?.length ? <details className="mt-1 text-[10px] text-slate-300"><summary className="cursor-pointer">Agreement and implementation timeline</summary>
          <ul className="mt-1 space-y-1 pl-2">{record.milestones.map((milestone) => <li key={`${milestone.date}:${milestone.kind}`}>
            <a href={milestone.sourceUrl} target="_blank" rel="noreferrer" className="underline">{milestone.date} · {milestone.kind.replaceAll("_", " ")}</a> · {milestone.summary}
          </li>)}</ul>
        </details> : null}
        {record.conditions.map((condition) => <div key={condition} className="text-[10px] text-cyan-100">Condition: {condition}</div>)}
        <div className="text-[10px] text-slate-400">{record.limits}</div>
      </div>)}
    </details> : null}
    {focus.length === 2 && bilateral?.multilateralGovernmentEvidence.records.length ? <details className="mt-2 border-t border-white/15 pt-2">
      <summary className="cursor-pointer font-semibold text-cyan-100">Joint multilateral government record ({bilateral.multilateralGovernmentEvidence.records.length})</summary>
      {bilateral.multilateralGovernmentEvidence.records.map((record) => <div key={record.id} className="mt-1 text-slate-200">
        <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="underline">{record.eventDate} · {record.parties.join(" + ")}</a>
        <div>{record.summary}</div>
        {record.reportedMeasures?.map((measure) => <div key={measure.metric} className="text-[10px] text-amber-100">Government reported: {measure.qualifier.replaceAll("_", " ")} {new Intl.NumberFormat().format(measure.value)} {measure.unit} · {measure.metric.replaceAll("_", " ")}</div>)}
        <div className="text-[10px] text-slate-400">{record.limits}</div>
      </div>)}
    </details> : null}
    {focus.length === 2 && bilateral?.thirdPartyPositions.length ? <details className="mt-2 border-t border-white/15 pt-2">
      <summary className="cursor-pointer font-semibold text-cyan-100">Third-party stated perspectives ({bilateral.thirdPartyPositions.length})</summary>
      {bilateral.thirdPartyPositions.map((position) => <div key={position.countryIso3} className="mt-1 text-slate-200">
        <div className="font-medium">{position.countryIso3} · {position.speaker} · {position.speechDate}</div>
        <div className="text-[10px] text-slate-400">{position.speakerAttributionSource === "official_page_only" ? "Speaker named on official page only" : "Speaker named in PDF and official page"} · recording match pending</div>
        <ul className="list-inside list-disc">{position.assertions.map((assertion) => <li key={assertion.id}><a href={assertion.sourceUrl} target="_blank" rel="noreferrer" className="underline">{assertion.text} (submitted PDF p. {assertion.sourcePage})</a></li>)}</ul>
      </div>)}
      <p className="mt-1 text-[10px] text-slate-400">Submitted statements only. Transit rights, consent, and effects on the selected pair are unassessed.</p>
    </details> : null}
    {focus.length === 2 && relationshipNetwork && <details className="mt-2 border-t border-white/15 pt-2">
      <summary className="cursor-pointer font-semibold text-cyan-100">{relationshipNetwork.reviewBadge.emoji} Cited relationship network · {relationshipNetwork.nodes.length} countries · {relationshipNetwork.relations.length + relationshipNetwork.statedPairPerspectives.length + relationshipNetwork.multilateralGovernmentRecords.length + relationshipNetwork.reportedTransportEvents.length + relationshipNetwork.datedProjectMilestones.length} records</summary>
      <p className="mt-1 text-[10px] text-slate-400">The face means evidence review needed. Government records, directional goods, and each delegation's dated public statements are separate evidence types; none is a cooperation or trust score.</p>
      {relationshipNetwork.relations.map((relation) => <div key={relation.id} className="mt-1 border-t border-white/10 pt-1 text-slate-200">
        <span className="font-medium">{relation.fromIso3} → {relation.toIso3}</span> · {relation.relationKind.replaceAll("_", " ")}
        {relation.eventDate ? ` · ${relation.eventDate}` : relation.measuredYear ? ` · ${relation.measuredYear}` : ""}
        {relation.legalStatus ? ` · ${relation.legalStatus.replaceAll("_", " ")}${relation.statusAsOf ? ` as of ${relation.statusAsOf}` : ""}` : ""}
        {relation.tradeStatus ? ` · ${relation.tradeStatus.replaceAll("_", " ")}` : ""}
        {relation.applicability === "only_if_project_uses_framework" && <span className="text-amber-100"> · applies only if this framework is used</span>}
        {relation.sourceUrls[0] && <> · <a href={relation.sourceUrls[0]} target="_blank" rel="noreferrer" className="underline">source</a></>}
        <div className="text-[10px] text-slate-400">{relation.interpretationLimit}</div>
      </div>)}
      {relationshipNetwork.statedPairPerspectives.map((perspective) => <div key={perspective.id} className="mt-1 border-t border-white/10 pt-1 text-slate-200">
        <span className="font-medium">{perspective.fromIso3} → {perspective.toIso3}</span> · reviewed submitted statement · {perspective.speechDate}
        <div><a href={perspective.sourceUrl} target="_blank" rel="noreferrer" className="underline">{perspective.text} (PDF p. {perspective.sourcePage})</a></div>
        <div className="text-[10px] text-slate-400">{perspective.speaker} · review {perspective.reviewRevision} · delivered wording and current relationship unverified. {perspective.uncertainty}</div>
      </div>)}
      {relationshipNetwork.multilateralGovernmentRecords.map((record) => <div key={record.id} className="mt-1 border-t border-white/10 pt-1 text-slate-200">
        <span className="font-medium">{record.parties.join(" + ")}</span> · joint government record · {record.eventDate}
        {record.sourceUrls[0] && <> · <a href={record.sourceUrls[0]} target="_blank" rel="noreferrer" className="underline">source</a></>}
        <div className="text-[10px] text-slate-400">{record.interpretationLimit}</div>
      </div>)}
      {relationshipNetwork.reportedTransportEvents.map((event) => <div key={event.id} className="mt-1 border-t border-white/10 pt-1 text-slate-200">
        <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="underline">{event.reportDate} · reported freight arrival</a> through {event.reportedTransitCountryIso3s.join(" + ")} to {event.destinationCountryIso3}: {event.reportedQuantity.value} {event.reportedQuantity.unit} of {event.commodity}.
        {event.corroboratingOperationalSources.map((source) => <div key={source.sourceUrl} className="text-[10px] text-slate-300">
          <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="underline">{source.sourcePublisher}</a>: {source.reportedQuantity.value} {source.reportedQuantity.unit}; {source.reportedMilestone}
        </div>)}
        <div className="text-[10px] text-slate-400">{event.interpretationLimit}</div>
      </div>)}
      {relationshipNetwork.datedProjectMilestones.map((milestone) => <div key={milestone.id} className="mt-1 border-t border-white/10 pt-1 text-slate-200">
        <a href={milestone.sourceUrl} target="_blank" rel="noreferrer" className="underline">{milestone.sourceDate} · {milestone.projectCountryIso3}–{milestone.namedCounterpartIso3} project · {milestone.sourcePublisher}</a> · {milestone.eventKind.replaceAll("_", " ")}
        <div>{milestone.sourceFinding}</div>
        <div className="text-cyan-100">Review question: {milestone.reviewQuestion}</div>
        <div className="text-[10px] text-slate-400">{milestone.interpretationLimit}</div>
      </div>)}
      {relationshipNetwork.statedThirdPartyPerspectives.map((perspective) => <div key={perspective.countryIso3} className="mt-1 text-slate-300">
        {perspective.countryIso3} has {perspective.assertionIds.length} cited statement perspective{perspective.assertionIds.length === 1 ? "" : "s"}; effect on this pair unassessed.
        {perspective.sourceUrls[0] && <> <a href={perspective.sourceUrls[0]} target="_blank" rel="noreferrer" className="underline">Source</a></>}
      </div>)}
    </details>}
    {focus.length === 2 && <div className="mt-2 border-t border-white/15 pt-2">
      <div className="font-semibold text-cyan-100"><span aria-hidden="true">🧐</span> Measured merchandise trade</div>
      <label className="mt-1 flex items-center gap-1 text-slate-300">Year <select aria-label="UN Comtrade year" value={tradeYear} onChange={(event) => setTradeYear(Number(event.target.value))} className="rounded border border-cyan-200/30 bg-slate-950 px-1">
        {[2025, 2024, 2023, 2022, 2021, 2020].map((year) => <option key={year} value={year}>{year}</option>)}
      </select></label>
      {tradeLoading && <p className="text-slate-300">Reading UN Comtrade…</p>}
      {!tradeLoading && trade?.directions.map((direction) => <div key={direction.reporterIso3} className="mt-1 text-slate-200">
        {direction.reporterIso3} → {direction.partnerIso3}: {direction.status === "available" && direction.primaryValueUsd != null
          ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(direction.primaryValueUsd)
          : direction.status.replaceAll("_", " ")}
        {direction.sourceUrl && <> · <a href={direction.sourceUrl} target="_blank" rel="noreferrer" className="underline">UN Comtrade {trade.query.year}</a></>}
        {direction.status === "available" && direction.isAggregate && <span className="text-slate-400"> · provider aggregate</span>}
      </div>)}
      <p className="mt-1 text-amber-100">The face means review needed. Goods exports are one measured relation; cooperation, third-country constraints, and an achievable optimum remain unassessed.</p>
    </div>}
    <p className="mt-2 text-[10px] text-slate-400">Machine recognition can mishear words or speakers. These dated remarks are not an official UN record or a population-wide view.</p>
  </section>;
}
