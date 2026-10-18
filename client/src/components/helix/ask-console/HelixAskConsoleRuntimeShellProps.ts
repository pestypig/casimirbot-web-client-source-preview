import type { HelixAskConsoleProps } from "./HelixAskConsoleState";

export const HELIX_ASK_CONSOLE_HERO_REPLY_LIST_CLASS_NAME =
  "relative z-10 mt-4 max-h-[52vh] space-y-5 overflow-y-auto pr-2";

export const HELIX_ASK_CONSOLE_DOCK_REPLY_LIST_CLASS_NAME =
  "relative z-10 mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pr-2";

export function buildHelixAskConsoleRuntimeBridgeProps(
  props: HelixAskConsoleProps,
): HelixAskConsoleProps {
  const layoutVariant = props.layoutVariant ?? "hero";
  return {
    ...props,
    layoutVariant,
    replyListClassName:
      props.replyListClassName ??
      (layoutVariant === "dock"
        ? HELIX_ASK_CONSOLE_DOCK_REPLY_LIST_CLASS_NAME
        : HELIX_ASK_CONSOLE_HERO_REPLY_LIST_CLASS_NAME),
  };
}
