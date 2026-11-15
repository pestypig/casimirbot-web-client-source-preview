import { describe, expect, it } from "vitest";
import { validWav } from
  "../../../../../../apps/desktop/src/discord-isolated-transcription-provider";
import { isolatedSpeechWav } from "./isolatedSpeechWav";

describe("isolated Discord speech WAV wrapper", () => {
  it("wraps bounded stereo PCM16 for the native provider", () => {
    const pcm = new Uint8Array(3 * 3_840).fill(7);
    const wav = isolatedSpeechWav(pcm);
    expect(wav).not.toBeNull();
    expect(validWav(Buffer.from(wav!))).toBe(true);
    expect(wav!.subarray(44)).toEqual(pcm);
  });
  it("rejects incomplete or oversized segments", () => {
    expect(isolatedSpeechWav(new Uint8Array(3_839))).toBeNull();
    expect(isolatedSpeechWav(new Uint8Array(2_304_001))).toBeNull();
  });
});
