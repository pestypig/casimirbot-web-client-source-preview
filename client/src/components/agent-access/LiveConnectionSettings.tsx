import React, { useEffect, useId, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LiveConnectionModel, LiveConnectionResult, LiveConnectionState } from "@shared/desktop-live-connection";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { ManagedConversationPreview } from "./ManagedConversationPreview";
import { HELIX_LIVE_CONNECTION_CHANGED_EVENT } from "./LiveConnectionEvents";

const messages: Record<LiveConnectionResult["code"], string> = {
  saved: "Key saved securely. New GPT Live calls will use it; no app restart is needed.",
  disconnected: "GPT Live is disconnected for this profile. The launcher key will not be used as a fallback.",
  gemini_saved: "Gemini key saved for this profile.",
  gemini_disconnected: "Gemini key removed from this profile.",
  gemini_invalid_key_format: "Enter a valid Gemini API key from Google AI Studio.",
  gemini_test_confirmed: "Google accepted the saved Gemini key for a read-only models request.",
  gemini_missing_key: "Save a Gemini API key before testing it.",
  gemini_authentication_failed: "Google rejected the saved Gemini key.",
  gemini_permission_denied: "Google denied access to the Gemini API.",
  gemini_rate_limited: "Google rate limited the Gemini key.",
  gemini_provider_error: "Google could not complete the Gemini key check.",
  gemini_network_error: "Could not reach the Gemini API.",
  model_access_confirmed: "OpenAI accepted the key and confirmed access to this model. Start GPT Live to verify the microphone and voice connection.",
  missing_key: "Add an OpenAI API key to connect GPT Live.",
  invalid_key_format: "Enter an OpenAI API key beginning with sk-. Paste it here, not in chat.",
  authentication_failed: "OpenAI rejected this key. Replace it with an active key from your OpenAI project.",
  model_access_denied: "This key cannot access the selected model. Check the OpenAI project's model access and key permissions.",
  rate_limited: "OpenAI is limiting requests. Check your project's usage and try again later.",
  network_error: "Could not reach OpenAI. Check your connection and try again.",
  provider_error: "OpenAI could not complete this check. Try again later.",
  storage_unavailable: "Secure storage is unavailable. Your key has not been shown or stored as plain text.",
  account_changed: "The account or connection changed. Reopen settings and try again.",
  sign_in_required: "Sign in to the desktop harness to configure your own connection.",
  request_rejected: "Connection setup is unavailable in this window. Use the main desktop workspace.",
  agent_chat_confirmed: "The managed agent completed a chat test with this key. Helix Ask chat routing and tools still require separate integration checks.",
  agents_permission_denied: "This key needs Agents API read/write and Responses write permissions in your OpenAI project.",
  agent_incomplete: "The managed chat test did not complete. No successful chat connection has been confirmed.",
  conversation_ready: "Private managed conversation is ready.",
  conversation_cleared: "Private managed conversation cleared.",
  conversation_busy: "A private managed turn is already running.",
  conversation_incomplete: "The managed turn did not complete. Start a new conversation before retrying.",
  conversation_permission_denied: "This key cannot use the Agents API.",
  conversation_stopped: "Managed turn stopped. Start a new conversation to continue.",
};

export function LiveConnectionSettings({ model = "gpt-realtime-2.1", showManagedConversation = true }: { model?: LiveConnectionModel; showManagedConversation?: boolean }) {
  const id = useId();
  const bridge = typeof window !== "undefined" ? window.casimirDesktop?.liveConnection : undefined;
  const [key, setKey] = useState("");
  const [state, setState] = useState<LiveConnectionState | null>(null);
  const [message, setMessage] = useState("Checking connection…");
  const [busy, setBusy] = useState(false);
  const [testModel, setTestModel] = useState<LiveConnectionModel>(model);
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const epoch = ++generation.current;
    const clear = () => { ++generation.current; setKey(""); setState(null); setBusy(false); setMessage(messages.account_changed); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    if (bridge) void bridge({ action: "inspect" }).then(result => {
      if (epoch !== generation.current) return;
      setState(result.state ?? null);
      setMessage(result.ok ? "Save your key, then test model access before starting a call." : messages[result.code]);
    }).catch(() => { if (epoch === generation.current) setMessage(messages.request_rejected); });
    return () => { ++generation.current; window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear); };
  }, [bridge]);
  const run = async (action: "save" | "test" | "test_chat" | "disconnect") => {
    if (!bridge || pending.current) return;
    const epoch = generation.current;
    pending.current = true; setBusy(true); setMessage(action === "test_chat" ? "Testing a managed chat turn with OpenAI…" : action === "test" ? "Checking access with OpenAI…" : "Updating connection…");
    const request = action === "save" ? { action, key } as const : action === "test" ? { action, model: testModel } as const : { action } as const;
    setKey("");
    try {
      const result = await bridge(request);
      if (epoch !== generation.current) return;
      if (result.state) setState(result.state);
      if (result.ok && (action === "save" || action === "disconnect")) {
        setConnectionEpoch(value => value + 1);
        window.dispatchEvent(new Event(HELIX_LIVE_CONNECTION_CHANGED_EVENT));
      }
      setMessage((messages[result.code] ?? messages.request_rejected) + (result.cleanupConfirmed === false
        ? action === "save" || action === "disconnect"
          ? " An earlier room interpreter session or active turn could not be confirmed closed; check your OpenAI project's sessions."
          : " The temporary OpenAI test session could not be removed; check your project's sessions."
        : ""));
    } catch { if (epoch === generation.current) setMessage(messages.request_rejected); }
    finally { pending.current = false; if (epoch === generation.current) setBusy(false); }
  };
  if (!bridge) return <section aria-label="GPT Live connection" className="space-y-2 rounded-xl border border-white/15 p-4">
    <h3 className="font-semibold">GPT Live · OpenAI</h3>
    <p>Open the updated desktop harness to save a personal voice API key. This browser uses its server's connection.</p>
  </section>;
  return <section aria-label="GPT Live connection" className="space-y-4 rounded-xl border border-cyan-300/25 bg-cyan-950/15 p-4 text-sm">
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-cyan-100">Helix Ask · OpenAI</h3>
      <span className="rounded-full border border-white/20 px-2 py-1 text-xs">{!state ? "Checking" : state.source === "saved" ? "Personal key saved" : state.source === "launcher" ? "Launcher connection" : "Not connected"}</span></div>
    <p className="text-slate-300">One personal connection for OpenAI services. {state?.source === "saved" ? "Your saved key is encrypted on this computer for your signed-in profile." : state?.source === "launcher" ? "The current key was supplied by this launcher and is not saved under your signed-in profile." : "Save your own key for this signed-in profile."} The OpenAI project owning the configured key is expected to be billed for API use. GPT Live voice uses this connection now; managed chat is being qualified separately.</p>
    <div className="space-y-2"><label htmlFor={`${id}-key`} className="block font-medium">{state?.configured ? "Replace OpenAI API key" : "OpenAI API key"}</label>
      <input id={`${id}-key`} type="password" autoComplete="off" spellCheck={false} maxLength={1024} value={key}
        disabled={busy} onChange={event => setKey(event.target.value)} placeholder="Paste your key here"
        className="w-full rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-slate-100 focus:ring-2 focus:ring-cyan-300" />
      <p className="text-xs text-slate-400">Saved keys are never displayed. They are not included in chat, room invitations, or profile exports.</p></div>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || !key.trim()} onClick={() => void run("save")} className="rounded-lg bg-cyan-300 px-3 py-2 font-semibold text-slate-950 disabled:opacity-40">Save key</button>
      <button type="button" disabled={busy || !state?.configured} onClick={() => void run("disconnect")} className="rounded-lg border border-white/20 px-3 py-2 disabled:opacity-40">Remove key & disconnect</button>
    </div>
    <div className="space-y-2 border-t border-white/10 pt-3"><label htmlFor={`${id}-model`} className="block font-medium">Model access check</label>
      <div className="flex flex-wrap gap-2"><select id={`${id}-model`} value={testModel} disabled={busy} onChange={event => { setTestModel(event.target.value as LiveConnectionModel); setMessage("Test the selected model's access."); }} className="min-w-0 flex-1 rounded-lg border border-white/20 bg-slate-950 px-3 py-2">
        <option value="gpt-realtime-2.1">Live Voice · gpt-realtime-2.1</option><option value="gpt-realtime-2.1-mini">Live Voice Mini · gpt-realtime-2.1-mini</option>
      </select><button type="button" disabled={busy || !state?.configured || Boolean(key.trim())} onClick={() => void run("test")} className="rounded-lg border border-cyan-300/40 px-3 py-2 text-cyan-100 disabled:opacity-40">{busy ? "Working…" : "Test connection"}</button></div>
      <p className="text-xs text-slate-400">Checks model access without starting a voice call. Choose your call's model with the Live Voice control beside Start.</p></div>
    <div className="space-y-2 border-t border-white/10 pt-3">
      <h4 className="font-medium">Chat · OpenAI Agents API</h4>
      <p className="text-xs text-slate-400">Test one short reply using GPT-6 Astra at low reasoning. This uses your API billing, without a sandbox, local files, room content, or program tools. It does not switch your chat runtime.</p>
      <button type="button" disabled={busy || !state?.configured || Boolean(key.trim())} onClick={() => void run("test_chat")} className="rounded-lg border border-cyan-300/40 px-3 py-2 text-cyan-100 disabled:opacity-40">Test managed chat</button>
    </div>
    {showManagedConversation ? <ManagedConversationPreview key={connectionEpoch} configured={Boolean(state?.configured && !key.trim())} source={state?.source}/> : null}
    <p role="status" aria-live="polite" className="rounded-lg bg-slate-900 p-3 text-slate-200">{message}</p>
    <p className="text-xs text-slate-400">Changes apply to new calls. Stop any current call before testing a replacement. Codex and external MCP connections keep their own settings.</p>
  </section>;
}

export function LiveConnectionSettingsButton({ model, repair = false, showManagedConversation = true }: { model?: LiveConnectionModel; repair?: boolean; showManagedConversation?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, close);
    return () => window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, close);
  }, []);
  if (typeof window === "undefined" || !window.casimirDesktop?.liveConnection) return null;
  return <><button type="button" aria-label="Configure OpenAI connection" title="Set up your OpenAI connection"
    aria-haspopup="dialog" aria-expanded={open} data-helix-ask-action-item="true" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
    onClick={() => setOpen(true)} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-cyan-300/35 px-3 text-sm text-cyan-100">
    <KeyRound className="h-4 w-4"/><span>{repair ? "Fix OpenAI connection" : "OpenAI connection"}</span></button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-y-auto bg-slate-950 text-slate-100">
      <DialogHeader><DialogTitle>Helix Ask connection</DialogTitle><DialogDescription>Your OpenAI key, with separate checks for voice and managed chat.</DialogDescription></DialogHeader>
      {open && <LiveConnectionSettings model={model} showManagedConversation={showManagedConversation}/>}
    </DialogContent></Dialog></>;
}
