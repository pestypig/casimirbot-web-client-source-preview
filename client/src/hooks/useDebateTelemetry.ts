import * as React from "react";
import type { TTelemetrySnapshot } from "@shared/star-telemetry";
import { apiRequest } from "@/lib/queryClient";

export type CoherenceSessionType = "debate" | "lab" | "planner" | "agent" | (string & {});

export type CoherenceTelemetryResponse = {
  sessionId: string;
  sessionType: CoherenceSessionType;
  telemetry?: TTelemetrySnapshot;
  action?: string;
  confidence?: number;
  updatedAt?: string;
  governor?: unknown;
  debateId?: string;
};

export type DebateTelemetryResponse = CoherenceTelemetryResponse & { debateId: string };

type Status = "idle" | "loading" | "ready" | "error";

export async function fetchCoherenceTelemetryOnce(
  sessionId: string,
  sessionType: CoherenceSessionType = "debate",
  signal?: AbortSignal,
): Promise<CoherenceTelemetryResponse> {
  const params = new URLSearchParams({
    sessionId,
    sessionType,
  }).toString();
  const res = await apiRequest("GET", `/api/agi/star/telemetry?${params}`, undefined, signal);
  const payload = (await res.json()) as CoherenceTelemetryResponse;
  return payload;
}

export async function fetchDebateTelemetryOnce(
  debateId: string,
  signal?: AbortSignal,
): Promise<DebateTelemetryResponse> {
  const payload = await fetchCoherenceTelemetryOnce(debateId, "debate", signal);
  return {
    ...payload,
    debateId: payload.debateId ?? debateId,
    sessionId: payload.sessionId ?? debateId,
    sessionType: "debate",
  };
}

export function useCoherenceTelemetry(
  sessionId: string | null,
  sessionType: CoherenceSessionType = "debate",
  intervalMs = 4000,
) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<CoherenceTelemetryResponse | null>(null);

  const fetchOnce = React.useCallback(async () => {
    if (!sessionId) return;
    setStatus((prev) => (prev === "ready" ? "ready" : "loading"));
    setError(null);
    const controller = new AbortController();
    try {
      const payload = await fetchCoherenceTelemetryOnce(sessionId, sessionType, controller.signal);
      setData(payload);
      setStatus("ready");
    } catch (err) {
      if ((err as any)?.name === "AbortError") return;
      const message = err instanceof Error ? err.message : String(err);
      const [maybeStatus, ...rest] = message.split(":");
      const statusCode = Number(maybeStatus.trim());
      const body = rest.join(":").trim();
      const isSessionMissing =
        Number.isFinite(statusCode) &&
        statusCode === 404 &&
        (body.includes("debate_not_found") || body.includes("session_not_found"));
      if (isSessionMissing) {
        setData(null);
        setStatus("ready");
        setError(null);
        return;
      }
      setError(message);
      setStatus("error");
    }
  }, [sessionId, sessionType]);

  React.useEffect(() => {
    if (!sessionId) {
      setData(null);
      setStatus("idle");
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (!active) return;
      await fetchOnce();
      if (!active) return;
      timer = setTimeout(tick, intervalMs);
    };

    void tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, sessionType, fetchOnce, intervalMs]);

  return {
    data,
    status,
    error,
    refresh: fetchOnce,
  };
}

export function useDebateTelemetry(debateId: string | null, intervalMs = 4000) {
  return useCoherenceTelemetry(debateId, "debate", intervalMs);
}
