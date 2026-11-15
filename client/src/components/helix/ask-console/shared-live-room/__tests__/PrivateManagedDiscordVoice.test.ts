import { describe, expect, it } from "vitest";
import type { DiscordVoiceManagedBindingReceipt } from
  "@shared/discord-voice-managed-binding";
import { approvedManagedVoiceReview } from "../PrivateManagedDiscordVoice";

const now = Date.parse("2026-11-01T20:00:00.000Z");
const roomId = "shared_realtime_room:00000000-0000-4000-8000-000000000001";
const binding = {
  schema: "helix.discord_voice_managed_binding.v1",
  api_version: "v1", ok: true, operation: "room.discord_voice.managed_binding",
  room: { room_id: roomId }, reentry_required: true,
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
  audio_connected: false, model_input: false, raw_content_included: false,
  invitation_id: "discord_voice:00000000-0000-4000-8000-000000000002",
  contract_request_id: "00000000-0000-4000-8000-000000000003",
  contract_review_revision: "a".repeat(64),
  contract_task_ref: "task:accepted-123", contract_device_ref: "device:accepted-123",
  lease_until: new Date(now + 420_000).toISOString(),
} as DiscordVoiceManagedBindingReceipt;
const review = { ok: true, requests: [{
  request_id: binding.contract_request_id,
  review_revision: binding.contract_review_revision,
  task_ref: binding.contract_task_ref,
  installation_ref: binding.contract_device_ref,
  status: "approved", approval: {
    reviewedRevision: binding.contract_review_revision,
    expiresAtMs: now + 3_600_000,
  }, scopes: [{ branch: "discord_voice", mode: "gpt_live",
    room_ref: roomId, duration_seconds: 600 }],
}] };

describe("private managed Discord voice review selection", () => {
  it("bounds one exact approved contract by the invitation lease", () => {
    expect(approvedManagedVoiceReview(review, binding, now)).toEqual({
      contract_request_id: binding.contract_request_id,
      contract_review_revision: binding.contract_review_revision,
      contract_task_ref: binding.contract_task_ref,
      media_binding_id: `${roomId}:00000000-0000-4000-8000-000000000002`,
      maximum_seconds: 419,
    });
  });
  it("rejects a changed task, missing room scope, duplicate request, or expired approval", () => {
    const row = review.requests[0];
    expect(approvedManagedVoiceReview({ ...review,
      requests: [{ ...row, task_ref: "task:other-123" }] }, binding, now)).toBeNull();
    expect(approvedManagedVoiceReview({ ...review,
      requests: [{ ...row, scopes: [{ ...row.scopes[0], room_ref: "other" }] }] },
      binding, now)).toBeNull();
    expect(approvedManagedVoiceReview({ ...review,
      requests: [row, row] }, binding, now)).toBeNull();
    expect(approvedManagedVoiceReview({ ...review,
      requests: [{ ...row, approval: { ...row.approval,
        expiresAtMs: now + 5_000 } }] }, binding, now)).toBeNull();
  });
});
