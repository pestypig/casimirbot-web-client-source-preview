import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { releaseAudioFocus, requestAudioFocus } from "@/lib/audio-focus";

type MiniPlayerProps = {
  instrumental?: File | Blob | string | null;
  vocal?: File | Blob | string | null;
  offsetMs: number;
  onOffsetChange?: (offset: number) => void;
  tempo?: { bpm: number; timeSig: string; quantized?: boolean };
  disabled?: boolean;
  className?: string;
};

type AudioNodes = {
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
  gain: GainNode;
};

const OFFSET_LIMIT_MS = 500;
const METER_SMOOTHING = 0.65;

function createObjectUrl(source?: File | Blob | string | null) {
  if (!source) return undefined;
  if (typeof source === "string") return source;
  return URL.createObjectURL(source);
}

function computeLevel(analyser: AnalyserNode, buffer: Uint8Array) {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const value = buffer[i] - 128;
    sum += value * value;
  }
  const rms = Math.sqrt(sum / buffer.length);
  return Math.min(1, rms / 64);
}

export function MiniPlayer({
  instrumental,
  vocal,
  offsetMs,
  onOffsetChange,
  tempo,
  disabled = false,
  className,
}: MiniPlayerProps) {
  const instrumentalRef = useRef<HTMLAudioElement | null>(null);
  const vocalRef = useRef<HTMLAudioElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const playerIdRef = useRef(
    `noisegen-mini-${Math.random().toString(36).slice(2, 10)}`,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [instrumentalLevel, setInstrumentalLevel] = useState(0);
  const [vocalLevel, setVocalLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const instrumentalNodesRef = useRef<AudioNodes | null>(null);
  const vocalNodesRef = useRef<AudioNodes | null>(null);
  const analyserBufferRef = useRef<Uint8Array | null>(null);

  const hasSources = Boolean(instrumental) && Boolean(vocal);
  const isReady = hasSources && !disabled;

  const instrumentalSrc = useMemo(() => createObjectUrl(instrumental), [instrumental]);
  const vocalSrc = useMemo(() => createObjectUrl(vocal), [vocal]);

  useEffect(
    () => () => {
      if (instrumentalSrc && typeof instrumental !== "string") {
        URL.revokeObjectURL(instrumentalSrc);
      }
      if (vocalSrc && typeof vocal !== "string") {
        URL.revokeObjectURL(vocalSrc);
      }
    },
    [instrumentalSrc, vocalSrc, instrumental, vocal],
  );

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;

    const draw = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio ?? 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (typeof ctx.resetTransform === "function") {
        ctx.resetTransform();
      }
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      if (!tempo?.bpm) {
        return;
      }

      const beatsPerBar = Number(tempo.timeSig.split("/")[0] || 4);
      if (!Number.isFinite(beatsPerBar) || beatsPerBar <= 0) {
        return;
      }
      const msPerBeat = 60000 / tempo.bpm;
      if (!Number.isFinite(msPerBeat) || msPerBeat <= 0) {
        return;
      }
      const msPerBar = msPerBeat * beatsPerBar;
      const baseDurationMs =
        Number.isFinite(duration) && duration > 0 ? duration * 1000 : msPerBar * 8;
      const visibleMs = Math.max(msPerBar, baseDurationMs);
      let first = (-offsetMs) % msPerBar;
      if (first < 0) {
        first += msPerBar;
      }

      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      for (let t = first; t <= visibleMs + 1; t += msPerBar) {
        const x = (t / visibleMs) * rect.width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rect.height);
        ctx.stroke();
      }
    };

    draw();
    window.addEventListener("resize", draw);
    return () => {
      window.removeEventListener("resize", draw);
    };
  }, [tempo?.bpm, tempo?.timeSig, offsetMs, duration]);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (meterRafRef.current != null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
  }, []);

  const updateProgress = useCallback(() => {
    const inst = instrumentalRef.current;
    const voc = vocalRef.current;
    const maxDuration = Math.max(inst?.duration ?? 0, voc?.duration ?? 0);
    if (maxDuration > 0) {
      const current = Math.max(inst?.currentTime ?? 0, voc?.currentTime ?? 0);
      setProgress(Math.min(1, current / maxDuration));
      setDuration(maxDuration);
    } else {
      setProgress(0);
    }
    rafRef.current = requestAnimationFrame(updateProgress);
  }, []);

  const ensureAudioGraph = useCallback(async () => {
    if (!instrumentalRef.current || !vocalRef.current) return;

    let context = audioContextRef.current;
    if (!context) {
      context = new AudioContext();
      audioContextRef.current = context;
    }
    if (context.state === "suspended") {
      await context.resume();
    }

    if (!analyserBufferRef.current) {
      analyserBufferRef.current = new Uint8Array(512);
    }

    const connectElement = (
      nodeRef: React.MutableRefObject<AudioNodes | null>,
      element: HTMLAudioElement,
    ) => {
      if (nodeRef.current) return;
      const source = context!.createMediaElementSource(element);
      const gain = context!.createGain();
      const analyser = context!.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = METER_SMOOTHING;
      source.connect(gain);
      gain.connect(analyser);
      analyser.connect(context!.destination);
      element.muted = true;
      nodeRef.current = { source, analyser, gain };
    };

    connectElement(instrumentalNodesRef, instrumentalRef.current);
    connectElement(vocalNodesRef, vocalRef.current);
  }, []);

  const updateMeters = useCallback(() => {
    const buffer = analyserBufferRef.current;
    if (!buffer) return;
    const instAnalyser = instrumentalNodesRef.current?.analyser;
    const vocAnalyser = vocalNodesRef.current?.analyser;
    if (instAnalyser) {
      setInstrumentalLevel((prev) =>
        prev * METER_SMOOTHING + computeLevel(instAnalyser, buffer) * (1 - METER_SMOOTHING),
      );
    } else {
      setInstrumentalLevel(0);
    }
    if (vocAnalyser) {
      setVocalLevel((prev) =>
        prev * METER_SMOOTHING + computeLevel(vocAnalyser, buffer) * (1 - METER_SMOOTHING),
      );
    } else {
      setVocalLevel(0);
    }
    meterRafRef.current = requestAnimationFrame(updateMeters);
  }, []);

  const syncCurrentTime = useCallback(() => {
    if (!instrumentalRef.current || !vocalRef.current) return;
    const inst = instrumentalRef.current;
    const voc = vocalRef.current;
    const offsetSeconds = offsetMs / 1000;
    const instStart = offsetSeconds < 0 ? Math.abs(offsetSeconds) : 0;
    const vocStart = offsetSeconds > 0 ? offsetSeconds : 0;
    if (!Number.isNaN(inst.duration)) {
      inst.currentTime = Math.min(inst.duration - 0.1, instStart);
    }
    if (!Number.isNaN(voc.duration)) {
      voc.currentTime = Math.min(voc.duration - 0.1, vocStart);
    }
  }, [offsetMs]);

  const handlePause = useCallback(() => {
    instrumentalRef.current?.pause();
    vocalRef.current?.pause();
    setIsPlaying(false);
    stopRaf();
  }, [stopRaf]);

  const handlePlay = useCallback(async () => {
    if (!isReady || !instrumentalRef.current || !vocalRef.current) return;
    requestAudioFocus({ id: playerIdRef.current, stop: handlePause });
    await ensureAudioGraph();
    syncCurrentTime();
    try {
      await Promise.all([instrumentalRef.current.play(), vocalRef.current.play()]);
      setIsPlaying(true);
      updateProgress();
      updateMeters();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("MiniPlayer: failed to play", error);
    }
  }, [ensureAudioGraph, handlePause, isReady, syncCurrentTime, updateMeters, updateProgress]);

  const snapToGrid = useCallback(
    (value: number) => {
      if (!tempo?.quantized || !tempo?.bpm) {
        return value;
      }
      const beatsPerBar = Number(tempo.timeSig.split("/")[0] || 4);
      if (!Number.isFinite(beatsPerBar) || beatsPerBar <= 0) {
        return value;
      }
      const msPerBeat = 60000 / tempo.bpm;
      if (!Number.isFinite(msPerBeat) || msPerBeat <= 0) {
        return value;
      }
      const msPerBar = msPerBeat * beatsPerBar;
      if (!Number.isFinite(msPerBar) || msPerBar <= 0) {
        return value;
      }
      return Math.round(value / msPerBar) * msPerBar;
    },
    [tempo?.bpm, tempo?.quantized, tempo?.timeSig],
  );

  const handleOffsetInput = useCallback(
    (value: number) => {
      const snapped = snapToGrid(Math.round(value));
      const clamped = Math.max(
        -OFFSET_LIMIT_MS,
        Math.min(OFFSET_LIMIT_MS, Math.round(snapped)),
      );
      onOffsetChange?.(clamped);
    },
    [onOffsetChange, snapToGrid],
  );

  useEffect(() => {
    const inst = instrumentalRef.current;
    const voc = vocalRef.current;
    if (!inst || !voc) return;
    const handleEnded = () => {
      if (
        (inst.ended || inst.currentTime >= inst.duration) &&
        (voc.ended || voc.currentTime >= voc.duration)
      ) {
        setIsPlaying(false);
        stopRaf();
      }
    };
    inst.addEventListener("ended", handleEnded);
    voc.addEventListener("ended", handleEnded);
    return () => {
      inst.removeEventListener("ended", handleEnded);
      voc.removeEventListener("ended", handleEnded);
    };
  }, [stopRaf]);

  useEffect(() => {
    return () => {
      stopRaf();
      audioContextRef.current?.close().catch(() => null);
      releaseAudioFocus(playerIdRef.current);
    };
  }, [stopRaf]);

  const formattedTime = useMemo(() => {
    const totalSeconds = Math.floor(duration);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [duration]);

  return (
    <div
      className={cn(
        "rounded-xl border border-muted bg-secondary/40 p-4",
        !isReady && "opacity-60",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!isReady}
            onClick={isPlaying ? handlePause : handlePlay}
          >
            {isPlaying ? "Pause" : "Play"}
          </Button>
          <div className="text-xs text-muted-foreground">
            {isReady ? "Preview instrumental + vocal alignment" : "Add both stems to preview"}
          </div>
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">Len {formattedTime}</div>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <div className="flex items-center justify-between text-xs font-medium">
            <span>Instrumental</span>
            <span className="text-muted-foreground">
              {(instrumentalLevel * 100).toFixed(0).padStart(2, "0")}%
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.min(100, 5 + instrumentalLevel * 95)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs font-medium">
            <span>Vocal</span>
            <span className="text-muted-foreground">
              {(vocalLevel * 100).toFixed(0).padStart(2, "0")}%
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary/70 transition-[width]"
              style={{ width: `${Math.min(100, 5 + vocalLevel * 95)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-medium">
          <span>Sync offset</span>
          <span className="text-muted-foreground">{offsetMs} ms</span>
        </div>
        <Slider
          disabled={!isReady}
          min={-OFFSET_LIMIT_MS}
          max={OFFSET_LIMIT_MS}
          step={5}
          value={[offsetMs]}
          onValueChange={(values) => handleOffsetInput(values[0] ?? 0)}
          className="mt-2"
        />
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={-OFFSET_LIMIT_MS}
            max={OFFSET_LIMIT_MS}
            step={1}
            value={offsetMs}
            disabled={!isReady}
            className="h-9 w-24"
            onChange={(event) => handleOffsetInput(Number(event.target.value))}
          />
          <div className="text-xs text-muted-foreground">
            Negative values start vocals first; positive values delay vocals.
          </div>
        </div>
      </div>

      <div className="relative mt-4 h-8 w-full overflow-hidden rounded-full bg-muted/70">
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" aria-hidden />
        <div
          className="absolute inset-y-0 left-0 rounded-r-full bg-primary/70 transition-[width]"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      <audio ref={instrumentalRef} src={instrumentalSrc} preload="metadata" />
      <audio ref={vocalRef} src={vocalSrc} preload="metadata" />
    </div>
  );
}

export default MiniPlayer;
