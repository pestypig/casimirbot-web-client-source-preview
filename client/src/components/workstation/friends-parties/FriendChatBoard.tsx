import React, { useEffect, useRef, useState } from "react";
import type { HelixFriendship } from "@shared/helix-friends-voice-party";
import { glyphArtifactContext, type FriendBoardMessage, type FriendBoardPage, type FriendGlyphArtifact } from "@shared/helix-friend-board";
import { boardRequest, boardPeerPath, type BoardMessages, type BoardState, type LatestGlyph, type LocalGlyphCandidate } from "./FriendBoardApi";
import { FriendGlyphSticker } from "./FriendGlyphSticker";
import { FriendArtifactWorkspace } from "./FriendArtifactWorkspace";
import { FriendHostedRoomMission } from "./FriendHostedRoomMission";
import { useFriendPanelSelection } from "./useFriendPanelSelection";
export function FriendChatBoard({ friends, onOpenHostedRoom }: {
    friends: HelixFriendship[];
    onOpenHostedRoom?: (handle: string) => void;
}) {
    const [peer, setPeer] = useFriendPanelSelection("peer", ""), [messages, setMessages] = useState<FriendBoardMessage[]>([]), [own, setOwn] = useState("");
    const [text, setText] = useState(""), [requestId, setRequestId] = useState(() => crypto.randomUUID()), [busy, setBusy] = useState(false);
    const [canSend, setCanSend] = useState(false), [error, setError] = useState<string | null>(null), [picker, setPicker] = useState(false);
    const [missionPeer, setMissionPeer] = useState<string | null>(null);
    const [latest, setLatest] = useState<LatestGlyph | null>(null), [candidate, setCandidate] = useState<LocalGlyphCandidate | null>(null), [selected, setSelected] = useState<LatestGlyph | null>(null);
    const [copy, setCopy] = useState<FriendGlyphArtifact | null>(null), [older, setOlder] = useState(false), [hasNew, setHasNew] = useState(false);
    const [threads, setThreads] = useState<{
        peer_id: string;
        display_name: string;
    }[]>([]);
    const epoch = useRef(0), seen = useRef(0), rows = useRef(messages);
    rows.current = messages;
    const olderRef = useRef(older);
    olderRef.current = older;
    const roomFriend = friends.find(friend => friend.state === "accepted" && friend.peer.profile_id === peer);
    const contacts = [...friends.filter(f => f.state === "accepted").map(f => ({ id: f.peer.profile_id, label: `@${f.peer.handle}` })),
        ...threads.filter(t => !friends.some(f => f.state === "accepted" && f.peer.profile_id === t.peer_id)).map(t => ({ id: t.peer_id, label: `${t.display_name} · past chat` }))];
    useEffect(() => {
        let alive = true;
        void boardRequest<{
            threads: typeof threads;
        }>("/threads").then(r => {
            if (alive)
                setThreads(r.threads);
        }).catch(() => { });
        return () => { alive = false; };
    }, []);
    const applyPages = (pages: FriendBoardPage[]) => setMessages(old => old.map(message => {
        const page = pages.find(p => p.id === message.id);
        return page && page.page_version > message.page_version ? { ...message, ...page } : message;
    }));
    useEffect(() => {
        const current = ++epoch.current;
        setMessages([]);
        setOwn("");
        setCanSend(false);
        setError(null);
        setSelected(null);
        setCopy(null);
        setOlder(false);
        setHasNew(false);
        setText("");
        setRequestId(crypto.randomUUID());
        if (!peer)
            return;
        let pending = false;
        const load = async () => {
            const r = await boardRequest<BoardMessages>(`${boardPeerPath(peer)}/messages`);
            if (epoch.current !== current)
                return;
            setMessages(r.messages);
            setOwn(r.own_profile_id);
            setCanSend(r.can_send);
            seen.current = r.last_sequence;
        };
        void load().catch(e => {
            if (epoch.current === current)
                setError(e.message);
        });
        const pulse = async () => {
            if (pending)
                return;
            pending = true;
            try {
                const r = await boardRequest<BoardState>(`${boardPeerPath(peer)}/state`, { ids: rows.current.map(m => m.id).slice(-20) });
                if (epoch.current !== current)
                    return;
                setCanSend(r.can_send);
                applyPages(r.pages);
                if (r.last_sequence > seen.current) {
                    if (olderRef.current)
                        setHasNew(true);
                    else
                        await load();
                }
            }
            catch (e) {
                if (epoch.current === current) {
                    setCanSend(false);
                    setError(e instanceof Error ? e.message : "The board is unavailable.");
                }
            }
            finally {
                pending = false;
            }
        };
        const timer = window.setInterval(() => void pulse(), 1000);
        return () => { epoch.current++; window.clearInterval(timer); };
    }, [peer]);
    useEffect(() => {
        if (!picker)
            return;
        let alive = true, pending = false;
        const refresh = async () => {
            if (pending)
                return;
            pending = true;
            try {
                const [latestReply, local] = await Promise.all([boardRequest<{
                        latest: LatestGlyph | null;
                    }>("/latest"), boardRequest<{
                        candidate: LocalGlyphCandidate | null;
                    }>("/local-candidate")]);
                if (alive) {
                    setLatest(latestReply.latest);
                    setCandidate(local.candidate);
                }
            }
            catch (e) {
                if (alive)
                    setError(e instanceof Error ? e.message : "The sticker picker is unavailable.");
            }
            finally {
                pending = false;
            }
        };
        void refresh();
        const timer = window.setInterval(() => void refresh(), 1000);
        return () => { alive = false; window.clearInterval(timer); };
    }, [picker]);
    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await action();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "The board request failed.");
        }
        finally {
            setBusy(false);
        }
    };
    const chooseCandidate = () => run(async () => {
        const token = epoch.current;
        if (!candidate?.request_id)
            throw new Error("Wait for a verified completed composition.");
        const reply = await boardRequest<{
            latest: LatestGlyph;
        }>("/finalize-local", { generation_id: candidate.generation_id, request_id: candidate.request_id });
        if (epoch.current !== token)
            return;
        setSelected(reply.latest);
        setLatest(reply.latest);
        setPicker(false);
        setRequestId(crypto.randomUUID());
    });
    const send = () => run(async () => {
        const current = epoch.current;
        await boardRequest(`${boardPeerPath(peer)}/send`, { request_id: requestId, text, ...(selected ? { generation_id: selected.artifact.generation_id, artifact_digest: selected.digest } : {}) });
        if (epoch.current !== current)
            return;
        setText("");
        setSelected(null);
        setRequestId(crypto.randomUUID());
        const r = await boardRequest<BoardMessages>(`${boardPeerPath(peer)}/messages`);
        if (epoch.current !== current)
            return;
        setMessages(r.messages);
        seen.current = r.last_sequence;
    });
    const page = (message: FriendBoardMessage, depth: number) => void run(async () => {
        const current = epoch.current;
        const r = await boardRequest<{
            page: FriendBoardPage;
        }>(`${boardPeerPath(peer)}/page`, { id: message.id, depth, request_id: crypto.randomUUID() });
        if (epoch.current === current)
            applyPages([r.page]);
    });
    const pendingGeneration = candidate && candidate.phase !== "finalized";
    const pickerArtifact = pendingGeneration ? candidate?.phase === "verified" ? candidate.artifact : null : latest?.artifact;
    return <section aria-label="Friends chat board" className="my-4 rounded-xl border border-violet-300/25 bg-slate-950/60 p-4 text-sm text-slate-100">
    <h2 className="font-semibold">Friends chat board</h2><p className="mt-1 text-xs text-slate-400">Messages and sent artifact copies stay in this conversation. Each sticker has one shared slide position; either participant can flip it.</p>
    <select aria-label="Friend chat recipient" value={peer} onChange={e => {
        setPeer(e.target.value);
        setMissionPeer(null);
    }} className="mt-3 max-w-full bg-slate-800 p-2"><option value="">Choose a friend or past chat</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
    {roomFriend && onOpenHostedRoom && <button type="button" className="ml-3 text-cyan-200"
        onClick={() => onOpenHostedRoom(roomFriend.peer.handle)}>Open hosted room controls</button>}
    {roomFriend && <button type="button" className="ml-3 text-cyan-200"
        onClick={() => setMissionPeer(missionPeer === peer ? null : peer)} aria-expanded={missionPeer === peer}>Review hosted room mission</button>}
    {roomFriend && missionPeer === peer && <FriendHostedRoomMission key={peer} />}
    {error && <p role="alert" className="mt-2 text-rose-200">{error}</p>}
    {peer && <><div className="mt-3 flex gap-3"><button disabled={busy || messages.length === 0} onClick={() => void run(async () => {
                const current = epoch.current;
                const r = await boardRequest<BoardMessages>(`${boardPeerPath(peer)}/messages?before=${messages[0].sequence}`);
                if (epoch.current !== current || !r.messages.length)
                    return;
                setMessages(r.messages);
                setOlder(true);
            })}>Older messages</button>{(older || hasNew) && <button onClick={() => void run(async () => {
                    const current = epoch.current;
                    const r = await boardRequest<BoardMessages>(`${boardPeerPath(peer)}/messages`);
                    if (epoch.current !== current)
                        return;
                    setMessages(r.messages);
                    seen.current = r.last_sequence;
                    setOlder(false);
                    setHasNew(false);
                })}>Latest messages{hasNew ? " · new" : ""}</button>}</div>
      <div className="my-3 space-y-3" aria-label="Friend messages">{messages.map(message => <article key={message.id} className={`max-w-xl rounded-xl border p-3 ${message.author_id === own ? "ml-auto border-sky-300/20 bg-sky-950/30" : "border-violet-300/20 bg-violet-950/20"}`}>
        <p className="text-xs text-slate-400">{message.author_id === own ? "You" : contacts.find(c => c.id === peer)?.label ?? "Friend"} · {new Date(message.created_at).toLocaleString()}</p>
        {message.text && <p className="mt-2 whitespace-pre-wrap break-words">{message.text}</p>}
        {message.incompatible_artifact && <div className="mt-2"><p role="status">This artifact is incompatible with the current glyph catalog. Its original configuration remains available.</p>
          <details><summary>Original artifact configuration</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">{message.incompatible_artifact.document_json}</pre></details></div>}
        {message.artifact && <div className="mt-2"><FriendGlyphSticker artifact={message.artifact} depth={message.depth} onPage={d => page(message, d)} disabled={busy || !canSend}/>
          {message.page_actor && <p className="mt-1 text-xs text-slate-500">Last flipped by {message.page_actor === own ? "you" : "your friend"}</p>}
          <details className="mt-2"><summary>Artifact context</summary><p className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{glyphArtifactContext(message.artifact)}</p><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(message.artifact.document, null, 2)}</pre></details>
          <button className="mt-2 rounded bg-violet-400/15 px-3 py-1" onClick={() => setCopy(message.artifact)}>Open independent workspace copy</button>
        </div>}
      </article>)}</div>
      {copy && <FriendArtifactWorkspace key={copy.generation_id} artifact={copy} onClose={() => setCopy(null)}/>}
      {!canSend && <p className="text-xs text-slate-400">History is retained. New messages and shared page changes require a current accepted friendship and connection.</p>}
      <textarea aria-label="Friend message" value={text} maxLength={4000} disabled={busy || !canSend} onChange={e => { setText(e.target.value); setRequestId(crypto.randomUUID()); }} className="mt-3 min-h-16 w-full rounded bg-slate-800 p-2" placeholder="Message your friend…"/>
      {selected && <div className="mt-2 flex items-center gap-3"><FriendGlyphSticker artifact={selected.artifact} compact/><button onClick={() => { setSelected(null); setRequestId(crypto.randomUUID()); }}>Remove sticker</button></div>}
      <div className="mt-2 flex gap-3"><button disabled={busy || !canSend} onClick={() => setPicker(v => !v)}>Emoji & artifacts</button><button disabled={busy || !canSend || (!text.trim() && !selected)} onClick={() => void send()} className="rounded bg-sky-500/20 px-4 py-2">Send message</button></div>
      {picker && <div aria-label="Artifact emoji picker" className="mt-3 rounded-lg border border-violet-300/20 p-3">
        <p className="mb-2 text-xs text-slate-400">Only the latest completed Physics Glyph generation is offered. Use Prepare Friends sticker in the connected glyph workspace before opening this panel. Sending pins a separate copy.</p>
        {pickerArtifact ? <button disabled={busy} aria-label="Select latest Physics Glyph sticker" onClick={() => {
                        if (candidate?.phase === "verified")
                            void chooseCandidate();
                        else if (latest) {
                            setSelected(latest);
                            setPicker(false);
                            setRequestId(crypto.randomUUID());
                        }
                    }}><FriendGlyphSticker artifact={pickerArtifact} compact/></button> : <p>{candidate?.phase === "pending" ? "A new composition is still running. Wait for completion." : "Create and complete a Physics Glyph scenario through your connected chat first."}</p>}
      </div>}
    </>}
  </section>;
}
