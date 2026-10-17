import type { PromptSpec } from "@shared/prompt-spec";
import type { EssenceProfile } from "@shared/inferenceProfile";
import { buildPromptSpec } from "./promptSpec";

export type RuntimeMode = "online" | "offline" | "degraded";

export type CollapseStrategyName = "deterministic_hash_v1" | "embedding_v1" | "micro_llm_v1" | "off";

export interface OrchestratorContext {
  userQuestion: string;
  personaId?: string | null;
  essenceId?: string | null;
  profile?: EssenceProfile | null;
  runtimeMode: RuntimeMode;
  contextCharsRemaining?: number;
}

export interface CollapseCandidate {
  id: string;
  promptSpec: PromptSpec;
  estimatedCostTokens: number;
  tags: string[];
}

export interface CollapseDecision {
  chosenId: string;
  candidates: Array<{
    id: string;
    score: number;
    tags: string[];
  }>;
  mode: PromptSpec["mode"];
  timestamp: string;
  input_hash: string;
  decider?: "heuristic" | "local-llm" | "disabled";
  model?: string;
  note?: string;
  strategy?: CollapseStrategyName;
}

type CollapseChooserMode = "off" | "heuristic" | "local-llm";

const normalizeCollapseStrategy = (value?: string | null): CollapseStrategyName => {
  if (!value || typeof value !== "string") {
    return "deterministic_hash_v1";
  }
  const normalized = value.trim().toLowerCase();
  if (["off", "none", "baseline", "disabled"].includes(normalized)) {
    return "off";
  }
  if (normalized.startsWith("micro") || normalized.includes("llm")) {
    return "micro_llm_v1";
  }
  if (normalized.startsWith("embed")) {
    return "embedding_v1";
  }
  return "deterministic_hash_v1";
};

export const resolveCollapseStrategy = (): CollapseStrategyName => {
  try {
    const fromGlobal = (globalThis as any)?.__HYBRID_COLLAPSE_MODE__;
    if (typeof fromGlobal === "string" && fromGlobal.trim()) {
      return normalizeCollapseStrategy(fromGlobal);
    }
    const env = (import.meta as any)?.env ?? {};
    const envValue = env.VITE_HYBRID_COLLAPSE_MODE ?? env.HYBRID_COLLAPSE_MODE;
    if (typeof envValue === "string" && envValue.trim()) {
      return normalizeCollapseStrategy(envValue);
    }
    const processEnv = (globalThis as any)?.process?.env?.HYBRID_COLLAPSE_MODE;
    if (typeof processEnv === "string" && processEnv.trim()) {
      return normalizeCollapseStrategy(processEnv);
    }
  } catch {
    // ignore env resolution failures
  }
  return "deterministic_hash_v1";
};

const chooserModeForStrategy = (strategy: CollapseStrategyName): CollapseChooserMode => {
  if (strategy === "off") return "off";
  if (strategy === "micro_llm_v1") return "local-llm";
  return "heuristic";
};

const pickBaselineCandidate = (candidates: CollapseCandidate[]): CollapseCandidate | null => {
  if (!candidates.length) return null;
  const preferred = candidates.find((c) => c.id === "plan_full");
  return preferred ?? candidates[0];
};

const resolveForceFullPlan = (): boolean => {
  try {
    const fromGlobal = (globalThis as any)?.__ESSENCE_FORCE_FULL_PLAN__;
    if (typeof fromGlobal === "boolean") {
      return fromGlobal;
    }
    const env = (import.meta as any)?.env ?? {};
    const envValue = env.VITE_FORCE_FULL_PLAN ?? env.FORCE_FULL_PLAN;
    if (typeof envValue === "string") {
      const lowered = envValue.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(lowered)) {
        return true;
      }
    }
  } catch {
    // ignore env resolution failures
  }
  return false;
};

function scoreCandidate(c: CollapseCandidate): number {
  let score = 0;

  if (c.tags.includes("force_full_plan")) score += 50;
  if (c.tags.includes("policy_risk")) score -= 100;
  if (c.tags.includes("profile_aligned")) score += 10;
  if (c.tags.includes("supports_longevity")) score += 5;
  if (c.tags.includes("low_cost")) score += 3;

  score -= c.estimatedCostTokens * 0.01;

  if (c.tags.includes("offline")) score -= 1;
  if (c.tags.includes("online")) score += 1;

  return score;
}

const hashInput = (text: string): string => {
  try {
    return `sha256:${btoa(unescape(encodeURIComponent(text.slice(0, 256))))}`;
  } catch {
    return "sha256:unavailable";
  }
};

let lastDecision: CollapseDecision | null = null;

type LocalChooserResponse = {
  chosenId?: string;
  scores?: Array<{ id: string; score: number; tags?: string[]; reason?: string }>;
  model?: string;
  note?: string;
};

const resolveLocalChooserUrl = (): string | null => {
  try {
    const fromGlobal = (globalThis as any)?.__ESSENCE_LOCAL_CHOOSER__;
    if (typeof fromGlobal === "string" && fromGlobal.trim()) {
      return fromGlobal.trim();
    }
    const envUrl = (import.meta as any)?.env?.VITE_LOCAL_CHOOSER_URL;
    if (typeof envUrl === "string" && envUrl.trim()) {
      return envUrl.trim();
    }
  } catch {
    // ignore env resolution failures
  }
  return null;
};

async function chooseWithLocalModel(
  ctx: OrchestratorContext,
  candidates: CollapseCandidate[],
  strategy: CollapseStrategyName,
): Promise<CollapseDecision | null> {
  const url = resolveLocalChooserUrl();
  if (!url || !candidates.length) {
    return null;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_question: ctx.userQuestion,
        persona_id: ctx.personaId,
        essence_id: ctx.essenceId,
        runtime_mode: ctx.runtimeMode,
        context_chars_remaining: ctx.contextCharsRemaining,
        candidates: candidates.map((c) => ({
          id: c.id,
          tags: c.tags,
          estimated_cost_tokens: c.estimatedCostTokens,
          prompt_spec: c.promptSpec,
        })),
      }),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as LocalChooserResponse;
    const scored = Array.isArray(payload.scores)
      ? payload.scores
          .filter((entry) => entry && typeof entry.id === "string")
          .map((entry) => ({
            id: entry.id,
            score: Number.isFinite(entry.score) ? Number(entry.score) : 0,
            tags: entry.tags ?? [],
          }))
          .sort((a, b) => b.score - a.score)
      : null;
    const chosenId =
      payload.chosenId && payload.chosenId.trim()
        ? payload.chosenId.trim()
        : scored && scored.length
          ? scored[0].id
          : candidates[0].id;
    const timestamp = new Date().toISOString();
    return {
      chosenId,
      candidates: scored ?? [],
      mode: candidates[0].promptSpec.mode,
      timestamp,
      input_hash: hashInput(ctx.userQuestion),
      decider: "local-llm",
      model: payload.model,
      note: payload.note,
      strategy,
    };
  } catch {
    return null;
  }
}

export async function collapseCandidates(
  ctx: OrchestratorContext,
  candidates: CollapseCandidate[],
  strategyOverride?: CollapseStrategyName,
): Promise<CollapseDecision> {
  const timestamp = new Date().toISOString();
  const strategy = normalizeCollapseStrategy(strategyOverride ?? resolveCollapseStrategy());
  if (!candidates.length) {
    const decision: CollapseDecision = {
      chosenId: "",
      candidates: [],
      mode: "plan_and_execute",
      timestamp,
      input_hash: "empty",
      decider: strategy === "off" ? "disabled" : "heuristic",
      strategy,
    };
    lastDecision = decision;
    return decision;
  }

  const inputHash = hashInput(ctx.userQuestion);
  const chooserMode = chooserModeForStrategy(strategy);
  if (chooserMode === "off") {
    const baseline = pickBaselineCandidate(candidates);
    lastDecision = null;
    return {
      chosenId: baseline?.id ?? "",
      candidates: [],
      mode: baseline?.promptSpec.mode ?? "plan_and_execute",
      timestamp,
      input_hash: inputHash,
      decider: "disabled",
      strategy,
      note: "collapse disabled (HYBRID_COLLAPSE_MODE=off)",
    };
  }

  const scored = candidates
    .map((c) => ({
      id: c.id,
      score: scoreCandidate(c),
      tags: c.tags,
    }))
    .sort((a, b) => b.score - a.score);

  let chosenId = scored[0].id;
  const previousDecision = lastDecision;
  if (previousDecision && previousDecision.mode === candidates[0].promptSpec.mode) {
    const prev = scored.find((c) => c.id === previousDecision.chosenId);
    if (prev && scored[0].score - prev.score < 1) {
      chosenId = previousDecision.chosenId;
    }
  }

  const fallback: CollapseDecision = {
    chosenId,
    candidates: scored,
    mode: candidates[0].promptSpec.mode,
    timestamp,
    input_hash: inputHash,
    decider: "heuristic",
    strategy,
    note: strategy === "embedding_v1" ? "embedding strategy not implemented; using heuristic scoring" : undefined,
  };

  const localChoice = chooserMode === "local-llm" ? await chooseWithLocalModel(ctx, candidates, strategy) : null;
  const decision = localChoice ?? fallback;
  lastDecision = decision;
  return decision;
}

export function buildDefaultCandidates(ctx: OrchestratorContext): CollapseCandidate[] {
  const baseTags =
    ctx.runtimeMode === "online"
      ? ["online"]
      : ctx.runtimeMode === "offline"
        ? ["offline"]
        : ["degraded", "offline"];
  const forceFull = resolveForceFullPlan();

  const fullPlan: CollapseCandidate = {
    id: "plan_full",
    promptSpec: buildPromptSpec({
      userQuestion: ctx.userQuestion,
      mode: "plan_and_execute",
      targetApi: "/api/agi/plan",
      systemInstructions: ctx.profile?.interaction_style?.tone_preference
        ? `Prefer ${ctx.profile.interaction_style.tone_preference} tone.`
        : undefined,
      softGoals: ctx.profile?.disabled_dimensions?.includes("sustainability")
        ? undefined
        : ctx.profile?.longevity?.recurring_themes,
    }),
    estimatedCostTokens: 3200,
    tags: [...baseTags, "profile_aligned", "force_full_plan"],
  };

  const leanPlan: CollapseCandidate = {
    id: "plan_lean",
    promptSpec: buildPromptSpec({
      userQuestion: ctx.userQuestion,
      mode: "plan_and_execute",
      targetApi: "/api/agi/plan",
      systemInstructions: "Keep plan minimal; prefer single-call tools when possible.",
      softGoals: ["Minimize cost", "Compress reasoning into fewer steps"],
    }),
    estimatedCostTokens: 1800,
    tags: [...baseTags, "low_cost"],
  };

  const candidates: CollapseCandidate[] = [fullPlan];
  if (!forceFull) {
    candidates.push(leanPlan);
  }

  return candidates;
}
