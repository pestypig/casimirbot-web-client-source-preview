import React, { useEffect, type ReactNode } from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { useSharedLiveRoomTextConversation,
  type SharedLiveRoomTextConversationOwner } from "./SharedLiveRoomTextConversation";
import type { RoomTextDraftStore } from "./RoomTextDraftStore";

export type LocalRoomTextOwnerSnapshot = {
  room: HelixSharedRealtimeRoom;
  conversation: SharedLiveRoomTextConversationOwner;
  onMissionProcessed?: () => Promise<unknown>;
};

/** Match the room-text API: an authenticated member may read/write while away; left is revoked. */
export function isLocalRoomTextOwnerAdmitted(
  snapshot: LocalRoomTextOwnerSnapshot | null,
  activeRoomId: string | null,
): snapshot is LocalRoomTextOwnerSnapshot {
  return Boolean(snapshot?.conversation.admitted && snapshot.room.status !== "closed" &&
    snapshot.room.room_id === activeRoomId && snapshot.room.self_participant_id &&
    snapshot.room.participants.some(person => person.participant_id === snapshot.room.self_participant_id &&
      person.presence !== "left"));
}

/** Keeps one admitted room-text owner mounted while its dialog is closed. */
export function LocalRoomTextOwnerBridge({ room, draftStore, onChange, onMissionProcessed, children }: {
  room: HelixSharedRealtimeRoom;
  draftStore: RoomTextDraftStore;
  onChange?: (snapshot: LocalRoomTextOwnerSnapshot | null) => void;
  onMissionProcessed?: () => Promise<unknown>;
  children: (conversation: SharedLiveRoomTextConversationOwner) => ReactNode;
}) {
  const conversation = useSharedLiveRoomTextConversation(room, draftStore);
  useEffect(() => {
    onChange?.({ room, conversation, onMissionProcessed });
  }, [onChange, onMissionProcessed, room, conversation.messages, conversation.draft, conversation.admitted,
    conversation.sending, conversation.error]);
  useEffect(() => () => onChange?.(null), [onChange]);
  return <>{children(conversation)}</>;
}
