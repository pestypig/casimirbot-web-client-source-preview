

export type WebGLSupport = {
  ok: boolean;
  context?: 'webgl2' | 'webgl';
  reason?: string;
  inIframe: boolean;
  ua: string;
  details?: Record<string, any>;
};

type Options = {
  /** Some mobile webviews only return a context if the canvas is in the DOM and sized > 0. */
  mountProbeCanvas?: boolean;
};

/** Resilient WebGL detection that tries multiple context+attribute combos and (optionally) mounts a probe canvas. */
export function webglSupport(canvas?: HTMLCanvasElement, opts: Options = {}): WebGLSupport {
  const inIframe =
    typeof window !== 'undefined' && window.self !== (window.top ?? window.self);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  // Developer override: force-disable via ?no-gl for testing
  try {
    const qs = new URLSearchParams((typeof location !== 'undefined' ? location.search : '') || '');
    if (qs.has('no-gl')) {
      return { ok: false, reason: 'Disabled via ?no-gl', inIframe, ua };
    }
  } catch {}

  if (typeof window === 'undefined') {
    return { ok: false, reason: 'No window (SSR/headless)', inIframe, ua };
  }
  if (!(window as any).WebGLRenderingContext) {
    return { ok: false, reason: 'No WebGLRenderingContext in this runtime', inIframe, ua };
  }

  // Prepare a probe canvas
  const cv = canvas || document.createElement('canvas');
  let mounted = false;
  try {
    if (opts.mountProbeCanvas && !cv.isConnected) {
      cv.style.position = 'fixed';
      cv.style.left = '-9999px';
      cv.style.top = '-9999px';
      cv.width = 2; cv.height = 2;
      document.body.appendChild(cv);
      mounted = true;
    }
  } catch {}

  const attempts: Array<[string, WebGLContextAttributes | undefined]> = [
    ['webgl2', { powerPreference: 'high-performance', antialias: false, preserveDrawingBuffer: false }],
    ['webgl2', { antialias: false }],
    ['webgl',  { powerPreference: 'high-performance', antialias: false, preserveDrawingBuffer: false }],
    ['webgl',  { antialias: false }],
    ['experimental-webgl', undefined],
  ];

  const details: Record<string, any> = {};
  for (const [kind, attrs] of attempts) {
    try {
      const gl = cv.getContext(kind as any, attrs) as WebGLRenderingContext | WebGL2RenderingContext | null;
      details[`try:${kind}`] = !!gl;
      if (gl && !gl.isContextLost()) {
        // Optional vendor/renderer strings (may be null without debug ext)
        let vendor: string | undefined, renderer: string | undefined;
        try {
          const dbg = (gl as any).getExtension?.('WEBGL_debug_renderer_info');
          if (dbg) {
            vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
            renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
          }
        } catch {}
        if (mounted) { try { cv.remove(); } catch {} }
        return {
          ok: true,
          context: kind === 'webgl2' ? 'webgl2' : 'webgl',
          inIframe,
          ua,
          details: { attrs, vendor, renderer }
        };
      }
    } catch (e) {
      details[`err:${kind}`] = String(e);
    }
  }

  if (mounted) { try { cv.remove(); } catch {} }

  // IMPORTANT: don't claim "unsupported" due to iframe alone; we only fail if every attempt failed.
  return {
    ok: false,
    reason: 'All context attempts failed',
    inIframe,
    ua,
    details
  };
}

