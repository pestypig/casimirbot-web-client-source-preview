import { describe, expect, it } from "vitest";
import {
  getWorkstationDynamicTools,
  mapClientWorkstationDynamicToolCallToAction,
} from "@/lib/workstation/workstationDynamicTools";
import { WORKSTATION_V1_PANEL_CAPABILITIES } from "@/lib/workstation/panelCapabilities";
import { SHARED_INTERFACE_LANGUAGE_CODES } from "@shared/interface-language-codes";
import { WORKSTATION_DYNAMIC_TOOL_ACTIONS } from "@shared/workstation-dynamic-tools";

const AGENT_CONTINUATION_ACTION_IDS = [
  "create_live_answer_environment",
  "attach_live_source",
  "set_live_commentary_policy",
  "request_agentic_review",
  "query_event_window",
  "query_synthetic_evidence",
  "goal_ledger.set_objective",
  "goal_ledger.mark_complete",
  "goal_ledger.mark_blocked",
  "goal.evaluate",
  "callout_policy.set_mode",
  "voice_delivery.propose_from_trace",
  "voice_delivery.confirm_speak",
  "live_continuation.start",
  "live_continuation.tick",
  "live_continuation.query",
  "live_continuation.pause",
  "live_continuation.resume",
  "live_continuation.stop",
  "worker_lane.run",
  "source_health.query",
] as const;

describe("workstation dynamic tools", () => {
  it("retires Situation Room panels from generated workstation tools", () => {
    const tools = getWorkstationDynamicTools();
    const panelActions = WORKSTATION_V1_PANEL_CAPABILITIES["situation-room-pipelines"].actions.map((action) => action.id);

    expect(panelActions).toContain("create_job");
    expect(tools.some((tool) => tool.panel_id === "situation-room-pipelines")).toBe(false);
    expect(tools.some((tool) => tool.panel_id === "situation-room-sources")).toBe(false);
    expect(WORKSTATION_DYNAMIC_TOOL_ACTIONS.some((action) => action.panel_id.startsWith("situation-room"))).toBe(false);
  });

  it("does not map retired Situation Room tool calls onto the dispatcher action contract", () => {
    const mapped = mapClientWorkstationDynamicToolCallToAction("situation_room_pipelines.create_job", {
      kind: "translate",
      target_language: "es",
      attachment_policy: "manual_only",
      context_injection: "explicit_attachment_only",
    });

    expect(mapped).toEqual({
      ok: false,
      reason: "unknown_tool",
      missing_required_args: [],
    });
  });

  it("exposes account-session interface language as a schema-bound workstation tool", () => {
    const tools = getWorkstationDynamicTools();
    const setLanguage = tools.find((tool) => tool.name === "account_session.set_interface_language");

    expect(setLanguage).toMatchObject({
      namespace: "workstation",
      panel_id: "account-session",
      action_id: "set_interface_language",
      deferLoading: false,
      risk: "low",
      returns_artifact: true,
      terminal_artifact_kind: "workspace_action_receipt",
    });
    expect(setLanguage?.inputSchema).toMatchObject({
      required: ["language"],
      properties: {
        language: { enum: [...SHARED_INTERFACE_LANGUAGE_CODES] },
      },
    });

    expect(
      mapClientWorkstationDynamicToolCallToAction("account_session.set_interface_language", {
        language: "haw",
      }),
    ).toEqual({
      ok: true,
      action: {
        schema_version: "helix.workstation.action/v1",
        action: "run_panel_action",
        panel_id: "account-session",
        action_id: "set_interface_language",
        args: { language: "haw" },
      },
    });
  });

  it("returns unknown for retired tools instead of choosing another action", () => {
    const mapped = mapClientWorkstationDynamicToolCallToAction("situation_room_pipelines.create_job", {
      target_language: "es",
    });

    expect(mapped).toEqual({
      ok: false,
      reason: "unknown_tool",
      missing_required_args: [],
    });
  });

  it("does not map retired translation-pair graph tools onto panel actions", () => {
    const mapped = mapClientWorkstationDynamicToolCallToAction("situation_room_pipelines.create_translation_pair", {
      speaker_a_id: "spk_user_1",
      speaker_b_id: "spk_rowan",
      speaker_a_native_language: "en",
      speaker_b_native_language: "es",
      render_policy: "dual",
    });

    expect(mapped).toEqual({
      ok: false,
      reason: "unknown_tool",
      missing_required_args: [],
    });
  });

  it("retires save-as-note Situation Room job tools", () => {
    const tools = getWorkstationDynamicTools();
    const createJob = tools.find((tool) => tool.name === "situation_room_pipelines.create_job");
    const saveJob = tools.find((tool) => tool.name === "situation_room_pipelines.save_job_as_note");

    expect(createJob).toBeUndefined();
    expect(saveJob).toBeUndefined();
  });

  it("retires Dottie observer tools from generated workstation tools", () => {
    const tools = getWorkstationDynamicTools();
    const manifest = tools.find((tool) => tool.name === "situation_room_pipelines.dottie_manifest");
    const attach = tools.find((tool) => tool.name === "situation_room_pipelines.observer_attach");
    const propose = tools.find((tool) => tool.name === "situation_room_pipelines.voice_delivery_propose_from_trace");

    expect(manifest).toBeUndefined();
    expect(attach).toBeUndefined();
    expect(propose).toBeUndefined();
  });

  it("retires generic construct recipe actions from generated workstation tools", () => {
    const tools = getWorkstationDynamicTools();
    const createConstruct = tools.find((tool) => tool.name === "situation_room_pipelines.construct_create_from_recipe");
    const listRecipes = tools.find((tool) => tool.name === "situation_room_pipelines.construct_list_recipes");
    const queryConstructs = tools.find((tool) => tool.name === "situation_room_pipelines.construct_query");

    expect(createConstruct).toBeUndefined();
    expect(listRecipes).toBeUndefined();
    expect(queryConstructs).toBeUndefined();
  });

  it("does not map retired construct recipe calls onto panel actions", () => {
    const mapped = mapClientWorkstationDynamicToolCallToAction("situation_room_pipelines.construct_create_from_recipe", {
      recipe_id: "auntie_dottie_witness",
      thread_id: "thread:dottie",
      room_id: "room:dottie",
    });

    expect(mapped).toEqual({
      ok: false,
      reason: "unknown_tool",
      missing_required_args: [],
    });
  });

  it("exposes ideology and Moral framework actions as receipt-backed tools", () => {
    const tools = getWorkstationDynamicTools();
    const compare = tools.find((tool) => tool.name === "mission_ethos.compare_motive_to_zen");

    expect(compare).toMatchObject({
      namespace: "workstation",
      panel_id: "mission-ethos",
      action_id: "compare_motive_to_zen",
      risk: "low",
      returns_artifact: true,
      terminal_artifact_kind: "ideology_motive_comparison_receipt",
    });
    expect(compare?.inputSchema).toMatchObject({
      required: ["motive"],
      properties: {
        motive: { type: "string" },
        framework: { enum: ["moral", "mission_ethos", "custom"] },
        node_ids: { type: "array", items: { type: "string" } },
      },
    });
  });

  it("exposes process graph context pack as read-only situational awareness", () => {
    const tools = getWorkstationDynamicTools();
    const contextPack = tools.find((tool) => tool.name === "workstation_process_graph.get_context_pack");

    expect(contextPack).toMatchObject({
      namespace: "workstation",
      panel_id: "workstation-process-graph",
      action_id: "get_context_pack",
      risk: "low",
      returns_artifact: true,
      terminal_artifact_kind: "workstation_process_graph_context_pack",
    });
    expect(contextPack?.inputSchema).toMatchObject({
      required: [],
      properties: {
        max_nodes: { type: "number" },
        max_artifacts: { type: "number" },
        max_timeline: { type: "number" },
      },
    });
  });

  it("exposes Image Lens focus runs as observation-only visual evidence tools", () => {
    const tools = getWorkstationDynamicTools();
    const imageLensFocus = tools.find((tool) => tool.name === "image_lens.image_lens_focus_regions");
    const liveAnswerFocus = tools.find((tool) => tool.name === "live_answer_environment.image_lens_focus_regions");

    expect(imageLensFocus).toMatchObject({
      namespace: "workstation",
      panel_id: "image-lens",
      action_id: "image_lens.focus_regions",
      risk: "medium",
      returns_artifact: true,
      terminal_artifact_kind: "image_lens_focus_run_result",
    });
    expect(imageLensFocus?.inputSchema).toMatchObject({
      required: ["sourceId", "regions"],
      properties: {
        regions: {
          type: "array",
          items: {
            properties: {
              bboxPct: {
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                  width: { type: "number" },
                  height: { type: "number" },
                },
              },
              reason: { type: "string" },
            },
          },
        },
      },
    });
    expect(liveAnswerFocus).toMatchObject({
      panel_id: "live-answer-environment",
      action_id: "image_lens.focus_regions",
      terminal_artifact_kind: "image_lens_focus_run_result",
    });
  });

  it("keeps retired agent continuation actions out of executable tool registries", () => {
    const panelActions = new Set(
      WORKSTATION_V1_PANEL_CAPABILITIES["situation-room-pipelines"].actions.map((action) => action.id),
    );
    const sharedActions = new Set(
      WORKSTATION_DYNAMIC_TOOL_ACTIONS
        .filter((action) => action.panel_id === "situation-room-pipelines")
        .map((action) => action.action_id),
    );
    const tools = getWorkstationDynamicTools();

    for (const actionId of AGENT_CONTINUATION_ACTION_IDS) {
      expect(panelActions.has(actionId), `${actionId} missing from panel capabilities`).toBe(true);
      expect(sharedActions.has(actionId), `${actionId} should be retired from shared dynamic tool actions`).toBe(false);
      expect(
        tools.some((tool) => tool.panel_id === "situation-room-pipelines" && tool.action_id === actionId),
        `${actionId} should be retired from generated client workstation tools`,
      ).toBe(false);
    }
  });
});
