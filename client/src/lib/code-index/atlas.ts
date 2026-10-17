import { type AtlasExport, type EquationRec, type SymbolAliasMap, type SymbolRec } from "./types";

const greekToLatin: Record<string, string> = {
  ω: "omega",
  Ω: "omega",
  γ: "gamma",
  Γ: "gamma",
  σ: "sigma",
  Σ: "sigma",
  λ: "lambda",
  Λ: "lambda",
  θ: "theta",
  Θ: "theta",
  μ: "mu",
  Μ: "mu",
  τ: "tau",
  Τ: "tau",
  β: "beta",
  Β: "beta",
  α: "alpha",
  Α: "alpha",
  φ: "phi",
  Φ: "phi",
  ψ: "psi",
  Ψ: "psi",
  χ: "chi",
  Χ: "chi",
  ρ: "rho",
  Ρ: "rho",
};

function canonicalKey(term: string) {
  const trimmed = term.trim();
  if (!trimmed) return "";
  const normalized = trimmed
    .normalize("NFKD")
    .replace(/\s+/g, " ")
    .replace(/[\p{Z}\u00a0]/gu, " ")
    .replace(/\(([^)]+)\)/g, "$1");

  let key = "";
  for (const char of normalized) {
    if (char === "_" || char === "-" || char === " " || char === "/") continue;
    if (char === "^" || char === "{" || char === "}" || char === "\\") continue;
    const greek = greekToLatin[char];
    if (greek) {
      key += greek;
      continue;
    }
    key += char.toLowerCase();
  }
  return key.replace(/[^a-z0-9]/g, "");
}

export type VocabularyEntry = {
  canonical: string;
  aliases?: string[];
};

export const DEFAULT_VOCABULARY: VocabularyEntry[] = [
  { canonical: "Ω_T", aliases: ["omega_T", "Omega_T", "ω_T", "omegat"] },
  { canonical: "r_c", aliases: ["rc", "corrLen", "corr_length", "correlationLength"] },
];

export class VocabularyNormalizer {
  private aliasToCanonical = new Map<string, string>();
  private canonicalAliases = new Map<string, Set<string>>();

  constructor(entries: VocabularyEntry[] = []) {
    for (const entry of entries) {
      this.register(entry.canonical, entry.aliases);
    }
  }

  register(canonical: string, aliases: string[] = []) {
    const all = new Set<string>([canonical, ...aliases]);
    for (const alias of all) {
      const key = canonicalKey(alias);
      if (!key) continue;
      this.aliasToCanonical.set(key, canonical);
    }
    const existing = this.canonicalAliases.get(canonical) ?? new Set<string>();
    for (const alias of all) {
      existing.add(alias);
    }
    this.canonicalAliases.set(canonical, existing);
  }

  remember(term: string) {
    const canonical = this.canonicalize(term);
    this.register(canonical, [term]);
    return canonical;
  }

  canonicalize(term: string) {
    const key = canonicalKey(term);
    if (!key) return term;
    return this.aliasToCanonical.get(key) ?? term;
  }

  aliasesFor(canonical: string) {
    const aliases = this.canonicalAliases.get(canonical);
    if (!aliases) return [canonical];
    return Array.from(aliases).sort();
  }

  export(): SymbolAliasMap {
    const out: SymbolAliasMap = {};
    for (const [canonical, aliases] of this.canonicalAliases) {
      out[canonical] = Array.from(aliases).sort((a, b) => a.localeCompare(b));
    }
    return out;
  }
}

export type SymbolLookupOptions = {
  includeAliases?: boolean;
};

export class SymbolAtlas {
  private symbolsByChunk = new Map<string, SymbolRec>();
  private symbolsByCanonical = new Map<string, SymbolRec[]>();
  private equationsById = new Map<string, EquationRec>();

  constructor(private readonly normalizer = new VocabularyNormalizer(DEFAULT_VOCABULARY)) {}

  setSymbols(records: SymbolRec[]) {
    this.symbolsByChunk.clear();
    this.symbolsByCanonical.clear();
    for (const record of records) {
      this.addSymbol(record);
    }
  }

  addSymbol(record: SymbolRec) {
    this.symbolsByChunk.set(record.chunkId, record);
    const canonical = this.normalizer.remember(record.symbol);
    this.normalizer.register(canonical, record.aliases);

    const list = this.symbolsByCanonical.get(canonical) ?? [];
    list.push(record);
    list.sort((a, b) => {
      if (a.path === b.path) return a.chunkId.localeCompare(b.chunkId);
      return a.path.localeCompare(b.path);
    });
    this.symbolsByCanonical.set(canonical, list);
  }

  setEquations(records: EquationRec[]) {
    this.equationsById.clear();
    for (const record of records) {
      this.equationsById.set(record.id, record);
    }
  }

  addEquation(record: EquationRec) {
    this.equationsById.set(record.id, record);
    for (const symbol of record.symbols) {
      this.normalizer.remember(symbol);
    }
  }

  lookup(term: string, options: SymbolLookupOptions = {}) {
    const canonical = this.normalizer.canonicalize(term);
    const results = this.symbolsByCanonical.get(canonical) ?? [];
    if (options.includeAliases === false) return results;
    if (results.length) return results;

    // Fallback: if the term was not normalized, try raw symbol.
    const direct = this.symbolsByCanonical.get(term);
    return direct ?? [];
  }

  getSymbol(chunkId: string) {
    return this.symbolsByChunk.get(chunkId);
  }

  allSymbols() {
    return Array.from(this.symbolsByChunk.values()).sort((a, b) =>
      a.chunkId.localeCompare(b.chunkId),
    );
  }

  allEquations() {
    return Array.from(this.equationsById.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  aliases() {
    return this.normalizer.export();
  }

  canonicalize(term: string) {
    return this.normalizer.canonicalize(term);
  }

  export(snapshot: AtlasExport["snapshot"]): AtlasExport {
    return {
      snapshot,
      symbols: this.allSymbols(),
      equations: this.allEquations(),
      aliases: this.aliases(),
    };
  }
}

export function buildChunkId(path: string, symbol: string, byteStart: number, byteEnd: number) {
  const safePath = path.replace(/\\/g, "/");
  return `${safePath}#${symbol}@${byteStart}-${byteEnd}`;
}

const termNormalizer = new VocabularyNormalizer(DEFAULT_VOCABULARY);

export function normalizeTerm(term: string) {
  return termNormalizer.canonicalize(term);
}
