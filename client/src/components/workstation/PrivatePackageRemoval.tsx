import React, { useCallback, useEffect, useRef, useState } from "react";
import { privateRemovalResultSchema, type PrivateRemovalResult } from "@shared/desktop-environment-removal";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

export type PrivateRemovalBridge = {
  getPrivateEnvironmentRemovalState: () => Promise<unknown>;
  removePrivateEnvironmentPackage: () => Promise<unknown>;
};
const button = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-45";
/** Independent of catalog validity: expiry must not hide owner cleanup. */
export default function PrivatePackageRemoval({ bridge, installationRef, onRemoved, enabled = true, onBusyChange }: {
  bridge: PrivateRemovalBridge; installationRef?: string; onRemoved: () => void;
  enabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const [state, setState] = useState<PrivateRemovalResult | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const generation = useRef(0);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  const load = useCallback(async () => {
    const request = ++generation.current; setBusy(true); setState(null);
    try {
      const result = privateRemovalResultSchema.parse(await bridge.getPrivateEnvironmentRemovalState());
      if (request !== generation.current) return;
      setState(result.status === "selected" || result.status === "not_installed" ? result : { status: "unavailable", error: "unavailable" });
    } catch { if (request === generation.current) setState({ status: "unavailable", error: "unavailable" }); }
    finally { if (request === generation.current) setBusy(false); }
  }, [bridge]);
  useEffect(() => {
    if (!enabled) { generation.current++; setState(null); setBusy(false); return; }
    if (installationRef) setMessage("");
    void load();
    const changed = () => { setMessage(""); void load(); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
    return () => { generation.current++; window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed); };
  }, [load, installationRef, enabled]);
  const remove = async () => {
    if (!enabled || busy || state?.status !== "selected") return;
    const selection = state.selection, request = ++generation.current;
    setBusy(true); setMessage("");
    try {
      const result = privateRemovalResultSchema.parse(await bridge.removePrivateEnvironmentPackage());
      if (request !== generation.current) return;
      if (result.status === "removed") {
        if (result.receipt.installationRef !== selection.installationRef || result.receipt.artifactSha256 !== selection.artifactSha256)
          throw Error("selection_changed");
        setState({ status: "not_installed" });
        setMessage(result.receipt.codeFilesRemoved ? "Package removed. Saved observations and personal data were kept."
          : "Package disabled. Some code files could not be removed and were kept. Saved observations and personal data were kept.");
        onRemoved();
      } else if (result.status === "cancelled") setMessage("Removal canceled.");
      else { setState({ status: "unavailable", error: "unavailable" }); setMessage("Removal was not confirmed. Refresh local status before retrying."); }
    } catch {
      if (request === generation.current) { setState({ status: "unavailable", error: "unavailable" }); setMessage("Removal status is uncertain. Refresh local status before retrying."); }
    } finally { if (request === generation.current) setBusy(false); }
  };
  return <section aria-label="Local package removal" className="mt-6 rounded-xl border border-white/15 p-4">
    <h2 className="font-medium">Local package cleanup</h2>
    <p className="mt-2 text-sm text-slate-400">Remove System Clock from this device. Saved observations and personal data are kept. Removal remains available when catalog approval expires.</p>
    <p role="status" className="mt-2 text-sm">{busy ? "Checking local package…" : message || (state?.status === "selected"
      ? `System Clock ${state.selection.version} is installed.` : state?.status === "not_installed" ? "No selected clock package."
        : "Sign in with your developer account to check local cleanup availability.")}</p>
    <div className="mt-3 flex gap-2"><button className={button} disabled={!enabled || busy || state?.status !== "selected"} onClick={() => void remove()}>Remove clock package</button>
      <button className={button} disabled={!enabled || busy} onClick={() => void load()}>Refresh local removal status</button></div>
  </section>;
}
