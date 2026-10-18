import {
  buildDebugExportDrawerFallbackResult,
  type DebugExportUiResult,
} from "@/lib/agi/debugExport";

export type HelixAskDebugClipboardCopyResult = {
  ok: boolean;
  attempted_payload_hash?: string;
  copied_payload_hash?: string;
  copied_text_length: number;
  method: "navigator.clipboard" | "textarea_fallback" | "debug_drawer" | "download_link" | "backend_endpoint" | "failed";
  readback_match?: "exact" | "unavailable" | "mismatch" | "empty";
  fallback_presented?: boolean;
  error?: string;
};

export type HelixAskDebugExportDrawerState = {
  replyId: string;
  payload: string;
  payloadHash: string;
  result: DebugExportUiResult;
} | null;

export type HelixAskDebugDrawerCopyProjection = {
  drawerState: HelixAskDebugExportDrawerState;
  finalCopyResult: HelixAskDebugClipboardCopyResult;
  copied: boolean;
};

export function buildHelixAskDebugExportDrawerState(args: {
  replyId: string;
  payload: string;
  payloadHash: string;
  result: DebugExportUiResult;
}): HelixAskDebugExportDrawerState {
  return {
    replyId: args.replyId,
    payload: args.payload,
    payloadHash: args.payloadHash,
    result: args.result,
  };
}

export function clearHelixAskDebugDrawerForStaleReply(
  current: HelixAskDebugExportDrawerState,
  latestReplyId: string | null | undefined,
): HelixAskDebugExportDrawerState {
  if (!current) return null;
  return current.replyId === latestReplyId ? current : null;
}

export function buildHelixAskDebugDrawerCopyProjection(args: {
  replyId: string;
  exportPayload: string;
  payloadHash: string;
  copyResult: HelixAskDebugClipboardCopyResult;
}): HelixAskDebugDrawerCopyProjection {
  if (args.copyResult.ok) {
    const drawerResult: DebugExportUiResult = {
      ok: true,
      attempted_payload_hash: args.payloadHash,
      copied_payload_hash: args.copyResult.copied_payload_hash,
      copied_text_length: args.copyResult.copied_text_length,
      method: args.copyResult.method,
      readback_match: args.copyResult.readback_match ?? "unavailable",
      fallback_presented: false,
      error: args.copyResult.error,
    };
    return {
      drawerState: buildHelixAskDebugExportDrawerState({
        replyId: args.replyId,
        payload: args.exportPayload,
        payloadHash: args.payloadHash,
        result: drawerResult,
      }),
      finalCopyResult: args.copyResult,
      copied: true,
    };
  }

  const fallbackResult = buildDebugExportDrawerFallbackResult({
    attemptedPayloadHash: args.payloadHash,
    copiedTextLength: args.exportPayload.length,
    readbackMatch: args.copyResult.readback_match,
    error: args.copyResult.error,
  });
  return {
    drawerState: buildHelixAskDebugExportDrawerState({
      replyId: args.replyId,
      payload: args.exportPayload,
      payloadHash: args.payloadHash,
      result: fallbackResult,
    }),
    finalCopyResult: fallbackResult,
    copied: false,
  };
}
