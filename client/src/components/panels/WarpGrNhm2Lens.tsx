import React from "react";
import { useQuery } from "@tanstack/react-query";
import type { TheoryBadgeGraphV1 } from "@shared/contracts/theory-badge-graph.v1";
import type { Nhm2CanonicalEvidence } from "@shared/nhm2-canonical-evidence";
import type { WarpGrNhm2Group, WarpGrNhm2GroupId } from "@shared/theory/warp-gr-nhm2-map";
import { openDocPanel } from "@/lib/docs/openDocPanel";

const CAMPAIGN_COMPONENTS_BY_GROUP: Partial<Record<WarpGrNhm2GroupId, readonly string[]>> = {
  "warp.nhm2.geometry_sample": ["profile_frontier", "profile_spec"],
  "warp.nhm2.source_closure": [
    "source_component_authority",
    "regional_full_tensor_residual",
    "casimir_material_receipt",
  ],
  "warp.nhm2.diagnostic_path": [
    "campaign",
    "observer_conditions",
    "qei_worldlines",
    "lean_campaign_certificate",
  ],
  "warp.nhm2.claim_boundary": ["lean_campaign_certificate"],
};

export const CAMPAIGN_GROUP_BY_BADGE: Record<string, WarpGrNhm2GroupId> = {
  "nhm2.geometry.lapse_shift_profile": "warp.nhm2.geometry_sample",
  "nhm2.source.component_authority_ledger": "warp.nhm2.source_closure",
  "nhm2.tensor.same_chart_full_tensor": "warp.nhm2.source_closure",
  "nhm2.qei.worldline_dossier": "warp.nhm2.diagnostic_path",
  "nhm2.formal.diagnostic_campaign_admissible": "warp.nhm2.diagnostic_path",
  "nhm2.formal.certificate_hashes_pinned": "warp.nhm2.diagnostic_path",
  "nhm2.claim_boundary.diagnostic_only": "warp.nhm2.claim_boundary",
};

export function SelectedCampaignReceipt({
  groupId,
  translateText,
}: {
  groupId: WarpGrNhm2GroupId;
  translateText: (text: string) => string;
}) {
  const { data, isLoading, error } = useQuery<Nhm2CanonicalEvidence>({
    queryKey: ["nhm2-canonical-evidence"],
    queryFn: async () => {
      const response = await fetch("/api/nhm2/canonical-evidence", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(response.status === 403 ? "Developer session required" : "Evidence HTTP " + response.status);
      }
      return response.json() as Promise<Nhm2CanonicalEvidence>;
    },
    retry: false,
    staleTime: 60_000,
  });
  const relevantIds = CAMPAIGN_COMPONENTS_BY_GROUP[groupId] ?? [];
  const components = data?.components.filter((component) => relevantIds.includes(component.id)) ?? [];
  const claimLocksClosed =
    data?.claimLocks?.physicalViabilityClaimAllowed === false &&
    data?.claimLocks?.propulsionClaimAllowed === false &&
    data?.claimLocks?.transportClaimAllowed === false &&
    data?.claimLocks?.routeEtaClaimAllowed === false &&
    data?.answerAuthority === false;
  const campaignAdmitted =
    data?.status === "available" &&
    data.campaign?.campaignPass === true &&
    data.campaign.firstBlocker === null &&
    data.profile?.id === data.campaign.runId &&
    claimLocksClosed;

  return (
    <section className="border border-sky-900/70 bg-sky-950/20 p-2 text-[10px] text-zinc-300" data-testid="nhm2-theory-campaign-receipt">
      <div className="font-semibold uppercase tracking-wide text-sky-200">
        {translateText("Selected diagnostic campaign")}
      </div>
      {isLoading ? <div className="mt-1">{translateText("Reading pinned campaign evidence…")}</div> : null}
      {error ? <div className="mt-1 text-amber-200">{translateText((error as Error).message)}</div> : null}
      {data ? (
        <>
          <div className="mt-1">
            {translateText("Archive status")}: <span className="font-semibold text-zinc-100">{data.status}</span>
          </div>
          {campaignAdmitted && data.campaign && data.profile ? (
            <>
              <div className="mt-1 break-all font-mono text-zinc-200">{data.campaign.runId}</div>
              <div>α={data.profile.alphaCenterline} · {translateText("pinned campaign PASS, diagnostic only")}</div>
            </>
          ) : (
            <div className="mt-1 text-amber-200">
              {translateText("Pinned run evidence is unavailable or inconsistent; no campaign result is admitted.")}
            </div>
          )}
          <div className="mt-1 text-amber-200">
            {claimLocksClosed
              ? translateText("Physical, propulsion, transport, and route claims remain locked.")
              : translateText("Claim lock or answer-authority mismatch; no campaign result admitted.")}
          </div>
          <div className="mt-1 text-zinc-400">
            {translateText("June shift-lapse archive; separate from the active spherical v2 gate. Hash identity is not solver replay.")}
          </div>
          <button
            type="button"
            onClick={() => openDocPanel(data.currentProgramRef)}
            className="mt-1 text-left text-sky-300 underline decoration-sky-700 underline-offset-2 hover:text-sky-100"
          >
            {translateText("Read the canonical spherical v2 work program for current gate status")}
          </button>
          {components.length > 0 ? (
            <details className="mt-2 border-t border-sky-900/70 pt-1">
              <summary className="cursor-pointer font-semibold text-sky-200">
                {translateText("Related component hashes")} ({components.length})
              </summary>
              <div className="mt-1 space-y-2">
                {components.map((component) => (
                  <div key={component.id}>
                    <div className="font-semibold text-zinc-200">{component.id.replaceAll("_", " ")}</div>
                    <div>{component.status} · {component.contractVersion ?? "no contract"}</div>
                    <div className="break-all text-[9px] text-zinc-500">{component.ref ?? "no artifact path"}</div>
                    <div className="break-all font-mono text-[9px] text-zinc-400">
                      {component.sha256 ?? "no pinned hash"}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function bandLabel(band: WarpGrNhm2Group["band"]) {
  return band.replace(/_/g, " ");
}

function bandClass(band: WarpGrNhm2Group["band"], selected: boolean) {
  const ring = selected ? " ring-2 ring-sky-100" : "";
  switch (band) {
    case "gr":
      return `border-sky-300 bg-sky-950/70 text-sky-50${ring}`;
    case "geometry":
      return `border-indigo-300 bg-indigo-950/70 text-indigo-50${ring}`;
    case "source":
      return `border-emerald-300 bg-emerald-950/70 text-emerald-50${ring}`;
    case "diagnostic":
      return `border-cyan-300 bg-cyan-950/70 text-cyan-50${ring}`;
    case "boundary":
      return `border-amber-300 bg-amber-950/70 text-amber-50${ring}`;
    default:
      return `border-zinc-300 bg-zinc-900/75 text-zinc-50${ring}`;
  }
}

function uniqueBands(groups: WarpGrNhm2Group[]) {
  return groups.reduce<WarpGrNhm2Group["band"][]>((acc, group) => {
    if (!acc.includes(group.band)) acc.push(group.band);
    return acc;
  }, []);
}

export default function WarpGrNhm2Lens({
  graph,
  groups,
  selectedGroupId,
  selectedObjectBindingId,
  translateText,
  onSelectGroup,
  onSelectObjectBinding,
  onClearObjectBinding,
  onLoadPayload,
}: {
  graph: TheoryBadgeGraphV1;
  groups: WarpGrNhm2Group[];
  selectedGroupId: WarpGrNhm2GroupId | null;
  selectedObjectBindingId: string | null;
  translateText?: (text: string) => string;
  onSelectGroup: (group: WarpGrNhm2Group) => void;
  onSelectObjectBinding: (group: WarpGrNhm2Group, bindingId: string) => void;
  onClearObjectBinding: () => void;
  onLoadPayload: (badgeId: string, payloadId: string) => void;
}) {
  const tx = translateText ?? ((text: string) => text);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const selectedBinding = selectedGroup?.objectBindings.find((binding) => binding.id === selectedObjectBindingId) ?? null;
  const badgesById = new Map(graph.badges.map((badge) => [badge.id, badge]));
  const bands = uniqueBands(groups);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-950 bg-zinc-950/95 text-zinc-100">
      <div className="border-b border-zinc-800 px-3 py-2">
        <div className="text-xs font-bold uppercase tracking-wide text-sky-200">{tx("Warp / GR")}</div>
        <div className="text-sm font-semibold">{tx("NHM2 Diagnostics")}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {bands.map((band) => (
          <section key={band} className="mb-3">
            <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              {tx(bandLabel(band))}
            </div>
            <div className="space-y-1">
              {groups
                .filter((group) => group.band === band)
                .map((group) => {
                  const selected = selectedGroupId === group.id;
                  return (
                    <button data-helix-control-id="workstation.panel.theory-badge-graph.warp-gr-nhm2-lens.on-select-group-group" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
                      key={group.id}
                      type="button"
                      aria-label={`${tx("Select")} ${tx(group.title)}`}
                      onClick={() => onSelectGroup(group)}
                      className={`w-full border px-2 py-1.5 text-left text-xs shadow ${bandClass(
                        group.band,
                        selected,
                      )}`}
                    >
                      <span className="block font-semibold">{tx(group.title)}</span>
                      <span className="mt-0.5 block text-[10px] opacity-75">{tx(group.description)}</span>
                    </button>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
      <div className="max-h-[55%] overflow-y-auto border-t border-zinc-800 p-2">
        {selectedGroup ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-100">{tx(selectedGroup.title)}</div>
            <div className="text-[11px] text-zinc-400">
              {selectedGroup.theoryBadgeIds.length} {tx("mapped badges")} / {selectedGroup.calculatorPayloadRefs.length} {tx("scalar loadouts")}
            </div>
            {selectedGroup.objectBindings.length > 0 ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{tx("Diagnostic Binding")}</div>
                  {selectedBinding ? (
                    <button data-helix-control-id="workstation.panel.theory-badge-graph.warp-gr-nhm2-lens.on-clear-object-binding" data-helix-interaction-kind="act" data-helix-authority-state="client_local"
                      type="button"
                      onClick={onClearObjectBinding}
                      className="border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-zinc-400"
                    >
                      {tx("Clear")}
                    </button>
                  ) : null}
                </div>
                {selectedGroup.objectBindings.map((binding) => {
                  const selected = selectedObjectBindingId === binding.id;
                  return (
                    <button data-helix-control-id="workstation.panel.theory-badge-graph.warp-gr-nhm2-lens.on-select-object-binding-selected-group-binding-id" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
                      key={binding.id}
                      type="button"
                      aria-label={`${tx("Use")} ${tx(binding.label)} ${tx("object binding")}`}
                      onClick={() => onSelectObjectBinding(selectedGroup, binding.id)}
                      className={`w-full border px-2 py-1.5 text-left text-[11px] ${
                        selected
                          ? "border-sky-300 bg-sky-950 text-sky-50"
                          : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-sky-700"
                      }`}
                    >
                      <span className="block font-semibold">{tx(binding.label)}</span>
                      <span className="mt-0.5 block text-[10px] opacity-75">{tx(binding.description)}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="space-y-1">
              {selectedGroup.calculatorPayloadRefs.slice(0, 6).map((ref) => {
                const badge = badgesById.get(ref.badgeId);
                const payload = badge?.calculatorPayloads.find((candidate) => candidate.id === ref.payloadId);
                if (!badge || !payload) return null;
                return (
                  <button data-helix-control-id="workstation.panel.theory-badge-graph.warp-gr-nhm2-lens.on-load-payload-ref-badge-id-ref-payload-id" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
                    key={`${ref.badgeId}-${ref.payloadId}`}
                    type="button"
                    onClick={() => onLoadPayload(ref.badgeId, ref.payloadId)}
                    className="w-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-left font-mono text-[10px] text-sky-100 hover:border-sky-300"
                  >
                    {payload.expression}
                  </button>
                );
              })}
            </div>
            {selectedGroup.calculatorPayloadRefs.length === 0 ? (
              <div className="border border-zinc-800 bg-zinc-900 px-2 py-2 text-[11px] text-zinc-500">
                {tx("Tensor/reference context. No scalar calculator payload.")}
              </div>
            ) : null}
            {selectedGroup.id !== "warp.gr.reference_roots" ? (
              <SelectedCampaignReceipt groupId={selectedGroup.id} translateText={tx} />
            ) : null}
          </div>
        ) : (
          <div className="text-[11px] text-zinc-500">{tx("Pick a GR/NHM2 group to light diagnostic theory badges.")}</div>
        )}
      </div>
    </aside>
  );
}
