import React from "react";

export type HelixAskSituationRoomSourcePanelProps = {
  visible: boolean;
  label: string;
  status: string;
  sourceCount: number;
  visualError?: string | null;
  audioError?: string | null;
  visualSourceActive?: boolean;
  transcriptPreview?: string | null;
  displayAudioActive?: boolean;
  onStopDisplayAudio: () => void;
  clipText: (text: string, limit: number) => string;
};

export function HelixAskSituationRoomSourcePanel({
  visible,
  label,
  status,
  sourceCount,
  visualError,
  audioError,
  visualSourceActive = false,
  transcriptPreview,
  displayAudioActive = false,
  onStopDisplayAudio,
  clipText,
}: HelixAskSituationRoomSourcePanelProps) {
  if (!visible) return null;

  return (
    <div className="-mt-1 px-4 pb-2 text-[11px]">
      <div className="rounded-lg border border-cyan-300/25 bg-cyan-500/10 px-2.5 py-2 text-cyan-50/95">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.16em] text-cyan-100/90">
              Situation Room Source
            </p>
            <p className="mt-1 truncate text-[11px] text-cyan-50">
              {label} / {status}
            </p>
          </div>
          <span className="shrink-0 rounded border border-cyan-300/35 bg-black/20 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-cyan-100">
            {sourceCount} source{sourceCount === 1 ? "" : "s"}
          </span>
        </div>
        {visualError ? (
          <p className="mt-1 whitespace-pre-wrap break-words text-[10px] text-rose-100">
            {visualError}
          </p>
        ) : audioError ? (
          <p className="mt-1 whitespace-pre-wrap break-words text-[10px] text-rose-100">
            {audioError}
          </p>
        ) : visualSourceActive ? (
          <p className="mt-1 text-[10px] text-cyan-100/70">
            Visual frame captured as compact evidence. Open Live Answer to capture another frame or inspect source fidelity.
          </p>
        ) : transcriptPreview ? (
          <p className="mt-1 whitespace-pre-wrap break-words text-[10px] text-cyan-100/85">
            {clipText(transcriptPreview, 360)}
          </p>
        ) : (
          <p className="mt-1 text-[10px] text-cyan-100/70">
            Awaiting transcript chunks.
          </p>
        )}
        {displayAudioActive ? (
          <div className="mt-2">
            <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-situation-room-source-panel.stop-source"
              type="button"
              className="inline-flex items-center rounded-md border border-cyan-300/40 bg-cyan-500/15 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-500/25"
              onClick={onStopDisplayAudio}
            >
              Stop source
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
