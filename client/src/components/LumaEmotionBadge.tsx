"use client";
import * as React from "react";
import { resolveMoodAsset, type LumaMood } from "@/lib/luma-moods";

type Props = {
  mood?: LumaMood | null;
  sizePx?: number;
  offsetPx?: { x: number; y: number };
  className?: string;
};

export function LumaEmotionBadge({
  mood,
  sizePx = 54,
  offsetPx = { x: 16, y: -18 },
  className,
}: Props) {
  const [hidden, setHidden] = React.useState(false);
  const [sourceIdx, setSourceIdx] = React.useState(0);
  const asset = resolveMoodAsset(mood);

  React.useEffect(() => {
    setHidden(false);
    setSourceIdx(0);
  }, [mood, asset?.label]);

  if (!asset || hidden) return null;

  const source = asset.sources[sourceIdx] ?? asset.sources[0];

  return (
    <div
      className={`pointer-events-none absolute drop-shadow-xl ${className ?? ""}`}
      style={{
        top: 0,
        right: 0,
        transform: `translate(${offsetPx.x}px, ${offsetPx.y}px)`,
        width: sizePx,
        height: sizePx,
      }}
      aria-label={`${asset.label} mood`}
    >
      <img
        src={source}
        alt={`${asset.label} mood`}
        className="block h-full w-full rounded-full bg-black/30 p-1 shadow-lg ring-2 ring-slate-900/60"
        loading="lazy"
        onError={() => {
          // Try next available source; if none, hide.
          if (asset.sources && sourceIdx < asset.sources.length - 1) {
            setSourceIdx((idx) => idx + 1);
            return;
          }
          setHidden(true);
        }}
      />
    </div>
  );
}
