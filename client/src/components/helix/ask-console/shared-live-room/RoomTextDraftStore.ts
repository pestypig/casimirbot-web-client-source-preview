export type RoomTextDraftIdentity = {
  source: "local" | "hosted";
  authority: string;
  roomId: string;
  participantId: string;
};

export type RoomTextDraft = { text: string; pendingMessageId: string | null };

/** Renderer-memory continuity only. No account, room or credential data is persisted. */
export const createRoomTextDraftStore = () => {
  const drafts = new Map<string, RoomTextDraft>();
  const key = (identity: RoomTextDraftIdentity) => JSON.stringify([
    identity.source, identity.authority, identity.roomId, identity.participantId,
  ]);
  return {
    read: (identity: RoomTextDraftIdentity): RoomTextDraft => drafts.get(key(identity)) ?? { text: "", pendingMessageId: null },
    write: (identity: RoomTextDraftIdentity, draft: RoomTextDraft): void => {
      if (!draft.text) drafts.delete(key(identity));
      else drafts.set(key(identity), draft);
    },
    clear: (identity: RoomTextDraftIdentity): void => { drafts.delete(key(identity)); },
    clearAll: (): void => { drafts.clear(); },
  };
};

export type RoomTextDraftStore = ReturnType<typeof createRoomTextDraftStore>;
