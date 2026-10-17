import type { ExternalPressure, ExternalPressureBundle, ExternalPressureInput } from "@shared/ideology/external-pressures";

export type IdeologyRef =
  | { kind: "doc"; title: string; path: string }
  | { kind: "panel"; title: string; panelId: string; params?: Record<string, unknown> }
  | { kind: "url"; title: string; href: string };

type SettingsTabKey = "preferences" | "knowledge";

export type IdeologyAction =
  | { label: string; action: { kind: "openPanel"; panelId: string; params?: Record<string, unknown> } }
  | { label: string; action: { kind: "openUrl"; href: string } }
  | { label: string; action: { kind: "gotoNode"; to: string } }
  | { label: string; action: { kind: "openSettings"; tab?: SettingsTabKey } }
  | { label: string; action: { kind: "openKnowledgeProject"; projectId: string } };

export type IdeologyLink = { rel: string; to: string };

export type IdeologyNode = {
  id: string;
  slug?: string;
  title: string;
  excerpt?: string;
  bodyMD?: string;
  tags?: string[];
  children?: string[];
  links?: IdeologyLink[];
  references?: IdeologyRef[];
  actions?: IdeologyAction[];
};

export type IdeologyDoc = {
  version: number;
  rootId: string;
  nodes: IdeologyNode[];
};

export type IdeologyBeliefGraphEdgeKind = "implies" | "excludes";

export type IdeologyBeliefGraphEdge = {
  from: string;
  to: string;
  kind: IdeologyBeliefGraphEdgeKind;
  weight?: number;
  rel?: string;
};

export type IdeologyBeliefGraphNode = {
  id: string;
  title?: string;
  score: number;
  fixed?: boolean;
};

export type IdeologyBeliefGraphGate = {
  status: "pass" | "fail" | "unknown";
  residuals: Record<string, number>;
  note?: string;
};

export type IdeologyBeliefGraphConstraints = {
  violationCount: number;
  violationWeight: number;
  axiomViolations: number;
  impliesViolations: number;
  excludesViolations: number;
  maxAbsPressure: number;
};

export type IdeologyBeliefGraphAttempt = {
  iteration: number;
  accepted: boolean;
  gate: IdeologyBeliefGraphGate;
  constraints: IdeologyBeliefGraphConstraints;
};

export type IdeologyBeliefGraphSummary = {
  nodeCount: number;
  edgeCount: number;
  impliesEdges: number;
  excludesEdges: number;
  missingNodes: string[];
  unknownIds: string[];
  conflictIds: string[];
};

export type IdeologyBeliefGraphConfig = {
  rootId: string;
  rootFixed: boolean;
  includeSeeAlso: boolean;
  seeAlsoWeight: number;
  edgeMode: "parent-to-child" | "child-to-parent" | "bidirectional";
  stepSize: number;
  maxIterations: number;
  thresholds: {
    violationMax: number;
    violationWeightMax: number;
  };
  scoreClamp?: { min: number; max: number } | null;
  trueIds: string[];
  falseIds: string[];
};

export type IdeologyBeliefGraphResponse = {
  config: IdeologyBeliefGraphConfig;
  summary: IdeologyBeliefGraphSummary;
  accepted: boolean;
  acceptedIteration: number | null;
  iterations: number;
  gate: IdeologyBeliefGraphGate | null;
  constraints: IdeologyBeliefGraphConstraints | null;
  attempts?: IdeologyBeliefGraphAttempt[];
  graph?: {
    nodes: IdeologyBeliefGraphNode[];
    edges: IdeologyBeliefGraphEdge[];
  };
};


export type { ExternalPressure, ExternalPressureBundle, ExternalPressureInput };

export type IdeologyGuidanceResponse = {
  invariant: "system advises, user decides.";
  detectedBundles: string[];
  recommendedNodeIds: string[];
  warnings: string[];
  recommendedArtifacts: string[];
  suggestedVerificationSteps: string[];
};
