import * as React from "react";
import { Activity, Gauge, Monitor, RefreshCw, Server } from "lucide-react";
import { getPanelDef } from "@/lib/desktop/panelRegistry";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText, type InterfaceTextResolver } from "@/lib/i18n/interfaceText";
import type { InterfaceMessageId } from "@/lib/i18n/messages/types";
import { useMobileAppStore } from "@/store/useMobileAppStore";
import { useWorkstationInteractionStore, type WorkstationInteractionState } from "@/store/useWorkstationInteractionStore";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { useWorkstationPerformanceStore } from "@/store/useWorkstationPerformanceStore";
import {
  isInteractionActive,
  runWhenQuiet,
} from "@/lib/workstation/performance/workstationInteractionScheduler";
import {
  sortHelixWorkstationTaskManagerProcesses,
  summarizeHelixWorkstationTaskManager,
  withHelixWorkstationTaskManagerAuthority,
  type HelixWorkstationBrowserPerformanceSample,
  type HelixWorkstationTaskManagerProcess,
  type HelixWorkstationTaskManagerProcessStatus,
  type HelixWorkstationTaskManagerSnapshot,
} from "@shared/helix-workstation-task-manager";

type BrowserPerformanceMemory = {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
};

const BYTES_PER_MIB = 1024 * 1024;
const POLL_INTERVAL_MS = 5000;
const VISIBLE_UPDATE_INTERVAL_MS = 1500;
const INTERACTION_UPDATE_INTERVAL_MS = 3500;
let cachedBrowserDomNodeCount = 0;
let cachedStagePlayPacketNodeCount: number | null = null;
type Translate = InterfaceTextResolver["t"];
type DisplayMessageMap = Record<string, InterfaceMessageId>;

type TaskManagerInteractionState = Pick<
  WorkstationInteractionState,
  | "mode"
  | "source"
  | "activeSinceMs"
  | "lastInteractionAtMs"
  | "lastQuietAtMs"
  | "pendingTaskCount"
  | "pendingByPriority"
  | "deferredTaskCount"
  | "lastDeferredAtMs"
>;
type TaskManagerPerformanceState = ReturnType<typeof useWorkstationPerformanceStore.getState>;

const snapshotInteractionState = (
  state: WorkstationInteractionState,
): TaskManagerInteractionState => ({
  mode: state.mode,
  source: state.source,
  activeSinceMs: state.activeSinceMs,
  lastInteractionAtMs: state.lastInteractionAtMs,
  lastQuietAtMs: state.lastQuietAtMs,
  pendingTaskCount: state.pendingTaskCount,
  pendingByPriority: { ...state.pendingByPriority },
  deferredTaskCount: state.deferredTaskCount,
  lastDeferredAtMs: state.lastDeferredAtMs,
});

const readBrowserDomNodeCount = (): number => {
  if (typeof document === "undefined") return 0;
  if (isInteractionActive(500)) return cachedBrowserDomNodeCount;
  cachedBrowserDomNodeCount = document.getElementsByTagName("*").length;
  return cachedBrowserDomNodeCount;
};

const readStagePlayPacketNodeCount = (): number | null => {
  if (typeof document === "undefined") return null;
  if (isInteractionActive(500)) return cachedStagePlayPacketNodeCount;
  cachedStagePlayPacketNodeCount = document.querySelectorAll('[data-testid*="stage-play"][data-testid*="packet"]').length;
  return cachedStagePlayPacketNodeCount;
};

const formatMiB = (value: number | null | undefined, t: Translate): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return t("workstation.common.unknown");
  if (value >= 100) return `${Math.round(value)} MiB`;
  return `${Math.round(value * 10) / 10} MiB`;
};

const formatMetric = (value: number | null | undefined, suffix: string, t: Translate): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return t("workstation.common.unknown");
  return `${Math.round(value * 10) / 10}${suffix}`;
};

const toMiB = (value: number | null | undefined): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round((value / BYTES_PER_MIB) * 10) / 10;
};

const statusClass = (status: string): string => {
  switch (status) {
    case "active":
    case "focused":
      return "border-emerald-300/40 bg-emerald-500/10 text-emerald-100";
    case "background":
      return "border-slate-300/30 bg-slate-500/10 text-slate-200";
    case "hidden":
    case "suspended":
      return "border-slate-500/30 bg-slate-800 text-slate-400";
    case "deload_candidate":
      return "border-orange-300/40 bg-orange-500/10 text-orange-100";
    case "open":
    case "idle":
      return "border-slate-400/30 bg-slate-500/10 text-slate-200";
    case "queued":
    case "degraded":
      return "border-amber-300/40 bg-amber-500/10 text-amber-100";
    case "paused":
      return "border-cyan-300/40 bg-cyan-500/10 text-cyan-100";
    case "blocked":
      return "border-rose-300/40 bg-rose-500/10 text-rose-100";
    default:
      return "border-slate-500/30 bg-slate-800 text-slate-300";
  }
};

const statusMessages = {
  active: "taskManager.display.status.active",
  open: "taskManager.display.status.open",
  focused: "taskManager.display.status.focused",
  background: "taskManager.display.status.background",
  hidden: "taskManager.display.status.hidden",
  idle: "taskManager.display.status.idle",
  queued: "taskManager.display.status.queued",
  paused: "taskManager.display.status.paused",
  suspended: "taskManager.display.status.suspended",
  deload_candidate: "taskManager.display.status.deloadCandidate",
  blocked: "taskManager.display.status.blocked",
  degraded: "taskManager.display.status.degraded",
  unknown: "taskManager.display.status.unknown",
} satisfies DisplayMessageMap;

const kindMessages = {
  server_runtime: "taskManager.display.kind.serverRuntime",
  runtime_task: "taskManager.display.kind.runtimeTask",
  runtime_task_class: "taskManager.display.kind.runtimeTaskClass",
  browser_renderer: "taskManager.display.kind.browserRenderer",
  browser_frame_loop: "taskManager.display.kind.browserFrameLoop",
  browser_interaction_loop: "taskManager.display.kind.browserInteractionLoop",
  workstation_scheduler: "taskManager.display.kind.workstationScheduler",
  workstation_command_reliability: "taskManager.display.kind.workstationCommandReliability",
  workstation_panel: "taskManager.display.kind.workstationPanel",
  stage_play_packet_flow: "taskManager.display.kind.stagePlayPacketFlow",
  workspace_os: "taskManager.display.kind.workspaceOs",
  unknown: "taskManager.display.kind.unknown",
} satisfies DisplayMessageMap;

const displayMappedValue = (t: Translate, value: string | null | undefined, messages: DisplayMessageMap): string => {
  if (!value) return t("workstation.common.unknown");
  const messageId = messages[value];
  return messageId ? t(messageId) : value;
};

const memoryDisplay = (process: HelixWorkstationTaskManagerProcess, t: Translate): string => {
  const memory = process.memory;
  if (memory.used_mib != null) return formatMiB(memory.used_mib, t);
  if (memory.rss_mib != null) return formatMiB(memory.rss_mib, t);
  if (memory.heap_used_mib != null) return formatMiB(memory.heap_used_mib, t);
  if (memory.estimate_mib != null) return `~${formatMiB(memory.estimate_mib, t)}`;
  return t("workstation.common.unknown");
};

const signalDisplay = (process: HelixWorkstationTaskManagerProcess, t: Translate): string => {
  if (process.kind === "browser_frame_loop") {
    const fps = typeof process.diagnostics?.fps === "number" ? `${process.diagnostics.fps} fps` : t("taskManager.signal.fpsUnknown");
    const p95 = typeof process.diagnostics?.p95_frame_ms === "number"
      ? t("taskManager.signal.p95Value", { value: process.diagnostics.p95_frame_ms })
      : t("taskManager.signal.p95Unknown");
    return `${fps} / ${p95}`;
  }
  if (process.kind === "browser_interaction_loop") {
    const p95 = typeof process.diagnostics?.input_to_next_frame_p95_ms === "number"
      ? t("taskManager.signal.inputP95Value", { value: process.diagnostics.input_to_next_frame_p95_ms })
      : t("taskManager.signal.inputP95Unknown");
    const active = typeof process.diagnostics?.active_interaction_kind === "string"
      ? process.diagnostics.active_interaction_kind
      : t("taskManager.signal.interaction");
    return `${active} / ${p95}`;
  }
  if (process.kind === "workstation_command_reliability") {
    const failed = typeof process.diagnostics?.failed_receipt_count === "number" ? process.diagnostics.failed_receipt_count : 0;
    const recent = typeof process.diagnostics?.recent_receipt_count === "number" ? process.diagnostics.recent_receipt_count : 0;
    return t("taskManager.signal.receiptsValue", { recent, failed });
  }
  if (process.kind === "workstation_scheduler") {
    const mode = typeof process.diagnostics?.interaction_mode === "string"
      ? process.diagnostics.interaction_mode
      : t("workstation.common.unknown");
    const pending = typeof process.diagnostics?.pending_task_count === "number" ? process.diagnostics.pending_task_count : 0;
    return t("taskManager.signal.queuedValue", { mode, pending });
  }
  if (process.panel_id && typeof process.diagnostics?.render_pressure === "string") {
    return process.diagnostics.render_pressure;
  }
  return process.task_class ?? process.panel_id ?? process.source ?? "";
};

const sampleBrowserMemory = (): HelixWorkstationTaskManagerProcess | null => {
  if (typeof window === "undefined") return null;
  const memory = (window.performance as Performance & { memory?: BrowserPerformanceMemory }).memory;
  if (!memory) {
    return withHelixWorkstationTaskManagerAuthority({
      process_id: "browser.renderer",
      label: "Browser renderer",
      kind: "browser_renderer",
      status: "unknown",
      source: "browser_performance_memory",
      updated_at: new Date().toISOString(),
      memory: {
        source: "browser_performance_memory",
        approximate: true,
        observed: false,
        estimate_mib: null,
        pressure: "unknown",
      },
      diagnostics: {
        browser_memory_api_available: false,
        dom_node_count: readBrowserDomNodeCount(),
      },
    });
  }
  return withHelixWorkstationTaskManagerAuthority({
    process_id: "browser.renderer",
    label: "Browser renderer",
    kind: "browser_renderer",
    status: "active",
    source: "browser_performance_memory",
    updated_at: new Date().toISOString(),
    memory: {
      source: "browser_performance_memory",
      approximate: true,
      observed: true,
      used_mib: toMiB(memory.usedJSHeapSize),
      heap_used_mib: toMiB(memory.usedJSHeapSize),
      heap_total_mib: toMiB(memory.totalJSHeapSize),
      heap_limit_mib: toMiB(memory.jsHeapSizeLimit),
      pressure: "browser_renderer_heap",
    },
    diagnostics: {
      browser_memory_api_available: true,
      dom_node_count: readBrowserDomNodeCount(),
    },
  });
};

const panelEstimateMiB = (panelId: string): number | null => {
  if (panelId === "stage-play-badge-graph") return 96;
  if (panelId === "theory-badge-graph") return 72;
  if (panelId === "live-answer-environment") return 48;
  if (panelId === "image-lens" || panelId === "document-image-lens") return 48;
  if (panelId === "workstation-process-graph") return 32;
  return getPanelDef(panelId)?.heavy ? 64 : null;
};

const panelRenderStatus = (
  panelId: string,
  isFocused: boolean,
  estimateMiB: number | null,
  performanceSample: HelixWorkstationBrowserPerformanceSample | null,
): HelixWorkstationTaskManagerProcessStatus => {
  if (isFocused) return "focused";
  if (performanceSample?.visibility_state === "hidden") return "hidden";
  const pressure = performanceSample?.advisory_pressure ?? "unknown";
  const expensiveBackgroundPanel =
    panelId === "stage-play-badge-graph" ||
    panelId === "theory-badge-graph" ||
    panelId === "workstation-process-graph" ||
    (estimateMiB ?? 0) >= 48;
  if ((pressure === "degraded" || pressure === "blocked") && expensiveBackgroundPanel) {
    return "deload_candidate";
  }
  return "background";
};

const buildFrameLoopProcess = (
  sample: HelixWorkstationBrowserPerformanceSample | null,
): HelixWorkstationTaskManagerProcess | null => {
  if (!sample) return null;
  return withHelixWorkstationTaskManagerAuthority({
    process_id: "browser.frame_loop",
    label: "UI frame loop",
    kind: "browser_frame_loop",
    status: sample.visibility_state === "hidden"
      ? "hidden"
      : sample.advisory_pressure === "blocked"
        ? "blocked"
        : sample.advisory_pressure === "degraded"
          ? "degraded"
          : sample.advisory_pressure === "normal"
            ? "active"
            : "unknown",
    source: "browser_frame_sampler",
    updated_at: sample.sampled_at,
    memory: {
      source: "browser_frame_sampler",
      approximate: true,
      observed: false,
      estimate_mib: null,
      pressure: sample.advisory_pressure,
    },
    diagnostics: {
      fps: sample.fps,
      average_frame_ms: sample.average_frame_ms,
      p95_frame_ms: sample.p95_frame_ms,
      worst_frame_ms: sample.worst_frame_ms,
      long_frame_count: sample.long_frame_count,
      long_frame_ratio: sample.long_frame_ratio,
      long_task_count: sample.long_task_count,
      long_task_total_ms: sample.long_task_total_ms,
      dom_node_count: sample.dom_node_count,
      open_panel_count: sample.open_panel_count,
      focused_panel_id: sample.focused_panel_id,
      visibility_state: sample.visibility_state,
    },
  });
};

const buildInteractionLoopProcess = (
  sample: HelixWorkstationBrowserPerformanceSample | null,
): HelixWorkstationTaskManagerProcess | null => {
  if (!sample) return null;
  return withHelixWorkstationTaskManagerAuthority({
    process_id: "browser.interaction_loop",
    label: "UI responsiveness",
    kind: "browser_interaction_loop",
    status: sample.visibility_state === "hidden"
      ? "hidden"
      : sample.responsiveness_pressure === "blocked"
        ? "blocked"
        : sample.responsiveness_pressure === "degraded"
          ? "degraded"
          : sample.responsiveness_pressure === "normal"
            ? "active"
            : "unknown",
    source: "browser_interaction_sampler",
    updated_at: sample.sampled_at,
    memory: {
      source: "browser_interaction_sampler",
      approximate: true,
      observed: false,
      estimate_mib: null,
      pressure: sample.responsiveness_pressure ?? "unknown",
    },
    diagnostics: {
      interaction_event_count: sample.interaction_event_count ?? 0,
      input_delay_p95_ms: sample.input_delay_p95_ms ?? null,
      input_to_next_frame_p95_ms: sample.input_to_next_frame_p95_ms ?? null,
      click_to_next_frame_p95_ms: sample.click_to_next_frame_p95_ms ?? null,
      scroll_jank_count: sample.scroll_jank_count ?? 0,
      drag_jank_count: sample.drag_jank_count ?? 0,
      active_interaction_kind: sample.active_interaction_kind ?? null,
      active_panel_id: sample.active_panel_id ?? null,
    },
  });
};

const buildSchedulerProcess = (
  interaction: TaskManagerInteractionState,
): HelixWorkstationTaskManagerProcess =>
  withHelixWorkstationTaskManagerAuthority({
    process_id: "workstation.interaction_scheduler",
    label: "Workstation interaction scheduler",
    kind: "workstation_scheduler",
    status: interaction.mode === "idle"
      ? "idle"
      : interaction.mode === "blocked"
        ? "blocked"
        : "active",
    source: "workstation_interaction_scheduler",
    updated_at: new Date().toISOString(),
    memory: {
      source: "workstation_scheduler",
      approximate: true,
      observed: false,
      estimate_mib: null,
      pressure: interaction.mode,
    },
    diagnostics: {
      interaction_mode: interaction.mode,
      interaction_source: interaction.source,
      active_since_ms: interaction.activeSinceMs,
      last_interaction_at_ms: interaction.lastInteractionAtMs,
      last_quiet_at_ms: interaction.lastQuietAtMs,
      pending_task_count: interaction.pendingTaskCount,
      pending_immediate_input_count: interaction.pendingByPriority.immediate_input,
      pending_visual_frame_count: interaction.pendingByPriority.visual_frame,
      pending_committed_layout_count: interaction.pendingByPriority.committed_layout,
      pending_evidence_refresh_count: interaction.pendingByPriority.evidence_refresh,
      pending_share_state_count: interaction.pendingByPriority.share_state,
      pending_background_diagnostics_count: interaction.pendingByPriority.background_diagnostics,
      deferred_task_count: interaction.deferredTaskCount,
      last_deferred_at_ms: interaction.lastDeferredAtMs,
    },
  });

const buildPanelProcesses = (
  panelIds: readonly string[],
  focusedPanelId: string | null | undefined,
  source: "workstation_layout_store" | "mobile_app_store",
  performanceSample: HelixWorkstationBrowserPerformanceSample | null,
): HelixWorkstationTaskManagerProcess[] =>
  Array.from(new Set(panelIds)).map((panelId: string) => {
    const def = getPanelDef(panelId);
    const isFocused = focusedPanelId === panelId;
    const estimateMiB = panelEstimateMiB(panelId);
    const renderStatus = panelRenderStatus(panelId, isFocused, estimateMiB, performanceSample);
    const packetNodeCount = panelId === "stage-play-badge-graph"
      ? readStagePlayPacketNodeCount()
      : null;
    return withHelixWorkstationTaskManagerAuthority({
      process_id: `panel.${panelId}`,
      label: def?.title ?? panelId,
      kind: panelId === "stage-play-badge-graph" ? "stage_play_packet_flow" : "workstation_panel",
      status: renderStatus,
      panel_id: panelId,
      source,
      updated_at: new Date().toISOString(),
      memory: {
        source: panelId === "stage-play-badge-graph" ? "stage_play_panel_projection" : "browser_panel_registry",
        approximate: true,
        observed: false,
        estimate_mib: estimateMiB,
        pressure: null,
      },
      diagnostics: {
        memory_is_panel_level_estimate: true,
        panel_weight: def?.heavy ? "heavy" : "standard",
        render_pressure: renderStatus === "deload_candidate" ? "background_visual_pressure" : performanceSample?.advisory_pressure ?? "unknown",
        ui_fps: performanceSample?.fps ?? null,
        ui_p95_frame_ms: performanceSample?.p95_frame_ms ?? null,
        state_preserved_if_deloaded: true,
        stage_play_packet_dom_node_count: packetNodeCount,
      },
    });
  });

const mergeProcesses = (
  serverSnapshot: HelixWorkstationTaskManagerSnapshot | null,
  browserProcesses: readonly HelixWorkstationTaskManagerProcess[],
): HelixWorkstationTaskManagerProcess[] => {
  const byId = new Map<string, HelixWorkstationTaskManagerProcess>();
  for (const process of serverSnapshot?.processes ?? []) byId.set(process.process_id, process);
  for (const process of browserProcesses) byId.set(process.process_id, process);
  return sortHelixWorkstationTaskManagerProcesses([...byId.values()]);
};

const budgetIntervalMs = (): number =>
  isInteractionActive(500) ? INTERACTION_UPDATE_INTERVAL_MS : VISIBLE_UPDATE_INTERVAL_MS;

const useBudgetedBrowserPerformanceSample = (): HelixWorkstationBrowserPerformanceSample | null => {
  const [visibleSample, setVisibleSample] = React.useState<HelixWorkstationBrowserPerformanceSample | null>(() =>
    useWorkstationPerformanceStore.getState().latest
  );
  const pendingSampleRef = React.useRef<HelixWorkstationBrowserPerformanceSample | null>(visibleSample);
  const lastVisibleUpdateAtRef = React.useRef(visibleSample ? Date.now() : 0);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const apply = () => {
      timerRef.current = null;
      lastVisibleUpdateAtRef.current = Date.now();
      const nextSample = pendingSampleRef.current;
      React.startTransition(() => {
        setVisibleSample(nextSample);
      });
    };
    const schedule = (nextSample: HelixWorkstationBrowserPerformanceSample | null) => {
      pendingSampleRef.current = nextSample;
      if (!nextSample) {
        clearTimer();
        apply();
        return;
      }
      const now = Date.now();
      const elapsedMs = now - lastVisibleUpdateAtRef.current;
      const delayMs = Math.max(0, budgetIntervalMs() - elapsedMs);
      if (delayMs === 0) {
        clearTimer();
        apply();
        return;
      }
      if (timerRef.current !== null) return;
      timerRef.current = window.setTimeout(apply, delayMs);
    };

    const unsubscribe = useWorkstationPerformanceStore.subscribe((state: TaskManagerPerformanceState) => {
      schedule(state.latest);
    });
    return () => {
      unsubscribe();
      clearTimer();
    };
  }, []);

  return visibleSample;
};

const useBudgetedInteractionState = (): TaskManagerInteractionState => {
  const [visibleInteractionState, setVisibleInteractionState] = React.useState<TaskManagerInteractionState>(() =>
    snapshotInteractionState(useWorkstationInteractionStore.getState())
  );
  const visibleInteractionRef = React.useRef<TaskManagerInteractionState>(visibleInteractionState);
  const pendingInteractionRef = React.useRef<TaskManagerInteractionState>(visibleInteractionState);
  const lastVisibleUpdateAtRef = React.useRef(Date.now());
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const apply = () => {
      timerRef.current = null;
      lastVisibleUpdateAtRef.current = Date.now();
      const nextInteraction = pendingInteractionRef.current;
      visibleInteractionRef.current = nextInteraction;
      React.startTransition(() => {
        setVisibleInteractionState(nextInteraction);
      });
    };
    const schedule = (state: WorkstationInteractionState) => {
      const nextInteraction = snapshotInteractionState(state);
      pendingInteractionRef.current = nextInteraction;
      const becameIdle = nextInteraction.mode === "idle" && visibleInteractionRef.current.mode !== "idle";
      const becameBlocked = nextInteraction.mode === "blocked" && visibleInteractionRef.current.mode !== "blocked";
      if (becameIdle || becameBlocked) {
        clearTimer();
        apply();
        return;
      }
      const now = Date.now();
      const elapsedMs = now - lastVisibleUpdateAtRef.current;
      const delayMs = Math.max(0, budgetIntervalMs() - elapsedMs);
      if (delayMs === 0) {
        clearTimer();
        apply();
        return;
      }
      if (timerRef.current !== null) return;
      timerRef.current = window.setTimeout(apply, delayMs);
    };

    const unsubscribe = useWorkstationInteractionStore.subscribe(schedule);
    return () => {
      unsubscribe();
      clearTimer();
    };
  }, []);

  return visibleInteractionState;
};

const TaskManagerProcessRow = React.memo(function TaskManagerProcessRow({
  process,
  t,
}: {
  process: HelixWorkstationTaskManagerProcess;
  t: Translate;
}) {
  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.03]">
      <td className="px-3 py-2">
        <div className="font-semibold text-slate-100">{memoryDisplay(process, t)}</div>
        <div className="mt-0.5 text-[10px] text-slate-500">
          {process.memory.observed
            ? t("taskManager.memory.observed")
            : process.memory.estimate_mib != null
              ? t("taskManager.memory.estimated")
              : t("workstation.common.unknown")}
          {process.memory.approximate ? t("taskManager.memory.approximateSuffix") : ""}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="truncate font-medium text-slate-100">{process.label}</div>
        <div className="mt-0.5 truncate text-[10px] text-slate-500">{process.process_id}</div>
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] uppercase ${statusClass(process.status)}`}>
          {displayMappedValue(t, process.status, statusMessages)}
        </span>
      </td>
      <td className="px-3 py-2 text-slate-300">{displayMappedValue(t, process.kind, kindMessages)}</td>
      <td className="px-3 py-2">
        <div className="truncate text-slate-300">{process.memory.source.replace(/_/g, " ")}</div>
        <div className="mt-0.5 truncate text-[10px] text-slate-500">{signalDisplay(process, t)}</div>
      </td>
    </tr>
  );
});

export default function WorkstationTaskManagerPanel() {
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(interfaceLanguage.code);
  const layoutGroups = useWorkstationLayoutStore((state: any) => state.groups);
  const activeGroupId = useWorkstationLayoutStore((state: any) => state.activeGroupId);
  const mobileStack = useMobileAppStore((state: any) => state.stack);
  const mobileActiveId = useMobileAppStore((state: any) => state.activeId);
  const performanceSample = useBudgetedBrowserPerformanceSample();
  const interactionState = useBudgetedInteractionState();
  const [serverSnapshot, setServerSnapshot] = React.useState<HelixWorkstationTaskManagerSnapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const browserProcesses = React.useMemo(() => {
    const layoutPanelIds = Object.values(layoutGroups).flatMap((group: any) => group.panelIds);
    const focusedPanelId = layoutGroups[activeGroupId]?.activePanelId ?? null;
    const panelProcesses = buildPanelProcesses(layoutPanelIds, focusedPanelId, "workstation_layout_store", performanceSample);
    const mobileProcesses = buildPanelProcesses(mobileStack.map((entry: any) => entry.panelId), mobileActiveId, "mobile_app_store", performanceSample);
    const browser = sampleBrowserMemory();
    const frameLoop = buildFrameLoopProcess(performanceSample);
    const interactionLoop = buildInteractionLoopProcess(performanceSample);
    const scheduler = buildSchedulerProcess(interactionState);
    return [
      ...(browser ? [browser] : []),
      ...(frameLoop ? [frameLoop] : []),
      ...(interactionLoop ? [interactionLoop] : []),
      scheduler,
      ...panelProcesses,
      ...mobileProcesses,
    ];
  }, [activeGroupId, interactionState, layoutGroups, mobileActiveId, mobileStack, performanceSample]);

  const refreshServerSnapshot = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace-os/task-manager?thread_id=helix-ask%3Adesktop", { signal });
      if (!response.ok) throw new Error(`task-manager ${response.status}`);
      const body = await response.json() as HelixWorkstationTaskManagerSnapshot;
      React.startTransition(() => {
        setServerSnapshot(body);
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Failed to load task manager snapshot.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    void refreshServerSnapshot(controller.signal);
    const autoRefreshServerSnapshot = () => {
      if (isInteractionActive(500)) {
        runWhenQuiet(() => refreshServerSnapshot(), {
          key: "workstation.task_manager.server_refresh",
          priority: "evidence_refresh",
          quietMs: 650,
          timeoutMs: POLL_INTERVAL_MS,
        });
        return;
      }
      void refreshServerSnapshot();
    };
    const timer = window.setInterval(() => {
      autoRefreshServerSnapshot();
    }, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refreshServerSnapshot]);

  const processes = React.useMemo(
    () => mergeProcesses(serverSnapshot, browserProcesses),
    [browserProcesses, serverSnapshot],
  );
  const summary = React.useMemo(
    () => summarizeHelixWorkstationTaskManager(processes, serverSnapshot?.summary.pressure_level ?? null, performanceSample),
    [performanceSample, processes, serverSnapshot?.summary.pressure_level],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-emerald-200" />
          {t("taskManager.header.title")}
        </div>
        <button data-helix-interaction-kind="observe" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workstation-task-manager.workstation-task-manager-panel.void-refresh-server-snapshot"
          type="button"
          onClick={() => {
            void refreshServerSnapshot();
          }}
          className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:border-emerald-300/40 hover:bg-emerald-500/10"
          title={t("taskManager.action.refresh")}
          aria-label={t("taskManager.action.refreshAria")}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {t("taskManager.action.refresh")}
        </button>
      </div>

      <div className="overflow-x-auto border-b border-white/10 bg-white/10">
        <div className="grid min-w-[46rem] grid-cols-6 gap-px text-xs">
          <div className="min-w-0 bg-slate-950 px-3 py-2">
            <div className="flex items-center gap-1.5 text-slate-400"><Gauge className="h-3.5 w-3.5" /> {t("taskManager.summary.pressure")}</div>
            <div className="mt-1 truncate font-semibold text-slate-100">{summary.pressure_level ?? t("workstation.common.unknown")}</div>
          </div>
          <div className="min-w-0 bg-slate-950 px-3 py-2">
            <div className="text-slate-400">{t("taskManager.summary.uiFps")}</div>
            <div className="mt-1 truncate font-semibold text-slate-100">{formatMetric(summary.ui_fps, "", t)}</div>
          </div>
          <div className="min-w-0 bg-slate-950 px-3 py-2">
            <div className="text-slate-400">{t("taskManager.summary.responsiveness")}</div>
            <div className="mt-1 truncate font-semibold text-slate-100">
              {summary.ui_responsiveness_pressure ?? t("workstation.common.unknown")} / {formatMetric(summary.ui_input_to_next_frame_p95_ms, "ms", t)}
            </div>
          </div>
          <div className="min-w-0 bg-slate-950 px-3 py-2">
            <div className="flex items-center gap-1.5 text-slate-400"><Server className="h-3.5 w-3.5" /> {t("taskManager.summary.observed")}</div>
            <div className="mt-1 truncate font-semibold text-slate-100">{formatMiB(summary.total_observed_mib, t)}</div>
          </div>
          <div className="min-w-0 bg-slate-950 px-3 py-2">
            <div className="flex items-center gap-1.5 text-slate-400"><Monitor className="h-3.5 w-3.5" /> {t("taskManager.summary.processes")}</div>
            <div className="mt-1 truncate font-semibold text-slate-100">{summary.process_count}</div>
          </div>
          <div className="min-w-0 bg-slate-950 px-3 py-2">
            <div className="text-slate-400">{t("taskManager.summary.samples")}</div>
            <div className="mt-1 truncate font-semibold text-slate-100">
              {summary.server_sample_included ? t("taskManager.sample.server") : t("taskManager.sample.noServer")} / {summary.browser_sample_included ? t("taskManager.sample.browser") : t("taskManager.sample.noBrowser")}
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="border-b border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{error}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[54rem] table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="w-[8rem] px-3 py-2 font-medium">{t("taskManager.table.memory")}</th>
              <th className="w-[19rem] px-3 py-2 font-medium">{t("taskManager.table.name")}</th>
              <th className="w-[8rem] px-3 py-2 font-medium">{t("taskManager.table.status")}</th>
              <th className="w-[10rem] px-3 py-2 font-medium">{t("taskManager.table.kind")}</th>
              <th className="w-[9rem] px-3 py-2 font-medium">{t("taskManager.table.signal")}</th>
            </tr>
          </thead>
          <tbody>
            {processes.map((process: HelixWorkstationTaskManagerProcess) => (
              <TaskManagerProcessRow key={process.process_id} process={process} t={t} />
            ))}
            {processes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  {t("taskManager.empty")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="border-t border-white/10 px-3 py-2 text-[11px] text-slate-500">
        {t("taskManager.footer", { schema: serverSnapshot?.schema_version ?? "local.browser_task_manager.v1" })}
      </div>
    </div>
  );
}
