import { describe, expect, it } from "vitest";
import {
  resolveSituationRoomAccountTargetLanguage,
  shouldAdoptSituationRoomAccountTargetLanguage,
} from "@/lib/helix/situation-room-account-language";

describe("situation room account-language translation defaults", () => {
  it("derives translation target language from the account interface language", () => {
    expect(resolveSituationRoomAccountTargetLanguage("haw")).toBe("haw");
    expect(resolveSituationRoomAccountTargetLanguage("es-MX")).toBe("es");
    expect(resolveSituationRoomAccountTargetLanguage("pt_BR")).toBe("pt");
    expect(resolveSituationRoomAccountTargetLanguage("zh-Hans-CN")).toBe("zh");
    expect(resolveSituationRoomAccountTargetLanguage("zz")).toBe("en");
  });

  it("updates the default target only while the operator has not chosen another language", () => {
    expect(
      shouldAdoptSituationRoomAccountTargetLanguage({
        currentTargetLanguage: "en",
        previousAccountTargetLanguage: "en",
        nextAccountTargetLanguage: "haw",
      }),
    ).toBe(true);
    expect(
      shouldAdoptSituationRoomAccountTargetLanguage({
        currentTargetLanguage: "es",
        previousAccountTargetLanguage: "en",
        nextAccountTargetLanguage: "haw",
      }),
    ).toBe(false);
    expect(
      shouldAdoptSituationRoomAccountTargetLanguage({
        currentTargetLanguage: "",
        previousAccountTargetLanguage: "en",
        nextAccountTargetLanguage: "haw",
      }),
    ).toBe(true);
  });
});
