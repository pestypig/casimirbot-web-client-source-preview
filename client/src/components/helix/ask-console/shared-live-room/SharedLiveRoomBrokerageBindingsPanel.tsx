import React from "react";
import { RefreshCw, ShieldCheck, Trash2, TrendingUp } from "lucide-react";
import type {
  HelixBrokerageConnection,
  HelixBrokerageRoomBinding,
} from "@shared/helix-brokerage-environment";
import { SharedLiveRoomPaperTradingPanel } from
  "./SharedLiveRoomPaperTradingPanel";
import { readCachedAccountCapabilityPolicy } from
  "@/lib/workstation/accountCapabilityPolicy";

type BrokerageResponse = {
  connections?: HelixBrokerageConnection[];
  bindings?: HelixBrokerageRoomBinding[];
  message?: string;
  error?: string;
};

const readJson = async (response: Response): Promise<BrokerageResponse> => {
  const body = await response.json().catch(() => ({})) as BrokerageResponse;
  if (!response.ok) {
    const error = new Error(body.message ?? body.error ?? `brokerage ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body;
};

export function SharedLiveRoomBrokerageBindingsPanel({
  roomId,
  roomClosed,
  isOwner,
}: {
  roomId: string;
  roomClosed: boolean;
  isOwner: boolean;
}) {
  const [available, setAvailable] = React.useState(true);
  const [connections, setConnections] = React.useState<HelixBrokerageConnection[]>([]);
  const [bindings, setBindings] = React.useState<HelixBrokerageRoomBinding[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const accountPolicy = readCachedAccountCapabilityPolicy();
  const developerBrokerageControls = Boolean(
    accountPolicy?.account_type === "developer" &&
    accountPolicy.feature_flags.includes("brokerage_environment") &&
    !accountPolicy.locked_features.includes("brokerage_environment"),
  );

  const refresh = React.useCallback(async () => {
    if (!isOwner) return;
    try {
      const [connectionBody, bindingBody] = await Promise.all([
        readJson(await fetch("/api/agi/brokerage-connections", {
          credentials: "same-origin",
        })),
        readJson(await fetch(
          `/api/agi/brokerage-connections/rooms/${encodeURIComponent(roomId)}`,
          { credentials: "same-origin" },
        )),
      ]);
      const nextConnections = Array.isArray(connectionBody.connections)
        ? connectionBody.connections.filter((item) => item.status === "connected")
        : [];
      setConnections(nextConnections);
      setBindings(Array.isArray(bindingBody.bindings) ? bindingBody.bindings : []);
      setSelectedConnectionId((current) =>
        current && nextConnections.some((item) => item.connection_id === current)
          ? current
          : nextConnections[0]?.connection_id ?? "",
      );
      setAvailable(true);
    } catch (error) {
      if ((error as Error & { status?: number }).status === 403) {
        setAvailable(false);
        return;
      }
      setMessage(error instanceof Error ? error.message : "Unable to load room brokerage bindings.");
    }
  }, [isOwner, roomId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const attach = async (): Promise<void> => {
    if (!selectedConnectionId) return;
    setBusy(true);
    setMessage(null);
    try {
      await readJson(await fetch(
        `/api/agi/brokerage-connections/${encodeURIComponent(selectedConnectionId)}/room-bindings`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room_id: roomId }),
        },
      ));
      setMessage("Robinhood read capabilities attached to this owner-private room.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to attach Robinhood.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (binding: HelixBrokerageRoomBinding): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      await readJson(await fetch(
        `/api/agi/brokerage-connections/${encodeURIComponent(binding.connection_id)}/room-bindings/${encodeURIComponent(roomId)}`,
        { method: "DELETE", credentials: "same-origin" },
      ));
      setMessage("Robinhood read access revoked from this room.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to revoke Robinhood access.");
    } finally {
      setBusy(false);
    }
  };

  if (!isOwner || !available) return null;

  return (
    <div className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-400/5 p-3" data-testid="room-brokerage-bindings">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
            <TrendingUp className="h-3 w-3" /> Robinhood room environment
          </div>
          <p className="mt-1 text-[10px] leading-4 text-slate-400">
            Owner-private, sanitized reads only. Adding another participant suspends brokerage capabilities automatically.
          </p>
        </div>
        <button data-helix-interaction-kind="observe" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-brokerage-bindings-panel.refresh"
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-[10px] text-slate-300 disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {bindings.map((binding) => (
        <div key={binding.binding_id} className="mt-2 rounded border border-white/10 bg-slate-950/70 p-2 text-[10px]">
          <p className="font-medium text-slate-100">Robinhood · {binding.status}</p>
          <p className={binding.privacy_state === "owner_private" ? "mt-1 text-emerald-200" : "mt-1 text-amber-200"}>
            {binding.privacy_state === "owner_private"
              ? `${binding.capability_ids.length} read capabilities · orders disabled`
              : "Privacy invalidated · all room capabilities suspended"}
          </p>
          {binding.status === "active" ? (
            <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-brokerage-bindings-panel.revoke-room-access"
              type="button"
              disabled={busy || roomClosed}
              onClick={() => void revoke(binding)}
              className="mt-2 inline-flex items-center gap-1 rounded border border-rose-300/30 px-2 py-1 text-rose-200 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" /> Revoke room access
            </button>
          ) : null}
          {binding.status === "active" && binding.privacy_state === "owner_private" ? (
            <SharedLiveRoomPaperTradingPanel
              connectionId={binding.connection_id}
              roomId={roomId}
              disabled={busy || roomClosed}
              readOnly={!developerBrokerageControls}
            />
          ) : null}
        </div>
      ))}

      {bindings.length === 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-brokerage-bindings-panel.robinhood-connection-for-this-room"
            aria-label="Robinhood connection for this room"
            value={selectedConnectionId}
            disabled={busy || roomClosed || connections.length === 0}
            onChange={(event) => setSelectedConnectionId(event.target.value)}
            className="min-w-0 flex-1 rounded border border-white/15 bg-slate-950 px-2 py-1 text-[10px] text-slate-200 disabled:opacity-50"
          >
            {connections.length === 0 ? <option value="">Connect Robinhood in Account &amp; Sessions first</option> : null}
            {connections.map((connection) => (
              <option key={connection.connection_id} value={connection.connection_id}>
                Robinhood · connected · {connection.capability_ids.length} reads
              </option>
            ))}
          </select>
          <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-brokerage-bindings-panel.attach-read-access"
            type="button"
            disabled={busy || roomClosed || !selectedConnectionId}
            onClick={() => void attach()}
            className="inline-flex items-center gap-1 rounded border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-100 disabled:opacity-50"
          >
            <ShieldCheck className="h-3 w-3" /> Attach read access
          </button>
        </div>
      ) : null}
      {message ? <p className="mt-2 text-[10px] text-cyan-100/70">{message}</p> : null}
    </div>
  );
}
