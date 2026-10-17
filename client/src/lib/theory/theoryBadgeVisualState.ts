import type { TheoryBadgeV1 } from "@shared/contracts/theory-badge-graph.v1";
import type { TheoryAchievementLayoutEdge } from "@/lib/theory/theoryAchievementLayout";

export type TheoryBadgeVisualState = {
  selected: boolean;
  primarySelected: boolean;
  selectedNoPath: boolean;
  tracePath: boolean;
  intermediate: boolean;
  connectable: boolean;
  unavailable: boolean;
  boundaryContext: boolean;
  backendOverlay: boolean;
  playback: boolean;
  solved: boolean;
  failed: boolean;
  foundation: boolean;
  claimBoundary: boolean;
  plannedDomain: boolean;
  routeBlocked: boolean;
  exactDiscussion: boolean;
  likelyDiscussion: boolean;
  loadable: boolean;
  heat: number;
  ripple: boolean;
  atlasHighlighted: boolean;
  hasManualSelection: boolean;
};

export type TheoryBadgeEdgeVisualState = {
  tracePath: boolean;
  context: boolean;
};

export function resolveTheoryBadgeVisualState(args: {
  badge: TheoryBadgeV1;
  badgeId: string;
  selectedBadgeId: string | null;
  selectedBadgeIds: Set<string>;
  traceBadgeIds: Set<string>;
  connectableBadgeIds: Set<string>;
  manualSelectionActive: boolean;
  playbackBadgeIds: Set<string>;
  solvedBadgeIds: Set<string>;
  failedBadgeIds: Set<string>;
  rippleBadgeIds: Set<string>;
  heatByBadgeId: Record<string, number>;
  atlasHighlightedBadgeIds: Set<string>;
  exactBadgeIds: Set<string>;
  likelyBadgeIds: Set<string>;
  plannedDomain: boolean;
  routeBlocked: boolean;
}): TheoryBadgeVisualState {
  const selected = args.selectedBadgeId === args.badgeId || args.selectedBadgeIds.has(args.badgeId);
  const tracePath = args.traceBadgeIds.has(args.badgeId);
  const selectedNoPath = selected && args.selectedBadgeIds.size > 1 && !tracePath;
  const backendOverlay = !args.manualSelectionActive && (
    args.atlasHighlightedBadgeIds.has(args.badgeId) ||
    args.rippleBadgeIds.has(args.badgeId) ||
    (args.heatByBadgeId[args.badgeId] ?? 0) > 0
  );

  return {
    selected,
    primarySelected: args.selectedBadgeId === args.badgeId,
    selectedNoPath,
    tracePath,
    intermediate: tracePath && !selected,
    connectable: args.connectableBadgeIds.has(args.badgeId),
    unavailable: args.manualSelectionActive && !selected && !tracePath && !args.connectableBadgeIds.has(args.badgeId),
    boundaryContext: args.badge.level === "claim_boundary" && !tracePath,
    backendOverlay,
    playback: !args.manualSelectionActive && args.playbackBadgeIds.has(args.badgeId),
    solved: !args.manualSelectionActive && args.solvedBadgeIds.has(args.badgeId),
    failed: !args.manualSelectionActive && args.failedBadgeIds.has(args.badgeId),
    foundation: args.badge.level === "first_principle" || args.badge.subjects.includes("constants"),
    claimBoundary: args.badge.level === "claim_boundary",
    plannedDomain: args.plannedDomain,
    routeBlocked: args.routeBlocked,
    exactDiscussion: args.exactBadgeIds.has(args.badgeId),
    likelyDiscussion: !args.exactBadgeIds.has(args.badgeId) && args.likelyBadgeIds.has(args.badgeId),
    loadable: args.badge.calculatorPayloads.length > 0,
    heat: args.manualSelectionActive ? 0 : args.heatByBadgeId[args.badgeId] ?? 0,
    ripple: !args.manualSelectionActive && args.rippleBadgeIds.has(args.badgeId),
    atlasHighlighted: !args.manualSelectionActive && args.atlasHighlightedBadgeIds.has(args.badgeId),
    hasManualSelection: args.manualSelectionActive,
  };
}

export function theoryBadgeButtonClass(state: TheoryBadgeVisualState): string {
  const classes = [
    "absolute flex h-11 w-11 items-center justify-center border-2 text-[13px] font-black uppercase shadow transition",
    "focus:outline-none focus:ring-2 focus:ring-cyan-200",
    state.loadable
      ? "border-zinc-200 bg-gradient-to-br from-zinc-100 via-zinc-400 to-zinc-700 text-zinc-950"
      : "border-zinc-300 bg-gradient-to-br from-zinc-200 via-zinc-500 to-zinc-800 text-zinc-950",
  ];

  if (state.selectedNoPath) classes.push("ring-4 ring-amber-300/90 shadow-amber-400/35");
  else if (state.selected) classes.push("ring-4 ring-cyan-200/90 shadow-cyan-200/50");
  else if (state.intermediate) classes.push("ring-2 ring-sky-300/80 shadow-sky-500/25");
  else if (state.failed) classes.push("ring-4 ring-rose-400/75 shadow-rose-500/40");
  else if (state.solved) classes.push("ring-4 ring-emerald-300/75 shadow-emerald-500/40");
  else if (state.playback) classes.push("ring-2 ring-cyan-500/70 shadow-cyan-900/40");
  else if (state.backendOverlay) classes.push("ring-2 ring-slate-200/45");

  if (state.tracePath && !state.selected) classes.push("border-sky-200");
  if (state.connectable && !state.selected && !state.tracePath) classes.push("border-cyan-200/90");
  if (state.foundation && !state.hasManualSelection) classes.push("shadow-[0_0_16px_rgba(148,163,184,0.28)]");
  if (state.claimBoundary) classes.push("border-amber-300 bg-gradient-to-br from-amber-100 via-zinc-400 to-rose-900");
  if (state.routeBlocked) classes.push("ring-4 ring-rose-500/80 shadow-rose-500/40");
  if (!state.claimBoundary && state.exactDiscussion) classes.push("ring-4 ring-emerald-300/90 shadow-emerald-300/50");
  else if (!state.claimBoundary && state.likelyDiscussion) classes.push("ring-2 ring-emerald-400/70 shadow-emerald-500/30");
  if (state.plannedDomain) classes.push("opacity-55 saturate-50");
  if (state.unavailable) classes.push("cursor-not-allowed opacity-25 grayscale");

  return classes.join(" ");
}

export function theoryBadgeGlowShadow(state: TheoryBadgeVisualState, activeAtlasGlow: string | null): string | undefined {
  const shadows = [
    state.heat > 0
      ? `0 0 ${Math.round(12 + state.heat * 18)}px rgba(34, 211, 238, ${Math.min(0.72, 0.22 + state.heat * 0.5)})`
      : null,
    state.atlasHighlighted && activeAtlasGlow ? `0 0 24px ${activeAtlasGlow}` : null,
    state.foundation && !state.hasManualSelection ? "0 0 14px rgba(226,232,240,0.22)" : null,
  ].filter(Boolean);

  return shadows.length > 0 ? shadows.join(", ") : undefined;
}

export function resolveTheoryBadgeEdgeVisualState(args: {
  edge: TheoryAchievementLayoutEdge;
  traceEdgeIds: Set<string>;
}): TheoryBadgeEdgeVisualState {
  return {
    tracePath: args.traceEdgeIds.has(args.edge.edgeId),
    context: args.edge.relation === "shares_units" || args.edge.relation === "documents" || args.edge.relation === "blocks",
  };
}

export function theoryBadgeEdgeClass(state: TheoryBadgeEdgeVisualState): string {
  if (!state.tracePath) return "stroke-transparent opacity-0";
  return state.context ? "stroke-sky-300 opacity-80" : "stroke-cyan-200 opacity-100";
}
