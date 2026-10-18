import React from "react";
import { readCachedAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import type { HostedRoomTextOwnerSnapshot } from "./NativeHostedRoomTextOwnerBridge";
import { NativeHostedRoomTaskPanel } from "./NativeHostedRoomTaskPanel";
import { NativeSharedRoomReportsPanel } from "./NativeSharedRoomReportsPanel";
import { NativeSharedInterpreterReportsPanel } from "./NativeSharedInterpreterReportsPanel";

/** The selected hosted room owns this view; opening setup must not mount a second mission owner. */
export function HostedRoomConsoleMission({ snapshot }: { snapshot: HostedRoomTextOwnerSnapshot }) {
  const { room, authority } = snapshot;
  const self = room.participants.find(person => person.participant_id === room.self_participant_id);
  const isOwner = self?.role === "owner";
  const developer = readCachedAccountCapabilityPolicy()?.account_type === "developer";
  const identity = `${authority}:${room.room_id}:${room.self_participant_id}`;
  return <section aria-label="Selected hosted room mission" className="space-y-3 pt-3 text-xs">
    <p className="text-slate-400">The room owner reviews a selected task and exact handoffs here. The Helix pill still sends text only to room members.</p>
    {isOwner ? <NativeHostedRoomTaskPanel key={`task:${identity}`} roomId={room.room_id}
      authority={authority} isOwner enableAiProposal={developer} />
      : <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-slate-400">
          The room owner controls task selection and handoffs. You can read only reports shared with this room.
        </p>}
    <NativeSharedRoomReportsPanel key={`reports:${identity}`} roomId={room.room_id} authority={authority} />
    {developer ? <NativeSharedInterpreterReportsPanel key={`ai-reports:${identity}`}
      roomId={room.room_id} authority={authority} /> : null}
  </section>;
}
