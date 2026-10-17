import { describe, expect, it } from "vitest";
import {
  inferLanguageTagFromSourceText,
  isEnglishLikeLanguageTag,
  isHighRiskTranslationContext,
  normalizeVoiceLanguageTag,
  resolveVoiceResponseLanguage,
  resolveVoiceSourceLanguage,
} from "../ask-voice-language-policy";

describe("ask voice language policy", () => {
  it("normalizes known language tags and drops unknown sentinels", () => {
    expect(normalizeVoiceLanguageTag(" EN_us ")).toBe("en-us");
    expect(normalizeVoiceLanguageTag("auto")).toBeNull();
    expect(normalizeVoiceLanguageTag("unknown")).toBeNull();
    expect(normalizeVoiceLanguageTag(null)).toBeNull();
  });

  it("detects English-like language tags", () => {
    expect(isEnglishLikeLanguageTag("en")).toBe(true);
    expect(isEnglishLikeLanguageTag("en-GB")).toBe(true);
    expect(isEnglishLikeLanguageTag("es")).toBe(false);
    expect(isEnglishLikeLanguageTag("auto")).toBe(false);
  });

  it("infers non-English script families from source text", () => {
    expect(inferLanguageTagFromSourceText("これはテストです")).toBe("ja");
    expect(inferLanguageTagFromSourceText("한국어 테스트")).toBe("ko");
    expect(inferLanguageTagFromSourceText("中文测试")).toBe("zh-hans");
    expect(inferLanguageTagFromSourceText("مرحبا")).toBe("ar");
    expect(inferLanguageTagFromSourceText("Привет")).toBe("ru");
    expect(inferLanguageTagFromSourceText("plain English")).toBeNull();
  });

  it("resolves source language with non-English source first, translated text inference next, then lock", () => {
    expect(
      resolveVoiceSourceLanguage({
        sourceLanguage: "es",
        languageDetected: "en",
        sourceText: "hello",
        translated: false,
        sessionLockedLanguage: "fr",
      }),
    ).toBe("es");
    expect(
      resolveVoiceSourceLanguage({
        sourceLanguage: "en",
        languageDetected: "en",
        sourceText: "中文测试",
        translated: true,
        sessionLockedLanguage: "fr",
      }),
    ).toBe("zh-hans");
    expect(
      resolveVoiceSourceLanguage({
        sourceLanguage: null,
        languageDetected: "en",
        sourceText: "hello",
        translated: false,
        sessionLockedLanguage: "de",
      }),
    ).toBe("de");
  });

  it("resolves response language by preference, lock, source, then detected language", () => {
    expect(
      resolveVoiceResponseLanguage({
        preferredResponseLanguage: "fr",
        sourceLanguage: "es",
        languageDetected: "de",
        sessionLockedLanguage: "it",
      }),
    ).toBe("fr");
    expect(
      resolveVoiceResponseLanguage({
        preferredResponseLanguage: undefined,
        sourceLanguage: "es",
        languageDetected: "de",
        sessionLockedLanguage: "it",
      }),
    ).toBe("it");
    expect(
      resolveVoiceResponseLanguage({
        preferredResponseLanguage: undefined,
        sourceLanguage: null,
        languageDetected: "de",
        sessionLockedLanguage: null,
      }),
    ).toBe("de");
  });

  it("marks uncertain or translated non-English contexts as high risk", () => {
    expect(isHighRiskTranslationContext({ translationUncertain: false, translated: false, sourceLanguage: "es" })).toBe(
      false,
    );
    expect(isHighRiskTranslationContext({ translationUncertain: true, sourceLanguage: "es" })).toBe(true);
    expect(isHighRiskTranslationContext({ translationUncertain: false, translated: true, sourceText: "한국어 테스트" })).toBe(
      true,
    );
    expect(isHighRiskTranslationContext({ translationUncertain: true, sourceLanguage: "en" })).toBe(false);
  });
});
