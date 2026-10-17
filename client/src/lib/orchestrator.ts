import { apiRequest } from "@/lib/queryClient";
import {
  helixPlanSchema,
  helixSurfaceStateSchema,
  HELIX_PLAN_VERSION,
  type HelixPlan,
  type HelixSurfaceState,
} from "@shared/helix-plan";
import { z } from "zod";

const surfaceResponseSchema = z
  .object({
    plan_id: z.string().uuid(),
    schema_version: z.string(),
    model: z.string(),
    token_estimate: z.number().nonnegative().optional(),
    plan: z.unknown(),
  })
  .strict();

export interface SurfacePlanResult {
  planId: string;
  plan: HelixPlan;
  model: string;
  tokenEstimate: number;
  schemaVersion: string;
}

export async function interpretSurfaceIntent(
  utterance: string,
  options: { state?: Partial<HelixSurfaceState> } = {},
): Promise<SurfacePlanResult> {
  const text = utterance?.trim();
  if (!text) {
    throw new Error("utterance required");
  }

  let sanitizedState: HelixSurfaceState | undefined;
  if (options.state) {
    sanitizedState = helixSurfaceStateSchema.parse(options.state);
  }

  const payload: Record<string, unknown> = {
    utterance: text,
    schemaVersion: HELIX_PLAN_VERSION,
  };
  if (sanitizedState) {
    payload.state = sanitizedState;
  }

  const res = await apiRequest("POST", "/api/orchestrator/interpret", payload);
  const json = await res.json();
  const parsed = surfaceResponseSchema.parse(json);
  const plan = helixPlanSchema.parse(parsed.plan);

  return {
    planId: parsed.plan_id,
    plan,
    model: parsed.model,
    tokenEstimate: parsed.token_estimate ?? 0,
    schemaVersion: parsed.schema_version,
  };
}

export type { HelixPlan, HelixSurfaceState };
