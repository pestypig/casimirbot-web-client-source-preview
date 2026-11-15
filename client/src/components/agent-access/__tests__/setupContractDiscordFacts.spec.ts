import { describe, expect, it } from "vitest";
import { projectCurrentDiscordStreamFacts, projectUnavailablePersonalDiscordFacts,
  setupContractDiscordRoomId } from
  "../setupContractDiscordFacts";

const nowMs = 1_800_000_000_000;
const sessionId = "discord_session:11111111-1111-4111-8111-111111111111";
const roomId = "discord_personal_stream:11111111-1111-4111-8111-111111111111";
const source = "codex-thread:11111111-1111-4111-8111-111111111111";
const scope = { branch: "discord_stream" as const, destination_ref: sessionId,
  source_refs: [source], selection_mode: "selected" as const,
  duration_hours: 8 as const };
const state = { schema: "helix.discord_stream_state.v1", room_id: roomId,
  destination: { guild_id: "111111111111111111", channel_id: "222222222222222222" },
  active: true, revision: 3, device_ref: "desktop:owner",
  selection: { mode: "selected", source_refs: [source] },
  approval_expires_at: new Date(nowMs + 60_000).toISOString(),
  approval_duration_hours: 1,
  approval_destination_matches_current: true, last_delivery: null };
const facts = (value: unknown,
  requested: Parameters<typeof projectCurrentDiscordStreamFacts>[2] = scope) =>
  projectCurrentDiscordStreamFacts(value, nowMs, requested, "desktop:owner");

describe("exact Discord setup inspection", () => {
  it("shows the native personal-stream admission blocker explicitly", () => {
    expect(projectUnavailablePersonalDiscordFacts({ status: "unavailable",
      code: "discord_personal_stream_native_required" }, nowMs)).toMatchObject([
      { stepId: "discord_destination", state: "blocked",
        reasonCode: "discord_personal_stream_native_required" },
    ]);
    expect(projectUnavailablePersonalDiscordFacts({ status: "unavailable",
      code: "other" }, nowMs)).toEqual([]);
  });

  it("recognizes personal and room destinations without treating arbitrary refs as current", () => {
    expect(setupContractDiscordRoomId(sessionId)).toBe(roomId);
    expect(setupContractDiscordRoomId("shared_realtime_room:room-1"))
      .toBe("shared_realtime_room:room-1");
    expect(setupContractDiscordRoomId("discord:linked")).toBeNull();
    expect(facts(state)).toMatchObject([
      { stepId: "discord_destination", state: "satisfied" },
      { stepId: "discord_snapshot_approval", state: "satisfied",
        grantExpiresAtMs: nowMs + 60_000 },
    ]);
    expect(facts({ ...state, room_id: "discord_personal_stream:other" })).toEqual([]);
  });

  it("does not reuse another device, a broader or stale snapshot, or a longer grant", () => {
    const approval = (value: unknown) => facts(value)[1];
    expect(approval({ ...state, device_ref: "desktop:other" }).state)
      .toBe("owner_action_required");
    expect(approval({ ...state, active: false }).state)
      .toBe("owner_action_required");
    expect(approval({ ...state, approval_destination_matches_current: false }).state)
      .toBe("owner_action_required");
    expect(approval({ ...state, selection: { mode: "all", source_refs: [source] } }).state)
      .toBe("owner_action_required");
    expect(approval({ ...state, selection: { mode: "selected", source_refs: [source, "codex-thread:other"] } }).state)
      .toBe("owner_action_required");
    expect(approval({ ...state, selection: { mode: "selected", source_refs: [source, source] } }).state)
      .toBe("owner_action_required");
    expect(approval({ ...state, approval_expires_at: new Date(nowMs).toISOString() }).state)
      .toBe("owner_action_required");
    expect(approval({ ...state, approval_duration_hours: 24 }).state)
      .toBe("owner_action_required");
    expect(facts({ ...state, destination: { guild_id: "bad", channel_id: "bad" } }))
      .toEqual([]);
    const { approval_destination_matches_current: _destinationMatch,
      last_delivery: _lastDelivery, ...legacy } = state;
    expect(approval(legacy).state).toBe("owner_action_required");
    expect(facts(legacy).some(fact => fact.stepId === "discord_delivery")).toBe(false);
  });

  it("matches the exact all-approved snapshot and leaves delivery unproven", () => {
    const all = { ...scope, selection_mode: "all_approved" as const };
    const projected = facts({ ...state,
      selection: { mode: "all", source_refs: [source] } }, all);
    expect(projected.map(fact => fact.stepId)).toEqual([
      "discord_destination", "discord_snapshot_approval",
    ]);
    expect(projected[1].state).toBe("satisfied");
  });

  it("proves only a delivered event from the current approved revision and destination", () => {
    const delivery = { discord_message_id: "333333333333333333",
      source_ref: source, revision: state.revision,
      guild_id: state.destination.guild_id, channel_id: state.destination.channel_id,
      delivered_at: new Date(nowMs - 1_000).toISOString() };
    expect(facts({ ...state, last_delivery: delivery }).map(fact => fact.stepId))
      .toEqual(["discord_destination", "discord_snapshot_approval", "discord_delivery"]);
    const changed = [
      { ...delivery, revision: state.revision - 1 },
      { ...delivery, source_ref: "codex-thread:22222222-2222-4222-8222-222222222222" },
      { ...delivery, channel_id: "444444444444444444" },
      { ...delivery, delivered_at: new Date(nowMs + 10_000).toISOString() },
    ];
    for (const candidate of changed)
      expect(facts({ ...state, last_delivery: candidate }).some(fact =>
        fact.stepId === "discord_delivery")).toBe(false);
    expect(facts({ ...state, active: false, last_delivery: delivery }).some(fact =>
      fact.stepId === "discord_delivery")).toBe(false);
  });
});
