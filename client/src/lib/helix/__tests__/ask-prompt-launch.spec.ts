// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HELIX_ASK_PROMPT_EVENT,
  HELIX_PENDING_ASK_KEY,
  clearPendingHelixAskPrompt,
  consumePendingHelixAskPrompt,
  launchHelixAskPrompt,
} from "../ask-prompt-launch";

const navigateMock = vi.fn();

vi.mock("wouter/use-browser-location", () => ({
  navigate: (...args: unknown[]) => navigateMock(...args),
}));

describe("helix ask prompt launch bridge", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    clearPendingHelixAskPrompt();
    window.localStorage.removeItem("helix:pending-panel");
    window.history.replaceState({}, "", "/helix-core");
  });

  it("stores a pending prompt and navigates to desktop when launched outside the workstation shell", () => {
    const listener = vi.fn();
    window.addEventListener(HELIX_ASK_PROMPT_EVENT, listener as EventListener);
    try {
      launchHelixAskPrompt({
        question: "Explain nhm2.proof-guardrails and cite provenance.",
        blockId: "nhm2.proof-guardrails",
        panelId: "nhm2-solve-state",
      });
    } finally {
      window.removeEventListener(HELIX_ASK_PROMPT_EVENT, listener as EventListener);
    }

    const stored = JSON.parse(window.localStorage.getItem(HELIX_PENDING_ASK_KEY) ?? "{}");
    expect(typeof stored.promptId).toBe("string");
    expect(stored.promptId.length).toBeGreaterThan(0);
    expect(stored.question).toBe("Explain nhm2.proof-guardrails and cite provenance.");
    expect(stored.blockId).toBe("nhm2.proof-guardrails");
    expect(stored.bypassWorkstationDispatch).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/desktop");
  });

  it("keeps mobile Ask launches on the mobile workstation route", () => {
    window.history.replaceState(
      {},
      "",
      "/mobile?panels=workflow-demo-lab&focus=workflow-demo-lab",
    );

    launchHelixAskPrompt({
      question: "Use the next Workflow Demo prompt.",
      autoSubmit: false,
      panelId: "workflow-demo-lab",
    });

    expect(navigateMock).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/mobile");
    expect(window.location.search).toBe(
      "?panels=workflow-demo-lab&focus=workflow-demo-lab",
    );
    expect(consumePendingHelixAskPrompt()).toMatchObject({
      question: "Use the next Workflow Demo prompt.",
      autoSubmit: false,
      panelId: "workflow-demo-lab",
    });
  });

  it("preserves the active workstation panel for auto-submitted desktop prompts", () => {
    window.history.replaceState({}, "", "/desktop?panels=image-lens%2Cpostulate-board&focus=image-lens");
    const openPanelListener = vi.fn();
    window.addEventListener("open-helix-panel", openPanelListener as EventListener);
    try {
      launchHelixAskPrompt({
        question: "Frame a candidate postulate from the current promoted equation evidence.",
        autoSubmit: true,
      });
    } finally {
      window.removeEventListener("open-helix-panel", openPanelListener as EventListener);
    }

    expect(navigateMock).not.toHaveBeenCalled();
    expect(openPanelListener).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("helix:pending-panel")).toBeNull();
    expect(consumePendingHelixAskPrompt()?.question).toBe(
      "Frame a candidate postulate from the current promoted equation evidence.",
    );
  });

  it("preserves structured route metadata for auto-submitted mailbox wakes", () => {
    const listener = vi.fn();
    window.addEventListener(HELIX_ASK_PROMPT_EVENT, listener as EventListener);
    try {
      launchHelixAskPrompt({
        question: "Review the latest Stage Play live-source mailbox finding.",
        autoSubmit: true,
        panelId: "stage-play-badge-graph",
        route_metadata: {
          schema: "helix.ask.route_metadata.v1",
          source: "stage_play_mail_wake",
          invocationKind: "stage_play_mail_wake",
          wakeRequestId: "stage_play_live_source_mail_wake:test",
          mailboxThreadId: "helix-ask:desktop",
          sourceTarget: "live_source_mailbox",
          requiredCanonicalGoal: "processed_mail_interpretation",
          requiredPhase: "read_mailbox",
          allowedCapabilities: ["live_env.read_live_source_mail"],
          forbiddenCapabilities: ["workspace_os.status"],
          evidenceRefs: ["stage_play_processed_mail_packet:test"],
          requiredToolFamily: "live_source_mail",
          source_target_intent: {
            target_source: "live_source_mailbox",
            strength: "hard",
          },
          mandatory_next_tool: {
            tool_name: "live_env.read_live_source_mail",
            terminal_forbidden: true,
          },
        },
      });
    } finally {
      window.removeEventListener(HELIX_ASK_PROMPT_EVENT, listener as EventListener);
    }

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      detail: {
        routeMetadata: {
          invocationKind: "stage_play_mail_wake",
          wakeRequestId: "stage_play_live_source_mail_wake:test",
          mailboxThreadId: "helix-ask:desktop",
          sourceTarget: "live_source_mailbox",
          requiredCanonicalGoal: "processed_mail_interpretation",
          allowedCapabilities: ["live_env.read_live_source_mail"],
          forbiddenCapabilities: ["workspace_os.status"],
          evidenceRefs: ["stage_play_processed_mail_packet:test"],
          mandatory_next_tool: {
            tool_name: "live_env.read_live_source_mail",
          },
        },
        route_metadata: {
          invocationKind: "stage_play_mail_wake",
          wakeRequestId: "stage_play_live_source_mail_wake:test",
          mailboxThreadId: "helix-ask:desktop",
          sourceTarget: "live_source_mailbox",
          requiredCanonicalGoal: "processed_mail_interpretation",
        },
      },
    });
    const consumed = consumePendingHelixAskPrompt();
    expect(consumed?.routeMetadata).toMatchObject({
      invocationKind: "stage_play_mail_wake",
      wakeRequestId: "stage_play_live_source_mail_wake:test",
      mailboxThreadId: "helix-ask:desktop",
      sourceTarget: "live_source_mailbox",
      requiredCanonicalGoal: "processed_mail_interpretation",
      allowedCapabilities: ["live_env.read_live_source_mail"],
      forbiddenCapabilities: ["workspace_os.status"],
      evidenceRefs: ["stage_play_processed_mail_packet:test"],
      source_target_intent: {
        target_source: "live_source_mailbox",
      },
      mandatory_next_tool: {
        tool_name: "live_env.read_live_source_mail",
      },
    });
    expect(consumed?.route_metadata).toMatchObject({
      invocationKind: "stage_play_mail_wake",
      wakeRequestId: "stage_play_live_source_mail_wake:test",
      mailboxThreadId: "helix-ask:desktop",
      sourceTarget: "live_source_mailbox",
      requiredCanonicalGoal: "processed_mail_interpretation",
    });
  });

  it("marks postulate review prompts as backend Ask entrypoint required", () => {
    const listener = vi.fn();
    window.addEventListener(HELIX_ASK_PROMPT_EVENT, listener as EventListener);
    try {
      launchHelixAskPrompt({
        question: "/postulate\nReview this postulate candidate.",
        autoSubmit: true,
        routeMetadata: {
          schema: "helix.ask.route_metadata.v1",
          source: "postulate_final_answer_button",
          invocationKind: "postulate_final_answer_review",
          sourceTarget: "postulate_board",
          requiredCanonicalGoal: "postulate_runtime_review_then_gated_submit",
          allowedCapabilities: ["postulate.submit_proposal"],
          forbiddenCapabilities: [],
        },
      });
    } finally {
      window.removeEventListener(HELIX_ASK_PROMPT_EVENT, listener as EventListener);
    }

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        forceReasoningDispatch: true,
        requiresBackendAskEntrypoint: true,
        requires_backend_ask_entrypoint: true,
      }),
    }));
    expect(consumePendingHelixAskPrompt()).toMatchObject({
      question: "/postulate\nReview this postulate candidate.",
      forceReasoningDispatch: true,
      requiresBackendAskEntrypoint: true,
      requires_backend_ask_entrypoint: true,
      routeMetadata: expect.objectContaining({
        sourceTarget: "postulate_board",
      }),
    });
  });

  it("consumes and clears pending prompts deterministically", () => {
    window.localStorage.setItem(
      HELIX_PENDING_ASK_KEY,
      JSON.stringify({
        question: "Show provenance for nhm2.geometry-timing.",
        autoSubmit: false,
        blockId: "nhm2.geometry-timing",
        panelId: "nhm2-solve-state",
        bypassWorkstationDispatch: true,
        createdAt: 42,
      }),
    );

    const consumed = consumePendingHelixAskPrompt();
    expect(consumed).toEqual(
      expect.objectContaining({
        question: "Show provenance for nhm2.geometry-timing.",
        autoSubmit: false,
        blockId: "nhm2.geometry-timing",
        panelId: "nhm2-solve-state",
        bypassWorkstationDispatch: true,
        createdAt: 42,
      }),
    );
    expect(typeof consumed?.promptId).toBe("string");
    expect((consumed?.promptId ?? "").length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(HELIX_PENDING_ASK_KEY)).toBeNull();
  });

  it("preserves only registered server-admitted runtime bindings", () => {
    launchHelixAskPrompt({
      question: "Check the current workstation state.",
      serverAdmittedRuntimeAgentProvider: "codex",
    });
    expect(consumePendingHelixAskPrompt()).toMatchObject({
      serverAdmittedRuntimeAgentProvider: "codex",
    });

    window.localStorage.setItem(
      HELIX_PENDING_ASK_KEY,
      JSON.stringify({
        question: "Check the current workstation state.",
        serverAdmittedRuntimeAgentProvider: "unregistered-runtime",
      }),
    );
    expect(
      consumePendingHelixAskPrompt()?.serverAdmittedRuntimeAgentProvider,
    ).toBeUndefined();
  });

  it("preserves workflow QTE causal metadata across editable prompt handoff", () => {
    launchHelixAskPrompt({
      question: "Find one bounded scholarly paper.",
      autoSubmit: false,
      workflowQte: {
        schema: "helix.workflow_qte_launch.v1",
        runId: "workflow-demo:test",
        stepId: "paper_lookup",
        sourceSessionId: "chat:test",
      },
    });

    expect(consumePendingHelixAskPrompt()).toMatchObject({
      autoSubmit: false,
      workflowQte: {
        schema: "helix.workflow_qte_launch.v1",
        runId: "workflow-demo:test",
        stepId: "paper_lookup",
        sourceSessionId: "chat:test",
      },
    });
  });
});
