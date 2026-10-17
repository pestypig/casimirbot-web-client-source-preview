import type { HullPaletteState, HullVolumeViz } from "@/store/useHull3DSharedStore";

type Hull3DVolumeViz = Exclude<HullVolumeViz, "warp">;

export type GeoVisThetaPreset = {
  hullVolumeViz: Hull3DVolumeViz;
  planarVizMode: 3;
  thetaSign: 1 | -1;
  palette: Pick<HullPaletteState, "id" | "encodeBetaSign" | "legend">;
  showThetaIsoOverlay: boolean;
};

export const GEO_VIS_THETA_PRESET: GeoVisThetaPreset = {
  hullVolumeViz: "theta_gr",
  planarVizMode: 3,
  thetaSign: -1,
  palette: {
    id: "diverging",
    encodeBetaSign: true,
    legend: true,
  },
  showThetaIsoOverlay: true,
};
