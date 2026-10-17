import { describe, expect, it } from "vitest";

import { LUMA_MOOD_PALETTE } from "@/lib/helix/ask-luma-mood-display";
import { LUMA_MOOD_ORDER } from "@/lib/luma-moods";

describe("ask luma mood display", () => {
  it("provides a complete palette for every Luma mood", () => {
    expect(Object.keys(LUMA_MOOD_PALETTE).sort()).toEqual([...LUMA_MOOD_ORDER].sort());
  });

  it("keeps question and love palettes available for the Ask shell", () => {
    expect(LUMA_MOOD_PALETTE.question.ring).toBe("ring-sky-300/55");
    expect(LUMA_MOOD_PALETTE.question.replyBorder).toBe("border-sky-300/28");
    expect(LUMA_MOOD_PALETTE.love.aura).toContain("border-pink-200/45");
    expect(LUMA_MOOD_PALETTE.love.replyTint).toContain("rgba(249,168,212,0.12)");
  });
});
