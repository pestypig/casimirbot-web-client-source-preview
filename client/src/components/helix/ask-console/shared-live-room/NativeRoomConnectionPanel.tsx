import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DESKTOP_AUTH0_ROOM_CONNECTION_START_PATH as START,
  DESKTOP_AUTH0_ROOM_CONNECTION_STATUS_PATH as STATUS,
  DESKTOP_AUTH0_ROOM_CONNECTION_DISCONNECT_PATH as DISCONNECT,
  DESKTOP_AUTH0_ROOM_CONTROL_PATH as CONTROL,
  parseDesktopAuth0AccountLinkStartReceipt,
  parseDesktopAuth0AccountLinkCompletion,
} from "@shared/desktop-auth0-account-link";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, readCachedAccountCapabilityPolicy,
  readCachedAccountProfileIdentity } from
  "@/lib/workstation/accountCapabilityPolicy";
import { NativeHostedRoomTaskPanel } from "./NativeHostedRoomTaskPanel";
import { NativeMinecraftPlayerSharingQueue } from "./NativeMinecraftPlayerSharingQueue";
import { NativeHostedDiscordSpeakerReview } from "./NativeHostedDiscordSpeakerReview";
import { NativeSharedRoomReportsPanel } from "./NativeSharedRoomReportsPanel";
import { NativeSharedInterpreterReportsPanel } from "./NativeSharedInterpreterReportsPanel";
import { NativeHostedRoomInterpreterStatus } from "./NativeHostedRoomInterpreterStatus";
import { NativeHostedRoomTextConversation,
  type NativeHostedRoomTextConversationOwner } from "./NativeHostedRoomTextConversation";
import { NativeHostedRoomTextOwnerBridge,
  type HostedRoomTextOwnerSnapshot } from "./NativeHostedRoomTextOwnerBridge";
import { DiscordVoiceGptLiveBridge, type DiscordVoiceBridgeState } from
  "./DiscordVoiceGptLiveBridge";
import { PrivateManagedDiscordVoice } from "./PrivateManagedDiscordVoice";
import type { IsolatedAudioReceipt } from "./DiscordIsolatedAudioRelay";
import { isolatedSpeechWav } from "./isolatedSpeechWav";
import type { RoomTextDraftStore } from "./RoomTextDraftStore";
import { discordVoiceRenewalReceiptSchema } from "@shared/discord-voice-renewal";
import { discordVoiceBridgeTicketReceiptSchema, ownerApprovedDiscordVoiceBridge } from "@shared/discord-voice-bridge";
import { helixSharedLiveRoomIdSchema } from "@shared/contracts/helix-shared-live-room-agent.v1";
import { HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT } from "./SharedLiveRoomGuideProjection";

export type DiscordVoiceRenewalPending = {
  requestId: string;
  invitationId: string;
  expiresAtMs: number;
  acknowledge: () => Promise<boolean>;
};

type Status = { configured: boolean; ready: boolean; authority: string | null;
  expires_at: string | null; room_source_scope_ready?: boolean;
  recovery_pending?: boolean;
  recovery_failure_code?: "room_transport_failed" | "room_remote_rejected" |
    "room_response_invalid" | "room_forbidden" | "account_policy_blocked" |
    "room_connection_changed" | "room_recovery_failed" };
const ROOM_RECOVERY_FAILURE_CODES = new Set<NonNullable<Status["recovery_failure_code"]>>([
  "room_transport_failed", "room_remote_rejected", "room_response_invalid",
  "room_forbidden", "account_policy_blocked", "room_connection_changed",
  "room_recovery_failed",
]);
type Room = { room_id: string; title: string; status: string; self_participant_id?: string;
  capacity_profile?: "two_person_voice" | "three_person_voice" | "three_human_text"; max_participants?: number;
  participants: Array<{ participant_id: string; display_name: string; role?: string;
    presence?: "present" | "away" | "left" }> };
type HostedMinecraftSource = { binding_id: string; source_id: string;
  world_id: string; domain_adapter: string; status: string };
class RoomRequestError extends Error {
  constructor(readonly status: number, readonly uncertain: boolean, code: unknown) {
    super(typeof code === "string" && /^[a-z][a-z0-9_]{0,80}$/.test(code)
      ? `${code} (HTTP ${status})` : `room_request_failed (HTTP ${status})`);
  }
}
const roomProjection = (value: unknown): Room | null => {
  if (!value || typeof value !== "object") return null;
  const room = value as Room;
  return typeof room.room_id === "string" && typeof room.title === "string" && typeof room.status === "string" &&
    Array.isArray(room.participants) && room.participants.every(p => p && typeof p.participant_id === "string" &&
      typeof p.display_name === "string") ? room : null;
};
const roomAuthorizationFailure = (code: string | undefined): string => {
  switch (code) {
    case "authorization_denied":
      return "Room authorization was denied or canceled in the browser. If Auth0 showed the wrong account, sign out of Auth0 in that same browser profile, then retry room authorization.";
    case "link_intent_expired":
    case "link_intent_not_found":
      return "This room authorization return expired or no longer matches its request. Close the old Auth0 page, check the browser account, then start a new room authorization.";
    case "verified_identity_mismatch":
      return "CasimirBot could not verify the Auth0 identity returned for this room connection. Check the account shown in the same browser profile before retrying.";
    case "room_account_identity_mismatch":
      return "The browser returned a different account from this CasimirBot installation. Use the same account and sign-in method as this desktop profile, then retry room authorization. Email/password and Continue with Google can identify different accounts.";
    case "signed_tenant_claim_missing":
      return "The returned account token is missing the required tenant claim. The app operator must check the Auth0 configuration before you retry room authorization.";
    case "provider_subject_conflict":
      return "The Auth0 identity in this browser is already linked to another CasimirBot profile. Sign out of Auth0 in this browser profile and retry with the intended website account.";
    case "room_authorization_insufficient":
      return "Auth0 did not grant the required room scopes. Review the intended account and room permissions before retrying.";
    case "room_source_scope_not_granted":
      return "Auth0 did not grant room source-management access. The app operator must define helix.room_sources.manage on the CasimirBot API and grant it to this desktop client before you authorize again. Existing room access can still work, but it does not admit a Minecraft source.";
    case "room_connection_failed":
    case "room_account_unavailable":
      return "The room service did not admit this account. Check Shared Live Rooms access for the intended website identity before retrying.";
    case "room_connection_changed":
      return "This room authorization was canceled or replaced. Close the old Auth0 page before starting another.";
    case "token_exchange_failed":
      return "Auth0 returned to CasimirBot, but the room token exchange failed. Check the browser account and try again.";
    case "callback_transport_failed":
      return "CasimirBot could not confirm the browser return with its local service. Keep the current account, check that this EXE is running, then retry the room authorization.";
    default:
      return "Room authorization was rejected. Check the intended account in the browser, then retry from this panel.";
  }
};

// Stable across retries, remounts and restarts without persisting an invitation.
export const nativeRoomJoinKey = async (authority: string, roomId: string, invite: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["native-room-join-v1", authority, roomId, invite])));
  return `native-join:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
};

export function NativeRoomConnectionPanel({ fieldIdPrefix, draftStore, portalTarget,
  realtimeSessionId, runtimeActive,
  onHostedRoomTextOwnerChange, onOpenRoomConsole, onOpenRoomMissionConsole,
  onDiscordVoiceRenewalRequest, onMuteLocalGptLive }: {
  fieldIdPrefix: string; draftStore?: RoomTextDraftStore;
  realtimeSessionId: string | null; runtimeActive: boolean;
  portalTarget?: HTMLElement | null;
  onHostedRoomTextOwnerChange?: (snapshot: HostedRoomTextOwnerSnapshot | null) => void;
  onOpenRoomConsole?: () => void;
  onOpenRoomMissionConsole?: () => void;
  onDiscordVoiceRenewalRequest?: (request: DiscordVoiceRenewalPending | null) => void;
  onMuteLocalGptLive?: () => void;
}) {
  const native = typeof window !== "undefined" && typeof window.casimirDesktop?.openAuth0AccountLink === "function";
  const developer = readCachedAccountCapabilityPolicy()?.account_type === "developer";
  const [status, setStatus] = useState<Status | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<Room | null>(null);
  const [roomId, setRoomId] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [pendingExpiry, setPendingExpiry] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const generation = useRef(0);
  const refreshSequence = useRef(0);
  const requests = useRef(new Set<AbortController>());
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discordBridge = useRef<DiscordVoiceGptLiveBridge | null>(null);
  const discordBridgeRoom = useRef<string | null>(null);
  const discordBridgeSession = useRef<string | null>(null);
  const sourceGeneration = useRef(0);
  const sourceScope = useRef<{ roomId: string | undefined; sessionId: string | null; active: boolean } | null>(null);
  const [discordVoiceApproved, setDiscordVoiceApproved] = useState(false);
  const [discordBridgeState, setDiscordBridgeState] = useState<DiscordVoiceBridgeState>("closed");
  const [discordBridgeMessage, setDiscordBridgeMessage] = useState<string | null>(null);
  const [hostedMinecraftSources, setHostedMinecraftSources] = useState<HostedMinecraftSource[]>([]);
  const [selectedMinecraftSource, setSelectedMinecraftSource] = useState<{
    roomId: string; realtimeSessionId: string; bindingId: string;
    worldId: string } | null>(null);
  const [hostedMinecraftMessage, setHostedMinecraftMessage] = useState<string | null>(null);

  useEffect(() => {
    sourceGeneration.current += 1;
    sourceScope.current = { roomId: selected?.room_id, sessionId: realtimeSessionId,
      active: runtimeActive && status?.ready === true && discordBridgeState === "active" };
    setHostedMinecraftSources([]);
    setHostedMinecraftMessage(null);
    return () => { sourceGeneration.current += 1; sourceScope.current = null; };
  }, [selected?.room_id, realtimeSessionId, runtimeActive, status?.authority,
    status?.ready, discordBridgeState]);

  const stopDiscordBridge = useCallback(async () => {
    const active = discordBridge.current;
    discordBridge.current = null;
    discordBridgeRoom.current = null;
    discordBridgeSession.current = null;
    setDiscordVoiceApproved(false);
    if (active) await active.close();
  }, []);

  const clearWait = useCallback(() => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
    waitTimer.current = null;
    setWaiting(false);
    setPendingExpiry(null);
  }, []);

  const invalidate = useCallback(() => {
    generation.current += 1;
    void stopDiscordBridge();
    for (const request of requests.current) request.abort();
    requests.current.clear();
    clearWait(); setBusy(false); setRooms([]); setSelected(null); setStatus(null); setInvite(""); setRoomId("");
  }, [clearWait, stopDiscordBridge]);

  useEffect(() => {
    if (discordBridge.current && (!runtimeActive || !realtimeSessionId ||
        discordBridgeSession.current !== realtimeSessionId ||
        discordBridgeRoom.current !== selected?.room_id || selected?.status === "closed")) {
      void stopDiscordBridge();
    }
  }, [runtimeActive, realtimeSessionId, selected?.room_id, selected?.status, stopDiscordBridge]);

  const read = useCallback(async (path: string, body?: unknown) => {
    const controller = new AbortController(); requests.current.add(controller);
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(path, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
      const value = await response.json().catch(() => null);
      if (controller.signal.aborted) throw new Error("room_request_expired");
      if (!response.ok) throw new RoomRequestError(response.status, value?.outcome_unknown === true, value?.error);
      return value;
    } finally { clearTimeout(timer); requests.current.delete(controller); }
  }, []);

  const loadHostedMinecraftSources = async () => {
    if (!selected || !status?.ready || !runtimeActive || discordBridgeState !== "active") return;
    const epoch = generation.current, sourceEpoch = sourceGeneration.current;
    setHostedMinecraftMessage(null);
    try {
      const receipt = await read(CONTROL, { operation: "source_list",
        room_id: selected.room_id });
      if (epoch !== generation.current || sourceEpoch !== sourceGeneration.current) return;
      const bindings: HostedMinecraftSource[] = receipt?.schema === "casimir.native_hosted_room_source_inventory.v1" &&
        receipt.room_id === selected.room_id && Array.isArray(receipt.bindings)
        ? receipt.bindings.filter((item: unknown): item is HostedMinecraftSource =>
          Boolean(item && typeof item === "object" &&
            typeof (item as HostedMinecraftSource).binding_id === "string" &&
            typeof (item as HostedMinecraftSource).source_id === "string" &&
            typeof (item as HostedMinecraftSource).world_id === "string" &&
            typeof (item as HostedMinecraftSource).domain_adapter === "string" &&
            /^(minecraft|fabric|paper)/iu.test((item as HostedMinecraftSource).domain_adapter) &&
            (item as HostedMinecraftSource).status === "active")) : [];
      setHostedMinecraftSources(bindings);
      if (!bindings.length) setHostedMinecraftMessage("No active hosted Minecraft source is available for this room.");
    } catch {
      if (epoch !== generation.current || sourceEpoch !== sourceGeneration.current) return;
      setHostedMinecraftSources([]);
      setHostedMinecraftMessage("The hosted source inventory could not be read. Check the room connection and retry.");
    }
  };

  const selectHostedMinecraftSource = async (source: HostedMinecraftSource) => {
    if (!selected || !status?.ready || !runtimeActive || !realtimeSessionId || discordBridgeState !== "active") return;
    const epoch = generation.current, sourceEpoch = sourceGeneration.current;
    const roomId = selected.room_id;
    setHostedMinecraftMessage(null);
    try {
      const receipt = await read(CONTROL, { operation: "source_context_select",
        room_id: roomId, realtime_session_id: realtimeSessionId,
        request: { binding_id: source.binding_id } });
      if (epoch !== generation.current) return;
      if (sourceEpoch !== sourceGeneration.current) {
        // Release only the request's original room/session, never the new
        // selection. A restarted bridge in the same scope may already have a
        // newer selection. A changed account owns its own cleanup and authority.
        const current = sourceScope.current;
        if (!current?.active || current.roomId !== roomId || current.sessionId !== realtimeSessionId)
          void read(CONTROL, { operation: "source_context_select",
            room_id: roomId, realtime_session_id: realtimeSessionId,
            request: { binding_id: null } }).catch(() => undefined);
        return;
      }
      if (receipt?.room_id !== roomId || receipt.binding_id !== source.binding_id ||
          receipt.world_id !== source.world_id) throw new Error("source_changed");
      setSelectedMinecraftSource({ roomId, realtimeSessionId,
        bindingId: source.binding_id, worldId: source.world_id });
      setHostedMinecraftMessage(`Selected ${source.world_id} for read-only GPT Live context. No Minecraft command access was granted.`);
    } catch {
      if (epoch !== generation.current || sourceEpoch !== sourceGeneration.current) return;
      setHostedMinecraftMessage("The exact source could not be verified for this GPT Live session. Refresh its inventory before retrying.");
    }
  };

  useEffect(() => {
    const source = selectedMinecraftSource;
    if (!source) return;
    if (discordBridgeState !== "active" ||
        selected?.room_id !== source.roomId || realtimeSessionId !== source.realtimeSessionId) {
      setSelectedMinecraftSource(null);
      void read(CONTROL, { operation: "source_context_select",
        room_id: source.roomId, realtime_session_id: source.realtimeSessionId,
        request: { binding_id: null } }).catch(() => undefined);
      return;
    }
    let inFlight = false;
    let disposed = false;
    const timer = setInterval(() => {
      if (inFlight || disposed) return;
      inFlight = true;
      void read(CONTROL, { operation: "source_context_select",
        room_id: source.roomId, realtime_session_id: source.realtimeSessionId,
        request: { binding_id: source.bindingId } })
        .then(receipt => {
          if (disposed) return;
          if (receipt?.room_id === source.roomId &&
              receipt.binding_id === source.bindingId &&
              receipt.world_id === source.worldId) return;
          // A stable binding ID can name a different world after source
          // replacement. Never continue showing the old world as selected.
          setSelectedMinecraftSource(null);
          setHostedMinecraftMessage("The hosted Minecraft world changed. Its GPT Live context was released; refresh the source list before selecting it again.");
          void read(CONTROL, { operation: "source_context_select",
            room_id: source.roomId, realtime_session_id: source.realtimeSessionId,
            request: { binding_id: null } }).catch(() => undefined);
        })
        .catch(error => {
          if (disposed) return;
          if (error instanceof RoomRequestError &&
              error.message.startsWith("source_world_changed (")) {
            setSelectedMinecraftSource(null);
            setHostedMinecraftMessage("The hosted Minecraft world changed. Its GPT Live context was released; refresh the source list before selecting it again.");
            void read(CONTROL, { operation: "source_context_select",
              room_id: source.roomId, realtime_session_id: source.realtimeSessionId,
              request: { binding_id: null } }).catch(() => undefined);
            return;
          }
          setHostedMinecraftMessage("Hosted Minecraft context renewal failed; the read-only lease will expire unless the source recovers.");
        })
        .finally(() => { inFlight = false; });
    }, 10_000);
    return () => { disposed = true; clearInterval(timer); };
  }, [discordBridgeState, read, realtimeSessionId, selected?.room_id, selectedMinecraftSource]);

  useEffect(() => {
    const self = selected?.participants.find(member =>
      member.participant_id === selected.self_participant_id);
    if (!native || !status?.ready || !selected || selected.status === "closed" ||
        self?.role !== "owner" || self.presence !== "present" ||
        !onDiscordVoiceRenewalRequest) {
      onDiscordVoiceRenewalRequest?.(null);
      return;
    }
    let disposed = false;
    const roomId = selected.room_id;
    const poll = async () => {
      try {
        const receipt = discordVoiceRenewalReceiptSchema.parse(await read(CONTROL, {
          operation: "discord_voice_renewal_inspect", room_id: roomId,
        }));
        if (disposed || receipt.room.room_id !== roomId) return;
        const pending = receipt.request;
        onDiscordVoiceRenewalRequest(pending ? {
          requestId: pending.request_id,
          invitationId: pending.invitation_id,
          expiresAtMs: Date.parse(pending.expires_at),
          acknowledge: async () => {
            const result = await read(CONTROL, {
              operation: "discord_voice_renewal_ack", room_id: roomId,
              request: { request_id: pending.request_id },
            });
            return result?.request_id === pending.request_id && result?.acknowledged === true;
          },
        } : null);
      } catch {
        if (!disposed) onDiscordVoiceRenewalRequest(null);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      onDiscordVoiceRenewalRequest(null);
    };
  }, [native, onDiscordVoiceRenewalRequest, read, selected, status?.ready]);

  const refresh = useCallback(async (): Promise<Status | null> => {
    const epoch = generation.current;
    const sequence = ++refreshSequence.current;
    try {
      const value = await read(STATUS);
      if (epoch !== generation.current || sequence !== refreshSequence.current) return null;
      if (value?.schema !== "casimir_desktop_room_connection_status/1" || typeof value.ready !== "boolean" || typeof value.configured !== "boolean" || (value.recovery_pending !== undefined && typeof value.recovery_pending !== "boolean") ||
        (value.room_source_scope_ready !== undefined && typeof value.room_source_scope_ready !== "boolean") ||
        (value.recovery_failure_code !== undefined && !ROOM_RECOVERY_FAILURE_CODES.has(value.recovery_failure_code)) ||
        value.bearer_included !== false || value.subject_included !== false ||
        (value.authority !== null && typeof value.authority !== "string") ||
        ((value.ready || value.recovery_pending) && (!value.configured || !value.authority || !Number.isFinite(Date.parse(value.expires_at))))) throw new Error("invalid");
      setStatus(value);
      if (!value.ready) { setRooms([]); setSelected(null); }
      setMessage(null);
      return value as Status;
    } catch {
      if (epoch === generation.current && sequence === refreshSequence.current) {
        setStatus(null); setRooms([]); setSelected(null);
        setMessage("Room connection status is unavailable. Check your account and try again.");
      }
      return null;
    }
  }, [read]);

  // A room token can expire while this panel stays open. Recheck the native
  // authority at its deadline so an old renderer badge cannot imply that a
  // protected read still has a current account session.
  useEffect(() => {
    if (!native || !status?.ready || !status.expires_at) return;
    const expiresAtMs = Date.parse(status.expires_at);
    if (!Number.isFinite(expiresAtMs)) return;
    const delayMs = Math.max(0, Math.min(
      expiresAtMs - Date.now() + 10, 2_147_483_647));
    const timer = window.setTimeout(() => { void refresh(); }, delayMs);
    return () => window.clearTimeout(timer);
  }, [native, status?.ready, status?.expires_at, refresh]);

  useEffect(() => {
    if (!native) return;
    void refresh();
    const unsubscribe = window.casimirDesktop?.onAuth0AccountLinkCompletion?.((candidate) => {
      const completion = parseDesktopAuth0AccountLinkCompletion(candidate);
      if (!completion || completion.authorization_purpose !== "shared_live_rooms" || !waitTimer.current) return;
      generation.current += 1; clearWait(); setBusy(false);
      if (!completion.ok) { setMessage(roomAuthorizationFailure(completion.error)); return; }
      void refresh();
    });
    const accountChanged = () => { invalidate(); void refresh(); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
    return () => { unsubscribe?.(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged); invalidate(); };
  }, [native, refresh, clearWait, invalidate]);

  const authorize = async () => {
    generation.current += 1;
    clearWait();
    // A renewal does not remove an active grant until a replacement succeeds.
    if (!status?.ready) {
      setRooms([]); setSelected(null);
      setStatus(previous => previous ? { ...previous, ready: false, expires_at: null } : null);
    }
    const epoch = generation.current; setBusy(true); setMessage(null);
    try {
      const receipt = parseDesktopAuth0AccountLinkStartReceipt(await read(START, {}));
      if (epoch !== generation.current) return;
      if (!receipt || receipt.authorization_purpose !== "shared_live_rooms") throw new Error("invalid");
      setWaiting(true);
      setPendingExpiry(receipt.expires_at);
      waitTimer.current = setTimeout(() => {
        if (epoch !== generation.current) return;
        generation.current += 1; clearWait(); setBusy(false);
        setMessage("Room authorization expired. Close the old Auth0 page, check the browser account, then start a new authorization.");
      }, Math.max(0, Date.parse(receipt.expires_at) - Date.now()));
      await window.casimirDesktop!.openAuth0AccountLink!(receipt.authorization_url);
    } catch { if (epoch === generation.current) { clearWait(); setMessage("Room authorization could not start. Check the configured room service and account permissions."); } }
    finally { if (epoch === generation.current) setBusy(false); }
  };

  const control = useCallback(async (operation: "list" | "inspect" | "join", id?: string) => {
    const epoch = generation.current; setBusy(true); setMessage(null);
    try {
      const exactRoom = roomId.trim(), exactInvite = invite.trim();
      const request = operation === "join" ? { operation, request: { room_id: exactRoom, invite_code: exactInvite },
        idempotency_key: await nativeRoomJoinKey(status!.authority!, exactRoom, exactInvite) }
        : operation === "inspect" ? { operation, room_id: id } : { operation };
      if (epoch !== generation.current) return;
      const value = await read(CONTROL, request);
      if (epoch !== generation.current) return;
      if (operation === "list") {
        if (!Array.isArray(value?.rooms)) throw new Error("invalid");
        setRooms(value.rooms.map(roomProjection).filter((room: Room | null): room is Room => Boolean(room)));
      } else {
        const room = roomProjection(value?.room);
        if (!room || room.room_id !== (operation === "join" ? exactRoom : id)) throw new Error("invalid");
        setSelected(room);
        if (operation === "join") { setInvite(""); setMessage("Room membership confirmed on this service."); }
      }
    } catch (error) {
      if (epoch === generation.current) {
        setRooms([]); setSelected(null);
        if (error instanceof RoomRequestError && [401, 403].includes(error.status)) {
          setStatus(previous => previous ? { ...previous, ready: false, expires_at: null } : null);
          setInvite("");
        }
        setMessage(operation === "join"
          ? error instanceof RoomRequestError && !error.uncertain
            ? "The service rejected this join. Check your connection and invitation before trying again."
            : "The join result could not be confirmed. Retry the same room and invitation; it will use the same request key."
          : "The room request failed. Refresh the connection and try again.");
      }
    } finally { if (epoch === generation.current) setBusy(false); }
  }, [read, roomId, invite, status?.authority]);

  useEffect(() => {
    if (!native) return;
    const reviewHostedRoom = (event: Event) => {
      const candidate = (event as CustomEvent<{ hostedRoomId?: unknown }>).detail?.hostedRoomId;
      if (candidate === undefined) return;
      const parsed = helixSharedLiveRoomIdSchema.safeParse(candidate);
      if (!parsed.success) return;
      void (async () => {
        const connection = await refresh();
        if (!connection?.ready) {
          setMessage("The saved hosted room grant could not be rechecked. Complete room authorization if needed, then open this contract step again.");
          return;
        }
        await control("inspect", parsed.data);
      })();
    };
    window.addEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, reviewHostedRoom);
    return () => window.removeEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, reviewHostedRoom);
  }, [control, native, refresh]);

  const disconnect = async () => {
    const wasWaiting = Boolean(waitTimer.current);
    invalidate(); const epoch = generation.current; setBusy(true);
    try { await read(DISCONNECT, {}); if (epoch === generation.current) { await refresh(); if (epoch === generation.current) setMessage(wasWaiting
      ? "Pending room authorization canceled. Close its Auth0 page before starting a new room authorization."
      : "Room connection disconnected. Room membership is unchanged."); } }
    catch { if (epoch === generation.current) setMessage("Disconnect could not be confirmed. Retry disconnect before continuing."); }
    finally { if (epoch === generation.current) setBusy(false); }
  };

  const openServiceRoom = async () => {
    if (!selected || !status?.ready || !status.authority || !window.casimirDesktop?.openRoomService) return;
    const epoch = generation.current; setBusy(true); setMessage(null);
    try {
      const result = await window.casimirDesktop.openRoomService({ authority: status.authority, room_id: selected.room_id });
      if (!result || typeof result !== "object" || !("opened" in result) || result.opened !== true) throw new Error("not_opened");
      if (epoch === generation.current) setMessage("Room service opened in your browser. Sign in there with the same account, then open the selected room.");
    } catch { if (epoch === generation.current) setMessage("The selected room service could not open. Check the configured authority and retry."); }
    finally { if (epoch === generation.current) setBusy(false); }
  };

  const startDiscordBridge = async () => {
    if (!selected || selected.status === "closed" || !status?.ready || !realtimeSessionId ||
        !runtimeActive || discordBridge.current) return;
    const room = selected;
    const nativeTranscribe = window.casimirDesktop?.transcribeIsolatedDiscordSegment;
    let isolatedTranscriptionBusy = false;
    const bridge = new DiscordVoiceGptLiveBridge({
      realtimeSessionId, roomId: room.room_id,
      ...(nativeTranscribe ? { onIsolatedSegment: async (segment: IsolatedAudioReceipt) => {
        // The parser must be free for the next segment even when a provider
        // call takes longer than this one. Bound local work to one in flight.
        if (isolatedTranscriptionBusy) {
          setDiscordBridgeMessage("An isolated speech segment was skipped while transcription was busy; the Discord call remains connected.");
          return;
        }
        const { pcm, ...receipt } = segment;
        const wav = isolatedSpeechWav(pcm);
        if (!wav) throw new Error("isolated_speech_wav_invalid");
        isolatedTranscriptionBusy = true;
        void nativeTranscribe({ receipt, wav }).then(outcome => {
          if (outcome !== "queued" && discordBridge.current === bridge)
            setDiscordBridgeMessage("Isolated speech was not added to GPT Live; the Discord audio bridge remains connected.");
        }, () => {
          if (discordBridge.current === bridge)
            setDiscordBridgeMessage("Isolated speech was not added to GPT Live; the Discord audio bridge remains connected.");
        }).finally(() => { wav.fill(0); isolatedTranscriptionBusy = false; });
      } } : {}),
      issueTicket: async () => {
        const receipt = discordVoiceBridgeTicketReceiptSchema.parse(await read(CONTROL, {
          operation: "discord_voice_bridge_ticket", room_id: room.room_id,
          realtime_session_id: realtimeSessionId,
        }));
        if (!ownerApprovedDiscordVoiceBridge(receipt, discordVoiceApproved))
          throw new Error("Approve call audio in this panel, or use an exact reviewed GPT Live contract.");
        return receipt;
      },
      onApprovedTicket: () => onMuteLocalGptLive?.(),
      onState: (state, detail) => {
        if (state === "closed" && discordBridge.current === bridge) {
          discordBridge.current = null;
          discordBridgeRoom.current = null;
          setDiscordVoiceApproved(false);
        }
        setDiscordBridgeState(state);
        setDiscordBridgeMessage(detail);
      },
    });
    discordBridge.current = bridge;
    discordBridgeRoom.current = room.room_id;
    discordBridgeSession.current = realtimeSessionId;
    setDiscordBridgeState("connecting");
    setDiscordBridgeMessage("Checking the exact room, Discord invitation and consent...");
    try { await bridge.start(); }
    catch {
      if (discordBridge.current === bridge) {
        discordBridge.current = null;
        discordBridgeRoom.current = null;
        setDiscordVoiceApproved(false);
      }
    }
  };

  const selectedIsOwner = Boolean(selected?.participants.some((participant: Room["participants"][number]) =>
    participant.participant_id === selected.self_participant_id && participant.role === "owner"));
  const renderPanel = (conversation: NativeHostedRoomTextConversationOwner | null) => {
    const missionInConsole = Boolean(onOpenRoomMissionConsole);
    const desktopProfile = readCachedAccountProfileIdentity().profileId;
    const panel = <section className="rounded-xl border border-cyan-300/20 bg-black/20 p-3 md:col-span-2"
      aria-label="Room service connection" data-helix-guidance-target="native-room-connection">
    <h3 className="text-sm font-semibold text-cyan-100">Hosted service rooms · human conversation by default</h3>
    <p className="mt-1 text-xs text-slate-400">Membership and room coordination include no AI model. Selecting a separate Codex task uses its owner's AI account only after reviewed instruction queueing. The explicit Discord GPT Live pilot below is a separate, consent-gated bridge.</p>
    {developer ? <p className="mt-1 text-xs text-fuchsia-100">Developer evaluation only: shared AI can use the host's separately configured OpenAI key after exact-message author permission and a reviewed turn request. The host's key and Codex account are not shared with guests.</p> : null}
    <p className="mt-1 text-xs text-slate-300">{status?.authority ?? "No room service is configured."}</p>
    <p className="mt-1 text-xs text-slate-400">{status?.ready
      ? status.room_source_scope_ready === false
        ? "Authorized for room coordination, but this token lacks helix.room_sources.manage. The app operator must add that API permission and grant it to this desktop client before you authorize again. Minecraft source admission is unavailable."
        : "Authorized for room coordination on this account. Minecraft source access is checked separately."
      : waiting ? "Complete room authorization in your browser." : status?.recovery_pending
      ? status.recovery_failure_code === "room_forbidden" || status.recovery_failure_code === "account_policy_blocked"
        ? `The saved room grant was denied (${status.recovery_failure_code}). Check the website account's room access, or authorize the intended account again.`
        : `A saved program grant is still valid. CasimirBot is retrying this room connection${status.recovery_failure_code ? ` (${status.recovery_failure_code})` : ""}; refresh to check again.`
      : status && !status.configured
      ? "Hosted rooms are not set up in this installation. The app operator must configure a room service that matches this app's sign-in audience, then restart the app. Local rooms remain available on this device."
      : "Authorize this account to view or join rooms on the configured service."}</p>
    {status?.ready ? <p className="mt-1 text-xs text-slate-400">Room authorization is current. Select the room, linked Discord channel, and any local read grants separately before Float or public streaming; this status does not prove a destination or delivery.</p> : null}
    <p className="mt-1 text-xs text-slate-400">Desktop account profile: <span className="break-all font-mono">{desktopProfile ?? "not verified"}</span>. Room authorization opens your Windows default browser. CasimirBot cannot see that browser profile or its Auth0 account before consent; compare the account shown there with your intended CasimirBot website and Discord-linked identity. Website linking and Full Harness access are separate checks.</p>
    <details className="mt-1 text-xs text-slate-400"><summary className="cursor-pointer">Use another browser account</summary>
      <p className="mt-1">If Auth0 shows the wrong account, do not accept. Sign out of Auth0 in the same browser profile that opened, cancel the pending room handoff, then retry with the sign-in provider tied to your room identity. The same email through email/password can be a different Auth0 identity than Continue with Google.</p>
    </details>
    {waiting && pendingExpiry ? <p role="status" className="mt-1 text-xs text-amber-100">Pending room browser handoff expires {new Date(pendingExpiry).toLocaleString()}. Refresh checks room status but does not cancel this handoff.</p> : null}
    <div className="my-2 flex flex-wrap gap-2">
      <button data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.authorize-room-service" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy || waiting || !status?.configured ||
        (status.recovery_pending && status.recovery_failure_code !== "room_forbidden" &&
          status.recovery_failure_code !== "account_policy_blocked")}
        onClick={() => void authorize()}>Authorize room service</button>
      <button data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.refresh-connection" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy} onClick={() => void refresh()}>Refresh connection</button>
      <button data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.void-disconnect" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" onClick={() => void disconnect()}>{waiting ? "Cancel pending room authorization" : "Disconnect room service"}</button>
      {status?.ready ? <button data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.load-service-rooms" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy} onClick={() => void control("list")}>Load service rooms</button> : null}
    </div>
    {message ? <p role="status" className="my-2 text-xs text-amber-100">{message}</p> : null}
    {status?.ready ? <form data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.event-event-prevent-default-void-control-join" data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" onSubmit={event => { event.preventDefault(); void control("join"); }} className="grid gap-2">
      <label htmlFor={`${fieldIdPrefix}-remote-room`}>Service room ID</label>
      <input data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.input" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" id={`${fieldIdPrefix}-remote-room`} value={roomId} onChange={event => setRoomId(event.target.value)} autoComplete="off" maxLength={256} disabled={busy} className="rounded border border-white/20 bg-slate-900 p-2" />
      <label htmlFor={`${fieldIdPrefix}-remote-invite`}>Service invitation</label>
      <input data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.input.2" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" id={`${fieldIdPrefix}-remote-invite`} value={invite} onChange={event => setInvite(event.target.value)} autoComplete="off" maxLength={64} disabled={busy} className="rounded border border-white/20 bg-slate-900 p-2" />
      <button data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.join-service-room" data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" type="submit" disabled={busy || !roomId.trim() || !invite.trim()}>Join service room</button>
    </form> : null}
    {rooms.map(room => <button data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.void-control-inspect-room-room-id" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" className="m-1 rounded border border-white/20 p-2 text-xs" type="button" key={room.room_id} disabled={busy} onClick={() => void control("inspect", room.room_id)}>{room.title}</button>)}
    {selected ? <p className="mt-2 text-xs">{selected.title} · {selected.participants.length}/{selected.max_participants ?? 2} members · {selected.status}
      {selected.capacity_profile === "three_human_text" ? " · optional human voice in Party Chat; GPT Live is separate" : ""}</p> : null}
    {selected && status?.ready && window.casimirDesktop?.openRoomService ? <button data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.open-selected-room-in-browser" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy || waiting} onClick={() => void openServiceRoom()}>Open selected room in browser</button> : null}
    {selected && status?.ready && selectedIsOwner ? <NativeMinecraftPlayerSharingQueue
      key={`player-sharing:${generation.current}:${status.authority}:${selected.room_id}`}
      roomId={selected.room_id} control={request => read(CONTROL, request)} /> : null}
    {selected && status?.ready && selectedIsOwner ? <section className="mt-3 rounded border border-cyan-300/20 p-2" aria-label="Discord GPT Live pilot">
      <h4 className="text-sm font-semibold text-cyan-100">Discord GPT Live pilot</h4>
      <p className="mt-1 text-xs text-slate-400">Keep the laptop microphone off. The consented Discord call supplies GPT Live input only while this bridge is connected.</p>
      <p className="mt-1 text-xs text-slate-300">Connect one armed Discord voice invitation for this room to the GPT Live session already open in this harness. An exact owner-approved GPT Live contract covers this bridge action; otherwise approve it below. Each present participant still needs current Discord voice consent, remembered for this server until revoked. Connecting mutes GPT Live on this computer; you can change local playback in Voice settings.</p>
      <label className="mt-2 flex items-start gap-2 text-xs text-slate-200">
        <input data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.input.3" data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" type="checkbox" checked={discordVoiceApproved} disabled={discordBridgeState === "active" || discordBridgeState === "connecting"}
          onChange={event => setDiscordVoiceApproved(event.target.checked)} />
        For a manually armed call, I approve sending its consented audio to my open GPT Live session and playing replies in the call. Stop the bridge when I leave.
      </label>
      <div className="mt-2 flex gap-2">
        <button data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.connect-discord-call-to-gpt-live" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={!runtimeActive || !realtimeSessionId ||
          discordBridgeState !== "closed" || selected.status === "closed"}
          onClick={() => void startDiscordBridge()}>Connect Discord call to GPT Live</button>
        <button data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.stop-discord-gpt-live-bridge" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={discordBridgeState === "closed"}
          onClick={() => void stopDiscordBridge()}>Stop Discord GPT Live bridge</button>
      </div>
      {discordBridgeMessage ? <p role="status" className="mt-1 text-xs text-amber-100">{discordBridgeMessage}</p> : null}
      {!runtimeActive || !realtimeSessionId ? <p className="mt-1 text-xs text-slate-400">Start GPT Live in Helix Ask before connecting this call.</p> : null}
      <div className="mt-3 rounded border border-cyan-300/20 p-2 text-xs">
        <p className="text-cyan-100">Minecraft context for this call</p>
        <p className="mt-1 text-slate-400">Select the exact hosted source and world after the Discord bridge is active. Fresh read-only observations can then inform GPT Live; this does not authorize game commands.</p>
        <button data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.load-this-room-s-sources" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={discordBridgeState !== "active"}
          onClick={() => void loadHostedMinecraftSources()}>Load this room’s sources</button>
        {hostedMinecraftSources.map(source => <button data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.button" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button"
          className="m-1 rounded border border-cyan-300/20 p-2 text-left"
          key={source.binding_id} disabled={discordBridgeState !== "active"}
          onClick={() => void selectHostedMinecraftSource(source)}>
          {source.world_id} · {source.domain_adapter} · {source.source_id}
          {selectedMinecraftSource?.bindingId === source.binding_id ? " · selected" : ""}
        </button>)}
        {hostedMinecraftMessage ? <p role="status" className="mt-1 text-amber-100">{hostedMinecraftMessage}</p> : null}
      </div>
    </section> : null}
    {selected && status?.ready && selectedIsOwner ? <PrivateManagedDiscordVoice
      key={`managed-voice:${selected.room_id}`}
      roomId={selected.room_id}
      readBinding={() => read(CONTROL, {
        operation: "discord_voice_managed_binding_inspect",
        room_id: selected.room_id,
      })} /> : null}
    {selected && status?.ready ? <NativeHostedDiscordSpeakerReview
      key={`speaker:${generation.current}:${status.authority}:${selected.room_id}`}
      roomId={selected.room_id} isOwner={selectedIsOwner}
      control={request => read(CONTROL, request)} /> : null}
    {selected && status?.ready ? <h4 className="mt-4 text-sm font-semibold text-cyan-100">Conversation</h4> : null}
    {selected && status?.ready && status.authority && selected.self_participant_id && conversation ? <NativeHostedRoomTextConversation
      key={`text:${generation.current}:${status.authority}:${selected.room_id}`}
      roomId={selected.room_id} authority={status.authority} selfParticipantId={selected.self_participant_id}
      participants={selected.participants} closed={selected.status === "closed"}
      enableAiAccess={developer} draftStore={draftStore}
      isOwner={selectedIsOwner} conversation={conversation}
      onOpenInConsole={onOpenRoomConsole} /> : null}
    {developer && selected && status?.ready && status.authority ? <NativeHostedRoomInterpreterStatus
      key={`interpreter:${generation.current}:${status.authority}:${selected.room_id}`}
      roomId={selected.room_id} authority={status.authority}
      isOwner={selectedIsOwner} capacityProfile={selected.capacity_profile} /> : null}
    {selected && status?.ready ? <h4 className="mt-4 text-sm font-semibold text-cyan-100">Mission and shared results</h4> : null}
    {selected && status?.ready && missionInConsole && conversation?.admitted ? <button data-helix-control-id="helix.ask.shared_live_room.native-room-connection-panel.review-mission-in-console" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button"
      onClick={onOpenRoomMissionConsole}>Review mission in Console</button> : null}
    {selected && status?.ready && missionInConsole && !conversation?.admitted ? <p className="mt-2 text-xs text-slate-400">
      You can select the paired task now. Confirm this account's room text access separately before opening its mission in Console.
    </p> : null}
    {selected && status?.ready && status.authority && selectedIsOwner && missionInConsole && !conversation?.admitted ? <NativeHostedRoomTaskPanel
      key={`selection:${status.authority}:${selected.room_id}`} roomId={selected.room_id} authority={status.authority}
      isOwner selectionOnly /> : null}
    {selected && status?.ready && status.authority && selectedIsOwner && !missionInConsole ? <NativeHostedRoomTaskPanel
      key={`${status.authority}:${selected.room_id}`} roomId={selected.room_id} authority={status.authority}
      isOwner enableAiProposal={developer}
      control={request => read(CONTROL, request)} /> : null}
    {selected && status?.ready && !selectedIsOwner && !missionInConsole ? <p className="mt-2 text-xs text-slate-400">
      The host reviews and queues instructions for their selected Codex task. Your room conversation and shared reports remain available here.
    </p> : null}
    {selected && status?.ready && status.authority && !missionInConsole ? <NativeSharedRoomReportsPanel
      key={`reports:${generation.current}:${status.authority}:${selected.room_id}`} roomId={selected.room_id}
      authority={status.authority} disabled={busy || waiting} /> : null}
    {developer && selected && status?.ready && status.authority && !missionInConsole ? <NativeSharedInterpreterReportsPanel
      key={`ai-reports:${generation.current}:${status.authority}:${selected.room_id}`}
      roomId={selected.room_id} authority={status.authority} disabled={busy || waiting} /> : null}
    <p className="mt-2 text-xs text-slate-400">These rooms belong to the service shown above. Owners can select a paired task and queue an approved transfer here. Three-person rooms can join a separate human voice channel in Party Chat; no voice is sent to GPT Live. The rooms below use this device's local service.</p>
    </section>;
    return portalTarget === undefined ? panel : portalTarget ? createPortal(panel, portalTarget) : null;
  };
  if (!native) return null;
  return selected && status?.ready && status.authority && selected.self_participant_id
    ? <NativeHostedRoomTextOwnerBridge
        key={`owner:${generation.current}:${status.authority}:${selected.room_id}:${selected.self_participant_id}`}
        room={selected} authority={status.authority} draftStore={draftStore}
        onChange={onHostedRoomTextOwnerChange}>{renderPanel}</NativeHostedRoomTextOwnerBridge>
    : renderPanel(null);
}
