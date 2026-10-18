// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StagePlayBadgeGraphPanel from "../panels/StagePlayBadgeGraphPanel";
import { useStagePlayBadgeGraphPanelStore } from "@/store/useStagePlayBadgeGraphPanelStore";
import { useLiveAnswerEnvironmentStore } from "@/store/useLiveAnswerEnvironmentStore";
import { STAGE_PLAY_LIVE_SOURCE_MAIL_REFRESH_EVENT } from "@/lib/helix/liveSourceMailRefreshEvent";
import { workstationCircuitColor } from "@/lib/workstation/reasoningCircuitColor";
import {
  buildStagePlayBadgeGraphV1,
  type StagePlayBadgeGraphV1,
  type StagePlayBadgeV1,
} from "@shared/contracts/stage-play-badge-graph.v1";
import { WORKSTATION_AGENT_GOAL_DEFAULT_FINAL_REPORT_REQUIREMENTS } from "@shared/contracts/workstation-goal-context.v1";

const visualProducerMock = vi.hoisted(() => ({
  getActiveVisualFrameStream: vi.fn(() => null),
  getLatestActiveVisualFrameStream: vi.fn(() => null),
  startVisualFrameProducerInterval: vi.fn(async (input: { sourceId: string }) => ({
    source_id: input.sourceId,
    frame_id: "visual_frame:test",
    evidence_id: "visual_evidence:test",
    summary: "mock visual capture",
    evidence: null,
  })),
  stopVisualFrameProducerInterval: vi.fn(),
}));

vi.mock("@/lib/helix/visualFrameProducer", () => visualProducerMock);

const sourceWindow: StagePlayBadgeGraphV1["sourceWindow"] = {
  threadId: "thread:stage-play-ui",
  roomId: "room:minecraft",
  worldId: "world:overworld",
  environmentId: "live_env:minecraft",
  fromTs: "2026-06-02T00:00:00.000Z",
  toTs: "2026-06-02T00:00:01.000Z",
  latestObservationRefs: ["live_source_observation:ui"],
  latestRawSessionBufferRefs: ["stage_play_raw_session_buffer_entry:ui"],
  sources: [
    {
      sourceId: "source:visual-tab",
      modality: "visual_frame",
      status: "active",
      contribution: "Visual frames provide compact scene context.",
      fidelityScore: 0.84,
      selectedForStagePlay: true,
      routeTo: "visual_context",
      cadenceMs: 10000,
      lastEventTs: "2026-06-02T00:00:01.000Z",
      missingReason: null,
      nextRequiredAction: null,
      evidenceRefs: ["live_source_observation:ui", "stage_play_raw_session_buffer_entry:ui"],
    },
    {
      sourceId: "source:audio-transcript",
      modality: "audio_transcript",
      status: "configured_missing",
      contribution: "Audio transcript can provide dialogue once attached.",
      fidelityScore: 0,
      selectedForStagePlay: false,
      routeTo: "narrative_stage_play",
      cadenceMs: null,
      lastEventTs: null,
      missingReason: "No audio transcript source is currently attached.",
      nextRequiredAction: "Attach audio transcript",
      evidenceRefs: [],
    },
    {
      sourceId: "source:live-answer",
      modality: "live_answer_output",
      status: "active",
      contribution: "Live Answer output receives projected Stage Play evidence lanes after explicit projection.",
      fidelityScore: 0.7,
      selectedForStagePlay: false,
      routeTo: "live_answer_output",
      cadenceMs: null,
      lastEventTs: "2026-06-02T00:00:01.000Z",
      missingReason: null,
      nextRequiredAction: null,
      evidenceRefs: ["live_answer_environment:ui"],
    },
  ],
  latestSnapshotRefs: ["environment_snapshot:ui"],
  latestDeltaOverlayRefs: [],
  latestNavigationRefs: ["navigation_state:ui"],
  freshness: "fresh",
};

const sourceRefs: StagePlayBadgeV1["sourceRefs"] = [
  { kind: "live_source_observation", id: "live_source_observation:ui" },
  { kind: "environment_state_snapshot", id: "environment_snapshot:ui" },
];

type TestSourceHandle = {
  sourceId: string;
  sourceClass: string;
  status: string;
  label: unknown;
  descriptorId: unknown;
  producerId: unknown;
  surface: unknown;
  origin: unknown;
  cadenceMs: unknown;
  latestEvidenceRefs: string[];
};

function badge(overrides: Partial<StagePlayBadgeV1>): StagePlayBadgeV1 {
  return {
    id: "intent.move_away",
    title: "Move away",
    plainMeaning: "Create distance from a nearby threat.",
    whyItMatters: "Distance changes the immediate action bounds.",
    kind: "intent_module",
    status: "candidate",
    subjects: ["player"],
    tags: ["movement"],
    liveBindings: [],
    sourceRefs,
    evidenceRefs: ["environment_snapshot:ui"],
    confidence: 0.82,
    missingEvidence: [],
    reasonCodes: ["live_world_hazard_nearby"],
    intentModule: { verb: "move_away", actorId: "actor.player" },
    admission: "ask_user",
    ...overrides,
  };
}

function buildFixture(): StagePlayBadgeGraphV1 {
  return buildStagePlayBadgeGraphV1({
    graphId: "stage_play_badge_graph:ui-fixture",
    title: "Stage Play Badge Graph",
    description: "Fixture-backed live-world action graph.",
    sourceWindow,
    badges: [
      badge({
        id: "observer.live_sources",
        title: "Observer",
        plainMeaning: "Source custody and routing for the Stage Play window.",
        whyItMatters: "Observer shows source availability before story or world facts are interpreted.",
        kind: "observer",
        status: "observed",
        liveBindings: [],
        intentModule: undefined,
        evidenceRefs: ["live_source_observation:ui"],
        reasonCodes: ["observer_source_custody"],
        dataTray: {
          title: "Observer",
          summary: "latest scene summary available",
          updatedAt: "2026-06-02T00:00:01.000Z",
          freshness: "fresh",
          confidence: 0.84,
          evidenceRefs: ["live_source_observation:ui"],
        },
      }),
      badge({
        id: "source.visual_tab",
        title: "Visual Tab Source",
        plainMeaning: "Visual source handle routed into the Stage Play graph.",
        whyItMatters: "Source nodes make live-source custody selectable from the graph instead of buried in the console.",
        kind: "source",
        status: "observed",
        subjects: ["source:visual-tab"],
        tags: ["source", "visual_frame"],
        sourceRefs: [
          { kind: "live_source_observation", id: "live_source_observation:ui" },
          { kind: "stage_play_raw_session_buffer_entry", id: "stage_play_raw_session_buffer_entry:ui" },
        ],
        liveBindings: [{
          bindingKind: "source_modality",
          sourceRefIds: ["live_source_observation:ui"],
          freshness: "fresh",
          confidence: 0.84,
          compactValue: "visual_frame:active:visual_context",
        }],
        intentModule: undefined,
        evidenceRefs: ["live_source_observation:ui", "stage_play_raw_session_buffer_entry:ui"],
        reasonCodes: ["source_handle"],
        dataTray: {
          title: "Visual source",
          summary: "Visual source active.",
          updatedAt: "2026-06-02T00:00:01.000Z",
          freshness: "fresh",
          confidence: 0.84,
          evidenceRefs: ["live_source_observation:ui", "visual_frame:ui", "visual_evidence:ui"],
          inputRefs: ["source:visual-tab"],
          inputPreview: "source:visual-tab",
          transformLabel: "Visual frame producer / source descriptor",
          outputRefs: ["visual_frame:ui"],
          outputPreview: "active -> visual_frame:ui",
        },
      }),
      badge({
        id: "interpreter.stage_play_reflection",
        title: "Stage Play interpreter",
        plainMeaning: "A compact interpretation job can reduce selected sources into stage facts and procedural bindings.",
        whyItMatters: "The interpreter may produce evidence projections, but it cannot answer or act.",
        kind: "interpreter",
        status: "candidate",
        subjects: ["thread:stage-play-ui", "room:minecraft"],
        tags: ["interpreter", "reflect_stage_play_context", "evidence_only"],
        liveBindings: [{
          bindingKind: "source_status",
          sourceRefIds: ["live_source_observation:ui"],
          freshness: "fresh",
          confidence: 0.76,
          compactValue: "fresh",
        }],
        intentModule: undefined,
        evidenceRefs: ["live_source_observation:ui"],
        reasonCodes: ["stage_play_interpreter", "compact_source_window"],
        dataTray: {
          title: "Stage Play interpreter",
          summary: "reflect_stage_play_context reduces compact evidence into graph badges.",
          updatedAt: "2026-06-02T00:00:01.000Z",
          freshness: "fresh",
          confidence: 0.76,
          evidenceRefs: ["live_source_observation:ui", "visual_evidence:ui"],
          inputRefs: ["visual_evidence:ui", "live_source_descriptor:ui"],
          inputPreview: "Minecraft-like scene with character and enchantment table.",
          transformLabel: "reflect_stage_play_context",
          outputRefs: ["stage_play_badge_graph:ui-fixture"],
          outputPreview: "graph badges: 19; affordances: 1; blocked: 0",
        },
      }),
      badge({
        id: "compact_observation.latest",
        title: "Latest Compact Observation",
        plainMeaning: "The latest compact observation summarizes source facts without raw transcript or frames.",
        whyItMatters: "Compact observations are the source-window facts that downstream stage badges can cite.",
        kind: "compact_observation",
        status: "observed",
        subjects: ["source:visual-tab"],
        tags: ["compact_observation", "visual_context"],
        sourceRefs: [{ kind: "stage_play_compact_observation", id: "stage_play_compact_observation:ui" }],
        liveBindings: [{
          bindingKind: "source_status",
          sourceRefIds: ["stage_play_compact_observation:ui"],
          freshness: "fresh",
          confidence: 0.76,
          compactValue: "scene window: player visible",
        }],
        intentModule: undefined,
        admission: null,
        confidence: 0.76,
        evidenceRefs: ["stage_play_compact_observation:ui"],
        reasonCodes: ["compact_source_window"],
        dataTray: {
          title: "Compact observation",
          summary: "latest compact fact summary",
          updatedAt: "2026-06-02T00:00:01.000Z",
          freshness: "fresh",
          confidence: 0.76,
          evidenceRefs: ["stage_play_compact_observation:ui"],
          inputRefs: ["visual_frame:ui"],
          inputPreview: "visual_frame:ui",
          transformLabel: "visual frame analyze -> compact evidence",
          outputRefs: ["visual_evidence:ui"],
          outputPreview: "Minecraft-like scene with character, book/crafting station, enchantment table, cat.",
        },
      }),
      badge({
        id: "helix_ask.checkpoint.latest",
        title: "Latest Ask Checkpoint",
        plainMeaning: "The latest Ask checkpoint records whether the solver completed a model-reviewed path.",
        whyItMatters: "Only completed model-reviewed checkpoints can uphold an answer snapshot.",
        kind: "helix_ask_checkpoint",
        status: "observed",
        subjects: ["thread:stage-play-ui"],
        tags: ["ask_checkpoint", "model_reviewed"],
        liveBindings: [],
        intentModule: undefined,
        admission: null,
        confidence: 0.92,
        evidenceRefs: ["ask_turn_solver_trace:ui"],
        reasonCodes: ["completed_solver_path", "route_authority_passed"],
        checkpoint: {
          askTurnId: "ask-turn:ui",
          solverTraceRef: "ask_turn_solver_trace:ui",
          terminalArtifactKind: "workstation_tool_evaluation",
          finalAnswerSource: "model",
          modelReviewed: true,
        },
        dataTray: {
          title: "Ask checkpoint",
          summary: "solver completed; model reviewed",
          updatedAt: "2026-06-02T00:00:02.000Z",
          freshness: "fresh",
          confidence: 0.92,
          evidenceRefs: ["ask_turn_solver_trace:ui"],
        },
      }),
      badge({
        id: "checkpoint_request.ui",
        title: "Checkpoint Request: Meaningful Perturbation",
        plainMeaning: "A bounded Helix Ask checkpoint has been requested for this Stage Play job.",
        whyItMatters: "The request queues visible reasoning without creating a hidden answer loop.",
        kind: "checkpoint_request",
        status: "ask_user_required",
        subjects: ["stage_play_job:ui", "stage_play_badge_graph:ui-fixture"],
        tags: ["checkpoint_request", "meaningful_perturbation", "queued"],
        liveBindings: [],
        sourceRefs: [{ kind: "stage_play_checkpoint_request", id: "stage_play_checkpoint_request:ui" }],
        intentModule: undefined,
        admission: "ask_user",
        confidence: 0.72,
        evidenceRefs: [
          "stage_play_checkpoint_request:ui",
          "stage_play_badge_graph:ui-fixture",
          "stage_play_perturbation_event:ui",
        ],
        reasonCodes: [
          "stage_play_checkpoint_request",
          "checkpoint_reason_meaningful_perturbation",
          "checkpoint_status_queued",
          "requires_user_approval",
        ],
        dataTray: {
          title: "Checkpoint request",
          summary: "Meaningful perturbation is queued; visible queue first.",
          updatedAt: "2026-06-02T00:00:02.500Z",
          freshness: "fresh",
          confidence: 0.72,
          evidenceRefs: ["stage_play_checkpoint_request:ui"],
          inputRefs: ["stage_play_badge_graph:ui-fixture", "stage_play_compact_observation:ui", "stage_play_perturbation_event:ui"],
          inputPreview: "graph + projected interpretation + prompt",
          transformLabel: "checkpoint request queue",
          outputRefs: ["stage_play_checkpoint_request:ui"],
          outputPreview: "stage_play_checkpoint_request:ui status: queued",
        },
      }),
      badge({
        id: "answer_snapshot.latest",
        title: "Latest Answer Snapshot",
        plainMeaning: "The latest upheld answer snapshot came from a model-reviewed Ask checkpoint.",
        whyItMatters: "Answer snapshots separate reviewed output from evidence projections.",
        kind: "answer_snapshot",
        status: "observed",
        subjects: ["thread:stage-play-ui"],
        tags: ["answer_snapshot", "model_reviewed"],
        liveBindings: [],
        intentModule: undefined,
        admission: null,
        confidence: 0.9,
        evidenceRefs: ["ask_turn_solver_trace:ui", "stage_play_badge_graph:ui-fixture"],
        reasonCodes: ["model_reviewed_answer_snapshot"],
        checkpoint: {
          askTurnId: "ask-turn:ui",
          solverTraceRef: "ask_turn_solver_trace:ui",
          terminalArtifactKind: "workstation_tool_evaluation",
          finalAnswerSource: "model",
          modelReviewed: true,
        },
        output: {
          lineKey: "answer_snapshot",
          text: "Hold position until the next observation confirms the scene.",
          state: "model_reviewed",
          voiceEligible: false,
        },
        dataTray: {
          title: "Answer snapshot",
          summary: "latest upheld answer",
          updatedAt: "2026-06-02T00:00:03.000Z",
          freshness: "fresh",
          confidence: 0.9,
          evidenceRefs: ["ask_turn_solver_trace:ui"],
          inputRefs: ["helix_ask.checkpoint.latest", "ask_turn_solver_trace:ui"],
          transformLabel: "answer snapshot promotion",
          outputRefs: ["answer_snapshot.latest"],
          outputPreview: "Hold position until the next observation confirms the scene.",
        },
      }),
      badge({
        id: "live_output.current",
        title: "Current Live Output",
        plainMeaning: "Live output can display reviewed or projected answer lines without becoming tool authority.",
        whyItMatters: "The output lane shows what the workstation can present after the right authority boundary.",
        kind: "live_output",
        status: "candidate",
        subjects: ["thread:stage-play-ui"],
        tags: ["live_output"],
        liveBindings: [],
        intentModule: undefined,
        admission: null,
        confidence: 0.7,
        evidenceRefs: ["live_answer_environment:ui"],
        reasonCodes: ["live_answer_projection"],
        output: {
          lineKey: "possibilities",
          text: "Project Stage Play possibilities into Live Answer.",
          state: "projected",
          voiceEligible: false,
        },
        dataTray: {
          title: "Live output",
          summary: "possibilities projected",
          updatedAt: "2026-06-02T00:00:04.000Z",
          freshness: "fresh",
          confidence: 0.7,
          evidenceRefs: ["live_answer_environment:ui"],
          inputRefs: ["stage_play_badge_graph:ui-fixture"],
          inputPreview: "Stage Play graph plus projected interpretation lanes.",
          transformLabel: "output lane reducer",
          outputRefs: ["risk", "possibilities", "unknowns", "next_check"],
          outputPreview: "risk, possibilities, unknowns, next_check",
          skipped: ["recommendation", "answer_snapshot", "voice_output"],
        },
      }),
      badge({
        id: "workstation_state_plane.terminal_authority",
        title: "Terminal Authority",
        plainMeaning: "No current terminal answer has been selected by a completed solver path.",
        whyItMatters: "Receipts, MicroDeck outputs, narrator events, and panel projections remain observations until terminal authority selects an answer.",
        kind: "workstation_state_plane",
        status: "blocked",
        subjects: [
          "helix_ask.checkpoint.latest",
          "answer_snapshot.latest",
          "stage_play_goal_context_update:automation:ui",
        ],
        tags: [
          "workstation_state_plane",
          "terminal_authority",
          "awaiting_completed_solver_path",
          "goal_sessions_require_terminal_authority",
          "receipts_not_answers",
        ],
        liveBindings: [],
        intentModule: undefined,
        admission: "auto",
        confidence: 0.72,
        evidenceRefs: [
          "stage_play_goal_context_update:automation:ui",
          "helix_ask.checkpoint.latest",
          "answer_snapshot.latest",
        ],
        reasonCodes: [
          "terminal_authority_state",
          "terminal_authority_pending",
          "receipts_and_goal_context_are_observations",
        ],
        dataTray: {
          title: "Terminal authority",
          summary: "3 non-terminal goal-context updates; 1 goal session requires terminal authority.",
          updatedAt: "2026-06-02T00:00:04.500Z",
          freshness: "missing",
          confidence: 0.72,
          evidenceRefs: [
            "stage_play_goal_context_update:automation:ui",
            "goal:stage-play-monitor",
            "helix_ask.checkpoint.latest",
          ],
          inputRefs: [
            "workstation_state_plane.gates",
            "workstation_state_plane.goal_context_bus",
            "stage_play_goal_context_update:automation:ui",
          ],
          inputPreview: "Goal-context updates, receipts, narrator events, and output lanes are observations.",
          transformLabel: "completed solver path / terminal authority boundary",
          outputRefs: [],
          outputPreview: "terminal answer pending",
          skipped: [
            "goal_context_updates",
            "workstation_control_receipts",
            "microdeck_outputs",
            "narrator_events",
            "panel_projections",
          ],
          blockedUntil: "completed solver path selects terminal answer",
        },
      }),
      badge({
        id: "workstation_state_plane.context_feed_index",
        title: "Context feed index",
        plainMeaning: "Active goal sessions declare queryable context feed lanes and query actuator policy.",
        whyItMatters: "The agent reads indexed workstation feed evidence instead of hosting the continuous source loop.",
        kind: "workstation_state_plane",
        status: "observed",
        subjects: [
          "visual_summaries",
          "microdeck_outputs",
          "packet_traces",
          "source_health",
          "translated_transcripts",
          "trace_memory",
          "narrator_events",
          "allowed_actuator:query_visual_summaries",
          "allowed_actuator:query_translation_segments",
        ],
        tags: [
          "workstation_state_plane",
          "context_feed_index",
          "queryable_goal_context",
          "agent_read_model",
          "not_terminal_authority",
        ],
        liveBindings: [],
        intentModule: undefined,
        admission: "auto",
        confidence: 0.8,
        evidenceRefs: [
          "context_feed:visual_summaries",
          "context_feed:translated_transcripts",
          "allowed_actuator:query_visual_summaries",
          "allowed_actuator:query_translation_segments",
          "stage_play_context_feed_query:visual_summaries:ui",
          "stage_play_context_feed_query:translated_transcripts:ui",
        ],
        reasonCodes: [
          "context_feed_index",
          "queryable_goal_context",
          "agent_reads_deterministic_feeds",
          "observation_not_terminal_authority",
        ],
        dataTray: {
          title: "Context feed index",
          summary: "8 feed lanes, 5 query actuator policy refs, 2 query receipt refs.",
          updatedAt: "2026-06-02T00:00:04.600Z",
          freshness: "fresh",
          confidence: 0.8,
          evidenceRefs: [
            "context_feed:visual_summaries",
            "context_feed:translated_transcripts",
            "allowed_actuator:query_visual_summaries",
            "allowed_actuator:query_translation_segments",
            "stage_play_context_feed_query:visual_summaries:ui",
            "stage_play_context_feed_query:translated_transcripts:ui",
          ],
          inputRefs: [
            "goal:stage-play-monitor",
            "stage_play_goal_context_update:translation:ui",
          ],
          inputPreview: "visual_summaries, microdeck_outputs, packet_traces, source_health, translated_transcripts, trace_memory, narrator_events",
          transformLabel: "AgentGoalSession feeds -> query policy index",
          toolRefs: [
            "requested_tool:query_translation_segments",
            "canonical_tool:live_env.query_translation_segments",
            "matched_actuator:query_translation_segments",
            "agent_goal_allowed_actuator:query_translation_segments",
          ],
          toolPreview: "tool query_translation_segments -> live_env.query_translation_segments; matched query_translation_segments",
          outputRefs: [
            "context_feed:visual_summaries",
            "context_feed:translated_transcripts",
            "allowed_actuator:query_visual_summaries",
            "allowed_actuator:query_translation_segments",
          ],
          outputPreview: "5 query actuators policy-bound",
          skipped: [
            "assistant_answer=false",
            "terminal_eligible=false",
            "raw_content_included=false",
          ],
          blockedUntil: "completed solver path selects terminal answer",
        },
      }),
      badge({
        id: "voice_output.current",
        title: "Current Voice Output",
        plainMeaning: "Voice output can speak only from a model-reviewed answer snapshot.",
        whyItMatters: "Voice certainty must be no stronger than the reviewed answer boundary.",
        kind: "voice_output",
        status: "observed",
        subjects: ["thread:stage-play-ui"],
        tags: ["voice_output", "model_reviewed"],
        liveBindings: [],
        intentModule: undefined,
        admission: null,
        confidence: 0.86,
        evidenceRefs: ["answer_snapshot.latest", "ask_turn_solver_trace:ui"],
        reasonCodes: ["voice_cites_answer_snapshot"],
        output: {
          lineKey: "voice_callout",
          text: "Hold position until the next observation confirms the scene.",
          state: "model_reviewed",
          voiceEligible: true,
        },
        dataTray: {
          title: "Voice output",
          summary: "reviewed answer eligible for voice",
          updatedAt: "2026-06-02T00:00:05.000Z",
          freshness: "fresh",
          confidence: 0.86,
          evidenceRefs: ["answer_snapshot.latest"],
        },
      }),
      badge({
        id: "actor.player",
        title: "Player",
        plainMeaning: "The current player actor is present in the source window.",
        whyItMatters: "Player state anchors possible actions.",
        kind: "actor",
        status: "observed",
        liveBindings: [{
          bindingKind: "actor_pose",
          sourceRefIds: ["environment_snapshot:ui"],
          freshness: "fresh",
          confidence: 1,
          compactValue: "x=4 y=64 z=8",
        }],
        intentModule: undefined,
      }),
      badge({ id: "intent.move_away", title: "Move away", intentModule: { verb: "move_away", actorId: "actor.player" } }),
      badge({
        id: "intent.maintain_line_of_sight",
        title: "Maintain line of sight",
        intentModule: { verb: "maintain_line_of_sight", actorId: "actor.player", preserves: ["threat_visibility"] },
      }),
      badge({
        id: "intent.place_block",
        title: "Place block",
        intentModule: { verb: "place_block", actorId: "actor.player", requires: ["resource.cobblestone.available"] },
      }),
      badge({
        id: "procedure.defensive_retreat_barrier",
        title: "Defensive Retreat Barrier",
        plainMeaning: "Player creates distance while preserving threat visibility and placing blocks as a barrier.",
        whyItMatters: "This is a candidate action composition, not execution permission.",
        kind: "procedural_binding",
        status: "candidate",
        intentModule: {
          verb: "retreat",
          actorId: "actor.player",
          requires: ["intent.move_away", "intent.maintain_line_of_sight", "intent.place_block"],
          preserves: ["threat_visibility", "floor_integrity"],
        },
        reasonCodes: ["live_world_hazard_nearby", "low_health_constraint", "placeable_blocks_available"],
      }),
    ],
    edges: [
      {
        id: "edge:checkpoint-request:ask-checkpoint",
        from: "checkpoint_request.ui",
        to: "helix_ask.checkpoint.latest",
        relation: "needs_check",
        label: "awaits Ask checkpoint",
        evidenceRefs: ["stage_play_checkpoint_request:ui"],
        reasonCodes: ["checkpoint_request_awaits_ask"],
      },
      {
        id: "edge:goal-context-bus:context-feed-index",
        from: "workstation_state_plane.goal_context_bus",
        to: "workstation_state_plane.context_feed_index",
        relation: "contains",
        label: "goal context bus contains queryable feed index",
        evidenceRefs: ["context_feed:visual_summaries", "context_feed:translated_transcripts"],
        reasonCodes: ["goal_context_bus_contains_context_feed_index", "queryable_goal_context"],
      },
      {
        id: "edge:context-feed-index:terminal-authority",
        from: "workstation_state_plane.context_feed_index",
        to: "workstation_state_plane.terminal_authority",
        relation: "needs_check",
        label: "context feed observations require terminal authority before final answer",
        evidenceRefs: ["stage_play_context_feed_query:visual_summaries:ui"],
        reasonCodes: ["context_feed_index_requires_terminal_authority", "observations_not_answers"],
      },
      {
        id: "edge:move-away:defensive-retreat-barrier",
        from: "intent.move_away",
        to: "procedure.defensive_retreat_barrier",
        relation: "composes_with",
        label: "move away contributes to retreat barrier",
        evidenceRefs: ["environment_snapshot:ui"],
        reasonCodes: ["live_world_hazard_nearby"],
      },
      {
        id: "edge:line-of-sight:defensive-retreat-barrier",
        from: "intent.maintain_line_of_sight",
        to: "procedure.defensive_retreat_barrier",
        relation: "preserves",
        label: "preserves threat visibility",
        evidenceRefs: ["environment_snapshot:ui"],
        reasonCodes: ["live_world_hazard_nearby"],
      },
      {
        id: "edge:place-block:defensive-retreat-barrier",
        from: "intent.place_block",
        to: "procedure.defensive_retreat_barrier",
        relation: "requires",
        label: "requires placeable blocks",
        evidenceRefs: ["environment_snapshot:ui"],
        reasonCodes: ["placeable_blocks_available"],
      },
    ],
    recommendedActions: [
      {
        id: "stage-action:defensive-retreat-barrier",
        label: "Candidate: retreat while tracking threat and place blocks as barrier",
        actionType: "navigation_hint",
        admission: "ask_user",
        agentExecutable: false,
        reasonCodes: ["live_world_hazard_nearby", "low_health_constraint", "requires_user_world_action"],
        evidenceRefs: ["environment_snapshot:ui"],
        missingEvidence: [],
      },
    ],
    checkpointRequests: [
      {
        artifactId: "stage_play_checkpoint_request",
        schemaVersion: "stage_play_checkpoint_request/v1",
        checkpointRequestId: "stage_play_checkpoint_request:ui",
        jobId: "stage_play_job:ui",
        graphId: "stage_play_badge_graph:ui-fixture",
        objective: "Track the visual source and produce visible checkpoints.",
        userPromptRef: null,
        reason: "meaningful_perturbation",
        question: "A meaningful Stage Play perturbation occurred; what current answer snapshot should Helix Ask produce?",
        currentGraphRefs: ["stage_play_badge_graph:ui-fixture"],
        compactObservationRefs: ["stage_play_compact_observation:ui"],
        perturbationRefs: ["stage_play_perturbation_event:ui"],
        priorAnswerSnapshotRefs: ["answer_snapshot.latest"],
        missingEvidence: ["Audio transcript is missing."],
        checkpointPolicy: {
          autoRunEligible: true,
          requiresUserApproval: true,
          minMsSinceLastCheckpoint: 15_000,
        },
        status: "queued",
        assistant_answer: false,
        context_role: "tool_evidence",
      },
    ],
  });
}

function buildSourceHandles(options: {
  descriptors?: Array<Record<string, unknown>>;
  producers?: Array<Record<string, unknown>>;
}): TestSourceHandle[] {
  const producers: Array<Record<string, unknown>> = options.producers ?? [];
  const producerBySource = new Map<string, Record<string, unknown>>(
    producers.map((producer: Record<string, unknown>) => [String(producer.source_id), producer]),
  );
  const handles = new Map<string, TestSourceHandle>();
  for (const descriptor of options.descriptors ?? []) {
    const sourceId = String(descriptor.source_id);
    const serving = descriptor.serving_context as Record<string, unknown> | undefined;
    const producer = producerBySource.get(sourceId);
    handles.set(sourceId, {
      sourceId,
      sourceClass: String(descriptor.modality),
      status: String(descriptor.current_state),
      label: descriptor.user_label ?? null,
      descriptorId: descriptor.descriptor_id ?? null,
      producerId: producer?.producer_id ?? null,
      surface: serving?.surface ?? null,
      origin: serving?.source_origin ?? null,
      cadenceMs: descriptor.cadence_ms ?? producer?.cadence_ms ?? null,
      latestEvidenceRefs: [
        descriptor.descriptor_id,
        producer?.producer_id,
        ...(Array.isArray(descriptor.latest_observation_refs) ? descriptor.latest_observation_refs : []),
        producer?.latest_chunk_id,
      ].filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
    });
  }
  for (const producer of producers) {
    const sourceId = String(producer.source_id);
    if (handles.has(sourceId)) continue;
    handles.set(sourceId, {
      sourceId,
      sourceClass: String(producer.modality),
      status: String(producer.status),
      label: null,
      descriptorId: null,
      producerId: producer.producer_id ?? null,
      surface: null,
      origin: null,
      cadenceMs: producer.cadence_ms ?? null,
      latestEvidenceRefs: [producer.producer_id, producer.latest_chunk_id]
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
    });
  }
  return Array.from(handles.values());
}

function sourceIdFromDraftNode(node: Record<string, unknown>): string {
  const bind = node.bind as Record<string, unknown> | null;
  return String(bind?.sourceId ?? "");
}

function fetchCallUrls(): string[] {
  const calls = vi.mocked(fetch).mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
  return calls.map((call: [RequestInfo | URL, RequestInit?]) => String(call[0]));
}

function fetchJsonBodies(pathPart: string): Array<Record<string, unknown>> {
  const calls = vi.mocked(fetch).mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
  return calls
    .filter((call) => String(call[0]).includes(pathPart))
    .map((call) => {
      const body = call[1]?.body;
      return typeof body === "string" ? JSON.parse(body) as Record<string, unknown> : {};
    });
}

function renderPanel(options: {
  descriptors?: Array<Record<string, unknown>>;
  producers?: Array<Record<string, unknown>>;
  graph?: StagePlayBadgeGraphV1;
  mailboxResponse?: Record<string, unknown>;
  transcriptResponse?: Record<string, unknown>;
} = {}) {
  const graph = options.graph ?? buildFixture();
  const sourceHandles = buildSourceHandles(options);
  const fetchMock = vi.fn(async (requestInput: RequestInfo | URL, init?: RequestInit) => {
    const url = String(requestInput);
    if (url.includes("/api/helix/stage-play/builder")) {
      return new Response(JSON.stringify({
        artifactId: "stage_play_builder_context",
        schemaVersion: "stage_play_builder_context/v1",
        generatedAt: "2026-06-02T00:00:00.000Z",
        catalog: {
          artifactId: "stage_play_builder_catalog",
          schemaVersion: "stage_play_builder_catalog/v1",
          generatedAt: "2026-06-02T00:00:00.000Z",
          nodeKinds: ["source", "interpreter", "intent_module", "procedural_binding"],
          edgeRelations: ["feeds", "interprets", "composes_with", "constrains"],
          sourceClasses: ["visual_frame", "audio_transcript", "minecraft_world_events"],
          portKinds: ["source_handle", "incoming_compact_window", "checkpoint_receipt"],
          requiredFlow: ["source feeds interpreter", "all outputs remain evidence-only"],
          authority: {
            assistant_answer: false,
            raw_content_included: false,
            raw_payload_included: false,
            terminal_eligible: false,
            agent_executable: false,
            context_role: "tool_evidence",
            ask_context_policy: "evidence_only",
            instruction_authority: "none",
            ask_instruction_authority: "none",
          },
        },
        sourceQuery: {
          artifactId: "stage_play_source_query",
          schemaVersion: "stage_play_source_query/v1",
          generatedAt: "2026-06-02T00:00:00.000Z",
          threadId: "helix-ask:desktop",
          environmentId: null,
          sourceHandles,
          authority: {
            assistant_answer: false,
            raw_content_included: false,
            raw_payload_included: false,
            terminal_eligible: false,
            agent_executable: false,
            context_role: "tool_evidence",
            ask_context_policy: "evidence_only",
            instruction_authority: "none",
            ask_instruction_authority: "none",
          },
        },
        authority: {
          assistant_answer: false,
          raw_content_included: false,
          raw_payload_included: false,
          terminal_eligible: false,
          agent_executable: false,
          context_role: "tool_evidence",
          ask_context_policy: "evidence_only",
          instruction_authority: "none",
          ask_instruction_authority: "none",
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/helix/stage-play/draft/validate")) {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      const draft = body.draft as Record<string, unknown> | undefined;
      const nodes = Array.isArray(draft?.nodes) ? draft.nodes as Array<Record<string, unknown>> : [];
      const sourceHandleById = new Map(sourceHandles.map((handle: TestSourceHandle) => [handle.sourceId, handle]));
      const resolvedSourceIds = nodes
        .map(sourceIdFromDraftNode)
        .filter((sourceId: string) => sourceHandleById.has(sourceId));
      const issues = nodes
        .map(sourceIdFromDraftNode)
        .filter((sourceId: string) => sourceId.length > 0 && !sourceHandleById.has(sourceId))
        .map((sourceId: string) => `source handle unavailable: ${sourceId}`);
      const validation = {
        artifactId: "stage_play_graph_draft_validation",
        schemaVersion: "stage_play_graph_draft_validation/v1",
        generatedAt: "2026-06-02T00:00:01.000Z",
        ok: issues.length === 0,
        draftId: String(draft?.draftId ?? "stage_play_panel_draft"),
        issues,
        warnings: nodes.some((node: Record<string, unknown>) => node.kind === "interpreter") ? [] : ["draft has no interpreter node"],
        resolvedSourceIds,
        evidenceRefs: sourceHandles
          .filter((handle: TestSourceHandle) => resolvedSourceIds.includes(handle.sourceId))
          .flatMap((handle: TestSourceHandle) => handle.latestEvidenceRefs),
        missingEvidence: [],
        authority: {
          assistant_answer: false,
          raw_content_included: false,
          raw_payload_included: false,
          terminal_eligible: false,
          agent_executable: false,
          context_role: "tool_evidence",
          ask_context_policy: "evidence_only",
          instruction_authority: "none",
          ask_instruction_authority: "none",
        },
      };
      return new Response(JSON.stringify({
        ...validation,
      }), {
        status: validation.ok ? 200 : 422,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/helix/stage-play/source-route")) {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      return new Response(JSON.stringify({
        ok: true,
        schema: "stage_play_source_route_override_response/v1",
        override: {
          schemaVersion: "stage_play_source_route_override/v1",
          overrideId: "stage_play_source_route_override:ui",
          threadId: body.threadId ?? null,
          roomId: body.roomId ?? null,
          environmentId: body.environmentId ?? null,
          sourceId: body.sourceId,
          modality: body.modality,
          routeTo: body.routeTo,
          selectedForStagePlay: body.selectedForStagePlay,
          updatedAt: "2026-06-02T00:00:01.000Z",
          evidenceRefs: body.evidenceRefs ?? [],
          assistant_answer: false,
          context_role: "ui_request_not_instruction",
        },
        assistant_answer: false,
        raw_content_included: false,
        context_role: "tool_evidence",
        terminal_eligible: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/helix/stage-play/live-source-mail/wake/cycle")) {
      return new Response(JSON.stringify({
        ok: true,
        schema: "stage_play_live_source_mail_wake_cycle_response/v1",
        cycle: {
          schema: "stage_play_live_source_mail_wake_admission_cycle/v1",
          now: "2026-06-02T00:00:03.000Z",
          queuedWakeIds: ["stage_play_live_source_mail_wake:queued-ui"],
          runnableWakeIds: ["stage_play_live_source_mail_wake:queued-ui"],
          runningWakeIds: [],
          deferredWakeIds: ["stage_play_live_source_mail_wake:pressure-ui"],
          result: null,
          status: "queued",
          reason: "no_runnable_wake",
          runtimeAdmission: null,
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        },
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "tool_evidence",
        raw_content_included: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/helix/stage-play/live-source-mail/transcript")) {
      if (options.transcriptResponse) {
        return new Response(JSON.stringify(options.transcriptResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        schema: "stage_play_live_source_mail_transcript_response/v1",
        requestedThreadId: "helix-ask:desktop",
        mailboxThreadId: "helix-ask:desktop",
        threadId: "helix-ask:desktop",
        entries: [],
        transcriptRows: [],
        transcriptEntryIds: [],
        evidenceRefs: [],
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "tool_evidence",
        raw_content_included: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/helix/stage-play/live-source-mail")) {
      if (options.mailboxResponse) {
        return new Response(JSON.stringify(options.mailboxResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        schema: "stage_play_live_source_mail_list_response/v1",
        requestedThreadId: "helix-ask:desktop",
        mailboxThreadId: "helix-ask:desktop",
        mailboxThreadResolution: {
          schema: "stage_play_live_source_mailbox_thread_resolution/v1",
          askThreadId: "helix-ask:desktop",
          requestedThreadId: "helix-ask:desktop",
          mailboxThreadId: "helix-ask:desktop",
          reason: "explicit_mailbox_thread",
          candidateThreadIds: ["helix-ask:desktop"],
          aliasRecorded: false,
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        },
        wakeAdmissionCycle: {
          schema: "stage_play_live_source_mail_wake_admission_cycle/v1",
          now: "2026-06-02T00:00:05.000Z",
          queuedWakeIds: [],
          runnableWakeIds: [],
          runningWakeIds: [],
          deferredWakeIds: [
            "stage_play_live_source_mail_wake:pressure-ui",
            "stage_play_live_source_mail_wake:auto-pressure-after-timeout-ui",
          ],
          result: null,
          status: "deferred_for_pressure",
          reason: "runtime_pressure",
          continuation: {
            scheduled: false,
            reason: "wake_runner_disabled",
            runnableWakeIds: [],
          },
          runtimeAdmission: {
            admitted: false,
            action: "defer",
            reason: "runtime_memory_queue_deferrable",
            pressureLevel: "soft_pressure",
            memory: {
              heapUsedMiB: 720,
              rssMiB: 1430,
            },
            limits: {
              maxHeapUsedMiB: 800,
              maxRssMiB: 1600,
            },
          },
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        },
        mailItems: [
          {
            artifactId: "stage_play_live_source_mail_item",
            schemaVersion: "stage_play_live_source_mail_item/v1",
            mailId: "stage_play_live_source_mail:ui",
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            sourceId: "source:visual-tab",
            sourceKind: "visual_frame",
            sourceRefs: {
              sourceId: "source:visual-tab",
              frameRef: "visual_frame:ui",
              evidenceRef: "visual_evidence:ui",
              observationRef: "live_source_observation:ui",
            },
            summary: {
              text: "Minecraft-like scene with character, book/crafting station, enchantment table, cat, moonlit mountains.",
              preview: "Minecraft-like scene with character, book/crafting station, enchantment table, cat.",
              confidence: 0.76,
              analysisState: "analysis_ready",
            },
            priorContext: {
              previousMailId: null,
              previousEvidenceRef: null,
              previousSummaryPreview: null,
            },
            objective: {
              objectiveId: null,
              text: "Watch the active visual source.",
            },
            hints: {
              deterministicChangeHint: "first_summary",
              elapsedMsSincePrevious: null,
              sourceFreshness: "fresh",
            },
            status: "unread",
            evidenceRefs: ["visual_frame:ui", "visual_evidence:ui"],
            createdAt: "2026-06-02T00:00:01.000Z",
            updatedAt: "2026-06-02T00:00:01.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
        ],
        jobStates: [
          {
            artifactId: "stage_play_live_source_job_state",
            schemaVersion: "stage_play_live_source_job_state/v1",
            jobId: "stage_play_live_source_job:ui",
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            sourceIds: ["source:visual-tab"],
            objective: "Watch the active visual source.",
            status: "armed",
            watchJobPolicyRef: "stage_play_live_source_watch_job_policy:ui",
            mailboxCursor: "stage_play_live_source_mail:ui",
            lastMailId: "stage_play_live_source_mail:ui",
            lastDecisionId: "stage_play_live_source_mail_decision:ui",
            nextLoopState: "armed_for_next_summary",
            nextWakePolicy: {
              sourceKind: "visual_frame",
              afterMs: null,
              maxConsecutiveReads: 3,
            },
            updatedAt: "2026-06-02T00:00:02.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
          {
            artifactId: "stage_play_live_source_job_state",
            schemaVersion: "stage_play_live_source_job_state/v1",
            jobId: "stage_play_live_source_job:stale-other-source",
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            sourceIds: ["source:other-tab"],
            objective: "Watch an older unrelated source.",
            status: "armed",
            mailboxCursor: null,
            lastMailId: null,
            lastDecisionId: null,
            nextLoopState: "armed_for_next_summary",
            nextWakePolicy: {
              sourceKind: "visual_frame",
              afterMs: null,
              maxConsecutiveReads: 3,
            },
            updatedAt: "2026-06-02T00:00:03.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
        ],
        watchJobPolicies: [
          {
            artifactId: "stage_play_live_source_watch_job_policy",
            schemaVersion: "stage_play_live_source_watch_job_policy/v1",
            policyId: "stage_play_live_source_watch_job_policy:ui",
            jobId: "stage_play_live_source_job:ui",
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            sourceIds: ["source:visual-tab"],
            objectiveText: "Watch the active visual source.",
            decisionPolicyPrompt: "Interpret each compact visual-summary mail batch.",
            outputPolicy: {
              allowTextAnswer: true,
              allowVoiceCallout: true,
              voiceRequiresUrgency: true,
              confirmationRequired: true,
            },
            importanceCriteria: ["danger", "rare resources", "strategic decisions"],
            suppressCriteria: ["routine walking"],
            interpretationMode: "batch_interpretation",
            status: "armed",
            priorDecisionRefs: [],
            priorAnswerRefs: [],
            evidenceRefs: ["stage_play_live_source_watch_job_policy:ui"],
            createdAt: "2026-06-02T00:00:00.500Z",
            updatedAt: "2026-06-02T00:00:00.500Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
        ],
        interpreterProfiles: [
          {
            artifactId: "stage_play_live_source_interpreter_profile",
            schemaVersion: "stage_play_live_source_interpreter_profile/v1",
            profileId: "stage_play_live_source_interpreter_profile:ui",
            title: "Minecraft Survival Coach",
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            jobId: "stage_play_live_source_job:ui",
            policyId: "stage_play_live_source_watch_job_policy:ui",
            sourceKinds: ["visual_frame"],
            domain: "minecraft",
            objectiveText: "Watch the Minecraft visual source like a survival coach.",
            interpretationGuidelines: "Preserve observations and compare them to survival priorities.",
            lenses: ["survival", "hazards", "resources"],
            salienceCriteria: ["danger", "rare resources", "strategic decisions"],
            suppressCriteria: ["routine walking"],
            riskCriteria: ["low light", "hostile mob"],
            opportunityCriteria: ["rare resources", "crafting station"],
            voiceCalloutCriteria: ["danger"],
            evidenceRules: {
              preserveRawObservation: true,
              distinguishObservedVsInferred: true,
              requireEvidenceRefs: true,
              askWhenUncertain: true,
            },
            outputStyle: {
              textAnswerStyle: "brief_explanation",
              voiceStyle: "warning_only",
            },
            linkedNoteId: "note:interpreter_profile:ui",
            linkedNoteTitle: "Minecraft Survival Coach",
            status: "active",
            evidenceRefs: ["stage_play_live_source_interpreter_profile:ui", "stage_play_live_source_watch_job_policy:ui"],
            createdAt: "2026-06-02T00:00:00.800Z",
            updatedAt: "2026-06-02T00:00:00.800Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
        ],
        interpreterProfileComparisons: [
          {
            artifactId: "stage_play_live_source_interpreter_profile_comparison",
            schemaVersion: "stage_play_live_source_interpreter_profile_comparison/v1",
            comparisonId: "stage_play_live_source_interpreter_profile_comparison:ui",
            profileId: "stage_play_live_source_interpreter_profile:ui",
            jobId: "stage_play_live_source_job:ui",
            policyId: "stage_play_live_source_watch_job_policy:ui",
            mailIds: ["stage_play_live_source_mail:ui"],
            narrativeStateRef: "stage_play_live_source_narrative_state:ui",
            observedFacts: ["Minecraft-like scene remains visible."],
            inferredMeaning: ["Stable scene; continue watching for survival-relevant changes."],
            matchedCriteria: ["low light", "cave exploration"],
            suppressedCriteria: ["routine walking"],
            riskMatches: ["low light"],
            opportunityMatches: [],
            voiceCalloutMatches: [],
            contradictions: [],
            uncertainties: ["Audio context is unavailable."],
            recommendedDecision: "record_interpretation",
            recommendedNextWatch: ["danger", "rare resources", "strategic decisions"],
            evidenceRefs: ["stage_play_live_source_interpreter_profile_comparison:ui", "stage_play_live_source_mail:ui"],
            createdAt: "2026-06-02T00:00:01.900Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
        ],
        wakeRequests: [
          {
            artifactId: "stage_play_live_source_mail_wake_request",
            schemaVersion: "stage_play_live_source_mail_wake_request/v1",
            wakeRequestId: "stage_play_live_source_mail_wake:pressure-ui",
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            jobId: "stage_play_live_source_job:ui",
            mailIds: ["stage_play_live_source_mail:ui"],
            sourceIds: ["source:visual-tab"],
            reason: "unread_mail",
            status: "deferred_for_pressure",
            askTurnId: null,
            decisionIds: [],
            attemptCount: 1,
            lastAttemptAt: "2026-06-02T00:00:01.500Z",
            nextRetryAt: "2026-06-02T00:00:16.500Z",
            failureReason: "ask_turn_pressure_503",
            evidenceRefs: ["stage_play_live_source_mail:ui", "visual_evidence:ui"],
            queuedAt: "2026-06-02T00:00:01.000Z",
            updatedAt: "2026-06-02T00:00:01.500Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
          {
            artifactId: "stage_play_live_source_mail_wake_request",
            schemaVersion: "stage_play_live_source_mail_wake_request/v1",
            wakeRequestId: "stage_play_live_source_mail_wake:retry-ui",
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            jobId: "stage_play_live_source_job:ui",
            mailIds: ["stage_play_live_source_mail:ui"],
            sourceIds: ["source:visual-tab"],
            reason: "unread_mail",
            status: "failed_retryable",
            askTurnId: null,
            decisionIds: [],
            attemptCount: 2,
            lastAttemptAt: "2026-06-02T00:00:02.000Z",
            nextRetryAt: "2026-06-02T00:00:32.000Z",
            failureReason: "temporary_mail_wake_error",
            evidenceRefs: ["stage_play_live_source_mail:ui", "visual_evidence:ui"],
            queuedAt: "2026-06-02T00:00:02.000Z",
            updatedAt: "2026-06-02T00:00:02.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
          {
            artifactId: "stage_play_live_source_mail_wake_request",
            schemaVersion: "stage_play_live_source_mail_wake_request/v1",
            wakeRequestId: "stage_play_live_source_mail_wake:auto-pressure-after-timeout-ui",
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            jobId: "stage_play_live_source_job:ui",
            mailIds: ["stage_play_live_source_mail:ui"],
            sourceIds: ["source:visual-tab"],
            reason: "unread_mail",
            status: "deferred_for_pressure",
            askTurnId: null,
            decisionIds: [],
            attemptCount: 1,
            lastAttemptAt: "2026-06-02T00:00:04.000Z",
            nextRetryAt: "2026-06-02T00:00:34.000Z",
            failureReason: "runtime_memory_queue_deferrable",
            evidenceRefs: ["stage_play_live_source_mail:ui", "visual_evidence:ui"],
            queuedAt: "2026-06-02T00:00:04.000Z",
            updatedAt: "2026-06-02T00:00:04.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
        ],
        wakeResults: [
          {
            artifactId: "stage_play_live_source_mail_wake_result",
            schemaVersion: "stage_play_live_source_mail_wake_result/v1",
            wakeResultId: "stage_play_live_source_mail_wake_result:pressure-ui",
            wakeRequestId: "stage_play_live_source_mail_wake:pressure-ui",
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            status: "deferred_for_pressure",
            askTurnId: null,
            decisionIds: [],
            skippedReason: null,
            failedReason: "ask_turn_pressure_503",
            evidenceRefs: ["stage_play_live_source_mail:ui", "visual_evidence:ui"],
            createdAt: "2026-06-02T00:00:01.500Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
          {
            artifactId: "stage_play_live_source_mail_wake_result",
            schemaVersion: "stage_play_live_source_mail_wake_result/v1",
            wakeResultId: "stage_play_live_source_mail_wake_result:retry-ui",
            wakeRequestId: "stage_play_live_source_mail_wake:retry-ui",
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            status: "failed_retryable",
            askTurnId: null,
            decisionIds: [],
            skippedReason: null,
            failedReason: "mail_wake_ask_turn_timeout:120000",
            evidenceRefs: ["stage_play_live_source_mail:ui", "visual_evidence:ui"],
            createdAt: "2026-06-02T00:00:03.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
          {
            artifactId: "stage_play_live_source_mail_wake_result",
            schemaVersion: "stage_play_live_source_mail_wake_result/v1",
            wakeResultId: "stage_play_live_source_mail_wake_result:auto-pressure-after-timeout-ui",
            wakeRequestId: "stage_play_live_source_mail_wake:auto-pressure-after-timeout-ui",
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            status: "deferred_for_pressure",
            askTurnId: null,
            decisionIds: [],
            skippedReason: null,
            failedReason: "runtime_memory_queue_deferrable",
            evidenceRefs: ["stage_play_live_source_mail:ui", "visual_evidence:ui"],
            createdAt: "2026-06-02T00:00:05.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
        ],
        decisions: [
          {
            artifactId: "stage_play_live_source_mail_decision",
            schemaVersion: "stage_play_live_source_mail_decision/v1",
            decisionId: "stage_play_live_source_mail_decision:ui",
            mailIds: ["stage_play_live_source_mail:ui"],
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            decision: "record_interpretation",
            rationalePreview: "The unread mail batch was interpreted for the user.",
            textAnswerDraft: null,
            voiceCalloutDraft: null,
            voicePolicy: {
              voiceEnabled: false,
              requiresConfirmation: false,
              allowedNow: false,
              reason: "voice disabled in test",
            },
            requestedTool: null,
            nextLoopState: "armed_for_next_summary",
            nextExpectedSourceKind: "visual_frame",
            nextExpectedAfterMs: null,
            mailboxCursor: "stage_play_live_source_mail:ui",
            activeJobId: "stage_play_live_source_job:ui",
            narrativeStateRef: "stage_play_live_source_narrative_state:ui",
            interpreterProfileRef: "stage_play_live_source_interpreter_profile:ui",
            profileComparisonRefs: ["stage_play_live_source_interpreter_profile_comparison:ui"],
            matchedCriteria: ["low light", "cave exploration"],
            suppressedCriteria: ["routine walking"],
            observedFacts: ["Minecraft-like scene remains visible."],
            inferredMeaning: ["Stable scene; continue watching for survival-relevant changes."],
            rearmReason: "decision recorded",
            evidenceRefs: ["visual_evidence:ui", "stage_play_live_source_narrative_state:ui"],
            modelReviewed: true,
            createdAt: "2026-06-02T00:00:02.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
        ],
        narrativeStates: [
          {
            artifactId: "stage_play_live_source_narrative_state",
            schemaVersion: "stage_play_live_source_narrative_state/v1",
            narrativeStateId: "stage_play_live_source_narrative_state:ui",
            jobId: "stage_play_live_source_job:ui",
            policyId: null,
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            sourceIds: ["source:visual-tab"],
            priorNarrativeStateRef: null,
            mailBatchRefs: ["stage_play_live_source_mail:ui"],
            sourceEvidenceRefs: ["visual_evidence:ui"],
            currentSceneSummary: "A Minecraft-like scene remains visible.",
            runningStorySummary: "The live source is showing a stable Minecraft-like scene.",
            interpretedSituation: {
              setting: "Minecraft-like scene",
              activeWindowOrScene: "game view",
              entities: ["player"],
              objects: ["visible terrain"],
              activities: ["watching the scene"],
              userRelevantMeaning: "The visual source still appears to show a stable Minecraft-like scene.",
            },
            meaningfulChanges: ["No major user-facing change in this fixture."],
            uncertainties: ["Audio context is unavailable."],
            watchNext: {
              targets: ["scene change", "new threat"],
              reason: "Watch for a new actor, opened UI, or scene transition.",
            },
            prediction: null,
            staleness: {
              state: "current",
              staleAfterMailId: null,
              supersededByStateId: null,
            },
            lastDecisionRef: "stage_play_live_source_mail_decision:ui",
            evidenceRefs: ["stage_play_live_source_mail_decision:ui", "visual_evidence:ui"],
            createdAt: "2026-06-02T00:00:02.100Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
        ],
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "tool_evidence",
        raw_content_included: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/helix/stage-play/raw-session-buffer/clear")) {
      return new Response(JSON.stringify({
        ok: true,
        schema: "stage_play_raw_session_buffer_clear/v1",
        clearedCount: 1,
        clearedEntryIds: ["stage_play_raw_session_buffer_entry:ui"],
        assistant_answer: false,
        context_role: "audit_buffer_not_graph",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/helix/stage-play/raw-session-buffer")) {
      return new Response(JSON.stringify({
        ok: true,
        schema: "stage_play_raw_session_buffer_list/v1",
        sessionId: "stage_play_session:thread:stage-play-ui:room:minecraft",
        threadId: "thread:stage-play-ui",
        roomId: "room:minecraft",
        sourceId: "source:visual-tab",
        entries: [
          {
            schema: "stage_play_raw_session_buffer_entry/v1",
            entryId: "stage_play_raw_session_buffer_entry:ui",
            sessionId: "stage_play_session:thread:stage-play-ui:room:minecraft",
            threadId: "thread:stage-play-ui",
            roomId: "room:minecraft",
            sourceId: "source:visual-tab",
            modality: "visual_frame",
            sourceEventId: "visual_frame:ui",
            fromTs: "2026-06-02T00:00:01.000Z",
            toTs: "2026-06-02T00:00:01.000Z",
            rawKind: "frame_ref",
            rawRef: "visual_frame:ui",
            rawTextPreview: "Compact preview of the captured frame.",
            retention: {
              policy: "session_ttl",
              ttlMs: 3600000,
              expiresAt: "2026-06-02T01:00:01.000Z",
            },
            evidenceRefs: ["visual_frame:ui"],
            assistant_answer: false,
            context_role: "audit_buffer_not_graph",
          },
        ],
        assistant_answer: false,
        context_role: "audit_buffer_not_graph",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/helix/stage-play/project-live-answer")) {
      return new Response(JSON.stringify({
        ok: true,
        schema: "stage_play_live_answer_projection_response/v1",
        graph,
        outputLaneProjection: {
          artifactId: "stage_play_output_lane_projection",
          schemaVersion: "stage_play_output_lane_projection/v1",
          graphId: graph.graphId,
          generatedAt: graph.generatedAt,
          lanes: [],
          evidenceRefs: ["live_source_observation:ui"],
          context_role: "tool_evidence",
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
          post_tool_model_step_required: true,
        },
        liveAnswerDelta: {
          changed_line_keys: ["situation", "risk"],
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
          model_invoked: false,
        },
        liveAnswerEnvironment: null,
        projectedLineKeys: ["risk", "possibilities", "unknowns", "next_check"],
        skippedLineKeys: [],
        checkpointOnlySkipped: ["recommendation", "answer_snapshot", "voice_output"],
        reason: "projected",
        assistant_answer: false,
        raw_content_included: false,
        context_role: "tool_evidence",
        terminal_eligible: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/helix/stage-play/checkpoint-queue/action")) {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      const requestedCheckpointRequest = graph.checkpointRequests.find((request) =>
        request.checkpointRequestId === body.checkpointRequestId
      ) ?? graph.checkpointRequests[0] ?? {};
      return new Response(JSON.stringify({
        ok: true,
        schema: "stage_play_checkpoint_queue_action_response/v1",
        action: body.action ?? "run",
        request: {
          ...requestedCheckpointRequest,
          status: body.action === "run" ? "running" : "skipped",
        },
        queue: {
          schema: "stage_play_checkpoint_queue/v1",
          jobId: body.jobId ?? "stage_play_job:ui",
          requests: graph.checkpointRequests,
          jobState: null,
          assistant_answer: false,
          context_role: "tool_evidence",
        },
        reason: "updated",
        assistant_answer: false,
        context_role: "tool_evidence",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/agi/situation/live-answer-environment")) {
      return new Response(JSON.stringify({
        ok: true,
        schema: "helix.live_answer_environment_read.v1",
        environment: null,
        deltas: [],
        assistant_answer: false,
        raw_content_included: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/agi/situation/visual-source/start")) {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      const sourceId = typeof body.source_id === "string" ? body.source_id : "source:visual-tab";
      return new Response(JSON.stringify({
        ok: true,
        schema: "helix.visual_snapshot_source_start_response.v1",
        source: {
          source_id: sourceId,
          thread_id: body.thread_id ?? "helix-ask:desktop",
          room_id: body.room_id ?? null,
          status: "permission_required",
        },
        receipt: {
          source: {
            source_id: sourceId,
            thread_id: body.thread_id ?? "helix-ask:desktop",
            room_id: body.room_id ?? null,
            status: "permission_required",
          },
        },
        assistant_answer: false,
        raw_content_included: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/agi/situation/audio-source/permission-granted")) {
      return new Response(JSON.stringify({
        ok: true,
        schema: "helix.audio_source_permission_response.v1",
        assistant_answer: false,
        raw_content_included: false,
        raw_transcript_included: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(graph), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <StagePlayBadgeGraphPanel />
    </QueryClientProvider>,
  );
}

async function showFullGraph() {
  fireEvent.click(await screen.findByTestId("stage-play-full-graph-toggle"));
  await screen.findByTestId("stage-play-lane-observer");
}

function dispatchPointer(target: EventTarget, type: string, clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  fireEvent(target, event);
}

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  useStagePlayBadgeGraphPanelStore.getState().resetPanelMemory();
  useLiveAnswerEnvironmentStore.setState({
    environmentByThread: {},
    environmentById: {},
    deltasByEnvironment: {},
    latestReadByThread: {},
    diagnosticsByThread: {},
  });
  vi.unstubAllGlobals();
  cleanup();
});

describe("StagePlayBadgeGraphPanel", () => {
  it("defaults to the observer-first mail loop graph", async () => {
    renderPanel();

    const scrollport = await screen.findByTestId("stage-play-badge-graph-scrollport");
    expect(scrollport.getAttribute("data-stage-play-graph-mode")).toBe("observer_mail_loop_v1");
    expect(screen.getByTestId("stage-play-observer-mail-loop-toggle")).toBeTruthy();
    expect(screen.getByTestId("stage-play-full-graph-toggle")).toBeTruthy();
    expect(screen.queryByText("observer_mail_loop_v1")).toBeNull();
    expect(screen.queryByText(/Observer -> Visual Summary Mail -> Interpreter Profile -> Profile Comparison -> Wake Ask -> Decision -> Output \/ Wait/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Run armed mail wake" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy observer mail loop refs" })).toBeNull();
    const mailLoopNodes = screen.getAllByTestId("stage-play-observer-mail-loop-node");
    expect(mailLoopNodes.length).toBeGreaterThanOrEqual(8);
    expect(screen.getAllByText("Visual Source").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mailbox").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Interpreter Profile").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Comparator|profile lens over mail/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ask Handoff").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Decision").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Steering").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Output / Wait").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("stage-play-tool-activity-strip")).toBeNull();
    expect(screen.queryByTestId("stage-play-mail-loop-header")).toBeNull();
    expect(screen.queryByTestId("stage-play-mail-loop-activity")).toBeNull();
    expect(screen.getAllByTestId("stage-play-mail-loop-node-payload").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("stage-play-mail-loop-edge")).toHaveLength(mailLoopNodes.length - 1);
    expect(screen.getByText("Objective")).toBeTruthy();
    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getByText("Latest")).toBeTruthy();
    expect(screen.getByText("Contract")).toBeTruthy();
    expect(screen.getByText("Observed")).toBeTruthy();
    expect(screen.getByText("Tool")).toBeTruthy();
    expect(screen.getByText("Reason")).toBeTruthy();
    expect(screen.getAllByText("Output").length).toBeGreaterThan(0);
    expect(screen.getByText(/Watch the active visual source/i)).toBeTruthy();
    expect(screen.getByText(/source:visual-tab \| active \| fresh/i)).toBeTruthy();
    expect(screen.getAllByText(/1 visual backlog/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/packet-backed interrupt admission/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Packet interrupt handoff").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Deferred before Ask interrupt").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 raw visual backlog retained/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Next retry:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pressure: soft pressure/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Auto continuation: waiting for pressure release/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("14 badges")).toBeNull();
    expect(screen.queryByText("0 missing checks")).toBeNull();
    expect(screen.getByText(/latest Minecraft-like scene/i)).toBeTruthy();
    expect(screen.getAllByText("Packet interrupt handoff").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pressure deferred before Ask/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/runtime_memory_queue_deferrable/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("record_interpretation").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Minecraft Survival Coach/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Policy resolution/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/direct_job_ref/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Watch policy: batch_interpretation/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("No watch policy.")).toBeNull();
    expect(screen.getAllByText(/Matched: low light, cave exploration/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Recommended: record_interpretation/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/interpretation: The visual source still appears to show a stable Minecraft-like scene/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/watch next: Watch for a new actor, opened UI, or scene transition/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/steering audit|visible timeline|no steering/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Open Interpreter Profile inspector" }));
    expect(screen.getByTestId("stage-play-interpreter-profile-inspector")).toBeTruthy();
    expect(screen.getByText(/Preserve observations and compare them to survival priorities/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open linked note" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compile from note" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause / archive" })).toBeTruthy();
    expect(screen.getAllByTestId("stage-play-mail-loop-node-tray")).toHaveLength(mailLoopNodes.length);
  });

  it("shows selected deck labels, minimal arbiter role, and wake coalescing in packet traffic", async () => {
    renderPanel({
      mailboxResponse: {
        ok: true,
        schema: "stage_play_live_source_mail_list_response/v1",
        requestedThreadId: "helix-ask:desktop",
        mailboxThreadId: "helix-ask:desktop",
        wakeAdmissionCycle: {
          schema: "stage_play_live_source_mail_wake_admission_cycle/v1",
          now: "2026-06-02T00:00:05.000Z",
          queuedWakeIds: ["stage_play_live_source_mail_wake:minimal-ui"],
          runnableWakeIds: ["stage_play_live_source_mail_wake:minimal-ui"],
          runningWakeIds: [],
          deferredWakeIds: [],
          result: null,
          status: "queued",
          reason: "queued",
          continuation: null,
          runtimeAdmission: null,
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        },
        mailLoopWorkBudget: {
          schema: "stage_play_mail_loop_work_budget/v1",
          selectedDeck: {
            presetId: "stage_play_micro_reasoner_prompt_preset:minecraft_minimal_operator:v1",
            title: "Minecraft Minimal Operator",
            domain: "minecraft_gameplay",
            outputPolicy: "voice_candidate",
            promptedRoles: ["hypothesis_arbiter"],
            roleCount: 1,
          },
          limits: {},
          usage: { rolesPerPacket: 1, estimatedDeckCallsPerMinute: 6 },
          pressure: { level: "normal", ratio: 0.1 },
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        },
        mailItems: [{
          artifactId: "stage_play_live_source_mail_item",
          schemaVersion: "stage_play_live_source_mail_item/v1",
          mailId: "stage_play_live_source_mail:minimal-ui",
          threadId: "helix-ask:desktop",
          roomId: "room:minecraft",
          environmentId: "live_env:minecraft",
          sourceId: "source:visual-tab",
          sourceKind: "visual_frame",
          sourceRefs: {
            sourceId: "source:visual-tab",
            frameRef: "visual_frame:minimal-ui",
            evidenceRef: "visual_evidence:minimal-ui",
            observationRef: "live_source_observation:minimal-ui",
          },
          summary: {
            text: "Minecraft cave scene with fire and sword visible.",
            preview: "Minecraft cave scene with fire and sword visible.",
            confidence: 0.83,
            analysisState: "analysis_ready",
          },
          priorContext: {
            previousMailId: null,
            previousEvidenceRef: null,
            previousSummaryPreview: null,
          },
          objective: { objectiveId: null, text: "Watch the active visual source." },
          hints: {
            deterministicChangeHint: "danger_cue",
            elapsedMsSincePrevious: 10_000,
            sourceFreshness: "fresh",
          },
          status: "processed",
          evidenceRefs: ["visual_frame:minimal-ui", "visual_evidence:minimal-ui"],
          createdAt: "2026-06-02T00:00:01.000Z",
          updatedAt: "2026-06-02T00:00:01.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        }],
        processedMailPackets: [{
          artifactId: "stage_play_processed_mail_packet",
          schemaVersion: "stage_play_processed_mail_packet/v1",
          packetId: "stage_play_processed_mail_packet:minimal-ui",
          sourceId: "source:visual-tab",
          mailIds: ["stage_play_live_source_mail:minimal-ui"],
          observedFacts: ["fire is visible", "sword is visible"],
          inferredFacts: ["danger cue is present"],
          uncertainties: [],
          stableFactsUsed: [],
          changedFacts: ["danger cue increased"],
          sceneTags: ["cave"],
          activityTags: ["combat_or_recovery"],
          objectTags: ["fire", "sword"],
          matchedCriteria: ["danger"],
          suppressedCriteria: [],
          riskMatches: ["fire"],
          opportunityMatches: [],
          voiceCalloutMatches: ["fire", "sword"],
          predictionValidation: {
            result: "partial_shift",
            summary: "Danger cues changed.",
            newSignals: ["fire visible", "sword visible"],
            contradictedSignals: [],
            evidenceRefs: ["stage_play_live_source_mail:minimal-ui"],
          },
          salience: {
            level: "urgent",
            score: 0.92,
            reasons: ["fire visible", "sword visible"],
            reasonCodes: ["minecraft_fire_or_damage_cue"],
            voiceCandidate: true,
            calloutDraft: "Fire and sword visible; recover or create distance.",
          },
          effortEstimate: {
            currentEffort: "combat_or_recovery",
            evidenceFor: ["fire visible", "sword visible"],
            evidenceAgainst: [],
            confidence: 0.84,
            nextLikelyEfforts: ["recover", "retreat"],
          },
          axioms: {
            axioms: ["fire is visible", "sword is visible"],
            missingAxioms: ["exact hostile mob location"],
            predictionRelevantVariables: ["health", "distance to fire"],
          },
          hypotheses: [{
            label: "recover_or_retreat",
            prediction: "player creates distance or recovers",
            confidence: 0.72,
            validationSignals: ["health stabilizes"],
            whatWouldContradictIt: ["player advances into fire"],
          }],
          arbiter: {
            recommendedNext: "request_voice_callout",
            wakeAsk: true,
            reason: "Urgent fire cue should wake Ask for a voice callout.",
            confidence: "high",
            selectedHypothesis: "recover_or_retreat",
            voiceCandidate: true,
            calloutDraft: "Fire and sword visible; recover or create distance.",
            missingEvidence: [],
          },
          recommendedNext: "request_voice_callout",
          watchNext: ["health", "fire distance"],
          resolutionState: "needs_voice_decision",
          evidenceHandles: {
            sourceReceipts: [{
              sourceId: "source:visual-tab",
              sourceKind: "visual_frame",
              mailId: "stage_play_live_source_mail:minimal-ui",
              capturedAt: "2026-06-02T00:00:01.000Z",
              monotonicTimeMs: 1000,
              evidenceRefs: ["visual_frame:minimal-ui", "visual_evidence:minimal-ui"],
              frameRef: "visual_frame:minimal-ui",
              observationRef: "live_source_observation:minimal-ui",
            }],
            frameReceipts: [{
              receiptId: "frame:minimal-ui:1",
              sourceId: "source:visual-tab",
              sourceKind: "visual_frame",
              capturedAt: "2026-06-02T00:00:01.000Z",
              monotonicTimeMs: 1000,
              frameIndex: 1,
              hash: "frame-hash-minimal-ui",
              width: 1280,
              height: 720,
              panelSessionId: "panel:ui",
              liveAnswerSessionId: "live-answer:ui",
              previousFrameId: null,
              nextFrameId: null,
              parentMailId: "stage_play_live_source_mail:minimal-ui",
              evidenceRefs: ["visual_frame:minimal-ui"],
            }],
            frameIntervals: [{
              intervalId: "frame_interval:minimal-ui",
              sourceId: "source:visual-tab",
              sourceKind: "visual_frame",
              startFrameId: "frame:minimal-ui:0",
              endFrameId: "frame:minimal-ui:1",
              startTimeMs: 0,
              endTimeMs: 1000,
              strideMs: 250,
              keyFrameIds: ["frame:minimal-ui:0", "frame:minimal-ui:1"],
              reasonCaptured: "danger cue increased",
              evidenceRefs: ["visual_frame:minimal-ui"],
            }],
            lensProducts: [{
              lensReceiptId: "lens:minimal-ui:motion",
              sourceFrameIds: ["frame:minimal-ui:0", "frame:minimal-ui:1"],
              lensPreset: "motion_delta",
              parameters: { focus: "fire cue" },
              modelId: "deterministic-test-lens",
              deterministic: true,
              outputArtifactIds: ["lens_artifact:minimal-ui:motion"],
              derivedClaims: ["fire cue increased"],
              uncertainty: 0.18,
              rawFrameParentRefs: ["frame:minimal-ui:0", "frame:minimal-ui:1"],
            }],
            situationSlices: [{
              sliceId: "situation_slice:minimal-ui",
              timeMs: 1000,
              sources: { screen: "frame:minimal-ui:1", source: "source:visual-tab" },
              knownDeltas: ["fire cue increased"],
              evidenceRefs: ["visual_frame:minimal-ui"],
            }],
          },
          actionPredictions: [{
            predictionId: "action_prediction:minimal-ui",
            actorId: "actor:player",
            predictedAction: "recover_or_create_distance",
            basis: ["surface_cue", "salience"],
            worldStateClaims: ["fire is visible"],
            actorBeliefClaims: ["player likely sees the fire cue"],
            decisiveUncertainties: ["exact hostile mob location"],
            frameIntervalRefs: ["frame_interval:minimal-ui"],
            lensRefs: ["lens:minimal-ui:motion"],
            sourceSliceRefs: ["situation_slice:minimal-ui"],
            confidence: 0.72,
            disconfirmers: ["player advances into fire"],
            recommendedNext: "request_voice_callout",
            evidenceRefs: ["stage_play_live_source_mail:minimal-ui"],
          }],
          unresolvedLeads: [{
            leadId: "evidence_lead:minimal-ui",
            question: "Did the player see the fire before moving?",
            whyItMatters: "Belief access changes the next action prediction.",
            affectedPredictionIds: ["action_prediction:minimal-ui"],
            neededSources: ["source:visual-tab"],
            suggestedFrameIntervals: [{
              sourceId: "source:visual-tab",
              around: "fire cue increased",
              beforeMs: 3000,
              afterMs: 1000,
              strideMs: 250,
              lensPresets: ["raw_thumbnail", "motion_delta"],
            }],
            urgency: "high",
            evidenceRefs: ["frame_interval:minimal-ui"],
          }],
          microReasonerRunRefs: ["stage_play_micro_reasoner_run:minimal-arbiter-ui"],
          microReasonerDeck: {
            presetId: "stage_play_micro_reasoner_prompt_preset:minecraft_minimal_operator:v1",
            presetTitle: "Minecraft Minimal Operator",
            domain: "minecraft_gameplay",
            outputPolicy: "voice_candidate",
            promptedRoles: ["hypothesis_arbiter"],
            rolePromptIds: {
              hypothesis_arbiter: "stage_play_micro_reasoner_prompt:minecraft_minimal_operator_arbiter:v1",
            },
            sourceId: "source:visual-tab",
            appliedAt: "2026-06-02T00:00:01.200Z",
            deckRunPlan: "minimal_prompted_arbiter",
            presetUpdatedAt: "2026-06-02T00:00:01.000Z",
          },
          evidenceRefs: ["stage_play_live_source_mail:minimal-ui", "stage_play_micro_reasoner_run:minimal-arbiter-ui"],
          createdAt: "2026-06-02T00:00:02.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        }],
        microReasonerPromptPresets: [{
          artifactId: "stage_play_micro_reasoner_prompt_preset",
          schemaVersion: "stage_play_micro_reasoner_prompt_preset/v1",
          presetId: "stage_play_micro_reasoner_prompt_preset:minecraft_minimal_operator:v1",
          title: "Minecraft Minimal Operator",
          description: "Minimal prompted arbiter deck for Minecraft visual source packets.",
          domain: "minecraft_gameplay",
          sourceKinds: ["visual_frame"],
          sourceIds: ["source:visual-tab"],
          rolePromptIds: {
            hypothesis_arbiter: "stage_play_micro_reasoner_prompt:minecraft_minimal_operator_arbiter:v1",
          },
          promptedRoles: ["hypothesis_arbiter"],
          deckRunPlan: "minimal_prompted_arbiter",
          outputPolicy: "voice_candidate",
          active: true,
          createdAt: "2026-06-02T00:00:01.000Z",
          updatedAt: "2026-06-02T00:00:01.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_policy",
        }, {
          artifactId: "stage_play_micro_reasoner_prompt_preset",
          schemaVersion: "stage_play_micro_reasoner_prompt_preset/v1",
          presetId: "stage_play_micro_reasoner_prompt_preset:earbud_translation:v1",
          title: "Earbud Translation Deck",
          description: "Routes translated transcript packets into Live Answer and Narrator output.",
          domain: "audio_translation",
          sourceKinds: ["audio_transcript"],
          sourceIds: ["audio_source:earbuds"],
          rolePromptIds: {
            hypothesis_arbiter: "stage_play_micro_reasoner_prompt:earbud_translation_arbiter:v1",
          },
          promptedRoles: ["hypothesis_arbiter"],
          deckRunPlan: "translation_prompted_arbiter",
          outputPolicy: "earbud_translation",
          active: true,
          createdAt: "2026-06-02T00:00:01.000Z",
          updatedAt: "2026-06-02T00:00:02.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_policy",
        }],
        activeMicroReasonerPromptPreset: {
          artifactId: "stage_play_micro_reasoner_prompt_preset",
          schemaVersion: "stage_play_micro_reasoner_prompt_preset/v1",
          presetId: "stage_play_micro_reasoner_prompt_preset:minecraft_minimal_operator:v1",
          title: "Minecraft Minimal Operator",
          description: "Minimal prompted arbiter deck for Minecraft visual source packets.",
          domain: "minecraft_gameplay",
          sourceKinds: ["visual_frame"],
          sourceIds: ["source:visual-tab"],
          rolePromptIds: {
            hypothesis_arbiter: "stage_play_micro_reasoner_prompt:minecraft_minimal_operator_arbiter:v1",
          },
          promptedRoles: ["hypothesis_arbiter"],
          deckRunPlan: "minimal_prompted_arbiter",
          outputPolicy: "voice_candidate",
          active: true,
          createdAt: "2026-06-02T00:00:01.000Z",
          updatedAt: "2026-06-02T00:00:01.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_policy",
        },
        microReasonerPrompts: [{
          artifactId: "stage_play_micro_reasoner_prompt",
          schemaVersion: "stage_play_micro_reasoner_prompt/v1",
          promptId: "stage_play_micro_reasoner_prompt:minecraft_minimal_operator_arbiter:v1",
          title: "Minecraft Minimal Operator Arbiter",
          role: "hypothesis_arbiter",
          version: 1,
          active: true,
          template: "Decide whether the Minecraft visual packet should wake Ask. Preserve source receipts.",
          inputSchemaName: "stage_play_processed_mail_packet/v1",
          outputSchemaName: "stage_play_hypothesis_arbiter_output/v1",
          modelPreference: "deterministic",
          maxInputItems: 1,
          maxOutputTokens: 300,
          presetIds: ["stage_play_micro_reasoner_prompt_preset:minecraft_minimal_operator:v1"],
          createdAt: "2026-06-02T00:00:01.000Z",
          updatedAt: "2026-06-02T00:00:01.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_policy",
        }],
        microReasonerRuns: [{
          artifactId: "stage_play_micro_reasoner_run",
          schemaVersion: "stage_play_micro_reasoner_run/v1",
          runId: "stage_play_micro_reasoner_run:minimal-arbiter-ui",
          role: "hypothesis_arbiter",
          promptId: "stage_play_micro_reasoner_prompt:minecraft_minimal_operator_arbiter:v1",
          deckPresetId: "stage_play_micro_reasoner_prompt_preset:minecraft_minimal_operator:v1",
          deckPresetTitle: "Minecraft Minimal Operator",
          deckRunPlan: "minimal_prompted_arbiter",
          mailIds: ["stage_play_live_source_mail:minimal-ui"],
          packetId: "stage_play_processed_mail_packet:minimal-ui",
          status: "completed",
          modelUsed: "test-model",
          latencyMs: 210,
          inputPreview: "fire and sword visible",
          outputPreview: "{\"recommendedNext\":\"request_voice_callout\",\"wakeAsk\":true}",
          selectedDecision: "request_voice_callout",
          recommendedNextTool: "live_env.record_live_source_mail_decision",
          voiceCandidate: true,
          inputRefs: ["stage_play_live_source_mail:minimal-ui"],
          outputRefs: ["stage_play_micro_reasoner_run:minimal-arbiter-ui"],
          createdAt: "2026-06-02T00:00:02.100Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        }],
        wakeRequests: [{
          artifactId: "stage_play_live_source_mail_wake_request",
          schemaVersion: "stage_play_live_source_mail_wake_request/v1",
          wakeRequestId: "stage_play_live_source_mail_wake:minimal-ui",
          threadId: "helix-ask:desktop",
          roomId: "room:minecraft",
          environmentId: "live_env:minecraft",
          jobId: "stage_play_live_source_job:ui",
          mailIds: ["stage_play_live_source_mail:minimal-ui"],
          packetIds: ["stage_play_processed_mail_packet:minimal-ui"],
          sourceIds: ["source:visual-tab"],
          reason: "deck_verdict",
          status: "queued",
          lifecycleStage: "queued",
          lifecycleReason: "deck_verdict",
          askTurnId: null,
          decisionIds: [],
          attemptCount: 0,
          lastAttemptAt: null,
          nextRetryAt: null,
          failureReason: null,
          deckPresetId: "stage_play_micro_reasoner_prompt_preset:minecraft_minimal_operator:v1",
          deckPresetTitle: "Minecraft Minimal Operator",
          deckRunPlan: "minimal_prompted_arbiter",
          deckVerdict: {
            recommendedNext: "request_voice_callout",
            wakeAsk: true,
            voiceCandidate: true,
            reason: "Urgent fire cue should wake Ask for a voice callout.",
          },
          supersededWakeIds: [
            "stage_play_live_source_mail_wake:older-a",
            "stage_play_live_source_mail_wake:older-b",
          ],
          evidenceRefs: ["stage_play_processed_mail_packet:minimal-ui"],
          queuedAt: "2026-06-02T00:00:03.000Z",
          updatedAt: "2026-06-02T00:00:03.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        }],
        wakeResults: [],
        decisions: [],
        jobStates: [],
        watchJobPolicies: [],
        interpreterProfiles: [],
        interpreterProfileComparisons: [],
        voiceSteeringDebug: null,
        goalContextUpdates: [{
          schemaVersion: "helix.workstation_goal_context_update.v1",
          updateId: "stage_play_goal_context_update:automation:ui",
          createdAtMs: 1780521602500,
          sourceRefs: ["source:visual-tab"],
          loopRefs: [
            "stage_play_live_source_watch_job:ui",
            "stage_play_live_source_watch_job_policy:ui",
          ],
          producerKind: "automation",
          updateKind: "automation_status",
          contentRef: "stage_play_live_source_watch_job_policy:ui",
          preview: "Configured live-source watch job for Minecraft danger monitoring; loop is armed for the next source summary.",
          evidenceRefs: [
            "stage_play_live_source_watch_job_policy:ui",
            "stage_play_live_source_watch_job:ui",
          ],
          receiptRefs: ["stage_play_live_source_watch_job_policy:ui"],
          freshness: {
            observedAtMs: 1780521602500,
            staleAfterMs: 120000,
            status: "fresh",
          },
          goalRelevance: {
            goalId: "goal:stage-play-monitor",
            relevance: 0.82,
            reason: "Watch-job automation policy contributes deterministic automation context for this agent goal.",
          },
          suggestedDispatch: [
            { kind: "log_receipt", receiptRef: "stage_play_live_source_watch_job_policy:ui" },
            { kind: "update_panel", panelId: "stage-play-badge-graph" },
            { kind: "wake_agent", interruptKind: "urgent", reason: "urgent operator interruption" },
            { kind: "append_goal_context", goalId: "goal:stage-play-monitor" },
            { kind: "set_loop_state", loopRef: "stage_play_live_source_watch_job:ui", state: "running" },
          ],
          authority: {
            assistantAnswer: false,
            terminalEligible: false,
            rawContentIncluded: false,
            postToolModelStepRequired: true,
          },
        }, {
          schemaVersion: "helix.workstation_goal_context_update.v1",
          updateId: "stage_play_goal_context_update:source_health:ui",
          createdAtMs: 1780521602550,
          sourceRefs: ["source:visual-tab"],
          loopRefs: ["source_health_watch:visual-tab"],
          producerKind: "source_health",
          updateKind: "source_status",
          contentRef: "source_health_status:visual-tab",
          preview: "Visual source is fresh and bound to the Stage Play mail loop.",
          evidenceRefs: ["source:visual-tab", "source_health_status:visual-tab"],
          receiptRefs: ["source_health_status:visual-tab"],
          freshness: {
            observedAtMs: 1780521602550,
            staleAfterMs: 60000,
            status: "fresh",
          },
          goalRelevance: {
            goalId: "goal:stage-play-monitor",
            relevance: 0.76,
            reason: "Source-health context keeps the agent informed about whether visual packet feeds are current.",
          },
          suggestedDispatch: [
            { kind: "log_receipt", receiptRef: "source_health_status:visual-tab" },
            { kind: "update_panel", panelId: "stage-play-badge-graph" },
            { kind: "repair_source", sourceRef: "source:visual-tab", loopRef: "loop:visual-capture" },
          ],
          authority: {
            assistantAnswer: false,
            terminalEligible: false,
            rawContentIncluded: false,
            postToolModelStepRequired: true,
          },
        }, {
          schemaVersion: "helix.workstation_goal_context_update.v1",
          updateId: "stage_play_goal_context_update:translation:ui",
          createdAtMs: 1780521602575,
          sourceRefs: ["source:visual-tab", "audio_source:earbuds"],
          loopRefs: [
            "stage_play_translation_loop:ui",
            "microdeck:preset_create:earbud_translation:v1",
            "microdeck:preset_state:earbud_translation:v1",
            "microdeck:preset_query:earbud_translation",
            "microdeck:preset_draft:frog_classifier",
            "microdeck:prompt_route:earbud_translation",
            "microdeck:prompt_update:earbud_translation",
            "microdeck:prompt_test:earbud_translation",
            "workstation_context_feed:microdeck_outputs",
            "workstation_context_feed:translated_transcripts",
            "workstation_actuator:query_microdeck_outputs",
            "workstation_actuator:query_translation_segments",
          ],
          producerKind: "translation_loop",
          updateKind: "translated_transcript",
          contentRef: "stage_play_processed_mail_packet:translation-ui",
          preview: "Translated transcript candidate is ready for Live Answer and Narrator output.",
          evidenceRefs: [
            "stage_play_processed_mail_packet:translation-ui",
            "microdeck_output:translation-ui",
            "microdeck:preset_state:earbud_translation:v1",
            "microdeck:prompt_route:earbud_translation",
            "narrator:translated_transcript",
            "workstation_actuator:narrator_bind_stream",
            "context_feed:translated_transcripts",
            "agent_goal_feed:translation",
            "agent_goal_context_feed:agent_goal_feed:translation",
            "allowed_actuator:query_translation_segments",
            "agent_goal_allowed_actuator:query_translation_segments",
            "freshness_filter:fresh",
            "agent_goal_session_filter:context_feed:translated_transcripts",
            "agent_goal_session_filter:allowed_actuator:narrator_bind_stream",
          ],
          receiptRefs: ["stage_play_context_feed_query:translated_transcripts:ui"],
          freshness: {
            observedAtMs: 1780521602575,
            staleAfterMs: 45000,
            status: "fresh",
          },
          goalRelevance: {
            goalId: "goal:stage-play-monitor",
            relevance: 0.78,
            reason: "Translation loop contributes queryable transcript evidence for Live Answer and Narrator wiring.",
          },
          suggestedDispatch: [
            { kind: "update_live_answer", lineKey: "live_answer_projection:translation-ui" },
            { kind: "bind_narrator_stream", sourceRef: "stage_play_translation_loop:ui", streamKind: "translated_transcript" },
            { kind: "change_preset", targetRef: "live-answer:desktop", presetId: "stage_play_micro_reasoner_prompt_preset:earbud_translation:v1" },
            { kind: "bind_source", sourceRef: "source:visual-tab", targetRef: "live-answer:desktop" },
            { kind: "focus_process_graph", nodeRef: "stage_play_processed_mail_packet:translation-ui" },
          ],
          toolIdentity: {
            requestedToolName: "query_translation_segments",
            canonicalToolName: "live_env.query_translation_segments",
            matchedAllowedActuators: ["query_translation_segments"],
            matchedAllowedActuatorRefs: ["agent_goal_allowed_actuator:query_translation_segments"],
          },
          authority: {
            assistantAnswer: false,
            terminalEligible: false,
            rawContentIncluded: false,
            postToolModelStepRequired: true,
          },
        }, {
          schemaVersion: "helix.workstation_goal_context_update.v1",
          updateId: "stage_play_goal_context_update:trace_memory:ui",
          createdAtMs: 1780521602585,
          sourceRefs: ["source:visual-tab"],
          loopRefs: [
            "workstation_context_feed:trace_memory",
            "stage_play_mail_loop:ui",
          ],
          producerKind: "trace_memory",
          updateKind: "reflection",
          contentRef: "trace_memory:stage-play-routing-ui",
          preview: "Trace memory preserved the packet route used by the monitor goal.",
          evidenceRefs: [
            "trace_memory:stage-play-routing-ui",
            "workstation_context_feed:trace_memory",
            "workstation_trace_memory:stage-play-routing-ui",
            "stage_play_processed_mail_packet:translation-ui",
            "source:visual-tab",
            "stage_play_mail_loop:ui",
          ],
          receiptRefs: ["workstation_trace_memory:stage-play-routing-ui"],
          freshness: {
            observedAtMs: 1780521602585,
            staleAfterMs: 120000,
            status: "fresh",
          },
          goalRelevance: {
            goalId: "goal:stage-play-monitor",
            relevance: 0.74,
            reason: "Trace memory keeps packet-route reasoning available to the agent without terminal authority.",
          },
          suggestedDispatch: [
            { kind: "log_receipt", receiptRef: "workstation_trace_memory:stage-play-routing-ui" },
            { kind: "append_goal_context", goalId: "goal:stage-play-monitor" },
          ],
          authority: {
            assistantAnswer: false,
            terminalEligible: false,
            rawContentIncluded: false,
            postToolModelStepRequired: true,
          },
        }, {
          schemaVersion: "helix.workstation_goal_context_update.v1",
          updateId: "stage_play_goal_context_update:bad_projection:ui",
          createdAtMs: 1780521602600,
          sourceRefs: ["live-answer:desktop"],
          loopRefs: ["loop:projection"],
          producerKind: "live_answer",
          updateKind: "summary",
          contentRef: "live_answer_projection:bad_terminal",
          preview: "Malformed Live Answer projection attempted to become terminal before solver authority.",
          evidenceRefs: ["live_answer_projection:bad_terminal"],
          receiptRefs: ["live_answer_projection:bad_terminal"],
          freshness: {
            observedAtMs: 1780521602600,
            staleAfterMs: 30000,
            status: "blocked",
          },
          suggestedDispatch: [
            { kind: "update_panel", panelId: "live-answer-environment" },
          ],
          authority: {
            assistantAnswer: true,
            terminalEligible: true,
            rawContentIncluded: true,
            postToolModelStepRequired: true,
          },
        }],
        agentGoalSessions: [{
          schemaVersion: "helix.agent_goal_session.v1",
          goalId: "goal:stage-play-monitor",
          threadId: "helix-ask:desktop",
          roomId: "room:minecraft",
          objective: "Monitor visual packets and narrator bindings for Minecraft danger.",
          userVisibleSummary: "Minecraft danger monitor",
          status: "active",
          sourceRefs: ["source:visual-tab"],
          loopRefs: ["loop:visual-capture"],
          constructRefs: ["stage_play_badge_graph:ui"],
          contextFeeds: [
            {
              feedId: "feed:visual",
              sourceKind: "visual_summaries",
              freshnessMs: 30000,
              relevancePolicy: "same-source-or-goal-id",
            },
            {
              feedId: "feed:microdeck",
              sourceKind: "microdeck_outputs",
              freshnessMs: 30000,
              relevancePolicy: "same-source-or-goal-id",
            },
            {
              feedId: "feed:packet-traces",
              sourceKind: "packet_traces",
              freshnessMs: 60000,
              relevancePolicy: "same-source-or-packet",
            },
            {
              feedId: "feed:source-health",
              sourceKind: "source_health",
              freshnessMs: 60000,
              relevancePolicy: "same-source",
            },
            {
              feedId: "feed:route-evidence",
              sourceKind: "route_evidence",
              freshnessMs: 60000,
              relevancePolicy: "same-goal-or-route",
            },
            {
              feedId: "feed:automation",
              sourceKind: "automation_policies",
              freshnessMs: 120000,
              relevancePolicy: "same-goal-or-loop-policy",
            },
            {
              feedId: "feed:translation",
              sourceKind: "translated_transcripts",
              freshnessMs: 45000,
              relevancePolicy: "same-source-or-goal-id",
            },
            {
              feedId: "feed:trace",
              sourceKind: "trace_memory",
              freshnessMs: 120000,
              relevancePolicy: "same-thread-or-turn",
            },
            {
              feedId: "feed:narrator-events",
              sourceKind: "narrator_events",
              freshnessMs: 60000,
              relevancePolicy: "same-goal-or-stream-binding",
            },
          ],
          allowedActuators: ["query_visual_summaries", "query_packet_traces", "query_microdeck_outputs", "query_source_health", "query_translation_segments", "query_trace_memory", "query_automation_policies", "query_route_evidence", "narrator_bind_stream", "narrator_say", "focus_process_graph"],
          cadence: { kind: "event_accumulation", minUpdates: 2 },
          stopConditions: [
            "User stops monitoring",
            "Terminal authority produces a final report",
          ],
          checkpoints: [{
            checkpointId: "checkpoint:stage-play-monitor",
            createdAtMs: 1780521603000,
            summary: "Visual packet and narrator stream are attached.",
            evidenceRefs: ["stage_play_processed_mail_packet:minimal-ui"],
            actionsTaken: ["query_visual_summaries", "query_packet_traces", "query_source_health", "narrator_bind_stream"],
            nextStep: "continue",
          }, {
            checkpointId: "checkpoint:stage-play-monitor-feed-query",
            createdAtMs: 1780521604500,
            summary: "Queried visual summaries feed and read 2 update(s) for this goal session.",
            evidenceRefs: [
              "stage_play_goal_context_update:automation:ui",
              "stage_play_context_feed_query:visual_summaries:ui",
            ],
            actionsTaken: ["query_visual_summaries", "live_env.query_visual_summaries"],
            nextStep: "continue",
          }],
          authority: {
            assistantAnswer: false,
            finalReportsRequireTerminalAuthority: true,
            finalReportRequirements: WORKSTATION_AGENT_GOAL_DEFAULT_FINAL_REPORT_REQUIREMENTS,
          },
        }],
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "tool_evidence",
        raw_content_included: false,
      },
    });

    expect(await screen.findByTestId("stage-play-packet-traffic-board")).toBeTruthy();
    expect(screen.getByTestId("stage-play-packet-traffic-header")).toHaveTextContent(/interrupts/i);
    expect(screen.getByTestId("stage-play-packet-traffic-header")).not.toHaveTextContent(/wake \/ ask/i);
    const packetFlowCards = screen.getAllByTestId("stage-play-packet-flow-card").map((node) => node.textContent ?? "");
    expect(packetFlowCards.some((text) => /interrupt Ask/i.test(text))).toBe(true);
    expect(packetFlowCards.some((text) => /wake Ask/i.test(text))).toBe(false);
    expect(screen.getByTestId("stage-play-mail-journey-payload-ledger")).toHaveTextContent(/dispatch interrupt/i);
    expect(screen.getAllByText("Minecraft Minimal Operator").length).toBeGreaterThan(0);
    expect(screen.getAllByText("minimal_prompted_arbiter").length).toBeGreaterThan(0);
    expect(screen.getByText(/Arbiter OK request voice callout/i)).toBeTruthy();
    expect(screen.getAllByText(/superseded 2 older interrupts; latest same-source packet wins/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("stage-play-packet-inspector-deck-title")).toHaveTextContent("Minecraft Minimal Operator");
    expect(screen.getByTestId("stage-play-packet-inspector-deck-plan")).toHaveTextContent("minimal_prompted_arbiter");
    expect(screen.getByTestId("stage-play-packet-inspector-coalescing")).toHaveTextContent("superseded 2 older interrupts");
    expect(screen.getByTestId("stage-play-packet-circuit-inspector")).toHaveTextContent(/packet-scoped observation path/i);
    expect(screen.getAllByTestId("stage-play-packet-circuit-hop").length).toBeGreaterThanOrEqual(8);
    expect(screen.getByTestId("stage-play-packet-circuit-inspector")).toHaveTextContent(/Source Path\s*source:visual-tab/i);
    expect(screen.getByTestId("stage-play-packet-circuit-inspector")).toHaveTextContent(/Deck\s*Minecraft Minimal Operator/i);
    expect(screen.getByTestId("stage-play-packet-circuit-inspector")).toHaveTextContent(/Goal Context\s*1 non-terminal update/i);
    expect(screen.getByTestId("stage-play-packet-circuit-inspector")).toHaveTextContent(/Dispatch\s*Receipt:.*Goal context:.*Panel:.*Narrator:.*Interrupt dispatch/s);
    expect(screen.getByTestId("stage-play-packet-circuit-inspector")).toHaveTextContent(/Authority\s*evidence only: assistant=false terminal=false raw=false/i);
    expect(screen.getByTestId("stage-play-applied-microdeck-checklist")).toBeTruthy();
    expect(screen.getAllByTestId("stage-play-applied-microdeck-chip").length).toBeGreaterThan(1);
    const minimalPacketColor = workstationCircuitColor("stage_play_processed_mail_packet:minimal-ui", "packet");
    const minimalAppliedDeckChip = screen.getAllByTestId("stage-play-applied-microdeck-chip").find((node) =>
      node.getAttribute("data-circuit-color-key") === "stage_play_processed_mail_packet:minimal-ui" &&
      node.getAttribute("data-deck-preset-id") === "stage_play_micro_reasoner_prompt_preset:minecraft_minimal_operator:v1"
    );
    expect(minimalAppliedDeckChip).toBeTruthy();
    expect(minimalAppliedDeckChip).toHaveAttribute("data-circuit-color-hsl", minimalPacketColor.hsl);
    expect(minimalAppliedDeckChip).toHaveAttribute("data-source-ref", "source:visual-tab");
    expect(minimalAppliedDeckChip).toHaveTextContent("color=processed_mail_packet:minimal-ui");
    expect(screen.getAllByText("Earbud Translation Deck").length).toBeGreaterThan(0);
    expect(screen.getByRole("option", { name: /\[applied\] Minecraft Minimal Operator/i })).toBeTruthy();
    expect(screen.getByRole("option", { name: /\[applied\] Earbud Translation Deck/i })).toBeTruthy();
    expect(screen.getAllByText("goal dispatch deck").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/packet color match|packet match/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("stage-play-goal-context-board")).toBeTruthy();
    expect(screen.getByText(/Goal Context Substrate/i)).toBeTruthy();
    expect(screen.getByText(/Wake-agent appears only as classified interrupt dispatch/i)).toBeTruthy();
    expect(screen.getByTestId("stage-play-goal-context-authority-state")).toHaveTextContent(/evidence-only, non-terminal context/i);
    expect(screen.getByTestId("stage-play-terminal-authority-state")).toHaveTextContent(/Final reports require a completed solver path/i);
    expect(screen.getByTestId("stage-play-narrator-binding-state")).toHaveTextContent(/stream binding dispatch/i);
    expect(screen.getByTestId("stage-play-packet-trace-state")).toHaveTextContent(/7 packet trace context items/i);
    expect(screen.getByTestId("stage-play-packet-trace-state")).toHaveTextContent(/per-packet travel visible as evidence/i);
    expect(screen.getByTestId("stage-play-visual-summary-state")).toHaveTextContent(/1 visual summary context item/i);
    expect(screen.getByTestId("stage-play-visual-summary-state")).toHaveTextContent(/screen\/image observations queryable before agent reasoning/i);
    expect(screen.getByTestId("stage-play-source-health-state")).toHaveTextContent(/2 source-health context items/i);
    expect(screen.getByTestId("stage-play-source-health-state")).toHaveTextContent(/loop\/source status queryable before agent reasoning/i);
    expect(screen.getByTestId("stage-play-trace-memory-state")).toHaveTextContent(/2 trace-memory context items/i);
    expect(screen.getByTestId("stage-play-trace-memory-state")).toHaveTextContent(/prior reasoning queryable without answer authority/i);
    expect(screen.getByTestId("stage-play-audio-transcript-state")).toHaveTextContent(/0 audio transcript context items/i);
    expect(screen.getByTestId("stage-play-audio-transcript-state")).toHaveTextContent(/capture speech queryable before agent reasoning/i);
    expect(screen.getByTestId("stage-play-translation-state")).toHaveTextContent(/2 translated transcript context items/i);
    expect(screen.getByTestId("stage-play-translation-state")).toHaveTextContent(/translation output visible as evidence/i);
    expect(screen.getByTestId("stage-play-microdeck-lifecycle-state")).toHaveTextContent(/MicroDeck lifecycle/i);
    expect(screen.getByTestId("stage-play-microdeck-lifecycle-state")).toHaveTextContent(/lifecycle refs track deck output and management/i);
    expect(screen.getByTestId("stage-play-microdeck-lifecycle-state")).toHaveTextContent(/create=1/i);
    expect(screen.getByTestId("stage-play-microdeck-lifecycle-state")).toHaveTextContent(/state=2/i);
    expect(screen.getByTestId("stage-play-microdeck-lifecycle-state")).toHaveTextContent(/query=3/i);
    expect(screen.getByTestId("stage-play-microdeck-lifecycle-state")).toHaveTextContent(/draft=1/i);
    expect(screen.getByTestId("stage-play-microdeck-lifecycle-state")).toHaveTextContent(/route=1/i);
    expect(screen.getByTestId("stage-play-microdeck-lifecycle-state")).toHaveTextContent(/update=1/i);
    expect(screen.getByTestId("stage-play-microdeck-lifecycle-state")).toHaveTextContent(/test=1/i);
    expect(screen.getByTestId("stage-play-route-watch-automation-state")).toHaveTextContent(/2 route evidence items/i);
    expect(screen.getByTestId("stage-play-route-watch-automation-state")).toHaveTextContent(/2 automation policies/i);
    expect(screen.getByTestId("stage-play-route-watch-automation-state")).toHaveTextContent(/1 running loop dispatch/i);
    expect(screen.getByTestId("stage-play-dispatch-mix-state")).toHaveTextContent(/21 dispatch suggestions/i);
    expect(screen.getByTestId("stage-play-dispatch-mix-state")).toHaveTextContent(/2 interrupt dispatches/i);
    expect(screen.getByTestId("stage-play-dispatch-mix-state")).toHaveTextContent(/4 panel updates/i);
    expect(screen.getByTestId("stage-play-dispatch-mix-state")).toHaveTextContent(/1 narrator speech/i);
    expect(screen.getByTestId("stage-play-dispatch-mix-state")).toHaveTextContent(/1 narrator binding/i);
    expect(screen.getByTestId("stage-play-dispatch-mix-state")).toHaveTextContent(/1 source repair/i);
    expect(screen.getByTestId("stage-play-dispatch-mix-state")).toHaveTextContent(/1 loop action/i);
    expect(screen.getByTestId("stage-play-dispatch-mix-state")).toHaveTextContent(/3 goal-context appends/i);
    expect(screen.getByTestId("stage-play-dispatch-mix-state")).toHaveTextContent(/4 receipt logs/i);
    expect(screen.getByTestId("stage-play-control-dispatch-state")).toHaveTextContent(/8 workstation control dispatches/i);
    expect(screen.getByTestId("stage-play-control-dispatch-state")).toHaveTextContent(/1 preset/i);
    expect(screen.getByTestId("stage-play-control-dispatch-state")).toHaveTextContent(/1 source binding/i);
    expect(screen.getByTestId("stage-play-control-dispatch-state")).toHaveTextContent(/1 source repair/i);
    expect(screen.getByTestId("stage-play-control-dispatch-state")).toHaveTextContent(/1 loop/i);
    expect(screen.getByTestId("stage-play-control-dispatch-state")).toHaveTextContent(/1 Live Answer/i);
    expect(screen.getByTestId("stage-play-control-dispatch-state")).toHaveTextContent(/1 graph/i);
    expect(screen.getByTestId("stage-play-control-dispatch-state")).toHaveTextContent(/1 narrator speech/i);
    expect(screen.getByTestId("stage-play-control-dispatch-state")).toHaveTextContent(/1 narrator binding/i);
    expect(screen.getByTestId("stage-play-control-dispatch-state")).toHaveTextContent(/Wake-agent is limited to 2 interrupt dispatches/i);
    expect(screen.getByTestId("stage-play-wake-interrupt-scope-state")).toHaveTextContent(/Interrupt split: 2 urgent, 0 blocked, 0 policy-triggered/i);
    expect(screen.getByTestId("stage-play-wake-interrupt-scope-state")).toHaveTextContent(/Other dispatches stay on workstation control lanes/i);
    expect(screen.getByTestId("stage-play-actuator-policy-state")).toHaveTextContent(/11 allowed actuators/i);
    expect(screen.getByTestId("stage-play-actuator-policy-state")).toHaveTextContent(/2 narrator output policy items/i);
    expect(screen.getByTestId("stage-play-actuator-policy-state")).toHaveTextContent(/1 narrator event feed/i);
    expect(screen.getByTestId("stage-play-actuator-ref-state")).toHaveTextContent(/workstation actuator refs expose query and control traffic/i);
    expect(screen.getByTestId("stage-play-feed-policy-ref-state")).toHaveTextContent(/5 context-feed policy refs/i);
    expect(screen.getByTestId("stage-play-feed-policy-ref-state")).toHaveTextContent(/5 actuator policy refs/i);
    expect(screen.getByTestId("stage-play-feed-policy-ref-state")).toHaveTextContent(/1 exact goal authorization ref/i);
    expect(screen.getByTestId("stage-play-freshness-filter-state")).toHaveTextContent(/1 requested freshness filter ref/i);
    expect(screen.getByTestId("stage-play-freshness-filter-state")).toHaveTextContent(/fresh, stale, blocked, or unknown context/i);
    expect(screen.getByTestId("stage-play-session-filter-state")).toHaveTextContent(/2 goal-session filter refs/i);
    expect(screen.getByTestId("stage-play-session-filter-state")).toHaveTextContent(/feed and actuator constraints/i);
    expect(screen.getByTestId("stage-play-tool-attribution-state")).toHaveTextContent(/1 tool-attributed update/i);
    expect(screen.getByTestId("stage-play-tool-attribution-state")).toHaveTextContent(/1 matched allowed actuator update/i);
    expect(screen.getByTestId("stage-play-tool-attribution-state")).toHaveTextContent(/requested tool, canonical tool, and exact goal authorization refs/i);
    expect(screen.getByText("Minecraft danger monitor")).toBeTruthy();
    expect(screen.getByTestId("stage-play-agent-goal-session-feeds")).toHaveTextContent(/visual summaries/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-feeds")).toHaveTextContent(/packet traces/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-feeds")).toHaveTextContent(/source health/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-feeds")).toHaveTextContent(/microdeck outputs/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-feeds")).toHaveTextContent(/automation policies/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-feeds")).toHaveTextContent(/route evidence/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-feeds")).toHaveTextContent(/translated transcripts/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-feeds")).toHaveTextContent(/narrator events/i);
    expect(screen.getAllByTestId("stage-play-goal-context-update-policy-split").some((node) =>
      /agent_goal_context_feed:agent_goal_feed:translation/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getByTestId("stage-play-agent-goal-session-actuators")).toHaveTextContent(/query visual summaries/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-actuators")).toHaveTextContent(/query packet traces/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-actuators")).toHaveTextContent(/narrator bind stream/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-narrator-controls")).toHaveTextContent(/narratorControls=narrator bind stream, narrator say/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-final-report-contract")).toHaveTextContent(/completed_solver_path=true/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-final-report-contract")).toHaveTextContent(/evidence_reentry=true/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-final-report-contract")).toHaveTextContent(/route_authority=true/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-final-report-contract")).toHaveTextContent(/single_writer=true/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-final-report-contract")).toHaveTextContent(/allowed_terminal=final answer, typed failure, request user input/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-final-report-contract")).toHaveTextContent(/required_evidence=goal context update, agent step observation packet, route product contract, terminal authority single writer/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-final-report-contract")).toHaveTextContent(/prohibited_sources=goal context update, tool receipt, workstation control receipt, panel projection, live answer projection, microdeck output, narrator event, narrator binding, interrupt dispatch, wake request, wake result, actuator ref/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-loops")).toHaveTextContent(/loop:visual-capture/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-cadence")).toHaveTextContent(/event accumulation \/ 2 updates/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-stop-conditions")).toHaveTextContent(/Terminal authority produces a final report/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-checkpoint")).toHaveTextContent(/Queried visual summaries feed/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-checkpoint-trail")).toHaveTextContent(/Visual packet and narrator stream are attached/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-checkpoint-trail")).toHaveTextContent(/Queried visual summaries feed and read 2 update/i);
    expect(screen.getAllByTestId("stage-play-agent-goal-session-checkpoint-actions").some((node) =>
      /query visual summaries/i.test(node.textContent ?? "") && /live env query visual summaries/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-agent-goal-session-checkpoint-actions").some((node) =>
      /query packet traces/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-agent-goal-session-checkpoint-evidence").some((node) =>
      /stage_play_goal_context_update:automation:ui/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-update").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("stage-play-goal-context-update").some((node) =>
      /automation status/i.test(node.textContent ?? "") && /Configured live-source watch job/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-update").some((node) =>
      /translated transcript/i.test(node.textContent ?? "") && /ready for Live Answer and Narrator output/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-update-custody").some((node) =>
      /sources=source:visual-tab/i.test(node.textContent ?? "") &&
      /evidence=stage_play_live_source_watch_job_policy:ui, stage_play_live_source_watch_job:ui/i.test(node.textContent ?? "") &&
      /receipts=stage_play_live_source_watch_job_policy:ui/i.test(node.textContent ?? "") &&
      /goal=goal:stage-play-monitor relevance=0\.82/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-route-watch-refs").some((node) =>
      /routeWatch=stage_play_live_source_watch_job:ui/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-automation-refs").some((node) =>
      /automation=stage_play_live_source_watch_job_policy:ui/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-trace-memory-refs").some((node) =>
      /traceMemory=trace_memory:stage-play-routing-ui/i.test(node.textContent ?? "") &&
      /workstation_context_feed:trace_memory/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-microdeck-refs").some((node) =>
      /microdeck=microdeck:preset_create:earbud_translation:v1/i.test(node.textContent ?? "") &&
      /microdeck:prompt_route:earbud_translation/i.test(node.textContent ?? "") &&
      /workstation_context_feed:microdeck_outputs/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-update-policy").some((node) =>
      /workstation_actuator:narrator_bind_stream/i.test(node.textContent ?? "") &&
      /context_feed:translated_transcripts/i.test(node.textContent ?? "") &&
      /allowed_actuator:query_translation_segments/i.test(node.textContent ?? "") &&
      /agent_goal_allowed_actuator:query_translation_segments/i.test(node.textContent ?? "") &&
      /workstation_context_feed:translated_transcripts/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-update-policy-split").some((node) =>
      /context_feed:translated_transcripts/i.test(node.textContent ?? "") &&
      /agent_goal_context_feed:agent_goal_feed:translation/i.test(node.textContent ?? "") &&
      /workstation_context_feed:translated_transcripts/i.test(node.textContent ?? "") &&
      /actuators=.*workstation_actuator:narrator_bind_stream.*allowed_actuator:query_translation_segments.*agent_goal_allowed_actuator:query_translation_segments.*workstation_actuator:query_microdeck_outputs.*workstation_actuator:query_translation_segments/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-actuator-refs").some((node) =>
      /workstation_actuator:narrator_bind_stream/i.test(node.textContent ?? "") &&
      /workstation_actuator:query_translation_segments/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-actuator-refs").some((node) =>
      /workstation_actuator:set_loop_state/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-actuator-refs").some((node) =>
      /workstation_actuator:repair_source/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-update-matched-actuator-refs").some((node) =>
      /matchedActuatorRefs=agent_goal_allowed_actuator:query_translation_segments/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-update-freshness-filter").some((node) =>
      /requestedFreshness=freshness_filter:fresh/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-update-session-filter").some((node) =>
      /requestedSession=agent_goal_session_filter:context_feed:translated_transcripts, agent_goal_session_filter:allowed_actuator:narrator_bind_stream/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getByTestId("stage-play-agent-goal-session-feed-policy-refs")).toHaveTextContent(/agent_goal_context_feed:feed:translation/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-feed-policy-refs")).toHaveTextContent(/agent_goal_allowed_actuator:query_translation_segments/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-feed-policy-refs")).toHaveTextContent(/agent_goal_allowed_actuator:query_packet_traces/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-feed-policy-refs")).toHaveTextContent(/agent_goal_allowed_actuator:query_trace_memory/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-feed-policy-refs")).toHaveTextContent(/agent_goal_allowed_actuator:query_automation_policies/i);
    expect(screen.getByTestId("stage-play-agent-goal-session-feed-policy-refs")).not.toHaveTextContent(/agent_goal_allowed_actuator:query_narrator_events/i);
    expect(screen.getAllByTestId("stage-play-goal-context-update-freshness").some((node) =>
      /freshness=fresh observed=1780521602500 staleAfter=120000ms/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-circuit-route").some((node) =>
      /Source\s*source:visual-tab/i.test(node.textContent ?? "") &&
      /Loop\s*translation_loop:ui/i.test(node.textContent ?? "") &&
      /Deck\s*microdeck_output:translation-ui/i.test(node.textContent ?? "") &&
      /Transcript\s*(?:workstation_)?context_feed:translated_transcripts/i.test(node.textContent ?? "") &&
      /Narrator\s*narrator:translated_transcript.*actuator:narrator_bind_stream/s.test(node.textContent ?? "") &&
      /Dispatch\s*Live Answer:/i.test(node.textContent ?? "") &&
      /Destination\s*live_answer:projection:translation-ui.*narrator:translated_transcript/s.test(node.textContent ?? "") &&
      /Authority\s*evidence only/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-transcript-refs").some((node) =>
      /transcripts=workstation_context_feed:translated_transcripts/i.test(node.textContent ?? "") &&
      /workstation_actuator:query_translation_segments/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-projection-refs").some((node) =>
      /projections=live_answer_projection:bad_terminal/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-source-health-refs").some((node) =>
      /sourceHealth=source_health_status:visual-tab/i.test(node.textContent ?? "") &&
      /source_health_watch:visual-tab/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-narrator-refs").some((node) =>
      /narrator=narrator:translated_transcript/i.test(node.textContent ?? "") &&
      /workstation_context_feed:narrator_events/i.test(node.textContent ?? "") &&
      /workstation_actuator:narrator_bind_stream/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-circuit-route").some((node) =>
      /Destination\s*interrupt dispatch/i.test(node.textContent ?? "") &&
      /Route Watch\s*live_source_watch_job:ui/i.test(node.textContent ?? "") &&
      /Automation\s*live_source_watch_job_policy:ui/i.test(node.textContent ?? "") &&
      /Authority\s*evidence only/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-circuit-route").some((node) =>
      /Trace Memory\s*trace_memory:stage-play-routing-ui/i.test(node.textContent ?? "") &&
      /Authority\s*evidence only/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-circuit-route").some((node) =>
      /Projection\s*live_answer:projection:bad_terminal/i.test(node.textContent ?? "") &&
      /Authority\s*blocked terminal claim/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-circuit-route").some((node) =>
      /Source Health\s*(?:source_health_status:visual-tab|context_feed:source_health)/i.test(node.textContent ?? "") &&
      /Authority\s*evidence only/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-circuit-route").some((node) =>
      /Authority\s*blocked terminal claim/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-authority-chips").some((node) =>
      /assistant=false.*terminal=false.*raw=false/s.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-authority-chips").some((node) =>
      /assistant=true.*terminal=true.*raw=true/s.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-dispatch").some((node) =>
      /Goal context|Panel|Narrator|Interrupt dispatch|Loop: running/i.test(node.textContent ?? "")
    )).toBe(true);
    expect(screen.getAllByTestId("stage-play-goal-context-dispatch").some((node) =>
      /Interrupt dispatch \(urgent\): urgent operator interruption/i.test(node.textContent ?? "")
    )).toBe(true);
    const arbiterRole = screen.getAllByTestId("stage-play-microdeck-role-square").find((node: HTMLElement) =>
      node.textContent?.includes("Hypothesis Arbiter")
    );
    expect(arbiterRole).toBeTruthy();
    fireEvent.click(arbiterRole as HTMLElement);
    expect(await screen.findByTestId("stage-play-microdeck-evidence-widget-frame_intervals")).toHaveTextContent("1 interval");
    fireEvent.click(screen.getByTestId("stage-play-microdeck-evidence-widget-frame_intervals"));
    const promptDraft = screen.getByLabelText("MicroReasoner prompt draft") as HTMLTextAreaElement;
    expect(promptDraft.value).toContain("Evidence handle wiring: frame interval pursuit");
    expect(promptDraft.value).toContain("packet.evidenceHandles.frameIntervals");
    expect(promptDraft.value).toContain("frameIntervals=1");
    expect(screen.getByText(/Evidence handle wiring appended to the draft/i)).toBeTruthy();
  });

  it("renders an active unscoped interpreter profile returned by the mailbox namespace", async () => {
    renderPanel({
      mailboxResponse: {
        ok: true,
        schema: "stage_play_live_source_mail_list_response/v1",
        requestedThreadId: "helix-ask:desktop",
        mailboxThreadId: "helix-ask:desktop",
        mailItems: [{
          artifactId: "stage_play_live_source_mail_item",
          schemaVersion: "stage_play_live_source_mail_item/v1",
          mailId: "stage_play_live_source_mail:unscoped-profile-ui",
          threadId: "helix-ask:desktop",
          roomId: null,
          environmentId: null,
          sourceId: "source:visual-tab",
          sourceKind: "visual_frame",
          sourceRefs: {
            sourceId: "source:visual-tab",
            frameRef: "visual_frame:unscoped-profile-ui",
            evidenceRef: "visual_evidence:unscoped-profile-ui",
            observationRef: null,
          },
          summary: {
            text: "Minecraft video frame with a player moving near a dark cave opening.",
            preview: "Minecraft video frame near a dark cave opening.",
            confidence: 0.72,
            analysisState: "analysis_ready",
          },
          priorContext: {
            previousMailId: null,
            previousEvidenceRef: null,
            previousSummaryPreview: null,
          },
          objective: {
            objectiveId: null,
            text: "Watch the active visual source.",
          },
          hints: {
            deterministicChangeHint: "first_summary",
            elapsedMsSincePrevious: null,
            sourceFreshness: "fresh",
          },
          status: "unread",
          evidenceRefs: ["visual_frame:unscoped-profile-ui", "visual_evidence:unscoped-profile-ui"],
          createdAt: "2026-06-02T00:02:01.000Z",
          updatedAt: "2026-06-02T00:02:01.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        }],
        jobStates: [],
        watchJobPolicies: [],
        interpreterProfiles: [{
          artifactId: "stage_play_live_source_interpreter_profile",
          schemaVersion: "stage_play_live_source_interpreter_profile/v1",
          profileId: "stage_play_live_source_interpreter_profile:unscoped-ui",
          title: "Minecraft Video Predictor",
          threadId: "helix-ask:desktop",
          roomId: null,
          environmentId: null,
          jobId: null,
          policyId: null,
          sourceKinds: ["visual_frame"],
          domain: "minecraft",
          objectiveText: "Interpret chronological visual-summary mail for a Minecraft video.",
          interpretationGuidelines: "Separate observed facts from cautious inferences and predict the next scene beat.",
          lenses: ["prediction", "scene beat", "risk"],
          salienceCriteria: ["hostile mobs", "fire", "damage", "major scene transition"],
          suppressCriteria: ["routine walking", "repeated stable frames"],
          riskCriteria: ["low light", "hostile mob"],
          opportunityCriteria: ["rare resources"],
          voiceCalloutCriteria: ["danger"],
          evidenceRules: {
            preserveRawObservation: true,
            distinguishObservedVsInferred: true,
            requireEvidenceRefs: true,
            askWhenUncertain: true,
          },
          outputStyle: {
            textAnswerStyle: "brief_explanation",
            voiceStyle: "warning_only",
          },
          linkedNoteId: null,
          linkedNoteTitle: null,
          status: "active",
          evidenceRefs: ["stage_play_live_source_interpreter_profile:unscoped-ui"],
          createdAt: "2026-06-02T00:02:00.000Z",
          updatedAt: "2026-06-02T00:02:00.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        }],
        interpreterProfileComparisons: [],
        decisions: [],
        narrativeStates: [],
        wakeRequests: [],
        wakeResults: [],
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "tool_evidence",
        raw_content_included: false,
      },
    });

    await screen.findByTestId("stage-play-badge-graph-scrollport");

    expect(screen.getAllByText(/Minecraft Video Predictor/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("no active interpreter profile")).toBeNull();
    expect(screen.queryByText("No active interpreter profile or watch policy.")).toBeNull();
  });

  it("renders completed wake continuation as backend-owned loop state", async () => {
    renderPanel({
      mailboxResponse: {
        ok: true,
        schema: "stage_play_live_source_mail_list_response/v1",
        requestedThreadId: "helix-ask:desktop",
        mailboxThreadId: "helix-ask:desktop",
        wakeAdmissionCycle: {
          schema: "stage_play_live_source_mail_wake_admission_cycle/v1",
          now: "2026-06-02T00:01:05.000Z",
          queuedWakeIds: ["stage_play_live_source_mail_wake:retained-ui"],
          runnableWakeIds: ["stage_play_live_source_mail_wake:retained-ui"],
          runningWakeIds: [],
          deferredWakeIds: [],
          result: {
            wakeResultId: "stage_play_live_source_mail_wake_result:completed-ui",
            wakeRequestId: "stage_play_live_source_mail_wake:completed-ui",
            status: "completed",
          },
          status: "completed",
          reason: "wake_admitted",
          continuation: {
            scheduled: true,
            reason: "runnable_wake_remaining",
            runnableWakeIds: ["stage_play_live_source_mail_wake:retained-ui"],
          },
          runtimeAdmission: {
            admitted: true,
            action: "admit",
            reason: "ok",
            pressureLevel: "normal",
          },
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        },
        mailItems: [
          {
            artifactId: "stage_play_live_source_mail_item",
            schemaVersion: "stage_play_live_source_mail_item/v1",
            mailId: "stage_play_live_source_mail:first-ui",
            threadId: "helix-ask:desktop",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            sourceId: "source:visual-tab",
            sourceKind: "visual_frame",
            sourceRefs: {
              sourceId: "source:visual-tab",
              frameRef: "visual_frame:first-ui",
              evidenceRef: "visual_evidence:first-ui",
              observationRef: "live_source_observation:first-ui",
            },
            summary: {
              text: "First compact Minecraft summary.",
              preview: "First compact Minecraft summary.",
              confidence: 0.76,
              analysisState: "analysis_ready",
            },
            priorContext: {},
            objective: { objectiveId: null, text: "Watch the active visual source." },
            hints: { deterministicChangeHint: "summary_changed", sourceFreshness: "fresh" },
            status: "read",
            evidenceRefs: ["visual_frame:first-ui", "visual_evidence:first-ui"],
            createdAt: "2026-06-02T00:01:00.000Z",
            updatedAt: "2026-06-02T00:01:02.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
          {
            artifactId: "stage_play_live_source_mail_item",
            schemaVersion: "stage_play_live_source_mail_item/v1",
            mailId: "stage_play_live_source_mail:retained-ui",
            threadId: "helix-ask:desktop",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            sourceId: "source:visual-tab",
            sourceKind: "visual_frame",
            sourceRefs: {
              sourceId: "source:visual-tab",
              frameRef: "visual_frame:retained-ui",
              evidenceRef: "visual_evidence:retained-ui",
              observationRef: "live_source_observation:retained-ui",
            },
            summary: {
              text: "Second compact Minecraft summary retained for the next wake.",
              preview: "Second compact Minecraft summary retained for the next wake.",
              confidence: 0.8,
              analysisState: "analysis_ready",
            },
            priorContext: { previousMailId: "stage_play_live_source_mail:first-ui" },
            objective: { objectiveId: null, text: "Watch the active visual source." },
            hints: { deterministicChangeHint: "summary_changed", sourceFreshness: "fresh" },
            status: "unread",
            evidenceRefs: ["visual_frame:retained-ui", "visual_evidence:retained-ui"],
            createdAt: "2026-06-02T00:01:01.000Z",
            updatedAt: "2026-06-02T00:01:01.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
        ],
        jobStates: [{
          artifactId: "stage_play_live_source_job_state",
          schemaVersion: "stage_play_live_source_job_state/v1",
          jobId: "stage_play_live_source_job:ui",
          threadId: "helix-ask:desktop",
          roomId: "room:minecraft",
          environmentId: "live_env:minecraft",
          sourceIds: ["source:visual-tab"],
          objective: "Watch the active visual source.",
          status: "armed",
          watchJobPolicyRef: "stage_play_live_source_watch_job_policy:ui",
          mailboxCursor: "stage_play_live_source_mail:first-ui",
          lastMailId: "stage_play_live_source_mail:first-ui",
          lastDecisionId: "stage_play_live_source_mail_decision:ui",
          nextLoopState: "armed_for_next_summary",
          nextWakePolicy: { sourceKind: "visual_frame", afterMs: null, maxConsecutiveReads: 1 },
          updatedAt: "2026-06-02T00:01:02.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        }],
        watchJobPolicies: [{
          artifactId: "stage_play_live_source_watch_job_policy",
          schemaVersion: "stage_play_live_source_watch_job_policy/v1",
          policyId: "stage_play_live_source_watch_job_policy:ui",
          jobId: "stage_play_live_source_job:ui",
          threadId: "helix-ask:desktop",
          roomId: "room:minecraft",
          environmentId: "live_env:minecraft",
          sourceIds: ["source:visual-tab"],
          objectiveText: "Watch the active visual source.",
          decisionPolicyPrompt: "Interpret each compact visual-summary mail batch.",
          outputPolicy: {
            allowTextAnswer: true,
            allowVoiceCallout: false,
            voiceRequiresUrgency: true,
            confirmationRequired: true,
          },
          importanceCriteria: ["new visual summary"],
          suppressCriteria: [],
          interpretationMode: "batch_interpretation",
          status: "armed",
          priorDecisionRefs: [],
          priorAnswerRefs: [],
          evidenceRefs: ["stage_play_live_source_watch_job_policy:ui"],
          createdAt: "2026-06-02T00:01:00.000Z",
          updatedAt: "2026-06-02T00:01:00.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        }],
        wakeRequests: [
          {
            artifactId: "stage_play_live_source_mail_wake_request",
            schemaVersion: "stage_play_live_source_mail_wake_request/v1",
            wakeRequestId: "stage_play_live_source_mail_wake:completed-ui",
            threadId: "helix-ask:desktop",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            jobId: "stage_play_live_source_job:ui",
            mailIds: ["stage_play_live_source_mail:first-ui"],
            sourceIds: ["source:visual-tab"],
            reason: "unread_mail",
            status: "completed",
            askTurnId: "ask:completed-ui",
            decisionIds: ["stage_play_live_source_mail_decision:ui"],
            attemptCount: 1,
            lastAttemptAt: "2026-06-02T00:01:02.000Z",
            nextRetryAt: null,
            failureReason: null,
            evidenceRefs: ["stage_play_live_source_mail:first-ui"],
            queuedAt: "2026-06-02T00:01:00.000Z",
            updatedAt: "2026-06-02T00:01:03.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
          {
            artifactId: "stage_play_live_source_mail_wake_request",
            schemaVersion: "stage_play_live_source_mail_wake_request/v1",
            wakeRequestId: "stage_play_live_source_mail_wake:retained-ui",
            threadId: "helix-ask:desktop",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            jobId: "stage_play_live_source_job:ui",
            mailIds: ["stage_play_live_source_mail:retained-ui"],
            sourceIds: ["source:visual-tab"],
            reason: "unread_mail",
            wakeIntent: "ask_from_processed_packet",
            status: "queued",
            askTurnId: null,
            decisionIds: [],
            packetIds: ["stage_play_processed_mail_packet:retained-ui"],
            deckPresetId: "stage_play_micro_reasoner_prompt_preset:minecraft_minimal_operator:v1",
            deckPresetTitle: "Minecraft Minimal Operator",
            deckRunPlan: "minimal_prompted_arbiter",
            deckVerdict: {
              recommendedNext: "record_interpretation",
              wakeAsk: true,
              voiceCandidate: false,
              reason: "Minimal operator selected a packet-backed Ask handoff.",
            },
            attemptCount: 0,
            lastAttemptAt: null,
            nextRetryAt: null,
            failureReason: null,
            evidenceRefs: [
              "stage_play_live_source_mail:retained-ui",
              "stage_play_processed_mail_packet:retained-ui",
            ],
            queuedAt: "2026-06-02T00:01:04.000Z",
            updatedAt: "2026-06-02T00:01:04.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
        ],
        wakeResults: [{
          artifactId: "stage_play_live_source_mail_wake_result",
          schemaVersion: "stage_play_live_source_mail_wake_result/v1",
          wakeResultId: "stage_play_live_source_mail_wake_result:completed-ui",
          wakeRequestId: "stage_play_live_source_mail_wake:completed-ui",
          threadId: "helix-ask:desktop",
          roomId: "room:minecraft",
          environmentId: "live_env:minecraft",
          status: "completed",
          askTurnId: "ask:completed-ui",
          decisionIds: ["stage_play_live_source_mail_decision:ui"],
          evidenceRefs: [
            "stage_play_live_source_mail:first-ui",
            "helix_interim_voice_callout_receipt:completed-ui",
          ],
          createdAt: "2026-06-02T00:01:03.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        }],
        decisions: [{
          artifactId: "stage_play_live_source_mail_decision",
          schemaVersion: "stage_play_live_source_mail_decision/v1",
          decisionId: "stage_play_live_source_mail_decision:ui",
          mailIds: ["stage_play_live_source_mail:first-ui"],
          threadId: "helix-ask:desktop",
          roomId: "room:minecraft",
          environmentId: "live_env:minecraft",
          decision: "record_interpretation",
          rationalePreview: "The first compact batch was interpreted.",
          textAnswerDraft: null,
          voiceCalloutDraft: null,
          voicePolicy: { voiceEnabled: false, requiresConfirmation: false, allowedNow: false, reason: "voice off" },
          requestedTool: null,
          nextLoopState: "armed_for_next_summary",
          mailboxCursor: "stage_play_live_source_mail:first-ui",
          activeJobId: "stage_play_live_source_job:ui",
          evidenceRefs: ["stage_play_live_source_mail_decision:ui"],
          modelReviewed: true,
          createdAt: "2026-06-02T00:01:03.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        }],
        narrativeStates: [],
        interpreterProfiles: [],
        interpreterProfileComparisons: [],
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "tool_evidence",
        raw_content_included: false,
      },
    });

    await screen.findByTestId("stage-play-badge-graph-scrollport");

    expect(screen.getAllByText("Continuation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Batch completed.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Continuation: scheduled/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Loop state: armed_for_next_summary/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Unread retained: 1/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Runnable interrupts: 1/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Last completed").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/voice checkpoint status unknown; 1 voice checkpoint; ask ask:completed-ui; 1 decision/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Current pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/queued; 1 mail/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Watch policy: batch_interpretation; mail latest_only; cadence every_batch; continuation scheduled/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("No watch policy.")).toBeNull();
    expect(screen.getAllByText(/job armed/i).length).toBeGreaterThan(0);
  });

  it("refreshes mailbox state when Helix Ask completes a mailbox artifact turn", async () => {
    renderPanel();

    await screen.findByTestId("stage-play-badge-graph-scrollport");
    await waitFor(() => {
      expect(fetchCallUrls().some((url) => url.includes("/api/helix/stage-play/live-source-mail?"))).toBe(true);
    });
    const initialMailboxCalls = fetchCallUrls().filter((url) =>
      url.includes("/api/helix/stage-play/live-source-mail?")
    ).length;

    window.dispatchEvent(new CustomEvent(STAGE_PLAY_LIVE_SOURCE_MAIL_REFRESH_EVENT, {
      detail: {
        threadId: "helix-ask:desktop",
        mailboxThreadId: "helix-ask:desktop",
        askTurnId: "ask:policy-created",
        artifactMarkers: ["stage_play_live_source_watch_job_policy"],
      },
    }));

    await waitFor(() => {
      const nextMailboxCalls = fetchCallUrls().filter((url) =>
        url.includes("/api/helix/stage-play/live-source-mail?")
      ).length;
      expect(nextMailboxCalls).toBeGreaterThan(initialMailboxCalls);
    });
  });

  it("renders voice steering timeline evidence in the processed mail loop", async () => {
    renderPanel({
      transcriptResponse: {
        ok: true,
        schema: "stage_play_live_source_mail_transcript_response/v1",
        requestedThreadId: "helix-ask:desktop",
        mailboxThreadId: "helix-ask:desktop",
        threadId: "helix-ask:desktop",
        entries: [],
        transcriptEntryIds: ["stage_play_live_source_mail_transcript_entry:steering-ui"],
        evidenceRefs: [
          "helix_voice_steering_event:ui",
          "helix_voice_steering_decision:ui",
          "helix_interim_voice_callout_receipt:steering-ui",
        ],
        transcriptRows: [
          {
            rowId: "voice_steering_received:ui",
            rowKind: "voice_steering_received",
            title: "Voice steering received",
            body: "Actually focus on whether the active Ask turn was steered.",
            source: {
              toolName: "live_env.record_voice_steering",
              artifactId: "helix_voice_steering_event:ui",
              artifactKind: "helix.voice_steering_event.v1",
            },
            evidenceRefs: ["helix_voice_steering_event:ui"],
            authority: "tool_evidence",
            assistantAnswer: false,
            terminalEligible: false,
            createdAt: "2026-06-02T00:01:05.000Z",
          },
          {
            rowId: "voice_steering_applied:ui",
            rowKind: "voice_steering_applied",
            title: "Voice steering applied",
            body: "User voice steering was routed into the active turn.",
            source: {
              toolName: "live_env.record_voice_steering",
              artifactId: "helix_voice_steering_decision:ui",
              artifactKind: "helix.voice_steering_decision.v1",
            },
            evidenceRefs: ["helix_voice_steering_decision:ui", "helix_voice_steering_event:ui"],
            authority: "tool_evidence",
            assistantAnswer: false,
            terminalEligible: false,
            createdAt: "2026-06-02T00:01:06.000Z",
          },
          {
            rowId: "steering_ack_receipt:ui",
            rowKind: "steering_ack_receipt",
            title: "Steering acknowledgement receipt",
            body: "Acknowledged steering without claiming final answer authority.",
            source: {
              toolName: "live_env.request_interim_voice_callout",
              artifactId: "helix_interim_voice_callout_receipt:steering-ui",
              artifactKind: "helix.interim_voice_callout.receipt.v1",
            },
            evidenceRefs: ["helix_voice_steering_event:ui", "helix_voice_steering_decision:ui"],
            authority: "tool_evidence",
            assistantAnswer: false,
            terminalEligible: false,
            createdAt: "2026-06-02T00:01:07.000Z",
          },
        ],
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "tool_evidence",
        raw_content_included: false,
      },
    });

    await screen.findByTestId("stage-play-badge-graph-scrollport");

    expect(screen.getAllByText("Steering").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Voice steering applied").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Heard: Actually focus on whether the active Ask turn was steered/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ack: Acknowledged steering without claiming final answer authority/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Transcript rows back voice_steering_debug/i).length).toBeGreaterThan(0);
  });

  it("keeps mail wake execution out of the graph controls", async () => {
    renderPanel();

    await screen.findByTestId("stage-play-badge-graph-scrollport");
    expect(screen.queryByRole("button", { name: "Run armed mail wake" })).toBeNull();
    expect(fetchCallUrls().some((url) => url.includes("/api/helix/stage-play/live-source-mail/wake/run"))).toBe(false);
    expect(fetchCallUrls().some((url) => url.includes("/api/helix/stage-play/live-source-mail/wake/cycle"))).toBe(false);
  });

  it("bridges a pressure-deferred mail wake into the visible Helix Ask UI", async () => {
    const promptEvents: CustomEvent[] = [];
    window.addEventListener("helix-ask:prompt", ((event: Event) => {
      promptEvents.push(event as CustomEvent);
    }) as EventListener);
    renderPanel();

    expect(await screen.findByTestId("stage-play-mail-loop-live-overview")).toBeTruthy();
    expect(screen.getByText("heap ram")).toBeTruthy();
    expect(screen.getByText("rss ram")).toBeTruthy();
    expect(screen.getAllByText("90%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("89%").length).toBeGreaterThan(0);
    expect(screen.getByTestId("stage-play-mail-loop-operator-summary")).toBeTruthy();
    expect(screen.getByText("Ask handoff status")).toBeTruthy();
    expect(screen.getAllByText("Blocked before Ask").length).toBeGreaterThan(0);
    expect(screen.getByText("Ask turn")).toBeTruthy();
    expect(screen.getAllByText("none").length).toBeGreaterThan(0);
    expect(screen.getByText("debug export")).toBeTruthy();
    expect(screen.getAllByText("no Ask debug").length).toBeGreaterThan(0);
    expect(screen.getByText("Blocking reason")).toBeTruthy();
    expect(screen.getByText(/Ask turn was not started/i)).toBeTruthy();
    expect(screen.getByText("Pressure admission")).toBeTruthy();
    expect(screen.getByText(/local bypass:/i)).toBeTruthy();
    expect(screen.getByText("Voice checkpoint")).toBeTruthy();
    expect(screen.getByText(/latest packet did not request a voice callout/i)).toBeTruthy();
    expect(screen.getByTestId("stage-play-mail-journey-rail")).toBeTruthy();
    expect(screen.getByTestId("stage-play-mail-journey-packet")).toBeTruthy();
    expect(screen.getByTestId("stage-play-mail-journey-moving-box")).toBeTruthy();
    expect(screen.getByText("Mail journey")).toBeTruthy();
    expect(screen.getAllByTestId("stage-play-mail-journey-station")).toHaveLength(7);
    expect(screen.getAllByTestId("stage-play-mail-journey-reasoner").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Original observation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Minecraft shade mail").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Micro-reasoner deck").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Processed packet").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Helix Ask handoff").length).toBeGreaterThan(0);
    const bridgeButton = await screen.findByTestId("stage-play-open-wake-in-ask");
    expect(bridgeButton).toBeEnabled();
    expect(bridgeButton).toHaveTextContent("Open pressure-deferred interrupt");

    await waitFor(() => {
      expect(promptEvents.length).toBeGreaterThan(0);
    });
    const question = String(promptEvents[0]?.detail?.question ?? "");
    expect(promptEvents[0]?.detail).toMatchObject({
      autoSubmit: true,
      panelId: "stage-play-badge-graph",
      forceReasoningDispatch: true,
      suppressWorkstationPayloadActions: true,
    });
    expect(promptEvents[0]?.detail?.routeMetadata).toMatchObject({
      schema: "helix.ask.route_metadata.v1",
      source: "stage_play_mail_wake",
      wakeRequestId: "stage_play_live_source_mail_wake:auto-pressure-after-timeout-ui",
      requiredPhase: "read_mailbox",
      requiredToolFamily: "live_source_mail",
      source_target_intent: expect.objectContaining({
        target_source: "live_source_mailbox",
        strength: "hard",
        wakeRequestId: "stage_play_live_source_mail_wake:auto-pressure-after-timeout-ui",
        mandatoryNextTool: "live_env.read_live_source_mail",
      }),
      mandatory_next_tool: expect.objectContaining({
        tool_name: "live_env.read_live_source_mail",
        terminal_forbidden: true,
      }),
    });
    expect(question).not.toContain("Use live_env.read_live_source_mail");
    expect(question).not.toContain("live_env.record_live_source_mail_decision");
    expect(question).not.toContain("This is a constrained mailbox wake turn, not a generic workspace/docs turn.");
    expect(question).not.toContain("Wake request: stage_play_live_source_mail_wake:auto-pressure-after-timeout-ui");
    expect(question).not.toContain("UI bridge reason: backend wake admission deferred for pressure, opening visible Helix Ask wake as a manual override");
    expect(question).toContain("Review the latest Stage Play live-source mailbox finding.");
    expect(question).toContain("Use the structured mailbox route metadata attached to this turn");
  });

  it("bridges a waiting UI-handoff wake even when an older wake result exists", async () => {
    const promptEvents: CustomEvent[] = [];
    window.addEventListener("helix-ask:prompt", ((event: Event) => {
      promptEvents.push(event as CustomEvent);
    }) as EventListener);

    renderPanel({
      mailboxResponse: {
        ok: true,
        schema: "stage_play_live_source_mail_list_response/v1",
        requestedThreadId: "helix-ask:desktop",
        mailboxThreadId: "helix-ask:desktop",
        mailboxThreadResolution: {
          schema: "stage_play_live_source_mailbox_thread_resolution/v1",
          askThreadId: "helix-ask:desktop",
          requestedThreadId: "helix-ask:desktop",
          mailboxThreadId: "helix-ask:desktop",
          reason: "explicit_mailbox_thread",
          candidateThreadIds: ["helix-ask:desktop"],
          aliasRecorded: false,
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        },
        wakeAdmissionCycle: {
          schema: "stage_play_live_source_mail_wake_admission_cycle/v1",
          now: "2026-06-02T00:00:08.000Z",
          queuedWakeIds: ["stage_play_live_source_mail_wake:waiting-ui"],
          runnableWakeIds: [],
          runningWakeIds: [],
          deferredWakeIds: [],
          result: null,
          status: "waiting_for_ui_handoff",
          reason: "wake_ui_handoff_required",
          continuation: {
            scheduled: false,
            reason: "no_runnable_wake_remaining",
            runnableWakeIds: [],
          },
          runtimeAdmission: null,
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        },
        mailItems: [{
          artifactId: "stage_play_live_source_mail_item",
          schemaVersion: "stage_play_live_source_mail_item/v1",
          mailId: "stage_play_live_source_mail:waiting-ui",
          threadId: "helix-ask:desktop",
          roomId: "room:minecraft",
          environmentId: "live_env:minecraft",
          sourceId: "source:visual-tab",
          sourceKind: "visual_frame",
          sourceRefs: {
            sourceId: "source:visual-tab",
            frameRef: "visual_frame:waiting-ui",
            evidenceRef: "visual_evidence:waiting-ui",
            observationRef: null,
          },
          summary: {
            text: "Minecraft urgent visual finding is waiting for Ask handoff.",
            preview: "Minecraft urgent visual finding is waiting for Ask handoff.",
            confidence: 0.82,
            analysisState: "analysis_ready",
          },
          priorContext: {
            previousMailId: null,
            previousEvidenceRef: null,
            previousSummaryPreview: null,
          },
          hints: {
            deterministicChangeHint: "summary_changed",
            elapsedMsSincePrevious: 10000,
            sourceFreshness: "fresh",
          },
          status: "unread",
          evidenceRefs: ["visual_frame:waiting-ui", "visual_evidence:waiting-ui"],
          createdAt: "2026-06-02T00:00:07.000Z",
          updatedAt: "2026-06-02T00:00:07.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        }],
        jobStates: [],
        watchJobPolicies: [],
        interpreterProfiles: [],
        interpreterProfileComparisons: [],
        microReasonerPrompts: [],
        visualObserverProfiles: [],
        activeVisualObserverProfile: null,
        microReasonerRuns: [],
        processedMailPackets: [],
        decisions: [],
        narrativeStates: [],
        wakeRequests: [
          {
            artifactId: "stage_play_live_source_mail_wake_request",
            schemaVersion: "stage_play_live_source_mail_wake_request/v1",
            wakeRequestId: "stage_play_live_source_mail_wake:old-expired-ui",
            threadId: "helix-ask:desktop",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            jobId: "stage_play_live_source_job:ui",
            mailIds: ["stage_play_live_source_mail:old-expired-ui"],
            sourceIds: ["source:visual-tab"],
            reason: "unread_mail",
            status: "expired_stale",
            askTurnId: null,
            askLaunchStatus: "not_started",
            decisionIds: [],
            attemptCount: 1,
            lastAttemptAt: "2026-06-02T00:00:01.000Z",
            nextRetryAt: null,
            failureReason: "wake_relevance_ttl_expired",
            lifecycleStage: "expired",
            lifecycleReason: "wake_relevance_ttl_expired",
            evidenceRefs: ["stage_play_live_source_mail:old-expired-ui"],
            queuedAt: "2026-06-02T00:00:01.000Z",
            updatedAt: "2026-06-02T00:00:05.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
          {
            artifactId: "stage_play_live_source_mail_wake_request",
            schemaVersion: "stage_play_live_source_mail_wake_request/v1",
            wakeRequestId: "stage_play_live_source_mail_wake:waiting-ui",
            threadId: "helix-ask:desktop",
            roomId: "room:minecraft",
            environmentId: "live_env:minecraft",
            jobId: "stage_play_live_source_job:ui",
            mailIds: ["stage_play_live_source_mail:waiting-ui"],
            sourceIds: ["source:visual-tab"],
            reason: "unread_mail",
            status: "waiting_for_ui_handoff",
            askTurnId: null,
            askLaunchStatus: "not_started",
            decisionIds: [],
            attemptCount: 0,
            lastAttemptAt: null,
            nextRetryAt: null,
            failureReason: null,
            lifecycleStage: "waiting_for_ui_handoff",
            lifecycleReason: "ui_handoff_required",
            evidenceRefs: ["stage_play_live_source_mail:waiting-ui", "visual_evidence:waiting-ui"],
            queuedAt: "2026-06-02T00:00:07.000Z",
            updatedAt: "2026-06-02T00:00:08.000Z",
            assistant_answer: false,
            terminal_eligible: false,
            context_role: "tool_evidence",
            raw_content_included: false,
          },
        ],
        wakeResults: [{
          artifactId: "stage_play_live_source_mail_wake_result",
          schemaVersion: "stage_play_live_source_mail_wake_result/v1",
          wakeResultId: "stage_play_live_source_mail_wake_result:old-expired-ui",
          wakeRequestId: "stage_play_live_source_mail_wake:old-expired-ui",
          threadId: "helix-ask:desktop",
          roomId: "room:minecraft",
          environmentId: "live_env:minecraft",
          status: "expired_stale",
          askTurnId: null,
          decisionIds: [],
          voiceCheckpointRefs: [],
          skippedReason: null,
          failedReason: "wake_relevance_ttl_expired",
          lifecycleStage: "expired",
          lifecycleReason: "wake_relevance_ttl_expired",
          evidenceRefs: ["stage_play_live_source_mail:old-expired-ui"],
          createdAt: "2026-06-02T00:00:05.000Z",
          assistant_answer: false,
          terminal_eligible: false,
          context_role: "tool_evidence",
          raw_content_included: false,
        }],
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "tool_evidence",
        raw_content_included: false,
      },
    });

    const bridgeButton = await screen.findByTestId("stage-play-open-wake-in-ask");
    expect(bridgeButton).toBeEnabled();
    expect(bridgeButton).toHaveTextContent("Open queued interrupt in Helix Ask");

    await waitFor(() => {
      expect(promptEvents.length).toBeGreaterThan(0);
    });
    expect(promptEvents[0]?.detail?.routeMetadata).toMatchObject({
      invocationKind: "stage_play_mail_wake",
      sourceTarget: "live_source_mailbox",
      wakeRequestId: "stage_play_live_source_mail_wake:waiting-ui",
    });
  });

  it("copies a unified mail-loop trace for paths that never reach final answers", async () => {
    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderPanel();

    expect(await screen.findByTestId("stage-play-mail-loop-live-overview")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("stage-play-copy-mail-loop-unified-trace"));

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = JSON.parse(String(writeText.mock.calls[0]?.[0] ?? "{}")) as Record<string, any>;
    expect(copied).toMatchObject({
      schema: "helix.stage_play.mail_loop_unified_trace.v1",
      authority: {
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "tool_evidence",
      },
      latest: {
        wakeFailureReason: "runtime_memory_queue_deferrable",
        wakeAskTurnId: null,
      },
      pressure: {
        admissionReason: "runtime_pressure",
        runtimeAdmission: expect.objectContaining({
          reason: "runtime_memory_queue_deferrable",
        }),
      },
    });
    expect(copied.counts.wakeRequests).toBeGreaterThan(0);
    expect(copied.terminalCoverage.some((entry: any) =>
      entry.status === "deferred_for_pressure" &&
      entry.reachedAsk === false &&
      entry.failure === "runtime_memory_queue_deferrable"
    )).toBe(true);
    expect(copied.events.some((entry: any) =>
      entry.stage === "wake_result" &&
      entry.status === "deferred_for_pressure" &&
      entry.askTurnId === null
    )).toBe(true);
    expect(await screen.findByTestId("stage-play-mail-loop-debug-copy-state")).toHaveTextContent("unified trace copied");

    fireEvent.click(await screen.findByTestId("stage-play-copy-mail-loop-packet-trace"));
    expect(writeText).toHaveBeenCalledTimes(2);
    const packetTrace = JSON.parse(String(writeText.mock.calls[1]?.[0] ?? "{}")) as Record<string, any>;
    expect(packetTrace).toMatchObject({
      schema: "helix.stage_play.packet_trace.v1",
      authority: {
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "tool_evidence",
      },
      deck: expect.objectContaining({
        presetId: null,
        title: null,
        runPlan: null,
      }),
      wake: expect.objectContaining({
        wakeRequestId: "stage_play_live_source_mail_wake:auto-pressure-after-timeout-ui",
        status: "deferred_for_pressure",
        askTurnId: null,
      }),
      result: expect.objectContaining({
        wakeResultId: "stage_play_live_source_mail_wake_result:auto-pressure-after-timeout-ui",
        status: "deferred_for_pressure",
        askTurnId: null,
      }),
      continuationState: expect.objectContaining({
        wakeAdmissionStatus: "deferred_for_pressure",
      }),
    });
    expect(packetTrace.rawVisualMail.map((entry: any) => entry.mailId)).toContain("stage_play_live_source_mail:ui");
    expect(packetTrace.rawVisualMail[0]?.visualEvidenceRefs).toEqual(expect.arrayContaining([
      "visual_frame:ui",
      "visual_evidence:ui",
      "live_source_observation:ui",
    ]));
    expect(packetTrace.processedPacket).toBeNull();
    expect(await screen.findByTestId("stage-play-mail-loop-debug-copy-state")).toHaveTextContent("packet trace copied");

    fireEvent.click(await screen.findByTestId("stage-play-copy-mail-loop-wake-trace"));
    expect(writeText).toHaveBeenCalledTimes(3);
    const wakeTrace = JSON.parse(String(writeText.mock.calls[2]?.[0] ?? "{}")) as Record<string, any>;
    expect(wakeTrace).toMatchObject({
      schema: "helix.stage_play.wake_trace.v1",
      wakeRequestId: "stage_play_live_source_mail_wake:auto-pressure-after-timeout-ui",
      wake: expect.objectContaining({
        status: "deferred_for_pressure",
        askTurnId: null,
      }),
      continuationState: expect.objectContaining({
        wakeAdmissionStatus: "deferred_for_pressure",
      }),
      authority: {
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "tool_evidence",
      },
    });
    expect(wakeTrace.mailIds).toContain("stage_play_live_source_mail:ui");
    expect(wakeTrace.wakeResults.some((entry: any) =>
      entry.wakeResultId === "stage_play_live_source_mail_wake_result:auto-pressure-after-timeout-ui"
    )).toBe(true);
    expect(await screen.findByTestId("stage-play-mail-loop-debug-copy-state")).toHaveTextContent("interrupt trace copied");

    fireEvent.click(await screen.findByTestId("stage-play-copy-mail-loop-ask-debug"));
    expect(writeText).toHaveBeenCalledTimes(4);
    const askDebugTrace = JSON.parse(String(writeText.mock.calls[3]?.[0] ?? "{}")) as Record<string, any>;
    expect(askDebugTrace).toMatchObject({
      schema: "helix.stage_play.ask_debug_trace.v1",
      wakeRequestId: "stage_play_live_source_mail_wake:auto-pressure-after-timeout-ui",
      askTurnId: null,
      failureCode: "runtime_memory_queue_deferrable",
      authority: {
        assistant_answer: false,
        terminal_eligible: false,
        context_role: "debug_trace",
      },
    });
    expect(askDebugTrace.wakeTrace.wakeRequestId).toBe("stage_play_live_source_mail_wake:auto-pressure-after-timeout-ui");
    expect(await screen.findByTestId("stage-play-mail-loop-debug-copy-state")).toHaveTextContent("Ask debug copied");

    fireEvent.click(await screen.findByTestId("stage-play-copy-mail-loop-full-state"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(5));
    const fullLoopState = JSON.parse(String(writeText.mock.calls[4]?.[0] ?? "{}")) as Record<string, any>;
    expect(fullLoopState).toMatchObject({
      schema: "helix.stage_play.mail_loop_full_mailbox_capture.v1",
      graphId: "stage_play_badge_graph:ui-fixture",
    });
    expect(await screen.findByTestId("stage-play-mail-loop-debug-copy-state")).toHaveTextContent("full mailbox copied");
  });

  it("renders the Theory-style shell with Stage Play badge semantics", async () => {
    renderPanel();
    await showFullGraph();

    expect(await screen.findByTestId("stage-play-badge-graph-scrollport")).toBeTruthy();
    expect(screen.getByTestId("stage-play-tool-activity-strip")).toBeTruthy();
    expect(screen.getByText("Latest reflect_stage_play_context")).toBeTruthy();
    expect(screen.getByText("16 badges")).toBeTruthy();
    expect(screen.getAllByText(/Context feed index/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/query actuators policy-bound/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/AgentGoalSession feeds -> query policy index/i).length).toBeGreaterThan(0);
    expect(screen.getByText("0 missing checks")).toBeTruthy();
    expect(screen.getByText(/checkpoint queue: Meaningful Perturbation \/ queued/i)).toBeTruthy();
    expect(screen.getByTestId("stage-play-run-checkpoint")).toBeTruthy();
    const promptEvents: CustomEvent[] = [];
    window.addEventListener("helix-ask:prompt", ((event: Event) => {
      promptEvents.push(event as CustomEvent);
    }) as EventListener);
    fireEvent.click(screen.getByTestId("stage-play-run-checkpoint"));
    await waitFor(() => {
      const checkpointQueueBody = fetchJsonBodies("/api/helix/stage-play/checkpoint-queue/action").at(-1);
      expect(checkpointQueueBody).toEqual(expect.objectContaining({
        jobId: "stage_play_job:ui",
        checkpointRequestId: "stage_play_checkpoint_request:ui",
        action: "run",
      }));
      expect(promptEvents).toHaveLength(1);
    });
    expect(promptEvents[0]?.detail).toMatchObject({
      autoSubmit: true,
      panelId: "stage-play-badge-graph",
      forceReasoningDispatch: true,
      suppressWorkstationPayloadActions: true,
    });
    expect(String(promptEvents[0]?.detail?.question)).toContain("Use the Stage Play reflection capability live_env.reflect_stage_play_context");
    expect(String(promptEvents[0]?.detail?.question)).toContain("Reflect the active Stage Play Badge Graph");
    expect(String(promptEvents[0]?.detail?.question)).toContain("stage_play_checkpoint_request:ui");
    expect(String(promptEvents[0]?.detail?.question)).toContain("Leave visual/audio capture cadence unchanged.");
    expect(screen.getByTestId("stage-play-lane-observer")).toBeTruthy();
    expect(screen.getByTestId("stage-play-lane-compact_observation")).toBeTruthy();
    expect(screen.getByTestId("stage-play-lane-stage_bounds")).toBeTruthy();
    expect(screen.getByTestId("stage-play-lane-affordances_missing_checks")).toBeTruthy();
    expect(screen.getByTestId("stage-play-lane-procedural_bindings")).toBeTruthy();
    expect(screen.getByTestId("stage-play-lane-helix_ask_checkpoint")).toBeTruthy();
    expect(screen.getByTestId("stage-play-lane-answer_snapshot")).toBeTruthy();
    expect(screen.getByTestId("stage-play-lane-validation_feedback")).toBeTruthy();
    expect(screen.getByTestId("stage-play-lane-live_voice_output")).toBeTruthy();
    expect(screen.getAllByTestId("stage-play-data-tray").length).toBeGreaterThanOrEqual(12);
    expect(screen.getByText(/visual frame active - latest scene summary available/i)).toBeTruthy();
    expect(screen.getAllByText(/Minecraft-like scene with character/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/confidence 0\.76/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/solver completed; model reviewed/i)).toBeTruthy();
    expect(screen.getByText(/route authority passed/i)).toBeTruthy();
    expect(screen.getByText(/stage_play_checkpoint_request:ui status: queued/i)).toBeTruthy();
    expect(screen.getAllByText(/Hold position until the next observation confirms the scene/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/model reviewed/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/risk, possibilities, unknowns, next_check/i).length).toBeGreaterThan(0);
    const nodeSlots = screen.getAllByTestId("stage-play-node-slot");
    const occupiedSlots = nodeSlots.map((slot) => `${slot.style.left}:${slot.style.top}`);
    expect(new Set(occupiedSlots).size).toBe(occupiedSlots.length);
    expect(screen.getAllByTestId("stage-play-output-node").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("stage-play-binding-overlay")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open Stage Play console" }));
    expect(screen.getByTestId("stage-play-binding-overlay")).toBeTruthy();
    expect(await screen.findByTestId("stage-play-builder-artifacts")).toBeTruthy();
    const overlay = screen.getByTestId("stage-play-binding-overlay");
    const overlayText = overlay.textContent ?? "";
    expect(overlayText.indexOf("Builder Palette")).toBeLessThan(overlayText.indexOf("Tool assembly"));
    expect(overlayText.indexOf("Tool assembly")).toBeLessThan(overlayText.indexOf("Source handles"));
    expect(screen.getByText("stage_play_builder_catalog/v1")).toBeTruthy();
    expect(screen.getByText("stage_play_source_query/v1")).toBeTruthy();
    expect(screen.getByText("stage_play_graph_draft_validation/v1")).toBeTruthy();
    expect(screen.getAllByText("Builder Palette").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Observer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Fusion\b/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Intent Module/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Procedure/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close Stage Play console" }));
    fireEvent.click(screen.getByRole("button", { name: "Observer" }));
    expect(screen.getByTestId("stage-play-observer-node-controls")).toBeTruthy();
    expect(screen.getByText("Observer Source Routes")).toBeTruthy();
    expect(screen.getAllByText("visual frame").length).toBeGreaterThan(0);
    expect(screen.getAllByText("audio transcript").length).toBeGreaterThan(0);
    expect(screen.getByTestId("stage-play-project-live-answer")).toBeTruthy();
    fireEvent.click(screen.getByTestId("stage-play-project-live-answer"));
    const observerProjectionText = (await screen.findByTestId("stage-play-tool-activity-strip")).textContent ?? "";
    expect(observerProjectionText).toMatch(
      /Projected 4 interpretation lanes: risk, possibilities, unknowns, next_check/i,
    );
    expect(observerProjectionText).toMatch(/Checkpoint-only: checkpoint recommendation, answer snapshot, voice output/i);
    expect(fetchJsonBodies("/api/helix/stage-play/project-live-answer").at(-1)).toEqual(expect.objectContaining({
      ensureStagePlayLineSchema: true,
      createIfMissing: true,
      preferredPreset: "minecraft_run_monitor",
    }));
    fireEvent.click(screen.getAllByRole("button", { name: "Use for Stage Play" })[0]);
    await waitFor(() => {
      expect(fetchJsonBodies("/api/helix/stage-play/source-route").at(-1)).toEqual(expect.objectContaining({
        threadId: "helix-ask:desktop",
        sourceId: "source:visual-tab",
        modality: "visual_frame",
        routeTo: "visual_context",
        selectedForStagePlay: true,
      }));
    });
    expect(screen.queryByTestId("stage-play-draft-parameter-editor")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Defensive Retreat Barrier" })[0]);

    expect(screen.getByTestId("stage-play-binding-overlay")).toBeTruthy();
    expect(screen.getByTestId("stage-play-procedural-binding-node-controls")).toBeTruthy();
    expect(screen.getByText("Procedural Binding")).toBeTruthy();
    expect(screen.getAllByText(/retreat \+ intent.move_away \+ intent.maintain_line_of_sight \+ intent.place_block/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Admission")).toBeTruthy();
    expect(screen.getAllByText(/Candidate: retreat while tracking threat/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/agent executable: false/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /execute|run command|auto move|auto place/i })).toBeNull();
  });

  it("runs the current graph checkpoint request before stale queued requests", async () => {
    const baseGraph = buildFixture();
    const baseRequest = baseGraph.checkpointRequests[0];
    const staleRequest = {
      ...baseRequest,
      checkpointRequestId: "stage_play_checkpoint_request:stale",
      graphId: "stage_play_badge_graph:stale",
      currentGraphRefs: ["stage_play_badge_graph:stale"],
      reason: "first_usable_observation" as const,
      question: "A stale first observation should not drive the current checkpoint.",
      status: "queued" as const,
    };
    const currentRequest = {
      ...baseRequest,
      checkpointRequestId: "stage_play_checkpoint_request:current",
      graphId: baseGraph.graphId,
      currentGraphRefs: [baseGraph.graphId],
      reason: "meaningful_perturbation" as const,
      question: "Current visual-source graph has a meaningful perturbation; review the active checkpoint.",
      status: "queued" as const,
    };
    renderPanel({
      graph: {
        ...baseGraph,
        checkpointRequests: [staleRequest, currentRequest],
      },
    });
    await showFullGraph();

    expect(await screen.findByText(/checkpoint queue: Meaningful Perturbation \/ queued/i)).toBeTruthy();
    const promptEvents: CustomEvent[] = [];
    window.addEventListener("helix-ask:prompt", ((event: Event) => {
      promptEvents.push(event as CustomEvent);
    }) as EventListener);
    fireEvent.click(screen.getByTestId("stage-play-run-checkpoint"));
    await waitFor(() => {
      const checkpointQueueBody = fetchJsonBodies("/api/helix/stage-play/checkpoint-queue/action").at(-1);
      expect(checkpointQueueBody).toEqual(expect.objectContaining({
        jobId: "stage_play_job:ui",
        checkpointRequestId: "stage_play_checkpoint_request:current",
        action: "run",
      }));
      expect(promptEvents).toHaveLength(1);
    });
    expect(String(promptEvents[0]?.detail?.question)).toContain("stage_play_checkpoint_request:current");
    expect(String(promptEvents[0]?.detail?.question)).not.toContain("stage_play_checkpoint_request:stale");
  });

  it("shows Observer controls in the Stage Console inspector when Observer is selected", async () => {
    useStagePlayBadgeGraphPanelStore.setState({
      selectedBadgeId: "observer.live_sources",
      selectedBadgeIds: ["observer.live_sources"],
    });
    renderPanel();
    await showFullGraph();

    await screen.findByTestId("stage-play-badge-graph-scrollport");
    fireEvent.click(screen.getByRole("button", { name: "Open Stage Play console" }));

    expect(screen.getByTestId("stage-play-binding-overlay")).toBeTruthy();
    expect(screen.getAllByText("Observer Source Routes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Source Setup").length).toBeGreaterThan(0);
  });

  it("shows source route controls when a Source node is selected", async () => {
    renderPanel();
    await showFullGraph();

    fireEvent.click(await screen.findByRole("button", { name: "Visual Tab Source" }));

    expect(screen.getByTestId("stage-play-source-node-controls")).toBeTruthy();
    expect(screen.getByText("Data Flow")).toBeTruthy();
    expect(screen.getAllByText("Visual frame producer / source descriptor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("active -> visual_frame:ui").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("stage-play-copy-data-flow-refs").length).toBeGreaterThan(0);
    expect(screen.getByText("Source Route Controls")).toBeTruthy();
    expect(screen.getByText("Route to Narrative")).toBeTruthy();
    expect(screen.getByText("Review source evidence")).toBeTruthy();
    expect(screen.getByText("Open raw buffer preview")).toBeTruthy();
    fireEvent.click(screen.getByText("Route to Narrative"));
    await waitFor(() => {
      expect(fetchJsonBodies("/api/helix/stage-play/source-route").at(-1)).toEqual(expect.objectContaining({
        threadId: "helix-ask:desktop",
        sourceId: "source:visual-tab",
        modality: "visual_frame",
        routeTo: "narrative_stage_play",
        selectedForStagePlay: true,
      }));
    });
    expect(screen.queryByTestId("stage-play-draft-parameter-editor")).toBeNull();
  });

  it("shows goal-context tool identity in the selected badge data flow", async () => {
    renderPanel();
    await showFullGraph();

    const contextFeedButtons = await screen.findAllByRole("button", { name: /Context feed index/i });
    fireEvent.click(contextFeedButtons[0]);

    expect(screen.getByText("Data Flow")).toBeTruthy();
    const toolIdentity = screen.getByTestId("stage-play-data-flow-tool-identity");
    expect(toolIdentity).toHaveTextContent(/query_translation_segments -> live_env\.query_translation_segments/i);
    expect(toolIdentity).toHaveTextContent(/matched query_translation_segments/i);
    expect(toolIdentity).toHaveTextContent(/requested_tool:query_translation_segments/i);
    expect(toolIdentity).toHaveTextContent(/canonical_tool:live_env\.query_translation_segments/i);
    expect(toolIdentity).toHaveTextContent(/matched_actuator:query_translation_segments/i);
    expect(toolIdentity).toHaveTextContent(/agent_goal_allowed_actuator:query_translation_segments/i);
  });

  it("switches the Stage Console to node-specific interaction surfaces", async () => {
    renderPanel();
    await showFullGraph();

    fireEvent.click(await screen.findByRole("button", { name: "Latest Compact Observation" }));
    expect(screen.getByTestId("stage-play-binding-overlay")).toBeTruthy();
    expect(screen.getByTestId("stage-play-compact-observation-node-controls")).toBeTruthy();
    expect(screen.getByText("Data Flow")).toBeTruthy();
    expect(screen.getAllByText("visual frame analyze -> compact evidence").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Minecraft-like scene with character/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Compact Observation Evidence")).toBeTruthy();
    expect(screen.getByText("Evidence Refs")).toBeTruthy();
    expect(screen.getByText("Audit Links")).toBeTruthy();
    expect(screen.getByText("Open raw buffer preview")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Latest Ask Checkpoint" }));
    expect(screen.getByTestId("stage-play-ask-checkpoint-node-controls")).toBeTruthy();
    expect(screen.getByText("Helix Ask Checkpoint")).toBeTruthy();
    expect(screen.getByText("Ask Prompt")).toBeTruthy();
    expect(screen.getByText("Tool Observation")).toBeTruthy();
    expect(screen.getByText("Solver / Debug Status")).toBeTruthy();
    expect(screen.getByText(/Raw prompt text is not embedded/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Latest Answer Snapshot" }));
    expect(screen.getByTestId("stage-play-answer-snapshot-node-controls")).toBeTruthy();
    expect(screen.getByText("Upheld Answer")).toBeTruthy();
    expect(screen.getAllByText(/Hold position until the next observation confirms the scene/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Source Refs")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Current Live Output" }));
    expect(screen.getByTestId("stage-play-live-output-node-controls")).toBeTruthy();
    expect(screen.getByText("output lane reducer")).toBeTruthy();
    expect(screen.getAllByText("recommendation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("answer snapshot").length).toBeGreaterThan(0);
    expect(screen.getAllByText("voice output").length).toBeGreaterThan(0);
    expect(screen.getByText("Projection State")).toBeTruthy();
    expect(screen.getByText("Voice Boundary")).toBeTruthy();
    expect(screen.getByText("Output Text")).toBeTruthy();
    expect(screen.getByText(/Voice eligible:/i)).toBeTruthy();
    expect(screen.getByText(/Answer snapshot citation:/i)).toBeTruthy();
    expect(screen.getByTestId("stage-play-voice-boundary-locked")).toBeTruthy();
    expect(screen.queryByTestId("stage-play-speak-reviewed-answer")).toBeNull();
    expect(screen.getAllByText(/Project Stage Play possibilities into Live Answer/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Terminal Authority" }));
    expect(screen.getByTestId("stage-play-terminal-authority-node-controls")).toBeTruthy();
    expect(screen.getAllByText("Terminal Authority").length).toBeGreaterThan(0);
    expect(screen.getByText("Terminal Boundary")).toBeTruthy();
    expect(screen.getByTestId("stage-play-terminal-authority-boundary")).toHaveTextContent(/completed solver path selects terminal answer/i);
    expect(screen.getByTestId("stage-play-terminal-authority-skipped-sources")).toHaveTextContent(/goal context updates/i);
    expect(screen.getByTestId("stage-play-terminal-authority-skipped-sources")).toHaveTextContent(/workstation control receipts/i);
    expect(screen.getByTestId("stage-play-terminal-authority-skipped-sources")).toHaveTextContent(/microdeck outputs/i);
    expect(screen.getByTestId("stage-play-terminal-authority-skipped-sources")).toHaveTextContent(/narrator events/i);
    expect(screen.getByTestId("stage-play-terminal-authority-skipped-sources")).toHaveTextContent(/panel projections/i);
    expect(screen.getByText("Authority Refs")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Current Voice Output" }));
    expect(screen.getByTestId("stage-play-voice-output-node-controls")).toBeTruthy();
    expect(screen.getByText("Voice Boundary")).toBeTruthy();
    expect(screen.getAllByText(/answer_snapshot\.latest/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("stage-play-speak-reviewed-answer")).toBeTruthy();
    expect(screen.queryByTestId("stage-play-voice-boundary-locked")).toBeNull();
  });

  it("projects from the Interpreter node and Live Answer output node controls", async () => {
    renderPanel();
    await showFullGraph();

    await screen.findByTestId("stage-play-badge-graph-scrollport");
    fireEvent.click(screen.getByTestId("stage-play-project-live-answer-interpreter"));

    const interpreterProjectionText = (await screen.findByTestId("stage-play-tool-activity-strip")).textContent ?? "";
    expect(interpreterProjectionText).toMatch(
      /Projected 4 interpretation lanes: risk, possibilities, unknowns, next_check/i,
    );
    expect(interpreterProjectionText).toMatch(/Checkpoint-only: checkpoint recommendation, answer snapshot, voice output/i);

    fireEvent.click(screen.getByRole("button", { name: "Stage Play interpreter" }));
    expect(screen.getByText("Live Interpretation Projection")).toBeTruthy();
    expect(screen.getByTestId("stage-play-project-live-answer-inspector")).toBeTruthy();

    fireEvent.click(screen.getByTestId("stage-play-project-live-answer-output"));
    expect(fetchJsonBodies("/api/helix/stage-play/project-live-answer").length).toBeGreaterThanOrEqual(2);
  });

  it("starts visual source setup through the visual producer from the Observer panel", async () => {
    const stream = {
      getVideoTracks: () => [],
      getTracks: () => [{ readyState: "live", stop: vi.fn(), addEventListener: vi.fn() }],
    } as unknown as MediaStream;
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn(async () => stream),
      },
    });
    visualProducerMock.startVisualFrameProducerInterval.mockClear();

    renderPanel();
    await showFullGraph();

    fireEvent.click(await screen.findByRole("button", { name: "Observer" }));
    expect(screen.getByTestId("stage-play-observer-node-controls")).toBeTruthy();
    expect(screen.getByText("Source Setup")).toBeTruthy();
    expect(screen.getByText("Narrative test defaults")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "30s" }));
    fireEvent.click(screen.getByRole("button", { name: "Capture browser tab visual" }));

    expect(await screen.findByText(/browser tab visual interval active every 30s/i)).toBeTruthy();
    expect(visualProducerMock.startVisualFrameProducerInterval).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "source:visual-tab",
      threadId: "helix-ask:desktop",
      cadenceMs: 30000,
    }));
    expect(screen.getByTestId("stage-play-draft-parameter-editor")).toBeTruthy();
    expect(screen.getByDisplayValue("start_visual_interval")).toBeTruthy();
    expect(screen.getAllByDisplayValue("narrative_stage_play").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("session_ttl")).toBeTruthy();
  });

  it("opens Observer source setup when the graph Observer badge is clicked", async () => {
    renderPanel();
    await showFullGraph();

    expect(screen.queryByTestId("stage-play-binding-overlay")).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Observer" }));

    expect(screen.getByTestId("stage-play-binding-overlay")).toBeTruthy();
    expect(screen.getByTestId("stage-play-observer-node-controls")).toBeTruthy();
    expect(screen.getByText("Source Setup")).toBeTruthy();
    expect(screen.getByText("Observer Source Routes")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Capture browser tab visual" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Attach browser audio transcript" })).toBeTruthy();
  });

  it("opens raw buffer previews from Observer source evidence without graph ownership", async () => {
    renderPanel();
    await showFullGraph();

    fireEvent.click(await screen.findByRole("button", { name: "Observer" }));
    expect(screen.getByTestId("stage-play-observer-node-controls")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Open raw buffer preview" })[0]);

    expect(await screen.findByText("Source Evidence Audit")).toBeTruthy();
    expect(await screen.findByText("Compact preview of the captured frame.")).toBeTruthy();
    expect(screen.getAllByText("stage_play_raw_session_buffer_entry:ui").length).toBeGreaterThan(0);
    expect(screen.getByText("audit buffer, not graph")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Clear raw buffer" })[0]);
    expect(await screen.findByText(/Cleared raw buffer entries for source:visual-tab/i)).toBeTruthy();
    expect(fetchCallUrls().some((url) => url.includes("/api/helix/stage-play/raw-session-buffer/clear"))).toBe(true);
  });

  it("adds matching live nodes from the builder palette into the selected trace", async () => {
    renderPanel();
    await showFullGraph();

    await screen.findByTestId("stage-play-badge-graph-scrollport");
    fireEvent.click(screen.getByRole("button", { name: "Open Stage Play console" }));

    fireEvent.click(screen.getByRole("button", { name: /Intent Module/i }));

    expect(screen.getByText("intent module evidence nodes")).toBeTruthy();
    expect(screen.getAllByText(/move_away/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/maintain_line_of_sight/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/place_block/i).length).toBeGreaterThan(0);
  });

  it("drags a builder node onto the graph as a local draft node", async () => {
    renderPanel();
    await showFullGraph();

    const scrollport = await screen.findByTestId("stage-play-badge-graph-scrollport");
    Object.defineProperty(scrollport, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 900,
        bottom: 600,
        width: 900,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(scrollport, "scrollLeft", { configurable: true, value: 40 });
    Object.defineProperty(scrollport, "scrollTop", { configurable: true, value: 20 });
    scrollport.scrollBy = vi.fn();

    fireEvent.click(screen.getByRole("button", { name: "Open Stage Play console" }));
    dispatchPointer(screen.getByRole("button", { name: /Hazard/i }), "pointerdown", 120, 160);

    expect(screen.queryByTestId("stage-play-binding-overlay")).toBeNull();
    expect(screen.getByTestId("stage-play-held-builder-node")).toBeTruthy();

    dispatchPointer(window, "pointermove", 890, 590);
    expect(scrollport.scrollBy).toHaveBeenCalled();

    dispatchPointer(window, "pointerup", 240, 220);

    expect(screen.queryByTestId("stage-play-held-builder-node")).toBeNull();
    expect(screen.getByTestId("stage-play-draft-node")).toBeTruthy();
    expect(screen.getByTestId("stage-play-draft-parameter-editor")).toBeTruthy();
    expect(screen.getByDisplayValue("hazard_type")).toBeTruthy();
    expect(screen.getByDisplayValue("severity")).toBeTruthy();
    expect(screen.getByDisplayValue("radius_or_position")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove draft node" }));

    expect(screen.queryByTestId("stage-play-draft-node")).toBeNull();
    expect(screen.queryByTestId("stage-play-draft-parameter-editor")).toBeNull();
  });

  it("edits and adds local draft node parameters", async () => {
    renderPanel();
    await showFullGraph();

    const scrollport = await screen.findByTestId("stage-play-badge-graph-scrollport");
    Object.defineProperty(scrollport, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 900,
        bottom: 600,
        width: 900,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(scrollport, "scrollLeft", { configurable: true, value: 0 });
    Object.defineProperty(scrollport, "scrollTop", { configurable: true, value: 0 });
    scrollport.scrollBy = vi.fn();

    fireEvent.click(screen.getByRole("button", { name: "Open Stage Play console" }));
    dispatchPointer(screen.getByRole("button", { name: /Actor/i }), "pointerdown", 120, 160);
    dispatchPointer(window, "pointerup", 240, 220);

    expect(screen.getByTestId("stage-play-draft-parameter-editor")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Parameter value entity_id"), {
      target: { value: "player:dan" },
    });

    expect(screen.getByDisplayValue("player:dan")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));

    expect(screen.getByDisplayValue("parameter")).toBeTruthy();
  });

  it("binds a dropped source node to an active live source handle", async () => {
    renderPanel({
      descriptors: [
        {
          schema: "helix.live_source_descriptor.v1",
          descriptor_id: "live_source_descriptor:visual",
          source_id: "source:visual-tab",
          thread_id: "helix-ask:desktop",
          environment_id: "live_env:minecraft",
          modality: "visual_frame",
          user_label: "Anime tab",
          serving_context: {
            surface: "browser_tab",
            app_hint: "Chrome",
            window_title_hint: "Legend of the Galactic Heroes",
            source_origin: "browser_getDisplayMedia",
          },
          capabilities: ["frame_capture"],
          current_state: "active_interval",
          cadence_ms: 10000,
          latest_observation_refs: ["visual_observation:latest"],
          raw_content_included: false,
          assistant_answer: false,
        },
      ],
      producers: [
        {
          schema: "helix.live_source_producer.v1",
          producer_id: "live_source_producer:visual",
          source_id: "source:visual-tab",
          thread_id: "helix-ask:desktop",
          modality: "visual_frame",
          status: "active",
          cadence_ms: 10000,
          capture_mode: "interval",
          latest_chunk_id: "live_source_chunk:visual",
          next_chunk_due_at: null,
          backpressure_policy: { max_buffered_chunks: 12 },
          raw_content_policy: "ephemeral",
          assistant_answer: false,
        },
      ],
    });
    await showFullGraph();

    const scrollport = await screen.findByTestId("stage-play-badge-graph-scrollport");
    Object.defineProperty(scrollport, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 900,
        bottom: 600,
        width: 900,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(scrollport, "scrollLeft", { configurable: true, value: 0 });
    Object.defineProperty(scrollport, "scrollTop", { configurable: true, value: 0 });
    scrollport.scrollBy = vi.fn();

    fireEvent.click(screen.getByRole("button", { name: "Open Stage Play console" }));
    dispatchPointer(screen.getByRole("button", { name: /Source Class/i }), "pointerdown", 120, 160);
    dispatchPointer(window, "pointerup", 240, 220);

    expect(screen.getByTestId("stage-play-draft-parameter-editor")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Source class"), {
      target: { value: "visual_frame" },
    });
    expect(screen.getByDisplayValue("visual_frame")).toBeTruthy();

    const activeSource = await screen.findByRole("button", { name: /Anime tab/i });
    fireEvent.click(activeSource);

    expect(screen.getByDisplayValue("source:visual-tab")).toBeTruthy();
    expect(screen.getByDisplayValue("live_source_descriptor:visual")).toBeTruthy();
    expect(screen.getByDisplayValue("live_source_producer:visual")).toBeTruthy();
    expect(screen.getByDisplayValue("visual_observation:latest")).toBeTruthy();
    expect(await screen.findByText("Draft accepted")).toBeTruthy();
    expect(screen.getByText(/Resolved source: source:visual-tab/i)).toBeTruthy();
  });

  it("lets the bindings overlay close and reopen without removing the graph", async () => {
    renderPanel();
    await showFullGraph();

    expect(await screen.findByTestId("stage-play-badge-graph-scrollport")).toBeTruthy();
    expect(screen.queryByTestId("stage-play-binding-overlay")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open Stage Play console" }));
    expect(screen.getByTestId("stage-play-binding-overlay")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close Stage Play console" }));

    expect(screen.queryByTestId("stage-play-binding-overlay")).toBeNull();
    expect(screen.getByTestId("stage-play-badge-graph-scrollport")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open Stage Play console" }));

    expect(screen.getByTestId("stage-play-binding-overlay")).toBeTruthy();
    fireEvent.click(screen.getByTestId("stage-play-observer-mail-loop-toggle"));

    expect(screen.queryByTestId("stage-play-binding-overlay")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open Stage Play console" })).toBeNull();
  });

  it("requests the transient graph with live thread, room, and environment identifiers", async () => {
    useLiveAnswerEnvironmentStore.setState({
      environmentByThread: {
        "helix-ask:desktop": {
          schema: "helix.live_answer_environment.v1",
          environment_id: "live_env:ui",
          thread_id: "helix-ask:desktop",
          created_turn_id: "turn:ui",
          objective: "Reflect live world bounds.",
          room_id: "room:minecraft-env",
          source_ids: [],
          graph_id: null,
          status: "active",
          mode: "text_only",
          preset: "minecraft",
          line_keys: [],
          active_lines: [],
          token_budget: 0,
          evidence_refs: [],
          created_at: "2026-06-02T00:00:00.000Z",
          updated_at: "2026-06-02T00:00:00.000Z",
          context_role: "tool_evidence",
          terminal_eligible: false,
          post_tool_model_step_required: true,
          assistant_answer: false,
          raw_content_included: false,
          deterministic_content_role: "observation_not_assistant_answer",
        },
      },
      environmentById: {},
      deltasByEnvironment: {},
      latestReadByThread: {},
      diagnosticsByThread: {},
    });

    renderPanel();
    await showFullGraph();

    await screen.findByTestId("stage-play-badge-graph-scrollport");
    const graphUrl = fetchCallUrls().find((url: string) => url.includes("/api/helix/stage-play/graph?")) ?? "";
    expect(graphUrl).toContain("/api/helix/stage-play/graph?");
    expect(graphUrl).toContain("threadId=helix-ask%3Adesktop");
    expect(graphUrl).toContain("roomId=room%3Aminecraft-env");
    expect(graphUrl).toContain("environmentId=live_env%3Aui");
    const mailboxUrl = fetchCallUrls().find((url: string) => url.includes("/api/helix/stage-play/live-source-mail?")) ?? "";
    expect(mailboxUrl).toContain("/api/helix/stage-play/live-source-mail?");
    expect(mailboxUrl).toContain("threadId=helix-ask%3Adesktop");
    expect(mailboxUrl).toContain("mailboxThreadId=helix-ask%3Adesktop");
    expect(mailboxUrl).toContain("view=operator");
    expect(mailboxUrl).toContain("limit=4");
    expect(mailboxUrl).not.toContain("roomId=");
    expect(mailboxUrl).not.toContain("environmentId=");
    const builderUrl = fetchCallUrls().find((url: string) => url.includes("/api/helix/stage-play/builder?")) ?? "";
    expect(builderUrl).toContain("/api/helix/stage-play/builder?");
    expect(builderUrl).toContain("threadId=helix-ask%3Adesktop");
    expect(builderUrl).toContain("environmentId=live_env%3Aui");
  });
});
