export type HelixAskSteeringQueueStatus =
  | "next"
  | "queued"
  | "running"
  | "held"
  | "deferred"
  | "completed"
  | "blocked";

export type HelixAskSteeringQueueTone = "cyan" | "amber" | "emerald" | "rose" | "slate";

export type HelixAskSteeringQueueItem = {
  key: string;
  label: string;
  detail: string;
  meta: string;
  status: HelixAskSteeringQueueStatus;
  tone: HelixAskSteeringQueueTone;
  evidenceRefs: string[];
  createdAtMs: number;
};

export type HelixAskSteeringQueueMailboxState = {
  ok?: boolean;
  mailboxThreadId?: string | null;
  wakeAdmissionCycle?: Record<string, unknown> | null;
  mailItems?: unknown[];
  watchJobPolicies?: unknown[];
  interpreterProfiles?: unknown[];
  processedMailPackets?: unknown[];
  microReasonerRuns?: unknown[];
  decisions?: unknown[];
  wakeRequests?: unknown[];
};

const HELIX_ASK_LIVE_SOURCE_MAIL_THREAD_ID = "helix-ask:desktop";
export const HELIX_ASK_STEERING_QUEUE_MAX_ITEMS = 8;

const HELIX_ASK_STEERING_QUEUE_STATUS_RANK: Record<HelixAskSteeringQueueStatus, number> = {
  running: 0,
  next: 1,
  queued: 2,
  held: 3,
  deferred: 4,
  blocked: 5,
  completed: 6,
};

function coerceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

function clipText(value: string | undefined, limit: number): string {
  if (!value) return "";
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
}

function readAgentLoopAuditRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

const uniqueTextValues = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));

const readHelixSteeringQueueRefs = (...values: unknown[]): string[] =>
  uniqueTextValues(values.flatMap((value) => {
    if (typeof value === "string") return [value];
    if (!Array.isArray(value)) return [];
    return value.map((entry) => coerceText(entry).trim()).filter(Boolean);
  }));

const readHelixSteeringCreatedAtMs = (record: Record<string, unknown> | null | undefined, fallback: number): number => {
  const candidates = [
    record?.createdAt,
    record?.created_at,
    record?.updatedAt,
    record?.updated_at,
    record?.completedAt,
    record?.completed_at,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string") {
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
};

const readHelixQueueRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.map(readAgentLoopAuditRecord).filter(Boolean) as Record<string, unknown>[]
    : [];

const intersectsHelixQueueRefs = (left: unknown, right: unknown): boolean => {
  const leftRefs = new Set(readHelixSteeringQueueRefs(left));
  if (leftRefs.size === 0) return false;
  return readHelixSteeringQueueRefs(right).some((ref) => leftRefs.has(ref));
};

const statusForHelixProcessedFinding = (input: {
  packet: Record<string, unknown>;
  wakeRequests: Record<string, unknown>[];
  decisions: Record<string, unknown>[];
}): HelixAskSteeringQueueStatus => {
  const packetMailIds = readHelixSteeringQueueRefs(input.packet.mailIds, input.packet.mail_ids);
  const matchingWake = input.wakeRequests
    .filter(isHelixQueuePacketBackedAskWake)
    .filter((wake) => intersectsHelixQueueRefs(packetMailIds, wake.mailIds))
    .at(-1) ?? null;
  const wakeStatus = coerceText(matchingWake?.status).trim();
  if (wakeStatus === "running") return "running";
  if (wakeStatus === "queued" || wakeStatus === "waiting_for_ui_handoff" || wakeStatus === "failed_retryable") return "queued";
  if (wakeStatus === "deferred_for_pressure") return "deferred";
  if (wakeStatus === "completed") return "completed";
  const matchingDecision = input.decisions
    .filter((decision) => intersectsHelixQueueRefs(packetMailIds, decision.mailIds))
    .at(-1) ?? null;
  if (matchingDecision) return "completed";
  const recommendedNext = coerceText(input.packet.recommendedNext ?? input.packet.recommended_next).trim();
  return recommendedNext && recommendedNext !== "wait_for_next_summary" ? "next" : "held";
};

const isHelixQueuePacketBackedAskWake = (wake: Record<string, unknown>): boolean => {
  const wakeIntent = coerceText(wake.wakeIntent ?? wake.wake_intent).trim();
  if (wakeIntent === "ask_from_processed_packet") return true;
  if (coerceText(wake.askTurnId ?? wake.ask_turn_id).trim()) return true;
  const packetIds = readHelixSteeringQueueRefs(wake.packetIds, wake.packet_ids);
  const deckVerdict = readAgentLoopAuditRecord(wake.deckVerdict ?? wake.deck_verdict);
  return packetIds.length > 0 && deckVerdict?.wakeAsk === true;
};

const toneForHelixSteeringQueueStatus = (status: HelixAskSteeringQueueStatus): HelixAskSteeringQueueTone => {
  if (status === "running" || status === "next") return "cyan";
  if (status === "queued" || status === "held" || status === "deferred") return "amber";
  if (status === "blocked") return "rose";
  if (status === "completed") return "emerald";
  return "slate";
};

function buildHelixSteeringQueuePhaseItem(
  reply: unknown,
  fallbackCreatedAtMs: number,
): HelixAskSteeringQueueItem | null {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(replyRecord?.debug);
  const phase = readAgentLoopAuditRecord(debugRecord?.live_source_turn_phase_resolution);
  if (!phase) return null;
  const phaseName = coerceText(phase.phase).trim();
  if (!phaseName) return null;
  const allowedTools = Array.isArray(phase.allowedTools)
    ? phase.allowedTools.map((entry) => coerceText(entry).trim()).filter(Boolean)
    : [];
  const completionEvidence = Array.isArray(phase.completionEvidence)
    ? phase.completionEvidence.map((entry) => coerceText(entry).trim()).filter(Boolean)
    : [];
  const locked = readAgentLoopAuditRecord(phase.phaseLock)?.locked === true;
  const status: HelixAskSteeringQueueStatus =
    phaseName === "terminal_checkpoint" || completionEvidence.length > 0
      ? "next"
      : locked
        ? "next"
        : "queued";
  const reason = coerceText(phase.reason).trim();
  return {
    key: `phase:${phaseName}:${coerceText(phase.canonicalGoal).trim()}`,
    label: phaseName.replace(/_/g, " "),
    detail: reason || `Canonical goal: ${coerceText(phase.canonicalGoal).trim() || "live-source turn"}.`,
    meta: allowedTools.length > 0 ? `tool: ${allowedTools.slice(0, 2).join(", ")}` : "phase resolver",
    status,
    tone: toneForHelixSteeringQueueStatus(status),
    evidenceRefs: readHelixSteeringQueueRefs(phase.evidenceRefs, completionEvidence),
    createdAtMs: fallbackCreatedAtMs,
  };
}

function buildHelixSteeringQueueMailboxItems(
  mailbox: HelixAskSteeringQueueMailboxState | null | undefined,
  fallbackCreatedAtMs: number,
): HelixAskSteeringQueueItem[] {
  if (!mailbox || mailbox.ok === false) return [];
  const items: HelixAskSteeringQueueItem[] = [];
  const mailItems = readHelixQueueRecordArray(mailbox.mailItems);
  const unread = mailItems.filter((mail) => coerceText(mail.status).trim() === "unread");
  if (unread.length > 0) {
    const latestUnread = unread.at(-1) ?? null;
    const summary = readAgentLoopAuditRecord(latestUnread?.summary);
    const preview = coerceText(summary?.preview ?? summary?.text).trim();
    items.push({
      key: `mailbox:unread:${unread.map((mail) => coerceText(mail.mailId)).join(":")}`,
      label: "Observer backlog",
      detail: preview
        ? `${unread.length} raw visual summary${unread.length === 1 ? "" : " summaries"} awaiting micro-reasoner processing | ${clipText(preview, 150)}`
        : `${unread.length} raw live-source mail item${unread.length === 1 ? "" : "s"} awaiting micro-reasoner processing.`,
      meta: `not Ask-ready | mailbox ${mailbox.mailboxThreadId ?? HELIX_ASK_LIVE_SOURCE_MAIL_THREAD_ID}`,
      status: "held",
      tone: "amber",
      evidenceRefs: readHelixSteeringQueueRefs(unread.map((mail) => mail.mailId), unread.flatMap((mail) => Array.isArray(mail.evidenceRefs) ? mail.evidenceRefs : [])),
      createdAtMs: readHelixSteeringCreatedAtMs(latestUnread, fallbackCreatedAtMs),
    });
  }

  const wakeRequests = readHelixQueueRecordArray(mailbox.wakeRequests);
  const decisions = readHelixQueueRecordArray(mailbox.decisions);
  const processedPackets = readHelixQueueRecordArray(mailbox.processedMailPackets);
  processedPackets.slice(-4).forEach((packet, index) => {
    const recommendedNext = coerceText(packet.recommendedNext ?? packet.recommended_next).trim();
    const salience = readAgentLoopAuditRecord(packet.salience);
    const salienceLevel = coerceText(salience?.level).trim();
    const voiceCandidate = salience?.voiceCandidate === true || salience?.voice_candidate === true;
    const packetId = coerceText(packet.packetId ?? packet.packet_id).trim();
    const status = statusForHelixProcessedFinding({ packet, wakeRequests, decisions });
    if (status === "held" && recommendedNext === "wait_for_next_summary") return;
    const changedFacts = readHelixSteeringQueueRefs(packet.changedFacts, packet.changed_facts);
    const riskMatches = readHelixSteeringQueueRefs(packet.riskMatches, packet.risk_matches);
    items.push({
      key: `processed-finding:${packetId || index}:${recommendedNext}:${status}`,
      label: status === "completed" ? "Processed finding handled" : "Micro-reasoner finding",
      detail: [
        recommendedNext ? `recommended ${recommendedNext}` : "recommendation pending",
        salienceLevel ? `salience ${salienceLevel}${voiceCandidate ? " voice candidate" : ""}` : null,
        changedFacts.length > 0 ? `changed: ${clipText(changedFacts.slice(0, 2).join("; "), 150)}` : null,
        riskMatches.length > 0 ? `risk: ${clipText(riskMatches.slice(0, 2).join("; "), 120)}` : null,
      ].filter(Boolean).join(" | "),
      meta: packetId || "processed mail packet",
      status,
      tone: toneForHelixSteeringQueueStatus(status),
      evidenceRefs: readHelixSteeringQueueRefs(packetId, packet.mailIds, packet.evidenceRefs, packet.microReasonerRunRefs),
      createdAtMs: readHelixSteeringCreatedAtMs(packet, fallbackCreatedAtMs + 5 + index),
    });
  });

  const microReasonerRuns = readHelixQueueRecordArray(mailbox.microReasonerRuns);
  const latestDecisionRun = microReasonerRuns
    .filter((run) => coerceText(run.role).trim() === "decision_selector")
    .at(-1) ?? null;
  if (latestDecisionRun && processedPackets.length === 0) {
    const selectedDecision = coerceText(latestDecisionRun.selectedDecision ?? latestDecisionRun.selected_decision).trim();
    const nextTool = coerceText(latestDecisionRun.recommendedNextTool ?? latestDecisionRun.recommended_next_tool).trim();
    const status: HelixAskSteeringQueueStatus =
      selectedDecision && selectedDecision !== "wait_for_next_summary" ? "next" : "held";
    items.push({
      key: `micro-decision:${coerceText(latestDecisionRun.runId).trim()}:${selectedDecision}`,
      label: "Micro-reasoner decision",
      detail: [
        selectedDecision ? `selected ${selectedDecision}` : "decision pending",
        nextTool ? `next tool ${nextTool}` : null,
        coerceText(latestDecisionRun.outputPreview).trim() || null,
      ].filter(Boolean).join(" | "),
      meta: coerceText(latestDecisionRun.runId).trim() || "decision_selector",
      status,
      tone: toneForHelixSteeringQueueStatus(status),
      evidenceRefs: readHelixSteeringQueueRefs(latestDecisionRun.runId, latestDecisionRun.inputRefs, latestDecisionRun.outputRefs),
      createdAtMs: readHelixSteeringCreatedAtMs(latestDecisionRun, fallbackCreatedAtMs + 7),
    });
  }

  wakeRequests.filter(isHelixQueuePacketBackedAskWake).slice(-5).forEach((wake, index) => {
    const rawStatus = coerceText(wake.status).trim();
    const status: HelixAskSteeringQueueStatus =
      rawStatus === "running"
        ? "running"
        : rawStatus === "queued" || rawStatus === "waiting_for_ui_handoff" || rawStatus === "runnable"
          ? "queued"
          : rawStatus === "deferred_for_pressure"
            ? "deferred"
            : /^failed/i.test(rawStatus)
              ? "blocked"
              : "completed";
    if (status === "completed" && !/completed|decision_recorded|answered/i.test(rawStatus)) return;
    const mailIds = Array.isArray(wake.mailIds) ? wake.mailIds : [];
    items.push({
      key: `wake:${coerceText(wake.wakeRequestId).trim() || index}:${rawStatus}`,
      label: rawStatus === "waiting_for_ui_handoff"
        ? "Ask handoff waiting for UI"
        : status === "deferred" ? "Ask handoff deferred" : status === "running" ? "Ask handoff running" : status === "queued" ? "Ask handoff queued" : "Ask handoff completed",
      detail: [
        mailIds.length > 0 ? `${mailIds.length} packet-backed input${mailIds.length === 1 ? "" : "s"}` : null,
        coerceText(wake.failureReason ?? wake.reason).trim() || null,
        coerceText(wake.askTurnId).trim() ? `ask ${coerceText(wake.askTurnId).trim()}` : null,
      ].filter(Boolean).join(" | ") || "Backend interrupt queue item.",
      meta: coerceText(wake.wakeRequestId).trim() || "interrupt request",
      status,
      tone: toneForHelixSteeringQueueStatus(status),
      evidenceRefs: readHelixSteeringQueueRefs(wake.wakeRequestId, mailIds, wake.evidenceRefs),
      createdAtMs: readHelixSteeringCreatedAtMs(wake, fallbackCreatedAtMs + index),
    });
  });

  const admission = readAgentLoopAuditRecord(mailbox.wakeAdmissionCycle);
  const continuation = readAgentLoopAuditRecord(admission?.continuation);
  const runtimeAdmission = readAgentLoopAuditRecord(admission?.runtimeAdmission);
  const deferredWakeIds = Array.isArray(admission?.deferredWakeIds) ? admission.deferredWakeIds : [];
  const continuationScheduled = continuation?.scheduled === true;
  if (deferredWakeIds.length > 0 || continuationScheduled) {
    const status: HelixAskSteeringQueueStatus = deferredWakeIds.length > 0 ? "deferred" : "queued";
    items.push({
      key: `continuation:${status}:${deferredWakeIds.join(":")}:${coerceText(continuation?.reason).trim()}`,
      label: status === "deferred" ? "Continuation deferred" : "Continuation scheduled",
      detail:
        status === "deferred"
          ? `${deferredWakeIds.length} wake${deferredWakeIds.length === 1 ? "" : "s"} retained for pressure.`
          : `Next wake: ${coerceText(continuation?.reason).trim() || "scheduled"}.`,
      meta: coerceText(runtimeAdmission?.reason).trim() || "backend wake loop",
      status,
      tone: toneForHelixSteeringQueueStatus(status),
      evidenceRefs: readHelixSteeringQueueRefs(deferredWakeIds, continuation?.runnableWakeIds),
      createdAtMs: fallbackCreatedAtMs + 20,
    });
  }

  const policies = (mailbox.watchJobPolicies ?? []).map(readAgentLoopAuditRecord).filter(Boolean) as Record<string, unknown>[];
  const latestPolicy = policies.filter((policy) => coerceText(policy.status).trim() !== "ended").at(-1) ?? null;
  if (latestPolicy) {
    items.push({
      key: `policy:${coerceText(latestPolicy.policyId).trim()}`,
      label: "Watch policy armed",
      detail: clipText(coerceText(latestPolicy.objectiveText ?? latestPolicy.objective).trim() || "Standing live-source objective is active.", 180),
      meta: coerceText(latestPolicy.interpretationMode).trim() || "watch policy",
      status: "completed",
      tone: "emerald",
      evidenceRefs: readHelixSteeringQueueRefs(latestPolicy.policyId, latestPolicy.evidenceRefs),
      createdAtMs: readHelixSteeringCreatedAtMs(latestPolicy, fallbackCreatedAtMs - 20),
    });
  }

  const profiles = (mailbox.interpreterProfiles ?? []).map(readAgentLoopAuditRecord).filter(Boolean) as Record<string, unknown>[];
  const latestProfile = profiles.filter((profile) => coerceText(profile.status).trim() !== "archived").at(-1) ?? null;
  if (latestProfile) {
    items.push({
      key: `profile:${coerceText(latestProfile.profileId).trim()}`,
      label: "Interpreter profile active",
      detail: clipText(coerceText(latestProfile.title).trim() || "Active interpreter profile.", 180),
      meta: coerceText(latestProfile.domain).trim() || "interpreter profile",
      status: "completed",
      tone: "emerald",
      evidenceRefs: readHelixSteeringQueueRefs(latestProfile.profileId, latestProfile.evidenceRefs),
      createdAtMs: readHelixSteeringCreatedAtMs(latestProfile, fallbackCreatedAtMs - 10),
    });
  }

  return items;
}

function buildHelixSteeringQueueDebugItems(
  reply: unknown,
  fallbackCreatedAtMs: number,
): HelixAskSteeringQueueItem[] {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(replyRecord?.debug);
  const mailboxDebug = readAgentLoopAuditRecord(debugRecord?.stage_play_live_source_mailbox_debug);
  if (!mailboxDebug) return [];
  const items: HelixAskSteeringQueueItem[] = [];
  const capability = coerceText(mailboxDebug.capability).trim();
  const route = coerceText(mailboxDebug.route).trim();
  if (capability) {
    const decisionId = coerceText(mailboxDebug.decision_id ?? mailboxDebug.decisionId).trim();
    items.push({
      key: `debug-capability:${capability}:${decisionId}`,
      label: decisionId ? "Decision recorded" : "Capability selected",
      detail: decisionId ? `Decision: ${decisionId}` : `Next capability: ${capability}`,
      meta: route || "live-source mailbox",
      status: decisionId ? "completed" : "next",
      tone: decisionId ? "emerald" : "cyan",
      evidenceRefs: readHelixSteeringQueueRefs(decisionId, mailboxDebug.mail_ids, mailboxDebug.decision_ids),
      createdAtMs: fallbackCreatedAtMs + 10,
    });
  }
  const continuation = readAgentLoopAuditRecord(mailboxDebug.wake_continuation);
  if (continuation) {
    const loopState = coerceText(continuation.loop_state ?? mailboxDebug.next_loop_state).trim();
    const pressureDeferred = continuation.pressure_deferred === true;
    const continuationRecord = readAgentLoopAuditRecord(continuation.continuation);
    const scheduled = continuationRecord?.scheduled === true;
    if (pressureDeferred || scheduled || loopState) {
      const status: HelixAskSteeringQueueStatus = pressureDeferred ? "deferred" : scheduled ? "queued" : "completed";
      items.push({
        key: `debug-continuation:${status}:${loopState}`,
        label: pressureDeferred ? "Continuation deferred" : scheduled ? "Continuation scheduled" : "Loop state",
        detail: loopState ? loopState.replace(/_/g, " ") : "Backend wake loop remains armed.",
        meta: coerceText(continuationRecord?.reason).trim() || "loop state",
        status,
        tone: toneForHelixSteeringQueueStatus(status),
        evidenceRefs: readHelixSteeringQueueRefs(continuation.runnable_wake_ids, continuation.deferred_wake_ids),
        createdAtMs: fallbackCreatedAtMs + 30,
      });
    }
  }
  return items;
}

function sortHelixAskSteeringQueueItems(items: HelixAskSteeringQueueItem[]): HelixAskSteeringQueueItem[] {
  return [...items].sort((left, right) => {
    const leftRank = HELIX_ASK_STEERING_QUEUE_STATUS_RANK[left.status] ?? 99;
    const rightRank = HELIX_ASK_STEERING_QUEUE_STATUS_RANK[right.status] ?? 99;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.status === "completed" && right.status === "completed") return left.createdAtMs - right.createdAtMs;
    return right.createdAtMs - left.createdAtMs;
  });
}

export function shouldAutoWakeHelixMailboxQueueItem(item: HelixAskSteeringQueueItem | null | undefined): boolean {
  if (!item) return false;
  if (item.status === "held" || item.status === "completed" || item.status === "running") return false;
  return (
    item.key.startsWith("processed-finding:") ||
    item.key.startsWith("micro-decision:") ||
    item.key.startsWith("wake:") ||
    item.key.startsWith("continuation:")
  );
}

export function buildHelixAskSteeringQueueItems(input: {
  latestReply?: unknown;
  mailbox?: HelixAskSteeringQueueMailboxState | null;
  maxItems?: number;
}): HelixAskSteeringQueueItem[] {
  const fallbackCreatedAtMs = Date.now();
  const candidates = [
    buildHelixSteeringQueuePhaseItem(input.latestReply, fallbackCreatedAtMs),
    ...buildHelixSteeringQueueMailboxItems(input.mailbox, fallbackCreatedAtMs),
    ...buildHelixSteeringQueueDebugItems(input.latestReply, fallbackCreatedAtMs),
  ].filter((item): item is HelixAskSteeringQueueItem => Boolean(item));
  const seen = new Set<string>();
  const deduped = candidates.filter((item) => {
    const key = `${item.label}:${item.detail}:${item.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return sortHelixAskSteeringQueueItems(deduped).slice(0, input.maxItems ?? HELIX_ASK_STEERING_QUEUE_MAX_ITEMS);
}

export function readHelixSteeringQueueItemClass(item: HelixAskSteeringQueueItem): string {
  if (item.tone === "cyan") return "border-cyan-300/25 bg-cyan-400/10 text-cyan-50";
  if (item.tone === "amber") return "border-amber-300/25 bg-amber-400/10 text-amber-50";
  if (item.tone === "emerald") return "border-emerald-300/20 bg-emerald-400/10 text-emerald-50";
  if (item.tone === "rose") return "border-rose-300/30 bg-rose-400/10 text-rose-50";
  return "border-white/10 bg-white/5 text-slate-100";
}

export function readHelixSteeringQueueDotClass(item: HelixAskSteeringQueueItem): string {
  if (item.tone === "cyan") return "bg-cyan-300 shadow-cyan-300/25";
  if (item.tone === "amber") return "bg-amber-300 shadow-amber-300/25";
  if (item.tone === "emerald") return "bg-emerald-300 shadow-emerald-300/20";
  if (item.tone === "rose") return "bg-rose-300 shadow-rose-300/25";
  return "bg-slate-400 shadow-slate-300/10";
}
