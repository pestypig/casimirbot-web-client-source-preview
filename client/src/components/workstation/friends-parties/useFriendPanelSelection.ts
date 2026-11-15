import { useEffect, useState } from "react";
import { readCachedAccountProfileIdentity } from "@/lib/workstation/accountCapabilityPolicy";

// Navigation preferences only. Messages, drafts, credentials and grants are not cached.
// FriendsPartiesPanel remounts its children when the account identity revision changes.
let owner = "";
const selections = new Map<string, unknown>();
const identityKey = () => {
    const identity = readCachedAccountProfileIdentity();
    return identity.profileId ? `${identity.revision}:${identity.profileId}` : "";
};
export function useFriendPanelSelection<T>(key: string, fallback: T) {
    const [identity] = useState(identityKey);
    const [value, setValue] = useState<T>(() => {
        if (owner !== identity) {
            selections.clear();
            owner = identity;
        }
        return identity && selections.has(key) ? selections.get(key) as T : fallback;
    });
    useEffect(() => {
        if (identity && identityKey() === identity && owner === identity)
            selections.set(key, value);
    }, [identity, key, value]);
    return [value, setValue] as const;
}
