import { Fragment, useEffect, useMemo, useState } from "react";
import { Check, Copy, Monitor, Send, X } from "lucide-react";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText, type InterfaceTextResolver } from "@/lib/i18n/interfaceText";
import { getInterfacePanelTitle } from "@/lib/i18n/panelTitles";
import { panelRegistry } from "@/lib/desktop/panelRegistry";
import { isSolarSpecialistLaunchPanel } from "@/lib/workstation/solarSpecialistPanels";
import { isUserLaunchPanel } from "@/lib/workstation/launchPanelPolicy";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  fetchAccountCapabilityPolicy,
  readCachedAccountCapabilityPolicy,
} from "@/lib/workstation/accountCapabilityPolicy";
import type { HelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import {
  buildWorkstationPanelPathRef,
  buildWorkstationPathRef,
  coerceWorkstationViewStateFromPathInput,
  normalizeWorkstationPathInput,
  normalizeWorkstationDocPath,
  type WorkstationPathRef,
} from "@/lib/workstation/workstationDeepLink";
import { useDocEquationContextStore } from "@/store/useDocEquationContextStore";
import { useDocViewerStore } from "@/store/useDocViewerStore";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { cn } from "@/lib/utils";

type Translate = InterfaceTextResolver["t"];

export function WorkstationPathBar({
  activePanelId,
  groupId,
}: {
  activePanelId: string | null | undefined;
  groupId: string;
}) {
  const docMode = useDocViewerStore((state) => state.mode);
  const currentDocPath = useDocViewerStore((state) => state.currentPath);
  const docAnchor = useDocViewerStore((state) => state.anchor);
  const latestEquationContext = useDocEquationContextStore((state) => state.latestContext);
  const openPanelInGroup = useWorkstationLayoutStore((state) => state.openPanelInGroup);
  const setActivePanel = useWorkstationLayoutStore((state) => state.setActivePanel);
  const focusGroup = useWorkstationLayoutStore((state) => state.focusGroup);
  const normalizedCurrentDocPath = normalizeWorkstationDocPath(currentDocPath);
  const activeEquationContext =
    activePanelId === "docs-viewer" &&
    docMode === "doc" &&
    latestEquationContext?.docPath === normalizedCurrentDocPath
      ? latestEquationContext
      : null;
  const pathRef =
    activeEquationContext?.pathRef && activeEquationContext.uri
      ? {
          ...activeEquationContext.pathRef,
          virtualUri: activeEquationContext.uri,
        }
      : activePanelId === "docs-viewer" && docMode === "doc"
        ? buildWorkstationPathRef(currentDocPath) ?? buildWorkstationPanelPathRef(activePanelId)
      : buildWorkstationPanelPathRef(activePanelId);

  if (!pathRef) return null;

  return (
    <WorkstationPathBreadcrumb
      pathRef={pathRef}
      anchor={activeEquationContext?.equationId ?? (activePanelId === "docs-viewer" ? docAnchor : undefined)}
      onNavigate={(value) => {
        const viewState = coerceWorkstationViewStateFromPathInput(value);
        if (!viewState) return false;
        const matchedEquationContext =
          activeEquationContext?.uri === value.trim()
            ? activeEquationContext
            : null;
        for (const panelId of viewState.panels) {
          openPanelInGroup(groupId, panelId);
        }
        for (const panelId of matchedEquationContext?.openedPanels ?? []) {
          openPanelInGroup(groupId, panelId);
        }
        if (viewState.activeDocPath) {
          useDocViewerStore.getState().viewDoc(
            viewState.activeDocPath,
            matchedEquationContext?.equationId ?? viewState.selectedObjectId ?? viewState.anchor,
          );
        }
        const focusPanel = viewState.focusPanel ?? (viewState.activeDocPath ? "docs-viewer" : undefined);
        if (focusPanel) {
          openPanelInGroup(groupId, focusPanel);
          setActivePanel(groupId, focusPanel);
          focusGroup(groupId);
        }
        return true;
      }}
    />
  );
}

function WorkstationPathBreadcrumb({
  pathRef,
  anchor,
  onNavigate,
}: {
  pathRef: WorkstationPathRef;
  anchor?: string;
  onNavigate: (value: string) => boolean;
}) {
  const [inputValue, setInputValue] = useState(pathRef.virtualUri);
  const [status, setStatus] = useState<"idle" | "copied" | "invalid">("idle");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [accountPolicy, setAccountPolicy] = useState<HelixAccountCapabilityPolicy | null>(() =>
    readCachedAccountCapabilityPolicy(),
  );
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(interfaceLanguage.code);
  const displaySegments = pathRef.displaySegments.map((segment, index) =>
    localizeWorkstationPathSegment(segment, index, pathRef, t),
  );
  const panelPathFragment = normalizeWorkstationPathInput(inputValue)?.match(/^panels(?:\/([^/]*))?$/i);
  const panelQuery = panelPathFragment ? (panelPathFragment[1] ?? "").toLocaleLowerCase() : null;
  const panelSuggestions = useMemo(() => {
    if (panelQuery === null) return [];
    return panelRegistry
      .filter((panel) =>
        !panel.startHidden && !isSolarSpecialistLaunchPanel(String(panel.id)) &&
        (accountPolicy?.account_type === "developer" || isUserLaunchPanel(String(panel.id))),
      )
      .map((panel) => ({
        id: String(panel.id),
        title: getInterfacePanelTitle(t, String(panel.id), panel.title),
      }))
      .filter((panel) => !panelQuery || `${panel.id} ${panel.title}`.toLocaleLowerCase().includes(panelQuery))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  }, [accountPolicy?.account_type, panelQuery, t]);

  useEffect(() => {
    setInputValue(pathRef.virtualUri);
    setStatus("idle");
  }, [pathRef.virtualUri]);

  useEffect(() => {
    let active = true;
    const handlePolicyChange = (event: Event) => {
      const policy = (event as CustomEvent<{ account_policy?: HelixAccountCapabilityPolicy | null }>).detail
        ?.account_policy;
      setAccountPolicy(policy ?? readCachedAccountCapabilityPolicy());
    };
    if (typeof window !== "undefined") {
      window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, handlePolicyChange as EventListener);
    }
    fetchAccountCapabilityPolicy()
      .then((policy) => {
        if (active) setAccountPolicy(policy);
      })
      .catch(() => {
        if (active) setAccountPolicy(readCachedAccountCapabilityPolicy());
      });
    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, handlePolicyChange as EventListener);
      }
    };
  }, []);

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 1400);
    return () => window.clearTimeout(timer);
  }, [status]);

  const copyCurrentPath = async () => {
    try {
      await navigator.clipboard.writeText(pathRef.virtualUri);
      setStatus("copied");
    } catch {
      setStatus("invalid");
    }
  };

  const submitPath = () => {
    const ok = onNavigate(inputValue);
    setStatus(ok ? "idle" : "invalid");
  };

  const selectSuggestion = (panelId: string) => {
    setInputValue(`workspace://workspace/panels/${encodeURIComponent(panelId)}`);
    setSuggestionsOpen(false);
    setActiveSuggestion(0);
    setStatus("idle");
  };
  const visibleSuggestions = panelSuggestions.slice(0, 12);

  useEffect(() => {
    if (activeSuggestion >= visibleSuggestions.length) setActiveSuggestion(0);
  }, [activeSuggestion, visibleSuggestions.length]);

  return (
    <div
      className="flex min-h-9 min-w-0 items-center gap-2 border-b border-white/10 bg-slate-950/45 px-3 py-1.5 text-xs text-slate-300"
      data-testid="workstation-path-bar"
      title={pathRef.virtualUri}
    >
      <Monitor className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap gap-1 overflow-hidden text-xs text-slate-400 sm:gap-1.5">
          {displaySegments.map((segment, index) => {
            const rawSegment = pathRef.displaySegments[index] ?? segment;
            const isLast = index === displaySegments.length - 1;
            return (
              <Fragment key={`${rawSegment}:${index}`}>
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage
                    className={cn(
                      "max-w-[11rem] truncate text-xs font-normal",
                      isLast ? "text-slate-100" : "text-slate-400",
                    )}
                    title={segment}
                  >
                    {segment}
                  </BreadcrumbPage>
                </BreadcrumbItem>
                {!isLast ? <BreadcrumbSeparator className="text-slate-600" /> : null}
              </Fragment>
            );
          })}
          {anchor ? (
            <>
              <BreadcrumbSeparator className="text-slate-600" />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage
                  className="max-w-[10rem] truncate text-xs font-normal text-cyan-200"
                  title={`#${anchor}`}
                >
                  #{anchor}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>
      <form
        className="relative ml-auto flex min-w-[14rem] max-w-[28rem] flex-1 items-center gap-1 rounded-md border border-white/10 bg-black/20 px-1.5 py-1 focus-within:border-cyan-300/45 focus-within:bg-black/30"
        onSubmit={(event) => {
          event.preventDefault();
          submitPath();
        }}
      >
        <input
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value);
            setSuggestionsOpen(true);
            setActiveSuggestion(0);
          }}
          onFocus={() => {
            if (panelQuery !== null) setSuggestionsOpen(true);
          }}
          onKeyDown={(event) => {
            if (!suggestionsOpen || visibleSuggestions.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveSuggestion((index) => (index + 1) % visibleSuggestions.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveSuggestion((index) => (index + visibleSuggestions.length - 1) % visibleSuggestions.length);
            } else if (event.key === "Tab" || event.key === "Enter") {
              event.preventDefault();
              selectSuggestion(visibleSuggestions[activeSuggestion]?.id ?? visibleSuggestions[0].id);
            } else if (event.key === "Escape") {
              setSuggestionsOpen(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-1 text-xs text-slate-200 outline-none placeholder:text-slate-600"
          aria-label={t("workstation.path.inputLabel")}
          data-testid="workstation-path-input"
          placeholder="workspace://workspace/docs/file.md"
          autoComplete="off"
        />
        {suggestionsOpen && panelSuggestions.length > 0 ? (
          <div
            role="listbox"
            aria-label={t("workstation.path.panelSuggestions")}
            className="absolute bottom-full right-7 z-[95] mb-1 max-h-56 w-72 overflow-y-auto rounded-md border border-white/15 bg-slate-950/95 p-1 shadow-xl"
          >
            {visibleSuggestions.map((panel, index) => (
              <button
                key={panel.id}
                type="button"
                role="option"
                aria-selected={index === activeSuggestion}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(panel.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs",
                  index === activeSuggestion ? "bg-cyan-500/20 text-cyan-50" : "text-slate-200 hover:bg-white/10",
                )}
              >
                <span className="truncate">{panel.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-slate-500">{panel.id}</span>
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-cyan-100"
          onClick={copyCurrentPath}
          title={t("workstation.path.copy")}
          aria-label={t("workstation.path.copy")}
        >
          {status === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button
          type="submit"
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-white/10",
            status === "invalid" ? "text-amber-300" : "text-slate-300 hover:text-cyan-100",
          )}
          title={status === "invalid" ? t("workstation.path.invalidTitle") : t("workstation.path.navigate")}
          aria-label={t("workstation.path.navigate")}
        >
          {status === "invalid" ? <X className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </form>
    </div>
  );
}

function localizeWorkstationPathSegment(
  segment: string,
  index: number,
  pathRef: WorkstationPathRef,
  t: Translate,
): string {
  if (segment === "Workspace") return t("workstation.path.segment.workspace");
  if (segment === "Panels") return t("workstation.path.segment.panels");
  const isLast = index === pathRef.displaySegments.length - 1;
  const panelId = isLast ? readPanelIdFromPathUri(pathRef.virtualUri) : null;
  return panelId ? getInterfacePanelTitle(t, panelId, segment) : segment;
}

function readPanelIdFromPathUri(value: string): string | null {
  const match = value.match(/^workspace:\/\/(?:workspace\/)?panels\/([^/?#]+)/);
  return match?.[1] ?? null;
}
