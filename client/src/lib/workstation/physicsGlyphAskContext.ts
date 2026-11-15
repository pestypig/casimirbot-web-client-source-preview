import { readCachedAccountProfileIdentity } from "@/lib/workstation/accountCapabilityPolicy";
import { physicsGlyphAskContextSchema } from "@shared/physics-glyphs/ask-context";

let connection: { profileId: string; peerId: string; automatic: boolean } | null = null;

/** Retained only while the user explicitly connects this panel. No credential enters Ask context. */
export function setPhysicsGlyphAskConnection(peerId: string | null, automatic: boolean) {
  const profileId = readCachedAccountProfileIdentity().profileId;
  connection = peerId && profileId ? { profileId, peerId, automatic } : null;
}

export function attachPhysicsGlyphAskContext(snapshot?: Record<string, unknown>, contextMode?: "attached" | "isolated") {
  const { physicsGlyphs: _stale, ...rest } = snapshot ?? {};
  if (contextMode === "isolated" || !connection?.automatic || connection.profileId !== readCachedAccountProfileIdentity().profileId) return rest;
  const parsed = physicsGlyphAskContextSchema.safeParse({ schema: "helix.physics_glyph_ask_context.v1",
    automaticScenarios: true, peerId: connection.peerId });
  return parsed.success ? { ...rest, physicsGlyphs: parsed.data } : rest;
}

export function hasPhysicsGlyphAskConnection() {
  return "physicsGlyphs" in attachPhysicsGlyphAskContext();
}
