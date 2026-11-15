import { PHYSICS_GLYPH_CLIENT_PATH, physicsGlyphClientCredentialsSchema, physicsGlyphClientJobSchema } from "@shared/physics-glyphs/client-transport";
import { physicsGlyphSnapshot, usePhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
import { readCachedAccountProfileIdentity } from "@/lib/workstation/accountCapabilityPolicy";
import { PHYSICS_GLYPH_CLIENT_PROTOCOL, physicsGlyphProtocolSupportsScientificRecord } from "@shared/physics-glyphs/client-protocol";

export type PhysicsGlyphConnectionStatus = "connecting" | "connected" | "disconnected" | "sign_in_required" | "connection_failed" | "incompatible_version";

/** Connect one mounted panel; only the shared typed reducer executes domain commands. */
export function connectPhysicsGlyphClient(options: {
  store?: Pick<typeof usePhysicsGlyphWorkspaceStore,"getState">;
  onStatus: (status: PhysicsGlyphConnectionStatus) => void;
  onPeer?: (peerId: string | null) => void;
  fetcher?: typeof fetch;
  pollMs?: number;
  now?: () => number;
}) {
  const fetcher = options.fetcher ?? fetch, store = options.store ?? usePhysicsGlyphWorkspaceStore;
  store.getState().syncProfile();
  const profileKey = store.getState().profileKey;
  const expectedProfileId = readCachedAccountProfileIdentity().profileId;
  if (!expectedProfileId) { options.onStatus("sign_in_required"); return () => {}; }
  const controller = new AbortController();
  let stopped = false, credentials: { peerId: string; token: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const active = () => {
    store.getState().syncProfile();
    return !stopped && profileKey !== null && store.getState().profileKey === profileKey;
  };
  const post = async (operation: string, body: unknown, signal?: AbortSignal) => {
    const response = await fetcher(`${PHYSICS_GLYPH_CLIENT_PATH}/${operation}`, {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal,
    });
    const value = await response.json();
    if (!response.ok || value.ok !== true) throw new Error(value.error === "physics_glyph_signed_in_session_required" ? "sign_in_required"
      : value.error === "physics_glyph_client_protocol_incompatible" || value.error === "physics_glyph_client_evidence_operator_incompatible" || (operation === "register" && value.error === "physics_glyph_client_request_invalid") ? "incompatible_version" : "connection_failed");
    return value;
  };
  const disconnect = () => {
    stopped = true; clearTimeout(timer); controller.abort();
    options.onPeer?.(null);
    if (credentials) { const retired = credentials; credentials = null; void post("disconnect", retired).catch(() => {}); }
  };
  const poll = async () => {
    if (!active()) { disconnect(); options.onStatus("disconnected"); return; }
    try {
      const response = await post("poll", { ...credentials, observation: physicsGlyphSnapshot(store.getState().workspace) }, controller.signal);
      if (stopped) return;
      if (!active()) { disconnect(); options.onStatus("disconnected"); return; }
      if (response.job !== null) {
        const job = physicsGlyphClientJobSchema.parse(response.job);
        const snapshot = physicsGlyphSnapshot(store.getState().workspace);
        const outcome = job.expiresAt > (options.now ?? Date.now)() && job.sceneId === snapshot.scene.id
          ? store.getState().dispatch(job.command) : { ok: false, artifact: snapshot };
        await post("ack", { ...credentials, requestId: job.requestId, ok: outcome.ok, artifact: outcome.artifact }, controller.signal);
      }
      if (active()) timer = setTimeout(poll, options.pollMs ?? 750);
    } catch {
      if (stopped) return;
      disconnect(); options.onStatus("connection_failed");
    }
  };
  options.onStatus("connecting");
  void (async () => {
    try {
      // Let registration finish so cleanup can retire a peer even after unmount.
      const response = await post("register", { expectedProfileId, protocol: PHYSICS_GLYPH_CLIENT_PROTOCOL, observation: physicsGlyphSnapshot(store.getState().workspace) });
      credentials = physicsGlyphClientCredentialsSchema.parse({ peerId: response.peerId, token: response.token });
      if (!physicsGlyphProtocolSupportsScientificRecord(response.protocol)) throw new Error("incompatible_version");
      if (!active()) { disconnect(); return; }
      options.onPeer?.(credentials.peerId);
      options.onStatus("connected");
      await poll();
    } catch (error) {
      if (stopped) return;
      disconnect(); options.onStatus(error instanceof Error && error.message === "sign_in_required" ? "sign_in_required"
        : error instanceof Error && error.message === "incompatible_version" ? "incompatible_version" : "connection_failed");
    }
  })();
  return disconnect;
}
