import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectLatestReasoningBinding } from "../reasoningTaskBinding";
import { observeReasoningBindingStatus } from "../observeReasoningBindingStatus";

vi.mock("../reasoningTaskBinding", () => ({ inspectLatestReasoningBinding: vi.fn() }));
const inspect = vi.mocked(inspectLatestReasoningBinding);
const binding = (status: "pending_claim" | "active" | "revoked") => ({
  reasoning_binding_id: "binding-test", helix_conversation_id: "chat-test",
  binding_epoch: 2, continuation_transport: "polling" as const, status,
});
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe("selected external destination binding status", () => {
  it("observes a later external claim and revocation without reselecting destination", async () => {
    vi.useFakeTimers();
    inspect.mockResolvedValueOnce(binding("pending_claim"))
      .mockResolvedValueOnce(binding("active"))
      .mockResolvedValueOnce(binding("revoked"));
    const status = vi.fn();
    const stop = observeReasoningBindingStatus(status);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(status.mock.calls).toEqual([[false], [true], [false]]);
    stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(inspect).toHaveBeenCalledTimes(3);
  });

  it("fails closed on read failure and recovers on a later verified read", async () => {
    vi.useFakeTimers();
    inspect.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(binding("active"));
    const status = vi.fn();
    const stop = observeReasoningBindingStatus(status);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(status.mock.calls).toEqual([[false], [true]]);
    stop();
  });

  it("does not overlap slow reads or publish after destination cleanup", async () => {
    vi.useFakeTimers();
    let resolve!: (value: ReturnType<typeof binding>) => void;
    inspect.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const status = vi.fn();
    const stop = observeReasoningBindingStatus(status);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(inspect).toHaveBeenCalledTimes(1);
    stop();
    resolve(binding("active"));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(status).not.toHaveBeenCalled();
    expect(inspect).toHaveBeenCalledTimes(1);
  });
});
