import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  TheoryBadgeEquationV1,
  TheoryBadgeGraphV1,
  TheoryBadgeV1,
} from "@shared/contracts/theory-badge-graph.v1";
import type { ProbabilityTerrainV1 } from "@shared/contracts/probability-terrain.v1";
import type { TheoryFrontierVectorFieldTraceV1 } from "@shared/contracts/theory-frontier-vector-field.v1";
import type { PhysicsAtlasBlockId, PhysicsAtlasBlockV1 } from "@shared/contracts/physics-atlas.v1";
import type { TheoryBiomeBand, TheoryBiomeChunkV1 } from "@shared/contracts/theory-biome-layout.v1";
import { THEORY_BIOME_LAYOUT_SPACING_CONTRACT_V1 } from "@shared/contracts/theory-biome-layout.v1";
import { THEORY_BIOME_BAND_ORDER } from "@shared/theory/theory-biome-scale-taxonomy";
import { PHYSICS_ATLAS_BLOCKS } from "@shared/theory/physics-atlas-blocks";
import ProbabilityTerrainOverlay from "@/components/graphs/ProbabilityTerrainOverlay";
import {
  layoutTheoryAchievementMap,
  type TheoryAchievementLayoutEdge,
  type TheoryAchievementLayoutNode,
} from "@/lib/theory/theoryAchievementLayout";
import { biomeNoise2D } from "@/lib/theory/theoryBiomeField";
import {
  buildTheoryFrontierMapOverlay,
  type TheoryFrontierMapCandidateRegion,
  type TheoryFrontierMapTensorPath,
} from "@/lib/theory/theoryFrontierMapOverlay";
import {
  resolveTheoryBadgeVisualState,
  resolveTheoryBadgeEdgeVisualState,
  theoryBadgeButtonClass,
  theoryBadgeEdgeClass,
  theoryBadgeGlowShadow,
} from "@/lib/theory/theoryBadgeVisualState";

type TheoryAchievementMapProps = {
  graph: TheoryBadgeGraphV1;
  selectedBadgeId: string | null;
  selectedBadgeIds: string[];
  highlightedBadgeIds: string[];
  highlightedEdgeIds: string[];
  traceBadgeIds: string[];
  connectableBadgeIds: string[];
  exactBadgeIds: string[];
  likelyBadgeIds: string[];
  softRegions: Array<{
    id: string;
    label: string;
    badgeIds: string[];
    confidence: number;
    tone: "green";
    meaning: "discussion_context_not_proof";
  }>;
  playbackBadgeIds: string[];
  solvedBadgeIds: string[];
  failedBadgeIds: string[];
  rippleBadgeIds: string[];
  heatByBadgeId: Record<string, number>;
  translateText?: (text: string) => string;
  probabilityTerrain?: ProbabilityTerrainV1;
  frontierTrace?: TheoryFrontierVectorFieldTraceV1 | null;
  routeBadgeLabels?: Record<string, {
    label: string;
    tone: "cyan" | "emerald" | "amber" | "rose" | "slate";
    title: string;
  }>;
  activeAtlasLensId: PhysicsAtlasBlockId | null;
  onSelectBadge: (badgeId: string) => void;
  onClearSelection: () => void;
  onRunPath: (badgeId: string) => void;
  onLoadCalculatorPayload: (badgeId: string, payloadId: string) => void;
  viewport: {
    scrollLeft: number;
    scrollTop: number;
  };
  onViewportChange: (viewport: { scrollLeft: number; scrollTop: number }) => void;
};

const ATLAS_GLOW_COLORS: Record<PhysicsAtlasBlockId, string> = {
  stellar_evolution: "rgba(192, 38, 211, 0.72)",
  astrochemistry_prebiotic: "rgba(77, 124, 15, 0.72)",
  cosmic_distance_ladder: "rgba(217, 119, 6, 0.72)",
  solar_surface_spectrum: "rgba(234, 179, 8, 0.76)",
  casimir_cavity_modes: "rgba(6, 182, 212, 0.72)",
  warp_gr_nhm2: "rgba(124, 58, 237, 0.72)",
  nhm2_full_solve: "rgba(79, 70, 229, 0.72)",
  qei_stress_energy: "rgba(148, 163, 184, 0.72)",
  tokamak_plasma: "rgba(249, 115, 22, 0.72)",
  galactic_dynamics: "rgba(14, 165, 233, 0.72)",
  curvature_collapse: "rgba(16, 185, 129, 0.72)",
};

const BAND_LABELS: Record<TheoryBiomeBand, string> = {
  abstract_formal: "Formal",
  planck_quantum: "Quantum",
  nuclear: "Nuclear",
  atomic: "Atomic",
  molecular: "Molecular",
  cellular_biophysical: "Biophysical",
  device_laboratory: "Device / Lab",
  human_engineering: "Engineering",
  planetary: "Planetary",
  stellar: "Stellar",
  galactic_cosmic: "Galactic",
  claim_boundary: "Boundary",
};

const BAND_COLORS: Record<TheoryBiomeBand, string> = {
  abstract_formal: "rgba(71, 85, 105, 0.42)",
  planck_quantum: "rgba(30, 64, 175, 0.42)",
  nuclear: "rgba(37, 99, 235, 0.36)",
  atomic: "rgba(8, 145, 178, 0.36)",
  molecular: "rgba(22, 101, 52, 0.38)",
  cellular_biophysical: "rgba(77, 124, 15, 0.38)",
  device_laboratory: "rgba(202, 138, 4, 0.34)",
  human_engineering: "rgba(124, 58, 237, 0.36)",
  planetary: "rgba(14, 116, 144, 0.34)",
  stellar: "rgba(194, 65, 12, 0.34)",
  galactic_cosmic: "rgba(88, 28, 135, 0.42)",
  claim_boundary: "rgba(127, 29, 29, 0.46)",
};

const DOMAIN_LABELS: Record<string, string> = {
  foundation: "Foundation",
  relativity_history: "Relativity History",
  quantum: "Quantum",
  atomic_spectroscopy: "Atomic Spectroscopy",
  astrochemistry: "Astrochemistry",
  prebiotic_biophysics: "Prebiotic Biophysics",
  evolutionary_biophysics: "Evolutionary Biophysics",
  solar: "Solar",
  stellar: "Stellar",
  casimir: "Casimir",
  nhm2: "NHM2",
  qei_stress_energy: "QEI Stress Energy",
  tokamak_plasma: "Tokamak Plasma",
  galactic_dynamics: "Galactic Dynamics",
  curvature_collapse: "Curvature Collapse",
  claim_boundary: "Claim Boundary",
  general: "General",
};

const BIOME_BAND_WIDTH = THEORY_BIOME_LAYOUT_SPACING_CONTRACT_V1.scaleBandWidthPx;
const BIOME_X_OFFSET = 92;
const MAX_ZOOM = 1.8;
const MIN_ZOOM_FLOOR = 0.18;
const ZOOM_BURST_FACTOR = 1.22;
const WORDMARK_BASE_FONT_PX = 11;
const WORDMARK_MAX_FONT_PX = 40;
const BADGE_POPUP_BASE_WIDTH_PX = 240;
const BADGE_POPUP_ESTIMATED_HEIGHT_PX = 86;
const BADGE_POPUP_VIEWPORT_MARGIN_PX = 12;

function labelizeBiomeToken(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function chunkWatermarkLabel(chunk: TheoryBiomeChunkV1, translateText: (text: string) => string): string {
  return `${translateText(BAND_LABELS[chunk.dominantScaleBand])} / ${translateText(
    DOMAIN_LABELS[chunk.dominantDomainKey] ?? labelizeBiomeToken(chunk.dominantDomainKey),
  )}`;
}

function chunkWordmarkClipId(chunk: TheoryBiomeChunkV1): string {
  return `theory-biome-wordmark-clip-${chunk.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function chunkWatermarkFontSize(zoom: number): number {
  return Number(clamp(WORDMARK_BASE_FONT_PX / Math.max(zoom, MIN_ZOOM_FLOOR), WORDMARK_BASE_FONT_PX, WORDMARK_MAX_FONT_PX).toFixed(2));
}

function badgePopupScreenScale(zoom: number): number {
  const wordmarkScale = chunkWatermarkFontSize(zoom) / WORDMARK_BASE_FONT_PX;
  return Number(clamp(1 + (wordmarkScale - 1) * 0.45, 1, 1.8).toFixed(4));
}

function chunkWatermarkTiles(
  chunk: TheoryBiomeChunkV1,
  label: string,
  fontSize: number,
): Array<{ id: string; x: number; y: number }> {
  const width = chunk.bounds.x1 - chunk.bounds.x0;
  const height = chunk.bounds.y1 - chunk.bounds.y0;
  const columnStep = Math.max(190, label.length * fontSize * 0.72 + 72);
  const rowStep = Math.max(112, fontSize * 7.6);
  const columns = Math.max(1, Math.ceil(width / columnStep));
  const rows = Math.max(1, Math.ceil(height / rowStep));
  const count = Math.min(14, columns * rows);
  return Array.from({ length: count }).map((_, index: number) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: `${chunk.id}:watermark:${index}`,
      x: chunk.bounds.x0 + Math.max(24, fontSize * 1.6) + column * columnStep,
      y: chunk.bounds.y0 + Math.max(42, fontSize * 3.1) + row * rowStep,
    };
  });
}

function chunkFill(chunk: TheoryBiomeChunkV1, seed: string): string {
  const base = BAND_COLORS[chunk.dominantScaleBand];
  const noise = biomeNoise2D(seed, chunk.chunkX * 0.65, chunk.chunkY * 0.65, 3);
  const alphaBoost = Math.min(0.2, chunk.averageClaimPressure * 0.16 + noise * 0.08);
  return base.replace(/0\.\d+\)$/, `${(0.22 + alphaBoost).toFixed(2)})`);
}

function badgeAtlasBlockId(badge: TheoryBadgeV1): PhysicsAtlasBlockId | null {
  const direct = PHYSICS_ATLAS_BLOCKS.find((block: PhysicsAtlasBlockV1) =>
    block.primaryBadgeIds.includes(badge.id) || block.claimBoundaryBadgeIds.includes(badge.id),
  );
  if (direct) return direct.id;
  const badgeTokens = new Set([
    ...badge.subjects,
    ...badge.tags,
    ...badge.simulationOwners,
    ...badge.equationFamilies,
    ...badge.hintKeys.subjects,
    ...badge.hintKeys.simulationOwners,
    ...badge.hintKeys.equationFamilies,
  ]);
  return (
    PHYSICS_ATLAS_BLOCKS.find((block: PhysicsAtlasBlockV1) =>
      [...block.subjects, ...block.simulationOwners, ...block.equationFamilies].some((token) => badgeTokens.has(token)),
    )?.id ?? null
  );
}

function badgeGlyph(badge: TheoryBadgeV1): string {
  if (badge.subjects.includes("uncertainty")) return "u";
  if (badge.subjects.includes("curvature") || badge.subjects.includes("collapse")) return "K";
  if (badge.subjects.includes("galactic") || badge.subjects.includes("rotation_curve")) return "◎";
  if (badge.subjects.includes("relative_velocity")) return "v";
  if (badge.id.includes("halpha") || badge.subjects.includes("halpha")) return "Hα";
  if (badge.subjects.includes("zeeman") || badge.subjects.includes("magnetism") || badge.id.includes("zeeman")) return "B";
  if (badge.subjects.includes("doppler") || badge.subjects.includes("redshift")) return "z";
  if (badge.subjects.includes("spectrum") || badge.subjects.includes("wavelength") || badge.subjects.includes("radiation")) return "λ";
  if (badge.subjects.includes("solar")) return "☀";
  if (badge.subjects.includes("quantum")) return "h";
  if (badge.subjects.includes("relativity")) return "c";
  if (badge.subjects.includes("energy")) return "E";
  if (badge.subjects.includes("stress_energy")) return "T";
  if (badge.subjects.includes("general_relativity")) return "G";
  if (badge.subjects.includes("qei")) return "Q";
  if (badge.subjects.includes("starsim")) return "*";
  if (badge.subjects.includes("cosmic_distance")) return "z";
  if (badge.subjects.includes("nhm2")) return "N";
  if (badge.level === "claim_boundary") return "!";
  return "S";
}

function toPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return [`M ${first.x} ${first.y}`, ...rest.map((point: { x: number; y: number }) => `L ${point.x} ${point.y}`)].join(" ");
}

function primaryExpression(badge: TheoryBadgeV1): string | null {
  return (
    badge.calculatorPayloads[0]?.displayLatex ??
    badge.equations.find((equation: TheoryBadgeEquationV1) => Boolean(equation.displayLatex))?.displayLatex ??
    null
  );
}

function badgeTooltipId(badgeId: string): string {
  return `theory-badge-tooltip-${badgeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function isContextEdge(edge: TheoryAchievementLayoutEdge): boolean {
  return edge.relation === "shares_units" || edge.relation === "documents" || edge.relation === "blocks";
}

function edgeDashArray(edge: TheoryAchievementLayoutEdge): string | undefined {
  if (edge.relation === "blocks") return "4 5";
  if (edge.scaleDistanceKind === "cross_scale") return "9 8";
  if (isContextEdge(edge)) return "5 7";
  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fitClassLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function interactiveTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function softRegionGeometry(
  region: TheoryAchievementMapProps["softRegions"][number],
  nodesById: Map<string, TheoryAchievementLayoutNode>,
) {
  const centers = region.badgeIds
    .map((badgeId) => nodesById.get(badgeId))
    .filter((node): node is TheoryAchievementLayoutNode => Boolean(node))
    .map((node) => ({ x: node.x + 22, y: node.y + 22 }));
  if (centers.length === 0) return null;

  if (centers.length === 1) {
    const [center] = centers;
    return {
      cx: center.x,
      cy: center.y,
      rx: 88,
      ry: 88,
      labelX: center.x - 78,
      labelY: center.y - 92,
    };
  }

  const xs = centers.map((center) => center.x);
  const ys = centers.map((center) => center.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = 88;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = Math.max(88, (maxX - minX) / 2 + padding);
  const ry = Math.max(88, (maxY - minY) / 2 + padding);
  return {
    cx,
    cy,
    rx,
    ry,
    labelX: cx - rx + 14,
    labelY: cy - ry - 10,
  };
}

export default function TheoryAchievementMap({
  graph,
  selectedBadgeId,
  selectedBadgeIds,
  highlightedBadgeIds,
  highlightedEdgeIds,
  traceBadgeIds,
  connectableBadgeIds,
  exactBadgeIds,
  likelyBadgeIds,
  softRegions,
  playbackBadgeIds,
  solvedBadgeIds,
  failedBadgeIds,
  rippleBadgeIds,
  heatByBadgeId,
  translateText,
  probabilityTerrain,
  frontierTrace = null,
  routeBadgeLabels = {},
  activeAtlasLensId,
  onSelectBadge,
  onClearSelection,
  onRunPath,
  onLoadCalculatorPayload,
  viewport,
  onViewportChange,
}: TheoryAchievementMapProps) {
  const tx = translateText ?? ((text: string) => text);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef(false);
  const pendingZoomRef = useRef<{ center: { x: number; y: number }; zoom: number } | null>(null);
  const suppressNextScrollRef = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [displayViewport, setDisplayViewport] = useState(viewport);
  const [hoveredBadgeId, setHoveredBadgeId] = useState<string | null>(null);
  const [focusedBadgeId, setFocusedBadgeId] = useState<string | null>(null);
  const wordmarkFontSize = chunkWatermarkFontSize(zoom);
  const popupScreenScale = badgePopupScreenScale(zoom);
  const layout = useMemo(() => layoutTheoryAchievementMap(graph), [graph]);
  const frontierOverlay = useMemo(
    () => (frontierTrace ? buildTheoryFrontierMapOverlay({ trace: frontierTrace, nodes: layout.nodes }) : null),
    [frontierTrace, layout.nodes],
  );
  const nodesById = useMemo(
    () => new Map<string, TheoryAchievementLayoutNode>(layout.nodes.map((node) => [node.badgeId, node])),
    [layout.nodes],
  );
  const badgesById = useMemo(
    () => new Map<string, TheoryBadgeV1>(graph.badges.map((badge: TheoryBadgeV1) => [badge.id, badge])),
    [graph.badges],
  );
  const inspectedBadgeId = hoveredBadgeId ?? focusedBadgeId ?? selectedBadgeId;
  const inspectedNode = inspectedBadgeId ? nodesById.get(inspectedBadgeId) ?? null : null;
  const inspectedBadge = inspectedBadgeId ? badgesById.get(inspectedBadgeId) ?? null : null;
  const inspectedExpression = inspectedBadge ? primaryExpression(inspectedBadge) : null;
  const effectiveViewportWidth = viewportSize.width || 640;
  const effectiveViewportHeight = viewportSize.height || 480;
  const maxPopupScaleForViewport = Math.max(
    0.7,
    (effectiveViewportWidth - BADGE_POPUP_VIEWPORT_MARGIN_PX * 2) / BADGE_POPUP_BASE_WIDTH_PX,
  );
  const renderedPopupScale = Math.min(popupScreenScale, maxPopupScaleForViewport);
  const inspectedNodeCenterX = inspectedNode
    ? inspectedNode.x * zoom - displayViewport.scrollLeft + (THEORY_BIOME_LAYOUT_SPACING_CONTRACT_V1.badgeSizePx * zoom) / 2
    : 0;
  const inspectedNodeTopY = inspectedNode ? inspectedNode.y * zoom - displayViewport.scrollTop : 0;
  const popupHalfWidth = (BADGE_POPUP_BASE_WIDTH_PX * renderedPopupScale) / 2;
  const popupCenterX = clamp(
    inspectedNodeCenterX,
    BADGE_POPUP_VIEWPORT_MARGIN_PX + popupHalfWidth,
    Math.max(
      BADGE_POPUP_VIEWPORT_MARGIN_PX + popupHalfWidth,
      effectiveViewportWidth - BADGE_POPUP_VIEWPORT_MARGIN_PX - popupHalfWidth,
    ),
  );
  const popupBelowY = inspectedNodeTopY + THEORY_BIOME_LAYOUT_SPACING_CONTRACT_V1.badgeSizePx * zoom + 10;
  const popupAbove =
    popupBelowY + BADGE_POPUP_ESTIMATED_HEIGHT_PX * renderedPopupScale >
      effectiveViewportHeight - BADGE_POPUP_VIEWPORT_MARGIN_PX &&
    inspectedNodeTopY > BADGE_POPUP_ESTIMATED_HEIGHT_PX * renderedPopupScale + BADGE_POPUP_VIEWPORT_MARGIN_PX;
  const popupAnchorY = popupAbove ? inspectedNodeTopY - 10 : popupBelowY;
  const selectedSet = new Set(selectedBadgeIds);
  const traceBadgeSet = new Set(traceBadgeIds);
  const backendOverlaySet = new Set(highlightedBadgeIds);
  const edgeHighlightSet = new Set(highlightedEdgeIds);
  const connectableSet = new Set(connectableBadgeIds);
  const exactBadgeSet = new Set(exactBadgeIds);
  const likelyBadgeSet = new Set(likelyBadgeIds);
  const playbackSet = new Set(playbackBadgeIds);
  const solvedSet = new Set(solvedBadgeIds);
  const failedSet = new Set(failedBadgeIds);
  const rippleSet = new Set(rippleBadgeIds);
  const manualSelectionActive = selectedSet.size > 0 || Boolean(selectedBadgeId);
  const activeAtlasBlock = activeAtlasLensId
    ? PHYSICS_ATLAS_BLOCKS.find((block: PhysicsAtlasBlockV1) => block.id === activeAtlasLensId) ?? null
    : null;
  const activeAtlasGlow = activeAtlasLensId ? ATLAS_GLOW_COLORS[activeAtlasLensId] : null;
  const zoomBounds = useMemo(() => {
    const fitZoom = viewportSize.width > 0 && viewportSize.height > 0
      ? Math.min(1, viewportSize.width / layout.width, viewportSize.height / layout.height)
      : MIN_ZOOM_FLOOR;
    return {
      min: clamp(fitZoom, MIN_ZOOM_FLOOR, 1),
      max: MAX_ZOOM,
    };
  }, [layout.height, layout.width, viewportSize.height, viewportSize.width]);

  const centerScrollOnGraphPoint = useCallback((center: { x: number; y: number }, nextZoom: number) => {
    const element = viewportRef.current;
    if (!element) return;
    suppressNextScrollRef.current = true;
    element.scrollLeft = Math.max(0, center.x * nextZoom - element.clientWidth / 2);
    element.scrollTop = Math.max(0, center.y * nextZoom - element.clientHeight / 2);
    setDisplayViewport({ scrollLeft: element.scrollLeft, scrollTop: element.scrollTop });
  }, []);

  const graphCenterForViewport = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return { x: layout.width / 2, y: layout.height / 2 };
    return {
      x: (element.scrollLeft + element.clientWidth / 2) / zoom,
      y: (element.scrollTop + element.clientHeight / 2) / zoom,
    };
  }, [layout.height, layout.width, zoom]);

  const setZoomAroundViewportCenter = useCallback(
    (targetZoom: number) => {
      const startZoom = zoom;
      const nextZoom = Number(clamp(targetZoom, zoomBounds.min, zoomBounds.max).toFixed(4));
      if (Math.abs(nextZoom - startZoom) < 0.001) return;
      const center = graphCenterForViewport();
      pendingZoomRef.current = { center, zoom: nextZoom };
      setZoom(nextZoom);
    },
    [graphCenterForViewport, zoom, zoomBounds.max, zoomBounds.min],
  );

  const zoomIn = useCallback(() => {
    setZoomAroundViewportCenter(zoom * ZOOM_BURST_FACTOR);
  }, [setZoomAroundViewportCenter, zoom]);

  const zoomOut = useCallback(() => {
    setZoomAroundViewportCenter(zoom / ZOOM_BURST_FACTOR);
  }, [setZoomAroundViewportCenter, zoom]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || restoredRef.current) return;
    element.scrollLeft = viewport.scrollLeft;
    element.scrollTop = viewport.scrollTop;
    setDisplayViewport(viewport);
    restoredRef.current = true;
  }, [layout.height, layout.width, viewport.scrollLeft, viewport.scrollTop]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const updateSize = () => {
      setViewportSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const pending = pendingZoomRef.current;
    if (!pending || Math.abs(pending.zoom - zoom) > 0.001) return;
    pendingZoomRef.current = null;
    centerScrollOnGraphPoint(pending.center, zoom);
  }, [centerScrollOnGraphPoint, zoom]);

  useEffect(() => {
    setZoom((current) => clamp(current, zoomBounds.min, zoomBounds.max));
  }, [zoomBounds.max, zoomBounds.min]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || interactiveTextTarget(event.target)) return;
      if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") {
        event.preventDefault();
        zoomOut();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomIn, zoomOut]);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden border border-zinc-950 bg-zinc-900">
      <div
        ref={viewportRef}
        data-testid="theory-achievement-map-scrollport"
        data-zoom-level={zoom.toFixed(4)}
        className="h-full min-h-0 w-full overflow-scroll"
        style={{ scrollbarGutter: "stable both-edges" }}
        onScroll={(event: React.UIEvent<HTMLDivElement>) => {
          const element = event.currentTarget;
          setDisplayViewport({
            scrollLeft: element.scrollLeft,
            scrollTop: element.scrollTop,
          });
          if (suppressNextScrollRef.current) {
            suppressNextScrollRef.current = false;
            return;
          }
          onViewportChange({
            scrollLeft: element.scrollLeft,
            scrollTop: element.scrollTop,
          });
        }}
      >
        <div data-helix-control-id="workstation.panel.theory-badge-graph.theory-achievement-map.event-react-mouse-event-htmldiv-element-if-event-target-event-current-ta" data-helix-interaction-kind="navigate" data-helix-authority-state="client_local"
          className="relative"
          onClick={(event: React.MouseEvent<HTMLDivElement>) => {
            if (event.target === event.currentTarget) onClearSelection();
          }}
          style={{
            width: layout.width * zoom,
            height: layout.height * zoom,
          }}
        >
          <div data-helix-control-id="workstation.panel.theory-badge-graph.theory-achievement-map.event-react-mouse-event-htmldiv-element-if-event-target-event-current-ta.2" data-helix-interaction-kind="navigate" data-helix-authority-state="client_local"
            className="relative"
            onClick={(event: React.MouseEvent<HTMLDivElement>) => {
              if (event.target === event.currentTarget) onClearSelection();
            }}
            style={{
              width: layout.width,
              height: layout.height,
              backgroundColor: "#111827",
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            {layout.biome ? (
              <svg
                className="pointer-events-none absolute inset-0"
                data-testid="theory-biome-terrain"
                width={layout.width}
                height={layout.height}
              >
              <defs>
                <linearGradient id="theory-biome-scale-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#1e293b" />
                  <stop offset="15%" stopColor="#1d4ed8" />
                  <stop offset="36%" stopColor="#166534" />
                  <stop offset="55%" stopColor="#a16207" />
                  <stop offset="75%" stopColor="#c2410c" />
                  <stop offset="100%" stopColor="#581c87" />
                </linearGradient>
                <pattern id="theory-biome-grid" width="64" height="64" patternUnits="userSpaceOnUse">
                  <path d="M 64 0 L 0 0 0 64" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                </pattern>
                {layout.biome.chunks.map((chunk: TheoryBiomeChunkV1) => (
                  <clipPath key={chunk.id} id={chunkWordmarkClipId(chunk)}>
                    <rect
                      x={chunk.bounds.x0 + 8}
                      y={chunk.bounds.y0 + 8}
                      width={Math.max(0, chunk.bounds.x1 - chunk.bounds.x0 - 16)}
                      height={Math.max(0, chunk.bounds.y1 - chunk.bounds.y0 - 16)}
                    />
                  </clipPath>
                ))}
              </defs>
              <rect width={layout.width} height={layout.height} fill="url(#theory-biome-scale-gradient)" opacity={0.24} />
              {THEORY_BIOME_BAND_ORDER.map((band: TheoryBiomeBand, index: number) => {
                const x = BIOME_X_OFFSET + index * BIOME_BAND_WIDTH;
                return (
                  <g key={band}>
                    <rect
                      x={x}
                      y={0}
                      width={BIOME_BAND_WIDTH}
                      height={layout.height}
                      fill={BAND_COLORS[band]}
                      opacity={band === "claim_boundary" ? 0.48 : 0.32}
                    />
                    <line x1={x} x2={x} y1={0} y2={layout.height} stroke="rgba(255,255,255,0.09)" />
                    <text
                      x={x + 18}
                      y={28}
                      fill="rgba(241,245,249,0.78)"
                      fontSize={12}
                      fontWeight={800}
                      letterSpacing={0}
                    >
                      {tx(BAND_LABELS[band])}
                    </text>
                  </g>
                );
              })}
              {layout.biome.chunks.map((chunk: TheoryBiomeChunkV1) => {
                const width = chunk.bounds.x1 - chunk.bounds.x0;
                const height = chunk.bounds.y1 - chunk.bounds.y0;
                return (
                  <g key={chunk.id}>
                    <rect
                      x={chunk.bounds.x0}
                      y={chunk.bounds.y0}
                      width={width}
                      height={height}
                      fill={chunkFill(chunk, layout.biome?.seed ?? "theory-biome")}
                      stroke={chunk.averageClaimPressure > 0.7 ? "rgba(251,191,36,0.32)" : "rgba(255,255,255,0.07)"}
                      strokeWidth={chunk.averageClaimPressure > 0.7 ? 2 : 1}
                      strokeDasharray={chunk.averageClaimPressure > 0.7 ? "10 7" : undefined}
                    />
                    {chunk.badgeIds.length > 3 ? (
                      <text
                        x={chunk.bounds.x0 + 14}
                        y={chunk.bounds.y0 + 26}
                        fill="rgba(226,232,240,0.5)"
                        fontSize={11}
                        fontWeight={700}
                        letterSpacing={0}
                      >
                        {tx(DOMAIN_LABELS[chunk.dominantDomainKey] ?? labelizeBiomeToken(chunk.dominantDomainKey))} / {chunk.badgeIds.length}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              <g data-testid="theory-biome-cell-wordmarks" aria-hidden="true">
                {layout.biome.chunks.map((chunk: TheoryBiomeChunkV1) => {
                  const label = chunkWatermarkLabel(chunk, tx);
                  return (
                    <g key={`${chunk.id}:wordmarks`} clipPath={`url(#${chunkWordmarkClipId(chunk)})`}>
                      {chunkWatermarkTiles(chunk, label, wordmarkFontSize).map((tile) => (
                        <text
                          key={tile.id}
                          data-testid="theory-biome-cell-wordmark"
                          data-biome-band={chunk.dominantScaleBand}
                          data-domain-key={chunk.dominantDomainKey}
                          data-font-size={wordmarkFontSize}
                          x={tile.x}
                          y={tile.y}
                          fill="rgba(226,232,240,0.2)"
                          fontSize={wordmarkFontSize}
                          fontWeight={900}
                          letterSpacing={0}
                          style={{ textTransform: "uppercase" }}
                          transform={`rotate(-35 ${tile.x} ${tile.y})`}
                        >
                          {label}
                        </text>
                      ))}
                    </g>
                  );
                })}
              </g>
              <rect width={layout.width} height={layout.height} fill="url(#theory-biome-grid)" opacity={0.74} />
              </svg>
            ) : null}
            <ProbabilityTerrainOverlay
              terrain={probabilityTerrain}
              nodes={layout.nodes.map((node: TheoryAchievementLayoutNode) => ({
                id: node.badgeId,
                x: node.x,
                y: node.y,
                width: 44,
                height: 44,
                renderChunkId: node.renderChunkId,
                semanticChunkId: node.semanticChunkId,
              }))}
              chunks={
                layout.biome?.chunks.map((chunk: TheoryBiomeChunkV1) => ({
                  id: chunk.id,
                  bounds: chunk.bounds,
                })) ?? []
              }
              width={layout.width}
              height={layout.height}
              seed={layout.biome?.seed ?? graph.graphId}
              testId="theory-probability-terrain-field"
            />
            {frontierOverlay ? (
              <svg
                aria-label={tx("Theory Seed Atlas frontier diagnostics")}
                className="pointer-events-none absolute inset-0"
                data-testid="theory-seed-atlas-overlay"
                data-overall-fit-class={frontierOverlay.diagnostics.overallFitClass}
                data-replay-graph-hash={frontierOverlay.replay.graphHash}
                data-replay-query={frontierOverlay.replay.query}
                data-replay-search-seed={frontierOverlay.replay.searchSeed}
                data-replay-basis-version={frontierOverlay.replay.basisVersion}
                data-replay-scoring-version={frontierOverlay.replay.scoringVersion}
                data-replay-taxonomy-version={frontierOverlay.replay.taxonomyVersion}
                data-replay-evidence-reference-count={frontierOverlay.replay.evidenceReferenceCount}
                width={layout.width}
                height={layout.height}
              >
                <defs>
                  <pattern
                    id="theory-seed-atlas-hatch"
                    width="10"
                    height="10"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(35)"
                  >
                    <line x1="0" x2="0" y1="0" y2="10" stroke="rgba(226,232,240,0.28)" strokeWidth="2" />
                  </pattern>
                  <marker id="theory-seed-atlas-arrow" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
                    <path d="M 0 0 L 7 3.5 L 0 7 z" fill="rgba(226,232,240,0.72)" />
                  </marker>
                </defs>
                {frontierOverlay.candidateRegions.map((region: TheoryFrontierMapCandidateRegion) => (
                  <ellipse
                    key={`${region.id}:entropy`}
                    data-testid="theory-seed-atlas-entropy"
                    cx={region.x}
                    cy={region.y}
                    rx={region.rx * (1.12 + region.entropyRoughness * 0.28)}
                    ry={region.ry * (1.08 + region.entropyRoughness * 0.22)}
                    fill="none"
                    stroke="rgba(226,232,240,0.22)"
                    strokeWidth={1.4 + region.entropyRoughness * 1.2}
                    strokeDasharray="2 12"
                    opacity={0.24 + region.entropyRoughness * 0.44}
                  />
                ))}
                {frontierOverlay.candidateRegions.map((region: TheoryFrontierMapCandidateRegion) => (
                  <ellipse
                    key={`${region.id}:certainty`}
                    data-testid="theory-seed-atlas-certainty"
                    cx={region.x}
                    cy={region.y}
                    rx={region.rx * (0.86 + region.certainty * 0.12)}
                    ry={region.ry * (0.84 + region.certainty * 0.12)}
                    fill={region.fill}
                    opacity={0.18 + region.certainty * 0.36}
                  />
                ))}
                {frontierOverlay.candidateRegions.map((region: TheoryFrontierMapCandidateRegion) => (
                      <g
                        key={region.id}
                        data-testid="theory-seed-atlas-candidate"
                        data-fit-class={region.fitClass}
                      >
                        <title>
                          {[
                            tx(fitClassLabel(region.fitClass)),
                            `${tx("fit")} ${region.certainty.toFixed(2)}`,
                            `${tx("congruence")} ${region.localCongruence.toFixed(2)}`,
                            `${tx("evidence")} ${region.evidenceReadiness.toFixed(2)}`,
                            ...region.missingStructureHints.slice(0, 3).map((hint: string) => tx(hint)),
                          ].join(" | ")}
                        </title>
                        <ellipse
                          cx={region.x}
                          cy={region.y}
                          rx={region.rx}
                          ry={region.ry}
                          fill={region.fill}
                          stroke={region.stroke}
                          strokeWidth={region.strokeWidth}
                          strokeDasharray={region.strokeDasharray}
                          opacity={region.opacity}
                        />
                        {region.hatch ? (
                          <ellipse
                            cx={region.x}
                            cy={region.y}
                            rx={region.rx * 0.96}
                            ry={region.ry * 0.92}
                            fill="url(#theory-seed-atlas-hatch)"
                            opacity={0.5}
                          />
                        ) : null}
                        {Array.from({ length: region.contourCount }).map((_: unknown, index: number) => {
                          const contourScale = 0.58 + index * 0.14;
                          return (
                            <ellipse
                              key={`${region.id}:contour:${index}`}
                              cx={region.x}
                              cy={region.y}
                              rx={region.rx * contourScale}
                              ry={region.ry * contourScale}
                              fill="none"
                              stroke={region.stroke}
                              strokeWidth={1}
                              strokeOpacity={0.2 + region.localCongruence * 0.22}
                            />
                          );
                        })}
                        <text
                          x={region.labelX}
                          y={region.labelY}
                          fill="rgba(241,245,249,0.86)"
                          fontSize={11}
                          fontWeight={800}
                          letterSpacing={0}
                        >
                          {tx(fitClassLabel(region.fitClass))}
                        </text>
                      </g>
                    ))}
                {frontierOverlay.candidateRegions.map((region: TheoryFrontierMapCandidateRegion) => (
                  <ellipse
                    key={`${region.id}:claim-pressure`}
                    data-testid="theory-seed-atlas-claim-pressure"
                    cx={region.x}
                    cy={region.y}
                    rx={region.rx * 1.04}
                    ry={region.ry * 1.02}
                    fill="none"
                    stroke="rgba(251,191,36,0.74)"
                    strokeWidth={1.2 + region.claimPressure * 2.6}
                    strokeDasharray="12 9"
                    opacity={0.1 + region.claimPressure * 0.56}
                  />
                ))}
                {frontierOverlay.tensorPaths.map((path: TheoryFrontierMapTensorPath) => (
                      <path
                        key={path.id}
                        data-testid="theory-seed-atlas-tensor-path"
                        d={path.path}
                        fill="none"
                        stroke={path.stroke}
                        strokeWidth={path.strokeWidth}
                        strokeDasharray={path.strokeDasharray}
                        strokeOpacity={path.opacity}
                        strokeLinecap="round"
                        markerEnd="url(#theory-seed-atlas-arrow)"
                      >
                        <title>
                          {[
                            tx(path.relation),
                            tx(path.transformKind),
                            `${path.fromBadgeId} -> ${path.toBadgeId}`,
                          ].join(" | ")}
                        </title>
                      </path>
                    ))}
                <text
                  x={18}
                  y={layout.height - 38}
                  fill="rgba(226,232,240,0.54)"
                  fontSize={11}
                  fontWeight={700}
                  letterSpacing={0}
                >
                  {tx("Seed Atlas")} / {tx(fitClassLabel(frontierOverlay.diagnostics.overallFitClass))} / {tx("candidates")}{" "}
                  {frontierOverlay.candidateRegions.length} / {tx("evidence refs")}{" "}
                  {frontierOverlay.replay.evidenceReferenceCount}
                </text>
                <text
                  x={18}
                  y={layout.height - 20}
                  fill="rgba(226,232,240,0.42)"
                  fontSize={10}
                  fontWeight={700}
                  letterSpacing={0}
                >
                  {frontierOverlay.replay.graphHash} / {frontierOverlay.replay.searchSeed}
                </text>
              </svg>
            ) : null}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(255,255,255,0.08),transparent_36%),radial-gradient(circle_at_50%_82%,rgba(0,0,0,0.48),transparent_42%)]" />
            <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height}>
            <defs>
              <marker id="theory-achievement-arrow" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
                <path d="M 0 0 L 7 3.5 L 0 7 z" fill="rgb(161 161 170)" />
              </marker>
            </defs>
            {softRegions.map((region) => {
              const geometry = softRegionGeometry(region, nodesById);
              if (!geometry) return null;
              const alpha = Math.max(0.12, Math.min(0.22, 0.12 + region.confidence * 0.1));
              return (
                <g
                  key={region.id}
                  data-testid="discussion-soft-region"
                  aria-label={tx("Discussion context zone, not proof")}
                >
                  <title>{tx("Discussion context zone, not proof")}</title>
                  <ellipse
                    cx={geometry.cx}
                    cy={geometry.cy}
                    rx={geometry.rx}
                    ry={geometry.ry}
                    fill={`rgba(22, 163, 74, ${alpha})`}
                    stroke="rgba(74, 222, 128, 0.45)"
                    strokeWidth={2}
                    strokeDasharray="10 8"
                  />
                  <text
                    x={geometry.labelX}
                    y={geometry.labelY}
                    fill="rgba(187, 247, 208, 0.86)"
                    fontSize={12}
                    fontWeight={700}
                    letterSpacing={0}
                  >
                    {tx(region.label)}
                  </text>
                </g>
              );
            })}
            {layout.edges
              .map((edge: TheoryAchievementLayoutEdge) => ({
                edge,
                visualState: resolveTheoryBadgeEdgeVisualState({ edge, traceEdgeIds: edgeHighlightSet }),
              }))
              .filter(({ visualState }) => visualState.tracePath)
              .map(({ edge, visualState }) => (
                <path
                  key={edge.edgeId}
                  data-testid="theory-badge-connection-edge"
                  data-edge-visual-state="tracePath"
                  d={toPath(edge.points)}
                  className={theoryBadgeEdgeClass(visualState)}
                  strokeWidth={visualState.tracePath ? 3 : 2}
                  strokeDasharray={edgeDashArray(edge)}
                  fill="none"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                  markerEnd={visualState.context ? undefined : "url(#theory-achievement-arrow)"}
                />
              ))}
            </svg>
            {layout.nodes.map((node: TheoryAchievementLayoutNode) => {
            const badge = badgesById.get(node.badgeId);
            if (!badge) return null;
            const routeLabel = routeBadgeLabels[node.badgeId] ?? null;
            const tooltipId = badgeTooltipId(node.badgeId);
            const badgeBlockId = badgeAtlasBlockId(badge);
            const plannedDomain = Boolean(
              activeAtlasBlock?.status === "planned" && badgeBlockId === activeAtlasBlock.id,
            );
            const visualState = resolveTheoryBadgeVisualState({
              badge,
              badgeId: node.badgeId,
              selectedBadgeId,
              selectedBadgeIds: selectedSet,
              traceBadgeIds: traceBadgeSet,
              connectableBadgeIds: connectableSet,
              manualSelectionActive,
              playbackBadgeIds: playbackSet,
              solvedBadgeIds: solvedSet,
              failedBadgeIds: failedSet,
              rippleBadgeIds: rippleSet,
              heatByBadgeId,
              atlasHighlightedBadgeIds: backendOverlaySet,
              exactBadgeIds: exactBadgeSet,
              likelyBadgeIds: likelyBadgeSet,
              plannedDomain,
              routeBlocked: routeLabel?.tone === "rose",
            });
            return (
              <button data-helix-control-id="workstation.panel.theory-badge-graph.theory-achievement-map.event-react-mouse-event-htmlbutton-element-event-stop-propagation-if-vis" data-helix-interaction-kind="navigate" data-helix-authority-state="client_local"
                key={node.badgeId}
                type="button"
                className={`${theoryBadgeButtonClass(visualState)} group`}
                data-badge-visual-state={
                  visualState.selectedNoPath
                    ? "noPath"
                    : visualState.selected
                      ? "selected"
                      : visualState.intermediate
                        ? "intermediate"
                        : visualState.connectable
                          ? "connectable"
                          : visualState.unavailable
                            ? "unavailable"
                            : visualState.backendOverlay
                              ? "backendOverlay"
                              : visualState.boundaryContext
                                ? "boundaryContext"
                                : undefined
                }
                data-discussion-match={
                  exactBadgeSet.has(node.badgeId)
                    ? "exact"
                    : likelyBadgeSet.has(node.badgeId)
                      ? "likely"
                      : undefined
                }
                style={{
                  left: node.x,
                  top: node.y,
                  boxShadow: theoryBadgeGlowShadow(visualState, activeAtlasGlow),
                }}
                aria-label={tx(badge.title)}
                aria-describedby={tooltipId}
                disabled={visualState.unavailable}
                onMouseEnter={() => setHoveredBadgeId(node.badgeId)}
                onMouseLeave={() => setHoveredBadgeId((current) => (current === node.badgeId ? null : current))}
                onFocus={() => setFocusedBadgeId(node.badgeId)}
                onBlur={() => setFocusedBadgeId((current) => (current === node.badgeId ? null : current))}
                onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  if (visualState.unavailable) return;
                  onSelectBadge(node.badgeId);
                  const payload = badge.calculatorPayloads[0];
                  if (payload) onLoadCalculatorPayload(node.badgeId, payload.id);
                }}
                onDoubleClick={() => onRunPath(node.badgeId)}
              >
                <span className="flex h-7 w-7 items-center justify-center border border-zinc-700 bg-zinc-300 shadow-inner">
                  {badgeGlyph(badge)}
                </span>
                {badge.calculatorPayloads.length > 0 ? (
                  <span className="absolute -right-1 -top-1 h-3 w-3 border border-cyan-100 bg-cyan-400" />
                ) : null}
                {visualState.ripple ? (
                  <span className="pointer-events-none absolute -inset-2 border border-cyan-200/80" />
                ) : null}
                {visualState.foundation && !manualSelectionActive ? (
                  <span className="pointer-events-none absolute -inset-1 border border-zinc-100/30" />
                ) : null}
                {visualState.claimBoundary ? (
                  <span className="pointer-events-none absolute -inset-1.5 border-2 border-amber-300/80" />
                ) : null}
              </button>
            );
            })}
          </div>
        </div>
      </div>
      {inspectedBadge && inspectedNode ? (
        <div
          id={badgeTooltipId(inspectedBadge.id)}
          role="tooltip"
          data-testid="theory-badge-tooltip"
          data-popup-scale={renderedPopupScale.toFixed(4)}
          data-popup-screen-scale={renderedPopupScale.toFixed(4)}
          data-popup-placement={popupAbove ? "above" : "below"}
          className="pointer-events-none absolute z-30 grid w-60 gap-1 border border-slate-500 bg-slate-950 px-3 py-2 text-left normal-case text-slate-100 shadow-xl"
          style={{
            left: popupCenterX,
            top: popupAnchorY,
            transform: popupAbove
              ? `translate(-50%, -100%) scale(${renderedPopupScale})`
              : `translateX(-50%) scale(${renderedPopupScale})`,
            transformOrigin: popupAbove ? "bottom center" : "top center",
          }}
        >
          <span className="text-xs font-semibold leading-snug text-slate-50">{tx(inspectedBadge.title)}</span>
          {inspectedExpression ? (
            <span className="font-mono text-[11px] font-medium leading-snug text-cyan-100">{inspectedExpression}</span>
          ) : null}
        </div>
      ) : null}
      <div
        className="pointer-events-auto absolute bottom-4 right-4 z-20 grid gap-2"
        aria-label={tx("Theory badge graph zoom controls")}
      >
        <button data-helix-control-id="workstation.panel.theory-badge-graph.theory-achievement-map.button" data-helix-interaction-kind="navigate" data-helix-authority-state="client_local"
          type="button"
          aria-label={tx("Zoom in")}
          title={tx("Zoom in (+)")}
          onClick={zoomIn}
          disabled={zoom >= zoomBounds.max - 0.001}
          className="flex h-10 w-10 items-center justify-center border border-zinc-500 bg-zinc-950/90 text-2xl font-semibold leading-none text-zinc-100 shadow-lg transition hover:border-cyan-300 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          +
        </button>
        <button data-helix-control-id="workstation.panel.theory-badge-graph.theory-achievement-map.button.2" data-helix-interaction-kind="navigate" data-helix-authority-state="client_local"
          type="button"
          aria-label={tx("Zoom out")}
          title={tx("Zoom out (-)")}
          onClick={zoomOut}
          disabled={zoom <= zoomBounds.min + 0.001}
          className="flex h-10 w-10 items-center justify-center border border-zinc-500 bg-zinc-950/90 text-2xl font-semibold leading-none text-zinc-100 shadow-lg transition hover:border-cyan-300 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          -
        </button>
      </div>
    </div>
  );
}
