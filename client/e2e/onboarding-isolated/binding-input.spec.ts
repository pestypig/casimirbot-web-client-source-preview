import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { buildHelixAgentClientReadiness } from "../../../shared/helix-agent-client-readiness";
import { helixAgentConnectionStatusSchema } from "../../../shared/helix-agent-client-profile";
import { DESKTOP_MCP_TUNNEL_STATE_SCHEMA_VERSION } from "../../../shared/desktop-mcp-tunnel";

let server: Server;
let origin: string;
test.beforeAll(async () => {
  const bundle = await build({
    entryPoints: [path.resolve("client/e2e/onboarding-isolated/entry.tsx")],
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared") },
    define: { "process.env.NODE_ENV": '"test"', "import.meta.env": "{}" },
  });
  server = createServer((req, res) => {
    if (req.url === "/fixture.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].text);
    } else if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end('<!doctype html><html><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture_listener_missing");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

for (const input of ["pointer", "keyboard"] as const) {
  test(`O4 failed trust status recovers through ${input} with zero consent writes`, async ({ page }) => {
    await page.setViewportSize({ width: input === "pointer" ? 375 : 1280, height: 640 });
    await page.addInitScript(() => {
      Object.defineProperty(window, "casimirDesktop", { value: { getRuntimeSnapshot: async () => null } });
    });
    let reads = 0;
    const writes: string[] = [];
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (route.request().method() !== "GET") writes.push(url.pathname);
      if (url.pathname === "/api/desktop/mcp-tunnel-transition/full-harness-trust") {
        if (++reads === 1) return route.fulfill({ status: 503, json: { message: "fixture-private-read-failure" } });
        return route.fulfill({ json: { trust: {
          schema: "helix.installed_device_full_harness_trust.v1", trusted: false,
          device_ref: "device:sha256:fixture", policy_revision: 0,
          authority_limited_to_tunnel_transport: true, environment_authority_granted: false,
          trading_authority_granted: false, answer_authority: false, terminal_eligible: false,
        } } });
      }
      return route.fulfill({ status: 401, json: { error: "fixture_session_required" } });
    });
    await page.goto(origin);
    const trust = page.getByRole("button", { name: "Trust this device for Full Harness", exact: true });
    const recheck = page.getByRole("button", { name: "Recheck device trust", exact: true });
    await expect(trust).toBeDisabled();
    await expect(page.getByText("fixture-private-read-failure")).toHaveCount(0);
    if (input === "pointer") await recheck.click();
    else { await recheck.focus(); await page.keyboard.press("Enter"); }
    await expect(trust).toBeEnabled();
    await expect(recheck).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove Full Harness device trust", exact: true })).toHaveCount(0);
    expect(reads).toBe(2);
    expect(writes).toEqual([]);
  });

  test(`O4 unregistered device recovery through ${input} never submits consent during navigation`, async ({ page }) => {
    await page.setViewportSize({ width: input === "pointer" ? 375 : 1280, height: 640 });
    await page.addInitScript(() => {
      Object.defineProperty(window, "casimirDesktop", { value: { getRuntimeSnapshot: async () => null } });
      window.addEventListener("helix-workstation-guidance", event => {
        document.documentElement.dataset.fixtureGuidancePanel = (event as CustomEvent).detail.panelId;
      });
    });
    let registered = false;
    const writes: string[] = [];
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (!url.pathname.startsWith("/api/")) return route.continue();
      const put = route.request().method() === "PUT";
      if (route.request().method() !== "GET") writes.push(url.pathname);
      if (url.pathname === "/api/desktop/mcp-tunnel-transition/full-harness-trust") {
        if (put && !registered) return route.fulfill({ status: 404,
          json: { error: "device_not_registered", message: "fixture-private-detail" } });
        return route.fulfill({ json: { trust: {
          schema: "helix.installed_device_full_harness_trust.v1", trusted: put && registered,
          device_ref: "device:sha256:fixture", policy_revision: put ? 1 : 0,
          authority_limited_to_tunnel_transport: true, environment_authority_granted: false,
          trading_authority_granted: false, answer_authority: false, terminal_eligible: false,
        } } });
      }
      return route.fulfill({ status: 401, json: { error: "fixture_session_required" } });
    });
    await page.goto(origin);
    const trust = page.getByRole("button", { name: "Trust this device for Full Harness", exact: true });
    await expect(trust).toBeEnabled();
    const activate = async (button: typeof trust) => {
      if (input === "pointer") await button.click();
      else { await button.focus(); await page.keyboard.press("Enter"); }
    };
    await activate(trust);
    await expect(page.getByText(/this device is not registered or is no longer active/i)).toBeVisible();
    await expect(page.getByText("fixture-private-detail")).toHaveCount(0);
    await activate(page.getByRole("button", { name: "Open Connections, Billing & Security", exact: true }));
    await expect(page.locator("html")).toHaveAttribute("data-fixture-guidance-panel", "connections-billing-security");
    expect(writes).toEqual(["/api/desktop/mcp-tunnel-transition/full-harness-trust"]);
    // HTTP fixture only: simulate completed registration, then a separate consent click.
    registered = true;
    await activate(trust);
    await expect(page.getByRole("button", { name: "Remove Full Harness device trust", exact: true })).toBeVisible();
    expect(writes).toHaveLength(2);
    await expect(page.getByRole("button", { name: "Open Connections, Billing & Security", exact: true })).toHaveCount(0);
  });

  test(`signed-out account entry supports ${input} without authenticating`, async ({ page }) => {
    const mutations: string[] = [];
    await page.addInitScript(() => {
      window.addEventListener("helix-workstation-guidance", event => {
        document.documentElement.dataset.fixtureGuidancePanel = (event as CustomEvent).detail.panelId;
      });
    });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (route.request().method() !== "GET") mutations.push(url.pathname);
      return route.fulfill({ status: 401, json: { error: "fixture_session_required" } });
    });
    await page.goto(origin);
    const button = page.getByRole("button", { name: "Open account sign-in", exact: true });
    await expect(button).toBeVisible();
    if (input === "pointer") await button.click();
    else { await button.focus(); await page.keyboard.press("Enter"); }
    await expect(page.locator("html")).toHaveAttribute("data-fixture-guidance-panel", "account-session");
    expect(mutations).toEqual([]);
    await expect(page.getByText("Sign in to CasimirBot", { exact: true })).toBeVisible();
  });
}

for (const input of ["pointer", "keyboard"] as const) {
 for (const clipboard of ["available", "denied", "missing", "hung"] as const) {
  test(`real ${input} binds once and copies with ${clipboard} clipboard`, async ({ page, context }) => {
    if (clipboard === "available") {
      await page.addInitScript(schemaVersion => {
        Object.defineProperty(window, "casimirDesktop", { value: {
          getRuntimeSnapshot: async () => null,
          getMcpTunnelState: async () => ({ schemaVersion,
            transport: "openai_secure_mcp_tunnel", access: "developer_private",
            scope: "local_supervisor_coordination_and_device_check", status: "ready",
            configured: true, vaultAvailable: true, binaryVersion: "0.0.13",
            processRunning: true, healthy: true, ready: true, adminUiAvailable: true, failureCode: null,
            recovery: { phase: "idle", attemptCount: 0, maxAttempts: 3, nextAttemptAt: null,
              lastReason: null, automaticScope: "local_supervisor_coordination_and_device_check",
              manualInterventionRequired: false },
          }),
          startMcpTunnel: async () => { throw new Error("fixture_unexpected_native_start"); },
        } });
      }, DESKTOP_MCP_TUNNEL_STATE_SCHEMA_VERSION);
    }
    if (clipboard === "available") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    } else {
      await page.addInitScript(mode => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "missing" ? undefined : {
          writeText: () => mode === "hung" ? new Promise(() => {}) : Promise.reject(new DOMException("Fixture denial", "NotAllowedError")),
        } });
      }, clipboard);
    }
    const submissions: unknown[] = [];
    const readiness = buildHelixAgentClientReadiness({ agentSelected: true,
      provider_application: "available", client_authorization: "active", client_presence: "online",
      catalog_sync: "current", thread_attachment: "attached", continuation_readiness: "polling",
      environment_readiness: "not_selected" });
    const status = {
      schema: "helix.agent_connection_status.v1", selected_client_profile: "codex_app",
      selected_profile_is_preference_only: true, client_kind_verified: false,
      authenticated_profile_ref: "fixture-owner", service_instance_ref: "fixture-service",
      oauth_binding_ref: "fixture-oauth", authenticated_mcp_client_ref: "fixture-client",
      client_session_ref: "fixture-session", conversation_thread_ref: "fixture-task",
      proof_basis: "authenticated_presence_tool", observed_at: new Date().toISOString(),
      heartbeat_expires_at: new Date(Date.now() + 180_000).toISOString(),
      authorization_changed_after_presence: false, catalog_reenumeration_required: false,
      catalog_recovery: "none", readiness, readiness_schema: readiness.schema,
      verified_run_association: { run_id: "fixture-run", run_version: 1,
        room_id: "fixture-room", verification_ref: "fixture-verification",
        room_binding_id: "fixture-room-binding", room_binding_version: 1 },
      thread_observability_bridge: { negotiated_level: "continuation_ready",
        declaration_basis: "authenticated_client_declaration", checkpoint_publication_status: "not_requested",
        checkpoint_freshness_window_seconds: null, checkpoint_retention: "none",
        checkpoint_revocation: "not_applicable", provider_thread_content_included: false,
        hidden_reasoning_included: false, activity_completeness_claimed: false },
      credential_included: false, oauth_subject_included: false, raw_claims_included: false,
      provider_thread_content_included: false, hidden_reasoning_included: false,
      environment_authority: false, mutation_authority: false, answer_authority: false, terminal_eligible: false,
    };
    helixAgentConnectionStatusSchema.parse(status);
    // Every API request is intercepted; no real consent or authority is created.
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname.endsWith("/readiness")) return route.fulfill({ json: status });
      if (url.pathname.endsWith("/claims")) {
        submissions.push(route.request().postDataJSON());
        return route.fulfill({ status: 201, json: { claim_handle: "fixture-show-once-claim",
          binding: { reasoning_binding_id: "fixture-binding", helix_conversation_id: "fixture-chat",
            status: "pending_claim", continuation_transport: "polling", binding_epoch: 1,
            run_id: "fixture-run", service_instance_ref: "fixture-service",
            expires_at: new Date(Date.now() + 120_000).toISOString() } } });
      }
      return route.fulfill({ status: 404, json: { error: "fixture_not_found" } });
    });
    await page.goto(origin);
    const checkbox = page.getByRole("checkbox", { name: /Include this verified environment run/ });
    await expect(checkbox).toBeEnabled();
    if (input === "pointer") await checkbox.click();
    else { await checkbox.focus(); await page.keyboard.press("Space"); }
    await expect(checkbox).toBeChecked();
    if (clipboard === "available") {
      // A native attention event must retain the user's actual pointer/keyboard
      // selection when transport is limited, without inventing a sign-out.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("helix-workstation-guidance", {
        detail: { kind: "user_attention", panelId: "agent-access", targetId: "full-harness-trust",
          label: "Review fixture device trust." },
      })));
      await expect(page.getByText(/native connection is ready for Device Check and supervisor coordination/)).toBeVisible();
      await expect(page.getByText("Sign in to CasimirBot", { exact: true })).toHaveCount(0);
      await expect(checkbox).toBeChecked();
      expect(submissions).toEqual([]);
    }
    await page.getByRole("button", { name: "Recheck connection", exact: true }).click();
    await expect(checkbox).toBeChecked();
    const bind = page.getByRole("button", { name: "Bind current Helix chat", exact: true });
    if (input === "pointer") await bind.click();
    else { await bind.focus(); await page.keyboard.press("Enter"); }
    await expect(page.getByLabel("Show-once claim handle", { exact: true })).toHaveValue("fixture-show-once-claim");
    expect(submissions).toEqual([{ client_session_ref: "fixture-session",
      helix_conversation_id: "fixture-chat", run_id: "fixture-run",
      run_verification_ref: "fixture-verification" }]);
    const copy = page.getByRole("button", { name: "Copy invitation", exact: true });
    if (input === "pointer") await copy.click();
    else { await copy.focus(); await page.keyboard.press("Enter"); }
    if (clipboard === "available") {
      await expect(page.getByText("Invitation copied.", { exact: false })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("fixture-show-once-claim");
    } else {
      await expect(page.getByText("Automatic copy could not be confirmed.", { exact: false })).toBeVisible({ timeout: 7000 });
      const field = page.getByLabel("Show-once claim handle", { exact: true });
      await expect(field).toBeFocused();
      expect(await field.evaluate((node: HTMLInputElement) => node.value.slice(node.selectionStart!, node.selectionEnd!))).toBe("fixture-show-once-claim");
    }
    expect(submissions).toHaveLength(1);
  });
 }
}
