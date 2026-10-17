import { beforeEach, describe, expect, it } from "vitest";
import {
  selectActiveLiveSituationArtifact,
  selectLatestLiveSituationEvaluation,
  selectLiveSituationDeltas,
  selectLiveSituationRiskLine,
  useLiveSituationArtifactStore,
  type LiveSituationArtifactState,
} from "@/store/useLiveSituationArtifactStore";
import type { LiveSituationArtifact, LiveSituationArtifactDelta } from "@shared/helix-live-situation-artifact";

const artifact: LiveSituationArtifact = {
  schema: "helix.live_situation_artifact.v1",
  artifact_id: "live_situation:test",
  thread_id: "helix-ask:test",
  created_turn_id: "turn:setup",
  session_id: "situation_goal:test",
  room_id: "room:minecraft-minehut",
  world_id: "minecraft:minehut",
  source_ids: ["source:minecraft-server"],
  graph_id: null,
  status: "active",
  mode: "text_only",
  objective: "Watch danger and progress.",
  current_state_lines: {
    now: "entered danger at 4 health.",
    goal: "survive immediate danger",
    risk: "DatDamPig is in danger at 4 health.",
    progress: "entered danger at 4 health.",
    unknowns: "No hostile precursor sensing yet.",
    last_decision: "show_text",
  },
  subgoals: [],
  latest_evaluation: {
    schema: "helix.live_situation_evaluation.v1",
    evaluation_id: "live_eval:test",
    artifact_id: "live_situation:test",
    thread_id: "helix-ask:test",
    trigger: "risk_update",
    summary: "DatDamPig is in danger at 4 health.",
    recommendation: "Surface according to policy.",
    interjection_decision: "show_text",
    model_invoked: false,
    deterministic_gate: true,
    evidence_refs: ["minecraft:event:risk"],
    created_at: "2026-05-08T10:00:00.000Z",
  },
  evidence_refs: ["minecraft:event:risk"],
  created_at: "2026-05-08T10:00:00.000Z",
  updated_at: "2026-05-08T10:00:01.000Z",
  context_policy: "compact_context_pack_only",
  raw_transcript_included: false,
  raw_audio_included: false,
  deterministic_content_role: "observation_not_assistant_answer",
};

const delta: LiveSituationArtifactDelta = {
  schema: "helix.live_situation_artifact_delta.v1",
  delta_id: "live_delta:test",
  artifact_id: "live_situation:test",
  thread_id: "helix-ask:test",
  turn_id: "turn:aux",
  reason: "risk_update",
  previous_hash: "old",
  next_hash: "new",
  changed_fields: ["current_state_lines"],
  artifact_snapshot: artifact,
  evidence_refs: ["minecraft:event:risk"],
  ts: "2026-05-08T10:00:01.000Z",
};

describe("useLiveSituationArtifactStore", () => {
  beforeEach(() => {
    useLiveSituationArtifactStore.setState({
      artifactByThread: {},
      deltasByArtifact: {},
      diagnosticsByThread: {},
    } as Partial<LiveSituationArtifactState>);
  });

  it("dedupes read responses and exposes live selectors", () => {
    useLiveSituationArtifactStore.getState().upsertReadResponse("helix-ask:test", {
      ok: true,
      artifact,
      deltas: [delta, delta],
      debug: {
        thread_id: "helix-ask:test",
        artifact_id: artifact.artifact_id,
        delta_count: 1,
        last_delta_id: delta.delta_id,
        last_next_hash: delta.next_hash,
        raw_audio_included: false,
        raw_transcript_included: false,
        deterministic_content_role: "observation_not_assistant_answer",
      },
    });

    const state = useLiveSituationArtifactStore.getState();
    expect(selectActiveLiveSituationArtifact(state, "helix-ask:test")?.artifact_id).toBe(artifact.artifact_id);
    expect(selectLiveSituationDeltas(state, artifact.artifact_id)).toHaveLength(1);
    expect(selectLatestLiveSituationEvaluation(state, "helix-ask:test")?.model_invoked).toBe(false);
    expect(selectLiveSituationRiskLine(state, "helix-ask:test")).toContain("4 health");
    expect(state.diagnosticsByThread["helix-ask:test"]?.last_fetch_status).toBe("ok");
  });
});
