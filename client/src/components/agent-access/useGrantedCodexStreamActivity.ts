import { useEffect, useMemo, useState } from "react";
import { helixCodexConsoleFrameSchema } from "@shared/helix-codex-mirror-frame";
import type { SavedCodexActivity } from "./useSavedCodexActivity";

export type LocalCodexStreamGrant = Readonly<{ sourceRef: string; threadId: string;
  title: string; helixConversationId: string | null; grantedAt: string }>;

/** Read only the exact owner-granted local Codex chats while the Float is open
 * or an approved stream needs activity after the Float is hidden.
 * The native host rechecks account, device and grant on both sides of each read. */
export function useGrantedCodexStreamActivity(grants: readonly LocalCodexStreamGrant[], enabled: boolean) {
  const key = JSON.stringify(grants.map(grant => ({ sourceRef: grant.sourceRef,
    threadId: grant.threadId, title: grant.title,
    helixConversationId: grant.helixConversationId, grantedAt: grant.grantedAt })));
  const sources = useMemo(() => JSON.parse(key) as LocalCodexStreamGrant[], [key]);
  const [snapshot, setSnapshot] = useState<{ key: string;
    pages: Record<string, SavedCodexActivity> }>({ key, pages: {} });
  useEffect(() => {
    setSnapshot({ key, pages: {} });
    if (!enabled || !window.casimirDesktop?.codexStreamGrants || !sources.length) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const next: Record<string, SavedCodexActivity> = {};
      for (const source of sources) {
        if (stopped) break;
        try {
          const result = await window.casimirDesktop?.codexStreamGrants?.({ operation: "read",
            sourceRef: source.sourceRef }) as { status?: unknown; frame?: unknown } | undefined;
          const frame = helixCodexConsoleFrameSchema.safeParse(result?.frame);
          if (result?.status === "ready" && frame.success &&
              source.sourceRef === `codex-thread:${source.threadId}` &&
              frame.data.taskId === source.threadId &&
              frame.data.helixConversationId === source.sourceRef)
            next[source.sourceRef] = { chatId: source.sourceRef,
              bindingId: `stream-grant:${source.sourceRef}`, frame: frame.data,
              status: "live", verifiedAt: Date.now() };
        } catch { /* Unavailable sources are omitted, never replayed from cache. */ }
      }
      if (!stopped) { setSnapshot({ key, pages: next }); timer = setTimeout(() => void poll(), 10_000); }
    };
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [enabled, key, sources]);
  // Do not expose the retired grant's page during the render before effect cleanup.
  return enabled && snapshot.key === key ? snapshot.pages : {};
}
