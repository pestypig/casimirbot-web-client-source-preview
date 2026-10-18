import * as React from "react";
import type { SettingsTab } from "@/hooks/useHelixStartSettings";

type OpenSettingsDetail = {
  tab?: SettingsTab;
};

type HelixSettingsOpenStateDetail = {
  open: boolean;
};

const OPEN_EVENTS = [
  "open-helix-settings",
  "open-desktop-settings",
  "open-mobile-settings",
] as const;

export const HELIX_SETTINGS_OPEN_STATE_EVENT = "helix-settings-open-state";

export function useHelixSettingsDialog(defaultTab: SettingsTab = "preferences") {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsTab, setSettingsTab] = React.useState<SettingsTab>(defaultTab);

  const openSettings = React.useCallback((tab: SettingsTab = defaultTab) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, [defaultTab]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenSettingsDetail>)?.detail;
      openSettings(detail?.tab ?? defaultTab);
    };
    OPEN_EVENTS.forEach((eventName) =>
      window.addEventListener(eventName, handleOpen as EventListener),
    );
    return () => {
      OPEN_EVENTS.forEach((eventName) =>
        window.removeEventListener(eventName, handleOpen as EventListener),
      );
    };
  }, [defaultTab, openSettings]);

  const handleSettingsOpenChange = React.useCallback((next: boolean) => {
    setSettingsOpen(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<HelixSettingsOpenStateDetail>(HELIX_SETTINGS_OPEN_STATE_EVENT, {
          detail: { open: next },
        }),
      );
    }
    if (!next) {
      setSettingsTab(defaultTab);
    }
  }, [defaultTab]);

  return {
    settingsOpen,
    setSettingsOpen,
    settingsTab,
    setSettingsTab,
    openSettings,
    handleSettingsOpenChange,
  };
}
