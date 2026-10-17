// Lightweight equation renderer using monospace and UTF-8 math
export function Eq({ tex, className="" }: { tex: string; className?: string }) {
  return <code className={`font-mono text-sm ${className}`}>{tex}</code>;
}