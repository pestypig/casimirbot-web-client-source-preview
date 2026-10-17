import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelPairingInvitation, inspectPairing, inspectPairedRuntimeBinding, issuePairingInvitation, listPairingDestinations, revokePairing, pairingStatusSchema } from "../durablePairing";

const selection = { requestId: "request-original", registrationId: "registration-exact", chatId: "chat-exact",
  environment: null, invitationSeconds: 900 as const, pairingSeconds: 28800 as const };
const pairing = { schema: "helix.pairing_status.v1", id: "pairing:exact", revision: 1, chatId: selection.chatId,
  destinationDigest: "a".repeat(64),
  environment: null, state: "pending", createdAt: "2026-09-08T12:00:00.000Z",
  invitationExpiresAt: "2026-09-08T12:15:00.000Z", pairingExpiresAt: "2026-09-08T20:00:00.000Z",
  acceptedAt: null, revokedAt: null, executionAuthority: false, answerAuthority: false };
const issued = { ok: true, execution_authority: false, answer_authority: false,
  pairing, invitation: { id: pairing.id, secret: "s".repeat(43) } };
const respond = (body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("O4 durable pairing browser transport", () => {
  it("preserves fixed account/device denials and the unknown request outcome without exposing server text", async () => {
    for (const code of ["pairing_account_link_required", "pairing_device_identity_mismatch", "pairing_device_trust_required", "private-arbitrary-message"]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
        schema: "helix.reasoning_task_binding_error.v1", ok: false, error: code, message: "fixture-secret",
      }), { status: 403 })));
      await expect(issuePairingInvitation(selection)).rejects.toMatchObject({
        code: code === "private-arbitrary-message" ? "pairing_http_403" : code, outcomeUnknown: true,
      });
    }
  });
  it("requires a confirmed cancellation of the exact request before releasing review", async () => {
    const result = { ok: true, execution_authority: false, answer_authority: false,
      request_id: selection.requestId, cancelled: true, pairing: null };
    const fetch = respond(result); vi.stubGlobal("fetch", fetch);
    expect(await cancelPairingInvitation(selection.requestId)).toEqual(result);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain(`/reasoning-invitations/${selection.requestId}/cancel`);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: "{}", credentials: "same-origin" });
    for (const mismatch of [{ request_id: "request-other" }, { cancelled: false }, { pairing }, { execution_authority: true }]) {
      vi.stubGlobal("fetch", respond({ ...result, ...mismatch }));
      await expect(cancelPairingInvitation(selection.requestId)).rejects.toMatchObject({ outcomeUnknown: true });
    }
  });
  it("allows a slow durability cancellation to finish without issuing a second request", async () => {
    vi.useFakeTimers();
    const result = { ok: true, execution_authority: false, answer_authority: false,
      request_id: selection.requestId, cancelled: true, pairing: null };
    let resolveFetch!: (value: Response) => void;
    const fetch = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { resolveFetch = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const cancellation = cancelPairingInvitation(selection.requestId);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
    resolveFetch(new Response(JSON.stringify(result)));
    expect(await cancellation).toEqual(result);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("O5 admits only fixed storage diagnostics and preserves unknown mutation outcomes", async () => {
    for (const code of ["pairing_storage_unreadable", "pairing_storage_invalid", "private-arbitrary-message"]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
        schema: "helix.reasoning_task_binding_error.v1", ok: false, error: code, message: "fixture-secret",
      }), { status: 503 })));
      await expect(issuePairingInvitation(selection)).rejects.toMatchObject({
        code: code.startsWith("pairing_storage_") ? code : "pairing_http_503", outcomeUnknown: true,
      });
    }
  });
  it("links only the exact accepted pairing to a fresh runtime projection", async () => {
    const accepted = pairingStatusSchema.parse({ ...pairing, state: "accepted" });
    const binding = { schema: "helix.reasoning_task_binding.v1", reasoning_binding_id: "binding:current",
      pairing_id: pairing.id, binding_epoch: 2, status: "active", service_instance_ref: "service:current",
      authenticated_profile_ref: "profile:owner", authenticated_mcp_client_ref: "client:exact",
      client_session_ref: "session:current", provider_thread_ref_hash: "a".repeat(64), helix_conversation_id: pairing.chatId,
      mission_id: null, run_id: null, reasoning_role: "principal", continuation_transport: "unavailable",
      negotiated_observability_level: "tool_activity_only", created_by: "signed_in_operator",
      created_at: pairing.createdAt, expires_at: pairing.pairingExpiresAt, claimed_at: pairing.createdAt, revoked_at: null,
      provider_thread_content_included: false, hidden_reasoning_included: false, execution_authority: false,
      evidence_authority: false, answer_authority: false, terminal_eligible: false };
    vi.stubGlobal("fetch", respond({ ok: true, binding }));
    expect(await inspectPairedRuntimeBinding(accepted, "profile:owner")).toEqual(binding);
    for (const mismatch of [{ pairing_id: "pairing:other" }, { authenticated_profile_ref: "profile:other" },
      { helix_conversation_id: "chat:other" }, { run_id: "run:other" }, { status: "revoked" },
      { expires_at: "2026-09-09T20:00:00.000Z" }]) {
      vi.stubGlobal("fetch", respond({ ok: true, binding: { ...binding, ...mismatch } }));
      await expect(inspectPairedRuntimeBinding(accepted, "profile:owner")).rejects.toMatchObject({ code: "pairing_runtime_binding_mismatch" });
    }
  });
  it("sends only the reviewed scope and caller-owned reconciliation ID", async () => {
    const fetch = respond(issued); vi.stubGlobal("fetch", fetch);
    expect(await issuePairingInvitation(selection)).toEqual(issued);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store", method: "POST" });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(selection);
    expect(() => issuePairingInvitation({ ...selection, humanApproved: true } as typeof selection)).toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["fetch", "body"])("bounds a hung %s without retrying a consent write", async stage => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(() => stage === "fetch" ? new Promise(() => {})
      : Promise.resolve({ ok: true, json: () => new Promise(() => {}) }));
    vi.stubGlobal("fetch", fetch);
    const assertion = expect(issuePairingInvitation(selection)).rejects.toMatchObject({
      code: "pairing_request_timeout", outcomeUnknown: true });
    await vi.advanceTimersByTimeAsync(10_000); await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("rejects a mismatched invitation without exposing its secret", async () => {
    vi.stubGlobal("fetch", respond({ ...issued, invitation: { ...issued.invitation, id: "pairing:other" } }));
    await expect(issuePairingInvitation(selection)).rejects.toMatchObject({ message: "pairing_response_invalid", outcomeUnknown: true });
  });
  it("preserves unknown availability and rejects authority-bearing status", async () => {
    const body = { ok: true, execution_authority: false, answer_authority: false,
      pairing: { ...pairing, state: "accepted" }, runtime_binding_active: null };
    vi.stubGlobal("fetch", respond(body));
    expect((await inspectPairing(pairing.id)).runtime_binding_active).toBeNull();
    vi.stubGlobal("fetch", respond({ ...body, execution_authority: true }));
    await expect(inspectPairing(pairing.id)).rejects.toMatchObject({ outcomeUnknown: false });
  });
  it("does not promote a registration into presence or pairing authority", async () => {
    vi.stubGlobal("fetch", respond({ ok: true, destinations: [], execution_authority: false, answer_authority: false }));
    expect((await listPairingDestinations()).destinations).toEqual([]);
  });
  it("encodes exact IDs and sends an empty revocation body once", async () => {
    const fetch = respond({ ok: true, execution_authority: false, answer_authority: false,
      pairing: { ...pairing, state: "revoked" }, runtime_binding_active: false });
    vi.stubGlobal("fetch", fetch);
    await revokePairing("pairing:exact/part");
    expect(fetch.mock.calls[0][0]).toContain("pairing%3Aexact%2Fpart/revoke");
    expect(fetch.mock.calls[0][1].body).toBe("{}");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
