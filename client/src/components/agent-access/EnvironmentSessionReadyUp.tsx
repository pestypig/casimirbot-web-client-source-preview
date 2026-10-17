import React, { useEffect, useRef, useState } from "react";
import type { BrowserReasoningBinding } from "@/lib/agent-access/reasoningTaskBinding";
import { HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT } from "@/components/helix/ask-console/shared-live-room/SharedLiveRoomGuideProjection";

const recoveryMessages: Record<string, string> = {
  environment_session_goal_missing: "No unfinished environment goal is available for this run. Open Review environment settings below, then use the Minecraft play objective in Player Embodiment to request goal setup from the bound AI task. Pickup alone is not readiness; use Ready up again after setup.",
  durable_goal_session_ambiguous: "More than one unfinished goal belongs to this run. Select the intended goal before continuing.",
  environment_session_subject_changed: "The selected player no longer matches this session. Review the environment's player selection.",
  subject_binding_stale: "Player identity is still stale. The environment must provide fresh player evidence before preparation can finish.",
  subject_binding_required: "This session needs a selected environment player.",
  durable_goal_revision_conflict: "The environment goal changed during preparation. Use Ready up again to check its current state.",
  durable_goal_authority_stale: "The goal's environment authority is not current. Review its state; preparation does not renew or restore revoked permission.",
  environment_session_observation_unavailable: "A fresh player snapshot could not be verified. Check the environment connection, then use Ready up again.",
  reasoning_binding_run_association_stale: "The bound run is not currently verified. Refresh its runtime presence from the same AI task; do not replace a valid chat binding.",
  reasoning_binding_target_inactive: "This AI task's presence is not current. Ask that same task to refresh its CasimirBot presence.",
};

function EnvironmentSessionReadyUpContent({ binding }: { binding: BrowserReasoningBinding }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<number | null>(null);
  const [runExpiresAt, setRunExpiresAt] = useState<number | null>(null);
  const [actionExpiresAt, setActionExpiresAt] = useState<number | null>(null);
  const [sourceExpiresAt, setSourceExpiresAt] = useState<number | null>(null);
  const [blockerDetails, setBlockerDetails] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [repairs, setRepairs] = useState<Array<{ layer: string; changed: boolean | null; reason_code?: string }>>([]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (validUntil === null && runExpiresAt === null && actionExpiresAt === null && sourceExpiresAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [validUntil, runExpiresAt, actionExpiresAt, sourceExpiresAt]);
  const prepare = async () => {
    if (busy || !binding.run_id || binding.status !== "active") return;
    const retryKey = "helix:session-ready-up:v1:" + JSON.stringify([
      binding.reasoning_binding_id, binding.binding_epoch, binding.helix_conversation_id,
      binding.mission_id ?? null, binding.run_id,
    ]);
    let requestId: string;
    try {
      requestId = sessionStorage.getItem(retryKey) || crypto.randomUUID();
      sessionStorage.setItem(retryKey, requestId);
    } catch {
      setMessage("Preparation was not sent: this window cannot retain its retry identity. Restore browser storage before retrying.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setValidUntil(null);
    setRunExpiresAt(null);
    setActionExpiresAt(null);
    setSourceExpiresAt(null);
    setBlockerDetails([]);
    setRoomId(null);
    setEnvironmentId(null);
    setRepairs([]);
    setMessage("Checking this session and requesting a fresh observation…");
    try {
      const response = await fetch("/api/account/session/agent-connections/environment-session/ready-up", {
        method: "POST", credentials: "include", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reasoning_binding_id: binding.reasoning_binding_id,
          binding_epoch: binding.binding_epoch, helix_conversation_id: binding.helix_conversation_id,
          mission_id: binding.mission_id ?? null, run_id: binding.run_id,
          request_id: requestId }),
      });
      const body = await response.json();
      if (controller.signal.aborted) return;
      // Only a confirmed outcome permits the next click to request new evidence.
      // Unknown outcomes retain broker deduplication across panel remounts.
      if (response.ok && body.ok === true && sessionStorage.getItem(retryKey) === requestId) {
        sessionStorage.removeItem(retryKey);
      }
      if (response.ok && body.ok === true && Array.isArray(body.readiness?.checks)) {
        const source = body.readiness.checks.find((check: { layer?: unknown }) => check?.layer === "source");
        if (typeof source?.expires_at_ms === "number" && Number.isFinite(source.expires_at_ms)) {
          setSourceExpiresAt(source.expires_at_ms);
          setNow(Date.now());
        }
        const authority = body.readiness.checks.find((check: { layer?: unknown }) => check?.layer === "authority");
        const expiry = authority?.expires_at_ms;
        if (typeof expiry === "number" && Number.isFinite(expiry)) {
          setActionExpiresAt(expiry);
          setNow(Date.now());
        }
        const details: string[] = [];
        if (authority?.human_approval_required === true) {
          details.push("Room-owner approval is required for a new gameplay grant. Review the exact player and capabilities in Player Embodiment; Ready up will not activate that approval.");
        }
        if (authority?.state === "revoked") {
          details.push("Gameplay permission was revoked. Review Player Embodiment in this room; Ready up cannot restore revoked permission. Keep the chat binding.");
        } else if (typeof expiry === "number" && Number.isFinite(expiry) && expiry <= Date.now()) {
          details.push("The last verified gameplay lease has expired. Review Player Embodiment in this room for a new finite grant; replacing the chat binding will not restore gameplay permission.");
        }
        if (body.readiness.checks.some((check: { layer?: unknown; state?: unknown }) => check?.layer === "controller" && check.state !== "verified")) {
          details.push("The player controller is not ready. Check its connection and manual-control state in Player Embodiment; this does not by itself mean another permission is needed.");
        }
        setBlockerDetails(details);
      }
      if (response.ok && body.ok === true && typeof body.session_deadlines?.run_expires_at_ms === "number" &&
          Number.isFinite(body.session_deadlines.run_expires_at_ms)) {
        setRunExpiresAt(body.session_deadlines.run_expires_at_ms);
        setNow(Date.now());
      }
      if (Array.isArray(body.repairs)) {
        setRepairs(body.repairs.filter((repair: { layer?: unknown; changed?: unknown }) =>
          (repair?.layer === "subject" || repair?.layer === "goal") &&
          (typeof repair.changed === "boolean" || repair.changed === null)));
      }
      const missingGoalHandoff = body.schema === "helix.environment_session_error.v1" &&
        body.ok === false && body.error === "environment_session_goal_missing" &&
        body.readiness_confirmed === false;
      if (((response.ok && body.ok === true) || missingGoalHandoff) && typeof body.selection?.room_id === "string") {
        setRoomId(body.selection.room_id);
        if (!missingGoalHandoff && typeof body.selection.environment_binding_id === "string") setEnvironmentId(body.selection.environment_binding_id);
      }
      if (!response.ok || body.ok !== true) {
        const code = typeof body.error === "string" ? body.error : "preparation unavailable";
        setMessage(`${recoveryMessages[code] ?? `Session is not ready: ${code}.`} Your binding was not replaced.${body.partial_effects_unknown === true
          ? " Additional setup changes may have completed; inspect current state before continuing." : ""}`);
      } else if (body.readiness?.ready === true) {
        if (typeof body.readiness.valid_until_ms !== "number" || !Number.isFinite(body.readiness.valid_until_ms)) {
          setMessage("Preparation validity could not be confirmed. Retry Ready up; no permissions were changed.");
        } else {
          setNow(Date.now());
          setValidUntil(body.readiness.valid_until_ms);
          setMessage("Session prerequisites checked. Ready for the bound AI task to request admitted actions; no movement was started.");
        }
      } else {
        const checks = Array.isArray(body.readiness?.checks) ? body.readiness.checks : [];
        const blocked = checks.filter((check: { state?: string }) => check.state !== "verified")
          .map((check: { layer?: string }) => check.layer).filter((layer: unknown) => typeof layer === "string");
        setMessage(`Session still needs attention${blocked.length ? `: ${blocked.join(", ")}` : ""}. No new permissions were granted.`);
      }
    } catch {
      if (!controller.signal.aborted) setMessage("Preparation could not be confirmed. Some setup steps may already have completed. Use Ready up to inspect current state; do not replace the binding.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return <div className="mt-3 border-t border-white/15 pt-3">
    <button type="button" onClick={() => void prepare()} disabled={busy || !binding.run_id}
      className="rounded border border-cyan-300/30 px-3 py-2 disabled:opacity-50">
      {busy ? "Preparing session…" : "Ready up"}
    </button>
    <p className="mt-1">Checks the bound environment session without replacing its binding or renewing permissions.</p>
    {!binding.run_id ? <p>Associate an environment run before preparing this session.</p> : null}
    {roomId ? <button type="button" className="mt-2 rounded border border-white/20 px-3 py-2" onClick={() => {
      const event = new CustomEvent(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, {
        detail: { roomId, ...(environmentId ? { environmentBindingId: environmentId } : {}),
          onResult: (opened: boolean) => setMessage(opened
            ? "Showing the bound room's environment settings. No permissions changed."
            : "The bound room could not be opened. No other room was selected and no permissions changed."),
        }, cancelable: true,
      });
      if (window.dispatchEvent(event)) {
        setMessage("The bound room's controls are not currently available in this workspace. No other room was opened and no permissions changed.");
        setValidUntil(null);
      }
    }}>Review environment settings</button> : null}
    {message ? <p role="status" className="mt-2">{validUntil !== null && now >= validUntil
      ? "The readiness check has aged out. Use Ready up to check again; your binding was not revoked."
      : message}</p> : null}
    {validUntil !== null && now < validUntil ? <p>
      Readiness evidence: {Math.ceil((validUntil - now) / 1000)} seconds remaining (local clock estimate).
      This is not your binding or permission lease duration.
    </p> : null}
    {repairs.length ? <ul aria-label="Setup repair results" className="mt-2">
      {repairs.map((repair, index) => <li key={`${repair.layer}:${index}`}>
        {repair.layer === "subject" ? "Player identity" : "Environment goal"}: {repair.changed === true
          ? "updated" : repair.changed === false ? "no change reported"
            : repair.layer === "goal" && repair.reason_code === "goal_creation_or_replay_verified"
              ? "creation or replay verified; change count unspecified"
              : "partial outcome uncertain; check current state"}.
      </li>)}
    </ul> : null}
    {blockerDetails.length ? <ul aria-label="Session recovery details" className="mt-2">
      {blockerDetails.map(detail => <li key={detail}>{detail}</li>)}
    </ul> : null}
    {sourceExpiresAt !== null ? <p>
      Source credential deadline: {new Date(sourceExpiresAt).toLocaleTimeString()}.
      {now < sourceExpiresAt ? ` About ${Math.ceil((sourceExpiresAt - now) / 60000)} minutes until that deadline.` : " The last verified source credential deadline has passed."}
      {" "}This is separate from gameplay permission; Ready up does not renew it.
    </p> : null}
    {actionExpiresAt !== null ? <p>
      Gameplay permission deadline: {new Date(actionExpiresAt).toLocaleTimeString()}.
      {now < actionExpiresAt ? ` About ${Math.ceil((actionExpiresAt - now) / 60000)} minutes until that deadline.` : " The last verified gameplay deadline has passed."}
      {" This deadline does not override revocation or controller readiness and is separate from chat binding."}
    </p> : null}
    {runExpiresAt !== null ? <p>
      Environment run deadline: {new Date(runExpiresAt).toLocaleTimeString()}.
      {now < runExpiresAt ? ` About ${Math.ceil((runExpiresAt - now) / 60000)} minutes remaining.` : " The last verified run deadline has passed."}
      {" This is separate from chat binding and gameplay permission; Ready up does not extend it."}
    </p> : null}
  </div>;
}

export default function EnvironmentSessionReadyUp({ binding }: { binding: BrowserReasoningBinding }) {
  // Reset all cached evidence and abort the previous request on an exact-target
  // change. A new binding must never inherit another session's controls.
  const identity = JSON.stringify([binding.reasoning_binding_id, binding.binding_epoch,
    binding.helix_conversation_id, binding.mission_id ?? null, binding.run_id ?? null,
    binding.status, binding.continuation_transport]);
  return <EnvironmentSessionReadyUpContent key={identity} binding={binding} />;
}
