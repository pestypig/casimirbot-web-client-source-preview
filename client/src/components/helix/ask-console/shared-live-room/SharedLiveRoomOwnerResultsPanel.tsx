import React, { useEffect, useRef, useState } from "react";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import type { RoomResultCatalog } from "@shared/helix-room-result-catalog";
import { explainOwnerRoomResult, readOwnerRoomResults, readOwnerHostedRoomReports, explainOwnerHostedRoomReport, RoomResultRequestError } from "./RoomResultOwnerApi";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

export function SharedLiveRoomOwnerResultsPanel({ room, onProcessed }: {
  room: HelixSharedRealtimeRoom; onProcessed(): Promise<unknown>;
}) {
  const [catalog, setCatalog] = useState<RoomResultCatalog | null>(null);
  const [hostedCatalog, setHostedCatalog] = useState<Awaited<ReturnType<typeof readOwnerHostedRoomReports>> | null>(null);
  const [source, setSource] = useState<"local" | "hosted">("local");
  const [selectedRef, setSelectedRef] = useState("");
  const [question, setQuestion] = useState("Explain the selected task report to this room.");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState("");
  const [turnId, setTurnId] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const locked = useRef(false);
  const selected = catalog?.results.find(result => result.result_ref === selectedRef);
  const selectedHosted = hostedCatalog?.reports.find(result => result.disclosure_ref === selectedRef);
  const hasSelection = source === "hosted" ? Boolean(selectedHosted) : Boolean(selected);
  const choices = source === "hosted"
    ? hostedCatalog?.reports.map(report => ({ ref: report.disclosure_ref, status: report.task_status, created_at: report.created_at }))
    : catalog?.results.map(report => ({ ref: report.result_ref, status: report.status, created_at: report.created_at }));
  const published = room.public_terminal_results.some(result => result.turn_id === turnId);

  const refresh = async (mode = source) => {
    if (locked.current) return;
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    setLoading(true); setCatalog(null); setHostedCatalog(null); setSelectedRef(""); setConsent(false); setMessage(""); setTurnId(null);
    try {
      if (mode === "hosted") {
        const next = await readOwnerHostedRoomReports(room.room_id, abort.signal);
        if (!abort.signal.aborted) { setHostedCatalog(next); setHidden(false); }
      } else {
        const next = await readOwnerRoomResults(room.room_id, abort.signal);
        if (!abort.signal.aborted) { setCatalog(next); setHidden(false); }
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        setHidden(error instanceof RoomResultRequestError && error.code === "room_result_developer_required");
        setMessage(error instanceof RoomResultRequestError
          ? `Results unavailable (${error.code}). Refresh after restoring the room connection and report access.`
          : "Could not check results. Refresh to try again.");
      }
    } finally { if (!abort.signal.aborted) setLoading(false); }
  };
  useEffect(() => {
    mounted.current = true;
    const clear = () => {
      request.current?.abort(); request.current = null; locked.current = false;
      setCatalog(null); setHostedCatalog(null); setSelectedRef(""); setConsent(false); setMessage(""); setTurnId(null);
      setQuestion("Explain the selected task report to this room.");
      setBusy(false); setLoading(false); setHidden(false);
    };
    clear();
    if (room.status !== "closed") void refresh();
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    return () => { mounted.current = false; request.current?.abort(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear); };
  }, [room.room_id, room.self_participant_id, room.status]);

  const explain = async () => {
    if (locked.current || !hasSelection || (source === "local" && selected?.room_id !== room.room_id) || !consent || !question.trim() || room.status === "closed") return;
    locked.current = true; setBusy(true); setMessage(""); setTurnId(null);
    const abort = new AbortController(); request.current = abort;
    try {
      const result = source === "hosted"
        ? await explainOwnerHostedRoomReport(room.room_id, selectedHosted!, question, abort.signal)
        : await explainOwnerRoomResult(selected!, question, abort.signal);
      if (!mounted.current || abort.signal.aborted) return;
      setTurnId(result.turnId);
      setMessage(result.state === "pending"
        ? "This explanation is still running. Retry the same request to check its outcome."
        : "The explanation was processed. Waiting for its shared room result.");
      if (result.state === "processed") {
        // Refresh errors do not turn a completed provider request into a new call.
        try { await onProcessed(); } catch { /* normal room sync will retry */ }
      }
    } catch (error) {
      if (!mounted.current || abort.signal.aborted) return;
      setMessage(error instanceof RoomResultRequestError
        ? `No shared answer confirmed (${error.code}). Refresh if the selected report or permission changed.`
        : "The outcome is unknown. Retry without changing the result or question to reuse the same request.");
    } finally { if (request.current === abort) { locked.current = false; if (mounted.current && !abort.signal.aborted) setBusy(false); } }
  };
  if (hidden) return null;
  return <section className="rounded-xl border border-cyan-300/20 bg-cyan-400/[0.04] p-3" aria-label="Owner task results">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-xs font-semibold text-cyan-100">Explain a task result to the room</h3>
      <button type="button" className="rounded border border-white/20 px-2 py-1 text-xs" disabled={busy || loading}
        onClick={() => void refresh()}>Refresh results</button>
    </div>
    <label className="mt-2 block text-xs">Report location
      <select aria-label="Report location" value={source} disabled={busy || loading || room.status === "closed"}
        className="ml-2 rounded border border-white/20 bg-slate-950 p-1"
        onChange={event => { const mode = event.target.value === "hosted" ? "hosted" : "local"; setSource(mode); void refresh(mode); }}>
        <option value="local">Private task reports</option>
        <option value="hosted">This room's approved reports</option>
      </select>
    </label>
    <p className="mt-2 text-xs text-slate-300">{source === "hosted" ? "Choose a report the owner has already shared with this room." : "Choose a returned report from this room's selected mission."} Checking results does not start an AI call.</p>
    {loading ? <p role="status" className="mt-2 text-xs">Checking available results…</p> : null}
    {source === "local" && catalog && !catalog.mission ? <p className="mt-2 text-xs">No external mission is selected for this room yet.</p> : null}
    {catalog?.mission && !catalog.results.length ? <p className="mt-2 text-xs">No returned results are available for the selected mission. Refresh after the task reports back.</p> : null}
    {source === "hosted" && hostedCatalog && !hostedCatalog.reports.length ? <p className="mt-2 text-xs">No owner-approved reports are currently available.</p> : null}
    {choices?.length ? <div className="mt-3 space-y-3 text-xs">
      <label className="block">Task report
        <select aria-label="Task report" value={selectedRef} disabled={busy || loading}
          className="mt-1 block w-full rounded border border-white/20 bg-slate-950 p-2"
          onChange={event => { setSelectedRef(event.target.value); setConsent(false); setMessage(""); setTurnId(null); }}>
          <option value="">Select a report…</option>
          {choices.map((result, index) => <option key={result.ref} value={result.ref}>
            Report {index + 1} · {result.status === "unable" ? "Task unable to complete" : "Task reported completion"} · {new Date(result.created_at).toLocaleString()}
          </option>)}
        </select>
      </label>
      {(source === "hosted" ? hostedCatalog?.has_more : catalog?.limited) ? <p>Showing the 20 most recent reports.</p> : null}
      <label className="block">What should the room understand?
        <textarea aria-label="What should the room understand?" value={question} maxLength={12000} disabled={busy}
          className="mt-1 block w-full rounded border border-white/20 bg-slate-950 p-2"
          onChange={event => { setQuestion(event.target.value); setConsent(false); setMessage(""); setTurnId(null); }} />
      </label>
      <label className="flex items-start gap-2"><input type="checkbox" checked={consent} disabled={busy || !hasSelection}
        onChange={event => setConsent(event.target.checked)} />
        <span>Send the selected report to the configured Codex provider and share its supported explanation with room members. This may use the provider's API allowance.</span>
      </label>
      <button type="button" className="rounded border border-cyan-300/30 px-3 py-2 text-cyan-100 disabled:opacity-50"
        disabled={busy || loading || !hasSelection || !consent || !question.trim() || room.status === "closed"}
        onClick={() => void explain()}>{busy ? "Preparing explanation…" : "Explain to room"}</button>
    </div> : null}
    {published ? <p role="status" className="mt-2 text-xs text-emerald-100">The explanation is available in Shared supported results.</p>
      : message ? <p role="status" className="mt-2 text-xs text-amber-100">{message}</p> : null}
  </section>;
}
