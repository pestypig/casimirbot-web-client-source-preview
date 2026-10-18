import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { useGrConstraintContract } from "@/hooks/useGrConstraintContract";
import { useGrEvaluation } from "@/hooks/useGrEvaluation";
import { useMathStageGate } from "@/hooks/useMathStageGate";
import { useProofPack } from "@/hooks/useProofPack";
import { useVacuumContract } from "@/hooks/useVacuumContract";
import { buildNhm2SolveState } from "@/lib/nhm2/solve-state";
import { NHM2_PROOF_PACK_STAGE_REQUIREMENTS } from "@shared/nhm2-solve-state";

export function useNhm2SolveState() {
  const pipelineQuery = useEnergyPipeline({
    staleTime: 5_000,
    refetchInterval: 2_500,
    refetchOnWindowFocus: false,
  });
  const proofPackQuery = useProofPack({
    staleTime: 10_000,
    refetchInterval: 3_000,
  });
  const grConstraintContractQuery = useGrConstraintContract({
    enabled: true,
    refetchInterval: 3_000,
  });
  const grEvaluationQuery = useGrEvaluation({
    enabled: true,
    refetchInterval: 3_000,
  });
  const stageGate = useMathStageGate(NHM2_PROOF_PACK_STAGE_REQUIREMENTS, {
    staleTime: 30_000,
  });
  const vacuumContract = useVacuumContract({
    id: "nhm2-solve-state:vacuum",
    label: "NHM2 Solve State",
    autoPublish: false,
  });

  const state = buildNhm2SolveState({
    pipeline: pipelineQuery.data,
    proofPack: proofPackQuery.data,
    grConstraintContract: grConstraintContractQuery.data,
    grEvaluation: grEvaluationQuery.data,
    vacuumContract,
    stageGate,
  });

  return {
    state,
    pipelineQuery,
    proofPackQuery,
    grConstraintContractQuery,
    grEvaluationQuery,
    stageGate,
    vacuumContract,
    isLoading:
      pipelineQuery.isLoading ||
      proofPackQuery.isLoading ||
      grConstraintContractQuery.isLoading ||
      grEvaluationQuery.isLoading,
  };
}
