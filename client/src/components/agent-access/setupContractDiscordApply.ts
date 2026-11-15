import { helixCodexConsoleFrameSchema } from "@shared/helix-codex-mirror-frame";
import { discordStreamSourceRefSchema } from "@shared/discord-stream-selection";
import type { HelixSetupContractIntent } from "@shared/helix-setup-contract-intent";
import { projectCurrentDiscordStreamFacts, setupContractDiscordRoomId } from
  "@shared/helix-setup-contract-discord-facts";

type DiscordScope = Extract<HelixSetupContractIntent["scopes"][number],
  { branch: "discord_stream" }>;
type LocalGrant = { sourceRef: string; title: string };
type NativeGrants = (request: unknown) => Promise<unknown>;
type RemoteControl = (roomId: string, operation: string,
  request?: unknown) => Promise<unknown>;

/** The owner contract selects a snapshot; the Float owns its fresh activity baseline. */
export async function applyApprovedSetupContractDiscord(input: {
  requestId?: string;
  profileRef: string;
  scope: DiscordScope;
  nativeGrants: NativeGrants;
  remoteControl: RemoteControl;
  approvalCurrent: () => Promise<boolean>;
  nowMs?: () => number;
}): Promise<"already_current" | "resume_ready"> {
  const now = input.nowMs ?? Date.now;
  const roomId = setupContractDiscordRoomId(input.scope.destination_ref);
  if (!roomId || input.scope.source_refs.some(ref =>
      !discordStreamSourceRefSchema.safeParse(ref).success))
    throw new Error("setup_contract_discord_scope_invalid");
  const requireApproval = async () => {
    if (!await input.approvalCurrent())
      throw new Error("setup_contract_discord_approval_changed");
  };
  await requireApproval();
  const readGrants = async () => {
    const rawLocal = await input.nativeGrants({ operation: "list" }) as {
      status?: unknown; profileRef?: unknown; deviceRef?: unknown;
      grants?: unknown;
    };
    if (rawLocal?.status !== "ready" ||
        rawLocal.profileRef !== input.profileRef ||
        typeof rawLocal.deviceRef !== "string" ||
        !/^desktop:[a-f0-9]{64}$/u.test(rawLocal.deviceRef) ||
        !Array.isArray(rawLocal.grants))
      throw new Error("setup_contract_discord_local_grants_unavailable");
    const grants = rawLocal.grants.filter((row): row is LocalGrant =>
      row && typeof row === "object" &&
      typeof row.sourceRef === "string" &&
      typeof row.title === "string" && row.title.length > 0 &&
      row.title.length <= 120);
    if (grants.length !== rawLocal.grants.length ||
        new Set(grants.map(row => row.sourceRef)).size !== grants.length)
      throw new Error("setup_contract_discord_local_grants_ambiguous");
    return { deviceRef: rawLocal.deviceRef, grants };
  };
  let { deviceRef, grants } = await readGrants();
  const selectedRefs = [...input.scope.source_refs].sort();
  if (input.scope.selection_mode === "all_approved" &&
      grants.some(row => !selectedRefs.includes(row.sourceRef)))
    throw new Error("setup_contract_discord_all_snapshot_changed");
  const missing = selectedRefs.filter(ref =>
    !grants.some(row => row.sourceRef === ref));
  if (missing.length && input.requestId) {
    for (const sourceRef of missing) {
      await requireApproval();
      const granted = await input.nativeGrants({ operation: "grant-contract",
        requestId: input.requestId, sourceRef }) as { status?: unknown;
          grant?: { sourceRef?: unknown } };
      if (granted?.status !== "ready" || granted.grant?.sourceRef !== sourceRef)
        throw new Error("setup_contract_discord_exact_chat_grant_unavailable");
    }
    const refreshed = await readGrants();
    if (refreshed.deviceRef !== deviceRef)
      throw new Error("setup_contract_discord_local_grants_changed");
    grants = refreshed.grants;
  }
  if (input.scope.selection_mode === "all_approved" &&
      (grants.length !== selectedRefs.length ||
       grants.some(row => !selectedRefs.includes(row.sourceRef))))
    throw new Error("setup_contract_discord_all_snapshot_changed");
  const selected = selectedRefs.map(ref => grants.find(row => row.sourceRef === ref));
  if (selected.some(row => !row))
    throw new Error("setup_contract_discord_exact_chat_grant_missing");
  for (const grant of selected as LocalGrant[]) {
    const rawRead = await input.nativeGrants({ operation: "read",
      sourceRef: grant.sourceRef }) as { status?: unknown; frame?: unknown };
    const frame = helixCodexConsoleFrameSchema.safeParse(rawRead?.frame);
    if (rawRead?.status !== "ready" || !frame.success ||
        frame.data.helixConversationId !== grant.sourceRef)
      throw new Error("setup_contract_discord_exact_chat_unavailable");
  }
  const mode = input.scope.selection_mode === "all_approved" ? "all" : "selected";
  const rawResume = await input.nativeGrants({ operation: "resume-read", roomId }) as {
    status?: unknown; selection?: { mode?: unknown; sourceRefs?: unknown;
      expiresAt?: unknown; durationHours?: unknown } | null;
  };
  if (rawResume?.status !== "ready")
    throw new Error("setup_contract_discord_resume_unavailable");
  const resume = rawResume.selection;
  if (resume && resume.mode === mode &&
      Array.isArray(resume.sourceRefs) &&
      resume.sourceRefs.length === selectedRefs.length &&
      [...resume.sourceRefs].sort().every((ref, index) => ref === selectedRefs[index]) &&
      typeof resume.expiresAt === "string" &&
      Date.parse(resume.expiresAt) > now() &&
      resume.durationHours === input.scope.duration_hours) {
    await requireApproval();
    return "resume_ready";
  }
  const inspected = await input.remoteControl(roomId, "discord_stream_inspect") as {
    active?: unknown; revision?: unknown; device_ref?: unknown;
    selection?: { mode?: unknown; source_refs?: unknown } | null;
  };
  const currentFacts = projectCurrentDiscordStreamFacts(inspected, now(),
    input.scope, deviceRef);
  if (currentFacts.some(fact => fact.stepId === "discord_snapshot_approval" &&
      fact.state === "satisfied")) return "already_current";
  if (!Number.isSafeInteger(inspected?.revision) ||
      (inspected.revision as number) < 0)
    throw new Error("setup_contract_discord_stream_revision_unavailable");
  for (const grant of selected as LocalGrant[]) {
    await requireApproval();
    await input.remoteControl(roomId, "discord_stream_grant", {
      device_ref: deviceRef, source_ref: grant.sourceRef,
      title: grant.title, granted: true,
    });
  }
  await requireApproval();
  const rawSelection = await input.remoteControl(roomId, "discord_stream_select", {
    device_ref: deviceRef, expected_revision: inspected.revision,
    selection: { mode, source_refs: selectedRefs },
    proposal_id: null, duration_hours: input.scope.duration_hours,
  }) as { revision?: unknown; approval_id?: unknown;
    approval_expires_at?: unknown; approval_duration_hours?: unknown };
  if (!Number.isSafeInteger(rawSelection?.revision) ||
      typeof rawSelection.approval_id !== "string" ||
      typeof rawSelection.approval_expires_at !== "string" ||
      !(Date.parse(rawSelection.approval_expires_at) > now()) ||
      rawSelection.approval_duration_hours !== input.scope.duration_hours) {
    if (Number.isSafeInteger(rawSelection?.revision))
      await input.remoteControl(roomId, "discord_stream_stop", {
        device_ref: deviceRef, expected_revision: rawSelection.revision,
      }).catch(() => null);
    throw new Error("setup_contract_discord_selection_receipt_invalid");
  }
  const revision = rawSelection.revision as number;
  const stop = async () => input.remoteControl(roomId, "discord_stream_stop", {
    device_ref: deviceRef, expected_revision: revision,
  });
  try {
    await requireApproval();
    const saved = await input.nativeGrants({ operation: "resume-save", roomId,
      selection: { mode, sourceRefs: selectedRefs,
        approvalId: rawSelection.approval_id,
        expiresAt: rawSelection.approval_expires_at,
        durationHours: input.scope.duration_hours } }) as { status?: unknown };
    if (saved?.status !== "ready")
      throw new Error("setup_contract_discord_resume_save_failed");
    // No publisher owns this revision. Retire it and let the Float resume
    // from its existing source-specific baseline before any post is possible.
    await stop().catch(() => null);
    const afterStop = await input.remoteControl(roomId, "discord_stream_inspect") as {
      active?: unknown;
    };
    if (afterStop?.active !== false &&
        !projectCurrentDiscordStreamFacts(afterStop, now(), input.scope, deviceRef)
          .some(fact => fact.stepId === "discord_snapshot_approval" &&
            fact.state === "satisfied"))
      throw new Error("setup_contract_discord_stop_unconfirmed");
    await requireApproval();
    return "resume_ready";
  } catch (error) {
    await input.nativeGrants({ operation: "resume-clear", roomId }).catch(() => null);
    await stop().catch(() => null);
    throw error;
  }
}
