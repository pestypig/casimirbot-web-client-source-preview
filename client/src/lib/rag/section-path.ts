const SECTION_SYMBOL = "\u00A7";
const sectionPrefix = new RegExp(`^${SECTION_SYMBOL}\\s*\\d+(\\.\\d+)*\\b`);
const markdownHeading = /^#{1,6}\s+/;
const numericHeading = /^\d+(\.\d+)*\s+/;

const headingOrder: RegExp[] = [sectionPrefix, markdownHeading, numericHeading];

export function deriveSectionPath(lines: string[]): string | undefined {
  const normalized = lines.map((line) => line.trim()).filter(Boolean);
  let candidate: string | undefined;
  for (const pattern of headingOrder) {
    candidate = normalized.find((line) => {
      pattern.lastIndex = 0;
      return pattern.test(line);
    });
    if (candidate) break;
  }
  if (!candidate) return undefined;

  const cleaned = candidate.replace(/\s{2,}/g, " ").trim();
  if (cleaned.startsWith(SECTION_SYMBOL)) return cleaned;

  if (markdownHeading.test(cleaned)) {
    const withoutHashes = cleaned.replace(markdownHeading, "").trim();
    if (numericHeading.test(withoutHashes)) {
      const formatted = withoutHashes.replace(/\s+/, " / ");
      return `${SECTION_SYMBOL}${formatted}`;
    }
    return withoutHashes;
  }

  if (numericHeading.test(cleaned)) {
    return `${SECTION_SYMBOL}${cleaned.replace(/\s+/, " / ")}`;
  }
  return cleaned;
}
