import React, {
  type ChangeEventHandler,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { HelixAgentRuntimeId } from "@shared/helix-agent-runtime";
import PrivateAskConnectionMenu from "./PrivateAskConnectionMenu";

import {
  HelixAskActionToolbar,
  type HelixAskVisualSourceKind,
} from "./HelixAskActionToolbar";
import {
  HelixAskComposerSubmitButton,
  type HelixAskComposerViewModel,
} from "./HelixAskComposer";
import {
  HelixAskRuntimePicker,
  type HelixAskRuntimePickerModel,
} from "./HelixAskRuntimePicker";
import {
  HelixAskLiveRuntimeControls,
  type HelixAskLiveRuntimeControlsModel,
  type HelixAskLiveRuntimeToolbarBridge,
} from "./HelixAskLiveRuntimeControls";
import {
  useHelixAskActionCarousel,
  type HelixAskActionCarouselDirection,
} from "./useHelixAskActionCarousel";
import type { LocalRoomTextOwnerSnapshot } from "./shared-live-room/LocalRoomTextOwnerBridge";
import type { HostedRoomTextOwnerSnapshot } from "./shared-live-room/NativeHostedRoomTextOwnerBridge";

export type HelixAskComposerActionToolbarSurfaceProps = {
  imageInputRef?: Ref<HTMLInputElement>;
  onCarouselScrollIntent?: (direction: HelixAskActionCarouselDirection) => void;
  onImageSelect: ChangeEventHandler<HTMLInputElement>;
  onAttachImage: () => void;
  attachDisabled?: boolean;
  hasReadyAttachment?: boolean;
  hasAnyAttachment?: boolean;
  micEnabled: boolean;
  voiceTranscribing?: boolean;
  onToggleMic: () => void;
  showRetryVoiceSample?: boolean;
  retryVoiceSampleDisabled?: boolean;
  onRetryVoiceSample: () => void;
  showVisualCaptureControls?: boolean;
  visualSourceKind?: HelixAskVisualSourceKind;
  visualSourceSelectionDisabled?: boolean;
  onToggleVisualSourceKind?: () => void;
  visualSituationSourceStatus: string;
  onCaptureVisualSource: () => void;
  visualSituationIncludeAudio: boolean;
  displayAudioStatus?: string;
  visualAudioToggleDisabled?: boolean;
  onToggleVisualAudio: () => void;
  runtimePickerModel: HelixAskRuntimePickerModel;
  runtimeMenuOpen: boolean;
  privateConnectionInspectorEnabled?: boolean;
  onSelectPrivateApiChat?: () => void;
  onRuntimePrimaryClick: () => void;
  onRuntimeSelect: (value: HelixAgentRuntimeId) => void;
  liveRuntimeControlsModel?: HelixAskLiveRuntimeControlsModel | null;
  onActiveSharedRoomChange?: (roomId: string | null) => void;
  onRoomTextOwnerChange?: (snapshot: LocalRoomTextOwnerSnapshot | null) => void;
  onSelectRoomChannel?: () => void;
  onSelectRoomMission?: () => void;
  onHostedRoomTextOwnerChange?: (snapshot: HostedRoomTextOwnerSnapshot | null) => void;
  onSelectHostedRoomChannel?: () => void;
  onSelectHostedRoomMission?: () => void;
  submitViewModel: HelixAskComposerViewModel;
  submitDisabled?: boolean;
  personalInputDisabled?: boolean;
  onSubmitIntent: () => void;
  onStop: () => void;
};

export function HelixAskComposerActionToolbarSurface({
  imageInputRef,
  onCarouselScrollIntent,
  onImageSelect,
  onAttachImage,
  attachDisabled = false,
  hasReadyAttachment = false,
  hasAnyAttachment = false,
  micEnabled,
  voiceTranscribing = false,
  onToggleMic,
  showRetryVoiceSample = false,
  retryVoiceSampleDisabled = false,
  onRetryVoiceSample,
  showVisualCaptureControls = true,
  visualSourceKind = "screen",
  visualSourceSelectionDisabled = false,
  onToggleVisualSourceKind,
  visualSituationSourceStatus,
  onCaptureVisualSource,
  visualSituationIncludeAudio,
  displayAudioStatus,
  visualAudioToggleDisabled = false,
  onToggleVisualAudio,
  runtimePickerModel,
  runtimeMenuOpen,
  privateConnectionInspectorEnabled = false,
  onSelectPrivateApiChat,
  onRuntimePrimaryClick,
  onRuntimeSelect,
  liveRuntimeControlsModel = null,
  onActiveSharedRoomChange,
  onRoomTextOwnerChange,
  onSelectRoomChannel,
  onSelectRoomMission,
  onHostedRoomTextOwnerChange,
  onSelectHostedRoomChannel,
  onSelectHostedRoomMission,
  submitViewModel,
  submitDisabled = false,
  personalInputDisabled = false,
  onSubmitIntent,
  onStop,
}: HelixAskComposerActionToolbarSurfaceProps) {
  const actionCarousel = useHelixAskActionCarousel({
    onScrollIntent: onCarouselScrollIntent,
  });
  const [liveRuntimeBridge, setLiveRuntimeBridge] =
    useState<HelixAskLiveRuntimeToolbarBridge | null>(null);
  const legacyMicDisableRequestedRef = useRef(false);
  const handleLiveRuntimeBridgeChange = useCallback(
    (bridge: HelixAskLiveRuntimeToolbarBridge | null) => {
      setLiveRuntimeBridge(bridge);
    },
    [],
  );
  const liveOwnsMicrophone = liveRuntimeBridge?.engaged === true;

  useEffect(() => {
    if (!liveOwnsMicrophone) {
      legacyMicDisableRequestedRef.current = false;
      return;
    }
    if (micEnabled && !legacyMicDisableRequestedRef.current) {
      legacyMicDisableRequestedRef.current = true;
      onToggleMic();
    }
  }, [liveOwnsMicrophone, micEnabled, onToggleMic]);

  const effectiveMicEnabled = liveOwnsMicrophone
    ? liveRuntimeBridge?.microphoneEnabled === true
    : micEnabled;
  const effectiveVoiceTranscribing = liveOwnsMicrophone
    ? false
    : voiceTranscribing;
  const effectiveToggleMic = liveOwnsMicrophone
    ? () => liveRuntimeBridge?.toggleMicrophone()
    : onToggleMic;
  const visualCaptureStarting =
    visualSituationSourceStatus !== "active" &&
    visualSituationSourceStatus !== "requesting";
  const ensureVisualSourceCapture = useCallback(() => {
    if (visualCaptureStarting) onCaptureVisualSource();
  }, [onCaptureVisualSource, visualCaptureStarting]);
  const handleVisualSourceCapture = useCallback(() => {
    if (liveRuntimeBridge?.active) {
      if (visualCaptureStarting && !liveRuntimeBridge.visualInputEnabled) {
        // The Live bridge invokes ensureVisualSourceCapture before granting
        // visual consent, so this explicit click starts exactly one producer.
        liveRuntimeBridge.toggleVisualInput();
        return;
      }
      if (!visualCaptureStarting && liveRuntimeBridge.visualInputEnabled) {
        liveRuntimeBridge.toggleVisualInput();
      }
    }
    onCaptureVisualSource();
  }, [liveRuntimeBridge, onCaptureVisualSource, visualCaptureStarting]);

  return (
    <HelixAskActionToolbar
      carouselRef={actionCarousel.viewportRef}
      carouselTrackRef={actionCarousel.trackRef}
      imageInputRef={imageInputRef}
      canScrollLeft={actionCarousel.canScrollLeft}
      canScrollRight={actionCarousel.canScrollRight}
      onScrollLeft={actionCarousel.onScrollLeft}
      onScrollRight={actionCarousel.onScrollRight}
      onImageSelect={onImageSelect}
      onAttachImage={onAttachImage}
      attachDisabled={attachDisabled}
      personalInputDisabled={personalInputDisabled}
      hasReadyAttachment={hasReadyAttachment}
      hasAnyAttachment={hasAnyAttachment}
      micEnabled={effectiveMicEnabled}
      showMicButton={!liveOwnsMicrophone}
      micInputMode={liveOwnsMicrophone ? "live_runtime" : "voice_lane"}
      micDisabled={
        liveOwnsMicrophone &&
        liveRuntimeBridge?.microphoneToggleDisabled !== false
      }
      voiceTranscribing={effectiveVoiceTranscribing}
      onToggleMic={effectiveToggleMic}
      showRetryVoiceSample={showRetryVoiceSample}
      retryVoiceSampleDisabled={retryVoiceSampleDisabled}
      onRetryVoiceSample={onRetryVoiceSample}
      showVisualCaptureControls={showVisualCaptureControls}
      visualSourceKind={visualSourceKind}
      visualSourceSelectionDisabled={visualSourceSelectionDisabled}
      onToggleVisualSourceKind={onToggleVisualSourceKind}
      visualSituationSourceStatus={visualSituationSourceStatus}
      onCaptureVisualSource={handleVisualSourceCapture}
      visualSituationIncludeAudio={visualSituationIncludeAudio}
      displayAudioStatus={displayAudioStatus}
      visualAudioToggleDisabled={visualAudioToggleDisabled}
      onToggleVisualAudio={onToggleVisualAudio}
      liveRuntimeControls={
        liveRuntimeControlsModel?.visible ? (
          <HelixAskLiveRuntimeControls
            model={liveRuntimeControlsModel}
            onToolbarBridgeChange={handleLiveRuntimeBridgeChange}
            onActiveSharedRoomChange={onActiveSharedRoomChange}
            onRoomTextOwnerChange={onRoomTextOwnerChange}
            onSelectRoomChannel={onSelectRoomChannel}
            onSelectRoomMission={onSelectRoomMission}
            onHostedRoomTextOwnerChange={onHostedRoomTextOwnerChange}
            onSelectHostedRoomChannel={onSelectHostedRoomChannel}
            onSelectHostedRoomMission={onSelectHostedRoomMission}
            onVisualInputEnableRequested={ensureVisualSourceCapture}
          />
        ) : null
      }
      runtimePicker={
        personalInputDisabled ? <span className="inline-flex h-10 items-center rounded-full border border-white/10 px-3 text-[11px] text-slate-400"
          title="Ask runtime selection is available in Ask Helix">Ask tools</span> :
        <><HelixAskRuntimePicker
          model={runtimePickerModel}
          menuOpen={runtimeMenuOpen}
          onPrimaryClick={onRuntimePrimaryClick}
          onSelect={onRuntimeSelect}
        /><PrivateAskConnectionMenu enabled={privateConnectionInspectorEnabled}
          scope={runtimePickerModel.selectedRuntime} onSelectPrivateApiChat={onSelectPrivateApiChat}/></>
      }
      submitButton={
        <HelixAskComposerSubmitButton
          viewModel={submitViewModel}
          disabled={submitDisabled}
          onSubmitIntent={onSubmitIntent}
          onStop={onStop}
        />
      }
    />
  );
}
