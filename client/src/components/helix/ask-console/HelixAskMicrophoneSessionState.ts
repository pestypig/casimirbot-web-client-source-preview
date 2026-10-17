import type { MicArmState } from "@/lib/helix/ask-read-aloud-display";

// Microphone capture is opt-in per loaded session. It must never inherit an
// armed state from another page load, account, or browser-local preference.
export function resolveInitialMicArmState(): MicArmState {
  return "off";
}
