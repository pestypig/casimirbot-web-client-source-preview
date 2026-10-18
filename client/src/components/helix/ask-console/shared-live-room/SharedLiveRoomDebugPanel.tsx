import React, { useMemo, useState } from "react";
import { copyHelixAskPlainTextToClipboard } from "../HelixAskClipboard";
import type { HelixSharedLiveRoomController } from "./useHelixSharedLiveRoom";
import { buildSharedLiveRoomAcceptanceProjection } from
  "./SharedLiveRoomAcceptanceProjection";
import { readSharedLiveRoomDebugArtifact } from
  "./SharedLiveRoomDebugArtifact";

export function SharedLiveRoomDebugPanel({
  controller,
}: {
  controller: HelixSharedLiveRoomController;
}) {
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const latestFrame = controller.debug?.visual_frames.at(-1) ?? null;
  const acceptance = useMemo(
    () => buildSharedLiveRoomAcceptanceProjection({
      room: controller.room,
      frames: controller.frames,
      mediaBridge: controller.mediaBridge,
    }),
    [controller.frames, controller.mediaBridge, controller.room],
  );
  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-100">Metadata-only room debug</p>
          <p className="mt-1 text-[10px] text-slate-500">
            This metadata-only room artifact is included as non-authoritative ambient evidence in
            unified final-answer debug copies. It excludes frame pixels, transcript text, provider
            payloads, raw provider/session IDs, and participant display names.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-debug-panel.const-artifact-read-shared-live-room-debug-artifact-void-copy-helix-ask"
            type="button"
            className="rounded border border-white/15 px-2 py-1 text-[10px] text-slate-200"
            onClick={() => {
              const artifact = readSharedLiveRoomDebugArtifact();
              void copyHelixAskPlainTextToClipboard(
                artifact ? JSON.stringify(artifact, null, 2) : "",
              ).then((copied) => setCopyStatus(copied ? "copied" : "failed"));
            }}
          >
            {copyStatus === "copied"
              ? "Room proof copied"
              : copyStatus === "failed"
                ? "Copy failed"
                : "Copy room proof JSON"}
          </button>
          <button data-helix-interaction-kind="observe" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-debug-panel.refresh-debug"
            type="button"
            disabled={controller.busyAction !== null}
            className="rounded border border-white/15 px-2 py-1 text-[10px] text-slate-200 disabled:opacity-50"
            onClick={() => void controller.refreshDebug()}
          >
            Refresh debug
          </button>
        </div>
      </div>
      {controller.debug ? (
        <div className="mt-2 grid gap-1 font-mono text-[10px] text-slate-400 sm:grid-cols-2">
          <p>participants {controller.debug.participant_count}</p>
          <p>visual frames {controller.debug.visual_frame_count}</p>
          <p>audit events {controller.debug.audit_event_count}</p>
          <p>raw content {String(controller.debug.raw_content_included)}</p>
          <p>latest delivery {latestFrame?.provider_delivery ?? "none"}</p>
          <p>latest source {latestFrame?.source_id ?? "none"}</p>
          <p>latest captured {latestFrame?.captured_at ?? "none"}</p>
          <p>latest participant {latestFrame?.participant_id ?? "none"}</p>
        </div>
      ) : null}
      <div
        className="mt-3 rounded-lg border border-cyan-300/15 bg-cyan-400/[0.04] p-2"
        data-shared-room-automated-transport-ready={
          acceptance.automated_transport_evidence_ready ? "true" : "false"
        }
      >
        <p className="text-[10px] font-semibold text-cyan-100">
          Current automated transport evidence:{" "}
          {acceptance.automated_transport_evidence_ready ? "ready" : "incomplete"}
        </p>
        <div className="mt-1 grid gap-1 font-mono text-[9px] text-slate-400 sm:grid-cols-2">
          <p>two participants {String(acceptance.participants_present)}</p>
          <p>one model bound {String(acceptance.single_shared_model_bound)}</p>
          <p>both visual acks {String(acceptance.both_participants_visual_provider_acknowledged)}</p>
          <p>media bridge active {String(acceptance.media_bridge_active)}</p>
          <p>peer audio transport {String(acceptance.peer_audio_transport_connected)}</p>
          <p>remote playback {String(acceptance.remote_audio_playback_ready)}</p>
          <p>mixed GPT input {String(acceptance.mixed_provider_input_ready)}</p>
          <p>GPT input enabled {String(acceptance.provider_input_enabled)}</p>
          <p>GPT audio forwarded {String(acceptance.provider_audio_transport_forwarded)}</p>
        </div>
        <p className="mt-2 text-[9px] leading-4 text-amber-100/80">
          Manual proof still required: compare both screens, hear both human directions and GPT
          in both browsers, observe GPT and floor-attributed transcripts, then revoke consent and
          confirm microphone restoration.
        </p>
      </div>
    </section>
  );
}
