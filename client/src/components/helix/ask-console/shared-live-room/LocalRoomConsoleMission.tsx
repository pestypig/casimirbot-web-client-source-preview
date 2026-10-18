import React from "react";
import type { LocalRoomTextOwnerSnapshot } from "./LocalRoomTextOwnerBridge";
import { SharedLiveRoomOwnerWorkflow } from "./SharedLiveRoomOwnerWorkflow";
import { SharedLiveRoomPublicResultsPanel } from "./SharedLiveRoomPublicResultsPanel";

/** Mission uses the selected room's existing owner path, never the room-text send path. */
export function LocalRoomConsoleMission({ snapshot }: { snapshot: LocalRoomTextOwnerSnapshot }) {
  const { room, onMissionProcessed } = snapshot;
  const self = room.participants.find(person => person.participant_id === room.self_participant_id);
  const ownerReady = self?.role === "owner" && self.presence === "present" && room.status !== "closed";
  return <section aria-label="Selected room mission" className="space-y-3 pt-3 text-xs">
    <p className="text-slate-400">Mission review is separate from room chat. The Helix pill still sends text only to room members.</p>
    <SharedLiveRoomPublicResultsPanel room={room} />
    {ownerReady && onMissionProcessed
      ? <SharedLiveRoomOwnerWorkflow key={`${room.room_id}:${self.participant_id}`}
          room={room} onProcessed={onMissionProcessed}
          roomMessages={snapshot.conversation.messages} />
      : <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-slate-400">
          The room owner reviews exact-task handoffs. Only approved shared results appear here; this view does not expose the owner's private task connection.
        </p>}
  </section>;
}
