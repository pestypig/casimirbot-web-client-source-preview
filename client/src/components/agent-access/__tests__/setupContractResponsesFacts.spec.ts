import { describe, expect, it } from "vitest";
import { projectNativeResponsesAllowanceFacts } from "../setupContractResponsesFacts";

const nowMs = 1_800_000_000_000;
const active = { status: "active", profileRef: "profile:owner",
  allowanceKind: "development_session", kind: "development_session",
  active: true, model: "gpt-4o-mini", remainingCalls: 4_995, maxCalls: 5_000,
  expiresAt: new Date(nowMs + 60_000).toISOString() };
const facts = (value: unknown) => projectNativeResponsesAllowanceFacts(
  value, nowMs, "profile:owner");

describe("native Responses allowance setup facts", () => {
  it("shows the finite native allowance separately from the unsupported cost budget", () => {
    expect(facts(active)).toEqual([
      expect.objectContaining({ stepId: "responses_native_allowance", state: "satisfied",
        grantExpiresAtMs: nowMs + 60_000, validUntilMs: nowMs + 5_000 }),
      expect.objectContaining({ stepId: "responses_budget", state: "blocked",
        reasonCode: "responses_cost_budget_not_enforced_by_native_allowance" }),
    ]);
  });

  it("distinguishes a missing session and one-call shadow approval", () => {
    expect(facts({ ...active, status: "inactive", active: false,
      allowanceKind: null, kind: null, model: null, remainingCalls: 0,
      maxCalls: 0, expiresAt: null })[0]).toMatchObject({
        stepId: "responses_native_allowance", state: "owner_action_required" });
    expect(facts({ ...active, allowanceKind: "single_choice", kind: "single_choice",
      maxCalls: 1, remainingCalls: 1 })[0]).toMatchObject({
        stepId: "responses_native_allowance", state: "owner_action_required" });
  });

  it("shows the saved own-key readiness before a contract budget is issued", () => {
    const inactive = { ...active, status: "inactive", active: false,
      allowanceKind: null, kind: null, model: null, remainingCalls: 0,
      maxCalls: 0, expiresAt: null };
    expect(facts({ ...inactive, providerConfigured: true })[2]).toMatchObject({
      stepId: "responses_provider", state: "satisfied" });
    expect(facts({ ...inactive, providerConfigured: false })[2]).toMatchObject({
      stepId: "responses_provider", state: "owner_action_required",
      reasonCode: "responses_own_key_missing" });
  });

  it("does not count an unbound native cost budget as this contract's grant", () => {
    const projected = facts({ ...active, costBudget: {
      maximumMicros: 100_000, settledMicros: 0, heldMicros: 0,
      remainingMicros: 100_000, blocked: false, rateRevision: "verified-test-rate",
    } });
    expect(projected[0]).toMatchObject({ stepId: "responses_native_allowance",
      state: "satisfied" });
    expect(projected[1]).toMatchObject({ stepId: "responses_budget", state: "blocked",
      reasonCode: "responses_cost_budget_not_bound_to_contract" });
    expect(facts({ ...active, status: "inactive", active: false,
      costBudget: { maximumMicros: 100_000, settledMicros: 10,
        heldMicros: 100, remainingMicros: 99_890,
        blocked: true, rateRevision: "verified-test-rate" },
    })[1]).toMatchObject({ stepId: "responses_budget", state: "blocked",
      reasonCode: "responses_cost_budget_unknown_charge" });
  });

  it("counts only the exact reviewed request and ceiling", () => {
    const budgeted = { ...active,
      contractRequestId: "8f3a11c8-5851-4faf-9d11-a1509c9f40f2",
      providerConfigured: true,
      costBudget: { maximumMicros: 50_000, settledMicros: 100,
        heldMicros: 0, remainingMicros: 49_900, blocked: false,
        rateRevision: "openai:gpt-4o-mini:default:text:2026-10-21" } };
    const reviewed = { requestId: budgeted.contractRequestId,
      maximumMicros: 50_000 };
    const current = projectNativeResponsesAllowanceFacts(budgeted, nowMs,
      "profile:owner", reviewed);
    expect(current.map(row => [row.stepId, row.state])).toEqual([
      ["responses_native_allowance", "satisfied"],
      ["responses_budget", "satisfied"], ["responses_provider", "satisfied"],
      ["responses_session", "satisfied"],
    ]);
    expect(projectNativeResponsesAllowanceFacts({ ...budgeted,
      providerConfigured: false }, nowMs, "profile:owner", reviewed)[2])
      .toMatchObject({ stepId: "responses_provider", state: "owner_action_required",
        reasonCode: "responses_own_key_missing" });
    expect(projectNativeResponsesAllowanceFacts({ ...budgeted,
      providerConfigured: false }, nowMs, "profile:owner", reviewed)
      .some(row => row.stepId === "responses_session")).toBe(false);
    expect(projectNativeResponsesAllowanceFacts(budgeted, nowMs,
      "profile:owner", { ...reviewed, maximumMicros: 60_000 })[1].state)
      .toBe("blocked");
    expect(projectNativeResponsesAllowanceFacts(budgeted, nowMs,
      "profile:owner", { ...reviewed, requestId: "other" })[1].state)
      .toBe("blocked");
    expect(projectNativeResponsesAllowanceFacts({ ...budgeted,
      status: "inactive", active: false,
      costBudget: { ...budgeted.costBudget, settledMicros: 50_000,
        remainingMicros: 0 } }, nowMs, "profile:owner", reviewed)[1])
      .toMatchObject({ state: "blocked",
        reasonCode: "responses_cost_budget_exhausted" });
  });

  it("rejects another profile, expiry, malformed state and older EXE shapes", () => {
    expect(facts({ ...active, profileRef: "profile:other" })).toEqual([]);
    expect(facts({ ...active, expiresAt: new Date(nowMs).toISOString() })).toEqual([]);
    expect(facts({ ...active, remainingCalls: 5_001 })).toEqual([]);
    expect(facts({ ...active, allowanceKind: "single_choice" })).toEqual([]);
    const { profileRef: _profileRef, ...older } = active;
    expect(facts(older)).toEqual([]);
  });
});
