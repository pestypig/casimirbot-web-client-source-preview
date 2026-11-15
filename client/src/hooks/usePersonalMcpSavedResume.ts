import { useEffect } from "react";
import type { HelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  fetchAccountCapabilityPolicy,
  readCachedAccountProfileIdentity,
} from "@/lib/workstation/accountCapabilityPolicy";

export function usePersonalMcpSavedResume(): void {
  useEffect(() => {
    const nativeConnect = window.casimirDesktop?.personalMcpP1Connection;
    if (!nativeConnect) return;
    const connect = nativeConnect;

    let disposed = false;
    let activeProfileId: string | null = null;
    let epoch = 0;
    let checkingProfileId: string | null = null;
    let checkingEpoch = 0;
    let attemptedProfileId: string | null = null;
    let attemptCount = 0;
    let retryTimer: number | null = null;
    let queued: { policy: HelixAccountCapabilityPolicy; profileId: string } | null = null;
    const clearRetry = () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = null;
    };
    function maybeResume(policy: HelixAccountCapabilityPolicy | null | undefined,
      profileId: string | null | undefined): void {
      if (disposed || policy?.account_type !== "user" || !profileId) {
        activeProfileId = null;
        attemptedProfileId = null;
        attemptCount = 0;
        epoch += 1;
        clearRetry();
        queued = null;
        return;
      }
      if (activeProfileId !== profileId) {
        activeProfileId = profileId;
        attemptedProfileId = null;
        attemptCount = 0;
        epoch += 1;
        clearRetry();
      }
      if (checkingProfileId) {
        if (checkingProfileId !== profileId || checkingEpoch !== epoch)
          queued = { policy, profileId };
        return;
      }
      if (attemptedProfileId === profileId) return;
      clearRetry();
      checkingProfileId = profileId;
      checkingEpoch = epoch;
      attemptCount += 1;
      const currentEpoch = epoch;
      const isCurrent = () => !disposed && epoch === currentEpoch &&
        activeProfileId === profileId &&
        readCachedAccountProfileIdentity().profileId === profileId;
      const retryTransient = () => {
        if (!isCurrent()) return;
        if (attemptCount >= 3) {
          attemptedProfileId = profileId;
          return;
        }
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          if (isCurrent()) maybeResume(policy, profileId);
        }, 1_500);
      };
      let resumeStarted = false;
      void connect("inspect").then(async result => {
        if (!isCurrent()) return;
        const inspected = result as { available?: boolean; phase?: string };
        if (inspected?.available !== true) {
          if (inspected?.phase === "website_unavailable") retryTransient();
          else attemptedProfileId = profileId;
          return;
        }
        resumeStarted = true;
        const resumed = await connect("resume") as { phase?: string };
        if (!isCurrent()) return;
        if (resumed?.phase === "busy") retryTransient();
        else attemptedProfileId = profileId;
      }).catch(() => {
        if (!isCurrent()) return;
        if (resumeStarted) attemptedProfileId = profileId;
        else retryTransient();
      }).finally(() => {
        checkingProfileId = null;
        const next = queued;
        queued = null;
        if (next) maybeResume(next.policy, next.profileId);
      });
    }
    const onPolicyChange = (event: Event) => {
      const detail = (event as CustomEvent<{
        account_policy?: HelixAccountCapabilityPolicy | null;
        account_profile_id?: string | null;
      }>).detail;
      maybeResume(detail?.account_policy, detail?.account_profile_id);
    };

    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onPolicyChange);
    void fetchAccountCapabilityPolicy().then(policy => maybeResume(policy,
      readCachedAccountProfileIdentity().profileId)).catch(() => undefined);
    return () => {
      disposed = true;
      clearRetry();
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onPolicyChange);
    };
  }, []);
}
