import React, { useEffect, useRef, useState } from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

type TurnStatus = {
  schema: "helix.room_interpreter_turn_status.v1";
  request_id: string; room_id: string; trigger_message_id: string;
  state: "queued" | "claimed" | "cancelled" | "completed" | "failed";
  reply: null | { content_role: "room_interpreter_reply"; text: string;
    result_sha256: string };
  failure_code: string | null; mission_authority: false; program_action: false;
};

const parseTurns = (value: unknown, roomId: string): TurnStatus[] => {
  if (!value || typeof value !== "object") throw Error("invalid_room_ai_status");
  const envelope = value as Record<string, unknown>;
  if (envelope.schema !== "helix.room_interpreter_turn_statuses.v1" ||
      envelope.room_id !== roomId || !Array.isArray(envelope.turns) || envelope.turns.length > 20)
    throw Error("invalid_room_ai_status");
  return envelope.turns.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw Error("invalid_room_ai_turn");
    const turn = raw as TurnStatus;
    if (turn.schema !== "helix.room_interpreter_turn_status.v1" || turn.room_id !== roomId ||
        !/^room_interpreter_turn:[0-9a-f-]{36}$/iu.test(turn.request_id) ||
        !/^room_message:[0-9a-f-]{36}$/iu.test(turn.trigger_message_id) ||
        !["queued", "claimed", "cancelled", "completed", "failed"].includes(turn.state) ||
        turn.mission_authority !== false || turn.program_action !== false ||
        (turn.state === "completed"
          ? !turn.reply || turn.reply.content_role !== "room_interpreter_reply" ||
            typeof turn.reply.text !== "string" || !turn.reply.text.trim() ||
            !/^[a-f0-9]{64}$/iu.test(turn.reply.result_sha256)
          : turn.reply !== null)) throw Error("invalid_room_ai_turn");
    return turn;
  });
};

export function SharedRoomInterpreterTurnHistory({ room }: { room: HelixSharedRealtimeRoom }) {
  const [turns, setTurns] = useState<TurnStatus[]>([]);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [accountEpoch, setAccountEpoch] = useState(0);
  const epoch = useRef(0);
  useEffect(() => {
    const current = ++epoch.current;
    const controller = new AbortController();
    setTurns([]); setVisible(false); setError("");
    const refresh = async () => {
      if (room.status === "closed") return;
      try {
        const response = await fetch(`/api/agi/realtime/rooms/${encodeURIComponent(room.room_id)}/interpreter-turn-requests`, {
          credentials: "include", cache: "no-store", signal: controller.signal });
        if (response.status === 403 || response.status === 404) {
          if (epoch.current === current && !controller.signal.aborted) { setTurns([]); setVisible(false); }
          return;
        }
        if (!response.ok) throw Error("room_ai_status_unavailable");
        const next = parseTurns(await response.json(), room.room_id);
        if (epoch.current === current && !controller.signal.aborted) {
          setTurns(next); setVisible(true); setError("");
        }
      } catch {
        if (epoch.current === current && !controller.signal.aborted) {
          setTurns([]); setVisible(false); setError("Room AI status could not be verified.");
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    const onAccountChange = () => { epoch.current += 1; controller.abort(); setAccountEpoch(value => value + 1); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onAccountChange);
    return () => { epoch.current += 1; controller.abort(); window.clearInterval(timer);
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onAccountChange); };
  }, [room.room_id, room.self_participant_id, room.status, accountEpoch]);

  if (!visible) return error ? <p role="status" className="text-xs text-amber-100">{error}</p> : null;
  return <section aria-label="Room AI turn history" className="rounded-xl border border-fuchsia-300/20 bg-fuchsia-400/[0.04] p-3 text-xs">
    <h4 className="font-semibold text-fuchsia-100">Room AI · developer evaluation</h4>
    <p className="mt-1 text-slate-400">Separate from Ask Helix and Message Codex. An AI reply is Party Chat text, not a task decision or program action.</p>
    {turns.length ? <ol className="mt-2 space-y-2">{turns.map(turn => <li key={turn.request_id}
      className="rounded border border-white/10 p-2">
      {turn.state === "completed" && turn.reply ? <>
        <p className="font-semibold text-fuchsia-100">Shared AI reply</p>
        <p className="mt-1 whitespace-pre-wrap text-slate-100">{turn.reply.text}</p>
      </> : <p className="text-slate-300">{turn.state === "queued" ? "AI turn queued; no provider result confirmed." :
        turn.state === "claimed" ? "AI turn claimed; provider outcome unconfirmed." :
        turn.state === "cancelled" ? "AI turn cancelled before pickup." :
        `AI turn failed: ${turn.failure_code ?? "outcome unconfirmed"}.`}</p>}
    </li>)}</ol> : <p className="mt-2 text-slate-500">No room AI turns recorded.</p>}
  </section>;
}
