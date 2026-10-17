import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useDraggable } from "@dnd-kit/core";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchMoodPresets,
  fetchPendingOriginals,
  fetchTopGenerations,
  fetchTopOriginals,
} from "@/lib/api/noiseGens";
import type {
  Generation,
  MoodPreset,
  Original,
  ProcessingState,
  TempoMeta,
} from "@/types/noise-gens";
import { cn } from "@/lib/utils";

type DualTopListsProps = {
  selectedOriginalId?: string | null;
  onOriginalSelected: (original: Original) => void;
  onGenerationsPresenceChange?: (hasGenerations: boolean) => void;
  onMoodPresetsLoaded?: (presets: MoodPreset[]) => void;
  onOriginalsHydrated?: (originals: Original[]) => void;
  sessionTempo?: TempoMeta | null;
  layout?: "default" | "listener";
  isActive?: boolean;
};

type RankedOriginal = Original & { rank: number };
type RankedGeneration = Generation & { rank: number };

type ConnectorPath = {
  id: string;
  path: string;
};

const SEARCH_DEBOUNCE_MS = 250;
const TEMPO_BOOST_WEIGHT = 0.15;
const LIST_REFRESH_INTERVAL_MS = 12_000;

type PendingStatusMeta = {
  label: string;
  progress: number;
  tone?: "default" | "error";
};

const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

const formatProcessingDetail = (detail?: string) =>
  detail ? `${detail.charAt(0).toUpperCase()}${detail.slice(1)}` : "";

const resolvePendingStatus = (processing?: ProcessingState): PendingStatusMeta => {
  if (!processing) {
    return { label: "Queued for mixdown", progress: 10 };
  }
  if (processing.status === "error") {
    return { label: "Mixdown failed", progress: 100, tone: "error" };
  }
  const detail = processing.detail?.toLowerCase() ?? "";
  if (detail.includes("awaiting mixdown")) {
    return { label: "Queued for mixdown", progress: 20 };
  }
  if (detail.includes("building playback mixdown")) {
    return { label: "Building playback mixdown", progress: 60 };
  }
  if (detail.includes("playback ready")) {
    return {
      label: formatProcessingDetail(processing.detail) || "Playback ready",
      progress: 95,
    };
  }
  if (processing.status === "ready") {
    return { label: "Playback ready", progress: 95 };
  }
  if (processing.status === "processing") {
    return {
      label: formatProcessingDetail(processing.detail) || "Processing",
      progress: 40,
    };
  }
  return { label: "Queued", progress: 10 };
};
function tempoBadge(tempo?: TempoMeta) {
  if (!tempo?.bpm) return null;
  const bpmLabel = Math.round(tempo.bpm);
  const timeSig = tempo.timeSig || "4/4";
  return `${bpmLabel} BPM · ${timeSig}`;
}

function matchScoreToBoost(score: number) {
  if (!Number.isFinite(score)) return 0;
  if (score >= 4) return 1;
  if (score >= 3) return 0.6;
  if (score >= 2) return 0.3;
  return 0;
}

function tempoBoost(itemBpm?: number, sessionBpm?: number) {
  if (!itemBpm || !sessionBpm) return 0;
  const diff = Math.abs(itemBpm - sessionBpm);
  if (diff <= 2) return 1;
  if (diff >= 12) return 0;
  const scaled = 1 - (diff - 2) / 10;
  return Math.max(0, Math.min(1, scaled));
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => {
      window.clearTimeout(handle);
    };
  }, [value, delay]);
  return debounced;
}

function scoreMatch(haystack: string, needle: string) {
  if (!needle) return -Infinity;
  const normalizedHaystack = haystack.toLowerCase();
  const normalizedNeedle = needle.toLowerCase();
  if (normalizedHaystack === normalizedNeedle) return 4;
  if (normalizedHaystack.startsWith(normalizedNeedle)) return 3;
  if (normalizedHaystack.includes(normalizedNeedle)) return 2;
  return -Infinity;
}

type RankingOptions<T> = {
  sessionTempoBpm?: number;
  getTempoBpm?: (item: T) => number | undefined;
  tempoWeight?: number;
};

function buildRankedList<T extends { id: string; listens: number }>(
  items: T[],
  search: string,
  accessor: (item: T) => string[],
  options?: RankingOptions<T>,
): Array<T & { rank: number }> {
  if (!items.length) return [];
  const rankedByListens = [...items].sort((a, b) => b.listens - a.listens);
  const rankLookup = new Map<string, number>(
    rankedByListens.map((item, index) => [item.id, index + 1]),
  );
  const trimmedSearch = search.trim();
  const hasSearch = trimmedSearch.length > 0;
  const tempoWeight = options?.tempoWeight ?? TEMPO_BOOST_WEIGHT;
  const sessionTempoBpm = options?.sessionTempoBpm;
  const minListens = rankedByListens[rankedByListens.length - 1]?.listens ?? 0;
  const maxListens = rankedByListens[0]?.listens ?? 0;
  const listensRange = Math.max(1, maxListens - minListens);

  const scored = rankedByListens.map((item) => {
    const listensScore =
      listensRange === 0 ? 1 : (item.listens - minListens) / listensRange;
    const textScore = hasSearch
      ? matchScoreToBoost(
          accessor(item).reduce((best, field) => {
            const score = scoreMatch(field, trimmedSearch);
            return score > best ? score : best;
          }, -Infinity),
        )
      : 0;
    const tempoScore =
      options?.getTempoBpm && sessionTempoBpm
        ? tempoBoost(options.getTempoBpm(item), sessionTempoBpm)
        : 0;
    const score = listensScore + textScore + tempoWeight * tempoScore;
    return {
      item,
      rank: rankLookup.get(item.id) ?? 0,
      score,
      textScore,
      tempoScore,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.textScore !== a.textScore) return b.textScore - a.textScore;
    if (b.tempoScore !== a.tempoScore) return b.tempoScore - a.tempoScore;
    return a.rank - b.rank;
  });

  return scored.map(({ item, rank }) => ({ ...item, rank }));
}

const normalizeOriginalKey = (item: Original) =>
  `${item.title?.trim().toLowerCase() ?? ""}::${item.artist
    ?.trim()
    .toLowerCase() ?? ""}`;

function pickLatestOriginal<T extends Original>(current: T, next: T): T {
  const currentStamp = current.uploadedAt ?? 0;
  const nextStamp = next.uploadedAt ?? 0;
  if (nextStamp !== currentStamp) {
    return nextStamp > currentStamp ? next : current;
  }
  if (next.listens !== current.listens) {
    return next.listens > current.listens ? next : current;
  }
  if (next.duration !== current.duration) {
    return next.duration > current.duration ? next : current;
  }
  return current;
}

function dedupeOriginalsByTitle<T extends Original>(items: T[]): T[] {
  if (!items.length) return [];
  const map = new Map<string, T>();
  for (const item of items) {
    const key = normalizeOriginalKey(item);
    const existing = map.get(key);
    map.set(key, existing ? pickLatestOriginal(existing, item) : item);
  }
  return Array.from(map.values());
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);
  return prefersReducedMotion;
}

function useIsLargeScreen() {
  const [isLarge, setIsLarge] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(min-width: 1024px)");
    const handler = (event: MediaQueryListEvent) => setIsLarge(event.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);
  return isLarge;
}

type OriginalRowProps = {
  original: RankedOriginal;
  selected: boolean;
  onSelect: (value: Original) => void;
  setRef: (node: HTMLDivElement | null) => void;
  sessionTempo?: TempoMeta | null;
  layout?: "default" | "listener";
};

const OriginalRow = memo(
  ({
    original,
    selected,
    onSelect,
    setRef,
    sessionTempo,
    layout = "default",
  }: OriginalRowProps) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: `original-${original.id}`,
      data: { type: "original", original },
    });
    const { role: _dragRole, tabIndex: _dragTabIndex, ...draggableAttributes } = attributes;
    const composedRef = useCallback(
      (node: HTMLDivElement | null) => {
        setNodeRef(node);
        setRef(node);
      },
      [setNodeRef, setRef],
    );
    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(original);
        }
      },
      [onSelect, original],
    );
    const badge = tempoBadge(original.tempo);
    const tempoMatch = tempoBoost(original.tempo?.bpm, sessionTempo?.bpm);
    const isListenerLayout = layout === "listener";

    return (
      <div
        ref={composedRef}
        {...draggableAttributes}
        {...listeners}
        role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={() => onSelect(original)}
      onKeyDown={handleKeyDown}
      className={cn(
        "group relative flex cursor-pointer items-center gap-3 border px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isListenerLayout
          ? "rounded-lg border-white/10 bg-slate-950/40 hover:border-primary/40 hover:bg-primary/5"
          : "rounded-2xl border-transparent bg-background/40 hover:bg-primary/5",
        selected ? "border-primary/80 bg-primary/10 text-primary-foreground" : undefined,
        isDragging && "z-20 border-primary bg-primary/20",
      )}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
      }}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          #{original.rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{original.title}</div>
          <div className="text-xs text-muted-foreground">{original.artist}</div>
          {badge ? (
            <div className="mt-1">
              <span
                className={cn(
                  "inline-flex items-center rounded-full bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-300",
                  tempoMatch >= 0.85 && "bg-primary/20 text-primary-foreground",
                )}
              >
                {badge}
              </span>
            </div>
          ) : null}
        </div>
        <div className="text-xs font-medium text-muted-foreground tabular-nums">
          {original.listens.toLocaleString()} plays
        </div>
    </div>
    );
  },
);
OriginalRow.displayName = "OriginalRow";

type PendingOriginalRowProps = {
  original: Original;
  selected: boolean;
  onSelect: (value: Original) => void;
  sessionTempo?: TempoMeta | null;
  layout?: "default" | "listener";
};

const PendingOriginalRow = memo(
  ({
    original,
    selected,
    onSelect,
    sessionTempo,
    layout = "default",
  }: PendingOriginalRowProps) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: `original-${original.id}`,
      data: { type: "original", original },
    });
    const { role: _dragRole, tabIndex: _dragTabIndex, ...draggableAttributes } = attributes;
    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(original);
        }
      },
      [onSelect, original],
    );
    const badge = tempoBadge(original.tempo);
    const tempoMatch = tempoBoost(original.tempo?.bpm, sessionTempo?.bpm);      
    const isListenerLayout = layout === "listener";
    const pendingStatus = resolvePendingStatus(original.processing);
    const progressValue = clampPercent(pendingStatus.progress);

    return (
      <div
        ref={setNodeRef}
        {...draggableAttributes}
        {...listeners}
        role="option"
        aria-selected={selected}
        tabIndex={0}
        onClick={() => onSelect(original)}
        onKeyDown={handleKeyDown}
        className={cn(
          "group relative flex cursor-pointer items-center gap-3 border px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70",
          isListenerLayout
            ? "rounded-lg border-amber-400/20 bg-slate-950/40 hover:border-amber-300/60 hover:bg-amber-400/10"
            : "rounded-2xl border-transparent bg-background/40 hover:bg-amber-400/5",
          selected ? "border-amber-400/80 bg-amber-400/10 text-amber-100" : undefined,
          isDragging && "z-20 border-amber-400/80 bg-amber-400/20",
        )}
        style={{
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        }}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
          Pending
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{original.title}</div>
          <div className="text-xs text-muted-foreground">{original.artist}</div>
          {badge ? (
            <div className="mt-1">
              <span
                className={cn(
                  "inline-flex items-center rounded-full bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-300",
                  tempoMatch >= 0.85 && "bg-amber-400/20 text-amber-100",       
                )}
              >
                {badge}
              </span>
            </div>
          ) : null}
          <div className="mt-2 space-y-1">
            <div
              className={cn(
                "text-[11px] text-amber-200/80",
                pendingStatus.tone === "error" && "text-red-300",
              )}
            >
              {pendingStatus.label}
            </div>
            <div
              className={cn(
                "h-1.5 w-full overflow-hidden rounded-full bg-amber-500/15",
                pendingStatus.tone === "error" && "bg-red-500/10",
              )}
            >
              <div
                className={cn(
                  "h-full bg-amber-400/80 transition-all",
                  pendingStatus.tone === "error" && "bg-red-400/80",
                )}
                style={{ width: `${progressValue}%` }}
              />
            </div>
          </div>
        </div>
        {!isListenerLayout ? (
          <div className="text-xs font-medium text-amber-200/80 tabular-nums">
            {progressValue}%
          </div>
        ) : null}
      </div>
    );
  },
);
PendingOriginalRow.displayName = "PendingOriginalRow";

type GenerationRowProps = {
  generation: RankedGeneration;
  setRef?: (node: HTMLDivElement | null) => void;
};

const GenerationRow = memo(({ generation, setRef }: GenerationRowProps) => (
  <div
    ref={setRef}
    className="flex items-center gap-3 rounded-2xl bg-background/40 px-3 py-2"
  >
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
      #{generation.rank}
    </div>
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-semibold">{generation.title}</div>
      <div className="text-xs text-muted-foreground">Mood: {generation.mood}</div>
    </div>
    <div className="text-xs font-medium text-muted-foreground tabular-nums">
      {generation.listens.toLocaleString()} plays
    </div>
  </div>
));
GenerationRow.displayName = "GenerationRow";

export function DualTopLists({
  selectedOriginalId,
  onOriginalSelected,
  onGenerationsPresenceChange,
  onMoodPresetsLoaded,
  onOriginalsHydrated,
  sessionTempo,
  layout = "default",
  isActive = true,
}: DualTopListsProps) {
  const [searchOriginals, setSearchOriginals] = useState("");
  const [searchGenerations, setSearchGenerations] = useState("");
  const debouncedOriginals = useDebouncedValue(searchOriginals, SEARCH_DEBOUNCE_MS);
  const debouncedGenerations = useDebouncedValue(searchGenerations, SEARCH_DEBOUNCE_MS);
  const [recentUpdate, setRecentUpdate] = useState(false);
  const updateTimeoutRef = useRef<number | null>(null);
  const lastSignatureRef = useRef<string>("");
  const hasLoadedRef = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isLargeScreen = useIsLargeScreen();
  const showGenerations = layout !== "listener";
  const showConnectors = showGenerations && isLargeScreen && !prefersReducedMotion;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const originalRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const generationRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [paths, setPaths] = useState<ConnectorPath[]>([]);
  const [svgHeight, setSvgHeight] = useState(0);
  const updateQueuedRef = useRef(false);

  const setOriginalRef = useCallback((id: string) => {
    return (node: HTMLDivElement | null) => {
      if (node) {
        originalRefs.current[id] = node;
      } else {
        delete originalRefs.current[id];
      }
    };
  }, []);

  const setGenerationRef = useCallback((id: string) => {
    return (node: HTMLDivElement | null) => {
      if (node) {
        generationRefs.current[id] = node;
      } else {
        delete generationRefs.current[id];
      }
    };
  }, []);

  const { data: originalsData, isLoading: originalsLoading, isError: originalsError } = useQuery({
    queryKey: ["noise-gens", "originals", debouncedOriginals],
    queryFn: ({ signal }) => fetchTopOriginals(debouncedOriginals, signal),
    enabled: isActive,
    refetchInterval: isActive ? LIST_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: isActive,
    staleTime: 60_000,
  });

  const {
    data: pendingOriginalsData,
    isLoading: pendingOriginalsLoading,
    isError: pendingOriginalsError,
  } = useQuery({
    queryKey: ["noise-gens", "originals", "pending", debouncedOriginals],
    queryFn: ({ signal }) => fetchPendingOriginals(debouncedOriginals, signal),
    enabled: isActive,
    refetchInterval: isActive ? LIST_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: isActive,
    staleTime: 20_000,
  });

  const { data: generationsData, isLoading: generationsLoading, isError: generationsError } =
    useQuery({
      queryKey: ["noise-gens", "generations", debouncedGenerations],
      queryFn: ({ signal }) => fetchTopGenerations(debouncedGenerations, signal),
      staleTime: 60_000,
      enabled: showGenerations && isActive,
    });

  const { data: moodPresets } = useQuery({
    queryKey: ["noise-gens", "moods"],
    queryFn: ({ signal }) => fetchMoodPresets(signal),
    staleTime: Infinity,
    enabled: isActive,
  });

  useEffect(() => {
    if (moodPresets && onMoodPresetsLoaded) {
      onMoodPresetsLoaded(moodPresets);
    }
  }, [moodPresets, onMoodPresetsLoaded]);

  useEffect(() => {
    if (!isActive) return;
    const signature = [...(originalsData ?? []), ...(pendingOriginalsData ?? [])]
      .map((item) => `${item.id}:${item.uploadedAt ?? 0}:${item.listens ?? 0}`)
      .join("|");
    if (!signature) return;
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      lastSignatureRef.current = signature;
      return;
    }
    if (signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;
    setRecentUpdate(true);
    if (updateTimeoutRef.current) {
      window.clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = window.setTimeout(() => {
      setRecentUpdate(false);
    }, 4_000);
  }, [isActive, originalsData, pendingOriginalsData]);

  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        window.clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isActive) return;
    setRecentUpdate(false);
  }, [isActive]);

  useEffect(() => {
    if (!onGenerationsPresenceChange) return;
    if (!showGenerations) {
      onGenerationsPresenceChange(false);
      return;
    }
    onGenerationsPresenceChange((generationsData ?? []).length > 0);
  }, [generationsData, onGenerationsPresenceChange, showGenerations]);

  const originals = useMemo<RankedOriginal[]>(() => {
    const deduped = dedupeOriginalsByTitle(originalsData ?? []);
    return buildRankedList(
      deduped,
      debouncedOriginals,
      (item) => [item.title, item.artist],
      {
        getTempoBpm: (item) => item.tempo?.bpm,
        sessionTempoBpm: sessionTempo?.bpm,
      },
    );
  }, [originalsData, debouncedOriginals, sessionTempo?.bpm]);

  const pendingOriginals = useMemo(() => {
    const rankedIds = new Set(originals.map((original) => original.id));
    const deduped = dedupeOriginalsByTitle(pendingOriginalsData ?? []);
    return deduped
      .filter((original) => !rankedIds.has(original.id))
      .map((original) => ({ ...original, status: "pending" as const }));
  }, [originals, pendingOriginalsData]);

  useEffect(() => {
    if (!onOriginalsHydrated) return;
    onOriginalsHydrated(originals);
  }, [onOriginalsHydrated, originals]);

  const generations = useMemo<RankedGeneration[]>(() => {
    if (!showGenerations) return [];
    return buildRankedList(
      generationsData ?? [],
      debouncedGenerations,
      (item) => [item.title, item.mood],
    );
  }, [debouncedGenerations, generationsData, showGenerations]);

  const generationByOriginal = useMemo(() => {
    const lookup = new Map<string, RankedGeneration>();
    for (const generation of generations) {
      if (!lookup.has(generation.originalId)) {
        lookup.set(generation.originalId, generation);
      }
    }
    return lookup;
  }, [generations]);

  const scheduleUpdate = useCallback(() => {
    if (updateQueuedRef.current) return;
    updateQueuedRef.current = true;
    requestAnimationFrame(() => {
      updateQueuedRef.current = false;
      const container = containerRef.current;
      if (!container || !showConnectors) {
        setPaths([]);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const scrollTop = container.scrollTop;
      const scrollLeft = container.scrollLeft;
      const nextPaths: ConnectorPath[] = [];
      const visibleTop = scrollTop;
      const visibleBottom = scrollTop + container.clientHeight;
      setSvgHeight(container.scrollHeight);

      for (const [originalId, originalNode] of Object.entries(originalRefs.current)) {
        if (!generationByOriginal.has(originalId)) continue;
        const generationNode = generationRefs.current[originalId];
        if (!originalNode || !generationNode) continue;
        const originalRect = originalNode.getBoundingClientRect();
        const generationRect = generationNode.getBoundingClientRect();
        const originalTop = originalRect.top - containerRect.top + scrollTop;
        const originalBottom = originalTop + originalRect.height;
        const generationTop = generationRect.top - containerRect.top + scrollTop;
        const generationBottom = generationTop + generationRect.height;
        const isVisible =
          (originalTop >= visibleTop && originalTop <= visibleBottom) ||
          (originalBottom >= visibleTop && originalBottom <= visibleBottom) ||
          (generationTop >= visibleTop && generationTop <= visibleBottom) ||
          (generationBottom >= visibleTop && generationBottom <= visibleBottom);
        if (!isVisible) continue;

        const startX =
          originalRect.right - containerRect.left + scrollLeft + 16; // 16px gutter
        const startY = originalTop + originalRect.height / 2;
        const endX = generationRect.left - containerRect.left + scrollLeft - 16;
        const endY = generationTop + generationRect.height / 2;
        const controlOffset = Math.max(60, Math.abs(endX - startX) / 2);
        const path = [
          `M ${startX} ${startY}`,
          `C ${startX + controlOffset} ${startY} ${endX - controlOffset} ${endY} ${endX} ${endY}`,
        ].join(" ");
        nextPaths.push({ id: originalId, path });
      }
      setPaths(nextPaths);
    });
  }, [generationByOriginal, showConnectors]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const handleScroll = () => scheduleUpdate();
    container.addEventListener("scroll", handleScroll, { passive: true });
    const resizeObserver = new ResizeObserver(() => scheduleUpdate());
    resizeObserver.observe(container);
    scheduleUpdate();
    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, [scheduleUpdate]);

  useEffect(() => {
    scheduleUpdate();
  }, [scheduleUpdate, originals, generations, showConnectors]);

  const originalsHeading = showGenerations ? "Top Songs" : "Songs";
  const originalsSubtitle = showGenerations
    ? "Drag a song into the Cover Creator to start a mood blend."
    : "Select a song to load it into the player on the right.";
  const containerLabel = showGenerations
    ? "Top songs and top generations"
    : "Available songs";

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-y-auto rounded-3xl border border-border bg-secondary/10 p-4 sm:p-5 lg:p-6"
      role="group"
      aria-label={containerLabel}
    >
      <div
        className={cn(
          "grid gap-4 lg:items-start",
          showGenerations
            ? "lg:grid-cols-[minmax(0,1fr),140px,minmax(0,1fr)]"
            : "lg:grid-cols-[minmax(0,1fr)]",
        )}
      >
        <section aria-labelledby="noise-originals-heading" className="space-y-3">
          <header className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Search className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <h2 id="noise-originals-heading" className="text-lg font-semibold">
                {originalsHeading}
              </h2>
              <p className="text-xs text-muted-foreground">
                {originalsSubtitle}
              </p>
            </div>
            {recentUpdate ? (
              <span className="ml-auto text-[11px] uppercase tracking-wide text-emerald-300">
                Updated just now
              </span>
            ) : null}
          </header>
          <div className="space-y-3">
            <Input
              placeholder="Search songs"
              value={searchOriginals}
              role="searchbox"
              onChange={(event) => setSearchOriginals(event.target.value)}
            />
            <div className="space-y-2" role="listbox" aria-label="Pending songs list">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
                <span>Pending Songs</span>
                <span>{pendingOriginals.length} queued</span>
              </div>
              {pendingOriginalsLoading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={`pending-${index}`} className="h-12 rounded-2xl" />
                ))
              ) : pendingOriginalsError ? (
                <div className="rounded-2xl bg-amber-500/10 p-3 text-xs text-amber-200">
                  We couldn&rsquo;t load pending songs. Try again soon.
                </div>
              ) : pendingOriginals.length ? (
                pendingOriginals.map((original) => (
                  <PendingOriginalRow
                    key={original.id}
                    original={original}
                    selected={selectedOriginalId === original.id}
                    onSelect={onOriginalSelected}
                    sessionTempo={sessionTempo}
                    layout={layout}
                  />
                ))
              ) : (
                <div className="rounded-2xl bg-muted/30 p-3 text-xs text-muted-foreground">
                  No pending songs right now.
                </div>
              )}
            </div>
            <div className="space-y-2" role="listbox" aria-label="Top songs list">
              {originalsLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 rounded-2xl" />
                ))
              ) : originalsError ? (
                <div className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
                  We couldn&rsquo;t load songs. Try again in a moment.
                </div>
              ) : originals.length ? (
                originals.map((original) => (
                  <OriginalRow
                  key={original.id}
                  original={original}
                  selected={selectedOriginalId === original.id}
                  onSelect={onOriginalSelected}
                  setRef={setOriginalRef(original.id)}
                  sessionTempo={sessionTempo}
                  layout={layout}
                />
                ))
              ) : (
                <div className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">
                  No songs match that search yet.
                </div>
              )}
            </div>
          </div>
        </section>

        {showGenerations ? (
          <>
            <div className="relative hidden justify-center lg:flex">
              {showConnectors && paths.length > 0 ? (
                <svg
                  className="pointer-events-none"
                  width="140"
                  height={svgHeight || 400}
                  viewBox={`0 0 140 ${svgHeight || 400}`}
                >
                  <defs>
                    <linearGradient id="noise-connector" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(148, 163, 184, 0.2)" />
                      <stop offset="100%" stopColor="rgba(59, 130, 246, 0.5)" />
                    </linearGradient>
                  </defs>
                  {paths.map((connector) => (
                    <path
                      key={connector.id}
                      d={connector.path}
                      fill="none"
                      stroke="url(#noise-connector)"
                      strokeWidth={1.5}
                    />
                  ))}
                </svg>
              ) : null}
            </div>

            <section aria-labelledby="noise-generations-heading" className="space-y-3">
              <header className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <Search className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <h2 id="noise-generations-heading" className="text-lg font-semibold">
                    Top Generations
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Each generation inherits its original&rsquo;s energy with a Helix mood imprint.
                  </p>
                </div>
              </header>
              <div className="space-y-3">
                <Input
                  placeholder="Search generations"
                  value={searchGenerations}
                  role="searchbox"
                  onChange={(event) => setSearchGenerations(event.target.value)}
                />
                <div className="space-y-2" role="listbox" aria-label="Top generations list">
                  {generationsLoading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <Skeleton key={index} className="h-14 rounded-2xl" />
                    ))
                  ) : generationsError ? (
                    <div className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
                      We couldn&rsquo;t load generations. Try again soon.
                    </div>
                  ) : generations.length ? (
                    generations.map((generation) => {
                      const isPrimary =
                        generationByOriginal.get(generation.originalId)?.id === generation.id;
                      return (
                        <GenerationRow
                          key={generation.id}
                          generation={generation}
                          setRef={isPrimary ? setGenerationRef(generation.originalId) : undefined}
                        />
                      );
                    })
                  ) : (
                    <div className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">
                      No generations match that search yet.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default DualTopLists;
