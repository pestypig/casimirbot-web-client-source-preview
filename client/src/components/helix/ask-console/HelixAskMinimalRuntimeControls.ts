import type { HelixAskMinimalRuntimeReply } from "./HelixAskMinimalRuntimeLifecycle";
import type { HelixAskMinimalRuntimeTurnView } from "./HelixAskMinimalRuntimeTurnList";
import {
  HELIX_ASK_MINIMAL_RUNTIME_BACKEND_DEBUG_EXPORT_MATERIALIZER,
  materializeHelixAskMinimalRuntimeDebugCopyText,
} from "./HelixAskMinimalRuntimeDebugExport";

export type HelixAskMinimalRuntimeControlPayload = {
  replyId: string;
  turnId: string;
  isLatest: boolean;
  finalAnswerText: string;
  readAloudText: string;
  debugCopyText: string;
  debugSource: unknown;
};

export type HelixAskMinimalRuntimeControlActions = {
  copyFinal: (payload: HelixAskMinimalRuntimeControlPayload) => void | Promise<void>;
  debugCopy: (payload: HelixAskMinimalRuntimeControlPayload) => void | Promise<void>;
  readAloud: (payload: HelixAskMinimalRuntimeControlPayload) => void | Promise<void>;
};

function coerceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

export function buildHelixAskMinimalRuntimeDebugCopyText(args: {
  reply: HelixAskMinimalRuntimeReply;
  view: HelixAskMinimalRuntimeTurnView;
}): string {
  return JSON.stringify(
    {
      schema: "helix.ask.minimal_runtime.debug_copy.v1",
      reply_id: args.reply.id,
      turn_id: args.reply.turn_id,
      is_latest: args.view.isLatest,
      question: args.reply.question,
      final_answer: args.view.answerText,
      debug: args.reply.debug ?? null,
      result: args.reply.result ?? null,
    },
    null,
    2,
  );
}

export function buildHelixAskMinimalRuntimeControlPayload(args: {
  reply: HelixAskMinimalRuntimeReply;
  view: HelixAskMinimalRuntimeTurnView;
}): HelixAskMinimalRuntimeControlPayload {
  const finalAnswerText = coerceText(args.view.answerText);
  return {
    replyId: args.reply.id,
    turnId: args.reply.turn_id,
    isLatest: args.view.isLatest,
    finalAnswerText,
    readAloudText: finalAnswerText,
    debugCopyText: buildHelixAskMinimalRuntimeDebugCopyText(args),
    debugSource: args.reply.result ?? args.reply.debug ?? null,
  };
}

async function writeTextToBrowserClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === "undefined") return;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function speakTextWithBrowserSpeech(text: string): void {
  if (typeof window === "undefined") return;
  const speech = window.speechSynthesis;
  if (!speech || typeof window.SpeechSynthesisUtterance !== "function") return;
  speech.cancel();
  speech.speak(new window.SpeechSynthesisUtterance(text));
}

export const HELIX_ASK_MINIMAL_RUNTIME_BROWSER_CONTROL_ACTIONS: HelixAskMinimalRuntimeControlActions = {
  copyFinal: (payload) => writeTextToBrowserClipboard(payload.finalAnswerText),
  debugCopy: async (payload) => {
    const debugCopyText = await materializeHelixAskMinimalRuntimeDebugCopyText({
      payload,
      materializeBackendDebugExport: HELIX_ASK_MINIMAL_RUNTIME_BACKEND_DEBUG_EXPORT_MATERIALIZER,
    });
    return writeTextToBrowserClipboard(debugCopyText);
  },
  readAloud: (payload) => speakTextWithBrowserSpeech(payload.readAloudText),
};
