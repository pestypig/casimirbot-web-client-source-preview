type HelixAskTextareaComputedStyle = Pick<
  CSSStyleDeclaration,
  "lineHeight" | "paddingTop" | "paddingBottom"
>;

export type HelixAskComposerTextareaSizingController = {
  resize: (
    target: HTMLTextAreaElement | null | undefined,
    options?: { allowShrink?: boolean },
  ) => void;
  syncValue: (
    target: HTMLTextAreaElement,
    nextValue: string,
    options?: { focus?: boolean },
  ) => void;
};

export type HelixAskComposerTextareaSizingControllerOptions = {
  maxPromptLines: number;
  readComputedStyle?: (target: HTMLTextAreaElement) => HelixAskTextareaComputedStyle;
};

type HelixAskTextareaSizingMetrics = {
  maxHeight: number;
  lastValueLength: number;
};

const readBrowserComputedStyle = (
  target: HTMLTextAreaElement,
): HelixAskTextareaComputedStyle => window.getComputedStyle(target);

/**
 * Owns the recrowned composer textarea's DOM sizing policy. The legacy bridge
 * may point at this controller, but must not duplicate its layout reads/writes.
 */
export function createHelixAskComposerTextareaSizingController({
  maxPromptLines,
  readComputedStyle = readBrowserComputedStyle,
}: HelixAskComposerTextareaSizingControllerOptions): HelixAskComposerTextareaSizingController {
  const metricsByTarget = new WeakMap<HTMLTextAreaElement, HelixAskTextareaSizingMetrics>();

  const readMetrics = (target: HTMLTextAreaElement): HelixAskTextareaSizingMetrics => {
    const cached = metricsByTarget.get(target);
    if (cached) return cached;
    const styles = readComputedStyle(target);
    const lineHeight = Number.parseFloat(styles.lineHeight || "20");
    const paddingTop = Number.parseFloat(styles.paddingTop || "0");
    const paddingBottom = Number.parseFloat(styles.paddingBottom || "0");
    const metrics = {
      maxHeight: lineHeight * maxPromptLines + paddingTop + paddingBottom,
      lastValueLength: target.value.length,
    };
    metricsByTarget.set(target, metrics);
    return metrics;
  };

  const resize: HelixAskComposerTextareaSizingController["resize"] = (target, options) => {
    if (!target) return;
    const metrics = readMetrics(target);
    if (options?.allowShrink !== false) target.style.height = "auto";
    const scrollHeight = target.scrollHeight;
    target.style.height = `${Math.min(scrollHeight, metrics.maxHeight)}px`;
    target.style.overflowY = scrollHeight > metrics.maxHeight ? "auto" : "hidden";
    metrics.lastValueLength = target.value.length;
  };

  return {
    resize,
    syncValue(target, nextValue, options) {
      const metrics = readMetrics(target);
      const valueAlreadyCurrent = target.value === nextValue;
      if (!valueAlreadyCurrent) target.value = nextValue;
      if (options?.focus) {
        target.focus();
        const cursor = target.value.length;
        target.setSelectionRange(cursor, cursor);
      }
      resize(target, {
        allowShrink: !valueAlreadyCurrent || nextValue.length < metrics.lastValueLength,
      });
      if (!valueAlreadyCurrent) target.scrollTop = target.scrollHeight;
    },
  };
}
