import React, { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { nativeHostedRoomOptionsSchema, nativeHostedRoomAttachmentSchema,
  NATIVE_HOSTED_ROOM_BASE_PATH as BASE, type NativeHostedRoomOptions } from "@shared/helix-native-hosted-room-mission";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { NativeHostedRoomResultsPanel } from "./NativeHostedRoomResultsPanel";
import { NativeRoomInstructionsPanel } from "./NativeRoomInstructionsPanel";
import { NativeHostedRoomInterpreterProposalReview } from "./NativeHostedRoomInterpreterProposalReview";
import { NativeHostedRoomInterpreterResultsPanel } from "./NativeHostedRoomInterpreterResultsPanel";
import { NativeDiscordTaskTranscriptOfferPanel } from "./NativeDiscordTaskTranscriptOfferPanel";

const ownerSelectionFailureSchema = z.object({
  error: z.string().regex(/^[a-z][a-z0-9_]{0,95}$/u),
});

const candidateRecovery = {
  task_inactive: "The paired chat is not currently checked in. Resume that exact Codex chat and have it check in through its CasimirBot connection, then refresh owner selection. This does not require a new pairing approval unless that check reports expired or revoked access.",
  pairing_unavailable: "The paired chat connection is unavailable. Open Message Codex and recover the intended chat connection. Request a new finite pairing only if recovery reports missing, expired or revoked access, then refresh owner selection.",
  device_access_changed: "This device's access could not be verified. Open Account & Sessions and retry the computer approval check. Complete an approval only if that check requires it, then refresh owner selection.",
  task_client_mismatch: "The paired task belongs to a different CasimirBot connection. In the intended Codex chat, use this profile's CasimirBot connection to recover its pairing, then refresh owner selection.",
  task_unavailable: "The paired task could not be verified. Check Message Codex and have the intended chat recover its exact pairing through its own CasimirBot connection, then refresh owner selection.",
};

/** Private owner controls. Viewing a room never reserves a node or selects a
 * task. Every mutation follows a fresh, explicit review of both revisions. */
export function NativeHostedRoomTaskPanel({ roomId, authority, isOwner = false,
  enableAiProposal = false, selectionOnly = false, control }: {
  roomId: string; authority: string; isOwner?: boolean; enableAiProposal?: boolean;
  selectionOnly?: boolean;
  control?: (request: unknown) => Promise<unknown>;
}) {
  const [options, setOptions] = useState<NativeHostedRoomOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const clear = () => {
      generation.current += 1; pending.current?.abort(); pending.current = null;
      setOptions(null); setBusy(false); setMessage(null);
    };
    clear();
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    return () => { generation.current += 1; pending.current?.abort(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear); };
  }, [roomId, authority]);

  const run = async (select: boolean) => {
    if (pending.current || busy || (select && !options?.candidate)) return;
    const epoch = ++generation.current;
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    setBusy(true); setMessage(null);
    // Selection consumes this review. An uncertain response requires a fresh
    // inspection and explicit replacement, never a guessed revision or retry.
    const reviewed = options; setOptions(null);
    let diagnostic = "";
    try {
      const response = await fetch(select ? `${BASE}/select` : `${BASE}/${encodeURIComponent(roomId)}/owner-options`, {
        method: select ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", ...(select ? { "Content-Type": "application/json" } : {}) },
        ...(select ? { body: JSON.stringify({ room_id: roomId, target: reviewed!.candidate,
          expected_local_revision: reviewed!.local_revision, expected_remote_revision: reviewed!.attachment?.revision ?? null,
          request_id: `native-select:${crypto.randomUUID()}` }) } : {}), signal: controller.signal,
      });
      const value = await response.json();
      if (epoch !== generation.current) return;
      if (controller.signal.aborted) throw new Error("request_expired");
      if (!response.ok) {
        const failure = ownerSelectionFailureSchema.safeParse(value);
        diagnostic = ` Diagnostic: ${failure.success ? `${failure.data.error} · ` : ""}HTTP ${response.status}.`;
        throw new Error("request_failed");
      }
      if (!select) {
        const checked = nativeHostedRoomOptionsSchema.safeParse(value);
        if (!checked.success) {
          diagnostic = " Diagnostic: owner_options_schema_invalid.";
          throw new Error("invalid_owner_options");
        }
        const parsed = checked.data;
        if (parsed.room_id !== roomId || parsed.authority !== authority) throw new Error("wrong_room");
        setOptions(parsed);
      } else {
        const attachment = nativeHostedRoomAttachmentSchema.parse(value.attachment);
        if (value.schema !== "helix.native_hosted_room_selection.v1" || value.ok !== true ||
            value.room_id !== roomId || value.authority !== authority || value.local_task_selected !== true ||
            value.dispatch_authority !== false || value.answer_authority !== false ||
            value.terminal_eligible !== false || value.raw_content_included !== false ||
            value.local_revision !== (reviewed!.local_revision ?? 0) + 1 ||
            attachment.revision !== (reviewed!.attachment?.revision ?? 0) + 1 || Date.parse(attachment.expires_at) <= Date.now()) {
          throw new Error("invalid_selection");
        }
        setMessage(selectionOnly
          ? "Task selection recorded on this device. Room text and instruction sharing still require their separate approvals."
          : "Task selection recorded on this device. Review captured speech in the room browser, then load and queue that instruction here.");
      }
    } catch {
      if (epoch === generation.current) setMessage(select
        ? `Selection could not be confirmed. Refresh the owner selection before explicitly replacing it; no retry was sent.${diagnostic}`
        : `Owner selection is unavailable. Check that you own this service room and that your room connection is current.${diagnostic}`);
    } finally {
      clearTimeout(timer);
      if (epoch === generation.current) { pending.current = null; setBusy(false); }
    }
  };

  const replacing = options && (options.local_revision !== null || options.attachment !== null);
  return <section aria-label="Hosted room task selection" className="mt-3 rounded border border-white/20 p-3 text-xs">
    <p>Owner task selection</p>
    <button data-helix-control-id="helix.ask.shared_live_room.native-hosted-room-task-panel.refresh-owner-selection" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy} onClick={() => void run(false)}>Refresh owner selection</button>
    {message ? <p role="status">{message}</p> : null}
    {options ? <>
      <p>{options.local_status ? `Last local selection: ${options.local_status} (revision ${options.local_revision}).` : "No task has been selected on this device."}</p>
      <p>{options.attachment
        ? `Service attachment: ${options.attachment.status}, revision ${options.attachment.revision}; expires ${options.attachment.expires_at}.`
        : "No service attachment exists."} This is a record, not permission to execute.</p>
      {options.candidate ? <>
        <p>Paired task: <code>{options.candidate.helix_conversation_id}</code> · pairing revision {options.candidate.binding_epoch}</p>
        {replacing ? <p>Replacing selects this device and task again and supersedes the previous service attachment, including one on another device.</p> : null}
        <button data-helix-control-id="helix.ask.shared_live_room.native-hosted-room-task-panel.void-run-true" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy} onClick={() => void run(true)}>{replacing ? "Replace with this paired task" : "Select this paired task"}</button>
      </> : <p>No currently authorized paired task is available. {options.candidate_unavailable_reason
        ? candidateRecovery[options.candidate_unavailable_reason]
        : "Check Message Codex and Account & Sessions, then have the intended chat check in through its own CasimirBot connection. Request a new pairing only if recovery reports missing, expired or revoked access."}</p>}
      {!selectionOnly && isOwner && control && options.task_transcript_sharing_enabled ?
        <NativeDiscordTaskTranscriptOfferPanel roomId={roomId} options={options}
          control={control} /> : null}
    </> : null}
    {!selectionOnly ? <NativeRoomInstructionsPanel key={`instructions:${generation.current}`} roomId={roomId} authority={authority} disabled={busy} /> : null}
    {!selectionOnly && isOwner && enableAiProposal ? <NativeHostedRoomInterpreterProposalReview
      key={`ai-proposal:${generation.current}`} roomId={roomId} authority={authority} disabled={busy} /> : null}
    {!selectionOnly && isOwner && enableAiProposal ? <NativeHostedRoomInterpreterResultsPanel
      key={`ai-results:${generation.current}`} roomId={roomId} authority={authority} disabled={busy} /> : null}
    {!selectionOnly ? <NativeHostedRoomResultsPanel key={generation.current} roomId={roomId} authority={authority} disabled={busy} /> : null}
  </section>;
}
