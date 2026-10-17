import { describe, expect, it } from "vitest";
import {
  buildDocViewerDebugSnapshotFromState,
  extractExplicitDocsViewerPath,
  normalizeDocPathForDebugCompare,
  normalizeDocViewerPathForAskSnapshot,
  normalizeDocsViewerAnchorPath,
  resolveDocsViewerAnchorPathCandidate,
  resolveDocViewerSnapshotPathCandidate,
  shouldSuppressAtomicViewerLaunch,
} from "../ask-doc-viewer-context";

describe("ask docs-viewer context helpers", () => {
  it("builds deterministic docs-viewer debug snapshots from supplied state", () => {
    expect(buildDocViewerDebugSnapshotFromState(
      {
        mode: "read",
        anchor: "section-2",
        pendingAutoReadNonce: "nonce-1",
        recent: ["a", "b", "c"],
      },
      "docs/research/current.md",
    )).toEqual({
      mode: "read",
      currentPath: "docs/research/current.md",
      anchor: "section-2",
      pendingAutoReadNonce: "nonce-1",
      recentCount: 3,
    });
  });

  it("builds docs-viewer debug snapshots with null defaults without reading stores", () => {
    expect(buildDocViewerDebugSnapshotFromState(
      {
        recent: null,
      },
      null,
    )).toEqual({
      mode: undefined,
      currentPath: null,
      anchor: null,
      pendingAutoReadNonce: null,
      recentCount: 0,
    });
  });

  it("normalizes docs-viewer anchor paths without changing absolute Windows paths", () => {
    expect(normalizeDocsViewerAnchorPath("\\docs\\research\\paper.md")).toBe("docs/research/paper.md");
    expect(normalizeDocsViewerAnchorPath("/docs/research/paper.md")).toBe("docs/research/paper.md");
    expect(normalizeDocsViewerAnchorPath("C:\\repo\\docs\\paper.md")).toBe("C:/repo/docs/paper.md");
  });

  it("normalizes retained Ask snapshot paths to safe docs-relative paths", () => {
    expect(normalizeDocViewerPathForAskSnapshot("\\docs\\research\\paper.md")).toBe("docs/research/paper.md");
    expect(normalizeDocViewerPathForAskSnapshot("/docs/research/paper.md")).toBe("docs/research/paper.md");
    expect(normalizeDocViewerPathForAskSnapshot("docs/research/paper.md")).toBe("docs/research/paper.md");
    expect(normalizeDocViewerPathForAskSnapshot("client/src/App.tsx")).toBeNull();
    expect(normalizeDocViewerPathForAskSnapshot("../docs/research/paper.md")).toBeNull();
    expect(normalizeDocViewerPathForAskSnapshot("C:\\repo\\docs\\paper.md")).toBeNull();
    expect(normalizeDocViewerPathForAskSnapshot(null)).toBeNull();
  });

  it("resolves Ask snapshot path precedence without reading UI state", () => {
    expect(resolveDocViewerSnapshotPathCandidate({
      storePath: "/docs/research/store.md",
      debugSnapshotPath: "docs/research/debug.md",
      desktopUrlDocPath: "docs/research/url.md",
      lastKnownPath: "docs/research/remembered.md",
    })).toEqual({
      path: "docs/research/store.md",
      source: "doc_viewer_store",
    });
    expect(resolveDocViewerSnapshotPathCandidate({
      storePath: "client/src/App.tsx",
      debugSnapshotPath: "\\docs\\research\\debug.md",
      desktopUrlDocPath: "docs/research/url.md",
      lastKnownPath: "docs/research/remembered.md",
    })).toEqual({
      path: "docs/research/debug.md",
      source: "doc_viewer_debug_snapshot",
    });
    expect(resolveDocViewerSnapshotPathCandidate({
      storePath: null,
      debugSnapshotPath: "../docs/research/debug.md",
      desktopUrlDocPath: "/docs/research/url.md",
      lastKnownPath: "docs/research/remembered.md",
    })).toEqual({
      path: "docs/research/url.md",
      source: "desktop_url_doc_param",
    });
    expect(resolveDocViewerSnapshotPathCandidate({
      storePath: null,
      debugSnapshotPath: null,
      desktopUrlDocPath: null,
      lastKnownPath: "docs/research/remembered.md",
    })).toEqual({
      path: "docs/research/remembered.md",
      source: "doc_viewer_last_known",
    });
    expect(resolveDocViewerSnapshotPathCandidate({
      storePath: null,
      debugSnapshotPath: "C:\\repo\\docs\\debug.md",
      desktopUrlDocPath: "server/index.ts",
      lastKnownPath: "",
    })).toEqual({
      path: null,
      source: "none",
    });
  });

  it("extracts explicit document path lines before generic path tokens", () => {
    expect(
      extractExplicitDocsViewerPath("Please use document path: /docs/research/current.md\nIgnore client/src/App.tsx"),
    ).toBe("docs/research/current.md");
  });

  it("extracts supported inline file path tokens", () => {
    expect(extractExplicitDocsViewerPath("Open docs/research/current-status.md for context")).toBe(
      "docs/research/current-status.md",
    );
    expect(extractExplicitDocsViewerPath("No path here")).toBeNull();
  });

  it("resolves current docs-viewer anchor paths from deictic and artifact cues", () => {
    expect(resolveDocsViewerAnchorPathCandidate({
      question: "Summarize the current NHM2 whitepaper.",
      currentPath: "\\docs\\research\\nhm2-current-status-whitepaper.md",
    })).toBe("docs/research/nhm2-current-status-whitepaper.md");
    expect(resolveDocsViewerAnchorPathCandidate({
      question: "Use the current document for this answer.",
      currentPath: "docs/research/current.md",
    })).toBe("docs/research/current.md");
    expect(resolveDocsViewerAnchorPathCandidate({
      question: "Summarize the active context.",
      answerContractSource: "docs_viewer",
      currentPath: "docs/research/from-contract.md",
    })).toBe("docs/research/from-contract.md");
  });

  it("prefers explicit paths and avoids guessing without docs cues", () => {
    expect(resolveDocsViewerAnchorPathCandidate({
      question: "Summarize the current document. document path: docs/research/explicit.md",
      currentPath: "docs/research/current.md",
    })).toBe("docs/research/explicit.md");
    expect(resolveDocsViewerAnchorPathCandidate({
      question: "Summarize the current document and compare client/src/App.tsx.",
      currentPath: "docs/research/current.md",
    })).toBe("client/src/App.tsx");
    expect(resolveDocsViewerAnchorPathCandidate({
      question: "Summarize the topic.",
      currentPath: "docs/research/current.md",
    })).toBeNull();
  });

  it("normalizes debug compare paths from unknown values", () => {
    expect(normalizeDocPathForDebugCompare(" /docs\\research\\current.md ")).toBe("docs/research/current.md");
    expect(normalizeDocPathForDebugCompare("")).toBeNull();
    expect(normalizeDocPathForDebugCompare(null)).toBeNull();
  });

  it("suppresses atomic viewer launch for docs-summary prompts with explicit current docs context", () => {
    expect(
      shouldSuppressAtomicViewerLaunch({
        question: "Summarize the document using current docs viewer context.",
        mode: "read",
      }),
    ).toBe(true);
  });

  it("suppresses atomic viewer launch for docs-summary prompts with docs path literals", () => {
    expect(
      shouldSuppressAtomicViewerLaunch({
        question: "Please summarize document path: docs/research/current-status.md",
      }),
    ).toBe(true);
    expect(
      shouldSuppressAtomicViewerLaunch({
        question: "Explain /docs/research/current-status.md",
      }),
    ).toBe(true);
  });

  it("does not suppress atomic viewer launch without both summary cue and explicit docs context", () => {
    expect(
      shouldSuppressAtomicViewerLaunch({
        question: "Open document path: docs/research/current-status.md",
      }),
    ).toBe(false);
    expect(
      shouldSuppressAtomicViewerLaunch({
        question: "Summarize the current topic.",
      }),
    ).toBe(false);
    expect(shouldSuppressAtomicViewerLaunch({ question: "   " })).toBe(false);
  });
});
