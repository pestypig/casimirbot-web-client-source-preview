import React from "react";
import type {
  AgentGoalActuatorV1,
  AgentGoalContextFeedKindV1,
  AgentGoalSessionV1,
} from "@shared/contracts/workstation-goal-context.v1";
import { queryActuatorForAgentGoalContextFeedV1 } from "@shared/contracts/workstation-goal-context.v1";
import { workstationCircuitColor } from "@/lib/workstation/reasoningCircuitColor";

export type LiveAnswerReasoningCircuitRow = {
  id: string;
  title: string;
  producer: string;
  status: string;
  preview: string;
  contentRef: string;
  sourceRefs: string[];
  loopRefs: string[];
  evidenceRefs: string[];
  receiptRefs: string[];
  policyRefs: string[];
  requestedToolName?: string | null;
  canonicalToolName?: string | null;
  matchedAllowedActuators?: string[];
  matchedAllowedActuatorRefs?: string[];
  packetCircuitRefs: LiveAnswerPacketCircuitRef[];
  dispatch: string[];
  packetColorKey: string;
  freshness: {
    observedAtMs: number;
    staleAfterMs?: number;
    status: string;
  };
  authority: {
    assistantAnswer: boolean;
    terminalEligible: boolean;
    rawContentIncluded: boolean;
    postToolModelStepRequired: boolean;
  };
};

export type LiveAnswerPacketCircuitRef = {
  updateId: string;
  contentRef: string;
  packetRefs: string[];
  microDeckRefs: string[];
  transcriptRefs: string[];
  projectionRefs: string[];
  sourceHealthRefs: string[];
  actuatorRefs: string[];
  traceMemoryRefs: string[];
  narratorRefs: string[];
  routeWatchRefs: string[];
  automationRefs: string[];
  sourceRefs: string[];
  loopRefs: string[];
  receiptRefs: string[];
  freshnessStatus: string;
  assistantAnswer: boolean;
  terminalEligible: boolean;
  rawContentIncluded: boolean;
};

export type LiveAnswerReasoningCircuitSummary = {
  updateCount: number;
  observationOnlyCount: number;
  activeGoalCount: number;
  narratorSpeechCount: number;
  narratorBindingCount: number;
  wakeCount: number;
  wakeUrgentCount: number;
  wakeBlockedCount: number;
  wakePolicyTriggeredCount: number;
  workstationControlDispatchCount: number;
  presetDispatchCount: number;
  sourceBindingDispatchCount: number;
  sourceRepairDispatchCount: number;
  loopDispatchCount: number;
  liveAnswerDispatchCount: number;
  processGraphDispatchCount: number;
  visualSummaryCount: number;
  microdeckOutputCount: number;
  microdeckLifecycleCount: number;
  microdeckPresetCreateCount: number;
  microdeckPresetStateCount: number;
  microdeckPresetQueryCount: number;
  microdeckPresetDraftCount: number;
  microdeckPromptRouteCount: number;
  microdeckPromptUpdateCount: number;
  microdeckPromptTestCount: number;
  audioTranscriptCount: number;
  translatedTranscriptCount: number;
  packetTraceCount: number;
  sourceHealthCount: number;
  feedQueryCount: number;
  routeWatchCount: number;
  routeEvidenceCount: number;
  automationCount: number;
  automationPolicyCount: number;
  feedPolicyRefCount: number;
  actuatorPolicyRefCount: number;
  freshnessFilterRefCount: number;
  sessionFilterRefCount: number;
  toolAttributedUpdateCount: number;
  matchedToolActuatorUpdateCount: number;
  actuatorPolicyCount: number;
  narratorEventFeedCount: number;
  narratorActuatorPolicyCount: number;
  traceMemoryCount: number;
  terminalAuthorityRequiredCount: number;
  terminalPosture: string;
};

type LiveAnswerCircuitHop = {
  key: string;
  label: string;
  value: string;
};

type LiveAnswerContextFeedLane = {
  key: string;
  goalId: string;
  feedId: string;
  contextFeedRef: string;
  sourceKind: AgentGoalContextFeedKindV1;
  freshnessMs?: number;
  relevancePolicy?: string;
  query?: string;
  queryActuator: AgentGoalActuatorV1 | null;
  actuatorAllowed: boolean;
  allowedActuatorRef: string | null;
};

const compactLabel = (value: string): string =>
  value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "unknown";

const compactCircuitRef = (value: string): string =>
  compactLabel(
    value
      .replace(/^stage_play_/i, "")
      .replace(/^workstation_/i, "")
      .replace(/^live_answer_/i, "live_answer:")
      .replace(/^source:/i, "source:"),
  );

const authorityChipClass = (flag: boolean): string =>
  flag
    ? "rounded border border-rose-300/30 bg-rose-950/20 px-1.5 py-0.5 font-mono text-[10px] text-rose-100"
    : "rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-400";

const postToolChipClass = (required: boolean): string =>
  required
    ? "rounded border border-emerald-300/25 bg-emerald-950/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-100"
    : "rounded border border-rose-300/30 bg-rose-950/20 px-1.5 py-0.5 font-mono text-[10px] text-rose-100";

const packetTrailColor = (value: string): { hsl: string; border: string; background: string; glow: string } => {
  return workstationCircuitColor(value, "packet");
};

const cadenceLabel = (cadence: AgentGoalSessionV1["cadence"]): string => {
  if (cadence.kind === "manual") return "manual";
  if (cadence.kind === "user_turn_only") return "user turn";
  if (cadence.kind === "interval") return `interval ${cadence.everyMs}ms`;
  return `after ${cadence.minUpdates} updates`;
};

const freshnessLabel = (freshness: LiveAnswerReasoningCircuitRow["freshness"]): string => {
  const staleAfter = freshness.staleAfterMs === undefined ? "unbounded" : `${freshness.staleAfterMs}ms`;
  return `${freshness.status} observed=${freshness.observedAtMs} staleAfter=${staleAfter}`;
};

const firstCircuitRef = (
  refs: string[],
  match: (ref: string) => boolean,
  fallback: string,
): string => refs.find(match) ?? refs[0] ?? fallback;

const circuitDestinationLabel = (dispatch: string): string => {
  const normalized = dispatch.trim();
  if (/wake/i.test(normalized)) return "interrupt dispatch";
  if (/narrator bind/i.test(normalized)) return normalized.replace(/^narrator bind\s*/i, "narrator:");
  if (/narrator/i.test(normalized)) return "narrator output";
  if (/preset/i.test(normalized)) return normalized.replace(/^preset\s*/i, "preset:");
  if (/bind source/i.test(normalized)) return "source binding";
  if (/unbind source/i.test(normalized)) return "source unbinding";
  if (/focus graph/i.test(normalized)) return "process graph focus";
  if (/update live answer/i.test(normalized)) return "live answer projection";
  if (/set loop state/i.test(normalized)) return "loop control";
  if (/repair source/i.test(normalized)) return "source repair";
  if (/repair loop/i.test(normalized)) return "loop repair";
  if (/ask user/i.test(normalized)) return "operator";
  return normalized || "destination pending";
};

const displayDispatchLabel = (dispatch: string): string =>
  /wake/i.test(dispatch) ? "interrupt dispatch" : dispatch;

const primaryCircuitDispatch = (dispatches: string[]): string =>
  dispatches.find((dispatch) => !/receipt|append goal context|update panel/i.test(dispatch)) ??
  dispatches[0] ??
  "no dispatch";

const countDispatches = (dispatches: string[], match: RegExp): number =>
  dispatches.filter((dispatch) => match.test(dispatch)).length;

const dispatchCustodyLabel = (dispatches: string[]): string => {
  const actionDispatches = dispatches.filter((dispatch) => !/receipt|append goal context|update panel/i.test(dispatch));
  const receiptLogs = countDispatches(dispatches, /receipt/i);
  const goalContextAppends = countDispatches(dispatches, /append goal context/i);
  const panelUpdates = countDispatches(dispatches, /update panel/i);
  const narratorActions = countDispatches(actionDispatches, /narrator/i);
  const interruptDispatches = countDispatches(actionDispatches, /wake|interrupt/i);
  const workstationControls = countDispatches(
    actionDispatches,
    /preset|bind source|unbind source|set loop state|repair source|repair loop|focus graph|update live answer/i,
  );
  return [
    `receiptLogs=${receiptLogs}`,
    `goalContext=${goalContextAppends}`,
    `panel=${panelUpdates}`,
    `narrator=${narratorActions}`,
    `interrupt=${interruptDispatches}`,
    `control=${workstationControls}`,
  ].join(" ");
};

const liveAnswerCircuitHops = (row: LiveAnswerReasoningCircuitRow): LiveAnswerCircuitHop[] => {
  const allRefs = Array.from(new Set([
    row.contentRef,
    ...row.sourceRefs,
    ...row.loopRefs,
    ...row.evidenceRefs,
    ...row.receiptRefs,
  ].filter(Boolean)));
  const source = firstCircuitRef(
    row.sourceRefs,
    (ref) => /source|visual|audio|frame|transcript|lens|screen/i.test(ref),
    "source pending",
  );
  const loop = firstCircuitRef(
    row.loopRefs,
    (ref) => /loop|mail|translation|transcription|health|automation|route|watch/i.test(ref),
    row.producer,
  );
  const deckRefs = allRefs.filter((ref) =>
    /microdeck|micro_reasoner|prompt_preset|deck/i.test(ref)
  );
  const deck = deckRefs.find((ref) =>
    /^microdeck-output:|^microdeck_output:|^stage_play_micro_reasoner_|prompt_preset/i.test(ref)
  ) ?? deckRefs[0] ?? allRefs.find((ref) =>
    /translated_transcript|translation|transcript/i.test(ref)
  ) ?? row.contentRef ?? row.title;
  const routeDispatches = row.dispatch.filter((dispatch) => !/receipt|append goal context|update panel/i.test(dispatch));
  const destination = Array.from(new Set(routeDispatches.map(circuitDestinationLabel)))
    .slice(0, 4)
    .map(compactCircuitRef)
    .join(" | ") || "destination pending";
  const authority = row.authority.terminalEligible === false &&
    row.authority.assistantAnswer === false &&
    row.authority.rawContentIncluded === false
      ? "evidence only"
      : "blocked terminal claim";
  return [
    { key: "source", label: "Source", value: compactCircuitRef(source) },
    { key: "loop", label: "Loop", value: compactCircuitRef(loop) },
    { key: "deck", label: "Deck", value: compactCircuitRef(deck) },
    { key: "dispatch", label: "Dispatch", value: compactLabel(primaryCircuitDispatch(row.dispatch)) },
    { key: "destination", label: "Destination", value: destination },
    { key: "authority", label: "Authority", value: authority },
  ];
};

const contextFeedPolicyRefs = (refs: string[]): string[] =>
  refs.filter((ref) =>
    ref.startsWith("context_feed:") ||
    ref.startsWith("agent_goal_context_feed:") ||
    ref.startsWith("workstation_context_feed:")
  );

const actuatorPolicyRefs = (refs: string[]): string[] =>
  refs.filter((ref) =>
    ref.startsWith("agent_goal_allowed_actuator:") ||
    ref.startsWith("allowed_actuator:") ||
    ref.startsWith("workstation_actuator:")
  );

const freshnessFilterRefs = (refs: string[]): string[] =>
  refs.filter((ref) => ref.startsWith("freshness_filter:"));

const sessionFilterRefs = (refs: string[]): string[] =>
  refs.filter((ref) => ref.startsWith("agent_goal_session_filter:"));

const microDeckLifecycleRefs = (refs: string[]): string[] =>
  Array.from(new Set(refs.filter((ref) =>
    /^microdeck:|^microdeck[-_]|^micro_reasoner:|^stage_play_micro_reasoner_|^workstation_context_feed:microdeck_outputs|^workstation_actuator:query_microdeck_outputs|prompt_preset/i.test(ref)
  )));

const microDeckLifecycleRefsForRow = (row: LiveAnswerReasoningCircuitRow): string[] =>
  microDeckLifecycleRefs([
    row.contentRef,
    ...row.sourceRefs,
    ...row.loopRefs,
    ...row.evidenceRefs,
    ...row.receiptRefs,
    ...row.policyRefs,
    ...row.packetCircuitRefs.flatMap((ref) => ref.microDeckRefs),
  ].filter(Boolean));

const countMicroDeckLifecycleRefs = (refs: string[], patterns: RegExp[]): number =>
  refs.filter((ref) => patterns.some((pattern) => pattern.test(ref))).length;

const narratorControlActuators = (actuators: readonly AgentGoalActuatorV1[]): AgentGoalActuatorV1[] =>
  actuators.filter((actuator) =>
    actuator === "bind_narrator" ||
    actuator === "narrator_bind_stream" ||
    actuator === "narrator_say"
  );

const toolIdentityLabel = (row: LiveAnswerReasoningCircuitRow): string => {
  if (!row.requestedToolName && !row.canonicalToolName) return "tool=none";
  const requested = row.requestedToolName ?? "unknown";
  const canonical = row.canonicalToolName ?? requested;
  return requested === canonical ? `tool=${canonical}` : `tool=${requested} -> ${canonical}`;
};

const matchedActuatorLabel = (row: LiveAnswerReasoningCircuitRow): string =>
  `matched=${row.matchedAllowedActuators?.length ? row.matchedAllowedActuators.join(", ") : "none"}`;

const matchedActuatorRefLabel = (row: LiveAnswerReasoningCircuitRow): string =>
  `matchedRefs=${row.matchedAllowedActuatorRefs?.length ? row.matchedAllowedActuatorRefs.join(", ") : "none"}`;

const finalReportContractLabel = (session: AgentGoalSessionV1): string => {
  const requirements = session.authority.finalReportRequirements;
  return [
    `completed_solver_path=${String(requirements?.completedSolverPathRequired ?? false)}`,
    `evidence_reentry=${String(requirements?.evidenceReentryRequired ?? false)}`,
    `route_authority=${String(requirements?.routeAuthorityRequired ?? false)}`,
    `single_writer=${String(requirements?.terminalAuthoritySingleWriterRequired ?? false)}`,
    `allowed_terminal=${requirements?.allowedTerminalArtifactKinds?.map(compactLabel).join(", ") || "none"}`,
    `required_evidence=${requirements?.requiredEvidenceKinds?.map(compactLabel).join(", ") || "none"}`,
    `prohibited_sources=${requirements?.prohibitedReportSources?.map(compactLabel).join(", ") || "none"}`,
  ].join("; ");
};

const buildContextFeedLanes = (sessions: AgentGoalSessionV1[]): LiveAnswerContextFeedLane[] =>
  sessions.flatMap((session: AgentGoalSessionV1) =>
    session.contextFeeds.map((feed): LiveAnswerContextFeedLane => {
      const queryActuator = queryActuatorForAgentGoalContextFeedV1(feed.sourceKind);
      const actuatorAllowed = queryActuator === null ? false : session.allowedActuators.includes(queryActuator);
      return {
        key: `${session.goalId}:${feed.feedId}`,
        goalId: session.goalId,
        feedId: feed.feedId,
        contextFeedRef: `agent_goal_context_feed:${feed.feedId}`,
        sourceKind: feed.sourceKind,
        freshnessMs: feed.freshnessMs,
        relevancePolicy: feed.relevancePolicy,
        query: feed.query,
        queryActuator,
        actuatorAllowed,
        allowedActuatorRef: actuatorAllowed && queryActuator !== null
          ? `agent_goal_allowed_actuator:${queryActuator}`
          : null,
      };
    }),
  );

export function LiveAnswerReasoningCircuit({
  rows,
  summary,
  sessions,
}: {
  rows: LiveAnswerReasoningCircuitRow[];
  summary: LiveAnswerReasoningCircuitSummary;
  sessions: AgentGoalSessionV1[];
}) {
  const contextFeedLanes = buildContextFeedLanes(sessions);
  return (
    <div className="order-13 mt-3 rounded border border-violet-300/20 bg-violet-950/10 px-2 py-2" data-testid="live-answer-reasoning-circuit">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase text-violet-100">Reasoning circuit</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Stage Play goal context mirrored into Live Answer as observation state.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded border border-violet-300/20 px-2 py-1 font-mono text-[10px] text-violet-100">
            {summary.updateCount} updates
          </span>
          <span className="rounded border border-emerald-300/20 px-2 py-1 font-mono text-[10px] text-emerald-100">
            {summary.activeGoalCount} goals
          </span>
          <span className="rounded border border-cyan-300/20 px-2 py-1 font-mono text-[10px] text-cyan-100" data-testid="live-answer-narrator-speech-count">
            {summary.narratorSpeechCount} narrator speech
          </span>
          <span className="rounded border border-cyan-300/20 px-2 py-1 font-mono text-[10px] text-cyan-100" data-testid="live-answer-narrator-binding-count">
            {summary.narratorBindingCount} narrator bindings
          </span>
          <span className="rounded border border-amber-300/20 px-2 py-1 font-mono text-[10px] text-amber-100" data-testid="live-answer-wake-dispatch-count">
            {summary.wakeCount} interrupt dispatch{summary.wakeCount === 1 ? "" : "es"}
          </span>
          <span className="rounded border border-emerald-300/20 px-2 py-1 font-mono text-[10px] text-emerald-100" data-testid="live-answer-control-dispatch-count">
            {summary.workstationControlDispatchCount} workstation control dispatch{summary.workstationControlDispatchCount === 1 ? "" : "es"}
          </span>
          <span className="rounded border border-fuchsia-300/20 px-2 py-1 font-mono text-[10px] text-fuchsia-100" data-testid="live-answer-microdeck-output-count">
            {summary.microdeckOutputCount} MicroDeck output{summary.microdeckOutputCount === 1 ? "" : "s"}
          </span>
          <span className="rounded border border-fuchsia-300/20 px-2 py-1 font-mono text-[10px] text-fuchsia-100" data-testid="live-answer-microdeck-lifecycle-count">
            {summary.microdeckLifecycleCount} MicroDeck lifecycle ref{summary.microdeckLifecycleCount === 1 ? "" : "s"}
          </span>
          <span className="rounded border border-sky-300/20 px-2 py-1 font-mono text-[10px] text-sky-100" data-testid="live-answer-visual-summary-count">
            {summary.visualSummaryCount} visual summaries
          </span>
          <span className="rounded border border-blue-300/20 px-2 py-1 font-mono text-[10px] text-blue-100" data-testid="live-answer-audio-transcript-count">
            {summary.audioTranscriptCount} audio transcripts
          </span>
          <span className="rounded border border-teal-300/20 px-2 py-1 font-mono text-[10px] text-teal-100" data-testid="live-answer-translated-transcript-count">
            {summary.translatedTranscriptCount} translations
          </span>
          <span className="rounded border border-teal-300/20 px-2 py-1 font-mono text-[10px] text-teal-100" data-testid="live-answer-packet-trace-count">
            {summary.packetTraceCount} packet traces
          </span>
          <span className="rounded border border-lime-300/20 px-2 py-1 font-mono text-[10px] text-lime-100" data-testid="live-answer-source-health-count">
            {summary.sourceHealthCount} source health
          </span>
          <span className="rounded border border-indigo-300/20 px-2 py-1 font-mono text-[10px] text-indigo-100" data-testid="live-answer-feed-query-count">
            {summary.feedQueryCount} feed queries
          </span>
          <span className="rounded border border-indigo-300/20 px-2 py-1 font-mono text-[10px] text-indigo-100" data-testid="live-answer-feed-policy-ref-count">
            {summary.feedPolicyRefCount} feed policy refs
          </span>
          <span className="rounded border border-indigo-300/20 px-2 py-1 font-mono text-[10px] text-indigo-100" data-testid="live-answer-actuator-policy-ref-count">
            {summary.actuatorPolicyRefCount} actuator policy refs
          </span>
          <span className="rounded border border-indigo-300/20 px-2 py-1 font-mono text-[10px] text-indigo-100" data-testid="live-answer-freshness-filter-ref-count">
            {summary.freshnessFilterRefCount} freshness filters
          </span>
          <span className="rounded border border-indigo-300/20 px-2 py-1 font-mono text-[10px] text-indigo-100" data-testid="live-answer-session-filter-ref-count">
            {summary.sessionFilterRefCount} session filters
          </span>
          <span className="rounded border border-violet-300/20 px-2 py-1 font-mono text-[10px] text-violet-100" data-testid="live-answer-tool-attribution-count">
            {summary.toolAttributedUpdateCount} tool-attributed updates
          </span>
          <span className="rounded border border-violet-300/20 px-2 py-1 font-mono text-[10px] text-violet-100" data-testid="live-answer-matched-tool-actuator-count">
            {summary.matchedToolActuatorUpdateCount} matched tool actuator updates
          </span>
          <span className="rounded border border-sky-300/20 px-2 py-1 font-mono text-[10px] text-sky-100" data-testid="live-answer-route-watch-count">
            {summary.routeWatchCount} route watch
          </span>
          <span className="rounded border border-sky-300/20 px-2 py-1 font-mono text-[10px] text-sky-100" data-testid="live-answer-route-evidence-count">
            {summary.routeEvidenceCount} route evidence
          </span>
          <span className="rounded border border-orange-300/20 px-2 py-1 font-mono text-[10px] text-orange-100" data-testid="live-answer-automation-count">
            {summary.automationCount} automations
          </span>
          <span className="rounded border border-orange-300/20 px-2 py-1 font-mono text-[10px] text-orange-100" data-testid="live-answer-automation-policy-count">
            {summary.automationPolicyCount} automation policies
          </span>
          <span className="rounded border border-emerald-300/20 px-2 py-1 font-mono text-[10px] text-emerald-100" data-testid="live-answer-actuator-policy-count">
            {summary.actuatorPolicyCount} actuator polic{summary.actuatorPolicyCount === 1 ? "y" : "ies"}
          </span>
          <span className="rounded border border-cyan-300/20 px-2 py-1 font-mono text-[10px] text-cyan-100" data-testid="live-answer-narrator-actuator-policy-count">
            {summary.narratorActuatorPolicyCount} narrator output polic{summary.narratorActuatorPolicyCount === 1 ? "y" : "ies"}
          </span>
          <span className="rounded border border-cyan-300/20 px-2 py-1 font-mono text-[10px] text-cyan-100" data-testid="live-answer-narrator-event-feed-count">
            {summary.narratorEventFeedCount} narrator event feeds
          </span>
          <span className="rounded border border-fuchsia-300/20 px-2 py-1 font-mono text-[10px] text-fuchsia-100" data-testid="live-answer-trace-memory-count">
            {summary.traceMemoryCount} trace memory
          </span>
          <span className="rounded border border-violet-300/20 px-2 py-1 font-mono text-[10px] text-violet-100" data-testid="live-answer-observation-authority-count">
            {summary.observationOnlyCount} observation-only
          </span>
          <span className="rounded border border-rose-300/20 px-2 py-1 font-mono text-[10px] text-rose-100" data-testid="live-answer-terminal-authority-count">
            {summary.terminalAuthorityRequiredCount} terminal authority
          </span>
        </div>
      </div>
      <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
        <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
          {rows.length > 0 ? rows.map((row: LiveAnswerReasoningCircuitRow) => {
            const color = packetTrailColor(row.packetColorKey);
            const feedPolicyRefs = contextFeedPolicyRefs(row.policyRefs);
            const outputPolicyRefs = actuatorPolicyRefs(row.policyRefs);
            const requestedFreshnessRefs = freshnessFilterRefs(row.evidenceRefs);
            const requestedSessionRefs = sessionFilterRefs(row.evidenceRefs);
            const rowMicroDeckLifecycleRefs = microDeckLifecycleRefsForRow(row);
            const circuitHops = liveAnswerCircuitHops(row);
            return (
              <div
                key={row.id}
                className="min-w-0 rounded border bg-black/25 px-2 py-1.5"
                data-testid="live-answer-goal-context-row"
                style={{ borderColor: color.border, boxShadow: color.glow }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-semibold text-violet-50">{row.title}</span>
                  <span className="shrink-0 font-mono text-[10px] text-violet-200/70">{row.status}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-slate-500" data-testid="live-answer-packet-color-key">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border"
                    aria-hidden="true"
                    style={{ backgroundColor: color.hsl, borderColor: color.border }}
                  />
                  <span className="truncate">packet-color={row.packetColorKey}</span>
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{row.producer} / {row.contentRef}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-300">{row.preview}</p>
                <div className="mt-1.5 grid gap-1 font-mono text-[10px] text-slate-400" data-testid="live-answer-goal-context-refs">
                  <span className="truncate">sources={row.sourceRefs.length ? row.sourceRefs.join(", ") : "none"}</span>
                  <span className="truncate">loops={row.loopRefs.length ? row.loopRefs.join(", ") : "none"}</span>
                  <span className="truncate">evidence={row.evidenceRefs.length ? row.evidenceRefs.join(", ") : "none"}</span>
                  <span className="truncate" data-testid="live-answer-goal-context-policy-refs">policy={row.policyRefs.length ? row.policyRefs.join(", ") : "none"}</span>
                  <span className="truncate" data-testid="live-answer-goal-context-policy-split">
                    feeds={feedPolicyRefs.length ? feedPolicyRefs.join(", ") : "none"}; actuators={outputPolicyRefs.length ? outputPolicyRefs.join(", ") : "none"}
                  </span>
                  <span className="truncate" data-testid="live-answer-goal-context-freshness-filter">
                    requestedFreshness={requestedFreshnessRefs.length ? requestedFreshnessRefs.join(", ") : "none"}
                  </span>
                  <span className="truncate" data-testid="live-answer-goal-context-session-filter">
                    requestedSession={requestedSessionRefs.length ? requestedSessionRefs.join(", ") : "none"}
                  </span>
                  <span className="truncate" data-testid="live-answer-goal-context-tool-identity">
                    {toolIdentityLabel(row)}; {matchedActuatorLabel(row)}; {matchedActuatorRefLabel(row)}
                  </span>
                  <span className="truncate" data-testid="live-answer-goal-context-microdeck-lifecycle">
                    microdeckLifecycle={rowMicroDeckLifecycleRefs.length ? rowMicroDeckLifecycleRefs.join(", ") : "none"}
                  </span>
                  <span className="truncate">receipts={row.receiptRefs.length ? row.receiptRefs.join(", ") : "none"}</span>
                  <span className="truncate" data-testid="live-answer-goal-context-freshness">freshness={freshnessLabel(row.freshness)}</span>
                </div>
                <div className="mt-1.5 grid gap-1 rounded border border-sky-300/15 bg-sky-950/10 p-1 font-mono text-[10px] text-slate-400" data-testid="live-answer-packet-circuit-refs">
                  {row.packetCircuitRefs.length > 0 ? row.packetCircuitRefs.slice(0, 3).map((ref: LiveAnswerPacketCircuitRef) => (
                    <div key={`${row.id}:${ref.updateId}`} className="min-w-0">
                      <div className="truncate text-sky-100">update={ref.updateId}</div>
                      <div className="truncate">content={ref.contentRef}</div>
                      <div className="truncate">packets={ref.packetRefs.length ? ref.packetRefs.join(", ") : "none"}</div>
                      <div className="truncate">microDecks={ref.microDeckRefs.length ? ref.microDeckRefs.join(", ") : "none"}</div>
                      <div className="truncate" data-testid="live-answer-packet-microdeck-lifecycle-refs">
                        microdeckLifecycle={microDeckLifecycleRefs(ref.microDeckRefs).length ? microDeckLifecycleRefs(ref.microDeckRefs).join(", ") : "none"}
                      </div>
                      <div className="truncate" data-testid="live-answer-packet-transcript-refs">
                        transcripts={(ref.transcriptRefs ?? []).length ? (ref.transcriptRefs ?? []).join(", ") : "none"}
                      </div>
                      <div className="truncate" data-testid="live-answer-packet-projection-refs">
                        projections={(ref.projectionRefs ?? []).length ? (ref.projectionRefs ?? []).join(", ") : "none"}
                      </div>
                      <div className="truncate" data-testid="live-answer-packet-source-health-refs">
                        sourceHealth={(ref.sourceHealthRefs ?? []).length ? (ref.sourceHealthRefs ?? []).join(", ") : "none"}
                      </div>
                      <div className="truncate" data-testid="live-answer-packet-actuator-refs">
                        actuators={(ref.actuatorRefs ?? []).length ? (ref.actuatorRefs ?? []).join(", ") : "none"}
                      </div>
                      <div className="truncate" data-testid="live-answer-packet-trace-memory-refs">
                        traceMemory={(ref.traceMemoryRefs ?? []).length ? (ref.traceMemoryRefs ?? []).join(", ") : "none"}
                      </div>
                      <div className="truncate" data-testid="live-answer-packet-narrator-refs">
                        narrator={(ref.narratorRefs ?? []).length ? (ref.narratorRefs ?? []).join(", ") : "none"}
                      </div>
                      <div className="truncate" data-testid="live-answer-packet-route-watch-refs">
                        routeWatch={(ref.routeWatchRefs ?? []).length ? (ref.routeWatchRefs ?? []).join(", ") : "none"}
                      </div>
                      <div className="truncate" data-testid="live-answer-packet-automation-refs">
                        automation={(ref.automationRefs ?? []).length ? (ref.automationRefs ?? []).join(", ") : "none"}
                      </div>
                      {ref.microDeckRefs.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {ref.microDeckRefs.slice(0, 4).map((microDeckRef: string) => (
                            <span
                              key={`${row.id}:${ref.updateId}:microdeck-color:${microDeckRef}`}
                              className="inline-flex min-w-0 items-center gap-1 rounded border px-1 py-0.5 text-[10px] text-sky-100"
                              data-microdeck-ref={microDeckRef}
                              data-packet-color-hsl={color.hsl}
                              data-packet-color-key={row.packetColorKey}
                              data-testid="live-answer-packet-microdeck-color-link"
                              style={{ borderColor: color.border, backgroundColor: color.background }}
                              title={`packet=${row.packetColorKey} microdeck=${microDeckRef}`}
                            >
                              <span
                                className="h-2 w-2 shrink-0 rounded-full border"
                                aria-hidden="true"
                                style={{ backgroundColor: color.hsl, borderColor: color.border }}
                              />
                              <span className="truncate">packet={row.packetColorKey} -&gt; microdeck={microDeckRef}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="truncate">
                        terminal={String(ref.terminalEligible)} assistant={String(ref.assistantAnswer)} raw={String(ref.rawContentIncluded)} freshness={ref.freshnessStatus}
                      </div>
                    </div>
                  )) : (
                    <span className="truncate text-slate-500">packet circuit refs unavailable</span>
                  )}
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1 rounded border border-white/10 bg-black/20 p-1 font-mono text-[10px] text-slate-400" data-testid="live-answer-goal-context-circuit-route">
                  {circuitHops.map((hop: LiveAnswerCircuitHop) => (
                    <span key={`${row.id}:${hop.key}`} className="min-w-0 truncate">
                      <span className="text-slate-500">{hop.label}</span> {hop.value}
                    </span>
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1" data-testid="live-answer-goal-context-authority-chips">
                  <span className={authorityChipClass(row.authority.assistantAnswer)}>assistant={String(row.authority.assistantAnswer)}</span>
                  <span className={authorityChipClass(row.authority.terminalEligible)}>terminal={String(row.authority.terminalEligible)}</span>
                  <span className={authorityChipClass(row.authority.rawContentIncluded)}>raw={String(row.authority.rawContentIncluded)}</span>
                  <span className={postToolChipClass(row.authority.postToolModelStepRequired)}>postToolStep={String(row.authority.postToolModelStepRequired)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {row.dispatch.length > 0 ? row.dispatch.map((dispatch: string) => (
                    <span key={`${row.id}:${dispatch}`} className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-300" data-testid="live-answer-goal-context-dispatch">
                      {displayDispatchLabel(dispatch)}
                    </span>
                  )) : (
                    <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                      no dispatch
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-[10px] text-slate-500" data-testid="live-answer-goal-context-dispatch-custody">
                  {dispatchCustodyLabel(row.dispatch)}
                </div>
              </div>
            );
          }) : (
            <p className="rounded border border-white/10 bg-black/20 px-2 py-2 text-[11px] text-slate-500">
              No goal-context updates have been mirrored yet.
            </p>
          )}
        </div>
        <div className="rounded border border-white/10 bg-black/20 p-2">
          <p className="text-[10px] font-semibold uppercase text-slate-300">Authority posture</p>
          <p className="mt-1 text-xs text-violet-100" data-testid="live-answer-terminal-authority-posture">{summary.terminalPosture}</p>
          <p className="mt-1 font-mono text-[10px] text-slate-400">
            observation_only={summary.observationOnlyCount} interrupt_dispatches={summary.wakeCount} microdeck_outputs={summary.microdeckOutputCount} microdeck_lifecycle={summary.microdeckLifecycleCount} microdeck_create={summary.microdeckPresetCreateCount} microdeck_state={summary.microdeckPresetStateCount} microdeck_query={summary.microdeckPresetQueryCount} microdeck_draft={summary.microdeckPresetDraftCount} microdeck_route={summary.microdeckPromptRouteCount} microdeck_update={summary.microdeckPromptUpdateCount} microdeck_test={summary.microdeckPromptTestCount} visual_summaries={summary.visualSummaryCount} narrator_bindings={summary.narratorBindingCount} audio_transcripts={summary.audioTranscriptCount} translations={summary.translatedTranscriptCount} packet_traces={summary.packetTraceCount} source_health={summary.sourceHealthCount} feed_queries={summary.feedQueryCount} feed_policy_refs={summary.feedPolicyRefCount} actuator_policy_refs={summary.actuatorPolicyRefCount} freshness_filters={summary.freshnessFilterRefCount} session_filters={summary.sessionFilterRefCount} tool_attributed_updates={summary.toolAttributedUpdateCount} matched_tool_actuator_updates={summary.matchedToolActuatorUpdateCount} route_watch={summary.routeWatchCount} route_evidence={summary.routeEvidenceCount} automations={summary.automationCount} automation_policies={summary.automationPolicyCount} actuator_policies={summary.actuatorPolicyCount} narrator_output_policies={summary.narratorActuatorPolicyCount} narrator_event_feeds={summary.narratorEventFeedCount} trace_memory={summary.traceMemoryCount} terminal_authority_sessions={summary.terminalAuthorityRequiredCount}
          </p>
          <p className="mt-1 font-mono text-[10px] text-slate-400" data-testid="live-answer-control-dispatch-breakdown">
            control_dispatches={summary.workstationControlDispatchCount} preset={summary.presetDispatchCount} source_binding={summary.sourceBindingDispatchCount} source_repair={summary.sourceRepairDispatchCount} loop={summary.loopDispatchCount} live_answer={summary.liveAnswerDispatchCount} graph={summary.processGraphDispatchCount} narrator_speech={summary.narratorSpeechCount} narrator_binding={summary.narratorBindingCount} interrupt_dispatches={summary.wakeCount}
          </p>
          <p className="mt-1 font-mono text-[10px] text-slate-400" data-testid="live-answer-wake-interrupt-scope">
            interrupt_scope urgent={summary.wakeUrgentCount} blocked={summary.wakeBlockedCount} policy_triggered={summary.wakePolicyTriggeredCount}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            Wake-agent appears only as classified interrupt dispatch. Receipts, MicroDeck outputs, narrator bindings, and panel projections stay evidence until the completed solver path selects a terminal answer.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {sessions.slice(0, 3).map((session: AgentGoalSessionV1) => (
              <span key={session.goalId} className="rounded border border-violet-300/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-100" data-testid="live-answer-agent-goal-session">
                {compactLabel(session.status)} / {session.contextFeeds.length} feeds
              </span>
            ))}
            {sessions.length === 0 ? (
              <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                no active session
              </span>
            ) : null}
          </div>
          <div className="mt-2 grid gap-2">
            <div className="rounded border border-indigo-300/15 bg-indigo-950/10 p-2" data-testid="live-answer-context-feed-index">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase text-indigo-100">Context feed index</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Session feed lanes map to query tools as non-terminal evidence inputs.
                  </p>
                </div>
                <span className="shrink-0 rounded border border-indigo-300/20 px-1.5 py-0.5 font-mono text-[10px] text-indigo-100" data-testid="live-answer-context-feed-index-count">
                  {contextFeedLanes.length} lanes
                </span>
              </div>
              <div className="mt-1.5 grid gap-1">
                {contextFeedLanes.slice(0, 8).map((lane: LiveAnswerContextFeedLane) => (
                  <div
                    key={lane.key}
                    className="rounded border border-white/10 bg-black/20 px-1.5 py-1 font-mono text-[10px] text-slate-400"
                    data-testid="live-answer-context-feed-lane"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-indigo-100">{compactLabel(lane.sourceKind)}</span>
                      <span>feed={lane.feedId}</span>
                      <span>queryTool={lane.queryActuator ?? "none"}</span>
                      <span className={lane.actuatorAllowed ? "text-emerald-100" : "text-amber-100"}>
                        policy={lane.actuatorAllowed ? "allowed" : "not allowed"}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-slate-500">
                      <span>goal={lane.goalId}</span>
                      <span>feedRef={lane.contextFeedRef}</span>
                      <span>actuatorRef={lane.allowedActuatorRef ?? "none"}</span>
                      <span>freshness={lane.freshnessMs === undefined ? "unbounded" : `${lane.freshnessMs}ms`}</span>
                      <span>relevance={lane.relevancePolicy ?? "unspecified"}</span>
                      <span>query={lane.query ?? "default"}</span>
                    </div>
                  </div>
                ))}
                {contextFeedLanes.length === 0 ? (
                  <span className="rounded border border-white/10 bg-black/20 px-1.5 py-1 font-mono text-[10px] text-slate-500">
                    no context feed lanes
                  </span>
                ) : null}
              </div>
            </div>
            {sessions.slice(0, 2).map((session: AgentGoalSessionV1) => {
              const latestCheckpoint = session.checkpoints.at(-1);
              const finalReportRequirementCount = session.authority.finalReportRequirements?.requiredEvidenceKinds?.length ?? 0;
              const narratorControls = narratorControlActuators(session.allowedActuators);
              return (
                <div key={`${session.goalId}:policy`} className="rounded border border-violet-300/15 bg-violet-950/10 p-2" data-testid="live-answer-agent-goal-policy">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-violet-50">{session.userVisibleSummary}</p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{session.goalId}</p>
                    </div>
                    <span className="shrink-0 rounded border border-rose-300/20 px-1.5 py-0.5 font-mono text-[10px] text-rose-100" data-testid="live-answer-agent-goal-final-authority">
                      finalAuthority={String(session.authority.finalReportsRequireTerminalAuthority)} / requirements={finalReportRequirementCount}
                    </span>
                  </div>
                  <div className="mt-1 grid gap-1 font-mono text-[10px] text-slate-400">
                    <span data-testid="live-answer-agent-goal-cadence">cadence={cadenceLabel(session.cadence)}</span>
                    <span className="truncate" data-testid="live-answer-agent-goal-feeds">
                      feeds={session.contextFeeds.map((feed) => compactLabel(feed.sourceKind)).join(", ") || "none"}
                    </span>
                    <span className="truncate" data-testid="live-answer-agent-goal-actuators">
                      actuators={session.allowedActuators.slice(0, 6).map(compactLabel).join(", ") || "none"}
                    </span>
                    <span className="truncate" data-testid="live-answer-agent-goal-narrator-controls">
                      narratorControls={narratorControls.map(compactLabel).join(", ") || "none"}
                    </span>
                    <span className="truncate" data-testid="live-answer-agent-goal-final-report-contract">
                      finalReportContract={finalReportContractLabel(session)}
                    </span>
                    <span className="truncate" data-testid="live-answer-agent-goal-stop">
                      stop={session.stopConditions[0] ?? "none"}
                    </span>
                    <span className="truncate" data-testid="live-answer-agent-goal-checkpoint">
                      checkpoint={latestCheckpoint?.summary ?? "none"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
