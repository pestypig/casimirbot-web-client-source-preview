import React from "react";

export type HelixAskRuntimeStatusLineProps = {
  text?: string | null;
};

export function HelixAskRuntimeStatusLine({ text }: HelixAskRuntimeStatusLineProps) {
  if (!text) return null;

  return (
    <p
      className="mt-3 text-[10px] uppercase tracking-[0.16em] text-cyan-100/80"
      data-testid="helix-ask-runtime-status-line"
    >
      {text}
    </p>
  );
}

export type HelixAskErrorLineProps = {
  message?: string | null;
};

export function HelixAskErrorLine({ message }: HelixAskErrorLineProps) {
  if (!message) return null;

  return <p className="mt-3 text-xs text-rose-200">{message}</p>;
}

export type HelixAskVoiceInputStatus = "listening" | "transcribing" | "cooldown" | "error";

export type HelixAskVoiceStatusPillProps = {
  label?: string | null;
  state: HelixAskVoiceInputStatus;
};

export function HelixAskVoiceStatusPill({ label, state }: HelixAskVoiceStatusPillProps) {
  if (!label) return null;

  const toneClass =
    state === "listening"
      ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-100"
      : state === "transcribing"
        ? "border-cyan-300/35 bg-cyan-400/10 text-cyan-100"
        : state === "cooldown"
          ? "border-indigo-300/35 bg-indigo-400/10 text-indigo-100"
          : "border-amber-300/35 bg-amber-400/10 text-amber-100";

  return (
    <div className="-mt-1 px-4 pb-2 text-[10px]">
      <div className={`inline-flex items-center rounded-full border px-2.5 py-1 uppercase tracking-[0.18em] ${toneClass}`}>
        {label}
      </div>
    </div>
  );
}

export type HelixAskContextMemoryStatusLineProps = {
  text?: string | null;
};

export function HelixAskContextMemoryStatusLine({ text }: HelixAskContextMemoryStatusLineProps) {
  if (!text) return null;

  return (
    <div className="-mt-1 px-4 pb-2 text-[9px] uppercase tracking-[0.14em] text-emerald-200/85">
      {text}
    </div>
  );
}
