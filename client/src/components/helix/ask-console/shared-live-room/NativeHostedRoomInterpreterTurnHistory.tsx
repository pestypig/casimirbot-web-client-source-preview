import React, { useEffect, useRef, useState } from "react";
import { DESKTOP_AUTH0_ROOM_CONTROL_PATH as CONTROL } from "@shared/desktop-auth0-account-link";
import { hostedRoomInterpreterTurnListSchema } from "@shared/hosted-room-interpreter-turn-status";
import { hostedRoomInterpreterEvaluationListReceiptSchema } from
  "@shared/hosted-room-interpreter-evaluation";
import { hostedRoomInterpreterContextPreviewSchema } from
  "@shared/hosted-room-interpreter-context-preview";
import type { HostedRoomTextMessage } from "@shared/hosted-room-text";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { HelixConsoleMessage } from "../HelixConsoleMessage";

type Turn = ReturnType<typeof hostedRoomInterpreterTurnListSchema.parse>["turns"][number];
type EvaluationTurn = ReturnType<typeof hostedRoomInterpreterEvaluationListReceiptSchema.parse>["turns"][number];
type ConversationTurn = Turn | EvaluationTurn;
type Preview = ReturnType<typeof hostedRoomInterpreterContextPreviewSchema.parse>;

type TimelineEntry = { kind: "member"; at: string; id: string; message: HostedRoomTextMessage } |
  { kind: "ai"; at: string; id: string; turn: ConversationTurn };

/** Only a server-recorded finish time may position a reply among member text. */
export function buildHostedRoomConversationTimeline(messages: HostedRoomTextMessage[], turns: ConversationTurn[]): TimelineEntry[] {
  return [
    ...messages.map(message => ({ kind: "member" as const, at: message.created_at,
      id: message.message_id, message })),
    ...turns.filter(turn => turn.state === "completed" && turn.reply && turn.finished_at)
      .map(turn => ({ kind: "ai" as const, at: turn.finished_at!, id: turn.request_id, turn })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
}

/** Hosted room dialogue only. Replies never inherit mission or program-action authority. */
export function NativeHostedRoomInterpreterTurnHistory({ roomId, authority, closed, isOwner = false,
  messages = [], participants = [], showMemberMessages = true }: {
  roomId: string; authority: string; closed: boolean; isOwner?: boolean;
  showMemberMessages?: boolean;
  messages?: HostedRoomTextMessage[];
  participants?: Array<{ participant_id: string; display_name: string }>;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [evaluationTurns, setEvaluationTurns] = useState<EvaluationTurn[]>([]);
  const [evaluationHistoryUnverified, setEvaluationHistoryUnverified] = useState(false);
  const [admitted, setAdmitted] = useState(false);
  const [error, setError] = useState("");
  const [canaryEnabled, setCanaryEnabled] = useState(false);
  const [evaluationEnabled, setEvaluationEnabled] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const epoch = useRef(0);
  const sequence = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const stopRequested = useRef<string | null>(null);

  useEffect(() => {
    const current = ++epoch.current;
    setTurns([]); setEvaluationTurns([]); setEvaluationHistoryUnverified(false);
    setAdmitted(false); setError(""); setCanaryEnabled(false); setEvaluationEnabled(false);
    setRunning(null); setStopping(false); setRunMessage("");
    setPreview(null); setPreviewBusy(false); stopRequested.current = null;
    if (isOwner && window.casimirDesktop?.liveConnection)
      void window.casimirDesktop.liveConnection({ action: "inspect" }).then(result => {
        if (epoch.current === current && result.ok) {
          setCanaryEnabled(result.roomHostedInterpreterCanaryEnabled === true);
          setEvaluationEnabled(result.roomHostedInterpreterEvaluationEnabled === true);
        }
      }).catch(() => undefined);
    const read = async () => {
      const readSequence = ++sequence.current;
      pending.current?.abort();
      const controller = new AbortController(); pending.current = controller;
      try {
        const response = await fetch(CONTROL, { method: "POST", credentials: "same-origin",
          cache: "no-store", signal: controller.signal,
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ operation: "interpreter_turn_list", room_id: roomId }) });
        if (!response.ok) throw Error("unavailable");
        const receipt = hostedRoomInterpreterTurnListSchema.parse(await response.json());
        if (receipt.room.room_id !== roomId || receipt.turns.some(turn => turn.room_id !== roomId))
          throw Error("wrong_room");
        let evaluation: EvaluationTurn[] = [];
        let evaluationUnverified = false;
        try {
          const evaluationResponse = await fetch(CONTROL, { method: "POST", credentials: "same-origin",
            cache: "no-store", signal: controller.signal,
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "interpreter_evaluation_list", room_id: roomId }) });
          if (evaluationResponse.ok) {
            const evaluationReceipt = hostedRoomInterpreterEvaluationListReceiptSchema.parse(
              await evaluationResponse.json());
            if (evaluationReceipt.room.room_id !== roomId ||
                evaluationReceipt.turns.some(turn => turn.room_id !== roomId)) throw Error("wrong_room");
            evaluation = evaluationReceipt.turns;
          } else evaluationUnverified = true;
        } catch {
          // A failed AR-2 read must not hide established v1 history, but cannot be called complete.
          evaluationUnverified = true;
        }
        if (epoch.current === current && sequence.current === readSequence && !controller.signal.aborted) {
          setTurns(receipt.turns); setEvaluationTurns(evaluation);
          setPreview(currentPreview => currentPreview &&
            [...receipt.turns, ...evaluation].some(turn => turn.request_id === currentPreview.turn.request_id &&
              turn.state === "queued" && turn.generation === currentPreview.turn.generation)
            ? currentPreview : null);
          setEvaluationHistoryUnverified(evaluationUnverified);
          setAdmitted(true); setError("");
        }
      } catch {
        if (epoch.current === current && sequence.current === readSequence && !controller.signal.aborted) {
          setTurns([]); setEvaluationTurns([]); setEvaluationHistoryUnverified(true);
          setAdmitted(false);
          setError("Room AI status could not be verified.");
        }
      }
    };
    void read();
    const timer = closed ? null : window.setInterval(() => void read(), 5000);
    const accountChanged = () => { epoch.current += 1; pending.current?.abort();
      setAccountEpoch(value => value + 1); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
    return () => { epoch.current += 1; pending.current?.abort();
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged); };
  }, [roomId, authority, closed, isOwner, accountEpoch]);

  const review = async (turn: ConversationTurn) => {
    if (!isOwner || closed || previewBusy || running || turn.state !== "queued") return;
    const current = epoch.current;
    const controller = new AbortController();
    setPreview(null); setPreviewBusy(true); setRunMessage("");
    try {
      const response = await fetch(CONTROL, { method: "POST", credentials: "same-origin",
        cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "interpreter_context_preview", room_id: roomId,
          request: { request_id: turn.request_id } }) });
      if (!response.ok) throw Error("preview_unavailable");
      const result = hostedRoomInterpreterContextPreviewSchema.parse(await response.json());
      if (result.room.room_id !== roomId || result.turn.request_id !== turn.request_id ||
          result.turn.interpreter_session_id !== turn.interpreter_session_id ||
          result.turn.generation !== turn.generation ||
          result.turn.trigger_message_id !== turn.trigger_message_id ||
          result.turn.turn_ordinal !== ("turn_ordinal" in turn ? turn.turn_ordinal : null))
        throw Error("preview_mismatch");
      if (current === epoch.current) setPreview(result);
    } catch {
      if (current === epoch.current) setRunMessage("The released room context could not be verified. Refresh and review before running AI.");
    } finally { if (current === epoch.current) setPreviewBusy(false); }
  };

  const run = async (turn: ConversationTurn) => {
    const bridge = window.casimirDesktop?.liveConnection;
    const evaluation = "turn_ordinal" in turn;
    if (!isOwner || !(evaluation ? evaluationEnabled : canaryEnabled) || !bridge ||
        running || closed || turn.state !== "queued" ||
        preview?.room.room_id !== roomId ||
        preview?.turn.request_id !== turn.request_id ||
        preview?.turn.interpreter_session_id !== turn.interpreter_session_id ||
        preview?.turn.generation !== turn.generation ||
        preview?.turn.trigger_message_id !== turn.trigger_message_id ||
        preview?.turn.turn_ordinal !== ("turn_ordinal" in turn ? turn.turn_ordinal : null) ||
        !messages.some(message => message.room_id === roomId &&
          message.message_id === turn.trigger_message_id)) return;
    const current = epoch.current;
    stopRequested.current = null;
    setPreview(null);
    setRunning(turn.request_id); setRunMessage("");
    try {
      const result = await bridge({ action: evaluation
        ? "room_hosted_interpreter_evaluation_run" : "room_hosted_interpreter_run", room_id: roomId,
        interpreter_session_id: turn.interpreter_session_id, generation: turn.generation,
        request_id: turn.request_id, ...(evaluation ? { turn_ordinal: turn.turn_ordinal } : {}) });
      if (current !== epoch.current) return;
      setRunMessage(stopRequested.current === turn.request_id
        ? "Stop requested. Refresh this turn: a provider outcome may still be uncertain."
        : result.ok && (result.code === "room_hosted_interpreter_completed" ||
          result.code === "room_hosted_interpreter_evaluation_completed")
        ? !evaluation
          ? "Shared AI reply recorded. Check the turn below."
          : result.roomMcpSavedItemConfirmed === true
            ? "Shared AI reply recorded. The exact room-status MCP item was confirmed in the provider's saved turn. Check the turn below."
          : result.roomMcpStatusCallObserved === true
            ? "Shared AI reply recorded. The provider stream confirmed the room-status MCP call. Check the turn below."
            : "Shared AI reply recorded. Room MCP use is unconfirmed; check the turn below."
        : result.code === "missing_key" ? "Save your OpenAI API key in Helix Ask Connections first."
          : result.code === "room_hosted_interpreter_not_enabled"
            ? "The attended shared-AI canary is not enabled on this device. Your request remains queued without model input."
          : result.code === "room_hosted_interpreter_evaluation_not_ready"
            ? "The original lease and provider session are unavailable on this device. The correction cannot be sent; refresh the room."
          : result.providerRequestMayHaveBeenSent === true
            ? "A provider request may have been sent and could incur an API charge. Refresh this exact turn before any further action."
          : "The turn outcome is unconfirmed. Refresh its status before any further action.");
    } catch {
      if (current === epoch.current && stopRequested.current !== turn.request_id)
        setRunMessage("The turn outcome is unconfirmed. Refresh its status before any further action.");
    } finally { if (current === epoch.current) setRunning(null); }
  };

  const stop = async (requestId: string) => {
    const bridge = window.casimirDesktop?.liveConnection;
    if (!isOwner || !bridge || stopping ||
        !(running === requestId || visibleTurns.some(turn => turn.room_id === roomId &&
          turn.request_id === requestId && turn.state === "claimed"))) return;
    const current = epoch.current;
    setStopping(true);
    try {
      const result = await bridge({ action: "room_hosted_interpreter_stop",
        room_id: roomId, request_id: requestId });
      if (current !== epoch.current) return;
      if (result.ok && result.code === "room_hosted_interpreter_stop_requested") {
        stopRequested.current = requestId;
        setRunMessage("Stop requested. Refresh this turn: a provider outcome may still be uncertain.");
      } else if (result.code === "room_hosted_interpreter_not_running") {
        setRunMessage("No active run for this turn was found on this device. Refresh its status; a stop was not confirmed.");
      } else {
        setRunMessage("Stop was not confirmed. Refresh the turn status before any further action.");
      }
    } catch {
      if (current === epoch.current)
        setRunMessage("Stop was not confirmed. Refresh the turn status before any further action.");
    } finally { if (current === epoch.current) setStopping(false); }
  };

  const evaluationIds = new Set(evaluationTurns.map(turn => turn.request_id));
  const visibleTurns: ConversationTurn[] = [...turns.filter(turn => !evaluationIds.has(turn.request_id)),
    ...evaluationTurns];
  const timeline = buildHostedRoomConversationTimeline(showMemberMessages ? messages : [], admitted ? visibleTurns : []);
  const pendingOrUnplaced = visibleTurns.filter(turn => turn.state !== "completed" || !turn.finished_at);
  return <section aria-label="Hosted room AI turn history"
    className="mt-3 rounded border border-fuchsia-300/20 bg-fuchsia-400/[0.04] p-2">
    <details className="text-xs">
      <summary className="cursor-pointer font-semibold text-fuchsia-100">Shared AI · developer evaluation details</summary>
      <p className="mt-1 break-all text-slate-300">Room: {roomId}</p>
      <p className="mt-1 text-slate-300">Provider: OpenAI Agents API · Key: host's private profile · Payer: host's OpenAI project. The host explicitly starts each bounded turn; API charges may apply.</p>
      <p className="mt-1 text-slate-400">Separate from Ask Helix and Message Codex. A reply is shared with the room; it is not a task decision or program action.</p>
    </details>
    <div role="log" aria-label="Hosted room conversation history" className="mt-3 space-y-2">
      {timeline.length ? timeline.map(entry => {
        if (entry.kind === "member") return <HelixConsoleMessage key={entry.id}
          kind="person" text={entry.message.text} author={participants.find(person =>
            person.participant_id === entry.message.author_participant_id)?.display_name ?? "Former member"} />;
        const trigger = messages.find(message => message.room_id === roomId &&
          message.message_id === entry.turn.trigger_message_id);
        const speaker = trigger && participants.find(person =>
          person.participant_id === trigger.author_participant_id)?.display_name;
        return <HelixConsoleMessage key={entry.id} kind="agent"
          author={"turn_ordinal" in entry.turn && entry.turn.turn_ordinal === 2
            ? "Shared AI correction" : "Shared AI reply"}
          text={entry.turn.reply?.text ?? ""} context={trigger
            ? <p className="whitespace-pre-wrap">In response to {speaker ?? "Room member"}: {trigger.text}</p>
            : <p className="text-amber-100">The requesting message is unavailable in this room view. Refresh room messages to verify the reply's context.</p>} />;
      }) : <p className="text-slate-500">No room AI replies yet.</p>}
    </div>
    {!admitted && error ? <p role="status" className="mt-2 text-amber-100">{error}</p> : null}
    {admitted && evaluationHistoryUnverified ? <p role="status" className="mt-2 text-amber-100">
      Two-turn evaluation history could not be verified. Refresh before relying on this room's AI history.
    </p> : null}
    {runMessage ? <p role="status" className="mt-2 text-amber-100">{runMessage}</p> : null}
    {admitted && pendingOrUnplaced.length ? <ol className="mt-2 space-y-2">{pendingOrUnplaced.map(turn => {
      const trigger = messages.find(message => message.room_id === roomId &&
        message.message_id === turn.trigger_message_id);
      const speaker = trigger && participants.find(person =>
        person.participant_id === trigger.author_participant_id)?.display_name;
      return <li key={turn.request_id} className="rounded border border-white/10 p-2">
      {turn.state === "completed" && turn.reply ? <>
        <p className="font-semibold text-fuchsia-100">Shared AI reply · order unavailable</p>
        <HelixConsoleMessage kind="agent" author={"turn_ordinal" in turn && turn.turn_ordinal === 2
          ? "Shared AI correction" : "Shared AI reply"} text={turn.reply.text} />
      </> : <p className="text-slate-300">{turn.state === "queued" ? "AI turn queued; no provider result confirmed." :
        turn.state === "claimed" ? "AI turn claimed; provider outcome unconfirmed." :
        turn.state === "cancelled" ? "AI turn cancelled before pickup." :
        `AI turn failed: ${turn.failure_code ?? "outcome unconfirmed"}.`}</p>}
      {trigger ? <p className="mt-2 whitespace-pre-wrap text-slate-200">
        {turn.state === "completed" ? "In response to" : "Requested from"} {speaker ?? "Room member"}: {trigger.text}
      </p> : null}
      {turn.state === "completed" && !trigger ? <p className="mt-2 text-amber-100">
        The requesting message is unavailable in this room view. Refresh room messages to verify the reply's context.
      </p> : null}
      {isOwner && turn.state === "queued" && !trigger ? <p className="mt-2 text-amber-100">
        The requesting message is not in this room view. Refresh room messages before running AI.
      </p> : null}
      {isOwner && turn.state === "queued" && trigger && "turn_ordinal" in turn && !evaluationEnabled ?
        <p className="mt-2 text-slate-400">Two-turn evaluation is queued. The attended host runner is not enabled on this device.</p> : null}
      {isOwner && turn.state === "queued" && trigger && !("turn_ordinal" in turn) && !canaryEnabled ? <p className="mt-2 text-slate-400">
        Attended shared-AI evaluation is not enabled on this device. The request remains queued without model input.
      </p> : null}
      {isOwner && turn.state === "queued" && trigger && !closed ? <button type="button"
        disabled={previewBusy || running !== null || stopping}
        onClick={() => void review(turn)} className="mt-2 rounded border border-fuchsia-300/30 px-2 py-1 disabled:opacity-40">
        {previewBusy ? "Checking released context…" : "Review released room context"}
      </button> : null}
      {preview?.room.room_id === roomId && preview.turn.request_id === turn.request_id ? <div role="region" aria-label="Released room AI context"
        className="mt-2 rounded border border-fuchsia-300/30 p-2">
        <p className="font-semibold text-fuchsia-100">{preview.turn.messages.length} released member messages · generation {preview.turn.generation}</p>
        <p className="mt-1 text-slate-400">This was current when checked. The host claim and preflight recheck every release before a provider call.</p>
        <ol className="mt-2 max-h-64 space-y-2 overflow-y-auto">{preview.turn.messages.map(message => <li
          key={message.message_id} className="rounded border border-white/10 p-2">
          <p className="font-semibold">{participants.find(person => person.participant_id ===
            message.author_participant_id)?.display_name ?? "Former member"} · consent revision {message.consent_revision}</p>
          <p className="whitespace-pre-wrap">{message.text}</p>
        </li>)}</ol>
      </div> : null}
      {isOwner && turn.state === "queued" && trigger && !("turn_ordinal" in turn) && canaryEnabled &&
        preview?.room.room_id === roomId && preview.turn.request_id === turn.request_id && !closed && window.casimirDesktop?.liveConnection ?
        <button type="button" disabled={running !== null || stopping}
          onClick={() => void run(turn)} className="mt-2 rounded border border-fuchsia-300/30 px-2 py-1 disabled:opacity-40">
          Run one shared AI turn with my OpenAI API key (API charges may apply)
        </button> : null}
      {isOwner && turn.state === "queued" && trigger && "turn_ordinal" in turn && evaluationEnabled &&
        preview?.room.room_id === roomId && preview.turn.request_id === turn.request_id && !closed && window.casimirDesktop?.liveConnection ?
        <button type="button" disabled={running !== null || stopping}
          onClick={() => void run(turn)} className="mt-2 rounded border border-fuchsia-300/30 px-2 py-1 disabled:opacity-40">
          Run {turn.turn_ordinal === 1 ? "first reply" : "correction"} with my OpenAI API key (API charges may apply)
        </button> : null}
      {isOwner && (running === turn.request_id || turn.state === "claimed") &&
        window.casimirDesktop?.liveConnection ?
        <button type="button" disabled={stopping}
          onClick={() => void stop(turn.request_id)} className="ml-2 mt-2 rounded border border-amber-300/30 px-2 py-1 text-amber-100 disabled:opacity-40">
          {stopping ? "Requesting stop…" : running === turn.request_id
            ? "Stop this AI turn" : "Request stop on this device"}
        </button> : null}
    </li>})}</ol> : admitted && !turns.length ? <p className="mt-2 text-slate-500">No room AI turns recorded.</p> : null}
  </section>;
}
