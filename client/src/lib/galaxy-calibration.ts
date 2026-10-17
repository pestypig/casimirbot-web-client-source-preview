// client/src/lib/galaxy-calibration.ts

const DEV = process.env.NODE_ENV !== "production";

export type SvgCalib = {
  svgW: number; svgH: number;         // 3178.3178, 4493.4838
  sunSvgX: number; sunSvgY: number;    // 1608.7281, 2130.0217
  radiusPc: number;                    // 6000
};

/** Convert SVG-native calibration to the current image's pixel space. */
export function calibrateToImage(
  imgNatW: number, imgNatH: number,
  svg: SvgCalib
) {
  // scale factors from SVG coord space to this image's pixels
  const sx = imgNatW / svg.svgW;
  const sy = imgNatH / svg.svgH;

  // Sun origin in image pixels
  const originPx = { x: svg.sunSvgX * sx, y: svg.sunSvgY * sy };

  // px per pc (use the limiting half-dimension just like the SVG radius does)
  const svgPxPerPc = (svg.svgW / 2) / svg.radiusPc; // ≈ 0.2648598167
  const pxPerPc = svgPxPerPc * sx; // consistent in X; map is circular so sx≈sy

  if (DEV) console.log(`🌌 Galaxy calibration computed:`, {
    imageSize: `${imgNatW}×${imgNatH}`,
    svgSize: `${svg.svgW}×${svg.svgH}`,
    scaleFactors: { sx, sy },
    solPosition: `SVG(${svg.sunSvgX}, ${svg.sunSvgY}) → IMG(${originPx.x.toFixed(1)}, ${originPx.y.toFixed(1)})`,
    parsecScale: `${pxPerPc.toFixed(4)} px/pc`
  });

  return { originPx, pxPerPc };
}

// SVG calibration data extracted from the original map_2020_6000pc.svg
export const SVG_CALIB: SvgCalib = {
  svgW: 3178.3178,
  svgH: 4493.4838,
  sunSvgX: 1608.7281,
  sunSvgY: 2130.0217,
  radiusPc: 6000,
};