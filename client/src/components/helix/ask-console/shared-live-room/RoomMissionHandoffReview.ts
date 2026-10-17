import { create } from "zustand";
import type { HelixRealtimeStagePlayAskHandoffV1 } from "@shared/contracts/helix-realtime-stage-play.v1";

export type LocalRoomHandoff = Readonly<{
  roomId: string; handoffId: string; realtimeSessionId: string;
  text: string; textHash: string; capturedAt: number;
}>;
// A bounded, volatile preview only. No localStorage, cross-tab broadcast,
// authority, or automatic dispatch. The server rechecks every chosen handoff.
export const useRoomMissionHandoffReview = create<{ entries: LocalRoomHandoff[] }>(() => ({ entries: [] }));
export function rememberRoomMissionHandoff(handoff: HelixRealtimeStagePlayAskHandoffV1, transcript: string) {
  const prefix = "helix-ask:room:";
  const text = transcript.trim();
  if (!handoff.thread_id.startsWith(prefix) || !text || text.length > 4000 ||
      handoff.transcript_text_char_count !== text.length) return;
  const entry: LocalRoomHandoff = { roomId: handoff.thread_id.slice(prefix.length),
    handoffId: handoff.handoff_id, realtimeSessionId: handoff.realtime_session_id,
    text, textHash: handoff.transcript_text_hash, capturedAt: handoff.created_at_ms };
  useRoomMissionHandoffReview.setState(state => ({
    entries: [...state.entries.filter(item => item.handoffId !== entry.handoffId), entry].slice(-20),
  }));
}
export function forgetRoomMissionHandoffs(realtimeSessionId: string) {
  useRoomMissionHandoffReview.setState(state => ({
    entries: state.entries.filter(item => item.realtimeSessionId !== realtimeSessionId),
  }));
}
