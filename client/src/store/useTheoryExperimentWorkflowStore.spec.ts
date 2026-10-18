import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTheoryExperimentWorkflowStore } from "@/store/useTheoryExperimentWorkflowStore";
import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";
import { buildTheoryContextReflection } from "@shared/theory/theory-context-reflector";
import { compileTheoryExperimentProcedureV1 } from "@shared/theory/theory-experiment-procedure-compiler";
import { compileTheoryExperimentExecutionClosureV1 } from "@shared/theory/theory-experiment-execution-closure";

const BADGE_ID = "study.casimir_dp.evidence_map_stage3";
const STARTED_AT = "2026-07-25T12:00:00.000Z";
const TURN_ID = "ask:test:demo-projection";
const CLOSURE_TURN_ID = "ask:test:demo-closure";

const buildObservation = async (input: {
  procedureId: string;
  turnId?: string;
  generatedAt?: string;
  lanyonRequested?: boolean;
}) => {
  const turnId = input.turnId ?? TURN_ID;
  const graph = buildNhm2TheoryBadgeGraphV1();
  const reflection = buildTheoryContextReflection({
    graph,
    prompt: "Compare the Stage 3 evidence map.",
    mentionedDomains: [BADGE_ID],
    generatedAt: input.generatedAt ?? "2026-07-25T12:00:01.000Z",
    reflectionId: "reflection:test:demo-projection",
  });
  const procedure = await compileTheoryExperimentProcedureV1({
    graph,
    turnId,
    procedureId: input.procedureId,
    generatedAt: input.generatedAt ?? "2026-07-25T12:00:01.000Z",
    reflection,
    request: {
      operation: "compare",
      target: "Stage 3 evidence map",
      targetObservable: null,
      scaleLog10M: null,
      coordinateFrame: null,
      initialBoundaryConditions: [],
      formalSystem: null,
      requestedPrecision: null,
      evidenceMaturityCeiling: "diagnostic",
      normalizationStatus: "explicit",
    },
    selectedBadgeIds: [BADGE_ID],
    lanyon: {
      requested: input.lanyonRequested ?? false,
    },
  });
  const gatewayRef =
    `${turnId}:workstation_gateway:theory-experiment-procedure.prepare:0123456789abcdef`;
  return {
    schema: "casimir.theory_experiment_procedure.observation.v1",
    status: "succeeded",
    procedure,
    output_role: "evidence_for_synthesis",
    kind: "theory_experiment_procedure_observation",
    capability_key: "theory-experiment-procedure.prepare",
    source_capability_id: "theory-experiment-procedure.prepare",
    provider_gateway_observation_ref: gatewayRef,
    provider_gateway_packet_refs: [gatewayRef],
    terminal_eligible: false,
    post_tool_model_step_required: true,
    assistant_answer: false,
    raw_content_included: false,
  };
};

const wrapSubmittedReply = (input: {
  observation: Awaited<ReturnType<typeof buildObservation>>;
  turnId?: string;
  createdAtMs?: number;
  artifactId?: string;
}) => {
  const turnId = input.turnId ?? TURN_ID;
  const gatewayRef = input.observation.provider_gateway_observation_ref;
  const artifactId = input.artifactId ??
    `${turnId}:codex_normalized:theory_experiment_procedure_observation:1`;
  return {
    id: `reply:${turnId}`,
    turn_id: turnId,
    createdAtMs: input.createdAtMs ?? Date.parse(STARTED_AT),
    content: "The tool observation was re-entered for bounded synthesis.",
    question: "Prepare the pinned theory experiment procedure.",
    debug: {
      current_turn_artifact_ledger: [
        {
          schema: "helix.current_turn_artifact.v1",
          artifact_id: artifactId,
          producer_item_id: `${turnId}:call`,
          kind: "theory_experiment_procedure_observation",
          observation_kind: "theory_experiment_procedure_observation",
          payload_schema: "casimir.theory_experiment_procedure.observation.v1",
          turn_id: turnId,
          capability_key: "theory-experiment-procedure.prepare",
          source_capability_id: "theory-experiment-procedure.prepare",
          provider_gateway_observation_ref: gatewayRef,
          provider_gateway_packet_refs: [gatewayRef],
          status: "succeeded",
          payload: input.observation,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        },
      ],
    },
  };
};

const buildClosureObservation = async (input: {
  procedureObservation: Awaited<ReturnType<typeof buildObservation>>;
  turnId?: string;
  generatedAt?: string;
}) => {
  const turnId = input.turnId ?? CLOSURE_TURN_ID;
  const procedureTurnId = input.procedureObservation.procedure.turnId;
  const procedureArtifactRef =
    `${procedureTurnId}:codex_normalized:theory_experiment_procedure_observation:1`;
  const closure = await compileTheoryExperimentExecutionClosureV1({
    procedure: input.procedureObservation.procedure,
    procedureArtifactRef,
    turnId,
    generatedAt: input.generatedAt ?? "2026-07-25T12:00:02.000Z",
    evidenceObservations: [],
    empiricalObservationSchemaRegistered: false,
  });
  const gatewayRef =
    `${turnId}:workstation_gateway:theory-experiment-procedure.evaluate_closure:fedcba9876543210`;
  return {
    schema: "casimir.theory_experiment_execution_closure.observation.v1",
    status: "succeeded",
    closure,
    next_capability_candidates: closure.nextCapabilityCandidates,
    missing_requirements: closure.synthesisReadiness.openRequirementCodes,
    output_role: "evidence_for_bounded_synthesis",
    kind: "theory_experiment_execution_closure",
    capability_key: "theory-experiment-procedure.evaluate_closure",
    source_capability_id: "theory-experiment-procedure.evaluate_closure",
    provider_gateway_observation_ref: gatewayRef,
    provider_gateway_packet_refs: [gatewayRef],
    terminal_eligible: false,
    post_tool_model_step_required: true,
    assistant_answer: false,
    raw_content_included: false,
  };
};

const wrapClosureReply = (input: {
  observation: Awaited<ReturnType<typeof buildClosureObservation>>;
  turnId?: string;
  createdAtMs?: number;
  artifactId?: string;
}) => {
  const turnId = input.turnId ?? CLOSURE_TURN_ID;
  const gatewayRef = input.observation.provider_gateway_observation_ref;
  return {
    id: `reply:${turnId}`,
    turn_id: turnId,
    createdAtMs: input.createdAtMs ?? Date.parse(STARTED_AT),
    content: "The execution closure observation was re-entered.",
    question: "Continue the execution closure.",
    debug: {
      current_turn_artifact_ledger: [
        {
          schema: "helix.current_turn_artifact.v1",
          artifact_id: input.artifactId ??
            `${turnId}:codex_normalized:theory_experiment_execution_closure:1`,
          producer_item_id: `${turnId}:call`,
          kind: "theory_experiment_execution_closure",
          observation_kind: "theory_experiment_execution_closure",
          payload_schema:
            "casimir.theory_experiment_execution_closure.observation.v1",
          turn_id: turnId,
          capability_key: "theory-experiment-procedure.evaluate_closure",
          source_capability_id:
            "theory-experiment-procedure.evaluate_closure",
          provider_gateway_observation_ref: gatewayRef,
          provider_gateway_packet_refs: [gatewayRef],
          status: "succeeded",
          payload: input.observation,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        },
      ],
    },
  };
};

describe("theory experiment Demo Lab projection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(STARTED_AT));
    useTheoryExperimentWorkflowStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances only from the matching typed procedure observation in the pinned chat", async () => {
    const session = useTheoryExperimentWorkflowStore.getState().start({
      sourceSessionId: "chat:theory",
      target: "Stage 3 evidence map",
      selectedBadgeIds: [BADGE_ID],
      lanyonRequested: true,
    });
    const observation = await buildObservation({
      procedureId: session.procedureId,
      lanyonRequested: true,
    });
    const reply = wrapSubmittedReply({ observation });

    expect(
      await useTheoryExperimentWorkflowStore.getState()
        .observePayload(reply, "chat:other"),
    ).toBe(false);
    expect(useTheoryExperimentWorkflowStore.getState().session?.observedTurnId).toBeNull();

    expect(
      await useTheoryExperimentWorkflowStore.getState()
        .observePayload({ answer: "prepared" }, "chat:theory"),
    ).toBe(false);
    expect(useTheoryExperimentWorkflowStore.getState().session?.observedTurnId).toBeNull();

    expect(
      await useTheoryExperimentWorkflowStore.getState()
        .observePayload(reply, "chat:theory"),
    ).toBe(true);

    const projected = useTheoryExperimentWorkflowStore.getState().session;
    expect(projected).toMatchObject({
      procedureId: session.procedureId,
      sourceSessionId: "chat:theory",
      submittedTurnId: TURN_ID,
      observedTurnId: TURN_ID,
      observationRef:
        `${TURN_ID}:workstation_gateway:theory-experiment-procedure.prepare:0123456789abcdef`,
      terminalEligible: false,
      assistantAnswer: false,
    });
    expect(projected?.procedureSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.values(projected?.stageStatus ?? {})).not.toContain(
      "awaiting_observation",
    );
  });

  it("accepts exact current-turn artifacts when the durable reply is timestamped after tool generation", async () => {
    const session = useTheoryExperimentWorkflowStore.getState().start({
      sourceSessionId: "chat:theory",
      target: "Stage 3 evidence map",
      selectedBadgeIds: [BADGE_ID],
      lanyonRequested: false,
    });
    const procedureObservation = await buildObservation({
      procedureId: session.procedureId,
      generatedAt: "2026-07-25T12:00:01.000Z",
    });
    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        wrapSubmittedReply({
          observation: procedureObservation,
          createdAtMs: Date.parse("2026-07-25T12:00:05.000Z"),
        }),
        "chat:theory",
      ),
    ).toBe(true);

    const closureObservation = await buildClosureObservation({
      procedureObservation,
      generatedAt: "2026-07-25T12:00:02.000Z",
    });
    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        wrapClosureReply({
          observation: closureObservation,
          createdAtMs: Date.parse("2026-07-25T12:00:06.000Z"),
        }),
        "chat:theory",
      ),
    ).toBe(true);
    expect(useTheoryExperimentWorkflowStore.getState().session).toMatchObject({
      observedTurnId: TURN_ID,
      closureObservedTurnId: CLOSURE_TURN_ID,
      closureSha256: closureObservation.closure.closureSha256,
      terminalEligible: false,
      assistantAnswer: false,
    });
  });

  it("rejects a typed observation whose procedure identity aliases another run", async () => {
    const session = useTheoryExperimentWorkflowStore.getState().start({
      sourceSessionId: "chat:theory",
      target: "Stage 3 evidence map",
      selectedBadgeIds: [BADGE_ID],
      lanyonRequested: false,
    });
    const observation = await buildObservation({
      procedureId: `${session.procedureId}:alias`,
    });

    expect(
      await useTheoryExperimentWorkflowStore.getState()
        .observePayload(wrapSubmittedReply({ observation }), "chat:theory"),
    ).toBe(false);
    expect(useTheoryExperimentWorkflowStore.getState().session?.observedTurnId).toBeNull();
  });

  it("rejects a free-standing legacy artifact_ref and an aliased current-turn artifact ID", async () => {
    const session = useTheoryExperimentWorkflowStore.getState().start({
      sourceSessionId: "chat:theory",
      target: "Stage 3 evidence map",
      selectedBadgeIds: [BADGE_ID],
      lanyonRequested: false,
    });
    const observation = {
      ...(await buildObservation({ procedureId: session.procedureId })),
      artifact_ref: "theory-experiment-procedure:plausible-alias",
    };
    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        {
          id: `reply:${TURN_ID}`,
          turn_id: TURN_ID,
          createdAtMs: Date.parse(STARTED_AT),
          observation,
        },
        "chat:theory",
      ),
    ).toBe(false);

    const reply = wrapSubmittedReply({
      observation,
      artifactId:
        `${TURN_ID}:codex_normalized:theory_experiment_procedure_observation:alias`,
    });

    expect(
      await useTheoryExperimentWorkflowStore.getState()
        .observePayload(reply, "chat:theory"),
    ).toBe(false);
    expect(useTheoryExperimentWorkflowStore.getState().session?.observationRef).toBeNull();
  });

  it("rejects stale or wrong-turn observations from the pinned chat", async () => {
    const session = useTheoryExperimentWorkflowStore.getState().start({
      sourceSessionId: "chat:theory",
      target: "Stage 3 evidence map",
      selectedBadgeIds: [BADGE_ID],
      lanyonRequested: false,
    });
    const staleObservation = await buildObservation({
      procedureId: session.procedureId,
      generatedAt: "2026-07-25T11:59:59.000Z",
    });
    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        wrapSubmittedReply({
          observation: staleObservation,
          createdAtMs: Date.parse("2026-07-25T11:59:59.000Z"),
        }),
        "chat:theory",
      ),
    ).toBe(false);

    const currentObservation = await buildObservation({
      procedureId: session.procedureId,
    });
    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        wrapSubmittedReply({
          observation: currentObservation,
          turnId: "ask:test:unlinked-turn",
        }),
        "chat:theory",
      ),
    ).toBe(false);
    expect(useTheoryExperimentWorkflowStore.getState().session?.observedTurnId).toBeNull();
  });

  it("rejects hash-tampered procedure content even when the envelope is well shaped", async () => {
    const session = useTheoryExperimentWorkflowStore.getState().start({
      sourceSessionId: "chat:theory",
      target: "Stage 3 evidence map",
      selectedBadgeIds: [BADGE_ID],
      lanyonRequested: false,
    });
    const observation = await buildObservation({ procedureId: session.procedureId });
    observation.procedure.readiness.reason = "tampered after sealing";

    expect(
      await useTheoryExperimentWorkflowStore.getState()
        .observePayload(wrapSubmittedReply({ observation }), "chat:theory"),
    ).toBe(false);
    expect(useTheoryExperimentWorkflowStore.getState().session?.procedureSha256).toBeNull();
  });

  it("projects a hash-bound closure in the supplied ranking order without granting terminal authority", async () => {
    const session = useTheoryExperimentWorkflowStore.getState().start({
      sourceSessionId: "chat:theory",
      target: "Stage 3 evidence map",
      selectedBadgeIds: [BADGE_ID],
      lanyonRequested: false,
    });
    const procedureObservation = await buildObservation({
      procedureId: session.procedureId,
    });
    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        wrapSubmittedReply({ observation: procedureObservation }),
        "chat:theory",
      ),
    ).toBe(true);

    const closureObservation = await buildClosureObservation({
      procedureObservation,
    });
    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        wrapClosureReply({ observation: closureObservation }),
        "chat:theory",
      ),
    ).toBe(true);

    const projected = useTheoryExperimentWorkflowStore.getState().session;
    expect(projected).toMatchObject({
      closureObservedTurnId: CLOSURE_TURN_ID,
      closureId: closureObservation.closure.closureId,
      closureSha256: closureObservation.closure.closureSha256,
      closureObservationRef:
        `${CLOSURE_TURN_ID}:workstation_gateway:theory-experiment-procedure.evaluate_closure:fedcba9876543210`,
      rankingOutcome: closureObservation.closure.ranking.outcome,
      orderedCandidateIds:
        closureObservation.closure.ranking.orderedCandidateIds,
      topCandidateIds: closureObservation.closure.ranking.topCandidateIds,
      synthesisReadinessStatus:
        closureObservation.closure.synthesisReadiness.status,
      claimCeiling:
        closureObservation.closure.synthesisReadiness.claimCeiling,
      modelSynthesisAllowed:
        closureObservation.closure.synthesisReadiness.modelSynthesisAllowed,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(projected?.candidates.map((candidate) => candidate.candidateId))
      .toEqual(closureObservation.closure.ranking.orderedCandidateIds);
    expect(projected?.candidates[0]?.axes).toEqual(
      closureObservation.closure.candidates
        .find(
          (candidate) =>
            candidate.candidateId ===
            closureObservation.closure.ranking.orderedCandidateIds[0],
        )
        ?.axes.map(({ axisId, status, applicable }) => ({
          axisId,
          status,
          applicable,
        })),
    );
  });

  it("rejects aliased and hash-tampered closure observations", async () => {
    const session = useTheoryExperimentWorkflowStore.getState().start({
      sourceSessionId: "chat:theory",
      target: "Stage 3 evidence map",
      selectedBadgeIds: [BADGE_ID],
      lanyonRequested: false,
    });
    const procedureObservation = await buildObservation({
      procedureId: session.procedureId,
    });
    await useTheoryExperimentWorkflowStore.getState().observePayload(
      wrapSubmittedReply({ observation: procedureObservation }),
      "chat:theory",
    );

    const aliasedProcedureObservation = await buildObservation({
      procedureId: `${session.procedureId}:alias`,
      turnId: "ask:test:aliased-procedure",
      generatedAt: "2026-07-25T12:00:01.500Z",
    });
    const aliasedClosure = await buildClosureObservation({
      procedureObservation: aliasedProcedureObservation,
      turnId: "ask:test:aliased-closure",
      generatedAt: "2026-07-25T12:00:02.500Z",
    });
    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        wrapClosureReply({
          observation: aliasedClosure,
          turnId: "ask:test:aliased-closure",
        }),
        "chat:theory",
      ),
    ).toBe(false);

    const artifactAliasedClosure = await buildClosureObservation({
      procedureObservation,
    });
    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        wrapClosureReply({
          observation: artifactAliasedClosure,
          artifactId:
            `${CLOSURE_TURN_ID}:codex_normalized:theory_experiment_execution_closure:alias`,
        }),
        "chat:theory",
      ),
    ).toBe(false);

    const tamperedClosure = await buildClosureObservation({
      procedureObservation,
    });
    tamperedClosure.closure.synthesisReadiness.reason =
      "tampered after closure sealing";
    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        wrapClosureReply({ observation: tamperedClosure }),
        "chat:theory",
      ),
    ).toBe(false);
    expect(
      useTheoryExperimentWorkflowStore.getState().session?.closureSha256,
    ).toBeNull();
  });

  it("does not let a closure bound to an older procedure overwrite a newer procedure projection", async () => {
    const session = useTheoryExperimentWorkflowStore.getState().start({
      sourceSessionId: "chat:theory",
      target: "Stage 3 evidence map",
      selectedBadgeIds: [BADGE_ID],
      lanyonRequested: false,
    });
    const firstProcedure = await buildObservation({
      procedureId: session.procedureId,
    });
    await useTheoryExperimentWorkflowStore.getState().observePayload(
      wrapSubmittedReply({ observation: firstProcedure }),
      "chat:theory",
    );
    const oldClosure = await buildClosureObservation({
      procedureObservation: firstProcedure,
    });

    const newerTurnId = "ask:test:newer-procedure";
    const newerProcedure = await buildObservation({
      procedureId: session.procedureId,
      turnId: newerTurnId,
      generatedAt: "2026-07-25T12:00:03.000Z",
    });
    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        wrapSubmittedReply({
          observation: newerProcedure,
          turnId: newerTurnId,
          createdAtMs: Date.parse("2026-07-25T12:00:02.000Z"),
        }),
        "chat:theory",
      ),
    ).toBe(true);
    expect(
      useTheoryExperimentWorkflowStore.getState().session?.procedureSha256,
    ).toBe(newerProcedure.procedure.procedureSha256);

    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        wrapClosureReply({ observation: oldClosure }),
        "chat:theory",
      ),
    ).toBe(false);
    expect(useTheoryExperimentWorkflowStore.getState().session).toMatchObject({
      procedureSha256: newerProcedure.procedure.procedureSha256,
      closureSha256: null,
      rankingOutcome: null,
    });
  });

  it("keeps the newest admitted closure when an older valid closure arrives later", async () => {
    const session = useTheoryExperimentWorkflowStore.getState().start({
      sourceSessionId: "chat:theory",
      target: "Stage 3 evidence map",
      selectedBadgeIds: [BADGE_ID],
      lanyonRequested: false,
    });
    const procedureObservation = await buildObservation({
      procedureId: session.procedureId,
    });
    await useTheoryExperimentWorkflowStore.getState().observePayload(
      wrapSubmittedReply({ observation: procedureObservation }),
      "chat:theory",
    );
    const newerClosureTurnId = "ask:test:newer-closure";
    const newerClosure = await buildClosureObservation({
      procedureObservation,
      turnId: newerClosureTurnId,
      generatedAt: "2026-07-25T12:00:04.000Z",
    });
    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        wrapClosureReply({
          observation: newerClosure,
          turnId: newerClosureTurnId,
          createdAtMs: Date.parse("2026-07-25T12:00:03.000Z"),
        }),
        "chat:theory",
      ),
    ).toBe(true);
    const retainedClosureSha256 = newerClosure.closure.closureSha256;

    const olderClosure = await buildClosureObservation({
      procedureObservation,
      turnId: "ask:test:older-closure",
      generatedAt: "2026-07-25T12:00:03.000Z",
    });
    expect(
      await useTheoryExperimentWorkflowStore.getState().observePayload(
        wrapClosureReply({
          observation: olderClosure,
          turnId: "ask:test:older-closure",
          createdAtMs: Date.parse("2026-07-25T12:00:02.000Z"),
        }),
        "chat:theory",
      ),
    ).toBe(false);
    expect(
      useTheoryExperimentWorkflowStore.getState().session?.closureSha256,
    ).toBe(retainedClosureSha256);
  });
});
