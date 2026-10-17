import { useMemo, useState } from "react";
import type { ResonanceBundle, ResonancePatchMode, ResonancePatchNode } from "@shared/code-lattice";
import { useResonanceStore } from "@/store/useResonanceStore";
import { useResonanceVersion } from "@/lib/agi/resonanceVersion";

const BAND_LABELS: Record<ResonancePatchMode, string> = {
  local: "Local band",
  module: "Module band",
  ideology: "Ideology band",
};

const formatScore = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "n/a";

const describeAge = (timestamp: string | null | undefined) => {
  if (!timestamp) return "never";
  const delta = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(delta) || delta < 0) return "just now";
  if (delta < 1000) return "just now";
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  return `${Math.round(delta / 60_000)}m ago`;
};

const groupActivations = (bundle: ResonanceBundle | null, limit = 5) => {
  if (!bundle || !bundle.candidates || bundle.candidates.length === 0) {
    return null;
  }
  const grouped: Record<ResonancePatchMode, ResonancePatchNode[]> = {
    local: [],
    module: [],
    ideology: [],
  };
  for (const candidate of bundle.candidates) {
    grouped[candidate.mode] = grouped[candidate.mode].concat(candidate.nodes);
  }
  (Object.keys(grouped) as ResonancePatchMode[]).forEach((mode) => {
    grouped[mode] = grouped[mode]
      .slice()
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit);
  });
  return grouped;
};

const collectTelemetryNodes = (bundle: ResonanceBundle | null, limit = 8) => {
  if (!bundle) return [];
  const nodes: Array<ResonancePatchNode & { mode: ResonancePatchMode }> = [];
  for (const candidate of bundle.candidates ?? []) {
    for (const node of candidate.nodes) {
      if (node.panels && node.panels.length > 0) {
        nodes.push({ ...node, mode: candidate.mode });
      }
    }
  }
  return nodes
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
};

export default function ResonanceOrchestraPanel() {
  const resonance = useResonanceStore((state) => ({
    bundle: state.bundle,
    selection: state.selection,
    updatedAt: state.updatedAt,
    latticeVersion: state.latticeVersion,
    traceId: state.traceId,
  }));
  const watcher = useResonanceVersion();
  const [showTelemetryOverlay, setShowTelemetryOverlay] = useState(true);

  const groupedActivations = useMemo(() => groupActivations(resonance.bundle, 5), [resonance.bundle]);
  const telemetryNodes = useMemo(() => collectTelemetryNodes(resonance.bundle, 8), [resonance.bundle]);
  const ranking = resonance.selection?.ranking ?? [];
  const primaryPatchId = resonance.selection?.primaryPatchId;
  const collapsed = ranking.find((entry) => entry.patchId === primaryPatchId);
  const rejected = ranking.filter((entry) => entry.patchId !== primaryPatchId);

  const hasBundle = Boolean(resonance.bundle);

  return (
    <div className="flex h-full flex-col gap-4 rounded border border-white/10 bg-black/30 p-4 text-sm text-slate-100">
      <header className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold">Resonance Orchestra</div>
          <div className="text-xs opacity-70">
            Last plan update: {describeAge(resonance.updatedAt)} · trace {resonance.traceId ?? "n/a"}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <WatchBadge watcher={watcher} />
          <div className="rounded border border-white/15 px-2 py-1 font-mono">
            Lattice v{resonance.latticeVersion ?? watcher.version}
          </div>
        </div>
      </header>

      {!hasBundle && (
        <div className="rounded border border-dashed border-white/20 bg-white/5 p-3 text-xs text-slate-300">
          No resonance bundle available yet. Run a plan to see activation heatmaps and collapse rankings.
        </div>
      )}

      {hasBundle && (
        <>
          <section className="rounded border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-wide opacity-70">Collapse rationale</div>
            <div className="text-sm">{resonance.selection?.rationale ?? "No rationale recorded."}</div>
            <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
              <PatchSummary heading="Collapsed patch" entry={collapsed} />
              <div className="rounded border border-white/10 p-2">
                <div className="text-[11px] uppercase tracking-wide opacity-70">Rejected candidates</div>
                {rejected.length === 0 ? (
                  <div>No alternates ranked.</div>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {rejected.slice(0, 4).map((entry) => (
                      <li key={entry.patchId} className="flex justify-between gap-3 border-b border-white/5 pb-1 last:border-0">
                        <span className="line-clamp-1">
                          {entry.label} <span className="opacity-70">({entry.mode})</span>
                        </span>
                        <span className="font-mono text-xs opacity-80">{formatScore(entry.weightedScore)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 text-xs uppercase tracking-wide opacity-70">Pre-collapse activations</div>
            <div className="grid gap-3 md:grid-cols-3">
              {(Object.keys(BAND_LABELS) as ResonancePatchMode[]).map((mode) => (
                <ActivationColumn key={mode} title={BAND_LABELS[mode]} nodes={groupedActivations?.[mode] ?? []} />
              ))}
            </div>
          </section>

          <section className="rounded border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide opacity-70">Telemetry overlay</div>
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="accent-emerald-400"
                  checked={showTelemetryOverlay}
                  onChange={() => setShowTelemetryOverlay((value) => !value)}
                />
                Show panel boosts
              </label>
            </div>
            {!showTelemetryOverlay && <div className="text-xs opacity-70">Overlay hidden.</div>}
            {showTelemetryOverlay && telemetryNodes.length === 0 && (
              <div className="text-xs opacity-70">No nodes currently flagged by telemetry.</div>
            )}
            {showTelemetryOverlay && telemetryNodes.length > 0 && (
              <ul className="space-y-1 text-xs">
                {telemetryNodes.map((node) => (
                  <li key={node.id} className="flex items-center justify-between gap-3 rounded border border-white/10 bg-white/5 px-2 py-1">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[11px]">{node.id}</div>
                      <div className="text-[11px] opacity-70">
                        {node.mode} · {node.panels?.join(", ")}
                      </div>
                    </div>
                    <div className="text-xs font-semibold">{formatScore(node.score)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

type PatchSummaryProps = {
  heading: string;
  entry?: {
    patchId: string;
    label: string;
    mode: string;
    weightedScore?: number;
    stats?: {
      activationTotal?: number;
      telemetryWeight?: number;
      failingTests?: number;
      nodeCount?: number;
    };
  };
};

function PatchSummary({ heading, entry }: PatchSummaryProps) {
  return (
    <div className="rounded border border-white/10 p-2">
      <div className="text-[11px] uppercase tracking-wide opacity-70">{heading}</div>
      {!entry && <div className="text-xs opacity-70">No patch selected.</div>}
      {entry && (
        <div className="space-y-1 text-xs">
          <div className="font-semibold">
            {entry.label} <span className="opacity-70">({entry.mode})</span>
          </div>
          <div className="flex gap-3">
            <div>score {formatScore(entry.weightedScore)}</div>
            <div>nodes {entry.stats?.nodeCount ?? "?"}</div>
          </div>
          <div className="text-[11px] opacity-70">
            activation={formatScore(entry.stats?.activationTotal)} · telemetry={formatScore(entry.stats?.telemetryWeight)} · failing tests{" "}
            {entry.stats?.failingTests ?? 0}
          </div>
        </div>
      )}
    </div>
  );
}

type ActivationColumnProps = {
  title: string;
  nodes: ResonancePatchNode[];
};

function ActivationColumn({ title, nodes }: ActivationColumnProps) {
  return (
    <div className="rounded border border-white/10 bg-black/20 p-2">
      <div className="text-[11px] uppercase tracking-wide opacity-70">{title}</div>
      {nodes.length === 0 && <div className="text-xs opacity-70">No nodes.</div>}
      {nodes.length > 0 && (
        <ul className="mt-1 space-y-1 text-xs">
          {nodes.map((node) => (
            <li key={node.id} className="rounded border border-white/10 px-2 py-1">
              <div className="font-mono text-[11px]">{node.id}</div>
              <div className="text-[11px] opacity-70">{node.filePath}</div>
              <div className="text-[11px]">score {formatScore(node.score)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type WatchBadgeProps = {
  watcher: ReturnType<typeof useResonanceVersion>;
};

function WatchBadge({ watcher }: WatchBadgeProps) {
  const stats = watcher.stats;
  return (
    <div className="rounded border border-white/15 px-2 py-1 text-xs">
      <div className="font-semibold">
        SSE {watcher.connected ? <span className="text-emerald-300">connected</span> : <span className="text-red-300">offline</span>}
      </div>
      {stats && (
        <div className="text-[11px] opacity-70">
          Δfiles {stats.filesTouched ?? 0} · nodes +{stats.addedNodes ?? 0}/-{stats.removedNodes ?? 0}
        </div>
      )}
    </div>
  );
}
