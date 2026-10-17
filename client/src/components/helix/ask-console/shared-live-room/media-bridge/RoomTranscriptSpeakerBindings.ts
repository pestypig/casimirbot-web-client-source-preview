export type SharedLiveRoomTranscriptSpeakerBinding = {
  participant_id: string;
  display_name: string;
};

export type SharedLiveRoomTranscriptSpeakerBindings = {
  bind(itemId: string, speaker: SharedLiveRoomTranscriptSpeakerBinding): void;
  consume(itemId: string | null): SharedLiveRoomTranscriptSpeakerBinding | null;
  clear(): void;
};

export const createSharedLiveRoomTranscriptSpeakerBindings = (
  retainedItemLimit = 64,
): SharedLiveRoomTranscriptSpeakerBindings => {
  const bindings = new Map<string, SharedLiveRoomTranscriptSpeakerBinding>();
  const itemOrder: string[] = [];
  const limit = Math.max(1, Math.trunc(retainedItemLimit));

  return {
    bind(itemId, speaker) {
      if (!itemId || !speaker.participant_id) return;
      if (!bindings.has(itemId)) itemOrder.push(itemId);
      bindings.set(itemId, speaker);
      while (itemOrder.length > limit) {
        const oldestItemId = itemOrder.shift();
        if (oldestItemId) bindings.delete(oldestItemId);
      }
    },
    consume(itemId) {
      if (!itemId) return null;
      const speaker = bindings.get(itemId) ?? null;
      bindings.delete(itemId);
      const index = itemOrder.indexOf(itemId);
      if (index >= 0) itemOrder.splice(index, 1);
      return speaker;
    },
    clear() {
      bindings.clear();
      itemOrder.length = 0;
    },
  };
};
