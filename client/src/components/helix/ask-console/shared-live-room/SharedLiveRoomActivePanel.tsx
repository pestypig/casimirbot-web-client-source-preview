import React from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { describeHelixSharedLiveRoomReadiness } from "./SharedLiveRoomViewModel";
import { SharedLiveRoomConsentPanel } from "./SharedLiveRoomConsentPanel";
import { SharedLiveRoomDebugPanel } from "./SharedLiveRoomDebugPanel";
import { SharedLiveRoomParticipantsPanel } from "./SharedLiveRoomParticipantsPanel";
import { SharedLiveRoomPublicResultsPanel } from "./SharedLiveRoomPublicResultsPanel";
import { SharedLiveRoomOwnerWorkflow } from "./SharedLiveRoomOwnerWorkflow";
import { SharedLiveRoomRuntimePanel } from "./SharedLiveRoomRuntimePanel";
import { SharedLiveRoomSetupPanel } from "./SharedLiveRoomSetupPanel";
import { SharedLiveRoomVisualLanes } from "./SharedLiveRoomVisualLanes";
import { SharedLiveRoomTextConversation } from "./SharedLiveRoomTextConversation";
import { SharedRoomInterpreterPreparationPanel } from "./SharedRoomInterpreterPreparationPanel";
import { SharedRoomInterpreterTurnHistory } from "./SharedRoomInterpreterTurnHistory";
import type { HelixSharedLiveRoomController } from "./useHelixSharedLiveRoom";
import type { RoomTextDraftStore } from "./RoomTextDraftStore";
import type { SharedLiveRoomTextConversationOwner } from "./SharedLiveRoomTextConversation";

const statusClassName = (ready: boolean): string => ready
  ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-100"
  : "border-amber-300/35 bg-amber-400/10 text-amber-100";

export function SharedLiveRoomActivePanel({
  room,
  controller,
  idPrefix,
  onVisualSourceCaptureRequested,
  onHostTransportInvalidated,
  onOwnerRoomClosed,
  onOpenTaskPairing,
  onReturnToPrivateAsk,
  onOpenPrivateApiChat,
  draftStore,
  roomTextConversation,
  onOpenRoomConsole,
  onOpenMissionConsole,
}: {
  room: HelixSharedRealtimeRoom;
  controller: HelixSharedLiveRoomController;
  idPrefix: string;
  onVisualSourceCaptureRequested?: () => void;
  onHostTransportInvalidated?: () => void;
  onOwnerRoomClosed?: () => void;
  onOpenTaskPairing?: () => void;
  onReturnToPrivateAsk: () => void;
  onOpenPrivateApiChat?: () => void;
  draftStore?: RoomTextDraftStore;
  roomTextConversation?: SharedLiveRoomTextConversationOwner;
  onOpenRoomConsole?: () => void;
  onOpenMissionConsole?: () => void;
}) {
  const isOwner = controller.selfParticipant?.role === "owner";
  const textOnly = room.capacity_profile === "three_human_text";
  const roleLabel = isOwner ? "Host" : controller.selfParticipant?.role === "participant" ? "Guest" : "Checking membership";
  const roomRuntimeSupportsAudio =
    room.runtime.state === "host_transport_active" ||
    room.runtime.state === "bridge_active";
  const canStartRoomAudio = Boolean(
    room.readiness.ready &&
    roomRuntimeSupportsAudio &&
    (!isOwner || controller.runtimeActive),
  );
  const recentTranscripts = controller.mediaBridge.recent_shared_transcripts?.length
    ? controller.mediaBridge.recent_shared_transcripts
    : controller.mediaBridge.latest_shared_transcript
      ? [controller.mediaBridge.latest_shared_transcript]
      : [];
  const leave = async (): Promise<void> => {
    const ownerClosing = isOwner;
    if (await controller.leaveRoom()) {
      draftStore?.clear({ source: "local", authority: "", roomId: room.room_id,
        participantId: room.self_participant_id });
      if (ownerClosing) onOwnerRoomClosed?.();
    }
  };
  const showArea = (area: "conversation" | "mission" | "people"): void => {
    const section = document.getElementById(`${idPrefix}-${area}`);
    section?.scrollIntoView?.({ block: "start" });
    if (area === "conversation") {
      const composer = section?.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)');
      composer?.focus({ preventScroll: true });
    }
  };
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">{room.title}</p>
            <p className="mt-1 text-[11px] text-cyan-100">Your role: {roleLabel} · Party Chat</p>
            <p className="mt-1 break-all font-mono text-[10px] text-slate-500">{room.room_id}</p>
          </div>
          <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${statusClassName(room.readiness.ready)}`}>
            {room.status}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-300">{describeHelixSharedLiveRoomReadiness(room)}</p>
        <nav aria-label="Conversation destinations" className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <button type="button" onClick={() => roomTextConversation?.admitted && onOpenRoomConsole
            ? onOpenRoomConsole() : showArea("conversation")}
            className="rounded-lg border border-cyan-300/30 bg-cyan-400/[0.06] px-3 py-2 text-cyan-100">Write to room members</button>
          <button type="button" onClick={onReturnToPrivateAsk}
            className="rounded-lg border border-white/20 px-3 py-2 text-slate-100">Open Ask Helix</button>
          {onOpenPrivateApiChat ? <button type="button" onClick={onOpenPrivateApiChat}
            className="rounded-lg border border-white/20 px-3 py-2 text-slate-100">Open Cloud Agent DM</button> : null}
          <button type="button" onClick={() => onOpenMissionConsole ? onOpenMissionConsole() : showArea("mission")}
            className="rounded-lg border border-emerald-300/30 px-3 py-2 text-emerald-100">Review task handoff</button>
          <button type="button" onClick={() => showArea("people")}
            className="rounded-lg border border-white/20 px-3 py-2 text-slate-100">People &amp; permissions</button>
        </nav>
        <p className="mt-2 text-[11px] text-slate-400">Room text goes to members{ textOnly ? " (up to three people)" : "" }; private chats stay private. Shared AI needs each author's exact release and a separate turn; this local room view cannot start one. {isOwner ? "You review each mission handoff." : "The host reviews mission handoffs."}</p>
        {!textOnly ? <p className="mt-1 text-[11px] leading-5 text-amber-100/80">
          When GPT Live is connected, the owner's browser hosts that call. Screen frames stay labeled by
          participant; room audio uses a separate two-browser relay and never feeds GPT audio
          back into the model microphone mix.
        </p> : <p className="mt-1 text-[11px] leading-5 text-amber-100/80">
          Three-person voice is unavailable in this profile. Interpreter preparation and text release
          record permission only; this local room view cannot start an AI turn.
        </p>}
      </section>

      <section id={`${idPrefix}-conversation`} aria-label="Party Chat conversation" className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-cyan-100">Conversation</h3>
          <p className="mt-1 text-[11px] text-slate-400">{textOnly
            ? "Each message is attributed to its author. Three-person voice is unavailable."
            : "Shared speech is attributed to its speaker. Recent lines stay in this live connection only and clear when room transcript consent or the connection ends."}</p>
        </div>
      <SharedLiveRoomTextConversation room={room} draftStore={draftStore}
        conversation={roomTextConversation} onOpenInConsole={onOpenRoomConsole} />
      <SharedRoomInterpreterPreparationPanel key={`${room.room_id}:${room.self_participant_id}`}
        room={room} isOwner={isOwner} />
      <SharedRoomInterpreterTurnHistory room={room} />
      {!textOnly ? <section className="rounded-xl border border-cyan-300/20 bg-cyan-400/[0.04] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-cyan-100">Room audio bridge</p>
            <p className="mt-1 text-[11px] text-slate-300">
              {controller.mediaBridge.state}
              {controller.mediaBridge.failure ? ` · ${controller.mediaBridge.failure}` : ""}
            </p>
          </div>
          {controller.mediaBridge.state === "idle" ||
          controller.mediaBridge.state === "closed" ||
          controller.mediaBridge.state === "error" ? (
            <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-active-panel.connect-room-audio"
              type="button"
              disabled={!canStartRoomAudio || controller.busyAction !== null}
              title={!room.readiness.ready
                ? "Both participants must finish the required room permissions"
                : !roomRuntimeSupportsAudio
                  ? "Connect the owner’s GPT Live session to the room first"
                  : isOwner && !controller.runtimeActive
                    ? "Start GPT Live in this browser before connecting room audio"
                    : "Connect the two-browser room audio bridge"}
              className="rounded-lg border border-cyan-300/30 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40"
              onClick={() => void controller.startMediaBridge()}
            >
              Connect room audio
            </button>
          ) : (
            <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-active-panel.disconnect-audio"
              type="button"
              className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200"
              onClick={() => void controller.stopMediaBridge()}
            >
              Disconnect audio
            </button>
          )}
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          Peer audio transport: {controller.mediaBridge.peer_audio_connected ? "connected" : "not connected"}
          {" · "}Playback: {controller.mediaBridge.remote_audio_playback_ready ? "ready" : "not ready"}
          {" · "}GPT input mix: {controller.mediaBridge.provider_input_mixed ? "ready" : "not ready"}
          {isOwner
            ? ` · GPT mic: ${controller.mediaBridge.provider_input_enabled ? "enabled" : "muted"}`
            : ""}
          {" · "}GPT audio shared: {controller.mediaBridge.provider_audio_forwarded ? "yes" : "not yet"}
          {" · "}ICE: {controller.mediaBridge.ice_configuration}
        </p>
        {controller.mediaBridge.ice_configuration_error ? (
          <p className="mt-1 text-[10px] text-amber-100">
            Configured ICE servers were invalid; using the default STUN fallback.
          </p>
        ) : null}
        {controller.mediaBridge.failure === "remote_audio_playback_blocked" ? (
          <button data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-active-panel.resume-room-playback"
            type="button"
            className="mt-2 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-[10px] font-semibold text-amber-100"
            onClick={() => void controller.resumeMediaPlayback()}
          >
            Resume room playback
          </button>
        ) : null}
        {controller.mediaBridge.provider_input_mixed &&
        !controller.mediaBridge.provider_input_enabled ? (
          <p className="mt-1 text-[10px] text-amber-100">
            Enable the owner’s GPT Live microphone before taking a speaking floor.
          </p>
        ) : null}
        <div aria-label="Recent room speech" className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] leading-5 text-slate-200">
          {recentTranscripts.length ? recentTranscripts.map((item, index) => (
            <p key={`${item.observed_at_ms}:${item.speaker_kind}:${index}`}><span className="font-semibold text-cyan-100">{item.speaker_label}:</span> {item.transcript}</p>
          )) : <p className="text-slate-500">No shared speech in this live connection yet.</p>}
        </div>
      </section> : null}
      </section>

      <section id={`${idPrefix}-mission`} aria-label="Room mission" className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-emerald-100">Mission</h3>
          <p className="mt-1 text-[11px] text-slate-400">A proposed instruction, task pickup, returned report and verified program result are different states.</p>
        </div>
        <SharedLiveRoomPublicResultsPanel room={room} />
        {onOpenMissionConsole ? <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">
          Review the selected room's mission in the Console. Room text remains a separate member message, never a task instruction.
        </p> : isOwner && controller.selfParticipant?.presence === "present" && room.status !== "closed" ?
          <SharedLiveRoomOwnerWorkflow key={`${room.room_id}:${controller.selfParticipant.participant_id}`}
            room={room} onProcessed={() => controller.openRoom(room.room_id)}
            onOpenTaskPairing={onOpenTaskPairing} roomMessages={roomTextConversation?.messages} /> :
          <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">The room owner reviews mission handoffs and reports. Only owner-approved results appear above; this view does not expose their private task connection.</p>}
      </section>

      <section id={`${idPrefix}-people`} aria-label="Room people and permissions" className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-100">People &amp; permissions</h3>
      <SharedLiveRoomParticipantsPanel
        room={room}
        controller={controller}
        sectionId={`${idPrefix}-participants`}
      />
      {!textOnly && controller.selfParticipant ? (
        <SharedLiveRoomConsentPanel
          participant={controller.selfParticipant}
          controller={controller}
          sectionId={`${idPrefix}-consent`}
          onHostTransportInvalidated={onHostTransportInvalidated}
        />
      ) : null}
      {!textOnly ? <SharedLiveRoomRuntimePanel
        room={room}
        controller={controller}
        sectionId={`${idPrefix}-runtime`}
      /> : null}
      {!textOnly ? <SharedLiveRoomVisualLanes
        room={room}
        controller={controller}
        sectionId={`${idPrefix}-frames`}
        onVisualSourceCaptureRequested={onVisualSourceCaptureRequested}
      /> : null}
      {textOnly ? <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-slate-400">
        This text room does not use the GPT Live audio and visual transport. Member, message,
        permission and shared AI status appear in their own sections.
      </p> : <SharedLiveRoomDebugPanel controller={controller} />}
      </section>

      <details className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-100">
          Switch or create another room
        </summary>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">
          Opening or creating another room changes this browser&apos;s active room. It does not
          close this room, revoke its grants, or remove your membership.
        </p>
        <div className="mt-3">
          <SharedLiveRoomSetupPanel
            controller={controller}
            fieldIdPrefix={`${idPrefix}-room-switcher`}
          />
        </div>
      </details>

      <div className="flex justify-end">
        <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-active-panel.void-leave"
          type="button"
          disabled={controller.busyAction !== null}
          className="rounded-lg border border-rose-300/25 px-3 py-2 text-xs text-rose-100 disabled:opacity-50"
          onClick={() => void leave()}
        >
          {isOwner ? "Close room" : "Leave room"}
        </button>
      </div>
    </div>
  );
}
