// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HELIX_DEVELOPER_ACCOUNT_POLICY,
  HELIX_USER_ACCOUNT_POLICY,
} from "@shared/helix-account-session";
import {
  cacheAccountCapabilityPolicy,
  clearCachedAccountCapabilityPolicy,
} from "@/lib/workstation/accountCapabilityPolicy";
import { SharedLiveRoomBrokerageBindingsPanel } from
  "../SharedLiveRoomBrokerageBindingsPanel";

const response = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  { status, headers: { "content-type": "application/json" } },
);

const connection = {
  connection_id: "brokerage_connection:test",
  status: "connected",
  capability_ids: ["brokerage.robinhood.portfolio.read"],
};

describe("SharedLiveRoomBrokerageBindingsPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearCachedAccountCapabilityPolicy();
  });

  it("lets the owner attach a connected read environment to the exact room", async () => {
    cacheAccountCapabilityPolicy(HELIX_DEVELOPER_ACCOUNT_POLICY);
    let attached = false;
    let paperCreated = false;
    let readAcceptanceCalled = false;
    let livePreviewStatus: "reviewed" | "approved" | null = null;
    const approvalPhrase =
      "APPROVE BUY 2.497502 TEST LIMIT 10.01 PREVIEW live_equity_preview:test";
    const livePreview = () => ({
      preview_id: "live_equity_preview:test",
      risk_decision_id: "risk_decision:test",
      status: livePreviewStatus,
      intent: {
        symbol: "TEST",
        side: "buy",
        quantity_micros: 2_497_502,
        limit_price_micros: 10_010_000,
        notional_cents: 2_500,
      },
      provider_warnings: ["Fractional order warning"],
      approval_phrase: approvalPhrase,
      expires_at: "2026-08-12T15:01:30.000Z",
      live_order_execution_enabled: false,
    });
    const fetchMock = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = input.toString();
      if (url.endsWith("/brokerage-connections")) {
        return response({ connections: [connection] });
      }
      if (url.includes("/room-bindings") && init?.method === "POST") {
        attached = true;
        return response({ ok: true }, 201);
      }
      if (url.endsWith("/rooms/room%3Atest")) {
        return response({
          bindings: attached ? [{
            binding_id: "brokerage_binding:test",
            connection_id: connection.connection_id,
            room_id: "room:test",
            status: "active",
            privacy_state: "owner_private",
            capability_ids: connection.capability_ids,
          }] : [],
        });
      }
      if (url.endsWith("/paper-account") && (!init?.method || init.method === "GET")) {
        return paperCreated ? response({
          account_id: "paper_account:test",
          connection_id: connection.connection_id,
          room_id: "room:test",
          account_equity_cents: 34_000,
          buying_power_cents: 34_000,
          new_trades_today: 0,
          open_symbols: [],
          kill_switch_active: false,
          kill_switch_reason: null,
          live_order_execution_enabled: false,
        }) : response({}, 404);
      }
      if (url.endsWith("/read-acceptance") && init?.method === "POST") {
        readAcceptanceCalled = true;
        return response({
          receipts: Array.from({ length: 5 }, (_, index) => ({
            upstream_tool: `read_tool_${index + 1}`,
            observation_id: `observation:${index + 1}`,
          })),
          provider_order_tool_calls_made: 0,
          live_order_execution_enabled: false,
        }, 201);
      }
      if (url.endsWith("/paper-account") && init?.method === "POST") {
        paperCreated = true;
        return response({
          account_id: "paper_account:test",
          connection_id: connection.connection_id,
          room_id: "room:test",
          account_equity_cents: 34_000,
          buying_power_cents: 34_000,
          new_trades_today: 0,
          open_symbols: [],
          kill_switch_active: false,
          kill_switch_reason: null,
          live_order_execution_enabled: false,
        }, 201);
      }
      if (url.includes("/paper-lifecycle?account_id=")) {
        return response({ orders: [], positions: [], fills: [], journal: [] });
      }
      if (url.endsWith("/live-equity-previews") && init?.method === "POST") {
        livePreviewStatus = "reviewed";
        return response(livePreview(), 201);
      }
      if (url.endsWith("/live-equity-previews") &&
          (!init?.method || init.method === "GET")) {
        return response({
          previews: livePreviewStatus ? [livePreview()] : [],
        });
      }
      if (url.endsWith("/live-equity-previews/live_equity_preview%3Atest/approve") &&
          init?.method === "POST") {
        livePreviewStatus = "approved";
        return response({ status: "approved", live_order_execution_enabled: false }, 201);
      }
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SharedLiveRoomBrokerageBindingsPanel
        roomId="room:test"
        roomClosed={false}
        isOwner
      />,
    );

    await screen.findByRole("option", { name: /Robinhood · connected/u });
    fireEvent.click(screen.getByRole("button", { name: "Attach read access" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/agi/brokerage-connections/brokerage_connection%3Atest/room-bindings",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ room_id: "room:test" }),
      }),
    ));
    expect(await screen.findByText(/1 read capabilities · orders disabled/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Verify read-only access" })).toBeEnabled();
    expect(screen.getByText(/A paper account is not required/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verify read-only access" }));
    await waitFor(() => expect(readAcceptanceCalled).toBe(true));
    expect(await screen.findByText(/5 sanitized Robinhood read receipts recorded/u)).toBeTruthy();
    expect(paperCreated).toBe(false);
    fireEvent.change(screen.getByLabelText("Paper bankroll in dollars"), {
      target: { value: "340.00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create paper account" }));
    expect(await screen.findByText(/Equity \$340\.00/u)).toBeTruthy();
    expect(screen.getByText(/live orders locked/u)).toBeTruthy();
    expect(await screen.findByText(/0 orders · 0 fills · 0 journal events/u)).toBeTruthy();
    expect(screen.getByText(/approval alone never places an order/u)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Accepted risk decision ID"), {
      target: { value: "risk_decision:test" },
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Request Robinhood review",
    }));
    expect(await screen.findByText(/Robinhood warning: Fractional order warning/u))
      .toBeTruthy();
    const approveButton = screen.getByRole("button", { name: "Approve once" });
    expect(approveButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Approval text for TEST"), {
      target: { value: approvalPhrase },
    });
    expect(approveButton).toBeEnabled();
    fireEvent.click(approveButton);
    await waitFor(() => expect(livePreviewStatus).toBe("approved"));
    expect(await screen.findByText(/separately armed live control/u)).toBeTruthy();
  });

  it("gives a user only read controls and lets the owner revoke the room grant", async () => {
    cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY);
    let attached = true;
    const fetchMock = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = input.toString();
      if (url.endsWith("/brokerage-connections")) {
        return response({ connections: [connection] });
      }
      if (url.endsWith("/rooms/room%3Atest")) {
        return response({
          bindings: attached ? [{
            binding_id: "brokerage_binding:test",
            connection_id: connection.connection_id,
            room_id: "room:test",
            status: "active",
            privacy_state: "owner_private",
            capability_ids: connection.capability_ids,
          }] : [],
        });
      }
      if (url.includes("/room-bindings/room%3Atest") &&
          init?.method === "DELETE") {
        attached = false;
        return response({ ok: true, revoked: true });
      }
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SharedLiveRoomBrokerageBindingsPanel
        roomId="room:test"
        roomClosed={false}
        isOwner
      />,
    );

    expect(await screen.findByText("Profile connection read access")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Verify read-only access" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Create paper account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Request Robinhood review" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Revoke room access" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/agi/brokerage-connections/brokerage_connection%3Atest/room-bindings/room%3Atest",
      { method: "DELETE", credentials: "same-origin" },
    ));
    expect(await screen.findByText(/revoked from this room/iu)).toBeTruthy();
  });

  it("does not expose the panel to a non-owner", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <SharedLiveRoomBrokerageBindingsPanel
        roomId="room:test"
        roomClosed={false}
        isOwner={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
