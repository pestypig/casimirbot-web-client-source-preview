import { describe, expect, it } from "vitest";

import {
  buildMirekEvidenceAnchors,
  calculateMirekSharedExactPathRatio,
  collectMirekEvidencePathsFromLiveEvents,
  collectMirekEvidencePathsFromValue,
  isMirekEvidencePath,
} from "@/lib/helix/ask-reasoning-theater-evidence";
import type { MirekReasoningArtifactV1 } from "@shared/helix-reasoning-mirek";

describe("ask-reasoning-theater-evidence", () => {
  it("recognizes bounded code and document evidence paths", () => {
    expect(isMirekEvidencePath("docs/research/nhm2.md")).toBe(true);
    expect(isMirekEvidencePath("client/src/components/helix/HelixAskPill.tsx")).toBe(true);
    expect(isMirekEvidencePath("ordinary prose without a path")).toBe(false);
    expect(isMirekEvidencePath(`${"a".repeat(261)}.md`)).toBe(false);
  });

  it("collects nested evidence paths from known metadata fields", () => {
    expect(
      collectMirekEvidencePathsFromValue({
        evidence_refs: [
          { source_path: "docs/a.md" },
          { filePath: "server/services/helix-ask/route.ts" },
          "not evidence prose",
        ],
        ignored: { source_path: "docs/not-read.md" },
      }),
    ).toEqual(["docs/a.md", "server/services/helix-ask/route.ts"]);
  });

  it("dedupes live-event evidence from meta and text", () => {
    expect(
      collectMirekEvidencePathsFromLiveEvents([
        { meta: { contextFiles: ["docs/a.md", "docs/A.md"] }, text: "docs/b.md" },
        { meta: { citations: [{ path: "client/src/app.tsx" }] }, text: "plain text" },
      ]),
    ).toEqual(["docs/a.md", "docs/b.md", "client/src/app.tsx"]);
  });

  it("builds bounded deterministic evidence anchors", () => {
    const anchors = buildMirekEvidenceAnchors(["docs/a.md", "docs/a.md", "docs/b.md"]);
    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toMatchObject({
      role: "evidence",
      path: "docs/a.md",
      weight: 1,
      exact: true,
    });
    expect(anchors[0]?.id).toMatch(/^evidence:[a-f0-9]+:0$/);
    expect(anchors[1]?.weight).toBe(0.955);
  });

  it("calculates shared exact-path continuity against a previous artifact", () => {
    const anchors = buildMirekEvidenceAnchors(["docs/a.md", "docs/b.md"]);
    const previous = {
      anchors: buildMirekEvidenceAnchors(["DOCS/A.md", "docs/c.md"]),
    } as MirekReasoningArtifactV1;

    expect(calculateMirekSharedExactPathRatio(anchors, previous)).toBe(0.5);
    expect(calculateMirekSharedExactPathRatio(anchors, null)).toBe(0);
  });
});
