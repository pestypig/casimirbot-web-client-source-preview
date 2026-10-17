/**
 * WebGL context pooling/registry.
 *
 * Keeps track of active contexts so components can explicitly release GPU
 * resources when they unmount. This mitigates the browser's WebGL context
 * limits (typically 8–16 contexts) by ensuring contexts are lost promptly
 * instead of lingering until GC.
 */

type WebGLCtx = WebGLRenderingContext | WebGL2RenderingContext;

type RegistryEntry = {
  ctx: WebGLCtx;
  label?: string;
  disposed: boolean;
};

const activeContexts: RegistryEntry[] = [];
const CONTEXT_WARN_THRESHOLD = 8;

function loseContext(ctx: WebGLCtx) {
  const loseExt =
    ctx.getExtension?.("WEBGL_lose_context") ??
    ctx.getExtension?.("WEBKIT_WEBGL_lose_context") ??
    ctx.getExtension?.("MOZ_WEBGL_lose_context");

  if (loseExt && typeof loseExt.loseContext === "function") {
    try {
      loseExt.loseContext();
    } catch (err) {
      console.warn("[webgl-context-pool] Failed to lose context", err);
    }
  }
}

/**
 * Register a WebGL context and obtain a release function. Call the release
 * function once the component is done with the context to free GPU state.
 *
 * The optional `onDispose` callback is invoked before the context is lost so
 * callers can clean up any renderer-specific resources.
 */
export function registerWebGLContext(
  ctx: WebGLCtx,
  options: { label?: string; onDispose?: () => void } = {}
): () => void {
  const entry: RegistryEntry = {
    ctx,
    label: options.label,
    disposed: false,
  };

  activeContexts.push(entry);
  if (activeContexts.length > CONTEXT_WARN_THRESHOLD) {
    console.warn(
      `[webgl-context-pool] ${activeContexts.length} contexts live ` +
        `(>${CONTEXT_WARN_THRESHOLD}). Consider throttling WebGL mounts. ` +
        `latest: ${options.label ?? "unnamed"}`
    );
  }

  return () => {
    if (entry.disposed) return;
    entry.disposed = true;

    if (options.onDispose) {
      try {
        options.onDispose();
      } catch (err) {
        console.error(
          `[webgl-context-pool] dispose callback failed for ${options.label ?? "context"}`,
          err
        );
      }
    }

    loseContext(entry.ctx);
    const idx = activeContexts.indexOf(entry);
    if (idx >= 0) activeContexts.splice(idx, 1);
  };
}

/**
 * Convenience helper to free any contexts that may still be tracked.
 * Useful when tearing down entire subsystems (rare).
 */
export function releaseAllContexts() {
  while (activeContexts.length) {
    const entry = activeContexts.pop();
    if (!entry) break;
    if (!entry.disposed) {
      entry.disposed = true;
      loseContext(entry.ctx);
    }
  }
}
