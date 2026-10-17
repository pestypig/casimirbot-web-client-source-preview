import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("client startup reload policy", () => {
  it("cleans stale build state without restarting an already-rendered app", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/main.tsx"), "utf8");
    const buildSync = source.slice(source.indexOf("const syncBuildStamp"), source.indexOf("const shouldAutoReload"));
    expect(buildSync).not.toContain("scheduleReloadOnce()");
    expect(source).not.toContain('serviceWorker.addEventListener("controllerchange"');
    expect(source).toContain("isProd && isSecure && !isNativeDesktop");
  });
});
