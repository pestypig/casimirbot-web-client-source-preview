import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Cloud, Volume2 } from "lucide-react";
import { HELIX_REASONING_BINDING_UPDATED_EVENT, inspectCurrentReasoningBinding,
  type BrowserReasoningBinding } from "@/lib/agent-access/reasoningTaskBinding";
import { ManagedConversationConsoleHistory } from "@/components/agent-access/ManagedConversationConsoleHistory";
import { OwnerDiscordStreamActivity } from "@/components/agent-access/OwnerDiscordStreamActivity";
import { projectSessionActivity } from "@/components/agent-access/sessionActivityProjection";
import { useAdapterAiActivity } from "@/components/agent-access/useAdapterAiActivity";
import { AdapterAiActivityPanel } from "./AdapterAiActivityPanel";
import { BoundTaskConsoleHistory, type BoundTaskConsoleMessage } from "./BoundTaskConsoleHistory";
import { CodexConversationConsoleHistory } from "./CodexConversationConsoleHistory";
import { LocalRoomConsoleHistory } from "./shared-live-room/LocalRoomConsoleChannel";
import { HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT } from "./shared-live-room/SharedLiveRoomGuideProjection";
import { LocalRoomConsoleMission } from "./shared-live-room/LocalRoomConsoleMission";
import type { LocalRoomTextOwnerSnapshot } from "./shared-live-room/LocalRoomTextOwnerBridge";
import { HostedRoomConsoleHistory } from "./shared-live-room/HostedRoomConsoleChannel";
import { HostedRoomConsoleMission } from "./shared-live-room/HostedRoomConsoleMission";
import { NativeHostedRoomVoiceChannel } from "./shared-live-room/NativeHostedRoomVoiceChannel";
import { NativeHostedRoomInterpreterTurnHistory } from "./shared-live-room/NativeHostedRoomInterpreterTurnHistory";
import { NativeHostedRoomInterpreterProposalReview } from "./shared-live-room/NativeHostedRoomInterpreterProposalReview";
import { NativeSharedInterpreterReportsPanel } from "./shared-live-room/NativeSharedInterpreterReportsPanel";
import { SharedRoomInterpreterTurnHistory } from "./shared-live-room/SharedRoomInterpreterTurnHistory";
import { SharedRoomTextReleaseControls } from "./shared-live-room/SharedRoomTextReleaseControls";
import { NativeHostedRoomTextReleaseControls } from "./shared-live-room/NativeHostedRoomTextReleaseControls";
import { readCachedAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { isHostedRoomTextOwnerAdmitted,
  type HostedRoomTextOwnerSnapshot } from "./shared-live-room/NativeHostedRoomTextOwnerBridge";
import "./HelixConsoleConversationWorkspace.css";
import { useConversationPairing } from "./useConversationPairing";
import type { HelixMessageCloudFrame } from "@shared/helix-message-cloud";
import { helixCodexConsoleFrameSchema } from "@shared/helix-codex-mirror-frame";
import { projectDiscordFloatActivityEvent } from
  "@shared/discord-float-activity";
import { discordStreamEventSchema, discordStreamReceiptSchema,
  discordStreamSourceRef, discordStreamSourceForTurn } from
  "@shared/discord-stream-selection";
import type { LocalCodexStreamGrant } from
  "@/components/agent-access/useGrantedCodexStreamActivity";
import { DESKTOP_AUTH0_ROOM_CONTROL_PATH } from "@shared/desktop-auth0-account-link";

const displayPreferenceKey = (source: string) => `helix.conversation-display.v1:${source}`;
type DiscordStreamState = {
  active: boolean; revision: number; device_ref: string | null;
  destination: { guild_id: string; channel_id: string };
  selection: { mode: "all" | "selected"; source_refs: string[] } | null;
  last_discord_message_id: string | null;
  approval_id?: string | null; approval_expires_at?: string | null;
  approval_duration_hours?: 1 | 8 | 24 | null;
  approval_duration_options?: number[];
  pending: { request_id: string; proposal: { mode: "all" | "selected";
    chat_links?: string[] }; expires_at: string } | null;
};
type StreamResumeSelection = { mode: "all" | "selected"; sourceRefs: string[];
  approvalId: string; expiresAt: string; durationHours: 1 | 8 | 24 };

async function discordStreamControl(roomId: string, operation: string, request?: unknown) {
  const response = await fetch(DESKTOP_AUTH0_ROOM_CONTROL_PATH, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ operation, room_id: roomId,
      ...(request === undefined ? {} : { request }) }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== "object")
    throw new Error(typeof body?.error === "string" ? body.error : "room_service_unavailable");
  return body;
}
function readDisplayPreference(source: string): "all" | "conversation" | "reports" {
  try {
    const stored = localStorage.getItem(displayPreferenceKey(source));
    if (stored === "reports" || stored === "conversation" || source === "cloud_agent_dm" && stored === "all")
      return stored;
  } catch { /* Optional visual preference. */ }
  return source === "cloud_agent_dm" ? "all" : "conversation";
}

function codexMirrorErrorMessage(code: string): string {
  if (code === "reasoning_binding_not_found" ||
      code === "codex_mirror_target_personal_task_durable_pairing_required")
    return "No current Codex task connection. Check Agent Access; an accepted pairing can be recovered by the same task through CasimirBot MCP.";
  if (code === "codex_mirror_target_reasoning_binding_identity_mismatch")
    return "This chat no longer matches the selected Codex task. Review the exact pairing in Agent Access.";
  if (code === "codex_mirror_target_session_required")
    return "Sign in to CasimirBot again before floating the Codex conversation.";
  if (code === "codex_mirror_binary_unavailable")
    return "The Codex desktop app could not be found on this computer.";
  return "Codex conversation unavailable. Check the current task pairing and Codex app installation.";
}

export type HelixConsoleChannel = "private_ask" | "bound_task" | "private_api" | "adapter_ai" | "local_room" | "hosted_room" | "local_room_agent" | "hosted_room_agent";
export type SavedCodexChatChoice = Readonly<{ id: string; title: string }>;
export type HelixConsoleConversationWorkspaceProps = {
  children: ReactNode;
  layoutVariant?: "hero" | "dock";
  selectedChannel: HelixConsoleChannel;
  onSelectChannel: (channel: HelixConsoleChannel) => void;
  privateApiAvailable: boolean;
  experimentalAskHelix?: boolean;
  privateApiBindingConversationId?: string | null;
  boundTaskConversationId?: string | null;
  savedCodexChats?: readonly SavedCodexChatChoice[];
  onSelectCodexChat?: (chatId: string) => void;
  boundTaskMessages?: readonly BoundTaskConsoleMessage[];
  boundTaskStatus?: string | null;
  localRoom?: LocalRoomTextOwnerSnapshot | null;
  hostedRoom?: HostedRoomTextOwnerSnapshot | null;
  localRoomView?: "chat" | "mission";
  onSelectLocalRoomView?: (view: "chat" | "mission") => void;
  hostedRoomView?: "chat" | "mission";
  onSelectHostedRoomView?: (view: "chat" | "mission") => void;
};

/** A text channel changes the actual center history; the same selection drives the pill above it. */
export function HelixConsoleConversationWorkspace({ children, layoutVariant = "hero", selectedChannel, onSelectChannel,
  privateApiAvailable, experimentalAskHelix = true, privateApiBindingConversationId, boundTaskConversationId,
  savedCodexChats = [], onSelectCodexChat, boundTaskMessages = [], boundTaskStatus,
  localRoom, hostedRoom, localRoomView = "chat",
  onSelectLocalRoomView, hostedRoomView = "chat",
  onSelectHostedRoomView }: HelixConsoleConversationWorkspaceProps) {
  const localRoomAvailable = Boolean(localRoom?.conversation.admitted && localRoom.room.status !== "closed");
  const hostedRoomAvailable = isHostedRoomTextOwnerAdmitted(hostedRoom ?? null);
  const developerRoomAgent = readCachedAccountCapabilityPolicy()?.account_type === "developer";
  const localRoomAgentAvailable = Boolean(developerRoomAgent && localRoomAvailable && localRoom?.room.capacity_profile === "three_human_text");
  const hostedRoomAgentAvailable = Boolean(developerRoomAgent && hostedRoomAvailable &&
    hostedRoom?.room.self_participant_id);
  const hostedOwner = Boolean(hostedRoom?.room.participants?.some(person =>
    person.participant_id === hostedRoom.room.self_participant_id && person.role === "owner"));
  const presentLocalMembers = localRoomAvailable && localRoom
    ? localRoom.room.participants.filter(person => person.presence === "present") : [];
  const selected = selectedChannel === "local_room_agent" && !localRoomAgentAvailable
    ? localRoomAvailable ? "local_room" : "private_ask"
    : selectedChannel === "hosted_room_agent" && !hostedRoomAgentAvailable
    ? hostedRoomAvailable ? "hosted_room" : "private_ask"
    : selectedChannel === "hosted_room" || selectedChannel === "local_room" ||
    selectedChannel === "local_room_agent" || selectedChannel === "hosted_room_agent"
    ? selectedChannel
    : selectedChannel === "bound_task" ? "bound_task"
    : selectedChannel === "adapter_ai" && privateApiAvailable ? "adapter_ai"
    : selectedChannel === "private_api" && privateApiAvailable ? "private_api" : "private_ask";
  const [messageCloudOpen, setMessageCloudOpen] = useState(false);
  const [messageCloudError, setMessageCloudError] = useState<string | null>(null);
  const [discordFloatRelayEnabled, setDiscordFloatRelayEnabled] = useState(false);
  const [discordFloatRelayStatus, setDiscordFloatRelayStatus] = useState<string | null>(null);
  const [streamReadGrants, setStreamReadGrants] = useState<LocalCodexStreamGrant[]>([]);
  const [streamDeviceRef, setStreamDeviceRef] = useState("");
  const [streamState, setStreamState] = useState<DiscordStreamState | null>(null);
  const [streamResumeSelection, setStreamResumeSelection] = useState<StreamResumeSelection | null>(null);
  const [streamFrameReady, setStreamFrameReady] = useState(false);
  const [streamDraftMode, setStreamDraftMode] = useState<"all" | "selected">("all");
  const [streamDraftSources, setStreamDraftSources] = useState<string[]>([]);
  const [streamDraftDurationHours, setStreamDraftDurationHours] = useState<1 | 8 | 24>(8);
  const [streamGrantLink, setStreamGrantLink] = useState("");
  const [streamGrantTitle, setStreamGrantTitle] = useState("");
  const [streamGrantChatId, setStreamGrantChatId] = useState("");
  const [streamBusy, setStreamBusy] = useState(false);
  const relayCursor = useRef({ roomId: "", seen: new Set<string>(), baselinePending: true,
    generation: 0, posted: 0, revision: 0, deviceRef: "" });
  const sharingEnabledRef = useRef(false);
  const selectionInFlight = useRef(false);
  const resumeInFlight = useRef(false);
  const resumeRetryAt = useRef(0);
  const relayBusy = useRef(false);
  const lastActivityFrame = useRef<HelixMessageCloudFrame | null>(null);
  const [displayMode, setDisplayMode] = useState(() => readDisplayPreference("codex"));
  const [apiOverlayMode, setApiOverlayMode] = useState(() => readDisplayPreference("cloud_agent_dm"));
  useEffect(() => {
    // Visual preferences only; this storage never establishes identity or authority.
    try { localStorage.setItem(displayPreferenceKey("codex"), displayMode);
      localStorage.setItem(displayPreferenceKey("cloud_agent_dm"), apiOverlayMode); } catch { /* Optional preference storage. */ }
  }, [displayMode, apiOverlayMode]);
  const [cloudChannel, setCloudChannel] = useState<"bound_task" | "private_api">("bound_task");
  const adapterChatIds = useMemo(() => [...new Set([
    ...savedCodexChats.map(chat => chat.id),
    ...streamReadGrants.map(grant => grant.helixConversationId),
    privateApiBindingConversationId,
  ].filter((id): id is string => Boolean(id)))],
  [savedCodexChats, streamReadGrants, privateApiBindingConversationId]);
  const adapterActivity = useAdapterAiActivity(adapterChatIds,
    selected === "adapter_ai" || messageCloudOpen && cloudChannel === "private_api" && apiOverlayMode === "all");
  const adapterPages = useMemo(() => Object.values(adapterActivity.pages), [adapterActivity.pages]);
  const selectedChatsRef = useRef({ boundTaskConversationId, privateApiBindingConversationId });
  selectedChatsRef.current = { boundTaskConversationId, privateApiBindingConversationId };
  const previousChatsRef = useRef({ boundTaskConversationId, privateApiBindingConversationId });
  useEffect(() => {
    const previous = previousChatsRef.current;
    previousChatsRef.current = { boundTaskConversationId, privateApiBindingConversationId };
    if (previous.boundTaskConversationId === boundTaskConversationId &&
        previous.privateApiBindingConversationId === privateApiBindingConversationId) return;
    setMessageCloudError(null);
    // A native cloud belongs to one Helix chat. A session switch must not
    // silently relabel its still-visible old task or activity as the new one.
    if (messageCloudOpen) {
      void window.casimirDesktop?.stopMessageCloud?.();
      setMessageCloudOpen(false);
    } else {
      // A missed native event can leave the old cloud open even while this
      // renderer thinks it is closed. Only retire the prior selected chat.
      void window.casimirDesktop?.getMessageCloudStatus?.().then(state => {
        if (!state?.visible || !state.helixConversationId) return;
        const oldChat = state.source === "codex_mirror" || state.source === "message_codex"
          ? previous.boundTaskConversationId : previous.privateApiBindingConversationId;
        const newChat = state.source === "codex_mirror" || state.source === "message_codex"
          ? selectedChatsRef.current.boundTaskConversationId : selectedChatsRef.current.privateApiBindingConversationId;
        if (state.helixConversationId === oldChat && state.helixConversationId !== newChat)
          void window.casimirDesktop?.stopMessageCloud?.();
      }).catch(() => {});
    }
  }, [boundTaskConversationId, privateApiBindingConversationId, messageCloudOpen]);
  const pairingChatId = messageCloudOpen
    ? cloudChannel === "bound_task" ? boundTaskConversationId : privateApiBindingConversationId
    : selected === "private_api" || selected === "adapter_ai" ? privateApiBindingConversationId
    : selected === "bound_task" ? boundTaskConversationId : null;
  const pairing = useConversationPairing(selected === "bound_task" || selected === "private_api" ||
    selected === "adapter_ai" ? pairingChatId : null);
  const relayRoomId = hostedRoomAvailable && hostedOwner && hostedRoom
    ? hostedRoom.room.room_id : null;
  useEffect(() => {
    if (!messageCloudOpen || cloudChannel !== "private_api" || !relayRoomId) {
      lastActivityFrame.current = null;
      setStreamFrameReady(false);
    }
  }, [messageCloudOpen, cloudChannel, relayRoomId]);
  const refreshDiscordStream = useCallback(async (roomId: string) => {
    const local = await window.casimirDesktop?.codexStreamGrants?.({ operation: "list" }) as
      { status?: string; grants?: LocalCodexStreamGrant[]; deviceRef?: string } | undefined;
    if (local?.status !== "ready" || !local.deviceRef || !Array.isArray(local.grants))
      throw new Error("local_codex_reader_unavailable");
    const resume = await window.casimirDesktop?.codexStreamGrants?.({ operation: "resume-read",
      roomId }) as { status?: string; selection?: StreamResumeSelection | null } | undefined;
    if (resume?.status !== "ready") throw new Error("local_codex_resume_unavailable");
    const state = await discordStreamControl(roomId, "discord_stream_inspect") as DiscordStreamState;
    setStreamReadGrants(local.grants);
    setStreamDeviceRef(local.deviceRef);
    setStreamResumeSelection(resume.selection ?? null);
    setStreamState(state);
    return { local, state };
  }, []);
  useEffect(() => {
    if (!relayRoomId) return;
    let disposed = false;
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const { local, state } = await refreshDiscordStream(relayRoomId);
        if (disposed) return;
        // A prior domain revision cannot publish after restart. Retire it;
        // the owner's protected resume selection may start a new revision
        // after the Float and room reopen, with a new activity baseline.
        if (state.active && state.device_ref === local.deviceRef &&
            !sharingEnabledRef.current && !selectionInFlight.current) {
          await discordStreamControl(relayRoomId, "discord_stream_stop", {
            device_ref: local.deviceRef, expected_revision: state.revision });
          if (!disposed) await refreshDiscordStream(relayRoomId);
        }
      } catch (error) {
        if (!disposed) setDiscordFloatRelayStatus(`Discord stream unavailable: ${
          error instanceof Error ? error.message : "room service unavailable"}.`);
      } finally { loading = false; }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [relayRoomId, refreshDiscordStream]);
  useEffect(() => {
    if (discordFloatRelayEnabled && (!relayRoomId || !messageCloudOpen ||
        cloudChannel !== "private_api" || apiOverlayMode !== "all")) {
      relayCursor.current.generation += 1;
      sharingEnabledRef.current = false;
      setDiscordFloatRelayEnabled(false);
      const cursor = relayCursor.current;
      if (cursor.roomId && cursor.revision && cursor.deviceRef)
        void (async () => {
          // An already claimed Discord send must settle before the domain can
          // retire the revision. A crash is covered by the short lease.
          for (let attempt = 0; attempt < 20; attempt++) {
            try {
              await discordStreamControl(cursor.roomId, "discord_stream_stop", {
                device_ref: cursor.deviceRef, expected_revision: cursor.revision });
              return;
            } catch { await new Promise(resolve => window.setTimeout(resolve, 500)); }
          }
        })();
      setDiscordFloatRelayStatus("Sharing stopped because the Float or owner room closed.");
    }
  }, [discordFloatRelayEnabled, relayRoomId, messageCloudOpen, cloudChannel, apiOverlayMode]);
  useEffect(() => {
    if (!discordFloatRelayEnabled || !relayRoomId || !streamState?.active ||
        streamState.device_ref !== streamDeviceRef || !messageCloudOpen ||
        cloudChannel !== "private_api" || apiOverlayMode !== "all") return;
    let stopped = false;
    const renew = async () => {
      try {
        await discordStreamControl(relayRoomId, "discord_stream_heartbeat", {
          device_ref: streamDeviceRef, expected_revision: streamState.revision });
      } catch (error) {
        if (!stopped) {
          sharingEnabledRef.current = false;
          setDiscordFloatRelayEnabled(false);
          setDiscordFloatRelayStatus(error instanceof Error &&
            error.message === "discord_stream_lease_expired" &&
            streamState.approval_expires_at &&
            Date.parse(streamState.approval_expires_at) <= Date.now()
            ? "Stream approval ended. Review the source set and duration before sharing again."
            : "Stream connection interrupted. Approved sharing will resume if the Float and room are open.");
        }
      }
    };
    void renew();
    const timer = window.setInterval(() => void renew(), 15_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [discordFloatRelayEnabled, relayRoomId, streamState?.active,
    streamState?.revision, streamState?.device_ref, streamDeviceRef,
    messageCloudOpen, cloudChannel, apiOverlayMode]);
  const onActivityFrame = useCallback((frame: HelixMessageCloudFrame) => {
    if (frame.source === "session_activity") {
      lastActivityFrame.current = frame;
      setStreamFrameReady(true);
    }
    if (!discordFloatRelayEnabled || !relayRoomId || relayBusy.current ||
        frame.source !== "session_activity" || !streamState?.active) return;
    const cursor = relayCursor.current;
    if (cursor.roomId !== relayRoomId || cursor.revision !== streamState.revision ||
        cursor.deviceRef !== streamDeviceRef) return;
    const generation = cursor.generation;
    relayBusy.current = true;
    void (async () => {
      try {
        const grantsByHelixChat = new Map(streamReadGrants.flatMap(grant =>
          grant.helixConversationId ? [[grant.helixConversationId, grant.threadId] as const] : []));
        const selected = new Set(streamState.selection?.source_refs ?? []);
        const events = (await Promise.all(frame.turns.map(async turn => {
          const sourceRef = discordStreamSourceForTurn(frame, turn, grantsByHelixChat);
          if (!sourceRef || !selected.has(sourceRef) ||
              !streamReadGrants.some(grant => grant.sourceRef === sourceRef)) return null;
          const event = await projectDiscordFloatActivityEvent(frame, turn);
          return event ? discordStreamEventSchema.parse({ ...event,
            schema: "helix.discord_stream_event.v1", revision: cursor.revision,
            device_ref: cursor.deviceRef, source_ref: sourceRef }) : null;
        }))).filter((event): event is NonNullable<typeof event> => Boolean(event));
        if (cursor.generation !== generation) return;
        if (cursor.baselinePending) {
          for (const event of events) cursor.seen.add(event.event_key);
          cursor.baselinePending = false;
          return;
        }
        for (const event of events.filter(item => !cursor.seen.has(item.event_key)).slice(0, 4)) {
          if (cursor.generation !== generation) return;
          const raw = await discordStreamControl(relayRoomId, "discord_stream_publish", event);
          const receipt = discordStreamReceiptSchema.parse(raw);
          if (receipt.event_key !== event.event_key || receipt.room_id !== relayRoomId ||
              receipt.revision !== cursor.revision)
            throw new Error("discord_stream_receipt_mismatch");
          if (receipt.delivery_status === "retry") {
            setDiscordFloatRelayStatus("Discord is busy; this activity will be retried.");
            return;
          }
          cursor.seen.add(event.event_key);
          if (receipt.delivery_status === "delivered") {
            cursor.posted += 1;
            setDiscordFloatRelayStatus(`${cursor.posted} activity ${cursor.posted === 1 ? "entry" : "entries"} posted publicly · Discord message ${receipt.discord_message_id}.`);
          } else setDiscordFloatRelayStatus(`One activity entry was ${receipt.delivery_status}; check the relay receipt before retrying.`);
        }
      } catch {
        if (cursor.generation === generation)
          setDiscordFloatRelayStatus("Activity delivery is unavailable; the next Float update will retry safely.");
      } finally { relayBusy.current = false; }
    })();
  }, [discordFloatRelayEnabled, relayRoomId, streamState, streamDeviceRef, streamReadGrants]);
  const stopDiscordStream = async () => {
    const roomId = relayRoomId ?? relayCursor.current.roomId;
    const revision = streamState?.revision ?? relayCursor.current.revision;
    const deviceRef = streamDeviceRef || relayCursor.current.deviceRef;
    if (roomId) {
      try { await window.casimirDesktop?.codexStreamGrants?.({ operation: "resume-clear", roomId }); }
      catch { /* Domain stop still runs; native revocation needs review. */ }
      setStreamResumeSelection(null);
    }
    relayCursor.current.generation += 1;
    sharingEnabledRef.current = false;
    setDiscordFloatRelayEnabled(false);
    if (!roomId || !revision || !deviceRef) return;
    try {
      await discordStreamControl(roomId, "discord_stream_stop", {
        device_ref: deviceRef, expected_revision: revision });
      await refreshDiscordStream(roomId);
      setDiscordFloatRelayStatus("Public Discord stream stopped.");
    } catch (error) { setDiscordFloatRelayStatus(`Local sharing stopped; remote stop needs review: ${
      error instanceof Error ? error.message : "unavailable"}.`); }
  };
  const stopOtherDiscordStream = async () => {
    if (!relayRoomId || !streamState?.active || !streamState.device_ref ||
        streamState.device_ref === streamDeviceRef) return;
    setStreamBusy(true);
    try {
      await discordStreamControl(relayRoomId, "discord_stream_stop", {
        device_ref: streamState.device_ref, expected_revision: streamState.revision });
      await refreshDiscordStream(relayRoomId);
      setDiscordFloatRelayStatus("The prior device's public stream is stopped. Review sources before starting here.");
    } catch (error) { setDiscordFloatRelayStatus(`Prior device stop unavailable: ${
      error instanceof Error ? error.message : "unknown error"}.`); }
    finally { setStreamBusy(false); }
  };
  const addDiscordStreamGrant = async () => {
    if (!relayRoomId || !window.casimirDesktop?.codexStreamGrants) return;
    setStreamBusy(true);
    try {
      let bindingId: string | null = null;
      if (streamGrantChatId) {
        const binding = await inspectCurrentReasoningBinding(streamGrantChatId);
        if (binding.status !== "active" || !binding.reasoning_binding_id)
          throw new Error("Select an actively paired Helix chat or leave association blank.");
        bindingId = binding.reasoning_binding_id;
      }
      const local = await window.casimirDesktop.codexStreamGrants({ operation: "grant",
        link: streamGrantLink.trim(), title: streamGrantTitle.trim(),
        ...(streamGrantChatId ? { helixConversationId: streamGrantChatId, bindingId } : {}) }) as
        { status?: string; code?: string; deviceRef?: string; grant?: LocalCodexStreamGrant };
      if (local.status !== "ready" || !local.deviceRef || !local.grant)
        throw new Error(local.code ?? "Codex chat unavailable on this computer");
      await discordStreamControl(relayRoomId, "discord_stream_grant", {
        device_ref: local.deviceRef, source_ref: local.grant.sourceRef,
        title: local.grant.title, granted: true });
      await refreshDiscordStream(relayRoomId);
      setStreamGrantLink(""); setStreamGrantTitle(""); setStreamGrantChatId("");
      setDiscordFloatRelayStatus("Read-only chat grant saved. Public sharing selection has not changed.");
    } catch (error) { setDiscordFloatRelayStatus(`Grant unavailable: ${
      error instanceof Error ? error.message : "unknown error"}.`); }
    finally { setStreamBusy(false); }
  };
  const revokeDiscordStreamGrant = async (grant: LocalCodexStreamGrant) => {
    if (!relayRoomId) return;
    setStreamBusy(true);
    try {
      if (discordFloatRelayEnabled && streamState?.selection?.source_refs.includes(grant.sourceRef))
        await stopDiscordStream();
      const local = await window.casimirDesktop?.codexStreamGrants?.({ operation: "revoke",
        sourceRef: grant.sourceRef }) as { status?: string; deviceRef?: string } | undefined;
      if (local?.status !== "ready" || !local.deviceRef)
        throw new Error("local_revoke_unavailable");
      // The native grant is already gone. Retire its renderer projection now,
      // even if the remote revocation needs a later retry.
      setStreamReadGrants(previous => previous.filter(item => item.sourceRef !== grant.sourceRef));
      await discordStreamControl(relayRoomId, "discord_stream_grant", {
        device_ref: local.deviceRef, source_ref: grant.sourceRef,
        title: grant.title, granted: false });
      await refreshDiscordStream(relayRoomId);
      setStreamDraftSources(previous => previous.filter(ref => ref !== grant.sourceRef));
      setDiscordFloatRelayStatus("Chat read grant revoked. Restart sharing to approve a new source set.");
    } catch (error) { setDiscordFloatRelayStatus(`Local sharing stopped; grant revocation needs review: ${
      error instanceof Error ? error.message : "unknown error"}.`); }
    finally { setStreamBusy(false); }
  };
  const applyDiscordStreamSelection = async (proposalId?: string,
    resumeSelection?: StreamResumeSelection) => {
    if (!relayRoomId || !streamDeviceRef || !messageCloudOpen ||
        cloudChannel !== "private_api" || apiOverlayMode !== "all") return;
    selectionInFlight.current = true;
    setStreamBusy(true);
    try {
      if (!lastActivityFrame.current)
        throw new Error("Wait for the Float activity frame before starting the stream.");
      if (!streamState?.approval_duration_options?.includes(streamDraftDurationHours))
        throw new Error("The room service needs the stream-duration update before sharing can start.");
      let mode = streamDraftMode;
      let sources = mode === "all" ? streamReadGrants.map(grant => grant.sourceRef)
        : streamDraftSources;
      if (proposalId) {
        const proposal = streamState?.pending;
        if (!proposal || proposal.request_id !== proposalId ||
            Date.parse(proposal.expires_at) <= Date.now())
          throw new Error("proposal_expired_or_changed");
        mode = proposal.proposal.mode;
        sources = mode === "all" ? streamReadGrants.map(grant => grant.sourceRef)
          : (proposal.proposal.chat_links ?? []).map(link =>
            discordStreamSourceRef(link) ?? "");
      } else if (resumeSelection) {
        mode = resumeSelection.mode;
        sources = resumeSelection.sourceRefs;
      }
      sources = [...new Set(sources)].sort();
      if (!sources.length || sources.some(ref =>
          !streamReadGrants.some(grant => grant.sourceRef === ref)))
        throw new Error("Grant and verify each requested chat on this computer first.");
      // Drain the current send before changing the domain revision. The
      // domain independently refuses a switch while any claim is in flight.
      for (let attempt = 0; relayBusy.current && attempt < 50; attempt++)
        await new Promise(resolve => window.setTimeout(resolve, 100));
      if (relayBusy.current) throw new Error("delivery_pending");
      for (const grant of streamReadGrants)
        await discordStreamControl(relayRoomId, "discord_stream_grant", {
          device_ref: streamDeviceRef, source_ref: grant.sourceRef,
          title: grant.title, granted: true });
      // Read each exact local source before the revision changes. This gives
      // the new stream a source-specific baseline even if the Float poll has
      // not yet rendered its first frame.
      const selectedGrants = streamReadGrants.filter(grant => sources.includes(grant.sourceRef));
      const baselineSources = [] as Array<{ chatId: string; title: string;
        bindingId: string; frame: ReturnType<typeof helixCodexConsoleFrameSchema.parse>;
        status: "live" }>;
      for (const grant of selectedGrants) {
        const read = await window.casimirDesktop?.codexStreamGrants?.({ operation: "read",
          sourceRef: grant.sourceRef }) as { status?: string; frame?: unknown } | undefined;
        const parsed = helixCodexConsoleFrameSchema.safeParse(read?.frame);
        if (read?.status !== "ready" || !parsed.success ||
            parsed.data.helixConversationId !== grant.sourceRef)
          throw new Error(`Local source unavailable: ${grant.title}`);
        baselineSources.push({ chatId: grant.sourceRef, title: grant.title,
          bindingId: `stream-grant:${grant.sourceRef}`, frame: parsed.data,
          status: "live" });
      }
      const baselineFrame = projectSessionActivity({
        helixConversationId: lastActivityFrame.current.helixConversationId,
        messages: [], codexFrame: null,
        codexSourceStatus: "unpaired", pairing: { status: "unavailable", taskId: null },
        otherCodexChats: baselineSources, savedCodexChatCount: baselineSources.length,
      });
      const baselineSeen = new Set<string>();
      const grantsByHelixChat = new Map(streamReadGrants.flatMap(grant =>
        grant.helixConversationId ? [[grant.helixConversationId, grant.threadId] as const] : []));
      for (const frame of [lastActivityFrame.current, baselineFrame]) {
        if (!frame) continue;
        for (const turn of frame.turns) {
          const source = discordStreamSourceForTurn(frame, turn, grantsByHelixChat);
          if (!source || !sources.includes(source)) continue;
          const event = await projectDiscordFloatActivityEvent(frame, turn);
          if (event) baselineSeen.add(event.event_key);
        }
      }
      const changed = await discordStreamControl(relayRoomId, "discord_stream_select", {
        device_ref: streamDeviceRef, expected_revision: streamState?.revision ?? 0,
        selection: { mode, source_refs: sources }, proposal_id: proposalId ?? null,
        ...(resumeSelection ? { resume_approval_id: resumeSelection.approvalId }
          : { duration_hours: streamDraftDurationHours }),
      }) as { revision?: number; approval_id?: string;
        approval_expires_at?: string; approval_duration_hours?: number };
      if (!Number.isSafeInteger(changed.revision) ||
          typeof changed.approval_id !== "string" ||
          typeof changed.approval_expires_at !== "string" ||
          !Number.isFinite(Date.parse(changed.approval_expires_at)) ||
          changed.approval_duration_hours !== 1 &&
          changed.approval_duration_hours !== 8 &&
          changed.approval_duration_hours !== 24)
        throw new Error("selection_receipt_invalid");
      const approval = { approvalId: changed.approval_id,
        expiresAt: changed.approval_expires_at,
        durationHours: changed.approval_duration_hours as 1 | 8 | 24 };
      const saved = await window.casimirDesktop?.codexStreamGrants?.({ operation: "resume-save",
        roomId: relayRoomId, selection: { mode, sourceRefs: sources, ...approval } }) as
        { status?: string } | undefined;
      if (saved?.status !== "ready") {
        await discordStreamControl(relayRoomId, "discord_stream_stop", {
          device_ref: streamDeviceRef, expected_revision: changed.revision });
        throw new Error("local_resume_preference_unavailable");
      }
      relayCursor.current = { roomId: relayRoomId, seen: baselineSeen,
        baselinePending: false, generation: relayCursor.current.generation + 1,
        posted: 0, revision: changed.revision!, deviceRef: streamDeviceRef };
      sharingEnabledRef.current = true;
      setDiscordFloatRelayEnabled(true);
      await refreshDiscordStream(relayRoomId);
      setStreamDraftMode(mode);
      setStreamDraftSources(sources);
      setStreamDraftDurationHours(approval.durationHours);
      setStreamResumeSelection({ mode, sourceRefs: sources, ...approval });
      setDiscordFloatRelayStatus(`Sharing new activity from ${sources.length} approved ${
        sources.length === 1 ? "chat" : "chats"} until ${new Date(approval.expiresAt).toLocaleString()}. Existing activity was skipped. This source set resumes when the Float and room reopen.`);
    } catch (error) { setDiscordFloatRelayStatus(`Source change unavailable: ${
      error instanceof Error ? error.message : "unknown error"}.`); }
    finally { selectionInFlight.current = false; setStreamBusy(false); }
  };
  useEffect(() => {
    if (!relayRoomId || !messageCloudOpen || cloudChannel !== "private_api" ||
        apiOverlayMode !== "all" || !streamFrameReady || !streamResumeSelection ||
        !streamDeviceRef || !streamState || streamState.active ||
        discordFloatRelayEnabled || streamBusy || resumeInFlight.current ||
        Date.now() < resumeRetryAt.current) return;
    if (streamResumeSelection.sourceRefs.some(ref =>
        !streamReadGrants.some(grant => grant.sourceRef === ref))) {
      setDiscordFloatRelayStatus("A previously approved chat is unavailable. Review the source set before sharing.");
      return;
    }
    resumeInFlight.current = true;
    resumeRetryAt.current = Date.now() + 10_000;
    void applyDiscordStreamSelection(undefined, streamResumeSelection)
      .finally(() => { resumeInFlight.current = false; });
  }, [relayRoomId, messageCloudOpen, cloudChannel, apiOverlayMode, streamFrameReady,
    streamResumeSelection, streamDeviceRef, streamState, discordFloatRelayEnabled,
    streamBusy, streamReadGrants]);
  const mirrorAvailable = typeof window !== "undefined" && Boolean(window.casimirDesktop?.showCodexMirror);
  const nativeCodexMirror = mirrorAvailable && displayMode === "conversation";
  const nativeMessageCloud = typeof window !== "undefined" &&
    Boolean((window.casimirDesktop?.showCodexMirror || window.casimirDesktop?.showMessageCloud) &&
      window.casimirDesktop?.stopMessageCloud);
  useEffect(() => {
    let mounted = true;
    let nativeRevision = 0;
    const applyNativeState = (state: { visible?: unknown; source?: unknown;
      helixConversationId?: unknown } | null | undefined) => {
      if (!mounted || typeof state?.visible !== "boolean") return;
      if (!state.visible) { setMessageCloudOpen(false); return; }
      const expectedChat = state.source === "codex_mirror" || state.source === "message_codex"
        ? boundTaskConversationId : privateApiAvailable
          ? privateApiBindingConversationId : relayRoomId;
      if (state.helixConversationId !== expectedChat) {
        setMessageCloudOpen(false);
        return;
      }
      if (state.source === "session_activity" || state.source === "cloud_agent_dm") {
        setCloudChannel("private_api");
      } else if (state.source === "codex_mirror" || state.source === "message_codex") {
        setCloudChannel("bound_task");
      }
      setMessageCloudOpen(true);
    };
    const reconcileNativeVisibility = () => {
      const revisionAtRequest = nativeRevision;
      void window.casimirDesktop?.getMessageCloudStatus?.().then(state => {
        if (mounted && nativeRevision === revisionAtRequest) applyNativeState(state);
      }).catch(() => {});
    };
    reconcileNativeVisibility();
    const unsubscribe = window.casimirDesktop?.onMessageCloudState?.(state => {
      if (state && typeof state === "object" && typeof (state as { visible?: unknown }).visible === "boolean") {
        nativeRevision += 1;
        applyNativeState(state as { visible: boolean; source?: unknown; helixConversationId?: unknown });
      }
    });
    // The cloud can close while the main window is in the background. A
    // missed native notification must not leave its toggle stuck on Hide.
    window.addEventListener("focus", reconcileNativeVisibility);
    const onVisibilityChange = () => { if (!document.hidden) reconcileNativeVisibility(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    // A renderer remount or missed native event can leave an existing cloud
    // open while the React toggle says Float and no activity poll is running.
    const statusTimer = window.setInterval(reconcileNativeVisibility, 5_000);
    return () => {
      mounted = false;
      unsubscribe?.();
      window.removeEventListener("focus", reconcileNativeVisibility);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(statusTimer);
    };
  }, [boundTaskConversationId, privateApiBindingConversationId, privateApiAvailable, relayRoomId]);
  useEffect(() => {
    const onBindingUpdate = (event: Event) => {
      const binding = (event as CustomEvent<BrowserReasoningBinding>).detail;
      const overlayChat = cloudChannel === "private_api" ? privateApiBindingConversationId : boundTaskConversationId;
      if (binding?.helix_conversation_id !== overlayChat || binding.status === "active") return;
      // The Cloud Agent DM activity view remains useful without Codex. Its
      // owner-granted Codex reader clears independently on binding loss.
      if (cloudChannel === "private_api") return;
      void window.casimirDesktop?.stopMessageCloud?.();
      setMessageCloudOpen(false);
    };
    window.addEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, onBindingUpdate);
    return () => window.removeEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, onBindingUpdate);
  }, [boundTaskConversationId, privateApiBindingConversationId, cloudChannel]);
  const toggleMessageCloud = async (targetChannel?: "bound_task" | "private_api") => {
    const nextChannel = targetChannel ?? (selected === "private_api" || selected === "adapter_ai"
      ? "private_api" : "bound_task");
    if (messageCloudOpen && cloudChannel === nextChannel) {
      await window.casimirDesktop?.stopMessageCloud?.();
      setMessageCloudOpen(false);
      return;
    }
    if (messageCloudOpen) await window.casimirDesktop?.stopMessageCloud?.();
    setCloudChannel(nextChannel);
    setMessageCloudError(null);
    if (nextChannel === "private_api") {
      if (!(privateApiAvailable ? privateApiBindingConversationId : relayRoomId)) {
        setMessageCloudError(privateApiAvailable
          ? "Open a saved Helix chat before floating Cloud Agent DM."
          : "Open the Discord-bound owner room before floating activity.");
        setMessageCloudOpen(false);
        return;
      }
      setMessageCloudOpen(true);
      return;
    }
    if (!nativeCodexMirror) {
      if (!boundTaskConversationId) {
        setMessageCloudError("Open a saved Helix chat before floating its task reports.");
        return;
      }
      setMessageCloudOpen(true);
      return;
    }
    if (!boundTaskConversationId) {
      setMessageCloudError("Pair a Codex task before opening its conversation.");
      return;
    }
    try {
      const binding = await inspectCurrentReasoningBinding(boundTaskConversationId);
      if (selectedChatsRef.current.boundTaskConversationId !== boundTaskConversationId) return;
      if (binding.status !== "active") {
        setMessageCloudError("No current Codex task connection. Check Agent Access; an accepted pairing can be recovered by the same task through CasimirBot MCP.");
        return;
      }
      const result = await window.casimirDesktop?.showCodexMirror?.({
        bindingId: binding.reasoning_binding_id, helixConversationId: boundTaskConversationId,
      }) as { status?: string; code?: string } | undefined;
      if (selectedChatsRef.current.boundTaskConversationId !== boundTaskConversationId) {
        await window.casimirDesktop?.stopMessageCloud?.();
        return;
      }
      if (result?.status !== "showing") throw new Error(result?.code ?? "mirror_unavailable");
      setMessageCloudOpen(true);
    } catch (error) {
      setMessageCloudError(codexMirrorErrorMessage(error instanceof Error ? error.message : "mirror_unavailable"));
      setMessageCloudOpen(false);
    }
  };
  const renderDiscordStreamControls = () => (
                <div className="rounded border border-amber-300/30 p-2 text-amber-50"
                  aria-label="Discord stream">
                  <p className="font-semibold">Discord stream</p>
                  <p className="mt-1">Share new visible activity from exact read-approved chats to the Discord channel bound to this room. Local Codex Desktop reading is experimental; an unsupported version stays unavailable. After you start sharing, this approved source set resumes with new activity when the Float and room reopen. Stop sharing clears that preference.</p>
                  <p className="mt-1">Destination: {streamState?.destination.channel_id
                    ? `channel ${streamState.destination.channel_id}` : "Bind this room to a Discord channel first"}.
                    {streamState?.last_discord_message_id ? ` Last delivery: ${streamState.last_discord_message_id}.` : ""}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input aria-label="Exact Codex chat link" placeholder="codex://threads/<chat-id>"
                      value={streamGrantLink} onChange={event => setStreamGrantLink(event.target.value)}
                      className="min-w-64 flex-1 rounded border border-white/20 bg-slate-950 p-1" />
                    <input aria-label="Chat label" placeholder="Chat label" value={streamGrantTitle}
                      onChange={event => setStreamGrantTitle(event.target.value)}
                      className="min-w-32 rounded border border-white/20 bg-slate-950 p-1" />
                    <select aria-label="Associated Helix chat" value={streamGrantChatId}
                      onChange={event => setStreamGrantChatId(event.target.value)}
                      className="rounded border border-white/20 bg-slate-950 p-1">
                      <option value="">Codex activity only</option>
                      {savedCodexChats.map(chat => <option key={chat.id} value={chat.id}>{chat.title}</option>)}
                    </select>
                    <button type="button" disabled={streamBusy || !relayRoomId || !streamGrantLink || !streamGrantTitle}
                      onClick={() => void addDiscordStreamGrant()}
                      className="rounded border border-amber-300/40 px-2 py-1 disabled:opacity-50">Grant read access</button>
                  </div>
                  <p className="mt-1">Each read grant is local to this computer. It survives an EXE restart and ends on sign-out, device reset, or revocation. A read grant does not add its chat to an active public stream.</p>
                  <label className="mt-2 block">Sources <select aria-label="Discord stream sources"
                    value={streamDraftMode} onChange={event => setStreamDraftMode(event.target.value as "all" | "selected")}
                    className="ml-2 rounded border border-white/20 bg-slate-950 p-1">
                    <option value="all">All approved chats</option>
                    <option value="selected">Selected chats</option>
                  </select></label>
                  <label className="mt-2 block">Sharing duration <select aria-label="Discord stream duration"
                    value={streamDraftDurationHours}
                    onChange={event => setStreamDraftDurationHours(Number(event.target.value) as 1 | 8 | 24)}
                    className="ml-2 rounded border border-white/20 bg-slate-950 p-1">
                    <option value={1}>1 hour</option>
                    <option value={8}>8 hours</option>
                    <option value={24}>24 hours</option>
                  </select></label>
                  <p className="mt-1">This is the maximum time for this approved source set to resume.
                    Closing the Float or room stops delivery; reopening it within this time resumes at new activity.
                    After expiry, review and start sharing again.</p>
                  <div className="mt-1 max-h-36 overflow-auto">
                    {streamReadGrants.map(grant => <div key={grant.sourceRef} className="flex items-center gap-2 py-0.5">
                      {streamDraftMode === "selected" ? <input type="checkbox"
                        aria-label={`Include ${grant.title}`} checked={streamDraftSources.includes(grant.sourceRef)}
                        onChange={event => setStreamDraftSources(previous => event.target.checked
                          ? [...new Set([...previous, grant.sourceRef])]
                          : previous.filter(ref => ref !== grant.sourceRef))} /> : null}
                      <span className="min-w-0 flex-1 truncate">{grant.title} · {grant.sourceRef}</span>
                      <button type="button" disabled={streamBusy}
                        onClick={() => void revokeDiscordStreamGrant(grant)}
                        className="text-amber-200 underline disabled:opacity-50">Revoke read</button>
                    </div>)}
                    {!streamReadGrants.length ? <p>No local chat read grants yet.</p> : null}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={streamBusy || !relayRoomId || !messageCloudOpen ||
                      cloudChannel !== "private_api" || apiOverlayMode !== "all" || !streamDeviceRef ||
                      !streamState?.approval_duration_options?.includes(streamDraftDurationHours) ||
                      !streamReadGrants.length || streamDraftMode === "selected" && !streamDraftSources.length}
                      onClick={() => void applyDiscordStreamSelection()}
                      className="rounded border border-amber-300/40 px-2 py-1 disabled:opacity-50">
                      {discordFloatRelayEnabled ? "Approve source change" : "Start public sharing"}
                    </button>
                    <button type="button" disabled={!discordFloatRelayEnabled || streamBusy}
                      onClick={() => void stopDiscordStream()}
                      className="rounded border border-white/20 px-2 py-1 disabled:opacity-50">Stop sharing</button>
                  </div>
                  <p className="mt-1">Active: {discordFloatRelayEnabled && streamState?.selection
                    ? `${streamState.selection.mode === "all" ? "All approved snapshot" : "Selected"} · ${streamState.selection.source_refs.length} chat(s) · revision ${streamState.revision}`
                    : "Off"}. {streamState?.approval_expires_at && discordFloatRelayEnabled
                      ? `Approved until ${new Date(streamState.approval_expires_at).toLocaleString()}.` : ""}
                    Source selection is separate from the task that answers slash commands.</p>
                  {!streamState?.approval_duration_options ?
                    <p className="mt-1">Sharing duration becomes available after the room service is updated.</p> : null}
                  {streamState?.active && streamState.device_ref !== streamDeviceRef ?
                    <div className="mt-2 rounded border border-amber-300/30 p-2">
                      <p>Another device has this owner's active stream. It must stop before this computer starts one.</p>
                      <button type="button" disabled={streamBusy}
                        onClick={() => void stopOtherDiscordStream()}
                        className="mt-1 rounded border border-amber-300/40 px-2 py-1 disabled:opacity-50">
                        Stop prior device's stream
                      </button>
                    </div> : null}
                  {streamState?.pending ? <div className="mt-2 rounded border border-cyan-300/30 p-2">
                    <p>Agent proposed {streamState.pending.proposal.mode === "all" ? "All approved chats" :
                      streamState.pending.proposal.chat_links?.join(", ")}. Expires {streamState.pending.expires_at}.</p>
                    <button type="button" disabled={streamBusy || !messageCloudOpen}
                      onClick={() => void applyDiscordStreamSelection(streamState.pending!.request_id)}
                      className="mt-1 rounded border border-cyan-300/50 px-2 py-1 disabled:opacity-50">
                      Approve this switch
                    </button>
                  </div> : null}
                  {discordFloatRelayStatus ? <p role="status" className="mt-1">{discordFloatRelayStatus}</p> : null}
                </div>
  );
  return <section aria-label="Helix Console conversations" data-layout-variant={layoutVariant}
    className="helix-console-conversations mt-3 min-h-0">
    {privateApiAvailable && selected !== "private_api" ? <div hidden aria-hidden="true">
      <ManagedConversationConsoleHistory helixConversationId={privateApiBindingConversationId}
        messageCloudOpen={messageCloudOpen && cloudChannel === "private_api"} overlayMode={apiOverlayMode}
        pairingSnapshot={pairing} savedCodexChats={savedCodexChats} adapterPages={adapterPages}
        streamReadGrants={streamReadGrants}
        onActivityFrame={onActivityFrame} />
    </div> : null}
    {!privateApiAvailable && relayRoomId ? <OwnerDiscordStreamActivity roomId={relayRoomId}
      open={messageCloudOpen && cloudChannel === "private_api"}
      grants={streamReadGrants} adapterPages={adapterPages} onActivityFrame={onActivityFrame} /> : null}
    <div className="helix-console-conversations__layout">
      <nav aria-label="Conversation channels" className="helix-console-conversations__channels rounded-xl border border-white/10 bg-slate-950/70 p-2 text-xs">
        <div className="helix-console-conversations__wide-only px-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Text chats</div>
        <button type="button" aria-current={selected === "bound_task" ? "page" : undefined}
          onClick={() => onSelectChannel("bound_task")}
          className={`shrink-0 rounded-lg px-3 py-2 text-left ${selected === "bound_task" ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-50" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
          <span className="block font-semibold"># Message Codex</span>
        </button>
        {savedCodexChats.length > 1 && onSelectCodexChat ? <label className="shrink-0 px-2 py-1 text-[11px] text-slate-300">
          Saved Codex chats
          <select aria-label="Saved Codex chats" className="ml-2 max-w-64 rounded border border-white/20 bg-slate-950 p-1 text-slate-100"
            value={boundTaskConversationId ?? ""} onChange={event => onSelectCodexChat(event.target.value)}>
            {savedCodexChats.map(chat => <option key={chat.id} value={chat.id}>
              {chat.title || "Untitled Helix chat"} · {chat.id.slice(0, 8)}
            </option>)}
          </select>
        </label> : null}
        {experimentalAskHelix ? <button type="button" aria-current={selected === "private_ask" ? "page" : undefined}
          onClick={() => onSelectChannel("private_ask")}
          className={`shrink-0 rounded-lg px-3 py-2 text-left ${selected === "private_ask" ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-50" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
          <span className="block font-semibold"># Ask Helix</span>
        </button> : null}
        {privateApiAvailable ? <button type="button" aria-current={selected === "private_api" ? "page" : undefined}
          onClick={() => onSelectChannel("private_api")}
          className={`shrink-0 rounded-lg px-3 py-2 text-left ${selected === "private_api" ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-50" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
          <span className="block font-semibold"># Cloud Agent DM</span>
        </button> : null}
        {privateApiAvailable ? <button type="button" aria-current={selected === "adapter_ai" ? "page" : undefined}
          onClick={() => onSelectChannel("adapter_ai")}
          className={`shrink-0 rounded-lg px-3 py-2 text-left ${selected === "adapter_ai" ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-50" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
          <span className="block font-semibold"># Adapter AI</span>
        </button> : null}
        {(localRoomAvailable && localRoom || selected === "local_room") ? <><div className="helix-console-conversations__wide-only px-2 pt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Rooms</div>
          <button type="button" aria-current={selected === "local_room" ? "page" : undefined}
            disabled={!localRoomAvailable}
            onClick={() => onSelectChannel("local_room")}
            className={`shrink-0 rounded-lg px-3 py-2 text-left ${selected === "local_room" ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-50" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
            <span className="block font-semibold"># Party Chat · {localRoomAvailable && localRoom ? localRoom.room.title : "Room unavailable"}</span>
          </button></> : null}
        {localRoomAgentAvailable && localRoom ?
          <button type="button" aria-current={selected === "local_room_agent" ? "page" : undefined}
            onClick={() => onSelectChannel("local_room_agent")}
            className={`shrink-0 rounded-lg px-3 py-2 text-left ${selected === "local_room_agent" ? "border border-fuchsia-300/40 bg-fuchsia-400/10 text-fuchsia-50" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
            <span className="block font-semibold"># Room Agent · {localRoom.room.title}</span>
          </button> : null}
        {(hostedRoomAvailable && hostedRoom || selected === "hosted_room") ? <><div className="helix-console-conversations__wide-only px-2 pt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Hosted rooms</div>
          <button type="button" aria-current={selected === "hosted_room" ? "page" : undefined}
            disabled={!hostedRoomAvailable}
            onClick={() => onSelectChannel("hosted_room")}
            className={`shrink-0 rounded-lg px-3 py-2 text-left ${selected === "hosted_room" ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-50" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
            <span className="block font-semibold"># Party Chat · {hostedRoomAvailable && hostedRoom ? hostedRoom.room.title : "Hosted room unavailable"}</span>
          </button></> : null}
        {hostedRoomAgentAvailable && hostedRoom ?
          <button type="button" aria-current={selected === "hosted_room_agent" ? "page" : undefined}
            onClick={() => onSelectChannel("hosted_room_agent")}
            className={`shrink-0 rounded-lg px-3 py-2 text-left ${selected === "hosted_room_agent" ? "border border-fuchsia-300/40 bg-fuchsia-400/10 text-fuchsia-50" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
            <span className="block font-semibold"># Room Agent · {hostedRoom.room.title}</span>
          </button> : null}
      </nav>
      <div className="helix-console-conversations__pane min-w-0 rounded-xl border border-white/10 bg-slate-950/40 p-3">
        <header className="helix-console-conversations__header border-b border-white/10 pb-2">
          <div className="flex items-start justify-between gap-2">
          {selected !== "bound_task" && selected !== "private_api" ? <h2 className="text-sm font-semibold text-cyan-50">{selected === "adapter_ai" ? "Adapter AI · recorded activity"
            : selected === "local_room_agent" || selected === "hosted_room_agent"
            ? `Room Agent · ${selected === "local_room_agent" ? localRoom?.room.title ?? "Room unavailable" : hostedRoom?.room.title ?? "Room unavailable"}`
            : selected === "local_room" && localRoomAvailable && localRoomView === "mission"
            ? `Mission · ${localRoom?.room.title}` : selected === "hosted_room"
            ? hostedRoomAvailable && hostedRoom
              ? hostedRoomView === "mission" ? `Mission · ${hostedRoom.room.title}` : `Party Chat · ${hostedRoom.room.title}`
              : "Hosted room unavailable"
            : selected === "local_room"
              ? localRoomAvailable && localRoom ? `Party Chat · ${localRoom.room.title}` : "Room unavailable"
              : "Ask Helix"}</h2> :
            <div aria-label="Exact task pairing" className="min-w-0 text-[11px] text-cyan-100">
              <span>Codex task connection: {pairing.status}</span>
              <span className="block break-all">Task: {pairing.taskId ?? (pairing.status === "active"
                ? "paired; registration label unavailable" : "not verified")}</span>
              {selected === "bound_task" && savedCodexChats.length > 1 ? <span className="block break-all">
                Selected Helix chat: {boundTaskConversationId ?? "not selected"}. Other saved chats are rechecked when selected.
              </span> : null}
            </div>}
          <div className="flex min-w-0 flex-wrap justify-end gap-2">
          {(privateApiAvailable || relayRoomId) && nativeMessageCloud ? <button type="button"
            aria-pressed={messageCloudOpen && cloudChannel === "private_api"}
            aria-label={messageCloudOpen && cloudChannel === "private_api" ? "Hide floating activity" : "Float activity"}
            title={privateApiAvailable ? "Show Cloud Agent DM, owner-visible Codex chats, and verified Adapter AI runs"
              : "Show owner-approved Codex chats and associated adapter activity"}
            onClick={() => { setApiOverlayMode("all"); void toggleMessageCloud("private_api"); }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100 hover:bg-cyan-400/20">
            <Cloud aria-hidden="true" className="h-3.5 w-3.5" />
            {messageCloudOpen && cloudChannel === "private_api" ? "Hide activity" : "Float activity"}
          </button> : null}
          {selected === "bound_task" && nativeMessageCloud ? <button type="button"
            aria-pressed={messageCloudOpen && cloudChannel === selected}
            aria-label={messageCloudOpen
              && cloudChannel === selected
              ? nativeCodexMirror ? "Hide floating Codex conversation" : "Hide floating task reports"
              : nativeCodexMirror ? "Float Codex conversation" : "Float Message Codex reports"}
            title={messageCloudOpen
              ? nativeCodexMirror ? "Hide floating Codex conversation" : "Hide floating task reports"
              : nativeCodexMirror ? "Float Codex conversation" : "Float Message Codex reports"}
            onClick={() => { void toggleMessageCloud(); }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100 hover:bg-cyan-400/20">
            <Cloud aria-hidden="true" className="h-3.5 w-3.5" />
            {messageCloudOpen && cloudChannel === selected ? "Hide Codex chat" : nativeCodexMirror ? "Float Codex chat" : "Float task reports"}
          </button> : null}
          </div>
          </div>
          {selected === "bound_task" || selected === "private_api" ? <details className="mt-1 text-[11px] text-slate-400">
            <summary className="cursor-pointer">Pairing & display settings</summary>
            <div className="mt-2 space-y-2 break-all">
              <p>Helix chat: {pairingChatId ?? "not selected"}</p>
              <p>Pairing: {pairing.pairingId ?? "unavailable"} · Binding: {pairing.bindingId ?? "unavailable"}</p>
              {selected === "bound_task" ? <label className="block">Display <select className="ml-2 bg-slate-950"
                value={displayMode === "all" ? "conversation" : displayMode} onChange={event => { setDisplayMode(event.target.value as "conversation" | "reports");
                  void window.casimirDesktop?.stopMessageCloud?.(); setMessageCloudOpen(false); }}>
                <option value="conversation">Visible conversation (preferred)</option>
                <option value="reports">Task reports</option>
              </select></label> : <>
                <label className="block">Overlay display <select className="ml-2 bg-slate-950" value={apiOverlayMode}
                  onChange={event => setApiOverlayMode(event.target.value as "all" | "conversation" | "reports")}>
                  <option value="all">All available activity (default)</option>
                  <option value="conversation">Visible conversation (preferred)</option>
                  <option value="reports">Codex task reports only</option>
                </select></label>
                <p>All combines this chat's Cloud Agent DM, currently readable saved Codex chats, and owner-verified Adapter AI run records. Codex entries name their chat; Adapter AI entries name their run and originating chat. Sources are grouped, not a guaranteed global time order. Choices are not evidence of movement.</p>
                {renderDiscordStreamControls()}
              </>}
              <p>Only user-visible messages and updates; no hidden reasoning.</p>
            </div>
          </details> : null}
          {!privateApiAvailable && hostedOwner && relayRoomId ?
            <details className="mt-1 text-[11px] text-slate-300">
              <summary className="cursor-pointer">Discord stream</summary>
              <div className="mt-2">{renderDiscordStreamControls()}</div>
            </details> : null}
          {selected === "bound_task" && displayMode === "conversation" && !mirrorAvailable ?
            <p role="status" className="mt-1 text-[11px] text-amber-200">Conversation reader unavailable in this build — showing task reports.</p> : null}
          {selected === "bound_task" && pairing.status === "expired" ?
            <p role="status" className="mt-1 text-[11px] text-amber-200">This chat's finite Codex pairing expired. Review a new exact-task invitation in Agent Access; switching chats does not renew permission.</p> : null}
          {selected === "bound_task" && (pairing.status === "revoked" || pairing.status === "superseded") ?
            <p role="status" className="mt-1 text-[11px] text-amber-200">This chat's prior Codex pairing is {pairing.status}. Select its current approved connection or review a new invitation in Agent Access.</p> : null}
          {selected === "bound_task" && pairing.status === "unavailable" && savedCodexChats.length > 1 ?
            <p role="status" className="mt-1 text-[11px] text-amber-200">This saved chat has no verified task connection right now. If its pairing is still accepted, ask that exact task to recover through MCP. If its setup tool is missing, refresh that task's CasimirBot Source catalog before retrying.</p> : null}
          {(selected === "bound_task" || selected === "private_api") && messageCloudError ? <p role="status" className="mt-1 text-[11px] text-amber-200">{messageCloudError}</p> : null}
          <p className="mt-1 text-[11px] text-slate-400">{selected === "local_room_agent" || selected === "hosted_room_agent"
            ? "Shared room AI turns. Share an exact Party Chat message with the interpreter before the host runs it; task and program actions require separate review."
            : selected === "adapter_ai"
            ? "Read-only Responses-worker checkpoints by adapter run. A selected choice does not mean Minecraft moved; execution requires a separate native receipt."
            : selected === "private_api"
            ? "Talk with your cloud agent here. When it needs your paired Codex task, it can request a bounded MCP handoff; pickup and results appear in this conversation."
            : selected === "bound_task"
              ? nativeCodexMirror
                ? "Stored conversation from your paired Codex task. The Helix pill still queues requests through MCP; those requests are not Codex app user messages."
                : "MCP inbox for your paired Codex task. The task must poll for messages; they do not appear as new user messages in the Codex app chat. Pickup and reports appear here."
              : selected === "private_ask"
                ? "Workspace conversation using your selected Ask runtime and tools."
                : "Shared with this room's members; it does not queue Codex work."}</p>
          {selected === "local_room" && localRoomAvailable && localRoom ? <p className="mt-1 truncate text-[11px] text-slate-400"
            aria-label="Local room presence">{presentLocalMembers.length} present in room · {presentLocalMembers.map(person => person.display_name).join(", ") || "No one currently present"}</p> : null}
          {selected === "local_room" && localRoomAvailable && localRoom ? <div aria-label="Room voice channel"
            className="mt-2 flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px]">
            <Volume2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="font-medium text-slate-200">Voice channel</span>
            {localRoom.room.capacity_profile === "two_person_voice" ? <button type="button"
              className="ml-auto text-cyan-200 underline decoration-cyan-300/30 hover:text-white"
              onClick={() => window.dispatchEvent(new CustomEvent(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT,
                { cancelable: true, detail: { roomId: localRoom.room.room_id, refresh: true } }))}>
              Open voice controls
            </button> : <span className="ml-auto text-slate-400">Unavailable in this text room</span>}
          </div> : null}
          {selected === "hosted_room" && hostedRoomAvailable && hostedRoom ? <p className="mt-1 truncate text-[11px] text-slate-400"
            aria-label="Hosted room membership">{hostedRoom.room.participants.length} {hostedRoom.room.participants.length === 1 ? "member" : "members"} · {hostedRoom.room.participants.map(person => person.display_name).join(", ")}</p> : null}
          {hostedRoomAvailable && hostedRoom?.room.capacity_profile === "three_human_text" &&
            hostedRoom.room.self_participant_id && hostedRoom.room.status !== "closed" ?
            <div className={selected === "hosted_room" ? "mt-2" : "hidden"}>
              <NativeHostedRoomVoiceChannel roomId={hostedRoom.room.room_id}
                selfParticipantId={hostedRoom.room.self_participant_id}
                members={hostedRoom.room.participants} />
            </div> : null}
          {selected === "local_room" && localRoomAvailable && onSelectLocalRoomView ? <nav aria-label="Selected room views" className="mt-2 flex gap-2 text-[11px]">
            <button type="button" aria-current={localRoomView === "chat" ? "page" : undefined}
              onClick={() => onSelectLocalRoomView("chat")}
              className={`rounded-md px-2 py-1 ${localRoomView === "chat" ? "bg-cyan-400/15 text-cyan-50" : "text-slate-400 hover:text-white"}`}>Chat</button>
            <button type="button" aria-current={localRoomView === "mission" ? "page" : undefined}
              onClick={() => onSelectLocalRoomView("mission")}
              className={`rounded-md px-2 py-1 ${localRoomView === "mission" ? "bg-emerald-400/15 text-emerald-50" : "text-slate-400 hover:text-white"}`}>Mission</button>
          </nav> : null}
          {selected === "hosted_room" && hostedRoomAvailable && onSelectHostedRoomView ? <nav aria-label="Selected hosted room views" className="mt-2 flex gap-2 text-[11px]">
            <button type="button" aria-current={hostedRoomView === "chat" ? "page" : undefined}
              onClick={() => onSelectHostedRoomView("chat")}
              className={`rounded-md px-2 py-1 ${hostedRoomView === "chat" ? "bg-cyan-400/15 text-cyan-50" : "text-slate-400 hover:text-white"}`}>Chat</button>
            <button type="button" aria-current={hostedRoomView === "mission" ? "page" : undefined}
              onClick={() => onSelectHostedRoomView("mission")}
              className={`rounded-md px-2 py-1 ${hostedRoomView === "mission" ? "bg-emerald-400/15 text-emerald-50" : "text-slate-400 hover:text-white"}`}>Mission</button>
          </nav> : null}
        </header>
        <div className={`helix-console-conversations__body ${selected === "private_ask"
          ? "helix-console-conversations__body--ask" : "helix-console-conversations__body--scroll"}`}
          {...(selected !== "private_ask" ? { tabIndex: 0, role: "region",
            "aria-label": `${selected === "adapter_ai" ? "Adapter AI" : selected === "private_api" ? "Cloud Agent DM" : selected === "bound_task" ? "Message Codex" : selected === "local_room_agent" || selected === "hosted_room_agent" ? "Room Agent" : "Party Chat"} conversation content` } : {})}>
        {(selected === "bound_task" || messageCloudOpen && cloudChannel === "bound_task" && !nativeCodexMirror) ?
          <div hidden={selected !== "bound_task"}>
            {nativeCodexMirror ? <>
              <CodexConversationConsoleHistory key={boundTaskConversationId ?? "no-chat"}
                helixConversationId={boundTaskConversationId} />
              <details className="mt-3 border-t border-white/10 pt-2 text-xs text-slate-400">
                <summary className="cursor-pointer">MCP delivery receipts</summary>
                <BoundTaskConsoleHistory key={boundTaskConversationId ?? "no-chat"}
                  messages={boundTaskMessages} status={boundTaskStatus}
                  helixConversationId={boundTaskConversationId} pairingSnapshot={pairing} />
              </details>
            </> : <BoundTaskConsoleHistory key={boundTaskConversationId ?? "no-chat"}
              messages={boundTaskMessages} status={boundTaskStatus}
              helixConversationId={boundTaskConversationId}
              pairingSnapshot={pairing}
              messageCloudOpen={messageCloudOpen && cloudChannel === "bound_task"}
              onMessageCloudUnavailable={() => setMessageCloudOpen(false)} />}
          </div> : null}
        {selected === "local_room_agent" ? localRoomAvailable && localRoom
          ? <div className="space-y-3">
              <p className="text-xs text-slate-400">Choose one of your Party Chat messages below. Approving its use does not call the model; request a bounded turn after approval.</p>
              <SharedRoomTextReleaseControls room={localRoom.room}
                messages={localRoom.conversation.messages} admitted={localRoom.conversation.admitted} />
              <SharedRoomInterpreterTurnHistory room={localRoom.room} />
            </div>
          : <UnavailableRoomHistory onReturn={() => onSelectChannel("private_ask")} />
        : selected === "hosted_room_agent" ? hostedRoomAvailable && hostedRoom && hostedRoom.room.self_participant_id
            ? <div className="space-y-3">
                <p className="text-xs text-slate-400">Allow one of your Party Chat messages, then ask the host for a bounded AI turn. The host controls the provider run and its cost.</p>
                <NativeHostedRoomTextReleaseControls roomId={hostedRoom.room.room_id}
                  authority={hostedRoom.authority} selfParticipantId={hostedRoom.room.self_participant_id}
                  messages={hostedRoom.conversation.messages} closed={hostedRoom.room.status === "closed"} />
                <NativeHostedRoomInterpreterTurnHistory roomId={hostedRoom.room.room_id}
                  authority={hostedRoom.authority} closed={hostedRoom.room.status === "closed"}
                  isOwner={hostedOwner}
                  messages={hostedRoom.conversation.messages} participants={hostedRoom.room.participants}
                  showMemberMessages={false} />
                {hostedOwner ? <NativeHostedRoomInterpreterProposalReview
                  roomId={hostedRoom.room.room_id} authority={hostedRoom.authority}
                  disabled={hostedRoom.room.status === "closed"} /> : null}
                <NativeSharedInterpreterReportsPanel roomId={hostedRoom.room.room_id}
                  authority={hostedRoom.authority} disabled={hostedRoom.room.status === "closed"} />
                {hostedOwner && onSelectHostedRoomView ? <button type="button"
                  onClick={() => { onSelectHostedRoomView("mission"); onSelectChannel("hosted_room"); }}
                  className="text-xs text-cyan-100 underline decoration-cyan-300/30">
                  Select or inspect the Codex task in Mission
                </button> : null}
              </div>
            : <UnavailableRoomHistory onReturn={() => onSelectChannel("private_ask")} />
        : selected === "hosted_room" ? hostedRoomAvailable && hostedRoom
          ? hostedRoomView === "mission" ? <HostedRoomConsoleMission snapshot={hostedRoom} />
            : <HostedRoomConsoleHistory snapshot={hostedRoom} />
          : <UnavailableRoomHistory onReturn={() => onSelectChannel("private_ask")} />
          : selected === "local_room" ? localRoomAvailable && localRoom
            ? localRoomView === "mission" ? <LocalRoomConsoleMission snapshot={localRoom} />
              : <LocalRoomConsoleHistory snapshot={localRoom} />
            : <UnavailableRoomHistory onReturn={() => onSelectChannel("private_ask")} />
          : selected === "adapter_ai" ? <AdapterAiActivityPanel pages={adapterPages}
              chatTitles={savedCodexChats} requestedChatIds={adapterChatIds}
              readFailures={adapterActivity.failures} />
          : selected === "private_api" ? <ManagedConversationConsoleHistory
              helixConversationId={privateApiBindingConversationId}
              messageCloudOpen={messageCloudOpen && cloudChannel === "private_api"} overlayMode={apiOverlayMode}
              pairingSnapshot={pairing} savedCodexChats={savedCodexChats} adapterPages={adapterPages}
              streamReadGrants={streamReadGrants}
              onActivityFrame={onActivityFrame} />
          : selected === "bound_task" ? null : children}
        </div>
      </div>
    </div>
  </section>;
}

function UnavailableRoomHistory({ onReturn }: { onReturn: () => void }) {
  return <div className="py-4 text-xs" role="status">
    <p className="text-amber-100">Room history is hidden until this account's membership and text access are confirmed.</p>
    <button type="button" onClick={onReturn} className="mt-3 text-cyan-100 underline decoration-cyan-300/30">
      Return to Ask Helix
    </button>
  </div>;
}
