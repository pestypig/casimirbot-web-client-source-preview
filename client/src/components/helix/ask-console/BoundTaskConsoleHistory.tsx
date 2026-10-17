import React, { useEffect, useState } from "react";
import { inspectCurrentReasoningBinding } from "@/lib/agent-access/reasoningTaskBinding";
import { helixReasoningSteeringEventProjectionSchema } from "@shared/helix-reasoning-task-binding";
import { HelixAskFinalAnswer } from "./HelixAskFinalAnswer";
import { projectMessageCloudFrame } from "./messageCloudProjection";
import { useConversationPairing, type ConversationPairing } from "./useConversationPairing";

export type BoundTaskConsoleMessage = Readonly<{
  id: string; content: string; at: string; traceId?: string | null;
}>;
type TaskReport = { status: "completed" | "unable"; text: string; evidenceRefs: string[] };
export type MessageProgress = { delivery: string; report?: TaskReport };

/** Owner-only display. A task report is never presented as a verified game effect. */
export function BoundTaskConsoleHistory({ messages, status, helixConversationId,
  messageCloudOpen = false, pairingSnapshot, onMessageCloudUnavailable }: {
  messages: readonly BoundTaskConsoleMessage[]; status?: string | null;
  helixConversationId?: string | null;
  messageCloudOpen?: boolean;
  pairingSnapshot?: ConversationPairing;
  onMessageCloudUnavailable?: () => void;
}) {
  // Reuse the pane's verified owner/chat snapshot in its floating projection.
  // A second independent status read can briefly disagree after acceptance.
  const independentlyReadPairing = useConversationPairing(pairingSnapshot === undefined && messageCloudOpen
    ? helixConversationId : null);
  const pairing = pairingSnapshot ?? independentlyReadPairing;
  const [progress, setProgress] = useState<Record<string, MessageProgress>>({});
  const messageRefs = messages.map(message => message.traceId).filter((value): value is string =>
    typeof value === "string" && /^typed:[0-9a-f-]{36}$/iu.test(value));
  const refKey = messageRefs.join("\n");
  useEffect(() => {
    if (!helixConversationId || !refKey) return;
    const refs = new Set(refKey.split("\n"));
    const controller = new AbortController();
    const readHistory = async () => {
      try {
        const query = new URLSearchParams({ helix_conversation_id: helixConversationId });
        const response = await fetch(`/api/account/session/agent-connections/personal-task-results?${query}`,
          { credentials: "include", signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json() as Record<string, any>;
        if (body.schema !== "helix.personal_task_result_owner_history.v1" || body.ok !== true ||
            body.task_report_only !== true || body.minecraft_effect_verified !== false ||
            body.answer_authority !== false || !Array.isArray(body.reports) || body.reports.length > 50) return;
        const found: Record<string, MessageProgress> = {};
        for (const item of body.reports) {
          const source = item?.receipt?.source_turn_id;
          if (!refs.has(source) || item.receipt?.task_report_recorded !== true ||
              item.receipt?.minecraft_effect_verified !== false ||
              !["completed", "unable"].includes(item?.report?.status) ||
              typeof item.report.text !== "string" || item.report.text.length > 12_000 ||
              !Array.isArray(item.report.evidence_refs) || item.report.evidence_refs.length > 50 ||
              !item.report.evidence_refs.every((ref: unknown) => typeof ref === "string" && ref.length <= 500)) continue;
          found[source] = { delivery: "acknowledged", report: {
            status: item.report.status, text: item.report.text,
            evidenceRefs: item.report.evidence_refs,
          } };
        }
        if (!controller.signal.aborted) setProgress(current => ({ ...current, ...found }));
      } catch { /* Historical display is read-only and cannot confer task authority. */ }
    };
    void readHistory();
    return () => controller.abort();
  }, [helixConversationId, refKey]);
  useEffect(() => {
    if (!helixConversationId || !refKey) return;
    const refs = new Set(refKey.split("\n"));
    const controller = new AbortController();
    let timer: number | undefined;
    let attempts = 0;
    const refresh = async () => {
      if (controller.signal.aborted) return;
      try {
        const binding = await inspectCurrentReasoningBinding(helixConversationId);
        if (controller.signal.aborted || binding.status !== "active" ||
            binding.helix_conversation_id !== helixConversationId) return;
        const query = new URLSearchParams({ binding_epoch: String(binding.binding_epoch),
          helix_conversation_id: helixConversationId });
        if (binding.run_id) query.set("run_id", binding.run_id);
        const base = `/api/account/session/agent-connections/reasoning-bindings/${encodeURIComponent(binding.reasoning_binding_id)}`;
        const response = await fetch(`${base}/chat-prompts?${query}`, {
          credentials: "include", signal: controller.signal,
        });
        if (!response.ok) return;
        const body = await response.json() as { display_only?: unknown; deliveries?: unknown };
        if (body.display_only !== true || !Array.isArray(body.deliveries) || body.deliveries.length > 50) return;
        const next: Record<string, MessageProgress> = {};
        for (const delivery of body.deliveries) {
          const parsed = helixReasoningSteeringEventProjectionSchema.safeParse(
            delivery && typeof delivery === "object" ? (delivery as { event?: unknown }).event : null);
          if (!parsed.success) continue;
          const event = parsed.data;
          if (!refs.has(event.client_event_ref) || event.origin !== "typed" ||
              event.reasoning_binding_id !== binding.reasoning_binding_id ||
              event.binding_epoch !== binding.binding_epoch) continue;
          next[event.client_event_ref] = { delivery: event.delivery_state };
          if (event.delivery_state !== "acknowledged") continue;
          const resultQuery = new URLSearchParams({ binding_epoch: String(binding.binding_epoch),
            source_turn_id: event.client_event_ref });
          const resultResponse = await fetch(
            `${base}/steering/${encodeURIComponent(event.steering_event_ref)}/personal-result?${resultQuery}`,
            { credentials: "include", signal: controller.signal });
          if (!resultResponse.ok) continue;
          const result = await resultResponse.json() as Record<string, any>;
          if (result.schema !== "helix.personal_task_result_owner_read.v1" || result.ok !== true ||
              result.task_report_only !== true || result.minecraft_effect_verified !== false ||
              result.answer_authority !== false ||
              result.receipt?.steering_event_ref !== event.steering_event_ref ||
              result.receipt?.source_turn_id !== event.client_event_ref ||
              !["completed", "unable"].includes(result.report?.status) ||
              typeof result.report?.text !== "string" || result.report.text.length > 12_000 ||
              !Array.isArray(result.report?.evidence_refs) || result.report.evidence_refs.length > 50 ||
              !result.report.evidence_refs.every((ref: unknown) => typeof ref === "string" && ref.length <= 500)) continue;
          next[event.client_event_ref].report = {
            status: result.report.status, text: result.report.text,
            evidenceRefs: result.report.evidence_refs,
          };
        }
        if (!controller.signal.aborted) setProgress(current => {
          const merged = { ...current };
          for (const [ref, value] of Object.entries(next))
            merged[ref] = { ...current[ref], ...value,
              report: value.report ?? current[ref]?.report };
          return merged;
        });
      } catch { /* Display reads cannot grant task or answer authority. */ }
      finally {
        // The binding may be accepted just after this view mounts. Keep the
        // bounded display poll alive through an inactive or partial read.
        if (!controller.signal.aborted && ++attempts < 30)
          timer = window.setTimeout(() => void refresh(), 2_000);
      }
    };
    void refresh();
    return () => { controller.abort(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [helixConversationId, refKey]);

  useEffect(() => {
    if (!messageCloudOpen || !helixConversationId || !window.casimirDesktop?.showMessageCloud) return;
    const frame = { ...projectMessageCloudFrame(helixConversationId, messages, progress), pairing };
    void window.casimirDesktop.showMessageCloud(frame).then(result => {
      if ((result as { status?: string } | null)?.status !== "showing")
        onMessageCloudUnavailable?.();
    }).catch(() => onMessageCloudUnavailable?.());
  }, [messageCloudOpen, helixConversationId, messages, progress, pairing, onMessageCloudUnavailable]);

  const latest = messages.at(-1);
  const latestProgress = latest?.traceId ? progress[latest.traceId] : undefined;
  // A verified receipt for the newest message outranks an older transient queue label.
  const visibleStatus = latestProgress?.report || latestProgress?.delivery === "acknowledged"
    ? null : status;
  return <div role="log" aria-label="Message Codex history" className="space-y-3 py-3 text-sm">
    {messages.length === 0 ? <p className="text-slate-400">No messages to the bound task yet. Pair an exact task in Agent Access before sending.</p>
      : messages.map(message => {
        const current = message.traceId ? progress[message.traceId] : undefined;
        return <article key={message.id} className="rounded-lg border border-cyan-300/15 bg-cyan-400/5 p-3">
          <div className="mb-1 text-[11px] font-semibold text-cyan-200">You · {current?.delivery === "acknowledged" || current?.report
            ? "picked up by Codex task" : "MCP inbox"}</div>
          <div className="whitespace-pre-wrap break-words text-slate-100">{message.content}</div>
          {current?.report ? <div className="mt-3 rounded border border-emerald-300/20 bg-emerald-300/5 p-3">
            <div className="text-[11px] font-semibold text-emerald-200">Codex task report · {current.report.status}</div>
            <HelixAskFinalAnswer text={current.report.text} />
            {current.report.evidenceRefs.length > 0 ? <details className="mt-2 text-xs text-slate-400">
              <summary className="cursor-pointer">Report evidence references ({current.report.evidenceRefs.length})</summary>
              <ul className="mt-1 list-inside list-disc break-all">
                {current.report.evidenceRefs.map((ref, index) => <li key={`${ref}:${index}`}>{ref}</li>)}
              </ul>
            </details> : null}
            <p className="mt-2 text-[11px] text-slate-400">Task-reported observation. Game effect not verified by this report.</p>
          </div> : current?.delivery ? <p className="mt-2 text-[11px] text-slate-400">
            {current.delivery === "acknowledged" ? "Picked up through MCP by the exact task; waiting for its report."
              : `Delivery: ${current.delivery}`}</p> : null}
        </article>;
      })}
    {messages.length > 0 && visibleStatus ? <p role="status" className="text-xs text-slate-300">{visibleStatus}</p> : null}
  </div>;
}
