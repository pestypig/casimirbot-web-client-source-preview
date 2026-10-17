import { History } from "lucide-react";
import type { ChatMessage } from "@shared/agi-chat";
import { RationaleOverlay } from "./RationaleOverlay";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const roleLabel = isUser ? "You" : isAssistant ? "essence" : message.role;
  return (
    <div
      className={`flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}
      data-chat-message="true"
      data-role={message.role}
      data-trace-id={message.traceId ?? undefined}
    >
      <div className="text-xs uppercase tracking-wide text-slate-400">{roleLabel}</div>
      <div
        className={`max-w-3xl whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser ? "bg-sky-500/80 text-white" : "bg-white/5 text-slate-100"
        }`}
        data-message-content="true"
      >
        {message.content}
      </div>
      {message.whyBelongs && !isUser && (
        <div className="mt-2 w-full">
          <RationaleOverlay why={message.whyBelongs} />
        </div>
      )}
      {message.traceId && (
        <div className="text-[11px] text-slate-500 flex items-center gap-2">
          <History size={12} /> trace {message.traceId.slice(0, 8)}
        </div>
      )}
    </div>
  );
}
