import { ensureWeights, loadShard, type ShardProgress } from "../lib/weights/loader";
import type { WeightManifest } from "../lib/weights/manifest";
import { getAllChunks } from "../lib/rag/store";
import { rank as rankChunks } from "../lib/rag/local-rag";
import { generateLocalResponse } from "../lib/llm/local-generator";

type MsgLoad = { t: "load"; manifestUrl: string };
type MsgGen = {
  t: "gen";
  prompt: string;
  seed: number;
  temp: number;
  top_p: number;
  maxTokens: number;
  stop: string[];
  grammar?: { suffix?: string };
};
type MsgStop = { t: "stop" };
type IncomingMessage = MsgLoad | MsgGen | MsgStop;

type EvReady = { t: "ready"; model: string };
type EvProg = { t: "progress"; downloaded: number; total: number };
type EvTok = { t: "token"; text: string };
type EvDone = { t: "done"; usage: { prompt: number; completion: number } };
type EvErr = { t: "error"; error: string };
type OutgoingMessage = EvReady | EvProg | EvTok | EvDone | EvErr;

type GenerationContext = {
  manifest: WeightManifest | null;
  vocab: ArrayBuffer | null;
  cancelling: boolean;
  busy: boolean;
};

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const state: GenerationContext = {
  manifest: null,
  vocab: null,
  cancelling: false,
  busy: false,
};

function post(message: OutgoingMessage) {
  ctx.postMessage(message);
}

async function handleLoad(message: MsgLoad) {
  try {
    const { manifest, vocab } = await ensureWeights(message.manifestUrl, (progress: ShardProgress) => {
      post({ t: "progress", downloaded: progress.downloaded, total: progress.total });
    });
    state.manifest = manifest;
    state.vocab = vocab;
    await warmup();
    post({ t: "ready", model: manifest.modelName });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "failed to load manifest";
    post({ t: "error", error: msg });
  }
}

async function handleGeneration(message: MsgGen) {
  if (!state.manifest || !state.vocab) {
    post({ t: "error", error: "model not ready" });
    return;
  }
  if (state.busy) {
    post({ t: "error", error: "generation already in progress" });
    return;
  }
  state.busy = true;
  state.cancelling = false;

  try {
    const chunks = await getAllChunks();
    const ranked = rankChunks(message.prompt, chunks, 6);
    const result = generateLocalResponse({
      prompt: message.prompt,
      ranked,
      seed: message.seed,
      temperature: message.temp,
      topP: message.top_p,
      maxTokens: message.maxTokens,
      grammar: message.grammar,
    });

    const pieces = result.output.split(/(\s+)/).filter(Boolean);
    const limit = Math.max(8, Math.min(message.maxTokens, 768));
    let produced = 0;
    for (const piece of pieces) {
      if (state.cancelling) break;
      post({ t: "token", text: piece });
      produced += 1;
      if (produced >= limit) break;
      if (message.stop.some((stopSeq) => stopSeq && piece.includes(stopSeq))) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    post({
      t: "done",
      usage: result.usage,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "generation failed";
    post({ t: "error", error: msg });
  } finally {
    state.busy = false;
    state.cancelling = false;
  }
}

ctx.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  switch (data.t) {
    case "load":
      handleLoad(data);
      break;
    case "gen":
      handleGeneration(data);
      break;
    case "stop":
      state.cancelling = true;
      break;
    default:
      break;
  }
};

// Preload first shard metadata to warm browsers that require a user gesture before WebGPU init.
async function warmup() {
  if (!state.manifest) return;
  try {
    await loadShard(state.manifest, 0);
  } catch (err) {
    console.warn("[llm-worker] warmup skipped:", err);
  }
}

ctx.addEventListener("message", () => {
  if (state.manifest && !state.cancelling) {
    void warmup();
  }
});
