import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import crypto from "node:crypto";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import { newDb } from "pg-mem";
import { buildOnboardingStyles } from "./production-styles";

test.setTimeout(90_000);
let script: string, styles: string, bundleDirectory: string;
let modules: typeof import("./pairing-origin-exports");
const envKeys = ["NODE_ENV", "DATABASE_URL", "HELIX_LOCAL_PG_MEM_PERSIST", "HELIX_DESKTOP_DEVICE_ID",
  "HELIX_PROVIDER_CREDENTIAL_BROKER_ORIGIN", "HELIX_PROVIDER_CREDENTIAL_BROKER_TOKEN"] as const;
const previousEnv = new Map(envKeys.map(key => [key, process.env[key]]));
test.beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "";
  process.env.HELIX_LOCAL_PG_MEM_PERSIST = "0";
  process.env.HELIX_DESKTOP_DEVICE_ID = "fixture-origin-device";
  styles = await buildOnboardingStyles();
  const client = await build({ entryPoints: [path.resolve("client/e2e/onboarding-isolated/pairing-origin-entry.tsx")],
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared") },
    define: { "process.env.NODE_ENV": '"test"', "import.meta.env": "{}" } });
  script = client.outputFiles[0].text;
  const server = await build({ entryPoints: [path.resolve("client/e2e/onboarding-isolated/pairing-origin-exports.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", logLevel: "silent" });
  await fs.mkdir(path.resolve(".tmp"), { recursive: true });
  bundleDirectory = await fs.mkdtemp(path.resolve(".tmp/pairing-origin-browser-"));
  const bundlePath = path.join(bundleDirectory, "runtime.cjs");
  await fs.writeFile(bundlePath, server.outputFiles[0].contents);
  modules = createRequire(import.meta.url)(bundlePath);
});
test.afterAll(async () => {
  await modules?.resetDbClient();
  for (const [key, value] of previousEnv) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  if (bundleDirectory && path.resolve(bundleDirectory).startsWith(path.resolve(".tmp") + path.sep))
    await fs.rm(bundleDirectory, { recursive: true, force: true });
});

for (const input of ["pointer", "keyboard"] as const) {
 for (const stage of ["draft", "pending-lost-reply", "accepted"] as const) {
  test(`O4/O5 new origin: ${input}, ${stage}`, async ({ page, context }) => {
    await modules.resetAccountSessionStore();
    const broker = await modules.startDesktopProviderCredentialBroker({
      keyring: { activeKey: crypto.randomBytes(32).toString("base64url"), retiredKeys: [] },
    });
    process.env.HELIX_PROVIDER_CREDENTIAL_BROKER_ORIGIN = broker.origin;
    process.env.HELIX_PROVIDER_CREDENTIAL_BROKER_TOKEN = broker.token;
    const memoryDb = newDb(), pool = new (memoryDb.adapters.createPg().Pool)();
    const servers: Server[] = [];
    const owner = `profile:origin-${input}-${stage}`, chatId = "chat:origin-exact";
    try {
      await pool.query("CREATE TABLE helix_accounts(profile_id text PRIMARY KEY)");
      await pool.query("INSERT INTO helix_accounts VALUES ($1)", [owner]);
      const db = await pool.connect();
      try { for (const migration of [modules.migration087, modules.migration088, modules.migration089,
        modules.migration090, modules.migration091]) await migration.run(db, { enablePgvector: false }); }
      finally { db.release(); }
      const opaque = (prefix: string, value: string) => `${prefix}:${crypto.createHash("sha256").update(value).digest("hex")}`;
      const issuer = "https://fixture.invalid";
      const destination = { issuer: opaque("issuer", issuer), profileId: owner,
        installationId: opaque("installation", "fixture-origin-device"), clientId: "client:origin-fixture", taskId: "task:origin-fixture" };
      const vault = modules.ephemeralPairingVault();
      const repository = new modules.PairingLedgerRepository(pool, vault, async () => {},
        async writes => modules.commitEmbeddedPairingReplacement(memoryDb, writes));
      const registrations = new modules.PairingDestinationRegistrationStore(pool, async () => {}, () => new Date(), vault);
      const registration = await registrations.registerAuthenticated(destination, { requestId: "fixture:origin-registration", durationSeconds: 3600 });
      const transitions = new modules.PairingTransitionService(repository, {
        destination: async (credential: string) => {
          if (credential !== "fixture:origin-provider") throw new Error("fixture_provider_denied");
          return destination;
        }, humanOwner: async () => { throw new Error("fixture_human_route_required"); },
      });
      let displayedOwner = owner;
      const pairingPosts: unknown[] = [];
      const app = express();
      app.use(express.json());
      app.use("/api/account", modules.accountSessionRouter);
      app.use("/api/account", (req, _res, next) => {
        if (req.method === "POST" && req.path.includes("/reasoning-")) pairingPosts.push(req.body);
        next();
      }, modules.createAgentConnectionsRouter({
        coordinationStore: { serviceInstanceRef: "service:origin-fixture", listPresence: () => [] },
        pairingLedgerRepository: repository, destinationRegistrationStore: registrations,
        readPairingDeviceTrust: async () => ({ trusted: true }) as never,
        // Environment eligibility is a fixture port in this browser recovery
        // test. Actual native issuer/run SQL is covered by the separate suite.
        validatePairingEnvironment: async ({ profileId, roomId, runId }) => profileId === owner &&
          roomId === "room:origin-exact" && runId === "run:origin-exact",
        readPreparationMembership: async ({ profileId, roomId }) => profileId === owner && roomId === "room:origin-exact"
          ? { participantId: "participant:origin-fixture", roomStatus: "open" } as never : null,
        bindingStore: { listBindings: async () => ({ bindings: [{ issuer, status: "active" }] }) } as never,
        resolveSession: modules.getAccountSessionById,
      }));
      app.get("/fixture.js", (_req, res) => res.type("js").send(script));
      app.get("/fixture.css", (_req, res) => res.type("css").send(styles));
      app.get("/", (_req, res) => res.type("html").send(`<link rel="stylesheet" href="/fixture.css"><div id="root" data-profile="${displayedOwner}"></div><script src="/fixture.js"></script>`));
      const origins: string[] = [];
      for (let i = 0; i < 3; i++) {
        const server = createServer(app); servers.push(server);
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("fixture_listener_missing");
        origins.push(`http://127.0.0.1:${address.port}`);
      }
      let invitation: { id: string; secret: string } | undefined;
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (!origins.includes(url.origin)) return route.abort("blockedbyclient");
        if (route.request().method() === "POST" && url.pathname.endsWith("/reasoning-invitations")) {
          const response = await route.fetch();
          if (response.status() !== 200) console.log(JSON.stringify({ evidence: "isolated_pairing_issue_failure",
            status: response.status(), body: await response.json() }));
          expect(response.status()).toBe(200);
          if (stage === "pending-lost-reply" && !invitation) {
            invitation = (await response.json()).invitation;
            return route.abort("failed");
          }
          return route.fulfill({ response });
        }
        return route.continue();
      });
      const signed = await context.request.post(`${origins[0]}/api/account/session/sign-in`, { data: { profile_id: owner } });
      expect(signed.status()).toBe(200);
      await page.setViewportSize({ width: input === "pointer" ? 375 : 1280, height: 640 });
      await page.goto(origins[0]);
      const picker = page.getByLabel("Registered AI task");
      await expect(picker.locator("option")).toHaveCount(2);
      if (input === "pointer") await picker.selectOption(registration.registrationId);
      else { await picker.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); }
      const activate = async (control: ReturnType<typeof page.getByRole>, key = "Space") => {
        if (input === "pointer") await control.click();
        else { await control.focus(); await page.keyboard.press(key); }
      };
      await activate(page.getByLabel(/Include environment run/));
      if (stage !== "draft") {
        await activate(page.getByLabel(/I approve pairing/));
        await activate(page.getByRole("button", { name: "Approve pairing and create invitation", exact: true }), "Enter");
        if (stage === "pending-lost-reply") await expect(page.getByRole("alert")).toBeVisible();
        else {
          const field = page.getByLabel("Pairing invitation", { exact: true });
          await expect(field).toBeVisible(); invitation = JSON.parse(await field.inputValue());
          await transitions.accept("fixture:origin-provider", invitation!);
          await activate(page.getByRole("button", { name: "Check acceptance", exact: true }), "Enter");
          await expect(page.getByText(/Pairing: accepted/)).toBeVisible();
        }
      }
      const storageKey = `helix.pairing.review.v1:${JSON.stringify([owner, chatId])}`;
      const requestKey = storageKey + (stage === "draft" ? ":draft" : "");
      let savedRequest: string | undefined;
      await expect.poll(async () => {
        const saved = await modules.readProfileStorageSnapshot(owner);
        savedRequest = saved.entries.find(entry => entry.storage_key === requestKey)?.value;
        return Boolean(savedRequest && JSON.parse(savedRequest).environment?.runId === "run:origin-exact" &&
          saved.entries.some(entry => entry.storage_key === storageKey + ":destination"));
      }, { timeout: 20_000 }).toBe(true);
      const original = invitation ? await repository.read(owner, invitation.id) : null;
      const postsBeforeRestore = pairingPosts.length;
      let freshSnapshotAt: number | undefined;
      page.on("response", response => {
        if (response.url() === `${origins[1]}/api/account/profile-storage/snapshot` && response.request().method() === "GET" && response.status() === 200)
          void response.finished().then(error => { if (!error && freshSnapshotAt === undefined) freshSnapshotAt = Date.now(); });
      });
      await page.goto(origins[1]);
      await expect(picker).toHaveValue(registration.registrationId, { timeout: 20_000 });
      await expect(page.getByLabel(/Include environment run/)).toBeChecked();
      await expect(page.getByLabel(/I approve pairing/)).not.toBeChecked();
      if (stage === "draft") await expect(page.getByRole("button", { name: "Approve pairing and create invitation", exact: true })).toBeDisabled();
      else await expect(page.getByText(new RegExp(`Pairing: ${stage === "accepted" ? "accepted" : "pending"}`))).toBeVisible();
      expect(pairingPosts).toHaveLength(postsBeforeRestore);
      expect(freshSnapshotAt).toBeDefined();
      const recoveryMs = Date.now() - freshSnapshotAt!;
      expect(recoveryMs).toBeLessThanOrEqual(5000);
      expect(await page.evaluate(key => localStorage.getItem(key), requestKey)).toBe(savedRequest);
      if (invitation) expect(await repository.read(owner, invitation.id)).toEqual(original);
      const recovered = await modules.readProfileStorageSnapshot(owner);
      expect(JSON.stringify(recovered)).not.toContain('"secret"');
      if (invitation) expect(JSON.stringify(recovered)).not.toContain(invitation.secret);
      expect((await pool.query("SELECT * FROM helix_pairing_ledger")).rows).toHaveLength(stage === "draft" ? 0 : 1);
      console.log(JSON.stringify({ evidence: "isolated_pairing_origin_recovery", input, stage,
        fresh_snapshot_to_verified_ui_ms: recoveryMs, extra_pairing_posts_on_restore: 0, live_acceptance: false }));
      // A different real account on a third origin cannot inherit this review.
      displayedOwner = owner + "-other";
      expect((await context.request.post(`${origins[2]}/api/account/session/sign-in`, { data: { profile_id: displayedOwner } })).status()).toBe(200);
      await page.goto(origins[2]);
      await expect(picker).toHaveValue("");
      await expect(page.getByLabel(/I approve pairing/)).not.toBeChecked();
      expect(await page.evaluate(key => localStorage.getItem(key), requestKey)).toBeNull();
      if (invitation) {
        const denied = await context.request.get(`${origins[2]}/api/account/session/agent-connections/reasoning-pairings/${encodeURIComponent(invitation.id)}`);
        expect(denied.ok()).toBe(false);
      }
      expect(pairingPosts).toHaveLength(postsBeforeRestore);
    } finally {
      await page.goto("about:blank");
      for (const server of servers) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
      await pool.end(); await broker.close();
    }
  });
 }
}
