import { cn } from "@/lib/utils";
import {
  getSpeakerChipClassName,
  type HelixSpeakerLabel,
  type HelixSpeakerSegment,
} from "@/lib/helix/audio-identity";

type SpeakerTranscriptChipProps = {
  speaker: HelixSpeakerLabel;
  segment?: HelixSpeakerSegment | null;
  text?: string | null;
  className?: string;
};

export function SpeakerTranscriptChip({
  speaker,
  segment,
  text,
  className,
}: SpeakerTranscriptChipProps) {
  const transcript = text ?? segment?.text ?? "";

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-start gap-2 rounded border px-2 py-1 text-xs leading-5",
        getSpeakerChipClassName(speaker.color_token),
        className,
      )}
      title={speaker.display_name}
    >
      <span className="shrink-0 font-semibold">[{speaker.display_name}]</span>
      {transcript ? <span className="min-w-0 break-words text-current/90">{transcript}</span> : null}
    </span>
  );
}
