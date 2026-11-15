import { describe, expect, it } from "vitest";
import { projectCurrentRoomAuthorizationFact, projectCurrentRoomMembershipFact,
  projectUnavailableNativeRoomFact, projectUnavailableLocalRoomFact } from "../setupContractRoomFacts";

const nowMs = 1_800_000_000_000;
const status = {
  schema: "casimir_desktop_room_connection_status/1",
  profile_ref: "profile:owner", configured: true, ready: true,
  authority: "https://rooms.example.invalid", expires_at: new Date(nowMs + 60_000).toISOString(),
  bearer_included: false, subject_included: false,
};
const fact = (value: unknown) => projectCurrentRoomAuthorizationFact(
  value, nowMs, "profile:owner");

describe("native room authorization setup fact", () => {
  it("requires a current owner-matched room connection and shows its real expiry", () => {
    expect(fact(status)).toMatchObject({ stepId: "room_authorization", state: "satisfied",
      grantExpiresAtMs: nowMs + 60_000, validUntilMs: nowMs + 5_000 });
    expect(fact({ ...status, profile_ref: "profile:other" })).toBeNull();
    expect(fact({ ...status, expires_at: new Date(nowMs).toISOString() }))
      .toMatchObject({ state: "owner_action_required" });
  });

  it("does not treat a configured, unauthorized or malformed room as current", () => {
    expect(fact({ ...status, ready: false }))
      .toMatchObject({ state: "owner_action_required" });
    expect(fact({ ...status, authority: null }))
      .toMatchObject({ state: "owner_action_required" });
    expect(fact({ ...status, bearer_included: true })).toBeNull();
    expect(fact(null)).toBeNull();
  });

  it("waits for a still-valid saved grant to recover without demanding OAuth again", () => {
    expect(fact({ ...status, ready: false, recovery_pending: true })).toMatchObject({
      state: "blocked", reasonCode: "room_grant_recovery_pending",
      grantExpiresAtMs: nowMs + 60_000 });
    expect(fact({ ...status, ready: false, recovery_pending: true,
      expires_at: new Date(nowMs).toISOString() })).toMatchObject({
      state: "owner_action_required" });
  });
});

describe("exact room membership setup fact", () => {
  const receipt = { schema: "helix.shared_live_room.inspect_receipt.v1",
    operation: "room.inspect", ok: true,
    room: { room_id: "room:exact", status: "ready",
      self_participant_id: "participant:owner",
      participants: [{ participant_id: "participant:owner", presence: "present" }] } };
  const membership = (value: unknown) => projectCurrentRoomMembershipFact(
    value, nowMs, "room:exact");
  it("requires the exact open room and joined self participant, independent of live presence", () => {
    expect(membership(receipt)).toMatchObject({ stepId: "room_membership", state: "satisfied" });
    for (const status of ["waiting_for_participant", "waiting_for_consent", "active", "text_ready"]) {
      expect(membership({ ...receipt, room: { ...receipt.room, status } }))
        .toMatchObject({ stepId: "room_membership", state: "satisfied" });
    }
    expect(membership({ ...receipt, room: { ...receipt.room, room_id: "room:other" } })).toBeNull();
    expect(membership({ ...receipt, room: { ...receipt.room, status: "closed" } })).toBeNull();
    expect(membership({ ...receipt, room: { ...receipt.room, status: "unexpected" } })).toBeNull();
    expect(membership({ ...receipt, room: { ...receipt.room,
      participants: [{ participant_id: "participant:owner", presence: "left" }] } })).toBeNull();
    expect(membership({ ...receipt, room: { ...receipt.room,
      participants: [{ participant_id: "participant:owner", presence: "away" }] } }))
      .toMatchObject({ stepId: "room_membership", state: "satisfied" });
    expect(membership({ ...receipt, room: { ...receipt.room, participants: [] } })).toBeNull();
  });
});

it("blocks a selected room absent from the native signed-in room account", () => {
  const roomRef = "shared_realtime_room:exact";
  expect(projectUnavailableNativeRoomFact("room_not_found", nowMs, roomRef))
    .toMatchObject({ stepId: "room_membership", state: "blocked",
      reasonCode: "room_not_found_for_native_account" });
  expect(projectUnavailableNativeRoomFact("room_connection_required", nowMs, roomRef)).toBeNull();
});

it("blocks a selected room absent from the local signed-in account", () => {
  const roomRef = "shared_realtime_room:exact";
  expect(projectUnavailableLocalRoomFact("room_not_found", nowMs, roomRef))
    .toMatchObject({ stepId: "room_membership", state: "blocked",
      reasonCode: "room_not_found_for_local_account" });
  expect(projectUnavailableLocalRoomFact("account_policy_blocked", nowMs, roomRef))
    .toBeNull();
});
