export type ExternalPromptClaimInput = {
  promptId?: string | null;
  createdAt?: number | null;
};

const HELIX_EXTERNAL_PROMPT_CLAIM_TTL_MS = 120_000;
const HELIX_EXTERNAL_PROMPT_CLAIMS_WINDOW_KEY = "__helixAskExternalPromptClaims";

export function resolveExternalPromptClaimId(
  pending: ExternalPromptClaimInput | null | undefined,
  question: string,
): string {
  const promptId = pending?.promptId?.trim();
  if (promptId) return promptId;
  const createdAt = typeof pending?.createdAt === "number" ? pending.createdAt : 0;
  return `${createdAt}:${question.trim().toLowerCase()}`;
}

export function claimExternalPromptSingleFlight(claimId: string): boolean {
  if (typeof window === "undefined") return true;
  const host = window as Window & {
    [HELIX_EXTERNAL_PROMPT_CLAIMS_WINDOW_KEY]?: Map<string, number>;
  };
  const claims = host[HELIX_EXTERNAL_PROMPT_CLAIMS_WINDOW_KEY] ?? new Map<string, number>();
  host[HELIX_EXTERNAL_PROMPT_CLAIMS_WINDOW_KEY] = claims;
  const now = Date.now();
  for (const [key, ts] of claims.entries()) {
    if (now - ts > HELIX_EXTERNAL_PROMPT_CLAIM_TTL_MS) claims.delete(key);
  }
  if (claims.has(claimId)) return false;
  claims.set(claimId, now);
  return true;
}
