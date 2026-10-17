import React from "react";
import type { CivicOrderParticipationV1 } from "@shared/civic-order-participation";
import type {
  CivilizationProvisioningLensV1,
  CivilizationProvisioningNetworkV1,
} from "@shared/civilization-provisioning-network";
import type { CivilizationNationStateVector } from "@/data/civilizationNationStateVectors";
import {
  formatCivilizationLensReading,
  readCivilizationLens,
} from "./civilizationLensModel";

export function CivilizationProvisioningInspector({
  vector,
  lens,
  provisioning,
  civicOrder,
}: {
  vector: CivilizationNationStateVector;
  lens: CivilizationProvisioningLensV1;
  provisioning?: CivilizationProvisioningNetworkV1;
  civicOrder?: CivicOrderParticipationV1;
}) {
  const reading = readCivilizationLens(vector, lens);
  return (
    <div className="mt-3 border-t border-white/10 pt-3" data-testid="civilization-provisioning-inspector">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-4">
        <div>
          <div className="text-slate-500">selected lens</div>
          <div className="mt-1 text-slate-100">{reading.label}</div>
        </div>
        <div>
          <div className="text-slate-500">lens value</div>
          <div className="mt-1 text-slate-100">{formatCivilizationLensReading(reading)}</div>
        </div>
        <div>
          <div className="text-slate-500">source scope</div>
          <div className="mt-1 text-slate-100">{reading.sourceScope?.replaceAll("_", " ") ?? "not bound"}</div>
        </div>
        <div>
          <div className="text-slate-500">evidence state</div>
          <div className="mt-1 text-slate-100">{reading.evidenceState}</div>
        </div>
      </div>

      {provisioning && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-[10px] text-slate-300 sm:grid-cols-4 lg:grid-cols-8">
          <span>needs {provisioning.needs.length}</span>
          <span>flows {provisioning.flows.length}</span>
          <span>portfolio {provisioning.collectiveInvestmentPortfolio.length}</span>
          <span>roles {provisioning.roleDelegations.length}</span>
          <span>settlement {provisioning.settlementInterfaces.length}</span>
          <span>projects {provisioning.cooperationProjects.length}</span>
          <span>tensions {provisioning.tensions.length}</span>
          <span>missing {provisioning.missingEvidence.length}</span>
        </div>
      )}

      {civicOrder && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-[10px] text-slate-300">
          <span>actors {civicOrder.actors.length}</span>
          <span>norms {civicOrder.localNorms.length}</span>
          <span>allocation channels {civicOrder.coordinationProfile.allocationChannels.length}</span>
          <span>authority channels {civicOrder.coordinationProfile.authorityChannels.length}</span>
          <span>accountability channels {civicOrder.coordinationProfile.accountabilityChannels.length}</span>
          <span>missing {civicOrder.missingEvidence.length}</span>
        </div>
      )}
    </div>
  );
}
