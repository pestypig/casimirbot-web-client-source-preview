export type WorkstationDebugEvent = {
  id: string;
  ts: string;
  channel:
    | "account_session"
    | "interface_i18n"
    | "interface_translation_job"
    | "situation_room"
    | "situation_room_job"
    | "situation_room_translation"
    | "situation_room_graph";
  action: string;
  room_id?: string;
  source_id?: string;
  job_id?: string;
  output_id?: string;
  detail?: Record<string, unknown>;
};

export type WorkstationDebugSnapshot = {
  enabled: boolean;
  events: WorkstationDebugEvent[];
};

const STORAGE_KEY = "helix-workstation-debug:v1";
const MAX_EVENTS = 240;

let enabled = false;
let events: WorkstationDebugEvent[] = [];
const subscribers = new Set<(snapshot: WorkstationDebugSnapshot) => void>();

const nowIso = (): string => new Date().toISOString();

function emitSnapshot(): void {
  const snapshot = getWorkstationDebugSnapshot();
  for (const subscriber of subscribers) {
    subscriber(snapshot);
  }
  if (typeof window !== "undefined") {
    (window as unknown as { __helixWorkstationDebug?: WorkstationDebugSnapshot }).__helixWorkstationDebug = snapshot;
  }
}

export function getWorkstationDebugSnapshot(): WorkstationDebugSnapshot {
  return {
    enabled,
    events: [...events],
  };
}

export function isWorkstationDebugEnabled(): boolean {
  return enabled;
}

export function setWorkstationDebugEnabled(value: boolean): void {
  enabled = value;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // best-effort debug preference
    }
  }
  emitSnapshot();
}

export function clearWorkstationDebugEvents(): void {
  events = [];
  emitSnapshot();
}

export function pushWorkstationDebugEvent(
  event: Omit<WorkstationDebugEvent, "id" | "ts"> & { id?: string; ts?: string },
): void {
  if (!enabled) return;
  const next: WorkstationDebugEvent = {
    id: event.id ?? `workstation-debug:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    ts: event.ts ?? nowIso(),
    channel: event.channel,
    action: event.action,
    room_id: event.room_id,
    source_id: event.source_id,
    job_id: event.job_id,
    output_id: event.output_id,
    detail: event.detail,
  };
  events = [...events, next].slice(-MAX_EVENTS);
  emitSnapshot();
}

export function subscribeWorkstationDebug(
  subscriber: (snapshot: WorkstationDebugSnapshot) => void,
): () => void {
  subscribers.add(subscriber);
  subscriber(getWorkstationDebugSnapshot());
  return () => subscribers.delete(subscriber);
}

export function buildWorkstationDebugExport(snapshot: WorkstationDebugSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

if (typeof window !== "undefined") {
  try {
    enabled = window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    enabled = false;
  }
  emitSnapshot();
}
