import { describe, expect, it } from "vitest";
import { resolveHelixAccountLanguageTranslationProjectionHealth } from "@/lib/helix/account-language-translation-health";

describe("Helix account-language translation health", () => {
  it("classifies terminal rejection as blocked before displayable text", () => {
    expect(resolveHelixAccountLanguageTranslationProjectionHealth({
      projectionStatus: "projected",
      translatedText: "Traducir",
      terminalAuthorityStatus: "terminal_authority_rejected",
    })).toBe("blocked");
  });

  it("classifies projected translated text as ready", () => {
    expect(resolveHelixAccountLanguageTranslationProjectionHealth({
      projectionStatus: "projected",
      translatedText: "Traducir",
      terminalAuthorityStatus: "not_terminal_authority",
    })).toBe("ready");
  });

  it("classifies pending terminal authority or pending observation status as pending", () => {
    expect(resolveHelixAccountLanguageTranslationProjectionHealth({
      projectionStatus: "projected",
      terminalAuthorityStatus: "pending_helix_terminal_authority",
    })).toBe("pending");

    expect(resolveHelixAccountLanguageTranslationProjectionHealth({
      projectionStatus: "projected",
      sessionObservationStatus: "queued_backend_observation",
    })).toBe("pending");
  });

  it("classifies running lane sessions without translated text as active", () => {
    expect(resolveHelixAccountLanguageTranslationProjectionHealth({
      projectionStatus: "projected",
      laneSessionId: "lane-session-account-language",
      sessionDebugPhase: "running:translate_visible_region",
      sessionObservationStatus: "observation_recorded",
      terminalAuthorityStatus: "not_terminal_authority",
    })).toBe("active");
  });

  it("preserves stale, cancelled, failed, and empty projection states", () => {
    expect(resolveHelixAccountLanguageTranslationProjectionHealth({
      projectionStatus: "stale",
    })).toBe("stale");
    expect(resolveHelixAccountLanguageTranslationProjectionHealth({
      projectionStatus: "cancelled",
    })).toBe("cancelled");
    expect(resolveHelixAccountLanguageTranslationProjectionHealth({
      projectionStatus: "failed",
    })).toBe("failed");
    expect(resolveHelixAccountLanguageTranslationProjectionHealth({
      projectionStatus: "projected",
    })).toBe("empty");
  });
});
