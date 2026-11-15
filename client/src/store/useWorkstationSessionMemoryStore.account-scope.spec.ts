/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { cacheAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { useWorkstationSessionMemoryStore } from "@/store/useWorkstationSessionMemoryStore";

afterEach(() => {
  cacheAccountCapabilityPolicy(null, null);
  sessionStorage.clear();
});

describe("workstation session memory account scope", () => {
  it("isolates drafts and scroll state across accounts and sign-out", () => {
    sessionStorage.setItem("workstation-session-memory:v1", JSON.stringify({
      state: { drafts: { "scientific-calculator:input": { text: "old shared draft", updatedAtMs: 1 } } },
      version: 0,
    }));
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    const alpha = useWorkstationSessionMemoryStore.getState();
    expect(alpha.readDraft("scientific-calculator:input")).toBe("");
    alpha.rememberDraft("scientific-calculator:input", "alpha private draft");
    alpha.rememberPanelScroll("docs-viewer:example", {
      scrollTop: 50, scrollHeight: 500, clientHeight: 100,
    });

    cacheAccountCapabilityPolicy(null, "profile:beta");
    const beta = useWorkstationSessionMemoryStore.getState();
    expect(beta.readDraft("scientific-calculator:input")).toBe("");
    expect(beta.readPanelScroll("docs-viewer:example")).toBeNull();
    beta.rememberDraft("scientific-calculator:input", "beta private draft");

    cacheAccountCapabilityPolicy(null, null);
    expect(useWorkstationSessionMemoryStore.getState().readDraft("scientific-calculator:input")).toBe("");
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    expect(useWorkstationSessionMemoryStore.getState().readDraft("scientific-calculator:input"))
      .toBe("alpha private draft");
    expect(useWorkstationSessionMemoryStore.getState().readPanelScroll("docs-viewer:example")?.scrollTop)
      .toBe(50);
    expect(sessionStorage.getItem("workstation-session-memory:v1")).toContain("old shared draft");
    expect(sessionStorage.getItem("workstation-session-memory:v2:profile:profile%3Aalpha"))
      .toContain("alpha private draft");
    expect(sessionStorage.getItem("workstation-session-memory:v2:profile:profile%3Abeta"))
      .toContain("beta private draft");
  });
});
