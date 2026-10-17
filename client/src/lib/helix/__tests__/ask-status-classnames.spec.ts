import { describe, expect, it } from "vitest";
import {
  readHelixCausalTraceRowClass,
  readProceduralStatusClass,
} from "@/lib/helix/ask-status-classnames";

describe("Helix Ask status class names", () => {
  it("maps procedural statuses to stable class groups", () => {
    expect(readProceduralStatusClass("completed")).toContain("emerald");
    expect(readProceduralStatusClass("canceled")).toContain("slate");
    expect(readProceduralStatusClass("running")).toContain("animate-pulse");
    expect(readProceduralStatusClass("suppressed")).toContain("amber");
    expect(readProceduralStatusClass("failed")).toContain("rose");
    expect(readProceduralStatusClass("pending_input")).toContain("blue");
    expect(readProceduralStatusClass("planned")).toContain("slate");
    expect(readProceduralStatusClass("unknown")).toBe("border-white/10 bg-white/5 text-slate-300");
  });

  it("prioritizes failed or blocked causal rows over label tinting", () => {
    expect(readHelixCausalTraceRowClass({ label: "Final", status: "blocked by gate" })).toBe(
      "border-amber-300/30 bg-amber-950/20 text-amber-50",
    );
    expect(readHelixCausalTraceRowClass({ label: "Observation", status: "failed" })).toBe(
      "border-amber-300/30 bg-amber-950/20 text-amber-50",
    );
  });

  it("maps causal row labels to transcript display classes", () => {
    expect(readHelixCausalTraceRowClass({ label: "Final", status: "completed" })).toContain("violet");
    expect(readHelixCausalTraceRowClass({ label: "Terminal", status: "completed" })).toContain("violet");
    expect(readHelixCausalTraceRowClass({ label: "Observation", status: "completed" })).toContain("emerald");
    expect(readHelixCausalTraceRowClass({ label: "Gate", status: "completed" })).toContain("cyan");
    expect(readHelixCausalTraceRowClass({ label: "Thinking", status: "completed" })).toBe(
      "border-slate-600/30 bg-black/15 text-slate-100",
    );
  });
});
