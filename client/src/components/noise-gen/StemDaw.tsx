import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { releaseAudioFocus, requestAudioFocus } from "@/lib/audio-focus";
import type { TempoMeta } from "@/types/noise-gens";
import {
  Activity,
  ChevronDown,
  Music2,
  Pause,
  Play,
  Sparkles,
  Star,
  StarOff,
  Waves,
} from "lucide-react";

export type StemVariant = {
  id: string;
  label: string;
  url?: string;
  isOriginal?: boolean;
  createdAt?: number;
  knowledgeFileId?: string;
};

export type StemClip = {
  id: string;
  label: string;
  url?: string;
  color?: string;
  variants?: StemVariant[];
  knowledgeFileId?: string;
  waveformPeaks?: number[];
  waveformDurationMs?: number;
};

export type DawTrack = {
  id: string;
  name: string;
  stems: StemClip[];
  tempo?: TempoMeta;
  durationSeconds?: number;
};

type StemState = { muted: boolean; solo: boolean };
type SourceHandle = { stemId: string; source: AudioBufferSourceNode; gain: GainNode };

const STEM_COLORS = ["#38bdf8", "#f97316", "#22c55e", "#f43f5e", "#06b6d4", "#eab308"];
const BEAT_PX = 52;
const STEM_ROW_PITCH = 28;
const STEM_ROW_HEIGHT = 18;
const STEM_ROW_OFFSET = 10;
const STEM_LIST_MAX_HEIGHT = 360;
const TIMELINE_MAX_HEIGHT = 320;
const WAVEFORM_SAMPLES = 180;
const STORAGE_KEY_PREFIX = "stemDaw:track:";
const FAVORITES_KEY = "stemDaw:favorites";

type WaveformCacheEntry = {
  samples: number[];
  path: string;
  durationMs: number;
};

type PersistedDawState = {
  bpm: number;
  timeSig: TempoMeta["timeSig"];
  barsInLoop?: number;
  updatedAt?: number;
  userOverride?: boolean;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const buildWaveformSamples = (buffer: AudioBuffer, sampleCount = WAVEFORM_SAMPLES): number[] => {
  if (!buffer || buffer.length === 0 || sampleCount <= 0) return [];
  const samples: number[] = new Array(sampleCount).fill(0);
  const channelCount = buffer.numberOfChannels;
  const totalSamples = buffer.length;
  const blockSize = Math.max(1, Math.floor(totalSamples / sampleCount));
  const channels = Array.from({ length: channelCount }, (_, index) =>
    buffer.getChannelData(index),
  );
  for (let i = 0; i < sampleCount; i += 1) {
    const start = i * blockSize;
    if (start >= totalSamples) {
      samples[i] = 0;
      continue;
    }
    const end = Math.min(totalSamples, start + blockSize);
    let peak = 0;
    for (const data of channels) {
      for (let j = start; j < end; j += 1) {
        const value = Math.abs(data[j] ?? 0);
        if (value > peak) peak = value;
      }
    }
    samples[i] = clamp01(peak);
  }
  return samples;
};

const buildWaveformPath = (samples: number[]): string => {
  if (!samples.length) return "";
  const mid = 0.5;
  const scale = 0.48;
  const maxIndex = samples.length - 1;
  let path = `M 0 ${(mid - samples[0] * scale).toFixed(3)}`;
  for (let i = 1; i <= maxIndex; i += 1) {
    path += ` L ${i} ${(mid - samples[i] * scale).toFixed(3)}`;
  }
  for (let i = maxIndex; i >= 0; i -= 1) {
    path += ` L ${i} ${(mid + samples[i] * scale).toFixed(3)}`;
  }
  path += " Z";
  return path;
};

const loadPersistedState = (trackId?: string): PersistedDawState | null => {
  if (!trackId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${trackId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDawState;
    if (typeof parsed.bpm === "number" && typeof parsed.timeSig === "string") {
      return parsed;
    }
  } catch {
    // ignore corrupted storage
  }
  return null;
};

const persistState = (trackId: string, state: PersistedDawState) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${trackId}`, JSON.stringify(state));
  } catch {
    // ignore quota/storage errors
  }
};

const loadFavoriteVariants = (): Record<string, boolean> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // ignore
  }
  return {};
};

const persistFavoriteVariants = (map: Record<string, boolean>) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
};

const parseTimeSig = (value: string | undefined) => {
  if (!value || !value.includes("/")) return { beats: 4, label: "4/4" as TempoMeta["timeSig"] };
  const [num, den] = value.split("/").map((part) => Number(part));
  if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) {
    return { beats: 4, label: "4/4" as TempoMeta["timeSig"] };
  }
  return { beats: num, label: `${num}/${den}` as TempoMeta["timeSig"] };
};

const normalizeVariantsForStem = (stem: StemClip): StemVariant[] => {
  const provided = Array.isArray(stem.variants) ? stem.variants.filter(Boolean) : [];
  const hasOriginal = provided.some((variant) => variant.isOriginal || variant.id === stem.id || variant.url === stem.url);
  const originalVariant: StemVariant = {
    id: `${stem.id}::original`,
    label: stem.label || "Original",
    url: stem.url,
    isOriginal: true,
  };
  const merged = hasOriginal || !stem.url ? provided : [originalVariant, ...provided];
  const seen = new Set<string>();
  return merged
    .filter((variant) => {
      if (!variant.id) return false;
      if (seen.has(variant.id)) return false;
      seen.add(variant.id);
      return true;
    })
    .map((variant) => ({
      ...variant,
      isOriginal: variant.isOriginal || variant.id === originalVariant.id,
    }));
};

type StemDawProps = {
  track?: DawTrack;
  onSendToCover?: () => void;
  coverKnowledgeCount?: number;
};

export function StemDaw({ track, onSendToCover, coverKnowledgeCount }: StemDawProps) {
  const [bpm, setBpm] = useState<number>(() => track?.tempo?.bpm ?? 120);
  const [timeSig, setTimeSig] = useState<TempoMeta["timeSig"]>(() => track?.tempo?.timeSig ?? "4/4");
  const [userOverride, setUserOverride] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [durationMs, setDurationMs] = useState(() => (track?.durationSeconds ?? 0) * 1000);
  const [stemStates, setStemStates] = useState<Record<string, StemState>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeVariants, setActiveVariants] = useState<Record<string, string>>({});
  const [favoriteVariants, setFavoriteVariants] = useState<Record<string, boolean>>(() => loadFavoriteVariants());

  const audioContextRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Record<string, AudioBuffer | null>>({});
  const waveformCacheRef = useRef<Record<string, WaveformCacheEntry>>({});
  const activeSourcesRef = useRef<SourceHandle[]>([]);
  const startAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const playerIdRef = useRef(
    `noisegen-daw-${Math.random().toString(36).slice(2, 10)}`,
  );

  const parsedTimeSig = useMemo(() => parseTimeSig(timeSig), [timeSig]);
  const beatsPerBar = parsedTimeSig.beats;
  const msPerBeat = useMemo(() => (bpm > 0 ? 60000 / bpm : 500), [bpm]);
  const msPerBar = msPerBeat * beatsPerBar;
  const expectedBars = useMemo(() => {
    if (track?.tempo?.barsInLoop && Number.isFinite(track.tempo.barsInLoop)) {
      return Math.max(1, Math.round(track.tempo.barsInLoop));
    }
    if (durationMs > 0 && msPerBar > 0) {
      return Math.max(1, Math.ceil(durationMs / msPerBar));
    }
    return 8;
  }, [durationMs, msPerBar, track?.tempo?.barsInLoop]);
  const timelineWidth = Math.max(expectedBars * beatsPerBar * BEAT_PX, 520);

  const soloIds = useMemo(() => {
    return new Set(
      Object.entries(stemStates)
        .filter(([, state]) => state.solo)
        .map(([id]) => id),
    );
  }, [stemStates]);

  const stemsWithVariants = useMemo(() => {
    if (!track) return [];
    return track.stems.map((stem) => ({
      ...stem,
      variants: normalizeVariantsForStem(stem),
    }));
  }, [track]);
  const stemWaveforms = useMemo(() => {
    const map: Record<string, WaveformCacheEntry> = {};
    stemsWithVariants.forEach((stem) => {
      if (!stem.waveformPeaks || stem.waveformPeaks.length === 0) return;
      const durationMs = stem.waveformDurationMs ?? 0;
      map[stem.id] = {
        samples: stem.waveformPeaks,
        path: buildWaveformPath(stem.waveformPeaks),
        durationMs,
      };
    });
    return map;
  }, [stemsWithVariants]);
  const timelineContentHeight = Math.max(
    120,
    stemsWithVariants.length * STEM_ROW_PITCH + STEM_ROW_OFFSET * 2,
  );
  const timelineViewportHeight = Math.min(TIMELINE_MAX_HEIGHT, timelineContentHeight);

  const variantLookup = useMemo(() => {
    const map: Record<string, StemVariant & { stemId: string }> = {};
    stemsWithVariants.forEach((stem) => {
      (stem.variants ?? []).forEach((variant) => {
        map[variant.id] = { ...variant, stemId: stem.id };
      });
    });
    return map;
  }, [stemsWithVariants]);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === "undefined") return null;
    let ctx = audioContextRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      audioContextRef.current = ctx;
    }
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx;
  }, []);

  const stopPlayback = useCallback(() => {
    activeSourcesRef.current.forEach(({ source }) => {
      try {
        source.stop();
      } catch {
        /* ignore */
      }
    });
    activeSourcesRef.current = [];
    startAtRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsPlaying(false);
    setProgress(0);
    setPlayheadMs(0);
    releaseAudioFocus(playerIdRef.current);
  }, [releaseAudioFocus]);

  const pausePlayback = useCallback(() => {
    const ctx = audioContextRef.current;
    const startedAt = startAtRef.current;
    const elapsedMs =
      ctx && startedAt != null
        ? Math.max(0, (ctx.currentTime - startedAt) * 1000)
        : playheadMs;
    const clamped = durationMs > 0 ? Math.min(elapsedMs, durationMs) : elapsedMs;
    stopPlayback();
    setPlayheadMs(clamped);
    setProgress(durationMs > 0 ? Math.min(1, clamped / durationMs) : 0);
  }, [durationMs, playheadMs, stopPlayback]);

  const updateMeters = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !durationMs || startAtRef.current == null) return;
    const elapsed = Math.max(0, (ctx.currentTime - startAtRef.current) * 1000);
    const pct = Math.min(1, durationMs > 0 ? elapsed / durationMs : 0);
    setProgress(pct);
    setPlayheadMs(elapsed);
    rafRef.current = requestAnimationFrame(updateMeters);
  }, [durationMs]);

  useEffect(() => {
    return () => {
      stopPlayback();
      audioContextRef.current?.close().catch(() => null);
      releaseAudioFocus(playerIdRef.current);
    };
  }, [releaseAudioFocus, stopPlayback]);

  useEffect(() => {
    const persisted = loadPersistedState(track?.id);
    const manualOverride = Boolean(persisted?.userOverride);
    const initialBpm =
      !manualOverride && typeof track?.tempo?.bpm === "number"
        ? track.tempo.bpm
        : persisted?.bpm ?? track?.tempo?.bpm ?? 120;
    const initialTimeSig = (
      !manualOverride && track?.tempo?.timeSig
        ? track.tempo.timeSig
        : persisted?.timeSig ?? track?.tempo?.timeSig ?? "4/4"
    ) as TempoMeta["timeSig"];

    setBpm(initialBpm);
    setTimeSig(initialTimeSig);
    setUserOverride(manualOverride);
    const trackDuration = (track?.durationSeconds ?? 0) * 1000;
    const analysisDuration = stemsWithVariants.reduce((acc, stem) => {
      const duration = stem.waveformDurationMs ?? 0;
      return duration > acc ? duration : acc;
    }, 0);
    setDurationMs(Math.max(trackDuration, analysisDuration));
    setStemStates((prev) => {
      const next: Record<string, StemState> = {};
      track?.stems.forEach((stem) => {
        next[stem.id] = prev[stem.id] ?? { muted: false, solo: false };
      });
      return next;
    });
    setActiveVariants(() => {
      const next: Record<string, string> = {};
      stemsWithVariants.forEach((stem) => {
        const variants = stem.variants ?? [];
        const fallback = variants.find((variant) => variant.isOriginal)?.id ?? variants[0]?.id;
        if (fallback) next[stem.id] = fallback;
      });
      return next;
    });
    buffersRef.current = {};
    waveformCacheRef.current = {};
    setLoadError(null);
    setLoading(false);
    stopPlayback();
  }, [track, stemsWithVariants, stopPlayback]);

  // Persist BPM/grid settings per track
  useEffect(() => {
    if (!track?.id) return;
    const handle = window.setTimeout(() => {
      persistState(track.id, {
        bpm,
        timeSig,
        barsInLoop: track.tempo?.barsInLoop,
        updatedAt: Date.now(),
        userOverride,
      });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [track?.id, track?.tempo?.barsInLoop, bpm, timeSig, userOverride]);

  useEffect(() => {
    persistFavoriteVariants(favoriteVariants);
  }, [favoriteVariants]);

  const resolveStemColor = useCallback(
    (stem: StemClip, index: number) => stem.color ?? STEM_COLORS[index % STEM_COLORS.length],
    [],
  );

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      const ctx = await ensureAudioContext();
      if (!ctx || cancelled) return;
      const loaded: Record<string, AudioBuffer | null> = {};
      let longest = track.durationSeconds ? track.durationSeconds * 1000 : 0;
      const variantsToLoad = stemsWithVariants.flatMap((stem) => stem.variants ?? []);
      for (const variant of variantsToLoad) {
        if (!variant.url) {
          loaded[variant.id] = null;
          delete waveformCacheRef.current[variant.id];
          continue;
        }
        try {
          const response = await fetch(variant.url, { signal: controller.signal });
          const data = await response.arrayBuffer();
          const buffer = await ctx.decodeAudioData(data);
          loaded[variant.id] = buffer;
          longest = Math.max(longest, buffer.duration * 1000);
          const variantMeta = variantLookup[variant.id];
          const precomputed =
            variantMeta?.isOriginal && variantMeta?.stemId
              ? stemWaveforms[variantMeta.stemId]
              : undefined;
          if (precomputed) {
            waveformCacheRef.current[variant.id] = { ...precomputed };
          } else {
            const samples = buildWaveformSamples(buffer);
            waveformCacheRef.current[variant.id] = {
              samples,
              path: buildWaveformPath(samples),
              durationMs: buffer.duration * 1000,
            };
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          loaded[variant.id] = null;
          delete waveformCacheRef.current[variant.id];
          const label = variant.label || variant.id;
          setLoadError((prev) => prev ?? `Could not decode ${label}`);
        }
      }
      if (!cancelled) {
        buffersRef.current = loaded;
        setDurationMs(longest);
        setLoading(false);
      }
    };
    load().catch((error) => {
      if (!cancelled) {
        setLoadError(error instanceof Error ? error.message : "Failed to load stems");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
      stopPlayback();
    };
  }, [ensureAudioContext, stemWaveforms, stemsWithVariants, stopPlayback, track, variantLookup]);

  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const soloActive = soloIds.size > 0;
    activeSourcesRef.current.forEach(({ stemId, gain }) => {
      const state = stemStates[stemId] ?? { muted: false, solo: false };
      const muted = state.muted || (soloActive && !state.solo);
      gain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
    });
  }, [soloIds, stemStates]);

  useEffect(() => {
    if (!track) return;
    const fallback = track.durationSeconds ? track.durationSeconds * 1000 : 0;
    const longest = stemsWithVariants.reduce((acc, stem) => {
      const variantId = activeVariants[stem.id];
      const buffer = variantId ? buffersRef.current[variantId] : null;
      if (buffer) return Math.max(acc, buffer.duration * 1000);
      return acc;
    }, fallback);
    if (longest > 0) {
      setDurationMs(longest);
    }
  }, [activeVariants, stemsWithVariants, track]);

  const startPlayback = useCallback(
    async (offsetMs = 0, overrideSelection?: Record<string, string>) => {
      if (!track || stemsWithVariants.length === 0) return;
      const ctx = await ensureAudioContext();
      if (!ctx) return;
      stopPlayback();
      const startAt = ctx.currentTime + 0.05;
      const soloActive = soloIds.size > 0;
      const handles: SourceHandle[] = [];
      let longest = durationMs;
      const offsetSec = Math.max(0, offsetMs / 1000);
      const selection = overrideSelection ?? activeVariants;

      for (const stem of stemsWithVariants) {
        const variants = stem.variants ?? [];
        const variantId = selection[stem.id] ?? variants[0]?.id;
        if (!variantId) continue;
        const buffer = buffersRef.current[variantId];
        if (!buffer) continue;
        const startOffset = Math.max(0, Math.min(offsetSec, Math.max(0, buffer.duration - 0.01)));
        if (buffer.duration === 0 || startOffset >= buffer.duration) continue;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        const state = stemStates[stem.id] ?? { muted: false, solo: false };
        const muted = state.muted || (soloActive && !state.solo);
        gain.gain.value = muted ? 0 : 1;
        source.connect(gain).connect(ctx.destination);
        source.start(startAt, startOffset);
        handles.push({ stemId: stem.id, source, gain });
        longest = Math.max(longest, buffer.duration * 1000);
      }

      if (!handles.length) return;
      activeSourcesRef.current = handles;
      const effectiveOffsetSec = longest > 0 ? Math.min(offsetSec, longest / 1000) : offsetSec;
      startAtRef.current = startAt - effectiveOffsetSec;
      setDurationMs(longest);
      setProgress(longest > 0 ? Math.min(1, (effectiveOffsetSec * 1000) / longest) : 0);
      setPlayheadMs(effectiveOffsetSec * 1000);
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(updateMeters);
    },
    [activeVariants, durationMs, ensureAudioContext, soloIds, stemStates, stemsWithVariants, stopPlayback, track, updateMeters],
  );

  const handlePlay = useCallback(() => {
    const resumeFrom = playheadMs >= durationMs ? 0 : playheadMs;
    requestAudioFocus({ id: playerIdRef.current, stop: pausePlayback });
    void startPlayback(resumeFrom);
  }, [durationMs, pausePlayback, playheadMs, requestAudioFocus, startPlayback]);

  const handlePause = useCallback(() => {
    pausePlayback();
  }, [pausePlayback]);

  const toggleMute = useCallback((stemId: string) => {
    setStemStates((prev) => ({
      ...prev,
      [stemId]: { muted: !prev[stemId]?.muted, solo: prev[stemId]?.solo ?? false },
    }));
  }, []);

  const toggleSolo = useCallback((stemId: string) => {
    setStemStates((prev) => ({
      ...prev,
      [stemId]: { muted: prev[stemId]?.muted ?? false, solo: !prev[stemId]?.solo },
    }));
  }, []);

  const handleVariantSelect = useCallback(
    (stemId: string, variantId: string) => {
      setActiveVariants((prev) => {
        const next = { ...prev, [stemId]: variantId };
        if (isPlaying) {
          void startPlayback(playheadMs, next);
        }
        return next;
      });
    },
    [isPlaying, playheadMs, startPlayback],
  );

  const toggleFavorite = useCallback((variantId: string) => {
    setFavoriteVariants((prev) => ({
      ...prev,
      [variantId]: !prev[variantId],
    }));
  }, []);

  const barMarkers = useMemo(() => {
    return Array.from({ length: expectedBars }, (_, index) => index);
  }, [expectedBars]);

  const playbackLabel = useMemo(() => {
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const elapsedSeconds = Math.max(0, Math.floor(playheadMs / 1000));
    const format = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };
    return `${format(elapsedSeconds)} / ${format(totalSeconds)}`;
  }, [durationMs, playheadMs]);

  const canSendToCover = Boolean(onSendToCover && (coverKnowledgeCount ?? 0) > 0);

  if (!track) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-sm text-slate-300">
        Pick a song from the list to open the DAW view.
      </div>
    );
  }

  const timelineBackground = {
    backgroundImage: `
      repeating-linear-gradient(
        to right,
        rgba(255,255,255,0.05),
        rgba(255,255,255,0.05) 1px,
        transparent 1px,
        transparent ${BEAT_PX}px
      ),
      repeating-linear-gradient(
        to right,
        rgba(56,189,248,0.2),
        rgba(56,189,248,0.2) 2px,
        transparent 2px,
        transparent ${BEAT_PX * beatsPerBar}px
      )
    `,
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-slate-950/70 to-slate-900/60 p-5 text-slate-100 shadow-[0_20px_60px_-40px_rgba(8,145,178,0.55)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/80">DAW Preview</p>
          <h3 className="text-lg font-semibold leading-tight text-white">{track.name}</h3>
          <p className="text-xs text-slate-400">Aligned stems, locked to {parsedTimeSig.label} at your BPM.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Badge variant="outline" className="border-cyan-400/40 bg-cyan-400/10 text-cyan-100">
            {stemsWithVariants.length} stems
          </Badge>
          <Badge variant="outline" className="border-emerald-400/40 bg-emerald-400/10 text-emerald-100">
            {bpm.toFixed(1)} BPM
          </Badge>
          <Badge variant="outline" className="border-sky-400/40 bg-sky-400/10 text-sky-100">
            Grid {parsedTimeSig.label}
          </Badge>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={isPlaying ? handlePause : handlePlay} disabled={loading}>
            {isPlaying ? <Pause className="mr-1 h-4 w-4" /> : <Play className="mr-1 h-4 w-4" />}
            {isPlaying ? "Pause" : "Play all"}
          </Button>
          <Button size="sm" variant="ghost" onClick={stopPlayback} disabled={loading && !isPlaying}>
            <Waves className="mr-1 h-4 w-4" />
            Reset
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onSendToCover}
            disabled={!canSendToCover}
            className="text-xs"
          >
            Send to Cover{coverKnowledgeCount ? ` (${coverKnowledgeCount})` : ""}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1">
            <Music2 className="h-3.5 w-3.5 text-cyan-300" />
            {playbackLabel}
          </span>
          {loading ? (
            <span className="flex items-center gap-1 text-amber-200">
              <Activity className="h-3.5 w-3.5 animate-spin" />
              Loading stems...
            </span>
          ) : loadError ? (
            <span className="text-amber-300">{loadError}</span>
          ) : (
            <span className="text-emerald-300">Ready</span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Tempo + grid</p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={bpm}
              min={40}
              max={220}
              step={0.5}
              onChange={(event) => {
                setUserOverride(true);
                setBpm(Number(event.target.value) || 0);
              }}
              className="h-9 w-24 bg-slate-900/60 text-sm"
            />
            <span className="text-xs text-slate-400">BPM</span>
            <Input
              value={timeSig}
              onChange={(event) => {
                setUserOverride(true);
                setTimeSig(event.target.value as TempoMeta["timeSig"]);
              }}
              className="h-9 w-20 bg-slate-900/60 text-sm"
            />
            <span className="text-xs text-slate-400">Time</span>
          </div>
          <div>
            <Slider
              value={[bpm]}
              min={60}
              max={180}
              step={1}
              onValueChange={(values) => {
                setUserOverride(true);
                setBpm(values[0] ?? bpm);
              }}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Stems start together and follow this grid; change BPM to match your track.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Stems</p>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1" style={{ maxHeight: STEM_LIST_MAX_HEIGHT }}>
              {stemsWithVariants.map((stem, index) => {
                const state = stemStates[stem.id] ?? { muted: false, solo: false };
                const muted = state.muted || (soloIds.size > 0 && !state.solo);
                const color = resolveStemColor(stem, index);
                const variants = stem.variants ?? [];
                const activeVariantId = activeVariants[stem.id] ?? variants[0]?.id;
                const activeVariant =
                  (activeVariantId ? variantLookup[activeVariantId] : undefined) ||
                  variants.find((variant) => variant.id === activeVariantId);
                const sortedVariants = [...variants].sort((a, b) => {
                  if (a.isOriginal && !b.isOriginal) return -1;
                  if (b.isOriginal && !a.isOriginal) return 1;
                  const favA = favoriteVariants[a.id] ? 1 : 0;
                  const favB = favoriteVariants[b.id] ? 1 : 0;
                  if (favA !== favB) return favB - favA;
                  return (b.createdAt ?? 0) - (a.createdAt ?? 0);
                });
                const isFavorite = activeVariantId ? favoriteVariants[activeVariantId] : false;
                return (
                  <DropdownMenu key={stem.id}>
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
                      <DropdownMenuTrigger asChild>
                        <button
                          className={cn(
                            "flex flex-1 items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left transition",
                            muted
                              ? "border-white/5 bg-slate-950/60"
                              : "border-cyan-400/40 bg-slate-900/70 shadow-[0_12px_40px_-30px_rgba(56,189,248,0.55)]",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                            <div>
                              <div className={cn("text-sm font-semibold", muted ? "text-slate-500 line-through" : "text-white")}>
                                {stem.label}
                              </div>
                              <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                                <span className="text-slate-300">
                                  {activeVariant ? `Active: ${activeVariant.label}` : "Pick a take"}
                                </span>
                                {activeVariant?.isOriginal ? (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-400/50 bg-amber-400/10 text-[10px] uppercase tracking-wide text-amber-200"
                                  >
                                    Original
                                  </Badge>
                                ) : null}
                                {isFavorite ? (
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-400/60 bg-emerald-400/10 text-[10px] uppercase tracking-wide text-emerald-200"
                                  >
                                    Starred
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <ChevronDown className="h-4 w-4 text-slate-300" />
                        </button>
                      </DropdownMenuTrigger>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant={state.muted ? "secondary" : "ghost"}
                          className="h-8 px-2 text-xs"
                          onClick={() => toggleMute(stem.id)}
                        >
                          {state.muted ? "Unmute" : "Mute"}
                        </Button>
                        <Button
                          size="sm"
                          variant={state.solo ? "secondary" : "ghost"}
                          className="h-8 px-2 text-xs"
                          onClick={() => toggleSolo(stem.id)}
                        >
                          Solo
                        </Button>
                      </div>
                    </div>
                    <DropdownMenuContent
                      align="end"
                      className="w-80 border-white/10 bg-slate-900/95 text-slate-100 backdrop-blur"
                    >
                      <DropdownMenuLabel className="text-xs uppercase tracking-wide text-slate-300">
                        Switch takes for {stem.label}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className="bg-white/5" />
                      {sortedVariants.length === 0 ? (
                        <DropdownMenuItem disabled className="text-xs text-slate-400">
                          No renders attached to this stem yet.
                        </DropdownMenuItem>
                      ) : (
                        sortedVariants.map((variant) => {
                          const isActive = variant.id === activeVariantId;
                          const favorite = favoriteVariants[variant.id];
                          return (
                            <DropdownMenuItem
                              key={variant.id}
                              className={cn(
                                "flex items-center justify-between gap-2 rounded-md text-sm text-slate-100 data-[highlighted]:bg-slate-800",
                                isActive ? "bg-slate-800/80" : "bg-transparent",
                              )}
                              onSelect={(event) => {
                                event.preventDefault();
                                handleVariantSelect(stem.id, variant.id);
                              }}
                            >
                              <div className="flex flex-col">
                                <span className="flex items-center gap-2">
                                  <span>{variant.label}</span>
                                  {variant.isOriginal ? (
                                    <Sparkles className="h-3.5 w-3.5 text-amber-200" />
                                  ) : null}
                                  {favorite ? <Star className="h-3.5 w-3.5 fill-emerald-300 text-emerald-300" /> : null}
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {variant.isOriginal ? "Original take pinned to album" : "Generated from this stem"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {isActive ? (
                                  <Badge className="h-6 border-emerald-400/40 bg-emerald-400/10 text-[11px] text-emerald-100">
                                    Live
                                  </Badge>
                                ) : null}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-amber-200 hover:text-amber-100"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    toggleFavorite(variant.id);
                                  }}
                                  aria-label={favorite ? "Unstar generation" : "Star generation"}
                                >
                                  {favorite ? (
                                    <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
                                  ) : (
                                    <StarOff className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </DropdownMenuItem>
                          );
                        })
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>{expectedBars} bars at {parsedTimeSig.label}</span>
              <span>Beat spacing {BEAT_PX}px</span>
            </div>
            <div
              className="mt-3 overflow-auto"
              style={{ height: timelineViewportHeight, maxHeight: timelineViewportHeight }}
            >
              <div
                ref={timelineRef}
                className="relative min-w-full overflow-hidden rounded-lg border border-white/10"
                style={{ minWidth: timelineWidth, height: timelineContentHeight, ...timelineBackground }}
              >
                {barMarkers.map((bar) => (
                  <div
                    key={bar}
                    className="absolute inset-y-0 border-r border-cyan-400/30"
                    style={{ left: `${(bar * beatsPerBar * BEAT_PX)}px`, width: 1 }}
                  />
                ))}
                <div className="absolute inset-0">
                  {stemsWithVariants.map((stem, index) => {
                    const top = index * STEM_ROW_PITCH + STEM_ROW_OFFSET;
                    const height = STEM_ROW_HEIGHT;
                    const color = resolveStemColor(stem, index);
                    const state = stemStates[stem.id] ?? { muted: false, solo: false };
                    const muted = state.muted || (soloIds.size > 0 && !state.solo);
                    const activeVariantId = activeVariants[stem.id];
                    const isFavorite = activeVariantId ? favoriteVariants[activeVariantId] : false;
                    const waveform =
                      (activeVariantId ? waveformCacheRef.current[activeVariantId] : undefined) ??
                      stemWaveforms[stem.id];
                    const waveformDuration =
                      waveform && waveform.durationMs > 0 ? waveform.durationMs : durationMs;
                    const waveformWidth =
                      waveform && durationMs > 0
                        ? Math.max(0.02, Math.min(1, waveformDuration / durationMs))
                        : 1;
                    const waveformViewBox = waveform ? Math.max(1, waveform.samples.length - 1) : 1;
                    const boxShadow = isFavorite
                      ? `0 0 0 1px ${color}40, 0 0 0 6px rgba(16,185,129,0.25)`
                      : `0 0 0 1px ${color}20`;
                    return (
                      <div
                        key={stem.id}
                        className="absolute overflow-hidden rounded-full bg-white/10"
                        style={{
                          top,
                          left: 6,
                          height,
                          width: timelineWidth - 12,
                          border: `1px solid ${color}`,
                          opacity: muted ? 0.35 : 1,
                          boxShadow,
                        }}
                      >
                        {waveform?.path ? (
                          <svg
                            className="absolute inset-y-0 left-0"
                            style={{ width: `${(waveformWidth * 100).toFixed(2)}%` }}
                            viewBox={`0 0 ${waveformViewBox} 1`}
                            preserveAspectRatio="none"
                            aria-hidden="true"
                          >
                            <path
                              d={waveform.path}
                              fill={color}
                              fillOpacity={muted ? 0.2 : 0.35}
                            />
                          </svg>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div
                  className="absolute inset-y-0 w-[2px] bg-emerald-300 shadow-[0_0_0_3px_rgba(52,211,153,0.35)]"
                  style={{ left: `${progress * timelineWidth}px` }}
                />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
            <p className="font-semibold text-white">What this view guarantees</p>
            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-300">
              <li>- All stems start at the same downbeat; use mute/solo to audition layers.</li>
              <li>- The beat grid follows your BPM so visuals and playback stay locked.</li>
              <li>- Bars derive from the longest stem; set <code>barsInLoop</code> in tempo meta to pin a loop length.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StemDaw;
