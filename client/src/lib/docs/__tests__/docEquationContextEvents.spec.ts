import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocEquationContextArtifactV1 } from "@shared/contracts/doc-equation-context.v1";
import {
  DOC_EQUATION_CONTEXT_EVENT,
  buildDocEquationContextAskPrompt,
  buildDocEquationContextLiveEventPayload,
  buildDocEquationContextNarration,
  emitDocEquationContextArtifact,
  summarizeDocEquationContext,
} from "../docEquationContextEvents";
import { useDocEquationContextStore } from "@/store/useDocEquationContextStore";

const makeArtifact = (): DocEquationContextArtifactV1 => ({
  contractVersion: "doc_equation_context/v1",
  generatedAt: "2026-06-10T00:00:00.000Z",
  docPath: "docs/research/nhm2-current-status-whitepaper.md",
  equationId: "nhm2-same-chart-full-tensor-ledger",
  equationLabel: "Same-chart full tensor ledger",
  sectionAnchor: "57-workstation-equation-anchors",
  uri: "workspace://workspace/docs/research/nhm2-current-status-whitepaper.md#nhm2-same-chart-full-tensor-ledger",
  anchor: "nhm2-same-chart-full-tensor-ledger",
  latex: "\\mathcal{T}^{\\rm same-chart}_{\\rm full}=\\{T_{00},T_{0i},T_{ii},T_{ij,\\ i\\ne j}\\}.",
  actionId: "open-same-chart-full-tensor-artifact",
  actionKind: "artifact_backed_theory_run",
  badgeIds: ["physics.gr.3p1_decomposition", "nhm2.tensor.same_chart_full_tensor"],
  preferredBadgeId: "nhm2.tensor.same_chart_full_tensor",
  atlasLensId: "warp_gr_nhm2",
  atlasGroupId: "warp.nhm2.diagnostic_path",
  openedPanels: ["theory-badge-graph", "scientific-calculator"],
  claimBoundaryNotes: ["Full-tensor completeness is an evidence ledger, not a propulsion claim."],
  actionClaimBoundaryNote: "Missing T0i or off-diagonal Tij is a blocker, not a zero.",
  commentaryHints: {
    summary: "Same-chart full tensor ledger opens runtime evidence.",
    scope: "runtime_artifact",
    prohibitedClaims: ["validated", "viable", "certified transport"],
    suggestedExplanationFocus: ["runtime artifact status", "missing or proxy blockers"],
  },
});

describe("doc equation context events", () => {
  beforeEach(() => {
    useDocEquationContextStore.getState().clearContexts();
  });

  it("records and dispatches a typed context artifact", () => {
    const artifact = makeArtifact();
    const dispatched: Event[] = [];
    const target = {
      dispatchEvent: vi.fn((event: Event) => {
        dispatched.push(event);
        return true;
      }),
    };

    const result = emitDocEquationContextArtifact(artifact, {
      target,
      emitLiveEvent: false,
    });

    expect(result).toBe(artifact);
    expect(target.dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatched[0]?.type).toBe(DOC_EQUATION_CONTEXT_EVENT);
    expect((dispatched[0] as CustomEvent<DocEquationContextArtifactV1>).detail).toEqual(artifact);
    expect(useDocEquationContextStore.getState().latestContext).toEqual(artifact);
  });

  it("summarizes context without making answer-authority claims", () => {
    const summary = summarizeDocEquationContext(makeArtifact());

    expect(summary).toContain("Doc equation context");
    expect(summary).toContain("nhm2.tensor.same_chart_full_tensor");
    expect(summary).toContain("runtime artifact");
    expect(summary).not.toMatch(/validated|viable|certified transport/i);
  });

  it("builds a richer narration for on-demand Ask context", () => {
    const narration = buildDocEquationContextNarration(makeArtifact());

    expect(narration).toContain("Source URI: workspace://workspace/docs/research");
    expect(narration).toContain("preferred evidence target: nhm2.tensor.same_chart_full_tensor");
    expect(narration).toContain("observation-only");
    expect(narration).not.toMatch(/certified transport|NHM2 proves viability|Casimir source proven/i);
  });

  it("builds an Ask prompt that preserves exact equation context and claim boundaries", () => {
    const prompt = buildDocEquationContextAskPrompt(makeArtifact());

    expect(prompt).toContain("Use this exact source URI");
    expect(prompt).toContain("Same-chart full tensor ledger");
    expect(prompt).toContain("Preferred evidence target: nhm2.tensor.same_chart_full_tensor");
    expect(prompt).toContain("Avoid these promotional claims");
  });

  it("builds an Ask-visible receipt that is observation-only", () => {
    const artifact = makeArtifact();
    const payload = buildDocEquationContextLiveEventPayload(artifact, "helix-ask:desktop");

    expect(payload).toMatchObject({
      contextId: "helix-ask:desktop",
      traceId: "doc-equation-context:nhm2-same-chart-full-tensor-ledger:open-same-chart-full-tensor-artifact",
      entry: {
        tool: "docs-viewer.doc_equation_context",
        meta: {
          kind: "doc_equation_context",
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
          narration: expect.stringContaining("Doc equation context: Same-chart full tensor ledger."),
          artifact,
        },
      },
    });
  });
});
