import React from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { VacuumContract, VacuumContractStatus } from "@shared/schema";

const STATUS_STYLES: Record<VacuumContractStatus, string> = {
  green: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40",
  amber: "bg-amber-500/15 text-amber-300 border border-amber-500/40",
  red: "bg-rose-500/15 text-rose-300 border border-rose-500/40",
};

const formatNumber = (value: number | null | undefined, digits = 2, suffix = "") => {
  if (!Number.isFinite(value ?? NaN)) return "--";
  return `${Number(value).toFixed(digits)}${suffix}`;
};

const formatInt = (value: number | null | undefined) => {
  if (!Number.isFinite(value ?? NaN)) return "--";
  return Math.round(Number(value)).toLocaleString();
};

const updatedLabel = (timestamp: number) => {
  if (!Number.isFinite(timestamp)) return "--";
  try {
    const dt = new Date(timestamp);
    return `${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}`;
  } catch {
    return "--";
  }
};

type VacuumContractBadgeProps = {
  contract: VacuumContract | null | undefined;
  className?: string;
};

const guardSummary = (contract: VacuumContract) => {
  const guards = contract.exports?.qiGuards;
  if (!guards) return null;
  const parts = [
    guards.zeta ? `zeta ${formatNumber(guards.zeta.value, 3)} (${guards.zeta.status})` : null,
    guards.duty ? `duty ${formatNumber(guards.duty.value, 4)} (${guards.duty.status})` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : null;
};

const tooltipSpecLines = (contract: VacuumContract) => {
  const { spec, exports: exportsData } = contract;
  return [
    `Geometry | gap ${formatNumber(spec.geometry?.gap_nm, 1, " nm")} | hull ref ${formatNumber(spec.geometry?.hullReferenceRadius_m, 2, " m")} | bubble ${formatNumber(spec.geometry?.bubbleRadius_m, 2, " m")} | sectors ${formatInt(spec.geometry?.sectorsConcurrent)}/${formatInt(spec.geometry?.sectorCount)}`,
    `Boundary | ${spec.boundary?.material ?? "--"} | model ${spec.boundary?.model ?? "--"} | surface ${spec.boundary?.surface ?? "--"}`,
    `Thermal | cavity ${formatNumber(spec.thermal?.cavity_K, 2, " K")} | environment ${formatNumber(spec.thermal?.environment_K, 2, " K")} | gradient ${formatNumber(spec.thermal?.gradient_K, 2, " K")}`,
    `Loss | Q_L ${formatInt(spec.loss?.qCavity)} | q_mech ${formatInt(spec.loss?.qMechanical)} | zeta ${formatNumber(spec.loss?.zeta, 3)}`,
    `Drive | freq ${formatNumber(spec.drive?.modulationFreq_GHz, 3, " GHz")} | duty ${formatNumber(spec.drive?.dutyCycle, 4)} | pump ${formatNumber(spec.drive?.pumpPhase_deg, 2, " deg")}`,
    `Readout | zeta ${formatNumber(spec.readout?.coupling_zeta, 3)} | noise ${formatNumber(spec.readout?.amplifierNoiseTemp_K, 2, " K")} | kappa_eff ${formatNumber(exportsData?.kappaEff_MHz, 3, " MHz")}`,
  ];
};

const tooltipExportLines = (contract: VacuumContract) => {
  const exportsData = contract.exports ?? {};
  return [
    `mode density ${formatNumber(exportsData.modeDensity_perGHz, 4, " per GHz")}`,
    `effective T ${formatNumber(exportsData.effectiveTemp_K, 2, " K")}`,
    `kappa_eff ${formatNumber(exportsData.kappaEff_MHz, 3, " MHz")}`,
    `DCE gain ${formatNumber(exportsData.dceGain_dB, 2, " dB")}`,
    `pump ratio ${formatNumber(exportsData.pumpRatio, 3)}`,
  ];
};

const summaryChunks = (contract: VacuumContract) => {
  const { spec, exports: exportsData } = contract;
  return [
    spec.geometry?.gap_nm != null ? `gap ${formatNumber(spec.geometry.gap_nm, 1, " nm")}` : null,
    spec.geometry?.hullReferenceRadius_m != null
      ? `hull ref ${formatNumber(spec.geometry.hullReferenceRadius_m, 2, " m")}`
      : null,
    spec.geometry?.bubbleRadius_m != null
      ? `bubble ${formatNumber(spec.geometry.bubbleRadius_m, 2, " m")}`
      : null,
    spec.geometry?.sectorsConcurrent != null && spec.geometry?.sectorCount != null
      ? `sectors ${formatInt(spec.geometry.sectorsConcurrent)}/${formatInt(spec.geometry.sectorCount)}`
      : null,
    spec.boundary?.material ? `boundary ${spec.boundary.material}` : null,
    spec.thermal?.cavity_K != null ? `T ${formatNumber(spec.thermal.cavity_K, 2, " K")}` : null,
    spec.loss?.qCavity != null ? `Q_L ${formatInt(spec.loss.qCavity)}` : null,
    spec.loss?.zeta != null ? `zeta ${formatNumber(spec.loss.zeta, 3)}` : null,
    spec.drive?.modulationFreq_GHz != null ? `freq ${formatNumber(spec.drive.modulationFreq_GHz, 3, " GHz")}` : null,
    spec.drive?.dutyCycle != null ? `duty ${formatNumber(spec.drive.dutyCycle, 4)}` : null,
    exportsData?.kappaEff_MHz != null ? `kappa_eff ${formatNumber(exportsData.kappaEff_MHz, 3, " MHz")}` : null,
    spec.readout?.amplifierNoiseTemp_K != null ? `noise ${formatNumber(spec.readout.amplifierNoiseTemp_K, 2, " K")}` : null,
  ].filter(Boolean) as string[];
};

const changedLabel = (contract: VacuumContract) => {
  if (!contract.changed?.length) return null;
  return `delta ${contract.changed.join(", ")}`;
};

const VacuumContractBadge: React.FC<VacuumContractBadgeProps> = ({ contract, className }) => {
  if (!contract) return null;

  const summary = summaryChunks(contract).slice(0, 6);
  const guards = guardSummary(contract);
  const specLines = tooltipSpecLines(contract);
  const exportLines = tooltipExportLines(contract);
  const changes = changedLabel(contract);
  const updated = updatedLabel(contract.updatedAt);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex flex-wrap items-center gap-2", className)}>
            <Badge className={cn("text-[11px] font-semibold", STATUS_STYLES[contract.status])}>
              Vacuum {contract.status.toUpperCase()}
            </Badge>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
              {summary.map((text) => (
                <span key={text}>{text}</span>
              ))}
            </div>
            {changes ? (
              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-300">
                {changes}
              </Badge>
            ) : null}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm space-y-2 text-xs leading-relaxed">
          <div>
            <div className="font-semibold text-slate-200">{contract.label}</div>
            <div className="text-slate-400 text-[11px]">Updated {updated}</div>
          </div>
          {guards ? (
            <div>
              <div className="font-semibold text-slate-200">Guards</div>
              <div className="text-slate-300">{guards}</div>
            </div>
          ) : null}
          <div>
            <div className="font-semibold text-slate-200">Rule</div>
            <div className="text-slate-300">
              {contract.rule ?? "Changing geometry, boundary, thermal, loss, drive, or readout assumptions invalidates this vacuum snapshot."}
            </div>
          </div>
          <div>
            <div className="font-semibold text-slate-200">Spec</div>
            <ul className="space-y-1 text-slate-300">
              {specLines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-slate-200">Exports</div>
            <ul className="space-y-0.5 text-slate-300">
              {exportLines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default VacuumContractBadge;
