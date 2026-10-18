import React, { useEffect, useRef, useState } from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { reviewedRoomInstructionOptionsSchema, reviewedRoomInstructionReceiptSchema } from "@shared/helix-hosted-room-instruction";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { useRoomMissionHandoffReview } from "./RoomMissionHandoffReview";

/** The originating browser alone has the full speech preview. Transfer is an
 * explicit owner action; metadata, room speech and mounting never send it. */
export function ReviewedRoomInstructionPanel({ room }: { room: HelixSharedRealtimeRoom }) {
  const [options, setOptions] = useState<ReturnType<typeof reviewedRoomInstructionOptionsSchema.parse> | null>(null);
  const [selected, setSelected] = useState("");
  const [approved, setApproved] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const entries = useRoomMissionHandoffReview(state => state.entries);
  const generation = useRef(0), pending = useRef<AbortController | null>(null);
  const choices = (options?.captures ?? []).flatMap(capture => {
    const local = entries.find(e => e.roomId === room.room_id && e.handoffId === capture.handoff_id &&
      e.realtimeSessionId === capture.realtime_session_id && e.textHash === capture.transcript_text_hash &&
      e.text.length === capture.transcript_text_char_count);
    return local ? [{ capture, local }] : [];
  });
  const chosen = choices.find(c => c.capture.handoff_id === selected);
  useEffect(() => { setApproved(false); }, [selected, chosen?.local.text, entries, options]);
  useEffect(() => {
    const clear = () => { generation.current++; pending.current?.abort(); pending.current = null;
      setOptions(null); setSelected(""); setApproved(false); setBusy(false); setMessage(""); };
    clear(); window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    return () => { generation.current++; pending.current?.abort(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear); };
  }, [room.room_id, room.status]);
  const run = async (send: boolean) => {
    if (pending.current || busy || (send && (!approved || !chosen || !options))) return;
    const epoch = generation.current, controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000); setBusy(true); setMessage(""); setApproved(false);
    const reviewed = options, choice = chosen;
    if (!send) { setOptions(null); setSelected(""); }
    try {
      const response = await fetch(`/api/account/session/rooms/${encodeURIComponent(room.room_id)}/reviewed-instructions`, {
        method: send ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", ...(send ? { "Content-Type": "application/json" } : {}) },
        ...(send ? { body: JSON.stringify({ room_id: room.room_id, attachment: reviewed!.attachment,
          capture: choice!.capture, instruction_text: choice!.local.text, approve_transfer: true }) } : {}), signal: controller.signal });
      const value = await response.json();
      if (epoch !== generation.current || controller.signal.aborted) return;
      if (!response.ok) throw new Error("rejected");
      if (send) {
        const receipt = reviewedRoomInstructionReceiptSchema.parse(value);
        if (receipt.room.room_id !== room.room_id || JSON.stringify(receipt.attachment) !== JSON.stringify(reviewed!.attachment) ||
            JSON.stringify(receipt.capture) !== JSON.stringify(choice!.capture) || Date.parse(receipt.expires_at) <= Date.now()) throw new Error("changed");
        setOptions(null); setSelected("");
        setMessage(`Reviewed text is available to your selected native harness until ${new Date(receipt.expires_at).toLocaleTimeString()}. In the harness, load captured instructions and queue this capture. Work has not started.`);
      } else {
        const parsed = reviewedRoomInstructionOptionsSchema.parse(value);
        if (parsed.room_id !== room.room_id || Date.parse(parsed.attachment.expires_at) <= Date.now()) throw new Error("changed");
        setOptions(parsed);
      }
    } catch {
      if (epoch === generation.current) { setOptions(null); setSelected(""); setMessage(send
        ? "Transfer could not be confirmed. Refresh and review the same capture before retrying; it will not queue work twice."
        : "Native transfer is unavailable. Select a paired task in your native harness and check the room connection, account and consent."); }
    } finally { clearTimeout(timer); if (epoch === generation.current) { pending.current = null; setBusy(false); } }
  };
  if (typeof window !== "undefined" && window.casimirDesktop?.openAuth0AccountLink) return null;
  return <section aria-label="Transfer reviewed room instruction" className="rounded-xl border border-white/20 p-3 text-xs">
    <h3>Send captured speech to your native harness</h3>
    <p>Review the full instruction here. Only your selected native node can retrieve it, for up to ten minutes or the remaining attachment time. Queueing there uses the connected AI account.</p>
    <button type="button" disabled={busy || room.status === "closed"} onClick={() => void run(false)}>Load captures for native transfer</button>
    {options ? <>
      <p>Selected node {options.attachment.node_ref.slice(-12)} · attachment revision {options.attachment.revision}</p>
      <label>Captured instruction <select aria-label="Captured instruction to transfer" value={selected} disabled={busy}
        onChange={event => setSelected(event.target.value)}>
        <option value="">Choose captured speech</option>
        {choices.map(({ capture }) => <option key={capture.handoff_id} value={capture.handoff_id}>
          {room.participants.find(p => p.participant_id === capture.speaker_participant_id)?.display_name ?? "Room participant"} · {new Date(capture.captured_at_ms).toLocaleTimeString()}
        </option>)}
      </select></label>
      {!choices.length ? <p>No current capture has its full original text in this browser. Capture new room speech here, then refresh.</p> : null}
      {chosen ? <>
        <p>Capture: <code>{chosen.capture.handoff_id}</code></p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap">{chosen.local.text}</pre>
        <label><input type="checkbox" checked={approved} disabled={busy} onChange={event => setApproved(event.target.checked)} />I approve transferring this exact instruction to my selected native harness.</label>
        <button type="button" disabled={busy || !approved} onClick={() => void run(true)}>Transfer reviewed instruction</button>
      </> : null}
    </> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
