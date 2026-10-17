/// <reference lib="webworker" />
import { FFmpeg } from "@ffmpeg/ffmpeg";

type MuxRequest = {
  type: "mux";
  fps: number;
  frames: Array<{ name: string; buffer: ArrayBuffer }>;
};

type MuxResponse =
  | { type: "mux:done"; video: ArrayBuffer }
  | { type: "mux:error"; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let ffmpeg: FFmpeg | null = null;
let loadingPromise: Promise<void> | null = null;

async function ensureFFmpeg() {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
  }
  if (!ffmpeg.loaded) {
    if (!loadingPromise) {
      loadingPromise = ffmpeg.load().then(() => undefined);
    }
    try {
      await loadingPromise;
    } catch (error) {
      // Reset the instance on failure so a subsequent attempt can retry.
      ffmpeg = null;
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      loadingPromise = null;
    }
  }
  if (!ffmpeg) {
    throw new Error("Failed to initialize ffmpeg.wasm");
  }
  return ffmpeg;
}

ctx.onmessage = async (event: MessageEvent<MuxRequest>) => {
  const message = event.data;
  if (!message || message.type !== "mux") return;

  try {
    const instance = await ensureFFmpeg();
    const fps = Number.isFinite(message.fps) && message.fps > 0 ? message.fps : 30;

    try {
      await instance.deleteFile("out.mp4");
    } catch {
      // ignore
    }

    try {
      const entries = await instance.listDir("/");
      const removals = entries
        .filter((node) => !node.isDir && node.name.endsWith(".png"))
        .map((node) => instance.deleteFile(node.name).catch(() => undefined));
      await Promise.all(removals);
    } catch {
      // ignore
    }

    for (let i = 0; i < message.frames.length; i++) {
      const frame = message.frames[i];
      await instance.writeFile(frame.name, new Uint8Array(frame.buffer));
    }

    await instance.exec([
      "-framerate",
      `${fps}`,
      "-i",
      "frame-%04d.png",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "ultrafast",
      "out.mp4",
    ]);

    const output = (await instance.readFile("out.mp4")) as Uint8Array;
    const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);

    const response: MuxResponse = { type: "mux:done", video: buffer };
    ctx.postMessage(response, [buffer]);
  } catch (error) {
    const response: MuxResponse = {
      type: "mux:error",
      error: error instanceof Error ? error.message : String(error),
    };
    ctx.postMessage(response);
  }
};
