import React from "react";
import { RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import type {
  HelixRoomSharedCapability,
  HelixRoomSharedCapabilityList,
} from "@shared/helix-room-capability-grant";

type GrantMutationResponse = {
  grant?: HelixRoomSharedCapability;
  error?: string;
  message?: string;
};

const readJson = async <T,>(response: Response): Promise<T> => {
  const body = await response.json().catch(() => ({})) as T & {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? `shared capability ${response.status}`);
  }
  return body;
};

const formatExpiry = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function SharedLiveRoomCapabilitiesPanel({
  roomId,
  roomClosed,
  isOwner,
}: {
  roomId: string;
  roomClosed: boolean;
  isOwner: boolean;
}) {
  const [projection, setProjection] = React.useState<HelixRoomSharedCapabilityList | null>(null);
  const [selectedConnection, setSelectedConnection] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const next = await readJson<HelixRoomSharedCapabilityList>(await fetch(
        `/api/agi/environment-connectors/rooms/${encodeURIComponent(roomId)}/capability-grants`,
        { credentials: "same-origin" },
      ));
      setProjection(next);
      setSelectedConnection((current) =>
        current && next.available_connections.some((item) => item.connection_ref === current)
          ? current
          : next.available_connections.find((item) => item.ready)?.connection_ref ?? "",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load shared capabilities.");
    }
  }, [roomId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const createGrant = async (): Promise<void> => {
    const connection = projection?.available_connections.find(
      (item) => item.connection_ref === selectedConnection,
    );
    if (!connection) return;
    setBusy(true);
    setMessage(null);
    try {
      await readJson<GrantMutationResponse>(await fetch(
        `/api/agi/environment-connectors/rooms/${encodeURIComponent(roomId)}/capability-grants`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connection_ref: connection.connection_ref,
            capability_ids: connection.capability_ids,
            expires_in_minutes: 60,
          }),
        },
      ));
      setMessage("Read-only capability shared for one hour.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to share this capability.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grant: HelixRoomSharedCapability): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      await readJson<GrantMutationResponse>(await fetch(
        `/api/agi/environment-connectors/rooms/${encodeURIComponent(roomId)}/capability-grants/${encodeURIComponent(grant.grant_ref)}`,
        { method: "DELETE", credentials: "same-origin" },
      ));
      setMessage("Shared read access revoked. The host connection remains active.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to revoke shared access.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-400/5 p-3" data-testid="room-shared-capabilities">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100">
            <ShieldCheck className="h-3 w-3" /> Shared capabilities
          </div>
          <p className="mt-1 text-[10px] leading-4 text-slate-400">
            Members receive normalized read evidence, never the host credential, endpoint, or device access.
          </p>
        </div>
        <button data-helix-interaction-kind="observe" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-capabilities-panel.refresh"
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-[10px] text-slate-300 disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {projection?.grants.map((grant) => (
        <article key={grant.grant_ref} className="mt-2 rounded border border-white/10 bg-slate-950/70 p-2 text-[10px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-slate-100">{grant.environment_label}</p>
            <span className={grant.ready ? "text-emerald-200" : "text-amber-200"}>
              {grant.status} · {grant.health}
            </span>
          </div>
          <p className="mt-1 text-slate-300">
            Shared by {grant.owner_label} · read only · actions unavailable
          </p>
          <p className="mt-1 text-slate-400">
            {grant.capability_ids.length} {grant.capability_ids.length === 1 ? "capability" : "capabilities"}
            {` · ${grant.member_count} ${grant.member_count === 1 ? "member" : "members"}`}
            {` · ${grant.freshness}`}
          </p>
          <p className="mt-1 text-slate-500">Expires {formatExpiry(grant.expires_at)}</p>
          {grant.blocking_reasons.length > 0 ? (
            <p className="mt-1 text-amber-200">Action required: {grant.blocking_reasons.join(", ")}</p>
          ) : (
            <p className="mt-1 text-emerald-200">Ready for a fresh governed room read</p>
          )}
          {grant.owner_controls_visible && grant.status === "active" ? (
            <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-capabilities-panel.revoke-shared-read-access"
              type="button"
              disabled={busy || roomClosed}
              onClick={() => void revoke(grant)}
              className="mt-2 inline-flex items-center gap-1 rounded border border-rose-300/30 px-2 py-1 text-rose-200 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" /> Revoke shared read access
            </button>
          ) : null}
        </article>
      ))}

      {projection && projection.grants.length === 0 ? (
        <p className="mt-2 text-[10px] text-slate-500">No environment capability is shared with this room.</p>
      ) : null}

      {isOwner && projection ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-capabilities-panel.profile-connection-to-share"
            aria-label="Profile connection to share"
            value={selectedConnection}
            disabled={busy || roomClosed || projection.available_connections.length === 0}
            onChange={(event) => setSelectedConnection(event.target.value)}
            className="min-w-0 flex-1 rounded border border-white/15 bg-slate-950 px-2 py-1 text-[10px] text-slate-200 disabled:opacity-50"
          >
            {projection.available_connections.length === 0 ? (
              <option value="">Connect a healthy read-only environment first</option>
            ) : null}
            {projection.available_connections.map((connection) => (
              <option key={connection.connection_ref} value={connection.connection_ref} disabled={!connection.ready}>
                {connection.environment_label} · {connection.health} · {connection.capability_ids.length} reads
              </option>
            ))}
          </select>
          <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-capabilities-panel.share-reads-for-1-hour"
            type="button"
            disabled={busy || roomClosed || !selectedConnection}
            onClick={() => void createGrant()}
            className="rounded border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-medium text-cyan-100 disabled:opacity-50"
          >
            Share reads for 1 hour
          </button>
        </div>
      ) : null}
      {message ? <p className="mt-2 text-[10px] text-cyan-100/75">{message}</p> : null}
    </div>
  );
}
