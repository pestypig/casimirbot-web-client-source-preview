"use client";
import * as React from "react";
import { LumaEmotionBadge } from "./LumaEmotionBadge";
import { LUMA_MOOD_ORDER, type LumaMood } from "@/lib/luma-moods";
import { subscribe, unsubscribe } from "@/lib/luma-bus";

export default function BackgroundLumaPNG({
  src = "/luma/Luma_29.png",
  opacity = 0.18,
  blurPx = 6,
  mood: moodProp = null,
  listenToMoodBus = true,
}: { src?: string; opacity?: number; blurPx?: number; mood?: LumaMood | null; listenToMoodBus?: boolean }) {
  const [mood, setMood] = React.useState<LumaMood | null>(moodProp ?? null);

  React.useEffect(() => {
    setMood(moodProp ?? null);
  }, [moodProp]);

  React.useEffect(() => {
    if (!listenToMoodBus) return;
    const id = subscribe("luma:mood", (payload: any) => {
      const next = (payload?.mood ?? payload) as LumaMood | null;
      if (typeof next === "string" && LUMA_MOOD_ORDER.includes(next as LumaMood)) {
        setMood(next as LumaMood);
        return;
      }
      setMood(null);
    });
    return () => {
      if (id) unsubscribe(id);
      return undefined as void;
    };
  }, [listenToMoodBus]);

  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 0, opacity, filter: `blur(${blurPx}px)` }}
    >
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-luma-float"
        style={{ width: "60vmin", maxWidth: 900 }}
      >
        <div className="relative inline-block">
          <img
            src={src}
            alt="Luma"
            className="block w-full"
            style={{ opacity: 0.8 }}
            onError={(e) => {
              console.warn("Luma PNG fallback not found:", src);
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
            onLoad={() => {
              console.log("Luma PNG fallback loaded successfully");
            }}
          />
          <LumaEmotionBadge mood={mood} />
        </div>
      </div>
      <style>{`
        @keyframes luma-float {
          0%{transform:translate(-50%,-50%) translateY(0) rotate(0) scale(1)}
          50%{transform:translate(-50%,-50%) translateY(-12px) rotate(1.5deg) scale(1.02)}
          100%{transform:translate(-50%,-50%) translateY(0) rotate(0) scale(1)}
        }
        .animate-luma-float{animation:luma-float 8s ease-in-out infinite}
      `}</style>
    </div>
  );
}
