import { afterEach, describe, expect, it, vi } from "vitest";
import { askLocal } from "../api";

const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});
const globals = globalThis as Record<string, unknown>;
afterEach(() => {
  delete globals.__HELIX_E8_14_LANE_PARITY__;
  vi.unstubAllGlobals();
});
const snapshot = {
  schema: "helix.workspace_context_snapshot.v1", activePanel: "friends",
  importedContext: { marker: "PASSIVE-CONTEXT-TEST", text: "Testing a sensor context handoff.", assistant_answer: false, terminal_eligible: false },
};
const setup = (route: "turn" | "job" | "legacy") => {
  globals.__HELIX_E8_14_LANE_PARITY__ = route === "turn";
  const fetcher = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    if (String(url) === "/api/agi/ask/jobs") return route === "legacy"
      ? jsonResponse({ error: "not_found" }, 404)
      : jsonResponse({ jobId: "workspace-fixture-job", status: "queued" });
    if (String(url) === "/api/agi/ask/jobs/workspace-fixture-job") {
      return jsonResponse({ jobId: "workspace-fixture-job", status: "completed", result: { text: "Fixture answer" } });
    }
    if (["/api/agi/ask/turn", "/api/agi/ask"].includes(String(url))) return jsonResponse({ text: "Fixture answer" });
    throw new Error(`Unexpected fixture request: ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
};
const requestBodies = (fetcher: ReturnType<typeof setup>) => fetcher.mock.calls
  .filter(([, init]) => init?.method === "POST")
  .map(([url, init]) => ({ url: String(url), body: JSON.parse(String(init?.body)) }));

describe("explicit workspace context through askLocal", () => {
  it.each(["turn", "job", "legacy"] as const)("preserves explicit context on the %s path", async route => {
    const fetcher = setup(route);
    const response = await askLocal("Summarize the imported update", { workspaceContextSnapshot: snapshot });
    expect(response.text).toBe("Fixture answer");
    const requests = requestBodies(fetcher);
    expect(requests.map(x => x.url)).toEqual(route === "turn" ? ["/api/agi/ask/turn"]
      : route === "job" ? ["/api/agi/ask/jobs"] : ["/api/agi/ask/jobs", "/api/agi/ask"]);
    for (const { body } of requests) {
      expect(body.workspace_context_snapshot).toEqual(snapshot);
      expect(body.question).toBe("Summarize the imported update");
      expect(body).not.toHaveProperty("mandatory_next_tool");
      expect(body).not.toHaveProperty("workstation_actions");
      expect(body).not.toHaveProperty("allowTools");
    }
    expect(fetcher).toHaveBeenCalledTimes(route === "turn" ? 1 : 2);
  });
  it("keeps context omitted when the caller has excluded it", async () => {
    const fetcher = setup("turn");
    await askLocal("Isolated question", { workspaceContextSnapshot: undefined });
    expect(requestBodies(fetcher)[0].body).not.toHaveProperty("workspace_context_snapshot");
  });
  it("does not serialize an array as a workspace record", async () => {
    const fetcher = setup("turn");
    await askLocal("Malformed context", { workspaceContextSnapshot: [] as unknown as Record<string, unknown> });
    expect(requestBodies(fetcher)[0].body).not.toHaveProperty("workspace_context_snapshot");
  });
});
