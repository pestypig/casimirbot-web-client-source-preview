import { describe, expect, it } from "vitest";
import {
  draftJobFromNaturalLanguage,
  draftJobFromRecipe,
} from "@/lib/helix/situation-room-job-drafts";
import {
  SITUATION_ROOM_JOB_RECIPES,
  getSituationRoomJobRecipe,
} from "@/lib/helix/situation-room-job-recipes";

const scope = {
  room_id: "room_nether",
  selected_source_id: "src_discord",
  source_ids: ["src_discord"],
  source_label: "Discord source",
};

describe("situation room job recipes", () => {
  it("contains the expected recipe registry", () => {
    expect(SITUATION_ROOM_JOB_RECIPES.map((recipe) => recipe.recipe_id)).toEqual([
      "translate_source",
      "rolling_room_brief",
      "extract_action_items",
      "compose_prompt_from_evidence",
      "compare_selected_sources",
    ]);
    expect(SITUATION_ROOM_JOB_RECIPES.every((recipe) => recipe.attachment_policy === "manual_only")).toBe(true);
    expect(SITUATION_ROOM_JOB_RECIPES.every((recipe) => recipe.context_injection === "explicit_attachment_only")).toBe(true);
    expect(SITUATION_ROOM_JOB_RECIPES.every((recipe) => recipe.command_lane_enabled === false)).toBe(true);
    expect(SITUATION_ROOM_JOB_RECIPES.every((recipe) => recipe.tool.deferLoading === true)).toBe(true);
  });

  it("drafts a translate-to-Spanish job from a recipe", () => {
    const recipe = getSituationRoomJobRecipe("translate_source");
    const draft = draftJobFromRecipe(recipe, scope, { target_language: "es" });

    expect(draft.recipe_id).toBe("translate_source");
    expect(draft.kind).toBe("translate");
    expect(draft.missing_slots).toEqual([]);
    expect(draft.args).toMatchObject({
      room_id: "room_nether",
      source_ids: ["src_discord"],
      target_language: "es",
      input_text_policy: "source_text_preferred",
      output_render_policy: "target_language",
      attachment_policy: "manual_only",
      context_injection: "explicit_attachment_only",
      command_lane_enabled: false,
    });
  });

  it("returns a missing target language slot instead of a creatable translate draft", () => {
    const recipe = getSituationRoomJobRecipe("translate_source");
    const draft = draftJobFromRecipe(recipe, scope);

    expect(draft.missing_slots).toEqual(["target_language"]);
    expect(draft.args.target_language).toBeUndefined();
  });

  it("drafts translate-to-Spanish from natural language", () => {
    const draft = draftJobFromNaturalLanguage("translate Discord source to Spanish", scope);

    expect(draft).toMatchObject({
      recipe_id: "translate_source",
      kind: "translate",
      missing_slots: [],
      args: {
        target_language: "es",
      },
    });
  });

  it("treats a bare language prompt as a translate draft", () => {
    const draft = draftJobFromNaturalLanguage("es", scope);

    expect(draft).toMatchObject({
      recipe_id: "translate_source",
      kind: "translate",
      missing_slots: [],
      args: {
        target_language: "es",
      },
    });
  });
});
