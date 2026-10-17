import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/agi-chat";
import {
  AGENT_RUN_OBSERVER_CONTEXT_MAX_MESSAGES,
  buildSelectedChatContextSnapshot,
} from "../AgentRunObserverChatContext";

const message = (
  id: string,
  role: ChatMessage["role"],
  content: string,
): ChatMessage => ({
  id,
  role,
  content,
  at: `2026-07-26T14:${id.padStart(2, "0")}:00.000Z`,
  traceId: `trace:${id}`,
  tool: role === "tool" ? "minecraft-observation" : undefined,
  helixAsk: { private_debug_shape: `debug:${id}` },
});

describe("buildSelectedChatContextSnapshot", () => {
  it("omits all chat context unless the user opted in", () => {
    expect(
      buildSelectedChatContextSnapshot({
        session: { messages: [message("1", "user", "private prompt")] },
        includeContext: false,
      }),
    ).toBeUndefined();
  });

  it("omits an opted-in snapshot when the selected chat has no admissible text", () => {
    expect(
      buildSelectedChatContextSnapshot({
        session: {
          messages: [
            message("1", "tool", "private tool payload"),
            message("2", "system", "private system prompt"),
            message("3", "user", "   "),
          ],
        },
        includeContext: true,
      }),
    ).toBeUndefined();
  });

  it("keeps only bounded recent user and assistant text", () => {
    const messages = Array.from(
      { length: AGENT_RUN_OBSERVER_CONTEXT_MAX_MESSAGES + 4 },
      (_, index) =>
        message(
          String(index),
          index === 2
            ? "tool"
            : index === 3
              ? "system"
              : index % 2
                ? "assistant"
                : "user",
          `${index}:${"x".repeat(2_500)}`,
        ),
    );

    const snapshot = buildSelectedChatContextSnapshot({
      session: { messages },
      includeContext: true,
    });

    expect(snapshot?.messages.length).toBeGreaterThan(0);
    expect(snapshot?.messages.length).toBeLessThanOrEqual(
      AGENT_RUN_OBSERVER_CONTEXT_MAX_MESSAGES,
    );
    expect(
      snapshot?.messages.every(
        (entry) =>
          (entry.role === "user" || entry.role === "assistant") &&
          entry.content.length <= 2_000,
      ),
    ).toBe(true);
    expect(
      snapshot?.messages.reduce(
        (total, entry) => total + entry.content.length,
        0,
      ),
    ).toBeLessThanOrEqual(12_000);
    expect(JSON.stringify(snapshot)).not.toContain("private_debug_shape");
    expect(JSON.stringify(snapshot)).not.toContain("minecraft-observation");
  });

  it("honors tighter caller limits without allowing expansion past hard caps", () => {
    const snapshot = buildSelectedChatContextSnapshot({
      session: {
        messages: [
          message("1", "user", "a".repeat(30)),
          message("2", "assistant", "b".repeat(30)),
          message("3", "user", "c".repeat(30)),
        ],
      },
      includeContext: true,
      limits: {
        maxMessages: 99,
        maxCharsPerMessage: 10,
        maxTotalChars: 15,
      },
    });

    expect(snapshot?.messages).toEqual([
      expect.objectContaining({ content: "b".repeat(5) }),
      expect.objectContaining({ content: "c".repeat(10) }),
    ]);
  });
});
