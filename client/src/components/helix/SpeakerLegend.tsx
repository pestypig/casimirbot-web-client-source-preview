import { cn } from "@/lib/utils";
import {
  getSpeakerDotClassName,
  labelForSpeakerAuthority,
  type HelixSpeakerLabel,
} from "@/lib/helix/audio-identity";

type SpeakerLegendProps = {
  speakers: HelixSpeakerLabel[];
  className?: string;
};

export function SpeakerLegend({ speakers, className }: SpeakerLegendProps) {
  if (speakers.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-xs text-muted-foreground", className)}>
      {speakers.map((speaker: HelixSpeakerLabel) => (
        <div
          key={speaker.speaker_id}
          className="inline-flex h-7 items-center gap-2 rounded border border-border/70 bg-background/70 px-2"
          title={`${speaker.display_name}: ${labelForSpeakerAuthority(speaker.authority)}`}
        >
          <span
            className={cn("h-2.5 w-2.5 rounded-full", getSpeakerDotClassName(speaker.color_token))}
            aria-hidden="true"
          />
          <span className="font-medium text-foreground">{speaker.display_name}</span>
          <span>{labelForSpeakerAuthority(speaker.authority)}</span>
        </div>
      ))}
    </div>
  );
}
