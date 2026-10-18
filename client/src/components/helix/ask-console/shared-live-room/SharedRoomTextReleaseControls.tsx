import React, { useEffect, useRef, useState } from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

type OwnMessage = { message_id: string; text: string; author_participant_id: string; room_id: string };
type Preparation = { schema: "helix.shared_room_interpreter_preparation.v1";
  interpreter_session_id: string; room_id: string; generation: number;
  state: "configuration_pending" | "configured"; provider: "openai_agents_api";
  credential_source: "unconfigured" | "host_native_profile";
  expected_payer: "host_openai_project_if_configured" | "host_openai_project"; usage_ceiling_turns: 0 | 1 | 2;
  evaluation_profile?: "ar2_two_turn_text";
  shared_ai_active: false; model_input: false; provider_calls: 0; task_handoff: false };
type Release = { message_id: string; room_id: string; author_participant_id: string;
  interpreter_session_id: string; interpreter_generation: number; state: "released" | "revoked";
  consent_revision: number; model_input: false; provider_calls: 0 };

const base = (roomId: string) => `/api/agi/realtime/rooms/${encodeURIComponent(roomId)}`;
const parsePreparation = (value: unknown, roomId: string): Preparation | null => {
  const response = value as Record<string, unknown>;
  if (!response || response.schema !== "helix.shared_room_interpreter_preparation_response.v1" ||
      response.room_id !== roomId || response.shared_ai_active !== false ||
      response.model_input !== false || response.provider_calls !== 0) throw Error("invalid_preparation");
  if (response.session === null) return null;
  const session = response.session as Preparation;
  if (!session || session.schema !== "helix.shared_room_interpreter_preparation.v1" ||
      session.room_id !== roomId || !["configuration_pending", "configured"].includes(session.state) ||
      !/^room_interpreter:[0-9a-f-]{36}$/i.test(session.interpreter_session_id) ||
      !Number.isSafeInteger(session.generation) || session.generation < 1 ||
      session.provider !== "openai_agents_api" ||
      (session.state === "configured" ?
        session.credential_source !== "host_native_profile" || session.expected_payer !== "host_openai_project" ||
          !((session.usage_ceiling_turns === 1 && session.evaluation_profile === undefined) ||
            (session.usage_ceiling_turns === 2 && session.evaluation_profile === "ar2_two_turn_text")) :
        session.credential_source !== "unconfigured" || session.expected_payer !== "host_openai_project_if_configured" ||
          session.usage_ceiling_turns !== 0) ||
      session.shared_ai_active !== false || session.model_input !== false ||
      session.provider_calls !== 0 || session.task_handoff !== false) {
    throw Error("invalid_preparation");
  }
  return session;
};
const parseRelease = (value: unknown, roomId: string, participantId: string): Release => {
  const item = value as Release;
  if (!item || item.room_id !== roomId || item.author_participant_id !== participantId ||
      !/^room_message:[0-9a-f-]{36}$/i.test(item.message_id) ||
      !/^room_interpreter:[0-9a-f-]{36}$/i.test(item.interpreter_session_id) ||
      !Number.isSafeInteger(item.interpreter_generation) || item.interpreter_generation < 1 ||
      !Number.isSafeInteger(item.consent_revision) || item.consent_revision < 1 ||
      !["released", "revoked"].includes(item.state) || item.model_input !== false || item.provider_calls !== 0) {
    throw Error("invalid_release");
  }
  return item;
};

export function SharedRoomTextReleaseControls({ room, messages, admitted }: {
  room: HelixSharedRealtimeRoom; messages: OwnMessage[]; admitted: boolean;
}) {
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [accountEpoch, setAccountEpoch] = useState(0);
  const epoch = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const sessionRef = useRef<string | null>(null);
  const mutationRevision = useRef(0);

  useEffect(() => {
    const current = ++epoch.current;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    sessionRef.current = null;
    setPreparation(null); setReleases([]); setVisible(false); setSelected(null); setBusy(false); setNotice("");
    const refresh = async () => {
      if (!admitted || room.status === "closed") return;
      const readRevision = mutationRevision.current;
      try {
        const [prepResponse, releaseResponse] = await Promise.all([
          fetch(`${base(room.room_id)}/interpreter-session`, { credentials: "include", cache: "no-store", signal: controller.signal }),
          fetch(`${base(room.room_id)}/text-releases`, { credentials: "include", cache: "no-store", signal: controller.signal }),
        ]);
        if (prepResponse.status === 403 || releaseResponse.status === 403) return;
        if (!prepResponse.ok || !releaseResponse.ok) throw Error("release_status_unavailable");
        const prep = parsePreparation(await prepResponse.json(), room.room_id);
        const raw = await releaseResponse.json() as Record<string, unknown>;
        if (raw.schema !== "helix.shared_room_text_releases.v1" || raw.room_id !== room.room_id ||
            raw.model_input !== false || raw.provider_calls !== 0 || !Array.isArray(raw.releases)) {
          throw Error("invalid_release_list");
        }
        const next = raw.releases.map(item => parseRelease(item, room.room_id, room.self_participant_id));
        if (epoch.current === current && !controller.signal.aborted &&
            mutationRevision.current === readRevision) {
          const signature = prep ? `${prep.interpreter_session_id}:${prep.generation}` : null;
          if (sessionRef.current !== signature) setSelected(null);
          sessionRef.current = signature;
          setPreparation(prep); setReleases(next); setVisible(true);
        }
      } catch {
        if (epoch.current === current && !controller.signal.aborted) {
          setPreparation(null); setReleases([]); setSelected(null); setVisible(false);
          sessionRef.current = null;
          setNotice("AI release status could not be checked. No new permission was granted.");
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    const onAccountChange = () => { epoch.current += 1; pending.current?.abort(); setAccountEpoch(value => value + 1); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onAccountChange);
    return () => { epoch.current += 1; controller.abort(); pending.current?.abort(); window.clearInterval(timer);
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onAccountChange); };
  }, [room.room_id, room.self_participant_id, room.status, admitted, accountEpoch]);

  const change = async (message: OwnMessage, action: "release" | "revoke") => {
    if (!preparation || !admitted || busy || room.status === "closed" ||
        message.room_id !== room.room_id || message.author_participant_id !== room.self_participant_id) return;
    const current = epoch.current;
    const session = preparation;
    mutationRevision.current += 1;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`${base(room.room_id)}/text-releases`, {
        method: "POST", credentials: "include", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ interpreter_session_id: session.interpreter_session_id,
          generation: session.generation, message_id: message.message_id, action }),
      });
      if (!response.ok) throw Error("release_outcome_unknown");
      const result = await response.json() as Record<string, unknown>;
      if (result.schema !== "helix.shared_room_text_release_response.v1" || result.room_id !== room.room_id ||
          result.model_input !== false || result.provider_calls !== 0) throw Error("invalid_release_response");
      const receipt = parseRelease(result.release, room.room_id, room.self_participant_id);
      if (receipt.message_id !== message.message_id || receipt.interpreter_session_id !== session.interpreter_session_id ||
          receipt.interpreter_generation !== session.generation ||
          receipt.state !== (action === "release" ? "released" : "revoked")) throw Error("release_mismatch");
      if (epoch.current !== current || controller.signal.aborted ||
          sessionRef.current !== `${session.interpreter_session_id}:${session.generation}`) return;
      mutationRevision.current += 1;
      setReleases(previous => [receipt, ...previous.filter(r => r.message_id !== receipt.message_id ||
        r.interpreter_session_id !== receipt.interpreter_session_id)]);
      setSelected(null);
      setNotice(action === "release" ? "Future-use approval recorded for this message and generation. No AI call was made." :
        "Future use revoked. Text already sent to a provider cannot be recalled; no provider call has occurred in this evaluation.");
    } catch {
      if (epoch.current === current && !controller.signal.aborted)
        setNotice("Permission outcome could not be confirmed. Refresh this room before changing it again.");
    } finally { if (epoch.current === current) setBusy(false); }
  };

  if (!visible || !preparation || !admitted || room.status === "closed")
    return notice ? <p role="status" className="mt-2 text-amber-100">{notice}</p> : null;
  const own = messages.filter(message => message.room_id === room.room_id &&
    message.author_participant_id === room.self_participant_id);
  if (!own.length) return null;
  return <section aria-label="Room AI text permissions" className="mt-3 rounded-lg border border-fuchsia-300/20 p-2">
    <h5 className="font-semibold text-fuchsia-100">Your room text · AI permissions</h5>
    <p className="mt-1 text-slate-400">{preparation.state === "configured" ?
      "Developer evaluation only. Host profile key configured; expected payer: host OpenAI project; one-turn ceiling. Room AI is not active and no provider call has been made. Only approvals for this generation can be considered later." :
      "Developer evaluation only. OpenAI Agents API; credential unconfigured; expected future payer: host OpenAI project; limit: zero model turns. No AI is active. A later funded configuration must request fresh approval."}</p>
    <ul className="mt-2 space-y-2">{own.map(message => {
      const receipt = releases.find(r => r.message_id === message.message_id &&
        r.interpreter_session_id === preparation.interpreter_session_id &&
        r.interpreter_generation === preparation.generation);
      return <li key={message.message_id} className="rounded border border-white/10 p-2">
        <p className="whitespace-pre-wrap text-slate-200">{message.text}</p>
        <p className="mt-1 text-slate-500">{receipt?.state === "released" ? "Future-use approval recorded" :
          receipt?.state === "revoked" ? "Future use revoked" : "Room members only"}</p>
        {receipt?.state === "released" ? <button type="button" disabled={busy} onClick={() => void change(message, "revoke")}
          className="mt-1 rounded border border-amber-300/30 px-2 py-1 text-amber-100 disabled:opacity-40">Revoke future AI use</button>
          : !receipt ? <button type="button" disabled={busy} onClick={() => setSelected(message.message_id)}
            className="mt-1 rounded border border-fuchsia-300/30 px-2 py-1 text-fuchsia-100 disabled:opacity-40">Review AI release</button> : null}
        {selected === message.message_id && !receipt ? <div className="mt-2 rounded border border-fuchsia-300/30 p-2">
          <p className="text-slate-300">Release only this exact message to room {room.title || room.room_id} ({room.room_id}), generation {preparation.generation}. This records future-use permission; it does not send text to AI now. {preparation.state === "configured" ?
            "The host's OpenAI project would pay for an admitted later turn; no turn is enabled yet." :
            "Any later funded configuration needs fresh approval."}</p>
          <button type="button" disabled={busy} onClick={() => void change(message, "release")}
            className="mt-2 rounded border border-fuchsia-300/30 px-2 py-1 text-fuchsia-100 disabled:opacity-40">Approve this message for evaluation</button>
          <button type="button" disabled={busy} onClick={() => setSelected(null)} className="ml-2 text-slate-300">Cancel</button>
        </div> : null}
      </li>;
    })}</ul>
    {notice ? <p role="status" className="mt-2 text-amber-100">{notice}</p> : null}
  </section>;
}
