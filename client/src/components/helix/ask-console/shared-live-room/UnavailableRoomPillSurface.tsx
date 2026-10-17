import React from "react";
import type { HelixAskSurfaceFrameProps } from "../HelixAskSurfaceFrame";
import { HelixAskSurfaceFrameSurface } from "../HelixAskSurfaceFrameSurface";

/** An unavailable room must never inherit Ask Helix's composer or draft. */
export function UnavailableRoomPillSurface({ frameState, onReturnToPrivateAsk }: {
  frameState: Omit<HelixAskSurfaceFrameProps, "children">;
  onReturnToPrivateAsk: () => void;
}) {
  return <HelixAskSurfaceFrameSurface {...frameState} isOffline={false}
    controlId="helix.ask.room-text.unavailable"
    onSubmit={event => event.preventDefault()}>
    <div className="relative z-[80] flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
      <p role="status" className="text-amber-100">Room text is unavailable while membership is checked or access is lost.</p>
      <button type="button" onClick={onReturnToPrivateAsk}
        className="rounded-lg border border-white/20 px-3 py-1.5 text-slate-100 hover:bg-white/5">
        Return to Ask Helix
      </button>
    </div>
  </HelixAskSurfaceFrameSurface>;
}
