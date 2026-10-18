import * as React from "react";
import { Activity, Database, HardDrive, Layers, RefreshCw, Server } from "lucide-react";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText, type InterfaceTextResolver } from "@/lib/i18n/interfaceText";
import type { InterfaceMessageId } from "@/lib/i18n/messages/types";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";
import { buildBrowserWorkspaceStorageStatus } from "@/lib/workstation/workspaceStorageScanner";
import { HELIX_WORKSPACE_MEMORY_REGISTRY_SCHEMA } from "@shared/helix-workspace-memory-registry";
import {
  sortHelixWorkspaceStorageRecords,
  type HelixWorkspaceStorageRecord,
  type HelixWorkspaceStorageStatus,
} from "@shared/helix-workspace-storage-status";

const POLL_INTERVAL_MS = 10000;

type Rect = {
  record: HelixWorkspaceStorageRecord;
  x: number;
  y: number;
  w: number;
  h: number;
};
type Translate = InterfaceTextResolver["t"];
type DisplayMessageMap = Record<string, InterfaceMessageId>;

const formatBytes = (value: number | null | undefined, t: Translate): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return t("workstation.common.unknown");
  const units = ["B", "KiB", "MiB", "GiB"];
  let scaled = value;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  const rounded = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  return `${rounded} ${units[unit]}`;
};

const backendMessages = {
  helix_ask_runtime: "storageMap.display.backend.helixAskRuntime",
  localStorage: "storageMap.display.backend.localStorage",
  sessionStorage: "storageMap.display.backend.sessionStorage",
  profile_server: "storageMap.display.backend.profileServer",
  replit_app_storage: "storageMap.display.backend.replitAppStorage",
} satisfies DisplayMessageMap;

const scopeMessages = {
  browser_guest: "storageMap.display.scope.browserGuest",
  profile: "storageMap.display.scope.profile",
  surface_session_only: "storageMap.display.scope.surfaceSessionOnly",
} satisfies DisplayMessageMap;

const syncMessages = {
  local_only: "storageMap.display.sync.localOnly",
  profile_candidate: "storageMap.display.sync.profileCandidate",
  profile_synced: "storageMap.display.sync.profileSynced",
} satisfies DisplayMessageMap;

const statusMessages = {
  available: "storageMap.display.status.available",
  configured_missing: "storageMap.display.status.configuredMissing",
  degraded: "storageMap.display.status.degraded",
  error: "storageMap.display.status.error",
  unknown: "storageMap.display.status.unknown",
} satisfies DisplayMessageMap;

const displayMappedValue = (t: Translate, value: string | null | undefined, messages: DisplayMessageMap): string => {
  if (!value) return t("workstation.common.unknown");
  const messageId = messages[value];
  return messageId ? t(messageId) : value;
};

const backendClass = (backend: string): string => {
  switch (backend) {
    case "helix_ask_runtime":
      return "border-sky-200/40 bg-sky-500/25 text-sky-50";
    case "localStorage":
      return "border-cyan-200/40 bg-cyan-500/25 text-cyan-50";
    case "sessionStorage":
      return "border-amber-200/40 bg-amber-500/25 text-amber-50";
    case "profile_server":
      return "border-emerald-200/40 bg-emerald-500/25 text-emerald-50";
    case "replit_app_storage":
      return "border-fuchsia-200/40 bg-fuchsia-500/25 text-fuchsia-50";
    default:
      return "border-slate-300/30 bg-slate-600/25 text-slate-100";
  }
};

const statusClass = (status: string): string => {
  switch (status) {
    case "available":
      return "border-emerald-300/40 bg-emerald-500/10 text-emerald-100";
    case "configured_missing":
    case "degraded":
      return "border-amber-300/40 bg-amber-500/10 text-amber-100";
    case "error":
      return "border-rose-300/40 bg-rose-500/10 text-rose-100";
    default:
      return "border-slate-500/30 bg-slate-800 text-slate-300";
  }
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const splitTreemap = (
  records: readonly HelixWorkspaceStorageRecord[],
  x: number,
  y: number,
  w: number,
  h: number,
): Rect[] => {
  if (records.length === 0) return [];
  if (records.length === 1) return [{ record: records[0]!, x, y, w, h }];
  const total = records.reduce((sum, record) => sum + Math.max(1, record.size_bytes ?? 1), 0);
  let running = 0;
  let splitIndex = 1;
  for (let index = 0; index < records.length; index += 1) {
    running += Math.max(1, records[index]?.size_bytes ?? 1);
    if (running >= total / 2) {
      splitIndex = index + 1;
      break;
    }
  }
  splitIndex = clamp(splitIndex, 1, records.length - 1);
  const left = records.slice(0, splitIndex);
  const right = records.slice(splitIndex);
  const leftTotal = left.reduce((sum, record) => sum + Math.max(1, record.size_bytes ?? 1), 0);
  const ratio = leftTotal / total;
  if (w >= h) {
    const leftW = Math.max(14, Math.round(w * ratio));
    return [
      ...splitTreemap(left, x, y, leftW, h),
      ...splitTreemap(right, x + leftW, y, Math.max(0, w - leftW), h),
    ];
  }
  const topH = Math.max(14, Math.round(h * ratio));
  return [
    ...splitTreemap(left, x, y, w, topH),
    ...splitTreemap(right, x, y + topH, w, Math.max(0, h - topH)),
  ];
};

const usableRecords = (records: readonly HelixWorkspaceStorageRecord[]): HelixWorkspaceStorageRecord[] =>
  sortHelixWorkspaceStorageRecords(records).filter((record) => record.size_bytes != null && record.size_bytes > 0);

const readDiagnosticNumber = (
  diagnostics: HelixWorkspaceStorageRecord["diagnostics"] | undefined,
  key: string,
): number | null => {
  const value = diagnostics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const readDiagnosticString = (
  diagnostics: HelixWorkspaceStorageRecord["diagnostics"] | undefined,
  key: string,
): string | null => {
  const value = diagnostics?.[key];
  return typeof value === "string" && value.trim() ? value : null;
};

const readDiagnosticBoolean = (
  diagnostics: HelixWorkspaceStorageRecord["diagnostics"] | undefined,
  key: string,
): boolean | null => {
  const value = diagnostics?.[key];
  return typeof value === "boolean" ? value : null;
};

const formatTokens = (value: number | null | undefined, t: Translate): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return t("workstation.common.unknown");
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
};

const formatPercent = (ratio: number | null | undefined, t: Translate): string => {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return t("workstation.common.unknown");
  return `${Math.round(ratio * 1000) / 10}%`;
};

export default function WorkstationStorageMapPanel() {
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(interfaceLanguage.code);
  const registryArtifacts = useWorkspaceMemoryRegistryStore((state) => state.artifacts);
  const registrySnapshot = React.useMemo(() => {
    const artifacts = Object.values(registryArtifacts).sort((left, right) => {
      const bTime = Date.parse(right.updated_at);
      const aTime = Date.parse(left.updated_at);
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
    return {
      schema: HELIX_WORKSPACE_MEMORY_REGISTRY_SCHEMA,
      artifacts,
      profile_ready_artifact_count: artifacts.filter((artifact) => artifact.sync_status === "profile_candidate").length,
      local_only_artifact_count: artifacts.filter((artifact) => artifact.sync_status === "local_only").length,
      session_only_artifact_count: artifacts.filter((artifact) => artifact.owner_scope === "surface_session_only").length,
    };
  }, [registryArtifacts]);
  const [serverStatus, setServerStatus] = React.useState<HelixWorkspaceStorageStatus | null>(null);
  const [storageStatus, setStorageStatus] = React.useState<HelixWorkspaceStorageStatus>(() =>
    buildBrowserWorkspaceStorageStatus({ registry: registrySnapshot }),
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const rebuildBrowserStatus = React.useCallback((server: HelixWorkspaceStorageStatus | null = serverStatus) => {
    const next = buildBrowserWorkspaceStorageStatus({
      registry: registrySnapshot,
      serverStatus: server,
      thread_id: "helix-ask:desktop",
    });
    setStorageStatus(next);
    setSelectedId((current) => current ?? next.summary.largest_artifact_id);
  }, [registrySnapshot, serverStatus]);

  const refreshServerStatus = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace-os/storage/status?thread_id=helix-ask%3Adesktop", { signal });
      if (!response.ok) throw new Error(`storage-status ${response.status}`);
      const body = await response.json() as HelixWorkspaceStorageStatus;
      setServerStatus(body);
      rebuildBrowserStatus(body);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Failed to load storage status.");
        rebuildBrowserStatus(null);
      }
    } finally {
      setLoading(false);
    }
  }, [rebuildBrowserStatus]);

  React.useEffect(() => {
    rebuildBrowserStatus();
  }, [rebuildBrowserStatus]);

  React.useEffect(() => {
    const controller = new AbortController();
    void refreshServerStatus(controller.signal);
    const timer = window.setInterval(() => {
      void refreshServerStatus();
    }, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refreshServerStatus]);

  const treemapRecords = React.useMemo(() => usableRecords(storageStatus.records).slice(0, 80), [storageStatus.records]);
  const rects = React.useMemo(() => splitTreemap(treemapRecords, 0, 0, 1000, 520), [treemapRecords]);
  const selected = storageStatus.records.find((record) => record.artifact_id === selectedId) ?? storageStatus.records[0] ?? null;
  const activeContextRecord = storageStatus.records.find(
    (record) => record.artifact_id === "helix.ask.active_context_page_file",
  ) ?? null;
  const activeContextDiagnostics = activeContextRecord?.diagnostics;
  const activeContextTokens = readDiagnosticNumber(activeContextDiagnostics, "active_context_total_tokens");
  const activeContextWindow = readDiagnosticNumber(activeContextDiagnostics, "model_context_window_tokens");
  const activeContextRatio = readDiagnosticNumber(activeContextDiagnostics, "usage_ratio");
  const activeContextCompaction = readDiagnosticString(activeContextDiagnostics, "compaction_mode") ?? "none";
  const activeContextHandoff = readDiagnosticString(activeContextDiagnostics, "handoff_state") ?? "idle";
  const activeContextPaused = readDiagnosticBoolean(activeContextDiagnostics, "chat_turns_paused") ?? false;
  const activeContextPendingInputs = readDiagnosticNumber(activeContextDiagnostics, "pending_user_inputs_count") ?? 0;
  const activeContextUnresolvedFrames = readDiagnosticNumber(activeContextDiagnostics, "unresolved_task_frames_count") ?? 0;
  const activeContextModelVisible = readDiagnosticBoolean(activeContextDiagnostics, "model_visible_context_included") ?? false;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <HardDrive className="h-4 w-4 text-cyan-200" />
          {t("storageMap.header.title")}
        </div>
        <button data-helix-interaction-kind="observe" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-storage-map.workstation-storage-map-panel.void-refresh-server-status"
          type="button"
          onClick={() => void refreshServerStatus()}
          className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:border-cyan-300/40 hover:bg-cyan-500/10"
          title={t("storageMap.action.refresh")}
          aria-label={t("storageMap.action.refreshAria")}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {t("storageMap.action.refresh")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-white/10 bg-white/10 text-xs md:grid-cols-4">
        <div className="bg-slate-950 px-3 py-2">
          <div className="flex items-center gap-1.5 text-slate-400"><Database className="h-3.5 w-3.5" /> {t("storageMap.summary.observed")}</div>
          <div className="mt-1 font-semibold text-slate-100">{formatBytes(storageStatus.summary.total_observed_bytes, t)}</div>
        </div>
        <div className="bg-slate-950 px-3 py-2">
          <div className="flex items-center gap-1.5 text-slate-400"><Layers className="h-3.5 w-3.5" /> {t("storageMap.summary.artifacts")}</div>
          <div className="mt-1 font-semibold text-slate-100">{storageStatus.summary.artifact_count}</div>
        </div>
        <div className="bg-slate-950 px-3 py-2">
          <div className="flex items-center gap-1.5 text-slate-400"><Server className="h-3.5 w-3.5" /> {t("storageMap.summary.profile")}</div>
          <div className="mt-1 font-semibold text-slate-100">{formatBytes(storageStatus.summary.profile_storage_bytes, t)}</div>
        </div>
        <div className="bg-slate-950 px-3 py-2">
          <div className="text-slate-400">{t("storageMap.summary.pressure")}</div>
          <div className="mt-1 font-semibold text-slate-100">{storageStatus.summary.pressure}</div>
        </div>
      </div>

      {error ? (
        <div className="border-b border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{error}</div>
      ) : null}

      <div className="border-b border-white/10 bg-slate-950 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-slate-100">
            <Activity className="h-4 w-4 text-sky-200" />
            {t("storageMap.activeContext.title")}
          </div>
          <div className={`rounded border px-2 py-0.5 text-[10px] uppercase ${activeContextPaused ? "border-amber-300/40 bg-amber-500/10 text-amber-100" : "border-slate-500/30 bg-slate-900 text-slate-300"}`}>
            {activeContextPaused ? t("storageMap.activeContext.chatPaused") : activeContextHandoff}
          </div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-slate-500">{t("storageMap.activeContext.contextTokens")}</div>
            <div className="font-semibold text-slate-100">
              {formatTokens(activeContextTokens, t)} / {formatTokens(activeContextWindow, t)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">{t("storageMap.activeContext.usage")}</div>
            <div className="font-semibold text-slate-100">{formatPercent(activeContextRatio, t)}</div>
          </div>
          <div>
            <div className="text-slate-500">{t("storageMap.activeContext.compaction")}</div>
            <div className="font-semibold text-slate-100">{activeContextCompaction.replace(/_/g, " ")}</div>
          </div>
          <div>
            <div className="text-slate-500">{t("storageMap.activeContext.pendingFrames")}</div>
            <div className="font-semibold text-slate-100">
              {t("storageMap.activeContext.pendingFramesValue", {
                inputs: activeContextPendingInputs,
                frames: activeContextUnresolvedFrames,
              })}
            </div>
          </div>
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          {t("storageMap.activeContext.modelVisible", {
            value: activeContextModelVisible ? t("workstation.common.yes") : t("workstation.common.no"),
          })}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(240px,1fr)_240px] lg:grid-cols-[minmax(420px,1fr)_360px] lg:grid-rows-1">
        <div className="relative min-h-0 overflow-hidden border-b border-white/10 bg-slate-900 lg:border-b-0 lg:border-r">
          {rects.length > 0 ? (
            <div className="absolute inset-0">
              {rects.map((rect) => {
                const selectedRect = rect.record.artifact_id === selected?.artifact_id;
                return (
                  <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-storage-map.workstation-storage-map-panel.set-selected-id-rect-record-artifact-id"
                    key={rect.record.artifact_id}
                    type="button"
                    onClick={() => setSelectedId(rect.record.artifact_id)}
                    className={`absolute overflow-hidden border p-1 text-left transition hover:brightness-125 ${backendClass(rect.record.storage_backend)} ${selectedRect ? "ring-2 ring-white/80" : ""}`}
                    style={{
                      left: `${rect.x / 10}%`,
                      top: `${rect.y / 5.2}%`,
                      width: `${Math.max(0.8, rect.w / 10)}%`,
                      height: `${Math.max(1.2, rect.h / 5.2)}%`,
                    }}
                    title={`${rect.record.label} - ${formatBytes(rect.record.size_bytes, t)}`}
                    aria-label={`${rect.record.label} ${formatBytes(rect.record.size_bytes, t)}`}
                  >
                    <span className="block truncate text-[11px] font-semibold leading-tight">{rect.record.label}</span>
                    <span className="mt-0.5 block text-[10px] leading-tight opacity-85">{formatBytes(rect.record.size_bytes, t)}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              {t("storageMap.empty")}
            </div>
          )}
        </div>

        <div className="min-h-0 overflow-auto bg-slate-950">
          {selected ? (
            <div className="border-b border-white/10 px-3 py-3">
              <div className="truncate text-sm font-semibold text-slate-100">{selected.label}</div>
              <div className="mt-1 truncate text-[11px] text-slate-500">{selected.path_ref}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-slate-500">{t("storageMap.detail.size")}</div>
                  <div className="font-semibold">{formatBytes(selected.size_bytes, t)}</div>
                </div>
                <div>
                  <div className="text-slate-500">{t("storageMap.detail.backend")}</div>
                  <div className="truncate font-semibold">{displayMappedValue(t, selected.storage_backend, backendMessages)}</div>
                </div>
                <div>
                  <div className="text-slate-500">{t("storageMap.detail.scope")}</div>
                  <div className="truncate font-semibold">{displayMappedValue(t, selected.owner_scope, scopeMessages)}</div>
                </div>
                <div>
                  <div className="text-slate-500">{t("storageMap.detail.sync")}</div>
                  <div className="truncate font-semibold">{displayMappedValue(t, selected.sync_status, syncMessages)}</div>
                </div>
              </div>
              <div className="mt-3">
                <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] uppercase ${statusClass(selected.status)}`}>
                  {displayMappedValue(t, selected.status, statusMessages)}
                </span>
              </div>
            </div>
          ) : null}

          <table className="w-full table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="w-[44%] px-3 py-2 font-medium">{t("storageMap.table.name")}</th>
                <th className="w-[22%] px-3 py-2 font-medium">{t("storageMap.table.size")}</th>
                <th className="w-[34%] px-3 py-2 font-medium">{t("storageMap.table.backend")}</th>
              </tr>
            </thead>
            <tbody>
              {storageStatus.records.map((record) => (
                <tr data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-storage-map.workstation-storage-map-panel.set-selected-id-record-artifact-id"
                  key={record.artifact_id}
                  className={`cursor-pointer border-b border-white/5 hover:bg-white/[0.03] ${record.artifact_id === selected?.artifact_id ? "bg-white/[0.05]" : ""}`}
                  onClick={() => setSelectedId(record.artifact_id)}
                >
                  <td className="px-3 py-2">
                    <div className="truncate font-medium text-slate-100">{record.label}</div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-500">{record.artifact_type}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-100">{formatBytes(record.size_bytes, t)}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {record.observed ? t("storageMap.record.observed") : t("workstation.common.unknown")}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="truncate text-slate-300">{displayMappedValue(t, record.storage_backend, backendMessages)}</div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-500">{displayMappedValue(t, record.owner_scope, scopeMessages)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-white/10 px-3 py-2 text-[11px] text-slate-500">
        {t("storageMap.footer", { schema: storageStatus.schema_version })}
      </div>
    </div>
  );
}
