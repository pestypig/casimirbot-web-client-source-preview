import { describe, expect, it } from "vitest";
import { helixMessageCloudFrameSchema } from "@shared/helix-message-cloud";
import { normalizeResponsesActionActivity } from
  "../../../../../server/services/helix-ask/operator-activity-normalizer";
import { projectSessionActivity, selectSessionActivityBinding } from "../sessionActivityProjection";
import { projectDiscordFloatActivityEvent } from "@shared/discord-float-activity";

describe("owner-private session activity projection", () => {
  const pairing = { status: "active" as const,
    taskId: "01a0798b-b5bd-7bf2-946a-9a77e086316a", bindingId: "binding:exact" };

  it("keeps a public relay key stable when the visible Codex update tail slides", async () => {
    const frameFor = (updates: string[]) => projectSessionActivity({
      helixConversationId: "chat:owner", currentChatTitle: "Owner task", pairing,
      codexSourceStatus: "live", messages: [], nativeVerifiedBindingId: "binding:exact",
      codexFrame: { schema: "helix.codex_conversation_cloud_frame.v1",
        taskId: pairing.taskId, turns: [{ id: "turn:one", user: "", updates,
          assistant: "", assistantPhase: "commentary", status: "working" }] },
    });
    const before = frameFor(["Older", "Pilot update", "Newest"]);
    const after = frameFor(["Older", "Pilot update", "Newest", "Further"]);
    const pilot = (frame: typeof before) => frame.turns.find(turn =>
      turn.report?.text === "Pilot update")!;
    expect(pilot(before).id).not.toBe(pilot(after).id);
    const first = await projectDiscordFloatActivityEvent(before, pilot(before));
    const shifted = await projectDiscordFloatActivityEvent(after, pilot(after));
    expect(shifted?.event_key).toBe(first?.event_key);
  });

  it("groups actual Cloud Agent DM and owner-granted Codex visible turns without inventing an adapter worker", () => {
    const frame = projectSessionActivity({ helixConversationId: "chat:owner", pairing,
      codexSourceStatus: "live", messages: [
        { role: "user", text: "Can you help?", turnId: "managed-turn:00000000-0000-4000-8000-000000000001" },
        { role: "assistant", text: "I can.", turnId: "managed-turn:00000000-0000-4000-8000-000000000001" },
      ], codexFrame: { schema: "helix.codex_conversation_cloud_frame.v1", taskId: pairing.taskId,
        turns: [{ id: "turn:one", user: "Review this", updates: ["Checking evidence"],
          assistant: "Done", assistantPhase: "final_answer", status: "completed" }] },
      taskReport: { id: "steering:one", status: "completed", text: "Handoff received" } });
    expect(helixMessageCloudFrameSchema.safeParse(frame).success).toBe(true);
    expect(frame.turns.map(turn => turn.lane)).toEqual([
      "cloud_agent_dm", "cloud_agent_dm", "codex_task", "codex_task", "codex_task", "codex_task",
    ]);
    expect(frame.turns.map(turn => turn.kind)).toContain("task_report");
    expect(frame.turns.some(turn => turn.lane === "responses_worker" || turn.lane === "minecraft_adapter")).toBe(false);
    expect(frame.responsesWorkerStatus).toBe("not_connected");
  });

  it("preserves a user-visible native observation as an attributed update and excludes its authority", () => {
    const frame = projectSessionActivity({ helixConversationId: "chat:owner", pairing,
      codexSourceStatus: "unavailable", codexSourceReason: "task_reference_invalid",
      messages: [{ role: "assistant", text: "The local clock is 10:30.",
        nativeToolObservation: { schema: "casimirbot.personal_native_clock_observation.v1",
          evidenceRef: "native_clock:one", observedAt: "2026-10-05T14:30:00Z",
          timezone: "America/New_York", source: "desktop_native_clock" } }],
      codexFrame: null });
    expect(frame.turns).toHaveLength(2);
    expect(frame.turns[1]).toMatchObject({ lane: "cloud_agent_dm", kind: "update",
      report: { status: "completed", text: expect.stringContaining("native_clock:one") } });
    expect(frame.codexSourceReason).toBe("task_reference_invalid");
    expect(JSON.stringify(frame)).not.toMatch(/answer_authority|execution_authority|hidden.reasoning/i);
  });

  it("clears Codex transcript on lost pairing while retaining the agent conversation", () => {
    const frame = projectSessionActivity({ helixConversationId: "chat:owner", pairing: {
      status: "revoked", taskId: null }, codexSourceStatus: "unpaired",
      messages: [{ role: "assistant", text: "Agent reply" }],
      taskReport: { id: "steering:old", status: "completed", text: "Old private report" },
      codexFrame: { schema: "helix.codex_conversation_cloud_frame.v1", taskId: pairing.taskId,
        turns: [{ id: "turn:old", user: "Private old turn", assistant: "Old answer",
          assistantPhase: "final_answer", status: "completed" }] } });
    expect(frame.codexSourceStatus).toBe("unpaired");
    expect(frame.turns).toHaveLength(1);
    expect(frame.turns[0].report?.text).toBe("Agent reply");
  });

  it("never projects a previously read transcript from a different exact task", () => {
    const frame = projectSessionActivity({ helixConversationId: "chat:new", pairing,
      codexSourceStatus: "live", messages: [{ role: "assistant", text: "Current agent" }],
      codexFrame: { schema: "helix.codex_conversation_cloud_frame.v1",
        taskId: "01a03464-1f5e-7f93-bd17-e4ca8a0bec9e",
        turns: [{ id: "turn:other", user: "Other task's private request", assistant: "Private answer",
          assistantPhase: "final_answer", status: "completed" }] } });
    expect(frame.codexSourceStatus).toBe("unpaired");
    expect(frame.turns).toHaveLength(1);
    expect(frame.turns[0].lane).toBe("cloud_agent_dm");
  });

  it("includes separately verified saved Codex chats in All with their exact source labels", () => {
    const otherTask = "01a0eded-a444-7330-9313-fbbbe61285dd";
    const other = { chatId: "chat:second", title: "Civilization review",
      bindingId: "binding:second", status: "live" as const,
      frame: { schema: "helix.codex_conversation_cloud_frame.v1" as const,
        helixConversationId: "chat:second", taskId: otherTask,
        turns: [{ id: "turn:shared", user: "Review countries", updates: [],
          assistant: "Second task answer", assistantPhase: "final_answer" as const,
          status: "completed" as const }] } };
    const selected = { schema: "helix.codex_conversation_cloud_frame.v1" as const,
      helixConversationId: "chat:owner", taskId: pairing.taskId,
      turns: [{ id: "turn:shared", user: "Review harness", updates: [],
        assistant: "First task answer", assistantPhase: "final_answer" as const,
        status: "completed" as const }] };
    const frame = projectSessionActivity({ helixConversationId: "chat:owner",
      currentChatTitle: "Harness testing", savedCodexChatCount: 2,
      pairing, nativeVerifiedBindingId: "binding:exact", codexSourceStatus: "live",
      messages: [], codexFrame: selected, otherCodexChats: [other] });
    expect(helixMessageCloudFrameSchema.safeParse(frame).success).toBe(true);
    expect(frame.activityScope).toBe("saved_codex_chats");
    expect(frame.turns.filter(turn => turn.sourceChat?.helixConversationId === "chat:owner")
      .some(turn => turn.report?.text === "First task answer")).toBe(true);
    expect(frame.turns.filter(turn => turn.sourceChat?.helixConversationId === "chat:second")
      .some(turn => turn.report?.text === "Second task answer")).toBe(true);
    expect(new Set(frame.turns.map(turn => turn.id)).size).toBe(frame.turns.length);
    expect(frame.turns.find(turn => turn.report?.text === "Second task answer")?.sourceChat)
      .toMatchObject({ title: "Civilization review", taskId: otherTask });
    const mismatched = projectSessionActivity({ helixConversationId: "chat:owner",
      currentChatTitle: "Harness testing", savedCodexChatCount: 2,
      pairing, nativeVerifiedBindingId: "binding:exact", codexSourceStatus: "live",
      messages: [], codexFrame: selected,
      otherCodexChats: [{ ...other, frame: { ...other.frame,
        helixConversationId: "chat:wrong" } }] });
    expect(mismatched.turns.some(turn => turn.report?.text === "Second task answer")).toBe(false);
  });

  it("uses a native owner-granted frame when the registration no longer resolves a task name", () => {
    const frame = projectSessionActivity({ helixConversationId: "chat:owner",
      pairing: { status: "active", taskId: null, bindingId: "binding:exact" },
      codexSourceStatus: "live", messages: [],
      codexFrame: { schema: "helix.codex_conversation_cloud_frame.v1", taskId: pairing.taskId,
        turns: [{ id: "turn:visible", user: "Visible request", assistant: "Visible answer",
          assistantPhase: "final_answer", status: "completed" }] } });
    expect(frame.codexSourceStatus).toBe("live");
    expect(frame.turns.map(turn => turn.lane)).toEqual(["codex_task", "codex_task"]);
  });

  it("shows an exact provider-qualified Codex pairing with the native bare task ID", () => {
    const frame = projectSessionActivity({ helixConversationId: "chat:owner",
      pairing: { ...pairing, taskId: `codex-task:${pairing.taskId}` },
      nativeVerifiedBindingId: "binding:exact", codexSourceStatus: "live", messages: [],
      codexFrame: { schema: "helix.codex_conversation_cloud_frame.v1", taskId: pairing.taskId,
        turns: [{ id: "turn:visible", user: "Visible request", assistant: "Visible answer",
          assistantPhase: "final_answer", status: "completed" }] } });
    expect(frame.codexSourceStatus).toBe("live");
    expect(frame.turns.map(turn => turn.lane)).toEqual(["codex_task", "codex_task"]);
  });

  it("still rejects a different provider-qualified Codex task", () => {
    const frame = projectSessionActivity({ helixConversationId: "chat:owner",
      pairing: { ...pairing, taskId: "codex-task:01a03464-1f5e-7f93-bd17-e4ca8a0bec9e" },
      nativeVerifiedBindingId: "binding:exact", codexSourceStatus: "live", messages: [],
      codexFrame: { schema: "helix.codex_conversation_cloud_frame.v1", taskId: pairing.taskId,
        turns: [{ id: "turn:other", user: "Private request", assistant: "Private answer",
          assistantPhase: "final_answer", status: "completed" }] } });
    expect(frame.codexSourceStatus).toBe("unpaired");
    expect(frame.turns).toEqual([]);
  });

  it("keeps a newly verified native exact-task read when the separate pairing badge lookup is unavailable", () => {
    const frame = projectSessionActivity({ helixConversationId: "chat:owner",
      pairing: { status: "unavailable", taskId: null }, nativeVerifiedBindingId: "binding:exact",
      codexSourceStatus: "live", messages: [],
      codexFrame: { schema: "helix.codex_conversation_cloud_frame.v1", taskId: pairing.taskId,
        turns: [{ id: "turn:visible", user: "Visible request", assistant: "Visible answer",
          assistantPhase: "final_answer", status: "completed" }] } });
    expect(helixMessageCloudFrameSchema.safeParse(frame).success).toBe(true);
    expect(frame.codexSourceStatus).toBe("live");
    expect(frame.pairing).toMatchObject({ status: "active", taskId: pairing.taskId,
      bindingId: "binding:exact" });
    expect(frame.turns.map(turn => turn.lane)).toEqual(["codex_task", "codex_task"]);
  });

  it("keeps exact Responses activity readable during a badge outage, but not after revocation or task mismatch", () => {
    const codexFrame = { schema: "helix.codex_conversation_cloud_frame.v1" as const,
      taskId: pairing.taskId, turns: [] };
    const badgeUnavailable = { status: "unavailable" as const, taskId: null };
    const verified = { pairing: badgeUnavailable, nativeVerifiedBindingId: "binding:exact",
      codexSourceStatus: "live" as const, codexFrame };
    expect(selectSessionActivityBinding(verified)).toBe("binding:exact");
    const activity = normalizeResponsesActionActivity({
      activity: { schema: "environment.responses_actor_activity.v1",
        event_id: "responses_event:badge-outage", helix_conversation_id: "chat:owner",
        reasoning_binding_id: "binding:exact", binding_epoch: 2,
        run_id: "run:one", goal_id: "goal:one", goal_revision: 1,
        checkpoint_event_id: "checkpoint:one", decision_id: "decision:one",
        phase: "proposed", action_code: "walk_to_waypoint", target_ref: "waypoint:one",
        reason_code: null, observed_at: "2026-10-05T12:00:00.000Z",
        provenance: "verified_responses_actor_boundary", raw_response_included: false,
        private_reasoning_included: false, execution_authority: false,
        action_performed: false, answer_authority: false, terminal_eligible: false },
      profileRef: "profile:one", nodeRef: "node:one",
      environmentBindingRef: "environment:one", roomRef: "room:one",
      sourceRef: "source:one", worldRef: "world:one", projectionSequence: 0,
    });
    const frame = projectSessionActivity({ helixConversationId: "chat:owner", messages: [],
      ...verified, currentBindingEpoch: 2, responsesOperatorEvents: [activity] });
    expect(frame.responsesWorkerStatus).toBe("activity_recorded");
    expect(frame.turns).toEqual([expect.objectContaining({ lane: "responses_worker" })]);
    expect(selectSessionActivityBinding({ ...verified, pairing: { status: "revoked", taskId: null } }))
      .toBeNull();
    expect(selectSessionActivityBinding({ ...verified, pairing: { status: "unavailable",
      taskId: "codex-task:another-task" } })).toBeNull();
    expect(projectSessionActivity({ helixConversationId: "chat:owner", messages: [],
      ...verified, pairing: { status: "revoked", taskId: null },
      currentBindingEpoch: 2, responsesOperatorEvents: [activity] }).turns).toEqual([]);
  });

  it("labels a native-grant-verified retry as reconnecting without dropping the last visible turns", () => {
    const frame = projectSessionActivity({ helixConversationId: "chat:owner",
      pairing: { status: "unavailable", taskId: null }, nativeVerifiedBindingId: "binding:exact",
      codexSourceStatus: "reconnecting", codexSourceReason: "reader_unavailable", messages: [],
      codexFrame: { schema: "helix.codex_conversation_cloud_frame.v1", taskId: pairing.taskId,
        turns: [{ id: "turn:visible", user: "Last verified request", assistant: "Last verified answer",
          assistantPhase: "final_answer", status: "completed" }] } });
    expect(frame.codexSourceStatus).toBe("reconnecting");
    expect(frame.turns.map(turn => turn.lane)).toEqual(["codex_task", "codex_task"]);
    expect(frame.pairing).toMatchObject({ status: "active", bindingId: "binding:exact" });
  });

  it("does not let a stale native read override an explicit revoked pairing", () => {
    const frame = projectSessionActivity({ helixConversationId: "chat:owner",
      pairing: { status: "revoked", taskId: null }, nativeVerifiedBindingId: "binding:old",
      codexSourceStatus: "live", messages: [],
      codexFrame: { schema: "helix.codex_conversation_cloud_frame.v1", taskId: pairing.taskId,
        turns: [{ id: "turn:old", user: "Private old turn", assistant: "Old answer",
          assistantPhase: "final_answer", status: "completed" }] } });
    expect(frame.codexSourceStatus).toBe("unpaired");
    expect(frame.pairing?.status).toBe("revoked");
    expect(frame.turns).toEqual([]);
  });

  it("labels task handoff progress as a status update rather than a conversation or MCP receipt", () => {
    const frame = projectSessionActivity({ helixConversationId: "chat:owner", pairing,
      codexSourceStatus: "live", messages: [], codexFrame: null,
      handoffStatus: { state: "acknowledged" } });
    expect(frame.turns).toEqual([expect.objectContaining({ lane: "codex_task", kind: "status",
      author: "system", report: { status: "completed",
        text: "The paired Codex task picked up the handoff; its task report is separate." } })]);
    expect(JSON.stringify(frame)).not.toContain("steering:");
  });

  it("requires attribution for the expanded activity frame but keeps ordinary clouds capped", () => {
    const base = { schema: "helix.message_cloud_frame.v1", helixConversationId: "chat:owner",
      turns: Array.from({ length: 4 }, (_, index) => ({ id: `turn:${index}`, prompt: "Hi",
        delivery: "reported", report: null })) };
    expect(helixMessageCloudFrameSchema.safeParse(base).success).toBe(false);
    expect(helixMessageCloudFrameSchema.safeParse({ ...base, source: "session_activity" }).success).toBe(false);
    const workerTurn = { id: "responses:one", prompt: "", delivery: "reported", report: null,
      lane: "responses_worker", kind: "decision" };
    expect(helixMessageCloudFrameSchema.safeParse({ ...base, source: "session_activity",
      turns: [workerTurn], responsesWorkerStatus: "not_connected" }).success).toBe(false);
    expect(helixMessageCloudFrameSchema.safeParse({ ...base, source: "session_activity",
      turns: [workerTurn], responsesWorkerStatus: "activity_recorded" }).success).toBe(true);
  });

  it("shows only the exact bound Responses choice as a decision, never as performed movement", () => {
    const activity = { schema: "environment.responses_actor_activity.v1" as const,
      event_id: "activity:one", helix_conversation_id: "chat:owner",
      reasoning_binding_id: "binding:exact", binding_epoch: 2,
      run_id: "run:one", goal_id: "goal:one", goal_revision: 3,
      checkpoint_event_id: "checkpoint:one", decision_id: "decision:one",
      phase: "proposed" as const, action_code: "walk_to_waypoint",
      target_ref: "waypoint:one", reason_code: null,
      observed_at: "2026-10-05T12:00:00.000Z",
      provenance: "verified_responses_actor_boundary" as const,
      raw_response_included: false as const, private_reasoning_included: false as const,
      execution_authority: false as const, action_performed: false as const,
      answer_authority: false as const, terminal_eligible: false as const };
    const frame = projectSessionActivity({ helixConversationId: "chat:owner", pairing,
      codexSourceStatus: "live", messages: [], codexFrame: null,
      currentBindingEpoch: 2, responsesActivity: [activity] });
    expect(helixMessageCloudFrameSchema.safeParse(frame).success).toBe(true);
    expect(frame.responsesWorkerStatus).toBe("activity_recorded");
    expect(frame.turns).toEqual([expect.objectContaining({ lane: "responses_worker",
      kind: "decision", report: { status: "completed",
        text: "Selected walk_to_waypoint toward waypoint:one; awaiting temporal preflight. No action started." } })]);
    for (const changed of [
      { ...activity, helix_conversation_id: "chat:other" },
      { ...activity, reasoning_binding_id: "binding:other" },
      { ...activity, binding_epoch: 3 },
    ]) {
      const denied = projectSessionActivity({ helixConversationId: "chat:owner", pairing,
        codexSourceStatus: "live", messages: [], codexFrame: null,
        currentBindingEpoch: 2, responsesActivity: [changed] });
      expect(denied.responsesWorkerStatus).toBe("not_connected");
      expect(denied.turns).toEqual([]);
    }
  });

  it("projects only sanitized stored Responses activity for the exact current epoch", () => {
    const operator = normalizeResponsesActionActivity({
      activity: { schema: "environment.responses_actor_activity.v1",
        event_id: "responses_event:one", helix_conversation_id: "chat:owner",
        reasoning_binding_id: "binding:exact", binding_epoch: 2,
        run_id: "run:one", goal_id: "goal:one", goal_revision: 1,
        checkpoint_event_id: "checkpoint:one", decision_id: "decision:one",
        phase: "proposed", action_code: "walk_to_waypoint", target_ref: "waypoint:one",
        reason_code: null, observed_at: "2026-10-05T12:00:00.000Z",
        provenance: "verified_responses_actor_boundary", raw_response_included: false,
        private_reasoning_included: false, execution_authority: false,
        action_performed: false, answer_authority: false, terminal_eligible: false },
      profileRef: "profile:one", nodeRef: "node:one",
      environmentBindingRef: "environment:one", roomRef: "room:one",
      sourceRef: "source:one", worldRef: "world:one", projectionSequence: 0,
    });
    const base = { helixConversationId: "chat:owner", pairing,
      codexSourceStatus: "live" as const, messages: [], codexFrame: null,
      currentBindingEpoch: 2 };
    const frame = projectSessionActivity({ ...base, responsesOperatorEvents: [operator] });
    expect(frame.turns).toEqual([expect.objectContaining({ lane: "responses_worker",
      report: { status: "completed", text: expect.stringContaining("No action started") } })]);
    expect(frame.responsesWorkerStatus).toBe("activity_recorded");
    for (const item of [{ ...operator, helix_conversation_ref: "chat:other" },
      { ...operator, reasoning_binding_ref: "binding:other" },
      { ...operator, reasoning_binding_epoch: 3 }]) {
      const denied = projectSessionActivity({ ...base, responsesOperatorEvents: [item] });
      expect(denied.turns).toEqual([]);
      expect(denied.responsesWorkerStatus).toBe("not_connected");
    }
    const revoked = projectSessionActivity({ ...base, pairing: { status: "revoked" as const,
      taskId: null }, responsesOperatorEvents: [operator] });
    expect(revoked.turns).toEqual([]);
  });

  it("attributes separate owner-verified adapter runs without borrowing the selected chat's binding", () => {
    const page = (chatId: string, bindingId: string, runId: string, id: string) => {
      const event = normalizeResponsesActionActivity({
        activity: { schema: "environment.responses_actor_activity.v1",
          event_id: `responses_event:${id}`, helix_conversation_id: chatId,
          reasoning_binding_id: bindingId, binding_epoch: 2,
          run_id: runId, goal_id: `goal:${id}`, goal_revision: 1,
          checkpoint_event_id: `checkpoint:${id}`, decision_id: `decision:${id}`,
          phase: "proposed", action_code: "walk_to_waypoint", target_ref: `waypoint:${id}`,
          reason_code: null, observed_at: "2026-10-05T12:00:00.000Z",
          provenance: "verified_responses_actor_boundary", raw_response_included: false,
          private_reasoning_included: false, execution_authority: false,
          action_performed: false, answer_authority: false, terminal_eligible: false },
        profileRef: "profile:one", nodeRef: "node:one", environmentBindingRef: "environment:one",
        roomRef: "room:one", sourceRef: "source:one", worldRef: "world:one",
        projectionSequence: 0,
      });
      return { schema: "helix.adapter_ai_activity_page.v1" as const,
        helix_conversation_id: chatId, reasoning_binding_id: bindingId,
        binding_epoch: 2, run_id: runId, events: [event],
        adapter_results_status: "available" as const,
        answer_authority: false as const, terminal_eligible: false as const,
        raw_content_included: false as const, private_reasoning_included: false as const };
    };
    const first = page("chat:owner", "binding:exact", "run:first", "first");
    const second = page("chat:other", "binding:other", "run:second", "second");
    const base = { helixConversationId: "chat:owner", currentChatTitle: "Owner chat",
      savedAdapterChats: [{ id: "chat:owner", title: "Owner chat" },
        { id: "chat:other", title: "Other chat" }],
      pairing, codexSourceStatus: "live" as const, messages: [], codexFrame: null,
      currentBindingEpoch: 2 };
    const frame = projectSessionActivity({ ...base, adapterPages: [first, second] });
    expect(helixMessageCloudFrameSchema.safeParse(frame).success).toBe(true);
    expect(frame.turns).toEqual([
      expect.objectContaining({ sourceRun: expect.objectContaining({ runId: "run:first",
        helixConversationId: "chat:owner" }) }),
      expect.objectContaining({ sourceRun: expect.objectContaining({ runId: "run:second",
        helixConversationId: "chat:other" }) }),
    ]);
    expect(frame.turns.every(turn => turn.report?.text.includes("No action started"))).toBe(true);
    const changed = projectSessionActivity({ ...base, adapterPages: [
      { ...first, reasoning_binding_id: "binding:stale" },
      { ...second, helix_conversation_id: "chat:not-saved" },
    ] });
    expect(changed.turns).toEqual([]);
  });
});
