import React from "react";
import type { CivicOrderParticipationV1 } from "@shared/civic-order-participation";
import type {
  CivilizationProvisioningLensV1,
  CivilizationProvisioningNetworkV1,
} from "@shared/civilization-provisioning-network";
import {
  CIVILIZATION_NATION_PARAMETER_SCOPES,
  CIVILIZATION_NATION_SCOPE_LABELS,
  CIVILIZATION_NATION_SOURCE_REFS,
  type CivilizationNationDependencyEdge,
  type CivilizationNationParameterScope,
  type CivilizationNationStateVector,
} from "@/data/civilizationNationStateVectors";
import { parameterColor } from "./CivilizationCountryLayer";
import {
  formatCivilizationLensReading,
  readCivilizationLens,
} from "./civilizationLensModel";
import { CivilizationProvisioningInspector } from "./CivilizationProvisioningInspector";

const formatSourceRef = (ref: string): string =>
  CIVILIZATION_NATION_SOURCE_REFS[ref as keyof typeof CIVILIZATION_NATION_SOURCE_REFS] ?? ref;

const parameterLabel = (value: number | null): string =>
  value === null ? "missing" : value.toFixed(2);

function scopeSpread(
  vectors: CivilizationNationStateVector[],
  scope: CivilizationNationParameterScope,
): string {
  const values = vectors
    .map((vector) => vector.parameters[scope])
    .filter((value): value is number => value !== null);
  return values.length < 2 ? "0.00" : (Math.max(...values) - Math.min(...values)).toFixed(2);
}

export function CivilizationCountryInspector({
  vectors,
  edges,
  comparisonEdges,
  lens,
  provisioningNetwork,
  civicOrderParticipation,
}: {
  vectors: CivilizationNationStateVector[];
  edges: CivilizationNationDependencyEdge[];
  comparisonEdges: CivilizationNationDependencyEdge[];
  lens: CivilizationProvisioningLensV1;
  provisioningNetwork?: CivilizationProvisioningNetworkV1;
  civicOrderParticipation?: CivicOrderParticipationV1;
}) {
  if (vectors.length === 1) {
    return (
      <CountryReceipt
        vector={vectors[0]}
        edges={edges}
        lens={lens}
        provisioningNetwork={provisioningNetwork}
        civicOrderParticipation={civicOrderParticipation}
      />
    );
  }
  return <CountryComparison vectors={vectors} comparisonEdges={comparisonEdges} lens={lens} />;
}

function CountryReceipt({
  vector,
  edges,
  lens,
  provisioningNetwork,
  civicOrderParticipation,
}: {
  vector: CivilizationNationStateVector;
  edges: CivilizationNationDependencyEdge[];
  lens: CivilizationProvisioningLensV1;
  provisioningNetwork?: CivilizationProvisioningNetworkV1;
  civicOrderParticipation?: CivicOrderParticipationV1;
}) {
  const lensReading = readCivilizationLens(vector, lens);
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-300 sm:grid-cols-4">
        <div><span className="text-slate-500">observed</span><div className="mt-1 text-slate-100">{vector.observedAt}</div></div>
        <div><span className="text-slate-500">freshness</span><div className="mt-1 text-slate-100">{vector.freshnessDays}d</div></div>
        <div><span className="text-slate-500">confidence</span><div className="mt-1 text-emerald-100">{vector.confidence.toFixed(2)}</div></div>
        <div><span className="text-slate-500">{lensReading.label.toLowerCase()}</span><div className="mt-1 text-slate-100">{formatCivilizationLensReading(lensReading)}</div></div>
      </div>

      <CivilizationProvisioningInspector
        vector={vector}
        lens={lens}
        provisioning={provisioningNetwork}
        civicOrder={civicOrderParticipation}
      />
      <ParameterGrid vectors={[vector]} />

      <div className="mt-3 flex flex-wrap gap-1">
        {vector.clusters.map((cluster) => (
          <span key={cluster} className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] text-cyan-100">
            {cluster.replaceAll("_", " ")}
          </span>
        ))}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="text-[11px] text-slate-300"><span className="text-slate-500">missing: </span>{vector.missingObservations.join(", ")}</div>
        <div className="text-[11px] text-slate-400">sources: {vector.sourceRefs.slice(0, 6).map(formatSourceRef).join(", ")}</div>
      </div>
      <DependencyList edges={edges} emptyLabel="No seeded dependency relation selected." />
    </>
  );
}

function CountryComparison({
  vectors,
  comparisonEdges,
  lens,
}: {
  vectors: CivilizationNationStateVector[];
  comparisonEdges: CivilizationNationDependencyEdge[];
  lens: CivilizationProvisioningLensV1;
}) {
  return (
    <>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {vectors.map((vector) => {
          const reading = readCivilizationLens(vector, lens);
          return (
            <div key={vector.countryIso3} className="rounded-md border border-white/10 bg-white/[0.04] p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-white">{vector.label}</div>
                <div className="text-[10px] text-slate-400">{vector.countryIso3}</div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-slate-400">
                <span>{reading.label.toLowerCase()} {formatCivilizationLensReading(reading)}</span>
                <span>confidence {vector.confidence.toFixed(2)}</span>
                <span>fresh {vector.freshnessDays}d</span>
              </div>
            </div>
          );
        })}
      </div>
      <ParameterGrid vectors={vectors} />
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {CIVILIZATION_NATION_PARAMETER_SCOPES.map((scope) => (
          <div key={scope} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
            <div className="text-[10px] text-slate-500">{CIVILIZATION_NATION_SCOPE_LABELS[scope]} spread</div>
            <div className="mt-1 text-sm font-semibold text-white">{scopeSpread(vectors, scope)}</div>
          </div>
        ))}
      </div>
      <DependencyList edges={comparisonEdges} emptyLabel="No seeded relation directly links the selected countries." />
    </>
  );
}

function ParameterGrid({ vectors }: { vectors: CivilizationNationStateVector[] }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {CIVILIZATION_NATION_PARAMETER_SCOPES.map((scope) => (
        <div key={scope} className="rounded-md border border-white/10 bg-white/[0.04] p-2">
          <div className="text-[10px] text-slate-400">{CIVILIZATION_NATION_SCOPE_LABELS[scope]}</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {vectors.map((vector) => (
              <span key={`${vector.countryIso3}:${scope}`} className="text-sm font-semibold" style={{ color: parameterColor(scope, vector.parameters[scope]) }}>
                {vectors.length > 1 ? `${vector.countryIso3} ` : ""}{parameterLabel(vector.parameters[scope])}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DependencyList({
  edges,
  emptyLabel,
}: {
  edges: CivilizationNationDependencyEdge[];
  emptyLabel: string;
}) {
  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Dependency relations</div>
      <div className="mt-2 grid gap-2 lg:grid-cols-2">
        {edges.length === 0 ? (
          <div className="text-[11px] text-slate-400">{emptyLabel}</div>
        ) : edges.map((edge) => (
          <div key={edge.edgeId} className="rounded-md border border-white/10 bg-white/[0.04] p-2">
            <div className="text-[11px] text-slate-200">{edge.label}</div>
            <div className="mt-1 text-[10px] text-slate-500">
              {edge.fromIso3} to {edge.toIso3} - {edge.kind.replaceAll("_", " ")} - confidence {edge.confidence.toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
