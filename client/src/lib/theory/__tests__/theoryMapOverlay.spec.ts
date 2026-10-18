import { describe, expect, it } from "vitest";
import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";
import { buildTheoryBadgeLocatorArtifact } from "../theoryMapOverlay";

describe("theory map locator overlay", () => {
  it("leaves the map and action lane empty for unsupported theorem queries", () => {
    const artifact = buildTheoryBadgeLocatorArtifact({
      graph: buildNhm2TheoryBadgeGraphV1(),
      input: {
        query: "Fermat's Last Theorem",
        source: "helix_ask",
      },
    });

    expect(artifact.resolution).toBe("unresolved");
    expect(artifact.resolutionReason).toBe("no_supported_graph_match");
    expect(artifact.matches).toEqual([]);
    expect(artifact.overlay.centerBadgeIds).toEqual([]);
    expect(artifact.overlay.highlightedBadgeIds).toEqual([]);
    expect(artifact.overlay.highlightedEdgeIds).toEqual([]);
    expect(artifact.overlay.suggestedViewport.centerBadgeId).toBeNull();
    expect(artifact.recommendedActions).toEqual([]);
    expect(artifact.claimBoundaryNotes).toEqual(
      expect.arrayContaining([
        "No canonical theory badge matched the supplied context.",
        "Locator result is unresolved; no proof or validation claim was made.",
      ]),
    );
  });
});
