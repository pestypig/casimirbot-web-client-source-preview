import { RoomReviewScope, type RoomReviewOperation } from "./RoomReviewScope";
import React, { useState } from "react";

type Review = { challengeId: string; participantId: string;
  discordUserId: string; invitationId: string; expiresAt: string };
type Invitation = { invitationId: string; guildId: string; expiresAt: string };

/** Owner review for the hosted Discord room. No invitation code or provider
 * token is exposed to this renderer. Approval links identity only. */
type NativeHostedDiscordSpeakerReviewProps = {
  roomId: string;
  isOwner: boolean;
  control: (request: unknown) => Promise<unknown>;
};
export function NativeHostedDiscordSpeakerReview(props: NativeHostedDiscordSpeakerReviewProps) {
  return <RoomReviewScope scopeKey={JSON.stringify([props.roomId, props.isOwner])}>{run =>
    <NativeHostedDiscordSpeakerReviewSession {...props} run={run} />}</RoomReviewScope>;
}

function NativeHostedDiscordSpeakerReviewSession({ roomId, isOwner, control: unscopedControl, run }: NativeHostedDiscordSpeakerReviewProps & { run: RoomReviewOperation }) {
  const control = (request: unknown) => run(() => unscopedControl(request));
  const [pending, setPending] = useState<Review[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [selectedInvitation, setSelectedInvitation] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [checked, setChecked] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    setBusy(true); setMessage(""); setChecked("");
    try {
      const availability = await control({ operation: "discord_speaker_availability",
        room_id: roomId }) as { schema?: string; room?: { room_id?: string };
          invitations?: Invitation[] };
      if (availability?.schema !== "helix.discord_speaker_availability.v1" ||
          availability.room?.room_id !== roomId ||
          !Array.isArray(availability.invitations)) throw new Error("invalid_receipt");
      setInvitations(availability.invitations);
      setSelectedInvitation(current => availability.invitations!.some(item =>
        item.invitationId === current) ? current : availability.invitations![0]?.invitationId ?? "");
      if (isOwner) {
      const receipt = await control({ operation: "discord_speaker_reviews", room_id: roomId }) as {
        schema?: string; room?: { room_id?: string }; pending?: Review[] };
      if (receipt?.schema !== "helix.discord_speaker_reviews.v1" ||
          receipt.room?.room_id !== roomId || !Array.isArray(receipt.pending) ||
          !receipt.pending.every(item => item && typeof item.challengeId === "string" &&
            typeof item.participantId === "string" && typeof item.discordUserId === "string" &&
            typeof item.invitationId === "string")) throw new Error("invalid_receipt");
      setPending(receipt.pending);
      setMessage(receipt.pending.length ? "Review the exact room participant and Discord account."
        : "No Discord speaker claim is awaiting review for this room.");
      } else setMessage(availability.invitations.length
        ? "Select the armed invitation to link your Discord identity."
        : "No armed Discord voice invitation is ready for this room.");
    } catch {
      setPending([]);
      setInvitations([]);
      setMessage("Speaker review is unavailable. Check the hosted room connection and server feature setting.");
    } finally { setBusy(false); }
  };

  const stage = async () => {
    if (!selectedInvitation) return;
    setBusy(true); setMessage(""); setClaimCode(""); setShowCode(false);
    try {
      const receipt = await control({ operation: "discord_speaker_stage",
        room_id: roomId, request: { invitation_id: selectedInvitation } }) as {
          schema?: string; room?: { room_id?: string };
          claim_code?: string; expires_at?: string };
      if (receipt?.schema !== "helix.discord_speaker_stage.v1" ||
          receipt.room?.room_id !== roomId ||
          typeof receipt.claim_code !== "string" ||
          !/^[A-Za-z0-9_-]{32}$/u.test(receipt.claim_code)) throw new Error("invalid_receipt");
      setClaimCode(receipt.claim_code);
      setMessage(`Claim this one-use code in the bound Discord text channel before ${receipt.expires_at}. The room owner must then review your claim.`);
    } catch {
      setMessage("The one-use claim could not be confirmed. Recheck the room and invitation.");
    } finally { setBusy(false); }
  };

  const approve = async (review: Review) => {
    if (checked !== review.challengeId) return;
    setBusy(true); setMessage("");
    try {
      const receipt = await control({ operation: "discord_speaker_approve",
        room_id: roomId, request: { challenge_id: review.challengeId,
          participant_id: review.participantId,
          discord_user_id: review.discordUserId } }) as {
        schema?: string; room?: { room_id?: string };
        minecraft_action_granted?: boolean };
      if (receipt?.schema !== "helix.discord_speaker_approval.v1" ||
          receipt.room?.room_id !== roomId ||
          receipt.minecraft_action_granted !== false) throw new Error("invalid_receipt");
      setPending(current => current.filter(item => item.challengeId !== review.challengeId));
      setChecked("");
      setMessage("Discord speaker linked to this room participant. Minecraft commands still need a separate owner grant.");
    } catch {
      setMessage("The speaker review could not be confirmed. Refresh before continuing.");
    } finally { setBusy(false); }
  };

  return <section aria-label="Hosted Discord speaker review"
    className="mt-3 rounded border border-cyan-300/20 p-2 text-xs">
    <p className="font-semibold text-cyan-100">Discord speaker identity</p>
    <p className="mt-1 text-slate-400">A consenting room member claims their Discord account in the bound text channel. Review that claim here before the account is attributed to a room seat.</p>
    <button data-helix-control-id="helix.ask.shared_live_room.native-hosted-discord-speaker-review.check-speaker-claims" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy} onClick={() => void refresh()}
      data-helix-interaction-kind="read">Check speaker claims</button>
    {invitations.length ? <div className="mt-2 flex flex-wrap items-center gap-2">
      <label htmlFor={`native-speaker-invitation-${roomId}`}>Armed invitation</label>
      <select data-helix-control-id="helix.ask.shared_live_room.native-hosted-discord-speaker-review.select" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" id={`native-speaker-invitation-${roomId}`} value={selectedInvitation}
        onChange={event => setSelectedInvitation(event.target.value)} disabled={busy}>
        {invitations.map(item => <option key={item.invitationId}
          value={item.invitationId}>{item.invitationId}</option>)}
      </select>
      <button data-helix-control-id="helix.ask.shared_live_room.native-hosted-discord-speaker-review.start-my-identity-link" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy || !selectedInvitation}
        data-helix-interaction-kind="act" onClick={() => void stage()}>
        Start my identity link</button>
    </div> : null}
    {claimCode ? <div className="mt-2 rounded border border-amber-300/20 p-2">
      <p>Run <code>/helix voice claim-room-speaker</code> in the invitation’s Discord text channel using this one-use code:</p>
      <input data-helix-control-id="helix.ask.shared_live_room.native-hosted-discord-speaker-review.one-use-discord-speaker-code" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" aria-label="One-use Discord speaker code" readOnly
        type={showCode ? "text" : "password"} value={claimCode}
        className="mt-1 w-full bg-slate-950 font-mono" />
      <button data-helix-control-id="helix.ask.shared_live_room.native-hosted-discord-speaker-review.set-show-code-value-value" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" onClick={() => setShowCode(value => !value)}>
        {showCode ? "Hide code" : "Show code"}</button>
    </div> : null}
    {isOwner && pending.map(review => <div key={review.challengeId} className="mt-2 rounded border border-white/10 p-2">
      <p className="break-all">Room participant: {review.participantId}</p>
      <p className="break-all">Discord account: {review.discordUserId}</p>
      <p className="break-all">Invitation: {review.invitationId}</p>
      <p>Expires {review.expiresAt}</p>
      <label className="mt-1 flex items-center gap-2">
        <input data-helix-control-id="helix.ask.shared_live_room.native-hosted-discord-speaker-review.input" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" type="checkbox" checked={checked === review.challengeId}
          onChange={event => setChecked(event.target.checked ? review.challengeId : "")} />
        I reviewed this participant and Discord account.
      </label>
      <button data-helix-control-id="helix.ask.shared_live_room.native-hosted-discord-speaker-review.approve-identity-link" type="button" disabled={busy || checked !== review.challengeId}
        data-helix-interaction-kind="act"
        data-helix-authority-state="blocked_pending_contract"
        onClick={() => void approve(review)}>Approve identity link</button>
    </div>)}
    {message ? <p role="status" className="mt-2 text-amber-100">{message}</p> : null}
  </section>;
}
