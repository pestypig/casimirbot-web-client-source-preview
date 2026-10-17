/** A completed Cloud Agent DM answer for a finalized personal Live Voice turn. */
export const HELIX_MANAGED_VOICE_REPLY_COMPLETED_EVENT =
  "helix:managed-voice-reply-completed" as const;

export type HelixManagedVoiceReplyCompletedDetail = Readonly<{
  clientEventRef: string;
  turnId: string;
  text: string;
}>;
