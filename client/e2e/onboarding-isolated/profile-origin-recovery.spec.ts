import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";

test.setTimeout(60_000);
let script: string;
let modules: typeof import("./profile-recovery-exports");
let bundleDirectory: string;
const envKeys = ["NODE_ENV", "DATABASE_URL", "HELIX_LOCAL_PG_MEM_PERSIST",
  "HELIX_PROVIDER_CREDENTIAL_BROKER_ORIGIN", "HELIX_PROVIDER_CREDENTIAL_BROKER_TOKEN"] as const;
const previousEnv = new Map(envKeys.map(key => [key, process.env[key]]));

test.beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "";
  process.env.HELIX_LOCAL_PG_MEM_PERSIST = "0";
  const client = await build({ entryPoints: [path.resolve("client/e2e/onboarding-isolated/profile-recovery-entry.tsx")],
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared") },
    define: { "process.env.NODE_ENV": '"test"', "import.meta.env": "{}" } });
  script = client.outputFiles[0].text;
  const server = await build({ entryPoints: [path.resolve("client/e2e/onboarding-isolated/profile-recovery-exports.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", logLevel: "silent" });
  const tmpRoot = path.resolve(".tmp");
  await fs.mkdir(tmpRoot, { recursive: true });
  bundleDirectory = await fs.mkdtemp(path.join(tmpRoot, "profile-recovery-browser-"));
  const bundlePath = path.join(bundleDirectory, "runtime.cjs");
  await fs.writeFile(bundlePath, server.outputFiles[0].contents);
  modules = createRequire(import.meta.url)(bundlePath);
});

test.afterAll(async () => {
  await modules?.resetDbClient();
  for (const [key, value] of previousEnv) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  if (bundleDirectory && path.resolve(bundleDirectory).startsWith(path.resolve(".tmp") + path.sep)) {
    await fs.rm(bundleDirectory, { recursive: true, force: true });
  }
});

test("O5 real account events recheck mounted setup after sign-in and sign-out", async ({ page }) => {
  await modules.resetAccountSessionStore();
  const app = express();
  app.use(express.json());
  app.use("/api/account", modules.accountSessionRouter);
  app.use("/api/account", modules.createAgentConnectionsRouter({
    coordinationStore: { serviceInstanceRef: "service:isolated-account-events", listPresence: () => [] },
  }));
  app.get("/fixture.js", (_req, res) => res.type("js").send(script));
  app.get("/", (_req, res) => res.type("html").send('<div id="root"></div><script src="/fixture.js"></script>'));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture_listener_missing");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await page.route("**/*", route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort("blockedbyclient"));
    await page.goto(`${origin}/?account-events`);
    await page.getByRole("button", { name: /Codex App/i }).click();
    await expect(page.getByRole("heading", { name: "Sign in to CasimirBot", exact: true })).toBeVisible();
    const observed: number[] = [];
    page.on("response", response => {
      if (response.url().startsWith(`${origin}/api/account/session/agent-connections/readiness?`)) observed.push(response.status());
    });
    await page.getByRole("button", { name: "Sign in fixture account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in to CasimirBot", exact: true })).not.toBeVisible();
    await expect.poll(() => observed).toContain(200);
    await page.getByRole("button", { name: "Sign out fixture account", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Sign in to CasimirBot", exact: true })).toBeVisible();
    await expect.poll(() => observed).toContain(401);
  } finally {
    await page.goto("about:blank");
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

for (const input of ["pointer", "keyboard"] as const) {
  test(`O4/O5 ${input}: authenticated profile restores chat and setup on a new port`, async ({ page, context }) => {
    await modules.resetAccountSessionStore();
    const broker = await modules.startDesktopProviderCredentialBroker({
      keyring: { activeKey: randomBytes(32).toString("base64url"), retiredKeys: [] },
    });
    process.env.HELIX_PROVIDER_CREDENTIAL_BROKER_ORIGIN = broker.origin;
    process.env.HELIX_PROVIDER_CREDENTIAL_BROKER_TOKEN = broker.token;
    const servers: Server[] = [];
    try {
      const owner = `profile:origin-recovery-${input}`;
      const app = express();
      app.use(express.json());
      app.use("/api/account", modules.accountSessionRouter);
      app.get("/fixture.js", (_req, res) => res.type("js").send(script));
      app.get("/", (_req, res) => res.type("html").send('<div id="root"></div><script src="/fixture.js"></script>'));
      const origins: string[] = [];
      for (let index = 0; index < 2; index++) {
        const server = createServer(app);
        servers.push(server);
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("fixture_listener_missing");
        origins.push(`http://127.0.0.1:${address.port}`);
      }
      await page.route("**/*", route => origins.includes(new URL(route.request().url()).origin)
        ? route.continue() : route.abort("blockedbyclient"));
      // Local development sign-in occurs only against the isolated real handler.
      // No fixture session authenticates to a production service.
      const signedIn = await context.request.post(`${origins[0]}/api/account/session/sign-in`, { data: { profile_id: owner } });
      expect(signedIn.status()).toBe(200);
      await page.goto(origins[0]);
      await page.getByRole("button", { name: "Create fixture chat", exact: true }).click();
      const chatId = await page.getByTestId("active-chat").textContent();
      expect(chatId).not.toBe("none");
      const choice = page.getByRole("button", { name: /Codex App/i });
      if (input === "pointer") await choice.click();
      else { await choice.focus(); await page.keyboard.press("Enter"); }
      await expect.poll(async () => {
        const saved = await modules.readProfileStorageSnapshot(owner);
        return saved.entries.some(entry => entry.storage_key === "helix.agent_connection_setup.v1" &&
          JSON.parse(entry.value).selected_profile === "codex_app") && saved.entries.some(entry =>
            entry.storage_key === "agi-chat-sessions-v1" && JSON.parse(entry.value).state.activeId === chatId);
      }, { timeout: 15_000 }).toBe(true);
      let freshSnapshotAt: number | undefined;
      page.on("response", response => {
        if (response.url() !== `${origins[1]}/api/account/profile-storage/snapshot` ||
            response.request().method() !== "GET" || response.status() !== 200) return;
        void response.finished().then(error => {
          if (!error && freshSnapshotAt === undefined) freshSnapshotAt = Date.now();
        });
      });
      await page.goto(origins[1]);
      await expect(page.getByTestId("active-chat")).toHaveText(chatId!, { timeout: 15_000 });
      await expect.poll(async () => {
        try {
          return await page.evaluate(() => {
            const raw = localStorage.getItem("helix.agent_connection_setup.v1");
            return raw ? JSON.parse(raw) : null;
          });
        } catch (error) {
          // The real restore hook reloads once to hydrate non-reactive stores.
          // Re-observe that navigation; all other browser errors remain failures.
          if (error instanceof Error && error.message.includes("Execution context was destroyed")) return null;
          throw error;
        }
      }).toEqual({ schema: "helix.agent_connection_setup.v1", selected_profile: "codex_app", viewed_step: "account" });
      await expect(page.getByRole("button", { name: "Open account sign-in", exact: true })).toBeVisible();
      expect(freshSnapshotAt).toBeDefined();
      const uiRecoveryMs = Date.now() - freshSnapshotAt!;
      expect(uiRecoveryMs).toBeGreaterThanOrEqual(0);
      expect(uiRecoveryMs).toBeLessThanOrEqual(5000);
      console.log(JSON.stringify({ evidence: "isolated_profile_ui_recovery", input,
        fresh_snapshot_to_verified_ui_ms: uiRecoveryMs, budget_ms: 5000, live_acceptance: false }));
      const recovered = await modules.readProfileStorageSnapshot(owner);
      const chats = JSON.parse(recovered.entries.find(entry => entry.storage_key === "agi-chat-sessions-v1")!.value);
      expect(Object.keys(chats.state.sessions)).toEqual([chatId]);
      expect(chats.state.reasoningTaskBindings).toEqual({});
    } finally {
      await page.goto("about:blank");
      for (const server of servers) {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
      await broker.close();
    }
  });
}
