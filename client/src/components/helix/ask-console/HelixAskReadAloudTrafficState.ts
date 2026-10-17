import {
  resolveReadAloudRegionTrafficState,
  type ReadAloudChunkTrafficEventLike,
  type ReadAloudPlaybackState,
  type ReadAloudRegionTrafficState,
} from "@/lib/helix/ask-read-aloud-display";
import {
  buildHelixAskReadAloudTrafficStateFromPlaybackProjection,
  type HelixAskReadAloudPlaybackProjection,
} from "./HelixAskReadAloudPlaybackProjection";

export type HelixAskReadAloudTrafficStateInput = {
  replyId?: string | null;
  readAloudState: ReadAloudPlaybackState;
  playbackProjection?: HelixAskReadAloudPlaybackProjection | null;
  events?: readonly ReadAloudChunkTrafficEventLike[] | null;
  nowMs?: number;
};

export function buildHelixAskReadAloudTrafficState(
  input: HelixAskReadAloudTrafficStateInput,
): ReadAloudRegionTrafficState | null {
  const replyId = input.replyId?.trim();
  const hasReplyScopedProjection = Boolean(replyId && input.playbackProjection?.replyId === replyId);
  const projectionState = buildHelixAskReadAloudTrafficStateFromPlaybackProjection({
    replyId,
    readAloudState: input.readAloudState,
    projection: input.playbackProjection,
  });
  if (hasReplyScopedProjection) return projectionState;
  if (projectionState) return projectionState;
  return resolveReadAloudRegionTrafficState(input);
}
