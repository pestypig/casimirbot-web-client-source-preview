export { matchesSetupContractPairingIdentity, projectCurrentPairingFacts } from
  "@shared/helix-setup-contract-pairing";

/** Compare opaque task and MCP-client refs without exposing the client ref in owner UI. */
export async function hashSetupContractRef(ref: string): Promise<string | null> {
  if (!ref || !globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(ref));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

