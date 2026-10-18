import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MINECRAFT_STANDBY_VOICE_POLICY } from "@shared/helix-standby-voice-policy";

const baseInput = {
  proposalId: "standby_callout:test",
  text: "DatDamPig is in danger at 4 health.",
  priority: "warn" as const,
  evidenceRefs: ["minecraft:event:risk"],
  now: () => new Date("2026-05-08T10:00:00.000Z"),
};

describe("standby voice delivery", () => {
  const load = async () => {
    (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = undefined;
    return import("@/lib/helix/standbyVoiceDelivery");
  };

  it("does not speak when policy is text only", async () => {
    const { deliverStandbyVoiceCallout } = await load();
    const speak = vi.fn();
    const receipt = await deliverStandbyVoiceCallout({
      ...baseInput,
      policy: DEFAULT_MINECRAFT_STANDBY_VOICE_POLICY,
      speak: speak as never,
    });

    expect(receipt).toMatchObject({
      delivered: false,
      channel: "none",
      reason: "voice_not_enabled",
    });
    expect(speak).not.toHaveBeenCalled();
  });

  it("waits for explicit voice-on-confirm confirmation", async () => {
    const { deliverStandbyVoiceCallout } = await load();
    const speak = vi.fn();
    const receipt = await deliverStandbyVoiceCallout({
      ...baseInput,
      policy: {
        ...DEFAULT_MINECRAFT_STANDBY_VOICE_POLICY,
        voice_output_enabled: true,
        standby_voice_mode: "voice_on_confirm",
      },
      requiresConfirmation: true,
      speak: speak as never,
    });

    expect(receipt).toMatchObject({
      delivered: false,
      channel: "voice_on_confirm",
      reason: "awaiting_confirmation",
    });
    expect(speak).not.toHaveBeenCalled();
  });

  it("speaks a confirmed voice-on-confirm callout through the existing TTS endpoint", async () => {
    const { deliverStandbyVoiceCallout } = await load();
    const speak = vi.fn().mockResolvedValue({ kind: "json", status: 200, payload: { ok: true }, headers: {} });
    const receipt = await deliverStandbyVoiceCallout({
      ...baseInput,
      policy: {
        ...DEFAULT_MINECRAFT_STANDBY_VOICE_POLICY,
        voice_output_enabled: true,
        standby_voice_mode: "voice_on_confirm",
      },
      requiresConfirmation: false,
      speak: speak as never,
    });

    expect(receipt).toMatchObject({
      delivered: true,
      channel: "voice",
      reason: "delivered",
      audio_event_id: expect.stringMatching(/^standby_voice:/),
    });
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({
      text: baseInput.text,
      mode: "callout",
      priority: "warn",
    }));
  });

  it("does not speak warn callouts in critical voice mode", async () => {
    const { deliverStandbyVoiceCallout } = await load();
    const speak = vi.fn();
    const receipt = await deliverStandbyVoiceCallout({
      ...baseInput,
      policy: {
        ...DEFAULT_MINECRAFT_STANDBY_VOICE_POLICY,
        voice_output_enabled: true,
        standby_voice_mode: "critical_voice",
      },
      requiresConfirmation: false,
      speak: speak as never,
    });

    expect(receipt.delivered).toBe(false);
    expect(receipt.reason).toBe("suppressed_policy");
    expect(speak).not.toHaveBeenCalled();
  });

  it("keeps direct-address-only silent unless a Dot direct address authorizes speech", async () => {
    const { deliverStandbyVoiceCallout } = await load();
    const speak = vi.fn().mockResolvedValue({ kind: "json", status: 200, payload: { ok: true }, headers: {} });
    const policy = {
      ...DEFAULT_MINECRAFT_STANDBY_VOICE_POLICY,
      voice_output_enabled: true,
      standby_voice_mode: "direct_address_only" as const,
    };

    const ambientReceipt = await deliverStandbyVoiceCallout({
      ...baseInput,
      policy,
      requiresConfirmation: false,
      speak: speak as never,
    });
    expect(ambientReceipt.delivered).toBe(false);
    expect(ambientReceipt.reason).toBe("suppressed_policy");

    const directReceipt = await deliverStandbyVoiceCallout({
      ...baseInput,
      policy,
      requiresConfirmation: false,
      directAddressAuthorized: true,
      speak: speak as never,
    });
    expect(directReceipt.delivered).toBe(true);
    expect(directReceipt.reason).toBe("delivered");
    expect(speak).toHaveBeenCalledTimes(1);
  });
});
