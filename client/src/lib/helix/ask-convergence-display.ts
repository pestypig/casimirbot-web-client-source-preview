import type {
  ContextCapsuleMaturityState,
  ContextCapsuleProofState,
  ContextCapsuleSourceState,
} from "@shared/helix-context-capsule";
import type {
  ConvergenceDebug,
  ConvergenceStripState,
} from "@/lib/helix/reasoning-theater-convergence";

export const CONVERGENCE_SOURCE_LABEL: Record<ContextCapsuleSourceState, string> = {
  atlas_exact: "atlas exact",
  repo_exact: "repo exact",
  open_world: "open-world",
  unknown: "unknown",
};

export const CONVERGENCE_PROOF_LABEL: Record<ContextCapsuleProofState, string> = {
  confirmed: "confirmed",
  reasoned: "reasoned",
  hypothesis: "hypothesis",
  unknown: "unknown",
  fail_closed: "fail-closed",
};

export const CONVERGENCE_MATURITY_LABEL: Record<ContextCapsuleMaturityState, string> = {
  exploratory: "exploratory",
  reduced_order: "reduced-order",
  diagnostic: "diagnostic",
  certified: "certified",
};

function readConvergenceDebugRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function buildConvergenceDebugSnapshot(debug: unknown): ConvergenceDebug | undefined {
  const record = readConvergenceDebugRecord(debug);
  if (!record) return undefined;
  return {
    intent_domain: typeof record.intent_domain === "string" ? record.intent_domain : undefined,
    intent_id: typeof record.intent_id === "string" ? record.intent_id : undefined,
    arbiter_mode: typeof record.arbiter_mode === "string" ? record.arbiter_mode : undefined,
    claim_tier: typeof record.claim_tier === "string" ? record.claim_tier : undefined,
    math_solver_maturity:
      typeof record.math_solver_maturity === "string" ? record.math_solver_maturity : undefined,
    helix_ask_fail_reason:
      typeof record.helix_ask_fail_reason === "string" ? record.helix_ask_fail_reason : undefined,
  };
}

export function hasConvergenceStateChanged(
  previous: ConvergenceStripState | null,
  next: ConvergenceStripState,
): boolean {
  if (!previous) return true;
  return (
    previous.source !== next.source ||
    previous.proof !== next.proof ||
    previous.maturity !== next.maturity ||
    previous.phase !== next.phase ||
    previous.openWorldActive !== next.openWorldActive ||
    previous.caption !== next.caption ||
    previous.deltaPct !== next.deltaPct
  );
}
