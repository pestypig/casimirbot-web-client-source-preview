import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IdeologyNode } from "@/lib/ideology-types";
import type { IdeologyArtifact } from "@shared/ideology/ideology-artifacts";
import { useIdeology } from "@/hooks/use-ideology";
import { useIdeologyBeliefGraph, useIdeologyGuidance } from "@/hooks/use-ideology-belief-graph";
import { useIdeologyArtifacts } from "@/hooks/use-ideology-artifacts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import CitizensArcView from "@/components/ideology/CitizensArcView";
import { cn } from "@/lib/utils";
import { exportNodeToImage } from "@/lib/ideology/pill-export";
import { usePanelTelemetryPublisher } from "@/lib/desktop/panelTelemetryBus";
import { buildIdeologyPanelTelemetry } from "@shared/ideology-telemetry";
import { Download } from "lucide-react";

type IdeologyPanelProps = {
  initialId?: string;
  className?: string;
};

const formatMetric = (value: number | null | undefined, digits = 3) =>
  Number.isFinite(value) ? (value as number).toFixed(digits) : "--";

const CITIZENS_ARC_ID = "citizens-arc";
const PRESSURE_CONTROLS: Array<{
  key: "flattery" | "urgency" | "secrecy" | "financial" | "authority";
  label: string;
}> = [
  { key: "flattery", label: "Flattery" },
  { key: "urgency", label: "Urgency" },
  { key: "secrecy", label: "Secrecy" },
  { key: "financial", label: "Financial ask" },
  { key: "authority", label: "Authority claim" },
];


export function IdeologyPanel({ initialId, className }: IdeologyPanelProps) {
  const { data, isLoading, error, childrenOf, resolve } = useIdeology();
  const beliefGraphRequest = useMemo(
    () => ({
      includeGraph: false,
      includeAttempts: false,
      includeSeeAlso: false,
      edgeMode: "bidirectional" as const,
    }),
    [],
  );
  const {
    data: beliefGraph,
    isLoading: beliefLoading,
    error: beliefError,
  } = useIdeologyBeliefGraph(beliefGraphRequest);
  const initialQueryNode =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("node") ?? undefined
      : undefined;
  const [selectedId, setSelectedId] = useState<string | null>(
    initialId ?? initialQueryNode ?? null
  );
  const selected = selectedId ? resolve?.(selectedId) ?? null : null;
  const [query, setQuery] = useState("");
  const [artifactQuery, setArtifactQuery] = useState("");
  const [showExportControls, setShowExportControls] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadingArtifactId, setDownloadingArtifactId] = useState<string | null>(null);
  const selectedCardRef = useRef<HTMLDivElement | null>(null);
  const searchQuery = query.trim();
  const artifactContextId = selected?.id ?? undefined;
  const artifactPanelId = "mission-ethos";
  const {
    data: artifactsData,
    isLoading: artifactsLoading,
    error: artifactsError,
  } = useIdeologyArtifacts({
    query: artifactQuery.trim() || undefined,
    panelId: artifactPanelId,
    nodeId: artifactContextId,
    limit: 12,
  });
  const {
    data: artifactSearchData,
    isLoading: artifactSearchLoading,
    error: artifactSearchError,
  } = useIdeologyArtifacts(
    searchQuery
      ? {
          query: searchQuery,
          panelId: artifactPanelId,
          limit: 20,
        }
      : {},
  );
  const artifactItems = artifactsData?.items ?? [];
  const artifactTotal = artifactsData?.total ?? 0;
  const artifactSearchItems = artifactSearchData?.items ?? [];

  const [pressureState, setPressureState] = useState({
    flattery: false,
    urgency: false,
    secrecy: false,
    financial: false,
    authority: false,
  });
  const activePressures = useMemo(() => {
    const list: string[] = [];
    if (pressureState.flattery) list.push("flattery_grooming");
    if (pressureState.urgency) list.push("urgency_scarcity");
    if (pressureState.secrecy) list.push("isolation_secrecy");
    if (pressureState.financial) list.push("financial_ask");
    if (pressureState.authority) list.push("authority_claim");
    return list;
  }, [pressureState]);
  const { data: guidanceData } = useIdeologyGuidance({ activePressures, topK: 5 });

  usePanelTelemetryPublisher(
    "mission-ethos",
    () => {
      const nodeId = selected?.id ?? data?.rootId ?? CITIZENS_ARC_ID;
      const panel = buildIdeologyPanelTelemetry({
        nodeId,
        panelId: "mission-ethos",
        instanceId: "mission-ethos",
        title: "Ideology & Moral",
        surface: "ui",
        strings: { surface: "ui" },
      });
      const { panelId, instanceId, title, ...details } = panel;
      return details;
    },
    [selected?.id, data?.rootId],
  );

  useEffect(() => {
    if (!selectedId && data?.rootId) {
      setSelectedId(data.rootId);
    }
  }, [data?.rootId, selectedId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOpenNode = (event: Event) => {
      const detail = (event as CustomEvent<{ node_id?: string; nodeId?: string; id?: string }>).detail;
      const nextNodeId = detail?.node_id ?? detail?.nodeId ?? detail?.id;
      if (nextNodeId) setSelectedId(nextNodeId);
    };
    window.addEventListener("helix-ideology-open-node", handleOpenNode);
    return () => window.removeEventListener("helix-ideology-open-node", handleOpenNode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (selectedId) {
      url.searchParams.set("node", selectedId);
    } else {
      url.searchParams.delete("node");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [selectedId]);

  const flatNodes = useMemo(() => data?.nodes ?? [], [data]);
  const filtered = useMemo(() => {
    const term = searchQuery.toLowerCase();
    if (!term) return [];
    return flatNodes.filter((node) => {
      const inTitle = node.title.toLowerCase().includes(term);
      const inExcerpt = node.excerpt?.toLowerCase().includes(term) ?? false;
      const inTags = node.tags?.some((tag) => tag.toLowerCase().includes(term)) ?? false;
      return inTitle || inExcerpt || inTags;
    });
  }, [flatNodes, searchQuery]);

  const parentOf = useMemo(() => {
    const pairs = new Map<string, string | null>();
    if (data) {
      for (const node of data.nodes) {
        for (const child of node.children ?? []) {
          pairs.set(child, node.id);
        }
      }
      pairs.set(data.rootId, null);
    }
    return pairs;
  }, [data]);

  const breadcrumbs = useMemo(() => {
    if (!selected || !parentOf.size) return [];
    const trail: IdeologyNode[] = [];
    let cursor: IdeologyNode | null = selected;
    while (cursor) {
      trail.unshift(cursor);
      const nextParent: string | null | undefined = parentOf.get(cursor.id);
      cursor = nextParent ? resolve?.(nextParent) ?? null : null;
    }
    return trail;
  }, [parentOf, resolve, selected]);

  const handleAction = (nodeId: string | undefined, actionKind?: string, payload?: any) => {
    if (!actionKind) return;
    if (actionKind === "gotoNode" && payload?.to) {
      setSelectedId(payload.to);
      return;
    }
    if (typeof window === "undefined") return;
    if (actionKind === "openPanel") {
      const detail = { id: payload?.panelId ?? nodeId, params: payload?.params };
      window.dispatchEvent(new CustomEvent("open-helix-panel", { detail }));
      return;
    }
    if (actionKind === "openUrl" && payload?.href) {
      window.open(payload.href, "_blank", "noopener");
      return;
    }
    if (actionKind === "openSettings") {
      window.dispatchEvent(
        new CustomEvent("open-desktop-settings", { detail: { tab: payload?.tab ?? "preferences" } })
      );
      return;
    }
    if (actionKind === "openKnowledgeProject" && payload?.projectId) {
      window.dispatchEvent(
        new CustomEvent("open-knowledge-project", { detail: { projectId: payload.projectId } })
      );
    }
  };

  const exportStatement = useCallback(async () => {
    if (isExporting || !selected) return;
    const node = selectedCardRef.current;
    if (!node) return;
    setIsExporting(true);
    node.setAttribute("data-exporting", "true");
    try {
      const dataUrl = await exportNodeToImage(node, "png");
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `ideology_${selected.id}`.replace(/[^a-z0-9-_]+/gi, "_") + ".png";
      anchor.click();
    } catch (err) {
      window.alert("Export failed. Please retry.");
    } finally {
      node.removeAttribute("data-exporting");
      setIsExporting(false);
    }
  }, [isExporting, selected]);

  const buildArtifactRenderUrl = useCallback(
    (artifact: IdeologyArtifact, format: "png" | "svg" = "png") =>
      `/api/ethos/artifacts/${encodeURIComponent(artifact.id)}/render?format=${format}`,
    [],
  );

  const downloadArtifact = useCallback(
    async (artifact: IdeologyArtifact) => {
      if (downloadingArtifactId) return;
      if (artifact.exportKind !== "pill" || !artifact.exportTargetId) {
        window.alert("This artifact cannot be rendered as a sticker yet.");
        return;
      }
      setDownloadingArtifactId(artifact.id);
      const format = artifact.formats?.includes("svg") ? "svg" : "png";
      const url = buildArtifactRenderUrl(artifact, format);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`download_failed_${res.status}`);
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const safeName = (artifact.exportTargetId || artifact.id).replace(/[^a-z0-9-_]+/gi, "_");
        anchor.href = objectUrl;
        anchor.download = `${safeName}.${format}`;
        anchor.click();
        URL.revokeObjectURL(objectUrl);
      } catch (err) {
        window.alert("Download failed. Please retry.");
      } finally {
        setDownloadingArtifactId(null);
      }
    },
    [buildArtifactRenderUrl, downloadingArtifactId],
  );

  const renderBody = (node: IdeologyNode | null) => {
    if (!node?.bodyMD) return null;
    const paragraphs = node.bodyMD
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
    const renderText = (text: string) =>
      text.split(/(\[\[node:[a-z0-9-]+\]\])/gi).map((chunk, index) => {
        const match = /\[\[node:([a-z0-9-]+)\]\]/i.exec(chunk);
        if (!match) return <span key={`${chunk}-${index}`}>{chunk}</span>;
        const target = resolve?.(match[1]);
        return (
          <button
            key={`${chunk}-${index}`}
            className="underline underline-offset-2 hover:no-underline text-sky-500"
            onClick={() => setSelectedId(target?.id ?? match[1])}
          >
            {target?.title ?? match[1]}
          </button>
        );
      });
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        {paragraphs.map((paragraph, index) => (
          <p key={`paragraph-${index}`}>{renderText(paragraph)}</p>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-slate-300">Loading ideology...</div>;
  }
  if (error || !data) {
    return (
      <div className="p-4 text-sm text-red-400">
        Unable to load ideology – {error instanceof Error ? error.message : "unknown error"}.
      </div>
    );
  }

  const rootNode = resolve?.(data.rootId) ?? null;
  const gateStatus = beliefGraph?.gate?.status ?? "unknown";
  const gateLabel =
    gateStatus === "pass" ? "PASS" : gateStatus === "fail" ? "FAIL" : "UNKNOWN";
  const gateTone =
    gateStatus === "pass"
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
      : gateStatus === "fail"
        ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
        : "border-slate-500/40 bg-slate-500/10 text-slate-300";

  return (
    <div
      className={cn(
        "grid min-h-full grid-cols-12 gap-3 p-3 text-slate-100 bg-slate-950/70",
        className
      )}
    >
      <div className="col-span-12 lg:col-span-3 space-y-3">
        <Card className="p-3 bg-slate-950/50 border-white/10">
          <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-2">
            Search
            <input
              aria-label="Search ideology nodes and artifacts"
              className="mt-1 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              placeholder="Titles, tags, excerpts..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <Separator className="my-3 bg-white/10" />
          {searchQuery ? (
            <>
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-2">
                Search results
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                    Nodes ({filtered.length})
                  </div>
                  {filtered.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No node matches.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {filtered.slice(0, 40).map((node) => (
                        <li key={node.id}>
                          <button
                            className={cn(
                              "w-full rounded-md px-2 py-1 text-left transition",
                              node.id === selected?.id
                                ? "bg-sky-500/20 text-white"
                                : "text-slate-300 hover:bg-white/5"
                            )}
                            onClick={() => setSelectedId(node.id)}
                          >
                            <span className="font-medium">{node.title}</span>
                            {node.tags?.length ? (
                              <span className="ml-2 text-xs text-slate-400">
                                #{node.tags[0]}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Separator className="bg-white/10" />
                <div>
                  <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                    Artifacts ({artifactSearchData?.total ?? 0})
                  </div>
                  {artifactSearchLoading ? (
                    <p className="mt-2 text-sm text-slate-500">Loading artifacts...</p>
                  ) : artifactSearchError ? (
                    <p className="mt-2 text-sm text-rose-300">
                      {artifactSearchError instanceof Error
                        ? artifactSearchError.message
                        : "Unable to load artifacts."}
                    </p>
                  ) : artifactSearchItems.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No artifact matches.</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-sm">
                      {artifactSearchItems.map((artifact) => {
                        const targetId = artifact.nodeId ?? null;
                        const isRenderable =
                          artifact.exportKind === "pill" && Boolean(artifact.exportTargetId);
                        const previewUrl = isRenderable
                          ? buildArtifactRenderUrl(artifact, "png")
                          : null;
                        const isDownloading = downloadingArtifactId === artifact.id;
                        const item = (
                          <>
                            <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                              {artifact.exportKind}
                            </div>
                            <div className="text-sm font-medium text-white">
                              {artifact.title}
                            </div>
                            {artifact.summary && (
                              <div className="mt-1 text-xs text-slate-400">
                                {artifact.summary}
                              </div>
                            )}
                            {previewUrl && (
                              <img
                                className="mt-2 w-full max-h-40 rounded-md border border-white/10 bg-slate-950/60 object-contain"
                                src={previewUrl}
                                alt={`Preview of ${artifact.title}`}
                                loading="lazy"
                              />
                            )}
                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
                              {(artifact.tags ?? []).slice(0, 3).map((tag) => (
                                <span
                                  key={`${artifact.id}-${tag}`}
                                  className="rounded-full border border-white/10 bg-slate-950/60 px-2 py-0.5"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </>
                        );
                        return (
                          <li
                            key={artifact.id}
                            className={cn(
                              "rounded-md border border-white/10 bg-white/5 p-2 transition",
                              targetId ? "hover:border-sky-400/40" : "opacity-80"
                            )}
                          >
                            <div className="flex items-start gap-2">
                              {targetId ? (
                                <button
                                  type="button"
                                  className="flex-1 text-left"
                                  onClick={() => setSelectedId(targetId)}
                                  aria-label={`Open ${artifact.title}`}
                                >
                                  {item}
                                </button>
                              ) : (
                                <div className="flex-1">{item}</div>
                              )}
                              <button
                                type="button"
                                data-export-control="true"
                                className="mt-1 rounded-full border border-white/10 bg-slate-900/80 p-2 text-slate-200 transition hover:border-sky-400/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => downloadArtifact(artifact)}
                                aria-label={`Download ${artifact.title}`}
                                title={
                                  isRenderable
                                    ? "Download PNG sticker"
                                    : "Sticker export unavailable"
                                }
                                disabled={!isRenderable || isDownloading}
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-2">
                Ideology Tree
              </div>
              <nav
                aria-label="Ideology tree"
                role="tree"
                className="space-y-1 max-h-[60vh] overflow-y-auto pr-1"
              >
                {rootNode ? (
                  <TreeNode
                    nodeId={rootNode.id}
                    depth={0}
                    selectedId={selected?.id ?? null}
                    onSelect={(id) => setSelectedId(id)}
                    resolve={resolve}
                    childrenOf={childrenOf}
                  />
                ) : (
                  <p className="text-sm text-slate-400">No root node defined.</p>
                )}
              </nav>
            </>
          )}
        </Card>
      </div>

      <div className="col-span-12 space-y-3 lg:col-span-6">
        <Card className="p-3 bg-slate-950/50 border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Statement exports
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{showExportControls ? "On" : "Off"}</span>
              <Switch
                checked={showExportControls}
                onCheckedChange={setShowExportControls}
              />
            </div>
          </div>
        </Card>
        <Card
          ref={selectedCardRef}
          data-export-id={selected?.id ?? undefined}
          className="p-5 bg-slate-950/60 border-white/10 min-h-[60vh] relative"
        >
          {showExportControls && selected && (
            <button
              type="button"
              data-export-control="true"
              className="absolute right-3 top-3 rounded-full border border-white/10 bg-slate-900/80 p-2 text-slate-200 transition hover:border-sky-400/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              onClick={exportStatement}
              aria-label="Download statement as PNG"
              title="Download statement as PNG"
              disabled={isExporting}
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          {selected ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-400">
                {breadcrumbs.map((crumb, index) => (
                  <span key={crumb.id} className="flex items-center gap-2">
                    <button
                      className="text-slate-300 hover:text-white hover:underline underline-offset-2"
                      onClick={() => setSelectedId(crumb.id)}
                    >
                      {crumb.title}
                    </button>
                    {index < breadcrumbs.length - 1 ? <span className="text-slate-600">/</span> : null}
                  </span>
                ))}
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-white">{selected.title}</h1>
              {selected.excerpt && (
                <p className="mt-1 text-sm text-slate-300">{selected.excerpt}</p>
              )}
              {selected.tags?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <Separator className="my-4 bg-white/10" />
              {selected.id === CITIZENS_ARC_ID ? (
                <CitizensArcView
                  onSelectNode={setSelectedId}
                  resolve={resolve}
                  showExportControls={showExportControls}
                  onToggleExportControls={setShowExportControls}
                />
              ) : (
                renderBody(selected)
              )}
              {selected.links && selected.links.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Links
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.links.map((link) => {
                      const target = resolve?.(link.to);
                      return (
                        <button
                          key={`${selected.id}-${link.rel}-${link.to}`}
                          className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-left text-sm text-slate-200 transition hover:border-sky-400/40"
                          onClick={() => setSelectedId(target?.id ?? link.to)}
                        >
                          <div className="text-[11px] uppercase tracking-wide text-slate-400">{link.rel}</div>
                          <div className="font-medium text-white">{target?.title ?? link.to}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-slate-500">
              Select a node to explore its vows.
            </div>
          )}
        </Card>

        {selected?.actions && selected.actions.length > 0 && (
          <Card className="p-4 bg-slate-950/60 border-white/10">
            <div className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300 mb-3">
              Act on this
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.actions.map((action, index) => (
                <button
                  key={`${selected.id}-action-${index}`}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:border-sky-400/40"
                  onClick={() => handleAction(selected.id, action.action.kind, action.action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div className="col-span-12 lg:col-span-3 space-y-3">
        <Card className="p-4 bg-slate-950/60 border-white/10">
          <div className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
            Belief graph
          </div>
          {beliefLoading ? (
            <p className="mt-2 text-xs text-slate-400">Checking constraints...</p>
          ) : beliefError || !beliefGraph ? (
            <p className="mt-2 text-xs text-rose-300">
              {beliefError instanceof Error
                ? beliefError.message
                : "Unable to load belief graph."}
            </p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className={`border ${gateTone}`}>Gate {gateLabel}</Badge>
                <Badge variant="secondary">
                  Nodes {beliefGraph.summary.nodeCount}
                </Badge>
                <Badge variant="secondary">
                  Edges {beliefGraph.summary.edgeCount}
                </Badge>
              </div>
              <div className="mt-3 space-y-1 text-xs text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Violations</span>
                  <span>{beliefGraph.constraints?.violationCount ?? "--"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Weight</span>
                  <span>{formatMetric(beliefGraph.constraints?.violationWeight, 2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Axiom</span>
                  <span>{beliefGraph.constraints?.axiomViolations ?? "--"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Implies</span>
                  <span>{beliefGraph.constraints?.impliesViolations ?? "--"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Excludes</span>
                  <span>{beliefGraph.constraints?.excludesViolations ?? "--"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Max pressure</span>
                  <span>{formatMetric(beliefGraph.constraints?.maxAbsPressure, 3)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Iterations</span>
                  <span>{beliefGraph.iterations}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Accepted</span>
                  <span>
                    {beliefGraph.accepted
                      ? `yes @${beliefGraph.acceptedIteration ?? 0}`
                      : "no"}
                  </span>
                </div>
              </div>
              {(beliefGraph.summary.missingNodes.length > 0 ||
                beliefGraph.summary.unknownIds.length > 0 ||
                beliefGraph.summary.conflictIds.length > 0) && (
                <div className="mt-3 text-[11px] text-slate-500">
                  {beliefGraph.summary.missingNodes.length > 0
                    ? `Missing nodes: ${beliefGraph.summary.missingNodes.length}. `
                    : ""}
                  {beliefGraph.summary.unknownIds.length > 0
                    ? `Unknown ids: ${beliefGraph.summary.unknownIds.length}. `
                    : ""}
                  {beliefGraph.summary.conflictIds.length > 0
                    ? `Conflicts: ${beliefGraph.summary.conflictIds.length}.`
                    : ""}
                </div>
              )}
            </>
          )}
        </Card>
        <Card className="p-4 bg-slate-950/60 border-white/10">
          <div className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
            Pressure guidance
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {guidanceData?.invariant ?? "System advises, user decides."}
          </p>
          <div className="mt-3 space-y-2">
            {PRESSURE_CONTROLS.map((control) => (
              <label key={control.key} className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-200">
                <span>{control.label}</span>
                <Switch
                  checked={pressureState[control.key]}
                  onCheckedChange={(checked) =>
                    setPressureState((prev) => ({ ...prev, [control.key]: checked }))
                  }
                />
              </label>
            ))}
          </div>
          {activePressures.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">Enable one or more pressure signals to get guidance.</p>
          ) : (
            <div className="mt-3 space-y-3 text-xs">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Anchor now</div>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-300">
                  {(guidanceData?.recommendedNodeIds ?? []).length === 0 ? (
                    <li className="text-slate-500">No immediate anchors returned.</li>
                  ) : (
                    (guidanceData?.recommendedNodeIds ?? []).map((id) => <li key={`anchor-${id}`}>{id}</li>)
                  )}
                </ul>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Avoid / escalate later</div>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-300">
                  {(guidanceData?.warnings ?? []).length === 0 ? (
                    <li className="text-slate-500">No escalation warnings triggered.</li>
                  ) : (
                    (guidanceData?.warnings ?? []).map((warning, index) => (
                      <li key={`warning-${index}`}>{warning}</li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Verification steps</div>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-300">
                  {(guidanceData?.suggestedVerificationSteps ?? []).map((step, index) => (
                    <li key={`verify-${index}`}>{step}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Related artifacts</div>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-300">
                  {(guidanceData?.recommendedArtifacts ?? []).length === 0 ? (
                    <li className="text-slate-500">No related artifacts suggested.</li>
                  ) : (
                    (guidanceData?.recommendedArtifacts ?? []).map((artifactId) => (
                      <li key={`related-${artifactId}`}>
                        <a
                          className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                          href={`/api/ethos/artifacts/${encodeURIComponent(artifactId)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {artifactId}
                        </a>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4 bg-slate-950/60 border-white/10">
          <div className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
            Artifacts
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Context: {selected?.title ?? "Mission Ethos"} ({artifactTotal})
          </div>
          <input
            aria-label="Search artifacts"
            className="mt-3 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
            placeholder="Search artifacts..."
            value={artifactQuery}
            onChange={(event) => setArtifactQuery(event.target.value)}
          />
          {artifactsLoading ? (
            <p className="mt-3 text-xs text-slate-400">Loading artifacts...</p>
          ) : artifactsError ? (
            <p className="mt-3 text-xs text-rose-300">
              {artifactsError instanceof Error
                ? artifactsError.message
                : "Unable to load artifacts."}
            </p>
          ) : artifactItems.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              No artifacts matched this context.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {artifactItems.map((artifact) => (
                <li
                  key={artifact.id}
                  className="rounded-md border border-white/10 bg-white/5 p-2"
                >
                  <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                    {artifact.exportKind}
                  </div>
                  <div className="text-sm font-medium text-white">{artifact.title}</div>
                  {artifact.summary && (
                    <div className="mt-1 text-xs text-slate-400">
                      {artifact.summary}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
                    {artifact.formats?.includes("png") && (
                      <span className="rounded-full border border-white/10 bg-slate-950/60 px-2 py-0.5">
                        PNG
                      </span>
                    )}
                    {artifact.formats?.includes("svg") && (
                      <span className="rounded-full border border-white/10 bg-slate-950/60 px-2 py-0.5">
                        SVG
                      </span>
                    )}
                    {(artifact.tags ?? []).slice(0, 4).map((tag) => (
                      <span
                        key={`${artifact.id}-${tag}`}
                        className="rounded-full border border-white/10 bg-slate-950/60 px-2 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4 bg-slate-950/60 border-white/10">
          <div className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
            References
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {(selected?.references ?? []).length === 0 && (
              <li className="text-slate-500">No references attached.</li>
            )}
            {selected?.references?.map((ref, index) => {
              if (ref.kind === "doc") {
                const href = ref.path.startsWith("http") ? ref.path : `/${ref.path}`;
                return (
                  <li key={`ref-${index}`}>
                    <a
                      className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {ref.title}
                    </a>
                  </li>
                );
              }
              if (ref.kind === "url") {
                return (
                  <li key={`ref-${index}`}>
                    <a
                      className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                      href={ref.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {ref.title}
                    </a>
                  </li>
                );
              }
              if (ref.kind === "panel") {
                return (
                  <li key={`ref-${index}`}>
                    <button
                      className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                      onClick={() => handleAction(selected?.id, "openPanel", ref)}
                    >
                      {ref.title}
                    </button>
                  </li>
                );
              }
              return null;
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

type TreeNodeProps = {
  nodeId: string;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  resolve?: (id: string) => IdeologyNode | null;
  childrenOf: (id: string) => IdeologyNode[];
};

function TreeNode({ nodeId, depth, selectedId, onSelect, resolve, childrenOf }: TreeNodeProps) {
  const node = resolve?.(nodeId);
  const children = childrenOf(nodeId);
  const [open, setOpen] = useState(true);
  const isSelected = node?.id === selectedId;
  return (
    <div role="treeitem" aria-level={depth + 1} aria-expanded={children.length ? open : undefined}>
      <button
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition",
          isSelected ? "bg-sky-500/20 text-white" : "text-slate-300 hover:bg-white/5"
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => onSelect(nodeId)}
        onDoubleClick={() => children.length && setOpen((prev) => !prev)}
      >
        {children.length > 0 ? (
          <span className="text-xs text-slate-500">{open ? "▾" : "▸"}</span>
        ) : (
          <span className="text-xs text-slate-600">•</span>
        )}
        <span>{node?.title ?? nodeId}</span>
      </button>
      {open && children.length > 0 && (
        <div role="group" className="ml-2 border-l border-white/5 pl-2">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              nodeId={child.id}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              resolve={resolve}
              childrenOf={childrenOf}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default IdeologyPanel;
