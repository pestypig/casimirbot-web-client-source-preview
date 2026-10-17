import React, { useEffect, useRef, useState } from "react";
import { helixSharedLiveRoomApi } from "../helix/ask-console/shared-live-room/SharedLiveRoomApi";

type Props = { profileRef: string; serviceInstanceRef: string; clientSessionRef: string; continuationRef: string; chatId: string };

/** Requests setup only. The enclosing keyed component resets on target change. */
export default function EnvironmentSessionPreparationRequest(props: Props) {
  const [rooms, setRooms] = useState<Array<{ room_id: string; title: string }>>([]);
  const [roomId, setRoomId] = useState("");
  const [duration, setDuration] = useState(3600);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading available rooms…");
  const [queued, setQueued] = useState(false);
  const [expiredConfirmed, setExpiredConfirmed] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now);
  const request = useRef<{ key: string; id: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  useEffect(() => {
    let active = true;
    void helixSharedLiveRoomApi.listRooms().then(rows => {
      if (!active) return;
      const available = rows.filter(row => row.status !== "closed");
      setRooms(available);
      if (available.length === 1) setRoomId(available[0].room_id);
      setMessage(available.length ? "Choose the room to prepare. This does not grant game control." : "Open or create a Shared Live Room first.");
    }).catch(() => { if (active) setMessage("Room list unavailable. Reopen this setup after checking the connection."); });
    return () => { active = false; controller.current?.abort(); };
  }, []);
  const submit = async (replaceExpired = false) => {
    if (!roomId || busy || (replaceExpired && !expiredConfirmed)) return;
    const key = "helix:environment-preparation:v1:" + JSON.stringify([
      props.profileRef, props.serviceInstanceRef, props.clientSessionRef,
      props.continuationRef, props.chatId, roomId, duration]);
    // Persist before delivery. Unknown outcomes must not acquire a new identity
    // merely because the user closed and reopened the panel.
    try {
      if (replaceExpired || request.current?.key !== key) {
        const saved = sessionStorage.getItem(key);
        const id = replaceExpired ? crypto.randomUUID() : saved || crypto.randomUUID();
        sessionStorage.setItem(key, id);
        request.current = { key, id };
        if (replaceExpired) { setExpiredConfirmed(false); setQueued(false); setExpiresAt(null); }
      }
    } catch {
      setMessage("Preparation was not sent: this window cannot retain its retry identity. Restore browser storage before retrying.");
      return;
    }
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setMessage("Requesting preparation from this exact AI task…");
    try {
      const response = await fetch("/api/account/session/agent-connections/environment-session/prepare-request", {
        method: "POST", credentials: "same-origin", signal: abort.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: request.current.id, client_session_ref: props.clientSessionRef,
          client_continuation_ref: props.continuationRef, helix_conversation_id: props.chatId,
          room_id: roomId, requested_duration_seconds: duration }),
      });
      const body = await response.json();
      if (abort.signal.aborted) return;
      if (response.status === 409 && body.ok === false && body.error === "preparation_intent_expired") {
        setExpiredConfirmed(true);
        setMessage("The server confirmed this preparation request expired. You can request preparation again; the task must check and reuse any valid run. This does not renew binding or gameplay permissions.");
        return;
      }
      if (response.status === 409 && body.ok === false && body.error === "preparation_target_unavailable") {
        setMessage("This AI task's presence is unavailable. Ask the same task to refresh its presence, then check preparation again. Your request ID is retained; do not rebind or restart the app.");
        return;
      }
      if (response.status !== 202 || body.ok !== true || !["pending", "run_prepared"].includes(body.intent?.status) ||
          body.execution_authority !== false || body.task_binding_authority !== false) throw new Error("not_accepted");
      setQueued(true);
      setExpiredConfirmed(false);
      const deadline = Date.parse(body.intent.expiresAt);
      setExpiresAt(Number.isFinite(deadline) ? deadline : null);
      setMessage(body.intent.status === "run_prepared"
        ? "The task recorded run preparation. Wait for its current verified run to appear above before reviewing the binding checkbox. This is not a binding approval or gameplay readiness."
        : "Preparation requested. The same AI task must read its Ready up inbox while running. This does not wake an idle task. Wait for a verified run above, then review its binding checkbox; no game permission was granted.");
    } catch {
      if (!abort.signal.aborted) setMessage("Preparation was not confirmed. Retry preserves this request ID; do not generate a chat-only binding to work around it.");
    } finally { if (!abort.signal.aborted) setBusy(false); }
  };
  return <section aria-label="Prepare environment session" className="mt-3 space-y-2 rounded border border-cyan-400/20 p-3">
    <label className="block">Room
      <select aria-label="Preparation room" value={roomId} disabled={busy || queued}
        onChange={event => setRoomId(event.target.value)} className="ml-2 bg-slate-950">
        <option value="">Select a room</option>
        {rooms.map(room => <option key={room.room_id} value={room.room_id}>{room.title} · {room.room_id}</option>)}
      </select>
    </label>
    <label className="block">Requested session duration
      <select aria-label="Requested session duration" value={duration} disabled={busy || queued}
        onChange={event => setDuration(Number(event.target.value))} className="ml-2 bg-slate-950">
        <option value={3600}>1 hour</option><option value={28800}>8 hours (development)</option>
      </select>
    </label>
    <button type="button" disabled={!roomId || busy || expiredConfirmed} onClick={() => void submit()}
      className="rounded border border-cyan-400/30 px-3 py-2 disabled:opacity-50">
      {busy ? "Requesting…" : queued ? "Check preparation" : "Ready up this room"}
    </button>
    {expiredConfirmed && <button type="button" disabled={busy} onClick={() => void submit(true)}
      className="rounded border border-cyan-400/30 px-3 py-2 disabled:opacity-50">Request preparation again</button>}
    <p role="status" className="text-sm text-slate-300">{message}</p>
    {expiresAt && <p className="text-sm text-slate-300">
      {clock >= expiresAt
        ? "Preparation delivery window expired. This is not the game-session lease. Ask the same AI task to check the current run before requesting replacement preparation."
        : `Preparation delivery window: ${Math.ceil((expiresAt - clock) / 1000)} seconds remaining. This is not the requested game-session duration.`}
    </p>}
  </section>;
}
