import { useEffect } from "react";
import type { FriendStreamSource, FriendStreamAudience, FriendStreamPreview } from "@shared/helix-friend-stream";
import type { CodexMirrorTurn } from "@shared/helix-codex-conversation-mirror";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, readCachedAccountProfileIdentity } from "@/lib/workstation/accountCapabilityPolicy";
import { friendStreamsApi, streamRequest } from "./FriendStreamsApi";
const changed = "casimir:friend-stream-publisher";
type Active = {
    source: FriendStreamSource;
    profile: string;
    identityRevision: number;
    installation: string;
    preview: FriendStreamPreview;
    audience: FriendStreamAudience;
    last: string | null;
};
let active: Active | null = null;
let browserInstallation: string | null = null;
let failure: string | null = null;
export const publisherState = () => ({ active, failure });
export const subscribePublisher = (notify: () => void) => { window.addEventListener(changed, notify); return () => window.removeEventListener(changed, notify); };
const syncNativeTiming = () => {
    // Older hosts and browsers keep their existing timing. A rejected native
    // request cannot grant publishing or extend the server's finite lease.
    void window.casimirDesktop?.setFriendPublisherActive?.(!!active)?.catch(() => {});
};
const notify = () => { syncNativeTiming(); window.dispatchEvent(new Event(changed)); };
type GrantResult = {
    status: string;
    deviceRef?: string;
    grants?: {
        sourceRef: string;
        title: string;
    }[];
    frame?: {
        turns: CodexMirrorTurn[];
    };
};
export async function nativeStreamSources() {
    const data = await window.casimirDesktop?.codexStreamGrants?.({ operation: "list" }) as GrantResult | undefined;
    return { installation: data?.status === "ready" ? data.deviceRef : null,
        sources: data?.status === "ready" ? (data.grants ?? []).map(g => ({ kind: "codex" as const, ref: g.sourceRef, title: g.title })) : [] };
}
export async function streamInstallation() { return (await nativeStreamSources()).installation ?? (browserInstallation ??= `browser:${crypto.randomUUID()}`); }
export function latestAssistantUpdate(turns: CodexMirrorTurn[]) {
    const turn = turns.at(-1);
    const text = turn?.status === "working" ? turn.updates?.at(-1) ?? turn.assistant : turn?.assistant ?? turn?.updates?.at(-1);
    return text && !text.includes("[[CasimirBot shared context") ? { event_key: `${turn!.id}:${text}`, text: text.slice(0, 4000) } : null;
}
async function readSource(source: FriendStreamSource) {
    if (source.kind === "agent_api")
        return streamRequest<{
            event_key: string;
            text: string | null;
        }>(`/source/${encodeURIComponent(source.ref)}`);
    const data = await window.casimirDesktop?.codexStreamGrants?.({ operation: "read", sourceRef: source.ref }) as GrantResult | undefined;
    if (data?.status !== "ready" || !data.frame)
        throw new Error("Open the selected chat in Codex Desktop, then use Approve exact-chat read in Friends & Voice Parties before restarting the share.");
    return latestAssistantUpdate(data.frame.turns);
}
const eventKey = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, "0")).join("");
export async function startFriendPublishing(source: FriendStreamSource, audience: FriendStreamAudience, activity: string) {
    const identity = readCachedAccountProfileIdentity();
    if (!identity.profileId)
        throw new Error("Sign in before sharing a chat.");
    const installation = await streamInstallation();
    const baseline = await readSource(source);
    const beforeStart = readCachedAccountProfileIdentity();
    if (beforeStart.profileId !== identity.profileId || beforeStart.revision !== identity.revision)
        throw new Error("The signed-in profile changed.");
    const result = await friendStreamsApi.start(source, audience, installation, activity);
    const current = readCachedAccountProfileIdentity();
    if (current.profileId !== identity.profileId || current.revision !== identity.revision)
        throw new Error("The signed-in profile changed.");
    active = { source, profile: identity.profileId, identityRevision: identity.revision, installation, preview: result.preview, audience, last: baseline?.event_key ?? null };
    failure = null;
    notify();
}
const stillSelected = (selection: Active) => {
    const identity = readCachedAccountProfileIdentity();
    return active === selection && identity.profileId === selection.profile && identity.revision === selection.identityRevision;
};
async function retireFailedSelection(selection: Active, error: unknown) {
    if (active !== selection) return;
    active = null;
    failure = error instanceof Error ? error.message : "Sharing stopped.";
    notify();
    try { await friendStreamsApi.retire(selection.preview.revision, selection.installation); }
    catch {
        if (!active) {
            failure += " The service could not confirm removal of the last shared update. Its publishing lease will expire; reconnect and use Stop sharing to confirm removal.";
            notify();
        }
    }
}
export async function stopFriendPublishing() {
    const selection = active;
    active = null; failure = null; notify();
    try {
        if (selection) await friendStreamsApi.retire(selection.preview.revision, selection.installation);
        else await friendStreamsApi.stop();
    } catch (error) {
        if (!active) {
            failure = "Local publishing stopped, but the service could not confirm removal of the last shared update. Reconnect and use Stop sharing again.";
            notify();
        }
        throw error;
    }
}
export async function revokeFriendSource(source: FriendStreamSource) {
    if (source.kind !== "codex") throw new Error("Only a local Codex read grant can be revoked here.");
    const selection = active;
    let retirementError: unknown;
    if (selection?.source.kind === "codex" && selection.source.ref === source.ref) {
        try { await stopFriendPublishing(); } catch (error) { retirementError = error; }
    }
    const result = await window.casimirDesktop?.codexStreamGrants?.({ operation: "revoke", sourceRef: source.ref }) as { status: string; revoked?: boolean } | undefined;
    if (result?.status !== "ready" || !result.revoked) throw new Error("The source read grant could not be revoked. Recheck the desktop connection and try again.");
    if (retirementError) throw new Error("The local read grant was revoked. The service could not confirm removal of its last shared update; reconnect and use Stop sharing to confirm removal.");
}
export async function shareSelectedText(text: string) {
    const selection = active;
    if (!selection)
        throw new Error("Start sharing a chat first.");
    try {
        if (!stillSelected(selection)) throw new Error("The signed-in profile or shared chat changed. Select the source again.");
        await readSource(selection.source);
        if (!stillSelected(selection)) throw new Error("The signed-in profile or shared chat changed. Select the source again.");
    } catch (error) {
        await retireFailedSelection(selection, error);
        throw error;
    }
    await streamRequest("/publish", { revision: selection.preview.revision, installation_id: selection.installation,
        event_key: crypto.randomUUID(), text, content_kind: "explicit_share", imported: false });
}
/** One workstation-owned publisher; panel closure never starts or duplicates it. */
export function useFriendStreamPublisher() {
    useEffect(() => {
        let disposed = false, pending = false;
        const pulse = async () => {
            const selection = active;
            if (!selection || pending || disposed)
                return;
            const current = () => { const identity = readCachedAccountProfileIdentity(); return !disposed && active === selection && identity.profileId === selection.profile && identity.revision === selection.identityRevision; };
            pending = true;
            try {
                if (!current()) {
                    active = null;
                    notify();
                    return;
                }
                const latest = await readSource(selection.source);
                if (!current())
                    return;
                if (latest?.text && latest.event_key !== selection.last) {
                    const hash = await eventKey(latest.event_key);
                    if (!current())
                        return;
                    await streamRequest("/publish", { revision: selection.preview.revision, installation_id: selection.installation,
                        event_key: hash, text: latest.text, content_kind: selection.source.kind === "codex" ? "assistant" : "progress", imported: false });
                    if (current())
                        selection.last = latest.event_key;
                }
                else
                    await streamRequest("/heartbeat", { revision: selection.preview.revision, installation_id: selection.installation });
                if (current()) syncNativeTiming();
            }
            catch (error) {
                await retireFailedSelection(selection, error);
            }
            finally {
                pending = false;
            }
        };
        const invalidate = () => {
            const identity = readCachedAccountProfileIdentity();
            if (active && (identity.profileId !== active.profile || identity.revision !== active.identityRevision)) {
                active = null;
                failure = null;
                notify();
            }
        };
        window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, invalidate);
        const timer = window.setInterval(() => void pulse(), 15000);
        return () => { disposed = true; window.clearInterval(timer); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, invalidate); active = null; notify(); };
    }, []);
}
