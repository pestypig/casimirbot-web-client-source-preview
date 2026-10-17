import { describe, expect, it } from "vitest";
import { parseActivateContract } from "@/lib/time-dilation-activate-contract";

describe("parseActivateContract", () => {
  it("accepts full diagnostics accepted payload", () => {
    const parsed = parseActivateContract({
      ok: true,
      accepted: true,
      warnings: [],
      strictCongruence: true,
      canonical: {
        strictCongruence: true,
        mode: "natario",
        family: "natario",
        chart: "comoving_cartesian",
      },
      pipelineUpdate: { ok: true, pending: false },
      diagnostics: { ok: true, strict: { anyProxy: false } },
    });

    expect(parsed.accepted).toBe(true);
    expect(parsed.diagnosticsPartial).toBe(false);
    expect(parsed.pipelineUpdate).toEqual(expect.objectContaining({ ok: true }));
    expect(parsed.diagnostics).toEqual(expect.objectContaining({ ok: true }));
    expect(parsed.canonical.family).toBe("natario");
  });

  it("treats diagnostics_partial warning as degraded success", () => {
    const parsed = parseActivateContract({
      ok: true,
      accepted: true,
      warnings: ["diagnostics_partial"],
      strictCongruence: true,
      pipelineUpdate: { ok: true, pending: true },
      diagnostics: { ok: false, pending: true, error: "diagnostics_pending" },
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.accepted).toBe(true);
    expect(parsed.diagnosticsPartial).toBe(true);
    expect(parsed.warnings).toContain("diagnostics_partial");
    expect(parsed.pipelineUpdate).toEqual(expect.objectContaining({ pending: true }));
  });

  it("handles missing optional diagnostics subfields without crashing", () => {
    const parsed = parseActivateContract({
      ok: true,
      accepted: true,
      warnings: ["diagnostics_partial"],
      diagnostics: null,
      pipelineUpdate: null,
      canonical: { mode: "natario" },
    });

    expect(parsed.accepted).toBe(true);
    expect(parsed.diagnosticsPartial).toBe(true);
    expect(parsed.pipelineUpdate).toEqual({});
    expect(parsed.diagnostics).toEqual({});
    expect(parsed.canonical.mode).toBe("natario");
    expect(parsed.canonical.family).toBeNull();
    expect(parsed.strictCongruence).toBe(true);
  });
});
