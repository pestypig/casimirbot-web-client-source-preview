import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveKnowledgeFiles,
  updateKnowledgeFileAnalysis,
  type KnowledgeFileRecord,
} from "@/lib/agi/knowledge-store";
import { isAudioKnowledgeFile } from "@/lib/knowledge/audio";
import {
  ATOM_TAG,
  analyzeKnowledgeAudio,
  buildAtomIndex,
  collectTags,
  hasTag,
} from "@/lib/knowledge/atom-curation";
import { extractAtomsFromKnowledgeFiles } from "@/lib/knowledge/atom-extraction";
import { useKnowledgeProjectsStore } from "@/store/useKnowledgeProjectsStore";
import { cn } from "@/lib/utils";

const ALL_PROJECTS = "all";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
};

const normalizeTag = (value: string) => value.trim().toLowerCase();

const toggleTag = (tags: string[] | undefined, tag: string, enabled: boolean) => {
  const normalized = normalizeTag(tag);
  const next = (tags ?? []).filter((entry) => normalizeTag(entry) !== normalized);
  if (enabled) {
    next.push(tag);
  }
  return next;
};

type TagStat = { tag: string; count: number };

export function AtomLibraryPanel() {
  const {
    projects,
    projectFiles,
    refresh,
    refreshFiles,
    updateFileTags,
    updateFileAnalysis,
  } = useKnowledgeProjectsStore((state) => ({
    projects: state.projects,
    projectFiles: state.projectFiles,
    refresh: state.refresh,
    refreshFiles: state.refreshFiles,
    updateFileTags: state.updateFileTags,
    updateFileAnalysis: state.updateFileAnalysis,
  }));
  const [projectFilter, setProjectFilter] = useState<string>(ALL_PROJECTS);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showAtomsOnly, setShowAtomsOnly] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!projects.length) return;
    for (const project of projects) {
      if (!projectFiles[project.id]) {
        void refreshFiles(project.id);
      }
    }
  }, [projectFiles, projects, refreshFiles]);

  useEffect(() => {
    if (projectFilter === ALL_PROJECTS) return;
    if (!projects.some((project) => project.id === projectFilter)) {
      setProjectFilter(ALL_PROJECTS);
    }
  }, [projectFilter, projects]);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const audioFiles = useMemo(() => {
    const scoped =
      projectFilter === ALL_PROJECTS
        ? projects.flatMap((project) => projectFiles[project.id] ?? [])
        : projectFiles[projectFilter] ?? [];
    return scoped.filter(isAudioKnowledgeFile);
  }, [projectFiles, projectFilter, projects]);

  const atomCount = useMemo(
    () => audioFiles.filter((file) => hasTag(file, ATOM_TAG)).length,
    [audioFiles],
  );

  const analysisStats = useMemo(() => {
    const analyzed = audioFiles.filter((file) => Boolean(file.analysis)).length;
    const autoTagged = audioFiles.filter(
      (file) => Boolean(file.autoTags && file.autoTags.length),
    ).length;
    return { analyzed, autoTagged };
  }, [audioFiles]);

  const atomIndex = useMemo(() => buildAtomIndex(audioFiles), [audioFiles]);

  const tagStats = useMemo<TagStat[]>(() => {
    const counts = new Map<string, number>();
    for (const file of audioFiles) {
      for (const tag of collectTags(file)) {
        const key = normalizeTag(tag);
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [audioFiles]);

  const filteredFiles = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const tagFilter = activeTag ? normalizeTag(activeTag) : null;
    return audioFiles.filter((file) => {
      if (showAtomsOnly && !hasTag(file, ATOM_TAG)) return false;
      if (tagFilter && !hasTag(file, tagFilter)) return false;
      if (!searchTerm) return true;
      if (file.name.toLowerCase().includes(searchTerm)) return true;
      if (collectTags(file).some((tag) => normalizeTag(tag).includes(searchTerm))) {
        return true;
      }
      return false;
    });
  }, [activeTag, audioFiles, search, showAtomsOnly]);

  const handleToggleAtom = async (file: KnowledgeFileRecord) => {
    if (!file.projectId) return;
    const manualHasAtom = hasTag({ tags: file.tags }, ATOM_TAG);
    const enabled = !manualHasAtom;
    const nextTags = toggleTag(file.tags, ATOM_TAG, enabled);
    setStatus(null);
    try {
      await updateFileTags(file.projectId, file.id, nextTags);
      setStatus(`${enabled ? "Added" : "Removed"} atom tag for ${file.name}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update atom tag.";
      setStatus(message);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      const nextProjects = useKnowledgeProjectsStore.getState().projects;
      await Promise.all(nextProjects.map((project) => refreshFiles(project.id)));
    } finally {
      setRefreshing(false);
    }
  };

  const handleAnalyze = async (mode: "missing" | "all") => {
    const targets =
      mode === "all"
        ? audioFiles
        : audioFiles.filter(
            (file) => !file.analysis || !(file.autoTags && file.autoTags.length),
          );
    if (targets.length === 0) {
      setAnalysisStatus("No audio needs analysis.");
      return;
    }
    setAnalysisRunning(true);
    setAnalysisStatus(`Analyzing ${targets.length} file(s)...`);
    let processed = 0;
    try {
      for (const file of targets) {
        processed += 1;
        setAnalysisStatus(`Analyzing ${file.name} (${processed}/${targets.length})`);
        const result = await analyzeKnowledgeAudio(file);
        if (!result || !file.projectId) {
          continue;
        }
        await updateFileAnalysis(file.projectId, file.id, {
          analysis: result.analysis,
          autoTags: result.autoTags,
        });
      }
      setAnalysisStatus(`Analysis complete for ${targets.length} file(s).`);
    } finally {
      setAnalysisRunning(false);
    }
  };

  const handleExtractAtoms = async () => {
    setExtractStatus(null);
    if (projectFilter === ALL_PROJECTS) {
      setExtractStatus("Select a project to extract atoms.");
      return;
    }
    const projectId = projectFilter;
    const sources = (projectFiles[projectId] ?? [])
      .filter(isAudioKnowledgeFile)
      .filter((file) => !hasTag(file, ATOM_TAG));
    if (!sources.length) {
      setExtractStatus("No stem audio without atom tags found.");
      return;
    }
    setExtracting(true);
    try {
      const result = await extractAtomsFromKnowledgeFiles(sources, {
        maxAtomsPerSource: 6,
        maxTotal: 32,
        onProgress: setExtractStatus,
      });
      if (!result.atoms.length) {
        setExtractStatus("No atom slices found.");
        return;
      }
      const files = result.atoms.map((atom) => atom.file);
      const saved = await saveKnowledgeFiles(files, { projectId });
      for (let i = 0; i < saved.length; i += 1) {
        const atom = result.atoms[i];
        if (!atom) continue;
        await updateKnowledgeFileAnalysis(saved[i].id, {
          analysis: atom.analysis,
          autoTags: atom.autoTags,
        });
      }
      await refreshFiles(projectId);
      await refresh();
      const dedupeNote = result.deduped ? ` (${result.deduped} deduped)` : "";
      const skipNote = result.skippedSources
        ? `, skipped ${result.skippedSources} source(s)`
        : "";
      setExtractStatus(`Extracted ${saved.length} atoms${dedupeNote}${skipNote}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Atom extraction failed.";
      setExtractStatus(message);
    } finally {
      setExtracting(false);
    }
  };

  const emptyState = (() => {
    if (!projects.length) {
      return "No knowledge projects found yet.";
    }
    if (!audioFiles.length) {
      return "No audio files yet. Add WAV or MP3 files to a knowledge project.";
    }
    if (!filteredFiles.length) {
      return "No audio matches these filters.";
    }
    return null;
  })();

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-200 shadow-[0_20px_60px_-45px_rgba(14,165,233,0.5)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">Atom Library</p>
          <p className="text-xs text-slate-400">
            Tag and curate audio atoms for future render plans.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
            Atoms {atomCount}
          </Badge>
          <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
            Indexed {atomIndex.entries.length}
          </Badge>
          <Badge variant="secondary" className="bg-slate-800/80 text-slate-200">
            Analyzed {analysisStats.analyzed}/{audioFiles.length}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleAnalyze("missing")}
            disabled={analysisRunning}
          >
            {analysisRunning ? "Analyzing..." : "Analyze missing"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleAnalyze("all")}
            disabled={analysisRunning}
          >
            Re-analyze
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleExtractAtoms()}
            disabled={extracting || analysisRunning}
          >
            {extracting ? "Extracting..." : "Extract atoms"}
          </Button>
        </div>
      </header>

      {status ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-slate-200">
          {status}
        </div>
      ) : null}
      {analysisStatus ? (
        <div className="mt-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-slate-200">
          {analysisStatus}
        </div>
      ) : null}
      {extractStatus ? (
        <div className="mt-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-slate-200">
          {extractStatus}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <label className="flex min-w-[200px] flex-1 flex-col text-xs font-medium text-slate-400">
          Project
          <select
            className="mt-1 rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
          >
            <option value={ALL_PROJECTS}>All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} {project.fileCount ? `(${project.fileCount})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col text-xs font-medium text-slate-400">
          Search atoms
          <Input
            className="mt-1 bg-slate-900"
            placeholder="Filter by name or tag"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            type="search"
          />
        </label>
        <div className="flex items-end gap-2">
          <Button
            size="sm"
            variant={showAtomsOnly ? "secondary" : "outline"}
            onClick={() => setShowAtomsOnly((current) => !current)}
          >
            {showAtomsOnly ? "Atoms only" : "Show atoms"}
          </Button>
        </div>
      </div>

      {tagStats.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className="uppercase tracking-wide text-slate-500">Tags</span>
          <button
            type="button"
            className={cn(
              "rounded-full border px-2 py-1 text-[11px] transition",
              activeTag
                ? "border-white/10 bg-slate-950/60 text-slate-400 hover:border-sky-400/40"
                : "border-sky-400/50 bg-slate-900/70 text-sky-200",
            )}
            onClick={() => setActiveTag(null)}
          >
            All
          </button>
          {tagStats.slice(0, 18).map((tag) => (
            <button
              key={tag.tag}
              type="button"
              className={cn(
                "rounded-full border px-2 py-1 text-[11px] transition",
                activeTag === tag.tag
                  ? "border-sky-400/60 bg-slate-900/70 text-sky-200"
                  : "border-white/10 bg-slate-950/60 text-slate-400 hover:border-sky-400/40",
              )}
              onClick={() => setActiveTag(tag.tag)}
            >
              {tag.tag} ({tag.count})
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          No tags yet. Add tags in Settings -&gt; AGI Knowledge.
        </p>
      )}

      <div className="mt-4 max-h-[360px] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40">
        {emptyState ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400">
            {emptyState}
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {filteredFiles.map((file) => {
              const isAtomManual = hasTag({ tags: file.tags }, ATOM_TAG);
              const isAtomAuto = hasTag({ autoTags: file.autoTags }, ATOM_TAG);
              const isAtom = isAtomManual || isAtomAuto;
              const projectName =
                projectById.get(file.projectId ?? "")?.name ?? "My Knowledge";
              return (
                <li key={file.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {projectName} / {formatBytes(file.size)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Tags: {file.tags?.length ? file.tags.join(", ") : "none"}
                      </p>
                      <p className="text-xs text-slate-500">
                        Auto: {file.autoTags?.length ? file.autoTags.join(", ") : "none"}
                      </p>
                      {file.analysis ? (
                        <p className="text-[11px] text-slate-600">
                          Dur {file.analysis.durationSec?.toFixed(1)}s - RMS{" "}
                          {file.analysis.rms?.toFixed(3)} - Bright{" "}
                          {file.analysis.brightness?.toFixed(2)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {isAtom ? (
                        <Badge className="border border-emerald-400/40 bg-emerald-500/10 text-emerald-200">
                          {isAtomManual ? "Atom" : "Atom (auto)"}
                        </Badge>
                      ) : (
                        <Badge className="border border-white/10 bg-slate-950/60 text-slate-400">
                          Not tagged
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant={isAtom ? "secondary" : "outline"}
                        onClick={() => void handleToggleAtom(file)}
                      >
                        {isAtomManual ? "Remove atom" : "Add atom"}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export default AtomLibraryPanel;
