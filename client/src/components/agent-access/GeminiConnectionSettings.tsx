import React, { useEffect, useId, useRef, useState } from "react";
import type { GeminiPublicContextComparison, LiveConnectionState } from "@shared/desktop-live-connection";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

/** Profile credential setup only. No renderer path can read back the secret. */
export function GeminiConnectionSettings() {
  const id = useId();
  const bridge = typeof window !== "undefined" ? window.casimirDesktop?.liveConnection : undefined;
  const [key, setKey] = useState("");
  const [state, setState] = useState<LiveConnectionState | null>(null);
  const [message, setMessage] = useState("");
  const [comparison, setComparison] = useState<GeminiPublicContextComparison | null>(null);
  const [reflectionProbeEnabled, setReflectionProbeEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const epoch = ++generation.current;
    const clear = () => { ++generation.current; setKey(""); setState(null); setComparison(null);
      setReflectionProbeEnabled(false);
      setMessage("Account changed. Reopen connections."); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    if (bridge) void bridge({ action: "gemini_inspect" }).then(result => {
      if (generation.current !== epoch) return;
      setState(result.ok ? result.state ?? null : null);
      setReflectionProbeEnabled(result.ok && result.geminiReflectionProbeEnabled === true);
      if (!result.ok) setMessage("Could not inspect the Gemini connection.");
    }).catch(() => { if (generation.current === epoch) setMessage("Could not inspect the Gemini connection."); });
    return () => { ++generation.current; window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear); };
  }, [bridge]);
  const run = async (action: "gemini_save" | "gemini_disconnect" | "gemini_test" | "gemini_reflection_probe") => {
    if (!bridge || pending.current) return;
    const epoch = generation.current;
    pending.current = true; setBusy(true);
    setComparison(null);
    setMessage(action === "gemini_reflection_probe" ? "Comparing two bounded Gemini answers…" :
      action === "gemini_test" ? "Checking saved Gemini key with Google…" : "Updating Gemini connection…");
    const request = action === "gemini_save" ? { action, key } as const : { action } as const;
    setKey("");
    try {
      const result = await bridge(request);
      if (generation.current !== epoch) return;
      if (result.state) setState(result.state);
      if (result.geminiComparison) setComparison(result.geminiComparison);
      setMessage(result.ok
        ? action === "gemini_save" ? "Gemini key saved for this profile."
          : action === "gemini_disconnect" ? "Gemini key removed from this profile."
            : action === "gemini_reflection_probe" ? "Both Gemini answers returned. Check the recorded MCP call below before judging improvement."
            : "Google accepted the saved Gemini key for a read-only models request. Reasoning and MCP access remain separate checks."
        : result.code === "gemini_invalid_key_format" ? "Enter a valid Gemini API key from Google AI Studio."
          : result.code === "gemini_authentication_failed" ? "Google rejected the saved Gemini key. Replace it with an active key."
            : result.code === "gemini_permission_denied" ? "Google denied access. Check this key's Gemini API permissions."
              : result.code === "gemini_rate_limited" ? "Google rate limited this key. Try again later."
                : result.code === "gemini_network_error" ? "Could not reach the Gemini API. Check your connection and retry."
                : result.code === "gemini_reflection_invalid_response" ? "Gemini did not return two complete answers. The reflection comparison is unconfirmed."
                  : result.code === "gemini_reflection_interrupted" ? "The Gemini comparison was interrupted."
                    : result.code === "gemini_reflection_busy" ? "A Gemini comparison is already running."
          : result.code === "storage_unavailable" ? "Protected profile storage is unavailable. The key was not saved."
            : result.code === "gemini_provider_error" ?
              `Google rejected the comparison request${result.geminiProviderHttpStatus ? ` (HTTP ${result.geminiProviderHttpStatus})` : ""}. Provider compatibility is unconfirmed.`
            : "Gemini connection could not be updated. Try again after checking this profile.");
    } catch { if (generation.current === epoch) setMessage("Gemini connection could not be updated."); }
    finally { pending.current = false; if (generation.current === epoch) setBusy(false); }
  };
  if (!bridge) return null;
  return <section aria-label="Gemini connection" className="space-y-3 rounded-xl border border-white/15 p-4 text-sm">
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Gemini · Google AI Studio</h3>
      <span className="rounded-full border border-white/20 px-2 py-1 text-xs">{!state ? "Checking" : state.configured ? "Personal key saved" : "Not connected"}</span></div>
    <p className="text-slate-300">Save a separate Gemini API key under this signed-in profile. It stays in protected storage on this computer and is never shown after saving. Saving it does not enable Gemini reasoning or authorize an MCP call by itself.</p>
    <label htmlFor={`${id}-key`} className="block font-medium">{state?.configured ? "Replace Gemini API key" : "Gemini API key"}</label>
    <input id={`${id}-key`} type="password" autoComplete="off" spellCheck={false} maxLength={1024}
      value={key} disabled={busy} onChange={event => setKey(event.target.value)} placeholder="Paste your Gemini key here"
      className="w-full rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-slate-100 focus:ring-2 focus:ring-cyan-300" />
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || !key.trim()} onClick={() => void run("gemini_save")}
        className="rounded-lg bg-cyan-300 px-3 py-2 font-semibold text-slate-950 disabled:opacity-40">Save Gemini key</button>
      <button type="button" disabled={busy || !state?.configured} onClick={() => void run("gemini_disconnect")}
        className="rounded-lg border border-white/20 px-3 py-2 disabled:opacity-40">Remove Gemini key</button>
    </div>
    <div className="space-y-2 border-t border-white/10 pt-3">
      <button type="button" disabled={busy || !state?.configured || Boolean(key.trim())} onClick={() => void run("gemini_test")}
        className="rounded-lg border border-cyan-300/40 px-3 py-2 text-cyan-100 disabled:opacity-40">Test Gemini connection</button>
      <p className="text-xs text-slate-400">Checks the saved key with Google's read-only models endpoint. It does not send chat, use MCP, or start a billed model inference.</p>
      {reflectionProbeEnabled && <button type="button" disabled={busy || !state?.configured || Boolean(key.trim())}
        onClick={() => void run("gemini_reflection_probe")}
        className="rounded-lg border border-cyan-300/40 px-3 py-2 text-cyan-100 disabled:opacity-40">Compare Pauli answers with public Theory MCP</button>}
      {reflectionProbeEnabled && <p className="text-xs text-slate-400">Developer diagnostic: two Gemini model calls using your saved key, one without tools and one allowed to call only the public Theory reflection. This may consume Gemini API quota.</p>}
    </div>
    {comparison && <div className="space-y-2 rounded-lg border border-white/20 p-3" aria-label="Gemini reflection comparison">
      <p className="font-medium">{comparison.model}: {comparison.question}</p>
      <div><strong>Without MCP</strong><p className="whitespace-pre-wrap">{comparison.baseline.answer}</p></div>
      <div><strong>With public Theory MCP</strong><p className="whitespace-pre-wrap">{comparison.withContext.answer}</p></div>
      <p className="text-xs">Theory tool call: {comparison.withContext.toolCalls.length ? "observed" : "not observed"}; result: {comparison.withContext.toolResults.length ? "observed" : "not observed"}. An answer alone does not prove the tool was used.</p>
    </div>}
    {message && <p role="status" aria-live="polite" className="rounded-lg bg-slate-900 p-3">{message}</p>}
  </section>;
}
