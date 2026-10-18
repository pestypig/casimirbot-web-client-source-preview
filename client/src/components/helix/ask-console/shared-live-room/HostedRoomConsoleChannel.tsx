import React from "react";
import type { HelixAskSurfaceFrameProps } from "../HelixAskSurfaceFrame";
import { HelixAskSurfaceFrameSurface } from "../HelixAskSurfaceFrameSurface";
import type { HostedRoomTextOwnerSnapshot } from "./NativeHostedRoomTextOwnerBridge";
import { HELIX_HOSTED_ROOM_OPEN_DIALOG_EVENT } from "./HelixAskSharedLiveRoomControls";
import { HelixConsoleMessage } from "../HelixConsoleMessage";

export function HostedRoomConsoleHistory({ snapshot }: { snapshot: HostedRoomTextOwnerSnapshot }) {
  const { room, authority, conversation } = snapshot;
  return <div className="space-y-3 text-xs">
    <p className="text-slate-400">Hosted at {authority} · members only. Room text does not call AI or queue a task.</p>
    <div role="log" aria-label="Selected hosted room text history" className="max-h-[35vh] space-y-2 overflow-y-auto">
      {conversation.messages.length ? conversation.messages.map(message =>
        <HelixConsoleMessage key={message.message_id} kind="person" text={message.text}
          author={room.participants.find(person =>
            person.participant_id === message.author_participant_id)?.display_name ?? "Former member"} />)
        : <p className="text-slate-500">No room text yet.</p>}
    </div>
    <button type="button" className="text-cyan-100 underline decoration-cyan-300/30"
      onClick={() => window.dispatchEvent(new Event(HELIX_HOSTED_ROOM_OPEN_DIALOG_EVENT))}>
      Review sharing and room details
    </button>
    {conversation.error ? <p role="status" className="text-amber-100">{conversation.error}</p> : null}
  </div>;
}

export function HostedRoomPillSurface({ frameState, snapshot }: {
  frameState: Omit<HelixAskSurfaceFrameProps, "children">;
  snapshot: HostedRoomTextOwnerSnapshot;
}) {
  const { room, conversation } = snapshot;
  return <HelixAskSurfaceFrameSurface {...frameState} isOffline={false}
    controlId="helix.ask.hosted-room-text.send" onSubmit={event => {
      event.preventDefault(); void conversation.send();
    }}>
    <div className="relative z-[80] space-y-2 px-4 py-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-cyan-100">{room.title} · hosted room text</span>
        <span className="text-slate-400">{conversation.admitted ? "Members only" : "Checking membership"}</span>
      </div>
      <label htmlFor="helix-hosted-room-text-draft" className="sr-only">Message Party Chat members</label>
      <textarea id="helix-hosted-room-text-draft" value={conversation.draft} maxLength={2000}
        disabled={!conversation.admitted || conversation.sending || room.status === "closed"}
        onChange={event => conversation.updateDraft(event.target.value)}
        placeholder="Message room members…"
        className="min-h-20 w-full resize-y rounded-lg bg-slate-950/60 p-2 text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-300" />
      <div className="flex justify-end"><button type="submit"
        disabled={!conversation.admitted || conversation.sending || !conversation.draft.trim() || room.status === "closed"}
        className="rounded-lg bg-cyan-500/20 px-3 py-1.5 font-semibold text-cyan-50 disabled:opacity-40">
        {conversation.sending ? "Sending…" : "Send to Party Chat"}
      </button></div>
    </div>
  </HelixAskSurfaceFrameSurface>;
}
