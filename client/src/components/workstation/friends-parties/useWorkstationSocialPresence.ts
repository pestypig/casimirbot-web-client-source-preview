import { useEffect } from "react";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  fetchAccountCapabilityPolicy,
  readCachedAccountCapabilityPolicy,
  readCachedAccountProfileIdentity,
} from "@/lib/workstation/accountCapabilityPolicy";
import { friendsPartiesApi } from "./FriendsPartiesApi";

/** Presence belongs to the signed-in workstation, not the Friends panel. */
export function useWorkstationSocialPresence(): void {
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const pulse = async () => {
      if (disposed || pending) return;
      const identity = readCachedAccountProfileIdentity();
      const policy = readCachedAccountCapabilityPolicy();
      if (!identity.profileId || !policy?.feature_flags.includes("friends_parties") ||
          policy.locked_features.includes("friends_parties")) return;
      pending = true;
      try {
        const social = await friendsPartiesApi.list();
        const current = readCachedAccountProfileIdentity();
        if (disposed || identity.profileId !== current.profileId || identity.revision !== current.revision) return;
        if (social.profile) await friendsPartiesApi.heartbeat(social.party ? "in_party" : "online");
      } catch {
        // An unavailable coordinator must let the server's short lease expire.
      } finally {
        pending = false;
      }
    };
    const refresh = () => { void pulse(); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, refresh);
    window.addEventListener("focus", refresh);
    void fetchAccountCapabilityPolicy().then(refresh).catch(() => undefined);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, refresh);
    };
  }, []);
}
