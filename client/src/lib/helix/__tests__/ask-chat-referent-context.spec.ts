import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildHelixAskChatReferentContext,
  buildHelixAskChatReferentContextForSubmit,
  buildHelixAskChatReferentContextFromSources,
  readHelixAskReplyFinalAnswerText,
  readPersistedHelixAskReferentReply,
  writePersistedHelixAskReferentReply,
} from "@/lib/helix/ask-chat-referent-context";

describe("Helix Ask chat referent context", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selects the latest previous terminal answer as an observation-only referent", () => {
    const context = buildHelixAskChatReferentContext([
      {
        id: "reply-old",
        content: "Older answer.",
      },
      {
        id: "reply-latest",
        turn_id: "turn-latest",
        content: "Rendered fallback text.",
        selected_final_answer: "Navigation team is ready for the next burn window.",
      },
    ]);

    expect(context).toMatchObject({
      schema: "helix.ask.chat_referent_context.v1",
      previous_assistant_final_answer: {
        role: "assistant",
        reply_id: "turn-latest",
        source_ref: "chat.final_answer.previous:turn-latest",
        text: "Navigation team is ready for the next burn window.",
        source_role: "previous_terminal_assistant_answer",
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
      previous_chat_message: {
        role: "assistant",
        message_id: "turn-latest",
        source_ref: "chat.final_answer.previous:turn-latest",
        text: "Navigation team is ready for the next burn window.",
        source_role: "previous_terminal_assistant_answer",
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
      recent_assistant_final_answers: [
        expect.objectContaining({
          reply_id: "turn-latest",
          text: "Navigation team is ready for the next burn window.",
          recency_rank: 0,
        }),
        expect.objectContaining({
          reply_id: "reply-old",
          text: "Older answer.",
          recency_rank: 1,
        }),
      ],
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
  });

  it("can read final answer text from selected answer, debug mirror, or rendered content", () => {
    expect(readHelixAskReplyFinalAnswerText({
      id: "reply-selected",
      content: "fallback",
      selected_final_answer: "Selected final answer.",
    })).toBe("Selected final answer.");

    expect(readHelixAskReplyFinalAnswerText({
      id: "reply-debug",
      content: "fallback",
      debug: { selected_final_answer: "Debug final answer." },
    })).toBe("Debug final answer.");

    expect(readHelixAskReplyFinalAnswerText({
      id: "reply-content",
      content: "Rendered final answer.",
    })).toBe("Rendered final answer.");
  });

  it("falls back to durable chat session replies when the visible transcript has no previous reply", () => {
    const result = buildHelixAskChatReferentContextFromSources([
      {
        source_name: "durable_chat_session",
        replies: [
          {
            id: "durable-reply",
            content: "Durable previous answer.",
          },
        ],
      },
      {
        source_name: "visible_ask_transcript",
        replies: [],
      },
    ]);

    expect(result.source_summary).toMatchObject({
      schema: "helix.ask.chat_referent_context_source_summary.v1",
      source_count: 2,
      total_reply_count: 1,
      readable_reply_count: 1,
      selected_source_name: "durable_chat_session",
      context_present: true,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    expect(result.context).toMatchObject({
      previous_chat_message: {
        message_id: "durable-reply",
        text: "Durable previous answer.",
      },
    });
  });

  it("persists and restores the latest terminal answer as an observation-only referent", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });

    writePersistedHelixAskReferentReply({
      id: "reply-persisted",
      turn_id: "turn-persisted",
      selected_final_answer: "Persisted prior paper answer.",
      content: "Fallback text.",
    });

    expect(readPersistedHelixAskReferentReply()).toMatchObject({
      id: "reply-persisted",
      turn_id: "turn-persisted",
      selected_final_answer: "Persisted prior paper answer.",
      content: "Persisted prior paper answer.",
    });
  });

  it("uses persisted terminal answer as submit fallback when live sources are empty", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });
    writePersistedHelixAskReferentReply({
      id: "reply-fallback",
      selected_final_answer: "Persisted fallback answer.",
      content: "Fallback text.",
    });

    const result = buildHelixAskChatReferentContextForSubmit({
      durableReplies: [],
      visibleReplies: [],
    });

    expect(result.source_summary).toMatchObject({
      selected_source_name: "persisted_last_terminal_answer",
      context_present: true,
    });
    expect(result.context).toMatchObject({
      previous_assistant_final_answer: {
        reply_id: "reply-fallback",
        text: "Persisted fallback answer.",
      },
    });
  });

  it("prefers the current visible answer over a stale persisted fallback", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });
    writePersistedHelixAskReferentReply({
      id: "reply-stale",
      selected_final_answer: "The blocking failure stopped the answer; the other failure reduced evidence.",
    });

    const result = buildHelixAskChatReferentContextForSubmit({
      durableReplies: [{ id: "reply-durable", content: "Durable session answer." }],
      visibleReplies: [{
        id: "reply-visible",
        turn_id: "turn-visible",
        selected_final_answer:
          "The continuity classifier misread the negated crop phrase, while the early-return branch bypassed terminal-product admission.",
      }],
    });

    expect(result.source_summary).toMatchObject({
      selected_source_name: "visible_ask_transcript",
      context_present: true,
    });
    expect(result.context).toMatchObject({
      previous_assistant_final_answer: {
        reply_id: "turn-visible",
        text:
          "The continuity classifier misread the negated crop phrase, while the early-return branch bypassed terminal-product admission.",
      },
    });
  });

  it("retains a bounded, deduplicated recent-answer window for topic-aware follow-ups", () => {
    const result = buildHelixAskChatReferentContextFromSources([
      {
        source_name: "durable_chat_session",
        replies: [
          { id: "quantum", content: "Quantum inequalities bound sampled negative energy." },
          { id: "duplicate", content: "Newest runtime-verification answer." },
        ],
      },
      {
        source_name: "visible_ask_transcript",
        replies: [
          { id: "runtime", content: "Newest runtime-verification answer." },
        ],
      },
    ]);

    expect(result.source_summary).toMatchObject({
      readable_reply_count: 3,
      retained_candidate_count: 2,
      selected_source_name: "visible_ask_transcript",
    });
    expect(result.context?.recent_assistant_final_answers).toEqual([
      expect.objectContaining({
        reply_id: "runtime",
        text: "Newest runtime-verification answer.",
        recency_rank: 0,
      }),
      expect.objectContaining({
        reply_id: "quantum",
        text: "Quantum inequalities bound sampled negative energy.",
        recency_rank: 1,
      }),
    ]);
  });

  it("retains an older topic-matching answer beyond the general recent-answer window", () => {
    const unrelated = Array.from({ length: 10 }, (_, index) => ({
      id: `runtime-${index}`,
      content: `Runtime verification answer ${index}.`,
    }));
    const result = buildHelixAskChatReferentContextFromSources([
      {
        source_name: "durable_chat_session",
        replies: [
          {
            id: "quantum-energy",
            content: "Quantum inequalities bound sampled negative energy and impose duration-magnitude limits.",
          },
          ...unrelated,
        ],
      },
    ], "Find scholarly references supporting the quantum-inequality claims we discussed.");

    expect(result.source_summary).toMatchObject({
      readable_reply_count: 11,
      retained_candidate_count: 9,
      topic_retained_candidate_count: 1,
      explicit_topic_term_count: 2,
    });
    expect(result.context?.recent_assistant_final_answers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reply_id: "quantum-energy",
        text: "Quantum inequalities bound sampled negative energy and impose duration-magnitude limits.",
        recency_rank: 10,
      }),
    ]));
  });
});
