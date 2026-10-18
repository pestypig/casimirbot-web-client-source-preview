import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { createServer, type Server } from "node:http";
import path from "node:path";

// O1/O5 diagnostic: records the current recovery defect, not acceptance.
test("changing the desktop origin strands saved chat and setup without deleting them", async ({ page }) => {
  const bundle = await build({
    stdin: { contents: `
      import { useAgiChatStore } from '@/store/useAgiChatStore';
      import { AGENT_CONNECTION_SETUP_STORAGE_KEY as key, restoreAgentConnectionSetup,
        persistableAgentConnectionSetup, agentConnectionSetupReducer,
        INITIAL_AGENT_CONNECTION_SETUP_STATE } from '@/components/agent-access/agentConnectionSetupState';
      window.fixture = {
        save() {
          const id = useAgiChatStore.getState().newSession('Origin recovery fixture');
          localStorage.setItem(key, JSON.stringify(persistableAgentConnectionSetup(
            agentConnectionSetupReducer(INITIAL_AGENT_CONNECTION_SETUP_STATE, {type:'choose', profile:'codex_app'})
          )));
          return id;
        },
        read() {
          return { sessions: Object.keys(useAgiChatStore.getState().sessions),
            setup: restoreAgentConnectionSetup(localStorage.getItem(key)) };
        }
      };
    `, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, write: false, platform: "browser", format: "iife",
    alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared") },
    define: { "process.env.NODE_ENV": '"test"', "import.meta.env": "{}" },
  });
  const servers: Server[] = [];
  try {
    const origins: string[] = [];
    for (let index = 0; index < 2; index++) {
      const server = createServer((req, res) => {
        if (req.url === "/fixture.js") {
          res.setHeader("Content-Type", "text/javascript");
          res.end(bundle.outputFiles[0].text);
        } else {
          res.setHeader("Content-Type", "text/html");
          res.end('<!doctype html><script src="/fixture.js"></script>');
        }
      });
      servers.push(server);
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("fixture_listener_missing");
      origins.push(`http://127.0.0.1:${address.port}`);
    }
    await page.route("**/*", route => origins.includes(new URL(route.request().url()).origin)
      ? route.continue() : route.abort("blockedbyclient"));
    await page.goto(origins[0]);
    const id = await page.evaluate(() => (window as any).fixture.save());
    await page.reload();
    const retained = await page.evaluate(() => (window as any).fixture.read());
    expect(retained.sessions).toContain(id);
    expect(retained.setup.selectedProfile).toBe("codex_app");
    await page.goto(origins[1]);
    const stranded = await page.evaluate(() => (window as any).fixture.read());
    expect(stranded.sessions).not.toContain(id);
    expect(stranded.setup.selectedProfile).toBeNull();
    expect(stranded.setup.viewedStep).toBe("choose");
    await page.goto(origins[0]);
    expect(await page.evaluate(() => (window as any).fixture.read())).toEqual(retained);
  } finally {
    await Promise.all(servers.map(server => new Promise<void>((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()))));
  }
});
