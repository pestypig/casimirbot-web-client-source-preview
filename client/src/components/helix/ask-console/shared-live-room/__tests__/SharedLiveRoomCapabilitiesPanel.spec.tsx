// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedLiveRoomCapabilitiesPanel } from
  "../SharedLiveRoomCapabilitiesPanel";

const response = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  { status, headers: { "content-type": "application/json" } },
);

const flags = {
  credential_included: false,
  private_endpoint_included: false,
  native_subject_included: false,
  hidden_reasoning_included: false,
  mutation_authority: false,
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
};

const sharedFields = {
  owner_profile_ref: "profile:owner",
  owner_label: "Host Owner",
  installed_node_ref: "connector_installation:host",
  connection_ref: "environment_binding:host",
  environment_ref: "environment_binding:host",
  environment_label: "com.casimirbot.minecraft.fabric",
  source_ref: "source:host",
  world_or_site_ref: "minecraft:room-world",
  producer_epoch_ref: "adapter_epoch:host",
  capability_ids: ["com.casimirbot.minecraft.inventory.check"],
  grant_mode: "read" as const,
  action_class: "none" as const,
  health: "online" as const,
  freshness: "fresh" as const,
  last_observed_at: "2026-08-26T17:00:00.000Z",
  blocking_reasons: [],
  ready: true,
  ...flags,
};

const connection = {
  schema: "helix.room_shared_capability_connection.v1" as const,
  ...sharedFields,
  owner_controls_visible: true as const,
};

const grant = (ownerControlsVisible: boolean, status: "active" | "revoked" = "active") => ({
  schema: "helix.room_shared_capability.v1" as const,
  grant_ref: "room_capability_grant:test",
  room_id: "room:test",
  ...sharedFields,
  status,
  policy_revision: 1,
  member_count: 2,
  created_at: "2026-08-26T17:00:00.000Z",
  expires_at: "2026-08-26T18:00:00.000Z",
  revoked_at: status === "revoked" ? "2026-08-26T17:10:00.000Z" : null,
  owner_controls_visible: ownerControlsVisible,
  blocking_reasons: status === "revoked" ? ["grant_revoked"] : [],
  ready: status === "active",
});

const list = (input: {
  grants?: ReturnType<typeof grant>[];
  connections?: typeof connection[];
} = {}) => ({
  schema: "helix.room_shared_capability_list.v1" as const,
  room_id: "room:test",
  grants: input.grants ?? [],
  available_connections: input.connections ?? [],
  generated_at: "2026-08-26T17:00:00.000Z",
  ...flags,
});

describe("SharedLiveRoomCapabilitiesPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lets the owner share and revoke a healthy read connection", async () => {
    let state = list({ connections: [connection] });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        state = list({ grants: [grant(true)], connections: [connection] });
        return response({ ok: true, grant: grant(true), ...flags }, 201);
      }
      if (init?.method === "DELETE") {
        state = list({ grants: [grant(true, "revoked")], connections: [connection] });
        return response({ ok: true, grant: grant(true, "revoked"), ...flags });
      }
      return response(state);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SharedLiveRoomCapabilitiesPanel
        roomId="room:test"
        roomClosed={false}
        isOwner
      />,
    );

    expect(await screen.findByRole("option", { name: /minecraft\.fabric · online · 1 reads/iu })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Share reads for 1 hour" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/agi/environment-connectors/rooms/room%3Atest/capability-grants",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          connection_ref: connection.connection_ref,
          capability_ids: connection.capability_ids,
          expires_in_minutes: 60,
        }),
      }),
    ));
    expect(await screen.findByText(/Shared by Host Owner · read only · actions unavailable/u)).toBeTruthy();
    expect(screen.getByText(/2 members · fresh/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revoke shared read access" }));
    expect(await screen.findByText(/host connection remains active/iu)).toBeTruthy();
    expect(await screen.findByText(/Action required: grant_revoked/u)).toBeTruthy();
  });

  it("shows a sanitized grant to a member without owner controls or connection options", async () => {
    const fetchMock = vi.fn(async () => response(list({ grants: [grant(false)] })));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SharedLiveRoomCapabilitiesPanel
        roomId="room:test"
        roomClosed={false}
        isOwner={false}
      />,
    );

    expect(await screen.findByText(/Shared by Host Owner · read only · actions unavailable/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Revoke shared read access" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Share reads for 1 hour" })).toBeNull();
    expect(screen.queryByLabelText("Profile connection to share")).toBeNull();
    expect(JSON.stringify(stateSafe())).not.toMatch(
      /secret-value|https?:\/\/|access_token|password/iu,
    );
  });
});

const stateSafe = () => list({ grants: [grant(false)] });
