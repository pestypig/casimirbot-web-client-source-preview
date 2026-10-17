import { describe, expect, it } from "vitest";

import {
  scoreConversationCompletion,
  scoreIntentShift,
  scoreVoiceTurnComplete,
} from "@/lib/helix/ask-voice-turn-scoring";

describe("ask-voice-turn-scoring", () => {
  it("scores conversation completion into ask-more, clarify, and answer routes", () => {
    expect(scoreConversationCompletion({
      transcript: "and then because",
      pauseMs: 300,
      stability: 0.45,
    }).route).toBe("ask_more");
    expect(scoreConversationCompletion({
      transcript: "This result needs one more detail",
      pauseMs: 700,
      stability: 0.7,
    }).route).toBe("mirror_clarify");
    expect(scoreConversationCompletion({
      transcript: "Negative energy density is bounded by quantum inequalities.",
      pauseMs: 1600,
      stability: 1,
    }).route).toBe("answer");
  });

  it("scores voice turn closure with semantic guard bands", () => {
    expect(scoreVoiceTurnComplete({
      transcript: "and then because",
      pauseMs: 300,
      stability: 0.45,
    }).band).toBe("low");
    expect(scoreVoiceTurnComplete({
      transcript: "it's not like a classical system that you can",
      pauseMs: 1600,
      stability: 1,
    }).band).not.toBe("high");
    expect(scoreVoiceTurnComplete({
      transcript: "Negative energy density is bounded by quantum inequalities.",
      pauseMs: 1600,
      stability: 1,
    }).band).toBe("high");
  });

  it("scores semantic continuation vs explicit topic shifts", () => {
    expect(scoreIntentShift({
      activePrompt: "How can we improve answer quality in this conversation lane?",
      nextTranscript: "Can we improve answer quality with better context continuity in this lane?",
    })).toMatchObject({ band: "continuation" });
    expect(scoreIntentShift({
      activePrompt: "How can we improve answer quality in this conversation lane?",
      nextTranscript: "Switch topics and explain how to grow tomatoes indoors.",
    })).toMatchObject({ band: "shift", reason: "explicit_topic_shift" });
  });
});
