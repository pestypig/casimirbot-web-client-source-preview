import React from "react";
import type { PhysicsGlyphParticleId } from "@shared/physics-glyphs/catalog";
import { renderPhysicsGlyphMarkup, physicsGlyphMarkupRegistry } from "@shared/physics-glyphs/glyph-markup";
export function ParticleGlyph({ id, size = 60, phaseDeg }: { id: PhysicsGlyphParticleId; size?: number; phaseDeg?: number }) {
  return <span className="inline-flex" dangerouslySetInnerHTML={{ __html: renderPhysicsGlyphMarkup(id, physicsGlyphMarkupRegistry, size, phaseDeg) }} />;
}
