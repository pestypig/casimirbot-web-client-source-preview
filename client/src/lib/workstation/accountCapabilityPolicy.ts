import type { HelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import { HELIX_USER_ACCOUNT_POLICY } from "@shared/helix-account-session";

export const HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT =
  "helix-account-capability-policy-changed";
export const HELIX_ACCOUNT_PROFILE_CHANGE_STORAGE_KEY =
  "casimir.account.profile-change.v1";

const HELIX_ACCOUNT_PROFILE_SESSION_KEY =
  "casimir.account.profile-identity.v1";
const HELIX_ACCOUNT_SIGNED_OUT_PROFILE = "__signed_out__";

let cachedPolicy: HelixAccountCapabilityPolicy | null = null;
let cachedProfileId: string | null | undefined;
let cachedProfileRevision = 0;
let accountPolicyRequest: Promise<HelixAccountCapabilityPolicy> | null = null;
let accountPolicyGeneration = 0;

// Explicit account observations supersede older network reads, including reads
// whose headers arrived before sign-out but whose JSON body completes afterward.
const invalidateAccountPolicyRequest = (): void => {
  accountPolicyGeneration += 1;
  accountPolicyRequest = null;
};

const stringArraysEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const accountPoliciesEqual = (
  left: HelixAccountCapabilityPolicy | null,
  right: HelixAccountCapabilityPolicy | null,
): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.schema === right.schema &&
    left.account_type === right.account_type &&
    left.max_workstation_permission === right.max_workstation_permission &&
    stringArraysEqual(left.allowed_panels, right.allowed_panels) &&
    stringArraysEqual(left.locked_panels, right.locked_panels) &&
    stringArraysEqual(left.locked_features, right.locked_features) &&
    stringArraysEqual(left.allowed_runtime_agents, right.allowed_runtime_agents) &&
    stringArraysEqual(
      left.allowed_workstation_capabilities,
      right.allowed_workstation_capabilities,
    ) &&
    stringArraysEqual(
      left.locked_workstation_capabilities,
      right.locked_workstation_capabilities,
    ) &&
    stringArraysEqual(left.feature_flags, right.feature_flags) &&
    left.quotas.profile_storage_bytes === right.quotas.profile_storage_bytes &&
    left.quotas.model_tokens_per_turn === right.quotas.model_tokens_per_turn &&
    left.quotas.model_tokens_per_day === right.quotas.model_tokens_per_day &&
    left.quotas.runtime_minutes_per_day === right.quotas.runtime_minutes_per_day
  );
};

const readStoredProfileId = (): string | null | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.sessionStorage.getItem(HELIX_ACCOUNT_PROFILE_SESSION_KEY);
    if (stored === null) return undefined;
    return stored === HELIX_ACCOUNT_SIGNED_OUT_PROFILE ? null : stored;
  } catch {
    return undefined;
  }
};

const storeProfileId = (profileId: string | null): void => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      HELIX_ACCOUNT_PROFILE_SESSION_KEY,
      profileId ?? HELIX_ACCOUNT_SIGNED_OUT_PROFILE,
    );
  } catch {
    // Account-boundary propagation remains available in the current tab.
  }
};

const dispatchAccountPolicyEvent = (detail: Record<string, unknown>): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, { detail }));
};

const broadcastAccountProfileChange = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      HELIX_ACCOUNT_PROFILE_CHANGE_STORAGE_KEY,
      `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    );
  } catch {
    // Same-tab account isolation does not depend on cross-tab storage access.
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key !== HELIX_ACCOUNT_PROFILE_CHANGE_STORAGE_KEY) return;
    invalidateAccountPolicyRequest();
    cachedPolicy = null;
    cachedProfileId = undefined;
    cachedProfileRevision += 1;
    dispatchAccountPolicyEvent({
      account_policy: cachedPolicy,
      account_profile_id: null,
      account_profile_identity_known: false,
      account_profile_changed: true,
      account_profile_cross_tab: true,
      account_profile_revision: cachedProfileRevision,
    });
  });
}

export function readCachedAccountCapabilityPolicy(): HelixAccountCapabilityPolicy | null {
  return cachedPolicy;
}

export function readCachedAccountProfileIdentity(): {
  profileId: string | null | undefined;
  revision: number;
} {
  return {
    profileId: cachedProfileId,
    revision: cachedProfileRevision,
  };
}

export function cacheAccountCapabilityPolicy(
  policy: HelixAccountCapabilityPolicy | null,
  profileId?: string | null,
): HelixAccountCapabilityPolicy | null {
  invalidateAccountPolicyRequest();
  const previousPolicy = cachedPolicy;
  const previousProfileId = cachedProfileId === undefined
    ? readStoredProfileId()
    : cachedProfileId;
  const normalizedProfileId = profileId === undefined
    ? previousProfileId
    : typeof profileId === "string" && profileId.trim()
      ? profileId.trim()
      : null;
  const profileChanged =
    profileId !== undefined &&
    previousProfileId !== undefined &&
    normalizedProfileId !== previousProfileId;
  const profileIdentityChanged =
    profileId !== undefined && normalizedProfileId !== previousProfileId;
  const policyChanged = !accountPoliciesEqual(previousPolicy, policy);
  cachedPolicy = policy;
  cachedProfileId = normalizedProfileId;
  if (profileId !== undefined) storeProfileId(normalizedProfileId ?? null);
  if (profileChanged) cachedProfileRevision += 1;
  if (policyChanged || profileIdentityChanged) {
    dispatchAccountPolicyEvent({
      account_policy: policy,
      account_profile_id: normalizedProfileId ?? null,
      account_profile_identity_known: normalizedProfileId !== undefined,
      account_profile_changed: profileChanged,
      account_profile_cross_tab: false,
      account_profile_revision: cachedProfileRevision,
    });
  }
  if (profileChanged) broadcastAccountProfileChange();
  return cachedPolicy;
}

export function clearCachedAccountCapabilityPolicy(): void {
  cacheAccountCapabilityPolicy(null, null);
}

export async function fetchAccountCapabilityPolicy(): Promise<HelixAccountCapabilityPolicy> {
  if (typeof fetch !== "function") return HELIX_USER_ACCOUNT_POLICY;
  if (accountPolicyRequest) return accountPolicyRequest;
  const generation = accountPolicyGeneration;
  const request = (async () => {
    const response = await fetch("/api/account/session", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return cachedPolicy ?? HELIX_USER_ACCOUNT_POLICY;
    const payload = await response.json();
    if (generation !== accountPolicyGeneration) {
      return cachedPolicy ?? HELIX_USER_ACCOUNT_POLICY;
    }
    const policy =
      payload?.account_policy ??
      payload?.session?.account_policy ??
      HELIX_USER_ACCOUNT_POLICY;
    cacheAccountCapabilityPolicy(policy, payload?.session?.profile?.profile_id ?? null);
    return policy;
  })();
  accountPolicyRequest = request;
  try {
    return await request;
  } finally {
    if (accountPolicyRequest === request) accountPolicyRequest = null;
  }
}
