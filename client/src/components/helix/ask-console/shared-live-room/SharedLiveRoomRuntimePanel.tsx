import React from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import type { HelixSharedLiveRoomController } from "./useHelixSharedLiveRoom";

export function SharedLiveRoomRuntimePanel({
  room,
  controller,
  sectionId,
}: {
  room: HelixSharedRealtimeRoom;
  controller: HelixSharedLiveRoomController;
  sectionId: string;
}) {
  const isOwner = controller.selfParticipant?.role === "owner";
  const hostTransport = room.runtime.transport_owner === "host_browser";
  const runtimeBound = Boolean(room.runtime.realtime_session_ref_hash);
  const canConnect = Boolean(
    isOwner &&
    room.readiness.ready &&
    controller.runtimeActive &&
    controller.realtimeSessionId &&
    room.runtime.state !== "host_transport_active" &&
    room.runtime.state !== "bridge_active",
  );
  const canTakeFloor = Boolean(
    (room.runtime.state === "host_transport_active" || room.runtime.state === "bridge_active") &&
    (isOwner || room.runtime.transport_owner === "room_media_bridge"),
  );
  const ownsFloor = Boolean(
    controller.selfParticipant?.participant_id ===
    room.runtime.active_speaker_participant_id,
  );
  return (
    <section aria-labelledby={sectionId} className="rounded-xl border border-sky-300/15 bg-sky-950/10 p-3">
      <p id={sectionId} className="text-xs font-semibold text-sky-100">Shared GPT Live · assisted evaluation</p>
      <div className="mt-2 grid gap-1 text-[10px] text-slate-400 sm:grid-cols-2">
        <p>Room runtime: <span className="font-mono text-slate-200">{room.runtime.state}</span></p>
        <p>Transport owner: <span className="font-mono text-slate-200">{room.runtime.transport_owner}</span></p>
        <p>GPT Live on this device: <span className="font-mono text-slate-200">{controller.runtimeActive ? "active" : "inactive"}</span></p>
        <p>Selected model: <span className="font-mono text-slate-200">{room.runtime.model ?? "none"}</span></p>
        <p>Bound reference: <span className="font-mono text-slate-200">{room.runtime.realtime_session_ref_hash ?? "none"}</span></p>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-400">Provider: OpenAI GPT Live. Expected payer: the host's configured OpenAI connection when this call is active. This view does not verify provider billing.</p>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">
        Start GPT Live, then connect it to this room. After binding, the room route owns automatic
        visual ingress so the host frame is not sent twice. Each participant needs room visual
        permission and an active local Screen, Camera, or Image Lens producer; the guest does not
        start a second GPT Live call.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {isOwner ? (
          <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-runtime-panel.connect-room-to-gpt-live"
            type="button"
            disabled={controller.busyAction !== null || !canConnect}
            title={!controller.runtimeActive
              ? "Start GPT Live before connecting the room"
              : !room.readiness.ready
                ? "Both present members must finish required permission records"
                : "Reserve if needed and bind this GPT Live session to the room"}
            className="rounded-lg border border-sky-300/30 bg-sky-400/10 px-3 py-1.5 text-[10px] font-semibold text-sky-100 disabled:opacity-45"
            onClick={() => void controller.connectRuntime()}
          >
            Connect room to GPT Live
          </button>
        ) : null}
        {canTakeFloor && !ownsFloor ? (
          <button data-helix-interaction-kind="configure" data-helix-authority-state="route_owned" data-helix-route-contract-id="room.floor.acquire" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-runtime-panel.take-speaking-floor"
            type="button"
            disabled={controller.busyAction !== null}
            className="rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold text-emerald-100 disabled:opacity-45"
            onClick={() => void controller.takeFloor()}
          >
            {hostTransport ? "Mark host speaking" : "Take speaking floor"}
          </button>
        ) : null}
        {ownsFloor ? (
          <button data-helix-interaction-kind="configure" data-helix-authority-state="route_owned" data-helix-route-contract-id="room.floor.release" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-runtime-panel.release-speaking-floor"
            type="button"
            disabled={controller.busyAction !== null}
            className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-[10px] font-semibold text-amber-100 disabled:opacity-45"
            onClick={() => void controller.releaseFloor()}
          >
            Release speaking floor
          </button>
        ) : null}
      </div>
      {!isOwner && hostTransport && runtimeBound ? (
        <p className="mt-2 text-[10px] text-amber-100/80">
          Your speaking control stays disabled until a room media bridge carries participant audio.
        </p>
      ) : null}
    </section>
  );
}
