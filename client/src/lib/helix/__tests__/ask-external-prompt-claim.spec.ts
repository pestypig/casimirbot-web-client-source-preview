import { describe, expect, it } from "vitest";
import { resolveExternalPromptClaimId } from "../ask-external-prompt-claim";

describe("ask external prompt claim helpers", () => {
  it("uses a trimmed pending prompt id when present", () => {
    expect(resolveExternalPromptClaimId({ promptId: " prompt-123 ", createdAt: 42 }, "Question")).toBe(
      "prompt-123",
    );
  });

  it("falls back to created-at plus normalized question text", () => {
    expect(resolveExternalPromptClaimId({ promptId: " ", createdAt: 42 }, "  HELLO There  ")).toBe(
      "42:hello there",
    );
  });

  it("uses zero created-at when no pending prompt exists", () => {
    expect(resolveExternalPromptClaimId(null, "Ask now")).toBe("0:ask now");
  });
});
