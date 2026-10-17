import { useEffect, useState, useCallback } from "react";
import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";

type SlicePrefs = {
  exposure: number;     // 1..12
  sigmaRange: number;   // 2..12
  diffMode: boolean;
  showContours: boolean;
};

const KEY = "helix:slice-prefs:v1";

const defaults: SlicePrefs = {
  exposure: 6,
  sigmaRange: 6,
  diffMode: true,
  showContours: true,
};

function load(): SlicePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const obj = JSON.parse(raw);
    return {
      exposure: Number.isFinite(obj.exposure) ? obj.exposure : defaults.exposure,
      sigmaRange: Number.isFinite(obj.sigmaRange) ? obj.sigmaRange : defaults.sigmaRange,
      diffMode: typeof obj.diffMode === "boolean" ? obj.diffMode : defaults.diffMode,
      showContours: typeof obj.showContours === "boolean" ? obj.showContours : defaults.showContours,
    };
  } catch { return defaults; }
}

function save(p: SlicePrefs) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function useSlicePrefs() {
  const [prefs, setPrefs] = useState<SlicePrefs>(() => load());

  // save + broadcast whenever prefs change
  useEffect(() => {
    save(prefs);
    publish("slice:prefs", prefs); // lets Diagnostics or other panels react
  }, [prefs]);

  const update = useCallback(<K extends keyof SlicePrefs>(k: K, v: SlicePrefs[K]) => {
    setPrefs(prev => ({ ...prev, [k]: v }));
  }, []);

  return { prefs, update };
}

// Helper hook for other panels to subscribe to slice prefs
export function useSlicePrefsBus() {
  const [state, setState] = useState<SlicePrefs | null>(null);
  useEffect(() => {
    const handlerId = subscribe("slice:prefs", (p: SlicePrefs) => setState(p));
    return () => {
      if (handlerId) unsubscribe(handlerId);
    };
  }, []);
  return state;
}