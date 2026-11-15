import React, { useEffect, useState } from "react";
import { usePhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
import { connectPhysicsGlyphClient, type PhysicsGlyphConnectionStatus } from "@/lib/workstation/physicsGlyphClientTransport";
import { setPhysicsGlyphAskConnection } from "@/lib/workstation/physicsGlyphAskContext";

export function PhysicsGlyphChatConnection() {
  const profileKey = usePhysicsGlyphWorkspaceStore(state => state.profileKey);
  const [connection, setConnection] = useState<{ profileKey: string | null; attempt: number } | null>(null);
  const [status, setStatus] = useState<PhysicsGlyphConnectionStatus>("disconnected");
  const [automatic, setAutomatic] = useState(true);
  const [peerId, setPeerId] = useState<string | null>(null);
  const enabled = connection !== null && connection.profileKey === profileKey;
  useEffect(() => { setStatus("disconnected"); }, [profileKey]);
  useEffect(() => {
    if (!enabled) return;
    return connectPhysicsGlyphClient({ onStatus: setStatus, onPeer: setPeerId });
  }, [connection, profileKey]);
  useEffect(() => {
    setPhysicsGlyphAskConnection(enabled ? peerId : null, automatic);
    return () => setPhysicsGlyphAskConnection(null, false);
  }, [enabled, peerId, automatic, profileKey]);
  const message = enabled && status === "connected" ? "Connected chats on this account can inspect and configure this panel. Keep it open and ask a physics question in Helix Ask with Codex, attached context and permission to configure the workspace."
    : status === "connecting" ? "Connecting this panel…"
    : status === "sign_in_required" ? "Sign in to connect this panel to external chat."
    : status === "incompatible_version" ? "This panel and service use different physics-generation versions. Use matching versions to connect; no scene was published."
    : status === "connection_failed" ? "Chat connection stopped. Reconnect to try again."
    : "Connect one panel to let external chats on this account inspect and configure its scene.";
  return <section className="flex flex-wrap items-center gap-3 rounded border border-slate-700 p-3" aria-label="External chat connection">
    <button type="button" className="rounded border border-slate-600 px-3 py-2 text-sm" onClick={() => {
      if (enabled && (status === "connected" || status === "connecting")) { setConnection(null); setStatus("disconnected"); }
      else setConnection({ profileKey, attempt: (connection?.attempt ?? 0) + 1 });
    }}>{enabled && (status === "connected" || status === "connecting") ? "Disconnect chat" : "Connect Helix Ask & external chat"}</button>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} />Automatic physics scenarios in Helix Ask</label>
    <p role="status" className="text-sm text-slate-300">{message}</p>
  </section>;
}
