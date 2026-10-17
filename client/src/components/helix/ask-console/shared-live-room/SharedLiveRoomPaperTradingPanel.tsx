import React from "react";
import { CheckCircle2, OctagonX, Play, ShieldAlert } from "lucide-react";

type PaperAccount = {
  account_id: string;
  connection_id: string;
  room_id: string;
  account_equity_cents: number;
  buying_power_cents: number;
  new_trades_today: number;
  open_symbols: string[];
  kill_switch_active: boolean;
  kill_switch_reason: string | null;
  live_order_execution_enabled: false;
  message?: string;
  error?: string;
};

type PaperOrder = {
  order_id: string;
  symbol: string;
  intent: "entry" | "exit";
  status: "open" | "filled" | "cancelled";
  notional_cents: number;
};

type PaperPosition = {
  position_id: string;
  symbol: string;
  status: "open" | "closed";
  market_value_cents: number;
  unrealized_pnl_cents: number;
  stop_price_micros: number;
};

type PaperLifecycle = {
  orders: PaperOrder[];
  positions: PaperPosition[];
  fills: unknown[];
  journal: Array<{ event_id: string; event_type: string; created_at: string }>;
};

type BrokerageObservation = { observation_id: string };

type ReadAcceptanceReceipt = {
  receipts: Array<{ upstream_tool: string; observation_id: string }>;
  provider_order_tool_calls_made: 0;
  live_order_execution_enabled: false;
};

type LiveEquityPreview = {
  preview_id: string;
  risk_decision_id: string;
  approval_id: string | null;
  status: "reviewed" | "approved" | "expired" | "consumed" | "invalidated";
  intent: {
    symbol: string;
    side: "buy";
    quantity_micros: number;
    limit_price_micros: number;
    notional_cents: number;
  };
  provider_warnings: string[];
  approval_phrase: string;
  expires_at: string;
  live_order_execution_enabled: false;
};

type LiveEquityPreviewList = { previews: LiveEquityPreview[] };

type LiveTradingControl = {
  control_id: string;
  deployment_enabled: boolean;
  operator_armed: boolean;
  kill_switch_active: boolean;
  kill_switch_reason: string;
  protective_exit_ready: boolean;
  supervisor_heartbeat_at: string | null;
  supervisor_fresh: boolean;
  supervisor_status: "disabled" | "healthy" | "degraded";
  operator_presence_at: string | null;
  operator_present: boolean;
  attention_required: boolean;
  attention_reason: string | null;
  arming_phrase: string;
  new_entries_today: number;
  live_order_execution_enabled: boolean;
  policy: {
    max_entry_notional_cents: 2500;
    max_estimated_risk_cents: 100;
    max_daily_loss_cents: 300;
    max_new_entries_per_day: 1;
  };
};

type LiveExecution = {
  execution_id: string;
  approval_id: string;
  client_order_id: string;
  state: string;
  intent: { symbol: string; notional_cents: number };
  ambiguity_reason: string | null;
  reserved_at: string;
};

type LiveExecutionList = { executions: LiveExecution[] };

type LiveProviderContractPreflight = {
  acceptance_id: string;
  verdict: "pass" | "fail";
  catalog_hash: string;
  checked_at: string;
  expires_at: string;
  fresh: boolean;
  provider_order_tool_calls_made: 0;
  live_order_execution_enabled: false;
  gates: Array<{
    gate_id: string;
    tool_name: string;
    verdict: "pass" | "fail";
    reason_code: string;
    message: string;
    input_schema_hash: string | null;
  }>;
};

type LiveAcceptanceReadiness = {
  generated_at: string;
  read_acceptance_complete: boolean;
  safe_to_enable_live_flags: boolean;
  ready_to_start_attended_canary: boolean;
  ready_to_arm: boolean;
  acceptance_complete: boolean;
  unresolved_live_exposure_count: number;
  live_order_tool_calls_made: 0;
  gates: Array<{
    gate_id: string;
    verdict: "pass" | "pending" | "fail";
    reason_code: string;
    message: string;
  }>;
};

type LiveAcceptanceArchive = {
  archive_id: string;
  connection_id: string;
  room_id: string;
  control_id: string;
  evidence_hash: string;
  status: "accepted";
  accepted_at: string;
  reconciled_filled_entry_count: number;
  reconciled_filled_exit_count: number;
  unresolved_live_exposure_count: 0;
  live_flags_enabled: false;
  provider_order_tool_calls_made_by_archive: 0;
};

type ProtectiveExitPreview = {
  exit_preview_id: string;
  entry_execution_id: string;
  approval_id: string | null;
  status: "reviewed" | "approved" | "expired" | "consumed" | "invalidated";
  intent: {
    symbol: string;
    side: "sell";
    order_type: "stop" | "market";
    quantity_micros: number;
    stop_price_micros?: number;
  };
  provider_warnings: string[];
  approval_phrase: string;
  expires_at: string;
};

type ProtectiveExitExecution = {
  exit_execution_id: string;
  entry_execution_id: string;
  exit_approval_id: string;
  state: string;
  intent: { symbol: string; order_type: "stop" | "market";
    stop_price_micros?: number };
  ambiguity_reason: string | null;
};

type ProtectiveExitPreviewList = { previews: ProtectiveExitPreview[] };
type ProtectiveExitExecutionList = { executions: ProtectiveExitExecution[] };

const tradingDayInNewYork = (): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const money = (cents: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

export function SharedLiveRoomPaperTradingPanel({
  connectionId,
  roomId,
  disabled,
  readOnly = false,
}: {
  connectionId: string;
  roomId: string;
  disabled: boolean;
  readOnly?: boolean;
}) {
  const [account, setAccount] = React.useState<PaperAccount | null>(null);
  const [lifecycle, setLifecycle] = React.useState<PaperLifecycle | null>(null);
  const [startingDollars, setStartingDollars] = React.useState("");
  const [readProbeSymbol, setReadProbeSymbol] = React.useState("SPY");
  const [riskDecisionId, setRiskDecisionId] = React.useState("");
  const [approvalText, setApprovalText] = React.useState<Record<string, string>>({});
  const [livePreviews, setLivePreviews] = React.useState<LiveEquityPreview[]>([]);
  const [liveControl, setLiveControl] = React.useState<LiveTradingControl | null>(null);
  const [liveExecutions, setLiveExecutions] = React.useState<LiveExecution[]>([]);
  const [liveContractPreflight, setLiveContractPreflight] =
    React.useState<LiveProviderContractPreflight | null>(null);
  const [liveAcceptanceReadiness, setLiveAcceptanceReadiness] =
    React.useState<LiveAcceptanceReadiness | null>(null);
  const [liveAcceptanceArchive, setLiveAcceptanceArchive] =
    React.useState<LiveAcceptanceArchive | null>(null);
  const [protectivePreviews, setProtectivePreviews] = React.useState<ProtectiveExitPreview[]>([]);
  const [protectiveExecutions, setProtectiveExecutions] = React.useState<ProtectiveExitExecution[]>([]);
  const [armingText, setArmingText] = React.useState("");
  const [archiveConfirmationText, setArchiveConfirmationText] =
    React.useState("");
  const [placementText, setPlacementText] = React.useState<Record<string, string>>({});
  const [protectiveApprovalText, setProtectiveApprovalText] = React.useState<Record<string, string>>({});
  const [protectivePlacementText, setProtectivePlacementText] = React.useState<Record<string, string>>({});
  const [attendingLive, setAttendingLive] = React.useState(false);
  const [attendanceId, setAttendanceId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const basePath = `/api/agi/brokerage-connections/${encodeURIComponent(connectionId)}/rooms/${encodeURIComponent(roomId)}`;

  const request = React.useCallback(async <T,>(
    path: string,
    init?: RequestInit,
  ): Promise<T | null> => {
    const response = await fetch(`${basePath}/${path}`, {
      credentials: "same-origin",
      ...init,
    });
    const body = await response.json().catch(() => ({})) as T & {
      message?: string;
      error?: string;
    };
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(body.message ?? body.error ?? `paper trading ${response.status}`);
    }
    return body;
  }, [basePath]);

  const refreshLifecycle = React.useCallback(async (accountId: string) => {
    const [nextLifecycle, nextPreviews, nextControl, nextExecutions,
      nextProtectivePreviews, nextProtectiveExecutions,
      nextContractPreflight, nextAcceptanceReadiness,
      nextAcceptanceArchive] = await Promise.all([
      request<PaperLifecycle>(
        `paper-lifecycle?account_id=${encodeURIComponent(accountId)}`,
      ),
      request<LiveEquityPreviewList>("live-equity-previews"),
      request<LiveTradingControl>("live-control"),
      request<LiveExecutionList>("live-equity-executions"),
      request<ProtectiveExitPreviewList>("protective-exit-previews"),
      request<ProtectiveExitExecutionList>("protective-exit-executions"),
      request<LiveProviderContractPreflight>("live-contract-preflight"),
      request<LiveAcceptanceReadiness>("live-acceptance-readiness"),
      request<LiveAcceptanceArchive>("live-acceptance-archives/latest"),
    ]);
    setLifecycle(nextLifecycle);
    setLivePreviews(nextPreviews?.previews ?? []);
    setLiveControl(nextControl);
    setLiveExecutions(nextExecutions?.executions ?? []);
    setProtectivePreviews(nextProtectivePreviews?.previews ?? []);
    setProtectiveExecutions(nextProtectiveExecutions?.executions ?? []);
    setLiveContractPreflight(nextContractPreflight);
    setLiveAcceptanceReadiness(nextAcceptanceReadiness);
    setLiveAcceptanceArchive(nextAcceptanceArchive);
  }, [request]);

  const refresh = React.useCallback(async () => {
    try {
      const next = await request<PaperAccount>("paper-account");
      setAccount(next);
      if (next) await refreshLifecycle(next.account_id);
      else setLifecycle(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load paper trading.");
    }
  }, [refreshLifecycle, request]);

  React.useEffect(() => {
    if (readOnly) return;
    void refresh();
  }, [readOnly, refresh]);

  React.useEffect(() => {
    if (!attendingLive || !attendanceId ||
        !liveControl?.deployment_enabled) return undefined;
    let cancelled = false;
    const pulse = async (): Promise<void> => {
      if (document.visibilityState !== "visible") return;
      try {
        const control = await request<LiveTradingControl>("live-presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            control_id: liveControl.control_id,
            attendance_id: attendanceId,
            action: "heartbeat",
          }),
        });
        if (!cancelled && control) setLiveControl(control);
      } catch (error) {
        if (!cancelled) {
          setAttendingLive(false);
          setAttendanceId(null);
          setMessage(error instanceof Error ? error.message :
            "The attended live-session heartbeat stopped.");
        }
      }
    };
    void pulse();
    const timer = window.setInterval(() => void pulse(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [attendanceId, attendingLive, liveControl?.control_id,
    liveControl?.deployment_enabled, request]);

  const create = async (): Promise<void> => {
    const parsed = Number(startingDollars);
    const startingEquityCents = Math.round(parsed * 100);
    if (!Number.isFinite(parsed) || parsed <= 0 ||
        !Number.isSafeInteger(startingEquityCents)) {
      setMessage("Enter a valid positive paper bankroll in dollars.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const created = await request<PaperAccount>("paper-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starting_equity_cents: startingEquityCents,
          trading_day: tradingDayInNewYork(),
        }),
      });
      setAccount(created);
      if (created) await refreshLifecycle(created.account_id);
      setMessage("Paper risk account ready. Live order execution is still locked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create paper trading account.");
    } finally {
      setBusy(false);
    }
  };

  const setKillSwitch = async (active: boolean): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await request<PaperAccount>("paper-kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: account.account_id,
          active,
          reason: active
            ? "Operator stopped paper trading from the room control"
            : "Operator resumed paper trading from the room control",
        }),
      });
      setAccount(updated);
      setMessage(active
        ? "Paper risk evaluations stopped."
        : "Paper risk evaluations resumed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change the kill switch.");
    } finally {
      setBusy(false);
    }
  };

  const verifyReadOnlyAccess = async (): Promise<void> => {
    const symbol = readProbeSymbol.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/u.test(symbol)) {
      setMessage("Enter one valid quote-probe symbol.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const receipt = await request<ReadAcceptanceReceipt>("read-acceptance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_probe_symbol: symbol }),
      });
      if (!readOnly) await refresh();
      setMessage(receipt
        ? `${receipt.receipts.length} sanitized Robinhood read receipts recorded. No review or order tool was called.`
        : "Robinhood read acceptance returned no receipt.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message :
        "Unable to verify Robinhood read-only access.");
    } finally {
      setBusy(false);
    }
  };

  const readObservation = async (
    toolName: "get_equity_quotes" | "get_earnings_results",
    args: Record<string, unknown>,
  ): Promise<BrokerageObservation> => {
    const observation = await request<BrokerageObservation>("read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool_name: toolName,
        arguments: args,
      }),
    });
    if (!observation) throw new Error("Robinhood observation was unavailable.");
    return observation;
  };

  const readQuote = async (symbol: string): Promise<string> => {
    const observation = await readObservation(
      "get_equity_quotes", { symbols: [symbol] },
    );
    return observation.observation_id;
  };

  const stagePaperObserverCanary = async (): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      const symbol = "SPY";
      const quote = await readObservation(
        "get_equity_quotes", { symbols: [symbol] },
      );
      const earnings = await readObservation(
        "get_earnings_results", { symbol },
      );
      await request("paper-observer-canaries/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: account.account_id,
          symbol,
          notional_cents: 2_000,
          quote_observation_id: quote.observation_id,
          earnings_observation_id: earnings.observation_id,
          client_canary_id: `g8-${crypto.randomUUID()}`,
        }),
      });
      await refresh();
      setMessage("$20 SPY paper observer canary staged. No live order or provider mutation occurred.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message :
        "Unable to stage the paper observer canary.");
    } finally {
      setBusy(false);
    }
  };

  const processSymbol = async (symbol: string): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      const observationId = await readQuote(symbol);
      await request("paper-observations/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: account.account_id,
          observation_id: observationId,
          symbol,
        }),
      });
      await refresh();
      setMessage(`${symbol} paper orders and stops processed from a fresh Robinhood quote.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to process the paper quote.");
    } finally {
      setBusy(false);
    }
  };

  const closePosition = async (position: PaperPosition): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      const observationId = await readQuote(position.symbol);
      await request("paper-positions/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: account.account_id,
          position_id: position.position_id,
          client_order_id: `paper_ui_exit:${crypto.randomUUID()}`,
          observation_id: observationId,
        }),
      });
      await refresh();
      setMessage(`${position.symbol} paper position closed from a fresh bid.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to close the paper position.");
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (order: PaperOrder): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      await request("paper-orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: account.account_id,
          order_id: order.order_id,
        }),
      });
      await refresh();
      setMessage(`${order.symbol} paper entry cancelled and reserved cash released.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to cancel the paper order.");
    } finally {
      setBusy(false);
    }
  };

  const requestLivePreview = async (): Promise<void> => {
    if (!account || !riskDecisionId.trim()) {
      setMessage("Enter an accepted, fresh risk-decision ID first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const preview = await request<LiveEquityPreview>("live-equity-previews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: account.account_id,
          risk_decision_id: riskDecisionId.trim(),
          client_preview_id: `live_preview_ui:${crypto.randomUUID()}`,
        }),
      });
      await refreshLifecycle(account.account_id);
      setMessage(preview
        ? `Robinhood reviewed ${preview.intent.symbol}. No order was placed; the review expires in 90 seconds.`
        : "Robinhood review was unavailable.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to request the Robinhood review.");
    } finally {
      setBusy(false);
    }
  };

  const approveLivePreview = async (preview: LiveEquityPreview): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      await request(`live-equity-previews/${encodeURIComponent(preview.preview_id)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_text: approvalText[preview.preview_id] ?? "" }),
      });
      await refreshLifecycle(account.account_id);
      setMessage(
        `${preview.intent.symbol} review approved once. Placement still requires a separately armed live control and exact placement confirmation.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to approve the Robinhood review.");
    } finally {
      setBusy(false);
    }
  };

  const updateLiveControl = async (action: "arm" | "stop"): Promise<void> => {
    if (!account || !liveControl) return;
    setBusy(true);
    setMessage(null);
    try {
      await request<LiveTradingControl>("live-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          confirmation_text: action === "arm" ? armingText : "STOP",
          reason: action === "arm"
            ? "Operator explicitly armed one tiny live equity entry from the private room"
            : "Operator activated the live equity kill switch from the private room",
        }),
      });
      await refreshLifecycle(account.account_id);
      setMessage(action === "arm"
        ? "Live entry armed for this private room. One approved order may be placed."
        : "Live placement stopped. This does not cancel or sell an existing Robinhood order or position.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change live controls.");
    } finally {
      setBusy(false);
    }
  };

  const toggleAttendedLiveSession = async (): Promise<void> => {
    if (!attendingLive) {
      if (!liveControl) return;
      const nextAttendanceId = attendanceId ??
        `live_attendance:${crypto.randomUUID()}`;
      // Retain the pending generation across a lost HTTP response so retrying
      // start remains idempotent instead of racing the already-created lease.
      setAttendanceId(nextAttendanceId);
      setBusy(true);
      setMessage(null);
      try {
        const control = await request<LiveTradingControl>("live-presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            control_id: liveControl.control_id,
            attendance_id: nextAttendanceId,
            action: "start",
          }),
        });
        if (control) setLiveControl(control);
        const readiness = await request<LiveAcceptanceReadiness>(
          "live-acceptance-readiness",
        );
        setLiveAcceptanceReadiness(readiness);
        setAttendingLive(true);
        setMessage("Attended live session started. Visibility heartbeats expire after ten seconds.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message :
          "Unable to start the attended live session.");
      } finally {
        setBusy(false);
      }
      return;
    }

    const endingAttendanceId = attendanceId;
    setAttendingLive(false);
    setAttendanceId(null);
    if (!liveControl || !endingAttendanceId) return;
    setBusy(true);
    setMessage(null);
    try {
      const control = await request<LiveTradingControl>("live-presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          control_id: liveControl.control_id,
          attendance_id: endingAttendanceId,
          action: "end",
        }),
      });
      if (control) setLiveControl(control);
      const readiness = await request<LiveAcceptanceReadiness>(
        "live-acceptance-readiness",
      );
      setLiveAcceptanceReadiness(readiness);
      setMessage("Attended live session ended. Placement is disarmed and the kill switch is active.");
    } catch (error) {
      setMessage(error instanceof Error
        ? `${error.message} The stopped heartbeat will still trigger the dead-man relock.`
        : "The stopped heartbeat will trigger the dead-man relock.");
    } finally {
      setBusy(false);
    }
  };

  const checkLiveProviderContracts = async (): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      const receipt = await request<LiveProviderContractPreflight>(
        "live-contract-preflight",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation_text: "CHECK ROBINHOOD LIVE CONTRACTS",
          }),
        },
      );
      setLiveContractPreflight(receipt);
      setMessage(receipt?.verdict === "pass"
        ? "Robinhood MCP contracts passed the read-only gate. No provider order tool was called."
        : "Robinhood MCP contract drift was detected. Live arming remains locked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message :
        "Unable to inspect Robinhood's live provider contracts.");
    } finally {
      setBusy(false);
    }
  };

  const archiveLiveAcceptance = async (): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      const archive = await request<LiveAcceptanceArchive>(
        "live-acceptance-archives",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation_text: archiveConfirmationText,
          }),
        },
      );
      setLiveAcceptanceArchive(archive);
      setMessage(archive
        ? "Sanitized live acceptance archived with both live flags off. No provider order tool was called by the archive."
        : "The live-acceptance archive was unavailable.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message :
        "Unable to archive Robinhood live acceptance.");
    } finally {
      setBusy(false);
    }
  };

  const placeApprovedOrder = async (preview: LiveEquityPreview): Promise<void> => {
    if (!account || !preview.approval_id) return;
    setBusy(true);
    setMessage(null);
    try {
      const execution = await request<LiveExecution>("live-equity-executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approval_id: preview.approval_id,
          client_order_id: `casimir_live:${crypto.randomUUID()}`,
          placement_confirmation_text: placementText[preview.approval_id] ?? "",
        }),
      });
      await refreshLifecycle(account.account_id);
      setMessage(execution
        ? `Robinhood placement attempt recorded as ${execution.state}. Live placement is now locked pending reconciliation.`
        : "The live placement attempt returned no execution receipt.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to place the approved live order.");
    } finally {
      setBusy(false);
    }
  };

  const reconcileExecution = async (execution: LiveExecution): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await request<LiveExecution>(
        `live-equity-executions/${encodeURIComponent(execution.execution_id)}/reconcile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation_text: `RECONCILE ROBINHOOD ORDER ${execution.execution_id}`,
          }),
        },
      );
      await refreshLifecycle(account.account_id);
      setMessage(next
        ? `Robinhood order reconciliation state: ${next.state}.`
        : "The reconciliation returned no execution state.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reconcile the live order.");
    } finally {
      setBusy(false);
    }
  };

  const cancelLiveExecution = async (execution: LiveExecution): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await request<LiveExecution>(
        `live-equity-executions/${encodeURIComponent(execution.execution_id)}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation_text: `CANCEL ROBINHOOD ORDER ${execution.execution_id}`,
          }),
        },
      );
      await refreshLifecycle(account.account_id);
      setMessage(next
        ? "Cancellation was attempted once. Confirm the final state by reconciling from Robinhood."
        : "The cancellation attempt returned no execution state.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message :
        "Unable to cancel the live Robinhood order.");
    } finally {
      setBusy(false);
    }
  };

  const requestProtectiveExit = async (
    execution: LiveExecution,
    exitKind: "protective_stop" | "market_close",
  ): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      const preview = await request<ProtectiveExitPreview>(
        "protective-exit-previews",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entry_execution_id: execution.execution_id,
            client_preview_id: `protective_exit_ui:${crypto.randomUUID()}`,
            exit_kind: exitKind,
          }),
        },
      );
      await refreshLifecycle(account.account_id);
      setMessage(preview
        ? `Robinhood reviewed the ${preview.intent.symbol} ${preview.intent.order_type === "stop" ? "protective stop" : "market close"}. No sell order was placed.`
        : "The live-exit review returned no preview.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message :
        "Unable to review the protective stop.");
    } finally {
      setBusy(false);
    }
  };

  const approveProtectiveExit = async (
    preview: ProtectiveExitPreview,
  ): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      await request(
        `protective-exit-previews/${encodeURIComponent(preview.exit_preview_id)}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approval_text: protectiveApprovalText[preview.exit_preview_id] ?? "",
          }),
        },
      );
      await refreshLifecycle(account.account_id);
      setMessage("Protective stop approved once. It still requires exact placement confirmation.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message :
        "Unable to approve the protective stop.");
    } finally {
      setBusy(false);
    }
  };

  const placeProtectiveExit = async (
    preview: ProtectiveExitPreview,
  ): Promise<void> => {
    if (!account || !preview.approval_id) return;
    setBusy(true);
    setMessage(null);
    try {
      const execution = await request<ProtectiveExitExecution>(
        "protective-exit-executions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exit_approval_id: preview.approval_id,
            client_order_id: `protective_exit:${crypto.randomUUID()}`,
            placement_confirmation_text:
              protectivePlacementText[preview.approval_id] ?? "",
          }),
        },
      );
      await refreshLifecycle(account.account_id);
      setMessage(execution
        ? `Protective stop placement recorded as ${execution.state}; reconcile it from Robinhood.`
        : "The protective stop returned no execution receipt.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message :
        "Unable to place the protective stop.");
    } finally {
      setBusy(false);
    }
  };

  const reconcileProtectiveExit = async (
    execution: ProtectiveExitExecution,
  ): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await request<ProtectiveExitExecution>(
        `protective-exit-executions/${encodeURIComponent(execution.exit_execution_id)}/reconcile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation_text:
              `RECONCILE LIVE EXIT ${execution.exit_execution_id}`,
          }),
        },
      );
      await refreshLifecycle(account.account_id);
      setMessage(next
        ? `Protective-stop reconciliation state: ${next.state}.`
        : "The protective-stop reconciliation returned no state.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message :
        "Unable to reconcile the protective stop.");
    } finally {
      setBusy(false);
    }
  };

  const cancelProtectiveExit = async (
    execution: ProtectiveExitExecution,
  ): Promise<void> => {
    if (!account) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await request<ProtectiveExitExecution>(
        `protective-exit-executions/${encodeURIComponent(execution.exit_execution_id)}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation_text:
              `CANCEL LIVE EXIT ${execution.exit_execution_id}`,
          }),
        },
      );
      await refreshLifecycle(account.account_id);
      setMessage(next
        ? "Protective-stop cancellation was attempted once; reconcile the final Robinhood state."
        : "The protective-stop cancellation returned no state.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message :
        "Unable to cancel the protective stop.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded border border-cyan-300/20 bg-cyan-400/5 p-2" data-testid="room-paper-trading">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-cyan-200">
        <ShieldAlert className="h-3 w-3" /> {readOnly
          ? "Profile connection read access"
          : "Deterministic paper risk"}
      </div>
      <div className="mt-2 rounded border border-emerald-300/20 bg-emerald-400/5 p-1.5">
        <p className="font-semibold text-emerald-100">
          Robinhood read-only acceptance
        </p>
        <p className="mt-1 text-slate-400">
          Selects only the account Robinhood marks agentic_allowed, then records five sanitized account/market receipts. It calls no review, placement, cancellation, option, crypto, transfer, or watchlist tool. A paper account is not required.
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <input data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.read-only-quote-probe-symbol"
            aria-label="Read-only quote probe symbol"
            value={readProbeSymbol}
            onChange={(event) => setReadProbeSymbol(event.target.value.toUpperCase())}
            disabled={busy || disabled}
            className="w-24 rounded border border-white/15 bg-slate-950 px-2 py-1 text-slate-100 disabled:opacity-50"
          />
          <button data-helix-interaction-kind="observe" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.verify-read-only-access" type="button" onClick={() => void verifyReadOnlyAccess()}
            disabled={busy || disabled}
            className="rounded border border-emerald-300/30 px-2 py-1 text-emerald-100 disabled:opacity-50">
            Verify read-only access
          </button>
        </div>
      </div>
      {!readOnly ? <>
      {!account ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-1 text-[10px] text-slate-300">
            Paper bankroll $
            <input data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.paper-bankroll-in-dollars"
              aria-label="Paper bankroll in dollars"
              inputMode="decimal"
              value={startingDollars}
              onChange={(event) => setStartingDollars(event.target.value)}
              placeholder="340.00"
              disabled={busy || disabled}
              className="min-w-20 flex-1 rounded border border-white/15 bg-slate-950 px-2 py-1 text-slate-100 disabled:opacity-50"
            />
          </label>
          <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.create-paper-account"
            type="button"
            onClick={() => void create()}
            disabled={busy || disabled}
            className="rounded border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-100 disabled:opacity-50"
          >
            Create paper account
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px]">
          <div className="text-slate-300">
            <p>Equity {money(account.account_equity_cents)} · buying power {money(account.buying_power_cents)}</p>
            <p className={account.kill_switch_active ? "mt-1 text-rose-200" : "mt-1 text-emerald-200"}>
              {account.kill_switch_active
                ? `Stopped · ${account.kill_switch_reason ?? "operator kill switch"}`
                : `${account.new_trades_today} paper trades today · ${account.open_symbols.length} open · live orders locked`}
            </p>
          </div>
          <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.void-set-kill-switch-account-kill-switch-active"
            type="button"
            disabled={busy || disabled}
            onClick={() => void setKillSwitch(!account.kill_switch_active)}
            className={account.kill_switch_active
              ? "inline-flex items-center gap-1 rounded border border-emerald-300/30 px-2 py-1 text-emerald-100 disabled:opacity-50"
              : "inline-flex items-center gap-1 rounded border border-rose-300/30 px-2 py-1 text-rose-100 disabled:opacity-50"}
          >
            {account.kill_switch_active
              ? <><Play className="h-3 w-3" /> Resume paper risk</>
              : <><OctagonX className="h-3 w-3" /> Stop paper risk</>}
          </button>
        </div>
      )}
      {account && lifecycle ? (
        <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2 text-[10px]">
          <p className="text-slate-400">
            {lifecycle.orders.length} orders · {lifecycle.fills.length} fills · {lifecycle.journal.length} journal events
          </p>
          {lifecycle.orders.length === 0 && lifecycle.positions.length === 0 ? (
            <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.stage-20-spy-paper-observer-canary" type="button" disabled={busy || disabled || account.kill_switch_active}
              onClick={() => void stagePaperObserverCanary()}
              className="rounded border border-cyan-300/30 px-1.5 py-0.5 text-cyan-100 disabled:opacity-50">
              Stage $20 SPY paper observer canary
            </button>
          ) : null}
          {lifecycle.orders.filter((order) => order.intent === "entry" && order.status === "open").map((order) => (
            <div key={order.order_id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-950/60 p-1.5">
              <span className="text-slate-300">{order.symbol} entry open · {money(order.notional_cents)}</span>
              <div className="flex gap-1">
                <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.process-fresh-quote" type="button" disabled={busy || disabled} onClick={() => void processSymbol(order.symbol)} className="rounded border border-cyan-300/30 px-1.5 py-0.5 text-cyan-100 disabled:opacity-50">
                  Process fresh quote
                </button>
                <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.cancel" type="button" disabled={busy || disabled} onClick={() => void cancelOrder(order)} className="rounded border border-rose-300/30 px-1.5 py-0.5 text-rose-100 disabled:opacity-50">
                  Cancel
                </button>
              </div>
            </div>
          ))}
          {lifecycle.positions.filter((position) => position.status === "open").map((position) => (
            <div key={position.position_id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-950/60 p-1.5">
              <span className="text-slate-300">
                {position.symbol} {money(position.market_value_cents)} · P&amp;L {money(position.unrealized_pnl_cents)}
              </span>
              <div className="flex gap-1">
                <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.mark-check-stop" type="button" disabled={busy || disabled} onClick={() => void processSymbol(position.symbol)} className="rounded border border-cyan-300/30 px-1.5 py-0.5 text-cyan-100 disabled:opacity-50">
                  Mark / check stop
                </button>
                <button data-helix-interaction-kind="navigate" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.close-paper-position" type="button" disabled={busy || disabled} onClick={() => void closePosition(position)} className="rounded border border-rose-300/30 px-1.5 py-0.5 text-rose-100 disabled:opacity-50">
                  Close paper position
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {account ? (
        <div className="mt-2 border-t border-amber-300/20 pt-2 text-[10px]" data-testid="room-live-equity-preview">
          <p className="font-semibold uppercase tracking-[0.1em] text-amber-200">
            Robinhood review + one-time approval
          </p>
          <p className="mt-1 text-slate-400">
            Developer-only live boundary. Reviews expire in 90 seconds; approval alone never places an order.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <input data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.accepted-risk-decision-id"
              aria-label="Accepted risk decision ID"
              value={riskDecisionId}
              onChange={(event) => setRiskDecisionId(event.target.value)}
              placeholder="risk_decision:..."
              disabled={busy || disabled || account.kill_switch_active}
              className="min-w-48 flex-1 rounded border border-white/15 bg-slate-950 px-2 py-1 text-slate-100 disabled:opacity-50"
            />
            <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.request-robinhood-review"
              type="button"
              onClick={() => void requestLivePreview()}
              disabled={busy || disabled || account.kill_switch_active}
              className="rounded border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-amber-100 disabled:opacity-50"
            >
              Request Robinhood review
            </button>
          </div>
          <div className="mt-2 space-y-1.5">
            {livePreviews.map((preview) => (
              <div key={preview.preview_id} className="rounded border border-white/10 bg-slate-950/60 p-1.5">
                <p className="text-slate-200">
                  {preview.intent.side.toUpperCase()} {(preview.intent.quantity_micros / 1_000_000).toFixed(6).replace(/\.?0+$/u, "")} {preview.intent.symbol}
                  {" "}@ limit {(preview.intent.limit_price_micros / 1_000_000).toFixed(6).replace(/\.?0+$/u, "")}
                  {" "}· {preview.status} · expires {new Date(preview.expires_at).toLocaleTimeString()}
                </p>
                {preview.provider_warnings.map((warning) => (
                  <p key={warning} className="mt-1 text-amber-200">Robinhood warning: {warning}</p>
                ))}
                {preview.status === "reviewed" ? (
                  <div className="mt-1.5 space-y-1">
                    <p className="break-all font-mono text-[9px] text-slate-400">Type exactly: {preview.approval_phrase}</p>
                    <div className="flex flex-wrap gap-1">
                      <input data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.input"
                        aria-label={`Approval text for ${preview.intent.symbol}`}
                        value={approvalText[preview.preview_id] ?? ""}
                        onChange={(event) => setApprovalText((current) => ({
                          ...current,
                          [preview.preview_id]: event.target.value,
                        }))}
                        disabled={busy || disabled}
                        className="min-w-48 flex-1 rounded border border-white/15 bg-slate-950 px-2 py-1 font-mono text-[9px] text-slate-100 disabled:opacity-50"
                      />
                      <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.approve-once"
                        type="button"
                        onClick={() => void approveLivePreview(preview)}
                        disabled={busy || disabled || approvalText[preview.preview_id] !== preview.approval_phrase}
                        className="inline-flex items-center gap-1 rounded border border-amber-300/30 px-2 py-1 text-amber-100 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Approve once
                      </button>
                    </div>
                  </div>
                ) : null}
                {preview.status === "approved" && preview.approval_id ? (
                  <div className="mt-1.5 space-y-1">
                    <p className="break-all font-mono text-[9px] text-rose-300">
                      To move real money, type exactly: PLACE APPROVED ORDER {preview.approval_id}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <input data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.input.2"
                        aria-label={`Live placement text for ${preview.intent.symbol}`}
                        value={placementText[preview.approval_id] ?? ""}
                        onChange={(event) => setPlacementText((current) => ({
                          ...current,
                          [preview.approval_id!]: event.target.value,
                        }))}
                        disabled={busy || disabled ||
                          !liveControl?.live_order_execution_enabled ||
                          liveContractPreflight?.verdict !== "pass" ||
                          liveContractPreflight?.fresh !== true}
                        className="min-w-48 flex-1 rounded border border-rose-300/20 bg-slate-950 px-2 py-1 font-mono text-[9px] text-slate-100 disabled:opacity-50"
                      />
                      <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.place-real-order-once"
                        type="button"
                        onClick={() => void placeApprovedOrder(preview)}
                        disabled={busy || disabled ||
                          !liveControl?.live_order_execution_enabled ||
                          liveContractPreflight?.verdict !== "pass" ||
                          liveContractPreflight?.fresh !== true ||
                          placementText[preview.approval_id] !==
                            `PLACE APPROVED ORDER ${preview.approval_id}`}
                        className="rounded border border-rose-300/40 bg-rose-400/10 px-2 py-1 text-rose-100 disabled:opacity-50"
                      >
                        Place real order once
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {liveAcceptanceReadiness ? (
            <div className="mt-2 rounded border border-amber-300/20 bg-amber-400/5 p-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <p className="font-semibold text-amber-100">
                  Live acceptance evidence
                </p>
                <span className={liveAcceptanceReadiness.acceptance_complete
                  ? "text-emerald-200" : "text-amber-200"}>
                  {liveAcceptanceReadiness.acceptance_complete
                    ? "ACCEPTED" : liveAcceptanceReadiness.ready_to_arm
                      ? "READY TO ARM" : liveAcceptanceReadiness.ready_to_start_attended_canary
                        ? "READY FOR ATTENDED CANARY"
                        : liveAcceptanceReadiness.safe_to_enable_live_flags
                          ? "READ ACCEPTED · SAFE TO ENABLE CANARY FLAGS"
                          : "INCOMPLETE"}
                </span>
              </div>
              <p className="mt-1 text-slate-400">
                Evidence report only · order tool calls {liveAcceptanceReadiness.live_order_tool_calls_made} · unresolved exposure {liveAcceptanceReadiness.unresolved_live_exposure_count}
              </p>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {liveAcceptanceReadiness.gates.map((gate) => (
                  <div key={gate.gate_id}
                    className="rounded border border-white/10 bg-slate-950/60 p-1">
                    <span className={gate.verdict === "pass"
                      ? "text-emerald-200" : gate.verdict === "fail"
                        ? "text-rose-200" : "text-amber-200"}>
                      {gate.verdict.toUpperCase()} · {gate.gate_id}
                    </span>
                    <p className="text-slate-500">{gate.message}</p>
                  </div>
                ))}
              </div>
              {liveAcceptanceArchive ? (
                <div className="mt-1.5 rounded border border-emerald-300/20 bg-emerald-400/5 p-1">
                  <p className="text-emerald-200">
                    ARCHIVED · {new Date(liveAcceptanceArchive.accepted_at).toLocaleString()} · entry {liveAcceptanceArchive.reconciled_filled_entry_count} · exit {liveAcceptanceArchive.reconciled_filled_exit_count} · unresolved 0
                  </p>
                  <p className="break-all font-mono text-[9px] text-slate-500">
                    {liveAcceptanceArchive.evidence_hash}
                  </p>
                </div>
              ) : liveAcceptanceReadiness.acceptance_complete &&
                  liveControl?.deployment_enabled === false ? (
                    <div className="mt-1.5 space-y-1">
                      <p className="text-slate-400">
                        Both live flags are off. Type the exact phrase to seal the sanitized acceptance evidence; this calls no provider order tool.
                      </p>
                      <p className="break-all font-mono text-[9px] text-slate-400">
                        Type exactly: ARCHIVE ROBINHOOD LIVE ACCEPTANCE {connectionId} {roomId}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <input data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.live-acceptance-archive-confirmation" aria-label="Live acceptance archive confirmation"
                          value={archiveConfirmationText}
                          onChange={(event) => setArchiveConfirmationText(event.target.value)}
                          disabled={busy || disabled}
                          className="min-w-48 flex-1 rounded border border-white/15 bg-slate-950 px-2 py-1 font-mono text-[9px] text-slate-100 disabled:opacity-50" />
                        <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.archive-accepted-canary" type="button" onClick={() => void archiveLiveAcceptance()}
                          disabled={busy || disabled || archiveConfirmationText !==
                            `ARCHIVE ROBINHOOD LIVE ACCEPTANCE ${connectionId} ${roomId}`}
                          className="rounded border border-emerald-300/30 px-2 py-1 text-emerald-100 disabled:opacity-50">
                          Archive accepted canary
                        </button>
                      </div>
                    </div>
                  ) : null}
            </div>
          ) : null}
          <div className="mt-2 rounded border border-cyan-300/20 bg-cyan-400/5 p-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <div>
                <p className="font-semibold text-cyan-100">
                  Robinhood live contract preflight
                </p>
                <p className="text-slate-400">
                  Lists and validates MCP schemas only; it calls no review, placement, or cancellation tool.
                </p>
              </div>
              <button data-helix-interaction-kind="observe" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.check-provider-contracts" type="button" onClick={() => void checkLiveProviderContracts()}
                disabled={busy || disabled}
                className="rounded border border-cyan-300/30 px-2 py-1 text-cyan-100 disabled:opacity-50">
                Check provider contracts
              </button>
            </div>
            {liveContractPreflight ? (
              <div className="mt-1.5 space-y-1">
                <p className={liveContractPreflight.verdict === "pass" &&
                    liveContractPreflight.fresh
                  ? "text-emerald-200" : "text-rose-200"}>
                  {liveContractPreflight.verdict.toUpperCase()} · {liveContractPreflight.fresh
                    ? `valid until ${new Date(liveContractPreflight.expires_at).toLocaleString()}`
                    : "expired"} · provider order tool calls {liveContractPreflight.provider_order_tool_calls_made}
                </p>
                <p className="break-all font-mono text-[9px] text-slate-500">
                  Catalog {liveContractPreflight.catalog_hash}
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {liveContractPreflight.gates.map((gate) => (
                    <div key={gate.gate_id}
                      className="rounded border border-white/10 bg-slate-950/60 p-1">
                      <span className={gate.verdict === "pass"
                        ? "text-emerald-200" : "text-rose-200"}>
                        {gate.verdict === "pass" ? "PASS" : "FAIL"} · {gate.gate_id}
                      </span>
                      <p className="text-slate-500">{gate.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-1 text-slate-500">
                Not checked. Live trading cannot be armed.
              </p>
            )}
          </div>
          {liveControl ? (
            <div className="mt-2 rounded border border-rose-300/20 bg-rose-400/5 p-1.5">
              <p className="font-semibold text-rose-200">Real-money execution control</p>
              <p className="mt-1 text-slate-400">
                Hard cap {money(liveControl.policy.max_entry_notional_cents)} · estimated risk {money(liveControl.policy.max_estimated_risk_cents)} · daily loss {money(liveControl.policy.max_daily_loss_cents)} · one entry/day
              </p>
              <p className="mt-1 text-slate-300">
                {liveControl.deployment_enabled
                  ? liveControl.live_order_execution_enabled &&
                      liveContractPreflight?.verdict === "pass" &&
                      liveContractPreflight?.fresh === true
                    ? "ARMED · the next exact approved placement can move real money"
                    : `LOCKED · ${liveControl.kill_switch_reason} · protective exit ${liveControl.protective_exit_ready ? "ready" : "not ready"} · supervisor ${liveControl.supervisor_fresh ? "fresh" : "offline/stale"}`
                  : "DEPLOYMENT LOCKED · server live-execution flag is off"}
              </p>
              {liveControl.attention_required ? (
                <p role="alert" aria-live="assertive"
                  className="mt-1 rounded border border-rose-300/40 bg-rose-500/10 p-1 text-rose-100">
                  OPERATOR ATTENTION REQUIRED: {liveControl.attention_reason ??
                    "Review the live order and protective-stop journal."}
                </p>
              ) : null}
              {liveControl.deployment_enabled && liveControl.supervisor_fresh &&
                  liveControl.protective_exit_ready ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <button data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.void-toggle-attended-live-session" type="button"
                        onClick={() => void toggleAttendedLiveSession()}
                        disabled={busy || disabled}
                        className="rounded border border-cyan-300/30 px-2 py-1 text-cyan-100 disabled:opacity-50">
                        {attendingLive ? "End attended live session" :
                          "Start attended live session"}
                      </button>
                      <span className={liveControl.operator_present
                        ? "text-emerald-200" : "text-slate-400"}>
                        Operator {liveControl.operator_present ? "present" : "not present"}
                      </span>
                    </div>
                  ) : null}
              {liveControl.deployment_enabled && !liveControl.live_order_execution_enabled ? (
                <div className="mt-1.5 space-y-1">
                  <p className="break-all font-mono text-[9px] text-slate-400">Type exactly: {liveControl.arming_phrase}</p>
                  <div className="flex flex-wrap gap-1">
                    <input data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.live-trading-arming-text" aria-label="Live trading arming text" value={armingText}
                      onChange={(event) => setArmingText(event.target.value)}
                      disabled={busy || disabled}
                      className="min-w-48 flex-1 rounded border border-white/15 bg-slate-950 px-2 py-1 font-mono text-[9px] text-slate-100 disabled:opacity-50" />
                    <button data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.arm-one-live-entry" type="button" onClick={() => void updateLiveControl("arm")}
                      disabled={busy || disabled || !liveControl.operator_present ||
                        liveControl.attention_required ||
                        liveContractPreflight?.verdict !== "pass" ||
                        liveContractPreflight?.fresh !== true ||
                        armingText !== liveControl.arming_phrase}
                      className="rounded border border-rose-300/30 px-2 py-1 text-rose-100 disabled:opacity-50">
                      Arm one live entry
                    </button>
                  </div>
                </div>
              ) : null}
              {liveControl.live_order_execution_enabled ? (
                <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.stop-live-placement" type="button" onClick={() => void updateLiveControl("stop")}
                  disabled={busy || disabled}
                  className="mt-1.5 rounded border border-rose-300/40 px-2 py-1 text-rose-100 disabled:opacity-50">
                  STOP LIVE PLACEMENT
                </button>
              ) : null}
            </div>
          ) : null}
          {liveExecutions.length ? (
            <div className="mt-2 space-y-1">
              <p className="font-semibold text-rose-200">Live execution journal</p>
              {liveExecutions.map((execution) => (
                <div key={execution.execution_id} className="flex flex-wrap items-center justify-between gap-1 rounded bg-slate-950/60 p-1.5">
                  <span className="text-slate-300">
                    {execution.intent.symbol} · {execution.state} · {money(execution.intent.notional_cents)}
                    {execution.ambiguity_reason ? ` · ${execution.ambiguity_reason}` : ""}
                  </span>
                  <div className="flex gap-1">
                    {execution.state === "reconciled_filled" &&
                        !protectivePreviews.some((preview) =>
                          preview.entry_execution_id === execution.execution_id &&
                          ["reviewed", "approved"].includes(preview.status)) &&
                        !protectiveExecutions.some((exit) =>
                          exit.entry_execution_id === execution.execution_id &&
                          !["reconciled_cancelled", "reconciled_rejected"]
                            .includes(exit.state)) ? (
                          <>
                            <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.review-protective-stop" type="button"
                              onClick={() => void requestProtectiveExit(
                                execution, "protective_stop")}
                              disabled={busy || disabled}
                              className="rounded border border-cyan-300/30 px-1.5 py-0.5 text-cyan-100 disabled:opacity-50">
                              Review protective stop
                            </button>
                            <button data-helix-interaction-kind="navigate" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.review-market-close" type="button"
                              onClick={() => void requestProtectiveExit(
                                execution, "market_close")}
                              disabled={busy || disabled}
                              className="rounded border border-rose-300/30 px-1.5 py-0.5 text-rose-100 disabled:opacity-50">
                              Review market close
                            </button>
                          </>
                        ) : null}
                    {["submitted", "reconciliation_required", "reconciled_open"]
                      .includes(execution.state) ? (
                        <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.cancel-once" type="button"
                          onClick={() => void cancelLiveExecution(execution)}
                          disabled={busy || disabled}
                          className="rounded border border-rose-300/30 px-1.5 py-0.5 text-rose-100 disabled:opacity-50">
                          Cancel once
                        </button>
                      ) : null}
                    {!["reconciled_cancelled", "reconciled_rejected"]
                      .includes(execution.state) ? (
                        <button data-helix-interaction-kind="observe" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.reconcile-from-robinhood" type="button" onClick={() => void reconcileExecution(execution)}
                          disabled={busy || disabled}
                          className="rounded border border-amber-300/30 px-1.5 py-0.5 text-amber-100 disabled:opacity-50">
                          Reconcile from Robinhood
                        </button>
                      ) : null}
                  </div>
                </div>
              ))}
              <p className="text-rose-200/80">Submitted is not filled. A kill switch stops new placement; cancelling is a separate one-shot provider call and never closes a filled position.</p>
            </div>
          ) : null}
          {protectivePreviews.length || protectiveExecutions.length ? (
            <div className="mt-2 space-y-1.5 rounded border border-cyan-300/20 bg-cyan-400/5 p-1.5">
              <p className="font-semibold text-cyan-100">Protective sell-stop workflow</p>
              <p className="text-slate-400">
                This is a separate real sell order. Stop orders can execute away from the stop price.
              </p>
              {protectivePreviews.map((preview) => (
                <div key={preview.exit_preview_id}
                  className="rounded border border-white/10 bg-slate-950/60 p-1.5">
                  <p className="text-slate-200">
                    SELL {(preview.intent.quantity_micros / 1_000_000)
                      .toFixed(6).replace(/\.?0+$/u, "")} {preview.intent.symbol}
                    {preview.intent.order_type === "stop" &&
                        preview.intent.stop_price_micros !== undefined
                      ? ` STOP ${(preview.intent.stop_price_micros / 1_000_000)
                        .toFixed(6).replace(/\.?0+$/u, "")}`
                      : " MARKET CLOSE"} / {preview.status}
                  </p>
                  {preview.provider_warnings.map((warning) => (
                    <p key={warning} className="mt-1 text-amber-200">{warning}</p>
                  ))}
                  {preview.status === "reviewed" ? (
                    <div className="mt-1 space-y-1">
                      <p className="break-all font-mono text-[9px] text-slate-400">
                        Type exactly: {preview.approval_phrase}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <input data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.input.3" aria-label={`Protective stop approval for ${preview.intent.symbol}`}
                          value={protectiveApprovalText[preview.exit_preview_id] ?? ""}
                          onChange={(event) => setProtectiveApprovalText((current) => ({
                            ...current, [preview.exit_preview_id]: event.target.value,
                          }))}
                          disabled={busy || disabled}
                          className="min-w-48 flex-1 rounded border border-white/15 bg-slate-950 px-2 py-1 font-mono text-[9px] text-slate-100 disabled:opacity-50" />
                        <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.approve-protective-stop-once" type="button"
                          onClick={() => void approveProtectiveExit(preview)}
                          disabled={busy || disabled ||
                            protectiveApprovalText[preview.exit_preview_id] !==
                              preview.approval_phrase}
                          className="rounded border border-amber-300/30 px-2 py-1 text-amber-100 disabled:opacity-50">
                          Approve protective stop once
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {preview.status === "approved" && preview.approval_id ? (
                    <div className="mt-1 space-y-1">
                      <p className="break-all font-mono text-[9px] text-rose-300">
                        Type exactly: PLACE APPROVED EXIT {preview.approval_id}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <input data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.input.4" aria-label={`Protective stop placement for ${preview.intent.symbol}`}
                          value={protectivePlacementText[preview.approval_id] ?? ""}
                          onChange={(event) => setProtectivePlacementText((current) => ({
                            ...current, [preview.approval_id!]: event.target.value,
                          }))}
                          disabled={busy || disabled}
                          className="min-w-48 flex-1 rounded border border-rose-300/20 bg-slate-950 px-2 py-1 font-mono text-[9px] text-slate-100 disabled:opacity-50" />
                        <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.place-protective-stop-once" type="button"
                          onClick={() => void placeProtectiveExit(preview)}
                          disabled={busy || disabled ||
                            protectivePlacementText[preview.approval_id] !==
                              `PLACE APPROVED EXIT ${preview.approval_id}`}
                          className="rounded border border-rose-300/40 px-2 py-1 text-rose-100 disabled:opacity-50">
                          Place protective stop once
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
              {protectiveExecutions.map((execution) => (
                <div key={execution.exit_execution_id}
                  className="flex flex-wrap items-center justify-between gap-1 rounded bg-slate-950/60 p-1.5">
                  <span className="text-slate-300">
                    {execution.intent.symbol} protective stop / {execution.state}
                    {execution.ambiguity_reason ? ` / ${execution.ambiguity_reason}` : ""}
                  </span>
                  <div className="flex gap-1">
                    {["submitted", "reconciliation_required", "reconciled_open"]
                      .includes(execution.state) ? (
                        <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.cancel-protective-stop-once" type="button"
                          onClick={() => void cancelProtectiveExit(execution)}
                          disabled={busy || disabled}
                          className="rounded border border-rose-300/30 px-1.5 py-0.5 text-rose-100 disabled:opacity-50">
                          Cancel protective stop once
                        </button>
                      ) : null}
                    {!['reconciled_filled', 'reconciled_cancelled', 'reconciled_rejected']
                      .includes(execution.state) ? (
                        <button data-helix-interaction-kind="act" data-helix-authority-state="blocked_pending_contract" data-helix-control-id="helix.ask.shared_live_room.shared-live-room-paper-trading-panel.reconcile-protective-stop" type="button"
                          onClick={() => void reconcileProtectiveExit(execution)}
                          disabled={busy || disabled}
                          className="rounded border border-amber-300/30 px-1.5 py-0.5 text-amber-100 disabled:opacity-50">
                          Reconcile protective stop
                        </button>
                      ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      </> : null}
      {message ? <p className="mt-2 text-[10px] text-cyan-100/70">{message}</p> : null}
    </div>
  );
}
