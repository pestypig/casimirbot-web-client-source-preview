import {
  HELIX_SITUATION_SETUP_RESOLUTION_SCHEMA,
  type SituationRoomSetupResolutionInput,
  type SituationRoomSetupResolutionReceipt,
  type SituationRoomSetupSpeakerMapping,
} from "@shared/helix-situation-setup";

export type SituationSetupResolutionPostResult =
  | {
      ok: true;
      receipt: SituationRoomSetupResolutionReceipt;
      next_actions: unknown[];
    }
  | { ok: false; error: string };

export const postSituationRoomSetupResolution = async (
  input: SituationRoomSetupResolutionInput & {
    thread_id?: string | null;
    turn_id?: string | null;
    session_id?: string | null;
    trace_id?: string | null;
  },
): Promise<SituationSetupResolutionPostResult> => {
  try {
    const response = await fetch("/api/agi/situation-room/setup/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) return { ok: false, error: `http_${response.status}` };
    const parsed = (await response.json()) as {
      receipt?: SituationRoomSetupResolutionReceipt;
      next_actions?: unknown[];
    };
    if (!parsed.receipt) return { ok: false, error: "missing_resolution_receipt" };
    return {
      ok: true,
      receipt: parsed.receipt,
      next_actions: Array.isArray(parsed.next_actions) ? parsed.next_actions : [],
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "resolution_post_failed",
    };
  }
};

export const buildSituationRoomSetupResolutionInput = (args: {
  setupCallId: string;
  requestId?: string | null;
  roomId?: string | null;
  sourceIds?: string[];
  speakerMappings?: SituationRoomSetupSpeakerMapping[];
  capturePermissionGranted?: boolean;
}): SituationRoomSetupResolutionInput => ({
  schema: HELIX_SITUATION_SETUP_RESOLUTION_SCHEMA,
  setup_call_id: args.setupCallId,
  request_id: args.requestId ?? null,
  room_id: args.roomId ?? null,
  source_ids: args.sourceIds ?? [],
  speaker_mappings: args.speakerMappings ?? [],
  capture_permission_granted: args.capturePermissionGranted,
});
