import { useEffect, useState } from "react";
import { rank } from "@/lib/rag/local-rag";
import {
  deleteDoc,
  getAllChunks,
  getChunksByDoc,
  getDoc,
  listDocs,
} from "@/lib/rag/store";
import type { DocMeta, RagChunk, RankedChunk } from "@/lib/rag/types";

const TOP_K = 8;

function sortDocs(docs: DocMeta[]) {
  return [...docs].sort((a, b) => b.createdAt - a.createdAt);
}

export default function RagAdminPage() {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RankedChunk[]>([]);
  const [chunks, setChunks] = useState<RagChunk[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshDocs();
  }, []);

  async function refreshDocs() {
    try {
      const next = await listDocs();
      setDocs(sortDocs(next));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load docs";
      setStatus(msg);
    }
  }

  async function ensureChunks() {
    if (chunks) return chunks;
    const loaded = await getAllChunks();
    setChunks(loaded);
    return loaded;
  }

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const corpus = await ensureChunks();
      const ranked = rank(trimmed, corpus, TOP_K);
      setResults(ranked);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Search failed";
      setStatus(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(docId: string) {
    if (!window.confirm(`Delete ${docId} and all associated chunks?`)) return;
    setBusy(true);
    try {
      await deleteDoc(docId);
      await refreshDocs();
      const remaining = chunks?.filter((chunk) => chunk.docId !== docId) ?? null;
      setChunks(remaining);
      setResults((prev) => prev.filter((entry) => entry.chunk.docId !== docId));
      setStatus(`Deleted ${docId}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to delete doc";
      setStatus(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleExport(docId: string) {
    try {
      const [meta, docChunks] = await Promise.all([getDoc(docId), getChunksByDoc(docId)]);
      const targetMeta = meta ?? docChunks[0]?.meta;
      if (!targetMeta) {
        setStatus("Document not found for export.");
        return;
      }
      const rows = docChunks.map((chunk) =>
        JSON.stringify({
          docId: chunk.docId,
          sha256: targetMeta.sha256,
          sectionPath: chunk.sectionPath,
          page: chunk.page ?? 0,
          offset: chunk.offset,
          text: chunk.text,
        })
      );
      const blob = new Blob([rows.join("\n")], { type: "application/jsonl" });
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `${docId}.jsonl`;
      anchor.click();
      setStatus(`Exported ${docId}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Export failed";
      setStatus(msg);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">RAG Admin</h1>
      <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium">Search chunks</h2>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded border border-slate-300 px-3 py-2"
            placeholder="Query the local corpus..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSearch();
              }
            }}
          />
          <button
            className="rounded bg-slate-800 px-4 py-2 text-white"
            disabled={busy || !query.trim()}
            onClick={() => void handleSearch()}
          >
            {busy ? "Searching..." : "Search"}
          </button>
        </div>
        {results.length > 0 && (
          <ol className="mt-4 space-y-3">
            {results.map((entry, idx) => (
              <li key={entry.chunk.chunkId} className="rounded border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {entry.chunk.meta?.title ?? entry.chunk.docId}
                    {entry.chunk.sectionPath ? ` | ${entry.chunk.sectionPath}` : ""}
                  </span>
                  <span>score: {entry.score.toFixed(4)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-800">{entry.chunk.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium">Documents</h2>
        <ul className="mt-3 space-y-3">
          {docs.map((doc) => (
            <li key={doc.docId} className="rounded border border-slate-100 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{doc.title}</p>
                  <p className="text-xs text-slate-500">
                    docId: {doc.docId} | {doc.licenseApproved ? "licensed" : "unverified"} |{" "}
                    {new Date(doc.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500 break-all">sha256: {doc.sha256}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded border border-slate-400 px-3 py-1 text-sm"
                    onClick={() => void handleExport(doc.docId)}
                  >
                    Export JSONL
                  </button>
                  <button
                    className="rounded border border-red-500 px-3 py-1 text-sm text-red-600"
                    onClick={() => void handleDelete(doc.docId)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
          {docs.length === 0 && <li className="text-sm text-slate-500">No documents ingested yet.</li>}
        </ul>
      </section>

      {status && <p className="text-sm text-slate-600">{status}</p>}
    </div>
  );
}
