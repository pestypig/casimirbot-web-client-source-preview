import type { SyntheticEvent } from "react";

export type HelixAskReasoningMedalPulseView = {
  token: string;
  label: string;
  assetPath: string;
  fading: boolean;
  broken: boolean;
};

export type HelixAskReasoningLatestMedalView = {
  label: string;
  reason: string;
};

export type HelixAskReasoningStatusMedalStripProps = {
  stanceBadgeClassName: string;
  stanceLabel: string;
  archetypeLabel: string;
  phaseLabel: string;
  certaintyLabel: string;
  medals: HelixAskReasoningMedalPulseView[];
  latestMedal?: HelixAskReasoningLatestMedalView | null;
  onMedalImageError?: (token: string, currentSrc: string | null) => void;
};

export function HelixAskReasoningStatusMedalStrip({
  stanceBadgeClassName,
  stanceLabel,
  archetypeLabel,
  phaseLabel,
  certaintyLabel,
  medals,
  latestMedal,
  onMedalImageError,
}: HelixAskReasoningStatusMedalStripProps) {
  return (
    <>
      <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap">
        <span className={`min-w-0 truncate text-[10px] uppercase tracking-[0.18em] ${stanceBadgeClassName}`}>
          {stanceLabel}
        </span>
        <span className="min-w-0 truncate text-[10px] uppercase tracking-[0.16em] text-slate-300/90">
          {archetypeLabel}
        </span>
        <span className="min-w-0 truncate text-[10px] uppercase tracking-[0.16em] text-slate-300/90">
          {phaseLabel}
        </span>
        <span className="min-w-0 truncate text-[10px] uppercase tracking-[0.16em] text-slate-300/90">
          {certaintyLabel}
        </span>
      </div>
      {medals.length > 0 ? (
        <div className="pointer-events-none mt-1 space-y-1 text-cyan-100/95">
          <div className="flex items-end gap-1.5">
            {medals.map((medal) => (
              <div
                key={medal.token}
                className="overflow-hidden transition-[width,opacity,transform] duration-700 ease-out"
                style={{
                  width: medal.fading ? 0 : 52,
                  opacity: medal.fading ? 0 : 1,
                  transform: medal.fading ? "scale(0.86)" : "scale(1)",
                }}
              >
                {!medal.broken ? (
                  <img
                    src={medal.assetPath}
                    alt={`${medal.label} medal`}
                    className="h-12 w-12 shrink-0 object-contain opacity-95 mix-blend-screen drop-shadow-[0_0_16px_rgba(34,211,238,0.5)]"
                    loading="lazy"
                    onError={(event: SyntheticEvent<HTMLImageElement>) => {
                      onMedalImageError?.(medal.token, event.currentTarget?.currentSrc?.trim() || null);
                    }}
                  />
                ) : (
                  <span className="inline-flex h-12 w-12 items-center justify-center text-[8px] uppercase tracking-[0.18em] text-cyan-100/90">
                    {medal.label}
                  </span>
                )}
              </div>
            ))}
          </div>
          {latestMedal ? (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[10px] uppercase tracking-[0.2em] text-cyan-200/90">
                {latestMedal.label}
              </p>
              <p className="truncate text-[10px] text-cyan-100/80">
                {latestMedal.reason}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
