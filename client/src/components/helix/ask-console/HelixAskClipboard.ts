import type { ContextCapsuleSummary } from "@shared/helix-context-capsule";
import { hashDebugExportText } from "@/lib/agi/debugExport";
import { buildContextCapsuleCopyText } from "@/lib/helix/ask-context-capsule-display";
import type { HelixAskDebugClipboardCopyResult } from "./HelixAskDebugDrawerState";

const waitForHelixAskDebugClipboardReadback = async (attempt: number): Promise<void> => {
  const delayMs = [100, 250, 500, 900][Math.min(attempt, 3)] ?? 900;
  await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
};

export async function copyHelixAskPlainTextToClipboard(text: string): Promise<boolean> {
  const value = typeof text === "string" ? text : String(text ?? "");
  if (!value) return false;
  if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(value);
      if (typeof navigator.clipboard.readText !== "function") return true;
      const readback = await navigator.clipboard.readText().catch(() => "");
      if (readback === value) return true;
    } catch {
      // Fall through to textarea copy.
    }
  }
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export async function copyHelixAskContextCapsuleToClipboard(
  summary: ContextCapsuleSummary | null | undefined,
): Promise<boolean> {
  if (!summary) return false;
  return copyHelixAskPlainTextToClipboard(buildContextCapsuleCopyText(summary));
}

export async function copyHelixAskDebugJsonToClipboard(
  payload: string,
): Promise<HelixAskDebugClipboardCopyResult> {
  const json = typeof payload === "string" ? payload : "";
  const attemptedPayloadHash = hashDebugExportText(json);
  if (!json.trim()) {
    return {
      ok: false,
      attempted_payload_hash: attemptedPayloadHash,
      copied_text_length: 0,
      method: "failed",
      readback_match: "empty",
      fallback_presented: false,
      error: "debug_payload_empty",
    };
  }
  try {
    JSON.parse(json);
  } catch {
    return {
      ok: false,
      attempted_payload_hash: attemptedPayloadHash,
      copied_text_length: 0,
      method: "failed",
      readback_match: "mismatch",
      fallback_presented: false,
      error: "debug_payload_invalid_json",
    };
  }

  try {
    if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
      if (typeof navigator.clipboard.readText !== "function") {
        await navigator.clipboard.writeText(json);
        return {
          ok: true,
          attempted_payload_hash: attemptedPayloadHash,
          copied_payload_hash: attemptedPayloadHash,
          copied_text_length: json.length,
          method: "navigator.clipboard",
          readback_match: "unavailable",
          fallback_presented: false,
          error: "clipboard_readback_unavailable",
        };
      }
      let lastError: Error | null = null;
      let wrote = false;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await navigator.clipboard.writeText(json);
        wrote = true;
        await waitForHelixAskDebugClipboardReadback(attempt);
        const confirm = await navigator.clipboard.readText().catch(() => {
          throw new Error("clipboard_readback_unavailable");
        });
        if (confirm === json) {
          return {
            ok: true,
            attempted_payload_hash: attemptedPayloadHash,
            copied_payload_hash: hashDebugExportText(confirm),
            copied_text_length: json.length,
            method: "navigator.clipboard",
            readback_match: "exact",
            fallback_presented: false,
          };
        }
        if (confirm.trim().length === 0) {
          lastError = new Error("clipboard_empty_after_write");
        } else {
          lastError = new Error("clipboard_mismatch_after_write");
        }
      }
      if (wrote && typeof document === "undefined") {
        return {
          ok: false,
          attempted_payload_hash: attemptedPayloadHash,
          copied_text_length: 0,
          method: "failed",
          readback_match: "mismatch",
          fallback_presented: true,
          error: lastError?.message ?? "clipboard_mismatch_after_write",
        };
      }
      throw lastError ?? new Error("clipboard_write_failed");
    }
  } catch (error) {
    if (typeof window !== "undefined") {
      (window as unknown as { __HELIX_LAST_UNIFIED_DEBUG_COPY_ERROR__?: string }).__HELIX_LAST_UNIFIED_DEBUG_COPY_ERROR__ =
        error instanceof Error ? error.message : String(error);
    }
  }

  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = json;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      const copied = document.execCommand("copy");
      if (copied) {
        if (typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function") {
          await waitForHelixAskDebugClipboardReadback(1);
          const confirm = await navigator.clipboard.readText().catch(() => "");
          if (confirm.trim().length === 0) {
            return {
              ok: false,
              attempted_payload_hash: attemptedPayloadHash,
              copied_text_length: 0,
              method: "failed",
              readback_match: "empty",
              fallback_presented: true,
              error: "clipboard_empty_after_write",
            };
          }
          if (confirm !== json) {
            return {
              ok: false,
              attempted_payload_hash: attemptedPayloadHash,
              copied_text_length: 0,
              method: "failed",
              readback_match: "mismatch",
              fallback_presented: true,
              error: "clipboard_mismatch_after_write",
            };
          }
        }
        return {
          ok: true,
          attempted_payload_hash: attemptedPayloadHash,
          copied_payload_hash: attemptedPayloadHash,
          copied_text_length: json.length,
          method: "textarea_fallback",
          readback_match: "unavailable",
          fallback_presented: false,
        };
      }
    } catch (error) {
      return {
        ok: false,
        attempted_payload_hash: attemptedPayloadHash,
        copied_text_length: 0,
        method: "failed",
        readback_match: "unavailable",
        fallback_presented: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      document.body.removeChild(textarea);
    }
  }

  return {
    ok: false,
    attempted_payload_hash: attemptedPayloadHash,
    copied_text_length: 0,
    method: "failed",
    readback_match: "unavailable",
    fallback_presented: false,
    error: "clipboard_write_failed",
  };
}
