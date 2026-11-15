import { useEffect, useRef, useState } from "react";
import { readRoomServiceTarget } from "@shared/helix-room-service-navigation";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";

const HEARTBEAT_MS = 15_000;
type State = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; room: HelixSharedRealtimeRoom } |
  { kind: "error"; diagnostic: string } | { kind: "left"; title: string };

class RoomPresenceError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

async function updateRoomPresence(roomId: string, presence: "present" | "away", keepalive = false) {
  const response = await fetch(`/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/presence`, {
    method: "POST", credentials: "same-origin", cache: "no-store", keepalive,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ presence }),
  });
  const payload: unknown = await response.json().catch(() => null);
  const failure = record(payload) && typeof payload.error === "string" &&
    /^[a-z][a-z0-9_]{0,95}$/u.test(payload.error) ? payload.error : "room_connection_unavailable";
  const room = record(payload) && record(payload.room) ? payload.room : null;
  if (!response.ok || !record(payload) || payload.schema !== "helix.shared_realtime_room.response.v1" ||
      payload.ok !== true || !room || room.room_id !== roomId ||
      typeof room.self_participant_id !== "string" || !Array.isArray(room.participants)) {
    throw new RoomPresenceError(failure, response.status);
  }
  return room as HelixSharedRealtimeRoom;
}

/** The public site maintains presence and lets the room owner issue a one-time
 * invitation. The installed workstation owns task selection, sources and AI. */
export function SiteRoomPresencePage() {
  const roomId = readRoomServiceTarget(window.location.search);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const [invitation, setInvitation] = useState<{ code: string; expires: string } | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState(false);
  const presenceGeneration = useRef(0);
  const leaving = useRef(false);

  async function leaveRoom() {
    if (!roomId || leaving.current || !leaveConfirm || state.kind !== "ready") return;
    const participant = state.room.participants.find(member =>
      member.participant_id === state.room.self_participant_id);
    if (participant?.role !== "participant") return;
    const title = state.room.title;
    leaving.current = true;
    presenceGeneration.current += 1;
    setLeaveBusy(true);
    setLeaveError(false);
    try {
      const response = await fetch(`/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/leave-participant`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ participant_only: true, expected_participant_id: participant.participant_id }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !record(body) || body.schema !== "helix.shared_realtime_room.response.v1" ||
          body.ok !== true || body.room !== null) throw new Error("leave_unconfirmed");
      setAttempt(0);
      setState({ kind: "left", title });
      setLeaveConfirm(false);
    } catch {
      leaving.current = false;
      setLeaveError(true);
      setAttempt(value => value + 1);
    } finally {
      setLeaveBusy(false);
    }
  }

  async function createInvitation() {
    if (!roomId || inviteBusy) return;
    setInviteBusy(true);
    setInviteError(false);
    setInvitation(null);
    try {
      const response = await fetch(`/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/invites`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body: unknown = await response.json();
      if (!response.ok || !record(body) || body.schema !== "helix.shared_realtime_room.response.v1" ||
          body.ok !== true || !record(body.room) || body.room.room_id !== roomId ||
          typeof body.invite_code !== "string" || !/^helix_live_[A-Za-z0-9_-]{32}$/u.test(body.invite_code) ||
          typeof body.invite_expires_at !== "string" || !Number.isFinite(Date.parse(body.invite_expires_at))) {
        throw new Error("invalid_invitation");
      }
      setInvitation({ code: body.invite_code, expires: body.invite_expires_at });
    } catch {
      setInviteError(true);
    } finally {
      setInviteBusy(false);
    }
  }

  useEffect(() => {
    if (!roomId || attempt === 0) return;
    let active = true;
    let entered = false;
    let timer: number | null = null;
    const generation = ++presenceGeneration.current;
    const heartbeat = async () => {
      if (!active || generation !== presenceGeneration.current || leaving.current) return;
      try {
        const room = await updateRoomPresence(roomId, "present");
        if (active && generation === presenceGeneration.current && !leaving.current) {
          entered = true;
          setState({ kind: "ready", room });
        }
      } catch (error) {
        if (active && generation === presenceGeneration.current && !leaving.current)
          setState({ kind: "error", diagnostic: error instanceof RoomPresenceError
          ? `${error.code} · HTTP ${error.status}` : "room_connection_unavailable" });
      } finally {
        if (active && generation === presenceGeneration.current && !leaving.current)
          timer = window.setTimeout(() => { void heartbeat(); }, HEARTBEAT_MS);
      }
    };
    const leave = () => {
      if (entered && generation === presenceGeneration.current && !leaving.current)
        void updateRoomPresence(roomId, "away", true).catch(() => undefined);
    };
    setState({ kind: "loading" });
    void heartbeat();
    window.addEventListener("pagehide", leave);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("pagehide", leave);
    };
  }, [roomId, attempt]);

  const self = state.kind === "ready" ? state.room.participants.find(member =>
    member.participant_id === state.room.self_participant_id) : null;
  return <main className="min-h-screen bg-[#050b18] px-5 py-8 text-slate-100">
    <div className="mx-auto max-w-2xl">
      <nav className="flex gap-5 border-b border-white/10 pb-5 text-sm">
        <a href="/" className="text-cyan-200">Home</a>
        <a href="/account" className="text-cyan-200">Account</a>
      </nav>
      <h1 className="mt-12 text-3xl font-semibold">CasimirBot service room</h1>
      <p className="mt-4 text-slate-300">This link does not enter the room. Open it with the same signed-in account used in CasimirBot, then leave this page open to keep your room presence current. Task selection, Minecraft sources, AI, voice, and commands stay in the installed app with their separate approvals.</p>
      {!roomId ? <p role="alert" className="mt-8 text-amber-200">Open a selected service room from the installed CasimirBot app.</p> : null}
      {roomId && state.kind === "idle" ? <button type="button" className="mt-8 rounded border border-cyan-300/60 px-4 py-2" onClick={() => setAttempt(value => value + 1)}>Open selected room</button> : null}
      {roomId && state.kind === "loading" ? <p role="status" className="mt-8">Checking this room…</p> : null}
      {roomId && state.kind === "left" ? <section className="mt-8 rounded-xl border border-white/20 p-5">
        <p role="status">You left {state.title}. Room access and room-scoped friend updates are no longer available to this membership.</p>
        <p className="mt-3 text-sm text-slate-300">To rejoin, ask the owner for a fresh one-time invite and use Join service room in CasimirBot. Previously imported messages remain in their destination chats.</p>
      </section> : null}
      {roomId && state.kind === "error" ? <section className="mt-8 rounded-xl border border-amber-300/30 p-5">
        <p role="alert">This account could not enter the selected room. Check that you signed in with the same account used in CasimirBot.</p>
        <p className="mt-2 font-mono text-xs text-amber-200">{state.diagnostic}</p>
        <button type="button" className="mt-4 rounded border border-white/30 px-4 py-2" onClick={() => setAttempt(value => value + 1)}>Check again</button>
      </section> : null}
      {roomId && state.kind === "ready" ? <section className="mt-8 rounded-xl border border-cyan-300/30 bg-cyan-300/5 p-5">
        <h2 className="text-xl font-medium">{state.room.title}</h2>
        <p className="mt-2 text-sm text-slate-300">{self?.role === "owner" ? "Owner" : "Member"} {self?.presence === "present" ? "present on domain" : "connection not current"}</p>
        <p className="mt-3 text-xs text-slate-400">Room ID: {state.room.room_id}</p>
        {self?.role === "participant" && state.room.status !== "closed" && <div className="mt-4">
          {!leaveConfirm ? <button type="button" className="rounded border border-white/30 px-4 py-2"
            onClick={() => setLeaveConfirm(true)}>Leave room</button>
            : <div className="rounded border border-amber-300/40 p-4">
              <p>Leave {state.room.title}? You will lose this membership's room access and room-scoped friend updates. Rejoining requires a fresh owner invite.</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" disabled={leaveBusy} className="rounded border border-amber-300/60 px-4 py-2"
                  onClick={() => void leaveRoom()}>Confirm leave room</button>
                <button type="button" disabled={leaveBusy} className="rounded border border-white/30 px-4 py-2"
                  onClick={() => setLeaveConfirm(false)}>Stay in room</button>
              </div>
            </div>}
          {leaveError && <p role="alert" className="mt-2 text-amber-200">Leaving was not confirmed. Check your signed-in account and current membership before retrying.</p>}
        </div>}
        {self?.role === "owner" && state.room.status !== "closed" && <div className="mt-4">
          <button type="button" disabled={inviteBusy}
            className="rounded border border-cyan-300/60 px-4 py-2"
            onClick={() => void createInvitation()}>Create one-time invite</button>
          {inviteError && <p role="alert" className="mt-2 text-amber-200">Could not create an invite for this room. Check that you are signed in as its owner.</p>}
          {invitation && <div className="mt-2">
            <label className="block text-sm" htmlFor="service-room-invitation">Service invitation</label>
            <input id="service-room-invitation" readOnly autoComplete="off" value={invitation.code}
              className="w-full rounded border border-white/30 bg-slate-900 p-2 font-mono text-sm" />
            <p className="mt-2 text-sm">Share the room ID and this code privately with your friend. They enter both under Hosted service rooms in CasimirBot. Expires {new Date(invitation.expires).toLocaleString()}.</p>
          </div>}
        </div>}
        <p className="mt-4 text-sm">Leave this tab open, then return to CasimirBot to refresh the room task selection.</p>
      </section> : null}
    </div>
  </main>;
}
