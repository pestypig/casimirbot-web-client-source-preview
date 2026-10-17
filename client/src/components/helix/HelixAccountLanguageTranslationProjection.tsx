import * as React from "react";
import {
  buildHelixAccountLanguageTranslationDataAttributes,
  type HelixAccountLanguageTranslationProjectionState,
} from "@/lib/helix/account-language-translation-projection";
import { cn } from "@/lib/utils";

export type HelixAccountLanguageTranslationProjectionProps = {
  state: HelixAccountLanguageTranslationProjectionState;
  sourceText?: string | null;
  className?: string;
};

const statusClass: Record<HelixAccountLanguageTranslationProjectionState["status"], string> = {
  empty: "text-current",
  active: "rounded-[4px] bg-sky-950/30 px-1 text-sky-100 ring-1 ring-sky-500/30",
  pending: "rounded-[4px] bg-violet-950/30 px-1 text-violet-100 ring-1 ring-violet-500/30",
  ready: "rounded-[4px] bg-emerald-950/40 px-1 text-emerald-100 ring-1 ring-emerald-500/30",
  stale: "rounded-[4px] bg-amber-950/30 px-1 text-amber-100 ring-1 ring-amber-500/30",
  cancelled: "text-current opacity-75",
  failed: "rounded-[4px] bg-rose-950/30 px-1 text-rose-100 ring-1 ring-rose-500/30",
  blocked: "rounded-[4px] bg-slate-900/70 px-1 text-slate-200 ring-1 ring-slate-500/40",
};

const statusLabel: Record<HelixAccountLanguageTranslationProjectionState["status"], string> = {
  empty: "translation projection empty",
  active: "active translation projection",
  pending: "pending translation projection",
  ready: "translated account-language projection",
  stale: "stale translation projection",
  cancelled: "cancelled translation projection",
  failed: "failed translation projection",
  blocked: "blocked translation projection",
};

export function HelixAccountLanguageTranslationProjection({
  state,
  sourceText,
  className,
}: HelixAccountLanguageTranslationProjectionProps) {
  const translated = state.status === "ready" ? state.displayText : null;
  const fallbackText = typeof sourceText === "string" && sourceText.trim() ? sourceText : null;
  const text = translated ?? fallbackText;
  if (!text) return null;
  return (
    <span
      {...buildHelixAccountLanguageTranslationDataAttributes(state)}
      aria-label={statusLabel[state.status]}
      className={cn(
        "inline break-words align-baseline",
        statusClass[state.status],
        className,
      )}
    >
      {text}
    </span>
  );
}
