export function escapeSvgText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeSvgAttr(value: unknown): string {
  return escapeSvgText(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
