import React from "react";
import type {
  HelixSharedRealtimeRoomConsentPatch,
  HelixSharedRealtimeRoomParticipant,
} from "@shared/helix-shared-realtime-room";
import type { HelixSharedLiveRoomController } from "./useHelixSharedLiveRoom";

type ConsentKey = keyof HelixSharedRealtimeRoomConsentPatch;

const consentControls: ReadonlyArray<{
  key: ConsentKey;
  label: string;
  description: string;
}> = [
  {
    key: "microphone_to_room",
    label: "Microphone to room",
    description: "Permit the other participant to hear your microphone after both browsers connect the room audio bridge.",
  },
  {
    key: "microphone_to_model",
    label: "Microphone to model",
    description: "Permit your microphone to enter the shared GPT input only while you hold the speaking floor.",
  },
  {
    key: "transcript_to_room",
    label: "Transcript to room",
    description: "Share completed GPT transcripts and your floor-attributed input transcripts with both room members.",
  },
  {
    key: "screen_to_model",
    label: "Visual frames to model",
    description: "Permit this browser's Screen, Camera, and recent Image Lens carousel frames to enter the shared model context.",
  },
  {
    key: "screen_thumbnail_to_room",
    label: "Ephemeral preview to participant",
    description: "Let the other member view short-lived previews. A preview may contain the original submitted pixels; it is not a server-resized thumbnail.",
  },
  {
    key: "model_audio_output",
    label: "Model audio playback",
    description: "Permit shared GPT audio playback; the room bridge forwards the owner's GPT audio to the participant.",
  },
];

export function SharedLiveRoomConsentPanel({
  participant,
  controller,
  sectionId,
  onHostTransportInvalidated,
}: {
  participant: HelixSharedRealtimeRoomParticipant;
  controller: HelixSharedLiveRoomController;
  sectionId: string;
  onHostTransportInvalidated?: () => void;
}) {
  const toggleConsent = async (key: ConsentKey, enabled: boolean): Promise<void> => {
    const nextEnabled = !enabled;
    const updated = await controller.patchOwnConsent({ [key]: nextEnabled });
    if (
      updated &&
      participant.role === "owner" &&
      !nextEnabled &&
      (key === "microphone_to_model" || key === "model_audio_output")
    ) {
      onHostTransportInvalidated?.();
    }
  };
  return (
    <section aria-labelledby={sectionId} className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p id={sectionId} className="text-xs font-semibold text-slate-100">Your permission records</p>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">
        Only you can change these grants. Turning one off blocks future room ingress and reconciles
        retained room content for that source; turning one on never activates a microphone, camera,
        screen, or speaker by itself.
      </p>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {consentControls.map((control) => {
          const enabled = participant.consent[control.key];
          return (
            <button data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-consent-panel.void-toggle-consent-control-key-enabled"
              key={control.key}
              type="button"
              aria-pressed={enabled}
              disabled={controller.busyAction !== null}
              className={`rounded-lg border p-2 text-left transition disabled:opacity-50 ${
                enabled
                  ? "border-emerald-300/35 bg-emerald-400/10"
                  : "border-white/10 bg-white/[0.02]"
              }`}
              onClick={() => void toggleConsent(control.key, enabled)}
            >
              <span className="block text-xs font-semibold text-slate-100">
                {control.label} · {enabled ? "On" : "Off"}
              </span>
              <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                {control.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
