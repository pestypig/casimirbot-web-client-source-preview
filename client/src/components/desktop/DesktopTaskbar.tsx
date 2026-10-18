import React from "react";
import { AppWindow, ChevronUp, CircleDot } from "lucide-react";
import { TaskbarShelf } from "@/components/desktop/TaskbarPanel";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import HelixMarkIcon from "@/components/icons/HelixMarkIcon";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText } from "@/lib/i18n/interfaceText";
import { getInterfacePanelTitle } from "@/lib/i18n/panelTitles";
import { useDesktopStore } from "@/store/useDesktopStore";
import { HELIX_PANELS, type HelixPanelRef } from "@/pages/helix-core.panels";
import { getPanelDef } from "@/lib/desktop/panelRegistry";
import { isSolarSpecialistLaunchPanel } from "@/lib/workstation/solarSpecialistPanels";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { CasimirGuideOverlay } from "@/components/workstation/guide/CasimirGuideOverlay";

type DesktopTaskbarProps = {
  onOpenPanel?: (panelId: string) => void;
  showStart?: boolean;
  showWindowTabs?: boolean;
};

export function DesktopTaskbar({
  onOpenPanel,
  showStart = true,
  showWindowTabs = true
}: DesktopTaskbarProps) {
  const { open, focus, windows, pinned, recentPanelIds } = useDesktopStore();
  const [guideOpen, setGuideOpen] = React.useState(false);
  const handleOpenTaskbarPanel = React.useCallback(() => open("taskbar"), [open]);
  const handleOpenPanel = React.useCallback((panelId: string) => {
    if (onOpenPanel) onOpenPanel(panelId);
    else {
      open(panelId);
      focus(panelId);
    }
  }, [focus, onOpenPanel, open]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        setGuideOpen((current: boolean) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const guideContext = React.useMemo(() => {
    const registeredRecent = recentPanelIds.filter((panelId: string) => {
      const panel = getPanelDef(panelId);
      return Boolean(panel && !panel.skipTaskbar && !panel.startHidden);
    });
    const activePanelId = registeredRecent.find((panelId: string) => {
      const windowState = windows[panelId];
      return Boolean(windowState?.isOpen && !windowState.isMinimized);
    }) ?? Object.values(windows)
      .filter((windowState) => windowState.isOpen && !windowState.isMinimized)
      .sort((left, right) => right.z - left.z)
      .map((windowState) => windowState.id)
      .find((panelId) => {
        const panel = getPanelDef(panelId);
        return Boolean(panel && !panel.skipTaskbar && !panel.startHidden);
      }) ?? null;
    return {
      activePanelId,
      recentPanelIds: registeredRecent
        .filter((panelId: string) => panelId !== activePanelId)
        .slice(0, 5),
      favoritePanelIds: Object.entries(pinned)
        .filter(([, isPinned]) => isPinned)
        .map(([panelId]) => panelId)
        .filter((panelId: string) => {
          const panel = getPanelDef(panelId);
          return Boolean(panel && !panel.skipTaskbar && !panel.startHidden);
        })
        .slice(0, 5),
    };
  }, [pinned, recentPanelIds, windows]);

  return (
    <>
    <div className="fixed bottom-0 left-0 right-0 h-12">
      <div className="relative flex h-full items-center gap-3 overflow-hidden border-t border-primary/45 bg-background/82 px-3 text-foreground shadow-[0_-18px_55px_hsl(var(--primary)/0.22)] backdrop-blur-xl">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(150%_240%_at_8%_24%,hsl(var(--primary)/0.22)_0%,transparent_70%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-75 bg-[radial-gradient(140%_200%_at_92%_18%,hsl(var(--primary)/0.16)_0%,transparent_72%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/70 via-primary/40 to-transparent"
          aria-hidden
        />
        <div className="relative flex w-full items-center gap-3">
          {showStart ? <HelixStartLauncher onOpenPanel={onOpenPanel} /> : null}
          <Button size="sm" variant="outline" onClick={() => setGuideOpen((current: boolean) => !current)}
            className="relative flex items-center gap-2 rounded-full border-cyan-400/45 bg-card/70 px-3 text-[12px] font-semibold uppercase tracking-wide text-cyan-200"
            aria-label={guideOpen ? "Close Casimir Guide" : "Open Casimir Guide"}
            aria-expanded={guideOpen}
            aria-controls="casimir-guide-dialog">
            <CircleDot className="h-4 w-4" /> Guide
          </Button>
          <div className="flex-1 overflow-hidden">
            <TaskbarShelf
              variant="fixed"
              showWindowTabs={showWindowTabs}
              onOpenFloatingTaskbar={handleOpenTaskbarPanel}
            />
          </div>
        </div>
      </div>
    </div>
    <CasimirGuideOverlay
      open={guideOpen}
      onClose={() => setGuideOpen(false)}
      onOpenPanel={handleOpenPanel}
      context={guideContext}
    />
    </>
  );
}

function HelixStartLauncher({ onOpenPanel }: { onOpenPanel?: (panelId: string) => void }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { windows, open, focus, restore } = useDesktopStore();
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(interfaceLanguage.code);

  const helixPanels = React.useMemo(
    () =>
      [...HELIX_PANELS]
        .filter((panel) => !panel.startHidden && !isSolarSpecialistLaunchPanel(panel.id))
        .sort((a, b) => {
          const aTitle = getInterfacePanelTitle(t, a.id, a.title);
          const bTitle = getInterfacePanelTitle(t, b.id, b.title);
          return aTitle.localeCompare(bTitle, undefined, { sensitivity: "base" });
        }),
    [t]
  );

  const keywordFilter = React.useCallback((value: string, search: string) => {
    if (!search.trim()) return 1;
    const normalizedValue = value.toLowerCase();
    const tokens = search
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    if (!tokens.length) return 1;
    return tokens.every((token) => normalizedValue.includes(token)) ? 1 : 0;
  }, []);

  const handleLaunch = React.useCallback(
    (panelId: string) => {
      if (onOpenPanel) {
        onOpenPanel(panelId);
        setMenuOpen(false);
        return;
      }
      const win = windows[panelId];
      if (!win || !win.isOpen) {
        open(panelId);
        focus(panelId);
      } else if (win.isMinimized) {
        restore(panelId);
        focus(panelId);
      } else {
        focus(panelId);
      }
      setMenuOpen(false);
    },
    [focus, onOpenPanel, open, restore, windows]
  );

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <Button
          id="helix-start-button"
          size="sm"
          variant="outline"
          className="flex items-center gap-2 rounded-full border-primary/55 bg-card/70 px-4 text-[13px] font-semibold uppercase tracking-wide text-primary shadow-[0_0_18px_hsl(var(--primary)/0.32)] transition-colors hover:bg-card/90"
          aria-label="Open Helix Core start menu"
        >
          <HelixMarkIcon className="h-4 w-4 text-lime-400" strokeWidth={40} aria-label="Helix mark" />
          Start
          <ChevronUp className="h-3.5 w-3.5 text-primary/80" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={12}
        className="relative w-80 overflow-hidden border border-primary/35 bg-card/92 p-0 text-foreground shadow-[0_28px_80px_hsl(var(--primary)/0.32)]"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(135%_185%_at_10%_16%,hsl(var(--primary)/0.26)_0%,transparent_68%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-70 bg-[radial-gradient(140%_200%_at_96%_10%,hsl(var(--primary)/0.18)_0%,transparent_72%)]"
          aria-hidden
        />
        <div className="relative">
          <div className="border-b border-primary/35 px-4 py-3">
            <p className="text-sm font-semibold tracking-wide text-primary">Helix Start</p>
            <p className="text-xs text-muted-foreground">
              Launch Helix Core panels onto the desktop.
            </p>
          </div>
          <Command className="bg-transparent" filter={keywordFilter}>
            <CommandInput placeholder="Search panels..." />
            <CommandList className="max-h-[360px]">
              <CommandEmpty>No Helix panels match that search.</CommandEmpty>
              <CommandGroup heading="Helix Core Panels">
                {helixPanels.map((panel) => {
                  const Icon = panel.icon ?? AppWindow;
                  const win = windows[panel.id];
                  const isRunning = Boolean(win?.isOpen);
                  const statusLabel = !isRunning
                    ? null
                    : win?.isMinimized
                      ? "Minimized"
                      : "Running";
                  const panelTitle = getInterfacePanelTitle(t, panel.id, panel.title);
                  const searchValue = buildPanelSearchValue(panel, panelTitle);
                  return (
                    <CommandItem
                      key={panel.id}
                      value={searchValue}
                      onSelect={() => handleLaunch(panel.id)}
                      className="items-start gap-3 py-2"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/35 bg-background/75 shadow-[inset_0_0_18px_hsl(var(--primary)/0.12)]">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{panelTitle}</span>
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {panel.id}
                        </span>
                      </div>
                      {statusLabel && (
                        <span
                          className={`ml-auto text-[11px] uppercase tracking-wide ${
                            statusLabel === "Minimized" ? "text-muted-foreground" : "text-primary"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function buildPanelSearchValue(panel: HelixPanelRef, localizedTitle?: string) {
  const sections = [
    panel.title,
    localizedTitle ?? "",
    panel.id,
    panel.keywords?.join(" ") ?? "",
    panel.endpoints?.join(" ") ?? ""
  ];
  return sections
    .map((section) => section.trim())
    .filter((section) => section.length > 0)
    .join(" ");
}
