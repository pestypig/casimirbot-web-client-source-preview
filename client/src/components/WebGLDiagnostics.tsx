
import React, { useEffect, useState } from 'react';

export default function WebGLDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<any>(null);

  useEffect(() => {
    const runDiagnostics = () => {
      const results: any = {
        timestamp: new Date().toISOString(),
        environment: {
          isReplit: window.location?.hostname?.includes('replit') || window.location?.hostname?.includes('repl.co'),
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          hardwareConcurrency: navigator.hardwareConcurrency,
          onLine: navigator.onLine,
          cookieEnabled: navigator.cookieEnabled
        },
        webgl: {
          webglContext: !!window.WebGLRenderingContext,
          webgl2Context: !!window.WebGL2RenderingContext,
          canvas: !!window.HTMLCanvasElement
        }
      };

      // Test WebGL context creation
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;

        const gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
        const gl = (gl2 || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as
          | WebGLRenderingContext
          | WebGL2RenderingContext
          | null;

        if (gl) {
          results.webgl.contextCreated = true;
          results.webgl.version = gl2 ? '2.0' : '1.0';
          try {
            const g: any = gl;
            if (typeof g.getParameter === 'function') {
              results.webgl.renderer = g.getParameter(g.RENDERER);
              results.webgl.vendor = g.getParameter(g.VENDOR);
              results.webgl.glVersion = g.getParameter(g.VERSION);
              results.webgl.shadingLanguageVersion = g.getParameter(g.SHADING_LANGUAGE_VERSION);
              results.webgl.maxTextureSize = g.getParameter(g.MAX_TEXTURE_SIZE);
              results.webgl.maxViewportDims = g.getParameter(g.MAX_VIEWPORT_DIMS);
            }

            // Test shader compilation if available
            try {
              if (typeof g.createShader === 'function') {
                const vertexShader = g.createShader(g.VERTEX_SHADER);
                if (vertexShader && typeof g.shaderSource === 'function') {
                  g.shaderSource(vertexShader, 'attribute vec4 a_position; void main() { gl_Position = a_position; }');
                  g.compileShader(vertexShader);
                  results.webgl.shaderCompilation = !!g.getShaderParameter && g.getShaderParameter(vertexShader, g.COMPILE_STATUS);
                } else {
                  results.webgl.shaderCompilation = false;
                }
              } else {
                results.webgl.shaderCompilation = false;
              }
            } catch (shaderError) {
              results.webgl.shaderCompilation = false;
              results.webgl.shaderError = (shaderError as any)?.message ?? String(shaderError);
            }
          } catch (e) {
            // If any unexpected error occurs while probing GL, capture it but don't throw
            results.webgl.probeError = (e as any)?.message ?? String(e);
          }
        } else {
          results.webgl.contextCreated = false;
          results.webgl.error = 'Context creation failed';
        }
      } catch (error) {
        results.webgl.contextCreated = false;
        results.webgl.error = (error as any)?.message ?? String(error);
      }

      setDiagnostics(results);
    };

    runDiagnostics();
  }, []);

  if (!diagnostics) {
    return <div className="p-4">Running WebGL diagnostics...</div>;
  }

  return (
    <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
      <h3 className="text-lg font-semibold mb-4">WebGL Diagnostics</h3>
      <pre className="text-xs overflow-auto bg-white dark:bg-gray-900 p-3 rounded">
        {JSON.stringify(diagnostics, null, 2)}
      </pre>
      
      {diagnostics.environment.isReplit && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-700">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Replit Environment Detected:</strong> If WebGL is not working, try refreshing the page or opening in a new tab.
          </p>
        </div>
      )}
    </div>
  );
}
