import React from "react";
import type { RoomMissionOwnerSelection } from "@shared/helix-room-mission-owner";
import type { HelixEnvironmentMissionActivityProjection } from
  "@shared/helix-environment-mission-activity-projection";
import EnvironmentMissionActivityHud from "@/components/workstation/EnvironmentMissionActivityHud";
import { readRoomMissionActivityPage, RoomMissionActivityReadError } from
  "./RoomMissionActivityApi";

type MissionHudBridge = {
  showEnvironmentMissionHud?: (selection: unknown) => Promise<unknown>;
  stopEnvironmentMissionHud?: () => Promise<unknown>;
};
const nativeHud = (): MissionHudBridge | undefined =>
  (window as Window & { casimirDesktop?: MissionHudBridge }).casimirDesktop;

/** In-app read-only preview. A separate native window is needed over Minecraft. */
export function RoomMissionActivityPreview({ mission }: {
  mission: RoomMissionOwnerSelection;
}) {
  const [events, setEvents] = React.useState<HelixEnvironmentMissionActivityProjection[]>([]);
  const [status, setStatus] = React.useState("Checking verified mission activity…");
  const [overlayStatus, setOverlayStatus] = React.useState("");
  const overlayRequested = React.useRef(false);
  React.useEffect(() => () => {
    if (overlayRequested.current) {
      overlayRequested.current = false;
      void nativeHud()?.stopEnvironmentMissionHud?.();
    }
  }, [mission.room_id, mission.mission_id, mission.mission_revision,
    mission.binding_epoch, mission.run_id]);
  React.useEffect(() => {
    if (mission.status !== "active" || !mission.run_id) return;
    let active = true;
    let pending = false;
    let halted = false;
    let cursor: string | null = null;
    let controller: AbortController | null = null;
    setEvents([]);
    setStatus("Checking verified mission activity…");
    const poll = async () => {
      if (!active || pending || halted) return;
      pending = true;
      controller = new AbortController();
      try {
        const page = await readRoomMissionActivityPage(mission, cursor, controller.signal);
        if (!active || controller.signal.aborted) return;
        cursor = page.next_cursor ?? page.poll_cursor;
        setEvents(previous => {
          const unique = new Map(previous.map(item => [item.activity_event_id, item]));
          for (const item of page.projections) unique.set(item.activity_event_id, item);
          return [...unique.values()]
            .sort((left, right) => left.projection_sequence - right.projection_sequence)
            .slice(-25);
        });
        setStatus("Verified public activity only. No gameplay permission is implied.");
      } catch (error) {
        if (!active || controller?.signal.aborted) return;
        // A failed protected reread cannot keep a previously verified page on
        // screen as if it were still current. Recover from the first page.
        cursor = null;
        setEvents([]);
        if (error instanceof RoomMissionActivityReadError &&
            (error.code === "mission_activity_scope_changed" ||
              error.code === "mission_activity_response_mismatch")) {
          halted = true;
          setStatus("Mission activity access or scope changed. Reconnect or refresh the room task to resume this preview.");
        } else {
          setStatus("Mission activity is temporarily unavailable. This preview will retry.");
        }
      } finally {
        pending = false;
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 5_000);
    return () => { active = false; controller?.abort(); window.clearInterval(interval); };
  }, [mission.room_id, mission.mission_id, mission.mission_revision,
    mission.binding_epoch, mission.run_id, mission.status]);

  if (mission.status !== "active" || !mission.run_id) return null;
  return <div aria-label="In-app mission activity preview"
    className="mt-3 space-y-2 rounded-xl border border-cyan-300/20 p-2">
    <p className="text-[11px] text-slate-300">Verified public activity only. The separate over-game HUD is optional and cannot control the game.</p>
    <EnvironmentMissionActivityHud missionLabel="Minecraft mission" runId={mission.run_id}
      projections={events} />
    <p role="status" className="text-[11px] text-slate-400">{status}</p>
    {nativeHud()?.showEnvironmentMissionHud && mission.run_id ? <div className="space-y-1">
      <button type="button" className="rounded border border-cyan-300/30 px-2 py-1"
        onClick={() => {
          if (overlayRequested.current) {
            setOverlayStatus("Stopping over-game HUD…");
            void nativeHud()?.stopEnvironmentMissionHud?.().then(result => {
              if (!result || typeof result !== "object" ||
                  !("status" in result) || result.status !== "stopped") {
                setOverlayStatus("HUD stop is unconfirmed; retry Stop or close this panel.");
                return;
              }
              overlayRequested.current = false;
              setOverlayStatus("Over-game HUD stopped.");
            }).catch(() =>
              setOverlayStatus("HUD stop is unconfirmed; retry Stop or close this panel."));
            return;
          }
          overlayRequested.current = true;
          setOverlayStatus("Checking owner activity, fresh Fabric status and the foreground game window…");
          void nativeHud()?.showEnvironmentMissionHud?.({
            roomId: mission.room_id, missionId: mission.mission_id,
            missionRevision: mission.mission_revision,
            bindingEpoch: mission.binding_epoch, runId: mission.run_id,
          }).then(result => {
            if (!overlayRequested.current) return;
            const state = result && typeof result === "object" && "status" in result
              ? result.status : null;
            if (state !== "showing" && state !== "waiting")
              overlayRequested.current = false;
            setOverlayStatus(state === "showing"
              ? "Over-game HUD showing verified public activity."
              : state === "waiting"
                ? "HUD requested; it appears only when this exact client and mission are verified in the foreground."
                : "HUD unavailable. Check the current mission and Minecraft session.");
          }).catch(() => {
            overlayRequested.current = false;
            setOverlayStatus("HUD unavailable. No game control was requested.");
          });
        }}>{overlayRequested.current ? "Stop over-game HUD" : "Show over-game HUD"}</button>
      {overlayStatus ? <p role="status" className="text-[11px] text-slate-400">{overlayStatus}</p> : null}
    </div> : null}
  </div>;
}
