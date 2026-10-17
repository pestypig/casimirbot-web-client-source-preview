/**
 * Simple WebGL utilities shared between visualization components
 */

type ShaderDebugPayload = {
  stage: "vertex" | "fragment";
  log: string;
  source?: string;
  translated?: string | null;
};

const addLineNumbers = (source: string) =>
  source
    .split(/\r?\n/)
    .map((line, idx) => `${String(idx + 1).padStart(4, " ")}| ${line}`)
    .join("\n");

const captureShaderDebug = (
  gl: WebGL2RenderingContext,
  shader: WebGLShader,
  stage: ShaderDebugPayload["stage"],
  source: string,
): ShaderDebugPayload => {
  const log = gl.getShaderInfoLog(shader) || "unknown error";
  let translated: string | null = null;
  try {
    const ext: any = gl.getExtension("WEBGL_debug_shaders");
    if (ext?.getTranslatedShaderSource) {
      translated = ext.getTranslatedShaderSource(shader) || null;
    }
  } catch {
    translated = null;
  }
  return {
    stage,
    log,
    source: addLineNumbers(source),
    translated: translated ? addLineNumbers(translated) : null,
  };
};

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  bindings?: Record<string, number>,
): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  if (!vs) throw new Error("Failed to create vertex shader object");

  gl.shaderSource(vs, vertexSource);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    const debug = captureShaderDebug(gl, vs, "vertex", vertexSource);
    console.error("[gl] vertex shader compile failed", debug);
    (globalThis as any).__lastShaderError = debug;
    throw new Error(`Vertex shader compile error: ${debug.log} (see console)`);
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  if (!fs) throw new Error("Failed to create fragment shader object");

  gl.shaderSource(fs, fragmentSource);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    const debug = captureShaderDebug(gl, fs, "fragment", fragmentSource);
    console.error("[gl] fragment shader compile failed", debug);
    (globalThis as any).__lastShaderError = debug;
    throw new Error(`Fragment shader compile error: ${debug.log} (see console)`);
  }

  const prog = gl.createProgram();
  if (!prog) throw new Error("Failed to create GL program");

  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  if (bindings) {
    for (const [name, location] of Object.entries(bindings)) {
      gl.bindAttribLocation(prog, location, name);
    }
  }
  gl.linkProgram(prog);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog) || "unknown link error";
    console.error("[gl] program link failed", info);
    throw new Error(`Program link error: ${info}`);
  }

  return prog;
}

export function makeGrid(res: number): Float32Array {
  // regular [-1,1]^2 grid in (x,z) with triangle strips
  const verts: number[] = [];
  for (let j = 0; j < res - 1; j++) {
    for (let i = 0; i < res; i++) {
      const x = -1 + 2 * (i / (res - 1));
      const z0 = -1 + 2 * (j / (res - 1));
      const z1 = -1 + 2 * ((j + 1) / (res - 1));
      verts.push(x, z0, x, z1);
    }
  }
  return new Float32Array(verts);
}

export function resizeCanvasAndViewport(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(4, Number(devicePixelRatio) || 1));
  const w = Math.max(2, Math.floor((rect.width || 640) * dpr));
  const h = Math.max(2, Math.floor((rect.height || 360) * dpr));
  canvas.width = w;
  canvas.height = h;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
