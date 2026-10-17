import type { SurfacePalette } from "./types";

export const SURFACE_PALETTES: SurfacePalette[] = [
  {
    id: "halo-teal",
    label: "Halo Teal",
    base: "#0b1220",
    ink: "#7fd1c8",
    inkSoft: "#3a6d6a",
    laminate: "#1b3a4b",
    laminateSoft: "#25495b",
    glow: "#59c8ff",
  },
  {
    id: "ion-blue",
    label: "Ion Blue",
    base: "#060a14",
    ink: "#88b6ff",
    inkSoft: "#3a4f70",
    laminate: "#182848",
    laminateSoft: "#213a5c",
    glow: "#6bc1ff",
  },
  {
    id: "ember-copper",
    label: "Ember Copper",
    base: "#0f0b0a",
    ink: "#f0b390",
    inkSoft: "#6a4a3a",
    laminate: "#2a1712",
    laminateSoft: "#3b221b",
    glow: "#ff9b6a",
  },
  {
    id: "verdant",
    label: "Verdant",
    base: "#0b0f0d",
    ink: "#9bd4a8",
    inkSoft: "#4b6a52",
    laminate: "#14261f",
    laminateSoft: "#1a3228",
    glow: "#74f0c3",
  },
];

export function findSurfacePalette(id?: string) {
  if (!id) return undefined;
  return SURFACE_PALETTES.find((palette) => palette.id === id);
}
