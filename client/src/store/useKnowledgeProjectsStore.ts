import { createWithEqualityFn } from "zustand/traditional";
import { persist } from "zustand/middleware";
import {
  assignFilesToProject,
  createProject as createProjectRecord,
  deleteKnowledgeFile,
  deleteProject as deleteProjectRecord,
  exportProjectPayload,
  listFilesByProject,
  listProjects,
  saveKnowledgeFiles,
  updateKnowledgeFileAnalysis,
  updateKnowledgeFileTags,
  updateProject as updateProjectRecord,
  countFilesForProject,
  DEFAULT_PROJECT_ID,
  type KnowledgeFileRecord,
  type KnowledgeProjectRecord,
} from "@/lib/agi/knowledge-store";
import { isAudioKnowledgeFile } from "@/lib/knowledge/audio";
import { analyzeKnowledgeAudio } from "@/lib/knowledge/atom-curation";
import type { KnowledgeProjectExport } from "@shared/knowledge";
import { KNOWLEDGE_DEFAULT_CONTEXT_LIMIT } from "@shared/knowledge";
import { sha256Hex } from "@/utils/sha";
import { encodeLayout } from "@/lib/desktop/shareState";

export type ProjectWithStats = KnowledgeProjectRecord & { fileCount: number };

type ProjectFilesMap = Record<string, KnowledgeFileRecord[]>;

type LastExportMeta = {
  bytes: number;
  projects: string[];
  hash: string;
  truncated?: string[];
};

type KnowledgeProjectsState = {
  projects: ProjectWithStats[];
  projectFiles: ProjectFilesMap;
  selectedProjectId?: string;
  activeIds: string[];
  baselineEnabled: boolean;
  warnings: string[];
  lastExport?: LastExportMeta;
  refresh: () => Promise<void>;
  refreshFiles: (projectId: string) => Promise<void>;
  selectProject: (projectId: string) => void;
  selectProjects: (ids: string[]) => void;
  toggleActive: (projectId: string) => void;
  toggleBaseline: () => void;
  saveFiles: (projectId: string, files: FileList | File[]) => Promise<void>;
  deleteFile: (projectId: string, fileId: string) => Promise<void>;
  moveFiles: (fileIds: string[], fromId: string, toId: string) => Promise<void>;
  updateFileTags: (
    projectId: string,
    fileId: string,
    tags: string[] | undefined,
  ) => Promise<void>;
  updateFileAnalysis: (
    projectId: string,
    fileId: string,
    options: Parameters<typeof updateKnowledgeFileAnalysis>[1],
  ) => Promise<void>;
  createProject: (payload: Parameters<typeof createProjectRecord>[0]) => Promise<ProjectWithStats>;
  updateProject: (payload: KnowledgeProjectRecord) => Promise<ProjectWithStats>;
  deleteProject: (projectId: string) => Promise<void>;
  exportActiveContext: () => Promise<KnowledgeProjectExport[]>;
  deriveDesktopLayout: (projectId: string, panels?: string[]) => string;
};

const STORAGE_KEY = "knowledge-projects-v1";
const env = (import.meta as any)?.env ?? {};

const getContextLimit = () => {
  const raw = Number(env.MAX_KNOWLEDGE_CONTEXT_BYTES ?? env.VITE_MAX_KNOWLEDGE_CONTEXT_BYTES);
  if (!Number.isFinite(raw) || raw <= 0) {
    return KNOWLEDGE_DEFAULT_CONTEXT_LIMIT;
  }
  return Math.floor(raw);
};

const sortFiles = (files: KnowledgeFileRecord[]) =>
  [...files].sort((a, b) => b.updatedAt - a.updatedAt);

const ensureUniqueIds = (ids: string[]) => Array.from(new Set(ids.filter(Boolean)));

const normalizePanels = (panels?: string[]) => {
  if (!Array.isArray(panels) || panels.length === 0) {
    return ["essence", "noisegen"];
  }
  return ensureUniqueIds(panels);
};

export const useKnowledgeProjectsStore = createWithEqualityFn<KnowledgeProjectsState>()(
  persist(
    (set, get) => ({
      projects: [],
      projectFiles: {},
      selectedProjectId: undefined,
      activeIds: [],
      baselineEnabled: true,
      warnings: [],
      lastExport: undefined,

      refresh: async () => {
        const projects = await listProjects();
        const counts = await Promise.all(projects.map((project) => countFilesForProject(project.id)));
        const enriched: ProjectWithStats[] = projects.map((project, index) => ({
          ...project,
          fileCount: counts[index] ?? 0,
        }));
        set((state) => {
          const activeIds = state.activeIds.filter((id) => enriched.some((project) => project.id === id));
          const selectedProjectId =
            state.selectedProjectId && enriched.some((project) => project.id === state.selectedProjectId)
              ? state.selectedProjectId
              : enriched[0]?.id;
          return { projects: enriched, activeIds, selectedProjectId };
        });
      },

      refreshFiles: async (projectId: string) => {
        const files = await listFilesByProject(projectId);
        set((state) => ({
          projectFiles: { ...state.projectFiles, [projectId]: sortFiles(files) },
        }));
      },

      selectProject: (projectId: string) =>
        set((state) => ({
          selectedProjectId: projectId || state.selectedProjectId,
        })),

      selectProjects: (ids: string[]) => {
        const allowedIds = ensureUniqueIds(ids);
        set({ activeIds: allowedIds });
      },

      toggleActive: (projectId: string) =>
        set((state) => {
          const next = state.activeIds.includes(projectId)
            ? state.activeIds.filter((id) => id !== projectId)
            : [...state.activeIds, projectId];
          return { activeIds: ensureUniqueIds(next) };
        }),

      saveFiles: async (projectId: string, incoming: FileList | File[]) => {
        const files = Array.from(incoming ?? []).filter(Boolean);
        if (files.length === 0) return;
        const saved = await saveKnowledgeFiles(files, { projectId });
        set((state) => {
          const current = state.projectFiles[projectId] ?? [];
          const combined = sortFiles([...saved, ...current]);
          return {
            projectFiles: { ...state.projectFiles, [projectId]: combined },
            projects: state.projects.map((project) =>
              project.id === projectId ? { ...project, fileCount: project.fileCount + saved.length } : project,
            ),
          };
        });
        void (async () => {
          for (const file of saved) {
            if (!isAudioKnowledgeFile(file)) continue;
            if (file.analysis?.waveformPeaks?.length) continue;
            const result = await analyzeKnowledgeAudio(file);
            if (!result) continue;
            const nextAnalysis = { ...(file.analysis ?? {}), ...result.analysis };
            const nextAutoTags = Array.from(
              new Set([...(file.autoTags ?? []), ...result.autoTags]),
            );
            await get().updateFileAnalysis(projectId, file.id, {
              analysis: nextAnalysis,
              autoTags: nextAutoTags,
            });
          }
        })();
      },

      deleteFile: async (projectId: string, fileId: string) => {
        await deleteKnowledgeFile(fileId);
        set((state) => {
          const current = state.projectFiles[projectId] ?? [];
          const nextFiles = current.filter((file) => file.id !== fileId);
          return {
            projectFiles: { ...state.projectFiles, [projectId]: nextFiles },
            projects: state.projects.map((project) =>
              project.id === projectId ? { ...project, fileCount: Math.max(0, project.fileCount - 1) } : project,
            ),
          };
        });
      },

      moveFiles: async (fileIds: string[], fromId: string, toId: string) => {
        if (!fileIds.length || fromId === toId) return;
        await assignFilesToProject(toId, fileIds);
        await get().refreshFiles(fromId);
        await get().refreshFiles(toId);
        set((state) => ({
          projects: state.projects.map((project) => {
            if (project.id === fromId) {
              return { ...project, fileCount: Math.max(0, project.fileCount - fileIds.length) };
            }
            if (project.id === toId) {
              return { ...project, fileCount: project.fileCount + fileIds.length };
            }
            return project;
          }),
        }));
      },

      updateFileTags: async (
        projectId: string,
        fileId: string,
        tags: string[] | undefined,
      ) => {
        const updated = await updateKnowledgeFileTags(fileId, tags);
        set((state) => {
          const current = state.projectFiles[projectId] ?? [];
          if (current.length === 0) return state;
          const nextFiles = current.map((file) =>
            file.id === fileId ? { ...file, ...updated } : file,
          );
          return {
            projectFiles: {
              ...state.projectFiles,
              [projectId]: sortFiles(nextFiles),
            },
          };
        });
      },

      updateFileAnalysis: async (projectId, fileId, options) => {
        const updated = await updateKnowledgeFileAnalysis(fileId, options);
        set((state) => {
          const current = state.projectFiles[projectId] ?? [];
          if (current.length === 0) return state;
          const nextFiles = current.map((file) =>
            file.id === fileId ? { ...file, ...updated } : file,
          );
          return {
            projectFiles: {
              ...state.projectFiles,
              [projectId]: sortFiles(nextFiles),
            },
          };
        });
      },

      createProject: async (payload) => {
        const record = await createProjectRecord(payload);
        const stats: ProjectWithStats = { ...record, fileCount: 0 };
        set((state) => ({
          projects: [stats, ...state.projects],
          projectFiles: { ...state.projectFiles, [record.id]: [] },
          selectedProjectId: record.id,
        }));
        return stats;
      },

      updateProject: async (payload) => {
        const updated = await updateProjectRecord(payload);
        let resolved: ProjectWithStats | undefined;
        set((state) => {
          let matched = false;
          const projects = state.projects.map((project) => {
            if (project.id === updated.id) {
              matched = true;
              resolved = { ...project, ...updated };
              return resolved;
            }
            return project;
          });
          if (!matched) {
            resolved = { ...updated, fileCount: 0 };
            projects.unshift(resolved);
          }
          return { projects };
        });
        return resolved!;
      },

      deleteProject: async (projectId: string) => {
        await deleteProjectRecord(projectId);
        set((state) => {
          const projects = state.projects.filter((project) => project.id !== projectId);
          const { [projectId]: _removed, ...restFiles } = state.projectFiles;
          const activeIds = state.activeIds.filter((id) => id !== projectId);
          const selectedProjectId =
            state.selectedProjectId === projectId ? (projects[0]?.id ?? DEFAULT_PROJECT_ID) : state.selectedProjectId;
          return { projects, projectFiles: restFiles, activeIds, selectedProjectId };
        });
      },

      exportActiveContext: async () => {
        const state = get();
        const activeProjects =
          state.activeIds.length > 0 ? state.activeIds : state.projects.length > 0 ? [state.projects[0].id] : [];
        if (activeProjects.length === 0) {
          set({ warnings: ["No knowledge projects are active."], lastExport: undefined });
          return [];
        }
        const budget = getContextLimit();
        let remaining = budget;
        const bundles: KnowledgeProjectExport[] = [];
        const warnings: string[] = [];

        // Optionally include baseline bundle first
        if (state.baselineEnabled) {
          try {
            const resp = await fetch(`/api/knowledge/baseline?max=${encodeURIComponent(remaining)}`);
            if (resp.ok) {
              const baseline = (await resp.json()) as KnowledgeProjectExport;
              if ((baseline.files?.length ?? 0) > 0) {
                bundles.push(baseline);
                remaining -= baseline.approxBytes ?? 0;
              }
            }
          } catch {
            // ignore baseline fetch errors
          }
        }

        for (const projectId of activeProjects) {
          if (remaining <= 0) {
            warnings.push(`Budget reached before including project ${projectId}.`);
            break;
          }
          try {
            const bundle = await exportProjectPayload(projectId, { maxBytes: remaining });
            if (bundle.files.length === 0) {
              if (bundle.omittedFiles?.length) {
                warnings.push(
                  `Unable to attach files from ${bundle.project.name}; remaining budget too small (${remaining} bytes).`,
                );
              }
              continue;
            }
            bundles.push(bundle);
            remaining -= bundle.approxBytes ?? 0;
            if (bundle.omittedFiles?.length) {
              warnings.push(`Truncated ${bundle.omittedFiles.length} file(s) from ${bundle.project.name}.`);
            }
          } catch (error) {
            warnings.push(error instanceof Error ? error.message : `Failed to export project ${projectId}`);
          }
        }

        const bytes = bundles.reduce((total, bundle) => total + (bundle.approxBytes ?? 0), 0);
        const hash = await sha256Hex(JSON.stringify(bundles));
        set({
          warnings,
          lastExport: {
            bytes,
            projects: bundles.map((bundle) => bundle.project.id),
            hash,
            truncated: warnings.filter((line) => line.toLowerCase().includes("truncate")),
          },
        });
        return bundles;
      },

      toggleBaseline: () => set((state) => ({ baselineEnabled: !state.baselineEnabled })),

      deriveDesktopLayout: (projectId: string, panels?: string[]) => {
        const project = get().projects.find((item) => item.id === projectId);
        const slug = project?.hashSlug ?? projectId;
        return encodeLayout({ projectSlug: slug, panels: normalizePanels(panels) });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ activeIds: state.activeIds, baselineEnabled: state.baselineEnabled }),
    },
  ),
);
