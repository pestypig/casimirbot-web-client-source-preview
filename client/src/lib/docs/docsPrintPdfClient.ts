import {
  DOCS_PRINT_PDF_SCHEMA,
  type DocsPrintPdfRequest,
  type DocsPrintPdfResponseHeaders,
} from "@shared/docs-print-pdf";

export type DocsPrintPdfArtifact = DocsPrintPdfResponseHeaders & {
  blob: Blob;
};

const readError = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    return typeof body?.message === "string"
      ? body.message
      : typeof body?.error === "string"
        ? body.error
        : `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const readPositiveIntHeader = (response: Response, name: string): number => {
  const value = Number(response.headers.get(name));
  return Number.isInteger(value) && value >= 0 ? value : 0;
};

export async function requestDocsPrintPdf(
  input: Omit<DocsPrintPdfRequest, "schema">,
  signal?: AbortSignal,
): Promise<DocsPrintPdfArtifact> {
  const response = await fetch("/api/docs/print-pdf", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schema: DOCS_PRINT_PDF_SCHEMA, ...input }),
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  const blob = await response.blob();
  if (blob.type !== "application/pdf" && !blob.type.startsWith("application/pdf;")) {
    throw new Error("Docs Viewer PDF export returned an unexpected content type.");
  }
  const validation = response.headers.get("x-docs-pdf-validation");
  const sha256 = response.headers.get("x-docs-pdf-sha256")?.trim() ?? "";
  const filename = response.headers.get("x-docs-pdf-filename")?.trim() ?? "document-print.pdf";
  if (validation !== "pass" || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("Docs Viewer PDF export did not return a valid render receipt.");
  }
  return {
    schema: DOCS_PRINT_PDF_SCHEMA,
    filename,
    sha256,
    page_count: readPositiveIntHeader(response, "x-docs-pdf-page-count"),
    equation_count: readPositiveIntHeader(response, "x-docs-pdf-equation-count"),
    table_count: readPositiveIntHeader(response, "x-docs-pdf-table-count"),
    validation: "pass",
    blob,
  };
}

export function downloadDocsPrintPdfArtifact(artifact: DocsPrintPdfArtifact): void {
  const objectUrl = URL.createObjectURL(artifact.blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = artifact.filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}
