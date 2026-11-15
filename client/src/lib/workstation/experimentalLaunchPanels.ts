import { useSyncExternalStore } from "react";

export const EXPERIMENTAL_LAUNCH_PANELS_CHANGED = "helix:experimental-launch-panels-changed";
export const EXPERIMENTAL_LAUNCH_PANELS_STORAGE_KEY = "casimirbot.experimentalLaunchPanels.v1";

// Launch visibility only. Panel and operation permissions remain independent.
export const EXPERIMENTAL_LAUNCH_PANEL_IDS = [
  "workflow-demo-lab", "tsn-sim", "tokamak-sim", "taskbar",
  "stellar-lsr", "star-coherence", "nav-system", "hull-status",
  "resonance-orchestra", "rag-ingest", "postulate-board", "remove-bg-edges",
  "operational-mode", "helix-luma", "helix-observables", "halobank",
  "gr-agent-loop-audit", "essence-proposals", "essence-prompt-panel", "dresscode",
  "direction-pad", "agi-debate-view", "constraint-pack-policy", "conformity-launch-rail",
  "agi-task-history",
] as const;
const experimentalPanelIds = new Set<string>(EXPERIMENTAL_LAUNCH_PANEL_IDS);

export function readExperimentalLaunchPanels(): boolean {
  try { return window.localStorage.getItem(EXPERIMENTAL_LAUNCH_PANELS_STORAGE_KEY) === "true"; }
  catch { return false; }
}

export function writeExperimentalLaunchPanels(enabled: boolean): void {
  try { window.localStorage.setItem(EXPERIMENTAL_LAUNCH_PANELS_STORAGE_KEY, String(enabled)); }
  catch { /* Storage can be unavailable in restricted browser profiles. */ }
  window.dispatchEvent(new Event(EXPERIMENTAL_LAUNCH_PANELS_CHANGED));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === EXPERIMENTAL_LAUNCH_PANELS_STORAGE_KEY) onChange();
  };
  window.addEventListener(EXPERIMENTAL_LAUNCH_PANELS_CHANGED, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EXPERIMENTAL_LAUNCH_PANELS_CHANGED, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useExperimentalLaunchPanels(): boolean {
  return useSyncExternalStore(subscribe, readExperimentalLaunchPanels, () => false);
}

export function isExperimentalLaunchPanelVisible(panelId: string, enabled: boolean): boolean {
  return enabled || !experimentalPanelIds.has(panelId);
}
