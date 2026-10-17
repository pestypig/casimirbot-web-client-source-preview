import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import {
  buildPatternRecipe,
  buildWarpPatternInputs,
  type PatternRecipe,
  type WarpPatternInputs as WarpInputs
} from "@/lib/essence/warp-patterns";
import { fetchVectorizerHealth, vectorizeImage, type VectorizeResponse, type VectorizerHealth } from "@/lib/vectorizer-client";
import {
  DESIGN_RECIPE_VERSION,
  type ComplexityBudget,
  type DesignRecipe,
  type NeedleSkipRegion,
  type PreviewHooks,
  validateDesignRecipe
} from "@shared/design-recipe";

type Point = [number, number];

// Semantics for garment-aware edges/joins so the spec can map to knit CAD
type Vec2 = [number, number];
type JoinType = "knit_join" | "linked" | "sewn";
type EdgeKind =
  | "neckline"
  | "hem"
  | "side_seam"
  | "center_front"
  | "center_back"
  | "armhole"
  | "shoulder"
  | "other";

type PieceEdge = {
  id: string;
  fromIndex: number;
  toIndex: number;
  kind: EdgeKind;
};

type FoldLineSpec = {
  id: string;
  points: Vec2[];
};

type PieceJoin = {
  id: string;
  from: { pieceId: string; edgeId: string };
  to: { pieceId: string; edgeId: string };
  joinType: JoinType;
};

type GaugeSpec = {
  machine?: string;
  gaugeNumber?: number;
  walesPerCm?: number;
  coursesPerCm?: number;
};

type BodyAnchorMap = Record<string, Vec2>;

type VestCapeMeasurements = {
  /** Full chest width at armhole level, front or back (cm). */
  chestWidth: number;
  /** Across-neck width at the base (back neck to shoulder) in cm. */
  neckWidth: number;
  /** Vest center-back length from neck to hem (cm). */
  vestBackLength: number;
  /** Cape center-back length from cape neck to cape hem (cm). */
  capeBackLength: number;
  /** Vertical offset of cape neck relative to vest neck (cm). Negative = cape neck slightly higher. */
  capeNeckDrop: number;
};

function buildVestCapeBodyAnchors(m: VestCapeMeasurements): BodyAnchorMap {
  const halfNeck = m.neckWidth / 2;
  const halfChest = m.chestWidth / 2;

  const vestHemY = m.vestBackLength;
  const capeNeckY = m.capeNeckDrop;
  const capeHemY = capeNeckY + m.capeBackLength;

  return {
    // Vest neck + hem
    vest_back_neck: [0, 0],
    vest_front_L_neck: [-halfNeck, 0],
    vest_front_R_neck: [halfNeck, 0],
    vest_back_hem: [0, vestHemY],
    vest_front_L_hem: [-halfChest, vestHemY],
    vest_front_R_hem: [halfChest, vestHemY],

    // Cape neck + hem
    cape_back_neck: [0, capeNeckY],
    cape_front_L_neck: [-halfNeck, capeNeckY],
    cape_front_R_neck: [halfNeck, capeNeckY],
    cape_back_hem: [0, capeHemY],
    cape_front_L_hem: [-halfChest, capeHemY],
    cape_front_R_hem: [halfChest, capeHemY]
  };
}

type Transform2D = {
  rotation: number; // radians
  tx: number;
  ty: number;
};

type AssembledSpec = {
  axisEdgeId: string;
  anchorOnAxis: "start" | "end" | "mid";
  bodyAnchorId: string;
  z?: number;
};

type PatternPiece = {
  id: string;
  label: string;
  polygon: Point[];
  offset: Point;
  stroke?: string;
  dashed?: boolean;
  note?: string;
  group?: "vest" | "cape" | "collar" | "facing";
  role?: "front" | "back" | "collar";
  side?: "left" | "right";
  layer?: number;
  waleDirection?: "up" | "down";
  courseDirection?: "left" | "right";
  foldLines?: FoldLineSpec[];
  edges?: PieceEdge[];
  assembled?: AssembledSpec;
};

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

type PatternStroke = {
  points: Vec2[];
  width: number;
  color: string;
  opacity?: number;
  dash?: string;
};

type VectorizerOutline = {
  pathD: string;
  viewBox: { minX: number; minY: number; width: number; height: number };
};

export type MeanderRuleId = "vine" | "drift" | "filigree" | "ca";

export type MeanderParams = {
  rule: MeanderRuleId;
  seedEdges: string[];
  seedSpacingCm: number;
  stepCm: number;
  maxLengthCm: number;
  bendiness: number;
  noiseScale: number;
  lineThicknessPx: number;
  palette: string[];
  rngSeed: number;
};

type PlacedPiece = PatternPiece & { layoutOffset: Point; bounds: Bounds };

type LookSpec = {
  id: string;
  name: string;
  description?: string;
  units: "cm";
  scalePxPerUnit: number;
  gridEvery?: number;
  marginUnits?: number;
  pieces: PatternPiece[];
  prompt?: string;
  gauge?: GaugeSpec;
  joins?: PieceJoin[];
  bodyAnchors?: BodyAnchorMap;
  measurements?: VestCapeMeasurements;
  meanderDefaults?: MeanderParams;
};

const FALLBACK_MEANDER_PARAMS: MeanderParams = {
  rule: "vine",
  seedEdges: ["neckline", "center_front", "hem"],
  seedSpacingCm: 4.5,
  stepCm: 0.6,
  maxLengthCm: 64,
  bendiness: 0.6,
  noiseScale: 0.18,
  lineThicknessPx: 1.1,
  palette: ["#fbbf24", "#f59e0b", "#fef08a"],
  rngSeed: 1
};

const VEST_CAPE_M_MEASUREMENTS: VestCapeMeasurements = {
  chestWidth: 100,
  neckWidth: 38,
  vestBackLength: 68,
  capeBackLength: 81,
  capeNeckDrop: -2
};

const LOOK_LIBRARY: LookSpec[] = [
  {
    id: "vest_cape_m",
    name: "Vest + Cape Overlay (M)",
    description: "Two-layer sample with semantic edges/joins for knitting handoff.",
    units: "cm",
    scalePxPerUnit: 10,
    gridEvery: 2,
    marginUnits: 10,
    prompt: "Gold vest base with long navy cape overlay; neckline-link join.",
    gauge: {
      machine: "WHOLEGARMENT",
      gaugeNumber: 12,
      walesPerCm: 3,
      coursesPerCm: 4.2
    },
    meanderDefaults: {
      ...FALLBACK_MEANDER_PARAMS,
      seedEdges: ["neckline", "center_front", "hem"],
      palette: ["#fbbf24", "#f59e0b", "#fde68a"],
      rngSeed: 3
    },
    measurements: VEST_CAPE_M_MEASUREMENTS,
    bodyAnchors: buildVestCapeBodyAnchors(VEST_CAPE_M_MEASUREMENTS),
    pieces: [
      {
        id: "vest_front_L",
        label: "Vest Front L",
        group: "vest",
        role: "front",
        side: "left",
        layer: 1,
        polygon: [
          [-1, 2],
          [0, 66],
          [10, 70],
          [26, 72],
          [42, 68],
          [46, 52],
          [46, 18],
          [40, 2]
        ],
        offset: [4, 4],
        note: "Base vest; mirror for right.",
        edges: [
          { id: "center_front", fromIndex: 0, toIndex: 1, kind: "center_front" },
          { id: "hem", fromIndex: 1, toIndex: 4, kind: "hem" },
          { id: "side_seam", fromIndex: 4, toIndex: 6, kind: "side_seam" },
          { id: "shoulder", fromIndex: 6, toIndex: 7, kind: "shoulder" },
          { id: "neckline", fromIndex: 7, toIndex: 0, kind: "neckline" }
        ],
        assembled: {
          axisEdgeId: "center_front",
          anchorOnAxis: "start",
          bodyAnchorId: "vest_front_L_neck",
          z: 1
        }
      },
      {
        id: "vest_front_R",
        label: "Vest Front R",
        group: "vest",
        role: "front",
        side: "right",
        layer: 1,
        polygon: [
          [-1, 2],
          [0, 66],
          [10, 70],
          [26, 72],
          [42, 68],
          [46, 52],
          [46, 18],
          [40, 2]
        ],
        offset: [54, 4],
        edges: [
          { id: "center_front", fromIndex: 0, toIndex: 1, kind: "center_front" },
          { id: "hem", fromIndex: 1, toIndex: 4, kind: "hem" },
          { id: "side_seam", fromIndex: 4, toIndex: 6, kind: "side_seam" },
          { id: "shoulder", fromIndex: 6, toIndex: 7, kind: "shoulder" },
          { id: "neckline", fromIndex: 7, toIndex: 0, kind: "neckline" }
        ],
        assembled: {
          axisEdgeId: "center_front",
          anchorOnAxis: "start",
          bodyAnchorId: "vest_front_R_neck",
          z: 1
        }
      },
      {
        id: "vest_back",
        label: "Vest Back",
        group: "vest",
        role: "back",
        layer: 1,
        polygon: [
          [-2, 2],
          [0, 72],
          [16, 78],
          [46, 80],
          [76, 78],
          [92, 72],
          [94, 10],
          [80, 2],
          [46, -2],
          [10, -1]
        ],
        offset: [8, 82],
        foldLines: [{ id: "center_back", points: [[46, -2], [46, 80]] }],
        edges: [
          { id: "side_left", fromIndex: 0, toIndex: 1, kind: "side_seam" },
          { id: "hem", fromIndex: 1, toIndex: 4, kind: "hem" },
          { id: "side_right", fromIndex: 4, toIndex: 6, kind: "side_seam" },
          { id: "shoulder_R", fromIndex: 6, toIndex: 7, kind: "shoulder" },
          { id: "neckline", fromIndex: 7, toIndex: 9, kind: "neckline" },
          { id: "shoulder_L", fromIndex: 9, toIndex: 0, kind: "shoulder" },
          { id: "center_back", fromIndex: 8, toIndex: 3, kind: "center_back" }
        ],
        assembled: {
          axisEdgeId: "center_back",
          anchorOnAxis: "start",
          bodyAnchorId: "vest_back_neck",
          z: 0
        }
      },
      {
        id: "cape_front_L",
        label: "Cape Front L",
        group: "cape",
        role: "front",
        side: "left",
        layer: 2,
        polygon: [
          [0, 4],
          [0, 46],
          [12, 62],
          [36, 74],
          [70, 80],
          [104, 74],
          [128, 62],
          [140, 46],
          [140, 4],
          [70, -2]
        ],
        offset: [10, 10],
        note: "Overlap 2 cm off CF over vest.",
        edges: [
          { id: "front_edge", fromIndex: 0, toIndex: 1, kind: "center_front" },
          { id: "neckline", fromIndex: 8, toIndex: 0, kind: "neckline" },
          { id: "side_seam", fromIndex: 7, toIndex: 8, kind: "side_seam" },
          { id: "hem", fromIndex: 1, toIndex: 7, kind: "hem" }
        ],
        assembled: {
          axisEdgeId: "front_edge",
          anchorOnAxis: "start",
          bodyAnchorId: "cape_front_L_neck",
          z: 2
        }
      },
      {
        id: "cape_front_R",
        label: "Cape Front R",
        group: "cape",
        role: "front",
        side: "right",
        layer: 2,
        polygon: [
          [0, 4],
          [0, 46],
          [12, 62],
          [36, 74],
          [70, 80],
          [104, 74],
          [128, 62],
          [140, 46],
          [140, 4],
          [70, -2]
        ],
        offset: [170, 10],
        edges: [
          { id: "front_edge", fromIndex: 0, toIndex: 1, kind: "center_front" },
          { id: "neckline", fromIndex: 8, toIndex: 0, kind: "neckline" },
          { id: "side_seam", fromIndex: 7, toIndex: 8, kind: "side_seam" },
          { id: "hem", fromIndex: 1, toIndex: 7, kind: "hem" }
        ],
        assembled: {
          axisEdgeId: "front_edge",
          anchorOnAxis: "start",
          bodyAnchorId: "cape_front_R_neck",
          z: 2
        }
      },
      {
        id: "cape_back",
        label: "Cape Back",
        group: "cape",
        role: "back",
        layer: 2,
        polygon: [
          [0, 4],
          [0, 48],
          [24, 66],
          [70, 81],
          [116, 66],
          [140, 48],
          [140, 4],
          [70, 0]
        ],
        offset: [90, 98],
        foldLines: [{ id: "center_back", points: [[70, 0], [70, 81]] }],
        edges: [
          { id: "side_left", fromIndex: 0, toIndex: 1, kind: "side_seam" },
          { id: "hem", fromIndex: 1, toIndex: 4, kind: "hem" },
          { id: "side_right", fromIndex: 4, toIndex: 6, kind: "side_seam" },
          { id: "neckline_R", fromIndex: 6, toIndex: 7, kind: "neckline" },
          { id: "neckline_L", fromIndex: 7, toIndex: 0, kind: "neckline" },
          { id: "neckline", fromIndex: 6, toIndex: 0, kind: "neckline" },
          { id: "center_back", fromIndex: 7, toIndex: 3, kind: "center_back" }
        ],
        assembled: {
          axisEdgeId: "center_back",
          anchorOnAxis: "start",
          bodyAnchorId: "cape_back_neck",
          z: 1.5
        }
      }
    ],
    joins: [
      // Vest body seams
      {
        id: "vest_shoulder_L",
        from: { pieceId: "vest_front_L", edgeId: "shoulder" },
        to: { pieceId: "vest_back", edgeId: "shoulder_L" },
        joinType: "sewn"
      },
      {
        id: "vest_shoulder_R",
        from: { pieceId: "vest_front_R", edgeId: "shoulder" },
        to: { pieceId: "vest_back", edgeId: "shoulder_R" },
        joinType: "sewn"
      },
      {
        id: "vest_side_L",
        from: { pieceId: "vest_front_L", edgeId: "side_seam" },
        to: { pieceId: "vest_back", edgeId: "side_left" },
        joinType: "sewn"
      },
      {
        id: "vest_side_R",
        from: { pieceId: "vest_front_R", edgeId: "side_seam" },
        to: { pieceId: "vest_back", edgeId: "side_right" },
        joinType: "sewn"
      },
      // Cape assembly
      {
        id: "cape_shoulder_L",
        from: { pieceId: "cape_front_L", edgeId: "neckline" },
        to: { pieceId: "cape_back", edgeId: "neckline_L" },
        joinType: "linked"
      },
      {
        id: "cape_shoulder_R",
        from: { pieceId: "cape_front_R", edgeId: "neckline" },
        to: { pieceId: "cape_back", edgeId: "neckline_R" },
        joinType: "linked"
      },
      // Cape overlay to vest at back neckline
      {
        id: "overlay_back_neck",
        from: { pieceId: "cape_back", edgeId: "neckline" },
        to: { pieceId: "vest_back", edgeId: "neckline" },
        joinType: "linked"
      },
      {
        id: "cape_front_to_vest_front_L",
        from: { pieceId: "cape_front_L", edgeId: "neckline" },
        to: { pieceId: "vest_front_L", edgeId: "neckline" },
        joinType: "linked"
      },
      {
        id: "cape_front_to_vest_front_R",
        from: { pieceId: "cape_front_R", edgeId: "neckline" },
        to: { pieceId: "vest_front_R", edgeId: "neckline" },
        joinType: "linked"
      }
    ]
  },
  {
    id: "cape_jacket_m",
    name: "Cape Jacket - size M",
    description: "Two mirrored fronts, tall back, and a separate standing collar for later texturing.",
    units: "cm",
    scalePxPerUnit: 10,
    gridEvery: 2,
    marginUnits: 8,
    prompt: "Space-baroque cape jacket draft; keep collar apart for metallic trims.",
    meanderDefaults: {
      ...FALLBACK_MEANDER_PARAMS,
      rule: "drift",
      seedEdges: ["center_front", "hem", "neckline"],
      seedSpacingCm: 5.5,
      maxLengthCm: 72,
      lineThicknessPx: 1,
      palette: ["#22d3ee", "#0ea5e9", "#38bdf8"],
      rngSeed: 5
    },
    bodyAnchors: {
      back_neck: [0, 0],
      front_L_neck: [-20, 0],
      front_R_neck: [20, 0]
    },
    pieces: [
      {
        id: "front_left",
        label: "Front L",
        polygon: [
          [-1, 2],
          [0, 66],
          [10, 70],
          [26, 72],
          [42, 68],
          [46, 52],
          [46, 18],
          [40, 2]
        ],
        offset: [8, 8],
        note: "Mirror for right.",
        edges: [
          { id: "center_front", fromIndex: 0, toIndex: 1, kind: "center_front" }
        ],
        assembled: {
          axisEdgeId: "center_front",
          anchorOnAxis: "start",
          bodyAnchorId: "front_L_neck",
          z: 1
        }
      },
      {
        id: "front_right",
        label: "Front R",
        polygon: [
          [-1, 2],
          [0, 66],
          [10, 70],
          [26, 72],
          [42, 68],
          [46, 52],
          [46, 18],
          [40, 2]
        ],
        offset: [58, 8],
        note: "Same draft as L.",
        edges: [
          { id: "center_front", fromIndex: 0, toIndex: 1, kind: "center_front" }
        ],
        assembled: {
          axisEdgeId: "center_front",
          anchorOnAxis: "start",
          bodyAnchorId: "front_R_neck",
          z: 1
        }
      },
      {
        id: "back",
        label: "Back Panel",
        polygon: [
          [-2, 2],
          [0, 72],
          [16, 78],
          [46, 80],
          [76, 78],
          [92, 72],
          [94, 10],
          [80, 2],
          [10, -1]
        ],
        offset: [8, 82],
        note: "Center back seam at x=46.",
        edges: [
          { id: "center_back", fromIndex: 3, toIndex: 8, kind: "center_back" },
          { id: "neckline", fromIndex: 1, toIndex: 5, kind: "neckline" }
        ],
        assembled: {
          axisEdgeId: "center_back",
          anchorOnAxis: "start",
          bodyAnchorId: "back_neck",
          z: 0
        }
      },
      {
        id: "yoke",
        label: "Shoulder Yoke",
        polygon: [
          [0, 2],
          [4, 18],
          [88, 18],
          [92, 2],
          [46, -2]
        ],
        offset: [8, 68],
        stroke: "#c084fc",
        edges: [{ id: "top_edge", fromIndex: 0, toIndex: 3, kind: "shoulder" }],
        assembled: {
          axisEdgeId: "top_edge",
          anchorOnAxis: "mid",
          bodyAnchorId: "back_neck",
          z: 2
        }
      },
      {
        id: "collar",
        label: "Standing Collar",
        polygon: [
          [0, 0],
          [0, 5],
          [38, 5],
          [38, 0]
        ],
        offset: [120, 10],
        stroke: "#f97316",
        note: "Cut 2; allow 1 cm seam."
      }
    ]
  },
  {
    id: "ornate_capelet",
    name: "Ornate Capelet - short shoulder",
    description: "Swept hem, reduced lining, and collar band kept loose for clips/trim.",
    units: "cm",
    scalePxPerUnit: 12,
    gridEvery: 2,
    marginUnits: 10,
    prompt: "Ornate capelet with wide sweep and rolled lining; leave fill empty for later textures.",
    meanderDefaults: {
      ...FALLBACK_MEANDER_PARAMS,
      rule: "filigree",
      seedEdges: ["neckline", "center_back", "hem"],
      seedSpacingCm: 4,
      maxLengthCm: 68,
      lineThicknessPx: 1.2,
      palette: ["#a855f7", "#f472b6", "#fcd34d"],
      rngSeed: 8
    },
    bodyAnchors: {
      cape_back_neck: [0, 0],
      cape_front_L_neck: [-18, 0],
      cape_front_R_neck: [18, 0]
    },
    pieces: [
      {
        id: "capelet_shell",
        label: "Shell",
        polygon: [
          [0, 4],
          [0, 46],
          [12, 62],
          [36, 74],
          [70, 80],
          [104, 74],
          [128, 62],
          [140, 46],
          [140, 4],
          [70, -2]
        ],
        offset: [10, 10],
        note: "Outer sweep; add 2 cm hem.",
        edges: [
          { id: "center_back", fromIndex: 9, toIndex: 4, kind: "center_back" },
          { id: "neckline", fromIndex: 9, toIndex: 4, kind: "neckline" }
        ],
        assembled: {
          axisEdgeId: "center_back",
          anchorOnAxis: "start",
          bodyAnchorId: "cape_back_neck",
          z: 1
        }
      },
      {
        id: "capelet_lining",
        label: "Lining",
        polygon: [
          [0, 4],
          [0, 40],
          [12, 54],
          [36, 62],
          [70, 66],
          [104, 62],
          [128, 54],
          [140, 40],
          [140, 4],
          [70, -2]
        ],
        offset: [12, 90],
        stroke: "#67e8f9",
        note: "Reduced sweep for roll.",
        edges: [
          { id: "center_back", fromIndex: 9, toIndex: 4, kind: "center_back" },
          { id: "neckline", fromIndex: 9, toIndex: 4, kind: "neckline" }
        ],
        assembled: {
          axisEdgeId: "center_back",
          anchorOnAxis: "start",
          bodyAnchorId: "cape_back_neck",
          z: 1.1
        }
      },
      {
        id: "collar_band",
        label: "Collar Band",
        polygon: [
          [0, 1],
          [2, 7],
          [34, 7],
          [34, 1],
          [17, -1]
        ],
        offset: [62, 6],
        note: "Cut 2; interface outer.",
        edges: [{ id: "long_edge", fromIndex: 0, toIndex: 2, kind: "neckline" }],
        assembled: {
          axisEdgeId: "long_edge",
          anchorOnAxis: "mid",
          bodyAnchorId: "cape_back_neck",
          z: 2
        }
      },
      {
        id: "front_facing",
        label: "Front Facing",
        polygon: [
          [0, 0],
          [0, 18],
          [30, 18],
          [40, 10],
          [42, 0]
        ],
        offset: [154, 18],
        dashed: true
      }
    ]
  },
  {
    id: "panel_shirt_front",
    name: "Panel Shirt Front - block draft",
    description: "Front split into left/right with placket, yoke, pockets, and collar pieces.",
    units: "cm",
    scalePxPerUnit: 9,
    gridEvery: 2,
    marginUnits: 12,
    prompt: "Front-only shirt block for knitting; keep placket straight and collar separate.",
    meanderDefaults: {
      ...FALLBACK_MEANDER_PARAMS,
      rule: "drift",
      seedEdges: ["center_front", "hem", "neckline"],
      seedSpacingCm: 6,
      stepCm: 0.55,
      maxLengthCm: 64,
      palette: ["#22c55e", "#16a34a", "#86efac"],
      rngSeed: 13
    },
    bodyAnchors: {
      front_L_neck: [-18, 0],
      front_R_neck: [18, 0],
      collar_center: [0, -4]
    },
    pieces: [
      {
        id: "front_left",
        label: "Front Left",
        polygon: [
          [0, 0],
          [0, 74],
          [10, 76],
          [22, 75],
          [30, 70],
          [36, 58],
          [38, 44],
          [38, 18],
          [34, 6],
          [16, 0]
        ],
        offset: [8, 10],
        note: "Add 1 cm seam to armhole/hem.",
        edges: [{ id: "center_front", fromIndex: 0, toIndex: 1, kind: "center_front" }],
        assembled: {
          axisEdgeId: "center_front",
          anchorOnAxis: "start",
          bodyAnchorId: "front_L_neck",
          z: 0
        }
      },
      {
        id: "front_right_placket",
        label: "Front Right + Placket",
        polygon: [
          [0, 0],
          [0, 74],
          [10, 76],
          [24, 75],
          [32, 70],
          [38, 58],
          [40, 44],
          [40, 18],
          [36, 6],
          [18, 0]
        ],
        offset: [46, 10],
        stroke: "#f59e0b",
        note: "Includes 3 cm placket.",
        edges: [{ id: "center_front", fromIndex: 0, toIndex: 1, kind: "center_front" }],
        assembled: {
          axisEdgeId: "center_front",
          anchorOnAxis: "start",
          bodyAnchorId: "front_R_neck",
          z: 0
        }
      },
      {
        id: "yoke",
        label: "Yoke",
        polygon: [
          [0, 2],
          [0, 14],
          [34, 18],
          [68, 14],
          [68, 0],
          [34, -2]
        ],
        offset: [8, 86],
        stroke: "#a5b4fc",
        edges: [{ id: "top_edge", fromIndex: 0, toIndex: 3, kind: "shoulder" }],
        assembled: {
          axisEdgeId: "top_edge",
          anchorOnAxis: "mid",
          bodyAnchorId: "collar_center",
          z: 1
        }
      },
      {
        id: "collar_stand",
        label: "Collar Stand",
        polygon: [
          [0, 0],
          [0, 3.5],
          [10, 4.5],
          [32, 4.5],
          [42, 3.5],
          [42, 0]
        ],
        offset: [120, 10],
        edges: [{ id: "long_edge", fromIndex: 0, toIndex: 5, kind: "neckline" }],
        assembled: {
          axisEdgeId: "long_edge",
          anchorOnAxis: "mid",
          bodyAnchorId: "collar_center",
          z: 2
        }
      },
      {
        id: "collar_fall",
        label: "Collar Fall",
        polygon: [
          [0, 0],
          [0, 6],
          [10, 7],
          [32, 7],
          [42, 6],
          [42, 0]
        ],
        offset: [120, 16],
        dashed: true,
        edges: [{ id: "long_edge", fromIndex: 0, toIndex: 5, kind: "neckline" }],
        assembled: {
          axisEdgeId: "long_edge",
          anchorOnAxis: "mid",
          bodyAnchorId: "collar_center",
          z: 2.1
        }
      },
      {
        id: "pocket",
        label: "Pocket",
        polygon: [
          [0, 0],
          [0, 14],
          [14, 14],
          [14, 0]
        ],
        offset: [16, 54]
      }
    ]
  }
];

function boundingBox(points: Point[]): Bounds {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function centroid(points: [number, number][]): [number, number] {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [xs.reduce((a, b) => a + b, 0) / points.length, ys.reduce((a, b) => a + b, 0) / points.length];
}

function midpointOfPolyline(pts: [number, number][]): [number, number] {
  if (pts.length === 1) return pts[0];
  if (pts.length === 0) return [0, 0];
  let total = 0;
  const segLengths: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segLengths.push(len);
    total += len;
  }
  let half = total / 2;
  for (let i = 0; i < segLengths.length; i++) {
    if (half <= segLengths[i]) {
      const t = segLengths[i] === 0 ? 0 : half / segLengths[i];
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    }
    half -= segLengths[i];
  }
  return pts[pts.length - 1];
}

function pointInPolygon(pt: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function vecLength([x, y]: Vec2): number {
  return Math.hypot(x, y);
}

function normalizeVec(v: Vec2): Vec2 {
  const len = vecLength(v);
  if (len === 0) return [0, 0];
  return [v[0] / len, v[1] / len];
}

function rotateVec([x, y]: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos - y * sin, x * sin + y * cos];
}

function polylineLength(pts: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    total += vecLength([pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]]);
  }
  return total;
}

// Lightweight hash noise to avoid pulling in a simplex/perlin dependency.
function hashNoise2D(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1; // [-1, 1]
}

function noiseVec2D(p: Vec2, scale: number): Vec2 {
  const nx = hashNoise2D(p[0] * scale, p[1] * scale);
  const ny = hashNoise2D((p[0] + 17.3) * scale, (p[1] - 9.1) * scale);
  return normalizeVec([nx, ny]);
}

function makeSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type MeanderStepContext = {
  piece: PlacedPiece;
  position: Vec2;
  direction: Vec2;
  stepCm: number;
  params: MeanderParams;
  rng: () => number;
};

type MeanderStepper = (ctx: MeanderStepContext) => Vec2;

const vineStepper: MeanderStepper = ({ piece, position, direction, params, rng }) => {
  const gravity: Vec2 = [0, 1];
  const center: Vec2 = [piece.bounds.width / 2, piece.bounds.height / 2];
  const toCenter = normalizeVec([center[0] - position[0], center[1] - position[1]]);
  const base = normalizeVec([
    direction[0] * 0.55 + gravity[0] * 0.35 + toCenter[0] * 0.1,
    direction[1] * 0.55 + gravity[1] * 0.35 + toCenter[1] * 0.1
  ]);
  const field = noiseVec2D(
    [position[0] + params.rngSeed * 0.37, position[1] - params.rngSeed * 0.23],
    Math.max(0.01, params.noiseScale)
  );
  const mixed: Vec2 = [
    base[0] * (1 - params.bendiness * 0.45) + field[0] * params.bendiness * 0.75,
    base[1] * (1 - params.bendiness * 0.45) + field[1] * params.bendiness * 0.75
  ];
  const jitter = (rng() - 0.5) * Math.PI * params.bendiness * 0.9;
  return normalizeVec(rotateVec(mixed, jitter));
};

const driftStepper: MeanderStepper = ({ piece, position, direction, params, rng }) => {
  const downwardBias = (piece.bounds.height - position[1]) * 0.0008;
  const base: Vec2 = [direction[0] * 0.8 + 0.25, direction[1] * 0.65 + downwardBias];
  const jitter = (rng() - 0.5) * params.bendiness * 0.6;
  return normalizeVec(rotateVec(base, jitter));
};

const filigreeStepper: MeanderStepper = ({ piece, position, direction, params, rng }) => {
  const center: Vec2 = [piece.bounds.width / 2, piece.bounds.height / 2];
  const toCenter = normalizeVec([center[0] - position[0], center[1] - position[1]]);
  const swirl = normalizeVec([-direction[1], direction[0]]);
  const field = noiseVec2D(
    [position[0] - params.rngSeed * 0.11, position[1] + params.rngSeed * 0.17],
    Math.max(0.01, params.noiseScale * 0.8)
  );
  const blended: Vec2 = normalizeVec([
    direction[0] * 0.35 + swirl[0] * 0.4 + toCenter[0] * 0.25 + field[0] * 0.3,
    direction[1] * 0.35 + swirl[1] * 0.4 + toCenter[1] * 0.25 + field[1] * 0.3
  ]);
  const jitter = (rng() - 0.5) * Math.PI * (0.6 + params.bendiness);
  return normalizeVec(rotateVec(blended, jitter));
};

const caStepper: MeanderStepper = ({ position, direction, params, rng }) => {
  const lattice = noiseVec2D(
    [
      Math.round(position[0] * params.noiseScale * 1.2) + params.rngSeed * 0.5,
      Math.round(position[1] * params.noiseScale * 1.2) - params.rngSeed * 0.5
    ],
    Math.max(0.01, params.noiseScale * 0.9)
  );
  const base: Vec2 = [
    direction[0] * 0.55 + lattice[0] * (0.6 + params.bendiness * 0.35),
    direction[1] * 0.55 + lattice[1] * (0.6 + params.bendiness * 0.35)
  ];
  const jitter = (rng() - 0.5) * params.bendiness * 0.4;
  return normalizeVec(rotateVec(base, jitter));
};

const MEANDER_RULES: Record<MeanderRuleId, MeanderStepper> = {
  vine: vineStepper,
  drift: driftStepper,
  filigree: filigreeStepper,
  ca: caStepper
};

const identityTransform: Transform2D = { rotation: 0, tx: 0, ty: 0 };

function applyTransform(point: Vec2, t: Transform2D): Vec2 {
  const [x, y] = point;
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  return [cos * x - sin * y + t.tx, sin * x + cos * y + t.ty];
}

function angleOfVector([x, y]: Vec2): number {
  return Math.atan2(y, x);
}

function normalizedPoints(piece: PlacedPiece): Vec2[] {
  return piece.polygon.map(([x, y]) => [x - piece.bounds.minX, y - piece.bounds.minY]);
}

function normalizedEdgePoints(piece: PlacedPiece, edge: PieceEdge): Vec2[] {
  return piece.polygon.slice(edge.fromIndex, edge.toIndex + 1).map(([x, y]) => [x - piece.bounds.minX, y - piece.bounds.minY]);
}

function edgePolylineNormalized(piece: PlacedPiece, edge: PieceEdge): Vec2[] {
  const pts = normalizedPoints(piece);
  if (pts.length === 0) return [];

  const clampIndex = (idx: number) => Math.min(Math.max(idx, 0), pts.length - 1);
  const fromIdx = clampIndex(edge.fromIndex);
  const toIdx = clampIndex(edge.toIndex);

  const forward = (start: number, end: number) => {
    const seg: Vec2[] = [];
    for (let i = start; i <= end; i += 1) {
      seg.push(pts[i]);
    }
    return seg;
  };

  const backward = (start: number, end: number) => {
    const seg: Vec2[] = [];
    for (let i = start; i >= end; i -= 1) {
      seg.push(pts[i]);
    }
    return seg;
  };

  const wrapForward = (start: number, end: number) => {
    const seg: Vec2[] = [];
    for (let i = start; i < pts.length; i += 1) {
      seg.push(pts[i]);
    }
    for (let i = 0; i <= end; i += 1) {
      seg.push(pts[i]);
    }
    return seg;
  };

  let seg: Vec2[];
  if (fromIdx <= toIdx) {
    seg = forward(fromIdx, toIdx);
  } else {
    const backSeg = backward(fromIdx, toIdx);
    const wrapped = wrapForward(fromIdx, toIdx);
    seg = wrapped.length > 0 && wrapped.length < backSeg.length ? wrapped : backSeg;
  }

  if (seg.length === 0) {
    const start = pts[fromIdx];
    const end = pts[toIdx];
    if (start && end) {
      seg.push(start, end);
    }
  }
  return seg;
}

function mapStrokeToScreen(
  stroke: PatternStroke,
  piece: PlacedPiece,
  pxPerUnit: number,
  viewMode: "flat" | "assembled",
  shift: { x: number; y: number },
  assembledTransforms: Record<string, Transform2D>
): PatternStroke {
  const mapped: Vec2[] = stroke.points.map(([x, y]): Vec2 => {
    if (viewMode === "flat") {
      return [
        (piece.layoutOffset[0] + shift.x + x) * pxPerUnit,
        (piece.layoutOffset[1] + shift.y + y) * pxPerUnit
      ];
    }
    const t = assembledTransforms[piece.id] ?? identityTransform;
    const [wx, wy] = applyTransform([x + piece.bounds.minX, y + piece.bounds.minY], t);
    return [(wx + shift.x) * pxPerUnit, (wy + shift.y) * pxPerUnit];
  });
  return { ...stroke, points: mapped };
}

function seedEdgesForPiece(piece: PatternPiece): string[] {
  const edges = piece.edges ?? [];
  const prioritized = edges.filter((e) => e.kind === "neckline" || e.kind === "center_front" || e.kind === "hem");
  if (prioritized.length) return prioritized.map((e) => e.id);
  return edges.slice(0, 2).map((e) => e.id);
}

function sampleSeedsOnEdges(piece: PlacedPiece, edgeIds: string[], spacingCm: number): { point: Vec2; tangent: Vec2 }[] {
  const seeds: { point: Vec2; tangent: Vec2 }[] = [];
  const edges = piece.edges ?? [];
  const safeSpacing = Math.max(0.2, spacingCm);

  edgeIds.forEach((edgeId, edgeIdx) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const polyline = edgePolylineNormalized(piece, edge);
    if (polyline.length < 2) return;
    const totalLen = polylineLength(polyline);
    const count = Math.max(1, Math.floor(totalLen / safeSpacing));
    for (let i = 0; i < count; i += 1) {
      const baseT = (i + 0.5) / count;
      const jitter = hashNoise2D(edgeIdx * 13.37, i * 7.11) * 0.15;
      const targetDist = clamp(totalLen * (baseT + jitter * 0.25), safeSpacing * 0.25, Math.max(safeSpacing * 0.5, totalLen - 1e-3));
      let acc = 0;
      for (let s = 0; s < polyline.length - 1; s += 1) {
        const seg: Vec2 = [polyline[s + 1][0] - polyline[s][0], polyline[s + 1][1] - polyline[s][1]];
        const segLen = vecLength(seg);
        if (targetDist <= acc + segLen) {
          const t = segLen === 0 ? 0 : (targetDist - acc) / segLen;
          const point: Vec2 = [polyline[s][0] + seg[0] * t, polyline[s][1] + seg[1] * t];
          seeds.push({ point, tangent: segLen === 0 ? [0, 1] : seg });
          break;
        }
        acc += segLen;
      }
    }
  });
  return seeds;
}

function initialDirectionForSeed(point: Vec2, tangent: Vec2, gravity: Vec2, poly: Vec2[]): Vec2 {
  const tan = normalizeVec(tangent);
  let inward: Vec2 = normalizeVec([-tan[1], tan[0]]);
  const probe: Vec2 = [point[0] + inward[0] * 0.4, point[1] + inward[1] * 0.4];
  if (!pointInPolygon(probe, poly)) {
    inward = normalizeVec([tan[1], -tan[0]]);
  }
  const mixed = normalizeVec([inward[0] * 0.65 + gravity[0] * 0.35, inward[1] * 0.65 + gravity[1] * 0.35]);
  return vecLength(mixed) === 0 ? gravity : mixed;
}

function generateEdgeMeanders(piece: PlacedPiece, params: MeanderParams): PatternStroke[] {
  const poly = normalizedPoints(piece);
  if (poly.length < 3) return [];
  const stepCm = Math.max(0.1, params.stepCm);
  const maxLengthCm = Math.max(stepCm, params.maxLengthCm);
  const seedSpacingCm = Math.max(0.2, params.seedSpacingCm);
  const bendiness = clamp(params.bendiness, 0, 1);
  const noiseScale = Math.max(0.01, params.noiseScale);
  const gravity = normalizeVec([0, 1]);
  const palette = params.palette.length ? params.palette : FALLBACK_MEANDER_PARAMS.palette;
  const rule = params.rule ?? "vine";
  const stepper = MEANDER_RULES[rule] ?? MEANDER_RULES.vine;
  const edgesFromSpec = params.seedEdges?.length ? params.seedEdges : seedEdgesForPiece(piece);
  let seeds = sampleSeedsOnEdges(piece, edgesFromSpec, seedSpacingCm);
  if (!seeds.length) {
    seeds = sampleSeedsOnEdges(piece, seedEdgesForPiece(piece), seedSpacingCm);
  }
  if (!seeds.length) return [];
  const rng = makeSeededRng(params.rngSeed ?? 0);
  const noisePhase: Vec2 = [(rng() - 0.5) * 50, (rng() - 0.5) * 50];
  const maxSteps = Math.max(1, Math.ceil(maxLengthCm / stepCm));
  const strokes: PatternStroke[] = [];

  seeds.forEach(({ point, tangent }, idx) => {
    const pathRng = makeSeededRng((params.rngSeed ?? 0) + idx * 97 + Math.floor(piece.bounds.width * 11));
    let cursor = point;
    let direction = initialDirectionForSeed(point, tangent, gravity, poly);
    let walked = 0;
    const path: Vec2[] = [cursor];
    for (let stepIdx = 0; stepIdx < maxSteps && walked < maxLengthCm; stepIdx += 1) {
      const steering = stepper({
        piece,
        position: cursor,
        direction,
        stepCm,
        params: { ...params, bendiness, noiseScale },
        rng: pathRng
      });
      const dir = normalizeVec([
        steering[0] * (1 - bendiness * 0.1) + gravity[0] * 0.08,
        steering[1] * (1 - bendiness * 0.1) + gravity[1] * 0.08
      ]);
      const noise = noiseVec2D(
        [cursor[0] + params.rngSeed * 0.19 + noisePhase[0], cursor[1] - params.rngSeed * 0.13 + noisePhase[1]],
        noiseScale
      );
      const mixedDir = normalizeVec([
        dir[0] * (1 - bendiness) + noise[0] * bendiness,
        dir[1] * (1 - bendiness) + noise[1] * bendiness
      ]);
      const next: Vec2 = [cursor[0] + mixedDir[0] * stepCm, cursor[1] + mixedDir[1] * stepCm];
      if (!pointInPolygon(next, poly)) break;
      path.push(next);
      walked += stepCm;
      cursor = next;
      direction = mixedDir;
    }
    if (path.length > 1) {
      const strokeWidth = Math.max(0.35, params.lineThicknessPx);
      strokes.push({
        points: path,
        width: strokeWidth,
        color: palette[idx % palette.length],
        opacity: 0.9,
        dash: rule === "ca" ? "3 3" : idx % 4 === 0 ? "4 3" : undefined
      });
    }
  });

  return strokes;
}

function buildMeandersForPiece(piece: PlacedPiece, warp: WarpInputs, recipe: PatternRecipe): PatternStroke[] {
  const poly = normalizedPoints(piece);
  if (poly.length < 3) return [];
  const { width, height } = piece.bounds;
  const guardClamp = warp.guard === "violation" ? 0.35 : warp.guard === "near" ? 0.7 : 1;
  const amp = (0.08 + warp.kappaNorm * 0.12) * height * guardClamp;
  const stepX = Math.max(0.8, width / 140);
  const freqBase = 1.2 + warp.sectorFraction * 2 + warp.dutyNorm * 1.4;

  const strokes: PatternStroke[] = [];
  recipe.contourLevels.forEach((lvl, idx) => {
    const baseline = lvl * height;
    let current: Vec2[] = [];
    const pushSegment = () => {
      if (current.length > 1) {
        strokes.push({
          points: current,
          width: recipe.stroke * (1 + idx * 0.12),
          color: warp.palette.line,
          opacity: 0.82,
          dash: warp.guard === "violation" ? "4 3" : warp.guard === "near" ? "8 6" : undefined
        });
      }
      current = [];
    };

    for (let x = 0; x <= width; x += stepX) {
      const u = width === 0 ? 0 : x / width;
      const phase = warp.dutyNorm * Math.PI * 2 + idx * 0.7;
      const primary = Math.sin(u * (freqBase + recipe.wiggle * 1.6) * Math.PI * 2 + phase);
      const secondary = Math.sin((u * 2 + lvl) * Math.PI);
      const y = baseline + primary * amp + secondary * amp * 0.4 * (1 + warp.kappaNorm);
      const pt: Vec2 = [x, y];
      if (pointInPolygon(pt, poly)) {
        current.push(pt);
      } else {
        pushSegment();
      }
    }
    pushSegment();
  });
  return strokes;
}

function buildMeandersForOutline(outline: VectorizerOutline, warp: WarpInputs, recipe: PatternRecipe): PatternStroke[] {
  const { minX, minY, width, height } = outline.viewBox;
  const guardClamp = warp.guard === "violation" ? 0.35 : warp.guard === "near" ? 0.7 : 1;
  const amp = (0.08 + warp.kappaNorm * 0.12) * height * guardClamp;
  const stepX = Math.max(1, width / 160);
  const freqBase = 1.1 + warp.sectorFraction * 2.4 + warp.dutyNorm * 1.2;
  const strokes: PatternStroke[] = [];
  recipe.contourLevels.forEach((lvl, idx) => {
    const baseline = minY + lvl * height;
    const pts: Vec2[] = [];
    for (let x = minX; x <= minX + width; x += stepX) {
      const u = width === 0 ? 0 : (x - minX) / width;
      const phase = warp.dutyNorm * Math.PI * 2 + idx * 0.9;
      const y =
        baseline +
        Math.sin(u * (freqBase + recipe.wiggle * 1.4) * Math.PI * 2 + phase) * amp +
        Math.sin((u + lvl) * Math.PI) * amp * 0.35;
      pts.push([x, y]);
    }
    strokes.push({
      points: pts,
      width: recipe.stroke * (1 + idx * 0.1),
      color: warp.palette.line,
      opacity: 0.88,
      dash: warp.guard === "violation" ? "4 3" : warp.guard === "near" ? "8 6" : undefined
    });
  });
  return strokes;
}

function screenPointsForPiece(
  piece: PlacedPiece,
  pxPerUnit: number,
  viewMode: "flat" | "assembled",
  shift: { x: number; y: number },
  assembledTransforms: Record<string, Transform2D>
): [number, number][] {
  if (viewMode === "flat") {
    return normalizedPoints(piece).map(([x, y]) => [
      (piece.layoutOffset[0] + shift.x + x) * pxPerUnit,
      (piece.layoutOffset[1] + shift.y + y) * pxPerUnit
    ]);
  }
  const t = assembledTransforms[piece.id] ?? identityTransform;
  return piece.polygon.map((pt) => {
    const [wx, wy] = applyTransform(pt as Vec2, t);
    return [(wx + shift.x) * pxPerUnit, (wy + shift.y) * pxPerUnit];
  });
}

function edgePolyline(
  piece: PlacedPiece,
  edge: PieceEdge,
  pxPerUnit: number,
  viewMode: "flat" | "assembled",
  shift: { x: number; y: number },
  assembledTransforms: Record<string, Transform2D>
): [number, number][] {
  const pts = screenPointsForPiece(piece, pxPerUnit, viewMode, shift, assembledTransforms);
  if (pts.length === 0) return [];

  const clampIndex = (idx: number) => Math.min(Math.max(idx, 0), pts.length - 1);
  const fromIdx = clampIndex(edge.fromIndex);
  const toIdx = clampIndex(edge.toIndex);

  const forward = (start: number, end: number) => {
    const seg: [number, number][] = [];
    for (let i = start; i <= end; i += 1) {
      seg.push(pts[i]);
    }
    return seg;
  };

  const backward = (start: number, end: number) => {
    const seg: [number, number][] = [];
    for (let i = start; i >= end; i -= 1) {
      seg.push(pts[i]);
    }
    return seg;
  };

  const wrapForward = (start: number, end: number) => {
    const seg: [number, number][] = [];
    for (let i = start; i < pts.length; i += 1) {
      seg.push(pts[i]);
    }
    for (let i = 0; i <= end; i += 1) {
      seg.push(pts[i]);
    }
    return seg;
  };

  let seg: [number, number][];
  if (fromIdx <= toIdx) {
    seg = forward(fromIdx, toIdx);
  } else {
    const backSeg = backward(fromIdx, toIdx);
    const wrapped = wrapForward(fromIdx, toIdx);
    seg = wrapped.length > 0 && wrapped.length < backSeg.length ? wrapped : backSeg;
  }

  if (seg.length === 0) {
    const start = pts[fromIdx];
    const end = pts[toIdx];
    if (start && end) {
      seg.push(start, end);
    }
  }
  return seg;
}

function edgePolylineLocal(piece: PlacedPiece, edge: PieceEdge): Vec2[] {
  const pts = piece.polygon as Vec2[];
  if (pts.length === 0) return [];
  const clampIndex = (idx: number) => Math.min(Math.max(idx, 0), pts.length - 1);
  const fromIdx = clampIndex(edge.fromIndex);
  const toIdx = clampIndex(edge.toIndex);

  const forward = (start: number, end: number) => {
    const seg: Vec2[] = [];
    for (let i = start; i <= end; i += 1) {
      seg.push(pts[i]);
    }
    return seg;
  };

  const backward = (start: number, end: number) => {
    const seg: Vec2[] = [];
    for (let i = start; i >= end; i -= 1) {
      seg.push(pts[i]);
    }
    return seg;
  };

  const wrapForward = (start: number, end: number) => {
    const seg: Vec2[] = [];
    for (let i = start; i < pts.length; i += 1) {
      seg.push(pts[i]);
    }
    for (let i = 0; i <= end; i += 1) {
      seg.push(pts[i]);
    }
    return seg;
  };

  let seg: Vec2[];
  if (fromIdx <= toIdx) {
    seg = forward(fromIdx, toIdx);
  } else {
    const backSeg = backward(fromIdx, toIdx);
    const wrapped = wrapForward(fromIdx, toIdx);
    seg = wrapped.length > 0 && wrapped.length < backSeg.length ? wrapped : backSeg;
  }

  if (seg.length === 0) {
    const start = pts[fromIdx];
    const end = pts[toIdx];
    if (start && end) {
      seg.push(start, end);
    }
  }
  return seg;
}

function buildAnchorTransform(
  piece: PlacedPiece,
  anchors: BodyAnchorMap,
  lookId: string,
  warn: (msg: string) => void
): Transform2D | null {
  const spec = piece.assembled;
  if (!spec) {
    warn(`Piece "${piece.id}" has no assembled spec; using identity transform.`);
    return null;
  }
  const anchor = anchors[spec.bodyAnchorId];
  if (!anchor) {
    warn(`Missing bodyAnchorId "${spec.bodyAnchorId}" for piece "${piece.id}" on look "${lookId}".`);
    return null;
  }
  const axisEdge = (piece.edges ?? []).find((e) => e.id === spec.axisEdgeId);
  const axisFold = (piece.foldLines ?? []).find((f) => f.id === spec.axisEdgeId);
  if (!axisEdge && !axisFold) {
    warn(`Missing axis edge or fold line "${spec.axisEdgeId}" for piece "${piece.id}".`);
    return null;
  }
  const start = axisFold ? axisFold.points[0] : axisEdge ? piece.polygon[axisEdge.fromIndex] : undefined;
  const end =
    axisFold && axisFold.points.length > 1
      ? axisFold.points[axisFold.points.length - 1]
      : axisEdge
      ? piece.polygon[axisEdge.toIndex]
      : undefined;
  if (!start || !end) {
    warn(
      `Axis "${spec.axisEdgeId}" missing usable start/end points for piece "${piece.id}" (check edge indices or fold line points).`
    );
    return null;
  }
  const axisVec: Vec2 = [end[0] - start[0], end[1] - start[1]];
  const angleAxis = Math.atan2(axisVec[1], axisVec[0]);
  const angleTarget = Math.PI / 2; // vertical downwards
  const rotation = angleTarget - angleAxis;

  const anchorLocal =
    spec.anchorOnAxis === "start"
      ? start
      : spec.anchorOnAxis === "end"
      ? end
      : [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const rotatedAnchor = applyTransform(anchorLocal as Vec2, { rotation, tx: 0, ty: 0 });
  const tx = anchor[0] - rotatedAnchor[0];
  const ty = anchor[1] - rotatedAnchor[1];

  return { rotation, tx, ty };
}

function alignPieceToJoin(
  basePiece: PlacedPiece,
  baseEdge: PieceEdge,
  baseTransform: Transform2D,
  targetPiece: PlacedPiece,
  targetEdge: PieceEdge
): Transform2D | null {
  const basePolyline = edgePolylineLocal(basePiece, baseEdge).map((pt) => applyTransform(pt as Vec2, baseTransform));
  const targetPolyline = edgePolylineLocal(targetPiece, targetEdge);
  if (basePolyline.length < 2 || targetPolyline.length < 2) return null;

  const baseVec: Vec2 = [
    basePolyline[basePolyline.length - 1][0] - basePolyline[0][0],
    basePolyline[basePolyline.length - 1][1] - basePolyline[0][1]
  ];
  if (vecLength(baseVec) === 0) return null;

  const tryOrient = (pts: Vec2[]): { transform: Transform2D; error: number } | null => {
    if (pts.length < 2) return null;
    const targetVec: Vec2 = [pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]];
    if (vecLength(targetVec) === 0) return null;
    const rotation = angleOfVector(baseVec) - angleOfVector(targetVec);
    const rotated = pts.map((pt) => applyTransform(pt as Vec2, { rotation, tx: 0, ty: 0 }));
    const baseMid = midpointOfPolyline(basePolyline);
    const rotatedMid = midpointOfPolyline(rotated);
    const tx = baseMid[0] - rotatedMid[0];
    const ty = baseMid[1] - rotatedMid[1];
    const transformed = rotated.map((pt) => [pt[0] + tx, pt[1] + ty] as Vec2);

    const startErr = vecLength([transformed[0][0] - basePolyline[0][0], transformed[0][1] - basePolyline[0][1]]);
    const endErr = vecLength([
      transformed[transformed.length - 1][0] - basePolyline[basePolyline.length - 1][0],
      transformed[transformed.length - 1][1] - basePolyline[basePolyline.length - 1][1]
    ]);
    const lengthErr = Math.abs(polylineLength(transformed) - polylineLength(basePolyline));
    const error = startErr + endErr + lengthErr * 0.25;
    return { transform: { rotation, tx, ty }, error };
  };

  const candidates = [targetPolyline, [...targetPolyline].reverse()]
    .map((pts) => tryOrient(pts))
    .filter((c): c is { transform: Transform2D; error: number } => Boolean(c))
    .sort((a, b) => a.error - b.error);

  return candidates[0]?.transform ?? null;
}

function computeAssembledTransforms(look: LookSpec, placed: PlacedPiece[]): Record<string, Transform2D> {
  const anchors = look.bodyAnchors ?? {};
  const joins = look.joins ?? [];
  const warn = (msg: string) => console.warn(`[assembled] ${msg}`);
  const transforms: Record<string, Transform2D> = {};

  const anchorCache: Record<string, Transform2D | null> = {};
  placed.forEach((piece) => {
    anchorCache[piece.id] = buildAnchorTransform(piece, anchors, look.id, warn);
  });

  const joinsByPiece = new Map<string, PieceJoin[]>();
  joins.forEach((join) => {
    joinsByPiece.set(join.from.pieceId, [...(joinsByPiece.get(join.from.pieceId) ?? []), join]);
    joinsByPiece.set(join.to.pieceId, [...(joinsByPiece.get(join.to.pieceId) ?? []), join]);
  });

  const visited = new Set<string>();
  const findPiece = (id: string) => placed.find((p) => p.id === id);

  placed.forEach((startPiece) => {
    if (visited.has(startPiece.id)) return;

    // Collect connected component so we can anchor once and align neighbors via joins.
    const component: string[] = [];
    const stack = [startPiece.id];
    visited.add(startPiece.id);
    while (stack.length) {
      const id = stack.pop()!;
      component.push(id);
      const neighbors = joinsByPiece.get(id) ?? [];
      neighbors.forEach((join) => {
        const neighborId = join.from.pieceId === id ? join.to.pieceId : join.from.pieceId;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          stack.push(neighborId);
        }
      });
    }

    const rootId = component.find((id) => anchorCache[id]) ?? component[0];
    const rootTransform = anchorCache[rootId] ?? identityTransform;
    transforms[rootId] = rootTransform;

    const queue = [rootId];
    while (queue.length) {
      const currentId = queue.shift()!;
      const currentPiece = findPiece(currentId);
      const currentTransform = transforms[currentId];
      if (!currentPiece || !currentTransform) continue;

      const relatedJoins = joinsByPiece.get(currentId) ?? [];
      relatedJoins.forEach((join) => {
        const isCurrentFrom = join.from.pieceId === currentId;
        const neighborId = isCurrentFrom ? join.to.pieceId : join.from.pieceId;
        if (transforms[neighborId]) return;

        const neighborPiece = findPiece(neighborId);
        if (!neighborPiece) {
          warn(`Join references missing piece "${neighborId}".`);
          return;
        }

        const currentEdgeId = isCurrentFrom ? join.from.edgeId : join.to.edgeId;
        const neighborEdgeId = isCurrentFrom ? join.to.edgeId : join.from.edgeId;
        const currentEdge = (currentPiece.edges ?? []).find((e) => e.id === currentEdgeId);
        const neighborEdge = (neighborPiece.edges ?? []).find((e) => e.id === neighborEdgeId);

        if (!currentEdge || !neighborEdge) {
          warn(`Join "${join.id}" missing edge definitions for ${currentPiece.id} or ${neighborPiece.id}.`);
          return;
        }

        const aligned = alignPieceToJoin(currentPiece, currentEdge, currentTransform, neighborPiece, neighborEdge);
        if (aligned) {
          transforms[neighborId] = aligned;
          queue.push(neighborId);
        }
      });
    }

    // If a piece in the component never got a transform from joins, fall back to its anchor/identity.
    component.forEach((pid) => {
      if (!transforms[pid]) {
        transforms[pid] = anchorCache[pid] ?? identityTransform;
      }
    });
  });

  return transforms;
}

function computeAssembledBounds(placed: PlacedPiece[], transforms: Record<string, Transform2D>) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  placed.forEach((piece) => {
    const t = transforms[piece.id] ?? identityTransform;
    piece.polygon.forEach((pt) => {
      const [wx, wy] = applyTransform(pt as Vec2, t);
      minX = Math.min(minX, wx);
      maxX = Math.max(maxX, wx);
      minY = Math.min(minY, wy);
      maxY = Math.max(maxY, wy);
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function layoutPieces(pieces: PatternPiece[], paddingUnits: number): { placed: PlacedPiece[]; widthUnits: number; heightUnits: number } {
  const boundsCache = pieces.map((piece) => ({ piece, bounds: boundingBox(piece.polygon) }));
  const totalArea = boundsCache.reduce((acc, { bounds }) => acc + bounds.width * bounds.height, 0);
  const targetRowUnits = Math.max(60, Math.ceil(Math.sqrt(totalArea) * 1.3));

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let rowWidth = 0;
  let maxWidth = 0;
  const placed: PlacedPiece[] = [];

  boundsCache.forEach(({ piece, bounds }) => {
    const paddedW = bounds.width + paddingUnits * 2;
    const paddedH = bounds.height + paddingUnits * 2;
    if (cursorX > 0 && cursorX + paddedW > targetRowUnits) {
      maxWidth = Math.max(maxWidth, cursorX);
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }
    const layoutOffset: Point = [cursorX + paddingUnits, cursorY + paddingUnits];
    placed.push({ ...piece, layoutOffset, bounds });
    cursorX += paddedW;
    rowHeight = Math.max(rowHeight, paddedH);
    rowWidth = cursorX;
  });

  const widthUnits = Math.max(maxWidth, rowWidth);
  const heightUnits = cursorY + rowHeight;
  return { placed, widthUnits, heightUnits };
}

function canvasFromLayout(widthUnits: number, heightUnits: number, pxPerUnit: number, marginUnits: number) {
  const width = widthUnits + marginUnits;
  const height = heightUnits + marginUnits;
  return {
    widthUnits: width,
    heightUnits: height,
    widthPx: Math.ceil(width * pxPerUnit),
    heightPx: Math.ceil(height * pxPerUnit),
    shift: { x: 0, y: 0 }
  };
}

function parseVectorizerOutline(svg: string): VectorizerOutline | null {
  if (typeof window === "undefined") return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");
    const paths = Array.from(doc.querySelectorAll("path"));
    if (!paths.length) return null;
    const chosen = paths.reduce((best, el) => {
      const len = (el.getAttribute("d") ?? "").length;
      const bestLen = (best.getAttribute("d") ?? "").length;
      return len > bestLen ? el : best;
    }, paths[0]);
    const d = chosen.getAttribute("d");
    if (!d) return null;
    const svgEl = doc.documentElement;
    const vb = (svgEl.getAttribute("viewBox") ?? "")
      .split(/[\s,]+/)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
    const widthAttr = Number(svgEl.getAttribute("width"));
    const heightAttr = Number(svgEl.getAttribute("height"));
    const viewBox = {
      minX: Number.isFinite(vb[0]) ? vb[0] : 0,
      minY: Number.isFinite(vb[1]) ? vb[1] : 0,
      width: Number.isFinite(vb[2]) ? vb[2] : Number.isFinite(widthAttr) ? widthAttr : 1024,
      height: Number.isFinite(vb[3]) ? vb[3] : Number.isFinite(heightAttr) ? heightAttr : 1024
    };
    return { pathD: d, viewBox };
  } catch (err) {
    console.warn("[dresscode] failed to parse vectorizer svg", err);
    return null;
  }
}

export default function DresscodePanel() {
  const [selectedId, setSelectedId] = useState<string>(LOOK_LIBRARY[0].id);
  const [pxPerUnit, setPxPerUnit] = useState<number>(LOOK_LIBRARY[0].scalePxPerUnit);
  const [gridSpacingUnits, setGridSpacingUnits] = useState<number>(LOOK_LIBRARY[0].gridEvery ?? 2);
  const [viewMode, setViewMode] = useState<"flat" | "assembled">("flat");
  const [highlightPiece, setHighlightPiece] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { data: pipeline } = useEnergyPipeline({ refetchInterval: 1500, staleTime: 4000 });
  const [showPatterns, setShowPatterns] = useState<boolean>(true);
  const [showEdgeMeanders, setShowEdgeMeanders] = useState<boolean>(true);
  const [meanderParams, setMeanderParams] = useState<MeanderParams>({
    ...(LOOK_LIBRARY[0].meanderDefaults ?? FALLBACK_MEANDER_PARAMS)
  });
  const [complexityBudget, setComplexityBudget] = useState<ComplexityBudget>({
    targetMinutes: 60,
    maxSpecialRegions: 4
  });
  const [previewHooks, setPreviewHooks] = useState<PreviewHooks>({
    apexFiz: { requested: true },
    knitPaintOnline: { requested: true },
    knitManager: { requested: false }
  });
  const [vectorizerHealth, setVectorizerHealth] = useState<VectorizerHealth | null>(null);
  const [vectorizerResult, setVectorizerResult] = useState<VectorizeResponse | null>(null);
  const [vectorizerOutline, setVectorizerOutline] = useState<VectorizerOutline | null>(null);
  const [vectorizerStatus, setVectorizerStatus] = useState<string | null>(null);
  const [vectorizerBusy, setVectorizerBusy] = useState<boolean>(false);
  const vectorizerInputRef = useRef<HTMLInputElement | null>(null);

  const selectedLook = useMemo(
    () => LOOK_LIBRARY.find((look) => look.id === selectedId) ?? LOOK_LIBRARY[0],
    [selectedId]
  );
  const designRecipe = useMemo<DesignRecipe>(() => {
    const needleSkipRegions: NeedleSkipRegion[] = [];
    return {
      version: DESIGN_RECIPE_VERSION,
      templateId: selectedLook.id,
      templateName: selectedLook.name,
      description: selectedLook.description,
      measurements: selectedLook.measurements,
      gauge: selectedLook.gauge
        ? {
            machine: selectedLook.gauge.machine,
            gaugeNumber: selectedLook.gauge.gaugeNumber
          }
        : undefined,
      colorPlan: {
        palette: meanderParams.palette,
        maxColors: meanderParams.palette.length || undefined
      },
      ornament: {
        meanders: {
          rule: meanderParams.rule,
          seedSpacingCm: meanderParams.seedSpacingCm,
          maxLengthCm: meanderParams.maxLengthCm,
          bendiness: meanderParams.bendiness,
          lineThicknessPx: meanderParams.lineThicknessPx,
          palette: meanderParams.palette,
          seedEdges: meanderParams.seedEdges,
          showPatterns,
          showEdgeMeanders
        }
      },
      structuralDirectives: { needleSkipRegions },
      complexityBudget,
      previewHooks,
      metadata: {
        gridEvery: selectedLook.gridEvery,
        marginUnits: selectedLook.marginUnits,
        scalePxPerUnit: selectedLook.scalePxPerUnit
      }
    };
  }, [complexityBudget, meanderParams, previewHooks, selectedLook, showEdgeMeanders, showPatterns]);
  const exportSpec = useMemo(
    () => ({
      version: DESIGN_RECIPE_VERSION,
      recipe: designRecipe,
      look: selectedLook
    }),
    [designRecipe, selectedLook]
  );
  const recipeIssues = useMemo(() => validateDesignRecipe(designRecipe), [designRecipe]);

  useEffect(() => {
    fetchVectorizerHealth()
      .then(setVectorizerHealth)
      .catch(() => setVectorizerHealth({ ready: false }));
  }, []);

  useEffect(() => {
    setPxPerUnit(selectedLook.scalePxPerUnit);
    setGridSpacingUnits(selectedLook.gridEvery ?? 2);
  }, [selectedLook.id, selectedLook.scalePxPerUnit, selectedLook.gridEvery]);

  useEffect(() => {
    setHighlightPiece(null);
    setFeedback(null);
  }, [selectedLook.id]);

  useEffect(() => {
    setMeanderParams(
      selectedLook.meanderDefaults ? { ...selectedLook.meanderDefaults } : { ...FALLBACK_MEANDER_PARAMS }
    );
  }, [selectedLook.id, selectedLook.meanderDefaults]);

  useEffect(() => {
    setComplexityBudget({ targetMinutes: 60, maxSpecialRegions: 4 });
    setPreviewHooks({
      apexFiz: { requested: true },
      knitPaintOnline: { requested: true },
      knitManager: { requested: false }
    });
  }, [selectedLook.id]);

  const warpInputs = useMemo(() => buildWarpPatternInputs(pipeline), [pipeline]);
  const warpRecipe = useMemo(() => buildPatternRecipe(warpInputs), [warpInputs]);

  const marginUnits = selectedLook.marginUnits ?? 6;
  const layoutPaddingUnits = 4;
  const layout = useMemo(() => layoutPieces(selectedLook.pieces, layoutPaddingUnits), [selectedLook.pieces]);
  const assembledTransforms = useMemo(
    () => (viewMode === "assembled" ? computeAssembledTransforms(selectedLook, layout.placed) : {}),
    [layout.placed, selectedLook, viewMode]
  );
  const assembledBounds = useMemo(
    () => (viewMode === "assembled" ? computeAssembledBounds(layout.placed, assembledTransforms) : null),
    [assembledTransforms, layout.placed, viewMode]
  );
  const piecePatterns = useMemo(() => {
    const patterns: Record<string, PatternStroke[]> = {};
    layout.placed.forEach((piece) => {
      const base = showPatterns ? buildMeandersForPiece(piece, warpInputs, warpRecipe) : [];
      const edgeStrokes =
        showPatterns && showEdgeMeanders
          ? (() => {
              const candidateEdges = meanderParams.seedEdges?.length ? meanderParams.seedEdges : seedEdgesForPiece(piece);
              const chosenEdges = candidateEdges.length ? candidateEdges : seedEdgesForPiece(piece);
              if (!chosenEdges.length) return [];
              return generateEdgeMeanders(piece, {
                ...meanderParams,
                seedEdges: chosenEdges,
                maxLengthCm: Math.min(meanderParams.maxLengthCm, piece.bounds.height * 1.05)
              });
            })()
          : [];
      patterns[piece.id] = [...base, ...edgeStrokes];
    });
    return patterns;
  }, [
    layout.placed,
    meanderParams,
    showEdgeMeanders,
    showPatterns,
    warpInputs,
    warpRecipe
  ]);
  const outlinePatterns = useMemo(
    () => (!vectorizerOutline || !showPatterns ? [] : buildMeandersForOutline(vectorizerOutline, warpInputs, warpRecipe)),
    [vectorizerOutline, showPatterns, warpInputs, warpRecipe]
  );
  const outlineClipId = useMemo(() => `vectorizer-outline-${Math.random().toString(36).slice(2)}`, []);
  const guardBadgeClass =
    warpInputs.guard === "violation"
      ? "bg-rose-500/10 border-rose-500/40 text-rose-200"
      : warpInputs.guard === "near"
        ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
        : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200";
  const densitySlider = clamp(1 - (meanderParams.seedSpacingCm - 2) / 10, 0, 1);
  const curlSlider = clamp(meanderParams.bendiness, 0, 1);
  const canvas = useMemo(() => {
    if (viewMode === "assembled" && assembledBounds) {
      const widthUnits = assembledBounds.maxX - assembledBounds.minX + marginUnits;
      const heightUnits = assembledBounds.maxY - assembledBounds.minY + marginUnits;
      const shift = {
        x: -assembledBounds.minX + marginUnits / 2,
        y: -assembledBounds.minY + marginUnits / 2
      };
      return {
        widthUnits,
        heightUnits,
        widthPx: Math.ceil(widthUnits * pxPerUnit),
        heightPx: Math.ceil(heightUnits * pxPerUnit),
        shift
      };
    }
    return canvasFromLayout(layout.widthUnits, layout.heightUnits, pxPerUnit, marginUnits);
  }, [assembledBounds, layout.heightUnits, layout.widthUnits, marginUnits, pxPerUnit, viewMode]);

  const gridSpacing = Math.max(gridSpacingUnits, 0.5);
  const gridLines = useMemo(() => {
    const lines: { x?: number; y?: number; isMajor: boolean }[] = [];
    const spacingPx = gridSpacing * pxPerUnit;
    const columns = Math.ceil(canvas.widthPx / spacingPx);
    const rows = Math.ceil(canvas.heightPx / spacingPx);

    for (let i = 0; i <= columns; i += 1) {
      const x = i * spacingPx;
      lines.push({ x, isMajor: i % 5 === 0 });
    }
    for (let j = 0; j <= rows; j += 1) {
      const y = j * spacingPx;
      lines.push({ y, isMajor: j % 5 === 0 });
    }
    return lines;
  }, [canvas.widthPx, canvas.heightPx, gridSpacing, pxPerUnit]);

  const handleVectorizeFile = useCallback(
    async (file?: File | null) => {
      if (!file) {
        setVectorizerStatus("Select a flat front render to vectorize.");
        return;
      }
      setVectorizerBusy(true);
      setVectorizerStatus("Sending to vectorizer…");
      try {
        const result = await vectorizeImage(file, { mode: "preview", retentionDays: 7 });
        setVectorizerResult(result);
        const outline = parseVectorizerOutline(result.svg);
        setVectorizerOutline(outline);
        setVectorizerStatus(outline ? "Vectorized outline captured" : "Vectorized (outline parse incomplete)");
        if (outline && file.name) {
          setFeedback(`Vectorized ${file.name}`);
        }
      } catch (err) {
        setVectorizerStatus(`Vectorize failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setVectorizerBusy(false);
      }
    },
    []
  );

  const onVectorizerFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    void handleVectorizeFile(file ?? null);
  }, [handleVectorizeFile]);

  const exportSvg = useCallback(() => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedLook.id}.svg`;
    link.click();
    URL.revokeObjectURL(url);
    setFeedback(`Saved ${selectedLook.id}.svg`);
  }, [selectedLook.id]);

  const exportPng = useCallback(() => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onerror = () => URL.revokeObjectURL(url);
    img.onload = () => {
      const canvasEl = document.createElement("canvas");
      canvasEl.width = canvas.widthPx;
      canvasEl.height = canvas.heightPx;
      const ctx = canvasEl.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0b1224";
      ctx.fillRect(0, 0, canvas.widthPx, canvas.heightPx);
      ctx.drawImage(img, 0, 0);
      const pngUrl = canvasEl.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = `${selectedLook.id}.png`;
      link.click();
      URL.revokeObjectURL(url);
      setFeedback(`Saved ${selectedLook.id}.png`);
    };
    img.src = url;
  }, [canvas.widthPx, canvas.heightPx, selectedLook.id]);

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportSpec, null, 2));
      setFeedback(`Copied ${selectedLook.id} design recipe to clipboard`);
    } catch {
      setFeedback("Could not copy JSON");
    }
  }, [exportSpec, selectedLook.id]);

  const randomizePalette = useCallback(() => {
    const rand = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
    setMeanderParams((p) => ({ ...p, palette: [rand(), rand(), rand()] }));
  }, []);

  return (
    <div className="p-4 text-sm text-slate-100 space-y-4">
      <Card className="bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-emerald-950/50 border border-emerald-900/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Warp-driven dresscode stack</CardTitle>
          <CardDescription className="text-xs text-slate-300">
            MJ + Gemini hold silhouettes; Vectorizer captures the 2D carrier; Helix/Phoenix drive meanders inside each piece.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="space-y-1 text-xs text-slate-300">
            <div className="font-semibold text-slate-100">Flow</div>
            <div>1) MJ: silhouettes + mood</div>
            <div>2) Gemini: front/side/back + piece split</div>
            <div>3) Vectorizer: flat SVG carrier for warp meanders</div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Guardrail</span>
              <span className={`rounded border px-2 py-0.5 text-[11px] ${guardBadgeClass}`}>{warpInputs.guard}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>tau_LC: {warpInputs.tauLC_ms != null ? `${warpInputs.tauLC_ms.toFixed(2)} ms` : "wall/c fallback"}</div>
              <div>Duty eff: {(warpInputs.dutyNorm * 100).toFixed(2)}%</div>
              <div>kappa_norm: {warpInputs.kappaNorm.toFixed(2)}</div>
              <div>Sectors live: {(warpInputs.sectorFraction * 100).toFixed(1)}%</div>
            </div>
          </div>
          <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span>Warp meander overlay</span>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={showPatterns}
                  onChange={(e) => setShowPatterns(e.target.checked)}
                />
                <span className="text-slate-200">enabled</span>
              </label>
            </div>
              <div className="text-slate-400">
                Driven by Helix/Phoenix (kappa_drive, tau_LC, duty, guardrails). Toggle to clip warp patterns into each silhouette.
              </div>
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-amber-100">Edge-grown meander (proto)</span>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-amber-400"
                    checked={showEdgeMeanders}
                    onChange={(e) => setShowEdgeMeanders(e.target.checked)}
                  />
                  <span className="text-amber-100">on</span>
                </label>
              </div>
              <div className="text-[11px] text-amber-50/80">
                Seeds neckline/CF/hem on every piece; tune density/curl/palette in the Ornament panel and click Regenerate for a new seeded growth.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/70 border-slate-800">
        <CardHeader>
          <CardTitle>Dresscode Drafting Board</CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Data -&gt; drawing: each look is measured shapes + offsets. Grid is in {selectedLook.units}. Outlines stay
            hollow; warp meanders are an overlay.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="space-y-3">
            <Label className="text-slate-300">Choose look</Label>
            <div className="grid grid-cols-1 gap-2">
              {LOOK_LIBRARY.map((look) => (
                <button
                  key={look.id}
                  onClick={() => setSelectedId(look.id)}
                  className={`text-left rounded border px-3 py-2 transition ${
                    look.id === selectedId
                      ? "border-emerald-400/70 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.3)]"
                      : "border-slate-800 hover:border-slate-600 bg-slate-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">{look.name}</div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide">{look.units}</span>
                  </div>
                  {look.description ? <div className="text-xs text-slate-400 mt-1">{look.description}</div> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-slate-300">Layout controls</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="scale" className="text-xs text-slate-400">
                  Scale (px per {selectedLook.units})
                </Label>
                <Input
                  id="scale"
                  type="number"
                  step="1"
                  value={pxPerUnit}
                  onChange={(e) => setPxPerUnit(Number(e.target.value) || 1)}
                  className="bg-slate-950 border-slate-800"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="grid" className="text-xs text-slate-400">
                  Grid spacing ({selectedLook.units})
                </Label>
                <Input
                  id="grid"
                  type="number"
                  step="0.5"
                  value={gridSpacingUnits}
                  onChange={(e) => setGridSpacingUnits(Number(e.target.value) || 1)}
                  className="bg-slate-950 border-slate-800"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Canvas</Label>
                <div className="text-xs text-slate-300">
                  {Math.round(canvas.widthUnits)} x {Math.round(canvas.heightUnits)} {selectedLook.units}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Scale legend</Label>
                <div className="text-xs text-slate-300">
                  1 {selectedLook.units} = {pxPerUnit.toFixed(1)} px
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={viewMode === "flat" ? "default" : "outline"}
                onClick={() => setViewMode("flat")}
              >
                Flat layout
              </Button>
              <Button
                size="sm"
                variant={viewMode === "assembled" ? "default" : "outline"}
                onClick={() => setViewMode("assembled")}
              >
                Assembled (align joins)
              </Button>
            </div>
            {selectedLook.gauge ? (
              <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
                <div className="font-semibold text-slate-100">Gauge block</div>
                <div>Machine: {selectedLook.gauge.machine ?? "-"}</div>
                <div>Gauge: {selectedLook.gauge.gaugeNumber ?? "-"}G</div>
                <div>
                  Wales/Courses per cm: {selectedLook.gauge.walesPerCm ?? "-"} / {selectedLook.gauge.coursesPerCm ?? "-"}
                </div>
              </div>
            ) : null}
            <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
              <div className="font-semibold text-slate-100">Warp pattern recipe</div>
              <div>Contours: {warpRecipe.contourLevels.length}</div>
              <div>
                Wiggle {warpRecipe.wiggle.toFixed(2)} | Stroke {warpRecipe.stroke.toFixed(2)} | Mode {warpRecipe.paletteMode}
              </div>
            </div>
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-amber-100">Ornament</div>
                  <div className="text-[11px] text-amber-50/80">Edge meanders with Mirek-style rule sets.</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMeanderParams((p) => ({ ...p, rngSeed: (p.rngSeed ?? 0) + 1 }))}
                >
                  Regenerate
                </Button>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-amber-50/80">Rule set</span>
                <select
                  value={meanderParams.rule}
                  onChange={(e) => setMeanderParams((p) => ({ ...p, rule: e.target.value as MeanderRuleId }))}
                  className="rounded border border-amber-500/50 bg-slate-950/70 px-2 py-1 text-amber-100"
                >
                  <option value="vine">Vine</option>
                  <option value="drift">Drift</option>
                  <option value="filigree">Filigree</option>
                  <option value="ca">Cellular</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="flex items-center justify-between text-[11px] text-amber-50/80">
                  <span>Density</span>
                  <span className="text-amber-100">
                    {meanderParams.seedSpacingCm.toFixed(1)} cm | {meanderParams.maxLengthCm.toFixed(0)} cm
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={densitySlider}
                  onChange={(e) => {
                    const d = parseFloat(e.target.value);
                    setMeanderParams((p) => ({
                      ...p,
                      seedSpacingCm: 2 + 10 * (1 - d),
                      maxLengthCm: 10 + 60 * d
                    }));
                  }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="flex items-center justify-between text-[11px] text-amber-50/80">
                  <span>Curl / Bendiness</span>
                  <span className="text-amber-100">{meanderParams.bendiness.toFixed(2)}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={curlSlider}
                  onChange={(e) => {
                    const b = parseFloat(e.target.value);
                    setMeanderParams((p) => ({
                      ...p,
                      bendiness: b,
                      noiseScale: 0.08 + b * 0.4
                    }));
                  }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="flex items-center justify-between text-[11px] text-amber-50/80">
                  <span>Thickness</span>
                  <span className="text-amber-100">{meanderParams.lineThicknessPx.toFixed(2)} px</span>
                </span>
                <input
                  type="range"
                  min={0.4}
                  max={3}
                  step={0.05}
                  value={meanderParams.lineThicknessPx}
                  onChange={(e) =>
                    setMeanderParams((p) => ({
                      ...p,
                      lineThicknessPx: parseFloat(e.target.value)
                    }))
                  }
                />
              </label>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-amber-50/80">Palette</span>
                  <Button size="sm" variant="ghost" className="text-amber-100 hover:text-amber-200" onClick={randomizePalette}>
                    Shuffle
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {meanderParams.palette.map((color, idx) => (
                    <label key={`palette-${idx}`} className="flex items-center gap-2">
                      <span className="h-6 w-6 rounded border border-slate-800" style={{ backgroundColor: color }} />
                      <input
                        type="color"
                        value={color}
                        onChange={(e) =>
                          setMeanderParams((p) => {
                            const palette = [...p.palette];
                            palette[idx] = e.target.value;
                            return { ...p, palette };
                          })
                        }
                        className="h-7 w-10 cursor-pointer rounded border border-slate-800 bg-slate-950/80"
                      />
                      <span className="text-[11px] text-amber-50/80">{color}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={exportSvg}>
                Export SVG
              </Button>
              <Button size="sm" variant="outline" onClick={exportPng}>
                Export PNG
              </Button>
              <Button size="sm" variant="ghost" onClick={copyJson}>
                Copy look JSON
              </Button>
            </div>
            {selectedLook.prompt ? (
              <div className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded p-2">
                Prompt note: {selectedLook.prompt}
              </div>
            ) : null}
            {feedback ? <div className="text-xs text-emerald-300">{feedback}</div> : null}
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Pieces + measurements</Label>
            <div className="grid grid-cols-1 gap-2 max-h-72 overflow-auto pr-1">
              {layout.placed.map((piece) => {
                return (
                  <div
                    key={piece.id}
                    className={`rounded border px-3 py-2 text-xs transition ${
                      highlightPiece === piece.id ? "border-emerald-400/80" : "border-slate-800"
                    }`}
                    onMouseEnter={() => setHighlightPiece(piece.id)}
                    onMouseLeave={() => setHighlightPiece(null)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-100">{piece.label}</span>
                      <span className="text-slate-400">
                        layout {piece.layoutOffset[0]}, {piece.layoutOffset[1]} {selectedLook.units}
                      </span>
                    </div>
                    <div className="text-slate-300">
                      {piece.bounds.width.toFixed(1)} x {piece.bounds.height.toFixed(1)} {selectedLook.units}
                    </div>
                    {piece.note ? <div className="text-slate-400 mt-1">{piece.note}</div> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-950/80 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Layout renderer</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Grid + labels; optional warp meander overlay from Helix/Phoenix. Outlines stay hollow for downstream texturing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-auto rounded border border-slate-800 bg-slate-950">
            <svg
              ref={svgRef}
              width={canvas.widthPx}
              height={canvas.heightPx}
              viewBox={`0 0 ${canvas.widthPx} ${canvas.heightPx}`}
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="100%" height="100%" fill="#0b1224" />
              {gridLines.map((line, idx) =>
                line.x !== undefined ? (
                  <line
                    key={`vx-${idx}`}
                    x1={line.x}
                    y1={0}
                    x2={line.x}
                    y2={canvas.heightPx}
                    stroke={line.isMajor ? "#1f2937" : "#132033"}
                    strokeWidth={line.isMajor ? 1 : 0.5}
                  />
              ) : (
                  <line
                    key={`vy-${idx}`}
                    x1={0}
                    y1={line.y}
                    x2={canvas.widthPx}
                    y2={line.y}
                    stroke={line.isMajor ? "#1f2937" : "#132033"}
                    strokeWidth={line.isMajor ? 1 : 0.5}
                  />
                )
              )}

              {viewMode === "assembled" && selectedLook.bodyAnchors
                ? (() => {
                    const entries = Object.entries(selectedLook.bodyAnchors ?? {});
                    if (entries.length === 0) return null;
                    const anchorPoints = entries.map(([, pt]) => pt);
                    const xs = anchorPoints.map(([x]) => x);
                    const ys = anchorPoints.map(([, y]) => y);
                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minY = Math.min(...ys);
                    const maxY = Math.max(...ys);
                    const axisPadding = 4;
                    const yLo = minY - axisPadding;
                    const yHi = maxY + axisPadding;
                    const toPx = ([x, y]: Vec2): [number, number] => [
                      (x + canvas.shift.x) * pxPerUnit,
                      (y + canvas.shift.y) * pxPerUnit
                    ];
                    const necks: Record<string, Vec2> = {};
                    const hems: Record<string, Vec2> = {};
                    entries.forEach(([id, pt]) => {
                      if (id.endsWith("_neck")) {
                        necks[id.replace(/_neck$/, "")] = pt;
                      } else if (id.endsWith("_hem")) {
                        hems[id.replace(/_hem$/, "")] = pt;
                      }
                    });
                    const measurementLines = Object.keys(necks)
                      .filter((base) => hems[base])
                      .map((base) => [necks[base], hems[base]] as [Vec2, Vec2]);
                    return (
                      <g id="body-anchor-overlay" opacity={0.65}>
                        <line
                          x1={toPx([0, yLo])[0]}
                          y1={toPx([0, yLo])[1]}
                          x2={toPx([0, yHi])[0]}
                          y2={toPx([0, yHi])[1]}
                          stroke="#1f2937"
                          strokeWidth={1.5}
                          strokeDasharray="6 5"
                        />
                        <line
                          x1={toPx([minX - axisPadding, 0])[0]}
                          y1={toPx([minX - axisPadding, 0])[1]}
                          x2={toPx([maxX + axisPadding, 0])[0]}
                          y2={toPx([maxX + axisPadding, 0])[1]}
                          stroke="#1f2937"
                          strokeWidth={1.25}
                          strokeDasharray="6 5"
                        />
                        {measurementLines.map(([a, b], idx) => {
                          const [ax, ay] = toPx(a);
                          const [bx, by] = toPx(b);
                          return (
                            <line
                              key={`measure-${idx}`}
                              x1={ax}
                              y1={ay}
                              x2={bx}
                              y2={by}
                              stroke="#334155"
                              strokeWidth={1.5}
                              strokeDasharray="4 4"
                            />
                          );
                        })}
                        {entries.map(([id, pt]) => {
                          const [px, py] = toPx(pt);
                          return (
                            <g key={`anchor-${id}`}>
                              <circle cx={px} cy={py} r={3.5} fill="#cbd5e1" stroke="#0f172a" strokeWidth={1.25} />
                              <text
                                x={px + 7}
                                y={py - 6}
                                fontSize={9}
                                fill="#e2e8f0"
                                alignmentBaseline="baseline"
                              >
                                {id}
                              </text>
                              <text x={px + 7} y={py + 8} fontSize={8.5} fill="#94a3b8">
                                {pt[0].toFixed(1)}, {pt[1].toFixed(1)} {selectedLook.units}
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    );
                  })()
                : null}

              {(() => {
                const piecesToRender =
                  viewMode === "assembled"
                    ? [...layout.placed].sort((a, b) => (a.assembled?.z ?? 0) - (b.assembled?.z ?? 0))
                    : layout.placed;
                return piecesToRender;
              })().map((piece) => {
                const pts = screenPointsForPiece(piece, pxPerUnit, viewMode, canvas.shift, assembledTransforms);
                const [cx, cy] = centroid(pts);
                const isHot = highlightPiece === piece.id;
                const pattern = piecePatterns[piece.id] ?? [];
                const patternPolylines =
                  showPatterns && pattern.length
                    ? pattern.map((stroke, pIdx) => {
                        const mapped = mapStrokeToScreen(
                          stroke,
                          piece,
                          pxPerUnit,
                          viewMode,
                          canvas.shift,
                          assembledTransforms
                        );
                        if (mapped.points.length < 2) return null;
                        const pointsStr = mapped.points.map((p) => p.join(",")).join(" ");
                        return (
                          <polyline
                            key={`${piece.id}-pattern-${pIdx}`}
                            points={pointsStr}
                            fill="none"
                            stroke={mapped.color}
                            strokeWidth={mapped.width}
                            strokeOpacity={mapped.opacity ?? 0.8}
                            strokeDasharray={mapped.dash}
                            pointerEvents="none"
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      })
                    : null;
                const edgeOverlays = (piece.edges ?? []).map((edge, eIdx) => {
                  const seg = edgePolyline(piece, edge, pxPerUnit, viewMode, canvas.shift, assembledTransforms);
                  if (seg.length < 2) return null;
                  const pointsStr = seg.map(([x, y]) => `${x},${y}`).join(" ");
                  const mid = seg[Math.floor(seg.length / 2)];
                  return (
                    <g key={`${piece.id}-edge-${edge.id}-${eIdx}`}>
                      <polyline
                        points={pointsStr}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth={isHot ? 2.5 : 1.5}
                        strokeDasharray="6 6"
                        vectorEffect="non-scaling-stroke"
                        opacity={0.8}
                      />
                      {mid ? (
                        <text
                          x={mid[0]}
                          y={mid[1] - 6}
                          textAnchor="middle"
                          alignmentBaseline="baseline"
                          fontSize={10}
                          fill="#38bdf8"
                        >
                          {edge.id}
                        </text>
                      ) : null}
                    </g>
                  );
                });
                const axisOverlay =
                  viewMode === "assembled" && piece.assembled
                    ? (() => {
                        const assembledSpec = piece.assembled!;
                        const axisEdge = (piece.edges ?? []).find((e) => e.id === assembledSpec.axisEdgeId);
                        const axisFold = (piece.foldLines ?? []).find((f) => f.id === assembledSpec.axisEdgeId);
                        let seg: [number, number][] = [];
                        if (axisFold) {
                          const t = assembledTransforms[piece.id] ?? identityTransform;
                          seg = axisFold.points.map((pt) => {
                            const [wx, wy] = applyTransform(pt as Vec2, t);
                            return [(wx + canvas.shift.x) * pxPerUnit, (wy + canvas.shift.y) * pxPerUnit];
                          });
                        } else if (axisEdge) {
                          seg = edgePolyline(piece, axisEdge, pxPerUnit, viewMode, canvas.shift, assembledTransforms);
                        } else {
                          return null;
                        }
                        if (seg.length < 2) return null;
                        const pointsStr = seg.map(([x, y]) => `${x},${y}`).join(" ");
                        const axisColor = "#e879f9";
                        const anchorPoint =
                          assembledSpec.anchorOnAxis === "start"
                            ? seg[0]
                            : assembledSpec.anchorOnAxis === "end"
                            ? seg[seg.length - 1]
                            : midpointOfPolyline(seg);
                        const bodyAnchor = selectedLook.bodyAnchors?.[assembledSpec.bodyAnchorId];
                        const bodyAnchorScreen = bodyAnchor
                          ? [(bodyAnchor[0] + canvas.shift.x) * pxPerUnit, (bodyAnchor[1] + canvas.shift.y) * pxPerUnit]
                          : null;
                        return (
                          <g key={`${piece.id}-axis`}>
                            <polyline
                              points={pointsStr}
                              fill="none"
                              stroke={axisColor}
                              strokeWidth={isHot ? 4 : 3}
                              strokeDasharray="4 3"
                              vectorEffect="non-scaling-stroke"
                              opacity={0.9}
                            />
                            {anchorPoint ? (
                              <g>
                                <circle cx={anchorPoint[0]} cy={anchorPoint[1]} r={4} fill="#0f172a" stroke={axisColor} strokeWidth={2} />
                                <text
                                  x={anchorPoint[0] + 6}
                                  y={anchorPoint[1] - 6}
                                  fontSize={10}
                                  fill={axisColor}
                                  alignmentBaseline="baseline"
                                >
                                  {assembledSpec.axisEdgeId} ({assembledSpec.anchorOnAxis})
                                </text>
                              </g>
                            ) : null}
                            {bodyAnchorScreen ? (
                              <circle
                                cx={bodyAnchorScreen[0]}
                                cy={bodyAnchorScreen[1]}
                                r={3.5}
                                fill="#fdf2f8"
                                stroke={axisColor}
                                strokeWidth={1.5}
                              />
                            ) : null}
                            {anchorPoint && bodyAnchorScreen ? (
                              <line
                                x1={anchorPoint[0]}
                                y1={anchorPoint[1]}
                                x2={bodyAnchorScreen[0]}
                                y2={bodyAnchorScreen[1]}
                                stroke={axisColor}
                                strokeWidth={1.5}
                                strokeDasharray="6 4"
                                vectorEffect="non-scaling-stroke"
                                opacity={0.8}
                              />
                            ) : null}
                          </g>
                        );
                      })()
                    : null;
                return (
                  <g key={piece.id}>
                    {patternPolylines}
                    <polygon
                      points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
                      fill="none"
                      stroke={piece.stroke ?? (isHot ? "#34d399" : "#94a3b8")}
                      strokeWidth={isHot ? 3 : 2}
                      strokeDasharray={piece.dashed ? "8 6" : undefined}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      onMouseEnter={() => setHighlightPiece(piece.id)}
                      onMouseLeave={() => setHighlightPiece(null)}
                    />
                    {pts.map(([sx, sy], idx) => (
                      <text
                        key={`${piece.id}-pt-${idx}`}
                        x={sx}
                        y={sy}
                        fontSize={10}
                        fill="#8b5cf6"
                        textAnchor="middle"
                        alignmentBaseline="central"
                      >
                        {idx}
                      </text>
                    ))}
                    {axisOverlay}
                    {edgeOverlays}
                    <text
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      alignmentBaseline="middle"
                      fontSize={12}
                      fill="#e2e8f0"
                    >
                      {piece.label}
                    </text>
                  </g>
                );
              })}

              {(selectedLook.joins ?? []).map((join, idx) => {
                const fromPiece = layout.placed.find((p) => p.id === join.from.pieceId);
                const toPiece = layout.placed.find((p) => p.id === join.to.pieceId);
                if (!fromPiece || !toPiece) return null;
                const fromEdge = (fromPiece.edges ?? []).find((e) => e.id === join.from.edgeId);
                const toEdge = (toPiece.edges ?? []).find((e) => e.id === join.to.edgeId);
                if (!fromEdge || !toEdge) return null;
                const fromPts = edgePolyline(fromPiece, fromEdge, pxPerUnit, viewMode, canvas.shift, assembledTransforms);
                const toPts = edgePolyline(toPiece, toEdge, pxPerUnit, viewMode, canvas.shift, assembledTransforms);
                if (fromPts.length === 0 || toPts.length === 0) return null;
                const [fx, fy] = midpointOfPolyline(fromPts);
                const [tx, ty] = midpointOfPolyline(toPts);
                const color =
                  join.joinType === "knit_join"
                    ? "#3b82f6"
                    : join.joinType === "linked"
                    ? "#f59e0b"
                    : "#10b981";
                return (
                  <g key={join.id ?? `join-${idx}`}>
                    <polyline
                      points={fromPts.map((p) => p.join(",")).join(" ")}
                      fill="none"
                      stroke={color}
                      strokeWidth={3}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      opacity={0.8}
                    />
                    <polyline
                      points={toPts.map((p) => p.join(",")).join(" ")}
                      fill="none"
                      stroke={color}
                      strokeWidth={3}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      opacity={0.8}
                    />
                    <line
                      x1={fx}
                      y1={fy}
                      x2={tx}
                      y2={ty}
                      stroke={color}
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={(fx + tx) / 2}
                      y={(fy + ty) / 2}
                      fontSize={10}
                      textAnchor="middle"
                      alignmentBaseline="central"
                      fill={color}
                    >
                      {join.id ?? `join-${idx}`}
                    </text>
                  </g>
                );
              })}

              <text x={12} y={20} fontSize={12} fill="#94a3b8">
                1 {selectedLook.units} = {pxPerUnit.toFixed(1)} px | grid {gridSpacing} {selectedLook.units}
              </text>
              <text x={canvas.widthPx - 80} y={canvas.heightPx - 12} fontSize={12} fill="#94a3b8">
                {selectedLook.name}
              </text>
            </svg>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/70 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Vectorizer microservice</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Upload a clean 2D render per piece; backend wraps vectorizer.ai with Basic auth from env (no creds in client).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <input
              ref={vectorizerInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onVectorizerFileChange}
            />
            <Button size="sm" onClick={() => vectorizerInputRef.current?.click()} disabled={vectorizerBusy}>
              {vectorizerBusy ? "Vectorizing..." : "Upload front render -> SVG"}
            </Button>
            <div className={vectorizerHealth?.ready ? "text-emerald-300" : "text-amber-300"}>
              {vectorizerHealth?.ready ? "Service ready (env creds only)" : "Set VECTORIZER_USER/PASS to enable"}
            </div>
            {vectorizerResult?.imageToken ? (
              <div className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1 text-slate-200">
                imageToken: {vectorizerResult.imageToken}
              </div>
            ) : null}
            {vectorizerResult?.receipt ? (
              <div className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1 text-slate-200">
                receipt: {vectorizerResult.receipt}
              </div>
            ) : null}
          </div>
          {vectorizerStatus ? <div className="text-xs text-slate-200">{vectorizerStatus}</div> : null}

          {vectorizerOutline ? (
            <div className="rounded border border-slate-800 bg-slate-950/60 p-3">
              <div className="mb-2 text-xs text-slate-400">SVG outline (warp meanders clipped inside)</div>
              <svg
                viewBox={`${vectorizerOutline.viewBox.minX} ${vectorizerOutline.viewBox.minY} ${vectorizerOutline.viewBox.width} ${vectorizerOutline.viewBox.height}`}
                className="h-64 w-full"
              >
                <defs>
                  <clipPath id={outlineClipId}>
                    <path d={vectorizerOutline.pathD} />
                  </clipPath>
                </defs>
                <path d={vectorizerOutline.pathD} fill="none" stroke="#fbbf24" strokeWidth={2} />
                {showPatterns
                  ? outlinePatterns.map((stroke, idx) => {
                      if (stroke.points.length < 2) return null;
                      const pointsStr = stroke.points.map((p) => p.join(",")).join(" ");
                      return (
                        <polyline
                          key={`outline-stroke-${idx}`}
                          points={pointsStr}
                          fill="none"
                          stroke={stroke.color}
                          strokeWidth={stroke.width}
                          strokeOpacity={stroke.opacity ?? 0.8}
                          strokeDasharray={stroke.dash}
                          pointerEvents="none"
                          vectorEffect="non-scaling-stroke"
                          clipPath={`url(#${outlineClipId})`}
                        />
                      );
                    })
                  : null}
              </svg>
            </div>
          ) : null}

          {vectorizerResult?.svg ? (
            <Textarea
              value={vectorizerResult.svg}
              readOnly
              className="font-mono text-[11px] bg-slate-950 border-slate-800 h-32"
            />
          ) : null}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/70 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Design recipe / Shima handoff</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Exports a DesignRecipe (front-end “style receipt”) for KnitPaint / APEXFiz / KnitManager. Not machine code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-slate-200">
          <div className="flex items-center justify-between">
            <div className="text-slate-300">Recipe version</div>
            <div className="rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[11px] text-emerald-200">
              {DESIGN_RECIPE_VERSION}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Target knit time</span>
              <span className="text-amber-100">{complexityBudget.targetMinutes.toFixed(0)} min</span>
            </div>
            <input
              type="range"
              min={10}
              max={180}
              step={5}
              value={complexityBudget.targetMinutes}
              onChange={(e) =>
                setComplexityBudget((p) => ({
                  ...p,
                  targetMinutes: Number(e.target.value)
                }))
              }
            />
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Max special regions</span>
              <span className="text-amber-100">{complexityBudget.maxSpecialRegions ?? 0}</span>
            </div>
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={complexityBudget.maxSpecialRegions ?? 0}
              onChange={(e) =>
                setComplexityBudget((p) => ({
                  ...p,
                  maxSpecialRegions: Number(e.target.value)
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <div className="text-slate-300">Preview / API hooks</div>
            <div className="flex flex-wrap gap-3">
              {(["apexFiz", "knitPaintOnline", "knitManager"] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 rounded border border-slate-700 px-2 py-1">
                  <input
                    type="checkbox"
                    checked={Boolean(previewHooks[key]?.requested)}
                    onChange={(e) =>
                      setPreviewHooks((prev) => ({
                        ...prev,
                        [key]: { requested: e.target.checked }
                      }))
                    }
                  />
                  <span className="capitalize text-slate-200">{key === "apexFiz" ? "APEXFiz" : key}</span>
                </label>
              ))}
            </div>
          </div>

          {recipeIssues.length ? (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-50">
              <div className="font-semibold text-amber-100">Recipe validation</div>
              <ul className="list-disc pl-4">
                {recipeIssues.map((issue, idx) => (
                  <li key={idx}>
                    <span className="text-amber-200">{issue.field}</span>: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-emerald-100">
              Passes basic recipe checks (template, palette, gauge, time &gt; 0).
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/70 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">JSON pattern spec</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Paste into pipelines or prompts. Each piece has polygon coords + an offset on the layout grid.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={JSON.stringify(exportSpec, null, 2)}
            readOnly
            className="font-mono text-xs bg-slate-950 border-slate-800 h-64"
          />
        </CardContent>
      </Card>
    </div>
  );
}
