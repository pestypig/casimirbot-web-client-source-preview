import { describe, expect, it } from "vitest";
import { decodeLayout, encodeLayout } from "@/lib/desktop/shareState";
import {
  buildWorkstationPathRef,
  buildWorkstationPanelPathRef,
  coerceWorkstationViewStateFromPathInput,
  coerceWorkstationViewState,
  encodeWorkstationViewStateSearch,
  normalizeWorkstationDocPath,
  parseWorkstationViewStateFromUrl,
} from "@/lib/workstation/workstationDeepLink";
import { coerceHelixWorkstationActions } from "@/lib/workstation/workstationActionContract";
import {
  HELIX_USER_ACCOUNT_POLICY,
  resolveHelixAccountPanelAccess,
} from "@shared/helix-account-session";

describe("workstationDeepLink", () => {
  it("parses canonical workstation view state from query params", () => {
    const state = parseWorkstationViewStateFromUrl(
      "/desktop?panels=docs-viewer,workstation-notes&focus=docs-viewer&doc=docs/papers.md&anchor=intro",
    );

    expect(state.panels).toEqual(["docs-viewer", "workstation-notes"]);
    expect(state.focusPanel).toBe("docs-viewer");
    expect(state.activeDocPath).toBe("docs/papers.md");
    expect(state.anchor).toBe("intro");
    expect(state.pathRef?.displaySegments).toEqual(["Workspace", "docs", "papers.md"]);
  });

  it("admits the public Agent Access workstation deep link", () => {
    const state = parseWorkstationViewStateFromUrl(
      "/desktop?panels=agent-access&focus=agent-access",
    );

    expect(state.panels).toEqual(["agent-access"]);
    expect(state.focusPanel).toBe("agent-access");
    expect(
      resolveHelixAccountPanelAccess(
        HELIX_USER_ACCOUNT_POLICY,
        "agent-access",
      ).state,
    ).toBe("available");
  });

  it("normalizes doc paths and rejects raw absolute local paths", () => {
    expect(normalizeWorkstationDocPath("/docs/foo.md")).toBe("docs/foo.md");
    expect(normalizeWorkstationDocPath("foo.md")).toBe("docs/foo.md");
    expect(normalizeWorkstationDocPath("C:\\Users\\dan\\Desktop\\secret.md")).toBeNull();
  });

  it("keeps legacy hash layout compatibility through shareState", () => {
    expect(decodeLayout("#panels=docs-viewer,noisegen&project=alpha")).toEqual({
      projectSlug: "alpha",
      panels: ["docs-viewer", "helix-noise-gens"],
    });
    expect(encodeLayout({ panels: ["docs-viewer", "helix-noise-gens"], projectSlug: "alpha" })).toBe(
      "#project=alpha&panels=docs-viewer%2Cnoisegen",
    );
  });

  it("drops unknown panel ids while preserving valid panels", () => {
    const state = parseWorkstationViewStateFromUrl("/desktop?panels=docs-viewer,not-real&focus=not-real");
    expect(state.panels).toEqual(["docs-viewer"]);
    expect(state.focusPanel).toBeUndefined();
  });

  it("encodes canonical query state without legacy hash", () => {
    expect(
      encodeWorkstationViewStateSearch({
        panels: ["docs-viewer"],
        focusPanel: "docs-viewer",
        activeDocPath: "/docs/foo.md",
        anchor: "section-a",
      }),
    ).toBe("?panels=docs-viewer&focus=docs-viewer&doc=docs%2Ffoo.md&anchor=section-a");
  });

  it("round-trips equation and artifact targets in workstation view state", () => {
    const state = parseWorkstationViewStateFromUrl(
      "/desktop?panels=docs-viewer,scientific-calculator&focus=docs-viewer&doc=docs/papers.md&anchor=eq-12&equation=eq-12&artifact=runtime_artifact%3Aabc123",
    );

    expect(state).toMatchObject({
      panels: ["docs-viewer", "scientific-calculator"],
      focusPanel: "docs-viewer",
      activeDocPath: "docs/papers.md",
      anchor: "eq-12",
      selectedObjectKind: "doc_equation",
      selectedObjectId: "eq-12",
      artifactKind: "runtime_artifact",
      artifactId: "abc123",
    });
    expect(encodeWorkstationViewStateSearch(state)).toBe(
      "?panels=docs-viewer%2Cscientific-calculator&focus=docs-viewer&doc=docs%2Fpapers.md&anchor=eq-12&equation=eq-12&artifact=runtime_artifact%3Aabc123",
    );
  });

  it("builds workspace path refs for breadcrumbs and agent traces", () => {
    expect(buildWorkstationPathRef("docs/a/b.md")).toEqual({
      root: "workspace",
      relativePath: "docs/a/b.md",
      displaySegments: ["Workspace", "docs", "a", "b.md"],
      virtualUri: "workspace://workspace/docs/a/b.md",
    });
  });

  it("builds panel path refs for workstation breadcrumbs without local paths", () => {
    expect(buildWorkstationPanelPathRef("stage-play-badge-graph")).toEqual({
      root: "workspace",
      relativePath: "panels/stage-play-badge-graph",
      displaySegments: ["Workspace", "Panels", "Stage Play Badge Graph"],
      virtualUri: "workspace://workspace/panels/stage-play-badge-graph",
    });
  });

  it("coerces pasted workspace paths into safe view state", () => {
    expect(coerceWorkstationViewStateFromPathInput("workspace://workspace/panels/stage-play-badge-graph")).toMatchObject({
      panels: ["stage-play-badge-graph"],
      focusPanel: "stage-play-badge-graph",
    });
    expect(coerceWorkstationViewStateFromPathInput("docs/a/b.md#intro")).toMatchObject({
      panels: ["docs-viewer"],
      focusPanel: "docs-viewer",
      activeDocPath: "docs/a/b.md",
      anchor: "intro",
    });
    expect(coerceWorkstationViewStateFromPathInput("workspace://workspace/docs/a/b.md#eq-12")).toMatchObject({
      panels: ["docs-viewer"],
      focusPanel: "docs-viewer",
      activeDocPath: "docs/a/b.md",
      anchor: "eq-12",
      selectedObjectKind: "doc_equation",
      selectedObjectId: "eq-12",
    });
    expect(coerceWorkstationViewStateFromPathInput("C:\\Users\\dan\\secret.md")).toBeNull();
  });

  it("coerces typed restore view state actions for the workstation action loop", () => {
    const actions = coerceHelixWorkstationActions({
      action: "restore_view_state",
      view_state: {
        panels: ["docs-viewer"],
        focusPanel: "docs-viewer",
        activeDocPath: "/docs/papers.md",
        anchor: "overview",
      },
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      action: "restore_view_state",
      view_state: {
        panels: ["docs-viewer"],
        focusPanel: "docs-viewer",
        activeDocPath: "docs/papers.md",
        anchor: "overview",
      },
    });
  });

  it("returns null for empty or invalid view state payloads", () => {
    expect(coerceWorkstationViewState({ panels: ["not-real"] })).toBeNull();
    expect(coerceWorkstationViewState({ activeDocPath: "C:\\Users\\dan\\secret.md" })).toBeNull();
  });
});
