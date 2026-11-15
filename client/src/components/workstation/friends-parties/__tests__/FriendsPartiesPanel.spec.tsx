/** @vitest-environment jsdom */

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  heartbeatParty: vi.fn(async () => ({})),
  findExactHandle: vi.fn(),
  requestFriend: vi.fn(),
  decideFriendship: vi.fn(),
  createParty: vi.fn(),
  createPartyInvite: vi.fn(),
  openLiveRoom: vi.fn(),
  roomControllerAvailable: false,
}));
vi.mock("@/components/helix/ask-console/shared-live-room/SharedLiveRoomGuideProjection", () => ({
  requestOpenSharedLiveRoomDialog: mocks.openLiveRoom,
  useSharedLiveRoomGuideProjection: () => ({ controller_available: mocks.roomControllerAvailable }),
}));

vi.mock("../FriendsPartiesApi", () => ({
  friendsPartiesApi: {
    list: mocks.list,
    heartbeatParty: mocks.heartbeatParty,
    findExactHandle: mocks.findExactHandle,
    requestFriend: mocks.requestFriend,
    decideFriendship: mocks.decideFriendship,
    createParty: mocks.createParty,
    createPartyInvite: mocks.createPartyInvite,
  },
}));
vi.mock("../useVoicePartyMediaBridge", () => ({
  useVoicePartyMediaBridge: () => ({
    projection: {
      state: "idle",
      transport: "unknown",
      muted: false,
      deafened: false,
    },
    start: vi.fn(),
    stop: vi.fn(),
    setMuted: vi.fn(),
    setDeafened: vi.fn(),
    resumePlayback: vi.fn(),
  }),
}));

import { FriendsPartiesPanel } from "../FriendsPartiesPanel";
import { cacheAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { HELIX_SIGNED_OUT_ACCOUNT_POLICY } from "@shared/helix-account-session";

describe("FriendsPartiesPanel", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.roomControllerAvailable = false;
    cacheAccountCapabilityPolicy(HELIX_SIGNED_OUT_ACCOUNT_POLICY, "profile:self");
    mocks.list.mockResolvedValue({
      schema: "helix.friends_parties.response.v1",
      ok: true,
      error: null,
      message: "Friends and parties listed.",
      profile: {
        schema: "helix.social_profile.v1",
        profile_id: "profile:self",
        handle: "SelfHandle",
        display_name: "Self",
        picture_url: null,
        discovery_policy: "exact_handle",
        presence_visibility: "friends",
        updated_at: "2026-08-31T00:00:00.000Z",
      },
      profiles: [],
      friendships: [{
        schema: "helix.friendship.v1",
        friendship_id: "friendship:one",
        peer: {
          schema: "helix.social_profile.v1",
          profile_id: "profile:friend",
          handle: "FriendHandle",
          display_name: "Friendly User",
          picture_url: null,
          discovery_policy: "exact_handle",
          presence_visibility: "friends",
          updated_at: "2026-08-31T00:00:00.000Z",
        },
        state: "accepted",
        created_at: "2026-08-31T00:00:00.000Z",
        updated_at: "2026-08-31T00:00:00.000Z",
      }],
      presence: [{
        schema: "helix.social_presence.v1",
        profile_id: "profile:friend",
        state: "online",
        observed_at: "2026-08-31T00:00:00.000Z",
        expires_at: "2026-08-31T00:01:00.000Z",
      }],
      party: null,
      parties: [],
      invite_code: null,
      invite_expires_at: null,
    });
  });

  it("renders authenticated friend and honest no-party state", async () => {
    const { unmount } = render(<FriendsPartiesPanel />);
    expect(await screen.findByText("Friendly User")).toBeTruthy();
    expect(screen.getByText("online")).toBeTruthy();
    expect(screen.getByText("Start a two-person party")).toBeTruthy();
    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    unmount();
  });

  it("surfaces expired Friends access on the next poll instead of leaving stale status cards", async () => {
    vi.useFakeTimers();
    render(<FriendsPartiesPanel />);
    await act(async () => {});
    expect(screen.getByText("Friendly User")).toBeTruthy();
    mocks.list.mockRejectedValueOnce(Object.assign(new Error("Connect Friends again"), { code: "friends_parties_connection_required" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(screen.queryByText("Friendly User")).toBeNull();
    expect(screen.getByRole("region", { name: "Friends connection" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await act(async () => {});
    expect(screen.getByText("Friendly User")).toBeTruthy();
    expect(mocks.createParty).not.toHaveBeenCalled();
    expect(mocks.requestFriend).not.toHaveBeenCalled();
  });

  it("searches an exact account before sending a pending request", async () => {
    const snapshot = await mocks.list();
    const peer = { ...snapshot.friendships[0].peer, profile_id: "profile:new", handle: "NewFriend" };
    mocks.findExactHandle.mockResolvedValue({ ...snapshot, profile: peer });
    mocks.requestFriend.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ ...snapshot, friendships: [...snapshot.friendships,
        { ...snapshot.friendships[0], friendship_id: "friendship:new", peer, state: "outgoing" }] });
    });
    render(<FriendsPartiesPanel />);
    fireEvent.change(await screen.findByLabelText("Exact friend handle"), { target: { value: "NewFriend" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const result = await screen.findByRole("article", { name: "Account search result" });
    expect(mocks.findExactHandle).toHaveBeenCalledWith("NewFriend");
    expect(mocks.requestFriend).not.toHaveBeenCalled();
    fireEvent.click(within(result).getByRole("button", { name: "Send friend request" }));
    await waitFor(() => expect(mocks.requestFriend).toHaveBeenCalledWith("NewFriend"));
    expect(await screen.findByRole("region", { name: "Sent requests" })).toBeTruthy();
    expect(await screen.findByText("Sent requests · pending")).toBeTruthy();
  });

  it("keeps pending requests separate and moves an accepted request into the friend list", async () => {
    const snapshot = await mocks.list();
    const friendship = { ...snapshot.friendships[0], state: "incoming" };
    mocks.list.mockResolvedValue({ ...snapshot, friendships: [friendship], presence: [] });
    mocks.decideFriendship.mockImplementation(async () => {
      mocks.list.mockResolvedValue(snapshot);
    });
    render(<FriendsPartiesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    await waitFor(() => expect(mocks.decideFriendship).toHaveBeenCalledWith("friendship:one", "accept"));
    const friends = screen.getByRole("region", { name: "Friend list" });
    await waitFor(() => expect(within(friends).getByText("Friendly User")).toBeTruthy());
  });

  it("exposes a decline decision for a received request", async () => {
    const snapshot = await mocks.list();
    mocks.list.mockResolvedValue({ ...snapshot, friendships: [{ ...snapshot.friendships[0], state: "incoming" }] });
    mocks.decideFriendship.mockResolvedValue({});
    render(<FriendsPartiesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    await waitFor(() => expect(mocks.decideFriendship).toHaveBeenCalledWith("friendship:one", "decline"));
  });

  it("invites from the existing owner party without creating a second party", async () => {
    const snapshot = await mocks.list();
    const party = { party_id: "party:existing", state: "created", gpt_attachment_state: "detached",
      members: [{ participant_id: "participant:self", profile: snapshot.profile, role: "owner", state: "connected", media_state: "idle" }] };
    mocks.list.mockResolvedValue({ ...snapshot, party });
    mocks.createPartyInvite.mockResolvedValue({ party, inviteCode: "one-use-code", expiresAt: null });
    render(<FriendsPartiesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Invite to party" }));
    await waitFor(() => expect(mocks.createPartyInvite).toHaveBeenCalledWith("party:existing", "profile:friend"));
    expect(mocks.createParty).not.toHaveBeenCalled();
    expect(await screen.findByText("one-use-code")).toBeTruthy();
  });

  it("shows and recovers an initial coordination failure", async () => {
    const snapshot = await mocks.list();
    mocks.list.mockRejectedValueOnce(new Error("Connect this profile to the domain."));
    render(<FriendsPartiesPanel />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Connect this profile to the domain.");
    mocks.list.mockResolvedValue(snapshot);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Friendly User")).toBeTruthy();
  });

  it("opens the existing room controller for shared reasoning and program controls", async () => {
    mocks.roomControllerAvailable = true;
    render(<FriendsPartiesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Live Room controls" }));
    expect(mocks.openLiveRoom).toHaveBeenCalledOnce();
    expect(screen.getByText(/Access to a guest’s programs from the host is not available here yet/)).toBeTruthy();
  });

  it("shows room setup for an accepted friend when no room controller is mounted", async () => {
    render(<FriendsPartiesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Invite to room" }));
    const setup = screen.getByRole("region", { name: "Hosted room setup" });
    expect(within(setup).getByText("Hosted room with @FriendHandle")).toBeTruthy();
    expect(within(setup).getByRole("switch", { name: "Shared Live Rooms" })).toBeTruthy();
    expect((within(setup).getByRole("button", { name: "Continue to Live Room controls" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.openLiveRoom).not.toHaveBeenCalled();
  });

  it("clears the previous profile immediately and ignores an old search after account switching", async () => {
    const snapshot = await mocks.list();
    let finishSearch!: (value: unknown) => void;
    mocks.findExactHandle.mockImplementation(() => new Promise((resolve) => { finishSearch = resolve; }));
    render(<FriendsPartiesPanel />);
    fireEvent.change(await screen.findByLabelText("Exact friend handle"), { target: { value: "FriendHandle" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    mocks.list.mockImplementation(() => new Promise(() => {}));
    act(() => { cacheAccountCapabilityPolicy(HELIX_SIGNED_OUT_ACCOUNT_POLICY, "profile:other"); });
    expect(screen.queryByText("Friendly User")).toBeNull();
    await act(async () => { finishSearch({ ...snapshot, profile: snapshot.friendships[0].peer }); });
    expect(screen.queryByRole("article", { name: "Account search result" })).toBeNull();
  });
});
