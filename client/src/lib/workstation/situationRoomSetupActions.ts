import {
  HELIX_SITUATION_SETUP_RECEIPT_SCHEMA,
  normalizeSituationSetupOutputMode,
  type SituationRoomSetupActionArgs,
  type SituationRoomSetupCorrelation,
  type SituationRoomSetupExecutionReceipt,
  type SituationRoomSetupMissingRequirement,
} from "@shared/helix-situation-setup";
import { useSituationRoomGraphStore } from "@/store/useSituationRoomGraphStore";
import { useSituationRoomStore, type SituationRoom } from "@/store/useSituationRoomStore";

const nonEmpty = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
};

const stringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(nonEmpty).filter((entry: string | null): entry is string => Boolean(entry));
  const single = nonEmpty(value);
  return single ? [single] : [];
};

const normalizeSetupCorrelation = (value: unknown): SituationRoomSetupCorrelation | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const setupCallId = nonEmpty(record.setup_call_id ?? record.setupCallId);
  if (!setupCallId) return undefined;
  return {
    setup_call_id: setupCallId,
    thread_id: nonEmpty(record.thread_id ?? record.threadId),
    turn_id: nonEmpty(record.turn_id ?? record.turnId),
    session_id: nonEmpty(record.session_id ?? record.sessionId),
    trace_id: nonEmpty(record.trace_id ?? record.traceId),
    dynamic_tool_item_id: nonEmpty(record.dynamic_tool_item_id ?? record.dynamicToolItemId),
    request_id: nonEmpty(record.request_id ?? record.requestId),
  };
};

const fallbackSetupCorrelation = (): SituationRoomSetupCorrelation => ({
  setup_call_id: `situation-setup:client:${Date.now().toString(36)}`,
});

export const normalizeSituationRoomSetupActionArgs = (
  args: Record<string, unknown>,
): SituationRoomSetupActionArgs => ({
  intent:
    nonEmpty(args.intent) === "monitor_conversation"
      ? "monitor_conversation"
      : nonEmpty(args.intent) === "summarize_conversation"
        ? "summarize_conversation"
        : nonEmpty(args.intent) === "compose_prompt_from_room"
          ? "compose_prompt_from_room"
          : "translate_conversation",
  capture_preference:
    nonEmpty(args.capture_preference) === "mic"
      ? "mic"
      : nonEmpty(args.capture_preference) === "browser_tab_audio"
        ? "browser_tab_audio"
        : nonEmpty(args.capture_preference) === "display_audio"
          ? "display_audio"
          : nonEmpty(args.capture_preference) === "existing_source"
            ? "existing_source"
            : "unknown",
  room_id: nonEmpty(args.room_id ?? args.roomId) ?? undefined,
  source_ids: stringArray(args.source_ids ?? args.sourceIds ?? args.source_id ?? args.sourceId),
  speaker_a_id: nonEmpty(args.speaker_a_id ?? args.speakerAId) ?? undefined,
  speaker_b_id: nonEmpty(args.speaker_b_id ?? args.speakerBId) ?? undefined,
  speaker_a_native_language: nonEmpty(args.speaker_a_native_language ?? args.speakerANativeLanguage) ?? undefined,
  speaker_b_native_language: nonEmpty(args.speaker_b_native_language ?? args.speakerBNativeLanguage) ?? undefined,
  output_mode: normalizeSituationSetupOutputMode(args.output_mode ?? args.outputMode),
  correlation: normalizeSetupCorrelation(args.correlation),
});

export const resolveSituationRoomForSetup = (roomId?: string): SituationRoom => {
  const state = useSituationRoomStore.getState();
  if (roomId && state.rooms[roomId]) return state.rooms[roomId];
  if (state.active_room_id && state.rooms[state.active_room_id]) return state.rooms[state.active_room_id];
  const firstRoomId = state.room_order[0];
  if (firstRoomId && state.rooms[firstRoomId]) return state.rooms[firstRoomId];
  return state.createRoom("Translation Situation Room");
};

const setupStatusForMissing = (missing: Set<SituationRoomSetupMissingRequirement>) =>
  missing.has("audio_source") || missing.has("capture_permission") ? "needs_capture_permission" : "needs_user_input";

export const setupSituationRoomFromPrompt = (input: SituationRoomSetupActionArgs): SituationRoomSetupExecutionReceipt => {
  const correlation = input.correlation ?? fallbackSetupCorrelation();
  const room = resolveSituationRoomForSetup(input.room_id);
  const state = useSituationRoomStore.getState();
  const sourceIds = input.source_ids?.length
    ? input.source_ids.filter((sourceId: string) => Boolean(state.sources[sourceId]))
    : room.source_ids.filter((sourceId: string) => Boolean(state.sources[sourceId]));
  const missing = new Set<SituationRoomSetupMissingRequirement>();
  if (sourceIds.length === 0) {
    missing.add("audio_source");
    if (input.capture_preference === "browser_tab_audio" || input.capture_preference === "display_audio" || input.capture_preference === "mic") {
      missing.add("capture_permission");
    }
  }
  if (input.intent === "translate_conversation") {
    if (!input.speaker_a_id) missing.add("speaker_a");
    if (!input.speaker_b_id) missing.add("speaker_b");
    if (!input.speaker_a_native_language) missing.add("speaker_a_native_language");
    if (!input.speaker_b_native_language) missing.add("speaker_b_native_language");
  }

  const outputMode = normalizeSituationSetupOutputMode(input.output_mode);
  if (missing.size > 0) {
    return {
      schema: HELIX_SITUATION_SETUP_RECEIPT_SCHEMA,
      ok: false,
      correlation,
      setup_status: setupStatusForMissing(missing),
      lifecycle_status: "failed",
      executed_action_id: "situation-room-pipelines.setup_from_prompt",
      executed_at: new Date().toISOString(),
      room_id: room.room_id,
      source_ids: sourceIds,
      missing_requirements: Array.from(missing),
      next_actions: [
        {
          schema_version: "helix.workstation.action/v1",
          action: "open_panel",
          panel_id: missing.has("audio_source") ? "situation-room-sources" : "situation-room-pipelines",
        },
      ],
      attachment_policy: "manual_only",
      context_injection: "explicit_attachment_only",
      command_lane_enabled: false,
      output_mode: outputMode,
      error: "setup_requirements_missing",
      message: missing.has("audio_source")
        ? "Attach an audio source before starting Situation Room translation setup."
        : `Missing setup fields: ${Array.from(missing).join(", ")}.`,
    };
  }

  const graphStore = useSituationRoomGraphStore.getState();
  const graphResult =
    input.intent === "translate_conversation"
      ? graphStore.createTranslationPair({
          room_id: room.room_id,
          source_ids: sourceIds,
          speaker_a_id: input.speaker_a_id ?? "speaker-a",
          speaker_b_id: input.speaker_b_id ?? "speaker-b",
          speaker_a_native_language: input.speaker_a_native_language ?? "unknown",
          speaker_b_native_language: input.speaker_b_native_language ?? "unknown",
          render_policy: "dual",
          voice_output: outputMode === "voice_auto_direct_address" ? "auto_when_direct_addressed" : outputMode === "voice_on_confirm" ? "on_confirm" : "off",
          title: "Two-way translation setup",
        })
      : null;
  const graph =
    graphResult?.graph ??
    graphStore.createGraph({
      room_id: room.room_id,
      title:
        input.intent === "compose_prompt_from_room"
          ? "Prompt composer setup"
          : input.intent === "summarize_conversation"
            ? "Conversation summary setup"
            : "Conversation monitor setup",
    });
  return {
    schema: HELIX_SITUATION_SETUP_RECEIPT_SCHEMA,
    ok: Boolean(graph),
    correlation,
    setup_status: graph ? "complete" : "blocked",
    lifecycle_status: graph ? "executed" : "failed",
    executed_action_id: "situation-room-pipelines.setup_from_prompt",
    executed_at: new Date().toISOString(),
    graph_id: graph?.graph_id,
    job_ids: graphResult?.job_ids ?? [],
    room_id: room.room_id,
    source_ids: sourceIds,
    speaker_ids: [input.speaker_a_id, input.speaker_b_id].filter((entry): entry is string => Boolean(entry)),
    missing_requirements: [],
    attachment_policy: "manual_only",
    context_injection: "explicit_attachment_only",
    command_lane_enabled: false,
    output_mode: outputMode,
    error: graph ? null : "graph_creation_failed",
    message: graph
      ? input.intent === "translate_conversation"
        ? "Executed two-way translation setup. Jobs are manual-only and outputs require explicit attachment."
        : "Executed Situation Room setup graph. Outputs require explicit attachment."
      : "Could not create the Situation Room translation graph.",
  };
};
