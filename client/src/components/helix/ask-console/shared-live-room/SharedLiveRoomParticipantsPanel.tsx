import React, { useState } from "react";
import { Copy } from "lucide-react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { formatSharedLiveRoomTimestamp } from "./SharedLiveRoomFormatting";
import type { HelixSharedLiveRoomController } from "./useHelixSharedLiveRoom";
import { SharedLiveRoomSourceBindingsPanel } from "./SharedLiveRoomSourceBindingsPanel";
import { SharedLiveRoomBrokerageBindingsPanel } from
  "./SharedLiveRoomBrokerageBindingsPanel";
import { SharedLiveRoomCapabilitiesPanel } from
  "./SharedLiveRoomCapabilitiesPanel";

export function SharedLiveRoomParticipantsPanel({
  room,
  controller,
  sectionId,
}: {
  room: HelixSharedRealtimeRoom;
  controller: HelixSharedLiveRoomController;
  sectionId: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const isOwner = controller.selfParticipant?.role === "owner";
  const memberCapacity = room.capacity_profile === "three_human_text" ? 3 : 2;
  const presentMembers = room.participants.filter(participant => participant.presence !== "left").length;
  const openSeats = Math.max(0, memberCapacity - presentMembers);
  const copyInvite = async (): Promise<void> => {
    if (!controller.inviteCode) return;
    try {
      await navigator.clipboard.writeText(controller.inviteCode);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };
  return (
    <section aria-labelledby={sectionId} className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={sectionId} className="text-xs font-semibold text-slate-100">
          Participants and readiness
        </p>
        {isOwner ? (
          <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-participants-panel.create-invite"
            type="button"
            disabled={controller.busyAction !== null || room.status === "closed" || openSeats === 0}
            className="rounded-lg border border-fuchsia-300/30 px-2 py-1 text-[10px] font-semibold text-fuchsia-100 disabled:opacity-50"
            onClick={() => void controller.createInvite()}
          >
            Create invite
          </button>
        ) : null}
      </div>
      {controller.inviteCode ? (
        <div className="mt-2 rounded-lg border border-fuchsia-300/25 bg-fuchsia-400/10 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all text-xs text-fuchsia-100">
              {controller.inviteCode}
            </code>
            <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-participants-panel.copy-shared-live-room-invite-code"
              type="button"
              aria-label="Copy Shared Live Room invite code"
              className="inline-flex items-center gap-1 rounded border border-fuchsia-300/30 px-2 py-1 text-[10px] text-fuchsia-100"
              onClick={() => void copyInvite()}
            >
              <Copy className="h-3 w-3" />
              {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Select manually" : "Copy"}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-fuchsia-100/60">
            Expires {formatSharedLiveRoomTimestamp(controller.inviteExpiresAt)}. Share only with the intended account.
          </p>
        </div>
      ) : null}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {room.participants.map((participant) => {
          const missing = room.readiness.missing_consent_by_participant[participant.participant_id] ?? [];
          const activeSpeaker = room.runtime.active_speaker_participant_id === participant.participant_id;
          return (
            <article key={participant.participant_id} className="rounded-lg border border-white/10 bg-slate-950/70 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-slate-100">
                  {participant.display_name}{participant.participant_id === room.self_participant_id ? " (you)" : ""}
                </p>
                <span className="text-[9px] uppercase text-slate-500">{participant.role}</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                {participant.presence}{activeSpeaker ? " · speaking marker" : ""}
              </p>
              <p className={`mt-1 text-[10px] ${missing.length ? "text-amber-200" : "text-emerald-200"}`}>
                {room.capacity_profile === "three_human_text"
                  ? "No voice or visual consent needed for text"
                  : missing.length ? `Missing: ${missing.join(", ")}` : "Required permission records ready"}
              </p>
            </article>
          );
        })}
        {openSeats > 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 p-2 text-xs text-slate-500">
            {openSeats === 1 ? "1 open seat" : `${openSeats} open seats`} · invite signed-in {openSeats === 1 ? "account" : "accounts"}
          </div>
        ) : null}
      </div>
      <SharedLiveRoomSourceBindingsPanel
        roomId={room.room_id}
        roomClosed={room.status === "closed"}
        isOwner={isOwner}
        selfParticipantId={room.self_participant_id}
        participants={room.participants}
      />
      <SharedLiveRoomCapabilitiesPanel
        roomId={room.room_id}
        roomClosed={room.status === "closed"}
        isOwner={isOwner}
      />
      <SharedLiveRoomBrokerageBindingsPanel
        roomId={room.room_id}
        roomClosed={room.status === "closed"}
        isOwner={isOwner}
      />
    </section>
  );
}
