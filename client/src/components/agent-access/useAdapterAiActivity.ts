import { useEffect, useMemo, useRef, useState } from "react";
import type { HelixAdapterAiActivityPage } from
  "@shared/helix-environment-action-activity";
import { HELIX_REASONING_BINDING_UPDATED_EVENT,
  type BrowserReasoningBinding } from "@/lib/agent-access/reasoningTaskBinding";
import { fetchAdapterAiActivityPage,
  HelixOperatorActivityHttpError,
  shouldRetainResponsesActivityAfterReadFailure } from
  "@/components/helix/ask-console/HelixOperatorActivityApi";

export type AdapterAiActivityReadFailure = "sign_in_required" |
  "binding_unavailable" | "activity_unavailable" | "invalid_activity_response";

const readFailure = (error: unknown): AdapterAiActivityReadFailure => {
  if (error instanceof HelixOperatorActivityHttpError) {
    if (error.status === 401) return "sign_in_required";
    if (error.status === 409) return "binding_unavailable";
    return "activity_unavailable";
  }
  return error instanceof TypeError ? "activity_unavailable" : "invalid_activity_response";
};

/** The saved-chat list is only a discovery hint. Each page is independently
 * authorized for the signed-in owner and current exact chat/binding/run by the
 * server; a failed or changed binding removes its page from the view. */
export function useAdapterAiActivity(chatIds: readonly string[], enabled: boolean):
  Readonly<{ pages: Record<string, HelixAdapterAiActivityPage>;
    failures: Record<string, AdapterAiActivityReadFailure> }> {
  const idsKey = JSON.stringify([...new Set(chatIds.filter(Boolean))]);
  const ids = useMemo(() => JSON.parse(idsKey) as string[], [idsKey]);
  const [pages, setPages] = useState<Record<string, HelixAdapterAiActivityPage>>({});
  const [failures, setFailures] = useState<Record<string, AdapterAiActivityReadFailure>>({});
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  useEffect(() => {
    setPages({});
    setFailures({});
    if (!enabled || !ids.length) return;
    let stopped = false;
    let reading = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controllers = new Map<string, AbortController>();
    const revisions = new Map(ids.map(id => [id, 0]));
    const lastRead = new Map<string, number>();
    const read = async () => {
      if (reading || stopped) return;
      reading = true;
      // A stale saved chat must not hold the active run's activity hostage.
      // Read each owner-verified chat independently and bound a stalled fetch.
      await Promise.all(ids.map(async chatId => {
        if (stopped) return;
        const revision = revisions.get(chatId);
        const controller = new AbortController();
        controllers.set(chatId, controller);
        let deadline: ReturnType<typeof setTimeout> | null = null;
        try {
          const page = await Promise.race([
            fetchAdapterAiActivityPage({ helixConversationId: chatId,
              signal: controller.signal }),
            new Promise<never>((_, reject) => {
              deadline = setTimeout(() => {
                controller.abort();
                reject(new TypeError("adapter_activity_timeout"));
              }, 10_000);
            }),
          ]);
          if (stopped || revisions.get(chatId) !== revision) return;
          if (page.helix_conversation_id !== chatId) throw new Error("adapter_activity_chat_mismatch");
          lastRead.set(chatId, Date.now());
          setPages(previous => ({ ...previous, [chatId]: page }));
          setFailures(previous => {
            if (!previous[chatId]) return previous;
            const next = { ...previous }; delete next[chatId]; return next;
          });
        } catch (error) {
          if (stopped || revisions.get(chatId) !== revision) return;
          setFailures(previous => ({ ...previous, [chatId]: readFailure(error) }));
          if (shouldRetainResponsesActivityAfterReadFailure(error,
                lastRead.get(chatId) ?? 0, Date.now())) return;
          lastRead.delete(chatId);
          setPages(previous => {
            if (!previous[chatId]) return previous;
            const next = { ...previous }; delete next[chatId]; return next;
          });
        } finally {
          if (deadline) clearTimeout(deadline);
          controllers.delete(chatId);
        }
      }));
      reading = false;
      if (!stopped) timer = setTimeout(() => void read(), 7_000);
    };
    const onBinding = (event: Event) => {
      const binding = (event as CustomEvent<BrowserReasoningBinding>).detail;
      if (!binding || !revisions.has(binding.helix_conversation_id)) return;
      const id = binding.helix_conversation_id;
      const page = pagesRef.current[id];
      // A first active read is not a revocation. A changed epoch or run is.
      if (binding.status === "active" && (!page ||
          binding.reasoning_binding_id === page.reasoning_binding_id &&
          binding.binding_epoch === page.binding_epoch && binding.run_id === page.run_id)) return;
      revisions.set(id, (revisions.get(id) ?? 0) + 1);
      lastRead.delete(id);
      controllers.get(id)?.abort();
      setFailures(previous => {
        const next = { ...previous };
        if (binding.status === "active") delete next[id];
        else next[id] = "binding_unavailable";
        return next;
      });
      setPages(previous => {
        if (!previous[id]) return previous;
        const next = { ...previous }; delete next[id]; return next;
      });
      if (timer) { clearTimeout(timer); timer = setTimeout(() => void read(), 0); }
    };
    window.addEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, onBinding);
    void read();
    return () => { stopped = true; for (const controller of controllers.values()) controller.abort();
      if (timer) clearTimeout(timer);
      window.removeEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, onBinding); };
  }, [enabled, ids]);
  return enabled ? { pages, failures } : { pages: {}, failures: {} };
}
