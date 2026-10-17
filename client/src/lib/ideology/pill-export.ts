import { toPng, toSvg } from "html-to-image";

export type PillExportFormat = "png" | "svg";

type RgbaColor = { r: number; g: number; b: number; a: number };

type ExportPillOptions = {
  pixelRatio?: number;
  padding?: number;
};

const DEFAULT_PADDING = 16;
const DEFAULT_PIXEL_RATIO = 2;
const FALLBACK_EXPORT_BG: RgbaColor = { r: 11, g: 17, b: 32, a: 1 };

const parseRgba = (value: string | null): RgbaColor | null => {
  if (!value || value === "transparent") return null;
  const parts = value.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return null;
  const [r, g, b] = parts;
  const a = parts[3] ?? "1";
  return {
    r: Number(r),
    g: Number(g),
    b: Number(b),
    a: Number(a),
  };
};

const compositeRgba = (foreground: RgbaColor, background: RgbaColor): RgbaColor => {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const r =
    (foreground.r * foreground.a +
      background.r * background.a * (1 - foreground.a)) /
    alpha;
  const g =
    (foreground.g * foreground.a +
      background.g * background.a * (1 - foreground.a)) /
    alpha;
  const b =
    (foreground.b * foreground.a +
      background.b * background.a * (1 - foreground.a)) /
    alpha;
  return { r, g, b, a: alpha };
};

const formatRgb = (color: RgbaColor) =>
  `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;

const resolveBaseBackground = (node: HTMLElement | null): RgbaColor => {
  const layers: RgbaColor[] = [];
  let current = node;
  while (current) {
    const color = parseRgba(window.getComputedStyle(current).backgroundColor);
    if (color && color.a > 0) {
      layers.push(color);
    }
    current = current.parentElement;
  }
  if (layers.length === 0) {
    return FALLBACK_EXPORT_BG;
  }
  let base = FALLBACK_EXPORT_BG;
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    base = compositeRgba(layers[index], base);
  }
  return base;
};

const resolveExportBackground = (node: HTMLElement, backgroundColor: string): string => {
  const overlay = parseRgba(backgroundColor);
  const base = resolveBaseBackground(node.parentElement);
  if (!overlay || overlay.a === 0) {
    return formatRgb(base);
  }
  if (overlay.a >= 1) {
    return formatRgb(overlay);
  }
  return formatRgb(compositeRgba(overlay, base));
};

const hideExportControls = (node: HTMLElement) => {
  const controls = Array.from(
    node.querySelectorAll<HTMLElement>('[data-export-control="true"]'),
  );
  const previous = controls.map((control) => ({
    control,
    opacity: control.style.opacity,
    pointerEvents: control.style.pointerEvents,
  }));
  controls.forEach((control) => {
    control.style.opacity = "0";
    control.style.pointerEvents = "none";
  });
  return () => {
    previous.forEach(({ control, opacity, pointerEvents }) => {
      control.style.opacity = opacity;
      control.style.pointerEvents = pointerEvents;
    });
  };
};

const waitForFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

export async function exportNodeToImage(
  node: HTMLElement,
  format: PillExportFormat,
  options: ExportPillOptions = {},
): Promise<string> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
  await waitForFrame();

  const computed = window.getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  const baseWidth = Math.ceil(rect.width || node.scrollWidth);
  const baseHeight = Math.ceil(rect.height || node.scrollHeight);
  const padding = Number.isFinite(options.padding)
    ? Math.max(0, options.padding ?? 0)
    : DEFAULT_PADDING;
  const width = baseWidth + padding * 2;
  const height = baseHeight + padding * 2;
  const borderRadius = computed.borderRadius;
  const exportBackground = resolveExportBackground(node, computed.backgroundColor);
  const restoreControls = hideExportControls(node);

  try {
    const style = {
      width: `${baseWidth}px`,
      height: `${baseHeight}px`,
      borderRadius,
      overflow: "hidden",
      boxSizing: "border-box",
      backgroundColor: exportBackground,
      transform: `translate(${padding}px, ${padding}px)`,
      transformOrigin: "top left",
    };
    if (format === "svg") {
      return await toSvg(node, {
        backgroundColor: "transparent",
        width,
        height,
        style,
      });
    }
    return await toPng(node, {
      pixelRatio: options.pixelRatio ?? DEFAULT_PIXEL_RATIO,
      backgroundColor: "transparent",
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      style,
    });
  } finally {
    restoreControls();
  }
}
