import type { LumaMood } from "../luma-moods";

export type SurfaceContext =
  | "desktop-wallpaper"
  | "desktop-window"
  | "mobile-shell"
  | "mobile-panel";

export type SurfaceOrientation = "desktop" | "mobile";

export type SurfacePalette = {
  id: string;
  label: string;
  base: string;
  ink: string;
  inkSoft: string;
  laminate: string;
  laminateSoft: string;
  glow: string;
};

export type SurfaceSlate = {
  id: string;
  svg: string;
};

export type SurfaceLayerKind = "base" | "world" | "page" | "gradient" | "laminate" | "meander" | "micro";

export type SurfaceLayerMotion =
  | {
      type: "none";
    }
  | {
      type: "wander";
      durationMs: number;
      scale: number;
      xPct: number;
      yPct: number;
    }
  | {
      type: "scroll-x";
      durationMs: number;
      direction: "left" | "right";
    };

export type SurfaceLayer = {
  id: string;
  kind: SurfaceLayerKind;
  opacity: number;
  blendMode?: "normal" | "multiply" | "screen" | "overlay" | "soft-light";
  transform?: string;
  filter?: string;
  svg?: string;
  imageUrl?: string;
  background?: string;
  motion?: SurfaceLayerMotion;
  mask?: "center-safe" | "none";
  source?: "asset" | "process_graph";
};

export type SurfaceWorldAsset = {
  id: string;
  mood: LumaMood;
  orientation: SurfaceOrientation;
  src: string;
  mode: "wander" | "scroll-x";
  repeatX?: boolean;
  safeCenter?: boolean;
};

export type SurfaceRecipe = {
  id: string;
  seed: string;
  context: SurfaceContext;
  palette: SurfacePalette;
  vars: Record<string, string>;
  layers: SurfaceLayer[];
};
