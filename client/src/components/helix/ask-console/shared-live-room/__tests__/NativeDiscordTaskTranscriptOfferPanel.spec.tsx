// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NativeDiscordTaskTranscriptOfferPanel } from
  "../NativeDiscordTaskTranscriptOfferPanel";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import type { NativeHostedRoomOptions } from
  "@shared/helix-native-hosted-room-mission";

const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const invitationId = "discord_voice:22222222-2222-4222-8222-222222222222";
const selectionRef = "native_room_selection:33333333-3333-4333-8333-333333333333";
const offerId = `discord_task_share:${"a".repeat(32)}`;
const expiresAt = "2099-01-01T00:00:00.000Z";
const options = {
  schema: "helix.native_hosted_room_options.v1", room_id: roomId,
  authority: "https://rooms.test", local_revision: 2,
  local_status: "selected", local_selection_ref: selectionRef,
  task_transcript_sharing_enabled: true,
  attachment: { attachment_ref: "room_owner_attachment:44444444-4444-4444-8444-444444444444",
    revision: 2, node_ref: `room_node:sha256:${"b".repeat(64)}`,
    status: "reserved", expires_at: expiresAt, local_task_verified: false,
    dispatch_authority: false },
  candidate: { reasoning_binding_id: "binding:one", binding_epoch: 3,
    helix_conversation_id: "chat:one", binding_mission_id: null, run_id: null },
  dispatch_authority: false, answer_authority: false, raw_content_included: false,
} as NativeHostedRoomOptions;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(["selection_revision", "chat", "pairing_epoch", "expired"])("requires a fresh review after changing %s", async change => {
  const control = vi.fn(async (request: unknown) =>
    (request as { operation: string }).operation === "discord_speaker_availability"
      ? { schema: "helix.discord_speaker_availability.v1", room: { room_id: roomId },
          invitations: [{ invitationId, guildId: "123456789012345678", expiresAt }] }
      : { schema: "helix.native_discord_task_transcript_offers.v1", room_id: roomId,
          offers: [], task_identity_included: false, raw_content_included: false,
          dispatch_authority: false, minecraft_action_granted: false });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const view = render(<NativeDiscordTaskTranscriptOfferPanel roomId={roomId} options={options} control={control} />);
  fireEvent.click(screen.getByRole("button", { name: "Check current voice invitation" }));
  await screen.findByText(/Review the exact task and voice invitation/);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Stage exact-task offer" }).hasAttribute("disabled")).toBe(false);
  await act(async () => { window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)); });
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  if (change === "expired") {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(expiresAt));
    fireEvent.click(screen.getByRole("button", { name: "Stage exact-task offer" }));
    expect(await screen.findByText(/reviewed invitation or task attachment expired/)).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
    return;
  }
  view.rerender(<NativeDiscordTaskTranscriptOfferPanel roomId={roomId} control={control} options={{ ...options,
    local_revision: change === "selection_revision" ? 3 : options.local_revision,
    candidate: { ...options.candidate!,
      helix_conversation_id: change === "chat" ? "chat:two" : options.candidate!.helix_conversation_id,
      binding_epoch: change === "pairing_epoch" ? 4 : options.candidate!.binding_epoch } }} />);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  expect(screen.getByRole("button", { name: "Stage exact-task offer" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Stage exact-task offer" }));
  expect(fetcher).not.toHaveBeenCalled();
});

it("stages only after owner review, then revokes through room control", async () => {
  const control = vi.fn(async (request: unknown) => {
    const operation = (request as { operation: string }).operation;
    return operation === "discord_speaker_availability"
      ? { schema: "helix.discord_speaker_availability.v1",
          room: { room_id: roomId }, invitations: [{ invitationId,
            guildId: "123456789012345678", expiresAt }] }
      : operation === "discord_task_transcript_offers"
      ? { schema: "helix.native_discord_task_transcript_offers.v1",
          room_id: roomId, offers: [], task_identity_included: false,
          raw_content_included: false, dispatch_authority: false,
          minecraft_action_granted: false }
      : { schema: "helix.native_discord_task_transcript_offer_revoke.v1",
          room_id: roomId, revoked: true, task_identity_included: false,
          minecraft_action_granted: false };
  });
  const fetcher = vi.fn(async () => new Response(JSON.stringify({
    schema: "helix.native_discord_task_transcript_offer.v1", ok: true,
    room_id: roomId, invitation_id: invitationId, offer_id: offerId,
    selection_ref: selectionRef, selection_revision: 2, expires_at: expiresAt,
    task_identity_included: false, dispatch_authority: false,
    minecraft_action_granted: false,
  }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  render(<NativeDiscordTaskTranscriptOfferPanel roomId={roomId}
    options={options} control={control} />);
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Stage exact-task offer" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Check current voice invitation" }));
  await screen.findByText(/Review the exact task and voice invitation/);
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Stage exact-task offer" })
    .hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Stage exact-task offer" }));
  await screen.findByText(/read-only context when the selected Codex task polls/);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain(`/${encodeURIComponent(roomId)}/discord-task-transcript-offers`);
  expect(JSON.parse(String(init.body))).toEqual({ invitation_id: invitationId,
    expires_at: expiresAt, expected_selection_ref: selectionRef,
    expected_selection_revision: 2,
    expected_helix_conversation_id: "chat:one", owner_reviewed: true });
  expect(JSON.stringify(init.body)).not.toContain("binding:one");
  fireEvent.click(screen.getByRole("button", { name: "Revoke this offer" }));
  await screen.findByText(/task disclosure offer was revoked/);
  expect(control).toHaveBeenLastCalledWith({
    operation: "discord_task_transcript_revoke", room_id: roomId,
    request: { offer_id: offerId },
  });
});

it("withholds staging when the native selection is missing", async () => {
  const control = vi.fn(async (request: unknown) =>
    (request as { operation: string }).operation === "discord_speaker_availability"
      ? { schema: "helix.discord_speaker_availability.v1",
          room: { room_id: roomId }, invitations: [{ invitationId,
            guildId: "123456789012345678", expiresAt }] }
      : { schema: "helix.native_discord_task_transcript_offers.v1",
          room_id: roomId, offers: [], task_identity_included: false,
          raw_content_included: false, dispatch_authority: false,
          minecraft_action_granted: false });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<NativeDiscordTaskTranscriptOfferPanel roomId={roomId}
    options={{ ...options, local_selection_ref: null }} control={control} />);
  fireEvent.click(screen.getByRole("button", { name: "Check current voice invitation" }));
  await waitFor(() => expect(control).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("button", { name: "Stage exact-task offer" })).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it("recovers an existing offer after remount so its owner can revoke it", async () => {
  const control = vi.fn(async (request: unknown) =>
    (request as { operation: string }).operation === "discord_speaker_availability"
      ? { schema: "helix.discord_speaker_availability.v1",
          room: { room_id: roomId }, invitations: [] }
      : (request as { operation: string }).operation === "discord_task_transcript_offers"
      ? { schema: "helix.native_discord_task_transcript_offers.v1",
          room_id: roomId, offers: [{ offer_id: offerId,
            invitation_id: invitationId, selection_ref: selectionRef,
            selection_revision: 2, expires_at: expiresAt }],
          task_identity_included: false, raw_content_included: false,
          dispatch_authority: false, minecraft_action_granted: false }
      : { schema: "helix.native_discord_task_transcript_offer_revoke.v1",
          room_id: roomId, revoked: true, task_identity_included: false,
          minecraft_action_granted: false });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<NativeDiscordTaskTranscriptOfferPanel roomId={roomId}
    options={options} control={control} />);
  fireEvent.click(screen.getByRole("button", { name: "Check current voice invitation" }));
  await screen.findByText(offerId);
  expect(screen.queryByRole("button", { name: "Stage exact-task offer" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Revoke this offer" }));
  await screen.findByText(/task disclosure offer was revoked/);
  expect(control).toHaveBeenLastCalledWith({
    operation: "discord_task_transcript_revoke", room_id: roomId,
    request: { offer_id: offerId },
  });
  expect(fetcher).not.toHaveBeenCalled();
});
