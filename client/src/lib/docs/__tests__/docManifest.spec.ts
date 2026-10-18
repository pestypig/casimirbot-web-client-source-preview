import { describe, expect, it, vi } from "vitest";
import {
  buildProductionDocModules,
  DOC_MANIFEST,
  compareDocCatalogEntries,
  filterDocManifestEntries,
  type DocManifestEntry,
} from "@/lib/docs/docManifest";

function makeEntry(
  id: string,
  title: string,
  relativePath: string,
  overrides: Partial<
    Pick<
      DocManifestEntry,
      "subjectLabel" | "catalogDate" | "catalogDateSource" | "fileMtimeIso" | "fileMtimeMs" | "sizeBytes"
      | "docClass" | "bundleKind" | "canonical" | "retrievalStatus" | "topicId" | "authorityRank"
      | "supersededBy" | "sidecars" | "toolHints"
    >
  > = {},
): DocManifestEntry {
  return {
    id,
    route: `/${relativePath}`,
    relativePath,
    folderChain: ["docs"],
    folderLabel: "docs",
    subjectLabel: overrides.subjectLabel ?? "General Reference",
    catalogDate: overrides.catalogDate ?? null,
    catalogDateSource: overrides.catalogDateSource ?? null,
    fileMtimeIso: overrides.fileMtimeIso ?? null,
    fileMtimeMs: overrides.fileMtimeMs ?? null,
    sizeBytes: overrides.sizeBytes ?? null,
    docClass: overrides.docClass ?? null,
    bundleKind: overrides.bundleKind ?? null,
    canonical: overrides.canonical ?? false,
    retrievalStatus: overrides.retrievalStatus ?? "supporting",
    topicId: overrides.topicId ?? null,
    authorityRank: overrides.authorityRank ?? null,
    supersededBy: overrides.supersededBy ?? null,
    sidecars: overrides.sidecars ?? [],
    toolHints: overrides.toolHints ?? null,
    title,
    searchText: `${title} ${relativePath}`.toLowerCase(),
    loader: async () => "",
  };
}

describe("filterDocManifestEntries", () => {
  const entries: DocManifestEntry[] = [
    makeEntry(
      "needle-directory",
      "Needle Hull Mark2 Theory Directory Latest",
      "docs/audits/research/needle-hull-mark2/theory-directory-latest.md",
    ),
    makeEntry(
      "mission-time",
      "Warp Nhm2 Mission Time Estimator Latest",
      "docs/audits/research/warp-nhm2-mission-time-estimator-latest.md",
    ),
    makeEntry("helix-flow", "Helix Ask Flow", "docs/helix-ask-flow.md"),
  ];

  it("matches mixed NHM2 aliases and descriptive paper wording", () => {
    const matches = filterDocManifestEntries("NHM2 Theory white paper", entries);
    expect(matches.map((entry) => entry.id)).toEqual(["needle-directory"]);
  });

  it("expands NHM2 entries for Needle Hull Mark 2 queries", () => {
    const matches = filterDocManifestEntries("Needle Hull Mark 2 mission", entries);
    expect(matches.map((entry) => entry.id)).toEqual(["mission-time"]);
  });

  it("keeps matching direct title characters as the typed title grows", () => {
    const matches = filterDocManifestEntries("Needle Hull Ma", entries);
    expect(matches[0]?.id).toBe("needle-directory");
  });

  it("matches titles when the user omits spaces or punctuation", () => {
    const matches = filterDocManifestEntries("helixaskfl", entries);
    expect(matches.map((entry) => entry.id)).toEqual(["helix-flow"]);
  });

  it("ranks direct title matches above path-only token matches", () => {
    const localEntries: DocManifestEntry[] = [
      makeEntry("path-only", "General Research Notes", "docs/helix/ask/flow-archive.md"),
      makeEntry("title", "Helix Ask Flow", "docs/reference/flow.md"),
    ];

    const matches = filterDocManifestEntries("Helix Ask Flow", localEntries);
    expect(matches.map((entry) => entry.id)).toEqual(["title", "path-only"]);
  });

  it("catalogs real docs with subject and filesystem edit metadata", () => {
    const entry = DOC_MANIFEST.find(
      (candidate) =>
        candidate.relativePath === "docs/audits/research/ownership-maturity-utility-deep-research-2026-02-25.md",
    );

    expect(entry).toMatchObject({
      subjectLabel: "Research and Development Logs",
      catalogDateSource: "mtime",
    });
    expect(entry?.catalogDate).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
    expect(entry?.fileMtimeIso).toContain("T");
  });

  it("sorts filesystem-edited docs above title-latest snapshots when mtime is newer", () => {
    const sorted = [
      makeEntry("title-latest", "Warp Conceptual Guide Latest", "docs/audits/research/warp-guide-latest.md", {
        subjectLabel: "Warp Mechanics",
        catalogDate: "2026-03-19",
        catalogDateSource: "path",
      }),
      makeEntry("edited", "Warp Conceptual Guide 2026 05 02", "docs/audits/research/warp-guide-2026-05-02.md", {
        subjectLabel: "Warp Mechanics",
        catalogDate: "2026-06-12",
        catalogDateSource: "mtime",
        fileMtimeIso: "2026-06-12T12:00:00.000Z",
        fileMtimeMs: Date.parse("2026-06-12T12:00:00.000Z"),
      }),
    ].sort(compareDocCatalogEntries);

    expect(sorted.map((entry) => entry.id)).toEqual(["edited", "title-latest"]);
  });

  it("finds the real NHM2 theory directory from the generated docs manifest", () => {
    const matches = filterDocManifestEntries("NHM2 Theory white paper", DOC_MANIFEST);
    expect(
      matches.some(
        (entry) => entry.relativePath === "docs/audits/research/needle-hull-mark2/theory-directory-latest.md",
      ),
    ).toBe(true);
  });

  it("attaches taxonomy metadata for Calculator-ready canonical whitepapers", () => {
    const entry = DOC_MANIFEST.find(
      (candidate) => candidate.relativePath === "docs/research/nhm2-current-status-whitepaper.md",
    );

    expect(entry).toMatchObject({
      docClass: "canonical-research",
      bundleKind: "equation-action-whitepaper",
      canonical: true,
      retrievalStatus: "primary",
      topicId: "nhm2",
      authorityRank: 100,
      supersededBy: null,
      title: "NHM2 as a 3+1 Same-Chart Lapse-Shift Warp Metric Evaluation Framework",
      sidecars: [
        "docs/research/nhm2-current-status-whitepaper.equation-actions.json",
        "docs/research/nhm2-current-status-whitepaper.equation-actions.source.json",
      ],
      toolHints: {
        calculatorReady: true,
        contentAuthority: "bounded_docs_observation_required",
      },
    });
  });

  it("keeps superseded NHM2 generations visible in the catalog but marked archival", () => {
    const entry = DOC_MANIFEST.find(
      (candidate) =>
        candidate.relativePath === "docs/research/nhm2-current-status-whitepaper-2026-04-03.md",
    );

    expect(entry).toMatchObject({
      retrievalStatus: "archive",
      topicId: "nhm2",
      authorityRank: 10,
      supersededBy: "docs/research/nhm2-current-status-whitepaper.md",
    });
  });

  it("infers taxonomy class from registered taxonomy default folders", () => {
    const researchReadme = DOC_MANIFEST.find((candidate) => candidate.relativePath === "docs/research/README.md");
    const developmentReadme = DOC_MANIFEST.find((candidate) => candidate.relativePath === "docs/development/README.md");
    const syntheticReadme = DOC_MANIFEST.find((candidate) => candidate.relativePath === "docs/synthetic-research/README.md");
    const legacyReadme = DOC_MANIFEST.find((candidate) => candidate.relativePath === "docs/legacy-development/README.md");
    const syntheticAudit = DOC_MANIFEST.find(
      (candidate) =>
        candidate.relativePath === "docs/audits/research/ownership-maturity-utility-deep-research-2026-02-25.md",
    );
    const currentSpec = DOC_MANIFEST.find(
      (candidate) => candidate.relativePath === "docs/specs/warp-promotion-readiness-suite-contract-v1.md",
    );
    const legacyAudit = DOC_MANIFEST.find(
      (candidate) => candidate.relativePath === "docs/audits/toe-sequence-forest-lane-closure-2026-02-19.md",
    );

    expect(researchReadme?.docClass).toBe("canonical-research");
    expect(developmentReadme?.docClass).toBe("current-development");
    expect(syntheticReadme?.docClass).toBe("synthetic-research");
    expect(legacyReadme?.docClass).toBe("legacy-development");
    expect(syntheticAudit?.docClass).toBe("synthetic-research");
    expect(currentSpec?.docClass).toBe("current-development");
    expect(legacyAudit?.docClass).toBe("legacy-development");
  });

  it("keeps Uncategorized as an exception bucket after folder taxonomy rules are applied", () => {
    const counts = DOC_MANIFEST.reduce(
      (acc, entry) => {
        const key = entry.docClass ?? "uncategorized";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    expect(counts["synthetic-research"]).toBeGreaterThan(3000);
    expect(counts["current-development"]).toBeGreaterThan(100);
    expect(counts["legacy-development"]).toBeGreaterThan(10);
    expect(counts.uncategorized ?? 0).toBeLessThan(250);
  });

  it("loads production Markdown from the server instead of bundling every document", async () => {
    const fetchDocument = vi.fn(async () =>
      new Response("# Helix Ask Flow (Grounded)\n", {
        status: 200,
        headers: { "Content-Type": "text/markdown" },
      }),
    );
    const modules = buildProductionDocModules(fetchDocument as typeof fetch);
    const loader = modules["../../../../docs/helix-ask-flow.md"];

    expect(loader).toBeTypeOf("function");
    await expect(loader()).resolves.toContain("Helix Ask Flow");
    expect(fetchDocument).toHaveBeenCalledWith(
      "/docs/helix-ask-flow.md",
      expect.objectContaining({
        headers: { Accept: "text/markdown, text/plain;q=0.9, */*;q=0.1" },
      }),
    );
  });
});
