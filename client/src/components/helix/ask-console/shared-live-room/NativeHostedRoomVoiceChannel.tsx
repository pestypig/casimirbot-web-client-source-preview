import React, { useEffect, useRef, useState } from "react";
import { NativeHostedRoomVoiceBridge, type HostedVoiceSnapshot } from "./NativeHostedRoomVoiceBridge";

type Member = { participant_id: string; display_name: string };
const initial: HostedVoiceSnapshot = { phase: "idle", active: false, admittedParticipantIds: [],
  connectedParticipantIds: [], receivedAudioParticipantIds: [], error: null };

export function NativeHostedRoomVoiceChannel({ roomId, selfParticipantId, members }: {
  roomId: string; selfParticipantId: string; members: Member[];
}) {
  const [state, setState] = useState(initial);
  const bridge = useRef<NativeHostedRoomVoiceBridge | null>(null);
  useEffect(() => {
    const current = new NativeHostedRoomVoiceBridge(roomId, selfParticipantId, setState);
    bridge.current = current;
    return () => { bridge.current = null; void current.stop(); };
  }, [roomId, selfParticipantId]);
  const joined = state.phase === "waiting" || state.phase === "connected";
  const presentIds = new Set(state.connectedParticipantIds);
  const audioIds = new Set(state.receivedAudioParticipantIds);
  if (joined) presentIds.add(selfParticipantId);
  return <section aria-label="Voice channel" className="rounded-lg border border-cyan-300/20 bg-slate-900/50 p-2">
    <div className="flex items-center justify-between gap-2">
      <div><p className="font-semibold text-cyan-100">🔊 Voice</p>
        <p className="text-slate-400">Human call · GPT Live is not listening</p></div>
      <button type="button" onClick={() => void (state.active
        ? bridge.current?.stop() : bridge.current?.start())}
        className="rounded-md border border-cyan-300/30 px-2 py-1 text-cyan-100">
        {state.active ? "Leave voice" : "Join voice and share microphone"}
      </button>
    </div>
    {joined ? <div className="mt-2 flex flex-wrap gap-2" aria-label="Voice participants">
      {members.filter(member => presentIds.has(member.participant_id)).map(member =>
        <span key={member.participant_id} className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-1">
          <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full bg-cyan-300/25">
            {member.display_name.slice(0, 1).toUpperCase()}</span>
          {member.display_name}{member.participant_id === selfParticipantId
            ? state.connectedParticipantIds.length === 0 ? " · waiting" : " · microphone shared"
            : audioIds.has(member.participant_id) ? " · audio track received" : " · connecting audio"}
        </span>)}
    </div> : null}
    {state.error ? <p role="status" className="mt-2 text-amber-200">
      {state.error === "audio_playback_blocked" ? "Audio playback was blocked. Leave and rejoin voice to retry."
        : "Voice connection is unavailable. Your microphone is not shared with GPT Live."}</p> : null}
  </section>;
}
