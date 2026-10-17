import { inspectLatestReasoningBinding } from "./reasoningTaskBinding";

/** Read-only presentation refresh; never claims, dispatches, or acknowledges. */
export const observeReasoningBindingStatus = (
  onStatus: (active: boolean) => void,
): (() => void) => {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const inspect = async () => {
    try {
      const binding = await inspectLatestReasoningBinding();
      if (!stopped) onStatus(binding.status === "active");
    } catch {
      if (!stopped) onStatus(false);
    } finally {
      // Schedule after settlement: slow reads must not overlap or reorder.
      if (!stopped) timer = setTimeout(() => void inspect(), 1_000);
    }
  };
  void inspect();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
};
