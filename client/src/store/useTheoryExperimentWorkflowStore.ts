import { create } from "zustand";

import {
  THEORY_EXPERIMENT_STAGE_IDS,
  THEORY_EXPERIMENT_PROCEDURE_HASH_DOMAIN,
  validateTheoryExperimentProcedureV1,
  type TheoryExperimentProcedureV1,
  type TheoryExperimentStageIdV1,
} from "@shared/contracts/theory-experiment-procedure.v1";
import {
  validateTheoryExperimentExecutionClosureIntegrityV1,
  type TheoryExperimentExecutionClosureAxisIdV1,
  type TheoryExperimentExecutionClosureAxisStatusV1,
  type TheoryExperimentExecutionClosureEvidenceObservationV1,
  type TheoryExperimentExecutionClosureV1,
} from "@shared/contracts/theory-experiment-execution-closure.v1";
import { computeCasimirSpecValueSha256V1 } from "@shared/contracts/casimir-spec-scientific-claim-ir.v1";

const THEORY_EXPERIMENT_OBSERVATION_SCHEMA =
  "casimir.theory_experiment_procedure.observation.v1" as const;
const THEORY_EXPERIMENT_OBSERVATION_KIND =
  "theory_experiment_procedure_observation" as const;
const THEORY_EXPERIMENT_CAPABILITY =
  "theory-experiment-procedure.prepare" as const;
const THEORY_EXPERIMENT_EXECUTION_CLOSURE_OBSERVATION_SCHEMA =
  "casimir.theory_experiment_execution_closure.observation.v1" as const;
const THEORY_EXPERIMENT_EXECUTION_CLOSURE_OBSERVATION_KIND =
  "theory_experiment_execution_closure" as const;
const THEORY_EXPERIMENT_EXECUTION_CLOSURE_CAPABILITY =
  "theory-experiment-procedure.evaluate_closure" as const;
const CURRENT_TURN_ARTIFACT_SCHEMA = "helix.current_turn_artifact.v1" as const;
const MAX_PROJECTION_CLOCK_SKEW_MS = 5 * 60 * 1000;

type TheoryExperimentProjectedStageStatus =
  | "awaiting_observation"
  | "ready"
  | "complete"
  | "blocked"
  | "not_applicable";

type TheoryExperimentProjectedClosureStageStatus =
  | "awaiting_observation"
  | TheoryExperimentExecutionClosureV1["stages"][number]["closureStatus"];

export type TheoryExperimentProjectedCandidate = {
  candidateId: string;
  role: TheoryExperimentExecutionClosureV1["candidates"][number]["role"];
  comparable: boolean;
  evidenceCoverageScore: number;
  rankingGroup: number | null;
  displayOrdinal: number;
  axes: Array<{
    axisId: TheoryExperimentExecutionClosureAxisIdV1;
    status: TheoryExperimentExecutionClosureAxisStatusV1;
    applicable: boolean;
  }>;
};

export type TheoryExperimentProjectedEvidenceObservation = Pick<
  TheoryExperimentExecutionClosureEvidenceObservationV1,
  "artifactRef" | "kind" | "status" | "scope" | "closureSatisfied"
>;

export type TheoryExperimentWorkflowSession = {
  schema: "helix.theory_experiment_workflow_projection.v1";
  procedureId: string;
  sourceSessionId: string;
  target: string;
  selectedBadgeIds: string[];
  lanyonRequested: boolean;
  startedAt: string;
  submittedTurnId: string | null;
  observedTurnId: string | null;
  procedureArtifactId: string | null;
  observationRef: string | null;
  procedureSha256: string | null;
  procedureGeneratedAt: string | null;
  stageStatus: Record<TheoryExperimentStageIdV1, TheoryExperimentProjectedStageStatus>;
  missingRequirementCodes: string[];
  closureObservedTurnId: string | null;
  closureArtifactId: string | null;
  closureObservationRef: string | null;
  closureId: string | null;
  closureSha256: string | null;
  closureGeneratedAt: string | null;
  closureStageStatus: Record<
    TheoryExperimentStageIdV1,
    TheoryExperimentProjectedClosureStageStatus
  >;
  rankingOutcome: TheoryExperimentExecutionClosureV1["ranking"]["outcome"] | null;
  orderedCandidateIds: string[];
  topCandidateIds: string[];
  candidates: TheoryExperimentProjectedCandidate[];
  synthesisReadinessStatus:
    | TheoryExperimentExecutionClosureV1["synthesisReadiness"]["status"]
    | null;
  claimCeiling:
    | TheoryExperimentExecutionClosureV1["synthesisReadiness"]["claimCeiling"]
    | null;
  modelSynthesisAllowed: boolean;
  synthesisReason: string | null;
  openRequirementCodes: string[];
  closureBlockerCodes: string[];
  evidenceObservations: TheoryExperimentProjectedEvidenceObservation[];
  terminalEligible: false;
  assistantAnswer: false;
  rawContentIncluded: false;
};

type StartTheoryExperimentWorkflowInput = {
  sourceSessionId: string;
  target: string;
  selectedBadgeIds: string[];
  lanyonRequested: boolean;
};

export type TheoryExperimentWorkflowState = {
  session: TheoryExperimentWorkflowSession | null;
  start: (input: StartTheoryExperimentWorkflowInput) => TheoryExperimentWorkflowSession;
  observePayload: (
    payload: unknown,
    sourceSessionId: string | null | undefined,
  ) => Promise<boolean>;
  reset: () => void;
};

const emptyStageStatus = (): Record<
  TheoryExperimentStageIdV1,
  TheoryExperimentProjectedStageStatus
> => Object.fromEntries(
  THEORY_EXPERIMENT_STAGE_IDS.map((stageId) => [stageId, "awaiting_observation"]),
) as Record<TheoryExperimentStageIdV1, TheoryExperimentProjectedStageStatus>;

const emptyClosureStageStatus = (): Record<
  TheoryExperimentStageIdV1,
  TheoryExperimentProjectedClosureStageStatus
> => Object.fromEntries(
  THEORY_EXPERIMENT_STAGE_IDS.map((stageId) => [stageId, "awaiting_observation"]),
) as Record<TheoryExperimentStageIdV1, TheoryExperimentProjectedClosureStageStatus>;

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(new Set(value.map(normalizeString).filter(Boolean))).slice(0, 32)
    : [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const readIsoTimestamp = (value: unknown): number | null => {
  const text = normalizeString(value);
  const timestamp = text ? Date.parse(text) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
};

const newProcedureId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `theory-experiment:${crypto.randomUUID()}`;
  }
  return `theory-experiment:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
};

type TypedObservationCandidate = {
  observation: Record<string, unknown>;
  artifact: Record<string, unknown>;
};

const findCurrentTurnObservations = (
  payload: unknown,
  observationSchema: string,
): TypedObservationCandidate[] => {
  const matches: TypedObservationCandidate[] = [];
  const seen = new WeakSet<object>();
  const visit = (
    value: unknown,
    depth: number,
    parent: Record<string, unknown> | null,
  ): void => {
    if (depth > 10 || value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.slice(0, 200).forEach((entry) => visit(entry, depth + 1, parent));
      return;
    }
    const record = value as Record<string, unknown>;
    if (
      record.schema === observationSchema &&
      parent?.schema === CURRENT_TURN_ARTIFACT_SCHEMA &&
      parent.payload === record
    ) {
      matches.push({ observation: record, artifact: parent });
    }
    Object.values(record)
      .slice(0, 240)
      .forEach((entry) => visit(entry, depth + 1, record));
  };
  visit(payload, 0, null);
  return matches;
};

const sameOrderedValues = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const hasExactSingleRef = (value: unknown, expected: string): boolean =>
  Array.isArray(value) &&
  value.length === 1 &&
  normalizeString(value[0]) === expected;

const hasCanonicalArtifactEnvelope = (input: {
  artifact: Record<string, unknown>;
  observation: Record<string, unknown>;
  turnId: string;
  capabilityId: string;
  observationKind: string;
  observationSchema: string;
}): { artifactId: string; gatewayRef: string } | null => {
  const {
    artifact,
    observation,
    turnId,
    capabilityId,
    observationKind,
    observationSchema,
  } = input;
  const artifactId = normalizeString(artifact.artifact_id);
  const artifactPrefix =
    `${turnId}:codex_normalized:${observationKind}:`;
  const artifactOrdinal = artifactId.startsWith(artifactPrefix)
    ? artifactId.slice(artifactPrefix.length)
    : "";
  const gatewayRef = normalizeString(observation.provider_gateway_observation_ref);
  const gatewayPrefix = `${turnId}:workstation_gateway:${capabilityId}:`;
  const gatewayHash = gatewayRef.startsWith(gatewayPrefix)
    ? gatewayRef.slice(gatewayPrefix.length)
    : "";
  if (
    artifact.schema !== CURRENT_TURN_ARTIFACT_SCHEMA ||
    normalizeString(artifact.turn_id) !== turnId ||
    normalizeString(artifact.kind) !== observationKind ||
    normalizeString(artifact.observation_kind) !== observationKind ||
    normalizeString(artifact.payload_schema) !== observationSchema ||
    normalizeString(artifact.capability_key) !== capabilityId ||
    normalizeString(artifact.source_capability_id) !== capabilityId ||
    normalizeString(artifact.status) !== "succeeded" ||
    artifact.assistant_answer !== false ||
    artifact.terminal_eligible !== false ||
    artifact.raw_content_included !== false ||
    !/^[1-9]\d*$/.test(artifactOrdinal) ||
    normalizeString(artifact.provider_gateway_observation_ref) !== gatewayRef ||
    !/^[a-f0-9]{16}$/.test(gatewayHash) ||
    !hasExactSingleRef(artifact.provider_gateway_packet_refs, gatewayRef) ||
    normalizeString(observation.kind) !== observationKind ||
    normalizeString(observation.capability_key) !== capabilityId ||
    normalizeString(observation.source_capability_id) !== capabilityId ||
    !hasExactSingleRef(observation.provider_gateway_packet_refs, gatewayRef)
  ) {
    return null;
  }
  return { artifactId, gatewayRef };
};

const hasEvidenceOnlyObservationAuthority = (
  observation: Record<string, unknown>,
  outputRole: "evidence_for_synthesis" | "evidence_for_bounded_synthesis",
): boolean =>
  observation.status === "succeeded" &&
  observation.output_role === outputRole &&
  observation.terminal_eligible === false &&
  observation.post_tool_model_step_required === true &&
  observation.assistant_answer === false &&
  observation.raw_content_included === false;

const procedureIntegrityMatches = async (
  procedure: TheoryExperimentProcedureV1,
): Promise<boolean> => {
  const {
    procedureSha256,
    artifactId: _artifactId,
    schemaVersion: _schemaVersion,
    ...unsignedProcedure
  } = procedure;
  try {
    const expected = await computeCasimirSpecValueSha256V1({
      domain: THEORY_EXPERIMENT_PROCEDURE_HASH_DOMAIN,
      value: unsignedProcedure,
    });
    return procedureSha256 === expected;
  } catch {
    return false;
  }
};

const hasExactClosureRankingOrder = (
  closure: TheoryExperimentExecutionClosureV1,
): boolean => {
  const candidateIds = closure.candidates.map((candidate) => candidate.candidateId);
  const orderedIds = closure.ranking.orderedCandidateIds;
  if (
    new Set(candidateIds).size !== candidateIds.length ||
    new Set(orderedIds).size !== orderedIds.length ||
    candidateIds.length !== orderedIds.length ||
    orderedIds.some((candidateId) => !candidateIds.includes(candidateId)) ||
    closure.ranking.topCandidateIds.some(
      (candidateId) => !orderedIds.includes(candidateId),
    )
  ) {
    return false;
  }
  const candidateById = new Map(
    closure.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  return orderedIds.every(
    (candidateId, index) =>
      candidateById.get(candidateId)?.displayOrdinal === index + 1,
  );
};

const closureIntegrityMatches = async (closure: unknown): Promise<boolean> => {
  try {
    return (
      await validateTheoryExperimentExecutionClosureIntegrityV1(closure)
    ).length === 0;
  } catch {
    return false;
  }
};

const emptyClosureProjection = (): Pick<
  TheoryExperimentWorkflowSession,
  | "closureObservedTurnId"
  | "closureArtifactId"
  | "closureObservationRef"
  | "closureId"
  | "closureSha256"
  | "closureGeneratedAt"
  | "closureStageStatus"
  | "rankingOutcome"
  | "orderedCandidateIds"
  | "topCandidateIds"
  | "candidates"
  | "synthesisReadinessStatus"
  | "claimCeiling"
  | "modelSynthesisAllowed"
  | "synthesisReason"
  | "openRequirementCodes"
  | "closureBlockerCodes"
  | "evidenceObservations"
> => ({
  closureObservedTurnId: null,
  closureArtifactId: null,
  closureObservationRef: null,
  closureId: null,
  closureSha256: null,
  closureGeneratedAt: null,
  closureStageStatus: emptyClosureStageStatus(),
  rankingOutcome: null,
  orderedCandidateIds: [],
  topCandidateIds: [],
  candidates: [],
  synthesisReadinessStatus: null,
  claimCeiling: null,
  modelSynthesisAllowed: false,
  synthesisReason: null,
  openRequirementCodes: [],
  closureBlockerCodes: [],
  evidenceObservations: [],
});

export const useTheoryExperimentWorkflowStore =
  create<TheoryExperimentWorkflowState>((set, get) => ({
    session: null,
    start: (input) => {
      const session: TheoryExperimentWorkflowSession = {
        schema: "helix.theory_experiment_workflow_projection.v1",
        procedureId: newProcedureId(),
        sourceSessionId: normalizeString(input.sourceSessionId),
        target: normalizeString(input.target),
        selectedBadgeIds: normalizeStringArray(input.selectedBadgeIds),
        lanyonRequested: input.lanyonRequested,
        startedAt: new Date().toISOString(),
        submittedTurnId: null,
        observedTurnId: null,
        procedureArtifactId: null,
        observationRef: null,
        procedureSha256: null,
        procedureGeneratedAt: null,
        stageStatus: emptyStageStatus(),
        missingRequirementCodes: [],
        ...emptyClosureProjection(),
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      };
      set({ session });
      return session;
    },
    observePayload: async (payload, sourceSessionId) => {
      const session = get().session;
      if (!session || normalizeString(sourceSessionId) !== session.sourceSessionId) return false;
      if (!isRecord(payload)) return false;
      const submittedTurnId = normalizeString(payload.turn_id);
      // Durable Ask replies are commonly stamped when the reply projection is
      // completed, after the gateway artifact itself was generated. Treat that
      // timestamp as a freshness bound for the enclosing reply, not as the
      // tool-call start time. Causality is established by the exact turn,
      // capability, gateway-ref, artifact-envelope, procedure-id, and digest
      // bindings below.
      const replyProjectedAtMs = readFiniteNumber(payload.createdAtMs);
      const sessionStartedAtMs = readIsoTimestamp(session.startedAt);
      if (
        !submittedTurnId ||
        replyProjectedAtMs === null ||
        sessionStartedAtMs === null ||
        replyProjectedAtMs < sessionStartedAtMs
      ) {
        return false;
      }
      let workingSession = session;
      let advanced = false;
      const procedureCandidates = findCurrentTurnObservations(
        payload,
        THEORY_EXPERIMENT_OBSERVATION_SCHEMA,
      ).filter(({ observation }) => {
          const procedure = observation.procedure;
          return isRecord(procedure) &&
            normalizeString(procedure.procedureId) === session.procedureId;
        });
      if (procedureCandidates.length > 1) return false;
      if (procedureCandidates.length === 1) {
        const { observation, artifact } = procedureCandidates[0];
        if (
          !hasEvidenceOnlyObservationAuthority(
            observation,
            "evidence_for_synthesis",
          )
        ) {
          return false;
        }
        const procedure = observation.procedure;
        if (!isRecord(procedure)) return false;
        const issues = validateTheoryExperimentProcedureV1(procedure);
        if (issues.length > 0) return false;
        const typedProcedure = procedure as TheoryExperimentProcedureV1;
        const generatedAtMs = readIsoTimestamp(typedProcedure.generatedAt);
        const priorGeneratedAtMs = readIsoTimestamp(
          workingSession.procedureGeneratedAt,
        );
        if (
          typedProcedure.turnId !== submittedTurnId ||
          generatedAtMs === null ||
          generatedAtMs < sessionStartedAtMs ||
          generatedAtMs > Date.now() + MAX_PROJECTION_CLOCK_SKEW_MS ||
          (priorGeneratedAtMs !== null &&
            (generatedAtMs < priorGeneratedAtMs ||
              (generatedAtMs === priorGeneratedAtMs &&
                typedProcedure.procedureSha256 !==
                  workingSession.procedureSha256))) ||
          typedProcedure.request.target !== session.target ||
          !sameOrderedValues(
            typedProcedure.request.selectedBadgeIds,
            session.selectedBadgeIds,
          ) ||
          typedProcedure.lanyonEligibility.requested !== session.lanyonRequested
        ) {
          return false;
        }
        const artifactIdentity = hasCanonicalArtifactEnvelope({
          artifact,
          observation,
          turnId: submittedTurnId,
          capabilityId: THEORY_EXPERIMENT_CAPABILITY,
          observationKind: THEORY_EXPERIMENT_OBSERVATION_KIND,
          observationSchema: THEORY_EXPERIMENT_OBSERVATION_SCHEMA,
        });
        if (
          !artifactIdentity ||
          !(await procedureIntegrityMatches(typedProcedure))
        ) {
          return false;
        }
        const stageStatus = emptyStageStatus();
        const missingRequirementCodes: string[] = [];
        for (const stage of typedProcedure.stages) {
          stageStatus[stage.id] = stage.status;
          missingRequirementCodes.push(...stage.missingRequirementCodes);
        }
        const procedureChanged =
          workingSession.procedureSha256 !== typedProcedure.procedureSha256;
        workingSession = {
          ...workingSession,
          ...(procedureChanged ? emptyClosureProjection() : {}),
          submittedTurnId,
          observedTurnId: typedProcedure.turnId,
          procedureArtifactId: artifactIdentity.artifactId,
          observationRef: artifactIdentity.gatewayRef,
          procedureSha256: typedProcedure.procedureSha256,
          procedureGeneratedAt: typedProcedure.generatedAt,
          stageStatus,
          missingRequirementCodes: Array.from(
            new Set(missingRequirementCodes),
          ).sort(),
        };
        advanced = true;
      }

      const closureObservations = findCurrentTurnObservations(
        payload,
        THEORY_EXPERIMENT_EXECUTION_CLOSURE_OBSERVATION_SCHEMA,
      );
      const closureCandidates = closureObservations.filter(({ observation }) => {
        const closure = observation.closure;
        if (!isRecord(closure)) return false;
        const procedureBinding = closure.procedureBinding;
        return (
          isRecord(procedureBinding) &&
          normalizeString(procedureBinding.procedureId) ===
            workingSession.procedureId &&
          normalizeString(procedureBinding.procedureSha256) ===
            workingSession.procedureSha256
        );
      });
      if (
        closureObservations.length > 0 &&
        (closureCandidates.length !== 1 ||
          !workingSession.procedureSha256 ||
          !workingSession.procedureGeneratedAt)
      ) {
        return false;
      }
      if (closureCandidates.length === 1) {
        const { observation, artifact } = closureCandidates[0];
        if (
          !hasEvidenceOnlyObservationAuthority(
            observation,
            "evidence_for_bounded_synthesis",
          )
        ) {
          return false;
        }
        const closure = observation.closure;
        if (!isRecord(closure)) return false;
        const typedClosure =
          closure as unknown as TheoryExperimentExecutionClosureV1;
        const generatedAtMs = readIsoTimestamp(typedClosure.generatedAt);
        const procedureGeneratedAtMs = readIsoTimestamp(
          workingSession.procedureGeneratedAt,
        );
        const priorClosureGeneratedAtMs = readIsoTimestamp(
          workingSession.closureGeneratedAt,
        );
        if (
          typedClosure.turnId !== submittedTurnId ||
          generatedAtMs === null ||
          procedureGeneratedAtMs === null ||
          generatedAtMs < sessionStartedAtMs ||
          generatedAtMs < procedureGeneratedAtMs ||
          generatedAtMs > Date.now() + MAX_PROJECTION_CLOCK_SKEW_MS ||
          (priorClosureGeneratedAtMs !== null &&
            (generatedAtMs < priorClosureGeneratedAtMs ||
              (generatedAtMs === priorClosureGeneratedAtMs &&
                typedClosure.closureSha256 !==
                  workingSession.closureSha256)))
        ) {
          return false;
        }
        const artifactIdentity = hasCanonicalArtifactEnvelope({
          artifact,
          observation,
          turnId: submittedTurnId,
          capabilityId: THEORY_EXPERIMENT_EXECUTION_CLOSURE_CAPABILITY,
          observationKind:
            THEORY_EXPERIMENT_EXECUTION_CLOSURE_OBSERVATION_KIND,
          observationSchema:
            THEORY_EXPERIMENT_EXECUTION_CLOSURE_OBSERVATION_SCHEMA,
        });
        if (
          !artifactIdentity ||
          !(await closureIntegrityMatches(typedClosure)) ||
          !hasExactClosureRankingOrder(typedClosure)
        ) {
          return false;
        }
        const closureStageStatus = emptyClosureStageStatus();
        for (const stage of typedClosure.stages) {
          closureStageStatus[stage.id] = stage.closureStatus;
        }
        const candidateById = new Map(
          typedClosure.candidates.map((candidate) => [
            candidate.candidateId,
            candidate,
          ]),
        );
        workingSession = {
          ...workingSession,
          closureObservedTurnId: typedClosure.turnId,
          closureArtifactId: artifactIdentity.artifactId,
          closureObservationRef: artifactIdentity.gatewayRef,
          closureId: typedClosure.closureId,
          closureSha256: typedClosure.closureSha256,
          closureGeneratedAt: typedClosure.generatedAt,
          closureStageStatus,
          rankingOutcome: typedClosure.ranking.outcome,
          orderedCandidateIds: [...typedClosure.ranking.orderedCandidateIds],
          topCandidateIds: [...typedClosure.ranking.topCandidateIds],
          candidates: typedClosure.ranking.orderedCandidateIds.map(
            (candidateId) => {
              const candidate = candidateById.get(candidateId)!;
              return {
                candidateId: candidate.candidateId,
                role: candidate.role,
                comparable: candidate.comparable,
                evidenceCoverageScore: candidate.evidenceCoverageScore,
                rankingGroup: candidate.rankingGroup,
                displayOrdinal: candidate.displayOrdinal,
                axes: candidate.axes.map((axis) => ({
                  axisId: axis.axisId,
                  status: axis.status,
                  applicable: axis.applicable,
                })),
              };
            },
          ),
          synthesisReadinessStatus: typedClosure.synthesisReadiness.status,
          claimCeiling: typedClosure.synthesisReadiness.claimCeiling,
          modelSynthesisAllowed:
            typedClosure.synthesisReadiness.modelSynthesisAllowed,
          synthesisReason: typedClosure.synthesisReadiness.reason,
          openRequirementCodes: [
            ...typedClosure.synthesisReadiness.openRequirementCodes,
          ],
          closureBlockerCodes: [
            ...typedClosure.synthesisReadiness.blockerCodes,
          ],
          evidenceObservations: typedClosure.evidenceObservations.map(
            (evidence) => ({
              artifactRef: evidence.artifactRef,
              kind: evidence.kind,
              status: evidence.status,
              scope: evidence.scope,
              closureSatisfied: evidence.closureSatisfied,
            }),
          ),
        };
        advanced = true;
      }

      if (!advanced) return false;
      const currentSession = get().session;
      if (
        !currentSession ||
        currentSession.procedureId !== session.procedureId ||
        currentSession.sourceSessionId !== session.sourceSessionId ||
        currentSession.startedAt !== session.startedAt ||
        currentSession.procedureSha256 !== session.procedureSha256 ||
        currentSession.closureSha256 !== session.closureSha256
      ) {
        return false;
      }
      set({ session: workingSession });
      return true;
    },
    reset: () => set({ session: null }),
  }));
