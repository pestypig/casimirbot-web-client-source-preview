import React from "react";
import { BrainCircuit } from "lucide-react";

export type HelixAskMoodAvatarProps = {
  auraClassName: string;
  ringClassName: string;
  moodSrc?: string | null;
  moodLabel: string;
  onImageError: () => void;
};

export function HelixAskMoodAvatar({
  auraClassName,
  ringClassName,
  moodSrc,
  moodLabel,
  onImageError,
}: HelixAskMoodAvatarProps) {
  return (
    <div className={`flex h-12 w-12 items-center justify-center rounded-full border ${auraClassName}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-black/45 ring-1 ring-inset ${ringClassName}`}>
        {moodSrc ? (
          <img
            src={moodSrc}
            alt={`${moodLabel} mood`}
            className="h-9 w-9 object-contain"
            loading="lazy"
            onError={onImageError}
          />
        ) : (
          <BrainCircuit
            className="h-5 w-5 text-slate-100/90"
            strokeWidth={2.25}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
