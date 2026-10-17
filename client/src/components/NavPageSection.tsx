import React from "react";
import SolarNavViewer from "@/components/SolarNavViewer";
import NavPoseHUD from "@/components/NavPoseHUD";

export const NavPageSection: React.FC = () => {
  return (
    <div style={{ position: "relative", width: "100%", height: 520 }}>
      <SolarNavViewer height={520} gridExtentED={60_000} honesty={false} />
      <NavPoseHUD attach="top-left" />
    </div>
  );
};

export default NavPageSection;
