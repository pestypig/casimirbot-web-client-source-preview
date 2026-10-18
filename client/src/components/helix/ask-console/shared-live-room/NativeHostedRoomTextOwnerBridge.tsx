import React, { useEffect, type ReactNode } from "react";
import { useNativeHostedRoomTextConversation,
  type NativeHostedRoomTextConversationOwner } from "./NativeHostedRoomTextConversation";
import type { RoomTextDraftStore } from "./RoomTextDraftStore";

export type HostedRoomConsoleProjection = {
  room_id: string;
  title: string;
  status: string;
  capacity_profile?: "two_person_voice" | "three_human_text";
  self_participant_id?: string;
  participants: Array<{ participant_id: string; display_name: string; role?: string }>;
};

export type HostedRoomTextOwnerSnapshot = {
  room: HostedRoomConsoleProjection;
  authority: string;
  conversation: NativeHostedRoomTextConversationOwner;
};

/** A hosted channel is usable only with the selected room's admitted member. */
export function isHostedRoomTextOwnerAdmitted(
  snapshot: HostedRoomTextOwnerSnapshot | null,
): snapshot is HostedRoomTextOwnerSnapshot {
  return Boolean(snapshot?.conversation.admitted && snapshot.room.status !== "closed" &&
    snapshot.room.self_participant_id && snapshot.room.participants.some(person =>
      person.participant_id === snapshot.room.self_participant_id));
}

/** The hosted text owner remains mounted while the Rooms dialog is closed. */
export function NativeHostedRoomTextOwnerBridge({ room, authority, draftStore, onChange, children }: {
  room: HostedRoomConsoleProjection;
  authority: string;
  draftStore?: RoomTextDraftStore;
  onChange?: (snapshot: HostedRoomTextOwnerSnapshot | null) => void;
  children: (conversation: NativeHostedRoomTextConversationOwner) => ReactNode;
}) {
  const conversation = useNativeHostedRoomTextConversation({
    roomId: room.room_id, authority, selfParticipantId: room.self_participant_id!,
    closed: room.status === "closed", draftStore,
  });
  useEffect(() => {
    onChange?.({ room, authority, conversation });
  }, [onChange, room, authority, conversation.messages, conversation.draft,
    conversation.admitted, conversation.sending, conversation.error]);
  useEffect(() => () => onChange?.(null), [onChange]);
  return <>{children(conversation)}</>;
}
