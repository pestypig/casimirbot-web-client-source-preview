import React from "react";
import {
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TrendingUp,
} from "lucide-react";
import type { HelixBrokerageConnection } from
  "@shared/helix-brokerage-environment";

type ConnectionList = {
  connections?: HelixBrokerageConnection[];
  error?: string;
  message?: string;
};

const CONNECTIONS_PATH = "/api/agi/brokerage-connections";

const json = async (response: Response): Promise<ConnectionList> => {
  const body = await response.json().catch(() => ({})) as ConnectionList;
  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? `brokerage ${response.status}`);
  }
  return body;
};

export function BrokerageConnectionsCard() {
  const [connections, setConnections] = React.useState<HelixBrokerageConnection[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [pendingOAuth, setPendingOAuth] = React.useState(false);
  const [authorizationUrl, setAuthorizationUrl] = React.useState<string | null>(null);
  const [armedDisconnect, setArmedDisconnect] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const body = await json(await fetch(CONNECTIONS_PATH, {
        credentials: "same-origin",
      }));
      const next = Array.isArray(body.connections) ? body.connections : [];
      setConnections(next);
      if (next.some((connection) => connection.status === "connected")) {
        setPendingOAuth(false);
        setAuthorizationUrl(null);
        setMessage("Robinhood read connection is active.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Robinhood connections.");
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!pendingOAuth) return;
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [pendingOAuth, refresh]);

  const connect = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const body = await json(await fetch(
        `${CONNECTIONS_PATH}/robinhood/oauth/start`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      )) as ConnectionList & { authorization_url?: string };
      const target = new URL(body.authorization_url ?? "");
      if (target.origin !== "https://robinhood.com") {
        throw new Error("Robinhood returned an untrusted authorization URL.");
      }
      setAuthorizationUrl(target.toString());
      setPendingOAuth(true);
      const nativeOpen = window.casimirDesktop?.openRobinhoodOAuth;
      const popup = nativeOpen
        ? (await nativeOpen(target.toString()), true)
        : Boolean(window.open(
            target.toString(),
            "casimirbot-robinhood-oauth",
            "popup,width=720,height=820,noopener,noreferrer",
          ));
      setMessage(
        popup
          ? "Finish authorization in the Robinhood window. This card will refresh automatically."
          : "Your browser blocked the Robinhood window. Use the secure authorization link below.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start Robinhood authorization.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (connectionId: string): Promise<void> => {
    if (armedDisconnect !== connectionId) {
      setArmedDisconnect(connectionId);
      setMessage("Press Disconnect again to remove local Robinhood access and every room binding.");
      return;
    }
    setBusy(true);
    try {
      await json(await fetch(
        `${CONNECTIONS_PATH}/${encodeURIComponent(connectionId)}`,
        { method: "DELETE", credentials: "same-origin" },
      ));
      setArmedDisconnect(null);
      setMessage("Robinhood disconnected from CasimirBot.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to disconnect Robinhood.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-400/5 p-3" data-testid="brokerage-connections-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200">
            <TrendingUp className="h-3.5 w-3.5" />
            Profile connections
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
            Link services to this profile without exposing their authorization to an agent. Robinhood is the first supported connector and grants sanitized reads only; live order authority is not included for user accounts.
          </p>
        </div>
        <div className="flex gap-2">
          <button data-helix-control-id="workstation.panel.account-session.brokerage-connections-card.refresh" data-helix-interaction-kind="observe" data-helix-authority-state="client_local"
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-xs text-slate-200 disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <button data-helix-control-id="workstation.panel.account-session.brokerage-connections-card.void-connect" data-helix-interaction-kind="act" data-helix-authority-state="client_local"
            type="button"
            disabled={busy || pendingOAuth}
            onClick={() => void connect()}
            className="inline-flex items-center gap-1 rounded border border-emerald-300/35 bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-100 disabled:opacity-50"
          >
            <ShieldCheck className="h-3 w-3" />
            {pendingOAuth ? "Authorization pending" : "Connect Robinhood"}
          </button>
        </div>
      </div>

      {authorizationUrl ? (
        <a data-helix-control-id="workstation.panel.account-session.brokerage-connections-card.continue-secure-authorization" data-helix-interaction-kind="act" data-helix-authority-state="client_local"
          href={authorizationUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            const nativeOpen = window.casimirDesktop?.openRobinhoodOAuth;
            if (!nativeOpen) return;
            event.preventDefault();
            void nativeOpen(authorizationUrl)
              .then(() => setMessage(
                "Finish authorization in Robinhood. This card will refresh automatically.",
              ))
              .catch(() => setMessage(
                "Unable to open the trusted Robinhood authorization page.",
              ));
          }}
          className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-200 underline"
        >
          Continue secure authorization <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}

      <div className="mt-3 space-y-2">
        {connections.length === 0 ? (
          <p className="text-xs text-slate-500">No Robinhood connection is stored for this profile.</p>
        ) : connections.map((connection) => (
          <div key={connection.connection_id} className="flex flex-wrap items-center gap-2 rounded border border-white/10 bg-slate-950/70 p-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-100">Robinhood · {connection.status}</p>
              <p className="mt-1 text-slate-400">
                {connection.capability_ids.length} read capabilities · orders disabled
                {connection.credential_expires_at
                  ? ` · token expires ${new Date(connection.credential_expires_at).toLocaleString()}`
                  : ""}
              </p>
            </div>
            <button data-helix-control-id="workstation.panel.account-session.brokerage-connections-card.void-disconnect-connection-connection-id" data-helix-interaction-kind="act" data-helix-authority-state="client_local"
              type="button"
              disabled={busy}
              onClick={() => void disconnect(connection.connection_id)}
              className="inline-flex items-center gap-1 rounded border border-rose-300/30 px-2 py-1 text-rose-200 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              {armedDisconnect === connection.connection_id ? "Confirm disconnect" : "Disconnect"}
            </button>
          </div>
        ))}
      </div>
      {message ? <p className="mt-2 text-xs text-cyan-100/75">{message}</p> : null}
    </section>
  );
}
