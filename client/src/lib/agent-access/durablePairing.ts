import { z } from "zod";
import { isPairingStorageErrorCode } from "../../../../shared/helix-pairing-storage-error";
import { helixReasoningTaskBindingProjectionSchema } from "../../../../shared/helix-reasoning-task-binding";

const ref = z.string().min(3).max(320);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const environment = z.object({ roomId: ref, runId: ref }).strict().nullable();
const flags = { execution_authority: z.literal(false), answer_authority: z.literal(false) };
export const pairingStatusSchema = z.object({
  schema: z.literal("helix.pairing_status.v1"), id: ref, revision: z.number().int().positive(),
  destinationDigest: digest,
  chatId: ref, environment, state: z.enum(["pending", "accepted", "expired", "revoked", "superseded"]),
  replacement: z.object({ pairingId: ref, revision: z.number().int().positive() }).strict().optional(),
  supersession: z.object({ pairingId: ref, at: z.string().datetime() }).strict().optional(),
  createdAt: z.string().datetime(), invitationExpiresAt: z.string().datetime(),
  pairingExpiresAt: z.string().datetime(), acceptedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(), executionAuthority: z.literal(false),
  answerAuthority: z.literal(false),
}).strict();
export const pairingInvitationRequestSchema = z.object({
  requestId: z.string().min(3).max(120), registrationId: ref, chatId: ref, environment,
  invitationSeconds: z.union([z.literal(300), z.literal(900), z.literal(3600)]),
  pairingSeconds: z.union([z.literal(3600), z.literal(28800), z.literal(86400)]),
  invitationDelivery: z.enum(["automatic", "private_mcp"]).optional(),
  replacement: z.object({ pairingId: ref, revision: z.number().int().positive() }).strict().optional(),
}).strict();
const destinationsSchema = z.object({ ok: z.literal(true), ...flags,
  automatic_delivery_available: z.boolean().optional(),
  destinations: z.array(z.object({ registrationId: ref, expiresAt: z.string().datetime(),
    destinationDigest: digest,
    proofBasis: z.literal("authenticated_client_declaration"), currentPresence: z.literal(false),
    pairingAuthority: z.literal(false), executionAuthority: z.literal(false),
    destination: z.object({ issuer: ref, profileId: ref, installationId: ref, clientId: ref, taskId: ref }).strict(),
  }).strict()),
}).strict();
const issuedSchema = z.object({ ok: z.literal(true), ...flags, pairing: pairingStatusSchema,
  privatePickup: z.literal(true).optional(),
  invitation: z.object({ id: ref, secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) }).strict().nullable(),
}).strict().refine(value => value.invitation === null
  ? value.pairing.state !== "pending" || value.privatePickup === true
  : value.pairing.state === "pending" && value.invitation.id === value.pairing.id);
const statusSchema = z.object({ ok: z.literal(true), ...flags, pairing: pairingStatusSchema,
  runtime_binding_active: z.literal(false).nullable(),
}).strict();

export type PairingInvitationRequest = z.infer<typeof pairingInvitationRequestSchema>;
export type PairingStatus = z.infer<typeof pairingStatusSchema>;
export type RegisteredPairingDestination = z.infer<typeof destinationsSchema>["destinations"][number];
export class PairingRequestError extends Error {
  constructor(readonly code: string, readonly outcomeUnknown: boolean) { super(code); }
}
const base = "/api/account/session/agent-connections";

// No automatic mutation retries. Callers retain the reviewed requestId for
// explicit reconciliation. Neither response bodies nor secrets enter errors.
async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown,
  timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const mutation = body !== undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(base + path, { method: mutation ? "POST" : "GET",
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
          ...(mutation ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
        });
        if (!response.ok) {
          let code = `pairing_http_${response.status}`;
          if (response.status === 503 || response.status === 409 || response.status === 403) {
            const failure = await response.json().catch(() => null);
            if (failure?.schema === "helix.reasoning_task_binding_error.v1" && failure.ok === false &&
                (isPairingStorageErrorCode(failure.error) ||
                  ["pairing_environment_unavailable", "pairing_request_cancelled", "pairing_account_link_required",
                    "pairing_device_identity_mismatch", "pairing_device_trust_required",
                    "pairing_registration_expired"].includes(failure.error))) code = failure.error;
          }
          throw new PairingRequestError(code, mutation);
        }
        const parsed = schema.safeParse(await response.json());
        if (!parsed.success) throw new PairingRequestError("pairing_response_invalid", mutation);
        return parsed.data;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new PairingRequestError("pairing_request_timeout", mutation));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof PairingRequestError) throw error;
    throw new PairingRequestError("pairing_request_failed", mutation);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

export const listPairingDestinations = () => request("/reasoning-destinations", destinationsSchema);
export const reconcilePairingInvitation = (requestId: string) =>
  request(`/reasoning-invitations/${encodeURIComponent(z.string().min(3).max(120).parse(requestId))}`,
    z.object({ ok: z.literal(true), ...flags, pairing: pairingStatusSchema.nullable() }).strict());
export const issuePairingInvitation = (input: PairingInvitationRequest) =>
  request("/reasoning-invitations", issuedSchema, pairingInvitationRequestSchema.parse(input));
export async function cancelPairingInvitation(requestId: string) {
  const id = z.string().min(3).max(120).parse(requestId);
  const result = await request(`/reasoning-invitations/${encodeURIComponent(id)}/cancel`,
    z.object({ ok: z.literal(true), ...flags, request_id: z.literal(id), cancelled: z.literal(true),
      pairing: pairingStatusSchema.nullable(), }).strict(), {}, 45_000);
  if (result.pairing && result.pairing.state !== "revoked") throw new PairingRequestError("pairing_cancellation_invalid", true);
  return result;
}
export const inspectPairing = (id: string) =>
  request(`/reasoning-pairings/${encodeURIComponent(ref.parse(id))}`, statusSchema);
export const revokePairing = (id: string) =>
  request(`/reasoning-pairings/${encodeURIComponent(ref.parse(id))}/revoke`, statusSchema, {});

// Validate before publishing to any browser binding store. A different current
// task in the same chat is not a recovered instance of this approved pairing.
export async function inspectPairedRuntimeBinding(pairing: PairingStatus, profileId: string) {
  const result = await request(`/reasoning-bindings/current?helix_conversation_id=${encodeURIComponent(pairing.chatId)}`,
    z.object({ ok: z.literal(true), binding: helixReasoningTaskBindingProjectionSchema }).strict());
  const binding = result.binding;
  if (pairing.state !== "accepted" || binding.status !== "active" || binding.pairing_id !== pairing.id ||
      binding.authenticated_profile_ref !== profileId || binding.helix_conversation_id !== pairing.chatId ||
      binding.run_id !== (pairing.environment?.runId ?? null) || binding.expires_at !== pairing.pairingExpiresAt) {
    throw new PairingRequestError("pairing_runtime_binding_mismatch", false);
  }
  return binding;
}


export async function deliverPairingInvitation(pairing: PairingStatus) {
  const result = await request(`/reasoning-deliveries/${encodeURIComponent(ref.parse(pairing.id))}`,
    z.object({ ok: z.literal(true), ...flags, delivery: z.object({
      schema: z.literal("helix.pairing_delivery.v1"), id: ref, pairingId: ref, destinationDigest: digest,
      revision: z.number().int().positive(), state: z.enum(["pending", "unknown", "delivered"]),
      createdAt: z.string().datetime(), updatedAt: z.string().datetime(), providerMessageId: ref.nullable(),
    }).strict() }).strict(), {});
  if (result.delivery.pairingId !== pairing.id || result.delivery.destinationDigest !== pairing.destinationDigest ||
      (result.delivery.state === "delivered") !== (result.delivery.providerMessageId !== null)) {
    throw new PairingRequestError("pairing_delivery_response_mismatch", true);
  }
  return result.delivery;
}
