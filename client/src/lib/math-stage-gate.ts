export type MathStageLabel =
  | "exploratory"
  | "reduced-order"
  | "diagnostic"
  | "certified"
  | "unstaged";

export type MathStageRequirement = {
  module: string;
  minStage: MathStageLabel;
};

export type MathTreeNode = {
  id: string;
  stage?: MathStageLabel;
  children?: MathTreeNode[];
};

export type MathGraphResponse = {
  root: MathTreeNode;
};

export const STAGE_RANK: Record<MathStageLabel, number> = {
  unstaged: -1,
  exploratory: 0,
  "reduced-order": 1,
  diagnostic: 2,
  certified: 3,
};

export const STAGE_LABELS: Record<MathStageLabel, string> = {
  exploratory: "S0",
  "reduced-order": "S1",
  diagnostic: "S2",
  certified: "S3",
  unstaged: "UNSTAGED",
};

export const STAGE_BADGE: Record<MathStageLabel, string> = {
  exploratory: "border-slate-600/60 text-slate-300",
  "reduced-order": "border-sky-500/50 text-sky-300",
  diagnostic: "border-amber-500/50 text-amber-300",
  certified: "border-emerald-500/50 text-emerald-300",
  unstaged: "border-rose-500/50 text-rose-300",
};

export const buildMathNodeIndex = (root?: MathTreeNode) => {
  const map = new Map<string, MathTreeNode>();
  if (!root) return map;
  const walk = (node: MathTreeNode) => {
    map.set(node.id, node);
    node.children?.forEach(walk);
  };
  walk(root);
  return map;
};

export const meetsStage = (stage: MathStageLabel, minStage: MathStageLabel) =>
  STAGE_RANK[stage] >= STAGE_RANK[minStage];

export type MathStageGate = {
  ok: boolean;
  stage: MathStageLabel;
  modules: Array<{
    module: string;
    stage: MathStageLabel;
    minStage: MathStageLabel;
    ok: boolean;
  }>;
};

export const resolveMathStageGate = (
  index: Map<string, MathTreeNode>,
  requirements: ReadonlyArray<MathStageRequirement>,
): MathStageGate => {
  const modules = requirements.map((req) => {
    const node = index.get(req.module);
    const stage = node?.stage ?? "unstaged";
    return {
      module: req.module,
      stage,
      minStage: req.minStage,
      ok: meetsStage(stage, req.minStage),
    };
  });
  const ok = modules.every((item) => item.ok);
  const worstStage = modules.reduce<MathStageLabel>((worst, item) => {
    return STAGE_RANK[item.stage] < STAGE_RANK[worst] ? item.stage : worst;
  }, "certified");
  return { ok, stage: worstStage, modules };
};
