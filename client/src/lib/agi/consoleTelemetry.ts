import type { ConsoleTelemetryBundle, PanelTelemetry } from "@shared/desktop";
import { panelRegistry } from "@/lib/desktop/panelRegistry";
import { readPanelTelemetrySnapshot } from "@/lib/desktop/panelTelemetryBus";
import { useDesktopStore } from "@/store/useDesktopStore";
import { sha256Hex } from "@/utils/sha";

export const DEFAULT_DESKTOP_ID = "helix.desktop.main";

const isBrowser = typeof window !== "undefined";
const TELEMETRY_ENDPOINT = "/api/agi/console/telemetry";

let lastSentHash: string | null = null;

type WindowSnapshot = ReturnType<typeof useDesktopStore.getState>["windows"][string];

const windowToSnapshot = (window?: WindowSnapshot) => {
  if (!window) {
    return undefined;
  }
  return {
    x: window.x,
    y: window.y,
    w: window.w,
    h: window.h,
    isOpen: window.isOpen,
    isMinimized: window.isMinimized,
    isMaximized: window.isMaximized,
    isFullscreen: window.isFullscreen,
    z: window.z,
    opacity: window.opacity,
  };
};

function buildPanelTelemetry(args: {
  def: (typeof panelRegistry)[number];
  window?: WindowSnapshot;
  desktopId: string;
  capturedAt: Date;
}): PanelTelemetry | null {
  const { def, window, desktopId, capturedAt } = args;
  if (!window || !window.isOpen || window.isMinimized) {
    return null;
  }
  const context = {
    desktopId,
    panelId: def.id,
    instanceId: window.id,
    now: capturedAt,
    window: windowToSnapshot(window),
  };
  const collectorSnapshot = def.collectTelemetry?.(context);
  const busSnapshot = readPanelTelemetrySnapshot(window.id);
  const payload = collectorSnapshot ?? busSnapshot;
  if (!payload) {
    return null;
  }
  return {
    panelId: def.id,
    instanceId: window.id,
    title: def.title,
    kind: payload.kind ?? def.telemetryKind,
    metrics: payload.metrics,
    flags: payload.flags,
    strings: payload.strings,
    sourceIds: payload.sourceIds,
    notes: payload.notes,
    lastUpdated: payload.lastUpdated ?? capturedAt.toISOString(),
  };
}

export async function collectConsoleTelemetry(
  desktopId: string = DEFAULT_DESKTOP_ID,
): Promise<ConsoleTelemetryBundle> {
  if (!isBrowser) {
    return { desktopId, panels: [], capturedAt: new Date().toISOString() };
  }
  const capturedAt = new Date();
  const windows = useDesktopStore.getState().windows;
  const panels: PanelTelemetry[] = [];
  for (const def of panelRegistry) {
    const window = windows[def.id];
    const snapshot = buildPanelTelemetry({ def, window, desktopId, capturedAt });
    if (snapshot) {
      panels.push(snapshot);
    }
  }
  return {
    desktopId,
    panels,
    capturedAt: capturedAt.toISOString(),
  };
}

export async function pushConsoleTelemetry(desktopId: string = DEFAULT_DESKTOP_ID): Promise<boolean> {
  if (!isBrowser) {
    return false;
  }
  const bundle = await collectConsoleTelemetry(desktopId);
  if (bundle.panels.length === 0) {
    return false;
  }
  const payload = JSON.stringify(bundle);
  const hash = await sha256Hex(payload);
  if (hash === lastSentHash) {
    return false;
  }
  try {
    lastSentHash = hash;
    await fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    return true;
  } catch (error) {
    console.warn("[telemetry] failed to push console snapshot", error);
    lastSentHash = null;
    return false;
  }
}
