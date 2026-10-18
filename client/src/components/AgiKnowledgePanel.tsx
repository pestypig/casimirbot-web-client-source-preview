import * as React from "react";
import { isFlagEnabled } from "@/lib/envFlags";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useKnowledgeProjectsStore,
  type ProjectWithStats
} from "@/store/useKnowledgeProjectsStore";
import {
  DEFAULT_PROJECT_ID,
  extractKnowledgePdfText,
  type KnowledgeFileRecord,
} from "@/lib/agi/knowledge-store";
import { decodeLayout } from "@/lib/desktop/shareState";
import { buildWorkstationEntryUrl } from "@shared/workstation-link-meta";

const ACCEPTED_FILE_TYPES = [".txt", ".md", ".pdf", ".json", ".mp3", ".wav", ".m4a"].join(",");
const PREVIEW_LIMIT = 4096;
const PROJECT_NAME_PLACEHOLDERS = [
  "Stewardship Ledger",
  "Interbeing Systems",
  "Sangha Architecture",
  "Right Speech Infrastructure",
  "Restorative Harm Repair",
  "Impermanence by Design",
  "Koan Governance",
  "Three Tenets Loop",
  "Provenance Protocol",
  "Feedback Loop Hygiene",
  "Verification Checklist",
  "Civic Memory Continuity",
];

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
};

const isPdfRecord = (record: KnowledgeFileRecord) =>
  record.mime?.includes("pdf") || record.name.toLowerCase().endsWith(".pdf");

const downloadFile = (record: KnowledgeFileRecord) => {
  const url = URL.createObjectURL(record.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = record.name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

async function readPreview(record: KnowledgeFileRecord): Promise<string> {
  if (record.kind === "audio") {
    return `Audio track · ${record.name} · ${formatBytes(record.size)}`;
  }
  if (isPdfRecord(record)) {
    const pdfText = await extractKnowledgePdfText(record);
    if (pdfText) {
      return pdfText.slice(0, PREVIEW_LIMIT);
    }
    return `PDF document · ${record.name} · ${formatBytes(record.size)}`;
  }
  try {
    const chunk = await record.data.slice(0, PREVIEW_LIMIT, record.mime).text();
    const trimmed = chunk.trim();
    return trimmed || `${record.name} · ${formatBytes(record.size)}`;
  } catch {
    return `${record.name} · ${formatBytes(record.size)}`;
  }
}

type PreviewState = Record<string, string | null>;

export function AgiKnowledgePanel() {
  const knowledgeEnabled = isFlagEnabled("ENABLE_KNOWLEDGE_PROJECTS", true);
  const essenceEnabled = isFlagEnabled("ENABLE_ESSENCE");
  const {
    projects,
    projectFiles,
    selectedProjectId,
    selectProject,
    refresh,
    refreshFiles,
    saveFiles,
    deleteFile,
    deleteProject,
    moveFiles,
    updateFileTags,
    toggleActive,
    activeIds,
    createProject,
    deriveDesktopLayout,
  } = useKnowledgeProjectsStore((state) => ({
    projects: state.projects,
    projectFiles: state.projectFiles,
    selectedProjectId: state.selectedProjectId,
    selectProject: state.selectProject,
    refresh: state.refresh,
    refreshFiles: state.refreshFiles,
    saveFiles: state.saveFiles,
    deleteFile: state.deleteFile,
    deleteProject: state.deleteProject,
    moveFiles: state.moveFiles,
    updateFileTags: state.updateFileTags,
    toggleActive: state.toggleActive,
    activeIds: state.activeIds,
    createProject: state.createProject,
    deriveDesktopLayout: state.deriveDesktopLayout,
  }));
  const [status, setStatus] = React.useState<string | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [previewMap, setPreviewMap] = React.useState<PreviewState>({});
  const [syncing, setSyncing] = React.useState(false);
  const [tagEdit, setTagEdit] = React.useState<{ id: string; value: string } | null>(null);
  const [tagSaving, setTagSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ProjectWithStats | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const projectNamePlaceholder = React.useMemo(() => {
    if (!PROJECT_NAME_PLACEHOLDERS.length) return "New Project";
    const index = Math.floor(Math.random() * PROJECT_NAME_PLACEHOLDERS.length);
    return PROJECT_NAME_PLACEHOLDERS[index];
  }, []);
  const inputRef = React.useRef<HTMLInputElement>(null);
  

  React.useEffect(() => {
    if (knowledgeEnabled) {
      void refresh();
    }
  }, [knowledgeEnabled, refresh]);

  const selectedProject: ProjectWithStats | undefined = React.useMemo(() => {
    if (!projects.length) return undefined;
    if (selectedProjectId) {
      return projects.find((project) => project.id === selectedProjectId) ?? projects[0];
    }
    return projects[0];
  }, [projects, selectedProjectId]);
  const isDefaultProject = selectedProject?.id === DEFAULT_PROJECT_ID;

  React.useEffect(() => {
    if (!selectedProject?.id) return;
    if (projectFiles[selectedProject.id]) return;
    void refreshFiles(selectedProject.id);
  }, [projectFiles, refreshFiles, selectedProject?.id]);

  const files = selectedProject?.id ? projectFiles[selectedProject.id] ?? [] : [];

  const handleSyncToEssence = React.useCallback(async () => {
    if (!selectedProject) return;
    const projectFilesForSync = projectFiles[selectedProject.id] ?? [];
    if (projectFilesForSync.length === 0) {
      setStatus("No files to sync yet.");
      return;
    }
    setSyncing(true);
    setStatus(`Syncing ${projectFilesForSync.length} file(s) to Essence...`);
    try {
      for (const file of projectFilesForSync) {
        const modality = file.kind === "audio" ? "audio" : file.kind === "image" ? "image" : "text";
        const form = new FormData();
        form.append("file", file.data, file.name);
        form.append("creator_id", selectedProject.id);
        form.append("modality", modality);
        form.append("visibility", "private");
        form.append("source_uri", file.name);
        const response = await fetch("/api/essence/ingest", {
          method: "POST",
          body: form,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message = typeof payload?.error === "string" ? payload.error : `Failed to sync ${file.name}`;
          throw new Error(message);
        }
      }
      setStatus(`Synced ${projectFilesForSync.length} file(s) to Essence.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed.";
      setStatus(message);
    } finally {
      setSyncing(false);
    }
  }, [projectFiles, selectedProject]);

  const storeFiles = React.useCallback(
    async (incoming: FileList | File[] | null) => {
      if (!incoming || !selectedProject?.id) return;
      const filesArray = Array.from(incoming);
      if (!filesArray.length) return;
      setStatus("Processing files...");
      try {
        await saveFiles(selectedProject.id, filesArray);
        setStatus(`Stored ${filesArray.length} file${filesArray.length === 1 ? "" : "s"} in ${selectedProject.name}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to store files.";
        setStatus(message);
      } finally {
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    },
    [saveFiles, selectedProject?.id, selectedProject?.name]
  );

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      void storeFiles(event.dataTransfer?.files ?? null);
    },
    [storeFiles]
  );

  const handleProjectCreate = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const name = String(formData.get("name") ?? "").trim();
      const type = String(formData.get("type") ?? "").trim() || "general";
      if (!name) {
        setStatus("Project name required.");
        return;
      }
      try {
        const record = await createProject({
          name,
          type,
          color: "#0ea5e9",
          tags: type === "noise-album" ? ["audio", "album"] : undefined
        });
        setStatus(`Created project "${record.name}".`);
        setCreating(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create project.";
        setStatus(message);
      }
    },
    [createProject]
  );

  const handleLaunch = React.useCallback(
    (projectId: string) => {
      const hash = deriveDesktopLayout(projectId);
      const target = `/desktop${hash}`;
      const layout = decodeLayout(hash);
      if (window.location.pathname.includes("/desktop")) {
        window.history.replaceState(null, "", target);
        window.dispatchEvent(new CustomEvent("apply-desktop-layout", { detail: layout }));
      } else {
        window.open(target, "_blank", "noopener,noreferrer");
      }
    },
    [deriveDesktopLayout]
  );

  const handleCopyHash = React.useCallback(
    async (projectId: string) => {
      try {
        const hash = deriveDesktopLayout(projectId);
        const link = buildWorkstationEntryUrl({
          baseUrl: window.location.origin,
          hash,
          entry: "workstation",
        });
        await navigator.clipboard.writeText(link);
        setStatus("Share link copied to clipboard.");
      } catch {
        setStatus("Unable to copy hash link.");
      }
    },
    [deriveDesktopLayout]
  );

  const loadPreview = React.useCallback(
    async (file: KnowledgeFileRecord) => {
      if (previewMap[file.id]) return;
      const text = await readPreview(file);
      setPreviewMap((prev) => ({ ...prev, [file.id]: text }));
    },
    [previewMap]
  );

  const parseTagsInput = React.useCallback((value: string) => {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }, []);

  const handleDeleteProject = React.useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setStatus(null);
    try {
      await deleteProject(deleteTarget.id);
      setStatus(`Deleted ${deleteTarget.name}.`);
      setDeleteTarget(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete project.";
      setStatus(message);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteProject, deleteTarget]);

  const handleTagSave = React.useCallback(
    async (file: KnowledgeFileRecord) => {
      if (!selectedProject || !tagEdit || tagEdit.id !== file.id) return;
      setTagSaving(true);
      try {
        const tags = parseTagsInput(tagEdit.value);
        await updateFileTags(selectedProject.id, file.id, tags);
        setStatus(`Updated tags for ${file.name}.`);
        setTagEdit(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update tags.";
        setStatus(message);
      } finally {
        setTagSaving(false);
      }
    },
    [parseTagsInput, selectedProject, tagEdit, updateFileTags]
  );

  if (!knowledgeEnabled) {
    return (
      <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-sm text-slate-300">
        <p className="font-semibold text-white">Knowledge Projects are disabled.</p>
        <p className="mt-2">
          Set <code className="rounded bg-black/40 px-1 py-0.5">ENABLE_KNOWLEDGE_PROJECTS=0</code> in your
          <code className="rounded bg-black/40 px-1 py-0.5 ml-1">.env</code> to disable locally scoped attachments.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="flex-1 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Knowledge Projects</p>
            <button
              type="button"
              className="rounded-lg border border-dashed border-white/20 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-sky-500"
              onClick={() => setCreating((value) => !value)}
            >
              {creating ? "Close" : "New Project"}
            </button>
          </div>
          {creating && (
            <form className="mt-3 space-y-2 rounded-lg border border-white/10 bg-slate-900/40 p-3" onSubmit={handleProjectCreate}>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Name</label>
                <input
                  name="name"
                  required
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-1 text-sm text-white focus:border-sky-500 focus:outline-none"
                  placeholder={projectNamePlaceholder}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Type</label>
                <select
                  name="type"
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-1 text-sm text-white focus:border-sky-500 focus:outline-none"
                  defaultValue="general"
                >
                  <option value="general">General</option>
                  <option value="docs">Docs</option>
                  <option value="noise-album">Noise Album</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md px-3 py-1 text-xs text-slate-300 hover:text-white"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-sky-500 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-400"
                >
                  Create
                </button>
              </div>
            </form>
          )}
          <div className="mt-4 space-y-2">
            {projects.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-4 text-sm text-slate-400">
                No projects yet. Create one to start attaching knowledge.
              </div>
            )}
            {projects.map((project) => {
              const isSelected = project.id === selectedProject?.id;
              const isActive = activeIds.includes(project.id);
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => selectProject(project.id)}
                  className={[
                    "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition",
                    isSelected ? "border-sky-500/70 bg-slate-900/50" : "border-white/10 bg-black/10 hover:border-sky-500/30"
                  ].join(" ")}
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{project.name}</p>
                    <p className="text-xs text-slate-400">{project.fileCount} file{project.fileCount === 1 ? "" : "s"}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => toggleActive(project.id)}
                    />
                    Active
                  </label>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-white">Project Actions</p>
          {selectedProject ? (
            <div className="mt-3 space-y-3 text-sm text-slate-300">
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-md border border-white/20 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-sky-500"
                  onClick={() => handleLaunch(selectedProject.id)}
                >
                  Launch on Desktop
                </button>
                <button
                  className="rounded-md border border-white/20 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-sky-500"
                  onClick={() => void handleCopyHash(selectedProject.id)}
                >
                  Generate #hash
                </button>
                {essenceEnabled && (
                  <button
                    className="rounded-md border border-white/20 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-sky-500 disabled:opacity-50"
                    onClick={() => void handleSyncToEssence()}
                    disabled={syncing || files.length === 0}
                  >
                    {syncing ? "Syncing..." : "Sync to Essence"}
                  </button>
                )}
                {!isDefaultProject ? (
                  <button
                    className="rounded-md border border-rose-500/40 px-3 py-1 text-xs font-semibold text-rose-200 hover:border-rose-400 hover:text-rose-100 disabled:opacity-50"
                    onClick={() => setDeleteTarget(selectedProject)}
                    disabled={deleteBusy}
                  >
                    Delete Project
                  </button>
                ) : null}
              </div>
              {selectedProject.type === "noise-album" && (
                <p className="text-xs text-slate-400">
                  Noise albums stream locally. Drop WAV/MP3 stems below and open the NoiseGen panel to play.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">Select a project to manage files.</p>
          )}
        </div>
      </div>

      {selectedProject && (
        <div
          className={[
            "rounded-xl border border-dashed px-4 py-6 text-center text-sm transition",
            dragActive ? "border-sky-400 bg-slate-900/40" : "border-white/15 bg-white/5"
          ].join(" ")}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node)) return;
            setDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            hidden
            multiple
            accept={ACCEPTED_FILE_TYPES}
            onChange={(event) => {
              void storeFiles(event.target.files);
            }}
          />
          <p className="text-sm text-slate-200">
            Drop knowledge into <span className="font-semibold text-white">{selectedProject.name}</span>
          </p>
          <button
            type="button"
            className="mt-2 rounded-lg border border-white/20 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-white hover:border-sky-500"
            onClick={() => inputRef.current?.click()}
          >
            Select files
          </button>
          <p className="mt-2 text-xs text-slate-400">
            Accepted: <span className="font-mono text-white/80">{ACCEPTED_FILE_TYPES.replace(/,/g, " ")}</span>
          </p>
        </div>
      )}

      {status && (
        <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-slate-200">
          {status}
        </div>
      )}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="border border-white/10 bg-slate-950 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete "{deleteTarget?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? Files will move to "My Knowledge".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border border-white/10 bg-transparent text-slate-200 hover:bg-white/5">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 text-white hover:bg-rose-400"
              onClick={() => void handleDeleteProject()}
              disabled={deleteBusy}
            >
              {deleteBusy ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="rounded-xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs uppercase tracking-wide text-slate-300">
          <span>{selectedProject ? selectedProject.name : "Select a project"}</span>
          {selectedProject && <span>{files.length} file{files.length === 1 ? "" : "s"}</span>}
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-white/5">
          {(!selectedProject || files.length === 0) && (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              {selectedProject ? "No files yet. Drop local files above." : "Select a project to view files."}
            </div>
          )}
          {selectedProject &&
            files.map((file) => {
              const preview = previewMap[file.id];
              return (
                <div key={file.id} className="space-y-2 px-4 py-3 text-sm text-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{file.name}</p>
                      <p className="text-xs text-slate-400">
                        {file.kind ?? file.mime} · {formatBytes(file.size)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Updated {new Date(file.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        className="rounded-md border border-white/20 px-2 py-1 hover:border-sky-500"
                        onClick={() => downloadFile(file)}
                      >
                        Download
                      </button>
                      <button
                        className="rounded-md border border-white/20 px-2 py-1 hover:border-sky-500"
                        onClick={() => void deleteFile(selectedProject.id, file.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>Move to:</span>
                    <select
                      className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-white focus:border-sky-500 focus:outline-none"
                      value={selectedProject.id}
                      onChange={(event) => void moveFiles([file.id], selectedProject.id, event.target.value)}
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="rounded-md border border-white/15 px-2 py-1 text-xs text-slate-200 hover:border-sky-500"
                      onClick={() => loadPreview(file)}
                    >
                      Preview
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>Tags:</span>
                    {file.tags?.length ? (
                      <span className="text-slate-300">{file.tags.join(", ")}</span>
                    ) : (
                      <span className="text-slate-500">none</span>
                    )}
                    <button
                      className="rounded-md border border-white/15 px-2 py-1 text-xs text-slate-200 hover:border-sky-500"
                      onClick={() =>
                        setTagEdit({
                          id: file.id,
                          value: (file.tags ?? []).join(", "),
                        })
                      }
                    >
                      Edit tags
                    </button>
                  </div>
                  {tagEdit?.id === file.id ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <input
                        className="min-w-[200px] flex-1 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-white focus:border-sky-500 focus:outline-none"
                        placeholder="tag1, tag2"
                        value={tagEdit.value}
                        onChange={(event) =>
                          setTagEdit((current) =>
                            current ? { ...current, value: event.target.value } : current,
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleTagSave(file);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setTagEdit(null);
                          }
                        }}
                      />
                      <button
                        className="rounded-md bg-sky-500 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-60"
                        onClick={() => void handleTagSave(file)}
                        disabled={tagSaving}
                      >
                        Save
                      </button>
                      <button
                        className="rounded-md border border-white/15 px-2 py-1 text-xs text-slate-200 hover:border-sky-500"
                        onClick={() => setTagEdit(null)}
                        disabled={tagSaving}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                  {preview && (
                    <pre className="max-h-32 overflow-y-auto rounded-md border border-white/10 bg-black/30 p-2 text-[11px] text-slate-200">
                      {preview}
                    </pre>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

export default AgiKnowledgePanel;
