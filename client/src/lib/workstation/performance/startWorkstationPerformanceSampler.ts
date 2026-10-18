import {
  withHelixWorkstationBrowserPerformanceAuthority,
  type HelixWorkstationBrowserPerformanceSample,
} from "@shared/helix-workstation-task-manager";
import { useMobileAppStore } from "@/store/useMobileAppStore";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { useWorkstationPerformanceStore } from "@/store/useWorkstationPerformanceStore";
import {
  getWorkstationInteractionSnapshot,
  isInteractionActive,
  markInteraction,
  runWhenQuiet,
} from "./workstationInteractionScheduler";
import {
  classifyWorkstationUiFramePressure,
  classifyWorkstationInteractionPressure,
  summarizeWorkstationFrameDurations,
  summarizeWorkstationInteractions,
  summarizeWorkstationLongTasks,
  type WorkstationFrameDurationSample,
  type WorkstationInteractionSample,
  type WorkstationLongTaskSample,
} from "./workstationPerformanceStats";

const SAMPLE_WINDOW_MS = 60_000;
const PUBLISH_INTERVAL_MS = 1000;
const SERVER_PUBLISH_INTERVAL_MS = 10_000;
const INTERACTION_SAMPLE_THROTTLE_MS = 50;

let activeRefCount = 0;
let activeStop: (() => void) | null = null;
let lastDomNodeCount = 0;

const visibilityState = (): HelixWorkstationBrowserPerformanceSample["visibility_state"] => {
  if (typeof document === "undefined") return "unknown";
  const state = document.visibilityState;
  if (state === "visible" || state === "hidden" || state === "prerender") return state;
  return "unknown";
};

const openPanelSnapshot = (): { openPanelCount: number; focusedPanelId: string | null } => {
  const layout = useWorkstationLayoutStore.getState();
  const mobile = useMobileAppStore.getState();
  const panelIds = new Set<string>();
  Object.values(layout.groups).forEach((group: { panelIds: string[] }) => {
    group.panelIds.forEach((panelId: string) => panelIds.add(panelId));
  });
  mobile.stack.forEach((entry: { panelId: string }) => panelIds.add(entry.panelId));
  const focusedPanelId =
    layout.groups[layout.activeGroupId]?.activePanelId ??
    mobile.activeId ??
    null;
  return {
    openPanelCount: panelIds.size,
    focusedPanelId,
  };
};

const pruneSamples = <T extends { ts: number }>(samples: T[], nowMs: number): void => {
  const cutoff = nowMs - SAMPLE_WINDOW_MS;
  while (samples.length > 0 && samples[0].ts < cutoff) {
    samples.shift();
  }
};

function startSamplerInstance(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const frameSamples: WorkstationFrameDurationSample[] = [];
  const interactionSamples: WorkstationInteractionSample[] = [];
  const longTaskSamples: WorkstationLongTaskSample[] = [];
  let rafId: number | null = null;
  let lastFrameAtMs: number | null = null;
  let lastFrameDurationMs: number | null = null;
  let lastInteractionSampleAtMs = 0;
  let cancelDeferredPublish: (() => void) | null = null;
  let lastServerPublishAtMs = Number.NEGATIVE_INFINITY;
  let stopped = false;

  const readDomNodeCount = () => {
    if (typeof document === "undefined") return 0;
    if (isInteractionActive(500)) return lastDomNodeCount;
    lastDomNodeCount = document.getElementsByTagName("*").length;
    return lastDomNodeCount;
  };

  const frameLoop = (frameAtMs: number) => {
    if (stopped) return;
    if (lastFrameAtMs !== null) {
      lastFrameDurationMs = Math.max(0, frameAtMs - lastFrameAtMs);
      frameSamples.push({
        ts: frameAtMs,
        frameMs: lastFrameDurationMs,
      });
      pruneSamples(frameSamples, frameAtMs);
    }
    lastFrameAtMs = frameAtMs;
    rafId = window.requestAnimationFrame(frameLoop);
  };

  rafId = window.requestAnimationFrame(frameLoop);

  const PerformanceObserverCtor = typeof PerformanceObserver !== "undefined"
    ? PerformanceObserver
    : null;
  const longTaskObserver = PerformanceObserverCtor &&
    Array.isArray((PerformanceObserverCtor as typeof PerformanceObserver & { supportedEntryTypes?: string[] }).supportedEntryTypes) &&
    (PerformanceObserverCtor as typeof PerformanceObserver & { supportedEntryTypes?: string[] }).supportedEntryTypes?.includes("longtask")
    ? new PerformanceObserverCtor((list: PerformanceObserverEntryList) => {
        const nowMs = performance.now();
        for (const entry of list.getEntries()) {
          longTaskSamples.push({
            ts: entry.startTime,
            durationMs: entry.duration,
          });
        }
        pruneSamples(longTaskSamples, nowMs);
      })
    : null;

  try {
    longTaskObserver?.observe({ entryTypes: ["longtask"] });
  } catch {
    longTaskObserver?.disconnect();
  }

  const eventTimestampMs = (event: Event, fallbackMs: number): number => {
    const ts = event.timeStamp;
    if (!Number.isFinite(ts)) return fallbackMs;
    if (ts > Date.now() - 60_000) return fallbackMs;
    return ts;
  };

  const recordInteraction = (event: Event, kind: WorkstationInteractionSample["kind"]) => {
    const nowMs = performance.now();
    if (kind === "pointer" && nowMs - lastInteractionSampleAtMs < INTERACTION_SAMPLE_THROTTLE_MS) return;
    lastInteractionSampleAtMs = nowMs;
    const inputDelayMs = Math.max(0, nowMs - eventTimestampMs(event, nowMs));
    window.requestAnimationFrame((frameAtMs: number) => {
      if (stopped) return;
      interactionSamples.push({
        ts: nowMs,
        kind,
        inputDelayMs,
        inputToNextFrameMs: Math.max(0, frameAtMs - nowMs, lastFrameDurationMs ?? 0),
      });
      pruneSamples(interactionSamples, performance.now());
    });
  };

  const onClick = (event: Event) => recordInteraction(event, "click");
  const onScroll = (event: Event) => {
    markInteraction("scrolling", "browser.scroll");
    recordInteraction(event, "scroll");
  };
  const onWheel = (event: Event) => {
    markInteraction("scrolling", "browser.wheel");
    recordInteraction(event, "scroll");
  };
  const onPointerMove = (event: Event) => {
    const pointer = event as PointerEvent;
    if (pointer.buttons) markInteraction("dragging", "browser.pointer_drag");
    recordInteraction(event, pointer.buttons ? "panel_drag" : "pointer");
  };
  const onKeyDown = (event: Event) => {
    markInteraction("typing", "browser.keyboard");
    recordInteraction(event, "keyboard");
  };

  window.addEventListener("click", onClick, { capture: true, passive: true });
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("wheel", onWheel, { capture: true, passive: true });
  window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  window.addEventListener("keydown", onKeyDown, { capture: true, passive: true });

  const collectAndPublish = () => {
    if (stopped) return;
    const nowMs = performance.now();
    pruneSamples(frameSamples, nowMs);
    pruneSamples(interactionSamples, nowMs);
    pruneSamples(longTaskSamples, nowMs);
    const frameSummary = summarizeWorkstationFrameDurations(frameSamples, nowMs, SAMPLE_WINDOW_MS);
    const interactionSummary = summarizeWorkstationInteractions(interactionSamples, nowMs, SAMPLE_WINDOW_MS);
    const longTaskSummary = summarizeWorkstationLongTasks(longTaskSamples, nowMs, SAMPLE_WINDOW_MS);
    const panelSnapshot = openPanelSnapshot();
    const schedulerSnapshot = getWorkstationInteractionSnapshot();
    const pressure = classifyWorkstationUiFramePressure({
      fps: frameSummary.fps,
      p95FrameMs: frameSummary.p95_frame_ms,
      worstFrameMs: frameSummary.worst_frame_ms,
      longFrameRatio: frameSummary.long_frame_ratio,
      longTaskCount: longTaskSummary.long_task_count,
    });
    const responsivenessPressure = classifyWorkstationInteractionPressure({
      inputDelayP95Ms: interactionSummary.input_delay_p95_ms,
      inputToNextFrameP95Ms: interactionSummary.input_to_next_frame_p95_ms,
      clickToNextFrameP95Ms: interactionSummary.click_to_next_frame_p95_ms,
      scrollJankCount: interactionSummary.scroll_jank_count,
      dragJankCount: interactionSummary.drag_jank_count,
      longTaskCount: longTaskSummary.long_task_count,
    });
    const sample = withHelixWorkstationBrowserPerformanceAuthority({
      schema_version: "helix.workstation_browser_performance.v1",
      sampled_at: new Date().toISOString(),
      window_ms: SAMPLE_WINDOW_MS,
      fps: frameSummary.fps,
      average_frame_ms: frameSummary.average_frame_ms,
      p95_frame_ms: frameSummary.p95_frame_ms,
      worst_frame_ms: frameSummary.worst_frame_ms,
      long_frame_count: frameSummary.long_frame_count,
      long_frame_ratio: frameSummary.long_frame_ratio,
      long_task_count: longTaskSummary.long_task_count,
      long_task_total_ms: longTaskSummary.long_task_total_ms,
      dom_node_count: readDomNodeCount(),
      open_panel_count: panelSnapshot.openPanelCount,
      focused_panel_id: panelSnapshot.focusedPanelId,
      visibility_state: visibilityState(),
      advisory_pressure: pressure,
      interaction_event_count: interactionSummary.interaction_event_count,
      input_delay_p95_ms: interactionSummary.input_delay_p95_ms,
      input_to_next_frame_p95_ms: interactionSummary.input_to_next_frame_p95_ms,
      click_to_next_frame_p95_ms: interactionSummary.click_to_next_frame_p95_ms,
      scroll_jank_count: interactionSummary.scroll_jank_count,
      drag_jank_count: interactionSummary.drag_jank_count,
      active_interaction_kind: interactionSummary.active_interaction_kind,
      active_panel_id: panelSnapshot.focusedPanelId,
      responsiveness_pressure: responsivenessPressure,
      scheduler_interaction_mode: schedulerSnapshot.mode,
      scheduler_pending_task_count: schedulerSnapshot.pendingTaskCount,
      scheduler_deferred_task_count: schedulerSnapshot.deferredTaskCount,
      scheduler_pending_immediate_input_count: schedulerSnapshot.pendingByPriority.immediate_input,
      scheduler_pending_visual_frame_count: schedulerSnapshot.pendingByPriority.visual_frame,
      scheduler_pending_committed_layout_count: schedulerSnapshot.pendingByPriority.committed_layout,
      scheduler_pending_evidence_refresh_count: schedulerSnapshot.pendingByPriority.evidence_refresh,
      scheduler_pending_share_state_count: schedulerSnapshot.pendingByPriority.share_state,
      scheduler_pending_background_diagnostics_count: schedulerSnapshot.pendingByPriority.background_diagnostics,
      scheduler_last_deferred_at_ms: schedulerSnapshot.lastDeferredAtMs,
    });
    useWorkstationPerformanceStore.getState().setLatest(sample);
    if (nowMs - lastServerPublishAtMs >= SERVER_PUBLISH_INTERVAL_MS) {
      lastServerPublishAtMs = nowMs;
      const postSample = async () => {
        await fetch("/api/workspace-os/browser-performance/sample", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sample),
          keepalive: true,
        }).catch(() => undefined);
      };
      void postSample();
    }
  };

  const publish = () => {
    if (isInteractionActive(500)) {
      if (cancelDeferredPublish) return;
      cancelDeferredPublish = runWhenQuiet(() => {
        cancelDeferredPublish = null;
        collectAndPublish();
      }, {
        key: "workstation.browser_performance.publish",
        priority: "background_diagnostics",
        quietMs: 800,
        timeoutMs: 3500,
      });
    } else {
      collectAndPublish();
    }
  };

  const intervalId = window.setInterval(publish, PUBLISH_INTERVAL_MS);
  publish();

  return () => {
    stopped = true;
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }
    cancelDeferredPublish?.();
    cancelDeferredPublish = null;
    window.clearInterval(intervalId);
    window.removeEventListener("click", onClick, { capture: true });
    window.removeEventListener("scroll", onScroll, { capture: true });
    window.removeEventListener("wheel", onWheel, { capture: true });
    window.removeEventListener("pointermove", onPointerMove, { capture: true });
    window.removeEventListener("keydown", onKeyDown, { capture: true });
    longTaskObserver?.disconnect();
  };
}

export function startWorkstationPerformanceSampler(): () => void {
  if (typeof window === "undefined") return () => undefined;
  activeRefCount += 1;
  if (!activeStop) {
    activeStop = startSamplerInstance();
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    activeRefCount = Math.max(0, activeRefCount - 1);
    if (activeRefCount > 0) return;
    activeStop?.();
    activeStop = null;
    useWorkstationPerformanceStore.getState().reset();
  };
}
