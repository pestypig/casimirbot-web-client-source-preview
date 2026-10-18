import type { SurfaceSlate } from "./types";

import bwLinear01 from "@/assets/surfacekit/gradients/bw-linear-01.svg?raw";
import bwLinear02 from "@/assets/surfacekit/gradients/bw-linear-02.svg?raw";
import bwRadial01 from "@/assets/surfacekit/gradients/bw-radial-01.svg?raw";

import laminate01 from "@/assets/surfacekit/laminates/laminate-01.svg?raw";
import laminate02 from "@/assets/surfacekit/laminates/laminate-02.svg?raw";

import meander01 from "@/assets/surfacekit/meanders/meander-01.svg?raw";
import meander02 from "@/assets/surfacekit/meanders/meander-02.svg?raw";

import microGrid01 from "@/assets/surfacekit/micro/micro-grid-01.svg?raw";
import microDots01 from "@/assets/surfacekit/micro/micro-dots-01.svg?raw";

export const SURFACE_GRADIENTS: SurfaceSlate[] = [
  { id: "bw-linear-01", svg: bwLinear01 },
  { id: "bw-linear-02", svg: bwLinear02 },
  { id: "bw-radial-01", svg: bwRadial01 },
];

export const SURFACE_LAMINATES: SurfaceSlate[] = [
  { id: "laminate-01", svg: laminate01 },
  { id: "laminate-02", svg: laminate02 },
];

export const SURFACE_MEANDERS: SurfaceSlate[] = [
  { id: "meander-01", svg: meander01 },
  { id: "meander-02", svg: meander02 },
];

export const SURFACE_MICRO: SurfaceSlate[] = [
  { id: "micro-grid-01", svg: microGrid01 },
  { id: "micro-dots-01", svg: microDots01 },
];
