import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useNavPoseStore } from "@/store/useNavPoseStore";
import { useDriveSyncStore } from "@/store/useDriveSyncStore";

const EARTH_DIAMETER_M = 12_742_000;
const UNITS_PER_EARTH_DIAMETER = 0.002;
const metersToUnits = (m: number) => (m / EARTH_DIAMETER_M) * UNITS_PER_EARTH_DIAMETER;
const earthDiametersToUnits = (ed: number) => ed * UNITS_PER_EARTH_DIAMETER;

const HULL_LENGTH_M = 1007;
const HULL_WIDTH_M = 264;
const HULL_HEIGHT_M = 173;
const CAMERA_TRAIL_M = 1500;
const CAMERA_ELEVATION_M = 650;
const CAMERA_LERP = 0.08;
const TARGET_LERP = 0.18;
const INTENT_VECTOR_SPAN_M = 4000;

type Props = {
  height?: number | string;
  gridExtentED?: number;
  honesty?: boolean;
};

export const SolarNavViewer: React.FC<Props> = ({
  height = 420,
  gridExtentED = 800,
  honesty = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const start = useNavPoseStore((state) => state.start);
  const stop = useNavPoseStore((state) => state.stop);
  const intentRef = useRef(useDriveSyncStore.getState().intent);

  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  useEffect(() => {
    const unsubscribe = useDriveSyncStore.subscribe((state) => {
      intentRef.current = state.intent;
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const heightPx = typeof height === "number" ? height : container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02040a);

    const camera = new THREE.PerspectiveCamera(55, width / Number(heightPx), 0.1, 1e9);
    camera.position.set(
      0,
      metersToUnits(-CAMERA_TRAIL_M),
      metersToUnits(CAMERA_ELEVATION_M),
    );
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, Number(heightPx));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.screenSpacePanning = honesty;

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const sunLight = new THREE.PointLight(0xffffff, 2.2, 0, 2);
    scene.add(sunLight);

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(earthDiametersToUnits(500), 32, 24),
      new THREE.MeshStandardMaterial({
        color: 0xffe57a,
        emissive: 0x885500,
        emissiveIntensity: 0.7,
      }),
    );
    scene.add(sun);

    const gridGroup = new THREE.Group();
    const patch = gridExtentED;
    const step = earthDiametersToUnits(1);
    const half = earthDiametersToUnits(patch / 2);
    const positions: number[] = [];

    const thinOut = (ed: number) => {
      const dist = Math.abs(ed);
      if (dist < 200) return 1;
      if (dist < 2000) return 5;
      if (dist < 10_000) return 20;
      return 100;
    };

    for (let ed = -patch / 2; ed <= patch / 2; ed += 1) {
      const i = Math.round(ed);
      if (i % thinOut(i) !== 0) continue;
      const x = i * step;
      positions.push(x, -half, 0, x, half, 0);
      positions.push(-half, x, 0, half, x, 0);
    }
    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
    );
    gridGroup.add(
      new THREE.LineSegments(
        gridGeometry,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }),
      ),
    );
    scene.add(gridGroup);

    const hullRadiusUnits = metersToUnits(HULL_WIDTH_M / 2);
    const hullLengthUnits = metersToUnits(HULL_LENGTH_M);
    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(hullRadiusUnits, hullLengthUnits, 5),
      new THREE.MeshStandardMaterial({
        color: 0x00ffe1,
        emissive: 0x00443f,
        emissiveIntensity: 0.6,
        metalness: 0.1,
        roughness: 0.4,
      }),
    );
    scene.add(marker);

    const velocityGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
    ]);
    const velocityLine = new THREE.Line(
      velocityGeometry,
      new THREE.LineBasicMaterial({ color: 0x00ffe1, transparent: true, opacity: 0.85 }),
    );
    scene.add(velocityLine);
    const cameraOffset = new THREE.Vector3(
      0,
      metersToUnits(-CAMERA_TRAIL_M),
      metersToUnits(CAMERA_ELEVATION_M),
    );
    const desiredCameraPos = new THREE.Vector3();
    const padVector = new THREE.Vector3();

    const handleResize = () => {
      const newWidth = container.clientWidth;
      const newHeight = typeof height === "number" ? height : container.clientHeight;
      camera.aspect = newWidth / Number(newHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, Number(newHeight));
    };
    window.addEventListener("resize", handleResize);

    let rafId = 0;
    const render = () => {
      const pose = useNavPoseStore.getState().navPose;
      const position = new THREE.Vector3(
        metersToUnits(pose.position_m[0]),
        metersToUnits(pose.position_m[1]),
        metersToUnits(pose.position_m[2]),
      );
      const velocity = new THREE.Vector3(
        metersToUnits(pose.velocity_mps[0]),
        metersToUnits(pose.velocity_mps[1]),
        metersToUnits(pose.velocity_mps[2]),
      );

      marker.position.copy(position);
      marker.up.set(0, 0, 1);
      const heading = THREE.MathUtils.degToRad(pose.heading_deg);
      marker.lookAt(position.clone().add(new THREE.Vector3(Math.cos(heading), Math.sin(heading), 0)));
      marker.rotateX(Math.PI / 2);

      const attr = velocityGeometry.attributes.position as THREE.BufferAttribute;
      const intent = intentRef.current;
      padVector.set(intent.x, intent.y, intent.z);
      const padMag = padVector.length();
      if (padMag > 1e-3) {
        const spanUnits = metersToUnits(INTENT_VECTOR_SPAN_M * Math.max(0.25, padMag));
        padVector.normalize().multiplyScalar(spanUnits);
      } else if (velocity.lengthSq() > 1e-8) {
        const spanUnits = metersToUnits(INTENT_VECTOR_SPAN_M * 0.25);
        padVector.copy(velocity).normalize().multiplyScalar(spanUnits);
      } else {
        padVector.set(0, 0, 0);
      }
      attr.setXYZ(0, position.x, position.y, position.z);
      attr.setXYZ(1, position.x + padVector.x, position.y + padVector.y, position.z + padVector.z);
      attr.needsUpdate = true;

      desiredCameraPos.copy(position).add(cameraOffset);
      camera.position.lerp(desiredCameraPos, CAMERA_LERP);
      controls.target.lerp(position, TARGET_LERP);

      sunLight.position.copy(position);
      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [height, gridExtentED, honesty]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
};

export default SolarNavViewer;
