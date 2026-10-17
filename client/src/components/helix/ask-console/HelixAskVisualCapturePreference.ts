export type HelixAskVisualCaptureRoute = "live_answer" | "image_lens" | "audio_transcript";

export const HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_STORAGE_KEY =
  "helix.liveAnswer.visualCaptureRoutes.v1";
export const HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_SYNC_EVENT =
  "helix:live-answer:visual-capture-routes";

export type HelixAskVisualCapturePreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export type HelixAskVisualCapturePreferenceTarget = {
  storage: HelixAskVisualCapturePreferenceStorage | null;
  dispatchSyncEvent: ((detail: { routes: HelixAskVisualCaptureRoute[] }) => void) | null;
};

function resolveHelixAskVisualCapturePreferenceTarget(): HelixAskVisualCapturePreferenceTarget {
  if (typeof window === "undefined") {
    return { storage: null, dispatchSyncEvent: null };
  }
  return {
    storage: window.localStorage,
    dispatchSyncEvent: (detail) => {
      window.dispatchEvent(
        new CustomEvent(HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_SYNC_EVENT, { detail }),
      );
    },
  };
}

export function readHelixAskVisualCaptureAudioPreference(
  storage: HelixAskVisualCapturePreferenceStorage | null =
    resolveHelixAskVisualCapturePreferenceTarget().storage,
): boolean {
  if (!storage) return false;
  try {
    const parsed = JSON.parse(
      storage.getItem(HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_STORAGE_KEY) ?? "null",
    );
    return Array.isArray(parsed) && parsed.includes("audio_transcript");
  } catch {
    return false;
  }
}

export function syncHelixAskVisualCaptureRoutePreference(
  includeAudio: boolean,
  target: HelixAskVisualCapturePreferenceTarget = resolveHelixAskVisualCapturePreferenceTarget(),
): HelixAskVisualCaptureRoute[] {
  const routes: HelixAskVisualCaptureRoute[] = includeAudio
    ? ["live_answer", "audio_transcript"]
    : ["live_answer"];
  if (target.storage) {
    target.storage.setItem(
      HELIX_LIVE_ANSWER_VISUAL_CAPTURE_ROUTE_STORAGE_KEY,
      JSON.stringify(routes),
    );
  }
  target.dispatchSyncEvent?.({ routes });
  return routes;
}
