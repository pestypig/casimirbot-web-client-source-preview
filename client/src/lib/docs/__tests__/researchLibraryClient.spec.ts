import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHelixPaperEvidenceSidecarV1 } from "@shared/helix-paper-evidence-sidecar";
import { applyHelixPaperEvidenceEnrichmentV1 } from "@shared/helix-paper-evidence-enrichment";
import type { HelixResearchLibraryDocument } from "@shared/helix-research-library";
import {
  deleteResearchLibraryDocument,
  researchLibraryDocumentToMarkdown,
} from "../researchLibraryClient";

describe("researchLibraryClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes an encoded profile-library document through the scoped API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await deleteResearchLibraryDocument("research:paper/one");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research-library/research%3Apaper%2Fone",
      expect.objectContaining({
        method: "DELETE",
        credentials: "same-origin",
      }),
    );
  });

  it("preserves the server error when deletion fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "research_library_document_not_found" }),
    }));

    await expect(deleteResearchLibraryDocument("research:missing")).rejects.toThrow(
      "research_library_document_not_found",
    );
  });

  it("renders saved equation candidates as display math for the generic Calculator action", () => {
    const pages = [{
      page: 2,
      text: "E = mc^2",
      text_char_count: 8,
      extraction_status: "text" as const,
      source_text_ref: "artifact://paper#page=2&text",
    }];
    const sidecar = buildHelixPaperEvidenceSidecarV1({
      document_id: "research:calculator-paper",
      source_integrity_hash: "hash:calculator-paper",
      extraction_status: "full_text_usable",
      pages,
      generated_at: "2026-07-16T00:00:00.000Z",
    });
    const document: HelixResearchLibraryDocument = {
      schema: "helix.research_library_document.v1",
      document_id: "research:calculator-paper",
      viewer_ref: "private-research:account-token:calculator-paper-token",
      private_translation_scope: {
        doc_path: "research-library/private-research%3Aaccount-token%3Acalculator-paper-token",
        source_id: "document_markdown:research-library/private-research%3Aaccount-token%3Acalculator-paper-token",
        mailbox_thread_id: "helix-ask:private-research:account-token",
      },
      profile_id: "profile:test",
      title: "Calculator paper",
      source_url: "https://example.test/paper.pdf",
      source_kind: "pdf",
      source_pdf_ref: "artifact://paper",
      source_integrity_hash: "hash:calculator-paper",
      paper_result_id: null,
      query: null,
      page_count: 1,
      text_char_count: 8,
      extraction_status: "full_text_usable",
      language: null,
      sidecar_refs: [{
        sidecar_id: sidecar.sidecar_id,
        kind: "paper_evidence",
        artifact_ref: sidecar.sidecar_id,
        page_start: 2,
        page_end: 2,
        created_at: sidecar.generated_at,
      }],
      created_at: "2026-07-16T00:00:00.000Z",
      updated_at: "2026-07-16T00:00:00.000Z",
      private: true,
      raw_content_included: true,
      pages,
      paper_evidence_sidecars: [sidecar],
    };

    const markdown = researchLibraryDocumentToMarkdown(document);
    expect(markdown).toContain("## Extracted equation candidates");
    expect(markdown).toContain("\\[\nE = mc^2\n\\]");
    expect(markdown).toContain("calculator prefill candidate");
    expect(markdown).toContain("not a verified exact equation transcription");

    const enriched = applyHelixPaperEvidenceEnrichmentV1({
      sidecar,
      pages,
      proposal: {
        schema: "helix.paper_evidence_enrichment_proposal.v1",
        proposal_id: "proposal:calculator-paper:eq1",
        document_id: document.document_id,
        sidecar_id: sidecar.sidecar_id,
        source_integrity_hash: document.source_integrity_hash,
        expected_revision: 1,
        agent_authored: true,
        equation_updates: [{
          equation_id: "paper-equation:p2:l1",
          classification: "definition",
          normalized_latex: "E = mc^2",
          evidence_depth: "page_grounded",
          symbol_bindings: [{
            symbol: "c",
            meaning: "speed of light",
            value: 299792458,
            unit: "m/s",
            basis: "paper",
            source_refs: [pages[0].source_text_ref],
            inference_note: null,
            confidence: 0.95,
          }],
          assumptions: [{
            text: "Use SI units.",
            basis: "agent_inference",
            source_refs: [],
            inference_note: "Chosen for Calculator prefill; not stated by the excerpt.",
            confidence: 0.8,
          }],
          calculator: {
            prefill_expression: "E = m*c^2",
            bound_expression: "E = m*(299792458)^2",
            missing_variables: ["E", "m"],
            auto_run_allowed: false,
          },
          exact_equation_authority_requested: false,
        }],
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    });
    expect(enriched.ok).toBe(true);
    if (!enriched.ok) return;
    const enrichedMarkdown = researchLibraryDocumentToMarkdown({
      ...document,
      paper_evidence_sidecars: [enriched.sidecar],
    });
    expect(enrichedMarkdown).toContain("Resolved symbol bindings");
    expect(enrichedMarkdown).toContain("`c` — speed of light");
    expect(enrichedMarkdown).toContain("speed of light");
    expect(enrichedMarkdown).toContain("basis: **agent inference**");
    expect(enrichedMarkdown).toContain("Calculator-ready prefill");
    expect(enrichedMarkdown).toContain("Unresolved Calculator variables: `E`, `m`.");
    expect(enrichedMarkdown).toContain("E = m*(299792458)^2");
    expect(enrichedMarkdown).toContain("It has not been evaluated automatically");
    expect(enrichedMarkdown).not.toContain("â€”");
  });
});
