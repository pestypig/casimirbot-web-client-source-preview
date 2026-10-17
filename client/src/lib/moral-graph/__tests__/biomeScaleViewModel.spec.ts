import { describe, expect, it } from "vitest";
import { buildIdeologyContextReflectionV1 } from "@shared/ideology-context-reflection";
import { MORAL_WISDOM_ROOT_ID } from "@shared/moral-graph/wisdom-principles";
import { mapIdeologyReflectionToRecommendedActionAdmission } from "@shared/moral-graph/map-ideology-recommendations-to-admission";
import { calculateFruitionFromReflection } from "@shared/moral-graph/calculate-fruition";
import { buildMoralGraphBiomeScaleViewModel, type MoralGraphNode } from "../biomeScaleViewModel";

function buildFixture() {
  const reflection = buildIdeologyContextReflectionV1({
    generatedAt: "2026-07-02T00:00:00.000Z",
    reflectionId: "ideology-reflection:biome-test",
    graph: {
      graphId: "moral-ideology-graph",
      rootId: MORAL_WISDOM_ROOT_ID,
      source: "docs/ethos/ideology.json",
    },
    input: {
      kind: "user_prompt",
      summary: "Trace organism sensing, maintenance, coordination, and right speech.",
      refs: ["turn:biome-test"],
    },
    matches: {
      exact: [
        {
          nodeId: "direct-observation-before-claim",
          label: "Direct Observation Before Claim",
          score: 0.92,
          reasons: ["observation cue"],
          tags: ["first_principle", "observation"],
          pathToRoot: ["direct-observation-before-claim", MORAL_WISDOM_ROOT_ID],
        },
      ],
      likely: [],
      inferred_lenses: [
        {
          nodeId: "mission-ethos",
          label: "Mission Ethos",
          score: 0.7,
          reasons: ["coordination cue"],
          tags: ["mission", "root_path"],
          pathToRoot: ["mission-ethos", MORAL_WISDOM_ROOT_ID],
        },
      ],
    },
    activated_traits: [],
    tensions: [],
    action_gate_warnings: [],
    claim_boundaries: {
      diagnostic_only: true,
      avoid_character_judgment: true,
      needs_user_confirmation: true,
      missing_evidence: ["organism_boundary_context"],
    },
    recommended_actions: [
      {
        id: "moral-graph.highlight_ideology_lens",
        type: "highlight_ideology_lens",
        label: "Highlight ideology lens",
      },
      {
        id: "moral-graph.ask_for_missing_evidence",
        type: "ask_for_missing_evidence",
        label: "Ask for missing evidence",
      },
    ],
    overlay: {
      title: "MoralGraph reflection",
      summary: "Activated substrate trace.",
      highlightedNodeIds: ["direct-observation-before-claim"],
    },
  });
  const admission = mapIdeologyReflectionToRecommendedActionAdmission(reflection);
  const fruition = calculateFruitionFromReflection({ reflection, admission });
  return buildMoralGraphBiomeScaleViewModel({ reflection, admission, fruition });
}

describe("buildMoralGraphBiomeScaleViewModel", () => {
  it("places living substrate badges before mandate and objective layers", () => {
    const graph = buildFixture();
    const gradient = graph.nodes.find((node: MoralGraphNode) => node.id === "gradient-before-boundary");
    const flux = graph.nodes.find((node: MoralGraphNode) => node.id === "flux-before-action");
    const compartment = graph.nodes.find((node: MoralGraphNode) => node.id === "compartment-before-organism");
    const concentration = graph.nodes.find((node: MoralGraphNode) => node.id === "concentration-before-replication");
    const boundary = graph.nodes.find((node: MoralGraphNode) => node.id === "boundary-before-obligation");
    const sensing = graph.nodes.find((node: MoralGraphNode) => node.id === "sensing-before-judgment");
    const valence = graph.nodes.find((node: MoralGraphNode) => node.id === "valence-before-preference");
    const affordance = graph.nodes.find((node: MoralGraphNode) => node.id === "affordance-before-action");
    const choice = graph.nodes.find((node: MoralGraphNode) => node.id === "choice-before-mandate");
    const communication = graph.nodes.find((node: MoralGraphNode) => node.id === "communication-before-norm");
    const reciprocity = graph.nodes.find((node: MoralGraphNode) => node.id === "reciprocity-before-law");
    const coordination = graph.nodes.find((node: MoralGraphNode) => node.id === "coordination-before-mandate");
    const wisdom = graph.nodes.find((node: MoralGraphNode) => node.id === "direct-observation-before-claim");
    const objective = graph.nodes.find((node: MoralGraphNode) => node.id === MORAL_WISDOM_ROOT_ID);

    expect(gradient?.biome).toBe("pre_boundary_conditions");
    expect(flux?.actionManifestation).toBe("flux");
    expect(compartment?.biome).toBe("pre_boundary_conditions");
    expect(concentration?.actionManifestation).toBe("concentrating");
    expect(boundary?.biome).toBe("substrate_boundary");
    expect(boundary?.scaleBand).toBe("cellular");
    expect(sensing?.biome).toBe("substrate_sensing");
    expect(valence?.biome).toBe("action_selection");
    expect(valence?.actionManifestation).toBe("valuing");
    expect(affordance?.actionManifestation).toBe("affording");
    expect(choice?.scaleBand).toBe("group");
    expect(choice?.actionManifestation).toBe("choosing");
    expect(communication?.biome).toBe("coordination_scale");
    expect(communication?.actionManifestation).toBe("communicating");
    expect(reciprocity?.scaleBand).toBe("institution");
    expect(reciprocity?.actionManifestation).toBe("reciprocating");
    expect(wisdom?.maturity).toBe("procedural");
    expect(objective?.biome).toBe("objective_binding");
    expect(gradient!.x).toBeLessThan(boundary!.x);
    expect(boundary!.x).toBeLessThan(valence!.x);
    expect(valence!.x).toBeLessThan(coordination!.x);
    expect(wisdom?.biome).toBe("substrate_sensing");
    expect(sensing!.x).toBe(wisdom!.x);
    expect(wisdom!.x).toBeLessThan(objective!.x);
    expect(coordination!.x).toBeLessThan(objective!.x);
  });

  it("keeps frontier mechanism badges bounded and non-terminal", () => {
    const graph = buildFixture();
    const frontier = graph.nodes.find((node: MoralGraphNode) => node.id === "microtubule-orch-or-frontier-boundary");

    expect(frontier?.biome).toBe("frontier_mechanism");
    expect(frontier?.maturity).toBe("frontier");
    expect(frontier?.claimBoundaryNotes.join(" ")).toMatch(/not a required truth condition|not.*proof/i);
    expect(frontier?.refusesAuthority).toContain("personhood_proof");
  });

  it("assigns required biome metadata to every visible node", () => {
    const graph = buildFixture();

    expect(graph.nodes.length).toBeGreaterThan(10);
    for (const node of graph.nodes) {
      expect(node.biome).toBeTruthy();
      expect(node.scaleBand).toBeTruthy();
      expect(node.cadence).toBeTruthy();
      expect(node.maturity).toBeTruthy();
      expect(node.actionManifestation).toBeTruthy();
      expect(node.biomeReason).toBeTruthy();
      expect(Array.isArray(node.sourceTheoryBadgeIds)).toBe(true);
      expect(Array.isArray(node.claimBoundaryNotes)).toBe(true);
    }
  });

  it("builds biome-scale cell labels for the watermark layer", () => {
    const graph = buildFixture();
    const boundaryCell = graph.cells.find((cell) => cell.id === "substrate_boundary:cellular");
    const conditionCell = graph.cells.find((cell) => cell.id === "pre_boundary_conditions:molecular");
    const actionCell = graph.cells.find((cell) => cell.id === "action_selection:organism");
    const organismCell = graph.cells.find((cell) => cell.id === "substrate_sensing:organism");

    expect(conditionCell?.label).toBe("Conditions / Molecular");
    expect(boundaryCell?.label).toBe("Boundary / Cellular");
    expect(actionCell?.label).toBe("Action / Organism");
    expect(actionCell?.width).toBeGreaterThan(0);
    expect(boundaryCell?.width).toBeGreaterThan(0);
    expect(boundaryCell?.height).toBeGreaterThan(0);
    expect(organismCell?.label).toBe("Sensing / Organism");
  });

  it("keeps probable actions downstream and claim boundaries distinct", () => {
    const graph = buildFixture();
    const action = graph.nodes.find((node: MoralGraphNode) => node.id.startsWith("action:"));
    const missing = graph.nodes.find((node: MoralGraphNode) => node.id === "missing:organism_boundary_context");

    expect(action?.biome).toBe("mandate_authority");
    expect(action?.x).toBeGreaterThan(graph.nodes.find((node: MoralGraphNode) => node.id === "coordination-before-mandate")!.x);
    expect(missing?.biome).toBe("claim_boundary");
    expect(missing?.maturity).toBe("boundary");
    expect(missing?.actionManifestation).toBe("blocking");
  });

  it("spaces nodes so badges in dense biome-scale cells do not overlap", () => {
    const graph = buildFixture();
    for (let leftIndex = 0; leftIndex < graph.nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < graph.nodes.length; rightIndex += 1) {
        const left = graph.nodes[leftIndex];
        const right = graph.nodes[rightIndex];
        const separated =
          left.x + (left.width ?? 54) <= right.x ||
          right.x + (right.width ?? 54) <= left.x ||
          left.y + (left.height ?? 54) <= right.y ||
          right.y + (right.height ?? 54) <= left.y;

        expect(separated, `${left.id} should not overlap ${right.id}`).toBe(true);
      }
    }
  });
});
