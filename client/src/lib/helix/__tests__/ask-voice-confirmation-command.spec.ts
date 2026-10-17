import { describe, expect, it } from "vitest";

import { parseTranscriptConfirmationVoiceCommand } from "@/lib/helix/ask-voice-confirmation-command";

describe("ask-voice-confirmation-command", () => {
  it("parses short confirmation command phrases", () => {
    for (const phrase of ["confirm", "yes", "yeah", "yep", "correct", "thats right", "that's right", "proceed"]) {
      expect(parseTranscriptConfirmationVoiceCommand(phrase)).toBe("confirm");
    }
  });

  it("parses short retry and cancel command phrases", () => {
    for (const phrase of ["retry", "again", "redo", "try again", "no", "nope", "wrong", "not that"]) {
      expect(parseTranscriptConfirmationVoiceCommand(phrase)).toBe("retry");
    }
    for (const phrase of ["cancel", "dismiss", "stop"]) {
      expect(parseTranscriptConfirmationVoiceCommand(phrase)).toBe("cancel");
    }
  });

  it("rejects empty, long, and content-bearing transcript text", () => {
    expect(parseTranscriptConfirmationVoiceCommand("")).toBeNull();
    expect(parseTranscriptConfirmationVoiceCommand("we define what is truth from the helix standpoint")).toBeNull();
    expect(parseTranscriptConfirmationVoiceCommand("yes please send that now")).toBeNull();
  });
});
