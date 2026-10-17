import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { EquationRec, RepoSnapshot, SymbolRec } from "./types";

type CodeIndexSchema = DBSchema & {
  meta: {
    key: string;
    value: { key: "snapshot"; snapshot: RepoSnapshot };
  };
  symbols: {
    key: string;
    value: SymbolRec;
    indexes: {
      bySymbol: string;
      byPath: string;
      byAlias: string;
      byCommit: string;
    };
  };
  equations: {
    key: string;
    value: EquationRec;
    indexes: {
      bySymbol: string;
      byPath: string;
      byCommit: string;
    };
  };
};

const DB_NAME = "helix-code-index";
const DB_VERSION = 1;
const STORE_META = "meta";
const STORE_SYMBOLS = "symbols";
const STORE_EQUATIONS = "equations";

let dbPromise: Promise<IDBPDatabase<CodeIndexSchema>> | null = null;

export function openCodeDB() {
  if (dbPromise) return dbPromise;
  dbPromise = openDB<CodeIndexSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_SYMBOLS)) {
        const store = db.createObjectStore(STORE_SYMBOLS, { keyPath: "chunkId" });
        store.createIndex("bySymbol", "symbol", { unique: false });
        store.createIndex("byPath", "path", { unique: false });
        store.createIndex("byAlias", "aliases", { unique: false, multiEntry: true });
        store.createIndex("byCommit", "commit", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_EQUATIONS)) {
        const store = db.createObjectStore(STORE_EQUATIONS, { keyPath: "id" });
        store.createIndex("bySymbol", "symbols", { unique: false, multiEntry: true });
        store.createIndex("byPath", "path", { unique: false });
        store.createIndex("byCommit", "commit", { unique: false });
      }
    },
  });
  return dbPromise;
}

export async function saveSnapshot(snapshot: RepoSnapshot) {
  const db = await openCodeDB();
  await db.put(STORE_META, { key: "snapshot", snapshot });
}

export async function getSnapshot(): Promise<RepoSnapshot | null> {
  const db = await openCodeDB();
  const entry = await db.get(STORE_META, "snapshot");
  return entry?.snapshot ?? null;
}

export async function putSymbols(records: SymbolRec[]) {
  if (!records.length) return;
  const db = await openCodeDB();
  const tx = db.transaction(STORE_SYMBOLS, "readwrite");
  for (const record of records) {
    tx.store.put(record);
  }
  await tx.done;
}

export async function putEquations(records: EquationRec[]) {
  if (!records.length) return;
  const db = await openCodeDB();
  const tx = db.transaction(STORE_EQUATIONS, "readwrite");
  for (const record of records) {
    tx.store.put(record);
  }
  await tx.done;
}

export async function clearCodeIndex() {
  const db = await openCodeDB();
  const tx = db.transaction([STORE_SYMBOLS, STORE_EQUATIONS], "readwrite");
  await Promise.all([tx.objectStore(STORE_SYMBOLS).clear(), tx.objectStore(STORE_EQUATIONS).clear()]);
  await tx.done;
}

export async function getAllSymbols(): Promise<SymbolRec[]> {
  const db = await openCodeDB();
  const tx = db.transaction(STORE_SYMBOLS, "readonly");
  const values = await tx.store.getAll();
  await tx.done;
  return values;
}

export async function getAllEquations(): Promise<EquationRec[]> {
  const db = await openCodeDB();
  const tx = db.transaction(STORE_EQUATIONS, "readonly");
  const values = await tx.store.getAll();
  await tx.done;
  return values;
}

export async function searchSymbolsByAlias(alias: string, limit = 50) {
  const db = await openCodeDB();
  const tx = db.transaction(STORE_SYMBOLS, "readonly");
  const index = tx.store.index("byAlias");
  const results: SymbolRec[] = [];
  for await (const cursor of index.iterate(alias)) {
    results.push(cursor.value);
    if (results.length >= limit) break;
  }
  await tx.done;
  return results;
}
