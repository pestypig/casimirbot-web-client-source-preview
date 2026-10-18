import {
  buildWorkstationDynamicToolsFromCapabilities,
  mapWorkstationDynamicToolCallToAction,
  type WorkstationDynamicToolCallMapping,
  type WorkstationDynamicToolSpec,
} from "@shared/workstation-dynamic-tools";
import { SITUATION_ROOM_JOB_RECIPES } from "@/lib/helix/situation-room-job-recipes";
import { WORKSTATION_V1_PANEL_CAPABILITIES } from "@/lib/workstation/panelCapabilities";

export type { WorkstationDynamicToolCallMapping, WorkstationDynamicToolSpec };

function withSituationRoomRecipeMetadata(tools: WorkstationDynamicToolSpec[]): WorkstationDynamicToolSpec[] {
  const recipeToolByKind = new Map(
    SITUATION_ROOM_JOB_RECIPES.map((recipe) => [
      recipe.kind,
      {
        recipe_id: recipe.recipe_id,
        output_artifact_kind: recipe.output_artifact_kind,
        attachment_policy: recipe.attachment_policy,
        context_injection: recipe.context_injection,
        command_lane_enabled: recipe.command_lane_enabled,
        recipe_tool: recipe.tool,
      },
    ]),
  );

  return tools.map((tool) => {
    if (tool.panel_id !== "situation-room-pipelines" || tool.action_id !== "create_job") return tool;
    return {
      ...tool,
      attachment_policy: "manual_only",
      context_injection: "explicit_attachment_only",
      inputSchema: {
        ...tool.inputSchema,
        properties: {
          ...(tool.inputSchema.properties as Record<string, unknown>),
          recipe_id: {
            enum: SITUATION_ROOM_JOB_RECIPES.map((recipe) => recipe.recipe_id),
          },
          recipe_tool_by_kind: {
            type: "object",
            description: "Reference metadata for recipe-backed job creation; not user-provided input.",
            default: Object.fromEntries(recipeToolByKind),
          },
        },
      },
    };
  });
}

export const WORKSTATION_DYNAMIC_TOOLS = withSituationRoomRecipeMetadata(
  buildWorkstationDynamicToolsFromCapabilities(WORKSTATION_V1_PANEL_CAPABILITIES),
);

export function getWorkstationDynamicTools(): WorkstationDynamicToolSpec[] {
  return WORKSTATION_DYNAMIC_TOOLS;
}

export function mapClientWorkstationDynamicToolCallToAction(
  toolName: string,
  args?: Record<string, unknown>,
): WorkstationDynamicToolCallMapping {
  return mapWorkstationDynamicToolCallToAction(toolName, args, WORKSTATION_DYNAMIC_TOOLS);
}
