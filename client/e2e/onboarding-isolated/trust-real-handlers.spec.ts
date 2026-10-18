import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import express from "express";
import { newDb } from "pg-mem";

let browserScript: string;
let modules: typeof import("./trust-real-handler-exports");
let bundleDirectory: string;
test.beforeAll(async () => {
  const browser = await build({ entryPoints: [path.resolve("client/e2e/onboarding-isolated/entry.tsx")],
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "import.meta.env": "{}" } });
  browserScript = browser.outputFiles[0].text;
  const accountModule = path.resolve("server/services/helix-account/account-session-store");
  const bundled = await build({ entryPoints: [path.resolve("client/e2e/onboarding-isolated/trust-real-handler-exports.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", logLevel: "silent",
    plugins: [{ name: "isolated-trust-account-resolver", setup(builder) {
      builder.onResolve({ filter: /account-session-store$/ }, args =>
        path.resolve(args.resolveDir, args.path) === accountModule
          ? { path: path.resolve("client/e2e/onboarding-isolated/trust-session-fixture.ts") }
          : undefined);
    } }],
  });
  const tmpRoot = path.resolve(".tmp");
  await fs.mkdir(tmpRoot, { recursive: true });
  bundleDirectory = await fs.mkdtemp(path.join(tmpRoot, "onboarding-trust-handlers-"));
  const file = path.join(bundleDirectory, "runtime.cjs");
  await fs.writeFile(file, bundled.outputFiles[0].contents);
  modules = createRequire(import.meta.url)(file);
});
test.afterAll(async () => {
  if (bundleDirectory?.startsWith(path.resolve(".tmp") + path.sep)) {
    await fs.rm(bundleDirectory, { recursive: true, force: true });
  }
});

for (const input of ["pointer", "keyboard"] as const) {
  test(`O5 real trust handlers recover a committed lost reply through ${input} without replay`, async ({ page, context }) => {
    const { fixtureTrustSessions, createDesktopMcpTunnelTransitionRouter, DesktopMcpTunnelTransitionStore,
      InstalledSecurityStore, migration026, migration070, migration081 } = modules;
    const owner = { sessionId: "fixture-trust-browser-session", profileId: "fixture-trust-owner" };
    const deviceId = "desktop_device_AAAAAAAAAAAAAAAAAAAAAA";
    const now = new Date("2026-09-13T21:00:00Z");
    const memory = newDb({ autoCreateForeignKeyIndices: true });
    const pool = new (memory.adapters.createPg().Pool)();
    let server: ReturnType<typeof createServer> | undefined;
    try {
      const client = await pool.connect();
      try { for (const migration of [migration026, migration070, migration081]) await migration.run(client, { enablePgvector: false }); }
      finally { client.release(); }
      await pool.query(`INSERT INTO helix_accounts
        (profile_id, display_name, account_type, provider, created_at, updated_at)
        VALUES ($1, 'Fixture', 'developer', 'local', $2, $2)`, [owner.profileId, now.toISOString()]);
      await pool.query(`INSERT INTO helix_account_sessions
        (session_id, profile_id, status, memory_scope, account_policy, created_at, updated_at, expires_at)
        VALUES ($1, $2, 'active', 'profile', $3::jsonb, $4, $4, $5)`,
      [owner.sessionId, owner.profileId, JSON.stringify({ account_type: "developer" }),
        now.toISOString(), new Date(now.getTime() + 3_600_000).toISOString()]);
      fixtureTrustSessions.set(owner.sessionId, { session_id: owner.sessionId, status: "active",
        profile: { profile_id: owner.profileId }, account_policy: { account_type: "developer" } });
      const security = new InstalledSecurityStore({ pool, now: () => now, persist: async () => {} });
      // Isolated device fixture; no real MFA receipt or production account is used.
      await security.registerDevice({ session: owner, deviceId });
      const endpoint = "/api/desktop/mcp-tunnel-transition/full-harness-trust";
      const app = express();
      let handledWrites = 0;
      app.use("/api/desktop/mcp-tunnel-transition", (req, _res, next) => {
        if (req.method === "PUT") handledWrites++;
        next();
      }, createDesktopMcpTunnelTransitionRouter({
        store: new DesktopMcpTunnelTransitionStore("service_instance:fixture-trust-browser"),
        installedSecurityStore: security, desktopDeviceId: deviceId, desktopHostEnabled: true,
      }));
      app.get("/fixture.js", (_req, res) => res.type("js").send(browserScript));
      app.get("/", (_req, res) => res.type("html").send('<div id="root"></div><script src="/fixture.js"></script>'));
      server = createServer(app);
      await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("fixture_listener_missing");
      const origin = `http://127.0.0.1:${address.port}`;
      await context.addCookies([{ name: "helix_session", value: owner.sessionId, url: origin, httpOnly: true }]);
      await page.addInitScript(() => {
        Object.defineProperty(window, "casimirDesktop", { value: { getRuntimeSnapshot: async () => null } });
      });
      let dropped = false;
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort("blockedbyclient");
        if (url.pathname === endpoint && route.request().method() === "PUT" && !dropped) {
          dropped = true;
          const result = await route.fetch();
          expect(result.status()).toBe(200);
          expect((await result.json()).trust).toMatchObject({ trusted: true, policy_revision: 1 });
          // Lose the browser response only after the actual SQL store committed.
          return route.abort("failed");
        }
        return route.continue();
      });
      await page.setViewportSize({ width: input === "pointer" ? 375 : 1280, height: 640 });
      await page.goto(origin);
      const activate = async (name: string) => {
        const button = page.getByRole("button", { name, exact: true });
        await expect(button).toBeEnabled();
        if (input === "pointer") await button.click();
        else { await button.focus(); await page.keyboard.press("Enter"); }
      };
      await activate("Trust this device for Full Harness");
      await expect(page.getByText(/could not confirm the trusted-device change/i)).toBeVisible();
      expect(handledWrites).toBe(1);
      await activate("Recheck device trust");
      await expect(page.getByRole("button", { name: "Remove Full Harness device trust", exact: true })).toBeEnabled();
      expect(handledWrites).toBe(1);
      await activate("Remove Full Harness device trust");
      await expect(page.getByRole("button", { name: "Trust this device for Full Harness", exact: true })).toBeEnabled();
      expect(handledWrites).toBe(2);
      const stale = await context.request.put(origin + endpoint, {
        headers: { Origin: origin, "Sec-Fetch-Site": "same-origin" },
        data: { trusted: true, expected_policy_revision: 0 },
      });
      expect(stale.status()).toBe(409);
      expect(await stale.json()).toMatchObject({ error: "device_trust_revision_changed", environment_authority_granted: false });
      expect(await security.inspectFullHarnessTrust({ profileId: owner.profileId, deviceId }))
        .toMatchObject({ trusted: false, policy_revision: 2 });
      const events = await pool.query("SELECT event_type FROM helix_account_events WHERE event_type IN ('full_harness_device_trust_granted', 'full_harness_device_trust_revoked')");
      expect(events.rows.map(row => row.event_type).sort()).toEqual([
        "full_harness_device_trust_granted", "full_harness_device_trust_revoked",
      ]);
      const denied = await context.request.get(origin + endpoint, { headers: { Cookie: "helix_session=fixture-unknown-session" } });
      expect(denied.status()).toBe(401);
    } finally {
      fixtureTrustSessions.clear();
      if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
      await pool.end();
    }
  });
}
