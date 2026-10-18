// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHelixAskRealtimeProviderEventHandler } from "@/components/helix/ask-console/HelixAskRealtimeProviderEventHandler";
import { useRoomMissionHandoffReview } from "@/components/helix/ask-console/shared-live-room/RoomMissionHandoffReview";
import { writePersonalVoiceDestination } from "@/lib/helix/personal-voice-route";

type ServerHandoffOptions = {
  outcome?: "conversation_local" | "worker_grounded" | "durable_goal_bound" | "action_candidate";
  interactionMode?: "conversation_local" | "parallel_conversation" | "worker_required";
  dispatchKind?: "none" | "ask_runtime" | "goal_wake" | "ask_runtime_read_only";
  goalId?: string | null;
  runtimeProvider?: string | null;
};

const buildServerHandoff = (
  observationRef: string,
  suffix = "test",
  options: ServerHandoffOptions = {},
) => {
  const handoffId = `realtime-stage-play-handoff:${suffix}`;
  const outcome = options.outcome ?? "worker_grounded";
  const dispatchKind = options.dispatchKind ?? "ask_runtime";
  const goalId = options.goalId ?? (dispatchKind === "goal_wake" ? `goal:${suffix}` : null);
  const runtimeProvider = options.runtimeProvider ?? (dispatchKind === "none" ? null : "codex");
  const dispatchRequested = dispatchKind !== "none";
  const interactionMode = options.interactionMode ??
    (outcome === "conversation_local" ? "conversation_local" : "worker_required");
  const candidateReadonlyCapabilityIds =
    outcome === "worker_grounded" || outcome === "action_candidate"
      ? ["workstation.active_context"]
      : [];
  const workerAdmission = {
    schema: "helix.realtime_worker_admission.v2",
    admission_id: `realtime-worker-admission:${suffix}`,
    handoff_id: handoffId,
    realtime_session_id: "realtime:test",
    thread_id: "helix-ask:desktop",
    decision_phase: "transcript_handoff",
    outcome,
    interaction_mode: interactionMode,
    reason_codes: ["intent_general_reasoning"],
    selected_primary_intent: "general_reasoning",
    selected_route: null,
    selected_runtime_agent_provider: runtimeProvider,
    selected_model: null,
    candidate_readonly_capability_ids: candidateReadonlyCapabilityIds,
    observed_readonly_capability_ids: [],
    action_candidate_capability_ids:
      outcome === "action_candidate" ? ["workstation.open_panel"] : [],
    dispatch: {
      schema: "helix.realtime_worker_dispatch.v2",
      kind: dispatchKind,
      state: dispatchRequested ? "requested" : "not_required",
      requested: dispatchRequested,
      completed: false,
      target_runtime_agent_provider: runtimeProvider,
      runtime_selection_source:
        dispatchKind === "goal_wake"
          ? "goal_binding"
          : dispatchRequested
            ? "ask_ui_selected_runtime"
            : "none",
      goal_id: goalId,
      runtime_goal_session_ref: goalId ? `runtime-goal-session:${suffix}` : null,
      suppress_parallel_ask_turn:
        outcome === "conversation_local" || outcome === "durable_goal_bound",
      read_only: true,
      workstation_action_execution_allowed: false,
      realtime_provider_tool_execution_allowed: false,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    },
    worker_turn_dispatched: false,
    spoken_relay_eligible: outcome === "worker_grounded" || outcome === "durable_goal_bound",
    workstation_action_execution_allowed: false,
    realtime_provider_tool_execution_allowed: false,
    evidence_refs: [observationRef],
    decided_at_ms: 100,
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
  return {
  schema: "helix.realtime_stage_play.ask_handoff.v1",
  handoff_id: handoffId,
  realtime_session_id: "realtime:test",
  thread_id: "helix-ask:desktop",
  provider_event_ref: `event:transcript:${suffix}`,
  transcript_observation_ref: observationRef,
  stage_play_event_ref: `stage-play-event:${suffix}`,
  context_pack_id: `context-pack:${suffix}`,
  context_hash: `sha256:${suffix}`,
  transcript_text_hash: `sha256:transcript-${suffix}`,
  transcript_text_char_count: 37,
  goal_id: goalId,
  runtime_goal_session_ref: goalId ? `runtime-goal-session:${suffix}` : null,
  runtime_agent_provider: runtimeProvider,
  required_grounding_capability_ids: candidateReadonlyCapabilityIds,
  worker_admission: workerAdmission,
  created_at_ms: 100,
  route_metadata: {
    schema: "helix.ask.route_metadata.v1",
    source: "realtime_stage_play",
    invocationKind: "stage_play_realtime_transcript_handoff",
    sourceTarget: "operator_text",
    mailboxThreadId: "helix-ask:desktop",
    handoffId,
    realtimeSessionId: "realtime:test",
    stagePlayEventRef: `stage-play-event:${suffix}`,
    contextPackId: `context-pack:${suffix}`,
    contextHash: `sha256:${suffix}`,
    currentTranscriptTextHash: `sha256:transcript-${suffix}`,
    currentTranscriptTextCharCount: 37,
    forbiddenCapabilities: [
      "workstation_mutation",
      "workstation_action_execution",
      "realtime_provider_tool_execution",
    ],
    evidenceRefs: [observationRef, `stage-play-event:${suffix}`],
    source_target_intent: {
      must_enter_backend_ask:
        dispatchKind === "ask_runtime" || dispatchKind === "ask_runtime_read_only",
      allow_client_shortcut: false,
      admitted_readonly_handoff: true,
      assistant_answer: false,
      raw_content_included: false,
      realtime_worker_admission: workerAdmission,
      server_fixture_marker: suffix,
    },
  },
  read_only: true,
  transcript_is_user_intent_after_admission: true,
  reentry_required: true,
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
  };
};

describe("Helix Ask Realtime provider event handler", () => {
  beforeEach(() => writePersonalVoiceDestination("ask_helix"));
  it("offers personal GPT Live speech to the bound task only after server attribution", async () => {
    writePersonalVoiceDestination("message_codex");
    const postEvent = vi.fn(async () => ({ ok: true,
      realtime_transcript_observations: [{ observation_ref: "obs:personal" }],
      realtime_stage_play_ask_handoff: buildServerHandoff("obs:personal"),
    }));
    const launchPrompt = vi.fn();
    const offerFinalizedSteering = vi.fn(() => true);
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt,
      offerFinalizedSteering,
    });
    const providerEvent = {
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:transcript:bound-agent",
      transcript: "Acknowledge this advisory on the exact bound task.",
    };

    const result = await handler.handle(providerEvent);

    expect(offerFinalizedSteering).toHaveBeenCalledWith({
      clientEventRef:
        "gpt-live:realtime:test:event:transcript:bound-agent",
      destination: "message_codex",
      transcript: "Acknowledge this advisory on the exact bound task.",
    });
    expect(postEvent).toHaveBeenCalledOnce();
    expect(launchPrompt).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      event_kind: "input_transcript_final",
      reentry_status: "reentered",
      worker_dispatch_kind: "bound_agent_steering",
      worker_dispatch_state: "exact_binding_dispatch_requested",
      worker_turn_dispatched: false,
      runtime_goal_wake_requested: false,
      tool_execution_attempted: false,
      workstation_action_executed: false,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });

    expect(await handler.handle(providerEvent)).toMatchObject({
      reentry_status: "blocked",
      blocked_reason: "duplicate_realtime_transcript_event",
    });
    expect(offerFinalizedSteering).toHaveBeenCalledTimes(1);
  });

  it("routes personal speech to Cloud Agent DM without falling through when that connection is unavailable", async () => {
    writePersonalVoiceDestination("cloud_agent_dm");
    const launchPrompt = vi.fn();
    const offerFinalizedSteering = vi.fn(() => false);
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test", runtimeAgentAuthority: "observe_only",
      launchPrompt, offerFinalizedSteering,
      postEvent: async () => ({ ok: true,
        realtime_transcript_observations: [{ observation_ref: "obs:cloud" }],
        realtime_stage_play_ask_handoff: buildServerHandoff("obs:cloud"),
      }),
    });

    const result = await handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:cloud-unavailable", transcript: "Acknowledge this advisory on the exact bound task.",
    });
    expect(result).toMatchObject({ reentry_status: "blocked",
      blocked_reason: "personal_voice_destination_unavailable",
      worker_dispatch_kind: "cloud_agent_dm", worker_dispatch_state: "destination_unavailable" });
    expect(offerFinalizedSteering).toHaveBeenCalledWith(expect.objectContaining({
      destination: "cloud_agent_dm", transcript: "Acknowledge this advisory on the exact bound task.",
    }));
    expect(launchPrompt).not.toHaveBeenCalled();
  });

  it.each(["Do not move", "If we move later", "Yesterday we moved", 'The screen says "move"',
    "How does movement work?", "Review this, but do not move"]) (
    "never sends room speech through personal steering: %s", async transcript => {
      useRoomMissionHandoffReview.setState({ entries: [] });
      const handoff = { ...buildServerHandoff("obs:room"), thread_id: "helix-ask:room:room:one",
        transcript_text_char_count: transcript.length };
      const offer = vi.fn(() => true);
      const handler = createHelixAskRealtimeProviderEventHandler({ realtimeSessionId: "realtime:test",
        runtimeAgentAuthority: "observe_only", launchPrompt: vi.fn(), offerFinalizedSteering: offer,
        postEvent: async () => ({ ok: true, realtime_transcript_observations: [{ observation_ref: "obs:room" }],
          realtime_stage_play_ask_handoff: handoff }) });
      await handler.handle({ type: "conversation.item.input_audio_transcription.completed", event_id: "event:room", transcript });
      expect(offer).not.toHaveBeenCalled();
      expect(useRoomMissionHandoffReview.getState().entries).toMatchObject([{ roomId: "room:one", text: transcript }]);
      handler.dispose();
      expect(useRoomMissionHandoffReview.getState().entries).toEqual([]);
    });

  it("does not offer unattributed speech or retain a late receipt after disconnect", async () => {
    const offer = vi.fn(() => true);
    let finish!: (value: unknown) => void;
    const handler = createHelixAskRealtimeProviderEventHandler({ realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only", offerFinalizedSteering: offer,
      postEvent: () => new Promise(resolve => { finish = resolve; }) });
    useRoomMissionHandoffReview.setState({ entries: [] });
    const pending = handler.handle({ type: "conversation.item.input_audio_transcription.completed", event_id: "event:late", transcript: "Late speech" });
    handler.dispose();
    finish({ ok: true, realtime_transcript_observations: [{ observation_ref: "obs:late" }],
      realtime_stage_play_ask_handoff: { ...buildServerHandoff("obs:late"), thread_id: "helix-ask:room:room:one", transcript_text_char_count: 11 } });
    expect(await pending).toMatchObject({ reentry_status: "blocked", blocked_reason: "realtime_session_disposed" });
    expect(offer).not.toHaveBeenCalled();
    expect(useRoomMissionHandoffReview.getState().entries).toEqual([]);
  });

  it("requires a transcript observation receipt before read-only Ask re-entry", async () => {
    const serverHandoff = buildServerHandoff("obs:realtime:transcript:test");
    const postEvent = vi.fn(async () => ({
      ok: true,
      realtime_transcript_observations: [{ observation_ref: "obs:realtime:transcript:test" }],
      realtime_stage_play_ask_handoff: serverHandoff,
      realtime_stage_play_context_sync: {
        schema: "helix.realtime_stage_play.context_sync.v1",
        status: "sent",
      },
    }));
    const launchPrompt = vi.fn();
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt,
      getRuntimeContext: () => ({
        transportReceiptRef: "receipt:transport:test",
        vadState: "speech_stopped",
        interruptionCount: 1,
        audioFocusOwner: "helix_realtime",
        selectedRuntimeAgentProvider: "codex",
        sourceBinding: {
          thread_id: "helix-ask:desktop",
          source_id: "helix-ask:desktop",
          source_kind: "helix_ask_workstation",
          focus_panel_id: "scientific-calculator",
        },
      }),
    });

    const result = await handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:transcript:1",
      transcript: "Check the current workstation status.",
    });

    expect(postEvent).toHaveBeenCalledWith(
      "/api/agi/realtime/session/realtime%3Atest/event",
      expect.objectContaining({
        event_type: "transcript.final",
        transcript_text: "Check the current workstation status.",
        runtime_agent_authority: "observe_only",
        selected_runtime_agent_provider: "codex",
        realtime_transport_receipt_ref: "receipt:transport:test",
        realtime_vad_state: "speech_stopped",
        realtime_interruption_count: 1,
        realtime_audio_focus_owner: "helix_realtime",
        workstation_source_binding: expect.objectContaining({
          focus_panel_id: "scientific-calculator",
          source_kind: "helix_ask_workstation",
        }),
      }),
    );
    expect(launchPrompt).toHaveBeenCalledWith(expect.objectContaining({
      question: "Check the current workstation status.",
      autoSubmit: true,
      bypassWorkstationDispatch: true,
      forceReasoningDispatch: true,
      requiresBackendAskEntrypoint: true,
      suppressWorkstationPayloadActions: true,
      serverAdmittedRuntimeAgentProvider: "codex",
      routeMetadata: expect.objectContaining({
        source: "realtime_stage_play",
        invocationKind: "stage_play_realtime_transcript_handoff",
        handoffId: "realtime-stage-play-handoff:test",
        stagePlayEventRef: "stage-play-event:test",
        contextPackId: "context-pack:test",
        evidenceRefs: expect.arrayContaining(["obs:realtime:transcript:test"]),
        source_target_intent: expect.objectContaining({
          server_fixture_marker: "test",
        }),
      }),
    }));
    expect(result).toMatchObject({
      event_kind: "input_transcript_final",
      reentry_status: "reentered",
      tool_execution_attempted: false,
      workstation_action_executed: false,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      handoff_id: "realtime-stage-play-handoff:test",
      stage_play_event_ref: "stage-play-event:test",
      context_pack_id: "context-pack:test",
      context_sync_status: "sent",
      worker_admission_schema: "helix.realtime_worker_admission.v2",
      worker_dispatch_kind: "ask_runtime",
      worker_dispatch_state: "ask_prompt_launched",
      worker_turn_dispatched: true,
      runtime_goal_wake_requested: false,
    });
    expect(result).not.toHaveProperty("transcript_text");
  });

  it("keeps conversation-local speech in GPT Live without a duplicate Ask turn", async () => {
    const observationRef = "obs:realtime:local";
    const launchPrompt = vi.fn();
    const requestGoalWake = vi.fn(() => true);
    const postEvent = vi.fn(async (path: string) =>
      path.endsWith("/event")
        ? {
            ok: true,
            realtime_transcript_observations: [{ observation_ref: observationRef }],
            realtime_stage_play_ask_handoff: buildServerHandoff(observationRef, "local", {
              outcome: "conversation_local",
              dispatchKind: "none",
            }),
          }
        : { ok: true });
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt,
      requestGoalWake,
    });

    const result = await handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:transcript:local",
      transcript: "Thanks, that is all.",
    });

    expect(result).toMatchObject({
      reentry_status: "not_required",
      worker_dispatch_kind: "none",
      worker_dispatch_state: "skipped_local",
      worker_turn_dispatched: false,
      runtime_goal_wake_requested: false,
    });
    expect(launchPrompt).not.toHaveBeenCalled();
    expect(requestGoalWake).not.toHaveBeenCalled();
    expect(postEvent).toHaveBeenLastCalledWith(
      "/api/agi/realtime/session/realtime%3Atest/client-receipt",
      expect.objectContaining({
        receipt_kind: "worker_dispatch_skipped",
        reentry_required: false,
      }),
    );
  });

  it("defers a parallel Ask turn until its correlated Live playback settles", async () => {
    const observationRef = "obs:realtime:parallel-settlement";
    const handoff = buildServerHandoff(
      observationRef,
      "parallel-settlement",
      { interactionMode: "parallel_conversation" },
    );
    const postEvent = vi.fn(async (path: string) =>
      path.endsWith("/event")
        ? {
            ok: true,
            realtime_transcript_observations: [{ observation_ref: observationRef }],
            realtime_stage_play_ask_handoff: handoff,
          }
        : { ok: true });
    const launchPrompt = vi.fn();
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt,
      parallelDispatchFallbackMs: 60_000,
    });

    const transcript = await handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:transcript:parallel-settlement",
      transcript: "Explain why this boundary condition matters.",
    });

    expect(transcript).toMatchObject({
      reentry_status: "reentered",
      worker_dispatch_kind: "ask_runtime",
      worker_dispatch_state: "awaiting_live_turn_settlement",
      worker_turn_dispatched: false,
    });
    expect(launchPrompt).not.toHaveBeenCalled();
    expect(postEvent).toHaveBeenCalledWith(
      "/api/agi/realtime/session/realtime%3Atest/client-receipt",
      expect.objectContaining({
        receipt_kind: "worker_dispatch_deferred",
        worker_dispatch_state: "awaiting_live_turn_settlement",
        worker_turn_dispatched: false,
      }),
    );

    await handler.handle({
      type: "response.created",
      event_id: "event:response:parallel-settlement",
      response: {
        id: "response:parallel-settlement",
        status: "in_progress",
        metadata: {
          helix_purpose: "parallel_conversation",
          helix_handoff_id: handoff.handoff_id,
          helix_worker_admission_id: handoff.worker_admission.admission_id,
        },
      },
    });
    await handler.handle({
      type: "output_audio_buffer.stopped",
      event_id: "event:playback:parallel-settlement",
      response_id: "response:parallel-settlement",
    });

    expect(launchPrompt).toHaveBeenCalledOnce();
    expect(launchPrompt).toHaveBeenCalledWith(expect.objectContaining({
      question: "Explain why this boundary condition matters.",
      serverAdmittedRuntimeAgentProvider: "codex",
    }));
    expect(postEvent).toHaveBeenCalledWith(
      "/api/agi/realtime/session/realtime%3Atest/client-receipt",
      expect.objectContaining({
        receipt_kind: "worker_dispatch_requested",
        worker_dispatch_state: "ask_prompt_launched",
        worker_dispatch_settlement_reason: "live_response_playback_ended",
        worker_turn_dispatched: true,
      }),
    );
    handler.dispose();
  });

  it("cancels a staged parallel Ask turn when the user resumes speaking", async () => {
    const observationRef = "obs:realtime:parallel-continued";
    const handoff = buildServerHandoff(
      observationRef,
      "parallel-continued",
      { interactionMode: "parallel_conversation" },
    );
    const postEvent = vi.fn(async (path: string) =>
      path.endsWith("/event")
        ? {
            ok: true,
            realtime_transcript_observations: [{ observation_ref: observationRef }],
            realtime_stage_play_ask_handoff: handoff,
          }
        : { ok: true });
    const launchPrompt = vi.fn();
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt,
      parallelDispatchFallbackMs: 60_000,
    });

    await handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:transcript:parallel-continued",
      transcript: "I was listening to a discussion of the Casimir operator.",
    });
    await handler.handle({
      type: "input_audio_buffer.speech_started",
      event_id: "event:speech:parallel-continued",
    });
    await handler.handle({
      type: "response.created",
      event_id: "event:response:parallel-continued",
      response: {
        id: "response:parallel-continued",
        status: "in_progress",
        metadata: {
          helix_purpose: "parallel_conversation",
          helix_handoff_id: handoff.handoff_id,
          helix_worker_admission_id: handoff.worker_admission.admission_id,
        },
      },
    });
    await handler.handle({
      type: "output_audio_buffer.stopped",
      event_id: "event:playback:parallel-continued",
      response_id: "response:parallel-continued",
    });

    expect(launchPrompt).not.toHaveBeenCalled();
    expect(postEvent).toHaveBeenCalledWith(
      "/api/agi/realtime/session/realtime%3Atest/client-receipt",
      expect.objectContaining({
        receipt_kind: "worker_dispatch_skipped",
        worker_dispatch_state: "cancelled_user_continuation",
        worker_dispatch_settlement_reason: "user_speech_resumed",
        worker_turn_dispatched: false,
      }),
    );
    handler.dispose();
  });

  it("rejects a parallel dispatch when speech resumes while its handoff is returning", async () => {
    const observationRef = "obs:realtime:parallel-return-race";
    const handoff = buildServerHandoff(
      observationRef,
      "parallel-return-race",
      { interactionMode: "parallel_conversation" },
    );
    let resolveHandoff!: (value: Record<string, unknown>) => void;
    const pendingHandoff = new Promise<Record<string, unknown>>((resolve) => {
      resolveHandoff = resolve;
    });
    const postEvent = vi.fn((path: string) =>
      path.endsWith("/event") ? pendingHandoff : Promise.resolve({ ok: true }));
    const launchPrompt = vi.fn();
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt,
      parallelDispatchFallbackMs: 60_000,
    });

    const transcriptProjection = handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:transcript:parallel-return-race",
      transcript: "This is the first part of a longer thought.",
    });
    await handler.handle({
      type: "input_audio_buffer.speech_started",
      event_id: "event:speech:parallel-return-race",
    });
    resolveHandoff({
      ok: true,
      realtime_transcript_observations: [{ observation_ref: observationRef }],
      realtime_stage_play_ask_handoff: handoff,
    });

    const result = await transcriptProjection;

    expect(result).toMatchObject({
      worker_dispatch_state: "cancelled_user_continuation",
      worker_turn_dispatched: false,
    });
    expect(launchPrompt).not.toHaveBeenCalled();
    expect(postEvent).toHaveBeenCalledWith(
      "/api/agi/realtime/session/realtime%3Atest/client-receipt",
      expect.objectContaining({
        receipt_kind: "worker_dispatch_skipped",
        worker_dispatch_settlement_reason:
          "speech_resumed_before_handoff_returned",
      }),
    );
    handler.dispose();
  });

  it("uses a bounded fallback when no correlated Live playback event arrives", async () => {
    vi.useFakeTimers();
    try {
      const observationRef = "obs:realtime:parallel-fallback";
      const handoff = buildServerHandoff(
        observationRef,
        "parallel-fallback",
        { interactionMode: "parallel_conversation" },
      );
      const postEvent = vi.fn(async (path: string) =>
        path.endsWith("/event")
          ? {
              ok: true,
              realtime_transcript_observations: [{ observation_ref: observationRef }],
              realtime_stage_play_ask_handoff: handoff,
            }
          : { ok: true });
      const launchPrompt = vi.fn();
      const handler = createHelixAskRealtimeProviderEventHandler({
        realtimeSessionId: "realtime:test",
        runtimeAgentAuthority: "observe_only",
        postEvent,
        launchPrompt,
        parallelDispatchFallbackMs: 1_000,
      });

      await handler.handle({
        type: "conversation.item.input_audio_transcription.completed",
        event_id: "event:transcript:parallel-fallback",
        transcript: "Explain this concept.",
      });
      expect(launchPrompt).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);

      expect(launchPrompt).toHaveBeenCalledOnce();
      expect(postEvent).toHaveBeenCalledWith(
        "/api/agi/realtime/session/realtime%3Atest/client-receipt",
        expect.objectContaining({
          receipt_kind: "worker_dispatch_requested",
          worker_dispatch_settlement_reason: "settlement_fallback_elapsed",
        }),
      );
      handler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("wakes the bound durable goal without launching a parallel Ask answer", async () => {
    const observationRef = "obs:realtime:goal";
    const launchPrompt = vi.fn();
    const requestGoalWake = vi.fn(() => true);
    const postEvent = vi.fn(async (path: string) =>
      path.endsWith("/event")
        ? {
            ok: true,
            realtime_transcript_observations: [{ observation_ref: observationRef }],
            realtime_stage_play_ask_handoff: buildServerHandoff(observationRef, "goal", {
              outcome: "durable_goal_bound",
              dispatchKind: "goal_wake",
              goalId: "goal:voice-bound",
            }),
          }
        : { ok: true });
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt,
      requestGoalWake,
    });

    const result = await handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:transcript:goal",
      transcript: "Continue the active document review goal.",
    });

    expect(requestGoalWake).toHaveBeenCalledWith(expect.objectContaining({
      goalId: "goal:voice-bound",
      runtimeGoalSessionRef: "runtime-goal-session:goal",
      runtimeAgentProvider: "codex",
      transcript: "Continue the active document review goal.",
      observationRef,
    }));
    expect(launchPrompt).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      reentry_status: "reentered",
      worker_dispatch_kind: "goal_wake",
      worker_dispatch_state: "goal_wake_requested",
      worker_turn_dispatched: true,
      runtime_goal_wake_requested: true,
    });
  });

  it("routes action candidates to read-only Ask reasoning without executing the action", async () => {
    const observationRef = "obs:realtime:action";
    const launchPrompt = vi.fn();
    const postEvent = vi.fn(async (path: string) =>
      path.endsWith("/event")
        ? {
            ok: true,
            realtime_transcript_observations: [{ observation_ref: observationRef }],
            realtime_stage_play_ask_handoff: buildServerHandoff(observationRef, "action", {
              outcome: "action_candidate",
              dispatchKind: "ask_runtime_read_only",
            }),
          }
        : { ok: true });
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "suggest_actions",
      postEvent,
      launchPrompt,
    });

    const result = await handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:transcript:action",
      transcript: "Open the account panel.",
    });

    expect(launchPrompt).toHaveBeenCalledWith(expect.objectContaining({
      suppressWorkstationPayloadActions: true,
      routeMetadata: expect.objectContaining({
        forbiddenCapabilities: expect.arrayContaining([
          "workstation_action_execution",
          "realtime_provider_tool_execution",
        ]),
      }),
    }));
    expect(result).toMatchObject({
      worker_dispatch_kind: "ask_runtime_read_only",
      worker_dispatch_state: "ask_prompt_launched",
      worker_turn_dispatched: true,
      workstation_action_executed: false,
      tool_execution_attempted: false,
    });
  });

  it("does not execute or re-enter provider tool-call events", async () => {
    const postEvent = vi.fn();
    const launchPrompt = vi.fn();
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "suggest_actions",
      postEvent,
      launchPrompt,
    });
    const result = await handler.handle({
      type: "response.function_call_arguments.done",
      name: "workstation.open_panel",
      arguments: "{\"panel\":\"docs\"}",
    });
    expect(result).toMatchObject({ event_kind: "ignored", reentry_status: "not_required" });
    expect(postEvent).not.toHaveBeenCalled();
    expect(launchPrompt).not.toHaveBeenCalled();
  });

  it("captures a completed output-audio transcript without exporting deltas as payload", async () => {
    const postEvent = vi.fn();
    const projections = vi.fn();
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:output-transcript",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt: vi.fn(),
      onProjection: projections,
      nowMs: () => 500,
    });

    const partial = await handler.handle({
      type: "response.output_audio_transcript.delta",
      event_id: "event:output-transcript:delta",
      response_id: "response:output-transcript",
      item_id: "item:output-audio",
      content_index: 0,
      delta: "The active panel is ",
    });
    const completed = await handler.handle({
      type: "response.output_audio_transcript.done",
      event_id: "event:output-transcript:done",
      response_id: "response:output-transcript",
      item_id: "item:output-audio",
      content_index: 0,
      transcript: "The active panel is Account & Sessions.",
    });

    expect(partial).toMatchObject({
      event_kind: "output_transcript",
      provider_response_ref: "response:output-transcript",
      completed_output_transcript: null,
      raw_content_included: false,
    });
    expect(completed).toMatchObject({
      event_kind: "output_transcript",
      provider_response_ref: "response:output-transcript",
      transcript_char_count: 39,
      completed_output_transcript: {
        capture_status: "captured",
        provider_response_ref: "response:output-transcript",
        provider_item_ref: "item:output-audio",
        sanitized_transcript_text: "The active panel is Account & Sessions.",
        transcript_delta_count: 1,
        provider_payload_included: false,
        output_audio_transcript_deltas_included: false,
        answer_authority: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    });
    expect(postEvent).not.toHaveBeenCalled();
    expect(projections).toHaveBeenCalledTimes(2);
  });

  it("binds a spoken provisional status to server-issued response metadata", async () => {
    const postEvent = vi.fn(async () => ({ ok: true }));
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:provisional-binding",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt: vi.fn(),
      nowMs: () => 600,
    });

    await handler.handle({
      type: "response.created",
      event_id: "event:response:created",
      response: {
        id: "response:provisional-status",
        status: "in_progress",
        metadata: {
          helix_purpose: "worker_dispatch_status",
          helix_provisional_response_id: "realtime-provisional-response:test",
          helix_handoff_id: "realtime-stage-play-handoff:test",
          helix_worker_admission_id: "realtime-worker-admission:test",
          helix_utterance_code: "workstation_context_check_in_progress",
        },
      },
    });
    const completed = await handler.handle({
      type: "response.output_audio_transcript.done",
      event_id: "event:output-transcript:bound",
      response_id: "response:provisional-status",
      item_id: "item:provisional-status",
      content_index: 0,
      transcript: "I'm checking the current workstation view.",
    });

    expect(completed.completed_output_transcript).toMatchObject({
      provider_response_ref: "response:provisional-status",
      helix_response_purpose: "worker_dispatch_status",
      helix_provisional_response_id: "realtime-provisional-response:test",
      helix_handoff_id: "realtime-stage-play-handoff:test",
      helix_worker_admission_id: "realtime-worker-admission:test",
      helix_utterance_code: "workstation_context_check_in_progress",
      correlation_source: "provider_response_created_metadata",
      raw_provider_metadata_included: false,
      provider_payload_included: false,
      raw_content_included: false,
    });
  });

  it("deduplicates non-terminal client playback receipts", async () => {
    const postEvent = vi.fn(async () => ({ ok: true }));
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt: vi.fn(),
    });
    const event = {
      type: "response.output_audio.delta",
      event_id: "event:audio:1",
      response_id: "response:1",
      delta: "base64-audio",
    };
    await handler.handle(event);
    await handler.handle({ ...event, event_id: "event:audio:2" });
    await handler.handle({
      type: "response.output_audio.done",
      event_id: "event:audio:done",
      response_id: "response:1",
    });
    expect(postEvent).toHaveBeenCalledTimes(2);
    expect(postEvent).toHaveBeenNthCalledWith(
      1,
      "/api/agi/realtime/session/realtime%3Atest/client-receipt",
      expect.objectContaining({ receipt_kind: "playback_started", terminal_eligible: false }),
    );
    expect(postEvent).toHaveBeenNthCalledWith(
      2,
      "/api/agi/realtime/session/realtime%3Atest/client-receipt",
      expect.objectContaining({ receipt_kind: "playback_ended", terminal_eligible: false }),
    );
  });

  it("recognizes WebRTC output buffer lifecycle as non-terminal playback", async () => {
    const postEvent = vi.fn(async () => ({ ok: true }));
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:webrtc-buffer",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt: vi.fn(),
    });

    const started = await handler.handle({
      type: "output_audio_buffer.started",
      event_id: "event:buffer:started",
      response_id: "response:buffer",
    });
    const stopped = await handler.handle({
      type: "output_audio_buffer.stopped",
      event_id: "event:buffer:stopped",
      response_id: "response:buffer",
    });

    expect(started).toMatchObject({
      event_kind: "playback",
      answer_authority: false,
      terminal_eligible: false,
    });
    expect(stopped).toMatchObject({
      event_kind: "playback",
      answer_authority: false,
      terminal_eligible: false,
    });
  });

  it("normalizes VAD and interruption events into safe non-terminal receipts", async () => {
    const postEvent = vi.fn(async () => ({ ok: true }));
    const projections = vi.fn();
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt: vi.fn(),
      onProjection: projections,
    });

    const vad = await handler.handle({
      type: "input_audio_buffer.speech_started",
      event_id: "event:vad:1",
    });
    const interrupted = await handler.handle({
      type: "conversation.item.truncated",
      event_id: "event:interrupt:1",
    });

    expect(vad).toMatchObject({
      event_kind: "vad",
      vad_state: "speech_started",
      response_interrupted: false,
      terminal_eligible: false,
    });
    expect(interrupted).toMatchObject({
      event_kind: "interruption",
      response_interrupted: true,
      terminal_eligible: false,
    });
    expect(postEvent).toHaveBeenNthCalledWith(
      1,
      "/api/agi/realtime/session/realtime%3Atest/client-receipt",
      expect.objectContaining({
        receipt_kind: "vad_speech_started",
        qualified_user_interruption: false,
      }),
    );
    expect(postEvent).toHaveBeenNthCalledWith(
      2,
      "/api/agi/realtime/session/realtime%3Atest/client-receipt",
      expect.objectContaining({
        receipt_kind: "response_interrupted",
        response_interrupted: true,
        qualified_user_interruption: false,
      }),
    );
    expect(projections).toHaveBeenCalledTimes(2);
  });

  it("normalizes response lifecycle without admitting it as answer authority", async () => {
    const postEvent = vi.fn(async () => ({ ok: true }));
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt: vi.fn(),
    });

    const started = await handler.handle({
      type: "response.created",
      event_id: "event:response:start",
      response: { id: "response:safe-ref", status: "in_progress" },
    });
    const completed = await handler.handle({
      type: "response.done",
      event_id: "event:response:done",
      response: { id: "response:safe-ref", status: "completed" },
    });

    expect(started).toMatchObject({
      event_kind: "response",
      response_status: "in_progress",
      provider_response_ref: "response:safe-ref",
      answer_authority: false,
      terminal_eligible: false,
    });
    expect(completed).toMatchObject({
      event_kind: "response",
      response_status: "completed",
      answer_authority: false,
      terminal_eligible: false,
    });
    expect(postEvent).toHaveBeenNthCalledWith(
      1,
      "/api/agi/realtime/session/realtime%3Atest/client-receipt",
      expect.objectContaining({
        receipt_kind: "response_started",
        provider_response_ref: "response:safe-ref",
      }),
    );
    expect(postEvent).toHaveBeenNthCalledWith(
      2,
      "/api/agi/realtime/session/realtime%3Atest/client-receipt",
      expect.objectContaining({
        receipt_kind: "response_completed",
        raw_content_included: false,
      }),
    );
  });

  it("suppresses short terminal-voice overlap as potential speaker loopback", async () => {
    let nowMs = 1000;
    const postEvent = vi.fn(async () => ({ ok: true }));
    const launchPrompt = vi.fn();
    const interruptTerminalVoice = vi.fn(() => true);
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt,
      nowMs: () => nowMs,
      readAudioFocus: () => ({
        active_id: "terminal:1",
        active_kind: "helix_terminal_voice",
        active_priority: 100,
        resumable_id: "realtime:1",
      }),
      interruptTerminalVoice,
    });

    await handler.handle({
      type: "input_audio_buffer.speech_started",
      event_id: "event:short:start",
    });
    nowMs += 250;
    await handler.handle({
      type: "input_audio_buffer.speech_stopped",
      event_id: "event:short:stop",
    });
    const result = await handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:short:transcript",
      transcript: "Potential speaker echo.",
    });

    expect(result).toMatchObject({
      reentry_status: "blocked",
      blocked_reason: "speaker_loopback_suppressed",
      speaker_loopback_suppressed: true,
      qualified_user_interruption: false,
    });
    expect(postEvent).toHaveBeenLastCalledWith(
      "/api/agi/realtime/session/realtime%3Atest/client-receipt",
      expect.objectContaining({
        receipt_kind: "speaker_loopback_suppressed",
        raw_content_included: false,
      }),
    );
    expect(interruptTerminalVoice).not.toHaveBeenCalled();
    expect(launchPrompt).not.toHaveBeenCalled();
  });

  it("admits persistent AEC-plus-VAD speech as a qualified terminal-voice barge-in", async () => {
    let nowMs = 2000;
    const postEvent = vi.fn(async (path: string) =>
      path.endsWith("/event")
        ? {
            ok: true,
            realtime_transcript_observations: [
              { observation_ref: "obs:realtime:qualified-barge" },
            ],
            realtime_stage_play_ask_handoff: buildServerHandoff(
              "obs:realtime:qualified-barge",
              "qualified-barge",
            ),
          }
        : { ok: true });
    const launchPrompt = vi.fn();
    const interruptTerminalVoice = vi.fn(() => true);
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt,
      nowMs: () => nowMs,
      readAudioFocus: () => ({
        active_id: "terminal:1",
        active_kind: "helix_terminal_voice",
        active_priority: 100,
        resumable_id: "realtime:1",
      }),
      interruptTerminalVoice,
    });

    await handler.handle({
      type: "input_audio_buffer.speech_started",
      event_id: "event:barge:start",
    });
    nowMs += 800;
    await handler.handle({
      type: "input_audio_buffer.speech_stopped",
      event_id: "event:barge:stop",
    });
    const result = await handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:barge:transcript",
      transcript: "Stop and check the workstation status.",
    });

    expect(interruptTerminalVoice).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      reentry_status: "reentered",
      qualified_user_interruption: true,
      speaker_loopback_suppressed: false,
    });
    expect(postEvent).toHaveBeenCalledWith(
      "/api/agi/realtime/session/realtime%3Atest/client-receipt",
      expect.objectContaining({
        receipt_kind: "qualified_barge_in",
        terminal_voice_interrupted: true,
        barge_in_qualification_basis:
          "browser_echo_cancellation_plus_persistent_provider_vad",
      }),
    );
    expect(launchPrompt).toHaveBeenCalledWith(expect.objectContaining({
      question: "Stop and check the workstation status.",
      routeMetadata: expect.objectContaining({
        source_target_intent: expect.objectContaining({
          server_fixture_marker: "qualified-barge",
        }),
      }),
    }));
  });

  it("fails closed when the observation receipt is missing", async () => {
    const launchPrompt = vi.fn();
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent: vi.fn(async () => ({ ok: true, realtime_transcript_observations: [] })),
      launchPrompt,
    });
    const result = await handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:transcript:missing",
      transcript: "What changed?",
    });
    expect(result).toMatchObject({
      reentry_status: "blocked",
      blocked_reason: "realtime_transcript_observation_receipt_missing",
    });
    expect(launchPrompt).not.toHaveBeenCalled();
  });

  it("fails closed when the server observation has no canonical Stage Play handoff", async () => {
    const launchPrompt = vi.fn();
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent: vi.fn(async () => ({
        ok: true,
        realtime_transcript_observations: [{ observation_ref: "obs:realtime:no-handoff" }],
      })),
      launchPrompt,
    });
    const result = await handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:transcript:no-handoff",
      transcript: "What changed?",
    });
    expect(result).toMatchObject({
      reentry_status: "blocked",
      blocked_reason: "realtime_stage_play_ask_handoff_missing",
    });
    expect(launchPrompt).not.toHaveBeenCalled();
  });

  it("rejects a handoff whose route metadata can bypass the read-only Ask boundary", async () => {
    const launchPrompt = vi.fn();
    const unsafeHandoff = buildServerHandoff("obs:realtime:unsafe-route", "unsafe-route");
    unsafeHandoff.route_metadata.source_target_intent.allow_client_shortcut = true;
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent: vi.fn(async () => ({
        ok: true,
        realtime_transcript_observations: [{ observation_ref: "obs:realtime:unsafe-route" }],
        realtime_stage_play_ask_handoff: unsafeHandoff,
      })),
      launchPrompt,
    });

    const result = await handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:transcript:unsafe-route",
      transcript: "What changed?",
    });

    expect(result).toMatchObject({
      reentry_status: "blocked",
      blocked_reason: "realtime_stage_play_ask_handoff_missing",
    });
    expect(launchPrompt).not.toHaveBeenCalled();
  });

  it("rejects an unregistered server-selected runtime before launching Ask", async () => {
    const observationRef = "obs:realtime:invalid-runtime";
    const launchPrompt = vi.fn();
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent: vi.fn(async () => ({
        ok: true,
        realtime_transcript_observations: [{ observation_ref: observationRef }],
        realtime_stage_play_ask_handoff: buildServerHandoff(
          observationRef,
          "invalid-runtime",
          { runtimeProvider: "unregistered-runtime" },
        ),
      })),
      launchPrompt,
    });

    const result = await handler.handle({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:transcript:invalid-runtime",
      transcript: "Check the current workstation state.",
    });

    expect(result).toMatchObject({
      reentry_status: "blocked",
      blocked_reason: "realtime_stage_play_ask_handoff_missing",
    });
    expect(launchPrompt).not.toHaveBeenCalled();
  });

  it("allows a failed server handoff request to retry without duplicate Ask launch", async () => {
    const observationRef = "obs:realtime:retry";
    const postEvent = vi.fn()
      .mockResolvedValueOnce({ ok: true, realtime_transcript_observations: [] })
      .mockResolvedValueOnce({
        ok: true,
        realtime_transcript_observations: [{ observation_ref: observationRef }],
        realtime_stage_play_ask_handoff: buildServerHandoff(observationRef, "retry"),
      });
    const launchPrompt = vi.fn();
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "observe_only",
      postEvent,
      launchPrompt,
    });
    const event = {
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "event:transcript:retry",
      transcript: "Retry this admitted transcript.",
    };

    expect(await handler.handle(event)).toMatchObject({ reentry_status: "blocked" });
    expect(await handler.handle(event)).toMatchObject({ reentry_status: "reentered" });
    expect(await handler.handle(event)).toMatchObject({
      reentry_status: "blocked",
      blocked_reason: "duplicate_realtime_transcript_event",
    });
    expect(postEvent).toHaveBeenCalledTimes(3);
    expect(launchPrompt).toHaveBeenCalledTimes(1);
  });
});
