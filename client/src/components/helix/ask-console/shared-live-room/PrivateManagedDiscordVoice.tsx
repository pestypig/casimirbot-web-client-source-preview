import { useEffect, useState } from "react";
import { RoomReviewScope, type RoomReviewOperation } from "./RoomReviewScope";
import { discordVoiceManagedBindingReceiptSchema,
  type DiscordVoiceManagedBindingReceipt } from
  "@shared/discord-voice-managed-binding";

type ApprovedReview = Readonly<{ contract_request_id: string;
  contract_review_revision: string; contract_task_ref: string;
  media_binding_id: string; maximum_seconds: number }>;

/** This is only a private installed-client qualification control. The
 * Electron main process, domain service, and worker recheck authority. */
export function approvedManagedVoiceReview(value: unknown,
  binding: DiscordVoiceManagedBindingReceipt, now = Date.now()
): ApprovedReview | null {
  if (!value || typeof value !== "object") return null;
  const response = value as Record<string, unknown>;
  if (response.ok !== true || !Array.isArray(response.requests)) return null;
  const matches = response.requests.filter(candidate => {
    if (!candidate || typeof candidate !== "object") return false;
    const row = candidate as Record<string, unknown>;
    const approval = row.approval as Record<string, unknown> | null;
    return row.request_id === binding.contract_request_id &&
      row.review_revision === binding.contract_review_revision &&
      row.task_ref === binding.contract_task_ref &&
      row.installation_ref === binding.contract_device_ref &&
      row.status === "approved" &&
      approval?.reviewedRevision === binding.contract_review_revision &&
      typeof approval.expiresAtMs === "number" &&
      approval.expiresAtMs > now + 10_000 &&
      Array.isArray(row.scopes);
  }) as Array<Record<string, unknown>>;
  if (matches.length !== 1) return null;
  const roomId = binding.room.room_id;
  const scope = (matches[0].scopes as unknown[]).find(item => {
    if (!item || typeof item !== "object") return false;
    const value = item as Record<string, unknown>;
    return value.branch === "discord_voice" && value.mode === "gpt_live" &&
      value.room_ref === roomId && typeof value.duration_seconds === "number" &&
      Number.isSafeInteger(value.duration_seconds) &&
      value.duration_seconds >= 10;
  }) as Record<string, unknown> | undefined;
  if (!scope) return null;
  const leaseSeconds = Math.floor((Date.parse(binding.lease_until) - now) / 1000) - 1;
  const approval = matches[0].approval as { expiresAtMs: number };
  const approvalSeconds = Math.floor((approval.expiresAtMs - now) / 1000) - 1;
  const maximum = Math.min(600, scope.duration_seconds as number,
    leaseSeconds, approvalSeconds);
  if (maximum < 10) return null;
  return { contract_request_id: binding.contract_request_id,
    contract_review_revision: binding.contract_review_revision,
    contract_task_ref: binding.contract_task_ref,
    media_binding_id: `${roomId}:${binding.invitation_id.slice("discord_voice:".length)}`,
    maximum_seconds: maximum };
}

type PrivateManagedDiscordVoiceProps = Readonly<{
  roomId: string; readBinding: () => Promise<unknown>;
}>;
export function PrivateManagedDiscordVoice(props: PrivateManagedDiscordVoiceProps) {
  return <RoomReviewScope scopeKey={props.roomId}>{run =>
    <PrivateManagedDiscordVoiceSession {...props} run={run} />}</RoomReviewScope>;
}

function PrivateManagedDiscordVoiceSession({ roomId, readBinding, run }:
  PrivateManagedDiscordVoiceProps & { run: RoomReviewOperation }) {
  const [available, setAvailable] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void run(() => fetch("/api/capped-membership/live/probe/status", {
      cache: "no-store", credentials: "same-origin", signal: controller.signal,
    })).then(async response => response.ok ? run(() => response.json()) : null)
      .then(value => {
        if (!controller.signal.aborted &&
            value?.schema === "casimirbot.capped_live_probe_status.v1" &&
            value?.private_media_ready === true &&
            typeof window.casimirDesktop?.cappedMembershipVoiceStart === "function")
          setAvailable(true);
      }).catch(() => undefined);
    return () => controller.abort();
  }, [run]);
  if (!available) return null;
  const start = async () => {
    if (attempted) return;
    setAttempted(true);
    setMessage("Checking the approved contract and armed Discord invitation…");
    let nativeInvoked = false;
    try {
      const binding = discordVoiceManagedBindingReceiptSchema.parse(
        await run(readBinding));
      if (binding.room.room_id !== roomId) throw Error("room_changed");
      const response = await run(() => fetch("/api/desktop/setup-contract/requests", {
        cache: "no-store", credentials: "same-origin",
      }));
      const review = approvedManagedVoiceReview(response.ok ?
        await run(() => response.json()) : null, binding);
      if (!review) throw Error("review_unavailable");
      setMessage(`Starting one managed GPT Live call for up to ${review.maximum_seconds} seconds…`);
      const result = await run(async () => {
        nativeInvoked = true;
        return window.casimirDesktop?.cappedMembershipVoiceStart?.(review);
      });
      if (!result || typeof result !== "object" ||
          !("ok" in result) || result.ok !== true ||
          !("answer" in result) || !result.answer ||
          typeof result.answer !== "object" ||
          !("state" in result.answer) || result.answer.state !== "settled")
        throw Error("outcome_unconfirmed");
      setMessage("The managed call closed with a confirmed provider receipt. Review the membership ledger before another call.");
    } catch {
      if (!nativeInvoked) setAttempted(false);
      setMessage(nativeInvoked
        ? "The managed call was not confirmed. Check the membership ledger before another call."
        : "The contract or Discord invitation is not ready. Review them and retry this check.");
    }
  };
  return <section className="mt-3 rounded border border-cyan-300/20 p-2"
    aria-label="Private managed Discord GPT Live check">
    <h4 className="text-sm font-semibold text-cyan-100">Private managed Discord GPT Live check</h4>
    <p className="mt-1 text-xs text-slate-300">Uses CasimirBot’s server-held OpenAI key and this paid sandbox period. Your approved contract must name this room and GPT Live duration, and every person in the Discord call must have current consent. The maximum is ten minutes or the remaining approved lease, whichever is shorter. Provider cost counts against your all-in cap.</p>
    <button data-helix-control-id="helix.ask.shared_live_room.private-managed-discord-voice.start-one-contract-approved-managed-call" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={attempted} onClick={() => void start()}>
      Start one contract-approved managed call
    </button>
    {message ? <p role="status" className="mt-1 text-xs text-amber-100">{message}</p> : null}
  </section>;
}
