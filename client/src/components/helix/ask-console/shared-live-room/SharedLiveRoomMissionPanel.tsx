import React, { useEffect, useRef, useState } from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import type { RoomMissionOwnerCatalog, RoomMissionOwnerSelection } from "@shared/helix-room-mission-owner";
import type { HelixReasoningSteeringEventProjection } from "@shared/helix-reasoning-task-binding";
import { requestWorkstationGuidance } from "@/lib/workstation/workstationGuidance";
import { useRoomMissionHandoffReview } from "./RoomMissionHandoffReview";
import { RoomMissionActivityPreview } from "./RoomMissionActivityPreview";
import { RoomMissionTextOwnerReviewPanel } from "./RoomMissionTextOwnerReviewPanel";
import { readOwnerRoomResults, RoomResultRequestError } from "./RoomResultOwnerApi";
import { readRoomMissionOptions, selectRoomMission, revokeRoomMission,
  dispatchRoomMissionHandoff, readRoomMissionHandoffStatus, readRoomMissionDispatchActivity,
  RoomMissionRequestError } from "./RoomMissionOwnerApi";

const deliveryMessage = (state: HelixReasoningSteeringEventProjection["delivery_state"]) =>
  state === "pending"
    ? "Instruction recorded for the paired task. Codex pickup and a result are not confirmed. Refresh task results after it reports back."
    : state === "picked_up"
      ? "The exact task polled and was offered this instruction by MCP. Task acknowledgement, decision and game action are not confirmed."
    : state === "acknowledged"
      ? "The paired MCP client acknowledged receipt of this instruction. Task action and a result are not confirmed."
      : `Instruction is ${state}. It is not confirmed as delivered; capture a new instruction if needed.`;

const openTaskPairingSetup = () => requestWorkstationGuidance({
  kind: "user_attention",
  panelId: "agent-access",
  targetId: "external-ai-connection-setup",
  label: "Review the AI app connection and pair the intended task, then return to this room and refresh.",
  durationMs: 12000,
});

export function SharedLiveRoomMissionPanel({ room, onMissionChanged, onOpenTaskPairing, roomMessages = [] }: {
  room: HelixSharedRealtimeRoom;
  onMissionChanged?: (mission: RoomMissionOwnerSelection | null) => void;
  onOpenTaskPairing?: () => void;
  roomMessages?: Array<{ message_id: string; room_id: string; author_participant_id: string; text: string }>;
}) {
  const [catalog, setCatalog] = useState<RoomMissionOwnerCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewedTask, setReviewedTask] = useState(false);
  const [handoffId, setHandoffId] = useState("");
  const [approved, setApproved] = useState(false);
  const [handoffRecorded, setHandoffRecorded] = useState(false);
  const [recordedEvent, setRecordedEvent] = useState<HelixReasoningSteeringEventProjection | null>(null);
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof readRoomMissionDispatchActivity>> | null>(null);
  const [taskReports, setTaskReports] = useState<Awaited<ReturnType<typeof readOwnerRoomResults>> | null>(null);
  const entries = useRoomMissionHandoffReview(state => state.entries);
  const request = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const operationIds = useRef(new Map<string, string>());
  const currentCatalog = catalog?.room_id === room.room_id ? catalog : null;
  const mission = currentCatalog?.mission;
  const candidate = currentCatalog?.candidate;
  const alreadySelected = mission?.status === "active" && candidate &&
    mission.reasoning_binding_id === candidate.reasoning_binding_id && mission.binding_epoch === candidate.binding_epoch &&
    mission.helix_conversation_id === candidate.helix_conversation_id &&
    mission.binding_mission_id === candidate.binding_mission_id && mission.run_id === candidate.run_id;
  const options = (currentCatalog?.handoffs ?? []).flatMap(option => {
    const local = entries.find(entry => entry.roomId === room.room_id && entry.handoffId === option.handoff_id &&
      entry.realtimeSessionId === option.realtime_session_id && entry.textHash === option.transcript_text_hash &&
      entry.text.length === option.transcript_text_char_count);
    return local ? [{ ...option, local }] : [];
  });
  const selected = options.find(option => option.handoff_id === handoffId);
  const speaker = (id: string) => room.participants.find(p => p.participant_id === id)?.display_name ?? "Room participant";
  const requestId = (key: string) => {
    let id = operationIds.current.get(key);
    if (!id) { id = `room-owner:${crypto.randomUUID()}`; operationIds.current.set(key, id); }
    return id;
  };
  const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage("");
    const abort = new AbortController(); request.current = abort;
    try { await operation(abort.signal); }
    catch (error) {
      if (!abort.signal.aborted) {
        const code = error instanceof RoomMissionRequestError || error instanceof RoomResultRequestError
          ? error.code : null;
        setHidden(code === "room_mission_developer_required");
        setMessage(code && ["pairing_expired", "pairing_revoked", "pairing_superseded",
          "reasoning_binding_expired", "reasoning_binding_revoked",
          "reasoning_binding_superseded"].includes(code)
          ? `The selected task binding is unavailable (${code}). Reconnect or re-pair, then refresh this room task; prior status is not current proof.`
          : code
            ? `No new outcome confirmed (${code}). Refresh the room task before trying again.`
            : "The outcome is unknown. Retry the same action to reuse its request, or refresh to check the mission.");
      }
    } finally { if (request.current === abort) { locked.current = false; if (!abort.signal.aborted) setBusy(false); } }
  };
  const refresh = () => run(async signal => {
    setCatalog(null); setReviewedTask(false); setHandoffId(""); setApproved(false); setHandoffRecorded(false); setRecordedEvent(null); setActivity(null); setTaskReports(null);
    const next = await readRoomMissionOptions(room.room_id, signal);
    if (!signal.aborted) { setCatalog(next); setHidden(false); onMissionChanged?.(next.mission); }
  });
  useEffect(() => { locked.current = false; void refresh(); return () => { request.current?.abort(); }; }, [room.room_id]);
  // New receipts never inherit an earlier review, including a reconnect using
  // the same handoff selector or a source that has been cleared on disconnect.
  useEffect(() => { setApproved(false); setHandoffRecorded(false); setRecordedEvent(null); }, [handoffId, selected?.local.text, mission?.mission_revision]);
  if (hidden) return null;
  return <section aria-label="Room mission" className="rounded-xl border border-cyan-300/20 bg-cyan-400/[0.04] p-3 text-xs">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-semibold text-cyan-100">Room mission task</h3>
      <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded border border-white/20 px-2 py-1">Refresh room task</button>
    </div>
    <p className="mt-2 text-slate-300">Select your paired Codex task for room instructions. Selection does not start AI work or grant program actions.</p>
    {mission ? <div className="mt-3 space-y-2">
      <p>Mission: {mission.status === "active" ? "Selected" : "Revoked"} · revision {mission.mission_revision}</p>
      <p className="break-all">Connected chat: {mission.helix_conversation_id}</p>
      {mission.status === "active" && mission.run_id ?
        <RoomMissionActivityPreview key={`${mission.mission_id}:${mission.mission_revision}:${mission.run_id}`}
          mission={mission} /> : null}
      {mission.status === "active" ? <RoomMissionTextOwnerReviewPanel
        key={`${mission.mission_id}:${mission.mission_revision}:${mission.binding_epoch}`}
        room={room} mission={mission} messages={roomMessages} /> : null}
      {mission.status === "active" ? <>
        <button type="button" disabled={busy} className="rounded border border-white/20 px-3 py-2 disabled:opacity-50"
          onClick={() => void run(async signal => {
            setActivity(null); setTaskReports(null);
            const activity = await readRoomMissionDispatchActivity(mission, signal);
            if (!signal.aborted) setActivity(activity);
          })}>Load retained handoff status</button>
        {activity ? <div aria-label="Retained room handoffs" className="space-y-1 rounded border border-white/10 p-2">
          {activity.task_availability?.state === "unavailable" ?
            <p>The exact task is currently unavailable for pickup. Queued receipts remain queued; reconnect that task or review its binding. No delivery, decision or game action is inferred.</p> : null}
          {activity.entries.length ? activity.entries.map(entry => {
            const report = taskReports?.results.find(candidate =>
              candidate.steering_event_ref === entry.steering_event_ref);
            return <p key={entry.client_event_ref}>
              {entry.instruction_origin === "typed" ? "Approved room text from" : "Voice handoff from"} {speaker(entry.speaker_participant_id)} · {new Date(entry.created_at).toLocaleTimeString()} · {entry.delivery_state === "unconfirmed"
                ? "dispatch outcome unconfirmed" : entry.delivery_state === "acknowledged"
                  ? "paired MCP client acknowledged; task action and result unconfirmed"
                  : entry.delivery_state === "picked_up"
                    ? "exact task polled; acknowledgement, decision and game action unconfirmed"
                  : `${entry.delivery_state}; task action and result unconfirmed`}
              {taskReports ? report
                ? ` · Authenticated private task report says ${report.status}; game result unverified, not a room answer`
                : ` · No verified task report in the latest catalog${taskReports.limited ? " (older reports not ruled out)" : ""}`
                : null}
            </p>;
          }) : <p>No retained handoffs for this mission revision.</p>}
          <button type="button" disabled={busy} className="rounded border border-white/20 px-2 py-1"
            onClick={() => void run(async signal => {
              setTaskReports(null);
              const catalog = await readOwnerRoomResults(mission.room_id, signal);
              if (catalog.mission?.mission_id !== mission.mission_id ||
                  catalog.mission?.mission_revision !== mission.mission_revision)
                throw new RoomMissionRequestError("room_mission_response_mismatch");
              if (!signal.aborted) setTaskReports(catalog);
            })}>Check verified task reports</button>
          <p>Task reports are private owner receipts. A handoff acknowledgement is not a decision or room answer.</p>
        </div> : null}
      </> : null}
      {mission.status === "active" ? <button type="button" disabled={busy}
        className="rounded border border-amber-300/30 px-3 py-2"
        onClick={() => void run(async signal => {
          const next = await revokeRoomMission(mission, requestId(`revoke:${mission.room_id}:${mission.mission_revision}`), signal);
          if (!signal.aborted) { setCatalog(current => current ? { ...current, mission: next } : null); setActivity(null); setTaskReports(null); onMissionChanged?.(next); setMessage("Mission revoked. Pending room instructions can no longer use this selection."); }
        })}>Revoke room mission</button> : null}
    </div> : currentCatalog ? <p className="mt-3">No mission is selected.</p> : null}
    {candidate && !alreadySelected ? <div className="mt-3 space-y-2">
      <p className="break-all">Currently paired chat: {candidate.helix_conversation_id}</p>
      <p>Binding revision {candidate.binding_epoch}. To choose a different task, pair it in AI app connection setup, then refresh here.</p>
      <button type="button" className="rounded border border-white/20 px-3 py-2" onClick={onOpenTaskPairing ?? openTaskPairingSetup}>Open Agent Access for task pairing</button>
      <label className="flex gap-2"><input type="checkbox" checked={reviewedTask} disabled={busy}
        onChange={event => setReviewedTask(event.target.checked)} />Use this paired task for this room.</label>
      <button type="button" disabled={busy || !reviewedTask || room.status === "closed"}
        className="rounded border border-cyan-300/30 px-3 py-2 disabled:opacity-50"
        onClick={() => void run(async signal => {
          const revision = mission?.mission_revision ?? null;
          const next = await selectRoomMission(room.room_id, candidate, revision,
            requestId(JSON.stringify(["select", room.room_id, candidate, revision])), signal);
          if (!signal.aborted) { setCatalog(current => current ? { ...current, mission: next } : null); setActivity(null); onMissionChanged?.(next); setReviewedTask(false); setMessage("Room mission selected. Review a captured instruction before sending it."); }
        })}>Select room task</button>
    </div> : null}
    {currentCatalog?.candidate_unavailable ? <div className="mt-3 space-y-2">
      <p>No current paired task is ready. Review the AI app connection and pair the intended task, then refresh.</p>
      <button type="button" className="rounded border border-white/20 px-3 py-2" onClick={onOpenTaskPairing ?? openTaskPairingSetup}>Open Agent Access for task pairing</button>
    </div> : null}
    {mission?.status === "active" ? <div className="mt-4 space-y-3">
      <p>After room speech is captured, refresh and choose one instruction. Only speech still available in this browser and authorized by the server is listed.</p>
      {options.length ? <>
        <label className="block">Captured room instruction
          <select aria-label="Captured room instruction" value={handoffId} disabled={busy}
            className="mt-1 block w-full rounded border border-white/20 bg-slate-950 p-2"
            onChange={event => setHandoffId(event.target.value)}>
            <option value="">Choose captured speech…</option>
            {options.map(option => <option key={option.handoff_id} value={option.handoff_id}>
              {speaker(option.speaker_participant_id)} · {new Date(option.created_at_ms).toLocaleTimeString()}
            </option>)}
          </select>
        </label>
        {selected ? <>
          <p className="whitespace-pre-wrap rounded border border-white/10 p-2">{speaker(selected.speaker_participant_id)}: {selected.local.text}</p>
          <label className="flex items-start gap-2"><input type="checkbox" disabled={busy || handoffRecorded} checked={approved}
            onChange={event => setApproved(event.target.checked)} />Send this exact instruction to the selected Codex task. It may use that task's model allowance; program permissions still apply.</label>
          <button type="button" disabled={busy || !approved || handoffRecorded || room.status === "closed"}
            className="rounded border border-cyan-300/30 px-3 py-2 disabled:opacity-50"
            onClick={() => void run(async signal => {
              const event = await dispatchRoomMissionHandoff(mission, selected.local, selected.speaker_participant_id, signal);
              if (!signal.aborted) {
                setHandoffRecorded(true); setApproved(false);
                setRecordedEvent(event);
                setMessage(deliveryMessage(event.delivery_state));
              }
            })}>Send reviewed instruction</button>
          {recordedEvent && recordedEvent.reasoning_binding_id === mission.reasoning_binding_id &&
            recordedEvent.binding_epoch === mission.binding_epoch ?
            <button type="button" disabled={busy} className="ml-2 rounded border border-white/20 px-3 py-2 disabled:opacity-50"
              onClick={() => void run(async signal => {
                const event = await readRoomMissionHandoffStatus(mission, recordedEvent, signal);
                if (!signal.aborted) { setRecordedEvent(event); setMessage(deliveryMessage(event.delivery_state)); }
              })}>Check task pickup</button> : null}
        </> : null}
      </> : <p>No current captured instructions. Start the consenting room session and speak, then refresh. Reconnecting clears this browser's previews.</p>}
    </div> : null}
    {busy ? <p role="status" className="mt-2">Checking room task…</p> : null}
    {message ? <p role="status" className="mt-2 text-amber-100">{message}</p> : null}
  </section>;
}
