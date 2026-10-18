import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Users } from "lucide-react";
import { SharedLiveRoomDialog } from "./SharedLiveRoomDialog";
import { describeHelixSharedLiveRoomTrigger } from "./SharedLiveRoomViewModel";
import {
  HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT,
  buildSharedLiveRoomGuideProjection,
  recordSharedLiveRoomGuideProjection,
  resetSharedLiveRoomGuideProjection,
} from "./SharedLiveRoomGuideProjection";
import { useHelixSharedLiveRoom } from "./useHelixSharedLiveRoom";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { createRoomTextDraftStore } from "./RoomTextDraftStore";
import { LocalRoomTextOwnerBridge, type LocalRoomTextOwnerSnapshot } from "./LocalRoomTextOwnerBridge";
import { NativeRoomConnectionPanel, type DiscordVoiceRenewalPending } from "./NativeRoomConnectionPanel";
import type { HostedRoomTextOwnerSnapshot } from "./NativeHostedRoomTextOwnerBridge";

export const HELIX_HOSTED_ROOM_OPEN_DIALOG_EVENT = "helix:hosted-room-open-dialog";

export type HelixAskSharedLiveRoomControlsProps = {
  realtimeSessionId: string | null;
  runtimeActive: boolean;
  realtimeModel: string;
  onActiveRoomChange?: (roomId: string | null) => void;
  onVisualSourceCaptureRequested?: () => void;
  onSharedTransportChange?: (bound: boolean) => void;
  onHostTransportInvalidated?: () => void;
  onOwnerRoomClosed?: () => void;
  onRoomTextOwnerChange?: (snapshot: LocalRoomTextOwnerSnapshot | null) => void;
  onSelectRoomChannel?: () => void;
  onSelectRoomMission?: () => void;
  onHostedRoomTextOwnerChange?: (snapshot: HostedRoomTextOwnerSnapshot | null) => void;
  onDiscordVoiceRenewalRequest?: (request: DiscordVoiceRenewalPending | null) => void;
  onSelectHostedRoomChannel?: () => void;
  onSelectHostedRoomMission?: () => void;
};

export function HelixAskSharedLiveRoomControls({
  realtimeSessionId,
  runtimeActive,
  realtimeModel,
  onActiveRoomChange,
  onVisualSourceCaptureRequested,
  onSharedTransportChange,
  onHostTransportInvalidated,
  onOwnerRoomClosed,
  onRoomTextOwnerChange,
  onSelectRoomChannel,
  onSelectRoomMission,
  onHostedRoomTextOwnerChange,
  onDiscordVoiceRenewalRequest,
  onSelectHostedRoomChannel,
  onSelectHostedRoomMission,
}: HelixAskSharedLiveRoomControlsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nativeRoomPortalTarget, setNativeRoomPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const open = () => setDialogOpen(true);
    window.addEventListener(HELIX_HOSTED_ROOM_OPEN_DIALOG_EVENT, open);
    return () => window.removeEventListener(HELIX_HOSTED_ROOM_OPEN_DIALOG_EVENT, open);
  }, []);
  const [navigationRoomId, setNavigationRoomId] = useState<string | null>(null);
  const roomDraftStore = useRef(createRoomTextDraftStore()).current;
  const navigationRead = useRef<AbortController | null>(null);
  useEffect(() => () => navigationRead.current?.abort(), []);
  useEffect(() => {
    const changed = () => { roomDraftStore.clearAll(); navigationRead.current?.abort(); setDialogOpen(false); setNavigationRoomId(null); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
    return () => window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
  }, []);
  const [navigationTarget, setNavigationTarget] = useState<{ environmentBindingId: string } | null>(null);
  const controller = useHelixSharedLiveRoom({
    realtimeSessionId,
    runtimeActive,
    realtimeModel,
    foreground: dialogOpen,
  });
  const titleId = useId();
  const descriptionId = useId();
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const hostInvalidationHandledRef = useRef(false);
  const hostTransportSeenRef = useRef(false);
  const room = controller.room;
  const onMissionProcessed = useCallback(async () => {
    if (room) await controller.openRoom(room.room_id);
  }, [controller.openRoom, room?.room_id]);
  const guideProjection = useMemo(() => buildSharedLiveRoomGuideProjection({
    room,
    mediaBridge: controller.mediaBridge,
    loading: controller.busyAction === "loading",
    failed: Boolean(controller.error),
  }), [controller.busyAction, controller.error, controller.mediaBridge, room]);
  const roomTrigger = describeHelixSharedLiveRoomTrigger(room);
  const hostTransportReferencePresent = Boolean(
    controller.selfParticipant?.role === "owner" &&
    (
      room?.runtime.transport_owner === "host_browser" ||
      room?.runtime.transport_owner === "room_media_bridge"
    ) &&
    room.runtime.realtime_session_ref_hash,
  );
  const sharedTransportBound = hostTransportReferencePresent && room?.runtime.state !== "closed";

  useEffect(() => {
    recordSharedLiveRoomGuideProjection(guideProjection);
  }, [guideProjection]);

  useEffect(() => () => resetSharedLiveRoomGuideProjection(), []);

  useEffect(() => {
    const openDialog = (event: Event): void => {
      const expectedRoom = (event as CustomEvent<{ roomId?: unknown }>).detail?.roomId;
      const environmentBindingId = (event as CustomEvent<{ environmentBindingId?: unknown }>).detail?.environmentBindingId;
      if (environmentBindingId !== undefined &&
          (typeof environmentBindingId !== "string" || !environmentBindingId.trim() || expectedRoom === undefined)) return;
      if (expectedRoom !== undefined && (typeof expectedRoom !== "string" || !expectedRoom.trim())) return;
      const report = (event as CustomEvent<{ onResult?: unknown }>).detail?.onResult;
      const signal = (event as CustomEvent<{ signal?: AbortSignal }>).detail?.signal;
      if (signal?.aborted) return;
      const forceRead = (event as CustomEvent<{ refresh?: boolean }>).detail?.refresh === true;
      const abortRead = () => read.abort();
      const reportResult = (opened: boolean) => {
        signal?.removeEventListener("abort", abortRead);
        if (typeof report === "function") report(opened);
      };
      if (expectedRoom === room?.room_id && room?.status === "closed") return;
      navigationRead.current?.abort();
      const read = new AbortController();
      signal?.addEventListener("abort", abortRead, { once: true });
      navigationRead.current = read;
      // An exact navigation request may check whether this controller handled
      // it. Opening an owned room is an authenticated read, never a join or
      // consent change. Keep another displayed room hidden during recovery.
      if (expectedRoom !== undefined) event.preventDefault();
      setNavigationTarget(typeof environmentBindingId === "string" ? { environmentBindingId } : null);
      setNavigationRoomId(typeof expectedRoom === "string" ? expectedRoom : null);
      if (typeof expectedRoom === "string" && (forceRead || room?.room_id !== expectedRoom)) {
        setDialogOpen(false);
        void controller.openRoom(expectedRoom, read.signal).then(opened => {
          if (read.signal.aborted) return;
          setDialogOpen(opened);
          reportResult(opened);
        }).catch(() => { if (!read.signal.aborted) reportResult(false); });
        return;
      }
      setDialogOpen(true);
      reportResult(true);
    };
    window.addEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, openDialog);
    return () => window.removeEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, openDialog);
  }, [room?.room_id, room?.status, controller.openRoom]);

  useEffect(() => {
    onActiveRoomChange?.(room?.status === "closed" ? null : room?.room_id ?? null);
    return () => onActiveRoomChange?.(null);
  }, [onActiveRoomChange, room?.room_id, room?.status]);

  useEffect(() => {
    onSharedTransportChange?.(sharedTransportBound);
    return () => onSharedTransportChange?.(false);
  }, [onSharedTransportChange, sharedTransportBound]);

  useEffect(() => {
    if (sharedTransportBound) hostTransportSeenRef.current = true;
    const hostTransportConsentValid = Boolean(
      controller.selfParticipant?.consent.microphone_to_model &&
      controller.selfParticipant?.consent.model_audio_output,
    );
    const invalidRuntimeState =
      room?.runtime.state === "degraded" ||
      room?.runtime.state === "stopping" ||
      room?.runtime.state === "closed" ||
      room?.runtime.state === "error";
    const shouldInvalidate = hostTransportSeenRef.current && (
      !hostTransportConsentValid || invalidRuntimeState
    );
    if (!shouldInvalidate) {
      hostInvalidationHandledRef.current = false;
      return;
    }
    if (hostInvalidationHandledRef.current) return;
    hostInvalidationHandledRef.current = true;
    hostTransportSeenRef.current = false;
    onHostTransportInvalidated?.();
  }, [
    controller.selfParticipant?.consent.microphone_to_model,
    controller.selfParticipant?.consent.model_audio_output,
    onHostTransportInvalidated,
    room?.runtime.state,
    sharedTransportBound,
  ]);

  const closeDialog = useCallback((): void => {
    setDialogOpen(false);
    window.setTimeout(() => triggerButtonRef.current?.focus(), 0);
  }, []);

  return (
    <>
      <button
        data-helix-control-id="helix.ask.shared_live_room.open_dialog"
        data-helix-interaction-kind="navigate"
        data-helix-authority-state="blocked_pending_contract"
        ref={triggerButtonRef}
        type="button"
        data-helix-ask-action-item="true"
        data-shared-live-room-state={room?.status ?? "none"}
        aria-haspopup="dialog"
        aria-expanded={dialogOpen}
        aria-label="Open Party Chat"
        title={roomTrigger.title}
        className={`inline-flex h-10 shrink-0 snap-center items-center gap-2 rounded-full border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-200/70 ${
          room
            ? "border-fuchsia-300/50 bg-fuchsia-400/15 text-fuchsia-100 hover:bg-fuchsia-400/20"
            : "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
        }`}
        onClick={() => { navigationRead.current?.abort(); setNavigationRoomId(null); setNavigationTarget(null); setDialogOpen(true); }}
      >
        <Users className="h-4 w-4" />
        <span>{roomTrigger.label}</span>
      </button>

      <NativeRoomConnectionPanel fieldIdPrefix={titleId} draftStore={roomDraftStore}
        realtimeSessionId={realtimeSessionId} runtimeActive={runtimeActive}
        portalTarget={nativeRoomPortalTarget}
        onHostedRoomTextOwnerChange={onHostedRoomTextOwnerChange}
        onDiscordVoiceRenewalRequest={onDiscordVoiceRenewalRequest}
        onOpenRoomConsole={onSelectHostedRoomChannel ? () => {
          closeDialog(); onSelectHostedRoomChannel();
        } : undefined}
        onOpenRoomMissionConsole={onSelectHostedRoomMission ? () => {
          closeDialog(); onSelectHostedRoomMission();
        } : undefined} />

      {room ? <LocalRoomTextOwnerBridge room={room} draftStore={roomDraftStore}
        onChange={onRoomTextOwnerChange} onMissionProcessed={onMissionProcessed}>{conversation => dialogOpen &&
        (!navigationRoomId || room.room_id === navigationRoomId) ? (
        <SharedLiveRoomDialog
          room={room}
          controller={controller}
          titleId={titleId}
          descriptionId={descriptionId}
          onClose={closeDialog}
          navigationTarget={navigationTarget}
          onVisualSourceCaptureRequested={onVisualSourceCaptureRequested}
          onHostTransportInvalidated={onHostTransportInvalidated}
          onOwnerRoomClosed={onOwnerRoomClosed}
          draftStore={roomDraftStore}
          roomTextConversation={conversation}
          onOpenRoomConsole={onSelectRoomChannel ? () => {
            closeDialog(); onSelectRoomChannel();
          } : undefined}
          onOpenMissionConsole={onSelectRoomMission && conversation.admitted ? () => {
            closeDialog(); onSelectRoomMission();
          } : undefined}
          nativeRoomPortal
          onNativeRoomPortalTargetChange={setNativeRoomPortalTarget}
        />
      ) : null}</LocalRoomTextOwnerBridge> : dialogOpen ? (
        <SharedLiveRoomDialog
          room={null}
          controller={controller}
          titleId={titleId}
          descriptionId={descriptionId}
          onClose={closeDialog}
          navigationTarget={navigationTarget}
          onVisualSourceCaptureRequested={onVisualSourceCaptureRequested}
          onHostTransportInvalidated={onHostTransportInvalidated}
          onOwnerRoomClosed={onOwnerRoomClosed}
          draftStore={roomDraftStore}
          nativeRoomPortal
          onNativeRoomPortalTargetChange={setNativeRoomPortalTarget}
        />
      ) : null}
    </>
  );
}
