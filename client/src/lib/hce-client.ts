import type {
  HceConfigPayload,
  HceConfigResponse,
  HceMeasurePayload,
  HceMeasureResponse,
  HceStreamEvent,
} from "@shared/hce-types";

export interface HceStreamSubscription {
  close(): void;
}

export interface HceClient {
  configure(payload: HceConfigPayload): Promise<HceConfigResponse>;
  stream(
    runId: string,
    handler: (event: HceStreamEvent) => void,
    options?: { temp?: number; interval?: number },
  ): HceStreamSubscription;
  measure(payload: HceMeasurePayload): Promise<HceMeasureResponse>;
}

const jsonHeaders = {
  "Content-Type": "application/json",
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
};

export function createHceClient(baseUrl = ""): HceClient {
  const prefix = baseUrl.replace(/\/$/, "");
  return {
    async configure(payload) {
      const response = await fetch(`${prefix}/api/hce/config`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      return handleResponse<HceConfigResponse>(response);
    },

    stream(runId, handler, options) {
      const params = new URLSearchParams({ runId });
      if (options?.temp) params.set("temp", String(options.temp));
      if (options?.interval) params.set("interval", String(options.interval));
      let closed = false;
      let source: EventSource | null = null;
      const connect = () => {
        if (closed) return;
        const stream = new EventSource(`${prefix}/api/hce/stream?${params.toString()}`);
        source = stream;
        stream.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as HceStreamEvent | { batch?: boolean; frames?: HceStreamEvent[] };
            if (data && typeof data === "object" && "batch" in data && data.batch) {
              const frames = Array.isArray(data.frames) ? data.frames : [];
              for (const frame of frames) handler(frame);
            } else {
              handler(data as HceStreamEvent);
            }
          } catch (err) {
            console.warn("[hce-client] failed to parse stream event", err);
          }
        };
        stream.onerror = () => {
          if (closed) return;
          stream.close();
          source = null;
          setTimeout(connect, 1_000);
        };
      };

      connect();

      return {
        close() {
          closed = true;
          source?.close();
        },
      };
    },

    async measure(payload) {
      const response = await fetch(`${prefix}/api/hce/measure`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      return handleResponse<HceMeasureResponse>(response);
    },
  };
}
