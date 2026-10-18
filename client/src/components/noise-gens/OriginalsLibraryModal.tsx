import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useKnowledgeProjectsStore,
  type ProjectWithStats,
} from "@/store/useKnowledgeProjectsStore";
import type { KnowledgeFileRecord } from "@/lib/agi/knowledge-store";
import { isAudioKnowledgeFile } from "@/lib/knowledge/audio";
import { collectTags } from "@/lib/knowledge/atom-curation";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
};

export type KnowledgeAudioSelection = {
  project: ProjectWithStats;
  file: KnowledgeFileRecord;
};

type OriginalsLibraryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: KnowledgeAudioSelection) => void;
  onImportProject?: (
    project: ProjectWithStats,
    files: KnowledgeFileRecord[],
  ) => void;
  initialProjectId?: string;
};

export function OriginalsLibraryModal({
  open,
  onOpenChange,
  onSelect,
  onImportProject,
  initialProjectId,
}: OriginalsLibraryModalProps) {
  const {
    projects,
    projectFiles,
    refresh,
    refreshFiles,
    warnings,
  } = useKnowledgeProjectsStore((state) => ({
    projects: state.projects,
    projectFiles: state.projectFiles,
    refresh: state.refresh,
    refreshFiles: state.refreshFiles,
    warnings: state.warnings,
  }));
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    if (!projects.length) {
      setSelectedProjectId(undefined);
      return;
    }
    if (
      initialProjectId &&
      initialProjectId !== selectedProjectId &&
      projects.some((project) => project.id === initialProjectId)
    ) {
      setSelectedProjectId(initialProjectId);
      return;
    }
    if (selectedProjectId && projects.some((project) => project.id === selectedProjectId)) {
      return;
    }
    setSelectedProjectId(projects[0]?.id);
  }, [initialProjectId, open, projects, selectedProjectId]);

  useEffect(() => {
    if (!open || !selectedProjectId) return;
    if (projectFiles[selectedProjectId]) return;
    void refreshFiles(selectedProjectId);
  }, [open, selectedProjectId, projectFiles, refreshFiles]);

  const selectedProject = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId)
    : undefined;
  const files = selectedProjectId ? projectFiles[selectedProjectId] ?? [] : [];

  const allAudioFiles = useMemo(() => {
    if (!files.length) return [];
    return files
      .filter(isAudioKnowledgeFile)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [files]);

  const audioFiles = useMemo(() => {
    if (!allAudioFiles.length) return [];
    const trimmedSearch = search.trim().toLowerCase();
    if (!trimmedSearch) return allAudioFiles;
    return allAudioFiles.filter((file) => {
      return (
        file.name.toLowerCase().includes(trimmedSearch) ||
        collectTags(file).some((tag) => tag.toLowerCase().includes(trimmedSearch))
      );
    });
  }, [allAudioFiles, search]);

  const handleRefreshProject = async () => {
    if (!selectedProjectId) return;
    setIsRefreshing(true);
    try {
      await refreshFiles(selectedProjectId);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelect = (file: KnowledgeFileRecord) => {
    if (!selectedProject) return;
    onSelect({ project: selectedProject, file });
    onOpenChange(false);
  };

  const canImportProject =
    Boolean(selectedProject) && allAudioFiles.length > 0 && Boolean(onImportProject);

  const handleImportProject = () => {
    if (!selectedProject || !onImportProject || allAudioFiles.length === 0) return;
    onImportProject(selectedProject, allAudioFiles);
    onOpenChange(false);
  };

  const emptyState = (() => {
    if (!projects.length) {
      return (
        <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-6 text-center text-sm text-muted-foreground">
          <p>No knowledge projects found yet.</p>
          <p className="mt-2">
            Open Helix Start settings → AGI Knowledge to drop reference audio into a project.
          </p>
        </div>
      );
    }
    if (!selectedProject) {
      return (
        <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-6 text-center text-sm text-muted-foreground">
          Select a project to view its audio files.
        </div>
      );
    }
    if (!allAudioFiles.length) {
      return (
        <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-6 text-center text-sm text-muted-foreground">
          <p>No audio found in {selectedProject.name}.</p>
          <p className="mt-2">Drop WAV, MP3, AIFF, or FLAC files into this project to see them here.</p>
        </div>
      );
    }
    if (!audioFiles.length) {
      return (
        <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-6 text-center text-sm text-muted-foreground">
          No matches for that search.
        </div>
      );
    }
    return null;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border border-white/10 bg-slate-950 text-slate-50">
        <DialogHeader>
          <DialogTitle>View Originals</DialogTitle>
          <DialogDescription>
            Pick an audio file from your My Knowledge projects to auto-fill the upload flow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-100">
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <label className="flex flex-1 min-w-[200px] flex-col text-xs font-medium text-muted-foreground">
              Project
              <select
                className="mt-1 rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                value={selectedProjectId ?? ""}
                onChange={(event) => setSelectedProjectId(event.target.value || undefined)}
                disabled={!projects.length}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} {project.fileCount ? `(${project.fileCount})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 min-w-[200px] flex-col text-xs font-medium text-muted-foreground">
              Search audio
              <Input
                className="mt-1 bg-slate-900"
                placeholder="Filter by name or tag"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                type="search"
              />
            </label>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={handleRefreshProject} disabled={!selectedProjectId || isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
            {onImportProject ? (
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleImportProject}
                  disabled={!canImportProject}
                >
                  Import project stems
                </Button>
              </div>
            ) : null}
          </div>

          {emptyState ? (
            emptyState
          ) : (
            <ScrollArea className="h-[320px] rounded-lg border border-white/10 bg-slate-900/40 px-1">
              <ul className="divide-y divide-white/5">
                {audioFiles.map((file) => (
                  <li key={file.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-1 rounded-md px-3 py-3 text-left transition hover:bg-white/5"
                      onClick={() => handleSelect(file)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-100">{file.name}</p>
                          <p className="text-xs text-slate-400">
                            {formatBytes(file.size)} •{" "}
                            {new Date(file.updatedAt).toLocaleString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-sky-300">Use</span>
                      </div>
                      {file.tags?.length ? (
                        <p className="text-xs text-slate-400">Tags: {file.tags.join(", ")}</p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}

          <p className="text-xs text-muted-foreground">
            Tip: Click any row to pre-load the Upload Originals dialog with this file.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default OriginalsLibraryModal;
