import { HR_CATEGORY_STYLES as HEX_HR_STYLES } from "@/data/hr-presets";

type Rgb = [number, number, number];

function hexToRgb01(hex: string): Rgb {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r / 255, g / 255, b / 255];
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return [0.85, 0.85, 0.85];
  return [r / 255, g / 255, b / 255];
}

const styles: Record<string, { rgb: Rgb }> = Object.fromEntries(
  Object.entries(HEX_HR_STYLES).map(([k, v]) => [k, { rgb: hexToRgb01(v.color) }]),
) as Record<string, { rgb: Rgb }>;

const spectralAlias = (key: string, fallbackHexKey: keyof typeof HEX_HR_STYLES) =>
  styles[key] ?? { rgb: hexToRgb01(HEX_HR_STYLES[fallbackHexKey]?.color ?? "#d1d5db") };

styles.O = spectralAlias("O", "ms-o");
styles.B = spectralAlias("B", "ms-b");
styles.A = spectralAlias("A", "ms-a");
styles.F = spectralAlias("F", "ms-f");
styles.G = spectralAlias("G", "ms-g");
styles.K = spectralAlias("K", "ms-k");
styles.M = spectralAlias("M", "ms-m");
styles.BD = spectralAlias("BD", "brown-dwarf");

export const HR_CATEGORY_STYLES = styles;
