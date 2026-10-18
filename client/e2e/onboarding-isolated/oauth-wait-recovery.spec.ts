import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { createServer } from "node:http";
import path from "node:path";

for (const input of ["pointer", "keyboard"] as const) {
  test(`O4 OAuth local wait recovery through ${input}`, async ({ page }) => {
    const bundle = await build({
      stdin: { contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { AgentAccountBindingReadiness } from '@/components/agent-access/AgentAccountBindingReadiness';
        let rejectOpen;
        window.fixtureOpenCount = 0;
        window.casimirDesktop = {
          openAuth0AccountLink() {
            window.fixtureOpenCount++;
            return new Promise((_resolve, reject) => { rejectOpen = reject; });
          }
        };
        createRoot(document.getElementById('root')).render(<>
          <AgentAccountBindingReadiness />
          <button onClick={() => rejectOpen(new Error('fixture late failure'))}>Reject fixture open</button>
        </>);
      `, resolveDir: process.cwd(), loader: "tsx" },
      bundle: true, write: false, platform: "browser", format: "iife",
      alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared") },
      define: { "process.env.NODE_ENV": '"test"' },
    });
    let posts = 0;
    let reads = 0;
    let stallNextRead = false;
    const server = createServer((req, res) => {
      if (req.url === "/fixture.js") {
        res.setHeader("Content-Type", "text/javascript");
        return res.end(bundle.outputFiles[0].text);
      }
      if (req.url?.startsWith("/api/")) {
        res.setHeader("Content-Type", "application/json");
        if (req.method === "POST" && req.url === "/api/account/session/agent-bindings/auth0/start") {
          posts++;
          return res.end(JSON.stringify({
            schema: "casimir_desktop_auth0_account_link_start/1", ok: true,
            authorization_url: "https://fixture.invalid/authorize",
            expires_at: new Date(Date.now() + 600_000).toISOString(),
            provider: "auth0", pkce: "S256", client_secret_used: false,
            bearer_included: false, subject_included: false,
          }));
        }
        if (req.method === "GET" && req.url === "/api/account/session/agent-bindings") {
          reads++;
          if (stallNextRead) {
            stallNextRead = false;
            // Send headers, but never finish the body: exercise browser abort.
            res.writeHead(200);
            res.flushHeaders();
            return;
          }
          return res.end(JSON.stringify({ schema: "helix.agent_account_bindings.v1", oauth_ready: false, bindings: [] }));
        }
        res.statusCode = 404;
        return res.end("{}");
      }
      res.setHeader("Content-Type", "text/html");
      res.end('<!doctype html><div id="root"></div><script src="/fixture.js"></script>');
    });
    try {
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("fixture_listener_missing");
      const origin = `http://127.0.0.1:${address.port}`;
      await page.route("**/*", route => new URL(route.request().url()).origin === origin
        ? route.continue() : route.abort("blockedbyclient"));
      await page.setViewportSize({ width: input === "pointer" ? 375 : 1280, height: 640 });
      await page.goto(origin);
      const start = page.getByRole("button", { name: "Link Auth0", exact: true });
      if (input === "pointer") await start.click();
      else { await start.focus(); await page.keyboard.press("Enter"); }
      const stop = page.getByRole("button", { name: "Stop waiting", exact: true });
      await expect(stop).toBeVisible();
      if (input === "pointer") await stop.click();
      else { await page.keyboard.press("Tab"); await expect(stop).toBeFocused(); await page.keyboard.press("Enter"); }
      await expect(start).toBeEnabled();
      await expect(page.getByRole("alert")).toContainText("Stopped waiting here");
      await page.getByRole("button", { name: "Reject fixture open" }).click();
      await expect(page.getByRole("alert")).toContainText("Stopped waiting here");
      await expect(stop).toHaveCount(0);
      await expect(page.getByText("No active agent binding", { exact: true })).toBeVisible();
      expect(posts).toBe(1);
      expect(reads).toBe(2);
      expect(await page.evaluate(() => (window as any).fixtureOpenCount)).toBe(1);
      await page.clock.install();
      stallNextRead = true;
      const refresh = page.getByRole("button", { name: "Refresh binding status", exact: true });
      if (input === "pointer") await refresh.click();
      else { await refresh.focus(); await page.keyboard.press("Enter"); }
      await expect.poll(() => reads).toBe(3);
      await expect(refresh).toBeDisabled();
      await page.clock.runFor(15_000);
      await expect(page.getByText("Binding readiness unavailable", { exact: true })).toBeVisible();
      await expect(refresh).toBeEnabled();
      if (input === "pointer") await refresh.click();
      else { await refresh.focus(); await page.keyboard.press("Enter"); }
      await expect(page.getByText("No active agent binding", { exact: true })).toBeVisible();
      expect(reads).toBe(4);
      expect(posts).toBe(1);
      expect(await page.evaluate(() => (window as any).fixtureOpenCount)).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
}
