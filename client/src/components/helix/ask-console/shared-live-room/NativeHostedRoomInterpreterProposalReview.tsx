import React, { useEffect, useRef, useState } from "react";
import { DESKTOP_AUTH0_ROOM_CONTROL_PATH as CONTROL } from "@shared/desktop-auth0-account-link";
import { hostedRoomInterpreterTurnListSchema } from "@shared/hosted-room-interpreter-turn-status";
import { hostedRoomInterpreterEvaluationListReceiptSchema } from
  "@shared/hosted-room-interpreter-evaluation";
import { nativeHostedRoomInterpreterProposalPreviewSchema } from
  "@shared/hosted-room-interpreter-proposal-source";
import { nativeHostedRoomInterpreterProposalDispatchRequestSchema,
  nativeHostedRoomInterpreterProposalDispatchReceiptSchema } from
  "@shared/hosted-room-interpreter-proposal-source";
import { NATIVE_HOSTED_ROOM_BASE_PATH as BASE } from "@shared/helix-native-hosted-room-mission";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

type Turn = ReturnType<typeof hostedRoomInterpreterTurnListSchema.parse>["turns"][number] |
  ReturnType<typeof hostedRoomInterpreterEvaluationListReceiptSchema.parse>["turns"][number];
type Preview = ReturnType<typeof nativeHostedRoomInterpreterProposalPreviewSchema.parse>;
type DispatchRequest = ReturnType<typeof nativeHostedRoomInterpreterProposalDispatchRequestSchema.parse>;

export function NativeHostedRoomInterpreterProposalReview({ roomId, authority, disabled = false }: {
  roomId: string; authority: string; disabled?: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [instructionText, setInstructionText] = useState("");
  const [approved, setApproved] = useState(false);
  const [queued, setQueued] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<DispatchRequest | null>(null);
  const epoch = useRef(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const clear = () => { epoch.current++; pending.current?.abort(); pending.current = null;
      setTurns([]); setSelected(""); setPreview(null); setBusy(false); setMessage("");
      setInstructionText(""); setApproved(false); setQueued(false); setLastAttempt(null); };
    clear(); window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    return () => { clear(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear); };
  }, [roomId, authority, disabled]);

  const read = async (requestId?: string) => {
    if (pending.current || busy || disabled || (requestId && !turns.some(turn =>
      turn.request_id === requestId && turn.state === "completed"))) return;
    const current = epoch.current;
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    setBusy(true); setMessage(""); setPreview(null); setApproved(false);
    setInstructionText(""); setQueued(false); setLastAttempt(null);
    try {
      const response = await fetch(requestId
        ? `${BASE}/${encodeURIComponent(roomId)}/proposal-sources/${encodeURIComponent(requestId)}`
        : CONTROL, { method: requestId ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
        signal: controller.signal, headers: { Accept: "application/json",
          ...(requestId ? {} : { "Content-Type": "application/json" }) },
        ...(requestId ? {} : { body: JSON.stringify({ operation: "interpreter_turn_list", room_id: roomId }) }) });
      if (!response.ok) throw Error("unavailable");
      const raw = await response.json();
      if (current !== epoch.current || controller.signal.aborted) return;
      if (requestId) {
        const value = nativeHostedRoomInterpreterProposalPreviewSchema.parse(raw);
        if (value.room_id !== roomId || value.authority !== authority ||
            value.source.source.request_id !== requestId) throw Error("source_changed");
        setPreview(value);
      } else {
        const value = hostedRoomInterpreterTurnListSchema.parse(raw);
        if (value.room.room_id !== roomId || value.turns.some(turn => turn.room_id !== roomId))
          throw Error("wrong_room");
        let evaluationTurns: Turn[] = [];
        try {
          const evaluationResponse = await fetch(CONTROL, { method: "POST",
            credentials: "same-origin", cache: "no-store", signal: controller.signal,
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "interpreter_evaluation_list", room_id: roomId }) });
          if (!evaluationResponse.ok) throw Error("evaluation_unavailable");
          const evaluation = hostedRoomInterpreterEvaluationListReceiptSchema.parse(
            await evaluationResponse.json());
          if (evaluation.room.room_id !== roomId || evaluation.turns.some(turn =>
            turn.room_id !== roomId)) throw Error("wrong_room");
          evaluationTurns = evaluation.turns;
        } catch {
          if (controller.signal.aborted || current !== epoch.current) return;
          setMessage("Two-turn evaluation replies could not be listed. Single-turn replies remain available for review.");
        }
        if (current !== epoch.current || controller.signal.aborted) return;
        const byRequest = new Map<string, Turn>();
        for (const turn of [...value.turns, ...evaluationTurns])
          byRequest.set(turn.request_id, turn);
        setTurns([...byRequest.values()].filter(turn => turn.state === "completed")); setSelected("");
      }
    } catch {
      if (current === epoch.current) {
        setPreview(null);
        if (!requestId) { setTurns([]); setSelected(""); }
        setMessage(requestId
          ? "This AI source or selected task could not be verified. Refresh both before review."
          : "Completed room AI turns are unavailable. Check the room connection.");
      }
    } finally { clearTimeout(timer); if (pending.current === controller) {
      pending.current = null; if (current === epoch.current) setBusy(false); } }
  };

  const dispatch = async (retry?: DispatchRequest) => {
    if (pending.current || busy || disabled || queued ||
        (!retry && (!preview || !approved || !instructionText.trim()))) return;
    const body = retry ?? nativeHostedRoomInterpreterProposalDispatchRequestSchema.parse({
      room_id: roomId, selection_ref: preview!.selection_ref,
      selection_revision: preview!.selection_revision,
      turn_request_id: preview!.source.source.request_id,
      context_sha256: preview!.source.source.context_sha256,
      result_sha256: preview!.source.source.result_sha256,
      instruction_text: instructionText.trim(), approve_task_handoff: true,
    });
    const current = epoch.current;
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    setBusy(true); setApproved(false); setMessage(""); setLastAttempt(body);
    let definiteRejection = false;
    try {
      const response = await fetch(`${BASE}/interpreter-proposals/dispatch`, {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        definiteRejection = raw?.outcome_unknown !== true;
        throw Error("dispatch_unconfirmed");
      }
      const receipt = nativeHostedRoomInterpreterProposalDispatchReceiptSchema.parse(raw);
      if (current !== epoch.current || controller.signal.aborted) return;
      setQueued(true); setLastAttempt(null);
      setMessage(`Instruction queued for the selected Codex task (${receipt.steering_event_ref}). Task pickup and any action remain unconfirmed.`);
    } catch {
      if (current === epoch.current) {
        if (definiteRejection) { setLastAttempt(null); setPreview(null); }
        setMessage(definiteRejection
          ? "The source, task or account changed. Refresh both before reviewing another instruction."
          : "Queue outcome is unconfirmed. Retry the exact same request to reuse its delivery identity, or inspect task status.");
      }
    } finally { clearTimeout(timer); if (pending.current === controller) {
      pending.current = null; if (current === epoch.current) setBusy(false); } }
  };

  return <section aria-label="Room AI mission proposal review" className="mt-3 rounded border border-fuchsia-300/20 p-3 text-xs">
    <p className="font-semibold text-fuchsia-100">AI reply and task review</p>
    <p className="mt-1 text-slate-400">Inspect a completed reply against the selected task, then write and explicitly approve your own instruction. The AI reply alone cannot steer the task.</p>
    <p className="mt-1 break-all text-slate-300">Room: {roomId}</p>
    <button type="button" disabled={busy || disabled} onClick={() => void read()}>Load completed AI replies</button>
    {turns.length ? <>
      <select aria-label="AI reply to review" value={selected} disabled={busy || disabled}
        onChange={event => { setSelected(event.target.value); setPreview(null); setMessage("");
          setInstructionText(""); setApproved(false); setQueued(false); setLastAttempt(null); }}>
        <option value="">Choose a completed reply</option>
        {turns.map(turn => <option key={turn.request_id} value={turn.request_id}>
          {"turn_ordinal" in turn ? `Evaluation ${turn.turn_ordinal} · ` : ""}Reply to {turn.trigger_message_id}
        </option>)}
      </select>
      <button type="button" disabled={busy || disabled || !selected}
        onClick={() => void read(selected)}>Review exact source and task</button>
    </> : null}
    {preview ? <div className="mt-2 space-y-2 rounded border border-white/10 p-2">
      <p>Selected Codex task: <code>{preview.task_label}</code> · revision {preview.selection_revision}</p>
      <p>Room member <code>{preview.source.source.trigger_author_participant_id}</code>:</p>
      <p className="whitespace-pre-wrap">{preview.source.source.trigger_text}</p>
      <p>Shared AI reply:</p>
      <p className="whitespace-pre-wrap">{preview.source.source.reply_text}</p>
      <p className="text-slate-400">Current source verified for review. The reply itself does not steer the task.</p>
      {!queued ? <>
        <label className="block">Your instruction for this Codex task
          <textarea value={instructionText} disabled={busy || disabled || Boolean(lastAttempt)}
            maxLength={4000} className="mt-1 block w-full rounded border border-white/20 bg-slate-950 p-2"
            onChange={event => { setInstructionText(event.target.value); setApproved(false); }} />
        </label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={approved}
          disabled={busy || disabled || !instructionText.trim() || Boolean(lastAttempt)}
          onChange={event => setApproved(event.target.checked)} />
          I reviewed this room source, my instruction and the selected task. Queue my instruction for that task.
        </label>
        <button type="button" disabled={busy || disabled || !approved || !instructionText.trim() || Boolean(lastAttempt)}
          onClick={() => void dispatch()}>Queue my reviewed instruction</button>
      </> : null}
    </div> : null}
    {lastAttempt && !queued ? <button type="button" disabled={busy || disabled}
      onClick={() => void dispatch(lastAttempt)}>Retry the exact queue request</button> : null}
    {message ? <p role="status" className="mt-2 text-amber-100">{message}</p> : null}
  </section>;
}
