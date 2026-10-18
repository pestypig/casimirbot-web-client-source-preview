import { readCachedAccountProfileIdentity } from "@/lib/workstation/accountCapabilityPolicy";

export type PersonalVoiceDestination = "cloud_agent_dm" | "message_codex" | "ask_helix";

export const PERSONAL_VOICE_ROUTE_CHANGED_EVENT = "helix:personal-voice-route-changed";
const STORAGE_PREFIX = "casimirbot.personalVoiceRoute.v1:";
const DEFAULT_DESTINATION: PersonalVoiceDestination = "cloud_agent_dm";
let sessionDestination: PersonalVoiceDestination = DEFAULT_DESTINATION;
const volatileProfiles = new Map<string, PersonalVoiceDestination>();

const isDestination = (value: unknown): value is PersonalVoiceDestination =>
  value === "cloud_agent_dm" || value === "message_codex" || value === "ask_helix";

const profileKey = (): string | null => {
  const profileId = readCachedAccountProfileIdentity().profileId;
  return typeof profileId === "string" && profileId.length > 0
    ? `${STORAGE_PREFIX}${profileId}` : null;
};

export const readPersonalVoiceDestination = (): PersonalVoiceDestination => {
  if (typeof window === "undefined") return DEFAULT_DESTINATION;
  const key = profileKey();
  if (!key) return sessionDestination;
  try {
    const stored = window.localStorage.getItem(key);
    return isDestination(stored) ? stored : volatileProfiles.get(key) ?? DEFAULT_DESTINATION;
  } catch { return volatileProfiles.get(key) ?? DEFAULT_DESTINATION; }
};

export const writePersonalVoiceDestination = (destination: PersonalVoiceDestination): void => {
  if (typeof window === "undefined") return;
  const key = profileKey();
  if (key) {
    volatileProfiles.set(key, destination);
    try { window.localStorage.setItem(key, destination); }
    catch { /* This session still uses the selected route. */ }
  }
  if (!key) sessionDestination = destination;
  window.dispatchEvent(new CustomEvent(PERSONAL_VOICE_ROUTE_CHANGED_EVENT, { detail: destination }));
};

export const labelForPersonalVoiceDestination = (destination: PersonalVoiceDestination): string =>
  destination === "cloud_agent_dm" ? "Cloud Agent DM"
    : destination === "message_codex" ? "Message Codex" : "Ask Helix";

export const personalVoiceBlockReason = (input: {
  destination: PersonalVoiceDestination;
  managedConnectionReady: boolean;
  exactTaskReady: boolean;
  experimentalAskEnabled: boolean;
}): string | null => input.destination === "cloud_agent_dm"
  ? input.managedConnectionReady ? null : "Connect Cloud Agent DM before starting personal voice."
  : input.destination === "message_codex"
    ? input.exactTaskReady ? null : "Pair an exact Codex task before starting direct voice."
    : input.experimentalAskEnabled ? null : "Enable experimental Ask Helix before selecting this route.";
