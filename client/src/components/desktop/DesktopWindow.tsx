import React, {
  Suspense,
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback
} from "react";
import type { ComponentType } from "react";
import {
  useDesktopStore,
  WINDOW_MIN_WIDTH,
  WINDOW_MAX_WIDTH,
  WINDOW_MIN_HEIGHT,
  WINDOW_MAX_HEIGHT,
  type Bounds
} from "@/store/useDesktopStore";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { X, Minus, Square, Expand, Minimize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DesktopWindowProps {
  id: string;
  title: string;
  Loader: () => Promise<{ default: ComponentType<any> }>;
}

const TASKBAR_HEIGHT = 48;
const WINDOW_CONTROL_SELECTOR = "[data-window-control='true']";
const FULLSCREEN_EXIT_ZONE_PX = 64;
const FULLSCREEN_HINT_HIDE_DELAY_MS = 800;
const IDEOLOGY_PANEL_ID = "mission-ethos";

type ViewportMetrics = {
  width: number;
  height: number;
};

function readViewportMetrics(): ViewportMetrics | null {
  if (typeof window === "undefined") return null;
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth ?? 0;
  const height = viewport?.height ?? window.innerHeight ?? 0;
  return {
    width: Math.max(0, width),
    height: Math.max(0, height - TASKBAR_HEIGHT)
  };
}

function clampToViewport(value: number, max: number) {
  const safeMax = Math.max(0, max);
  if (safeMax === 0) return 0;
  return Math.min(Math.max(value, 0), safeMax);
}

function windowIsCompletelyOutOfView(bounds: Bounds, viewport: ViewportMetrics) {
  const beyondRight = bounds.x >= viewport.width;
  const beyondLeft = bounds.x + bounds.w <= 0;
  const beyondBottom = bounds.y >= viewport.height;
  const beyondTop = bounds.y + bounds.h <= 0;
  return beyondRight || beyondLeft || beyondBottom || beyondTop;
}

export function DesktopWindow({ id, title, Loader }: DesktopWindowProps) {
  const {
    windows,
    focus,
    close,
    minimize,
    setOpacity,
    toggleMaximize,
    setFullscreen,
    moveByDelta,
    setBounds,
    cycleTextBlendMode
  } = useDesktopStore();
  const w = windows[id];
  const dragDisabled = Boolean(w?.isMaximized || w?.isFullscreen);
  const [dragging, setDragging] = useState(false);
  const dragSession = useRef<{ lastX: number; lastY: number } | null>(null);
  const dragFrame = useRef<number | null>(null);
  const pendingDelta = useRef<{ dx: number; dy: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [viewport, setViewport] = useState<ViewportMetrics | null>(() => readViewportMetrics());
  const [showFullscreenExitHint, setShowFullscreenExitHint] = useState(false);
  const fullscreenHintTimeoutRef = useRef<number | null>(null);
  const isIdeologyPanel = id === IDEOLOGY_PANEL_ID;

  const style = useMemo(() => {
    if (!w) return {};
    const ideologyVars = isIdeologyPanel
      ? {
          "--background": "240 10% 3.9%",
          "--border": "240 3.7% 15.9%"
        }
      : {};
    return {
      width: w.w,
      height: w.h,
      "--window-bg-strength": w.opacity,
      ...ideologyVars
    } as React.CSSProperties;
  }, [isIdeologyPanel, w]);

  const safePosition = useMemo(() => {
    if (!w) return { x: 0, y: 0 };
    if (!viewport) return { x: w.x, y: w.y };
    const maxX = viewport.width - w.w;
    const maxY = viewport.height - w.h;
    if (windowIsCompletelyOutOfView(w, viewport)) {
      return {
        x: clampToViewport(Math.round((viewport.width - w.w) / 2), maxX),
        y: clampToViewport(Math.round((viewport.height - w.h) / 2), maxY)
      };
    }
    return {
      x: clampToViewport(w.x, maxX),
      y: clampToViewport(w.y, maxY)
    };
  }, [viewport, w]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateViewport = () => {
      const metrics = readViewportMetrics();
      if (!metrics) return;
      setViewport((prev) => {
        if (prev && prev.width === metrics.width && prev.height === metrics.height) {
          return prev;
        }
        return metrics;
      });
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      visualViewport?.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!w || !viewport) return;
    if (w.isFullscreen || w.isMaximized) return;
    if (safePosition.x === w.x && safePosition.y === w.y) return;
    setBounds(id, { x: safePosition.x, y: safePosition.y });
  }, [
    id,
    safePosition.x,
    safePosition.y,
    setBounds,
    viewport,
    w?.isFullscreen,
    w?.isMaximized,
    w?.x,
    w?.y
  ]);

  const LazyComp = React.useMemo(() => React.lazy(Loader), [Loader]);

  const computeViewportBounds = useCallback(
    (full: boolean): Bounds | null => {
      if (!w) return null;
      if (typeof window === "undefined") {
        return { x: 0, y: 0, w: w.w, h: w.h };
      }
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth ?? w.w;
      const height = viewport?.height ?? window.innerHeight ?? w.h;
      const usableHeight = full ? height : Math.max(height - TASKBAR_HEIGHT, 0);
      return { x: 0, y: 0, w: width, h: usableHeight };
    },
    [w]
  );

  const handleToggleMaximize = useCallback(() => {
    if (!w || w.isFullscreen) return;
    const bounds = computeViewportBounds(false);
    if (!bounds) return;
    toggleMaximize(id, bounds);
  }, [computeViewportBounds, id, toggleMaximize, w]);

  const handleToggleFullscreen = useCallback(() => {
    if (!w) return;
    if (w.isFullscreen) {
      setFullscreen(id, false);
      return;
    }
    const bounds = computeViewportBounds(true);
    if (!bounds) return;
    setFullscreen(id, true, bounds);
  }, [computeViewportBounds, id, setFullscreen, w]);

  const clearFullscreenHintTimeout = useCallback(() => {
    if (fullscreenHintTimeoutRef.current === null) return;
    if (typeof window !== "undefined") {
      window.clearTimeout(fullscreenHintTimeoutRef.current);
    }
    fullscreenHintTimeoutRef.current = null;
  }, []);

  const scheduleFullscreenHintHide = useCallback(() => {
    if (typeof window === "undefined") return;
    clearFullscreenHintTimeout();
    fullscreenHintTimeoutRef.current = window.setTimeout(() => {
      setShowFullscreenExitHint(false);
      fullscreenHintTimeoutRef.current = null;
    }, FULLSCREEN_HINT_HIDE_DELAY_MS);
  }, [clearFullscreenHintTimeout]);

  const handleFullscreenPointerMove = useCallback(
    (event: MouseEvent) => {
      if (!w?.isFullscreen) return;
      if (event.clientY <= FULLSCREEN_EXIT_ZONE_PX) {
        if (!showFullscreenExitHint) {
          setShowFullscreenExitHint(true);
        }
        clearFullscreenHintTimeout();
        return;
      }
      if (showFullscreenExitHint) {
        scheduleFullscreenHintHide();
      }
    },
    [
      clearFullscreenHintTimeout,
      scheduleFullscreenHintHide,
      showFullscreenExitHint,
      w?.isFullscreen
    ]
  );

  const handleFullscreenPointerLeaveWindow = useCallback(() => {
    if (!w?.isFullscreen || !showFullscreenExitHint) return;
    scheduleFullscreenHintHide();
  }, [scheduleFullscreenHintHide, showFullscreenExitHint, w?.isFullscreen]);

  const handleDragMove = useCallback(
    (event: MouseEvent) => {
      if (!dragSession.current) return;
      event.preventDefault();
      const { lastX, lastY } = dragSession.current;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (!dx && !dy) return;
      // Update pointer immediately to avoid drift; apply move on next animation frame.
      dragSession.current = { lastX: event.clientX, lastY: event.clientY };
      const current = pendingDelta.current ?? { dx: 0, dy: 0 };
      pendingDelta.current = { dx: current.dx + dx, dy: current.dy + dy };
      setDragOffset((prev) => ({ dx: prev.dx + dx, dy: prev.dy + dy }));
      if (dragFrame.current === null) {
        dragFrame.current = requestAnimationFrame(() => {
          dragFrame.current = null;
          const delta = pendingDelta.current;
          pendingDelta.current = null;
          if (delta && (delta.dx || delta.dy)) {
            moveByDelta(id, delta.dx, delta.dy);
            setDragOffset({ dx: 0, dy: 0 });
          }
        });
      }
    },
    [id, moveByDelta]
  );

  const handleDragEnd = useCallback(() => {
    if (!dragSession.current) return;
    dragSession.current = null;
    setDragging(false);
    window.removeEventListener("mousemove", handleDragMove);
    window.removeEventListener("mouseup", handleDragEnd);
    if (dragFrame.current !== null) {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null;
    }
    const delta = pendingDelta.current;
    pendingDelta.current = null;
    if (delta && (delta.dx || delta.dy)) {
      moveByDelta(id, delta.dx, delta.dy);
    }
    setDragOffset({ dx: 0, dy: 0 });
  }, [handleDragMove, id, moveByDelta]);

  const handleDragStart = useCallback(
    (event: React.MouseEvent) => {
      if (dragDisabled || event.button !== 0 || !w) return;
      const target = event.target;
      if (target instanceof Element && target.closest(WINDOW_CONTROL_SELECTOR)) {
        return;
      }
      event.preventDefault();
      focus(id);
      setDragging(true);
      dragSession.current = { lastX: event.clientX, lastY: event.clientY };
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("mouseup", handleDragEnd);
    },
    [dragDisabled, focus, handleDragEnd, handleDragMove, id, w]
  );

  useEffect(() => {
    if (!w?.isFullscreen) {
      setShowFullscreenExitHint(false);
      clearFullscreenHintTimeout();
    }
  }, [clearFullscreenHintTimeout, w?.isFullscreen]);

  useEffect(() => {
    return () => {
      clearFullscreenHintTimeout();
    };
  }, [clearFullscreenHintTimeout]);

  useEffect(() => {
    if (!w?.isFullscreen || typeof window === "undefined") return;
    const doc = window.document;
    window.addEventListener("mousemove", handleFullscreenPointerMove, true);
    doc.addEventListener("mouseleave", handleFullscreenPointerLeaveWindow, true);
    return () => {
      window.removeEventListener("mousemove", handleFullscreenPointerMove, true);
      doc.removeEventListener("mouseleave", handleFullscreenPointerLeaveWindow, true);
    };
  }, [handleFullscreenPointerLeaveWindow, handleFullscreenPointerMove, w?.isFullscreen]);

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
      if (dragFrame.current !== null) {
        cancelAnimationFrame(dragFrame.current);
        dragFrame.current = null;
      }
      pendingDelta.current = null;
      setDragOffset({ dx: 0, dy: 0 });
    };
  }, [handleDragEnd, handleDragMove]);

  useEffect(() => {
    if (!w?.isFullscreen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreen(id, false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [id, setFullscreen, w?.isFullscreen]);

  if (!w || !w.isOpen) return null;

  const autoBlend = w.opacity < 0.95;
  const enableBlend =
    w.textBlendMode === "on" ? true : w.textBlendMode === "off" ? false : autoBlend;
  const blendModeLabel =
    w.textBlendMode === "auto"
      ? "Text blend: auto (follows opacity)"
      : w.textBlendMode === "on"
        ? "Text blend: on"
        : "Text blend: off";
  const blendGlyph = w.textBlendMode === "auto" ? "A" : w.textBlendMode === "on" ? "+" : "o";

  const dragCursor = dragDisabled ? "cursor-default" : dragging ? "cursor-grabbing" : "cursor-grab";
  const contentClasses = cn(
    "relative w-full overflow-x-auto overflow-y-auto",
    w.isFullscreen ? "h-full" : "h-[calc(100%-2.5rem)]",
    enableBlend && "blend-text",
    id === IDEOLOGY_PANEL_ID && "bg-slate-950 overscroll-contain"
  );

  const windowClasses = cn(
    "desktop-window fixed top-0 left-0 shadow-2xl border text-slate-100",
    w.isFullscreen
      ? "rounded-none border-slate-900/80"
      : "rounded-xl border-slate-800/70"
  );

  return (
    <AnimatePresence>
      {!w.isMinimized && (
        <motion.div
          className={windowClasses}
          style={{ ...style, zIndex: w.z }}
          data-window-id={id}
          data-panel-id={id}
          onMouseDown={() => focus(id)}
          initial={{ x: safePosition.x, y: safePosition.y, scale: 0.98, opacity: 0.95 }}
          animate={{
            x: safePosition.x + dragOffset.dx,
            y: safePosition.y + dragOffset.dy,
            scale: 1,
            opacity: 1
          }}
          exit={{ x: safePosition.x, y: safePosition.y, scale: 0.98, opacity: 0.95 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
        >
          {!w.isFullscreen && (
            <div
              className={cn(
                "flex items-center justify-between h-10 px-4 border-b border-slate-800/70 bg-slate-950/40 rounded-t-xl select-none",
                dragCursor
              )}
              onMouseDown={handleDragStart}
              aria-label={`${title} window title bar`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="font-medium text-sm tracking-tight truncate pr-3 text-slate-100">{title}</div>
              </div>
              <div className="flex items-center gap-2 pl-3" data-window-control="true">
                <div className="flex items-center gap-2" aria-label="Opacity">
                  <span className="text-xs text-slate-400 uppercase tracking-wide">Opacity</span>
                  <div className="w-24">
                    <Slider
                      defaultValue={[w.opacity]}
                      min={0.3}
                      max={1}
                      step={0.05}
                      value={[w.opacity]}
                      onValueChange={(v) => setOpacity(id, v[0] ?? 1)}
                      aria-label="Window background opacity"
                    />
                  </div>
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "text-slate-300 hover:text-white hover:bg-slate-800/60",
                    enableBlend && "bg-slate-800/80 text-white"
                  )}
                  onClick={() => cycleTextBlendMode(id)}
                  aria-label={blendModeLabel}
                  title={blendModeLabel}
                >
                  <span className="text-[0.65rem] font-semibold leading-none">{blendGlyph}</span>
                </Button>

                {!w.noMinimize && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-slate-300 hover:text-white hover:bg-slate-800/60"
                    onClick={() => minimize(id)}
                    aria-label="Minimize"
                    title="Minimize"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-slate-300 hover:text-white hover:bg-slate-800/60"
                  onClick={handleToggleMaximize}
                  aria-label={w.isMaximized ? "Restore" : "Maximize"}
                  title={w.isMaximized ? "Restore" : "Maximize"}
                  disabled={w.isFullscreen}
                >
                  <Square className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-slate-300 hover:text-white hover:bg-slate-800/60"
                  onClick={handleToggleFullscreen}
                  aria-label={w.isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  title={w.isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  {w.isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-slate-300 hover:text-white hover:bg-slate-800/60"
                  onClick={() => close(id)}
                  aria-label="Close"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {w.isFullscreen && (
            <AnimatePresence>
              {showFullscreenExitHint && (
                <motion.div
                  key="fullscreen-exit-hint"
                  className="absolute inset-x-0 top-0 z-20 flex justify-center pointer-events-none"
                  initial={{ opacity: 0, y: -32, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -32, scale: 0.8 }}
                  transition={{ duration: 0.18 }}
                >
                  <button
                    type="button"
                    aria-label="Exit fullscreen"
                    className="pointer-events-auto mt-4 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/60 bg-slate-900/90 text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                    onClick={handleToggleFullscreen}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          <div className={contentClasses}>
            <Suspense fallback={<div className="p-4 text-sm text-slate-400">Loading...</div>}>
              <LazyComp />
            </Suspense>
          </div>

          {!w.isFullscreen && !w.isMaximized && <ResizeHandles id={id} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type CornerHandle = {
  key: string;
  horizontal: "left" | "right";
  vertical: "top" | "bottom";
  className: string;
  cursor: string;
  label: string;
};

const CORNER_HANDLES: CornerHandle[] = [
  {
    key: "top-left",
    horizontal: "left",
    vertical: "top",
    className: "top-1 left-1 border-l-2 border-t-2",
    cursor: "cursor-nwse-resize",
    label: "Resize top-left corner"
  },
  {
    key: "top-right",
    horizontal: "right",
    vertical: "top",
    className: "top-1 right-1 border-r-2 border-t-2",
    cursor: "cursor-nesw-resize",
    label: "Resize top-right corner"
  },
  {
    key: "bottom-left",
    horizontal: "left",
    vertical: "bottom",
    className: "bottom-1 left-1 border-l-2 border-b-2",
    cursor: "cursor-nesw-resize",
    label: "Resize bottom-left corner"
  },
  {
    key: "bottom-right",
    horizontal: "right",
    vertical: "bottom",
    className: "bottom-1 right-1 border-r-2 border-b-2",
    cursor: "cursor-nwse-resize",
    label: "Resize bottom-right corner"
  }
];

function ResizeHandles({ id }: { id: string }) {
  return (
    <>
      {CORNER_HANDLES.map(({ key, ...config }) => (
        <ResizeHandle key={`${id}-${key}`} id={id} {...config} />
      ))}
    </>
  );
}

interface ResizeHandleProps extends Omit<CornerHandle, "key"> {
  id: string;
}

function ResizeHandle({ id, horizontal, vertical, className, cursor, label }: ResizeHandleProps) {
  const { windows, setBounds, focus } = useDesktopStore();
  const w = windows[id];
  const handleRef = useRef<HTMLDivElement | null>(null);
  const latestBounds = useRef<Bounds | null>(null);

  useEffect(() => {
    latestBounds.current = w ? { x: w.x, y: w.y, w: w.w, h: w.h } : null;
  }, [w]);

  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;

    let startBounds: Bounds | null = null;
    let startX = 0;
    let startY = 0;

    function onDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const snapshot = latestBounds.current;
      if (!snapshot) return;

      e.preventDefault();
      e.stopPropagation();
      focus(id);

      startBounds = snapshot;
      startX = e.clientX;
      startY = e.clientY;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }

    function onMove(e: MouseEvent) {
      if (!startBounds) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const nextBounds = computeResizeBounds(startBounds, dx, dy, horizontal, vertical);
      setBounds(id, nextBounds);
    }

    function onUp() {
      startBounds = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    el.addEventListener("mousedown", onDown);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [focus, horizontal, id, setBounds, vertical]);

  if (!w) return null;

  return (
    <div
      ref={handleRef}
      className={cn(
        "absolute w-4 h-4 rounded-sm border border-cyan-400/60 bg-slate-900/60 z-20",
        className,
        cursor
      )}
      aria-label={label}
      title={label}
      role="presentation"
    />
  );
}

function computeResizeBounds(
  start: Bounds,
  dx: number,
  dy: number,
  horizontal: "left" | "right",
  vertical: "top" | "bottom"
): Bounds {
  let { x, y, w, h } = start;

  if (horizontal === "left") {
    const width = clampSize(start.w - dx, WINDOW_MIN_WIDTH, WINDOW_MAX_WIDTH);
    const delta = start.w - width;
    w = width;
    x = Math.max(0, start.x + delta);
  } else if (horizontal === "right") {
    w = clampSize(start.w + dx, WINDOW_MIN_WIDTH, WINDOW_MAX_WIDTH);
  }

  if (vertical === "top") {
    const height = clampSize(start.h - dy, WINDOW_MIN_HEIGHT, WINDOW_MAX_HEIGHT);
    const delta = start.h - height;
    h = height;
    y = Math.max(0, start.y + delta);
  } else if (vertical === "bottom") {
    h = clampSize(start.h + dy, WINDOW_MIN_HEIGHT, WINDOW_MAX_HEIGHT);
  }

  return { x, y, w, h };
}

function clampSize(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
