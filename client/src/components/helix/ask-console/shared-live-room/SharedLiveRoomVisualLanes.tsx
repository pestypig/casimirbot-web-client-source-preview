import React, { useMemo } from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import {
  formatSharedLiveRoomTimestamp,
  labelSharedLiveRoomFrameSurface,
} from "./SharedLiveRoomFormatting";
import { buildHelixSharedLiveRoomVisualLanes } from "./SharedLiveRoomViewModel";
import type { HelixSharedLiveRoomController } from "./useHelixSharedLiveRoom";

export function SharedLiveRoomVisualLanes({
  room,
  controller,
  sectionId,
  onVisualSourceCaptureRequested,
}: {
  room: HelixSharedRealtimeRoom;
  controller: HelixSharedLiveRoomController;
  sectionId: string;
  onVisualSourceCaptureRequested?: () => void;
}) {
  const lanes = useMemo(() => buildHelixSharedLiveRoomVisualLanes({
    room,
    frames: controller.frames,
  }), [controller.frames, room]);
  const visualRouteAuthorized = Boolean(
    controller.selfParticipant?.consent.screen_to_model ||
    controller.selfParticipant?.consent.screen_thumbnail_to_room,
  );
  return (
    <section aria-labelledby={sectionId} className="rounded-xl border border-cyan-300/15 bg-cyan-950/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p id={sectionId} className="text-xs font-semibold text-cyan-100">Participant visual lanes</p>
          <p className="mt-1 text-[10px] text-slate-500">
            Ephemeral previews only. Every frame is participant-labeled observation evidence, never an answer.
          </p>
        </div>
        <span className="rounded border border-cyan-300/20 px-2 py-1 text-[9px] uppercase text-cyan-100">
          {controller.frames.length} frames
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-visual-lanes.start-selected-screen-camera-capture"
          type="button"
          disabled={
            !visualRouteAuthorized ||
            !onVisualSourceCaptureRequested ||
            controller.busyAction !== null
          }
          className="rounded-lg border border-cyan-300/30 px-3 py-2 text-[10px] font-semibold text-cyan-100 disabled:opacity-40"
          onClick={onVisualSourceCaptureRequested}
        >
          Start selected Screen / Camera capture
        </button>
        <p className="text-[9px] leading-4 text-slate-500">
          Choose Screen or Camera in the Ask toolbar first. Room capture uses this participant's
          consent and does not start a second GPT Live call.
        </p>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {lanes.map((lane) => (
          <article key={lane.participant.participant_id} className="min-w-0 rounded-lg border border-white/10 bg-black/25 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold text-slate-100">
                {lane.participant.display_name}{lane.participant.participant_id === room.self_participant_id ? " (you)" : ""}
              </p>
              <span className="text-[9px] text-slate-500">{lane.frames.length}</span>
            </div>
            {lane.contextCard ? (
              <p className="mt-1 text-[9px] text-cyan-100/70">
                Context: {lane.contextCard.context_status}
                {lane.contextCard.visual_sources[0]
                  ? ` · ${lane.contextCard.visual_sources[0].source_label} · ${lane.contextCard.visual_sources[0].model_visibility}`
                  : " · no frame observed"}
              </p>
            ) : null}
            {lane.latestFrame?.preview_data_url ? (
              <img
                src={lane.latestFrame.preview_data_url}
                alt={`Latest short-lived frame from ${lane.participant.display_name}`}
                className="mt-2 aspect-video w-full rounded border border-white/10 bg-black object-contain"
              />
            ) : (
              <div className="mt-2 flex aspect-video items-center justify-center rounded border border-dashed border-white/10 bg-black/30 px-3 text-center text-[10px] text-slate-500">
                {lane.latestFrame ? "Preview private; metadata received." : "Waiting for a permission-bound local frame."}
              </div>
            )}
            {lane.latestFrame ? (
              <p className="mt-1 truncate text-[9px] text-slate-500">
                {labelSharedLiveRoomFrameSurface(lane.latestFrame)} · {formatSharedLiveRoomTimestamp(lane.latestFrame.captured_at)} · {lane.latestFrame.provider_delivery}
              </p>
            ) : null}
            {lane.frames.length > 1 ? (
              <div className="mt-2 flex gap-1 overflow-x-auto" aria-label={`${lane.participant.display_name} recent visual frames`}>
                {lane.frames.map((frame) => frame.preview_data_url ? (
                  <img
                    key={frame.frame_ref}
                    src={frame.preview_data_url}
                    alt=""
                    className="h-10 w-16 shrink-0 rounded border border-white/10 bg-black object-cover"
                  />
                ) : (
                  <span key={frame.frame_ref} className="flex h-10 w-16 shrink-0 items-center justify-center rounded border border-dashed border-white/10 text-[8px] text-slate-600">
                    private
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Local room ingress: {controller.frameUpload.status}
        {controller.frameUpload.providerDelivery
          ? ` · provider: ${controller.frameUpload.providerDelivery}`
          : ""}
        {controller.frameUpload.sourceId ? ` · ${controller.frameUpload.sourceId}` : ""}
        {controller.frameUpload.error ? ` · ${controller.frameUpload.error}` : ""}
      </p>
    </section>
  );
}
