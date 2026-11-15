import { usePhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";

export function executePhysicsGlyphPanelAction(actionId: string, args: unknown) {
  const actionArgs = args === undefined ? {} : args;
  if (!actionArgs || typeof actionArgs !== "object" || Array.isArray(actionArgs) ||
    (actionId !== "inspect" && actionId !== "command") ||
    Object.keys(actionArgs).some(key => actionId === "inspect" || key !== "command")) {
    return { ok: false, panel_id: "physics-glyphs", action_id: actionId, message: "Invalid physics glyph action arguments." };
  }
  const outcome = usePhysicsGlyphWorkspaceStore.getState().dispatch(actionId === "inspect" ? { type: "inspect" } : (actionArgs as Record<string, unknown>).command);
  return { ok: outcome.ok, panel_id: "physics-glyphs", action_id: actionId, message: outcome.error, artifact: outcome.artifact };
}
