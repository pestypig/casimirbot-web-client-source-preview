"use client";
import * as React from "react";
import { createPortal } from "react-dom";

export default function LumaBackgroundPortal({ children }: { children: React.ReactNode }) {
  const elRef = React.useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = React.useState(false);

  if (!elRef.current) {
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.inset = "0";
    el.style.zIndex = "0";             // under your app (which can be z-10)
    el.style.pointerEvents = "none";   // never blocks interactions
    elRef.current = el;
  }

  React.useEffect(() => {
    document.body.appendChild(elRef.current!);
    setMounted(true);
    return () => { elRef.current && elRef.current.remove(); };
  }, []);

  return mounted ? createPortal(children, elRef.current!) : null;
}