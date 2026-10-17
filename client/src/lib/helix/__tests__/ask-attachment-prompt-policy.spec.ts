import { describe, expect, it } from "vitest";

import {
  isHelixAskPastedTextResumeRecallPrompt,
  isHelixAskUsePastedTextAttachmentPrompt,
  isHelixAskVisualPrompt,
} from "../ask-attachment-prompt-policy";

describe("ask attachment prompt policy", () => {
  it("detects visual prompts while excluding pasted-text attachment requests", () => {
    expect(isHelixAskVisualPrompt("Inspect this screenshot and describe the hotbar.")).toBe(true);
    expect(isHelixAskVisualPrompt("Can you read what is visible from this image?")).toBe(true);
    expect(isHelixAskVisualPrompt("Use the attached pasted text.")).toBe(false);
    expect(isHelixAskVisualPrompt("Summarize the text attachment.")).toBe(false);
    expect(isHelixAskVisualPrompt("live source from the scientific calculator")).toBe(false);
  });

  it("treats ambiguous live context as visual unless it is workstation scoped", () => {
    expect(isHelixAskVisualPrompt("What do you see in the live source?")).toBe(true);
    expect(isHelixAskVisualPrompt("calculator live source result")).toBe(false);
    expect(isHelixAskVisualPrompt("live answer from the equation panel")).toBe(false);
  });

  it("detects pasted-text resume recall prompts only when an output cue is present", () => {
    expect(isHelixAskPastedTextResumeRecallPrompt("What was the marker in the previous pasted text?")).toBe(true);
    expect(isHelixAskPastedTextResumeRecallPrompt("Extract the first line from the last memo.")).toBe(true);
    expect(isHelixAskPastedTextResumeRecallPrompt("I pasted a document earlier.")).toBe(false);
    expect(isHelixAskPastedTextResumeRecallPrompt("What was the current calculator result?")).toBe(false);
  });

  it("detects explicit use/read attached text prompts", () => {
    expect(isHelixAskUsePastedTextAttachmentPrompt("Use the attached pasted text.")).toBe(true);
    expect(isHelixAskUsePastedTextAttachmentPrompt("Summarize the uploaded document please.")).toBe(true);
    expect(isHelixAskUsePastedTextAttachmentPrompt("answer using the copied memo")).toBe(true);
    expect(isHelixAskUsePastedTextAttachmentPrompt("Use the screenshot.")).toBe(false);
  });
});
