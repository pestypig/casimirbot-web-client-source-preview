import { useEffect, useMemo, useState } from "react";
import { helixCodexConsoleFrameSchema } from "@shared/helix-codex-mirror-frame";
import type { SavedCodexActivity } from "./useSavedCodexActivity";

export type LocalCodexStreamGrant = Readonly<{ sourceRef: string; threadId: string;
  title: string; helixConversationId: string | null; grantedAt: string }>;

/** Read only the exact owner-granted local Codex chats while the Float is open.
 * The native host rechecks account, device and grant on both sides of each read. */
export function useGrantedCodexStreamActivity(grants: readonly LocalCodexStreamGrant[], enabled: boolean) {
  const key = JSON.stringify(grants.map(grant => ({ sourceRef: grant.sourceRef,
    title: grant.title })));
  const sources = useMemo(() => JSON.parse(key) as Array<Pick<LocalCodexStreamGrant,
    "sourceRef" | "title">>, [key]);
  const [pages, setPages] = useState<Record<string, SavedCodexActivity>>({});
  useEffect(() => {
    setPages({});
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
              frame.data.helixConversationId === source.sourceRef)
            next[source.sourceRef] = { chatId: source.sourceRef,
              bindingId: `stream-grant:${source.sourceRef}`, frame: frame.data,
              status: "live", verifiedAt: Date.now() };
        } catch { /* Unavailable sources are omitted, never replayed from cache. */ }
      }
      if (!stopped) { setPages(next); timer = setTimeout(() => void poll(), 10_000); }
    };
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [enabled, sources]);
  return enabled ? pages : {};
}
