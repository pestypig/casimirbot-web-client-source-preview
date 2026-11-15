// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupContractInbox } from "../SetupContractInbox";
import { clearPendingWorkstationGuidance, requestWorkstationGuidance } from
  "@/lib/workstation/workstationGuidance";
import { HELIX_WORKSTATION_GUIDANCE_EVENT } from "@/lib/workstation/workstationGuidance";
import { clearPendingExactRoomReviewNavigation,
  consumePendingExactRoomReviewNavigation } from
  "@/lib/workstation/exactRoomReviewNavigation";
import { createHash, webcrypto } from "node:crypto";
import { DESKTOP_MCP_TUNNEL_STATE_SCHEMA_VERSION } from "@shared/desktop-mcp-tunnel";
import { HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT } from
  "@/components/helix/ask-console/shared-live-room/SharedLiveRoomGuideProjection";
import { DESKTOP_AUTH0_ROOM_CONTROL_PATH } from "@shared/desktop-auth0-account-link";

const coordinationTunnel = {
  schemaVersion: DESKTOP_MCP_TUNNEL_STATE_SCHEMA_VERSION,
  transport: "openai_secure_mcp_tunnel" as const,
  access: "developer_private" as const,
  scope: "local_supervisor_coordination_and_device_check" as const,
  status: "ready" as const,
  configured: true, vaultAvailable: true, binaryVersion: "0.0.13",
  processRunning: true, healthy: true, ready: true, adminUiAvailable: true,
  failureCode: null,
  recovery: { phase: "idle" as const, attemptCount: 0, maxAttempts: 3,
    nextAttemptAt: null, lastReason: null,
    automaticScope: "local_supervisor_coordination_and_device_check" as const,
    manualInterventionRequired: false },
};
const fullTunnel = { ...coordinationTunnel, scope: "full_helix_agent" as const };
const activeDeveloperView = (profileRef: string, deviceRef: string) => ({
  phase: "active", profileRef, deviceRef, expiresAt: Date.now() + 60_000,
  nativeLease: { lastAcknowledgedAt: Date.now() },
});

const request = () => ({
  schema: "helix.setup_contract_request.v1" as const,
  connection_kind: "developer_tunnel" as const,
  request_id: "f2ea0f53-18d1-4f40-a62c-2ef6f98fe431",
  declared_task_summary: "Pair this task and stream selected activity",
  profile_ref: "profile:owner", installation_ref: "desktop:owner", task_ref: "task:exact",
  executable_sha256: "b".repeat(64),
  package_sha256: "c".repeat(64),
  mcp_client_ref_hash: createHash("sha256").update("client:exact").digest("hex"),
  scopes: [
    { branch: "task_pairing" as const, helix_chat_ref: "chat:exact" },
    { branch: "discord_stream" as const, destination_ref: "discord_session:33333333-3333-4333-8333-333333333333",
      source_refs: ["codex-thread:11111111-1111-4111-8111-111111111111"], selection_mode: "selected" as const,
      duration_hours: 1 as const },
  ],
  available_scopes: [
    { branch: "task_pairing" as const, helix_chat_ref: "chat:exact" },
    { branch: "discord_stream" as const, destination_ref: "discord_session:33333333-3333-4333-8333-333333333333",
      source_refs: ["codex-thread:11111111-1111-4111-8111-111111111111"], selection_mode: "selected" as const,
      duration_hours: 1 as const },
  ],
  requested_lease_seconds: 900, review_revision: "a".repeat(64),
  review_until_ms: Date.now() + 60_000, status: "pending_owner_review" as const,
  approval: null,
  facts: [],
  underlying_authority_granted: false as const, credential_included: false as const,
  private_endpoint_included: false as const, answer_authority: false as const,
  terminal_eligible: false as const,
});

afterEach(() => { cleanup(); clearPendingWorkstationGuidance();
  clearPendingExactRoomReviewNavigation(); window.sessionStorage.clear();
  vi.unstubAllGlobals(); delete window.casimirDesktop; });

describe("setup contract owner inbox", () => {
  it("stages only the approved hosted world and local room targets", async () => {
    const hostedRoomRef = "shared_realtime_room:44444444-4444-4444-8444-444444444444";
    const localRoomRef = "shared_realtime_room:55555555-5555-4555-8555-555555555555";
    const scope = { branch: "shared_room" as const,
      room_ref: hostedRoomRef, room_authority: "hosted" as const,
      source_ingress: { adapter: "minecraft.fabric" as const,
        mode: "read_only" as const, local_room_ref: localRoomRef,
        world_folder: "reviewed-world" } };
    const proposed = { ...request(), scopes: [scope], available_scopes: [scope],
      status: "approved" as const,
      approval: { receiptRef: "setup_contract_approval:fixture",
        approvedAtMs: Date.now(), expiresAtMs: Date.now() + 3_600_000,
        reviewedRevision: "a".repeat(64) } };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === DESKTOP_AUTH0_ROOM_CONTROL_PATH && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.operation === "source_preflight_reviewed") return {
          ok: true, status: 200, json: async () => ({ ok: true,
            status: "ready", room_id: hostedRoomRef,
            world_id: "world-fixture", credential_included: false,
            player_release_commands_available: false,
            player_release_profile_proofs_available: false }),
        };
        if (body.operation === "source_stage_reviewed") return {
          ok: true, status: 200, json: async () => ({ ok: true,
            status: "server_pairing_inbox_staged", room_id: hostedRoomRef,
            binding_id: "room_source_binding:fixture", world_id: "world-fixture",
            credential_included: false }),
        };
      }
      return { ok: true, status: 200,
        json: async () => ({ ok: true, requests: [proposed] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Check hosted source readiness" }));
    expect(await screen.findByText(/The hosted route accepts this exact reviewed world/))
      .toBeTruthy();
    expect(screen.getByText(/Per-player sharing is unavailable for this hosted room/))
      .toBeTruthy();
    const preflight = fetchMock.mock.calls.find(([url, init]) =>
      url === DESKTOP_AUTH0_ROOM_CONTROL_PATH && init?.method === "POST" &&
      JSON.parse(String(init.body)).operation === "source_preflight_reviewed");
    expect(JSON.parse(String(preflight?.[1]?.body))).toEqual({
      operation: "source_preflight_reviewed", contract_request_id: proposed.request_id,
      room_id: hostedRoomRef, local_room_id: localRoomRef,
    });
    fireEvent.click(screen.getByRole("button", { name: "Stage selected world source" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
      url === DESKTOP_AUTH0_ROOM_CONTROL_PATH && init?.method === "POST" &&
      JSON.parse(String(init.body)).operation === "source_stage_reviewed")).toBe(true));
    const stage = fetchMock.mock.calls.find(([url, init]) =>
      url === DESKTOP_AUTH0_ROOM_CONTROL_PATH && init?.method === "POST" &&
      JSON.parse(String(init.body)).operation === "source_stage_reviewed");
    expect(JSON.parse(String(stage?.[1]?.body))).toEqual({
      operation: "source_stage_reviewed", contract_request_id: proposed.request_id,
      room_id: hostedRoomRef, local_room_id: localRoomRef,
    });
    expect(await screen.findByText(/The reviewed read-only world source was staged/))
      .toBeTruthy();
    expect(screen.getByText(/Non-secret source binding: room_source_binding:fixture/))
      .toBeTruthy();
  });
  it("explains a changed source review before sending a stage request", async () => {
    const scope = { branch: "shared_room" as const,
      room_ref: "shared_realtime_room:44444444-4444-4444-8444-444444444444",
      room_authority: "hosted" as const,
      source_ingress: { adapter: "minecraft.fabric" as const,
        mode: "read_only" as const,
        local_room_ref: "shared_realtime_room:55555555-5555-4555-8555-555555555555",
        world_folder: "reviewed-world" } };
    const proposed = { ...request(), scopes: [scope], available_scopes: [scope],
      status: "approved" as const,
      approval: { receiptRef: "setup_contract_approval:fixture",
        approvedAtMs: Date.now(), expiresAtMs: Date.now() + 3_600_000,
        reviewedRevision: "b".repeat(64) } };
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Check hosted source readiness" }));
    expect(await screen.findByText(/Hosted source readiness was not checked \(source_review_revision_changed\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stage selected world source" }));
    expect(await screen.findByText(/World source staging was not started \(source_review_revision_changed\)/)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) =>
      url === DESKTOP_AUTH0_ROOM_CONTROL_PATH && init?.method === "POST" &&
      JSON.parse(String(init.body)).operation === "source_stage_reviewed")).toBe(false);
  });
  it("explains a hosted owner-node conflict without staging the world", async () => {
    const hostedRoomRef = "shared_realtime_room:44444444-4444-4444-8444-444444444444";
    const localRoomRef = "shared_realtime_room:55555555-5555-4555-8555-555555555555";
    const scope = { branch: "shared_room" as const,
      room_ref: hostedRoomRef, room_authority: "hosted" as const,
      source_ingress: { adapter: "minecraft.fabric" as const,
        mode: "read_only" as const, local_room_ref: localRoomRef,
        world_folder: "reviewed-world" } };
    const proposed = { ...request(), scopes: [scope], available_scopes: [scope],
      status: "approved" as const,
      approval: { receiptRef: "setup_contract_approval:fixture",
        approvedAtMs: Date.now(), expiresAtMs: Date.now() + 3_600_000,
        reviewedRevision: "a".repeat(64) } };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url === DESKTOP_AUTH0_ROOM_CONTROL_PATH && init?.method === "POST"
        ? { ok: false, status: 409,
          json: async () => ({ error: "room_owner_node_changed" }) }
        : { ok: true, status: 200,
          json: async () => ({ ok: true, requests: [proposed] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Check hosted source readiness" }));
    expect(await screen.findByText(/A live reservation will not be taken over/))
      .toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) =>
      url === DESKTOP_AUTH0_ROOM_CONTROL_PATH && init?.method === "POST" &&
      JSON.parse(String(init.body)).operation === "source_stage_reviewed")).toBe(false);
  });
  it("directs a source-scope denial to room reauthorization without staging", async () => {
    const scope = { branch: "shared_room" as const,
      room_ref: "shared_realtime_room:44444444-4444-4444-8444-444444444444",
      room_authority: "hosted" as const,
      source_ingress: { adapter: "minecraft.fabric" as const,
        mode: "read_only" as const,
        local_room_ref: "shared_realtime_room:55555555-5555-4555-8555-555555555555",
        world_folder: "reviewed-world" } };
    const proposed = { ...request(), scopes: [scope], available_scopes: [scope],
      status: "approved" as const,
      approval: { receiptRef: "setup_contract_approval:fixture",
        approvedAtMs: Date.now(), expiresAtMs: Date.now() + 3_600_000,
        reviewedRevision: "a".repeat(64) } };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url === DESKTOP_AUTH0_ROOM_CONTROL_PATH && init?.method === "POST"
        ? { ok: false, status: 403,
          json: async () => ({ error: "room_source_remote_insufficient_scope_http_403" }) }
        : { ok: true, status: 200,
          json: async () => ({ ok: true, requests: [proposed] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Check hosted source readiness" }));
    expect(await screen.findByText(/Reauthorize the room service in Rooms and approve the requested source scope/))
      .toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) =>
      url === DESKTOP_AUTH0_ROOM_CONTROL_PATH && init?.method === "POST" &&
      JSON.parse(String(init.body)).operation === "source_stage_reviewed")).toBe(false);
  });
  it("shows both hosted membership and local Fabric ingress targets in one review", async () => {
    const hostedRoomRef = "shared_realtime_room:44444444-4444-4444-8444-444444444444";
    const localRoomRef = "shared_realtime_room:55555555-5555-4555-8555-555555555555";
    const scope = { branch: "shared_room" as const,
      room_ref: hostedRoomRef, room_authority: "hosted" as const,
      source_ingress: { adapter: "minecraft.fabric" as const,
        mode: "read_only" as const, local_room_ref: localRoomRef,
        world_folder: "Fixture City - Hosted World" } };
    const proposed = { ...request(), scopes: [scope], available_scopes: [scope] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByText(`Hosted room membership: ${hostedRoomRef}`)).toBeTruthy();
    expect(screen.getByText(new RegExp(`in local room ${localRoomRef}`))).toBeTruthy();
  });
  it("shows the exact optional transcription budget and its inactive status before approval", async () => {
    const voice = { branch: "discord_voice" as const, mode: "gpt_live" as const,
      session_ref: "discord_session:33333333-3333-4333-8333-333333333333",
      application_id: "123456789012345678", guild_id: "123456789012345679",
      text_channel_id: "123456789012345680",
      voice_channel_id: "123456789012345681",
      commander_discord_user_id: "123456789012345682",
      room_ref: "shared_realtime_room:44444444-4444-4444-8444-444444444444",
      duration_seconds: 1_800,
      isolated_transcription: { model: "gpt-transcribe" as const,
        payer: "own_key" as const, max_calls: 12,
        max_provider_cost_micros: 50_000, duration_seconds: 600 } };
    const proposed = { ...request(), scopes: [voice], available_scopes: [voice] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByText(/at most 12 calls, 50000 provider-cost micros and 600 seconds/))
      .toBeTruthy();
    expect(screen.getByText(/This request is not active until the native budget/))
      .toBeTruthy();
  });
  it("loads seven planned purposes but shows only exact scopes as actionable", async () => {
    const plannedBranches = ["full_harness", "task_pairing", "shared_room",
      "room_ai_release", "discord_stream", "minecraft_player",
      "responses_session"] as const;
    const proposed = { ...request(), connection_kind: "personal_stdio" as const,
      scopes: [{ branch: "full_harness" as const },
        { branch: "task_pairing" as const, helix_chat_ref: "chat:exact" }],
      available_scopes: [{ branch: "full_harness" as const },
        { branch: "task_pairing" as const, helix_chat_ref: "chat:exact" }],
      planned_branches: plannedBranches,
      available_planned_branches: plannedBranches };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    render(<SetupContractInbox />);
    expect(await screen.findByText(/7 purpose\(s\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getAllByText(/no exact target or authority is bound yet/))
      .toHaveLength(5);
    expect(screen.getByRole("button", { name: "Approve exact scopes and save plan" }))
      .toBeTruthy();
  });

  it("waits for a slow owner read instead of superseding it on every poll", async () => {
    const proposed = request();
    const callbacks: Array<() => void> = [];
    vi.spyOn(window, "setInterval").mockImplementation((handler, delay) => {
      if (delay === 4_000 && typeof handler === "function") callbacks.push(handler);
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) }));
    vi.stubGlobal("fetch", fetchMock);
    let blockNextRead = false;
    let releaseRead: (() => void) | null = null;
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      getMcpTunnelState: vi.fn(async () => {
        if (blockNextRead) {
          blockNextRead = false;
          await new Promise<void>(resolve => { releaseRead = resolve; });
        }
        return coordinationTunnel;
      }) };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await waitFor(() => expect(callbacks.length).toBeGreaterThan(0));
    const ownerReads = () => fetchMock.mock.calls.filter(([url]) =>
      url === "/api/desktop/setup-contract/requests").length;
    blockNextRead = true;
    const before = ownerReads();
    await act(async () => { callbacks.forEach(callback => callback()); });
    expect(ownerReads()).toBe(before + 1);
    expect(releaseRead).not.toBeNull();
    await act(async () => { callbacks.forEach(callback => callback()); });
    expect(ownerReads()).toBe(before + 1);
    await act(async () => { releaseRead?.(); });
    await act(async () => { callbacks.forEach(callback => callback()); });
    expect(ownerReads()).toBe(before + 2);
    vi.restoreAllMocks();
  });
  it("shows and revokes selected scopes only on a verified private update", async () => {
    const prior = { ...request(), status: "approved" as const,
      scopes: [{ branch: "full_harness" as const }],
      available_scopes: [{ branch: "full_harness" as const }],
      verified_update_continuation: true,
      approval: { receiptRef: "setup_contract_approval:11111111-1111-4111-8111-111111111111",
        approvedAtMs: Date.now(), expiresAtMs: Date.now() + 86_400_000,
        reviewedRevision: "a".repeat(64), autoResumeFullHarness: true as const,
        autoResumeSelectedScopes: true as const } };
    let continuation: typeof prior | null = prior;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        continuation = null;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true,
        requests: [], selected_scope_continuation: continuation }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      getPrivateDevUpdateState: vi.fn(async () => ({ phase: "ready",
        profileSelected: true, runningBuild: "release-main-r241",
        selectedBuild: "release-main-r241" })),
      getMcpTunnelState: vi.fn(async () => fullTunnel),
      stopMcpTunnel: vi.fn(async () => coordinationTunnel) };
    render(<SetupContractInbox />);
    expect(await screen.findByText(
      "Selected-scope approval eligible across this verified private update")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revoke continued approval" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/desktop/setup-contract/selected-scope-continuation/revoke",
      expect.objectContaining({ method: "POST" })));
  });
  it("shows carried Full Harness approval and revokes it without a new review", async () => {
    const prior = { ...request(), status: "approved" as const,
      scopes: [{ branch: "full_harness" as const }],
      available_scopes: [{ branch: "full_harness" as const }],
      requested_lease_seconds: 86_400,
      approval: { receiptRef: "setup_contract_approval:11111111-1111-4111-8111-111111111111",
        approvedAtMs: Date.now(), expiresAtMs: Date.now() + 86_400_000,
        reviewedRevision: "a".repeat(64), autoResumeFullHarness: true as const } };
    let continuation: typeof prior | null = prior;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        continuation = null;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: true, status: 200,
        json: async () => ({ ok: true, requests: [], continuation }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const stopMcpTunnel = vi.fn(async () => coordinationTunnel);
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      getMcpTunnelState: vi.fn(async () => fullTunnel), stopMcpTunnel };
    render(<SetupContractInbox />);
    expect(await screen.findByText("Full Harness approval eligible across this private update"))
      .toBeTruthy();
    expect(screen.getByText(/Original receipt:/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revoke continued approval" }));
    await waitFor(() => expect(stopMcpTunnel).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByText(
      "Full Harness approval eligible across this private update")).toBeNull());
  });
  it("hides when the private owner endpoint is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 404, ok: false })));
    render(<SetupContractInbox />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText("Setup contracts")).toBeNull();
  });

  it("removes the request when the owner session loses access", async () => {
    const proposed = request();
    let unauthorized = false;
    vi.stubGlobal("fetch", vi.fn(async () => unauthorized
      ? { ok: false, status: 401 }
      : { ok: true, status: 200,
        json: async () => ({ ok: true, requests: [proposed] }) }));
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    unauthorized = true;
    act(() => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(screen.queryByText("Setup contracts")).toBeNull());
    expect(screen.queryByRole("dialog", { name: "Review CasimirBot setup contract" })).toBeNull();
  });

  it("keeps a request visible but suspends approval through a transient owner read failure", async () => {
    const proposed = request();
    let failRead = false;
    const fetchMock = vi.fn(async () => {
      if (failRead) throw new Error("temporary_service_read_failure");
      return { ok: true, status: 200,
        json: async () => ({ ok: true, requests: [proposed] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByRole("button", { name: "Approve selected setup scope" })
      .hasAttribute("disabled")).toBe(false);
    failRead = true;
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(await screen.findByRole("button", { name: "Retry owner read" })).toBeTruthy();
    expect(screen.getByText(/Approval is paused until this exact request is refreshed/)).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Review CasimirBot setup contract" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve selected setup scope" })
      .hasAttribute("disabled")).toBe(true);
    expect((screen.getByRole("checkbox", {
      name: "Share approved read-only activity to Discord",
    }) as HTMLInputElement).disabled).toBe(true);
    failRead = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry owner read" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve selected setup scope" })
      .hasAttribute("disabled")).toBe(false));
    expect(screen.queryByRole("button", { name: "Retry owner read" })).toBeNull();
  });

  it("shows exact proposed scopes and sends only the reviewed revision to owner approval", async () => {
    const proposed = request();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: true, status: 200,
        json: async () => ({ ok: true, request: { ...proposed, status: "approved",
          approval: { receiptRef: "setup_contract_approval:receipt", approvedAtMs: Date.now(),
            expiresAtMs: Date.now() + 900_000, reviewedRevision: proposed.review_revision } } }) };
      return { ok: true, status: 200, json: async () => ({ ok: true, requests: [proposed] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByText("chat:exact")).toBeTruthy();
    expect(screen.getByText("15 minutes after approval")).toBeTruthy();
    expect(screen.getByText("Review closes")).toBeTruthy();
    expect(screen.getByText(/Discord destination: discord_session:33333333-3333-4333-8333-333333333333/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve selected setup scope" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const [url, init] = fetchMock.mock.calls.find(([, post]) => post?.method === "POST")!;
    expect(url).toContain("/approve");
    expect(JSON.parse(init!.body as string)).toEqual({ expected_revision: proposed.review_revision });
    expect(await screen.findByText(/Setup intent approved\. Current grants are reused/)).toBeTruthy();
    expect(screen.getByText("Approved intent expires")).toBeTruthy();
  });

  it("shows durable approval while a selected native service check is still pending", async () => {
    const proposed = request();
    const approved = { ...proposed, status: "approved" as const,
      approval: { receiptRef: "setup_contract_approval:pending_native",
        approvedAtMs: Date.now(), expiresAtMs: Date.now() + 900_000,
        reviewedRevision: proposed.review_revision } };
    let current: typeof proposed | typeof approved = proposed;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (typeof _url === "string" &&
          _url.includes("reasoning-bindings/current") &&
          current.status === "approved") return new Promise<never>(() => {});
      if (init?.method === "POST") {
        current = approved;
        return { ok: true, status: 200,
          json: async () => ({ ok: true, request: approved }) };
      }
      return { ok: true, status: 200,
        json: async () => ({ ok: true, requests: [current] }) };
    }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      codexStreamGrants: vi.fn(async (value: any) =>
        value.operation === "list"
          ? { status: "ready", grants: [] }
          : new Promise<never>(() => {})) };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve selected setup scope" }));
    expect(await screen.findByText("Approved intent expires")).toBeTruthy();
    expect(await screen.findByText(/Setup intent approved\. Checking the selected services/))
      .toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approving…" })).toBeNull();
  });

  it("continues the approved Discord scope by granting only its exact read source", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const scope = request().scopes[1];
    if (scope.branch !== "discord_stream") throw new Error("test_discord_scope_missing");
    const proposed = { ...request(), scopes: [scope], available_scopes: [scope] };
    const approved = { ...proposed, status: "approved" as const,
      approval: { receiptRef: "setup_contract_approval:discord",
        approvedAtMs: Date.now(), expiresAtMs: Date.now() + 900_000,
        reviewedRevision: proposed.review_revision } };
    let current: typeof proposed | typeof approved = proposed;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        current = approved;
        return { ok: true, status: 200,
          json: async () => ({ ok: true, request: approved }) };
      }
      return { ok: true, status: 200,
        json: async () => ({ ok: true, requests: [current] }) };
    }));
    const sourceRef = scope.source_refs[0];
    const deviceRef = `desktop:${createHash("sha256")
      .update(proposed.installation_ref).digest("hex")}`;
    const roomId = "discord_personal_stream:33333333-3333-4333-8333-333333333333";
    let grantReady = false;
    const codexStreamGrants = vi.fn(async (value: any) => {
      if (value.operation === "list") return { status: "ready",
        profileRef: proposed.profile_ref, deviceRef,
        grants: grantReady ? [{ sourceRef, title: "Approved chat" }] : [] };
      if (value.operation === "grant-contract") {
        expect(value).toEqual({ operation: "grant-contract",
          requestId: proposed.request_id, sourceRef });
        grantReady = true;
        return { status: "ready", grant: { sourceRef, title: "Approved chat" } };
      }
      if (value.operation === "read") return { status: "ready", frame: {
        schema: "helix.codex_conversation_cloud_frame.v1",
        taskId: "11111111-1111-4111-8111-111111111111",
        helixConversationId: sourceRef, turns: [] } };
      if (value.operation === "resume-read") return { status: "ready", selection: null };
      if (value.operation === "resume-save") return { status: "ready",
        selection: value.selection };
      throw new Error("unexpected_native_grant_call");
    });
    const personalDiscordStream = vi.fn(async (value: any) => {
      const kind = value.operation.kind;
      const result = kind === "inspect" ? {
        schema: "helix.discord_stream_state.v1", room_id: roomId,
        destination: { guild_id: "123456789012345678",
          channel_id: "123456789012345679" },
        active: false, revision: 0, device_ref: null, selection: null,
        approval_expires_at: null, approval_duration_hours: null,
        approval_destination_matches_current: true,
      } : kind === "select" ? { revision: 1,
        approval_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        approval_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        approval_duration_hours: 1 } : { ok: true };
      return { status: "ready", receipt: { ok: true, result } };
    });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      codexStreamGrants, personalDiscordStream };
    const inbox = render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve selected setup scope" }));
    await waitFor(() => expect(codexStreamGrants).toHaveBeenCalledWith(expect.objectContaining({
      operation: "resume-save", roomId,
      selection: expect.objectContaining({ mode: "selected",
        sourceRefs: [sourceRef] }),
    })));
    expect(personalDiscordStream).toHaveBeenCalledWith(expect.objectContaining({
      operation: expect.objectContaining({ kind: "select",
        request: expect.objectContaining({ selection: { mode: "selected",
          source_refs: [sourceRef] } }) }),
    }));
    expect(personalDiscordStream).toHaveBeenCalledWith(expect.objectContaining({
      operation: expect.objectContaining({ kind: "stop" }),
    }));
    expect(personalDiscordStream.mock.calls.some(([value]) =>
      value.operation.kind === "publish")).toBe(false);
    expect(codexStreamGrants.mock.calls.filter(([value]) =>
      value.operation === "grant-contract")).toHaveLength(1);
    expect(await screen.findByText(/Discord source selection is approved and saved/)).toBeTruthy();
    expect(window.sessionStorage.getItem(
      `helix.setup_contract_pending_discord.v1:${proposed.request_id}:${proposed.review_revision}`))
      .toBeNull();
    const selectedCount = personalDiscordStream.mock.calls.filter(([value]) =>
      value.operation.kind === "select").length;
    inbox.unmount();
    render(<SetupContractInbox />);
    await waitFor(() => expect(screen.getByText("Setup contracts")).toBeTruthy());
    act(() => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(codexStreamGrants.mock.calls.filter(([value]) =>
      value.operation === "list").length).toBeGreaterThan(3));
    expect(personalDiscordStream.mock.calls.filter(([value]) =>
      value.operation.kind === "select")).toHaveLength(selectedCount);
  });

  it.each(["revoked", "expired"] as const)(
    "does not replay a pending Discord hint after the contract is %s", async status => {
      vi.stubGlobal("crypto", webcrypto);
      const original = request();
      const scope = original.scopes[1];
      if (scope.branch !== "discord_stream") throw new Error("test_discord_scope_missing");
      const now = Date.now();
      const stopped = { ...original, scopes: [scope], available_scopes: [scope],
        status: status === "revoked" ? "revoked" as const : "approved" as const,
        approval: { receiptRef: "setup_contract_approval:stopped",
          approvedAtMs: now - 900_000,
          expiresAtMs: status === "expired" ? now - 1 : now + 900_000,
          reviewedRevision: original.review_revision } };
      window.sessionStorage.setItem(
        `helix.setup_contract_pending_discord.v1:${original.request_id}:${original.review_revision}`,
        "1");
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
        json: async () => ({ ok: true, requests: [stopped] }) })));
      const codexStreamGrants = vi.fn(async (_request: unknown) => ({ status: "ready",
        profileRef: original.profile_ref,
        deviceRef: `desktop:${createHash("sha256")
          .update(original.installation_ref).digest("hex")}`,
        grants: [{ sourceRef: scope.source_refs[0], title: "Approved chat" }] }));
      const personalDiscordStream = vi.fn();
      window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
        codexStreamGrants, personalDiscordStream };
      render(<SetupContractInbox />);
      await waitFor(() => expect(codexStreamGrants).toHaveBeenCalledWith({ operation: "list" }));
      act(() => { window.dispatchEvent(new Event("focus")); });
      await waitFor(() => expect(codexStreamGrants.mock.calls.length).toBeGreaterThan(1));
      expect(personalDiscordStream).not.toHaveBeenCalled();
      expect(codexStreamGrants.mock.calls.some(([value]) =>
        (value as { operation?: string }).operation === "read" ||
        (value as { operation?: string }).operation === "resume-save")).toBe(false);
    });

  it("starts Full Harness from one approval only after a fresh native grant check", async () => {
    const proposed = { ...request(), scopes: [{ branch: "full_harness" as const }],
      available_scopes: [{ branch: "full_harness" as const }] };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? { ok: true, status: 200, json: async () => ({ ok: true,
          request: { ...proposed, status: "approved", approval: {
            receiptRef: "setup_contract_approval:receipt", approvedAtMs: Date.now(),
            expiresAtMs: Date.now() + 900_000, reviewedRevision: proposed.review_revision } } }) }
        : { ok: true, status: 200, json: async () => ({ ok: true, requests: [proposed] }) });
    vi.stubGlobal("fetch", fetchMock);
    const getMcpTunnelState = vi.fn(async () => coordinationTunnel);
    const localDeveloperAccess = vi.fn(async () =>
      activeDeveloperView(proposed.profile_ref, proposed.installation_ref));
    const startMcpTunnel = vi.fn(async () => fullTunnel);
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), getMcpTunnelState,
      localDeveloperAccess, startMcpTunnel };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByRole("checkbox", {
      name: "Start Full Harness on this developer installation",
    })).toBeTruthy();
    const approve = await screen.findByRole("button", { name: "Approve scope and start Full Harness" });
    expect(startMcpTunnel).not.toHaveBeenCalled();
    fireEvent.click(approve);
    await waitFor(() => expect(startMcpTunnel).toHaveBeenCalledTimes(1));
    expect(startMcpTunnel).toHaveBeenCalledWith({ scope: "full_helix_agent" });
    expect(localDeveloperAccess).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Full Harness is ready; other permissions remain separate/)).toBeTruthy();
  });

  it("reviews an ordinary local Full Harness intent without starting the developer tunnel", async () => {
    const proposed = { ...request(), connection_kind: "personal_stdio" as const,
      scopes: [{ branch: "full_harness" as const }],
      available_scopes: [{ branch: "full_harness" as const }],
      facts: [{ stepId: "personal_device_grant" as const,
        state: "satisfied" as const, observedAtMs: Date.now(),
        validUntilMs: Date.now() + 5_000, evidenceRef: "personal-mcp:current-owner-grant" },
        { stepId: "transport" as const,
          state: "satisfied" as const, observedAtMs: Date.now(),
          validUntilMs: Date.now() + 5_000,
          evidenceRef: "personal-mcp:current-local-listener" }] };
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? { ok: true, status: 200, json: async () => ({ ok: true,
          request: { ...proposed, status: "approved", approval: {
            receiptRef: "setup_contract_approval:personal", approvedAtMs: Date.now(),
            expiresAtMs: Date.now() + 900_000,
            reviewedRevision: proposed.review_revision } } }) }
        : { ok: true, status: 200, json: async () => ({ ok: true,
          requests: [proposed] }) }));
    const startMcpTunnel = vi.fn(async () => fullTunnel);
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      getMcpTunnelState: vi.fn(async () => coordinationTunnel),
      localDeveloperAccess: vi.fn(async () =>
        activeDeveloperView(proposed.profile_ref, proposed.installation_ref)),
      startMcpTunnel };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByText(/Use the approved local Codex connection/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Use local Codex Full Harness" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", {
      name: "Start Full Harness on this developer installation" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", {
      name: "Approve selected setup scope" }));
    expect(await screen.findByText(/personal Codex connection remains subject/)).toBeTruthy();
    expect(startMcpTunnel).not.toHaveBeenCalled();
  });

  it("shows all eight ordinary purposes and keeps voice separate from audio consent", async () => {
    const roomRef = "shared_realtime_room:44444444-4444-4444-8444-444444444444";
    const scopes = [
      { branch: "full_harness" as const },
      { branch: "task_pairing" as const, helix_chat_ref: "chat:exact" },
      { branch: "shared_room" as const, room_ref: roomRef, room_authority: "local" as const },
      { branch: "room_ai_release" as const, room_ref: roomRef,
        room_authority: "local" as const },
      { branch: "discord_stream" as const,
        destination_ref: "discord_session:33333333-3333-4333-8333-333333333333",
        source_refs: ["codex-thread:11111111-1111-4111-8111-111111111111"],
        selection_mode: "selected" as const, duration_hours: 1 as const },
      { branch: "discord_voice" as const, mode: "gpt_live" as const,
        session_ref: "discord_session:33333333-3333-4333-8333-333333333333",
        application_id: "123456789012345678", guild_id: "123456789012345679",
        text_channel_id: "123456789012345680",
        voice_channel_id: "123456789012345681",
        commander_discord_user_id: "123456789012345679",
        room_ref: roomRef, duration_seconds: 120 },
      { branch: "minecraft_player" as const, room_ref: roomRef,
        room_authority: "local" as const, environment_binding_ref: "environment:exact",
        player_ref: "player:exact", capability_ids: ["minecraft.player.look"],
        autonomy_mode: "approve_each" as const, manual_override_policy: "pause" as const,
        duration_seconds: 600 },
      { branch: "responses_session" as const, provider: "openai" as const,
        payer: "own_key" as const, max_provider_cost_micros: 50_000,
        duration_seconds: 600 },
    ];
    const proposed = { ...request(), connection_kind: "personal_stdio" as const,
      scopes, available_scopes: scopes };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      getMcpTunnelState: vi.fn(async () => coordinationTunnel) };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByText(/8 purpose\(s\)/)).toBeTruthy();
    const labels = ["Use local Codex Full Harness",
      "Pair this Codex task with one Helix chat", "Connect the selected room",
      "Review separate room AI consent", "Share approved read-only activity to Discord",
      "Invite Captain Keyes to the reviewed voice channel",
      "Review Minecraft player control: selected or full current catalog", "Enable bounded Responses decisions and observation monitoring"];
    for (const name of labels)
      expect((screen.getByRole("checkbox", { name }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button", { name: "Approve selected setup scope" })
      .hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/This approval does not release/)).toBeTruthy();
    expect(screen.getByText(/This room ID cannot approve AI access/)).toBeTruthy();
    expect(screen.getByText(/This scope permits a finite channel arm/))
      .toBeTruthy();
  });

  it("does not start Full Harness for an approved contract that omits it", async () => {
    const proposed = { ...request(),
      scopes: [{ branch: "task_pairing" as const, helix_chat_ref: "chat:exact" }],
      available_scopes: [{ branch: "task_pairing" as const, helix_chat_ref: "chat:exact" }],
    };
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? { ok: true, status: 200, json: async () => ({ ok: true,
          request: { ...proposed, status: "approved", approval: {
            receiptRef: "setup_contract_approval:pairing-only", approvedAtMs: Date.now(),
            expiresAtMs: Date.now() + 900_000, reviewedRevision: proposed.review_revision } } }) }
        : { ok: true, status: 200, json: async () => ({ ok: true, requests: [proposed] }) }));
    const getMcpTunnelState = vi.fn(async () => coordinationTunnel);
    const localDeveloperAccess = vi.fn(async () =>
      activeDeveloperView(proposed.profile_ref, proposed.installation_ref));
    const startMcpTunnel = vi.fn(async () => fullTunnel);
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), getMcpTunnelState,
      localDeveloperAccess, startMcpTunnel };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve selected setup scope" }));
    expect(await screen.findByText(/Setup intent approved\. Current grants are reused/)).toBeTruthy();
    expect(startMcpTunnel).not.toHaveBeenCalled();
  });

  it("respects an owner who removes Full Harness from a combined review", async () => {
    const scopes = [{ branch: "full_harness" as const },
      { branch: "task_pairing" as const, helix_chat_ref: "chat:exact" }];
    const original = { ...request(), scopes, available_scopes: scopes };
    let current: Omit<typeof original, "status" | "approval"> & {
      status: "pending_owner_review" | "approved";
      approval: null | { receiptRef: string; approvedAtMs: number;
        expiresAtMs: number; reviewedRevision: string };
    } = original;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/revise") && init?.method === "POST") {
        current = { ...original, scopes: [scopes[1]], review_revision: "d".repeat(64) };
        return { ok: true, status: 200, json: async () => ({ ok: true, request: current }) };
      }
      if (url.endsWith("/approve") && init?.method === "POST") {
        current = { ...current, status: "approved", approval: {
          receiptRef: "setup_contract_approval:without-transport", approvedAtMs: Date.now(),
          expiresAtMs: Date.now() + 900_000, reviewedRevision: current.review_revision,
        } };
        return { ok: true, status: 200, json: async () => ({ ok: true, request: current }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, requests: [current] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const startMcpTunnel = vi.fn(async () => fullTunnel);
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      getMcpTunnelState: vi.fn(async () => coordinationTunnel),
      localDeveloperAccess: vi.fn(async () =>
        activeDeveloperView(original.profile_ref, original.installation_ref)),
      startMcpTunnel };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("checkbox", {
      name: "Start Full Harness on this developer installation" }));
    const approve = await screen.findByRole("button", { name: "Approve selected setup scope" });
    fireEvent.click(approve);
    expect(await screen.findByText(/Setup intent approved\. Current grants are reused/)).toBeTruthy();
    expect(startMcpTunnel).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([url, init]) =>
      url.endsWith("/approve") && init?.method === "POST")).toHaveLength(1);
  });

  it("keeps approval separate when the fresh developer grant is inactive", async () => {
    const proposed = { ...request(), scopes: [{ branch: "full_harness" as const }],
      available_scopes: [{ branch: "full_harness" as const }] };
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? { ok: true, status: 200, json: async () => ({ ok: true,
          request: { ...proposed, status: "approved", approval: {
            receiptRef: "setup_contract_approval:receipt", approvedAtMs: Date.now(),
            expiresAtMs: Date.now() + 900_000, reviewedRevision: proposed.review_revision } } }) }
        : { ok: true, status: 200, json: async () => ({ ok: true, requests: [proposed] }) }));
    const localDeveloperAccess = vi.fn()
      .mockResolvedValueOnce(activeDeveloperView(proposed.profile_ref, proposed.installation_ref))
      .mockResolvedValueOnce({ phase: "inactive", profileRef: proposed.profile_ref,
        deviceRef: proposed.installation_ref, expiresAt: null,
        nativeLease: { lastAcknowledgedAt: null } });
    const startMcpTunnel = vi.fn(async () => fullTunnel);
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      getMcpTunnelState: vi.fn(async () => coordinationTunnel),
      localDeveloperAccess, startMcpTunnel };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve scope and start Full Harness" }));
    expect(await screen.findByText(/Setup intent approved\. Current grants are reused/)).toBeTruthy();
    expect(startMcpTunnel).not.toHaveBeenCalled();
  });

  it("rechecks an uncertain approval response before inviting another approval", async () => {
    const proposed = request();
    let current: unknown = proposed;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/approve") && init?.method === "POST") {
        current = { ...proposed, status: "approved" as const,
          approval: { receiptRef: "setup_contract_approval:recovered",
            approvedAtMs: Date.now(), expiresAtMs: Date.now() + 900_000,
            reviewedRevision: proposed.review_revision } };
        throw new Error("reply_lost_after_commit");
      }
      return { ok: true, status: 200,
        json: async () => ({ ok: true, requests: [current] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve selected setup scope" }));
    expect(await screen.findByText(/approval confirmed after rechecking this exact request/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve selected setup scope" }).hasAttribute("disabled"))
      .toBe(true);
    expect((screen.getByRole("checkbox", {
      name: "Share approved read-only activity to Discord" }) as HTMLInputElement).disabled)
      .toBe(true);
    expect(fetchMock.mock.calls.filter(([url, init]) =>
      url.includes("/approve") && init?.method === "POST")).toHaveLength(1);
  });

  it("cancels a pending request from its popup without invoking a grant control", async () => {
    const proposed = request();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? { ok: true, status: 200, json: async () => ({ ok: true,
          request: { ...proposed, status: "revoked" } }) }
        : { ok: true, status: 200, json: async () => ({ ok: true, requests: [proposed] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel setup request" }));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancel setup request" }));
    await waitFor(() => expect(screen.getByText("This setup request is revoked.",
      { exact: false })).toBeTruthy());
    const writes = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain(`/requests/${proposed.request_id}/revoke`);
    expect(JSON.parse(writes[0][1]!.body as string)).toEqual({});
  });

  it("shows a terminal request when its approval expires between owner reads", async () => {
    const proposed = request();
    const stale = { ...proposed, status: "approved" as const,
      approval: { receiptRef: "setup_contract_approval:expired",
        approvedAtMs: Date.now() - 901_000, expiresAtMs: Date.now() - 1,
        reviewedRevision: proposed.review_revision } };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [stale] }) })));
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByText("This setup request is expired.", { exact: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve selected setup scope" })
      .hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByRole("button", { name: "Open this step" }).length)
      .toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Revoke setup intent" })).toBeNull();
  });

  it("can restore an originally proposed purpose in the same owner review", async () => {
    const original = request();
    let current = original;
    const revisions: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(init.body as string) as {
          expected_revision: string; selected_branches: string[] };
        revisions.push(body.expected_revision);
        current = { ...current,
          scopes: original.available_scopes.filter(scope =>
            body.selected_branches.includes(scope.branch)),
          review_revision: revisions.length.toString().repeat(64),
        };
        return { ok: true, status: 200,
          json: async () => ({ ok: true, request: current }) };
      }
      return { ok: true, status: 200,
        json: async () => ({ ok: true, requests: [current] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    const discord = () => screen.getByRole("checkbox", {
      name: "Share approved read-only activity to Discord" }) as HTMLInputElement;
    fireEvent.click(discord());
    await waitFor(() => expect(discord().checked).toBe(false));
    expect(discord().disabled).toBe(false);
    fireEvent.click(discord());
    await waitFor(() => expect(discord().checked).toBe(true));
    expect(screen.getByText(/Discord destination: discord_session:33333333-3333-4333-8333-333333333333/)).toBeTruthy();
    expect(revisions).toEqual([original.review_revision, "1".repeat(64)]);
  });

  it("reads the exact personal Discord destination and active approved snapshot", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const sourceRef = "codex-thread:11111111-1111-4111-8111-111111111111";
    const sessionId = "discord_session:11111111-1111-4111-8111-111111111111";
    const streamId = "discord_personal_stream:11111111-1111-4111-8111-111111111111";
    const streamScope = { branch: "discord_stream" as const,
      destination_ref: sessionId, source_refs: [sourceRef],
      selection_mode: "selected" as const, duration_hours: 1 as const };
    const proposed = { ...request(), scopes: [streamScope],
      available_scopes: [streamScope] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    const personalDiscordStream = vi.fn(async () => ({ status: "ready",
      receipt: { ok: true, result: {
        schema: "helix.discord_stream_state.v1", room_id: streamId,
        destination: { guild_id: "111111111111111111", channel_id: "222222222222222222" },
        active: true, revision: 2,
        device_ref: `desktop:${createHash("sha256").update(proposed.installation_ref).digest("hex")}`,
        selection: { mode: "selected", source_refs: [sourceRef] },
        approval_expires_at: new Date(Date.now() + 60_000).toISOString(),
        approval_duration_hours: 1,
        approval_destination_matches_current: true, last_delivery: null,
      } } }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), personalDiscordStream };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await waitFor(() => expect(personalDiscordStream).toHaveBeenCalledWith({
      session_id: sessionId, operation: { kind: "inspect" },
    }));
    await waitFor(() => expect(screen.getByText("Approve the Discord source snapshot")
      .closest("li")?.textContent).toContain("Current"));
    expect(screen.getByText("Select the linked Discord destination")
      .closest("li")?.textContent).toContain("Current");
    expect(screen.getByText("Verify a delivered Discord post on this stream")
      .closest("li")?.textContent).toContain("Not verified");
  });

  it("shows a fixed hosted Discord channel prerequisite from owner inspection", async () => {
    const streamScope = { branch: "discord_stream" as const,
      destination_ref: "shared_realtime_room:setup-exact",
      source_refs: ["codex-thread:11111111-1111-4111-8111-111111111111"],
      selection_mode: "selected" as const, duration_hours: 1 as const };
    const proposed = { ...request(), scopes: [streamScope],
      available_scopes: [streamScope] };
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? { ok: false, status: 409, json: async () => ({ error: "room_forbidden",
          message: "discord_stream_channel_not_bound" }) }
        : { ok: true, status: 200,
          json: async () => ({ ok: true, requests: [proposed] }) }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn() };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await waitFor(() => expect(screen.getByText("Select the linked Discord destination")
      .closest("li")?.textContent).toContain("discord_stream_channel_not_bound"));
  });

  it("binds a reviewed Responses scope to the exact native budget without another dialog", async () => {
    const scope = { branch: "responses_session" as const, provider: "openai" as const,
      payer: "own_key" as const, max_provider_cost_micros: 50_000,
      duration_seconds: 600 };
    const proposed = { ...request(), scopes: [scope], available_scopes: [scope] };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? { ok: true, status: 200, json: async () => ({ ok: true,
          request: { ...proposed, status: "approved", approval: {
            receiptRef: "setup_contract_approval:receipt", approvedAtMs: Date.now(),
            expiresAtMs: Date.now() + 900_000,
            reviewedRevision: proposed.review_revision } } }) }
        : { ok: true, status: 200,
          json: async () => ({ ok: true, requests: [proposed] }) });
    vi.stubGlobal("fetch", fetchMock);
    const responsesActionSession = vi.fn(async (action: string) => action === "approveContract"
      ? { status: "approved" as const, contractRequestId: proposed.request_id,
        costBudget: { maximumMicros: 50_000, settledMicros: 0, heldMicros: 0,
          remainingMicros: 50_000, blocked: false, rateRevision: "test" } }
      : { status: "inactive" as const });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), responsesActionSession };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve selected setup scope" }));
    await waitFor(() => expect(responsesActionSession)
      .toHaveBeenCalledWith("approveContract", proposed.request_id));
    expect(await screen.findByText(/native Responses budget is active for this exact contract/))
      .toBeTruthy();
  });

  it("continues one approved Responses budget when the saved key becomes ready later", async () => {
    const scope = { branch: "responses_session" as const, provider: "openai" as const,
      payer: "own_key" as const, max_provider_cost_micros: 50_000,
      duration_seconds: 600 };
    const proposed = { ...request(), scopes: [scope], available_scopes: [scope] };
    const approved = { ...proposed, status: "approved" as const,
      approval: { receiptRef: "setup_contract_approval:responses",
        approvedAtMs: Date.now(), expiresAtMs: Date.now() + 900_000,
        reviewedRevision: proposed.review_revision } };
    let current: typeof proposed | typeof approved = proposed;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        current = approved;
        return { ok: true, status: 200, json: async () => ({ ok: true, request: approved }) };
      }
      return { ok: true, status: 200,
        json: async () => ({ ok: true, requests: [current] }) };
    }));
    let keyReady = false;
    const responsesActionSession = vi.fn(async (action: string) => action === "state"
      ? { status: "inactive" as const, profileRef: proposed.profile_ref,
        allowanceKind: null, active: false, kind: null, model: null,
        remainingCalls: 0, maxCalls: 0, expiresAt: null,
        contractRequestId: null, costBudget: null, providerConfigured: keyReady }
      : keyReady
        ? { status: "approved" as const, contractRequestId: proposed.request_id,
          costBudget: { maximumMicros: 50_000, settledMicros: 0, heldMicros: 0,
            remainingMicros: 50_000, blocked: false, rateRevision: "test" } }
        : { status: "not_ready" as const });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      getMcpTunnelState: vi.fn(async () => fullTunnel), responsesActionSession };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve selected setup scope" }));
    await waitFor(() => expect(responsesActionSession.mock.calls.filter(([action]) =>
      action === "approveContract")).toHaveLength(1));
    keyReady = true;
    act(() => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(responsesActionSession.mock.calls.filter(([action]) =>
      action === "approveContract")).toHaveLength(2));
    expect(await screen.findByText(/native Responses budget is active for this exact contract/))
      .toBeTruthy();
    expect(window.sessionStorage.getItem(
      `helix.setup_contract_pending_responses.v1:${proposed.request_id}:${proposed.review_revision}`))
      .toBeNull();
  });

  it("continues a personal own-key budget without the developer tunnel", async () => {
    const scope = { branch: "responses_session" as const, provider: "openai" as const,
      payer: "own_key" as const, max_provider_cost_micros: 50_000,
      duration_seconds: 600 };
    const proposed = { ...request(), connection_kind: "personal_stdio" as const,
      scopes: [scope], available_scopes: [scope] };
    const approved = { ...proposed, status: "approved" as const,
      approval: { receiptRef: "setup_contract_approval:personal-responses",
        approvedAtMs: Date.now(), expiresAtMs: Date.now() + 900_000,
        reviewedRevision: proposed.review_revision } };
    let current: typeof proposed | typeof approved = proposed;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        current = approved;
        return { ok: true, status: 200, json: async () => ({ ok: true, request: approved }) };
      }
      return { ok: true, status: 200,
        json: async () => ({ ok: true, requests: [current] }) };
    }));
    let keyReady = false;
    const responsesActionSession = vi.fn(async (action: string) => action === "state"
      ? { status: "inactive" as const, profileRef: proposed.profile_ref,
        allowanceKind: null, active: false, kind: null, model: null,
        remainingCalls: 0, maxCalls: 0, expiresAt: null,
        contractRequestId: null, costBudget: null, providerConfigured: keyReady }
      : keyReady
        ? { status: "approved" as const, contractRequestId: proposed.request_id,
          costBudget: { maximumMicros: 50_000, settledMicros: 0, heldMicros: 0,
            remainingMicros: 50_000, blocked: false, rateRevision: "test" } }
        : { status: "not_ready" as const });
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(),
      getMcpTunnelState: vi.fn(async () => coordinationTunnel), responsesActionSession };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve selected setup scope" }));
    await waitFor(() => expect(responsesActionSession.mock.calls.filter(([action]) =>
      action === "approveContract")).toHaveLength(1));
    expect(await screen.findByText(/waiting for current Codex task presence/)).toBeTruthy();
    keyReady = true;
    act(() => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(responsesActionSession.mock.calls.filter(([action]) =>
      action === "approveContract")).toHaveLength(2));
    expect(await screen.findByText(/native Responses budget is active for this exact contract/))
      .toBeTruthy();
  });

  it("shows a native Responses allowance without claiming the requested cost budget", async () => {
    const scope = { branch: "responses_session" as const, provider: "openai" as const,
      payer: "own_key" as const, max_provider_cost_micros: 1_000_000,
      duration_seconds: 600 };
    const proposed = { ...request(), scopes: [scope], available_scopes: [scope] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    const responsesActionSession = vi.fn(async () => ({ status: "active" as const,
      profileRef: proposed.profile_ref, allowanceKind: "development_session" as const,
      active: true, kind: "development_session" as const, model: "gpt-4o-mini",
      remainingCalls: 4_999, maxCalls: 5_000,
      expiresAt: new Date(Date.now() + 60_000).toISOString() }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), responsesActionSession };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await waitFor(() => expect(responsesActionSession).toHaveBeenCalledWith("state"));
    await waitFor(() => expect(screen.getByText("Inspect the native Responses allowance")
      .closest("li")?.textContent).toContain("Current"));
    expect(screen.getByText("Approve the bounded Responses operation budget")
      .closest("li")?.textContent).toContain("Blocked");
    expect(screen.getByText("Verify the bounded Responses session")
      .closest("li")?.textContent).toContain("Not verified");
    expect(screen.getByText(/cannot enforce this request's cost cap/)).toBeTruthy();
  });

  it("does not infer USB developer access from the remembered signed-in profile", async () => {
    const proposed = request();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => null),
      localDeveloperAccess: vi.fn(async () => ({ phase: "inactive",
        profileRef: proposed.profile_ref, deviceRef: proposed.installation_ref, expiresAt: null,
        nativeLease: { lastAcknowledgedAt: null } })) };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    const developerStep = screen.getByText("Activate the local developer grant if required")
      .closest("li");
    expect(developerStep?.textContent).toContain("Needs your action");
    expect(screen.getByText("Sign in to the intended CasimirBot profile")
      .closest("li")?.textContent).toContain("Current");
  });

  it("opens only the exact request named by a native presentation", async () => {
    const proposed = request();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    render(<SetupContractInbox />);
    await screen.findByRole("button", { name: "Review" });
    act(() => requestWorkstationGuidance({ kind: "user_attention", panelId: "agent-access",
      targetId: "setup-contract-review:11111111-1111-4111-8111-111111111111",
      label: "Review setup contract" }));
    expect(await screen.findByText(/presented setup request is no longer available/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => requestWorkstationGuidance({ kind: "user_attention", panelId: "agent-access",
      targetId: `setup-contract-review:${proposed.request_id}`,
      label: "Review setup contract" }));
    expect(await screen.findByRole("dialog", { name: "Review CasimirBot setup contract" })).toBeTruthy();
    expect(screen.getByText("task:exact")).toBeTruthy();
  });

  it("opens the Discord owner control from the contract step", async () => {
    const proposed = request();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    const observed = vi.fn();
    window.addEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, observed);
    try {
      render(<SetupContractInbox />);
      fireEvent.click(await screen.findByRole("button", { name: "Review" }));
      const step = screen.getByText("Grant read access to exact local Codex chats").closest("li");
      fireEvent.click(step!.querySelector("button")!);
      expect(observed).toHaveBeenCalledWith(expect.objectContaining({
        detail: expect.objectContaining({ panelId: "helix-ask",
          targetId: "discord-stream-controls" }),
      }));
    } finally { window.removeEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, observed); }
  });

  it("navigates to the exact hosted Discord destination in the EXE", async () => {
    const hostedRoom = "shared_realtime_room:66666666-6666-4666-8666-666666666666";
    const scopes = [
      { branch: "shared_room" as const,
        room_ref: "shared_realtime_room:44444444-4444-4444-8444-444444444444",
        room_authority: "local" as const },
      { branch: "discord_stream" as const, destination_ref: hostedRoom,
        source_refs: ["codex-thread:11111111-1111-4111-8111-111111111111"],
        selection_mode: "selected" as const, duration_hours: 1 as const },
    ];
    const proposed = { ...request(), scopes, available_scopes: scopes };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }),
    })));
    const openRoomService = vi.fn(async () => ({ opened: true }));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => null),
      openRoomService };
    const observed = vi.fn();
    window.addEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, observed);
    try {
      render(<SetupContractInbox />);
      fireEvent.click(await screen.findByRole("button", { name: "Review" }));
      const step = screen.getByText("Select the linked Discord destination").closest("li");
      fireEvent.click(step!.querySelector("button")!);
      expect(observed).toHaveBeenCalledWith(expect.objectContaining({
        detail: { hostedRoomId: hostedRoom },
      }));
      expect(openRoomService).not.toHaveBeenCalled();
    } finally { window.removeEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, observed); }
  });

  it("points the USB action at its owning account control", async () => {
    const proposed = request();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    const observed = vi.fn();
    window.addEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, observed);
    try {
      render(<SetupContractInbox />);
      fireEvent.click(await screen.findByRole("button", { name: "Review" }));
      const step = screen.getByText("Activate the local developer grant if required").closest("li");
      fireEvent.click(step!.querySelector("button")!);
      expect(observed).toHaveBeenCalledWith(expect.objectContaining({
        detail: expect.objectContaining({ panelId: "account-session",
          targetId: "local-developer-usb-access" }),
      }));
    } finally { window.removeEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, observed); }
  });

  it("routes bounded Minecraft player review to Party Chat, not Device Check", async () => {
    const scope = { branch: "minecraft_player" as const,
      room_ref: "shared_realtime_room:mc", environment_binding_ref: "environment:mc",
      player_ref: "environment_subject_binding:mc",
      capability_ids: ["minecraft.player.look"], autonomy_mode: "approve_each" as const,
      manual_override_policy: "pause" as const, duration_seconds: 600 };
    const proposed = { ...request(), scopes: [scope], available_scopes: [scope] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    const observed = vi.fn();
    window.addEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, observed);
    try {
      render(<SetupContractInbox />);
      fireEvent.click(await screen.findByRole("button", { name: "Review" }));
      const step = screen.getByText("Select the exact world and player").closest("li");
      fireEvent.click(step!.querySelector("button")!);
      expect(observed).toHaveBeenCalledWith(expect.objectContaining({
        detail: expect.objectContaining({ panelId: "helix-ask",
          controlId: "helix.ask.shared_live_room.open_dialog" }),
      }));
      expect(consumePendingExactRoomReviewNavigation()).toEqual({
        roomId: scope.room_ref, environmentBindingId: scope.environment_binding_ref,
      });
    } finally { window.removeEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, observed); }
  });

  it("opens exact shared-room membership review without joining automatically", async () => {
    const scope = { branch: "shared_room" as const,
      room_ref: "shared_realtime_room:membership" };
    const proposed = { ...request(), scopes: [scope], available_scopes: [scope] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    const observed = vi.fn();
    window.addEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, observed);
    try {
      render(<SetupContractInbox />);
      fireEvent.click(await screen.findByRole("button", { name: "Review" }));
      const step = screen.getByText("Select and join the exact room").closest("li");
      fireEvent.click(step!.querySelector("button")!);
      expect(observed).toHaveBeenCalledWith(expect.objectContaining({
        detail: expect.objectContaining({ panelId: "helix-ask",
          controlId: "helix.ask.shared_live_room.open_dialog" }),
      }));
      expect(consumePendingExactRoomReviewNavigation()).toEqual({ roomId: scope.room_ref });
    } finally { window.removeEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, observed); }
  });

  it("returns to the same exact contract after opening an owning panel", async () => {
    const proposed = request();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    const first = render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    const step = screen.getByText("Grant read access to exact local Codex chats").closest("li");
    fireEvent.click(step!.querySelector("button")!);
    first.unmount();
    expect(window.sessionStorage.getItem("helix.setup_contract_resume_request.v1"))
      .toBe(proposed.request_id);
    render(<SetupContractInbox />);
    expect(await screen.findByRole("dialog", { name: "Review CasimirBot setup contract" }))
      .toBeTruthy();
    expect(window.sessionStorage.getItem("helix.setup_contract_resume_request.v1"))
      .toBeNull();
  });

  it("marks only an exact native chat read grant current", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const proposed = request();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ ok: true, requests: [proposed] }) })));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(async () => null),
      codexStreamGrants: vi.fn(async () => ({ status: "ready",
        profileRef: proposed.profile_ref,
        deviceRef: `desktop:${createHash("sha256").update(proposed.installation_ref).digest("hex")}`,
        grants: [{ sourceRef: "codex-thread:11111111-1111-4111-8111-111111111111" }] })) };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByText("Grant read access to exact local Codex chats")
      .closest("li")?.textContent).toContain("Current");
    expect(screen.getByText("Approve the Discord source snapshot")
      .closest("li")?.textContent).toContain("Not verified");
  });

  it("reuses a fresh durable owner binding only for this declared task and chat", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const proposed = request();
    const binding = {
      schema: "helix.reasoning_task_binding.v1", reasoning_binding_id: "reasoning_binding:exact",
      pairing_id: "pairing:exact", binding_epoch: 1, status: "active",
      service_instance_ref: "service:exact", authenticated_profile_ref: proposed.profile_ref,
      authenticated_mcp_client_ref: "client:exact", client_session_ref: "session:exact",
      provider_thread_ref_hash: createHash("sha256").update(proposed.task_ref).digest("hex"),
      helix_conversation_id: "chat:exact", mission_id: null, run_id: null,
      reasoning_role: "principal", continuation_transport: "polling",
      negotiated_observability_level: "continuation_ready", created_by: "signed_in_operator",
      created_at: new Date(Date.now() - 60_000).toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      claimed_at: new Date(Date.now() - 59_000).toISOString(), revoked_at: null,
      provider_thread_content_included: false, hidden_reasoning_included: false,
      execution_authority: false, evidence_authority: false, answer_authority: false,
      terminal_eligible: false,
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("reasoning-bindings/current")
      ? { ok: true, status: 200, json: async () => ({ ok: true, binding }) }
      : { ok: true, status: 200, json: async () => ({ ok: true, requests: [proposed] }) }));
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await waitFor(() => expect(screen.getByText("Verify the runtime binding")
      .closest("li")?.textContent).toContain("Current"));
    expect(screen.getByText("Review the exact task and Helix chat invitation")
      .closest("li")?.textContent).toContain("Current");
  });

  it("reads the selected Minecraft lease without inferring connector readiness", async () => {
    const proposed = { ...request(), scopes: [{ branch: "minecraft_player" as const,
      room_ref: "shared_realtime_room:mc", environment_binding_ref: "environment:mc",
      player_ref: "environment_subject_binding:mc",
      capability_ids: ["minecraft.player.look"], autonomy_mode: "approve_each" as const,
      manual_override_policy: "pause" as const, duration_seconds: 600 }] };
    const now = Date.now();
    const authority = {
      schema: "helix.environment_action.authority.v1",
      action_authority_id: "environment_action_authority:mc",
      environment_binding_id: "environment:mc", room_source_binding_id: "room_source_binding:mc",
      room_id: "shared_realtime_room:mc", source_id: "source:mc", world_id: "world:mc",
      adapter_profile_id: "game.minecraft.player.fabric.v1",
      domain_adapter: "minecraft.fabric_client.v1", participant_id: "participant:owner",
      subject_binding_id: "environment_subject_binding:mc",
      allowed_capability_ids: ["minecraft.player.look"], autonomy_mode: "approve_each",
      manual_override_policy: "pause", status: "active", policy_version: 1,
      issued_at: new Date(now - 60_000).toISOString(),
      expires_at: new Date(now + 300_000).toISOString(), revoked_at: null,
      credential_included: false,
      content_role: "environment_action_authority_not_assistant_answer",
      answer_authority: false, assistant_answer: false, terminal_eligible: false,
      raw_content_included: false,
    };
    const fetchMock = vi.fn(async (url: string) => url.includes("/action-authorities")
      ? { ok: true, status: 200, json: async () => ({
        schema: "helix.environment_action.authority_receipt.v1", ok: true,
        authorities: [authority], connector_readiness: [] }) }
      : { ok: true, status: 200, json: async () => ({ ok: true, requests: [proposed] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await waitFor(() => expect(screen.getByText("Approve bounded player capabilities and duration")
      .closest("li")?.textContent).toContain("Current"));
    expect(screen.getByText("Check the installed Minecraft connector")
      .closest("li")?.textContent).toContain("Not verified");
    expect(fetchMock.mock.calls.some(([url]) => url ===
      "/api/agi/realtime/rooms/shared_realtime_room%3Amc/environments/environment%3Amc/action-authorities"))
      .toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url ===
      "/api/agi/realtime/rooms/shared_realtime_room%3Amc/environments/environment%3Amc/subjects"))
      .toBe(true);
    expect(screen.getByText("Verify fresh connector and player readiness")
      .closest("li")?.textContent).toContain("Not verified");
  });

  it("shows current room authorization without implying membership", async () => {
    const proposed = { ...request(), scopes: [{ branch: "shared_room" as const,
      room_ref: "shared_realtime_room:exact" }] };
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => url.endsWith("/rooms/status")
      ? { ok: true, status: 200, json: async () => ({
        schema: "casimir_desktop_room_connection_status/1", profile_ref: proposed.profile_ref,
        configured: true, ready: true, authority: "https://rooms.example.invalid",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        bearer_included: false, subject_included: false }) }
      : { ok: true, status: 200, json: async () => ({ ok: true, requests: [proposed] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await waitFor(() => expect(screen.getByText("Authorize the selected room service")
      .closest("li")?.textContent).toContain("Current"));
    expect(screen.getByText("Select and join the exact room")
      .closest("li")?.textContent).toContain("Not verified");
  });

  it("starts missing room authorization from the approved contract and keeps the review open", async () => {
    const scope = { branch: "shared_room" as const,
      room_ref: "shared_realtime_room:exact" };
    const original = request();
    const proposed = { ...original, scopes: [scope], available_scopes: [scope],
      status: "approved" as const,
      approval: { receiptRef: "setup_contract_approval:room", approvedAtMs: Date.now(),
        expiresAtMs: Date.now() + 900_000, reviewedRevision: original.review_revision } };
    const authorizationUrl = "https://login.example.invalid/authorize?state=exact";
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url.endsWith("/rooms/status")
        ? { ok: true, status: 200, json: async () => ({
          schema: "casimir_desktop_room_connection_status/1", profile_ref: proposed.profile_ref,
          configured: true, ready: false, authority: "https://rooms.example.invalid",
          expires_at: null, bearer_included: false, subject_included: false }) }
        : url.endsWith("/program/start") && init?.method === "POST"
          ? { ok: true, status: 200, json: async () => ({
            schema: "casimir_desktop_auth0_account_link_start/1", ok: true,
            authorization_purpose: "shared_live_rooms", authorization_url: authorizationUrl,
            expires_at: new Date(Date.now() + 600_000).toISOString(), provider: "auth0",
            pkce: "S256", client_secret_used: false, bearer_included: false,
            subject_included: false }) }
          : { ok: true, status: 200, json: async () => ({ ok: true, requests: [proposed] }) });
    vi.stubGlobal("fetch", fetchMock);
    const openAuth0AccountLink = vi.fn(async () => undefined);
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), openAuth0AccountLink };
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await waitFor(() => expect(screen.getByText("Authorize the selected room service")
      .closest("li")?.textContent).toContain("Needs your action"));
    const row = screen.getByText("Authorize the selected room service").closest("li")!;
    fireEvent.click(row.querySelector("button")!);
    await waitFor(() => expect(openAuth0AccountLink).toHaveBeenCalledWith(authorizationUrl));
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith("/program/start") &&
      init?.method === "POST" && JSON.parse(init.body as string).request_id === proposed.request_id)).toBe(true);
    expect(screen.getByRole("dialog", { name: "Review CasimirBot setup contract" })).toBeTruthy();
    expect(await screen.findByText(/Complete room authorization in your browser/)).toBeTruthy();
  });

  it("marks membership only after the exact native room inspect", async () => {
    const proposed = { ...request(), scopes: [{ branch: "shared_room" as const,
      room_ref: "shared_realtime_room:exact" }] };
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => url.endsWith("/rooms/status")
      ? { ok: true, status: 200, json: async () => ({
        schema: "casimir_desktop_room_connection_status/1", profile_ref: proposed.profile_ref,
        configured: true, ready: true, authority: "https://rooms.example.invalid",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        bearer_included: false, subject_included: false }) }
      : url.endsWith("/rooms/control")
        ? { ok: true, status: 200, json: async () => ({
          schema: "helix.shared_live_room.inspect_receipt.v1", operation: "room.inspect", ok: true,
          room: { room_id: "shared_realtime_room:exact", status: "ready",
            self_participant_id: "participant:owner",
            participants: [{ participant_id: "participant:owner", presence: "present" }] } }) }
        : { ok: true, status: 200, json: async () => ({ ok: true, requests: [proposed] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await waitFor(() => expect(screen.getByText("Select and join the exact room")
      .closest("li")?.textContent).toContain("Current"));
    const inspectCall = fetchMock.mock.calls.find(([url]) => url.endsWith("/rooms/control"));
    expect(JSON.parse(inspectCall?.[1]?.body as string)).toEqual({
      operation: "inspect", room_id: "shared_realtime_room:exact" });
  });

  it("checks an explicit local room without invoking hosted room OAuth", async () => {
    const proposed = { ...request(), scopes: [{ branch: "shared_room" as const,
      room_ref: "shared_realtime_room:exact", room_authority: "local" as const }] };
    const fetchMock = vi.fn(async (url: string) => url.endsWith("/local-room")
      ? { ok: true, status: 200, json: async () => ({ ok: true,
        room_authority: "local", profile_ref: proposed.profile_ref,
        receipt: { schema: "helix.shared_live_room.inspect_receipt.v1",
          operation: "room.inspect", ok: true, room: {
            room_id: "shared_realtime_room:exact", status: "ready",
            self_participant_id: "participant:owner",
            participants: [{ participant_id: "participant:owner", presence: "present" }],
          } },
      }) }
      : { ok: true, status: 200, json: async () => ({ ok: true, requests: [proposed] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    await waitFor(() => expect(screen.getByText("Select and join the exact room")
      .closest("li")?.textContent).toContain("Current"));
    expect(screen.queryByText("Authorize the selected room service")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/rooms/status") ||
      url.endsWith("/rooms/control"))).toBe(false);
  });

  it.each([
    [200, null, true],
    [409, "pairing_expired", true],
    [403, "pairing_expired", false],
    [403, "pairing_device_trust_required", false],
    [409, "pairing_destination_mismatch", false],
    [409, "pairing_revoked", false],
    [503, "reasoning_binding_unavailable", false],
  ])("handles current pairing %s/%s before continuing an approved invitation", async (status, error, canContinue) => {
    vi.stubGlobal("crypto", webcrypto);
    const proposed = { ...request(), requested_lease_seconds: 86_400,
      scopes: [{ branch: "task_pairing" as const, helix_chat_ref: "chat:exact" }],
      available_scopes: [{ branch: "task_pairing" as const, helix_chat_ref: "chat:exact" }] };
    const digest = createHash("sha256").update("destination:exact").digest("hex");
    const registration = { registrationId: "pairing_destination:exact",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), destinationDigest: digest,
      proofBasis: "authenticated_client_declaration", currentPresence: false,
      pairingAuthority: false, executionAuthority: false,
      destination: { issuer: "issuer:exact", profileId: proposed.profile_ref,
        installationId: `installation:${createHash("sha256").update(proposed.installation_ref).digest("hex")}`,
        clientId: "client:exact", taskId: proposed.task_ref } };
    const approvedAtMs = Date.now();
    const pairing = { schema: "helix.pairing_status.v1", id: "pairing:exact", revision: 1,
      destinationDigest: digest, chatId: "chat:exact", environment: null,
      state: "pending", createdAt: new Date(approvedAtMs).toISOString(),
      invitationExpiresAt: new Date(approvedAtMs + 900_000).toISOString(),
      pairingExpiresAt: new Date(approvedAtMs + 86_370_000).toISOString(),
      acceptedAt: null, revokedAt: null, executionAuthority: false, answerAuthority: false };
    let currentRequest: unknown = proposed;
    let registrationReady = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/approve") && init?.method === "POST") {
        currentRequest = { ...proposed,
          status: "approved", approval: { receiptRef: "setup_contract_approval:exact",
            approvedAtMs, expiresAtMs: approvedAtMs + 86_400_000,
            reviewedRevision: proposed.review_revision } };
        return { ok: true, status: 200,
          json: async () => ({ ok: true, request: currentRequest }) };
      }
       if (url.includes("/reasoning-bindings/current") && status !== 200)
         return { ok: false, status, json: async () => ({ ok: false, error }) };
       if (url.includes("/reasoning-bindings/current")) return { ok: true, status: 200,
         json: async () => ({ ok: true, binding: {
           schema: "helix.reasoning_task_binding.v1", reasoning_binding_id: "reasoning_binding:old",
           pairing_id: "pairing:old", binding_epoch: 1, status: "expired",
           service_instance_ref: "service:old", authenticated_profile_ref: proposed.profile_ref,
           authenticated_mcp_client_ref: "client:exact", client_session_ref: "session:old",
           provider_thread_ref_hash: createHash("sha256").update(proposed.task_ref).digest("hex"),
           helix_conversation_id: "chat:exact", mission_id: null, run_id: null,
           reasoning_role: "principal", continuation_transport: "polling",
           negotiated_observability_level: "continuation_ready",
           created_by: "signed_in_operator", created_at: "2026-01-01T00:00:00.000Z",
           expires_at: "2026-01-02T00:00:00.000Z", claimed_at: "2026-01-01T00:01:00.000Z",
           revoked_at: null, provider_thread_content_included: false,
           hidden_reasoning_included: false, execution_authority: false,
           evidence_authority: false, answer_authority: false, terminal_eligible: false,
         } }) };
      if (url.endsWith("/reasoning-destinations")) return { ok: true, status: 200,
        json: async () => ({ ok: true, destinations: registrationReady ? [registration] : [],
          execution_authority: false, answer_authority: false }) };
      if (url.includes("/reasoning-invitations/") && init?.method !== "POST")
        return { ok: true, status: 200, json: async () => ({ ok: true, pairing: null,
          execution_authority: false, answer_authority: false }) };
      if (url.endsWith("/reasoning-invitations") && init?.method === "POST")
        return { ok: true, status: 200, json: async () => ({ ok: true, pairing,
          privatePickup: true, invitation: null,
          execution_authority: false, answer_authority: false }) };
      return { ok: true, status: 200,
        json: async () => ({ ok: true, requests: [currentRequest] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve selected setup scope" }));
    if (!canContinue) {
      expect(await screen.findByText(/Paired-chat state could not be verified/)).toBeTruthy();
      expect(fetchMock.mock.calls.some(([url, init]) =>
        url.endsWith("/reasoning-invitations") && init?.method === "POST")).toBe(false);
      return;
    }
    expect(await screen.findByText(/This exact task must refresh its pairing registration/))
      .toBeTruthy();
    registrationReady = true;
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(await screen.findByText(/Private paired-chat invitation issued for this exact task and chat/))
      .toBeTruthy();
    const issued = fetchMock.mock.calls.filter(([url, init]) =>
      url.endsWith("/reasoning-invitations") && init?.method === "POST");
    expect(issued).toHaveLength(1);
    const issuedRequest = JSON.parse(issued[0][1]!.body as string);
    expect(issuedRequest).toMatchObject({
      requestId: `setup-contract-pairing:${proposed.request_id}`,
      setupContractRequestId: proposed.request_id,
      registrationId: registration.registrationId, chatId: "chat:exact",
      invitationDelivery: "private_mcp", environment: null,
    });
    expect(issuedRequest.pairingSeconds).toBeGreaterThan(86_000);
    expect(issuedRequest.pairingSeconds).toBeLessThanOrEqual(86_370);
  });

  it("resumes an approved exact pairing after the inbox remounts", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const approvedAtMs = Date.now();
    const approved = { ...request(), requested_lease_seconds: 28_800,
      scopes: [{ branch: "task_pairing" as const, helix_chat_ref: "chat:exact" }],
      available_scopes: [{ branch: "task_pairing" as const, helix_chat_ref: "chat:exact" }],
      status: "approved" as const,
      approval: { receiptRef: "setup_contract_approval:remount", approvedAtMs,
        expiresAtMs: approvedAtMs + 28_800_000,
        reviewedRevision: request().review_revision } };
    const digest = createHash("sha256").update("destination:remount").digest("hex");
    const registration = { registrationId: "pairing_destination:remount",
      expiresAt: new Date(approvedAtMs + 3_600_000).toISOString(), destinationDigest: digest,
      proofBasis: "authenticated_client_declaration", currentPresence: false,
      pairingAuthority: false, executionAuthority: false,
      destination: { issuer: "issuer:exact", profileId: approved.profile_ref,
        installationId: `installation:${createHash("sha256").update(approved.installation_ref).digest("hex")}`,
        clientId: "client:exact", taskId: approved.task_ref } };
    const pairing = { schema: "helix.pairing_status.v1", id: "pairing:remount", revision: 1,
      destinationDigest: digest, chatId: "chat:exact", environment: null,
      state: "pending", createdAt: new Date(approvedAtMs).toISOString(),
      invitationExpiresAt: new Date(approvedAtMs + 900_000).toISOString(),
      pairingExpiresAt: new Date(approvedAtMs + 28_770_000).toISOString(),
      acceptedAt: null, revokedAt: null, executionAuthority: false, answerAuthority: false };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/reasoning-bindings/current"))
        return { ok: false, status: 404, json: async () => ({}) };
      if (url.endsWith("/reasoning-destinations"))
        return { ok: true, status: 200, json: async () => ({ ok: true,
          destinations: [registration], execution_authority: false, answer_authority: false }) };
      if (url.includes("/reasoning-invitations/") && init?.method !== "POST")
        return { ok: true, status: 200, json: async () => ({ ok: true, pairing: null,
          execution_authority: false, answer_authority: false }) };
      if (url.endsWith("/reasoning-invitations") && init?.method === "POST")
        return { ok: true, status: 200, json: async () => ({ ok: true, pairing,
          privatePickup: true, invitation: null,
          execution_authority: false, answer_authority: false }) };
      return { ok: true, status: 200,
        json: async () => ({ ok: true, requests: [approved] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SetupContractInbox />);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
      url.endsWith("/reasoning-invitations") && init?.method === "POST")).toBe(true));
    expect(await screen.findByText(/Private paired-chat invitation issued for this exact task and chat/))
      .toBeTruthy();
  });
});
