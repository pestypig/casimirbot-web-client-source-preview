import React from "react";
import { z } from "zod";
import { parseDesktopMcpTunnelState, type DesktopMcpTunnelState } from "@shared/desktop-mcp-tunnel";
import { DESKTOP_AUTH0_PROGRAM_CONNECTION_START_PATH, DESKTOP_AUTH0_ROOM_CONNECTION_STATUS_PATH,
  DESKTOP_AUTH0_ROOM_CONTROL_PATH, parseDesktopAuth0AccountLinkStartReceipt,
  parseDesktopAuth0AccountLinkCompletion } from
  "@shared/desktop-auth0-account-link";
import { helixSetupContractBranchSchema, helixSetupContractScopeSchema } from
  "@shared/helix-setup-contract-intent";
import { discordPersonalSessionIdFromStreamId, discordPersonalSessionIdSchema } from
  "@shared/discord-stream-selection";
import {
  projectHelixSetupContract,
  setupContractStepGuidance,
  type HelixSetupContractBranch,
  type HelixSetupContractFact,
} from "@shared/helix-setup-contract";
import { requestWorkstationGuidance, HELIX_WORKSTATION_GUIDANCE_EVENT } from
  "@/lib/workstation/workstationGuidance";
import { requestExactRoomReviewNavigation } from
  "@/lib/workstation/exactRoomReviewNavigation";
import { SetupContractDialog } from "./SetupContractDialog";
import { CompanionResidentControl } from "./CompanionResidentControl";
import { projectLocalCodexStreamGrantFact, projectLocalDeveloperGrantFact } from "./setupContractNativeFacts";
import { hashSetupContractRef, matchesSetupContractPairingIdentity,
  projectCurrentPairingFacts } from
  "./setupContractPairingFacts";
import { prepareApprovedContractPairing } from "./setupContractPairingRequest";
import { issuePairingInvitation, listPairingDestinations,
  reconcilePairingInvitation } from "@/lib/agent-access/durablePairing";
import { projectCurrentMinecraftFacts, projectCurrentMinecraftPlayerFact,
  projectCurrentMinecraftReadinessFact } from
  "./setupContractMinecraftFacts";
import { projectCurrentMinecraftGameCommandFact } from
  "@shared/helix-setup-contract-game-facts";
import { projectCurrentRoomAuthorizationFact, projectCurrentRoomMembershipFact,
  projectUnavailableNativeRoomFact, projectUnavailableLocalRoomFact } from
  "./setupContractRoomFacts";
import { projectCurrentDiscordStreamFacts, projectDiscordDestinationDenialFact,
  projectUnavailablePersonalDiscordFacts,
  setupContractDiscordRoomId } from
  "./setupContractDiscordFacts";
import { projectNativeResponsesAllowanceFacts } from "./setupContractResponsesFacts";
import { applyApprovedSetupContractDiscord } from "./setupContractDiscordApply";
import { HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT } from
  "@/components/helix/ask-console/shared-live-room/SharedLiveRoomGuideProjection";

const requestSchema = z.object({
  schema: z.literal("helix.setup_contract_request.v1"),
  connection_kind: z.enum(["developer_tunnel", "personal_stdio"])
    .default("developer_tunnel"),
  request_id: z.string().uuid(),
  declared_task_summary: z.string(),
  profile_ref: z.string(), installation_ref: z.string(), task_ref: z.string(),
  future_task_admissions: z.array(z.object({ task_ref: z.string(),
    helix_chat_ref: z.string().optional(),
    admitted_at_ms: z.number(), revoked_at_ms: z.number().nullable() }).strict())
    .max(4).default([]),
  executable_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  package_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  mcp_client_ref_hash: z.string().regex(/^[a-f0-9]{64}$/u),
  scopes: z.array(helixSetupContractScopeSchema).min(1),
  available_scopes: z.array(helixSetupContractScopeSchema).min(1),
  planned_branches: z.array(helixSetupContractBranchSchema).optional(),
  available_planned_branches: z.array(helixSetupContractBranchSchema).optional(),
  requested_lease_seconds: z.number().int().positive(),
  verified_update_continuation: z.boolean().optional().default(false),
  signed_update_continuation: z.boolean().optional().default(false),
  review_revision: z.string().regex(/^[a-f0-9]{64}$/u),
  review_until_ms: z.number(),
  status: z.enum(["pending_owner_review", "approved", "revoked", "expired"]),
  approval: z.object({ receiptRef: z.string(), approvedAtMs: z.number(),
    expiresAtMs: z.number(), reviewedRevision: z.string(),
    autoResumeFullHarness: z.literal(true).optional(),
    autoResumeSelectedScopes: z.literal(true).optional() }).nullable(),
  facts: z.array(z.object({ stepId: z.enum(["personal_device_grant", "transport",
    "mcp_source", "task_presence"]),
    state: z.enum(["satisfied", "agent_action_available"]),
    observedAtMs: z.number(), validUntilMs: z.number(),
    evidenceRef: z.string(), reasonCode: z.string().optional() }).strict()),
  underlying_authority_granted: z.literal(false),
  credential_included: z.literal(false),
  private_endpoint_included: z.literal(false),
  answer_authority: z.literal(false), terminal_eligible: z.literal(false),
}).strict();
type OwnerRequest = z.infer<typeof requestSchema>;
const verifiedPrivateContinuation = async (): Promise<boolean> => {
  try {
    const state = await window.casimirDesktop?.getPrivateDevUpdateState?.();
    if (!state || typeof state !== "object") return false;
    const value = state as Record<string, unknown>;
    return (value.phase === "idle" || value.phase === "ready") &&
      value.profileSelected === true && typeof value.runningBuild === "string" &&
      value.runningBuild.length > 0 && value.selectedBuild === value.runningBuild;
  } catch { return false; }
};
const continuedOwnerRequest = async (body: unknown,
  requestId?: string): Promise<OwnerRequest | null> => {
  if (!body || typeof body !== "object" ||
      !("selected_scope_continuation" in body)) return null;
  const parsed = requestSchema.safeParse(
    (body as { selected_scope_continuation?: unknown }).selected_scope_continuation);
  if (!parsed.success || (requestId && parsed.data.request_id !== requestId) ||
      parsed.data.status !== "approved" ||
      parsed.data.verified_update_continuation !== true ||
      parsed.data.approval?.autoResumeSelectedScopes !== true ||
      parsed.data.approval.reviewedRevision !== parsed.data.review_revision ||
      parsed.data.approval.expiresAtMs <= Date.now() ||
      !await verifiedPrivateContinuation()) return null;
  return parsed.data;
};
const signedOwnerRequest = (body: unknown, requestId: string): OwnerRequest | null => {
  if (!body || typeof body !== "object" ||
      !("signed_scope_continuations" in body)) return null;
  const rows = (body as { signed_scope_continuations?: unknown })
    .signed_scope_continuations;
  if (!Array.isArray(rows)) return null;
  const matches: OwnerRequest[] = [];
  for (const row of rows) {
    const parsed = requestSchema.safeParse(row);
    if (parsed.success && parsed.data.request_id === requestId)
      matches.push(parsed.data);
  }
  if (matches.length !== 1) return null;
  const record = matches[0];
  return record.connection_kind === "personal_stdio" &&
    record.status === "approved" && record.signed_update_continuation &&
    record.approval?.autoResumeSelectedScopes === true &&
    record.approval.reviewedRevision === record.review_revision &&
    record.approval.expiresAtMs > Date.now() ? record : null;
};
const contractTarget = /^setup-contract-review:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu;
const resumeStorageKey = "helix.setup_contract_resume_request.v1";
const continuationStorageKey = (branch: "pairing" | "discord" | "responses", key: string) =>
  `helix.setup_contract_pending_${branch}.v1:${key}`;
const pendingContinuation = (branch: "pairing" | "discord" | "responses", key: string): boolean => {
  try { return window.sessionStorage.getItem(continuationStorageKey(branch, key)) === "1"; }
  catch { return false; }
};
const markPendingContinuation = (branch: "pairing" | "discord" | "responses", key: string,
  pending: boolean): void => {
  try {
    if (pending) window.sessionStorage.setItem(continuationStorageKey(branch, key), "1");
    else window.sessionStorage.removeItem(continuationStorageKey(branch, key));
  } catch { /* This is a resume hint; the owner contract remains the authority. */ }
};

const scopeLines = (request: OwnerRequest): string[] => request.scopes.flatMap(scope => {
  switch (scope.branch) {
    case "full_harness": return [request.connection_kind === "personal_stdio"
      ? "Use the approved local Codex connection for this installation and account"
      : "Start Full Harness for this exact developer installation and current owner session"];
    case "task_pairing": return [
      `Pair ${request.task_ref} with Helix chat ${scope.helix_chat_ref}`,
      ...(scope.future_tasks ? [
        `Also allow up to ${scope.future_tasks.max_additional_tasks} additional client-declared Codex tasks from this installation and MCP client to pair with these exact chats before the contract expires: ${(scope.future_tasks.helix_chat_refs ?? [scope.helix_chat_ref]).join(", ")}. Each task uses its own finite pairing and can be revoked separately; CasimirBot cannot independently attest its Codex-host task ID.`,
      ] : request.connection_kind === "personal_stdio" ? [
        "Additional Codex tasks are not included in this approval. Selecting Task pairing alone covers only the task named above; later tasks need their own reviewed scope.",
      ] : []),
    ];
    case "shared_room": return [
      `${scope.room_authority === "local" ? "Local" : "Hosted"} room membership: ${scope.room_ref}`,
      ...(scope.source_ingress ? [
        `Separate read-only ${scope.source_ingress.adapter} source admission for the owner-selected integrated world folder ${scope.source_ingress.world_folder} in local room ${scope.room_authority === "local" ? scope.room_ref : scope.source_ingress.local_room_ref ?? "not selected"}. This review does not pair a sensor, grant player or command actions, or start Minecraft.`,
      ] : []),
    ];
    case "room_ai_release": return [
      `${scope.room_authority === "local" ? "Local" : "Hosted"} room AI consent review: ${scope.room_ref}; exact messages or a call require separate source-specific consent.`,
    ];
    case "discord_stream": return [
      `Discord destination: ${scope.destination_ref}; ${scope.selection_mode}; ${scope.duration_hours} hour(s)`,
      `Read-only Codex sources: ${scope.source_refs.join(", ")}`,
    ];
    case "discord_voice": return [
      `Captain Keyes ${scope.mode === "gpt_live" ? "GPT Live arm and join" : "audio-off join"}: session ${scope.session_ref}; app ${scope.application_id}; server ${scope.guild_id}; text channel ${scope.text_channel_id}; voice channel ${scope.voice_channel_id}.`,
      `Linked Discord commander ${scope.commander_discord_user_id}; owner Shared Live Room ${scope.room_ref}; maximum ${scope.duration_seconds} seconds per invitation. The pending join expires after two minutes; an active join can continue only while the worker renews its short lease and the approved contract remains valid.`,
      scope.mode === "gpt_live"
        ? "This scope permits a finite channel arm and the installed app's bridge connection for this exact room and invitation, without another owner audio checkbox. Audio still requires each present participant's remembered or fresh consent, an active owner room and GPT Live session, and an authorized provider budget. The bridge mutes playback on this computer by default; the owner can change that in Voice settings."
        : "This scope permits only a finite audio-off bot invitation. GPT Live audio still needs a separate channel arm, each present participant's remembered or fresh consent, and an authorized provider budget.",
      ...(scope.isolated_transcription ? [
        `Requested separate single-speaker ${scope.isolated_transcription.model} allowance: ${scope.isolated_transcription.payer}; at most ${scope.isolated_transcription.max_calls} calls, ${scope.isolated_transcription.max_provider_cost_micros} provider-cost micros and ${scope.isolated_transcription.duration_seconds} seconds. This request is not active until the native budget and authenticated voice worker both enforce it; approving GPT Live alone does not fund transcription.`,
      ] : []),
      ...(scope.companion_disclosure ? [
        `Separate companion speech disclosure: at most ${scope.companion_disclosure.duration_seconds} seconds for a ${scope.companion_disclosure.runtime_agent_provider} Ask worker in this exact room. This owner review only permits staging a finite offer after the joined voice invitation is current. Each speaker must separately opt in with a signed Discord command; the worker rechecks that speaker immediately before reading words. This grants no Minecraft command or Codex task transcript sharing.`,
      ] : []),
    ];
    case "minecraft_player": return [
      `Minecraft ${scope.room_authority === "local" ? "local" : "hosted"} room ${scope.room_ref}; environment ${scope.environment_binding_ref}; player ${scope.player_ref}`,
      scope.capability_tier === "full_current_catalog"
        ? `Full current player-action catalog: ${scope.adapter_profile_id} version ${scope.adapter_profile_version}, contract ${scope.adapter_contract_hash}. All ${scope.capability_ids.length} reviewed capabilities are listed below. A changed adapter catalog requires a new owner review.`
        : "Selected player-action capabilities only.",
      `Capabilities: ${scope.capability_ids.join(", ")}; ${scope.autonomy_mode}; manual override ${scope.manual_override_policy}; ${scope.duration_seconds} seconds`,
      "This scope does not grant slash commands, an independent companion mission, player-detail sharing, or model spending. Those require their own reviewed scopes and current underlying grants.",
    ];
    case "minecraft_game": return [
      `Full current Minecraft game review for local room ${scope.room_ref}, world ${scope.world_ref}, environment ${scope.environment_binding_ref}, player ${scope.player_ref}.`,
      `Player-action adapter ${scope.player_action_catalog.adapter_profile_id} version ${scope.player_action_catalog.adapter_profile_version}, contract ${scope.player_action_catalog.adapter_contract_hash}.`,
      `All ${scope.player_action_catalog.capability_ids.length} player actions: ${scope.player_action_catalog.capability_ids.join(", ")}.`,
      `Brigadier tree ${scope.command_catalog.command_tree_hash === "first_live_catalog" ? "pinned to the first catalog published under this finite grant" : scope.command_catalog.command_tree_hash}; all ${scope.command_catalog.category_ids.length} current command categories: ${scope.command_catalog.category_ids.join(", ")}.`,
      `Autonomous use for at most ${scope.duration_seconds} seconds; manual override ${scope.manual_override_policy}. A changed player adapter or command tree needs a new review.`,
      "This review alone does not start an action. Player-action and World Authority grants, exact task binding, current source and live command checks remain required. Player-detail releases and Responses spending are separate. The independent companion is not yet in the installed capability catalog.",
    ];
    case "responses_session": return [
      `Responses ${scope.provider}; ${scope.payer}; maximum ${scope.max_provider_cost_micros} provider-cost micros; ${scope.duration_seconds} seconds`,
      "The EXE binds this approval to one native call and model-token budget. It may fund separate Minecraft action choices or read-only observation interpretations; neither starts player control or Discord sharing.",
    ];
    case "shelter_build": return [
      `One paired Codex shelter build: hosted room ${scope.hosted_room_ref}; local room ${scope.local_room_ref}; environment ${scope.environment_binding_ref}; world ${scope.world_ref}.`,
      `Exact preview ${scope.preview_ref}; footprint ${JSON.stringify(scope.footprint)}; at most ${scope.duration_seconds} seconds.`,
      "Exact commands in order:",
      ...scope.commands.map((command, index) => `${index + 1}. /${command}`),
      "Approval permits only this reviewed intent. A current local World Authority world_build grant, verified world backup, fresh player release, live command catalog and measured post-build blocks remain separate requirements. An unknown command outcome is never retried.",
    ];
    case "companion_mission": return [
      `Independent companion mission for objective ${scope.objective_ref}: actor ${scope.companion_ref}, incarnation ${scope.incarnation_ref}, owner player ${scope.owner_player_ref}.`,
      `Hosted room ${scope.hosted_room_ref}; separate local room ${scope.local_room_ref}; environment ${scope.environment_binding_ref}; world ${scope.world_ref}; source binding ${scope.source_binding_ref}.`,
      `Center ${JSON.stringify(scope.center)}; maximum movement radius ${scope.maximum_radius_blocks} blocks; protected box ${JSON.stringify(scope.protected_box)}; at most ${scope.maximum_placements} native placements over ${scope.duration_seconds} seconds.`,
      `Kit: ${scope.owner_kit_stacks} existing Survival stacks of ${scope.allowed_item}; own-key Responses ceiling $${(scope.responses_cost_ceiling_micros / 1_000_000).toFixed(2)}.`,
      "No slash commands, player control, mining, crafting, or force-loaded chunks. This review records exact intent; a current native world-build grant, separate player releases, verified backup, and signed effect transport are required before Start. F10 is the direct local stop.",
    ];
    case "companion_resident_session": return [
      `One-hour companion session: actor ${scope.companion_ref}, incarnation ${scope.incarnation_ref}, owner player ${scope.owner_player_ref}.`,
      `Hosted room ${scope.hosted_room_ref}; local room ${scope.local_room_ref}; environment ${scope.environment_binding_ref}; world ${scope.world_ref}. The sensor may renew only for this world and room.`,
      `Selected capabilities: ${scope.capabilities.join(", ")}. Protected player box: ${JSON.stringify(scope.protected_box)}.`,
      "There is no session travel or block-count limit. The companion may expand its working area using fresh observations during this hour. Native placement debits its Survival inventory; the separate command-build capability permits placing and clearing only with current World Authority.",
      "This review does not start a task or grant player control. Loaded-world checks, game mechanics, player safety, separate Responses allowance and player release, current authority, and direct Stop still apply before effects.",
    ];
  }
});

export function SetupContractInbox() {
  const [available, setAvailable] = React.useState(false);
  const [inspectionFailed, setInspectionFailed] = React.useState(false);
  const [requests, setRequests] = React.useState<OwnerRequest[]>([]);
  const [continuation, setContinuation] = React.useState<OwnerRequest | null>(null);
  const [selectedScopeContinuation, setSelectedScopeContinuation] = React.useState<OwnerRequest | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [companionStopBusy, setCompanionStopBusy] = React.useState(false);
  const companionStopEpoch = React.useRef(0);
  const [message, setMessage] = React.useState<string | null>(null);
  const [stepMessage, setStepMessage] = React.useState<string | null>(null);
  React.useEffect(() => { setStepMessage(null); }, [selectedId]);
  const [observedAtMs, setObservedAtMs] = React.useState(0);
  const [tunnel, setTunnel] = React.useState<DesktopMcpTunnelState | null>(null);
  const [developerView, setDeveloperView] = React.useState<unknown>(null);
  const [codexStreamGrants, setCodexStreamGrants] = React.useState<unknown>(null);
  const [codexStreamGrantsObservedAtMs, setCodexStreamGrantsObservedAtMs] = React.useState(0);
  const [streamDevice, setStreamDevice] = React.useState<{
    installationRef: string; deviceRef: string;
  } | null>(null);
  const [pairingObservation, setPairingObservation] = React.useState<{
    requestId: string; facts: HelixSetupContractFact[];
  } | null>(null);
  const [minecraftObservation, setMinecraftObservation] = React.useState<{
    requestId: string; facts: HelixSetupContractFact[];
  } | null>(null);
  const [roomObservation, setRoomObservation] = React.useState<{
    requestId: string; facts: HelixSetupContractFact[];
  } | null>(null);
  const [discordObservation, setDiscordObservation] = React.useState<{
    requestId: string; facts: HelixSetupContractFact[];
  } | null>(null);
  const [responsesObservation, setResponsesObservation] = React.useState<{
    requestId: string; facts: HelixSetupContractFact[]; providerReady: boolean;
  } | null>(null);
  const [clock, setClock] = React.useState(Date.now());
  const [reviewAttempt, setReviewAttempt] = React.useState(0);
  const generation = React.useRef(0);
  const refreshInFlight = React.useRef(0);
  const resumeOnUnmount = React.useRef<string | null>(null);
  const continuationRunning = React.useRef(false);
  const pairingRetryAt = React.useRef(new Map<string, number>());
  const discordRetryAt = React.useRef(new Map<string, number>());
  const responsesRetryAt = React.useRef(new Map<string, number>());
  const pairingSettled = React.useRef(new Set<string>());
  const discordSettled = React.useRef(new Set<string>());
  const responsesSettled = React.useRef(new Set<string>());
  const selected = requests.find(request => request.request_id === selectedId) ?? null;
  const streamDeviceRef = streamDevice && selected &&
    streamDevice.installationRef === selected.installation_ref
    ? streamDevice.deviceRef : null;
  const selectedWorkflowStatus = selected?.status === "revoked" ? "revoked" :
    selected && clock >= (selected.approval?.expiresAtMs ?? selected.review_until_ms)
      ? "expired" : selected?.status ?? null;
  const pairingScope = selected?.scopes.find(scope => scope.branch === "task_pairing");
  const pairingChatRef = pairingScope?.branch === "task_pairing" ? pairingScope.helix_chat_ref : null;
  const pairingProfileRef = selected?.profile_ref ?? null;
  const pairingTaskRef = selected?.task_ref ?? null;
  const pairingClientHash = selected?.mcp_client_ref_hash ?? null;
  const minecraftSelection = selected?.scopes.find(scope =>
    scope.branch === "minecraft_player" || scope.branch === "minecraft_game");
  const minecraftScope = minecraftSelection?.branch === "minecraft_game"
    ? { branch: "minecraft_player" as const,
      room_ref: minecraftSelection.room_ref,
      room_authority: "local" as const,
      environment_binding_ref: minecraftSelection.environment_binding_ref,
      player_ref: minecraftSelection.player_ref,
      capability_ids: minecraftSelection.player_action_catalog.capability_ids,
      capability_tier: "full_current_catalog" as const,
      adapter_profile_id: minecraftSelection.player_action_catalog.adapter_profile_id,
      adapter_profile_version: minecraftSelection.player_action_catalog.adapter_profile_version,
      adapter_contract_hash: minecraftSelection.player_action_catalog.adapter_contract_hash,
      autonomy_mode: minecraftSelection.autonomy_mode,
      manual_override_policy: minecraftSelection.manual_override_policy,
      duration_seconds: minecraftSelection.duration_seconds }
    : minecraftSelection;
  const minecraftScopeJson = minecraftScope ? JSON.stringify(minecraftScope) : null;
  const minecraftSelectionJson = minecraftSelection
    ? JSON.stringify(minecraftSelection) : null;
  const discordScope = selected?.scopes.find(scope => scope.branch === "discord_stream");
  const discordScopeJson = discordScope ? JSON.stringify(discordScope) : null;
  const responsesRequested = Boolean(selected?.scopes.some(scope =>
    scope.branch === "responses_session"));
  const responsesScope = selected?.scopes.find(scope =>
    scope.branch === "responses_session");
  const responsesScopeJson = responsesScope ? JSON.stringify(responsesScope) : null;
  const roomRequested = Boolean(selected?.scopes.some(scope =>
    scope.branch === "shared_room" || scope.branch === "room_ai_release" ||
    scope.branch === "minecraft_player" || scope.branch === "minecraft_game"));
  const selectedRoomRef = selected?.scopes.find(scope => "room_ref" in scope)?.room_ref ?? null;
  const roomAuthorityScope = selected?.scopes.find(scope => "room_authority" in scope);
  const selectedRoomAuthority = roomAuthorityScope && "room_authority" in roomAuthorityScope
    ? roomAuthorityScope.room_authority ?? "hosted" : "hosted";
  const hostedSourceScope = selected?.scopes.find((scope): scope is
    Extract<OwnerRequest["scopes"][number], { branch: "shared_room" }> =>
    scope.branch === "shared_room" && scope.room_authority === "hosted" &&
    scope.source_ingress?.adapter === "minecraft.fabric" &&
    scope.source_ingress.mode === "read_only" &&
    Boolean(scope.source_ingress.local_room_ref));

  React.useEffect(() => {
    let alive = true;
    const installationRef = selected?.installation_ref;
    setStreamDevice(null);
    if (!installationRef) return;
    void hashSetupContractRef(installationRef).then(digest => {
      if (alive && digest) setStreamDevice({ installationRef,
        deviceRef: `desktop:${digest}` });
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [selected?.installation_ref]);

  const refresh = React.useCallback(async (preserveMessage = false, presentedRequestId?: string) => {
    const attempt = ++generation.current;
    refreshInFlight.current += 1;
    try {
      const response = await fetch("/api/desktop/setup-contract/requests", {
        credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" },
      });
      if (response.status === 404 || response.status === 401 || response.status === 403) {
        if (attempt === generation.current) {
          setAvailable(false); setInspectionFailed(true); setRequests([]);
          setContinuation(null); setSelectedScopeContinuation(null); setOpen(false);
        }
        return null;
      }
      if (!response.ok) throw new Error("setup_contract_list_failed");
      const body = await response.json();
      const parsed = z.object({ ok: z.literal(true), requests: z.array(requestSchema),
        continuation: requestSchema.nullable().optional(),
        selected_scope_continuation: requestSchema.nullable().optional(),
        signed_scope_continuations: z.array(requestSchema).optional() })
        .passthrough().parse(body);
      const selectedContinuation = parsed.selected_scope_continuation
        ? await continuedOwnerRequest(body) : null;
      const baseRequests = [...parsed.requests, ...(parsed.signed_scope_continuations ?? [])
        .filter(row => !parsed.requests.some(current => current.request_id === row.request_id))];
      const visibleRequests = selectedContinuation &&
        !baseRequests.some(row => row.request_id === selectedContinuation.request_id)
        ? [...baseRequests, selectedContinuation] : baseRequests;
      const readTunnelState = window.casimirDesktop?.getMcpTunnelState;
      const readDeveloperAccess = window.casimirDesktop?.localDeveloperAccess;
      const readCodexStreamGrants = window.casimirDesktop?.codexStreamGrants;
      const [nativeState, developerState, streamGrants] = await Promise.all([
        readTunnelState ? readTunnelState().catch(() => null) : null,
        readDeveloperAccess ? readDeveloperAccess("inspect").catch(() => null) : null,
        readCodexStreamGrants && visibleRequests.some(request =>
          request.scopes.some(scope => scope.branch === "discord_stream"))
          ? readCodexStreamGrants({ operation: "list" })
            .then(value => ({ value, observedAtMs: Date.now() })).catch(() => null) : null,
      ]);
      if (attempt !== generation.current) return null;
      const observedAtMs = Date.now();
      setAvailable(true);
      setInspectionFailed(false);
      setRequests(visibleRequests);
      setContinuation(parsed.continuation ?? null);
      setSelectedScopeContinuation(selectedContinuation);
      const presented = presentedRequestId
        ? visibleRequests.find(row => row.request_id === presentedRequestId) : null;
      setSelectedId(previous => presented?.request_id ??
        (previous && visibleRequests.some(row => row.request_id === previous)
          ? previous : visibleRequests.find(row => row.status === "pending_owner_review")?.request_id ??
            visibleRequests[0]?.request_id ?? null));
      if (presentedRequestId) {
        setOpen(Boolean(presented));
        if (!presented) setMessage("The presented setup request is no longer available for this owner session.");
      }
      setTunnel(parseDesktopMcpTunnelState(nativeState));
      setDeveloperView(developerState);
      setCodexStreamGrants(streamGrants?.value ?? null);
      setCodexStreamGrantsObservedAtMs(streamGrants?.observedAtMs ?? 0);
      setObservedAtMs(observedAtMs);
      setClock(observedAtMs);
      if (!preserveMessage && (!presentedRequestId || presented)) setMessage(null);
      for (const approved of visibleRequests) {
        if (approved.status !== "approved" || !approved.approval ||
            approved.approval.expiresAtMs <= observedAtMs) continue;
        const key = `${approved.request_id}:${approved.review_revision}`;
        if (approved.scopes.some(scope => scope.branch === "task_pairing") &&
            !pairingSettled.current.has(key) && !pairingRetryAt.current.has(key))
          pairingRetryAt.current.set(key, 0);
      }
      if (selectedContinuation?.approval) {
        const key = `${selectedContinuation.request_id}:${selectedContinuation.review_revision}`;
        discordRetryAt.current.set(key, 0);
        responsesRetryAt.current.set(key, 0);
      }
      return visibleRequests;
    } catch {
      if (attempt === generation.current) {
        // Keep the exact request visible through a transient read failure, but
        // require a fresh owner read before any new review decision.
        setInspectionFailed(true);
        setClock(Date.now());
        setMessage("Setup contracts could not be inspected. Recheck the installed account and service.");
      }
      return null;
    } finally {
      refreshInFlight.current -= 1;
    }
  }, []);

  React.useEffect(() => {
    let resumeId: string | null = null;
    try {
      const pending = window.sessionStorage.getItem(resumeStorageKey);
      window.sessionStorage.removeItem(resumeStorageKey);
      if (pending && contractTarget.test(`setup-contract-review:${pending}`)) resumeId = pending;
    } catch { /* Session storage is an optional navigation hint, never authority. */ }
    void refresh(false, resumeId ?? undefined);
    const onGuidance = (event: Event) => {
      const targetId = (event as CustomEvent<{ targetId?: string }>).detail?.targetId;
      const requestId = typeof targetId === "string" ? contractTarget.exec(targetId)?.[1] : null;
      if (requestId) void refresh(false, requestId);
    };
    window.addEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, onGuidance);
    const onFocus = () => {
      pairingRetryAt.current.clear();
      discordRetryAt.current.clear();
      responsesRetryAt.current.clear();
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      generation.current += 1;
      if (resumeOnUnmount.current) {
        try { window.sessionStorage.setItem(resumeStorageKey, resumeOnUnmount.current); }
        catch { /* Manual Review remains available. */ }
      }
      window.removeEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, onGuidance);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  React.useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setClock(Date.now()), 2_000);
    return () => window.clearInterval(timer);
  }, [open]);
  React.useEffect(() => {
    const unsubscribe = window.casimirDesktop?.onAuth0AccountLinkCompletion?.(candidate => {
      const completion = parseDesktopAuth0AccountLinkCompletion(candidate);
      if (completion?.authorization_purpose !== "shared_live_rooms") return;
      setStepMessage(completion.ok
        ? "Room authorization returned. The contract is checking the current grant and exact room."
        : "Room authorization did not complete. Check the browser account and retry this step.");
      void refresh(true);
    });
    return () => { unsubscribe?.(); };
  }, [refresh]);
  React.useEffect(() => {
    if (!open || busy) return;
    const timer = window.setInterval(() => {
      // A slow native read must finish before the next automatic inspection.
      // Otherwise every poll supersedes the prior result and the contract
      // never displays fresh evidence under load.
      if (refreshInFlight.current === 0) void refresh(true);
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [open, busy, refresh]);
  React.useEffect(() => {
    let alive = true;
    let generation = 0;
    setPairingObservation(null);
    if (!open || !selectedId || !pairingChatRef || !pairingProfileRef ||
        !pairingTaskRef || !pairingClientHash) return;
    const requestId = selectedId;
    const check = async () => {
      const attempt = ++generation;
      let facts: HelixSetupContractFact[] = [];
      try {
        const taskHash = await hashSetupContractRef(pairingTaskRef);
        if (taskHash) {
          const response = await fetch(
            "/api/account/session/agent-connections/reasoning-bindings/current" +
              `?helix_conversation_id=${encodeURIComponent(pairingChatRef)}`,
            { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } },
          );
          if (response.ok) {
            const body = await response.json();
            const clientRef = body?.binding?.authenticated_mcp_client_ref;
            const clientHash = typeof clientRef === "string"
              ? await hashSetupContractRef(clientRef) : null;
            if (clientHash) facts = projectCurrentPairingFacts(body?.binding, Date.now(),
              pairingProfileRef, pairingChatRef, taskHash, pairingClientHash, clientHash);
          }
        }
      } catch { /* A failed owner read never proves an accepted pairing. */ }
      if (alive && attempt === generation) {
        setPairingObservation({ requestId, facts });
        setClock(Date.now());
      }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 4_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [open, selectedId, pairingChatRef, pairingProfileRef, pairingTaskRef, pairingClientHash]);
  React.useEffect(() => {
    let alive = true;
    let generation = 0;
    setMinecraftObservation(null);
    if (!open || !selectedId || minecraftScope?.branch !== "minecraft_player") return;
    const requestId = selectedId;
    const scope = minecraftScope;
    const gameScope = minecraftSelection?.branch === "minecraft_game"
      ? minecraftSelection : null;
    const check = async () => {
      const attempt = ++generation;
      let facts: HelixSetupContractFact[] = [];
      let authorityValue: unknown = null;
      let subjectValue: unknown = null;
      try {
        const response = await fetch(
          `/api/agi/realtime/rooms/${encodeURIComponent(scope.room_ref)}` +
            `/environments/${encodeURIComponent(scope.environment_binding_ref)}/action-authorities`,
          { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } },
        );
        if (response.ok) {
          authorityValue = await response.json();
          facts = projectCurrentMinecraftFacts(authorityValue, Date.now(), scope);
        }
      } catch { /* A failed room read never proves a player lease. */ }
      try {
        const response = await fetch(
          `/api/agi/realtime/rooms/${encodeURIComponent(scope.room_ref)}` +
            `/environments/${encodeURIComponent(scope.environment_binding_ref)}/subjects`,
          { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } },
        );
        if (response.ok) {
          subjectValue = await response.json();
          const fact = projectCurrentMinecraftPlayerFact(subjectValue, Date.now(), scope);
          if (fact) facts.push(fact);
        }
      } catch { /* A failed subject read never proves player selection. */ }
      const readiness = projectCurrentMinecraftReadinessFact(
        authorityValue, subjectValue, Date.now(), scope);
      if (readiness) facts.push(readiness);
      if (gameScope) {
        try {
          const base = `/api/agi/realtime/rooms/${encodeURIComponent(scope.room_ref)}` +
            `/environments/${encodeURIComponent(scope.environment_binding_ref)}`;
          const [authorityResponse, catalogResponse] = await Promise.all([
            fetch(`${base}/command-authority`, { credentials: "same-origin",
              cache: "no-store", headers: { Accept: "application/json" } }),
            fetch(`${base}/command-authority/catalog`, { credentials: "same-origin",
              cache: "no-store", headers: { Accept: "application/json" } }),
          ]);
          if (authorityResponse.ok && catalogResponse.ok) {
            const fact = projectCurrentMinecraftGameCommandFact(
              await authorityResponse.json(), await catalogResponse.json(),
              Date.now(), gameScope);
            if (fact) facts.push(fact);
          }
        } catch { /* A failed command read never proves full game authority. */ }
      }
      if (alive && attempt === generation) {
        setMinecraftObservation({ requestId, facts });
        setClock(Date.now());
      }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 4_000);
    return () => { alive = false; window.clearInterval(timer); };
    // A serialized exact scope avoids rereading authority when an inbox poll only replaces its object.
  }, [open, selectedId, minecraftScopeJson, minecraftSelectionJson]);
  React.useEffect(() => {
    let alive = true;
    let generation = 0;
    setRoomObservation(null);
    if (!open || !selectedId || !pairingProfileRef || !roomRequested || !selectedRoomRef) return;
    const requestId = selectedId;
    const check = async () => {
      const attempt = ++generation;
      const facts: HelixSetupContractFact[] = [];
      try {
        if (selectedRoomAuthority === "local") {
          const response = await fetch(
            `/api/desktop/setup-contract/requests/${encodeURIComponent(requestId)}/local-room`,
            { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
          const body = await response.json();
          if (response.ok && body?.ok === true && body.room_authority === "local" &&
              body.profile_ref === pairingProfileRef) {
            const membership = projectCurrentRoomMembershipFact(
              body.receipt, Date.now(), selectedRoomRef);
            if (membership) facts.push(membership);
          } else {
            const membership = projectUnavailableLocalRoomFact(
              body?.error, Date.now(), selectedRoomRef);
            if (membership) facts.push(membership);
          }
        } else {
        const response = await fetch(DESKTOP_AUTH0_ROOM_CONNECTION_STATUS_PATH,
          { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
        const authorization = response.ok ? projectCurrentRoomAuthorizationFact(
          await response.json(), Date.now(), pairingProfileRef) : null;
        if (authorization) facts.push(authorization);
        if (authorization?.state === "satisfied") {
          const inspect = await fetch(DESKTOP_AUTH0_ROOM_CONTROL_PATH, {
            method: "POST", credentials: "same-origin", cache: "no-store",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "inspect", room_id: selectedRoomRef }),
          });
          const membership = inspect.ok ? projectCurrentRoomMembershipFact(
            await inspect.json(), Date.now(), selectedRoomRef)
            : projectUnavailableNativeRoomFact((await inspect.json() as { error?: unknown }).error,
              Date.now(), selectedRoomRef);
          if (membership) facts.push(membership);
        }
        }
      } catch { /* Room authorization remains unknown after a failed native read. */ }
      if (alive && attempt === generation) {
        setRoomObservation({ requestId, facts });
        setClock(Date.now());
      }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 4_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [open, selectedId, pairingProfileRef, roomRequested, selectedRoomRef,
    selectedRoomAuthority]);
  React.useEffect(() => {
    let alive = true;
    let generation = 0;
    setDiscordObservation(null);
    if (!open || !selectedId || discordScope?.branch !== "discord_stream" ||
        !streamDeviceRef) return;
    const requestId = selectedId;
    const scope = discordScope;
    const deviceRef = streamDeviceRef;
    const roomId = setupContractDiscordRoomId(scope.destination_ref);
    if (!roomId) return;
    const check = async () => {
      const attempt = ++generation;
      let facts: HelixSetupContractFact[] = [];
      try {
        let state: unknown = null;
        if (discordPersonalSessionIdSchema.safeParse(scope.destination_ref).success) {
          const result = await window.casimirDesktop?.personalDiscordStream?.({
            session_id: scope.destination_ref, operation: { kind: "inspect" },
          }) as { status?: string; receipt?: { ok?: boolean; result?: unknown } } | undefined;
          if (result?.status === "ready" && result.receipt?.ok === true)
            state = result.receipt.result;
          else facts = projectUnavailablePersonalDiscordFacts(result, Date.now());
        } else {
          const response = await fetch(DESKTOP_AUTH0_ROOM_CONTROL_PATH, {
            method: "POST", credentials: "same-origin", cache: "no-store",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "discord_stream_inspect", room_id: roomId }),
          });
          if (response.ok) state = await response.json();
          else if (response.status === 403 || response.status === 409) {
            const denial = await response.json().catch(() => null);
            if (denial?.error === "room_forbidden")
              facts = projectDiscordDestinationDenialFact(
                denial.message, Date.now(), roomId);
          }
        }
        if (facts.length === 0)
          facts = projectCurrentDiscordStreamFacts(state, Date.now(), scope, deviceRef);
      } catch { /* A failed owner inspect never proves a selected stream. */ }
      if (alive && attempt === generation) {
        setDiscordObservation({ requestId, facts });
        setClock(Date.now());
      }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 4_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [open, selectedId, streamDeviceRef, discordScopeJson]);
  React.useEffect(() => {
    let alive = true;
    let generation = 0;
    setResponsesObservation(null);
    if (!open || !selectedId || !selected?.profile_ref || !responsesRequested) return;
    const requestId = selectedId;
    const profileRef = selected.profile_ref;
    const maximumMicros = responsesScope?.branch === "responses_session"
      ? responsesScope.max_provider_cost_micros : null;
    const check = async () => {
      const attempt = ++generation;
      let facts: HelixSetupContractFact[] = [];
      let providerReady = false;
      try {
        const state = await window.casimirDesktop?.responsesActionSession?.("state");
        if (state) {
          facts = projectNativeResponsesAllowanceFacts(state, Date.now(), profileRef,
            maximumMicros === null ? undefined : { requestId, maximumMicros });
          providerReady = state.profileRef === profileRef && state.providerConfigured === true;
        }
      } catch { /* A failed native read never proves provider funding. */ }
      if (alive && attempt === generation) {
        setResponsesObservation({ requestId, facts, providerReady });
        setClock(Date.now());
      }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 4_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [open, selectedId, selected?.profile_ref, responsesRequested, responsesScopeJson,
    observedAtMs]);

  const completeApprovedTransport = async (approved: OwnerRequest, reviewedRevision: string) => {
    const intentMessage = "Setup intent approved. Current grants are reused; missing grants can be completed through the controls in this contract.";
    if (approved.status !== "approved" ||
        approved.approval?.reviewedRevision !== reviewedRevision ||
        approved.approval.expiresAtMs <= Date.now()) return intentMessage;
    if (!approved.scopes.some(scope => scope.branch === "full_harness")) return intentMessage;
    if (approved.connection_kind === "personal_stdio")
      return "Setup intent approved. The personal Codex connection remains subject to its current device and client grants.";
    const native = window.casimirDesktop;
    if (!native?.getMcpTunnelState || !native.localDeveloperAccess || !native.startMcpTunnel)
      return intentMessage;
    try {
      const [rawTunnel, developerView] = await Promise.all([
        native.getMcpTunnelState(), native.localDeveloperAccess("inspect"),
      ]);
      const currentTunnel = parseDesktopMcpTunnelState(rawTunnel);
      setTunnel(currentTunnel);
      setDeveloperView(developerView);
      const observedAtMs = Date.now();
      setObservedAtMs(observedAtMs);
      const developerFact = projectLocalDeveloperGrantFact(developerView, observedAtMs,
        approved.profile_ref, approved.installation_ref);
      if (currentTunnel?.ready && currentTunnel.scope === "full_helix_agent")
        return "Setup intent approved. Full Harness is already ready; other permissions remain separate.";
      if (!currentTunnel?.ready ||
          currentTunnel.scope !== "local_supervisor_coordination_and_device_check" ||
          developerFact?.state !== "satisfied") return intentMessage;
      try {
        const result = parseDesktopMcpTunnelState(await native.startMcpTunnel({ scope: "full_helix_agent" }));
        if (result) setTunnel(result);
        if (result?.ready && result.scope === "full_helix_agent")
          return "Setup intent approved. Full Harness is ready; other permissions remain separate.";
      } catch { /* A lost native reply needs one read, never a second start. */ }
      const reconciled = parseDesktopMcpTunnelState(await native.getMcpTunnelState());
      setTunnel(reconciled);
      return reconciled?.ready && reconciled.scope === "full_helix_agent"
        ? "Setup intent approved. Full Harness is ready; other permissions remain separate."
        : "Setup intent approved, but Full Harness did not become ready. Reinspect the tunnel; other permissions remain separate.";
    } catch {
      return "Setup intent approved. Full Harness state could not be confirmed; reinspect the native tunnel.";
    }
  };

  const completeApprovedResponses = async (approved: OwnerRequest,
    reviewedRevision: string): Promise<string | null> => {
    const scope = approved.scopes.find(row => row.branch === "responses_session");
    if (scope?.branch !== "responses_session") return null;
    const continuationKey = `${approved.request_id}:${reviewedRevision}`;
    if (approved.status !== "approved" ||
        approved.approval?.reviewedRevision !== reviewedRevision ||
        approved.approval.expiresAtMs <= Date.now())
      return "Responses approval is no longer current; no session was started.";
    responsesRetryAt.current.set(continuationKey, Date.now() + 15_000);
    markPendingContinuation("responses", continuationKey, true);
    try {
      const native = window.casimirDesktop?.responsesActionSession;
      const state = await native?.("approveContract", approved.request_id);
      if (state?.status === "approved" &&
          state.contractRequestId === approved.request_id &&
          state.costBudget?.maximumMicros === scope.max_provider_cost_micros &&
          !state.costBudget.blocked) {
        responsesSettled.current.add(continuationKey);
        markPendingContinuation("responses", continuationKey, false);
        return "The native Responses budget is active for this exact contract.";
      }
      return approved.connection_kind === "personal_stdio"
        ? "Responses budget is waiting for current Codex task presence, device grant and saved own-key credential; the approved contract will recheck them."
        : "Responses budget is waiting for Full Harness and the saved own-key credential; the approved contract will recheck them.";
    } catch {
      return "Responses budget outcome is unconfirmed; the approved contract will inspect it before continuing.";
    }
  };

  const completeApprovedDiscord = async (approved: OwnerRequest,
    reviewedRevision: string): Promise<string | null> => {
    const scope = approved.scopes.find(row => row.branch === "discord_stream");
    if (scope?.branch !== "discord_stream") return null;
    const continuationKey = `${approved.request_id}:${reviewedRevision}`;
    discordRetryAt.current.set(continuationKey, Date.now() + 15_000);
    markPendingContinuation("discord", continuationKey, true);
    if (approved.status !== "approved" ||
        approved.approval?.reviewedRevision !== reviewedRevision ||
        approved.approval.expiresAtMs <= Date.now())
      return "Discord approval is no longer current; no stream was selected.";
    if (!window.casimirDesktop?.codexStreamGrants)
      return "Discord setup is waiting for the installed local Codex chat reader.";
    const approvalCurrent = async () => {
      const response = await fetch("/api/desktop/setup-contract/requests", {
        credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return false;
      const body = await response.json();
      const current = Array.isArray(body?.requests)
        ? body.requests.find((item: unknown) =>
          requestSchema.safeParse(item).success &&
          (item as OwnerRequest).request_id === approved.request_id) : null;
      const row = current ?? signedOwnerRequest(body, approved.request_id) ??
        await continuedOwnerRequest(body, approved.request_id);
      return Boolean(row && row.status === "approved" &&
        row.approval?.reviewedRevision === reviewedRevision &&
        row.approval.expiresAtMs > Date.now() &&
        row.profile_ref === approved.profile_ref &&
        row.installation_ref === approved.installation_ref &&
        row.executable_sha256 === approved.executable_sha256 &&
        row.package_sha256 === approved.package_sha256 &&
        row.task_ref === approved.task_ref &&
        row.mcp_client_ref_hash === approved.mcp_client_ref_hash &&
        JSON.stringify(row.scopes) === JSON.stringify(approved.scopes));
    };
    const remoteControl = async (roomId: string, operation: string, request?: unknown) => {
      const personalSessionId = discordPersonalSessionIdFromStreamId(roomId);
      if (personalSessionId) {
        const kind = ({ discord_stream_inspect: "inspect", discord_stream_grant: "grant",
          discord_stream_select: "select", discord_stream_stop: "stop" } as
          Record<string, string>)[operation];
        if (!kind) throw new Error("setup_contract_discord_operation_invalid");
        const result = await window.casimirDesktop?.personalDiscordStream?.({
          session_id: personalSessionId, operation: { kind,
            ...(request === undefined ? {} : { request }) },
        }) as { status?: string; receipt?: { ok?: boolean; result?: unknown } } | undefined;
        if (result?.status !== "ready" || result.receipt?.ok !== true)
          throw new Error("setup_contract_discord_personal_stream_unavailable");
        return result.receipt.result;
      }
      const response = await fetch(DESKTOP_AUTH0_ROOM_CONTROL_PATH, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ operation, room_id: roomId,
          ...(request === undefined ? {} : { request }) }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || typeof body !== "object")
        throw new Error(typeof body?.error === "string"
          ? body.error : "setup_contract_discord_room_service_unavailable");
      return body;
    };
    try {
      const result = await applyApprovedSetupContractDiscord({
        requestId: approved.request_id, profileRef: approved.profile_ref, scope,
        nativeGrants: request => window.casimirDesktop!.codexStreamGrants!(request),
        remoteControl, approvalCurrent,
      });
      discordSettled.current.add(continuationKey);
      markPendingContinuation("discord", continuationKey, false);
      return result === "already_current"
        ? "The selected Discord stream is already current."
        : "Discord source selection is approved and saved. Session Activity will resume it from a fresh baseline when the owner destination is open.";
    } catch (error) {
      if (error instanceof Error &&
          ["setup_contract_discord_exact_chat_grant_missing",
            "setup_contract_discord_exact_chat_grant_unavailable"].includes(error.message))
        return "Discord could not verify the exact selected Codex chat under this approval. Recheck its local reader and contract scope.";
      return "Discord selection could not be confirmed from this approval. Inspect the exact source grants and linked destination in Session Activity.";
    }
  };

  const completeApprovedPairing = async (approved: OwnerRequest,
    reviewedRevision: string): Promise<string | null> => {
    const scope = approved.scopes.find(row => row.branch === "task_pairing");
    if (scope?.branch !== "task_pairing") return null;
    const continuationKey = `${approved.request_id}:${reviewedRevision}`;
    pairingRetryAt.current.set(continuationKey, Date.now() + 15_000);
    markPendingContinuation("pairing", continuationKey, true);
    if (approved.status !== "approved" ||
        approved.approval?.reviewedRevision !== reviewedRevision ||
        approved.approval.expiresAtMs <= Date.now())
      return "Paired-chat approval is no longer current; no invitation was issued.";
    try {
      const current = await fetch(
        "/api/account/session/agent-connections/reasoning-bindings/current" +
          `?helix_conversation_id=${encodeURIComponent(scope.helix_chat_ref)}`,
        { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } },
      );
      if (current.ok) {
        const binding = (await current.json())?.binding;
        const [taskHash, clientHash] = await Promise.all([
          hashSetupContractRef(approved.task_ref),
          typeof binding?.authenticated_mcp_client_ref === "string"
            ? hashSetupContractRef(binding.authenticated_mcp_client_ref) : null,
        ]);
        if (taskHash && clientHash && projectCurrentPairingFacts(binding, Date.now(),
          approved.profile_ref, scope.helix_chat_ref, taskHash,
          approved.mcp_client_ref_hash, clientHash)
          .some(fact => fact.stepId === "runtime_binding" && fact.state === "satisfied")) {
          pairingSettled.current.add(continuationKey);
          markPendingContinuation("pairing", continuationKey, false);
          return "This exact paired chat is already active; no invitation was issued.";
        }
        if (!taskHash || !clientHash || !matchesSetupContractPairingIdentity(binding,
          approved.profile_ref, scope.helix_chat_ref, taskHash,
          approved.mcp_client_ref_hash, clientHash) ||
          !["revoked", "expired", "superseded"].includes(binding.status))
          return "A different or unverified chat binding exists; no new invitation was issued.";
        // A terminal binding for this exact identity does not consume a new
        // reviewed contract. Continue through registration and server consent.
      }
      if (!current.ok && current.status !== 404) {
        // Durable access rejects an expired grant with 409 rather than returning
        // its old binding. A newly approved exact contract can replace that
        // grant; registration, owner trust and issuance are still rechecked below.
        const failure = await current.json().catch(() => null);
        if (current.status !== 409 || failure?.error !== "pairing_expired")
          return "Paired-chat state could not be verified; no invitation was issued.";
      }

      const registrations = await listPairingDestinations();
      const prepared = await prepareApprovedContractPairing(approved,
        registrations.destinations, Date.now(), hashSetupContractRef);
      if (!prepared.ok) return prepared.reason === "registration_missing"
        ? "This exact task must refresh its pairing registration; no invitation was issued."
        : `Paired-chat setup is waiting (${prepared.reason}); no invitation was issued.`;
      const prior = await reconcilePairingInvitation(prepared.request.requestId);
      const freshRead = await fetch("/api/desktop/setup-contract/requests", {
        credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" },
      });
      if (!freshRead.ok) return "Contract approval could not be rechecked; no invitation was issued.";
      const freshBody = await freshRead.json();
      const freshCurrent = Array.isArray(freshBody?.requests)
        ? freshBody.requests.find((row: unknown) =>
          requestSchema.safeParse(row).success &&
          (row as OwnerRequest).request_id === approved.request_id) : null;
      const fresh = freshCurrent ?? signedOwnerRequest(freshBody, approved.request_id) ??
        await continuedOwnerRequest(freshBody, approved.request_id);
      if (!fresh || fresh.status !== "approved" ||
          fresh.review_revision !== approved.review_revision ||
          fresh.approval?.reviewedRevision !== reviewedRevision ||
          fresh.approval.expiresAtMs <= Date.now() ||
          fresh.profile_ref !== approved.profile_ref ||
          fresh.installation_ref !== approved.installation_ref ||
          fresh.executable_sha256 !== approved.executable_sha256 ||
          fresh.package_sha256 !== approved.package_sha256 ||
          fresh.task_ref !== approved.task_ref ||
          fresh.mcp_client_ref_hash !== approved.mcp_client_ref_hash ||
          JSON.stringify(fresh.scopes) !== JSON.stringify(approved.scopes))
        return "Contract approval changed before pairing; no invitation was issued.";
      const confirm = (pairing: typeof prior.pairing) => pairing &&
        pairing.chatId === prepared.request.chatId &&
        pairing.destinationDigest === prepared.destinationDigest &&
        pairing.environment === null &&
        pairing.pairingExpiresAt &&
        Date.parse(pairing.pairingExpiresAt) <= approved.approval!.expiresAtMs + 60_000;
      if (prior.pairing) {
        if (!confirm(prior.pairing)) return "Existing pairing request differs from this approved scope; no invitation was issued.";
        if (["accepted", "pending", "expired", "revoked", "superseded"]
          .includes(prior.pairing.state))
          pairingSettled.current.add(continuationKey);
        if (prior.pairing.state === "accepted" || prior.pairing.state === "pending" ||
            prior.pairing.state === "expired" || prior.pairing.state === "revoked" ||
            prior.pairing.state === "superseded")
          markPendingContinuation("pairing", continuationKey, false);
        return prior.pairing.state === "accepted"
          ? "Paired-chat grant is accepted; this task must recover its current runtime binding."
          : prior.pairing.state === "pending"
            ? "Private paired-chat invitation is already pending for this exact task."
            : "The earlier paired-chat invitation ended; review a new contract before issuing another.";
      }
      try {
        const issued = await issuePairingInvitation(prepared.request);
        if (!confirm(issued.pairing) || issued.privatePickup !== true || issued.invitation !== null)
          return "Paired-chat invitation response did not match the approved scope; inspect it before continuing.";
        pairingSettled.current.add(continuationKey);
        markPendingContinuation("pairing", continuationKey, false);
        return "Private paired-chat invitation issued for this exact task and chat. The task must accept it through MCP.";
      } catch {
        const recovered = await reconcilePairingInvitation(prepared.request.requestId).catch(() => null);
        if (recovered?.pairing && confirm(recovered.pairing)) {
          pairingSettled.current.add(continuationKey);
          markPendingContinuation("pairing", continuationKey, false);
          return "Private paired-chat invitation was reconciled for this exact task; the task must accept it through MCP.";
        }
        return "Paired-chat invitation outcome is unconfirmed. Keep this request and recheck it before another review.";
      }
    } catch {
      return "Paired-chat setup could not be verified; no new invitation was confirmed.";
    }
  };

  React.useEffect(() => {
    if (busy || inspectionFailed || selectedWorkflowStatus !== "approved" ||
        !selected?.approval || selected.approval.expiresAtMs <= Date.now()) return;
    const approved = selected;
    const key = `${approved.request_id}:${approved.review_revision}`;
    const run = async () => {
      if (continuationRunning.current || Date.now() >= approved.approval!.expiresAtMs) return;
      const pairingDue = approved.scopes.some(scope => scope.branch === "task_pairing") &&
        (pendingContinuation("pairing", key) || pairingRetryAt.current.has(key)) &&
        !pairingSettled.current.has(key) &&
        Date.now() >= (pairingRetryAt.current.get(key) ?? 0);
      const discordDue = approved.scopes.some(scope => scope.branch === "discord_stream") &&
        (pendingContinuation("discord", key) || discordRetryAt.current.has(key)) &&
        !discordSettled.current.has(key) &&
        Date.now() >= (discordRetryAt.current.get(key) ?? 0);
      const responsesDue = approved.scopes.some(scope => scope.branch === "responses_session") &&
        (pendingContinuation("responses", key) || responsesRetryAt.current.has(key)) &&
        !responsesSettled.current.has(key) &&
        responsesObservation?.requestId === approved.request_id &&
        responsesObservation.providerReady &&
        (approved.connection_kind === "personal_stdio" ||
          tunnel?.ready && tunnel.scope === "full_helix_agent") &&
        Date.now() >= (responsesRetryAt.current.get(key) ?? 0);
      if (!pairingDue && !discordDue && !responsesDue) return;
      continuationRunning.current = true;
      try {
        const results: string[] = [];
        if (pairingDue) {
          const result = await completeApprovedPairing(approved, approved.review_revision);
          if (result) results.push(result);
        }
        if (discordDue) {
          const result = await completeApprovedDiscord(approved, approved.review_revision);
          if (result) results.push(result);
        }
        if (responsesDue) {
          const result = await completeApprovedResponses(approved, approved.review_revision);
          if (result) results.push(result);
        }
        if (results.length) setMessage(results.join(" "));
      } finally { continuationRunning.current = false; }
    };
    void run();
    const timer = window.setInterval(() => { void run(); }, 4_000);
    return () => window.clearInterval(timer);
  }, [busy, inspectionFailed, selectedId, selectedWorkflowStatus,
    selected?.review_revision, selected?.approval?.expiresAtMs,
    streamDeviceRef, codexStreamGrants, codexStreamGrantsObservedAtMs,
    observedAtMs, responsesObservation, tunnel]);

  const revokeContinuation = async () => {
    if ((!continuation && !selectedScopeContinuation) || busy) return;
    setBusy(true);
    try {
      const selectedScopes = Boolean(selectedScopeContinuation);
      const response = await fetch(`/api/desktop/setup-contract/${selectedScopes
        ? "selected-scope" : "full-harness"}-continuation/revoke`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw Error("setup_contract_continuation_revoke_failed");
      let stopped = true;
      try {
        const current = parseDesktopMcpTunnelState(await window.casimirDesktop?.getMcpTunnelState?.());
        const carriesFullHarness = (selectedScopeContinuation ?? continuation)?.scopes.some(
          scope => scope.branch === "full_harness");
        if (carriesFullHarness && current?.ready && current.scope === "full_helix_agent") {
          if (!window.casimirDesktop?.stopMcpTunnel) throw Error("setup_contract_tunnel_stop_unavailable");
          await window.casimirDesktop.stopMcpTunnel();
        }
      } catch { stopped = false; }
      setMessage(stopped
        ? selectedScopes
          ? "Prior selected-scope approval revoked. Automatic continuation is off."
          : "Prior Full Harness approval revoked. Automatic continuation is off."
        : "Approval revoked, but the current tunnel stop could not be confirmed. Stop it in Device Check.");
      await refresh(true);
    } catch {
      setMessage("Approval revocation or tunnel stop could not be confirmed. Check Device Check and retry.");
    } finally { setBusy(false); }
  };

  const mutate = async (request: OwnerRequest, action: "revise" | "approve" | "revoke",
    selectedBranches?: readonly HelixSetupContractBranch[]) => {
    if (action === "revoke" && selectedScopeContinuation?.request_id === request.request_id) {
      await revokeContinuation();
      return;
    }
    generation.current += 1;
    setBusy(true);
    const continueApproved = (approved: OwnerRequest, prefix: string) => {
      // The owner approval is durable before these independent service
      // checks run. A slow native Discord or pairing read must not leave the
      // owner staring at an indefinite "Approving…" state.
      continuationRunning.current = true;
      setMessage(`${prefix} Checking the selected services…`);
      setBusy(false);
      void Promise.allSettled([
        completeApprovedTransport(approved, request.review_revision),
        completeApprovedResponses(approved, request.review_revision),
        completeApprovedDiscord(approved, request.review_revision),
        completeApprovedPairing(approved, request.review_revision),
      ]).then(results => {
        const messages = results.flatMap(result =>
          result.status === "fulfilled" && result.value ? [result.value] : []);
        const incomplete = results.some(result => result.status === "rejected");
        setMessage([prefix, ...messages,
          ...(incomplete ? ["One selected-service check is unconfirmed; inspect it before retrying."] : [])]
          .join(" "));
      }).finally(() => { continuationRunning.current = false; });
    };
    try {
      const response = await fetch(`/api/desktop/setup-contract/requests/${encodeURIComponent(request.request_id)}/${action}`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(action === "revoke" ? {} : action === "revise"
          ? { expected_revision: request.review_revision, selected_branches: selectedBranches }
          : { expected_revision: request.review_revision }),
      });
      const body = await response.json();
      if (!response.ok || body?.ok !== true) throw new Error(body?.error ?? "setup_contract_change_failed");
      const next = requestSchema.parse(body.request);
      if (action === "revoke") {
        const key = `${next.request_id}:${request.review_revision}`;
        markPendingContinuation("pairing", key, false);
        markPendingContinuation("discord", key, false);
        markPendingContinuation("responses", key, false);
      }
      setRequests(current => current.map(row => row.request_id === next.request_id ? next : row));
      if (action === "approve")
        continueApproved(next, "Setup intent approved.");
      else setMessage(action === "revoke" ? "Setup intent revoked." :
        "Selected purposes updated; review the new scope.");
    } catch (error) {
      const current = (await refresh(true))?.find(row => row.request_id === request.request_id);
      const selectedMatches = selectedBranches && current &&
        (current.planned_branches ?? current.scopes.map(scope => scope.branch)).length ===
          selectedBranches.length &&
        selectedBranches.every(branch => (current.planned_branches ??
          current.scopes.map(scope => scope.branch)).includes(branch));
      if (action === "approve" && current?.status === "approved" &&
          current.approval?.reviewedRevision === request.review_revision) {
        continueApproved(current,
          "Setup intent approval confirmed after rechecking this exact request.");
      } else if (action === "revoke" && current?.status === "revoked") {
        setMessage("Setup intent revocation confirmed after rechecking this exact request.");
      } else if (action === "revise" && current?.status === "pending_owner_review" &&
          current.review_revision !== request.review_revision && selectedMatches) {
        setMessage("The selected scope is current after rechecking this exact request. Review its new revision.");
      } else {
        setMessage(error instanceof Error ? error.message : "Setup contract change failed.");
        setReviewAttempt(previous => previous + 1);
      }
    } finally { setBusy(false); }
  };

  if (!available) return null;
  const branches = selected?.planned_branches ??
    selected?.scopes.map(scope => scope.branch) ?? [];
  const facts: HelixSetupContractFact[] = [];
  if (selected && observedAtMs) {
    facts.push(...selected.facts);
    if (pairingObservation?.requestId === selected.request_id) facts.push(...pairingObservation.facts);
    if (minecraftObservation?.requestId === selected.request_id) facts.push(...minecraftObservation.facts);
    if (roomObservation?.requestId === selected.request_id)
      facts.push(...roomObservation.facts);
    if (discordObservation?.requestId === selected.request_id)
      facts.push(...discordObservation.facts);
    if (responsesObservation?.requestId === selected.request_id)
      facts.push(...responsesObservation.facts);
    facts.push({
      stepId: "profile", state: "satisfied", observedAtMs, validUntilMs: observedAtMs + 15_000,
      evidenceRef: `native:setup-contract-owner-read:${selected.request_id}`,
    });
    if (selected.connection_kind === "developer_tunnel") {
      const developerFact = projectLocalDeveloperGrantFact(developerView, observedAtMs,
        selected.profile_ref, selected.installation_ref);
      if (developerFact) facts.push(developerFact);
    }
    const discordScope = selected.scopes.find(scope => scope.branch === "discord_stream");
    if (discordScope?.branch === "discord_stream" && streamDeviceRef) {
      const streamFact = projectLocalCodexStreamGrantFact(codexStreamGrants,
        codexStreamGrantsObservedAtMs,
        selected.profile_ref, streamDeviceRef, discordScope.source_refs);
      if (streamFact) facts.push(streamFact);
    }
    if (selected.connection_kind === "developer_tunnel" && tunnel) facts.push({
      stepId: "transport",
      state: tunnel.ready && tunnel.scope === "full_helix_agent" ? "satisfied" : "owner_action_required",
      observedAtMs, validUntilMs: observedAtMs + 5_000,
      evidenceRef: `native:tunnel:${tunnel.status}:${tunnel.scope}`,
      reasonCode: tunnel.ready && tunnel.scope === "full_helix_agent" ? undefined : "transport_not_ready",
    });
  }
  const projection = projectHelixSetupContract({ requestedBranches: branches, facts,
    nowMs: clock, roomAuthority: selectedRoomAuthority,
    connectionKind: selected?.connection_kind });
  const currentDeveloperFact = selected && observedAtMs
    ? projectLocalDeveloperGrantFact(developerView, observedAtMs,
      selected.profile_ref, selected.installation_ref) : null;
  const startFullHarnessOnApprove = Boolean(selected?.connection_kind === "developer_tunnel" &&
    branches.includes("full_harness") &&
    window.casimirDesktop?.startMcpTunnel &&
    tunnel?.ready && tunnel.scope === "local_supervisor_coordination_and_device_check" &&
    currentDeveloperFact?.state === "satisfied" &&
    currentDeveloperFact.validUntilMs > clock);
  const authorizeRoomFromContract = async () => {
    if (!selected || selectedWorkflowStatus !== "approved" || !roomRequested ||
        projection.steps.find(step => step.id === "room_authorization")?.state !== "owner_action_required" ||
        !window.casimirDesktop?.openAuth0AccountLink) return;
    setBusy(true);
    setStepMessage(null);
    try {
      const response = await fetch(DESKTOP_AUTH0_PROGRAM_CONNECTION_START_PATH, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: selected.request_id }),
      });
      if (!response.ok) throw new Error("room_authorization_start_failed");
      const receipt = parseDesktopAuth0AccountLinkStartReceipt(await response.json());
      if (!receipt || receipt.authorization_purpose !== "shared_live_rooms")
        throw new Error("invalid_room_authorization_receipt");
      await window.casimirDesktop.openAuth0AccountLink(receipt.authorization_url);
      setStepMessage("Complete room authorization in your browser. This contract will recheck the grant when you return.");
    } catch {
      setStepMessage("Room authorization could not start. Check the account and room service, then retry this step.");
    } finally { setBusy(false); }
  };
  const authorizeCompanionWorldAuthority = async () => {
    const mission = selected?.scopes.find(scope => scope.branch === "companion_mission");
    if (!selected || selectedWorkflowStatus !== "approved" ||
        !selected.approval || selected.approval.expiresAtMs <= Date.now() ||
        selected.approval.reviewedRevision !== selected.review_revision ||
        mission?.branch !== "companion_mission" ||
        hostedSourceScope?.branch !== "shared_room" ||
        hostedSourceScope.room_ref !== mission.hosted_room_ref ||
        !window.casimirDesktop?.openAuth0AccountLink) return;
    setBusy(true);
    setStepMessage(null);
    try {
      const response = await fetch(DESKTOP_AUTH0_PROGRAM_CONNECTION_START_PATH, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: selected.request_id,
          world_authority: true }),
      });
      if (!response.ok) throw new Error("world_authority_authorization_start_failed");
      const receipt = parseDesktopAuth0AccountLinkStartReceipt(await response.json());
      if (!receipt || receipt.authorization_purpose !== "shared_live_rooms")
        throw new Error("invalid_world_authority_authorization_receipt");
      await window.casimirDesktop.openAuth0AccountLink(receipt.authorization_url);
      setStepMessage("Review the World Authority permissions in your browser. The approved companion review and one-hour lease remain separate checks.");
    } catch {
      setStepMessage("World Authority authorization could not start. Refresh the exact approved review and try again.");
    } finally { setBusy(false); }
  };
  const preflightReviewedHostedSource = async () => {
    if (busy) return;
    const blocker = !selected || selectedWorkflowStatus !== "approved" ||
      inspectionFailed || !selected.approval ? "source_review_not_current" :
      hostedSourceScope?.branch !== "shared_room" ||
      hostedSourceScope.room_authority !== "hosted" ||
      !hostedSourceScope.source_ingress?.local_room_ref ? "source_target_not_current" :
      selected.approval.reviewedRevision !== selected.review_revision ?
        "source_review_revision_changed" :
      selected.approval.expiresAtMs <= Date.now() ? "source_review_expired" : null;
    if (blocker) {
      setStepMessage(`Hosted source readiness was not checked (${blocker}). Refresh the exact review; no credential was created.`);
      return;
    }
    if (!selected || !hostedSourceScope?.source_ingress?.local_room_ref) return;
    setBusy(true);
    setStepMessage("Checking the reviewed hosted source; no credential is being created.");
    try {
      const response = await fetch(DESKTOP_AUTH0_ROOM_CONTROL_PATH, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "source_preflight_reviewed",
          contract_request_id: selected.request_id,
          room_id: hostedSourceScope.room_ref,
          local_room_id: hostedSourceScope.source_ingress.local_room_ref }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json().catch(() => null);
      const receipt = z.object({ ok: z.literal(true), status: z.literal("ready"),
        room_id: z.literal(hostedSourceScope.room_ref), world_id: z.string().min(1),
        credential_included: z.literal(false),
        player_release_commands_available: z.boolean().optional(),
        player_release_profile_proofs_available: z.boolean().optional(),
      }).passthrough().safeParse(body);
      if (!response.ok || !receipt.success)
        throw new Error(typeof body?.error === "string" ? body.error :
          "room_source_preflight_unconfirmed");
      const releaseStatus = receipt.data.player_release_commands_available === false
        ? " Per-player sharing is unavailable for this hosted room; player details will remain hidden from GPT Live and paired Codex until its separate qualification is enabled."
        : receipt.data.player_release_commands_available === true
          ? receipt.data.player_release_profile_proofs_available === true
            ? " Player release commands and profile proofs are available for this hosted room, subject to each player's own release."
            : " Player release commands are available for this hosted room; profile proofs are unavailable. Each player still needs their own release."
          : " Player-release availability was not reported by this hosted route; check it before relying on individual player details.";
      setStepMessage(`The hosted route accepts this exact reviewed world and room. No source or credential was created. Open the selected world and wait for server ticks before staging the short-lived sensor pairing.${releaseStatus}`);
    } catch (error) {
      const code = error instanceof Error ? error.message : "room_source_preflight_unconfirmed";
      setStepMessage(code === "room_owner_presence_required"
        ? "The hosted room owner is currently away. Open that exact room as the same authorized account, then check readiness again. The selected world was not staged."
        : code === "room_source_remote_insufficient_scope_http_403"
          ? "This room authorization lacks source-management access. Reauthorize the room service in Rooms and approve the requested source scope, then check readiness again. The selected world was not staged."
        : code === "room_owner_node_changed"
          ? "This hosted room has an owner-node reservation from another process, or its current reservation is nearing expiry. A live reservation will not be taken over. Check readiness again after that reservation ends. The selected world was not staged."
        : `Hosted world source readiness was not confirmed (${code}). The selected world was not staged; check the hosted route before launching Minecraft.`);
    } finally { setBusy(false); }
  };
  const stageReviewedHostedSource = async () => {
    if (busy) return;
    const blocker = !selected || selectedWorkflowStatus !== "approved" ||
      inspectionFailed || !selected.approval ? "source_review_not_current" :
      hostedSourceScope?.branch !== "shared_room" ||
      hostedSourceScope.room_authority !== "hosted" ||
      !hostedSourceScope.source_ingress?.local_room_ref ? "source_target_not_current" :
      selected.approval.reviewedRevision !== selected.review_revision ?
        "source_review_revision_changed" :
      selected.approval.expiresAtMs <= Date.now() ? "source_review_expired" : null;
    if (blocker) {
      setStepMessage(`World source staging was not started (${blocker}). Refresh the exact review before retrying; no credential was created.`);
      return;
    }
    if (!selected || !hostedSourceScope?.source_ingress?.local_room_ref) return;
    setBusy(true);
    setStepMessage("Staging the reviewed read-only world source; waiting for the hosted receipt.");
    try {
      const response = await fetch(DESKTOP_AUTH0_ROOM_CONTROL_PATH, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "source_stage_reviewed",
          contract_request_id: selected.request_id,
          room_id: hostedSourceScope.room_ref,
          local_room_id: hostedSourceScope.source_ingress.local_room_ref }),
        signal: AbortSignal.timeout(45_000),
      });
      const body = await response.json().catch(() => null);
      const receipt = z.object({ ok: z.literal(true),
        status: z.literal("server_pairing_inbox_staged"),
        room_id: z.literal(hostedSourceScope.room_ref),
        binding_id: z.string().startsWith("room_source_binding:"),
        world_id: z.string().min(1), credential_included: z.literal(false),
      }).passthrough().safeParse(body);
      if (!response.ok || !receipt.success)
        throw new Error(typeof body?.error === "string" ? body.error :
          "room_source_handoff_unconfirmed");
      setStepMessage(`The reviewed read-only world source was staged for the selected Fabric sensor. Non-secret source binding: ${receipt.data.binding_id}. Its pairing code expires shortly; check the sensor and hosted source status before restaging.`);
    } catch (error) {
      const code = error instanceof Error ? error.message : "room_source_handoff_unconfirmed";
      setStepMessage(`World source staging was not confirmed (${code}). Inspect the exact hosted source before retrying; no Minecraft action was granted.`);
    } finally { setBusy(false); }
  };
  const prepareReviewedCompanionActor = async () => {
    const mission = selected?.scopes.find(scope =>
      scope.branch === "companion_mission");
    if (busy || inspectionFailed || !selected ||
        selectedWorkflowStatus !== "approved" || !selected.approval ||
        selected.approval.reviewedRevision !== selected.review_revision ||
        selected.approval.expiresAtMs <= Date.now() ||
        mission?.branch !== "companion_mission" ||
        hostedSourceScope?.branch !== "shared_room" ||
        hostedSourceScope.room_ref !== mission.hosted_room_ref ||
        hostedSourceScope.source_ingress?.local_room_ref !==
          mission.local_room_ref) {
      setStepMessage("Companion preparation needs a current exact review and matching selected world. No actor ticket was staged.");
      return;
    }
    setBusy(true);
    setStepMessage("Staging one local ticket for the reviewed inert companion.");
    try {
      const response = await fetch(
        `/api/desktop/setup-contract/requests/${encodeURIComponent(selected.request_id)}/companion/prepare-actor`, {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ expected_revision: selected.review_revision }),
          signal: AbortSignal.timeout(15_000),
        });
      const body = await response.json().catch(() => null);
      const receipt = z.object({ ok: z.literal(true), actor_prepare: z.object({
        request_id: z.literal(selected.request_id),
        expires_at_ms: z.number().int(),
        state: z.literal("local_one_use_ticket_staged"),
        effect_authority: z.literal(false),
      }).strict() }).passthrough().safeParse(body);
      if (!response.ok || !receipt.success)
        throw new Error(typeof body?.error === "string" ? body.error :
          "companion_actor_prepare_unconfirmed");
      setStepMessage("The one-use companion preparation ticket was staged for this selected world. Check the in-game inert actor before reviewing Start; no movement or block action is granted.");
    } catch (error) {
      setStepMessage(`Companion preparation was not confirmed (${error instanceof Error
        ? error.message : "companion_actor_prepare_unconfirmed"}). Inspect the world and request before retrying.`);
    } finally { setBusy(false); }
  };
  const inspectReviewedCompanionActor = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/desktop/setup-contract/requests/${encodeURIComponent(selected.request_id)}/companion/actor`, {
          credentials: "same-origin", cache: "no-store",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
      const body = await response.json().catch(() => null);
      const receipt = z.object({ ok: z.literal(true), actor_prepare: z.object({
        state: z.enum(["none", "ticket_pending",
          "claimed_waiting_for_actor", "actor_current", "review_inactive"]),
        expires_at_ms: z.number().int().nullable(),
        actor_id: z.string().uuid().nullable(),
        effect_authority: z.literal(false),
      }).strict() }).passthrough().safeParse(body);
      if (!response.ok || !receipt.success)
        throw new Error(typeof body?.error === "string" ? body.error :
          "companion_actor_inspection_unconfirmed");
      setStepMessage(`Companion preparation: ${receipt.data.actor_prepare.state}. ${
        receipt.data.actor_prepare.actor_id ?? "No current actor ID"}. No effect grant exists from this status.`);
    } catch (error) {
      setStepMessage(`Companion inspection failed (${error instanceof Error
        ? error.message : "companion_actor_inspection_unconfirmed"}).`);
    } finally { setBusy(false); }
  };
  const cancelReviewedCompanionActor = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/desktop/setup-contract/requests/${encodeURIComponent(selected.request_id)}/companion/cancel-actor`, {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ expected_revision: selected.review_revision }),
          signal: AbortSignal.timeout(10_000),
        });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true ||
          body?.actor_prepare?.state !== "cancelled")
        throw new Error(typeof body?.error === "string" ? body.error :
          "companion_actor_cancel_unconfirmed");
      setStepMessage("Companion preparation cancelled. A claimed inert actor is dismissed on its next local status check; F10 stops it immediately in Minecraft.");
    } catch (error) {
      setStepMessage(`Companion cancellation was not confirmed (${error instanceof Error
        ? error.message : "companion_actor_cancel_unconfirmed"}). Use F10 in Minecraft for immediate local stop.`);
    } finally { setBusy(false); }
  };
  const runReviewedCompanionOwnerStep = async (step:
    "confirm-start" | "issue-native-grant" |
    "configure-world-authority" | "prepare-native-install") => {
    if (busy || inspectionFailed || !selected ||
        selectedWorkflowStatus !== "approved" || !selected.approval ||
        selected.approval.reviewedRevision !== selected.review_revision ||
        selected.approval.expiresAtMs <= Date.now() ||
        !selected.scopes.some(scope => scope.branch === "companion_mission")) {
      setStepMessage("Companion session needs a current exact owner review. Nothing was staged.");
      return;
    }
    setBusy(true);
    setStepMessage("Checking the exact companion session with its owning services.");
    try {
      const response = await fetch(
        `/api/desktop/setup-contract/requests/${encodeURIComponent(selected.request_id)}/companion/${step}`, {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { Accept: "application/json",
            "Content-Type": "application/json" },
          body: JSON.stringify({ expected_revision: selected.review_revision }),
          signal: AbortSignal.timeout(20_000),
        });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true)
        throw new Error(typeof body?.error === "string" ? body.error :
          "companion_owner_step_unconfirmed");
      if (step === "confirm-start") {
        const receipt = z.object({ start_action: z.object({
          request_id: z.literal(selected.request_id),
          action_id: z.string().min(1),
          effect_authority: z.literal(false),
        }).passthrough() }).passthrough().safeParse(body);
        if (!receipt.success)
          throw new Error("companion_start_receipt_invalid");
        setStepMessage("Reviewed Start recorded. Issue its checked native grant within one minute; no game effect or model call started.");
      } else if (step === "issue-native-grant") {
        const receipt = z.object({ native_grant: z.object({
          grant_id: z.string().min(1),
          fabric_installation: z.literal(false),
          expires_at_ms: z.number().int(),
        }).passthrough() }).passthrough().safeParse(body);
        if (!receipt.success)
          throw new Error("companion_native_grant_receipt_invalid");
        setStepMessage(`Native grant checked until ${new Date(receipt.data.native_grant.expires_at_ms).toLocaleString()}. The companion is not installed or moving. Pair it separately when ready.`);
      } else if (step === "configure-world-authority") {
        const receipt = z.object({ world_authority: z.object({
          authority_id: z.string().min(1),
          member_grant_id: z.string().min(1),
          expires_at: z.string().datetime(),
          effect_authority: z.literal(false),
        }).passthrough() }).passthrough().safeParse(body);
        if (!receipt.success)
          throw new Error("companion_world_authority_receipt_invalid");
        setStepMessage(`World-build command lease ends ${new Date(receipt.data.world_authority.expires_at).toLocaleString()}. Other authorized room routes may use world-building commands during this lease. The companion still has no native movement or placement grant.`);
      } else {
        const receipt = z.object({ native_install: z.object({
          request_id: z.literal(selected.request_id),
          state: z.literal("local_one_use_ticket_staged"),
          fabric_installation: z.literal(false),
          effect_authority: z.literal(false),
        }).passthrough() }).passthrough().safeParse(body);
        if (!receipt.success)
          throw new Error("companion_native_install_receipt_invalid");
        setStepMessage("One-use Fabric pairing staged. Wait for the in-game companion kit status; the bridge permits only owner-supplied kit pickup until a separate mission Start.");
      }
    } catch (error) {
      setStepMessage(`Companion session step was not confirmed (${error instanceof Error
        ? error.message : "companion_owner_step_unconfirmed"}). Inspect the exact review and actor before retrying.`);
    } finally { setBusy(false); }
  };
  const controlReviewedCompanionMission = async (operation:
    "inspect" | "start" | "stop") => {
    if (!selected || (operation === "stop" ? companionStopBusy : busy) ||
        !selected.scopes.some(scope =>
      scope.branch === "companion_mission")) return;
    if (operation === "start" && (inspectionFailed ||
        selectedWorkflowStatus !== "approved" || !selected.approval ||
        selected.approval.reviewedRevision !== selected.review_revision ||
        selected.approval.expiresAtMs <= Date.now())) {
      setStepMessage("A current exact review is required before mission Start. No model or game action ran.");
      return;
    }
    if (operation === "stop") {
      companionStopEpoch.current++;
      setCompanionStopBusy(true);
    } else setBusy(true);
    const stopEpoch = companionStopEpoch.current;
    try {
      const endpoint = operation === "inspect" ? "session" :
        operation === "start" ? "start-mission" : "stop-mission";
      const response = await fetch(
        `/api/desktop/setup-contract/requests/${encodeURIComponent(selected.request_id)}/companion/${endpoint}`, {
          method: operation === "inspect" ? "GET" : "POST",
          credentials: "same-origin", cache: "no-store",
          headers: { Accept: "application/json",
            ...(operation === "inspect" ? {} :
              { "Content-Type": "application/json" }) },
          ...(operation === "start" ? { body: JSON.stringify({
            expected_revision: selected.review_revision }) } :
            operation === "stop" ? { body: "{}" } : {}),
          signal: AbortSignal.timeout(operation === "stop" ? 10_000 : 20_000),
        });
      const body = await response.json().catch(() => null);
      const receipt = z.object({ ok: z.literal(true),
        companion_session: z.object({
          status: z.enum(["prepared", "running", "holding", "stopped", "completed"]),
          kit_items_current: z.number().int().nonnegative(),
          placement_count: z.number().int().nonnegative(),
          maximum_placements: z.number().int().positive(),
          program_version: z.number().int().positive().nullable(),
          hold_reason: z.string().nullable(),
          remaining_placements: z.number().int().nonnegative().optional(),
          region_center: z.object({ x: z.number().int(), y: z.number().int(),
            z: z.number().int() }).optional(),
          region_radius_blocks: z.number().positive().optional(),
          protected_box: z.object({ min: z.object({ x: z.number().int(),
            y: z.number().int(), z: z.number().int() }), max: z.object({
            x: z.number().int(), y: z.number().int(), z: z.number().int() }) }).optional(),
          grant_expires_at: z.string().optional(),
          evidence_revision: z.number().int().nonnegative().optional(),
          evidence_age_ms: z.number().nonnegative().nullable().optional(),
          remaining_budget_usd: z.number().nonnegative().nullable().optional(),
          budget_status: z.enum(["current", "unavailable"]).optional(),
        }).passthrough() }).passthrough().safeParse(body);
      if (!response.ok || !receipt.success)
        throw new Error(typeof body?.error === "string" ? body.error :
          "companion_session_unconfirmed");
      const session = receipt.data.companion_session;
      const center = session.region_center;
      const box = session.protected_box;
      const inspectDetails = operation === "inspect" ?
        ` Reviewed region ${center ? `${center.x},${center.y},${center.z}` : "unavailable"}` +
        ` within ${session.region_radius_blocks ?? "?"} blocks; protected box ${box
          ? `${box.min.x},${box.min.y},${box.min.z} to ${box.max.x},${box.max.y},${box.max.z}`
          : "unavailable"}; remaining placements ${session.remaining_placements ?? "?"}.` +
        ` Evidence revision ${session.evidence_revision ?? "?"}, age ${session.evidence_age_ms === null || session.evidence_age_ms === undefined
          ? "unavailable" : `${Math.round(session.evidence_age_ms)} ms`}.` +
        ` Responses budget ${session.budget_status === "current" &&
          session.remaining_budget_usd !== null && session.remaining_budget_usd !== undefined
          ? `$${session.remaining_budget_usd.toFixed(4)} remaining` : "unavailable"}.` +
        (session.grant_expires_at ? ` Grant expires ${new Date(session.grant_expires_at).toLocaleString()}.` : "") : "";
      if (operation !== "stop" && stopEpoch !== companionStopEpoch.current) return;
      setStepMessage(`Companion ${session.status}; native kit ${session.kit_items_current}/192, placements ${session.placement_count}/${session.maximum_placements}, program v${session.program_version ?? "none"}.${
        session.hold_reason ? ` Reason: ${session.hold_reason}.` : ""}${
        operation === "start" ? " The first bounded Responses revision is now scheduled; native effects still require current evidence." : ""}${inspectDetails}`);
    } catch (error) {
      if (operation !== "stop" && stopEpoch !== companionStopEpoch.current) return;
      setStepMessage(`Companion ${operation} was not confirmed (${error instanceof Error
        ? error.message : "companion_session_unconfirmed"}). Use F10 in Minecraft for an immediate local stop if needed.`);
    } finally {
      if (operation === "stop") setCompanionStopBusy(false);
      else setBusy(false);
    }
  };
  const verifyReviewedCompanionShelter = async () => {
    if (!selected || busy || inspectionFailed ||
        selectedWorkflowStatus !== "approved" || !selected.approval ||
        selected.approval.reviewedRevision !== selected.review_revision ||
        selected.approval.expiresAtMs <= Date.now() ||
        !selected.scopes.some(scope => scope.branch === "companion_mission")) {
      setStepMessage("Shelter verification needs a current exact companion review. No completion was recorded.");
      return;
    }
    setBusy(true);
    setStepMessage("Pausing the companion and measuring the finished shelter and inventory.");
    try {
      const response = await fetch(
        `/api/desktop/setup-contract/requests/${encodeURIComponent(selected.request_id)}/companion/verify-shelter`, {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: "{}", signal: AbortSignal.timeout(45_000),
        });
      const body = await response.json().catch(() => null);
      const receipt = z.object({ ok: z.literal(true),
        companion_shelter: z.object({ verified: z.literal(true),
          placed: z.number().int().positive(),
          evidence_refs: z.array(z.string()).min(1),
          doorway: z.enum(["north", "south", "east", "west"]),
          site_center: z.object({ x: z.number().int(), y: z.number().int(),
            z: z.number().int() }).strict(),
          player_entry_observed: z.literal(false),
        }).passthrough() }).passthrough().safeParse(body);
      if (!response.ok || !receipt.success)
        throw new Error(typeof body?.error === "string" ? body.error :
          "companion_shelter_not_verified");
      const shelter = receipt.data.companion_shelter;
      setStepMessage(`Shelter blocks verified at ${shelter.site_center.x},${shelter.site_center.y},${shelter.site_center.z}; ${shelter.placed} counted placements, ${shelter.doorway} doorway, ${shelter.evidence_refs.length} evidence pages. The companion is stopped. The player still needs to identify and enter it to complete the in-game test.`);
    } catch (error) {
      setStepMessage(`Shelter completion was not verified (${error instanceof Error
        ? error.message : "companion_shelter_not_verified"}). Inspect the mission and site before any retry; F10 remains the immediate local stop.`);
    } finally { setBusy(false); }
  };
  const openDiscordDestinationFromContract = (roomId: string) => {
    resumeOnUnmount.current = selected?.request_id ?? null;
    setOpen(false);
    window.dispatchEvent(new CustomEvent(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT,
      { detail: { hostedRoomId: roomId } }));
  };
  return (
    <section data-helix-guidance-target="setup-contract-review"
      className="mb-4 rounded-lg border border-cyan-300/25 bg-cyan-400/5 p-4 text-sm text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-semibold">Setup contracts</h2>
          <p className="text-xs text-slate-300">One review for this exact Codex request. Existing permissions remain separately enforced.</p></div>
        <button data-helix-control-id="workstation.panel.agent-access.setup-contract-inbox.refresh" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" onClick={() => void refresh()} className="rounded border border-white/20 px-2 py-1 text-xs">Refresh</button>
      </div>
      {requests.length === 0 ? <p className="mt-2 text-xs text-slate-400">No setup request from a connected task.</p> : (
        <div className="mt-3 space-y-2">
          {requests.map(request => <div key={request.request_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 p-2">
            <div><p className="font-medium">{request.declared_task_summary}</p>
              <p className="text-xs text-slate-400">{request.task_ref} · {request.status} · {request.planned_branches?.length ?? request.scopes.length} purpose(s)</p></div>
            <div className="flex gap-2">
              <button data-helix-control-id="workstation.panel.agent-access.setup-contract-inbox.review" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" onClick={() => { setSelectedId(request.request_id); setOpen(true); }}
                className="rounded border border-cyan-300/40 px-2 py-1 text-xs text-cyan-100">Review</button>
              {request.status === "approved" ? <button data-helix-control-id="workstation.panel.agent-access.setup-contract-inbox.revoke" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy}
                onClick={() => void mutate(request, "revoke")}
                className="rounded border border-rose-300/40 px-2 py-1 text-xs text-rose-100">Revoke</button> : null}
            </div>
          </div>)}
        </div>
      )}
      {(selectedScopeContinuation ?? continuation)?.approval ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-cyan-300/25 p-2">
        <div><p className="font-medium">{selectedScopeContinuation
          ? "Selected-scope approval eligible across this verified private update"
          : "Full Harness approval eligible across this private update"}</p>
          <p className="text-xs text-slate-400">{(selectedScopeContinuation ?? continuation)!.declared_task_summary} · expires {new Date((selectedScopeContinuation ?? continuation)!.approval!.expiresAtMs).toLocaleString()}</p>
          <p className="text-xs text-slate-500">Original receipt: {(selectedScopeContinuation ?? continuation)!.approval!.receiptRef}</p></div>
        <button data-helix-control-id="workstation.panel.agent-access.setup-contract-inbox.revoke-continued-approval" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy} onClick={() => void revokeContinuation()}
          className="rounded border border-rose-300/40 px-2 py-1 text-xs text-rose-100">Revoke continued approval</button>
      </div> : null}
      {message ? <p role="status" className="mt-2 text-xs text-amber-200">{message}</p> : null}
      {selected && selectedWorkflowStatus === "approved" &&
        selected.scopes.some(scope => scope.branch === "companion_resident_session")
        ? <CompanionResidentControl key={selected.request_id}
          requestId={selected.request_id}
          reviewRevision={selected.review_revision} /> : null}
      {selected ? <SetupContractDialog key={`${selected.request_id}:${selected.review_revision}:${reviewAttempt}`}
        open={open} onOpenChange={setOpen}
        workflowStatus={selectedWorkflowStatus!}
        connectionKind={selected.connection_kind}
        projection={projection} busy={busy} nowMs={clock}
        stepMessage={stepMessage}
        startFullHarnessOnApprove={startFullHarnessOnApprove}
        inspectionFailed={inspectionFailed} onRetry={() => void refresh()}
        availableBranches={selected.available_planned_branches ??
          selected.available_scopes.map(scope => scope.branch)}
        unboundBranches={branches.filter(branch =>
          !selected.scopes.some(scope => scope.branch === branch))}
        target={{ declaredSummary: selected.declared_task_summary,
          account: selected.profile_ref, installation: selected.installation_ref,
          executableSha256: selected.executable_sha256,
          packageSha256: selected.package_sha256,
          codexTask: selected.task_ref,
          maxAdditionalTasks: pairingScope?.branch === "task_pairing"
            ? pairingScope.future_tasks?.max_additional_tasks : undefined,
          mcpClientFingerprint: selected.mcp_client_ref_hash.slice(0, 12),
          helixChat: selected.scopes.find(scope => scope.branch === "task_pairing")?.helix_chat_ref ?? "Not selected",
          reviewUntil: new Date(selected.review_until_ms).toLocaleString(),
          requestedLeaseSeconds: selected.requested_lease_seconds,
          verifiedUpdateContinuation: selected.verified_update_continuation,
          signedUpdateContinuation: selected.signed_update_continuation,
          approvalUntil: selected.approval
            ? new Date(selected.approval.expiresAtMs).toLocaleString() : null,
          scopeLines: scopeLines(selected) }}
        review={{ revision: selected.review_revision, requestedBranches: branches,
          reviewableUntilMs: selected.review_until_ms,
          canApprove: selectedWorkflowStatus === "pending_owner_review" && !inspectionFailed }}
        onSelectionChange={selectedWorkflowStatus === "pending_owner_review" && !inspectionFailed
          ? next => void mutate(selected, "revise", next) : undefined}
        onApprove={revision => {
          if (inspectionFailed || revision !== selected.review_revision) return;
          void mutate(selected, "approve");
        }}
        onRevoke={() => void mutate(selected, "revoke")}
        hostedSourceStage={selectedWorkflowStatus === "approved" &&
          hostedSourceScope?.branch === "shared_room" &&
          hostedSourceScope.room_authority === "hosted" &&
          hostedSourceScope.source_ingress?.local_room_ref
          ? { hostedRoomId: hostedSourceScope.room_ref,
              localRoomId: hostedSourceScope.source_ingress.local_room_ref,
              worldFolder: hostedSourceScope.source_ingress.world_folder,
              onPreflight: () => void preflightReviewedHostedSource(),
              onStage: () => void stageReviewedHostedSource() }
          : undefined}
        companionActorPrepare={selected.scopes.some(scope =>
          scope.branch === "companion_mission") &&
          hostedSourceScope?.branch === "shared_room" &&
          hostedSourceScope.source_ingress?.local_room_ref
          ? { onPrepare: () => void prepareReviewedCompanionActor(),
              onInspect: () => void inspectReviewedCompanionActor(),
              onCancel: () => void cancelReviewedCompanionActor(),
              onConfirmStart: () => void runReviewedCompanionOwnerStep("confirm-start"),
              onIssueGrant: () => void runReviewedCompanionOwnerStep("issue-native-grant"),
              onConfigureWorldAuthority: () => void runReviewedCompanionOwnerStep("configure-world-authority"),
              onAuthorizeWorldAuthority: () => void authorizeCompanionWorldAuthority(),
              onPrepareInstall: () => void runReviewedCompanionOwnerStep("prepare-native-install"),
              onInspectMission: () => void controlReviewedCompanionMission("inspect"),
              onStartMission: () => void controlReviewedCompanionMission("start"),
              onStopMission: () => void controlReviewedCompanionMission("stop"),
              stopBusy: companionStopBusy,
              onVerifyShelter: () => void verifyReviewedCompanionShelter() }
          : undefined}
        onOpenStep={id => {
          if (id === "room_authorization" && selectedWorkflowStatus === "approved" &&
              projection.steps.find(step => step.id === id)?.state === "owner_action_required") {
            void authorizeRoomFromContract();
            return;
          }
          if (id === "discord_destination") {
            const scope = selected.scopes.find(row => row.branch === "discord_stream");
            if (scope?.branch === "discord_stream" &&
                !discordPersonalSessionIdSchema.safeParse(scope.destination_ref).success) {
              openDiscordDestinationFromContract(scope.destination_ref);
              return;
            }
          }
          resumeOnUnmount.current = selected.request_id;
          setOpen(false);
          let label = `Review ${id.replace(/_/g, " ")} in its owning panel.`;
          if (id === "room_membership" || id === "room_ai_release" ||
              id === "minecraft_player_selection" ||
              id === "minecraft_action_lease" ||
              id === "minecraft_command_authority") {
            const scope = selected.scopes.find(row =>
              id === "room_membership"
                ? row.branch === "shared_room" || row.branch === "room_ai_release" ||
                  row.branch === "minecraft_player" || row.branch === "minecraft_game"
                : id === "room_ai_release"
                  ? row.branch === "room_ai_release"
                  : row.branch === "minecraft_player" || row.branch === "minecraft_game");
            if (scope?.branch === "shared_room" || scope?.branch === "room_ai_release" ||
                scope?.branch === "minecraft_player" || scope?.branch === "minecraft_game") {
              const result = requestExactRoomReviewNavigation({ roomId: scope.room_ref,
                ...(scope.branch === "minecraft_player" || scope.branch === "minecraft_game"
                  ? { environmentBindingId: scope.environment_binding_ref } : {}) });
              label = result === "invalid_room"
                ? "The requested room ID cannot be opened automatically. Review its exact ID in Party Chat."
                : "Open the requested room and review its settings. No permission was activated.";
            }
          }
          requestWorkstationGuidance({ kind: "user_attention",
            ...setupContractStepGuidance(id, selected.connection_kind),
            label, durationMs: 12_000 });
        }} /> : null}
    </section>
  );
}
