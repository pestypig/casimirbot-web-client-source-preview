import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prepareApprovedContractPairing } from "../setupContractPairingRequest";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const hashRef = async (value: string) => sha(value);
const now = 1_800_000_000_000;
const requestId = "f2ea0f53-18d1-4f40-a62c-2ef6f98fe431";
const contract = () => ({
  request_id: requestId, profile_ref: "profile:owner", installation_ref: "device:owner",
  task_ref: "codex-task:exact", mcp_client_ref_hash: sha("client:exact"),
  review_revision: "a".repeat(64), requested_lease_seconds: 86_400,
  status: "approved" as const,
  approval: { reviewedRevision: "a".repeat(64), approvedAtMs: now,
    expiresAtMs: now + 86_400_000 },
  scopes: [{ branch: "task_pairing" as const, helix_chat_ref: "chat:exact" }],
});
const registration = (overrides: Record<string, unknown> = {}) => ({
  registrationId: "pairing_destination:exact", expiresAt: new Date(now + 3_600_000).toISOString(),
  destinationDigest: sha("destination:exact"), proofBasis: "authenticated_client_declaration" as const,
  currentPresence: false as const, pairingAuthority: false as const, executionAuthority: false as const,
  destination: { issuer: "issuer:exact", profileId: "profile:owner",
    installationId: `installation:${sha("device:owner")}`,
    clientId: "client:exact", taskId: "codex-task:exact" }, ...overrides,
});

describe("approved setup-contract pairing request", () => {
  it("binds the finite private invitation to the exact task, client, device and chat", async () => {
    const result = await prepareApprovedContractPairing(contract(), [registration()], now, hashRef);
    expect(result).toEqual({ ok: true, destinationDigest: sha("destination:exact"), request: {
      requestId: `setup-contract-pairing:${requestId}`,
      setupContractRequestId: requestId,
      registrationId: "pairing_destination:exact", chatId: "chat:exact",
      environment: null, invitationSeconds: 900, pairingSeconds: 86_370,
      invitationDelivery: "private_mcp",
    } });
  });

  it("uses a distinct finite request only for an unrevoked admitted sibling", async () => {
    const sibling = "codex-task:additional";
    const approved = { ...contract(), scopes: [{ branch: "task_pairing" as const,
      helix_chat_ref: "chat:exact", future_tasks: {
        mode: "same_installation_client_declared" as const,
        max_additional_tasks: 1 } }],
      future_task_admissions: [{ task_ref: sibling, admitted_at_ms: now + 100,
        revoked_at_ms: null as number | null }] };
    const candidate = registration({ registrationId: "pairing_destination:additional",
      destinationDigest: sha("destination:additional"),
      destination: { ...registration().destination, taskId: sibling } });
    const prepared = await prepareApprovedContractPairing(approved, [candidate],
      now + 200, hashRef, sibling);
    expect(prepared).toMatchObject({ ok: true,
      request: { requestId: `setup-contract-pairing:${requestId}:${sha(sibling).slice(0, 32)}`,
        registrationId: "pairing_destination:additional", chatId: "chat:exact" } });
    for (const changed of [
      { ...approved, future_task_admissions: [] },
      { ...approved, future_task_admissions: [{ ...approved.future_task_admissions[0],
        revoked_at_ms: now + 150 }] },
      { ...approved, future_task_admissions: [{ ...approved.future_task_admissions[0],
        task_ref: "codex-task:other" }] },
      { ...approved, scopes: contract().scopes },
    ]) expect(await prepareApprovedContractPairing(changed, [candidate],
      now + 200, hashRef, sibling)).toMatchObject({ ok: false,
      reason: "task_not_admitted" });
  });

  it("issues a sibling invitation only to its admitted chat in the reviewed set", async () => {
    const sibling = "codex-task:additional";
    const approved = { ...contract(), scopes: [{ branch: "task_pairing" as const,
      helix_chat_ref: "chat:exact", future_tasks: {
        mode: "same_installation_client_declared" as const,
        max_additional_tasks: 1, helix_chat_refs: ["chat:exact", "chat:second"] } }],
      future_task_admissions: [{ task_ref: sibling, helix_chat_ref: "chat:second",
        admitted_at_ms: now + 100, revoked_at_ms: null }] };
    const candidate = registration({ destination: {
      ...registration().destination, taskId: sibling } });
    const prepared = await prepareApprovedContractPairing(approved, [candidate],
      now + 200, hashRef, sibling);
    expect(prepared).toMatchObject({ ok: true,
      request: { chatId: "chat:second" } });
    const altered = { ...approved, future_task_admissions: [{
      ...approved.future_task_admissions[0], helix_chat_ref: "chat:outside" }] };
    expect(await prepareApprovedContractPairing(altered, [candidate],
      now + 200, hashRef, sibling)).toMatchObject({ ok: false,
      reason: "task_not_admitted" });
  });

  it("withholds issuance after deselection, revocation, expiry or insufficient remaining lease", async () => {
    const base = contract();
    for (const candidate of [
      { ...base, scopes: [] },
      { ...base, status: "revoked" as const },
      { ...base, approval: { ...base.approval, approvedAtMs: now - 86_400_000,
        expiresAtMs: now } },
      { ...base, approval: { ...base.approval, approvedAtMs: now - 85_471_000,
        expiresAtMs: now + 929_000 } },
      { ...base, approval: { ...base.approval, reviewedRevision: "b".repeat(64) } },
    ]) expect((await prepareApprovedContractPairing(candidate, [registration()], now, hashRef)).ok)
      .toBe(false);
  });

  it("issues a one-hour approval after setup delay without extending its expiry", async () => {
    const oneHour = { ...contract(), requested_lease_seconds: 3_600,
      approval: { reviewedRevision: "a".repeat(64), approvedAtMs: now,
        expiresAtMs: now + 3_600_000 } };
    const issuedAt = now + 120_000;
    const result = await prepareApprovedContractPairing(oneHour,
      [registration()], issuedAt, hashRef);
    expect(result).toMatchObject({ ok: true, request: { pairingSeconds: 3_450 } });
    if (result.ok) expect(issuedAt + result.request.pairingSeconds * 1_000)
      .toBeLessThan(oneHour.approval.expiresAtMs);
  });

  it("rejects registrations for another task, client, profile or installation", async () => {
    const original = registration();
    for (const destination of [
      { ...original.destination, taskId: "codex-task:other" },
      { ...original.destination, clientId: "client:other" },
      { ...original.destination, profileId: "profile:other" },
      { ...original.destination, installationId: `installation:${sha("device:other")}` },
    ]) expect(await prepareApprovedContractPairing(contract(),
      [{ ...original, destination }], now, hashRef))
      .toMatchObject({ ok: false, reason: "registration_missing" });
  });

  it("fails closed on ambiguous destinations and expired registrations", async () => {
    expect(await prepareApprovedContractPairing(contract(), [registration(), registration({
      registrationId: "pairing_destination:other", destinationDigest: sha("another") })],
    now, hashRef)).toMatchObject({ ok: false, reason: "registration_ambiguous" });
    expect(await prepareApprovedContractPairing(contract(), [registration({
      expiresAt: new Date(now + 30_000).toISOString() })], now, hashRef))
      .toMatchObject({ ok: false, reason: "registration_missing" });
  });
});
