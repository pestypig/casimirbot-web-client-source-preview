import React from "react";
import { HelixAskFinalAnswer } from "./HelixAskFinalAnswer";

export type HelixConsoleMessageProps = {
  author: string;
  text: string;
  kind: "person" | "agent";
  context?: React.ReactNode;
};

/** Shared transcript presentation; the conversation owner still controls admission and Send. */
export function HelixConsoleMessage({ author, text, kind, context }: HelixConsoleMessageProps) {
  return <article className={`rounded-lg border px-3 py-2 ${kind === "agent"
    ? "border-fuchsia-300/20 bg-fuchsia-400/[0.08]"
    : "border-white/10 bg-white/[0.04]"}`}>
    <p className={`text-xs font-semibold ${kind === "agent" ? "text-fuchsia-100" : "text-cyan-100"}`}>
      {author}
    </p>
    {kind === "agent" ? <HelixAskFinalAnswer text={text} />
      : <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-200">{text}</p>}
    {context ? <div className="mt-2 text-xs text-slate-400">{context}</div> : null}
  </article>;
}
