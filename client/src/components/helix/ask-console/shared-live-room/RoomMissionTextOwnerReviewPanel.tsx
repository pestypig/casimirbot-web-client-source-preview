import React, { useEffect, useRef, useState } from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import type { RoomMissionOwnerSelection } from "@shared/helix-room-mission-owner";
import type { HelixReasoningSteeringEventProjection } from "@shared/helix-reasoning-task-binding";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { approveRoomMissionTextReview, dispatchApprovedRoomMissionText,
  readRoomMissionTextDispatchStatus, readRoomMissionTextOwnerReviews,
  type RoomMissionTextOwnerReview } from "./RoomMissionTextOwnerApi";

type RoomMessage = { message_id: string; room_id: string; author_participant_id: string; text: string };
const sha256 = async (text: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
};

/** An owner sees an ordinary room message before separately approving and
 * dispatching it. The hash connects displayed human text to the protected
 * selection; dispatch never accepts browser-supplied instruction text. */
export function RoomMissionTextOwnerReviewPanel({ room, mission, messages }: {
  room: HelixSharedRealtimeRoom;
  mission: RoomMissionOwnerSelection;
  messages: RoomMessage[];
}) {
  const [reviews, setReviews] = useState<RoomMissionTextOwnerReview[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [verified, setVerified] = useState<{ selectionId: string; text: string } | null>(null);
  const [approveChecked, setApproveChecked] = useState(false);
  const [sendChecked, setSendChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [event, setEvent] = useState<HelixReasoningSteeringEventProjection | null>(null);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const approvalIds = useRef(new Map<string, string>());
  const missionKey = JSON.stringify([room.room_id, room.self_participant_id,
    mission.mission_id, mission.mission_revision, mission.reasoning_binding_id, mission.binding_epoch]);

  useEffect(() => {
    generation.current += 1; pending.current?.abort();
    setReviews([]); setLoaded(false); setVerified(null); setApproveChecked(false);
    setSendChecked(false); setBusy(false); setNotice(""); setEvent(null);
    approvalIds.current.clear();
    const changed = () => { generation.current += 1; pending.current?.abort();
      setAccountEpoch(value => value + 1); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
    return () => { generation.current += 1; pending.current?.abort();
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed); };
  }, [missionKey, accountEpoch]);

  const run = async (work: (signal: AbortSignal, epoch: number) => Promise<void>) => {
    if (busy || mission.status !== "active" || room.status === "closed") return;
    const epoch = generation.current;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setNotice("");
    try { await work(controller.signal, epoch); }
    catch (error) { if (generation.current === epoch && !controller.signal.aborted)
      setNotice(error instanceof Error && error.message === "room_message_hash_mismatch"
        ? "Displayed room text does not match the selected message. Refresh room text before review; nothing was approved or sent."
        : "The outcome could not be confirmed. Refresh this exact room mission before another decision."); }
    finally { if (generation.current === epoch) setBusy(false); }
  };
  const load = () => run(async (signal, epoch) => {
    const next = await readRoomMissionTextOwnerReviews(mission, signal);
    if (generation.current === epoch && !signal.aborted) {
      setReviews(next); setLoaded(true); setVerified(null);
      setApproveChecked(false); setSendChecked(false);
    }
  });
  const messageFor = (review: RoomMissionTextOwnerReview) => messages.find(item =>
    item.room_id === room.room_id && item.message_id === review.selection.message_id &&
    item.author_participant_id === review.selection.author_participant_id);
  const currentText = async (review: RoomMissionTextOwnerReview) => {
    const message = messageFor(review);
    if (!message || await sha256(message.text) !== review.selection.message_sha256) {
      throw Error("room_message_hash_mismatch");
    }
    return message.text;
  };
  const verify = (review: RoomMissionTextOwnerReview) => run(async (_signal, epoch) => {
    const text = await currentText(review);
    if (generation.current === epoch) {
      setVerified({ selectionId: review.selection.selection_id, text });
      setApproveChecked(false); setSendChecked(false);
      setNotice("Displayed room text matches the author's selected message hash. No task instruction was sent.");
    }
  });
  const approve = (review: RoomMissionTextOwnerReview) => run(async (signal, epoch) => {
    if (!approveChecked || verified?.selectionId !== review.selection.selection_id ||
        verified.text !== await currentText(review)) throw Error("review_not_verified");
    let requestId = approvalIds.current.get(review.selection.selection_id);
    if (!requestId) { requestId = `room-owner-text:${crypto.randomUUID()}`;
      approvalIds.current.set(review.selection.selection_id, requestId); }
    const approval = await approveRoomMissionTextReview(mission, review, requestId, signal);
    if (generation.current === epoch && !signal.aborted) {
      setReviews(previous => previous.map(item => item.selection.selection_id === approval.selection_id
        ? { ...item, selection: approval } : item));
      setApproveChecked(false); setSendChecked(false);
      setNotice("Owner approval recorded. Codex has not received this message; send it separately if intended.");
    }
  });
  const dispatch = (review: RoomMissionTextOwnerReview) => run(async (signal, epoch) => {
    if (!sendChecked || verified?.selectionId !== review.selection.selection_id ||
        verified.text !== await currentText(review)) throw Error("dispatch_not_verified");
    const next = await dispatchApprovedRoomMissionText(mission, review, signal);
    if (next.instruction_length !== verified.text.length) throw Error("dispatch_length_mismatch");
    if (generation.current === epoch && !signal.aborted) {
      setEvent(next); setSendChecked(false);
      setNotice("Instruction queued for the exact paired task. Pickup, a decision and game action are not confirmed.");
    }
  });
  const check = () => run(async (signal, epoch) => {
    if (!event) return;
    const next = await readRoomMissionTextDispatchStatus(mission, event.steering_event_ref, signal);
    if (next.client_event_ref !== event.client_event_ref || next.cursor !== event.cursor ||
        next.instruction_sha256 !== event.instruction_sha256) throw Error("dispatch_status_mismatch");
    if (generation.current === epoch && !signal.aborted) {
      setEvent(next);
      setNotice(next.delivery_state === "acknowledged"
        ? "The paired task acknowledged pickup. Its decision, result and game action remain separate."
        : next.delivery_state === "pending"
          ? "Instruction is queued; task pickup remains unconfirmed."
          : `Instruction is ${next.delivery_state}; no result or game action is inferred.`);
    }
  });

  if (mission.status !== "active") return null;
  return <section aria-label="Owner room text mission review" className="mt-3 space-y-2 rounded border border-cyan-300/20 p-2">
    <h4 className="text-cyan-100">Member proposals for this task</h4>
    <p className="text-slate-400">Members must select a message first. Reviewing, approving and sending are separate actions. None grants Minecraft action authority.</p>
    <button type="button" disabled={busy} onClick={() => void load()}
      className="rounded border border-white/20 px-2 py-1 disabled:opacity-40">{loaded ? "Refresh member proposals" : "Load member proposals"}</button>
    {loaded ? reviews.length ? <ul className="space-y-2">{reviews.map(review => {
      const selected = review.selection;
      const message = messageFor(review);
      const isVerified = !!message && verified?.selectionId === selected.selection_id &&
        verified.text === message.text;
      return <li key={selected.selection_id} className="rounded border border-white/10 p-2">
        <p>{room.participants.find(item => item.participant_id === selected.author_participant_id)?.display_name ?? "Room member"}</p>
        {message ? <p className="whitespace-pre-wrap text-slate-200">{message.text}</p> :
          <p className="text-amber-100">This exact message is not loaded in room chat. Refresh room text before review.</p>}
        <p className="text-slate-400">{selected.state === "approved" ? "Owner approved; not necessarily dispatched" : "Author selected; owner approval required"}</p>
        {message ? <button type="button" disabled={busy} onClick={() => void verify(review)}
          className="mt-1 rounded border border-white/20 px-2 py-1 disabled:opacity-40">Verify displayed message</button> : null}
        {isVerified && selected.state === "selected" ? <div className="mt-2">
          <label className="flex items-start gap-2"><input type="checkbox" checked={approveChecked}
            onChange={e => setApproveChecked(e.target.checked)} disabled={busy} />Approve this exact message for possible task dispatch. No task message is queued yet.</label>
          <button type="button" disabled={busy || !approveChecked} onClick={() => void approve(review)}
            className="mt-1 rounded border border-cyan-300/30 px-2 py-1 disabled:opacity-40">Record owner approval</button>
        </div> : null}
        {isVerified && selected.state === "approved" ? <div className="mt-2">
          <label className="flex items-start gap-2"><input type="checkbox" checked={sendChecked}
            onChange={e => setSendChecked(e.target.checked)} disabled={busy} />Send this approved message to the exact paired Codex task. Model usage may occur; game permissions remain separate.</label>
          <button type="button" disabled={busy || !sendChecked} onClick={() => void dispatch(review)}
            className="mt-1 rounded border border-cyan-300/30 px-2 py-1 disabled:opacity-40">Send approved text to Codex</button>
        </div> : null}
      </li>;
    })}</ul> : <p>No current author-selected messages for this mission.</p> : null}
    {event ? <div className="rounded border border-white/10 p-2">
      <p>{event.delivery_state === "acknowledged" ? "Picked up by paired client" :
        event.delivery_state === "pending" ? "Queued; pickup unconfirmed" :
          `Delivery ${event.delivery_state}`}. No decision or game action is inferred.</p>
      <button type="button" disabled={busy} onClick={() => void check()}
        className="mt-1 rounded border border-white/20 px-2 py-1 disabled:opacity-40">Check task pickup</button>
    </div> : null}
    {busy ? <p role="status">Checking exact room authority…</p> : null}
    {notice ? <p role="status" className="text-amber-100">{notice}</p> : null}
  </section>;
}
