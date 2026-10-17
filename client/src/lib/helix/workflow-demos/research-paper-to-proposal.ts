import type { ScientificEvidenceWorkflowStatus } from "@/components/helix/ask-console/ScientificEvidenceWorkflowStatus";
import { collectScientificEvidenceWorkflowStatusesFromPayload } from "@/store/useScientificEvidenceWorkflowStore";
import {
  HELIX_WORKFLOW_DEMO_SCHEMA,
  HELIX_WORKFLOW_QTE_SCHEMA,
  RESEARCH_PAPER_TO_PROPOSAL_DEMO_ID,
  createEmptyHelixWorkflowDemoEvidence,
  type HelixWorkflowDemoDefinitionV1,
  type HelixWorkflowDemoEvidenceV1,
  type HelixWorkflowDemoSessionV1,
  type HelixWorkflowDemoStepRetryV1,
  type HelixWorkflowDemoStepV1,
  type HelixWorkflowDemoStepState,
  type HelixWorkflowQteV1,
  type ResearchPaperToProposalStepId,
} from "@shared/contracts/helix-workflow-demo.v1";
import { renderHelixWorkflowDemoPromptTemplate } from "@/lib/helix/workflow-demos/workflow-demo-context";

type RecordLike = Record<string, unknown>;

export type ResearchPaperToProposalProjection = {
  steps: Array<{
    id: ResearchPaperToProposalStepId;
    title: string;
    shortLabel: string;
    description: string;
    state: HelixWorkflowDemoStepState;
    evidenceRefs: string[];
  }>;
  completedStepCount: number;
  currentStepId: ResearchPaperToProposalStepId | null;
  completed: boolean;
  qte: HelixWorkflowQteV1 | null;
};

const uniqueRefs = (...groups: Array<readonly unknown[] | undefined>): string[] =>
  Array.from(new Set(
    groups
      .flatMap((group: readonly unknown[] | undefined) => group ?? [])
      .map((value: unknown) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean),
  )).slice(0, 48);

const readRecord = (value: unknown): RecordLike | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : null;

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? uniqueRefs(value) : [];

const latestStableEvidenceRef = (refs: readonly string[]): string | null => {
  for (let index = refs.length - 1; index >= 0; index -= 1) {
    const ref = refs[index]?.trim();
    if (ref && /^[a-z][a-z0-9._-]*:/i.test(ref)) return ref;
  }
  return refs[refs.length - 1]?.trim() || null;
};

export const RESEARCH_PAPER_TO_PROPOSAL_DEMO: HelixWorkflowDemoDefinitionV1 = {
  schema: HELIX_WORKFLOW_DEMO_SCHEMA,
  id: RESEARCH_PAPER_TO_PROPOSAL_DEMO_ID,
  title: "Research paper to proposal",
  description: "Use bounded scholarly evidence, promote an exact equation row, reflect it diagnostically, audit provenance, then prepare a gated postulate proposal.",
  steps: [
    {
      id: "paper_lookup",
      title: "Find a bounded paper",
      shortLabel: "Paper",
      description: "Select a scholarly record with an accessible PDF or full-text affordance.",
      prompt: "Find one PDF-accessible primary paper for this workflow objective: \"{{research_topic}}\". Do not send the entire objective as the scholarly query. First derive one short, specific query of at most 12 words from its most distinctive scientific terms, then search. If that query has no usable topic-relevant paper, make one narrower retry. Select exactly one paper, fetch or materialize its full text, and report its canonical identity, DOI or arXiv ID when available, PDF/full-text affordance, and stable source refs.",
    },
    {
      id: "pdf_page_render",
      title: "Render a PDF page",
      shortLabel: "Page",
      description: "Materialize a page image with a stable source id, page number, and provenance.",
      prompt: "Continue from the selected paper evidence ref `{{paper_ref}}` for the pinned workflow objective: \"{{research_topic}}\". Mount PDF page 2 in Image Lens as a source only. Do not inspect, crop, OCR, analyze, extract, or read it yet. Report only whether typed page-mount evidence was created, including its page/source refs.",
    },
    {
      id: "ocr_math_candidate",
      title: "Find a math candidate",
      shortLabel: "OCR/math",
      description: "Inspect a rendered page and retain a typed OCR or equation-candidate observation.",
      prompt: "Continue from selected-paper evidence ref `{{paper_ref}}`, retained rendered-page evidence ref `{{rendered_page_ref}}`, and the pinned workflow objective: \"{{research_topic}}\". The retained page ref is a provenance anchor; use it as the Image Lens `source_id` only when the active source also carries materializable page-image data. Inspect only the already mounted PDF page 2 with Image Lens. If its image bytes are unavailable after a runtime restart, re-materialize page 2 directly from the canonical DOI, arXiv identifier, or canonical paper URL in the typed paper evidence or pinned objective, without a broad lookup or selecting another paper. Then run `visual_analysis.inspect_image_region` on page 2 to extract the first displayed equation as observation-only evidence. Do not run `docs-viewer.search_docs`. If page 2 has no OCR or LaTeX candidate, stop this turn with the typed blocker; the workflow will choose at most one bounded adjacent-page retry. Report the source id, page number, bbox or crop ref, extraction status, and OCR or LaTeX candidate refs. The visual capability output is evidence only, not an assistant answer.",
    },
    {
      id: "exact_row_promotion",
      title: "Promote the exact row",
      shortLabel: "Promote",
      description: "Crop only a clean equation row and promote it only when exact-row admissibility is supported.",
      prompt: "Continue from the typed equation-candidate evidence ref `{{ocr_math_candidate_ref}}`. Use Image Lens to crop only the exact equation row and promote it only if the row crop supports exact equation admissibility; otherwise return the typed blocker without promoting fragments.",
    },
    {
      id: "graph_reflection",
      title: "Reflect to the theory graph",
      shortLabel: "Reflect",
      description: "Attach promoted evidence as diagnostic context, without upgrading its authority.",
      prompt: "Reflect the promoted exact equation-row evidence ref `{{promoted_equation_ref}}` to the Theory Badge Graph. Keep the claim boundary diagnostic-only unless stronger authority is explicitly supported, and return the typed graph-reflection refs.",
    },
    {
      id: "provenance_audit",
      title: "Audit provenance",
      shortLabel: "Audit",
      description: "Name the retained paper, page, crop, evidence depth, and graph reflection chain.",
      prompt: "Audit the retained scientific evidence chain ending at graph-reflection evidence ref `{{graph_reflection_ref}}`. Tell me which paper, page, equation, crop ref, evidence depth, and graph-reflection refs are in use, using the latest typed sidecar/workbench state rather than prose memory.",
    },
    {
      id: "proposal_handoff",
      title: "Prepare the gated proposal",
      shortLabel: "Proposal",
      description: "Draft a traceable postulate proposal and enter the existing review/submission gate.",
      prompt: "/postulate Draft a proposal from the audited scientific evidence chain ref `{{provenance_audit_ref}}`. State the diagnostic claim boundary, cite the promoted row, page render, graph reflection, and provenance refs, identify the unresolved uncertainty, and submit only through the existing postulate review gate.",
    },
  ],
};

const collectTypedRecords = (payload: unknown, schema: string): RecordLike[] => {
  const matches: RecordLike[] = [];
  const seen = new WeakSet<object>();
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 9 || value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.slice(0, 180).forEach((entry: unknown) => visit(entry, depth + 1));
      return;
    }
    const record = value as RecordLike;
    if (record.schema === schema) matches.push(record);
    Object.values(record).slice(0, 200).forEach((entry: unknown) => visit(entry, depth + 1));
  };
  visit(payload);
  return matches;
};

export const isHelixWorkflowDemoTypedFailurePayload = (payload: unknown): boolean => {
  const record = readRecord(payload);
  if (!record) return false;
  const kind = readString(record.terminal_artifact_kind) ?? readString(record.terminalArtifactKind);
  return record.ok === false || kind === "typed_failure" || kind === "route_execution_failure";
};

export type HelixWorkflowDemoRetrySignal = {
  stepId: "ocr_math_candidate";
  reason: "no_ocr_or_latex_candidate";
  pageNumber: number | null;
  pageCount: number | null;
  sourceId: string | null;
  artifactRefs: string[];
};

const readPositiveInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

export const extractHelixWorkflowDemoRetrySignalFromPayload = (
  payload: unknown,
): HelixWorkflowDemoRetrySignal | null => {
  if (isHelixWorkflowDemoTypedFailurePayload(payload)) return null;
  const typedInspections = [
    ...collectTypedRecords(payload, "image_lens_region_inspection_receipt/v1"),
    ...collectTypedRecords(payload, "helix.image_lens_region_inspection_observation.v1"),
  ];
  for (let index = typedInspections.length - 1; index >= 0; index -= 1) {
    const inspection = typedInspections[index];
    if (inspection.source_mount_only === true) continue;
    const extractionStatus = readString(inspection.extraction_status);
    const textCandidate = readString(inspection.text_candidate);
    const latexCandidate = readString(inspection.latex_candidate);
    const qualityFlags = readStringArray(inspection.quality_flags);
    const explicitlyMissingCandidate = qualityFlags.some((flag) =>
      flag === "no_ocr_or_latex_candidate" ||
      flag === "no_text_or_latex_candidate" ||
      flag === "non_equation_text_candidate"
    );
    const retryableStatus = extractionStatus === "failed" || extractionStatus === "partial" || extractionStatus === "not_run";
    const usableEquationCandidate = Boolean(textCandidate || latexCandidate) && !explicitlyMissingCandidate;
    if (usableEquationCandidate || (!retryableStatus && !explicitlyMissingCandidate)) continue;
    const pageNumber = readPositiveInteger(inspection.page_number);
    const pageCount = readPositiveInteger(inspection.page_count);
    const sourceId = readString(inspection.source_id) ?? readString(inspection.source_image_ref);
    return {
      stepId: "ocr_math_candidate",
      reason: "no_ocr_or_latex_candidate",
      pageNumber,
      pageCount,
      sourceId,
      artifactRefs: uniqueRefs(
        readStringArray(inspection.source_refs),
        [
          sourceId,
          readString(inspection.page_image_ref),
          readString(inspection.crop_ref),
          readString(inspection.crop_image_ref),
          readString(inspection.receipt_ref),
          readString(inspection.evidence_id),
          readString(inspection.observation_ref),
        ],
      ),
    };
  }
  return null;
};

const nextOcrRetryPage = (retry: HelixWorkflowDemoStepRetryV1 | null | undefined): number | null => {
  if (!retry || retry.stepId !== "ocr_math_candidate") return null;
  return [1, 3].find((pageNumber) => !retry.triedPageNumbers.includes(pageNumber)) ?? null;
};

const renderOcrRetryPrompt = (args: {
  retry: HelixWorkflowDemoStepRetryV1;
  paperRef: string | null;
  renderedPageRef: string | null;
  researchTopic: string;
}): { prompt: string; reason: string } => {
  const nextPage = nextOcrRetryPage(args.retry);
  const triedPages = args.retry.triedPageNumbers.join(", ") || "unknown";
  if (nextPage === null) {
    return {
      reason: `Typed Image Lens attempts on bounded pages ${triedPages} produced no OCR or LaTeX candidate; the adjacent-page retry budget is exhausted.`,
      prompt: `Keep the OCR/math step incomplete for selected-paper evidence ref \`${args.paperRef ?? "unavailable"}\` and pinned workflow objective: "${args.researchTopic}". Typed Image Lens attempts on bounded pages ${triedPages} produced no OCR or LaTeX candidate. Do not inspect additional pages, do not broaden the paper lookup, and do not treat the partial visual observations as equation evidence. Preserve the latest source and crop refs as a typed blocker and ask the operator whether to restart the demo with a different paper.`,
    };
  }
  const latestPage = args.retry.latestPageNumber ?? "the prior page";
  return {
    reason: `The causally linked Image Lens attempt on page ${latestPage} produced no OCR or LaTeX candidate; inspect only bounded adjacent page ${nextPage} next.`,
    prompt: `Continue from selected-paper evidence ref \`${args.paperRef ?? "unavailable"}\`, retained rendered-page evidence ref \`${args.renderedPageRef ?? "unavailable"}\`, and the pinned workflow objective: "${args.researchTopic}". The causally linked Image Lens attempt on page ${latestPage} produced no OCR or LaTeX candidate. Inspect only bounded adjacent PDF page ${nextPage} with \`visual_analysis.inspect_image_region\` and stop after this one page. Re-materialize page ${nextPage} only from the same canonical DOI, arXiv identifier, or canonical paper URL when image bytes are unavailable; do not run \`docs-viewer.search_docs\`, repeat pages ${triedPages}, broaden the lookup, or select another paper. Report the source id, page number, bbox or crop ref, extraction status, and OCR or LaTeX candidate refs. The visual capability output is observation-only evidence, not an assistant answer.`,
  };
};

const refsFromScientificStatus = (status: ScientificEvidenceWorkflowStatus): HelixWorkflowDemoEvidenceV1 => {
  const refs = status.postulateReadyRefs;
  const sourceRef = status.sourceId ?? status.sourceImageHash ?? null;
  const hasCandidate = status.evidenceDepth === "page_image_ocr_math_candidate" ||
    Boolean(status.promotedEquationLatex) ||
    status.promotedRowState === "promoted";
  return {
    schema: "helix.workflow_demo_evidence.v1",
    paperRefs: [],
    renderedPageRefs: uniqueRefs(refs.pageRenderRefs, sourceRef ? [sourceRef] : []),
    ocrMathCandidateRefs: hasCandidate
      ? uniqueRefs(refs.cropRefs, refs.evidenceSidecarRefs, status.cropRef ? [status.cropRef] : [])
      : [],
    promotedEquationRefs: status.promotedRowState === "promoted"
      ? uniqueRefs(refs.promotedEquationRowRefs)
      : [],
    graphReflectionRefs: status.graphReflectionStatus === "diagnostic_reflected"
      ? uniqueRefs(refs.graphReflectionRefs)
      : [],
    provenanceAuditRefs: [],
    proposalReceiptRefs: [],
  };
};

const refsFromTypedImageLensCandidate = (payload: unknown): string[] => {
  const candidates = [
    ...collectTypedRecords(payload, "image_lens_region_inspection_receipt/v1"),
    ...collectTypedRecords(payload, "helix.image_lens_region_inspection_observation.v1"),
  ];
  return uniqueRefs(candidates.flatMap((candidate) => {
    const hasCandidate = Boolean(readString(candidate.text_candidate) || readString(candidate.latex_candidate));
    const extractionStatus = readString(candidate.extraction_status);
    if (!hasCandidate || (extractionStatus !== "extracted" && extractionStatus !== "partial")) return [];
    return [
      readString(candidate.evidence_id),
      readString(candidate.receipt_ref),
      readString(candidate.observation_ref),
      readString(candidate.crop_ref),
      readString(candidate.crop_image_ref),
    ];
  }));
};

const refsFromWorkbench = (workbench: RecordLike): HelixWorkflowDemoEvidenceV1 => {
  const paper = readRecord(workbench.paper);
  const pdf = readRecord(workbench.pdf);
  const status = readRecord(workbench.status);
  const chain = readRecord(workbench.evidence_chain);
  const paperIdentity = [
    readString(workbench.scholarly_memory_id),
    readString(chain?.paper_memory_ref),
    readString(paper?.arxiv_id),
    readString(paper?.arxivId),
    readString(paper?.doi),
    readString(paper?.canonical_url),
    readString(paper?.canonicalUrl),
    readString(paper?.title),
  ].filter((entry): entry is string => Boolean(entry));
  const renderedPageRefs = uniqueRefs(
    readStringArray(pdf?.rendered_page_refs),
    readStringArray(chain?.rendered_page_refs),
  );
  const ocrMathRefs = uniqueRefs(
    readStringArray(chain?.ocr_math_packet_refs),
    status?.has_ocr_or_math_candidate === true && renderedPageRefs.length > 0 ? renderedPageRefs : [],
  );
  const promotedRefs = uniqueRefs(readStringArray(chain?.promoted_equation_refs));
  const graphRefs = uniqueRefs(
    readStringArray(chain?.graph_reflection_refs),
    readStringArray(status?.graph_reflection_refs),
  );
  const selectedAffordance = readString(workbench.selected_affordance);
  const terminalAuthority = readRecord(workbench.terminal_authority);
  const terminalAuthorityKind = readString(terminalAuthority?.terminal_artifact_kind);
  const terminalAuthorityRef = readString(terminalAuthority?.terminal_authority_ref);
  const auditWasAuthoritativelyObserved =
    selectedAffordance === "audit_provenance" &&
    Boolean(terminalAuthorityRef) &&
    terminalAuthorityKind !== "typed_failure" &&
    terminalAuthorityKind !== "route_execution_failure";
  const auditRefs = auditWasAuthoritativelyObserved
    ? uniqueRefs(
        paperIdentity,
        renderedPageRefs,
        promotedRefs,
        graphRefs,
        terminalAuthorityRef ? [terminalAuthorityRef] : [],
        readString(workbench.turn_id) ? [`provenance_audit:${readString(workbench.turn_id)}`] : [],
      )
    : [];
  return {
    schema: "helix.workflow_demo_evidence.v1",
    paperRefs: paperIdentity,
    renderedPageRefs,
    ocrMathCandidateRefs: ocrMathRefs,
    promotedEquationRefs: status?.has_promoted_exact_row === true ? promotedRefs : [],
    graphReflectionRefs: graphRefs,
    provenanceAuditRefs: auditRefs,
    proposalReceiptRefs: [],
  };
};

const collectProposalReceiptRefs = (payload: unknown): string[] => {
  const refs: string[] = [];
  const seen = new WeakSet<object>();
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 9 || value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.slice(0, 180).forEach((entry: unknown) => visit(entry, depth + 1));
      return;
    }
    const record = value as RecordLike;
    const schema = readString(record.schema);
    const kind = readString(record.terminal_artifact_kind) ?? readString(record.terminalArtifactKind);
    if (schema === "helix.postulate_submit_receipt.v1" || kind === "postulate_submit_receipt") {
      refs.push(...uniqueRefs([
        record.receiptId,
        record.receipt_id,
        record.id,
        readRecord(record.receipt)?.receiptId,
        readRecord(record.receipt)?.receipt_id,
      ]));
    }
    Object.values(record).slice(0, 200).forEach((entry: unknown) => visit(entry, depth + 1));
  };
  visit(payload);
  return uniqueRefs(refs);
};

export const mergeHelixWorkflowDemoEvidence = (
  current: HelixWorkflowDemoEvidenceV1,
  incoming: HelixWorkflowDemoEvidenceV1,
): HelixWorkflowDemoEvidenceV1 => ({
  schema: "helix.workflow_demo_evidence.v1",
  paperRefs: uniqueRefs(current.paperRefs, incoming.paperRefs),
  renderedPageRefs: uniqueRefs(current.renderedPageRefs, incoming.renderedPageRefs),
  ocrMathCandidateRefs: uniqueRefs(current.ocrMathCandidateRefs, incoming.ocrMathCandidateRefs),
  promotedEquationRefs: uniqueRefs(current.promotedEquationRefs, incoming.promotedEquationRefs),
  graphReflectionRefs: uniqueRefs(current.graphReflectionRefs, incoming.graphReflectionRefs),
  provenanceAuditRefs: uniqueRefs(current.provenanceAuditRefs, incoming.provenanceAuditRefs),
  proposalReceiptRefs: uniqueRefs(current.proposalReceiptRefs, incoming.proposalReceiptRefs),
});

export const extractHelixWorkflowDemoEvidenceFromPayload = (payload: unknown): HelixWorkflowDemoEvidenceV1 => {
  if (isHelixWorkflowDemoTypedFailurePayload(payload)) return createEmptyHelixWorkflowDemoEvidence();
  let evidence = createEmptyHelixWorkflowDemoEvidence();
  for (const status of collectScientificEvidenceWorkflowStatusesFromPayload(payload)) {
    evidence = mergeHelixWorkflowDemoEvidence(evidence, refsFromScientificStatus(status));
  }
  for (const workbench of collectTypedRecords(payload, "helix.scholarly_pdf_workbench_state.v1")) {
    evidence = mergeHelixWorkflowDemoEvidence(evidence, refsFromWorkbench(workbench));
  }
  evidence.ocrMathCandidateRefs = uniqueRefs(
    evidence.ocrMathCandidateRefs,
    refsFromTypedImageLensCandidate(payload),
  );
  evidence.proposalReceiptRefs = collectProposalReceiptRefs(payload);
  return evidence;
};

const stepEvidenceRefs = (
  stepId: ResearchPaperToProposalStepId,
  evidence: HelixWorkflowDemoEvidenceV1,
): string[] => {
  switch (stepId) {
    case "paper_lookup": return evidence.paperRefs;
    case "pdf_page_render": return evidence.renderedPageRefs;
    case "ocr_math_candidate": return evidence.ocrMathCandidateRefs;
    case "exact_row_promotion": return evidence.promotedEquationRefs;
    case "graph_reflection": return evidence.graphReflectionRefs;
    case "provenance_audit": return evidence.provenanceAuditRefs;
    case "proposal_handoff": return evidence.proposalReceiptRefs;
  }
  return [];
};

export const projectResearchPaperToProposalSession = (
  session: HelixWorkflowDemoSessionV1 | null,
): ResearchPaperToProposalProjection => {
  const evidence = session?.evidence ?? createEmptyHelixWorkflowDemoEvidence();
  let priorComplete = true;
  let currentStepId: ResearchPaperToProposalStepId | null = null;
  const steps = RESEARCH_PAPER_TO_PROPOSAL_DEMO.steps.map((step: HelixWorkflowDemoStepV1) => {
    const evidenceRefs = stepEvidenceRefs(step.id, evidence);
    const completed = priorComplete && evidenceRefs.length > 0;
    let state: HelixWorkflowDemoStepState;
    if (completed) {
      state = "completed";
    } else if (priorComplete && currentStepId === null) {
      state = "current";
      currentStepId = step.id;
    } else {
      state = "locked";
    }
    priorComplete = completed;
    return { ...step, state, evidenceRefs };
  });
  const completedStepCount = steps.filter((step: ResearchPaperToProposalProjection["steps"][number]) => step.state === "completed").length;
  const completed = completedStepCount === steps.length;
  const current = currentStepId
    ? RESEARCH_PAPER_TO_PROPOSAL_DEMO.steps.find((step: HelixWorkflowDemoStepV1) => step.id === currentStepId) ?? null
    : null;
  const contextBinding = session?.contextBinding ?? null;
  const retryProjection = current?.id === "ocr_math_candidate" && session?.stepRetry?.stepId === "ocr_math_candidate"
    ? renderOcrRetryPrompt({
        retry: session.stepRetry,
        paperRef: latestStableEvidenceRef(evidence.paperRefs),
        renderedPageRef: latestStableEvidenceRef(evidence.renderedPageRefs),
        researchTopic: contextBinding?.objective ?? "unavailable",
      })
    : null;
  const qte = session && contextBinding && session.status === "active" && current && session.dismissedStepId !== current.id
    ? {
        schema: HELIX_WORKFLOW_QTE_SCHEMA,
        demoId: session.demoId,
        runId: session.runId,
        stepId: current.id,
        title: current.title,
        reason: retryProjection?.reason ?? (completedStepCount === 0
          ? "Start the enabled procedural demo."
          : `Typed evidence completed ${completedStepCount} of ${steps.length} steps; this is the next unmet step.`),
        prompt: retryProjection?.prompt ?? renderHelixWorkflowDemoPromptTemplate(current.prompt, contextBinding, {
            paperRef: latestStableEvidenceRef(evidence.paperRefs),
            renderedPageRef: latestStableEvidenceRef(evidence.renderedPageRefs),
            ocrMathCandidateRef: latestStableEvidenceRef(evidence.ocrMathCandidateRefs),
            promotedEquationRef: latestStableEvidenceRef(evidence.promotedEquationRefs),
            graphReflectionRef: latestStableEvidenceRef(evidence.graphReflectionRefs),
            provenanceAuditRef: latestStableEvidenceRef(evidence.provenanceAuditRefs),
          }),
        contextBindingId: contextBinding.bindingId,
        contextSourceKind: contextBinding.sourceKind,
        autoSubmit: false,
        assistantAnswer: false,
        terminalEligible: false,
      } satisfies HelixWorkflowQteV1
    : null;
  return { steps, completedStepCount, currentStepId, completed, qte };
};
