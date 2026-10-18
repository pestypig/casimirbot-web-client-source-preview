// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHelixInstalledAccountServices } from "@shared/helix-installed-account-services";
import {
  AUTH0_MFA_ACR,
  type HelixInstalledSecurityStatus,
} from "@shared/desktop-auth0-step-up";
import InstalledServicesPanel from "../InstalledServicesPanel";
import type { HelixBillingEntitlement } from
  "@shared/helix-billing-entitlement";

const testState = vi.hoisted(() => ({
  runtime: {
    surface: "desktop_native",
    nativeHandshake: "ready",
    capabilities: {},
  },
  openPanel: vi.fn(),
}));

vi.mock("@/lib/runtime/RuntimeSurfaceProvider", () => ({
  useRuntimeSurface: () => testState.runtime,
}));

vi.mock("@/store/useWorkstationLayoutStore", () => ({
  useWorkstationLayoutStore: (selector: (state: unknown) => unknown) => selector({
    openPanelInActiveGroup: testState.openPanel,
  }),
}));

vi.mock("@/components/workstation/BrokerageConnectionsCard", () => ({
  BrokerageConnectionsCard: () => (
    <div data-testid="brokerage-connections-card">Robinhood connection management</div>
  ),
}));

const projection = buildHelixInstalledAccountServices({
  profileRef: "profile:developer",
  providerCredentialBrokerReady: true,
  now: new Date("2026-08-27T12:00:00.000Z"),
});

const securityStatus: HelixInstalledSecurityStatus = {
  schema: "helix.installed_security_status.v1",
  ok: true,
  generated_at: "2026-08-27T12:00:00.000Z",
  profile_ref: "profile:developer",
  current_session_ref: "session:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  mfa: {
    provider: "auth0",
    configured: true,
    fresh_step_up_available: true,
    required_acr: AUTH0_MFA_ACR,
    maximum_age_seconds: 300,
    factor_detail_included: false,
  },
  current_device: {
    device_ref: "device:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    label: "This Windows device",
    platform: "windows",
    status: "unregistered",
    registered_at: null,
    last_seen_at: null,
    revoked_at: null,
    recovery_generation: 0,
  },
  sessions: [],
  recent_events: [],
  agent_authority: {
    may_inspect_sanitized_status: true,
    may_start_step_up: false,
    may_complete_mfa: false,
    may_receive_usable_receipt: false,
    may_register_or_recover_device: false,
    may_revoke_session: false,
  },
  usable_receipt_included: false,
  identity_token_included: false,
  access_token_included: false,
  factor_detail_included: false,
};

const stepUpStart = {
  schema: "helix.auth0_step_up_start.v1",
  ok: true,
  authorization_url: "https://tenant.example.auth0.com/authorize?state=test",
  purpose: "device_register",
  target_ref: securityStatus.current_device.device_ref,
  expires_at: "2026-08-27T12:10:00.000Z",
  provider: "auth0",
  pkce: "S256",
  nonce_bound: true,
  mfa_acr_requested: AUTH0_MFA_ACR,
  usable_receipt_included: false,
  identity_token_included: false,
  access_token_included: false,
  factor_detail_included: false,
};

const supervisorStatus = {
  schema: "helix.local_supervisor_status.v1",
  service_instance_ref: "service_instance:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  workspace_ref: `workspace:${"b".repeat(64)}`,
  started_at: "2026-08-27T12:00:00.000Z",
  ready: true,
  supervisor_mode: "desktop_single_instance",
  one_instance_enforced: true,
  attach_supported: true,
  client_isolation_dimensions: [
    "account_session",
    "oauth_client",
    "conversation_thread",
    "room_participant",
    "run_turn",
    "environment_source_epoch",
    "execution_lease",
  ],
  concurrent_read_admission: "grant_scoped",
  mutation_admission: "serialized_execution_lease",
  credential_included: false,
  private_endpoint_included: false,
  workspace_path_included: false,
  process_identity_included: false,
  account_identity_included: false,
  content_role: "local_supervisor_status_not_authority",
  answer_authority: false,
  terminal_eligible: false,
} as const;

const billingStatus: HelixBillingEntitlement = {
  schema: "helix.billing_entitlement.v1",
  ok: true,
  generated_at: "2026-08-27T12:00:00.000Z",
  profile_ref: "profile:developer",
  processor: "stripe",
  environment: "sandbox",
  status: "sandbox_ready",
  plan_id: null,
  currency: "usd",
  balance: {
    included_credit_minor: 1000,
    prepaid_credit_minor: 500,
    adjustments_minor: -200,
    available_credit_minor: 1300,
    hard_account_ceiling_minor: 2500,
  },
  period: { starts_at: null, ends_at: null },
  recent_ledger: [{
    entry_ref: "billing_entry:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    kind: "prepaid_credit",
    amount_minor: 500,
    currency: "usd",
    created_at: "2026-08-27T12:00:00.000Z",
    reference_entry_ref: null,
  }],
  checkout: { hosted_only: true, available: false, payment_fields_present: false },
  portal: { hosted_only: true, available: false, customer_reference_included: false },
  authority: {
    owner_may_start_checkout: false,
    owner_may_manage_subscription: false,
    agent_may_inspect: true,
    agent_may_purchase: false,
    agent_may_refund: false,
    agent_may_adjust: false,
    agent_may_raise_ceiling: false,
    provider_traffic_enabled: false,
    billable_lease_enabled: false,
  },
  stripe_customer_included: false,
  stripe_subscription_included: false,
  payment_instrument_included: false,
  webhook_secret_included: false,
  raw_processor_object_included: false,
};

describe("InstalledServicesPanel", () => {
  it.each(["authentication_clock_skew", "authentication_stale"])(
    "shows actionable recovery without granting authority for %s",
    async (error) => {
      let complete!: (candidate: unknown) => void;
      vi.mocked(window.casimirDesktop!.onAuth0StepUpCompletion!)
        .mockImplementation((listener) => {
          complete = listener;
          return () => undefined;
        });
      render(<InstalledServicesPanel />);
      await waitFor(() => expect(complete).toBeDefined());
      fireEvent.click(screen.getByRole("tab", { name: "Device & Security" }));
      act(() => complete({
        schema: "helix.auth0_step_up_completion.v1",
        ok: false,
        error,
        usable_receipt_included: false,
        identity_token_included: false,
        access_token_included: false,
        factor_detail_included: false,
      }));
      expect(screen.getByText(error === "authentication_clock_skew"
        ? /Sync Windows Date & time/
        : /signed authentication time is missing or too old/)).toBeTruthy();
      expect(screen.getByText(/No device authority was granted/)).toBeTruthy();
    },
  );
  beforeEach(() => {
    testState.runtime.surface = "desktop_native";
    testState.runtime.nativeHandshake = "ready";
    testState.openPanel.mockReset();
    Object.defineProperty(window, "casimirDesktop", {
      configurable: true,
      value: {
        openAuth0StepUp: vi.fn(async () => ({ opened: true })),
        onAuth0StepUpCompletion: vi.fn(() => () => undefined),
      },
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = url.endsWith("/api/account/security/status")
        ? securityStatus
        : url.endsWith("/api/account/security/step-up/cancel") && init?.method === "POST"
          ? {
            schema: "helix.auth0_step_up_cancel.v1",
            ok: true,
            cancelled_intent_count: 1,
            usable_receipt_included: false,
            identity_token_included: false,
            access_token_included: false,
            factor_detail_included: false,
          }
        : url.endsWith("/api/account/billing-entitlement")
          ? billingStatus
        : url.endsWith("/api/local-supervisor/status")
          ? supervisorStatus
        : url.endsWith("/api/account/security/step-up/start") && init?.method === "POST"
          ? stepUpStart
          : projection;
      return { ok: true, json: async () => body };
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the sanitized installed-node overview and accessible tabs", async () => {
    render(<InstalledServicesPanel />);

    expect(screen.getByRole("heading", {
      name: "Connections, Billing & Security",
    })).toBeTruthy();
    expect(screen.getByRole("tablist", {
      name: "Installed account services",
    })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected"))
      .toBe("true");
    expect(await screen.findByText(/Native status verified/i)).toBeTruthy();
    expect(screen.getByRole("tabpanel")).toBeTruthy();
    expect(projection.raw_credential_included).toBe(false);
    expect(projection.payment_instrument_included).toBe(false);
    expect(projection.security.raw_secret_fields_present).toBe(false);
    expect(screen.getByText("Installed node supervisor")).toBeTruthy();
    expect(screen.getByText(/Multiple authenticated Codex clients can attach/i))
      .toBeTruthy();
  });

  it("opens the public panel signed out and routes account-backed status to sign-in", async () => {
    vi.mocked(fetch).mockImplementation(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "profile_session_required" }),
    }) as Response);

    render(<InstalledServicesPanel />);

    expect(await screen.findByRole("heading", { name: "Connections, Billing & Security" })).toBeTruthy();
    expect(await screen.findByText(/Sign in to inspect this device's account services/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Account & Sessions" }));
    expect(testState.openPanel).toHaveBeenCalledWith("account-session");
  });

  it("explains that an ordinary source process cannot be upgraded by its child UI", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/local-supervisor/status")) {
        return {
          ok: true,
          json: async () => ({
            ...supervisorStatus,
            supervisor_mode: "external_process",
            one_instance_enforced: false,
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => url.endsWith("/api/account/security/status")
          ? securityStatus
          : url.endsWith("/api/account/billing-entitlement")
            ? billingStatus
            : projection,
      } as Response;
    });

    render(<InstalledServicesPanel />);
    await screen.findByText(/ordinary external process/i);

    expect(screen.getByText(/cannot retrofit parent-process authority/i)).toBeTruthy();
    expect(screen.queryByLabelText(/private key|signing key|receipt/i)).toBeNull();
  });

  it("classifies connections without rendering raw-secret enrollment", async () => {
    render(<InstalledServicesPanel />);
    await screen.findByText(/Native status verified/i);

    fireEvent.click(screen.getByRole("tab", { name: "Connections" }));

    expect(screen.getByText("Codex app")).toBeTruthy();
    expect(screen.getByText("fal image provider")).toBeTruthy();
    expect(screen.getByText("OpenAI API")).toBeTruthy();
    expect(screen.getByText("Robinhood read connection")).toBeTruthy();
    expect(screen.getByTestId("brokerage-connections-card")).toBeTruthy();
    expect(screen.getAllByText("Raw secret entry: unavailable")).toHaveLength(4);
    expect(screen.queryByLabelText(/api key|password|card number/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open Agent Access" }));
    expect(testState.openPanel).toHaveBeenCalledWith("agent-access");
    expect(screen.getAllByRole("button", { name: /Enrollment waits for SPB-6/i }))
      .toHaveLength(2);
    for (const button of screen.getAllByRole("button", {
      name: /Enrollment waits for SPB-6/i,
    })) {
      expect(button).toBeDisabled();
    }
  });

  it("shows sanitized sandbox ledger while keeping checkout unavailable and exposing owner-attended device MFA", async () => {
    render(<InstalledServicesPanel />);
    await screen.findByText(/Native status verified/i);

    fireEvent.click(screen.getByRole("tab", { name: "Billing" }));
    expect(screen.getByText("Stripe sandbox billing")).toBeTruthy();
    expect(screen.getByText("$13.00")).toBeTruthy();
    expect(screen.getByText("$25.00")).toBeTruthy();
    expect(screen.getByText("+$5.00")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Choose sandbox plan/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Add sandbox credits/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Manage sandbox subscription/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Device & Security" }));
    expect(screen.getByText("MFA and step-up")).toBeTruthy();
    expect(screen.getByText("available")).toBeTruthy();
    const register = screen.getByRole("button", {
      name: /Register this device with MFA/i,
    });
    expect(register).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Security activity" })).toBeTruthy();
    expect(screen.getByText("No installed security activity yet.")).toBeTruthy();
    fireEvent.click(register);
    await waitFor(() => expect(window.casimirDesktop?.openAuth0StepUp)
      .toHaveBeenCalledWith(stepUpStart.authorization_url));
    expect(fetch).toHaveBeenCalledWith(
      "/api/account/security/step-up/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ purpose: "device_register", target_ref: null }),
      }),
    );
    expect(screen.queryByLabelText(/receipt|identity token|access token/i)).toBeNull();
    const stopWaiting = await screen.findByRole("button", {
      name: /Stop waiting for MFA/i,
    });
    expect(register).toBeDisabled();
    fireEvent.click(stopWaiting);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/security/step-up/cancel",
      expect.objectContaining({ method: "POST", body: "{}" }),
    ));
    await waitFor(() => expect(register).toBeEnabled());
    expect(screen.queryByRole("button", { name: /Stop waiting for MFA/i }))
      .toBeNull();
    fireEvent.click(register);
    await waitFor(() => expect(window.casimirDesktop?.openAuth0StepUp)
      .toHaveBeenCalledTimes(2));
  });

  it("invalidates the intent when the owner cancels native MFA confirmation", async () => {
    vi.mocked(window.casimirDesktop!.openAuth0StepUp).mockResolvedValue({
      opened: false,
      cancelled: true,
    });
    render(<InstalledServicesPanel />);
    await screen.findByText(/Native status verified/i);
    fireEvent.click(screen.getByRole("tab", { name: "Device & Security" }));
    const register = screen.getByRole("button", {
      name: /Register this device with MFA/i,
    });
    fireEvent.click(register);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/security/step-up/cancel",
      expect.objectContaining({ method: "POST", body: "{}" }),
    ));
    await waitFor(() => expect(register).toBeEnabled());
    expect(screen.queryByRole("button", { name: /Stop waiting for MFA/i }))
      .toBeNull();
  });

  it("invalidates the intent and explains a missing native callback route", async () => {
    vi.mocked(window.casimirDesktop!.openAuth0StepUp).mockRejectedValue(
      new Error("Error invoking remote method 'step-up': Error: desktop_auth0_callback_route_unavailable"),
    );
    render(<InstalledServicesPanel />);
    await screen.findByText(/Native status verified/i);
    fireEvent.click(screen.getByRole("tab", { name: "Device & Security" }));
    const register = screen.getByRole("button", { name: /Register this device with MFA/i });
    fireEvent.click(register);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/security/step-up/cancel",
      expect.objectContaining({ method: "POST", body: "{}" }),
    ));
    expect(await screen.findByRole("status")).toHaveTextContent("cannot receive its Auth0 callback");
    expect(register).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Stop waiting for MFA/i })).toBeNull();
  });

  it("starts configured sandbox Checkout only through owner-auth-required MFA", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/account/billing-entitlement")) {
        return {
          ok: true,
          json: async () => ({
            ...billingStatus,
            checkout: { ...billingStatus.checkout, available: true },
            portal: { ...billingStatus.portal, available: true },
            authority: {
              ...billingStatus.authority,
              owner_may_start_checkout: true,
              owner_may_manage_subscription: true,
            },
          }),
        } as Response;
      }
      if (url.endsWith("/api/account/security/step-up/start") && init?.method === "POST") {
        const requestBody = JSON.parse(String(init.body)) as {
          target_ref: string;
        };
        return {
          ok: true,
          json: async () => ({
            ...stepUpStart,
            purpose: "payment_change",
            target_ref: requestBody.target_ref,
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => url.endsWith("/api/account/security/status")
          ? securityStatus
          : url.endsWith("/api/local-supervisor/status")
            ? supervisorStatus
            : projection,
      } as Response;
    });
    render(<InstalledServicesPanel />);
    await screen.findByText(/Native status verified/i);
    fireEvent.click(screen.getByRole("tab", { name: "Billing" }));
    const checkoutButton = screen.getByRole("button", {
      name: /Choose sandbox plan with MFA/i,
    });
    expect(checkoutButton).toBeEnabled();
    expect(checkoutButton.getAttribute("data-helix-authority-state"))
      .toBe("owner_auth_required");
    const portalButton = screen.getByRole("button", {
      name: /Manage sandbox subscription with MFA/i,
    });
    expect(portalButton).toBeEnabled();
    expect(portalButton.getAttribute("data-helix-authority-state"))
      .toBe("owner_auth_required");
    fireEvent.click(checkoutButton);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/security/step-up/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          purpose: "payment_change",
          target_ref: "billing_checkout:plan:starter_monthly",
        }),
      }),
    ));
    expect(window.casimirDesktop?.openAuth0StepUp).toHaveBeenCalled();
  });

  it("starts hosted subscription management only through owner-auth-required MFA", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/account/billing-entitlement")) {
        return {
          ok: true,
          json: async () => ({
            ...billingStatus,
            portal: { ...billingStatus.portal, available: true },
            authority: {
              ...billingStatus.authority,
              owner_may_manage_subscription: true,
            },
          }),
        } as Response;
      }
      if (url.endsWith("/api/account/security/step-up/start") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ...stepUpStart,
            purpose: "payment_change",
            target_ref: "billing_portal:manage_subscription",
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => url.endsWith("/api/account/security/status")
          ? securityStatus
          : url.endsWith("/api/local-supervisor/status")
            ? supervisorStatus
            : projection,
      } as Response;
    });
    render(<InstalledServicesPanel />);
    await screen.findByText(/Native status verified/i);
    fireEvent.click(screen.getByRole("tab", { name: "Billing" }));
    const portalButton = screen.getByRole("button", {
      name: /Manage sandbox subscription with MFA/i,
    });
    expect(portalButton).toBeEnabled();
    fireEvent.click(portalButton);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/security/step-up/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          purpose: "payment_change",
          target_ref: "billing_portal:manage_subscription",
        }),
      }),
    ));
    expect(window.casimirDesktop?.openAuth0StepUp).toHaveBeenCalled();
  });

  it("shows an installed-app boundary on website surfaces without fetching", async () => {
    testState.runtime.surface = "web";
    testState.runtime.nativeHandshake = "not_available";

    render(<InstalledServicesPanel />);

    expect(screen.getByText("Installed app required")).toBeTruthy();
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  });
});
