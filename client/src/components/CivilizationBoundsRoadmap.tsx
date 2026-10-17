import { useCallback, useState } from "react";
import type { CivicOrderParticipationV1 } from "@shared/civic-order-participation";
import type { CivilizationProvisioningNetworkV1 } from "@shared/civilization-provisioning-network";
import { CivilizationGeospatialSettings } from "./civilization/CivilizationGeospatialSettings";
import { CivilizationGoogleBasemap } from "./civilization/CivilizationGoogleBasemap";

export type CivilizationBoundsRoadmapProps = {
  scenarioId?: string;
  provisioningNetwork?: CivilizationProvisioningNetworkV1;
  civicOrderParticipation?: CivicOrderParticipationV1;
};

export function CivilizationBoundsRoadmap(_props: CivilizationBoundsRoadmapProps) {
  const [selectedIso3s, setSelectedIso3s] = useState<string[]>([]);

  const toggleSelectedCountry = useCallback((iso3: string) => {
    setSelectedIso3s((current) => current.includes(iso3)
      ? current.filter((selectedIso3) => selectedIso3 !== iso3)
      : current.length >= 2 ? [current[0], iso3] : [...current, iso3]);
  }, []);

  return (
    <div className="relative h-full min-h-[620px] overflow-hidden bg-[#06110f] text-slate-100"
      aria-label="Civilization diplomatic map">
      <CivilizationGoogleBasemap selectedIso3s={selectedIso3s} onToggleCountry={toggleSelectedCountry} />
      <CivilizationGeospatialSettings />
    </div>
  );
}

export default CivilizationBoundsRoadmap;
