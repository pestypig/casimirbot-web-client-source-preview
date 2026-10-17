type StagePlayLedgerReply = {
  id: string;
  content?: unknown;
  debug?: unknown;
  [key: string]: unknown;
};

export type StagePlayChatLedgerEventKind =
  | "job_plan"
  | "source_observation"
  | "debug_receipt"
  | "checkpoint_request"
  | "ask_checkpoint"
  | "perturbation"
  | "answer_snapshot"
  | "live_output";

export type StagePlayChatLedgerEvent = {
  key: string;
  kind: StagePlayChatLedgerEventKind;
  title: string;
  detail: string;
  meta: string;
  evidenceRefs: string[];
  actions?: Array<"Run" | "Skip" | "Pause job">;
  status?: string;
};

const STAGE_PLAY_LEDGER_EVENT_ORDER: Record<StagePlayChatLedgerEventKind, number> = {
  job_plan: 0,
  source_observation: 1,
  debug_receipt: 2,
  checkpoint_request: 3,
  ask_checkpoint: 4,
  answer_snapshot: 5,
  perturbation: 6,
  live_output: 7,
};

function readAgentLoopAuditRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clipText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function readStagePlayLedgerString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readStagePlayLedgerStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => readStagePlayLedgerString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
}

function readStagePlayLedgerRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value
        .map((entry) => readAgentLoopAuditRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
}

function uniqueStagePlayLedgerStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function labelizeStagePlayLedgerValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function collectStagePlayLedgerArtifacts(reply: StagePlayLedgerReply): Record<string, unknown>[] {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(reply.debug);
  const directLedgers = [
    replyRecord?.current_turn_artifact_ledger,
    debugRecord?.current_turn_artifact_ledger,
    replyRecord?.artifact_ledger,
    debugRecord?.artifact_ledger,
  ];
  return directLedgers.flatMap(readStagePlayLedgerRecordArray);
}

function collectStagePlayLedgerPayloads(reply: StagePlayLedgerReply): Record<string, unknown>[] {
  const payloads: Record<string, unknown>[] = [];
  for (const artifact of collectStagePlayLedgerArtifacts(reply)) {
    const payload = readAgentLoopAuditRecord(artifact.payload) ?? artifact;
    payloads.push(payload);
    const observation = readAgentLoopAuditRecord(payload.observation);
    if (observation) payloads.push(observation);
  }
  const debugRecord = readAgentLoopAuditRecord(reply.debug);
  [
    debugRecord?.latest_result_artifact,
    debugRecord?.stage_play_reflection_result,
    debugRecord?.stage_play_job_plan,
    debugRecord?.stage_play_checkpoint_request_result,
  ].forEach((candidate) => {
    const record = readAgentLoopAuditRecord(candidate);
    if (record) payloads.push(record);
  });
  return payloads;
}

function firstStagePlayLedgerPayload(
  reply: StagePlayLedgerReply,
  predicate: (payload: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  return collectStagePlayLedgerPayloads(reply).find(predicate) ?? null;
}

function readStagePlayGraphFromReflection(reflection: Record<string, unknown> | null): Record<string, unknown> | null {
  return readAgentLoopAuditRecord(reflection?.graph);
}

function readStagePlayGraphBadges(graph: Record<string, unknown> | null): Record<string, unknown>[] {
  return readStagePlayLedgerRecordArray(graph?.badges);
}

function readStagePlayGraphBadgeByKind(
  graph: Record<string, unknown> | null,
  kind: string,
): Record<string, unknown> | null {
  return readStagePlayGraphBadges(graph).find((badge) => readStagePlayLedgerString(badge.kind) === kind) ?? null;
}

function readStagePlayGraphBadgeById(
  graph: Record<string, unknown> | null,
  id: string,
): Record<string, unknown> | null {
  return readStagePlayGraphBadges(graph).find((badge) => readStagePlayLedgerString(badge.id) === id) ?? null;
}

function readStagePlayBadgeEvidenceRefs(badge: Record<string, unknown> | null): string[] {
  return uniqueStagePlayLedgerStrings([
    ...readStagePlayLedgerStringArray(badge?.evidenceRefs),
    ...readStagePlayLedgerRecordArray(badge?.sourceRefs).map((ref) => readStagePlayLedgerString(ref.id)).filter((ref): ref is string => Boolean(ref)),
    ...readStagePlayLedgerStringArray(readAgentLoopAuditRecord(badge?.dataTray)?.evidenceRefs),
  ]);
}

function formatStagePlayLedgerSourceLine(sources: Record<string, unknown>[]): string {
  const source = sources[0] ?? null;
  if (!source) return "none";
  const modality = readStagePlayLedgerString(source.modality) ?? "visual_frame";
  const status = readStagePlayLedgerString(source.status) ?? "unknown";
  const selected = source.selectedForStagePlay === true ? "yes" : "no";
  const routeTo = readStagePlayLedgerString(source.routeTo) ?? "unrouted";
  return `${modality} ${status} selected ${selected} ${routeTo}`;
}

function pushStagePlayLedgerEvent(
  events: StagePlayChatLedgerEvent[],
  event: StagePlayChatLedgerEvent,
): void {
  if (events.some((entry) => entry.key === event.key)) return;
  events.push({
    ...event,
    evidenceRefs: uniqueStagePlayLedgerStrings(event.evidenceRefs),
  });
}

export function buildStagePlayChatLedgerEvents(reply: StagePlayLedgerReply): StagePlayChatLedgerEvent[] {
  const events: StagePlayChatLedgerEvent[] = [];
  const jobPlan = firstStagePlayLedgerPayload(reply, (payload) =>
    payload.artifactId === "stage_play_job_plan" || payload.schemaVersion === "stage_play_job_plan/v1",
  );
  if (jobPlan) {
    const requiredSources = readStagePlayLedgerRecordArray(jobPlan.requiredSources);
    const required = requiredSources
      .filter((source) => source.required === true)
      .map((source) => readStagePlayLedgerString(source.modality) ?? readStagePlayLedgerString(source.label) ?? "")
      .filter(Boolean);
    const optional = requiredSources
      .filter((source) => source.required !== true)
      .map((source) => readStagePlayLedgerString(source.modality) ?? readStagePlayLedgerString(source.label) ?? "")
      .filter(Boolean);
    pushStagePlayLedgerEvent(events, {
      key: `${reply.id}-stage-play-job-plan`,
      kind: "job_plan",
      title: "Stage Play job plan created.",
      detail: `Required: ${required.join(", ") || "none"}. Optional: ${optional.join(", ") || "none"}.`,
      meta: `${labelizeStagePlayLedgerValue(jobPlan.domain) || "stage play"} | ${readStagePlayLedgerRecordArray(jobPlan.nodeChain).length} nodes`,
      evidenceRefs: [],
      status: "planned",
    });
  }

  const reflection = firstStagePlayLedgerPayload(reply, (payload) =>
    payload.schema === "stage_play_reflection_result/v1",
  );
  const graph = readStagePlayGraphFromReflection(reflection);
  const debugReceipt = readAgentLoopAuditRecord(reflection?.debugReceipt);
  const liveProjection = readAgentLoopAuditRecord(reflection?.liveAnswerProjection);
  const checkpointFreshness = readAgentLoopAuditRecord(debugReceipt?.checkpointFreshness);
  const visualStatuses = readStagePlayLedgerRecordArray(debugReceipt?.visualSourceStatus);
  const activeVisualStatuses = visualStatuses.filter((source) =>
    readStagePlayLedgerString(source.status) === "active",
  );
  const sourceRefs = readStagePlayLedgerStringArray(debugReceipt?.sourceRefs);
  const compactObservation =
    readStagePlayGraphBadgeById(graph, "compact_observation.latest_visual") ??
    readStagePlayGraphBadgeById(graph, "compact_observation.latest") ??
    readStagePlayGraphBadgeByKind(graph, "compact_observation");
  if (reflection && (activeVisualStatuses.length > 0 || compactObservation)) {
    const cadence = activeVisualStatuses
      .map((source) => typeof source.cadenceMs === "number" ? `${source.cadenceMs}ms` : null)
      .find(Boolean);
    const sourceStatusText = activeVisualStatuses.length > 0
      ? `Visual source attached${cadence ? ` at ${cadence} cadence` : ""}.`
      : "Visual source reflected.";
    const compactReady = compactObservation && readStagePlayLedgerString(compactObservation.status) !== "missing_evidence";
    pushStagePlayLedgerEvent(events, {
      key: `${reply.id}-stage-play-source-observation`,
      kind: "source_observation",
      title: "Visual source attached.",
      detail: `${sourceStatusText} ${compactReady ? "First compact observation ready." : "Waiting for compact observation."}`,
      meta: `sources ${activeVisualStatuses.length}/${visualStatuses.length || activeVisualStatuses.length} | refs ${sourceRefs.length}`,
      evidenceRefs: uniqueStagePlayLedgerStrings([
        ...sourceRefs,
        ...readStagePlayBadgeEvidenceRefs(compactObservation),
      ]),
      status: compactReady ? "ready" : "waiting",
    });
  }

  const perturbations = readStagePlayLedgerRecordArray(graph?.perturbations);
  const latestPerturbation = perturbations.at(-1) ?? null;
  if (latestPerturbation) {
    const affected = readStagePlayLedgerStringArray(latestPerturbation.affectedBadgeIds);
    const staleSnapshots = readStagePlayLedgerStringArray(latestPerturbation.staleAnswerSnapshotIds);
    pushStagePlayLedgerEvent(events, {
      key: `${reply.id}-stage-play-perturbation-${readStagePlayLedgerString(latestPerturbation.perturbationId) ?? perturbations.length}`,
      kind: "perturbation",
      title: "Perturbation observed.",
      detail: `${labelizeStagePlayLedgerValue(latestPerturbation.reason) || "state changed"}. ${staleSnapshots.length > 0 ? `Staled ${staleSnapshots.length} answer snapshot(s).` : "No answer snapshot was marked stale."}`,
      meta: `${labelizeStagePlayLedgerValue(latestPerturbation.materiality) || "unknown materiality"} | affected ${affected.length}`,
      evidenceRefs: readStagePlayLedgerStringArray(latestPerturbation.evidenceRefs),
      status: readStagePlayLedgerString(latestPerturbation.materiality) ?? "observed",
    });
  }

  const requestResult = firstStagePlayLedgerPayload(reply, (payload) =>
    payload.schema === "stage_play_checkpoint_request_result/v1",
  );
  const resultCheckpointRequest = readAgentLoopAuditRecord(requestResult?.checkpointRequest);
  const graphCheckpointRequest = readStagePlayLedgerRecordArray(graph?.checkpointRequests)[0] ?? null;
  const checkpointRequest = resultCheckpointRequest ?? graphCheckpointRequest;
  if (reflection && debugReceipt) {
    const requestId = readStagePlayLedgerString(checkpointRequest?.checkpointRequestId);
    const projectedLineKeys = readStagePlayLedgerStringArray(liveProjection?.projectedLineKeys);
    const changedLineKeys = readStagePlayLedgerStringArray(liveProjection?.changedLineKeys);
    const displayedLineKeys = projectedLineKeys.length > 0 ? projectedLineKeys : changedLineKeys;
    const preferredProjectedKeys = ["risk", "possibilities", "unknowns", "next_check"];
    const projectedDisplay = preferredProjectedKeys.filter((key) => displayedLineKeys.includes(key));
    const checkpointOnlySkipped = uniqueStagePlayLedgerStrings([
      ...readStagePlayLedgerStringArray(liveProjection?.checkpointOnlySkipped),
      ...readStagePlayLedgerStringArray(debugReceipt.checkpointOnlySkipped),
    ]);
    const visualEvidenceRefs = uniqueStagePlayLedgerStrings([
      ...sourceRefs.filter((ref) => /^visual_evidence:/i.test(ref)),
      ...readStagePlayBadgeEvidenceRefs(compactObservation).filter((ref) => /^visual_evidence:/i.test(ref)),
      ...visualStatuses.flatMap((source) => readStagePlayLedgerStringArray(source.evidenceRefs)).filter((ref) => /^visual_evidence:/i.test(ref)),
    ]);
    const reviewed = checkpointFreshness?.modelReviewed === true || checkpointFreshness?.fresh === true;
    const detail = [
      "Tool: live_env.reflect_stage_play_context",
      `Graph: ${readStagePlayLedgerString(debugReceipt.graphId) ?? readStagePlayLedgerString(graph?.graphId) ?? "unknown"}`,
      `Source: ${formatStagePlayLedgerSourceLine(visualStatuses)}`,
      `Visual evidence: ${visualEvidenceRefs.join(", ") || "none"}`,
      `Projected live interpretation: ${(projectedDisplay.length > 0 ? projectedDisplay : displayedLineKeys).join(", ") || "none"}`,
      `Checkpoint-only skipped: ${checkpointOnlySkipped.join(", ") || "none"}`,
      `Queued checkpoint: ${requestId ?? readStagePlayLedgerString(debugReceipt.checkpointRequestId) ?? "none"}`,
      `Checkpoint reviewed: ${reviewed ? "true" : "false"}`,
    ].join("\n");
    pushStagePlayLedgerEvent(events, {
      key: `${reply.id}-stage-play-debug-receipt-${readStagePlayLedgerString(debugReceipt.graphId) ?? "current"}`,
      kind: "debug_receipt",
      title: "Stage Play debug receipt.",
      detail,
      meta: `${readStagePlayLedgerString(debugReceipt.graphId) ?? "graph"} | ${reviewed ? "reviewed" : "not reviewed"}`,
      evidenceRefs: uniqueStagePlayLedgerStrings([
        ...sourceRefs,
        ...visualEvidenceRefs,
        readStagePlayLedgerString(debugReceipt.graphId) ?? "",
        requestId ?? readStagePlayLedgerString(debugReceipt.checkpointRequestId) ?? "",
      ]),
      status: reviewed ? "model_reviewed" : "not_reviewed",
    });
  }
  if (checkpointRequest) {
    const requestId = readStagePlayLedgerString(checkpointRequest.checkpointRequestId) ?? "checkpoint";
    const reason = labelizeStagePlayLedgerValue(checkpointRequest.reason) || "checkpoint requested";
    const status = readStagePlayLedgerString(checkpointRequest.status) ?? readStagePlayLedgerString(requestResult?.reason) ?? "queued";
    const evidenceRefs = uniqueStagePlayLedgerStrings([
      ...readStagePlayLedgerStringArray(checkpointRequest.currentGraphRefs),
      ...readStagePlayLedgerStringArray(checkpointRequest.compactObservationRefs),
      ...readStagePlayLedgerStringArray(checkpointRequest.perturbationRefs),
      ...readStagePlayLedgerStringArray(checkpointRequest.priorAnswerSnapshotRefs),
      ...sourceRefs,
    ]);
    pushStagePlayLedgerEvent(events, {
      key: `${reply.id}-stage-play-checkpoint-request-${requestId}`,
      kind: "checkpoint_request",
      title: "Queued checkpoint.",
      detail: `Reason: ${reason}. Evidence: ${evidenceRefs.slice(0, 3).join(", ") || "none"}.`,
      meta: `${requestId} | ${status}`,
      evidenceRefs,
      actions: ["Run", "Skip", "Pause job"],
      status,
    });
  }

  const checkpointBadge =
    readStagePlayGraphBadgeById(graph, "helix_ask.checkpoint.latest") ??
    readStagePlayGraphBadgeByKind(graph, "helix_ask_checkpoint") ??
    readStagePlayGraphBadgeByKind(graph, "ask_checkpoint");
  const answerSnapshotBadge =
    readStagePlayGraphBadgeById(graph, "answer_snapshot.latest") ??
    readStagePlayGraphBadgeByKind(graph, "answer_snapshot");
  const checkpointRecord = readAgentLoopAuditRecord(checkpointBadge?.checkpoint);
  const modelReviewed =
    checkpointFreshness?.modelReviewed === true ||
    checkpointFreshness?.fresh === true ||
    checkpointRecord?.modelReviewed === true ||
    readAgentLoopAuditRecord(answerSnapshotBadge?.checkpoint)?.modelReviewed === true;
  if (reflection || checkpointBadge || answerSnapshotBadge) {
    const freshnessReason = labelizeStagePlayLedgerValue(checkpointFreshness?.reason) || "no checkpoint";
    const answerText =
      readStagePlayLedgerString(readAgentLoopAuditRecord(answerSnapshotBadge?.output)?.text) ??
      readStagePlayLedgerString(readAgentLoopAuditRecord(answerSnapshotBadge?.dataTray)?.summary) ??
      readStagePlayLedgerString(reply.content) ??
      "";
    pushStagePlayLedgerEvent(events, {
      key: `${reply.id}-stage-play-ask-checkpoint`,
      kind: "ask_checkpoint",
      title: modelReviewed ? "Helix Ask checkpoint completed." : "No answer snapshot yet.",
      detail: modelReviewed
        ? clipText(`Model-reviewed checkpoint available. ${answerText}`, 220)
        : `No current model-reviewed checkpoint has consumed this Stage Play graph yet. Freshness: ${freshnessReason}.`,
      meta: `${readStagePlayLedgerString(checkpointRecord?.askTurnId) ?? readStagePlayLedgerString(checkpointFreshness?.checkpointId) ?? "checkpoint"} | ${modelReviewed ? "model reviewed" : "not reviewed"}`,
      evidenceRefs: uniqueStagePlayLedgerStrings([
        ...readStagePlayBadgeEvidenceRefs(checkpointBadge),
        ...readStagePlayBadgeEvidenceRefs(answerSnapshotBadge),
        ...sourceRefs,
      ]),
      status: modelReviewed ? "model_reviewed" : "missing_evidence",
    });
  }

  if (answerSnapshotBadge && readStagePlayLedgerString(answerSnapshotBadge.status) !== "missing_evidence") {
    const output = readAgentLoopAuditRecord(answerSnapshotBadge.output);
    const text =
      readStagePlayLedgerString(output?.text) ??
      readStagePlayLedgerString(readAgentLoopAuditRecord(answerSnapshotBadge.dataTray)?.summary) ??
      "Model-reviewed answer snapshot is available.";
    pushStagePlayLedgerEvent(events, {
      key: `${reply.id}-stage-play-answer-snapshot`,
      kind: "answer_snapshot",
      title: "Answer Snapshot, checkpoint only.",
      detail: clipText(text, 220),
      meta: `${readStagePlayLedgerString(output?.state) ?? readStagePlayLedgerString(answerSnapshotBadge.status) ?? "snapshot"} | refs ${readStagePlayBadgeEvidenceRefs(answerSnapshotBadge).length}`,
      evidenceRefs: readStagePlayBadgeEvidenceRefs(answerSnapshotBadge),
      status: readStagePlayLedgerString(output?.state) ?? readStagePlayLedgerString(answerSnapshotBadge.status) ?? "available",
    });
  }

  const liveOutputBadge =
    readStagePlayGraphBadgeById(graph, "live_output.current") ??
    readStagePlayGraphBadgeByKind(graph, "live_output");
  const projectedLineKeys = readStagePlayLedgerStringArray(liveProjection?.projectedLineKeys);
  const changedLineKeys = readStagePlayLedgerStringArray(liveProjection?.changedLineKeys);
  const displayedLineKeys = projectedLineKeys.length > 0 ? projectedLineKeys : changedLineKeys;
  if (liveOutputBadge || displayedLineKeys.length > 0) {
    const output = readAgentLoopAuditRecord(liveOutputBadge?.output);
    const lineKey = readStagePlayLedgerString(output?.lineKey) ?? (displayedLineKeys.join(", ") || "live interpretation");
    pushStagePlayLedgerEvent(events, {
      key: `${reply.id}-stage-play-live-output`,
      kind: "live_output",
      title: "Live Interpretation lanes updated.",
      detail: displayedLineKeys.length > 0
        ? `Projected: ${displayedLineKeys.join(", ")}.`
        : readStagePlayLedgerString(output?.text) ?? "Live output node is present.",
      meta: `${lineKey} | ${readStagePlayLedgerString(liveProjection?.reason) ?? readStagePlayLedgerString(output?.state) ?? "projection"}`,
      evidenceRefs: uniqueStagePlayLedgerStrings([
        ...readStagePlayBadgeEvidenceRefs(liveOutputBadge),
        ...sourceRefs,
      ]),
      status: readStagePlayLedgerString(liveProjection?.reason) ?? readStagePlayLedgerString(output?.state) ?? "projected",
    });
  }

  return [...events].sort((a, b) =>
    STAGE_PLAY_LEDGER_EVENT_ORDER[a.kind] - STAGE_PLAY_LEDGER_EVENT_ORDER[b.kind],
  );
}
