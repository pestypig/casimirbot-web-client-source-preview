import { useMemo } from "react";
import type { HelixRecommendedActionAdmissionV1 } from "@shared/contracts/helix-recommended-action-admission.v1";
import type { IdeologyContextReflectionV1 } from "@shared/ideology-context-reflection";

export type UseMoralGraphReflectionInput = {
  reflection: IdeologyContextReflectionV1;
  admission: HelixRecommendedActionAdmissionV1;
};

export function useMoralGraphReflection(input: UseMoralGraphReflectionInput) {
  return useMemo(
    () => ({
      reflection: input.reflection,
      admission: input.admission,
      activeLensCount: input.reflection.activated_traits.length || input.reflection.matches.inferred_lenses.length,
      missingCheckCount: input.reflection.claim_boundaries.missing_evidence?.length ?? 0,
      admissionCount: input.admission.actions.length,
    }),
    [input.admission, input.reflection],
  );
}
