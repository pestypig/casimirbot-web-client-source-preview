import React, { useCallback, useEffect, useRef, useState } from "react";
import { NATIVE_DISCORD_TASK_PATH, nativeDiscordTaskStatusSchema, type NativeDiscordTaskControl } from "@shared/native-discord-task-control";
import { discordAgentTaskViewSchema, type DiscordAgentTaskView } from "@shared/discord-agent-task-view";
import { discordTaskConfigurationSchema, type DiscordTaskConfiguration } from "@shared/discord-task-configuration";
import { DiscordTaskConfigurationView } from "@/components/account/DiscordTaskConfigurationView";
import { parseDesktopAuth0AccountLinkStartReceipt } from "@shared/desktop-auth0-account-link";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from "@/lib/agent-access/connectionObservation";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

type Status = { ready: boolean; write_scope: boolean; expires_at: string | null; domain_profile_ref: string | null };
class RequestError extends Error { constructor(readonly unknownOutcome: boolean, readonly code?: string) { super("task_request_failed"); } }
const button = "rounded border border-white/20 px-3 py-1 text-sm disabled:opacity-40";
type Action = DiscordAgentTaskView["intent"]["actions"][number];
function describeAction(action: Action): string {
  const destination = "destination" in action ? action.destination.kind === "existing"
    ? `channel ${action.destination.channel_id}` : `the channel created by ${action.destination.create_action_id}` : "";
  switch (action.kind) {
    case "channel_create": return `Create #${action.name} in category ${action.category_id}.`;
    case "channel_update": return `Update channel ${action.channel_id}${action.name ? ` to #${action.name}` : ""}${action.category_id ? ` in category ${action.category_id}` : ""}; ${action.permission_policy === "preserve_existing" ? "retain existing channel permissions" : "permission policy unspecified; a new proposal and review are required"}.`;
    case "voice_session": return `${action.mode === "gpt_live" ? "GPT Live" : "Join voice"} in channel ${action.channel_id}, at most ${action.max_duration_seconds} seconds.`;
    case "neutrino_publish": return `Publish at most ${action.max_posts} IceCube alert (${action.native_event_id}) to ${destination}, using ${action.source_ref}. Revision: ${action.revision_sha256}. Artifact: ${action.artifact_id}. No reasoning.`;
    case "solar_publish": return `Publish at most ${action.max_events} HEK events (${action.event_types.join(", ")}) to ${destination}, ${action.window_start_utc} through ${action.window_end_utc}.`;
    case "solar_subscribe": return `Send new HEK reports (${action.event_types.join(", ")}) to ${destination} from activation onward; ${action.max_posts === undefined ? "alert cap unspecified; a new proposal is required before activation" : `at most ${action.max_posts} alerts before expiry`}.`;
    case "solar_redirect": return `Redirect the existing ${action.expected.mode} HEK feed from channel ${action.expected.channel_id} to ${destination}; preserve mode, event cursor and delivery history. Expected setting revision: ${action.expected.revision_sha256}. This stays configured until changed or disabled; Stop or task expiry does not undo a completed redirect.`;
    case "analysis_post": return `Post at most ${action.max_posts} explanations to ${destination}, using ${action.source_refs.join(", ")}.`;
  }
}

export function CaptainKeyesTaskAccess() {
  const native = Boolean(window.casimirDesktop?.openAuth0AccountLink);
  const [status, setStatus] = useState<Status | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [access, setAccess] = useState<"read" | "write">("read");
  const [taskId, setTaskId] = useState("");
  const [task, setTask] = useState<DiscordAgentTaskView | null>(null);
  const [configuration, setConfiguration] = useState<DiscordTaskConfiguration | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [unknown, setUnknown] = useState(false);
  const generation = useRef(0);
  const domainProfile = useRef<string | null>(null);
  const request = useCallback(async (operation: NativeDiscordTaskControl) => {
    const response = await fetch(NATIVE_DISCORD_TASK_PATH, { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(operation) });
    const body = await response.json();
    if (!response.ok || !body.ok) throw new RequestError(body.outcome_unknown === true, body.error);
    return body.result;
  }, []);
  const refreshStatus = useCallback(async () => {
    const current = generation.current;
    try {
      const next = nativeDiscordTaskStatusSchema.parse(await request({ operation: "status" }));
      if (current === generation.current) {
        if (domainProfile.current !== next.domain_profile_ref || !next.ready) { setTask(null); setConfiguration(null); }
        domainProfile.current = next.domain_profile_ref;
        setAvailable(true);
        setStatus(next);
      }
    } catch (error) { if (current === generation.current) { setStatus(null); setTask(null); setConfiguration(null);
      setAvailable(!(error instanceof RequestError && error.code === "discord_task_connection_not_configured")); } }
  }, [request]);
  useEffect(() => {
    if (!native) return;
    void refreshStatus();
    const unsubscribe = window.casimirDesktop?.onAuth0AccountLinkCompletion?.(() => { void refreshStatus(); });
    const invalidate = () => { generation.current++; domainProfile.current = null; setStatus(null); setTask(null); setConfiguration(null); setBusy(false);
      setMessage(""); setUnknown(false); void refreshStatus(); };
    window.addEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, invalidate);
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, invalidate);
    return () => { generation.current++; unsubscribe?.();
      window.removeEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, invalidate);
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, invalidate); };
  }, [native, refreshStatus]);
  useEffect(() => {
    if (!status?.ready || !status.expires_at) return;
    const expire = () => { generation.current++; setStatus(null); setTask(null); setConfiguration(null); setBusy(false);
      setMessage("Task access has expired. Authorize access again to reconnect."); };
    const delay = Date.parse(status.expires_at) - Date.now();
    if (delay <= 0) { expire(); return; }
    const timer = window.setTimeout(expire, Math.min(delay, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [status]);
  if (!native || available !== true) return null;
  const act = async (operation: "authorize" | "inspect" | "stop" | "disconnect" | "configuration") => {
    setBusy(true); setMessage("");
    if (operation === "configuration") setConfiguration(null);
    const current = generation.current;
    try {
      if (operation === "authorize") {
        const receipt = parseDesktopAuth0AccountLinkStartReceipt(await request({ operation, access }));
        if (current !== generation.current) return;
        if (!receipt) throw new Error("invalid_authorization");
        await window.casimirDesktop!.openAuth0AccountLink!(receipt.authorization_url);
        if (current === generation.current) setMessage("Complete account authorization in your browser, then refresh access.");
      } else if (operation === "disconnect") {
        await request({ operation });
        if (current === generation.current) { generation.current++; setStatus(null); setTask(null); setConfiguration(null); setUnknown(false);
          setMessage("This desktop is disconnected. Existing tasks can still be stopped from their website review."); }
      } else if (operation === "configuration") {
        const result = await request({ operation });
        const next = discordTaskConfigurationSchema.parse(result.configuration);
        if (current === generation.current) {
          if (next.owner_profile_ref !== domainProfile.current) throw new Error("configuration_owner_changed");
          setConfiguration(next);
        }
      } else {
        const id = operation === "stop" ? task?.id : taskId.trim();
        if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
          throw new Error("invalid_task_id");
        const result = await request({ operation, task_id: id });
        const next = discordAgentTaskViewSchema.parse(result.task);
        if (next.intent.owner_profile_ref !== domainProfile.current) throw new Error("task_owner_changed");
        if (current === generation.current) { setTask(next); setUnknown(false); }
      }
    } catch (error) {
      if (current === generation.current) {
        const uncertain = operation === "stop" && (!(error instanceof RequestError) || error.unknownOutcome);
        if (uncertain) setUnknown(true);
        setMessage(uncertain ? "The Stop result is unknown. Inspect the task before trying again."
          : "The request could not complete. Check your sign-in, access and task ID, then refresh.");
      }
    } finally { if (current === generation.current || operation === "disconnect") setBusy(false); }
  };
  return <section className="mb-4 rounded-lg border border-cyan-500/20 bg-slate-950 p-4 text-slate-200" aria-label="Captain Keyes tasks">
    <h2 className="font-semibold">Captain Keyes tasks</h2>
    <p className="mt-1 text-sm text-slate-400">Connect this desktop to the tasks you review on casimirbot.com. Each operation keeps its own sources, audience, limits and approval.</p>
    <p className="my-2 text-sm">{status?.ready ? `Connected · ${status.write_scope ? "read, propose and Stop" : "read only"}` : "Task access is not connected."}
      {status?.expires_at ? ` · expires ${new Date(status.expires_at).toLocaleString()}` : ""}</p>
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm">Desktop access <select data-helix-control-id="workstation.panel.account-session.captain-keyes-task-access.captain-keyes-desktop-access" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" aria-label="Captain Keyes desktop access" value={access} onChange={e => setAccess(e.target.value as "read" | "write")} disabled={busy} className="ml-2 bg-slate-900 p-1">
        <option value="read">Read task status and saved setup</option><option value="write">Read, propose and Stop tasks</option>
      </select></label>
      <button data-helix-control-id="workstation.panel.account-session.captain-keyes-task-access.authorize-access" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" className={button} disabled={busy} onClick={() => void act("authorize")}>Authorize access</button>
      <button data-helix-control-id="workstation.panel.account-session.captain-keyes-task-access.refresh-access" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" className={button} disabled={busy} onClick={() => void refreshStatus()}>Refresh access</button>
      <button data-helix-control-id="workstation.panel.account-session.captain-keyes-task-access.disconnect-this-desktop" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" className={button} disabled={busy} onClick={() => void act("disconnect")}>Disconnect this desktop</button>
    </div>
    <p className="my-2 text-sm text-slate-400">Task access lets you inspect or propose contracts. Website review still authorizes the exact operation; this connection starts no paid reasoning.</p>
    <button data-helix-control-id="workstation.panel.account-session.captain-keyes-task-access.load-saved-discord-setup" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" className={button} disabled={busy || !status?.ready} onClick={() => void act("configuration")}>Load saved Discord setup</button>
    {configuration && status?.ready && configuration.owner_profile_ref === status.domain_profile_ref ?
      <div className="my-3 border-t border-white/10 pt-3"><DiscordTaskConfigurationView configuration={configuration} native /></div> : null}
    <div className="flex flex-wrap gap-2"><input data-helix-control-id="workstation.panel.account-session.captain-keyes-task-access.captain-keyes-task-id" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" aria-label="Captain Keyes task ID" placeholder="Task ID from your private review" value={taskId} onChange={e => { setTaskId(e.target.value); setTask(null); }} className="min-w-64 flex-1 rounded bg-slate-900 p-2 text-sm" />
      <button data-helix-control-id="workstation.panel.account-session.captain-keyes-task-access.inspect-task" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" className={button} disabled={busy || !status?.ready} onClick={() => void act("inspect")}>Inspect task</button></div>
    {task ? <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-sm">
      <h3 className="font-semibold">{task.intent.declared_task_summary}</h3>
      <p>{({review_required:"Awaiting your review",approved_pending_checks:"Approved; required checks still apply",stopped:"Stopped",expired:"Expired"})[task.status]}</p>
      <div className="grid gap-1"><div>Server: {task.intent.guild_id} · requester: {task.intent.requester_discord_user_id}</div>
        <div>CasimirBot account: {task.intent.owner_profile_ref}</div>
        <div>Audience: {task.intent.audience === "server_members" ? "Server members" : "Destination channel members"}</div>
        <div>Bot: {task.intent.application.kind === "official" ? "Captain Keyes" : "Subscriber-owned"} ({task.intent.application.application_id})</div>
        <div>Discord executor: {({domain:"CasimirBot service",personal_harness:"Your connected desktop",subscriber_relay:"Subscriber bot relay"})[task.intent.executor.kind]} · expires {new Date(task.expires_at).toLocaleString()}</div>
        {task.intent.reasoning.mode !== "none" ? <div>Reasoning executor: {task.intent.reasoning.executor ? `${task.intent.reasoning.executor.kind.replaceAll("_"," ")} · ${"executor_ref" in task.intent.reasoning.executor ? task.intent.reasoning.executor.executor_ref : "installation_ref" in task.intent.reasoning.executor ? task.intent.reasoning.executor.installation_ref : task.intent.reasoning.executor.relay_ref}` : "Unspecified; a new proposal and review are required before reasoning"}</div> : null}
        <div>Reasoning: {({none:"None",own_key:"Owner API key",managed_allowance:"Approved hosted allowance",platform_editorial:"Platform editorial budget"})[task.intent.reasoning.mode]}{task.intent.reasoning.mode !== "none" ? ` · maximum ${(task.intent.reasoning.max_provider_cost_micros / 1_000_000).toLocaleString("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:6})} · ${task.intent.reasoning.max_explanations} explanations` : ""}</div></div>
      <details><summary>Exact operation contract</summary>
        <p className="my-2">Task {task.intent.task_ref} · origin channel {task.intent.origin_channel_id}</p>
        <ol className="list-inside list-decimal space-y-1">{task.intent.actions.map(action => <li key={action.action_id}>{describeAction(action)}</li>)}</ol>
        <p className="mt-2 font-medium">Admitted sources</p>
        <ul className="list-inside list-disc">{task.intent.sources.map(source => <li key={source.source_ref}>{source.source_ref} · {source.kind} · {source.access === "public" ? "public source" : `read and audience release from ${source.source_owner_profile_ref}`}</li>)}</ul>
        {task.intent.reasoning.mode !== "none" ? <p className="mt-2">Provider {task.intent.reasoning.provider_ref} · funding {task.intent.reasoning.mode === "own_key" ? task.intent.reasoning.connection_ref : task.intent.reasoning.mode === "managed_allowance" ? task.intent.reasoning.allowance_ref : task.intent.reasoning.platform_budget_ref}</p> : null}
        <p className="mt-2 break-all text-xs text-slate-400">Reviewed revision: {task.review_revision}</p>
      </details>
      <div className="flex flex-wrap gap-2"><a className={button} href={`https://casimirbot.com/discord/tasks/${task.id}`} target="_blank" rel="noopener noreferrer">Open private review</a>
        <button data-helix-control-id="workstation.panel.account-session.captain-keyes-task-access.stop-this-task" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" className={button} disabled={busy || unknown || !status?.write_scope || ["stopped","expired"].includes(task.status)} onClick={() => void act("stop")}>Stop this task</button></div>
      {task.voice_effect ? <p>Voice worker: {task.voice_effect.worker_state ?? "awaiting receipt"} · audio processing remains off.</p> : null}
    </div> : null}
    {message ? <p className="mt-2 text-sm" role="status">{message}</p> : null}
  </section>;
}
