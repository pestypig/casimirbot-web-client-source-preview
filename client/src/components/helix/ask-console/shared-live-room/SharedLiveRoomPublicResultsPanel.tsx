import React from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";

export function SharedLiveRoomPublicResultsPanel({
  room,
}: {
  room: HelixSharedRealtimeRoom;
}) {
  const results = [...room.public_terminal_results].reverse();
  return (
    <section className="rounded-xl border border-emerald-300/20 bg-emerald-400/[0.04] p-3">
      <p className="text-xs font-semibold text-emerald-100">Shared supported results</p>
      <p className="mt-1 text-[11px] leading-5 text-slate-400">
        Final answers appear here only after Helix verifies the originating turn. This card is a
        shared presentation copy, not another answer or permission source.
      </p>
      {results.length === 0 ? (
        <p className="mt-2 text-[11px] text-slate-500">No authorized room result has been published yet.</p>
      ) : (
        <div className="mt-3 space-y-2" data-testid="shared-live-room-public-results">
          {results.map((result) => (
            <article key={result.result_ref} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-[11px] text-emerald-100/80">
                Shared by {room.participants?.find(member => member.participant_id === result.author_participant_id)?.display_name ?? "a former room member"}
              </p>
              <p className="whitespace-pre-wrap text-xs leading-5 text-slate-100">{result.text}</p>
              <p className="mt-2 break-all font-mono text-[9px] text-slate-500">
                turn {result.turn_id} · {result.terminal_artifact_kind}
              </p>
              {result.capability_ids.length > 0 ? (
                <p className="mt-1 break-all text-[9px] text-emerald-100/70">
                  {result.capability_ids.join(" · ")}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
