import { useEffect } from "react";

import type { HelixAskAttachment } from "./HelixAskAttachmentCommit";
import { buildHelixAskImageAttachmentFromDataUrl } from "./HelixAskImageAttachment";
import { registerHelixAskVisualFrameAttachmentPromotionHandler } from "./HelixAskVisualFramePromotion";

export const useHelixAskVisualFrameAttachmentIngress = (input: {
  maxAttachments: number;
  attachmentsRef: { current: HelixAskAttachment[] };
  setAttachments: (attachments: HelixAskAttachment[]) => void;
  setError: (message: string | null) => void;
}): void => {
  useEffect(() => registerHelixAskVisualFrameAttachmentPromotionHandler((request) => {
    const current = [...input.attachmentsRef.current];
    if (current.length >= input.maxAttachments) {
      const detail = `Helix Ask supports up to ${input.maxAttachments} attachments for one turn.`;
      input.setError(detail);
      return {
        ok: false,
        code: "attachment_limit_reached",
        detail,
        attachmentId: null,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
      };
    }
    try {
      const attachment = buildHelixAskImageAttachmentFromDataUrl(request.imageDataUrl, {
        fileName: request.fileName,
        evidenceRef: request.evidenceRef,
      });
      const next = [...current, attachment];
      input.attachmentsRef.current = next;
      input.setAttachments(next);
      input.setError(null);
      return {
        ok: true,
        code: "attachment_added",
        detail: null,
        attachmentId: attachment.id,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Selected visual frame could not be attached.";
      input.setError(detail);
      return {
        ok: false,
        code: "attachment_invalid",
        detail,
        attachmentId: null,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
      };
    }
  }), [input]);
};
