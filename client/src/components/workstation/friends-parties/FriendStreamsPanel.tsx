import React, { useCallback, useEffect, useState } from "react";
import type { HelixFriendship, HelixSocialPresence } from "@shared/helix-friends-voice-party";
import type { FriendStreamSource, FriendStreamAudience, FriendStreamDestination } from "@shared/helix-friend-stream";
import { friendStreamsApi, type StreamList } from "./FriendStreamsApi";
import { inspectCurrentReasoningBinding } from "@/lib/agent-access/reasoningTaskBinding";
import { useFriendPanelSelection } from "./useFriendPanelSelection";
import { FriendsConnectionRecovery } from "./FriendsConnectionRecovery";
import { nativeStreamSources, streamInstallation, startFriendPublishing, stopFriendPublishing, revokeFriendSource, shareSelectedText, publisherState, subscribePublisher } from "./useFriendStreamPublisher";
export function FriendStreamsPanel({ friends, presence, profileHandle, activeChatId, onInviteToRoom }: {
    friends: HelixFriendship[];
    presence: HelixSocialPresence[];
    profileHandle?: string;
    activeChatId?: string | null;
    onInviteToRoom?: (handle: string) => void;
}) {
    const [data, setData] = useState<StreamList>({ previews: [], subscriptions: [] });
    const [sources, setSources] = useState<FriendStreamSource[]>([]), [source, setSource] = useFriendPanelSelection("source", "");
    const [audience, setAudience] = useFriendPanelSelection("audience", "friends"), [selected, setSelected] = useFriendPanelSelection<string[]>("selected", []), [room, setRoom] = useFriendPanelSelection("room", "");
    const [activity, setActivity] = useState(""), [link, setLink] = useState(""), [sharedText, setSharedText] = useState("");
    const [destination, setDestination] = useFriendPanelSelection<FriendStreamDestination | null>("destination", null), [runId, setRunId] = useFriendPanelSelection("runId", "");
    const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false), [publisher, setPublisher] = useState(publisherState);
    const [connectionRequired, setConnectionRequired] = useState(false);
    const [loadFailure, setLoadFailure] = useState<{ message: string; connectionRequired: boolean } | null>(null);
    const [viewing, setViewing] = useState<string | null>(null);
    useEffect(() => {
        setDestination(current => current?.kind === "codex" && current.conversation_id !== activeChatId ? null : current);
    }, [activeChatId]);
    const describeFailure = (cause: unknown) => ({
        message: cause instanceof Error ? cause.message : "Shared chats are temporarily unavailable. Retry when the service is reachable.",
        connectionRequired: !!cause && typeof cause === "object" && "code" in cause && cause.code === "friends_parties_connection_required",
    });
    const refresh = async () => {
        setData(await friendStreamsApi.list());
        setLoadFailure(null);
    };
    const connected = useCallback(() => {
        void Promise.all([nativeStreamSources(), friendStreamsApi.sources(), friendStreamsApi.list()])
            .then(([native, api, next]) => {
                setSources([...native.sources, ...api.sources]);
                setData(next);
                setLoadFailure(null);
                setError(null);
                setConnectionRequired(false);
            }).catch(cause => setLoadFailure(describeFailure(cause)));
    }, []);
    useEffect(() => {
        let alive = true;
        const load = () => void friendStreamsApi.list().then(result => {
            if (alive) {
                setData(result);
                setLoadFailure(null);
            }
        }).catch(cause => {
            if (alive) {
                const failure = describeFailure(cause);
                setLoadFailure(failure);
                setData(previous => failure.connectionRequired ? { previews: [], subscriptions: [] }
                    : { ...previous, previews: previous.previews.filter(p => Date.parse(p.expires_at) > Date.now()) });
            }
        });
        void Promise.all([nativeStreamSources(), friendStreamsApi.sources()]).then(([native, api]) => {
            if (alive)
                setSources([...native.sources, ...api.sources]);
        }).catch(cause => { if (alive) setLoadFailure(describeFailure(cause)); });
        load();
        const timer = window.setInterval(load, 4000);
        const unsubscribe = subscribePublisher(() => setPublisher(publisherState()));
        return () => { alive = false; window.clearInterval(timer); unsubscribe(); };
    }, []);
    const run = async (action: () => Promise<unknown>) => {
        setBusy(true);
        setError(null);
        setConnectionRequired(false);
        try {
            await action();
            await refresh();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Shared chat request failed.");
            setConnectionRequired(describeFailure(e).connectionRequired);
        }
        finally {
            setBusy(false);
        }
    };
    const chooseCurrent = async () => {
        if (!activeChatId)
            throw new Error("Open the Helix chat you want to receive updates in, then try again.");
        if (!(await nativeStreamSources()).installation)
            throw new Error("Use the installed CasimirBot to select a paired Codex destination.");
        const b = await inspectCurrentReasoningBinding(activeChatId).catch(() => null);
        if (!b || b.status !== "active" || b.helix_conversation_id !== activeChatId)
            throw new Error("Open Agent Access for this Helix chat. If its pairing is still accepted, ask the same Codex chat to recover it through CasimirBot MCP. Review a new pairing only if the old one expired or was revoked, then select the destination again here.");
        setDestination({ kind: "codex", ref: b.reasoning_binding_id, epoch: b.binding_epoch, conversation_id: b.helix_conversation_id });
    };
    const accepted = friends.filter(friend => friend.state === "accepted");
    const selectedSource = sources.find(item => `${item.kind}:${item.ref}` === source);
    const selectedProfiles = accepted.filter(friend => selected.includes(friend.peer.profile_id)).map(friend => friend.peer.profile_id);
    const audienceValue = (): FriendStreamAudience => audience === "room" ? { kind: "room", room_id: room.trim() } : audience === "selected" ? { kind: "selected", profiles: selectedProfiles } : { kind: "friends" };
    const receiveDestination = destination?.kind === "codex" && destination.conversation_id !== activeChatId ? null : destination;
    const publishAudience = publisher.active?.audience;
    const publishAudienceLabel = publishAudience?.kind === "room" ? publishAudience.room_id
        : publishAudience?.kind === "selected" ? accepted
            .filter(friend => publishAudience.profiles.includes(friend.peer.profile_id))
            .map(friend => `@${friend.peer.handle}`).join(", ") || "Selected friends"
        : "All accepted friends";
    const cards = [...accepted.map(friend => ({ peer: friend.peer, isFriend: true })),
        ...data.previews.filter(preview => preview.publisher_id !== data.own_profile_id && !accepted.some(f => f.peer.profile_id === preview.publisher_id))
            .map(preview => ({ peer: { profile_id: preview.publisher_id, display_name: preview.publisher_name ?? "Room participant", handle: "" }, isFriend: false }))];
    return <section aria-label="Shared chat streams" className="my-4 rounded-xl border border-cyan-300/20 bg-slate-900/70 p-4 text-sm">
    <h2 className="font-semibold">Shared chats</h2>
    {profileHandle && <p className="mt-1 text-xs text-slate-300">Signed in as @{profileHandle}</p>}
    <p className="mt-1 text-xs text-slate-400">Share one selected chat. Only its latest update is held temporarily. A recipient can save received updates in their chosen chat. No AI replies start automatically.</p>
    {(error || publisher.failure) && <p role="alert" className="mt-2 text-rose-200">{error ?? publisher.failure}</p>}
    {loadFailure && <p role="alert" className="mt-2 text-rose-200">{loadFailure.message}</p>}
    {(connectionRequired || loadFailure?.connectionRequired) && <FriendsConnectionRecovery onConnected={connected} />}
    {loadFailure && <button disabled={busy} onClick={connected} className="mt-2 text-cyan-200">Retry loading shared chats</button>}
    <div className="mt-3 flex flex-wrap gap-2">
      <select aria-label="Chat to share" value={source} onChange={e => setSource(e.target.value)} className="max-w-xs bg-slate-800 p-2"><option value="">Choose a chat</option>{sources.map(s => <option key={`${s.kind}:${s.ref}`} value={`${s.kind}:${s.ref}`}>{s.kind === "codex" ? "Codex" : "Agent API"} · {s.title}</option>)}</select>
      <input aria-label="Activity description" maxLength={160} value={activity} onChange={e => setActivity(e.target.value)} placeholder="What are you working on?" className="bg-slate-800 p-2"/>
      <select aria-label="Sharing audience" value={audience} onChange={e => setAudience(e.target.value)} className="bg-slate-800 p-2"><option value="friends">All accepted friends</option><option value="selected">Selected friends</option><option value="room">One room</option></select>
      <button disabled={busy || !sources.some(s => `${s.kind}:${s.ref}` === source) || (audience === "room" && !room.trim()) || (audience === "selected" && !selectedProfiles.length)} onClick={() => {
          const selectedSource = sources.find(s => `${s.kind}:${s.ref}` === source);
          if (selectedSource) void run(() => startFriendPublishing(selectedSource, audienceValue(), activity));
      }} className="rounded bg-cyan-500/20 px-3 py-2">{publisher.active ? "Switch shared chat" : "Start sharing"}</button>
      {(publisher.active || publisher.failure) && <button disabled={busy} onClick={() => void run(stopFriendPublishing)}>Stop sharing</button>}
    </div>
    {selectedSource && <div className="mt-2 text-xs text-slate-300">
      <p aria-label="Selected source chat">Selected source: <code className="break-all">{selectedSource.kind === "codex" ? selectedSource.ref.replace(/^codex-thread:/, "codex://threads/") : selectedSource.ref}</code></p>
      {selectedSource.kind === "codex" && <button disabled={busy} className="mt-2 text-cyan-200" onClick={() => void run(async () => {
          try { await revokeFriendSource(selectedSource); }
          finally {
              const [native, api] = await Promise.all([nativeStreamSources(), friendStreamsApi.sources()]);
              const available = [...native.sources, ...api.sources];
              setSources(available);
              if (!available.some(item => `${item.kind}:${item.ref}` === source)) setSource("");
          }
      })}>Revoke selected chat read access</button>}
    </div>}
    {audience === "selected" && <div className="mt-2 flex flex-wrap gap-3">{friends.filter(f => f.state === "accepted").map(f => <label key={f.peer.profile_id}><input type="checkbox" checked={selected.includes(f.peer.profile_id)} onChange={e => setSelected(e.target.checked ? [...selected, f.peer.profile_id] : selected.filter(id => id !== f.peer.profile_id))}/> @{f.peer.handle}</label>)}</div>}
    {audience === "room" && <input aria-label="Stream audience room" value={room} onChange={e => setRoom(e.target.value)} placeholder="Room ID" className="mt-2 bg-slate-800 p-2"/>}
    {publisher.active && <p role="status" className="mt-2 text-cyan-200">Sharing {publisher.active.preview.source.title} · {publishAudienceLabel} · automatic assistant updates</p>}
    {window.casimirDesktop?.codexStreamGrants && <div className="mt-3"><input aria-label="Codex chat link to approve" value={link} onChange={e => setLink(e.target.value)} placeholder="codex://threads/…" className="bg-slate-800 p-2"/><button disabled={busy || !link} className="ml-2" onClick={() => void run(async () => {
                const result = await window.casimirDesktop!.codexStreamGrants!({ operation: "grant", link, title: "Selected Codex chat" }) as {
                    status: string;
                };
                if (result.status !== "ready")
                    throw new Error("The exact chat read grant could not be approved. The experimental reader may be unavailable.");
                const native = await nativeStreamSources();
                const api = await friendStreamsApi.sources();
                setSources([...native.sources, ...api.sources]);
                setLink("");
            })}>Approve exact-chat read</button><p className="mt-1 text-xs text-slate-400">The reader for already-open Codex Desktop chats is experimental.</p></div>}
    {publisher.active && <div className="mt-3"><textarea aria-label="Selected text to share" maxLength={4000} value={sharedText} onChange={e => setSharedText(e.target.value)} placeholder="Optionally share a selected prompt or result explicitly" className="w-full bg-slate-800 p-2"/><button disabled={busy || !sharedText.trim()} onClick={() => void run(async () => { await shareSelectedText(sharedText); setSharedText(""); })}>Share selected text</button></div>}
    <div className="mt-4 rounded border border-white/10 p-3">
      <p>Receive as context in: {receiveDestination ? `${receiveDestination.kind} · ${receiveDestination.kind === "codex" ? receiveDestination.conversation_id : receiveDestination.ref}` : "Choose a destination"}</p>
      <button disabled={busy} onClick={() => void run(chooseCurrent)} className="mt-2 rounded bg-white/10 px-3 py-1">Use current paired Codex chat</button>
      <input aria-label="Agent API receiving run" value={runId} onChange={e => setRunId(e.target.value)} placeholder="Agent API run ID" className="ml-2 bg-slate-800 p-1"/>
      <button disabled={busy || !runId.trim()} className="ml-2" onClick={() => setDestination({ kind: "agent_api", ref: runId.trim() })}>Select API run</button>
      <p className="mt-2 text-xs text-slate-400">Codex waits for exact-task pickup. Agent API updates enter context on the next owner-authorized continuation, or through explicit context import. Following starts no AI replies.</p>
    </div>
    <div className="mt-3 grid gap-3 md:grid-cols-2">{cards.map(friend => {
            const preview = data.previews.find(p => p.publisher_id === friend.peer.profile_id);
            return <article key={friend.peer.profile_id} aria-label={`Status card for ${friend.peer.handle || friend.peer.display_name}`} className="rounded-lg border border-white/10 p-3">
        <p className="font-medium">{friend.peer.display_name}{friend.peer.handle ? ` · @${friend.peer.handle}` : " · Room participant"}</p><p className="text-xs text-slate-400">Status: {friend.isFriend ? presence.find(p => p.profile_id === friend.peer.profile_id)?.state ?? "offline" : "Shared in your room"}</p>
        {preview ? <><p className="mt-2">{preview.activity || preview.source.title}</p><p className="text-xs text-cyan-200">{preview.source.kind} · {preview.source.title}</p>
          <p className="mt-2 whitespace-pre-wrap">{preview.text ? viewing === friend.peer.profile_id ? preview.text : preview.text.slice(0, 240) : "Waiting for a new published update…"}</p>
          <div className="mt-2 flex flex-wrap gap-3"><button onClick={() => setViewing(viewing === friend.peer.profile_id ? null : friend.peer.profile_id)}>View stream</button>
                        {(["once", "follow"] as const).map(mode => <button key={mode} disabled={busy || !receiveDestination || mode === "once" && !preview.text} onClick={() => {
                            if (!receiveDestination) return;
                            void run(async () => {
                                const installation = receiveDestination.kind === "codex"
                                    ? (await nativeStreamSources()).installation
                                    : await streamInstallation();
                                if (!installation) {
                                    setDestination(null);
                                    throw new Error("The desktop connection is unavailable. Reconnect CasimirBot and select the paired chat again.");
                                }
                                if (receiveDestination.kind === "codex") {
                                    const binding = await inspectCurrentReasoningBinding(receiveDestination.conversation_id).catch(() => null);
                                    if (!binding || binding.status !== "active" ||
                                        binding.reasoning_binding_id !== receiveDestination.ref ||
                                        binding.binding_epoch !== receiveDestination.epoch ||
                                        binding.helix_conversation_id !== receiveDestination.conversation_id) {
                                        setDestination(null);
                                        throw new Error("The selected pairing changed or expired. Review this chat in Agent Access, then select its current paired Codex destination.");
                                    }
                                }
                                await friendStreamsApi.follow(preview, receiveDestination, installation, mode);
                            });
                        }}>{mode === "once" ? "Add to my chat" : "Follow in this chat"}</button>)}</div>
        </> : <p className="mt-2 text-slate-400">No chat currently shared with you.</p>}
        {friend.isFriend && onInviteToRoom && <button className="mt-2 text-cyan-200" onClick={() => onInviteToRoom(friend.peer.handle)}>Invite to room</button>}
        {data.subscriptions.filter(s => s.publisher_id === friend.peer.profile_id).map(s => <div key={s.id} className="mt-2 text-xs"><span>{s.mode === "follow" ? "Following" : "One update"} · {s.destination.kind === "codex" ? s.destination.conversation_id : s.destination.ref} · {s.state.replaceAll("_", " ")}</span><button className="ml-3" disabled={busy} onClick={() => void run(() => friendStreamsApi.unfollow(s.id))}>Stop receiving</button></div>)}
      </article>;
        })}</div>
  </section>;
}
