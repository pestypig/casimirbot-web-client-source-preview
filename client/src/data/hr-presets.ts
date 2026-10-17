import { Rsun, Msun } from "@/physics/constants";
import type { HRCategory } from "@/models/star";

export interface HRPreset {
  label: string;
  color: string;
  M: number; // kg
  R: number; // m
  n: 1.5 | 3;
  X: number;
  Z: number;
  rotation: number;
  teff: number; // Kelvin
  luminosity: number; // W
  solver?: "polytrope" | "hydro-lite";
  notes?: string;
}

const solarX = 0.70;
const solarZ = 0.014;

const solMass = (value: number) => value * Msun;
const solRadius = (value: number) => value * Rsun;

export const HR_CATEGORY_STYLES: Record<HRCategory, { label: string; color: string }> = {
  "brown-dwarf": { label: "Brown Dwarf", color: "#b45309" },
  "ms-m": { label: "M Main Seq.", color: "#fb923c" },
  "ms-k": { label: "K Main Seq.", color: "#f97316" },
  "ms-g": { label: "G Main Seq.", color: "#facc15" },
  "ms-f": { label: "F Main Seq.", color: "#fef08a" },
  "ms-a": { label: "A Main Seq.", color: "#bae6fd" },
  "ms-b": { label: "B Main Seq.", color: "#60a5fa" },
  "ms-o": { label: "O Main Seq.", color: "#6366f1" },
  subgiant: { label: "Subgiant", color: "#fde047" },
  "red-giant": { label: "Red Giant", color: "#f87171" },
  supergiant: { label: "Supergiant", color: "#ef4444" },
  "white-dwarf": { label: "White Dwarf", color: "#e0f2fe" },
};

export const HR_PRESETS: Record<HRCategory, HRPreset> = {
  "brown-dwarf": {
    label: "Brown Dwarf",
    color: HR_CATEGORY_STYLES["brown-dwarf"].color,
    M: solMass(0.05),
    R: solRadius(0.1),
    n: 1.5,
    X: 0.72,
    Z: 0.02,
    rotation: 0.3,
    teff: 1500,
    luminosity: 1e-4 * 3.828e26,
    notes: "Partially degenerate, dusty atmospheres",
    solver: "polytrope",
  },
  "ms-m": {
    label: "M Main Sequence",
    color: HR_CATEGORY_STYLES["ms-m"].color,
    M: solMass(0.3),
    R: solRadius(0.3),
    n: 1.5,
    X: 0.70,
    Z: 0.02,
    rotation: 0.4,
    teff: 3400,
    luminosity: 0.012 * 3.828e26,
  },
  "ms-k": {
    label: "K Main Sequence",
    color: HR_CATEGORY_STYLES["ms-k"].color,
    M: solMass(0.75),
    R: solRadius(0.7),
    n: 1.5,
    X: solarX,
    Z: solarZ,
    rotation: 0.3,
    teff: 4800,
    luminosity: 0.3 * 3.828e26,
  },
  "ms-g": {
    label: "G Main Sequence",
    color: HR_CATEGORY_STYLES["ms-g"].color,
    M: solMass(1),
    R: solRadius(1),
    n: 1.5,
    X: solarX,
    Z: solarZ,
    rotation: 0.2,
    teff: 5770,
    luminosity: 3.828e26,
  },
  "ms-f": {
    label: "F Main Sequence",
    color: HR_CATEGORY_STYLES["ms-f"].color,
    M: solMass(1.4),
    R: solRadius(1.3),
    n: 1.5,
    X: 0.68,
    Z: 0.012,
    rotation: 0.2,
    teff: 7000,
    luminosity: 4 * 3.828e26,
  },
  "ms-a": {
    label: "A Main Sequence",
    color: HR_CATEGORY_STYLES["ms-a"].color,
    M: solMass(2.1),
    R: solRadius(1.7),
    n: 3,
    X: 0.66,
    Z: 0.010,
    rotation: 0.25,
    teff: 9000,
    luminosity: 17 * 3.828e26,
  },
  "ms-b": {
    label: "B Main Sequence",
    color: HR_CATEGORY_STYLES["ms-b"].color,
    M: solMass(5),
    R: solRadius(3.4),
    n: 3,
    X: 0.64,
    Z: 0.008,
    rotation: 0.3,
    teff: 16000,
    luminosity: 800 * 3.828e26,
  },
  "ms-o": {
    label: "O Main Sequence",
    color: HR_CATEGORY_STYLES["ms-o"].color,
    M: solMass(20),
    R: solRadius(8),
    n: 3,
    X: 0.60,
    Z: 0.006,
    rotation: 0.35,
    teff: 35000,
    luminosity: 1.5e5 * 3.828e26,
    solver: "polytrope",
  },
  subgiant: {
    label: "Subgiant",
    color: HR_CATEGORY_STYLES["subgiant"].color,
    M: solMass(1.5),
    R: solRadius(3.2),
    n: 1.5,
    X: 0.20,
    Z: solarZ,
    rotation: 0.15,
    teff: 5200,
    luminosity: 10 * 3.828e26,
  },
  "red-giant": {
    label: "Red Giant",
    color: HR_CATEGORY_STYLES["red-giant"].color,
    M: solMass(1),
    R: solRadius(50),
    n: 1.5,
    X: 0.10,
    Z: 0.02,
    rotation: 0.05,
    teff: 3800,
    luminosity: 500 * 3.828e26,
  },
  supergiant: {
    label: "Supergiant",
    color: HR_CATEGORY_STYLES["supergiant"].color,
    M: solMass(15),
    R: solRadius(500),
    n: 3,
    X: 0.35,
    Z: 0.010,
    rotation: 0.2,
    teff: 4000,
    luminosity: 1e5 * 3.828e26,
  },
  "white-dwarf": {
    label: "White Dwarf",
    color: HR_CATEGORY_STYLES["white-dwarf"].color,
    M: solMass(0.6),
    R: solRadius(0.012),
    n: 1.5,
    X: 0,
    Z: 0.0,
    rotation: 0.02,
    teff: 12000,
    luminosity: 0.01 * 3.828e26,
    notes: "Use hydro-lite to emphasize mass-radius inversion",
    solver: "hydro-lite",
  },
};

export type HRSwatch = {
  category: HRCategory;
  teffRange: [number, number];
  lumRange: [number, number];
  color: string;
};

export const HR_SWATCHES: HRSwatch[] = [
  {
    category: "brown-dwarf",
    teffRange: [800, 2500],
    lumRange: [1e-6, 1e-3],
    color: HR_CATEGORY_STYLES["brown-dwarf"].color,
  },
  {
    category: "ms-m",
    teffRange: [2500, 3900],
    lumRange: [1e-3, 0.1],
    color: HR_CATEGORY_STYLES["ms-m"].color,
  },
  {
    category: "ms-k",
    teffRange: [3900, 5200],
    lumRange: [0.1, 1],
    color: HR_CATEGORY_STYLES["ms-k"].color,
  },
  {
    category: "ms-g",
    teffRange: [5200, 6200],
    lumRange: [0.6, 6],
    color: HR_CATEGORY_STYLES["ms-g"].color,
  },
  {
    category: "ms-f",
    teffRange: [6200, 7500],
    lumRange: [2, 20],
    color: HR_CATEGORY_STYLES["ms-f"].color,
  },
  {
    category: "ms-a",
    teffRange: [7500, 10000],
    lumRange: [10, 80],
    color: HR_CATEGORY_STYLES["ms-a"].color,
  },
  {
    category: "ms-b",
    teffRange: [10000, 25000],
    lumRange: [60, 1e3],
    color: HR_CATEGORY_STYLES["ms-b"].color,
  },
  {
    category: "ms-o",
    teffRange: [25000, 45000],
    lumRange: [1e3, 1e6],
    color: HR_CATEGORY_STYLES["ms-o"].color,
  },
  {
    category: "red-giant",
    teffRange: [3200, 4500],
    lumRange: [100, 5e3],
    color: HR_CATEGORY_STYLES["red-giant"].color,
  },
  {
    category: "supergiant",
    teffRange: [3500, 11000],
    lumRange: [1e4, 1e6],
    color: HR_CATEGORY_STYLES["supergiant"].color,
  },
  {
    category: "white-dwarf",
    teffRange: [6000, 40000],
    lumRange: [1e-3, 0.1],
    color: HR_CATEGORY_STYLES["white-dwarf"].color,
  },
];
