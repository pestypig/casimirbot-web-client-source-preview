import { DOC_MANIFEST, type DocManifestEntry } from "@/lib/docs/docManifest";

const PAPER_KEYWORDS = /\b(paper|research|publication|brief|report|analysis|proof)\b/i;
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "about",
  "on",
  "for",
  "regarding",
  "topic",
  "paper",
  "papers",
  "read",
  "open",
  "find",
  "look",
  "search",
  "show",
  "please",
  "me",
  "to",
  "it",
  "and",
]);

export type PaperReadCommand = {
  topic: string;
};

export type DocTopicResolutionStatus = "strong" | "weak" | "ambiguous" | "none";

export type DocTopicResolution = {
  status: DocTopicResolutionStatus;
  best: DocManifestEntry | null;
  candidates: DocManifestEntry[];
  confidence: number;
};

export function parsePaperReadCommand(value: string): PaperReadCommand | null {
  const trimmed = normalizeSpokenPrompt(value);
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  const hasReadLikeVerb = /\b(read|open|show|find|search|look|pick|bring|pull)\b/.test(normalized);
  if (!hasReadLikeVerb) return null;
  const hasDocLikeNoun = /\b(paper|papers|research|report|publication|document|doc)\b/.test(normalized);
  const hasPanelTopicReadPattern =
    /\b(?:open|show|bring|pull|launch)(?:\s+up)?\b/.test(normalized) &&
    /\b(panel|tab|window)\b/.test(normalized) &&
    /\b(about|on|for|regarding)\b/.test(normalized) &&
    /\bread\b/.test(normalized);
  if (!hasDocLikeNoun && !hasPanelTopicReadPattern) return null;
  if (!/\bread\b/.test(normalized)) return null;
  const topic = extractTopic(trimmed);
  if (!topic) return null;
  return { topic };
}

export function findRandomPaperForTopic(
  topic: string,
  options?: { entries?: DocManifestEntry[]; random?: () => number },
): DocManifestEntry | null {
  const entries = options?.entries ?? DOC_MANIFEST;
  if (entries.length === 0) return null;
  const random = options?.random ?? Math.random;
  const tokens = tokenize(topic);
  const candidates = entries.filter((entry) => PAPER_KEYWORDS.test(`${entry.title} ${entry.relativePath}`));
  const searchPool = candidates.length > 0 ? candidates : entries;
  const scored = searchPool
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
    .filter((item) => item.score > 0);

  const pool = scored.length > 0 ? scored : searchPool.map((entry) => ({ entry, score: 0 }));
  const bestScore = Math.max(...pool.map((item) => item.score));
  const best = pool.filter((item) => item.score === bestScore).map((item) => item.entry);
  if (best.length === 0) return null;
  const pick = Math.max(0, Math.min(best.length - 1, Math.floor(random() * best.length)));
  return best[pick] ?? null;
}

export function findBestDocForTopic(
  topic: string,
  options?: { entries?: DocManifestEntry[] },
): DocManifestEntry | null {
  const resolution = resolveDocTopic(topic, options);
  return resolution.best;
}

export function resolveDocTopic(
  topic: string,
  options?: { entries?: DocManifestEntry[] },
): DocTopicResolution {
  const entries = options?.entries ?? DOC_MANIFEST;
  if (entries.length === 0) {
    return {
      status: "none",
      best: null,
      candidates: [],
      confidence: 0,
    };
  }
  const cleanedTopic = normalizeSpokenPrompt(String(topic ?? "").replace(/^["'`\s]+|["'`\s]+$/g, ""));
  if (!cleanedTopic) {
    return {
      status: "none",
      best: null,
      candidates: [],
      confidence: 0,
    };
  }
  const normalizedTopic = normalizeLookup(cleanedTopic);
  const tokens = tokenize(cleanedTopic);
  const queryVersionTokens = normalizedTopic.match(/\bv\d+\b/g) ?? [];
  if (!normalizedTopic && tokens.length === 0) {
    return {
      status: "none",
      best: null,
      candidates: [],
      confidence: 0,
    };
  }
  const ranked = entries
    .map((entry) => {
      const title = entry.title.toLowerCase();
      const path = entry.relativePath.toLowerCase();
      const haystack = `${entry.searchText} ${path} ${title}`;
      const normalizedTitle = normalizeLookup(entry.title);
      const normalizedPath = normalizeLookup(entry.relativePath);
      const normalizedFileBase = normalizeLookup(
        entry.relativePath
          .split("/")
          .at(-1)
          ?.replace(/\.md$/i, "") ?? "",
      );
      let score = 0;
      let tokenHits = 0;

      if (normalizedTopic) {
        if (normalizedTopic === normalizedFileBase) score += 240;
        if (normalizedTopic === normalizedTitle) score += 220;
        if (normalizedPath.includes(normalizedTopic)) score += 120;
        if (normalizedFileBase.includes(normalizedTopic)) score += 140;
        if (normalizedTitle.includes(normalizedTopic)) score += 110;
      }

      for (const token of tokens) {
        if (!token) continue;
        if (title.includes(token)) {
          score += 10;
          tokenHits += 1;
          continue;
        }
        if (path.includes(token)) {
          score += 8;
          tokenHits += 1;
          continue;
        }
        if (haystack.includes(token)) {
          score += 4;
          tokenHits += 1;
        }
      }

      if (queryVersionTokens.length > 0) {
        for (const versionToken of queryVersionTokens) {
          const hasVersion =
            normalizedTitle.includes(versionToken) ||
            normalizedFileBase.includes(versionToken) ||
            normalizedPath.includes(versionToken);
          if (hasVersion) {
            score += 130;
          } else {
            score -= 70;
          }
        }
      }

      return {
        entry,
        score,
        tokenHits,
        lengthDelta: Math.abs(normalizedTitle.length - normalizedTopic.length),
      };
    })
    .filter((item) => item.score > 0);

  if (ranked.length === 0) {
    return {
      status: "none",
      best: null,
      candidates: [],
      confidence: 0,
    };
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.tokenHits !== a.tokenHits) return b.tokenHits - a.tokenHits;
    if (a.lengthDelta !== b.lengthDelta) return a.lengthDelta - b.lengthDelta;
    return a.entry.title.localeCompare(b.entry.title);
  });
  const top = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const candidates = ranked.slice(0, 3).map((item) => item.entry);
  const gap = top && second ? top.score - second.score : top?.score ?? 0;
  const scoreBase = Math.max(1, (top?.score ?? 0) + (second?.score ?? 0) + 60);
  const confidence = top ? Math.max(0, Math.min(1, ((top.score + gap) / scoreBase))) : 0;
  let status: DocTopicResolutionStatus = "weak";
  if (!top) {
    status = "none";
  } else if (second && gap < 20) {
    status = "ambiguous";
  } else if (top.score >= 180 && top.tokenHits >= 1 && (!second || gap >= 35)) {
    status = "strong";
  } else if (top.score < 80 || top.tokenHits === 0) {
    status = "weak";
  } else {
    status = second && gap < 28 ? "ambiguous" : "weak";
  }
  return {
    status,
    best: top?.entry ?? null,
    candidates,
    confidence,
  };
}

function extractTopic(input: string): string | null {
  const cleaned = normalizeSpokenPrompt(
    input
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/^question\s*:\s*/i, "")
    .trim(),
  );
  const sep = String.raw`(?:\s|[,:;.!?])+`;
  const match =
    cleaned.match(new RegExp(String.raw`\b(?:about|on|for|regarding)${sep}(.+?)(?:${sep}(?:and|then)${sep}(?:open|read)\b|[.?!]|$)`, "i")) ??
    cleaned.match(
      new RegExp(
        String.raw`\b(?:open|show|bring|pull|launch)(?:\s+up)?${sep}(?:a|an|the)?${sep}?(?:panel|tab|window)${sep}(?:about|on|for|regarding)${sep}(.+?)(?:${sep}(?:and|then)${sep}read\b|[.?!]|$)`,
        "i",
      ),
    ) ??
    cleaned.match(
      new RegExp(
        String.raw`\b(?:find|search|look|pick)${sep}(?:me${sep})?(?:a|an|any)?${sep}?(?:paper|papers|doc|document)${sep}(.+?)(?:[.?!]|$)`,
        "i",
      ),
    ) ??
    cleaned.match(
      new RegExp(
        String.raw`\b(?:read|open|show)${sep}(?:me${sep})?(?:a|an|any|the)?${sep}?(?:paper|papers|doc|document)(?:${sep}(?:about|on|for|regarding))?${sep}?(.+?)(?:${sep}(?:and|then)${sep}(?:open|read)\b|[.?!]|$)`,
        "i",
      ),
    );
  if (!match?.[1]) return null;
  const topic = match[1]
    .replace(/\b(?:open|read)\s+it\s+to\s+me\b.*$/i, "")
    .replace(/^the\s+/i, "")
    .trim();
  return topic || null;
}

function normalizeSpokenPrompt(value: string): string {
  return value
    .replace(/\b(?:uh+|um+|erm+|ah+)\b/gi, " ")
    .replace(/\b(?:you know|i mean|kinda|kind of|sort of|like)\b/gi, " ")
    .replace(/\b(\w+)(?:[\s,.;:!?-]+\1\b)+/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function normalizeLookup(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreEntry(entry: DocManifestEntry, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const haystack = `${entry.searchText} ${entry.relativePath.toLowerCase()} ${entry.title.toLowerCase()}`;
  const title = entry.title.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!haystack.includes(token)) continue;
    score += 1;
    if (title.includes(token)) score += 1;
  }
  return score;
}
