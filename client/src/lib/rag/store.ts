import type { ChunkRec, DocMeta, RagChunk } from "./types";

const DB_NAME = "helix-rag";
const DB_VERSION = 2;
const STORE_DOCS = "docs";
const STORE_CHUNKS = "chunks";

type ChunkRecord = Omit<ChunkRec, "embed"> & { embed?: ArrayBuffer };

let dbPromise: Promise<IDBDatabase> | null = null;

export function openRagDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;

      if (db.objectStoreNames.contains(STORE_DOCS)) {
        db.deleteObjectStore(STORE_DOCS);
      }
      const docs = db.createObjectStore(STORE_DOCS, { keyPath: "docId" });
      docs.createIndex("bySha", "sha256", { unique: false });
      docs.createIndex("byCreated", "createdAt", { unique: false });
      docs.createIndex("byLicense", "licenseApproved", { unique: false });

      if (db.objectStoreNames.contains(STORE_CHUNKS)) {
        db.deleteObjectStore(STORE_CHUNKS);
      }
      const chunks = db.createObjectStore(STORE_CHUNKS, { keyPath: "chunkId" });
      chunks.createIndex("byDoc", "docId", { unique: false });
      chunks.createIndex("byDocCreated", ["docId", "createdAt"], { unique: false });
      chunks.createIndex("byCreated", "createdAt", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function toRecord(chunk: ChunkRec): ChunkRecord {
  return {
    chunkId: chunk.chunkId,
    docId: chunk.docId,
    page: chunk.page,
    offset: chunk.offset,
    sectionPath: chunk.sectionPath,
    text: chunk.text,
    createdAt: chunk.createdAt,
    embed: chunk.embed ? chunk.embed.buffer.slice(0) : undefined,
  };
}

function fromRecord(record: ChunkRecord): ChunkRec {
  return {
    chunkId: record.chunkId,
    docId: record.docId,
    page: record.page,
    offset: record.offset,
    sectionPath: record.sectionPath,
    text: record.text,
    createdAt: record.createdAt,
    embed: record.embed ? new Float32Array(record.embed) : undefined,
  };
}

function txPut<T>(db: IDBDatabase, store: string, value: T) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value as any);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function txGet<T>(db: IDBDatabase, store: string, key: IDBValidKey) {
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => resolve((request.result as T) ?? undefined);
    request.onerror = () => reject(request.error);
  });
}

function txDel(db: IDBDatabase, store: string, key: IDBValidKey) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function indexDeleteWhere(db: IDBDatabase, store: string, indexName: string, range: IDBKeyRange) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const index = tx.objectStore(store).index(indexName);
    const request = index.openCursor(range);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function putDoc(meta: DocMeta) {
  const db = await openRagDB();
  await txPut(db, STORE_DOCS, meta);
}

export async function getDoc(docId: string) {
  const db = await openRagDB();
  return txGet<DocMeta>(db, STORE_DOCS, docId);
}

export async function listDocs() {
  const db = await openRagDB();
  return new Promise<DocMeta[]>((resolve, reject) => {
    const tx = db.transaction(STORE_DOCS, "readonly");
    const request = tx.objectStore(STORE_DOCS).getAll();
    request.onsuccess = () => resolve((request.result as DocMeta[]) ?? []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteDoc(docId: string) {
  const db = await openRagDB();
  await indexDeleteWhere(db, STORE_CHUNKS, "byDoc", IDBKeyRange.only(docId));
  await txDel(db, STORE_DOCS, docId);
}

export async function putChunks(chunks: ChunkRec[], maxDocMB = 20) {
  if (!chunks.length) return;
  const docId = chunks[0].docId;
  if (!chunks.every((chunk) => chunk.docId === docId)) {
    throw new Error("All chunks must share the same docId");
  }

  const encoder = new TextEncoder();
  const totalBytes = chunks.reduce((sum, chunk) => sum + encoder.encode(chunk.text).length, 0);
  const maxBytes = maxDocMB * 1024 * 1024;
  if (totalBytes > maxBytes) {
    throw new Error(
      `Document too large (${(totalBytes / 1_000_000).toFixed(2)} MB > ${maxDocMB} MB)`
    );
  }

  const db = await openRagDB();
  await indexDeleteWhere(db, STORE_CHUNKS, "byDoc", IDBKeyRange.only(docId));

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, "readwrite");
    const store = tx.objectStore(STORE_CHUNKS);
    for (const chunk of chunks) {
      store.put(toRecord(chunk));
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function docsMap() {
  const docs = await listDocs();
  return new Map(docs.map((doc) => [doc.docId, doc] as const));
}

export async function getAllChunks(): Promise<RagChunk[]> {
  const db = await openRagDB();
  const map = await docsMap();
  return new Promise<RagChunk[]>((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, "readonly");
    const request = tx.objectStore(STORE_CHUNKS).getAll();
    request.onsuccess = () => {
      const records = (request.result as ChunkRecord[]) ?? [];
      const chunks: RagChunk[] = [];
      for (const record of records) {
        const base = fromRecord(record);
        const meta = map.get(base.docId);
        if (!meta) continue;
        chunks.push({ ...base, meta });
      }
      resolve(chunks);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getChunksByDoc(docId: string): Promise<RagChunk[]> {
  const db = await openRagDB();
  const meta = await getDoc(docId);
  if (!meta) return [];
  return new Promise<RagChunk[]>((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, "readonly");
    const index = tx.objectStore(STORE_CHUNKS).index("byDoc");
    const request = index.getAll(IDBKeyRange.only(docId));
    request.onsuccess = () => {
      const records = (request.result as ChunkRecord[]) ?? [];
      resolve(records.map((record) => ({ ...fromRecord(record), meta })));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearChunks() {
  const db = await openRagDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_CHUNKS, STORE_DOCS], "readwrite");
    tx.objectStore(STORE_CHUNKS).clear();
    tx.objectStore(STORE_DOCS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
