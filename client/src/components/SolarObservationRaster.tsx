import React, { useEffect, useRef } from "react";

/** Native instrument grid: no disk clipping, WCS reprojecting or co-rotation. */
export function SolarObservationRaster({ data, size }: { data: Float32Array; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx || data.length !== size * size) return;
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < data.length; i++) {
      const v = Math.round(255 * Math.sqrt(Math.max(0, Math.min(1, data[i]))));
      // FITS array row zero is bottom; HTML canvas row zero is top.
      const j = ((size - 1 - Math.floor(i / size)) * size + i % size) * 4;
      image.data.set([v, v, v, 255], j);
    }
    ctx.putImageData(image, 0, 0);
  }, [data, size]);
  return <canvas ref={ref} width={size} height={size} aria-label="Observed solar instrument raster"
    className="w-full max-w-lg bg-black" />;
}
