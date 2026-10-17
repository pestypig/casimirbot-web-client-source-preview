export type HelixAskLegacyReplyFailContext = {
  failReason: string | null;
  failClass: string | null;
};

export function resolveHelixAskLegacyReplyFailContext(
  debug: Record<string, unknown> | null | undefined,
): HelixAskLegacyReplyFailContext {
  return {
    failReason:
      typeof debug?.helix_ask_fail_reason === "string"
        ? debug.helix_ask_fail_reason
        : typeof debug?.fail_reason === "string"
          ? debug.fail_reason
          : null,
    failClass:
      typeof debug?.helix_ask_fail_class === "string"
        ? debug.helix_ask_fail_class
        : typeof debug?.fail_class === "string"
          ? debug.fail_class
          : null,
  };
}
