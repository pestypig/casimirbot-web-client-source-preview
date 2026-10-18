// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CharacterSituationComparisonV1 } from "@shared/character-situation-comparison";
import { buildIdeologyContextReflectionV1 } from "@shared/ideology-context-reflection";
import { buildMoralBadgeLocatorV1, type MoralBadgeLocatorV1 } from "@shared/moral-badge-locator";
import { buildProbabilityTerrainV1 } from "@shared/probability-terrain";
import { REINHARD_VON_LOHENGRAMM_PROFILE } from "@shared/moral-graph/character-profiles/reinhard-von-lohengramm";
import { buildIdeologyGraph } from "@shared/moral-graph/build-ideology-graph";
import { compareCharacterSituation } from "@shared/moral-graph/compare-character-situation";
import type { IdeologyGraphDocument } from "@shared/moral-graph/ideology-graph-types";
import { mapIdeologyReflectionToRecommendedActionAdmission } from "@shared/moral-graph/map-ideology-recommendations-to-admission";
import { MORAL_WISDOM_PRINCIPLES, MORAL_WISDOM_ROOT_ID, type MoralWisdomPrinciple } from "@shared/moral-graph/wisdom-principles";
import { useFruitionCalculatorStore } from "@/store/useFruitionCalculatorStore";
import MoralGraphPanel from "../panels/MoralGraphPanel";

const graphDocument: IdeologyGraphDocument = {
  version: 1,
  rootId: MORAL_WISDOM_ROOT_ID,
  actionGatePolicy: {
    version: 1,
    covered_action_tags: ["covered-action"],
    legal_key_tags: ["legal-key"],
    ethos_key_tags: ["ethos-key"],
    hard_fail_ids: {
      missing_legal_key: "IDEOLOGY_MISSING_LEGAL_KEY",
    },
  },
  nodes: [
    {
      id: MORAL_WISDOM_ROOT_ID,
      title: "Wisdom First Principles",
      tags: ["objective_binding"],
      children: MORAL_WISDOM_PRINCIPLES.map((principle: MoralWisdomPrinciple) => principle.id),
    },
    ...MORAL_WISDOM_PRINCIPLES.map((principle: MoralWisdomPrinciple) => ({
      id: principle.id,
      title: principle.label,
      summary: principle.summary,
      tags: principle.tags,
    })),
  ],
};

const characterGraph = buildIdeologyGraph(graphDocument);

function buildFixture() {
  const reflection = buildIdeologyContextReflectionV1({
    generatedAt: "2026-06-01T00:00:00.000Z",
    reflectionId: "ideology-reflection:panel",
    graph: {
      graphId: "moral-ideology-graph",
      rootId: "wisdom-first-principles",
      source: "docs/ethos/ideology.json",
    },
    input: {
      kind: "user_prompt",
      summary: "Reflect this through right speech, mediation, and two-key approval.",
      refs: ["turn:panel", "doc:ethos"],
    },
    matches: {
      exact: [
        {
          nodeId: "right-speech-infrastructure",
          label: "Right Speech Infrastructure",
          score: 0.9,
          reasons: ["exact label match"],
          tags: ["speech", "posture"],
          pathToRoot: ["right-speech-infrastructure", "mission-ethos", "wisdom-first-principles"],
        },
      ],
      likely: [
        {
          nodeId: "two-key-approval",
          label: "Two-Key Approval",
          score: 0.75,
          reasons: ["nearby safeguard"],
          tags: ["covered-action"],
          pathToRoot: ["two-key-approval", "mission-ethos", "wisdom-first-principles"],
        },
      ],
      inferred_lenses: [
        {
          nodeId: "skillful-mediation",
          label: "Skillful Mediation",
          score: 0.75,
          reasons: ["outer-edge lens activation"],
          tags: ["trait", "outer_edge"],
          pathToRoot: ["skillful-mediation", "right-speech-infrastructure", "mission-ethos", "wisdom-first-principles"],
        },
      ],
    },
    activated_traits: [
      {
        nodeId: "skillful-mediation",
        label: "Skillful Mediation",
        confidence: 0.75,
        pathToRoot: ["skillful-mediation", "right-speech-infrastructure", "mission-ethos", "wisdom-first-principles"],
        tags: ["trait", "outer_edge"],
      },
    ],
    tensions: [
      {
        nodeIds: ["restraint", "ambition-discipline"],
        description: "Capability pressure may outrun restraint.",
        severity: "medium",
      },
    ],
    action_gate_warnings: [
      {
        gateId: "two-key-approval",
        label: "Two-Key Approval",
        warning: "Covered action needs checks.",
        requiredCheck: "legal_key_and_ethos_key",
      },
    ],
    claim_boundaries: {
      diagnostic_only: true,
      avoid_character_judgment: true,
      needs_user_confirmation: true,
      missing_evidence: ["jurisdiction_context"],
    },
    recommended_actions: [
      {
        id: "moral-graph.highlight_ideology_lens",
        type: "highlight_ideology_lens",
        label: "Highlight ideology lens",
      },
      {
        id: "moral-graph.show_nearby_safeguard",
        type: "show_nearby_safeguard",
        label: "Show nearby safeguard",
      },
      {
        id: "moral-graph.ask_for_missing_evidence",
        type: "ask_for_missing_evidence",
        label: "Ask for missing evidence",
      },
      {
        id: "moral-graph.run_command",
        type: "run_command",
        label: "Run command",
      },
    ],
    overlay: {
      title: "MoralGraph reflection",
      summary: "Activated lens: Skillful Mediation.",
      highlightedNodeIds: ["skillful-mediation", "right-speech-infrastructure", "two-key-approval"],
    },
  });
  return {
    reflection,
    admission: mapIdeologyReflectionToRecommendedActionAdmission(reflection),
  };
}

function buildLocatorFixture(): MoralBadgeLocatorV1 {
  return buildMoralBadgeLocatorV1({
    generatedAt: "2026-06-01T00:00:00.000Z",
    locatorId: "moral-badge-locator:panel",
    input: {
      kind: "user_prompt",
      summary: "Reflect this through direct observation and right speech.",
      refs: ["turn:panel"],
    },
    graph: {
      graphId: "moral-graph",
      rootId: "wisdom-first-principles",
      source: "docs/ethos/ideology.json",
    },
    locatedBadges: {
      exact: [
        {
          nodeId: "direct-observation-before-claim",
          label: "Direct Observation Before Claim",
          confidence: 1,
          matchType: "node_id",
          pathToBinding: ["direct-observation-before-claim", "wisdom-first-principles"],
          proceduralExpression: "principle.direct-observation-before-claim supports result.procedural_posture",
          reasonCodes: ["moral_badge_locator", "match_type:node_id"],
          tags: ["first_principle", "observation"],
        },
        {
          nodeId: "right-speech-and-accurate-formulation",
          label: "Right Speech and Accurate Formulation",
          confidence: 0.9,
          matchType: "label",
          pathToBinding: ["right-speech-and-accurate-formulation", "wisdom-first-principles"],
          proceduralExpression: "principle.right-speech-and-accurate-formulation constrains result.procedural_posture",
          reasonCodes: ["moral_badge_locator", "match_type:label"],
          tags: ["first_principle", "right_speech"],
        },
      ],
      likely: [],
      inferred: [],
    },
    probabilityTerrain: buildProbabilityTerrainV1({
      graphKind: "moral_badge_graph",
      candidates: [
        {
          id: "direct-observation-before-claim",
          weight: 1,
          renderChunkId: "moral:wisdom-first-principles:root_near:node_id",
          semanticChunkId: "moral:first_principle:supported_action_posture:node_id",
        },
        {
          id: "right-speech-and-accurate-formulation",
          weight: 0.9,
          renderChunkId: "moral:wisdom-first-principles:root_near:label",
          semanticChunkId: "moral:first_principle:constrained_action_posture:label",
        },
      ],
    }),
    locatedBindings: [
      {
        id: "wisdom-first-principles",
        label: "Wisdom First Principles",
        bindingType: "objective_binding",
        pathNodeIds: ["direct-observation-before-claim", "wisdom-first-principles"],
        reasonCodes: ["located_path_to_binding"],
        confidence: 1,
      },
    ],
    comparisonSeed: {
      selectedNodeIds: [
        "direct-observation-before-claim",
        "right-speech-and-accurate-formulation",
        "wisdom-first-principles",
      ],
      proceduralExpression:
        "principle.direct-observation-before-claim supports result.procedural_posture + principle.right-speech-and-accurate-formulation constrains result.procedural_posture => constrained_action_posture",
      expectedFruitionPosture: "constrained_action_posture",
      reasonCodes: ["moral_badge_locator", "deterministic_badge_comparison"],
    },
  });
}

function buildCharacterComparisonFixture(): CharacterSituationComparisonV1 {
  return compareCharacterSituation({
    graph: characterGraph,
    profile: REINHARD_VON_LOHENGRAMM_PROFILE,
    situationText:
      "A corrupt inherited noble authority blocks agency while a cold advisor suggests strategic leverage.",
    refs: ["turn:panel"],
    generatedAt: "2026-06-01T00:00:00.000Z",
    comparisonId: "character-situation:panel",
  });
}

function renderPanel(locator?: MoralBadgeLocatorV1, characterComparison?: CharacterSituationComparisonV1) {
  const { reflection, admission } = buildFixture();
  return render(
    <MoralGraphPanel
      reflection={reflection}
      admission={admission}
      locator={locator}
      characterComparison={characterComparison}
    />,
  );
}

function openObjectiveLens(name = "Wisdom objective binding lens") {
  fireEvent.click(screen.getByRole("button", { name }));
}

function openObjectiveBindings() {
  openObjectiveLens();
}

afterEach(() => {
  useFruitionCalculatorStore.getState().clear();
  cleanup();
});

describe("MoralGraphPanel", () => {
  it("renders active lenses and path to root", () => {
    renderPanel();

    expect(screen.getByTestId("moral-graph-map-scrollport")).toBeTruthy();
    expect(screen.getByLabelText("MoralGraph objective lenses")).toBeTruthy();
    expect(screen.queryByTestId("moral-graph-objective-binding-overlay")).toBeNull();
    const rootBadge = screen.getByRole("button", { name: "Wisdom First Principles" });
    expect(rootBadge).toBeTruthy();
    expect(rootBadge.getAttribute("title")).toBeNull();
    const observationBadge = screen.getByRole("button", { name: "Direct Observation Before Claim" });
    expect(observationBadge).toBeTruthy();
    expect(observationBadge.getAttribute("title")).toBeNull();
    expect(screen.getByRole("button", { name: "Impermanence, Entropy, and Revision" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Interdependence and Yin-Yang Balance" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Falsifiability and Truth Convergence" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Right Speech and Accurate Formulation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Non-Harm and Compassionate Constraint" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fairness, Due Process, and Justification" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skillful Action Under Uncertainty" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skillful Mediation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /mission ethos/i })).toBeTruthy();
    expect(screen.getAllByTestId("moral-graph-badge-node").length).toBeGreaterThan(12);

    openObjectiveLens("Wisdom objective binding lens");
    expect(screen.getByText("Objective Bindings")).toBeTruthy();
    expect(screen.getByTestId("moral-graph-objective-binding-overlay")).toBeTruthy();
    expect(screen.getByText("MoralGraph Wisdom")).toBeTruthy();
    expect(screen.getByText("Subject")).toBeTruthy();
    expect(screen.getByText("Objective state")).toBeTruthy();
    expect(screen.getByText("Bindings")).toBeTruthy();
    expect(screen.getByText("Badge procedure")).toBeTruthy();
    expect(screen.getByText("Authority boundary")).toBeTruthy();
    expect(screen.getByText(/skillful mediation -> right speech infrastructure -> mission ethos -> wisdom first principles/i)).toBeTruthy();
  });

  it("zooms the moral graph with bottom-right controls and keeps biome words readable", async () => {
    renderPanel();

    const scrollport = screen.getByTestId("moral-graph-map-scrollport");
    const initialZoom = Number(scrollport.getAttribute("data-zoom-level"));
    const initialWordmarkFontSize = Number(
      screen.getAllByTestId("moral-graph-cell-watermark-word")[0].getAttribute("data-font-size"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));

    await waitFor(() => {
      expect(Number(scrollport.getAttribute("data-zoom-level"))).toBeLessThan(initialZoom);
      expect(Number(screen.getAllByTestId("moral-graph-cell-watermark-word")[0].getAttribute("data-font-size"))).toBeGreaterThan(
        initialWordmarkFontSize,
      );
    });

    const zoomedOut = Number(scrollport.getAttribute("data-zoom-level"));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    await waitFor(() => {
      expect(Number(scrollport.getAttribute("data-zoom-level"))).toBeGreaterThan(zoomedOut);
    });
  });

  it("shows badge procedure details only in the custom hover card", () => {
    renderPanel();

    const observationBadge = screen.getByRole("button", { name: "Direct Observation Before Claim" });
    expect(screen.queryByTestId("moral-graph-hover-card")).toBeNull();

    fireEvent.click(observationBadge);
    expect(screen.queryByTestId("moral-graph-hover-card")).toBeNull();

    fireEvent.mouseEnter(observationBadge);
    expect(screen.getByTestId("moral-graph-hover-card")).toBeTruthy();
    expect(screen.getByText("principle.direct-observation-before-claim supports result.procedural_posture")).toBeTruthy();
    expect(screen.getByText("Start the procedure from observed evidence before naming a claim.")).toBeTruthy();

    fireEvent.mouseLeave(observationBadge);
    expect(screen.queryByTestId("moral-graph-hover-card")).toBeNull();
  });

  it("shows how a selected Moral badge contributes to the action procedure", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Right Speech Infrastructure" }));
    openObjectiveLens("Wisdom objective binding lens");

    expect(screen.getAllByText(/constraint/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/constrains/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Right Speech Infrastructure constrains how the action may be formulated.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/execution authority/i).length).toBeGreaterThan(0);
  });

  it("combines multiple selected badges into a procedural outcome", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Direct Observation Before Claim" }));
    fireEvent.click(screen.getByRole("button", { name: "Right Speech and Accurate Formulation" }));
    openObjectiveBindings();

    expect(screen.getByText("Procedural trace")).toBeTruthy();
    expect(screen.getByText("3 badges")).toBeTruthy();
    expect(screen.getAllByText(/principle\.direct-observation-before-claim supports result\.procedural_posture/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/principle\.right-speech-and-accurate-formulation constrains result\.procedural_posture/).length).toBeGreaterThan(0);
    expect(screen.getByText("Selected badges constrain or balance the action posture.")).toBeTruthy();
    expect(screen.getAllByText(/procedure\.direct-observation-before-claim|principle\.direct-observation-before-claim/i).length).toBeGreaterThan(0);
  });

  it("uses a Moral badge locator artifact to seed the visible comparison", () => {
    renderPanel(buildLocatorFixture());
    openObjectiveBindings();

    expect(screen.getByTestId("moral-graph-probability-terrain")).toBeTruthy();
    const terrainField = screen.getByTestId("moral-graph-probability-terrain-field");
    expect(terrainField).toBeTruthy();
    expect(terrainField.getAttribute("data-sample-resolution")).toBe("coarse");
    expect(screen.getAllByTestId("probability-terrain-contour").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("probability-terrain-chunk").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("probability-terrain-bridge").length).toBeGreaterThan(0);
    expect(screen.getByText("Probability Terrain")).toBeTruthy();
    expect(screen.getByText(/Placement certainty/i)).toBeTruthy();
    expect(screen.queryByText("Located comparison")).toBeNull();
    expect(screen.getAllByText(/principle\.direct-observation-before-claim supports result\.procedural_posture/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/principle\.right-speech-and-accurate-formulation constrains result\.procedural_posture/).length).toBeGreaterThan(0);
  });

  it("renders a normal character badge that opens a character preset binding", () => {
    renderPanel(buildLocatorFixture(), buildCharacterComparisonFixture());

    const characterBadge = screen.getByRole("button", { name: "Sovereign Ambition Profile" });
    expect(characterBadge).toBeTruthy();
    expect(screen.queryByText("Sovereign Ambition Profile")).toBeNull();

    fireEvent.click(characterBadge);
    expect(screen.getByText("MoralGraph Character")).toBeTruthy();
    expect(screen.getByText("Subject")).toBeTruthy();
    expect(screen.getByText("Objective state")).toBeTruthy();
    expect(screen.getByText("Bindings")).toBeTruthy();
    expect(screen.getAllByText(/Sovereign Ambition Profile/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/sovereign ambition 0\.98/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/displacement|conquest|forced restructuring/i).length).toBeGreaterThan(0);
  });

  it("renders safeguards, action gate warnings, tensions, and claim boundaries", () => {
    renderPanel();
    openObjectiveBindings();

    expect(screen.getByRole("button", { name: "Two-Key Approval" })).toBeTruthy();
    expect(screen.getByText("legal_key_and_ethos_key")).toBeTruthy();
    expect(screen.getByText("Possible tensions")).toBeTruthy();
    expect(screen.getByText("Capability pressure may outrun restraint.")).toBeTruthy();
    expect(screen.getByText("Missing check: jurisdiction context")).toBeTruthy();
    expect(screen.getByText("Claim boundaries")).toBeTruthy();
  });

  it("renders admission state, risk, display policy, and evidence refs", () => {
    renderPanel();
    openObjectiveBindings();

    expect(screen.getByText(/Admission state:/)).toBeTruthy();
    expect(screen.getAllByText(/Risk: claim sensitive/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Display policy:/).length).toBeGreaterThan(0);
    expect(screen.getByText("Evidence refs: turn:panel, doc:ethos")).toBeTruthy();
    expect(screen.getAllByText("Ask user").length).toBeGreaterThan(0);
    expect(screen.getByText("Blocked")).toBeTruthy();
  });

  it("does not render execution affordances for evidence-only or blocked admissions", () => {
    renderPanel();

    expect(screen.queryByRole("button", { name: /execute/i })).toBeNull();
  });

  it("toggles the objective binding overlay from the Fruition lens block", () => {
    renderPanel();

    expect(screen.queryByTestId("moral-graph-objective-binding-overlay")).toBeNull();
    openObjectiveBindings();
    expect(screen.getByTestId("moral-graph-objective-binding-overlay")).toBeTruthy();
    openObjectiveBindings();
    expect(screen.queryByTestId("moral-graph-objective-binding-overlay")).toBeNull();
  });

  it("loads the current graph expression into the Fruition Calculator panel", () => {
    const openedPanels: string[] = [];
    const listener = (event: Event) => {
      openedPanels.push((event as CustomEvent<{ id: string }>).detail.id);
    };
    window.addEventListener("open-helix-panel", listener);
    renderPanel();
    openObjectiveBindings();

    fireEvent.click(screen.getByRole("button", { name: "Load to Fruition Calculator" }));

    expect(useFruitionCalculatorStore.getState().currentExpression?.artifactId).toBe("fruition_procedure_expression");
    expect(openedPanels).toContain("fruition-calculator");
    window.removeEventListener("open-helix-panel", listener);
  });
});
