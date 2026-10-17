import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSituationRoomSetupResolutionInput,
  postSituationRoomSetupResolution,
} from "@/lib/helix/situationSetupResolution";

describe("Situation Room setup resolution client helper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts source/capture resolution after a pending setup gets a source", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        receipt: {
          schema: "helix.situation_setup_resolution_receipt.v1",
          ok: true,
          setup_call_id: "situation-setup:resolution:client",
          resolved_requirements: ["audio_source", "capture_permission"],
          remaining_requirements: [],
          next_actions: [{ action: "run_panel_action", panel_id: "situation-room-pipelines" }],
          message: "Resolved.",
        },
        next_actions: [{ action: "run_panel_action", panel_id: "situation-room-pipelines" }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const input = buildSituationRoomSetupResolutionInput({
      setupCallId: "situation-setup:resolution:client",
      requestId: "request:client",
      roomId: "room:client",
      sourceIds: ["src:mic"],
      capturePermissionGranted: true,
    });
    const result = await postSituationRoomSetupResolution(input);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agi/situation-room/setup/resolve",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      schema: "helix.situation_setup_resolution.v1",
      setup_call_id: "situation-setup:resolution:client",
      request_id: "request:client",
      source_ids: ["src:mic"],
      capture_permission_granted: true,
    });
  });

  it("returns failure without starting graph creation when the resolver fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    const result = await postSituationRoomSetupResolution(
      buildSituationRoomSetupResolutionInput({
        setupCallId: "situation-setup:resolution:failed",
        speakerMappings: [{ speaker_id: "spk:self", role_hint: "self", native_language: "English" }],
      }),
    );
    expect(result).toEqual({ ok: false, error: "http_500" });
  });
});
