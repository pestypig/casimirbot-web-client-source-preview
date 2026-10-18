import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import StemDaw, { type DawTrack, type StemClip, type StemVariant } from "@/components/noise-gen/StemDaw";
import type { KnowledgeFileRecord, KnowledgeProjectRecord } from "@/lib/agi/knowledge-store";
import { writeCoverFlowPayload, type CoverFlowPayload } from "@/lib/noise/cover-flow";
import { cn } from "@/lib/utils";
import { useKnowledgeProjectsStore, type ProjectWithStats } from "@/store/useKnowledgeProjectsStore";
import { useToast } from "@/hooks/use-toast";
import type { TempoMeta } from "@/types/noise-gens";
import { useState, useCallback } from "react";

type Props = {
  projectSlug?: string;
  onReviewPublish?: (project: ProjectWithStats) => void;
};

type AlbumStemMeta = {
  id?: string;
  fileId?: string;
  label?: string;
  url?: string;
  generations?: Array<{ id?: string; fileId?: string; label?: string; url?: string; createdAt?: number }>;
};

type AlbumTrackMeta = {
  id?: string;
  name?: string;
  stems?:
    | Record<string, string | AlbumStemMeta>
    | Array<AlbumStemMeta>;
  tempo?: Partial<TempoMeta> & { bpm?: number; timeSig?: string };
  durationSeconds?: number;
};

type AlbumMeta = KnowledgeProjectRecord["meta"] & {
  tracks?: AlbumTrackMeta[];
  tempo?: AlbumTrackMeta["tempo"];
  publish?: {
    originalId?: string;
    title?: string;
    creator?: string;
    publishedAt?: number;
  };
  kbTexture?: string | null;
  textureId?: string | null;
  texture?: string | null;
};

const toUrlMap = (files: KnowledgeFileRecord[]): Record<string, string> => {
  const entries: Record<string, string> = {};
  for (const file of files) {
    entries[file.id] = URL.createObjectURL(file.data);
  }
  return entries;
};

const revokeUrls = (map: Record<string, string>) => {
  Object.values(map).forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  });
};

const normalizeTempoMeta = (tempo?: AlbumTrackMeta["tempo"]): TempoMeta | undefined => {
  if (!tempo || typeof tempo.bpm !== "number" || !tempo.timeSig) return undefined;
  const [num, den] = tempo.timeSig.split("/").map((value) => Number(value));
  if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) return undefined;
  return {
    bpm: tempo.bpm,
    timeSig: `${num}/${den}` as `${number}/${number}`,
    offsetMs: typeof tempo.offsetMs === "number" ? tempo.offsetMs : 0,
    barsInLoop: tempo.barsInLoop,
    quantized: tempo.quantized,
  };
};

const humanizeStemLabel = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  const cleaned = value.replace(/[-_]/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const resolveAlbumTextureId = (meta?: AlbumMeta): string | undefined => {
  if (!meta) return undefined;
  const candidates = [meta.kbTexture, meta.textureId, meta.texture];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const formatPublishedDate = (timestamp?: number): string | null => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const buildProjectTrackId = (albumId: string) => `${albumId}-song`;

const stemsFromProjectFiles = (
  files: KnowledgeFileRecord[],
  urlMap: Record<string, string>,
): StemClip[] =>
  files
    .filter((file) => file.mime.startsWith("audio/"))
    .map((file, index) => {
      const url = urlMap[file.id];
      if (!url) return null;
      const analysis = file.analysis;
      const waveformDurationMs =
        typeof analysis?.durationSec === "number"
          ? analysis.durationSec * 1000
          : undefined;
      return {
        id: `stem-${file.id}`,
        label: humanizeStemLabel(file.name, `Stem ${index + 1}`),
        url,
        knowledgeFileId: file.id,
        waveformPeaks: analysis?.waveformPeaks,
        waveformDurationMs,
      } satisfies StemClip;
    })
    .filter(Boolean) as StemClip[];

const stemsFromTrackMeta = (
  track: AlbumTrackMeta,
  files: KnowledgeFileRecord[],
  urlMap: Record<string, string>,
): StemClip[] => {
  const stems: StemClip[] = [];
  const mapGenerations = (
    stemId: string,
    label: string,
    generations?: AlbumStemMeta["generations"],
  ): StemVariant[] | undefined => {
    if (!Array.isArray(generations) || generations.length === 0) return undefined;
    const variants = generations
      .map((gen, index) => {
        const url = gen.url ?? (gen.fileId ? urlMap[gen.fileId] : undefined);
        if (!url) return null;
        return {
          id: gen.id ?? `${stemId}-gen-${index}`,
          label: humanizeStemLabel(gen.label ?? gen.id, `${label} v${index + 1}`),
          url,
          createdAt: gen.createdAt,
          knowledgeFileId: gen.fileId,
        } satisfies StemVariant;
      })
      .filter(Boolean) as StemVariant[];
    return variants.length ? variants : undefined;
  };
  const pushStem = (id: string, label: string, fileId?: string, directUrl?: string, variants?: StemVariant[]) => {
    const fileMatch = fileId ? files.find((file) => file.id === fileId) : undefined;
    const analysis = fileMatch?.analysis;
    const waveformDurationMs =
      typeof analysis?.durationSec === "number"
        ? analysis.durationSec * 1000
        : undefined;
    const url = directUrl ?? (fileId ? urlMap[fileId] : undefined);
    if (url || (variants && variants.length)) {
      stems.push({
        id,
        label,
        url,
        variants,
        knowledgeFileId: fileId,
        waveformPeaks: analysis?.waveformPeaks,
        waveformDurationMs,
      });
    }
  };

  const metaStems = track.stems;
  if (Array.isArray(metaStems)) {
    metaStems.forEach((entry, index) => {
      const stemId = entry.id ?? `${track.id ?? "track"}-stem-${index}`;
      const label = humanizeStemLabel(entry.label ?? entry.id, `Stem ${index + 1}`);
      const variants = mapGenerations(stemId, label, entry.generations);
      pushStem(stemId, label, entry.fileId ?? entry.id, entry.url, variants);
    });
  } else if (metaStems && typeof metaStems === "object") {
    Object.entries(metaStems).forEach(([key, value], index) => {
      const label = humanizeStemLabel(key, `Stem ${index + 1}`);
      const raw = typeof value === "object" && value ? (value as AlbumStemMeta) : undefined;
      const fileId = typeof value === "string" ? value : raw?.fileId ?? raw?.id;
      const url = raw?.url;
      const stemId = `${track.id ?? `track-${index}`}-${key}`;
      const variants = mapGenerations(stemId, label, raw?.generations);
      pushStem(stemId, label, fileId, url, variants);
    });
  }

  if (!stems.length) {
    const bestMatch = files.find((file) => {
      if (!file.mime.startsWith("audio/")) return false;
      if (!track.name) return true;
      return (file.name ?? "").toLowerCase().includes(track.name.toLowerCase());
    });
    if (bestMatch) {
      pushStem(track.id ? `${track.id}-mix` : `mix-${bestMatch.id}`, bestMatch.name || "Mixdown", bestMatch.id);
    }
  }

  return stems;
};

export function ProjectAlbumPanel({ projectSlug, onReviewPublish }: Props) {
  const {
    refreshProjects,
    refreshFiles,
    noiseAlbums,
    projectFiles,
    projects,
    createProject,
    moveFiles,
  } = useKnowledgeProjectsStore((state) => ({
    noiseAlbums: state.projects.filter((project) => project.type === "noise-album"),
    projectFiles: state.projectFiles,
    refreshProjects: state.refresh,
    refreshFiles: state.refreshFiles,
    projects: state.projects,
    createProject: state.createProject,
    moveFiles: state.moveFiles,
  }));
  const [selectedId, setSelectedId] = React.useState<string | undefined>(undefined);
  const [selectedTrackId, setSelectedTrackId] = React.useState<string | undefined>(undefined);
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const { toast } = useToast();
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionAlbumId, setSessionAlbumId] = useState<string | undefined>(undefined);
  const [sessionTrackIndex, setSessionTrackIndex] = useState(0);

  React.useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  React.useEffect(() => {
    if (noiseAlbums.length === 0) {
      setSelectedId(undefined);
      return;
    }
    if (projectSlug) {
      const match = noiseAlbums.find((album) => album.hashSlug === projectSlug);
      if (match) {
        setSelectedId(match.id);
        return;
      }
    }
    setSelectedId((current) => current ?? noiseAlbums[0]?.id);
  }, [noiseAlbums, projectSlug]);

  React.useEffect(() => {
    if (!selectedId) return;
    void refreshFiles(selectedId);
  }, [selectedId, refreshFiles]);

  React.useEffect(() => {
    if (!sessionAlbumId && selectedId) {
      setSessionAlbumId(selectedId);
    }
  }, [selectedId, sessionAlbumId]);

  const files = React.useMemo<KnowledgeFileRecord[]>(() => {
    if (!selectedId) {
      return [];
    }
    return projectFiles[selectedId] ?? [];
  }, [projectFiles, selectedId]);
  const [urlMap, setUrlMap] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    revokeUrls(urlMap);
    const next = toUrlMap(files);
    setUrlMap(next);
    return () => {
      revokeUrls(next);
    };
  }, [files]);

  const selectedProject = noiseAlbums.find((album) => album.id === selectedId);
  const publishInfo = React.useMemo(() => {
    if (!selectedProject) return null;
    const meta = (selectedProject.meta ?? {}) as AlbumMeta;
    return meta.publish ?? null;
  }, [selectedProject]);
  const publishedDate = formatPublishedDate(publishInfo?.publishedAt);
  const isPublished = Boolean(publishInfo?.originalId);
  const albumTextureId = React.useMemo(
    () => resolveAlbumTextureId((selectedProject?.meta ?? {}) as AlbumMeta),
    [selectedProject],
  );
  const hasTrackMeta = React.useMemo(() => {
    if (!selectedProject) return false;
    const meta = (selectedProject.meta ?? {}) as AlbumMeta;
    return Array.isArray(meta.tracks) && meta.tracks.length > 0;
  }, [selectedProject]);
  const tracks = React.useMemo<DawTrack[]>(() => {
    if (!selectedProject) return [];
    const meta = (selectedProject.meta ?? {}) as AlbumMeta;
    if (Array.isArray(meta.tracks) && meta.tracks.length > 0) {
      return meta.tracks.map((track, index) => {
        const stems = stemsFromTrackMeta(track, files, urlMap);
        return {
          id: track.id ?? `track-${index}`,
          name: track.name ?? `Track ${index + 1}`,
          stems,
          tempo: normalizeTempoMeta(track.tempo),
          durationSeconds: track.durationSeconds,
        };
      });
    }
    const stems = stemsFromProjectFiles(files, urlMap);
    if (stems.length === 0) return [];
    const albumTempo = normalizeTempoMeta(meta.tempo);
    return [
      {
        id: buildProjectTrackId(selectedProject.id),
        name: selectedProject.name || "Song",
        stems,
        tempo: albumTempo,
        durationSeconds: undefined,
      },
    ];
  }, [files, selectedProject, urlMap]);

  const resolveAlbumTrackList = React.useCallback(
    (albumId?: string): Array<{ id: string; name: string }> => {
      if (!albumId) return [];
      if (albumId === selectedId) {
        return tracks.map((track, index) => ({
          id: track.id ?? `track-${index}`,
          name: track.name ?? `Track ${index + 1}`,
        }));
      }
      const album = noiseAlbums.find((entry) => entry.id === albumId);
      if (!album) return [];
      const meta = (album.meta ?? {}) as AlbumMeta;
      if (Array.isArray(meta.tracks)) {
        return meta.tracks.map((track, index) => ({
          id: track.id ?? `${album.id}-track-${index}`,
          name: track.name ?? `Track ${index + 1}`,
        }));
      }
      if (album.fileCount && album.fileCount > 0) {
        return [
          {
            id: buildProjectTrackId(album.id),
            name: album.name ?? "Song",
          },
        ];
      }
      return [];
    },
    [noiseAlbums, selectedId, tracks],
  );

  const sessionTrackList = React.useMemo(
    () => resolveAlbumTrackList(sessionAlbumId ?? selectedId),
    [resolveAlbumTrackList, selectedId, sessionAlbumId],
  );

  React.useEffect(() => {
    setSelectedTrackId((current) => {
      if (current && tracks.some((track) => track.id === current)) return current;
      return tracks[0]?.id;
    });
  }, [tracks]);

  React.useEffect(() => {
    if (sessionTrackIndex >= sessionTrackList.length && sessionTrackList.length > 0) {
      setSessionTrackIndex(0);
    }
  }, [sessionTrackIndex, sessionTrackList.length]);

  React.useEffect(() => {
    if (!sessionActive || !selectedTrackId) return;
    const idx = sessionTrackList.findIndex((track) => track.id === selectedTrackId);
    if (idx >= 0) {
      setSessionTrackIndex(idx);
    }
  }, [sessionActive, selectedTrackId, sessionTrackList]);

  React.useEffect(() => {
    if (!sessionActive) return;
    if (sessionAlbumId && sessionAlbumId !== selectedId) {
      setSelectedId(sessionAlbumId);
    }
  }, [sessionActive, sessionAlbumId, selectedId]);

  const handleCreateNoiseAlbum = useCallback(async () => {
    setCreatingAlbum(true);
    setCreateMessage(null);
    try {
      await refreshProjects();
      const currentProjects = useKnowledgeProjectsStore.getState().projects;
      const baseName = "Noise Album";
      const suffix = new Date().toISOString().slice(0, 10);
      const album = await createProject({ name: `${baseName} ${suffix}`, type: "noise-album" });

      // Grab audio files from the first non-album project with files
      const source = currentProjects.find((project) => project.type !== "noise-album" && project.fileCount > 0);
      let moved = 0;
      if (source) {
        await refreshFiles(source.id);
        const files = useKnowledgeProjectsStore.getState().projectFiles[source.id] ?? [];
        const audioIds = files.filter((file) => file.mime?.startsWith("audio/")).map((file) => file.id);
        if (audioIds.length) {
          await moveFiles(audioIds, source.id, album.id);
          moved = audioIds.length;
        }
      }
      await refreshFiles(album.id);
      setSelectedId(album.id);
      setSelectedTrackId(undefined);
      setCreateMessage(
        moved > 0
          ? `Created album and moved ${moved} audio file(s).`
          : "Created album. Add stems from Knowledge or the Library to start playback.",
      );
    } catch (error) {
      setCreateMessage("Could not create a noise album automatically. Please try again.");
    } finally {
      setCreatingAlbum(false);
    }
  }, [createProject, moveFiles, refreshFiles, refreshProjects]);

  const handleStartSession = useCallback(() => {
    const targetAlbumId = sessionAlbumId ?? selectedId ?? noiseAlbums[0]?.id;
    if (!targetAlbumId) return;
    setSessionAlbumId(targetAlbumId);
    setSessionTrackIndex(0);
    setSessionActive(true);
    if (targetAlbumId !== selectedId) {
      setSelectedId(targetAlbumId);
      setSelectedTrackId(undefined);
    } else if (tracks[0]) {
      setSelectedTrackId(tracks[0].id);
    }
  }, [noiseAlbums, selectedId, sessionAlbumId, tracks]);

  const handleStopSession = useCallback(() => {
    setSessionActive(false);
  }, []);

  const handleSessionStep = useCallback(
    (direction: 1 | -1) => {
      if (!sessionTrackList.length) return;
      setSessionTrackIndex((current) => {
        const nextIndex = (current + direction + sessionTrackList.length) % sessionTrackList.length;
        const target = sessionTrackList[nextIndex];
        if (sessionActive && sessionAlbumId === selectedId && target) {
          setSelectedTrackId(target.id);
        }
        return nextIndex;
      });
    },
    [selectedId, sessionActive, sessionAlbumId, sessionTrackList],
  );

  const handleChooseSessionAlbum = useCallback(
    (albumId: string) => {
      setSessionAlbumId(albumId);
      setSessionTrackIndex(0);
      setSelectedId(albumId);
      setSelectedTrackId(undefined);
    },
    [setSelectedId],
  );

  const selectedTrack = React.useMemo(
    () => tracks.find((track) => track.id === selectedTrackId),
    [tracks, selectedTrackId],
  );

  const selectedTrackKnowledgeFileIds = React.useMemo(() => {
    if (!selectedTrack) return [];
    const ids = new Set<string>();
    selectedTrack.stems.forEach((stem) => {
      if (stem.knowledgeFileId) ids.add(stem.knowledgeFileId);
      stem.variants?.forEach((variant) => {
        if (variant.knowledgeFileId) ids.add(variant.knowledgeFileId);
      });
    });
    return Array.from(ids);
  }, [selectedTrack]);

  const hasAudioFiles = React.useMemo(
    () => files.some((file) => file.mime?.startsWith("audio/")),
    [files],
  );
  const canReviewPublish = Boolean(onReviewPublish && selectedProject && hasAudioFiles);

  const coverPayload = React.useMemo<CoverFlowPayload | null>(() => {
    if (!selectedTrack || selectedTrackKnowledgeFileIds.length === 0) return null;
    return {
      knowledgeFileIds: selectedTrackKnowledgeFileIds,
      kbTexture: albumTextureId,
      trackId: selectedTrack.id,
      trackName: selectedTrack.name,
      albumId: selectedProject?.id,
      albumName: selectedProject?.name,
    };
  }, [albumTextureId, selectedProject, selectedTrack, selectedTrackKnowledgeFileIds]);

  const handleSendToCover = useCallback(() => {
    if (!coverPayload) {
      toast({
        title: "No stems available",
        description: "Select a track with knowledge-backed stems before sending to Cover.",
        variant: "destructive",
      });
      return;
    }
    const normalized = writeCoverFlowPayload(coverPayload);
    if (!normalized) {
      toast({
        title: "Nothing to send",
        description: "Could not find knowledge file IDs for this track.",
        variant: "destructive",
      });
      return;
    }
    const count = normalized.knowledgeFileIds.length;
    const textureNote = normalized.kbTexture ? ` using texture ${normalized.kbTexture}` : "";
    toast({
      title: "Sent to Cover flow",
      description: `Attached ${count} stem${count === 1 ? "" : "s"}${textureNote}.`,
    });
  }, [coverPayload, toast]);

  const sessionAlbum = React.useMemo(
    () => noiseAlbums.find((album) => album.id === (sessionAlbumId ?? selectedId)),
    [noiseAlbums, selectedId, sessionAlbumId],
  );
  const sessionNow = sessionTrackList[sessionTrackIndex];
  const sessionPreview = sessionTrackList.length
    ? Array.from({ length: Math.min(3, sessionTrackList.length) }, (_, offset) => {
        const index = (sessionTrackIndex + offset) % sessionTrackList.length;
        return sessionTrackList[index]?.name;
      })
        .filter(Boolean)
        .join(" → ")
    : "Add tracks to preview transitions.";
  const trackListLabel = hasTrackMeta ? "Tracklist -> DAW" : "Song -> DAW";
  const trackPanelTitle = hasTrackMeta
    ? `Tracks (${tracks.length})`
    : `Song (${selectedTrack?.stems.length ?? 0} stems)`;

  if (noiseAlbums.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
        <p className="font-semibold text-white">No noise albums yet.</p>
        <p className="mt-2">
          Create a project with <code className="rounded bg-black/40 px-1 py-0.5">type: noise-album</code> and drop stems
          in Settings -&gt; AGI Knowledge to unlock this panel.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleCreateNoiseAlbum}
            disabled={creatingAlbum}
            className="text-xs"
          >
            {creatingAlbum ? "Creating..." : "Create noise album from uploads"}
          </Button>
          {createMessage ? <span className="text-xs text-slate-200">{createMessage}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-slate-200">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Noise Album</p>
          <p className="text-xs text-slate-400">
            Pulls audio directly from local Knowledge Projects. Review & publish to send it to the public player.
          </p>
          {selectedProject ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
              <Badge
                variant="outline"
                className={
                  isPublished
                    ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-100"
                    : "border-white/20 bg-white/5 text-slate-200"
                }
              >
                {isPublished ? "Published" : "Local only"}
              </Badge>
              {publishInfo?.title ? (
                <span className="text-slate-400">Original: {publishInfo.title}</span>
              ) : null}
              {publishedDate ? <span className="text-slate-500">{publishedDate}</span> : null}
            </div>
          ) : null}
        </div>
        <select
          className="rounded-lg border border-white/15 bg-black/20 px-3 py-1 text-sm text-white focus:border-sky-500 focus:outline-none"
          value={selectedId ?? ""}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {noiseAlbums.map((album) => (
            <option key={album.id} value={album.id}>
              {album.name}
            </option>
          ))}
        </select>
      </div>

      {selectedProject && (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Listening session</p>
                <p className="text-sm text-slate-200">Star generations, then step track-to-track without losing the originals.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={sessionActive ? "secondary" : "outline"}
                  onClick={sessionActive ? handleStopSession : handleStartSession}
                  className="text-xs"
                >
                  {sessionActive ? "Stop session" : "Start session"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  disabled={!sessionActive || sessionTrackList.length === 0}
                  onClick={() => handleSessionStep(-1)}
                >
                  Prev track
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  disabled={!sessionActive || sessionTrackList.length === 0}
                  onClick={() => handleSessionStep(1)}
                >
                  Next track
                </Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
              <Badge variant="outline" className="border-cyan-400/50 bg-cyan-400/10 text-cyan-100">
                {sessionAlbum?.name ?? "Pick an album"}
              </Badge>
              {sessionNow ? (
                <Badge variant="outline" className="border-emerald-400/50 bg-emerald-400/10 text-emerald-100">
                  Now: {sessionNow.name}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-white/20 bg-white/5 text-slate-200">
                  Waiting for tracks
                </Badge>
              )}
              <span className="text-[11px] text-slate-400">Queue: {sessionPreview}</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {noiseAlbums.map((album) => {
                const meta = (album.meta ?? {}) as AlbumMeta;
                const trackNames = resolveAlbumTrackList(album.id);
                const trackCount = trackNames.length || (Array.isArray(meta.tracks) ? meta.tracks.length : 0);
                const isSessionAlbum = album.id === (sessionAlbumId ?? selectedId);
                const transitionPreview =
                  trackNames.slice(0, 3).map((track) => track.name).join(" → ") ||
                  "Add tracks to plan transitions.";
                return (
                  <button
                    key={album.id}
                    onClick={() => handleChooseSessionAlbum(album.id)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left transition",
                      isSessionAlbum
                        ? "border-cyan-400/60 bg-slate-900/70 shadow-[0_12px_40px_-30px_rgba(56,189,248,0.7)]"
                        : "border-white/10 bg-black/30 hover:border-cyan-400/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{album.name}</span>
                      <Badge
                        variant="outline"
                        className="border-white/20 bg-white/5 text-[11px] text-slate-100"
                      >
                        {trackCount} tracks
                      </Badge>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">Transitions: {transitionPreview}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-xs uppercase tracking-wide text-slate-400">{trackListLabel}</p>
          {tracks.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-4 text-sm text-slate-400">
              Drop WAV or MP3 stems into this project to start playback.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    {trackPanelTitle}
                  </p>
                  <Badge variant="outline" className="border-cyan-400/50 bg-cyan-400/10 text-[11px] text-cyan-100">
                    Click to open in DAW
                  </Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {tracks.map((track, index) => {
                    const isActive = track.id === selectedTrackId;
                    return (
                      <button
                        key={track.id}
                        onClick={() => setSelectedTrackId(track.id)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-2 text-left transition hover:border-cyan-400/50 hover:bg-slate-900/60",
                          isActive
                            ? "border-cyan-400/70 bg-slate-900/80 shadow-[0_12px_40px_-30px_rgba(56,189,248,0.7)]"
                            : "border-white/10 bg-black/40",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-white">{track.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {hasTrackMeta ? `Track ${index + 1}` : "Project stems"}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className="border-emerald-400/50 bg-emerald-400/10 text-[11px] text-emerald-100"
                            >
                              {track.stems.length} stems
                            </Badge>
                            <Badge
                              variant="outline"
                              className="border-white/20 bg-white/5 text-[11px] text-slate-100"
                            >
                              {track.tempo?.bpm ? `${track.tempo.bpm} BPM` : "Set BPM"}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          {track.tempo?.timeSig ?? "Tap a BPM to draw the grid"}{" "}
                          {track.durationSeconds ? `-> ${(track.durationSeconds / 60).toFixed(1)} min` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 text-[11px] text-slate-400">
                  Stems are read directly from your project files. Keep lengths matched for perfect alignment.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {onReviewPublish ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-xs"
                      onClick={() => selectedProject && onReviewPublish(selectedProject)}
                      disabled={!canReviewPublish}
                    >
                      {isPublished ? "Review & Update" : "Review & Publish"}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-xs"
                    onClick={handleSendToCover}
                    disabled={!coverPayload}
                  >
                    Send to Cover
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/20 text-xs text-slate-100 hover:bg-white/10"
                    onClick={() => setSelectedTrackId(tracks[0]?.id)}
                  >
                    Jump to first track
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-slate-200 hover:text-white"
                    onClick={() => {
                      if (selectedProject.hashSlug && typeof window !== "undefined") {
                        window.open(`/desktop#${selectedProject.hashSlug}`, "_blank");
                      }
                    }}
                  >
                    Open in Desktop layout
                  </Button>
                </div>
              </div>
              <StemDaw
                track={selectedTrack}
                onSendToCover={handleSendToCover}
                coverKnowledgeCount={selectedTrackKnowledgeFileIds.length}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProjectAlbumPanel;
