import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  HelixFriendsPartiesResponse,
  HelixFriendship,
  HelixVoiceParty,
  HelixSocialProfile,
} from "@shared/helix-friends-voice-party";
import { friendsPartiesApi } from "./FriendsPartiesApi";
import { FriendsConnectionRecovery } from "./FriendsConnectionRecovery";
import { FriendStreamsPanel } from "./FriendStreamsPanel";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { SharedLiveRoomsAccessControl } from "@/components/helix/ask-console/shared-live-room/SharedLiveRoomsAccessControl";
import { FriendChatBoard } from "./FriendChatBoard";
import { useVoicePartyMediaBridge } from "./useVoicePartyMediaBridge";
import { requestOpenSharedLiveRoomDialog, useSharedLiveRoomGuideProjection } from
  "@/components/helix/ask-console/shared-live-room/SharedLiveRoomGuideProjection";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, readCachedAccountProfileIdentity } from
  "@/lib/workstation/accountCapabilityPolicy";

const subscribeProfile = (notify: () => void) => {
  window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, notify);
  return () => window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, notify);
};
const profileKey = () => {
  const identity = readCachedAccountProfileIdentity();
  return `${identity.revision}:${identity.profileId ?? "signed-out"}`;
};

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
  const identity = useSyncExternalStore(subscribeProfile, profileKey, profileKey);
  return <ProfileFriendsPartiesPanel key={identity} />;
}

function ProfileFriendsPartiesPanel() {
  const alive = useRef(true);
  const loadRevision = useRef(0);
  const [snapshot, setSnapshot] = useState<HelixFriendsPartiesResponse | null>(null);
  const [party, setParty] = useState<HelixVoiceParty | null>(null);
  const [handle, setHandle] = useState("");
  const [friendHandle, setFriendHandle] = useState("");
  const [foundProfile, setFoundProfile] = useState<HelixSocialProfile | null>(null);
  const liveRoom = useSharedLiveRoomGuideProjection();
  const activeChatId = useAgiChatStore(state => state.activeId);
  const [roomInviteHandle, setRoomInviteHandle] = useState<string | null>(null);
  const openRoomForFriend = (handle: string) => {
    setRoomInviteHandle(handle);
    if (liveRoom.controller_available) requestOpenSharedLiveRoomDialog();
  };
  const [joinCode, setJoinCode] = useState("");
  const [roomId, setRoomId] = useState("");
  const [shownInvite, setShownInvite] = useState<{ code: string; expiresAt: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const showError = useCallback((cause: unknown) => {
    if (!alive.current) return;
    setError(cause instanceof Error ? cause.message : "Unable to load friends.");
    setErrorCode(cause && typeof cause === "object" && "code" in cause ? String(cause.code) : null);
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "friends_parties_connection_required") {
      setSnapshot(null);
      setParty(null);
    }
  }, []);

  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    const next = await friendsPartiesApi.list();
    if (!alive.current || revision !== loadRevision.current) return;
    setSnapshot(next);
    setError(null);
    setErrorCode(null);
    setParty(next.party ?? null);
    if (next.profile) setHandle(next.profile.handle);
  }, []);

  useEffect(() => {
    alive.current = true;
    void load().catch(showError);
    const poll = window.setInterval(() => void load().catch(showError), 4_000);
    return () => { alive.current = false; window.clearInterval(poll); };
  }, [load, showError]);

  useEffect(() => {
    const partyHeartbeat = window.setInterval(
      () => {
        if (party) void friendsPartiesApi.heartbeatParty(party.party_id)
          .then(setParty)
          .catch(() => undefined);
      },
      15_000,
    );
    return () => {
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
      if (!alive.current) return;
      await load();
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(null);
    }
  };

  const friendshipAction = (friendship: HelixFriendship, decision: "accept" | "decline" | "remove") =>
    run(`friendship:${friendship.friendship_id}`, () =>
      friendsPartiesApi.decideFriendship(friendship.friendship_id, decision));
  const connected = useCallback(() => { void load().catch(showError); }, [load, showError]);
  const connectionRecovery = errorCode === "friends_parties_connection_required"
    ? <FriendsConnectionRecovery onConnected={connected} /> : null;

  if (!snapshot) {
    return <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-950 text-sm text-slate-300">
      {error ? <><p role="alert">{error}</p><button onClick={() => void run("retry", load)}>Retry</button></> : "Loading Friends & Parties…"}
      {connectionRecovery}
    </div>;
  }

  return (
    <main className="h-full overflow-auto bg-[radial-gradient(circle_at_top,#162337,#070b13_58%)] p-5 text-slate-100">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Casimir social</p>
          <h1 className="text-2xl font-semibold">Friends &amp; Voice Parties</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Friends and requests are saved to your signed-in profile. Online status is shared with accepted friends while CasimirBot is running.
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
      {connectionRecovery}

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
        <div><FriendStreamsPanel key={`streams:${snapshot.profile.profile_id}`} friends={snapshot.friendships} presence={snapshot.presence}
          profileHandle={snapshot.profile.handle} activeChatId={activeChatId} onInviteToRoom={openRoomForFriend}/>
          {roomInviteHandle && snapshot.friendships.some(friend =>
            friend.state === "accepted" && friend.peer.handle === roomInviteHandle) &&
            <section className="mb-4 rounded-lg border border-cyan-300/20 p-3 text-sm" aria-label="Hosted room setup">
            <h3 className="font-medium">Hosted room with @{roomInviteHandle}</h3>
            <p className="my-2 text-slate-300">Enable Shared Live Rooms on both accounts. Hosts can open their hosted room in the browser and create a one-time invite. Guests can enter the room ID and invite in Hosted service rooms and select Join service room.</p>
            <p className="my-2 text-slate-300">After joining, open the room’s Mission tab to review a task or read the results shared with the room.</p>
            <div className="flex flex-wrap items-center gap-3">
              <SharedLiveRoomsAccessControl />
              <button type="button" disabled={!liveRoom.controller_available} onClick={requestOpenSharedLiveRoomDialog}
                className="rounded bg-cyan-500/20 px-3 py-2 text-cyan-100 disabled:opacity-50">Continue to Live Room controls</button>
              <button type="button" onClick={() => setRoomInviteHandle(null)}>Close</button>
            </div>
            {!liveRoom.controller_available && <p className="mt-2 text-slate-400">After enabling Rooms, open Helix Ask to load the room controls.</p>}
          </section>}
        <FriendChatBoard key={`chat:${snapshot.profile.profile_id}`} friends={snapshot.friendships} onOpenHostedRoom={openRoomForFriend}/>
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
              setFoundProfile(null);
              void run("friend-search", async () => {
                const result = await friendsPartiesApi.findExactHandle(friendHandle);
                if (!alive.current) return;
                setFoundProfile(result.profile);
              });
            }}>
              <input aria-label="Exact friend handle" placeholder="Exact handle" value={friendHandle}
                onChange={(event) => { setFriendHandle(event.target.value); setFoundProfile(null); }}
                className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm" />
              <button disabled={!friendHandle.trim() || busy !== null}
                className="rounded-md border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100">Search</button>
            </form>
            <p className="mt-2 text-xs text-slate-400">Search by exact handle. Private profiles and blocked accounts are excluded.</p>
            {foundProfile && <article aria-label="Account search result" className="mt-3 rounded-lg border border-cyan-300/20 p-3 text-sm">
              <p>{foundProfile.display_name} · @{foundProfile.handle}</p>
              {foundProfile.profile_id === snapshot.profile.profile_id ? <p className="text-xs text-slate-400">Your profile</p> :
                snapshot.friendships.some((item) => item.peer.profile_id === foundProfile.profile_id) ?
                  <p className="text-xs text-slate-400">Already in your friends or requests.</p> :
                  <button disabled={busy !== null} className="mt-2 rounded bg-cyan-500/20 px-3 py-1" onClick={() => void run("friend-request", async () => {
                    await friendsPartiesApi.requestFriend(foundProfile.handle);
                    setFoundProfile(null);
                    setFriendHandle("");
                  })}>Send friend request</button>}
            </article>}
            <div className="mt-4 space-y-2">
              {snapshot.friendships.length === 0 && <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-500">No friend connections yet.</p>}
              {(["incoming", "outgoing", "accepted", "blocked_by_self"] as const).map((state) => (
                <section key={state} className="space-y-2" aria-label={state === "incoming" ? "Received requests" : state === "outgoing" ? "Sent requests" : state === "accepted" ? "Friend list" : "Blocked accounts"}>
                {snapshot.friendships.some((item) => item.state === state) && <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-400">
                  {state === "incoming" ? "Received requests · pending" : state === "outgoing" ? "Sent requests · pending" : state === "accepted" ? "Friend list" : "Blocked accounts"}
                </h3>}
              {snapshot.friendships.filter((item) => item.state === state).map((friendship) => (
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
                    {friendship.state === "incoming" && <button disabled={busy !== null} onClick={() => void friendshipAction(friendship, "accept")}
                      className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-100">Accept</button>}
                    {friendship.state === "incoming" && <button disabled={busy !== null} onClick={() => void friendshipAction(friendship, "decline")}
                      className="rounded bg-white/5 px-2 py-1 text-slate-300">Decline</button>}
                    {friendship.state === "accepted" && (!party || (self?.role === "owner" && party.members.filter((member) => member.state !== "left").length < 2)) && <button disabled={busy !== null} onClick={() => void run("create-party", async () => {
                      const created = party ?? await friendsPartiesApi.createParty();
                      if (!alive.current) return;
                      const invitation = await friendsPartiesApi.createPartyInvite(created.party_id, friendship.peer.profile_id);
                      setParty(invitation.party);
                      setShownInvite({ code: invitation.inviteCode, expiresAt: invitation.expiresAt });
                    })} className="rounded bg-fuchsia-500/20 px-2 py-1 text-fuchsia-100">Invite to party</button>}
                    {(friendship.state === "accepted" || friendship.state === "incoming" || friendship.state === "outgoing") &&
                      <button disabled={busy !== null} onClick={() => void friendshipAction(friendship, "remove")}
                        className="rounded bg-white/5 px-2 py-1 text-slate-300">{friendship.state === "outgoing" ? "Cancel request" : "Remove"}</button>}
                    {friendship.state !== "blocked_by_self" ? (
                      <button disabled={busy !== null} onClick={() => void run("block", () => friendsPartiesApi.setBlock(friendship.peer.profile_id, true))}
                        className="rounded bg-rose-500/10 px-2 py-1 text-rose-200">Block</button>
                    ) : (
                      <button disabled={busy !== null} onClick={() => void run("unblock", () => friendsPartiesApi.setBlock(friendship.peer.profile_id, false))}
                        className="rounded bg-white/5 px-2 py-1">Unblock</button>
                    )}
                  </div>
                </article>
              ))}
                </section>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-fuchsia-300/15 bg-slate-900/75 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Voice party</h2>
              <StatusBadge state={media.projection.state} />
            </div>
            <div className="mt-3 rounded-lg border border-cyan-300/20 p-3 text-sm">
              <p className="font-medium">Shared reasoning &amp; programs</p>
              <p className="mt-1 text-xs text-slate-400">Open a Live Room to invite a friend, share task instructions and results, and manage supported program grants. Each program owner approves access separately.</p>
              <p className="mt-1 text-xs text-slate-400">Program grants currently support host-shared reads. Access to a guest’s programs from the host is not available here yet.</p>
              <button disabled={!liveRoom.controller_available} onClick={requestOpenSharedLiveRoomDialog}
                className="mt-2 rounded bg-cyan-500/20 px-3 py-2 text-cyan-100 disabled:opacity-50">Open Live Room controls</button>
              {!liveRoom.controller_available && <p className="mt-1 text-xs text-slate-400">Open Helix Ask to make Live Room controls available.</p>}
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
        </div>
      )}
    </main>
  );
}

export default FriendsPartiesPanel;
