import React, { useEffect, useRef, useState } from "react";
import { boardRequest, type LocalGlyphCandidate } from "@/components/workstation/friends-parties/FriendBoardApi";

/** Finalize while the originating workspace is still mounted and connected. */
export function PrepareFriendsSticker({ profileKey, revision }: { profileKey: string | null; revision: number }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const epoch = useRef(0);
  useEffect(() => {
    epoch.current++;
    setBusy(false);
    setNotice(null);
    return () => { epoch.current++; };
  }, [profileKey, revision]);
  const prepare = async () => {
    const current = epoch.current;
    setBusy(true);
    setNotice(null);
    try {
      const { candidate } = await boardRequest<{ candidate: LocalGlyphCandidate | null }>("/local-candidate");
      if (epoch.current !== current) return;
      if (!candidate?.request_id || !["verified", "finalized"].includes(candidate.phase)) {
        setNotice("Complete a new Physics Glyph composition through your connected chat, then prepare its sticker here before opening Friends.");
        return;
      }
      await boardRequest("/finalize-local", { generation_id: candidate.generation_id, request_id: candidate.request_id });
      if (epoch.current === current) setNotice("Sticker prepared. Open Friends & Voice Parties, choose your friend, then select it in Emoji & artifacts. No message has been sent.");
    } catch {
      if (epoch.current === current) setNotice("The final scene could not be verified. Keep this workspace connected to chat, complete a new composition if it changed, and prepare again before opening Friends.");
    } finally {
      if (epoch.current === current) setBusy(false);
    }
  };
  return <section aria-label="Prepare a Friends sticker" className="space-y-2 rounded border border-violet-300/25 p-3">
    <button type="button" disabled={busy} onClick={() => void prepare()} className="rounded bg-violet-400/15 px-3 py-2">{busy ? "Verifying sticker…" : "Prepare Friends sticker"}</button>
    <p className="text-xs text-slate-400">Verify and save this completed chat-generated artifact for your sticker picker before leaving the workspace. Sending is a separate step in Friends.</p>
    {notice && <p role="status" className="text-sm text-slate-300">{notice}</p>}
  </section>;
}
