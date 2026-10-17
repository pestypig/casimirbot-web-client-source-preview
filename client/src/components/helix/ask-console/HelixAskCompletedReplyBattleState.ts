import { buildReasoningBattleAnswerTint } from "@/lib/helix/ask-reasoning-battle-display";
import {
  buildReasoningBattleAmbientState,
  buildReasoningBattleBeats,
} from "@/lib/helix/reasoning-battle-stage";

export type HelixAskCompletedReplyBattleStateOptions = {
  timelineEvents: Parameters<typeof buildReasoningBattleBeats>[0]["timelineEvents"];
  liveEvents: Parameters<typeof buildReasoningBattleBeats>[0]["liveEvents"];
  theaterState: Parameters<typeof buildReasoningBattleBeats>[0]["theaterState"];
};

export type HelixAskCompletedReplyBattleState = {
  beats: ReturnType<typeof buildReasoningBattleBeats>;
  ambient: ReturnType<typeof buildReasoningBattleAmbientState>;
  answerTint: ReturnType<typeof buildReasoningBattleAnswerTint>;
};

export function buildHelixAskCompletedReplyBattleState(
  options: HelixAskCompletedReplyBattleStateOptions,
): HelixAskCompletedReplyBattleState {
  const beats = buildReasoningBattleBeats(options);
  const ambient = buildReasoningBattleAmbientState(options);
  return {
    beats,
    ambient,
    answerTint: buildReasoningBattleAnswerTint({ beats, ambient }),
  };
}
