import React from "react";
import type { LiveConnectionState } from "@shared/desktop-live-connection";
import { useManagedConversation, useSharedManagedConversation, type ManagedConversationController } from "./useManagedConversation";

type ManagedConversationPreviewProps = {
  configured?: boolean;
  source?: LiveConnectionState["source"];
  retainedDraft?: string;
  onRetainedDraftChange?: (value: string) => void;
};

/** Reuse the Console owner when present; the standalone view keeps its old lifecycle. */
export function ManagedConversationPreview(props: ManagedConversationPreviewProps) {
  const shared = useSharedManagedConversation();
  return shared ? <ManagedConversationPreviewSurface conversation={shared} sharedOwner />
    : <StandaloneManagedConversationPreview {...props} />;
}

function StandaloneManagedConversationPreview(props: ManagedConversationPreviewProps) {
  const conversation = useManagedConversation(props);
  return <ManagedConversationPreviewSurface conversation={conversation} sharedOwner={false} />;
}

/** Private preview: bounded native and public reads, plus a validated task proposal. */
function ManagedConversationPreviewSurface({ conversation, sharedOwner }: {
  conversation: ManagedConversationController;
  sharedOwner: boolean;
}) {
  if (!conversation.available) return null;
  return <div className="space-y-3 border-t border-white/10 pt-3" aria-label="Private managed conversation preview">
    <h4 className="font-medium">Cloud Agent DM · managed conversation preview</h4>
    <p className="text-xs text-slate-400">OpenAI Agents API · gpt-6-astra, low reasoning · {conversation.sourceLabel}. The OpenAI project owning the configured key is expected to be billed; this panel does not measure usage. The agent can read the desktop clock, retrieve CasimirBot&apos;s public reasoning context, call three read-only public badge MCP tools, and propose a bounded handoff to an already paired Codex task. Badge context is diagnostic, not proof or an answer. It has no direct program actions or broad Codex MCP access; the Console validates and displays any handoff. The screen shows at most the latest eight exchanges; the provider session can retain earlier context. Local history clears on app restart, which does not confirm provider-session deletion. Start a new conversation to request deletion. {sharedOwner ? "Closing this view keeps the Console-owned turn running; use Stop to interrupt it." : "Closing this preview stops a running turn."}</p>
    <div aria-label="Private managed messages" className="max-h-60 space-y-2 overflow-y-auto rounded-lg border border-white/10 p-2">
      {conversation.view.messages.length ? conversation.view.messages.map((item, index) => <div key={index}><p><strong>{item.role === "user" ? "You" : "Agent"}:</strong> {item.text}</p>{item.publicContextMcpTools?.length ? <span role="note" aria-label="Public context MCP calls" className="text-xs text-slate-400">Public context MCP used: {item.publicContextMcpTools.join(", ")}. Provider stream reported completed read-only calls; badge context is not proof or an answer.</span> : null}</div>)
        : <p className="text-slate-400">No messages yet.</p>}
    </div>
    <label className="block" htmlFor="managed-conversation-draft">Message to private agent</label>
    <textarea id="managed-conversation-draft" value={conversation.draft} maxLength={8000}
      disabled={conversation.busy || !conversation.connectionReady}
      onChange={event => conversation.setDraft(event.target.value)}
      className="min-h-20 w-full rounded-lg border border-white/20 bg-slate-950 p-2" />
    <div className="flex gap-2"><button type="button" disabled={conversation.busy || !conversation.connectionReady || !conversation.draft.trim()}
      onClick={() => void conversation.send()} className="rounded-lg border border-cyan-300/40 px-3 py-2 disabled:opacity-40">Send private message</button>
      {conversation.busy ? <button type="button" onClick={() => void conversation.stop()}
        className="rounded-lg border border-rose-300/40 px-3 py-2 text-rose-100">Stop managed turn</button> : null}
      <button type="button" disabled={conversation.busy || !conversation.view.active}
        onClick={() => void conversation.clear()} className="rounded-lg border border-white/20 px-3 py-2 disabled:opacity-40">Start new conversation</button></div>
    <p role="status" aria-live="polite" className="text-xs text-slate-300">{conversation.message}</p>
  </div>;
}
