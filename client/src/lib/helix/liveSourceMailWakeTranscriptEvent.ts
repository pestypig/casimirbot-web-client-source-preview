import type { StagePlayLiveSourceMailWakeResultV1 } from "@shared/contracts/stage-play-live-source-mail-wake.v1";

export const STAGE_PLAY_LIVE_SOURCE_MAIL_WAKE_TRANSCRIPT_EVENT =
  "stage-play-live-source-mail-wake-transcript";

export type StagePlayLiveSourceMailWakeTranscriptEventDetail = {
  askTurnId: string;
  wakeResult: StagePlayLiveSourceMailWakeResultV1;
  debugPayload: Record<string, unknown> | null;
  createdAt: string;
};
