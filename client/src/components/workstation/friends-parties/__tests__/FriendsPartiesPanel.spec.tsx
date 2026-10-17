/** @vitest-environment jsdom */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  heartbeatParty: vi.fn(async () => ({})),
}));

vi.mock("../FriendsPartiesApi", () => ({
  friendsPartiesApi: {
    list: mocks.list,
    heartbeatParty: mocks.heartbeatParty,
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

describe("FriendsPartiesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
