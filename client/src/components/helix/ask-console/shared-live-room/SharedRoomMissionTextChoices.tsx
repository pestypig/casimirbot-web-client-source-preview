import React, { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

type OwnMessage = { message_id: string; room_id: string; author_participant_id: string; text: string };
const selectionSchema = z.object({
  selection_id: z.string(), room_id: z.string(), message_id: z.string(),
  author_participant_id: z.string(), mission_id: z.string(),
  mission_revision: z.number().int().positive(),
  state: z.enum(["selected", "approved", "revoked"]),
  consent_revision: z.number().int().positive(), selected_at: z.string(), expires_at: z.string(),
  raw_content_included: z.literal(false), task_handoff: z.literal(false),
  dispatch_authority: z.literal(false), provider_calls: z.literal(0),
}).passthrough();
type Selection = z.infer<typeof selectionSchema>;
const base = (roomId: string) => `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}`;

/** Ordinary room text remains human-only until its author explicitly selects
 * one message. This control never receives task-binding fields or sends text
 * to an AI; the server derives the current mission and records consent. */
export function SharedRoomMissionTextChoices({ room, messages, admitted }: {
  room: HelixSharedRealtimeRoom; messages: OwnMessage[]; admitted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [currentMission, setCurrentMission] = useState<{
    mission_id: string; mission_revision: number } | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [accountEpoch, setAccountEpoch] = useState(0);
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const own = messages.filter(item => item.room_id === room.room_id &&
    item.author_participant_id === room.self_participant_id);

  useEffect(() => {
    generation.current += 1;
    pending.current?.abort();
    setOpen(false); setSelections([]); setCurrentMission(null);
    setReviewId(null); setBusy(false); setNotice("");
    const accountChanged = () => { generation.current += 1; pending.current?.abort();
      setAccountEpoch(value => value + 1); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
    return () => { generation.current += 1; pending.current?.abort();
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged); };
  }, [room.room_id, room.self_participant_id, room.status, accountEpoch]);

  const refresh = async (signal: AbortSignal, epoch: number) => {
    const response = await fetch(`${base(room.room_id)}/mission-text-selections`,
      { credentials: "include", cache: "no-store", signal });
    if (!response.ok) throw Error(response.status === 403 ? "developer_only" : "selection_read_failed");
    const result = z.object({ schema: z.literal("helix.room_mission_text_selections.v1"),
      room_id: z.literal(room.room_id), selections: z.array(selectionSchema),
      current_mission: z.object({ mission_id: z.string(),
        mission_revision: z.number().int().positive() }).nullable(),
      model_input: z.literal(false), task_handoff: z.literal(false), provider_calls: z.literal(0),
    }).passthrough().parse(await response.json());
    if (result.selections.some(row => row.room_id !== room.room_id ||
        row.author_participant_id !== room.self_participant_id)) throw Error("selection_scope_mismatch");
    if (generation.current === epoch && !signal.aborted) {
      setSelections(result.selections); setCurrentMission(result.current_mission);
    }
  };
  const show = async () => {
    if (busy || !admitted || room.status === "closed") return;
    const epoch = generation.current;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setNotice("");
    try { await refresh(controller.signal, epoch); if (generation.current === epoch) setOpen(true); }
    catch (error) { if (generation.current === epoch && !controller.signal.aborted)
      setNotice(error instanceof Error && error.message === "developer_only"
        ? "Mission-message selection is not available on this account. No AI instruction was sent."
        : "Mission choices could not be checked. No AI instruction was sent."); }
    finally { if (generation.current === epoch) setBusy(false); }
  };
  const change = async (message: OwnMessage, action: "select" | "revoke", selection?: Selection) => {
    if (busy || !admitted || room.status === "closed" ||
        message.room_id !== room.room_id || message.author_participant_id !== room.self_participant_id ||
        (action === "revoke" && (!selection || selection.message_id !== message.message_id))) return;
    const epoch = generation.current;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`${base(room.room_id)}/mission-text-selections/current`, {
        method: "POST", credentials: "include", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(action === "select"
          ? { action, message_id: message.message_id }
          : { action, selection_id: selection!.selection_id }),
      });
      if (!response.ok) throw Error("selection_outcome_unknown");
      const result = z.object({ schema: z.literal("helix.room_mission_text_selection_response.v1"),
        room_id: z.literal(room.room_id), selection: selectionSchema,
        model_input: z.literal(false), task_handoff: z.literal(false), provider_calls: z.literal(0),
      }).passthrough().parse(await response.json());
      const receipt = result.selection;
      if (receipt.message_id !== message.message_id ||
          receipt.author_participant_id !== room.self_participant_id ||
          receipt.state !== (action === "select" ? "selected" : "revoked") &&
          !(action === "select" && receipt.state === "approved") ||
          (selection && receipt.selection_id !== selection.selection_id)) throw Error("selection_receipt_mismatch");
      await refresh(controller.signal, epoch);
      if (generation.current !== epoch || controller.signal.aborted) return;
      setReviewId(null);
      setNotice(action === "select"
        ? "Message selected for the room owner's review. It has not been sent to Codex."
        : "Selection revoked. Undelivered task pickup is blocked; already observed text cannot be recalled.");
    } catch {
      if (generation.current === epoch && !controller.signal.aborted)
        setNotice("The selection outcome is unconfirmed. Refresh before retrying; no task action is inferred.");
    } finally { if (generation.current === epoch) setBusy(false); }
  };

  if (!admitted || room.status === "closed" || own.length === 0) return null;
  return <section aria-label="Room mission message choices" className="mt-3 rounded-lg border border-cyan-300/20 p-2">
    <p className="text-cyan-100">Your messages · room mission</p>
    <p className="mt-1 text-slate-400">Room chat stays human-only. Select one of your messages only if you want the owner to review it for the paired Codex task. The owner must separately approve and send it.</p>
    <button type="button" disabled={busy} onClick={() => void show()}
      className="mt-2 rounded border border-white/20 px-2 py-1 disabled:opacity-40">{open ? "Refresh mission choices" : "Review mission choices"}</button>
    {open ? <ul className="mt-2 space-y-2">{own.map(message => {
      const matching = selections.filter(row => row.message_id === message.message_id && row.state !== "revoked");
      const receipt = matching.find(row => row.mission_id === currentMission?.mission_id &&
        row.mission_revision === currentMission?.mission_revision);
      const earlier = matching.filter(row => row !== receipt);
      const expired = receipt && Date.parse(receipt.expires_at) <= Date.now();
      return <li key={message.message_id} className="rounded border border-white/10 p-2">
        <p className="whitespace-pre-wrap text-slate-200">{message.text}</p>
        <p className="mt-1 text-slate-400">{expired ? "Selection expired; write a new message for fresh review" :
          receipt?.state === "approved" ? "Owner approved; a separate send is still required" :
          receipt?.state === "selected" ? "Awaiting owner review for the current mission" :
            currentMission ? "Room members only for the current mission" : "No current room mission selected"}</p>
        {receipt ? <button type="button" disabled={busy} onClick={() => void change(message, "revoke", receipt)}
          className="mt-1 rounded border border-amber-300/30 px-2 py-1 disabled:opacity-40">Revoke mission selection</button>
          : currentMission ? <button type="button" disabled={busy} onClick={() => setReviewId(message.message_id)}
            className="mt-1 rounded border border-cyan-300/30 px-2 py-1 disabled:opacity-40">Review selection</button>
          : null}
        {earlier.map(prior => <p key={prior.selection_id} className="mt-1 text-amber-100">
          Earlier mission selection is {prior.state}; it is not approval for the current task.
          <button type="button" disabled={busy} onClick={() => void change(message, "revoke", prior)}
            className="ml-2 rounded border border-amber-300/30 px-2 py-1 disabled:opacity-40">Revoke earlier selection</button>
        </p>)}
        {reviewId === message.message_id && !receipt && currentMission ? <div className="mt-2 rounded border border-cyan-300/30 p-2">
          <p>This exact message may be shown to the room owner for the current mission. Selecting does not queue a Codex instruction or grant gameplay authority.</p>
          <button type="button" disabled={busy} onClick={() => void change(message, "select")}
            className="mt-2 rounded border border-cyan-300/30 px-2 py-1 disabled:opacity-40">Select this message for owner review</button>
          <button type="button" disabled={busy} onClick={() => setReviewId(null)} className="ml-2 text-slate-300">Cancel</button>
        </div> : null}
      </li>;
    })}</ul> : null}
    {notice ? <p role="status" className="mt-2 text-amber-100">{notice}</p> : null}
  </section>;
}
