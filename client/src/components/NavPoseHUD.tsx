import React, { useEffect } from "react";
import { useNavPoseStore } from "@/store/useNavPoseStore";

const len = (x: number, y: number, z: number) => Math.hypot(x, y, z);
const fmt = (value: number, unit: string) =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;

type Props = {
  attach?: "top-left" | "top-right";
};

export const NavPoseHUD: React.FC<Props> = ({ attach = "top-left" }) => {
  const pose = useNavPoseStore((state) => state.navPose);
  const source = useNavPoseStore((state) => state.source);
  const start = useNavPoseStore((state) => state.start);
  const stop = useNavPoseStore((state) => state.stop);

  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);
  const [x, y, z] = pose.position_m;
  const [vx, vy, vz] = pose.velocity_mps;
  const speed = len(vx, vy, vz);
  const altitude = Math.abs(z);
  const AU = 149_597_870_000;
  const rSun = len(x, y, z);

  return (
    <div
      style={{
        position: "absolute",
        [attach === "top-left" ? "left" : "right"]: 12,
        top: 12,
        padding: "10px 12px",
        background: "rgba(2,4,10,0.6)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 8,
        color: "#fff",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
        backdropFilter: "blur(6px)",
      }}
    >
      <div style={{ opacity: 0.75, marginBottom: 6 }}>NavPose diagnostic</div>
      <div>
        <strong>Pose speed:</strong> {fmt(speed, "m/s")}
      </div>
      <div>
        <strong>Source:</strong> {source === "server" ? "server pose" : source === "derived" ? "local intent model" : "placeholder orbit"}
      </div>
      <div>
        <strong>Altitude:</strong> {fmt(altitude, "m")}
      </div>
      <div>
        <strong>Heading:</strong> {pose.heading_deg.toFixed(1)} deg
      </div>
      <div>
        <strong>Distance to Sun:</strong> {(rSun / AU).toFixed(3)} AU
      </div>
      <div>
        <strong>Frame:</strong> {pose.frame}
      </div>
      <div style={{ opacity: 0.75, maxWidth: 280, marginTop: 6 }}>
        Display pose only; no measured warp speed, route ETA, or selected-run NHM2 transport result.
      </div>
    </div>
  );
};

export default NavPoseHUD;
