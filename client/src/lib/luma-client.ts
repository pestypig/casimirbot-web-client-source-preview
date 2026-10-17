import { apiRequest } from "@/lib/queryClient";

export type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

export async function getLumaSkills(): Promise<string[]> {
  const res = await apiRequest("GET", "/api/luma/skills");
  const json = await res.json();
  return Array.isArray(json?.skills) ? json.skills : [];
}

export async function postPlan(task: string) {
  const res = await apiRequest("POST", "/api/luma/plan", { task });
  return res.json();
}

export async function postProposePatch(title: string, rationale: string, files?: string[]) {
  const res = await apiRequest("POST", "/api/luma/propose-patch", {
    title,
    rationale,
    files,
  });
  return res.text();
}

export async function summarizeDocument(url: string) {
  const res = await apiRequest("POST", "/api/luma/summarize", { url });
  return res.json();
}

type StreamCallbacks = {
  onDelta: (chunk: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
};

export function openLumaStream(
  payload: { messages: ChatMsg[]; temperature?: number },
  { onDelta, onDone, onError }: StreamCallbacks,
) {
  const controller = new AbortController();
  fetch("/api/luma/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.body) {
        throw new Error(`${res.status}: stream not available`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          if (!frame.startsWith("data:")) continue;
          const data = frame.slice(5).trim();
          if (data === "[DONE]") {
            onDone?.();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.delta) {
              onDelta(String(parsed.delta));
            } else if (parsed.error) {
              throw new Error(String(parsed.error));
            }
          } catch (err) {
            const errorObj = err instanceof Error ? err : new Error("stream parse error");
            onError?.(errorObj);
            controller.abort();
            return;
          }
        }
      }
      onDone?.();
    })
    .catch((err) => {
      if (controller.signal.aborted) return;
      onError?.(err instanceof Error ? err : new Error("stream failed"));
    });

  return {
    abort: () => controller.abort(),
  };
}
