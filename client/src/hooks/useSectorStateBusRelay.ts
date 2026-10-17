import { useEffect, useRef } from "react";
import type { HardwareFeedsController } from "@/hooks/useHardwareFeeds";
import {
  publishSectorState,
  type SectorStateFrame,
} from "@/lib/hardware-sector-bus";

type RelayOptions = {
  minPublishMs?: number;
};

const coerceNumber = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const pickNumber = (...candidates: unknown[]): number | undefined => {
  for (const candidate of candidates) {
    const numeric = coerceNumber(candidate);
    if (numeric !== undefined) return numeric;
  }
  return undefined;
};

const normalizeSectorPayload = (raw: unknown): SectorStateFrame | null => {
  if (!raw || typeof raw !== "object") return null;

  const payload =
    raw && typeof (raw as { payload?: unknown }).payload === "object"
      ? ((raw as { payload?: unknown }).payload as Record<string, unknown>)
      : (raw as Record<string, unknown>);

  const strobeHz = pickNumber(
    payload.strobeHz,
    payload.strobe_hz,
    payload.strobe,
    payload.strobeHZ,
    payload.strobehz,
  );
  const dwell = pickNumber(
    payload.dwell_ms,
    payload.dwellMs,
    payload.dwell,
    payload.dwellMS,
  );
  const burst = pickNumber(
    payload.burst_ms,
    payload.burstMs,
    payload.burst,
    payload.burstMS,
  );

  if (!Number.isFinite(strobeHz) || (strobeHz ?? 0) <= 0) return null;
  if (!Number.isFinite(dwell) || (dwell ?? 0) < 0) return null;
  if (!Number.isFinite(burst) || (burst ?? 0) < 0) return null;

  const frame: SectorStateFrame = {
    strobeHz: strobeHz!,
    dwell_ms: dwell!,
    burst_ms: burst!,
    sectorsTotal: pickNumber(
      payload.sectorsTotal,
      payload.sectors_total,
      payload.sectorCount,
    ),
    activeSectors: pickNumber(
      payload.activeSectors,
      payload.active_sectors,
      payload.active,
    ),
    sectorsConcurrent: pickNumber(
      payload.sectorsConcurrent,
      payload.sectors_concurrent,
      payload.concurrency,
    ),
    currentSector: pickNumber(
      payload.currentSector,
      payload.current_sector,
      payload.sector,
    ),
    phaseScheduleTelemetry:
      payload.phaseScheduleTelemetry ??
      payload.phaseSchedule ??
      payload.phase_schedule,
    source: "hardware",
  };

  return frame;
};

export const useSectorStateBusRelay = (
  controller: HardwareFeedsController | null | undefined,
  enabled: boolean,
  opts?: RelayOptions,
) => {
  const lastSentTsRef = useRef(0);
  const lastFrameKeyRef = useRef<string>("");

  useEffect(() => {
    if (!enabled) {
      lastSentTsRef.current = 0;
      lastFrameKeyRef.current = "";
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !controller?.lastEvent) return;

    const event = controller.lastEvent;
    const ts =
      coerceNumber((event as { receivedAt?: unknown }).receivedAt) ??
      coerceNumber((event as { ts?: unknown }).ts) ??
      Date.now();

    const minGap = Math.max(0, opts?.minPublishMs ?? 75);
    if (ts - lastSentTsRef.current < minGap) return;

    const normalized = normalizeSectorPayload(event.payload);
    const type = String((event as { type?: unknown }).type ?? "").toLowerCase();
    const looksSector =
      type.includes("sector-state") ||
      type.includes("sector") ||
      type.includes("strobe") ||
      !!normalized;

    if (!looksSector || !normalized) return;

    const key = [
      normalized.strobeHz,
      normalized.dwell_ms,
      normalized.burst_ms,
      normalized.sectorsTotal ?? "",
      normalized.activeSectors ?? "",
      normalized.sectorsConcurrent ?? "",
      normalized.currentSector ?? "",
    ].join("|");

    if (key === lastFrameKeyRef.current) return;

    lastFrameKeyRef.current = key;
    lastSentTsRef.current = ts;
    publishSectorState({ ...normalized, ts });
  }, [controller?.lastEvent, enabled, opts?.minPublishMs]);
};
