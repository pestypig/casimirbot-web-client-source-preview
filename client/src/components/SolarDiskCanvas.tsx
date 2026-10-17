import React, { useEffect, useRef } from "react";

export type SolarDiskMode = "observer" | "corotating";

export interface DiskGeom {
  cx: number; // disk centre in source/frame pixels
  cy: number;
  r: number; // disk radius in source/frame pixels
  thetaObs: number; // observer rotation angle (radians), 0 = north up
  frameWidth?: number; // optional original frame width for scaling
  frameHeight?: number; // optional original frame height for scaling
}

export type DiskEventGlyph = {
  id: string;
  type: string;
  u: number; // +E/right
  v: number; // +N/up
  label?: string;
  selected?: boolean;
};

export interface SolarDiskCanvasProps {
  mode: SolarDiskMode;
  width: number;
  height: number;
  /** Co-rotating Sun-centric grid, length = gridSize * gridSize, values ~ [0,1] */
  mapSun: Float32Array | number[];
  gridSize: number;
  /**
   * In observer mode, diskGeom tells us where the Sun is in the video frame.
   * In corotating mode it's ignored (we center the disk).
   */
  diskGeom?: DiskGeom;
  /**
   * Optional: custom colormap. Input in [0,1], return [r,g,b,a] in 0-255.
   * If omitted, a simple blue->purple->white map is used.
   */
  valueToColor?: (v: number) => [number, number, number, number];
  className?: string;
  events?: DiskEventGlyph[];
  onEventClick?: (id: string) => void;
  onEventHover?: (id: string | null) => void;
}

/**
 * SolarDiskCanvas draws a Sun-centric grid ("mapSun") as a circular disk.
 * - mode="observer": draws at diskGeom.cx/cy/r, rotated by thetaObs to match the feed.
 * - mode="corotating": draws a static north-up disk centered in the canvas.
 */
export const SolarDiskCanvas: React.FC<SolarDiskCanvasProps> = ({
  mode,
  width,
  height,
  mapSun,
  gridSize,
  diskGeom,
  valueToColor,
  className,
  events,
  onEventClick,
  onEventHover,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const eventHitboxes = useRef<Array<{ id: string; x: number; y: number; r: number }>>([]);

  // Simple default colormap: 0 = transparent, mid = blue, high = magenta/white.
  const defaultValueToColor = (vRaw: number): [number, number, number, number] => {
    const v = Math.min(1, Math.max(0, vRaw)); // clamp
    if (v <= 0) return [0, 0, 0, 0];

    // Piecewise gradient: 0..0.5 blue, 0.5..0.8 purple, 0.8..1.0 white-ish
    if (v < 0.5) {
      const t = v / 0.5; // 0..1
      const r = 0;
      const g = Math.floor(64 * t);
      const b = Math.floor(180 + 75 * t);
      return [r, g, b, 180];
    }
    if (v < 0.8) {
      const t = (v - 0.5) / 0.3;
      const r = Math.floor(80 + 120 * t);
      const g = Math.floor(40 * (1 - t));
      const b = Math.floor(200);
      return [r, g, b, 200];
    }
    const t = (v - 0.8) / 0.2;
    const r = Math.floor(200 + 55 * t);
    const g = Math.floor(80 + 175 * t);
    const b = Math.floor(210 + 45 * t);
    return [r, g, b, 230];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Guard: no data yet
    if (!mapSun || gridSize <= 0) return;

    const N = gridSize;
    const vals = mapSun as ArrayLike<number>;
    const toColor = valueToColor ?? defaultValueToColor;

    // Determine disk center/radius
    let cx: number;
    let cy: number;
    let r: number;
    let theta: number = 0;

    if (mode === "observer" && diskGeom) {
      const scaleX =
        diskGeom.frameWidth && diskGeom.frameWidth > 0 ? width / diskGeom.frameWidth : 1;
      const scaleY =
        diskGeom.frameHeight && diskGeom.frameHeight > 0 ? height / diskGeom.frameHeight : 1;
      const scale = Math.min(scaleX, scaleY);
      cx = diskGeom.cx * scaleX;
      cy = diskGeom.cy * scaleY;
      r = diskGeom.r * scale;
      theta = diskGeom.thetaObs || 0;
    } else {
      // center in canvas; use ~96% of min dimension
      cx = width / 2;
      cy = height / 2;
      r = Math.min(width, height) * 0.48;
      theta = 0;
    }

    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Loop over canvas pixels, sample from mapSun
    for (let y = 0; y < height; y++) {
      const dyCanvas = y - cy;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        let dx = x - cx;
        let dy = dyCanvas;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > r * r) {
          // Outside the disk -> fully transparent
          data[idx + 3] = 0;
          continue;
        }

        // In observer mode, mapSun is in co-rotating ("Sun") coords,
        // so we rotate canvas coords back into that frame.
        if (mode === "observer") {
          const dxp = dx * cosT + dy * sinT;
          const dyp = -dx * sinT + dy * cosT;
          dx = dxp;
          dy = dyp;
        }

        // Normalize to unit disk coords in [-1,1]
        const u = dx / r; // -1..1
        const v = dy / r; // -1..1

        // Map to grid indices
        const gx = Math.round((u + 1) * 0.5 * (N - 1));
        const gy = Math.round((v + 1) * 0.5 * (N - 1));
        if (gx < 0 || gx >= N || gy < 0 || gy >= N) {
          data[idx + 3] = 0;
          continue;
        }

        const k = gy * N + gx;
        const value = vals[k] ?? 0;
        const [rC, gC, bC, aC] = toColor(value);

        data[idx] = rC;
        data[idx + 1] = gC;
        data[idx + 2] = bC;
        data[idx + 3] = aC;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Overlay HEK glyphs on top of the disk.
    eventHitboxes.current = [];
    if (events && events.length) {
      const colorForType = (type: string): string => {
        const key = type?.toUpperCase?.() ?? "";
        if (key === "FL") return "#f59e0b"; // amber
        if (key === "AR") return "#60a5fa"; // blue
        if (key === "CH") return "#14b8a6"; // teal
        if (key === "CE") return "#f97316"; // orange
        if (key === "CJ") return "#22d3ee"; // cyan
        return "#e5e7eb"; // neutral light
      };

      const uvToCanvas = (u: number, vNorthUp: number) => {
        // map u,v (north up) into canvas pixels
        const dx = u * r;
        const dy = -vNorthUp * r; // flip because canvas y grows downward
        const dxRot = dx * cosT - dy * sinT;
        const dyRot = dx * sinT + dy * cosT;
        const x = cx + dxRot;
        const y = cy + dyRot;
        return { x, y };
      };

      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      for (const ev of events) {
        if (!Number.isFinite(ev.u) || !Number.isFinite(ev.v)) continue;
        const { x, y } = uvToCanvas(ev.u, ev.v);
        const radius = ev.selected ? 6 : 4;
        const color = colorForType(ev.type);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `${color}cc`;
        ctx.strokeStyle = ev.selected ? "#fef9c3" : color;
        ctx.fill();
        ctx.stroke();

        const label = ev.label ?? ev.type?.toUpperCase?.() ?? "";
        if (label) {
          ctx.fillStyle = "#e5e7eb";
          ctx.fillText(label, x + radius + 2, y);
        }
        eventHitboxes.current.push({ id: ev.id, x, y, r: radius + 4 });
      }
      ctx.restore();
    }
  }, [mode, width, height, mapSun, gridSize, diskGeom, valueToColor, events]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!onEventClick && !onEventHover) return;
    const handlePointer = (evt: MouseEvent, isClick: boolean) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (evt.clientX - rect.left) * scaleX;
      const y = (evt.clientY - rect.top) * scaleY;
      let hitId: string | null = null;
      for (const hb of eventHitboxes.current) {
        const dx = x - hb.x;
        const dy = y - hb.y;
        if (dx * dx + dy * dy <= hb.r * hb.r) {
          hitId = hb.id;
          break;
        }
      }
      if (isClick && hitId && onEventClick) {
        onEventClick(hitId);
      }
      if (!isClick && onEventHover) {
        onEventHover(hitId);
      }
      canvas.style.cursor = hitId ? "pointer" : "default";
    };
    const moveHandler = (evt: MouseEvent) => handlePointer(evt, false);
    const clickHandler = (evt: MouseEvent) => handlePointer(evt, true);
    const leaveHandler = () => {
      if (onEventHover) onEventHover(null);
      canvas.style.cursor = "default";
    };
    canvas.addEventListener("mousemove", moveHandler);
    canvas.addEventListener("click", clickHandler);
    canvas.addEventListener("mouseleave", leaveHandler);
    return () => {
      canvas.removeEventListener("mousemove", moveHandler);
      canvas.removeEventListener("click", clickHandler);
      canvas.removeEventListener("mouseleave", leaveHandler);
    };
  }, [onEventClick, onEventHover, events]);

  return <canvas ref={canvasRef} width={width} height={height} className={className} />;
};
