import type {
  EvolutionProofs,
  EvolutionRequest,
  EvolutionTrackResponse,
  HRCategoryLiteral,
} from "@shared/stellar-evolution";

const BASE = "/api/stellar";

export async function fetchEvolutionProofs(
  params: Required<Pick<EvolutionRequest, "T_K" | "nH_cm3">> &
    Partial<Pick<EvolutionRequest, "mass_Msun" | "metallicity_Z" | "Y_He" | "epochMs">>,
): Promise<EvolutionProofs> {
  const url = new URL(`${BASE}/evolution/proofs`, window.location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`evolution/proofs failed (${res.status})`);
  }
  return res.json();
}

export async function fetchEvolutionTrack(
  mass_Msun = 1,
  metallicity_Z = 0.0142,
): Promise<EvolutionTrackResponse> {
  const url = new URL(`${BASE}/evolution/track`, window.location.origin);
  url.searchParams.set("mass_Msun", String(mass_Msun));
  url.searchParams.set("metallicity_Z", String(metallicity_Z));
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`evolution/track failed (${res.status})`);
  }
  return res.json();
}

/** Helper to keep HR colors aligned with existing LSR palette. */
export function colorForHR(
  hr: HRCategoryLiteral,
  palette: Record<HRCategoryLiteral, { color: string }>,
): string {
  return palette[hr]?.color ?? "#cccccc";
}
