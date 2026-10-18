import { describe, expect, it } from "vitest";

import {
  buildHelixAskRuntimeGoalActiveGoalFromSession,
  buildHelixAskRuntimeGoalWakePostDecision,
  buildHelixAskRuntimeGoalVisibleSurfaceWakeCandidate,
  buildHelixAskRuntimeGoalVisibleSurfaceWakePostDecision,
  buildHelixAskRuntimeGoalVisibleSourceWakeCandidate,
  buildHelixAskRuntimeGoalWakeReply,
  selectHelixAskActiveRuntimeGoalFromReplies,
} from "@/components/helix/ask-console/HelixAskRuntimeGoalWakeEmitter";

describe("HelixAskRuntimeGoalWakeEmitter", () => {
  it("converts a server active runtime goal session into a wake-active goal", () => {
    const activeGoal = buildHelixAskRuntimeGoalActiveGoalFromSession({
      schema: "helix.runtime_goal.session.v1",
      goal_id: "goal:server-active",
      objective: "Keep tracking the visible document.",
      runtime_agent_provider: "codex",
      runtime_session_id: "runtime:codex:server-active",
      status: "waiting",
      status_reason: null,
      permission_profile: {
        id: "read-observe",
        label: "Read / Observe",
        allows: {
          observe: true,
          read: true,
          act: false,
          write: false,
          shell: false,
          codeMutation: false,
        },
      },
      allowed_lanes: [],
      allowed_workstation_tools: ["docs-viewer.read_visible_surface"],
      wake_policy: {
        manual_resume: true,
        visible_context_changed: true,
        document_changed: true,
        account_language_changed: false,
        lane_session_observation: false,
        tool_receipt_ready: false,
        timer_ms: null,
      },
      stop_policy: {
        user_cancel: true,
        goal_completed: true,
        permission_revoked: true,
        lane_unavailable: true,
        repeated_failure_threshold: 3,
        stale_source_ms: null,
        runtime_provider_unavailable: true,
      },
      report_policy: "report_every_terminal_authorized_result",
      quiet_policy: {
        quiet: false,
        report_policy: "report_every_terminal_authorized_result",
        summary_every_n_wakes: null,
      },
      job_brief: {
        schema: "helix.runtime_goal.job_brief.v1",
        goal_id: "goal:server-active",
        user_goal_text: "Keep tracking the visible document.",
        selected_runtime_agent_provider: "codex",
        created_at: "2026-07-05T00:00:00.000Z",
        source_binding: null,
        expected_wake_behavior: "Wake on admitted source changes.",
        allowed_capability_lanes: [],
        allowed_workstation_tools: ["docs-viewer.read_visible_surface"],
        stop_condition: "user_cancel",
        report_policy: "report_every_terminal_authorized_result",
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
      latest_wake_plan: null,
      latest_progress_summary: null,
      latest_source_binding: null,
      latest_turn_id: null,
      latest_observation_refs: [],
      latest_receipt_refs: [],
      latest_provider_terminal_candidate_ref: null,
      latest_final_answer_source: null,
      terminal_authority_status: "not_evaluated",
      failure_count: 0,
      last_failure_reason: null,
      wake_count: 0,
      created_at: "2026-07-05T00:00:00.000Z",
      updated_at: "2026-07-05T00:00:00.000Z",
      completed_at: null,
      cancelled_at: null,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });

    expect(activeGoal).toEqual({
      goalId: "goal:server-active",
      runtimeAgentProvider: "codex",
      sessionStatus: "waiting",
    });
  });

  it("selects the latest visible waiting runtime goal from replies", () => {
    const activeGoal = selectHelixAskActiveRuntimeGoalFromReplies([
      {
        id: "old",
        debug: {
          runtime_goal_session: {
            goal_id: "goal:old",
            runtime_agent_provider: "helix",
            status: "completed",
          },
        },
      },
      {
        id: "latest",
        debug: {
          runtime_goal_session: {
            goal_id: "goal:latest",
            runtime_agent_provider: "codex",
            status: "waiting",
          },
        },
      },
    ]);

    expect(activeGoal).toEqual({
      goalId: "goal:latest",
      runtimeAgentProvider: "codex",
      sessionStatus: "waiting",
    });
  });

  it("does not build a docs wake candidate without an active goal", () => {
    expect(
      buildHelixAskRuntimeGoalVisibleSourceWakeCandidate({
        activeGoal: null,
        docPath: "docs/example.md",
      }),
    ).toBeNull();
  });

  it("does not select weak synthesized runtime goal rows as active goals", () => {
    const activeGoal = selectHelixAskActiveRuntimeGoalFromReplies([
      {
        id: "synthesized-terminal-row",
        debug: {
          runtime_goal_session: {
            goal_id: "goal:synthesized",
            runtime_agent_provider: "codex",
            status: "not_reported",
            synthesized_from_terminal_authority: true,
          },
        },
      },
    ]);

    expect(activeGoal).toBeNull();
  });

  it("builds a visible-source wake candidate for the docs viewer", () => {
    const candidate = buildHelixAskRuntimeGoalVisibleSourceWakeCandidate({
      activeGoal: {
        goalId: "goal:abc",
        runtimeAgentProvider: "codex",
        sessionStatus: "waiting",
      },
      selectedAgentRuntime: "helix",
      docPath: "docs/research/nhm2-current-status-whitepaper.md",
      observedAtMs: 1783038189513,
      workspaceContextSnapshot: {
        active_panel_id: "docs-viewer",
        active_doc_visible_translation_context: {
          doc_path: "docs/research/nhm2-current-status-whitepaper.md",
          source_id: "document_markdown:docs/research/nhm2-current-status-whitepaper.md",
          source_hash: "hash-1",
        },
      },
    });

    expect(candidate).toMatchObject({
      goal_id: "goal:abc",
      agent_runtime: "codex",
      event_kind: "visible_source_changed",
      source_kind: "docs_viewer_visible_surface",
      doc_path: "docs/research/nhm2-current-status-whitepaper.md",
      active_panel_id: "docs-viewer",
      source_hash: "hash-1",
      proposed_tool: "docs-viewer.read_visible_surface",
      requires_user_visible_turn: true,
      observed_at_ms: 1783038189513,
      question: "/goal wake",
    });
    expect(candidate?.dedupe_key).toContain("goal:abc");
    expect(candidate?.dedupe_key).toContain("hash-1");
  });

  it("builds a visible-surface wake candidate from visible chunk identity", () => {
    const candidate = buildHelixAskRuntimeGoalVisibleSurfaceWakeCandidate({
      activeGoal: {
        goalId: "goal:surface",
        runtimeAgentProvider: "codex",
        sessionStatus: "waiting",
      },
      docPath: "docs/current.md",
      observedAtMs: 1783038189514,
      workspaceContextSnapshot: {
        active_panel_id: "docs-viewer",
      },
      activeVisibleContext: {
        doc_path: "docs/current.md",
        source_id: "document_markdown:docs/current.md",
        source_hash: "doc-hash",
        chunks: [
          {
            projection_target: "docs_chunk",
            source_kind: "docs_viewer",
            chunk_id: "u0002",
            source_text_hash: "chunk-hash-2",
          },
        ],
      },
    });

    expect(candidate).toMatchObject({
      goal_id: "goal:surface",
      agent_runtime: "codex",
      event_kind: "visible_surface_changed",
      reason: "docs_viewer_visible_surface_changed",
      doc_path: "docs/current.md",
      source_hash: "doc-hash",
      proposed_tool: "docs-viewer.read_visible_surface",
      observed_at_ms: 1783038189514,
    });
    expect(candidate?.dedupe_key).toContain("visible_surface_changed");
    expect(candidate?.dedupe_key).toContain("u0002");
    expect(candidate?.dedupe_key).toContain("chunk-hash-2");
    expect(candidate?.workspace_context_snapshot).toMatchObject({
      active_doc_visible_translation_context: {
        doc_path: "docs/current.md",
      },
    });
  });

  it.each([
    {
      label: "research-library provenance",
      docPath: "docs/canonical-decoy.md",
      snapshotDocPath: "docs/stale-canonical-fallback.md",
      context: {
        doc_path: "docs/canonical-decoy.md",
        document_source_kind: "research_library",
        chunks: [{ visible_text: "PRIVATE RESEARCH TEXT" }],
      },
    },
    {
      label: "private-source flag",
      docPath: "docs/canonical-decoy.md",
      snapshotDocPath: "docs/stale-canonical-fallback.md",
      context: {
        doc_path: "docs/canonical-decoy.md",
        private_source: true,
        chunks: [{ visible_text: "PRIVATE RESEARCH TEXT" }],
      },
    },
    {
      label: "opaque research viewer path",
      docPath: "research-library/private-research%3Aaccount-token%3Adocument-token",
      snapshotDocPath: "docs/stale-canonical-fallback.md",
      context: {
        doc_path: "research-library/private-research%3Aaccount-token%3Adocument-token",
        chunks: [{ visible_text: "PRIVATE RESEARCH TEXT" }],
      },
    },
    {
      label: "nested private target provenance",
      docPath: "docs/canonical-decoy.md",
      snapshotDocPath: "docs/stale-canonical-fallback.md",
      context: {
        doc_path: "docs/canonical-decoy.md",
        chunks: [{
          document_source_kind: "research_library",
          visible_text: "PRIVATE RESEARCH TEXT",
        }],
      },
    },
    {
      label: "research viewer path hidden behind a canonical input path",
      docPath: "docs/canonical-decoy.md",
      snapshotDocPath: "research-library/private-research%3Aaccount-token%3Adocument-token",
      context: {
        doc_path: "docs/canonical-decoy.md",
        chunks: [{ visible_text: "PRIVATE RESEARCH TEXT" }],
      },
    },
  ])("does not build runtime-goal wakes from $label", ({ docPath, snapshotDocPath, context }) => {
    const activeGoal = {
      goalId: "goal:unrelated-active-goal",
      runtimeAgentProvider: "codex" as const,
      sessionStatus: "waiting",
    };
    const workspaceContextSnapshot = {
      active_panel_id: "docs-viewer",
      active_doc_path: snapshotDocPath,
      active_doc_visible_translation_context: context,
    };

    expect(buildHelixAskRuntimeGoalVisibleSourceWakeCandidate({
      activeGoal,
      docPath,
      workspaceContextSnapshot,
    })).toBeNull();
    expect(buildHelixAskRuntimeGoalVisibleSurfaceWakeCandidate({
      activeGoal,
      docPath,
      workspaceContextSnapshot,
      activeVisibleContext: context,
    })).toBeNull();
  });

  it("suppresses duplicate visible-source wake candidates by dedupe key", () => {
    const activeGoal = {
      goalId: "goal:abc",
      runtimeAgentProvider: "codex" as const,
      sessionStatus: "waiting",
    };
    const baseDecision = buildHelixAskRuntimeGoalWakePostDecision({
      activeGoal,
      docPath: "docs/example.md",
      workspaceContextSnapshot: {
        active_doc_visible_translation_context: {
          doc_path: "docs/example.md",
          source_hash: "hash-duplicate",
        },
      },
    });
    const duplicateDecision = buildHelixAskRuntimeGoalWakePostDecision({
      activeGoal,
      docPath: "docs/example.md",
      workspaceContextSnapshot: {
        active_doc_visible_translation_context: {
          doc_path: "docs/example.md",
          source_hash: "hash-duplicate",
        },
      },
      lastSubmittedDedupeKey: baseDecision.dedupeKey,
    });

    expect(baseDecision).toMatchObject({
      shouldSubmit: true,
      reason: "candidate_ready",
    });
    expect(duplicateDecision).toMatchObject({
      shouldSubmit: false,
      reason: "duplicate_dedupe_key",
      dedupeKey: baseDecision.dedupeKey,
    });
  });

  it("suppresses visible-source wake candidates while a wake is already in flight", () => {
    const decision = buildHelixAskRuntimeGoalWakePostDecision({
      activeGoal: {
        goalId: "goal:abc",
        runtimeAgentProvider: "codex",
        sessionStatus: "waiting",
      },
      docPath: "docs/example.md",
      inFlight: true,
    });

    expect(decision).toEqual({
      shouldSubmit: false,
      reason: "wake_in_flight",
      candidate: null,
      dedupeKey: null,
    });
  });

  it("suppresses duplicate visible-surface wake candidates by dedupe key", () => {
    const activeGoal = {
      goalId: "goal:surface",
      runtimeAgentProvider: "codex" as const,
      sessionStatus: "waiting",
    };
    const activeVisibleContext = {
      doc_path: "docs/current.md",
      source_hash: "doc-hash",
      chunks: [
        {
          projection_target: "docs_chunk",
          source_kind: "docs_viewer",
          chunk_id: "u0003",
          source_text_hash: "chunk-hash-3",
        },
      ],
    };
    const baseDecision = buildHelixAskRuntimeGoalVisibleSurfaceWakePostDecision({
      activeGoal,
      docPath: "docs/current.md",
      activeVisibleContext,
    });
    const duplicateDecision = buildHelixAskRuntimeGoalVisibleSurfaceWakePostDecision({
      activeGoal,
      docPath: "docs/current.md",
      activeVisibleContext,
      lastSubmittedDedupeKey: baseDecision.dedupeKey,
    });

    expect(baseDecision).toMatchObject({
      shouldSubmit: true,
      reason: "candidate_ready",
    });
    expect(duplicateDecision).toMatchObject({
      shouldSubmit: false,
      reason: "duplicate_dedupe_key",
      dedupeKey: baseDecision.dedupeKey,
    });
  });

  it("builds a console reply from a wake response with debug fields", () => {
    const reply = buildHelixAskRuntimeGoalWakeReply({
      createdAtMs: 1783038189513,
      response: {
        turn_id: "turn:1",
        selected_final_answer: "Goal progress updated.",
        agent_runtime: "codex",
        runtime_goal_wake_candidate: {
          event_kind: "visible_source_changed",
          dedupe_key: "dedupe:1",
        },
        runtime_goal_wake_admission: {
          status: "admitted",
          reason: "visible_source_changed",
        },
        runtime_goal_session: {
          goal_id: "goal:abc",
          runtime_agent_provider: "codex",
          status: "waiting",
        },
        runtime_goal_debug_export: {
          goal_id: "goal:abc",
          session_status: "waiting",
        },
      },
    });

    expect(reply).toMatchObject({
      id: "turn:1",
      turn_id: "turn:1",
      content: "Goal progress updated.",
      agent_runtime: "codex",
      createdAtMs: 1783038189513,
    });
    expect(reply.debug.runtime_goal_wake_admission).toMatchObject({
      status: "admitted",
    });
    expect(reply.debug.runtime_goal_session).toMatchObject({
      goal_id: "goal:abc",
    });
  });
});
