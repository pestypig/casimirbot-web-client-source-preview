import { describe, expect, it } from "vitest";
import {
  buildHelixAskLiveRuntimeSourceBinding,
  buildHelixAskMinimalRuntimeWorkspaceContext,
} from "../HelixAskMinimalRuntimeWorkspaceContext";
import { buildHelixAskMinimalRuntimeSubmitPlan } from "../HelixAskMinimalRuntimeSubmitPlan";

describe("Helix Ask minimal runtime workstation context", () => {
  it("prefers the live layout focus and emits gateway-compatible panel fields", () => {
    const context = buildHelixAskMinimalRuntimeWorkspaceContext({
      sessionId: "helix-chat:test",
      desktopUrl: "http://localhost:1522/desktop?focus=account-session&doc=docs/research/test.md",
      layoutState: {
        activeGroupId: "group-main",
        groups: {
          "group-main": {
            activePanelId: "scientific-calculator",
            panelIds: ["account-session", "scientific-calculator"],
          },
        },
      },
    });

    expect(context).toMatchObject({
      activePanel: "scientific-calculator",
      active_panel: "scientific-calculator",
      activeGroupId: "group-main",
      groupCount: 1,
      openPanels: ["account-session", "scientific-calculator"],
      activeDocPath: "docs/research/test.md",
    });

    const submitPlan = buildHelixAskMinimalRuntimeSubmitPlan({
      draft: "Which workstation panel are you currently looking at?",
      selectedRuntime: "codex",
      desktopUrl: "http://localhost:1522/desktop",
      workspaceContextSnapshot: context,
    });
    expect(submitPlan.context).toMatchObject({
      activePanel: "scientific-calculator",
      openPanels: ["account-session", "scientific-calculator"],
    });
  });

  it("builds a fresh Live source binding from the same layout context", () => {
    expect(buildHelixAskLiveRuntimeSourceBinding({
      desktopUrl: "http://localhost:1522/desktop?focus=account-session",
      layoutState: {
        activeGroupId: "group-main",
        groups: {
          "group-main": {
            activePanelId: "docs-viewer",
            panelIds: ["account-session", "docs-viewer"],
          },
        },
      },
    })).toEqual({
      thread_id: "helix-ask:desktop",
      source_id: "helix-ask:desktop",
      source_kind: "helix_ask_workstation",
      focus_panel_id: "docs-viewer",
    });
  });

  it("uses a validated Realtime dispatch runtime for one prompt without trusting route metadata", () => {
    const routeMetadata = {
      source: "realtime_stage_play",
      invocationKind: "stage_play_realtime_transcript_handoff",
      selectedRuntimeAgentProvider: "codex",
    };
    const admittedPlan = buildHelixAskMinimalRuntimeSubmitPlan({
      draft: "Check the visible workstation panel.",
      selectedRuntime: "helix",
      desktopUrl: "http://localhost:1522/desktop",
      pendingPrompt: {
        promptId: "realtime:admitted",
        question: "Check the visible workstation panel.",
        autoSubmit: true,
        serverAdmittedRuntimeAgentProvider: "codex",
        routeMetadata,
        createdAt: 100,
      },
    });
    expect(admittedPlan.envelope).toMatchObject({
      agentRuntime: "codex",
      agent_runtime: "codex",
    });

    const metadataOnlyPlan = buildHelixAskMinimalRuntimeSubmitPlan({
      draft: "Check the visible workstation panel.",
      selectedRuntime: "helix",
      desktopUrl: "http://localhost:1522/desktop",
      pendingPrompt: {
        promptId: "realtime:metadata-only",
        question: "Check the visible workstation panel.",
        autoSubmit: true,
        routeMetadata,
        createdAt: 100,
      },
    });
    expect(metadataOnlyPlan.envelope).toMatchObject({
      agentRuntime: "helix",
      agent_runtime: "helix",
    });
  });
});
