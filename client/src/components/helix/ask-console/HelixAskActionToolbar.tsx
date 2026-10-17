import React, {
  type ChangeEventHandler,
  type ReactNode,
  type Ref,
} from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Image as ImageIcon,
  Mic,
  MonitorUp,
  Plus,
  RotateCcw,
} from "lucide-react";

export type HelixAskVisualSourceKind = "screen" | "camera";

export type HelixAskActionToolbarProps = {
  carouselRef?: Ref<HTMLDivElement>;
  carouselTrackRef?: Ref<HTMLDivElement>;
  imageInputRef?: Ref<HTMLInputElement>;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  onScrollLeft: () => void;
  onScrollRight: () => void;
  onImageSelect: ChangeEventHandler<HTMLInputElement>;
  onAttachImage: () => void;
  attachDisabled?: boolean;
  personalInputDisabled?: boolean;
  hasReadyAttachment?: boolean;
  hasAnyAttachment?: boolean;
  micEnabled: boolean;
  showMicButton?: boolean;
  micInputMode?: "voice_lane" | "live_runtime";
  micDisabled?: boolean;
  voiceTranscribing?: boolean;
  onToggleMic: () => void;
  showRetryVoiceSample?: boolean;
  retryVoiceSampleDisabled?: boolean;
  onRetryVoiceSample: () => void;
  showVisualCaptureControls?: boolean;
  visualSourceKind?: HelixAskVisualSourceKind;
  visualSourceSelectionDisabled?: boolean;
  onToggleVisualSourceKind?: () => void;
  visualSituationSourceStatus:
    "idle" | "active" | "requesting" | "error" | string;
  onCaptureVisualSource: () => void;
  visualSituationIncludeAudio: boolean;
  displayAudioStatus?: "idle" | "active" | "requesting" | "error" | string;
  visualAudioToggleDisabled?: boolean;
  onToggleVisualAudio: () => void;
  runtimePicker: ReactNode;
  liveRuntimeControls?: ReactNode;
  submitButton: ReactNode;
};

function readAttachButtonClassName(args: {
  hasReadyAttachment?: boolean;
  hasAnyAttachment?: boolean;
}): string {
  if (args.hasReadyAttachment) {
    return "border-violet-300/50 bg-violet-400/15 text-violet-100 hover:bg-violet-400/20";
  }
  if (args.hasAnyAttachment) {
    return "border-amber-300/45 bg-amber-400/12 text-amber-100 hover:bg-amber-400/20";
  }
  return "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10";
}

function readMicButtonClassName(args: {
  micEnabled: boolean;
  voiceTranscribing?: boolean;
}): string {
  if (!args.micEnabled)
    return "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10";
  if (args.voiceTranscribing)
    return "border-cyan-300/45 bg-cyan-400/12 text-cyan-100";
  return "border-emerald-300/55 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20";
}

function readVisualSourceButtonClassName(status: string): string {
  if (status === "active")
    return "border-cyan-300/50 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/20";
  if (status === "requesting")
    return "border-amber-300/45 bg-amber-400/12 text-amber-100";
  if (status === "error")
    return "border-rose-300/45 bg-rose-400/12 text-rose-100 hover:bg-rose-400/20";
  return "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10";
}

function readVisualAudioButtonClassName(args: {
  visualSituationIncludeAudio: boolean;
  displayAudioStatus?: string;
}): string {
  if (!args.visualSituationIncludeAudio)
    return "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10";
  if (args.displayAudioStatus === "error")
    return "border-rose-300/45 bg-rose-400/12 text-rose-100 hover:bg-rose-400/20";
  return "border-teal-300/50 bg-teal-400/15 text-teal-100 hover:bg-teal-400/20";
}

const actionButtonBaseClassName =
  "inline-flex h-10 w-10 shrink-0 snap-center items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:opacity-60";

export function HelixAskActionToolbar({
  carouselRef,
  carouselTrackRef,
  imageInputRef,
  canScrollLeft,
  canScrollRight,
  onScrollLeft,
  onScrollRight,
  onImageSelect,
  onAttachImage,
  attachDisabled = false,
  personalInputDisabled = false,
  hasReadyAttachment = false,
  hasAnyAttachment = false,
  micEnabled,
  showMicButton = true,
  micInputMode = "voice_lane",
  micDisabled = false,
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
  runtimePicker,
  liveRuntimeControls = null,
  submitButton,
}: HelixAskActionToolbarProps) {
  const micTitle =
    micInputMode === "live_runtime"
      ? micEnabled
        ? "Disable Live Voice microphone"
        : "Enable Live Voice microphone"
      : micEnabled
        ? "Disable microphone"
        : "Enable microphone";
  const visualAudioTitle = visualSituationIncludeAudio
    ? "Disable tab audio for visual capture"
    : "Enable tab audio for visual capture";
  const visualSourceLabel = visualSourceKind === "camera" ? "Camera" : "Screen";
  const nextVisualSourceLabel =
    visualSourceKind === "camera" ? "screen" : "camera";
  const visualCaptureAriaLabel = visualSituationSourceStatus === "requesting"
    ? `Cancel ${visualSourceLabel.toLowerCase()} sharing request`
    : visualSituationSourceStatus === "active"
      ? `Stop ${visualSourceLabel.toLowerCase()} sharing`
      : visualSituationSourceStatus === "error"
        ? `Retry ${visualSourceLabel.toLowerCase()} sharing`
        : `Start ${visualSourceLabel.toLowerCase()} sharing`;
  const visualCaptureTitle = visualSituationSourceStatus === "requesting"
    ? visualCaptureAriaLabel
    : `${visualCaptureAriaLabel} with automatic 10-second captures`;

  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-2">
      <div className="relative min-w-0 flex-1">
      <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-action-toolbar.scroll-ask-controls-left"
        type="button"
        aria-label="Scroll Ask controls left"
        className={`absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-center rounded-l-full bg-gradient-to-r from-slate-950/95 via-slate-950/50 to-transparent text-cyan-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
          canScrollLeft ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onScrollLeft}
        disabled={!canScrollLeft}
      >
        <ChevronLeft
          aria-hidden="true"
          className="h-5 w-5 drop-shadow-[0_0_5px_rgba(103,232,249,0.65)]"
        />
      </button>
      <div
        ref={carouselRef}
        data-testid="helix-ask-action-carousel-viewport"
        className="w-full min-w-0 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          ref={carouselTrackRef}
          data-testid="helix-ask-action-carousel-track"
          className="flex w-max min-w-full items-center justify-end gap-2 px-12"
        >
          <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-action-toolbar.input"
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onImageSelect}
          />
          {liveRuntimeControls}
          {runtimePicker}
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-action-toolbar.attach-image"
            type="button"
            data-helix-ask-action-item="true"
            aria-label="Attach image"
            title={personalInputDisabled ? "Image attachments are available in Ask Helix" : "Attach image"}
            className={`${actionButtonBaseClassName} ${readAttachButtonClassName(
              {
                hasReadyAttachment,
                hasAnyAttachment,
              },
            )}`}
            onClick={onAttachImage}
            disabled={attachDisabled || personalInputDisabled}
          >
            <Plus className="h-4 w-4" />
          </button>
          {showMicButton ? (
            <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-action-toolbar.on-toggle-mic"
              type="button"
              data-helix-ask-action-item="true"
              aria-label={micTitle}
              aria-pressed={micEnabled}
              title={personalInputDisabled && !micEnabled ? "Ask microphone is available in Ask Helix" : micTitle}
              data-microphone-owner={micInputMode}
              className={`${actionButtonBaseClassName} ${readMicButtonClassName(
                {
                  micEnabled,
                  voiceTranscribing,
                },
              )}`}
              onClick={onToggleMic}
              disabled={micDisabled || (personalInputDisabled && !micEnabled)}
            >
              <Mic
                className={`h-4 w-4 ${micEnabled || voiceTranscribing ? "animate-pulse" : ""}`}
              />
            </button>
          ) : null}
          {showRetryVoiceSample ? (
            <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-action-toolbar.retry-saved-voice-sample"
              type="button"
              data-helix-ask-action-item="true"
              aria-label="Retry saved voice sample"
              title={personalInputDisabled ? "Voice sample retry is available in Ask Helix" : "Retry saved voice sample"}
              className="inline-flex h-10 w-10 shrink-0 snap-center items-center justify-center rounded-full border border-amber-300/45 bg-amber-400/12 text-amber-100 transition hover:bg-amber-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 disabled:opacity-60"
              onClick={onRetryVoiceSample}
              disabled={retryVoiceSampleDisabled || personalInputDisabled}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          ) : null}
          {showVisualCaptureControls ? (
            <>
              <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-action-toolbar.on-toggle-visual-source-kind"
                type="button"
                data-helix-ask-action-item="true"
                data-visual-source-kind={visualSourceKind}
                aria-label={`Visual source: ${visualSourceLabel}. Switch to ${nextVisualSourceLabel}`}
                title={personalInputDisabled ? "Visual source selection is available in Ask Helix" : `Visual source: ${visualSourceLabel}. Switch to ${nextVisualSourceLabel}`}
                className="inline-flex h-10 shrink-0 snap-center items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-sm font-medium text-slate-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:opacity-60"
                onClick={onToggleVisualSourceKind}
                disabled={
                  personalInputDisabled || visualSourceSelectionDisabled ||
                  visualSituationSourceStatus === "active" ||
                  visualSituationSourceStatus === "requesting" ||
                  !onToggleVisualSourceKind
                }
              >
                {visualSourceKind === "camera" ? (
                  <Camera className="h-4 w-4" />
                ) : (
                  <MonitorUp className="h-4 w-4" />
                )}
                <span>{visualSourceLabel}</span>
              </button>
              <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-action-toolbar.on-capture-visual-source"
                type="button"
                data-helix-ask-action-item="true"
                aria-label={visualCaptureAriaLabel}
                aria-pressed={visualSituationSourceStatus === "active"}
                title={personalInputDisabled && visualSituationSourceStatus !== "active" && visualSituationSourceStatus !== "requesting" ? "Visual capture is available in Ask Helix" : visualCaptureTitle}
                className={`${actionButtonBaseClassName} ${readVisualSourceButtonClassName(visualSituationSourceStatus)}`}
                onClick={onCaptureVisualSource}
                disabled={personalInputDisabled && visualSituationSourceStatus !== "active" && visualSituationSourceStatus !== "requesting"}
              >
                <ImageIcon
                  className={`h-4 w-4 ${visualSituationSourceStatus === "active" ? "animate-pulse" : ""}`}
                />
              </button>
              {visualSourceKind === "screen" ? (
                <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-action-toolbar.on-toggle-visual-audio"
                  type="button"
                  data-helix-ask-action-item="true"
                  aria-label={visualAudioTitle}
                  aria-pressed={visualSituationIncludeAudio}
                  title={personalInputDisabled && !visualSituationIncludeAudio ? "Capture audio is available in Ask Helix" : visualAudioTitle}
                  className={`${actionButtonBaseClassName} ${readVisualAudioButtonClassName(
                    {
                      visualSituationIncludeAudio,
                      displayAudioStatus,
                    },
                  )}`}
                  onClick={onToggleVisualAudio}
                  disabled={visualAudioToggleDisabled || (personalInputDisabled && !visualSituationIncludeAudio)}
                >
                  <Headphones
                    className={`h-4 w-4 ${
                      visualSituationIncludeAudio &&
                      displayAudioStatus !== "error"
                        ? "animate-pulse"
                        : ""
                    }`}
                  />
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-action-toolbar.scroll-ask-controls-right"
        type="button"
        aria-label="Scroll Ask controls right"
        className={`absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-center rounded-r-full bg-gradient-to-l from-slate-950/95 via-slate-950/50 to-transparent text-cyan-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
          canScrollRight ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onScrollRight}
        disabled={!canScrollRight}
      >
        <ChevronRight
          aria-hidden="true"
          className="h-5 w-5 drop-shadow-[0_0_5px_rgba(103,232,249,0.65)]"
        />
      </button>
      </div>
      <div className="relative z-20 shrink-0">{submitButton}</div>
    </div>
  );
}
