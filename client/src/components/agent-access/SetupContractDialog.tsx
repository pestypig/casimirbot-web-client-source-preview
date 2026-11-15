import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type {
  HelixSetupContractBranch,
  HelixSetupContractConnectionKind,
  HelixSetupContractProjection,
  HelixSetupContractStepId,
} from "@shared/helix-setup-contract";

const branchLabels: Record<HelixSetupContractBranch, string> = {
  full_harness: "Start Full Harness on this developer installation",
  task_pairing: "Pair this Codex task with one Helix chat",
  shared_room: "Connect the selected room",
  room_ai_release: "Review separate room AI consent",
  discord_stream: "Share approved read-only activity to Discord",
  discord_voice: "Invite Captain Keyes to the reviewed voice channel",
  minecraft_player: "Review Minecraft player control: selected or full current catalog",
  responses_session: "Enable bounded Responses decisions and observation monitoring",
  shelter_build: "Review one exact Minecraft shelter footprint and five commands",
  companion_mission: "Review one bounded independent Minecraft companion mission",
  companion_resident_session: "Review one-hour independent companion session",
  minecraft_game: "Review full autonomous access to this world's current game actions",
};

const stateLabels: Record<HelixSetupContractProjection["steps"][number]["state"], string> = {
  satisfied: "Current",
  owner_action_required: "Needs your action",
  agent_action_available: "Codex step pending",
  blocked: "Blocked",
  unknown: "Not verified",
};

const setupEligibilityDuration = (seconds: number) => seconds % 3_600 === 0
  ? `${seconds / 3_600} ${seconds === 3_600 ? "hour" : "hours"}`
  : seconds % 60 === 0
    ? `${seconds / 60} ${seconds === 60 ? "minute" : "minutes"}`
    : `${seconds} seconds`;

export type SetupContractReviewTarget = Readonly<{
  declaredSummary: string;
  account: string;
  installation: string;
  executableSha256: string;
  packageSha256: string;
  codexTask: string;
  maxAdditionalTasks?: number;
  mcpClientFingerprint: string;
  helixChat: string;
  reviewUntil: string;
  requestedLeaseSeconds: number;
  verifiedUpdateContinuation?: boolean;
  signedUpdateContinuation?: boolean;
  approvalUntil: string | null;
  scopeLines: readonly string[];
}>;

export type SetupContractReview = Readonly<{
  revision: string;
  requestedBranches: readonly HelixSetupContractBranch[];
  reviewableUntilMs: number;
  canApprove: boolean;
}>;
export type SetupContractWorkflowStatus = "pending_owner_review" | "approved" | "revoked" | "expired";

export function SetupContractDialog({
  open, onOpenChange, projection, target, review, workflowStatus, onApprove,
  onRevoke, onOpenStep, onSelectionChange, onRetry, inspectionFailed = false,
  stepMessage, hostedSourceStage,
  companionActorPrepare,
  availableBranches, unboundBranches = [], connectionKind = "developer_tunnel",
  startFullHarnessOnApprove = false, busy = false, nowMs = Date.now(),
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projection: HelixSetupContractProjection;
  target: SetupContractReviewTarget;
  review: SetupContractReview | null;
  workflowStatus: SetupContractWorkflowStatus;
  onApprove?: (revision: string) => void;
  onRevoke?: () => void;
  onOpenStep?: (stepId: HelixSetupContractStepId) => void;
  stepMessage?: string | null;
  hostedSourceStage?: Readonly<{ hostedRoomId: string; localRoomId: string;
    worldFolder: string; onPreflight: () => void; onStage: () => void }>;
  companionActorPrepare?: Readonly<{ onPrepare: () => void;
    onInspect: () => void; onCancel: () => void;
    onConfirmStart?: () => void; onIssueGrant?: () => void;
    onConfigureWorldAuthority?: () => void;
    onAuthorizeWorldAuthority?: () => void;
    onPrepareInstall?: () => void; onInspectMission?: () => void;
    onStartMission?: () => void; onStopMission?: () => void;
    stopBusy?: boolean;
    onVerifyShelter?: () => void }>;
  onSelectionChange?: (branches: readonly HelixSetupContractBranch[]) => void;
  onRetry?: () => void;
  inspectionFailed?: boolean;
  availableBranches?: readonly HelixSetupContractBranch[];
  unboundBranches?: readonly HelixSetupContractBranch[];
  connectionKind?: HelixSetupContractConnectionKind;
  startFullHarnessOnApprove?: boolean;
  busy?: boolean;
  nowMs?: number;
}>) {
  const [selectionPendingRevision, setSelectionPendingRevision] = React.useState<string | null>(null);
  const [revokeArmed, setRevokeArmed] = React.useState(false);
  React.useEffect(() => { if (!open) setRevokeArmed(false); }, [open]);
  const selected = new Set(projection.requestedBranches);
  const roomAiConsentNeedsExactSource = selected.has("room_ai_release");
  const currentStepCount = projection.steps.filter(step => step.state === "satisfied").length;
  const incompleteOwnerSteps = projection.steps.filter(step =>
    step.actor === "owner" && step.state !== "satisfied" && step.state !== "blocked");
  const nextOwnerStep = incompleteOwnerSteps.find(step =>
    step.prerequisiteIds.every(id => projection.steps.find(candidate =>
      candidate.id === id)?.state === "satisfied")) ?? null;
  const reviewSelectionMatches = Boolean(review &&
    review.requestedBranches.length === selected.size &&
    review.requestedBranches.every(branch => selected.has(branch)));
  const reviewReady = Boolean(workflowStatus === "pending_owner_review" &&
    !inspectionFailed &&
    review?.canApprove && review.revision.trim() &&
    Number.isFinite(review.reviewableUntilMs) && review.reviewableUntilMs > nowMs &&
    reviewSelectionMatches &&
    (selectionPendingRevision === null || review.revision !== selectionPendingRevision) &&
    onApprove && !busy);
  const toggle = (branch: HelixSetupContractBranch) => {
    if (workflowStatus !== "pending_owner_review" || !onSelectionChange || busy) return;
    setSelectionPendingRevision(review?.revision ?? "");
    const next = new Set(selected);
    if (next.has(branch)) next.delete(branch);
    else next.add(branch);
    onSelectionChange(Object.keys(branchLabels).filter(
      (id): id is HelixSetupContractBranch => next.has(id as HelixSetupContractBranch),
    ));
  };
  const selectAllAvailable = () => {
    if (workflowStatus !== "pending_owner_review" || !onSelectionChange ||
        !availableBranches || busy) return;
    setSelectionPendingRevision(review?.revision ?? "");
    onSelectionChange(availableBranches);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto bg-slate-950 text-slate-100">
        <DialogHeader>
          <DialogTitle>Review CasimirBot setup contract</DialogTitle>
          <DialogDescription className="text-slate-300">
            Review this exact task and each selected capability. The setup approval expires separately from native permissions. Open an owner control below to inspect or manage sign-in, {connectionKind === "personal_stdio" ? "device approval and local Codex access" : "USB access"}, room, Discord, or game setup.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded border border-white/10 bg-white/5 p-3 text-xs text-slate-200">
          <strong>Codex-proposed purpose:</strong> {target.declaredSummary}
        </p>
        {inspectionFailed ? <div role="alert" className="rounded border border-amber-300/40 bg-amber-300/10 p-3 text-xs text-amber-100">
          <p>The latest owner read failed. Approval is paused until this exact request is refreshed.</p>
          {onRetry ? <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.retry-owner-read" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" onClick={onRetry} disabled={busy}
            className="mt-2 rounded border border-amber-200/50 px-2 py-1 disabled:opacity-50">
            Retry owner read
          </button> : null}
        </div> : null}
        {workflowStatus === "revoked" || workflowStatus === "expired" ? (
          <p role="status" className="rounded border border-amber-300/40 bg-amber-300/10 p-3 text-xs text-amber-100">
            This setup request is {workflowStatus}. Its reviewed scope cannot be used again. Permission rows below are separate current observations; use their owner controls to manage any grant that remains active. A new request needs a new owner review.
          </p>
        ) : null}
        <section aria-label="Exact setup target" className="rounded border border-cyan-300/25 bg-cyan-400/5 p-3 text-xs">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt>Account</dt><dd>{target.account}</dd>
            <dt>Installation</dt><dd>{target.installation}</dd>
            <dt>EXE SHA-256</dt><dd className="break-all">{target.executableSha256}</dd>
            <dt>Package fingerprint SHA-256</dt><dd className="break-all">{target.packageSha256}</dd>
            <dt>Declared Codex task</dt><dd>{target.codexTask}</dd>
            <dt>MCP client fingerprint</dt><dd>{target.mcpClientFingerprint}</dd>
            <dt>Helix chat</dt><dd>{target.helixChat}</dd>
            <dt>Review closes</dt><dd>{target.reviewUntil}</dd>
            <dt>Requested setup eligibility (24-hour max)</dt><dd>{setupEligibilityDuration(target.requestedLeaseSeconds)} after approval</dd>
            {target.approvalUntil ? <><dt>Approved intent expires</dt><dd>{target.approvalUntil}</dd></> : null}
          </dl>
        </section>
        <fieldset className="space-y-2 rounded border border-white/10 p-3">
          <legend className="px-1 text-sm font-semibold">Selected purposes</legend>
          {workflowStatus === "pending_owner_review" && onSelectionChange &&
            availableBranches && availableBranches.some(branch => !selected.has(branch)) ? (
              <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.select-all-available-purposes" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" onClick={selectAllAvailable} disabled={busy}
                className="text-xs text-cyan-200 underline disabled:opacity-50">
                Select all available purposes
              </button>
            ) : null}
          {(Object.keys(branchLabels) as HelixSetupContractBranch[])
            .filter(branch => selected.has(branch) ||
              availableBranches?.includes(branch))
            .map(branch => (
            <label key={branch} className="flex items-start gap-2 text-sm">
              <input data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.input" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" type="checkbox" checked={selected.has(branch)}
                disabled={workflowStatus !== "pending_owner_review" || !onSelectionChange || busy ||
                  (selected.size === 1 && selected.has(branch)) ||
                  (availableBranches !== undefined && !availableBranches.includes(branch))}
                onChange={() => toggle(branch)} aria-label={branch === "full_harness" &&
                  connectionKind === "personal_stdio" ? "Use local Codex Full Harness" : branchLabels[branch]} />
              <span>{branch === "full_harness" && connectionKind === "personal_stdio"
                ? "Use local Codex Full Harness" : branchLabels[branch]}
                {selected.has(branch) && unboundBranches.includes(branch)
                  ? <span className="block text-xs text-amber-200">
                    Purpose selected; no exact target or authority is bound yet.
                  </span> : null}
              </span>
            </label>
          ))}
          <p className="text-xs text-slate-400">Room message and call access is reviewed per exact source in Party Chat. A planned purpose is not an access grant; exact targets and budgets remain separately checked before use.</p>
        </fieldset>
        <section aria-label="Requested scope" className="rounded border border-white/10 p-3 text-xs">
          <h3 className="font-semibold">Exact scope</h3>
          {target.scopeLines.length ? <ul className="mt-1 list-disc space-y-1 pl-5">
            {target.scopeLines.map((line, index) => <li key={index}
              className={line.length > 500
                ? "max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-900 p-2 font-mono text-xs"
                : undefined}>{line}</li>)}
          </ul> : <p className="mt-1 text-amber-200">No exact scope has been supplied for review.</p>}
        </section>
        <section aria-label="Authorization steps" className="space-y-2">
          <h3 className="text-sm font-semibold">Authorization and verification</h3>
          {companionActorPrepare ? (
            <div className="rounded border border-cyan-300/25 bg-cyan-400/5 p-3 text-xs">
              <p className="font-semibold">Prepare the reviewed companion</p>
              <p className="mt-1 text-slate-300">Place one inert companion near the reviewed center in the selected world. This stages a one-use local ticket. It grants no movement, inventory access, block placement, or model call. F10 dismisses the prepared actor.</p>
              {workflowStatus === "approved" ? <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.prepare-companion-actor" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button"
                disabled={busy || inspectionFailed}
                onClick={companionActorPrepare.onPrepare}
                className="mt-2 rounded border border-cyan-300/40 px-2 py-1 text-cyan-100 disabled:opacity-50">
                Prepare companion actor
              </button> : null}
              <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.inspect-companion-actor" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy}
                onClick={companionActorPrepare.onInspect}
                className="mt-2 ml-2 rounded border border-cyan-300/40 px-2 py-1 text-cyan-100 disabled:opacity-50">
                Inspect companion actor
              </button>
              <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.cancel-companion-preparation" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy}
                onClick={companionActorPrepare.onCancel}
                className="mt-2 ml-2 rounded border border-rose-300/40 px-2 py-1 text-rose-100 disabled:opacity-50">
                Cancel companion preparation
              </button>
              {workflowStatus === "approved" &&
                companionActorPrepare.onConfirmStart &&
                companionActorPrepare.onIssueGrant &&
                companionActorPrepare.onPrepareInstall ? (
                <div className="mt-3 border-t border-cyan-300/20 pt-3">
                  <p className="font-semibold">Review the native companion session</p>
                  <p className="mt-1 text-slate-300">After the inert actor is current, confirm this reviewed Start, issue the short-lived native grant, then pair the separate Fabric bridge. The bridge first permits only owner-supplied kit pickup. It does not run a model program or move the companion. F10 stops the companion locally.</p>
                  <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.confirm-reviewed-start" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy || inspectionFailed}
                    onClick={companionActorPrepare.onConfirmStart}
                    className="mt-2 rounded border border-cyan-300/40 px-2 py-1 text-cyan-100 disabled:opacity-50">
                    Confirm reviewed Start
                  </button>
                  <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.issue-checked-native-grant" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy || inspectionFailed}
                    onClick={companionActorPrepare.onIssueGrant}
                    className="mt-2 ml-2 rounded border border-cyan-300/40 px-2 py-1 text-cyan-100 disabled:opacity-50">
                    Issue checked native grant
                  </button>
                  {companionActorPrepare.onConfigureWorldAuthority ? <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.set-reviewed-world-build-lease" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local"
                    type="button" disabled={busy || inspectionFailed}
                    onClick={companionActorPrepare.onConfigureWorldAuthority}
                    className="mt-2 ml-2 rounded border border-violet-300/40 px-2 py-1 text-violet-100 disabled:opacity-50">
                    Set reviewed world-build lease
                  </button> : null}
                  {companionActorPrepare.onAuthorizeWorldAuthority ? <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.authorize-reviewed-world-authority-connection" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local"
                    type="button" disabled={busy || inspectionFailed}
                    onClick={companionActorPrepare.onAuthorizeWorldAuthority}
                    className="mt-2 ml-2 rounded border border-violet-300/40 px-2 py-1 text-violet-100 disabled:opacity-50">
                    Authorize reviewed World Authority connection
                  </button> : null}
                  <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.pair-native-companion-for-kit-pickup" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy || inspectionFailed}
                    onClick={companionActorPrepare.onPrepareInstall}
                    className="mt-2 ml-2 rounded border border-cyan-300/40 px-2 py-1 text-cyan-100 disabled:opacity-50">
                    Pair native companion for kit pickup
                  </button>
                  {companionActorPrepare.onStartMission ? <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.start-mission-after-three-kit-stacks" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button"
                    disabled={busy || inspectionFailed}
                    onClick={companionActorPrepare.onStartMission}
                    className="mt-2 ml-2 rounded border border-cyan-300/40 px-2 py-1 text-cyan-100 disabled:opacity-50">
                    Start mission after three kit stacks
                  </button> : null}
                </div>
              ) : null}
              {companionActorPrepare.onInspectMission ? <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.inspect-mission-progress" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button"
                disabled={busy} onClick={companionActorPrepare.onInspectMission}
                className="mt-2 rounded border border-cyan-300/40 px-2 py-1 text-cyan-100 disabled:opacity-50">
                Inspect mission progress
              </button> : null}
              {companionActorPrepare.onStopMission ? <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.stop-companion-now" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button"
                disabled={companionActorPrepare.stopBusy}
                onClick={companionActorPrepare.onStopMission}
                className="mt-2 ml-2 rounded border border-rose-300/40 px-2 py-1 text-rose-100 disabled:opacity-50">
                Stop companion now
              </button> : null}
              {companionActorPrepare.onVerifyShelter ? <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.verify-finished-shelter" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button"
                disabled={busy} onClick={companionActorPrepare.onVerifyShelter}
                className="mt-2 ml-2 rounded border border-cyan-300/40 px-2 py-1 text-cyan-100 disabled:opacity-50">
                Verify finished shelter
              </button> : null}
            </div>
          ) : null}
          {workflowStatus === "approved" && hostedSourceStage ? (
            <div className="rounded border border-cyan-300/25 bg-cyan-400/5 p-3 text-xs">
              <p className="font-semibold">Connect the reviewed read-only Fabric world</p>
              <p className="mt-1 break-all">World folder: {hostedSourceStage.worldFolder}<br />
                Hosted room: {hostedSourceStage.hostedRoomId}<br />
                Local room: {hostedSourceStage.localRoomId}</p>
              <p className="mt-1 text-slate-300">Open the selected world and wait for server ticks first. Then stage a short-lived pairing code for its Fabric sensor. This does not start Minecraft or grant player or command actions.</p>
              <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.check-hosted-source-readiness" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy || inspectionFailed}
                onClick={hostedSourceStage.onPreflight}
                className="mt-2 mr-2 rounded border border-cyan-300/40 px-2 py-1 text-cyan-100 disabled:opacity-50">
                Check hosted source readiness
              </button>
              <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.stage-selected-world-source" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy || inspectionFailed}
                onClick={hostedSourceStage.onStage}
                className="mt-2 rounded border border-cyan-300/40 px-2 py-1 text-cyan-100 disabled:opacity-50">
                Stage selected world source
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-cyan-300/25 bg-cyan-400/5 p-2 text-xs">
            <p>{currentStepCount} of {projection.steps.length} steps current.
              {nextOwnerStep ? ` Next owner control: ${nextOwnerStep.label}.` : ""}</p>
            {nextOwnerStep && onOpenStep && workflowStatus !== "revoked" && workflowStatus !== "expired" ? (
              <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.on-open-step-next-owner-step-id" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy} onClick={() => onOpenStep(nextOwnerStep.id)}
                className="rounded border border-cyan-300/40 px-2 py-1 text-cyan-100 disabled:opacity-50">
                {workflowStatus === "approved" && nextOwnerStep.id === "room_authorization"
                  ? "Authorize room service" : nextOwnerStep.id === "discord_destination"
                    ? "Open Discord destination" : "Open next owner control"}
              </button>
            ) : null}
          </div>
          <ol className="space-y-2">
            {projection.steps.map(step => (
              <li key={step.id} className="rounded border border-white/10 p-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><strong>{step.label}</strong><span className="ml-2 text-slate-400">{stateLabels[step.state]}</span></div>
                  {step.actor === "owner" && onOpenStep ? (
                    <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.on-open-step-step-id" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy} onClick={() => onOpenStep(step.id)}
                      className="rounded border border-cyan-300/40 px-2 py-1 text-cyan-100 disabled:opacity-50">
                      {step.state === "satisfied" ? "View owner control" :
                        workflowStatus === "approved" && step.id === "room_authorization"
                          ? "Authorize room service" : step.id === "discord_destination"
                            ? "Open Discord destination" : "Open this step"}
                    </button>
                  ) : null}
                </div>
                {step.state !== "satisfied" && step.prerequisiteIds.length > 0 ? (() => {
                  const pending = projection.steps.filter(candidate =>
                    step.prerequisiteIds.includes(candidate.id) && candidate.state !== "satisfied");
                  return pending.length ? <p className="mt-1 text-amber-100">
                    First check: {pending.map(candidate => candidate.label).join("; ")}.
                  </p> : null;
                })() : null}
                {step.reasonCode ? <p className="mt-1 text-slate-400">Status: {
                  step.reasonCode === "responses_cost_budget_not_enforced_by_native_allowance"
                    ? "The existing native allowance counts calls but cannot enforce this request's cost cap."
                    : step.reasonCode === "responses_cost_budget_not_bound_to_contract"
                      ? "A native cost limit exists, but it is not bound to this reviewed contract."
                    : step.reasonCode === "responses_cost_budget_unknown_charge"
                      ? "A provider charge is uncertain. The native budget is paused until it is reconciled."
                    : step.reasonCode === "responses_cost_budget_exhausted"
                      ? "This contract's native Responses budget is spent. Review a new request for another session."
                    : step.reasonCode === "discord_personal_stream_native_required"
                      ? "This EXE has not admitted the personal Discord stream path for the selected destination."
                    : step.reasonCode === "responses_development_session_missing"
                      ? "No native development session is active for this profile."
                    : step.reasonCode === "responses_own_key_missing"
                      ? "The selected account has no saved OpenAI key available to this session."
                      : step.reasonCode === "room_ai_release_requires_exact_source_consent"
                        ? "This room ID cannot approve AI access to messages or a call. Review each exact source and its separate consent in Party Chat."
                      : step.reasonCode === "room_grant_recovery_pending"
                        ? "A saved program grant is still valid. CasimirBot is retrying room admission; reauthorization is not required by this status check."
                      : step.reasonCode === "room_not_found_for_native_account"
                        ? "The program's signed-in room account cannot see this exact room. Check which account owns the room before joining or approving its use."
                      : step.reasonCode === "room_not_found_for_local_account"
                        ? "This signed-in local account cannot see the selected local room. Check its owner and membership in Party Chat."
                      : step.reasonCode
                }</p> : null}
                {step.evidenceRef && step.validUntilMs ? <p className="mt-1 text-slate-400">
                  Checked via {step.evidenceRef}; refresh after {new Date(step.validUntilMs).toLocaleTimeString()}.
                </p> : null}
                {step.grantExpiresAtMs ? <p className="mt-1 text-slate-400">
                  Underlying grant expires {new Date(step.grantExpiresAtMs).toLocaleString()}.
                </p> : null}
              </li>
            ))}
          </ol>
        </section>
        {stepMessage ? <p role="status" className="rounded border border-cyan-300/25 p-2 text-xs text-cyan-100">
          {stepMessage}
        </p> : null}
        <div className="space-y-2 border-t border-white/10 pt-3 text-xs">
          <p>Approval authorizes only the displayed setup intent. Current grants are reused for the selected purposes; each action is checked by its owning service and policy.
            {startFullHarnessOnApprove ? " This approval also starts Full Harness for this owner session. Full Harness may remain on after the setup approval expires; stop it in Device Check. Pairing, room, Discord, Responses, and Minecraft permissions remain separate." : ""}</p>
          {connectionKind === "personal_stdio" && selected.has("full_harness") ? <p className="text-cyan-100">
            {target.maxAdditionalTasks
              ? `This setup approval applies only to the displayed account and installation until it expires. The reviewed pairing plan includes this Codex task and at most ${target.maxAdditionalTasks} additional client-declared tasks from the same MCP client for the selected Helix chat. CasimirBot cannot independently attest a later task ID. `
              : "This setup approval applies only to the displayed account, installation, and Codex task until it expires. If exact-task pairing is selected, this approval can issue its private invitation without another owner review; the task must still accept it. "}
            CasimirBot rechecks the personal device grant and local connection separately. Room, Discord, Minecraft, and provider actions keep their own authority checks.
          </p> : target.verifiedUpdateContinuation ? <p className="text-cyan-100">
            Until this approval expires, the exact selected setup purposes may be resumed on a verified private EXE update for this account, installation, Codex task and MCP client. CasimirBot rechecks the signed-in account, current package, Source, and each purpose's own grants before applying a setting. The displayed player duration and provider cost ceiling remain bounded by this approval. Stop or revoke the approval to prevent further continuation.
          </p> : selected.has("full_harness") ? <p className="text-cyan-100">
            Until this approval expires, a verified private EXE restart may start Full Harness automatically after CasimirBot rechecks your signed-in developer account, USB grant, and device trust. Stop tunnel or revoke this approval to prevent another automatic start. Room, Discord, Minecraft, pairing, and provider permissions keep their own checks.
          </p> : null}
          {connectionKind === "personal_stdio" && target.signedUpdateContinuation ?
            <p className="text-cyan-100">Until this approval expires, the exact selected purposes may continue after a newer CasimirBot release only when its installed EXE, app archive, and runtime match a release-key-signed manifest. This does not add targets, extend the lease, or bypass the current account, device, task, Codex grant, or each purpose's own permission checks. You can revoke this approval at any time.</p>
            : null}
          {roomAiConsentNeedsExactSource ? <p role="status" className="text-amber-200">
            Selecting room AI records only that you intend to review it. This approval does not release
            messages or calls. Review each exact source and its separate consent in Party Chat.
          </p> : null}
          {unboundBranches.length > 0 ? <p role="status" className="text-amber-200">
            {unboundBranches.length} selected purpose(s) are planned only. This approval cannot
            activate them without an exact target and a separate authority check.
          </p> : null}
          <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.if-review-ready-on-approve-review-revision" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={!reviewReady || target.scopeLines.length === 0}
            onClick={() => { if (reviewReady) onApprove?.(review!.revision); }}
            className="rounded border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Approving…" : startFullHarnessOnApprove
              ? "Approve scope and start Full Harness" : unboundBranches.length > 0
                ? "Approve exact scopes and save plan" : "Approve selected setup scope"}
          </button>
          {(workflowStatus === "pending_owner_review" || workflowStatus === "approved") && onRevoke ? (
            revokeArmed ? <div role="alert" className="mt-3 rounded border border-rose-300/60 bg-rose-950/50 p-3 text-sm text-rose-100">
              <p>{workflowStatus === "approved"
                ? "Revoking this approval ends contract-backed access. Restoring it requires a new owner review."
                : "Cancel this request? It cannot be approved afterward."}</p>
              <div className="mt-2 flex gap-2">
                <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.keep-this-request" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy} onClick={() => setRevokeArmed(false)}
                  className="rounded border border-slate-300/40 px-3 py-2">Keep this request</button>
                <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.on-revoke" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy} onClick={onRevoke}
                  className="rounded border border-rose-300/70 bg-rose-700/30 px-3 py-2 font-semibold disabled:opacity-50">
                  {workflowStatus === "approved" ? "Confirm revoke setup intent" : "Confirm cancel setup request"}
                </button>
              </div>
            </div> : <button data-helix-control-id="workstation.panel.agent-access.setup-contract-dialog.set-revoke-armed-true" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy} onClick={() => setRevokeArmed(true)}
              className="ml-2 rounded border border-rose-300/40 px-3 py-2 text-rose-100 disabled:opacity-50">
              {workflowStatus === "approved" ? "Revoke setup intent" : "Cancel setup request"}
            </button>
          ) : null}
          {!reviewReady && workflowStatus === "pending_owner_review" ?
            <p role="status" className="text-amber-200">A fresh owner review is required before this scope can be approved.</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
