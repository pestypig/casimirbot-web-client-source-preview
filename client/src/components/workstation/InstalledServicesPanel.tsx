import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CreditCard,
  KeyRound,
  Laptop,
  Link2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  helixInstalledAccountServicesSchema,
  type HelixInstalledAccountServices,
  type HelixInstalledConnectionClass,
} from "@shared/helix-installed-account-services";
import {
  helixLocalSupervisorStatusSchema,
  type HelixLocalSupervisorStatus,
} from "@shared/helix-local-supervisor";
import {
  DESKTOP_AUTH0_STEP_UP_CANCEL_PATH,
  DESKTOP_AUTH0_STEP_UP_START_PATH,
  DESKTOP_AUTH0_STEP_UP_STATUS_PATH,
  helixInstalledSecurityStatusSchema,
  helixStepUpCompletionProjectionSchema,
  helixStepUpCancelReceiptSchema,
  helixStepUpStartReceiptSchema,
  type HelixInstalledSecurityStatus,
  type HelixStepUpPurpose,
} from "@shared/desktop-auth0-step-up";
import { useRuntimeSurface } from "@/lib/runtime/RuntimeSurfaceProvider";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { BrokerageConnectionsCard } from
  "@/components/workstation/BrokerageConnectionsCard";
import {
  helixBillingEntitlementSchema,
  type HelixBillingEntitlement,
} from "@shared/helix-billing-entitlement";

const ENDPOINT = "/api/account/installed-services";
const BILLING_ENDPOINT = "/api/account/billing-entitlement";
const SUPERVISOR_ENDPOINT = "/api/local-supervisor/status";

const cancelPendingStepUp = async (): Promise<number> => {
  const response = await fetch(DESKTOP_AUTH0_STEP_UP_CANCEL_PATH, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const parsed = helixStepUpCancelReceiptSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!response.ok || !parsed.success) {
    throw new Error("The pending MFA request could not be cancelled.");
  }
  return parsed.data.cancelled_intent_count;
};

type PanelTab = "overview" | "connections" | "billing" | "security";

const TABS: ReadonlyArray<Readonly<{
  id: PanelTab;
  label: string;
}>> = [
  { id: "overview", label: "Overview" },
  { id: "connections", label: "Connections" },
  { id: "billing", label: "Billing" },
  { id: "security", label: "Device & Security" },
];

const statusTone = (status: string): string => {
  if (status === "ready" || status === "available" || status === "active") {
    return "border-emerald-300/35 bg-emerald-400/10 text-emerald-100";
  }
  if (status.includes("blocked") || status.includes("not_")) {
    return "border-amber-300/30 bg-amber-400/10 text-amber-100";
  }
  return "border-white/15 bg-white/5 text-slate-200";
};

function StatusPill({ value }: { value: string }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-[11px] ${statusTone(value)}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

function SummaryCard(props: {
  icon: ReactNode;
  title: string;
  status: string;
  detail: string;
}) {
  return (
    <article className="rounded-xl border border-white/10 bg-slate-950/65 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-slate-100">
          <span className="rounded-lg border border-white/10 bg-white/5 p-2 text-cyan-200">
            {props.icon}
          </span>
          <h3 className="text-sm font-semibold">{props.title}</h3>
        </div>
        <StatusPill value={props.status} />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">{props.detail}</p>
    </article>
  );
}

function ConnectionCard(props: {
  connection: HelixInstalledConnectionClass;
  openPanel: (panelId: string) => void;
}) {
  const { connection } = props;
  const actionLabel = connection.provider_id === "codex_app"
    ? "Open Agent Access"
    : connection.provider_id === "robinhood"
      ? "Manage below"
      : `Enrollment waits for ${connection.blocked_by_stage ?? "a later stage"}`;
  const actionable = connection.provider_id === "codex_app";
  return (
    <article className="rounded-lg border border-white/10 bg-black/25 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">{connection.label}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {connection.connection_type.replaceAll("_", " ")} · {connection.authentication_mode.replaceAll("_", " ")}
          </p>
        </div>
        <StatusPill value={connection.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-400">
          Raw secret entry: unavailable
        </span>
        <button
          data-helix-control-id={`workstation.panel.connections-billing-security.connection.${connection.provider_id}`}
          data-helix-interaction-kind="navigate"
          data-helix-authority-state="client_local"
          type="button"
          disabled={!actionable}
          onClick={() => {
            if (actionable) props.openPanel(connection.management_panel_id);
          }}
          className="rounded border border-cyan-300/30 px-2 py-1 text-cyan-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
        >
          {actionLabel}
        </button>
      </div>
    </article>
  );
}

export default function InstalledServicesPanel() {
  const runtime = useRuntimeSurface();
  const openPanel = useWorkstationLayoutStore((state) =>
    state.openPanelInActiveGroup);
  const [activeTab, setActiveTab] = useState<PanelTab>("overview");
  const [projection, setProjection] =
    useState<HelixInstalledAccountServices | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInRequired, setSignInRequired] = useState(false);
  const [securityStatus, setSecurityStatus] =
    useState<HelixInstalledSecurityStatus | null>(null);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityWaiting, setSecurityWaiting] = useState(false);
  const [securityCancelBusy, setSecurityCancelBusy] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [supervisorStatus, setSupervisorStatus] =
    useState<HelixLocalSupervisorStatus | null>(null);
  const [supervisorMessage, setSupervisorMessage] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] =
    useState<HelixBillingEntitlement | null>(null);

  const load = useCallback(async () => {
    if (runtime.surface !== "desktop_native" || runtime.nativeHandshake !== "ready") {
      return;
    }
    setLoading(true);
    setError(null);
    setSignInRequired(false);
    try {
      const response = await fetch(ENDPOINT, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        if (response.status === 401 && body && typeof body === "object" &&
            "error" in body && body.error === "profile_session_required") {
          setSignInRequired(true);
          throw new Error("Sign in to inspect this device's account services. Advanced management remains developer-only.");
        }
        const message = body && typeof body === "object" &&
          "message" in body && typeof body.message === "string"
          ? body.message
          : "Installed service status is unavailable.";
        throw new Error(message);
      }
      const parsed = helixInstalledAccountServicesSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error("Installed service status failed schema validation.");
      }
      setProjection(parsed.data);
    } catch (caught) {
      setProjection(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [runtime.nativeHandshake, runtime.surface]);

  const loadSecurity = useCallback(async () => {
    if (runtime.surface !== "desktop_native" || runtime.nativeHandshake !== "ready") {
      return;
    }
    try {
      const response = await fetch(DESKTOP_AUTH0_STEP_UP_STATUS_PATH, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const parsed = helixInstalledSecurityStatusSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!response.ok || !parsed.success) {
        throw new Error("Installed security status is unavailable.");
      }
      setSecurityStatus(parsed.data);
    } catch (caught) {
      setSecurityStatus(null);
      setSecurityMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }, [runtime.nativeHandshake, runtime.surface]);

  const loadSupervisor = useCallback(async () => {
    if (runtime.surface !== "desktop_native" || runtime.nativeHandshake !== "ready") {
      return;
    }
    setSupervisorMessage(null);
    try {
      const response = await fetch(SUPERVISOR_ENDPOINT, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const parsed = helixLocalSupervisorStatusSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!response.ok || !parsed.success) {
        throw new Error("Installed-node supervisor status is unavailable.");
      }
      setSupervisorStatus(parsed.data);
    } catch (caught) {
      setSupervisorStatus(null);
      setSupervisorMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }, [runtime.nativeHandshake, runtime.surface]);

  const loadBilling = useCallback(async () => {
    if (runtime.surface !== "desktop_native" || runtime.nativeHandshake !== "ready") return;
    try {
      const response = await fetch(BILLING_ENDPOINT, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const parsed = helixBillingEntitlementSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!response.ok || !parsed.success) throw new Error("Billing status is unavailable.");
      setBillingStatus(parsed.data);
    } catch {
      setBillingStatus(null);
    }
  }, [runtime.nativeHandshake, runtime.surface]);

  useEffect(() => {
    void load();
    void loadSecurity();
    void loadSupervisor();
    void loadBilling();
  }, [load, loadBilling, loadSecurity, loadSupervisor]);

  const supervisorReady = supervisorStatus?.ready === true &&
    supervisorStatus.one_instance_enforced === true &&
    (supervisorStatus.supervisor_mode === "desktop_single_instance" ||
      supervisorStatus.supervisor_mode === "external_keyed_launcher");
  const supervisorLabel = supervisorReady
    ? "ready"
    : supervisorStatus
      ? "not_protected"
      : "unavailable";
  const supervisorDetail = supervisorStatus?.supervisor_mode === "desktop_single_instance"
    ? "The installed EXE started and supervises one private CasimirBot node. Multiple authenticated Codex clients can attach without editing a launcher or entering a signing key."
    : supervisorStatus?.supervisor_mode === "external_keyed_launcher"
      ? "This development node has a verified signed launcher receipt. The product EXE performs the equivalent supervision automatically."
      : supervisorStatus
        ? "This service was started as an ordinary external process. Its running UI cannot retrofit parent-process authority; use the installed EXE or the approved keyed developer launcher."
        : "Supervisor verification has not completed. No private key, receipt, process identity, or workspace path is shown here.";

  useEffect(() => {
    const bridge = window.casimirDesktop;
    if (!bridge?.onAuth0StepUpCompletion) return;
    return bridge.onAuth0StepUpCompletion((candidate) => {
      const parsed = helixStepUpCompletionProjectionSchema.safeParse(candidate);
      if (!parsed.success) {
        setSecurityMessage("The native MFA completion was invalid.");
        setSecurityBusy(false);
        setSecurityWaiting(false);
        return;
      }
      setSecurityMessage(parsed.data.ok
        ? "Fresh MFA was verified and the exact security operation completed."
        : parsed.data.error === "authentication_clock_skew"
        ? "Security step-up failed: authentication_clock_skew. Sync Windows Date & time, close the old authentication tab, then start a fresh MFA attempt. No device authority was granted."
        : parsed.data.error === "authentication_stale"
        ? "Security step-up failed: authentication_stale. The signed authentication time is missing or too old. Close the old authentication tab and start a fresh MFA attempt; if this repeats, the account connection needs repair. No device authority was granted."
        : `Security step-up failed: ${parsed.data.error ?? "unknown error"}.`);
      setSecurityBusy(false);
      setSecurityWaiting(false);
      void loadSecurity();
    });
  }, [loadSecurity]);

  const startStepUp = useCallback(async (
    purpose: HelixStepUpPurpose,
    targetRef: string | null = null,
  ) => {
    const bridge = window.casimirDesktop;
    if (!bridge?.openAuth0StepUp) {
      setSecurityMessage("The trusted native MFA bridge is unavailable.");
      return;
    }
    setSecurityBusy(true);
    setSecurityWaiting(false);
    setSecurityMessage(null);
    let intentStarted = false;
    try {
      const response = await fetch(DESKTOP_AUTH0_STEP_UP_START_PATH, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, target_ref: targetRef }),
      });
      const body = await response.json().catch(() => null);
      const parsed = helixStepUpStartReceiptSchema.safeParse(body);
      if (!response.ok || !parsed.success) {
        const message = body && typeof body === "object" &&
          "message" in body && typeof body.message === "string"
          ? body.message
          : "Fresh MFA could not be started.";
        throw new Error(message);
      }
      intentStarted = true;
      const opened = await bridge.openAuth0StepUp(parsed.data.authorization_url);
      if (
        opened && typeof opened === "object" &&
        "cancelled" in opened && opened.cancelled === true
      ) {
        try {
          await cancelPendingStepUp();
          setSecurityBusy(false);
          setSecurityMessage("Security step-up was cancelled before opening Auth0.");
        } catch {
          setSecurityWaiting(true);
          setSecurityMessage("Native confirmation was cancelled, but its pending request could not be invalidated. Use Stop waiting for MFA before retrying.");
        }
      } else if (opened && typeof opened === "object" &&
          "opened" in opened && opened.opened === true) {
        setSecurityWaiting(true);
        setSecurityMessage("Complete the Auth0 MFA challenge in your browser.");
      } else {
        throw new Error("The native MFA bridge did not open Auth0.");
      }
    } catch (caught) {
      if (intentStarted) {
        try {
          await cancelPendingStepUp();
        } catch {
          setSecurityWaiting(true);
          setSecurityMessage("The native MFA attempt could not be opened or invalidated. Use Stop waiting for MFA before retrying.");
          return;
        }
      }
      setSecurityBusy(false);
      setSecurityWaiting(false);
      setSecurityMessage(
        caught instanceof Error && caught.message.includes("desktop_auth0_callback_port_unavailable")
          ? "CasimirBot cannot reserve its private Auth0 return port on this device. Close any other active CasimirBot authentication attempt, then retry."
          : caught instanceof Error && caught.message.includes("desktop_auth0_callback_route_unavailable")
          ? "This CasimirBot instance cannot receive its Auth0 callback because the desktop protocol is not routed to this exact profile. Use the registered installation or repair the protocol association before retrying."
          : caught instanceof Error ? caught.message : String(caught),
      );
    }
  }, []);

  const stopWaitingForStepUp = useCallback(async () => {
    setSecurityCancelBusy(true);
    try {
      const cancelled = await cancelPendingStepUp();
      setSecurityBusy(false);
      setSecurityWaiting(false);
      setSecurityMessage(cancelled > 0
        ? "The pending MFA request was invalidated. Close its old browser tab, then start a fresh attempt."
        : "No pending MFA request remains. Close the old browser tab, then start a fresh attempt.");
      void loadSecurity();
    } catch (caught) {
      setSecurityMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSecurityCancelBusy(false);
    }
  }, [loadSecurity]);

  const connectionByProvider = useMemo(() => new Map(
    projection?.connections.map((connection) => [
      connection.provider_id,
      connection,
    ]) ?? [],
  ), [projection]);

  if (runtime.surface !== "desktop_native") {
    return (
      <main className="flex min-h-full items-center justify-center bg-slate-950 p-6 text-slate-100">
        <section className="max-w-lg rounded-xl border border-cyan-300/20 bg-cyan-500/[0.06] p-6">
          <Laptop className="h-8 w-8 text-cyan-200" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">Installed app required</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Connections, billing, credential custody, and device security belong
            to the installed CasimirBot node. The website remains a demo and
            account surface and cannot operate this device harness.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-slate-950 p-4 text-slate-100" data-testid="installed-services-panel">
      <header className="rounded-xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-slate-950 to-violet-500/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
              Installed CasimirBot node
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Connections, Billing & Security</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              One place to distinguish Codex access, provider connections,
              subscription entitlement, this device, and bounded agent authority.
              Production payment and API-key enrollment remain unavailable; installed
              device security uses owner-attended Auth0 MFA.
            </p>
          </div>
          <button
            data-helix-control-id="workstation.panel.connections-billing-security.refresh"
            data-helix-interaction-kind="observe"
            data-helix-authority-state="client_local"
            type="button"
            onClick={() => void Promise.all([
              load(),
              loadSecurity(),
              loadSupervisor(),
              loadBilling(),
            ])}
            disabled={loading || runtime.nativeHandshake !== "ready"}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-xs text-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh status
          </button>
        </div>
        <div className="mt-4" aria-live="polite">
          {runtime.nativeHandshake === "pending" ? (
            <p className="text-xs text-cyan-100">Confirming the native host…</p>
          ) : error ? (
            <p role="alert" className="text-xs text-rose-200">{error}</p>
          ) : projection ? (
            <p className="text-xs text-emerald-200">
              Native status verified · no credential or payment instrument included
            </p>
          ) : null}
          {signInRequired ? (
            <button
              data-helix-control-id="workstation.panel.connections-billing-security.open.account-session"
              data-helix-interaction-kind="navigate"
              data-helix-authority-state="client_local"
              type="button"
              onClick={() => openPanel("account-session")}
              className="mt-2 rounded border border-cyan-300/40 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/10"
            >
              Open Account & Sessions
            </button>
          ) : null}
        </div>
      </header>

      <nav className="mt-4 overflow-x-auto" aria-label="Installed account services">
        <div
          className="inline-flex min-w-full gap-1 rounded-lg border border-white/10 bg-black/25 p-1"
          role="tablist"
          aria-label="Installed account services"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`installed-services-tab-${tab.id}`}
              data-helix-control-id={`workstation.panel.connections-billing-security.tab.${tab.id}`}
              data-helix-interaction-kind="navigate"
              data-helix-authority-state="client_local"
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`installed-services-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium ${
                activeTab === tab.id
                  ? "bg-cyan-400/15 text-cyan-50"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {activeTab === "overview" ? (
        <section id="installed-services-panel-overview" role="tabpanel" aria-labelledby="installed-services-tab-overview" className="mt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <SummaryCard
              icon={<Link2 className="h-4 w-4" />}
              title="Provider connections"
              status={projection ? "classified" : "unavailable"}
              detail="Codex app identity, OpenAI API access, fal, and environment-provider connections remain separate records."
            />
            <SummaryCard
              icon={<CreditCard className="h-4 w-4" />}
              title="Billing entitlement"
              status={billingStatus?.status ?? "unavailable"}
              detail="Stripe sandbox entitlement and integer-minor-unit credits remain separate from provider and agent authority."
            />
            <SummaryCard
              icon={<KeyRound className="h-4 w-4" />}
              title="Native credential vault"
              status={projection?.security.native_vault ?? "unavailable"}
              detail="The reusable master key stays in Electron; this service receives one-operation broker access only."
            />
            <SummaryCard
              icon={<Laptop className="h-4 w-4" />}
              title="Device registration"
              status={projection?.device.registration ?? "unavailable"}
              detail="This installation is local-only until SPB-3 adds fresh MFA and registered-device lifecycle authority."
            />
            <SummaryCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Installed node supervisor"
              status={supervisorLabel}
              detail={supervisorDetail}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["account-session", "Open Account & Sessions"],
              ["agent-access", "Open Agent Access"],
              ["image-lens", "Open Image Lens"],
            ].filter(([panelId]) => !signInRequired || panelId !== "account-session").map(([panelId, label]) => (
              <button
                key={panelId}
                data-helix-control-id={`workstation.panel.connections-billing-security.open.${panelId}`}
                data-helix-interaction-kind="navigate"
                data-helix-authority-state="client_local"
                type="button"
                onClick={() => openPanel(panelId)}
                className="rounded border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10"
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "connections" ? (
        <section id="installed-services-panel-connections" role="tabpanel" aria-labelledby="installed-services-tab-connections" className="mt-4">
          <div className="grid gap-3 lg:grid-cols-2">
            {projection?.connections.map((connection) => (
              <ConnectionCard
                key={connection.provider_id}
                connection={connection}
                openPanel={openPanel}
              />
            )) ?? (
              <p className="text-sm text-slate-400">Connection classification is unavailable.</p>
            )}
          </div>
          {connectionByProvider.get("robinhood")?.status === "available" ? (
            <div className="mt-4">
              <BrokerageConnectionsCard />
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === "billing" ? (
        <section id="installed-services-panel-billing" role="tabpanel" aria-labelledby="installed-services-tab-billing" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/[0.05] p-5">
          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 h-5 w-5 text-amber-200" />
            <div>
              <h2 className="text-base font-semibold">Stripe sandbox billing</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Signed raw-body webhooks feed an immutable USD-minor-unit ledger.
                Checkout remains hosted by Stripe; this panel contains no card,
                bank, customer, subscription, or processor-secret material.
              </p>
            </div>
          </div>
          {billingStatus ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Plan", billingStatus.plan_id ?? "none"],
                ["Available credit", `$${(billingStatus.balance.available_credit_minor / 100).toFixed(2)}`],
                ["Prepaid credit", `$${(billingStatus.balance.prepaid_credit_minor / 100).toFixed(2)}`],
                ["Hard ceiling", `$${(billingStatus.balance.hard_account_ceiling_minor / 100).toFixed(2)}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 text-sm font-medium text-slate-100">{value}</p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-4 space-y-2" aria-label="Recent billing ledger">
            {billingStatus?.recent_ledger.map((entry) => (
              <div key={entry.entry_ref} className="flex items-center justify-between rounded border border-white/10 p-3 text-xs">
                <span className="text-slate-300">{entry.kind.replaceAll("_", " ")}</span>
                <span className={entry.amount_minor >= 0 ? "text-emerald-200" : "text-rose-200"}>
                  {entry.amount_minor >= 0 ? "+" : "-"}${(Math.abs(entry.amount_minor) / 100).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={securityBusy || billingStatus?.checkout.available !== true}
              aria-disabled={securityBusy || billingStatus?.checkout.available !== true}
              onClick={() => void startStepUp("payment_change", "billing_checkout:plan:starter_monthly")}
              data-helix-control-id="workstation.panel.connections-billing-security.billing.checkout-plan"
              data-helix-interaction-kind="mutate"
              data-helix-authority-state="owner_auth_required"
              className="rounded border border-white/10 px-3 py-2 text-xs text-slate-300 disabled:text-slate-500"
            >
              Choose sandbox plan with MFA
            </button>
            <button
              type="button"
              disabled={securityBusy || billingStatus?.checkout.available !== true}
              aria-disabled={securityBusy || billingStatus?.checkout.available !== true}
              onClick={() => void startStepUp("payment_change", "billing_checkout:prepaid:500")}
              data-helix-control-id="workstation.panel.connections-billing-security.billing.checkout-prepaid"
              data-helix-interaction-kind="mutate"
              data-helix-authority-state="owner_auth_required"
              className="rounded border border-white/10 px-3 py-2 text-xs text-slate-300 disabled:text-slate-500"
            >
              Add sandbox credits with MFA
            </button>
            <button
              type="button"
              disabled={securityBusy || billingStatus?.portal.available !== true}
              aria-disabled={securityBusy || billingStatus?.portal.available !== true}
              onClick={() => void startStepUp("payment_change", "billing_portal:manage_subscription")}
              data-helix-control-id="workstation.panel.connections-billing-security.billing.manage-subscription"
              data-helix-interaction-kind="mutate"
              data-helix-authority-state="owner_auth_required"
              className="rounded border border-white/10 px-3 py-2 text-xs text-slate-300 disabled:text-slate-500"
            >
              Manage sandbox subscription with MFA
            </button>
          </div>
        </section>
      ) : null}

      {activeTab === "security" ? (
        <section id="installed-services-panel-security" role="tabpanel" aria-labelledby="installed-services-tab-security" className="mt-4 space-y-3">
          <SummaryCard
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Installed node supervisor"
            status={supervisorLabel}
            detail={supervisorDetail}
          />
          {supervisorMessage ? (
            <p role="status" aria-live="polite" className="rounded border border-amber-300/20 bg-amber-400/[0.05] p-3 text-xs text-amber-100">
              {supervisorMessage}
            </p>
          ) : null}
          <SummaryCard
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Credential isolation"
            status={projection?.security.native_vault ?? "unavailable"}
            detail="No raw credential field is rendered. Native key enrollment remains blocked until SPB-6 and requires SPB-3 step-up."
          />
          <SummaryCard
            icon={<LockKeyhole className="h-4 w-4" />}
            title="MFA and step-up"
            status={securityStatus?.mfa.fresh_step_up_available ? "available" : "unavailable"}
            detail="Auth0 owns factor enrollment. CasimirBot accepts only a fresh signed MFA ceremony and a one-use receipt bound to one device, session, and purpose."
          />
          <SummaryCard
            icon={<Laptop className="h-4 w-4" />}
            title={projection?.device.label ?? "This Windows device"}
            status={securityStatus?.current_device.status ?? "unavailable"}
            detail="Registration, recovery, and revocation require a native confirmation followed by fresh Auth0 MFA. The usable receipt never enters this panel."
          />
          {securityMessage ? (
            <p role="status" aria-live="polite" className="rounded border border-white/10 bg-white/5 p-3 text-xs text-slate-200">
              {securityMessage}
            </p>
          ) : null}
          {securityWaiting ? (
            <button
              type="button"
              disabled={securityCancelBusy}
              onClick={() => void stopWaitingForStepUp()}
              data-helix-control-id="workstation.panel.connections-billing-security.security.step-up-stop-waiting"
              data-helix-interaction-kind="mutate"
              data-helix-authority-state="owner_auth_required"
              className="rounded border border-amber-300/30 px-3 py-2 text-xs text-amber-100 disabled:opacity-50"
            >
              Stop waiting for MFA
            </button>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {securityStatus?.current_device.status === "unregistered" ? (
              <button
                type="button"
                disabled={securityBusy || !securityStatus.mfa.fresh_step_up_available}
                onClick={() => void startStepUp("device_register")}
                data-helix-control-id="workstation.panel.connections-billing-security.security.device-register"
                data-helix-interaction-kind="mutate"
                data-helix-authority-state="owner_auth_required"
                className="rounded border border-cyan-300/30 px-3 py-2 text-xs text-cyan-100 disabled:opacity-50"
              >
                Register this device with MFA
              </button>
            ) : null}
            {securityStatus?.current_device.status === "active" ? (
              <button
                type="button"
                disabled={securityBusy || !securityStatus.mfa.fresh_step_up_available}
                onClick={() => void startStepUp("device_revoke")}
                data-helix-control-id="workstation.panel.connections-billing-security.security.device-revoke"
                data-helix-interaction-kind="mutate"
                data-helix-authority-state="owner_auth_required"
                className="rounded border border-rose-300/30 px-3 py-2 text-xs text-rose-100 disabled:opacity-50"
              >
                Revoke this device with MFA
              </button>
            ) : null}
            {securityStatus && ["revoked", "recovery_required"].includes(
              securityStatus.current_device.status,
            ) ? (
              <button
                type="button"
                disabled={securityBusy || !securityStatus.mfa.fresh_step_up_available}
                onClick={() => void startStepUp("device_recover")}
                data-helix-control-id="workstation.panel.connections-billing-security.security.device-recover"
                data-helix-interaction-kind="mutate"
                data-helix-authority-state="owner_auth_required"
                className="rounded border border-amber-300/30 px-3 py-2 text-xs text-amber-100 disabled:opacity-50"
              >
                Recover this device with MFA
              </button>
            ) : null}
          </div>
          <section className="rounded-xl border border-white/10 bg-black/25 p-4" aria-labelledby="installed-security-sessions-title">
            <h2 id="installed-security-sessions-title" className="text-sm font-semibold">
              Profile sessions
            </h2>
            <div className="mt-3 space-y-2">
              {securityStatus?.sessions.map((session) => (
                <div key={session.session_ref} className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 p-3 text-xs">
                  <div>
                    <p className="text-slate-200">{session.current ? "Current installed session" : "Profile session"}</p>
                    <p className="mt-1 text-slate-500">{session.status} · updated {new Date(session.updated_at).toLocaleString()}</p>
                  </div>
                  {!session.current && session.status === "active" ? (
                    <button
                      type="button"
                      disabled={securityBusy || !securityStatus.mfa.fresh_step_up_available}
                      onClick={() => void startStepUp("session_revoke", session.session_ref)}
                      data-helix-control-id="workstation.panel.connections-billing-security.security.session-revoke"
                      data-helix-interaction-kind="mutate"
                      data-helix-authority-state="owner_auth_required"
                      className="rounded border border-rose-300/30 px-2 py-1 text-rose-100 disabled:opacity-50"
                    >
                      Revoke with MFA
                    </button>
                  ) : (
                    <StatusPill value={session.current ? "current" : session.status} />
                  )}
                </div>
              )) ?? <p className="text-xs text-slate-500">Session status is unavailable.</p>}
            </div>
          </section>
          <section className="rounded-xl border border-white/10 bg-black/25 p-4" aria-labelledby="installed-security-activity-title">
            <h2 id="installed-security-activity-title" className="text-sm font-semibold">
              Security activity
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Sanitized device and session lifecycle evidence. Authentication,
              factor, token, and receipt material is never included.
            </p>
            <div className="mt-3 space-y-2">
              {securityStatus?.recent_events.length ? securityStatus.recent_events.map((event) => (
                <div key={event.event_ref} className="rounded border border-white/10 p-3 text-xs">
                  <p className="text-slate-200">{event.event_type.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-slate-500">
                    {event.target_ref} · {new Date(event.created_at).toLocaleString()}
                  </p>
                </div>
              )) : (
                <p className="text-xs text-slate-500">No installed security activity yet.</p>
              )}
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}
