import React, { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { nativeSharedRoomReportCatalogSchema, nativeSharedRoomReportObservationSchema,
  sharedRoomReportSummarySchema } from "@shared/helix-hosted-room-shared-reports";
import { DESKTOP_AUTH0_ROOM_CONTROL_PATH } from "@shared/desktop-auth0-account-link";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

type Summary = z.infer<typeof sharedRoomReportSummarySchema>;
const unavailableMessage = "Shared reports are unavailable or permission changed. Load reports again to check current access.";
// Use only known codes, never remote error messages or arbitrary response text.
const reportRecoveryMessage = (raw: unknown): string => {
  const code = raw && typeof raw === "object" && "error" in raw ? raw.error : null;
  switch (code) {
    case "room_connection_required":
    case "room_connection_changed":
      return "Refresh the connection in Hosted service rooms. If it is no longer authorized, authorize this account again, then reload reports.";
    case "insufficient_scope":
      return "Room report read permission is missing. Review the authorization in Hosted service rooms for this account, then reload reports.";
    case "account_policy_blocked":
      return "Shared Live Rooms access is disabled for this account on the room service. Enable it there, then refresh the room connection.";
    case "room_forbidden":
      return "Room access was denied. Confirm this account and the room owner are present in the selected hosted room, then reload reports.";
    case "room_runtime_conflict":
    case "room_report_changed":
      return "The shared report is no longer current. Reload reports and select a currently available report.";
    case "room_transport_failed":
      return "The room service could not be reached. Check the connection, then reload reports.";
    default:
      return unavailableMessage;
  }
};
export function NativeSharedRoomReportsPanel({ roomId, authority, disabled = false }: {
  roomId: string; authority: string; disabled?: boolean;
}) {
  const [catalog, setCatalog] = useState<z.infer<typeof nativeSharedRoomReportCatalogSchema> | null>(null);
  const [opened, setOpened] = useState<z.infer<typeof nativeSharedRoomReportObservationSchema> | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const generation = useRef(0), pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const clear = () => {
      generation.current++; pending.current?.abort(); pending.current = null;
      setCatalog(null); setOpened(null); setMessage(null); setBusy(false);
    };
    clear(); window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    return () => { generation.current++; pending.current?.abort(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear); };
  }, [roomId, authority, disabled]);

  const load = async (selected?: Summary) => {
    if (disabled || busy || pending.current || (selected && !catalog)) return;
    const epoch = ++generation.current, controller = new AbortController(); pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    let failureMessage = unavailableMessage;
    setBusy(true); setMessage(null); setOpened(null); setCatalog(null);
    try {
      const response = await fetch(DESKTOP_AUTH0_ROOM_CONTROL_PATH, { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify(selected ? { operation: "report_read", request: { room_id: roomId,
          disclosure_ref: selected.disclosure_ref, result_sha256: selected.result_sha256 } } : { operation: "report_list", room_id: roomId }),
      });
      const raw = await response.json();
      if (epoch !== generation.current) return;
      if (!response.ok) {
        failureMessage = reportRecoveryMessage(raw);
        throw new Error("report_unavailable");
      }
      if (controller.signal.aborted) throw new Error("report_unavailable");
      if (selected) {
        const value = nativeSharedRoomReportObservationSchema.parse(raw);
        if (value.authority !== authority || value.receipt.room.room_id !== roomId ||
            JSON.stringify(value.receipt.report) !== JSON.stringify(selected)) throw new Error("report_changed");
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.receipt.result_text))))
          .map(byte => byte.toString(16).padStart(2, "0")).join("");
        if (epoch !== generation.current) return;
        if (controller.signal.aborted || digest !== selected.result_sha256) throw new Error("report_changed");
        setOpened(value);
      } else {
        const value = nativeSharedRoomReportCatalogSchema.parse(raw);
        if (value.authority !== authority || value.receipt.room.room_id !== roomId) throw new Error("room_changed");
        setCatalog(value);
      }
    } catch {
      if (epoch === generation.current) setMessage(failureMessage);
    } finally {
      clearTimeout(timeout);
      if (epoch === generation.current) { pending.current = null; setBusy(false); }
    }
  };

  return <section aria-label="Shared room reports" className="mt-3 border-t border-white/20 pt-3">
    <p>Owner-approved reports</p>
    <p>Read reports the owner has shared with this room. Opening one sends no instructions and generates no answer.</p>
    <button data-helix-control-id="helix.ask.shared_live_room.native-shared-room-reports-panel.load-shared-reports" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy || disabled} onClick={() => void load()}>Load shared reports</button>
    {message ? <p role="status">{message}</p> : null}
    {catalog ? <>
      {!catalog.receipt.reports.length ? <p>No currently available shared reports.</p> : null}
      {catalog.receipt.reports.map((report, index) => <div key={report.disclosure_ref}>
        <span>Report {index + 1} · task reported {report.task_status} · {report.created_at}</span>{" "}
        <button data-helix-control-id="helix.ask.shared_live_room.native-shared-room-reports-panel.open-shared-report" data-helix-interaction-kind="human_only" data-helix-authority-state="blocked_pending_contract" type="button" disabled={busy || disabled} onClick={() => void load(report)}>Open shared report {index + 1}</button>
      </div>)}
      {catalog.receipt.has_more ? <p>Showing recent reports only.</p> : null}
    </> : null}
    {opened ? <article aria-label="Owner-approved task report">
      <p>Task reported {opened.receipt.report.task_status}</p>
      <p>This is an owner-shared task report, not verified effects or permission to act.</p>
      <pre className="whitespace-pre-wrap break-words">{opened.receipt.result_text}</pre>
      <p>Use the room service's owner controls to request a shared explanation. This preview does not start reasoning.</p>
    </article> : null}
  </section>;
}
