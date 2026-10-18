import React, { useCallback, useState } from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import type { RoomMissionOwnerSelection } from "@shared/helix-room-mission-owner";
import { SharedLiveRoomMissionPanel } from "./SharedLiveRoomMissionPanel";
import { SharedLiveRoomOwnerResultsPanel } from "./SharedLiveRoomOwnerResultsPanel";
import { ReviewedRoomInstructionPanel } from "./ReviewedRoomInstructionPanel";

export function SharedLiveRoomOwnerWorkflow({ room, onProcessed, onOpenTaskPairing, roomMessages = [] }: {
  room: HelixSharedRealtimeRoom;
  onProcessed(): Promise<unknown>;
  onOpenTaskPairing?: () => void;
  roomMessages?: Array<{ message_id: string; room_id: string; author_participant_id: string; text: string }>;
}) {
  const [missionKey, setMissionKey] = useState("none");
  const missionChanged = useCallback((mission: RoomMissionOwnerSelection | null) => {
    setMissionKey(mission
      ? JSON.stringify([mission.mission_id, mission.mission_revision, mission.status])
      : "none");
  }, []);
  return <>
    <ReviewedRoomInstructionPanel room={room} />
    <SharedLiveRoomMissionPanel room={room} onMissionChanged={missionChanged}
      onOpenTaskPairing={onOpenTaskPairing} roomMessages={roomMessages} />
    {/* A changed selection discards old report/disclosure state and aborts its
        pending read. The results panel must fetch its own authorized catalog. */}
    <SharedLiveRoomOwnerResultsPanel key={`${room.room_id}:${missionKey}`}
      room={room} onProcessed={onProcessed} />
  </>;
}
