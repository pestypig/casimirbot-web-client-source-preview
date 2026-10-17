import { describe, it, expect } from "vitest";
import { roleFromTool } from "./debate";

describe("roleFromTool", () => {
  it("maps verifier to skeptic", () => {
    expect(roleFromTool("verifier:math.sympy.verify")).toBe("skeptic");
  });
  it("maps solver/llm/luma to proponent", () => {
    expect(roleFromTool("solver:math.sum")).toBe("proponent");
    expect(roleFromTool("llm.http.generate")).toBe("proponent");
    expect(roleFromTool("luma.http.generate")).toBe("proponent");
  });
  it("defaults to referee", () => {
    expect(roleFromTool("phase-scheduler")).toBe("referee");
  });
});
