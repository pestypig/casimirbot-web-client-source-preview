import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { buildOnboardingStyles } from "./production-styles";
let server: Server;
let origin: string;
test.beforeAll(async () => {
  const styles = await buildOnboardingStyles();
  const bundle = await build({ entryPoints: [path.resolve("client/e2e/onboarding-isolated/durable-entry.tsx")],
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' } });
  server = createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); }
    else if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); res.end(styles); }
    else if (req.url === "/") { res.setHeader("Content-Type", "text/html"); res.end('<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>'); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture_listener_missing");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });
for (const input of ["pointer", "keyboard"] as const) {
  test(`O4 ${input} recovers an ended previous pairing without granting consent`, async ({ page }) => {
    await page.setViewportSize({ width: input === "pointer" ? 375 : 1280, height: 640 });
    await page.clock.install({ time: new Date("2026-09-08T12:02:00Z") });
    const priorReview = { requestId: "fixture-prior", registrationId: "fixture-registration", chatId: "fixture-chat",
      environment: { roomId: "fixture-room", runId: "fixture-run" }, invitationSeconds: 900, pairingSeconds: 28800 };
    const priorPairing = { schema: "helix.pairing_status.v1", id: "pairing:fixture-prior", revision: 2,
      destinationDigest: "a".repeat(64), chatId: priorReview.chatId, environment: priorReview.environment,
      state: "accepted", createdAt: "2026-09-08T12:00:00Z", invitationExpiresAt: "2026-09-08T12:15:00Z",
      pairingExpiresAt: "2026-09-08T12:03:00Z", acceptedAt: "2026-09-08T12:01:00Z", revokedAt: null,
      executionAuthority: false, answerAuthority: false };
    const draft = { ...priorReview, requestId: "fixture-replacement", replacement: { pairingId: priorPairing.id, revision: 2 } };
    await page.addInitScript(({ priorReview, priorPairing, draft }) => {
      if (localStorage.getItem("fixture-review-initialized")) return;
      const key = `helix.pairing.review.v1:${JSON.stringify(["fixture-owner", "fixture-chat"])}`;
      localStorage.setItem(`${key}:draft`, JSON.stringify(draft));
      localStorage.setItem(`${key}:previous`, JSON.stringify({ review: priorReview, pairing: priorPairing }));
      localStorage.setItem(`${key}:destination`, priorPairing.destinationDigest);
      localStorage.setItem("fixture-review-initialized", "true");
    }, { priorReview, priorPairing, draft });
    let ended = false;
    const writes: any[] = [];
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname.endsWith("/reasoning-destinations")) return route.fulfill({ json: {
        ok: true, execution_authority: false, answer_authority: false, destinations: [{
          registrationId: draft.registrationId, expiresAt: "2026-09-09T12:00:00Z", destinationDigest: priorPairing.destinationDigest,
          proofBasis: "authenticated_client_declaration", currentPresence: false, pairingAuthority: false, executionAuthority: false,
          destination: { issuer: "fixture-issuer", profileId: "fixture-owner", installationId: "fixture-installation",
            clientId: "fixture-client", taskId: "fixture-task" },
        }],
      } });
      if (url.pathname.includes("/reasoning-bindings/")) return route.fulfill({ status: 409, json: { ok: false } });
      if (url.pathname.includes("/reasoning-pairings/")) return route.fulfill({ json: { ok: true,
        pairing: ended ? { ...priorPairing, state: "expired", revision: 3 } : priorPairing,
        runtime_binding_active: false, execution_authority: false, answer_authority: false } });
      if (url.pathname.endsWith("/reasoning-invitations")) {
        writes.push(route.request().postDataJSON());
        return route.fulfill({ status: 503, json: { ok: false } });
      }
      return route.abort("blockedbyclient");
    });
    await page.goto(origin);
    const activate = async (control: ReturnType<typeof page.getByRole>, key = "Space") => {
      if (input === "pointer") await control.click();
      else { await control.focus(); await page.keyboard.press(key); }
    };
    const consent = page.getByLabel(/I approve pairing/);
    await expect(consent).toBeEnabled(); await activate(consent);
    ended = true; await page.clock.fastForward(65_000);
    await expect(page.getByText("Previous pairing: expired.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve pairing and create invitation" })).toBeDisabled();
    await activate(page.getByRole("button", { name: "Review a new invitation" }), "Enter");
    await expect(consent).not.toBeChecked();
    await expect(page.getByLabel(/Include environment run fixture-run/)).toBeChecked();
    await expect(page.getByLabel("Replacement review")).toHaveCount(0);
    expect(writes).toHaveLength(0);
    await page.reload();
    await expect(consent).not.toBeChecked();
    await expect(page.getByLabel("Replacement review")).toHaveCount(0);
    await activate(consent);
    await activate(page.getByRole("button", { name: "Approve pairing and create invitation" }), "Enter");
    await expect(page.getByRole("alert")).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0].replacement).toBeUndefined();
    expect(writes[0].requestId).not.toBe(draft.requestId);
    expect(writes[0]).toMatchObject({ registrationId: draft.registrationId, environment: priorReview.environment });
  });
  test(`O4 ${input} replacement stays usable during a delayed status poll`, async ({ page }) => {
    await page.setViewportSize({ width: input === "pointer" ? 375 : 1280, height: 640 });
    await page.clock.install({ time: new Date("2026-09-08T12:02:00Z") });
    const review = { requestId: "fixture-original", registrationId: "fixture-registration", chatId: "fixture-chat",
      environment: { roomId: "fixture-room", runId: "fixture-old-run" }, invitationSeconds: 900, pairingSeconds: 28800 };
    const pairing = { schema: "helix.pairing_status.v1", id: "fixture-pairing", revision: 2,
      destinationDigest: "a".repeat(64), chatId: review.chatId, environment: review.environment,
      state: "accepted", createdAt: "2026-09-08T12:00:00Z", invitationExpiresAt: "2026-09-08T12:15:00Z",
      pairingExpiresAt: "2026-09-08T20:00:00Z", acceptedAt: "2026-09-08T12:01:00Z", revokedAt: null,
      executionAuthority: false, answerAuthority: false };
    await page.addInitScript(({ review, pairing }) => {
      const key = `helix.pairing.review.v1:${JSON.stringify(["fixture-owner", "fixture-chat"])}`;
      localStorage.setItem(key, JSON.stringify(review)); localStorage.setItem(`${key}:pairing`, pairing.id);
      localStorage.setItem(`${key}:destination`, pairing.destinationDigest);
    }, { review, pairing });
    let blockPoll = false;
    let releasePoll: (() => void) | undefined;
    const writes: unknown[] = [];
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname.endsWith("/reasoning-destinations")) return route.fulfill({ json: {
        ok: true, execution_authority: false, answer_authority: false, destinations: [{
          registrationId: review.registrationId, expiresAt: "2026-09-09T12:00:00Z", destinationDigest: pairing.destinationDigest,
          proofBasis: "authenticated_client_declaration", currentPresence: false, pairingAuthority: false, executionAuthority: false,
          destination: { issuer: "fixture-issuer", profileId: "fixture-owner", installationId: "fixture-installation",
            clientId: "fixture-client", taskId: "fixture-task" },
        }],
      } });
      if (url.pathname.includes("/reasoning-bindings/")) return route.fulfill({ status: 409, json: { ok: false } });
      if (url.pathname.includes("/reasoning-pairings/")) {
        if (blockPoll) await new Promise<void>(resolve => { releasePoll = resolve; });
        return route.fulfill({ json: { ok: true, pairing, runtime_binding_active: null,
          execution_authority: false, answer_authority: false } });
      }
      if (url.pathname.endsWith("/reasoning-invitations")) {
        writes.push(route.request().postDataJSON());
        return route.fulfill({ status: 503, json: { ok: false } });
      }
      return route.abort("blockedbyclient");
    });
    await page.goto(origin);
    await page.getByRole("button", { name: "Review replacement pairing" }).click();
    await expect(page.getByRole("button", { name: "Return to previous pairing" })).toBeVisible();
    blockPoll = true;
    await page.clock.fastForward(5000);
    await expect.poll(() => Boolean(releasePoll)).toBe(true);
    const consent = page.getByLabel(/I approve pairing/);
    await expect(consent).toBeEnabled();
    const activate = async (control: ReturnType<typeof page.getByRole>, key = "Space") => {
      if (input === "pointer") await control.click();
      else { await control.focus(); await page.keyboard.press(key); }
    };
    await activate(consent);
    await expect(consent).toBeChecked();
    await activate(page.getByRole("button", { name: "Review current environment run fixture-run" }), "Enter");
    await expect(consent).not.toBeChecked();
    const run = page.getByLabel(/Include environment run fixture-run/);
    await expect(run).not.toBeChecked();
    await activate(run); await activate(consent);
    await expect(run).toBeChecked(); await expect(consent).toBeChecked();
    await activate(page.getByRole("button", { name: "Approve pairing and create invitation" }), "Enter");
    expect(writes).toHaveLength(0);
    blockPoll = false; releasePoll!();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ registrationId: review.registrationId,
      environment: { roomId: "fixture-room", runId: "fixture-run" }, replacement: { pairingId: pairing.id, revision: 2 } });
  });
}
for (const input of ["pointer", "keyboard"] as const) {
 for (const width of [375, 1280]) {
  test(`O4 ${input} consent at ${width}px survives idle and reload`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await page.clock.install({ time: new Date("2026-09-08T12:00:00.000Z") });
    const writes: unknown[] = [];
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname.includes("/reasoning-invitations/")) return route.fulfill({ json: {
        ok: true, pairing: null, execution_authority: false, answer_authority: false,
      } });
      if (url.pathname.endsWith("/reasoning-destinations")) return route.fulfill({ json: {
        ok: true, execution_authority: false, answer_authority: false, destinations: [{
          registrationId: "fixture-registration", expiresAt: "2026-09-09T12:00:00.000Z",
          destinationDigest: "a".repeat(64),
          proofBasis: "authenticated_client_declaration", currentPresence: false,
          pairingAuthority: false, executionAuthority: false,
          destination: { issuer: "fixture-issuer", profileId: "fixture-owner", installationId: "fixture-installation", clientId: "fixture-client", taskId: "fixture-task" },
        }],
      } });
      if (url.pathname.endsWith("/reasoning-invitations")) {
        writes.push(route.request().postDataJSON());
        return route.fulfill({ status: 503, json: { ok: false } });
      }
      return route.abort("blockedbyclient");
    });
    await page.goto(origin);
    const picker = page.getByLabel("Registered AI task");
    await expect(picker.locator("option")).toHaveCount(2);
    if (input === "pointer") await picker.selectOption("fixture-registration");
    else { await picker.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); }
    const run = page.getByLabel(/Include environment run/);
    const consent = page.getByLabel(/I approve pairing/);
    if (input === "pointer") {
      await consent.scrollIntoViewIfNeeded();
      const bounds = await consent.boundingBox();
      if (!bounds) throw new Error("fixture_consent_bounds_missing");
      // Deliberately occlude the fixture. A native pointer click must hit the
      // overlay, not approve through it. No forced clicks or production UI.
      await page.evaluate(() => {
        const overlay = document.createElement("div");
        overlay.id = "fixture-overlay";
        overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.2)";
        const close = document.createElement("button");
        close.textContent = "Close fixture overlay";
        close.onclick = () => overlay.remove();
        overlay.append(close); document.body.append(overlay);
      });
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await expect(consent).not.toBeChecked();
      expect(writes).toHaveLength(0);
      await page.getByRole("button", { name: "Close fixture overlay" }).click();
    }
    for (const control of [run, consent]) {
      if (input === "pointer") await control.click();
      else { await control.focus(); await page.keyboard.press("Space"); }
      await expect(control).toBeChecked();
    }
    const approve = page.getByRole("button", { name: "Approve pairing and create invitation" });
    const beforeIdle = await page.evaluate(() => Date.now());
    await page.clock.fastForward(301_000);
    expect(await page.evaluate(() => Date.now()) - beforeIdle).toBeGreaterThanOrEqual(301_000);
    await expect(picker).toHaveValue("fixture-registration");
    await expect(run).toBeChecked();
    await expect(consent).toBeChecked();
    await expect(approve).toBeEnabled();
    expect(writes).toHaveLength(0);
    if (input === "pointer") await approve.click();
    else { await approve.focus(); await page.keyboard.press("Enter"); }
    await expect(page.getByRole("alert")).toBeVisible();
    expect(writes).toHaveLength(1);
    await page.reload();
    const reconcile = page.getByRole("button", { name: "Reconcile invitation" });
    await expect(reconcile).toBeEnabled();
    await reconcile.click();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
    expect(writes[0]).toMatchObject({ chatId: "fixture-chat", environment: { roomId: "fixture-room", runId: "fixture-run" } });
  });
 }
}
