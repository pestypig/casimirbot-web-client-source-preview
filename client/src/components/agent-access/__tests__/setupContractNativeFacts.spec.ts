import { describe, expect, it } from "vitest";
import { projectLocalCodexStreamGrantFact, projectLocalDeveloperGrantFact } from "../setupContractNativeFacts";

const nowMs = 1_800_000_000_000;
const profileRef = "profile:owner", deviceRef = "desktop:owner";
const fact = (value: unknown) => projectLocalDeveloperGrantFact(
  value && typeof value === "object" ? { profileRef, deviceRef, ...value } : value,
  nowMs, profileRef, deviceRef);

describe("native developer setup fact", () => {
  it("requires an active grant, unexpired grant time and recent native lease acknowledgement", () => {
    const current = fact({ phase: "active",
      expiresAt: nowMs + 20_000, nativeLease: { lastAcknowledgedAt: nowMs - 1_000 } });
    expect(current).toMatchObject({ stepId: "developer_grant", state: "satisfied" });
    expect(current?.validUntilMs).toBe(nowMs + 5_000);
    expect(fact({ phase: "active", expiresAt: nowMs + 20_000,
      nativeLease: { lastAcknowledgedAt: nowMs - 30_001 } })?.state).toBe("blocked");
    expect(fact({ phase: "active", expiresAt: nowMs - 1,
      nativeLease: { lastAcknowledgedAt: nowMs } })?.state).toBe("blocked");
  });

  it("keeps a signed-in developer with no current USB grant action-required", () => {
    expect(fact({ phase: "inactive", expiresAt: null,
      nativeLease: { lastAcknowledgedAt: null } }))
      .toMatchObject({ state: "owner_action_required", reasonCode: "developer_grant_inactive" });
    expect(fact({ phase: "inactive", expiredAt: nowMs - 1 }))
      .toMatchObject({ reasonCode: "developer_grant_expired" });
  });

  it("does not claim a grant from unavailable or malformed native inspection", () => {
    expect(fact(null)).toBeNull();
    expect(fact({ phase: "unavailable" })).toBeNull();
    expect(fact({ phase: "active", expiresAt: "tomorrow" })).toBeNull();
    expect(fact({ phase: "active", profileRef: "profile:other", expiresAt: nowMs + 20_000,
      nativeLease: { lastAcknowledgedAt: nowMs } })).toBeNull();
  });
});

const firstSource = "codex-thread:11111111-1111-4111-8111-111111111111";
const secondSource = "codex-thread:22222222-2222-4222-8222-222222222222";
const streamFact = (value: unknown, refs: string[] = [firstSource, secondSource]) =>
  projectLocalCodexStreamGrantFact(value, nowMs, profileRef, deviceRef, refs);

describe("native Codex stream grant setup fact", () => {
  const granted = { status: "ready", profileRef, deviceRef,
    grants: [{ sourceRef: firstSource }, { sourceRef: secondSource }] };

  it("requires every exact selected source under the matching account and device", () => {
    expect(streamFact(granted)).toMatchObject({ stepId: "discord_chat_grants", state: "satisfied" });
    expect(streamFact({ ...granted, grants: [{ sourceRef: firstSource }] }))
      .toMatchObject({ state: "owner_action_required", reasonCode: "discord_source_grant_missing" });
    expect(streamFact({ ...granted, profileRef: "profile:other" })).toBeNull();
    expect(streamFact({ ...granted, deviceRef: "desktop:other" })).toBeNull();
  });

  it("leaves unavailable, malformed and ambiguous lists unknown", () => {
    expect(streamFact(null)).toBeNull();
    expect(streamFact({ ...granted, status: "unavailable" })).toBeNull();
    expect(streamFact({ ...granted, grants: [{ sourceRef: 1 }] })).toBeNull();
    expect(streamFact(granted, [firstSource, firstSource])).toBeNull();
  });
});
