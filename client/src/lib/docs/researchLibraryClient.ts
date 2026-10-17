import type {
  HelixResearchLibraryDocument,
  HelixResearchLibraryDocumentSummary,
  HelixResearchLibraryList,
} from "@shared/helix-research-library";

const readError = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    return typeof body?.message === "string" ? body.message : typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

export async function listResearchLibraryDocuments(signal?: AbortSignal): Promise<HelixResearchLibraryDocumentSummary[]> {
  const response = await fetch("/api/research-library", { credentials: "same-origin", signal });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json() as HelixResearchLibraryList;
  return Array.isArray(body.documents) ? body.documents : [];
}

export async function readResearchLibraryDocument(
  documentId: string,
  signal?: AbortSignal,
): Promise<HelixResearchLibraryDocument> {
  const response = await fetch(`/api/research-library/${encodeURIComponent(documentId)}`, {
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json() as { document?: HelixResearchLibraryDocument };
  if (!body.document) throw new Error("research_library_document_missing");
  return body.document;
}

export async function deleteResearchLibraryDocument(
  documentId: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/research-library/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
}

export function researchLibraryDocumentToMarkdown(document: HelixResearchLibraryDocument): string {
  const paperEvidenceSidecars = document.paper_evidence_sidecars ?? [];
  const paperEvidence = paperEvidenceSidecars[0] ?? null;
  const provenance = [
    `# ${document.title}`,
    "",
    `> Private extracted research document. Extraction status: \`${document.extraction_status}\`.`,
    document.source_url ? `> Source: ${document.source_url}` : null,
    `> Integrity: \`${document.source_integrity_hash}\``,
    "",
  ].filter((line): line is string => line !== null);
  const equationCandidates = paperEvidence?.equation_candidates.flatMap((candidate) => {
    const enrichment = candidate.agent_enrichment;
    const expression = enrichment?.normalized_latex || candidate.latex_candidate;
    const bindings = enrichment?.symbol_bindings.flatMap((binding) => [
      `- \`${binding.symbol}\` — ${binding.meaning}` +
        `${binding.value !== null ? `; value: \`${binding.value}\`` : ""}` +
        `${binding.unit ? `; unit: \`${binding.unit}\`` : ""}` +
        `; basis: **${binding.basis === "paper" ? "paper" : "agent inference"}**` +
        `; confidence: ${Math.round(binding.confidence * 100)}%.`,
      ...(binding.source_refs.length > 0
        ? [`  - Sources: ${binding.source_refs.map((ref) => `\`${ref}\``).join(", ")}`]
        : []),
      ...(binding.inference_note ? [`  - Inference note: ${binding.inference_note}`] : []),
    ]) ?? [];
    const assumptions = enrichment?.assumptions.flatMap((assumption) => [
      `- ${assumption.text} — basis: **${assumption.basis === "paper" ? "paper" : "agent inference"}**; ` +
        `confidence: ${Math.round(assumption.confidence * 100)}%.`,
      ...(assumption.source_refs.length > 0
        ? [`  - Sources: ${assumption.source_refs.map((ref) => `\`${ref}\``).join(", ")}`]
        : []),
      ...(assumption.inference_note ? [`  - Inference note: ${assumption.inference_note}`] : []),
    ]) ?? [];
    return [
      `### Equation candidate — page ${candidate.page}`,
      "",
      enrichment
        ? `> Agent-enriched ${enrichment.classification.replace(/_/g, " ")} candidate. ` +
          `Evidence depth: \`${enrichment.evidence_depth}\`. This remains unverified as an exact equation transcription.`
        : `> Extracted from machine-readable PDF text. Confidence: ${Math.round(candidate.confidence * 100)}%. ` +
          "This is a calculator prefill candidate, not a verified exact equation transcription.",
      "",
      "\\[",
      expression,
      "\\]",
      "",
      ...(enrichment
        ? [
            "#### Resolved symbol bindings",
            "",
            ...(bindings.length > 0 ? bindings : ["_No resolved symbol bindings were supplied._"]),
            "",
            "#### Assumptions",
            "",
            ...(assumptions.length > 0 ? assumptions : ["_No assumptions were supplied._"]),
            "",
            enrichment.calculator.missing_variables.length > 0
              ? `Unresolved Calculator variables: ${enrichment.calculator.missing_variables.map((symbol) => `\`${symbol}\``).join(", ")}.`
              : "Calculator prefill has no unresolved variables.",
            "",
            "#### Calculator-ready prefill",
            "",
            "> Prepared for the generic Calculator control. It has not been evaluated automatically.",
            "",
            "\\[",
            enrichment.calculator.bound_expression || enrichment.calculator.prefill_expression,
            "\\]",
            "",
          ]
        : [
            candidate.symbols.length > 0
              ? `Symbols awaiting binding: ${candidate.symbols.map((symbol) => `\`${symbol}\``).join(", ")}.`
              : "No unresolved symbols were detected by the first-pass formatter.",
            candidate.unit_candidates.length > 0
              ? `Unit candidates: ${candidate.unit_candidates.map((unit) => `\`${unit}\``).join(", ")}.`
              : "Units were not established by the first-pass formatter.",
          ]),
      `Source reference: \`${candidate.source_text_ref}\``,
      "",
    ];
  }) ?? [];
  const evidenceSummary = paperEvidence
    ? [
        "## Paper evidence sidecar",
        "",
        `> Status: \`${paperEvidence.status}\`. Evidence depth: \`${paperEvidence.evidence_level}\`. Revision: ${paperEvidence.revision ?? 1}.`,
        `> Equation candidates: ${paperEvidence.summary.equation_candidate_count}; ` +
          `bindings required: ${paperEvidence.summary.calculator_binding_required_count}.`,
        "> Extracted candidates require agent and evidence review before exact-equation or Theory Graph use.",
        "",
        ...(equationCandidates.length > 0
          ? ["## Extracted equation candidates", "", ...equationCandidates]
          : ["_No calculator-prefill equation candidates were identified in the machine-readable text._", ""]),
      ]
    : [];
  const pages = document.pages.flatMap((page) => [
    `## Page ${page.page}`,
    "",
    page.text || "_No machine-readable text was extracted from this page._",
    "",
  ]);
  return [...provenance, ...evidenceSummary, ...pages].join("\n");
}
