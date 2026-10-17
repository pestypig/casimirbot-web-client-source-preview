import { useMemo, useState, useEffect } from "react";
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

type MathStatus = "pass" | "warn" | "fail" | "unknown";
type MathStage = "exploratory" | "reduced-order" | "diagnostic" | "certified";
type MathStageLabel = MathStage | "unstaged";

type MathCheck = {
  type: string;
  path: string;
  note?: string;
};

type UnitSignature = Record<string, string>;

type NodeIssues = {
  evidence?: string[];
  stage?: string[];
  unitErrors?: string[];
  unitWarnings?: string[];
};

type StatusCounts = {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  unknown: number;
};

type MathTreeNode = {
  id: string;
  label: string;
  path: string;
  kind: "group" | "module";
  status: MathStatus;
  stage?: MathStageLabel;
  tag?: string;
  checks?: MathCheck[];
  units?: UnitSignature;
  issues?: NodeIssues;
  stats?: StatusCounts;
  children?: MathTreeNode[];
};

type MathGraphResponse = {
  generatedAt: string;
  report: {
    available: boolean;
    generatedAt: string | null;
    path: string | null;
    ageMs: number | null;
  };
  summary: {
    stages: Record<MathStage, number>;
    status: StatusCounts;
    evidenceIssues: number;
    stageViolations: number;
    unitViolations: { errors: number; warnings: number };
    unstagedCount: number;
  };
  root: MathTreeNode;
};

const STATUS_DOT: Record<MathStatus, string> = {
  pass: "bg-emerald-400",
  warn: "bg-amber-400",
  fail: "bg-rose-400",
  unknown: "bg-slate-500",
};

const STATUS_GLOW: Record<MathStatus, string> = {
  pass: "shadow-[0_0_10px_rgba(16,185,129,0.45)]",
  warn: "shadow-[0_0_10px_rgba(245,158,11,0.45)]",
  fail: "shadow-[0_0_10px_rgba(244,63,94,0.45)]",
  unknown: "shadow-[0_0_8px_rgba(148,163,184,0.35)]",
};

const STATUS_TEXT: Record<MathStatus, string> = {
  pass: "text-emerald-300",
  warn: "text-amber-300",
  fail: "text-rose-300",
  unknown: "text-slate-400",
};

const STAGE_LABELS: Record<MathStageLabel, string> = {
  exploratory: "S0",
  "reduced-order": "S1",
  diagnostic: "S2",
  certified: "S3",
  unstaged: "UNSTAGED",
};

const STAGE_BADGE: Record<MathStageLabel, string> = {
  exploratory: "border-slate-600/60 text-slate-300",
  "reduced-order": "border-sky-500/50 text-sky-300",
  diagnostic: "border-amber-500/50 text-amber-300",
  certified: "border-emerald-500/50 text-emerald-300",
  unstaged: "border-rose-500/50 text-rose-300",
};

const formatAgeMs = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value < 1000) return `${Math.round(value)}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours)}h`;
  const days = hours / 24;
  return `${Math.round(days)}d`;
};

const formatStatusLabel = (status: MathStatus) => status.toUpperCase();

const formatStageName = (stage?: MathStageLabel) => {
  if (!stage) return "n/a";
  if (stage === "reduced-order") return "reduced-order";
  return stage;
};

const buildNodeIndex = (root?: MathTreeNode) => {
  const map = new Map<string, MathTreeNode>();
  if (!root) return map;
  const walk = (node: MathTreeNode) => {
    map.set(node.id, node);
    node.children?.forEach(walk);
  };
  walk(root);
  return map;
};

const sortNodes = (nodes: MathTreeNode[]) =>
  [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "group" ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

const issueCounts = (issues?: NodeIssues) => {
  if (!issues) return { errors: 0, warnings: 0 };
  const errors = (issues.stage?.length ?? 0) + (issues.unitErrors?.length ?? 0);
  const warnings =
    (issues.evidence?.length ?? 0) + (issues.unitWarnings?.length ?? 0);
  return { errors, warnings };
};

function TreeRow({
  node,
  depth,
  open,
  selected,
  onToggle,
  onSelect,
}: {
  node: MathTreeNode;
  depth: number;
  open: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const hasChildren = Boolean(node.children?.length);
  const issueMeta = issueCounts(node.issues);
  const indent = depth * 14 + 8;

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
            : "text-slate-300 hover:bg-white/5"
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
            STATUS_GLOW[node.status]
          )}
        />
        <span className="truncate font-medium">{node.label}</span>
        {node.kind === "module" && node.stage && (
          <Badge variant="outline" className={cn("text-[9px]", STAGE_BADGE[node.stage])}>
            {STAGE_LABELS[node.stage]}
          </Badge>
        )}
        {node.tag && (
          <span className="text-[9px] uppercase tracking-wide text-slate-500">
            {node.tag}
          </span>
        )}
        {node.kind === "group" && node.stats && (
          <span className="ml-auto text-[9px] text-slate-500">
            P{node.stats.pass} W{node.stats.warn} F{node.stats.fail}
          </span>
        )}
        {node.kind === "module" && (issueMeta.errors > 0 || issueMeta.warnings > 0) && (
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

type MathMaturityTreeProps = {
  variant?: "panel" | "embedded";
  className?: string;
};

export function MathMaturityTree({
  variant = "panel",
  className = "",
}: MathMaturityTreeProps) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["/api/helix/math/graph"],
  });

  const payload = data as MathGraphResponse | undefined;
  const root = payload?.root;
  const rootStatus = root?.status ?? "unknown";
  const nodeIndex = useMemo(() => buildNodeIndex(root), [root]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isEmbedded = variant === "embedded";
  const title = isEmbedded ? "Math maturity" : "Math Maturity Tree";
  const description = isEmbedded
    ? "Live stage maturity and pass or fail status for the audit graph."
    : "Stage maturity and pass or fail status for the math-critical repo paths.";
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
  const report = payload?.report;

  const handleSelect = (id: string) => {
    setSelectedId(id);
  };

  const renderIssues = (issues?: NodeIssues) => {
    if (!issues) return <div className="text-xs text-slate-500">No issues.</div>;
    const groups = [
      { label: "Stage", items: issues.stage, tone: "text-rose-300" },
      { label: "Evidence", items: issues.evidence, tone: "text-amber-300" },
      { label: "Unit errors", items: issues.unitErrors, tone: "text-rose-300" },
      { label: "Unit warnings", items: issues.unitWarnings, tone: "text-amber-300" },
    ];
    const visible = groups.filter((group) => group.items && group.items.length > 0);
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
                <li className="text-slate-500">+{(group.items?.length ?? 0) - 6} more</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  const renderChecks = (checks?: MathCheck[]) => {
    if (!checks || checks.length === 0) {
      return <div className="text-xs text-slate-500">No checks listed.</div>;
    }
    return (
      <ul className="space-y-1 text-xs text-slate-300">
        {checks.slice(0, 6).map((check, idx) => (
          <li key={`${check.type}-${idx}`} className="flex gap-2">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              {check.type}
            </span>
            <span className="truncate">{check.path}</span>
          </li>
        ))}
        {checks.length > 6 && (
          <li className="text-xs text-slate-500">+{checks.length - 6} more</li>
        )}
      </ul>
    );
  };

  const renderUnits = (units?: UnitSignature) => {
    if (!units || Object.keys(units).length === 0) {
      return <div className="text-xs text-slate-500">No unit signatures.</div>;
    }
    const entries = Object.entries(units).slice(0, 8);
    return (
      <div className="space-y-1 text-xs text-slate-300">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="truncate text-slate-400">{key}</span>
            <span className="font-mono text-slate-200">{value}</span>
          </div>
        ))}
        {Object.keys(units).length > entries.length && (
          <div className="text-xs text-slate-500">
            +{Object.keys(units).length - entries.length} more
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
                STATUS_GLOW[rootStatus]
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
          <div className="text-sm text-slate-300">Loading math graph...</div>
        ) : isError || !payload ? (
          <div className="text-sm text-rose-300">Unable to load math graph.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={cn(
                  "bg-emerald-500/20",
                  STATUS_TEXT.pass,
                  STATUS_GLOW.pass
                )}
              >
                PASS {summary?.status.pass ?? 0}
              </Badge>
              <Badge
                className={cn(
                  "bg-amber-500/20",
                  STATUS_TEXT.warn,
                  STATUS_GLOW.warn
                )}
              >
                WARN {summary?.status.warn ?? 0}
              </Badge>
              <Badge
                className={cn(
                  "bg-rose-500/20",
                  STATUS_TEXT.fail,
                  STATUS_GLOW.fail
                )}
              >
                FAIL {summary?.status.fail ?? 0}
              </Badge>
              <Badge variant="secondary">
                Unstaged {summary?.unstagedCount ?? 0}
              </Badge>
              <Badge variant="outline">
                Unit errors {summary?.unitViolations.errors ?? 0}
              </Badge>
              <Badge variant="outline">
                Unit warnings {summary?.unitViolations.warnings ?? 0}
              </Badge>
            </div>
            {summary && (
              <div className="text-xs text-slate-400">
                S0 {summary.stages.exploratory} S1{" "}
                {summary.stages["reduced-order"]} S2{" "}
                {summary.stages.diagnostic} S3 {summary.stages.certified}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Report</span>
              <span className="text-slate-300">
                {report?.available ? "ready" : "missing"}
              </span>
              <span>age {formatAgeMs(report?.ageMs)}</span>
              {report?.path ? (
                <span className="text-slate-500">{report.path}</span>
              ) : null}
            </div>
            {!report?.available && (
              <div className="text-xs text-amber-300">
                Run npm run math:report to generate the report file.
              </div>
            )}

            <div className={gridClass}>
              <Card className="border-slate-800/70 bg-slate-950/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Math tree</CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Click a node to inspect stage, checks, and unit signatures.
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
                        No registry data.
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="border-slate-800/70 bg-slate-950/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Node details</CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Stage and evidence details for the selected node.
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
                            STATUS_TEXT[selected.status]
                          )}
                        >
                          {formatStatusLabel(selected.status)}
                        </Badge>
                        {selected.stage && (
                          <Badge
                            variant="outline"
                            className={STAGE_BADGE[selected.stage]}
                          >
                            {STAGE_LABELS[selected.stage]}{" "}
                            {formatStageName(selected.stage)}
                          </Badge>
                        )}
                        {selected.tag && (
                          <Badge variant="secondary">{selected.tag}</Badge>
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
                          Checks
                        </div>
                        {renderChecks(selected.checks)}
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Units
                        </div>
                        {renderUnits(selected.units)}
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
    <div className={cn("h-full w-full overflow-auto bg-slate-950/80 p-4 text-slate-100", className)}>
      {card}
    </div>
  );
}

function TreeBranch({
  root,
  selectedId,
  onSelect,
}: {
  root: MathTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({
    [root.id]: true,
  });

  useEffect(() => {
    setOpenNodes({ [root.id]: true });
  }, [root.id]);

  const isOpen = (node: MathTreeNode, depth: number) =>
    openNodes[node.id] ?? depth < 2;

  const handleToggle = (id: string) => {
    setOpenNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelect = (id: string) => onSelect(id);

  const renderNode = (node: MathTreeNode, depth: number) => (
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
