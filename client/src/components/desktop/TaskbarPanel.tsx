import React, { useMemo } from "react";
import { AppWindow, Settings2 } from "lucide-react";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import { panelRegistry } from "@/lib/desktop/panelRegistry";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText } from "@/lib/i18n/interfaceText";
import { getInterfacePanelTitle } from "@/lib/i18n/panelTitles";
import { useDesktopStore, type DesktopClickBehavior } from "@/store/useDesktopStore";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export default function TaskbarPanel() {
  return (
    <div className="flex h-full w-full items-center rounded-lg border border-slate-800/70 bg-slate-950/75 px-3 py-2 text-slate-100 shadow-inner">
      <TaskbarShelf variant="panel" />
    </div>
  );
}

export type TaskbarShelfProps = {
  variant?: "fixed" | "panel";
  onOpenFloatingTaskbar?: () => void;
  showWindowTabs?: boolean;
};

export function TaskbarShelf({
  variant = "panel",
  onOpenFloatingTaskbar,
  showWindowTabs = true
}: TaskbarShelfProps) {
  const {
    windows,
    open,
    focus,
    minimize,
    restore,
    close,
    pinned,
    togglePin,
    clickBehavior,
    setClickBehavior,
    openInHelix
  } = useDesktopStore();
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(interfaceLanguage.code);

  const frontmostId = useMemo(() => {
    return Object.values(windows)
      .filter((w) => w.isOpen && !w.isMinimized)
      .sort((a, b) => b.z - a.z)[0]?.id;
  }, [windows]);

  const runningEntries = useMemo(
    () =>
      panelRegistry.filter(
        (panel) =>
          !panel.skipTaskbar &&
          Boolean(windows[panel.id]?.isOpen)
      ),
    [windows]
  );

  const baseButtonClass =
    "relative border border-slate-800/60 bg-slate-900/60 text-slate-200 hover:bg-slate-900/80 transition-colors px-3";
  const activeButtonClass =
    "border-cyan-400/70 text-cyan-100 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 shadow-[0_0_25px_rgba(14,165,233,0.25)]";

  const handleIconClick = (panelId: string) => {
    const win = windows[panelId];
    if (!win || !win.isOpen) {
      open(panelId);
      focus(panelId);
      return;
    }
    if (win.isMinimized) {
      restore(panelId);
      return;
    }
    if (frontmostId !== panelId) {
      focus(panelId);
      return;
    }
    if (clickBehavior === "ToggleMinimize" && !win.noMinimize) {
      minimize(panelId);
    }
  };

  const renderIcon = (panel: (typeof panelRegistry)[number]) => {
    const panelId = panel.id;
    const win = windows[panelId];
    const Icon = panel.icon ?? AppWindow;
    const panelTitle = getInterfacePanelTitle(t, String(panel.id), panel.title);
    const isPinned = Boolean(pinned[panelId]);
    const isOpen = Boolean(win?.isOpen);
    const isMinimized = Boolean(win?.isMinimized);
    const isActive = isOpen && !isMinimized && frontmostId === panelId;
    const buttonLabel = isOpen ? (isMinimized ? "Restore" : "Focus") : "Open";
    const canMinimize = Boolean(isOpen && !isMinimized && !win?.noMinimize);

    const onOpen = () => handleIconClick(panelId);
    const onMinimize = () => {
      if (canMinimize) {
        minimize(panelId);
      }
    };
    const onClose = () => close(panelId);
    const onPinToggle = () => togglePin(panelId);
    const onNavigateHelix = () => openInHelix(panelId);

    return (
      <ContextMenu key={panelId}>
        <ContextMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className={`${baseButtonClass} ${isActive ? activeButtonClass : ""}`}
            onClick={onOpen}
            title={panelTitle}
          >
            <Icon className="mr-2 h-4 w-4" />
            <span className="max-w-[9rem] truncate text-sm">{panelTitle}</span>
            {isOpen && (
              <span
                className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${
                  isMinimized ? "bg-slate-400/80" : "bg-cyan-300"
                }`}
              />
            )}
            {isMinimized && (
              <span className="ml-2 rounded-full border border-slate-500 px-1 text-[10px] uppercase">
                Min
              </span>
            )}
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={onOpen}>{buttonLabel}</ContextMenuItem>
          <ContextMenuItem onClick={onMinimize} disabled={!canMinimize}>
            Minimize
          </ContextMenuItem>
          <ContextMenuItem onClick={onClose}>Close</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onPinToggle}>
            {isPinned ? "Unpin from taskbar" : "Pin to taskbar"}
          </ContextMenuItem>
          <ContextMenuItem onClick={onNavigateHelix}>Open in HelixCore</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <div
      className={`flex w-full items-center gap-2 ${
        variant === "fixed" ? "text-slate-100" : ""
      }`}
    >
      <div className="flex flex-1 items-center gap-2 overflow-x-auto pr-4">
        {showWindowTabs ? runningEntries.map((panel) => renderIcon(panel)) : null}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <TaskbarSettings
          clickBehavior={clickBehavior}
          onChange={setClickBehavior}
          onOpenFloatingTaskbar={onOpenFloatingTaskbar}
        />
        <div className="text-xs text-slate-400 tabular-nums">
          <Clock />
        </div>
      </div>
    </div>
  );
}

function TaskbarSettings({
  clickBehavior,
  onChange,
  onOpenFloatingTaskbar
}: {
  clickBehavior: DesktopClickBehavior;
  onChange: (value: DesktopClickBehavior) => void;
  onOpenFloatingTaskbar?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="text-slate-300 hover:bg-slate-800/60 hover:text-white"
          title="Taskbar settings"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel>Taskbar</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onOpenFloatingTaskbar && (
          <>
            <DropdownMenuItem onClick={onOpenFloatingTaskbar}>
              Open Taskbar Panel
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-xs uppercase text-slate-400">
          Click behavior
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={clickBehavior}
          onValueChange={(value) => onChange(value as DesktopClickBehavior)}
        >
          <DropdownMenuRadioItem value="ToggleMinimize">
            Toggle minimize (Windows style)
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="FocusOnly">
            Focus only (macOS style)
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Clock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{now.toLocaleString()}</span>;
}
