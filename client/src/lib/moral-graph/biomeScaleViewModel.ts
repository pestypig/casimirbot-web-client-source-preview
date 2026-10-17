import type { CharacterSituationComparisonV1 } from "@shared/character-situation-comparison";
import type { HelixRecommendedActionAdmissionV1 } from "@shared/contracts/helix-recommended-action-admission.v1";
import type { FruitionProcedureExpressionV1, FruitionProcedureTermV1 } from "@shared/fruition-procedure-expression";
import type { IdeologyContextReflectionV1, IdeologyNodeMatchV1 } from "@shared/ideology-context-reflection";
import { MORAL_LIVING_SUBSTRATE_PRINCIPLES } from "@shared/moral-graph/living-substrate-principles";
import { MORAL_WISDOM_PRINCIPLES, MORAL_WISDOM_ROOT_ID } from "@shared/moral-graph/wisdom-principles";

export type MoralGraphNodeTone =
  | "root"
  | "principle"
  | "lens"
  | "trait"
  | "safeguard"
  | "boundary"
  | "action"
  | "objective"
  | "character";

export type MoralGraphBiomeId =
  | "pre_boundary_conditions"
  | "substrate_boundary"
  | "substrate_sensing"
  | "maintenance_response"
  | "action_selection"
  | "coordination_scale"
  | "mandate_authority"
  | "frontier_mechanism"
  | "character_trace"
  | "objective_binding"
  | "claim_boundary";

export type MoralGraphScaleBand = "molecular" | "cellular" | "organism" | "group" | "institution" | "civilization";
export type MoralGraphActionCadence = "fast_local" | "regulated" | "adaptive" | "coordinated" | "delayed" | "long_horizon";
export type MoralGraphMaturity = "substrate" | "procedural" | "derived" | "frontier" | "boundary" | "objective";
export type MoralGraphActionManifestation =
  | "conditioning"
  | "flux"
  | "concentrating"
  | "boundary"
  | "sensing"
  | "maintaining"
  | "responding"
  | "valuing"
  | "affording"
  | "actuating"
  | "learning"
  | "remembering"
  | "predicting"
  | "choosing"
  | "communicating"
  | "reciprocating"
  | "coordinating"
  | "mandating"
  | "judging"
  | "blocking"
  | "objective_binding"
  | "character_projection";

export type MoralGraphNode = {
  id: string;
  label: string;
  tone: MoralGraphNodeTone;
  glyph: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  confidence?: number;
  tags?: string[];
  summary: string;
  proceduralExpression?: string;
  proceduralRole?: string;
  procedureOperator?: string;
  actionEffect?: string;
  evidenceNeeds?: string[];
  refusesAuthority?: string[];
  characterWeights?: CharacterSituationComparisonV1["activatedProfileWeights"];
  characterHypothesis?: CharacterSituationComparisonV1["behavioralHypothesis"];
  biome: MoralGraphBiomeId;
  scaleBand: MoralGraphScaleBand;
  cadence: MoralGraphActionCadence;
  maturity: MoralGraphMaturity;
  actionManifestation: MoralGraphActionManifestation;
  sourceTheoryBadgeIds: string[];
  claimBoundaryNotes: string[];
  biomeReason: string;
};

export type MoralGraphEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  tone: "cyan" | "emerald" | "amber" | "rose" | "violet" | "slate";
  weight?: number;
};

export type MoralGraphBiomeLane = {
  id: MoralGraphBiomeId;
  label: string;
  summary: string;
  x: number;
  width: number;
};

export type MoralGraphScaleLane = {
  id: MoralGraphScaleBand;
  label: string;
  y: number;
};

export type MoralGraphBiomeScaleCell = {
  id: string;
  biomeId: MoralGraphBiomeId;
  scaleBand: MoralGraphScaleBand;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MoralGraphBiomeScaleViewModel = {
  nodes: MoralGraphNode[];
  edges: MoralGraphEdge[];
  biomeLanes: MoralGraphBiomeLane[];
  scaleLanes: MoralGraphScaleLane[];
  cells: MoralGraphBiomeScaleCell[];
  width: number;
  height: number;
};

type PartialNode = Omit<
  MoralGraphNode,
  | "biome"
  | "scaleBand"
  | "cadence"
  | "maturity"
  | "actionManifestation"
  | "sourceTheoryBadgeIds"
  | "claimBoundaryNotes"
  | "biomeReason"
>;

type MoralLivingSubstratePrinciple = (typeof MORAL_LIVING_SUBSTRATE_PRINCIPLES)[number];
type MoralWisdomPrinciple = (typeof MORAL_WISDOM_PRINCIPLES)[number];
type MoralActivatedTrait = IdeologyContextReflectionV1["activated_traits"][number];
type MoralActionGateWarning = NonNullable<IdeologyContextReflectionV1["action_gate_warnings"]>[number];
type MoralRecommendedAction = HelixRecommendedActionAdmissionV1["actions"][number];

const BIOME_LANES: MoralGraphBiomeLane[] = [
  {
    id: "pre_boundary_conditions",
    label: "Conditions",
    summary: "Source/sink gradients, flux, compartments, and concentration before organism boundary.",
    x: 72,
    width: 184,
  },
  {
    id: "substrate_boundary",
    label: "Boundary",
    summary: "Living system boundary and entropy exposure before obligation.",
    x: 284,
    width: 150,
  },
  {
    id: "substrate_sensing",
    label: "Sensing",
    summary: "State discrimination before judgment.",
    x: 448,
    width: 150,
  },
  {
    id: "maintenance_response",
    label: "Maintenance",
    summary: "Perturbation response and viable-range maintenance.",
    x: 612,
    width: 150,
  },
  {
    id: "action_selection",
    label: "Action",
    summary: "Valence, affordance, actuation, feedback, memory, prediction, and choice before mandate.",
    x: 776,
    width: 190,
  },
  {
    id: "coordination_scale",
    label: "Coordination",
    summary: "Single-cell through multicellular and social coordination.",
    x: 994,
    width: 150,
  },
  {
    id: "mandate_authority",
    label: "Mandate",
    summary: "Late-stage procedural badges, safeguards, and action gates.",
    x: 1158,
    width: 174,
  },
  {
    id: "frontier_mechanism",
    label: "Frontier",
    summary: "Theory bridge context only; never final-answer authority.",
    x: 1346,
    width: 154,
  },
  {
    id: "character_trace",
    label: "Character",
    summary: "Perspective projection through activated badges.",
    x: 1514,
    width: 154,
  },
  {
    id: "objective_binding",
    label: "Objective",
    summary: "Fruition and objective-binding views downstream of trace evidence.",
    x: 1682,
    width: 154,
  },
  {
    id: "claim_boundary",
    label: "Boundary",
    summary: "Missing checks, overclaim blockers, and evidence limits.",
    x: 1850,
    width: 166,
  },
];

const SCALE_LANES: MoralGraphScaleLane[] = [
  { id: "molecular", label: "Molecular", y: 92 },
  { id: "cellular", label: "Cellular", y: 188 },
  { id: "organism", label: "Organism", y: 300 },
  { id: "group", label: "Group", y: 420 },
  { id: "institution", label: "Institution", y: 540 },
  { id: "civilization", label: "Civilization", y: 660 },
];

const MAP_PADDING_X = 88;
const MAP_PADDING_Y = 92;
const BIOME_GAP = 28;
const SCALE_GAP = 28;
const LANE_HEADER_HEIGHT = 42;
const NODE_WIDTH = 54;
const NODE_HEIGHT = 54;
const NODE_COLUMN_GAP = 36;
const NODE_ROW_GAP = 28;
const MAX_CELL_COLUMNS = 4;

const SUBSTRATE_LAYOUT: Record<
  string,
  {
    biome: MoralGraphBiomeId;
    scaleBand: MoralGraphScaleBand;
    cadence: MoralGraphActionCadence;
    actionManifestation: MoralGraphActionManifestation;
    offset: number;
  }
> = {
  "gradient-before-boundary": {
    biome: "pre_boundary_conditions",
    scaleBand: "molecular",
    cadence: "fast_local",
    actionManifestation: "conditioning",
    offset: -44,
  },
  "flux-before-action": {
    biome: "pre_boundary_conditions",
    scaleBand: "molecular",
    cadence: "fast_local",
    actionManifestation: "flux",
    offset: 20,
  },
  "compartment-before-organism": {
    biome: "pre_boundary_conditions",
    scaleBand: "cellular",
    cadence: "fast_local",
    actionManifestation: "boundary",
    offset: -44,
  },
  "concentration-before-replication": {
    biome: "pre_boundary_conditions",
    scaleBand: "cellular",
    cadence: "fast_local",
    actionManifestation: "concentrating",
    offset: 20,
  },
  "boundary-before-obligation": {
    biome: "substrate_boundary",
    scaleBand: "cellular",
    cadence: "fast_local",
    actionManifestation: "boundary",
    offset: 0,
  },
  "sensing-before-judgment": {
    biome: "substrate_sensing",
    scaleBand: "cellular",
    cadence: "fast_local",
    actionManifestation: "sensing",
    offset: 0,
  },
  "maintenance-before-optimization": {
    biome: "maintenance_response",
    scaleBand: "organism",
    cadence: "regulated",
    actionManifestation: "maintaining",
    offset: -28,
  },
  "perturbation-response-before-verdict": {
    biome: "maintenance_response",
    scaleBand: "organism",
    cadence: "adaptive",
    actionManifestation: "responding",
    offset: 34,
  },
  "valence-before-preference": {
    biome: "action_selection",
    scaleBand: "organism",
    cadence: "regulated",
    actionManifestation: "valuing",
    offset: -92,
  },
  "affordance-before-action": {
    biome: "action_selection",
    scaleBand: "organism",
    cadence: "adaptive",
    actionManifestation: "affording",
    offset: -28,
  },
  "actuation-before-agency": {
    biome: "action_selection",
    scaleBand: "organism",
    cadence: "adaptive",
    actionManifestation: "actuating",
    offset: 34,
  },
  "feedback-before-learning": {
    biome: "action_selection",
    scaleBand: "organism",
    cadence: "adaptive",
    actionManifestation: "learning",
    offset: 96,
  },
  "memory-before-commitment": {
    biome: "action_selection",
    scaleBand: "group",
    cadence: "regulated",
    actionManifestation: "remembering",
    offset: -92,
  },
  "prediction-before-planning": {
    biome: "action_selection",
    scaleBand: "group",
    cadence: "adaptive",
    actionManifestation: "predicting",
    offset: -28,
  },
  "choice-before-mandate": {
    biome: "action_selection",
    scaleBand: "group",
    cadence: "coordinated",
    actionManifestation: "choosing",
    offset: 34,
  },
  "coordination-before-mandate": {
    biome: "coordination_scale",
    scaleBand: "group",
    cadence: "coordinated",
    actionManifestation: "coordinating",
    offset: -28,
  },
  "communication-before-norm": {
    biome: "coordination_scale",
    scaleBand: "group",
    cadence: "coordinated",
    actionManifestation: "communicating",
    offset: 34,
  },
  "reciprocity-before-law": {
    biome: "coordination_scale",
    scaleBand: "institution",
    cadence: "long_horizon",
    actionManifestation: "reciprocating",
    offset: -28,
  },
  "scale-continuity-from-cell-to-society": {
    biome: "coordination_scale",
    scaleBand: "institution",
    cadence: "long_horizon",
    actionManifestation: "coordinating",
    offset: 34,
  },
  "microtubule-orch-or-frontier-boundary": {
    biome: "frontier_mechanism",
    scaleBand: "molecular",
    cadence: "fast_local",
    actionManifestation: "sensing",
    offset: 0,
  },
};

function labelize(value: string): string {
  return value.replace(/[_-]/g, " ");
}

function characterDisplayLabel(characterId: string): string {
  if (characterId === "logh.reinhard_von_lohengramm") return "Sovereign Ambition Profile";
  return labelize(characterId);
}

function proceduralToken(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "_");
}

function addNode(nodes: Map<string, PartialNode>, node: PartialNode): void {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
}

function nodeGlyph(node: Pick<PartialNode, "tone">): string {
  if (node.tone === "root") return "R";
  if (node.tone === "principle") return "P";
  if (node.tone === "lens") return "L";
  if (node.tone === "trait") return "T";
  if (node.tone === "safeguard") return "G";
  if (node.tone === "boundary") return "!";
  if (node.tone === "objective") return "B";
  if (node.tone === "character") return "C";
  return "A";
}

function proceduralSubjectForNode(node: Pick<PartialNode, "id" | "tone">): string {
  if (node.tone === "root") return `root.${proceduralToken(node.id)}`;
  if (node.tone === "principle") return `principle.${proceduralToken(node.id)}`;
  if (node.tone === "objective") return `objective.${proceduralToken(node.id)}`;
  if (node.tone === "character") return `character.${proceduralToken(node.id)}`;
  if (node.tone === "safeguard") return `gate.${proceduralToken(node.id)}`;
  if (node.tone === "boundary") return `missing.${proceduralToken(node.id.replace(/^missing:/, ""))}`;
  if (node.tone === "action") return `action.${proceduralToken(node.id.replace(/^action:/, ""))}`;
  return `lens.${proceduralToken(node.id)}`;
}

function rootProcedureExpression(rootId: string): string {
  if (rootId !== MORAL_WISDOM_ROOT_ID) return `root.${proceduralToken(rootId)} supports result.procedural_posture`;
  return `objective.${MORAL_WISDOM_ROOT_ID} receives preset.wisdom-foundation`;
}

function principleProcedureExpression(principle: (typeof MORAL_WISDOM_PRINCIPLES)[number]): string {
  return `principle.${proceduralToken(principle.id)} ${labelize(principle.procedureOperator)} result.procedural_posture`;
}

function fallbackProcedureExpression(node: PartialNode): string {
  const operator = node.procedureOperator ?? (node.tone === "boundary" || node.tone === "safeguard" ? "requires" : "supports");
  return `${proceduralSubjectForNode(node)} ${labelize(operator)} result.procedural_posture`;
}

function termProcedureExpression(node: PartialNode, term: FruitionProcedureTermV1): string {
  return `${proceduralSubjectForNode(node)} ${labelize(term.procedureOperator ?? term.polarity)} result.procedural_posture`;
}

function findProcedureTermForNode(node: PartialNode, fruition: FruitionProcedureExpressionV1): FruitionProcedureTermV1 | undefined {
  const missingCheck = node.id.startsWith("missing:") ? node.id.slice("missing:".length) : null;
  const actionId = node.id.startsWith("action:") ? node.id.slice("action:".length) : null;
  return fruition.terms.find((term: FruitionProcedureTermV1) => {
    if (term.sourceNodeIds?.includes(node.id)) return true;
    if (missingCheck && term.id === `fruition.missing.${missingCheck.replace(/[^a-z0-9_-]+/gi, "_")}`) return true;
    if (actionId && term.id === `fruition.action.${actionId.replace(/[^a-z0-9_-]+/gi, "_")}`) return true;
    return false;
  });
}

function decorateProcedureNode(node: PartialNode, fruition: FruitionProcedureExpressionV1): PartialNode {
  const term = findProcedureTermForNode(node, fruition);
  if (!term) {
    return {
      ...node,
      proceduralExpression: node.proceduralExpression ?? fallbackProcedureExpression(node),
    };
  }
  return {
    ...node,
    proceduralExpression: termProcedureExpression(node, term),
    proceduralRole: term.proceduralRole,
    procedureOperator: term.procedureOperator,
    actionEffect: term.actionEffect,
    evidenceNeeds: term.evidenceNeeds,
    refusesAuthority: term.refusesAuthority,
  };
}

function addPathNodes(params: {
  nodes: Map<string, PartialNode>;
  edges: MoralGraphEdge[];
  path: string[];
  labelsById: Map<string, string>;
  tone: MoralGraphNodeTone;
  edgeTone: MoralGraphEdge["tone"];
  summary: string;
  confidence?: number;
  tags?: string[];
}): void {
  const pathRootFirst = [...params.path].reverse();
  pathRootFirst.forEach((nodeId: string, index: number) => {
    const isRoot = nodeId === MORAL_WISDOM_ROOT_ID;
    addNode(params.nodes, {
      id: nodeId,
      label: params.labelsById.get(nodeId) ?? labelize(nodeId),
      tone: isRoot ? "objective" : params.tone,
      glyph: "",
      x: 0,
      y: 0,
      confidence: isRoot ? undefined : params.confidence,
      tags: isRoot ? ["objective_binding", "preset"] : params.tags,
      summary: isRoot ? "Objective binding assembled from primitive wisdom badges." : params.summary,
      proceduralExpression: isRoot
        ? rootProcedureExpression(nodeId)
        : fallbackProcedureExpression({
            id: nodeId,
            label: params.labelsById.get(nodeId) ?? labelize(nodeId),
            tone: params.tone,
            glyph: "",
            x: 0,
            y: 0,
            summary: params.summary,
          }),
    });
    if (index > 0) {
      params.edges.push({
        id: `path:${nodeId}:${pathRootFirst[index - 1]}`,
        from: nodeId,
        to: pathRootFirst[index - 1],
        label: "path to binding",
        tone: params.edgeTone,
      });
    }
  });
}

function baseBiomeForNode(node: PartialNode): Omit<
  MoralGraphNode,
  keyof PartialNode | "sourceTheoryBadgeIds" | "claimBoundaryNotes" | "biomeReason"
> & {
  sourceTheoryBadgeIds?: string[];
  claimBoundaryNotes?: string[];
  biomeReason: string;
} {
  const substrateLayout = SUBSTRATE_LAYOUT[node.id];
  if (substrateLayout) {
    return {
      biome: substrateLayout.biome,
      scaleBand: substrateLayout.scaleBand,
      cadence: substrateLayout.cadence,
      maturity: node.id === "microtubule-orch-or-frontier-boundary" ? "frontier" : "substrate",
      actionManifestation: substrateLayout.actionManifestation,
      biomeReason: "living substrate principle",
    };
  }
  if (node.tone === "character") {
    return {
      biome: "character_trace",
      scaleBand: "institution",
      cadence: "delayed",
      maturity: "derived",
      actionManifestation: "character_projection",
      claimBoundaryNotes: ["Character traces are diagnostic projections, not moral authority."],
      biomeReason: "character perspective trace",
    };
  }
  if (node.tone === "objective" || node.tone === "root") {
    return {
      biome: "objective_binding",
      scaleBand: "civilization",
      cadence: "long_horizon",
      maturity: "objective",
      actionManifestation: "objective_binding",
      biomeReason: "objective binding downstream of evidence",
    };
  }
  if (node.tone === "boundary" || node.procedureOperator === "blocks") {
    return {
      biome: "claim_boundary",
      scaleBand: node.id.startsWith("action:") ? "institution" : "group",
      cadence: "delayed",
      maturity: "boundary",
      actionManifestation: "blocking",
      claimBoundaryNotes: ["This node keeps the graph evidence-only until missing checks are resolved."],
      biomeReason: "claim boundary or blocked action",
    };
  }
  if (node.tone === "action" || node.tone === "safeguard") {
    return {
      biome: "mandate_authority",
      scaleBand: "institution",
      cadence: "delayed",
      maturity: "procedural",
      actionManifestation: node.tone === "safeguard" ? "blocking" : "mandating",
      biomeReason: "recommended action or safeguard",
    };
  }
  const tags = new Set(node.tags ?? []);
  if (tags.has("observation") || tags.has("evidence") || tags.has("falsifiability") || tags.has("validation")) {
    return {
      biome: "substrate_sensing",
      scaleBand: "organism",
      cadence: "regulated",
      maturity: "procedural",
      actionManifestation: "sensing",
      biomeReason: "procedural observation badge",
    };
  }
  if (tags.has("entropy") || tags.has("revision") || tags.has("repair") || tags.has("harm")) {
    return {
      biome: "maintenance_response",
      scaleBand: "organism",
      cadence: "adaptive",
      maturity: "procedural",
      actionManifestation: tags.has("repair") || tags.has("harm") ? "maintaining" : "responding",
      biomeReason: "maintenance or revision badge",
    };
  }
  if (tags.has("balance") || tags.has("interdependence") || tags.has("mediation") || tags.has("mission")) {
    return {
      biome: "coordination_scale",
      scaleBand: "group",
      cadence: "coordinated",
      maturity: "procedural",
      actionManifestation: "coordinating",
      biomeReason: "coordination badge",
    };
  }
  return {
    biome: "mandate_authority",
    scaleBand: "institution",
    cadence: "delayed",
    maturity: "procedural",
    actionManifestation: "judging",
    biomeReason: "procedural moral badge fallback",
  };
}

function laneForBiome(id: MoralGraphBiomeId): MoralGraphBiomeLane {
  return BIOME_LANES.find((lane: MoralGraphBiomeLane) => lane.id === id) ?? BIOME_LANES[BIOME_LANES.length - 1];
}

function laneForScale(id: MoralGraphScaleBand): MoralGraphScaleLane {
  return SCALE_LANES.find((lane: MoralGraphScaleLane) => lane.id === id) ?? SCALE_LANES[SCALE_LANES.length - 1];
}

function cellColumnCount(count: number): number {
  return Math.max(1, Math.min(MAX_CELL_COLUMNS, count));
}

function cellRowCount(count: number): number {
  return Math.max(1, Math.ceil(count / MAX_CELL_COLUMNS));
}

function cellWidth(columns: number): number {
  return columns * NODE_WIDTH + Math.max(0, columns - 1) * NODE_COLUMN_GAP + 32;
}

function cellHeight(rows: number): number {
  return rows * NODE_HEIGHT + Math.max(0, rows - 1) * NODE_ROW_GAP + 24;
}

function buildDynamicBiomeLanes(cellCounts: Map<string, number>): MoralGraphBiomeLane[] {
  let nextX = MAP_PADDING_X;
  return BIOME_LANES.map((lane: MoralGraphBiomeLane) => {
    const maxColumns = Math.max(
      1,
      ...SCALE_LANES.map((scale: MoralGraphScaleLane) => cellColumnCount(cellCounts.get(`${lane.id}:${scale.id}`) ?? 0)),
    );
    const width = Math.max(lane.width, cellWidth(maxColumns));
    const dynamicLane = { ...lane, x: nextX, width };
    nextX += width + BIOME_GAP;
    return dynamicLane;
  });
}

function buildDynamicScaleLanes(cellCounts: Map<string, number>): MoralGraphScaleLane[] {
  let nextY = MAP_PADDING_Y;
  return SCALE_LANES.map((scale: MoralGraphScaleLane) => {
    const maxRows = maxRowsForScale(scale.id, cellCounts);
    const dynamicScale = { ...scale, y: nextY };
    nextY += cellHeight(maxRows) + SCALE_GAP;
    return dynamicScale;
  });
}

function maxRowsForScale(scaleBand: MoralGraphScaleBand, cellCounts: Map<string, number>): number {
  return Math.max(
    1,
    ...BIOME_LANES.map((lane: MoralGraphBiomeLane) => cellRowCount(cellCounts.get(`${lane.id}:${scaleBand}`) ?? 0)),
  );
}

function buildBiomeScaleCells(params: {
  biomeLanes: MoralGraphBiomeLane[];
  scaleLanes: MoralGraphScaleLane[];
  cellCounts: Map<string, number>;
}): MoralGraphBiomeScaleCell[] {
  return params.biomeLanes.flatMap((biome: MoralGraphBiomeLane) =>
    params.scaleLanes.map((scale: MoralGraphScaleLane) => {
      const height = cellHeight(maxRowsForScale(scale.id, params.cellCounts));
      return {
        id: `${biome.id}:${scale.id}`,
        biomeId: biome.id,
        scaleBand: scale.id,
        label: `${biome.label} / ${scale.label}`,
        x: biome.x,
        y: scale.y,
        width: biome.width,
        height,
      };
    }),
  );
}

function finalizeNode(params: {
  node: PartialNode;
  indexInBiomeScale: number;
  biomeLanes: MoralGraphBiomeLane[];
  scaleLanes: MoralGraphScaleLane[];
}): MoralGraphNode {
  const { node, indexInBiomeScale, biomeLanes, scaleLanes } = params;
  const base = baseBiomeForNode(node);
  const substrate = MORAL_LIVING_SUBSTRATE_PRINCIPLES.find((principle: MoralLivingSubstratePrinciple) => principle.id === node.id);
  const lane = biomeLanes.find((candidate: MoralGraphBiomeLane) => candidate.id === base.biome) ?? laneForBiome(base.biome);
  const scale = scaleLanes.find((candidate: MoralGraphScaleLane) => candidate.id === base.scaleBand) ?? laneForScale(base.scaleBand);
  const column = indexInBiomeScale % MAX_CELL_COLUMNS;
  const row = Math.floor(indexInBiomeScale / MAX_CELL_COLUMNS);
  return {
    ...node,
    glyph: node.glyph || nodeGlyph(node),
    width: node.width ?? NODE_WIDTH,
    height: node.height ?? NODE_HEIGHT,
    x: lane.x + 16 + column * (NODE_WIDTH + NODE_COLUMN_GAP),
    y: scale.y + row * (NODE_HEIGHT + NODE_ROW_GAP),
    biome: base.biome,
    scaleBand: base.scaleBand,
    cadence: base.cadence,
    maturity: base.maturity,
    actionManifestation: base.actionManifestation,
    sourceTheoryBadgeIds: substrate ? [...substrate.sourceTheoryBadgeIds] : (base.sourceTheoryBadgeIds ?? []),
    claimBoundaryNotes: substrate ? [...substrate.claimBoundaryNotes] : (base.claimBoundaryNotes ?? []),
    biomeReason: base.biomeReason,
  };
}

export function buildMoralGraphBiomeScaleViewModel(args: {
  reflection: IdeologyContextReflectionV1;
  admission: HelixRecommendedActionAdmissionV1;
  fruition: FruitionProcedureExpressionV1;
  characterComparison?: CharacterSituationComparisonV1;
}): MoralGraphBiomeScaleViewModel {
  const { reflection, admission, fruition, characterComparison } = args;
  const nodes = new Map<string, PartialNode>();
  const edges: MoralGraphEdge[] = [];
  const labelsById = new Map<string, string>([
    [reflection.graph.rootId, labelize(reflection.graph.rootId)],
    ...reflection.matches.exact.map((match: IdeologyNodeMatchV1) => [match.nodeId, match.label] as const),
    ...reflection.matches.likely.map((match: IdeologyNodeMatchV1) => [match.nodeId, match.label] as const),
    ...reflection.matches.inferred_lenses.map((match: IdeologyNodeMatchV1) => [match.nodeId, match.label] as const),
    ...reflection.activated_traits.map((trait: MoralActivatedTrait) => [trait.nodeId, trait.label] as const),
    ...(reflection.action_gate_warnings ?? []).map((warning: MoralActionGateWarning) => [warning.gateId, warning.label] as const),
  ]);

  if (reflection.graph.rootId === MORAL_WISDOM_ROOT_ID) {
    MORAL_LIVING_SUBSTRATE_PRINCIPLES.forEach((principle: MoralLivingSubstratePrinciple) => {
      addNode(nodes, {
        id: principle.id,
        label: principle.title,
        tone: principle.maturity === "frontier" ? "boundary" : "principle",
        glyph: principle.maturity === "frontier" ? "F" : "S",
        x: 0,
        y: 0,
        tags: [...principle.tags],
        summary: principle.plainMeaning,
        proceduralExpression: `substrate.${proceduralToken(principle.id)} ${principle.maturity === "frontier" ? "bounds" : "supports"} result.procedural_posture`,
        proceduralRole: principle.maturity === "frontier" ? "authority_boundary" : "first_principle",
        procedureOperator: principle.maturity === "frontier" ? "blocks" : "supports",
        actionEffect: principle.whyItMatters,
        evidenceNeeds: principle.sourceTheoryBadgeIds,
        refusesAuthority: ["moral_verdict", "personhood_proof", "human_consciousness_claim"],
      });
    });
    for (let index = 1; index < MORAL_LIVING_SUBSTRATE_PRINCIPLES.length; index += 1) {
      edges.push({
        id: `substrate:${MORAL_LIVING_SUBSTRATE_PRINCIPLES[index - 1].id}:${MORAL_LIVING_SUBSTRATE_PRINCIPLES[index].id}`,
        from: MORAL_LIVING_SUBSTRATE_PRINCIPLES[index - 1].id,
        to: MORAL_LIVING_SUBSTRATE_PRINCIPLES[index].id,
        label: "substrate trace",
        tone: index === MORAL_LIVING_SUBSTRATE_PRINCIPLES.length - 1 ? "rose" : "emerald",
      });
    }
  }

  addNode(nodes, {
    id: reflection.graph.rootId,
    label: reflection.graph.rootId === MORAL_WISDOM_ROOT_ID ? "Wisdom First Principles" : labelize(reflection.graph.rootId),
    tone: reflection.graph.rootId === MORAL_WISDOM_ROOT_ID ? "objective" : "root",
    glyph: reflection.graph.rootId === MORAL_WISDOM_ROOT_ID ? "B" : "",
    x: 0,
    y: 0,
    tags: reflection.graph.rootId === MORAL_WISDOM_ROOT_ID ? ["objective_binding", "preset"] : ["root"],
    summary:
      reflection.graph.rootId === MORAL_WISDOM_ROOT_ID
        ? "Objective binding assembled from living-substrate and procedural wisdom badges."
        : "Root principle",
    proceduralExpression: rootProcedureExpression(reflection.graph.rootId),
  });

  if (reflection.graph.rootId === MORAL_WISDOM_ROOT_ID) {
    MORAL_WISDOM_PRINCIPLES.forEach((principle: MoralWisdomPrinciple) => {
      addNode(nodes, {
        id: principle.id,
        label: principle.label,
        tone: "principle",
        glyph: principle.glyph,
        x: 0,
        y: 0,
        tags: principle.tags,
        summary: principle.summary,
        proceduralExpression: principleProcedureExpression(principle),
        proceduralRole: principle.proceduralRole,
        procedureOperator: principle.procedureOperator,
        actionEffect: principle.actionEffect,
        evidenceNeeds: principle.evidenceNeeds,
        refusesAuthority: principle.refusesAuthority,
      });
      edges.push({
        id: `wisdom:${principle.id}:${reflection.graph.rootId}`,
        from: principle.id,
        to: reflection.graph.rootId,
        label: "assembles binding",
        tone: "emerald",
      });
    });
    edges.push({
      id: "substrate:sensing-before-judgment:direct-observation-before-claim",
      from: "sensing-before-judgment",
      to: "direct-observation-before-claim",
      label: "procedural observation",
      tone: "cyan",
    });
  }

  const addMatch = (match: IdeologyNodeMatchV1, tone: MoralGraphNodeTone, edgeTone: MoralGraphEdge["tone"], summary: string) => {
    if (match.pathToRoot?.length) {
      addPathNodes({
        nodes,
        edges,
        path: match.pathToRoot,
        labelsById,
        tone,
        edgeTone,
        summary,
        confidence: match.score,
        tags: match.tags,
      });
      return;
    }
    addNode(nodes, {
      id: match.nodeId,
      label: match.label,
      tone,
      glyph: "",
      x: 0,
      y: 0,
      confidence: match.score,
      tags: match.tags,
      summary,
      proceduralExpression: `lens.${proceduralToken(match.nodeId)} supports result.procedural_posture`,
    });
    edges.push({ id: `root:${match.nodeId}`, from: reflection.graph.rootId, to: match.nodeId, label: "activates", tone: edgeTone });
  };

  reflection.matches.exact.forEach((match: IdeologyNodeMatchV1) => addMatch(match, "lens", "cyan", "Exact MoralGraph lens match"));
  reflection.matches.likely.forEach((match: IdeologyNodeMatchV1) => addMatch(match, "lens", "slate", "Likely MoralGraph lens match"));
  reflection.matches.inferred_lenses.forEach((match: IdeologyNodeMatchV1) => addMatch(match, "trait", "emerald", "Inferred outer-edge lens"));
  reflection.activated_traits.forEach((trait: MoralActivatedTrait) => {
    if (!trait.pathToRoot.length) return;
    addPathNodes({
      nodes,
      edges,
      path: trait.pathToRoot,
      labelsById,
      tone: "trait",
      edgeTone: "emerald",
      summary: "Activated trait path",
      confidence: trait.confidence,
      tags: trait.tags,
    });
  });

  (reflection.action_gate_warnings ?? []).forEach((warning: MoralActionGateWarning) => {
    addNode(nodes, {
      id: warning.gateId,
      label: warning.label,
      tone: "safeguard",
      glyph: "",
      x: 0,
      y: 0,
      tags: warning.requiredCheck ? [warning.requiredCheck] : ["action_gate"],
      summary: warning.warning,
      proceduralExpression: `gate.${proceduralToken(warning.gateId)} requires result.procedural_posture`,
    });
  });

  (reflection.claim_boundaries.missing_evidence ?? []).forEach((missing: string) => {
    const id = `missing:${missing}`;
    addNode(nodes, {
      id,
      label: labelize(missing),
      tone: "boundary",
      glyph: "",
      x: 0,
      y: 0,
      tags: ["missing_check"],
      summary: "Missing check keeps the reflection diagnostic.",
      proceduralExpression: `missing.${proceduralToken(missing)} asks for result.procedural_posture`,
    });
    edges.push({ id: `boundary:${id}`, from: reflection.graph.rootId, to: id, label: "claim boundary", tone: "rose" });
  });

  admission.actions.slice(0, 4).forEach((action: MoralRecommendedAction) => {
    const id = `action:${action.actionId}`;
    addNode(nodes, {
      id,
      label: action.label,
      tone: action.admission === "blocked" ? "boundary" : "action",
      glyph: "",
      x: 0,
      y: 0,
      tags: action.reasonCodes,
      summary: `${labelize(action.admission)} / ${labelize(action.risk)} / ${labelize(action.display_policy ?? "actionable")}`,
      proceduralExpression: `action.${proceduralToken(action.actionId)} ${action.admission === "blocked" ? "blocks" : "routes to"} result.procedural_posture`,
    });
    edges.push({
      id: `action:${action.actionId}`,
      from: reflection.graph.rootId,
      to: id,
      label: "recommended next step",
      tone: action.admission === "blocked" ? "rose" : "violet",
    });
  });

  if (characterComparison) {
    const characterNodeId = `character:${characterComparison.characterId}`;
    const activatedWeights = characterComparison.activatedProfileWeights.slice(0, 7);
    addNode(nodes, {
      id: characterNodeId,
      label: characterDisplayLabel(characterComparison.characterId),
      tone: "character",
      glyph: "C",
      x: 0,
      y: 0,
      tags: ["character_preset", "diagnostic_only", characterComparison.predictedPosture],
      summary: "Character preset badge: a bounded projection through active badges, not a root moral authority.",
      proceduralExpression: `character.${proceduralToken(characterComparison.characterId)} weights activated badges => ${labelize(
        characterComparison.predictedPosture,
      )}`,
      proceduralRole: "objective_view",
      procedureOperator: "routes_to",
      actionEffect: characterComparison.behavioralHypothesis.likelyChoice,
      evidenceNeeds: characterComparison.behavioralHypothesis.missingEvidence,
      refusesAuthority: ["moral_verdict", "canon_certainty_without_source", "execution_authority"],
      characterWeights: activatedWeights,
      characterHypothesis: characterComparison.behavioralHypothesis,
    });
    for (const activation of activatedWeights) {
      if (!nodes.has(activation.nodeId)) continue;
      edges.push({
        id: `character:${activation.nodeId}:${characterNodeId}`,
        from: activation.nodeId,
        to: characterNodeId,
        label: labelize(activation.relation),
        tone:
          activation.relation === "tensions"
            ? "rose"
            : activation.relation === "counterweighted"
              ? "amber"
              : activation.relation === "missing"
                ? "violet"
                : "emerald",
        weight: Math.max(0.5, activation.graphConfidence * activation.characterWeight),
      });
    }
    edges.push({
      id: `character:${characterNodeId}:fruition`,
      from: characterNodeId,
      to: reflection.graph.rootId,
      label: "character weighted posture",
      tone: "amber",
      weight: 0.85,
    });
  }

  const decoratedNodes = [...nodes.values()].map((node: PartialNode) =>
    decorateProcedureNode({ ...node, glyph: node.glyph || nodeGlyph(node) }, fruition),
  );
  const cellCounts = new Map<string, number>();
  for (const node of decoratedNodes) {
    const meta = baseBiomeForNode(node);
    const key = `${meta.biome}:${meta.scaleBand}`;
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1);
  }
  const biomeLanes = buildDynamicBiomeLanes(cellCounts);
  const scaleLanes = buildDynamicScaleLanes(cellCounts);
  const cells = buildBiomeScaleCells({ biomeLanes, scaleLanes, cellCounts });
  const placedCounts = new Map<string, number>();
  const finalNodes = decoratedNodes.map((decorated: PartialNode) => {
    const meta = baseBiomeForNode(decorated);
    const key = `${meta.biome}:${meta.scaleBand}`;
    const index = placedCounts.get(key) ?? 0;
    placedCounts.set(key, index + 1);
    return finalizeNode({
      node: decorated,
      indexInBiomeScale: index,
      biomeLanes,
      scaleLanes,
    });
  });
  const width = Math.max(
    1640,
    Math.max(...biomeLanes.map((lane: MoralGraphBiomeLane) => lane.x + lane.width)) + MAP_PADDING_X,
  );
  const height = Math.max(
    780,
    Math.max(...finalNodes.map((node: MoralGraphNode) => node.y + (node.height ?? NODE_HEIGHT))) + MAP_PADDING_Y,
  );

  return {
    nodes: finalNodes,
    edges: edges.filter((edge: MoralGraphEdge, index: number, all: MoralGraphEdge[]) =>
      all.findIndex((candidate: MoralGraphEdge) => candidate.id === edge.id) === index,
    ),
    biomeLanes,
    scaleLanes,
    cells,
    width,
    height,
  };
}
