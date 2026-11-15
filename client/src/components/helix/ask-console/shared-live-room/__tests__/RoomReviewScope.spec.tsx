// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { cacheAccountCapabilityPolicy, clearCachedAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { HELIX_USER_ACCOUNT_POLICY } from "@shared/helix-account-session";
import { nativeHostedRoomOptionsSchema } from "@shared/helix-native-hosted-room-mission";
import { DiscordRoomSpeakerLinkPanel } from "../DiscordRoomSpeakerLinkPanel";
import { NativeHostedDiscordSpeakerReview } from "../NativeHostedDiscordSpeakerReview";
import { NativeMinecraftPlayerSharingQueue } from "../NativeMinecraftPlayerSharingQueue";
import { NativeDiscordTaskTranscriptOfferPanel } from "../NativeDiscordTaskTranscriptOfferPanel";

afterEach(() => { cleanup(); clearCachedAccountCapabilityPolicy(); vi.unstubAllGlobals(); });
const roomA = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const roomB = "shared_realtime_room:22222222-2222-4222-8222-222222222222";
const invitationId = "discord_voice:33333333-3333-4333-8333-333333333333";
const invitation = { invitationId, guildId: "123456789012345678", expiresAt: "2099-01-01T00:00:00Z" };
const options = (roomId: string) => nativeHostedRoomOptionsSchema.parse({
  schema: "helix.native_hosted_room_options.v1", room_id: roomId,
  authority: "https://example.test", local_revision: null, local_status: null,
  attachment: null, candidate: null, dispatch_authority: false,
  answer_authority: false, raw_content_included: false,
});
const cases = ["web-speaker", "native-speaker", "player-sharing", "task-offer"] as const;

it.each(cases.flatMap(kind => ["room", "account", "unmount"].map(transition => ({ kind, transition }))))(
  "retires pending $kind reads on $transition change", async ({ kind, transition }) => {
    cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:review-a");
    let finish!: (result: unknown) => void;
    const control = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const fetcher = vi.fn(() => new Promise<Response>(resolve => {
      finish = result => resolve(new Response(JSON.stringify(result), { status: 200 }));
    }));
    vi.stubGlobal("fetch", fetcher);
    const panel = (roomId: string) => kind === "web-speaker"
      ? <DiscordRoomSpeakerLinkPanel roomId={roomId} isOwner />
      : kind === "native-speaker" ? <NativeHostedDiscordSpeakerReview roomId={roomId} isOwner control={control} />
      : kind === "player-sharing" ? <NativeMinecraftPlayerSharingQueue roomId={roomId} control={control} />
      : <NativeDiscordTaskTranscriptOfferPanel roomId={roomId} options={options(roomId)} control={control} />;
    const view = render(panel(roomA));
    const label = kind === "web-speaker" ? "Check voice link" : kind === "native-speaker"
      ? "Check speaker claims" : kind === "player-sharing" ? "Check sharing requests" : "Check current voice invitation";
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(finish).toBeTypeOf("function");
    await act(async () => {
      if (transition === "unmount") view.unmount();
      else if (transition === "room") view.rerender(panel(roomB));
      else cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:review-b");
    });
    await act(async () => {
      finish(kind === "web-speaker" ? { ok: true, invitations: [invitation] }
        : kind === "native-speaker" ? { schema: "helix.discord_speaker_availability.v1", room: { room_id: roomA }, invitations: [invitation] }
        : kind === "player-sharing" ? { schema: "casimir.native_hosted_room_source_inventory.v1", room_id: roomA,
            bindings: [{ binding_id: "room_source_binding:old", world_id: "minecraft:old", domain_adapter: "minecraft.fabric_mod.v1", status: "active" }] }
        : { schema: "helix.native_discord_task_transcript_offers.v1", room_id: roomA, offers: [],
            task_identity_included: false, raw_content_included: false, dispatch_authority: false, minecraft_action_granted: false });
    });
    expect(kind === "web-speaker" ? fetcher : control).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(invitationId)).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    if (transition !== "unmount")
      expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(false);
  });

it.each([false, true].flatMap(native => ["room", "account"].map(transition => ({ native, transition }))))(
  "discards a late private speaker code (native=$native, transition=$transition)", async ({ native, transition }) => {
    cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:claim-a");
    let finish!: (result: unknown) => void;
    const code = "synthetic_claim_code_12345678901";
    expect(code).toHaveLength(32);
    const control = vi.fn(async (request: any) => request.operation === "discord_speaker_stage"
      ? new Promise(resolve => { finish = resolve; })
      : { schema: "helix.discord_speaker_availability.v1", room: { room_id: roomA }, invitations: [invitation] });
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST"
      ? new Promise<Response>(resolve => { finish = result => resolve(new Response(JSON.stringify(result), { status: 200 })); })
      : new Response(JSON.stringify({ ok: true, invitations: [invitation] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const panel = (roomId: string) => native
      ? <NativeHostedDiscordSpeakerReview roomId={roomId} isOwner={false} control={control} />
      : <DiscordRoomSpeakerLinkPanel roomId={roomId} isOwner={false} />;
    const view = render(panel(roomA));
    fireEvent.click(screen.getByRole("button", { name: native ? "Check speaker claims" : "Check voice link" }));
    fireEvent.click(await screen.findByRole("button", { name: native ? "Start my identity link" : "Link my Discord speaker" }));
    expect(finish).toBeTypeOf("function");
    await act(async () => {
      if (transition === "room") view.rerender(panel(roomB));
      else cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:claim-b");
    });
    await act(async () => { finish(native
      ? { schema: "helix.discord_speaker_stage.v1", room: { room_id: roomA }, claim_code: code, expires_at: invitation.expiresAt }
      : { ok: true, challengeId: "challenge:synthetic", claimCode: code, expiresAt: invitation.expiresAt }); });
    expect(screen.queryByDisplayValue(code)).toBeNull();
    expect(screen.queryByRole("button", { name: /show code|copy/i })).toBeNull();
  });
