const encoder = new TextEncoder();

type ShaInput = string | ArrayBuffer | Uint8Array;

function toUint8Array(data: ShaInput) {
  if (typeof data === "string") return encoder.encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

export async function sha256Hex(data: ShaInput) {
  const bytes = toUint8Array(data);

  if (typeof globalThis.crypto?.subtle !== "undefined") {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  if (typeof process !== "undefined" && process.versions?.node) {
    const moduleSpecifier = "node:crypto";
    const { createHash } = await import(/* @vite-ignore */ moduleSpecifier);
    return createHash("sha256").update(bytes).digest("hex");
  }

  throw new Error("Unable to compute SHA-256: no crypto implementation available");
}
