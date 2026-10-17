import type {
  NarratorAuthority,
  NarratorDeliveryMode,
  NarratorEventV1,
  NarratorSourceKind,
} from "@shared/contracts/narrator-event.v1";

export type NarratorSourcePolicy = {
  enabled: boolean;
  deliveryMode: NarratorDeliveryMode;
  maxChars: number;
  cooldownMs: number;
  minCertainty?: "low" | "medium" | "high";
};

export type NarratorPolicyDecision = {
  mode: NarratorDeliveryMode;
  speakable: boolean;
  suppressed: boolean;
  reasonCodes: string[];
  text: string;
};

export const NARRATOR_SOURCE_LABELS: Record<NarratorSourceKind, string> = {
  final_answer: "Final answer",
  helix_console: "Helix console",
  voice_receipt: "Voice receipt",
  workstation_panel: "Panel",
  live_answer: "Live Answer",
  image_lens: "Image Lens",
  situation_room: "Situation Room",
  microdeck: "Microdeck",
  hover_focus_inspector: "Hover/focus inspector",
};

export const NARRATOR_AUTHORITY_LABELS: Record<NarratorAuthority, string> = {
  terminal_answer: "Final answer",
  tool_evidence: "Evidence only",
  panel_observation: "Panel observation",
  live_observation: "Live observation",
  voice_receipt: "Voice receipt",
  inspection_hint: "Inspection hint",
};

export const DEFAULT_NARRATOR_SOURCE_POLICIES: Record<NarratorSourceKind, NarratorSourcePolicy> = {
  final_answer: {
    enabled: true,
    deliveryMode: "auto_speak",
    maxChars: 1200,
    cooldownMs: 0,
  },
  helix_console: {
    enabled: true,
    deliveryMode: "visible_only",
    maxChars: 360,
    cooldownMs: 1000,
  },
  voice_receipt: {
    enabled: true,
    deliveryMode: "visible_only",
    maxChars: 320,
    cooldownMs: 1000,
  },
  workstation_panel: {
    enabled: true,
    deliveryMode: "visible_only",
    maxChars: 360,
    cooldownMs: 1000,
  },
  live_answer: {
    enabled: true,
    deliveryMode: "visible_only",
    maxChars: 420,
    cooldownMs: 1500,
  },
  image_lens: {
    enabled: true,
    deliveryMode: "confirm_to_speak",
    maxChars: 420,
    cooldownMs: 1500,
  },
  situation_room: {
    enabled: true,
    deliveryMode: "confirm_to_speak",
    maxChars: 420,
    cooldownMs: 1500,
  },
  microdeck: {
    enabled: true,
    deliveryMode: "confirm_to_speak",
    maxChars: 360,
    cooldownMs: 1500,
  },
  hover_focus_inspector: {
    enabled: false,
    deliveryMode: "visible_only",
    maxChars: 180,
    cooldownMs: 800,
  },
};

const certaintyRank = {
  low: 1,
  medium: 2,
  high: 3,
} as const;

function clampText(text: string, maxChars: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

export function decideNarratorDelivery(args: {
  event: NarratorEventV1;
  policy: NarratorSourcePolicy;
  voiceArmed?: boolean;
  lastSpokenAtMs?: number | null;
  nowMs?: number;
}): NarratorPolicyDecision {
  const nowMs = args.nowMs ?? Date.now();
  const reasonCodes: string[] = [];
  const text = clampText(args.event.text, Math.max(1, args.policy.maxChars));

  if (!args.policy.enabled) {
    return { mode: "hidden", speakable: false, suppressed: true, reasonCodes: ["source_disabled"], text };
  }
  if (!args.event.speakable) {
    return { mode: "visible_only", speakable: false, suppressed: false, reasonCodes: ["event_unspeakable"], text };
  }
  if (args.event.sourceKind === "voice_receipt") {
    return { mode: "visible_only", speakable: false, suppressed: false, reasonCodes: ["voice_receipts_do_not_respeak"], text };
  }
  if (
    args.policy.minCertainty &&
    args.event.certainty &&
    certaintyRank[args.event.certainty] < certaintyRank[args.policy.minCertainty]
  ) {
    return { mode: "visible_only", speakable: false, suppressed: false, reasonCodes: ["below_min_certainty"], text };
  }
  if (args.lastSpokenAtMs && nowMs - args.lastSpokenAtMs < args.policy.cooldownMs) {
    return { mode: "visible_only", speakable: false, suppressed: false, reasonCodes: ["cooldown_active"], text };
  }

  const requestedMode = args.event.requestedDeliveryMode === "hidden"
    ? "hidden"
    : args.policy.deliveryMode;

  if (requestedMode === "auto_speak" && !args.voiceArmed) {
    return { mode: "confirm_to_speak", speakable: true, suppressed: false, reasonCodes: ["voice_not_armed"], text };
  }

  return {
    mode: requestedMode,
    speakable: requestedMode === "auto_speak" || requestedMode === "confirm_to_speak",
    suppressed: requestedMode === "hidden",
    reasonCodes,
    text,
  };
}
