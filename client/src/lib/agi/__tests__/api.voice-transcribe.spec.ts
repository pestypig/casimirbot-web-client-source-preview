import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let transcribeVoice: typeof import("@/lib/agi/api").transcribeVoice;
let runConversationTurn: typeof import("@/lib/agi/api").runConversationTurn;
let askLocal: typeof import("@/lib/agi/api").askLocal;
let runAskTurn: typeof import("@/lib/agi/api").runAskTurn;
let runAskTurnStream: typeof import("@/lib/agi/api").runAskTurnStream;
let runCapabilityLaneOneShot: typeof import("@/lib/agi/api").runCapabilityLaneOneShot;
let runCapabilityLaneSessionControl: typeof import("@/lib/agi/api").runCapabilityLaneSessionControl;
let runCapabilityLaneGoalBindingControl: typeof import("@/lib/agi/api").runCapabilityLaneGoalBindingControl;
let runCapabilityLaneMailLoop: typeof import("@/lib/agi/api").runCapabilityLaneMailLoop;
let getVoiceCallDiagnosticsSnapshot: typeof import("@/lib/helix/voice-call-diagnostics").getVoiceCallDiagnosticsSnapshot;
let clearVoiceCallDiagnosticsSnapshot: typeof import("@/lib/helix/voice-call-diagnostics").clearVoiceCallDiagnosticsSnapshot;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  ({
    transcribeVoice,
    runConversationTurn,
    askLocal,
    runAskTurn,
    runAskTurnStream,
    runCapabilityLaneOneShot,
    runCapabilityLaneSessionControl,
    runCapabilityLaneGoalBindingControl,
    runCapabilityLaneMailLoop,
  } = await import("@/lib/agi/api"));
  ({ getVoiceCallDiagnosticsSnapshot, clearVoiceCallDiagnosticsSnapshot } = await import(
    "@/lib/helix/voice-call-diagnostics"
  ));
});

describe("transcribeVoice", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearVoiceCallDiagnosticsSnapshot();
  });

  it("uploads multipart audio and parses the JSON response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          text: "Captured transcript",
          language: "en",
          duration_ms: 1200,
          traceId: "trace-1",
          missionId: "mission-1",
          engine: "faster_whisper_local",
          segments: [],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const audio = new Blob(["voice-bytes"], { type: "audio/webm" });
    const res = await transcribeVoice({
      audio,
      traceId: "trace-1",
      missionId: "mission-1",
      room_id: "room-1",
      thread_id: "thread-1",
      capture_session_id: "capture-1",
      chunk_index: 3,
      capture_source: "display_tab_audio",
      command_lane_enabled: false,
      speaker_identity_enabled: true,
      speaker_policy_mode: "trusted_session",
      known_speaker_ids: ["spk_owner"],
      active_listener_speaker_ids: ["spk_owner"],
      unknown_speaker_behavior: "transcribe_only",
      audio_identity_session_id: "audio-session-1",
      speaker_id: "spk_owner",
      speaker_confidence: 0.92,
      speaker_role: "owner",
      speaker_authority: "command_allowed",
      overlapping_speech: false,
      durationMs: 1200,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/voice/transcribe",
      expect.objectContaining({ method: "POST" }),
    );
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const body = options.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("traceId")).toBe("trace-1");
    expect(body.get("missionId")).toBe("mission-1");
    expect(body.get("room_id")).toBe("room-1");
    expect(body.get("thread_id")).toBe("thread-1");
    expect(body.get("capture_session_id")).toBe("capture-1");
    expect(body.get("chunk_index")).toBe("3");
    expect(body.get("capture_source")).toBe("display_tab_audio");
    expect(body.get("command_lane_enabled")).toBe("0");
    expect(body.get("speaker_identity_enabled")).toBe("1");
    expect(body.get("speaker_policy_mode")).toBe("trusted_session");
    expect(body.get("known_speaker_ids")).toBe("spk_owner");
    expect(body.get("active_listener_speaker_ids")).toBe("spk_owner");
    expect(body.get("unknown_speaker_behavior")).toBe("transcribe_only");
    expect(body.get("audio_identity_session_id")).toBe("audio-session-1");
    expect(body.get("speaker_id")).toBe("spk_owner");
    expect(body.get("speaker_confidence")).toBe("0.92");
    expect(body.get("speaker_role")).toBe("owner");
    expect(body.get("speaker_authority")).toBe("command_allowed");
    expect(body.get("overlapping_speech")).toBe("0");
    expect(body.get("durationMs")).toBe("1200");
    const audioEntry = body.get("audio") as File;
    expect(audioEntry).toBeTruthy();
    expect(audioEntry.name).toBe("helix-voice-input.webm");
    expect(audioEntry.type).toBe("audio/webm");
    expect(res).toMatchObject({
      ok: true,
      text: "Captured transcript",
      traceId: "trace-1",
      missionId: "mission-1",
      engine: "faster_whisper_local",
    });
    const calls = getVoiceCallDiagnosticsSnapshot();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      kind: "transcribe",
      endpoint: "/api/voice/transcribe",
      ok: true,
      status: 200,
      responseKind: "json",
      traceId: "trace-1",
      missionId: "mission-1",
      audioBytes: 11,
      audioMimeType: "audio/webm",
      audioDurationMs: 1200,
    });
    expect(JSON.stringify(calls[0])).not.toContain("Captured transcript");
  });
});

describe("runConversationTurn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts conversation-lane payload and parses classification + brief response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          traceId: "voice-trace-1",
          classification: {
            mode: "verify",
            confidence: 0.88,
            dispatch_hint: true,
            clarify_needed: false,
            reason: "Verification intent detected.",
            source: "llm",
          },
          brief: {
            text: "I will verify that claim and report pass/fail evidence next.",
            source: "llm",
          },
          dispatch: {
            dispatch_hint: true,
            reason: "dispatch:verify",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await runConversationTurn({
      transcript: "Please verify this claim before acting.",
      sessionId: "session-1",
      traceId: "voice-trace-1",
      missionId: "mission-1",
      sourceLanguage: "en",
      translated: false,
      recentTurns: ["user: prior line", "dottie: prior brief"],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agi/ask/conversation-turn",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    expect(JSON.parse(String(request.body))).toEqual({
      transcript: "Please verify this claim before acting.",
      sessionId: "session-1",
      traceId: "voice-trace-1",
      missionId: "mission-1",
      sourceLanguage: "en",
      translated: false,
      recentTurns: ["user: prior line", "dottie: prior brief"],
    });
    expect(response.classification?.mode).toBe("verify");
    expect(response.brief?.text).toContain("verify");
    expect(response.dispatch?.dispatch_hint).toBe(true);
  });
});

describe("askLocal capsule ids", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__HELIX_E8_14_LANE_PARITY__ = false;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__HELIX_E8_14_LANE_PARITY__;
    vi.unstubAllGlobals();
  });

  it("keeps retained scientific-image comparisons on the Ask turn entrypoint when legacy parity is disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "Retained comparison turn response.",
          turn_id: "ask:test-retained-comparison-entrypoint",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await askLocal(undefined, {
      question: "Using the saved machine-readable page-8 text and the latest retained scientific Image Lens sidecar for https://arxiv.org/pdf/2401.12345, compare equation (47) row by row. Report symbol and subscript agreements and mismatches. Do not render the PDF again, do not run a new Image Lens crop, and do not promote exact evidence unless the two sources agree.",
    });

    expect(response.text).toBe("Retained comparison turn response.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/ask/turn");
  });

  it("caps capsule ids to 12 in job payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobId: "job-capsule-limit",
            status: "pending",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobId: "job-capsule-limit",
            status: "completed",
            result: { text: "ok" },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const capsuleIds = Array.from({ length: 20 }, (_entry, index) => `HXFP-${String(index).padStart(6, "0")}`);
    await askLocal(undefined, {
      question: "test additive capsules",
      capsuleIds,
    });

    const createRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(createRequest.body)) as { capsuleIds?: string[] };
    expect(payload.capsuleIds).toEqual(capsuleIds.slice(0, 12));
  });

  it("routes typed turn input items through the Ask turn endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          text: "ok",
          selected_final_answer: "ok",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await askLocal(undefined, {
      question: "Use the attached pasted text.",
      turnInputItems: [
        { type: "text", text: "Use the attached pasted text.", source: "user" },
        {
          type: "attachment",
          attachment_id: "attachment:test",
          attachment_kind: "text",
          mime_type: "text/plain",
          file_name: "pasted-text-test.txt",
          size_bytes: 42,
          content_base64: "cGF5bG9hZA==",
          content_sha256: "hash-test",
          preview: "payload",
          raw_content_included: true,
          raw_content_scope: "turn_input_only",
          assistant_answer: false,
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/ask/turn");
    const createRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(createRequest.body)) as {
      turn_input_items?: Array<Record<string, unknown>>;
    };
    expect(payload.turn_input_items).toHaveLength(2);
    expect(payload.turn_input_items?.[1]).toMatchObject({
      type: "attachment",
      attachment_kind: "text",
      content_sha256: "hash-test",
      raw_content_scope: "turn_input_only",
    });
  });

  it("preserves full prompts when they contain a Question header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobId: "job-compound-question-header",
            status: "pending",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobId: "job-compound-question-header",
            status: "completed",
            result: { text: "ok" },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const prompt = [
      "Question: diagnose Helix Ask large prompt behavior",
      "",
      "Context:",
      "1. preserve global context",
      "2. compare with Codex compaction",
      "3. propose code changes",
    ].join("\n");
    await askLocal(prompt);

    const createRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(createRequest.body)) as Record<string, unknown>;
    expect(payload.prompt).toBe(prompt);
    expect(payload.raw_user_prompt).toBe(prompt);
    expect(payload.question).toBe(prompt);
    expect(payload.question_source).toBe("raw_prompt");
    expect(payload.extracted_question_label).toBe("diagnose Helix Ask large prompt behavior");
  });

  it("blocks direct fallback when a created job disappears during polling", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobId: "job-missing-race",
            status: "queued",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobId: "job-partial-interrupted",
            status: "completed",
            partialText: "Request interrupted. Please try again.",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await askLocal(undefined, {
      question: "how do we solve the warp level in codebase?",
    });

    expect(response.text).toBe("Request interrupted. Please try again.");
    expect(response).toMatchObject({
      ok: false,
      error: "helix_ask_job_direct_fallback_blocked",
      fail_reason: "HELIX_ASK_JOB_DIRECT_FALLBACK_BLOCKED",
      fail_class: "client_transport_duplicate_execution_guard",
      client_transport_fallback: true,
      client_transport_fallback_reason: "job_created_poll_interrupted",
      fallback_blocked: true,
      fallback_block_reason: "job_created_direct_reexecution_blocked",
      terminal_eligible: false,
      authorityVerified: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/ask/jobs");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/agi/ask/jobs/job-missing-race");
    expect(fetchMock.mock.calls.some((call) => call[0] === "/api/agi/ask")).toBe(false);
  });

  it("preserves request identity and route metadata while blocking job-to-direct re-execution", async () => {
    const routeMetadata = {
      schema: "helix.ask.route_metadata.v1",
      invocationKind: "behavior_trap_characterization",
      requiredCanonicalGoal: "transport_duplicate_execution_probe",
      allowedCapabilities: ["repo.search"],
      forbiddenCapabilities: ["workspace_os.write"],
      source_target_intent: {
        schema: "helix.ask_source_target_intent.v1",
        target_source: "repo_code",
        strength: "hard",
      },
      mandatory_next_tool: {
        schema: "helix.mandatory_next_tool.v1",
        tool_name: "repo.search",
        terminal_forbidden: true,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobId: "job-current-body",
            status: "queued",
            sessionId: "session-from-job",
            traceId: "trace-from-job",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "not_found",
          }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await askLocal("Find the current repo authority owner.", {
      question: "Find the current repo authority owner.",
      sessionId: "session-from-client",
      traceId: "trace-from-client",
      route_metadata: routeMetadata,
    });

    expect(response.text).toBe("Request interrupted. Please try again.");
    expect(response).toMatchObject({
      ok: false,
      error: "helix_ask_job_direct_fallback_blocked",
      fail_reason: "HELIX_ASK_JOB_DIRECT_FALLBACK_BLOCKED",
      fail_class: "client_transport_duplicate_execution_guard",
      client_transport_fallback: true,
      fallback_blocked: true,
      terminal_eligible: false,
      authorityVerified: false,
    });
    expect(response.debug?.duplicate_execution_guard).toMatchObject({
      schema: "helix.ask.client_transport_duplicate_execution_guard.v1",
      jobId: "job-current-body",
      action: "blocked_direct_fallback_after_job_created",
      assistant_answer: false,
      terminal_eligible: false,
      authorityVerified: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/ask/jobs");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/agi/ask/jobs/job-current-body");
    const jobBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body ?? "{}"));
    expect(jobBody).toMatchObject({
      sessionId: "session-from-client",
      traceId: "trace-from-client",
      route_metadata: routeMetadata,
      source_target_intent: routeMetadata.source_target_intent,
      mandatory_next_tool: routeMetadata.mandatory_next_tool,
    });
    expect(fetchMock.mock.calls.some((call) => call[0] === "/api/agi/ask")).toBe(false);
  });

  it("blocks direct fallback when polling returns interrupted text after a partial result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobId: "job-partial-interrupted",
            status: "queued",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "not_found",
          }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await askLocal(undefined, {
      question: "partial interrupted probe",
    });

    expect(response.text).toBe("Request interrupted. Please try again.");
    expect(response.client_transport_fallback).toBe(true);
    expect(response.fallback_blocked).toBe(true);
    expect(response.terminal_eligible).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some((call) => call[0] === "/api/agi/ask")).toBe(false);
  });

  it("falls back to legacy direct ask when jobs are unsupported under the current compatibility flag", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "not_found",
          }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            text: "Legacy direct compatibility response.",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await askLocal(undefined, {
      question: "compatibility path probe",
      sessionId: "session-compat",
      traceId: "trace-compat",
    });

    expect(response.text).toBe("Legacy direct compatibility response.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/ask/jobs");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/agi/ask");
    const directBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body ?? "{}"));
    expect(directBody).toMatchObject({
      question: "compatibility path probe",
      sessionId: "session-compat",
      traceId: "trace-compat",
    });
  });

  it("maps blocked multilang responses to deterministic text when final text is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobId: "job-blocked-gate",
            status: "queued",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobId: "job-blocked-gate",
            status: "completed",
            result: {
              ok: false,
              error: "multilang_dispatch_blocked",
              message: "Translation confidence is too low to dispatch retrieval safely.",
              fail_reason: "HELIX_INTERPRETER_DISPATCH_BLOCKED",
              fail_class: "multilang_confidence_gate",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await askLocal(undefined, {
      question: "Okay, explain what a warp bubble is in the codebase.",
    });

    expect(response.text).toBe("Translation confidence is too low to dispatch retrieval safely.");
    expect(response.fail_reason).toBe("HELIX_INTERPRETER_DISPATCH_BLOCKED");
    expect(response.fail_class).toBe("multilang_confidence_gate");
  });
});

describe("askLocal lane parity default", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__HELIX_E8_14_LANE_PARITY__;
    vi.unstubAllGlobals();
  });

  it("defaults to /api/agi/ask/turn when no explicit parity override is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "Turn path response.",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await askLocal(undefined, {
      question: "hello",
    });

    expect(response.text).toBe("Turn path response.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/ask/turn");
  });

  it("characterizes empty turn responses as client fallback text without authority markers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await askLocal(undefined, {
      question: "empty response fallback probe",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/ask/turn");
    expect(response.text).toBe("I couldn't produce a final answer for that turn. Please retry once.");
    expect(response.selected_final_answer).toBeUndefined();
    expect(response.terminal_answer_authority).toBeUndefined();
    expect((response as { authorityVerified?: unknown }).authorityVerified).toBeUndefined();
  });

  it("serializes structured route_metadata for mailbox wake turns without prompt text embedding", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "Mailbox route accepted.",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await askLocal("Review the latest Stage Play live-source mailbox finding.", {
      question: "Review the latest Stage Play live-source mailbox finding.",
      route_metadata: {
        invocationKind: "stage_play_mail_wake",
        wakeRequestId: "stage_play_live_source_mail_wake:api-client",
        mailboxThreadId: "helix-ask:desktop",
        sourceTarget: "live_source_mailbox",
        requiredCanonicalGoal: "processed_mail_voice_decision",
        requiredPhase: "record_decision",
        allowedCapabilities: ["live_env.read_processed_live_source_mail"],
        forbiddenCapabilities: ["workspace_os.status"],
        evidenceRefs: ["stage_play_processed_mail_packet:api-client"],
        source_target_intent: {
          target_source: "live_source_mailbox",
          target_kind: "live_source_mailbox",
          strength: "hard",
        },
        mandatory_next_tool: {
          tool_name: "live_env.record_live_source_mail_decision",
          terminal_forbidden: true,
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/ask/turn");
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body ?? "{}")) as Record<string, any>;
    expect(body.prompt).toBe("Review the latest Stage Play live-source mailbox finding.");
    expect(body.prompt).not.toContain("live_env.record_live_source_mail_decision");
    expect(body.route_metadata).toMatchObject({
      invocationKind: "stage_play_mail_wake",
      wakeRequestId: "stage_play_live_source_mail_wake:api-client",
      mailboxThreadId: "helix-ask:desktop",
      sourceTarget: "live_source_mailbox",
      requiredCanonicalGoal: "processed_mail_voice_decision",
      requiredPhase: "record_decision",
      allowedCapabilities: ["live_env.read_processed_live_source_mail"],
      forbiddenCapabilities: ["workspace_os.status"],
      evidenceRefs: ["stage_play_processed_mail_packet:api-client"],
    });
    expect(body.source_target_intent).toMatchObject({
      target_source: "live_source_mailbox",
      target_kind: "live_source_mailbox",
      strength: "hard",
    });
    expect(body.mandatory_next_tool).toMatchObject({
      tool_name: "live_env.record_live_source_mail_decision",
      terminal_forbidden: true,
    });
  });

  it("serializes runAskTurn routeMetadata as route_metadata for mailbox wake continuations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "Mailbox route accepted.",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runAskTurn({
      question: "Review the latest Stage Play live-source mailbox finding.",
      routeMetadata: {
        invocationKind: "stage_play_mail_wake",
        wakeRequestId: "stage_play_live_source_mail_wake:turn-client",
        mailboxThreadId: "helix-ask:desktop",
        sourceTarget: "live_source_mailbox",
        requiredCanonicalGoal: "processed_mail_voice_decision",
        requiredPhase: "record_decision",
        allowedCapabilities: ["live_env.record_live_source_mail_decision"],
        forbiddenCapabilities: ["workspace_os.status", "internet-search.search_web"],
        evidenceRefs: ["stage_play_processed_mail_packet:turn-client"],
        source_target_intent: {
          target_source: "live_source_mailbox",
          target_kind: "live_source_mailbox",
          strength: "hard",
        },
        mandatory_next_tool: {
          tool_name: "live_env.record_live_source_mail_decision",
          terminal_forbidden: true,
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/ask/turn");
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body ?? "{}")) as Record<string, any>;
    expect(body.question).toBe("Review the latest Stage Play live-source mailbox finding.");
    expect(body.question).not.toContain("live_env.record_live_source_mail_decision");
    expect(body.route_metadata).toMatchObject({
      invocationKind: "stage_play_mail_wake",
      wakeRequestId: "stage_play_live_source_mail_wake:turn-client",
      mailboxThreadId: "helix-ask:desktop",
      sourceTarget: "live_source_mailbox",
      requiredCanonicalGoal: "processed_mail_voice_decision",
      requiredPhase: "record_decision",
      allowedCapabilities: ["live_env.record_live_source_mail_decision"],
      forbiddenCapabilities: ["workspace_os.status", "internet-search.search_web"],
      evidenceRefs: ["stage_play_processed_mail_packet:turn-client"],
    });
    expect(body.source_target_intent).toMatchObject({
      target_source: "live_source_mailbox",
      target_kind: "live_source_mailbox",
      strength: "hard",
    });
    expect(body.mandatory_next_tool).toMatchObject({
      tool_name: "live_env.record_live_source_mail_decision",
      terminal_forbidden: true,
    });
  });

  it("serializes runAskTurn language model policy controls outside prompt text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "Model policy accepted.",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runAskTurn({
      question: "Implement the runtime agent handoff.",
      languageModelProfile: "deep",
      languageModelOverride: "gpt-5.5-pro",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body ?? "{}")) as Record<string, any>;
    expect(body.question).toBe("Implement the runtime agent handoff.");
    expect(body.question).not.toContain("gpt-5.5-pro");
    expect(body.language_model_profile).toBe("deep");
    expect(body.languageModelProfile).toBe("deep");
    expect(body.language_model_override).toBe("gpt-5.5-pro");
    expect(body.languageModelOverride).toBe("gpt-5.5-pro");
  });

  it("serializes runAskTurn capability lane calls without embedding them in prompt text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "Lane accepted.",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runAskTurn({
      question: "Run the governed STT lane proof.",
      agentRuntime: "codex",
      capability_lane_call: [
        {
          capability: "speech_to_text.transcribe_audio",
          audio_ref: "voice:audio:test",
          transcript_text: "hello workstation",
          source_id: "audio_transcript:helix-ask:desktop",
        },
        {
          capability: "live_translation.translate_text",
          text: "hello workstation",
          target_language: "es",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body ?? "{}")) as Record<string, any>;
    expect(body.question).toBe("Run the governed STT lane proof.");
    expect(body.question).not.toContain("speech_to_text.transcribe_audio");
    expect(body.agent_runtime).toBe("codex");
    expect(body.capability_lane_call).toEqual([
      expect.objectContaining({
        capability: "speech_to_text.transcribe_audio",
        audio_ref: "voice:audio:test",
        transcript_text: "hello workstation",
      }),
      expect.objectContaining({
        capability: "live_translation.translate_text",
        text: "hello workstation",
        target_language: "es",
      }),
    ]);
  });

  it("serializes runAskTurn capability lane session calls without embedding them in prompt text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "Lane session accepted.",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runAskTurn({
      question: "Start account-language document translation for the active Docs Viewer.",
      agentRuntime: "codex",
      capability_lane_session_call: {
        action: "start",
        lane_id: "live_translation",
        requested_backend_provider: "live_translation.local_runtime",
        source_binding: {
          source_id: "docs:research/nhm2-current-status-whitepaper.md",
          source_hash: "sha256:doc-a",
          source_kind: "docs",
          projection_target: "docs_viewer.inline_translation",
          account_locale: "es-US",
          target_language: "es",
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body ?? "{}")) as Record<string, any>;
    expect(body.question).toBe("Start account-language document translation for the active Docs Viewer.");
    expect(body.question).not.toContain("capability_lane_session_call");
    expect(body.question).not.toContain("live_translation.local_runtime");
    expect(body.agent_runtime).toBe("codex");
    expect(body.capability_lane_session_call).toEqual(
      expect.objectContaining({
        action: "start",
        lane_id: "live_translation",
        requested_backend_provider: "live_translation.local_runtime",
        source_binding: expect.objectContaining({
          source_id: "docs:research/nhm2-current-status-whitepaper.md",
          source_hash: "sha256:doc-a",
          source_kind: "docs",
          projection_target: "docs_viewer.inline_translation",
          account_locale: "es-US",
          target_language: "es",
        }),
      }),
    );
  });

  it("posts one-shot capability lane calls to the standalone lane endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          schema: "helix.capability_lane.one_shot_response.v1",
          requested: true,
          agent_runtime: "codex",
          selected_agent_provider: {
            id: "codex",
            label: "Codex Workstation Mode",
          },
          capability_lane_call_results: [
            {
              ok: true,
              lane_id: "live_translation",
              capability: "live_translation.translate_text",
              translated_text: "hola",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          model_visible_capability_lane_manifest: {
            schema: "helix.agent_model_visible_capability_lane_manifest.v1",
          },
          capability_lane_projection_receipts: [
            {
              capability_key: "live_translation.translate_text",
              status: "projected",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          capability_lane_turn_timeline: [
            {
              schema: "helix.capability_lane.provider_timeline_event.v1",
              stage: "lane_visible",
              lane_visible: true,
              lane_requested: false,
              lane_executed: false,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            {
              schema: "helix.capability_lane.provider_timeline_event.v1",
              stage: "lane_requested",
              lane_visible: false,
              lane_requested: true,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            {
              schema: "helix.capability_lane.provider_timeline_event.v1",
              stage: "lane_reentered",
              lane_visible: false,
              lane_requested: true,
              observation_reentered: true,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          capability_lane_timeline_summary: {
            schema: "helix.capability_lane.timeline_summary.v1",
            event_count: 3,
            visible_count: 1,
            requested_count: 1,
            reentered_count: 1,
            lane_executed_count: 0,
            visible_only_count: 1,
            visible_lane_does_not_mean_executed: true,
          },
          capability_lane_reentry_status: "observation_packet_required_for_provider_reentry",
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await runCapabilityLaneOneShot({
      agentRuntime: "codex",
      turnId: "turn-lane-client-one-shot",
      capability_lane_call: {
        capability: "live_translation.translate_text",
        text: "hello",
        source_language: "en",
        target_language: "es",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/capability-lanes/one-shot");
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body ?? "{}")) as Record<string, any>;
    expect(requestInit.method).toBe("POST");
    expect(body).not.toHaveProperty("question");
    expect(body.agent_runtime).toBe("codex");
    expect(body.turnId).toBe("turn-lane-client-one-shot");
    expect(body.turn_id).toBe("turn-lane-client-one-shot");
    expect(body.capability_lane_call).toEqual(
      expect.objectContaining({
        capability: "live_translation.translate_text",
        text: "hello",
        target_language: "es",
      }),
    );
    expect(response).toEqual(
      expect.objectContaining({
        schema: "helix.capability_lane.one_shot_response.v1",
        requested: true,
        agent_runtime: "codex",
        selected_agent_provider: expect.objectContaining({
          id: "codex",
          label: "Codex Workstation Mode",
        }),
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      }),
    );
    expect(response.model_visible_capability_lane_manifest).toMatchObject({
      schema: "helix.agent_model_visible_capability_lane_manifest.v1",
    });
    expect(response.capability_lane_projection_receipts).toEqual([
      expect.objectContaining({
        capability_key: "live_translation.translate_text",
        status: "projected",
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      }),
    ]);
    expect(response.capability_lane_turn_timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        schema: "helix.capability_lane.provider_timeline_event.v1",
        stage: "lane_visible",
        lane_visible: true,
        lane_requested: false,
        lane_executed: false,
      }),
      expect.objectContaining({
        schema: "helix.capability_lane.provider_timeline_event.v1",
        stage: "lane_requested",
        lane_visible: false,
        lane_requested: true,
      }),
      expect.objectContaining({
        schema: "helix.capability_lane.provider_timeline_event.v1",
        stage: "lane_reentered",
        observation_reentered: true,
      }),
    ]));
    expect(response.capability_lane_timeline_summary).toMatchObject({
      schema: "helix.capability_lane.timeline_summary.v1",
      visible_count: 1,
      requested_count: 1,
      reentered_count: 1,
      visible_lane_does_not_mean_executed: true,
    });
  });

  it("posts capability lane session control calls to the standalone session endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          schema: "helix.capability_lane.session_control_response.v1",
          agent_runtime: "codex",
          selected_agent_provider: {
            id: "codex",
            label: "Codex Workstation Mode",
          },
          capability_lane_session_debug_summaries: [
            {
              lane_id: "live_translation",
              lifecycle_action: "start",
              session_lifecycle_action: "start",
              session_control_key: "lane-session-docs-route::document_markdown:docs/example.md",
            },
          ],
          model_visible_capability_lane_manifest: {
            schema: "helix.agent_model_visible_capability_lane_manifest.v1",
          },
          capability_lane_turn_timeline: [
            {
              schema: "helix.capability_lane.provider_timeline_event.v1",
              stage: "lane_visible",
              lane_visible: true,
              lane_requested: false,
              lane_executed: false,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            {
              schema: "helix.capability_lane.provider_timeline_event.v1",
              stage: "lane_session",
              lane_id: "live_translation",
              status: "running",
              lane_visible: false,
              lane_requested: true,
              session_lifecycle_action: "start",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          capability_lane_timeline_summary: {
            schema: "helix.capability_lane.timeline_summary.v1",
            visible_count: 1,
            session_count: 1,
            visible_only_count: 1,
            visible_lane_does_not_mean_executed: true,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await runCapabilityLaneSessionControl({
      agentRuntime: "codex",
      turnId: "turn-lane-client-session",
      capability_lane_session_call: {
        action: "start",
        lane_id: "live_translation",
        source_binding: {
          source_id: "docs:example.md",
          source_hash: "sha256:doc-a",
          source_kind: "docs",
          projection_target: "docs_viewer.inline_translation",
          target_language: "es",
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/capability-lanes/session");
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body ?? "{}")) as Record<string, any>;
    expect(requestInit.method).toBe("POST");
    expect(body.agent_runtime).toBe("codex");
    expect(body.turnId).toBe("turn-lane-client-session");
    expect(body.turn_id).toBe("turn-lane-client-session");
    expect(body.capability_lane_session_call).toEqual(
      expect.objectContaining({
        action: "start",
        lane_id: "live_translation",
        source_binding: expect.objectContaining({
          source_id: "docs:example.md",
          projection_target: "docs_viewer.inline_translation",
          target_language: "es",
        }),
      }),
    );
    expect(response).toEqual(
      expect.objectContaining({
        schema: "helix.capability_lane.session_control_response.v1",
        agent_runtime: "codex",
        selected_agent_provider: expect.objectContaining({
          id: "codex",
          label: "Codex Workstation Mode",
        }),
      }),
    );
    expect(response.model_visible_capability_lane_manifest).toMatchObject({
      schema: "helix.agent_model_visible_capability_lane_manifest.v1",
    });
    expect(response.capability_lane_turn_timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        schema: "helix.capability_lane.provider_timeline_event.v1",
        stage: "lane_visible",
        lane_visible: true,
        lane_requested: false,
      }),
      expect.objectContaining({
        schema: "helix.capability_lane.provider_timeline_event.v1",
        stage: "lane_session",
        lane_id: "live_translation",
        status: "running",
        session_lifecycle_action: "start",
      }),
    ]));
    expect(response.capability_lane_timeline_summary).toMatchObject({
      schema: "helix.capability_lane.timeline_summary.v1",
      visible_count: 1,
      session_count: 1,
      visible_lane_does_not_mean_executed: true,
    });
  });

  it("posts capability lane goal-binding control calls to the standalone goal-binding endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          requested: true,
          schema: "helix.capability_lane.goal_binding_control_response.v1",
          agent_runtime: "codex",
          selected_agent_provider: {
            id: "codex",
            label: "Codex Workstation Mode",
          },
          context_role: "tool_evidence",
          capability_lane_goal_binding_debug_summaries: [
            {
              goal_binding_id: "goal-binding-docs-route",
              goal_id: "goal:translate-docs",
              lane_id: "live_translation",
              report_policy: "ask_on_salience",
              quiet_behavior: "wake_on_salience",
              context_role: "tool_evidence",
            },
          ],
          capability_lane_goal_binding_results: [
            {
              ok: true,
              goal_binding_id: "goal-binding-docs-route",
              lane_session_id: "lane-session-docs-route",
              context_role: "tool_evidence",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          capability_lane_mail_loop_debug_summaries: [],
          model_visible_capability_lane_manifest: {
            schema: "helix.agent_model_visible_capability_lane_manifest.v1",
          },
          capability_lane_turn_timeline: [
            {
              schema: "helix.capability_lane.provider_timeline_event.v1",
              stage: "lane_visible",
              lane_visible: true,
              lane_requested: false,
              lane_executed: false,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
            {
              schema: "helix.capability_lane.provider_timeline_event.v1",
              stage: "goal_binding",
              lane_id: "live_translation",
              status: "bound",
              lane_visible: false,
              lane_requested: true,
              context_role: "tool_evidence",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          capability_lane_timeline_summary: {
            schema: "helix.capability_lane.timeline_summary.v1",
            visible_count: 1,
            goal_binding_count: 1,
            visible_only_count: 1,
            visible_lane_does_not_mean_executed: true,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await runCapabilityLaneGoalBindingControl({
      agentRuntime: "codex",
      turnId: "turn-lane-client-goal-binding",
      capability_lane_goal_binding_call: {
        action: "bind",
        goal_binding_id: "goal-binding-docs-route",
        goal_id: "goal:translate-docs",
        lane_session_id: "lane-session-docs-route",
        report_policy: "ask_on_salience",
        quiet_behavior: "wake_on_salience",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/capability-lanes/goal-binding");
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body ?? "{}")) as Record<string, any>;
    expect(requestInit.method).toBe("POST");
    expect(body.agent_runtime).toBe("codex");
    expect(body.turnId).toBe("turn-lane-client-goal-binding");
    expect(body.turn_id).toBe("turn-lane-client-goal-binding");
    expect(body.capability_lane_goal_binding_call).toEqual(
      expect.objectContaining({
        action: "bind",
        goal_binding_id: "goal-binding-docs-route",
        goal_id: "goal:translate-docs",
        lane_session_id: "lane-session-docs-route",
      }),
    );
    expect(response).toEqual(
      expect.objectContaining({
        schema: "helix.capability_lane.goal_binding_control_response.v1",
        ok: true,
        requested: true,
        agent_runtime: "codex",
        selected_agent_provider: expect.objectContaining({
          id: "codex",
          label: "Codex Workstation Mode",
        }),
        context_role: "tool_evidence",
      }),
    );
    expect(response.model_visible_capability_lane_manifest).toMatchObject({
      schema: "helix.agent_model_visible_capability_lane_manifest.v1",
    });
    expect(response.capability_lane_goal_binding_debug_summaries).toEqual([
      expect.objectContaining({
        goal_binding_id: "goal-binding-docs-route",
        lane_id: "live_translation",
        context_role: "tool_evidence",
      }),
    ]);
    expect(response.capability_lane_goal_binding_results).toEqual([
      expect.objectContaining({
        ok: true,
        goal_binding_id: "goal-binding-docs-route",
        lane_session_id: "lane-session-docs-route",
        context_role: "tool_evidence",
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      }),
    ]);
    expect(response.capability_lane_turn_timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        schema: "helix.capability_lane.provider_timeline_event.v1",
        stage: "goal_binding",
        lane_id: "live_translation",
        status: "bound",
        context_role: "tool_evidence",
      }),
    ]));
    expect(response.capability_lane_timeline_summary).toMatchObject({
      schema: "helix.capability_lane.timeline_summary.v1",
      goal_binding_count: 1,
      visible_lane_does_not_mean_executed: true,
    });
  });

  it("posts capability lane mail-loop calls to the standalone mail-loop endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          requested: true,
          schema: "helix.capability_lane.mail_loop_response.v1",
          agent_runtime: "codex",
          selected_agent_provider: {
            id: "codex",
            label: "Codex Workstation Mode",
          },
          capability_lane_call_results: [
            {
              ok: true,
              capability: "live_translation.translate_text",
              observation_ref: "ask:turn-lane-client-mail-loop:lane:live_translation:obs",
              context_role: "tool_evidence",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          capability_lane_observation_packets: [
            {
              observation_ref: "ask:turn-lane-client-mail-loop:lane:live_translation:obs",
              lane_id: "live_translation",
              packet_kind: "translation_observation",
              context_role: "tool_evidence",
            },
          ],
          capability_lane_projection_receipts: [
            {
              receipt_ref: "ask:turn-lane-client-mail-loop:lane:live_translation:projection",
              projection_target: "docs_chunk",
              terminal_eligible: false,
              assistant_answer: false,
            },
          ],
          capability_lane_mail_loop_results: [
            {
              ok: true,
              lane_session_id: "lane-session-docs-route",
              stage_play_mail_id: "stage-play-mail-route",
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          capability_lane_mail_loop_debug_summaries: [
            {
              lane_session_id: "lane-session-docs-route",
              lane_id: "live_translation",
              stage_play_wake_kind: "mailbox_wake",
            },
          ],
          model_visible_capability_lane_manifest: {
            schema: "helix.agent_model_visible_capability_lane_manifest.v1",
          },
          capability_lane_turn_timeline: [
            {
              schema: "helix.capability_lane.provider_timeline_event.v1",
              stage: "lane_mail_loop",
              lane_id: "live_translation",
              lane_visible: false,
              lane_requested: true,
              lane_executed: true,
              observation_reentered: true,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          capability_lane_timeline_summary: {
            schema: "helix.capability_lane.timeline_summary.v1",
            mail_loop_count: 1,
            lane_executed_count: 1,
            visible_lane_does_not_mean_executed: true,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await runCapabilityLaneMailLoop({
      agentRuntime: "codex",
      turnId: "turn-lane-client-mail-loop",
      threadId: "ask-thread-mail-loop",
      laneSessionId: "lane-session-docs-route",
      objectiveText: "Translate document chunks into account language.",
      capability_lane_call: {
        capability: "live_translation.translate_text",
        text: "hello",
        source_language: "en",
        target_language: "es",
        source_id: "docs:example.md",
        projection_target: "docs_chunk",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/capability-lanes/mail-loop");
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body ?? "{}")) as Record<string, any>;
    expect(requestInit.method).toBe("POST");
    expect(body.agent_runtime).toBe("codex");
    expect(body.turnId).toBe("turn-lane-client-mail-loop");
    expect(body.turn_id).toBe("turn-lane-client-mail-loop");
    expect(body.threadId).toBe("ask-thread-mail-loop");
    expect(body.thread_id).toBe("ask-thread-mail-loop");
    expect(body.laneSessionId).toBe("lane-session-docs-route");
    expect(body.lane_session_id).toBe("lane-session-docs-route");
    expect(body.objectiveText).toBe("Translate document chunks into account language.");
    expect(body.objective_text).toBe("Translate document chunks into account language.");
    expect(body.capability_lane_call).toEqual(
      expect.objectContaining({
        capability: "live_translation.translate_text",
        text: "hello",
        target_language: "es",
      }),
    );
    expect(response).toEqual(
      expect.objectContaining({
        schema: "helix.capability_lane.mail_loop_response.v1",
        ok: true,
        requested: true,
        agent_runtime: "codex",
        selected_agent_provider: expect.objectContaining({
          id: "codex",
          label: "Codex Workstation Mode",
        }),
      }),
    );
    expect(response.capability_lane_call_results).toEqual([
      expect.objectContaining({
        capability: "live_translation.translate_text",
        observation_ref: "ask:turn-lane-client-mail-loop:lane:live_translation:obs",
        context_role: "tool_evidence",
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      }),
    ]);
    expect(response.capability_lane_observation_packets).toEqual([
      expect.objectContaining({
        observation_ref: "ask:turn-lane-client-mail-loop:lane:live_translation:obs",
        lane_id: "live_translation",
        context_role: "tool_evidence",
      }),
    ]);
    expect(response.capability_lane_projection_receipts).toEqual([
      expect.objectContaining({
        receipt_ref: "ask:turn-lane-client-mail-loop:lane:live_translation:projection",
        projection_target: "docs_chunk",
        terminal_eligible: false,
        assistant_answer: false,
      }),
    ]);
    expect(response.capability_lane_mail_loop_results).toEqual([
      expect.objectContaining({
        ok: true,
        lane_session_id: "lane-session-docs-route",
        stage_play_mail_id: "stage-play-mail-route",
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      }),
    ]);
    expect(response.capability_lane_mail_loop_debug_summaries).toEqual([
      expect.objectContaining({
        lane_session_id: "lane-session-docs-route",
        lane_id: "live_translation",
      }),
    ]);
    expect(response.capability_lane_turn_timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        schema: "helix.capability_lane.provider_timeline_event.v1",
        stage: "lane_mail_loop",
        lane_id: "live_translation",
      }),
    ]));
    expect(response.capability_lane_timeline_summary).toMatchObject({
      schema: "helix.capability_lane.timeline_summary.v1",
      mail_loop_count: 1,
      visible_lane_does_not_mean_executed: true,
    });
  });

  it("enables golden-path runtime markers when runAskTurn uses Helix runtime", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "Golden path accepted.",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runAskTurn({
      question: "Use Helix to answer from the current document.",
      agentRuntime: "helix",
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body ?? "{}")) as Record<string, any>;
    expect(body.agentRuntime).toBe("helix");
    expect(body.agent_runtime).toBe("helix");
    expect(body.goldenPathRuntime).toBe(true);
    expect(body.golden_path_runtime).toBe(true);
  });

  it("does not enable golden-path runtime markers when runAskTurn uses Codex runtime", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "Codex provider accepted.",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runAskTurn({
      question: "Use Codex mode to answer from the current document.",
      agentRuntime: "codex",
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body ?? "{}")) as Record<string, any>;
    expect(body.agentRuntime).toBe("codex");
    expect(body.agent_runtime).toBe("codex");
    expect(body.goldenPathRuntime).toBeUndefined();
    expect(body.golden_path_runtime).toBeUndefined();
  });

  it("enables golden-path runtime markers when runAskTurnStream uses Helix runtime", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            [
              "event: turn_final",
              'data: {"text":"Golden path stream accepted.","final_answer_source":"helix_ask_golden_path_runtime","terminal_artifact_kind":"golden_path_contract_answer"}',
              "",
              "",
            ].join("\n"),
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runAskTurnStream({
      question: "Use Helix stream mode to answer from the current document.",
      agentRuntime: "helix",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/ask/turn/stream");
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body ?? "{}")) as Record<string, any>;
    expect(body.agentRuntime).toBe("helix");
    expect(body.agent_runtime).toBe("helix");
    expect(body.goldenPathRuntime).toBe(true);
    expect(body.golden_path_runtime).toBe(true);
  });
});
