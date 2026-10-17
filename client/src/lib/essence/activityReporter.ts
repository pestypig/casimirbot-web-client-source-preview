import { readSessionUser } from "@/lib/auth/session";

type ActivitySampleInput = {
  ts?: string;
  panelId?: string;
  file?: string;
  repo?: string;
  tag?: string;
  durationSec?: number;
  updates?: number;
  meta?: Record<string, unknown>;
};

type PendingSample = Required<Pick<ActivitySampleInput, "ts">> &
  Omit<ActivitySampleInput, "ts">;

const queue: PendingSample[] = [];
const MAX_QUEUE = 24;
const FLUSH_DELAY_MS = 1500;
const REPORTER_DISABLED =
  typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_DISABLE_ACTIVITY_REPORTER === "1";

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

const hasActiveSession = (): boolean => {
  if (REPORTER_DISABLED) {
    return false;
  }
  const user = readSessionUser();
  if (!user || typeof user !== "object") {
    return false;
  }
  const id = (user as { id?: string }).id;
  return typeof id === "string" && id.length > 0;
};

export function recordActivitySample(sample: ActivitySampleInput): void {
  if (typeof window === "undefined") return;
  if (!hasActiveSession()) {
    return;
  }
  const payload: PendingSample = {
    ts: sample.ts ?? new Date().toISOString(),
    panelId: sample.panelId,
    file: sample.file,
    repo: sample.repo,
    tag: sample.tag,
    durationSec: sample.durationSec,
    updates: sample.updates,
    meta: sample.meta,
  };

  queue.push(payload);
  if (queue.length >= MAX_QUEUE) {
    void flushQueue();
    return;
  }
  scheduleFlush();
}

export function recordPanelActivity(panelId: string, event: string): void {
  if (!panelId) return;
  recordActivitySample({
    panelId,
    tag: inferPanelTag(panelId),
    meta: { event, source: "desktop-panel" },
  });
}

function scheduleFlush(): void {
  if (flushTimer) {
    return;
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, FLUSH_DELAY_MS);
}

async function flushQueue(): Promise<void> {
  if (flushing || !queue.length || typeof window === "undefined") {
    return;
  }
  if (!hasActiveSession()) {
    queue.length = 0;
    return;
  }
  flushing = true;
  const payload = queue.splice(0, queue.length);
  try {
    await fetch("/api/essence/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ samples: payload }),
    });
  } catch (err) {
    console.warn("[essence] failed to flush activity samples", err);
    // Requeue latest samples (truncate to queue limit to avoid growth)
    const remainder = payload.concat(queue);
    queue.length = 0;
    queue.push(...remainder.slice(-MAX_QUEUE));
  } finally {
    flushing = false;
  }
}

const PANEL_TAG_HINTS: Array<{ match: RegExp; tag: string }> = [
  { match: /casimir|warp|curvature|hull|bubble|spectrum|energy|sweep/i, tag: "physics" },
  { match: /mission|ethos|ideology|ip|contract|policy/i, tag: "ip" },
  { match: /noise|audio|music|luma/i, tag: "music" },
  { match: /rag|knowledge|corpus|ingest/i, tag: "knowledge" },
];

function inferPanelTag(panelId: string | undefined): string | undefined {
  if (!panelId) return undefined;
  for (const hint of PANEL_TAG_HINTS) {
    if (hint.match.test(panelId)) {
      return hint.tag;
    }
  }
  return undefined;
}
