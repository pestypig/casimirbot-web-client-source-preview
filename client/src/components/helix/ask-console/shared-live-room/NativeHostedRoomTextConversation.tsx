import React, { useEffect, useRef, useState } from "react";
import { DESKTOP_AUTH0_ROOM_CONTROL_PATH as CONTROL } from "@shared/desktop-auth0-account-link";
import { hostedRoomTextListSchema, hostedRoomTextSendSchema,
  type HostedRoomTextMessage } from "@shared/hosted-room-text";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { NativeHostedRoomTextReleaseControls } from "./NativeHostedRoomTextReleaseControls";
import { createRoomTextDraftStore, type RoomTextDraftStore } from "./RoomTextDraftStore";

type Participant = { participant_id: string; display_name: string };

/** Human room text over the selected service connection. No model or task submission. */
export function useNativeHostedRoomTextConversation({ roomId, authority, selfParticipantId, closed, draftStore }: {
  roomId: string; authority: string; selfParticipantId: string; closed: boolean; draftStore?: RoomTextDraftStore;
}) {
  const fallbackStore = useRef<RoomTextDraftStore | null>(null);
  if (!fallbackStore.current) fallbackStore.current = createRoomTextDraftStore();
  const store = draftStore ?? fallbackStore.current;
  const identity = { source: "hosted" as const, authority, roomId, participantId: selfParticipantId };
  const identityKey = JSON.stringify([identity.source, identity.authority, identity.roomId, identity.participantId]);
  const [messageState, setMessageState] = useState<{ identityKey: string; messages: HostedRoomTextMessage[] }>(() =>
    ({ identityKey, messages: [] }));
  const messages = messageState.identityKey === identityKey ? messageState.messages : [];
  const setMessages = (next: HostedRoomTextMessage[]) => setMessageState({ identityKey, messages: next });
  const [draftState, setDraftState] = useState(() => ({ identityKey, text: store.read(identity).text }));
  const draft = closed ? "" : draftState.identityKey === identityKey
    ? draftState.text : store.read(identity).text;
  const setDraft = (text: string) => setDraftState({ identityKey, text });
  const [error, setError] = useState("");
  const [admissionState, setAdmissionState] = useState(() => ({ identityKey, admitted: false }));
  const admitted = admissionState.identityKey === identityKey && admissionState.admitted;
  const setAdmitted = (value: boolean) => setAdmissionState({ identityKey, admitted: value });
  const [sending, setSending] = useState(false);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const generation = useRef(0);
  const readSequence = useRef(0);
  const pendingId = useRef<string | null>(store.read(identity).pendingMessageId);
  const pendingSend = useRef<AbortController | null>(null);
  const readAbort = useRef<AbortController | null>(null);

  const read = async (epoch: number) => {
    const sequence = ++readSequence.current;
    readAbort.current?.abort();
    const controller = new AbortController(); readAbort.current = controller;
    try {
      const response = await fetch(CONTROL, { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "text_list", room_id: roomId }), signal: controller.signal });
      if (!response.ok) {
        if (generation.current === epoch && !controller.signal.aborted &&
            [401, 403, 404, 410].includes(response.status)) {
          store.clear(identity); setDraft(""); pendingId.current = null;
        }
        throw Error("unavailable");
      }
      const receipt = hostedRoomTextListSchema.parse(await response.json());
      if (receipt.room.room_id !== roomId || receipt.messages.some((message: HostedRoomTextMessage) => message.room_id !== roomId))
        throw Error("wrong_room");
      if (generation.current === epoch && readSequence.current === sequence && !controller.signal.aborted) {
        setMessages(receipt.messages); setAdmitted(true);
        setError((current: string) => current === "Room messages could not be loaded." ? "" : current);
      }
    } catch {
      if (generation.current === epoch && readSequence.current === sequence && !controller.signal.aborted) {
        setMessages([]); setAdmitted(false); setError("Room messages could not be loaded.");
      }
    }
  };

  useEffect(() => {
    const epoch = ++generation.current;
    if (closed) store.clear(identity);
    const retained = store.read(identity);
    setMessages([]); setDraft(retained.text); setError(""); setAdmitted(false); setSending(false);
    pendingId.current = retained.pendingMessageId;
    void read(epoch);
    const timer = window.setInterval(() => void read(epoch), 5000);
    const accountChanged = () => { store.clearAll(); generation.current += 1; readAbort.current?.abort();
      pendingSend.current?.abort(); setMessages([]); setDraft(""); setAdmitted(false);
      setAccountEpoch((value: number) => value + 1); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
    return () => { generation.current += 1; readAbort.current?.abort(); pendingSend.current?.abort();
      window.clearInterval(timer); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged); };
  }, [roomId, authority, selfParticipantId, closed, accountEpoch, store]);

  const send = async (textOverride?: string): Promise<boolean> => {
    const text = (textOverride ?? draft).trim();
    if (!text || text.length > 2000 || !admitted || sending || closed) return false;
    const epoch = generation.current;
    const clientMessageId = pendingId.current ?? `room-text:${crypto.randomUUID()}`;
    pendingId.current = clientMessageId;
    store.write(identity, { text: draft, pendingMessageId: clientMessageId });
    const controller = new AbortController(); pendingSend.current = controller;
    setSending(true); setError("");
    try {
      const response = await fetch(CONTROL, { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "text_send", room_id: roomId,
          request: { client_message_id: clientMessageId, text } }), signal: controller.signal });
      if (!response.ok) throw Error("unconfirmed");
      const receipt = hostedRoomTextSendSchema.parse(await response.json());
      if (receipt.room.room_id !== roomId || receipt.message.room_id !== roomId ||
          receipt.message.author_participant_id !== selfParticipantId || receipt.message.text !== text)
        throw Error("unconfirmed");
      if (generation.current !== epoch || controller.signal.aborted) return false;
      pendingId.current = null; store.clear(identity); setDraft("");
      await read(epoch);
      return true;
    } catch {
      if (generation.current === epoch && !controller.signal.aborted)
        setError("Send could not be confirmed. Retry the same text to reuse its request identity.");
      return false;
    } finally { if (pendingSend.current === controller) pendingSend.current = null;
      if (generation.current === epoch) setSending(false); }
  };
  const updateDraft = (text: string) => { setDraft(text); pendingId.current = null;
    store.write(identity, { text, pendingMessageId: null }); };
  return { messages, draft, admitted, sending, error, send, updateDraft };
}

export type NativeHostedRoomTextConversationOwner = ReturnType<typeof useNativeHostedRoomTextConversation>;

function NativeHostedRoomTextConversationView({ roomId, authority, selfParticipantId, participants, closed,
  enableAiAccess, isOwner, conversation, onOpenInConsole }: {
  roomId: string; authority: string; selfParticipantId: string; participants: Participant[]; closed: boolean;
  enableAiAccess: boolean; isOwner: boolean; conversation: NativeHostedRoomTextConversationOwner;
  onOpenInConsole?: () => void;
}) {
  const { messages, draft, admitted, sending, error, send, updateDraft } = conversation;

  return <section aria-label="Hosted room text conversation" className="mt-3 rounded border border-cyan-300/20 p-3 text-xs">
    <p className="font-semibold text-cyan-100">Room text · {authority}</p>
    <p className="mt-1 break-all text-slate-300">Room: {roomId}</p>
    <p className="mt-1 text-slate-400">For this room's members. Text here does not call AI or queue a task instruction.</p>
    <div aria-label="Hosted room text history" className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded border border-white/10 p-2">
      {messages.length ? messages.map((message: HostedRoomTextMessage) => <p key={message.message_id} className="whitespace-pre-wrap text-slate-200">
        <span className="font-semibold">{participants.find((p: Participant) => p.participant_id === message.author_participant_id)?.display_name ?? "Former member"}: </span>{message.text}
      </p>) : <p className="text-slate-500">No room text yet.</p>}
    </div>
    {admitted && enableAiAccess && !onOpenInConsole ? <NativeHostedRoomTextReleaseControls roomId={roomId} authority={authority}
      selfParticipantId={selfParticipantId} messages={messages} closed={closed} /> : null}
    {onOpenInConsole ? <button type="button" disabled={!admitted || closed}
      className="mt-2 text-cyan-100 underline disabled:opacity-40"
      onClick={onOpenInConsole}>Write in Console</button> : <><label className="mt-2 block text-slate-300">Message to room members
      <textarea value={draft} maxLength={2000} disabled={!admitted || sending || closed}
        onChange={event => updateDraft(event.target.value)}
        className="mt-1 w-full rounded border border-white/15 bg-slate-950 p-2 text-slate-100" rows={2} />
    </label>
    <button type="button" disabled={!admitted || sending || closed || !draft.trim()}
      onClick={() => void send()} className="mt-2 rounded border border-cyan-300/30 px-2 py-1 disabled:opacity-40">Send to room</button></>}
    {error ? <p role="status" className="mt-2 text-amber-100">{error}</p> : null}
  </section>;
}

function StandaloneNativeHostedRoomTextConversation(props: {
  roomId: string; authority: string; selfParticipantId: string; participants: Participant[]; closed: boolean;
  enableAiAccess: boolean; isOwner: boolean; draftStore?: RoomTextDraftStore;
}) {
  const conversation = useNativeHostedRoomTextConversation(props);
  return <NativeHostedRoomTextConversationView {...props} conversation={conversation} />;
}

export function NativeHostedRoomTextConversation({ roomId, authority, selfParticipantId, participants, closed,
  enableAiAccess = false, isOwner = false, draftStore, conversation, onOpenInConsole }: {
  roomId: string; authority: string; selfParticipantId: string; participants: Participant[]; closed: boolean;
  enableAiAccess?: boolean; isOwner?: boolean; draftStore?: RoomTextDraftStore;
  conversation?: NativeHostedRoomTextConversationOwner;
  onOpenInConsole?: () => void;
}) {
  const props = { roomId, authority, selfParticipantId, participants, closed, enableAiAccess, isOwner, onOpenInConsole };
  return conversation
    ? <NativeHostedRoomTextConversationView {...props} conversation={conversation} />
    : <StandaloneNativeHostedRoomTextConversation {...props} draftStore={draftStore} />;
}
