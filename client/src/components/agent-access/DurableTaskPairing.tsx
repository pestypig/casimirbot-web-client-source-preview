import React, { useEffect, useRef, useState } from "react";
import { PAIRING_STORAGE_ERRORS, isPairingStorageErrorCode } from "../../../../shared/helix-pairing-storage-error";
import { PairingRequestError, cancelPairingInvitation, deliverPairingInvitation, inspectPairing, inspectPairedRuntimeBinding, issuePairingInvitation, listPairingDestinations, revokePairing, reconcilePairingInvitation,
  pairingInvitationRequestSchema, pairingStatusSchema, type PairingInvitationRequest, type PairingStatus,
  type RegisteredPairingDestination } from "../../lib/agent-access/durablePairing";
import ReasoningClaimHandle from "./ReasoningClaimHandle";
import { usePairingRecoveryStorage } from "../../lib/agent-access/pairingRecoveryStorage";
import type { BrowserReasoningBinding } from "../../lib/agent-access/reasoningTaskBinding";
import { requestWorkstationGuidance } from "../../lib/workstation/workstationGuidance";
import { exactTaskRecoveryRequest, exactTaskResumeRequest } from "../../lib/agent-access/taskRegistrationRequest";
import { HELIX_AGENT_SETUP_PROCEDURE } from "../../../../shared/helix-agent-setup-procedure";

type Props = { profileId: string; chatId: string; environment?: { roomId: string; runId: string } | null;
  onRuntimeBinding?: (binding: BrowserReasoningBinding | null, pairingId: string) => void;
  onDeviceTrustMismatch?: () => void };
type PreviousPairing = { review: PairingInvitationRequest; pairing: PairingStatus };
// Remount on owner/chat changes so an old asynchronous response cannot enter a
// different account's UI. Storage contains reviewed metadata, never the secret.
export default function DurableTaskPairing(props: Props) {
  return <PairingControls key={JSON.stringify([props.profileId, props.chatId])} {...props} />;
}
function PairingControls({ profileId, chatId, environment, onRuntimeBinding, onDeviceTrustMismatch }: Props) {
  const storageKey = `helix.pairing.review.v1:${JSON.stringify([profileId, chatId])}`;
  // Owner/chat-scoped display only; invitation issuance revalidates the run.
  const [lastOfferedEnvironment, setLastOfferedEnvironment] = useState(environment ?? null);
  useEffect(() => {
    if (environment) setLastOfferedEnvironment(environment);
  }, [environment?.roomId, environment?.runId]);
  const [review, setReview] = useState<PairingInvitationRequest>(() => {
    try {
      const parsed = pairingInvitationRequestSchema.safeParse(JSON.parse(localStorage.getItem(storageKey)
        ?? localStorage.getItem(`${storageKey}:draft`) ?? "null"));
      if (parsed.success && parsed.data.chatId === chatId) return parsed.data;
    } catch { /* Storage is optional until the operator approves. */ }
    return { requestId: crypto.randomUUID(), registrationId: "", chatId, environment: null,
      invitationSeconds: 900, pairingSeconds: 28800, invitationDelivery: "private_mcp" };
  });
  const [destinations, setDestinations] = useState<RegisteredPairingDestination[]>([]);
  const [destinationRead, setDestinationRead] = useState<"checking" | "verified" | "unavailable">("checking");
  const [approved, setApproved] = useState(false);
  const [automaticAvailable, setAutomaticAvailable] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [pickupCopyStatus, setPickupCopyStatus] = useState("");
  const [registrationCopyStatus, setRegistrationCopyStatus] = useState("");
  const [submitted, setSubmitted] = useState(() => {
    try {
      const saved = pairingInvitationRequestSchema.safeParse(JSON.parse(localStorage.getItem(storageKey) ?? "null"));
      return saved.success && saved.data.chatId === chatId;
    } catch { return false; }
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pairing, setPairing] = useState<PairingStatus | null>(null);
  const [previous, setPrevious] = useState<PreviousPairing | null>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(`${storageKey}:previous`) ?? "null");
      const savedReview = pairingInvitationRequestSchema.parse(raw?.review);
      const savedPairing = pairingStatusSchema.parse(raw?.pairing);
      if (savedReview.chatId === chatId && savedPairing.chatId === chatId &&
          savedPairing.id === review.replacement?.pairingId) return { review: savedReview, pairing: savedPairing };
    } catch { /* Stored metadata cannot establish current grant status. */ }
    return null;
  });
  const [previousChecked, setPreviousChecked] = useState(false);
  const [invitation, setInvitation] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now);
  const [runtimeMessage, setRuntimeMessage] = useState("");
  const [runtimeBindingVerified, setRuntimeBindingVerified] = useState(false);
  const [initialReadComplete, setInitialReadComplete] = useState(false);
  const alive = useRef(true);
  const destinationDigest = useRef<string | null>(null);
  if (destinationDigest.current === null) {
    try { destinationDigest.current = localStorage.getItem(`${storageKey}:destination`); } catch { /* Fail closed below. */ }
  }
  const inFlight = useRef(false);
  const backgroundRead = useRef<Promise<void> | null>(null);
  const pendingCancellation = useRef<string | null>(null);
  const currentRequest = useRef({ requestId: review.requestId, submitted });
  currentRequest.current = { requestId: review.requestId, submitted };
  useEffect(() => {
    if (!review.registrationId || submitted) return;
    try { localStorage.setItem(`${storageKey}:draft`, JSON.stringify(review)); }
    catch { setMessage("Browser storage is unavailable. This selection cannot survive a reload."); }
  }, [review, submitted, storageKey]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const run = async (operation: () => Promise<void>, background = false) => {
    if (inFlight.current || (background && backgroundRead.current)) return;
    if (!background) { inFlight.current = true; setBusy(true); }
    const perform = async () => {
    try {
      // Polling must not close selectors or drop an explicit click. Reserve
      // one foreground operation while the bounded read finishes; do not retry
      // mutations or carry a queued operation into another owner/chat mount.
      if (!background && backgroundRead.current) await backgroundRead.current;
      if (!alive.current) return;
      if (!background) setMessage("");
      await operation();
    }
    catch (error) {
      if (alive.current) {
        if (error instanceof Error && error.message === "pairing_device_trust_required")
          onDeviceTrustMismatch?.();
        const storageFailure = error instanceof Error && isPairingStorageErrorCode(error.message) ? error.message : null;
        if (storageFailure && pairing) onRuntimeBinding?.(null, pairing.id);
        if (storageFailure && previous) { setPreviousChecked(false); onRuntimeBinding?.(null, previous.pairing.id); }
        setMessage(storageFailure ? PAIRING_STORAGE_ERRORS[storageFailure]
          : error instanceof Error && error.message === "pairing_account_link_required"
            ? "The account link for this exact task could not be verified. Keep this request while account and delegation status is checked, then reconcile it."
          : error instanceof Error && error.message === "pairing_device_identity_mismatch"
            ? "This request does not match the installed device. Keep it until the device and task identity are checked, or cancel it to review again."
          : error instanceof Error && error.message === "pairing_device_trust_required"
            ? "Device trust is not current. Review device trust in Agent Access, then reconcile this same request."
          : error instanceof Error && error.message === "pairing_registration_expired"
            ? "This task's registration expired. Ask the same task to refresh its registration, then use Cancel request and review again, refresh registered tasks, and approve the reviewed task again. Registration expiry does not revoke device trust."
          : error instanceof Error && error.message === "pairing_environment_unavailable"
            ? "The selected run is no longer available. Cancel this request to review another run."
            : error instanceof Error && error.message === "pairing_request_cancelled"
              ? "This request was cancelled. Use Cancel request and review again to confirm recovery."
              : `The request could not be confirmed. Keep this selection and reconcile the same invitation before creating another.${error instanceof PairingRequestError && /^(pairing_http_[45][0-9]{2}|pairing_request_(?:timeout|failed)|pairing_response_invalid)$/u.test(error.code) ? ` Diagnostic: ${error.code}.` : ""}`);
      }
    }
    finally { if (!background) { inFlight.current = false; if (alive.current) setBusy(false); } }
    };
    const pending = perform();
    if (background) backgroundRead.current = pending;
    try { await pending; }
    finally { if (background && backgroundRead.current === pending) backgroundRead.current = null; }
  };
  const readDestinations = async () => {
    try {
      const result = await listPairingDestinations();
      if (alive.current) {
        setDestinations(result.destinations.filter(item => item.destination.profileId === profileId));
        setAutomaticAvailable(result.automatic_delivery_available === true);
        setDestinationRead("verified");
      }
    } catch (error) {
      if (alive.current) setDestinationRead("unavailable");
      throw error;
    }
  };
  const refreshTasks = () => run(readDestinations);
  const acceptStatus = (value: PairingStatus, expectedId?: string) => {
    if (!destinationDigest.current || value.destinationDigest !== destinationDigest.current ||
        (expectedId && value.id !== expectedId) || value.chatId !== chatId ||
        JSON.stringify(value.environment) !== JSON.stringify(review.environment) ||
        JSON.stringify(value.replacement) !== JSON.stringify(review.replacement)) throw new Error("pairing_scope_mismatch");
    if (!alive.current) return;
    setPairing(value);
    if (value.state === "accepted") {
      // A committed acceptance supersedes an earlier uncertain transport or
      // registration error from the same invitation. Do not leave the owner
      // staring at "reconcile" after the exact grant has recovered.
      setMessage(current => current.startsWith("The request could not be confirmed.") ||
        current.startsWith("This task's registration expired.") ? "" : current);
    }
    if (value.state !== "pending") setInvitation(null);
    if (["revoked", "expired", "superseded"].includes(value.state)) { setRuntimeBindingVerified(false); onRuntimeBinding?.(null, value.id); }
    if (value.state === "accepted" && value.replacement) onRuntimeBinding?.(null, value.replacement.pairingId);
  };
  const refreshPrevious = async () => {
    if (!previous || !review.replacement) return;
    let value: PairingStatus;
    try { value = (await inspectPairing(previous.pairing.id)).pairing; }
    catch (error) {
      if (alive.current) { setPreviousChecked(false); onRuntimeBinding?.(null, previous.pairing.id); }
      throw error;
    }
    if (value.id !== review.replacement.pairingId || value.chatId !== chatId ||
        value.destinationDigest !== previous.pairing.destinationDigest ||
        JSON.stringify(value.environment) !== JSON.stringify(previous.review.environment) ||
        JSON.stringify(value.replacement) !== JSON.stringify(previous.review.replacement)) throw new Error("pairing_previous_scope_mismatch");
    if (!alive.current) return;
    setPrevious({ ...previous, pairing: value }); setPreviousChecked(true);
    if (value.state !== "accepted") onRuntimeBinding?.(null, value.id);
    else if (!pairing?.acceptedAt) {
      try {
        const binding = await inspectPairedRuntimeBinding(value, profileId);
        if (alive.current) onRuntimeBinding?.(binding, value.id);
      } catch { if (alive.current) onRuntimeBinding?.(null, value.id); }
    }
    return value;
  };
  const refreshPairing = async (id: string) => {
    const value = (await inspectPairing(id)).pairing;
    acceptStatus(value, id);
    if (!alive.current || value.state !== "accepted") return;
    try {
      const binding = await inspectPairedRuntimeBinding(value, profileId);
      if (!alive.current) return;
      setRuntimeMessage(binding.continuation_transport === "unavailable"
        ? "Session binding recovered. The AI task is currently unavailable."
        : "Session binding recovered. Ready up can check the environment prerequisites.");
      setRuntimeBindingVerified(true);
      onRuntimeBinding?.(binding, value.id);
    } catch (error) {
      if (alive.current) {
        setRuntimeBindingVerified(false);
        onRuntimeBinding?.(null, value.id);
        const code = error instanceof PairingRequestError ? error.code : "pairing_runtime_check_failed";
        setRuntimeMessage(code === "pairing_request_timeout" || code === "pairing_request_failed"
          ? `Pairing accepted. The runtime check was interrupted; CasimirBot will retry it automatically. No new invitation is needed. Diagnostic: ${code}.`
          : `Pairing accepted; this browser could not verify the matching runtime binding yet. Keep this pairing and check the same task through MCP. Diagnostic: ${code}.`);
      }
    }
  };
  useEffect(() => {
    void run(async () => {
      // A registration can expire independently of an accepted grant. Recover
      // the owner's pairing status even if listing registrations fails.
      const results = await Promise.allSettled([
        readDestinations(),
        (async () => {
          await refreshPrevious();
          if (!submitted) return;
          let id = localStorage.getItem(`${storageKey}:pairing`);
          if (!id) {
            const recovered = (await reconcilePairingInvitation(review.requestId)).pairing;
            if (!recovered) return;
            acceptStatus(recovered);
            id = recovered.id;
            if (!alive.current) return;
            localStorage.setItem(`${storageKey}:pairing`, id);
          }
          await refreshPairing(id);
        })(),
      ]);
      if (alive.current) setInitialReadComplete(true);
      const storageFailure = results.find(result => result.status === "rejected" &&
        result.reason instanceof Error && isPairingStorageErrorCode(result.reason.message));
      if (storageFailure?.status === "rejected") throw storageFailure.reason;
      if (results.some(result => result.status === "rejected")) throw new Error("pairing_recovery_unavailable");
    });
  }, []);
  useEffect(() => {
    const staleSelection = Boolean(review.registrationId) &&
      !destinations.some(item => item.registrationId === review.registrationId);
    if (submitted) return;
    // A still-listed registration can expire between review and issuance even
    // after the same task has registered again. Keep discovering newer proofs
    // while this review is open; a changed proof resets owner approval below.
    const timer = setInterval(() => {
      void run(readDestinations, true);
    }, destinations.length === 0 || staleSelection ? 10_000 : 30_000);
    return () => clearInterval(timer);
  }, [submitted, review.registrationId, destinations, profileId]);
  useEffect(() => {
    if ((!pairing || !["pending", "accepted"].includes(pairing.state)) && !previous) return;
    const timer = setInterval(() => {
      setClock(Date.now());
      void run(async () => { await refreshPrevious(); if (pairing) await refreshPairing(pairing.id); }, true);
    }, 5000);
    return () => clearInterval(timer);
  }, [pairing?.id, pairing?.state, previous?.pairing.id, review.replacement?.pairingId]);
  useEffect(() => {
    if (!initialReadComplete || !submitted || pairing) return;
    let attempts = 0;
    // Issuance may commit after the browser's ten-second deadline. Recover
    // only the exact reviewed request; never repeat an approval or issue call
    // in the background. Give a briefly busy local service a bounded chance
    // to reveal the durable result before requiring owner intervention.
    const timer = setInterval(() => {
      if (inFlight.current || backgroundRead.current) return;
      if (++attempts > 4) { clearInterval(timer); return; }
      void run(async () => {
        let recovered: PairingStatus | null;
        try { recovered = (await reconcilePairingInvitation(review.requestId)).pairing; }
        catch { return; } // Keep the original diagnostic and manual reconcile control.
        if (!recovered || !alive.current ||
            currentRequest.current.requestId !== review.requestId || !currentRequest.current.submitted) return;
        acceptStatus(recovered);
        // The durable request is now confirmed; an earlier transport timeout
        // must not remain visible beside its recovered pending/accepted state.
        setMessage("");
        localStorage.setItem(`${storageKey}:pairing`, recovered.id);
        await refreshPairing(recovered.id);
      }, true);
    }, 15_000);
    return () => clearInterval(timer);
  }, [initialReadComplete, submitted, pairing?.id, review.requestId]);
  const beginReplacement = () => run(async () => {
    if (!pairing || pairing.state !== "accepted") return;
    const value = (await inspectPairing(pairing.id)).pairing;
    acceptStatus(value, pairing.id);
    if (!alive.current || value.state !== "accepted") return;
    const saved = { review, pairing: value };
    const next = { ...review, requestId: crypto.randomUUID(), replacement: { pairingId: value.id, revision: value.revision } };
    // Save recovery metadata first. If interrupted before removing the original
    // review, its normal request reconciliation still recovers the old grant.
    localStorage.setItem(`${storageKey}:previous`, JSON.stringify(saved));
    localStorage.setItem(`${storageKey}:draft`, JSON.stringify(next));
    localStorage.removeItem(`${storageKey}:pairing`);
    localStorage.removeItem(storageKey);
    setPrevious(saved); setPreviousChecked(true); setReview(next); setPairing(null);
    setSubmitted(false); setApproved(false); setInvitation(null); setRuntimeMessage(""); setRuntimeBindingVerified(false);
  });
  const returnToPrevious = () => run(async () => {
    if (!previous || (submitted && (!pairing || ["pending", "accepted"].includes(pairing.state)))) return;
    const value = await refreshPrevious();
    if (!value || !alive.current) return;
    localStorage.setItem(`${storageKey}:destination`, value.destinationDigest);
    localStorage.setItem(storageKey, JSON.stringify(previous.review));
    localStorage.setItem(`${storageKey}:pairing`, value.id);
    localStorage.removeItem(`${storageKey}:draft`); localStorage.removeItem(`${storageKey}:previous`);
    destinationDigest.current = value.destinationDigest;
    setReview(previous.review); setPairing(value); setPrevious(null); setPreviousChecked(false);
    setSubmitted(true); setApproved(false); setInvitation(null); setRuntimeMessage(""); setRuntimeBindingVerified(false);
  });
  const reviewAfterPreviousEnded = () => run(async () => {
    if (submitted || !previous || !review.replacement) return;
    // A displayed deadline is not authority. Reinspect the exact prior grant
    // before releasing only this unsubmitted local replacement review.
    const value = await refreshPrevious();
    if (!alive.current || !value || !["expired", "revoked", "superseded"].includes(value.state)) return;
    const next = { ...review, replacement: undefined, invitationDelivery: "private_mcp" as const,
      requestId: crypto.randomUUID() };
    localStorage.setItem(storageKey + ":draft", JSON.stringify(next));
    localStorage.removeItem(storageKey + ":previous");
    setReview(next); setPrevious(null); setPreviousChecked(false); setApproved(false);
    setInvitation(null); setRuntimeMessage(""); setRuntimeBindingVerified(false); setDeliveryMessage("");
    setMessage("The previous pairing has ended. Review this selection and approve a new invitation when ready.");
  });
  const change = (patch: Partial<PairingInvitationRequest>) => {
    if (submitted) return;
    if (patch.registrationId !== undefined) {
      const digest = destinations.find(item => item.registrationId === patch.registrationId)?.destinationDigest ?? null;
      destinationDigest.current = digest;
      try {
        if (digest) localStorage.setItem(`${storageKey}:destination`, digest);
        else localStorage.removeItem(`${storageKey}:destination`);
      } catch { setMessage("Browser storage is unavailable. This task selection cannot be recovered."); }
    }
    setReview(current => ({ ...current, ...patch, requestId: crypto.randomUUID() })); setApproved(false);
  };
  const deliver = async (value: PairingStatus) => {
    if (!alive.current || value.state !== "pending" || review.invitationDelivery !== "automatic") return;
    setDeliveryMessage("Delivering the approved invitation…");
    try {
      const result = await deliverPairingInvitation(value);
      if (!alive.current) return;
      setDeliveryMessage(result.state === "delivered"
        ? "Invitation delivered. Waiting for authenticated task acceptance."
        : "Delivery is not confirmed. Reconcile delivery or use Copy invitation.");
    } catch {
      if (alive.current) setDeliveryMessage("Delivery is not confirmed. Reconcile delivery or use Copy invitation.");
    }
  };
  const issue = () => run(async () => {
    // Persist before sending: a reload can reconcile this exact reviewed request.
    if (!destinationDigest.current) throw new Error("pairing_reviewed_destination_missing");
    if (submitted) {
      const prior = (await reconcilePairingInvitation(review.requestId)).pairing;
      // Owner/chat changes unmount this review. Even an absent lookup must not
      // continue into issuance using the browser's now-current account cookie.
      if (!alive.current) return;
      if (prior) {
        acceptStatus(prior);
        if (!alive.current) return;
        localStorage.setItem(`${storageKey}:pairing`, prior.id);
        if (prior.state !== "pending") { await refreshPairing(prior.id); return; }
      }
    }
    localStorage.setItem(`${storageKey}:destination`, destinationDigest.current);
    if (!submitted) localStorage.removeItem(`${storageKey}:pairing`);
    localStorage.setItem(storageKey, JSON.stringify(review));
    setSubmitted(true);
    const result = await issuePairingInvitation(review);
    if (!alive.current) return;
    acceptStatus(result.pairing);
    localStorage.setItem(`${storageKey}:pairing`, result.pairing.id);
    setInvitation(result.invitation ? JSON.stringify(result.invitation) : null);
    if (result.pairing.state === "accepted") await refreshPairing(result.pairing.id);
    else await deliver(result.pairing);
  });
  const releaseCancelledRequest = () => {
    if (!alive.current || pendingCancellation.current !== review.requestId ||
        currentRequest.current.requestId !== review.requestId || !currentRequest.current.submitted) return;
    // A durable cancellation fences late issuance before this local review is
    // released. Keep the original request on any storage or response failure.
    const next = { ...review, requestId: crypto.randomUUID(), environment: null,
      invitationDelivery: "private_mcp" as const };
    localStorage.setItem(storageKey + ":draft", JSON.stringify(next));
    localStorage.removeItem(storageKey + ":pairing");
    localStorage.removeItem(storageKey);
    setReview(next); setPairing(null); setInvitation(null); setSubmitted(false);
    setApproved(false); setRuntimeMessage(""); setRuntimeBindingVerified(false); setDeliveryMessage("");
    pendingCancellation.current = null;
    setMessage("The previous request is cancelled. Review the task and run, then approve the new selection.");
    void refreshPrevious().catch(() => { if (alive.current) setPreviousChecked(false); });
  };
  const cancelRequest = () => run(async () => {
    pendingCancellation.current = review.requestId;
    try {
      const result = await cancelPairingInvitation(review.requestId);
      if (!alive.current) return;
      if (result.pairing) acceptStatus(result.pairing, pairing?.id);
      releaseCancelledRequest();
    } catch (error) {
      // A timeout may occur after the native ledger durably revoked the row.
      // Reconcile the same request; only a verified revoked row can release
      // this review. A null or pending result leaves it locked for retry.
      let recovered: PairingStatus | null = null;
      try { recovered = (await reconcilePairingInvitation(review.requestId)).pairing; }
      catch { /* Preserve the original uncertain cancellation result. */ }
      if (!alive.current) return;
      if (recovered?.state !== "revoked") throw error;
      acceptStatus(recovered, pairing?.id);
      releaseCancelledRequest();
    }
  });
  useEffect(() => {
    if (pendingCancellation.current !== review.requestId || pairing?.state !== "revoked") return;
    // The regular status poll may observe the committed cancellation after the
    // request timed out. Do not strand the owner behind the old submitted UI.
    try { releaseCancelledRequest(); }
    catch { setMessage("Cancellation was observed, but local recovery storage could not be updated. Keep this request and retry after storage is available."); }
  }, [pairing?.state, review.requestId]);
  usePairingRecoveryStorage(profileId, chatId);
  const selected = destinations.find(item => item.registrationId === review.registrationId);
  useEffect(() => {
    if (submitted || !review.registrationId || !destinationDigest.current) return;
    const replacements = destinations.filter(item => item.destinationDigest === destinationDigest.current);
    const replacement = replacements.reduce<RegisteredPairingDestination | null>((latest, item) =>
      !latest || Date.parse(item.expiresAt) > Date.parse(latest.expiresAt) ? item : latest, null);
    if (!replacement || replacement.registrationId === review.registrationId ||
        (selected && Date.parse(selected.expiresAt) >= Date.parse(replacement.expiresAt))) return;
    setReview(current => ({ ...current, registrationId: replacement.registrationId, requestId: crypto.randomUUID() }));
    setApproved(false);
    setMessage("The same authenticated AI task refreshed its registration. Review it again, then approve pairing when ready.");
  }, [destinations, review.registrationId, selected, submitted]);
  const runChoice = review.environment ?? environment ?? lastOfferedEnvironment;
  const currentEnvironment = environment ?? lastOfferedEnvironment;
  const differentRunAvailable = review.environment && currentEnvironment &&
    (review.environment.roomId !== currentEnvironment.roomId || review.environment.runId !== currentEnvironment.runId);
  const invitationElapsed = pairing && clock >= Math.min(Date.parse(pairing.invitationExpiresAt), Date.parse(pairing.pairingExpiresAt));
  const pairingEnded = pairing && ["revoked", "expired", "superseded"].includes(pairing.state);
  const previousStillAccepted = Boolean(review.replacement && previousChecked && previous?.pairing.state === "accepted");
  const recoverableReplacement = Boolean(pairingEnded && previousStillAccepted);
  const guidanceStep = !initialReadComplete || busy ? null
    : submitted && !pairing ? "reconcile"
    : recoverableReplacement ? "restore"
    : pairingEnded ? "renew"
    : pairing?.state === "pending" ? invitationElapsed ? "accept" : invitation ? "copy" : review.invitationDelivery === "private_mcp" ? "handoff" : "accept"
    // Accepted pairing already has an automatic read-only runtime check. A
    // transient failure must not become a new owner-action spotlight.
    : pairing?.state === "accepted" ? null
    : destinationRead === "unavailable" ? "refresh"
    : review.registrationId && !selected ? "refresh"
    : !destinations.length ? "register"
    : !review.registrationId ? "choose"
    : !approved ? "approve" : "issue";
  const highlightNextPairingStep = () => {
    if (!guidanceStep) return;
    const label = {
      restore: "Return to the still-accepted previous pairing; no new invitation is needed.",
      renew: "Start a new invitation for the expired task connection.",
      refresh: "Find the AI task that checked in through CasimirBot.",
      register: "Send one setup request to the exact Codex task; it checks in and registers through MCP.",
      choose: "Choose the exact registered AI task.",
      approve: "Review this task and Helix chat, then approve their time-limited connection.",
      issue: "Create the invitation for the reviewed task and chat.",
      copy: "Copy the invitation for the exact AI task; keep its secret out of chat.",
      accept: "Check whether the exact AI task accepted this invitation.",
      handoff: "Ask the same Codex task to continue setup; it accepts only this owner-approved private invitation.",
      reconcile: "Reconcile this same reviewed invitation; do not start another request.",
    }[guidanceStep];
    requestWorkstationGuidance({
      kind: "user_attention", panelId: "agent-access", targetId: `task-pairing-${guidanceStep}`,
      label, durationMs: 10_000,
    });
  };
  const reviewNewInvitation = () => {
    const next = { ...review, replacement: undefined, invitationDelivery: "private_mcp" as const,
      requestId: crypto.randomUUID() };
    try {
      // Persist the new delivery choice before releasing the old review. A
      // remount between the owner's click and the effect must not revive an
      // older manual, secret-bearing draft.
      localStorage.setItem(`${storageKey}:draft`, JSON.stringify(next));
      localStorage.removeItem(storageKey); localStorage.removeItem(`${storageKey}:pairing`);
    }
    catch { setMessage("Browser storage is unavailable. Restore storage before starting another invitation."); return; }
    setReview(next);
    setPrevious(null); setPreviousChecked(false);
    setPairing(null); setInvitation(null); setSubmitted(false); setApproved(false);
    setRuntimeBindingVerified(false);
  };
  const approvalBlocker = submitted || busy ? null
    : !selected
      ? review.registrationId
        ? "The selected registration is no longer current. Refresh registered tasks; a matching refreshed task will be selected for a new review."
        : "Choose the exact registered AI task first."
      : !approved
        ? "Review the task and check the pairing approval box."
        : Boolean(review.replacement) && (!previousChecked || previous?.pairing.state !== "accepted" || previous.pairing.revision !== review.replacement?.revision)
          ? "The previous pairing must be checked and still accepted before this replacement can be approved."
          : null;
  const checkpointMessage = guidanceStep === "register" ? "Task check-in and registration are needed in the exact Codex chat."
    : guidanceStep === "restore" ? "The replacement invitation ended; the previous pairing is still accepted. Return to it without creating another invitation."
    : guidanceStep === "refresh" ? review.registrationId && destinationRead === "verified"
      ? "The selected task registration is no longer current; refresh this same task before approval."
      : "Registered-task list is unverified; retry its read."
    : guidanceStep === "choose" ? "Registration found; select the exact task."
    : guidanceStep === "approve" || guidanceStep === "issue" ? "Owner review and approval are needed."
    : guidanceStep === "handoff" ? "Owner invitation is pending; the selected task must accept privately."
    : guidanceStep === "reconcile" ? "The reviewed invitation has not been confirmed. Reconcile this same request; no new approval is needed."
    : guidanceStep === "accept" ? "Invitation remains pending; inspect its current server status."
    : runtimeBindingVerified ? "Pairing and runtime binding are verified for this task."
    : pairing?.state === "accepted" ? "Pairing is saved; this exact task must check in through MCP to restore its runtime binding."
    : pairingEnded ? "Pairing ended; review a new invitation."
    : "Checking the exact-task pairing state.";
  return <section id="agent-exact-task-pairing" aria-label="Durable task pairing" className="mt-4 space-y-3 rounded-lg border border-cyan-300/20 p-4 text-xs leading-5">
    <h3 tabIndex={-1} className="text-sm font-semibold text-cyan-50">{pairing?.state === "accepted" ? "Message Codex pairing accepted" : "Connect Message Codex to an existing task"}</h3>
    <p className="text-slate-300">{pairing?.state === "accepted"
      ? "The owner-approved pairing lasts until its deadline. Runtime binding and task availability are checked separately. No new invitation is needed to recheck this pairing; program actions require separate permission."
      : "Review the exact task and Helix chat, then approve a time-limited connection. The task can pick up Message Codex requests through MCP while it runs. This does not grant program actions."}</p>
    <p className="rounded-md border border-cyan-300/20 bg-cyan-400/5 p-2 text-cyan-50">Current checkpoint: {checkpointMessage} {HELIX_AGENT_SETUP_PROCEDURE.completion}</p>
    {initialReadComplete && pairing?.state === "accepted" && !runtimeBindingVerified && <div
      className="rounded-md border border-amber-300/35 bg-amber-400/10 p-3 text-amber-50" aria-live="polite">
      <p className="font-semibold">Saved pairing accepted · waiting for this exact task to reconnect</p>
      <p className="mt-1">Full Harness and the task binding recover separately after an update. Keep this pairing; no new invitation is needed.</p>
      <button type="button" className="mt-2 min-h-11 rounded border border-amber-200/50 px-3 py-2 font-semibold"
        onClick={() => void (async () => {
          try {
            if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
            await navigator.clipboard.writeText(exactTaskRecoveryRequest(chatId));
            if (alive.current) setPickupCopyStatus("Reconnect request copied. Paste it into this same Codex task; the pairing will update here after its MCP check-in.");
          } catch { if (alive.current) setPickupCopyStatus("Copy failed. Use the secret-free reconnect request below in this same Codex task."); }
        })()}>Copy reconnect request to Codex</button>
      <details className="mt-2"><summary>Show secret-free reconnect request</summary>
        <p className="select-text break-words">{exactTaskRecoveryRequest(chatId)}</p></details>
      {pickupCopyStatus && <p>{pickupCopyStatus}</p>}
    </div>}
    {guidanceStep ? <button type="button" className="rounded border border-cyan-200/40 px-3 py-1.5 font-semibold text-cyan-50"
      onClick={highlightNextPairingStep}>Highlight pairing step</button> : null}
    {pairingEnded && <div className="rounded-lg border border-amber-300/40 bg-amber-400/10 p-3">
      <p className="font-semibold text-amber-100">{recoverableReplacement
        ? `The replacement invitation has ${pairing.state}; the previous pairing is still accepted.`
        : `This task connection has ${pairing.state}.`}</p>
      <p className="mt-1 text-amber-50/85">{recoverableReplacement
        ? "Return to the previous pairing below. Task availability and Minecraft run readiness are checked separately."
        : "To connect again, start a new invitation and review the task and chat below."}</p>
      {!recoverableReplacement && <button type="button" data-helix-guidance-target="task-pairing-renew" disabled={busy} onClick={reviewNewInvitation}
        className="mt-3 min-h-11 rounded-md border border-amber-200/60 bg-amber-200/15 px-3 py-2 font-semibold text-amber-50 focus-visible:outline focus-visible:outline-2 disabled:opacity-50">
        Review a new invitation
      </button>}
    </div>}
    <details className="rounded-md border border-white/10 p-3" open={pairing?.state !== "accepted"}>
    <summary className="cursor-pointer font-semibold text-cyan-50">{pairing?.state === "accepted" ? "Review pairing details and replacement options" : "Review the exact task and invitation"}</summary>
    <label className="block mt-3">Registered AI task
      <select data-helix-guidance-target="task-pairing-choose" value={review.registrationId} disabled={busy || submitted} onChange={e => change({ registrationId: e.target.value })}>
        <option value="">Choose an exact task</option>
        {review.registrationId && !selected && <option value={review.registrationId}>Previously selected task — refresh registration</option>}
        {destinations.map(item => <option key={item.registrationId} value={item.registrationId}>{item.destination.taskId} · {item.destination.clientId}</option>)}
      </select>
    </label>
    {pairing?.state === "accepted" && <div className="rounded-md border border-cyan-300/20 bg-cyan-400/5 p-3 text-cyan-50">
      <p>This picker shows the registration used by the accepted pairing; it is locked while that pairing is active. To attach a prepared run or change its duration, review a replacement. The current pairing stays active until the selected task accepts the replacement.</p>
      <button type="button" className="mt-2 min-h-11 rounded-md border border-cyan-300/50 px-3 py-2 font-semibold disabled:opacity-50"
        disabled={busy} onClick={() => void beginReplacement()}>Review replacement pairing</button>
    </div>}
    <button type="button" data-helix-guidance-target="task-pairing-refresh" disabled={busy} onClick={() => void refreshTasks()}
      className="inline-flex min-h-11 items-center rounded-md border border-cyan-300/50 bg-cyan-300/10 px-3 py-2 font-semibold text-cyan-50 hover:bg-cyan-300/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">
      Refresh registered tasks
    </button>
    {destinationRead === "checking" && <p aria-live="polite">Checking registered tasks…</p>}
    {destinationRead === "unavailable" && <p aria-live="polite">Task list could not be verified. Refresh registered tasks to retry; a failed read does not prove that registration is missing. Any retained selection is checked again by the server before approval takes effect.</p>}
    {!submitted && <div className="rounded-md border border-amber-200/30 bg-amber-400/5 p-3">
      {!destinations.length && destinationRead === "verified" && <p className="font-semibold">No task is available to select yet.</p>}
      <p className="font-semibold">Connect an existing Codex chat</p>
      <p>Only tasks that checked in through CasimirBot MCP appear above; this is not a list of every Codex chat. Send the request below to the existing chat you intend, even if another task is already listed. The task uses the one-step setup tool when available, or compatible check-in and registration tools. This page cannot wake an idle AI task.</p>
      <button type="button" data-helix-guidance-target="task-pairing-register" className="my-2 min-h-11 rounded-md border border-cyan-300/40 px-3 py-2"
        onClick={() => void (async () => {
          try {
            if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
            await navigator.clipboard.writeText(exactTaskResumeRequest(chatId));
            if (alive.current) setRegistrationCopyStatus("Setup request copied. Paste it into the intended Codex chat; return here to approve the registered task. On R66 or later, older MCP tools can accept the unique approved invitation without a copied pairing ID.");
          } catch { if (alive.current) setRegistrationCopyStatus("Copy failed. Use the displayed setup request in the intended Codex chat."); }
        })()}>Copy setup request to Codex</button>
      <details><summary>Show setup request</summary><p className="mt-2 select-text">{exactTaskResumeRequest(chatId)}</p></details>
      {registrationCopyStatus && <p role="status">{registrationCopyStatus}</p>}
      <p>The list checks for new registrations automatically. If the call times out, ask that same task to retry with the same request ID; leave approval unchecked until registration appears. After approval, the same running task can accept privately. If it stopped, send the setup request again. On R66 or later, an older tool catalog can use the exact-chat selector without copying a pairing ID; the public-ID compatibility request below remains for older installed servers.</p>
      <p>If that task reports MCP 404 or 429, no authenticated registration has been verified here. Check the matching CasimirBot Source in that same Codex task: reconnect a failed connection, refresh only a missing or stale tool catalog, and pause before retrying a 429. If OAuth says its client is not authorized for this tunnel resource, choose the already-authorized matching Source rather than repeating sign-in. Do not create an invitation until this task appears.</p>
    </div>}
    <p className="break-all rounded-md border border-white/10 bg-white/5 p-2">Helix chat: <strong>{chatId}</strong></p>
    {review.replacement && <div className="my-3 rounded border border-amber-300/30 p-3" aria-label="Replacement review">
      <p>Replace pairing {review.replacement.pairingId}, reviewed revision {review.replacement.revision}.</p>
      <p>The previous pairing stops working only when the selected task accepts this replacement. Revoking or expiring the replacement will not restore it.</p>
      <p>Previous pairing: {pairing?.acceptedAt ? "superseded by this pairing" : previousChecked && previous ? previous.pairing.state : "status not yet checked"}.</p>
      {previous && <p>Previous pairing deadline: {previous.pairing.pairingExpiresAt}.</p>}
      {!submitted && previousChecked && previous && ["expired", "revoked", "superseded"].includes(previous.pairing.state) && <div>
        <p>The previous pairing has ended, so this replacement cannot be approved. Start a new review to continue.</p>
        <button type="button" disabled={busy}
          className="my-2 min-h-11 rounded-md border border-cyan-300/40 px-3 py-2 focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
          onClick={() => void reviewAfterPreviousEnded()}>Review a new invitation</button>
      </div>}
      {previous && (!submitted || (pairing && !["pending", "accepted"].includes(pairing.state))) &&
        <button type="button" data-helix-guidance-target={recoverableReplacement ? "task-pairing-restore" : undefined}
          className="min-h-11 rounded-md border border-cyan-300/50 bg-cyan-300/10 px-3 py-2 font-semibold text-cyan-50 focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
          disabled={busy} onClick={() => void returnToPrevious()}>Return to previous pairing</button>}
    </div>}
    {selected && <p className="break-all rounded-md border border-white/10 bg-white/5 p-2">Selected task: <strong>{selected.destination.taskId}</strong></p>}
    <label className="block">Invitation expires after
      <select value={review.invitationSeconds} disabled={busy || submitted} onChange={e => change({ invitationSeconds: Number(e.target.value) as 300 | 900 | 3600 })}>
        <option value={300}>5 minutes</option><option value={900}>15 minutes</option><option value={3600}>60 minutes</option>
      </select>
    </label>
    <label className="block">Pairing duration
      <select value={review.pairingSeconds} disabled={busy || submitted} onChange={e => change({ pairingSeconds: Number(e.target.value) as 3600 | 28800 | 86400 })}>
        <option value={3600}>1 hour</option><option value={28800}>8 hours</option><option value={86400}>24 hours</option>
      </select>
    </label>
    {runChoice && <label className="block"><input type="checkbox" checked={Boolean(review.environment)} disabled={busy || submitted}
      onChange={e => change({ environment: e.target.checked ? runChoice : null })} /> Include environment run {runChoice.runId} in room {runChoice.roomId}</label>}
    {runChoice && !environment && <p>Last verified run; availability is checked again when you approve. Keeping this choice does not grant permission.</p>}
    {!submitted && differentRunAvailable && <button type="button" disabled={busy}
      className="my-2 min-h-11 rounded-md border border-cyan-300/40 px-3 py-2 focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
      onClick={() => change({ environment: null })}>
      Review current environment run {currentEnvironment.runId}
    </button>}
    <label className="block">Invitation delivery
      <select value={review.invitationDelivery ?? "copy"} disabled={busy || submitted}
        onChange={e => change({ invitationDelivery: e.target.value === "private_mcp" ? "private_mcp" : e.target.value === "automatic" ? "automatic" : undefined })}>
        <option value="private_mcp">Let this exact task accept privately through MCP (recommended)</option>
        <option value="copy">Copy invitation (manual secret-bearing handoff)</option>
        <option value="automatic" disabled={!automaticAvailable}>Send to the selected task automatically</option>
      </select>
    </label>
    <label className="block mt-3"><input type="checkbox" data-helix-guidance-target="task-pairing-approve" checked={approved} disabled={busy || submitted}
      data-helix-control-id="workstation.panel.agent-access.durable-task-pairing.approve-exact-task"
      data-helix-interaction-kind="human_only" data-helix-authority-state="client_local"
      onChange={e => setApproved(e.target.checked)} /> I approve pairing this exact task and chat for the selected duration.</label>
    {approvalBlocker && <p id="pairing-approval-blocker" className="mt-3 text-amber-100">{approvalBlocker}</p>}
    </details>
    {(!pairing || pairing.state === "pending") && <button type="button" data-helix-guidance-target={submitted && !pairing ? "task-pairing-reconcile" : "task-pairing-issue"}
      data-helix-control-id="workstation.panel.agent-access.durable-task-pairing.issue-invitation"
      data-helix-interaction-kind="human_only" data-helix-authority-state="client_local"
      className="my-3 inline-flex min-h-11 items-center justify-center rounded-md border border-cyan-200 bg-cyan-300 px-4 py-2 text-left text-sm font-semibold text-slate-950 shadow-sm hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-50" aria-describedby={approvalBlocker ? "pairing-approval-blocker" : undefined} disabled={busy || (!submitted && (!approved || !selected ||
      (Boolean(review.replacement) && (!previousChecked || previous?.pairing.state !== "accepted" || previous.pairing.revision !== review.replacement?.revision))))} onClick={() => void issue()}>
      {submitted ? "Reconcile invitation" : "Approve pairing and create invitation"}
    </button>}
    {submitted && (!pairing || pairing.state === "pending") && <div>
      <p>Canceling also revokes any pairing already created by this request. A replacement does not restore an earlier superseded pairing.</p>
      <button type="button" className="my-2 min-h-11 rounded-md border border-slate-400 px-3 py-2 focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
        disabled={busy} onClick={() => void cancelRequest()}>Cancel request and review again</button>
    </div>}
    {review.invitationDelivery === "private_mcp"
      ? <p>You approve private acceptance by this exact authenticated task. No invitation secret needs to be pasted into chat. The AI must be running to make the acceptance call.</p>
      : review.invitationDelivery === "automatic"
      ? <p>You approve sending this invitation to the exact selected task. The server verifies that destination before issuance. Delivery does not accept the pairing.</p>
      : <p>Use Copy invitation and send it to the selected task for authenticated acceptance.{!automaticAvailable && " Automatic delivery is unavailable for this connection."}</p>}
    {pairing?.state === "pending" && review.invitationDelivery === "automatic" && <>
      {deliveryMessage && <p>{deliveryMessage}</p>}
      <button type="button" disabled={busy || Boolean(invitationElapsed)} onClick={() => void run(async () => { await deliver(pairing); })}>Reconcile delivery</button>
    </>}
    {pairing?.state === "pending" && review.invitationDelivery === "private_mcp" && !invitationElapsed && <div>
      <p className="font-semibold">Owner approval recorded. Ask the same task to continue setup.</p>
      <button type="button" data-helix-guidance-target="task-pairing-handoff" className="my-2 min-h-11 rounded-md border border-cyan-300/40 px-3 py-2"
        onClick={() => void (async () => {
          try {
            if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
            await navigator.clipboard.writeText(exactTaskResumeRequest(chatId));
            if (alive.current) setPickupCopyStatus("Continue request copied. Paste it into the selected Codex chat, then return here for binding status.");
          } catch { if (alive.current) setPickupCopyStatus("Copy failed. Clipboard access is unavailable; do not copy the invitation secret into chat."); }
        })()}>Copy continue request to Codex</button>
      <button type="button" className="my-2 ml-2 min-h-11 rounded-md border border-cyan-300/40 px-3 py-2"
        onClick={() => void (async () => {
          try {
            if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
            await navigator.clipboard.writeText(`Use helix_reasoning_pairing_accept_private for pairing ID ${pairing.id} in this exact task. Keep client_continuation_ref set to this task's own identity. Report whether pairing and runtime binding are active. Do not perform any environment action. This request contains no invitation secret.`);
            if (alive.current) setPickupCopyStatus("Compatibility request copied. Paste it into the selected Codex chat, then check acceptance here.");
          } catch { if (alive.current) setPickupCopyStatus("Copy failed. Clipboard access is unavailable; do not copy the invitation secret into chat."); }
        })()}>Copy request for older MCP tools</button>
      {pickupCopyStatus && <p role="status">{pickupCopyStatus}</p>}
      <details>
        <summary className="cursor-pointer">Show secret-free continue request</summary>
        <p aria-label="Secret-free continue request" className="select-text break-words rounded-md border border-white/10 p-2">
          {exactTaskResumeRequest(chatId)}
        </p>
      </details>
    </div>}
    {invitation && review.invitationDelivery !== "private_mcp" && !invitationElapsed && <div data-helix-guidance-target="task-pairing-copy"><ReasoningClaimHandle value={invitation} id="durable-pairing-invitation" label="Pairing invitation" /></div>}
    {pairing?.state === "pending" && !invitation && !invitationElapsed && !review.invitationDelivery &&
      <p role="status" className="text-amber-100">This manual invitation exists, but its one-time secret was not recovered. Check acceptance first. If it is still pending, cancel this exact request and review a new invitation with private MCP delivery; do not create another request while this one is unresolved.</p>}
    {pairing?.state === "pending" && invitationElapsed && <p>The invitation deadline has elapsed on this device. Checking server status; copying is unavailable.</p>}
    {pairing && <>
      <p role="status">{recoverableReplacement
        ? `Replacement pairing: ${pairing.state}. Previous pairing: accepted. Current task availability is checked separately.`
        : pairing.state === "accepted"
          ? "Pairing: accepted for this chat. Runtime binding, task availability, and game permissions are checked separately."
          : `Pairing: ${pairing.state}. Current task availability is checked separately below.`}</p>
      {pairing.state === "accepted" && runtimeMessage && <p>{runtimeMessage}</p>}
      <p>Invitation deadline: {pairing.invitationExpiresAt}. Pairing deadline: {pairing.pairingExpiresAt}.</p>
      <button type="button" data-helix-guidance-target={pairing.state === "accepted" ? "task-pairing-binding" : "task-pairing-accept"} className="mr-2 min-h-11 rounded-md border border-white/20 px-3 py-2" disabled={busy} onClick={() => void run(async () => {
        await refreshPairing(pairing.id);
      })}>Check acceptance</button>
      <button type="button" className="min-h-11 rounded-md border border-white/20 px-3 py-2" disabled={busy || pairing.state === "revoked"} onClick={() => void run(async () => {
        const result = await revokePairing(pairing.id);
        acceptStatus(result.pairing, pairing.id);
      })}>Revoke pairing</button>
    </>}
    {message && <p role="alert">{message}</p>}
  </section>;
}
