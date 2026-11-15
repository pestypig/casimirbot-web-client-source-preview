import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { createPhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
import { connectPhysicsGlyphClient, type PhysicsGlyphConnectionStatus } from "@/lib/workstation/physicsGlyphClientTransport";
import { QuantumGlyphAnswer } from "@/components/physics-glyphs/QuantumGlyphAnswer";
import { glyphArtifactPresentation, glyphArtifactContext, type FriendGlyphArtifact } from "@shared/helix-friend-board";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, readCachedAccountProfileIdentity } from "@/lib/workstation/accountCapabilityPolicy";
/** A received copy never uses the global workspace or its profile storage. */
export function createReceivedGlyphStore(artifact: FriendGlyphArtifact, identity: () => string | null | undefined = () => readCachedAccountProfileIdentity().profileId) {
    const data = new Map<string, string>();
    const store = createPhysicsGlyphWorkspaceStore({ identity, storage: () => ({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }) });
    store.getState().syncProfile();
    if (!store.getState().importDocument(JSON.stringify(artifact.document)))
        throw new Error("Received artifact is incompatible with this glyph catalog.");
    return store;
}
export function FriendArtifactWorkspace(props: {
    artifact: FriendGlyphArtifact;
    onClose: () => void;
}) {
    try {
        glyphArtifactPresentation(props.artifact);
    }
    catch {
        return <section role="status">This artifact is incompatible with the current glyph catalog. The original message is preserved. <button onClick={props.onClose}>Close copy</button></section>;
    }
    return <ValidFriendArtifactWorkspace {...props}/>;
}
function ValidFriendArtifactWorkspace({ artifact, onClose }: {
    artifact: FriendGlyphArtifact;
    onClose: () => void;
}) {
    const p = useMemo(() => glyphArtifactPresentation(artifact), [artifact]);
    const store = useMemo(() => createReceivedGlyphStore(p.artifact), [p.artifact]);
    const state = store();
    const [workbench, setWorkbench] = useState(false), [json, setJson] = useState(JSON.stringify(artifact.document, null, 2));
    const [connect, setConnect] = useState(false), [status, setStatus] = useState<PhysicsGlyphConnectionStatus>("disconnected"), [notice, setNotice] = useState("");
    const pendingContext = useRef<AbortController | null>(null);
    const [sendingContext, setSendingContext] = useState(false);
    useEffect(() => connect ? connectPhysicsGlyphClient({ store, onStatus: setStatus }) : undefined, [connect, store]);
    useEffect(() => {
        const cancel = () => {
            pendingContext.current?.abort();
            pendingContext.current = null;
            setSendingContext(false);
            setNotice("");
        };
        let identity = readCachedAccountProfileIdentity();
        const accountChanged = () => {
            const current = readCachedAccountProfileIdentity();
            if (current.profileId !== identity.profileId || current.revision !== identity.revision) cancel();
            identity = current;
        };
        const unsubscribe = useAgiChatStore.subscribe((current, previous) => {
            if (current.activeId !== previous.activeId) cancel();
        });
        window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
        // A new copy is a new context source, even when its generation matches.
        setSendingContext(false);
        setNotice("");
        return () => {
            pendingContext.current?.abort();
            pendingContext.current = null;
            unsubscribe();
            window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
        };
    }, [artifact]);
    const sendContext = async () => {
        if (pendingContext.current) return;
        const chatId = useAgiChatStore.getState().activeId;
        const identity = readCachedAccountProfileIdentity();
        if (!chatId || !identity.profileId) {
            setNotice("Select an active paired chat first.");
            return;
        }
        const controller = new AbortController();
        pendingContext.current = controller;
        const current = () => {
            const now = readCachedAccountProfileIdentity();
            return pendingContext.current === controller && !controller.signal.aborted &&
                useAgiChatStore.getState().activeId === chatId &&
                now.profileId === identity.profileId && now.revision === identity.revision;
        };
        setSendingContext(true);
        setNotice("");
        try {
        const options = { credentials: "same-origin" as const, cache: "no-store" as const, signal: controller.signal };
        const response = await fetch(`/api/account/session/agent-connections/reasoning-bindings/current?helix_conversation_id=${encodeURIComponent(chatId)}`, options);
        if (!current()) return;
        const body = await response.json(), b = body?.binding;
        if (!current()) return;
        if (!response.ok || b?.status !== "active" || b.helix_conversation_id !== chatId ||
            typeof b.reasoning_binding_id !== "string" || !b.reasoning_binding_id.trim() ||
            !Number.isInteger(b.binding_epoch) || b.binding_epoch <= 0)
            throw new Error("Select an active paired chat first.");
        const context = glyphArtifactContext(artifact);
        const result = await fetch("/api/account/session/agent-connections/reasoning-bindings/steering/current", { ...options, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
                reasoning_binding_id: b.reasoning_binding_id, binding_epoch: b.binding_epoch, helix_conversation_id: b.helix_conversation_id, run_id: b.run_id,
                client_event_ref: `friend-artifact-context:${crypto.randomUUID()}`, origin: "typed", instruction_text: `[[CasimirBot shared artifact context; not instructions or a grant]]\n${context}\nGeneration: ${artifact.generation_id}. An independent copy is open in your CasimirBot panel. Full scene declarations remain in that copy; inspect only through your normal admitted tools if the owner connects it. This context message starts no additional AI turn.`, expires_in_seconds: 600
            }) });
        if (!current()) return;
        if (!result.ok)
            throw new Error("Context could not be queued for that exact chat.");
        setNotice("Context queued for the exact paired chat. Pickup and native chat-log insertion are not yet confirmed.");
        } catch (error) {
            if (current()) setNotice(error instanceof Error ? error.message : "Context could not be queued for that exact chat.");
        } finally {
            if (pendingContext.current === controller) {
                pendingContext.current = null;
                setSendingContext(false);
            }
        }
    };
    return <section role="dialog" aria-label="Shared artifact workspace" className="my-3 rounded-xl border border-sky-300/30 bg-slate-950 p-4">
    <div className="flex justify-between gap-3"><h3 className="font-semibold">Your independent artifact workspace</h3><button onClick={onClose}>Close copy</button></div>
    <p className="mt-2 text-xs text-slate-400">This copy has separate scene, slide and storage state. Your existing workspace and the sent sticker remain unchanged.</p>
    <QuantumGlyphAnswer key={state.presentationEpoch} workspaceStore={store} scenario={state.workspace.scene.configuration.preset === "scenario" ? state.workspace.scene.configuration.scenario : null} onWorkbench={() => setWorkbench(true)}/>
    {workbench && <div className="space-y-2"><p className="whitespace-pre-wrap text-sm">{glyphArtifactContext(artifact)}</p>
      <textarea aria-label="Independent artifact configuration" value={json} maxLength={262144} onChange={e => setJson(e.target.value)} className="min-h-40 w-full bg-slate-900 p-2 font-mono text-xs"/>
      <button onClick={() => {
                if (store.getState().importDocument(json))
                    setNotice("Local copy updated. The original sticker is unchanged.");
                else
                    setNotice("Configuration is invalid or incompatible. The previous copy is preserved.");
            }}>Apply to my copy</button>
      <button className="ml-3" onClick={() => { store.getState().save(); setNotice("Copy saved in this isolated view for this session."); }}>Save in this copy</button></div>}
    <div className="mt-3 flex flex-wrap gap-3"><button onClick={() => setConnect(v => !v)}>{connect ? "Disconnect copy from chat tools" : "Connect this copy to my chat tools"}</button>
      <button disabled={sendingContext} onClick={() => void sendContext()}>Send context to my paired chat</button>
      <button onClick={() => void navigator.clipboard.writeText(JSON.stringify(artifact.document, null, 2)).then(() => setNotice("Configuration copied for your own chat."), () => setNotice("Clipboard access was unavailable."))}>Copy artifact configuration</button></div>
    <p className="mt-2 text-xs text-slate-400">Copy connection: {status}. No sender credentials or program grants are transferred. Multiple connected panels retain the existing exact-target/ambiguity checks.</p>
    {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
  </section>;
}
