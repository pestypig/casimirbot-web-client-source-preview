import React, { useEffect, useRef, useState } from "react";
import { readRoomServiceTarget, roomServiceReturnPath } from "@shared/helix-room-service-navigation";
import { Auth0SignInButton } from "@/components/auth/Auth0SignInButton";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT } from "./SharedLiveRoomGuideProjection";

/** A URL is a navigation request, never membership, consent or model authority. */
export function RoomServiceEntry() {
  const [roomId] = useState(() => readRoomServiceTarget(window.location.search));
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const changed = () => {
      pending.current?.abort(); setBusy(false);
      setMessage("Account changed. Open the room again to verify your access.");
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
    return () => { pending.current?.abort(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed); };
  }, []);
  if (!roomId || dismissed || window.casimirDesktop) return null;
  const open = () => {
    pending.current?.abort();
    const request = new AbortController(); pending.current = request;
    setBusy(true); setMessage(null);
    const timer = window.setTimeout(() => {
      request.abort(); setBusy(false);
      setMessage("Room access check timed out. Retry when the service is available.");
    }, 20000);
    request.signal.addEventListener("abort", () => window.clearTimeout(timer), { once: true });
    const event = new CustomEvent(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, {
      cancelable: true,
      detail: { roomId, refresh: true, signal: request.signal, onResult: (opened: boolean) => {
        if (request.signal.aborted) return;
        window.clearTimeout(timer);
        setBusy(false);
        setMessage(opened ? "Room opened. Audio and AI controls remain separate."
          : "This account could not open the requested room. Check sign-in and room access, then retry.");
      } },
    });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) {
      request.abort(); setBusy(false);
      setMessage("Sign in with your room account and enable its Shared Live Rooms access, then retry.");
    }
  };
  return <section aria-label="Open room service" className="fixed left-3 right-3 top-3 z-[2147482000] mx-auto max-w-lg rounded-xl border border-cyan-300/30 bg-slate-950 p-4 text-slate-100 shadow-xl">
    <h2 className="font-semibold">Open your service room</h2>
    <p className="my-2 text-xs">Use the same account as your harness room connection. This link does not join a room or enable audio, AI or program actions.</p>
    <p className="my-2 break-all text-xs">{roomId}</p>
    <Auth0SignInButton returnTo={roomServiceReturnPath(roomId)} />
    <button type="button" disabled={busy} onClick={open} className="mr-4 mt-3">{busy ? "Checking room access…" : "Open selected room"}</button>
    <button type="button" onClick={() => { pending.current?.abort(); setDismissed(true); }}>Dismiss</button>
    {message ? <p role="status" className="mt-2 text-xs">{message}</p> : null}
  </section>;
}
