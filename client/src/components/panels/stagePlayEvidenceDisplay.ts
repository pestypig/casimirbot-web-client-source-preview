import type { StagePlayLiveSourceMailItemV1 } from "@shared/contracts/stage-play-live-source-mail.v1";
import type { StagePlayVisualObserverProfileV1 } from "@shared/contracts/stage-play-visual-observer-profile.v1";
import type { WorkstationGoalContextUpdateV1 } from "@shared/contracts/workstation-goal-context.v1";

export function readStagePlayMailObserverProfile(
  mail: Pick<StagePlayLiveSourceMailItemV1, "evidenceRefs"> | null | undefined,
  profiles: readonly Pick<StagePlayVisualObserverProfileV1, "profileId" | "title">[],
): { observerProfileId: string | null; observerProfileTitle: string | null } {
  const stampedIds = [...new Set((mail?.evidenceRefs ?? []).filter((ref) =>
    ref.startsWith("stage_play_visual_observer_profile:"),
  ))];
  if (stampedIds.length !== 1) {
    return { observerProfileId: null, observerProfileTitle: null };
  }
  const observerProfileId = stampedIds[0];
  const profile = profiles.find((entry) => entry.profileId === observerProfileId);
  return { observerProfileId, observerProfileTitle: profile?.title ?? null };
}

export function readStagePlayPacketGoalRelevance(
  packetId: string,
  goalId: string,
  updates: readonly Pick<WorkstationGoalContextUpdateV1, "contentRef" | "createdAtMs" | "goalRelevance">[],
): WorkstationGoalContextUpdateV1["goalRelevance"] {
  const latest = updates
    .filter((update) => update.contentRef === packetId)
    .sort((left, right) => left.createdAtMs - right.createdAtMs)
    .at(-1);
  return latest?.goalRelevance?.goalId === goalId ? latest.goalRelevance : null;
}
