import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";

export type DriveIntentVector = { x: number; y: number; z: number };

export interface DriveIntentState {
  intent: DriveIntentVector;
  nudge01: number;
}

const DRIVE_INTENT_TOPIC = "drive:intent";
const MAX_NUDGE = 1;

const clampUnit = (value: number) => {
  const v = Number.isFinite(value) ? value : 0;
  return Math.max(-1, Math.min(1, v));
};

const clampNudge = (value: number) => {
  const v = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(MAX_NUDGE, v));
};

const normalizeDriveIntent = (payload: DriveIntentState): DriveIntentState => {
  const intent = {
    x: clampUnit(payload.intent?.x),
    y: clampUnit(payload.intent?.y),
    z: clampUnit(payload.intent?.z),
  };
  return {
    intent,
    nudge01: clampNudge(payload.nudge01),
  };
};

export const publishDriveIntent = (payload: DriveIntentState) => {
  publish(DRIVE_INTENT_TOPIC, normalizeDriveIntent(payload));
};

export const subscribeDriveIntent = (handler: (payload: DriveIntentState) => void) => {
  const id = subscribe(DRIVE_INTENT_TOPIC, (payload) => {
    handler(normalizeDriveIntent(payload as DriveIntentState));
  });
  return () => {
    unsubscribe(id);
  };
};
