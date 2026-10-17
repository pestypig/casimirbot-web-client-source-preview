import type { PromptSpec, PromptSpecCitation } from "@shared/prompt-spec";

const MAX_CITATIONS = 8;
const MAX_CHARS = 20000;

export interface PromptSpecContext {
  userQuestion: string;
  mode: PromptSpec["mode"];
  targetApi: PromptSpec["target_api"];
  systemInstructions?: string;
  citations?: PromptSpecCitation[];
  softGoals?: string[];
}

export function buildPromptSpec(ctx: PromptSpecContext): PromptSpec {
  const sanitizedCitations = (ctx.citations ?? []).slice(0, MAX_CITATIONS).map((c) => ({
    ...c,
    snippet: c.snippet ? c.snippet.slice(0, 2000) : undefined,
  }));

  const spec: PromptSpec = {
    schema_version: "prompt-spec/1.0",
    mode: ctx.mode,
    target_api: ctx.targetApi,
    user_question: ctx.userQuestion.slice(0, MAX_CHARS),
    system_instructions: ctx.systemInstructions?.slice(0, 8000),
    citations: sanitizedCitations,
    soft_goals: ctx.softGoals,
    budgets: {
      max_citations: MAX_CITATIONS,
      max_chars: MAX_CHARS,
      max_tokens_hint: 4000,
    },
  };

  return spec;
}
