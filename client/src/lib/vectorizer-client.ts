export type VectorizeResponse = {
  svg: string;
  imageToken?: string;
  receipt?: string;
};

export type VectorizerHealth = { ready: boolean };

export async function fetchVectorizerHealth(): Promise<VectorizerHealth> {
  const res = await fetch("/api/vectorizer/health", { credentials: "include" });
  if (!res.ok) {
    return { ready: false };
  }
  return (await res.json()) as VectorizerHealth;
}

export async function vectorizeImage(
  file: File | Blob,
  opts?: { mode?: "preview" | "full"; retentionDays?: number },
): Promise<VectorizeResponse> {
  const form = new FormData();
  const name = file instanceof File && file.name ? file.name : "garment.png";
  form.append("image", file, name);
  if (opts?.mode) {
    form.append("mode", opts.mode);
  }
  if (opts?.retentionDays != null) {
    form.append("retention_days", String(opts.retentionDays));
  }
  const res = await fetch("/api/vectorizer/vectorize", {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`vectorizer_${res.status}: ${text}`);
  }
  return (await res.json()) as VectorizeResponse;
}

export async function downloadVectorized(
  token: string,
  format: "svg" | "png" | "pdf" = "svg",
): Promise<string | Blob> {
  const url = `/api/vectorizer/download/${encodeURIComponent(token)}?format=${encodeURIComponent(format)}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`vectorizer_download_${res.status}: ${text}`);
  }
  if (format === "svg") {
    return await res.text();
  }
  return await res.blob();
}
