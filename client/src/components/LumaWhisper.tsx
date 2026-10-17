"use client";

// components/LumaWhisper.tsx
import * as React from "react";
import { LumaEmotionBadge } from "./LumaEmotionBadge";
import type { LumaMood } from "@/lib/luma-moods";

type WhisperPhase = "typing" | "idle" | "fading";

export function LumaWhisper({
  icon = "/luma/Luma_29.png",
  text,
  onDone,
  msPerChar = 18,
  stayMs = 2200,
  fadeMs = 320,
  mood = null,
}: {
  icon?: string;
  text: string;
  onDone?: () => void;
  msPerChar?: number;
  stayMs?: number;
  fadeMs?: number;
  mood?: LumaMood | null;
}) {
  const [shown, setShown] = React.useState("");
  const [phase, setPhase] = React.useState<WhisperPhase>("typing");

  React.useEffect(() => {
    setShown("");
    setPhase("typing");

    if (text.length === 0) {
      setPhase("fading");
      return;
    }

    let index = 0;
    const typeId = window.setInterval(() => {
      index += 1;
      setShown(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(typeId);
        setPhase("idle");
      }
    }, msPerChar);

    return () => {
      window.clearInterval(typeId);
    };
  }, [text, msPerChar]);

  React.useEffect(() => {
    if (phase !== "idle") return;
    const idleId = window.setTimeout(() => setPhase("fading"), stayMs);
    return () => window.clearTimeout(idleId);
  }, [phase, stayMs]);

  React.useEffect(() => {
    if (phase !== "fading") return;
    const fadeId = window.setTimeout(() => onDone?.(), fadeMs);
    return () => window.clearTimeout(fadeId);
  }, [phase, fadeMs, onDone]);

  const caretVisible = phase !== "fading";

  return (
    <div
      className={`fixed bottom-5 right-5 pointer-events-none flex items-center gap-3 px-3 py-2 rounded-2xl border bg-slate-950/85 border-slate-700 backdrop-blur shadow-lg transition-opacity duration-300 ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
      style={{ zIndex: 200001 }}
    >
      <div className="relative h-10 w-10 shrink-0">
        <img
          src={icon}
          alt="Luma"
          className="h-10 w-10 drop-shadow"
          onError={(event) => {
            console.warn("Luma icon not found:", icon);
            (event.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <LumaEmotionBadge mood={mood} sizePx={22} offsetPx={{ x: 6, y: -6 }} />
      </div>
      <p className="text-sm text-slate-100 leading-snug font-mono" aria-live="polite">
        {shown}
        <span className={`ml-[1px] inline-block w-[8px] ${caretVisible ? "animate-pulse" : ""}`}>▌</span>
      </p>
    </div>
  );
}

