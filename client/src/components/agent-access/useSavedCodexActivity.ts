import { useEffect, useMemo, useState } from "react";
import { HELIX_REASONING_BINDING_UPDATED_EVENT, inspectCurrentReasoningBinding,
  type BrowserReasoningBinding } from "@/lib/agent-access/reasoningTaskBinding";
import { helixCodexConsoleFrameSchema, type HelixCodexConsoleFrame } from
  "@shared/helix-codex-mirror-frame";

export type SavedCodexActivity = Readonly<{
  chatId: string;
  bindingId: string;
  frame: HelixCodexConsoleFrame;
  status: "live" | "reconnecting";
  verifiedAt: number;
}>;

type ReadResult = { status: "ready"; value: SavedCodexActivity } |
  { status: "retryable"; bindingId: string } | { status: "unavailable" };

/** The saved-chat list is a navigation hint, not authorization. Both the
 * current binding endpoint and the native exact-chat owner grant must pass. */
export async function readSavedCodexActivity(chatId: string): Promise<ReadResult> {
  if (!chatId || !window.casimirDesktop?.readCodexMirror) return { status: "unavailable" };
  try {
    const binding = await inspectCurrentReasoningBinding(chatId);
    if (binding.status !== "active" || binding.helix_conversation_id !== chatId ||
        !binding.reasoning_binding_id || binding.expires_at &&
        !(Date.parse(binding.expires_at) > Date.now())) return { status: "unavailable" };
    const result = await window.casimirDesktop.readCodexMirror({
      bindingId: binding.reasoning_binding_id, helixConversationId: chatId, visibleLimit: 3,
    }) as { status?: unknown; frame?: unknown };
    if (result?.status === "retryable") return { status: "retryable",
      bindingId: binding.reasoning_binding_id };
    const parsed = helixCodexConsoleFrameSchema.safeParse(result?.frame);
    if (result?.status !== "ready" || !parsed.success ||
        parsed.data.helixConversationId !== chatId) return { status: "unavailable" };
    return { status: "ready", value: { chatId, bindingId: binding.reasoning_binding_id,
      frame: parsed.data, status: "live", verifiedAt: Date.now() } };
  } catch { return { status: "unavailable" }; }
}

/** Poll only while the owner's activity cloud is open. Reads are sequential
 * so multiple saved tasks do not stampede the local Codex app-server. */
export function useSavedCodexActivity(chatIds: readonly string[], selectedChatId: string | null | undefined,
  enabled: boolean): Readonly<Record<string, SavedCodexActivity>> {
  const idsKey = JSON.stringify([...new Set(chatIds.filter(id => id && id !== selectedChatId))]);
  const otherIds = useMemo(() => JSON.parse(idsKey) as string[], [idsKey]);
  const [snapshot, setSnapshot] = useState<Record<string, SavedCodexActivity>>({});
  useEffect(() => {
    setSnapshot({});
    if (!enabled || !otherIds.length) return;
    let stopped = false;
    let reading = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const revisions = new Map(otherIds.map(id => [id, 0]));
    const verifiedBindings = new Map<string, string>();
    const read = async () => {
      if (reading || stopped) return;
      reading = true;
      for (const chatId of otherIds) {
        if (stopped) break;
        const revision = revisions.get(chatId);
        const result = await readSavedCodexActivity(chatId);
        if (stopped || revisions.get(chatId) !== revision) continue;
        setSnapshot(previous => {
          const next = { ...previous };
          if (result.status === "ready") {
            next[chatId] = result.value;
            verifiedBindings.set(chatId, result.value.bindingId);
          }
          else if (result.status === "retryable" && next[chatId]?.bindingId === result.bindingId &&
              Date.now() - next[chatId].verifiedAt <= 120_000)
            next[chatId] = { ...next[chatId], status: "reconnecting" };
          else { delete next[chatId]; verifiedBindings.delete(chatId); }
          return next;
        });
      }
      reading = false;
      if (!stopped) timer = setTimeout(() => void read(), 10_000);
    };
    const onBinding = (event: Event) => {
      const binding = (event as CustomEvent<BrowserReasoningBinding>).detail;
      if (!binding || !revisions.has(binding.helix_conversation_id)) return;
      const id = binding.helix_conversation_id;
      // inspectCurrentReasoningBinding publishes its first active read. That
      // is not a change and must not cancel the read that discovered it.
      if (binding.status === "active" && (!verifiedBindings.has(id) ||
          verifiedBindings.get(id) === binding.reasoning_binding_id)) return;
      revisions.set(id, (revisions.get(id) ?? 0) + 1);
      verifiedBindings.delete(id);
      setSnapshot(previous => {
        if (!previous[id]) return previous;
        const next = { ...previous }; delete next[id]; return next;
      });
      if (timer) { clearTimeout(timer); timer = setTimeout(() => void read(), 0); }
    };
    window.addEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, onBinding);
    void read();
    return () => { stopped = true; if (timer) clearTimeout(timer);
      window.removeEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, onBinding); };
  }, [enabled, otherIds]);
  return enabled ? snapshot : {};
}
