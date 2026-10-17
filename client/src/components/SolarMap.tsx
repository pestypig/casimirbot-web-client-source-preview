// client/src/components/SolarMap.tsx
import * as React from "react";
import { computeSolarXY, SolarPoint } from "@/lib/solar-adapter";

type PolylinePointAU = { x_au: number; y_au: number; alpha?: number };
type PolylineStyle = {
  stroke?: string;
  width?: number;
  dash?: number[];
  composite?: GlobalCompositeOperation;
};

type Props = {
  width?: number;              // optional; panel can drive size
  height?: number;
  routeIds?: string[];
  onPickBody?: (id: string) => void;
  centerOnId?: string;
  centerBetweenIds?: [string, string];
  /** Optional: fit the camera so all these bodies are fully visible */
  fitToIds?: string[];
  /** Optional padding (px) when fitting */
  fitMarginPx?: number;
  /** OPTIONAL: background polyline to draw in AU coords (e.g., barycentric trail) */
  backgroundPolylineAU?: PolylinePointAU[];
  /** OPTIONAL: style for the background polyline */
  backgroundPolylineStyle?: PolylineStyle;
  /** OPTIONAL: visual magnification of AU background polyline (AU → AU*gain). Default 1. */
  backgroundPolylineGain?: number;
};

/* ----------------- helpers ----------------- */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Computes a "fit" (zoom & offset) for a bounding box (in AU) into a viewport (px). */
function fitBoxToViewport(
  bbox: {minX: number; minY: number; maxX: number; maxY: number},
  viewW: number,
  viewH: number,
  marginPx: number
) {
  const boxW = Math.max(1e-9, bbox.maxX - bbox.minX);
  const boxH = Math.max(1e-9, bbox.maxY - bbox.minY);
  const sx = (viewW - 2 * marginPx) / boxW;
  const sy = (viewH - 2 * marginPx) / boxH;
  const zoom = Math.max(1, Math.min(sx, sy)); // px/AU
  const cx = (bbox.minX + bbox.maxX) * 0.5;
  const cy = (bbox.minY + bbox.maxY) * 0.5;
  // screen center in px
  const scrCx = viewW * 0.5;
  const scrCy = viewH * 0.5;
  // offset so that world (cx,cy) appears at screen center
  const offset = { x: scrCx - cx * zoom, y: scrCy - cy * zoom };
  return { zoom, offset };
}

export function SolarMap({
  width,
  height,
  routeIds = [],
  onPickBody,
  centerOnId,
  centerBetweenIds,
  fitToIds = [],
  fitMarginPx = 24,
  backgroundPolylineAU,
  backgroundPolylineStyle,
  backgroundPolylineGain = 1,
}: Props) {
  /** Responsive size (fits the card) */
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState(() => ({
    w: width ?? 720,
    h: height ?? 360
  }));

  React.useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      // If explicit width/height props are given, honor them;
      // otherwise use container width/height.
      setSize({
        w: width ?? Math.max(320, Math.floor(r.width)),
        h: height ?? Math.max(240, Math.floor(r.height)),
      });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [width, height]);

  /** View state */
  const [zoom, setZoom] = React.useState(80); // px/AU
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const minZoom = 10, maxZoom = 500;

  /** Track "base fit" so Reset returns to the fitted view */
  const baseFitRef = React.useRef<{zoom: number; offset: {x: number; y: number}} | null>(null);

  /** Mount diagnostics */
  const instanceId = React.useRef(Math.random().toString(36).slice(2));
  React.useEffect(() => {
    console.count(`[SolarMap] mounted id=${instanceId.current}`);
    return () => console.log(`[SolarMap] unmounted id=${instanceId.current}`);
  }, []);

  /** Canvas + drawing */
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = React.useState<SolarPoint[]>([]);

  // Update planetary positions every 30 seconds
  React.useEffect(() => {
    const updatePositions = () => setPoints(computeSolarXY());
    updatePositions(); // Initial load
    const id = setInterval(updatePositions, 30000);
    return () => clearInterval(id);
  }, []);

  // Get bodies in AU coordinates for fitting
  const getBodiesAU = React.useCallback((ids: string[]): {x: number; y: number}[] => {
    return ids.map(id => {
      const body = points.find(p => p.id === id);
      return body ? { x: body.x_au, y: body.y_au } : { x: 0, y: 0 };
    });
  }, [points]);

  // Initial fit or refit when size/targets change
  React.useLayoutEffect(() => {
    if (size.w <= 0 || size.h <= 0) return;

    if (fitToIds.length >= 1) {
      const pts = getBodiesAU(fitToIds);
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const bbox = {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
      };
      let { zoom: z, offset: off } = fitBoxToViewport(bbox, size.w, size.h, fitMarginPx);

      // start farther zoomed-out (e.g., 0.75×)
      z = z * 0.75;

      baseFitRef.current = { zoom: z, offset: off };
      setZoom(z);
      setOffset(off);
    }
  }, [size.w, size.h, fitToIds.join(","), fitMarginPx, getBodiesAU]);

  // ---- input (mouse wheel + buttons) ----
  const zoomAtPoint = React.useCallback((scrX: number, scrY: number, scale: number) => {
    const newZoom = clamp(zoom * scale, minZoom, maxZoom);
    const k = newZoom / zoom;
    // keep the point under the cursor fixed
    const newOff = {
      x: scrX - (scrX - offset.x) * k,
      y: scrY - (scrY - offset.y) * k,
    };
    setZoom(newZoom);
    setOffset(newOff);
  }, [zoom, offset, minZoom, maxZoom]);

  React.useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = cvs.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const scale = e.deltaY < 0 ? 1.12 : 1/1.12;
      zoomAtPoint(x, y, scale);
    };
    cvs.addEventListener('wheel', onWheel, { passive: false });
    return () => cvs.removeEventListener('wheel', onWheel as any);
  }, [zoomAtPoint]);

  // ---- touch: pan (1 finger) & pinch (2 fingers) ----
  const pointers = React.useRef<Map<number, {x: number; y: number}>>(new Map());
  const pinchStart = React.useRef<{
    zoom: number; offset: {x: number; y: number};
    dist: number; center: {x: number; y: number};
  } | null>(null);
  const dragStart = React.useRef<{x: number; y: number; offset: {x: number; y: number}} | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      // begin pinch
      const ps = Array.from(pointers.current.values());
      const cx = (ps[0].x + ps[1].x) / 2;
      const cy = (ps[0].y + ps[1].y) / 2;
      const dx = ps[0].x - ps[1].x, dy = ps[0].y - ps[1].y;
      pinchStart.current = {
        zoom, offset, dist: Math.hypot(dx, dy),
        center: { x: cx - el.getBoundingClientRect().left,
                  y: cy - el.getBoundingClientRect().top }
      };
      dragStart.current = null;
    } else if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, offset: { ...offset } };
      pinchStart.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchStart.current && pointers.current.size >= 2) {
      const ps = Array.from(pointers.current.values());
      const dx = ps[0].x - ps[1].x, dy = ps[0].y - ps[1].y;
      const dist = Math.hypot(dx, dy);
      const scale = clamp(dist / (pinchStart.current.dist || dist), 0.2, 5);
      const newZoom = clamp(pinchStart.current.zoom * scale, minZoom, maxZoom);

      // keep pinch center fixed
      const k = newZoom / pinchStart.current.zoom;
      const c = pinchStart.current.center;
      const off = pinchStart.current.offset;
      const newOff = { x: c.x - (c.x - off.x) * k, y: c.y - (c.y - off.y) * k };

      setZoom(newZoom);
      setOffset(newOff);
      return;
    }

    if (dragStart.current && pointers.current.size === 1) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setOffset({ x: dragStart.current.offset.x + dx, y: dragStart.current.offset.y + dy });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) dragStart.current = null;
  };

  // ---- draw (honor size, zoom, offset) ----
  React.useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    cvs.width = Math.floor(size.w * dpr);
    cvs.height = Math.floor(size.h * dpr);
    const ctx = cvs.getContext("2d");
    if (!ctx || typeof ctx.clearRect !== 'function') return;
    // ✅ correct DPR transform (scaleX=dpr, scaleY=dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    // Dark space background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size.w, size.h);

    // --- draw background polyline (if provided) BEFORE planets/routes ---
    if (backgroundPolylineAU && backgroundPolylineAU.length >= 2) {
      ctx.save();
      ctx.strokeStyle = backgroundPolylineStyle?.stroke ?? "#60a5fa";
      ctx.lineWidth = backgroundPolylineStyle?.width ?? 1;
      if (backgroundPolylineStyle?.dash?.length) ctx.setLineDash(backgroundPolylineStyle.dash);
      if (backgroundPolylineStyle?.composite) ctx.globalCompositeOperation = backgroundPolylineStyle.composite;

      const gain =
        Number.isFinite(backgroundPolylineGain as number) && (backgroundPolylineGain as number) > 0
          ? (backgroundPolylineGain as number)
          : 1;

      // per-segment alpha (uses average of endpoints' alpha)
      for (let i = 1; i < backgroundPolylineAU.length; i++) {
        const a = clamp(backgroundPolylineAU[i - 1].alpha ?? 1, 0, 1);
        const b = clamp(backgroundPolylineAU[i].alpha ?? 1, 0, 1);
        const segAlpha = (a + b) * 0.5;

        const x1 = offset.x + (backgroundPolylineAU[i - 1].x_au * gain) * zoom;
        const y1 = offset.y - (backgroundPolylineAU[i - 1].y_au * gain) * zoom;
        const x2 = offset.x + (backgroundPolylineAU[i].x_au * gain) * zoom;
        const y2 = offset.y - (backgroundPolylineAU[i].y_au * gain) * zoom;

        ctx.globalAlpha = segAlpha;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Draw orbits and bodies
    for (const p of points) {
      const x = offset.x + p.x_au * zoom;
      const y = offset.y - p.y_au * zoom; // flip Y

      // Draw orbit path (simple circle approximation)
      if (p.id !== "SUN") {
        const orbitRadius = Math.hypot(p.x_au, p.y_au) * zoom;
        const sunX = offset.x;
        const sunY = offset.y;

        ctx.strokeStyle = "rgba(100, 100, 100, 0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sunX, sunY, orbitRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw body
      const isHighlighted = routeIds.includes(p.id);
      const bodySize = p.id === "SUN" ? 8 : p.id === "JUPITER" ? 4 : 3;

      ctx.fillStyle = isHighlighted ? "#ff6b35" : (p as any).color || "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, bodySize, 0, Math.PI * 2);
      ctx.fill();

      // Draw label
      if (zoom > 30) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.name || p.id, x, y + bodySize + 12);
      }
    }

    // Draw route lines
    if (routeIds.length > 1) {
      ctx.strokeStyle = "#ff6b35";
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let i = 1; i < routeIds.length; i++) {
        const fromBody = points.find(p => p.id === routeIds[i - 1]);
        const toBody = points.find(p => p.id === routeIds[i]);

        if (fromBody && toBody) {
          const x1 = offset.x + fromBody.x_au * zoom;
          const y1 = offset.y - fromBody.y_au * zoom;
          const x2 = offset.x + toBody.x_au * zoom;
          const y2 = offset.y - toBody.y_au * zoom;

          if (i === 1) ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
      }
      ctx.stroke();
    }
  }, [
    size.w, size.h,
    zoom, offset,
    points, routeIds,
    backgroundPolylineAU,
    backgroundPolylineStyle,
    backgroundPolylineGain, // ✅ ensure redraw when gain changes
  ]);

  // Click handling for body selection
  const handleClick = (e: React.MouseEvent) => {
    if (!onPickBody) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Find closest body
    let minDist = Infinity;
    let closestBody: SolarPoint | null = null;

    for (const p of points) {
      const x = offset.x + p.x_au * zoom;
      const y = offset.y - p.y_au * zoom;
      const dist = Math.hypot(mx - x, my - y);
      if (dist < 15 && dist < minDist) {
        minDist = dist;
        closestBody = p;
      }
    }

    if (closestBody) {
      onPickBody(closestBody.id);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg overflow-hidden border border-white/10"
      style={{ width: width ? undefined : '100%', height: height ? undefined : 360 }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, display: 'block', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={handleClick}
      />

      {/* timestamp */}
      <div className="absolute top-2 left-2 z-40 select-none text-white/90 text-xs">
        {new Date().toLocaleString()}
      </div>

      {/* zoom controls */}
      <div className="absolute top-2 right-2 z-50 pointer-events-auto flex gap-1">
        <button
          className="px-2 py-1 bg-white/20 backdrop-blur rounded text-white hover:bg-white/30"
          onClick={() => zoomAtPoint(size.w * 0.5, size.h * 0.5, 1/1.2)}
          title="Zoom out"
        >−</button>
        <button
          className="px-2 py-1 bg-white/20 backdrop-blur rounded text-white hover:bg-white/30"
          onClick={() => zoomAtPoint(size.w * 0.5, size.h * 0.5, 1.2)}
          title="Zoom in"
        >+</button>
        <button
          className="px-2 py-1 bg-white/20 backdrop-blur rounded text-white hover:bg-white/30"
          onClick={() => {
            if (baseFitRef.current) {
              setZoom(baseFitRef.current.zoom);
              setOffset(baseFitRef.current.offset);
            }
          }}
          title="Reset view"
        >⟲</button>
      </div>

      {/* scale footer */}
      <div className="absolute inset-x-0 bottom-0 p-2 z-40
                      bg-gradient-to-t from-black/60 to-transparent
                      flex justify-between items-center text-xs text-white/80">
        <div>Scale: {Math.round(zoom)} px/AU</div>
      </div>
    </div>
  );
}

export default SolarMap;
