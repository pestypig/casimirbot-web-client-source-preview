// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountSessionPanel from "@/components/workstation/AccountSessionPanel";
import {
  readClaimablePostulateReceipts,
  rememberClaimablePostulateReceipt,
} from "@/lib/agi/proposals";
import { hawMessages } from "@/lib/i18n/messages/haw";
import { INTERFACE_MESSAGE_IDS } from "@/lib/i18n/messages/types";
import {
  buildHelixSharedRealtimeRoomsExperimentPolicy,
  HELIX_DEVELOPER_ACCOUNT_POLICY,
  HELIX_USER_ACCOUNT_POLICY,
} from "@shared/helix-account-session";

vi.mock("@/components/auth/GoogleSignInButton", () => ({
  GoogleSignInButton: () => <button type="button">Google sign-in mock</button>,
}));

const statusBody = {
  schema: "helix.account_session_status.v1",
  ok: false,
  session: null,
  linked_accounts: [],
  profile_ingress_tokens: [],
  profile_ingress_usage: {
    request_count: 0,
    accepted_count: 0,
    rejected_count: 0,
    estimated_token_count: 0,
    last_event_at: null,
  },
  usage: {
    thread_count: 0,
    item_count: 0,
    answer_count: 0,
    tool_observation_count: 0,
    validation_count: 0,
    estimated_token_count: 0,
    window_started_at: "",
    window_ended_at: "",
  },
  auth_boundary: {
    credential_collection_allowed_in_agents: false,
    raw_password_stored: false,
    discord_bot_password_collection_allowed: false,
    recommended_flow: "web_auth_or_oauth_link",
  },
};

const statusBodyWithMappedStates = {
  ...statusBody,
  ok: true,
  session: {
    session_id: "session-123",
    profile: {
      profile_id: "profile-123",
      display_name: "Localized State Tester",
      email: "tester@example.test",
      auth_mode: "local_dev_profile",
      provider: "local",
    },
    status: "active",
    memory_scope: "session_only",
    created_at: "2026-06-16T00:00:00.000Z",
    updated_at: "2026-06-16T00:00:00.000Z",
  },
  linked_accounts: [
    {
      provider: "browser",
      external_id: "browser-account-1",
      display_name: null,
      status: "linked",
      authority: "viewer",
      linked_at: "2026-06-16T00:00:00.000Z",
    },
  ],
  profile_ingress_tokens: [
    {
      token_id: "token-1",
      label: "State token",
      token_prefix: "cbt_test",
      public_ingress_url: "https://example.test/ingress/token-1",
      scopes: ["source_event"],
      status: "active",
      request_count: 0,
      last_used_at: null,
      created_at: "2026-06-16T00:00:00.000Z",
      revoked_at: null,
    },
  ],
};

const developerStatusBody = {
  ...statusBody,
  account_policy: HELIX_DEVELOPER_ACCOUNT_POLICY,
};

const publicRoomsStatusBody = {
  ...statusBody,
  ok: true,
  account_policy: HELIX_USER_ACCOUNT_POLICY,
  experimental_features: {
    shared_realtime_rooms: {
      available: true,
      enabled: false,
      guest_session: false,
      guest_hosting_allowed: true,
      session_expires_at: null,
    },
  },
};

const guestRoomsStatusBody = {
  ...publicRoomsStatusBody,
  session: {
    schema: "helix.account_session.v1",
    session_id: "account_session:guest-test",
    profile: {
      profile_id: "guest:00000000-0000-4000-8000-000000000001",
      display_name: "BriskBadger47",
      email: null,
      email_verified_at: null,
      auth_mode: "guest",
      account_type: "user",
      provider: "guest",
      provider_subject: "00000000-0000-4000-8000-000000000001",
      picture_url: null,
      created_at: "2026-07-23T12:00:00.000Z",
      updated_at: "2026-07-23T12:00:00.000Z",
    },
    account_policy: buildHelixSharedRealtimeRoomsExperimentPolicy("user"),
    status: "active",
    memory_scope: "session_only",
    created_at: "2026-07-23T12:00:00.000Z",
    updated_at: "2026-07-23T12:00:00.000Z",
    expires_at: "2026-07-24T12:00:00.000Z",
  },
  account_policy: buildHelixSharedRealtimeRoomsExperimentPolicy("user"),
  experimental_features: {
    shared_realtime_rooms: {
      available: true,
      enabled: true,
      guest_session: true,
      guest_hosting_allowed: true,
      session_expires_at: "2026-07-24T12:00:00.000Z",
    },
  },
};

const archiveRows = [
  {
    archive_id: "archive-1",
    source_family: "helix-ask:desktop",
    session_title: "Archive title",
    objective: "Archive objective",
    started_at: "2026-06-16T00:00:00.000Z",
    ended_at: "2026-06-16T00:05:00.000Z",
    summary: "Archive summary",
    evidence_index: [],
    subgoals: [],
    learned_pattern_candidates: [],
    raw_logs_included: false,
    assistant_answer: false,
  },
];

const jobRows = [
  {
    job_id: "job-1",
    thread_id: "helix-ask:desktop",
    profile_id: "profile-123",
    room_id: null,
    source_family: "helix-ask:desktop",
    source_ids: [],
    world_id: null,
    objective: "Job objective",
    status: "running",
    policy: {
      mode: "observe",
      evidence_budget: "small",
      surface_policy: "account-panel-test",
      archive_on_stop: false,
      profile_archive_policy: "manual",
    },
    counters: {
      source_events_seen: 0,
      categorization_events: 0,
      synthetic_evidence: 0,
      utility_hypotheses: 0,
      pattern_candidates: 0,
    },
    latest_summary: null,
    last_event_ts: null,
    archive_id: null,
    raw_logs_included: false,
    assistant_answer: false,
    updated_at: "2026-06-16T00:00:00.000Z",
  },
];

function mockFetch(accountStatus: Record<string, any> = statusBody) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/account/session")) {
      return new Response(JSON.stringify(accountStatus), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.startsWith("/api/discord/sessions")) {
      return new Response(JSON.stringify({ sessions: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.startsWith("/api/agi/situation/profile-archives")) {
      return new Response(JSON.stringify({ archives: accountStatus.session ? archiveRows : [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.startsWith("/api/agi/situation/categorization-jobs")) {
      return new Response(JSON.stringify({ jobs: accountStatus.session ? jobRows : [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({}), { status: 404, headers: { "Content-Type": "application/json" } });
  });
}

describe("AccountSessionPanel interface language", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.lang = "";
    document.documentElement.dir = "";
  });

  it("renders reviewed Hawaiian catalog entries when the account setting selects Hawaiian", async () => {
    localStorage.setItem("helix-start-settings", JSON.stringify({ interfaceLanguage: "haw" }));
    vi.stubGlobal("fetch", mockFetch(developerStatusBody));

    render(<AccountSessionPanel />);

    await waitFor(() => {
      expect(screen.getByText("Moʻokāki a me nā kau")).toBeInTheDocument();
      expect(screen.getByText("ʻŌlelo no ke alo")).toBeInTheDocument();
    });
    expect(screen.getByRole("combobox")).toHaveValue("haw");
    expect(
      screen.getByRole("option", {
        name: `Hawaiian (ʻŌlelo Hawaiʻi) - ${Object.keys(hawMessages).length}/${INTERFACE_MESSAGE_IDS.length} catalog strings`,
      }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("haw");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("offers every interface language catalog to public accounts", async () => {
    vi.stubGlobal("fetch", mockFetch());

    render(<AccountSessionPanel />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveValue("en");
    });
    expect(screen.getByRole("option", { name: /English/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /German/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Arabic/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Hawaiian/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Spanish/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Wolof/ })).toBeInTheDocument();
  });

  it("enables Shared Live Rooms immediately and shows the generated guest identity", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/account/session/experimental-rooms") {
        return new Response(JSON.stringify({
          ok: true,
          error: null,
          status: guestRoomsStatusBody,
          session_cookie_action: "set",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return mockFetch(publicRoomsStatusBody)(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountSessionPanel />);

    await waitFor(() => {
      expect(screen.getByText("Experimental features")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Experimental features"));
    const roomsSwitch = screen.getByRole("switch", { name: "Shared Live Rooms" });
    expect(roomsSwitch).toHaveAttribute("aria-checked", "false");
    fireEvent.click(roomsSwitch);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/account/session/experimental-rooms",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ enabled: true }),
        }),
      );
      expect(screen.getAllByText("BriskBadger47").length).toBeGreaterThanOrEqual(2);
      expect(roomsSwitch).toHaveAttribute("aria-checked", "true");
    });
  });

  it("renders known backend states through localized display labels instead of raw enum values", async () => {
    localStorage.setItem("helix-start-settings", JSON.stringify({ interfaceLanguage: "haw" }));
    vi.stubGlobal("fetch", mockFetch(statusBodyWithMappedStates));

    render(<AccountSessionPanel />);

    await waitFor(() => {
      expect(screen.getByText("Localized State Tester")).toBeInTheDocument();
      expect(screen.getAllByText(/e hana nei/).length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/kau wale nō/)).toBeInTheDocument();
    expect(screen.getAllByText(/kūloko/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/hoʻopili ʻia/).length).toBeGreaterThan(0);
    expect(screen.getByText(/mea nānā/)).toBeInTheDocument();
    expect(screen.getAllByText(/ʻaʻohe/).length).toBeGreaterThan(0);

    expect(screen.queryByText(/local_dev_profile/)).not.toBeInTheDocument();
    expect(screen.queryByText(/session_only/)).not.toBeInTheDocument();
    expect(screen.queryByText(/helix-ask:desktop/)).not.toBeInTheDocument();
    expect(screen.queryByText(/false/)).not.toBeInTheDocument();
  });

  it("broadcasts interface language changes so workstation chrome updates in the same tab", async () => {
    localStorage.setItem("helix-start-settings", JSON.stringify({ interfaceLanguage: "haw" }));
    vi.stubGlobal("fetch", mockFetch(developerStatusBody));
    const observedLanguages: string[] = [];
    const handleLanguageChanged = ((event: CustomEvent<{ language: string }>) => {
      observedLanguages.push(event.detail.language);
    }) as EventListener;
    window.addEventListener("helix:interface-language-changed", handleLanguageChanged);

    render(<AccountSessionPanel />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveValue("haw");
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "en" } });

    await waitFor(() => {
      expect(observedLanguages).toContain("en");
      expect(screen.getByRole("combobox")).toHaveValue("en");
    });
    window.removeEventListener("helix:interface-language-changed", handleLanguageChanged);
  });

  it("keeps refresh loading state from disabling account actions or changing button text", async () => {
    let releaseStatus = () => {};
    const pendingStatus = new Promise<void>((resolve) => {
      releaseStatus = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/account/session")) {
        await pendingStatus;
        return new Response(JSON.stringify(statusBody), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.startsWith("/api/discord/sessions")) {
        return new Response(JSON.stringify({ sessions: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.startsWith("/api/agi/situation")) {
        return new Response(JSON.stringify({ archives: [], jobs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 404, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountSessionPanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Loading..." })).toHaveTextContent("Refresh");
    });
    expect(screen.getAllByRole("button", { name: "Sign in" }).some((button) => !button.hasAttribute("disabled"))).toBe(true);

    releaseStatus();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refresh" })).toHaveTextContent("Refresh");
    });
  });

  it("shows a simple password reset button after repeated failed sign-in attempts", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/account/session/account-sign-in")) {
        return new Response(JSON.stringify({
          ok: false,
          message: "Sign-in failed. Check your email and password.",
          error: "invalid_password_account_credentials",
          show_password_reset_hint: true,
        }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      if (url.startsWith("/api/account/session/password-reset/request")) {
        return new Response(JSON.stringify({
          ok: true,
          message: "If a workstation profile exists for that email, a password reset link has been sent.",
          token_value_shown_once: false,
          token_value: null,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return mockFetch()(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountSessionPanel />);

    await waitFor(() => {
      expect(screen.getByText("Save to a profile")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong password" } });
    const signInButtons = screen.getAllByRole("button", { name: "Sign in" });
    fireEvent.click(signInButtons[signInButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send reset link to my email" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Send reset link to my email" }));

    await waitFor(() => {
      expect(screen.getByText("If a workstation profile exists for that email, a password reset link has been sent.")).toBeInTheDocument();
    });
  });

  it("shows claimable postulate receipts and claims them for signed-in profiles", async () => {
    rememberClaimablePostulateReceipt({
      proposalId: "postulate-1",
      receiptId: "receipt-1",
      receiptIssuedAt: "2026-07-07T04:00:00.000Z",
      receiptIntegrityHash: "abc123",
      title: "High-congruence proposal",
      score: 0.92,
      rewardTokens: 250,
      createdAt: "2026-07-07T04:00:00.000Z",
      status: "claim_pending",
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/proposals/postulate/postulate-1/claim")) {
        return new Response(JSON.stringify({
          ok: true,
          proposal: {
            id: "postulate-1",
            kind: "postulate",
            rewardTokens: 250,
            metadata: {
              postulate: {
                receiptId: "receipt-1",
                receiptIssuedAt: "2026-07-07T04:00:00.000Z",
                receiptIntegrityHash: "claimed-hash",
                rewardCreditStatus: "issued",
                receiptClaimStatus: "claimed",
              },
            },
          },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return mockFetch(statusBodyWithMappedStates)(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountSessionPanel />);

    await waitFor(() => {
      expect(screen.getByText("Postulate receipts")).toBeInTheDocument();
      expect(screen.getByText("High-congruence proposal")).toBeInTheDocument();
      expect(screen.getByText("250 credits")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Claim" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/proposals/postulate/postulate-1/claim",
        expect.objectContaining({ method: "POST" }),
      );
      expect(readClaimablePostulateReceipts()).toEqual([
        expect.objectContaining({
          proposalId: "postulate-1",
          status: "issued",
          receiptIntegrityHash: "claimed-hash",
        }),
      ]);
      expect(screen.getByRole("button", { name: "Credits issued" })).toBeInTheDocument();
    });
  });
});
