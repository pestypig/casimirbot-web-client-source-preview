import React, { useEffect, useRef, type ReactNode } from "react";
import { ManagedConversationControllerContext, useManagedConversation } from "./useManagedConversation";
import { HELIX_VOICE_STEERING_FINALIZED_EVENT,
  type HelixVoiceSteeringFinalizedDetail } from "@/lib/helix/voice-steering-finalized";

/** One managed-chat owner for the Console's pill, history and connection view. */
export function ManagedConversationOwnerBoundary({ children }: { children: ReactNode }) {
  const controller = useManagedConversation();
  const voiceRefs = useRef(new Set<string>());
  useEffect(() => {
    const onVoice = (event: Event) => {
      if (event.defaultPrevented) return;
      const voice = event as CustomEvent<HelixVoiceSteeringFinalizedDetail>;
      if (voice.detail?.destination !== "cloud_agent_dm") return;
      const ref = voice.detail.clientEventRef;
      if (!ref) return;
      if (voiceRefs.current.has(ref)) {
        event.preventDefault();
        return;
      }
      if (!controller.sendVoiceTranscript(voice.detail.transcript, ref)) return;
      event.preventDefault();
      voiceRefs.current.add(ref);
      if (voiceRefs.current.size > 256) voiceRefs.current.delete(voiceRefs.current.values().next().value!);
    };
    window.addEventListener(HELIX_VOICE_STEERING_FINALIZED_EVENT, onVoice);
    return () => window.removeEventListener(HELIX_VOICE_STEERING_FINALIZED_EVENT, onVoice);
  }, [controller.sendVoiceTranscript]);
  return <ManagedConversationControllerContext.Provider value={controller}>
    {children}
  </ManagedConversationControllerContext.Provider>;
}
