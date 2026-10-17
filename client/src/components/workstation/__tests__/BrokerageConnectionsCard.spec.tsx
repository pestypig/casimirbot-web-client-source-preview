// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrokerageConnectionsCard } from
  "@/components/workstation/BrokerageConnectionsCard";

const response = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  { status, headers: { "content-type": "application/json" } },
);

describe("BrokerageConnectionsCard", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.casimirDesktop;
  });

  it("starts Robinhood OAuth only through the admitted hosted origin", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = input.toString();
      if (url.endsWith("/brokerage-connections") && !init?.method) {
        return response({ connections: [] });
      }
      if (url.endsWith("/robinhood/oauth/start")) {
        return response({
          authorization_url:
            "https://robinhood.com/oauth?state=safe-test-state",
        }, 201);
      }
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    render(<BrokerageConnectionsCard />);

    expect(await screen.findByText("Profile connections")).toBeTruthy();
    await screen.findByText("No Robinhood connection is stored for this profile.");
    expect(screen.queryByLabelText(/api key|token|secret|password/iu)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Connect Robinhood" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith(
      "https://robinhood.com/oauth?state=safe-test-state",
      "casimirbot-robinhood-oauth",
      expect.stringContaining("noopener"),
    ));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agi/brokerage-connections/robinhood/oauth/start",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
    expect(await screen.findByText(/Finish authorization in the Robinhood window/u)).toBeTruthy();
  });

  it("uses the validated native shell bridge in the packaged desktop", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
      const url = input.toString();
      if (url.endsWith("/brokerage-connections") && !init?.method) {
        return response({ connections: [] });
      }
      if (url.endsWith("/robinhood/oauth/start")) {
        return response({
          authorization_url:
            "https://robinhood.com/oauth?state=safe-test-state",
        }, 201);
      }
      return response({}, 404);
    }));
    const nativeOpen = vi.fn(async () => ({ opened: true }));
    window.casimirDesktop = Object.freeze({
      getRuntimeSnapshot: async () => ({}),
      openRobinhoodOAuth: nativeOpen,
    });
    const popupOpen = vi.spyOn(window, "open");
    render(<BrokerageConnectionsCard />);

    await screen.findByText("No Robinhood connection is stored for this profile.");
    fireEvent.click(screen.getByRole("button", { name: "Connect Robinhood" }));
    await waitFor(() => expect(nativeOpen).toHaveBeenCalledWith(
      "https://robinhood.com/oauth?state=safe-test-state",
    ));
    expect(popupOpen).not.toHaveBeenCalled();
  });

  it("shows only sanitized read status and keeps orders disabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({
      connections: [{
        schema: "helix.brokerage_connection.v1",
        connection_id: "brokerage_connection:test",
        provider: "robinhood",
        environment_domain: "brokerage",
        status: "connected",
        account_selection_status: "pending",
        provider_account_label: null,
        capability_ids: ["brokerage.robinhood.portfolio.read"],
        read_only: true,
        upstream_tool_execution_enabled: false,
        live_order_execution_enabled: false,
        connected_at: "2026-08-11T12:00:00.000Z",
        credential_expires_at: null,
        updated_at: "2026-08-11T12:00:00.000Z",
        credential_included: false,
        account_numbers_included: false,
        raw_provider_payload_included: false,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      }],
    })));
    render(<BrokerageConnectionsCard />);
    expect(await screen.findByText("Robinhood · connected")).toBeTruthy();
    expect(screen.getByText(/1 read capabilities · orders disabled/u)).toBeTruthy();
    expect(document.body.textContent).not.toContain("account_number");
  });
});
