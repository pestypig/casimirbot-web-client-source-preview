// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectHelixSetupContract } from "@shared/helix-setup-contract";
import { SetupContractDialog } from "../SetupContractDialog";

const nowMs = 1_800_000_000_000;
const target = {
  declaredSummary: "Pair this chat and share selected activity",
  account: "Developer account A",
  installation: "Desktop installation A",
  executableSha256: "b".repeat(64),
  packageSha256: "c".repeat(64),
  codexTask: "Exact Codex task A",
  mcpClientFingerprint: "a".repeat(12),
  helixChat: "Helix chat A",
  reviewUntil: "One hour to review",
  requestedLeaseSeconds: 900,
  approvalUntil: null,
  scopeLines: ["Full Harness for this task", "Read-only Discord stream to linked channel"],
};
const projection = () => projectHelixSetupContract({
  requestedBranches: ["task_pairing", "discord_stream"],
  facts: [{ stepId: "profile" as const, state: "satisfied" as const,
    observedAtMs: nowMs - 1_000, validUntilMs: nowMs + 60_000,
    evidenceRef: "receipt:profile" }], nowMs,
});

afterEach(() => cleanup());

describe("setup contract review dialog", () => {
  it("keeps Stop available while another companion request is busy", () => {
    const onStopMission = vi.fn();
    const mission = projectHelixSetupContract({
      requestedBranches: ["companion_mission"], facts: [], nowMs });
    const props = { open: true, onOpenChange: vi.fn(), projection: mission,
      target, review: null, nowMs, workflowStatus: "approved" as const,
      companionActorPrepare: { onPrepare: vi.fn(), onInspect: vi.fn(),
        onCancel: vi.fn(), onStartMission: vi.fn(), onStopMission } };
    const view = render(<SetupContractDialog {...props} busy />);
    const stop = screen.getByRole("button", { name: "Stop companion now" });
    expect((stop as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(stop);
    expect(onStopMission).toHaveBeenCalledOnce();
    view.rerender(<SetupContractDialog {...props} busy companionActorPrepare={{
      ...props.companionActorPrepare, stopBusy: true }} />);
    expect(screen.getByRole("button", { name: "Stop companion now" })
      .hasAttribute("disabled")).toBe(true);
  });
  it("offers inert actor preparation only after the exact mission review", () => {
    const onPrepare = vi.fn();
    const onInspect = vi.fn();
    const onCancel = vi.fn();
    const mission = projectHelixSetupContract({
      requestedBranches: ["companion_mission"], facts: [], nowMs });
    const props = { open: true, onOpenChange: vi.fn(), projection: mission,
      target, review: null, nowMs,
      companionActorPrepare: { onPrepare, onInspect, onCancel } };
    const view = render(<SetupContractDialog {...props}
      workflowStatus="pending_owner_review" />);
    expect(screen.queryByRole("button", { name: "Prepare companion actor" }))
      .toBeNull();
    view.rerender(<SetupContractDialog {...props} workflowStatus="approved" />);
    expect(screen.getByText(/grants no movement, inventory access, block placement/))
      .toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Prepare companion actor" }));
    expect(onPrepare).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Inspect companion actor" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel companion preparation" }));
    expect(onInspect).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
  it("keeps native grant and kit-only install behind the approved review", () => {
    const onConfirmStart = vi.fn();
    const onIssueGrant = vi.fn();
    const onPrepareInstall = vi.fn();
    const mission = projectHelixSetupContract({
      requestedBranches: ["companion_mission"], facts: [], nowMs });
    const props = { open: true, onOpenChange: vi.fn(), projection: mission,
      target, review: null, nowMs,
      companionActorPrepare: { onPrepare: vi.fn(), onInspect: vi.fn(),
        onCancel: vi.fn(), onConfirmStart, onIssueGrant,
        onPrepareInstall } };
    const view = render(<SetupContractDialog {...props}
      workflowStatus="pending_owner_review" />);
    expect(screen.queryByRole("button", { name: "Issue checked native grant" }))
      .toBeNull();
    view.rerender(<SetupContractDialog {...props} workflowStatus="approved" />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm reviewed Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Issue checked native grant" }));
    fireEvent.click(screen.getByRole("button", {
      name: "Pair native companion for kit pickup" }));
    expect(onConfirmStart).toHaveBeenCalledOnce();
    expect(onIssueGrant).toHaveBeenCalledOnce();
    expect(onPrepareInstall).toHaveBeenCalledOnce();
    expect(screen.getByText(/does not run a model program or move the companion/))
      .toBeTruthy();
  });
  it("shows the exact read-only hosted source handoff only after approval", () => {
    const source = { hostedRoomId: "shared_realtime_room:hosted-fixture",
      localRoomId: "shared_realtime_room:local-fixture",
      worldFolder: "reviewed-world", onPreflight: vi.fn(), onStage: vi.fn() };
    const room = projectHelixSetupContract({ requestedBranches: ["shared_room"],
      connectionKind: "personal_stdio", roomAuthority: "hosted", facts: [], nowMs });
    const props = { open: true, onOpenChange: vi.fn(), projection: room,
      target, review: null, connectionKind: "personal_stdio" as const,
      hostedSourceStage: source, nowMs };
    const view = render(<SetupContractDialog {...props}
      workflowStatus="pending_owner_review" />);
    expect(screen.queryByRole("button", { name: "Stage selected world source" }))
      .toBeNull();
    view.rerender(<SetupContractDialog {...props} workflowStatus="approved" />);
    expect(screen.getByText(/World folder: reviewed-world/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check hosted source readiness" }));
    expect(source.onPreflight).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Stage selected world source" }));
    expect(source.onStage).toHaveBeenCalledTimes(1);
  });
  it("explains the bounded signed-update opt-in on a personal review", () => {
    const personal = projectHelixSetupContract({
      requestedBranches: ["full_harness", "task_pairing"],
      connectionKind: "personal_stdio", facts: [], nowMs });
    render(<SetupContractDialog open workflowStatus="pending_owner_review"
      onOpenChange={vi.fn()} projection={personal}
      target={{ ...target, signedUpdateContinuation: true }}
      review={{ revision: "current", requestedBranches: ["full_harness", "task_pairing"],
        reviewableUntilMs: nowMs + 30_000, canApprove: true }}
      connectionKind="personal_stdio" onApprove={vi.fn()} nowMs={nowMs} />);
    expect(screen.getByText(/installed EXE, app archive, and runtime match a release-key-signed manifest/))
      .toBeTruthy();
  });
  it("lets the owner select every reviewable purpose before approving once", () => {
    const available = ["full_harness", "task_pairing", "shared_room",
      "room_ai_release", "discord_stream", "minecraft_player",
      "responses_session"] as const;
    const change = vi.fn();
    const personal = projectHelixSetupContract({ requestedBranches: ["full_harness"],
      connectionKind: "personal_stdio", facts: [], nowMs });
    render(<SetupContractDialog open workflowStatus="pending_owner_review"
      onOpenChange={vi.fn()} projection={personal} target={target}
      review={{ revision: "current", requestedBranches: ["full_harness"],
        reviewableUntilMs: nowMs + 30_000, canApprove: true }}
      availableBranches={available} onSelectionChange={change}
      connectionKind="personal_stdio" onApprove={vi.fn()} nowMs={nowMs} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all available purposes" }));
    expect(change).toHaveBeenCalledWith(available);
    expect(screen.getByRole("button", { name: "Approve selected setup scope" })
      .hasAttribute("disabled")).toBe(true);
  });
  it("shows all planned purposes but identifies those without exact authority", () => {
    const branches = ["full_harness", "task_pairing", "shared_room",
      "room_ai_release", "discord_stream", "minecraft_player",
      "responses_session"] as const;
    const personal = projectHelixSetupContract({ requestedBranches: branches,
      connectionKind: "personal_stdio", facts: [], nowMs });
    render(<SetupContractDialog open workflowStatus="pending_owner_review"
      onOpenChange={vi.fn()} projection={personal} target={target}
      review={{ revision: "current", requestedBranches: branches,
        reviewableUntilMs: nowMs + 30_000, canApprove: true }}
      availableBranches={branches}
      unboundBranches={["shared_room", "room_ai_release", "discord_stream",
        "minecraft_player", "responses_session"]}
      connectionKind="personal_stdio" onApprove={vi.fn()} nowMs={nowMs} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    expect(screen.getAllByText(/no exact target or authority is bound yet/))
      .toHaveLength(5);
    expect(screen.getByText(/A planned purpose is not an access grant/)).toBeTruthy();
    expect(screen.getByText(/5 selected purpose\(s\) are planned only/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve exact scopes and save plan" }))
      .toBeTruthy();
  });
  it("describes the ordinary personal connection without developer USB instructions", () => {
    const personal = projectHelixSetupContract({ requestedBranches: ["full_harness"],
      connectionKind: "personal_stdio", facts: [], nowMs });
    render(<SetupContractDialog open workflowStatus="approved" onOpenChange={vi.fn()}
      projection={personal} target={target} review={null} connectionKind="personal_stdio"
      nowMs={nowMs} />);
    expect(screen.getByText(/device approval and local Codex access/)).toBeTruthy();
    expect(screen.getByText(/rechecks the personal device grant and local connection/)).toBeTruthy();
    expect(screen.getByText("Connect this task through personal Codex MCP")).toBeTruthy();
    expect(screen.getByText(/this approval can issue its private invitation without another owner review/i))
      .toBeTruthy();
    expect(screen.queryByText(/signed-in developer account, USB grant/)).toBeNull();
  });

  it("makes a proposed additional-task limit and client-declared identity explicit", () => {
    const personal = projectHelixSetupContract({ requestedBranches: ["full_harness", "task_pairing"],
      connectionKind: "personal_stdio", facts: [], nowMs });
    render(<SetupContractDialog open workflowStatus="pending_owner_review" onOpenChange={vi.fn()}
      projection={personal} target={{ ...target, maxAdditionalTasks: 2 }} review={null}
      connectionKind="personal_stdio" nowMs={nowMs} />);
    expect(screen.getByText(/at most 2 additional client-declared tasks/)).toBeTruthy();
    expect(screen.getByText(/cannot independently attest a later task ID/)).toBeTruthy();
    expect(screen.queryByText(/applies only to the displayed account, installation, and Codex task/))
      .toBeNull();
  });

  it("shows exact targets and individual missing authorization steps", () => {
    const openStep = vi.fn();
    render(<SetupContractDialog open workflowStatus="pending_owner_review" onOpenChange={vi.fn()} projection={projection()}
      target={target} review={null} onOpenStep={openStep} nowMs={nowMs} />);
    expect(screen.getByRole("dialog", { name: "Review CasimirBot setup contract" })).toBeTruthy();
    expect(screen.getByText("Exact Codex task A")).toBeTruthy();
    expect(screen.getByText("b".repeat(64))).toBeTruthy();
    expect(screen.getByText(/Codex-proposed purpose:/)).toBeTruthy();
    expect(screen.getByText("Helix chat A")).toBeTruthy();
    expect(screen.getByText("One hour to review")).toBeTruthy();
    expect(screen.getByText("15 minutes after approval")).toBeTruthy();
    expect(screen.getByText("Read-only Discord stream to linked channel")).toBeTruthy();
    expect(screen.getByText(/Checked via receipt:profile/)).toBeTruthy();
    expect(screen.getByText("Review the exact task and Helix chat invitation")).toBeTruthy();
    expect(screen.getByText("Review the exact task and Helix chat invitation")
      .closest("li")?.textContent).toContain("First check: Register this task or reuse its accepted pairing.");
    expect(screen.getByText("Approve selected setup scope").hasAttribute("disabled")).toBe(true);
    const ownerStep = screen.getByText("Activate the local developer grant if required")
      .closest("li")!;
    expect(screen.getByText(/1 of 13 steps current/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open next owner control" }));
    expect(openStep).toHaveBeenCalledWith("mcp_source");
    fireEvent.click(ownerStep.querySelector("button")!);
    expect(openStep).toHaveBeenCalledWith("developer_grant");
  });

  it("shows an exact 24-hour eligibility term for owner review", () => {
    render(<SetupContractDialog open workflowStatus="pending_owner_review" onOpenChange={vi.fn()}
      projection={projection()} target={{ ...target, requestedLeaseSeconds: 86_400 }}
      review={null} nowMs={nowMs} />);
    expect(screen.getByText("24 hours after approval")).toBeTruthy();
  });

  it("pauses an ordinary approval when the latest owner inspection fails", () => {
    const approve = vi.fn();
    const personal = projectHelixSetupContract({ requestedBranches: ["full_harness"],
      connectionKind: "personal_stdio", facts: [], nowMs });
    const review = { revision: "current-review", requestedBranches: ["full_harness"] as const,
      reviewableUntilMs: nowMs + 30_000, canApprove: true };
    const { rerender } = render(<SetupContractDialog open workflowStatus="pending_owner_review"
      onOpenChange={vi.fn()} projection={personal} target={target} review={review}
      connectionKind="personal_stdio" onApprove={approve} nowMs={nowMs} />);
    const button = screen.getByRole("button", { name: "Approve selected setup scope" });
    expect(button.hasAttribute("disabled")).toBe(false);
    rerender(<SetupContractDialog open workflowStatus="pending_owner_review"
      onOpenChange={vi.fn()} projection={personal} target={target} review={review}
      connectionKind="personal_stdio" inspectionFailed onApprove={approve} nowMs={nowMs} />);
    expect(screen.getByText(/latest owner read failed/)).toBeTruthy();
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(approve).not.toHaveBeenCalled();
  });

  it("discloses selected-scope reuse only for an explicit verified-update review", () => {
    const { rerender } = render(<SetupContractDialog open
      workflowStatus="pending_owner_review" onOpenChange={vi.fn()}
      projection={projection()} target={{ ...target, requestedLeaseSeconds: 86_400 }}
      review={null} nowMs={nowMs} />);
    expect(screen.queryByText(/exact selected setup purposes may be resumed/)).toBeNull();
    rerender(<SetupContractDialog open workflowStatus="pending_owner_review"
      onOpenChange={vi.fn()} projection={projection()}
      target={{ ...target, requestedLeaseSeconds: 86_400,
        verifiedUpdateContinuation: true }} review={null} nowMs={nowMs} />);
    expect(screen.getByText(/exact selected setup purposes may be resumed/)).toBeTruthy();
    expect(screen.getByText(/displayed player duration and provider cost ceiling/)).toBeTruthy();
  });

  it("reviews the six concurrent setup purposes in one current revision", () => {
    const branches = ["full_harness", "task_pairing", "shared_room", "discord_stream",
      "minecraft_player", "responses_session"] as const;
    const approve = vi.fn();
    const sixScopeProjection = projectHelixSetupContract({
      requestedBranches: branches, facts: [], nowMs, roomAuthority: "local",
    });
    render(<SetupContractDialog open workflowStatus="pending_owner_review"
      onOpenChange={vi.fn()} projection={sixScopeProjection}
      target={{ ...target, requestedLeaseSeconds: 86_400 }}
      review={{ revision: "revision-six", requestedBranches: branches,
        reviewableUntilMs: nowMs + 30_000, canApprove: true }}
      onApprove={approve} nowMs={nowMs} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    expect(screen.getByRole("checkbox", { name: "Pair this Codex task with one Helix chat" })).toBeTruthy();
    expect(screen.getByText("Verify the runtime binding")).toBeTruthy();
    expect(screen.getByText("Approve bounded player capabilities and duration")).toBeTruthy();
    expect(screen.getByText("Verify the bounded Responses session")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve selected setup scope" }));
    expect(approve).toHaveBeenCalledWith("revision-six");
  });

  it("does not direct the owner past an unfinished Codex prerequisite", () => {
    const openStep = vi.fn();
    const allBaseSteps = ["profile", "developer_grant", "transport", "mcp_source",
      "task_presence"] as const;
    const waitingForCodex = projectHelixSetupContract({
      requestedBranches: ["task_pairing"], nowMs,
      facts: allBaseSteps.map(stepId => ({ stepId, state: "satisfied" as const,
        observedAtMs: nowMs - 1_000, validUntilMs: nowMs + 60_000,
        evidenceRef: `current:${stepId}` })),
    });
    render(<SetupContractDialog open workflowStatus="pending_owner_review"
      onOpenChange={vi.fn()} projection={waitingForCodex} target={target}
      review={null} onOpenStep={openStep} nowMs={nowMs} />);
    expect(screen.queryByRole("button", { name: "Open next owner control" })).toBeNull();
    expect(screen.getByText("Review the exact task and Helix chat invitation")
      .closest("li")?.textContent).toContain("First check: Register this task or reuse its accepted pairing.");
  });

  it("keeps a blocked owner row visible without calling it the next control", () => {
    const allButBudget = ["profile", "developer_grant", "transport", "mcp_source",
      "task_presence", "responses_native_allowance", "responses_provider"] as const;
    const responses = projectHelixSetupContract({
      requestedBranches: ["responses_session"], nowMs,
      facts: [
        ...allButBudget.map(stepId => ({ stepId, state: "satisfied" as const,
          observedAtMs: nowMs - 1_000, validUntilMs: nowMs + 60_000,
          evidenceRef: `current:${stepId}` })),
        { stepId: "responses_budget" as const, state: "blocked" as const,
          observedAtMs: nowMs - 1_000, validUntilMs: nowMs + 60_000,
          evidenceRef: "native:cost-cap", reasonCode: "responses_cost_budget_not_enforced_by_native_allowance" },
      ],
    });
    render(<SetupContractDialog open workflowStatus="pending_owner_review"
      onOpenChange={vi.fn()} projection={responses} target={target}
      review={null} onOpenStep={vi.fn()} nowMs={nowMs} />);
    expect(screen.queryByRole("button", { name: "Open next owner control" })).toBeNull();
    expect(screen.getByText("Approve the bounded Responses operation budget")
      .closest("li")?.textContent).toContain("Blocked");
  });

  it("lets the owner remove an optional branch without changing authority", () => {
    const change = vi.fn();
    render(<SetupContractDialog open workflowStatus="pending_owner_review" onOpenChange={vi.fn()} projection={projection()}
      target={target} review={null} onSelectionChange={change} nowMs={nowMs} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Share approved read-only activity to Discord" }));
    expect(change).toHaveBeenCalledWith(["task_pairing"]);
    expect(screen.queryByRole("checkbox", { name: "Review separate room AI consent" })).toBeNull();
    expect(screen.getByText(/Room message and call access is reviewed per exact source/)).toBeTruthy();
  });

  it("lets the owner reselect proposed room AI review intent without releasing content", () => {
    const change = vi.fn();
    render(<SetupContractDialog open workflowStatus="pending_owner_review"
      onOpenChange={vi.fn()} projection={projection()} target={target} review={null}
      onSelectionChange={change}
      availableBranches={["task_pairing", "discord_stream", "room_ai_release"]}
      nowMs={nowMs} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Review separate room AI consent" }));
    expect(change).toHaveBeenCalledWith(["task_pairing", "room_ai_release", "discord_stream"]);
    expect(screen.getByText(/Room message and call access is reviewed per exact source/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve selected setup scope" })
      .hasAttribute("disabled")).toBe(true);
  });

  it("rejects stale reviews and approves only the supplied current revision", () => {
    const approve = vi.fn();
    const { rerender } = render(<SetupContractDialog open workflowStatus="pending_owner_review" onOpenChange={vi.fn()}
      projection={projection()} target={target} onApprove={approve} nowMs={nowMs}
      review={{ revision: "revision-1", requestedBranches: ["task_pairing", "discord_stream"],
        reviewableUntilMs: nowMs, canApprove: true }} />);
    const button = screen.getByRole("button", { name: "Approve selected setup scope" });
    expect(button.hasAttribute("disabled")).toBe(true);
    rerender(<SetupContractDialog open workflowStatus="pending_owner_review" onOpenChange={vi.fn()} projection={projection()}
      target={target} onApprove={approve} nowMs={nowMs}
      review={{ revision: "revision-2", requestedBranches: ["task_pairing", "discord_stream"],
        reviewableUntilMs: nowMs + 30_000, canApprove: true }} />);
    fireEvent.click(button);
    expect(approve).toHaveBeenCalledOnce();
    expect(approve).toHaveBeenCalledWith("revision-2");
  });

  it("cannot approve a review without an exact scope", () => {
    const approve = vi.fn();
    render(<SetupContractDialog open workflowStatus="pending_owner_review" onOpenChange={vi.fn()} projection={projection()}
      target={{ ...target, scopeLines: [] }} onApprove={approve} nowMs={nowMs}
      review={{ revision: "revision-2", requestedBranches: ["task_pairing", "discord_stream"],
        reviewableUntilMs: nowMs + 30_000, canApprove: true }} />);
    expect(screen.getByRole("button", { name: "Approve selected setup scope" }).hasAttribute("disabled"))
      .toBe(true);
    expect(approve).not.toHaveBeenCalled();
  });

  it("approves room AI review intent while exact-source release stays blocked", () => {
    const approve = vi.fn(), change = vi.fn(), openStep = vi.fn();
    const roomProjection = projectHelixSetupContract({
      requestedBranches: ["task_pairing", "room_ai_release"], facts: [], nowMs,
    });
    render(<SetupContractDialog open workflowStatus="pending_owner_review"
      onOpenChange={vi.fn()} projection={roomProjection} target={target}
      review={{ revision: "revision-room", requestedBranches: ["task_pairing", "room_ai_release"],
        reviewableUntilMs: nowMs + 30_000, canApprove: true }}
      onApprove={approve} onSelectionChange={change} onOpenStep={openStep} nowMs={nowMs} />);
    expect(screen.getByRole("button", { name: "Approve selected setup scope" })
      .hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/This approval does not release/)).toBeTruthy();
    expect(screen.getByText("Review separate room AI consent for exact sources")
      .closest("li")?.textContent).toContain("Blocked");
    fireEvent.click(screen.getByRole("button", { name: "Approve selected setup scope" }));
    expect(approve).toHaveBeenCalledWith("revision-room");
    expect(change).not.toHaveBeenCalled();
  });

  it("allows room-AI-only review intent without implying content access", () => {
    const roomProjection = projectHelixSetupContract({
      requestedBranches: ["room_ai_release"], facts: [], nowMs,
    });
    render(<SetupContractDialog open workflowStatus="pending_owner_review"
      onOpenChange={vi.fn()} projection={roomProjection} target={target}
      review={{ revision: "revision-room", requestedBranches: ["room_ai_release"],
        reviewableUntilMs: nowMs + 30_000, canApprove: true }}
      onApprove={vi.fn()} onRevoke={vi.fn()} onSelectionChange={vi.fn()} nowMs={nowMs} />);
    expect(screen.getByText(/Selecting room AI records only that you intend to review it/))
      .toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel setup request" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve selected setup scope" })
      .hasAttribute("disabled")).toBe(false);
  });

  it.each([
    ["pending_owner_review", "Cancel setup request"],
    ["approved", "Revoke setup intent"],
  ] as const)("requires an explicit second step to stop the %s workflow", (workflowStatus, label) => {
    const revoke = vi.fn();
    render(<SetupContractDialog open workflowStatus={workflowStatus}
      onOpenChange={vi.fn()} projection={projection()} target={target}
      review={null} onRevoke={revoke} nowMs={nowMs} />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep this request" }));
    expect(revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: label }));
    fireEvent.click(screen.getByRole("button", { name: workflowStatus === "approved"
      ? "Confirm revoke setup intent" : "Confirm cancel setup request" }));
    expect(revoke).toHaveBeenCalledOnce();
    expect(screen.getByText("Sign in to the intended CasimirBot profile")
      .closest("li")?.textContent).toContain("Current");
  });

  it("requires a new review revision after optional scope changes", () => {
    const approve = vi.fn(), change = vi.fn();
    const oldReview = { revision: "revision-1", requestedBranches: ["task_pairing", "discord_stream"] as const,
      reviewableUntilMs: nowMs + 30_000, canApprove: true };
    const { rerender } = render(<SetupContractDialog open workflowStatus="pending_owner_review" onOpenChange={vi.fn()}
      projection={projection()} target={target} review={oldReview} onApprove={approve}
      onSelectionChange={change} nowMs={nowMs} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Share approved read-only activity to Discord" }));
    expect(screen.getByRole("button", { name: "Approve selected setup scope" }).hasAttribute("disabled"))
      .toBe(true);
    const narrower = projectHelixSetupContract({ requestedBranches: ["task_pairing"], facts: [], nowMs });
    rerender(<SetupContractDialog open workflowStatus="pending_owner_review" onOpenChange={vi.fn()} projection={narrower}
      target={{ ...target, scopeLines: ["Full Harness for this task"] }} review={oldReview}
      onApprove={approve} onSelectionChange={change} nowMs={nowMs} />);
    expect(screen.getByRole("button", { name: "Approve selected setup scope" }).hasAttribute("disabled"))
      .toBe(true);
    rerender(<SetupContractDialog open workflowStatus="pending_owner_review" onOpenChange={vi.fn()} projection={narrower}
      target={{ ...target, scopeLines: ["Full Harness for this task"] }}
      review={{ revision: "revision-2", requestedBranches: ["task_pairing"],
        reviewableUntilMs: nowMs + 30_000, canApprove: true }}
      onApprove={approve} onSelectionChange={change} nowMs={nowMs} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve selected setup scope" }));
    expect(approve).toHaveBeenCalledWith("revision-2");
  });

  it.each(["revoked", "expired"] as const)(
    "keeps independent grant observations visible when the setup request is %s", workflowStatus => {
      const approve = vi.fn(), openStep = vi.fn(), change = vi.fn();
      render(<SetupContractDialog open workflowStatus={workflowStatus}
        onOpenChange={vi.fn()} projection={projection()} target={target}
        review={{ revision: "revision-2", requestedBranches: ["task_pairing", "discord_stream"],
          reviewableUntilMs: nowMs + 30_000, canApprove: true }}
        onApprove={approve} onOpenStep={openStep} onSelectionChange={change} nowMs={nowMs} />);
      expect(screen.getByText(`This setup request is ${workflowStatus}.`, { exact: false })).toBeTruthy();
      expect(screen.getByText("Sign in to the intended CasimirBot profile")
        .closest("li")?.textContent).toContain("Current");
      const currentProfile = screen.getByText("Sign in to the intended CasimirBot profile")
        .closest("li")!;
      fireEvent.click(currentProfile.querySelector("button")!);
      expect(openStep).toHaveBeenCalledWith("profile");
      expect(screen.getByRole("button", { name: "View owner control" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Revoke setup intent" })).toBeNull();
      expect(screen.getByRole("button", { name: "Approve selected setup scope" })
        .hasAttribute("disabled")).toBe(true);
      expect((screen.getByRole("checkbox", {
        name: "Share approved read-only activity to Discord" }) as HTMLInputElement).disabled)
        .toBe(true);
      expect(approve).not.toHaveBeenCalled();
      expect(change).not.toHaveBeenCalled();
    });
});
