import React, { useCallback, useEffect, useRef, useState } from "react";
import { helixMinecraftLocalSelectionObservationSchema } from "@shared/helix-minecraft-local-lifecycle";
import { RESPONSES_ACTION_PILOT_MODEL } from "@shared/helix-responses-action-provider-request";

const SELECTION_URL = "/api/agi/environment-connectors/local/minecraft/fabric-loopback/selection";
const MAX_AGE_MS = 30_000;
const MAX_FUTURE_SKEW_MS = 5_000;
const button = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300";
const outputSources = [
  { name: "Codex conversation", role: "Planned opt-in exact-task mirror of user-visible turns. It excludes hidden reasoning and is not the mission activity record." },
  { name: "Helix activity", role: "Source-backed requests, admission, observations and receipts in the canonical operator record; a receipt is not an assistant answer." },
  { name: "Responses AI", role: "Owner-approved model choices appear with their run and decision identity. A choice is distinct from plan admission, Fabric execution and measured movement." },
  { name: "Live room", role: "Discussion remains discussion until an author selects a message and the owner approves exact-task steering." },
  { name: "Fabric controller", role: "Measured tick-window progress and interruption receipts for admitted actions, not a per-tick transcript." },
] as const;

export type MinecraftHomeSelectionInspection =
  | { status: "checking" | "missing" | "unavailable" | "stale" }
  | { status: "saved"; address: string; observedAt: string };

/** One exact local read. It never verifies a listener, client, source or grant. */
export async function inspectMinecraftHomeSelection(
  fetcher: typeof fetch,
  now: number | (() => number),
  signal?: AbortSignal,
): Promise<MinecraftHomeSelectionInspection> {
  try {
    const response = await fetcher(SELECTION_URL, {
      credentials: "same-origin", cache: "no-store", ...(signal ? { signal } : {}),
    });
    if (response.status === 409) {
      const error: unknown = await response.json();
      return error && typeof error === "object" &&
        (error as { error?: unknown }).error === "minecraft_saved_loopback_selection_required"
        ? { status: "missing" } : { status: "unavailable" };
    }
    if (!response.ok) return { status: "unavailable" };
    const parsed = helixMinecraftLocalSelectionObservationSchema.safeParse(await response.json());
    if (!parsed.success) return { status: "unavailable" };
    const observedAt = Date.parse(parsed.data.observed_at);
    const checkedAt = typeof now === "function" ? now() : now;
    if (!Number.isFinite(observedAt) || observedAt > checkedAt + MAX_FUTURE_SKEW_MS || checkedAt - observedAt >= MAX_AGE_MS) {
      return { status: "stale" };
    }
    return { status: "saved", address: parsed.data.address, observedAt: parsed.data.observed_at };
  } catch {
    return { status: "unavailable" };
  }
}

export default function MinecraftHomeReadinessPreview({
  onClose, onOpenLocalHarness, onOpenAgentAccess,
}: {
  onClose: () => void;
  onOpenLocalHarness: () => void;
  onOpenAgentAccess: () => void;
}) {
  const [inspection, setInspection] = useState<MinecraftHomeSelectionInspection>({ status: "checking" });
  const [approval, setApproval] = useState<"idle" | "requesting" | "approved" |
    "cancelled" | "not_ready" | "unavailable">("idle");
  const [responsesSession, setResponsesSession] = useState<{
    status: string; remainingCalls?: number; maxCalls?: number;
    expiresAt?: string | null;
  }>({ status: "checking" });
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const request = ++generation.current;
    setInspection({ status: "checking" });
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    const next = await inspectMinecraftHomeSelection(fetch, Date.now, controller.signal);
    window.clearTimeout(timeout);
    if (activeRequest.current === controller) activeRequest.current = null;
    if (request === generation.current) setInspection(next);
  }, []);
  useEffect(() => {
    void refresh();
    return () => { generation.current++; activeRequest.current?.abort(); activeRequest.current = null; };
  }, [refresh]);
  useEffect(() => {
    const read = async () => {
      try {
        const result = await window.casimirDesktop?.responsesActionSession?.("state");
        if (result) setResponsesSession(result);
      } catch { setResponsesSession({ status: "unavailable" }); }
    };
    void read();
    const timer = window.setInterval(() => { void read(); }, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (inspection.status !== "saved") return;
    const remaining = Math.max(0, Date.parse(inspection.observedAt) + MAX_AGE_MS - Date.now());
    const timer = window.setTimeout(() => setInspection({ status: "stale" }), remaining);
    return () => window.clearTimeout(timer);
  }, [inspection]);

  const summary = inspection.status === "saved" ? "Saved loopback address found" :
    inspection.status === "missing" ? "No saved loopback address" :
    inspection.status === "stale" ? "Address check is stale" :
    inspection.status === "checking" ? "Checking saved selection…" : "Selection check unavailable";

  return <section aria-label="Minecraft Adapter setup" className="mt-6 rounded-2xl border border-cyan-300/20 bg-slate-900 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs uppercase tracking-widest text-cyan-300">Developer preview · setup inspection</p>
        <h2 className="mt-1 text-lg font-medium">Minecraft Adapter setup</h2></div>
      <div className="flex gap-2"><button className={button} type="button" onClick={() => void refresh()}>Check setup</button>
        <button className={button} type="button" onClick={onClose}>Close Minecraft Adapter setup</button></div>
    </div>
    <p role="status" aria-live="polite" className="mt-4 text-sm text-cyan-100">{summary}</p>
    {inspection.status === "saved" && <p className="mt-2 text-sm text-slate-300">Saved loopback address: <code>{inspection.address}</code>. Checked at {new Date(inspection.observedAt).toLocaleTimeString()}.</p>}
    <p className="mt-3 text-sm text-slate-400">This checks only the saved loopback server address. Server ownership, selected client profile, Minecraft client, Fabric sensing, MCP attachment and player authority are not verified here. Nothing was started or granted.</p>
    <section className="mt-5 rounded-xl border border-white/10 bg-slate-950/60 p-4" aria-label="Minecraft Adapter output sources">
      <h3 className="text-sm font-medium text-slate-100">Where session output belongs</h3>
      <p className="mt-1 text-xs text-slate-400">These are separate presentation lanes, not readiness checks; some are not connected in this build. Opening this view does not start a Codex task, forward room messages, or enable game control.</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {outputSources.map(source => <div key={source.name} className="rounded-lg border border-white/10 p-3">
          <dt className="text-sm font-medium text-cyan-100">{source.name}</dt>
          <dd className="mt-1 text-xs leading-relaxed text-slate-400">{source.role}</dd>
        </div>)}
      </dl>
    </section>
    {window.casimirDesktop?.responsesActionSession && <section
      className="mt-5 rounded-xl border border-cyan-300/30 bg-slate-950/60 p-4"
      aria-label="Responses AI development session">
      <h3 className="text-sm font-medium text-cyan-100">Responses AI development session</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">One native owner approval allows up to 5,000 short {RESPONSES_ACTION_PILOT_MODEL} calls over eight hours using your saved API key. Calls may be billed. Pairing, a verified Minecraft run and separate action permission remain required; this button starts no model call or movement. Closing the EXE ends the allowance.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={button} type="button" disabled={responsesSession.status === "requesting"}
          onClick={async () => {
            setResponsesSession({ status: "requesting" });
            try {
              const result = await window.casimirDesktop?.responsesActionSession?.("approve");
              setResponsesSession(result ?? { status: "unavailable" });
            } catch { setResponsesSession({ status: "unavailable" }); }
          }}>Allow bounded session</button>
        <button className={button} type="button" disabled={responsesSession.status !== "active" && responsesSession.status !== "approved"}
          onClick={async () => {
            try {
              const result = await window.casimirDesktop?.responsesActionSession?.("stop");
              setResponsesSession(result ?? { status: "unavailable" });
            } catch { setResponsesSession({ status: "unavailable" }); }
          }}>Stop Responses session</button>
      </div>
      <p role="status" className="mt-2 text-xs text-cyan-100">{
        responsesSession.status === "requesting" ? "Waiting for native confirmation…" :
        responsesSession.status === "active" || responsesSession.status === "approved"
          ? `Active: ${responsesSession.remainingCalls ?? 0} of ${responsesSession.maxCalls ?? 0} calls remain${responsesSession.expiresAt ? `; expires ${new Date(responsesSession.expiresAt).toLocaleString()}` : ""}.` :
        responsesSession.status === "stopped" ? "Stopped; no more calls are authorized." :
        responsesSession.status === "not_ready" ? "Sign in, activate developer access and enable Full Harness first." :
        responsesSession.status === "cancelled" ? "No session was approved." :
        responsesSession.status === "checking" ? "Checking session allowance…" :
        "No active Responses session."
      }</p>
    </section>}
    {window.casimirDesktop?.authorizeResponsesActionChoiceOnce && <section
      className="mt-5 rounded-xl border border-amber-300/30 bg-slate-950/60 p-4"
      aria-label="Responses Actor shadow approval">
      <h3 className="text-sm font-medium text-amber-100">Diagnostic one-call shadow test</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">Approve one {RESPONSES_ACTION_PILOT_MODEL} suggestion using your saved API key. A native confirmation follows. A verified, paired task must still present current candidates; this button alone sends no request and never moves the player. Approval expires within two minutes and cannot be reused.</p>
      <button className={`${button} mt-3`} type="button" disabled={approval === "requesting" ||
        responsesSession.status === "active" || responsesSession.status === "approved"}
        onClick={async () => {
          setApproval("requesting");
          try {
            const result = await window.casimirDesktop?.authorizeResponsesActionChoiceOnce?.();
            setApproval(result?.status ?? "unavailable");
          } catch { setApproval("unavailable"); }
        }}>Allow one shadow suggestion</button>
      {approval !== "idle" && <p role="status" className="mt-2 text-xs text-amber-100">{
        approval === "requesting" ? "Waiting for native confirmation…" :
        approval === "approved" ? "One shadow request is approved for up to two minutes; none was sent by this button." :
        approval === "cancelled" ? "No request approved." :
        approval === "not_ready" ? "Sign in with active developer access and enable Full Harness in this window first." :
        "Approval unavailable; no request was sent."
      }</p>}
    </section>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button className={button} type="button" onClick={onOpenLocalHarness}>Open local harness</button>
      <button className={button} type="button" onClick={onOpenAgentAccess}>Open Agent Access</button>
    </div>
  </section>;
}
