import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashSetupContractRef, matchesSetupContractPairingIdentity,
  projectCurrentPairingFacts } from
  "../setupContractPairingFacts";

const nowMs = 1_800_000_000_000;
const taskRef = "task:exact";
const taskHash = createHash("sha256").update(taskRef).digest("hex");
const clientHash = createHash("sha256").update("client:exact").digest("hex");
const binding = {
  schema: "helix.reasoning_task_binding.v1", reasoning_binding_id: "reasoning_binding:exact",
  pairing_id: "pairing:exact", binding_epoch: 1, status: "active",
  service_instance_ref: "service:exact", authenticated_profile_ref: "profile:owner",
  authenticated_mcp_client_ref: "client:exact", client_session_ref: "session:exact",
  provider_thread_ref_hash: taskHash, helix_conversation_id: "chat:exact",
  mission_id: null, run_id: null, reasoning_role: "principal",
  continuation_transport: "polling", negotiated_observability_level: "continuation_ready",
  created_by: "signed_in_operator", created_at: "2026-01-01T00:00:00.000Z",
  expires_at: new Date(nowMs + 30_000).toISOString(), claimed_at: "2026-01-01T00:01:00.000Z",
  revoked_at: null, provider_thread_content_included: false,
  hidden_reasoning_included: false, execution_authority: false,
  evidence_authority: false, answer_authority: false, terminal_eligible: false,
};
const facts = (value: unknown, hash = taskHash) => projectCurrentPairingFacts(
  value, nowMs, "profile:owner", "chat:exact", hash, clientHash, clientHash);

describe("current durable pairing setup facts", () => {
  it("hashes the same continuation reference used by the binding store", async () => {
    expect(await hashSetupContractRef(taskRef)).toBe(taskHash);
  });

  it("reuses an accepted exact-task binding without asking for a new registration", () => {
    expect(facts(binding).map(fact => fact.stepId)).toEqual([
      "task_registration", "pairing_review", "pairing_acceptance", "runtime_binding",
    ]);
    expect(facts(binding).every(fact => fact.state === "satisfied" &&
      fact.validUntilMs === nowMs + 5_000)).toBe(true);
  });

  it("does not reuse a different task, chat, account, expired or undurable binding", () => {
    expect(facts(binding, "b".repeat(64))).toEqual([]);
    expect(projectCurrentPairingFacts(binding, nowMs, "profile:owner", "chat:exact",
      taskHash, clientHash, "b".repeat(64))).toEqual([]);
    expect(facts({ ...binding, helix_conversation_id: "chat:other" })).toEqual([]);
    expect(facts({ ...binding, authenticated_profile_ref: "profile:other" })).toEqual([]);
    expect(facts({ ...binding, expires_at: new Date(nowMs).toISOString() })).toEqual([]);
    expect(facts({ ...binding, pairing_id: undefined })).toEqual([]);
    expect(facts({ ...binding, status: "revoked" })).toEqual([]);
    expect(facts({ ...binding, provider_thread_ref_hash: "invalid" })).toEqual([]);
  });

  it("recognizes a terminal exact binding without treating it as a current grant", () => {
    const expired = { ...binding, status: "expired" };
    expect(matchesSetupContractPairingIdentity(expired, "profile:owner", "chat:exact",
      taskHash, clientHash, clientHash)).toBe(true);
    expect(facts(expired)).toEqual([]);
    expect(matchesSetupContractPairingIdentity({ ...expired,
      provider_thread_ref_hash: "b".repeat(64) }, "profile:owner", "chat:exact",
      taskHash, clientHash, clientHash)).toBe(false);
    expect(matchesSetupContractPairingIdentity(expired, "profile:owner", "chat:exact",
      taskHash, clientHash, "b".repeat(64))).toBe(false);
  });
});
