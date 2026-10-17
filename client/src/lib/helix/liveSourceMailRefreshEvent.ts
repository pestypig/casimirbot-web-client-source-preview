export const STAGE_PLAY_LIVE_SOURCE_MAIL_REFRESH_EVENT = "stage-play:live-source-mail:refresh";

export type StagePlayLiveSourceMailRefreshEventDetail = {
  threadId?: string | null;
  mailboxThreadId?: string | null;
  askTurnId?: string | null;
  reason?: string | null;
  artifactMarkers?: string[];
};

const STAGE_PLAY_LIVE_SOURCE_MAIL_REFRESH_ARTIFACT_MARKERS = [
  "stage_play_live_source_watch_job_policy",
  "stage_play_live_source_mail_decision",
  "stage_play_live_source_narrative_state",
  "stage_play_live_source_mail_wake_request",
  "stage_play_live_source_mail_wake_result",
  "stage_play_live_source_interpreter_profile",
] as const;

export function listStagePlayLiveSourceMailRefreshArtifactMarkers(value: unknown): string[] {
  const matched = new Set<string>();
  const seen = new WeakSet<object>();
  const visit = (entry: unknown, depth: number) => {
    if (matched.size === STAGE_PLAY_LIVE_SOURCE_MAIL_REFRESH_ARTIFACT_MARKERS.length) return;
    if (depth > 8 || entry == null) return;
    if (typeof entry === "string") {
      for (const marker of STAGE_PLAY_LIVE_SOURCE_MAIL_REFRESH_ARTIFACT_MARKERS) {
        if (entry.includes(marker)) matched.add(marker);
      }
      return;
    }
    if (typeof entry !== "object") return;
    if (seen.has(entry)) return;
    seen.add(entry);
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item, depth + 1);
      return;
    }
    for (const [key, item] of Object.entries(entry as Record<string, unknown>)) {
      visit(key, depth + 1);
      visit(item, depth + 1);
    }
  };
  visit(value, 0);
  return [...matched];
}
