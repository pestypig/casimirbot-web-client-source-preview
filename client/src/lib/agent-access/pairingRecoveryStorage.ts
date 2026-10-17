import { useEffect, useRef } from "react";
import { z } from "zod";
import { pairingInvitationRequestSchema, pairingStatusSchema } from "./durablePairing";
import { useWorkspaceMemoryRegistryStore } from "../../store/useWorkspaceMemoryRegistryStore";

const prefix = "helix.pairing.review.v1:";
const suffixes = ["", ":draft", ":destination", ":pairing", ":previous"] as const;
const previousSchema = z.object({ review: pairingInvitationRequestSchema, pairing: pairingStatusSchema }).strict();
export const pairingReviewStorageKey = (profileId: string, chatId: string) =>
  `${prefix}${JSON.stringify([profileId, chatId])}`;

// These values are recovery hints only. Neither a cached status nor a submitted
// request is current consent: the UI rechecks the authenticated pairing routes.
// Unknown fields fail closed, especially invitation secrets and checked consent.
export function pairingRecoveryValueAllowed(profileId: string, key: string, value: string): boolean {
  if (!key.startsWith(prefix)) return true;
  if (value.length > 12_000) return false;
  try {
    const suffix = suffixes.find(candidate => {
      const raw = key.slice(prefix.length, candidate ? -candidate.length : undefined);
      if (candidate && !key.endsWith(candidate)) return false;
      try {
        const owner = JSON.parse(raw);
        return Array.isArray(owner) && owner.length === 2 && owner[0] === profileId &&
          typeof owner[1] === "string" && owner[1].length >= 3 && owner[1].length <= 320 &&
          key === pairingReviewStorageKey(profileId, owner[1]) + candidate;
      } catch { return false; }
    });
    if (suffix === undefined) return false;
    const [, chatId] = JSON.parse(key.slice(prefix.length, suffix ? -suffix.length : undefined));
    if (suffix === ":destination") return /^[a-f0-9]{64}$/u.test(value);
    if (suffix === ":pairing") return /^pairing:[A-Za-z0-9_-]{1,312}$/u.test(value);
    const raw = JSON.parse(value);
    if (suffix === ":previous") {
      const parsed = previousSchema.safeParse(raw);
      return parsed.success && parsed.data.review.chatId === chatId && parsed.data.pairing.chatId === chatId;
    }
    const parsed = pairingInvitationRequestSchema.safeParse(raw);
    return parsed.success && parsed.data.chatId === chatId;
  } catch { return false; }
}

export function usePairingRecoveryStorage(profileId: string, chatId: string): void {
  const last = useRef<string | null>(null);
  // The component writes metadata during explicit operations and draft changes.
  // Observe after each render, but publish only changed bytes to avoid turning
  // the five-second status poll into repeated profile writes.
  useEffect(() => {
    const key = pairingReviewStorageKey(profileId, chatId);
    try {
      const values = suffixes.map(suffix => {
        const storageKey = key + suffix;
        const value = localStorage.getItem(storageKey);
        return { storageKey, value: value !== null && pairingRecoveryValueAllowed(profileId, storageKey, value) ? value : null };
      });
      const signature = JSON.stringify(values);
      if (signature === last.current) return;
      last.current = signature;
      const registry = useWorkspaceMemoryRegistryStore.getState();
      for (const { storageKey, value } of values) {
        const artifactId = `pairing-review:${storageKey}`;
        if (value === null) { registry.removeArtifact(artifactId); continue; }
        registry.upsertArtifact({ artifact_id: artifactId, artifact_type: "workstation_session_draft",
          storage_key: storageKey, storage_backend: "localStorage", owner_scope: "profile",
          profile_id: profileId, chat_session_id: chatId, sync_status: "profile_candidate",
          title: "Exact task pairing recovery", size_bytes: new TextEncoder().encode(value).byteLength });
      }
    } catch { /* The existing UI reports local storage failure; backup is optional. */ }
  });
}
