import React from "react";
import { readCachedAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import type { HostedRoomTextOwnerSnapshot } from "./NativeHostedRoomTextOwnerBridge";
import { NativeHostedRoomTaskPanel } from "./NativeHostedRoomTaskPanel";
import { NativeSharedRoomReportsPanel } from "./NativeSharedRoomReportsPanel";
import { NativeSharedInterpreterReportsPanel } from "./NativeSharedInterpreterReportsPanel";
import { DESKTOP_AUTH0_ROOM_CONTROL_PATH } from "@shared/desktop-auth0-account-link";

/** The selected hosted room owns this view; opening setup must not mount a second mission owner. */
export function HostedRoomConsoleMission({ snapshot }: { snapshot: HostedRoomTextOwnerSnapshot }) {
  return <HostedRoomMissionControls room={snapshot.room} authority={snapshot.authority} />;
}

export function HostedRoomMissionControls({ room, authority }: Pick<HostedRoomTextOwnerSnapshot, "room" | "authority">) {
  const self = room.participants.find(person => person.participant_id === room.self_participant_id);
  const isOwner = self?.role === "owner";
  const developer = readCachedAccountCapabilityPolicy()?.account_type === "developer";
  const identity = `${authority}:${room.room_id}:${room.self_participant_id}`;
  const control = async (request: unknown): Promise<unknown> => {
    const response = await fetch(DESKTOP_AUTH0_ROOM_CONTROL_PATH, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(request), signal: AbortSignal.timeout(20000),
    });
    const value = await response.json();
    if (!response.ok) throw new Error("room_control_unavailable");
    return value;
  };
  return <section aria-label="Selected hosted room mission" className="space-y-3 pt-3 text-xs">
    <p className="text-slate-400">The room owner reviews a selected task and exact handoffs here. The Helix pill still sends text only to room members.</p>
    {isOwner ? <NativeHostedRoomTaskPanel key={`task:${identity}`} roomId={room.room_id}
      authority={authority} isOwner enableAiProposal={developer} control={control} />
      : <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-slate-400">
          The room owner controls task selection and handoffs. You can read only reports shared with this room.
        </p>}
    <NativeSharedRoomReportsPanel key={`reports:${identity}`} roomId={room.room_id} authority={authority} />
    {developer ? <NativeSharedInterpreterReportsPanel key={`ai-reports:${identity}`}
      roomId={room.room_id} authority={authority} /> : null}
  </section>;
}
