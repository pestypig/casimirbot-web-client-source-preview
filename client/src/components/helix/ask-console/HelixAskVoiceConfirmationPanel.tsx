import React from "react";

export type HelixAskVoiceCommandConfirmationPanelProps = {
  visible: boolean;
  actionLabel: string;
  transcript: string;
  countdownSec?: number | null;
  onAccept: () => void;
  onCancel: () => void;
  clipText: (text: string, limit: number) => string;
};

export function HelixAskVoiceCommandConfirmationPanel({
  visible,
  actionLabel,
  transcript,
  countdownSec = null,
  onAccept,
  onCancel,
  clipText,
}: HelixAskVoiceCommandConfirmationPanelProps) {
  if (!visible) return null;

  return (
    <div className="-mt-1 px-4 pb-2 text-[11px]">
      <div className="rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-2.5 py-2 text-cyan-50/95">
        <p className="text-[9px] uppercase tracking-[0.16em] text-cyan-100/90">Voice command</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-[11px]">
          Detected: {actionLabel}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-[10px] text-cyan-100/85">
          Heard: &quot;{clipText(transcript, 220)}&quot;
        </p>
        {countdownSec !== null ? (
          <p className="mt-1 text-[10px] text-cyan-100/90">
            Auto-confirming in {countdownSec}s. Say &quot;cancel&quot; to stop.
          </p>
        ) : null}
        <div className="mt-2 flex items-center gap-1.5">
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-voice-confirmation-panel.execute"
            type="button"
            className="inline-flex items-center rounded-md border border-cyan-300/40 bg-cyan-500/15 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-500/25"
            onClick={onAccept}
          >
            Execute
          </button>
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-voice-confirmation-panel.cancel"
            type="button"
            className="inline-flex items-center rounded-md border border-slate-300/35 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 transition hover:bg-black/35"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export type HelixAskTranscriptConfirmationPanelProps = {
  visible: boolean;
  transcript: string;
  sourceText?: string | null;
  sourceLanguage?: string | null;
  translationUncertain?: boolean;
  countdownSec?: number | null;
  onAccept: () => void;
  onRetry: () => void;
  clipText: (text: string, limit: number) => string;
};

export function HelixAskTranscriptConfirmationPanel({
  visible,
  transcript,
  sourceText = null,
  sourceLanguage = null,
  translationUncertain = false,
  countdownSec = null,
  onAccept,
  onRetry,
  clipText,
}: HelixAskTranscriptConfirmationPanelProps) {
  if (!visible) return null;

  const trimmedSourceText = sourceText?.trim() ?? "";
  const showSourceText =
    translationUncertain &&
    trimmedSourceText.length > 0 &&
    trimmedSourceText !== transcript.trim();

  return (
    <div className="-mt-1 px-4 pb-2 text-[11px]">
      <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-2.5 py-2 text-amber-50/95">
        <p className="text-[9px] uppercase tracking-[0.16em] text-amber-100/90">Confirm transcript</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-[11px]">
          Heard: &quot;{clipText(transcript, 320)}&quot;
        </p>
        {showSourceText ? (
          <p className="mt-1 whitespace-pre-wrap break-words text-[10px] text-amber-100/90">
            Source ({sourceLanguage ?? "unknown"}): &quot;{clipText(trimmedSourceText, 320)}&quot;
          </p>
        ) : null}
        {countdownSec !== null ? (
          <p className="mt-1 text-[10px] text-amber-100/90">
            Auto-confirming in {countdownSec}s. Say &quot;retry&quot; or &quot;cancel&quot; to stop.
          </p>
        ) : null}
        <div className="mt-2 flex items-center gap-1.5">
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-voice-confirmation-panel.confirm"
            type="button"
            className="inline-flex items-center rounded-md border border-emerald-300/40 bg-emerald-500/15 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-emerald-100 transition hover:bg-emerald-500/25"
            onClick={onAccept}
          >
            Confirm
          </button>
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-voice-confirmation-panel.retry"
            type="button"
            className="inline-flex items-center rounded-md border border-amber-300/35 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-amber-100 transition hover:bg-black/35"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
