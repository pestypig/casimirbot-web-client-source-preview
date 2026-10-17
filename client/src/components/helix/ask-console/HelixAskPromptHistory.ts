export type HelixAskPromptHistoryDirection = "previous" | "next";

export type HelixAskPromptHistoryNavigationInput = {
  direction: HelixAskPromptHistoryDirection;
  entries: readonly string[];
  cursor: number | null;
  currentDraft: string;
  draftBeforeNavigation: string;
};

export type HelixAskPromptHistoryNavigationResult =
  | {
      handled: false;
      cursor: number | null;
      value: string;
      draftBeforeNavigation: string;
    }
  | {
      handled: true;
      cursor: number | null;
      value: string;
      draftBeforeNavigation: string;
    };

export function buildHelixAskPromptHistoryEntries(args: {
  replyQuestions?: readonly (string | null | undefined)[] | null;
  submittedPrompts?: readonly (string | null | undefined)[] | null;
  maxEntries?: number;
}): string[] {
  const maxEntries = Math.max(1, args.maxEntries ?? 200);
  return [...(args.replyQuestions ?? []), ...(args.submittedPrompts ?? [])]
    .map((entry) => entry?.trim() ?? "")
    .filter(Boolean)
    .slice(-maxEntries);
}

export function resolveHelixAskPromptHistoryNavigation(
  input: HelixAskPromptHistoryNavigationInput,
): HelixAskPromptHistoryNavigationResult {
  const entries = buildHelixAskPromptHistoryEntries({
    submittedPrompts: input.entries,
    maxEntries: input.entries.length || 1,
  });
  if (entries.length === 0) {
    return {
      handled: false,
      cursor: input.cursor,
      value: input.currentDraft,
      draftBeforeNavigation: input.draftBeforeNavigation,
    };
  }

  if (input.direction === "previous") {
    const nextCursor = input.cursor === null ? entries.length - 1 : Math.max(0, input.cursor - 1);
    return {
      handled: true,
      cursor: nextCursor,
      value: entries[nextCursor] ?? input.currentDraft,
      draftBeforeNavigation: input.cursor === null ? input.currentDraft : input.draftBeforeNavigation,
    };
  }

  if (input.cursor === null) {
    return {
      handled: false,
      cursor: null,
      value: input.currentDraft,
      draftBeforeNavigation: input.draftBeforeNavigation,
    };
  }

  if (input.cursor >= entries.length - 1) {
    return {
      handled: true,
      cursor: null,
      value: input.draftBeforeNavigation,
      draftBeforeNavigation: "",
    };
  }

  const nextCursor = input.cursor + 1;
  return {
    handled: true,
    cursor: nextCursor,
    value: entries[nextCursor] ?? input.currentDraft,
    draftBeforeNavigation: input.draftBeforeNavigation,
  };
}

export function shouldHandleHelixAskPromptHistoryKey(args: {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  historyBrowsingActive?: boolean;
  value: string;
  selectionStart: number;
  selectionEnd: number;
}): HelixAskPromptHistoryDirection | null {
  if (args.altKey || args.ctrlKey || args.metaKey || args.shiftKey) return null;
  if (args.key !== "ArrowUp" && args.key !== "ArrowDown") return null;
  if (args.selectionStart !== args.selectionEnd) return null;
  if (args.historyBrowsingActive) {
    return args.key === "ArrowUp" ? "previous" : "next";
  }
  if (args.key === "ArrowUp") {
    const currentLineStart = args.value.lastIndexOf("\n", Math.max(0, args.selectionStart - 1)) + 1;
    return currentLineStart === 0 ? "previous" : null;
  }
  const nextLineBreak = args.value.indexOf("\n", args.selectionStart);
  return nextLineBreak === -1 ? "next" : null;
}
