export type MoralGraphCurrentAnswerTraceStep = {
  step: string;
  nodeIds: string[];
  badgeIds: string[];
  reason: string;
};

export type MoralGraphCurrentAnswerBlock = {
  schema: "moral_graph_current_answer_block/v1";
  blockId: string;
  turnId: string;
  prompt: string;
  finalAnswer: string;
  finalAnswerSource: string;
  terminalArtifactKind: string;
  route: string;
  toolReceiptRef: string | null;
  finalAnswerDraftRef: string | null;
  activatedNodeIds: string[];
  activatedLabels: string[];
  pathToRoot: string[];
  trace: MoralGraphCurrentAnswerTraceStep[];
  evidenceOnly: boolean;
  agentExecutable: boolean;
  updatedAtMs: number;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const uniqueStrings = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? uniqueStrings(value.map((entry) => readString(entry))) : [];

const parseDebugExport = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return asRecord(value);
};

const ledgerFromDebugExport = (debugExport: Record<string, unknown>): Record<string, unknown>[] =>
  (Array.isArray(debugExport.current_turn_artifact_ledger) ? debugExport.current_turn_artifact_ledger : [])
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

const payloadForKind = (ledger: Record<string, unknown>[], kind: string): Record<string, unknown> | null => {
  const artifact = ledger.find((entry) => readString(entry.kind) === kind);
  return asRecord(artifact?.payload) ?? artifact ?? null;
};

const artifactRefForKind = (ledger: Record<string, unknown>[], kind: string): string | null => {
  const artifact = ledger.find((entry) => readString(entry.kind) === kind);
  return readString(artifact?.artifact_id) ?? readString(artifact?.id) ?? null;
};

const collectMatchNodeIds = (matches: unknown): string[] => {
  const record = asRecord(matches);
  if (!record) return [];
  const groups = [record.exact, record.likely, record.inferred_lenses];
  return uniqueStrings(
    groups.flatMap((group) =>
      Array.isArray(group)
        ? group.flatMap((entry) => {
            const match = asRecord(entry);
            return [readString(match?.nodeId), ...readStringArray(match?.pathToRoot)];
          })
        : [],
    ),
  );
};

const collectMatchLabels = (matches: unknown): string[] => {
  const record = asRecord(matches);
  if (!record) return [];
  const groups = [record.exact, record.likely, record.inferred_lenses];
  return uniqueStrings(
    groups.flatMap((group) =>
      Array.isArray(group)
        ? group.map((entry) => readString(asRecord(entry)?.label))
        : [],
    ),
  );
};

const collectObjectiveBindingNodeIds = (binding: Record<string, unknown> | null): string[] => {
  const bindings = Array.isArray(binding?.bindings) ? binding?.bindings : [];
  const trace = Array.isArray(binding?.trace) ? binding?.trace : [];
  return uniqueStrings([
    ...bindings.flatMap((entry) => {
      const record = asRecord(entry);
      return [readString(record?.badgeId), readString(record?.principleId), ...readStringArray(record?.pathToRoot)];
    }),
    ...trace.flatMap((entry) => {
      const record = asRecord(entry);
      return [...readStringArray(record?.nodeIds), ...readStringArray(record?.badgeIds)];
    }),
  ]);
};

const collectTrace = (binding: Record<string, unknown> | null, reflection: Record<string, unknown> | null): MoralGraphCurrentAnswerTraceStep[] => {
  const bindingTrace = Array.isArray(binding?.trace) ? binding?.trace : [];
  const trace = bindingTrace
    .map((entry): MoralGraphCurrentAnswerTraceStep | null => {
      const record = asRecord(entry);
      const step = readString(record?.step);
      if (!record || !step) return null;
      return {
        step,
        nodeIds: readStringArray(record.nodeIds),
        badgeIds: readStringArray(record.badgeIds),
        reason: readString(record.reason) ?? "Objective binding trace step.",
      };
    })
    .filter((entry): entry is MoralGraphCurrentAnswerTraceStep => Boolean(entry));
  if (trace.length > 0) return trace;

  const matches = asRecord(reflection?.matches);
  const exact = Array.isArray(matches?.exact) ? matches.exact : [];
  return exact
    .slice(0, 4)
    .map((entry): MoralGraphCurrentAnswerTraceStep | null => {
      const match = asRecord(entry);
      const nodeId = readString(match?.nodeId);
      if (!nodeId) return null;
      return {
        step: "activated_lens",
        nodeIds: uniqueStrings([nodeId, ...readStringArray(match?.pathToRoot)]),
        badgeIds: [],
        reason: readString(match?.reason) ?? readString(match?.label) ?? "MoralGraph activated this lens from the prompt.",
      };
    })
    .filter((entry): entry is MoralGraphCurrentAnswerTraceStep => Boolean(entry));
};

export function buildMoralGraphCurrentAnswerBlockFromDebugExport(
  value: unknown,
  options: { nowMs?: number } = {},
): MoralGraphCurrentAnswerBlock | null {
  const debugExport = parseDebugExport(value);
  if (!debugExport) return null;
  const ledger = ledgerFromDebugExport(debugExport);
  const toolPayload =
    payloadForKind(ledger, "helix_moral_graph_reflection_tool_result") ??
    asRecord(debugExport.moral_graph_reflection_tool_result) ??
    null;
  const hasMoralGraphTool = Boolean(toolPayload);
  const terminalAuthority = asRecord(debugExport.terminal_answer_authority);
  const route =
    readString(terminalAuthority?.route) ??
    readString(asRecord(debugExport.solver_controller_summary)?.final_route) ??
    readString(debugExport.route) ??
    "unknown";
  if (!hasMoralGraphTool && route !== "moral_graph_reflection") return null;

  const reflection =
    asRecord(toolPayload?.reflection) ??
    asRecord(debugExport.ideology_context_reflection) ??
    null;
  const objectiveBinding = asRecord(toolPayload?.objectiveBinding) ?? null;
  const authorityBoundary = asRecord(objectiveBinding?.authorityBoundary);
  const finalDraft = payloadForKind(ledger, "final_answer_draft") ?? asRecord(debugExport.final_answer_draft);
  const finalAnswer = readString(debugExport.selected_final_answer) ?? readString(finalDraft?.text) ?? readString(finalDraft?.content) ?? "";
  const matches = asRecord(reflection?.matches);
  const activatedTraits = Array.isArray(reflection?.activated_traits) ? reflection?.activated_traits : [];
  const actionGateWarnings = Array.isArray(reflection?.action_gate_warnings) ? reflection?.action_gate_warnings : [];
  const trace = collectTrace(objectiveBinding, reflection);
  const activatedNodeIds = uniqueStrings([
    readString(asRecord(reflection?.graph)?.rootId),
    ...collectMatchNodeIds(matches),
    ...collectObjectiveBindingNodeIds(objectiveBinding),
    ...activatedTraits.flatMap((entry) => {
      const record = asRecord(entry);
      return [readString(record?.nodeId), ...readStringArray(record?.pathToRoot)];
    }),
    ...actionGateWarnings.map((entry) => readString(asRecord(entry)?.gateId)),
    ...trace.flatMap((entry) => [...entry.nodeIds, ...entry.badgeIds]),
  ]);
  const pathToRoot = uniqueStrings(
    [
      ...(Array.isArray(matches?.exact) ? matches.exact : []),
      ...(Array.isArray(matches?.likely) ? matches.likely : []),
      ...(Array.isArray(matches?.inferred_lenses) ? matches.inferred_lenses : []),
      ...activatedTraits,
    ].flatMap((entry) => readStringArray(asRecord(entry)?.pathToRoot)),
  );

  return {
    schema: "moral_graph_current_answer_block/v1",
    blockId: `moral-current-answer:${readString(debugExport.active_turn_id) ?? "unknown-turn"}`,
    turnId: readString(debugExport.active_turn_id) ?? "unknown-turn",
    prompt: readString(debugExport.active_prompt) ?? "",
    finalAnswer,
    finalAnswerSource: readString(debugExport.final_answer_source) ?? "unknown",
    terminalArtifactKind:
      readString(asRecord(debugExport.resolved_turn_summary)?.terminal_artifact_kind) ??
      readString(debugExport.terminal_artifact_kind) ??
      "unknown",
    route,
    toolReceiptRef: artifactRefForKind(ledger, "helix_moral_graph_reflection_tool_result"),
    finalAnswerDraftRef: artifactRefForKind(ledger, "final_answer_draft"),
    activatedNodeIds,
    activatedLabels: uniqueStrings([
      ...collectMatchLabels(matches),
      ...activatedTraits.map((entry) => readString(asRecord(entry)?.label)),
    ]),
    pathToRoot,
    trace,
    evidenceOnly:
      readBoolean(authorityBoundary?.assistant_answer) === false &&
      readBoolean(authorityBoundary?.raw_content_included) === false,
    agentExecutable: readBoolean(authorityBoundary?.agent_executable) ?? false,
    updatedAtMs: options.nowMs ?? Date.now(),
  };
}
