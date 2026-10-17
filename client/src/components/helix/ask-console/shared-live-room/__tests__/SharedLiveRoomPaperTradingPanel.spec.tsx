// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from
  "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedLiveRoomPaperTradingPanel } from
  "../SharedLiveRoomPaperTradingPanel";

const response = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  { status, headers: { "content-type": "application/json" } },
);

const account = {
  account_id: "paper_account:test",
  connection_id: "brokerage_connection:test",
  room_id: "room:test",
  account_equity_cents: 20_000,
  buying_power_cents: 20_000,
  new_trades_today: 0,
  open_symbols: [],
  kill_switch_active: false,
  kill_switch_reason: null,
  live_order_execution_enabled: false,
};

const control = (present: boolean) => ({
  control_id: "live_trading_control:test",
  deployment_enabled: true,
  operator_armed: present,
  kill_switch_active: !present,
  kill_switch_reason: present ? "Explicitly armed" : "Attended session ended",
  protective_exit_ready: true,
  supervisor_heartbeat_at: "2099-08-27T15:00:00.000Z",
  supervisor_fresh: true,
  supervisor_status: "healthy",
  operator_presence_at: present ? "2099-08-27T15:00:01.000Z" : null,
  operator_present: present,
  attention_required: false,
  attention_reason: null,
  arming_phrase:
    "ARM ROBINHOOD LIVE EQUITIES live_trading_control:test MAX $25 ONE ENTRY TODAY",
  new_entries_today: 0,
  live_order_execution_enabled: present,
  policy: {
    max_entry_notional_cents: 2500,
    max_estimated_risk_cents: 100,
    max_daily_loss_cents: 300,
    max_new_entries_per_day: 1,
  },
});

describe("SharedLiveRoomPaperTradingPanel attended session", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("stops heartbeats and engages the server kill switch when attendance ends", async () => {
    let operatorPresent = false;
    const fetchMock = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = String(input);
      if (url.endsWith("/paper-account")) return response(account);
      if (url.includes("/paper-lifecycle?account_id=")) return response({
        orders: [], positions: [], fills: [], journal: [],
      });
      if (url.endsWith("/live-equity-previews")) return response({ previews: [] });
      if (url.endsWith("/live-equity-executions")) return response({ executions: [] });
      if (url.endsWith("/protective-exit-previews")) return response({ previews: [] });
      if (url.endsWith("/protective-exit-executions")) return response({ executions: [] });
      if (url.endsWith("/live-contract-preflight") ||
          url.endsWith("/live-acceptance-readiness")) return response({}, 404);
      if (url.endsWith("/live-presence") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { action?: string };
        operatorPresent = body.action !== "end";
        return response(control(operatorPresent));
      }
      if (url.endsWith("/live-control")) return response(control(operatorPresent));
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SharedLiveRoomPaperTradingPanel
        connectionId="brokerage_connection:test"
        roomId="room:test"
        disabled={false}
      />,
    );

    fireEvent.click(await screen.findByRole("button", {
      name: "Start attended live session",
    }));
    await screen.findByText("Operator present");
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith("/live-acceptance-readiness"),
    ).length).toBeGreaterThanOrEqual(2));
    fireEvent.click(screen.getByRole("button", {
      name: "End attended live session",
    }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/live-presence$/u),
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: expect.stringContaining('"action":"end"'),
      }),
    ));
    expect(await screen.findByText(/Attended live session ended/u)).toBeTruthy();
    expect(screen.getByText("Operator not present")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith("/live-acceptance-readiness"),
    ).length).toBeGreaterThanOrEqual(3);
  });

  it("archives completed acceptance only after flags are off and exact confirmation", async () => {
    const archive = {
      archive_id: "live_acceptance_archive:test",
      connection_id: "brokerage_connection:test",
      room_id: "room:test",
      control_id: "live_trading_control:test",
      evidence_hash: `sha256:${"a".repeat(64)}`,
      status: "accepted",
      accepted_at: "2099-08-27T15:00:02.000Z",
      reconciled_filled_entry_count: 1,
      reconciled_filled_exit_count: 1,
      unresolved_live_exposure_count: 0,
      live_flags_enabled: false,
      provider_order_tool_calls_made_by_archive: 0,
    };
    const lockedControl = {
      ...control(false),
      deployment_enabled: false,
      protective_exit_ready: false,
      supervisor_fresh: false,
      supervisor_status: "disabled",
    };
    const fetchMock = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = String(input);
      if (url.endsWith("/paper-account")) return response(account);
      if (url.includes("/paper-lifecycle?account_id=")) return response({
        orders: [], positions: [], fills: [], journal: [],
      });
      if (url.endsWith("/live-equity-previews")) return response({ previews: [] });
      if (url.endsWith("/live-equity-executions")) return response({ executions: [] });
      if (url.endsWith("/protective-exit-previews")) return response({ previews: [] });
      if (url.endsWith("/protective-exit-executions")) return response({ executions: [] });
      if (url.endsWith("/live-contract-preflight")) return response({}, 404);
      if (url.endsWith("/live-acceptance-archives/latest")) return response({}, 404);
      if (url.endsWith("/live-acceptance-readiness")) return response({
        generated_at: "2099-08-27T15:00:01.000Z",
        read_acceptance_complete: true,
        safe_to_enable_live_flags: true,
        ready_to_start_attended_canary: false,
        ready_to_arm: false,
        acceptance_complete: true,
        unresolved_live_exposure_count: 0,
        live_order_tool_calls_made: 0,
        gates: [],
      });
      if (url.endsWith("/live-control")) return response(lockedControl);
      if (url.endsWith("/live-acceptance-archives") && init?.method === "POST") {
        return response(archive, 201);
      }
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SharedLiveRoomPaperTradingPanel
        connectionId="brokerage_connection:test"
        roomId="room:test"
        disabled={false}
      />,
    );

    const confirmation = await screen.findByLabelText(
      "Live acceptance archive confirmation",
    );
    fireEvent.change(confirmation, { target: { value:
      "ARCHIVE ROBINHOOD LIVE ACCEPTANCE brokerage_connection:test room:test" } });
    fireEvent.click(screen.getByRole("button", {
      name: "Archive accepted canary",
    }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/live-acceptance-archives$/u),
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: expect.stringContaining(
          "ARCHIVE ROBINHOOD LIVE ACCEPTANCE brokerage_connection:test room:test",
        ),
      }),
    ));
    expect(await screen.findByText(/ARCHIVED/u)).toBeTruthy();
    expect(screen.getByText(archive.evidence_hash)).toBeTruthy();
  });
});
