import React, { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { privateClockHistorySchema as historySchema, privateClockHistoryDiscoverySchema as discoverySchema, checkPrivateClockReceipt as checkedReceipt } from "@shared/private-clock-history";
import { HELIX_SYSTEM_CLOCK_READ_CAPABILITY, helixEnvironmentConnectorProbeRequestSchema, helixEnvironmentConnectorProbeResultSchema,
  type HelixEnvironmentConnectorProbeRequest } from "@shared/helix-environment-connector";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

export type PrivateClockBridge = {
  preparePrivateClock: () => Promise<unknown>;
  observePrivateClock: (request: unknown) => Promise<unknown>;
  recoverPrivateClockObservation: (request?: unknown) => Promise<unknown>;
  stopPrivateClock: () => Promise<unknown>;
};
export type PrivateClockAdmission = { installationRef: string; catalogSnapshotId: string; expiresAt: string };
const readySchema = z.object({ ready: z.literal(true), installationRef: z.string() }).strict();
type Phase = "idle" | "preparing" | "observing" | "history" | "stopping" | "stopped" | "observed" | "error";
const button = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45";

/** Presentation for one private clock check. Native main owns admission,
 * execution, cleanup and durable history. This view never replays a request. */
export default function PrivateClockCheck({ bridge, admission, onActivityChange, blocked = false }: {
  bridge: PrivateClockBridge; admission: PrivateClockAdmission | null; onActivityChange: (active: boolean) => void;
  blocked?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle"), [message, setMessage] = useState("");
  const [observation, setObservation] = useState<{ uptimeMs: number; observedAt: string; historical: boolean } | null>(null);
  const historyRevoked = useRef(false);
  const mounted = useRef(true), sequence = useRef(0), pending = useRef(false), owned = useRef(false), fenced = useRef(false);
  const stopping = useRef<Promise<boolean> | null>(null);
  const last = useRef<{ request: HelixEnvironmentConnectorProbeRequest; installationRef: string } | null>(null);
  const currentAdmission = useRef(admission); currentAdmission.current = admission;
  const seen = useRef(false); if (admission) seen.current = true;
  const key = admission ? JSON.stringify(admission) : "";
  const previousKey = useRef(key);
  const available = () => Boolean(currentAdmission.current && Date.parse(currentAdmission.current.expiresAt) > Date.now());
  const current = (id: number, expected?: PrivateClockAdmission) => mounted.current && sequence.current === id &&
    (!expected || (available() && JSON.stringify(currentAdmission.current) === JSON.stringify(expected)));
  const release = (): Promise<boolean> => {
    if (stopping.current) return stopping.current;
    stopping.current = Promise.resolve().then(() => bridge.stopPrivateClock()).then(() => {
      owned.current = false;
      if (mounted.current) onActivityChange(fenced.current);
      return true;
    }, () => { fenced.current = true; if (mounted.current) onActivityChange(true); return false; })
      .finally(() => { stopping.current = null; });
    return stopping.current;
  };
  const stop = async () => {
    const id = ++sequence.current; pending.current = true; setPhase("stopping"); setObservation(null); setMessage("");
    const clean = await release();
    if (!current(id)) return;
    pending.current = false; setPhase(clean ? "stopped" : "error");
    setMessage(clean ? (fenced.current ? "Cleanup confirmed. Restart the test app before another check." : "Clock stopped.")
      : "Stop could not be confirmed. Keep the app open and retry Stop; another check is blocked.");
  };
  const invalidate = () => {
    last.current = null; setObservation(null);
    if (owned.current || pending.current || stopping.current) { void stop(); }
    else { ++sequence.current; setPhase("idle"); setMessage(""); }
  };
  useEffect(() => {
    if (previousKey.current !== key) { previousKey.current = key; historyRevoked.current = false; invalidate(); }
  }, [key]);
  useEffect(() => {
    mounted.current = true;
    const changed = () => { historyRevoked.current = true; invalidate(); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
    return () => {
      mounted.current = false; ++sequence.current;
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
      if (owned.current || pending.current) void release();
    };
  }, [bridge]);

  const read = async () => {
    if (blocked || !available() || pending.current || fenced.current) return;
    const expected = { ...currentAdmission.current! }, id = ++sequence.current;
    pending.current = true; owned.current = true; onActivityChange(true);
    last.current = null; setObservation(null); setMessage(""); setPhase("preparing");
    try {
      const ready = readySchema.parse(await bridge.preparePrivateClock());
      if (!current(id, expected)) return;
      if (ready.installationRef !== expected.installationRef) throw Error("clock_installation_mismatch");
      const now = Date.now();
      const request: HelixEnvironmentConnectorProbeRequest = { schema: "helix.environment_connector.probe_request.v1",
        probe_request_id: `probe:${crypto.randomUUID()}`, capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY, capability_version: 1,
        catalog_snapshot_id: expected.catalogSnapshotId, arguments: { clock: "monotonic" },
        constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 },
        created_at: new Date(now).toISOString(), deadline_at: new Date(now + 5000).toISOString(),
        assistant_answer: false, raw_content_included: false };
      last.current = { request, installationRef: expected.installationRef }; setPhase("observing");
      const receipt = await bridge.observePrivateClock(structuredClone(request));
      if (!current(id, expected)) return;
      const result = checkedReceipt(receipt, request, expected.installationRef);
      setPhase("stopping");
      if (!await release()) {
        if (current(id)) { setPhase("error"); setMessage("Cleanup could not be confirmed. Another check is blocked; use Stop."); }
        return;
      }
      if (!current(id, expected)) return;
      setObservation({ ...result, historical: false }); setPhase("observed"); setMessage("Read completed; clock stopped.");
    } catch {
      if (!current(id)) return; // An older canceled operation must not stop its successor.
      const clean = await release();
      if (current(id, expected)) {
        setPhase("error"); setMessage(clean && !fenced.current
          ? "Clock check failed or is unavailable in this build. No request will be retried automatically."
          : "Cleanup could not be confirmed. Another check is blocked; use Stop.");
      }
    } finally {
      if (current(id)) {
        pending.current = false;
        // Approval may expire without a parent update while awaiting native IPC.
        if (!available()) invalidate();
      }
    }
  };
  const history = async () => {
    if (blocked || !available() || pending.current || fenced.current || historyRevoked.current) return;
    let saved = last.current;
    const expected = { ...currentAdmission.current! }, id = ++sequence.current;
    pending.current = true; onActivityChange(true); setPhase("history"); setObservation(null); setMessage("");
    try {
      const response = saved ? await bridge.recoverPrivateClockObservation(structuredClone(saved.request))
        : await bridge.recoverPrivateClockObservation();
      if (!current(id, expected)) return;
      let value: z.infer<typeof historySchema>, legacyRecords = 0;
      if (saved) value = historySchema.parse(response);
      else {
        const found = discoverySchema.parse(response); legacyRecords = found.legacyRecords;
        if (found.state === "empty") {
          setPhase("stopped"); setMessage(legacyRecords
            ? "Older history is retained, but its request details are unavailable in this view. No clock read was started."
            : "No saved clock requests for this installation."); return;
        }
        saved = { request: found.request, installationRef: expected.installationRef };
        value = found.history;
      }
      if (value.state === "accepted") {
        const receipt = checkedReceipt(value.receipt, saved.request, saved.installationRef);
        setObservation({ ...receipt, historical: true }); setMessage("Saved observation — not current." +
          (legacyRecords ? " Some older records lack request details and are retained separately." : ""));
      } else setMessage(value.state === "uncertain" ? "Outcome unknown. This request will not be repeated." : "No saved outcome for this request.");
      last.current = saved;
      setPhase("stopped");
    } catch { if (current(id, expected)) { setPhase("error"); setMessage("Saved outcome is unavailable. No clock read was started."); } }
    finally { if (current(id)) { pending.current = false; onActivityChange(fenced.current || owned.current); if (!available()) invalidate(); } }
  };

  if (!seen.current) return null;
  const busy = ["preparing", "observing", "history", "stopping"].includes(phase);
  const status = phase === "preparing" ? "Preparing clock…" : phase === "observing" ? "Reading clock…"
    : phase === "history" ? "Loading saved outcome…" : phase === "stopping" ? "Stopping clock…" : message;
  return <section aria-label="Private clock check" className="mt-6 rounded-2xl border border-cyan-300/20 bg-slate-900 p-5">
    <h2 className="text-lg font-medium">Private clock check</h2>
    <p className="mt-2 text-sm text-slate-400">Read the clock process uptime once. This requires a configured private test runtime; it grants no program control and uses no model or subscription.</p>
    {!available() && <p className="mt-2 text-sm text-amber-200">Current package approval is unavailable. Stop remains available.</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button className={button} disabled={blocked || !available() || busy || fenced.current} onClick={() => void read()}>Read clock once</button>
      <button className={button} disabled={blocked || !available() || busy || fenced.current || historyRevoked.current} onClick={() => void history()}>Load last request history</button>
      <button className={button} disabled={phase === "stopping"} onClick={() => void stop()}>Stop clock</button>
    </div>
    <p role={phase === "error" ? "alert" : "status"} aria-live="polite" className="mt-3 text-sm">{status}</p>
    {observation && <dl className="mt-3 text-sm">
      <dt>{observation.historical ? "Historical process uptime" : "Observed process uptime"}</dt><dd>{observation.uptimeMs} ms</dd>
      <dt className="mt-2">Observed at</dt><dd>{new Date(observation.observedAt).toLocaleString()}</dd>
    </dl>}
    <p className="mt-3 text-xs text-slate-400">After reopening, load the latest saved request for your current installation. History never starts or repeats a clock read.</p>
  </section>;
}
