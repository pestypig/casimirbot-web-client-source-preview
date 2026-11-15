import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { DESKTOP_AUTH0_ROOM_CONNECTION_STATUS_PATH, DESKTOP_AUTH0_ROOM_CONTROL_PATH } from "@shared/desktop-auth0-account-link";
import { helixSharedLiveRoomIdSchema } from "@shared/contracts/helix-shared-live-room-agent.v1";
import { HostedRoomMissionControls } from "@/components/helix/ask-console/shared-live-room/HostedRoomConsoleMission";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, readCachedAccountProfileIdentity } from "@/lib/workstation/accountCapabilityPolicy";

const connectionSchema = z.object({
  schema: z.literal("casimir_desktop_room_connection_status/1"),
  ready: z.literal(true), authority: z.string().min(1), profile_ref: z.string().min(1),
  expires_at: z.string().datetime(),
});
const inspectionSchema = z.object({
  schema: z.literal("helix.shared_live_room.inspect_receipt.v1"),
  ok: z.literal(true),
  room: z.object({
    room_id: helixSharedLiveRoomIdSchema,
    title: z.string(),
    status: z.string(),
    self_participant_id: z.string(),
    participants: z.array(z.object({
      participant_id: z.string(), display_name: z.string(), role: z.string(), presence: z.string().optional(),
    })),
  }),
});

export function FriendHostedRoomMission() {
  const [roomId, setRoomId] = useState("");
  const [mission, setMission] = useState<{
    room: z.infer<typeof inspectionSchema>["room"];
    authority: string;
    expiresAt: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    const clear = () => {
      pending.current?.abort();
      pending.current = null;
      setMission(null);
      setBusy(false);
      setError("");
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    return () => {
      pending.current?.abort();
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    };
  }, []);

  useEffect(() => {
    if (!mission) return;
    const timeout = setTimeout(() => {
      setMission(null);
      setError("The hosted room connection expired. Refresh room authorization and reopen the mission.");
    }, Math.min(2_147_483_647, Math.max(0, mission.expiresAt - Date.now())));
    return () => clearTimeout(timeout);
  }, [mission]);

  const openMission = async () => {
    const id = helixSharedLiveRoomIdSchema.safeParse(roomId.trim());
    if (!id.success || pending.current) return;
    const controller = new AbortController();
    const identity = readCachedAccountProfileIdentity();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    setBusy(true);
    setMission(null);
    setError("");
    try {
      const options = { credentials: "same-origin" as const, cache: "no-store" as const, signal: controller.signal };
      const status = await fetch(DESKTOP_AUTH0_ROOM_CONNECTION_STATUS_PATH, options);
      if (!status.ok) throw new Error("connection_unavailable");
      const { authority, profile_ref, expires_at } = connectionSchema.parse(await status.json());
      const expiresAt = Date.parse(expires_at);
      if (profile_ref !== identity.profileId || expiresAt <= Date.now())
        throw new Error("connection_unavailable");
      const response = await fetch(DESKTOP_AUTH0_ROOM_CONTROL_PATH, {
        ...options, method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "inspect", room_id: id.data }),
      });
      if (!response.ok) throw new Error("room_unavailable");
      const { room } = inspectionSchema.parse(await response.json());
      const self = room.participants.find(person => person.participant_id === room.self_participant_id && person.presence !== "left");
      if (room.room_id !== id.data || room.status === "closed" || !self || expiresAt <= Date.now())
        throw new Error("room_unavailable");
      const current = readCachedAccountProfileIdentity();
      if (!controller.signal.aborted && current.profileId === identity.profileId && current.revision === identity.revision)
        setMission({ room, authority, expiresAt });
    } catch {
      if (pending.current === controller) setError("Authorize Hosted service rooms and confirm this account has joined the exact room, then try again.");
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  };

  return <section className="mt-3 rounded border border-white/15 p-3" aria-label="Hosted room mission from Friend Chat">
    <label className="block">
      Hosted room ID
      <input value={roomId} disabled={busy} onChange={event => {
        setRoomId(event.target.value);
        setMission(null);
        setError("");
      }} className="ml-2 bg-slate-800 p-2" />
    </label>
    <button type="button" disabled={busy || !helixSharedLiveRoomIdSchema.safeParse(roomId.trim()).success}
      onClick={() => void openMission()} className="mt-2 text-cyan-200">Open room mission</button>
    {error && <p role="alert">{error}</p>}
    {mission && <>
      <p className="mt-2 font-medium">{mission.room.title}</p>
      <p className="mt-2 text-sm text-slate-300">
        Room presence at last check: you are {mission.room.participants.find(person => person.participant_id === mission.room.self_participant_id)?.presence ?? "unknown"};
        {" "}the owner is {mission.room.participants.find(person => person.role === "owner")?.presence ?? "unknown"}.
      </p>
      <p className="mt-1 text-sm text-slate-400">
        Shared reports require you and the owner to be present. In Hosted service rooms, choose this room and
        {" "}Open selected room in browser. Sign in with the same account, click Open selected room there, and keep
        {" "}that page open. Then reopen this mission and load shared reports. Room presence does not enable audio, AI, or game actions.
      </p>
      <HostedRoomMissionControls room={mission.room} authority={mission.authority} />
    </>}
  </section>;
}
