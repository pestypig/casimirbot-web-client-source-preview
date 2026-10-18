import { useEffect } from "react";
import type { DependencyList } from "react";
import type { PanelTelemetryDetails } from "@/lib/desktop/panelRegistry";

type PanelTelemetrySnapshot = PanelTelemetryDetails & { lastUpdated: string };

const snapshots = new Map<string, PanelTelemetrySnapshot>();

const toIso = () => new Date().toISOString();

function normalizeSnapshot(snapshot: PanelTelemetryDetails | null): PanelTelemetrySnapshot | null {
  if (!snapshot) {
    return null;
  }
  return {
    ...snapshot,
    lastUpdated: snapshot.lastUpdated ?? toIso(),
  };
}

export function setPanelTelemetrySnapshot(panelId: string, snapshot: PanelTelemetryDetails | null): void {
  if (!panelId) {
    return;
  }
  const normalized = normalizeSnapshot(snapshot);
  if (!normalized) {
    snapshots.delete(panelId);
    return;
  }
  snapshots.set(panelId, normalized);
}

export function readPanelTelemetrySnapshot(panelId: string): PanelTelemetrySnapshot | null {
  if (!panelId) {
    return null;
  }
  return snapshots.get(panelId) ?? null;
}

export function usePanelTelemetryPublisher(
  panelId: string,
  buildSnapshot: () => PanelTelemetryDetails | null,
  deps: DependencyList = [],
): void {
  useEffect(() => {
    if (!panelId) {
      return undefined;
    }
    setPanelTelemetrySnapshot(panelId, buildSnapshot());
    return () => {
      setPanelTelemetrySnapshot(panelId, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId, ...deps]);
}
