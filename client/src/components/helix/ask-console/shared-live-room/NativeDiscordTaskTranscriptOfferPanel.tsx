import { RoomReviewScope, type RoomReviewOperation } from "./RoomReviewScope";
import React, { useEffect, useState } from "react";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, readCachedAccountProfileIdentity } from "@/lib/workstation/accountCapabilityPolicy";
import type { NativeHostedRoomOptions } from "@shared/helix-native-hosted-room-mission";
import { NATIVE_HOSTED_ROOM_BASE_PATH as BASE } from
  "@shared/helix-native-hosted-room-mission";

type Invitation = { invitationId: string; guildId: string; expiresAt: string };
type ActiveOffer = { offer_id: string; invitation_id: string;
  selection_ref: string; selection_revision: number; expires_at: string };
const invitationPattern = /^discord_voice:[0-9a-f-]{36}$/u;
const offerPattern = /^discord_task_share:[0-9a-f]{32}$/u;

/** Owner reviews the currently selected local task and finite Discord voice
 * invitation. Each speaker then opts in with a signed Discord command. No
 * words are sent to Codex by this control. */
type NativeDiscordTaskTranscriptOfferPanelProps = {
  roomId: string; options: NativeHostedRoomOptions;
  control: (request: unknown) => Promise<unknown>;
};
export function NativeDiscordTaskTranscriptOfferPanel(props: NativeDiscordTaskTranscriptOfferPanelProps) {
  return <RoomReviewScope scopeKey={props.roomId}>{run =>
    <NativeDiscordTaskTranscriptOfferPanelSession {...props} run={run} />}</RoomReviewScope>;
}

function NativeDiscordTaskTranscriptOfferPanelSession({ roomId, options, control: unscopedControl, run }: NativeDiscordTaskTranscriptOfferPanelProps & { run: RoomReviewOperation }) {
  const control = (request: unknown) => run(() => unscopedControl(request));
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [selectedInvitation, setSelectedInvitation] = useState("");
  const [reviewedScope, setReviewedScope] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [activeOffers, setActiveOffers] = useState<ActiveOffer[]>([]);
  const invitation = invitations.find(item => item.invitationId === selectedInvitation);
  const reviewIdentity = () => JSON.stringify([readCachedAccountProfileIdentity().revision,
    roomId, options.local_status, options.local_selection_ref, options.local_revision,
    options.candidate, options.attachment, invitation]);
  const reviewKey = reviewIdentity();
  const reviewed = reviewedScope === reviewKey;
  const setReviewed = (value: boolean) => setReviewedScope(value ? reviewIdentity() : null);
  useEffect(() => { setReviewedScope(null); }, [reviewKey]);
  useEffect(() => {
    const clear = () => setReviewedScope(previous => previous === reviewIdentity() ? previous : null);
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    return () => window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
  }, [reviewKey]);
  const currentSelection = options.local_status === "selected" &&
    options.local_selection_ref && options.local_revision &&
    options.attachment?.status === "reserved" &&
    Date.parse(options.attachment.expires_at) > Date.now() &&
    options.candidate;

  const load = async () => {
    setBusy(true); setReviewed(false); setMessage("");
    try {
      const listed = await control({ operation: "discord_task_transcript_offers",
        room_id: roomId }) as { schema?: string; room_id?: string;
          offers?: ActiveOffer[]; task_identity_included?: boolean;
          raw_content_included?: boolean; dispatch_authority?: boolean;
          minecraft_action_granted?: boolean };
      if (listed?.schema !== "helix.native_discord_task_transcript_offers.v1" ||
          listed.room_id !== roomId || !Array.isArray(listed.offers) ||
          listed.task_identity_included !== false ||
          listed.raw_content_included !== false ||
          listed.dispatch_authority !== false ||
          listed.minecraft_action_granted !== false ||
          listed.offers.some(item => !offerPattern.test(item.offer_id) ||
            !invitationPattern.test(item.invitation_id))) throw new Error("invalid_offers");
      setActiveOffers(listed.offers);
      try {
        const result = await control({ operation: "discord_speaker_availability",
          room_id: roomId }) as { schema?: string; room?: { room_id?: string };
          invitations?: Invitation[] };
        if (result?.schema !== "helix.discord_speaker_availability.v1" ||
            result.room?.room_id !== roomId || !Array.isArray(result.invitations)) {
          throw new Error("invalid_receipt");
        }
        const active = result.invitations.filter(item =>
          invitationPattern.test(item.invitationId) &&
          Number.isFinite(Date.parse(item.expiresAt)) &&
          Date.parse(item.expiresAt) > Date.now());
        setInvitations(active);
        setSelectedInvitation(active[0]?.invitationId ?? "");
        setMessage(active.length ? "Review the exact task and voice invitation below."
          : "No joined and armed Discord invitation is current for this room. Existing offers can still be revoked below.");
      } catch {
        setInvitations([]); setSelectedInvitation("");
        setMessage("The current voice invitation could not be checked. Existing offers can still be revoked below.");
      }
    } catch {
      setInvitations([]); setSelectedInvitation("");
      setActiveOffers([]);
      setMessage("The room's revocable task offers could not be checked.");
    } finally { setBusy(false); }
  };

  const stage = async () => {
    const candidate = options.candidate;
    if (!reviewed || reviewedScope !== reviewIdentity() || !invitation || !currentSelection || !candidate ||
        activeOffers.some(item => item.invitation_id === invitation.invitationId)) return;
    if (Date.parse(invitation.expiresAt) <= Date.now() ||
        Date.parse(options.attachment!.expires_at) <= Date.now()) {
      setReviewed(false);
      setMessage("The reviewed invitation or task attachment expired. Refresh both before staging an offer.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      const expiresAt = new Date(invitation.expiresAt).toISOString();
      const response = await run(() => fetch(`${BASE}/${encodeURIComponent(roomId)}/discord-task-transcript-offers`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ invitation_id: invitation.invitationId,
          expires_at: expiresAt,
          expected_selection_ref: options.local_selection_ref,
          expected_selection_revision: options.local_revision,
          expected_helix_conversation_id: candidate.helix_conversation_id,
          owner_reviewed: true }),
        signal: AbortSignal.timeout(20000),
      }));
      const result = await run(() => response.json());
      if (!response.ok || result?.schema !== "helix.native_discord_task_transcript_offer.v1" ||
          result?.room_id !== roomId || result?.invitation_id !== invitation.invitationId ||
          result?.selection_ref !== options.local_selection_ref ||
          result?.selection_revision !== options.local_revision ||
          result?.expires_at !== expiresAt || !offerPattern.test(result?.offer_id ?? "") ||
          result?.task_identity_included !== false ||
          result?.dispatch_authority !== false ||
          result?.minecraft_action_granted !== false) throw new Error("unconfirmed");
      setActiveOffers(previous => [{ offer_id: result.offer_id,
        invitation_id: invitation.invitationId,
        selection_ref: options.local_selection_ref!,
        selection_revision: options.local_revision!,
        expires_at: expiresAt }, ...previous]);
      setReviewed(false);
      setMessage("The finite task offer is staged. Each participant must opt in for their own attributed speech in Discord. Consented speech can appear as read-only context when the selected Codex task polls; it does not grant game actions.");
    } catch {
      setReviewed(false);
      setMessage("The offer could not be confirmed. Refresh the current task selection and invitation before trying again.");
    } finally { setBusy(false); }
  };

  const revoke = async (offerId: string) => {
    if (!offerPattern.test(offerId)) return;
    setBusy(true); setMessage("");
    try {
      const result = await control({ operation: "discord_task_transcript_revoke",
        room_id: roomId, request: { offer_id: offerId } }) as {
          schema?: string; room_id?: string; revoked?: boolean;
          task_identity_included?: boolean; minecraft_action_granted?: boolean };
      if (result?.schema !== "helix.native_discord_task_transcript_offer_revoke.v1" ||
          result.room_id !== roomId || result.revoked !== true ||
          result.task_identity_included !== false ||
          result.minecraft_action_granted !== false) throw new Error("unconfirmed");
      setActiveOffers(previous => previous.filter(item => item.offer_id !== offerId));
      setMessage("The task disclosure offer was revoked. Participants can also withdraw their own opt-in in Discord.");
    } catch {
      setMessage("Revocation could not be confirmed. Keep this offer ID and retry after checking the room connection.");
    } finally { setBusy(false); }
  };

  return <section aria-label="Discord speech to Codex task offer"
    className="mt-3 rounded border border-amber-300/30 p-2 text-xs">
    <p className="font-semibold text-amber-100">Optional Discord speech to Codex task</p>
    <p>Use this only for the paired task and current Discord call. Each speaker separately opts in. This build records consent but does not yet send speech to Codex or grant Minecraft commands.</p>
    <button data-helix-control-id="helix.ask.shared_live_room.native-discord-task-transcript-offer-panel.check-current-voice-invitation" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy} onClick={() => void load()}>Check current voice invitation</button>
    {currentSelection ? <>
      <p>Current paired Codex chat under review: <code>{options.candidate!.helix_conversation_id}</code> · pairing epoch {options.candidate!.binding_epoch}</p>
      <p>Saved task selection revision {options.local_revision}. The EXE checks that the saved selection still names this chat before staging.</p>
    </> : <p>Select the current paired task for this room and refresh owner selection first.</p>}
    {invitations.length ? <label className="mt-2 block">Current Discord invitation
      <select data-helix-control-id="helix.ask.shared_live_room.native-discord-task-transcript-offer-panel.select" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" value={selectedInvitation} disabled={busy}
        onChange={event => { setSelectedInvitation(event.target.value); setReviewed(false); }}>
        {invitations.map(item => <option key={item.invitationId} value={item.invitationId}>
          {item.invitationId} · expires {item.expiresAt}</option>)}
      </select>
    </label> : null}
    {invitation && currentSelection && !activeOffers.some(item =>
      item.invitation_id === invitation.invitationId) ? <>
      <label className="mt-2 flex items-center gap-2"><input data-helix-control-id="helix.ask.shared_live_room.native-discord-task-transcript-offer-panel.input" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" type="checkbox" checked={reviewed}
        onChange={event => setReviewed(event.target.checked)} />
        I reviewed this Codex chat and finite Discord invitation.</label>
      <button data-helix-control-id="helix.ask.shared_live_room.native-discord-task-transcript-offer-panel.stage-exact-task-offer" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy || !reviewed} onClick={() => void stage()}
        data-helix-interaction-kind="act">Stage exact-task offer</button>
    </> : null}
    {activeOffers.map(item => <div key={item.offer_id}
      className="mt-2 rounded border border-cyan-300/20 p-2">
      <p>Public offer ID: <code className="break-all">{item.offer_id}</code></p>
      <p>Voice invitation <code>{item.invitation_id}</code> · expires {item.expires_at}</p>
      <p>Each consenting speaker runs <code>/helix voice share-task-transcript</code> with this offer ID in the bound Discord text channel. They can later run <code>/helix voice revoke-task-transcript</code>.</p>
      <button data-helix-control-id="helix.ask.shared_live_room.native-discord-task-transcript-offer-panel.revoke-this-offer" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy} onClick={() => void revoke(item.offer_id)}>Revoke this offer</button>
    </div>)}
    {message ? <p role="status" className="mt-2 text-amber-100">{message}</p> : null}
  </section>;
}
