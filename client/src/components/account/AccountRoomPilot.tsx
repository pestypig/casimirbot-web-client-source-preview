import { useCallback, useEffect, useState } from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";

type RoomResponse = {
  schema?: string;
  ok?: boolean;
  message?: string;
  rooms?: HelixSharedRealtimeRoom[];
  room?: HelixSharedRealtimeRoom | null;
};

// The public site has a separate bundle boundary from the installed workstation.
const requestRoom = async (path: string, body?: Record<string, unknown>, keepalive = false): Promise<RoomResponse> => {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    keepalive,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null) as RoomResponse | null;
  if (!response.ok || payload?.schema !== "helix.shared_realtime_room.response.v1" || payload.ok !== true) {
    throw new Error(payload?.message || "The room service is unavailable.");
  }
  return payload;
};

const roomPath = (roomId: string, suffix = "") =>
  `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}${suffix}`;
const listRooms = async () => (await requestRoom("/api/agi/realtime/rooms")).rooms ?? [];
const requireRoom = (response: RoomResponse): HelixSharedRealtimeRoom => {
  if (!response.room) throw new Error("The room service returned no room.");
  return response.room;
};
const createDomainRoom = async (title: string) => requireRoom(await requestRoom(
  "/api/agi/realtime/rooms", { title, capacity_profile: "two_person_voice" }));
const setPresence = async (roomId: string, presence: "present" | "away", keepalive = false) =>
  requireRoom(await requestRoom(roomPath(roomId, "/presence"), { presence }, keepalive));
const closeDomainRoom = async (roomId: string) =>
  requestRoom(roomPath(roomId, "/leave"), {});

const ownerIsPresent = (room: HelixSharedRealtimeRoom): boolean =>
  room.participants.some((participant) =>
    participant.participant_id === room.self_participant_id &&
    participant.role === "owner" && participant.presence === "present");

const errorText = (error: unknown): string => error instanceof Error
  ? error.message.slice(0, 300)
  : "The room request could not be completed.";

/** A first-party owner presence surface for the domain's private room pilot. */
export function AccountRoomPilot() {
  const [rooms, setRooms] = useState<HelixSharedRealtimeRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [title, setTitle] = useState("Discord dojo pilot");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshRooms = useCallback(async () => {
    try {
      const listed = await listRooms();
      setRooms(listed.filter((room) => room.status !== "closed" &&
        room.participants.some((participant) =>
          participant.participant_id === room.self_participant_id && participant.role === "owner")));
      setError(null);
    } catch (cause) {
      setError(errorText(cause));
    }
  }, []);

  useEffect(() => { void refreshRooms(); }, [refreshRooms]);

  useEffect(() => {
    if (!activeRoomId) return;
    let stopped = false;
    let timer: number | null = null;
    const renew = async () => {
      try {
        const room = await setPresence(activeRoomId, "present");
        if (!stopped) {
          setRooms((current) => current.map((candidate) =>
            candidate.room_id === room.room_id ? room : candidate));
          setError(null);
        }
      } catch (cause) {
        if (!stopped) setError(errorText(cause));
      } finally {
        if (!stopped) timer = window.setTimeout(() => void renew(), 15_000);
      }
    };
    const markAway = () => {
      void setPresence(activeRoomId, "away", true)
        .catch(() => undefined);
    };
    void renew();
    window.addEventListener("pagehide", markAway);
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("pagehide", markAway);
    };
  }, [activeRoomId]);

  const createRoom = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const room = await createDomainRoom(title.trim());
      setRooms((current) => [room, ...current]);
      setActiveRoomId(room.room_id);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const openRoom = async (roomId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const room = await setPresence(roomId, "present");
      setRooms((current) => current.map((candidate) =>
        candidate.room_id === room.room_id ? room : candidate));
      setActiveRoomId(roomId);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const closeRoom = async (roomId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await closeDomainRoom(roomId);
      if (activeRoomId === roomId) setActiveRoomId(null);
      setRooms((current) => current.filter((room) => room.room_id !== roomId));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 border-t border-cyan-200/20 pt-5">
      <h3 className="text-sm font-semibold text-white">Domain room for Discord pilot</h3>
      <p className="mt-2 text-sm text-slate-300">
        Create or open a room here and leave this page open while using Discord.
        This keeps your owner presence current on the domain. No microphone or AI is started.
      </p>
      {error ? <p role="alert" className="mt-3 text-sm text-amber-200">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <input aria-label="Domain room title" value={title} maxLength={100}
          onChange={(event) => setTitle(event.target.value)}
          className="min-w-0 flex-1 rounded-full border border-white/25 bg-[#071329] px-4 py-2 text-sm text-white" />
        <button type="button" disabled={busy || !title.trim()} onClick={() => void createRoom()}
          className="rounded-full border border-cyan-200/40 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50">
          Create domain room
        </button>
        <button type="button" disabled={busy} onClick={() => void refreshRooms()}
          className="rounded-full border border-white/25 px-4 py-2 text-sm text-slate-200 disabled:opacity-50">
          Refresh rooms
        </button>
      </div>
      {rooms.length ? <ul className="mt-4 space-y-3">
        {rooms.map((room) => <li key={room.room_id}
          className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm">
          <p className="font-medium text-white">{room.title}</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-300">{room.room_id}</p>
          <p className="mt-1 text-xs text-cyan-100">{activeRoomId === room.room_id && ownerIsPresent(room)
            ? "Owner present on domain" : "Open this room to renew owner presence"}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy || activeRoomId === room.room_id}
              onClick={() => void openRoom(room.room_id)}
              className="rounded-full border border-cyan-200/40 px-3 py-1 text-cyan-100 disabled:opacity-50">
              Open room
            </button>
            <button type="button" disabled={busy} onClick={() => void closeRoom(room.room_id)}
              className="rounded-full border border-white/25 px-3 py-1 text-slate-200 disabled:opacity-50">
              Close room
            </button>
          </div>
        </li>)}
      </ul> : <p className="mt-4 text-sm text-slate-400">No domain rooms are listed for this account.</p>}
    </div>
  );
}
