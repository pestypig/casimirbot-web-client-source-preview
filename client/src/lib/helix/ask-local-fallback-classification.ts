import { extractIntentTerms } from "@/lib/helix/ask-voice-continuation-lexical";

export type AskLocalGateLikeResponse = {
  ok?: unknown;
  error?: unknown;
  fail_reason?: unknown;
  fail_class?: unknown;
};

export function isMultilangConfidenceGateResponse(response: AskLocalGateLikeResponse): boolean {
  const failReason = String(response.fail_reason ?? "").trim();
  const failClass = String(response.fail_class ?? "").trim();
  return Boolean(
    response.ok === false &&
      (
        response.error === "multilang_dispatch_blocked" ||
        response.error === "multilang_confirmation_required" ||
        failClass === "multilang_confidence_gate" ||
        /^HELIX_(?:INTERPRETER|MULTILANG)_/i.test(failReason)
      ),
  );
}

export function isLikelyIdeologyDomainLeak(args: {
  promptText?: string;
  outputText: string;
}): boolean {
  const prompt = (args.promptText ?? "").trim();
  const output = args.outputText.trim();
  if (!prompt || !output) return false;
  if (
    !/\b(?:mission ethos|ideology scope|warp vessel|radiance to the sun|stewardship policy)\b/i.test(output)
  ) {
    return false;
  }
  if (/\b(?:mission ethos|ideology|ethos|warp bubble|warp drive|alcubierre|natario)\b/i.test(prompt)) {
    return false;
  }
  const promptTerms = new Set(extractIntentTerms(prompt, 18));
  if (promptTerms.size === 0) return true;
  let overlap = 0;
  for (const term of extractIntentTerms(output, 24)) {
    if (!promptTerms.has(term)) continue;
    overlap += 1;
    if (overlap >= 2) return false;
  }
  return true;
}
