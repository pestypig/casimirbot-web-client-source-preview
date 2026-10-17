const HASH_ALIASES: Record<string, string> = {
  "#vacuum-gap-sweep": "#sweep",
  "#sweeps": "#sweep",
  "#sweep": "#sweep",
  "#parametric": "#sweep",
  "#windows": "#sweep",
  "#phi": "#sweep",
  "#energy": "#energy",
  "#energy-control": "#energy",
  "#pipeline": "#energy",
  "#hover": "#energy",
  "#duty": "#energy",
  "#gamma": "#energy",
  "#why": "#why",
  "#mission-ethos": "#why",
  "#ethos": "#why",
  "#drive-guards": "#ledger",
  "#ledger": "#ledger",
  "#ledger-averaging": "#ledger",
  "#ledger-shift": "#ledger",
  "#ledger-step-b": "#ledger",
  "#warp-ledger": "#ledger",
  "#km-scale-ledger": "#ledger",
  "#halobank": "#halobank",
  "#halo-bank": "#halobank",
};

const REVERSE_ALIAS = new Map<string, Set<string>>();
for (const [raw, canonical] of Object.entries(HASH_ALIASES)) {
  if (!REVERSE_ALIAS.has(canonical)) {
    REVERSE_ALIAS.set(canonical, new Set());
  }
  REVERSE_ALIAS.get(canonical)!.add(raw);
}

/**
 * Normalizes a hash fragment into its canonical form.
 * Ensures the leading '#' is present and applies alias mapping.
 */
export function normalizeHash(hash: string | null | undefined): string {
  if (!hash) return "";
  const trimmed = hash.trim();
  if (!trimmed) return "";
  const withHash = trimmed.startsWith("#") ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
  return HASH_ALIASES[withHash] ?? withHash;
}

/**
 * Returns all known raw hashes that map to a canonical hash.
 * Useful if consumers need to watch for multiple fragments.
 */
export function getHashAliases(canonical: string): string[] {
  const normalized = normalizeHash(canonical);
  const aliases = REVERSE_ALIAS.get(normalized);
  if (!aliases || aliases.size === 0) {
    return normalized ? [normalized] : [];
  }
  return Array.from(aliases.values());
}
