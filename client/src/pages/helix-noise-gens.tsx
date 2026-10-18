import { useState, useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { AlertTriangle, FolderOpen, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { DualTopLists } from "@/components/noise-gens/DualTopLists";
import {
  CoverCreator,
  COVER_DROPPABLE_ID,
  type RenderJobResult,
  type RenderJobUpdate,
} from "@/components/noise-gens/CoverCreator";
import { OriginalsPlayer } from "@/components/noise-gens/OriginalsPlayer";
import {
  UploadOriginalsModal,
  type UploadCompletePayload,
  type UploadOriginalPrefill,
} from "@/components/noise-gens/UploadOriginalsModal";
import {
  OriginalsLibraryModal,
  type KnowledgeAudioSelection,
} from "@/components/noise-gens/OriginalsLibraryModal";
import {
  RecentUploadsRail,
  type RecentUploadEntry,
} from "@/components/noise-gens/RecentUploadsRail";
import { MoodLegend } from "@/components/noise-gens/MoodLegend";
import NoiseFieldPanel from "@/components/noise-gens/NoiseFieldPanel";
import AtomLibraryPanel from "@/components/noise-gens/AtomLibraryPanel";
import { TrainingPlan } from "@/components/noise-gens/TrainingPlan";
import HelixMarkIcon from "@/components/icons/HelixMarkIcon";
import ProjectAlbumPanel from "@/components/noise-gen/ProjectAlbumPanel";
import { decodeLayout } from "@/lib/desktop/shareState";
import { cn } from "@/lib/utils";
import type {
  CoverEvidence,
  JobStatus,
  MoodPreset,
  Original,
  ListenerMacros,
  HelixPacket,
  TempoMeta,
} from "@/types/noise-gens";
import { useToast } from "@/hooks/use-toast";
import { useLocalSession } from "@/hooks/useLocalSession";
import { useNoisegenUiMode } from "@/hooks/useNoisegenUiMode";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import type { KnowledgeFileRecord } from "@/lib/agi/knowledge-store";
import { useKnowledgeProjectsStore, type ProjectWithStats } from "@/store/useKnowledgeProjectsStore";
import { fetchCoverJob, requestGeneration } from "@/lib/api/noiseGens";

const HELIX_PACKET_STORAGE_KEY = "helix:lastPacket";

const readHelixPacket = (): HelixPacket | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HELIX_PACKET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const valid =
      typeof parsed?.seed === "string" &&
      typeof parsed?.rc === "number" &&
      typeof parsed?.tau === "number" &&
      typeof parsed?.K === "number" &&
      Array.isArray(parsed?.peaks);
    if (valid) {
      return parsed as HelixPacket;
    }
  } catch {
    return null;
  }
  return null;
};

const RECENT_UPLOADS_STORAGE_KEY = "helix:recentUploads.v1";
const MAX_RECENT_UPLOADS = 5;
const MAX_RENDER_HISTORY = 5;
const FALLBACK_DURATION_SECONDS = 180;
const DEFAULT_BARS_IN_LOOP = 8;

const clamp01 = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const sanitizeTempoMeta = (value: unknown): TempoMeta | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const bpm = record.bpm;
  const timeSig = record.timeSig;
  const offsetMs = record.offsetMs;
  if (typeof bpm !== "number" || !Number.isFinite(bpm) || bpm <= 0) return undefined;
  if (typeof timeSig !== "string" || !timeSig.includes("/")) return undefined;
  if (typeof offsetMs !== "number" || !Number.isFinite(offsetMs)) return undefined;
  const [numStr, denStr] = timeSig.split("/");
  const numerator = Number(numStr);
  const denominator = Number(denStr);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
    return undefined;
  }
  const normalizedTimeSig = `${numerator}/${denominator}` as `${number}/${number}`;
  const tempo: TempoMeta = {
    bpm,
    timeSig: normalizedTimeSig,
    offsetMs,
  };
  if (typeof record.barsInLoop === "number" && Number.isFinite(record.barsInLoop)) {
    tempo.barsInLoop = record.barsInLoop;
  }
  if (typeof record.quantized === "boolean") {
    tempo.quantized = record.quantized;
  }
  return tempo;
};


const estimateDurationFromTempo = (tempo?: TempoMeta | null): number | null => {
  if (!tempo) return null;
  if (!Number.isFinite(tempo.bpm) || tempo.bpm <= 0) return null;
  const [numerator] = tempo.timeSig.split("/").map((value) => Number(value));
  const beatsPerBar = Number.isFinite(numerator) && numerator > 0 ? numerator : 4;
  const bars = tempo.barsInLoop ?? DEFAULT_BARS_IN_LOOP;
  const seconds = (bars * beatsPerBar * 60) / tempo.bpm;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

const buildMetaLabel = (hasLyrics: boolean, hasTempo: boolean): string => {
  const parts: string[] = [];
  if (hasLyrics) parts.push("Lyrics");
  if (hasTempo) parts.push("Tempo");
  return parts.length ? parts.join(" · ") : "None";
};

const buildPlaceholderOriginal = (entry: RecentUploadEntry): Original => {
  const duration =
    entry.durationSeconds ??
    estimateDurationFromTempo(entry.tempo) ??
    FALLBACK_DURATION_SECONDS;
  return {
    id: entry.trackId,
    title: entry.title,
    artist: entry.creator || "My Upload",
    listens: 0,
    duration,
    tempo: entry.tempo ?? undefined,
  };
};

const formatRelativeTime = (timestamp: number): string => {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const isShareablePreview = (url?: string | null): boolean => {
  if (!url) return false;
  return !url.startsWith("blob:");
};

type RenderHistoryEntry = {
  jobId: string;
  title: string;
  sourceLabel?: string;
  startedAt: number;
  completedAt?: number;
  status: JobStatus | null;
  previewUrl?: string | null;
  evidence?: CoverEvidence;
};

const sanitizeRecentUploads = (value: unknown): RecentUploadEntry[] => {
  if (!Array.isArray(value)) return [];
  const cleaned: RecentUploadEntry[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const trackId = typeof record.trackId === "string" ? record.trackId.trim() : "";
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const creator = typeof record.creator === "string" ? record.creator.trim() : "";
    const uploadedAtValue = record.uploadedAt;
    const uploadedAt =
      typeof uploadedAtValue === "number" && Number.isFinite(uploadedAtValue)
        ? uploadedAtValue
        : null;
    if (!trackId || !title || !creator || uploadedAt == null) continue;
    const knowledgeProjectId =
      typeof record.knowledgeProjectId === "string" ? record.knowledgeProjectId : undefined;
    const knowledgeProjectName =
      typeof record.knowledgeProjectName === "string" ? record.knowledgeProjectName : undefined;
    const tempo = sanitizeTempoMeta(record.tempo);
    const durationSeconds =
      typeof record.durationSeconds === "number" && Number.isFinite(record.durationSeconds)
        ? record.durationSeconds
        : tempo
          ? estimateDurationFromTempo(tempo)
          : null;
    const publishedLyrics =
      typeof record.publishedLyrics === "string" ? record.publishedLyrics : undefined;
    cleaned.push({
      trackId,
      title,
      creator,
      uploadedAt,
      knowledgeProjectId,
      knowledgeProjectName,
      tempo,
      durationSeconds: durationSeconds ?? undefined,
      publishedLyrics,
    });
    if (cleaned.length >= MAX_RECENT_UPLOADS) break;
  }
  return cleaned;
};

const readRecentUploads = (): RecentUploadEntry[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_UPLOADS_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeRecentUploads(JSON.parse(raw));
  } catch {
    return [];
  }
};

export default function HelixNoiseGensPage() {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { updateProject, projects: knowledgeProjects } = useKnowledgeProjectsStore((state) => ({
    updateProject: state.updateProject,
    projects: state.projects,
  }));
  const [selectedOriginal, setSelectedOriginal] = useState<Original | null>(null);
  const [availableOriginals, setAvailableOriginals] = useState<Original[]>([]);
  const [autoPlayToken, setAutoPlayToken] = useState(0);
  const [moodPresets, setMoodPresets] = useState<MoodPreset[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploadPrefill, setUploadPrefill] = useState<UploadOriginalPrefill | null>(null);
  const [recentUploads, setRecentUploads] = useState<RecentUploadEntry[]>(() => readRecentUploads());
  const recentUploadsRef = useRef<RecentUploadEntry[]>(recentUploads);
  const [activeRenderJob, setActiveRenderJob] = useState<RenderHistoryEntry | null>(null);
  const [renderHistory, setRenderHistory] = useState<RenderHistoryEntry[]>([]);
  const [listenerVarying, setListenerVarying] = useState(false);
  const [listenerVaryStatus, setListenerVaryStatus] = useState<{
    jobId: string;
    status: JobStatus;
    previewUrl?: string | null;
  } | null>(null);
  const listenerVaryRef = useRef<string | null>(null);
  const [includeHelixPacket, setIncludeHelixPacket] = useState(Boolean(readHelixPacket()));
  const [helixPacket, setHelixPacket] = useState<HelixPacket | null>(() => readHelixPacket());
  const [sessionTempo, setSessionTempo] = useState<TempoMeta | null>(null);
  const [externalProjectSlug, setExternalProjectSlug] = useState<string | undefined>(undefined);
  const [libraryInitialProjectId, setLibraryInitialProjectId] = useState<string | undefined>(undefined);
  const [originalAvailabilityVersion, bumpOriginalAvailabilityVersion] = useReducer(
    (value) => value + 1,
    0,
  );
  const { user, signOut } = useLocalSession();
  const [currentLocation, setLocation] = useLocation();
  const isDesktopContext = currentLocation?.startsWith("/desktop");
  const { uiMode, setUiMode, modeLabels, modes, showAdvanced, setShowAdvanced } =
    useNoisegenUiMode();
  const { isMobile } = useIsMobileViewport();
  const allowRemix = showAdvanced || renderHistory.length >= 3;
  const allowStudio = showAdvanced;
  const allowLabs = showAdvanced;
  const showListener = uiMode === "listener";
  const showRemix = uiMode === "remix" && allowRemix;
  const showStudio = uiMode === "studio" && allowStudio;
  const showLabs = uiMode === "labs" && allowLabs;
  const visibleModes = useMemo(() => {
    if (showAdvanced) return modes;
    return modes.filter((mode) => {
      if (mode === "listener") return true;
      if (mode === "remix") return allowRemix;
      return false;
    });
  }, [allowRemix, modes, showAdvanced]);
  const isListenerLayout = showListener;
  const [remixMounted, setRemixMounted] = useState(showRemix);
  const [studioMounted, setStudioMounted] = useState(showStudio);
  const [labsMounted, setLabsMounted] = useState(showLabs);
  const originalsByIdRef = useRef<Map<string, Original>>(new Map());
  const pendingOriginalsRef = useRef<Map<string, Original>>(new Map());

  useEffect(() => {
    if (uiMode === "remix" && !allowRemix) {
      setUiMode("listener");
    } else if (uiMode === "studio" && !allowStudio) {
      setUiMode("listener");
    } else if (uiMode === "labs" && !allowLabs) {
      setUiMode("listener");
    }
  }, [allowLabs, allowRemix, allowStudio, setUiMode, uiMode]);

  const selectOriginal = useCallback(
    (original: Original) => {
      setSelectedOriginal(original);
      setSessionTempo((prev) => original.tempo ?? prev);
      setAutoPlayToken((prev) => prev + 1);
      toast({
        title: "Track selected",
        description: isListenerLayout
          ? `${original.title} is ready to play.`
          : `${original.title} is ready for mood blending.`,
      });
    },
    [isListenerLayout, toast],
  );

  const handleKnowledgeSelection = useCallback(
    ({ project, file }: KnowledgeAudioSelection) => {
      const projectLabel = project.name?.trim() || "My Knowledge";
      const creator = user?.name?.trim() || projectLabel;
      const trimmedTitle = file.name.replace(/\.[^/.]+$/, "").trim();
      setUploadPrefill({
        title: trimmedTitle || projectLabel,
        creator,
        sourceHint: `Loaded from ${projectLabel} - ${file.name}`,
        knowledgeProjectId: project.id,
        knowledgeProjectName: projectLabel,
      });
      setUploadOpen(true);
    },
    [setUploadPrefill, setUploadOpen, user?.name],
  );

  const handleProjectImport = useCallback(
    (project: ProjectWithStats, files: KnowledgeFileRecord[]) => {
      if (!files.length) {
        toast({
          title: "No stems found",
          description: "This project does not have any audio files to import.",
          variant: "destructive",
        });
        return;
      }
      const projectLabel = project.name?.trim() || "My Knowledge";
      const creator = user?.name?.trim() || projectLabel;
      const stemCount = files.length;
      setUploadPrefill({
        title: projectLabel,
        creator,
        sourceHint: `Loaded ${stemCount} stem${stemCount === 1 ? "" : "s"} from ${projectLabel}.`,
        knowledgeProjectId: project.id,
        knowledgeProjectName: projectLabel,
      });
      setUploadOpen(true);
    },
    [toast, user?.name],
  );

  const handleReviewPublishProject = useCallback(
    (project: ProjectWithStats) => {
      const projectLabel = project.name?.trim() || "Noise Album";
      const creator = user?.name?.trim() || projectLabel;
      const meta = (project.meta ?? {}) as Record<string, unknown>;
      const existingOriginalId =
        typeof (meta as { publish?: { originalId?: unknown } }).publish?.originalId ===
        "string"
          ? String((meta as { publish?: { originalId?: unknown } }).publish?.originalId)
          : undefined;
      const lyrics =
        typeof (meta as { lyrics?: unknown }).lyrics === "string"
          ? String((meta as { lyrics?: unknown }).lyrics)
          : undefined;
      const tempoMeta = sanitizeTempoMeta((meta as { tempo?: unknown }).tempo);
      setUploadPrefill({
        title: projectLabel,
        creator,
        sourceHint: `Review stems from ${projectLabel} before publishing.`,
        knowledgeProjectId: project.id,
        knowledgeProjectName: projectLabel,
        notes: lyrics,
        existingOriginalId,
        bpm: tempoMeta?.bpm,
        offsetMs: tempoMeta?.offsetMs,
        quantized: tempoMeta?.quantized,
      });
      setUploadOpen(true);
    },
    [setUploadPrefill, setUploadOpen, user?.name],
  );

  const recordRecentUpload = useCallback((payload: UploadCompletePayload) => {
    setRecentUploads((previous) => {
      const trimmedTitle = payload.title.trim() || payload.title;
      const trimmedCreator = payload.creator.trim() || payload.creator;
      const trimmedLyrics = payload.publishedLyrics?.trim();
      const inferredDuration =
        payload.durationSeconds ??
        estimateDurationFromTempo(payload.tempo) ??
        FALLBACK_DURATION_SECONDS;
      const next: RecentUploadEntry[] = [
        {
          trackId: payload.trackId,
          title: trimmedTitle,
          creator: trimmedCreator,
          uploadedAt: Date.now(),
          knowledgeProjectId: payload.knowledgeProjectId,
          knowledgeProjectName: payload.knowledgeProjectName,
          tempo: payload.tempo,
          durationSeconds: inferredDuration,
          publishedLyrics: trimmedLyrics || undefined,
        },
        ...previous.filter((entry) => entry.trackId !== payload.trackId),
      ];
      return next.slice(0, MAX_RECENT_UPLOADS);
    });
  }, []);

  const decoratedRecentUploads = useMemo(
    () =>
      recentUploads.map((upload) => {
        const isRanked = originalsByIdRef.current.has(upload.trackId);
        const hasPending = pendingOriginalsRef.current.has(upload.trackId);
        const project = upload.knowledgeProjectId
          ? knowledgeProjects.find((entry) => entry.id === upload.knowledgeProjectId)
          : undefined;
        const projectTempo = project ? sanitizeTempoMeta((project.meta ?? {}).tempo) : undefined;
        const projectLyrics =
          project && typeof (project.meta as { lyrics?: unknown }).lyrics === "string"
            ? String((project.meta as { lyrics?: unknown }).lyrics).trim()
            : "";
        const savedLyrics = Boolean(projectLyrics);
        const savedTempo = Boolean(projectTempo);
        const publishedLyrics = Boolean(upload.publishedLyrics?.trim());
        const publishedTempo = Boolean(upload.tempo);
        const metaSummary =
          project
            ? {
                saved: buildMetaLabel(savedLyrics, savedTempo),
                published: buildMetaLabel(publishedLyrics, publishedTempo),
                changed: savedLyrics !== publishedLyrics || savedTempo !== publishedTempo,
              }
            : undefined;
        return {
          ...upload,
          isRanked,
          isReady: isRanked || hasPending,
          metaSummary,
        };
      }),
    [knowledgeProjects, recentUploads, originalAvailabilityVersion],
  );

  const handleOriginalsHydrated = useCallback(
    (originals: Original[]) => {
      setAvailableOriginals(originals);
      const nextMap = new Map<string, Original>();
      for (const original of originals) {
        nextMap.set(original.id, original);
      }
      const previousMap = originalsByIdRef.current;
      originalsByIdRef.current = nextMap;
      const tracked = recentUploadsRef.current;
      const availabilityChanged = tracked.some(
        (entry) => previousMap.has(entry.trackId) !== nextMap.has(entry.trackId),
      );
      let pendingChanged = false;
      for (const original of originals) {
        if (pendingOriginalsRef.current.has(original.id)) {
          pendingOriginalsRef.current.delete(original.id);
          pendingChanged = true;
        }
      }
      if (availabilityChanged || pendingChanged) {
        bumpOriginalAvailabilityVersion();
      }
    },
    [bumpOriginalAvailabilityVersion],
  );

  const handleRecentSelect = useCallback(
    (upload: RecentUploadEntry) => {
      const original =
        originalsByIdRef.current.get(upload.trackId) ??
        pendingOriginalsRef.current.get(upload.trackId);
      if (original) {
        selectOriginal(original);
        return;
      }
      toast({
        title: "Still syncing",
        description: "We will enable selection once this original lands in the ranked list.",
      });
    },
    [selectOriginal, toast],
  );

  const handleRecentReveal = useCallback(
    (upload: RecentUploadEntry) => {
      if (!upload.knowledgeProjectId) {
        toast({
          title: "No linked project",
          description: "This upload was not tied to a My Knowledge project.",
        });
        return;
      }
      setLibraryInitialProjectId(upload.knowledgeProjectId);
      setLibraryOpen(true);
    },
    [setLibraryInitialProjectId, setLibraryOpen, toast],
  );

  const handleRecentRetry = useCallback(
    (upload: RecentUploadEntry) => {
      if (!upload.knowledgeProjectId) {
        toast({
          title: "Missing project link",
          description:
            "This upload is not tied to a My Knowledge project, so it cannot be retried.",
        });
        return;
      }
      setUploadPrefill({
        title: upload.title,
        creator: upload.creator,
        sourceHint: `Retry publishing ${upload.title}.`,
        knowledgeProjectId: upload.knowledgeProjectId,
        knowledgeProjectName: upload.knowledgeProjectName,
        existingOriginalId: upload.trackId,
        bpm: upload.tempo?.bpm,
        offsetMs: upload.tempo?.offsetMs,
        quantized: upload.tempo?.quantized,
      });
      setUploadOpen(true);
    },
    [setUploadOpen, setUploadPrefill, toast],
  );

  const handleRecentEdit = useCallback(
    (upload: RecentUploadEntry) => {
      if (!upload.knowledgeProjectId) {
        toast({
          title: "Missing project link",
          description:
            "This upload is not tied to a My Knowledge project, so it cannot be edited here.",
        });
        return;
      }
      setUploadPrefill({
        title: upload.title,
        creator: upload.creator,
        sourceHint: `Edit details for ${upload.title}.`,
        knowledgeProjectId: upload.knowledgeProjectId,
        knowledgeProjectName: upload.knowledgeProjectName,
        existingOriginalId: upload.trackId,
        bpm: upload.tempo?.bpm,
        offsetMs: upload.tempo?.offsetMs,
        quantized: upload.tempo?.quantized,
        editOnly: true,
      });
      setUploadOpen(true);
    },
    [setUploadOpen, setUploadPrefill, toast],
  );

  const handleRenderJobUpdate = useCallback(
    (update: RenderJobUpdate | null) => {
      if (!update || !update.jobId || !update.status) {
        setActiveRenderJob(null);
        return;
      }
      if (update.status === "ready") {
        setActiveRenderJob(null);
        return;
      }
      setActiveRenderJob({
        jobId: update.jobId,
        title: update.original?.title ?? "Helix render",
        sourceLabel: update.sourceLabel,
        startedAt: update.startedAt ?? Date.now(),
        status: update.status,
        previewUrl: update.previewUrl ?? null,
        evidence: update.evidence,
      });
    },
    [],
  );

  const handleRenderJobComplete = useCallback(
    (result: RenderJobResult) => {
      setActiveRenderJob(null);
      setRenderHistory((previous) => {
        const entry: RenderHistoryEntry = {
          jobId: result.jobId,
          title: result.original?.title ?? "Helix render",
          sourceLabel: result.sourceLabel,
          startedAt: result.startedAt ?? Date.now(),
          completedAt: result.completedAt,
          status: result.status ?? "ready",
          previewUrl: result.previewUrl ?? null,
          evidence: result.evidence,
        };
        const filtered = previous.filter((item) => item.jobId !== result.jobId);
        return [entry, ...filtered].slice(0, MAX_RENDER_HISTORY);
      });
    },
    [],
  );

  const pollListenerVariation = useCallback(
    async (jobId: string) => {
      listenerVaryRef.current = jobId;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (listenerVaryRef.current !== jobId) return;
        try {
          const job = await fetchCoverJob(jobId);
          if (listenerVaryRef.current !== jobId) return;
          setListenerVaryStatus({
            jobId,
            status: job.status,
            previewUrl: job.previewUrl ?? null,
          });
          if (job.status === "ready" || job.status === "error") {
            setListenerVarying(false);
            return;
          }
        } catch (error) {
          if (attempt === 0) {
            toast({
              title: "Variation check failed",
              description:
                error instanceof Error
                  ? error.message
                  : "Unable to check variation status.",
            });
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      setListenerVarying(false);
    },
    [toast],
  );

  const handleListenerVary = useCallback(
    async (preset?: MoodPreset, macros?: ListenerMacros, seed?: number) => {
      if (!selectedOriginal) {
        toast({
          title: "Select a track",
          description: "Pick a song before requesting a variation.",
        });
        return;
      }
      if (listenerVarying) return;
      const fallbackMood = moodPresets[0];
      const mood = preset ?? fallbackMood;
      if (!mood) {
        toast({
          title: "Moods not ready",
          description: "Mood presets are still loading.",
        });
        return;
      }
      setListenerVarying(true);
      try {
        const seedValue = Number.isFinite(seed) ? seed : undefined;
        const payload = {
          originalId: selectedOriginal.id,
          moodId: mood.id,
          seed: seedValue,
          helixPacket: includeHelixPacket ? helixPacket ?? undefined : undefined,
          macros: macros ?? undefined,
        };
        const { jobId } = await requestGeneration(payload);
        setListenerVaryStatus({ jobId, status: "queued" });
        void pollListenerVariation(jobId);
      } catch (error) {
        setListenerVarying(false);
        toast({
          title: "Variation failed",
          description:
            error instanceof Error ? error.message : "Unable to vary track.",
          variant: "destructive",
        });
      }
    },
    [
      helixPacket,
      includeHelixPacket,
      listenerVarying,
      moodPresets,
      pollListenerVariation,
      selectedOriginal,
      toast,
    ],
  );

  const markNoiseAlbumPublished = useCallback(
    async (payload: UploadCompletePayload, title: string, creator: string) => {
      if (!payload.knowledgeProjectId) return;
      const project = knowledgeProjects.find((entry) => entry.id === payload.knowledgeProjectId);
      if (!project || project.type !== "noise-album") return;
      const meta = (project.meta ?? {}) as Record<string, unknown>;
      const currentPublish = ((meta as { publish?: Record<string, unknown> }).publish ?? {}) as Record<
        string,
        unknown
      >;
      const nextPublish = {
        ...currentPublish,
        originalId: payload.trackId,
        title,
        creator,
        publishedAt: Date.now(),
      };
      const { fileCount: _fileCount, ...projectRecord } = project;
      try {
        await updateProject({
          ...projectRecord,
          meta: {
            ...meta,
            publish: nextPublish,
          },
        });
      } catch {
        toast({
          title: "Publish status not saved",
          description: "Upload completed, but we could not mark the noise album as published.",
        });
      }
    },
    [knowledgeProjects, toast, updateProject],
  );

  const handleUploadComplete = useCallback(
    (payload: UploadCompletePayload) => {
      const trimmedTitle = payload.title.trim() || payload.title;
      const trimmedCreator = payload.creator.trim() || payload.creator;
      const placeholderEntry: RecentUploadEntry = {
        trackId: payload.trackId,
        title: trimmedTitle,
        creator: trimmedCreator,
        uploadedAt: Date.now(),
        knowledgeProjectId: payload.knowledgeProjectId,
        knowledgeProjectName: payload.knowledgeProjectName,
        tempo: payload.tempo,
        durationSeconds:
          payload.durationSeconds ??
          estimateDurationFromTempo(payload.tempo) ??
          FALLBACK_DURATION_SECONDS,
      };
      pendingOriginalsRef.current.set(
        payload.trackId,
        buildPlaceholderOriginal(placeholderEntry),
      );
      bumpOriginalAvailabilityVersion();
      recordRecentUpload(payload);
      void markNoiseAlbumPublished(payload, trimmedTitle, trimmedCreator);
      void queryClient.invalidateQueries({ queryKey: ["noise-gens", "originals"] });
      void queryClient.invalidateQueries({
        queryKey: ["noise-gens", "originals", "pending"],
      });
      toast({
        title: "Upload received",
        description: "We will surface the new original once it is ranked.",
      });
    },
    [markNoiseAlbumPublished, queryClient, recordRecentUpload, toast],
  );

  const handleOpenLibraryRequest = useCallback(() => {
    setLibraryInitialProjectId(undefined);
    setLibraryOpen(true);
  }, [setLibraryInitialProjectId, setLibraryOpen]);

  const handleLibraryOpenChange = useCallback(
    (open: boolean) => {
      setLibraryOpen(open);
      if (!open) {
        setLibraryInitialProjectId(undefined);
      }
    },
    [setLibraryInitialProjectId, setLibraryOpen],
  );

  useEffect(() => {
    const refresh = () => setHelixPacket(readHelixPacket());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === HELIX_PACKET_STORAGE_KEY) {
        setHelixPacket(readHelixPacket());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    recentUploadsRef.current = recentUploads;
  }, [recentUploads]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RECENT_UPLOADS_STORAGE_KEY, JSON.stringify(recentUploads));
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.warn("[HelixNoiseGens] Failed to persist recent uploads", error);
      }
    }
  }, [recentUploads]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleRecentUploadsStorage = (event: StorageEvent) => {
      if (event.key === RECENT_UPLOADS_STORAGE_KEY) {
        setRecentUploads(readRecentUploads());
      }
    };
    window.addEventListener("storage", handleRecentUploadsStorage);
    return () => window.removeEventListener("storage", handleRecentUploadsStorage);
  }, []);

  useEffect(() => {
    const keepIds = new Set(recentUploads.map((entry) => entry.trackId));
    let changed = false;
    for (const existingId of Array.from(pendingOriginalsRef.current.keys())) {
      if (!keepIds.has(existingId)) {
        pendingOriginalsRef.current.delete(existingId);
        changed = true;
      }
    }
    for (const entry of recentUploads) {
      const placeholder = buildPlaceholderOriginal(entry);
      const existing = pendingOriginalsRef.current.get(entry.trackId);
      if (!existing) {
        pendingOriginalsRef.current.set(entry.trackId, placeholder);
        changed = true;
        continue;
      }
      if (
        existing.title !== placeholder.title ||
        existing.artist !== placeholder.artist ||
        existing.duration !== placeholder.duration
      ) {
        pendingOriginalsRef.current.set(entry.trackId, placeholder);
        changed = true;
      }
    }
    if (changed) {
      bumpOriginalAvailabilityVersion();
    }
  }, [recentUploads, bumpOriginalAvailabilityVersion]);

  useEffect(() => {
    if (!selectedOriginal) return;
    const actual = originalsByIdRef.current.get(selectedOriginal.id);
    if (actual && actual !== selectedOriginal) {
      setSelectedOriginal(actual);
      return;
    }
    if (!actual && !pendingOriginalsRef.current.has(selectedOriginal.id)) {
      setSelectedOriginal(null);
    }
  }, [originalAvailabilityVersion, selectedOriginal]);

  useEffect(() => {
    setListenerVaryStatus(null);
    setListenerVarying(false);
    listenerVaryRef.current = null;
  }, [selectedOriginal?.id]);

  useEffect(() => {
    if (includeHelixPacket) {
      setHelixPacket(readHelixPacket());
    }
  }, [includeHelixPacket]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateFromHash = () => {
      const layout = decodeLayout(window.location.hash ?? "");
      setExternalProjectSlug(layout.projectSlug ?? undefined);
    };
    updateFromHash();
    window.addEventListener("hashchange", updateFromHash);
    return () => window.removeEventListener("hashchange", updateFromHash);
  }, []);

  useEffect(() => {
    if (showRemix) setRemixMounted(true);
  }, [showRemix]);

  useEffect(() => {
    if (showStudio) setStudioMounted(true);
  }, [showStudio]);

  useEffect(() => {
    if (showLabs) setLabsMounted(true);
  }, [showLabs]);

  useEffect(() => {
    if (!showStudio) {
      setUploadOpen(false);
      setLibraryOpen(false);
    }
  }, [showStudio]);

  const handleHelixToggle = useCallback((value: boolean) => {
    setIncludeHelixPacket(value);
    if (value) {
      setHelixPacket(readHelixPacket());
    }
  }, []);

  const handleAdvancedToggle = useCallback(
    (value: boolean) => {
      setShowAdvanced(value);
      if (!value && uiMode !== "listener") {
        setUiMode("listener");
      }
    },
    [setShowAdvanced, setUiMode, uiMode],
  );


  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { over, active } = event;
      if (!over || over.id !== COVER_DROPPABLE_ID) return;
      const original = active.data.current?.original as Original | undefined;
      if (original) {
        selectOriginal(original);
      }
    },
    [selectOriginal],
  );

  const handleOriginalSelect = useCallback(
    (original: Original) => {
      selectOriginal(original);
    },
    [selectOriginal],
  );

  const handleRequestSignIn = useCallback(() => {
    try {
      window.localStorage.setItem("helix:pending-panel", "account-session");
    } catch {
      // ignore storage failures; the profile panel can still be opened from the workstation.
    }
    toast({
      title: "Profile sign-in is optional",
      description: "Open Account & Sessions when you want uploads and procedures remembered on your profile.",
    });
    if (!isDesktopContext) {
      setLocation("/desktop");
      return;
    }
    window.dispatchEvent(new CustomEvent("open-helix-panel", { detail: { id: "account-session" } }));
  }, [isDesktopContext, setLocation, toast]);

  const handleSignOut = useCallback(() => {
    signOut();
    toast({
      title: "Signed out",
      description: "Demo session cleared.",
    });
  }, [signOut, toast]);

  const handleModeSelect = useCallback(
    (mode: typeof uiMode) => {
      if (mode === "remix" && !allowRemix) {
        toast({
          title: "Remix locked",
          description:
            "Render three variations or enable Advanced to unlock Remix.",
        });
        return;
      }
      if (mode === "studio" || mode === "labs") {
        if (!showAdvanced) setShowAdvanced(true);
        setUiMode(mode);
        return;
      }
      setUiMode(mode);
    },
    [allowRemix, setShowAdvanced, setUiMode, showAdvanced, toast],
  );

  const handleCreateCover = useCallback(() => {
    if (!selectedOriginal) {
      toast({
        title: "Select a song first",
        description: "Pick a song in Listener before opening Remix.",
      });
      return;
    }
    if (!allowRemix) {
      setShowAdvanced(true);
      toast({
        title: "Remix unlocked",
        description: "Advanced tools are now enabled for Remix.",
      });
    }
    setUiMode("remix");
  }, [allowRemix, selectedOriginal, setShowAdvanced, setUiMode, toast]);

  const handlePickTrack = useCallback(() => {
    setUiMode("listener");
  }, [setUiMode]);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="relative flex min-h-screen flex-col bg-gradient-to-b from-slate-950 via-slate-900/60 to-slate-950 text-slate-100">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-lime-500/30 to-lime-300/10">
                <HelixMarkIcon className="h-7 w-7 text-lime-400" strokeWidth={32} aria-label="Helix mark" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-sky-300/80">
                  Helix Core
                </div>
                <h1 className="text-lg font-semibold leading-tight text-slate-50">
                  Noise Gens
                </h1>
                <p className="text-xs text-slate-400">
                  Songs + Helix generations, side by side.
                </p>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              <div className="flex w-full flex-wrap items-center justify-center gap-1 rounded-full border border-white/15 bg-white/5 p-1 text-[11px] uppercase tracking-[0.2em] text-slate-300 sm:w-auto sm:justify-start">
                {visibleModes.map((mode) => {
                  const isActive = uiMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleModeSelect(mode)}
                      className={cn(
                        "rounded-full px-2.5 py-1 transition",
                        isActive
                          ? "bg-sky-500/80 text-white"
                          : "text-slate-300 hover:bg-white/10",
                      )}
                    >
                      {modeLabels[mode]}
                    </button>
                  );
                })}
              </div>
              {!isMobile ? (
                <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1">
                  <Switch
                    id="noisegen-advanced-toggle"
                    checked={showAdvanced}
                    onCheckedChange={handleAdvancedToggle}
                  />
                  <label
                    htmlFor="noisegen-advanced-toggle"
                    className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-300"
                  >
                    Advanced
                  </label>
                </div>
              ) : null}
              {showStudio ? (
                <Button variant="secondary" className="gap-2" onClick={handleOpenLibraryRequest}>
                  <FolderOpen className="h-4 w-4" aria-hidden />
                  View Originals
                </Button>
              ) : null}
              {user ? (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Avatar className="h-9 w-9 border border-white/10">
                      <AvatarFallback className="bg-slate-800 text-slate-100">
                        {user.initials ?? (user.name ? user.name.slice(0, 2).toUpperCase() : "ME")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm font-medium text-slate-200 sm:inline">
                      {user.name}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/20 text-xs text-slate-100 hover:bg-white/10"
                    onClick={handleSignOut}
                  >
                    Sign out
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="gap-2 border-white/20 text-slate-100 hover:bg-white/10"
                  onClick={handleRequestSignIn}
                >
                  <User className="h-4 w-4" aria-hidden />
                  Sign in
                </Button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:py-8 lg:px-6 lg:py-10">
            <section
              className={cn("space-y-6", showListener ? "" : "hidden")}
              aria-hidden={!showListener}
            >
              <div className="grid gap-6 lg:grid-cols-[minmax(0,320px),minmax(0,1fr)]">
                <div className="space-y-6">
                  <DualTopLists
                    layout="listener"
                    selectedOriginalId={selectedOriginal?.id}
                    onOriginalSelected={handleOriginalSelect}
                    onMoodPresetsLoaded={setMoodPresets}
                    onOriginalsHydrated={handleOriginalsHydrated}
                    sessionTempo={sessionTempo}
                    isActive={showListener}
                  />
                </div>
                <div className="space-y-6">
                  <OriginalsPlayer
                    original={selectedOriginal}
                    playlist={availableOriginals}
                    onSelectOriginal={handleOriginalSelect}
                    autoPlayToken={autoPlayToken}
                    moodPresets={moodPresets}
                    onVary={handleListenerVary}
                    isVarying={listenerVarying}
                    varyStatus={listenerVaryStatus}
                    canEditLyrics={showStudio}
                    canEditContract={showStudio || showAdvanced}
                  />
                  <div className="flex items-center justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCreateCover}
                      disabled={!selectedOriginal}
                    >
                      Create Cover
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {remixMounted ? (
              <section
                className={cn("space-y-6", showRemix ? "" : "hidden")}
                aria-hidden={!showRemix}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      Helix Link
                    </p>
                    <p className="text-sm text-slate-200">
                      Bind cover renders to the latest Helix observables packet.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1">
                    <Switch
                      id="helix-packet-toggle"
                      checked={includeHelixPacket}
                      onCheckedChange={handleHelixToggle}
                    />
                    <label
                      htmlFor="helix-packet-toggle"
                      className="text-xs font-medium text-slate-200"
                    >
                      Link Helix
                    </label>
                    {includeHelixPacket ? (
                      <span
                        className={
                          helixPacket
                            ? "text-[11px] text-emerald-300"
                            : "text-[11px] text-amber-300"
                        }
                      >
                        {helixPacket ? "Ready" : "Load in Helix"}
                      </span>
                    ) : null}
                  </div>
                </div>
                {!selectedOriginal ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                    <p className="text-sm font-semibold text-slate-100">
                      Pick a song to remix
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Choose a song in Listener to load it into Remix.
                    </p>
                    <div className="mt-3">
                      <Button size="sm" variant="secondary" onClick={handlePickTrack}>
                        Go to Listener
                      </Button>
                    </div>
                  </div>
                ) : null}
                {activeRenderJob ? <RenderInProgressCard job={activeRenderJob} /> : null}
                <CoverCreator
                  includeHelixPacket={includeHelixPacket}
                  helixPacket={helixPacket}
                  selectedOriginal={selectedOriginal}
                  onClearSelection={() => setSelectedOriginal(null)}
                  moodPresets={moodPresets}
                  sessionTempo={sessionTempo}
                  uiMode={uiMode}
                  onRenderJobUpdate={handleRenderJobUpdate}
                  onRenderJobComplete={handleRenderJobComplete}
                />
                {renderHistory.length ? (
                  <RenderHistoryPanel entries={renderHistory} />
                ) : null}
                <MoodLegend presets={moodPresets} />
              </section>
            ) : null}

            {studioMounted ? (
              <section
                className={cn("space-y-6", showStudio ? "" : "hidden")}
                aria-hidden={!showStudio}
              >
                <ProjectAlbumPanel
                  projectSlug={externalProjectSlug}
                  onReviewPublish={handleReviewPublishProject}
                />
                {decoratedRecentUploads.length ? (
                  <RecentUploadsRail
                    uploads={decoratedRecentUploads}
                    onSelect={handleRecentSelect}
                    onEdit={handleRecentEdit}
                    onRetry={handleRecentRetry}
                    onReveal={handleRecentReveal}
                  />
                ) : null}
                <AtomLibraryPanel />
                <TrainingPlan />
              </section>
            ) : null}

            {labsMounted ? (
              <section
                className={cn("space-y-6", showLabs ? "" : "hidden")}
                aria-hidden={!showLabs}
              >
                <NoiseFieldPanel />
              </section>
            ) : null}
          </div>
        </main>

      </div>

      {showStudio ? (
        <>
          <OriginalsLibraryModal
            open={libraryOpen}
            onOpenChange={handleLibraryOpenChange}
            onSelect={handleKnowledgeSelection}
            onImportProject={handleProjectImport}
            initialProjectId={libraryInitialProjectId}
          />

          <UploadOriginalsModal
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            isAuthenticated={Boolean(user)}
            onRequestSignIn={handleRequestSignIn}
            onUploaded={handleUploadComplete}
            prefill={uploadPrefill}
          />
        </>
      ) : null}
    </DndContext>
  );
}
function RenderInProgressCard({ job }: { job: RenderHistoryEntry }) {
  const isError = job.status === "error";
  const toneClasses = isError
    ? "border-amber-500/50 bg-amber-500/10"
    : "border-sky-500/50 bg-sky-500/10";
  const label =
    job.status === "processing"
      ? "Rendering in progress"
      : job.status === "queued"
        ? "Queued for rendering"
        : job.status === "error"
          ? "Render failed"
          : "Render update";

  return (
    <div className={`rounded-2xl ${toneClasses} p-4`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        {isError ? (
          <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-sky-200" aria-hidden />
        )}
        {label}
      </div>
      <p className="mt-1 text-xs text-slate-300">
        {job.title} {job.sourceLabel ? `• ${job.sourceLabel}` : ""} • Started {formatRelativeTime(job.startedAt)}
      </p>
    </div>
  );
}

function RenderHistoryPanel({ entries }: { entries: RenderHistoryEntry[] }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200 shadow-[0_30px_80px_-60px_rgba(14,165,233,0.6)]">
      <header className="mb-3">
        <p className="text-sm font-semibold text-slate-100">Recent renders</p>
        <p className="text-xs text-slate-400">Latest Helix covers you queued from this session.</p>
      </header>
      <div className="space-y-2">
        {entries.map((entry) => {
          const previewReady = isShareablePreview(entry.previewUrl);
          const idiValue = entry.evidence?.idi;
          const idiPct =
            typeof idiValue === "number" && Number.isFinite(idiValue)
              ? Math.round(clamp01(idiValue) * 100)
              : null;
          const idiTone =
            idiPct == null
              ? "border-slate-500/40 text-slate-400"
              : idiPct >= 75
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                : idiPct >= 60
                  ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                  : "border-slate-500/40 bg-slate-500/10 text-slate-300";
          return (
            <div
              key={entry.jobId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-slate-950/60 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-100">{entry.title}</div>
                <div className="text-xs text-slate-400">
                  {entry.sourceLabel ?? "Helix render"} •{" "}
                  {formatRelativeTime(entry.completedAt ?? entry.startedAt)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {idiPct != null ? (
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${idiTone}`}>
                    IDI {idiPct}%
                  </span>
                ) : null}
                {previewReady ? (
                  <Button
                    asChild
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                  >
                    <a href={entry.previewUrl ?? "#"} target="_blank" rel="noreferrer">
                      Open preview
                    </a>
                  </Button>
                ) : (
                  <span className="text-[11px] text-slate-500">Awaiting preview</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
