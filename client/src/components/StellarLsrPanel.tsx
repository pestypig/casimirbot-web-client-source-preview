import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Button } from "@/components/ui/button";
import { useLocalRestStars } from "@/state/useLocalRestStars";
import { AU_IN_METERS } from "@/lib/units";

const AU_TO_UNITS = 1 / 5_000; // compress AU scale into a manageable scene span

function buildPointCloud(pos?: Float32Array | null, col?: Float32Array | null) {
  if (!pos || !col || pos.length === 0 || col.length === 0) return null;
  const count = pos.length / 3;
  const geometry = new THREE.BufferGeometry();
  const scaled = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i++) {
    scaled[i] = pos[i] * AU_TO_UNITS;
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(scaled, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return { geometry, count };
}

export default function StellarLsrPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const load = useLocalRestStars((s) => s.load);
  const stream = useLocalRestStars((s) => s.stream);
  const stop = useLocalRestStars((s) => s.stop);
  const setParams = useLocalRestStars((s) => s.setParams);
  const pos = useLocalRestStars((s) => s.pos);
  const col = useLocalRestStars((s) => s.col);
  const count = useLocalRestStars((s) => s.count);
  const snapshot = useLocalRestStars((s) => s.snapshot);
  const isLoading = useLocalRestStars((s) => s.loading);
  const error = useLocalRestStars((s) => s.error);
  const params = useLocalRestStars((s) => s.params);

  const [radiusPc, setRadiusPc] = useState(params.radius_pc ?? 50);
  const [category, setCategory] = useState<string | undefined>(params.category);
  const [withOort, setWithOort] = useState<boolean>(params.with_oort ?? false);

  const pointCloud = useMemo(() => buildPointCloud(pos, col), [pos, col]);

  useEffect(() => {
    setParams({ radius_pc: radiusPc, category, with_oort: withOort });
  }, [category, radiusPc, withOort, setParams]);

  useEffect(() => {
    load();
    stream();
    return () => stop();
  }, [load, stream, stop]);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const starsMeshRef = useRef<THREE.Points | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 640;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050915);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1e6);
    camera.position.set(0, 200, 220);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 10;
    controls.maxDistance = 2_000;
    controlsRef.current = controls;

    const amb = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(amb);

    const handleResize = () => {
      const w = container.clientWidth || width;
      const h = container.clientHeight || height;
      if (!cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    let raf = 0;
    const tick = () => {
      controlsRef.current?.update();
      rendererRef.current?.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      if (starsMeshRef.current) {
        starsMeshRef.current.geometry.dispose();
        starsMeshRef.current = null;
      }
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (starsMeshRef.current) {
      scene.remove(starsMeshRef.current);
      starsMeshRef.current.geometry.dispose();
      starsMeshRef.current = null;
    }
    if (!pointCloud) return;
    const starMaterial = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
    });
    const mesh = new THREE.Points(pointCloud.geometry, starMaterial);
    scene.add(mesh);
    starsMeshRef.current = mesh;
  }, [pointCloud]);

  const handleReload = () => {
    setParams({ radius_pc: radiusPc, category, with_oort: withOort });
    load();
    stream();
  };

  const epochIso = snapshot ? new Date(snapshot.meta.epochMs).toISOString() : "n/a";
  const boundsText = snapshot
    ? `${(snapshot.meta.bounds_m.min[0] / AU_IN_METERS).toFixed(0)},${(snapshot.meta.bounds_m.min[1] / AU_IN_METERS).toFixed(0)},${(snapshot.meta.bounds_m.min[2] / AU_IN_METERS).toFixed(0)} -> ${(snapshot.meta.bounds_m.max[0] / AU_IN_METERS).toFixed(0)},${(snapshot.meta.bounds_m.max[1] / AU_IN_METERS).toFixed(0)},${(snapshot.meta.bounds_m.max[2] / AU_IN_METERS).toFixed(0)}`
    : "n/a";

  return (
    <section className="flex h-full flex-col gap-3 bg-slate-950/80 text-slate-100">
      <header className="flex items-center gap-3 px-4 pt-3">
        <div>
          <div className="text-lg font-semibold">Local Standard of Rest</div>
          <div className="text-xs text-slate-400">Heliocentric ICRS positions, LSR velocities (server propagated)</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <label className="text-xs text-slate-300">
            Radius (pc)
            <input
              className="ml-2 w-20 rounded bg-slate-900 px-2 py-1 text-xs text-white border border-slate-700"
              type="number"
              min={10}
              max={2000}
              value={radiusPc}
              onChange={(e) => setRadiusPc(Number(e.target.value || 0))}
            />
          </label>
          <label className="text-xs text-slate-300">
            Category
            <input
              className="ml-2 w-28 rounded bg-slate-900 px-2 py-1 text-xs text-white border border-slate-700"
              placeholder="HR cat (optional)"
              value={category ?? ""}
              onChange={(e) => setCategory(e.target.value.trim() || undefined)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border border-slate-700 bg-slate-900"
              checked={withOort}
              onChange={(e) => setWithOort(e.target.checked)}
            />
            Oort shear
          </label>
          <Button size="sm" variant="secondary" onClick={handleReload} disabled={isLoading}>
            {isLoading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </header>

      <div className="px-4 text-xs text-slate-300">
        <span className="mr-4">Stars: {count}</span>
        <span className="mr-4">Epoch: {epochIso}</span>
        <span className="mr-4">Bounds (AU): {boundsText}</span>
        {snapshot?.meta ? (
          <>
            <span className="mr-4">
              ⟨U,V,W⟩ km/s:{" "}
              {`${snapshot.meta.velocityAvg_kms[0].toFixed(1)}, ${snapshot.meta.velocityAvg_kms[1].toFixed(1)}, ${snapshot.meta.velocityAvg_kms[2].toFixed(1)}`}
            </span>
            <span className="mr-4">
              Disp:{" "}
              {`${snapshot.meta.velocityDisp_kms[0].toFixed(1)}, ${snapshot.meta.velocityDisp_kms[1].toFixed(1)}, ${snapshot.meta.velocityDisp_kms[2].toFixed(1)}`}
            </span>
            <span className="mr-4">
              Density: {snapshot.meta.density_per_pc3.toExponential(2)} pc^-3
            </span>
            <span className="mr-4">
              Solar (U,V,W):{" "}
              {`${snapshot.meta.solarPeculiar_kms[0].toFixed(1)}, ${snapshot.meta.solarPeculiar_kms[1].toFixed(1)}, ${snapshot.meta.solarPeculiar_kms[2].toFixed(1)}`}
            </span>
            {snapshot.meta.oort && (
              <span className="mr-4">
                Oort A,B: {snapshot.meta.oort.A.toFixed(1)}, {snapshot.meta.oort.B.toFixed(1)} km s^-1 kpc^-1
              </span>
            )}
          </>
        ) : null}
        {error && <span className="text-rose-300">Error: {error}</span>}
      </div>

      <div ref={containerRef} className="relative flex-1 min-h-[480px] overflow-hidden rounded-lg border border-slate-800 mx-4 mb-4">
        {!pos && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
            {isLoading ? "Fetching LSR snapshot..." : "No data yet"}
          </div>
        )}
      </div>
    </section>
  );
}
