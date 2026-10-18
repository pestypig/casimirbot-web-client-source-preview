import React, { useEffect, useState } from "react";
import { useSharedManagedConversation } from "@/components/agent-access/useManagedConversation";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { HELIX_REASONING_BINDING_UPDATED_EVENT, readLatestReasoningBinding } from
  "@/lib/agent-access/reasoningTaskBinding";
import { EXPERIMENTAL_ASK_HELIX_CHANGED, readExperimentalAskHelix } from
  "@/lib/workstation/experimentalAskHelix";
import { PERSONAL_VOICE_ROUTE_CHANGED_EVENT, personalVoiceBlockReason,
  readPersonalVoiceDestination } from "@/lib/helix/personal-voice-route";

/** Voice repair state belongs with the other composer warnings above the controls. */
export function HelixAskPersonalVoiceStatus() {
  const managedConversation = useSharedManagedConversation();
  const [, refresh] = useState(0);
  useEffect(() => {
    const onChange = () => refresh(value => value + 1);
    const events = [PERSONAL_VOICE_ROUTE_CHANGED_EVENT,
      HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, HELIX_REASONING_BINDING_UPDATED_EVENT,
      EXPERIMENTAL_ASK_HELIX_CHANGED];
    for (const event of events) window.addEventListener(event, onChange);
    return () => { for (const event of events) window.removeEventListener(event, onChange); };
  }, []);
  const destination = readPersonalVoiceDestination();
  const reason = personalVoiceBlockReason({
    destination,
    managedConnectionReady: managedConversation?.connectionReady === true,
    exactTaskReady: readLatestReasoningBinding()?.status === "active",
    experimentalAskEnabled: readExperimentalAskHelix(),
  });
  const shortLabel = destination === "cloud_agent_dm" ? "Voice: connect Cloud DM"
    : destination === "message_codex" ? "Voice: pair Codex"
      : "Voice: enable Ask Helix";
  return reason ? <span role="status" aria-live="polite" aria-label={reason}
    title={reason} data-personal-voice-warning="true"
    className="min-w-0 flex-1 truncate whitespace-nowrap text-right text-amber-200"
  >{shortLabel}</span> : null;
}
