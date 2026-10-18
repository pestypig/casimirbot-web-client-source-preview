import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DESKTOP_AUTH0_ROOM_CONNECTION_START_PATH as START,
  DESKTOP_AUTH0_ROOM_CONNECTION_STATUS_PATH as STATUS,
  DESKTOP_AUTH0_ROOM_CONNECTION_DISCONNECT_PATH as DISCONNECT,
  DESKTOP_AUTH0_ROOM_CONTROL_PATH as CONTROL,
  parseDesktopAuth0AccountLinkStartReceipt,
} from "@shared/desktop-auth0-account-link";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, readCachedAccountCapabilityPolicy } from
  "@/lib/workstation/accountCapabilityPolicy";
import { NativeHostedRoomTaskPanel } from "./NativeHostedRoomTaskPanel";
import { NativeSharedRoomReportsPanel } from "./NativeSharedRoomReportsPanel";
import { NativeSharedInterpreterReportsPanel } from "./NativeSharedInterpreterReportsPanel";
import { NativeHostedRoomInterpreterStatus } from "./NativeHostedRoomInterpreterStatus";
import { NativeHostedRoomTextConversation,
  type NativeHostedRoomTextConversationOwner } from "./NativeHostedRoomTextConversation";
import { NativeHostedRoomTextOwnerBridge,
  type HostedRoomTextOwnerSnapshot } from "./NativeHostedRoomTextOwnerBridge";
import { DiscordVoiceGptLiveBridge, type DiscordVoiceBridgeState } from
  "./DiscordVoiceGptLiveBridge";
import type { RoomTextDraftStore } from "./RoomTextDraftStore";
import { discordVoiceRenewalReceiptSchema } from "@shared/discord-voice-renewal";

export type DiscordVoiceRenewalPending = {
  requestId: string;
  invitationId: string;
  expiresAtMs: number;
  acknowledge: () => Promise<boolean>;
};

type Status = { configured: boolean; ready: boolean; authority: string | null; expires_at: string | null };
type Room = { room_id: string; title: string; status: string; self_participant_id?: string;
  capacity_profile?: "two_person_voice" | "three_human_text"; max_participants?: number;
  participants: Array<{ participant_id: string; display_name: string; role?: string }> };
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

// Stable across retries, remounts and restarts without persisting an invitation.
export const nativeRoomJoinKey = async (authority: string, roomId: string, invite: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["native-room-join-v1", authority, roomId, invite])));
  return `native-join:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
};

export function NativeRoomConnectionPanel({ fieldIdPrefix, draftStore, portalTarget,
  realtimeSessionId, runtimeActive,
  onHostedRoomTextOwnerChange, onOpenRoomConsole, onOpenRoomMissionConsole,
  onDiscordVoiceRenewalRequest }: {
  fieldIdPrefix: string; draftStore?: RoomTextDraftStore;
  realtimeSessionId: string | null; runtimeActive: boolean;
  portalTarget?: HTMLElement | null;
  onHostedRoomTextOwnerChange?: (snapshot: HostedRoomTextOwnerSnapshot | null) => void;
  onOpenRoomConsole?: () => void;
  onOpenRoomMissionConsole?: () => void;
  onDiscordVoiceRenewalRequest?: (request: DiscordVoiceRenewalPending | null) => void;
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
  const [message, setMessage] = useState<string | null>(null);
  const generation = useRef(0);
  const refreshSequence = useRef(0);
  const requests = useRef(new Set<AbortController>());
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discordBridge = useRef<DiscordVoiceGptLiveBridge | null>(null);
  const discordBridgeRoom = useRef<string | null>(null);
  const [discordVoiceApproved, setDiscordVoiceApproved] = useState(false);
  const [discordBridgeState, setDiscordBridgeState] = useState<DiscordVoiceBridgeState>("closed");
  const [discordBridgeMessage, setDiscordBridgeMessage] = useState<string | null>(null);

  const stopDiscordBridge = useCallback(async () => {
    const active = discordBridge.current;
    discordBridge.current = null;
    discordBridgeRoom.current = null;
    setDiscordVoiceApproved(false);
    if (active) await active.close();
  }, []);

  const clearWait = useCallback(() => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
    waitTimer.current = null;
    setWaiting(false);
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
      if (!response.ok) throw new RoomRequestError(response.status, value?.outcome_unknown === true, value?.error);
      return value;
    } finally { clearTimeout(timer); requests.current.delete(controller); }
  }, []);

  useEffect(() => {
    if (!native || !status?.ready || !selected || selected.status === "closed" ||
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
  }, [native, onDiscordVoiceRenewalRequest, read, selected?.room_id, selected?.status, status?.ready]);

  const refresh = useCallback(async () => {
    const epoch = generation.current;
    const sequence = ++refreshSequence.current;
    try {
      const value = await read(STATUS);
      if (epoch !== generation.current || sequence !== refreshSequence.current) return;
      if (value?.schema !== "casimir_desktop_room_connection_status/1" || typeof value.ready !== "boolean" || typeof value.configured !== "boolean" || value.bearer_included !== false || value.subject_included !== false ||
        (value.authority !== null && typeof value.authority !== "string") ||
        (value.ready && (!value.configured || !value.authority || !Number.isFinite(Date.parse(value.expires_at))))) throw new Error("invalid");
      setStatus(value);
      if (!value.ready) { setRooms([]); setSelected(null); }
      setMessage(null);
    } catch { if (epoch === generation.current && sequence === refreshSequence.current) { setStatus(null); setRooms([]); setSelected(null); setMessage("Room connection status is unavailable. Check your account and try again."); } }
  }, [read]);

  useEffect(() => {
    if (!native) return;
    void refresh();
    const unsubscribe = window.casimirDesktop?.onAuth0AccountLinkCompletion?.(() => {
      if (waitTimer.current) { generation.current += 1; clearWait(); setBusy(false); }
      void refresh();
    });
    const accountChanged = () => { invalidate(); void refresh(); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
    return () => { unsubscribe?.(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged); invalidate(); };
  }, [native, refresh, clearWait, invalidate]);

  const authorize = async () => {
    generation.current += 1;
    clearWait(); setRooms([]); setSelected(null);
    setStatus(previous => previous ? { ...previous, ready: false, expires_at: null } : null);
    const epoch = generation.current; setBusy(true); setMessage(null);
    try {
      const receipt = parseDesktopAuth0AccountLinkStartReceipt(await read(START, {}));
      if (epoch !== generation.current) return;
      if (!receipt || receipt.authorization_purpose !== "shared_live_rooms") throw new Error("invalid");
      setWaiting(true);
      waitTimer.current = setTimeout(() => {
        if (epoch !== generation.current) return;
        generation.current += 1; clearWait(); setBusy(false);
        setMessage("Room authorization expired. Start a new authorization.");
      }, Math.max(0, Date.parse(receipt.expires_at) - Date.now()));
      await window.casimirDesktop!.openAuth0AccountLink!(receipt.authorization_url);
    } catch { if (epoch === generation.current) { clearWait(); setMessage("Room authorization could not start. Check the configured room service and account permissions."); } }
    finally { if (epoch === generation.current) setBusy(false); }
  };

  const control = async (operation: "list" | "inspect" | "join", id?: string) => {
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
  };

  const disconnect = async () => {
    invalidate(); const epoch = generation.current; setBusy(true);
    try { await read(DISCONNECT, {}); if (epoch === generation.current) { await refresh(); if (epoch === generation.current) setMessage("Room connection disconnected. Room membership is unchanged."); } }
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
        !runtimeActive || !discordVoiceApproved || discordBridge.current) return;
    const room = selected;
    const bridge = new DiscordVoiceGptLiveBridge({
      realtimeSessionId, roomId: room.room_id,
      issueTicket: () => read(CONTROL, { operation: "discord_voice_bridge_ticket", room_id: room.room_id }),
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
    const panel = <section className="rounded-xl border border-cyan-300/20 bg-black/20 p-3 md:col-span-2" aria-label="Room service connection">
    <h3 className="text-sm font-semibold text-cyan-100">Hosted service rooms · human conversation by default</h3>
    <p className="mt-1 text-xs text-slate-400">Membership and room coordination include no AI model. Selecting a separate Codex task uses its owner's AI account only after reviewed instruction queueing. The explicit Discord GPT Live pilot below is a separate, consent-gated bridge.</p>
    {developer ? <p className="mt-1 text-xs text-fuchsia-100">Developer evaluation only: shared AI can use the host's separately configured OpenAI key after exact-message author permission and a reviewed turn request. The host's key and Codex account are not shared with guests.</p> : null}
    <p className="mt-1 text-xs text-slate-300">{status?.authority ?? "No room service is configured."}</p>
    <p className="mt-1 text-xs text-slate-400">{status?.ready ? "Authorized for this account." : waiting ? "Complete room authorization in your browser." : status && !status.configured
      ? "Hosted rooms are not set up in this installation. The app operator must configure a room service that matches this app's sign-in audience, then restart the app. Local rooms remain available on this device."
      : "Authorize this account to view or join rooms on the configured service."}</p>
    <div className="my-2 flex flex-wrap gap-2">
      <button type="button" disabled={busy || waiting || !status?.configured} onClick={() => void authorize()}>Authorize room service</button>
      <button type="button" disabled={busy} onClick={() => void refresh()}>Refresh connection</button>
      <button type="button" onClick={() => void disconnect()}>Disconnect room service</button>
      {status?.ready ? <button type="button" disabled={busy} onClick={() => void control("list")}>Load service rooms</button> : null}
    </div>
    {message ? <p role="status" className="my-2 text-xs text-amber-100">{message}</p> : null}
    {status?.ready ? <form onSubmit={event => { event.preventDefault(); void control("join"); }} className="grid gap-2">
      <label htmlFor={`${fieldIdPrefix}-remote-room`}>Service room ID</label>
      <input id={`${fieldIdPrefix}-remote-room`} value={roomId} onChange={event => setRoomId(event.target.value)} autoComplete="off" maxLength={256} disabled={busy} className="rounded border border-white/20 bg-slate-900 p-2" />
      <label htmlFor={`${fieldIdPrefix}-remote-invite`}>Service invitation</label>
      <input id={`${fieldIdPrefix}-remote-invite`} value={invite} onChange={event => setInvite(event.target.value)} autoComplete="off" maxLength={64} disabled={busy} className="rounded border border-white/20 bg-slate-900 p-2" />
      <button type="submit" disabled={busy || !roomId.trim() || !invite.trim()}>Join service room</button>
    </form> : null}
    {rooms.map(room => <button className="m-1 rounded border border-white/20 p-2 text-xs" type="button" key={room.room_id} disabled={busy} onClick={() => void control("inspect", room.room_id)}>{room.title}</button>)}
    {selected ? <p className="mt-2 text-xs">{selected.title} · {selected.participants.length}/{selected.max_participants ?? 2} members · {selected.status}
      {selected.capacity_profile === "three_human_text" ? " · optional human voice in Party Chat; GPT Live is separate" : ""}</p> : null}
    {selected && status?.ready && window.casimirDesktop?.openRoomService ? <button type="button" disabled={busy || waiting} onClick={() => void openServiceRoom()}>Open selected room in browser</button> : null}
    {selected && status?.ready && selectedIsOwner ? <section className="mt-3 rounded border border-cyan-300/20 p-2" aria-label="Discord GPT Live pilot">
      <h4 className="text-sm font-semibold text-cyan-100">Discord GPT Live pilot</h4>
      <p className="mt-1 text-xs text-slate-400">Keep the laptop microphone off. The consented Discord call supplies GPT Live input only while this bridge is connected.</p>
      <p className="mt-1 text-xs text-slate-300">Connect one armed Discord voice invitation for this room to the GPT Live session already open in this harness. Every present Discord participant must consent in Discord before the bot receives or plays call audio.</p>
      <label className="mt-2 flex items-start gap-2 text-xs text-slate-200">
        <input type="checkbox" checked={discordVoiceApproved} disabled={discordBridgeState === "active" || discordBridgeState === "connecting"}
          onChange={event => setDiscordVoiceApproved(event.target.checked)} />
        I approve sending this call's consented audio to my open GPT Live session and playing its replies in the call. Stop the bridge when I leave.
      </label>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={!runtimeActive || !realtimeSessionId || !discordVoiceApproved ||
          discordBridgeState !== "closed" || selected.status === "closed"}
          onClick={() => void startDiscordBridge()}>Connect Discord call to GPT Live</button>
        <button type="button" disabled={discordBridgeState === "closed"}
          onClick={() => void stopDiscordBridge()}>Stop Discord GPT Live bridge</button>
      </div>
      {discordBridgeMessage ? <p role="status" className="mt-1 text-xs text-amber-100">{discordBridgeMessage}</p> : null}
      {!runtimeActive || !realtimeSessionId ? <p className="mt-1 text-xs text-slate-400">Start GPT Live in Helix Ask before connecting this call.</p> : null}
    </section> : null}
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
    {selected && status?.ready && missionInConsole && conversation?.admitted ? <button type="button"
      onClick={onOpenRoomMissionConsole}>Review mission in Console</button> : null}
    {selected && status?.ready && missionInConsole && !conversation?.admitted ? <p className="mt-2 text-xs text-slate-400">
      Confirm this account's room text access before opening its mission in Console.
    </p> : null}
    {selected && status?.ready && status.authority && selectedIsOwner && !missionInConsole ? <NativeHostedRoomTaskPanel
      key={`${status.authority}:${selected.room_id}`} roomId={selected.room_id} authority={status.authority}
      isOwner enableAiProposal={developer} /> : null}
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
