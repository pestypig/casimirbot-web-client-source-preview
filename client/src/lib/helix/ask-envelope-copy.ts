import type { HelixAskResponseEnvelope } from "@shared/helix-ask-envelope";

function coerceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

export function normalizeHelixAskEnvelopeCitations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

export function formatEnvelopeSectionsForCopy(
  sections: HelixAskResponseEnvelope["sections"],
  hideTitle?: string,
): string {
  if (!sections || sections.length === 0) return "";
  const hidden = hideTitle?.toLowerCase();
  return sections
    .map((section) => {
      const lines: string[] = [];
      const title = coerceText(section.title);
      if (title && title.toLowerCase() !== hidden) {
        lines.push(title);
      }
      const body = coerceText(section.body);
      if (body) {
        lines.push(body);
      }
      const citations = normalizeHelixAskEnvelopeCitations(section.citations);
      if (citations.length > 0) {
        lines.push(`Sources: ${citations.join(", ")}`);
      }
      return lines.filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}
