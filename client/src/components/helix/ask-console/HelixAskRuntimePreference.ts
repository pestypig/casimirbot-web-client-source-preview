import { isHelixAgentRuntimeId } from "@/lib/helix/ask-agent-runtime-display";
import type { HelixAgentRuntimeId } from "@shared/helix-agent-runtime";

export const HELIX_ASK_AGENT_RUNTIME_STORAGE_KEY = "helix.ask.agentRuntime.v1";

export type HelixAskRuntimePreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function resolveHelixAskRuntimePreferenceStorage(): HelixAskRuntimePreferenceStorage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readStoredHelixAskAgentRuntime(
  storage: HelixAskRuntimePreferenceStorage | null = resolveHelixAskRuntimePreferenceStorage(),
): HelixAgentRuntimeId {
  if (!storage) return "codex";
  try {
    const value = storage.getItem(HELIX_ASK_AGENT_RUNTIME_STORAGE_KEY);
    return isHelixAgentRuntimeId(value) ? value : "codex";
  } catch {
    return "codex";
  }
}

export function persistHelixAskAgentRuntime(
  value: HelixAgentRuntimeId,
  storage: HelixAskRuntimePreferenceStorage | null = resolveHelixAskRuntimePreferenceStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(HELIX_ASK_AGENT_RUNTIME_STORAGE_KEY, value);
  } catch {
    // Local storage can be unavailable in embedded or test contexts.
  }
}
