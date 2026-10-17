/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createHelixAskComposerTextareaSizingController } from "../HelixAskComposerTextareaSizing";

describe("Helix Ask composer textarea sizing", () => {
  it("keeps the legacy pill on a recrowned controller pointer", () => {
    const legacyPill = readFileSync(
      resolve(process.cwd(), "client/src/components/helix/HelixAskPill.tsx"),
      "utf8",
    );

    expect(legacyPill).toContain("createHelixAskComposerTextareaSizingController");
    expect(legacyPill).toContain("askTextareaSizingControllerRef.current?.syncValue");
    expect(legacyPill).not.toContain("askTextareaMaxHeightRef");
    expect(legacyPill).not.toContain('el.style.height = "auto"');
  });

  it("caches style metrics and avoids programmatic writes for native input", () => {
    const target = document.createElement("textarea");
    const readComputedStyle = vi.fn(() => ({
      lineHeight: "20px",
      paddingTop: "4px",
      paddingBottom: "6px",
    }));
    let scrollHeight = 40;
    let scrollTopWrites = 0;
    Object.defineProperty(target, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    });
    Object.defineProperty(target, "scrollTop", {
      configurable: true,
      get: () => 0,
      set: () => {
        scrollTopWrites += 1;
      },
    });
    const controller = createHelixAskComposerTextareaSizingController({
      maxPromptLines: 3,
      readComputedStyle,
    });

    target.value = "native";
    controller.syncValue(target, "native");
    expect(target.style.height).toBe("40px");
    expect(target.style.overflowY).toBe("hidden");
    expect(scrollTopWrites).toBe(0);

    scrollHeight = 90;
    target.value = "native input grows";
    controller.syncValue(target, "native input grows");
    expect(target.style.height).toBe("70px");
    expect(target.style.overflowY).toBe("auto");
    expect(readComputedStyle).toHaveBeenCalledTimes(1);
  });

  it("allows deletion to shrink and keeps programmatic focus/cursor behavior", () => {
    const target = document.createElement("textarea");
    let scrollHeight = 60;
    Object.defineProperty(target, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    });
    const focus = vi.spyOn(target, "focus");
    const setSelectionRange = vi.spyOn(target, "setSelectionRange");
    const controller = createHelixAskComposerTextareaSizingController({
      maxPromptLines: 10,
      readComputedStyle: () => ({
        lineHeight: "20px",
        paddingTop: "0px",
        paddingBottom: "0px",
      }),
    });

    target.value = "long native draft";
    controller.syncValue(target, "long native draft");
    scrollHeight = 20;
    target.value = "x";
    controller.syncValue(target, "x");
    expect(target.style.height).toBe("20px");

    controller.syncValue(target, "programmatic", { focus: true });
    expect(target.value).toBe("programmatic");
    expect(focus).toHaveBeenCalledOnce();
    expect(setSelectionRange).toHaveBeenCalledWith(12, 12);
  });
});
