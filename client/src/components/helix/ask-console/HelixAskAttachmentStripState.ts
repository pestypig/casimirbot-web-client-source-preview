import type { HelixAskConsoleSupplementSurfaceProps } from "./HelixAskConsoleSupplementSurface";

export type HelixAskAttachmentStripState = Pick<
  HelixAskConsoleSupplementSurfaceProps,
  "attachmentItems" | "onRemoveAttachment"
>;

export type HelixAskAttachmentStripStateOptions = HelixAskAttachmentStripState;

export function buildHelixAskAttachmentStripState({
  attachmentItems,
  onRemoveAttachment,
}: HelixAskAttachmentStripStateOptions): HelixAskAttachmentStripState {
  return {
    attachmentItems,
    onRemoveAttachment,
  };
}
