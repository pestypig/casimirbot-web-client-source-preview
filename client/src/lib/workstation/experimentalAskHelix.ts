export const EXPERIMENTAL_ASK_HELIX_CHANGED = "helix:experimental-ask-helix-changed";
const STORAGE_KEY = "casimirbot.experimentalAskHelix.v1";

export function readExperimentalAskHelix(): boolean {
  try { return window.localStorage.getItem(STORAGE_KEY) === "true"; }
  catch { return false; }
}

export function writeExperimentalAskHelix(enabled: boolean): void {
  try { window.localStorage.setItem(STORAGE_KEY, String(enabled)); }
  catch { /* The current session still receives the preference. */ }
  window.dispatchEvent(new CustomEvent(EXPERIMENTAL_ASK_HELIX_CHANGED, { detail: enabled }));
}
