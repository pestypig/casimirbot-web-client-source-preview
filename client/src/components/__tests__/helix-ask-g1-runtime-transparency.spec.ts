import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HelixAskProceduralTimeline } from "../helix/ask-console/HelixAskProceduralTimeline";

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Helix Ask G1 runtime transparency projection", () => {
  it("labels the visible subset and exposes every remaining lifecycle row", () => {
    const timeline = read("client/src/components/helix/ask-console/HelixAskProceduralTimeline.tsx");
    expect(timeline).toContain("Showing {visibleRows.length} of {rows.length} public lifecycle rows");
    expect(timeline).toContain("Show remaining {overflowRows.length} lifecycle rows");
    expect(timeline).toContain("overflowRows.map");
    expect(timeline).not.toContain("{rows.slice(0, 18).map");
  });

  it("does not cap the legacy runtime projection at twelve agent iterations", () => {
    const projection = read("client/src/components/helix/ask-console/HelixAskLegacyProceduralTimelineProjection.tsx");
    expect(projection).toContain("turnTranscriptEvents.length === 0 ? runtimeIterations : []");
    expect(projection).not.toContain("runtimeIterations.slice(0, 12)");
    expect(projection).toContain("runtimePathIdentity?.actual_path");
    expect(projection).toContain("runtimePathIdentity?.api_transport");
    expect(projection).toContain("runtimeDowngrade.reason_code");
    expect(projection).toContain("turnTranscriptEvents.forEach");
    expect(projection).toContain("publicLifecyclePresentation?.default_visible_limit");
    expect(projection).toContain("buildRuntimeBudgetSummary(runtimeLimits)");
    expect(projection).toContain("buildModelPolicySummary(runtimeModelPolicy)");
    const timeline = read("client/src/components/helix/ask-console/HelixAskProceduralTimeline.tsx");
    expect(timeline).toContain("Transport: ${apiTransport}");
    expect(timeline).toContain("declaredDefaultVisibleLimit");
  });

  it("renders the server-declared subset while retaining every overflow lifecycle row", () => {
    const rows = Array.from({ length: 24 }, (_, index) => ({
      key: `event-${index}`,
      label: `Lifecycle ${index + 1}`,
      detail: `stable-event-${index + 1}`,
      status: "completed",
    }));
    const html = renderToStaticMarkup(createElement(HelixAskProceduralTimeline, {
      rows,
      truthMatchesVisible: true,
      route: "/ask/turn/stream",
      runtimePath: "codex_native_app_server",
      apiTransport: "ask_turn_sse",
      defaultVisibleLimit: 3,
      runtimeBudgetSummary: "status=configured | turn_timeout_ms=120000 | continuation_steps=no Helix-imposed step cap",
      modelPolicySummary: "model=gpt-5.6-codex | reasoning=high | source=request",
    }));

    expect(html).toContain("Showing 3 of 24 public lifecycle rows");
    expect(html).toContain("Show remaining 21 lifecycle rows");
    expect(html).toContain("Path: codex_native_app_server");
    expect(html).toContain("Transport: ask_turn_sse");
    expect(html).toContain("Presentation limit: 3 rows by default; this is not a runtime execution limit.");
    expect(html).toContain("Runtime budget: status=configured");
    expect(html).toContain("Model policy: model=gpt-5.6-codex");
    expect(html).toContain("stable-event-24");
  });
});
