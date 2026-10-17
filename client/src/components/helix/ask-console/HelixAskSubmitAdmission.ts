export type HelixAskSubmitQueueReason = "busy" | "compaction_pause";

export type HelixAskSubmitAdmissionInput = {
  entries: readonly string[];
  askBusy: boolean;
  compactionPausePending: boolean;
  hasPastedTextResumeFrameForSubmit: boolean;
  attachmentKinds: readonly string[];
  allEntriesArePastedTextResumeRecallPrompt: boolean;
};

export type HelixAskSubmitAdmissionDecision = {
  normalizedEntries: string[];
  singleEntry: string | null;
  shouldQueueForAskHandoff: boolean;
  queueReason: HelixAskSubmitQueueReason | null;
  shouldReleaseConsumedPastedTextAttachmentForResume: boolean;
  shouldBlockQueuedAttachments: boolean;
  firstEntry: string | null;
  restEntries: string[];
};

export function buildHelixAskSubmitAdmission(
  input: HelixAskSubmitAdmissionInput,
): HelixAskSubmitAdmissionDecision {
  const normalizedEntries = input.entries.map((entry) => entry.trim()).filter(Boolean);
  const singleEntry = normalizedEntries.length === 1 ? normalizedEntries[0] : null;
  const shouldQueueForAskHandoff =
    input.askBusy || input.compactionPausePending || input.hasPastedTextResumeFrameForSubmit;
  const shouldReleaseConsumedPastedTextAttachmentForResume =
    input.compactionPausePending &&
    input.attachmentKinds.length > 0 &&
    input.attachmentKinds.every((kind) => kind === "text") &&
    input.allEntriesArePastedTextResumeRecallPrompt;
  const queueReason: HelixAskSubmitQueueReason | null = shouldQueueForAskHandoff
    ? input.compactionPausePending
      ? "compaction_pause"
      : "busy"
    : null;
  const [firstEntry = null, ...restEntries] = normalizedEntries;

  return {
    normalizedEntries,
    singleEntry,
    shouldQueueForAskHandoff,
    queueReason,
    shouldReleaseConsumedPastedTextAttachmentForResume,
    shouldBlockQueuedAttachments:
      shouldQueueForAskHandoff &&
      input.attachmentKinds.length > 0 &&
      !shouldReleaseConsumedPastedTextAttachmentForResume,
    firstEntry,
    restEntries,
  };
}
