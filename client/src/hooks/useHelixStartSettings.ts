import * as React from "react";
import { setAlcubierreDebugLogEnabled } from "@/lib/alcubierre-debug-log";
import { setWorkstationDebugEnabled } from "@/lib/helix/workstation-debug";
import {
  DEFAULT_INTERFACE_LANGUAGE,
  getInterfaceLanguageOption,
  normalizeInterfaceLanguageCode,
  type InterfaceLanguageCode,
} from "@/lib/i18n/interfaceLanguage";
import {
  INTERFACE_LANGUAGE_CHANGED_EVENT,
  PROFILE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  type InterfaceLanguageChangedDetail,
} from "@/lib/i18n/interfaceLanguagePreference";

export type StartSettings = {
  settingsVersion: number;
  rememberChoice: boolean;
  preferDesktop: boolean;
  showZen: boolean;
  enableSplashCursor: boolean;
  voiceNoisyEnvironmentMode: boolean;
  showHelixAskDebug: boolean;
  showHelixAskConsoleDebug: boolean;
  showHelixAskObserverLane: boolean;
  showDottieVoiceDebugClips: boolean;
  showHelixVoiceCaptureDiagnostics: boolean;
  showPowerShellDebug: boolean;
  showAlcubierreRenderDebugLog: boolean;
  showWorkstationDebug: boolean;
  powerShellScratch: string;
  interfaceLanguage: InterfaceLanguageCode;
  preferredResponseLanguage: string;
};

export type SettingsTab = "preferences" | "knowledge";

export const DEFAULT_SETTINGS: StartSettings = {
  settingsVersion: 14,
  rememberChoice: true,
  preferDesktop: false,
  showZen: true,
  enableSplashCursor: false,
  voiceNoisyEnvironmentMode: false,
  showHelixAskDebug: true,
  showHelixAskConsoleDebug: false,
  showHelixAskObserverLane: false,
  showDottieVoiceDebugClips: false,
  showHelixVoiceCaptureDiagnostics: false,
  showPowerShellDebug: false,
  showAlcubierreRenderDebugLog: false,
  showWorkstationDebug: false,
  powerShellScratch: "",
  interfaceLanguage: DEFAULT_INTERFACE_LANGUAGE,
  preferredResponseLanguage: "auto",
};

export { PROFILE_STORAGE_KEY, SETTINGS_STORAGE_KEY };

export function useHelixStartSettings() {
  const [userSettings, setUserSettings] = React.useState<StartSettings>(DEFAULT_SETTINGS);
  const [settingsHydrated, setSettingsHydrated] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      setSettingsHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) {
        setSettingsHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as Partial<StartSettings>;
      const merged: StartSettings = { ...DEFAULT_SETTINGS, ...parsed };
      merged.interfaceLanguage = normalizeInterfaceLanguageCode(parsed.interfaceLanguage);
      if (typeof parsed.showHelixAskDebug !== "boolean") {
        const legacyUnifiedPreference =
          (parsed as Record<string, unknown>).showHelixAskReasoningEventLog ??
          (parsed as Record<string, unknown>).showHelixAskMasterEventClock ??
          (parsed as Record<string, unknown>).showHelixVoiceEventTimelineDebug;
        if (typeof legacyUnifiedPreference === "boolean") {
          merged.showHelixAskDebug = legacyUnifiedPreference;
        }
      }
      if (typeof parsed.showHelixAskConsoleDebug !== "boolean") {
        merged.showHelixAskConsoleDebug = DEFAULT_SETTINGS.showHelixAskConsoleDebug;
      }
      if (parsed.settingsVersion !== DEFAULT_SETTINGS.settingsVersion) {
        merged.settingsVersion = DEFAULT_SETTINGS.settingsVersion;
        merged.voiceNoisyEnvironmentMode = DEFAULT_SETTINGS.voiceNoisyEnvironmentMode;
        merged.showHelixVoiceCaptureDiagnostics = DEFAULT_SETTINGS.showHelixVoiceCaptureDiagnostics;
        merged.showDottieVoiceDebugClips =
          typeof parsed.showDottieVoiceDebugClips === "boolean"
            ? parsed.showDottieVoiceDebugClips
            : DEFAULT_SETTINGS.showDottieVoiceDebugClips;
        merged.showHelixAskObserverLane = DEFAULT_SETTINGS.showHelixAskObserverLane;
        merged.showHelixAskConsoleDebug =
          typeof parsed.showHelixAskConsoleDebug === "boolean"
            ? parsed.showHelixAskConsoleDebug
            : DEFAULT_SETTINGS.showHelixAskConsoleDebug;
        merged.showAlcubierreRenderDebugLog = DEFAULT_SETTINGS.showAlcubierreRenderDebugLog;
        merged.showWorkstationDebug =
          typeof parsed.showWorkstationDebug === "boolean"
            ? parsed.showWorkstationDebug
            : DEFAULT_SETTINGS.showWorkstationDebug;
        merged.interfaceLanguage = normalizeInterfaceLanguageCode(parsed.interfaceLanguage);
        merged.preferredResponseLanguage =
          typeof parsed.preferredResponseLanguage === "string" && parsed.preferredResponseLanguage.trim().length > 0
            ? parsed.preferredResponseLanguage.trim()
            : DEFAULT_SETTINGS.preferredResponseLanguage;
      }
      setUserSettings(merged);
    } catch {
      // ignore malformed localStorage entries
    } finally {
      setSettingsHydrated(true);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined" || !settingsHydrated) return;
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(userSettings));
    } catch {
      // storing user preference is best-effort
    }
  }, [settingsHydrated, userSettings]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleInterfaceLanguageChanged = (event: Event) => {
      const detail = (event as CustomEvent<InterfaceLanguageChangedDetail>).detail;
      const language = normalizeInterfaceLanguageCode(detail?.language);
      setUserSettings((prev) =>
        prev.interfaceLanguage === language
          ? prev
          : {
              ...prev,
              interfaceLanguage: language,
            },
      );
    };
    window.addEventListener(INTERFACE_LANGUAGE_CHANGED_EVENT, handleInterfaceLanguageChanged);
    return () => window.removeEventListener(INTERFACE_LANGUAGE_CHANGED_EVENT, handleInterfaceLanguageChanged);
  }, []);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const option = getInterfaceLanguageOption(userSettings.interfaceLanguage);
    document.documentElement.lang = option.bcp47;
    document.documentElement.dir = option.direction;
  }, [userSettings.interfaceLanguage]);

  React.useEffect(() => {
    setAlcubierreDebugLogEnabled(Boolean(userSettings.showAlcubierreRenderDebugLog));
  }, [userSettings.showAlcubierreRenderDebugLog]);

  React.useEffect(() => {
    setWorkstationDebugEnabled(Boolean(userSettings.showWorkstationDebug));
  }, [userSettings.showWorkstationDebug]);

  const updateSettings = React.useCallback((patch: Partial<StartSettings>) => {
    setUserSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  return { userSettings, updateSettings };
}
