import type { TEssenceEnvironment, TEssenceTemplate } from "@shared/essence-schema";

export type UiPreference = {
  key: string;
  value: unknown;
  updatedAt: string;
};

export type EssenceEnvironmentContext = {
  template: TEssenceTemplate;
  environment: TEssenceEnvironment;
};

export type PreferencesResponse = {
  preferences: UiPreference[];
  environment: EssenceEnvironmentContext | null;
};

export async function fetchUiPreferences(): Promise<PreferencesResponse> {
  const res = await fetch("/api/essence/preferences", {
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`preferences_fetch_failed:${res.status}`);
  }
  const payload = (await res.json()) as {
    preferences?: Array<{ key: string; value: unknown; updatedAt: string }>;
    environment?: EssenceEnvironmentContext | null;
  };
  return {
    preferences: Array.isArray(payload.preferences) ? payload.preferences : [],
    environment: payload.environment ?? null,
  };
}
