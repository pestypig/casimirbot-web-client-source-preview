import React, { useEffect, useRef, useState } from "react";
import { nativeHostedInterpreterResultCatalogSchema,
  nativeHostedInterpreterResultPreviewSchema,
  nativeHostedInterpreterResultShareReceiptSchema } from
  "@shared/helix-native-hosted-room-interpreter-results";
import { NATIVE_HOSTED_ROOM_BASE_PATH as BASE } from
  "@shared/helix-native-hosted-room-mission";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from
  "@/lib/workstation/accountCapabilityPolicy";

type Catalog = ReturnType<typeof nativeHostedInterpreterResultCatalogSchema.parse>;
type Preview = ReturnType<typeof nativeHostedInterpreterResultPreviewSchema.parse>;

/** The host can inspect task observations without converting them to room speech. */
export function NativeHostedRoomInterpreterResultsPanel({ roomId, authority, disabled = false }: {
  roomId: string; authority: string; disabled?: boolean;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const epoch = useRef(0), pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const clear = () => { epoch.current++; pending.current?.abort(); pending.current = null;
      setCatalog(null); setPreview(null); setBusy(false); setMessage(""); };
    clear(); window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    return () => { clear(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear); };
  }, [roomId, authority, disabled]);

  const read = async (selected?: Catalog["results"][number]) => {
    if (busy || disabled || pending.current || (selected && !catalog)) return;
    const source = catalog, current = ++epoch.current;
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    setBusy(true); setCatalog(null); setPreview(null); setMessage("");
    try {
      const response = await fetch(`${BASE}/interpreter-proposals/results/${selected ? "review" : "list"}`, {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(selected ? { room_id: roomId,
          selection_ref: source!.selection_ref, selection_revision: source!.selection_revision,
          steering_event_ref: selected.steering_event_ref, result_ref: selected.result_ref,
          result_sha256: selected.result_sha256 } : { room_id: roomId }),
      });
      const raw = await response.json();
      if (current !== epoch.current || controller.signal.aborted) return;
      if (!response.ok) throw Error("unavailable");
      if (selected) {
        const value = nativeHostedInterpreterResultPreviewSchema.parse(raw);
        if (value.room_id !== roomId || value.authority !== authority ||
            value.selection_ref !== source!.selection_ref ||
            value.selection_revision !== source!.selection_revision ||
            JSON.stringify(value.result) !== JSON.stringify(selected)) throw Error("source_changed");
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
          new TextEncoder().encode(value.result_text))))
          .map(byte => byte.toString(16).padStart(2, "0")).join("");
        if (current !== epoch.current || controller.signal.aborted) return;
        if (digest !== selected.result_sha256) throw Error("text_changed");
        setPreview(value);
      } else {
        const value = nativeHostedInterpreterResultCatalogSchema.parse(raw);
        if (value.room_id !== roomId || value.authority !== authority) throw Error("room_changed");
        setCatalog(value);
      }
    } catch {
      if (current === epoch.current)
        setMessage("AI-sourced task reports are unavailable or their source changed. Refresh to review current results.");
    } finally { clearTimeout(timer); if (current === epoch.current) {
      pending.current = null; setBusy(false); } }
  };
  const share = async () => {
    if (busy || disabled || pending.current || !preview) return;
    const reviewed = preview, current = ++epoch.current;
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    setBusy(true); setPreview(null); setCatalog(null); setMessage("");
    try {
      const response = await fetch(`${BASE}/interpreter-proposals/results/share`, {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, selection_ref: reviewed.selection_ref,
          selection_revision: reviewed.selection_revision,
          steering_event_ref: reviewed.result.steering_event_ref,
          result_ref: reviewed.result.result_ref,
          result_sha256: reviewed.result.result_sha256, share_with_room: true }),
      });
      const raw = await response.json();
      if (current !== epoch.current || controller.signal.aborted) return;
      if (!response.ok) throw Error("share_unconfirmed");
      const receipt = nativeHostedInterpreterResultShareReceiptSchema.parse(raw);
      if (receipt.authority !== authority || receipt.room_id !== roomId ||
          receipt.selection_ref !== reviewed.selection_ref ||
          receipt.selection_revision !== reviewed.selection_revision ||
          JSON.stringify(receipt.result) !== JSON.stringify(reviewed.result) ||
          receipt.disclosure.result_sha256 !== reviewed.result.result_sha256 ||
          receipt.disclosure.task_status !== reviewed.result.task_status)
        throw Error("share_changed");
      setMessage("The room service recorded this owner-approved AI-sourced report. Members can read it under shared AI task reports; no assistant answer was published.");
    } catch {
      if (current === epoch.current) setMessage(
        "Sharing is unconfirmed. The report may already be recorded. Refresh and review the same result before an explicit retry.");
    } finally { clearTimeout(timer); if (current === epoch.current) {
      pending.current = null; setBusy(false); } }
  };

  return <section aria-label="Private AI-sourced task reports" className="mt-3 rounded border border-fuchsia-300/20 p-3 text-xs">
    <p className="font-semibold text-fuchsia-100">Task results from reviewed AI replies</p>
    <p className="break-all text-slate-300">Room: {roomId}</p>
    <p>After the selected Codex task picks up an approved instruction, its report stays private to the host. Review does not post it to the room.</p>
    <button type="button" disabled={busy || disabled} onClick={() => void read()}>Refresh AI-sourced task results</button>
    {message ? <p role="status">{message}</p> : null}
    {catalog ? <>
      {!catalog.results.length ? <p>No current AI-sourced task results.</p> : null}
      {catalog.results.map((result, index) => <div key={result.result_ref}>
        <span>Result {index + 1} · task reported {result.task_status}</span>{" "}
        <button type="button" disabled={busy || disabled} onClick={() => void read(result)}>Review result {index + 1}</button>
      </div>)}
      {catalog.has_more ? <p>Showing the 20 most recent results.</p> : null}
    </> : null}
    {preview ? <article aria-label="Private AI-sourced task result preview">
      <p>Source AI turn: <code>{preview.source_turn_request_id}</code></p>
      <p>This is a task observation, not a verified program effect or a room answer.</p>
      <pre className="whitespace-pre-wrap break-words">{preview.result_text}</pre>
      <p>Sharing sends this exact owner-approved report to room <code>{roomId}</code> on {authority} for current members to read.</p>
      <button type="button" disabled={busy || disabled} onClick={() => void share()}>Share reviewed AI task result</button>
    </article> : null}
  </section>;
}
