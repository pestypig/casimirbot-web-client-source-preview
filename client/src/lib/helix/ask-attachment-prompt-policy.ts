export const HELIX_ASK_VISUAL_SURFACE_PROMPT_PATTERN =
  /\b(?:image|screenshot|screen\s*share|screen\s*sharing|screen|display|window|tab|picture|photo|attached|visual|visible|from this|from the image|hotbar|inventory|chest|container)\b/i;

export const HELIX_ASK_TEXT_ATTACHMENT_PROMPT_PATTERN =
  /\b(?:attached|pasted|uploaded|included|copied)\s+(?:text|memo|note|document)\b|\b(?:text|memo|note|document)\s+attachment\b|\bpasted\s+(?:text|memo|note|document)\s+attachment\b/i;

export const HELIX_ASK_PASTED_TEXT_RESUME_RECALL_PROMPT_PATTERN =
  /\b(?:pasted\s+(?:text|memo|note|document)|attached\s+(?:text|memo|note|document)|copied\s+(?:text|memo|note|document)|(?:text|memo|note|document)\s+attachment|previous\s+(?:paste|memo|note|document)|last\s+(?:paste|memo|note|document)|(?:paste|memo|note|document|text)\s+from\s+the\s+previous|pasted\s+(?:text|memo|note|document)\s+from\s+the\s+previous)\b/i;

export const HELIX_ASK_CONTEXT_RESUME_RECALL_OUTPUT_PATTERN =
  /\b(?:sentinel|marker|exact\s+(?:line|text|phrase|wording)|marker\s+line|top\s+line|first\s+line|appears?\s+at\s+the\s+top|answer\s+only|what|which|who|when|where|summari[sz]e|extract|list|identify|tell\s+me|answer)\b/i;

export const HELIX_ASK_AMBIGUOUS_LIVE_CONTEXT_PROMPT_PATTERN = /\blive\s+(?:source|answer)\b/i;

export const HELIX_ASK_WORKSTATION_LIVE_CONTEXT_PROMPT_PATTERN =
  /\b(?:(?:scientific\s+)?calculator|equation|prime|computation|workstation)\b[\s\S]{0,80}\blive\s+(?:source|stream|answer)\b|\blive\s+(?:source|stream|answer)\b[\s\S]{0,80}\b(?:(?:scientific\s+)?calculator|equation|prime|computation|workstation)\b/i;

export const HELIX_ASK_USE_PASTED_TEXT_ATTACHMENT_PROMPT_PATTERN =
  /^\s*(?:use|read|analy[sz]e|summari[sz]e|review|extract\s+from|answer\s+(?:from|using)|treat\s+it\s+as)\s+(?:the\s+)?(?:attached|pasted|uploaded|included|copied)\s+(?:pasted\s+)?(?:text|memo|note|document)(?:[\s\S]{0,160})?\.?\s*$/i;

export function isHelixAskVisualPrompt(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (HELIX_ASK_TEXT_ATTACHMENT_PROMPT_PATTERN.test(normalized)) return false;
  if (HELIX_ASK_VISUAL_SURFACE_PROMPT_PATTERN.test(normalized)) return true;
  if (!HELIX_ASK_AMBIGUOUS_LIVE_CONTEXT_PROMPT_PATTERN.test(normalized)) return false;
  return !HELIX_ASK_WORKSTATION_LIVE_CONTEXT_PROMPT_PATTERN.test(normalized);
}

export function isHelixAskPastedTextResumeRecallPrompt(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  return (
    HELIX_ASK_PASTED_TEXT_RESUME_RECALL_PROMPT_PATTERN.test(normalized) &&
    HELIX_ASK_CONTEXT_RESUME_RECALL_OUTPUT_PATTERN.test(normalized)
  );
}

export function isHelixAskUsePastedTextAttachmentPrompt(value: string): boolean {
  return HELIX_ASK_USE_PASTED_TEXT_ATTACHMENT_PROMPT_PATTERN.test(value.trim());
}
