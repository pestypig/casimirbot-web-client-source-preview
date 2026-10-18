import React, { useEffect, useRef, useState } from "react";
import { DESKTOP_AUTH0_ROOM_CONTROL_PATH as CONTROL } from "@shared/desktop-auth0-account-link";
import { hostedRoomInterpreterStatusSchema,
  type HostedRoomInterpreterStatus } from "@shared/room-interpreter-hosted-status";
import { hostedRoomTextReleaseListSchema, hostedRoomTextReleaseChangeSchema,
  type HostedRoomTextRelease } from "@shared/hosted-room-text-release";
import type { HostedRoomTextMessage } from "@shared/hosted-room-text";
import { hostedRoomInterpreterTurnQueuedSchema } from "@shared/hosted-room-interpreter-turn-request";
import { hostedRoomInterpreterEvaluationListReceiptSchema,
  hostedRoomInterpreterEvaluationQueuedReceiptSchema } from
  "@shared/hosted-room-interpreter-evaluation";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

/** Each author governs their own exact room messages. A release is permission
 * for a later turn, never a provider call or a mission instruction. */
export function NativeHostedRoomTextReleaseControls({ roomId, authority, selfParticipantId,
  messages, closed }: { roomId: string; authority: string; selfParticipantId: string;
  messages: HostedRoomTextMessage[]; closed: boolean }) {
  const [status, setStatus] = useState<HostedRoomInterpreterStatus | null>(null);
  const [releases, setReleases] = useState<HostedRoomTextRelease[]>([]);
  const [evaluationTurns, setEvaluationTurns] = useState<ReturnType<
    typeof hostedRoomInterpreterEvaluationListReceiptSchema.parse>["turns"]>([]);
  const [error, setError] = useState("");
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
  const [requestedTurns, setRequestedTurns] = useState<string[]>([]);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const epoch = useRef(0);
  const readAbort = useRef<AbortController | null>(null);
  const changeAbort = useRef<AbortController | null>(null);

  const read = async () => {
    const current = ++epoch.current;
    readAbort.current?.abort();
    const controller = new AbortController(); readAbort.current = controller;
    setStatus(null); setReleases([]); setEvaluationTurns([]); setError("");
    try {
      const post = (operation: string) => fetch(CONTROL, { method: "POST",
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ operation, room_id: roomId }) });
      const statusResponse = await post("interpreter_status");
      if (!statusResponse.ok) throw Error("status_unavailable");
      const nextStatus = hostedRoomInterpreterStatusSchema.parse(await statusResponse.json());
      if (nextStatus.room.room_id !== roomId) throw Error("wrong_room");
      const listResponse = await post("text_release_list");
      if (!listResponse.ok) throw Error("releases_unavailable");
      const list = hostedRoomTextReleaseListSchema.parse(await listResponse.json());
      if (list.room.room_id !== roomId || list.releases.some(release =>
          release.room_id !== roomId || release.author_participant_id !== selfParticipantId))
        throw Error("wrong_author");
      let nextEvaluationTurns: typeof evaluationTurns = [];
      if (nextStatus.session?.evaluation_profile === "ar2_two_turn_text") {
        const evaluationResponse = await post("interpreter_evaluation_list");
        if (!evaluationResponse.ok) throw Error("evaluation_unavailable");
        const evaluation = hostedRoomInterpreterEvaluationListReceiptSchema.parse(
          await evaluationResponse.json());
        if (evaluation.room.room_id !== roomId) throw Error("wrong_room");
        nextEvaluationTurns = evaluation.turns;
      }
      if (current === epoch.current && !controller.signal.aborted) {
        setStatus(nextStatus); setReleases(list.releases); setEvaluationTurns(nextEvaluationTurns);
      }
    } catch {
      if (current === epoch.current && !controller.signal.aborted)
        setError("Your room AI access could not be verified. Refresh before changing it.");
    }
  };

  useEffect(() => {
    void read();
    const accountChanged = () => { epoch.current += 1; readAbort.current?.abort();
      changeAbort.current?.abort(); setStatus(null); setReleases([]);
      setEvaluationTurns([]); setBusyMessageId(null); setRequestedTurns([]);
      setAccountEpoch(value => value + 1); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
    return () => { epoch.current += 1; readAbort.current?.abort(); changeAbort.current?.abort();
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged); };
  }, [roomId, authority, selfParticipantId, accountEpoch]);

  const change = async (messageId: string, action: "release" | "revoke") => {
    const session = status?.session;
    if (!session || session.state !== "configured" || closed || busyMessageId ||
        !messages.some(message => message.message_id === messageId &&
          message.author_participant_id === selfParticipantId)) return;
    const current = epoch.current;
    const controller = new AbortController(); changeAbort.current = controller;
    setBusyMessageId(messageId); setError("");
    try {
      const response = await fetch(CONTROL, { method: "POST", credentials: "same-origin",
        cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "text_release_change", room_id: roomId,
          request: { message_id: messageId, interpreter_session_id: session.interpreter_session_id,
            generation: session.generation, action } }) });
      if (!response.ok) throw Error("change_unconfirmed");
      const receipt = hostedRoomTextReleaseChangeSchema.parse(await response.json());
      if (receipt.room.room_id !== roomId || receipt.release.room_id !== roomId ||
          receipt.release.message_id !== messageId ||
          receipt.release.author_participant_id !== selfParticipantId ||
          receipt.release.interpreter_session_id !== session.interpreter_session_id ||
          receipt.release.interpreter_generation !== session.generation ||
          receipt.release.state !== (action === "release" ? "released" : "revoked"))
        throw Error("change_mismatch");
      if (current === epoch.current && !controller.signal.aborted)
        setReleases(previous => [receipt.release, ...previous.filter(release =>
          !(release.message_id === messageId &&
            release.interpreter_session_id === session.interpreter_session_id))]);
    } catch {
      if (current === epoch.current && !controller.signal.aborted)
        setError("The change was not confirmed. Refresh your AI access before retrying.");
    } finally { if (changeAbort.current === controller) changeAbort.current = null;
      if (current === epoch.current) setBusyMessageId(null); }
  };

  const requestTurn = async (messageId: string) => {
    const session = status?.session;
    const first = evaluationTurns.find(turn => turn.turn_ordinal === 1);
    const correction = evaluationTurns.find(turn => turn.turn_ordinal === 2);
    const evaluation = session?.evaluation_profile === "ar2_two_turn_text";
    if (evaluation && (correction || (first && (first.state !== "completed" ||
        first.trigger_message_id === messageId)))) return;
    if (!session || session.state !== "configured" || closed || busyMessageId ||
        !releases.some(release => release.message_id === messageId && release.state === "released" &&
          release.interpreter_session_id === session.interpreter_session_id &&
          release.interpreter_generation === session.generation)) return;
    const turnKey = `${session.interpreter_session_id}:${session.generation}:${messageId}`;
    if (requestedTurns.includes(turnKey)) return;
    const current = epoch.current;
    const controller = new AbortController(); changeAbort.current = controller;
    setBusyMessageId(messageId); setError("");
    try {
      // One stable request per exact message. An uncertain retry cannot create a second turn.
      const clientRequestId = `room-ai-turn:${messageId.split(":")[1]}`;
      const response = await fetch(CONTROL, { method: "POST", credentials: "same-origin",
        cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ operation: evaluation
          ? "interpreter_evaluation_request" : "interpreter_turn_request", room_id: roomId,
          request: { interpreter_session_id: session.interpreter_session_id,
            generation: session.generation, trigger_message_id: messageId,
            client_request_id: clientRequestId,
            ...(evaluation ? { turn_ordinal: first ? 2 : 1,
              ...(first ? { first_request_id: first.request_id } : {}) } : {}) } }) });
      if (!response.ok) throw Error("request_unconfirmed");
      const receipt = (evaluation ? hostedRoomInterpreterEvaluationQueuedReceiptSchema
        : hostedRoomInterpreterTurnQueuedSchema).parse(await response.json());
      if (receipt.room.room_id !== roomId || receipt.turn.room_id !== roomId ||
          receipt.turn.trigger_message_id !== messageId ||
          receipt.turn.interpreter_session_id !== session.interpreter_session_id ||
          receipt.turn.generation !== session.generation) throw Error("request_mismatch");
      if (current === epoch.current && !controller.signal.aborted)
        setRequestedTurns(previous => previous.includes(turnKey) ? previous : [...previous, turnKey]);
    } catch {
      if (current === epoch.current && !controller.signal.aborted)
        setError("AI turn request was not confirmed. Refresh the room before trying this message again.");
    } finally { if (changeAbort.current === controller) changeAbort.current = null;
      if (current === epoch.current) setBusyMessageId(null); }
  };

  const session = status?.session;
  const requestedTurnKey = (messageId: string) => session
    ? `${session.interpreter_session_id}:${session.generation}:${messageId}` : "";
  const ownMessages = messages.filter(message => message.author_participant_id === selfParticipantId);
  return <section aria-label="My room AI message access" className="mt-3 rounded border border-fuchsia-300/20 p-2">
    <p className="font-semibold text-fuchsia-100">My messages · AI access</p>
    <p className="mt-1 text-slate-400">Room text stays human-only unless you allow an exact message for a later AI turn. Allowing it does not call the model or steer the mission.</p>
    <p className="mt-1 break-all text-slate-300">Room: {roomId}</p>
    {session?.state === "configured" ? <p className="mt-1 text-slate-300">
      Shared AI: inactive · Provider: OpenAI Agents API · Key: host&apos;s private profile ·
      Payer: host&apos;s OpenAI project · Limit: {session.usage_ceiling_turns} {session.usage_ceiling_turns === 1
        ? "turn" : "turns"} for this generation.
    </p> : null}
    {session?.state === "configured" ? <p className="mt-1 text-slate-400">
      Your request queues a turn for the host to start; it does not spend API funds by itself.
      The turn may include up to ten current room messages that their authors separately allowed.
      A reply stays in this room conversation and does not instruct the mission task.
    </p> : null}
    {session?.state === "configured" ? <p className="mt-1 text-amber-100/80">
      Withdrawing access stops future use of that message. It cannot undo text already sent to OpenAI
      or a reply already seen by room members.
    </p> : null}
    <button type="button" onClick={() => void read()} className="mt-2 rounded border border-fuchsia-300/30 px-2 py-1">
      Refresh my AI access
    </button>
    {error ? <p role="status" className="mt-2 text-amber-100">{error}</p> : null}
    {!error && status && session?.state !== "configured" ?
      <p className="mt-2 text-slate-400">The host has not selected a key for this room generation.</p> : null}
    {!error && session?.state === "configured" ? <div className="mt-2 space-y-2">
      {ownMessages.length ? ownMessages.map(message => {
        const release = releases.find(item => item.message_id === message.message_id &&
          item.interpreter_session_id === session.interpreter_session_id);
        return <div key={message.message_id} className="rounded border border-white/10 p-2">
          <p className="max-h-20 overflow-y-auto whitespace-pre-wrap text-slate-300">{message.text}</p>
          {release?.state === "revoked" ? <p className="mt-1 text-slate-400">Future AI access withdrawn for this generation. Earlier provider use or room replies remain.</p>
            : <button type="button" disabled={closed || Boolean(busyMessageId)}
                onClick={() => void change(message.message_id, release ? "revoke" : "release")}
                className="mt-1 rounded border border-fuchsia-300/30 px-2 py-1 disabled:opacity-40">
                {release ? "Withdraw AI access" : "Allow AI to read this message"}
              </button>}
          {release?.state === "released" && (session.evaluation_profile !== "ar2_two_turn_text" ||
            (!evaluationTurns.some(turn => turn.turn_ordinal === 2) &&
              (!evaluationTurns.some(turn => turn.turn_ordinal === 1) ||
                evaluationTurns.some(turn => turn.turn_ordinal === 1 &&
                  turn.state === "completed" && turn.trigger_message_id !== message.message_id)))) ? <button type="button"
            disabled={closed || Boolean(busyMessageId) || requestedTurns.includes(requestedTurnKey(message.message_id))}
            onClick={() => void requestTurn(message.message_id)}
            className="ml-2 mt-1 rounded border border-fuchsia-300/30 px-2 py-1 disabled:opacity-40">
            {requestedTurns.includes(requestedTurnKey(message.message_id)) ? "AI answer requested"
              : session.evaluation_profile === "ar2_two_turn_text"
                ? evaluationTurns.some(turn => turn.turn_ordinal === 1)
                  ? "Ask host to run one correction" : "Ask host for a first AI reply"
                : "Ask host to run one AI turn"}
          </button> : null}
        </div>;
      }) : <p className="text-slate-400">You have no messages to allow.</p>}
    </div> : null}
  </section>;
}
