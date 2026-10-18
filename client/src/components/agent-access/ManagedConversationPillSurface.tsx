import React from "react";
import type { HelixAskSurfaceFrameProps } from "@/components/helix/ask-console/HelixAskSurfaceFrame";
import { HelixAskSurfaceFrameSurface } from "@/components/helix/ask-console/HelixAskSurfaceFrameSurface";
import { useSharedManagedConversation } from "./useManagedConversation";

/** The same Helix pill frame, bound only to the native private Agents API conversation. */
export function ManagedConversationPillSurface({ frameState }: {
  frameState: Omit<HelixAskSurfaceFrameProps, "children">;
}) {
  const conversation = useSharedManagedConversation();
  const send = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (conversation) void conversation.send();
  };
  return <HelixAskSurfaceFrameSurface {...frameState} isOffline={false}
    controlId="helix.ask.private-api-chat.send" onSubmit={send}>
    <div className="relative z-[80] space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div><span className="font-semibold text-cyan-100">Cloud Agent DM</span>
          <span className="ml-2 text-slate-400">{conversation?.sourceLabel ?? "Unavailable"}</span></div>
        {conversation?.sourceLabel.startsWith("Account changed") ? <button type="button"
          onClick={conversation.recheck} className="rounded-lg border border-amber-300/40 px-2 py-1 text-amber-100">Recheck</button> : null}
      </div>
      <label htmlFor="helix-private-api-chat-draft" className="sr-only">Message Cloud Agent DM</label>
      <textarea id="helix-private-api-chat-draft" value={conversation?.draft ?? ""} maxLength={8000}
        disabled={!conversation?.connectionReady || conversation.busy}
        onChange={event => conversation?.setDraft(event.target.value)}
        placeholder="Message the private agent…"
        className="min-h-20 w-full resize-y rounded-lg bg-slate-950/60 p-2 text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-300" />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <button type="button" disabled={!conversation?.view.active || conversation.busy}
          onClick={() => void conversation?.clear()} className="text-slate-400 hover:text-white disabled:opacity-40">New chat</button>
        <div className="flex gap-2">
          {conversation?.busy ? <button type="button" onClick={() => void conversation.stop()}
            className="rounded-lg border border-rose-300/40 px-3 py-1.5 text-rose-100">Stop</button> : null}
          <button type="submit" disabled={!conversation?.connectionReady || conversation.busy || !conversation.draft.trim()}
            className="rounded-lg bg-cyan-500/20 px-3 py-1.5 font-semibold text-cyan-50 disabled:opacity-40">Send</button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="text-xs text-slate-400">{conversation?.message ?? "Cloud Agent DM is unavailable."}</p>
    </div>
  </HelixAskSurfaceFrameSurface>;
}
