export type AudioFocusStopReason = "preempted" | "interrupted";

type AudioFocusHandle = {
  id: string;
  kind?: "generic" | "helix_realtime" | "helix_terminal_voice";
  priority?: number;
  resumeWhenAvailable?: boolean;
  stop: (reason?: AudioFocusStopReason) => void;
  resume?: () => void;
};

let activeHandle: AudioFocusHandle | null = null;
let resumableHandle: AudioFocusHandle | null = null;

export const requestAudioFocus = (handle: AudioFocusHandle) => {
  if (activeHandle && activeHandle.id !== handle.id) {
    const activePriority = activeHandle.priority ?? 0;
    const requestedPriority = handle.priority ?? 0;
    if (requestedPriority < activePriority) {
      if (
        handle.resumeWhenAvailable &&
        (!resumableHandle || resumableHandle.id === handle.id)
      ) {
        resumableHandle = handle;
      }
      return false;
    }
    resumableHandle = activeHandle.resume ? activeHandle : null;
    activeHandle.stop("preempted");
  }
  activeHandle = handle;
  return true;
};

export const releaseAudioFocus = (id: string) => {
  if (resumableHandle?.id === id) resumableHandle = null;
  if (activeHandle?.id === id) {
    activeHandle = null;
    const resumable = resumableHandle;
    resumableHandle = null;
    if (resumable) {
      activeHandle = resumable;
      resumable.resume?.();
    }
  }
};

export const interruptAudioFocusByKind = (kind: NonNullable<AudioFocusHandle["kind"]>) => {
  if (!activeHandle || activeHandle.kind !== kind) return false;
  const interrupted = activeHandle;
  const resumable = resumableHandle;
  activeHandle = null;
  resumableHandle = null;
  interrupted.stop("interrupted");
  if (resumable) {
    activeHandle = resumable;
    resumable.resume?.();
  }
  return true;
};

export const getAudioFocusSnapshot = () => ({
  active_id: activeHandle?.id ?? null,
  active_kind: activeHandle?.kind ?? "generic",
  active_priority: activeHandle?.priority ?? null,
  resumable_id: resumableHandle?.id ?? null,
});

export const resetAudioFocusForTests = () => {
  activeHandle = null;
  resumableHandle = null;
};


let typingMuted = false;

export const setTypingMuted = (next: boolean) => {
  typingMuted = next;
};

export const isTypingMuted = () => typingMuted;
