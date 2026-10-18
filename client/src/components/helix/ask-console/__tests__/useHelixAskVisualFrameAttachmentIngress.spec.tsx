/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HelixAskAttachment } from "../HelixAskAttachmentCommit";
import {
  requestHelixAskVisualFrameAttachmentPromotion,
  resetHelixAskVisualFramePromotionHandlersForTests,
} from "../HelixAskVisualFramePromotion";
import { useHelixAskVisualFrameAttachmentIngress } from "../useHelixAskVisualFrameAttachmentIngress";

describe("Helix Ask selected visual-frame attachment ingress", () => {
  afterEach(() => {
    cleanup();
    resetHelixAskVisualFramePromotionHandlersForTests();
  });

  it("adds a selected frame to the existing composer attachment state without submitting it", () => {
    let attachments: HelixAskAttachment[] = [];
    const attachmentsRef = { current: attachments };
    const setError = vi.fn();
    const Harness = () => {
      useHelixAskVisualFrameAttachmentIngress({
        maxAttachments: 6,
        attachmentsRef,
        setAttachments: (next) => {
          attachments = next;
        },
        setError,
      });
      return null;
    };
    render(<Harness />);

    const outcome = requestHelixAskVisualFrameAttachmentPromotion({
      imageDataUrl: "data:image/jpeg;base64,AQID",
      fileName: "selected-frame.jpg",
      evidenceRef: "visual-evidence:1",
    });

    expect(outcome).toMatchObject({
      ok: true,
      code: "attachment_added",
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
    });
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      kind: "image",
      fileName: "selected-frame.jpg",
      evidenceRef: "visual-evidence:1",
      status: "ready",
    });
    expect(setError).toHaveBeenLastCalledWith(null);
  });

  it("fails closed when the composer has no attachment slot", () => {
    const attachments = Array.from({ length: 6 }, (_, index) => ({
      kind: "image" as const,
      id: `attachment:${index}`,
      fileName: `${index}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 3,
      imageBase64: "AQID",
      previewUrl: "data:image/jpeg;base64,AQID",
      status: "ready" as const,
    }));
    const commitAttachments = vi.fn();
    const attachmentsRef = { current: attachments };
    const Harness = () => {
      useHelixAskVisualFrameAttachmentIngress({
        maxAttachments: 6,
        attachmentsRef,
        setAttachments: commitAttachments,
        setError: vi.fn(),
      });
      return null;
    };
    render(<Harness />);

    expect(requestHelixAskVisualFrameAttachmentPromotion({
      imageDataUrl: "data:image/jpeg;base64,AQID",
    })).toMatchObject({
      ok: false,
      code: "attachment_limit_reached",
      answer_authority: false,
    });
    expect(commitAttachments).not.toHaveBeenCalled();
  });
});
