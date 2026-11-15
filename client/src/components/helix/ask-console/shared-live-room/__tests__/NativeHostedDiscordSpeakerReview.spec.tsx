// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NativeHostedDiscordSpeakerReview } from "../NativeHostedDiscordSpeakerReview";

const roomId = "shared_realtime_room:11111111-1111-4111-8111-111111111111";
const invitationId = "discord_voice:22222222-2222-4222-8222-222222222222";
const challengeId = "discord_room_speaker_challenge:33333333-3333-4333-8333-333333333333";

describe("hosted Discord speaker review", () => {
  it("stages through the hosted native control and gates owner approval on the exact claim", async () => {
    const control = vi.fn(async (input: any) => {
      if (input.operation === "discord_speaker_availability") return {
        schema: "helix.discord_speaker_availability.v1", room: { room_id: roomId },
        invitations: [{ invitationId, guildId: "123456789012345671", expiresAt: "2026-10-28T06:00:00Z" }] };
      if (input.operation === "discord_speaker_reviews") return {
        schema: "helix.discord_speaker_reviews.v1", room: { room_id: roomId },
        pending: [{ challengeId, participantId: "participant:friend",
          discordUserId: "123456789012345673", invitationId,
          expiresAt: "2026-10-28T06:00:00Z" }] };
      if (input.operation === "discord_speaker_stage") return {
        schema: "helix.discord_speaker_stage.v1", room: { room_id: roomId },
        claim_code: "a".repeat(32), expires_at: "2026-10-28T06:00:00Z" };
      if (input.operation === "discord_speaker_approve") return {
        schema: "helix.discord_speaker_approval.v1", room: { room_id: roomId },
        minecraft_action_granted: false };
      throw new Error("unexpected operation");
    });
    render(<NativeHostedDiscordSpeakerReview roomId={roomId}
      isOwner control={control} />);
    fireEvent.click(screen.getByRole("button", { name: "Check speaker claims" }));
    await screen.findByText("Room participant: participant:friend");
    const approve = screen.getByRole("button", { name: "Approve identity link" });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Start my identity link" }));
    await screen.findByLabelText("One-use Discord speaker code");
    expect(control).toHaveBeenCalledWith({ operation: "discord_speaker_stage",
      room_id: roomId, request: { invitation_id: invitationId } });
    fireEvent.click(screen.getByLabelText("I reviewed this participant and Discord account."));
    fireEvent.click(approve);
    await waitFor(() => expect(control).toHaveBeenCalledWith({
      operation: "discord_speaker_approve", room_id: roomId,
      request: { challenge_id: challengeId, participant_id: "participant:friend",
        discord_user_id: "123456789012345673" } }));
    expect(screen.getByText(/Minecraft commands still need a separate owner grant/)).toBeTruthy();
  });
});
