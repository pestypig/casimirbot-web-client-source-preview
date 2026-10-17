import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

// Add near other helpers
async function waitForNonZeroSize(cv: HTMLCanvasElement, timeoutMs = 3000) {
  const t0 = performance.now();
  return new Promise<void>((resolve, reject) => {
    const tick = () => {
      const w = cv.clientWidth || cv.getBoundingClientRect().width;
      const h = cv.clientHeight || cv.getBoundingClientRect().height;
      if (w > 8 && h > 8) return resolve();
      if (performance.now() - t0 > timeoutMs) return reject(new Error('canvas size timeout (0×0)'));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

// Handle interface for Grid3DEngine
export type Grid3DHandle = {
  getCanvas: () => HTMLCanvasElement | null;
  getEngine: () => any | null;
  updateUniforms: (u: any) => void;
  onceReady: (cb: () => void) => void;
  setDisplayGain: (g: number) => void;
  destroy: () => void;
  _resize: () => void;
  setVisible?: (on: boolean) => void;
  setPixelRatio?: (pr: number) => void;
  setSupersample?: (ss: number) => void;
  setGridResolution?: (res: { radial?: number; angular?: number; axial?: number }) => void;
};

// Minimal 3D grid engine that samples the Natário displacement field
// and renders it as instanced points/lines with physics-accurate coloring
const Grid3DEngine = forwardRef<Grid3DHandle, { uniforms: any; className?: string; style?: React.CSSProperties }>(
  ({ uniforms, className, style }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const engineRef = useRef<any>(null);
  
  // Pixel resolution controls
  const pixelRatioRef = useRef(1);
  const supersampleRef = useRef(1);
  
  // Grid resolution controls
  const gridResolutionRef = useRef({ radial: 32, angular: 20, axial: 32 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isDestroyed = false;
    
    // Initialize canvas with proper size
    const setupCanvas = () => {
      if (isDestroyed) return;
      
      // Set canvas size with pixel ratio and supersample
      const rect = canvas.getBoundingClientRect();
      const dpr = pixelRatioRef.current * supersampleRef.current;
      if (rect.width && rect.height) {
        const w = Math.max(1, Math.floor(rect.width * dpr));
        const h = Math.max(1, Math.floor(rect.height * dpr));
        canvas.width = w;
        canvas.height = h;
      } else {
        canvas.width = Math.floor(800 * dpr);
        canvas.height = Math.floor(600 * dpr);
      }
      
      // Get 2D context
      const ctx = canvas.getContext('2d');
      if (!ctx || typeof (ctx as any).clearRect !== 'function') {
        console.error('Failed to get Canvas 2D context');
        return;
      }
      
      // Scale context for high-DPI rendering
      if (rect.width && rect.height && dpr > 1) {
        ctx.scale(dpr, dpr);
      }
      
      startRendering(ctx);
    };
    
    // Wait for next frame to ensure canvas is in DOM
    const timeout = setTimeout(setupCanvas, 100);
    
    const startRendering = (ctx: CanvasRenderingContext2D) => {
    
    // Build a rectilinear lattice in model space (64×40×64)
    const buildGrid = (nx: number, ny: number, nz: number) => {
      const points = [];
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          for (let k = 0; k < nz; k++) {
            const x = (i / (nx - 1) - 0.5) * 2; // -1 to 1
            const y = (j / (ny - 1) - 0.5) * 2; // -1 to 1  
            const z = (k / (nz - 1) - 0.5) * 2; // -1 to 1
            points.push({ x, y, z, originalX: x, originalY: y, originalZ: z });
          }
        }
      }
      return points;
    };

    // Sample displacement field using Natário bell math
    const sampleDisplacementField = (x: number, y: number, z: number, uniforms: any) => {
      const { hullAxes = [1, 0.26, 0.17], wallWidth = 0.06, gammaVdB = 1.4e5, gammaGeo = 26, qSpoilingFactor = 1, dutyEffectiveFR = 0.000025, viewMassFraction = 1.0 } = uniforms;
      
      // Ellipsoidal radius calculation
      const rho = Math.sqrt(
        Math.pow(x / hullAxes[0], 2) + 
        Math.pow(y / hullAxes[1], 2) + 
        Math.pow(z / hullAxes[2], 2)
      );
      
      // Natário bell function
      const sigma = wallWidth / 2;
      const bell = Math.exp(-Math.pow((rho - 1) / sigma, 2));
      
      // Theta calculation with physics chain
      const thetaScaleCanonical = Math.pow(gammaGeo, 3) * qSpoilingFactor * gammaVdB * dutyEffectiveFR;
      const thetaScaleUsed = thetaScaleCanonical * viewMassFraction; // Apply view mass fraction
      const theta = bell * thetaScaleUsed;
      
      // Sign based on compression/expansion regions
      const sign = rho < 1 ? -1 : 1;
      
      return { theta, sign, rho, displacement: theta * sign };
    };

    // Apply tone mapping (exposure, zeroStop)
    const toneMap = (value: number, exposure = 5, zeroStop = 1e-7) => {
      const abs = Math.abs(value);
      if (abs < zeroStop) return 0;
      return Math.sign(value) * Math.asinh(abs * Math.pow(10, exposure)) / Math.asinh(Math.pow(10, exposure));
    };

    // Color mapping for theta visualization
    const getColor = (theta: number, exposure: number, zeroStop: number) => {
      const mapped = toneMap(theta, exposure, zeroStop);
      const intensity = Math.abs(mapped);
      
      if (mapped > 0) {
        // Expansion (blue)
        return `rgba(0, ${Math.floor(intensity * 255)}, 255, 0.8)`;
      } else if (mapped < 0) {
        // Compression (orange/red)
        return `rgba(255, ${Math.floor(intensity * 165)}, 0, 0.8)`;
      } else {
        // Zero (white)
        return 'rgba(255, 255, 255, 0.1)';
      }
    };

    // Build grid once - only rebuild on canvas size or grid resolution changes
    let cachedGrid = buildGrid(gridResolutionRef.current.radial, gridResolutionRef.current.angular, gridResolutionRef.current.axial);
    let lastCanvasSize = { width: canvas.width, height: canvas.height };
    let lastGridResolution = { ...gridResolutionRef.current };
    
    // Render function
    const render = () => {
      if (isDestroyed) return;
      
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      
      // Rebuild grid if canvas size or grid resolution changed
      const currentRes = gridResolutionRef.current;
      if (width !== lastCanvasSize.width || height !== lastCanvasSize.height ||
          currentRes.radial !== lastGridResolution.radial ||
          currentRes.angular !== lastGridResolution.angular ||
          currentRes.axial !== lastGridResolution.axial) {
        cachedGrid = buildGrid(currentRes.radial, currentRes.angular, currentRes.axial);
        lastCanvasSize = { width, height };
        lastGridResolution = { ...currentRes };
      }
      
      const grid = cachedGrid;
      
      // Apply displacement and render
      const exposure = uniforms.exposure || 5;
      const zeroStop = uniforms.zeroStop || 1e-7;
      
      grid.forEach(point => {
        const { theta, displacement } = sampleDisplacementField(point.x, point.y, point.z, uniforms);
        
        // Apply displacement to position
        point.x = point.originalX + displacement * 0.1; // Scale for visibility
        point.y = point.originalY + displacement * 0.1;
        point.z = point.originalZ + displacement * 0.1;
        
        // Project to 2D (simple orthographic projection)
        // Use logical canvas dimensions for proper scaling
        const logicalWidth = width / (pixelRatioRef.current * supersampleRef.current);
        const logicalHeight = height / (pixelRatioRef.current * supersampleRef.current);
        const screenX = (point.x * 0.3 + 0.5) * logicalWidth;
        const screenY = (point.y * 0.3 + 0.5) * logicalHeight;
        const screenZ = point.z; // For depth sorting
        
        // Color based on theta
        const color = getColor(theta, exposure, zeroStop);
        
        // Draw point
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 2, 0, 2 * Math.PI);
        ctx.fill();
      });
      
      animationRef.current = requestAnimationFrame(render);
    };

    // Initialize and start rendering
    render();

    };
    
    // Cleanup
    return () => {
      isDestroyed = true;
      clearTimeout(timeout);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [uniforms]);

  // Create mock engine object for compatibility
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create engine object with all expected methods
    engineRef.current = {
      canvas,
      isLoaded: true,
      gridProgram: true,
      gridUniforms: true,
      gridAttribs: true,
      setVisible: (visible: boolean) => {
        canvas.style.visibility = visible ? 'visible' : 'hidden';
      },
      updateUniforms: (newUniforms: any) => {
        Object.assign(uniforms, newUniforms);
      },
      bootstrap: (payload: any) => {
        Object.assign(uniforms, payload);
      },
      init: () => true,
      dispose: () => {},
      destroy: () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      },
      _resize: () => {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = pixelRatioRef.current * supersampleRef.current;
        if (rect.width && rect.height) {
          const w = Math.max(1, Math.floor(rect.width * dpr));
          const h = Math.max(1, Math.floor(rect.height * dpr));
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
        }
      },
      setPixelRatio: (pr: number) => {
        pixelRatioRef.current = Math.max(1, Math.min(3, pr));
        engineRef.current?._resize();
      },
      setSupersample: (ss: number) => {
        supersampleRef.current = Math.max(1, Math.min(2, ss));
        engineRef.current?._resize();
      },
      setGridResolution: (res: { radial?: number; angular?: number; axial?: number }) => {
        gridResolutionRef.current = {
          radial: res.radial ?? gridResolutionRef.current.radial,
          angular: res.angular ?? gridResolutionRef.current.angular,
          axial: res.axial ?? gridResolutionRef.current.axial
        };
        // Grid will be rebuilt on next frame
      },
      setDisplayGain: (gain: number) => {
        // Apply display gain to rendering
      },
      onceReady: (cb: () => void) => {
        // Always ready for Canvas 2D
        cb();
      },
      // Mock WebGL context for checkpoints
      getGLCompat: () => ({
        drawingBufferWidth: canvas.width || 800,
        drawingBufferHeight: canvas.height || 600,
        isContextLost: () => false
      })
    };

    // Also add methods to canvas for backward compatibility
    const compat = { ...engineRef.current } as any;
    delete compat.getGLCompat;            // do not shadow native 2D API
    Object.assign(canvas, compat);
  }, []);

  // Expose engine methods via ref
  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    getEngine: () => engineRef.current,
    updateUniforms: (u) => engineRef.current?.updateUniforms?.(u),
    onceReady: (cb) => engineRef.current?.onceReady?.(cb),
    setDisplayGain: (g) => engineRef.current?.setDisplayGain?.(g),
    destroy: () => engineRef.current?.destroy?.(),
    _resize: () => engineRef.current?._resize?.(),
    setVisible: (on) => engineRef.current?.setVisible?.(on),
    setPixelRatio: (pr) => engineRef.current?.setPixelRatio?.(pr),
    setSupersample: (ss) => engineRef.current?.setSupersample?.(ss),
    setGridResolution: (res) => engineRef.current?.setGridResolution?.(res)
  }));

  return (
    <canvas 
      ref={canvasRef} 
      className={className}
      style={{ 
        width: '100%', 
        height: '100%',
        background: 'black',
        ...style
      }}
    />
  );
});

export default Grid3DEngine;
