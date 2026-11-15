import { describe, expect, it, vi } from "vitest";
import { applyApprovedSetupContractDiscord } from "../setupContractDiscordApply";

const sourceRef = "codex-thread:11111111-1111-4111-8111-111111111111";
const deviceRef = `desktop:${"a".repeat(64)}`;
const roomId = "discord_personal_stream:33333333-3333-4333-8333-333333333333";
const scope = { branch: "discord_stream" as const,
  destination_ref: "discord_session:33333333-3333-4333-8333-333333333333",
  source_refs: [sourceRef], selection_mode: "selected" as const,
  duration_hours: 1 as const };
const frame = { schema: "helix.codex_conversation_cloud_frame.v1",
  taskId: "11111111-1111-4111-8111-111111111111",
  helixConversationId: sourceRef, turns: [] };
const state = { schema: "helix.discord_stream_state.v1", room_id: roomId,
  destination: { guild_id: "123456789012345678", channel_id: "123456789012345679" },
  active: false, revision: 0, device_ref: null, selection: null,
  approval_expires_at: null, approval_duration_hours: null,
  approval_destination_matches_current: true };

describe("approved setup-contract Discord source selection", () => {
  it("saves only exact already-granted chats and leaves a fresh-baseline resume", async () => {
    let saved: unknown = null;
    const nativeGrants = vi.fn(async (request: any) => {
      if (request.operation === "list") return { status: "ready",
        profileRef: "profile:owner", deviceRef,
        grants: [{ sourceRef, title: "Approved chat" }] };
      if (request.operation === "read") return { status: "ready", frame };
      if (request.operation === "resume-read") return { status: "ready", selection: saved };
      if (request.operation === "resume-save") {
        saved = request.selection; return { status: "ready", selection: saved };
      }
      throw new Error("unexpected native call");
    });
    const remoteControl = vi.fn(async (_room: string, operation: string) => {
      if (operation === "discord_stream_inspect") return state;
      if (operation === "discord_stream_grant") return { ok: true };
      if (operation === "discord_stream_select") return { revision: 1,
        approval_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        approval_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        approval_duration_hours: 1 };
      if (operation === "discord_stream_stop") return { ok: true };
      throw new Error("unexpected remote call");
    });
    const apply = () => applyApprovedSetupContractDiscord({
      profileRef: "profile:owner", scope, nativeGrants,
      remoteControl, approvalCurrent: async () => true,
    });
    expect(await apply()).toBe("resume_ready");
    expect(remoteControl.mock.calls.map(([, operation]) => operation)).toEqual([
      "discord_stream_inspect", "discord_stream_grant",
      "discord_stream_select", "discord_stream_stop", "discord_stream_inspect",
    ]);
    expect(remoteControl).toHaveBeenCalledWith(roomId, "discord_stream_select",
      { device_ref: deviceRef, expected_revision: 0,
        selection: { mode: "selected", source_refs: [sourceRef] },
        proposal_id: null, duration_hours: 1 });
    expect(saved).toMatchObject({ mode: "selected", sourceRefs: [sourceRef],
      durationHours: 1 });
    remoteControl.mockClear();
    expect(await apply()).toBe("resume_ready");
    expect(remoteControl).not.toHaveBeenCalled();
  });

  it("does not select a source without its exact local read grant", async () => {
    const remoteControl = vi.fn();
    await expect(applyApprovedSetupContractDiscord({
      profileRef: "profile:owner", scope,
      nativeGrants: async () => ({ status: "ready",
        profileRef: "profile:owner", deviceRef, grants: [] }),
      remoteControl, approvalCurrent: async () => true,
    })).rejects.toThrow("setup_contract_discord_exact_chat_grant_missing");
    expect(remoteControl).not.toHaveBeenCalled();
  });

  it("obtains only the reviewed missing local grant before selecting Discord", async () => {
    const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    let grant: { sourceRef: string; title: string } | null = null;
    const nativeGrants = vi.fn(async (request: any) => {
      if (request.operation === "list") return { status: "ready",
        profileRef: "profile:owner", deviceRef, grants: grant ? [grant] : [] };
      if (request.operation === "grant-contract") {
        expect(request).toEqual({ operation: "grant-contract", requestId, sourceRef });
        grant = { sourceRef, title: "Contract chat" };
        return { status: "ready", grant };
      }
      if (request.operation === "read") return { status: "ready", frame };
      if (request.operation === "resume-read") return { status: "ready", selection: null };
      if (request.operation === "resume-save") return { status: "ready" };
      throw new Error("unexpected native call");
    });
    const remoteControl = vi.fn(async (_room: string, operation: string) => {
      if (operation === "discord_stream_inspect") return state;
      if (operation === "discord_stream_select") return { revision: 1,
        approval_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        approval_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        approval_duration_hours: 1 };
      return { active: false };
    });
    expect(await applyApprovedSetupContractDiscord({ requestId,
      profileRef: "profile:owner", scope, nativeGrants, remoteControl,
      approvalCurrent: async () => true })).toBe("resume_ready");
    expect(nativeGrants.mock.calls.filter(([request]) =>
      request.operation === "grant-contract")).toHaveLength(1);
    expect(remoteControl).toHaveBeenCalledWith(roomId, "discord_stream_grant",
      { device_ref: deviceRef, source_ref: sourceRef,
        title: "Contract chat", granted: true });
  });

  it("rejects All when extra local chats were not named in the contract", async () => {
    const remoteControl = vi.fn();
    await expect(applyApprovedSetupContractDiscord({
      profileRef: "profile:owner",
      scope: { ...scope, selection_mode: "all_approved" },
      nativeGrants: async () => ({ status: "ready",
        profileRef: "profile:owner", deviceRef,
        grants: [{ sourceRef, title: "Approved chat" },
          { sourceRef: "codex-thread:22222222-2222-4222-8222-222222222222",
            title: "Extra chat" }] }),
      remoteControl, approvalCurrent: async () => true,
    })).rejects.toThrow("setup_contract_discord_all_snapshot_changed");
    expect(remoteControl).not.toHaveBeenCalled();
  });

  it("retires a selection if the owner approval changes before resume", async () => {
    let calls = 0;
    const nativeGrants = vi.fn(async (request: any) => {
      if (request.operation === "list") return { status: "ready",
        profileRef: "profile:owner", deviceRef,
        grants: [{ sourceRef, title: "Approved chat" }] };
      if (request.operation === "read") return { status: "ready", frame };
      if (request.operation === "resume-read") return { status: "ready", selection: null };
      if (request.operation === "resume-clear") return { status: "ready" };
      throw new Error("unexpected native call");
    });
    const remoteControl = vi.fn(async (_room: string, operation: string) => {
      if (operation === "discord_stream_inspect") return state;
      if (operation === "discord_stream_select") return { revision: 1,
        approval_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        approval_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        approval_duration_hours: 1 };
      return { ok: true };
    });
    await expect(applyApprovedSetupContractDiscord({
      profileRef: "profile:owner", scope, nativeGrants, remoteControl,
      approvalCurrent: async () => ++calls < 4,
    })).rejects.toThrow("setup_contract_discord_approval_changed");
    expect(remoteControl.mock.calls.map(([, operation]) => operation)).toContain("discord_stream_stop");
    expect(nativeGrants).toHaveBeenCalledWith({ operation: "resume-clear", roomId });
  });

  it.each([
    { approval_duration_hours: 8 },
    { approval_expires_at: "not-a-timestamp" },
    { approval_expires_at: "2020-01-01T00:00:00.000Z" },
  ])("retires an invalid selection receipt before saving any resume: %j", async (invalidReceipt) => {
    const nativeGrants = vi.fn(async (request: any) => {
      if (request.operation === "list") return { status: "ready",
        profileRef: "profile:owner", deviceRef,
        grants: [{ sourceRef, title: "Approved chat" }] };
      if (request.operation === "read") return { status: "ready", frame };
      if (request.operation === "resume-read") return { status: "ready", selection: null };
      throw new Error("resume must not be saved");
    });
    const remoteControl = vi.fn(async (_room: string, operation: string) => {
      if (operation === "discord_stream_inspect") return state;
      if (operation === "discord_stream_select") return { revision: 1,
        approval_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        approval_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        approval_duration_hours: 1, ...invalidReceipt };
      return { ok: true };
    });
    await expect(applyApprovedSetupContractDiscord({
      profileRef: "profile:owner", scope, nativeGrants, remoteControl,
      approvalCurrent: async () => true,
    })).rejects.toThrow("setup_contract_discord_selection_receipt_invalid");
    expect(remoteControl.mock.calls.map(([, operation]) => operation)).toContain(
      "discord_stream_stop");
    expect(nativeGrants.mock.calls.map(([request]) => request.operation))
      .not.toContain("resume-save");
  });
});
