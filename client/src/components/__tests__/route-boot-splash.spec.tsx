/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import RouteBootSplash from "@/components/RouteBootSplash";
import {
  HELIX_LOADING_MARK_SRC,
  HelixLoadingMark,
} from "@/components/common/HelixLoadingMark";

describe("canonical Helix loading surface", () => {
  it("uses the SVG background and circular spinner for route loading", () => {
    const { container } = render(
      <RouteBootSplash
        message="Loading Helix..."
        detail="Preparing the requested workspace"
      />,
    );

    expect(screen.getByRole("status")).toHaveAccessibleName(
      "Loading Helix.... Preparing the requested workspace",
    );
    expect(container.innerHTML).toContain(HELIX_LOADING_MARK_SRC);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("keeps panel and Ask fallbacks on the same loading component", () => {
    const { container } = render(
      <HelixLoadingMark title="Loading Helix Ask" compact />,
    );

    expect(within(container).getByRole("status")).toHaveAccessibleName("Loading Helix Ask");
    expect(container.innerHTML).toContain(HELIX_LOADING_MARK_SRC);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("keeps the pre-React startup shell visually aligned", () => {
    const indexHtml = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");

    expect(indexHtml).toContain("/loading/helix-loading-mark.svg");
    expect(indexHtml).toContain("boot-shell__background-art");
    expect(indexHtml).toContain("boot-spin");
    expect(indexHtml).toContain("Starting Helix...");
  });

  it("does not introduce separate route or Ask loading components", () => {
    const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
    const consoleSource = readFileSync(
      resolve(process.cwd(), "client/src/components/helix/ask-console/HelixAskConsole.tsx"),
      "utf8",
    );
    const runtimeShellSource = readFileSync(
      resolve(
        process.cwd(),
        "client/src/components/helix/ask-console/HelixAskConsoleRuntimeShell.tsx",
      ),
      "utf8",
    );

    expect(appSource).toContain("<RouteBootSplash");
    expect(consoleSource).toContain("<HelixLoadingMark");
    expect(runtimeShellSource).toContain("<HelixLoadingMark");
    expect(appSource).not.toContain("RouteLoadingBackdrop");
    expect(consoleSource).not.toContain("HelixAskRuntimeLoadingSurface");
    expect(runtimeShellSource).not.toContain("HelixAskRuntimeLoadingSurface");
  });
});
