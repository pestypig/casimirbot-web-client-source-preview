import { describe, expect, it } from "vitest";
import { buildGrAssistantSummary } from "@/lib/gr-assistant-summary";

describe("buildGrAssistantSummary", () => {
  it("returns unknown when no checks/constraints evidence exists", () => {
    const summary = buildGrAssistantSummary({
      report: {
        passed: false,
        checks: [],
        failed_checks: [],
        assumptions: { signature: "", units_internal: "", coords: [] },
      },
      gate: { pass: false, constraints: [] },
    });

    expect(summary).toBeTruthy();
    expect(summary?.status).toBe("unknown");
    expect(summary?.assumptions.signature).toBe("n/a");
    expect(summary?.assumptions.unitsInternal).toBe("n/a");
    expect(summary?.assumptions.coords).toEqual(["n/a"]);
  });

  it("returns fail when checks were evaluated and failed", () => {
    const summary = buildGrAssistantSummary({
      report: {
        passed: false,
        checks: [{ check_name: "h_constraint" }],
        failed_checks: [{ check_name: "h_constraint" }],
        assumptions: { signature: "adm", units_internal: "si", coords: ["x", "y", "z"] },
      },
      gate: { pass: false, constraints: [{ id: "H_constraint", status: "fail" }] },
    });

    expect(summary?.status).toBe("fail");
    expect(summary?.firstFail).toBe("h_constraint");
    expect(summary?.assumptions.signature).toBe("adm");
  });
});
