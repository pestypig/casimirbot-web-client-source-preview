import { describe, expect, it } from "vitest";

import {
  buildHelixAskPromptHistoryEntries,
  resolveHelixAskPromptHistoryNavigation,
  shouldHandleHelixAskPromptHistoryKey,
} from "@/components/helix/ask-console/HelixAskPromptHistory";

describe("Helix Ask prompt history navigation", () => {
  it("builds ordered history from visible replies and submitted prompts", () => {
    expect(
      buildHelixAskPromptHistoryEntries({
        replyQuestions: [" first ", null, ""],
        submittedPrompts: ["second", " second ", "third"],
        maxEntries: 4,
      }),
    ).toEqual(["first", "second", "second", "third"]);
  });

  it("walks backward through prompts and restores the draft when walking forward past newest", () => {
    const first = resolveHelixAskPromptHistoryNavigation({
      direction: "previous",
      entries: ["alpha", "beta"],
      cursor: null,
      currentDraft: "draft in progress",
      draftBeforeNavigation: "",
    });
    expect(first).toMatchObject({
      handled: true,
      cursor: 1,
      value: "beta",
      draftBeforeNavigation: "draft in progress",
    });

    const second = resolveHelixAskPromptHistoryNavigation({
      direction: "previous",
      entries: ["alpha", "beta"],
      cursor: first.cursor,
      currentDraft: first.value,
      draftBeforeNavigation: first.draftBeforeNavigation,
    });
    expect(second).toMatchObject({ handled: true, cursor: 0, value: "alpha" });

    const third = resolveHelixAskPromptHistoryNavigation({
      direction: "next",
      entries: ["alpha", "beta"],
      cursor: second.cursor,
      currentDraft: second.value,
      draftBeforeNavigation: second.draftBeforeNavigation,
    });
    expect(third).toMatchObject({ handled: true, cursor: 1, value: "beta" });

    expect(
      resolveHelixAskPromptHistoryNavigation({
        direction: "next",
        entries: ["alpha", "beta"],
        cursor: third.cursor,
        currentDraft: third.value,
        draftBeforeNavigation: third.draftBeforeNavigation,
      }),
    ).toMatchObject({
      handled: true,
      cursor: null,
      value: "draft in progress",
      draftBeforeNavigation: "",
    });
  });

  it("only handles plain arrows at textarea boundaries", () => {
    expect(
      shouldHandleHelixAskPromptHistoryKey({
        key: "ArrowUp",
        value: "hello",
        selectionStart: 0,
        selectionEnd: 0,
      }),
    ).toBe("previous");
    expect(
      shouldHandleHelixAskPromptHistoryKey({
        key: "ArrowDown",
        value: "hello",
        selectionStart: 5,
        selectionEnd: 5,
      }),
    ).toBe("next");
    expect(
      shouldHandleHelixAskPromptHistoryKey({
        key: "ArrowUp",
        value: "hello\nworld",
        selectionStart: 8,
        selectionEnd: 8,
      }),
    ).toBeNull();
    expect(
      shouldHandleHelixAskPromptHistoryKey({
        key: "ArrowDown",
        value: "hello\nworld",
        selectionStart: 2,
        selectionEnd: 2,
      }),
    ).toBeNull();
    expect(
      shouldHandleHelixAskPromptHistoryKey({
        key: "ArrowUp",
        ctrlKey: true,
        value: "hello",
        selectionStart: 0,
        selectionEnd: 0,
      }),
    ).toBeNull();
  });

  it("keeps arrows in history navigation mode after the first recalled prompt", () => {
    expect(
      shouldHandleHelixAskPromptHistoryKey({
        key: "ArrowUp",
        historyBrowsingActive: true,
        value: "hello\nworld",
        selectionStart: 11,
        selectionEnd: 11,
      }),
    ).toBe("previous");
    expect(
      shouldHandleHelixAskPromptHistoryKey({
        key: "ArrowDown",
        historyBrowsingActive: true,
        value: "hello\nworld",
        selectionStart: 0,
        selectionEnd: 0,
      }),
    ).toBe("next");
    expect(
      shouldHandleHelixAskPromptHistoryKey({
        key: "ArrowLeft",
        historyBrowsingActive: true,
        value: "hello",
        selectionStart: 5,
        selectionEnd: 5,
      }),
    ).toBeNull();
  });
});
