import React from "react";

export type HelixAskDebugDrawerProps = {
  payload: string;
  payloadHash: string;
  readbackMatch: string;
  replyId: string;
  onClose: () => void;
};

export function HelixAskDebugDrawer({
  payload,
  payloadHash,
  readbackMatch,
  replyId,
  onClose,
}: HelixAskDebugDrawerProps) {
  return (
    <section
      className="relative z-0 mt-3 rounded-lg border border-cyan-300/30 bg-slate-950/95 p-3 text-xs text-slate-100"
      aria-label="Debug Export drawer"
      data-testid="helix-debug-export-drawer"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200">Debug Export</p>
          <p className="mt-1 text-[10px] text-slate-400">
            Clipboard readback: {readbackMatch} | hash {payloadHash}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`data:application/json;charset=utf-8,${encodeURIComponent(payload)}`}
            download={`helix-debug-${replyId}.json`}
            className="rounded border border-cyan-300/40 bg-cyan-400/15 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100"
          >
            Download JSON
          </a>
          <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-debug-drawer.close"
            type="button"
            onClick={onClose}
            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300"
          >
            Close
          </button>
        </div>
      </div>
      <textarea data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-debug-drawer.helix-debug-export-json"
        readOnly
        value={payload}
        className="mt-3 h-48 w-full resize-y rounded border border-slate-700 bg-black/40 p-2 font-mono text-[10px] leading-4 text-cyan-50"
        aria-label="Debug Export JSON"
        data-testid="helix-debug-export-json"
        onFocus={(event) => event.currentTarget.select()}
      />
    </section>
  );
}
