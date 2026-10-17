/**
 * WebGL capabilities and canvas sizing utilities
 * Mobile-optimized canvas sizing with safe DPR handling
 */

/**
 * Check if WebGL is available (soft detection)
 * Some mobile browsers/webviews return null for off-DOM test canvases even though
 * real canvases will create a context just fine.
 */
export function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return false;

  // If the APIs simply don't exist, we can hard-fail.
  const hasAPI =
    !!(window as any).WebGL2RenderingContext ||
    !!(window as any).WebGLRenderingContext;
  if (!hasAPI) return false;

  // Some mobile/webviews return null for off-DOM canvases even when
  // real canvases succeed. Treat probe failure as non-fatal.
  try {
    const canvas = document.createElement('canvas');
    const attrs: WebGLContextAttributes = {
      alpha: false, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false,
      // Avoid "prefer-low-power" here; browsers pick a sane default on mobile.
    };
    const gl =
      canvas.getContext('webgl2', attrs) ||
      canvas.getContext('webgl', attrs) ||
      // old iOS/Safari:
      (canvas.getContext as any)?.('experimental-webgl', attrs);
    return !!gl || hasAPI;
  } catch {
    return hasAPI;
  }
}

export function clampMobileDPR(maxDesktop = 2, maxMobile = 1.5) {
  const isMobile =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches ||
     window.matchMedia?.('(max-width: 768px)').matches);
  const dpr = window.devicePixelRatio || 1;
  return Math.min(isMobile ? maxMobile : maxDesktop, dpr);
}

// Safe canvas sizing that prevents "too big" drawing buffers on phones.
export function sizeCanvasSafe(cv: HTMLCanvasElement) {
  const dpr = clampMobileDPR();
  const rect = cv.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));

  // Keep buffer under ~4–8MP on weak GPUs to avoid allocation failures.
  const maxPx = 3840 * 2160; // ~8.3 MP (tweak lower if needed)
  if (w * h > maxPx) {
    const s = Math.sqrt(maxPx / (w * h));
    cv.width = Math.max(1, Math.floor(w * s));
    cv.height = Math.max(1, Math.floor(h * s));
  } else {
    cv.width = w;
    cv.height = h;
  }
  return { w: cv.width, h: cv.height, dpr };
}

/**
 * Get optimal WebGL context attributes for mobile compatibility
 */
export function getWebGLContextAttributes(isMobile = false): WebGLContextAttributes {
  return {
    alpha: false,
    antialias: !isMobile, // Disable antialiasing on mobile for better performance
    depth: true,
    stencil: false,
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: false,
    powerPreference: isMobile ? 'default' : 'high-performance',
    desynchronized: !isMobile, // Disable on mobile for compatibility
  };
}