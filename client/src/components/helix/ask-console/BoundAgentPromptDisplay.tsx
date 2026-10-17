import React, { useEffect, useState } from "react";
import { helixReasoningSteeringEventProjectionSchema } from "@shared/helix-reasoning-task-binding";
import type { BrowserReasoningBinding } from "@/lib/agent-access/reasoningTaskBinding";
import { useBrowserReasoningBindingStore } from "@/lib/agent-access/reasoningTaskBinding";
import { useAgiChatStore } from "@/store/useAgiChatStore";

/** Shared default-renderer display; never falls back to another chat's binding. */
export function BoundAgentActiveChatPromptDisplay() {
  const chatId = useAgiChatStore(state => state.activeId);
  const binding = useBrowserReasoningBindingStore(state => state.current);
  if (!chatId || binding?.status !== "active" || binding.helix_conversation_id !== chatId) return null;
  return <BoundAgentPromptDisplay binding={binding} />;
}

/** Display only: never submits, acknowledges or interprets a prompt. */
export function BoundAgentPromptDisplay({ binding }: { binding: BrowserReasoningBinding }) {
  const contextKey = JSON.stringify([binding.reasoning_binding_id, binding.binding_epoch,
    binding.helix_conversation_id, binding.run_id ?? null, binding.service_instance_ref ?? null]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<{ id: string; text: string; state: string }>>([]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller = new AbortController();
      const currentController = controller;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const query = new URLSearchParams({ binding_epoch: String(binding.binding_epoch),
          helix_conversation_id: binding.helix_conversation_id });
        if (binding.run_id) query.set("run_id", binding.run_id);
        const body = await Promise.race([
          (async () => {
            const response = await fetch(`/api/account/session/agent-connections/reasoning-bindings/${encodeURIComponent(binding.reasoning_binding_id)}/chat-prompts?${query}`, {
              credentials: "include", signal: currentController.signal,
            });
            if (!response.ok) throw new Error("display unavailable");
            return response.json();
          })(),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(() => { reject(new Error("display timeout")); currentController.abort(); }, 5000);
          }),
        ]);
        if (body.display_only !== true || !Array.isArray(body.deliveries) || body.deliveries.length > 50) throw new Error("invalid display");
        const next = new Map<string, { id: string; text: string; state: string }>();
        for (const delivery of body.deliveries) {
          const event = helixReasoningSteeringEventProjectionSchema.parse(delivery.event);
          if (event.reasoning_binding_id !== binding.reasoning_binding_id || event.binding_epoch !== binding.binding_epoch) throw new Error("foreign event");
          if (typeof delivery.instruction_text !== "string" || delivery.instruction_text.length > 4000) throw new Error("invalid text");
          if (event.origin === "agent_submitted") next.set(event.steering_event_ref, {
            id: event.steering_event_ref, text: delivery.instruction_text, state: event.delivery_state });
        }
        if (!stopped) { setRows([...next.values()]); setUnavailable(false); setLoadedFor(contextKey); }
      } catch { if (!stopped) { setRows([]); setUnavailable(true); setLoadedFor(contextKey); } }
      finally { if (deadline !== undefined) clearTimeout(deadline); }
      if (!stopped) timer = setTimeout(refresh, 5000);
    };
    void refresh();
    return () => { stopped = true; controller?.abort(); clearTimeout(timer); };
  }, [contextKey]);
  if (loadedFor !== contextKey) return null;
  if (!rows.length) return unavailable ? <p role="status">Agent prompt display unavailable; no pickup is claimed.</p> : null;
  return <section aria-label="Agent-submitted prompts" className="mt-3 max-h-48 overflow-y-auto text-sm">
    <p>Recent agent-submitted prompts — transport status, not answers or task completion.</p>
    {rows.map(row => <article key={row.id} className="mt-2 border-l pl-2">
      <p className="whitespace-pre-wrap">{row.text}</p><small>Last checked: {row.state}</small>
    </article>)}
  </section>;
}
