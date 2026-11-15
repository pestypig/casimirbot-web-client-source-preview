/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DiscordRoomSpeakerLinkPanel } from "../DiscordRoomSpeakerLinkPanel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const reply = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "Content-Type": "application/json" } });

it("keeps the exact Discord speaker claim behind participant and owner review", async () => {
  const roomId = "shared_realtime_room:22222222-2222-4222-8222-222222222222";
  const invitationId = "discord_voice:33333333-3333-4333-8333-333333333333";
  const challengeId = "discord_room_speaker_challenge:44444444-4444-4444-8444-444444444444";
  const code = "a".repeat(32);
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/availability")) return reply({ ok: true,
      invitations: [{ invitationId, guildId: "123456789012345671",
        expiresAt: "2026-10-28T13:00:00Z" }] });
    if (url.endsWith("/reviews")) return reply({ ok: true,
      pending: [{ challengeId, participantId: "participant:friend",
        discordUserId: "123456789012345678", invitationId,
        expiresAt: "2026-10-28T12:05:00Z" }] });
    if (url.endsWith("/challenges")) return reply({ ok: true,
      challengeId, claimCode: code, expiresAt: "2026-10-28T12:05:00Z" });
    if (url.endsWith("/approve")) {
      expect(JSON.parse(String(init?.body))).toEqual({ approve: true,
        participant_id: "participant:friend",
        discord_user_id: "123456789012345678" });
      return reply({ ok: true, linkId: "discord_room_speaker_link:exact",
        minecraft_action_granted: false });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<DiscordRoomSpeakerLinkPanel roomId={roomId} isOwner />);
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Approve speaker identity" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Check voice link" }));
  await waitFor(() => expect(screen.getByRole("button", {
    name: "Link my Discord speaker" })).toBeEnabled());
  const approve = screen.getByRole("button", { name: "Approve speaker identity" });
  expect(approve).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Link my Discord speaker" }));
  await waitFor(() => expect(screen.getByLabelText("One-use room speaker code"))
    .toHaveAttribute("type", "password"));
  expect((screen.getByLabelText("One-use room speaker code") as HTMLInputElement).value).toBe(code);
  expect(approve).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/I reviewed this exact room participant/));
  expect(approve).toBeEnabled();
  fireEvent.click(approve);
  await waitFor(() => expect(screen.getByText(/Minecraft actions still need separate permission/))
    .toBeInTheDocument());
  const stageCall = fetcher.mock.calls.find(call => call[0].endsWith("/challenges"));
  expect(JSON.parse(String(stageCall?.[1]?.body))).toEqual({ invitation_id: invitationId });
});
