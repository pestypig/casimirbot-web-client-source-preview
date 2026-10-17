import { buildIdeologyContextReflectionV1 } from "@shared/ideology-context-reflection";
import { mapIdeologyReflectionToRecommendedActionAdmission } from "@shared/moral-graph/map-ideology-recommendations-to-admission";
import { calculateFruitionFromReflection } from "@shared/moral-graph/calculate-fruition";

export function buildMoralGraphLaunchReflectionArtifacts() {
  const reflection = buildIdeologyContextReflectionV1({
    generatedAt: "2026-06-01T00:00:00.000Z",
    reflectionId: "ideology-reflection:launch-panel",
    graph: {
      graphId: "moral-ideology-graph",
      rootId: "wisdom-first-principles",
      source: "docs/ethos/ideology.json",
    },
    input: {
      kind: "user_prompt",
      summary: "Launch-panel preview: reflect right speech, restraint, and two-key review before action.",
      refs: ["desktop:launch-panel", "docs/ethos/ideology.json"],
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
          tags: ["covered-action", "safeguard"],
          pathToRoot: ["two-key-approval", "mission-ethos", "wisdom-first-principles"],
        },
      ],
      inferred_lenses: [
        {
          nodeId: "restraint",
          label: "Restraint",
          score: 0.75,
          reasons: ["outer-edge lens activation"],
          tags: ["trait", "outer_edge"],
          pathToRoot: ["restraint", "right-speech-infrastructure", "mission-ethos", "wisdom-first-principles"],
        },
      ],
    },
    activated_traits: [
      {
        nodeId: "restraint",
        label: "Restraint",
        confidence: 0.75,
        pathToRoot: ["restraint", "right-speech-infrastructure", "mission-ethos", "wisdom-first-principles"],
        tags: ["trait", "outer_edge"],
      },
    ],
    tensions: [
      {
        nodeIds: ["restraint", "ambition-discipline"],
        description: "Operational urgency may outrun evidence and authority checks.",
        severity: "medium",
      },
    ],
    action_gate_warnings: [
      {
        gateId: "two-key-approval",
        label: "Two-Key Approval",
        warning: "Covered action needs legal and ethos checks before execution.",
        requiredCheck: "legal_key_and_ethos_key",
      },
    ],
    claim_boundaries: {
      diagnostic_only: true,
      avoid_character_judgment: true,
      needs_user_confirmation: true,
      missing_evidence: ["operator_authority", "jurisdiction_context"],
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
    ],
    overlay: {
      title: "MoralGraph reflection",
      summary: "Activated lens: Restraint. Possible gate: Two-Key Approval.",
      highlightedNodeIds: ["restraint", "right-speech-infrastructure", "two-key-approval"],
    },
  });
  const admission = mapIdeologyReflectionToRecommendedActionAdmission(reflection);
  const fruition = calculateFruitionFromReflection({ reflection, admission });
  return { reflection, admission, fruition };
}
