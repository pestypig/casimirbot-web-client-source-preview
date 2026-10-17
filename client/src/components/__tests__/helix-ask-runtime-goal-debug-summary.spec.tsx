import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HelixAskRuntimeGoalProgressPanel } from "@/components/helix/ask-console/HelixAskFinalExtras";
import { buildHelixAskRuntimeGoalDebugSummary } from "@/components/helix/ask-console/HelixAskRuntimeGoalDebugContext";

describe("runtime goal debug summary", () => {
  it("projects timer heartbeat policy as metadata without implying execution", () => {
    const summary = buildHelixAskRuntimeGoalDebugSummary({
      command: {
        command: "wake",
        goal_id: "goal:timer",
      },
      session: {
        goal_id: "goal:timer",
        runtime_agent_provider: "codex",
        status: "waiting",
        wake_policy: {
          manual_resume: true,
          visible_context_changed: true,
          document_changed: true,
          timer_ms: 30000,
        },
      },
      debugExport: {
        goal_id: "goal:timer",
        runtime_provider: "codex",
        session_status: "waiting",
      },
    });

    expect(summary).toMatchObject({
      goal_id: "goal:timer",
      runtime_agent_provider: "codex",
      session_status: "waiting",
      wake_timer_status: "armed",
      wake_timer_ms: 30000,
    });

    const html = renderToStaticMarkup(
      React.createElement(HelixAskRuntimeGoalProgressPanel, {
        summary,
        isLatestReply: true,
      }),
    );

    expect(html).toContain("Timer");
    expect(html).toContain("armed (30000 ms)");
  });

  it("projects timer heartbeat as unarmed when policy is present without a timer", () => {
    const summary = buildHelixAskRuntimeGoalDebugSummary({
      command: {
        command: "start",
        goal_id: "goal:timer",
      },
      session: {
        goal_id: "goal:timer",
        status: "waiting",
        wake_policy: {
          manual_resume: true,
          visible_context_changed: true,
          document_changed: true,
          timer_ms: null,
        },
      },
      debugExport: null,
    });

    expect(summary).toMatchObject({
      wake_timer_status: "unarmed",
      wake_timer_ms: null,
    });
  });
});
