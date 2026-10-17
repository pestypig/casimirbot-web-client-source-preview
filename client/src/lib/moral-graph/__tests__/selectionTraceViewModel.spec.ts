import { describe, expect, it } from "vitest";
import type { MoralGraphBiomeScaleViewModel, MoralGraphNode } from "../biomeScaleViewModel";
import { buildMoralGraphSelectionTraceViewModel } from "../selectionTraceViewModel";

function node(partial: Partial<MoralGraphNode> & Pick<MoralGraphNode, "id" | "biome">): MoralGraphNode {
  return {
    id: partial.id,
    label: partial.label ?? partial.id,
    tone: partial.tone ?? "principle",
    glyph: partial.glyph ?? "S",
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    summary: partial.summary ?? "Test node",
    biome: partial.biome,
    scaleBand: partial.scaleBand ?? "organism",
    cadence: partial.cadence ?? "regulated",
    maturity: partial.maturity ?? "procedural",
    actionManifestation: partial.actionManifestation ?? "responding",
    sourceTheoryBadgeIds: partial.sourceTheoryBadgeIds ?? [],
    claimBoundaryNotes: partial.claimBoundaryNotes ?? [],
    biomeReason: partial.biomeReason ?? "test",
    procedureOperator: partial.procedureOperator,
  };
}

function graph(): Pick<MoralGraphBiomeScaleViewModel, "nodes" | "edges"> {
  return {
    nodes: [
      node({
        id: "gradient-before-boundary",
        biome: "pre_boundary_conditions",
        scaleBand: "molecular",
        maturity: "substrate",
        actionManifestation: "conditioning",
      }),
      node({
        id: "flux-before-action",
        biome: "pre_boundary_conditions",
        scaleBand: "molecular",
        maturity: "substrate",
        actionManifestation: "flux",
      }),
      node({
        id: "boundary-before-obligation",
        biome: "substrate_boundary",
        maturity: "substrate",
        actionManifestation: "boundary",
      }),
      node({
        id: "sensing-before-judgment",
        biome: "substrate_sensing",
        actionManifestation: "sensing",
      }),
      node({
        id: "maintenance-before-optimization",
        biome: "maintenance_response",
        actionManifestation: "maintaining",
      }),
      node({
        id: "valence-before-preference",
        biome: "action_selection",
        actionManifestation: "valuing",
      }),
      node({
        id: "choice-before-mandate",
        biome: "action_selection",
        scaleBand: "group",
        actionManifestation: "choosing",
      }),
      node({
        id: "coordination-before-mandate",
        biome: "coordination_scale",
        actionManifestation: "coordinating",
      }),
      node({
        id: "direct-observation-before-claim",
        biome: "objective_binding",
        maturity: "objective",
        actionManifestation: "objective_binding",
      }),
      node({
        id: "missing:organism_boundary_context",
        biome: "claim_boundary",
        tone: "boundary",
        maturity: "boundary",
        actionManifestation: "blocking",
        procedureOperator: "blocks",
      }),
    ],
    edges: [
      { id: "e:gradient:flux", from: "gradient-before-boundary", to: "flux-before-action", label: "condition trace", tone: "emerald" },
      { id: "e:flux:boundary", from: "flux-before-action", to: "boundary-before-obligation", label: "condition to boundary", tone: "emerald" },
      { id: "e:boundary:sensing", from: "boundary-before-obligation", to: "sensing-before-judgment", label: "trace", tone: "emerald" },
      { id: "e:sensing:maintenance", from: "sensing-before-judgment", to: "maintenance-before-optimization", label: "trace", tone: "emerald" },
      { id: "e:maintenance:valence", from: "maintenance-before-optimization", to: "valence-before-preference", label: "trace", tone: "emerald" },
      { id: "e:valence:choice", from: "valence-before-preference", to: "choice-before-mandate", label: "trace", tone: "emerald" },
      { id: "e:choice:coordination", from: "choice-before-mandate", to: "coordination-before-mandate", label: "trace", tone: "emerald" },
      { id: "e:coordination:objective", from: "coordination-before-mandate", to: "direct-observation-before-claim", label: "trace", tone: "cyan" },
      { id: "e:objective:missing", from: "direct-observation-before-claim", to: "missing:organism_boundary_context", label: "claim boundary", tone: "rose" },
    ],
  };
}

describe("buildMoralGraphSelectionTraceViewModel", () => {
  it("starts neutral when no local badge is selected", () => {
    const fixture = graph();
    const trace = buildMoralGraphSelectionTraceViewModel({ ...fixture, selectedNodeIds: [] });

    expect(trace.traceStatus).toBe("idle");
    expect(trace.activeNodeIds.size).toBe(0);
    expect(trace.candidateNodeIds.size).toBe(0);
    expect(trace.blockedNodeIds.size).toBe(0);
    expect(trace.activeEdgeIds.size).toBe(0);
    expect(trace.candidateEdgeIds.size).toBe(0);
  });

  it("offers earlier substrate dependencies as candidates when a later complexity badge is selected", () => {
    const fixture = graph();
    const trace = buildMoralGraphSelectionTraceViewModel({
      ...fixture,
      selectedNodeIds: ["direct-observation-before-claim"],
    });

    expect(trace.traceStatus).toBe("requires_boundary_check");
    expect(trace.activeNodeIds.has("direct-observation-before-claim")).toBe(true);
    expect(trace.activeNodeIds.has("gradient-before-boundary")).toBe(false);
    expect(trace.activeNodeIds.has("boundary-before-obligation")).toBe(false);
    expect(trace.activeNodeIds.has("sensing-before-judgment")).toBe(false);
    expect(trace.candidateNodeIds.has("gradient-before-boundary")).toBe(true);
    expect(trace.candidateNodeIds.has("boundary-before-obligation")).toBe(true);
    expect(trace.candidateNodeIds.has("sensing-before-judgment")).toBe(true);
    expect(trace.candidateNodeIds.has("maintenance-before-optimization")).toBe(true);
    expect(trace.candidateNodeIds.has("valence-before-preference")).toBe(true);
    expect(trace.candidateNodeIds.has("choice-before-mandate")).toBe(true);
    expect(trace.candidateNodeIds.has("coordination-before-mandate")).toBe(true);
    expect(trace.candidateNodeIds.has("missing:organism_boundary_context")).toBe(true);
    expect(trace.candidateEdgeIds.has("e:boundary:sensing")).toBe(true);
    expect(trace.candidateEdgeIds.has("e:maintenance:valence")).toBe(true);
    expect(trace.candidateEdgeIds.has("e:choice:coordination")).toBe(true);
    expect(trace.candidateEdgeIds.has("e:objective:missing")).toBe(true);
  });

  it("offers only the next scale when the selected trace is complete to the current scale", () => {
    const fixture = graph();
    const trace = buildMoralGraphSelectionTraceViewModel({
      ...fixture,
      selectedNodeIds: ["gradient-before-boundary", "boundary-before-obligation", "sensing-before-judgment"],
    });

    expect(trace.traceStatus).toBe("building");
    expect(trace.activeNodeIds.has("gradient-before-boundary")).toBe(true);
    expect(trace.activeNodeIds.has("boundary-before-obligation")).toBe(true);
    expect(trace.activeNodeIds.has("sensing-before-judgment")).toBe(true);
    expect(trace.candidateNodeIds.has("maintenance-before-optimization")).toBe(true);
    expect(trace.candidateNodeIds.has("valence-before-preference")).toBe(false);
    expect(trace.candidateNodeIds.has("coordination-before-mandate")).toBe(false);
    expect(trace.blockedNodeIds.has("direct-observation-before-claim")).toBe(true);
  });

  it("requires action-selection support before coordination and mandate layers", () => {
    const fixture = graph();
    const trace = buildMoralGraphSelectionTraceViewModel({
      ...fixture,
      selectedNodeIds: ["coordination-before-mandate"],
    });

    expect(trace.traceStatus).toBe("requires_boundary_check");
    expect(trace.candidateNodeIds.has("maintenance-before-optimization")).toBe(true);
    expect(trace.candidateNodeIds.has("valence-before-preference")).toBe(true);
    expect(trace.candidateNodeIds.has("choice-before-mandate")).toBe(true);
    expect(trace.activeNodeIds.has("coordination-before-mandate")).toBe(true);
    expect(trace.blockedNodeIds.has("direct-observation-before-claim")).toBe(true);
  });

  it("treats selected claim-boundary badges as conflict/check posture", () => {
    const fixture = graph();
    const trace = buildMoralGraphSelectionTraceViewModel({
      ...fixture,
      selectedNodeIds: ["missing:organism_boundary_context"],
    });

    expect(trace.traceStatus).toBe("conflict");
    expect(trace.conflictNodeIds.has("missing:organism_boundary_context")).toBe(true);
    expect(trace.traceReason).toMatch(/boundary|frontier|check/i);
  });
});
