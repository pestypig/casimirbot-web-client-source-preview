export type VoiceDispatchTranscriptSource = "draft" | "assembler" | "merged" | "empty";

export function mergeVoiceTranscriptDraft(currentDraft: string, transcript: string): string {
  const normalizedSegment = transcript
    .trim()
    .replace(/^\.\.\.\s*/, "")
    .replace(/\s*\.\.\.$/, "");
  if (!normalizedSegment) return currentDraft;
  const normalizedDraft = currentDraft.trimEnd().replace(/\s*\.\.\.$/, "");
  if (!normalizedDraft) return normalizedSegment;
  const lowerDraft = normalizedDraft.toLowerCase();
  const lowerSegment = normalizedSegment.toLowerCase();
  if (lowerSegment === lowerDraft) return normalizedDraft;
  // STT can return cumulative text for later chunks; treat it as authoritative.
  if (lowerSegment.startsWith(lowerDraft)) return normalizedSegment;
  if (lowerDraft.startsWith(lowerSegment)) return normalizedDraft;
  const maxOverlap = Math.min(lowerDraft.length, lowerSegment.length);
  // Find longest exact suffix/prefix overlap to avoid duplicate seam text.
  for (let overlap = maxOverlap; overlap >= 5; overlap -= 1) {
    if (!lowerDraft.endsWith(lowerSegment.slice(0, overlap))) continue;
    const overlapText = lowerSegment.slice(0, overlap).trim();
    const overlapWordCount = overlapText ? overlapText.split(/\s+/).filter(Boolean).length : 0;
    if (overlapWordCount < 2 && overlap < 10) continue;
    const remainder = normalizedSegment.slice(overlap).trimStart();
    return remainder.length > 0 ? `${normalizedDraft} ${remainder}` : normalizedDraft;
  }
  const joiner = normalizedDraft && !/\s$/.test(normalizedDraft) ? " " : "";
  return `${normalizedDraft}${joiner}${normalizedSegment}`;
}

export function resolveVoiceDispatchTranscriptFromDraft(args: {
  draftText?: string | null;
  assemblerTranscript?: string | null;
  recordedText?: string | null;
}): {
  transcript: string;
  recordedText: string;
  source: VoiceDispatchTranscriptSource;
} {
  const draftText = (args.draftText ?? "").trim();
  const assemblerTranscript = (args.assemblerTranscript ?? "").trim();
  const recordedText = (args.recordedText ?? "").trim();
  const resolveRecordedText = (transcript: string): string => {
    if (!recordedText) return transcript;
    const normalizedRecorded = recordedText.toLowerCase();
    const normalizedTranscript = transcript.toLowerCase();
    return normalizedRecorded.includes(normalizedTranscript) ? recordedText : transcript;
  };
  if (!draftText && !assemblerTranscript) {
    return { transcript: "", recordedText: "", source: "empty" };
  }
  if (!draftText) {
    return {
      transcript: assemblerTranscript,
      recordedText: resolveRecordedText(assemblerTranscript),
      source: "assembler",
    };
  }
  if (!assemblerTranscript) {
    return {
      transcript: draftText,
      recordedText: resolveRecordedText(draftText),
      source: "draft",
    };
  }
  const normalizedDraft = draftText.toLowerCase();
  const normalizedAssembler = assemblerTranscript.toLowerCase();
  if (normalizedDraft.includes(normalizedAssembler) || normalizedDraft.startsWith(normalizedAssembler)) {
    return {
      transcript: draftText,
      recordedText: resolveRecordedText(draftText),
      source: "draft",
    };
  }
  if (normalizedAssembler.includes(normalizedDraft) || normalizedAssembler.startsWith(normalizedDraft)) {
    return {
      transcript: assemblerTranscript,
      recordedText: resolveRecordedText(assemblerTranscript),
      source: "assembler",
    };
  }
  const mergedTranscript = mergeVoiceTranscriptDraft(draftText, assemblerTranscript).trim();
  return {
    transcript: mergedTranscript,
    recordedText: resolveRecordedText(mergedTranscript),
    source: "merged",
  };
}
