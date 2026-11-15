import type { PairingInvitationRequest, RegisteredPairingDestination } from
  "@/lib/agent-access/durablePairing";
import type { HelixSetupContractIntent } from "@shared/helix-setup-contract-intent";

type ApprovedPairingContract = Readonly<{
  request_id: string;
  profile_ref: string;
  installation_ref: string;
  task_ref: string;
  mcp_client_ref_hash: string;
  review_revision: string;
  requested_lease_seconds: number;
  status: "pending_owner_review" | "approved" | "revoked" | "expired";
  approval: null | Readonly<{ reviewedRevision: string; approvedAtMs: number; expiresAtMs: number }>;
  scopes: HelixSetupContractIntent["scopes"];
  future_task_admissions?: readonly Readonly<{
    task_ref: string; helix_chat_ref?: string;
    admitted_at_ms: number; revoked_at_ms: number | null;
  }>[];
}>;

type PairingPreparation =
  | Readonly<{ ok: true; request: PairingInvitationRequest; destinationDigest: string }>
  | Readonly<{ ok: false; reason: "not_approved" | "not_selected" | "lease_too_short" |
    "task_not_admitted" | "identity_unavailable" | "registration_missing" |
    "registration_ambiguous" }>;

/** The contract review selects the exact task and chat. The existing pairing
 * endpoint still performs the owner-session, device, registration and account
 * checks when the invitation is issued. This helper grants nothing. */
export async function prepareApprovedContractPairing(
  contract: ApprovedPairingContract,
  registrations: readonly RegisteredPairingDestination[],
  nowMs: number,
  hashRef: (ref: string) => Promise<string | null>,
  targetTaskRef = contract.task_ref,
): Promise<PairingPreparation> {
  if (contract.status !== "approved" || !contract.approval ||
      contract.approval.reviewedRevision !== contract.review_revision ||
      contract.approval.approvedAtMs > nowMs ||
      contract.approval.expiresAtMs !== contract.approval.approvedAtMs +
        contract.requested_lease_seconds * 1_000 ||
      contract.approval.expiresAtMs <= nowMs) return { ok: false, reason: "not_approved" };
  const scope = contract.scopes.find(row => row.branch === "task_pairing");
  if (scope?.branch !== "task_pairing") return { ok: false, reason: "not_selected" };
  const sibling = targetTaskRef !== contract.task_ref;
  const admitted = sibling ? contract.future_task_admissions?.find(row =>
        row.task_ref === targetTaskRef && row.revoked_at_ms === null &&
        row.admitted_at_ms >= contract.approval!.approvedAtMs &&
        row.admitted_at_ms < contract.approval!.expiresAtMs) : null;
  const chatRef = admitted?.helix_chat_ref ?? scope.helix_chat_ref;
  if (sibling && (!scope.future_tasks || !admitted ||
      !(scope.future_tasks.helix_chat_refs ?? [scope.helix_chat_ref]).includes(chatRef)))
    return { ok: false, reason: "task_not_admitted" };
  // Pairing expiry is measured from issuance. Leave a small issuance margin
  // so the resulting binding cannot outlive the owner's contract approval.
  const pairingSeconds = Math.floor((contract.approval.expiresAtMs - nowMs) / 1_000) - 30;
  if (pairingSeconds < 900) return { ok: false, reason: "lease_too_short" };
  const installationHash = await hashRef(contract.installation_ref);
  const taskHash = sibling ? await hashRef(targetTaskRef) : null;
  if (!installationHash || !/^[a-f0-9]{64}$/u.test(contract.mcp_client_ref_hash))
    return { ok: false, reason: "identity_unavailable" };
  if (sibling && !taskHash?.match(/^[a-f0-9]{64}$/u))
    return { ok: false, reason: "identity_unavailable" };
  const candidates: RegisteredPairingDestination[] = [];
  for (const registration of registrations) {
    if (registration.destination.profileId !== contract.profile_ref ||
        registration.destination.taskId !== targetTaskRef ||
        registration.destination.installationId !== `installation:${installationHash}` ||
        Date.parse(registration.expiresAt) <= nowMs + 60_000) continue;
    const clientHash = await hashRef(registration.destination.clientId);
    if (clientHash === contract.mcp_client_ref_hash) candidates.push(registration);
  }
  if (!candidates.length) return { ok: false, reason: "registration_missing" };
  if (new Set(candidates.map(item => item.destinationDigest)).size !== 1)
    return { ok: false, reason: "registration_ambiguous" };
  candidates.sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt));
  return { ok: true, destinationDigest: candidates[0].destinationDigest,
    request: {
      requestId: `setup-contract-pairing:${contract.request_id}${sibling
        ? `:${taskHash!.slice(0, 32)}` : ""}`,
      setupContractRequestId: contract.request_id,
      registrationId: candidates[0].registrationId,
      chatId: chatRef,
      environment: null,
      invitationSeconds: 900,
      pairingSeconds,
      invitationDelivery: "private_mcp",
    } };
}
