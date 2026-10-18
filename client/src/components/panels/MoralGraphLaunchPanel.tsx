import { buildMoralGraphLaunchReflectionArtifacts } from "@/lib/moral-graph/fruitionLaunchArtifact";
import { REINHARD_VON_LOHENGRAMM_PROFILE } from "@shared/moral-graph/character-profiles/reinhard-von-lohengramm";
import { buildIdeologyGraph } from "@shared/moral-graph/build-ideology-graph";
import { compareCharacterSituation } from "@shared/moral-graph/compare-character-situation";
import type { IdeologyGraphDocument } from "@shared/moral-graph/ideology-graph-types";
import { MORAL_WISDOM_PRINCIPLES, MORAL_WISDOM_ROOT_ID } from "@shared/moral-graph/wisdom-principles";
import MoralGraphPanel from "./MoralGraphPanel";

const { reflection, admission } = buildMoralGraphLaunchReflectionArtifacts();
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
      children: MORAL_WISDOM_PRINCIPLES.map((principle) => principle.id),
    },
    ...MORAL_WISDOM_PRINCIPLES.map((principle) => ({
      id: principle.id,
      title: principle.label,
      summary: principle.summary,
      tags: principle.tags,
    })),
  ],
};
const characterComparison = compareCharacterSituation({
  graph: buildIdeologyGraph(graphDocument),
  profile: REINHARD_VON_LOHENGRAMM_PROFILE,
  situationText: "A corrupt inherited noble authority blocks agency while a cold advisor suggests strategic leverage.",
  refs: ["demo:moral-character"],
  generatedAt: "2026-06-01T00:00:00.000Z",
  comparisonId: "character-situation:demo-reinhard",
});

export default function MoralGraphLaunchPanel() {
  return <MoralGraphPanel reflection={reflection} admission={admission} characterComparison={characterComparison} />;
}
