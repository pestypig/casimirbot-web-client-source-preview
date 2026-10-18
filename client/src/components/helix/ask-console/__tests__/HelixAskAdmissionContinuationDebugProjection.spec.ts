import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveHelixAskAuthoritativeDebugExportPayload,
} from "../HelixAskDebugCopyProjection";
import { buildHelixDebugExportEnvelopeFromMasterPayload } from "@/lib/agi/debugExport";

const continuation = {
  schema: "helix.ask_turn_admission.client_continuation.v1",
  attempt_count: 2,
  queued_attempt_count: 1,
  resumed_after_queue: true,
  queue_reasons: ["instance_capacity"],
  first_queue_position: 1,
  last_queue_position: 1,
  total_wait_ms: 1200,
  bound_turn_id: "ask:capacity-resumed",
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Ask admission continuation debug projection", () => {
  it("preserves sanitized client continuation proof across the backend debug merge", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      payload: {
        schema: "helix.ask.debug_export.v1",
        active_turn_id: "ask:capacity-resumed",
        active_prompt: "Verify the active panel.",
        selected_final_answer: "Account & Sessions is active.",
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const localPayload = buildHelixDebugExportEnvelopeFromMasterPayload({
      id: "ask:capacity-resumed",
      question: "Verify the active panel.",
      content: "Account & Sessions is active.",
    }, {
      turn_id: "ask:capacity-resumed",
      selected_final_answer: "Account & Sessions is active.",
      debug: {
        ask_turn_admission_continuation: {
          ...continuation,
          raw_prompt: "must not survive",
        },
      },
    });
    const localParsed = JSON.parse(localPayload) as Record<string, unknown>;
    expect(localParsed.client_ask_turn_admission_continuation).toEqual(continuation);

    const resolved = JSON.parse(
      await resolveHelixAskAuthoritativeDebugExportPayload(localPayload),
    ) as Record<string, unknown>;
    expect(resolved).toMatchObject({
      debug_export_source: "backend_endpoint",
      backend_debug_response_status: "fetched",
      client_ask_turn_admission_continuation: continuation,
      client_debug_projection: {
        ask_turn_admission_continuation: continuation,
      },
    });
    expect(JSON.stringify(resolved)).not.toContain("must not survive");
  });
});
