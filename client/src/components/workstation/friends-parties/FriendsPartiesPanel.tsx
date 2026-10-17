import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  HelixFriendsPartiesResponse,
  HelixFriendship,
  HelixVoiceParty,
} from "@shared/helix-friends-voice-party";
import { friendsPartiesApi } from "./FriendsPartiesApi";
import { useVoicePartyMediaBridge } from "./useVoicePartyMediaBridge";

const badgeTone = (state: string): string => {
  if (["active", "accepted", "online", "direct", "relayed", "connected"].includes(state)) {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  }
  if (["degraded", "reconnecting", "away", "incoming"].includes(state)) {
    return "border-amber-400/40 bg-amber-400/10 text-amber-200";
  }
  return "border-white/15 bg-white/5 text-slate-300";
};

const StatusBadge = ({ state }: { state: string }) => (
  <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${badgeTone(state)}`}>
    {state.replaceAll("_", " ")}
  </span>
);

export function FriendsPartiesPanel() {
  const [snapshot, setSnapshot] = useState<HelixFriendsPartiesResponse | null>(null);
  const [party, setParty] = useState<HelixVoiceParty | null>(null);
  const [handle, setHandle] = useState("");
  const [friendHandle, setFriendHandle] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomId, setRoomId] = useState("");
  const [shownInvite, setShownInvite] = useState<{ code: string; expiresAt: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await friendsPartiesApi.list();
    setSnapshot(next);
    setParty(next.party ?? null);
    if (next.profile) setHandle(next.profile.handle);
  }, []);

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load friends."));
    const poll = window.setInterval(() => void load().catch(() => undefined), 4_000);
    const heartbeat = window.setInterval(
      () => void friendsPartiesApi.heartbeat(party ? "in_party" : "online").catch(() => undefined),
      30_000,
    );
    const partyHeartbeat = window.setInterval(
      () => {
        if (party) void friendsPartiesApi.heartbeatParty(party.party_id)
          .then(setParty)
          .catch(() => undefined);
      },
      15_000,
    );
    return () => {
      window.clearInterval(poll);
      window.clearInterval(heartbeat);
      window.clearInterval(partyHeartbeat);
    };
  }, [load, party?.party_id]);

  const self = useMemo(() => party?.members.find(
    (member) => member.profile.profile_id === snapshot?.profile?.profile_id,
  ) ?? null, [party, snapshot?.profile?.profile_id]);
  const media = useVoicePartyMediaBridge({ party, self, api: friendsPartiesApi });
  const presence = useMemo(() => new Map(
    (snapshot?.presence ?? []).map((entry) => [entry.profile_id, entry.state]),
  ), [snapshot?.presence]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Friends & Parties action failed.");
    } finally {
      setBusy(null);
    }
  };

  const friendshipAction = (friendship: HelixFriendship, decision: "accept" | "remove") =>
    run(`friendship:${friendship.friendship_id}`, () =>
      friendsPartiesApi.decideFriendship(friendship.friendship_id, decision));

  if (!snapshot) {
    return <div className="flex h-full items-center justify-center bg-slate-950 text-sm text-slate-300">Loading Friends &amp; Parties…</div>;
  }

  return (
    <main className="h-full overflow-auto bg-[radial-gradient(circle_at_top,#162337,#070b13_58%)] p-5 text-slate-100">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Casimir social</p>
          <h1 className="text-2xl font-semibold">Friends &amp; Voice Parties</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Human voice works independently of GPT Live. Model attachment and microphone-to-model consent remain separate.
          </p>
        </div>
        <div className="flex gap-2">
          <StatusBadge state={party?.state ?? "no party"} />
          <StatusBadge state={media.projection.transport} />
        </div>
      </header>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {!snapshot.profile ? (
        <section className="mx-auto max-w-xl rounded-xl border border-cyan-300/20 bg-slate-900/80 p-5">
          <h2 className="text-lg font-medium">Choose your friend handle</h2>
          <p className="mt-1 text-sm text-slate-400">Use 3–32 letters, numbers, dots, underscores, or hyphens. Your email is never shown.</p>
          <form className="mt-4 flex gap-2" onSubmit={(event) => {
            event.preventDefault();
            void run("profile", () => friendsPartiesApi.updateProfile({ handle }));
          }}>
            <input aria-label="Friend handle" value={handle} onChange={(event) => setHandle(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/30 px-3 py-2" />
            <button disabled={busy !== null} className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950">Save</button>
          </form>
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.9fr)_minmax(420px,1.25fr)]">
          <section className="rounded-xl border border-white/10 bg-slate-900/75 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Friends</h2>
                <p className="text-xs text-slate-400">Signed in as @{snapshot.profile.handle}</p>
              </div>
              <span className="text-xs text-slate-400">{snapshot.friendships.filter((item) => item.state === "accepted").length} accepted</span>
            </div>
            <form className="mt-3 flex gap-2" onSubmit={(event) => {
              event.preventDefault();
              void run("friend-request", async () => {
                await friendsPartiesApi.requestFriend(friendHandle);
                setFriendHandle("");
              });
            }}>
              <input aria-label="Exact friend handle" placeholder="Exact handle" value={friendHandle}
                onChange={(event) => setFriendHandle(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm" />
              <button disabled={!friendHandle.trim() || busy !== null}
                className="rounded-md border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100">Add</button>
            </form>
            <div className="mt-4 space-y-2">
              {snapshot.friendships.length === 0 && <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-500">No friend connections yet.</p>}
              {snapshot.friendships.map((friendship) => (
                <article key={friendship.friendship_id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{friendship.peer.display_name}</p>
                      <p className="text-xs text-slate-400">@{friendship.peer.handle}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      <StatusBadge state={friendship.state} />
                      {friendship.state === "accepted" && <StatusBadge state={presence.get(friendship.peer.profile_id) ?? "offline"} />}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {friendship.state === "incoming" && <button onClick={() => void friendshipAction(friendship, "accept")}
                      className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-100">Accept</button>}
                    {friendship.state === "accepted" && !party && <button onClick={() => void run("create-party", async () => {
                      const created = await friendsPartiesApi.createParty();
                      const invitation = await friendsPartiesApi.createPartyInvite(created.party_id, friendship.peer.profile_id);
                      setParty(invitation.party);
                      setShownInvite({ code: invitation.inviteCode, expiresAt: invitation.expiresAt });
                    })} className="rounded bg-fuchsia-500/20 px-2 py-1 text-fuchsia-100">Invite to party</button>}
                    {(friendship.state === "accepted" || friendship.state === "incoming" || friendship.state === "outgoing") &&
                      <button onClick={() => void friendshipAction(friendship, "remove")}
                        className="rounded bg-white/5 px-2 py-1 text-slate-300">Remove</button>}
                    {friendship.state !== "blocked_by_self" ? (
                      <button onClick={() => void run("block", () => friendsPartiesApi.setBlock(friendship.peer.profile_id, true))}
                        className="rounded bg-rose-500/10 px-2 py-1 text-rose-200">Block</button>
                    ) : (
                      <button onClick={() => void run("unblock", () => friendsPartiesApi.setBlock(friendship.peer.profile_id, false))}
                        className="rounded bg-white/5 px-2 py-1">Unblock</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-fuchsia-300/15 bg-slate-900/75 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Voice party</h2>
              <StatusBadge state={media.projection.state} />
            </div>
            {!party ? (
              <div className="mt-4 space-y-4">
                <button onClick={() => void run("create-party", async () => setParty(await friendsPartiesApi.createParty()))}
                  className="w-full rounded-lg border border-fuchsia-300/30 bg-fuchsia-500/10 p-3 text-fuchsia-100">Start a two-person party</button>
                <form className="flex gap-2" onSubmit={(event) => {
                  event.preventDefault();
                  void run("join-party", async () => {
                    setParty(await friendsPartiesApi.joinParty(joinCode));
                    setJoinCode("");
                  });
                }}>
                  <input aria-label="Party invitation code" type="password" autoComplete="off"
                    placeholder="One-time party code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm" />
                  <button disabled={!joinCode.trim()} className="rounded-md bg-fuchsia-500 px-3 py-2 text-sm">Join</button>
                </form>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {party.members.map((member) => (
                    <div key={member.participant_id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="font-medium">{member.profile.display_name}</p>
                      <p className="text-xs text-slate-400">@{member.profile.handle} · {member.role}</p>
                      <div className="mt-2 flex flex-wrap gap-1"><StatusBadge state={member.media_state} />{member.muted && <StatusBadge state="muted" />}</div>
                    </div>
                  ))}
                </div>

                {shownInvite && (
                  <div className="rounded-lg border border-amber-300/30 bg-amber-400/10 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-amber-200">One-time invitation — shown only here</p>
                    <div className="mt-2 flex gap-2">
                      <code className="min-w-0 flex-1 truncate rounded bg-black/30 p-2 text-xs">{shownInvite.code}</code>
                      <button onClick={() => void navigator.clipboard.writeText(shownInvite.code)} className="rounded bg-amber-300 px-3 text-xs text-slate-950">Copy</button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button disabled={party.members.length !== 2 || media.projection.state === "active"}
                    onClick={() => void media.start()} className="rounded bg-emerald-500/20 p-2 text-sm text-emerald-100">Connect voice</button>
                  <button onClick={() => void media.setMuted(!media.projection.muted)}
                    className="rounded bg-white/5 p-2 text-sm">{media.projection.muted ? "Unmute" : "Mute"}</button>
                  <button onClick={() => void media.setDeafened(!media.projection.deafened)}
                    className="rounded bg-white/5 p-2 text-sm">{media.projection.deafened ? "Undeafen" : "Deafen"}</button>
                  <button onClick={() => void media.resumePlayback()} className="rounded bg-white/5 p-2 text-sm">Resume audio</button>
                </div>

                {self?.role === "owner" && (
                  <form className="rounded-lg border border-cyan-300/15 p-3" onSubmit={(event) => {
                    event.preventDefault();
                    void run("gpt-attach", async () => setParty(await friendsPartiesApi.requestGptAttachment(party.party_id, roomId)));
                  }}>
                    <div className="flex items-center justify-between gap-2">
                      <div><p className="text-sm font-medium">Optional GPT Live</p><p className="text-xs text-slate-400">Requires an exact matching Shared Live Room; does not change either member’s model consent.</p></div>
                      <StatusBadge state={party.gpt_attachment_state} />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input aria-label="Shared Live Room ID" placeholder="Shared Live Room ID" value={roomId}
                        onChange={(event) => setRoomId(event.target.value)} className="min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-2 py-1 text-sm" />
                      {party.gpt_attachment_state === "detached" ?
                        <button disabled={!roomId.trim()} className="rounded bg-cyan-500/20 px-3 text-sm text-cyan-100">Attach</button> :
                        <button type="button" onClick={() => void run("gpt-detach", async () => setParty(await friendsPartiesApi.detachGpt(party.party_id)))}
                          className="rounded bg-white/5 px-3 text-sm">Detach</button>}
                    </div>
                  </form>
                )}

                <button onClick={() => void run("leave", async () => {
                  await media.stop();
                  await friendsPartiesApi.leaveParty(party.party_id);
                  setParty(null);
                  setShownInvite(null);
                })} className="w-full rounded border border-rose-400/20 bg-rose-500/10 p-2 text-sm text-rose-200">
                  {self?.role === "owner" ? "End party" : "Leave party"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export default FriendsPartiesPanel;
