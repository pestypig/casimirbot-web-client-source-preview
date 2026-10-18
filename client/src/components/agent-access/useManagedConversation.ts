import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { LiveConnectionResult, LiveConnectionState, ManagedConversationView } from "@shared/desktop-live-connection";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { HELIX_LIVE_CONNECTION_CHANGED_EVENT } from "./LiveConnectionEvents";
import { HELIX_MANAGED_VOICE_REPLY_COMPLETED_EVENT,
  type HelixManagedVoiceReplyCompletedDetail } from "@/lib/helix/managed-voice-reply";

const errorText = (code: LiveConnectionResult["code"]) => code === "conversation_busy" ? "A turn is already running." :
  code === "missing_key" ? "Save your OpenAI key first." :
  code === "authentication_failed" ? "OpenAI rejected the current key. Replace it in Connections before trying again." :
  code === "rate_limited" ? "OpenAI is limiting requests; check project usage." :
  code === "conversation_permission_denied" ? "This key cannot use the Agents API. Check Agents API and Responses permissions in your OpenAI project." :
  code === "provider_error" ? "OpenAI could not complete this turn. Check the project's Agents API access and status before retrying." :
  code === "network_error" ? "The OpenAI response could not be confirmed. Check project activity before retrying; the next message starts a new conversation." :
  code === "request_rejected" ? "The harness rejected this request before starting a turn. Check the connection and try again." :
  code === "account_changed" || code === "sign_in_required" ? "The account changed. Reopen this panel." :
  code === "conversation_stopped" ? "The managed turn was stopped. Start a new conversation to continue." :
  code === "conversation_incomplete" ? "The reply was not verified. The next message starts a new conversation; earlier context will not carry over." :
  "The managed conversation could not continue. Start a new conversation before retrying.";

const diagnosticText = (diagnostic: LiveConnectionResult["diagnostic"]) =>
  diagnostic === "stream_ended" ? "The provider stream ended before the turn completed." :
  diagnostic === "stream_interrupted" ? "The provider stream was interrupted." :
  diagnostic === "provider_terminal_event" ? "The provider ended the turn without a verified answer." :
  diagnostic === "missing_session_id" ? "The provider did not return a usable conversation identity." :
  diagnostic === "missing_answer_text" ? "The provider completed the turn without answer text." : null;

/** One account-bound owner for a private, tool-free Agents API conversation. */
export function useManagedConversation({ configured, source, retainedDraft, onRetainedDraftChange }: {
  configured?: boolean;
  source?: LiveConnectionState["source"];
  retainedDraft?: string;
  onRetainedDraftChange?: (value: string) => void;
} = {}) {
  const bridge = typeof window !== "undefined" ? window.casimirDesktop?.liveConnection : undefined;
  const [localDraft, setLocalDraft] = useState("");
  const draft = retainedDraft ?? localDraft;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const setDraft = (value: string) => {
    if (onRetainedDraftChange) onRetainedDraftChange(value);
    else setLocalDraft(value);
  };
  const [view, setView] = useState<ManagedConversationView>({ active: false, messages: [] });
  const [message, setMessage] = useState("Loading private conversation…");
  const [busy, setBusy] = useState(false);
  const [accountCurrent, setAccountCurrent] = useState(true);
  const [standaloneConnection, setStandaloneConnection] = useState<LiveConnectionState | null>(null);
  const generation = useRef(0);
  const activeTurnId = useRef<string | null>(null);
  useEffect(() => {
    const epoch = ++generation.current;
    const reset = () => {
      ++generation.current;
      const turnId = activeTurnId.current;
      activeTurnId.current = null;
      // The account event can precede sign-out. Stop while the old session can still authorize it.
      if (turnId && bridge) void bridge({ action: "conversation_stop", turn_id: turnId }).catch(() => undefined);
      setDraft(""); setView({ active: false, messages: [] }); setStandaloneConnection(null);
      setAccountCurrent(false);
      setMessage("The account changed. Recheck this connection before sending."); setBusy(false);
    };
    const connectionChanged = () => {
      const nextEpoch = ++generation.current;
      const turnId = activeTurnId.current;
      activeTurnId.current = null;
      if (turnId && bridge) void bridge({ action: "conversation_stop", turn_id: turnId }).catch(() => undefined);
      setDraft(""); setView({ active: false, messages: [] }); setBusy(false);
      setStandaloneConnection(null); setAccountCurrent(false);
      setMessage("Checking the updated OpenAI connection…");
      if (bridge && configured === undefined) void bridge({ action: "inspect" }).then(result => {
        if (nextEpoch !== generation.current) return;
        setStandaloneConnection(result.ok ? result.state ?? null : null);
        setAccountCurrent(result.ok);
      }).catch(() => { if (nextEpoch === generation.current) setMessage("Could not inspect the updated connection."); });
      else if (configured !== undefined) setAccountCurrent(true);
      if (bridge) void bridge({ action: "conversation_inspect" }).then(result => {
        if (nextEpoch !== generation.current) return;
        if (result.ok && result.conversation) setView(result.conversation);
        setMessage(result.ok ? "Private conversation is ready." : errorText(result.code));
      }).catch(() => { if (nextEpoch === generation.current) setMessage("Could not inspect the updated conversation."); });
    };
    const accountPolicyChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ account_profile_changed?: boolean;
        account_profile_identity_known?: boolean;
        account_policy?: { account_type?: string } | null }>).detail;
      // First policy hydration identifies the already-open profile. Reinspect
      // the native owner automatically; a real profile transition stays fenced.
      if (detail?.account_profile_changed === false &&
          detail.account_profile_identity_known === true) connectionChanged();
      else reset();
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountPolicyChanged);
    window.addEventListener(HELIX_LIVE_CONNECTION_CHANGED_EVENT, connectionChanged);
    if (bridge && configured === undefined) void bridge({ action: "inspect" }).then(result => {
      if (epoch === generation.current) setStandaloneConnection(result.ok ? result.state ?? null : null);
    }).catch(() => { if (epoch === generation.current) setStandaloneConnection(null); });
    if (bridge) void bridge({ action: "conversation_inspect" }).then(result => {
      if (epoch !== generation.current) return;
      if (result.ok && result.conversation) setView(result.conversation);
      setMessage(result.ok ? "Private preview. Your OpenAI project pays for each turn." : errorText(result.code));
    }).catch(() => { if (epoch === generation.current) setMessage("Could not load the private conversation."); });
    return () => {
      ++generation.current;
      const turnId = activeTurnId.current;
      activeTurnId.current = null;
      if (turnId && bridge) void bridge({ action: "conversation_stop", turn_id: turnId }).catch(() => undefined);
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountPolicyChanged);
      window.removeEventListener(HELIX_LIVE_CONNECTION_CHANGED_EVENT, connectionChanged);
    };
  }, [bridge, configured]);
  const connectionReady = accountCurrent && (configured ?? standaloneConnection?.configured ?? false);
  const connectionSource = source ?? standaloneConnection?.source;
  const sourceLabel = !accountCurrent ? "Account changed; recheck connection" :
    connectionSource === "saved" ? "Saved key for this profile" :
    connectionSource === "launcher" ? "Key supplied by this launcher" : "No OpenAI key connected";
  const send = async (promptText = draft, voiceClientEventRef?: string) => {
    if (!bridge || busy || !connectionReady || !promptText.trim()) return;
    const epoch = generation.current;
    const prompt = promptText;
    const turnId = `managed-turn:${crypto.randomUUID()}`;
    activeTurnId.current = turnId;
    setBusy(true); setMessage("Waiting for the managed answer…");
    try {
      const result = await bridge({ action: "conversation_send", prompt, turn_id: turnId });
      if (epoch !== generation.current) return;
      if (result.ok && result.conversation) { setView(result.conversation);
        if (draftRef.current === prompt) setDraft("");
        setMessage("Completed private answer.");
        if (voiceClientEventRef) {
          const answer = [...result.conversation.messages].reverse().find(item =>
            item.role === "assistant" && item.turnId === turnId);
          if (answer?.text.trim()) {
            window.dispatchEvent(new CustomEvent<HelixManagedVoiceReplyCompletedDetail>(
              HELIX_MANAGED_VOICE_REPLY_COMPLETED_EVENT,
              { detail: { clientEventRef: voiceClientEventRef, turnId, text: answer.text } },
            ));
          }
        }
      }
      else {
        const detail = result.code === "conversation_incomplete" ? diagnosticText(result.diagnostic) : null;
        setMessage(detail ? `${errorText(result.code)} ${detail}` : errorText(result.code));
        const inspected = await bridge({ action: "conversation_inspect" }).catch(() => null);
        if (epoch === generation.current) setView(inspected?.ok && inspected.conversation
          ? inspected.conversation : { active: false, messages: [] });
      }
    } catch { if (epoch === generation.current) setMessage("The managed answer could not be verified."); }
    finally { if (epoch === generation.current) { activeTurnId.current = null; setBusy(false); } }
  };
  const sendVoiceTranscript = (transcript: string, clientEventRef?: string): boolean => {
    if (!bridge || !connectionReady) {
      setMessage("Voice reached Cloud Agent DM, but its OpenAI connection is unavailable. No other chat was used.");
      return false;
    }
    if (busy || activeTurnId.current) {
      setMessage("Voice reached Cloud Agent DM while another agent turn was running. This utterance was not sent.");
      return false;
    }
    if (!transcript.trim()) return false;
    void send(transcript, clientEventRef);
    return true;
  };
  const clear = async () => {
    if (!bridge || busy) return;
    const epoch = generation.current;
    setBusy(true);
    try {
      const result = await bridge({ action: "conversation_clear" });
      if (epoch !== generation.current) return;
      if (result.ok) { setView({ active: false, messages: [] }); setDraft("");
        setMessage(result.cleanupConfirmed === false
          ? "Local conversation cleared. OpenAI session deletion could not be confirmed; review your project's sessions."
          : "Conversation cleared. Your next message starts a new session."); }
      else setMessage(errorText(result.code));
    } catch { if (epoch === generation.current) setMessage("Could not clear the conversation."); }
    finally { if (epoch === generation.current) setBusy(false); }
  };
  const stop = async () => {
    const turnId = activeTurnId.current;
    if (!bridge || !busy || !turnId) return;
    const epoch = ++generation.current;
    setMessage("Stopping the managed turn…");
    try {
      const result = await bridge({ action: "conversation_stop", turn_id: turnId });
      if (epoch !== generation.current) return;
      if (result.ok) {
        setView({ active: false, messages: [] }); setDraft("");
        setMessage(result.cleanupConfirmed === false
          ? "Stopped locally. Provider cancellation or deletion could not be confirmed; review your project's sessions."
          : "Managed turn stopped. Start a new conversation to continue.");
      } else setMessage(errorText(result.code));
    } catch { if (epoch === generation.current) setMessage("Stop could not be confirmed. Check your OpenAI sessions."); }
    finally { if (epoch === generation.current) { activeTurnId.current = null; setBusy(false); } }
  };
  const recheck = () => window.dispatchEvent(new Event(HELIX_LIVE_CONNECTION_CHANGED_EVENT));
  return { available: Boolean(bridge), view, message, busy, draft, setDraft,
    connectionReady, sourceLabel, send, sendVoiceTranscript, clear, stop, recheck };
}

export type ManagedConversationController = ReturnType<typeof useManagedConversation>;
export const ManagedConversationControllerContext = createContext<ManagedConversationController | null>(null);
export const useSharedManagedConversation = () => useContext(ManagedConversationControllerContext);
