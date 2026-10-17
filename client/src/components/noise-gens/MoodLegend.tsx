import type { MoodPreset } from "@/types/noise-gens";

type MoodLegendProps = {
  presets: MoodPreset[];
};

export function MoodLegend({ presets }: MoodLegendProps) {
  if (!presets.length) return null;
  return (
    <div className="rounded-3xl border border-border/60 bg-secondary/20 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Helix mood mapping
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Presets forward only the mood identifier. Helix Core maps each mood to style/sample/weirdness
        internally.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {presets.map((preset) => (
          <div
            key={preset.id}
            className="rounded-2xl border border-border/50 bg-background/60 p-3 text-xs"
          >
            <div className="font-semibold text-foreground">{preset.label}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-muted-foreground">
              <div>
                <div className="text-[10px] uppercase tracking-wide">Style</div>
                <div className="font-semibold text-foreground">{preset.style}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide">Sample</div>
                <div className="font-semibold text-foreground">{preset.sample}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide">Weird</div>
                <div className="font-semibold text-foreground">{preset.weird}</div>
              </div>
            </div>
            {preset.description ? (
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                {preset.description}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MoodLegend;
