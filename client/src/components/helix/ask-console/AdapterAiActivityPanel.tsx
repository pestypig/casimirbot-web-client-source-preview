import React, { useState } from "react";
import type { HelixAdapterAiActivityPage } from
  "@shared/helix-environment-action-activity";
import type { AdapterAiActivityReadFailure } from
  "@/components/agent-access/useAdapterAiActivity";

type AdapterRun = { page: HelixAdapterAiActivityPage;
  adapterRef: string; events: HelixAdapterAiActivityPage["events"] };
const runKey = (run: AdapterRun) =>
  JSON.stringify([run.page.helix_conversation_id, run.page.run_id, run.adapterRef]);

/** Read-only run history. Choices and native result receipts are distinct;
 * sharing a run does not prove one choice caused a particular action. */
const failureText: Record<AdapterAiActivityReadFailure, string> = {
  sign_in_required: "Sign in to CasimirBot to read this activity.",
  binding_unavailable: "The exact task binding or verified run is unavailable. Check Agent Access.",
  activity_unavailable: "Activity could not be read right now. Retrying automatically.",
  invalid_activity_response: "The activity response could not be verified. Retrying automatically.",
};

export function AdapterAiActivityPanel({ pages, chatTitles, requestedChatIds = [],
  readFailures = {} }: {
  pages: readonly HelixAdapterAiActivityPage[];
  chatTitles: readonly { id: string; title: string }[];
  requestedChatIds?: readonly string[];
  readFailures?: Readonly<Record<string, AdapterAiActivityReadFailure>>;
}) {
  const [selectedRunKey, setSelectedRunKey] = useState("");
  const runs: AdapterRun[] = pages.flatMap(page => {
    const groups = new Map<string, HelixAdapterAiActivityPage["events"]>();
    for (const event of page.events) {
      if (!["responses_action", "adapter_action_result"].includes(event.source_kind) ||
          event.run_id !== page.run_id ||
          event.helix_conversation_ref !== page.helix_conversation_id ||
          event.reasoning_binding_ref !== page.reasoning_binding_id ||
          event.reasoning_binding_epoch !== page.binding_epoch ||
          event.visibility !== "profile" || event.redaction_state !== "sanitized" ||
          event.raw_content_included || event.answer_authority) continue;
      const ref = event.source_ref ?? event.node_ref;
      groups.set(ref, [...(groups.get(ref) ?? []), event]);
    }
    if (!groups.size) groups.set("source:pending", []);
    return [...groups].map(([adapterRef, events]) => ({ page, adapterRef, events }));
  }).sort((left, right) =>
    Date.parse(right.events.at(-1)?.observed_at ?? "1970-01-01") -
    Date.parse(left.events.at(-1)?.observed_at ?? "1970-01-01"));
  const selected = runs.find(run => runKey(run) === selectedRunKey) ?? runs[0];
  const titles = new Map(chatTitles.map(chat => [chat.id, chat.title]));
  const failures = Object.entries(readFailures);
  return <section aria-label="Adapter AI activity" className="space-y-3 text-xs text-slate-200">
    <p className="text-slate-400">Owner-private Responses choices and separately validated adapter result receipts for currently verified runs. A shared run alone does not prove a choice caused an action.</p>
    {failures.map(([chatId, failure]) => <p key={chatId} role="status"
      className="rounded-lg border border-amber-300/30 bg-amber-300/5 p-3 text-amber-100">
      {titles.get(chatId) || `Helix chat ${chatId.slice(0, 8)}`}: {failureText[failure]}
    </p>)}
    {runs.length ? <>
      <label className="block text-slate-300">Adapter run
        <select aria-label="Adapter AI runs" className="mt-1 block max-w-full rounded border border-white/20 bg-slate-950 p-2 text-slate-100"
          value={runKey(selected)} onChange={event => setSelectedRunKey(event.target.value)}>
          {runs.map(run => <option key={runKey(run)} value={runKey(run)}>
            Adapter · {run.adapterRef.slice(0, 12)} · {run.page.run_id.slice(0, 12)} · {titles.get(run.page.helix_conversation_id) || "Untitled Helix chat"}
          </option>)}
        </select>
      </label>
      <div className="rounded-lg border border-cyan-400/20 bg-slate-950/60 p-3">
        <p className="font-semibold text-cyan-100">Adapter AI activity</p>
        <p className="mt-1 break-all text-slate-400">Source {selected.adapterRef} · Run {selected.page.run_id} · {titles.get(selected.page.helix_conversation_id) || "Untitled Helix chat"}</p>
        <p className="mt-1 text-slate-400">A current owner-approved task binding is required to read this run. Choices do not start actions; native result receipts report outcomes separately. No decision-to-action link is inferred from the shared run.</p>
        {selected.page.adapter_results_status === "unavailable" ? <p role="status"
          className="mt-2 text-amber-100">Native adapter result receipts could not be read. Responses choices below remain visible; do not infer that no action occurred.</p> : null}
      </div>
      {selected.events.length ? <ol className="space-y-2">
        {selected.events.map(event => <li key={event.activity_event_id}
          className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
          <div className="flex flex-wrap justify-between gap-2 text-[11px] text-cyan-100">
            <span>{event.source_kind === "adapter_action_result" ?
              "Adapter · validated result receipt" :
              `Responses worker · ${event.outcome === "blocked" ? "rejected" : "decision checkpoint"}`}</span>
            <time dateTime={event.observed_at}>{event.observed_at}</time>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words">{event.summary}</p>
          <details className="mt-2 text-[11px] text-slate-400">
            <summary>{event.source_kind === "adapter_action_result" ? "Result provenance" : "Decision provenance"}</summary>
            <p className="mt-1 break-all">Event {event.source_event_ref}
              {event.capability_call_ref ? ` · ${event.source_kind === "adapter_action_result" ? "Request" : "Decision"} ${event.capability_call_ref}` : ""}
              {event.workflow_ref ? ` · Workflow ${event.workflow_ref}` : ""}
              {event.evidence_refs[0] ? ` · ${event.source_kind === "adapter_action_result" ? "Plan" :
                event.source_schema === "environment.responses_baseline_activity.v1" ? "Observation" : "Checkpoint"} ${event.evidence_refs[0]}` : ""}</p>
          </details>
        </li>)}
      </ol> : <p role="status" className="rounded-lg border border-white/10 p-3 text-slate-400">
        This run has no recorded Responses choice or adapter result yet. No model call or adapter action is implied.
      </p>}
    </> : failures.length ? null : <p role="status"
      className="rounded-lg border border-white/10 p-3 text-slate-400">
      {requestedChatIds.length ? "Checking current owner-verified adapter runs…" :
        "No Helix chat is selected for Adapter AI activity. Select the chat associated with the verified run."}
    </p>}
  </section>;
}
