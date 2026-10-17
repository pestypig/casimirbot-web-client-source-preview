import { SymbolAtlas } from "./atlas";
import type { SymbolRec } from "./types";

export type RankOptions = {
  atlas?: SymbolAtlas;
  limit?: number;
};

export type RankComponents = {
  symbol: number;
  text: number;
  cosine: number;
  imports: number;
};

export type RankedSymbol = {
  symbol: SymbolRec;
  score: number;
  hits: {
    symbol: string[];
    doc: string[];
    text: string[];
    imports: string[];
  };
  components: RankComponents;
};

function tokenize(query: string) {
  return query
    .split(/[\s,;]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(haystack: string | undefined, needle: string) {
  if (!haystack) return 0;
  if (!needle) return 0;
  const regex = new RegExp(escapeRegex(needle), "gi");
  return haystack.match(regex)?.length ?? 0;
}

function ngramSet(text: string, size = 3, max = 512) {
  const normalized = text.toLowerCase();
  const set = new Set<string>();
  for (let i = 0; i <= normalized.length - size; i += 1) {
    const gram = normalized.slice(i, i + size);
    if (!/[a-z0-9]/.test(gram)) continue;
    set.add(gram);
    if (set.size >= max) break;
  }
  return set;
}

function cosineSimilarity(from: Set<string>, to: Set<string>) {
  if (!from.size || !to.size) return 0;
  let intersection = 0;
  for (const gram of from) {
    if (to.has(gram)) intersection += 1;
  }
  return intersection / Math.sqrt(from.size * to.size);
}

export function rankSymbols(query: string, symbols: SymbolRec[], options: RankOptions = {}) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const canonicalize = options.atlas
    ? (term: string) => options.atlas!.canonicalize(term)
    : (term: string) => term;

  const normalizedTokens = tokens.map(canonicalize);
  const uniqueTokens = Array.from(new Set(normalizedTokens.filter(Boolean)));

  const queryNGrams = ngramSet(query, 3, 256);

  const ranked: RankedSymbol[] = [];

  for (const symbol of symbols) {
    const aliasSet = new Set<string>([symbol.symbol, ...symbol.aliases]);
    const canonicalAliasSet = new Set(Array.from(aliasSet).map(canonicalize));

    const symbolHits: string[] = [];
    for (const token of uniqueTokens) {
      if (!token) continue;
      if (canonicalAliasSet.has(token) || aliasSet.has(token)) {
        symbolHits.push(token);
      }
    }

    const docHits: string[] = [];
    const textHits: string[] = [];
    const importHits: string[] = [];

    let docMatchCount = 0;
    let textMatchCount = 0;
    let signatureMatchCount = 0;

    for (const token of uniqueTokens) {
      if (!token) continue;
      const docCount = countOccurrences(symbol.doc, token);
      const textCount = countOccurrences(symbol.text, token);
      const sigCount = countOccurrences(symbol.signature, token);
      if (docCount) docHits.push(token);
      if (textCount) textHits.push(token);
      const importCount = symbol.imports.includes(token) ? 1 : 0;
      if (importCount) importHits.push(token);
      docMatchCount += docCount;
      textMatchCount += textCount;
      signatureMatchCount += sigCount;
    }

    const symbolComponent = symbolHits.length ? 1 + symbolHits.length / Math.max(tokens.length, 1) : 0;
    const textMatches = docMatchCount + textMatchCount + signatureMatchCount;
    const textComponent = Math.min(textMatches, 6) / 6;
    const importComponent = Math.min(importHits.length, 3) / 3;

    const combinedText = `${symbol.doc ?? ""}\n${symbol.text}\n${symbol.signature ?? ""}`;
    const targetNGrams = ngramSet(combinedText, 3, 512);
    const cosineComponent = cosineSimilarity(queryNGrams, targetNGrams);

    const score =
      3 * symbolComponent +
      1.5 * textComponent +
      1.0 * cosineComponent +
      0.5 * importComponent;

    if (score <= 0) continue;

    ranked.push({
      symbol,
      score,
      hits: {
        symbol: symbolHits,
        doc: docHits,
        text: textHits,
        imports: importHits,
      },
      components: {
        symbol: Number(symbolComponent.toFixed(4)),
        text: Number(textComponent.toFixed(4)),
        cosine: Number(cosineComponent.toFixed(4)),
        imports: Number(importComponent.toFixed(4)),
      },
    });
  }

  ranked.sort((a, b) => {
    if (b.score === a.score) {
      return a.symbol.chunkId.localeCompare(b.symbol.chunkId);
    }
    return b.score - a.score;
  });

  if (options.limit && options.limit > 0) {
    return ranked.slice(0, options.limit);
  }

  return ranked;
}

export function rankDeterministic(_query: string, ranked: RankedSymbol[]) {
  return [...ranked].sort((a, b) => {
    if (b.score === a.score) {
      return a.symbol.chunkId.localeCompare(b.symbol.chunkId);
    }
    return b.score - a.score;
  });
}
