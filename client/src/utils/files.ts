export async function base64FromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  // Browser-safe base64 encoding without relying on Node Buffer
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    const sub = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}
