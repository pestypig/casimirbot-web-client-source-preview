import type { SweepPoint, VacuumGapSweepRow } from "@shared/schema";

export const RHO_COS_GUARD_LIMIT = 0.95;

type SweepGuardLike =
  | Partial<SweepPoint>
  | Partial<VacuumGapSweepRow>
  | {
      pumpRatio?: number | null;
      phi_deg?: number | null;
      kappaEff_MHz?: number | null;
      abortReason?: string | null;
    }
  | null
  | undefined;

const toFinite = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export function getSweepGuardReasons(point: SweepGuardLike): string[] {
  if (!point) return [];

  const reasons: string[] = [];
  const kappaEff = toFinite((point as any)?.kappaEff_MHz);
  if (kappaEff != null && kappaEff <= 0) {
    reasons.push(`kappa_eff collapsed (${kappaEff.toFixed(2)} MHz)`);
  }

  const rho = toFinite((point as any)?.pumpRatio);
  const phiDeg = toFinite((point as any)?.phi_deg);
  if (rho != null) {
    if (rho >= 1) {
      reasons.push(`pump ratio rho=${rho.toFixed(2)} >= 1`);
    } else if (phiDeg != null) {
      const rhoCos = Math.abs(rho * Math.cos((phiDeg * Math.PI) / 180));
      if (rhoCos >= RHO_COS_GUARD_LIMIT) {
        reasons.push(`|rho*cos(phi)|=${rhoCos.toFixed(2)} >= ${RHO_COS_GUARD_LIMIT.toFixed(2)} guard`);
      }
    }
  }

  const abortReason = (point as any)?.abortReason;
  if (abortReason === "rho_cos_guard" && !reasons.some((msg) => msg.includes("rho*cos"))) {
    reasons.push("Runaway guard tripped (rho*cos guard limit)");
  }

  return reasons;
}

export function summarizeSweepGuard(point: SweepGuardLike): string | null {
  const reasons = getSweepGuardReasons(point);
  return reasons.length ? reasons.join("; ") : null;
}
