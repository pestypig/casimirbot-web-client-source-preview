import type { LocalCallSpec } from "@shared/local-call-spec";

type LocalCallSpecInput = {
  userMessage: string;
  pageContext?: string;
  visibleCode?: string;
  recentSummary?: string;
  availableResources?: Array<{
    type: "repo_file" | "doc" | "web_page" | "service" | "telemetry";
    pathOrUrl?: string;
    id?: string;
    tags?: string[];
  }>;
};

const resolveCallSpecUrl = (): string | null => {
  try {
    const fromGlobal = (globalThis as any)?.__ESSENCE_LOCAL_CALL_SPEC__;
    if (typeof fromGlobal === "string" && fromGlobal.trim()) {
      return fromGlobal.trim();
    }
    const envUrl = (import.meta as any)?.env?.VITE_LOCAL_CALL_SPEC_URL;
    if (typeof envUrl === "string" && envUrl.trim()) {
      return envUrl.trim();
    }
  } catch {
    // ignore env resolution failures
  }
  return null;
};

export async function fetchLocalCallSpec(input: LocalCallSpecInput): Promise<LocalCallSpec | null> {
  const enabledRaw = (import.meta as any)?.env?.VITE_ENABLE_LOCAL_CALL_SPEC ?? (import.meta as any)?.env?.ENABLE_LOCAL_CALL_SPEC;
  const enabled = typeof enabledRaw === "string" ? ["1", "true", "yes", "on"].includes(enabledRaw.toLowerCase()) : false;
  if (!enabled) {
    return null;
  }
  const url = resolveCallSpecUrl();
  if (!url) {
    return null;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as LocalCallSpec;
    return payload;
  } catch {
    return null;
  }
}
