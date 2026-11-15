/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { cacheAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";

afterEach(() => {
  cacheAccountCapabilityPolicy(null, null);
  localStorage.clear();
});

describe("scientific calculator account scope", () => {
  it("separates workbench state across accounts without claiming the legacy shared copy", () => {
    localStorage.setItem("scientific-calculator:v1", JSON.stringify({
      state: { currentLatex: "old shared expression" }, version: 0,
    }));
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    expect(useScientificCalculatorStore.getState().currentLatex).toBe("");
    useScientificCalculatorStore.setState({ currentLatex: "alpha expression" });

    cacheAccountCapabilityPolicy(null, "profile:beta");
    expect(useScientificCalculatorStore.getState().currentLatex).toBe("");
    useScientificCalculatorStore.setState({ currentLatex: "beta expression" });

    cacheAccountCapabilityPolicy(null, null);
    expect(useScientificCalculatorStore.getState().currentLatex).toBe("");
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    expect(useScientificCalculatorStore.getState().currentLatex).toBe("alpha expression");
    expect(localStorage.getItem("scientific-calculator:v1")).toContain("old shared expression");
    expect(localStorage.getItem("scientific-calculator:v2:profile:profile%3Aalpha"))
      .toContain("alpha expression");
    expect(localStorage.getItem("scientific-calculator:v2:profile:profile%3Abeta"))
      .toContain("beta expression");
  });
});
