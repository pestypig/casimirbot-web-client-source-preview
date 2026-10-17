import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";

export const HARDWARE_SECTOR_TOPIC = "hardware:sector-state";

export type SectorStateFrame = {
  strobeHz: number;
  dwell_ms: number;
  burst_ms: number;
  sectorsTotal?: number;
  activeSectors?: number;
  sectorsConcurrent?: number;
  currentSector?: number;
  phaseScheduleTelemetry?: unknown;
  ts?: number;
  source?: "hardware" | "sim";
};

export const publishSectorState = (frame: SectorStateFrame): void => {
  publish(HARDWARE_SECTOR_TOPIC, frame);
};

export const subscribeSectorState = (
  handler: (frame: SectorStateFrame) => void,
): (() => void) => {
  const id = subscribe(HARDWARE_SECTOR_TOPIC, (payload) => {
    handler(payload as SectorStateFrame);
  });
  return () => {
    unsubscribe(id);
  };
};
