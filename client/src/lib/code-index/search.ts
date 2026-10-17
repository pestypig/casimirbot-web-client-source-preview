import { SymbolAtlas } from "./atlas";
import { rankSymbols, type RankOptions, type RankedSymbol } from "./ranker";
import { getAllEquations, getAllSymbols, getSnapshot } from "./store";
import { buildSnapshot, loadSnapshotSource, snapshotFingerprint } from "./snapshot";
import type { EquationRec, RepoSnapshot, SymbolRec } from "./types";

type WorkerReadyEvent = { t: "ready"; languages: string[] };
type WorkerIndexedEvent = {
  t: "indexed";
  id: string;
  path: string;
  symbols: SymbolRec[];
  equations: EquationRec[];
  diagnostics: string[];
};
type WorkerErrorEvent = { t: "error"; id?: string; error: string };
type WorkerMessage = WorkerReadyEvent | WorkerIndexedEvent | WorkerErrorEvent;

export type CodeSearchOptions = RankOptions & {
  includeEquations?: boolean;
  topK?: number;
};

export type CodeSearchResult = RankedSymbol & {
  equations: EquationRec[];
};

const CODE_FILE_PATTERN = /\.(c|m)?(t|j)sx?$/i;

let atlasCache: { atlas: SymbolAtlas; fingerprint: string } | null = null;

function createAtlas(symbols: SymbolRec[], equations: EquationRec[]) {
  const atlas = new SymbolAtlas();
  atlas.setSymbols(symbols);
  atlas.setEquations(equations);
  return atlas;
}

async function loadAtlas(): Promise<SymbolAtlas | null> {
  const snapshot = await getSnapshot();
  if (!snapshot) return null;
  const fingerprint = snapshotFingerprint(snapshot);
  if (atlasCache && atlasCache.fingerprint === fingerprint) {
    return atlasCache.atlas;
  }

  const [symbols, equations] = await Promise.all([getAllSymbols(), getAllEquations()]);
  if (!symbols.length) return null;

  const atlas = createAtlas(
    symbols.slice().sort((a, b) => a.chunkId.localeCompare(b.chunkId)),
    equations.slice().sort((a, b) => a.id.localeCompare(b.id)),
  );
  atlasCache = { atlas, fingerprint };
  return atlas;
}

export function invalidateAtlasCache() {
  atlasCache = null;
}

export async function atlasSearch(
  query: string,
  options: CodeSearchOptions = {},
): Promise<CodeSearchResult[]> {
  const atlas = await loadAtlas();
  if (!atlas) return [];

  const ranked = rankSymbols(query, atlas.allSymbols(), {
    ...options,
    atlas,
    limit: options.topK ?? options.limit,
  });
  if (!ranked.length) return [];

  if (!options.includeEquations) {
    return ranked.map((entry) => ({ ...entry, equations: [] }));
  }

  const equations = atlas.allEquations();
  return ranked.map((entry) => {
    const aliasSet = new Set<string>([entry.symbol.symbol, ...entry.symbol.aliases]);
    const canonical = atlas.canonicalize(entry.symbol.symbol);
    if (canonical && canonical !== entry.symbol.symbol) {
      aliasSet.add(canonical);
    }
    const matching = equations.filter((equation) =>
      equation.symbols.some(
        (symbol) =>
          aliasSet.has(symbol) || (canonical ? atlas.canonicalize(symbol) === canonical : false),
      ),
    );
    return { ...entry, equations: matching };
  });
}

export async function indexRepoWithWorker(
  snapshot: RepoSnapshot,
  onStatus?: (status: string) => void,
) {
  const worker = new Worker(new URL("./tree-worker.ts", import.meta.url), { type: "module" });
  let resolveReady: (() => void) | null = null;
  let rejectReady: ((error: Error) => void) | null = null;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const pending = new Map<
    string,
    { resolve: (event: WorkerIndexedEvent) => void; reject: (error: Error) => void }
  >();

  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const data = event.data;
    if (!data) return;
    switch (data.t) {
      case "ready":
        resolveReady?.();
        resolveReady = null;
        rejectReady = null;
        break;
      case "indexed": {
        const entry = pending.get(data.id);
        if (entry) {
          pending.delete(data.id);
          entry.resolve(data);
        }
        break;
      }
      case "error": {
        if (data.id) {
          const entry = pending.get(data.id);
          if (entry) {
            pending.delete(data.id);
            entry.reject(new Error(data.error));
          }
        } else {
          rejectReady?.(new Error(data.error));
        }
        break;
      }
      default:
        break;
    }
  };

  worker.onerror = (event) => {
    const error = event.error instanceof Error ? event.error : new Error(String(event.message));
    if (rejectReady) {
      rejectReady(error);
    } else {
      for (const { reject } of pending.values()) {
        reject(error);
      }
      pending.clear();
    }
  };

  worker.postMessage({
    t: "init",
    commit: snapshot.commit,
    createdAt: snapshot.createdAt,
  });

  await ready;

  const symbols: SymbolRec[] = [];
  const equations: EquationRec[] = [];
  const diagnostics: string[] = [];

  const toIndex = snapshot.files
    .filter((file) => CODE_FILE_PATTERN.test(file.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  let processed = 0;
  for (const file of toIndex) {
    processed += 1;
    onStatus?.(`Parsing ${processed}/${toIndex.length}: ${file.path}`);
    const source = await loadSnapshotSource(file.path);
    if (typeof source !== "string") {
      diagnostics.push(`Missing source for ${file.path}`);
      continue;
    }
    const id = `${file.path}:${processed}`;
    const result = await new Promise<WorkerIndexedEvent>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({
        t: "index",
        id,
        path: file.path,
        content: source,
        lang: file.lang,
        commit: snapshot.commit,
        createdAt: snapshot.createdAt,
      });
    }).catch((error) => {
      diagnostics.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (!result) continue;
    symbols.push(...result.symbols);
    equations.push(...result.equations);
    diagnostics.push(...result.diagnostics);
  }

  worker.terminate();
  invalidateAtlasCache();

  return {
    symbols,
    equations,
    diagnostics,
  };
}

export { buildSnapshot };
