import { describe, expect, it } from "vitest";

import {
  buildWorkstationShellHandoff,
  isWorkstationShellPathname,
} from "@/lib/workstation/workstationEntryRoute";

describe("workstation entry route", () => {
  it.each([
    ["/desktop", true],
    ["/desktop/", true],
    ["/mobile", true],
    ["/mobile/", true],
    ["/", false],
    ["/helix-core", false],
    ["/mobile-preview", false],
    ["/desktop-tools", false],
  ])("classifies %s as workstation shell route: %s", (pathname, expected) => {
    expect(isWorkstationShellPathname(pathname)).toBe(expected);
  });

  it("preserves link meta, view state, and legacy hash during adaptive handoff", () => {
    expect(
      buildWorkstationShellHandoff("/mobile", {
        search:
          "?panels=docs-viewer&focus=docs-viewer&entry=workstation",
        hash: "#project=alpha",
      }),
    ).toBe(
      "/mobile?panels=docs-viewer&focus=docs-viewer&entry=workstation#project=alpha",
    );
  });

  it("supports a clean desktop handoff without optional state", () => {
    expect(
      buildWorkstationShellHandoff("/desktop", {}),
    ).toBe("/desktop");
  });
});
