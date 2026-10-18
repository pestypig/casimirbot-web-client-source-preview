import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import crypto from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import express from "express";
import { newDb } from "pg-mem";
import { buildOnboardingStyles } from "./production-styles";

let script: string;
let styles: string;
let serverModules: typeof import("./real-handler-exports");
let bundleDirectory: string;
test.beforeAll(async () => {
  styles = await buildOnboardingStyles();
  const bundle = await build({ entryPoints: [path.resolve("client/e2e/onboarding-isolated/durable-real-entry.tsx")],
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' } });
  script = bundle.outputFiles[0].text;
  // Bundle repository JSON imports using the same build tool as production;
  // Playwright's native ESM loader otherwise requires JSON import attributes.
  const serverBundle = await build({ entryPoints: [path.resolve("client/e2e/onboarding-isolated/real-handler-exports.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", logLevel: "silent",
    plugins: [{ name: "isolated-environment-database", setup(builder) {
      builder.onResolve({ filter: /(?:^|\/)db\/client$/ }, args => {
        if (path.basename(args.importer) !== "pairing-environment-eligibility.ts") return;
        return { path: path.resolve("client/e2e/onboarding-isolated/environment-database-port.ts") };
      });
    } }] });
  const tmpRoot = path.resolve(".tmp");
  await fs.mkdir(tmpRoot, { recursive: true });
  bundleDirectory = await fs.mkdtemp(path.join(tmpRoot, "onboarding-real-handlers-"));
  const bundlePath = path.join(bundleDirectory, "runtime.cjs");
  await fs.writeFile(bundlePath, serverBundle.outputFiles[0].contents);
  serverModules = createRequire(import.meta.url)(bundlePath);
});
test.afterAll(async () => {
  if (bundleDirectory?.startsWith(path.resolve(".tmp") + path.sep)) await fs.rm(bundleDirectory, { recursive: true, force: true });
});

for (const input of ["pointer", "keyboard"] as const) {
 for (const lostReply of [false, true, "chat-switch", "account-switch", "automatic", "automatic-lost", "client-clock-ahead", "idle-run", "idle-run-expired", "native-run"] as const) {
  test(`O5 real HTTP and encrypted store: ${input}, lost reply=${lostReply}`, async ({ page, context }, testInfo) => {
    const { createAgentConnectionsRouter, migration087, migration088, migration089, migration090, migration091, PairingDeliveryRepository, PairingDeliveryService, DurableSteeringRepository, PairingDestinationRegistrationStore,
      PairingLedgerRepository, PairingTransitionService, DurableReasoningBindingAccess,
      HelixReasoningTaskBindingStore, ephemeralPairingVault, commitEmbeddedPairingReplacement,
      isPairingEnvironmentEligible, setEnvironmentFixturePool } = serverModules;
    // This listener exists only in this test worker, on a fresh loopback port.
    // Identity/trust and the encryption key are injected; production handlers,
    // database queries, validation, transitions and rendered controls are real.
    const priorDevice = process.env.HELIX_DESKTOP_DEVICE_ID;
    process.env.HELIX_DESKTOP_DEVICE_ID = "fixture-device";
    const nativeRun = lostReply === "native-run";
    const profileId = "fixture-owner", chatId = "fixture-chat";
    const issuer = nativeRun ? "urn:casimirbot:desktop-session" : "https://fixture.invalid";
    const opaque = (prefix: string, value: string) => `${prefix}:${crypto.createHash("sha256").update(value).digest("hex")}`;
    const destination = { issuer: opaque("issuer", issuer), profileId, installationId: opaque("installation", "fixture-device"),
      clientId: nativeRun ? opaque("mcp_client:native_desktop", `fixture-device\n${profileId}\nfixture-browser-session`) : "fixture-client", taskId: "fixture-task" };
    const memoryDb = newDb();
    const pool = new (memoryDb.adapters.createPg().Pool)();
    const idleRun = lostReply === "idle-run" || lostReply === "idle-run-expired" || nativeRun;
    setEnvironmentFixturePool(pool);
    let server: ReturnType<typeof createServer> | undefined;
    try {
      await pool.query("CREATE TABLE helix_accounts(profile_id text PRIMARY KEY)");
      await pool.query("INSERT INTO helix_accounts VALUES ($1)", [profileId]);
      await pool.query("INSERT INTO helix_accounts VALUES ($1)", ["fixture-other-owner"]);
      const db = await pool.connect();
      try { for (const migration of [migration087, migration088, migration089, migration090, migration091]) await migration.run(db, { enablePgvector: false }); }
      finally { db.release(); }
      if (idleRun) {
        await pool.query(`CREATE TABLE helix_agent_runs (run_id text, tenant_id text, issuer text, subject_id text,
          account_profile_id text, lifecycle_status text, expires_at timestamptz, cancelled_at timestamptz,
          completed_at timestamptz, steps_used integer, max_steps integer)`);
        await pool.query(`CREATE TABLE helix_agent_run_room_bindings (run_id text, tenant_id text, issuer text,
          subject_id text, account_profile_id text, status text, room_id text, participant_id_at_bind text)`);
        await pool.query(`INSERT INTO helix_agent_runs VALUES ('fixture-run','fixture-tenant',$1,'fixture-subject',
          $2,'waiting',$3,NULL,NULL,1,10)`, [issuer, profileId, new Date(Date.now() + 3600000)]);
        await pool.query(`INSERT INTO helix_agent_run_room_bindings VALUES ('fixture-run','fixture-tenant',$1,'fixture-subject',
          $2,'active','fixture-room','fixture-participant')`, [issuer, profileId]);
      }
      const vault = ephemeralPairingVault();
      const steeringRepository = new DurableSteeringRepository(pool, vault, async () => {});
      const repository = new PairingLedgerRepository(pool, vault, async () => {},
        async writes => commitEmbeddedPairingReplacement(memoryDb, writes));
      const registrations = new PairingDestinationRegistrationStore(pool, async () => {}, () => new Date(), vault);
      const registration = await registrations.registerAuthenticated(destination, { requestId: "fixture-register", durationSeconds: 900 });
      const transitions = new PairingTransitionService(repository, {
        destination: async (credential: string) => {
          if (credential !== "fixture-provider") throw new Error("fixture_provider_denied");
          return destination;
        },
        humanOwner: async () => { throw new Error("fixture_human_route_required"); },
      });
      const automatic = lostReply === "automatic" || lostReply === "automatic-lost";
      const providerMessages = new Map<string, { messageId: string; invitation: { id: string; secret: string } }>();
      let providerSendCalls = 0;
      const resolvedSessions: string[] = [];
      const makeRuntime = (serviceInstanceRef: string) => {
        const coordinationStore = { serviceInstanceRef, listPresence: () => [] };
        const store = new HelixReasoningTaskBindingStore(coordinationStore);
        const router = createAgentConnectionsRouter({ coordinationStore, reasoningBindingStore: store, preparationBindingStore: store,
          pairingDeliveryService: automatic ? new PairingDeliveryService(repository, new PairingDeliveryRepository(pool, vault, async () => {}),
            async session => {
              if (session.session_id !== "fixture-browser-session" || session.profile.profile_id !== profileId) throw new Error("fixture-human-required");
              return profileId;
            }, async (_session, approved) => {
              if (JSON.stringify(approved) !== JSON.stringify(destination)) throw new Error("fixture-target-denied");
              return { destination,
                lookup: async id => providerMessages.has(id) ? { state: "delivered" as const, messageId: providerMessages.get(id)!.messageId } : { state: "absent" as const },
                sendOnce: async ({ deliveryId, invitation }) => {
                  providerSendCalls++;
                  if (!providerMessages.has(deliveryId)) providerMessages.set(deliveryId, { messageId: "fixture-auto-message", invitation });
                  if (lostReply === "automatic-lost" && providerSendCalls === 1) throw new Error("fixture-lost-provider-reply");
                  return { messageId: providerMessages.get(deliveryId)!.messageId };
                } };
            }) : undefined,
          pairingLedgerRepository: repository, destinationRegistrationStore: registrations, durableSteeringRepository: steeringRepository,
          readPairingDeviceTrust: async () => ({ trusted: true, delegated_account_session_id: "fixture-browser-session" }) as never,
          validatePairingEnvironment: isPairingEnvironmentEligible,
          readPreparationMembership: async ({ profileId: owner, roomId }) => owner === profileId && roomId === "fixture-room"
            ? { participantId: "fixture-participant", roomStatus: "open" } as never : null,
          bindingStore: { listBindings: async () => ({ bindings: [{ issuer: nativeRun ? "https://fixture.invalid" : issuer, status: "active" }] }) } as never,
          resolveSession: async id => {
            resolvedSessions.push(id);
            return id === "fixture-browser-session" ? { session_id: id, profile: { profile_id: profileId } }
              : id === "fixture-other-session" ? { session_id: id, profile: { profile_id: "fixture-other-owner" } } : null;
          },
        });
        return { router, access: new DurableReasoningBindingAccess(store, async actor => {
          expect(actor).toEqual(destination);
        }, async () => repository, undefined, async () => steeringRepository) };
      };
      let runtime = makeRuntime("fixture-service-before");
      const app = express();
      const mutations: string[] = [];
      app.use("/api/account", (req, res, next) => {
        if (req.method === "POST") mutations.push(req.path);
        runtime.router(req, res, next);
      });
      app.get("/fixture.js", (_req, res) => res.type("js").send(script));
      app.get("/fixture.css", (_req, res) => res.type("css").send(styles));
      app.get("/", (_req, res) => res.type("html").send(`<link rel="stylesheet" href="/fixture.css"><div id="root" data-environment="${idleRun}"></div><script src="/fixture.js"></script>`));
      server = createServer(app);
      await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("fixture_listener_missing");
      const origin = `http://127.0.0.1:${address.port}`;
      await context.addCookies([{ name: "helix_session", value: "fixture-browser-session", url: origin, httpOnly: true }]);
      let dropped: { id: string; secret: string } | undefined;
      let droppedReplacement: { id: string; secret: string } | undefined;
      let releaseReconcile!: () => void;
      let reconcileWaiting = false;
      let browserPosts = 0;
      const identitySwitch = lostReply === "chat-switch" || lostReply === "account-switch";
      const clientClockAhead = lostReply === "client-clock-ahead";
      let idleRejection: unknown;
      let rejectedRequest: unknown;
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort("blockedbyclient");
        if (route.request().method() === "POST") browserPosts += 1;
        if (lostReply === "idle-run-expired" && route.request().method() === "POST" && url.pathname.endsWith("/reasoning-invitations")) {
          // Observe the actual HTTP handler response before forwarding it.
          // Chromium may discard an error body when the client aborts its read.
          const response = await route.fetch();
          if (response.status() === 409) {
            idleRejection = await response.json();
            rejectedRequest = route.request().postDataJSON();
          }
          return route.fulfill({ response });
        }
        if (identitySwitch && route.request().method() === "POST") return route.abort("failed");
        if (identitySwitch && route.request().method() === "GET" && url.pathname.includes("/reasoning-invitations/")) {
          const result = await route.fetch();
          expect(result.status()).toBe(200);
          expect((await result.json()).pairing).toBeNull();
          await new Promise<void>(resolve => { releaseReconcile = resolve; reconcileWaiting = true; });
          return route.fulfill({ response: result });
        }
        if (!automatic && !clientClockAhead && !idleRun && lostReply && !droppedReplacement && route.request().method() === "POST" &&
            url.pathname.endsWith("/reasoning-invitations") && route.request().postDataJSON()?.replacement) {
          const response = await route.fetch();
          expect(response.status()).toBe(200);
          droppedReplacement = (await response.json()).invitation;
          return route.abort("failed");
        }
        if (!automatic && !clientClockAhead && !idleRun && lostReply && !dropped && route.request().method() === "POST" && url.pathname.endsWith("/reasoning-invitations")) {
          // Commit through the actual handler, then lose only its reply.
          const response = await route.fetch();
          expect(response.status()).toBe(200);
          dropped = (await response.json()).invitation;
          return route.abort("failed");
        }
        return route.continue();
      });
      await page.setViewportSize({ width: input === "pointer" ? 375 : 1280, height: 640 });
      if (clientClockAhead || idleRun) await page.clock.install();
      await page.goto(origin);
      const picker = page.getByLabel("Registered AI task");
      await expect(picker.locator("option")).toHaveCount(2);
      if (input === "pointer") await picker.selectOption(registration.registrationId);
      else { await picker.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); }
      if (automatic) {
        const deliveryChoice = page.getByRole("combobox", { name: "Invitation delivery", exact: true });
        if (input === "pointer") await deliveryChoice.selectOption("automatic");
        else { await deliveryChoice.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); }
      }
      const consent = page.getByLabel(/I approve pairing/);
      if (idleRun) {
        await page.clock.fastForward(181000);
        const runChoice = page.getByLabel(/Include environment run/);
        await expect(runChoice).toBeVisible();
        await expect(runChoice).not.toBeChecked();
        await expect(consent).not.toBeChecked();
        await expect(page.getByText(/Last verified run; availability is checked again/)).toBeVisible();
        expect(browserPosts).toBe(0);
        if (input === "pointer") await runChoice.click();
        else { await runChoice.focus(); await page.keyboard.press("Space"); }
        await expect(runChoice).toBeChecked();
        if (lostReply === "idle-run-expired") await pool.query("UPDATE helix_agent_runs SET expires_at = '2000-01-01'");
      }
      if (input === "pointer") await consent.click();
      else { await consent.focus(); await page.keyboard.press("Space"); }
      await expect(consent).toBeChecked();
      const approve = page.getByRole("button", { name: "Approve pairing and create invitation" });
      if (lostReply === "idle-run" && input === "pointer") await page.screenshot({ path: testInfo.outputPath("styled-approval.png"), fullPage: true });
      const idleIssuance = idleRun ? page.waitForResponse(response => response.request().method() === "POST" &&
        response.url().endsWith("/reasoning-invitations")) : null;
      if (input === "pointer") await approve.click();
      else { await approve.focus(); await page.keyboard.press("Enter"); }
      if (idleRun) {
        const issued = await idleIssuance!;
        expect(browserPosts).toBe(1);
        if (lostReply === "idle-run-expired") {
          expect(issued.status()).toBe(409);
          expect(idleRejection).toMatchObject({ error: "pairing_environment_unavailable" });
          await expect(page.getByRole("alert")).toBeVisible();
          await expect(page.getByLabel(/Include environment run/)).toBeChecked();
          expect((await pool.query("SELECT * FROM helix_pairing_ledger")).rows).toHaveLength(0);
          const cancel = page.getByRole("button", { name: "Cancel request and review again" });
          if (input === "pointer") await cancel.click();
          else { await cancel.focus(); await page.keyboard.press("Enter"); }
          await expect(page.getByText(/The previous request is cancelled/)).toBeVisible();
          await expect(consent).not.toBeChecked();
          await expect(page.getByLabel(/Include environment run/)).not.toBeChecked();
          await pool.query(`INSERT INTO helix_agent_runs VALUES ('fixture-fresh-run','fixture-tenant',$1,'fixture-subject',
            $2,'waiting',$3,NULL,NULL,1,10)`, [issuer, profileId, new Date(Date.now() + 3600000)]);
          await pool.query(`INSERT INTO helix_agent_run_room_bindings VALUES ('fixture-fresh-run','fixture-tenant',$1,'fixture-subject',
            $2,'active','fixture-room','fixture-participant')`, [issuer, profileId]);
          const fresh = page.getByRole("button", { name: "Offer fresh fixture run" });
          if (input === "pointer") await fresh.click();
          else { await fresh.focus(); await page.keyboard.press("Enter"); }
          const freshChoice = page.getByLabel(/Include environment run fixture-fresh-run/);
          for (const control of [freshChoice, consent]) {
            if (input === "pointer") await control.click();
            else { await control.focus(); await page.keyboard.press("Space"); }
          }
          if (input === "pointer") await approve.click();
          else { await approve.focus(); await page.keyboard.press("Enter"); }
          // If that old run becomes eligible later, its cancelled request still
          // cannot issue. This is fixture database state, not a production renewal.
          await pool.query("UPDATE helix_agent_runs SET expires_at=$1 WHERE run_id='fixture-run'", [new Date(Date.now() + 3600000)]);
          const retry = await context.request.post(origin + "/api/account/session/agent-connections/reasoning-invitations", { data: rejectedRequest });
          expect(retry.status()).toBe(409);
          expect(await retry.json()).toMatchObject({ error: "pairing_request_cancelled" });
        }
        else expect(issued.status()).toBe(200);
        const field = page.getByLabel("Pairing invitation", { exact: true });
        await expect(field).toBeVisible();
        const invitation = JSON.parse(await field.inputValue());
        const original = await repository.read(profileId, invitation.id);
        const expectedRun = lostReply === "idle-run-expired" ? "fixture-fresh-run" : "fixture-run";
        expect(original?.approval.environment).toEqual({ roomId: "fixture-room", runId: expectedRun });
        const accepted = await transitions.accept("fixture-provider", invitation);
        expect(await transitions.accept("fixture-provider", invitation)).toEqual(accepted);
        const binding = await runtime.access.restore({ destination, pairingId: invitation.id, clientSessionRef: "fixture-idle-run-session" });
        expect(binding).toMatchObject({ run_id: expectedRun, continuation_transport: "polling", execution_authority: false });
        const check = page.getByRole("button", { name: "Check acceptance", exact: true });
        if (input === "pointer") await check.click();
        else { await check.focus(); await page.keyboard.press("Enter"); }
        await expect(page.getByText(/Pairing: accepted/)).toBeVisible();
        const restored = await repository.read(profileId, invitation.id);
        expect(restored?.pairingExpiresAt).toBe(original?.pairingExpiresAt);
        expect(restored?.invitationExpiresAt).toBe(original?.invitationExpiresAt);
        expect((await pool.query("SELECT * FROM helix_pairing_ledger")).rows).toHaveLength(lostReply === "idle-run-expired" ? 2 : 1);
        expect(browserPosts).toBe(lostReply === "idle-run-expired" ? 3 : 1);
        return;
      }
      if (clientClockAhead) {
        const field = page.getByLabel("Pairing invitation", { exact: true });
        await expect(field).toBeVisible();
        const invitation = JSON.parse(await field.inputValue());
        const original = await repository.read(profileId, invitation.id);
        expect(original?.acceptedAt).toBeNull();
        // Only the browser clock advances. The authoritative server grant is
        // still pending: local expiry must hide copying without inventing a
        // server expiry or releasing a new consent mutation.
        await page.clock.fastForward(901000);
        await expect(page.getByText(/deadline has elapsed on this device/)).toBeVisible();
        await expect(page.getByRole("button", { name: "Copy invitation", exact: true })).toHaveCount(0);
        await expect(field).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Review a new invitation", exact: true })).toHaveCount(0);
        await expect(page.getByText(/Pairing: pending/)).toBeVisible();
        expect(await repository.read(profileId, invitation.id)).toEqual(original);
        expect(browserPosts).toBe(1);
        await transitions.accept("fixture-provider", invitation);
        const check = page.getByRole("button", { name: "Check acceptance", exact: true });
        if (input === "pointer") await check.click();
        else { await check.focus(); await page.keyboard.press("Enter"); }
        await expect(page.getByText(/Pairing: accepted/)).toBeVisible();
        const accepted = await repository.read(profileId, invitation.id);
        expect(accepted?.invitationExpiresAt).toBe(original?.invitationExpiresAt);
        expect(accepted?.pairingExpiresAt).toBe(original?.pairingExpiresAt);
        expect(browserPosts).toBe(1);
        expect((await pool.query("SELECT * FROM helix_pairing_ledger")).rows).toHaveLength(1);
        return;
      }
      if (automatic) {
        if (lostReply === "automatic-lost") {
          await expect(page.getByText("Delivery is not confirmed. Reconcile delivery or use Copy invitation.", { exact: true })).toBeVisible();
          runtime = makeRuntime("fixture-auto-recovered");
          await page.reload();
        } else await expect(page.getByText("Invitation delivered. Waiting for authenticated task acceptance.", { exact: true })).toBeVisible();
        const reconcileDelivery = page.getByRole("button", { name: "Reconcile delivery", exact: true });
        await expect(reconcileDelivery).toBeEnabled();
        if (input === "pointer") await reconcileDelivery.click();
        else { await reconcileDelivery.focus(); await page.keyboard.press("Enter"); }
        await expect(page.getByText("Invitation delivered. Waiting for authenticated task acceptance.", { exact: true })).toBeVisible();
        expect(providerMessages.size).toBe(1);
        expect(providerSendCalls).toBe(1);
        const received = [...providerMessages.values()][0].invitation;
        expect((await repository.read(profileId, received.id))?.acceptedAt).toBeNull();
        await expect(transitions.accept("fixture-wrong-provider", received)).rejects.toThrow();
        const accepted = await transitions.accept("fixture-provider", received);
        expect(await transitions.accept("fixture-provider", received)).toEqual(accepted);
        const automaticBinding = await runtime.access.restore({ destination, pairingId: received.id,
          clientSessionRef: "fixture-auto-session" });
        await page.getByRole("button", { name: "Check acceptance", exact: true }).click();
        await expect(page.getByText(/Pairing: accepted/)).toBeVisible();
        await expect(page.getByTestId("runtime-binding")).toContainText(automaticBinding.reasoning_binding_id);
        const automaticPrompt = { reasoning_binding_id: automaticBinding.reasoning_binding_id,
          binding_epoch: automaticBinding.binding_epoch, helix_conversation_id: chatId, run_id: null,
          client_event_ref: "fixture-auto-typed", origin: "typed", instruction_text: "Inspect the automatically paired fixture." };
        const submitAutomaticPrompt = () => page.evaluate(async body => {
          const result = await fetch("/api/account/session/agent-connections/reasoning-bindings/steering/current", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          });
          return { status: result.status, body: await result.json() };
        }, automaticPrompt);
        const automaticSubmitted = await submitAutomaticPrompt();
        expect(automaticSubmitted.status).toBe(202);
        expect(await submitAutomaticPrompt()).toEqual(automaticSubmitted);
        const automaticPickup = { profileRef: profileId, bindingId: automaticBinding.reasoning_binding_id,
          bindingEpoch: automaticBinding.binding_epoch, clientSessionRef: "fixture-auto-session" };
        const pickedUp = await runtime.access.read(automaticPickup);
        expect(pickedUp).toHaveLength(1);
        expect(pickedUp[0]).toMatchObject({ instruction_text: automaticPrompt.instruction_text,
          event: { origin: "typed", steering_event_ref: automaticSubmitted.body.event.steering_event_ref } });
        const automaticAck = await runtime.access.acknowledge({ ...automaticPickup,
          eventRef: automaticSubmitted.body.event.steering_event_ref });
        expect(automaticAck.delivery_state).toBe("acknowledged");
        const visibleInput = { ...automaticPickup, clientEventRef: "fixture-auto-visible", origin: "agent_submitted" as const,
          instructionText: "Fixture automatic pairing observation request." };
        const visibleEvent = await runtime.access.dispatch(visibleInput);
        expect(await runtime.access.dispatch(visibleInput)).toEqual(visibleEvent);
        await page.reload();
        const automaticDisplay = page.getByRole("region", { name: "Agent-submitted prompts" });
        await expect(automaticDisplay.getByText(visibleInput.instructionText, { exact: true })).toHaveCount(1);
        await expect(automaticDisplay).toContainText("Last checked: pending");
        await runtime.access.acknowledge({ ...automaticPickup, eventRef: visibleEvent.steering_event_ref });
        await page.reload();
        await expect(automaticDisplay).toContainText("Last checked: acknowledged");
        await expect(automaticDisplay.locator("article")).toHaveCount(1);
        expect((await pool.query("SELECT * FROM helix_durable_steering")).rows).toHaveLength(2);

        await page.getByRole("button", { name: "Revoke pairing", exact: true }).click();
        await expect(page.getByText(/Pairing: revoked/)).toBeVisible();
        await expect(automaticDisplay).toHaveCount(0);
        await expect(runtime.access.read(automaticPickup)).rejects.toThrow("pairing_revoked");
        await expect(transitions.accept("fixture-provider", received)).rejects.toThrow();
        expect((await pool.query("SELECT * FROM helix_pairing_delivery")).rows).toHaveLength(1);
        expect((await pool.query("SELECT * FROM helix_pairing_ledger")).rows).toHaveLength(1);
        expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(received.secret);
        return;
      }
      let invitation: { id: string; secret: string };
      if (identitySwitch) {
        await expect(page.getByRole("alert")).toBeVisible();
        await page.getByRole("button", { name: "Reconcile invitation" }).click();
        await expect.poll(() => reconcileWaiting).toBe(true);
        if (lostReply === "account-switch") {
          await context.addCookies([{ name: "helix_session", value: "fixture-other-session", url: origin, httpOnly: true }]);
        }
        const switchChat = page.getByRole("button", { name: lostReply === "account-switch" ? "Switch fixture account" : "Switch fixture chat" });
        if (input === "pointer") await switchChat.click();
        else { await switchChat.focus(); await page.keyboard.press("Enter"); }
        if (lostReply === "account-switch") {
          await expect(page.getByTestId("fixture-profile")).toHaveText("fixture-other-owner");
          await expect.poll(() => resolvedSessions.includes("fixture-other-session")).toBe(true);
          await expect(page.getByLabel("Registered AI task").locator("option")).toHaveCount(1);
        } else await expect(page.getByText("Helix chat: fixture-chat-other", { exact: true })).toBeVisible();
        const lookupReply = page.waitForResponse(response => response.url().includes("/reasoning-invitations/"));
        releaseReconcile();
        await lookupReply;
        // Drain the response body and browser promise continuations, without a timed sleep.
        await page.evaluate(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
        expect(browserPosts).toBe(1); // Initial aborted request only; no stale retry.
        expect(mutations).toHaveLength(0);
        expect((await pool.query("SELECT count(*) AS count FROM helix_pairing_ledger")).rows[0].count).toBe(0);
        await expect(page.getByLabel(/I approve pairing/)).not.toBeChecked();
        return;
      }
      if (lostReply) {
        await expect(page.getByRole("alert")).toBeVisible();
        invitation = dropped!;
        await page.reload();
        await expect(page.getByRole("status")).toContainText("Pairing: pending");
        await expect(page.getByLabel("Pairing invitation")).toHaveCount(0);
      } else {
        const field = page.getByLabel("Pairing invitation");
        await expect(field).toBeVisible();
        invitation = JSON.parse(await field.inputValue());
        // Fixture browser permission only; no production clipboard or consent.
        await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
        const beforeCopy = await repository.read(profileId, invitation.id);
        const copy = page.getByRole("button", { name: "Copy invitation", exact: true });
        // O4/O5 clipboard failure injection stays inside this isolated browser.
        // The invitation is issued by the real handler and encrypted repository.
        for (const failure of ["denied", "unavailable"] as const) {
          await page.evaluate(kind => {
            (window as any).fixtureClipboardWrite = navigator.clipboard.writeText;
            Object.defineProperty(navigator.clipboard, "writeText", {
              configurable: true,
              value: kind === "unavailable" ? undefined : async () => { throw new DOMException("fixture denial", "NotAllowedError"); },
            });
          }, failure);
          if (input === "pointer") await copy.click();
          else { await copy.focus(); await page.keyboard.press("Enter"); }
          await expect(page.getByText("Automatic copy could not be confirmed. The invitation is selected; press Ctrl+C to copy it.", { exact: true })).toBeVisible();
          await expect(field).toBeFocused();
          expect(await field.evaluate((element: HTMLInputElement) => ({
            start: element.selectionStart, end: element.selectionEnd, length: element.value.length,
          }))).toEqual({ start: 0, end: (await field.inputValue()).length, length: (await field.inputValue()).length });
          expect(JSON.parse(await field.inputValue())).toEqual(invitation);
          expect(await repository.read(profileId, invitation.id)).toEqual(beforeCopy);
          expect(mutations).toHaveLength(1);
          await page.evaluate(() => {
            Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: (window as any).fixtureClipboardWrite });
            delete (window as any).fixtureClipboardWrite;
          });
        }
        if (input === "pointer") await copy.click();
        else { await copy.focus(); await page.keyboard.press("Enter"); }
        await expect(page.getByText("Invitation copied. Paste it into the exact AI task shown above. Copying does not accept the binding.", { exact: true })).toBeVisible();
        expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(invitation);
        expect(await repository.read(profileId, invitation.id)).toEqual(beforeCopy);
        expect(beforeCopy?.acceptedAt).toBeNull();
        expect(mutations).toHaveLength(1);
      }
      expect(mutations).toHaveLength(1);
      expect((await pool.query("SELECT count(*) AS count FROM helix_pairing_ledger")).rows[0].count).toBe(1);
      await expect(transitions.accept("fixture-wrong-provider", invitation)).rejects.toThrow("fixture_provider_denied");
      const accepted = await transitions.accept("fixture-provider", invitation);
      expect(await transitions.accept("fixture-provider", invitation)).toEqual(accepted);
      const before = await runtime.access.restore({ destination, pairingId: invitation.id, clientSessionRef: "fixture-session-before" });
      await page.getByRole("button", { name: "Check acceptance" }).click();
      await expect(page.getByTestId("runtime-binding")).toContainText(before.reasoning_binding_id);
      await expect(page.getByLabel("Pairing invitation")).toHaveCount(0);
      const originalOpen = vault.open;
      const savedRows = (await pool.query("SELECT * FROM helix_pairing_ledger")).rows;
      for (const failure of ["unreadable", "invalid"] as const) {
        vault.open = async () => {
          if (failure === "unreadable") throw new Error("fixture-private-storage-diagnostic");
          return { invalid: "fixture-private-storage-payload" };
        };
        await page.getByRole("button", { name: "Check acceptance" }).click();
        await expect(page.getByRole("alert")).toContainText(failure === "unreadable"
          ? "Saved pairing data could not be opened" : "Saved pairing data failed validation");
        await expect(page.getByTestId("runtime-binding")).toHaveText("unavailable");
        expect(await page.locator("body").innerText()).not.toContain("fixture-private-storage");
        expect((await pool.query("SELECT * FROM helix_pairing_ledger")).rows).toEqual(savedRows);
        vault.open = originalOpen;
        await page.getByRole("button", { name: "Check acceptance" }).click();
        await expect(page.getByTestId("runtime-binding")).toContainText(before.reasoning_binding_id);
        expect(mutations).toHaveLength(1);
      }
      // Replace the service/store object, retaining the encrypted database.
      // This is not a native process/disk restart acceptance claim.
      runtime = makeRuntime("fixture-service-after");
      await transitions.recover("fixture-provider", invitation.id);
      const after = await runtime.access.restore({ destination, pairingId: invitation.id, clientSessionRef: "fixture-session-after" });
      expect(after.reasoning_binding_id).not.toBe(before.reasoning_binding_id);
      expect(after.expires_at).toBe(before.expires_at);
      await page.reload();
      await expect(page.getByTestId("runtime-binding")).toContainText(after.reasoning_binding_id);
      expect(mutations).toHaveLength(1);
      const replace = page.getByRole("button", { name: "Review replacement pairing" });
      if (input === "pointer") await replace.click();
      else { await replace.focus(); await page.keyboard.press("Enter"); }
      await expect(page.getByText(`Replace pairing ${invitation.id}, reviewed revision 2.`)).toBeVisible();
      await expect(page.getByText("Previous pairing: accepted.")).toBeVisible();
      await expect(page.getByTestId("runtime-binding")).toContainText(after.reasoning_binding_id);
      await expect(consent).not.toBeChecked();
      await expect(approve).toBeDisabled();
      if (input === "pointer") await consent.click();
      else { await consent.focus(); await page.keyboard.press("Space"); }
      if (input === "pointer") await approve.click();
      else { await approve.focus(); await page.keyboard.press("Enter"); }
      let replacementInvitation: { id: string; secret: string };
      if (lostReply) {
        await expect(page.getByRole("alert")).toBeVisible();
        replacementInvitation = droppedReplacement!;
        await page.reload();
        await expect(page.getByRole("status")).toContainText("Pairing: pending");
        await expect(page.getByTestId("runtime-binding")).toContainText(after.reasoning_binding_id);
      } else {
        const field = page.getByLabel("Pairing invitation");
        await expect(field).toBeVisible();
        replacementInvitation = JSON.parse(await field.inputValue());
      }
      expect(mutations).toHaveLength(2);
      expect(await transitions.recover("fixture-provider", invitation.id)).toEqual(accepted);
      const replacementAccepted = await transitions.accept("fixture-provider", replacementInvitation);
      expect(replacementAccepted.replacement).toEqual({ pairingId: invitation.id, revision: 2 });
      const replacementBinding = await runtime.access.restore({ destination, pairingId: replacementInvitation.id,
        clientSessionRef: "fixture-session-replacement" });
      await page.getByRole("button", { name: "Check acceptance" }).click();
      await expect(page.getByTestId("runtime-binding")).toContainText(replacementBinding.reasoning_binding_id);
      await expect(page.getByText("Previous pairing: superseded by this pairing.")).toBeVisible();
      await expect(transitions.recover("fixture-provider", invitation.id)).rejects.toThrow("pairing_superseded");
      const prompt = { reasoning_binding_id: replacementBinding.reasoning_binding_id,
        binding_epoch: replacementBinding.binding_epoch, helix_conversation_id: chatId, run_id: null,
        client_event_ref: "fixture-browser-prompt", origin: "typed", instruction_text: "Inspect the fixture surroundings." };
      const submitPrompt = () => page.evaluate(async body => {
        const result = await fetch("/api/account/session/agent-connections/reasoning-bindings/steering/current", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        return { status: result.status, body: await result.json() };
      }, prompt);
      const firstPrompt = await submitPrompt();
      expect(firstPrompt.status).toBe(202);
      expect(await submitPrompt()).toEqual(firstPrompt);
      const pickup = { profileRef: profileId, bindingId: replacementBinding.reasoning_binding_id,
        bindingEpoch: replacementBinding.binding_epoch, clientSessionRef: "fixture-session-replacement" };
      const deliveries = await runtime.access.read(pickup);
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]).toMatchObject({ instruction_text: prompt.instruction_text,
        event: { origin: "typed", delivery_state: "pending", steering_event_ref: firstPrompt.body.event.steering_event_ref } });
      const ack = await runtime.access.acknowledge({ ...pickup, eventRef: firstPrompt.body.event.steering_event_ref });
      expect(ack.delivery_state).toBe("acknowledged");
      expect((await pool.query("SELECT count(*) AS count FROM helix_durable_steering")).rows[0].count).toBe(1);
      runtime = makeRuntime("fixture-service-after-steering");
      const recoveredBinding = await runtime.access.restore({ destination, pairingId: replacementInvitation.id,
        clientSessionRef: "fixture-session-after-steering" });
      await page.reload();
      await expect(page.getByTestId("runtime-binding")).toContainText(recoveredBinding.reasoning_binding_id);
      await expect(runtime.access.read(pickup)).rejects.toThrow("reasoning_binding_not_found");
      expect((await submitPrompt()).status).toBe(409);
      prompt.reasoning_binding_id = recoveredBinding.reasoning_binding_id;
      prompt.binding_epoch = recoveredBinding.binding_epoch;
      const recoveredPrompt = await submitPrompt();
      expect(recoveredPrompt.status).toBe(202);
      expect(recoveredPrompt.body.event).toMatchObject({ steering_event_ref: ack.steering_event_ref,
        created_at: ack.created_at, expires_at: ack.expires_at, acknowledged_at: ack.acknowledged_at,
        delivery_state: "acknowledged" });
      const recoveredPickup = { ...pickup, bindingId: recoveredBinding.reasoning_binding_id,
        bindingEpoch: recoveredBinding.binding_epoch, clientSessionRef: "fixture-session-after-steering" };
      const recoveredDeliveries = await runtime.access.read(recoveredPickup);
      expect(recoveredDeliveries).toHaveLength(1);
      expect(recoveredDeliveries[0].event).toEqual(recoveredPrompt.body.event);
      const display = await page.evaluate(async target => {
        const query = new URLSearchParams({ binding_epoch: String(target.epoch), helix_conversation_id: target.chat });
        const response = await fetch(`/api/account/session/agent-connections/reasoning-bindings/${encodeURIComponent(target.id)}/chat-prompts?${query}`);
        return { status: response.status, body: await response.json() };
      }, { id: recoveredBinding.reasoning_binding_id, epoch: recoveredBinding.binding_epoch, chat: chatId });
      expect(display.status).toBe(200);
      expect(display.body).toMatchObject({ display_only: true, provider_pickup_confirmed: false,
        answer_authority: false, terminal_eligible: false });
      expect(display.body.deliveries).toEqual(recoveredDeliveries);
      expect((await pool.query("SELECT count(*) AS count FROM helix_durable_steering")).rows[0].count).toBe(1);
      // Seed through the internal fixture access layer, not a provider principal.
      // Agent-origin authentication is covered separately by MCP tests.
      const agentInput = { ...recoveredPickup, clientEventRef: "fixture-agent-display",
        origin: "agent_submitted" as const, instructionText: "Fixture agent observation request." };
      const agentEvent = await runtime.access.dispatch(agentInput);
      expect(await runtime.access.dispatch(agentInput)).toEqual(agentEvent);
      await page.reload();
      const visiblePrompts = page.getByRole("region", { name: "Agent-submitted prompts" });
      await expect(visiblePrompts.getByText(agentInput.instructionText, { exact: true })).toHaveCount(1);
      await expect(visiblePrompts).toContainText("Last checked: pending");
      await expect(visiblePrompts).not.toContainText(prompt.instruction_text);
      await runtime.access.acknowledge({ ...recoveredPickup, eventRef: agentEvent.steering_event_ref });
      await page.reload();
      await expect(visiblePrompts).toContainText("Last checked: acknowledged");
      await expect(visiblePrompts.locator("article")).toHaveCount(1);
      await expect(visiblePrompts).toContainText("transport status, not answers or task completion");
      expect((await pool.query("SELECT count(*) AS count FROM helix_durable_steering")).rows[0].count).toBe(2);
      const revoke = page.getByRole("button", { name: "Revoke pairing" });
      if (input === "pointer") await revoke.click();
      else { await revoke.focus(); await page.keyboard.press("Enter"); }
      await expect(page.getByRole("status")).toContainText("Pairing: revoked");
      await expect(page.getByTestId("runtime-binding")).toHaveText("unavailable");
      await expect(visiblePrompts).toHaveCount(0);
      await expect(transitions.recover("fixture-provider", replacementInvitation.id)).rejects.toThrow("pairing_revoked");
      await expect(transitions.recover("fixture-provider", invitation.id)).rejects.toThrow("pairing_superseded");
      expect((await repository.read(profileId, invitation.id))?.revision).toBe(3);
      expect(mutations).toHaveLength(7);
      await expect(runtime.access.read(recoveredPickup)).rejects.toThrow("pairing_revoked");
      const browserStorage = await page.evaluate(() => JSON.stringify(localStorage));
      expect(browserStorage).not.toContain(invitation.secret);
      expect(browserStorage).not.toContain(replacementInvitation.secret);
    } finally {
      await page.close();
      if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
      await pool.end();
      setEnvironmentFixturePool(null);
      if (priorDevice === undefined) delete process.env.HELIX_DESKTOP_DEVICE_ID;
      else process.env.HELIX_DESKTOP_DEVICE_ID = priorDevice;
    }
  });
 }
}
