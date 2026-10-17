import type { ManagedConversationView } from "@shared/desktop-live-connection";
import type { HelixCodexConsoleFrame } from "@shared/helix-codex-mirror-frame";
import type { HelixMessageCloudFrame } from "@shared/helix-message-cloud";
import { helixEnvironmentActionActivitySchema,
  helixAdapterAiActivityPageSchema, type HelixEnvironmentActionActivity,
  type HelixAdapterAiActivityPage } from "@shared/helix-environment-action-activity";
import { helixOperatorActivityEventSchema,
  type HelixOperatorActivityEvent } from "@shared/helix-operator-activity";

type ActivityTurn = HelixMessageCloudFrame["turns"][number];
type OtherCodexChat = Readonly<{ chatId: string; title: string; bindingId: string;
  frame: HelixCodexConsoleFrame; status: "live" | "reconnecting" }>;

const bounded = (value: string, limit: number): string => value.length <= limit
  ? value : `${value.slice(0, limit - 38)}… [Open the source chat for the full text]`;

/** The pairing registry keeps a provider-qualified task, while the
 * owner-granted native Codex reader returns its bare thread UUID. Only the
 * recognized Codex prefixes may be equivalent; another task remains denied. */
const matchesCodexTask = (pairedTaskId: string | null | undefined, nativeTaskId: string): boolean => {
  if (!pairedTaskId) return true;
  const bare = pairedTaskId.replace(/^(?:codex-task:|codex-thread:local:|codex:thread:)/i, "");
  return bare.toLowerCase() === nativeTaskId.toLowerCase();
};

/** A current registry binding or a freshly owner-verified native mirror may
 * identify the exact activity stream. A terminal pairing or task mismatch may
 * never fall back to a cached native read. */
export function selectSessionActivityBinding(input: {
  pairing: HelixMessageCloudFrame["pairing"];
  nativeVerifiedBindingId?: string | null;
  codexSourceStatus: "live" | "reconnecting" | "unavailable" | "unpaired";
  codexFrame: HelixCodexConsoleFrame | null;
}): string | null {
  if (input.pairing?.status === "expired" || input.pairing?.status === "revoked" ||
      input.pairing?.status === "superseded") return null;
  if (input.pairing?.status === "active" && input.pairing.bindingId) return input.pairing.bindingId;
  if ((input.codexSourceStatus === "live" || input.codexSourceStatus === "reconnecting") &&
      input.nativeVerifiedBindingId && input.codexFrame &&
      matchesCodexTask(input.pairing?.taskId, input.codexFrame.taskId)) {
    return input.nativeVerifiedBindingId;
  }
  return null;
}

/** Owner-private display projection, not an action, answer, or authority source.
 * Codex turns must already have passed the native exact-task owner grant. */
export function projectSessionActivity(input: {
  helixConversationId: string;
  currentChatTitle?: string;
  savedCodexChatCount?: number;
  otherCodexChats?: readonly OtherCodexChat[];
  messages: ManagedConversationView["messages"];
  codexFrame: HelixCodexConsoleFrame | null;
  /** Binding used by a successful native exact-chat, owner-granted read. */
  nativeVerifiedBindingId?: string | null;
  codexSourceStatus: "live" | "reconnecting" | "unavailable" | "unpaired";
  codexSourceReason?: "pairing_required" | "pairing_expired" | "pairing_revoked" |
    "binding_mismatch" | "account_link_required" | "task_reference_invalid" | "reader_unavailable";
  pairing: HelixMessageCloudFrame["pairing"];
  handoffStatus?: { state: "submitting" | "queued" | "acknowledged" | "unavailable" |
    "rejected" | "expired" | "superseded" | "revoked" } | null;
  taskReport?: { id: string; status: "completed" | "unable"; text: string } | null;
  /** Only owner-private, server-verified records for this exact live binding. */
  responsesActivity?: readonly HelixEnvironmentActionActivity[];
  responsesOperatorEvents?: readonly HelixOperatorActivityEvent[];
  /** Each page was independently owner-authorized for one current binding/run. */
  adapterPages?: readonly HelixAdapterAiActivityPage[];
  savedAdapterChats?: readonly { id: string; title: string }[];
  currentBindingEpoch?: number | null;
}): HelixMessageCloudFrame {
  const agentTurns: ActivityTurn[] = input.messages.slice(-8).map((item, index) => ({
    id: `agent:${index}:${(item.turnId ?? "turn").slice(0, 110)}:${item.role}`,
    lane: "cloud_agent_dm", kind: item.role === "user" ? "message" : "answer",
    author: item.role === "user" ? "user" : "cloud_agent",
    prompt: item.role === "user" ? bounded(item.text, 8_000) : "",
    delivery: "reported",
    report: item.role === "assistant" ? { status: "completed", text: bounded(item.text, 16_000) } : null,
  }));
  for (const [index, item] of input.messages.slice(-8).entries()) {
    if (!item.nativeToolObservation) continue;
    const observation = item.nativeToolObservation;
    agentTurns.push({ id: `agent:${index}:${(item.turnId ?? "turn").slice(0, 110)}:native-observation`,
      lane: "cloud_agent_dm", kind: "update", author: "cloud_agent", prompt: "",
      delivery: "reported", report: { status: "completed",
        text: `Read-only native clock observation · ${bounded(observation.observedAt, 160)} · ${bounded(observation.timezone, 80)} · Evidence: ${bounded(observation.evidenceRef, 160)}` } });
  }
  const codexTurns: ActivityTurn[] = [];
  // The native mirror has already verified the exact chat, binding, owner and
  // task before returning a frame. A registry lookup can expire independently
  // and leave taskId unknown while that owner-granted mirror remains readable.
  const pairingTerminal = input.pairing?.status === "expired" || input.pairing?.status === "revoked" ||
    input.pairing?.status === "superseded";
  const exactTask = !!input.codexFrame && matchesCodexTask(input.pairing?.taskId, input.codexFrame.taskId);
  // The native reader is the exact-task security gate. The separate registry
  // lookup used for the display badge can be unavailable after a restart even
  // when that owner-granted read has just succeeded. Never label that as a new
  // pairing requirement, but still honor terminal grants and task mismatch.
  // "reconnecting" is emitted only after the native host rechecks the same
  // owner grant. The retained frame is bounded by the caller and marked stale.
  const nativeReadable = (input.codexSourceStatus === "live" || input.codexSourceStatus === "reconnecting") &&
    !!input.codexFrame &&
    !!input.nativeVerifiedBindingId && !pairingTerminal && exactTask;
  const codexReadable = nativeReadable || (input.codexSourceStatus === "live" &&
    input.pairing?.status === "active" && !!input.pairing.bindingId && !!input.codexFrame && exactTask);
  const displayPairing = nativeReadable && input.codexFrame ? {
    ...input.pairing, status: "active" as const, taskId: input.codexFrame.taskId,
    bindingId: input.nativeVerifiedBindingId!,
  } : input.pairing;
  if (codexReadable && input.codexFrame) {
    for (const turn of input.codexFrame.turns.slice(-3)) {
      const turnId = turn.id.slice(0, 110);
      if (turn.user) codexTurns.push({ id: `codex:${turnId}:user`, lane: "codex_task",
        kind: "message", author: "user", prompt: bounded(turn.user, 8_000),
        delivery: "reported", report: null });
      for (const [index, update] of (turn.updates ?? []).slice(-3).entries()) codexTurns.push({
        id: `codex:${turnId}:update:${index}`, lane: "codex_task", kind: "update",
        author: "codex_task", prompt: "", delivery: "picked_up",
        report: { status: "completed", text: bounded(update, 16_000) },
      });
      if (turn.assistant) codexTurns.push({ id: `codex:${turnId}:assistant`, lane: "codex_task",
        kind: turn.assistantPhase === "final_answer" ? "answer" : "update",
        author: "codex_task", prompt: "",
        delivery: turn.status === "working" ? "picked_up" : "reported",
        report: { status: turn.status === "interrupted" ? "unable" : "completed",
          text: bounded(turn.assistant, 16_000) } });
    }
  }
  if (input.pairing?.status === "active" && input.taskReport) codexTurns.push({
    id: "codex:task-report",
    lane: "codex_task", kind: "task_report", author: "codex_task", prompt: "",
    delivery: "reported", report: { status: input.taskReport.status,
      text: bounded(input.taskReport.text, 16_000) },
  });
  if (input.pairing?.status === "active" && input.handoffStatus) {
    const messages = {
      submitting: "Checking the paired Codex task connection.",
      queued: "Handoff requested from the paired Codex task; waiting for pickup.",
      acknowledged: "The paired Codex task picked up the handoff; its task report is separate.",
      unavailable: "The paired Codex handoff could not be verified.",
      rejected: "The paired Codex task rejected the handoff.",
      expired: "The paired Codex handoff expired before pickup.",
      superseded: "The paired Codex task binding changed before pickup.",
      revoked: "The paired Codex task binding was revoked before pickup.",
    } satisfies Record<NonNullable<typeof input.handoffStatus>["state"], string>;
    codexTurns.push({ id: `codex:handoff-status:${input.handoffStatus.state}`,
      lane: "codex_task", kind: "status", author: "system", prompt: "", delivery: "reported",
      report: { status: input.handoffStatus.state === "unavailable" || input.handoffStatus.state === "rejected"
        ? "unable" : "completed", text: messages[input.handoffStatus.state] } });
  }
  const currentCodexTurns = input.currentChatTitle ? codexTurns.map(turn => ({ ...turn,
    sourceChat: { helixConversationId: input.helixConversationId,
      title: input.currentChatTitle!.slice(0, 120),
      taskId: input.codexFrame?.taskId ?? input.pairing?.taskId ?? null,
      status: input.codexSourceStatus === "reconnecting" ? "reconnecting" as const : "live" as const },
  })) : codexTurns;
  const otherCodexTurns: ActivityTurn[] = (input.otherCodexChats ?? []).flatMap(source => {
    if (source.chatId === input.helixConversationId ||
        source.frame.helixConversationId !== source.chatId || !source.bindingId) return [];
    // Reuse the exact-task projection's terminal and task-identity guards for
    // each separately owner-granted chat. No other chat contributes Cloud DM,
    // Responses, handoff, or program activity to the selected chat.
    const verified = projectSessionActivity({ helixConversationId: source.chatId,
      messages: [], codexFrame: source.frame, nativeVerifiedBindingId: source.bindingId,
      codexSourceStatus: source.status,
      pairing: { status: "active", taskId: source.frame.taskId, bindingId: source.bindingId } });
    return verified.turns.filter(turn => turn.lane === "codex_task").slice(-4).map(turn => ({
      ...turn, id: `${source.chatId.slice(0, 36)}:${turn.id.slice(0, 118)}`,
      sourceChat: { helixConversationId: source.chatId, title: source.title.slice(0, 120),
        taskId: source.frame.taskId, status: source.status },
    }));
  });
  const responsesTurns: ActivityTurn[] = [];
  if (displayPairing?.status === "active" && displayPairing.bindingId &&
      Number.isSafeInteger(input.currentBindingEpoch) &&
      (input.currentBindingEpoch ?? 0) > 0) {
    for (const raw of (input.responsesActivity ?? []).slice(-8)) {
      const parsed = helixEnvironmentActionActivitySchema.safeParse(raw);
      if (!parsed.success) continue;
      const event = parsed.data;
      if (event.helix_conversation_id !== input.helixConversationId ||
          event.reasoning_binding_id !== displayPairing.bindingId ||
          event.binding_epoch !== input.currentBindingEpoch) continue;
      const detail = event.phase === "proposed"
        ? `Selected ${event.action_code}${event.target_ref ? ` toward ${event.target_ref}` : ""}; awaiting temporal preflight. No action started.`
        : event.phase === "preflight_ready"
          ? `Validated ${event.action_code} through temporal preflight. No action started.`
          : event.phase === "hold" ? "Held at this checkpoint. No action started."
            : event.phase === "escalated" ? "Escalated this checkpoint to the paired Codex task. No action started."
              : `Choice rejected (${event.reason_code}). No action started.`;
      responsesTurns.push({ id: `responses:${event.event_id.slice(0, 140)}`,
        lane: "responses_worker", kind: "decision", author: "responses_worker", prompt: "",
        delivery: "reported", report: { status: event.phase === "rejected" ? "unable" : "completed",
          text: detail } });
    }
    for (const raw of (input.adapterPages?.length ? [] : input.responsesOperatorEvents ?? []).slice(-8)) {
      const parsed = helixOperatorActivityEventSchema.safeParse(raw);
      if (!parsed.success) continue;
      const event = parsed.data;
      if (event.source_kind !== "responses_action" ||
          event.helix_conversation_ref !== input.helixConversationId ||
          event.reasoning_binding_ref !== displayPairing.bindingId ||
          event.reasoning_binding_epoch !== input.currentBindingEpoch ||
          event.visibility !== "profile" || event.redaction_state !== "sanitized" ||
          event.raw_content_included || event.answer_authority) continue;
      responsesTurns.push({ id: `responses:${event.activity_event_id.slice(0, 140)}`,
        lane: "responses_worker", kind: "decision", author: "responses_worker",
        prompt: "", delivery: "reported", report: {
          status: event.outcome === "blocked" || event.outcome === "failed" ||
            event.outcome === "canceled" ? "unable" : "completed",
          text: bounded(event.summary, 1_200),
        } });
    }
  }
  // A saved chat is a discovery hint, not an authorization. The owner-private
  // route checks current binding and run both before and after each ledger read.
  // Still reject stale selected-chat pages, malformed events and unsanitized
  // material at this final display boundary.
  const allowedChats = new Map((input.savedAdapterChats ?? [])
    .map(chat => [chat.id, chat.title.slice(0, 120)] as const));
  if (input.currentChatTitle) allowedChats.set(input.helixConversationId,
    input.currentChatTitle.slice(0, 120));
  for (const rawPage of input.adapterPages ?? []) {
    const parsedPage = helixAdapterAiActivityPageSchema.safeParse(rawPage);
    if (!parsedPage.success) continue;
    const page = parsedPage.data;
    const chatTitle = allowedChats.get(page.helix_conversation_id);
    if (chatTitle === undefined) continue;
    if (page.helix_conversation_id === input.helixConversationId &&
        (displayPairing?.status !== "active" ||
          displayPairing.bindingId !== page.reasoning_binding_id ||
          input.currentBindingEpoch !== page.binding_epoch)) continue;
    for (const event of page.events) {
      if (!["responses_action", "adapter_action_result"].includes(event.source_kind) ||
          event.run_id !== page.run_id ||
          event.helix_conversation_ref !== page.helix_conversation_id ||
          event.reasoning_binding_ref !== page.reasoning_binding_id ||
          event.reasoning_binding_epoch !== page.binding_epoch ||
          event.visibility !== "profile" || event.redaction_state !== "sanitized" ||
          event.raw_content_included || event.answer_authority) continue;
      responsesTurns.push({ id: `adapter:${event.activity_event_id.slice(0, 152)}`,
        lane: event.source_kind === "adapter_action_result" ? "minecraft_adapter" : "responses_worker",
        kind: event.source_kind === "adapter_action_result" ? "status" : "decision",
        author: event.source_kind === "adapter_action_result" ? "minecraft_adapter" : "responses_worker",
        prompt: "", delivery: "reported", report: {
          status: event.outcome === "blocked" || event.outcome === "failed" ||
            event.outcome === "canceled" ? "unable" : "completed",
          text: bounded(event.summary, 1_200),
        }, sourceRun: { helixConversationId: page.helix_conversation_id,
          chatTitle, runId: page.run_id,
          adapterRef: event.source_ref ?? event.node_ref,
          adapterLabel: event.source_kind === "adapter_action_result" ?
            "Adapter result" : "Responses choice" } });
    }
  }
  return {
    schema: "helix.message_cloud_frame.v1", source: "session_activity",
    helixConversationId: input.helixConversationId,
    activityScope: (input.savedCodexChatCount ?? 0) > 1 ? "saved_codex_chats" : "selected_chat",
    codexSourceStatus: input.codexSourceStatus === "live" && !codexReadable
      ? "unpaired" : input.codexSourceStatus,
    codexSourceReason: input.codexSourceReason,
    // A verified record may be displayed only for this exact active binding.
    // Historical records prove activity, not a currently connected worker.
    // Only a separately verified runtime observation may claim "live".
    responsesWorkerStatus: responsesTurns.some(turn => turn.lane === "responses_worker")
      ? "activity_recorded" : "not_connected",
    pairing: displayPairing,
    turns: [...agentTurns, ...currentCodexTurns, ...otherCodexTurns, ...responsesTurns].slice(-128),
  };
}
