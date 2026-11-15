import { readCachedAccountProfileIdentity } from "./accountCapabilityPolicy";

// A policy can be identical for two profiles. Keep async UI work bound to the
// observed identity and revision, including an A -> B -> A account round trip.
// This is a client attribution guard, not a server authorization grant.
export function captureAccountOperationScope(): () => boolean {
  const started = readCachedAccountProfileIdentity();
  return () => {
    const current = readCachedAccountProfileIdentity();
    return current.profileId === started.profileId && current.revision === started.revision;
  };
}
