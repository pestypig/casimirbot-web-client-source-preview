import { RoomReviewScope, type RoomReviewOperation } from "./RoomReviewScope";
import React, { useState } from "react";

type Invitation = { invitationId: string; guildId: string; expiresAt: string };
type PendingReview = { challengeId: string; participantId: string;
  discordUserId: string; invitationId: string; expiresAt: string };
type Staged = { challengeId: string; claimCode: string; expiresAt: string };

const roomPath = (roomId: string) =>
  `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/discord-speaker-links`;

async function performRoomRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include",
    cache: "no-store", headers: { Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}) } });
  const body = await response.json().catch(() => null) as
    ({ ok?: boolean; error?: string } & T) | null;
  if (!response.ok || body?.ok !== true)
    throw new Error(body?.error || (response.status === 404
      ? "Room speaker linking is unavailable in this build."
      : "The current room speaker request could not be confirmed."));
  return body;
}

/** Identity review only. This panel never requests a model call or grants
 * Minecraft action authority. Codes remain in component memory. */
type DiscordRoomSpeakerLinkPanelProps = {
  roomId: string; isOwner: boolean;
};
export function DiscordRoomSpeakerLinkPanel(props: DiscordRoomSpeakerLinkPanelProps) {
  return <RoomReviewScope scopeKey={JSON.stringify([props.roomId, props.isOwner])}>{run =>
    <DiscordRoomSpeakerLinkPanelSession {...props} run={run} />}</RoomReviewScope>;
}

function DiscordRoomSpeakerLinkPanelSession({ roomId, isOwner, run }: DiscordRoomSpeakerLinkPanelProps & { run: RoomReviewOperation }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [selectedInvitation, setSelectedInvitation] = useState("");
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [approvedChallenge, setApprovedChallenge] = useState("");
  const [staged, setStaged] = useState<Staged | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const base = roomPath(roomId);
  const roomRequest = <T,>(path: string, init?: RequestInit) => run(() => performRoomRequest<T>(path, init));

  const refresh = async () => {
    setBusy(true); setStatus("");
    try {
      const availability = await roomRequest<{ invitations: Invitation[] }>(
        `${base}/availability`);
      const offered = Array.isArray(availability.invitations)
        ? availability.invitations : [];
      setInvitations(offered);
      setSelectedInvitation(current => offered.some(value =>
        value.invitationId === current) ? current : offered[0]?.invitationId ?? "");
      if (isOwner) {
        const reviews = await roomRequest<{ pending: PendingReview[] }>(
          `${base}/reviews`);
        setPending(Array.isArray(reviews.pending) ? reviews.pending : []);
      }
      setStatus(offered.length ? "Current invitation found."
        : "No armed Discord voice invitation is ready for this room.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not check the room.");
    } finally { setBusy(false); }
  };

  const stage = async () => {
    if (!selectedInvitation) return;
    setBusy(true); setStatus(""); setStaged(null); setShowCode(false);
    try {
      const result = await roomRequest<Staged>(`${base}/challenges`, {
        method: "POST", body: JSON.stringify({ invitation_id: selectedInvitation }) });
      setStaged(result);
      setStatus("Claim this one-use code from your Discord account, then ask the room owner to review it.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start the link.");
    } finally { setBusy(false); }
  };

  const approve = async (review: PendingReview) => {
    if (approvedChallenge !== review.challengeId) return;
    setBusy(true); setStatus("");
    try {
      await roomRequest(`${base}/${encodeURIComponent(review.challengeId)}/approve`, {
        method: "POST", body: JSON.stringify({ approve: true,
          participant_id: review.participantId,
          discord_user_id: review.discordUserId }) });
      setPending(current => current.filter(value =>
        value.challengeId !== review.challengeId));
      setApprovedChallenge("");
      setStatus("Speaker identity linked for this invitation. Minecraft actions still need separate permission.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The review changed; refresh it.");
    } finally { setBusy(false); }
  };

  const copyCode = async () => {
    if (!staged) return;
    try {
      await run(() => navigator.clipboard.writeText(staged.claimCode));
      setStatus("One-use code copied. Keep it private and claim it in Discord before expiry.");
    } catch {
      setShowCode(true);
      setStatus("Clipboard unavailable; select the code manually.");
    }
  };

  return <section aria-label="Discord room speaker links"
    className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-400/[0.04] p-3 text-xs text-slate-200">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-semibold text-cyan-100">Discord speaker identity</p>
        <p className="mt-1 text-[11px] text-slate-400">
          Link a consenting Discord speaker to their room seat. This does not give them Minecraft control.
        </p>
      </div>
      <button data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy} onClick={() => void refresh()}
        data-helix-interaction-kind="read"
        data-helix-control-id="helix.ask.shared_live_room.discord-speaker-links.check"
        className="rounded border border-cyan-300/30 px-2 py-1 text-cyan-100 disabled:opacity-40">
        Check voice link
      </button>
    </div>
    {invitations.length ? <div className="mt-3 flex flex-wrap items-center gap-2">
      <label htmlFor={`speaker-invitation-${roomId}`}>Voice invitation</label>
      <select data-helix-control-id="helix.ask.shared_live_room.discord-room-speaker-link-panel.select" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" id={`speaker-invitation-${roomId}`} value={selectedInvitation}
        disabled={busy} onChange={event => setSelectedInvitation(event.target.value)}
        className="max-w-full rounded border border-white/20 bg-slate-950 p-1 text-xs">
        {invitations.map(value => <option key={value.invitationId}
          value={value.invitationId}>{value.invitationId}</option>)}
      </select>
      <button type="button" disabled={busy || !selectedInvitation}
        data-helix-interaction-kind="act"
        data-helix-authority-state="blocked_pending_contract"
        data-helix-control-id="helix.ask.shared_live_room.discord-speaker-links.stage"
        onClick={() => void stage()}
        className="rounded border border-cyan-300/30 px-2 py-1 text-cyan-100 disabled:opacity-40">
        Link my Discord speaker
      </button>
    </div> : null}
    {staged ? <div className="mt-3 rounded border border-amber-300/20 p-2">
      <p>After your separate voice and transcription consents, run <code>/helix voice claim-room-speaker</code> in the bound Discord text channel with this one-use code:</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input data-helix-control-id="helix.ask.shared_live_room.discord-room-speaker-link-panel.one-use-room-speaker-code" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" aria-label="One-use room speaker code" readOnly
          type={showCode ? "text" : "password"} value={staged.claimCode}
          autoComplete="off"
          className="min-w-0 flex-1 rounded border border-white/20 bg-slate-950 p-1 font-mono" />
        <button data-helix-control-id="helix.ask.shared_live_room.discord-room-speaker-link-panel.set-show-code-current-current" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" onClick={() => setShowCode(current => !current)}
          className="rounded border border-white/20 px-2 py-1">
          {showCode ? "Hide" : "Show"}
        </button>
        <button data-helix-control-id="helix.ask.shared_live_room.discord-room-speaker-link-panel.copy" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" onClick={() => void copyCode()}
          className="rounded border border-white/20 px-2 py-1">Copy</button>
      </div>
      <p className="mt-1 text-[11px] text-amber-100/70">Expires {staged.expiresAt}. The room owner must review the resulting claim.</p>
    </div> : null}
    {isOwner && pending.length ? <div className="mt-3 space-y-2">
      <p className="font-semibold text-cyan-100">Claims awaiting your review</p>
      {pending.map(review => <div key={review.challengeId}
        className="rounded border border-white/10 p-2">
        <p className="break-all">Room participant: {review.participantId}</p>
        <p className="break-all">Discord user: {review.discordUserId}</p>
        <p className="break-all text-[11px] text-slate-400">Invitation: {review.invitationId} · expires {review.expiresAt}</p>
        <label className="mt-2 flex items-center gap-2">
          <input data-helix-control-id="helix.ask.shared_live_room.discord-room-speaker-link-panel.input" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" type="checkbox" checked={approvedChallenge === review.challengeId}
            onChange={event => setApprovedChallenge(event.target.checked
              ? review.challengeId : "")} />
          I reviewed this exact room participant and Discord user.
        </label>
        <button type="button" disabled={busy || approvedChallenge !== review.challengeId}
          data-helix-interaction-kind="act"
          data-helix-authority-state="blocked_pending_contract"
          data-helix-control-id="helix.ask.shared_live_room.discord-speaker-links.approve"
          onClick={() => void approve(review)}
          className="mt-2 rounded border border-emerald-300/30 px-2 py-1 text-emerald-100 disabled:opacity-40">
          Approve speaker identity
        </button>
      </div>)}
    </div> : null}
    {status ? <p role="status" className="mt-2 text-[11px] text-amber-100">{status}</p> : null}
  </section>;
}
