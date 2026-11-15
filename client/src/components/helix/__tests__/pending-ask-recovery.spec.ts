// @vitest-environment node
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute the real callback without mounting the unrelated legacy console.
// Explicit dependencies keep unresolved callback names observable as failures.
const source = fs.readFileSync(new URL("../HelixAskPill.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("HelixAskPill.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callbackSource = "";
const findCallback = (node: ts.Node): void => {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "resumePendingAsk") {
    if (!node.initializer || !ts.isCallExpression(node.initializer)) throw new Error("resume callback missing");
    callbackSource = node.initializer.arguments[0].getText(parsed);
  }
  ts.forEachChild(node, findCallback);
};
findCallback(parsed);
if (!callbackSource) throw new Error("resume callback not found");
const callbackJs = ts.transpileModule(`(${callbackSource})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const makeHarness = () => {
  const setters = Object.fromEntries([
    "setAskBusy", "setAskStatus", "setAskError", "setAskLiveEvents", "resetActiveTurnDisplayState",
    "resetReasoningTheaterEventClock", "setAskLiveDraft", "clearLiveDraftFlush", "setAskElapsedMs",
    "setAskActiveQuestion", "clearMoodTimer", "cancelMoodHint", "updateMoodFromText", "requestMoodHint",
    "setAskLiveSessionId", "setAskLiveTraceId", "setActive", "setAskReplies", "addMessage",
    "applyGovernedActionEnvelope", "applyWorkstationActionsFromPayload", "launchAtomicViewer",
    "addHelixTimelineEntry", "updateReasoningAttempt",
  ].map(name => [name, vi.fn()]));
  const refs = {
    askLiveEventsRef: { current: [] }, askLiveDraftRef: { current: "" }, askLiveDraftBufferRef: { current: "" },
    askStartRef: { current: 0 }, activeAskStartedAtMsRef: { current: null as number | null },
    askAbortRef: { current: null as AbortController | null }, askRunIdRef: { current: 0 },
  };
  let watchdog: (() => void) | undefined;
  const window = {
    setTimeout: vi.fn((handler: () => void) => { watchdog = handler; return 42; }),
    clearTimeout: vi.fn(),
  };
  const resumeHelixAskJob = vi.fn();
  const context = {
    ...setters, ...refs, window, resumeHelixAskJob, AbortController, Error, Date,
    crypto: { randomUUID: () => "generated-trace" }, getHelixAskSessionId: () => "fallback-session",
    HELIX_ASK_TURN_CLIENT_WATCHDOG_MS: 1000,
    clipText: (value: string, limit: number) => value.slice(0, limit),
  };
  const resume = vm.runInNewContext(callbackJs, context) as (pending: {
    jobId: string; question?: string; sessionId?: string; traceId?: string;
  }) => Promise<void>;
  return { resume, refs, setters, window, resumeHelixAskJob, fireWatchdog: () => watchdog?.() };
};
const pending = { jobId: "pending-job", question: "Read the current room status", sessionId: "saved-session", traceId: "saved-trace" };

const expectNoAnswerOrAction = (h: ReturnType<typeof makeHarness>) => {
  for (const name of ["setAskReplies", "addMessage", "applyGovernedActionEnvelope", "applyWorkstationActionsFromPayload", "launchAtomicViewer", "updateReasoningAttempt"]) {
    expect(h.setters[name], name).not.toHaveBeenCalled();
  }
  expect(h.refs.askAbortRef.current).toBeNull();
  expect(h.refs.askLiveDraftRef.current).toBe("");
  expect(h.setters.setAskBusy).toHaveBeenLastCalledWith(false);
  expect(h.window.clearTimeout).toHaveBeenCalledWith(42);
};

describe("pending Ask recovery failures", () => {
  it("reports a rejected resume without borrowing a new-turn attempt or publishing partial output", async () => {
    const h = makeHarness();
    h.resumeHelixAskJob.mockImplementation(async () => {
      h.refs.askLiveDraftRef.current = "unconfirmed partial response";
      throw new Error("connection lost");
    });
    await expect(h.resume(pending)).resolves.toBeUndefined();
    expect(h.resumeHelixAskJob).toHaveBeenCalledTimes(1);
    expect(h.setters.setAskError).toHaveBeenCalledWith("connection lost");
    expect(h.setters.addHelixTimelineEntry).toHaveBeenCalledWith(expect.objectContaining({
      type: "suppressed", status: "failed", mode: "observe", traceId: "saved-trace",
      text: "Transport failed before authoritative terminal. Partial stream was discarded: connection lost",
    }));
    expect(h.setters.addHelixTimelineEntry.mock.calls[0][0]).not.toHaveProperty("attemptId");
    expectNoAnswerOrAction(h);
  });

  it("reports a watchdog timeout without referencing an unrelated manual attempt", async () => {
    const h = makeHarness();
    h.resumeHelixAskJob.mockImplementation((_id: string, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const completion = h.resume(pending);
    h.fireWatchdog();
    await expect(completion).resolves.toBeUndefined();
    expect(h.setters.setAskError).toHaveBeenCalledWith("Turn timed out after 1000ms before a terminal result was returned.");
    expect(h.setters.addHelixTimelineEntry).toHaveBeenCalledWith(expect.objectContaining({
      type: "suppressed", status: "failed", mode: "observe", traceId: "saved-trace", detail: "turn_timeout",
      meta: expect.objectContaining({ router_fail_id: "RF_TURN_TIMEOUT" }),
    }));
    expect(h.setters.addHelixTimelineEntry.mock.calls[0][0]).not.toHaveProperty("attemptId");
    expectNoAnswerOrAction(h);
  });

  it("keeps user cancellation passive", async () => {
    const h = makeHarness();
    h.resumeHelixAskJob.mockImplementation(async () => { throw Object.assign(new Error("stopped"), { name: "AbortError" }); });
    await expect(h.resume(pending)).resolves.toBeUndefined();
    expect(h.setters.setAskStatus).toHaveBeenCalledWith("Generation stopped.");
    expect(h.setters.addHelixTimelineEntry).not.toHaveBeenCalled();
    expectNoAnswerOrAction(h);
  });

  it("does nothing without a pending job", async () => {
    const h = makeHarness();
    await expect(h.resume({ jobId: "" })).resolves.toBeUndefined();
    expect(h.resumeHelixAskJob).not.toHaveBeenCalled();
    expect(h.setters.setAskBusy).not.toHaveBeenCalled();
    expect(h.window.setTimeout).not.toHaveBeenCalled();
  });
});
