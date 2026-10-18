import React from "react";
import { useSharedManagedConversation } from "@/components/agent-access/useManagedConversation";
import { buildHelixAskComposerViewModel } from "./HelixAskComposer";
import { HelixAskLegacyComposerSurface, type HelixAskLegacyComposerSurfaceProps } from "./HelixAskLegacyComposerSurface";
import type { HelixConsoleChannel } from "./HelixConsoleConversationWorkspace";
import type { LocalRoomTextOwnerSnapshot } from "./shared-live-room/LocalRoomTextOwnerBridge";
import type { HostedRoomTextOwnerSnapshot } from "./shared-live-room/NativeHostedRoomTextOwnerBridge";
import { readCachedAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";

type Props = {
  composer: HelixAskLegacyComposerSurfaceProps;
  selectedChannel: HelixConsoleChannel;
  localRoom?: LocalRoomTextOwnerSnapshot | null;
  hostedRoom?: HostedRoomTextOwnerSnapshot | null;
  onSelectRoomAgent?: (source: "local" | "hosted") => void;
};

/** One mounted Ask toolbar and room controller; only its selected send/draft contract changes. */
export function HelixConsoleSelectedComposer({ composer, selectedChannel, localRoom, hostedRoom,
  onSelectRoomAgent }: Props) {
  const managed = useSharedManagedConversation();
  if (selectedChannel === "private_ask" || selectedChannel === "bound_task")
    return <HelixAskLegacyComposerSurface {...composer} />;

  if (selectedChannel === "adapter_ai")
    return <HelixAskLegacyComposerSurface {...composer}
      destination={<div className="text-[11px] font-semibold text-cyan-100">Adapter AI · read-only run activity</div>}
      actionToolbar={{ ...composer.actionToolbar, personalInputDisabled: true,
        submitDisabled: true, onSubmitIntent: () => undefined, onStop: () => undefined }}
      textarea={{ ...composer.textarea, ariaLabel: "Adapter AI activity is read only",
        placeholder: "Use the paired Codex task to set or revise the adapter goal…",
        value: "", disabled: true, ariaDisabled: true, onPaste: undefined,
        onKeyDown: undefined, onInputValue: () => undefined, onSubmitRequested: () => undefined }}
      textareaRef={undefined} slashCommandMenu={null} />;

  if (selectedChannel === "local_room_agent" || selectedChannel === "hosted_room_agent")
    return <HelixAskLegacyComposerSurface {...composer}
      destination={<div className="text-[11px] font-semibold text-fuchsia-100">Room Agent · shared room reasoning</div>}
      actionToolbar={{ ...composer.actionToolbar, personalInputDisabled: true,
        submitDisabled: true, onSubmitIntent: () => undefined, onStop: () => undefined }}
      textarea={{ ...composer.textarea, ariaLabel: "Room Agent input unavailable",
        placeholder: "Share an exact Party Chat message with Room Agent first…",
        value: "", disabled: true, ariaDisabled: true, onPaste: undefined,
        onKeyDown: undefined, onInputValue: () => undefined, onSubmitRequested: () => undefined }}
      textareaRef={undefined} slashCommandMenu={null} />;

  const room = selectedChannel === "local_room" ? localRoom : selectedChannel === "hosted_room" ? hostedRoom : null;
  const conversation = room?.conversation;
  const isApi = selectedChannel === "private_api";
  const isRoom = !isApi;
  const roomReady = Boolean(room && conversation?.admitted && room.room.status !== "closed");
  const ready = isApi ? Boolean(managed?.connectionReady) : roomReady;
  const busy = isApi ? Boolean(managed?.busy) : Boolean(conversation?.sending);
  const draft = isApi ? managed?.draft ?? "" : conversation?.draft ?? "";
  const roomAgentIntent = isRoom && /^\/agent(?:\s|$)/iu.test(draft.trim());
  const roomAgentShortcut = roomAgentIntent && Boolean(room) &&
    readCachedAccountCapabilityPolicy()?.account_type === "developer" &&
    (selectedChannel === "hosted_room" || localRoom?.room.capacity_profile === "three_human_text");
  const roomAgentUnavailable = roomAgentIntent && !roomAgentShortcut;
  const roomAgentPrompt = roomAgentShortcut ? draft.trim().replace(/^\/agent\s*/iu, "").trim() : "";
  const label = isApi ? "Cloud Agent DM" : room ? `Party Chat · ${room.room.title}` : "Party Chat unavailable";
  const status = isApi ? managed?.sourceLabel ?? "Connection unavailable"
    : roomReady ? "Members only" : "Room text unavailable";
  const send = () => {
    if (!ready || busy || !draft.trim() || roomAgentUnavailable ||
        (roomAgentShortcut && !roomAgentPrompt)) return;
    if (isApi) void managed?.send();
    else if (roomAgentShortcut) void conversation?.send(roomAgentPrompt).then(confirmed => {
      if (confirmed) onSelectRoomAgent?.(selectedChannel === "hosted_room" ? "hosted" : "local");
    });
    else void conversation?.send();
  };
  const stop = () => { if (isApi) void managed?.stop(); };
  const viewModel = {
    ...buildHelixAskComposerViewModel({ busy: isApi && busy }),
    submitAriaLabel: isApi ? busy ? "Stop cloud agent response" : "Send to Cloud Agent DM"
      : roomAgentShortcut ? "Post for Room Agent review"
      : roomAgentUnavailable ? "Room Agent unavailable" : "Send to Party Chat",
    submitTitle: isApi ? busy ? "Stop cloud agent response" : "Send to Cloud Agent DM"
      : roomAgentShortcut ? "Post for Room Agent review"
      : roomAgentUnavailable ? "Room Agent unavailable" : "Send to Party Chat",
    submitButtonType: "button" as const,
    submitIcon: (isApi && busy ? "square" : "send") as "square" | "send",
  };
  return <HelixAskLegacyComposerSurface {...composer}
    destination={<div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px]">
      <span className="min-w-0 truncate font-semibold text-cyan-100" title={label}>{label}</span>
      <span role="status" className={`shrink-0 ${ready ? "text-slate-400" : "text-amber-200"}`}>{status}</span>
      {roomAgentShortcut ? <span className="w-full text-fuchsia-100">Post “{roomAgentPrompt || "…"}” to Party Chat, then approve that exact message in Room Agent. No AI call occurs now.</span> : null}
      {roomAgentUnavailable ? <span className="w-full text-amber-100">Room Agent is unavailable for this account or room. Choose another message or an eligible room.</span> : null}
      {isRoom ? <span className="sr-only">Room text reaches members only. It does not call AI or queue a task.</span> : null}
    </div>}
    voiceLevelMonitor={composer.voiceLevelMonitor}
    actionToolbar={{ ...composer.actionToolbar, personalInputDisabled: true,
      submitViewModel: viewModel, submitDisabled: !ready || (!busy && !draft.trim()) ||
        (isRoom && busy) || roomAgentUnavailable || (roomAgentShortcut && !roomAgentPrompt),
      onSubmitIntent: send, onStop: stop }}
    textarea={{ ...composer.textarea, ariaLabel: isApi ? "Message Cloud Agent DM" : "Message Party Chat members",
      placeholder: isApi ? "Message the cloud agent…" : "Message party members…", value: draft,
      disabled: !ready || busy, ariaDisabled: !ready || busy, maxLength: isApi ? 8000 : 2000,
      onPaste: undefined, onKeyDown: undefined, onInputValue: value => {
        if (isApi) managed?.setDraft(value);
        else conversation?.updateDraft(value);
      }, onSubmitRequested: send }}
    textareaRef={undefined} slashCommandMenu={null} />;
}
