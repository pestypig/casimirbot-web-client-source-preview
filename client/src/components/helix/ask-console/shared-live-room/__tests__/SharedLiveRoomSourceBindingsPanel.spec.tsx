/** @vitest-environment jsdom */

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedLiveRoomSourceBindingsPanel } from "../SharedLiveRoomSourceBindingsPanel";

const environment = {
  schema: "helix.room_environment_projection.v1",
  environment_binding_id: "environment_binding:fabric-room",
  room_source_binding_id: "room_source_binding:fabric-room",
  room_id: "shared_realtime_room:fabric-room",
  source_id: "source:room-ingress:fabric-room",
  world_id: "minecraft:local:fabric-room",
  domain: "minecraft",
  domain_adapter: "minecraft.fabric_mod.v1",
  source_label: "Local Fabric 1.21.8",
  connection_status: "active",
  latest_observed_at: "2026-08-01T12:00:00.000Z",
  capability_ids: ["com.casimirbot.minecraft.actor.status"],
  subject_directory: {
    schema: "helix.environment_subject_directory.v1",
    environment_binding_id: "environment_binding:fabric-room",
    room_source_binding_id: "room_source_binding:fabric-room",
    room_id: "shared_realtime_room:fabric-room",
    source_id: "source:room-ingress:fabric-room",
    world_id: "minecraft:local:fabric-room",
    subject_kind: "minecraft.player",
    observed_at: "2026-08-01T12:00:00.000Z",
    freshness: "fresh",
    subjects: [
      {
        subject_ref: "environment_subject:alice",
        subject_kind: "minecraft.player",
        display_label: "Alice",
        presence: "online",
        claimed_by_participant_id: null,
        observed_at: "2026-08-01T12:00:00.000Z",
        freshness: "fresh",
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
      {
        subject_ref: "environment_subject:bob",
        subject_kind: "minecraft.player",
        display_label: "Bob",
        presence: "online",
        claimed_by_participant_id: "participant:other",
        observed_at: "2026-08-01T12:00:00.000Z",
        freshness: "fresh",
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    ],
    content_role: "environment_subject_directory_not_assistant_answer",
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  },
  self_subject_binding: null,
  identity_assignment: "binding_required",
  owner_controls_visible: false,
  content_role: "room_environment_projection_not_assistant_answer",
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
} as const;

const environmentReceipt = (environments = [environment]) => ({
  schema: "helix.room_environments.receipt.v1",
  ok: true,
  error: null,
  message: "Room environments listed.",
  environments,
  binding: null,
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
});

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Shared Live Room environment panel", () => {
  it("retains the narrowed same-player draft through stale observation re-entry, without retaining consent", async () => {
    vi.useFakeTimers();
    let status = "active";
    let subjectRef = "environment_subject:alice";
    const identityOverrides: Record<string, string> = {};
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).endsWith("/environments")) return jsonResponse(environmentReceipt([{
        ...environment, ...identityOverrides, self_subject_binding: { status, subject_ref: subjectRef,
          subject_label: "Alice", subject_binding_id: `binding:${status}` },
        identity_assignment: status === "active" ? "supported" : "reverification_required",
      }] as never));
      return jsonResponse({ ok: true, authority: null, authorities: [], bindings: [], pairings: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<SharedLiveRoomSourceBindingsPanel roomId={environment.room_id} roomClosed={false}
      isOwner selfParticipantId="participant:self" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    fireEvent.click(screen.getByLabelText("Navigate", { exact: true }));
    fireEvent.change(screen.getByLabelText(/Player action lease duration/), { target: { value: String(8 * 3600000) } });
    fireEvent.click(screen.getByLabelText(/Acknowledge Minecraft player control/));
    expect(screen.getByLabelText("Navigate", { exact: true })).not.toBeChecked();
    status = "stale";
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(screen.queryByLabelText("Navigate", { exact: true })).toBeNull();
    status = "active";
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(screen.getByLabelText("Navigate", { exact: true })).not.toBeChecked();
    expect(screen.getByLabelText(/Player action lease duration/)).toHaveValue(String(8 * 3600000));
    expect(screen.getByLabelText(/Acknowledge Minecraft player control/)).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save player authority", exact: true })).toBeDisabled();
    subjectRef = "environment_subject:bob";
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(screen.getByLabelText("Navigate", { exact: true })).toBeChecked();
    expect(screen.getByLabelText(/Acknowledge Minecraft player control/)).not.toBeChecked();
    for (const field of ["source_id", "world_id", "room_source_binding_id", "environment_binding_id"]) {
      fireEvent.click(screen.getByLabelText("Navigate", { exact: true }));
      identityOverrides[field] = `fixture:changed-${field}`;
      await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
      expect(screen.getByLabelText("Navigate", { exact: true })).toBeChecked();
      expect(screen.getByLabelText(/Acknowledge Minecraft player control/)).not.toBeChecked();
    }
    fireEvent.click(screen.getByLabelText("Navigate", { exact: true }));
    view.rerender(<SharedLiveRoomSourceBindingsPanel roomId={environment.room_id} roomClosed={false}
      isOwner selfParticipantId="participant:other" />);
    expect(screen.getByLabelText("Navigate", { exact: true })).toBeChecked();
    expect(screen.getByLabelText(/Acknowledge Minecraft player control/)).not.toBeChecked();
    expect(fetchMock.mock.calls.every(call => !call[1]?.method || call[1].method === "GET")).toBe(true);
  });

  it("gives the owner a one-time in-game Fabric pairing command without exposing a credential", async () => {
    const pairing = {
      schema: "helix.connector_pairing.v1",
      pairing_id: "connector_pairing:ui-test",
      room_id: environment.room_id,
      binding_id: "room_source_binding:ui-test",
      purpose: "create",
      domain_adapter: "minecraft.fabric_mod.v1",
      world_id: "minecraft:connector:ui-test",
      source_label: "Minecraft Fabric source",
      command_credential_requested: false,
      status: "pending",
      expires_at: "2099-01-01T00:10:00.000Z",
      redeemed_at: null,
      revoked_at: null,
      created_at: "2099-01-01T00:00:00.000Z",
      updated_at: "2099-01-01T00:00:00.000Z",
      code_included: false,
      credential_included: false,
      content_role: "connector_pairing_control_not_assistant_answer",
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    } as const;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/environments")) {
        return jsonResponse(environmentReceipt([]));
      }
      if (url.endsWith("/source-bindings")) {
        return jsonResponse({ ok: true, bindings: [] });
      }
      if (url.endsWith("/connector-pairings") && init?.method === "POST") {
        return jsonResponse({
          schema: "helix.connector_pairing_receipt.v1",
          ok: true,
          error: null,
          message: "Pairing code created.",
          pairing,
          pairing_code: "ABCD-2345",
          pairing_command: "/helix pair ABCD-2345",
          pairing_code_shown_once: true,
          credential_included: false,
          answer_authority: false,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        });
      }
      if (url.endsWith("/connector-pairings")) {
        return jsonResponse({
          schema: "helix.connector_pairing_receipt.v1",
          ok: true,
          error: null,
          message: "listed",
          pairing: null,
          pairings: [],
          pairing_code_shown_once: false,
          credential_included: false,
          answer_authority: false,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SharedLiveRoomSourceBindingsPanel
        roomId={environment.room_id}
        roomClosed={false}
        isOwner
        selfParticipantId="participant:self"
      />,
    );

    const pairButton = await screen.findByRole("button", {
      name: "Pair in game",
    });
    fireEvent.click(pairButton);
    expect(await screen.findByText("ABCD-2345")).toBeTruthy();
    expect(screen.getByText("/helix pair ABCD-2345")).toBeTruthy();
    expect(screen.getByText(/never placed in chat, agent context, MCP output/i))
      .toBeTruthy();
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("bearer_token");
  });

  it("renders simultaneous bound programs as independent environment identities", async () => {
    const paperEnvironment = {
      ...environment,
      environment_binding_id: "environment_binding:paper-room",
      room_source_binding_id: "room_source_binding:paper-room",
      source_id: "source:room-ingress:paper-room",
      world_id: "minecraft:minehut:paper-room",
      domain_adapter: "minecraft.paper_plugin.v1",
      source_label: "Minehut Paper 1.21.8",
      subject_directory: {
        ...environment.subject_directory,
        environment_binding_id: "environment_binding:paper-room",
        room_source_binding_id: "room_source_binding:paper-room",
        source_id: "source:room-ingress:paper-room",
        world_id: "minecraft:minehut:paper-room",
        subjects: [
          {
            ...environment.subject_directory.subjects[0],
            subject_ref: "environment_subject:carol",
            display_label: "Carol",
          },
        ],
      },
    } as const;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(environmentReceipt([environment, paperEnvironment])),
    ));

    render(
      <SharedLiveRoomSourceBindingsPanel
        roomId={environment.room_id}
        roomClosed={false}
        isOwner={false}
        selfParticipantId="participant:self"
      />,
    );

    expect(await screen.findByText("Local Fabric 1.21.8")).toBeTruthy();
    expect(screen.getByText("Minehut Paper 1.21.8")).toBeTruthy();
    expect(screen.getAllByLabelText("Your identity in this environment"))
      .toHaveLength(2);
    expect(screen.getByRole("option", { name: "Alice" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Carol" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generate link" })).toBeNull();
  });

  it("fails visibly closed when a live connector reports no player in its exact world", async () => {
    const emptyEnvironment = {
      ...environment,
      subject_directory: {
        ...environment.subject_directory,
        subjects: [],
      },
    } as const;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(environmentReceipt([emptyEnvironment])),
    ));

    render(
      <SharedLiveRoomSourceBindingsPanel
        roomId={environment.room_id}
        roomClosed={false}
        isOwner
        selfParticipantId="participant:self"
      />,
    );

    expect(
      await screen.findByText(`Bound world: ${environment.world_id}`),
    ).toBeTruthy();
    expect(
      screen.getByRole("status").textContent,
    ).toMatch(/do not pair Player Embodiment or run player actions/i);
    expect(
      screen.queryByText(/Minecraft player embodiment/i),
    ).toBeNull();
  });

  it("shows every member a safe environment selector while keeping setup controls owner-only", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return jsonResponse({
          ...environmentReceipt([]),
          message: "Your room identity is now Alice in this environment.",
          binding: {
            schema: "helix.room_environment_subject_binding.v1",
            subject_binding_id: "environment_subject_binding:alice",
            room_id: environment.room_id,
            participant_id: "participant:self",
            environment_binding_id: environment.environment_binding_id,
            room_source_binding_id: environment.room_source_binding_id,
            source_id: environment.source_id,
            world_id: environment.world_id,
            subject_kind: "minecraft.player",
            subject_ref: "environment_subject:alice",
            subject_label: "Alice",
            verification_method: "self_claim",
            confidence: 0.75,
            status: "active",
            producer_epoch_ref: "adapter_epoch:fabric-room",
            verified_at: "2026-08-01T12:00:00.000Z",
            last_confirmed_at: "2026-08-01T12:00:00.000Z",
            expires_at: null,
            revoked_at: null,
            content_role: "environment_subject_identity_not_assistant_answer",
            answer_authority: false,
            assistant_answer: false,
            terminal_eligible: false,
            raw_content_included: false,
          },
        });
      }
      return jsonResponse(environmentReceipt());
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SharedLiveRoomSourceBindingsPanel
        roomId={environment.room_id}
        roomClosed={false}
        isOwner={false}
        selfParticipantId="participant:self"
      />,
    );

    expect(await screen.findByText("Local Fabric 1.21.8")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generate link" })).toBeNull();
    const selector = screen.getByLabelText("Your identity in this environment");
    expect(selector).toHaveValue("");
    expect(screen.getByRole("option", { name: "Bob · claimed by another member" }))
      .toBeDisabled();
    fireEvent.change(selector, { target: { value: "environment_subject:alice" } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/environments/environment_binding%3Afabric-room/me"),
        expect.objectContaining({
          method: "PUT",
          credentials: "include",
          body: JSON.stringify({ subject_ref: "environment_subject:alice" }),
        }),
      ),
    );
    expect(await screen.findByText("Your room identity is now Alice in this environment."))
      .toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/source-bindings"),
      ),
    ).toBe(false);
  });

  it("makes a stale connector-epoch binding explicitly reselectable", async () => {
    const staleEnvironment = {
      ...environment,
      identity_assignment: "reverification_required",
      self_subject_binding: {
        schema: "helix.room_environment_subject_binding.v1",
        subject_binding_id: "environment_subject_binding:stale-alice",
        room_id: environment.room_id,
        participant_id: "participant:self",
        environment_binding_id: environment.environment_binding_id,
        room_source_binding_id: environment.room_source_binding_id,
        source_id: environment.source_id,
        world_id: environment.world_id,
        subject_kind: "minecraft.player",
        subject_ref: "environment_subject:alice",
        subject_label: "Alice",
        verification_method: "self_claim",
        confidence: 0.75,
        status: "stale",
        producer_epoch_ref: "adapter_epoch:previous-fabric-session",
        verified_at: "2026-08-01T12:00:00.000Z",
        last_confirmed_at: "2026-08-01T12:00:00.000Z",
        expires_at: null,
        revoked_at: null,
        content_role: "environment_subject_identity_not_assistant_answer",
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    } as const;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return jsonResponse({
          ...environmentReceipt([]),
          message: "Your room identity is now Alice in this environment.",
          binding: {
            ...staleEnvironment.self_subject_binding,
            subject_binding_id: "environment_subject_binding:renewed-alice",
            status: "active",
            producer_epoch_ref: "adapter_epoch:current-fabric-session",
          },
        });
      }
      return jsonResponse(environmentReceipt([staleEnvironment]));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SharedLiveRoomSourceBindingsPanel
        roomId={environment.room_id}
        roomClosed={false}
        isOwner={false}
        selfParticipantId="participant:self"
      />,
    );

    expect(await screen.findByText("Reverify Alice")).toBeTruthy();
    expect(screen.getByText(/connector session changed/i)).toBeTruthy();
    const selector = screen.getByLabelText("Your identity in this environment");
    expect(selector).toHaveValue("");
    expect(screen.getByRole("option", { name: "Choose again to reverify" }))
      .toBeTruthy();

    fireEvent.change(selector, { target: { value: "environment_subject:alice" } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/environments/environment_binding%3Afabric-room/me"),
        expect.objectContaining({
          method: "PUT",
          credentials: "include",
          body: JSON.stringify({ subject_ref: "environment_subject:alice" }),
        }),
      ),
    );
  });

  it("refreshes an online subject roster without overlapping a pending request", async () => {
    vi.useFakeTimers();
    let resolveInitial: ((response: Response) => void) | null = null;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveInitial = resolve;
      }))
      .mockResolvedValue(jsonResponse(environmentReceipt()));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SharedLiveRoomSourceBindingsPanel
        roomId={environment.room_id}
        roomClosed={false}
        isOwner={false}
        selfParticipantId="participant:self"
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInitial?.(jsonResponse(environmentReceipt([])));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("option", { name: "Alice" })).toBeTruthy();
  });

  it("lets the owner explicitly enable the full live Minecraft dispatcher", async () => {
    const commandAuthorityReceipt = (authority: unknown = null) => ({
      schema: "helix.environment_command_authority_receipt.v1",
      ok: true,
      error: null,
      message: authority
        ? "Environment command profile set to server_administrator."
        : "Environment command authority is not configured.",
      authority,
      member_grant: null,
      member_grants: [],
      command_credential_included: false,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    const fullAuthority = {
      schema: "helix.environment_command_authority.v1",
      command_authority_id: "command_authority:fabric-room",
      environment_binding_id: environment.environment_binding_id,
      room_source_binding_id: environment.room_source_binding_id,
      room_id: environment.room_id,
      source_id: environment.source_id,
      world_id: environment.world_id,
      adapter_profile_id: "game.minecraft.readonly.v1",
      authority_profile: "server_administrator",
      autonomy_mode: "autonomous",
      approved_categories: [],
      status: "active",
      policy_version: 1,
      issued_at: "2026-08-01T12:00:00.000Z",
      expires_at: null,
      revoked_at: null,
      credential_included: false,
      content_role: "environment_command_authority_not_assistant_answer",
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    let saved = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/environments")) return jsonResponse(environmentReceipt());
      if (
        url.endsWith("/connector-pairings/local-source-handoff") &&
        init?.method === "POST"
      ) {
        return jsonResponse({
          schema: "helix.connector_pairing_receipt.v1",
          ok: true,
          error: null,
          message:
            "Local server sensing was staged without exposing the one-time code or enabling command access.",
          pairing: null,
          pairing_code_shown_once: false,
          credential_included: false,
          answer_authority: false,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        });
      }
      if (
        url.endsWith("/connector-pairings/local-server-handoff") &&
        init?.method === "POST"
      ) {
        return jsonResponse({
          schema: "helix.connector_pairing_receipt.v1",
          ok: true,
          error: null,
          message:
            "Local server command access was staged without exposing the one-time code.",
          pairing: null,
          pairing_code_shown_once: false,
          credential_included: false,
          answer_authority: false,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        });
      }
      if (url.endsWith("/connector-pairings") && init?.method === "POST") {
        return jsonResponse({
          schema: "helix.connector_pairing_receipt.v1",
          ok: true,
          error: null,
          message: "Command pairing code created.",
          pairing: {
            schema: "helix.connector_pairing.v1",
            pairing_id: "connector_pairing:command-ui-test",
            room_id: environment.room_id,
            binding_id: environment.room_source_binding_id,
            purpose: "rotate",
            domain_adapter: environment.domain_adapter,
            world_id: environment.world_id,
            source_label: environment.source_label,
            command_credential_requested: true,
            status: "pending",
            expires_at: "2099-01-01T00:10:00.000Z",
            redeemed_at: null,
            revoked_at: null,
            created_at: "2099-01-01T00:00:00.000Z",
            updated_at: "2099-01-01T00:00:00.000Z",
            code_included: false,
            credential_included: false,
            content_role: "connector_pairing_control_not_assistant_answer",
            answer_authority: false,
            assistant_answer: false,
            terminal_eligible: false,
            raw_content_included: false,
          },
          pairing_code: "WXYZ-6789",
          pairing_command: "/helix pair WXYZ-6789",
          pairing_code_shown_once: true,
          credential_included: false,
          answer_authority: false,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        });
      }
      if (url.endsWith("/connector-pairings")) {
        return jsonResponse({
          schema: "helix.connector_pairing_receipt.v1",
          ok: true,
          error: null,
          message: "listed",
          pairing: null,
          pairings: [],
          pairing_code_shown_once: false,
          credential_included: false,
          answer_authority: false,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        });
      }
      if (
        url.endsWith(
          "/environments/environment_binding%3Afabric-room/participants/participant%3Aself/command-grant",
        ) && init?.method === "PUT"
      ) {
        return jsonResponse({
          ...commandAuthorityReceipt(fullAuthority),
          message: "Room member command grant updated.",
        });
      }
      if (url.includes("/command-authority") && init?.method === "PUT") {
        saved = true;
        return jsonResponse(commandAuthorityReceipt(fullAuthority));
      }
      if (url.includes("/command-authority")) {
        return jsonResponse(commandAuthorityReceipt(saved ? fullAuthority : null));
      }
      if (url.includes("/source-bindings")) {
        return jsonResponse({
          ok: true,
          error: null,
          message: "listed",
          bindings: [{
            binding_id: environment.room_source_binding_id,
            domain_adapter: environment.domain_adapter,
            source_label: environment.source_label,
            status: "active",
          }],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <SharedLiveRoomSourceBindingsPanel
        roomId={environment.room_id}
        roomClosed={false}
        isOwner
        selfParticipantId="participant:self"
        participants={[
          {
            participant_id: "participant:self",
            display_name: "Room owner",
            role: "owner",
            presence: "active",
            consent: {},
            joined_at: "2026-08-01T12:00:00.000Z",
            last_seen_at: "2026-08-01T12:00:00.000Z",
          } as never,
        ]}
      />,
    );

    await screen.findByText("Local Fabric 1.21.8");
    fireEvent.change(
      screen.getByLabelText("Command authority for Local Fabric 1.21.8"),
      { target: { value: "server_administrator" } },
    );
    fireEvent.change(
      screen.getByLabelText("Command approval mode for Local Fabric 1.21.8"),
      { target: { value: "autonomous" } },
    );
    expect(screen.getByText(/complete command tree exposed by this live Minecraft server/i))
      .toBeTruthy();
    fireEvent.click(
      screen.getByLabelText(
        "Acknowledge full Minecraft command authority for Local Fabric 1.21.8",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save command authority" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).includes("/command-authority") && init?.method === "PUT",
      );
      expect(call?.[1]?.body).toBe(JSON.stringify({
        authority_profile: "server_administrator",
        autonomy_mode: "autonomous",
        approved_categories: [],
        expires_at: null,
      }));
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(await screen.findByText(/Server administrator \(full\) · Autonomous/))
      .toBeTruthy();
    expect(screen.getByRole("button", { name: "Emergency stop" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Command ceiling for Room owner"), {
      target: { value: "server_administrator" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/agi/realtime/rooms/${encodeURIComponent(environment.room_id)}/environments/${encodeURIComponent(environment.environment_binding_id)}/participants/participant%3Aself/command-grant`,
        expect.objectContaining({
          method: "PUT",
          credentials: "include",
          body: JSON.stringify({
            max_authority_profile: "server_administrator",
            autonomy_override: null,
            expires_at: null,
          }),
        }),
      ),
    );
    expect(await screen.findByText("Room member command grant updated."))
      .toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Pair command access in game" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/connector-pairings"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: expect.stringContaining('"command_credential_requested":true'),
        }),
      ),
    );
    expect(await screen.findByText("/helix pair WXYZ-6789")).toBeTruthy();
    expect(screen.queryByText(/helix_env_cmd_/)).toBeNull();
    expect(screen.getByText(/never placed in chat, agent context, MCP output/i))
      .toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Pair local server privately" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/connector-pairings/local-server-handoff"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: expect.stringContaining('"command_credential_requested":true'),
        }),
      ),
    );
    expect(
      await screen.findByText(
        "Local server command access was staged without exposing the one-time code.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("/helix pair WXYZ-6789")).toBeNull();
    expect(confirm).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Re-pair local sensing privately" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/connector-pairings/local-source-handoff"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: expect.stringContaining('"command_credential_requested":false'),
        }),
      ),
    );
    expect(
      await screen.findByText(
        "Local server sensing was staged without exposing the one-time code or enabling command access.",
      ),
    ).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
  });
});
