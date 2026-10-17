/** @vitest-environment jsdom */

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HELIX_MINECRAFT_PLAYER_ACTION_CAPABILITY_IDS } from
  "@shared/helix-minecraft-player-capabilities";
import { HELIX_MINECRAFT_FABRIC_LOOPBACK_LIFECYCLE_RECEIPT_SCHEMA } from "@shared/helix-minecraft-local-lifecycle";
import { SharedLiveRoomPlayerEmbodimentPanel } from
  "../SharedLiveRoomPlayerEmbodimentPanel";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { useBrowserReasoningBindingStore } from "@/lib/agent-access/reasoningTaskBinding";
import {
  HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT,
  HELIX_BOUND_AGENT_STEERING_RESULT_EVENT,
  type HelixBoundAgentSteeringRequest,
} from "../../HelixBoundAgentSteeringBridge";

const roomId = "shared_realtime_room:player-ui";
const environmentId = "environment_binding:player-ui";
const participantId = "shared_realtime_participant:owner";

const environment = {
  environment_binding_id: environmentId,
  room_source_binding_id: "room_source_binding:player-ui",
  room_id: roomId,
  source_id: "source:room-ingress:player-ui",
  world_id: "minecraft:local:player-ui",
  domain: "minecraft",
  domain_adapter: "minecraft.fabric_mod.v1",
  source_label: "Local Fabric 1.21.8",
  connection_status: "active",
  latest_observed_at: "2026-08-05T22:00:00.000Z",
  capability_ids: [],
  subject_directory: null,
  self_subject_binding: {
    status: "active",
    subject_binding_id: "environment_subject_binding:player-ui",
    subject_ref: "environment_subject:player-ui",
    subject_label: "DatDamPig",
  },
  identity_assignment: "active",
} as never;

const sourceBinding = {
  binding_id: "room_source_binding:player-ui",
  status: "active",
  domain_adapter: "minecraft.fabric_mod.v1",
  source_label: "Local Fabric 1.21.8",
} as never;

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const authorityReceipt = (
  authority: unknown = null,
  connectorReadiness: unknown[] = [],
) => ({
  schema: "helix.environment_action.authority_receipt.v1",
  ok: true,
  error: null,
  message: authority
    ? "Player-action authority configured."
    : "No player-action authority is configured.",
  authority,
  authorities: authority ? [authority] : [],
  connector_readiness: connectorReadiness,
  action_credential_included: false,
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
});

const activeAuthority = (allowedCapabilityIds: string[]) => ({
  schema: "helix.environment_action.authority.v1",
  action_authority_id: "environment_action_authority:player-ui",
  environment_binding_id: environmentId,
  room_source_binding_id: sourceBinding.binding_id,
  room_id: roomId,
  source_id: "source:room-ingress:player-ui",
  world_id: "minecraft:local:player-ui",
  adapter_profile_id: "game.minecraft.player.fabric.v1",
  domain_adapter: "minecraft.fabric_client.v1",
  participant_id: participantId,
  subject_binding_id: "environment_subject_binding:player-ui",
  allowed_capability_ids: allowedCapabilityIds,
  autonomy_mode: "approved_capabilities",
  manual_override_policy: "cancel",
  status: "active",
  policy_version: 1,
  issued_at: "2026-08-05T22:00:00.000Z",
  expires_at: "2099-08-05T23:00:00.000Z",
  revoked_at: null,
  credential_included: false,
  content_role: "environment_action_authority_not_assistant_answer",
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
});

afterEach(() => {
  cleanup();
  useAgiChatStore.setState({ activeId: undefined });
  useBrowserReasoningBindingStore.setState({ current: null });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Shared Live Room Player Embodiment controls", () => {
  it("shows the existing exact-chat binding before Play without granting authority", async () => {
    useAgiChatStore.setState({ activeId: "helix-chat:play-ui" });
    const binding = {
      reasoning_binding_id: "reasoning_binding:play-ui",
      helix_conversation_id: "helix-chat:play-ui",
      status: "active" as const,
      continuation_transport: "polling" as const,
      binding_epoch: 4,
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(authorityReceipt()));
    vi.stubGlobal("fetch", fetchMock);
    render(<SharedLiveRoomPlayerEmbodimentPanel roomId={roomId}
      environment={environment} selfParticipantId={participantId}
      sourceBinding={sourceBinding} isOwner />);
    expect(screen.getByText("reasoning binding required")).toBeTruthy();
    act(() => useBrowserReasoningBindingStore.setState({ current: binding }));
    expect(screen.getByText("authority confirmation required")).toBeTruthy();
    expect(screen.queryByText("reasoning binding required")).toBeNull();
    expect((screen.getByRole("button", { name: "Save player authority" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => useBrowserReasoningBindingStore.setState({ current: { ...binding, status: "revoked" } }));
    expect(screen.getByText("reasoning binding required")).toBeTruthy();
    act(() => useBrowserReasoningBindingStore.setState({ current: { ...binding, helix_conversation_id: "helix-chat:other" } }));
    expect(screen.getByText("reasoning binding required")).toBeTruthy();
    act(() => useBrowserReasoningBindingStore.setState({ current: binding }));
    act(() => useAgiChatStore.setState({ activeId: "helix-chat:other" }));
    expect(screen.getByText("reasoning binding required")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.every(call => !call[1]?.method || call[1].method === "GET")).toBe(true);
  });

  it("runs one explicit finite play activation and waits for exact task acknowledgement", async () => {
    useAgiChatStore.setState({ activeId: "helix-chat:play-ui" });
    let authority: ReturnType<typeof activeAuthority> | null = null;
    let releaseReadiness!: () => void;
    const readinessGate = new Promise<void>(resolve => { releaseReadiness = resolve; });
    const requestListener = (event: Event): void => {
      const detail = (event as CustomEvent<HelixBoundAgentSteeringRequest>).detail;
      expect(detail.source).toBe("minecraft_play_activation");
      expect(detail.instructionText).toContain("Exact room: shared_realtime_room:player-ui");
      expect(detail.instructionText).toContain("Create or restore");
      window.dispatchEvent(new CustomEvent(
        HELIX_BOUND_AGENT_STEERING_RESULT_EVENT,
        { detail: { requestId: detail.requestId, deliveryState: "queued" } },
      ));
      window.setTimeout(() => window.dispatchEvent(new CustomEvent(
        HELIX_BOUND_AGENT_STEERING_RESULT_EVENT,
        { detail: { requestId: detail.requestId, deliveryState: "acknowledged" } },
      )), 0);
    };
    window.addEventListener(
      HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT,
      requestListener,
    );

    const fetchMock = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = String(input);
      if (url.includes("/reasoning-bindings/current")) {
        return jsonResponse({
          binding: {
            reasoning_binding_id: "reasoning_binding:play-ui",
            helix_conversation_id: "helix-chat:play-ui",
            status: "active",
            continuation_transport: "polling",
            binding_epoch: 4,
          },
        });
      }
      if (url.endsWith("/action-authorities") && init?.method === "PUT") {
        authority = activeAuthority(
          JSON.parse(String(init.body)).allowed_capability_ids,
        );
        return jsonResponse(authorityReceipt(authority));
      }
      if (url.endsWith("/minecraft/fabric-loopback/selection")) {
        return jsonResponse({ ok: true, address: "localhost:25565" });
      }
      if (url.endsWith("/minecraft/fabric-loopback/launch")) {
        return jsonResponse({
          ok: true,
          receipt: {
            schema: HELIX_MINECRAFT_FABRIC_LOOPBACK_LIFECYCLE_RECEIPT_SCHEMA,
            status: "connected", profile_id: "fixture:player", profile_version: "1.21.8",
            isolated_game_directory: true, client_process_id: 1234, play_control_point: "fixture:play",
            mod_loaded: true, memory_used_percent: 20, credentials_exposed: false,
            server_address: "localhost:25565",
            launcher_action: "launched_client",
            connection_action: "autojoin_staged",
          },
        });
      }
      if (url.endsWith("/connector-pairings/local-player-handoff")) {
        return jsonResponse({
          ok: true,
          message: "Local player paired privately.",
          pairing: null,
        });
      }
      if (url.endsWith("/play-readiness")) {
        // Hold the next observation until the intermediate acknowledgement has
        // actually rendered; an immediate fixture reply can replace it in the
        // same React batch and make this lifecycle assertion scheduler-dependent.
        await readinessGate;
        return jsonResponse({
          schema: "helix.minecraft.play_readiness.v1",
          ok: true,
          error: null,
          message: "The exact objective has a current durable goal and active semantic monitor.",
          durable_goal_ready: true,
          semantic_monitor_ready: true,
          goal_id: "environment_durable_goal:play-ui",
          monitor_id: "environment_monitor:play-ui",
          answer_authority: false,
          assistant_answer: false,
          terminal_eligible: false,
        });
      }
      if (url.endsWith("/action-authorities")) {
        return jsonResponse(authorityReceipt(
          authority,
          authority ? [{
            action_authority_id: authority.action_authority_id,
            state: "ready",
            ready_for_actions: true,
            declared_capability_count: authority.allowed_capability_ids.length,
            available_control_engines: ["native_fabric"],
            heartbeat_received_at: "2026-09-03T01:00:00.000Z",
            manual_input_detected: false,
          }] : [],
        ));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SharedLiveRoomPlayerEmbodimentPanel
        roomId={roomId}
        environment={environment}
        selfParticipantId={participantId}
        sourceBinding={sourceBinding}
        isOwner
      />,
    );

    fireEvent.click(await screen.findByLabelText(
      "Acknowledge Minecraft player control for Local Fabric 1.21.8",
    ));
    fireEvent.click(screen.getByRole("button", {
      name: "Play Minecraft with Helix",
    }));

    expect(await screen.findByText(/acknowledged pickup and is checking/i))
      .toBeTruthy();
    releaseReadiness();
    expect(await screen.findByText("ready")).toBeTruthy();
    expect(screen.getByText(/Minecraft action permission:.*remaining/)).toBeTruthy();
    const calls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(calls.some((url) => url.includes("/reasoning-bindings/current")))
      .toBe(true);
    expect(calls.some((url) => url.endsWith("/minecraft/fabric-loopback/launch")))
      .toBe(true);
    expect(calls.some((url) => url.endsWith("/connector-pairings/local-player-handoff")))
      .toBe(true);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("bearer_token");
    window.removeEventListener(
      HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT,
      requestListener,
    );
  });

  it("creates a finite exact-capability lease and a separately scoped client pairing", async () => {
    let authority: Record<string, unknown> | null = null;
    const reviewChanges = vi.fn();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (url.endsWith("/action-authorities") && init?.method === "PUT") {
          const request = JSON.parse(String(init.body));
          authority = {
            schema: "helix.environment_action.authority.v1",
            action_authority_id: "environment_action_authority:player-ui",
            environment_binding_id: environmentId,
            room_source_binding_id: sourceBinding.binding_id,
            room_id: roomId,
            source_id: "source:room-ingress:player-ui",
            world_id: "minecraft:local:player-ui",
            adapter_profile_id: "game.minecraft.player.fabric.v1",
            domain_adapter: request.domain_adapter,
            participant_id: request.participant_id,
            subject_binding_id: "environment_subject_binding:player-ui",
            allowed_capability_ids: request.allowed_capability_ids,
            autonomy_mode: request.autonomy_mode,
            manual_override_policy: request.manual_override_policy,
            status: "active",
            policy_version: 1,
            issued_at: "2026-08-05T22:00:00.000Z",
            expires_at: request.expires_at,
            revoked_at: null,
            credential_included: false,
            content_role: "environment_action_authority_not_assistant_answer",
            answer_authority: false,
            assistant_answer: false,
            terminal_eligible: false,
            raw_content_included: false,
          };
          return jsonResponse(authorityReceipt(authority));
        }
        if (url.endsWith("/action-authorities")) {
          return jsonResponse(authorityReceipt(
            authority,
            authority
              ? [{
                action_authority_id: authority.action_authority_id,
                state: "awaiting_manifest",
                ready_for_actions: false,
                heartbeat_received_at: null,
                manual_input_detected: false,
              }]
              : [],
          ));
        }
        if (url.endsWith("/connector-pairings/local-player-handoff") && init?.method === "POST") {
          return jsonResponse({
            schema: "helix.connector_pairing_receipt.v1",
            ok: true,
            error: null,
            message: "Local player action access was staged without exposing the one-time code.",
            pairing: {
              pairing_id: "connector_pairing:player-ui-private",
              expires_at: "2099-01-01T00:10:00.000Z",
            },
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
            message: "Player-action pairing code created.",
            pairing: {
              pairing_id: "connector_pairing:player-ui",
              expires_at: "2099-01-01T00:10:00.000Z",
            },
            pairing_code: "ABCD-6789",
            pairing_command: "/helix-player pair ABCD-6789",
            pairing_code_shown_once: true,
            credential_included: false,
            answer_authority: false,
            assistant_answer: false,
            terminal_eligible: false,
            raw_content_included: false,
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SharedLiveRoomPlayerEmbodimentPanel
        roomId={roomId}
        environment={environment}
        selfParticipantId={participantId}
        sourceBinding={sourceBinding}
        isOwner
        onReviewDraftChange={reviewChanges}
      />,
    );

    await screen.findByText("Minecraft Player Embodiment");
    for (const capabilityLabel of [
      "Camera tracking",
      "Combat attack",
      "Combat guard",
      "Consume",
      "Reactive guardian program",
      "Arm viability guardian",
      "Disarm viability guardian",
    ]) {
      expect(screen.getByRole("checkbox", { name: capabilityLabel }))
        .toBeTruthy();
    }
    fireEvent.change(
      screen.getByLabelText(
        "Player action lease duration for Local Fabric 1.21.8",
      ),
      { target: { value: String(30 * 24 * 60 * 60_000) } },
    );
    expect(screen.getByText(/Long-lived player authority remains limited/i))
      .toBeTruthy();
    expect(reviewChanges).toHaveBeenLastCalledWith({ capabilityIds: [...HELIX_MINECRAFT_PLAYER_ACTION_CAPABILITY_IDS],
      autonomyMode: "approved_capabilities", manualOverridePolicy: "cancel", leaseMs: 30 * 24 * 60 * 60_000 });
    const save = screen.getByRole("button", { name: "Save player authority" });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.click(
      screen.getByLabelText(
        "Acknowledge Minecraft player control for Local Fabric 1.21.8",
      ),
    );
    fireEvent.click(save);
    await waitFor(() => expect(reviewChanges).toHaveBeenLastCalledWith(null));
    expect(JSON.stringify(reviewChanges.mock.calls)).not.toMatch(/acknowledged|pairing_code|action_authority_id/);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/action-authorities") &&
          init?.method === "PUT",
      );
      expect(call).toBeTruthy();
      const body = JSON.parse(String(call?.[1]?.body));
      expect(body.participant_id).toBe(participantId);
      expect(body.domain_adapter).toBe("minecraft.fabric_client.v1");
      expect(body.allowed_capability_ids).toEqual([
        ...HELIX_MINECRAFT_PLAYER_ACTION_CAPABILITY_IDS,
      ]);
      expect(body.autonomy_mode).toBe("approved_capabilities");
      expect(body.manual_override_policy).toBe("cancel");
      expect(Date.parse(body.expires_at) - Date.now()).toBeGreaterThan(
        29 * 24 * 60 * 60_000,
      );
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Pair player client in game" }),
    );
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/connector-pairings") &&
          init?.method === "POST",
      );
      const body = JSON.parse(String(call?.[1]?.body));
      expect(body).toMatchObject({
        purpose: "rotate",
        binding_id: sourceBinding.binding_id,
        domain_adapter: "minecraft.fabric_mod.v1",
        action_credential_requested: true,
        action_authority_id: "environment_action_authority:player-ui",
        credential_ttl_ms: 30 * 24 * 60 * 60_000,
      });
      expect(body.command_credential_requested).toBeUndefined();
    });
    expect(await screen.findByText("/helix-player pair ABCD-6789")).toBeTruthy();
    expect(screen.getByText(/restart Minecraft completely/i)).toBeTruthy();
    expect(screen.getByText(/run \/helix-player status/i)).toBeTruthy();
    expect(screen.getByText(/delivered directly to the client companion/i))
      .toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Pair local player privately" }),
    );
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/connector-pairings/local-player-handoff") &&
          init?.method === "POST",
      );
      expect(call).toBeTruthy();
      const body = JSON.parse(String(call?.[1]?.body));
      expect(body).toMatchObject({
        purpose: "rotate",
        binding_id: sourceBinding.binding_id,
        action_credential_requested: true,
        action_authority_id: "environment_action_authority:player-ui",
      });
    });
    expect(await screen.findByText(
      "Local player action access was staged without exposing the one-time code.",
    )).toBeTruthy();
    expect(screen.queryByText("/helix-player pair ABCD-6789")).toBeNull();
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("bearer_token");
  });

  it("does not let readiness refreshes overwrite an unsaved capability draft", async () => {
    const storedCapabilities = HELIX_MINECRAFT_PLAYER_ACTION_CAPABILITY_IDS.filter(
      (id) => id !== "com.casimirbot.minecraft.player.combat.attack",
    );
    const authority = activeAuthority(storedCapabilities);
    const fetchMock = vi.fn(async (): Promise<Response> =>
      jsonResponse(authorityReceipt(authority)),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SharedLiveRoomPlayerEmbodimentPanel
        roomId={roomId}
        environment={environment}
        selfParticipantId={participantId}
        sourceBinding={sourceBinding}
        isOwner
      />,
    );

    const combat = await screen.findByRole("checkbox", { name: "Combat attack" });
    expect((combat as HTMLInputElement).checked).toBe(false);
    fireEvent.click(combat);
    expect((combat as HTMLInputElement).checked).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Refresh Player Embodiment authority" }),
    );
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    expect((combat as HTMLInputElement).checked).toBe(true);
  });

  it("restores one finite full-gameplay preset from a narrow prior lease", async () => {
    let authority = activeAuthority([
      "com.casimirbot.minecraft.player.look",
    ]);
    const fetchMock = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      if (String(input).endsWith("/action-authorities") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        authority = {
          ...activeAuthority(body.allowed_capability_ids),
          autonomy_mode: body.autonomy_mode,
          manual_override_policy: body.manual_override_policy,
          expires_at: body.expires_at,
        };
      }
      return jsonResponse(authorityReceipt(authority));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SharedLiveRoomPlayerEmbodimentPanel
        roomId={roomId}
        environment={environment}
        selfParticipantId={participantId}
        sourceBinding={sourceBinding}
        isOwner
      />,
    );

    const fullAccess = await screen.findByRole("button", {
      name: "Full gameplay access",
    });
    await waitFor(() => expect(fullAccess.getAttribute("aria-pressed")).toBe("false"));
    fireEvent.click(fullAccess);

    expect(fullAccess.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Selected: all registered player capabilities/i)).toBeTruthy();
    expect((screen.getByRole("checkbox", {
      name: "Combat attack",
    }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(
      "Player action approval mode for Local Fabric 1.21.8",
    ) as HTMLSelectElement).value).toBe("approved_capabilities");
    expect((screen.getByLabelText(
      "Player manual override for Local Fabric 1.21.8",
    ) as HTMLSelectElement).value).toBe("cancel");
    expect((screen.getByLabelText(
      "Player action lease duration for Local Fabric 1.21.8",
    ) as HTMLSelectElement).value).toBe(String(2 * 60 * 60_000));

    const save = screen.getByRole("button", { name: "Save player authority" });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText(
      "Acknowledge Minecraft player control for Local Fabric 1.21.8",
    ));
    fireEvent.click(save);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/action-authorities") && init?.method === "PUT",
      );
      expect(call).toBeTruthy();
      const body = JSON.parse(String(call?.[1]?.body));
      expect(body.allowed_capability_ids).toEqual([
        ...HELIX_MINECRAFT_PLAYER_ACTION_CAPABILITY_IDS,
      ]);
      expect(body.autonomy_mode).toBe("approved_capabilities");
      expect(body.manual_override_policy).toBe("cancel");
      expect(Date.parse(body.expires_at) - Date.now()).toBeGreaterThan(
        119 * 60_000,
      );
    });
  });

  it("distinguishes configured authority from a manifest-and-heartbeat-ready client", async () => {
    const authority = {
      schema: "helix.environment_action.authority.v1",
      action_authority_id: "environment_action_authority:ready-ui",
      environment_binding_id: environmentId,
      room_source_binding_id: sourceBinding.binding_id,
      room_id: roomId,
      source_id: "source:room-ingress:player-ui",
      world_id: "minecraft:local:player-ui",
      adapter_profile_id: "game.minecraft.player.fabric.v1",
      domain_adapter: "minecraft.fabric_client.v1",
      participant_id: participantId,
      subject_binding_id: "environment_subject_binding:player-ui",
      allowed_capability_ids: [...HELIX_MINECRAFT_PLAYER_ACTION_CAPABILITY_IDS],
      autonomy_mode: "approved_capabilities",
      manual_override_policy: "cancel",
      status: "active",
      policy_version: 1,
      issued_at: "2026-08-05T22:00:00.000Z",
      expires_at: "2099-01-01T00:00:00.000Z",
      revoked_at: null,
      credential_included: false,
      content_role: "environment_action_authority_not_assistant_answer",
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    const connectorReadiness = {
      schema: "helix.environment_action.connector_readiness.v1",
      action_authority_id: authority.action_authority_id,
      state: "ready",
      ready_for_actions: true,
      manifest_admitted: true,
      manifest_received_at: "2026-08-05T22:00:01.000Z",
      declared_capability_count: 13,
      available_control_engines: ["native_fabric"],
      heartbeat_status: "active",
      heartbeat_fresh: true,
      heartbeat_received_at: "2026-08-05T22:00:02.000Z",
      heartbeat_max_age_ms: 30_000,
      active_workflow_count: 0,
      controls_asserted: false,
      manual_input_detected: false,
      emergency_stop_latched: false,
      blocking_reason: null,
      credential_included: false,
      content_role:
        "environment_action_connector_readiness_not_assistant_answer",
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(
        authorityReceipt(authority, [connectorReadiness]),
      )),
    );

    render(
      <SharedLiveRoomPlayerEmbodimentPanel
        roomId={roomId}
        environment={environment}
        selfParticipantId={participantId}
        sourceBinding={sourceBinding}
        isOwner
      />,
    );

    expect(await screen.findByText("client ready")).toBeTruthy();
    expect(
      screen.getByText(/Client ready: 13 declared capabilities via native_fabric/i),
    ).toBeTruthy();
    expect(screen.getByText("authority active")).toBeTruthy();
    expect(JSON.stringify(connectorReadiness)).not.toContain("credential_id");
    expect(JSON.stringify(connectorReadiness)).not.toContain("manifest_id");
  });

  it("does not overlap authority refreshes while an earlier request remains pending", async () => {
    vi.useFakeTimers();
    let resolveInitial: ((response: Response) => void) | null = null;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveInitial = resolve;
      }))
      .mockResolvedValue(jsonResponse(authorityReceipt()));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SharedLiveRoomPlayerEmbodimentPanel
        roomId={roomId}
        environment={environment}
        selfParticipantId={participantId}
        sourceBinding={sourceBinding}
        isOwner
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInitial?.(jsonResponse(authorityReceipt()));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
