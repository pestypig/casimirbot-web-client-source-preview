import { buildContext } from "./luma/compose-context";
import type { ChatMsg } from "./luma-client";
import type { ShardProgress } from "@/lib/weights/loader";

type LocalStreamPayload = {
  manifestUrl: string;
  prompt: string;
  seed: number;
  temperature: number;
  top_p: number;
  maxTokens?: number;
  stop?: string[];
  grammar?: { suffix?: string };
};

type LocalCallbacks = {
  onDelta: (delta: string) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: ShardProgress) => void;
  onReady?: (model: string) => void;
};

type WorkerEvent =
  | { t: "ready"; model: string }
  | { t: "progress"; downloaded: number; total: number }
  | { t: "token"; text: string }
  | { t: "done"; usage: { prompt: number; completion: number } }
  | { t: "error"; error: string };

type LocalStreamHandle = { stop(): void };

let worker: Worker | null = null;
let manifestLoaded: string | null = null;
let readyPromise: Promise<string> | null = null;
let resolveReady: ((model: string) => void) | null = null;
let rejectReady: ((error: Error) => void) | null = null;
let activeCallbacks: LocalCallbacks | null = null;

function resetWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  manifestLoaded = null;
  readyPromise = null;
  resolveReady = null;
  rejectReady = null;
  activeCallbacks = null;
}

function ensureWorker(manifestUrl: string, callbacks: LocalCallbacks) {
  if (!worker) {
    worker = new Worker(new URL("../workers/llm-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const data = event.data;
      if (!data) return;
      switch (data.t) {
        case "progress":
          activeCallbacks?.onProgress?.({ downloaded: data.downloaded, total: data.total });
          break;
        case "ready":
          manifestLoaded = manifestLoaded ?? manifestUrl;
          resolveReady?.(data.model);
          resolveReady = null;
          rejectReady = null;
          activeCallbacks?.onReady?.(data.model);
          break;
        case "token":
          activeCallbacks?.onDelta(data.text);
          break;
        case "done":
          activeCallbacks?.onDone?.();
          activeCallbacks = null;
          break;
        case "error": {
          const err = new Error(data.error);
          if (rejectReady) {
            rejectReady(err);
            resolveReady = null;
            rejectReady = null;
          } else {
            activeCallbacks?.onError?.(err);
            activeCallbacks = null;
          }
          break;
        }
        default:
          break;
      }
    };
    worker.onerror = (event) => {
      const error = event.error instanceof Error ? event.error : new Error(String(event.message || "worker error"));
      rejectReady?.(error);
      activeCallbacks?.onError?.(error);
      resetWorker();
    };
  }

  if (manifestLoaded !== manifestUrl) {
    manifestLoaded = manifestUrl;
    readyPromise = null;
  }

  if (!readyPromise) {
    readyPromise = new Promise<string>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
      worker!.postMessage({ t: "load", manifestUrl });
    });
  }

  activeCallbacks = callbacks;
  return readyPromise;
}

export function openLumaStreamLocal(payload: LocalStreamPayload, callbacks: LocalCallbacks): LocalStreamHandle {
  if (activeCallbacks) {
    callbacks.onError?.(new Error("local generation already active"));
    return { stop() {} };
  }

  const ready = ensureWorker(payload.manifestUrl, callbacks);

  ready
    .then(() => {
      const stop = payload.stop ?? [];
      worker?.postMessage({
        t: "gen",
        prompt: payload.prompt,
        seed: payload.seed >>> 0,
        temp: payload.temperature,
        top_p: payload.top_p,
        maxTokens: payload.maxTokens ?? 320,
        stop,
        grammar: payload.grammar,
      });
    })
    .catch((error) => {
      callbacks.onError?.(error instanceof Error ? error : new Error("failed to initialize local worker"));
      if (activeCallbacks === callbacks) {
        activeCallbacks = null;
      }
    });

  return {
    stop() {
      if (!worker) return;
      worker.postMessage({ t: "stop" });
      activeCallbacks = null;
    },
  };
}

export function disposeLocalWorker() {
  resetWorker();
}

export type HelixLocalArgs = {
  manifestUrl: string;
  prompt: string;
  seed: number;
  temperature: number;
  top_p: number;
  maxTokens?: number;
  footnote?: string;
  docTopK?: number;
  codeTopK?: number;
  history?: ChatMsg[];
};

export async function openHelixLumaLocal(
  args: HelixLocalArgs,
  callbacks: LocalCallbacks,
): Promise<LocalStreamHandle> {
  const { context } = await buildContext(args.prompt, args.docTopK ?? 4, args.codeTopK ?? 4);
  const system =
    'ETHOS: read-only, cite-first. Use the provided context; include a "References:" section listing [Dx]/[Cx] you used.';
  const footnoteBlock = args.footnote ? `\n\n${args.footnote}` : "";
  const historyBlock = args.history?.length
    ? args.history
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n")
    : "";
  const questionSection = historyBlock ? `${historyBlock}\nUSER: ${args.prompt}` : args.prompt;
  const finalPrompt = `${system}\n\nContext:\n${context}${footnoteBlock}\n\nQuestion:\n${questionSection}\nAnswer:`;

  return openLumaStreamLocal(
    {
      manifestUrl: args.manifestUrl,
      prompt: finalPrompt,
      seed: args.seed,
      temperature: args.temperature,
      top_p: args.top_p,
      maxTokens: args.maxTokens ?? 480,
      grammar: { suffix: "\n\nReferences:\n" },
    },
    callbacks,
  );
}
