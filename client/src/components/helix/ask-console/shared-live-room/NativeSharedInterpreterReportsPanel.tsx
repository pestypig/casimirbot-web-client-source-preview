import React, { useEffect, useRef, useState } from "react";
import { nativeSharedInterpreterReportCatalogSchema,
  nativeSharedInterpreterReportObservationSchema,
  sharedInterpreterReportSummarySchema } from
  "@shared/helix-hosted-room-interpreter-shared-reports";
import { DESKTOP_AUTH0_ROOM_CONTROL_PATH } from
  "@shared/desktop-auth0-account-link";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from
  "@/lib/workstation/accountCapabilityPolicy";

type Summary = ReturnType<typeof sharedInterpreterReportSummarySchema.parse>;
type Catalog = ReturnType<typeof nativeSharedInterpreterReportCatalogSchema.parse>;
type Observation = ReturnType<typeof nativeSharedInterpreterReportObservationSchema.parse>;

export function NativeSharedInterpreterReportsPanel({ roomId, authority, disabled = false }: {
  roomId: string; authority: string; disabled?: boolean;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [opened, setOpened] = useState<Observation | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const epoch = useRef(0), pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const clear = () => { epoch.current++; pending.current?.abort(); pending.current = null;
      setCatalog(null); setOpened(null); setBusy(false); setMessage(""); };
    clear(); window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    return () => { clear(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear); };
  }, [roomId, authority, disabled]);

  const load = async (selected?: Summary) => {
    if (busy || disabled || pending.current || (selected && !catalog)) return;
    const current = ++epoch.current, controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    setBusy(true); setCatalog(null); setOpened(null); setMessage("");
    try {
      const response = await fetch(DESKTOP_AUTH0_ROOM_CONTROL_PATH, {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(selected ? { operation: "interpreter_report_read", request: {
          room_id: roomId, disclosure_ref: selected.disclosure_ref,
          result_sha256: selected.result_sha256 } } :
        { operation: "interpreter_report_list", room_id: roomId }),
      });
      const raw = await response.json();
      if (current !== epoch.current || controller.signal.aborted) return;
      if (!response.ok) throw Error("unavailable");
      if (selected) {
        const value = nativeSharedInterpreterReportObservationSchema.parse(raw);
        if (value.authority !== authority || value.receipt.room.room_id !== roomId ||
            JSON.stringify(value.receipt.report) !== JSON.stringify(selected)) throw Error("changed");
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
          new TextEncoder().encode(value.receipt.result_text))))
          .map(byte => byte.toString(16).padStart(2, "0")).join("");
        if (current !== epoch.current || controller.signal.aborted) return;
        if (digest !== selected.result_sha256) throw Error("changed");
        setOpened(value);
      } else {
        const value = nativeSharedInterpreterReportCatalogSchema.parse(raw);
        if (value.authority !== authority || value.receipt.room.room_id !== roomId)
          throw Error("changed");
        setCatalog(value);
      }
    } catch {
      if (current === epoch.current)
        setMessage("Shared AI task reports are unavailable or access changed. Reload to check current room access.");
    } finally { clearTimeout(timer); if (current === epoch.current) {
      pending.current = null; setBusy(false); } }
  };

  return <section aria-label="Shared AI task reports" className="mt-3 border-t border-white/20 pt-3">
    <p>Owner-approved AI task reports</p>
    <p className="break-all">Room: {roomId} · {authority}</p>
    <p>These reports come from host-reviewed AI room replies and a selected task. Reading one sends no instruction and generates no new answer.</p>
    <button type="button" disabled={busy || disabled} onClick={() => void load()}>Load shared AI task reports</button>
    {message ? <p role="status">{message}</p> : null}
    {catalog ? <>
      {!catalog.receipt.reports.length ? <p>No current shared AI task reports.</p> : null}
      {catalog.receipt.reports.map((report, index) => <div key={report.disclosure_ref}>
        <span>Report {index + 1} · task reported {report.task_status}</span>{" "}
        <button type="button" disabled={busy || disabled} onClick={() => void load(report)}>Open AI task report {index + 1}</button>
      </div>)}
      {catalog.receipt.has_more ? <p>Showing the 20 most recent reports.</p> : null}
    </> : null}
    {opened ? <article aria-label="Owner-approved AI task report">
      <p>Source AI turn: <code>{opened.receipt.report.source_turn_request_id}</code></p>
      <p>This is a shared task observation, not a verified program effect or permission to act.</p>
      <pre className="whitespace-pre-wrap break-words">{opened.receipt.result_text}</pre>
    </article> : null}
  </section>;
}
