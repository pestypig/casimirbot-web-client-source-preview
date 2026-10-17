import { useState } from "react";
import { sha256Hex } from "@/utils/sha";
import { ingestDoc } from "@/lib/rag/ingest";
import { getDoc, putDoc } from "@/lib/rag/store";

type Preview = {
  sample: string;
  sha: string;
};

const SAMPLE_WORDS = 200;

export default function IngestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [licenseApproved, setLicenseApproved] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleFileSelection(next: File) {
    setFile(next);
    setMessage(null);
    setPreview(null);
    setLicenseApproved(false);
    try {
      let text: string;
      if (next.type.includes("pdf")) {
        const { extractTextFromPDF } = await import("@/lib/rag/ingest-pdf");
        text = await extractTextFromPDF(next);
      } else {
        text = await next.text();
      }
      const sha = await sha256Hex(text);
      const sample = text.trim().split(/\s+/).slice(0, SAMPLE_WORDS).join(" ");
      setPreview({ sha, sample });
      if (!title) {
        const base = next.name.replace(/\.[^.]+$/, "");
        setTitle(base);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to prepare preview";
      setMessage(msg);
    }
  }

  async function onIngest() {
    if (!file || !preview) return;
    if (!licenseApproved) {
      setMessage("Please confirm you have ingestion rights.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const docId = (title || file.name).trim();
      if (!docId) throw new Error("Document title or ID is required.");
      const existing = await getDoc(docId);
      if (existing && existing.sha256 === preview.sha) {
        setMessage("Already ingested (same SHA-256).");
        setBusy(false);
        return;
      }
      const meta = {
        docId,
        sha256: preview.sha,
        title: docId,
        url: url || undefined,
        licenseApproved,
        bytes: file.size,
        createdAt: Date.now(),
      };
      await putDoc(meta);
      await ingestDoc({ file, docId });
      setMessage("Ingest complete.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Ingestion failed";
      setMessage(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Local Corpus Ingest</h1>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Title / Doc ID</span>
        <input
          className="rounded border border-slate-300 px-3 py-2"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Review 2025"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Source URL (optional)</span>
        <input
          className="rounded border border-slate-300 px-3 py-2"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/source"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Document</span>
        <input
          type="file"
          accept=".txt,.md,.pdf"
          onChange={(event) => {
            const next = event.target.files?.[0];
            if (next) void handleFileSelection(next);
          }}
        />
      </label>

      {preview && (
        <div className="rounded border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-lg font-medium">Preview (first 200 words)</h2>
          <p className="mt-2 font-mono text-sm leading-relaxed">
            {preview.sample ? `${preview.sample} ...` : "(empty document)"}
          </p>
          <p className="mt-3 break-all text-xs text-slate-600">
            SHA-256: <code>{preview.sha}</code>
          </p>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={licenseApproved}
              onChange={(event) => setLicenseApproved(event.target.checked)}
            />
            I have rights to ingest and keep this locally.
          </label>
        </div>
      )}

      <button
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-blue-300"
        disabled={!file || !preview || busy}
        onClick={() => void onIngest()}
      >
        {busy ? "Ingesting..." : "Ingest"}
      </button>
      {message && <p className="text-sm text-slate-700">{message}</p>}
    </div>
  );
}
