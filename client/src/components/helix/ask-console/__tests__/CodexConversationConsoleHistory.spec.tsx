// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexConversationConsoleHistory } from "../CodexConversationConsoleHistory";

const { inspectBinding } = vi.hoisted(() => ({ inspectBinding: vi.fn() }));
vi.mock("@/lib/agent-access/reasoningTaskBinding", () => ({
  HELIX_REASONING_BINDING_UPDATED_EVENT: "test-reasoning-binding-updated",
  inspectCurrentReasoningBinding: inspectBinding,
}));
vi.mock("../HelixAskFinalAnswer", () => ({
  HelixAskFinalAnswer: ({ text }: { text: string }) => <p>{text}</p>,
}));

const frame = (count: number) => ({
  schema: "helix.codex_conversation_cloud_frame.v1",
  taskId: "01a03464-1f5e-7f93-bd17-e4ca8a0bec9e",
  turns: Array.from({ length: count }, (_, index) => ({
    id: `turn:${index}`, user: `Question ${index}`, assistant: `Answer ${index}`,
    assistantPhase: "final_answer", status: "completed",
  })),
});

afterEach(() => {
  cleanup();
  inspectBinding.mockReset();
  delete window.casimirDesktop;
});

describe("Message Codex conversation scrolling", () => {
  it("opens at the latest turn, follows new turns, and respects manual scrollback", async () => {
    let bindingEpoch = 1;
    inspectBinding.mockImplementation(async () => ({
      reasoning_binding_id: `binding:${bindingEpoch}`, binding_epoch: bindingEpoch,
      helix_conversation_id: "chat:fixture", status: "active",
    }));
    let resolveFirst!: (value: unknown) => void;
    const readCodexMirror = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ status: "ready", frame: frame(2) })
      .mockResolvedValueOnce({ status: "ready", frame: frame(3) });
    window.casimirDesktop = { readCodexMirror } as unknown as NonNullable<Window["casimirDesktop"]>;

    render(<div className="helix-console-conversations__body--scroll">
      <CodexConversationConsoleHistory helixConversationId="chat:fixture" />
      <details><summary>MCP delivery receipts</summary></details>
    </div>);
    const history = screen.getByRole("log", { name: "Codex conversation history" });
    const scroller = history.parentElement as HTMLElement;
    let scrollTop = 0;
    let historyBottom = 500;
    Object.defineProperty(scroller, "scrollTop", { configurable: true,
      get: () => scrollTop, set: (value: number) => { scrollTop = value; } });
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({ bottom: 100 } as DOMRect);
    vi.spyOn(history, "getBoundingClientRect")
      .mockImplementation(() => ({ bottom: historyBottom - scrollTop } as DOMRect));

    await waitFor(() => expect(readCodexMirror).toHaveBeenCalledTimes(1));
    await act(async () => { resolveFirst({ status: "ready", frame: frame(1) }); });
    expect(scrollTop).toBe(400);
    expect(history).toHaveTextContent("Answer 0");

    scrollTop = 0;
    fireEvent.scroll(scroller);
    historyBottom = 700;
    bindingEpoch = 2;
    fireEvent(window, new CustomEvent("test-reasoning-binding-updated", { detail: {
      reasoning_binding_id: "binding:2", binding_epoch: 2,
      helix_conversation_id: "chat:fixture", status: "active",
    } }));
    await waitFor(() => expect(history).toHaveTextContent("Answer 1"));
    expect(scrollTop).toBe(0);

    scrollTop = 600;
    fireEvent.scroll(scroller);
    historyBottom = 900;
    bindingEpoch = 3;
    fireEvent(window, new CustomEvent("test-reasoning-binding-updated", { detail: {
      reasoning_binding_id: "binding:3", binding_epoch: 3,
      helix_conversation_id: "chat:fixture", status: "active",
    } }));
    await waitFor(() => expect(history).toHaveTextContent("Answer 2"));
    expect(scrollTop).toBe(800);
  });
});
