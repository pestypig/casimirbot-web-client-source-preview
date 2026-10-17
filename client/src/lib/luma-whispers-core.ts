import { publish } from "./luma-bus";
import { resolvePanelIdeologyWhisper } from "./luma-ideology-whispers";

const SPEAK_COOLDOWN_MS = 2_500;

type SpeakState = {
  t: number;
  last: string;
};

type SpeakWindow = Window & { __lumaLastSpeak?: SpeakState };

export function speakTypewriter(text: string) {
  if (typeof window === "undefined") return;
  const trimmed = text?.trim();
  if (!trimmed) return;

  const win = window as SpeakWindow;
  const now = Date.now();
  const state = win.__lumaLastSpeak;

  if (state && now - state.t < SPEAK_COOLDOWN_MS) {
    if (trimmed === state.last) {
      return;
    }
    return;
  }

  publish("luma:whisper", { text: trimmed });
  win.__lumaLastSpeak = { t: now, last: trimmed };
}

type ModeKey = "standby" | "hover" | "taxi" | "nearzero" | "cruise" | "emergency";

export const MODE_WHISPERS = {
  Hover: "Form first. Speed follows.",
  "Near-Zero": "Center your split; climb with patience.",
  Cruise: "Timing matched. Take the interval; apply thrust.",
  Emergency: "Breathe once. Choose the useful distance.",
  Standby: "Meet change with correct posture. The rest aligns.",
} as const;

export const NAVIGATION_WHISPERS = {
  solarInit: "Solar navigation initialized. Near-space trajectory computed.",
  galacticInit: "Galactic coordinates engaged. Interstellar passage mapped.",
  waypointSolar: "Waypoint selected. Route updated.",
  waypointGalactic: "Galactic destination set. Navigation computed.",
  stellarTarget: "Stellar target acquired. Course adjusted.",
} as const;

export const SYSTEM_WHISPERS = {
  diagnostics: "System pulse taken. All flows nominal.",
  energyUpdate: "Energy cascade balanced. Efficiency optimal.",
  configChange: "Configuration updated. Harmonics stable.",
} as const;

export function whisperMode(mode: keyof typeof MODE_WHISPERS) {
  publish("luma:whisper", { text: MODE_WHISPERS[mode] });
}

export function whisperNav(context: keyof typeof NAVIGATION_WHISPERS) {
  publish("luma:whisper", { text: NAVIGATION_WHISPERS[context] });
}

export function whisperSystem(context: keyof typeof SYSTEM_WHISPERS) {
  publish("luma:whisper", { text: SYSTEM_WHISPERS[context] });
}

export function whisperCustom(text: string) {
  publish("luma:whisper", { text });
}

export function whisperPanelOpen(panelId: string, title?: string) {
  const label = (title ?? panelId ?? "").toString().trim() || "Panel";
  const resolved = resolvePanelIdeologyWhisper(panelId, title);
  if (resolved) {
    publish("luma:whisper", {
      text: resolved.text,
      tags: resolved.tags,
      mood: resolved.mood ?? undefined,
    });
    return;
  }
  publish("luma:whisper", {
    text: `Opening ${label}.`,
    tags: ["panel", panelId].filter(Boolean) as string[],
  });
}

export function publishWhisper(topic: string, payload: unknown) {
  publish(topic, payload);
}

export function sendDriveNudge(command: unknown) {
  publish("drive:nudge", command);
}

export function getModeWisdom(mode: ModeKey): string {
  const modeWisdom: Record<ModeKey, string> = {
    hover: "Form first. Speed follows.",
    nearzero: "Hold the split at half; lift comes with patience.",
    cruise: "Steady rhythm creates distance.",
    emergency: "Power serves purpose, not pride.",
    standby: "In stillness, all possibilities rest.",
    taxi: "Ground pace finds the seam before the leap.",
  };

  return modeWisdom[mode] || "Balance in all things.";
}
