import type {
  VoiceCaptureDiagnosticsSnapshot,
  VoiceCaptureSegmentSnapshot,
} from "@/lib/helix/voice-capture-diagnostics";

function readVoiceDiagnosticsRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function coerceVoiceDiagnosticsText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function readVoiceDiagnosticsBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readVoiceDiagnosticsNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function collectClientVoicePlaybackReceipts(source: Record<string, unknown>): Record<string, unknown>[] {
  const clientProjection = readVoiceDiagnosticsRecord(source.client_debug_projection);
  const clientVoice = readVoiceDiagnosticsRecord(source.client_voice_debug ?? clientProjection?.voice);
  return [
    source.client_voice_playback_receipts,
    clientProjection?.voice_playback_receipts,
    clientVoice?.playbackReceipts,
  ]
    .flatMap((entry) => (Array.isArray(entry) ? entry : []))
    .map((receipt) => readVoiceDiagnosticsRecord(receipt))
    .filter((receipt): receipt is Record<string, unknown> => Boolean(receipt));
}

export function buildVoiceClientDebugProjectionFields(input: {
  localPayload: Record<string, unknown>;
  liveVoice?: Record<string, unknown> | null;
  nowMs?: number;
}): Record<string, unknown> {
  const localPayload = input.localPayload;
  const channels = readVoiceDiagnosticsRecord(localPayload.channels);
  const voice =
    readVoiceDiagnosticsRecord(localPayload.voice) ??
    readVoiceDiagnosticsRecord(channels?.voice) ??
    readVoiceDiagnosticsRecord(localPayload.client_voice_debug) ??
    readVoiceDiagnosticsRecord(readVoiceDiagnosticsRecord(localPayload.client_debug_projection)?.voice) ??
    input.liveVoice ??
    null;
  const unifiedTimeline = Array.isArray(localPayload.unifiedTimeline)
    ? localPayload.unifiedTimeline
    : Array.isArray(localPayload.unified_timeline)
      ? localPayload.unified_timeline
      : null;
  const projection: Record<string, unknown> = {
    schema: "helix.client_debug_projection.v1",
    source: "browser_runtime",
    voice: voice ?? null,
    voice_authority_debug: voice && readVoiceDiagnosticsRecord(voice.voiceAuthorityDebug)
      ? voice.voiceAuthorityDebug
      : null,
    voice_playback_receipts: voice && Array.isArray(voice.playbackReceipts) ? voice.playbackReceipts : [],
    voice_playback_output: voice && readVoiceDiagnosticsRecord(voice.playbackOutput) ? voice.playbackOutput : null,
    voice_playback_metrics: voice && readVoiceDiagnosticsRecord(voice.playback) ? voice.playback : null,
    voice_calls: voice && Array.isArray(voice.voiceCalls) ? voice.voiceCalls : [],
    captured_at_ms:
      typeof localPayload.exportedAtMs === "number"
        ? localPayload.exportedAtMs
        : typeof localPayload.exported_at_ms === "number"
          ? localPayload.exported_at_ms
          : input.nowMs ?? Date.now(),
  };
  if (unifiedTimeline) {
    projection.unified_timeline_voice_rows = unifiedTimeline.filter((row) => {
      const record = readVoiceDiagnosticsRecord(row);
      const channel = coerceVoiceDiagnosticsText(record?.channel).trim();
      return channel === "voice_timeline" || channel === "voice_call" || channel === "voice_playback_receipt";
    });
  }
  return projection;
}

function isActiveVoicePlaybackReceipt(receipt: Record<string, unknown>, activeTurnId: string): boolean {
  if (!activeTurnId) return true;
  return [
    receipt.turnKey,
    receipt.utteranceId,
    receipt.sourceReceiptId,
    receipt.sourceReceiptKey,
    receipt.requestId,
    receipt.source_turn_id,
  ].some((value) => coerceVoiceDiagnosticsText(value).includes(activeTurnId));
}

function summarizeClientPlaybackReceipts(input: {
  source: Record<string, unknown>;
  activeTurnId: string | null;
}): Record<string, unknown> {
  const activeTurnId = input.activeTurnId?.trim() ?? "";
  const receipts = collectClientVoicePlaybackReceipts(input.source)
    .filter((receipt) => isActiveVoicePlaybackReceipt(receipt, activeTurnId))
    .sort((left, right) =>
      (readVoiceDiagnosticsNumber(left.atMs) ?? 0) - (readVoiceDiagnosticsNumber(right.atMs) ?? 0)
    );
  const latestReceipt = receipts[receipts.length - 1] ?? null;
  const receiptsWithStatus = (status: string) =>
    receipts.filter((receipt) => coerceVoiceDiagnosticsText(receipt.status).trim() === status);
  const queuedReceipts = receiptsWithStatus("queued");
  const deliveredReceipts = receiptsWithStatus("delivered");
  const failedReceipts = [
    ...receiptsWithStatus("failed"),
    ...receiptsWithStatus("cancelled"),
    ...receiptsWithStatus("suppressed"),
  ];
  const firstAtMs = (items: Record<string, unknown>[]) => readVoiceDiagnosticsNumber(items[0]?.atMs) ?? null;
  const latestAtMs = (items: Record<string, unknown>[]) =>
    readVoiceDiagnosticsNumber(items[items.length - 1]?.atMs) ?? null;
  const deliveredUtteranceIds = Array.from(
    new Set(deliveredReceipts.map((receipt) => coerceVoiceDiagnosticsText(receipt.utteranceId).trim()).filter(Boolean)),
  );
  const deliveredAtMs = latestAtMs(deliveredReceipts);
  return {
    client_playback_receipt_count: receipts.length,
    latest_client_playback_status: latestReceipt
      ? coerceVoiceDiagnosticsText(latestReceipt.status).trim() || null
      : null,
    playback_started: queuedReceipts.length > 0,
    playback_completed: deliveredReceipts.length > 0,
    playback_failed: failedReceipts.length > 0,
    playback_started_at_ms: firstAtMs(queuedReceipts),
    playback_completed_at_ms: deliveredAtMs,
    playback_failed_at_ms: latestAtMs(failedReceipts),
    delivered_utterance_ids: deliveredUtteranceIds,
    delivered_utterance_id: deliveredUtteranceIds[deliveredUtteranceIds.length - 1] ?? null,
    delivered_at_ms: deliveredAtMs,
    client_playback_receipts: receipts.slice(-5).map((receipt) => ({
      receiptId: coerceVoiceDiagnosticsText(receipt.receiptId).trim() || null,
      sourceReceiptId: coerceVoiceDiagnosticsText(receipt.sourceReceiptId).trim() || null,
      requestId: coerceVoiceDiagnosticsText(receipt.requestId).trim() || null,
      utteranceId: coerceVoiceDiagnosticsText(receipt.utteranceId).trim() || null,
      status: coerceVoiceDiagnosticsText(receipt.status).trim() || null,
      playback_status: coerceVoiceDiagnosticsText(receipt.playback_status).trim() || null,
      source_turn_id:
        coerceVoiceDiagnosticsText(receipt.source_turn_id).trim() ||
        coerceVoiceDiagnosticsText(receipt.turnKey).trim() ||
        null,
      source_text_hash: coerceVoiceDiagnosticsText(receipt.source_text_hash).trim() || null,
      chunk_index: readVoiceDiagnosticsNumber(receipt.chunk_index),
      chunk_count: readVoiceDiagnosticsNumber(receipt.chunk_count),
      position_ms: readVoiceDiagnosticsNumber(receipt.position_ms),
      atMs: readVoiceDiagnosticsNumber(receipt.atMs),
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      output_authority: "playback_observation",
    })),
  };
}

export function resolveVoiceTimelineClientBuildStamp(input: {
  stampedBuild?: string | null;
  isDev: boolean;
  hasWindow: boolean;
}): string {
  if (!input.hasWindow) return "unknown";
  const stamped = typeof input.stampedBuild === "string" ? input.stampedBuild.trim() : "";
  if (stamped) return stamped;
  return input.isDev ? "dev" : "prod";
}

export function summarizeVoiceSegments(segments: VoiceCaptureSegmentSnapshot[] | undefined): {
  total: number;
  dispatchCompleted: number;
  dispatchQueued: number;
  dispatchSuppressed: number;
  sttErrors: number;
} {
  if (!Array.isArray(segments) || segments.length === 0) {
    return {
      total: 0,
      dispatchCompleted: 0,
      dispatchQueued: 0,
      dispatchSuppressed: 0,
      sttErrors: 0,
    };
  }
  let dispatchCompleted = 0;
  let dispatchQueued = 0;
  let dispatchSuppressed = 0;
  let sttErrors = 0;
  segments.forEach((segment) => {
    if (segment.dispatch === "completed") dispatchCompleted += 1;
    if (segment.dispatch === "queued") dispatchQueued += 1;
    if (segment.dispatch === "suppressed") dispatchSuppressed += 1;
    if (segment.status === "stt_error") sttErrors += 1;
  });
  return {
    total: segments.length,
    dispatchCompleted,
    dispatchQueued,
    dispatchSuppressed,
    sttErrors,
  };
}

export function buildVoicePlaybackReconciliationDebug(input: {
  activeTurnId: string | null;
  selectedFinalAnswer: string | null;
  source: Record<string, unknown>;
}): Record<string, unknown> {
  const clientProjection = readVoiceDiagnosticsRecord(input.source.client_debug_projection);
  const clientVoice = readVoiceDiagnosticsRecord(input.source.client_voice_debug ?? clientProjection?.voice);
  const receipts = collectClientVoicePlaybackReceipts(input.source);
  const receiptKeyForReconciliation = (receipt: Record<string, unknown>): string => {
    const candidates = [
      receipt.receiptId,
      receipt.sourceReceiptId,
      receipt.sourceReceiptKey,
      receipt.utteranceId,
      receipt.requestId,
    ].map((value) => coerceVoiceDiagnosticsText(value).trim()).filter(Boolean);
    return candidates.join("|") || JSON.stringify(receipt).slice(0, 120);
  };
  const receiptsByKey = new Map<string, Record<string, unknown>>();
  for (const receipt of receipts) {
    const key = receiptKeyForReconciliation(receipt);
    const existing = receiptsByKey.get(key);
    if (!existing || coerceVoiceDiagnosticsText(existing.status).trim() !== "delivered") {
      receiptsByKey.set(key, receipt);
    }
  }
  const uniqueReceipts = Array.from(receiptsByKey.values());
  const voiceCallSources = [input.source.client_voice_calls, clientProjection?.voice_calls, clientVoice?.voiceCalls];
  const voiceCalls = voiceCallSources
    .flatMap((source) => (Array.isArray(source) ? source : []))
    .map((call) => readVoiceDiagnosticsRecord(call))
    .filter((call): call is Record<string, unknown> => Boolean(call));
  const voiceCallKeyForReconciliation = (call: Record<string, unknown>): string => {
    const candidates = [
      call.id,
      call.utteranceId,
      call.eventId,
      call.traceId,
      call.textHash,
    ].map((value) => coerceVoiceDiagnosticsText(value).trim()).filter(Boolean);
    return candidates.join("|") || JSON.stringify(call).slice(0, 120);
  };
  const voiceCallsByKey = new Map<string, Record<string, unknown>>();
  for (const call of voiceCalls) {
    voiceCallsByKey.set(voiceCallKeyForReconciliation(call), call);
  }
  const uniqueVoiceCalls = Array.from(voiceCallsByKey.values());
  const activeTurnId = input.activeTurnId?.trim() ?? "";
  const isActiveTurnReceipt = (receipt: Record<string, unknown>): boolean => {
    if (!activeTurnId) return true;
    return [
      receipt.turnKey,
      receipt.utteranceId,
      receipt.sourceReceiptId,
      receipt.sourceReceiptKey,
      receipt.requestId,
    ].some((value) => coerceVoiceDiagnosticsText(value).includes(activeTurnId));
  };
  const deliveredReceipts = uniqueReceipts.filter(
    (receipt) => coerceVoiceDiagnosticsText(receipt.status).trim() === "delivered" && isActiveTurnReceipt(receipt),
  );
  const deliveredUtteranceIds = Array.from(
    new Set(deliveredReceipts.map((receipt) => coerceVoiceDiagnosticsText(receipt.utteranceId).trim()).filter(Boolean)),
  );
  const audioBytesObserved = uniqueVoiceCalls
    .filter((call) => {
      const utteranceId = coerceVoiceDiagnosticsText(call.utteranceId).trim();
      return deliveredUtteranceIds.length === 0 || deliveredUtteranceIds.includes(utteranceId);
    })
    .reduce((total, call) => {
      const bytes = typeof call.audioBytes === "number" && Number.isFinite(call.audioBytes) ? call.audioBytes : 0;
      return total + Math.max(0, bytes);
    }, 0);
  const selectedText = input.selectedFinalAnswer ?? "";
  const selectedFinalAnswerClaim = /browser playback confirmation is still pending|playback confirmation is still pending/i.test(selectedText)
    ? "pending_client_playback"
    : "none";
  const playbackConfirmation = deliveredReceipts.length > 0 ? "delivered" : "not_observed";
  const correctedStatusText =
    selectedFinalAnswerClaim === "pending_client_playback" && playbackConfirmation === "delivered"
      ? "Client playback receipt confirms delivered audio after the final answer was composed."
      : null;
  return {
    schema: "helix.voice_playback_reconciliation.v1",
    source: "client_playback_receipts",
    active_turn_id: activeTurnId || null,
    selected_final_answer_claim: selectedFinalAnswerClaim,
    playback_confirmation: playbackConfirmation,
    delivered_receipt_count: deliveredReceipts.length,
    delivered_utterance_ids: deliveredUtteranceIds,
    audio_bytes_observed: audioBytesObserved,
    corrected_status_text: correctedStatusText,
    terminal_answer_mutated: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
    output_authority: "client_playback_observation",
  };
}

export function buildVoicePlaybackReceiptBarrierDebug(input: {
  activeTurnId: string | null;
  selectedFinalAnswer: string | null;
  source: Record<string, unknown>;
}): Record<string, unknown> | null {
  const trace = readVoiceDiagnosticsRecord(input.source.ask_turn_solver_trace);
  const capabilityResult = readVoiceDiagnosticsRecord(trace?.capability_result ?? input.source.capability_result);
  const chainAudit = readVoiceDiagnosticsRecord(input.source.tool_turn_chain_audit);
  const canonicalGoalFrame = readVoiceDiagnosticsRecord(input.source.canonical_goal_frame);
  const requestedCapability =
    coerceVoiceDiagnosticsText(capabilityResult?.requested_capability).trim() ||
    coerceVoiceDiagnosticsText(chainAudit?.requested_capability).trim() ||
    coerceVoiceDiagnosticsText(canonicalGoalFrame?.requested_capability).trim();
  const executedCapability =
    coerceVoiceDiagnosticsText(capabilityResult?.executed_capability).trim() ||
    coerceVoiceDiagnosticsText(chainAudit?.executed_capability).trim();
  if (requestedCapability !== "text_to_speech.speak_text" && executedCapability !== "text_to_speech.speak_text") {
    return null;
  }
  const observationRefs = Array.isArray(capabilityResult?.observation_refs)
    ? capabilityResult.observation_refs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0)
    : [];
  const finalStatusMatch = (input.selectedFinalAnswer ?? "").match(/\bplayback_status\s*:\s*([a-z0-9_.-]+)/i);
  const reentered =
    readVoiceDiagnosticsBoolean(capabilityResult?.reentered_solver) ??
    readVoiceDiagnosticsBoolean(chainAudit?.reentry_executed) ??
    readVoiceDiagnosticsBoolean(chainAudit?.reentry_proven) ??
    false;
  return {
    schema: "helix.voice_playback_receipt_barrier.v1",
    source: "agent_provider_gateway_reentry_projection",
    active_turn_id: input.activeTurnId,
    requested_capability: requestedCapability || null,
    executed_capability: executedCapability || null,
    capability_result_status: coerceVoiceDiagnosticsText(capabilityResult?.status).trim() || null,
    playback_status: finalStatusMatch?.[1]?.toLowerCase() ?? null,
    receipt_kind: "helix.interim_voice_callout_tool_result.v1",
    observation_refs: observationRefs,
    ...summarizeClientPlaybackReceipts({
      source: input.source,
      activeTurnId: input.activeTurnId,
    }),
    receipt_observed: observationRefs.length > 0,
    evidence_reentered: reentered,
    terminal_blockers: reentered ? [] : ["voice_playback_receipt_not_reentered"],
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
    output_authority: "voice_playback_observation",
  };
}

function buildVoiceAuthorityDebugSummary(snapshot: VoiceCaptureDiagnosticsSnapshot): Record<string, unknown> {
  const segments = Array.isArray(snapshot.segments) ? snapshot.segments : [];
  const playbackReceipts = Array.isArray(snapshot.playbackReceipts) ? snapshot.playbackReceipts : [];
  const voiceCalls = Array.isArray(snapshot.voiceCalls) ? snapshot.voiceCalls : [];
  const timeline = Array.isArray(snapshot.timelineEvents) ? snapshot.timelineEvents : [];
  const handoffEvents = timeline.filter((event) =>
    event.kind === "interim_voice_handoff_seen" || event.kind === "interim_voice_enqueue_attempted"
  );
  const latestHandoff = handoffEvents[handoffEvents.length - 1] ?? null;
  const latestReceipt = playbackReceipts[playbackReceipts.length - 1] ?? null;
  const deliveredReceipts = playbackReceipts.filter((receipt) => receipt.status === "delivered");
  const queuedReceipts = playbackReceipts.filter((receipt) => receipt.status === "queued");
  const failedReceipts = playbackReceipts.filter((receipt) =>
    receipt.status === "failed" || receipt.status === "cancelled" || receipt.status === "suppressed"
  );
  const audioBytesObserved = voiceCalls
    .filter((call) => call.kind === "speak")
    .reduce((total, call) => total + Math.max(0, call.audioBytes ?? 0), 0);
  return {
    schema: "helix.voice_authority_debug_summary.v1",
    voice_input_capture: {
      mic_armed: snapshot.micArmState === "on",
      mic_arm_state: snapshot.micArmState,
      voice_input_state: snapshot.voiceInputState,
      voice_signal_state: snapshot.voiceSignalState,
      media_chunk_count: snapshot.mediaChunkCount,
      media_bytes: snapshot.mediaBytes,
      segment_count: segments.length,
      stt_transcribing_count: segments.filter((segment) => segment.status === "transcribing").length,
      stt_ok_count: segments.filter((segment) => segment.status === "stt_ok").length,
      stt_error_count: segments.filter((segment) => segment.status === "stt_error").length,
      dispatch_queued_count: segments.filter((segment) => segment.dispatch === "queued").length,
      dispatch_completed_count: segments.filter((segment) => segment.dispatch === "completed").length,
      dispatch_suppressed_count: segments.filter((segment) => segment.dispatch === "suppressed").length,
      observation_role: "input_capture_observation",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    },
    voice_output_playback: {
      output_path_expected: snapshot.playbackOutput?.expectedPath ?? null,
      current_utterance_path: snapshot.playbackOutput?.currentUtterancePath ?? null,
      audio_unlocked: snapshot.playbackOutput?.audioUnlocked ?? null,
      audio_graph_attached: snapshot.playbackOutput?.audioGraphAttached ?? null,
      active_utterance_id: snapshot.playback?.utteranceId ?? null,
      active_turn_key: snapshot.playback?.turnKey ?? null,
      active_kind: snapshot.playback?.kind ?? null,
      active_authority: snapshot.playback?.authority ?? null,
      active_source: snapshot.playback?.source ?? null,
      audio_bytes_observed: audioBytesObserved,
      observation_role: "output_playback_observation",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    },
    tool_admission: {
      handoff_event_count: handoffEvents.length,
      latest_handoff_kind: latestHandoff?.kind ?? null,
      latest_handoff_status: latestHandoff?.status ?? null,
      latest_handoff_turn_key: latestHandoff?.turnKey ?? null,
      latest_handoff_utterance_id: latestHandoff?.utteranceId ?? null,
      latest_handoff_authority: latestHandoff?.utteranceAuthority ?? null,
      latest_handoff_source: latestHandoff?.utteranceSource ?? null,
      latest_handoff_debug: latestHandoff?.debugContext ?? null,
      observation_role: "tool_admission_projection",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    },
    playback_receipt: {
      receipt_count: playbackReceipts.length,
      latest_receipt_id: latestReceipt?.receiptId ?? null,
      latest_request_id: latestReceipt?.requestId ?? null,
      latest_source_receipt_id: latestReceipt?.sourceReceiptId ?? null,
      latest_utterance_id: latestReceipt?.utteranceId ?? null,
      latest_turn_key: latestReceipt?.turnKey ?? null,
      latest_status: latestReceipt?.status ?? null,
      queued_count: queuedReceipts.length,
      delivered_count: deliveredReceipts.length,
      failed_count: failedReceipts.length,
      delivered_at_ms: deliveredReceipts[deliveredReceipts.length - 1]?.atMs ?? null,
      observation_role: "playback_receipt_observation",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    },
    terminal_answer_authority: {
      receipts_are_answers: false,
      playback_claim_requires_client_receipt: true,
      final_answer_may_report_receipt_only: true,
      terminal_authority_owner: "completed_solver_path",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    },
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
    output_authority: "voice_debug_projection",
  };
}

export function sanitizeVoiceDiagnosticsForExport(
  snapshot: VoiceCaptureDiagnosticsSnapshot | null,
): Record<string, unknown> | null {
  if (!snapshot) return null;
  const timeline = Array.isArray(snapshot.timelineEvents) ? snapshot.timelineEvents.slice(-160) : [];
  return {
    voiceAuthorityDebug: buildVoiceAuthorityDebugSummary(snapshot),
    updatedAtMs: snapshot.updatedAtMs,
    micArmState: snapshot.micArmState,
    voiceInputState: snapshot.voiceInputState,
    voiceSignalState: snapshot.voiceSignalState,
    warnings: [...snapshot.warnings],
    monitor: {
      level: Number(snapshot.voiceMonitorLevel.toFixed(6)),
      threshold: Number(snapshot.voiceMonitorThreshold.toFixed(6)),
      rmsDb: Number(snapshot.rmsDb.toFixed(3)),
      chunksPerSecond: Number(snapshot.chunksPerSecond.toFixed(3)),
      lastRoundtripMs: snapshot.lastRoundtripMs ?? null,
    },
    segments: summarizeVoiceSegments(snapshot.segments),
    playback: snapshot.playback
      ? {
          utteranceId: snapshot.playback.utteranceId,
          turnKey: snapshot.playback.turnKey,
          kind: snapshot.playback.kind,
          authority: snapshot.playback.authority ?? null,
          source: snapshot.playback.source ?? null,
          replyId: snapshot.playback.replyId ?? null,
          chunkCount: snapshot.playback.chunkCount,
          enqueueToFirstAudioMs: snapshot.playback.enqueueToFirstAudioMs ?? null,
          totalPlaybackMs: snapshot.playback.totalPlaybackMs ?? null,
          cancelReason: snapshot.playback.cancelReason ?? null,
          cacheHitCount: snapshot.playback.cacheHitCount,
          cacheMissCount: snapshot.playback.cacheMissCount,
          providerHeader: snapshot.playback.providerHeader ?? null,
          profileHeader: snapshot.playback.profileHeader ?? null,
        }
      : null,
    playbackOutput: snapshot.playbackOutput
      ? {
          expectedPath: snapshot.playbackOutput.expectedPath,
          currentUtterancePath: snapshot.playbackOutput.currentUtterancePath ?? null,
          currentUtteranceDirectFallback: snapshot.playbackOutput.currentUtteranceDirectFallback ?? null,
          graphBypassActive: snapshot.playbackOutput.graphBypassActive ?? null,
          graphFailureStreak: snapshot.playbackOutput.graphFailureStreak ?? null,
          fallbackCount: snapshot.playbackOutput.fallbackCount ?? null,
          lastFallbackReason: snapshot.playbackOutput.lastFallbackReason ?? null,
          audioUnlocked: snapshot.playbackOutput.audioUnlocked,
          audioGraphAttached: snapshot.playbackOutput.audioGraphAttached,
        }
      : null,
    playbackReceipts: Array.isArray(snapshot.playbackReceipts)
      ? snapshot.playbackReceipts.slice(-80).map((receipt) => ({
          schema: receipt.schema,
          receiptId: receipt.receiptId,
          sourceReceiptId: receipt.sourceReceiptId,
          sourceReceiptKey: receipt.sourceReceiptKey,
          requestId: receipt.requestId,
          calloutKind: receipt.calloutKind,
          utteranceId: receipt.utteranceId,
          turnKey: receipt.turnKey,
          source_turn_id: receipt.source_turn_id,
          source_text_hash: receipt.source_text_hash,
          kind: receipt.kind,
          status: receipt.status,
          playback_status: receipt.playback_status,
          chunk_index: receipt.chunk_index,
          chunk_count: receipt.chunk_count,
          position_ms: receipt.position_ms,
          atMs: receipt.atMs,
          providerHeader: receipt.providerHeader,
          profileHeader: receipt.profileHeader,
          cacheHitCount: receipt.cacheHitCount,
          cacheMissCount: receipt.cacheMissCount,
          totalPlaybackMs: receipt.totalPlaybackMs,
          cancelReason: receipt.cancelReason,
          error: receipt.error,
          audioUnlocked: receipt.audioUnlocked,
          playbackPath: receipt.playbackPath,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
          output_authority: "playback_observation",
        }))
      : [],
    voiceCalls: Array.isArray(snapshot.voiceCalls)
      ? snapshot.voiceCalls.slice(-80).map((call) => ({
          id: call.id,
          kind: call.kind,
          endpoint: call.endpoint,
          startedAtMs: call.startedAtMs,
          endedAtMs: call.endedAtMs,
          durationMs: call.durationMs,
          ok: call.ok,
          status: call.status,
          responseKind: call.responseKind,
          contentType: call.contentType,
          traceId: call.traceId,
          missionId: call.missionId,
          eventId: call.eventId ?? null,
          utteranceId: call.utteranceId ?? null,
          turnKey: call.turnKey ?? null,
          mode: call.mode ?? null,
          priority: call.priority ?? null,
          providerHeader: call.providerHeader ?? null,
          profileHeader: call.profileHeader ?? null,
          cacheHeader: call.cacheHeader ?? null,
          textLength: call.textLength ?? null,
          textHash: call.textHash ?? null,
          audioBytes: call.audioBytes ?? null,
          audioMimeType: call.audioMimeType ?? null,
          audioDurationMs: call.audioDurationMs ?? null,
          error: call.error ?? null,
        }))
      : [],
    timelineEvents: timeline.map((event) => ({
      id: event.id,
      atMs: event.atMs,
      source: event.source,
      kind: event.kind,
      status: event.status ?? null,
      traceId: event.traceId ?? null,
      turnKey: event.turnKey ?? null,
      attemptId: event.attemptId ?? null,
      utteranceId: event.utteranceId ?? null,
      utteranceAuthority: event.utteranceAuthority ?? null,
      utteranceSource: event.utteranceSource ?? null,
      replyId: event.replyId ?? null,
      detail: event.detail ?? null,
      text: event.text ?? null,
      debugContext: event.debugContext ?? null,
    })),
  };
}
