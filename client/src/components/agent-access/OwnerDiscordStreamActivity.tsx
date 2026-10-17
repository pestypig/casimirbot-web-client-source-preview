import { useEffect } from "react";
import type { HelixMessageCloudFrame } from "@shared/helix-message-cloud";
import type { HelixAdapterAiActivityPage } from "@shared/helix-environment-action-activity";
import { projectSessionActivity } from "./sessionActivityProjection";
import { useGrantedCodexStreamActivity, type LocalCodexStreamGrant } from
  "./useGrantedCodexStreamActivity";

/** Ordinary linked owners get an activity Float without Cloud Agent DM access.
 * Every Codex frame comes from an exact, account-scoped native read grant. */
export function OwnerDiscordStreamActivity({ roomId, open, grants, adapterPages,
  onActivityFrame }: {
  roomId: string;
  open: boolean;
  grants: readonly LocalCodexStreamGrant[];
  adapterPages: readonly HelixAdapterAiActivityPage[];
  onActivityFrame: (frame: HelixMessageCloudFrame) => void;
}) {
  const pages = useGrantedCodexStreamActivity(grants, open);
  useEffect(() => {
    if (!open || !window.casimirDesktop?.showMessageCloud) return;
    const frame = projectSessionActivity({
      helixConversationId: roomId,
      messages: [], codexFrame: null, codexSourceStatus: "unpaired",
      pairing: { status: "unavailable", taskId: null },
      savedCodexChatCount: grants.length,
      otherCodexChats: grants.flatMap(grant => {
        const source = pages[grant.sourceRef];
        return source ? [{ ...source, title: grant.title }] : [];
      }),
      adapterPages,
      savedAdapterChats: grants.flatMap(grant => grant.helixConversationId
        ? [{ id: grant.helixConversationId, title: grant.title }] : []),
    });
    void window.casimirDesktop.showMessageCloud(frame).catch(() => {});
    onActivityFrame(frame);
  }, [roomId, open, grants, pages, adapterPages, onActivityFrame]);
  return null;
}
