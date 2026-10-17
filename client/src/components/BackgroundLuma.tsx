"use client";
import * as React from "react";
import { LumaEmotionBadge } from "./LumaEmotionBadge";
import { LUMA_MOOD_ORDER, type LumaMood } from "@/lib/luma-moods";
import { subscribe, unsubscribe } from "@/lib/luma-bus";

// Background stars component
function BackgroundStars() {
  return (
    <div className="absolute inset-0">
      {Array.from({ length: 50 }).map((_, i) => (
        <div
          key={i}
          className="absolute h-1 w-1 rounded-full bg-white opacity-60 animate-pulse"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 2}s`,
            animationDuration: `${2 + Math.random() * 3}s`,
          }}
        />
      ))}
    </div>
  );
}

export function BackgroundLuma({
  opacity = 0.18,
  blurPx = 6,
  mood: moodProp = null,
  listenToMoodBus = true,
}: { opacity?: number; blurPx?: number; mood?: LumaMood | null; listenToMoodBus?: boolean }) {
  const paused = false;
  const [visPaused, setVisPaused] = React.useState(false);
  const [mood, setMood] = React.useState<LumaMood | null>(moodProp ?? null);

  React.useEffect(() => {
    const h = () => setVisPaused(document.hidden);
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);

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

  const animation = paused || visPaused ? "none" : "luma-float 8s ease-in-out infinite";

  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 0, filter: `blur(${blurPx}px)`, opacity }}
    >
      {/* inline radial gradient instead of 'bg-gradient-radial' */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(40% 35% at 50% 40%, rgba(255,200,120,0.14), rgba(255,160,80,0.08) 40%, rgba(0,0,0,0) 70%)",
        }}
      >
        {/* stars (cheap DOM dots are fine) */}
        <div className="absolute inset-0">
          {Array.from({ length: 60 }).map((_, i) => (
            <div
              key={i}
              className="absolute h-[3px] w-[3px] rounded-full bg-white/70"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                opacity: 0.5 + Math.random() * 0.5,
              }}
            />
          ))}
        </div>

        {/* Luma PNG — make it large enough to read under blur */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: "60vmin", maxWidth: 900, animation }}
        >
          <div className="relative inline-block">
            <img
              src="/luma/Luma_29.png"
              alt="Luma Guardian"
              className="block w-full"
              style={{
                opacity: 0.85,
                filter: "brightness(1.08) contrast(0.9)",
              }}
              onError={(e) => {
                console.warn("Luma PNG not found:", "/luma/Luma_29.png");
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
              onLoad={() => {
                console.log("Luma PNG loaded successfully");
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
        `}</style>
      </div>
    </div>
  );
}
