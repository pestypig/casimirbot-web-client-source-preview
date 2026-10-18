import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { SharedLiveRoomActivePanel } from "./SharedLiveRoomActivePanel";
import { SharedLiveRoomSetupPanel } from "./SharedLiveRoomSetupPanel";
import { NativeRoomConnectionPanel } from "./NativeRoomConnectionPanel";
import type { HelixSharedLiveRoomController } from "./useHelixSharedLiveRoom";
import { requestWorkstationGuidance } from "@/lib/workstation/workstationGuidance";
import { HELIX_PRIVATE_API_CHAT_OPEN_EVENT, HELIX_PRIVATE_ASK_COMPOSER_OPEN_EVENT } from "../ConsoleConversationEvents";
import { createRoomTextDraftStore, type RoomTextDraftStore } from "./RoomTextDraftStore";
import type { SharedLiveRoomTextConversationOwner } from "./SharedLiveRoomTextConversation";

export function SharedLiveRoomDialog({
  room,
  controller,
  titleId,
  descriptionId,
  onClose,
  onVisualSourceCaptureRequested,
  onHostTransportInvalidated,
  onOwnerRoomClosed,
  navigationTarget,
  draftStore,
  roomTextConversation,
  onOpenRoomConsole,
  onOpenMissionConsole,
  nativeRoomPortal,
  onNativeRoomPortalTargetChange,
}: {
  room: HelixSharedRealtimeRoom | null;
  controller: HelixSharedLiveRoomController;
  titleId: string;
  descriptionId: string;
  onClose(): void;
  onVisualSourceCaptureRequested?: () => void;
  onHostTransportInvalidated?: () => void;
  onOwnerRoomClosed?: () => void;
  navigationTarget?: { environmentBindingId: string } | null;
  draftStore?: RoomTextDraftStore;
  roomTextConversation?: SharedLiveRoomTextConversationOwner;
  onOpenRoomConsole?: () => void;
  onOpenMissionConsole?: () => void;
  nativeRoomPortal?: boolean;
  onNativeRoomPortalTargetChange?: (target: HTMLElement | null) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const [targetFound, setTargetFound] = useState(false);
  const fallbackDraftStore = useRef<RoomTextDraftStore | null>(null);
  if (!fallbackDraftStore.current) fallbackDraftStore.current = createRoomTextDraftStore();
  const roomDraftStore = draftStore ?? fallbackDraftStore.current;

  useEffect(() => {
    setTargetFound(false);
    if (!navigationTarget || !dialogRef.current) return;
    const root = dialogRef.current;
    let finished = false;
    const reveal = () => {
      const target = Array.from(root.querySelectorAll<HTMLElement>("[data-environment-player-settings]"))
        .find(element => element.dataset.environmentPlayerSettings === navigationTarget.environmentBindingId);
      if (!target || finished) return;
      finished = true;
      target.scrollIntoView?.({ block: "center" });
      target.focus({ preventScroll: true });
      setTargetFound(true);
    };
    // Source rows may arrive after the dialog mounts. Only reveal this exact
    // environment inside this dialog; never click a grant or select another row.
    const observer = new MutationObserver(reveal);
    observer.observe(root, { childList: true, subtree: true });
    const timer = window.setTimeout(reveal, 0);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [navigationTarget]);

  useEffect(() => {
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => {
      if (!navigationTarget || !dialogRef.current?.contains(document.activeElement)) closeButtonRef.current?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [onClose, navigationTarget]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div data-helix-interaction-kind="navigate" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-dialog.shared-live-room-overlay"
      className="fixed inset-0 z-[2147483000] isolate flex items-start justify-center overflow-y-auto overscroll-contain p-3 sm:p-6"
      data-testid="shared-live-room-overlay"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button data-helix-interaction-kind="navigate" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-dialog.close-shared-gpt-live-room-dialog"
        type="button"
        tabIndex={-1}
        aria-label="Close Rooms dialog"
        className="fixed inset-0 cursor-default bg-slate-950/90 backdrop-blur-md"
        onClick={onClose}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative z-10 mt-1 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl animate-in flex-col overflow-hidden rounded-2xl border border-fuchsia-300/30 bg-slate-950 text-slate-100 opacity-100 shadow-2xl shadow-black/80 ring-1 ring-white/5 fade-in-0 slide-in-from-top-2 sm:mt-6 sm:max-h-[calc(100dvh-4.5rem)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-3">
          <div>
            <p id={titleId} className="text-sm font-semibold text-fuchsia-100">
              Rooms
            </p>
            <p id={descriptionId} className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-400">
              Party Chat is separate from Ask Helix. Two-person voice uses a host-owned
              GPT Live call after consent; three-person text has no shared voice. The native hosted
              room service is a separate path and supplies no model.
            </p>
          </div>
          <button data-helix-interaction-kind="navigate" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-dialog.close-shared-gpt-live-room"
            ref={closeButtonRef}
            type="button"
            aria-label="Close Rooms"
            className="shrink-0 rounded-full border border-white/10 bg-slate-900 p-2 text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-200/70"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-950 p-4">
          {navigationTarget ? <p role="status" className="mb-3 text-xs text-cyan-100">
            {targetFound ? "Showing the selected environment's player settings. No permission was activated."
              : "Waiting for the selected environment's player settings. No other environment will be selected; you can close this dialog."}
          </p> : null}
          {controller.error ? (
            <div role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
              <span>{controller.error}</span>
              <button data-helix-interaction-kind="navigate" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-dialog.dismiss" type="button" className="underline" onClick={controller.clearError}>Dismiss</button>
            </div>
          ) : null}

          {nativeRoomPortal ? <div ref={onNativeRoomPortalTargetChange} />
            : <NativeRoomConnectionPanel fieldIdPrefix={titleId} draftStore={roomDraftStore} />}
          <div className="mb-3 rounded-lg border border-fuchsia-300/20 bg-fuchsia-400/[0.04] p-3 text-xs">
            <p className="font-semibold text-fuchsia-100">{room?.capacity_profile === "three_human_text"
              ? "Three-person text room · developer evaluation"
              : room ? "Two-person GPT Live room · assisted evaluation"
                : "Local rooms · choose a conversation profile"}</p>
            <p className="mt-1 text-slate-400">{room?.capacity_profile === "three_human_text"
              ? "Three members can exchange attributed text. Shared voice is unavailable; optional AI use requires each author's exact-message release and a separate turn request."
              : room ? "Two members can share labeled visual frames and floor-controlled audio with one host-owned GPT Live call. This is separate from the hosted service room and its task connection."
                : "Choose two-person voice or developer text-only conversation for up to three people. AI and task handoff remain separate actions."}</p>
          </div>
          {room ? (
            <SharedLiveRoomActivePanel
              room={room}
              controller={controller}
              idPrefix={titleId}
              onVisualSourceCaptureRequested={onVisualSourceCaptureRequested}
              onHostTransportInvalidated={onHostTransportInvalidated}
              onOwnerRoomClosed={onOwnerRoomClosed}
              draftStore={roomDraftStore}
              roomTextConversation={roomTextConversation}
              onOpenRoomConsole={onOpenRoomConsole}
              onOpenMissionConsole={onOpenMissionConsole}
              onReturnToPrivateAsk={() => {
                onClose();
                window.setTimeout(() => window.dispatchEvent(new Event(HELIX_PRIVATE_ASK_COMPOSER_OPEN_EVENT)), 0);
              }}
              onOpenPrivateApiChat={typeof window !== "undefined" && Boolean(window.casimirDesktop?.liveConnection)
                ? () => {
                  onClose();
                  window.setTimeout(() => window.dispatchEvent(new Event(HELIX_PRIVATE_API_CHAT_OPEN_EVENT)), 0);
                } : undefined}
              onOpenTaskPairing={() => {
                onClose();
                window.setTimeout(() => requestWorkstationGuidance({
                  kind: "user_attention", panelId: "agent-access", targetId: "external-ai-connection-setup",
                  label: "Review the AI app connection and pair the intended task, then return to this room and refresh.",
                  durationMs: 12000,
                }), 0);
              }}
            />
          ) : (
            <SharedLiveRoomSetupPanel controller={controller} fieldIdPrefix={titleId} />
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
