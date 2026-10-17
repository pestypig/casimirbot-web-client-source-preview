import { useEffect, useState } from "react";
import { inspectCurrentReasoningBinding, readReasoningBinding,
  HELIX_REASONING_BINDING_UPDATED_EVENT } from "@/lib/agent-access/reasoningTaskBinding";
import { inspectPairing, listPairingDestinations } from "@/lib/agent-access/durablePairing";
import type { HelixMessageCloudFrame } from "@shared/helix-message-cloud";

export type ConversationPairing = NonNullable<HelixMessageCloudFrame["pairing"]>;

/** Owner-scoped display only. Never infer a task from the most recent registration. */
export function useConversationPairing(chatId?: string | null): ConversationPairing {
  const [snapshot, setSnapshot] = useState<{ chatId?: string | null; value: ConversationPairing }>({
    value: { status: "unavailable", taskId: null },
  });
  useEffect(() => {
    const setValue = (value: ConversationPairing) => setSnapshot({ chatId, value });
    let stopped = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setValue({ status: "unavailable", taskId: null });
    if (!chatId) return;
    const read = async () => {
      const revision = ++generation;
      try {
        const binding = await inspectCurrentReasoningBinding(chatId);
        if (stopped || revision !== generation) return;
        if (binding.helix_conversation_id !== chatId) throw new Error("chat_mismatch");
        let taskId: string | null = null;
        let status: ConversationPairing["status"] = binding.status;
        if (binding.pairing_id) {
          const { pairing } = await inspectPairing(binding.pairing_id);
          if (pairing.id !== binding.pairing_id || pairing.chatId !== chatId) throw new Error("pairing_mismatch");
          // Expiry and revocation are display facts, not generic connection
          // failures. Never resolve a destination or expose its task after the
          // exact owner's grant has ended, even if a binding read is stale.
          if (pairing.state === "expired" || Date.parse(pairing.pairingExpiresAt) <= Date.now() ||
              binding.expires_at && Date.parse(binding.expires_at) <= Date.now()) status = "expired";
          else if (pairing.state === "revoked" || pairing.state === "superseded") status = pairing.state;
          else if (binding.status === "active" && pairing.state !== "accepted") status = "unavailable";
          if (status === "active") {
            // A finite registration is only a display-label lookup. It can
            // expire or fail independently of the already verified pairing
            // and binding; never downgrade that connection to unavailable.
            try {
              const { destinations } = await listPairingDestinations();
              const matches = destinations.filter(item => item.destinationDigest === pairing.destinationDigest);
              if (matches.length === 1) taskId = matches[0].destination.taskId;
            } catch { /* Keep the verified connection; omit its optional label. */ }
          }
        }
        if (!stopped && revision === generation) setValue({ status, taskId,
          bindingId: binding.reasoning_binding_id, pairingId: binding.pairing_id });
      } catch {
        // A restarted service may no longer have a current runtime binding.
        // An exact-chat saved binding can identify the old pairing, but it
        // must never be used as active authority or to reveal its task. Only
        // the authenticated pairing read may classify a terminal state.
        let terminal: "expired" | "revoked" | "superseded" | null = null;
        let saved: ReturnType<typeof readReasoningBinding> = null;
        try { saved = readReasoningBinding(chatId); } catch { /* No trusted local hint. */ }
        if (saved?.helix_conversation_id === chatId && saved.pairing_id) {
          try {
            const { pairing } = await inspectPairing(saved.pairing_id);
            if (pairing.id === saved.pairing_id && pairing.chatId === chatId) {
              if (pairing.state === "expired" || Date.parse(pairing.pairingExpiresAt) <= Date.now())
                terminal = "expired";
              else if (pairing.state === "revoked" || pairing.state === "superseded")
                terminal = pairing.state;
            }
          } catch { /* A failed authenticated read is unknown, not an expired grant. */ }
        }
        if (!stopped && revision === generation) setValue({ status: terminal ?? "unavailable", taskId: null });
      } finally {
        if (!stopped && revision === generation) timer = setTimeout(() => void read(), 15_000);
      }
    };
    const changed = (event: Event) => {
      const binding = (event as CustomEvent).detail;
      if (binding?.helix_conversation_id !== chatId) return;
      // Clear the old identity immediately, even while a status read is pending.
      ++generation;
      if (timer) clearTimeout(timer);
      setValue({ status: binding.status, taskId: null });
      void read();
    };
    window.addEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, changed);
    void read();
    return () => { stopped = true; ++generation; if (timer) clearTimeout(timer);
      window.removeEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, changed); };
  }, [chatId]);
  return snapshot.chatId === chatId ? snapshot.value : { status: "unavailable", taskId: null };
}
