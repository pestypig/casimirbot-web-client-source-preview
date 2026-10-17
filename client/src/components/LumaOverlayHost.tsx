// components/LumaOverlayHost.tsx
import * as React from "react";
import { LumaWhisper } from "./LumaWhisper";
import { subscribe, unsubscribe } from "@/lib/luma-bus";
import { publishMoodForWhisper } from "@/lib/luma-mood-spectrum";
import type { LumaMood } from "@/lib/luma-moods";

export function LumaOverlayHost() {
  const [msg, setMsg] = React.useState<{ text: string; mood: LumaMood | null } | null>(null);
  const pendingRef = React.useRef<{ text: string; mood: LumaMood | null } | null>(null);

  React.useEffect(() => {
    const id = subscribe("luma:whisper", (p: any) => {
      if (!p) return;
      const text = typeof p === "string" ? p : p.text ?? "";
      if (!text?.trim()) return;
      const moodHint = (typeof p === "object" && (p as any).mood) as LumaMood | null | undefined;
      const tags = (typeof p === "object" && Array.isArray((p as any).tags)) ? (p as any).tags as string[] : undefined;
      const classified = publishMoodForWhisper(text, { explicitMood: moodHint ?? null, tags });
      const next = { text, mood: moodHint ?? classified ?? null };
      setMsg((current) => {
        if (!current) return next;
        pendingRef.current = next;
        return current;
      });
    });
    return () => {
      unsubscribe(id);
      // explicit void return to satisfy EffectCallback
      return void 0;
    };
  }, []);

  const handleDone = React.useCallback(() => {
    if (pendingRef.current) {
      const next = pendingRef.current;
      pendingRef.current = null;
      setMsg(next);
      return;
    }
    setMsg(null);
  }, []);

  if (!msg) return null;

  return <LumaWhisper text={msg.text} mood={msg.mood} onDone={handleDone} />;
}
