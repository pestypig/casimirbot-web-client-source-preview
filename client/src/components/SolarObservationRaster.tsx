import React, { useEffect, useRef } from "react";
import {solarDisplayRgb,type SolarImagePalette} from '../lib/solar-aia193-display';

/** Native instrument grid: no disk clipping, WCS reprojecting or co-rotation. */
export function SolarObservationRaster({ data, size, palette='grayscale/1' }: {
  data: Float32Array; size: number; palette?: SolarImagePalette;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx || data.length !== size * size) return;
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < data.length; i++) {
      const rgb=solarDisplayRgb(data[i],palette);
      // FITS array row zero is bottom; HTML canvas row zero is top.
      const j = ((size - 1 - Math.floor(i / size)) * size + i % size) * 4;
      image.data.set([...rgb,255], j);
    }
    ctx.putImageData(image, 0, 0);
  }, [data, size, palette]);
  return <canvas ref={ref} width={size} height={size} aria-label="Observed solar instrument raster"
    className="block w-full max-w-lg bg-black" />;
}
