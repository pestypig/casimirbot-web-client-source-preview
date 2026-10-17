import { ShieldAlert, ShieldCheck, ShieldQuestion, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  labelForSpeakerAuthority,
  type HelixSpeakerAuthority,
} from "@/lib/helix/audio-identity";

type SpeakerAuthorityBadgeProps = {
  authority: HelixSpeakerAuthority;
  className?: string;
};

export function SpeakerAuthorityBadge({ authority, className }: SpeakerAuthorityBadgeProps) {
  const Icon =
    authority === "command_allowed"
      ? ShieldCheck
      : authority === "command_confirm"
        ? ShieldQuestion
        : authority === "ignored"
          ? VolumeX
          : ShieldAlert;

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px] font-medium leading-none",
        authority === "command_allowed" && "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
        authority === "command_confirm" && "border-amber-400/40 bg-amber-400/10 text-amber-100",
        authority === "transcribe_only" && "border-slate-400/40 bg-slate-400/10 text-slate-100",
        authority === "ignored" && "border-zinc-500/50 bg-zinc-500/10 text-zinc-200",
        className,
      )}
      title={labelForSpeakerAuthority(authority)}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {labelForSpeakerAuthority(authority)}
    </span>
  );
}
