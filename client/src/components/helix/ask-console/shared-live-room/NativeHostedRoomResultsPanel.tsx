import React, { useEffect, useRef, useState } from "react";
import { nativeHostedResultCatalogSchema, nativeHostedResultPreviewSchema, nativeHostedResultShareReceiptSchema,
  type NativeHostedResultCatalog, type NativeHostedResultPreview } from "@shared/helix-native-hosted-room-results";
import { NATIVE_HOSTED_ROOM_BASE_PATH } from "@shared/helix-native-hosted-room-mission";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

export function NativeHostedRoomResultsPanel({ roomId, authority, disabled = false }: {
  roomId: string; authority: string; disabled?: boolean;
}) {
  const [catalog, setCatalog] = useState<NativeHostedResultCatalog | null>(null);
  const [preview, setPreview] = useState<NativeHostedResultPreview | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const generation = useRef(0), pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const clear = () => {
      generation.current++; pending.current?.abort(); pending.current = null;
      setCatalog(null); setPreview(null); setBusy(false); setMessage(null);
    };
    clear(); window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    return () => { generation.current++; pending.current?.abort(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear); };
  }, [roomId, authority, disabled]);
  const run = async (selected?: NativeHostedResultCatalog["results"][number]) => {
    if (disabled || busy || pending.current || (selected && !catalog)) return;
    const reviewed = catalog, epoch = ++generation.current;
    const controller = new AbortController(); pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setBusy(true); setPreview(null); setMessage(null); setCatalog(null);
    try {
      const response = await fetch(`${NATIVE_HOSTED_ROOM_BASE_PATH}/results/${selected ? "review" : "list"}`, {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(selected ? { room_id: roomId, selection_ref: reviewed!.selection_ref,
          selection_revision: reviewed!.selection_revision, steering_event_ref: selected.steering_event_ref,
          result_ref: selected.result_ref, result_sha256: selected.result_sha256 } : { room_id: roomId }),
      });
      const raw = await response.json();
      if (epoch !== generation.current) return;
      if (controller.signal.aborted) throw new Error("request_expired");
      if (!response.ok) throw new Error("unavailable");
      if (selected) {
        const value = nativeHostedResultPreviewSchema.parse(raw);
        if (value.room_id !== roomId || value.authority !== authority ||
            value.selection_ref !== reviewed!.selection_ref || value.selection_revision !== reviewed!.selection_revision ||
            JSON.stringify(value.result) !== JSON.stringify(selected)) throw new Error("source_changed");
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.result_text))))
          .map(byte => byte.toString(16).padStart(2, "0")).join("");
        if (epoch !== generation.current) return;
        if (controller.signal.aborted) throw new Error("request_expired");
        if (digest !== selected.result_sha256) throw new Error("text_changed");
        setPreview(value);
      } else {
        const value = nativeHostedResultCatalogSchema.parse(raw);
        if (value.room_id !== roomId || value.authority !== authority) throw new Error("room_changed");
        setCatalog(value);
      }
    } catch {
      if (epoch === generation.current) setMessage("Private reports are unavailable or their permission changed. Refresh to review current results.");
    } finally {
      clearTimeout(timeout);
      if (epoch === generation.current) { pending.current = null; setBusy(false); }
    }
  };
  const share = async () => {
    if (disabled || busy || pending.current || !preview) return;
    const reviewed = preview, epoch = ++generation.current;
    const controller = new AbortController(); pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setBusy(true); setPreview(null); setCatalog(null); setMessage(null);
    try {
      const response = await fetch(`${NATIVE_HOSTED_ROOM_BASE_PATH}/results/share`, {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, selection_ref: reviewed.selection_ref,
          selection_revision: reviewed.selection_revision, steering_event_ref: reviewed.result.steering_event_ref,
          result_ref: reviewed.result.result_ref, result_sha256: reviewed.result.result_sha256, share_with_room: true }),
      });
      const raw = await response.json();
      if (epoch !== generation.current) return;
      if (!response.ok || controller.signal.aborted) throw new Error("share_unconfirmed");
      const receipt = nativeHostedResultShareReceiptSchema.parse(raw);
      if (receipt.authority !== authority || receipt.room_id !== roomId || receipt.selection_ref !== reviewed.selection_ref ||
          receipt.selection_revision !== reviewed.selection_revision || JSON.stringify(receipt.result) !== JSON.stringify(reviewed.result) ||
          receipt.disclosure.result_sha256 !== reviewed.result.result_sha256 || receipt.disclosure.task_status !== reviewed.result.task_status) {
        throw new Error("share_changed");
      }
      setMessage("Report stored by the room service. Members can load it under Owner-approved reports. Use the room service's owner controls to request an explanation.");
    } catch {
      if (epoch === generation.current) setMessage("Sharing was not confirmed. The report may already be stored. Refresh and review the same report before an explicit retry.");
    } finally {
      clearTimeout(timeout);
      if (epoch === generation.current) { pending.current = null; setBusy(false); }
    }
  };
  return <section aria-label="Private hosted task reports" className="mt-3 border-t border-white/20 pt-3">
    <p>Private task reports</p>
    <p>Review a task's report on this device. Opening it does not share it with the room.</p>
    <button type="button" disabled={disabled || busy} onClick={() => void run()}>Refresh private reports</button>
    {message ? <p role="status">{message}</p> : null}
    {catalog ? <>
      {!catalog.results.length ? <p>No currently accessible task reports.</p> : null}
      {catalog.results.map((result, index) => <div key={result.result_ref}>
        <span>Report {index + 1} · task reported {result.task_status} · {result.created_at}</span>{" "}
        <button type="button" disabled={busy || disabled} onClick={() => void run(result)}>Review report {index + 1}</button>
      </div>)}
      {catalog.has_more ? <p>Showing the 20 most recent reports.</p> : null}
    </> : null}
    {preview ? <article aria-label="Private task report preview">
      <p>Private report · task reported {preview.result.task_status}</p>
      <p>This is a task report, not verified effects or permission to change the mission.</p>
      <pre className="whitespace-pre-wrap break-words">{preview.result_text}</pre>
      <p>Sharing sends this exact report to {authority} for current room members to read.</p>
      <button type="button" disabled={busy || disabled} onClick={() => void share()}>Share report</button>
    </article> : null}
  </section>;
}
