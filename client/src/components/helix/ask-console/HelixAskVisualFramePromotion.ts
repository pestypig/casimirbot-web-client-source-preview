import type {
  HelixAskLiveRuntimeVisualFrameInput,
  HelixAskLiveRuntimeVisualFrameReceipt,
} from "./HelixAskLiveRuntimeTransportController";

export type HelixAskVisualFrameLivePromotionCode =
  | "live_runtime_unavailable"
  | "visual_input_consent_required"
  | "shared_room_visual_frame_queued"
  | HelixAskLiveRuntimeVisualFrameReceipt["code"];

export type HelixAskVisualFrameLivePromotionOutcome = {
  ok: boolean;
  code: HelixAskVisualFrameLivePromotionCode;
  receipt: HelixAskLiveRuntimeVisualFrameReceipt | null;
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
};

export type HelixAskVisualFrameAttachmentPromotionInput = {
  imageDataUrl: string;
  fileName?: string | null;
  evidenceRef?: string | null;
};

export type HelixAskVisualFrameAttachmentPromotionOutcome = {
  ok: boolean;
  code: "attachment_added" | "ask_composer_unavailable" | "attachment_limit_reached" | "attachment_invalid";
  detail: string | null;
  attachmentId: string | null;
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
};

type LivePromotionHandler = (
  input: HelixAskLiveRuntimeVisualFrameInput,
) => HelixAskVisualFrameLivePromotionOutcome;
type AttachmentPromotionHandler = (
  input: HelixAskVisualFrameAttachmentPromotionInput,
) => HelixAskVisualFrameAttachmentPromotionOutcome;

let livePromotionHandler: LivePromotionHandler | null = null;
let attachmentPromotionHandler: AttachmentPromotionHandler | null = null;

const passiveOutcome = <T extends Record<string, unknown>>(value: T): T & {
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
} => ({
  ...value,
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
});

export const registerHelixAskVisualFrameLivePromotionHandler = (
  handler: LivePromotionHandler,
): (() => void) => {
  livePromotionHandler = handler;
  return () => {
    if (livePromotionHandler === handler) livePromotionHandler = null;
  };
};

export const requestHelixAskVisualFrameLivePromotion = (
  input: HelixAskLiveRuntimeVisualFrameInput,
): HelixAskVisualFrameLivePromotionOutcome =>
  livePromotionHandler?.(input) ?? passiveOutcome({
    ok: false,
    code: "live_runtime_unavailable" as const,
    receipt: null,
  });

export const registerHelixAskVisualFrameAttachmentPromotionHandler = (
  handler: AttachmentPromotionHandler,
): (() => void) => {
  attachmentPromotionHandler = handler;
  return () => {
    if (attachmentPromotionHandler === handler) attachmentPromotionHandler = null;
  };
};

export const requestHelixAskVisualFrameAttachmentPromotion = (
  input: HelixAskVisualFrameAttachmentPromotionInput,
): HelixAskVisualFrameAttachmentPromotionOutcome =>
  attachmentPromotionHandler?.(input) ?? passiveOutcome({
    ok: false,
    code: "ask_composer_unavailable" as const,
    detail: "Open the Helix Ask composer before attaching this frame.",
    attachmentId: null,
  });

export const resetHelixAskVisualFramePromotionHandlersForTests = (): void => {
  livePromotionHandler = null;
  attachmentPromotionHandler = null;
};
