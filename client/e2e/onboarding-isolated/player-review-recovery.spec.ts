import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { createServer } from "node:http";
import path from "node:path";
import { buildOnboardingStyles } from "./production-styles";

test.setTimeout(90_000);
let script: string, styles: string;
test.beforeAll(async () => {
  styles = await buildOnboardingStyles();
  const bundle = await build({ entryPoints: [path.resolve("client/e2e/onboarding-isolated/player-review-entry.tsx")],
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared") },
    define: { "process.env.NODE_ENV": '"test"', "import.meta.env": "{}" } });
  script = bundle.outputFiles[0].text;
});
for (const input of ["pointer", "keyboard"] as const) {
  test(`O4 ${input}: retain exact-player draft across sensing recovery; require fresh consent`, async ({ page }) => {
    const server = createServer((req, res) => {
      if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(script); }
      else if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); res.end(styles); }
      else { res.setHeader("Content-Type", "text/html"); res.end('<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>'); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture_listener_missing");
    const origin = `http://127.0.0.1:${address.port}`;
    let status = "active", subject = "subject:player-review-alice", epoch = 1;
    const mutations: string[] = [];
    try {
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort("blockedbyclient");
        if (!url.pathname.startsWith("/api/")) return route.continue();
        if (!["GET", "HEAD"].includes(route.request().method())) mutations.push(route.request().method() + " " + url.pathname);
        if (url.pathname.endsWith("/environments")) return route.fulfill({ json: {
          schema: "helix.room_environments.receipt.v1", ok: true, error: null, message: "Fixture observations",
          environments: [{ environment_binding_id: "environment:player-review-fixture", room_id: "room:player-review-fixture",
            room_source_binding_id: "source-binding:player-review-fixture", source_id: "source:player-review-fixture",
            world_id: "world:player-review-fixture", domain: "minecraft", domain_adapter: "minecraft.fabric_mod.v1",
            source_label: "Player review fixture", connection_status: "active", capability_ids: [],
            subject_directory: null, self_subject_binding: { status, subject_ref: subject, subject_label: "Fixture player",
              subject_binding_id: `subject-binding:fixture-${epoch}`, producer_epoch_ref: `epoch:fixture-${epoch}` },
            identity_assignment: status === "active" ? "supported" : "reverification_required" }],
        } });
        return route.fulfill({ json: { ok: true, authority: null, authorities: [], bindings: [], pairings: [] } });
      });
      await page.setViewportSize({ width: input === "pointer" ? 375 : 1280, height: 640 });
      await page.clock.install();
      await page.goto(origin);
      const keep = ["Walk", "Look", "Jump", "Fluid TAS sequence"];
      const capabilities = page.getByRole("group", { name: "Exact player capabilities" }).getByRole("checkbox");
      await expect(capabilities).toHaveCount(21);
      const toggle = async (control: ReturnType<typeof page.getByRole>) => {
        if (input === "pointer") await control.click();
        else { await control.focus(); await page.keyboard.press("Space"); }
      };
      for (const control of await capabilities.all()) {
        const label = (await control.locator("..").innerText()).trim();
        if (!keep.includes(label)) await toggle(control);
      }
      const duration = page.getByRole("combobox", { name: /Player action lease duration/ });
      if (input === "pointer") await duration.selectOption(String(8 * 3600000));
      else { await duration.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); }
      await expect(duration).toHaveValue(String(8 * 3600000));
      const consent = page.getByLabel(/Acknowledge Minecraft player control/);
      await toggle(consent);
      await expect(page.getByRole("button", { name: "Save player authority", exact: true })).toBeEnabled();
      status = "stale";
      await page.clock.fastForward(10001);
      await expect(capabilities).toHaveCount(0);
      status = "active"; epoch++;
      await page.clock.fastForward(10001);
      await expect(capabilities).toHaveCount(21);
      for (const control of await capabilities.all()) {
        const label = (await control.locator("..").innerText()).trim();
        if (keep.includes(label)) await expect(control).toBeChecked(); else await expect(control).not.toBeChecked();
      }
      await expect(duration).toHaveValue(String(8 * 3600000));
      await expect(consent).not.toBeChecked();
      await expect(page.getByRole("button", { name: "Save player authority", exact: true })).toBeDisabled();
      subject = "subject:player-review-bob"; epoch++;
      await page.clock.fastForward(10001);
      await expect(page.getByRole("checkbox", { name: "Navigate", exact: true })).toBeChecked();
      await expect(consent).not.toBeChecked();
      expect(mutations).toEqual([]);
      expect(await page.evaluate(() => Object.keys(localStorage).some(key => /player.*review|player.*draft/.test(key)))).toBe(false);
    } finally {
      await page.goto("about:blank"); server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}
