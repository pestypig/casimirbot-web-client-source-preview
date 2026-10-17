// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CodexConversationConsoleHistory } from "../CodexConversationConsoleHistory";

const inspect = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agent-access/reasoningTaskBinding", () => ({
  HELIX_REASONING_BINDING_UPDATED_EVENT: "helix:reasoning-binding-updated",
  inspectCurrentReasoningBinding: inspect,
}));

afterEach(() => { cleanup(); delete window.casimirDesktop; inspect.mockReset(); });

it("shows visible Codex updates in the main pane before the final answer, then clears on revocation", async () => {
  inspect.mockResolvedValue({ status: "active", helix_conversation_id: "chat:fixture",
    reasoning_binding_id: "binding:owner" });
  window.casimirDesktop = { readCodexMirror: vi.fn(async () => ({ status: "ready", frame: {
    schema: "helix.codex_conversation_cloud_frame.v1",
    taskId: "01a0798b-b5bd-7bf2-946a-9a77e086316a",
    turns: [{ id: "turn:one", user: "Check the build", assistant: "The build passed.",
      assistantPhase: "final_answer", status: "completed",
      updates: ["Running the package check.", "Verifying the output."],
    }],
  } })) } as unknown as NonNullable<Window["casimirDesktop"]>;
  render(<CodexConversationConsoleHistory helixConversationId="chat:fixture" />);
  const history = screen.getByRole("log", { name: "Codex conversation history" });
  await waitFor(() => expect(history).toHaveTextContent("The build passed."));
  expect(history).toHaveTextContent("Running the package check.");
  expect(history).toHaveTextContent("Verifying the output.");
  expect(history.textContent?.indexOf("Verifying the output.")).toBeLessThan(
    history.textContent?.indexOf("The build passed.") ?? 0);
  act(() => window.dispatchEvent(new CustomEvent("helix:reasoning-binding-updated", {
    detail: { helix_conversation_id: "chat:fixture", status: "revoked" },
  })));
  expect(history).toHaveTextContent("Conversation unavailable");
  expect(history).not.toHaveTextContent("Running the package check.");
});

it("removes revoked task text and ignores a read completed after revocation", async () => {
  inspect.mockResolvedValue({ status: "active", helix_conversation_id: "chat:fixture",
    reasoning_binding_id: "binding:owner" });
  let finishRead!: (value: unknown) => void;
  const pending = new Promise(resolve => { finishRead = resolve; });
  const readCodexMirror = vi.fn(() => pending);
  window.casimirDesktop = { readCodexMirror } as unknown as NonNullable<Window["casimirDesktop"]>;
  render(<CodexConversationConsoleHistory helixConversationId="chat:fixture" />);
  await waitFor(() => expect(readCodexMirror).toHaveBeenCalledTimes(1));
  act(() => window.dispatchEvent(new CustomEvent("helix:reasoning-binding-updated", {
    detail: { helix_conversation_id: "chat:fixture", status: "revoked" },
  })));
  const history = screen.getByRole("log", { name: "Codex conversation history" });
  expect(history).toHaveTextContent("Conversation unavailable");
  await act(async () => { finishRead({ status: "ready", frame: {
    schema: "helix.codex_conversation_cloud_frame.v1",
    taskId: "01a0798b-b5bd-7bf2-946a-9a77e086316a",
    turns: [{ id: "old-turn", user: "Old task text", assistant: "Old answer",
      assistantPhase: "final_answer", status: "completed" }],
  } }); });
  expect(history).not.toHaveTextContent("Old task text");
});

it("does not cancel its mirror read when inspection republishes the same active binding", async () => {
  const binding = { status: "active", helix_conversation_id: "chat:fixture",
    reasoning_binding_id: "binding:owner", binding_epoch: 1 };
  inspect.mockImplementation(async () => {
    window.dispatchEvent(new CustomEvent("helix:reasoning-binding-updated", { detail: binding }));
    return binding;
  });
  const readCodexMirror = vi.fn(async () => ({ status: "ready", frame: {
    schema: "helix.codex_conversation_cloud_frame.v1",
    taskId: "01a0798b-b5bd-7bf2-946a-9a77e086316a",
    turns: [{ id: "turn:one", user: "Check", assistant: "Visible answer",
      assistantPhase: "final_answer", status: "completed" }],
  } }));
  window.casimirDesktop = { readCodexMirror } as unknown as NonNullable<Window["casimirDesktop"]>;
  render(<CodexConversationConsoleHistory helixConversationId="chat:fixture" />);
  await waitFor(() => expect(screen.getByRole("log", { name: "Codex conversation history" }))
    .toHaveTextContent("Visible answer"));
  expect(inspect).toHaveBeenCalledTimes(1);
  expect(readCodexMirror).toHaveBeenCalledTimes(1);
});

it("labels a transient owner-verified reader retry and clears on a failed grant", async () => {
  inspect.mockResolvedValue({ status: "active", helix_conversation_id: "chat:fixture",
    reasoning_binding_id: "binding:owner", binding_epoch: 1 });
  const readCodexMirror = vi.fn()
    .mockResolvedValueOnce({ status: "ready", frame: {
      schema: "helix.codex_conversation_cloud_frame.v1",
      taskId: "01a0798b-b5bd-7bf2-946a-9a77e086316a",
      turns: [{ id: "turn:one", user: "Verified request", assistant: "Verified answer",
        assistantPhase: "final_answer", status: "completed" }],
    } })
    .mockResolvedValueOnce({ status: "retryable", code: "codex_mirror_request_timeout" })
    .mockResolvedValueOnce({ status: "unavailable", code: "codex_mirror_owner_grant_changed" });
  window.casimirDesktop = { readCodexMirror } as unknown as NonNullable<Window["casimirDesktop"]>;
  vi.useFakeTimers();
  try {
    render(<CodexConversationConsoleHistory helixConversationId="chat:fixture" />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const history = screen.getByRole("log", { name: "Codex conversation history" });
    expect(history).toHaveTextContent("Verified answer");
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(history).toHaveTextContent("reader reconnecting");
    expect(history).toHaveTextContent("Verified answer");
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(history).toHaveTextContent("Conversation unavailable");
    expect(history).not.toHaveTextContent("Verified answer");
  } finally { vi.useRealTimers(); }
});
