export function humanizeAskLiveEventToken(value: string): string {
  const cleaned = value
    .replace(/^Helix Ask:\s*/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.replace(/\b(?:llm|api|id|url|ui)\b/gi, (token) => token.toUpperCase());
}
