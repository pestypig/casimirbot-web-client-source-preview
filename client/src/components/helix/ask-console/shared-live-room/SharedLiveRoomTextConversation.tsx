import React, { useEffect, useRef, useState } from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { SharedRoomTextReleaseControls } from "./SharedRoomTextReleaseControls";
import { SharedRoomMissionTextChoices } from "./SharedRoomMissionTextChoices";
import { createRoomTextDraftStore, type RoomTextDraftStore } from "./RoomTextDraftStore";

type RoomTextMessage = {
  message_id: string;
  room_id: string;
  author_participant_id: string;
  text: string;
  created_at: string;
  content_role: "room_member_text";
};

const pathFor = (roomId: string) => `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/text-messages`;
const parseMessages = (value: unknown, roomId: string): RoomTextMessage[] => {
  if (!value || typeof value !== "object") throw new Error("invalid_room_text_response");
  const record = value as Record<string, unknown>;
  if (record.schema !== "helix.shared_realtime_room.text_messages.v1" || record.room_id !== roomId ||
      record.model_input !== false || record.task_handoff !== false || !Array.isArray(record.messages)) {
    throw new Error("invalid_room_text_response");
  }
  return record.messages.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("invalid_room_text_message");
    const message = item as RoomTextMessage;
    if (message.room_id !== roomId || message.content_role !== "room_member_text" ||
        typeof message.message_id !== "string" || typeof message.author_participant_id !== "string" ||
        typeof message.text !== "string" || typeof message.created_at !== "string") {
      throw new Error("invalid_room_text_message");
    }
    return message;
  });
};

export function useSharedLiveRoomTextConversation(room: HelixSharedRealtimeRoom, draftStore?: RoomTextDraftStore) {
  const fallbackStore = useRef<RoomTextDraftStore | null>(null);
  if (!fallbackStore.current) fallbackStore.current = createRoomTextDraftStore();
  const store = draftStore ?? fallbackStore.current;
  const identity = { source: "local" as const, authority: "", roomId: room.room_id,
    participantId: room.self_participant_id };
  const identityKey = JSON.stringify([identity.source, identity.authority, identity.roomId, identity.participantId]);
  const [messageState, setMessageState] = useState<{ identityKey: string; messages: RoomTextMessage[] }>(() =>
    ({ identityKey, messages: [] }));
  const messages = messageState.identityKey === identityKey ? messageState.messages : [];
  const setMessages = (next: RoomTextMessage[]) => setMessageState({ identityKey, messages: next });
  const [draftState, setDraftState] = useState(() => ({ identityKey, text: store.read(identity).text }));
  const draft = room.status === "closed" ? "" : draftState.identityKey === identityKey
    ? draftState.text : store.read(identity).text;
  const setDraft = (text: string) => setDraftState({ identityKey, text });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [admissionState, setAdmissionState] = useState(() => ({ identityKey, admitted: false }));
  const admitted = admissionState.identityKey === identityKey && admissionState.admitted;
  const setAdmitted = (value: boolean) => setAdmissionState({ identityKey, admitted: value });
  const [accountEpoch, setAccountEpoch] = useState(0);
  const generation = useRef(0);
  const readSequence = useRef(0);
  const pendingMessageId = useRef<string | null>(store.read(identity).pendingMessageId);
  const pendingSend = useRef<AbortController | null>(null);

  useEffect(() => {
    const epoch = ++generation.current;
    readSequence.current += 1;
    const controller = new AbortController();
    if (room.status === "closed") store.clear(identity);
    const retained = store.read(identity);
    setMessages([]); setDraft(retained.text); setError(""); setSending(false); setAdmitted(false);
    pendingMessageId.current = retained.pendingMessageId;
    const refresh = async () => {
      const sequence = ++readSequence.current;
      try {
        const response = await fetch(pathFor(room.room_id), { credentials: "include", cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          if (generation.current === epoch && !controller.signal.aborted &&
              [401, 403, 404, 410].includes(response.status)) {
            store.clear(identity); setDraft(""); pendingMessageId.current = null;
          }
          throw new Error("room_text_unavailable");
        }
        const next = parseMessages(await response.json(), room.room_id);
        if (generation.current === epoch && readSequence.current === sequence) {
          setMessages(next); setAdmitted(true);
          setError(current => current.startsWith("Room messages could not be loaded.") ? "" : current);
        }
      } catch {
        if (generation.current === epoch && readSequence.current === sequence && !controller.signal.aborted) {
          setMessages([]); setAdmitted(false);
          setError("Room messages could not be loaded. Retry or check your membership.");
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    const accountChanged = () => {
      store.clearAll();
      generation.current += 1;
      pendingSend.current?.abort();
      setMessages([]); setDraft(""); setAdmitted(false);
      setAccountEpoch(current => current + 1);
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
    return () => { generation.current += 1; controller.abort(); pendingSend.current?.abort(); window.clearInterval(timer); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged); };
  }, [room.room_id, room.self_participant_id, room.status, accountEpoch, store]);

  const send = async (textOverride?: string): Promise<boolean> => {
    const text = (textOverride ?? draft).trim();
    if (!text || text.length > 2000 || sending || !admitted || room.status === "closed") return false;
    const epoch = generation.current;
    const clientMessageId = pendingMessageId.current ?? `room-text:${crypto.randomUUID()}`;
    pendingMessageId.current = clientMessageId;
    store.write(identity, { text: draft, pendingMessageId: clientMessageId });
    const controller = new AbortController();
    pendingSend.current = controller;
    setSending(true); setError("");
    try {
      const response = await fetch(pathFor(room.room_id), { method: "POST", credentials: "include", cache: "no-store",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ client_message_id: clientMessageId, text }) });
      const value = await response.json();
      if (!response.ok || value?.schema !== "helix.shared_realtime_room.text_message.v1" ||
          value.room_id !== room.room_id || value.model_input !== false || value.task_handoff !== false ||
          value.message?.content_role !== "room_member_text" || value.message?.room_id !== room.room_id ||
          value.message?.author_participant_id !== room.self_participant_id ||
          value.message?.text !== text) throw new Error("room_text_send_unconfirmed");
      if (generation.current !== epoch) return false;
      pendingMessageId.current = null; store.clear(identity); setDraft("");
      const sequence = ++readSequence.current;
      try {
        const read = await fetch(pathFor(room.room_id), { credentials: "include", cache: "no-store", signal: controller.signal });
        if (!read.ok) throw new Error("room_text_history_unavailable");
        const next = parseMessages(await read.json(), room.room_id);
        if (generation.current === epoch && readSequence.current === sequence) setMessages(next);
      } catch {
        if (generation.current === epoch) { setMessages([]); setAdmitted(false); setError("Message sent. Room history could not be refreshed yet."); }
      }
      return true;
    } catch {
      if (generation.current === epoch) setError("Send could not be confirmed. Retry the same text to reuse its request identity.");
      return false;
    } finally { if (pendingSend.current === controller) pendingSend.current = null; if (generation.current === epoch) setSending(false); }
  };
  const updateDraft = (text: string) => {
    setDraft(text); pendingMessageId.current = null;
    store.write(identity, { text, pendingMessageId: null });
  };
  return { messages, draft, admitted, sending, error, send, updateDraft };
}

export type SharedLiveRoomTextConversationOwner = ReturnType<typeof useSharedLiveRoomTextConversation>;

function SharedLiveRoomTextConversationView({ room, conversation, onOpenInConsole }: {
  room: HelixSharedRealtimeRoom; conversation: SharedLiveRoomTextConversationOwner;
  onOpenInConsole?: () => void;
}) {
  const { messages, draft, admitted, sending, error, send, updateDraft } = conversation;
  return <section aria-label="Room text conversation" className="rounded-xl border border-cyan-300/20 bg-cyan-400/[0.04] p-3 text-xs">
    <h4 className="font-semibold text-cyan-100">Room text</h4>
    <p className="mt-1 text-slate-400">Visible to current room members. Sending text here does not call a model or queue a task instruction.</p>
    <div aria-label="Room text history" className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2">
      {messages.length ? messages.map(message => <p key={message.message_id} className="whitespace-pre-wrap text-slate-200">
        <span className="font-semibold text-cyan-100">{room.participants.find(p => p.participant_id === message.author_participant_id)?.display_name ?? "Former member"}: </span>{message.text}
      </p>) : <p className="text-slate-500">No room text yet.</p>}
    </div>
    {onOpenInConsole ? <button type="button" disabled={!admitted || room.status === "closed"}
      onClick={onOpenInConsole} className="mt-3 rounded-lg border border-cyan-300/30 px-3 py-1.5 text-cyan-100 disabled:opacity-40">
      Write in Console
    </button> : <><label className="mt-3 block text-slate-300">Message to room members
      <textarea value={draft} maxLength={2000} disabled={sending || !admitted || room.status === "closed"}
        onChange={event => updateDraft(event.target.value)}
        className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2 text-slate-100" rows={2} />
    </label>
    <button type="button" disabled={sending || !admitted || !draft.trim() || room.status === "closed"} onClick={() => void send()}
      className="mt-2 rounded-lg border border-cyan-300/30 px-3 py-1.5 text-cyan-100 disabled:opacity-40">Send to room</button></>}
    <SharedRoomTextReleaseControls room={room} messages={messages} admitted={admitted} />
    <SharedRoomMissionTextChoices room={room} messages={messages} admitted={admitted} />
    {error ? <p role="status" className="mt-2 text-amber-100">{error}</p> : null}
  </section>;
}

function StandaloneRoomTextConversation({ room, draftStore }: {
  room: HelixSharedRealtimeRoom; draftStore?: RoomTextDraftStore;
}) {
  const conversation = useSharedLiveRoomTextConversation(room, draftStore);
  return <SharedLiveRoomTextConversationView room={room} conversation={conversation} />;
}

export function SharedLiveRoomTextConversation({ room, draftStore, conversation, onOpenInConsole }: {
  room: HelixSharedRealtimeRoom; draftStore?: RoomTextDraftStore;
  conversation?: SharedLiveRoomTextConversationOwner;
  onOpenInConsole?: () => void;
}) {
  return conversation
    ? <SharedLiveRoomTextConversationView room={room} conversation={conversation} onOpenInConsole={onOpenInConsole} />
    : <StandaloneRoomTextConversation room={room} draftStore={draftStore} />;
}
