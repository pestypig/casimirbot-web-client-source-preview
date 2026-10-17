import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type AuditStatus = "pass" | "warn" | "fail" | "unknown";

type StatusCounts = {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  unknown: number;
};

type IdeologyNode = {
  id: string;
  slug?: string;
  title?: string;
  excerpt?: string;
};

type AuditTag = {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  severity?: "info" | "warn" | "critical";
  ideology?: string[];
};

type AuditIssues = {
  missingTags?: boolean;
  unknownTags?: string[];
  violations?: string[];
};

type AuditTreeNode = {
  id: string;
  label: string;
  path: string;
  kind: "group" | "file";
  status: AuditStatus;
  tags?: string[];
  issues?: AuditIssues;
  stats?: StatusCounts;
  children?: AuditTreeNode[];
};

type AuditTreeResponse = {
  generatedAt: string;
  config: {
    available: boolean;
    path: string | null;
    version: number | null;
    rules: number;
    entries: number;
    sources: number;
    ignores: number;
  };
  auto: {
    enabled: boolean;
    rules: number;
    toolRisks: boolean;
    contentMaxBytes: number;
  };
  tags: {
    available: boolean;
    path: string | null;
    version: number | null;
    entries: number;
    registry: Record<string, AuditTag>;
  };
  summary: {
    status: StatusCounts;
    fileCount: number;
    taggedCount: number;
    untaggedCount: number;
    unknownTags: { count: number; unique: string[] };
  };
  ideology: {
    rootId: string | null;
    nodes: Record<string, IdeologyNode>;
  };
  root: AuditTreeNode;
};

const STATUS_DOT: Record<AuditStatus, string> = {
  pass: "bg-emerald-400",
  warn: "bg-amber-400",
  fail: "bg-rose-400",
  unknown: "bg-slate-500",
};

const STATUS_GLOW: Record<AuditStatus, string> = {
  pass: "shadow-[0_0_10px_rgba(16,185,129,0.45)]",
  warn: "shadow-[0_0_10px_rgba(245,158,11,0.45)]",
  fail: "shadow-[0_0_10px_rgba(244,63,94,0.45)]",
  unknown: "shadow-[0_0_8px_rgba(148,163,184,0.35)]",
};

const STATUS_TEXT: Record<AuditStatus, string> = {
  pass: "text-emerald-300",
  warn: "text-amber-300",
  fail: "text-rose-300",
  unknown: "text-slate-400",
};

const buildNodeIndex = (root?: AuditTreeNode) => {
  const map = new Map<string, AuditTreeNode>();
  if (!root) return map;
  const walk = (node: AuditTreeNode) => {
    map.set(node.id, node);
    node.children?.forEach(walk);
  };
  walk(root);
  return map;
};

const sortNodes = (nodes: AuditTreeNode[]) =>
  [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "group" ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

const issueCounts = (issues?: AuditIssues) => {
  if (!issues) return { errors: 0, warnings: 0 };
  const errors = issues.violations?.length ?? 0;
  const warnings =
    (issues.missingTags ? 1 : 0) + (issues.unknownTags?.length ?? 0);
  return { errors, warnings };
};

const formatStatusLabel = (status: AuditStatus) => status.toUpperCase();

function TreeRow({
  node,
  depth,
  open,
  selected,
  onToggle,
  onSelect,
}: {
  node: AuditTreeNode;
  depth: number;
  open: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const hasChildren = Boolean(node.children?.length);
  const issueMeta = issueCounts(node.issues);
  const indent = depth * 14 + 8;
  const tagLabel = node.tags?.[0];
  const tagSuffix =
    node.tags && node.tags.length > 1 ? `+${node.tags.length - 1}` : null;

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={hasChildren ? open : undefined}
    >
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition",
          selected
            ? "bg-sky-500/20 text-white"
            : "text-slate-300 hover:bg-white/5",
        )}
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button
            type="button"
            className="text-[10px] text-slate-500"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.id);
            }}
          >
            {open ? "v" : ">"}
          </button>
        ) : (
          <span className="text-[10px] text-slate-600">-</span>
        )}
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            STATUS_DOT[node.status],
            STATUS_GLOW[node.status],
          )}
        />
        <span className="truncate font-medium">{node.label}</span>
        {node.kind === "file" && tagLabel && (
          <span className="text-[9px] uppercase tracking-wide text-slate-500">
            {tagLabel} {tagSuffix}
          </span>
        )}
        {node.kind === "group" && node.stats && (
          <span className="ml-auto text-[9px] text-slate-500">
            P{node.stats.pass} W{node.stats.warn} F{node.stats.fail}
          </span>
        )}
        {node.kind === "file" &&
          (issueMeta.errors > 0 || issueMeta.warnings > 0) && (
            <span className="ml-auto text-[9px] text-slate-400">
              {issueMeta.errors > 0 ? `E${issueMeta.errors}` : ""}
              {issueMeta.errors > 0 && issueMeta.warnings > 0 ? " " : ""}
              {issueMeta.warnings > 0 ? `W${issueMeta.warnings}` : ""}
            </span>
          )}
      </div>
    </div>
  );
}

type UniversalAuditTreeProps = {
  variant?: "panel" | "embedded";
  className?: string;
};

export function UniversalAuditTree({
  variant = "panel",
  className = "",
}: UniversalAuditTreeProps) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["/api/helix/audit/tree"],
  });

  const payload = data as AuditTreeResponse | undefined;
  const root = payload?.root;
  const rootStatus = root?.status ?? "unknown";
  const nodeIndex = useMemo(() => buildNodeIndex(root), [root]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isEmbedded = variant === "embedded";
  const title = isEmbedded ? "Audit tree" : "Universal Audit Tree";
  const description = isEmbedded
    ? "Audit-tagged tree for the current repo."
    : "Audit-tagged tree for non-math repo integrity.";
  const treeHeight = isEmbedded ? "h-[360px]" : "h-[520px]";
  const gridClass = isEmbedded
    ? "grid gap-3 lg:grid-cols-[minmax(280px,1fr)_260px]"
    : "grid gap-4 lg:grid-cols-[minmax(360px,1fr)_320px]";

  useEffect(() => {
    if (!root) return;
    if (!selectedId || !nodeIndex.has(selectedId)) {
      setSelectedId(root.id);
    }
  }, [nodeIndex, root, selectedId]);

  const selected = selectedId ? nodeIndex.get(selectedId) ?? null : null;
  const summary = payload?.summary;
  const config = payload?.config;
  const ideology = payload?.ideology?.nodes ?? {};
  const tagRegistry = payload?.tags?.registry ?? {};
  const auto = payload?.auto;

  const handleSelect = (id: string) => {
    setSelectedId(id);
  };

  const renderIssues = (issues?: AuditIssues) => {
    if (!issues) return <div className="text-xs text-slate-500">No issues.</div>;
    const groups = [
      {
        label: "Violations",
        items: issues.violations,
        tone: "text-rose-300",
      },
      {
        label: "Missing tags",
        items: issues.missingTags ? ["Missing audit tags"] : [],
        tone: "text-amber-300",
      },
      {
        label: "Unknown tags",
        items: issues.unknownTags,
        tone: "text-amber-300",
      },
    ];
    const visible = groups.filter((group) => group.items && group.items.length);
    if (visible.length === 0) {
      return <div className="text-xs text-slate-500">No issues.</div>;
    }
    return (
      <div className="space-y-2 text-xs">
        {visible.map((group) => (
          <div key={group.label}>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {group.label}
            </div>
            <ul className={cn("mt-1 space-y-1", group.tone)}>
              {(group.items ?? []).slice(0, 6).map((item, idx) => (
                <li key={`${group.label}-${idx}`} className="truncate">
                  {item}
                </li>
              ))}
              {(group.items?.length ?? 0) > 6 && (
                <li className="text-slate-500">
                  +{(group.items?.length ?? 0) - 6} more
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  const renderTags = (tags?: string[]) => {
    if (!tags || tags.length === 0) {
      return <div className="text-xs text-slate-500">No tags.</div>;
    }
    return (
      <div className="space-y-2 text-xs text-slate-300">
        {tags.slice(0, 8).map((tag) => {
          const detail = ideology[tag];
          const registry = tagRegistry[tag];
          const known = Boolean(detail || registry);
          return (
            <div key={tag} className="rounded border border-slate-800/70 p-2">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wide",
                    known ? "text-slate-400" : "text-rose-300",
                  )}
                >
                  {tag}
                </span>
                {known ? (
                  <Badge variant="secondary" className="text-[9px]">
                    known
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] text-rose-300">
                    unknown
                  </Badge>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-200">
                {registry?.title ?? detail?.title ?? "Unknown audit tag"}
              </div>
              {registry?.category && (
                <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                  {registry.category}
                </div>
              )}
              {registry?.description && (
                <div className="mt-1 text-[11px] text-slate-500">
                  {registry.description}
                </div>
              )}
              {!registry?.description && detail?.excerpt && (
                <div className="mt-1 text-[11px] text-slate-500">
                  {detail.excerpt}
                </div>
              )}
            </div>
          );
        })}
        {tags.length > 8 && (
          <div className="text-xs text-slate-500">
            +{tags.length - 8} more
          </div>
        )}
      </div>
    );
  };

  const card = (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                STATUS_DOT[rootStatus],
                STATUS_GLOW[rootStatus],
              )}
            />
            <span>{title}</span>
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Refreshing" : "Refresh"}
          </Button>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-slate-300">Loading audit tree...</div>
        ) : isError || !payload ? (
          <div className="text-sm text-rose-300">
            Unable to load audit tree.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={cn(
                  "bg-emerald-500/20",
                  STATUS_TEXT.pass,
                  STATUS_GLOW.pass,
                )}
              >
                PASS {summary?.status.pass ?? 0}
              </Badge>
              <Badge
                className={cn(
                  "bg-amber-500/20",
                  STATUS_TEXT.warn,
                  STATUS_GLOW.warn,
                )}
              >
                WARN {summary?.status.warn ?? 0}
              </Badge>
              <Badge
                className={cn(
                  "bg-rose-500/20",
                  STATUS_TEXT.fail,
                  STATUS_GLOW.fail,
                )}
              >
                FAIL {summary?.status.fail ?? 0}
              </Badge>
              <Badge variant="secondary">
                Tagged {summary?.taggedCount ?? 0}
              </Badge>
              <Badge variant="outline">
                Untagged {summary?.untaggedCount ?? 0}
              </Badge>
              <Badge variant="outline">
                Unknown tags {summary?.unknownTags.count ?? 0}
              </Badge>
            </div>
            <div className="text-xs text-slate-400">
              Files {summary?.fileCount ?? 0} | Rules {config?.rules ?? 0} |{" "}
              Entries {config?.entries ?? 0} | Auto{" "}
              {auto?.enabled ? auto.rules ?? 0 : 0}
            </div>
            {!config?.available && (
              <div className="text-xs text-amber-300">
                AUDIT_TREE.json not found. Auto rules are active; add one to
                customize tagging.
              </div>
            )}

            <div className={gridClass}>
              <Card className="border-slate-800/70 bg-slate-950/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Audit tree</CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Click a node to inspect audit tags and issues.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className={cn(treeHeight, "pr-2")}>
                    {root ? (
                      <div role="tree" className="space-y-1">
                        <TreeBranch
                          root={root}
                          selectedId={selectedId}
                          onSelect={handleSelect}
                        />
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">
                        No audit tree data.
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="border-slate-800/70 bg-slate-950/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Node details</CardTitle>       
                  <CardDescription className="text-xs text-slate-400">
                    Tag mapping and audit notes for the selected node.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!selected ? (
                    <div className="text-xs text-slate-500">Select a node.</div>
                  ) : (
                    <>
                      <div>
                        <div className="text-xs text-slate-500">Path</div>
                        <div className="mt-1 text-sm text-slate-200">
                          {selected.path || selected.label}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={cn(
                            "border",
                            STATUS_TEXT[selected.status],
                          )}
                        >
                          {formatStatusLabel(selected.status)}
                        </Badge>
                        {selected.kind === "file" && (
                          <Badge variant="secondary">
                            {selected.tags?.length ?? 0} tags
                          </Badge>
                        )}
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Issues
                        </div>
                        {renderIssues(selected.issues)}
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Audit tags
                        </div>
                        {renderTags(selected.tags)}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (isEmbedded) {
    return <div className={className}>{card}</div>;
  }

  return (
    <div
      className={cn(
        "h-full w-full overflow-auto bg-slate-950/80 p-4 text-slate-100",
        className,
      )}
    >
      {card}
    </div>
  );
}

function TreeBranch({
  root,
  selectedId,
  onSelect,
}: {
  root: AuditTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({
    [root.id]: true,
  });

  useEffect(() => {
    setOpenNodes({ [root.id]: true });
  }, [root.id]);

  const isOpen = (node: AuditTreeNode, depth: number) =>
    openNodes[node.id] ?? depth < 2;

  const handleToggle = (id: string) => {
    setOpenNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelect = (id: string) => onSelect(id);

  const renderNode = (node: AuditTreeNode, depth: number) => (
    <div key={node.id}>
      <TreeRow
        node={node}
        depth={depth}
        open={isOpen(node, depth)}
        selected={selectedId === node.id}
        onToggle={handleToggle}
        onSelect={handleSelect}
      />
      {isOpen(node, depth) && node.children && node.children.length > 0 && (
        <div role="group" className="ml-2 border-l border-white/5">
          {sortNodes(node.children).map((child) => renderNode(child, depth + 1))}
        </div>
      )}
    </div>
  );

  return renderNode(root, 0);
}
