// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HELIX_DEVELOPER_ACCOUNT_POLICY,
  HELIX_USER_ACCOUNT_POLICY,
} from "@shared/helix-account-session";
import WorkflowDemoLabPanel from "@/components/workstation/WorkflowDemoLabPanel";
import {
  clearCachedAccountCapabilityPolicy,
  fetchAccountCapabilityPolicy,
} from "@/lib/workstation/accountCapabilityPolicy";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { useTheoryExperimentWorkflowStore } from "@/store/useTheoryExperimentWorkflowStore";

const testRuntime = vi.hoisted(() => ({
  launchHelixAskPrompt: vi.fn(),
}));

vi.mock("@/lib/helix/ask-prompt-launch", () => ({
  launchHelixAskPrompt: (...args: unknown[]) =>
    testRuntime.launchHelixAskPrompt(...args),
}));

describe("WorkflowDemoLabPanel execution closure", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useTheoryExperimentWorkflowStore.getState().reset();
    useAgiChatStore.setState({
      sessions: {},
      activeId: "chat:theory-closure",
      hydrated: true,
    });
    testRuntime.launchHelixAskPrompt.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          account_policy: HELIX_DEVELOPER_ACCOUNT_POLICY,
        }),
      })),
    );
    await fetchAccountCapabilityPolicy();
  });

  afterEach(() => {
    cleanup();
    clearCachedAccountCapabilityPolicy();
    useTheoryExperimentWorkflowStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it("inserts an editable non-terminal closure prompt without auto-submit", async () => {
    const started = useTheoryExperimentWorkflowStore.getState().start({
      sourceSessionId: "chat:theory-closure",
      target: "Compare the registered badge",
      selectedBadgeIds: ["study.casimir_dp.evidence_map_stage3"],
      lanyonRequested: true,
    });
    useTheoryExperimentWorkflowStore.setState({
      session: {
        ...started,
        observedTurnId: "ask:test:prepared-procedure",
        procedureArtifactId:
          "ask:test:prepared-procedure:codex_normalized:theory_experiment_procedure_observation:1",
        procedureSha256: "a".repeat(64),
        procedureGeneratedAt: "2026-07-25T12:00:00.000Z",
      },
    });

    render(<WorkflowDemoLabPanel />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Continue execution closure in Ask",
      }),
    );

    expect(testRuntime.launchHelixAskPrompt).toHaveBeenCalledWith({
      question: expect.stringContaining(
        "theory-experiment-procedure.evaluate_closure",
      ),
      autoSubmit: false,
      panelId: "workflow-demo-lab",
      suppressWorkstationPayloadActions: true,
    });
    const question = testRuntime.launchHelixAskPrompt.mock.calls[0]?.[0]?.question;
    expect(question).toContain("theory-experiment-procedure.readmit");
    expect(question).toContain(
      "Only after that typed readmission observation re-enters",
    );
    expect(question).toContain(`procedure_id=${JSON.stringify(started.procedureId)}`);
    expect(question).toContain(`procedure_sha256=${JSON.stringify("a".repeat(64))}`);
    expect(question).toContain("do not recalculate the ranking");
    expect(question).toContain("confirmation-gated agent-runtime action");
  });

  it("keeps the projection visible while hiding developer controls for public users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          account_policy: HELIX_USER_ACCOUNT_POLICY,
        }),
      })),
    );
    await fetchAccountCapabilityPolicy();

    render(<WorkflowDemoLabPanel />);

    expect(
      await screen.findByTestId("theory-experiment-procedure-launcher"),
    ).toBeInTheDocument();
    expect(screen.getByText("public projection")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Prepare in Ask" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Continue execution closure in Ask",
      }),
    ).not.toBeInTheDocument();
  });
});
