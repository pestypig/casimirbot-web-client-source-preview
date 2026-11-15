import { useCallback, useEffect, useRef, useState } from "react";
import type { HelixAccountSessionStatus } from "@shared/helix-account-session";
import { cacheAccountCapabilityPolicy, HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from
  "@/lib/workstation/accountCapabilityPolicy";
import { captureAccountOperationScope } from "@/lib/workstation/accountOperationScope";

export function SharedLiveRoomsAccessControl() {
  const [status, setStatus] = useState<HelixAccountSessionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const mutating = useRef(false);
  const publishing = useRef(false);
  const publish = useCallback((next: HelixAccountSessionStatus) => {
    setStatus(next);
    // This component has already admitted the receipt. Its own cache event
    // must not invalidate that same observation or restart its request.
    publishing.current = true;
    try {
      cacheAccountCapabilityPolicy(next.account_policy ?? next.session?.account_policy ?? null,
        next.session?.profile.profile_id ?? null);
    } finally { publishing.current = false; }
  }, []);
  const refresh = useCallback(async () => {
    if (!mounted.current || mutating.current) return;
    const revision = ++generation.current;
    const sameAccount = captureAccountOperationScope();
    const current = () => mounted.current && revision === generation.current && sameAccount();
    try {
      const response = await fetch("/api/account/session", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(`Account status ${response.status}`);
      const next = await response.json() as HelixAccountSessionStatus;
      if (!current()) return;
      publish(next);
      setError(null);
    } catch (cause) {
      if (!current()) return;
      setStatus(null);
      setError(cause instanceof Error ? cause.message : "Could not check room access.");
    }
  }, [publish]);
  useEffect(() => {
    mounted.current = true;
    const accountChanged = () => {
      if (publishing.current) return;
      ++generation.current;
      mutating.current = false;
      setStatus(null);
      setBusy(false);
      setError(null);
      void refresh();
    };
    void refresh();
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
    // The owner may approve new room scopes in an external browser window.
    // Recheck when they return so the toolbar reflects that grant immediately.
    window.addEventListener("focus", refresh);
    return () => {
      mounted.current = false;
      ++generation.current;
      mutating.current = false;
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const room = status?.experimental_features?.shared_realtime_rooms;
  const optedIn = room?.opted_in ?? false;
  const included = status?.account_policy?.account_type === "developer";
  const available = room?.available ?? false;
  const disabled = busy || !status || included || (!available && !optedIn);
  const explanation = !status ? "Checking room access" : included
    ? "Rooms are included with developer access" : !available && optedIn
      ? "Room access cannot be verified; you can turn off the opt-in" : !available
        ? "Rooms are not available for this account on this deployment" : optedIn
          ? "Turn off Shared Live Rooms" : "Turn on Shared Live Rooms for this account";

  const toggle = async () => {
    if (disabled || mutating.current || !mounted.current) return;
    const revision = ++generation.current;
    const sameAccount = captureAccountOperationScope();
    const current = () => mounted.current && revision === generation.current && sameAccount();
    mutating.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/session/experimental-rooms", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !optedIn }),
      });
      const result = await response.json();
      if (!current()) return;
      if (!response.ok || !result?.status) throw new Error(result?.message ?? `Rooms ${response.status}`);
      const next = result.status as HelixAccountSessionStatus;
      publish(next);
    } catch (cause) {
      if (!current()) return;
      setError(cause instanceof Error ? cause.message : "Could not update Shared Live Rooms.");
    } finally {
      if (current()) { mutating.current = false; setBusy(false); }
    }
  };

  return <div className="inline-flex shrink-0 flex-col items-start">
    <button type="button" role="switch" aria-label="Shared Live Rooms" aria-checked={optedIn || included}
      data-helix-interaction-kind="configure" data-helix-authority-state="blocked_pending_contract"
      data-helix-control-id="helix.ask.shared-live-rooms-access"
      aria-description={explanation} title={explanation} disabled={disabled}
      onClick={() => void toggle()} data-helix-ask-action-item="true"
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-55 ${
        optedIn || included ? "border-emerald-300/55 bg-emerald-500/15 text-emerald-100" :
          "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
      }`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${optedIn || included ? "bg-emerald-300" : "bg-slate-500"}`} />
      Rooms {optedIn || included ? "On" : "Off"}
    </button>
    {error ? <span role="status" className="max-w-44 text-[10px] text-rose-200">{error}</span> : null}
  </div>;
}
