import React, { useEffect, useRef, useState } from "react";
import { hostedRoomInterpreterStatusSchema,
  type HostedRoomInterpreterStatus } from "@shared/room-interpreter-hosted-status";
import { DESKTOP_AUTH0_ROOM_CONTROL_PATH as CONTROL } from "@shared/desktop-auth0-account-link";
import { hostedRoomInterpreterEvaluationActivationReceiptSchema } from
  "@shared/hosted-room-interpreter-evaluation";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

/** Service-room AI presence and owner-only native key selection. No dispatch. */
export function NativeHostedRoomInterpreterStatus({ roomId, authority, isOwner = false,
  capacityProfile }: {
  roomId: string; authority: string; isOwner?: boolean;
  capacityProfile?: "two_person_voice" | "three_human_text";
}) {
  const [status, setStatus] = useState<HostedRoomInterpreterStatus | null>(null);
  const [error, setError] = useState("");
  const [selectionMessage, setSelectionMessage] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [activating, setActivating] = useState(false);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const revision = useRef(0);
  const request = useRef<AbortController | null>(null);
  const refresh = async () => {
    const current = ++revision.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setStatus(null); setError("");
    try {
      const response = await fetch(CONTROL, { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "interpreter_status", room_id: roomId }), signal: controller.signal });
      if (!response.ok) throw Error("status_unavailable");
      const parsed = hostedRoomInterpreterStatusSchema.parse(await response.json());
      if (parsed.room.room_id !== roomId || (parsed.session && parsed.session.room_id !== roomId))
        throw Error("wrong_room");
      if (current === revision.current && !controller.signal.aborted) setStatus(parsed);
    } catch {
      if (current === revision.current && !controller.signal.aborted)
        setError("Hosted room AI status could not be verified for this account.");
    }
  };
  useEffect(() => {
    void refresh();
    const changed = () => { revision.current += 1; request.current?.abort();
      setStatus(null); setSelectionMessage(""); setSelecting(false); setPreparing(false);
      setActivating(false);
      setAccountEpoch((value: number) => value + 1); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
    return () => { revision.current += 1; request.current?.abort();
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed); };
  }, [roomId, authority, accountEpoch]);

  const selectKey = async () => {
    const session = status?.session, bridge = window.casimirDesktop?.liveConnection;
    if (!isOwner || selecting || !bridge || session?.state !== "configuration_pending") return;
    const epoch = revision.current;
    setSelecting(true); setSelectionMessage("");
    try {
      const result = await bridge({ action: "room_hosted_interpreter_key_select", room_id: roomId,
        interpreter_session_id: session.interpreter_session_id, generation: session.generation });
      if (epoch !== revision.current) return;
      if (!result.ok || result.code !== "room_hosted_interpreter_key_selected") {
        setSelectionMessage(result.code === "missing_key"
          ? "Save your OpenAI API key in Helix Ask Connections first."
          : "Key selection was not confirmed. Refresh this room before trying again.");
        return;
      }
      setSelectionMessage("Host key selected for a new generation. Shared AI is still inactive; no provider turn was made.");
      await refresh();
    } catch {
      if (epoch === revision.current) setSelectionMessage("Key selection was not confirmed. Refresh this room before trying again.");
    } finally { setSelecting(false); }
  };

  const prepare = async () => {
    if (!isOwner || preparing || status?.session) return;
    const epoch = revision.current;
    setPreparing(true); setSelectionMessage("");
    try {
      const response = await fetch(CONTROL, { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "interpreter_prepare", room_id: roomId }) });
      if (!response.ok) throw Error("preparation_unconfirmed");
      const receipt = await response.json();
      if (receipt?.schema !== "helix.shared_live_room.interpreter_preparation.v1" ||
          receipt?.room?.room_id !== roomId || receipt?.session?.room_id !== roomId ||
          receipt?.model_input !== false || receipt?.provider_calls !== 0 ||
          receipt?.shared_ai_active !== false) throw Error("preparation_invalid");
      if (epoch === revision.current) {
        setSelectionMessage("Interpreter preparation created. No room text or API key has been sent to a model.");
        await refresh();
      }
    } catch {
      if (epoch === revision.current) setSelectionMessage("Preparation was not confirmed. Refresh this room before retrying.");
    } finally { setPreparing(false); }
  };

  const activateEvaluation = async () => {
    const session = status?.session;
    if (!isOwner || capacityProfile !== "three_human_text" || activating ||
        session?.state !== "configured" ||
        session.usage_ceiling_turns !== 1 || session.evaluation_profile) return;
    const epoch = revision.current;
    setActivating(true); setSelectionMessage("");
    try {
      const response = await fetch(CONTROL, { method: "POST", credentials: "same-origin",
        cache: "no-store", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "interpreter_evaluation_activate", room_id: roomId,
          request: { interpreter_session_id: session.interpreter_session_id,
            generation: session.generation } }) });
      if (!response.ok) throw Error("activation_unconfirmed");
      const receipt = hostedRoomInterpreterEvaluationActivationReceiptSchema.parse(await response.json());
      if (receipt.room.room_id !== roomId ||
          receipt.session.interpreter_session_id !== session.interpreter_session_id ||
          receipt.session.generation !== session.generation) throw Error("activation_invalid");
      if (epoch === revision.current) {
        setSelectionMessage("Two-turn text evaluation enabled for this room. No model call was made.");
        await refresh();
      }
    } catch {
      if (epoch === revision.current)
        setSelectionMessage("Two-turn evaluation was not confirmed. Check that three members are present, then refresh.");
    } finally { setActivating(false); }
  };

  return <section aria-label="Hosted room AI status" className="mt-3 rounded border border-fuchsia-300/20 p-3 text-xs">
    <p className="font-semibold text-fuchsia-100">Shared AI on this service room</p>
    <p className="mt-1 text-slate-400">{authority} · {roomId}</p>
    <p role="status" className="mt-1 text-slate-300">{error || (status
      ? status.session?.state === "configured"
        ? status.session.evaluation_profile === "ar2_two_turn_text"
          ? "Two-turn text evaluation is configured. Members may release exact messages and request a first reply and one correction. Shared AI is inactive until the host starts each turn."
          : "Host selected a key for this room generation. Shared AI is inactive; key availability and provider access must be checked again before a turn."
        : status.session ? "Interpreter preparation pending; shared AI is inactive."
          : "No shared AI interpreter is prepared for this room."
      : "Checking this room's AI status…")}</p>
    <button type="button" className="mt-2 rounded border border-fuchsia-300/30 px-2 py-1 text-fuchsia-100"
      onClick={() => void refresh()}>Refresh AI status</button>
    {isOwner && status && !status.session ?
      <button type="button" disabled={preparing} onClick={() => void prepare()}
        className="ml-2 mt-2 rounded border border-fuchsia-300/30 px-2 py-1 text-fuchsia-100 disabled:opacity-40">
        Prepare shared AI for this room
      </button> : null}
    {isOwner && status?.session?.state === "configuration_pending" && window.casimirDesktop?.liveConnection ?
      <button type="button" disabled={selecting} onClick={() => void selectKey()}
        className="ml-2 mt-2 rounded border border-fuchsia-300/30 px-2 py-1 text-fuchsia-100 disabled:opacity-40">
        Use my configured API key for this hosted room
      </button> : null}
    {isOwner && capacityProfile === "three_human_text" && status?.session?.state === "configured" &&
      status.session.usage_ceiling_turns === 1 && !status.session.evaluation_profile ?
      <button type="button" disabled={activating} onClick={() => void activateEvaluation()}
        className="ml-2 mt-2 rounded border border-fuchsia-300/30 px-2 py-1 text-fuchsia-100 disabled:opacity-40">
        Enable three-member text evaluation
      </button> : null}
    {selectionMessage ? <p role="status" className="mt-2 text-amber-100">{selectionMessage}</p> : null}
  </section>;
}
