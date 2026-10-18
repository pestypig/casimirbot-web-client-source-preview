import React, { useEffect, useRef, useState } from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

type Preparation = {
  schema: "helix.shared_room_interpreter_preparation.v1";
  interpreter_session_id: string;
  room_id: string;
  generation: number;
  state: "configuration_pending" | "configured" | "removed";
  provider: "openai_agents_api";
  credential_source: "unconfigured" | "host_native_profile";
  expected_payer: "host_openai_project_if_configured" | "host_openai_project";
  usage_ceiling_turns: 0 | 1 | 2;
  evaluation_profile?: "ar2_two_turn_text";
  shared_ai_active: false;
  model_input: false;
  provider_calls: 0;
  task_handoff: false;
};

const pathFor = (roomId: string) => `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}/interpreter-session`;

function parseResponse(value: unknown, roomId: string): Preparation | null {
  if (!value || typeof value !== "object") throw Error("invalid_interpreter_response");
  const response = value as Record<string, unknown>;
  if (response.schema !== "helix.shared_room_interpreter_preparation_response.v1" ||
      response.room_id !== roomId || response.shared_ai_active !== false ||
      response.model_input !== false || response.provider_calls !== 0) throw Error("invalid_interpreter_response");
  if (response.session === null) return null;
  if (!response.session || typeof response.session !== "object") throw Error("invalid_interpreter_response");
  const session = response.session as Preparation;
  if (session.schema !== "helix.shared_room_interpreter_preparation.v1" ||
      session.room_id !== roomId || !/^room_interpreter:[0-9a-f-]{36}$/i.test(session.interpreter_session_id) ||
      !Number.isSafeInteger(session.generation) || session.generation < 1 ||
      !["configuration_pending", "configured", "removed"].includes(session.state) || session.provider !== "openai_agents_api" ||
      !((session.credential_source === "host_native_profile" &&
        session.expected_payer === "host_openai_project" &&
        (session.usage_ceiling_turns === 1 && session.evaluation_profile === undefined ||
          session.usage_ceiling_turns === 2 && session.evaluation_profile === "ar2_two_turn_text") &&
        session.state !== "configuration_pending") ||
        (session.credential_source === "unconfigured" &&
        session.expected_payer === "host_openai_project_if_configured" && session.usage_ceiling_turns === 0 &&
        session.state !== "configured")) || session.shared_ai_active !== false ||
      session.model_input !== false || session.provider_calls !== 0 || session.task_handoff !== false) {
    throw Error("invalid_interpreter_response");
  }
  return session;
}

export function SharedRoomInterpreterPreparationPanel({ room, isOwner }: {
  room: HelixSharedRealtimeRoom; isOwner: boolean;
}) {
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [accountEpoch, setAccountEpoch] = useState(0);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const epoch = ++generation.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setVisible(false); setPreparation(null); setBusy(false); setMessage("");
    void fetch(pathFor(room.room_id), { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (response.status === 403 || response.status === 404) return undefined;
        if (!response.ok) throw Error("interpreter_unavailable");
        return parseResponse(await response.json(), room.room_id);
      })
      .then(session => { if (session !== undefined && generation.current === epoch && !controller.signal.aborted) {
        setPreparation(session); setVisible(true);
      } })
      .catch(() => { if (generation.current === epoch && !controller.signal.aborted) setMessage("Shared AI setup could not be checked."); });
    const onAccountChange = () => { generation.current += 1; request.current?.abort(); setAccountEpoch(current => current + 1); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onAccountChange);
    return () => { generation.current += 1; controller.abort(); request.current?.abort();
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onAccountChange); };
  }, [room.room_id, room.self_participant_id, room.status, accountEpoch]);

  const change = async (remove: boolean) => {
    if (busy || !isOwner || room.status === "closed" || (remove && !preparation)) return;
    const epoch = generation.current;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(pathFor(room.room_id), { method: remove ? "DELETE" : "POST",
        credentials: "include", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remove ? { interpreter_session_id: preparation!.interpreter_session_id,
          generation: preparation!.generation } : {}) });
      if (!response.ok) throw Error("interpreter_outcome_unknown");
      const next = parseResponse(await response.json(), room.room_id);
      if (!next || next.state !== (remove ? "removed" : "configuration_pending") ||
          (remove && (next.interpreter_session_id !== preparation!.interpreter_session_id ||
            next.generation !== preparation!.generation))) throw Error("interpreter_response_mismatch");
      if (generation.current !== epoch) return;
      setPreparation(remove ? null : next);
      setMessage(remove ? "Shared AI preparation removed. No model session was active." :
        "Shared AI preparation recorded. A credential and permissioned interpreter are still required; no model is active.");
    } catch {
      if (generation.current === epoch && !controller.signal.aborted)
        setMessage("Setup outcome could not be confirmed. Refresh this room before another change.");
    } finally { if (generation.current === epoch) setBusy(false); }
  };

  const configure = async () => {
    const selected = preparation;
    const bridge = window.casimirDesktop?.liveConnection;
    if (busy || !isOwner || !bridge || room.status === "closed" ||
        selected?.state !== "configuration_pending") return;
    const epoch = generation.current;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage("");
    try {
      const result = await bridge({ action: "room_interpreter_configure", room_id: room.room_id,
        interpreter_session_id: selected.interpreter_session_id, generation: selected.generation });
      if (generation.current !== epoch) return;
      if (!result.ok || result.code !== "room_interpreter_configured") {
        setMessage(result.code === "missing_key" ?
          "Save your OpenAI API key in Helix Ask Connections before configuring this room." :
          "Configuration was not confirmed. Refresh the room before trying again.");
        return;
      }
      const response = await fetch(pathFor(room.room_id), { credentials: "include", cache: "no-store",
        signal: controller.signal });
      if (!response.ok) throw Error("configuration_read_failed");
      const next = parseResponse(await response.json(), room.room_id);
      if (!next || next.state !== "configured" || next.generation !== selected.generation + 1 ||
          next.interpreter_session_id === selected.interpreter_session_id) throw Error("configuration_mismatch");
      if (generation.current !== epoch || controller.signal.aborted) return;
      setPreparation(next);
      setMessage("Host key selected for the new generation. Every author must approve text again. No AI call was made.");
    } catch {
      if (generation.current === epoch && !controller.signal.aborted)
        setMessage("Configuration outcome could not be confirmed. Refresh the room before trying again.");
    } finally { if (generation.current === epoch) setBusy(false); }
  };

  if (!visible) return message ? <p role="status" className="text-xs text-amber-100">{message}</p> : null;
  return <section aria-label="Shared AI preparation" className="rounded-xl border border-fuchsia-300/20 bg-fuchsia-400/[0.04] p-3 text-xs">
    <h4 className="font-semibold text-fuchsia-100">Shared AI · developer setup</h4>
    <p className="mt-1 text-slate-300">Status: {preparation?.state === "configured" ? "host key configured; AI inactive" :
      preparation ? "configuration pending" : "not prepared"} · OpenAI Agents API · {preparation?.state === "configured" ?
      preparation?.usage_ceiling_turns === 2 ? "host profile key; two-turn developer evaluation" :
        "host profile key; one-turn ceiling" : "credential unconfigured · zero model turns"}.</p>
    <p className="mt-1 text-slate-400">{preparation?.state === "configured" ?
      "The host's OpenAI project is the expected payer. The current key will be rechecked before any later turn. Each author must approve text for this generation. No provider turn or room AI is active yet." :
      "Preparing a room identity does not send text to AI, start a model, share a key or select a Codex task. If configured later, the host's OpenAI project is the expected payer."}</p>
    {preparation ? <p className="mt-1 font-mono text-slate-500">Generation {preparation.generation}</p> : null}
    {isOwner ? <button type="button" disabled={busy || room.status === "closed"}
      onClick={() => void change(Boolean(preparation))}
      className="mt-2 rounded border border-fuchsia-300/30 px-3 py-1.5 text-fuchsia-100 disabled:opacity-40">
      {preparation?.state === "configured" ? "Remove room AI setup" :
        preparation ? "Remove preparation" : "Prepare room AI evaluation"}
    </button> : <p className="mt-2 text-slate-400">Only the host can change this preparation.</p>}
    {isOwner && preparation?.state === "configuration_pending" && window.casimirDesktop?.liveConnection ?
      <button type="button" disabled={busy || room.status === "closed"} onClick={() => void configure()}
        className="ml-2 mt-2 rounded border border-fuchsia-300/30 px-3 py-1.5 text-fuchsia-100 disabled:opacity-40">
        Use my configured API key for room AI evaluation
      </button> : null}
    {message ? <p role="status" className="mt-2 text-amber-100">{message}</p> : null}
  </section>;
}
