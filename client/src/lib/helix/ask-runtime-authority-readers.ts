import type { TheoryContextReflectionV1 } from "@shared/contracts/theory-context-reflection.v1";
import {
  buildTheoryContextReflectionV1,
  isTheoryContextReflectionV1,
} from "@shared/contracts/theory-context-reflection.v1";

import type { HelixWorkstationAction } from "@/lib/workstation/workstationActionContract";
import { coerceText } from "@/lib/helix/ask-value-normalization";

export function readAgentLoopAuditRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function readAgentLoopAuditArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function hasHelixAskBackendEntrypointTurnId(turnId: string | null | undefined): boolean {
  const normalized = coerceText(turnId).trim();
  if (!normalized) return false;
  return /^ask[:/]/i.test(normalized) || /(?:^|:)ask:[0-9a-z-]+(?:$|:)/i.test(normalized);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => coerceText(entry).trim()).filter(Boolean)
    : [];
}

function readFiniteNumber(value: unknown, fallback = 0.5): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function extractTheoryReflectionFromGatewayObservation(value: unknown): TheoryContextReflectionV1 | null {
  const observation = readAgentLoopAuditRecord(value);
  if (!observation) return null;
  const capability = coerceText(observation.capability_key ?? observation.capability ?? observation.capability_id).trim();
  if (capability !== "theory-badge-graph.reflect_discussion_context") return null;
  const calculatorPayloads = readAgentLoopAuditArray(observation.calculator_payloads)
    .map(readAgentLoopAuditRecord)
    .filter((payload): payload is Record<string, unknown> => Boolean(payload))
    .map((payload) => ({
      badgeId: coerceText(payload.badge_id ?? payload.badgeId).trim(),
      badgeTitle: coerceText(payload.badge_title ?? payload.badgeTitle).trim(),
      payloadId: coerceText(payload.payload_id ?? payload.payloadId).trim(),
      expression: coerceText(payload.expression).trim(),
      displayLatex: coerceText(payload.display_latex ?? payload.displayLatex).trim(),
      targetVariable: coerceText(payload.target_variable ?? payload.targetVariable).trim() || null,
      claimBoundaryNotes: readStringArray(payload.claim_boundary_notes ?? payload.claimBoundaryNotes),
    }))
    .filter((payload) => payload.badgeId && payload.payloadId && payload.expression);
  const payloadByBadgeId = new Map(calculatorPayloads.map((payload) => [payload.badgeId, payload]));
  const exactBadgeIds = readStringArray(observation.exact_badge_ids ?? observation.exactBadgeIds).slice(0, 12);
  const likelyBadgeIds = readStringArray(observation.likely_badge_ids ?? observation.likelyBadgeIds).slice(0, 12);
  if (calculatorPayloads.length === 0 && exactBadgeIds.length === 0 && likelyBadgeIds.length === 0) return null;
  const scientificBranchGate = readAgentLoopAuditRecord(observation.scientific_branch_gate ?? observation.scientificBranchGate);
  const scientificEvidencePacket = readAgentLoopAuditRecord(observation.scientific_evidence_packet ?? observation.scientificEvidencePacket);
  const scientificRunTrace = readAgentLoopAuditRecord(observation.scientific_run_trace ?? observation.scientificRunTrace);
  const rejectedCalculatorPayloadIds = readStringArray(
    observation.rejected_calculator_payload_ids ??
    observation.rejectedCalculatorPayloadIds ??
    scientificBranchGate?.rejected_calculator_payload_ids,
  );
  const scientificClaimBoundaries = [
    coerceText(scientificBranchGate?.status).trim()
      ? `scientific_branch_gate=${coerceText(scientificBranchGate?.status).trim()}; domain=${coerceText(scientificBranchGate?.primary_domain).trim()}`
      : "",
    rejectedCalculatorPayloadIds.length
      ? `rejected_calculator_payloads=${rejectedCalculatorPayloadIds.join(",")}`
      : "",
    coerceText(scientificRunTrace?.trace_id).trim()
      ? `scientific_run_trace=${coerceText(scientificRunTrace?.trace_id).trim()}`
      : "",
  ].filter(Boolean);
  const inferredDomains = [
    coerceText(scientificEvidencePacket?.primary_domain).trim(),
    coerceText(scientificBranchGate?.primary_domain).trim(),
  ].filter(Boolean);
  const inferredDomainRecords = Array.from(new Set(inferredDomains)).map((domain) => ({
    atlasBlockId: domain,
    title: domain.replace(/_/g, " "),
    score: 0.75,
    reasons: ["Scientific evidence branch gate"],
  }));
  const allBadgeIds = Array.from(new Set([...exactBadgeIds, ...likelyBadgeIds, ...calculatorPayloads.map((payload) => payload.badgeId)]));
  const observationClaimBoundaries = [
    ...scientificClaimBoundaries,
    ...readStringArray(observation.claim_boundary_notes ?? observation.claimBoundaryNotes),
  ];
  const matchForBadge = (badgeId: string, index: number) => {
    const payload = payloadByBadgeId.get(badgeId);
    return {
      badgeId,
      title: payload?.badgeTitle || badgeId,
      score: readFiniteNumber(undefined, Math.max(0.35, 0.9 - index * 0.04)),
      reasons: ["Ask gateway theory reflection observation"],
      matchedSymbols: payload?.targetVariable ? [payload.targetVariable] : [],
      matchedEquationFamilies: payload?.expression ? [payload.expression] : [],
      matchedRepoPaths: [],
      claimBoundaryNotes: payload?.claimBoundaryNotes?.length ? payload.claimBoundaryNotes : observationClaimBoundaries,
    };
  };
  const exactMatches = (exactBadgeIds.length ? exactBadgeIds : calculatorPayloads.map((payload) => payload.badgeId))
    .slice(0, 8)
    .map(matchForBadge);
  const likelyMatches = likelyBadgeIds
    .filter((badgeId) => !exactMatches.some((match) => match.badgeId === badgeId))
    .slice(0, 8)
    .map(matchForBadge);
  const highlightedBadgeIds = readStringArray(observation.highlighted_badge_ids ?? observation.highlightedBadgeIds);
  const heatByBadgeId = Object.fromEntries(
    allBadgeIds.map((badgeId, index) => [badgeId, Math.max(0.25, 0.9 - index * 0.05)]),
  );
  return buildTheoryContextReflectionV1({
    reflectionId: coerceText(observation.reflection_id ?? observation.reflectionId).trim() || undefined,
    graphId: "nhm2-theory-badge-graph",
    input: {
      prompt: coerceText(observation.prompt).trim() || "Ask gateway theory reflection",
      conversationContext: null,
      mentionedEquations: calculatorPayloads.map((payload) => payload.expression),
      mentionedSymbols: calculatorPayloads.map((payload) => payload.targetVariable).filter((value): value is string => Boolean(value)),
      mentionedDomains: Array.from(new Set(inferredDomains)),
      source: "helix_ask",
      confidenceMode: "strict_badge_match",
    },
    exactMatches,
    likelyMatches,
    inferredDomains: inferredDomainRecords,
    overlay: {
      centerBadgeIds: allBadgeIds.slice(0, 3),
      highlightedBadgeIds: highlightedBadgeIds.length ? highlightedBadgeIds : allBadgeIds.slice(0, 8),
      highlightedEdgeIds: [],
      heatByBadgeId,
      exactBadgeIds,
      likelyBadgeIds,
      softRegion: allBadgeIds.length
        ? {
            id: "ask-gateway-theory-reflection",
            label: "Ask gateway theory reflection",
            badgeIds: allBadgeIds.slice(0, 8),
            confidence: 0.7,
            tone: "green",
            meaning: "discussion_context_not_proof",
          }
        : null,
    },
    evidenceForAsk: {
      summary: coerceText(observation.summary).trim() || "Theory Badge Graph reflection produced formula context.",
      claimBoundaries: observationClaimBoundaries,
      calculatorPayloads,
      recommendedNextActions: [],
    },
  });
}

export function extractAskLevelTheoryReflection(value: unknown): TheoryContextReflectionV1 | null {
  const record = readAgentLoopAuditRecord(value);
  if (!record) return null;
  const directReceipt = readAgentLoopAuditRecord(record.theory_context_reflection_tool_receipt);
  if (isTheoryContextReflectionV1(directReceipt?.reflectionV1)) return directReceipt.reflectionV1;
  const directArtifact = readAgentLoopAuditRecord(record.artifact_v1);
  if (isTheoryContextReflectionV1(directArtifact?.reflectionV1)) return directArtifact.reflectionV1;
  const ledger = Array.isArray(record.current_turn_artifact_ledger) ? record.current_turn_artifact_ledger : [];
  for (const item of ledger) {
    const artifact = readAgentLoopAuditRecord(item);
    if (!artifact || artifact.kind !== "helix_theory_context_reflection_tool_receipt") continue;
    const payload = readAgentLoopAuditRecord(artifact.payload);
    const artifactV1 = readAgentLoopAuditRecord(payload?.artifact_v1);
    if (isTheoryContextReflectionV1(artifactV1?.reflectionV1)) return artifactV1.reflectionV1;
    if (isTheoryContextReflectionV1(payload?.reflectionV1)) return payload.reflectionV1;
  }
  const debug = readAgentLoopAuditRecord(record.debug);
  const gatewayResultSources = [
    record.workstation_gateway_call_results,
    record.workstation_gateway_results,
    debug?.workstation_gateway_call_results,
    debug?.workstation_gateway_results,
  ];
  for (const source of gatewayResultSources) {
    if (!Array.isArray(source)) continue;
    for (const entry of source) {
      const result = readAgentLoopAuditRecord(entry);
      const observation = readAgentLoopAuditRecord(result?.observation);
      const reflection = extractTheoryReflectionFromGatewayObservation(observation);
      if (reflection) return reflection;
    }
  }
  return null;
}

export function normalizeHelixRuntimeActionKey(value: unknown): string {
  return coerceText(value).trim().toLowerCase().replace(/[/:]+/g, ".").replace(/[-\s]+/g, "_");
}

export function readHelixDecisionCapabilityKeys(value: unknown): string[] {
  const record = readAgentLoopAuditRecord(value);
  if (!record) return [];
  const directKeys = [
    record.chosen_capability,
    record.selected_capability,
    record.capability_key,
    record.executed_action_key,
    record.action_key,
    record.tool_key,
    record.tool_name,
  ]
    .map(normalizeHelixRuntimeActionKey)
    .filter(Boolean);
  const nestedKeys = [
    record.agent_step_decision,
    record.initial_agent_step_decision,
    record.tool_call,
    record.next_action,
    record.selected_action,
    record.action,
  ].flatMap(readHelixDecisionCapabilityKeys);
  return [...directKeys, ...nestedKeys];
}

export function readHelixGatewayCapabilityKeys(value: unknown): string[] {
  const record = readAgentLoopAuditRecord(value);
  if (!record) return [];
  const debug = readAgentLoopAuditRecord(record.debug);
  const gatewayResultSources = [
    record.workstation_gateway_call_results,
    record.workstation_gateway_results,
    debug?.workstation_gateway_call_results,
    debug?.workstation_gateway_results,
  ];
  return gatewayResultSources
    .flatMap((source) => (Array.isArray(source) ? source : []))
    .flatMap((entry) => {
      const result = readAgentLoopAuditRecord(entry);
      if (result?.ok !== true) return [];
      return [
        result?.capability_id,
        result?.capabilityId,
        result?.gateway_admission && readAgentLoopAuditRecord(result.gateway_admission)?.requested_capability,
      ];
    })
    .map(normalizeHelixRuntimeActionKey)
    .filter(Boolean);
}

export function collectHelixAgentSelectedCapabilities(...sources: unknown[]): string[] {
  const selected = new Set<string>();
  const add = (value: unknown): void => {
    readHelixDecisionCapabilityKeys(value).forEach((key) => selected.add(key));
  };
  sources.forEach((source) => {
    const record = readAgentLoopAuditRecord(source);
    if (!record) return;
    const debug = readAgentLoopAuditRecord(record.debug);
    [
      record.agent_step_decision,
      record.initial_agent_step_decision,
      record.observation_review,
      record.runtime_authority_audit,
      debug?.agent_step_decision,
      debug?.initial_agent_step_decision,
      debug?.observation_review,
      debug?.runtime_authority_audit,
    ].forEach(add);
    [record.agent_runtime_loop, debug?.agent_runtime_loop, record.agent_step_loop, debug?.agent_step_loop].forEach((loop) => {
      const loopRecord = readAgentLoopAuditRecord(loop);
      const iterations = Array.isArray(loopRecord?.iterations)
        ? loopRecord?.iterations
        : Array.isArray(loopRecord?.steps)
          ? loopRecord?.steps
          : [];
      iterations.forEach(add);
    });
    readHelixGatewayCapabilityKeys(record).forEach((key) => selected.add(key));
  });
  return [...selected].filter(Boolean);
}

export function readHelixWorkstationActionRuntimeKeys(action: HelixWorkstationAction | Record<string, unknown>): string[] {
  const record = readAgentLoopAuditRecord(action);
  if (!record) return [];
  const panelId = normalizeHelixRuntimeActionKey(record.panel_id);
  const actionId = normalizeHelixRuntimeActionKey(record.action_id);
  const actionName = normalizeHelixRuntimeActionKey(record.action);
  const keys = new Set<string>();
  if (panelId && actionId) {
    keys.add(`${panelId}.${actionId}`);
    keys.add(`${panelId}/${actionId}`);
  }
  if (panelId && actionName === "open_panel") {
    keys.add(`${panelId}.open`);
    keys.add(`${panelId}.open_panel`);
  }
  if (panelId && actionName === "focus_panel") {
    keys.add(`${panelId}.focus`);
    keys.add(`${panelId}.focus_panel`);
  }
  if (actionName === "restore_view_state") {
    keys.add("workstation.restore_view_state");
    keys.add("workstation/restore_view_state");
  }
  if (panelId && actionName) keys.add(`${panelId}.${actionName}`);
  if (actionId) keys.add(actionId);
  if (actionName) keys.add(actionName);
  return [...keys].map(normalizeHelixRuntimeActionKey).filter(Boolean);
}
