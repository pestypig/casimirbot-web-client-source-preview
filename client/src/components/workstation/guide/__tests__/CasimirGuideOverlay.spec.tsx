/** @vitest-environment jsdom */

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HELIX_DEVELOPER_ACCOUNT_POLICY,
  HELIX_USER_ACCOUNT_POLICY,
  type HelixAccountCapabilityPolicy,
} from "@shared/helix-account-session";
import {
  HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT,
  recordSharedLiveRoomGuideProjection,
  resetSharedLiveRoomGuideProjection,
} from "@/components/helix/ask-console/shared-live-room/SharedLiveRoomGuideProjection";
import {
  recordMissionGuideBinding,
  resetMissionGuideBindingForTest,
} from "../CasimirGuideMissionProjection";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  policy: null as HelixAccountCapabilityPolicy | null,
  fetchPolicy: vi.fn(),
  identity: { profileId: "profile:self" as string | null | undefined, revision: 0 },
}));

vi.mock("@/components/workstation/friends-parties/FriendsPartiesApi", () => ({
  friendsPartiesApi: { list: mocks.list },
}));

vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "helix-account-capability-policy-changed",
  readCachedAccountCapabilityPolicy: () => mocks.policy,
  readCachedAccountProfileIdentity: () => ({ ...mocks.identity }),
  fetchAccountCapabilityPolicy: mocks.fetchPolicy,
}));

import { CasimirGuideOverlay } from "../CasimirGuideOverlay";

const socialResponse = {
  schema: "helix.friends_parties.response.v1",
  ok: true,
  profile: { profile_id: "profile:self" },
  friendships: [
    { state: "accepted", peer: { profile_id: "profile:friend" } },
    { state: "incoming", peer: { profile_id: "profile:request" } },
  ],
  presence: [{ profile_id: "profile:friend", state: "online" }],
  party: {
    party_id: "voice_party:guide",
    state: "active",
    gpt_attachment_state: "detached",
    members: [
      { profile: { profile_id: "profile:self" }, media_state: "direct", muted: false },
      { profile: { profile_id: "profile:friend" }, media_state: "relayed", muted: false },
    ],
  },
};

describe("CasimirGuideOverlay", () => {
  beforeEach(() => {
    resetSharedLiveRoomGuideProjection();
    resetMissionGuideBindingForTest();
    mocks.list.mockReset();
    mocks.identity = { profileId: "profile:self", revision: 0 };
    mocks.policy = HELIX_DEVELOPER_ACCOUNT_POLICY;
    mocks.fetchPolicy.mockImplementation(async () => mocks.policy ?? HELIX_USER_ACCOUNT_POLICY);
    mocks.list.mockResolvedValue(socialResponse);
  });

  afterEach(() => {
    cleanup();
    resetSharedLiveRoomGuideProjection();
    resetMissionGuideBindingForTest();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders the labeled six-blade shell, action legend, and reduced-motion fallback", () => {
    render(<CasimirGuideOverlay open onClose={vi.fn()} onOpenPanel={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Casimir Guide" });
    expect(dialog.getAttribute("aria-describedby")).toBe("casimir-guide-description");
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(screen.getByRole("contentinfo", { name: "Guide action legend" })).toBeTruthy();
    expect(dialog.className).toContain("zoom-in-90");
    expect(dialog.className).toContain("motion-reduce:zoom-in-100");
  });

  it("projects authoritative social and party state and routes to the registered full panel", async () => {
    const onOpenPanel = vi.fn();
    render(<CasimirGuideOverlay open onClose={vi.fn()} onOpenPanel={onOpenPanel} />);

    fireEvent.click(screen.getByRole("tab", { name: "Live Room" }));
    expect(await screen.findByText("2 members · active")).toBeTruthy();
    expect(screen.getByText("direct")).toBeTruthy();
    expect(screen.getByText("detached")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Friends & party controls/ }));
    expect(onOpenPanel).toHaveBeenCalledWith("friends-parties");
  });

  const switchProfile = (profileId: string) => {
    mocks.identity = { profileId, revision: mocks.identity.revision + 1 };
    window.dispatchEvent(new CustomEvent("helix-account-capability-policy-changed", {
      detail: { account_policy: mocks.policy },
    }));
  };

  it("clears the previous profile's party and refreshes when permissions are identical", async () => {
    render(<CasimirGuideOverlay open onClose={vi.fn()} onOpenPanel={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Live Room" }));
    expect(await screen.findByText("2 members · active")).toBeTruthy();
    let finish!: (value: typeof socialResponse) => void;
    mocks.list.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => switchProfile("profile:next"));
    expect(screen.queryByText("2 members · active")).toBeNull();
    expect(mocks.list).toHaveBeenCalledTimes(2);
    await act(async () => finish({ ...socialResponse, party: { ...socialResponse.party, state: "next-profile" } }));
    expect(screen.getByText("2 members · next-profile")).toBeTruthy();
  });

  it("discards a pending response across an A to B to A account round trip", async () => {
    let finishOld!: (value: typeof socialResponse) => void;
    mocks.list.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    render(<CasimirGuideOverlay open onClose={vi.fn()} onOpenPanel={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Live Room" }));
    const fresh = { ...socialResponse, party: { ...socialResponse.party, state: "fresh-session" } };
    mocks.list.mockResolvedValue(fresh);
    act(() => { switchProfile("profile:next"); switchProfile("profile:self"); });
    await act(async () => finishOld(socialResponse));
    expect(screen.queryByText("2 members · active")).toBeNull();
    expect(await screen.findByText("2 members · fresh-session")).toBeTruthy();
  });

  it("does not let a previous profile's late rejection lock the current social summary", async () => {
    let rejectOld!: (value: unknown) => void;
    mocks.list.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    render(<CasimirGuideOverlay open onClose={vi.fn()} onOpenPanel={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Live Room" }));
    act(() => switchProfile("profile:next"));
    await act(async () => rejectOld({ status: 401 }));
    expect(screen.queryAllByRole("button", { name: /requires an authenticated account session/ })).toHaveLength(0);
    expect(await screen.findByText("2 members · active")).toBeTruthy();
  });

  it("projects redacted room state and navigates to the existing full room dialog", async () => {
    const onClose = vi.fn();
    const openDialog = vi.fn();
    window.addEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, openDialog);
    recordSharedLiveRoomGuideProjection({
      controller_available: true,
      state: "ready",
      room: {
        title: "Casimir planning room",
        status: "active",
        participant_count: 2,
        present_count: 1,
        required_participant_count: 2,
        readiness_ready: true,
        updated_at: "2026-08-31T20:00:00.000Z",
      },
      floor: { active: true, holder_display_name: "Dan" },
      microphone: {
        state: "active",
        to_room_consented: true,
        to_model_consented: false,
      },
      gpt: { attached: true, runtime_state: "bridge_active", model: "gpt-realtime" },
      sources: {
        count: 2,
        fresh_count: 1,
        stale_count: 1,
        latest_observed_at: "2026-08-31T20:00:00.000Z",
      },
      public_results: {
        count: 1,
        latest_published_at: "2026-08-31T19:59:00.000Z",
        latest_artifact_kind: "model_synthesized_answer",
      },
    });

    render(<CasimirGuideOverlay open onClose={onClose} onOpenPanel={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Live Room" }));

    expect(screen.getByText("Casimir planning room")).toBeTruthy();
    expect(screen.getByText("1 present · 2/2 members")).toBeTruthy();
    expect(screen.getByText("Dan")).toBeTruthy();
    expect(screen.getByText("Attached · bridge_active")).toBeTruthy();
    expect(screen.getByText("1 fresh · 2 total")).toBeTruthy();
    expect(screen.getByText("1 published")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Shared sources/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Open full Live Room/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(openDialog).toHaveBeenCalledTimes(1));
    window.removeEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, openDialog);
  });

  it("uses registry-backed Workspace and System destinations", () => {
    render(<CasimirGuideOverlay
      open
      onClose={vi.fn()}
      onOpenPanel={vi.fn()}
      context={{
        activePanelId: "docs-viewer",
        recentPanelIds: ["docs-viewer", "workstation-notes"],
        favoritePanelIds: ["workstation-notes"],
      }}
    />);

    fireEvent.click(screen.getByRole("tab", { name: "Workspace" }));
    expect(screen.getByRole("button", { name: /Resume Docs & Papers/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Recent panels/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Favorites/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "System" }));
    expect(screen.getByRole("button", { name: /Device Check/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Account & Sessions/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Connections, Billing & Security/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Desktop Updates/ })).toBeTruthy();
  });

  it("projects bounded environment health and routes all controls to governed panels", async () => {
    const onOpenPanel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (request: RequestInfo | URL) => {
      if (String(request) !== "/api/agi/environment-connectors/devices") {
        throw new Error(`unexpected fetch: ${String(request)}`);
      }
      return new Response(JSON.stringify({
        schema: "helix.environment_connector.device_check_list.v1",
        generated_at: "2026-08-31T20:02:00.000Z",
        devices: [{
          schema: "helix.environment_connector.device_check.v1",
          device_id: "device:private",
          installation_id: "installation:private",
          package_id: "minecraft-paper",
          package_version: "1.0.0",
          trust_classification: "first_party",
          security_review_state: "approved",
          installation_status: "active",
          device_status: "active",
          health: "online",
          freshness: "fresh",
          last_contact_at: "2026-08-31T20:00:00.000Z",
          last_contact_age_ms: 1_000,
          stale_after_ms: 60_000,
          paired_at: "2026-08-31T19:00:00.000Z",
          environment_binding_id: "binding:private",
          binding_status: "active",
          adapter_admission_status: "active",
          room_id: "room:private",
          source_id: "source:private",
          world_id: "world:survival",
          domain_adapter: "minecraft.paper",
          capability_ids: ["minecraft.observe"],
          credential_status: "active",
          credential_expires_at: "2026-09-01T20:00:00.000Z",
          probe_ready: true,
          blocking_reasons: [],
          content_role: "device_health_observation_not_assistant_answer",
          credential_included: false,
          device_public_key_included: false,
          producer_epoch_included: false,
          answer_authority: false,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        }],
        content_role: "device_health_observations_not_assistant_answer",
        credential_included: false,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    render(<CasimirGuideOverlay open onClose={vi.fn()} onOpenPanel={onOpenPanel} />);
    fireEvent.click(screen.getByRole("tab", { name: "Environment" }));

    expect(await screen.findByText("World world:survival")).toBeTruthy();
    expect(screen.getByText("online · fresh · 1 capabilities")).toBeTruthy();
    expect(screen.getByText("No current actor/incarnation projected")).toBeTruthy();
    expect(screen.getByText("Follow-only C1 · live accepted")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Resident mode/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).not.toContain("device:private");
    expect(document.body.textContent).not.toContain("installation:private");

    fireEvent.click(screen.getByRole("button", { name: /Environment controls/ }));
    expect(onOpenPanel).toHaveBeenCalledWith("live-answer-environment");
  });

  it("projects bounded mission state and routes advanced inspection without Guide-side authority", async () => {
    const onOpenPanel = vi.fn();
    recordMissionGuideBinding(Symbol("overlay-test"), {
      controller_available: true,
      mission_id: "mission:guide-proof",
      context: {
        tier: "tier1",
        session_state: "active",
        voice_mode: "critical_only",
        mute_while_typing: true,
      },
    });
    vi.stubGlobal("fetch", vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      if (url === "/api/agi/environment-connectors/devices") {
        return new Response(JSON.stringify({
          schema: "helix.environment_connector.device_check_list.v1",
          generated_at: "2026-09-01T12:04:00.000Z",
          devices: [],
          content_role: "device_health_observations_not_assistant_answer",
          credential_included: false,
          answer_authority: false,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/events?limit=200&tail=1")) {
        return new Response(JSON.stringify({
          events: [{
            eventId: "event:secret",
            missionId: "mission:guide-proof",
            type: "action_required",
            classification: "critical",
            text: "Verify the current route",
            ts: "2026-09-01T12:03:00.000Z",
            evidenceRefs: ["evidence:secret"],
            certaintyClass: "reasoned",
            failReason: "route_verification_required",
            traceId: "trace:secret",
          }],
          nextCursor: null,
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === "/api/mission-board/mission%3Aguide-proof") {
        return new Response(JSON.stringify({ snapshot: {
          missionId: "mission:guide-proof",
          phase: "verify",
          status: "degraded",
          updatedAt: "2026-09-01T12:03:00.000Z",
          unresolvedCritical: 1,
          objectives: [{
            objectiveId: "objective:secret",
            title: "Confirm the solver route",
            status: "in_progress",
            updatedAt: "2026-09-01T12:02:00.000Z",
          }],
        } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    render(<CasimirGuideOverlay open onClose={vi.fn()} onOpenPanel={onOpenPanel} />);
    fireEvent.click(screen.getByRole("tab", { name: "Mission" }));

    expect(await screen.findByText("Confirm the solver route · in progress")).toBeTruthy();
    expect(screen.getByText("verify · degraded · unknown")).toBeTruthy();
    expect(screen.getByText("Verify the current route")).toBeTruthy();
    expect(screen.getByText("Certainty reasoned · fail route_verification_required · voice suppression none")).toBeTruthy();
    expect(screen.getByText("1 evidence refs · replay Available")).toBeTruthy();
    expect(screen.getByText("tier1 · active · critical_only")).toBeTruthy();
    expect(document.body.textContent).not.toContain("evidence:secret");
    expect(document.body.textContent).not.toContain("trace:secret");
    expect((screen.getByRole("button", { name: /Open Mission Go Board/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Mission voice state/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Task History/ }));
    expect(onOpenPanel).toHaveBeenCalledWith("agi-task-history");
  });

  it("admits signed-in user destinations while preserving available routes", async () => {
    mocks.policy = HELIX_USER_ACCOUNT_POLICY;
    const onOpenPanel = vi.fn();
    render(<CasimirGuideOverlay
      open
      onClose={vi.fn()}
      onOpenPanel={onOpenPanel}
      context={{ activePanelId: "docs-viewer", recentPanelIds: [], favoritePanelIds: [] }}
    />);

    const friends = screen.getByRole("button", { name: /Friends & Voice Parties/ }) as HTMLButtonElement;
    await waitFor(() => expect(friends.disabled).toBe(false));
    expect(mocks.list).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Environment" }));
    const device = screen.getByRole("button", { name: /Device Check/ }) as HTMLButtonElement;
    expect(device.disabled).toBe(false);
    fireEvent.click(device);
    expect(onOpenPanel).toHaveBeenCalledWith("device-check");
    fireEvent.click(screen.getByRole("tab", { name: "Workspace" }));
    const docs = screen.getByRole("button", { name: /Resume Docs & Papers/ }) as HTMLButtonElement;
    expect(docs.disabled).toBe(false);
  });

  it("moves between blades and enabled rows with directional keys", async () => {
    render(<CasimirGuideOverlay
      open
      onClose={vi.fn()}
      onOpenPanel={vi.fn()}
      context={{ activePanelId: "docs-viewer", recentPanelIds: [], favoritePanelIds: [] }}
    />);
    const dialog = screen.getByRole("dialog", { name: "Casimir Guide" });

    await waitFor(() => expect(document.activeElement?.textContent).toContain("Resume Docs & Papers"));
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toContain("Workstation Notes");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Live Room" }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(document.activeElement?.textContent).toContain("Friends online"));
  });

  it("projects the active panel first and adds safe context-specific shortcuts", async () => {
    const onOpenPanel = vi.fn();
    render(<CasimirGuideOverlay
      open
      onClose={vi.fn()}
      onOpenPanel={onOpenPanel}
      context={{ activePanelId: "docs-viewer", recentPanelIds: [], favoritePanelIds: [] }}
    />);

    expect(screen.getByRole("button", { name: /Resume Docs & Papers/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Workstation Notes/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Image Lens/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Workstation Notes/ }));
    expect(onOpenPanel).toHaveBeenCalledWith("workstation-notes");
  });

  it("limits nested recent projection to five and Escape backs out before closing", async () => {
    const onClose = vi.fn();
    render(<CasimirGuideOverlay
      open
      onClose={onClose}
      onOpenPanel={vi.fn()}
      context={{
        activePanelId: "docs-viewer",
        recentPanelIds: [
          "docs-viewer",
          "workstation-notes",
          "image-lens",
          "scientific-calculator",
          "agi-task-history",
          "workstation-process-graph",
        ],
        favoritePanelIds: [],
      }}
    />);

    fireEvent.click(screen.getByRole("tab", { name: "Workspace" }));
    fireEvent.click(screen.getByRole("button", { name: /Recent panels/ }));
    expect(document.querySelectorAll("[data-casimir-guide-row]")).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /Process Graph/ })).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("button", { name: /Recent panels/ })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("searches available panels while omitting named hidden panels", async () => {
    mocks.policy = HELIX_USER_ACCOUNT_POLICY;
    render(<CasimirGuideOverlay open onClose={vi.fn()} onOpenPanel={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Workspace" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "x" });
    const search = await screen.findByRole("searchbox", { name: "Search panels" });
    fireEvent.change(search, { target: { value: "code admin" } });
    expect(screen.queryByRole("button", { name: /Code Admin/ })).toBeNull();
    expect(screen.getByRole("button", { name: /No matching panels/ })).toBeTruthy();
    fireEvent.change(search, { target: { value: "star watcher" } });
    expect((screen.getByRole("button", { name: /Star Watcher/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(search, { target: { value: "taskbar" } });
    expect(screen.getByRole("button", { name: /No matching panels/ })).toBeTruthy();
  });

  it("omits Star Watcher from search when this account explicitly locks it", async () => {
    mocks.policy = {
      ...HELIX_USER_ACCOUNT_POLICY,
      locked_panels: [...HELIX_USER_ACCOUNT_POLICY.locked_panels, "star-watcher"],
    };
    render(<CasimirGuideOverlay open onClose={vi.fn()} onOpenPanel={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Workspace" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "x" });
    const search = await screen.findByRole("searchbox", { name: "Search panels" });
    fireEvent.change(search, { target: { value: "star watcher" } });
    expect(screen.queryByRole("button", { name: /Star Watcher/ })).toBeNull();
    expect(screen.getByRole("button", { name: /No matching panels/ })).toBeTruthy();
  });

  it("presents social refresh errors as an actionable failed row", async () => {
    mocks.list.mockRejectedValueOnce(new Error("offline"));
    render(<CasimirGuideOverlay open onClose={vi.fn()} onOpenPanel={vi.fn()} />);

    const friends = await screen.findByRole("button", { name: /Social status could not be refreshed/ });
    expect(friends.getAttribute("data-guide-row-state")).toBe("failed");
    expect((friends as HTMLButtonElement).disabled).toBe(false);
  });

  it("fails closed when the social endpoint rejects the account session", async () => {
    mocks.list.mockRejectedValueOnce({ status: 401 });
    render(<CasimirGuideOverlay open onClose={vi.fn()} onOpenPanel={vi.fn()} />);

    const friends = await screen.findByRole("button", { name: /requires an authenticated account session/ });
    expect(friends.getAttribute("data-guide-row-state")).toBe("locked");
    expect((friends as HTMLButtonElement).disabled).toBe(true);
  });

  it("traps focus, closes with Escape, and restores the exact prior element", async () => {
    const onClose = vi.fn();
    const renderHarness = (open: boolean) => (
      <>
        <button type="button" data-testid="guide-opener">Open</button>
        <CasimirGuideOverlay open={open} onClose={onClose} onOpenPanel={vi.fn()} />
      </>
    );
    const { rerender } = render(renderHarness(false));
    const opener = screen.getByTestId("guide-opener");
    opener.focus();
    rerender(renderHarness(true));

    await waitFor(() => expect(document.activeElement?.textContent).toContain("Friends & Voice Parties"));
    const closeButton = screen.getByRole("button", { name: "Close Casimir Guide" });
    closeButton.focus();
    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(document.activeElement?.textContent).toContain("Return to Workstation");

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(renderHarness(false));
    expect(document.activeElement).toBe(opener);
  });

  it("makes the advertised Y shortcut open the existing Main Menu", async () => {
    const onStart = vi.fn();
    const onClose = vi.fn();
    render(
      <>
        <button id="helix-start-button" type="button" onClick={onStart}>Start</button>
        <CasimirGuideOverlay open onClose={onClose} onOpenPanel={vi.fn()} />
      </>,
    );

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "y" });
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
  });
});
