import type { BarWindow, TempoMeta } from "@/types/noise-gens";

type ExtractRequestMessage = {
  type: "extract";
  id: string;
  songId: string;
  totalBars?: number;
  tempo?: TempoMeta;
  offsetMs?: number;
};

type ExtractResponseMessage = {
  type: "complete";
  id: string;
  windows: Array<{
    window: BarWindow;
    features: {
      bark: number[];
      centroid: number[];
      rolloff: number[];
      loudness: number[];
      onsetFlux: number[];
    };
  }>;
};

type ExtractErrorMessage = {
  type: "error";
  id: string;
  message: string;
};

const DEFAULT_TEMPO: TempoMeta = {
  bpm: 120,
  timeSig: "4/4",
  offsetMs: 0,
  barsInLoop: 8,
  quantized: true,
};

function respond(message: ExtractResponseMessage | ExtractErrorMessage) {
  postMessage(message);
}

function splitIntoWindows(totalBars: number): BarWindow[] {
  const windows: BarWindow[] = [];
  const clampTotal = Math.max(4, Math.round(totalBars));
  for (let start = 1; start <= clampTotal; start += 4) {
    const end = Math.min(start + 4, clampTotal + 1);
    windows.push({ startBar: start, endBar: end });
  }
  return windows;
}

function pseudoRandomSeries(seed: string, length: number): number[] {
  const points: number[] = [];
  let accumulator = 1;
  for (let index = 0; index < length; index += 1) {
    const char = seed.charCodeAt(index % seed.length);
    accumulator = (accumulator * 37 + char + index * 13) % 8191;
    points.push(Number(((accumulator % 1000) / 1000).toFixed(4)));
  }
  return points;
}

function handleExtract(request: ExtractRequestMessage) {
  const tempo = request.tempo ?? DEFAULT_TEMPO;
  const totalBars = Number.isFinite(request.totalBars)
    ? Math.max(4, Math.round(request.totalBars ?? 32))
    : 32;
  const windows = splitIntoWindows(totalBars);
  const windowsWithFeatures = windows.map((window) => ({
    window,
    features: {
      bark: pseudoRandomSeries(`${request.songId}:${window.startBar}-bark`, 24),
      centroid: pseudoRandomSeries(`${request.songId}:${window.startBar}-centroid`, 4),
      rolloff: pseudoRandomSeries(`${request.songId}:${window.startBar}-rolloff`, 4),
      loudness: pseudoRandomSeries(`${request.songId}:${window.startBar}-loudness`, 4),
      onsetFlux: pseudoRandomSeries(`${request.songId}:${window.startBar}-flux`, 4),
    },
  }));

  respond({
    type: "complete",
    id: request.id,
    windows: windowsWithFeatures,
  });
}

self.onmessage = (event: MessageEvent<ExtractRequestMessage>) => {
  const message = event.data;
  if (!message) {
    return;
  }
  if (message.type === "extract") {
    try {
      handleExtract(message);
    } catch (error) {
      respond({
        type: "error",
        id: message.id,
        message: error instanceof Error ? error.message : "feature extraction failed",
      });
    }
  }
};
