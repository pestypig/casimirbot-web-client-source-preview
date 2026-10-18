import React, { useEffect, useRef, useState } from "react";
import { nativeRoomInstructionCatalogSchema } from "@shared/helix-hosted-room-instruction";
import { NATIVE_HOSTED_ROOM_BASE_PATH as BASE } from "@shared/helix-native-hosted-room-mission";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

export function NativeRoomInstructionsPanel({ roomId, authority, disabled = false }: { roomId: string; authority: string; disabled?: boolean }) {
  const [catalog, setCatalog] = useState<ReturnType<typeof nativeRoomInstructionCatalogSchema.parse> | null>(null);
  const [selected, setSelected] = useState(""), [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const generation = useRef(0), pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const clear = () => { generation.current++; pending.current?.abort(); pending.current = null;
      setCatalog(null); setSelected(""); setApproved(false); setBusy(false); setMessage(""); };
    clear(); window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    return () => { generation.current++; pending.current?.abort(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear); };
  }, [roomId, authority, disabled]);
  const run = async (queue: boolean) => {
    if (pending.current || disabled || (queue && (!approved || !catalog?.captures.some(c => c.handoff_id === selected)))) return;
    const epoch = generation.current, controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000); setBusy(true); setMessage(""); setApproved(false);
    const reviewed = catalog; if (!queue) { setCatalog(null); setSelected(""); }
    try {
      const response = await fetch(queue ? `${BASE}/dispatch` : `${BASE}/${encodeURIComponent(roomId)}/instructions`, {
        method: queue ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", ...(queue ? { "Content-Type": "application/json" } : {}) },
        ...(queue ? { body: JSON.stringify({ room_id: roomId, selection_ref: reviewed!.selection_ref,
          selection_revision: reviewed!.selection_revision, handoff_id: selected, use_reviewed_transfer: true }) } : {}), signal: controller.signal });
      const value = await response.json(); if (epoch !== generation.current || controller.signal.aborted) return;
      if (!response.ok) throw new Error("unconfirmed");
      if (queue) {
        if (value?.schema !== "helix.native_hosted_room_dispatch.v1" || value.ok !== true || value.instruction_queued !== true ||
            value.task_pickup_confirmed !== false || value.execution_authority !== false || value.answer_authority !== false ||
            value.raw_content_included !== false || value.terminal_eligible !== false) throw new Error("invalid");
        setCatalog(null); setSelected(""); setMessage("Instruction queued for the selected task. Task pickup and execution are not yet confirmed.");
      } else {
        const parsed = nativeRoomInstructionCatalogSchema.parse(value);
        if (parsed.room_id !== roomId || parsed.authority !== authority) throw new Error("changed");
        setCatalog(parsed);
      }
    } catch { if (epoch === generation.current) { setCatalog(null); setSelected(""); setMessage(queue
      ? "Queueing could not be confirmed. Refresh and retry the same capture and selection to reuse its delivery identity. An expired or missing transfer needs a new browser review."
      : "Captured instructions are unavailable. Check the selected task, room connection, pairing and consent."); } }
    finally { clearTimeout(timer); if (epoch === generation.current) { pending.current = null; setBusy(false); } }
  };
  return <section aria-label="Native room instructions" className="mt-3 rounded border border-white/20 p-3 text-xs">
    <p>Room instructions</p>
    <p>First review and transfer the full speech in the room browser. Loading here reads capture metadata only.</p>
    <button type="button" disabled={busy || disabled} onClick={() => void run(false)}>Load captured instructions</button>
    {catalog ? <>
      <p>Selected task: {catalog.task_label} · revision {catalog.selection_revision}</p>
      <select aria-label="Captured instruction to queue" value={selected} disabled={busy || disabled}
        onChange={event => { setSelected(event.target.value); setApproved(false); }}>
        <option value="">Choose the reviewed capture</option>
        {catalog.captures.map(c => <option key={c.handoff_id} value={c.handoff_id}>
          {new Date(c.captured_at_ms).toLocaleTimeString()} · {c.speaker_participant_id} · {c.transcript_text_char_count} characters
        </option>)}
      </select>
      {selected ? <>
        <p>Capture: <code>{selected}</code></p>
        <label><input type="checkbox" disabled={busy || disabled} checked={approved} onChange={event => setApproved(event.target.checked)} />Queue the owner-reviewed instruction for this task using its connected AI account.</label>
        <button type="button" disabled={busy || disabled || !approved} onClick={() => void run(true)}>Queue reviewed instruction</button>
      </> : null}
    </> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
