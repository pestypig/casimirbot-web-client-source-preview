import React from "react";
import { glyphArtifactPresentation, renderGlyphArtifact, type FriendGlyphArtifact } from "@shared/helix-friend-board";
export function FriendGlyphSticker({ artifact, depth = 0, compact = false, onPage, disabled = false }: {
    artifact: FriendGlyphArtifact;
    depth?: number;
    compact?: boolean;
    onPage?: (depth: number) => void;
    disabled?: boolean;
}) {
    let p: ReturnType<typeof glyphArtifactPresentation>;
    try {
        p = glyphArtifactPresentation(artifact);
    }
    catch {
        return <div role="status">This artifact is incompatible with the current glyph catalog. Its original configuration is preserved.</div>;
    }
    const current = Math.max(0, Math.min(p.slides - 1, depth));
    return <div className={compact ? "w-32" : "w-full max-w-md"} aria-label={compact ? `Sticker preview: ${p.title}` : `Shared glyph: ${p.title}`}>
    <div className="rounded-xl border border-sky-300/20 bg-slate-950" style={compact ? { aspectRatio: "640 / 330", overflow: "hidden" } : undefined}>
      <div aria-hidden={compact || undefined} dangerouslySetInnerHTML={{ __html: renderGlyphArtifact(artifact, compact ? 0 : current) }}/>
    </div>
    {!compact && <><p className="mt-1 text-xs text-slate-400">{p.title} · {p.coverage} · qualitative</p>
      <div className="mt-2 flex items-center gap-3"><button aria-label="Previous sticker slide" disabled={disabled || current === 0} onClick={() => onPage?.(current - 1)}>‹</button>
        <span aria-live="polite">Slide {current + 1} of {p.slides}</span><button aria-label="Next sticker slide" disabled={disabled || current === p.slides - 1} onClick={() => onPage?.(current + 1)}>›</button></div></>}
  </div>;
}
